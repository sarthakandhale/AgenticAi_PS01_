import { randomBytes, createHash } from "node:crypto";
import { requireDatabase } from "../db/supabase.js";
import { config } from "../config.js";
import { inferDependenciesWithAI } from "../agent.js";

const DB_STATUS = {
  Pending: "pending",
  "In Progress": "in_progress",
  Blocked: "blocked",
  Complete: "completed",
  Completed: "completed",
  TODO: "pending",
  IN_PROGRESS: "in_progress",
  BLOCKED: "blocked",
  COMPLETE: "completed",
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
  const member_ids = (row.project_members || []).map((m) => asId(m.participant_id)).filter(Boolean);
  return {
    ...row,
    id: asId(row.client_id ?? row.id),
    manager_id: asId(row.manager_id),
    member_ids: member_ids.length > 0 ? member_ids : (row.member_ids ?? []),
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
  if (value == null || value === "null" || value === "undefined") return null;
  const id = String(value).trim();
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

export async function resolveParticipantDbId(value, db = requireDatabase()) {
  if (value == null || value === "null" || value === "undefined") return null;
  const id = String(value).trim();
  if (!id) return null;
  if (/^\d+$/.test(id)) {
    const { data, error } = await db
      .from("participants")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data.id;
  }
  const { data: byName, error: nameError } = await db
    .from("participants")
    .select("id")
    .eq("display_name", id)
    .maybeSingle();
  if (nameError) throw nameError;
  return byName?.id ?? null;
}

export async function syncProjectMembers(projectDbId, memberIds, db = requireDatabase(), sendNotification = null) {
  if (!Array.isArray(memberIds)) return;
  const resolvedIds = [];
  for (const mId of memberIds) {
    const pDbId = await resolveParticipantDbId(mId, db);
    if (pDbId != null && !resolvedIds.includes(pDbId)) {
      resolvedIds.push(pDbId);
    }
  }

  const { data: currentMembers, error: fetchError } = await db
    .from("project_members")
    .select("participant_id")
    .eq("project_id", projectDbId);
  if (fetchError) throw fetchError;

  const currentIds = new Set((currentMembers || []).map((m) => m.participant_id));

  // Fetch project name for human-readable notifications
  let projectName = "New Project";
  try {
    const { data: proj } = await db
      .from("projects")
      .select("name")
      .eq("id", projectDbId)
      .maybeSingle();
    if (proj?.name) projectName = proj.name;
  } catch {
    // Project name fallback
  }

  for (const pId of resolvedIds) {
    if (!currentIds.has(pId)) {
      const { error: insertError } = await db.from("project_members").insert({
        project_id: projectDbId,
        participant_id: pId,
      });
      if (insertError) {
        console.warn(`Could not add project member ${pId}:`, insertError.message);
        continue;
      }

      // Feature 1: Notify the newly assigned member
      const notifTitle = "New project assigned to you";
      const notifMessage = `New project assigned to you: ${projectName}. Assigned by: Project Coordinator. Open your dashboard to view the project details and tasks.`;

      // 1. Persist notification to public.notifications
      let notificationSaved = false;
      try {
        const { error: notifErr } = await db.from("notifications").insert({
          recipient_id: pId,
          project_id: projectDbId,
          title: notifTitle,
          message: notifMessage,
          read: false,
        });
        if (!notifErr) notificationSaved = true;
      } catch {
        // Table may not yet be created in schema
      }

      // 2. Persist audit event in task_events
      try {
        await db.from("task_events").insert({
          project_id: projectDbId,
          participant_id: pId,
          event_type: "project_assignment",
          evidence: notifMessage,
          analysis: {
            title: notifTitle,
            message: notifMessage,
            projectName,
            read: false,
            fallbackNotification: !notificationSaved,
          },
        });
      } catch (eventErr) {
        console.warn(`task_events skipped for project assignment of participant ${pId}:`, eventErr.message);
      }

      // 3. Optional Telegram alert if linked
      try {
        const { data: participant } = await db
          .from("participants")
          .select("id, display_name, telegram_chat_id")
          .eq("id", pId)
          .maybeSingle();

        if (participant?.telegram_chat_id) {
          const sender = sendNotification || (async (chatId, text) => {
            const { sendTelegramMessage } = await import("./telegram.js");
            return sendTelegramMessage(chatId, text);
          });
          const sent = await sender(participant.telegram_chat_id, `🔔 ${notifMessage}`);
          if (sent?.message_id) {
            await db.from("telegram_messages").insert({
              direction: "OUTBOUND",
              participant_id: pId,
              telegram_message_id: sent.message_id,
              message_text: `🔔 ${notifMessage}`,
              processing_status: "PROCESSED",
            }).catch(() => null);
          }
        }
      } catch (tgErr) {
        console.warn(`Optional Telegram notification skipped for participant ${pId}:`, tgErr.message);
        // Telegram failure is strictly non-blocking!
      }
    }
  }
}

export async function listNotifications(recipientId = null, { unreadOnly = false } = {}, db = requireDatabase()) {
  const pDbId = recipientId ? await resolveParticipantDbId(recipientId, db) : null;
  try {
    let query = db.from("notifications").select("*");
    if (pDbId != null) query = query.eq("recipient_id", pDbId);
    if (unreadOnly) query = query.eq("read", false);
    query = query.order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    if (data) {
      return data.map((n) => ({
        id: String(n.id),
        recipient_id: asId(n.recipient_id),
        project_id: asId(n.project_id),
        title: n.title,
        message: n.message,
        read: Boolean(n.read),
        created_at: n.created_at,
      }));
    }
  } catch {
    // Fallback to task_events if notifications table is not queryable
  }

  // Fallback via task_events
  try {
    let fallbackQuery = db
      .from("task_events")
      .select("*")
      .eq("event_type", "project_assignment");
    if (pDbId != null) fallbackQuery = fallbackQuery.eq("participant_id", pDbId);
    fallbackQuery = fallbackQuery.order("created_at", { ascending: false });
    const { data: fbData, error: fbError } = await fallbackQuery;

    if (fbError) throw fbError;
    return (fbData || [])
      .filter((ev) => !unreadOnly || !ev.analysis?.read)
      .map((ev) => ({
        id: String(ev.id),
        recipient_id: asId(ev.participant_id),
        project_id: asId(ev.project_id),
        title: ev.analysis?.title || "Project Assignment",
        message: ev.evidence || ev.analysis?.message || "New project assigned to you.",
        read: Boolean(ev.analysis?.read),
        created_at: ev.created_at,
      }));
  } catch (err) {
    console.warn("Could not list notifications:", err.message);
    return [];
  }
}

export async function markNotificationRead(notificationId, recipientId = null, db = requireDatabase()) {
  const pDbId = recipientId ? await resolveParticipantDbId(recipientId, db) : null;
  try {
    let query = db.from("notifications").update({ read: true }).eq("id", notificationId);
    if (pDbId != null) query = query.eq("recipient_id", pDbId);
    const { data, error } = await query.select();
    if (error) throw error;
    if (data && data.length > 0) {
      return { id: String(data[0].id), read: true };
    }
  } catch {
    // Fallback to task_events
  }

  try {
    let updateQuery = db.from("task_events").select("analysis").eq("id", notificationId);
    if (pDbId != null) updateQuery = updateQuery.eq("participant_id", pDbId);
    const { data: evData } = await updateQuery.maybeSingle();
    if (evData) {
      const updatedAnalysis = { ...(evData.analysis || {}), read: true };
      await db.from("task_events").update({ analysis: updatedAnalysis }).eq("id", notificationId);
    }
    return { id: String(notificationId), read: true };
  } catch (err) {
    console.warn("Could not mark notification read:", err.message);
    return { id: String(notificationId), read: true };
  }
}


export async function resolveTaskDbId(value, db = requireDatabase()) {
  if (value == null || value === "null" || value === "undefined") return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const { data: byClientId, error: clientError } = await db
    .from("tasks")
    .select("id")
    .eq("client_id", raw)
    .maybeSingle();
  if (clientError) throw clientError;
  if (byClientId) return byClientId.id;

  if (/^\d+$/.test(raw)) {
    const { data, error } = await db
      .from("tasks")
      .select("id")
      .eq("id", raw)
      .maybeSingle();
    if (error) throw error;
    if (data) return data.id;
  }

  const leadingIdMatch = raw.match(/^([a-zA-Z0-9_\-]+)/);
  if (leadingIdMatch && leadingIdMatch[1] !== raw) {
    const cleanId = leadingIdMatch[1];
    const { data: byCleanClient } = await db
      .from("tasks")
      .select("id")
      .eq("client_id", cleanId)
      .maybeSingle();
    if (byCleanClient) return byCleanClient.id;

    if (/^\d+$/.test(cleanId)) {
      const { data: byCleanNum } = await db
        .from("tasks")
        .select("id")
        .eq("id", cleanId)
        .maybeSingle();
      if (byCleanNum) return byCleanNum.id;
    }
  }

  return null;
}

async function getProjectClientId(projectDbId, db = requireDatabase()) {
  if (projectDbId == null || projectDbId === "null" || projectDbId === "undefined") return null;
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
  const managerDbId = input.manager_id ? await resolveParticipantDbId(input.manager_id, db) : null;
  if (input.id) {
    const { data: existing, error: lookupError } = await db
      .from("projects")
      .select("*, project_members(participant_id)")
      .eq("client_id", input.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      if (input.member_ids) {
        await syncProjectMembers(existing.id, input.member_ids, db);
      }
      return projectPayload(existing);
    }
  }
  const { data, error } = await db
    .from("projects")
    .insert({
      ...(input.id ? { client_id: input.id } : {}),
      name: input.name,
      description: input.description ?? "",
      manager_id: managerDbId,
      start_date: input.start_date ?? null,
      target_date: input.target_date ?? null,
      milestones: input.milestones ?? [],
    })
    .select("*, project_members(participant_id)")
    .single();
  if (error) throw error;
  if (input.member_ids) {
    await syncProjectMembers(data.id, input.member_ids, db);
  }
  return projectPayload(data);
}

export async function updateProject(projectId, input) {
  const db = requireDatabase();
  const id = await resolveProjectDbId(projectId, db);
  if (id == null) return null;
  const updateData = {};
  if ("name" in input) updateData.name = input.name;
  if ("description" in input) updateData.description = input.description;
  if ("manager_id" in input) {
    updateData.manager_id = input.manager_id ? await resolveParticipantDbId(input.manager_id, db) : null;
  }
  if ("start_date" in input) updateData.start_date = input.start_date;
  if ("target_date" in input) updateData.target_date = input.target_date;
  if ("milestones" in input) updateData.milestones = input.milestones;
  updateData.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("projects")
    .update(updateData)
    .eq("id", id)
    .select("*, project_members(participant_id)")
    .maybeSingle();
  if (error) throw error;
  if (input.member_ids) {
    await syncProjectMembers(id, input.member_ids, db);
  }
  return projectPayload(data);
}

export async function listTasks(projectId) {
  const db = requireDatabase();
  let query = db.from("tasks").select("*").order("created_at");
  if (projectId && projectId !== "null" && projectId !== "undefined") {
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
    .select("id, display_name, role, department")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Fetch project memberships so the bot knows which project(s) this participant is on
  const { data: memberships } = await db
    .from("project_members")
    .select("project_id, projects(id, client_id, name)")
    .eq("participant_id", data.id);

  const projects = (memberships || []).map((m) => ({
    id: asId(m.projects?.client_id ?? m.projects?.id ?? m.project_id),
    name: m.projects?.name ?? "",
  }));

  return {
    ...data,
    id: asId(data.id),
    projects,
  };
}

export async function getParticipantByTelegramId(telegramUserId, db = requireDatabase()) {
  const { data, error } = await db
    .from("participants")
    .select("id, display_name, role, department, telegram_chat_id, telegram_user_id, telegram_username")
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
  const db = requireDatabase();
  // Mark previous unreplied followups for this task as REPLIED so only the new one is active
  try {
    await db
      .from("followups")
      .update({ status: "REPLIED", replied_at: new Date().toISOString() })
      .eq("task_id", task._dbId)
      .eq("status", "AWAITING_REPLY");
  } catch {
    // Non-fatal if table update is mocked or restricted
  }

  // Directly insert followup to allow admin requests without 1-hour lockout
  const { data, error } = await db
    .from("followups")
    .insert({
      task_id: task._dbId,
      project_id: task._dbProjectId,
      participant_id: participant.id,
      message_text: text,
      status: "AWAITING_REPLY",
      requested_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    const { data: rpcData, error: rpcError } = await db.rpc("create_followup_if_allowed", {
      p_task_id: task._dbId,
      p_project_id: task._dbProjectId,
      p_participant_id: participant.id,
      p_message_text: text,
      p_max_per_day: config.maxFollowupsPerDay,
    });
    if (rpcError) {
      if (rpcError.message.includes("limit reached") || rpcError.message.includes("within the last hour")) {
        throw Object.assign(new Error(rpcError.message), { status: 429 });
      }
      throw rpcError;
    }
    return { id: rpcData };
  }
  return { id: data.id };
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

  let currentTask = null;
  if (taskDbId != null && db.from) {
    try {
      const { data: tRow } = await db
        .from("tasks")
        .select("id, project_id, status, owner_id")
        .eq("id", taskDbId)
        .maybeSingle();
      currentTask = tRow;
    } catch {
      // Continue if query is not available
    }
  }

  const projectDbId = followup?.project_id ??
    currentTask?.project_id ??
    (taskDbId == null ? null : await getProjectDbIdForTask(taskDbId, db));

  const status = {
    IN_PROGRESS: "IN_PROGRESS",
    BLOCKED: "BLOCKED",
    COMPLETE: "COMPLETE",
  }[analysis.classification];

  const dbStatus = {
    IN_PROGRESS: "in_progress",
    BLOCKED: "blocked",
    COMPLETE: "completed",
  }[analysis.classification];

  try {
    if (db.from) {
      if (taskDbId != null && dbStatus != null) {
        if (currentTask && currentTask.owner_id != null && String(currentTask.owner_id) !== String(participantId)) {
          throw Object.assign(new Error("Unauthorized: Task is not assigned to the participant."), { status: 403 });
        }
        const updatePayload = {
          status: dbStatus,
          blocker: status === "BLOCKED" ? (analysis.blocker || "Blocked") : null,
          updated_at: new Date().toISOString(),
        };
        const { error: taskErr } = await db
          .from("tasks")
          .update(updatePayload)
          .eq("id", taskDbId)
          .eq("owner_id", participantId);
        if (taskErr) throw taskErr;
      }

      const { error: eventErr } = await db.from("task_events").insert({
        project_id: projectDbId,
        task_id: taskDbId,
        participant_id: participantId,
        event_type: "telegram_reply_analysis",
        evidence: reply,
        message_id: messageId,
        analysis,
        previous_status: currentTask?.status ?? null,
        next_status: status ?? null,
      });
      if (eventErr) throw eventErr;

      if (followup?.id) {
        await db
          .from("followups")
          .update({
            status: "REPLIED",
            replied_at: new Date().toISOString(),
          })
          .eq("id", followup.id);
      }

      if (messageId) {
        await db
          .from("telegram_messages")
          .update({
            task_id: taskDbId,
            processing_status: "PROCESSED",
            processing_error: null,
          })
          .eq("id", messageId);
      }
      return;
    }
  } catch (directErr) {
    if (db.rpc) {
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
      return;
    }
    throw directErr;
  }

  if (db.rpc) {
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

export async function updateParticipant(participantId, input, db = requireDatabase()) {
  const pDbId = await resolveParticipantDbId(participantId, db);
  if (pDbId == null) return null;
  const updateData = { updated_at: new Date().toISOString() };
  if (input.display_name !== undefined) updateData.display_name = input.display_name.trim();
  if (input.role !== undefined) updateData.role = input.role.trim();
  if (input.department !== undefined) updateData.department = input.department.trim();

  const { data, error } = await db
    .from("participants")
    .update(updateData)
    .eq("id", pDbId)
    .select("id, display_name, role, department, telegram_user_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  if (input.project_id) {
    const projectDbId = await resolveProjectDbId(input.project_id, db);
    if (projectDbId) {
      await db.from("project_members").upsert({
        project_id: projectDbId,
        participant_id: pDbId,
      }, { onConflict: "project_id,participant_id" });
    }
  }

  return {
    id: asId(data.id),
    display_name: data.display_name,
    role: data.role ?? "",
    department: data.department ?? "",
    telegram_linked: Boolean(data.telegram_user_id),
  };
}

export async function listAllMessages(limit = 100, db = requireDatabase()) {
  const { data, error } = await db
    .from("telegram_messages")
    .select("id, participant_id, task_id, direction, message_text, processing_status, created_at, participants(display_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((msg) => ({
    id: msg.id,
    memberId: asId(msg.participant_id),
    memberName: msg.participants?.display_name ?? "",
    taskId: asId(msg.task_id),
    direction: msg.direction === "INBOUND" ? "in" : "out",
    text: msg.message_text,
    status: msg.processing_status,
    timestamp: msg.created_at,
  }));
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
  if (projectId && projectId !== "null" && projectId !== "undefined") {
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
    .not("status", "in", '("complete","completed","blocked")');
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
      return depStatus === "complete" || depStatus === "completed";
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

export async function organizeProjectMeet(
  projectId,
  { title, meeting_url, agenda = "", organizer_name = "Project Coordinator" },
  db = requireDatabase(),
  sendFn = null,
) {
  const projectDbId = await resolveProjectDbId(projectId, db);
  if (!projectDbId) {
    throw Object.assign(new Error("Project not found."), { status: 404 });
  }

  const { data: project, error: projErr } = await db
    .from("projects")
    .select("id, client_id, name, description")
    .eq("id", projectDbId)
    .single();
  if (projErr) throw projErr;

  const { data: memberships, error: memErr } = await db
    .from("project_members")
    .select("participant_id, participants(id, display_name, telegram_chat_id, telegram_user_id)")
    .eq("project_id", projectDbId);
  if (memErr) throw memErr;

  const sender = sendFn || (async (chatId, text) => {
    const { sendTelegramMessage } = await import("./telegram.js");
    return sendTelegramMessage(chatId, text);
  });

  const meetTitle = title || `${project.name} Team Meeting`;
  const roomTag = String(project.client_id || project.id).toLowerCase().replace(/[^a-z0-9]/g, "");
  const meetUrl = meeting_url || `https://meet.jit.si/projectpilot-${roomTag || "room"}-${Date.now().toString(36)}`;

  const messageText = [
    `🚨 Team Meeting Alert: ${project.name}`,
    ``,
    `👤 Organizer: ${organizer_name}`,
    `📌 Topic: ${meetTitle}`,
    agenda ? `📝 Agenda: ${agenda}` : null,
    ``,
    `🔗 Join Meeting Link:`,
    `${meetUrl}`,
    ``,
    `👉 Please click the link above to join the team call now.`,
  ].filter(Boolean).join("\n");

  const results = [];
  let deliveredCount = 0;

  for (const m of memberships || []) {
    const p = m.participants;
    if (!p) continue;

    if (!p.telegram_chat_id) {
      results.push({ id: String(p.id), name: p.display_name, delivered: false, reason: "No Telegram linked" });
      continue;
    }

    let delivered = false;
    let sentMsgId = null;
    try {
      const sent = await sender(p.telegram_chat_id, messageText);
      sentMsgId = sent?.message_id ?? null;
      delivered = true;
      deliveredCount += 1;
    } catch (sendError) {
      console.warn(`Meeting notification failed for participant ${p.id}:`, sendError.message);
    }

    if (delivered && sentMsgId) {
      try {
        await db.from("telegram_messages").insert({
          direction: "OUTBOUND",
          participant_id: p.id,
          telegram_message_id: sentMsgId,
          message_text: messageText,
          processing_status: "PROCESSED",
        });
      } catch {
        // Non-fatal
      }
    }

    results.push({ id: String(p.id), name: p.display_name, delivered });
  }

  try {
    await db.from("task_events").insert({
      project_id: projectDbId,
      event_type: "team_meeting",
      evidence: `Team meet organized by ${organizer_name}: ${meetTitle}`,
      analysis: {
        title: meetTitle,
        meeting_url: meetUrl,
        agenda,
        organizer: organizer_name,
        deliveredCount,
        totalMembers: memberships?.length || 0,
      },
    });
  } catch (eventErr) {
    console.warn("Failed to log meeting task_event:", eventErr.message);
  }

  return {
    success: true,
    delivered_count: deliveredCount,
    meeting_url: meetUrl,
    recipients: results,
  };
}

export function wouldCreateCycle(existingEdges, prereqId, dependentId) {
  const pId = String(prereqId).trim();
  const dId = String(dependentId).trim();
  if (pId === dId) return true;

  // Build adjacency list: node -> array of its downstream/dependent nodes
  const adj = new Map();
  for (const edge of existingEdges || []) {
    const from = String(edge.prerequisiteTaskId ?? edge.prerequisite_task_id).trim();
    const to = String(edge.dependentTaskId ?? edge.dependent_task_id).trim();
    if (!from || !to) continue;
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push(to);
  }

  // Adding pId -> dId creates a cycle iff there is already a path from dId to pId
  const visited = new Set();
  const queue = [dId];
  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === pId) return true;
    if (!visited.has(curr)) {
      visited.add(curr);
      const neighbors = adj.get(curr) || [];
      for (const next of neighbors) {
        if (!visited.has(next)) queue.push(next);
      }
    }
  }
  return false;
}

export async function analyzeAndInferProjectDependencies(projectId, { db = requireDatabase(), model = null } = {}) {
  const projectDbId = await resolveProjectDbId(projectId, db);
  if (!projectDbId) {
    throw Object.assign(new Error("Project not found."), { status: 404 });
  }

  const { data: project, error: projErr } = await db
    .from("projects")
    .select("id, client_id, name, description, start_date, target_date, milestones")
    .eq("id", projectDbId)
    .single();
  if (projErr) throw projErr;

  const { data: taskRows, error: taskErr } = await db
    .from("tasks")
    .select("id, client_id, project_id, title, description, owner_id, status, acceptance_criteria, priority, deadline, dependencies")
    .eq("project_id", projectDbId);
  if (taskErr) throw taskErr;

  const ownerIds = [...new Set((taskRows || []).map((t) => t.owner_id).filter(Boolean))];
  const participantMap = new Map();
  if (ownerIds.length > 0) {
    const { data: pRows } = await db
      .from("participants")
      .select("id, display_name, role, department")
      .in("id", ownerIds);
    for (const p of pRows || []) {
      participantMap.set(String(p.id), p);
    }
  }

  const enrichedTasks = (taskRows || []).map((t) => {
    const owner = t.owner_id ? participantMap.get(String(t.owner_id)) : null;
    return {
      id: asId(t.client_id ?? t.id),
      _dbId: t.id,
      title: t.title,
      description: t.description || "",
      acceptance_criteria: t.acceptance_criteria || [],
      assigneeName: owner?.display_name || "Unassigned",
      assigneeRole: owner?.role || "",
      status: toApiStatus(t.status),
      priority: t.priority,
      deadline: t.deadline ? String(t.deadline).slice(0, 10) : "",
      dependencies: t.dependencies || [],
    };
  });

  let existingDeps = [];
  try {
    const { data: depRows, error: depErr } = await db
      .from("task_dependencies")
      .select("*")
      .eq("project_id", projectDbId);
    if (!depErr && depRows) existingDeps = depRows;
  } catch {
    // If task_dependencies table is not yet migrated, fall back gracefully
  }

  const taskById = new Map();
  for (const t of taskRows || []) {
    taskById.set(String(t.id), t);
    if (t.client_id) taskById.set(String(t.client_id), t);
  }

  const existingMap = new Map();
  const confirmedEdges = [];

  for (const dep of existingDeps) {
    const key = `${dep.prerequisite_task_id}->${dep.dependent_task_id}`;
    existingMap.set(key, dep);
    if (dep.status === "CONFIRMED") {
      confirmedEdges.push({
        prerequisiteTaskId: dep.prerequisite_task_id,
        dependentTaskId: dep.dependent_task_id,
      });
    }
  }

  for (const t of taskRows || []) {
    for (const prereqRef of t.dependencies || []) {
      const prereqTask = taskById.get(String(prereqRef));
      if (prereqTask) {
        const key = `${prereqTask.id}->${t.id}`;
        if (!existingMap.has(key)) {
          confirmedEdges.push({
            prerequisiteTaskId: prereqTask.id,
            dependentTaskId: t.id,
          });
        }
      }
    }
  }

  const aiResult = await inferDependenciesWithAI(project, enrichedTasks, { model });

  const validatedEdges = [];
  const candidateGraphEdges = [...confirmedEdges];

  for (const proposed of aiResult.dependencies || []) {
    const prereqTask = taskById.get(String(proposed.prerequisiteTaskId));
    const depTask = taskById.get(String(proposed.dependentTaskId));

    if (!prereqTask || !depTask) continue;
    if (prereqTask.project_id !== projectDbId || depTask.project_id !== projectDbId) continue;

    const prereqDbId = prereqTask.id;
    const depDbId = depTask.id;

    if (prereqDbId === depDbId) continue;

    const key = `${prereqDbId}->${depDbId}`;
    const existing = existingMap.get(key);

    if (existing && existing.status === "CONFIRMED") {
      continue;
    }
    if (existing && existing.status === "REJECTED") {
      continue;
    }

    if (wouldCreateCycle(candidateGraphEdges, prereqDbId, depDbId)) {
      console.warn(`Rejected circular dependency proposal: ${prereqTask.title} -> ${depTask.title}`);
      continue;
    }

    candidateGraphEdges.push({
      prerequisiteTaskId: prereqDbId,
      dependentTaskId: depDbId,
    });

    validatedEdges.push({
      project_id: projectDbId,
      prerequisite_task_id: prereqDbId,
      dependent_task_id: depDbId,
      confidence: Math.max(0, Math.min(1, Number(proposed.confidence) || 0.85)),
      explanation: proposed.explanation || "AI-inferred dependency based on deliverables and architectural requirements.",
      evidence: proposed.evidence || "",
      status: "PROPOSED",
      updated_at: new Date().toISOString(),
    });
  }

  if (validatedEdges.length > 0) {
    try {
      await db.from("task_dependencies").upsert(validatedEdges, {
        onConflict: "project_id,prerequisite_task_id,dependent_task_id",
        ignoreDuplicates: false,
      });
    } catch (saveErr) {
      console.warn("Could not upsert to task_dependencies (table may need migration):", saveErr.message);
    }
  }

  try {
    await db.from("task_events").insert({
      project_id: projectDbId,
      event_type: "dependency_analysis",
      evidence: `AI dependency analysis completed. ${validatedEdges.length} dependencies proposed.`,
      analysis: {
        proposedCount: validatedEdges.length,
        summary: aiResult.summary,
        independentTaskIds: aiResult.independentTaskIds,
        proposedEdges: validatedEdges,
      },
    });
  } catch (err) {
    console.warn("task_events dependency_analysis insert warning:", err?.message);
  }

  const allDependencies = await listProjectDependencies(projectId, db);

  return {
    dependencies: allDependencies,
    independentTaskIds: aiResult.independentTaskIds || [],
    summary: aiResult.summary || `Analysis completed for project ${project.name}.`,
  };
}

export async function listProjectDependencies(projectId, db = requireDatabase()) {
  const projectDbId = await resolveProjectDbId(projectId, db);
  if (!projectDbId) return [];

  const { data: tasks, error: tErr } = await db
    .from("tasks")
    .select("id, client_id, title, owner_id, status, deadline, dependencies, created_at, updated_at")
    .eq("project_id", projectDbId);
  if (tErr) throw tErr;

  const taskMap = new Map();
  for (const t of tasks || []) {
    taskMap.set(String(t.id), t);
    if (t.client_id) taskMap.set(String(t.client_id), t);
  }

  let dbDependencies = [];
  try {
    const { data: depRows, error: depErr } = await db
      .from("task_dependencies")
      .select("*")
      .eq("project_id", projectDbId)
      .order("created_at", { ascending: true });
    if (!depErr && depRows && depRows.length > 0) {
      dbDependencies = depRows;
    }
  } catch {
    // If table does not exist yet
  }

  // Fallback: If task_dependencies table is not present, retrieve the latest proposed edges from task_events
  if (dbDependencies.length === 0) {
    try {
      const { data: latestEvent } = await db
        .from("task_events")
        .select("analysis, created_at")
        .eq("project_id", projectDbId)
        .eq("event_type", "dependency_analysis")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: rejectedEvents } = await db
        .from("task_events")
        .select("analysis")
        .eq("project_id", projectDbId)
        .eq("event_type", "dependency_rejected")
        .limit(50);

      const rejectedKeys = new Set(
        (rejectedEvents || [])
          .map((e) => e?.analysis ? `${e.analysis.prerequisiteTaskId}->${e.analysis.dependentTaskId}` : null)
          .filter(Boolean)
      );

      if (latestEvent?.analysis?.proposedEdges) {
        dbDependencies = latestEvent.analysis.proposedEdges
          .filter((e) => !rejectedKeys.has(`${e.prerequisite_task_id}->${e.dependent_task_id}`))
          .map((e) => ({
            id: `prop-${e.prerequisite_task_id}-${e.dependent_task_id}`,
            project_id: projectDbId,
            prerequisite_task_id: e.prerequisite_task_id,
            dependent_task_id: e.dependent_task_id,
            confidence: e.confidence,
            explanation: e.explanation,
            evidence: e.evidence,
            status: "PROPOSED",
            created_at: latestEvent.created_at || new Date().toISOString(),
            updated_at: latestEvent.created_at || new Date().toISOString(),
          }));
      }
    } catch (fallbackErr) {
      console.warn("task_events dependency fallback read warning:", fallbackErr?.message);
    }
  }

  const result = [];
  const seenPairs = new Set();

  for (const dep of dbDependencies) {
    const prereq = taskMap.get(String(dep.prerequisite_task_id));
    const downstream = taskMap.get(String(dep.dependent_task_id));
    const prereqId = prereq ? asId(prereq.client_id ?? prereq.id) : String(dep.prerequisite_task_id);
    const depId = downstream ? asId(downstream.client_id ?? downstream.id) : String(dep.dependent_task_id);
    const pairKey = `${prereqId}->${depId}`;
    seenPairs.add(pairKey);

    result.push({
      id: String(dep.id),
      projectId: asId(projectId),
      prerequisiteTaskId: prereqId,
      prerequisiteTitle: prereq?.title || "Prerequisite Task",
      prerequisiteStatus: prereq ? fromDbStatus(prereq.status) : "Pending",
      prerequisiteDeadline: prereq?.deadline ? String(prereq.deadline).slice(0, 10) : "",
      dependentTaskId: depId,
      dependentTitle: downstream?.title || "Dependent Task",
      dependentStatus: downstream ? fromDbStatus(downstream.status) : "Pending",
      dependentDeadline: downstream?.deadline ? String(downstream.deadline).slice(0, 10) : "",
      confidence: Number(dep.confidence) || 0.85,
      explanation: dep.explanation || "",
      evidence: dep.evidence || "",
      status: dep.status,
      createdAt: dep.created_at,
      updatedAt: dep.updated_at,
    });
  }

  for (const downstream of tasks || []) {
    const downstreamId = asId(downstream.client_id ?? downstream.id);
    for (const prereqRef of downstream.dependencies || []) {
      const prereq = taskMap.get(String(prereqRef));
      const prereqId = prereq ? asId(prereq.client_id ?? prereq.id) : String(prereqRef);
      const pairKey = `${prereqId}->${downstreamId}`;
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        result.push({
          id: `dep-${prereqId}-${downstreamId}`,
          projectId: asId(projectId),
          prerequisiteTaskId: prereqId,
          prerequisiteTitle: prereq?.title || "Prerequisite Task",
          prerequisiteStatus: prereq ? fromDbStatus(prereq.status) : "Pending",
          prerequisiteDeadline: prereq?.deadline ? String(prereq.deadline).slice(0, 10) : "",
          dependentTaskId: downstreamId,
          dependentTitle: downstream.title,
          dependentStatus: fromDbStatus(downstream.status),
          dependentDeadline: downstream.deadline ? String(downstream.deadline).slice(0, 10) : "",
          confidence: 1.0,
          explanation: "Manager confirmed task dependency.",
          evidence: "Configured directly in task dependencies.",
          status: "CONFIRMED",
          createdAt: downstream.created_at,
          updatedAt: downstream.updated_at,
        });
      }
    }
  }

  return result;
}

export async function confirmProjectDependency(projectId, { prerequisiteTaskId, dependentTaskId }, db = requireDatabase()) {
  const projectDbId = await resolveProjectDbId(projectId, db);
  if (!projectDbId) throw Object.assign(new Error("Project not found."), { status: 404 });

  const prereqId = await resolveTaskDbId(prerequisiteTaskId, db);
  const depId = await resolveTaskDbId(dependentTaskId, db);
  if (!prereqId || !depId) throw Object.assign(new Error("Task not found."), { status: 404 });
  if (prereqId === depId) throw Object.assign(new Error("A task cannot depend on itself."), { status: 400 });

  const { data: tasks, error: tErr } = await db
    .from("tasks")
    .select("id, client_id, project_id, title, dependencies")
    .in("id", [prereqId, depId]);
  if (tErr) throw tErr;
  if (!tasks || tasks.length < 2) throw Object.assign(new Error("Both tasks must belong to the project."), { status: 400 });
  if (tasks.some((t) => t.project_id !== projectDbId)) {
    throw Object.assign(new Error("Cross-project dependencies are not allowed."), { status: 400 });
  }

  const prereqTask = tasks.find((t) => t.id === prereqId);
  const depTask = tasks.find((t) => t.id === depId);

  const currentDeps = await listProjectDependencies(projectId, db);
  const confirmedDeps = currentDeps.filter((d) => d.status === "CONFIRMED");
  if (wouldCreateCycle(confirmedDeps, prereqId, depId)) {
    throw Object.assign(new Error("Confirming this dependency would create a circular dependency chain."), { status: 400 });
  }

  let savedRecord = null;
  try {
    const { data: updated, error: upErr } = await db
      .from("task_dependencies")
      .upsert({
        project_id: projectDbId,
        prerequisite_task_id: prereqId,
        dependent_task_id: depId,
        status: "CONFIRMED",
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "project_id,prerequisite_task_id,dependent_task_id",
      })
      .select()
      .single();
    if (!upErr && updated) savedRecord = updated;
  } catch (err) {
    console.warn("task_dependencies upsert failed:", err.message);
  }

  const currentDependencies = depTask.dependencies || [];
  const prereqRef = prereqTask.client_id || String(prereqTask.id);
  if (!currentDependencies.includes(prereqRef) && !currentDependencies.includes(String(prereqTask.id))) {
    const updatedDependencies = [...currentDependencies, prereqRef];
    await db
      .from("tasks")
      .update({ dependencies: updatedDependencies, updated_at: new Date().toISOString() })
      .eq("id", depId);
  }

  try {
    await db.from("task_events").insert({
      project_id: projectDbId,
      task_id: depId,
      event_type: "dependency_confirmed",
      evidence: `Dependency confirmed: '${prereqTask.title}' -> '${depTask.title}'`,
      analysis: {
        prerequisiteTaskId: prereqRef,
        prerequisiteTitle: prereqTask.title,
        dependentTaskId: depTask.client_id || String(depTask.id),
        dependentTitle: depTask.title,
      },
    });
  } catch {
    // Non-fatal
  }

  return {
    id: savedRecord?.id ?? `dep-${prereqId}-${depId}`,
    projectId: asId(projectId),
    prerequisiteTaskId: prereqRef,
    prerequisiteTitle: prereqTask.title,
    dependentTaskId: depTask.client_id || String(depTask.id),
    dependentTitle: depTask.title,
    status: "CONFIRMED",
  };
}

export async function rejectProjectDependency(projectId, { prerequisiteTaskId, dependentTaskId }, db = requireDatabase()) {
  const projectDbId = await resolveProjectDbId(projectId, db);
  if (!projectDbId) throw Object.assign(new Error("Project not found."), { status: 404 });

  const prereqId = await resolveTaskDbId(prerequisiteTaskId, db);
  const depId = await resolveTaskDbId(dependentTaskId, db);
  if (!prereqId || !depId) throw Object.assign(new Error("Task not found."), { status: 404 });

  const { data: tasks } = await db
    .from("tasks")
    .select("id, client_id, title, dependencies")
    .in("id", [prereqId, depId]);
  const prereqTask = tasks?.find((t) => t.id === prereqId);
  const depTask = tasks?.find((t) => t.id === depId);

  try {
    await db
      .from("task_dependencies")
      .update({ status: "REJECTED", updated_at: new Date().toISOString() })
      .eq("project_id", projectDbId)
      .eq("prerequisite_task_id", prereqId)
      .eq("dependent_task_id", depId);
  } catch (err) {
    console.warn("task_dependencies update failed:", err.message);
  }

  if (depTask) {
    const prereqRef1 = prereqTask?.client_id;
    const prereqRef2 = String(prereqId);
    const updated = (depTask.dependencies || []).filter((d) => d !== prereqRef1 && d !== prereqRef2);
    if (updated.length !== (depTask.dependencies || []).length) {
      await db
        .from("tasks")
        .update({ dependencies: updated, updated_at: new Date().toISOString() })
        .eq("id", depId);
    }
  }

  try {
    await db.from("task_events").insert({
      project_id: projectDbId,
      task_id: depId,
      event_type: "dependency_rejected",
      evidence: `Dependency rejected: '${prereqTask?.title || prereqId}' -> '${depTask?.title || depId}'`,
      analysis: {
        prerequisiteTaskId: prereqId,
        dependentTaskId: depId,
      },
    });
  } catch {
    // Non-fatal
  }

  return {
    projectId: asId(projectId),
    prerequisiteTaskId,
    dependentTaskId,
    status: "REJECTED",
  };
}

export async function deleteProjectDependency(projectId, { prerequisiteTaskId, dependentTaskId }, db = requireDatabase()) {
  const projectDbId = await resolveProjectDbId(projectId, db);
  if (!projectDbId) throw Object.assign(new Error("Project not found."), { status: 404 });

  const prereqId = await resolveTaskDbId(prerequisiteTaskId, db);
  const depId = await resolveTaskDbId(dependentTaskId, db);
  if (!prereqId || !depId) return { success: true };

  try {
    await db
      .from("task_dependencies")
      .delete()
      .eq("project_id", projectDbId)
      .eq("prerequisite_task_id", prereqId)
      .eq("dependent_task_id", depId);
  } catch {
    // Non-fatal
  }

  const { data: depTask } = await db
    .from("tasks")
    .select("id, client_id, dependencies")
    .eq("id", depId)
    .maybeSingle();

  if (depTask) {
    const prereqRef = String(prerequisiteTaskId);
    const prereqDbRef = String(prereqId);
    const updated = (depTask.dependencies || []).filter((d) => d !== prereqRef && d !== prereqDbRef);
    if (updated.length !== (depTask.dependencies || []).length) {
      await db
        .from("tasks")
        .update({ dependencies: updated, updated_at: new Date().toISOString() })
        .eq("id", depId);
    }
  }

  return { success: true };
}

