# ProjectPilot — Full Repository Audit, Documentation and Implementation Plan

**Auditor:** Senior Software Architect & Technical Lead  
**Audit Date:** October 2026  
**Repository:** `Project_pilot` (Workspace: `c:\Users\ASUS\OneDrive\Desktop\projecthack`)  
**Scope:** Full codebase audit (Frontend, Backend, Telegram, AI Agent, Supabase SQL, Tests, and Configurations)  
**Status:** Audit & Documentation Phase (Read-Only Analysis)

---

## Executive Summary & Critical Architectural Findings

### 1. The "Python Backend" Discrepancy
* **Context Expectation:** The team assumed a Python backend exists, including an entry point at `backend/app.py`.
* **Codebase Reality:** **There is NO Python backend, NO `app.py`, NO `requirements.txt`, and NO Python source files anywhere in the git history or working directory.**
* **Actual Backend Stack:** The backend is written entirely in **Node.js (ES Modules)** using Express 5, LangGraph (`@langchain/langgraph`), Google Gemini (`@langchain/google-genai`), Supabase JS (`@supabase/supabase-js`), and grammY (`grammy`).
* **Git History Origin:** Commit `e6819be1f630eb1af595d788c12d4396a7823cef` (*"Connect Telegram team workflow to dashboard"*) introduced the complete Node.js backend (`server.js`, `agent.js`, `taskService.js`, `telegram.js`, `setup.sql`, and 22 unit tests).
* **Implication:** The team does not need to reconcile Python and Node.js. The active backend is already unified in Node.js/JavaScript with passing test suites.

### 2. Operational Health & Test Verification
* **Frontend:** TanStack Start / Vite development server compiles and serves on `http://localhost:8080` (HTTP 200). `vitest` unit test suite passes (1/1 test).
* **Backend:** Express API runs on port 3001. Native Node test runner (`node --test`) executes 22 backend tests with **22 passing, 0 failing**.
* **Integrations:**
  - Database, LLM, and Telegram services fail safely and report configuration state gracefully when environment variables are unset.
  - No credentials or API keys were leaked in source code or client bundles.

---

## 1. Repository Inventory & File Structure

