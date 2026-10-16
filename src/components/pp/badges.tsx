import { cn } from "@/lib/utils";
import type { Priority, TaskStatus } from "@/lib/types";
import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

const base = "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function StatusBadge({ status }: { status: TaskStatus }) {
  const cls = {
    Pending: "bg-muted text-muted-foreground border-border",
    "In Progress": "bg-info/10 text-info border-info/30",
    Blocked: "bg-destructive/10 text-destructive border-destructive/30",
    Complete: "bg-success/10 text-success border-success/30",
  }[status];
  return <span className={cn(base, cls)}>{status}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const cls = {
    Low: "text-muted-foreground border-border",
    Medium: "text-foreground border-border",
    High: "text-warning-foreground bg-warning/15 border-warning/40",
    Critical: "text-destructive bg-destructive/10 border-destructive/30",
  }[priority];
  return <span className={cn(base, cls)}>{priority}</span>;
}

export function HealthBadge({ health }: { health: string }) {
  const cls =
    health === "On Track" || health === "Complete"
      ? "bg-success/10 text-success border-success/30"
      : health === "Blocked"
        ? "bg-destructive/10 text-destructive border-destructive/30"
        : "bg-warning/15 text-warning-foreground border-warning/40";
  return <span className={cn(base, cls)}>{health}</span>;
}

export function DemoBadge({ children = "Demo data" }: { children?: ReactNode }) {
  return (
    <span className={cn(base, "border-dashed border-warning/60 bg-warning/10 text-warning-foreground")}>
      <FlaskConical className="h-3 w-3" />
      {children}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn(base, "border-border bg-card text-muted-foreground", className)}>{children}</span>;
}
