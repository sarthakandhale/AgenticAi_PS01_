import assert from "node:assert/strict";
import test from "node:test";
import {
  wouldCreateCycle,
  analyzeAndInferProjectDependencies,
  confirmProjectDependency,
  rejectProjectDependency,
} from "../services/taskService.js";
import {
  normalizeDependencies,
  inferDependenciesHeuristic,
  inferDependenciesWithAI,
} from "../agent.js";

test("wouldCreateCycle rejects self-dependencies", () => {
  assert.equal(wouldCreateCycle([], "task-1", "task-1"), true);
});

test("wouldCreateCycle detects direct two-node cycles", () => {
  const edges = [{ prerequisiteTaskId: "task-1", dependentTaskId: "task-2" }];
  // Adding task-2 -> task-1 would form task-1 -> task-2 -> task-1
  assert.equal(wouldCreateCycle(edges, "task-2", "task-1"), true);
  // Adding an independent edge is valid
  assert.equal(wouldCreateCycle(edges, "task-2", "task-3"), false);
});

test("wouldCreateCycle detects deep transitive circular dependency chains", () => {
  const edges = [
    { prerequisiteTaskId: "A", dependentTaskId: "B" },
    { prerequisiteTaskId: "B", dependentTaskId: "C" },
    { prerequisiteTaskId: "C", dependentTaskId: "D" },
    { prerequisiteTaskId: "D", dependentTaskId: "E" },
  ];
  // Adding E -> A would close the loop A -> B -> C -> D -> E -> A
  assert.equal(wouldCreateCycle(edges, "E", "A"), true);
  // Adding C -> A would close A -> B -> C -> A
  assert.equal(wouldCreateCycle(edges, "C", "A"), true);
  // Adding A -> E is a valid DAG transitive edge
  assert.equal(wouldCreateCycle(edges, "A", "E"), false);
  // Adding F -> E is valid
  assert.equal(wouldCreateCycle(edges, "F", "E"), false);
});

test("normalizeDependencies handles invalid IDs, self-dependencies, duplicates, and independent tasks", () => {
  const tasks = [
    { id: "1", title: "Database Schema" },
    { id: "2", title: "Backend API" },
    { id: "3", title: "Documentation" },
  ];

  const rawAiResult = {
    dependencies: [
      {
        prerequisiteTaskId: "1",
        dependentTaskId: "2",
        explanation: "API needs schema",
        confidence: 0.95,
        evidence: "Database tables needed",
      },
      // Self dependency - should be rejected
      {
        prerequisiteTaskId: "1",
        dependentTaskId: "1",
        explanation: "Self",
        confidence: 0.5,
      },
      // Non-existent task - should be rejected
      {
        prerequisiteTaskId: "1",
        dependentTaskId: "999",
        explanation: "Invalid",
        confidence: 0.8,
      },
      // Duplicate edge - should be deduplicated
      {
        prerequisiteTaskId: "1",
        dependentTaskId: "2",
        explanation: "Duplicate",
        confidence: 0.9,
      },
    ],
    independentTaskIds: [],
  };

  const normalized = normalizeDependencies(rawAiResult, tasks);
  assert.equal(normalized.dependencies.length, 1);
  assert.equal(normalized.dependencies[0].prerequisiteTaskId, "1");
  assert.equal(normalized.dependencies[0].dependentTaskId, "2");
  assert.deepEqual(normalized.independentTaskIds, ["3"]);
});

test("inferDependenciesHeuristic infers logical prerequisite direction and independent tasks", () => {
  const tasks = [
    {
      id: "1",
      title: "Design PostgreSQL Database Schema",
      description: "Define tables and migration scripts",
      assigneeRole: "Database Engineer",
    },
    {
      id: "2",
      title: "Implement REST Backend API Endpoints",
      description: "CRUD endpoints for tasks and projects",
      assigneeRole: "Backend Developer",
    },
    {
      id: "3",
      title: "Build React Frontend UI Dashboard",
      description: "Connect components to backend endpoints",
      assigneeRole: "Frontend Developer",
    },
    {
      id: "4",
      title: "Write User Documentation",
      description: "Create onboarding guide for admins",
      assigneeRole: "Technical Writer",
    },
  ];

  const result = inferDependenciesHeuristic({ id: "proj-1", name: "Pilot" }, tasks);
  assert.ok(result.dependencies.length >= 2);

  // Check direction: Schema (1) -> API (2)
  const schemaToApi = result.dependencies.find(
    (d) => d.prerequisiteTaskId === "1" && d.dependentTaskId === "2",
  );
  assert.ok(schemaToApi, "Schema should be prerequisite to Backend API");
  assert.ok(schemaToApi.confidence >= 0.85);

  // Check direction: API (2) -> Frontend (3)
  const apiToFrontend = result.dependencies.find(
    (d) => d.prerequisiteTaskId === "2" && d.dependentTaskId === "3",
  );
  assert.ok(apiToFrontend, "Backend API should be prerequisite to Frontend UI");

  // Documentation should be identified as independent
  assert.ok(result.independentTaskIds.includes("4"), "Documentation can proceed in parallel");
});