```text
c:\Users\ASUS\OneDrive\Desktop\projecthack\Project_pilot
├── .lovable/
│   └── project.json              # Lovable schema & template metadata
├── backend/
│   ├── db/
│   │   └── supabase.js           # Supabase client factory & connection guard
│   ├── services/
│   │   ├── taskService.js        # Data access layer, ID mapping, and RPC callers
│   │   └── telegram.js           # grammY bot lifecycle, polling/webhook, command handlers
│   ├── sql/
│   │   └── setup.sql             # Complete PostgreSQL schema, RLS, indexes, and RPC functions
│   ├── test/
│   │   ├── agent.test.js         # 13 tests: deterministic classification & prompt guards
│   │   ├── server.test.js        # 4 tests: auth, health endpoints, CORS, payload validation
│   │   └── services.test.js      # 5 tests: legacy status mapping, deduplication, error handling
│   ├── .env.example              # Template for server-only environment variables
│   ├── agent.js                  # LangGraph StateGraph & Gemini structured output validation
│   ├── config.js                 # Environment variable validation & config export
│   ├── package.json              # Node.js Express/LangGraph backend manifest
│   └── server.js                 # Express server, route handlers, error wrappers, graceful shutdown
├── public/
│   ├── favicon.ico
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── pp/                   # ProjectPilot application domain components
│   │   │   ├── activity-list.tsx # Audit and activity feed renderer
│   │   │   ├── app-shell.tsx     # Navigation sidebar, header, project switcher
│   │   │   ├── badges.tsx        # Status, priority, and health badges
│   │   │   ├── page.tsx          # PageHeader, Panel, Stat cards, Empty state
│   │   │   ├── project-dialog.tsx# Create/edit project modal dialog
│   │   │   ├── request-update.tsx# "Request update" dialog triggering backend Telegram DM
│   │   │   ├── task-dialog.tsx   # Create/edit task dialog with acceptance criteria
│   │   │   ├── task-sheet.tsx    # Slide-over task detail drawer with 3s live polling
│   │   │   └── task-table.tsx    # Task table and row rendering
│   │   └── ui/                   # Shadcn/Radix UI primitive components
│   ├── hooks/
│   │   └── use-mobile.tsx        # Viewport responsiveness hook
│   ├── lib/
│   │   ├── api.ts                # Frontend HTTP client (strictly talks to :3001)
│   │   ├── demo-data.ts          # Sample portfolio data with dynamic relative dates
│   │   ├── rules.ts              # Deterministic risk evaluation, cycles, stats calculation
│   │   ├── store.tsx             # React Context / LocalStorage / Backend sync orchestrator
│   │   ├── types.ts              # Core TypeScript interfaces and domain models
│   │   └── utils.ts              # Styling helpers (clsx, twMerge)
│   ├── routes/
│   │   ├── __root.tsx            # Root layout wrapper (AppShell, Tooltip, Sonner)
│   │   ├── index.tsx             # Overview dashboard route (/)
│   │   ├── projects.tsx          # Projects layout
│   │   ├── projects.index.tsx    # Projects portfolio list
│   │   ├── projects.$projectId.tsx # Project detail & milestone progress
│   │   ├── tasks.tsx             # Tasks board (Table & Kanban)
│   │   ├── coordinator.tsx       # AI Coordinator proposals view
│   │   ├── blockers.tsx          # Blocker Radar view
│   │   ├── dependencies.tsx      # Dependency chain & rule findings
│   │   ├── activity.tsx          # Activity audit history
│   │   ├── reports.tsx           # Status report generation & copy/print
│   │   ├── team.tsx              # Team member management & Telegram registration
│   │   └── settings.tsx          # System settings & integration configuration
│   ├── routeTree.gen.ts          # TanStack Router generated tree
│   ├── router.tsx                # TanStack Router setup
│   ├── server.ts                 # TanStack Start SSR entry & error wrapper
│   ├── start.ts                  # Client hydration bootstrap
│   └── styles.css                # Tailwind CSS v4 directives & theme variables
├── render.yaml                   # Render deployment blueprint for background worker & web service
├── vite.config.ts                # Vite config using @lovable.dev/vite-tanstack-config
└── package.json                  # Frontend manifest (React 19, TanStack Start/Router, Tailwind 4)
```

---

## 2. Feature Implementation Status Matrix

| Feature | Status | Evidence (Files, Functions, API, Tests) |
| :--- | :--- | :--- |
| **Participant Telegram Deep Linking** | `IMPLEMENTED AND VERIFIED` | `backend/services/taskService.js` (`registerParticipant`, `linkTelegramAccount`), `backend/services/telegram.js` (`/start <code>`), `backend/sql/setup.sql` (hash storage, 30m expiry). Verified in `backend/test/services.test.js`. |
| **Telegram Inbound Deduplication** | `IMPLEMENTED AND VERIFIED` | `backend/sql/setup.sql` (unique index on `update_id`), `backend/services/taskService.js` (`recordTelegramMessage`). Verified in `backend/test/services.test.js` (`duplicate Telegram updates are identified`). |
| **Coordinator API Authentication** | `IMPLEMENTED AND VERIFIED` | `backend/server.js` (`requireCoordinator`, timing-safe check on `x-coordinator-key`). Verified in `backend/test/server.test.js`. |
| **AI Reply Interpretation & Guard** | `IMPLEMENTED AND VERIFIED` | `backend/agent.js` (`normalizeAnalysis`, `buildGraph`, `UpdateSchema`), Gemini structured output + 13 deterministic guards. 13 tests passing in `backend/test/agent.test.js`. |
| **Outbound Follow-Up Rate Limiting** | `IMPLEMENTED AND VERIFIED` | `backend/sql/setup.sql` (`create_followup_if_allowed` advisory lock + 5/day max limit), `backend/services/taskService.js` (`createFollowup`). |
| **Atomic Decision & Audit Recording** | `IMPLEMENTED AND VERIFIED` | `backend/sql/setup.sql` (`apply_reply_decision` RPC updating `tasks`, `followups`, `telegram_messages`, and inserting `task_events`). |
| **Frontend Task Live Polling** | `IMPLEMENTED AND VERIFIED` | `src/components/pp/task-sheet.tsx` (lines 30-52: 3-second polling interval calling `api.getTask`, `api.getTaskMessages`, `api.getTaskEvents`). |
| **Frontend Project/Task Mutation Sync** | `IMPLEMENTED, NOT VERIFIED` | `src/lib/store.tsx` (`saveTask`, `saveProject`, `deleteTask`, `setStatus`). Code exists and connects to backend REST endpoints when `apiReady` is true, but requires live Supabase credentials to execute end-to-end. |
| **Telegram Polling Conflict Recovery** | `IMPLEMENTED, NOT VERIFIED` | `backend/services/telegram.js` (`isTelegramPollingRetrying`, 10s backoff timer on 409 Conflict). |
| **AI Coordinator Proposal Queue** | `MOCKED / DEMO ONLY` | `src/components/views/coordinator.tsx` & `src/lib/store.tsx` (`simulateReply`, `interpretReplyDemo`). Operates purely on client state; does not ingest backend LangGraph output. |
| **Reports Generation** | `FRONTEND ONLY` | `src/components/views/reports.tsx` generates text reports locally in browser memory. Backend `GET /api/projects/:id/report` exists in `backend/server.js` but is never called by the UI. |
| **Risk & Cycle Analysis** | `FRONTEND ONLY` | `src/lib/rules.ts` (`evaluateRisks`, `wouldCreateCycle`, `downstream`). Pure client-side graph traversal over local state. |
| **Escalation Automations** | `NOT IMPLEMENTED` | UI toggle switches exist in `src/components/views/settings.tsx`, but no background scheduler or cron triggers exist in the backend. |

