import { randomBytes, createHash } from "node:crypto";
import { requireDatabase } from "../db/supabase.js";
import { config } from "../config.js";

const DB_STATUS = {
  Pending: "pending",
  "In Progress": "in_progress",
  Blocked: "blocked",
  Complete: "complete",
  TODO: "pending",
  IN_PROGRESS: "in_progress",
  BLOCKED: "blocked",
  COMPLETE: "complete",
};
const API_STATUS = {
  pending: "TODO",
  todo: "TODO",
  "to do": "TODO",
  in_progress: "IN_PROGRESS",
  "in progress": "IN_PROGRESS",
  blocked: "BLOCKED",
  complete: "COMPLETE",
  completed: "COMPLETE",
  done: "COMPLETE",
};

export function toDbStatus(status) {
  const value = DB_STATUS[status];
  if (!value) throw new TypeError("Invalid task status.");
  return value;
}

export function toApiStatus(status) {
  const value = API_STATUS[String(status ?? "").toLowerCase()];
  if (!value) throw new TypeError(`Unsupported task status in Supabase: ${status}`);
  return value;
}

export function fromDbStatus(status) {
  return {
    TODO: "Pending",
    IN_PROGRESS: "In Progress",
    BLOCKED: "Blocked",
    COMPLETE: "Complete",
  }[toApiStatus(status)];
}

function asId(value) {
  return value == null ? null : String(value);
}

function projectPayload(row) {
  if (!row) return null;
  return {
    ...row,
    id: asId(row.client_id ?? row.id),
    manager_id: asId(row.manager_id),
  };
}

