import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __serverDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__serverDir, ".env") });
dotenv.config();
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { timingSafeEqual } from "node:crypto";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { analyseReply } from "./agent.js";
import { config } from "./config.js";
import { supabase } from "./db/supabase.js";
import {
  createFollowup,
  createProject,
  createTask,
  deleteTask,
  getTask,
  listProjects,
  listTaskEvents,
  listTaskMessages,
  listTasks,
  listAllEvents,
  listParticipants,
  getProjectReport,
  recordOutboundMessage,
  registerParticipant,
  setFollowupDelivery,
  updateProject,
  updateTask,
} from "./services/taskService.js";
import {
  getTelegramBotUsername,
  getTelegramPollingError,
  handleTelegramUpdate,
  isTelegramWebhookActive,
  isTelegramPolling,
  isTelegramPollingRetrying,
  sendTelegramMessage,
  startTelegramBot,
  stopTelegramBot,
} from "./services/telegram.js";

const app = express();
const STATUS = ["Pending", "In Progress", "Blocked", "Complete"];
const PRIORITY = ["Low", "Medium", "High", "Critical"];
const projectInput = z.object({
  id: z.string().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(4000).optional(),
  manager_id: z.string().max(100).nullable().optional(),
  start_date: z.string().date().nullable().optional(),
  target_date: z.string().date().nullable().optional(),
  milestones: z.array(z.object({
    id: z.string().max(80),
    name: z.string().trim().min(1).max(160),
    date: z.string().date(),
    done: z.boolean(),
  }).strict()).max(50).optional(),
});
const taskFields = z.object({
  id: z.string().min(1).max(80).optional(),
  project_id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(),
  assignee_id: z.string().max(100).nullable().optional(),
  status: z.enum(STATUS).optional(),
  acceptance_criteria: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  priority: z.enum(PRIORITY).optional(),
  due_date: z.string().date().nullable().optional(),
  dependencies: z.array(z.string().max(80)).max(100).optional(),
  blocker: z.string().max(500).nullable().optional(),
  next_action: z.string().max(300).optional(),
});
const taskInput = taskFields.superRefine((task, context) => {
  if (task.status === "Blocked" && !task.blocker?.trim()) {
    context.addIssue({ code: "custom", path: ["blocker"], message: "A blocker description is required." });
  }
});
const taskUpdateInput = taskFields
  .omit({ project_id: true, id: true })
  .partial()
  .strict()
  .superRefine((task, context) => {
    if (task.status === "Blocked" && !task.blocker?.trim()) {
      context.addIssue({ code: "custom", path: ["blocker"], message: "A blocker description is required." });
    }
  });
const participantInput = z.object({
  project_id: z.string().min(1).max(80),
  display_name: z.string().trim().min(1).max(120),
  role: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
});
const requestInput = z.object({
  member_id: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(1000),
});

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin)) return callback(null, true);
      return callback(Object.assign(new Error("Origin is not allowed by CORS."), { status: 403 }));
    },
  }),
);
app.use(express.json({ limit: "32kb" }));

function authorized(req) {
  const supplied = req.get("x-coordinator-key") || "";
  if (!config.coordinatorApiKey || !supplied) return false;
  const expectedBuffer = Buffer.from(config.coordinatorApiKey);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

function requireCoordinator(req, res, next) {
  if (!config.coordinatorApiKey) {
    return res.status(503).json({
      error: "Coordinator API is not configured. Set COORDINATOR_API_KEY on the backend.",
    });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: "A valid coordinator API key is required." });
  }
  next();
}

function validate(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error(result.error.issues.map((issue) => issue.message).join("; "));
    error.status = 400;
    throw error;
  }
  return result.data;
}

function publicError(error) {
  if (error.status) return { status: error.status, message: error.message };
  if (/not configured/i.test(error.message)) {
    return { status: 503, message: error.message };
  }
  console.error("Backend request failed:", error.message);
  return { status: 500, message: "The backend could not complete this request." };
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    telegram: {
      configured: Boolean(config.telegramToken && supabase),
      polling: isTelegramPolling(),
      ...(config.telegramMode === "webhook"
        ? { mode: "webhook", webhook: isTelegramWebhookActive() }
        : {}),
      ...(isTelegramPollingRetrying() ? { polling_retrying: true } : {}),
      ...(getTelegramPollingError() ? { polling_error: getTelegramPollingError() } : {}),
      ...(getTelegramBotUsername() ? { bot_username: getTelegramBotUsername() } : {}),
    },
    llm: { configured: Boolean(config.googleApiKey) },
    database: { configured: Boolean(supabase) },
    coordinatorAuth: { configured: Boolean(config.coordinatorApiKey) },
  });
});

app.post("/api/telegram/webhook", async (req, res) => {
  const suppliedSecret = req.get("x-telegram-bot-api-secret-token") || "";
  const expectedSecret = config.telegramWebhookSecret;
  if (!expectedSecret) {
    return res.status(503).json({ error: "Telegram webhook secret is not configured." });
  }
  const suppliedBuffer = Buffer.from(suppliedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return res.status(401).json({ error: "Invalid Telegram webhook secret." });
  }
  if (!isTelegramWebhookActive()) {
    return res.status(503).json({ error: "Telegram webhook is not ready." });
  }
  await handleTelegramUpdate(req.body);
  res.sendStatus(200);
});