---

## 3. Detailed Audit of Dashboard Modules

### Module 1: Overview (`/`)
* **Primary Files:** `src/routes/index.tsx`, `src/components/pp/page.tsx`, `src/components/pp/badges.tsx`.
* **Available Features:** Portfolio summary stats (Active projects, Total tasks, Completed, In progress, Blocked, Overdue, Projects at risk), Project progress list with health badges, Task status Recharts donut chart, Major blockers list, Tasks requiring follow-up, Upcoming milestones, Recent activity feed.
* **Data Source:** Local store (`useStore`, `useScopedTasks`, `projectStats`).
* **Backend Integration:** Indirect via tasks cached in `store.tsx`.
* **Working Actions:** Project selector filtering; navigation links to sub-views (`/projects`, `/tasks`, `/blockers`, `/dependencies`, `/coordinator`).
* **Simulated/Placeholder Aspects:** Pie chart and workload stats reflect local demo state unless backend tasks have been populated into `store.tsx`.

### Module 2: Projects (`/projects` & `/projects/$projectId`)
* **Primary Files:** `src/routes/projects.index.tsx`, `src/routes/projects.$projectId.tsx`, `src/components/pp/project-dialog.tsx`.
* **Available Features:** Project listing, manager lookup, milestone progress bars, milestone toggle (done/undone), create/edit project dialog.
* **Data Source:** `useStore().data.projects`.
* **Backend Integration:** When backend is connected, `saveProject` calls `POST /api/projects` or `PATCH /api/projects/:id`.
* **Working Actions:** Create and edit project metadata, add milestones, filter by project.
* **Simulated/Placeholder Aspects:** When backend is unconfigured, changes persist to `localStorage` only.

### Module 3: Tasks (`/tasks`)
* **Primary Files:** `src/routes/tasks.tsx`, `src/components/pp/task-table.tsx`, `src/components/pp/task-sheet.tsx`, `src/components/pp/task-dialog.tsx`.
* **Available Features:** Search input, Table view vs. Kanban board view, drag-and-drop status update in Kanban, task slide-over drawer with 3-second live polling, delete confirmation, edit dialog with acceptance criteria lines.
* **Data Source:** `useScopedTasks()`.
* **Backend Integration:** `saveTask` calls `POST /api/tasks` or `PATCH /api/tasks/:id`. `TaskSheet` polls `/api/tasks/:id`, `/api/tasks/:id/messages`, `/api/tasks/:id/events`.
* **Working Actions:** Full CRUD locally; syncs to Express API if `apiReady` is true. Drag-and-drop between columns works smoothly.
* **Simulated/Placeholder Aspects:** Blocked status requires a blocker reason prompt.

