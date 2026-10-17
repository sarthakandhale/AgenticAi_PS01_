# ProjectPilot — AI-Powered Project Delivery & Team Coordination

ProjectPilot is an intelligent project delivery management platform that coordinates project milestones, tracks task lifecycles, detects blockers, schedules team events, and interacts with teammates directly through Telegram using an AI coordinator agent.

The platform combines a **TanStack Start / React** dashboard deployed to **Vercel** with a **Node.js / Express** backend powered by **LangGraph**, **Google Gemini**, **Supabase PostgreSQL**, and the **GrammY Telegram Bot API**.

---

## Live Deployments & URLs

- **Frontend (Production)**: [https://project-pilot-peach.vercel.app](https://project-pilot-peach.vercel.app)
- **Frontend (Deployment Preview)**: [https://project-pilot-9g5gx12uz-sarthakandhale62-1639.vercel.app](https://project-pilot-9g5gx12uz-sarthakandhale62-1639.vercel.app)
- **Backend API (Local Dev Server)**: `http://localhost:3001`
- **Backend Health Check**: [http://localhost:3001/api/health](http://localhost:3001/api/health)
- **Telegram Bot**: [@ProjPilotAICoordinatorBot](https://t.me/ProjPilotAICoordinatorBot)

---

## Technology Stack

### Frontend
- **Framework**: [React 19](https://react.dev/) with [TanStack Start](https://tanstack.com/start) & [TanStack Router](https://tanstack.com/router) (file-based routing, SSR streaming).
- **State Management & Caching**: [TanStack Query (React Query)](https://tanstack.com/query) + React Context API with LocalStorage persistence.
- **Styling & Design System**: [TailwindCSS v4](https://tailwindcss.com/) with CSS variables, dark/light theme support, glassmorphism, and responsive grid layouts.
- **UI Components**: [Radix UI](https://www.radix-ui.com/) primitives (Dialog, Sheet, Popover, Select, Dropdown Menu, Progress bar, Alert Dialog, Checkbox, Tabs).
- **Icons & Visuals**: [Lucide React](https://lucide.dev/).
- **Charts & Data Visualization**: [Recharts](https://recharts.org/) (ResponsiveContainer, PieChart, BarChart, CartesianGrid, Legend, Tooltip).
- **Notifications**: [Sonner](https://sonner.emilkowal.ski/) toast system.
- **Bundler & Server Engine**: [Vite](https://vitejs.dev/) with [Nitro](https://nitro.build/) engine and [Rolldown](https://rolldown.rs/).
- **Cloud Deployment**: [Vercel](https://vercel.com/) via native Build Output API v3 (`.vercel/output`).

### Backend
- **Runtime & Server**: [Node.js](https://nodejs.org/) (ES Modules) with [Express 5](https://expressjs.com/).
- **AI Agent Framework**: [LangChain Core](https://js.langchain.com/) & [LangGraph](https://langchain-ai.github.io/langgraphjs/) state graphs.
- **LLM Engine**: [Google Gemini 3.5 Flash / 2.5 Flash](https://ai.google.dev/) via `@langchain/google-genai` with structured output parsing.
- **Schema Validation**: [Zod](https://zod.dev/) for strict runtime type-checking and LLM output guarantees.
- **Database**: [Supabase](https://supabase.com/) PostgreSQL with Row-Level Security (RLS), custom RPC stored procedures (`apply_task_reply_decision`), foreign key cascades, and transactional audit logs.
- **Messaging & Chatbot**: [GrammY](https://grammy.dev/) Telegram Bot Framework supporting long-polling and webhook modes with retry mechanisms.
- **Security & Config**: `dotenv`, CORS origin validation (`FRONTEND_ORIGIN`), and Coordinator API-Key protection (`X-Coordinator-Key`).
- **Testing**: Node.js native test runner (`node --test`) covering 25 automated unit and integration tests.

---

## System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           REACT DASHBOARD (Vercel)                              │
│                                                                                 │
│   • Portfolio Overview     • Team Workload & Milestones   • Blocker Radar       │
│   • Calendar Modal Toggle  • Project Team Meet Modal      • Real-time Polling   │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │
                          │ REST API (X-Coordinator-Key)
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        NODE.JS / EXPRESS BACKEND (:3001)                        │
│                                                                                 │
│   ┌─────────────────────┐   ┌────────────────────────┐   ┌──────────────────┐   │
│   │ Coordinator Router  │   │  LangGraph AI Workflow │   │ GrammY Bot Poller│   │
│   │ (Projects, Tasks,   │   │  (Gemini + Zod Safety) │   │  (@ProjPilotAI   │   │
│   │  Follow-ups, Meets) │   │                        │   │   CoordinatorBot)│   │
│   └──────────┬──────────┘   └───────────┬────────────┘   └─────────┬────────┘   │
└──────────────┼──────────────────────────┼──────────────────────────┼────────────┘
               │                          │                          │
               ▼                          ▼                          │ Telegram API
┌──────────────────────────────────────────────────┐                 ▼
│              SUPABASE POSTGRESQL                 │       ┌──────────────────┐
│                                                  │       │  TEAM MEMBERS    │
│  • projects        • tasks        • task_events  │       │  (Telegram DMs)  │
│  • participants    • task_criteria               │       │                  │
│  • telegram_messages (deduplication & history)   │       │ • /start <code>  │
│  • RPC: apply_task_reply_decision                │       │ • /tasks         │
└──────────────────────────────────────────────────┘       │ • /report        │
                                                           │ • Status updates │
                                                           └──────────────────┘
```

---

## Implemented Features

### 1. Interactive Real-Time Calendar & Schedule Planner
- **Home Screen Integration**: Clean logo button in the top-right header and page header (`[ Calendar ]`).
- **Full-Sized Modal**: Opens a comprehensive calendar without crowding the dashboard view.
- **Visual Categorization**: Color-coded badges for meetings, code reviews, releases, milestones, and task deadlines.
- **Day Agenda Drawer**: Clicking any date displays scheduled events, tasks due, and active project milestones for that day.
- **Event Scheduling Workflow**: Built-in modal to schedule new events with title, date, time, category, meeting links, and descriptions.
- **Real-Time Activity Logging**: Automatically records event creation and cancellations into the project activity audit log.

### 2. Project Team Meet Organizer ("Organize Team Meet")
- **One-Click Coordination**: Located inside project detail pages ([`projects.$projectId.tsx`](./src/routes/projects.$projectId.tsx)).
- **Customizable Details**: Custom meeting title, agenda, and instant meeting link generation (Google Meet / Jitsi).
- **Telegram Broadcast Alert**: Sends direct Telegram alerts to all project members with meeting details and an instant join button.
- **Activity Feed Record**: Logs the meet organization event into the project timeline.

### 3. AI-Powered Telegram Task Coordination
- **Coordinator-Initiated Follow-Ups**: Delivery managers click **Request update** on any task to send a personalized Telegram DM to the assignee.
- **LangGraph AI Processing**:
  - Analyzes natural language replies (e.g., *"I have finished the frontend development"*, *"We are blocked by payment credentials"*).
  - Matches replies to the correct assigned task using role, title, and assignee context.
  - Verifies evidence against defined **acceptance criteria**.
  - Applies a strict **deterministic status guard**: blockers and unmet acceptance criteria prevent premature task completion.
- **Real-Time Dashboard Sync**:
  - Automatically updates task status (`Pending`, `In Progress`, `Blocked`, `Complete`).
  - Stores message history and audit logs in Supabase.
  - Frontend polls every 3 seconds to reflect updates in real-time without page reloads.

### 4. Blocker Radar & Delivery Risk Detection
- **Major Blockers Panel**: Surfaces critical and high-priority blocked tasks across all projects.
- **Upstream Dependency Warnings**: Identifies tasks delayed by blocked predecessors.
- **Overdue Task Tracking**: Highlights missed deadlines.
- **Blocker Resolution Workflow**: Modal to record resolution details and transition tasks back to active states.

### 5. Team Management & Secure Linking
- **Participant Registration**: Register team members with their name, role, and department.
- **One-Time Telegram Deep Links**: Secure 30-minute tokenized deep links (`https://t.me/ProjPilotAICoordinatorBot?start=<code>`) for 1-to-1 account verification.
- **Telegram Bot Commands**:
  - `/start <code>`: Links user Telegram account to their ProjectPilot profile.
  - `/tasks`: Lists personal assigned tasks with status, priority, and deadlines.
  - `/report`: Summarizes assigned, open, blocked, and completed tasks.

### 6. Production Cloud Deployment on Vercel
- **Automatic Preset Detection**: Configured in `vite.config.ts` to switch Nitro to the `vercel` preset when running on Vercel (`process.env.VERCEL`).
- **Build Output API v3**: Emits static assets and serverless functions directly into `.vercel/output/`.
- **Custom Configuration**: `vercel.json` and `.gitignore` setup for seamless continuous deployment.

---

## Directory Structure

```text
Project_pilot/
├── backend/
│   ├── sql/
│   │   └── setup.sql                 # Supabase schema, RLS, and RPC procedures
│   ├── services/
│   │   ├── taskService.js            # Task lifecycle, atomic updates, and Supabase client
│   │   └── telegram.js               # GrammY bot configuration, commands, and polling
│   ├── test/
│   │   ├── agent.test.js             # 25 automated unit tests for AI agent and safety rules
│   │   └── services.test.js          # API and service integration tests
│   ├── agent.js                      # LangGraph state graph and Gemini analysis workflow
│   ├── config.js                     # Environment variable validation and CORS settings
│   ├── server.js                     # Express app, authenticated routes, and error handling
│   ├── package.json                  # Backend dependencies and scripts
│   └── .env.example                  # Environment variable template
│
├── src/
│   ├── components/
│   │   ├── pp/
│   │   │   ├── app-shell.tsx         # Responsive sidebar, navigation, and top header
│   │   │   ├── calendar-view.tsx     # Full interactive calendar & scheduling modal
│   │   │   ├── organize-meet-dialog.tsx # Team meet scheduling and Telegram broadcast dialog
│   │   │   ├── task-dialog.tsx       # Create / edit task modal with criteria
│   │   │   ├── task-sheet.tsx        # Task detail slide-over drawer with chat history
│   │   │   ├── project-dialog.tsx    # Create / edit project modal
│   │   │   ├── activity-list.tsx     # Portfolio activity feed
│   │   │   └── task-table.tsx        # Tabular task rows with priority badges
│   │   ├── ui/                       # Reusable Radix UI component library
│   │   └── views/                    # Feature views (Team, Coordinator, Blockers, Reports)
│   ├── lib/
│   │   ├── api.ts                    # Backend API client and error handling
│   │   ├── demo-data.ts              # Sample portfolio seed data
│   │   ├── rules.ts                  # Task status and delivery risk evaluation rules
│   │   ├── store.tsx                 # Global application store with auto-sync
│   │   └── types.ts                  # TypeScript data models and interfaces
│   ├── routes/
│   │   ├── index.tsx                 # Overview dashboard route
│   │   ├── projects.index.tsx        # Projects list route
│   │   ├── projects.$projectId.tsx   # Project details, team meet button, and milestones
│   │   ├── tasks.tsx                 # Filterable task radar
│   │   ├── coordinator.tsx           # AI Coordinator proposal approval review
│   │   ├── blockers.tsx              # Blocker radar view
│   │   ├── dependencies.tsx          # Dependency visualization and risks
│   │   ├── activity.tsx              # Activity audit history
│   │   ├── reports.tsx               # Status reports view
│   │   ├── team.tsx                  # Team member registration and Telegram linking
│   │   └── settings.tsx              # Backend configuration and health checker
│   └── styles.css                    # Tailwind CSS configuration and theme variables
│
├── vercel.json                       # Vercel deployment configuration
├── vite.config.ts                    # Vite / TanStack Start configuration with Vercel preset
├── package.json                      # Frontend dependencies and scripts
└── README.md                         # Project documentation
```

---

## Getting Started

### Prerequisites
- **Node.js**: v20 or newer
- **Supabase**: PostgreSQL database
- **Google AI Studio Key**: Gemini API key
- **Telegram Bot Token**: Created via [@BotFather](https://t.me/BotFather)

---

### Setup Instructions

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/sarthakandhale/Project_pilot.git
   cd Project_pilot
   ```

2. **Install Frontend Dependencies**:
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Install Backend Dependencies**:
   ```bash
   cd backend
   npm install
   ```

4. **Configure Backend Environment**:
   Copy `.env.example` to `.env` inside the `backend` folder:
   ```env
   PORT=3001
   FRONTEND_ORIGIN=http://localhost:8080,http://localhost:5173,https://project-pilot-peach.vercel.app
   COORDINATOR_API_KEY=your_generated_secret_key_here
   GOOGLE_API_KEY=your_gemini_api_key
   GEMINI_MODEL=gemini-3.5-flash
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   TELEGRAM_MODE=polling
   MAX_FOLLOWUPS_PER_DAY=5
   ```

5. **Set up the Database Schema**:
   Open your Supabase SQL Editor and execute [`backend/sql/setup.sql`](./backend/sql/setup.sql).

---

## Running the Application

### Option 1: Run Backend and Frontend Concurrently

**Terminal 1 — Backend**:
```bash
npm --prefix backend start
# Or from inside /backend: node server.js
```

**Terminal 2 — Frontend**:
```bash
npm run dev
```

The frontend will start at **`http://localhost:8080`** (or `http://localhost:5173`).

---

## Connecting Frontend to Backend

1. Navigate to **Settings** in the dashboard (`/settings`).
2. Set **Backend base URL** to:
   - `http://localhost:3001` (when running locally)
   - Your tunnel or deployed backend URL (when testing with the Vercel cloud frontend)
3. Enter your **`COORDINATOR_API_KEY`**.
4. Click **Re-check**. The dashboard will confirm database, Telegram bot, and LLM connectivity with green checkmarks.

---

## Running Tests

Execute the automated test suite covering AI reasoning, safety rules, and coordinator endpoints:

```bash
# Backend unit & integration tests (25 tests)
npm --prefix backend test

# TypeScript typecheck & production build
npm run build
```

---

## License

This project is licensed under the MIT License.
