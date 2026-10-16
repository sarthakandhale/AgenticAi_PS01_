import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLookup, useStore } from "@/lib/store";
import type { Task } from "@/lib/types";

export function RequestUpdateButton({ task, size = "sm" }: { task: Task; size?: "sm" | "default" }) {
  const { requestUpdate, backend, data } = useStore();
  const { member } = useLookup();
  const owner = member(task.ownerId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const live = backend.state === "ok";

  const openIt = () => {
    setText(`Hi ${owner?.name.split(" ")[0] ?? "there"}, could you share a quick update on "${task.title}" (due ${task.deadline})? Is it in progress, complete, or blocked by anything?`);
    setOpen(true);
  };
  const send = async () => {
    setBusy(true);
    await requestUpdate(task.id, text);
    setBusy(false);
    setOpen(false);
  };

  return (
    <>
      <Button size={size} variant="outline" onClick={openIt} disabled={task.status === "Complete"}>
        <Send className="h-3.5 w-3.5" /> Request update
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request update from {owner?.name}</DialogTitle>
            <DialogDescription>
              {live
                ? "This will be sent via your messaging backend (Telegram)."
                : data.settings.demoMode
                  ? "Demo mode: the messaging backend is not connected. This will be recorded locally and will NOT be sent to anyone."
                  : "Messaging backend not connected and demo mode is off — sending is unavailable."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ru-text">Message</Label>
            <Textarea id="ru-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={send} disabled={busy || !text.trim() || (!live && !data.settings.demoMode)}>
              {busy ? "Sending…" : live ? "Send via Telegram" : "Record demo follow-up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
