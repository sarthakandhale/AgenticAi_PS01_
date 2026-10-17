import { useState } from "react";
import { toast } from "sonner";
import { Check, MessageSquare, Pencil, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function TeamView() {
  const { data, backend, coordinatorApiKey, registerParticipant, refreshParticipants, updateMember } = useStore();
  const backendAuthorized = backend.state === "ok" && !!coordinatorApiKey && !!backend.health.coordinatorAuth?.configured;
  const botUsername = backend.state === "ok" ? backend.health.telegram.bot_username : undefined;
  const botUrl = botUsername ? `https://t.me/${botUsername}` : null;
  const [projectId, setProjectId] = useState(data.projects[0]?.id ?? "");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [issuedCode, setIssuedCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Edit member modal state
  const [editingMember, setEditingMember] = useState<{ id: string; name: string; role: string; department: string } | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const registrationDisabledReason =
    backend.state === "checking"
      ? "Checking the backend connection…"
      : backend.state === "error"
        ? `Backend connection failed: ${backend.error}`
        : backend.state !== "ok"
          ? "Set the backend URL in Settings and verify the connection."
          : !coordinatorApiKey
            ? "Enter the coordinator API key in Settings. The key is stored per browser tab."
            : !backend.health.coordinatorAuth?.configured
              ? "Configure COORDINATOR_API_KEY in backend/.env and restart the backend."
              : !projectId
                ? "Select a project to register this teammate."
                : !name.trim()
                  ? "Enter the teammate's name to continue."
                  : null;

  const register = async () => {
    setBusy(true);
    try {
      const code = await registerParticipant({ projectId, name, role, department });
      setIssuedCode(code);
      setName("");
      setRole("");
      setDepartment("");
      toast.success("Participant registered and reflected in database. Share the one-time code privately.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveEditMember = async () => {
    if (!editingMember) return;
    setEditBusy(true);
    try {
      await updateMember(editingMember.id, {
        name: editingMember.name,
        role: editingMember.role,
        department: editingMember.department,
      });
      toast.success("Member role & department updated in database.");
      setEditingMember(null);
    } catch (error) {
      toast.error(`Update failed: ${(error as Error).message}`);
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Register a Telegram participant</h2>
        <p className="mt-1 text-sm text-muted-foreground">Creates a project member with their assigned role and department in the database, valid for 30 minutes.</p>
        {botUrl && <p className="mt-1 text-sm">ProjectPilot bot: <a className="font-medium text-primary underline underline-offset-4" href={botUrl} target="_blank" rel="noreferrer">@{botUsername}</a> — share the personal link below with each teammate.</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Project</Label><Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger><SelectContent>{data.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label htmlFor="participant-name">Name</Label><Input id="participant-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="participant-role">Role (e.g. Frontend Developer)</Label><Input id="participant-role" value={role} onChange={(event) => setRole(event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="participant-department">Department (e.g. Engineering)</Label><Input id="participant-department" value={department} onChange={(event) => setDepartment(event.target.value)} /></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void register()} disabled={busy || !projectId || !name.trim() || !backendAuthorized}>{busy ? "Registering…" : "Create participant & link code"}</Button>
          <Button variant="outline" disabled={!backendAuthorized} onClick={() => void refreshParticipants().then(() => toast.success("Participant list refreshed")).catch((error) => toast.error((error as Error).message))}>Refresh Telegram status</Button>
        </div>
        {!busy && registrationDisabledReason && <p role="status" className="mt-2 text-sm text-muted-foreground">{registrationDisabledReason} {registrationDisabledReason.includes("Settings") && <a className="font-medium text-primary underline underline-offset-4" href="/settings">Open Settings</a>}</p>}
        {issuedCode && <p className="mt-3 rounded-md border bg-muted p-3 text-sm">Share this private link with the participant. Opening it starts the bot and links their Telegram account: {botUrl ? <a className="font-medium text-primary underline underline-offset-4" href={`${botUrl}?start=${encodeURIComponent(issuedCode)}`} target="_blank" rel="noreferrer">{botUrl}?start={issuedCode}</a> : <code>/start {issuedCode}</code>}. The code is single-use and expires in 30 minutes.</p>}
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.members.map((m) => {
          const mine = data.tasks.filter((t) => t.ownerId === m.id);
          const doneCount = mine.filter((t) => t.status === "Complete").length;
          const blockedCount = mine.filter((t) => t.status === "Blocked").length;
          const memberMessages = data.messages.filter((msg) => msg.memberId === m.id || mine.some((t) => t.id === msg.taskId));
          const latestInbound = memberMessages.filter((msg) => msg.direction === "in")[0];

          return (
            <div key={m.id} className="rounded-lg border bg-card p-4 text-sm shadow-sm flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0">
                      {m.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <span>{m.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingMember({ id: m.id, name: m.name, role: m.role || "", department: m.department || "" })}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="text-xs font-normal text-muted-foreground">
                        {m.role || "No role specified"} {m.department && `· ${m.department}`}
                      </div>
                    </div>
                  </div>
                  {m.telegramLinked ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Linked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted border px-2 py-0.5 rounded-full shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> Not linked
                    </span>
                  )}
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Projects: {data.projects.filter((p) => p.memberIds.includes(m.id)).map((p) => p.name).join(", ") || "—"}
                </div>

                {/* Latest Telegram message if present */}
                {latestInbound && (
                  <div className="mt-2 text-xs rounded border bg-emerald-500/10 border-emerald-500/20 px-2.5 py-1.5 text-emerald-700 dark:text-emerald-300 flex items-start gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600" />
                    <div className="truncate">
                      <span className="font-semibold">Telegram update:</span> "{latestInbound.text}"
                    </div>
                  </div>
                )}

                {/* Assigned Tasks list */}
                <div className="mt-2.5 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Assigned Tasks ({mine.length}):
                  </div>
                  {mine.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No tasks assigned yet</div>
                  ) : (
                    <div className="space-y-1">
                      {mine.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 text-xs rounded border bg-muted/20 px-2 py-1">
                          <span className="truncate font-medium">{t.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            t.status === "Complete" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold" :
                            t.status === "In Progress" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                            t.status === "Blocked" ? "bg-destructive/15 text-destructive" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {t.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t text-xs text-muted-foreground flex justify-between">
                <span>Summary: {mine.length} tasks</span>
                <span>{doneCount} done · {blockedCount} blocked</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Role & Department Dialog */}
      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Member Profile</DialogTitle>
          </DialogHeader>
          {editingMember && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editingMember.name}
                  onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-role">Role (e.g. Frontend Developer, QA Lead)</Label>
                <Input
                  id="edit-role"
                  value={editingMember.role}
                  onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-dept">Department (e.g. Engineering, Platform)</Label>
                <Input
                  id="edit-dept"
                  value={editingMember.department}
                  onChange={(e) => setEditingMember({ ...editingMember, department: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)} disabled={editBusy}>Cancel</Button>
            <Button onClick={() => void saveEditMember()} disabled={editBusy}>
              {editBusy ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