function taskPayload(row, projectClientId = null) {
  if (!row) return null;
  return {
    id: asId(row.client_id ?? row.id),
    project_id: asId(projectClientId ?? row.project_id),
    title: row.title,
    description: row.description ?? "",
    assignee_id: asId(row.owner_id),
    status: toApiStatus(row.status),
    acceptance_criteria: row.acceptance_criteria ?? [],
    priority: row.priority ?? "Medium",
    due_date: row.deadline ? String(row.deadline).slice(0, 10) : null,
    dependencies: row.dependencies ?? [],
    blocker: row.blocker ?? null,
    next_action: row.next_action ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function resolveProjectDbId(value, db = requireDatabase()) {
  if (value == null) return null;
  const id = String(value);
  const { data: byClientId, error: clientError } = await db
    .from("projects")
    .select("id")
    .eq("client_id", id)
    .maybeSingle();
  if (clientError) throw clientError;
  if (byClientId) return byClientId.id;
  if (!/^\d+$/.test(id)) return null;
  const { data, error } = await db
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function resolveTaskDbId(value, db = requireDatabase()) {
  if (value == null) return null;
  const id = String(value);
  const { data: byClientId, error: clientError } = await db
    .from("tasks")
    .select("id")
    .eq("client_id", id)
    .maybeSingle();
  if (clientError) throw clientError;
  if (byClientId) return byClientId.id;
  if (!/^\d+$/.test(id)) return null;
  const { data, error } = await db
    .from("tasks")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function getProjectClientId(projectDbId, db = requireDatabase()) {
  const { data, error } = await db
    .from("projects")
    .select("client_id")
    .eq("id", projectDbId)
    .maybeSingle();
  if (error) throw error;
  return data?.client_id ?? asId(projectDbId);
}

export async function listProjects() {
  const { data, error } = await requireDatabase()
    .from("projects")
    .select("*, project_members(participant_id)");
  if (error) throw error;
  return data.map(projectPayload);
}

export async function createProject(input) {
  const db = requireDatabase();
  if (input.id) {
    const { data: existing, error: lookupError } = await db
      .from("projects")
      .select("*")
      .eq("client_id", input.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return projectPayload(existing);
  }
  const { data, error } = await db
    .from("projects")
    .insert({
      ...(input.id ? { client_id: input.id } : {}),
      name: input.name,
      description: input.description ?? "",
      manager_id: input.manager_id || null,
      start_date: input.start_date ?? null,
      target_date: input.target_date ?? null,
      milestones: input.milestones ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  return projectPayload(data);
}

export async function updateProject(projectId, input) {
  const db = requireDatabase();
  const id = await resolveProjectDbId(projectId, db);
  if (id == null) return null;
  const { data, error } = await db
    .from("projects")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return projectPayload(data);
}

export async function listTasks(projectId) {
  const db = requireDatabase();
  let query = db.from("tasks").select("*").order("created_at");
  if (projectId) {
    const projectDbId = await resolveProjectDbId(projectId, db);
    if (projectDbId == null) return [];
    query = query.eq("project_id", projectDbId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return Promise.all(data.map(async (row) =>
    taskPayload(row, await getProjectClientId(row.project_id, db)),
  ));
}

export async function getTask(taskId) {
  const db = requireDatabase();
  const id = await resolveTaskDbId(taskId, db);
  if (id == null) return null;
  const { data: row, error } = await db
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const [{ data: participant, error: participantError }, projectClientId] = await Promise.all([
    row.owner_id == null
      ? Promise.resolve({ data: null, error: null })
      : db.from("participants")
        .select("id, display_name, telegram_chat_id, telegram_user_id")
        .eq("id", row.owner_id)
        .maybeSingle(),
    getProjectClientId(row.project_id, db),
  ]);
  if (participantError) throw participantError;
  return {
    ...taskPayload(row, projectClientId),
    _dbId: asId(row.id),
    _dbProjectId: asId(row.project_id),
    participants: participant
      ? { ...participant, id: asId(participant.id) }
      : null,
  };
}

function taskRecord(input, projectDbId) {
  return {
    ...(input.id ? { client_id: input.id } : {}),
    project_id: projectDbId,
    title: input.title,
    description: input.description ?? "",
    owner_id: input.assignee_id || null,
    status: toDbStatus(input.status || "Pending"),
    acceptance_criteria: input.acceptance_criteria ?? [],
    priority: input.priority || "Medium",
    deadline: input.due_date || null,
    dependencies: input.dependencies ?? [],
    blocker: input.blocker ?? null,
    next_action: input.next_action ?? "",
  };
}

async function validateAssigneeMembership(projectDbId, participantId, db) {
  if (participantId == null || participantId === "") return;
  const { data: membership, error } = await db
    .from("project_members")
    .select("participant_id")
    .eq("project_id", projectDbId)
    .eq("participant_id", participantId)
    .maybeSingle();
  if (error) throw error;
  if (!membership) {
    throw Object.assign(new Error("The task assignee must be a member of its project."), {
      status: 400,
    });
  }
}

export async function createTask(input) {
  const db = requireDatabase();
  const projectDbId = await resolveProjectDbId(input.project_id, db);
  if (projectDbId == null) {
    throw Object.assign(new Error("The task project does not exist in the backend."), {
      status: 400,
    });
  }
  await validateAssigneeMembership(projectDbId, input.assignee_id, db);
  if (input.id) {
    const { data: existing, error: lookupError } = await db
      .from("tasks")
      .select("*")
      .eq("client_id", input.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return taskPayload(existing, await getProjectClientId(existing.project_id, db));
  }
  const { data, error } = await db
    .from("tasks")
    .insert(taskRecord(input, projectDbId))
    .select()
    .single();
  if (error) throw error;
  return taskPayload(data, await getProjectClientId(data.project_id, db));
}

export async function updateTask(taskId, input) {
  const db = requireDatabase();
  const id = await resolveTaskDbId(taskId, db);
  if (id == null) return null;
  const { data: current, error: currentError } = await db
    .from("tasks")
    .select("project_id")
    .eq("id", id)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  if (input.assignee_id) {
    await validateAssigneeMembership(current.project_id, input.assignee_id, db);
  }
  const columns = {
    title: "title",
    description: "description",
    assignee_id: "owner_id",
    status: "status",
    acceptance_criteria: "acceptance_criteria",
    priority: "priority",
    due_date: "deadline",
    dependencies: "dependencies",
    blocker: "blocker",
    next_action: "next_action",
  };
  const update = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(input)) {
    const column = columns[key];
    if (column) update[column] = key === "status" ? toDbStatus(value) : value;
  }
  const { data, error } = await db
    .from("tasks")
    .update(update)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? taskPayload(data, await getProjectClientId(data.project_id, db)) : null;
}

export async function deleteTask(taskId) {
  const db = requireDatabase();
  const id = await resolveTaskDbId(taskId, db);
  if (id == null) return;
  const { error } = await db.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function listTaskEvents(taskId) {
  const db = requireDatabase();
  const id = await resolveTaskDbId(taskId, db);
  if (id == null) return [];
  const { data, error } = await db
    .from("task_events")
    .select("*")
    .eq("task_id", id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listTaskMessages(taskId) {
  const db = requireDatabase();
  const id = await resolveTaskDbId(taskId, db);
  if (id == null) return [];
  const { data, error } = await db
    .from("telegram_messages")
    .select("id, participant_id, direction, message_text, processing_status, created_at")
    .eq("task_id", id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((message) => ({
    ...message,
    participant_id: asId(message.participant_id),
  }));
}

export async function registerParticipant(input) {
  const db = requireDatabase();
  const projectDbId = await resolveProjectDbId(input.project_id, db);
  if (projectDbId == null) {
    throw Object.assign(new Error("The participant project does not exist in the backend."), {
      status: 400,
    });
  }
  const code = randomBytes(18).toString("base64url");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

  // Check if participant with matching display_name already exists to prevent duplicates
  const { data: existingParticipant, error: searchError } = await db
    .from("participants")
    .select("id, display_name, role, department, telegram_user_id, telegram_chat_id, telegram_link_code_expires_at")
    .eq("display_name", input.display_name.trim())
    .maybeSingle();
  if (searchError) throw searchError;

  let participant = existingParticipant;
  if (participant) {
    const updateData = {
      ...(input.role ? { role: input.role } : {}),
      ...(input.department ? { department: input.department } : {}),
      updated_at: new Date().toISOString(),
    };
    if (!participant.telegram_user_id) {
      updateData.telegram_link_code_hash = codeHash;
      updateData.telegram_link_code_expires_at = expiresAt;
    }
    const { data: updated, error: updateError } = await db
      .from("participants")
      .update(updateData)
      .eq("id", participant.id)
      .select("id, display_name, role, department, telegram_user_id")
      .single();
    if (updateError) throw updateError;
    participant = updated;
  } else {
    const { data: created, error } = await db
      .from("participants")
      .insert({
        display_name: input.display_name.trim(),
        role: input.role ?? "",
        department: input.department ?? "",
        telegram_link_code_hash: codeHash,
        telegram_link_code_expires_at: expiresAt,
      })
      .select("id, display_name, role, department, telegram_user_id")
      .single();
    if (error) throw error;
    participant = created;
  }

  // Ensure project membership exists
  const { data: existingMember } = await db
    .from("project_members")
    .select("participant_id")
    .eq("project_id", projectDbId)
    .eq("participant_id", participant.id)
    .maybeSingle();

  if (!existingMember) {
    const { error: memberError } = await db.from("project_members").insert({
      project_id: projectDbId,
      participant_id: participant.id,
    });
    if (memberError) {
      console.error("Could not add project membership:", memberError.message);
      throw memberError;
    }
  }

  return {
    id: asId(participant.id),
    display_name: participant.display_name,
    role: participant.role ?? "",
    department: participant.department ?? "",
    telegram_linked: Boolean(participant.telegram_user_id),
    telegram_link_code: participant.telegram_user_id ? null : code,
    expires_at: expiresAt,
  };
}

export function hashLinkCode(code) {
  return createHash("sha256").update(code).digest("hex");
}

export async function linkTelegramAccount({ code, telegramUserId, chatId, username }) {
  const db = requireDatabase();
  const { data, error } = await db
    .from("participants")
    .update({
      telegram_user_id: String(telegramUserId),
      telegram_chat_id: String(chatId),
      telegram_username: username || null,
      telegram_link_code_hash: null,
      telegram_link_code_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("telegram_link_code_hash", hashLinkCode(code))
    .gt("telegram_link_code_expires_at", new Date().toISOString())
    .select("id, display_name")
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, id: asId(data.id) } : null;
}

export async function getParticipantByTelegramId(telegramUserId, db = requireDatabase()) {
  const { data, error } = await db
    .from("participants")
    .select("id, display_name, telegram_chat_id")
    .eq("telegram_user_id", String(telegramUserId))
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, id: asId(data.id) } : null;
}

export async function getParticipantTasks(participantId, { includeComplete = false } = {}) {
  const { data, error } = await requireDatabase()
    .from("tasks")
    .select("id, client_id, title, description, status, deadline, acceptance_criteria, project_id")
    .eq("owner_id", participantId);
  if (error) throw error;
  const tasks = await Promise.all(data.map(async (row) => {
    const { data: project, error: projectError } = await requireDatabase()
      .from("projects")
      .select("name, description")
      .eq("id", row.project_id)
      .maybeSingle();
    if (projectError) throw projectError;
    return {
      id: asId(row.client_id ?? row.id),
      title: row.title,
      description: row.description ?? "",
      status: toApiStatus(row.status),
      due_date: row.deadline,
      acceptance_criteria: row.acceptance_criteria ?? [],
      projects: project,
    };
  }));
  return includeComplete
    ? tasks
    : tasks.filter((task) => task.status !== "COMPLETE");
}

export async function getParticipantReport(participantId) {
  const tasks = await getParticipantTasks(participantId, { includeComplete: true });
  const blocked = tasks.filter((task) => task.status === "BLOCKED");
  const complete = tasks.filter((task) => task.status === "COMPLETE");
  return {
    assigned: tasks.length,
    open: tasks.length - complete.length,
    blocked: blocked.length,
    complete: complete.length,
    tasks: tasks.map((task) => ({
      title: task.title,
      status: fromDbStatus(task.status),
      project: task.projects?.name,
      due_date: task.due_date,
    })),
  };
}

export async function createFollowup({ task, participant, text }) {
  const { data, error } = await requireDatabase().rpc("create_followup_if_allowed", {
    p_task_id: task._dbId,
    p_project_id: task._dbProjectId,
    p_participant_id: participant.id,
    p_message_text: text,
    p_max_per_day: config.maxFollowupsPerDay,
  });
  if (error) {
    if (error.message.includes("limit reached") || error.message.includes("within the last hour")) {
      throw Object.assign(new Error(error.message), { status: 429 });
    }
    throw error;
  }
  return { id: data };
}

export async function setFollowupDelivery(followupId, status, telegramMessageId, errorMessage) {
  const { error } = await requireDatabase()
    .from("followups")
    .update({
      status,
      telegram_message_id: telegramMessageId ?? null,
      delivery_error: errorMessage ?? null,
    })
    .eq("id", followupId);
  if (error) throw error;
}

export async function recordOutboundMessage({ participantId, task, taskId, followupId, text, telegramMessageId }) {
  const { error } = await requireDatabase().from("telegram_messages").insert({
    direction: "OUTBOUND",
    participant_id: participantId,
    task_id: task?._dbId ?? taskId,
    followup_id: followupId,
    telegram_message_id: telegramMessageId,
    message_text: text,
    processing_status: "PROCESSED",
  });
  if (error) throw error;
}

export async function findFollowupForReply({ participantId, replyToMessageId }) {
  let query = requireDatabase()
    .from("followups")
    .select("id, task_id, project_id, requested_at")
    .eq("participant_id", participantId)
    .eq("status", "AWAITING_REPLY");
  if (replyToMessageId) query = query.eq("telegram_message_id", replyToMessageId);
  const { data, error } = await query.order("requested_at", { ascending: false }).limit(5);
  if (error) throw error;
  return Promise.all(data.map(async (followup) => {
    const task = await getTask(String(followup.task_id));
    const { data: project, error: projectError } = await requireDatabase()
      .from("projects")
      .select("name, description")
      .eq("id", followup.project_id)
      .maybeSingle();
    if (projectError) throw projectError;
    return {
      ...followup,
      task_id: asId(task?._dbId),
      project_id: asId(followup.project_id),
      tasks: task
        ? {
            ...task,
            id: asId(task._dbId),
            project_id: asId(task._dbProjectId),
            projects: project,
          }
        : null,
    };
  }));
}

export async function recordTelegramMessage(message, db = requireDatabase()) {
  const { data, error } = await db
    .from("telegram_messages")
    .insert(message)
    .select("id")
    .single();
  if (error?.code === "23505") return null;
  if (error) throw error;
  return data;
}

export async function markTelegramMessageFailed(messageId, reason, taskId) {
  const taskDbId = taskId ? await resolveTaskDbId(taskId) : null;
  const { error } = await requireDatabase()
    .from("telegram_messages")
    .update({
      ...(taskDbId ? { task_id: taskDbId } : {}),
      processing_status: "FAILED",
      processing_error: reason.slice(0, 500),
    })
    .eq("id", messageId);
  if (error) throw error;
}

export async function recordReplyDecision({ followup, messageId, reply, analysis, participantId }, db = requireDatabase()) {
  const finalTaskId = analysis.classification === "UNCLEAR" ? null : analysis.taskId;
  const taskDbId = finalTaskId
    ? await resolveTaskDbId(finalTaskId, db)
    : followup?.task_id ?? null;
  const projectDbId = followup?.project_id ??
    (taskDbId == null ? null : await getProjectDbIdForTask(taskDbId, db));
  const status = {
    IN_PROGRESS: "IN_PROGRESS",
    BLOCKED: "BLOCKED",
    COMPLETE: "COMPLETE",
  }[analysis.classification];
  const { error } = await db.rpc("apply_reply_decision", {
    p_project_id: projectDbId,
    p_task_id: taskDbId,
    p_participant_id: participantId,
    p_message_id: messageId,
    p_followup_id: followup?.id ?? null,
    p_evidence: reply,
    p_analysis: analysis,
    p_next_status: status ?? null,
    p_blocker: status === "BLOCKED" ? analysis.blocker : null,
  });
  if (error) throw error;
}

async function getProjectDbIdForTask(taskDbId, db) {
  const { data, error } = await db
    .from("tasks")
    .select("project_id")
    .eq("id", taskDbId)
    .maybeSingle();
  if (error) throw error;
  return data?.project_id ?? null;
}

export async function listParticipants() {
  const db = requireDatabase();
  const { data, error } = await db
    .from("participants")
    .select("id, display_name, role, department, telegram_user_id");
  if (error) throw error;
  const participants = await Promise.all(data.map(async (participant) => {
    const { data: memberships, error: membershipError } = await db
      .from("project_members")
      .select("project_id")
      .eq("participant_id", participant.id);
    if (membershipError) throw membershipError;
    const projectIds = await Promise.all(memberships.map((membership) =>
      getProjectClientId(membership.project_id, db),
    ));
    return {
      id: asId(participant.id),
      display_name: participant.display_name,
      role: participant.role ?? "",
      department: participant.department ?? "",
      telegram_linked: Boolean(participant.telegram_user_id),
      project_members: projectIds.map((project_id) => ({ project_id })),
    };
  }));
  return participants;
}

export async function getProjectReport(projectId) {
  const db = requireDatabase();
  const projectDbId = await resolveProjectDbId(projectId, db);
  if (projectDbId == null) return null;
  const { data, error } = await db
    .from("tasks")
    .select("status")
    .eq("project_id", projectDbId);
  if (error) throw error;
  return data.reduce((result, task) => {
    result.total += 1;
    result[toApiStatus(task.status)] += 1;
    return result;
  }, { total: 0, TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, COMPLETE: 0 });
}

export async function getParticipantContext(participantId, db = requireDatabase()) {
  if (!participantId) return null;
  const { data: participant, error } = await db
    .from("participants")
    .select("id, display_name, role, department, telegram_chat_id, telegram_user_id")
    .eq("id", participantId)
    .maybeSingle();
  if (error) throw error;
  if (!participant) return null;

  const { data: memberships, error: memberError } = await db
    .from("project_members")
    .select("project_id, projects(id, client_id, name, description)")
    .eq("participant_id", participantId);
  if (memberError) throw memberError;

  const projects = (memberships || []).map((m) => ({
    id: asId(m.projects?.client_id ?? m.projects?.id ?? m.project_id),
    name: m.projects?.name ?? "",
    description: m.projects?.description ?? "",
  }));

  return {
    ...participant,
    id: asId(participant.id),
    projects,
  };
}

export async function listAllEvents(projectId = null, limit = 50, db = requireDatabase()) {
  let query = db.from("task_events").select("*").order("created_at", { ascending: false }).limit(limit);
  if (projectId) {
    const projectDbId = await resolveProjectDbId(projectId, db);
    if (projectDbId) query = query.eq("project_id", projectDbId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function checkAndTriggerDependencyHandoffs(
  { completedTaskDbId, completerParticipantId },
  db = requireDatabase(),
  sendNotification = null,
) {
  if (completedTaskDbId == null) return [];

  // 1. Fetch completed task
  const { data: completedTask, error: taskError } = await db
    .from("tasks")
    .select("id, client_id, project_id, title, status")
    .eq("id", completedTaskDbId)
    .maybeSingle();
  if (taskError) throw taskError;
  if (!completedTask) return [];

  const completedIds = [String(completedTask.id), completedTask.client_id].filter(Boolean);

  // 2. Fetch completer name
  let completerName = "a team member";
  if (completerParticipantId) {
    const { data: completer } = await db
      .from("participants")
      .select("display_name")
      .eq("id", completerParticipantId)
      .maybeSingle();
    if (completer?.display_name) completerName = completer.display_name;
  }

  // 3. Find candidate downstream tasks that are open and have dependencies
  const { data: candidates, error: candError } = await db
    .from("tasks")
    .select("id, client_id, project_id, title, owner_id, status, blocker, dependencies")
    .neq("status", "complete")
    .neq("status", "blocked");
  if (candError) throw candError;

  // Preload task statuses for prerequisite evaluation
  const { data: allTaskStatuses, error: allStatusError } = await db
    .from("tasks")
    .select("id, client_id, status");
  if (allStatusError) throw allStatusError;

  const statusMap = new Map();
  for (const row of allTaskStatuses || []) {
    statusMap.set(String(row.id), row.status);
    if (row.client_id) statusMap.set(String(row.client_id), row.status);
  }

  const triggeredHandoffs = [];

  for (const downstream of candidates || []) {
    const deps = downstream.dependencies || [];
    if (!Array.isArray(deps) || deps.length === 0) continue;

    // Check if downstream task explicitly depends on this completed task
    const dependsOnThis = deps.some((dep) => completedIds.includes(String(dep)));
    if (!dependsOnThis) continue;

    // Check if ALL prerequisites are complete
    const allPrereqsMet = deps.every((dep) => {
      const depStatus = statusMap.get(String(dep));
      return depStatus === "complete";
    });

    if (!allPrereqsMet) {
      continue;
    }

    // Check downstream owner and Telegram link
    if (!downstream.owner_id) continue;
    const { data: assignee, error: assigneeError } = await db
      .from("participants")
      .select("id, display_name, telegram_chat_id, telegram_user_id")
      .eq("id", downstream.owner_id)
      .maybeSingle();
    if (assigneeError) throw assigneeError;
    if (!assignee?.telegram_chat_id) continue;

    // Idempotency check: has handoff notification already been sent?
    try {
      const { data: existingHandoff } = await db
        .from("handoff_notifications")
        .select("id, status")
        .eq("prerequisite_task_id", completedTask.id)
        .eq("downstream_task_id", downstream.id)
        .maybeSingle();

      if (existingHandoff && existingHandoff.status === "SENT") {
        continue;
      }
    } catch {
      // Table may not exist in pure mock environments
    }

    const messageText = `Hi ${assignee.display_name}, the prerequisite task '${completedTask.title}' has been marked complete by ${completerName}. Your task '${downstream.title}' is now ready to begin. Please review the task details and share an update when you start.`;

    const sendFn = sendNotification || (async (chatId, text) => {
      const { sendTelegramMessage } = await import("./telegram.js");
      return sendTelegramMessage(chatId, text);
    });

    let sentMessageId = null;
    let deliveryStatus = "SENT";
    let deliveryError = null;

    try {
      const sent = await sendFn(assignee.telegram_chat_id, messageText);
      sentMessageId = sent?.message_id ?? null;
    } catch (sendErr) {
      deliveryStatus = "FAILED";
      deliveryError = sendErr.message;
      console.error(`Handoff Telegram delivery failed to participant ${assignee.id}:`, sendErr.message);
    }

    // Persist to handoff_notifications
    try {
      await db.from("handoff_notifications").upsert({
        prerequisite_task_id: completedTask.id,
        downstream_task_id: downstream.id,
        recipient_participant_id: assignee.id,
        telegram_message_id: sentMessageId,
        status: deliveryStatus,
        delivery_error: deliveryError,
        created_at: new Date().toISOString(),
      }, { onConflict: "prerequisite_task_id,downstream_task_id" });
    } catch (saveError) {
      console.warn("handoff_notifications record skipped:", saveError.message);
    }

    // Persist outbound telegram message record
    if (deliveryStatus === "SENT") {
      try {
        await db.from("telegram_messages").insert({
          direction: "OUTBOUND",
          participant_id: assignee.id,
          task_id: downstream.id,
          telegram_message_id: sentMessageId,
          message_text: messageText,
          processing_status: "PROCESSED",
        });
      } catch (msgErr) {
        console.warn("telegram_messages record skipped:", msgErr.message);
      }
    }

    // Persist audit event in task_events
    try {
      await db.from("task_events").insert({
        project_id: downstream.project_id,
        task_id: downstream.id,
        participant_id: assignee.id,
        event_type: "dependency_handoff",
        evidence: `Prerequisite "${completedTask.title}" completed by ${completerName}`,
        analysis: {
          prerequisiteTaskId: asId(completedTask.client_id ?? completedTask.id),
          prerequisiteTitle: completedTask.title,
          completedBy: completerName,
          downstreamTaskId: asId(downstream.client_id ?? downstream.id),
          downstreamTitle: downstream.title,
          delivery: deliveryStatus,
          ...(deliveryError ? { error: deliveryError } : {}),
        },
        previous_status: downstream.status,
        next_status: downstream.status,
      });
    } catch (eventErr) {
      console.warn("task_events record skipped:", eventErr.message);
    }

    triggeredHandoffs.push({
      downstreamTaskId: downstream.id,
      downstreamTitle: downstream.title,
      recipientId: assignee.id,
      recipientName: assignee.display_name,
      deliveryStatus,
      deliveryError,
      messageText,
    });
  }

  return triggeredHandoffs;
}

