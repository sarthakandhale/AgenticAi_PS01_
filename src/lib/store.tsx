import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createDemoData } from "./demo-data";
import { api, resolveBackendUrl, type HealthResponse } from "./api";
import { interpretReplyDemo } from "./rules";
import { generateRescueRecommendations } from "./rescue-engine";
import type { Activity, AppData, AppNotification, Project, Proposal, RescueRecommendation, ScheduledEvent, Settings, Task, TaskDependencyEdge, TaskStatus } from "./types";

const KEY = "projectpilot.demo.v1";
const CURRENT_USER = "Priya Raman";
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const now = () => new Date().toISOString();

async function ensureBackendProject(project: Project, base: string, coordinatorApiKey: string, managerId?: string) {
  const existing = await api.listProjects(base, coordinatorApiKey);
  if (existing.projects.some((candidate) => candidate.id === project.id)) return;
  try {
    await api.createProject(base, {
      id: project.id,
      name: project.name,
      description: project.description,
      ...(managerId ? { manager_id: managerId } : {}),
      start_date: project.startDate,
      target_date: project.targetDate,
      milestones: project.milestones,
      member_ids: project.memberIds,
    }, coordinatorApiKey);
  } catch (error) {
    const refreshed = await api.listProjects(base, coordinatorApiKey);
    if (!refreshed.projects.some((candidate) => candidate.id === project.id)) throw error;
  }
}

type BackendState =
  | { state: "unconfigured" }
  | { state: "checking" }
  | { state: "ok"; health: HealthResponse }
  | { state: "error"; error: string };

interface Store {
  data: AppData;
  currentUser: string;
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  openTaskId: string | null;
  setOpenTaskId: (id: string | null) => void;
  calendarOpen: boolean;
  setCalendarOpen: (open: boolean) => void;
  taskDialog: { open: boolean; task?: Task };
  openTaskDialog: (task?: Task) => void;
  closeTaskDialog: () => void;
  backend: BackendState;
  coordinatorApiKey: string;
  setCoordinatorApiKey: (key: string) => void;
  checkBackend: () => Promise<void>;
  saveTask: (t: Task, isNew: boolean) => void;
  deleteTask: (id: string) => void;
  setStatus: (id: string, status: TaskStatus, note?: string) => void;
  saveProject: (p: Project, isNew: boolean) => void;
  updateMember: (id: string, updates: { name?: string; role?: string; department?: string }) => Promise<void>;
  registerParticipant: (input: { projectId: string; name: string; role: string; department: string }) => Promise<string>;
  refreshParticipants: () => Promise<void>;
  refreshTask: (taskId: string) => Promise<void>;
  syncWithBackend: () => Promise<void>;
  requestUpdate: (taskId: string, text: string) => Promise<void>;
  organizeMeet: (
    projectId: string,
    meetData: { title?: string; meetingUrl?: string; agenda?: string },
  ) => Promise<{ success: boolean; delivered_count: number; meeting_url: string }>;
  addEvent: (event: Omit<ScheduledEvent, "id" | "createdAt">) => void;
  deleteEvent: (id: string) => void;
  simulateReply: (taskId: string, text: string) => void;
  decideProposal: (id: string, approve: boolean) => void;
  resolveBlocker: (taskId: string, resolution: string, nextStatus: TaskStatus) => void;
  setNextAction: (taskId: string, action: string, resolver?: string) => void;
  markNotificationRead: (id: string) => Promise<void>;
  approveRescueAction: (id: string, notes?: string) => void;
  rejectRescueAction: (id: string) => void;
  completeRescueAction: (id: string) => void;
  isAnalyzingDependencies: boolean;
  analyzeProjectDependencies: (projectId?: string, options?: { silent?: boolean }) => Promise<{ count: number; summary?: string }>;
  confirmDependency: (prerequisiteTaskId: string, dependentTaskId: string) => Promise<void>;
  rejectDependency: (prerequisiteTaskId: string, dependentTaskId: string) => Promise<void>;
  deleteDependency: (prerequisiteTaskId: string, dependentTaskId: string) => Promise<void>;
  logActivity: (a: Omit<Activity, "id" | "timestamp" | "actor" | "demo">) => void;
  updateSettings: (s: Settings) => void;
  resetDemo: () => void;
}