### Module 4: AI Coordinator (`/coordinator`)
* **Primary Files:** `src/routes/coordinator.tsx`, `src/components/views/coordinator.tsx`.
* **Available Features:** "Tasks awaiting updates" list, "Request update" button triggering Telegram modal, "Simulate a participant reply" input (in demo mode), "Proposed updates — review" proposal cards with Approve/Reject buttons.
* **Data Source:** `data.proposals` and `data.tasks`.
* **Backend Integration:** The "Request update" button triggers the live backend Telegram dispatch. However, the proposal cards (`data.proposals`) are **100% disconnected from the backend**. Real Telegram updates bypass this proposal queue and are committed directly to PostgreSQL.
* **Working Actions:** "Request update" triggers real Telegram messages if the bot is configured. Simulated replies trigger local regex extraction.
* **Simulated/Placeholder Aspects:** Real backend AI interpretations never appear in this queue.

### Module 5: Blocker Radar (`/blockers`)
* **Primary Files:** `src/routes/blockers.tsx`, `src/components/views/blockers.tsx`.
* **Available Features:** Displays all tasks where `status === "Blocked"`, displays blocker reason, evidence quote, days blocked, identified resolver, next action, and downstream affected task titles. Includes a quick "Record resolution" input.
* **Data Source:** Local task array (`t.status === "Blocked"`).
* **Backend Integration:** Resolving a blocker dispatches `PATCH /api/tasks/:id` setting `status: "In Progress"` and clearing `blocker`.
* **Working Actions:** Blocker resolution clears the blocker state in memory and sends a PATCH request if backend is ready.

### Module 6: Dependencies & Risks (`/dependencies`)
* **Primary Files:** `src/routes/dependencies.tsx`, `src/components/views/dependencies.tsx`, `src/lib/rules.ts`.
* **Available Features:** Visual dependency chain pairs (Upstream → Downstream), highlighted in red if upstream is blocked. Rule-based findings listing overdue tasks, unmet dependencies, and missing updates.
* **Data Source:** `evaluateRisks(tasks)` in `src/lib/rules.ts`.
* **Backend Integration:** None (client-side deterministic graph algorithms).
* **Working Actions:** Clicking any dependency node opens the `TaskSheet`. Cycle detection prevents circular dependencies in `task-dialog.tsx`.

### Module 7: Activity History (`/activity`)
* **Primary Files:** `src/routes/activity.tsx`, `src/components/views/activity.tsx`, `src/components/pp/activity-list.tsx`.
* **Available Features:** Chronological audit trail showing task creations, edits, status transitions, follow-up dispatches, and incoming Telegram replies with analysis summaries.
* **Data Source:** `data.activities`. Ingests live backend `task_events` when a task sheet is opened and polled.
* **Backend Integration:** Partial. Backend stores `task_events` via `apply_reply_decision`. The frontend pulls them per-task during `refreshTask`.
* **Working Actions:** Filterable by selected project. Displays demo vs. live badges.

### Module 8: Reports (`/reports`)
* **Primary Files:** `src/routes/reports.tsx`, `src/components/views/reports.tsx`.
* **Available Features:** "Generate report" button, Markdown preview panel, "Copy" to clipboard, and "Print" stylesheet trigger.
* **Data Source:** Pure client-side computation over `data.projects` and `data.tasks`.
* **Backend Integration:** Disconnected. `GET /api/projects/:id/report` is implemented in `backend/server.js` and `taskService.js`, but `reports.tsx` ignores it and generates reports directly in the browser.
* **Working Actions:** Generate, copy, and print all work reliably in the browser.

### Module 9: Team (`/team`)
* **Primary Files:** `src/routes/team.tsx`, `src/components/views/team.tsx`.
* **Available Features:** Participant registration form (Project, Name, Role, Department), "Create participant & link code" button, "Refresh Telegram status" button, single-use Telegram link generator (`https://t.me/<bot>?start=<code>`), member cards showing linked status and task counts.
* **Data Source:** `data.members` synchronized with `GET /api/participants` and `POST /api/participants`.
* **Backend Integration:** Fully wired to backend API. Handles project pre-synchronization, link code generation, and hash storage.
* **Working Actions:** All actions connect to the backend when `apiReady` is true.

