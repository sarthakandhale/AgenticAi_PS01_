import { useState } from "react";
import { useLookup, useScopedTasks, useStore } from "@/lib/store";
import { needsFollowUp } from "@/lib/rules";
import { Panel, Empty } from "@/components/pp/page";
import { DemoBadge, StatusBadge } from "@/components/pp/badges";
import { RequestUpdateButton } from "@/components/pp/request-update";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CoordinatorView() {
  const { data, decideProposal, simulateReply, backend } = useStore();
  const { task, member } = useLookup();
  const tasks = useScopedTasks();
  const [replies, setReplies] = useState<Record<string, string>>({});
  const follow = tasks.filter((t) => needsFollowUp(t, data.settings.reminders.missingUpdateDays) || t.status === "Pending");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <p className="text-sm text-muted-foreground lg:col-span-2">
        {backend.state === "ok" ? "Messaging backend connected." : "No AI model or messaging backend is connected. Proposals below come from demo keyword rules, and nothing is applied until you approve it."}
      </p>
      <Panel title="Tasks awaiting updates">
        {follow.length === 0 ? <Empty>None.</Empty> : follow.map((t) => (
          <div key={t.id} className="space-y-2 border-b py-3">
            <div className="flex items-center justify-between gap-2"><div className="text-sm font-medium">{t.title}<div className="text-xs text-muted-foreground">{member(t.ownerId)?.name}</div></div><StatusBadge status={t.status} /></div>
            <div className="flex flex-wrap gap-2"><RequestUpdateButton task={t} /></div>
            {data.settings.demoMode && (
              <div className="flex gap-2">
                <Textarea rows={1} placeholder="Simulate a participant reply (demo)" value={replies[t.id] ?? ""} onChange={(e) => setReplies({ ...replies, [t.id]: e.target.value })} />
                <Button size="sm" variant="secondary" onClick={() => { simulateReply(t.id, replies[t.id] ?? ""); setReplies({ ...replies, [t.id]: "" }); }}>Add</Button>
              </div>
            )}
          </div>
        ))}
      </Panel>
      <Panel title="Proposed updates — review">
        {data.proposals.length === 0 ? <Empty>No replies to review yet.</Empty> : data.proposals.map((p) => (
          <div key={p.id} className="space-y-1 border-b py-3 text-sm">
            <div className="flex items-center gap-2 font-medium">{task(p.taskId)?.title} {p.demo && <DemoBadge>Demo rules</DemoBadge>}</div>
            <blockquote className="border-l-2 pl-2 italic">"{p.originalMessage}"</blockquote>
            <div>Extracted: {p.extracted}</div>
            <div>Proposed status: <b>{p.proposedStatus ?? "Needs clarification"}</b> ({p.clarity})</div>
            <div className="text-xs text-muted-foreground">Evidence: {p.evidence.join(", ") || "none"}</div>
            {p.state === "pending" ? (
              <div className="flex gap-2 pt-1">
                <Button size="sm" disabled={!p.proposedStatus} onClick={() => decideProposal(p.id, true)}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => decideProposal(p.id, false)}>Reject</Button>
              </div>
            ) : <div className="text-xs font-medium">Decision: {p.state} (executed)</div>}
          </div>
        ))}
      </Panel>
    </div>
  );
}
