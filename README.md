# ProjectPilot — AI Group Project Coordinator

ProjectPilot helps delivery teams request task updates, receive actual Telegram replies, identify blockers, and keep task status evidence visible in the existing React dashboard.

The repository has a TanStack Start/Vite React frontend and a Node/Express backend. Demo data remains local in the browser; real Telegram and Gemini processing use the backend and Supabase when configured. The Telegram bot token, Gemini key, and Supabase service-role key are never sent to the browser.

## What is implemented

- Existing React dashboard and local demo mode are preserved.
- Express API for projects, tasks, participants, task events, reports, and follow-up requests.
- Coordinator API-key protection for all non-health API routes.
- LangGraph workflow using Gemini structured output validated with Zod.
- Deterministic rules prevent unclear replies, future promises, and unsupported completion claims from overwriting task status.
- Supabase PostgreSQL schema with RLS enabled, task history, Telegram message deduplication, and an atomic status/event RPC.
- Telegram long polling with one-time participant linking, `/tasks`, `/report`, and task update replies.
- Team page registration flow, acceptance-criteria field, task/project API synchronization, and Telegram link-status refresh.
- Health reports only whether services are configured; it does not reveal credentials.

## Architecture

```text
React dashboard
  ├── project/task/participant actions ── authenticated Express API
  └── follow-up button ────────────────── Express ── Telegram Bot API
                                                    │
Participant Telegram reply ── long polling ────────┘
                                  │
                            LangGraph workflow
                         Gemini + Zod validation
                                  │
                     deterministic status guard
                                  │
                Supabase message + event + task update
                                  │
                 dashboard refresh / task evidence
```

The backend's service-role key is trusted server-side only. Row Level Security is enabled on the tables; no public/anonymous policies are created. The backend is the sole database access path and protects coordinator operations with `COORDINATOR_API_KEY`.

## Requirements and installation

- Node.js 20 or newer.
- A Supabase project.
- A Google AI Studio API key.
- A Telegram bot token from the bot you already created.

From the repository root in Windows PowerShell:

```powershell
npm install --legacy-peer-deps
Push-Location backend
npm install
Copy-Item .env.example .env
Pop-Location
```

`backend/.env.example` is a template only. Add real credentials to `backend/.env` and do not commit that file. Create a coordinator key locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Fill in these values in `backend/.env`:

```dotenv
PORT=3001
FRONTEND_ORIGIN=http://localhost:8080
COORDINATOR_API_KEY=<generated-random-value>
GOOGLE_API_KEY=<Google AI Studio key>
GEMINI_MODEL=gemini-2.5-flash
SUPABASE_URL=<Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service-role key>
TELEGRAM_BOT_TOKEN=<existing bot token>
MAX_FOLLOWUPS_PER_DAY=5
```

Use the Supabase **service-role** key only in this backend environment. Never add it or the Gemini/Telegram keys to a `VITE_` variable. Configure `FRONTEND_ORIGIN` with the exact origin printed by Vite when the frontend starts (this workspace commonly uses `http://localhost:8080`; use the port Vite actually prints). Multiple allowed origins can be comma-separated.

## Supabase setup

1. Stop the backend so no writes occur while sequences and schema are updated.
2. Back up the Supabase project, then open its SQL Editor.
3. Run [`backend/sql/setup.sql`](./backend/sql/setup.sql) in full.
4. Copy the project URL and service-role key into `backend/.env`.

The setup supports the existing bigint primary keys in this project: it preserves the IDs and rows, adds generated ID defaults where missing, and adds the app-specific columns plus stable `client_id` references for dashboard-created projects/tasks. The backend maps the dashboard's local IDs to these database records. It does not rename or drop the existing `task_updates` table; this Telegram integration writes messages to `telegram_messages` and audit records to `task_events`.

Back up the database before applying schema changes. Review the SQL in the Supabase dashboard first and run it against the exact project URL configured in `backend/.env`. The script is designed to be rerunnable, enables RLS without public policies, creates the indexes, and installs the transactional functions used for follow-up limits and reply decisions. After running it, restart the backend so PostgREST's schema cache is refreshed.

## Run the app

Open two PowerShell terminals from the repository root.

Terminal 1 — backend:

```powershell
Push-Location backend
npm run dev
```

Terminal 2 — frontend:

```powershell
npm run dev
```

In the dashboard's **Settings** page:

1. Set Backend base URL to `http://localhost:3001`.
2. Enter the same `COORDINATOR_API_KEY` used in `backend/.env`.
3. Select **Re-check** and confirm database, Telegram, and API-key configuration.

