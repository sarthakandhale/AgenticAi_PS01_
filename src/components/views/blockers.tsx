import { useState } from "react";
import { useLookup, useScopedTasks, useStore } from "@/lib/store";
import { daysSince, downstream } from "@/lib/rules";
import { Panel, Empty } from "@/components/pp/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BlockersView() {
  const { data, resolveBlocker, setOpenTaskId } = useStore();
  const { member, project } = useLookup();
  const [res, setRes] = useState<Record<string, string>>({});
  const blocked = useScopedTasks().filter((t) => t.status === "Blocked");
  if (!blocked.length) return <Empty>No active blockers.</Empty>;
  return (
    <div className="space-y-4">
      {blocked.map((t) => (
        <Panel key={t.id} title={<button onClick={() => setOpenTaskId(t.id)} className="hover:underline">{t.title}</button>}>
          <div className="space-y-1 text-sm">
            <div className="text-muted-foreground">{project(t.projectId)?.name} · Owner {member(t.ownerId)?.name}</div>
            <div><b>Reason:</b> {t.blocker?.reason ?? "Not recorded"}</div>
            {t.blocker?.evidence && <div className="italic text-muted-foreground">{t.blocker.evidence}</div>}
            <div>Identified: {t.blocker ? `${new Date(t.blocker.identifiedAt).toLocaleDateString()} (${daysSince(t.blocker.identifiedAt)} days)` : "Unknown"}</div>
            <div>Resolver: {t.blocker?.requiredResolver ?? "Not yet established"}</div>
            <div>Next action: {t.nextAction || "—"}</div>
            <div>Affected downstream: {downstream(data.tasks, t.id).map((d) => d.title).join(", ") || "None"}</div>
            <div className="flex gap-2 pt-2">
              <Input placeholder="Record resolution" value={res[t.id] ?? ""} onChange={(e) => setRes({ ...res, [t.id]: e.target.value })} />
              <Button disabled={!res[t.id]?.trim()} onClick={() => resolveBlocker(t.id, res[t.id]!, "In Progress")}>Resolve</Button>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}
