import { Bot } from "grammy";
import { config } from "../config.js";
import { analyseReply } from "../agent.js";
import {
  findFollowupForReply,
  getParticipantByTelegramId,
  getParticipantContext,
  getParticipantReport,
  getParticipantTasks,
  linkTelegramAccount,
  markTelegramMessageFailed,
  recordReplyDecision,
  recordTelegramMessage,
  resolveTaskDbId,
  checkAndTriggerDependencyHandoffs,
} from "./taskService.js";

let bot;
let botUsername;
let polling = false;
let webhookActive = false;
let pollingError;
let pollingRetrying = false;
let pollingRetryTimer;
const pollingRetryDelayMs = 10_000;

function pollingFailure(error) {
  return error?.error_code === 409 || /\b409\b|conflict/i.test(error?.message ?? "")
    ? "CONFLICT"
    : "FAILED";
}

function formatTaskList(tasks) {
  if (!tasks.length) return "You have no open assigned tasks.";
  return tasks
    .slice(0, 15)
    .map((task) => `• ${task.title} — ${task.status.replaceAll("_", " ")}`)
    .join("\n");
}

async function handleText(ctx) {
  const telegramMessage = ctx.message;
  if (ctx.chat.type !== "private") {
    await ctx.reply("Please send task updates to me in a private chat.");
    return;
  }
  const telegramUserId = ctx.from.id;
  const participant = await getParticipantByTelegramId(telegramUserId);

  if (!participant) {
    await ctx.reply("Your Telegram account is not linked. Ask your project coordinator for a one-time registration link.");
    return;
  }

  const inserted = await recordTelegramMessage({
    update_id: ctx.update.update_id,
    telegram_message_id: telegramMessage.message_id,
    participant_id: participant.id,
    chat_id: String(telegramMessage.chat.id),
    direction: "INBOUND",
    message_text: telegramMessage.text,
    processing_status: "RECEIVED",
  });
  if (!inserted) return;
  const messageId = inserted.id;

  const replyToMessageId = telegramMessage.reply_to_message?.message_id;
  const pendingFollowups = await findFollowupForReply({
    participantId: participant.id,
    replyToMessageId,
  });
  if (replyToMessageId && pendingFollowups.length === 0) {
    await markTelegramMessageFailed(messageId, "No active follow-up matched this Telegram reply.");
    await ctx.reply("I couldn't match that reply to an active update request. Please ask your coordinator to send a new request.");
    return;
  }
  const followup = pendingFollowups.length === 1 ? pendingFollowups[0] : null;
  const tasks = pendingFollowups.length
    ? pendingFollowups.map((entry) => entry.tasks).filter(Boolean).map((task) => ({
        ...task,
        project_name: task.projects?.name ?? "",
        project_description: task.projects?.description ?? "",
      }))
    : await getParticipantTasks(participant.id);
  const participantContext = await getParticipantContext(participant.id);
  let analysis;
  try {
    analysis = await analyseReply(telegramMessage.text, tasks, participantContext);
  } catch (error) {
    console.error("Telegram reply analysis failed:", error.message);
    await markTelegramMessageFailed(messageId, error.message, followup?.task_id);
    await ctx.reply("I received your update but could not analyze it right now. Please try again later or contact your coordinator.");
    return;
  }

  if (analysis.classification !== "UNCLEAR" && !analysis.taskId && tasks.length === 1) {
    analysis.taskId = tasks[0].id;
  }
  const selectedFollowup =
    followup ??
    pendingFollowups.find((entry) => entry.task_id === analysis.taskId) ??
    null;
  try {
    await recordReplyDecision({
      followup: selectedFollowup,
      messageId,
      reply: telegramMessage.text,
      analysis,
      participantId: participant.id,
    });
  } catch (error) {
    console.error("Telegram reply could not be persisted:", error.message);
    await markTelegramMessageFailed(messageId, error.message, selectedFollowup?.task_id);
    await ctx.reply("I received your update but could not save the decision. No task status was reported as changed. Please contact your coordinator.");
    return;
  }

  // Trigger dependency-aware task handoffs if task was completed
  if (analysis.classification === "COMPLETE" && analysis.taskId) {
    try {
      const taskDbId = await resolveTaskDbId(analysis.taskId);
      if (taskDbId) {
        await checkAndTriggerDependencyHandoffs({
          completedTaskDbId: taskDbId,
          completerParticipantId: participant.id,
        });
      }
    } catch (handoffErr) {
      console.error("Dependency handoff trigger failed:", handoffErr.message);
    }
  }

  if (analysis.classification === "UNCLEAR") {
    await ctx.reply(
      analysis.clarificationQuestion ||
      (pendingFollowups.length > 1
        ? `I couldn't tell which task you mean. Please reply directly to the task update message, or name the task.`
        : "I couldn't confidently match that update to one task. Please mention the task title or ask your coordinator for help."),
    );
    return;
  }
  const messages = {
    IN_PROGRESS: "Thanks — your progress update has been recorded.",
    BLOCKED: `Thanks — I recorded the blocker: ${analysis.blocker}`,
    COMPLETE: "Thanks — the task has been marked complete.",
  };
  await ctx.reply(messages[analysis.classification]);
}