The coordinator key is held in the browser tab's `sessionStorage` and is sent only as an API authorization header. It is not a Supabase, Gemini, or Telegram credential. Do not use this lightweight shared-key setup as a substitute for a production user identity provider.

## Live Telegram team workflow

The bot uses Telegram **long polling**. While the backend process is running and connected to Telegram, it receives private messages and handles them as they arrive (usually within seconds). This is live message handling, not a scheduled batch job. Keep the backend terminal/process running; closing it, stopping the computer, losing network access, or running another poller with the same bot token interrupts service.

### Connect each team member

1. Start the backend and frontend as shown above. Check the backend terminal for `Telegram polling started for @...` and open **Settings** in the dashboard. Set the backend URL to `http://localhost:3001`, enter the coordinator key, and re-check the connection. Settings distinguishes an active poller from a configured bot; a **polling conflict** means another process is using the same token.
2. Create or select the project. The project must exist in Supabase before participant registration; when registering from a local demo project, the dashboard syncs its project details first.
3. Open **Team**. Register **each person separately** against the project. Each person gets their own participant record and one-time Telegram deep link, valid for 30 minutes. The page also displays the bot's public URL (`https://t.me/<bot-username>`).
4. Send each person their personal link privately (do not post it in a group). Opening the link launches the bot and submits their one-time `/start` code. Each person must link their own Telegram account; sharing a link lets the first account redeem it.
5. Select **Refresh Telegram status** in Team. The linked status should update for each registered person.

### Run a two-way task conversation

1. Create a task and assign it to a registered backend participant who has linked Telegram. Add acceptance criteria for work that should not be marked complete without evidence.
2. Open the task and choose **Request update**. Review/edit the message and send it. This sends a real Telegram DM to that task's assignee; it does not broadcast to the whole project.
3. The assignee replies to the bot in their private chat. They can reply directly to the request or send an update naming the task. The bot processes incoming text using the assigned tasks/follow-ups, Gemini analysis, and deterministic safety checks, then responds in Telegram.
4. The backend records the message and analysis in Supabase. A clear progress, blocker, or evidence-backed completion can update task status; uncertain replies ask for clarification and do not change status.
5. Keep the task detail open. The dashboard automatically polls the backend every three seconds for current status, Telegram messages, and activity. **Refresh** remains available for an immediate manual check. Team link status refreshes from **Team**.

### Commands team members can use

- `/start <code>` — link their Telegram account using the coordinator-issued one-time code.
- `/tasks` — list their assigned open tasks.
- `/report` — show a personal summary of assigned/open/blocked/completed tasks.
- A normal text message — report progress, completion evidence, or a blocker. If multiple tasks could match, name the task or reply directly to the relevant update request; the bot asks for clarification when it cannot safely tell.

The bot currently handles **private chats only**. It does not join project group chats, broadcast announcements, send unsolicited/scheduled reminders, or let one member view another member's tasks. Coordinators initiate task conversations using **Request update**; assign tasks and issue separate registration links for each person. The dashboard polls only the open task view, not every Telegram conversation globally. A polling conflict is retried every 10 seconds so the bot can recover after the other poller stops; Settings shows the retry state. For a public deployment, run one secured long-lived backend worker or configure a secured Telegram webhook; never run multiple long-polling instances with the same bot token.

### Confirm the Supabase schema before testing

The health endpoint reports whether environment values are present and whether Telegram polling is active; it does not verify that the database schema matches this app. Run the full, current [`backend/sql/setup.sql`](./backend/sql/setup.sql) in the **same Supabase project whose URL is in `backend/.env`**, then restart the backend. Existing bigint IDs are retained; the API maps task `owner_id` to its `assignee_id` field and accepts the schema's lowercase task statuses.

The migration adds missing participant Telegram/link fields, task description/criteria/dependencies, project milestones, participant timestamps, and project/task `client_id` columns. It also makes participant Telegram chat IDs nullable until a member links their account. A populated `task_updates` table is left untouched. Do not manually rename/drop tables or columns. If your actual constraints or foreign-key types differ from the schema shown here, stop and back up the database before adapting the migration.

## API overview

All endpoints except `GET /api/health` require `X-Coordinator-Key`.

- `GET /api/health`
- `GET, POST /api/projects`; `PATCH /api/projects/:id`
- `GET, POST /api/tasks`; `PATCH, DELETE /api/tasks/:id`
- `GET /api/tasks/:id/events`
- `GET /api/tasks/:id/messages`
- `POST /api/tasks/:id/request-update`
- `GET, POST /api/participants`
- `GET /api/projects/:id/report`

Request bodies are validated and bounded. Follow-ups are limited per participant per day and per task per hour. Duplicate Telegram update IDs are rejected by a database uniqueness constraint. Database and delivery errors are surfaced to the API caller; secrets and stack traces are not returned.