export function inferDependenciesDemo(tasks: Task[], project?: Project): TaskDependencyEdge[] {
  const edges: TaskDependencyEdge[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < tasks.length; i++) {
    for (let j = 0; j < tasks.length; j++) {
      if (i === j) continue;
      const a = tasks[i];
      const b = tasks[j];
      const aText = `${a.title.toLowerCase()} ${(a.description || "").toLowerCase()} ${a.team.toLowerCase()}`;
      const bText = `${b.title.toLowerCase()} ${(b.description || "").toLowerCase()} ${b.team.toLowerCase()}`;

      const aIsDb = /\bdatabase\b|\bschema\b|\bmigration\b|data model|\bdb\b|\btables\b|\bpostgres\b|\bsql\b/.test(aText);
      const aIsDesign = /\bdesign\b|\bfigma\b|\bwireframe\b|\bmockup\b|ui\/ux/.test(aText);
      const aIsApi = /\bapi\b|\bbackend\b|\bendpoint\b|\bcrud\b|\bcontroller\b|\bserver\b|\bservices\b/.test(aText);
      const aIsFrontend = /\bfrontend\b|\bui\b|\bdashboard\b|\bcomponent\b|\bscreen\b|\bclient\b|\breact\b/.test(aText);

      const bIsApi = /\bapi\b|\bbackend\b|\bendpoint\b|\bcrud\b|\bcontroller\b|\bserver\b|\bservices\b/.test(bText);
      const bIsFrontend = /\bfrontend\b|\bui\b|\bdashboard\b|\bcomponent\b|\bscreen\b|\bclient\b|\breact\b/.test(bText);
      const bIsQa = /\bqa\b|\btesting\b|test suite|end-to-end|\be2e\b|\baudit\b|\bverification\b/.test(bText);

      let matches = false;
      let reason = "";
      let confidence = 0.85;

      if (aIsDb && (bIsApi || bIsFrontend)) {
        matches = true;
        reason = `Database schema and persistence model from '${a.title}' must be deployed before '${b.title}' can integrate.`;
        confidence = 0.94;
      } else if (aIsDesign && bIsFrontend) {
        matches = true;
        reason = `Visual specifications and wireframes from '${a.title}' are required to implement components in '${b.title}'.`;
        confidence = 0.88;
      } else if (aIsApi && (bIsFrontend || bIsQa)) {
        matches = true;
        reason = `API endpoints and contracts from '${a.title}' must be active before client integration and QA validation in '${b.title}'.`;
        confidence = 0.91;
      } else if (aIsFrontend && bIsQa) {
        matches = true;
        reason = `User interface in '${a.title}' must be built before full end-to-end user verification in '${b.title}'.`;
        confidence = 0.86;
      }

      // Milestone phasing rule: earlier milestone deliverables precede subsequent milestones
      const milestones = Array.isArray(project?.milestones) ? project.milestones : [];
      if (milestones.length > 0 && !matches) {
        const aMsIdx = milestones.findIndex((m) =>
          (m.name && aText.includes(m.name.toLowerCase())) ||
          (a.deadline && m.date && a.deadline <= m.date)
        );
        const bMsIdx = milestones.findIndex((m) =>
          (m.name && bText.includes(m.name.toLowerCase())) ||
          (b.deadline && m.date && b.deadline > m.date)
        );
        if (aMsIdx !== -1 && bMsIdx !== -1 && aMsIdx < bMsIdx) {
          matches = true;
          const mA = milestones[aMsIdx];
          const mB = milestones[bMsIdx];
          reason = `Milestone phasing: Task '${a.title}' aligns with milestone '${mA.name}' which must be achieved before subsequent milestone '${mB.name}' task '${b.title}'.`;
          confidence = 0.89;
        }
      }

      if (matches) {
        const pairKey = `${a.id}->${b.id}`;
        if (!seen.has(pairKey) && !(b.dependsOn || []).includes(a.id)) {
          seen.add(pairKey);
          edges.push({
            id: `edge-${a.id}-${b.id}`,
            projectId: a.projectId,
            prerequisiteTaskId: a.id,
            prerequisiteTitle: a.title,
            prerequisiteStatus: a.status,
            prerequisiteDeadline: a.deadline,
            dependentTaskId: b.id,
            dependentTitle: b.title,
            dependentStatus: b.status,
            dependentDeadline: b.deadline,
            confidence,
            explanation: reason,
            evidence: `Derived from matching technical deliverables between tasks.`,
            status: "PROPOSED",
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  return edges;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => createDemoData());
  const [hydrated, setHydrated] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task?: Task }>({ open: false });
  const [backend, setBackend] = useState<BackendState>({ state: "unconfigured" });
  const [coordinatorApiKey, setCoordinatorApiKeyState] = useState("");
  const [isAnalyzingDependencies, setIsAnalyzingDependencies] = useState(false);

  useEffect(() => {
    setCoordinatorApiKeyState(sessionStorage.getItem("projectpilot.coordinator-key") ?? "");
  }, []);

  const setCoordinatorApiKey = useCallback((key: string) => {
    setCoordinatorApiKeyState(key);
    if (key) sessionStorage.setItem("projectpilot.coordinator-key", key);
    else sessionStorage.removeItem("projectpilot.coordinator-key");
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppData;
        if (!parsed.events || parsed.events.length === 0) {
          parsed.events = createDemoData().events || [];
        }
        if (!parsed.notifications) parsed.notifications = [];
        if (!parsed.rescueActions) parsed.rescueActions = [];
        if (!parsed.taskDependencies) parsed.taskDependencies = [];
        setData(parsed);
      }
    } catch {
      /* corrupt storage — keep fresh demo data */
    }
    setHydrated(true);
  }, []);

  // Automatically update and maintain rescue recommendations as task states evolve
  useEffect(() => {
    setData((d) => {
      const computed = generateRescueRecommendations(d.tasks, d.members, d.rescueActions || []);
      if (JSON.stringify(computed) !== JSON.stringify(d.rescueActions || [])) {
        return { ...d, rescueActions: computed };
      }
      return d;
    });
  }, [data.tasks, data.members]);
  useEffect(() => {
    if (hydrated) localStorage.setItem(KEY, JSON.stringify(data));
  }, [data, hydrated]);

  const base = resolveBackendUrl(data.settings.backendUrl);
  const checkBackend = useCallback(async () => {
    if (!base) return setBackend({ state: "unconfigured" });
    setBackend({ state: "checking" });
    try {
      setBackend({ state: "ok", health: await api.health(base) });
    } catch (e) {
      setBackend({ state: "error", error: (e as Error).message });
    }
  }, [base]);
  useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

  const act = (d: AppData, a: Omit<Activity, "id" | "timestamp" | "demo"> & { demo?: boolean }): Activity[] => [
    { id: uid("a"), timestamp: now(), demo: false, ...a },
    ...d.activities,
  ];
  const apiReady =
    backend.state === "ok" &&
    !!coordinatorApiKey &&
    !!backend.health.coordinatorAuth?.configured;

  const syncWithBackend = useCallback(async () => {
    if (!base || !apiReady) return;
    try {
      const [participantRes, taskRes, eventRes, msgRes, notifRes, depRes] = await Promise.all([
        api.listParticipants(base, coordinatorApiKey).catch(() => null),
        api.listTasks(base, undefined, coordinatorApiKey).catch(() => null),
        api.listEvents(base, undefined, coordinatorApiKey).catch(() => null),
        api.listMessages(base, coordinatorApiKey).catch(() => null),
        api.listNotifications(base, undefined, coordinatorApiKey).catch(() => null),
        Promise.all(
          data.projects.map((p) => api.listDependencies(base, p.id, coordinatorApiKey).catch(() => null)),
        ),
      ]);

      setData((d) => {
        let changed = false;
        let members = d.members;
        let projects = d.projects;
        let tasks = d.tasks;
        let activities = d.activities;
        let messages = d.messages;
        let notifications = d.notifications || [];
        let taskDependencies = d.taskDependencies || [];

        if (participantRes?.participants) {
          const participants = participantRes.participants.map((p) => ({
            id: p.id,
            name: p.display_name,
            role: p.role,
            department: p.department,
            telegramLinked: p.telegram_linked,
            backendParticipant: true,
          }));

          const memberProjectIds = new Map<string, string[]>();
          for (const participant of participantRes.participants) {
            for (const membership of participant.project_members || []) {
              const current = memberProjectIds.get(membership.project_id) ?? [];
              memberProjectIds.set(membership.project_id, [...current, participant.id]);
            }
          }

          const existingParticipantsMap = new Map(participants.map((p) => [p.id, p]));
          const updatedMembers = d.members.map((m) => {
            const remote = existingParticipantsMap.get(m.id);
            if (remote && (m.telegramLinked !== remote.telegramLinked || m.role !== remote.role || m.name !== remote.name)) {
              changed = true;
              return { ...m, ...remote };
            }
            return m;
          });

          // Add any new participants
          for (const p of participants) {
            if (!updatedMembers.some((m) => m.id === p.id)) {
              updatedMembers.push(p);
              changed = true;
            }
          }
          members = updatedMembers;

          projects = d.projects.map((project) => {
            const mappedIds = memberProjectIds.get(project.id) ?? [];
            const merged = [
              ...project.memberIds,
              ...mappedIds,
            ].filter((id, index, ids) => ids.indexOf(id) === index);
            if (merged.length !== project.memberIds.length) {
              changed = true;
              return { ...project, memberIds: merged };
            }
            return project;
          });
        }

        if (taskRes?.tasks) {
          const statusMap: Record<string, TaskStatus> = {
            TODO: "Pending",
            IN_PROGRESS: "In Progress",
            BLOCKED: "Blocked",
            COMPLETE: "Complete",
          };

          const updatedTasks = d.tasks.map((localTask) => {
            const remote = taskRes.tasks.find((rt) => rt.id === localTask.id);
            if (!remote) return localTask;
            const newStatus = statusMap[remote.status] ?? localTask.status;
            const statusChanged = localTask.status !== newStatus;
            const blockerChanged = localTask.blocker?.reason !== (remote.blocker ?? undefined);
            const nextActionChanged = localTask.nextAction !== (remote.next_action || "");
            const remoteDeps = remote.dependencies || [];
            const depsChanged = JSON.stringify(localTask.dependsOn || []) !== JSON.stringify(remoteDeps);

            if (!statusChanged && !blockerChanged && !nextActionChanged && !depsChanged) {
              return localTask;
            }

            changed = true;
            return {
              ...localTask,
              title: remote.title || localTask.title,
              description: remote.description ?? localTask.description,
              ownerId: remote.assignee_id ?? localTask.ownerId,
              status: newStatus,
              dependsOn: remoteDeps,
              nextAction: remote.next_action || localTask.nextAction,
              lastUpdate: remote.updated_at || localTask.lastUpdate,
              ...(remote.blocker
                ? {
                    blocker: {
                      reason: remote.blocker,
                      identifiedAt: remote.updated_at,
                      ...(localTask.blocker?.evidence ? { evidence: localTask.blocker.evidence } : {}),
                    },
                  }
                : {}),
            };
          });

          for (const remote of taskRes.tasks) {
            if (!updatedTasks.some((t) => t.id === remote.id)) {
              updatedTasks.push({
                id: remote.id,
                projectId: remote.project_id,
                title: remote.title,
                description: remote.description ?? "",
                ownerId: remote.assignee_id ?? "",
                team: members.find((m) => m.id === remote.assignee_id)?.department ?? "Engineering",
                deadline: remote.due_date ?? "",
                priority: remote.priority,
                status: statusMap[remote.status] ?? "Pending",
                dependsOn: remote.dependencies ?? [],
                acceptanceCriteria: remote.acceptance_criteria ?? [],
                nextAction: remote.next_action ?? "",
                ...(remote.blocker
                  ? { blocker: { reason: remote.blocker, identifiedAt: remote.updated_at } }
                  : {}),
                lastUpdate: remote.updated_at,
                createdAt: remote.created_at,
              });
              changed = true;
            }
          }
          tasks = updatedTasks;
        }

        if (eventRes?.events) {
          const existingIds = new Set(d.activities.map((a) => a.id));
          const newEvents = eventRes.events
            .filter((ev) => !existingIds.has(ev.id))
            .map((ev) => {
              const matchedTask = tasks.find((t) => t.id === ev.id);
              return {
                id: ev.id,
                type: "interpretation" as const,
                projectId: matchedTask?.projectId || d.projects[0]?.id || "",
                taskId: matchedTask?.id,
                actor: "AI coordinator",
                timestamp: ev.created_at,
                summary: ev.analysis?.explanation ?? `Task update: ${ev.next_status ?? "verified"}`,
                ...(ev.previous_status ? { prev: ev.previous_status } : {}),
                ...(ev.next_status ? { next: ev.next_status } : {}),
                ...(ev.evidence ? { evidence: ev.evidence } : {}),
                demo: false,
              };
            });
          if (newEvents.length > 0) {
            activities = [...newEvents, ...d.activities];
            changed = true;
          }
        }

        if (msgRes?.messages) {
          const incoming = msgRes.messages.map((m) => ({
            id: m.id,
            taskId: m.taskId || "",
            memberId: m.memberId,
            direction: m.direction as "in" | "out",
            text: m.text,
            timestamp: m.timestamp,
            delivery: "delivered" as const,
            demo: false,
          }));
          const existingMsgIds = new Set(d.messages.map((m) => m.id));
          const newMessages = incoming.filter((m) => !existingMsgIds.has(m.id));
          if (newMessages.length > 0) {
            messages = [...newMessages, ...d.messages];
            changed = true;
          }
        }

        if (notifRes?.notifications) {
          const existingNotifIds = new Set((d.notifications || []).map((n) => n.id));
          const incomingNotifs = notifRes.notifications
            .filter((n) => !existingNotifIds.has(n.id))
            .map((n) => ({
              id: n.id,
              recipientId: n.recipient_id,
              projectId: n.project_id,
              title: n.title,
              message: n.message,
              read: n.read,
              createdAt: n.created_at,
            }));
          if (incomingNotifs.length > 0) {
            notifications = [...incomingNotifs, ...notifications];
            changed = true;
          }
        }

        if (Array.isArray(depRes)) {
          const allRemoteDeps: TaskDependencyEdge[] = [];
          for (const res of depRes) {
            if (res?.dependencies) {
              for (const dep of res.dependencies) {
                allRemoteDeps.push({
                  id: dep.id,
                  projectId: dep.projectId,
                  prerequisiteTaskId: dep.prerequisiteTaskId,
                  prerequisiteTitle: dep.prerequisiteTitle,
                  prerequisiteStatus: (dep.prerequisiteStatus as TaskStatus) || "Pending",
                  prerequisiteDeadline: dep.prerequisiteDeadline,
                  dependentTaskId: dep.dependentTaskId,
                  dependentTitle: dep.dependentTitle,
                  dependentStatus: (dep.dependentStatus as TaskStatus) || "Pending",
                  dependentDeadline: dep.dependentDeadline,
                  confidence: dep.confidence,
                  explanation: dep.explanation,
                  evidence: dep.evidence,
                  status: dep.status,
                  createdAt: dep.createdAt,
                  updatedAt: dep.updatedAt,
                });
              }
            }
          }
          if (allRemoteDeps.length > 0 || (taskDependencies.length > 0 && allRemoteDeps.length === 0)) {
            taskDependencies = allRemoteDeps;
            changed = true;
          }
        }

        if (!changed) return d;
        return {
          ...d,
          members,
          projects,
          tasks,
          activities,
          messages,
          notifications,
          taskDependencies,
        };
      });
    } catch {
      // background sync is silent
    }
  }, [base, coordinatorApiKey, apiReady, data.projects]);

  useEffect(() => {
    if (!apiReady) return;
    void syncWithBackend();
    const interval = setInterval(() => {
      void syncWithBackend();
    }, 3000);
    return () => clearInterval(interval);
  }, [apiReady, syncWithBackend]);

  const runDependencyAnalysis = useCallback(
    async (targetProjectId?: string, options: { silent?: boolean } = {}) => {
      const projId = targetProjectId || (selectedProjectId !== "all" ? selectedProjectId : data.projects[0]?.id);
      if (!projId) {
        if (!options.silent) toast.error("Please select a project to analyze dependencies.");
        return { count: 0 };
      }
      const project = data.projects.find((p) => p.id === projId) || data.projects[0];
      setIsAnalyzingDependencies(true);
      try {
        if (base && apiReady) {
          const res = await api.analyzeDependencies(base, projId, coordinatorApiKey);
          if (res?.dependencies) {
            const mapped: TaskDependencyEdge[] = res.dependencies.map((d) => ({
              id: d.id,
              projectId: d.projectId,
              prerequisiteTaskId: d.prerequisiteTaskId,
              prerequisiteTitle: d.prerequisiteTitle,
              prerequisiteStatus: (d.prerequisiteStatus as TaskStatus) || "Pending",
              prerequisiteDeadline: d.prerequisiteDeadline,
              dependentTaskId: d.dependentTaskId,
              dependentTitle: d.dependentTitle,
              dependentStatus: (d.dependentStatus as TaskStatus) || "Pending",
              dependentDeadline: d.dependentDeadline,
              confidence: d.confidence,
              explanation: d.explanation,
              evidence: d.evidence,
              status: d.status,
              createdAt: d.createdAt,
              updatedAt: d.updatedAt,
            }));
            setData((prev) => ({
              ...prev,
              taskDependencies: mapped,
              activities: act(prev, {
                type: "interpretation",
                actor: "AI coordinator",
                projectId: projId,
                summary: `AI analyzed dependencies for "${project?.name || projId}": ${mapped.filter((m) => m.status === 'PROPOSED').length} proposed.`,
                evidence: res.summary,
              }),
            }));
            void syncWithBackend();
            const proposedCount = mapped.filter((m) => m.status === "PROPOSED").length;
            if (!options.silent) {
              toast.success(`AI Dependency Analysis complete: ${proposedCount} dependencies proposed for review.`);
            }
            return { count: proposedCount, summary: res.summary };
          }
        }

        // Demo Mode / Instant Local Fallback
        const projTasks = data.tasks.filter((t) => t.projectId === projId);
        const inferred = inferDependenciesDemo(projTasks, project);
        setData((prev) => {
          const existingNonProposed = (prev.taskDependencies || []).filter(
            (d) => d.projectId === projId && d.status !== "PROPOSED",
          );
          const otherProjectDeps = (prev.taskDependencies || []).filter((d) => d.projectId !== projId);
          return {
            ...prev,
            taskDependencies: [...otherProjectDeps, ...existingNonProposed, ...inferred],
            activities: act(prev, {
              type: "interpretation",
              actor: "AI coordinator",
              projectId: projId,
              summary: `AI analyzed dependencies for "${project?.name}": ${inferred.length} proposed.`,
              evidence: "Inferred from task technical roles, architecture layers, and deliverables.",
            }),
          };
        });
        if (!options.silent) {
          toast.success(`AI Dependency Analysis complete: ${inferred.length} dependencies proposed.`);
        }
        return { count: inferred.length, summary: "Heuristic AI inference completed." };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!options.silent) toast.error(`Dependency analysis failed: ${message}`);
        return { count: 0, summary: message };
      } finally {
        setIsAnalyzingDependencies(false);
      }
    },
    [base, apiReady, coordinatorApiKey, selectedProjectId, data.projects, data.tasks, syncWithBackend],
  );

  const store: Store = useMemo(() => {
    const taskOf = (id: string) => data.tasks.find((t) => t.id === id);
    return {
      data,
      currentUser: CURRENT_USER,
      selectedProjectId,
      setSelectedProjectId,
      openTaskId,
      setOpenTaskId,
      calendarOpen,
      setCalendarOpen,
      taskDialog,
      openTaskDialog: (task) => setTaskDialog({ open: true, ...(task ? { task } : {}) }),
      closeTaskDialog: () => setTaskDialog({ open: false }),
      backend,
      coordinatorApiKey,
      setCoordinatorApiKey,
      checkBackend,
      logActivity: (a) => setData((d) => ({ ...d, activities: act(d, { ...a, actor: CURRENT_USER }) })),
      saveTask: (t, isNew) => {
        const backendTask = {
          id: t.id,
          project_id: t.projectId,
          title: t.title,
          description: t.description,
          assignee_id: t.ownerId,
          status: t.status,
          acceptance_criteria: t.acceptanceCriteria ?? [],
          priority: t.priority,
          due_date: t.deadline,
          dependencies: t.dependsOn,
          blocker: t.blocker?.reason ?? null,
          next_action: t.nextAction,
        };
        if (base && apiReady) {
          const request = (async () => {
            const project = data.projects.find((candidate) => candidate.id === t.projectId);
            if (!project) throw new Error("Create or sync the task's project first.");
            const managerId = data.members.some(
              (member) => member.id === project.managerId && member.backendParticipant,
            ) ? project.managerId : undefined;
            await ensureBackendProject(project, base, coordinatorApiKey, managerId);
            const participants = await api.listParticipants(base, coordinatorApiKey);
            if (!participants.participants.some((participant) => participant.id === t.ownerId)) {
              throw new Error("Register the task owner as a backend participant first.");
            }
            return isNew
              ? api.createTask(base, backendTask, coordinatorApiKey)
              : api.updateTask(base, t.id, {
                title: backendTask.title,
                description: backendTask.description,
                assignee_id: backendTask.assignee_id,
                status: backendTask.status,
                acceptance_criteria: backendTask.acceptance_criteria,
                priority: backendTask.priority,
                due_date: backendTask.due_date,
                dependencies: backendTask.dependencies,
                blocker: backendTask.blocker,
                next_action: backendTask.next_action,
              }, coordinatorApiKey);
          })();
          void request.catch((error) => toast.error(`Task saved locally; backend sync failed: ${(error as Error).message}`));
        }
        setData((d) => {
          const prev = d.tasks.find((x) => x.id === t.id);
          let activities = d.activities;
          const push = (a: Omit<Activity, "id" | "timestamp" | "demo" | "actor" | "projectId" | "taskId">) => {
            activities = act({ ...d, activities }, { ...a, actor: CURRENT_USER, projectId: t.projectId, taskId: t.id });
          };
          if (isNew || !prev) push({ type: "task_created", summary: `Task created: ${t.title}` });
          else {
            const name = (id: string) => d.members.find((m) => m.id === id)?.name ?? id;
            if (prev.ownerId !== t.ownerId) push({ type: "owner_changed", summary: "Owner changed", prev: name(prev.ownerId), next: name(t.ownerId) });
            if (prev.deadline !== t.deadline) push({ type: "deadline_changed", summary: "Deadline changed", prev: prev.deadline, next: t.deadline });
            if (prev.status !== t.status) push({ type: "status_changed", summary: "Status changed", prev: prev.status, next: t.status });
            push({ type: "task_updated", summary: "Task details edited" });
          }
          const next = { ...t, lastUpdate: now() };
          return { ...d, activities, tasks: isNew ? [...d.tasks, next] : d.tasks.map((x) => (x.id === t.id ? next : x)) };
        });

        // Real-time: automatically infer dependencies when task is created or updated
        setTimeout(() => {
          void runDependencyAnalysis(t.projectId, { silent: true });
        }, 300);
      },
      deleteTask: (id) => {
        const deletedProjId = data.tasks.find((t) => t.id === id)?.projectId;
        if (base && apiReady) {
          void api.deleteTask(base, id, coordinatorApiKey).catch((error) =>
            toast.error(`Task removed locally; backend deletion failed: ${(error as Error).message}`),
          );
        }
        setData((d) => ({
          ...d,
          tasks: d.tasks.filter((t) => t.id !== id).map((t) => ({ ...t, dependsOn: t.dependsOn.filter((x) => x !== id) })),
        }));

        // Real-time: update dependencies when task is removed
        setTimeout(() => {
          void runDependencyAnalysis(deletedProjId, { silent: true });
        }, 300);
      },
      setStatus: (id, status, note) => {
        if (status === "Blocked" && !note?.trim()) {
          toast.error("Add a blocker description in the task editor before marking it blocked.");
          return;
        }
        if (base && apiReady) {
          void api.updateTask(base, id, {
            status,
            ...(status === "Blocked" ? { blocker: note } : {}),
          }, coordinatorApiKey).catch((error) =>
            toast.error(`Status changed locally; backend sync failed: ${(error as Error).message}`),
          );
        }
        setData((d) => {
          const t = d.tasks.find((x) => x.id === id);
          if (!t || t.status === status) return d;
          const blocker = status === "Blocked" ? t.blocker ?? { reason: note || "Reason not yet recorded", identifiedAt: now() } : t.blocker && !t.blocker.resolvedAt && t.status === "Blocked" ? { ...t.blocker, resolvedAt: now(), resolution: note || "Status changed manually" } : t.blocker;
          let rescueActions = d.rescueActions || [];
          let activities = act(d, { type: "status_changed", actor: CURRENT_USER, projectId: t.projectId, taskId: id, summary: "Status changed manually", prev: t.status, next: status });

          // Feature 3: Automatically complete rescue actions when upstream task finishes
          if (status === "Complete") {
            const hasAssociated = rescueActions.some((ra) => ra.delayedTaskId === id && ra.status !== "completed");
            if (hasAssociated) {
              rescueActions = rescueActions.map((ra) =>
                ra.delayedTaskId === id ? { ...ra, status: "completed" as const, updatedAt: now() } : ra,
              );
              activities = act({ ...d, activities }, {
                type: "task_updated",
                actor: CURRENT_USER,
                projectId: t.projectId,
                taskId: id,
                summary: `Prerequisite "${t.title}" completed: dependency rescue action marked resolved.`,
              });
            }
          }

          return {
            ...d,
            tasks: d.tasks.map((x) => (x.id === id ? { ...x, status, lastUpdate: now(), ...(blocker ? { blocker } : {}) } : x)),
            rescueActions,
            activities,
          };
        });
      },
      saveProject: (p, isNew) => {
        if (base && apiReady) {
          const syncAsync = async () => {
            const memberMap = new Map<string, string>();
            const backendParticipants = await api.listParticipants(base, coordinatorApiKey).catch(() => ({ participants: [] }));
            const existingByName = new Map(backendParticipants.participants.map((bp) => [bp.display_name.trim().toLowerCase(), bp]));

            for (const memberId of [p.managerId, ...p.memberIds].filter(Boolean)) {
              const localMember = data.members.find((m) => m.id === memberId);
              if (!localMember) continue;
              const byName = existingByName.get(localMember.name.trim().toLowerCase());
              if (byName) {
                memberMap.set(memberId, byName.id);
                if (
                  (localMember.role && localMember.role !== byName.role) ||
                  (localMember.department && localMember.department !== byName.department)
                ) {
                  await api.updateParticipant(base, byName.id, {
                    role: localMember.role,
                    department: localMember.department,
                  }, coordinatorApiKey).catch(() => null);
                }
              } else if (!localMember.backendParticipant) {
                try {
                  const reg = await api.registerParticipant(base, {
                    project_id: p.id,
                    display_name: localMember.name,
                    role: localMember.role || "",
                    department: localMember.department || "",
                  }, coordinatorApiKey);
                  if (reg?.participant?.id) {
                    memberMap.set(memberId, reg.participant.id);
                  }
                } catch {
                  // ignore
                }
              } else {
                memberMap.set(memberId, memberId);
              }
            }

            const mappedManagerId = memberMap.get(p.managerId) || p.managerId;
            const mappedMemberIds = p.memberIds.map((mId) => memberMap.get(mId) || mId);

            const project = {
              id: p.id,
              name: p.name,
              description: p.description,
              ...(mappedManagerId ? { manager_id: mappedManagerId } : {}),
              start_date: p.startDate,
              target_date: p.targetDate,
              milestones: p.milestones,
              member_ids: mappedMemberIds,
            };

            if (isNew) {
              await api.createProject(base, project, coordinatorApiKey);
            } else {
              await api.updateProject(base, p.id, project, coordinatorApiKey);
            }
          };

          void syncAsync().catch((error) =>
            toast.error(`Project saved locally; backend sync failed: ${(error as Error).message}`),
          );
        }
        setData((d) => {
          const prev = d.projects.find((x) => x.id === p.id);
          const prevMemberIds = prev?.memberIds || [];
          const newlyAssigned = isNew
            ? p.memberIds
            : p.memberIds.filter((mId) => !prevMemberIds.includes(mId));

          const newNotifs: AppNotification[] = newlyAssigned.map((mId) => ({
            id: uid("notif"),
            recipientId: mId,
            projectId: p.id,
            title: "New project assigned to you",
            message: `New project assigned to you: ${p.name}. Assigned by: Project Coordinator. Open your dashboard to view the project details and tasks.`,
            read: false,
            createdAt: now(),
          }));

          return {
            ...d,
            projects: isNew ? [...d.projects, p] : d.projects.map((x) => (x.id === p.id ? p : x)),
            notifications: [...newNotifs, ...(d.notifications || [])],
            activities: act(d, { type: isNew ? "project_created" : "project_updated", actor: CURRENT_USER, projectId: p.id, summary: `${isNew ? "Project created" : "Project updated"}: ${p.name}` }),
          };
        });

        // Real-time: automatically infer dependencies when project is created or updated
        setTimeout(() => {
          void runDependencyAnalysis(p.id, { silent: true });
        }, 300);
      },
      updateMember: async (id, updates) => {
        if (base && apiReady) {
          const member = data.members.find((m) => m.id === id);
          if (member?.backendParticipant) {
            await api.updateParticipant(base, id, {
              ...(updates.name ? { display_name: updates.name } : {}),
              ...(updates.role !== undefined ? { role: updates.role } : {}),
              ...(updates.department !== undefined ? { department: updates.department } : {}),
            }, coordinatorApiKey);
          }
        }
        setData((d) => ({
          ...d,
          members: d.members.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        }));
      },
      registerParticipant: async ({ projectId, name, role, department }) => {
        if (!base || !apiReady) {
          throw new Error("Connect the backend and enter the coordinator API key before registering a participant.");
        }
        const project = data.projects.find((candidate) => candidate.id === projectId);
        if (!project) throw new Error("Select a valid project.");
        const managerId = data.members.some(
          (member) => member.id === project.managerId && member.backendParticipant,
        ) ? project.managerId : undefined;
        await ensureBackendProject(project, base, coordinatorApiKey, managerId);
        const response = await api.registerParticipant(base, {
          project_id: projectId,
          display_name: name,
          role,
          department,
        }, coordinatorApiKey);
        const participant = response.participant;
        setData((d) => ({
          ...d,
          members: [
            ...d.members.filter((member) => member.id !== participant.id),
            {
              id: participant.id,
              name: participant.display_name,
              role: participant.role,
              department: participant.department,
              telegramLinked: false,
              backendParticipant: true,
            },
          ],
          projects: d.projects.map((project) =>
            project.id === projectId && !project.memberIds.includes(participant.id)
              ? { ...project, memberIds: [...project.memberIds, participant.id] }
              : project,
          ),
        }));
        return participant.telegram_link_code;
      },
      refreshParticipants: async () => {
        if (!base || !apiReady) {
          throw new Error("Connect the backend and enter the coordinator API key before refreshing participants.");
        }
        const response = await api.listParticipants(base, coordinatorApiKey);
        setData((d) => {
          const participants = response.participants.map((participant) => ({
            id: participant.id,
            name: participant.display_name,
            role: participant.role,
            department: participant.department,
            telegramLinked: participant.telegram_linked,
            backendParticipant: true,
          }));
          const members = [
            ...d.members.filter((member) => !participants.some((next) => next.id === member.id)),
            ...participants,
          ];
          const memberProjectIds = new Map<string, string[]>();
          for (const participant of response.participants) {
            for (const membership of participant.project_members) {
              const current = memberProjectIds.get(membership.project_id) ?? [];
              memberProjectIds.set(membership.project_id, [...current, participant.id]);
            }
          }
          return {
            ...d,
            members,
            projects: d.projects.map((project) => ({
              ...project,
              memberIds: [
                ...project.memberIds.filter((id) => d.members.some((m) => m.id === id)),
                ...(memberProjectIds.get(project.id) ?? []),
              ].filter((id, index, ids) => ids.indexOf(id) === index),
            })),
          };
        });
      },
      refreshTask: async (taskId) => {
        if (!base || !apiReady) throw new Error("Connect the backend and enter the coordinator API key before refreshing task data.");
        const [taskResponse, messageResponse, eventResponse] = await Promise.all([
          api.getTask(base, taskId, coordinatorApiKey),
          api.getTaskMessages(base, taskId, coordinatorApiKey),
          api.getTaskEvents(base, taskId, coordinatorApiKey),
        ]);
        const row = taskResponse.task;
        const localTask = taskOf(taskId);
        const blockerEvidence = messageResponse.messages.find(
          (message) => message.direction === "INBOUND",
        )?.message_text;
        const updatedTask: Task = {
          id: row.id,
          projectId: row.project_id,
          title: row.title,
          description: row.description,
          ownerId: row.assignee_id ?? "",
          team: data.members.find((member) => member.id === row.assignee_id)?.department ?? "Engineering",
          deadline: row.due_date ?? localTask?.deadline ?? "",
          priority: row.priority,
          status: ({
            TODO: "Pending",
            IN_PROGRESS: "In Progress",
            BLOCKED: "Blocked",
            COMPLETE: "Complete",
          } as const)[row.status],
          dependsOn: row.dependencies ?? [],
          acceptanceCriteria: row.acceptance_criteria ?? [],
          nextAction: row.next_action || localTask?.nextAction || "",
          ...(row.blocker
            ? {
                blocker: {
                reason: row.blocker,
                identifiedAt: row.updated_at,
                ...(blockerEvidence ? { evidence: blockerEvidence } : {}),
                },
              }
            : {}),
          lastUpdate: row.updated_at,
          createdAt: row.created_at,
        };
        const incomingMessages = messageResponse.messages
          .filter((message) => message.direction === "INBOUND")
          .map((message) => ({
            id: message.id,
            taskId,
            memberId: row.assignee_id ?? "",
            direction: "in" as const,
            text: message.message_text,
            timestamp: message.created_at,
            delivery: message.processing_status === "FAILED" ? "failed" as const : "sent" as const,
            demo: false,
          }));
        const incomingEvents = eventResponse.events.map((event) => ({
          id: event.id,
          type: "interpretation" as const,
          projectId: row.project_id,
          taskId,
          actor: "AI coordinator",
          timestamp: event.created_at,
          summary: event.analysis?.explanation ?? `Task update: ${event.next_status ?? "needs clarification"}`,
          ...(event.previous_status ? { prev: event.previous_status } : {}),
          ...(event.next_status ? { next: event.next_status } : {}),
          ...(event.evidence ? { evidence: event.evidence } : {}),
          demo: false,
        }));
        setData((d) => {
          const tasks: Task[] = d.tasks.some((task) => task.id === taskId)
            ? d.tasks.map((task): Task => {
                if (task.id !== taskId) return task;
                const current = { ...task };
                if (!row.blocker) delete current.blocker;
                return { ...current, ...updatedTask };
              })
            : [...d.tasks, updatedTask];
          return {
            ...d,
            tasks,
            messages: [
              ...d.messages.filter((message) => message.taskId !== taskId || message.direction !== "in"),
              ...incomingMessages,
            ],
            activities: [
              ...incomingEvents,
              ...d.activities.filter((activity) => !incomingEvents.some((event) => event.id === activity.id)),
            ],
          };
        });
      },
      requestUpdate: async (taskId, text) => {
        const t = taskOf(taskId);
        if (!t) return;
        const dup = data.messages.find((m) => m.taskId === taskId && m.direction === "out" && Date.now() - new Date(m.timestamp).getTime() < 60_000);
        if (dup) {
          toast.warning("An update was requested for this task less than a minute ago.");
          return;
        }
        const sentToday = data.messages.filter((m) => m.memberId === t.ownerId && m.direction === "out" && Date.now() - new Date(m.timestamp).getTime() < 86400000).length;
        if (sentToday >= data.settings.reminders.maxRemindersPerDay) {
          toast.error(`Reminder limit reached (${data.settings.reminders.maxRemindersPerDay}/day) for this participant.`);
          return;
        }
        if (base && apiReady) {
          const id = uid("msg");
          try {
            const r = await api.requestUpdate(base, taskId, { member_id: t.ownerId, text }, coordinatorApiKey);
            setData((d) => ({
              ...d,
              messages: [{ id: r.message_id || id, taskId, memberId: t.ownerId, direction: "out", text, timestamp: now(), delivery: r.delivery, ...(r.error ? { error: r.error } : {}), demo: false }, ...d.messages],
              activities: act(d, { type: "followup_sent", actor: CURRENT_USER, projectId: t.projectId, taskId, summary: `Follow-up via Telegram — ${r.delivery}`, evidence: text }),
            }));
            if (r.delivery === "failed") toast.error(`Delivery failed: ${r.error ?? "unknown"}`);
            else toast.success(`Follow-up ${r.delivery} via backend`);
          } catch (e) {
            setData((d) => ({ ...d, messages: [{ id, taskId, memberId: t.ownerId, direction: "out", text, timestamp: now(), delivery: "failed", error: (e as Error).message, demo: false }, ...d.messages] }));
            toast.error((e as Error).message);
          }
          return;
        }
        if (!data.settings.demoMode) {
          toast.error("Messaging backend is not connected. Configure it in Settings or enable demo mode.");
          return;
        }
        setData((d) => ({
          ...d,
          messages: [{ id: uid("msg"), taskId, memberId: t.ownerId, direction: "out", text, timestamp: now(), delivery: "demo", demo: true }, ...d.messages],
          activities: act(d, { type: "followup_sent", actor: CURRENT_USER, projectId: t.projectId, taskId, summary: "Demo follow-up recorded (NOT sent — no messaging backend)", evidence: text, demo: true }),
        }));
        toast.info("Demo mode: follow-up recorded locally. No real message was sent.");
      },
      organizeMeet: async (projectId, meetData) => {
        const p = data.projects.find((proj) => proj.id === projectId);
        if (!p) throw new Error("Project not found.");
        const meetingTitle = (meetData.title || "").trim() || `${p.name} Team Sync`;
        const roomTag = p.id.toLowerCase().replace(/[^a-z0-9]/g, "");
        const meetingUrl = (meetData.meetingUrl || "").trim() || `https://meet.jit.si/projectpilot-${roomTag || "room"}-${Date.now().toString(36)}`;
        const agenda = (meetData.agenda || "").trim();

        if (base && apiReady) {
          try {
            const res = await api.organizeMeet(
              base,
              projectId,
              {
                title: meetingTitle,
                meeting_url: meetingUrl,
                agenda,
                organizer_name: CURRENT_USER,
              },
              coordinatorApiKey,
            );

            setData((d) => ({
              ...d,
              activities: act(d, {
                type: "manual",
                actor: CURRENT_USER,
                projectId,
                summary: `📹 Organized Team Meet: "${meetingTitle}" (${res.delivered_count} Telegram alerts sent)`,
                evidence: meetingUrl,
              }),
            }));

            if (res.delivered_count > 0) {
              toast.success(`Meeting alert broadcasted to ${res.delivered_count} team members on Telegram!`);
            } else {
              toast.info("Meeting created! (No team members currently have linked Telegram accounts).");
            }

            return res;
          } catch (err) {
            toast.error((err as Error).message);
            throw err;
          }
        }

        // Demo fallback
        setData((d) => ({
          ...d,
          activities: act(d, {
            type: "manual",
            actor: CURRENT_USER,
            projectId,
            summary: `📹 [Demo] Team Meet organized: "${meetingTitle}"`,
            evidence: meetingUrl,
            demo: true,
          }),
        }));
        toast.success(`[Demo] Team meet organized for "${meetingTitle}"`);
        return { success: true, delivered_count: p.memberIds.length, meeting_url: meetingUrl };
      },
      addEvent: (ev) => {
        const id = uid("ev");
        const newEvent: ScheduledEvent = {
          ...ev,
          id,
          createdAt: now(),
        };
        setData((d) => ({
          ...d,
          events: [...(d.events || []), newEvent],
          activities: act(d, {
            type: "event_scheduled",
            actor: CURRENT_USER,
            projectId: ev.projectId,
            summary: `📅 Scheduled: "${ev.title}" on ${ev.date}${ev.time ? ` at ${ev.time}` : ""}`,
            evidence: ev.meetingUrl || ev.description || "",
          }),
        }));
        toast.success(`Event "${ev.title}" scheduled!`);
      },
      deleteEvent: (id) => {
        setData((d) => {
          const target = (d.events || []).find((e) => e.id === id);
          return {
            ...d,
            events: (d.events || []).filter((e) => e.id !== id),
            ...(target
              ? {
                  activities: act(d, {
                    type: "event_cancelled",
                    actor: CURRENT_USER,
                    projectId: target.projectId,
                    summary: `🗑️ Removed scheduled event: "${target.title}"`,
                  }),
                }
              : {}),
          };
        });
        toast.info("Event removed from schedule.");
      },
      simulateReply: (taskId, text) => {
        const t = taskOf(taskId);
        if (!t || !text.trim()) return;
        const msgId = uid("msg");
        const r = interpretReplyDemo(text);
        const proposal: Proposal = {
          id: uid("pr"), taskId, messageId: msgId, originalMessage: text, extracted: r.extracted,
          proposedStatus: r.proposedStatus, evidence: r.evidence, clarity: r.clarity,
          ...(r.blockerReason ? { blockerReason: r.blockerReason } : {}),
          source: "demo-rules", state: "pending", demo: true,
        };
        setData((d) => {
          let activities = act(d, { type: "reply_received", actor: "Demo simulated participant", projectId: t.projectId, taskId, summary: "Simulated reply entered (demo)", evidence: text, demo: true });
          activities = act({ ...d, activities }, { type: "interpretation", actor: "Demo keyword rules", projectId: t.projectId, taskId, summary: `Proposed: ${r.proposedStatus ?? "needs clarification"} (${r.clarity})`, evidence: r.evidence.join(", ") || "none", demo: true });
          return {
            ...d,
            messages: [{ id: msgId, taskId, memberId: t.ownerId, direction: "in", text, timestamp: now(), delivery: "demo", demo: true }, ...d.messages],
            proposals: [proposal, ...d.proposals],
            activities,
          };
        });
        toast.info("Simulated reply added. Review the proposed update in the AI Coordinator.");
      },
      decideProposal: (id, approve) =>
        setData((d) => {
          const p = d.proposals.find((x) => x.id === id);
          if (!p || p.state !== "pending") return d;
          const t = d.tasks.find((x) => x.id === p.taskId);
          if (!t) return d;
          const proposals = d.proposals.map((x) => (x.id === id ? { ...x, state: approve ? ("approved" as const) : ("rejected" as const), decidedAt: now() } : x));
          if (!approve || !p.proposedStatus) {
            return { ...d, proposals, activities: act(d, { type: "proposal_rejected", actor: CURRENT_USER, projectId: t.projectId, taskId: t.id, summary: "Proposed update rejected", next: p.proposedStatus ?? "—", demo: p.demo }) };
          }
          const status = p.proposedStatus;
          const blocker = status === "Blocked"
            ? { reason: p.blockerReason ?? p.extracted, identifiedAt: now(), evidence: p.originalMessage }
            : t.blocker && t.status === "Blocked" ? { ...t.blocker, resolvedAt: now(), resolution: `Participant reply: "${p.originalMessage}"` } : t.blocker;
          let activities = act(d, { type: "proposal_approved", actor: CURRENT_USER, projectId: t.projectId, taskId: t.id, summary: "Proposed status update approved", prev: t.status, next: status, evidence: p.originalMessage, demo: p.demo });
          if (status === "Blocked") activities = act({ ...d, activities }, { type: "blocker_detected", actor: CURRENT_USER, projectId: t.projectId, taskId: t.id, summary: `Blocker recorded: ${blocker?.reason}`, demo: p.demo });
          const tasks: Task[] = d.tasks.map((x): Task => {
            if (x.id !== t.id) return x;
            const updated: Task = { ...x, status, lastUpdate: now() };
            if (blocker) updated.blocker = blocker;
            else delete updated.blocker;
            return updated;
          });
          return {
            ...d,
            proposals,
            activities,
            tasks,
          };
        }),
      resolveBlocker: (taskId, resolution, nextStatus) =>
        {
          if (base && apiReady) {
            void api.updateTask(base, taskId, { status: nextStatus, blocker: null }, coordinatorApiKey)
              .catch((error) => toast.error(`Blocker resolved locally; backend sync failed: ${(error as Error).message}`));
          }
          setData((d) => {
            const t = d.tasks.find((x) => x.id === taskId);
            if (!t?.blocker) return d;
            const tasks: Task[] = d.tasks.map((x): Task => {
              if (x.id !== taskId) return x;
              return {
                ...x,
                status: nextStatus,
                lastUpdate: now(),
                blocker: { ...t.blocker!, resolution, resolvedAt: now() },
              };
            });
            return {
              ...d,
              tasks,
              activities: act(d, { type: "blocker_resolved", actor: CURRENT_USER, projectId: t.projectId, taskId, summary: `Blocker resolved: ${resolution}`, prev: t.status, next: nextStatus }),
            };
          });
        },
      setNextAction: (taskId, action, resolver) =>
        setData((d) => {
          const t = d.tasks.find((x) => x.id === taskId);
          if (!t) return d;
          const tasks: Task[] = d.tasks.map((x): Task => {
            if (x.id !== taskId) return x;
            const updated: Task = { ...x, nextAction: action };
            if (x.blocker && resolver !== undefined) {
              const blocker = { ...x.blocker };
              if (resolver) blocker.requiredResolver = resolver;
              else delete blocker.requiredResolver;
              updated.blocker = blocker;
            }
            return updated;
          });
          return {
            ...d,
            tasks,
            activities: act(d, { type: "task_updated", actor: CURRENT_USER, projectId: t.projectId, taskId, summary: "Next action assigned", prev: t.nextAction, next: action }),
          };
        }),
      syncWithBackend,
      markNotificationRead: async (id: string) => {
        if (base && apiReady) {
          void api.markNotificationRead(base, id, undefined, coordinatorApiKey).catch(() => null);
        }
        setData((d) => ({
          ...d,
          notifications: (d.notifications || []).map((n) => (n.id === id ? { ...n, read: true } : n)),
        }));
      },
      approveRescueAction: (id: string, notes?: string) => {
        setData((d) => {
          const action = (d.rescueActions || []).find((a) => a.id === id);
          if (!action) return d;
          const delayedTask = d.tasks.find((t) => t.id === action.delayedTaskId);
          const updatedActions = (d.rescueActions || []).map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: "approved" as const,
                  mockContractDetails: notes || a.mockContractDetails || "Agreed mock contract in place",
                  updatedAt: now(),
                }
              : a,
          );
          return {
            ...d,
            rescueActions: updatedActions,
            activities: act(d, {
              type: "proposal_approved",
              actor: CURRENT_USER,
              projectId: delayedTask?.projectId,
              taskId: delayedTask?.id,
              summary: `Recovery strategy approved: ${action.title}`,
              evidence: notes || action.rationale,
            }),
          };
        });
        toast.success("Recovery strategy approved. Downstream team notified.");
      },
      rejectRescueAction: (id: string) => {
        setData((d) => {
          const action = (d.rescueActions || []).find((a) => a.id === id);
          if (!action) return d;
          const delayedTask = d.tasks.find((t) => t.id === action.delayedTaskId);
          return {
            ...d,
            rescueActions: (d.rescueActions || []).map((a) =>
              a.id === id ? { ...a, status: "rejected" as const, updatedAt: now() } : a,
            ),
            activities: act(d, {
              type: "proposal_rejected",
              actor: CURRENT_USER,
              projectId: delayedTask?.projectId,
              taskId: delayedTask?.id,
              summary: `Recovery recommendation rejected: ${action.title}`,
            }),
          };
        });
        toast.info("Recovery recommendation rejected.");
      },
      completeRescueAction: (id: string) => {
        setData((d) => {
          const action = (d.rescueActions || []).find((a) => a.id === id);
          if (!action) return d;
          const delayedTask = d.tasks.find((t) => t.id === action.delayedTaskId);
          return {
            ...d,
            rescueActions: (d.rescueActions || []).map((a) =>
              a.id === id ? { ...a, status: "completed" as const, updatedAt: now() } : a,
            ),
            activities: act(d, {
              type: "task_updated",
              actor: CURRENT_USER,
              projectId: delayedTask?.projectId,
              taskId: delayedTask?.id,
              summary: `Recovery action marked completed: ${action.title}`,
            }),
          };
        });
        toast.success("Recovery action marked completed.");
      },
      isAnalyzingDependencies,
      analyzeProjectDependencies: runDependencyAnalysis,
      confirmDependency: async (prerequisiteTaskId: string, dependentTaskId: string) => {
        const depTask = data.tasks.find((t) => t.id === dependentTaskId);
        const prereqTask = data.tasks.find((t) => t.id === prerequisiteTaskId);
        const projId = depTask?.projectId || selectedProjectId;

        if (base && apiReady && projId) {
          try {
            await api.confirmDependency(base, projId, { prerequisiteTaskId, dependentTaskId }, coordinatorApiKey);
          } catch (err: unknown) {
            console.warn("Backend confirmDependency failed, applying locally:", err);
          }
        }

        setData((prev) => {
          const updatedDeps = (prev.taskDependencies || []).map((edge) => {
            if (edge.prerequisiteTaskId === prerequisiteTaskId && edge.dependentTaskId === dependentTaskId) {
              return { ...edge, status: "CONFIRMED" as const, updatedAt: now() };
            }
            return edge;
          });

          const updatedTasks = prev.tasks.map((t) => {
            if (t.id === dependentTaskId) {
              const curDeps = t.dependsOn || [];
              if (!curDeps.includes(prerequisiteTaskId)) {
                return { ...t, dependsOn: [...curDeps, prerequisiteTaskId], lastUpdate: now() };
              }
            }
            return t;
          });

          return {
            ...prev,
            taskDependencies: updatedDeps,
            tasks: updatedTasks,
            activities: act(prev, {
              type: "proposal_approved",
              actor: CURRENT_USER,
              projectId: projId,
              taskId: dependentTaskId,
              summary: `Confirmed dependency: "${prereqTask?.title || prerequisiteTaskId}" → "${depTask?.title || dependentTaskId}"`,
            }),
          };
        });
        toast.success(`Dependency confirmed: "${prereqTask?.title || prerequisiteTaskId}" → "${depTask?.title || dependentTaskId}"`);
      },
      rejectDependency: async (prerequisiteTaskId: string, dependentTaskId: string) => {
        const depTask = data.tasks.find((t) => t.id === dependentTaskId);
        const prereqTask = data.tasks.find((t) => t.id === prerequisiteTaskId);
        const projId = depTask?.projectId || selectedProjectId;

        if (base && apiReady && projId) {
          try {
            await api.rejectDependency(base, projId, { prerequisiteTaskId, dependentTaskId }, coordinatorApiKey);
          } catch (err: unknown) {
            console.warn("Backend rejectDependency failed, applying locally:", err);
          }
        }

        setData((prev) => {
          const updatedDeps = (prev.taskDependencies || []).map((edge) => {
            if (edge.prerequisiteTaskId === prerequisiteTaskId && edge.dependentTaskId === dependentTaskId) {
              return { ...edge, status: "REJECTED" as const, updatedAt: now() };
            }
            return edge;
          });

          const updatedTasks = prev.tasks.map((t) => {
            if (t.id === dependentTaskId) {
              return { ...t, dependsOn: (t.dependsOn || []).filter((d) => d !== prerequisiteTaskId), lastUpdate: now() };
            }
            return t;
          });

          return {
            ...prev,
            taskDependencies: updatedDeps,
            tasks: updatedTasks,
            activities: act(prev, {
              type: "proposal_rejected",
              actor: CURRENT_USER,
              projectId: projId,
              taskId: dependentTaskId,
              summary: `Rejected dependency proposal: "${prereqTask?.title || prerequisiteTaskId}" → "${depTask?.title || dependentTaskId}"`,
            }),
          };
        });
        toast.info("Dependency proposal rejected.");
      },
      deleteDependency: async (prerequisiteTaskId: string, dependentTaskId: string) => {
        const depTask = data.tasks.find((t) => t.id === dependentTaskId);
        const projId = depTask?.projectId || selectedProjectId;

        if (base && apiReady && projId) {
          try {
            await api.deleteDependency(base, projId, { prerequisiteTaskId, dependentTaskId }, coordinatorApiKey);
          } catch (err: unknown) {
            console.warn("Backend deleteDependency failed, applying locally:", err);
          }
        }

        setData((prev) => ({
          ...prev,
          taskDependencies: (prev.taskDependencies || []).filter(
            (d) => !(d.prerequisiteTaskId === prerequisiteTaskId && d.dependentTaskId === dependentTaskId),
          ),
          tasks: prev.tasks.map((t) => {
            if (t.id === dependentTaskId) {
              return { ...t, dependsOn: (t.dependsOn || []).filter((id) => id !== prerequisiteTaskId), lastUpdate: now() };
            }
            return t;
          }),
        }));
        toast.success("Dependency removed.");
      },
      updateSettings: (s) => setData((d) => ({ ...d, settings: s })),
      resetDemo: () => {
        setData(createDemoData());
        toast.success("Demo data reset.");
      },
    };
  }, [data, selectedProjectId, openTaskId, calendarOpen, taskDialog, backend, checkBackend, base, coordinatorApiKey, setCoordinatorApiKey, apiReady, syncWithBackend, isAnalyzingDependencies]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used within StoreProvider");
  return s;
}

/** Tasks scoped to the header project selector. */
export function useScopedTasks() {
  const { data, selectedProjectId } = useStore();
  return selectedProjectId === "all" ? data.tasks : data.tasks.filter((t) => t.projectId === selectedProjectId);
}

export function useLookup() {
  const { data } = useStore();
  return useMemo(
    () => ({
      member: (id: string) => data.members.find((m) => m.id === id),
      project: (id: string) => data.projects.find((p) => p.id === id),
      task: (id: string) => data.tasks.find((t) => t.id === id),
    }),
    [data],
  );
}
