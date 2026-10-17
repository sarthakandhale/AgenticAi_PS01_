import { useState, useId } from "react";
import { Video, Send, Copy, Check, ExternalLink, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLookup, useStore } from "@/lib/store";
import type { Project } from "@/lib/types";

interface OrganizeMeetDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrganizeMeetDialog({ project, open, onOpenChange }: OrganizeMeetDialogProps) {
  const { organizeMeet } = useStore();
  const { member } = useLookup();
  const titleId = useId();
  const linkId = useId();
  const agendaId = useId();

  const [title, setTitle] = useState(`${project.name} Team Sync`);
  const [meetingUrl, setMeetingUrl] = useState(() => {
    const slug = project.id.toLowerCase().replace(/[^a-z0-9]/g, "");
    return `https://meet.jit.si/projectpilot-${slug || "room"}-${Date.now().toString(36)}`;
  });
  const [agenda, setAgenda] = useState("Sync on project progress, task blockers, and next milestones.");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentResult, setSentResult] = useState<{ delivered_count: number; meeting_url: string } | null>(null);

  const members = project.memberIds.map((id) => member(id)).filter(Boolean);
  const linkedMembersCount = members.filter((m) => m?.telegramLinked).length;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(meetingUrl);
      setCopied(true);
      toast.success("Meeting link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  const handleBroadcast = async () => {
    if (!meetingUrl.trim()) {
      toast.error("Please enter or generate a meeting link.");
      return;
    }

    setBusy(true);
    try {
      const res = await organizeMeet(project.id, {
        title: title.trim() || `${project.name} Team Sync`,
        meetingUrl: meetingUrl.trim(),
        agenda: agenda.trim(),
      });
      setSentResult({
        delivered_count: res.delivered_count,
        meeting_url: res.meeting_url,
      });
    } catch {
      // Error toasted in store
    } finally {
      setBusy(false);
    }
  };

  const resetAndClose = () => {
    setSentResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) setSentResult(null); onOpenChange(val); }}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center border border-indigo-500/20">
              <Video className="h-4 w-4" />
            </div>
            <DialogTitle className="text-lg">Organize Common Meet</DialogTitle>
          </div>
          <DialogDescription>
            Broadcast an instant meeting alert to all team members of <span className="font-semibold text-foreground">{project.name}</span> via Telegram with a direct join link.
          </DialogDescription>
        </DialogHeader>

        {sentResult ? (
          <div className="py-4 space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 text-center space-y-2">
              <div className="h-10 w-10 mx-auto rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Check className="h-5 w-5" />
              </div>
              <div className="font-semibold text-base text-emerald-900 dark:text-emerald-200">
                Meeting Alert Sent!
              </div>
              <p className="text-xs text-muted-foreground">
                Alert broadcasted to {sentResult.delivered_count} team {sentResult.delivered_count === 1 ? "member" : "members"} with Telegram linked.
              </p>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
                <span>Meeting Room</span>
                <button type="button" onClick={copyLink} className="text-primary hover:underline flex items-center gap-1 text-[11px]">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
              <div className="text-xs font-mono break-all text-foreground bg-background p-2 rounded border">
                {sentResult.meeting_url}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => window.open(sentResult.meeting_url, "_blank")}
              >
                <Video className="h-4 w-4" /> Join Call Now <ExternalLink className="h-3.5 w-3.5 ml-auto" />
              </Button>
              <Button variant="outline" onClick={resetAndClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor={titleId} className="text-xs font-medium">Meeting Topic / Title</Label>
              <Input
                id={titleId}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Project Delivery Sync"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={linkId} className="text-xs font-medium">Join Call Link</Label>
                <span className="text-[11px] text-muted-foreground">Works in browser without install</span>
              </div>
              <div className="flex gap-2">
                <Input
                  id={linkId}
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://meet.jit.si/..."
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" size="icon" onClick={copyLink} title="Copy Link">
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={agendaId} className="text-xs font-medium">Agenda & Notes (Optional)</Label>
              <Textarea
                id={agendaId}
                rows={2}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder="Briefly state the goal of this meeting"
                className="resize-none text-xs"
              />
            </div>

            {/* Team Members List */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold flex items-center gap-1.5 text-foreground">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  Team Recipients ({members.length})
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {linkedMembersCount} linked on Telegram
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 divide-y divide-border/40">
                {members.map((m) => {
                  if (!m) return null;
                  return (
                    <div key={m.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center">
                          {m.name.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium text-foreground">{m.name}</span>
                        {m.role && <span className="text-[11px] text-muted-foreground">({m.role})</span>}
                      </div>
                      {m.telegramLinked ? (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">
                          Alert via Bot
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          No Telegram
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleBroadcast}
                disabled={busy || !meetingUrl.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
              >
                {busy ? (
                  "Broadcasting Alert…"
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Alert All Members & Join Call
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