export async function startTelegramBot() {
  if (!config.telegramToken) return null;
  pollingError = undefined;
  const botInstance = new Bot(config.telegramToken);
  bot = botInstance;
  const botInfo = await botInstance.api.getMe();
  botUsername = botInfo.username;

  botInstance.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") {
      await ctx.reply("Please connect your account in a private chat with this bot.");
      return;
    }
    const code = String(ctx.match || "").trim();
    if (!code) {
      await ctx.reply("Welcome. To connect your account, ask your coordinator for a one-time registration code and send /start <code>.");
      return;
    }
    const linked = await linkTelegramAccount({
      code,
      telegramUserId: ctx.from.id,
      chatId: ctx.chat.id,
      username: ctx.from.username,
    });
    await ctx.reply(
      linked
        ? `Your Telegram account is linked to ${linked.display_name}. Use /tasks to view your assigned tasks.`
        : "That registration code is invalid, expired, or already used. Ask your coordinator for a new code.",
    );
  });

  botInstance.command("tasks", async (ctx) => {
    if (ctx.chat.type !== "private") {
      await ctx.reply("Please use /tasks in a private chat with this bot.");
      return;
    }
    const participant = await getParticipantByTelegramId(ctx.from.id);
    if (!participant) {
      await ctx.reply("Your Telegram account is not linked. Use /start <code> with a coordinator-provided code.");
      return;
    }
    await ctx.reply(formatTaskList(await getParticipantTasks(participant.id)));
  });

  botInstance.command("report", async (ctx) => {
    if (ctx.chat.type !== "private") {
      await ctx.reply("Please use /report in a private chat with this bot.");
      return;
    }
    const participant = await getParticipantByTelegramId(ctx.from.id);
    if (!participant) {
      await ctx.reply("Your Telegram account is not linked. Use /start <code> with a coordinator-provided code.");
      return;
    }
    const report = await getParticipantReport(participant.id);
    await ctx.reply(
      `Your report: ${report.assigned} assigned, ${report.open} open, ${report.blocked} blocked, ${report.complete} complete.\n${formatTaskList(report.tasks)}`,
    );
  });

  botInstance.on("message:text", handleText);
  botInstance.catch((error) => {
    console.error("Telegram update failed:", error.message);
  });
  if (config.telegramMode === "webhook") {
    if (!config.telegramWebhookUrl || !config.telegramWebhookSecret) {
      throw new Error("TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET are required in webhook mode.");
    }
    await botInstance.api.setWebhook(config.telegramWebhookUrl, {
      secret_token: config.telegramWebhookSecret,
      allowed_updates: ["message"],
    });
    webhookActive = true;
    console.info(`Telegram webhook configured for @${botUsername}.`);
    return botInstance;
  }
  const startPolling = () => {
    if (bot !== botInstance) return;
    pollingRetrying = false;
    botInstance.start({
      onStart: (info) => {
        botUsername = info.username;
        polling = true;
        pollingError = undefined;
        pollingRetrying = false;
        console.info(`Telegram polling started for @${info.username}.`);
      },
    }).catch((error) => {
      if (bot !== botInstance) return;
      polling = false;
      pollingError = pollingFailure(error);
      pollingRetrying = true;
      console.error("Telegram polling stopped unexpectedly:", error.message);
      pollingRetryTimer = setTimeout(startPolling, pollingRetryDelayMs);
    });
  };
  startPolling();
  return botInstance;
}

export async function handleTelegramUpdate(update) {
  if (!bot || !webhookActive) {
    throw new Error("Telegram webhook is not ready.");
  }
  await bot.handleUpdate(update);
}

export function isTelegramWebhookActive() {
  return webhookActive;
}

export function getTelegramBotUsername() {
  return botUsername;
}

export function isTelegramPolling() {
  return polling;
}

export function getTelegramPollingError() {
  return pollingError;
}

export function isTelegramPollingRetrying() {
  return pollingRetrying;
}

export async function stopTelegramBot() {
  clearTimeout(pollingRetryTimer);
  pollingRetryTimer = undefined;
  pollingRetrying = false;
  const botToStop = bot;
  bot = undefined;
  const shouldStopPolling = polling;
  polling = false;
  webhookActive = false;
  pollingError = undefined;
  botUsername = undefined;
  if (!botToStop || !shouldStopPolling) return;
  await botToStop.stop();
}

export async function sendTelegramMessage(chatId, text) {
  if (!bot) {
    throw new Error("Telegram bot is not running. Configure TELEGRAM_BOT_TOKEN and database access.");
  }
  return bot.api.sendMessage(chatId, text);
}
