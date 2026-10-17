import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createDemoData } from "./demo-data";
import { api, resolveBackendUrl, type HealthResponse } from "./api";
import { interpretReplyDemo } from "./rules";
import type { Activity, AppData, Project, Proposal, ScheduledEvent, Settings, Task, TaskStatus } from "./types";

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
  logActivity: (a: Omit<Activity, "id" | "timestamp" | "actor" | "demo">) => void;
  updateSettings: (s: Settings) => void;
  resetDemo: () => void;
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
        setData(parsed);
      }
    } catch {
      /* corrupt storage — keep fresh demo data */
    }
    setHydrated(true);
  }, []);
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
      const [participantRes, taskRes, eventRes, msgRes] = await Promise.all([
        api.listParticipants(base, coordinatorApiKey).catch(() => null),
        api.listTasks(base, undefined, coordinatorApiKey).catch(() => null),
        api.listEvents(base, undefined, coordinatorApiKey).catch(() => null),
        api.listMessages(base, coordinatorApiKey).catch(() => null),
      ]);

      setData((d) => {
        let changed = false;
        let members = d.members;
        let projects = d.projects;
        let tasks = d.tasks;
        let activities = d.activities;
        let messages = d.messages;

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

            if (!statusChanged && !blockerChanged && !nextActionChanged) {
              return localTask;
            }

            changed = true;
            return {
              ...localTask,
              title: remote.title || localTask.title,
              description: remote.description ?? localTask.description,
              ownerId: remote.assignee_id ?? localTask.ownerId,
              status: newStatus,
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

        if (!changed) return d;
        return {
          ...d,
          members,
          projects,
          tasks,
          activities,
          messages,
        };
      });
    } catch {
      // background sync is silent
    }
  }, [base, coordinatorApiKey, apiReady]);

  useEffect(() => {
    if (!apiReady) return;
    void syncWithBackend();
    const interval = setInterval(() => {
      void syncWithBackend();
    }, 3000);
    return () => clearInterval(interval);
  }, [apiReady, syncWithBackend]);

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
      },
      deleteTask: (id) => {
        if (base && apiReady) {
          void api.deleteTask(base, id, coordinatorApiKey).catch((error) =>
            toast.error(`Task removed locally; backend deletion failed: ${(error as Error).message}`),
          );
        }
        setData((d) => ({
          ...d,
          tasks: d.tasks.filter((t) => t.id !== id).map((t) => ({ ...t, dependsOn: t.dependsOn.filter((x) => x !== id) })),
        }));
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
          return {
            ...d,
            tasks: d.tasks.map((x) => (x.id === id ? { ...x, status, lastUpdate: now(), ...(blocker ? { blocker } : {}) } : x)),
            activities: act(d, { type: "status_changed", actor: CURRENT_USER, projectId: t.projectId, taskId: id, summary: "Status changed manually", prev: t.status, next: status }),
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
        setData((d) => ({
          ...d,
          projects: isNew ? [...d.projects, p] : d.projects.map((x) => (x.id === p.id ? p : x)),
          activities: act(d, { type: isNew ? "project_created" : "project_updated", actor: CURRENT_USER, projectId: p.id, summary: `${isNew ? "Project created" : "Project updated"}: ${p.name}` }),
        }));
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
      updateSettings: (s) => setData((d) => ({ ...d, settings: s })),
      resetDemo: () => {
        setData(createDemoData());
        toast.success("Demo data reset.");
      },
    };
  }, [data, selectedProjectId, openTaskId, calendarOpen, taskDialog, backend, checkBackend, base, coordinatorApiKey, setCoordinatorApiKey, apiReady, syncWithBackend]);

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