## Tests and checks

```powershell
Push-Location backend
npm test
npm run check
Pop-Location
npm test
npm run build
npm run lint
```

Backend unit/integration checks mock model/database boundaries and require no credentials. The full Telegram + Gemini + Supabase demonstration requires real credentials and was not exercised by the automated tests.

## Deploy the backend on Render

The backend uses Telegram long polling, so deploy it as one always-on web service. The repository's [`render.yaml`](./render.yaml) defines a Render Blueprint with the backend root directory, health check, and secret variables left for secure entry in Render. Its `starter` service plan is paid; do not change it to a free instance for the Telegram bot because free web services can spin down while idle.

1. Rotate any credentials that were shared in chat or committed accidentally. Do not commit `backend/.env` or paste secrets into source files.
2. Sign in to Render and create a **New + > Blueprint** from this GitHub repository, using `render.yaml` at the repository root.
3. During Blueprint setup, enter fresh values for `COORDINATOR_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, and `FRONTEND_ORIGIN`. For `FRONTEND_ORIGIN`, enter the exact origin of the dashboard that will call this backend (scheme and host, without a trailing slash; comma-separate multiple origins). Enter secrets only in Render's environment-variable form. `GOOGLE_API_KEY` is optional; add it in the Render service's environment settings if AI reply analysis is needed.
4. Confirm the paid service plan and create the service. Keep exactly one instance running for this bot token; multiple instances can conflict while polling Telegram.
5. After deployment, open `https://<your-service>.onrender.com/api/health`. Check `status: "ok"`, `telegram.polling: true`, and `database.configured: true`. Health only reports configuration/runtime flags, not that every Supabase query succeeds.
6. In the dashboard's **Settings**, set Backend base URL to `https://<your-service>.onrender.com` and enter the same `COORDINATOR_API_KEY` value. The dashboard must itself be reachable at the origin configured as `FRONTEND_ORIGIN`.
7. Share the backend URL with trusted teammates as needed. The API is internet-reachable, but coordinator endpoints still require the key. This project does not yet have per-user login or role authorization; do not distribute the shared key broadly.

## Limitations and deployment notes

- The browser retains the existing demo-first local data store. New/edited projects and tasks sync to the backend when it is connected; old demo records are not automatically bulk-imported.
- Create/register a project participant in Team before assigning real backend tasks. Existing sample teammates are illustrative records, not registered Telegram identities.
- Follow-ups are coordinator-triggered; no scheduled reminder worker is enabled. A locally running backend cannot process anything while the computer is off.
- Telegram uses long polling. Keep the deployed backend as a single continuously running instance; do not run multiple pollers with one bot token.
- The project has no full login/role-management provider. The shared coordinator key is suitable only for a controlled demo/trusted deployment; use authenticated user sessions and per-role authorization before exposing the API publicly.
- Gemini estimates are not guarantees. Ambiguous analysis is recorded for audit and does not replace the current task status.
- If Gemini is unavailable, the message is retained and the bot reports the analysis failure; no status update is claimed as successful.

## Troubleshooting

- **Backend health is unreachable:** confirm the backend is running on port 3001 and the dashboard URL is exactly `http://localhost:3001`.
- **Settings says configured but Team/task database requests fail:** health checks only check configuration flags. Review the backend terminal error, confirm the `SUPABASE_URL` project matches the project where setup SQL was run, and re-run the current additive setup script if the expected columns or functions are absent.
- **API returns 401:** the Settings page coordinator key must exactly match `COORDINATOR_API_KEY` in `backend/.env`; re-check after changing it.
- **API returns a Supabase configuration error:** set both Supabase environment values and restart the backend. A configured URL/key does not mean the migration has been run.
- **Participant registration fails:** create/select a project first, run the SQL setup, and ensure the coordinator key is authorized.
- **Telegram bot gives no response:** start exactly one backend poller with `TELEGRAM_BOT_TOKEN` and working Supabase schema. Confirm the participant used `/start <code>` in a private chat and that the one-time code has not expired. A Telegram `409 Conflict` from `getUpdates` usually means another process is polling with the same token; stop the duplicate and restart one backend.
- **A message is recorded but not analyzed:** confirm `GOOGLE_API_KEY` is configured, then ask the participant to send a fresh update after Gemini is available. Failed incoming messages are not silently retried or re-applied.
- **The dashboard still shows the old task state:** open the task detail and select **Refresh**. The dashboard currently refreshes on demand rather than using realtime subscriptions.
- **A task cannot be assigned or followed up:** only backend-registered project participants can be assigned to synced tasks, and the participant must link their own Telegram account before a real follow-up can be delivered.
