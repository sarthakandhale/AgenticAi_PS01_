import test, { after, before } from "node:test";
import assert from "node:assert/strict";

process.env.COORDINATOR_API_KEY = "test-coordinator-key";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.GOOGLE_API_KEY = "";
const { app } = await import("../server.js");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("health returns service configuration only, without secret values", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.database, { configured: false });
  assert.deepEqual(body.telegram, { configured: false, polling: false });
  assert.equal(JSON.stringify(body).includes("test-coordinator-key"), false);
});

test("coordinator endpoints reject requests without a valid key", async () => {
  const response = await fetch(`${baseUrl}/api/tasks`);
  assert.equal(response.status, 401);
});

test("invalid task input receives a useful 400 response", async () => {
  const response = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Coordinator-Key": "test-coordinator-key",
    },
    body: JSON.stringify({ title: "", project_id: "" }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /too small|at least/i);
});

test("database operations report missing Supabase configuration", async () => {
  const response = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Coordinator-Key": "test-coordinator-key",
    },
    body: JSON.stringify({
      project_id: "project-1",
      title: "Write tests",
      status: "In Progress",
    }),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /SUPABASE_URL/);
});

test("notifications endpoints reject requests without coordinator key", async () => {
  const getRes = await fetch(`${baseUrl}/api/notifications`);
  assert.equal(getRes.status, 401);

  const patchRes = await fetch(`${baseUrl}/api/notifications/test-id/read`, { method: "PATCH" });
  assert.equal(patchRes.status, 401);
});

test("dependency analysis endpoints reject requests without coordinator key", async () => {
  const postAnalyze = await fetch(`${baseUrl}/api/projects/1/analyze-dependencies`, { method: "POST" });
  assert.equal(postAnalyze.status, 401);

  const getDeps = await fetch(`${baseUrl}/api/projects/1/dependencies`);
  assert.equal(getDeps.status, 401);

  const postConfirm = await fetch(`${baseUrl}/api/projects/1/dependencies/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prerequisiteTaskId: "1", dependentTaskId: "2" }),
  });
  assert.equal(postConfirm.status, 401);

  const postReject = await fetch(`${baseUrl}/api/projects/1/dependencies/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prerequisiteTaskId: "1", dependentTaskId: "2" }),
  });
  assert.equal(postReject.status, 401);
});

