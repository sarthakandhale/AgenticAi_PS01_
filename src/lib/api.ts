/**
 * Backend API client — the only place the frontend talks to the Node backend.
 * Telegram and model credentials stay on the server.
 * This module never calls Telegram directly.
 */
export class BackendNotConfiguredError extends Error {
  constructor() {
    super("Backend URL is not configured. Set it in Settings or VITE_PROJECTPILOT_API_URL.");
  }
}

export function resolveBackendUrl(settingsUrl: string): string {
  const env = (import.meta.env["VITE_PROJECTPILOT_API_URL"] as string | undefined) ?? "";
  return (settingsUrl || env).replace(/\/$/, "");
}

async function call<T>(base: string, path: string, init?: RequestInit, coordinatorKey = ""): Promise<T> {
  if (!base) throw new BackendNotConfiguredError();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(coordinatorKey ? { "X-Coordinator-Key": coordinatorKey } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    throw new Error(`Could not reach backend at ${base}: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Backend error [${res.status}]: ${body || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface HealthResponse {
  status: "ok";
  telegram: {
    configured: boolean;
    polling?: boolean;
    polling_retrying?: boolean;
    polling_error?: "CONFLICT" | "FAILED";
    bot_username?: string;
  };
  llm: { configured: boolean };
  database?: { configured: boolean };
  coordinatorAuth?: { configured: boolean };
}
export interface RequestUpdateResponse {
  message_id: string;
  followup_id?: string;
  delivery: "queued" | "sent" | "delivered" | "failed";
  error?: string;
}
export interface BackendTask {
  id: string;
  project_id: string;
  title: string;
  description: string;
  assignee_id: string | null;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETE";
  acceptance_criteria: string[];
  priority: "Low" | "Medium" | "High" | "Critical";
  due_date: string | null;
  dependencies: string[];
  blocker: string | null;
  next_action: string;
  created_at: string;
  updated_at: string;
}
export interface BackendMessage {
  id: string;
  participant_id: string | null;
  direction: "INBOUND" | "OUTBOUND";
  message_text: string;
  processing_status: "RECEIVED" | "PROCESSED" | "FAILED";
  created_at: string;
}
export interface BackendEvent {
  id: string;
  event_type: string;
  evidence: string | null;
  previous_status: string | null;
  next_status: string | null;
  analysis: { classification?: string; explanation?: string } | null;
  created_at: string;
}

export const api = {
  health: (base: string) => call<HealthResponse>(base, "/api/health"),
  requestUpdate: (base: string, taskId: string, body: { member_id: string; text: string }, key = "") =>
    call<RequestUpdateResponse>(base, `/api/tasks/${encodeURIComponent(taskId)}/request-update`, {
      method: "POST",
      body: JSON.stringify(body),
    }, key),
  getTask: (base: string, id: string, key = "") =>
    call<{ task: BackendTask }>(base, `/api/tasks/${encodeURIComponent(id)}`, undefined, key),
  getTaskMessages: (base: string, id: string, key = "") =>
    call<{ messages: BackendMessage[] }>(base, `/api/tasks/${encodeURIComponent(id)}/messages`, undefined, key),
  getTaskEvents: (base: string, id: string, key = "") =>
    call<{ events: BackendEvent[] }>(base, `/api/tasks/${encodeURIComponent(id)}/events`, undefined, key),
  createProject: (base: string, body: Record<string, unknown>, key = "") =>
    call<{ project: unknown }>(base, "/api/projects", { method: "POST", body: JSON.stringify(body) }, key),
  updateProject: (base: string, id: string, body: Record<string, unknown>, key = "") =>
    call<{ project: unknown }>(base, `/api/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }, key),
  listProjects: (base: string, key = "") =>
    call<{ projects: Array<{ id: string }> }>(base, "/api/projects", undefined, key),
  createTask: (base: string, body: Record<string, unknown>, key = "") =>
    call<{ task: unknown }>(base, "/api/tasks", { method: "POST", body: JSON.stringify(body) }, key),
  updateTask: (base: string, id: string, body: Record<string, unknown>, key = "") =>
    call<{ task: unknown }>(base, `/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }, key),
  deleteTask: (base: string, id: string, key = "") =>
    call<void>(base, `/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }, key),
  registerParticipant: (base: string, body: Record<string, unknown>, key = "") =>
    call<{ participant: { id: string; display_name: string; role: string; department: string; telegram_link_code: string } }>(
      base,
      "/api/participants",
      { method: "POST", body: JSON.stringify(body) },
      key,
    ),
  listParticipants: (base: string, key = "") =>
    call<{
      participants: Array<{
        id: string;
        display_name: string;
        role: string;
        department: string;
        telegram_linked: boolean;
        project_members: Array<{ project_id: string }>;
      }>;
    }>(base, "/api/participants", undefined, key),
};
