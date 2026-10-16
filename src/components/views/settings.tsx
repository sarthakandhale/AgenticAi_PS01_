import { useStore } from "@/lib/store";
import { Panel } from "@/components/pp/page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export function SettingsView() {
  const { data, updateSettings, backend, checkBackend, resetDemo, coordinatorApiKey, setCoordinatorApiKey } = useStore();
  const s = data.settings;
  const telegramStatus =
    backend.state !== "ok"
      ? "not configured"
      : !backend.health.telegram.configured
        ? "not configured"
        : backend.health.telegram.polling
          ? "polling active"
          : backend.health.telegram.polling_error === "CONFLICT"
              ? `polling conflict — ${backend.health.telegram.polling_retrying ? "retrying; stop the other bot instance" : "another bot instance is active"}`
            : backend.health.telegram.polling_error === "FAILED"
              ? `polling stopped unexpectedly${backend.health.telegram.polling_retrying ? " — retrying" : ""}`
              : "configured, not polling";
  const backendStatus =
    backend.state === "ok"
      ? `Connected · Database ${backend.health.database?.configured ? "configured" : "not configured"} · Telegram ${telegramStatus} · API key ${backend.health.coordinatorAuth?.configured ? "required" : "not configured"}`
      : backend.state === "error"
        ? `Error — ${backend.error}`
        : backend.state === "checking"
          ? "Checking…"
          : "Awaiting setup";
  const num = (k: keyof typeof s.reminders) => (
    <div key={k} className="space-y-1"><Label>{k}</Label><Input type="number" min={1} value={s.reminders[k]} onChange={(e) => updateSettings({ ...s, reminders: { ...s.reminders, [k]: Math.max(1, Number(e.target.value) || 1) } })} /></div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Organization">
        <Label>Name</Label><Input value={s.orgName} onChange={(e) => updateSettings({ ...s, orgName: e.target.value })} />
        <div className="mt-3 flex items-center gap-2"><Switch checked={s.demoMode} onCheckedChange={(c) => updateSettings({ ...s, demoMode: c })} /> Demo mode</div>
        <Button className="mt-3" variant="outline" onClick={resetDemo}>Reset demo data</Button>
      </Panel>
      <Panel title="Backend & Telegram integration">
        <Label>Backend base URL</Label>
        <Input placeholder="https://api.example.com" value={s.backendUrl} onChange={(e) => updateSettings({ ...s, backendUrl: e.target.value })} />
        <Label className="mt-3 block" htmlFor="coordinator-key">Coordinator API key</Label>
        <Input id="coordinator-key" type="password" autoComplete="off" value={coordinatorApiKey} onChange={(e) => setCoordinatorApiKey(e.target.value)} placeholder="Set COORDINATOR_API_KEY from backend/.env" />
        <div className="mt-2 text-sm">Status: {backendStatus}</div>
        <Button className="mt-2" size="sm" variant="outline" onClick={() => void checkBackend()}>Re-check</Button>
        <p className="mt-2 text-xs text-muted-foreground">Telegram, Gemini, and Supabase service credentials stay on the backend. The coordinator key is held in this browser tab's session storage. See README for setup.</p>
      </Panel>
      <Panel title="Reminder thresholds">
        <div className="grid grid-cols-2 gap-3">{(Object.keys(s.reminders) as (keyof typeof s.reminders)[]).map(num)}</div>
      </Panel>
      <Panel title="Escalation rules (require backend scheduling)">
        {(Object.keys(s.escalation) as (keyof typeof s.escalation)[]).map((k) => (
          <div key={k} className="flex items-center gap-2 py-1 text-sm"><Switch checked={s.escalation[k]} onCheckedChange={(c) => updateSettings({ ...s, escalation: { ...s.escalation, [k]: c } })} />{k}</div>
        ))}
      </Panel>
    </div>
  );
}
