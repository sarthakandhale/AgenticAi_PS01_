# Pilot Ai Team

# ProjectPilot — Enterprise AI Group Project Coordinator

Build a complete, polished, responsive SaaS web application named **ProjectPilot**, an AI-powered group project coordination assistant for software companies, IT services firms, and enterprise delivery teams.

This is the FIRST PROMPT for a new project. Build the application from scratch. Do not assume any existing code, database, backend, or integrations are available.

## 1. Core problem statement — mandatory

ProjectPilot addresses the Agentic AI hackathon problem statement: **AI Group Project Coordinator**.

Project managers and engineering leaders spend significant time chasing task owners, collecting progress updates, discovering blockers, coordinating dependencies, and keeping project status accurate.

Build an AI coordination assistant that:
1. Starts from a project task list containing task owners and current statuses.
2. Contacts real participants through a messaging integration.
3. Receives and interprets their actual replies.
4. Distinguishes progress, completion, and blockers.
5. Updates task records based on validated interpretations.
6. Makes the latest project status visible.
7. Demonstrates the complete workflow: task → follow-up → participant response → status update.

The core product is project coordination, not a generic chatbot or an unrelated enterprise analytics platform. All features must support this problem statement.

The interface must be designed for professional software delivery teams managing multiple projects, cross-functional teams, dependencies, release milestones, and client commitments.

## 2. Technology stack

Use:
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui where appropriate
- Lucide React icons
- Recharts for relevant visualizations
- React Router for navigation

Use reusable components, typed models, a clean folder structure, and a centralized data/service layer.

The application must run as a real frontend project. Do not generate a static screenshot or a single nonfunctional landing page.

Do not assume a backend is already configured. Prepare clear integration boundaries for a future Python FastAPI backend and persistent database.

## 3. Brand and visual identity

Product name: ProjectPilot

Product category: AI-powered project coordination.

Tagline: **Your AI teammate for project delivery.**

Create a premium enterprise SaaS design:
- Dark navy sidebar.
- Light neutral workspace.
- Restrained green accents.
- Professional typography.
- Clean tables and cards.
- Clear status and risk badges.
- Subtle borders and shadows.
- Consistent spacing.
- Responsive desktop and mobile layouts.

Avoid excessive gradients, oversized decorative elements, unnecessary animations, and generic AI landing-page styling.

The application should look like a serious enterprise software product.

## 4. Application navigation

Create a persistent sidebar with:
1. Overview
2. Projects
3. Tasks
4. AI Coordinator
5. Blocker Radar
6. Dependencies & Risks
7. Activity History
8. Reports
9. Team
10. Settings

Include the ProjectPilot logo, project selector, notification indicator, user profile menu, and a prominent Create Task action.

Every navigation item must open a working page. Avoid dead links and decorative buttons.

## 5. Overview dashboard

Build an enterprise project overview that shows:
- Active projects.
- Total tasks.
- Completed tasks.
- In-progress tasks.
- Blocked tasks.
- Overdue tasks.
- Upcoming milestones.
- Projects at risk.
- Recent activity.
- Tasks requiring follow-up.
- Major blockers.
- Team workload overview.

Include relevant charts, concise summaries, and clickable items that navigate to the corresponding project or task.

Use realistic sample data for a fictional software company delivering a client-facing enterprise platform.

Make all metrics consistent with the underlying task data. When tasks change, relevant dashboard metrics must update.

Clearly label sample data as demo data.

## 6. Project management

Create a Projects page with:
- Multiple projects.
- Project name and description.
- Project manager.
- Team members.
- Start date and target completion date.
- Overall status.
- Completion progress.
- Milestones.
- Associated tasks.
- Major blockers and risks.

Allow users to create, edit, search, filter, and open projects.

Use a realistic example portfolio with projects such as:
- Client Platform Modernization.
- Payment Gateway Integration.
- Cloud Infrastructure Migration.

These are sample projects, not actual client engagements.

## 7. Task management

Build a complete task-management experience with both table and Kanban views.

Every task should support:
- Title and description.
- Project.
- Assigned owner.
- Team or department.
- Deadline.
- Priority: Low, Medium, High, Critical.
- Status: Pending, In Progress, Blocked, Complete.
- Dependencies.
- Blocker description.
- Next action.
- Last update.
- Activity history.

