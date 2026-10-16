/**
 * Backend API client — the ONLY place the frontend talks to the future
 * FastAPI backend. Secrets (Telegram bot token, LLM keys) live on the backend.
 * This module never calls Telegram directly.
 */
export class BackendNotConfiguredError extends Error {
  constructor() {
    super("Backend URL is not configured. Set it in Settings or VITE_PROJECTPILOT_API_URL.");
  }
}

export function resolveBackendUrl(settingsUrl: string): string {
  const env = (import.meta.env.VITE_PROJECTPILOT_API_URL as string | undefined) ?? "";
  return (settingsUrl || env).replace(/\/$/, "");
}

async function call<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  if (!base) throw new BackendNotConfiguredError();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (e) {
    throw new Error(`Could not reach backend at ${base}: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Backend error [${res.status}]: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface HealthResponse {
  status: "ok";
  telegram: { configured: boolean; bot_username?: string };
  llm: { configured: boolean };
}
export interface RequestUpdateResponse {
  message_id: string;
  delivery: "queued" | "sent" | "delivered" | "failed";
  error?: string;
}

export const api = {
  health: (base: string) => call<HealthResponse>(base, "/api/health"),
  requestUpdate: (base: string, taskId: string, body: { member_id: string; text: string }) =>
    call<RequestUpdateResponse>(base, `/api/tasks/${encodeURIComponent(taskId)}/request-update`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
