import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createDemoData } from "./demo-data";
import { api, resolveBackendUrl, type HealthResponse } from "./api";
import { interpretReplyDemo } from "./rules";
import type { Activity, AppData, Project, Proposal, Settings, Task, TaskStatus } from "./types";

const KEY = "projectpilot.demo.v1";
const CURRENT_USER = "Priya Raman";
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const now = () => new Date().toISOString();

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
  taskDialog: { open: boolean; task?: Task };
  openTaskDialog: (task?: Task) => void;
  closeTaskDialog: () => void;
  backend: BackendState;
  checkBackend: () => Promise<void>;
  saveTask: (t: Task, isNew: boolean) => void;
  deleteTask: (id: string) => void;
  setStatus: (id: string, status: TaskStatus, note?: string) => void;
  saveProject: (p: Project, isNew: boolean) => void;
  requestUpdate: (taskId: string, text: string) => Promise<void>;
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
  const hydrated = useRef(false);
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task?: Task }>({ open: false });
  const [backend, setBackend] = useState<BackendState>({ state: "unconfigured" });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setData(JSON.parse(raw) as AppData);
    } catch {
      /* corrupt storage — keep fresh demo data */
    }
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (hydrated.current) localStorage.setItem(KEY, JSON.stringify(data));
  }, [data]);

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

  const store: Store = useMemo(() => {
    const taskOf = (id: string) => data.tasks.find((t) => t.id === id);
    return {
      data,
      currentUser: CURRENT_USER,
      selectedProjectId,
      setSelectedProjectId,
      openTaskId,
      setOpenTaskId,
      taskDialog,
      openTaskDialog: (task) => setTaskDialog({ open: true, ...(task ? { task } : {}) }),
      closeTaskDialog: () => setTaskDialog({ open: false }),
      backend,
      checkBackend,
      logActivity: (a) => setData((d) => ({ ...d, activities: act(d, { ...a, actor: CURRENT_USER }) })),
      saveTask: (t, isNew) =>
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
        }),
      deleteTask: (id) =>
        setData((d) => ({
          ...d,
          tasks: d.tasks.filter((t) => t.id !== id).map((t) => ({ ...t, dependsOn: t.dependsOn.filter((x) => x !== id) })),
        })),
      setStatus: (id, status, note) =>
        setData((d) => {
          const t = d.tasks.find((x) => x.id === id);
          if (!t || t.status === status) return d;
          const blocker = status === "Blocked" ? t.blocker ?? { reason: note || "Reason not yet recorded", identifiedAt: now() } : t.blocker && !t.blocker.resolvedAt && t.status === "Blocked" ? { ...t.blocker, resolvedAt: now(), resolution: note || "Status changed manually" } : t.blocker;
          return {
            ...d,
            tasks: d.tasks.map((x) => (x.id === id ? { ...x, status, lastUpdate: now(), ...(blocker ? { blocker } : {}) } : x)),
            activities: act(d, { type: "status_changed", actor: CURRENT_USER, projectId: t.projectId, taskId: id, summary: "Status changed manually", prev: t.status, next: status }),
          };
        }),
      saveProject: (p, isNew) =>
        setData((d) => ({
          ...d,
          projects: isNew ? [...d.projects, p] : d.projects.map((x) => (x.id === p.id ? p : x)),
          activities: act(d, { type: isNew ? "project_created" : "project_updated", actor: CURRENT_USER, projectId: p.id, summary: `${isNew ? "Project created" : "Project updated"}: ${p.name}` }),
        })),
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
        if (base && backend.state === "ok") {
          const id = uid("msg");
          try {
            const r = await api.requestUpdate(base, taskId, { member_id: t.ownerId, text });
            setData((d) => ({
              ...d,
              messages: [{ id: r.message_id || id, taskId, memberId: t.ownerId, direction: "out", text, timestamp: now(), delivery: r.delivery, ...(r.error ? { error: r.error } : {}), demo: false }, ...d.messages],
              activities: act(d, { type: "followup_sent", actor: CURRENT_USER, projectId: t.projectId, taskId, summary: `Follow-up via Telegram — ${r.delivery}`, evidence: text }),
            }));
            r.delivery === "failed" ? toast.error(`Delivery failed: ${r.error ?? "unknown"}`) : toast.success(`Follow-up ${r.delivery} via backend`);
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
          return {
            ...d,
            proposals,
            activities,
            tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, status, lastUpdate: now(), ...(blocker ? { blocker } : {}) } : x)),
          };
        }),
      resolveBlocker: (taskId, resolution, nextStatus) =>
        setData((d) => {
          const t = d.tasks.find((x) => x.id === taskId);
          if (!t?.blocker) return d;
          return {
            ...d,
            tasks: d.tasks.map((x) => (x.id === taskId ? { ...x, status: nextStatus, lastUpdate: now(), blocker: { ...t.blocker!, resolution, resolvedAt: now() } } : x)),
            activities: act(d, { type: "blocker_resolved", actor: CURRENT_USER, projectId: t.projectId, taskId, summary: `Blocker resolved: ${resolution}`, prev: t.status, next: nextStatus }),
          };
        }),
      setNextAction: (taskId, action, resolver) =>
        setData((d) => {
          const t = d.tasks.find((x) => x.id === taskId);
          if (!t) return d;
          return {
            ...d,
            tasks: d.tasks.map((x) => (x.id === taskId ? { ...x, nextAction: action, ...(x.blocker && resolver !== undefined ? { blocker: { ...x.blocker, requiredResolver: resolver || undefined } as Task["blocker"] } : {}) } : x)),
            activities: act(d, { type: "task_updated", actor: CURRENT_USER, projectId: t.projectId, taskId, summary: "Next action assigned", prev: t.nextAction, next: action }),
          };
        }),
      updateSettings: (s) => setData((d) => ({ ...d, settings: s })),
      resetDemo: () => {
        setData(createDemoData());
        toast.success("Demo data reset.");
      },
    };
  }, [data, selectedProjectId, openTaskId, taskDialog, backend, checkBackend, base]);

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
