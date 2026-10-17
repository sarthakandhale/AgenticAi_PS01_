import type { AppData, Task } from "./types";

/** Date relative to today (YYYY-MM-DD) so demo deadlines stay coherent. */
export function rel(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function relTs(days: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

export function createDemoData(): AppData {
  const members = [
    { id: "m1", name: "Priya Raman", role: "Delivery Manager", department: "PMO" },
    { id: "m2", name: "Daniel Okafor", role: "Backend Engineer", department: "Engineering" },
    { id: "m3", name: "Sofia Lindqvist", role: "Frontend Engineer", department: "Engineering" },
    { id: "m4", name: "Marcus Chen", role: "QA Lead", department: "Quality" },
    { id: "m5", name: "Aisha Patel", role: "DevOps Engineer", department: "Platform" },
    { id: "m6", name: "Tomás Herrera", role: "Solutions Architect", department: "Engineering" },
    { id: "m7", name: "Hannah Weiss", role: "Product Owner", department: "Product" },
    { id: "m8", name: "Kenji Watanabe", role: "Security Engineer", department: "Security" },
  ].map((m) => ({ ...m, telegramLinked: false }));

  const projects = [
    {
      id: "p1",
      name: "Client Platform Modernization",
      description: "Rebuild the client-facing portal on a modern stack with integrated payments.",
      managerId: "m1",
      memberIds: ["m1", "m2", "m3", "m4", "m7"],
      startDate: rel(-60),
      targetDate: rel(30),
      milestones: [
        { id: "ms1", name: "Design sign-off", date: rel(-40), done: true },
        { id: "ms2", name: "Payments feature complete", date: rel(7), done: false },
        { id: "ms3", name: "Production release", date: rel(30), done: false },
      ],
    },
    {
      id: "p2",
      name: "Payment Gateway Integration",
      description: "Integrate the new payment provider for card and wallet transactions.",
      managerId: "m1",
      memberIds: ["m1", "m2", "m6", "m8", "m4"],
      startDate: rel(-35),
      targetDate: rel(21),
      milestones: [
        { id: "ms4", name: "Sandbox certification", date: rel(4), done: false },
        { id: "ms5", name: "Go-live", date: rel(21), done: false },
      ],
    },
    {
      id: "p3",
      name: "Cloud Infrastructure Migration",
      description: "Move on-prem workloads to managed cloud infrastructure with IaC.",
      managerId: "m6",
      memberIds: ["m6", "m5", "m8", "m4"],
      startDate: rel(-90),
      targetDate: rel(45),
      milestones: [
        { id: "ms6", name: "Staging environment live", date: rel(-10), done: true },
        { id: "ms7", name: "Production cutover", date: rel(40), done: false },
      ],
    },
  ];

  const T = (t: Partial<Task> & Pick<Task, "id" | "title" | "projectId" | "ownerId" | "status">): Task => ({
    description: "",
    team: members.find((m) => m.id === t.ownerId)?.department ?? "Engineering",
    deadline: rel(10),
    priority: "Medium",
    dependsOn: [],
    nextAction: "",
    lastUpdate: relTs(-1),
    createdAt: relTs(-30),
    ...t,
  });

  const tasks: Task[] = [
    T({
      id: "t1", projectId: "p1", ownerId: "m2", status: "Blocked", priority: "Critical",
      title: "Connect Payment API",
      description: "Wire the portal checkout service to the payment provider API.",
      deadline: rel(3),
      blocker: {
        reason: "Test credentials have not been provided.",
        identifiedAt: relTs(-2),
        evidence: "Illustrative demo note: \"API client is connected, but we still don't have sandbox test credentials.\"",
      },
      nextAction: "Obtain test credentials and complete API verification.",
      lastUpdate: relTs(-2),
    }),
    T({
      id: "t2", projectId: "p1", ownerId: "m3", status: "Pending", priority: "High",
      title: "Frontend payment integration", description: "Build checkout UI against the payment API.",
      deadline: rel(6), dependsOn: ["t1"], nextAction: "Start once Payment API is verified.", lastUpdate: relTs(-5),
    }),
    T({
      id: "t3", projectId: "p1", ownerId: "m4", status: "Pending", priority: "High",
      title: "End-to-end payment testing", description: "E2E test plan covering checkout flows.",
      deadline: rel(9), dependsOn: ["t2"], nextAction: "Prepare test cases.", lastUpdate: relTs(-6),
    }),
    T({
      id: "t4", projectId: "p1", ownerId: "m3", status: "In Progress", priority: "Medium",
      title: "Customer profile API integration", description: "Integrate profile endpoints into the account area.",
      deadline: rel(5), nextAction: "Finish address-book endpoints.", lastUpdate: relTs(-1),
    }),
    T({
      id: "t5", projectId: "p1", ownerId: "m4", status: "Complete", priority: "Medium",
      title: "Regression QA — login & onboarding", description: "Regression pass on auth and onboarding.",
      deadline: rel(-4), nextAction: "—", lastUpdate: relTs(-4),
    }),
    T({
      id: "t6", projectId: "p1", ownerId: "m7", status: "In Progress", priority: "Low",
      title: "Release notes draft", deadline: rel(25), dependsOn: ["t3"], nextAction: "Collect feature list.",
    }),
    T({
      id: "t7", projectId: "p2", ownerId: "m6", status: "Complete", priority: "High",
      title: "Gateway architecture review", deadline: rel(-12), lastUpdate: relTs(-12),
    }),
    T({
      id: "t8", projectId: "p2", ownerId: "m2", status: "In Progress", priority: "High",
      title: "Webhook handler for transaction events", deadline: rel(-2),
      dependsOn: ["t7"], nextAction: "Handle refund events.", lastUpdate: relTs(-4),
    }),
    T({
      id: "t9", projectId: "p2", ownerId: "m8", status: "Pending", priority: "Critical",
      title: "PCI compliance checklist", deadline: rel(4), nextAction: "Schedule review with auditor.", lastUpdate: relTs(-7),
    }),
    T({
      id: "t10", projectId: "p2", ownerId: "m4", status: "Pending", priority: "High",
      title: "Sandbox certification tests", deadline: rel(4), dependsOn: ["t8", "t9"], lastUpdate: relTs(-3),
    }),
    T({
      id: "t11", projectId: "p3", ownerId: "m5", status: "Complete", priority: "High",
      title: "Terraform staging environment", deadline: rel(-10), lastUpdate: relTs(-10),
    }),
    T({
      id: "t12", projectId: "p3", ownerId: "m5", status: "In Progress", priority: "Medium",
      title: "Database replication setup", deadline: rel(12), dependsOn: ["t11"], nextAction: "Validate replication lag.",
    }),
    T({
      id: "t13", projectId: "p3", ownerId: "m8", status: "Blocked", priority: "High",
      title: "Network security group rules", deadline: rel(8), dependsOn: ["t11"],
      blocker: {
        reason: "Firewall change request awaiting approval from the client's network team.",
        identifiedAt: relTs(-5),
        requiredResolver: "Client network team",
      },
      nextAction: "Follow up on change request approval.", lastUpdate: relTs(-5),
    }),
    T({
      id: "t14", projectId: "p3", ownerId: "m4", status: "Pending", priority: "Medium",
      title: "Migration smoke tests", deadline: rel(20), dependsOn: ["t12", "t13"],
    }),
  ];

  const activities = [
    { id: "a1", type: "task_created", projectId: "p1", taskId: "t1", actor: "Priya Raman", timestamp: relTs(-30), summary: "Task created" },
    { id: "a2", type: "status_changed", projectId: "p1", taskId: "t1", actor: "Daniel Okafor", timestamp: relTs(-8), summary: "Status changed", prev: "Pending", next: "In Progress" },
    { id: "a3", type: "blocker_detected", projectId: "p1", taskId: "t1", actor: "Priya Raman", timestamp: relTs(-2), summary: "Blocker recorded: test credentials not provided", prev: "In Progress", next: "Blocked" },
    { id: "a4", type: "status_changed", projectId: "p1", taskId: "t5", actor: "Marcus Chen", timestamp: relTs(-4), summary: "Regression QA completed", prev: "In Progress", next: "Complete" },
    { id: "a5", type: "blocker_detected", projectId: "p3", taskId: "t13", actor: "Tomás Herrera", timestamp: relTs(-5), summary: "Blocker recorded: firewall change awaiting approval", prev: "In Progress", next: "Blocked" },
    { id: "a6", type: "status_changed", projectId: "p3", taskId: "t11", actor: "Aisha Patel", timestamp: relTs(-10), summary: "Staging environment delivered", prev: "In Progress", next: "Complete" },
  ].map((a) => ({ ...a, demo: true })) as AppData["activities"];

  return {
    members,
    projects,
    tasks,
    activities,
    messages: [],
    proposals: [],
    events: [
      {
        id: "ev1",
        title: "Sprint Planning & Backlog Alignment",
        date: rel(0), // today
        time: "10:30 AM",
        projectId: "p1",
        type: "meeting",
        meetingUrl: "https://meet.jit.si/projectpilot-p1-planning",
        description: "Review sprint goals, payment gateway handoffs, and assignees.",
        createdAt: relTs(-1),
      },
      {
        id: "ev2",
        title: "Sandbox Certification Review",
        date: rel(2),
        time: "02:00 PM",
        projectId: "p2",
        type: "review",
        meetingUrl: "https://meet.jit.si/projectpilot-p2-sandbox",
        description: "Technical walkthrough with payment provider integration team.",
        createdAt: relTs(-2),
      },
      {
        id: "ev3",
        title: "Cloud Infrastructure Architecture Sync",
        date: rel(4),
        time: "11:00 AM",
        projectId: "p3",
        type: "meeting",
        meetingUrl: "https://meet.jit.si/projectpilot-p3-arch",
        description: "Discuss firewall policy resolution and staging deployment roadmap.",
        createdAt: relTs(-3),
      },
    ],
    settings: {
      orgName: "Northwind Digital (demo)",
      backendUrl: "",
      demoMode: true,
      reminders: { overdueDays: 1, blockerHours: 48, missingUpdateDays: 3, maxRemindersPerDay: 2, milestoneDays: 7 },
      escalation: { overdue: true, blocker: true, missingUpdate: true, blockedDependency: true, milestone: true },
    },
  };
}
