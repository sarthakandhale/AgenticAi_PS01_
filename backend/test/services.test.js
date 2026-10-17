import test from "node:test";
import assert from "node:assert/strict";

const {
  getParticipantByTelegramId,
  fromDbStatus,
  recordReplyDecision,
  recordTelegramMessage,
  toApiStatus,
  toDbStatus,
} = await import("../services/taskService.js");
const { sendTelegramMessage } = await import("../services/telegram.js");

test("legacy lowercase task statuses map to the coordinator API contract", () => {
  assert.equal(toApiStatus("pending"), "TODO");
  assert.equal(toApiStatus("in_progress"), "IN_PROGRESS");
  assert.equal(toApiStatus("completed"), "COMPLETE");
  assert.equal(fromDbStatus("in_progress"), "In Progress");
  assert.equal(toDbStatus("Complete"), "completed");
  assert.throws(() => toApiStatus("waiting"), /Unsupported task status/);
});

test("an unknown Telegram ID has no participant record", async () => {
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: null, error: null }; },
  };
  const db = { from: () => query };
  assert.equal(await getParticipantByTelegramId(8675309, db), null);
});

test("duplicate Telegram updates are identified and not reprocessed", async () => {
  const query = {
    insert() { return this; },
    select() { return this; },
    async single() { return { data: null, error: { code: "23505" } }; },
  };
  const db = { from: () => query };
  assert.equal(await recordTelegramMessage({ update_id: 77 }, db), null);
});

test("database write errors are propagated", async () => {
  const db = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: null, error: null }; },
      };
    },
    async rpc() {
      return { error: new Error("database unavailable") };
    },
  };
  await assert.rejects(
    recordReplyDecision({
      followup: null,
      messageId: "message-id",
      reply: "Done.",
      analysis: { classification: "COMPLETE", taskId: "task-1" },
      participantId: "participant-1",
    }, db),
    /database unavailable/,
  );
});

test("Telegram delivery fails explicitly when the bot is not running", async () => {
  await assert.rejects(
    sendTelegramMessage("chat-1", "Please share an update."),
    /Telegram bot is not running/,
  );
});
