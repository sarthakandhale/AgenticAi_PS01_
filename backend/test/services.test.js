import test from "node:test";
import assert from "node:assert/strict";

const {
  getParticipantByTelegramId,
  fromDbStatus,
  recordReplyDecision,
  recordTelegramMessage,
  toApiStatus,
  toDbStatus,
  syncProjectMembers,
  listNotifications,
  markNotificationRead,
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

test("syncProjectMembers creates notification when a member is newly assigned", async () => {
  const insertedMembers = [];
  const insertedNotifs = [];
  const insertedEvents = [];
  let telegramSent = false;

  const mockDb = {
    from(table) {
      if (table === "participants") {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() {
            return { data: { id: 101, display_name: "Marcus Chen", telegram_chat_id: "998877" }, error: null };
          },
        };
      }
      if (table === "projects") {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() {
            return { data: { name: "Client Modernization" }, error: null };
          },
        };
      }
      if (table === "project_members") {
        return {
          select() { return this; },
          eq() { return this; },
          async then(resolve) { resolve({ data: [], error: null }); },
          async insert(payload) {
            insertedMembers.push(payload);
            return { error: null };
          },
        };
      }
      if (table === "notifications") {
        return {
          async insert(payload) {
            insertedNotifs.push(payload);
            return { error: null };
          },
        };
      }
      if (table === "task_events") {
        return {
          async insert(payload) {
            insertedEvents.push(payload);
            return { error: null };
          },
        };
      }
      if (table === "telegram_messages") {
        return {
          async insert() { return { error: null }; },
        };
      }
      return { select() { return this; }, eq() { return this; } };
    },
  };

  const mockSendTelegram = async (chatId, text) => {
    assert.equal(chatId, "998877");
    assert.match(text, /Client Modernization/);
    telegramSent = true;
    return { message_id: 5544 };
  };

  await syncProjectMembers(1, ["101"], mockDb, mockSendTelegram);

  assert.equal(insertedMembers.length, 1);
  assert.equal(insertedMembers[0].participant_id, 101);
  assert.equal(insertedNotifs.length, 1);
  assert.equal(insertedNotifs[0].recipient_id, 101);
  assert.match(insertedNotifs[0].message, /Client Modernization/);
  assert.equal(insertedEvents.length, 1);
  assert.equal(telegramSent, true);
});

test("syncProjectMembers does not duplicate notifications on re-edit when members are unchanged", async () => {
  const insertedNotifs = [];
  const mockDb = {
    from(table) {
      if (table === "participants") {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: { id: 101 }, error: null }; },
        };
      }
      if (table === "project_members") {
        return {
          select() { return this; },
          eq() { return this; },
          // Already contains member 101!
          async then(resolve) { resolve({ data: [{ participant_id: 101 }], error: null }); },
          async insert() { throw new Error("Should not insert"); },
        };
      }
      if (table === "notifications") {
        return {
          async insert(payload) { insertedNotifs.push(payload); return { error: null }; },
        };
      }
      return { select() { return this; }, eq() { return this; } };
    },
  };

  await syncProjectMembers(1, ["101"], mockDb);
  assert.equal(insertedNotifs.length, 0, "No duplicate notifications should be created for existing member");
});

test("syncProjectMembers isolates Telegram failures so project assignment succeeds", async () => {
  const insertedMembers = [];
  const mockDb = {
    from(table) {
      if (table === "participants") {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: { id: 102, display_name: "Alice", telegram_chat_id: "123" }, error: null }; },
        };
      }
      if (table === "projects") {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: { name: "Project Alpha" }, error: null }; },
        };
      }
      if (table === "project_members") {
        return {
          select() { return this; },
          eq() { return this; },
          async then(resolve) { resolve({ data: [], error: null }); },
          async insert(payload) { insertedMembers.push(payload); return { error: null }; },
        };
      }
      if (table === "notifications" || table === "task_events") {
        return { async insert() { return { error: null }; } };
      }
      return { select() { return this; }, eq() { return this; } };
    },
  };

  // Telegram sender throws network error
  const failingSender = async () => {
    throw new Error("Telegram network timeout");
  };

  await syncProjectMembers(1, ["102"], mockDb, failingSender);
  assert.equal(insertedMembers.length, 1, "Member must still be added even if Telegram fails");
});

test("recordReplyDecision rejects unauthorized task update if task belongs to a different owner", async () => {
  const mockDb = {
    from(table) {
      if (table === "tasks") {
        return {
          select() { return this; },
          eq(col, val) {
            this._lastVal = val;
            return this;
          },
          async maybeSingle() {
            // Task owner is participant 99, but updater is participant 12!
            return { data: { id: 1, project_id: 1, status: "in_progress", owner_id: 99 }, error: null };
          },
          update() { return this; },
        };
      }
      return { select() { return this; }, eq() { return this; } };
    },
  };

  await assert.rejects(
    recordReplyDecision({
      followup: null,
      messageId: "msg-1",
      reply: "Finished login API",
      analysis: { classification: "COMPLETE", taskId: "1" },
      participantId: 12,
    }, mockDb),
    /Unauthorized: Task is not assigned to the participant/,
  );
});

test("listNotifications and markNotificationRead support recipient filtering and read tracking", async () => {
  const mockNotifications = [
    { id: "n1", recipient_id: 101, project_id: 1, title: "Assignment", message: "Assigned", read: false, created_at: new Date().toISOString() },
    { id: "n2", recipient_id: 102, project_id: 1, title: "Assignment", message: "Assigned", read: false, created_at: new Date().toISOString() },
  ];

  const mockDb = {
    from(table) {
      if (table === "participants") {
        return {
          select() { return this; },
          eq(col, val) { this.val = val; return this; },
          async maybeSingle() { return { data: { id: Number(this.val) }, error: null }; },
        };
      }
      if (table === "notifications") {
        const queryObj = {
          _filter: null,
          _updates: null,
          select() { return this; },
          eq(col, val) {
            if (col === "recipient_id") this._filter = val;
            return this;
          },
          order() {
            return this;
          },
          then(resolve) {
            const filtered = this._filter != null
              ? mockNotifications.filter((n) => String(n.recipient_id) === String(this._filter))
              : mockNotifications;
            resolve({ data: filtered, error: null });
          },
          update(updates) {
            this._updates = updates;
            return this;
          },
        };
        // select on update chain returns updated item
        return {
          ...queryObj,
          update(updates) {
            return {
              eq() { return this; },
              select() {
                const item = mockNotifications.find((n) => n.id === "n1");
                if (item) Object.assign(item, updates);
                return Promise.resolve({ data: [item], error: null });
              },
            };
          },
        };
      }
    },
  };

  const p101Notifs = await listNotifications("101", {}, mockDb);
  assert.equal(p101Notifs.length, 1);
  assert.equal(p101Notifs[0].recipient_id, "101");

  const readResult = await markNotificationRead("n1", "101", mockDb);
  assert.equal(readResult.read, true);
});
