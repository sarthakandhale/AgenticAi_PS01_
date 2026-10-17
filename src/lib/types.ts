export const STATUSES = ["Pending", "In Progress", "Blocked", "Complete"] as const;
export type TaskStatus = (typeof STATUSES)[number];
export const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Member {
  id: string;
  name: string;
  role: string;
  department: string;
  /** Whether a Telegram chat is linked on the backend. Demo data is always false. */
  telegramLinked: boolean;
  /** True for participants created and managed through the configured backend. */
  backendParticipant?: boolean;
}

export interface Milestone {
  id: string;
  name: string;
  date: string;
  done: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  managerId: string;
  memberIds: string[];
  startDate: string;
  targetDate: string;
  milestones: Milestone[];
}

export interface Blocker {
  reason: string;
  identifiedAt: string;
  evidence?: string;
  requiredResolver?: string;
  resolution?: string;
  resolvedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  ownerId: string;
  team: string;
  deadline: string;
  priority: Priority;
  status: TaskStatus;
  acceptanceCriteria?: string[];
  dependsOn: string[];
  blocker?: Blocker;
  nextAction: string;
  lastUpdate: string;
  createdAt: string;
}

export type ActivityType =
  | "task_created"
  | "task_updated"
  | "owner_changed"
  | "deadline_changed"
  | "status_changed"
  | "followup_sent"
  | "reply_received"
  | "interpretation"
  | "proposal_approved"
  | "proposal_rejected"
  | "blocker_detected"
  | "blocker_resolved"
  | "escalation"
  | "report_generated"
  | "project_created"
  | "project_updated"
  | "event_scheduled"
  | "event_cancelled";

export interface Activity {
  id: string;
  type: ActivityType;
  projectId?: string;
  taskId?: string;
  actor: string;
  timestamp: string;
  summary: string;
  prev?: string;
  next?: string;
  evidence?: string;
  /** Illustrative sample data — not real participant activity. */
  demo: boolean;
}

export type Delivery = "demo" | "queued" | "sent" | "delivered" | "failed";

export interface Message {
  id: string;
  taskId: string;
  memberId: string;
  direction: "out" | "in";
  text: string;
  timestamp: string;
  delivery: Delivery;
  error?: string;
  demo: boolean;
}

export interface Proposal {
  id: string;
  taskId: string;
  messageId: string;
  originalMessage: string;
  extracted: string;
  proposedStatus: TaskStatus | null;
  evidence: string[];
  clarity: "clear" | "ambiguous";
  blockerReason?: string;
  source: "demo-rules" | "backend";
  state: "pending" | "approved" | "rejected";
  decidedAt?: string;
  demo: boolean;
}

export interface Settings {
  orgName: string;
  backendUrl: string;
  demoMode: boolean;
  reminders: {
    overdueDays: number;
    blockerHours: number;
    missingUpdateDays: number;
    maxRemindersPerDay: number;
    milestoneDays: number;
  };
  escalation: {
    overdue: boolean;
    blocker: boolean;
    missingUpdate: boolean;
    blockedDependency: boolean;
    milestone: boolean;
  };
}

export interface ScheduledEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // e.g. "10:00 AM"
  projectId?: string;
  type: "meeting" | "review" | "release" | "milestone" | "deadline" | "general";
  meetingUrl?: string;
  location?: string;
  description?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  projectId?: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export type RescueStrategy =
  | "mock_api_contract"
  | "partial_deliverable"
  | "task_resequencing"
  | "work_reassignment";

export type RescueStatus = "proposed" | "approved" | "completed" | "rejected";

export interface RescueRecommendation {
  id: string;
  delayedTaskId: string;
  strategy: RescueStrategy;
  title: string;
  rationale: string;
  affectedTaskIds: string[];
  status: RescueStatus;
  mockContractDetails?: string;
  reassignedToMemberId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDependencyEdge {
  id: string;
  projectId: string;
  prerequisiteTaskId: string;
  prerequisiteTitle?: string;
  prerequisiteStatus?: TaskStatus;
  prerequisiteDeadline?: string;
  dependentTaskId: string;
  dependentTitle?: string;
  dependentStatus?: TaskStatus;
  dependentDeadline?: string;
  confidence: number;
  explanation: string;
  evidence?: string;
  status: "PROPOSED" | "CONFIRMED" | "REJECTED";
  createdAt: string;
  updatedAt?: string;
}

export interface AppData {
  members: Member[];
  projects: Project[];
  tasks: Task[];
  activities: Activity[];
  messages: Message[];
  proposals: Proposal[];
  settings: Settings;
  events?: ScheduledEvent[];
  notifications?: AppNotification[];
  rescueActions?: RescueRecommendation[];
  taskDependencies?: TaskDependencyEdge[];
}

