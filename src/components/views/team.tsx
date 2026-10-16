import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function TeamView() {
  const { data, backend, coordinatorApiKey, registerParticipant, refreshParticipants } = useStore();
  const backendAuthorized = backend.state === "ok" && !!coordinatorApiKey && !!backend.health.coordinatorAuth?.configured;
  const botUsername = backend.state === "ok" ? backend.health.telegram.bot_username : undefined;
  const botUrl = botUsername ? `https://t.me/${botUsername}` : null;
  const [projectId, setProjectId] = useState(data.projects[0]?.id ?? "");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [issuedCode, setIssuedCode] = useState("");
  const [busy, setBusy] = useState(false);
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
      toast.success("Participant registered. Share the one-time code privately.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Register a Telegram participant</h2>
        <p className="mt-1 text-sm text-muted-foreground">Creates a project member and a one-time link code, valid for 30 minutes.</p>
        {botUrl && <p className="mt-1 text-sm">ProjectPilot bot: <a className="font-medium text-primary underline underline-offset-4" href={botUrl} target="_blank" rel="noreferrer">@{botUsername}</a> — share the personal link below with each teammate.</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Project</Label><Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger><SelectContent>{data.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label htmlFor="participant-name">Name</Label><Input id="participant-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="participant-role">Role</Label><Input id="participant-role" value={role} onChange={(event) => setRole(event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="participant-department">Department</Label><Input id="participant-department" value={department} onChange={(event) => setDepartment(event.target.value)} /></div>
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
          return (
            <div key={m.id} className="rounded-lg border bg-card p-4 text-sm shadow-sm">
              <div className="font-semibold">{m.name}</div>
              <div className="text-muted-foreground">{m.role} · {m.department}</div>
              <div className="mt-2">Projects: {data.projects.filter((p) => p.memberIds.includes(m.id)).map((p) => p.name).join(", ") || "—"}</div>
              <div>Tasks: {mine.length} · Done {mine.filter((t) => t.status === "Complete").length} · Blocked {mine.filter((t) => t.status === "Blocked").length}</div>
              <div className="text-xs text-muted-foreground">Telegram: {m.telegramLinked ? "linked" : "not linked"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