Include:
- Create, edit, and delete actions.
- Search and filtering.
- Sorting.
- Owner assignment.
- Status changes.
- Task detail panel.
- Validation and confirmation dialogs.

Ensure that all views remain synchronized when task data changes.

## 8. AI Coordinator

Build a dedicated coordination center that identifies tasks requiring attention.

Display:
- Tasks awaiting updates.
- Suggested follow-ups.
- Assigned participants.
- Pending replies.
- Recent incoming replies.
- Proposed status changes.
- Replies needing clarification.
- Active blockers.
- Recommended next actions.

Provide a review workflow:
1. Show the participant's original message.
2. Show the extracted progress or blocker.
3. Show the proposed status change.
4. Show the evidence supporting the interpretation.
5. Allow the proposed update to be approved or rejected.
6. Record the decision in the activity history.

Include a Request Update action for individual tasks.

The interface must distinguish proposed AI actions from actions actually executed.

Do not claim an AI agent is operational until a real backend and model integration exist.

## 9. Real messaging integration readiness

Prepare a secure integration boundary for the Telegram Bot API.

The eventual backend must be able to:
- Send task follow-up messages.
- Receive actual participant replies.
- Associate messages with the correct participant, project, and task.
- Return delivery and processing status.
- Trigger reply interpretation and validated task updates.

The frontend must provide:
- Integration status.
- Request-update controls.
- Recent message history.
- Delivery status.
- Incoming reply display.
- Clear error states.
- Configuration instructions.

Use a configurable backend base URL.

Never put Telegram bot tokens or LLM API keys in browser code.

Do not call the Telegram Bot API directly from the frontend using a secret token.

Do not fabricate successful messages, replies, connected services, or backend responses.

If the backend is not configured, clearly display that the integration is awaiting setup. Demo mode may illustrate the interface, but must be explicitly labeled and must not masquerade as real messaging.

Document the expected backend API contracts for the development team.

## 10. Blocker Radar

Create a dedicated page for detecting and resolving project blockers.

For each blocker, display:
- Affected project and task.
- Task owner.
- Blocker reason.
- Supporting participant message, if available.
- Date identified.
- Time blocked, if known.
- Person or resource required to resolve it, if established.
- Next recommended action.
- Affected dependent tasks.
- Current resolution status.

Include filtering by project, severity, owner, and duration.

Allow users to inspect a blocker, record a resolution, assign a next action, and view related history.

Do not invent blocker reasons or accountable owners.

## 11. Dependencies and delivery risks

Create a Dependencies & Risks page.

Support relationships such as:
- Backend API → Frontend integration.
- Frontend integration → QA testing.
- QA testing → Production release.

Show upstream tasks, downstream tasks, dependency status, affected deadlines, and potential delivery impact.

When an upstream task is blocked, highlight downstream tasks that may be affected.

Prevent circular dependencies.

Use explainable rules based on actual deadlines, task states, and known dependencies.

Clearly distinguish a confirmed blocker from a potential risk. Do not invent probability scores or claim predictive machine learning.

## 12. Activity history and audit trail

Create project-wide and task-level activity timelines.

Track:
- Task creation.
- Owner and deadline changes.
- Follow-up messages.
- Participant replies.
- AI interpretations.
- Proposed and approved status updates.
- Blocker detection.
- Blocker resolution.
- Escalations.
- Report generation.

Where available, show the actor, timestamp, previous value, new value, and supporting evidence.

Sample history must be labeled as illustrative demo data.

Do not present generated sample events as actual participant activity.

## 13. Escalation and notifications

Prepare configurable settings for:
- Overdue tasks.
- Blockers unresolved beyond a configured threshold.
- Missing participant updates.
- Blocked dependencies.
- Upcoming milestones.

Show suggested escalations and their intended recipients.

Provide sensible reminder limits to avoid spamming participants.

Do not claim background scheduling, actual notifications, or automatic escalation is working unless implemented in the backend.

## 14. Reports

Build a Reports page that generates stakeholder-ready summaries from the current application data.