app.use("/api", (req, res, next) => {
  if (req.path === "/health") return next();
  return requireCoordinator(req, res, next);
});

app.get("/api/projects", async (_req, res) => {
  res.json({ projects: await listProjects() });
});

app.post("/api/projects", async (req, res) => {
  const project = await createProject(validate(projectInput, req.body));
  res.status(201).json({ project });
});

app.patch("/api/projects/:id", async (req, res) => {
  const id = validate(z.string().min(1).max(80), req.params.id);
  const input = validate(projectInput.omit({ id }).partial().strict(), req.body);
  const project = await updateProject(id, input);
  if (!project) return res.status(404).json({ error: "Project not found." });
  res.json({ project });
});

app.get("/api/tasks", async (req, res) => {
  const projectId = req.query.project_id
    ? validate(z.string().min(1).max(80), req.query.project_id)
    : undefined;
  res.json({ tasks: await listTasks(projectId) });
});

app.get("/api/tasks/:id", async (req, res) => {
  const id = validate(z.string().min(1).max(80), req.params.id);
  const task = await getTask(id);
  if (!task) return res.status(404).json({ error: "Task not found." });
  const { _dbId, _dbProjectId, ...publicTask } = task;
  res.json({ task: publicTask });
});

app.post("/api/tasks", async (req, res) => {
  res.status(201).json({ task: await createTask(validate(taskInput, req.body)) });
});

app.patch("/api/tasks/:id", async (req, res) => {
  const id = validate(z.string().min(1).max(80), req.params.id);
  const update = validate(taskUpdateInput, req.body);
  if (update.status && update.status !== "BLOCKED" && !("blocker" in update)) {
    update.blocker = null;
  }
  const task = await updateTask(id, update);
  if (!task) return res.status(404).json({ error: "Task not found." });
  res.json({ task });
});

app.delete("/api/tasks/:id", async (req, res) => {
  const id = validate(z.string().min(1).max(80), req.params.id);
  await deleteTask(id);
  res.status(204).end();
});

app.get("/api/tasks/:id/events", async (req, res) => {
  const id = validate(z.string().min(1).max(80), req.params.id);
  res.json({ events: await listTaskEvents(id) });
});

app.get("/api/tasks/:id/messages", async (req, res) => {
  const id = validate(z.string().min(1).max(80), req.params.id);
  res.json({ messages: await listTaskMessages(id) });
});

app.get("/api/events", async (req, res) => {
  const projectId = req.query.project_id
    ? validate(z.string().min(1).max(80), req.query.project_id)
    : undefined;
  res.json({ events: await listAllEvents(projectId) });
});

app.post("/api/participants", async (req, res) => {
  const input = validate(participantInput, req.body);
  res.status(201).json({ participant: await registerParticipant(input) });
});

app.get("/api/participants", async (_req, res) => {
  res.json({ participants: await listParticipants() });
});

app.post("/api/tasks/:id/request-update", async (req, res) => {
  const taskId = validate(z.string().min(1).max(80), req.params.id);
  const { member_id: memberId, text } = validate(requestInput, req.body);
  const task = await getTask(taskId);
  if (!task) return res.status(404).json({ error: "Task not found." });
  if (task.status === "COMPLETE") {
    return res.status(409).json({ error: "Completed tasks do not need an update request." });
  }
  if (!task.assignee_id || task.assignee_id !== memberId) {
    return res.status(403).json({ error: "The selected participant is not assigned to this task." });
  }
  const participant = task.participants;
  if (!participant?.telegram_chat_id) {
    return res.status(409).json({ error: "This participant has not linked a Telegram account." });
  }

  const followup = await createFollowup({ task, participant, text });
  let sent;
  try {
    sent = await sendTelegramMessage(participant.telegram_chat_id, text);
  } catch (error) {
    await setFollowupDelivery(followup.id, "FAILED", null, error.message);
    console.error("Telegram follow-up delivery failed:", error.message);
    return res.status(502).json({ error: "Telegram could not deliver the follow-up. Check the bot and participant chat." });
  }
  await setFollowupDelivery(followup.id, "AWAITING_REPLY", sent.message_id, null);
  await recordOutboundMessage({
    participantId: participant.id,
    task,
    followupId: followup.id,
    text,
    telegramMessageId: sent.message_id,
  });
  res.status(202).json({
    message_id: String(sent.message_id),
    followup_id: followup.id,
    delivery: "sent",
  });
});

app.get("/api/projects/:id/report", async (req, res) => {
  const projectId = validate(z.string().min(1).max(80), req.params.id);
  const report = await getProjectReport(projectId);
  if (!report) return res.status(404).json({ error: "Project not found." });
  res.json({ report });
});

app.use((error, _req, res, _next) => {
  const result = publicError(error);
  res.status(result.status).json({ error: result.message });
});

export { app };

export async function startServer() {
  if (supabase && config.telegramToken) {
    await startTelegramBot();
  } else if (config.telegramToken) {
    console.warn("Telegram bot not started: configure Supabase first.");
  }

  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const shutdown = async () => {
    await stopTelegramBot();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  console.info(`ProjectPilot API listening on port ${config.port}.`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error("Backend startup failed:", error.message);
    process.exitCode = 1;
  });
}
