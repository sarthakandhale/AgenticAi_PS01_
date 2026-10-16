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
  | "project_updated";

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

export interface AppData {
  members: Member[];
  projects: Project[];
  tasks: Task[];
  activities: Activity[];
  messages: Message[];
  proposals: Proposal[];
  settings: Settings;
}