Include:
- Overall project status.
- Completed work.
- Pending work.
- Blocked tasks.
- Overdue tasks.
- Upcoming milestones.
- Dependency risks.
- Outstanding decisions.
- Next actions and responsible owners.

Provide:
- Report generation.
- Copy-to-clipboard.
- Print-friendly formatting.
- A clear report timestamp.
- Consistent project and task figures.

Prepare the system for a future Telegram `/report` command through the backend.

## 15. Team management

Create a Team page showing:
- Team members.
- Roles.
- Departments.
- Assigned projects.
- Assigned tasks.
- Completed, pending, and blocked work.
- Upcoming responsibilities.
- Messaging configuration status.

Use fictional professional team members in sample data.

Allow task owners to be selected from the team list.

Do not require actual personal information to explore the demo.

## 16. Settings

Create settings pages or sections for:
- Organization and project preferences.
- Team configuration.
- Reminder thresholds.
- Escalation rules.
- Integration status.
- Backend connection status.
- Demo mode.

Do not collect or expose secret tokens in the browser.

Only show integrations as connected when a real backend confirms their status.

## 17. Realistic enterprise demo data

Create a coherent sample software-delivery portfolio with multiple projects, teams, tasks, dependencies, deadlines, blockers, and activity events.

Example task:

Project: Client Platform Modernization

Task: Connect Payment API

Owner: Backend Engineer

Status: Blocked

Blocker: Test credentials have not been provided.

Dependent tasks: Frontend payment integration and end-to-end testing.

Next action: Obtain test credentials and complete API verification.

Another task should demonstrate an in-progress API integration, and another should demonstrate completed QA work.

Ensure all task states, dependencies, deadlines, and dashboard figures are internally consistent.

## 18. End-to-end demo journey

Design the interface around this scenario:

1. A project manager opens the overview and identifies a project requiring attention.
2. The manager opens a pending task and requests an update.
3. The backend sends a real Telegram message to the task owner.
4. The participant replies that the API is connected but test credentials are missing.
5. The backend interprets the real reply and proposes Blocked as the status.
6. The task record is updated only after validation.
7. The dashboard reflects the updated task.
8. The Blocker Radar identifies the blocker and its potential dependency impact.
9. The manager inspects the evidence and next action.
10. A project report reflects the latest recorded state.

The UI may provide a separate illustrative demo flow, but the final hackathon acceptance test must use real messaging and real participant replies.

## 19. Code quality and error handling

Build actual interactive components, not static illustrations.

Use:
- Reusable React components.
- Strong TypeScript types.
- Centralized data access.
- Consistent status definitions.
- Validated forms.
- Loading and error states.
- Accessible controls.
- Responsive tables and layouts.
- Clear separation between UI and services.

Handle missing data, unavailable backend services, failed requests, duplicate actions, ambiguous AI interpretations, and invalid form input.

Do not silently treat failures as successful operations.

If no persistent backend is configured, use a clearly labeled demo data adapter and keep it replaceable by the real API service.

## 20. README and project setup

Create a README documenting:
- Product purpose.
- Technology stack.
- Installation.
- Development commands.
- Project structure.
- Environment variables.
- Demo mode.
- Expected backend endpoints.
- Telegram integration requirements.
- Security considerations.
- Testing instructions.
- Features implemented.
- Features awaiting backend integration.

## 21. Final acceptance checklist

Before completing the first build, verify:
- The React application runs.
- All navigation routes work.
- Dashboard figures are consistent.
- Projects and tasks can be created and edited.
- Task filtering and Kanban interactions work.
- Blocker details are visible.
- Dependency explanations are coherent.
- Activity history is accessible.
- Reports reflect current application data.
- Team and settings pages work.
- Demo mode is clearly labeled.
- No secrets are embedded in frontend code.
- The application is responsive.
- Integration limitations are documented.

Build the complete navigable application in this initial generation. Do not stop after the landing page or overview dashboard.

Prioritize the official AI Group Project Coordinator workflow above optional enterprise features. Build as much as possible in this first pass without falsely claiming external integrations or backend capabilities are already operational.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b1420d6a-aa6c-43cd-8a7b-60a0497e8e65).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