### Module 10: Settings (`/settings`)
* **Primary Files:** `src/routes/settings.tsx`, `src/components/views/settings.tsx`.
* **Available Features:** Organization name input, Demo mode toggle, "Reset demo data" button, Backend base URL input, Coordinator API key (password input with `sessionStorage` persistence), live connection status indicator with "Re-check" button, reminder threshold inputs, escalation toggles.
* **Data Source:** `data.settings` and `backend` status from `useStore`.
* **Backend Integration:** Directly probes `GET /api/health`. Accurately displays configuration states for Database, Telegram, LLM, and Coordinator Auth.
* **Working Actions:** Re-check button, demo reset, coordinator key storage, URL configuration. Escalation switches do not trigger backend scheduling.

---

## 4. End-to-End Architecture & Data Flow Audit

The planned data flow has been traced across all nine stages:

```text
React Dashboard
  │ (1) POST /api/tasks/:id/request-update
  ▼
Express Backend (:3001)
  │ (2) create_followup_if_allowed (PostgreSQL RPC) -> grammY.sendMessage
  ▼
Telegram Cloud
  │ (3) Telegram DM delivered to participant
  ▼
Participant Replies via Telegram
  │ (4) Inbound text via Long Polling / Webhook (deduplicated by update_id)
  ▼
grammY Message Handler (backend/services/telegram.js)
  │ (5) Invokes analyseReply(text, assignedTasks)
  ▼
LangGraph + Gemini Agent (backend/agent.js)
  │ (6) Structured output + deterministic safety checks
  ▼
Supabase Database
  │ (7) apply_reply_decision (PostgreSQL RPC)
  │     ├── updates public.tasks (status, blocker)
  │     ├── updates public.followups (status: REPLIED)
  │     ├── updates public.telegram_messages (status: PROCESSED)
  │     └── inserts public.task_events (audit record)
  ▼
Dashboard Active Refresh
  │ (8) TaskSheet 3-second polling (GET /api/tasks/:id/events, /messages)
  ▼
Refreshed Dashboard UI
```

### Flow Verification Table

| Stage | Source File & Function | Destination Object | Contract / Payload | Connection Status | Notes & Discrepancies |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Request Update** | `store.tsx`: `requestUpdate` | `server.js`: `POST /api/tasks/:id/request-update` | `{ member_id, text }` + `X-Coordinator-Key` | `IMPLEMENTED AND VERIFIED` | Validates participant has linked Telegram account before sending. |
| **2. Telegram Send** | `server.js` (line 286) | `telegram.js`: `sendTelegramMessage` | `bot.api.sendMessage(chatId, text)` | `IMPLEMENTED AND VERIFIED` | Calls `createFollowup` first; records failed delivery if bot is offline. |
| **3. Inbound Arrival** | Telegram Bot API | `telegram.js`: `handleText` | `ctx.message.text`, `ctx.update.update_id` | `IMPLEMENTED AND VERIFIED` | Filters non-private chats; enforces single-process long polling or webhook. |
| **4. Sender Resolution** | `telegram.js` (line 45) | `taskService.js`: `getParticipantByTelegramId` | `telegram_user_id` -> `participants.id` | `IMPLEMENTED AND VERIFIED` | Rejects unlinked accounts with registration instructions. |
| **5. AI Interpretation** | `telegram.js` (line 84) | `agent.js`: `analyseReply` | `{ participantReply, assignedTasks }` | `IMPLEMENTED AND VERIFIED` | Runs LangGraph StateGraph with temperature 0 on Gemini 2.5 Flash. |
| **6. Deterministic Guard**| `agent.js`: `normalizeAnalysis` | `agent.js` return value | `UpdateSchema` validated object | `IMPLEMENTED AND VERIFIED` | 13 safety rules prevent hallucinated completions, ambiguous matches, or premature closures. |
| **7. DB Transaction** | `taskService.js`: `recordReplyDecision` | Supabase RPC: `apply_reply_decision` | `p_task_id, p_next_status, p_evidence, p_analysis` | `IMPLEMENTED, NOT VERIFIED` | Fully written in SQL with transaction isolation; requires live Supabase instance. |
| **8. Audit Record** | Supabase RPC: `apply_reply_decision` | `public.task_events` table | `event_type: 'telegram_reply_analysis'` | `IMPLEMENTED, NOT VERIFIED` | Inserts previous status, next status, evidence, and model analysis. |
| **9. Dashboard Refresh** | `task-sheet.tsx` (line 47) | `store.tsx`: `refreshTask` | `GET /api/tasks/:id/events`, `/messages` | `IMPLEMENTED AND VERIFIED` | Polls every 3 seconds while task drawer is open; updates task status and activity log. |

