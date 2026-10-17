import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, normalizeAnalysis } from "../agent.js";

const task = {
  id: "task-1",
  title: "Develop login API",
  status: "IN_PROGRESS",
  acceptance_criteria: ["Login endpoint returns a valid token"],
};

function result(overrides = {}) {
  return {
    classification: "IN_PROGRESS",
    explanation: "Implementation is underway.",
    blocker: null,
    progress: "The handler is implemented.",
    confidence: 0.9,
    taskId: task.id,
    clarificationRequired: false,
    acceptanceCriteriaMet: false,
    acceptanceCriteriaEvidence: [],
    ...overrides,
  };
}

test("accepts a straightforward progress update", () => {
  const normalized = normalizeAnalysis(result(), [task], "The handler is implemented.");
  assert.equal(normalized.classification, "IN_PROGRESS");
  assert.equal(normalized.taskId, task.id);
});

test("accepts a clear completion report when no criteria remain", () => {
  const noCriteria = { ...task, acceptance_criteria: [] };
  const normalized = normalizeAnalysis(
    result({ classification: "COMPLETE", acceptanceCriteriaMet: true }),
    [noCriteria],
    "The login API is complete and deployed.",
  );
  assert.equal(normalized.classification, "COMPLETE");
});

test("preserves a blocker instead of marking the task complete", () => {
  const normalized = normalizeAnalysis(
    result({
      classification: "BLOCKED",
      blocker: "Database credentials are missing.",
      progress: "API client is ready.",
    }),
    [task],
    "The API is ready, but database credentials are missing.",
  );
  assert.equal(normalized.classification, "BLOCKED");
  assert.match(normalized.blocker, /credentials/);
});

test("asks for clarification when multiple tasks could match", () => {
  const secondTask = { ...task, id: "task-2", title: "Build login page" };
  const normalized = normalizeAnalysis(
    result({ taskId: task.id }),
    [task, secondTask],
    "It's coming along well.",
  );
  assert.equal(normalized.classification, "UNCLEAR");
  assert.equal(normalized.taskId, null);
  assert.equal(normalized.clarificationRequired, true);
});

test("does not mark completion when acceptance criteria are unmet", () => {
  const normalized = normalizeAnalysis(
    result({ classification: "COMPLETE", acceptanceCriteriaMet: false }),
    [task],
    "The API code is done, but token validation still needs work.",
  );
  assert.equal(normalized.classification, "IN_PROGRESS");
});

test("acceptance criteria require evidence quoted from the participant reply", () => {
  const normalized = normalizeAnalysis(
    result({
      classification: "COMPLETE",
      acceptanceCriteriaMet: true,
      acceptanceCriteriaEvidence: [
        { criterion: task.acceptance_criteria[0], evidence: "valid token" },
      ],
    }),
    [task],
    "The login API is complete; the endpoint returns a valid token.",
  );
  assert.equal(normalized.classification, "COMPLETE");
});

test("a promise to finish soon cannot be classified as complete", () => {
  const normalized = normalizeAnalysis(
    result({ classification: "COMPLETE" }),
    [{ ...task, acceptance_criteria: [] }],
    "I will finish soon.",
  );
  assert.equal(normalized.classification, "IN_PROGRESS");
});

test("a unique explicit task title resolves a multi-task reply", () => {
  const secondTask = { ...task, id: "task-2", title: "Build login page" };
  const normalized = normalizeAnalysis(
    result(),
    [task, secondTask],
    "Develop login API is now implemented.",
  );
  assert.equal(normalized.classification, "IN_PROGRESS");
  assert.equal(normalized.taskId, task.id);
});

test("a reported blocker always wins over a completion claim", () => {
  const normalized = normalizeAnalysis(
    result({
      classification: "COMPLETE",
      blocker: "Production credentials are missing.",
      acceptanceCriteriaMet: true,
    }),
    [{ ...task, acceptance_criteria: [] }],
    "The API is complete, but production credentials are missing.",
  );
  assert.equal(normalized.classification, "BLOCKED");
});

test("a reply cannot change a task when there are no assigned task candidates", () => {
  const normalized = normalizeAnalysis(
    result({ classification: "COMPLETE" }),
    [],
    "The task is complete.",
  );
  assert.equal(normalized.classification, "UNCLEAR");
  assert.equal(normalized.taskId, null);
});

test("a unique title cannot authorize an analysis for a different task", () => {
  const secondTask = { ...task, id: "task-2", title: "Build login page" };
  const normalized = normalizeAnalysis(
    result({ taskId: secondTask.id }),
    [task, secondTask],
    "Develop login API is now implemented.",
  );
  assert.equal(normalized.classification, "UNCLEAR");
});

test("a participant reply cannot reopen an already completed task", () => {
  const normalized = normalizeAnalysis(
    result({ classification: "IN_PROGRESS" }),
    [{ ...task, status: "COMPLETE" }],
    "I still have some work to do.",
  );
  assert.equal(normalized.classification, "UNCLEAR");
  assert.equal(normalized.taskId, null);
});

test("model errors are propagated instead of returning a success-shaped result", async () => {
  const graph = buildGraph({
    model: {
      invoke: async () => {
        throw new Error("Gemini unavailable");
      },
    },
  });
  await assert.rejects(
    graph.invoke({ reply: "Working on it.", tasks: [task] }),
    /Gemini unavailable/,
  );
});

test("matches 'frontend is completed' to assigned frontend task and marks it complete", () => {
  const frontendTask = {
    id: "task-fe",
    title: "Frontend development",
    status: "IN_PROGRESS",
    acceptance_criteria: [],
  };
  const normalized = normalizeAnalysis(
    result({
      classification: "COMPLETE",
      taskId: frontendTask.id,
      acceptanceCriteriaMet: true,
      confidence: 0.95,
    }),
    [frontendTask],
    "frontend is completed",
    { name: "Sarthak", role: "Frontend Developer" },
  );
  assert.equal(normalized.classification, "COMPLETE");
  assert.equal(normalized.taskId, frontendTask.id);
});

test("matches 'I have completed frontend development' for member ABC with Frontend Developer role", () => {
  const uiTask = {
    id: "task-ui",
    title: "Develop user interface",
    description: "Build client portal frontend components",
    status: "IN_PROGRESS",
    acceptance_criteria: [],
  };
  const normalized = normalizeAnalysis(
    result({
      classification: "COMPLETE",
      taskId: uiTask.id,
      acceptanceCriteriaMet: true,
      confidence: 0.92,
    }),
    [uiTask],
    "I have completed frontend development",
    { name: "ABC", role: "Frontend Developer", department: "Engineering" },
  );
  assert.equal(normalized.classification, "COMPLETE");
  assert.equal(normalized.taskId, uiTask.id);
});

test("disambiguates frontend task among multiple tasks when ABC says 'I have completed frontend development'", () => {
  const uiTask = {
    id: "task-ui",
    title: "Develop user interface",
    description: "Build client portal frontend components",
    status: "IN_PROGRESS",
    acceptance_criteria: [],
  };
  const testTask = {
    id: "task-qa",
    title: "Write integration tests",
    description: "End to end testing",
    status: "IN_PROGRESS",
    acceptance_criteria: [],
  };
  const normalized = normalizeAnalysis(
    result({
      classification: "COMPLETE",
      taskId: uiTask.id,
      acceptanceCriteriaMet: true,
      confidence: 0.9,
    }),
    [uiTask, testTask],
    "I have completed frontend development",
    { name: "ABC", role: "Frontend Developer", department: "Engineering" },
  );
  assert.equal(normalized.classification, "COMPLETE");
  assert.equal(normalized.taskId, uiTask.id);
});