test("inferDependenciesWithAI works with mocked model", async () => {
  const mockModel = {
    invoke: async () => ({
      dependencies: [
        {
          prerequisiteTaskId: "T-1",
          dependentTaskId: "T-2",
          explanation: "Backend API endpoints rely on the PostgreSQL schema.",
          confidence: 0.95,
          evidence: "Database schema must exist before API can query tables.",
        },
      ],
      independentTaskIds: ["T-3"],
      summary: "Identified architectural prerequisite flow.",
    }),
  };

  const tasks = [
    { id: "T-1", title: "DB Schema", status: "COMPLETE" },
    { id: "T-2", title: "API Server", status: "IN_PROGRESS" },
    { id: "T-3", title: "Brand Guidelines", status: "PENDING" },
  ];

  const result = await inferDependenciesWithAI({ id: "P1", name: "Alpha" }, tasks, { model: mockModel });
  assert.equal(result.dependencies.length, 1);
  assert.equal(result.dependencies[0].prerequisiteTaskId, "T-1");
  assert.equal(result.dependencies[0].dependentTaskId, "T-2");
  assert.deepEqual(result.independentTaskIds, ["T-3"]);
});

test("analyzeAndInferProjectDependencies preserves manager-confirmed dependencies and rejects cycles", async () => {
  const fakeDb = {
    from(table) {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 10, client_id: "P-10", name: "Project Alpha" }, error: null }),
              single: async () => ({ data: { id: 10, client_id: "P-10", name: "Project Alpha", description: "" }, error: null }),
            }),
          }),
        };
      }
      if (table === "tasks") {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [
                { id: 101, client_id: "T-1", project_id: 10, title: "Database Schema", status: "completed", dependencies: [] },
                { id: 102, client_id: "T-2", project_id: 10, title: "Backend API", status: "in_progress", dependencies: ["T-1"] },
                { id: 103, client_id: "T-3", project_id: 10, title: "Frontend UI", status: "pending", dependencies: [] },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === "participants") {
        return {
          select: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        };
      }
      if (table === "task_dependencies") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    id: "dep-confirmed-1",
                    project_id: 10,
                    prerequisite_task_id: 101,
                    dependent_task_id: 102,
                    confidence: 1.0,
                    explanation: "Manager confirmed dependency",
                    status: "CONFIRMED",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                ],
                error: null,
              }),
            }),
          }),
          upsert: async () => ({ error: null }),
        };
      }
      if (table === "task_events") {
        return {
          insert: async () => ({ error: null }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const mockModel = {
    invoke: async () => ({
      dependencies: [
        // AI re-proposing already confirmed T-1 -> T-2
        {
          prerequisiteTaskId: "T-1",
          dependentTaskId: "T-2",
          explanation: "DB is needed for API",
          confidence: 0.9,
        },
        // AI proposing T-2 -> T-3 (Valid)
        {
          prerequisiteTaskId: "T-2",
          dependentTaskId: "T-3",
          explanation: "Frontend needs API",
          confidence: 0.88,
        },
        // AI proposing circular T-3 -> T-1 (Should be rejected because 1->2->3)
        {
          prerequisiteTaskId: "T-3",
          dependentTaskId: "T-1",
          explanation: "Circular bad edge",
          confidence: 0.5,
        },
      ],
      independentTaskIds: [],
    }),
  };

  const result = await analyzeAndInferProjectDependencies("P-10", { db: fakeDb, model: mockModel });
  assert.ok(result.dependencies.length >= 1);
  // Ensure confirmed dependency remains CONFIRMED
  const confirmed = result.dependencies.find(
    (d) => d.prerequisiteTaskId === "T-1" && d.dependentTaskId === "T-2",
  );
  assert.ok(confirmed);
  assert.equal(confirmed.status, "CONFIRMED");

  // Ensure circular edge T-3 -> T-1 was rejected
  const circular = result.dependencies.find(
    (d) => d.prerequisiteTaskId === "T-3" && d.dependentTaskId === "T-1",
  );
  assert.equal(circular, undefined, "Circular dependency must be rejected");
});

test("confirmProjectDependency verifies project boundaries and updates tasks.dependencies", async () => {
  let updatedTaskPayload = null;
  let upsertedDependencyPayload = null;

  const fakeDb = {
    from(table) {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 10, client_id: "P-10" }, error: null }),
            }),
          }),
        };
      }
      if (table === "tasks") {
        return {
          select: () => ({
            eq: (col, val) => ({
              maybeSingle: async () => {
                if (val === "T-1" || val === 101) return { data: { id: 101, client_id: "T-1", project_id: 10, title: "Schema" }, error: null };
                if (val === "T-2" || val === 102) return { data: { id: 102, client_id: "T-2", project_id: 10, title: "API" }, error: null };
                return { data: null, error: null };
              },
            }),
            in: async () => ({
              data: [
                { id: 101, client_id: "T-1", project_id: 10, title: "Schema", dependencies: [] },
                { id: 102, client_id: "T-2", project_id: 10, title: "API", dependencies: [] },
              ],
              error: null,
            }),
          }),
          update: (payload) => ({
            eq: async (col, val) => {
              updatedTaskPayload = { ...payload, id: val };
              return { error: null };
            },
          }),
        };
      }
      if (table === "task_dependencies") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
          upsert: (payload) => ({
            select: () => ({
              single: async () => {
                upsertedDependencyPayload = payload;
                return { data: { id: "uuid-1", ...payload }, error: null };
              },
            }),
          }),
        };
      }
      if (table === "task_events") {
        return {
          insert: async () => ({ error: null }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const result = await confirmProjectDependency(
    "P-10",
    { prerequisiteTaskId: "T-1", dependentTaskId: "T-2" },
    fakeDb,
  );

  assert.equal(result.status, "CONFIRMED");
  assert.equal(result.prerequisiteTaskId, "T-1");
  assert.equal(result.dependentTaskId, "T-2");
  assert.ok(upsertedDependencyPayload);
  assert.equal(upsertedDependencyPayload.status, "CONFIRMED");
  // Check synchronization to tasks.dependencies
  assert.ok(updatedTaskPayload);
  assert.deepEqual(updatedTaskPayload.dependencies, ["T-1"]);
});

test("confirmProjectDependency rejects cross-project dependencies", async () => {
  const fakeDb = {
    from(table) {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 10, client_id: "P-10" }, error: null }),
            }),
          }),
        };
      }
      if (table === "tasks") {
        return {
          select: () => ({
            eq: (col, val) => ({
              maybeSingle: async () => {
                if (val === "T-1" || val === 101) return { data: { id: 101, project_id: 10 }, error: null };
                if (val === "T-99" || val === 199) return { data: { id: 199, project_id: 99 }, error: null }; // Different project!
                return { data: null, error: null };
              },
            }),
            in: async () => ({
              data: [
                { id: 101, client_id: "T-1", project_id: 10, title: "Task 1", dependencies: [] },
                { id: 199, client_id: "T-99", project_id: 99, title: "Task 99", dependencies: [] },
              ],
              error: null,
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  await assert.rejects(
    confirmProjectDependency("P-10", { prerequisiteTaskId: "T-1", dependentTaskId: "T-99" }, fakeDb),
    /cross-project/i,
  );
});

test("rejectProjectDependency updates status and removes edge from tasks.dependencies", async () => {
  let updatedDependencies = null;
  let updatedStatus = null;

  const fakeDb = {
    from(table) {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 10, client_id: "P-10" }, error: null }),
            }),
          }),
        };
      }
      if (table === "tasks") {
        return {
          select: () => ({
            eq: (col, val) => ({
              maybeSingle: async () => {
                if (val === "T-1" || val === 101) return { data: { id: 101, client_id: "T-1" }, error: null };
                if (val === "T-2" || val === 102) return { data: { id: 102, client_id: "T-2" }, error: null };
                return { data: null, error: null };
              },
            }),
            in: async () => ({
              data: [
                { id: 101, client_id: "T-1", title: "Prereq" },
                { id: 102, client_id: "T-2", title: "Dependent", dependencies: ["T-1", "T-Other"] },
              ],
              error: null,
            }),
          }),
          update: (payload) => ({
            eq: async () => {
              updatedDependencies = payload.dependencies;
              return { error: null };
            },
          }),
        };
      }
      if (table === "task_dependencies") {
        return {
          update: (payload) => ({
            eq: () => ({
              eq: () => ({
                eq: async () => {
                  updatedStatus = payload.status;
                  return { error: null };
                },
              }),
            }),
          }),
        };
      }
      if (table === "task_events") {
        return {
          insert: async () => ({ error: null }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const result = await rejectProjectDependency(
    "P-10",
    { prerequisiteTaskId: "T-1", dependentTaskId: "T-2" },
    fakeDb,
  );

  assert.equal(result.status, "REJECTED");
  assert.equal(updatedStatus, "REJECTED");
  assert.deepEqual(updatedDependencies, ["T-Other"]);
});