---

## 5. Supabase Schema Verification

### Schema Comparison: Expected vs. Actual `setup.sql`

| Item | Expected Context | Actual `backend/sql/setup.sql` | Compatibility / Risk Assessment |
| :--- | :--- | :--- | :--- |
| **IDs** | `BIGINT` | `BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | **COMPATIBLE.** Auto-incrementing sequences are created idempotently. |
| **Client IDs** | Client string IDs (`"t1"`, `"p1"`) | Added `client_id text` with unique partial indexes | **RESOLVED.** Backend maps frontend client IDs to database `BIGINT` IDs seamlessly. |
| **Task Assignee** | `owner_id BIGINT` | `owner_id BIGINT REFERENCES public.participants(id)` | **COMPATIBLE.** Backend maps `assignee_id` from API to `owner_id` in SQL. |
| **Task Deadline** | `deadline TIMESTAMPTZ` | `deadline TIMESTAMPTZ` | **COMPATIBLE.** Backend maps `due_date` (YYYY-MM-DD) from API to `deadline` in SQL. |
| **Status Values** | Lowercase vs uppercase | Database uses lowercase (`pending`, `in_progress`, `blocked`, `complete`) | **COMPATIBLE.** Backend `toDbStatus` and `toApiStatus` handle bidirectional mapping. |
| **Telegram Fields** | Chat ID only | Added `telegram_user_id`, `telegram_username`, `telegram_link_code_hash`, `expires_at` | **ENHANCED.** Enables secure one-time code redemption and account linking. |
| **RLS Policies** | Enabled | RLS is enabled on all 7 tables. Public/anon access is revoked; service-role access is granted. | **SECURE.** Backend connects via `service_role` key only; browser never connects to Supabase directly. |
| **RPC Functions** | Custom functions | `create_followup_if_allowed` and `apply_reply_decision` defined with `SECURITY DEFINER`. | **VERIFIED.** Functions are granted strictly to `service_role`. |

---

## 6. Telegram Bot Audit

1. **Initialization & Bot Lifecycle:**
   - Bot initialized in `backend/services/telegram.js` via grammY `new Bot(config.telegramToken)`.
   - Lifecycle tied to Express server startup in `backend/server.js` (`startServer` / `stopServer`).
2. **Inbound Modes (Polling vs. Webhook):**
   - Supports both `TELEGRAM_MODE=polling` (default for local dev) and `TELEGRAM_MODE=webhook` (for Render/production).
   - Long polling includes conflict detection (`409 Conflict`) with automatic 10-second retry backoff.
3. **Deduplication:**
   - PostgreSQL unique index on `telegram_messages.update_id`.
   - `recordTelegramMessage` ignores duplicate update IDs using `ON CONFLICT DO NOTHING`.
4. **Outbound Follow-Up Dispatch:**
   - Initiated from dashboard via `POST /api/tasks/:id/request-update`.
   - Protected by transactional daily limits (max 5/day per participant, min 1 hour between updates for the same task).
5. **Commands Supported:**
   - `/start <code>`: Validates SHA-256 hash of one-time code, checks expiration (30m), binds `telegram_user_id` and `telegram_chat_id` to participant.
   - `/tasks`: Lists participant's open assigned tasks formatted with status badges.
   - `/report`: Generates a personalized workload summary.
   - Plain text replies: Analyzed by the AI Agent.

---

## 7. AI Agent & Deterministic Guard Audit

1. **Provider & Invocation:**
   - Model: Google Gemini (`gemini-2.5-flash` via `@langchain/google-genai`).
   - Orchestration: LangGraph `StateGraph` with nodes `interpret` and `validate`.
   - Temperature: 0 (deterministic sampling).
   - Structured Output: Zod schema `UpdateSchema` enforced at the model boundary.
2. **The 13 Deterministic Safety Guards (`normalizeAnalysis`):**
   - **Guard 1 (No Candidates):** If the participant has no open assigned tasks, classification is forced to `UNCLEAR`.
   - **Guard 2 (Low Confidence):** If model confidence < 0.55, classification is forced to `UNCLEAR`.
   - **Guard 3 (Ambiguous Association):** If multiple tasks match or the reply is ambiguous, status changes are rejected and clarification is requested.
   - **Guard 4 (Explicit Title Override):** A single explicit mention of an assigned task title resolves ambiguity among multiple candidates.
   - **Guard 5 (Completion Keyword Evidence):** Completion requires explicit completion keywords (`done`, `completed`, `finished`, `delivered`, `implemented`, `deployed`).
   - **Guard 6 (Acceptance Criteria Evidence):** Every acceptance criterion requires exact quotation evidence from the participant's reply; unmet criteria downgrade completion to `IN_PROGRESS`.
   - **Guard 7 (Future Promises):** Promises to finish ("will finish tomorrow") are blocked from marking tasks complete.
   - **Guard 8 (Blocker Priority):** If a blocker is identified anywhere in the message, `BLOCKED` overrides any completion claim.
   - **Guard 9 (Blocker Detail Requirement):** Claiming a blocker without details forces `UNCLEAR` and requests clarification.
   - **Guard 10 (Closed Task Guard):** Participant replies cannot reopen an already completed task.
   - **Guard 11 (Cross-Task Poisoning):** An analysis cannot apply an update to a task that does not belong to the sender.
   - **Guard 12 (Error Propagation):** Model exceptions and timeouts (20s) bubble up to error handlers rather than returning fabricated statuses.
   - **Guard 13 (Untrusted Input Isolation):** Participant text is passed as JSON-stringified user content under strict system prompt constraints.

---

## 8. Practical Implementation & Remediation Plan

To transition ProjectPilot from its current state to a fully configured, production-ready system, follow this phased plan:

### Phase 1: Environment & Supabase Setup (Estimated time: 30 minutes)
1. **Apply Supabase Schema:**
   - Open the Supabase SQL Editor.
   - Run the complete, rerunnable [`backend/sql/setup.sql`](./backend/sql/setup.sql).
2. **Generate Coordinator Key:**
   - Run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. **Configure `backend/.env`:**
   - Populate `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `COORDINATOR_API_KEY`.
