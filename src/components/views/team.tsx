import { useStore } from "@/lib/store";

export function TeamView() {
  const { data } = useStore();
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.members.map((m) => {
        const mine = data.tasks.filter((t) => t.ownerId === m.id);
        return (
          <div key={m.id} className="rounded-lg border bg-card p-4 text-sm shadow-sm">
            <div className="font-semibold">{m.name}</div>
            <div className="text-muted-foreground">{m.role} · {m.department}</div>
            <div className="mt-2">Projects: {data.projects.filter((p) => p.memberIds.includes(m.id)).map((p) => p.name).join(", ") || "—"}</div>
            <div>Tasks: {mine.length} · Done {mine.filter((t) => t.status === "Complete").length} · Blocked {mine.filter((t) => t.status === "Blocked").length}</div>
            <div className="text-xs text-muted-foreground">Telegram: {m.telegramLinked ? "linked" : "not linked (requires backend)"}</div>
          </div>
        );
      })}
    </div>
  );
}