4. **Restart Backend:**
   - Verify `GET /api/health` returns `status: "ok"` with all services (`database`, `telegram`, `llm`, `coordinatorAuth`) marked `configured: true`.

### Phase 2: Frontend & Coordinator Alignment (Estimated time: 45 minutes)
1. **Save Coordinator Key in Browser:**
   - Open `http://localhost:8080/settings`.
   - Set Backend Base URL to `http://localhost:3001` and enter the `COORDINATOR_API_KEY`.
   - Click **Re-check** to verify green status across all indicators.
2. **Bridge the AI Coordinator View:**
   - In `src/components/views/coordinator.tsx`, replace or supplement the mock `data.proposals` array with live entries from `GET /api/tasks/:id/events` or recent task updates so coordinators can review real Telegram analyses in the UI.

### Phase 3: Reporting & Analytics Unification (Estimated time: 20 minutes)
1. **Wire Backend Report API:**
   - Update `src/components/views/reports.tsx` to optionally fetch aggregate metrics from `GET /api/projects/:id/report` for projects synchronized to the database.

### Phase 4: Production Deployment (Estimated time: 30 minutes)
1. **Deploy Backend on Render:**
   - Use the provided `render.yaml` blueprint to deploy the Node.js backend as a background worker with persistent Telegram long polling or webhook mode.
2. **Deploy Frontend:**
   - Build frontend via `npm run build` and host the static `.output/public` assets on Cloudflare Pages, Vercel, or Render.
