import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, FolderKanban, ListChecks, Bot, Radar, GitBranch, History, FileText, Users, Settings,
  Bell, Plus, Menu, Plane, FlaskConical, ChevronDown, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import { isOverdue } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { TaskDialog } from "./task-dialog";
import { TaskSheet } from "./task-sheet";
import { CalendarView } from "./calendar-view";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/coordinator", label: "AI Coordinator", icon: Bot },
  { to: "/blockers", label: "Blocker Radar", icon: Radar },
  { to: "/dependencies", label: "Dependencies & Risks", icon: GitBranch },
  { to: "/activity", label: "Activity History", icon: History },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/team", label: "Team", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { backend, data } = useStore();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <Plane className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-sidebar-accent-foreground">ProjectPilot</div>
          <div className="text-[11px] text-sidebar-foreground/70">AI project coordination</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((n) => {
          const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
          return (
            <Link key={n.to} to={n.to} onClick={onNavigate}
              className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground")}>
              <n.icon className={cn("h-4 w-4", active && "text-sidebar-primary")} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 rounded-md border border-sidebar-border p-3 text-xs">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", backend.state === "ok" ? "bg-sidebar-primary" : "bg-warning")} />
          {backend.state === "ok" ? "Backend connected" : "Backend awaiting setup"}
        </div>
        {data.settings.demoMode && <div className="mt-1 flex items-center gap-1 text-sidebar-foreground/70"><FlaskConical className="h-3 w-3" /> Demo mode on</div>}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data, selectedProjectId, setSelectedProjectId, openTaskDialog, setOpenTaskId, currentUser, calendarOpen, setCalendarOpen, markNotificationRead } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentMember = data.members.find((m) => m.name === currentUser);
  const currentMemberId = currentMember?.id;
  const isManager = currentMember?.role.toLowerCase().includes("manager") || currentUser === "Priya Raman";

  const userNotifications = (data.notifications || []).filter(
    (n) => isManager || n.recipientId === currentMemberId,
  );
  const unreadNotifs = userNotifications.filter((n) => !n.read);
  const blocked = data.tasks.filter((t) => t.status === "Blocked");
  const overdue = data.tasks.filter(isOverdue);
  const pendingProposals = data.proposals.filter((p) => p.state === "pending");
  const notifCount = blocked.length + overdue.length + pendingProposals.length + unreadNotifs.length;

  return (
    <div className="flex min-h-screen w-full">
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 lg:block"><SidebarBody /></aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-card/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></Button>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="h-9 w-44 sm:w-64" aria-label="Project selector"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {data.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCalendarOpen(true)}
              className="relative hover:bg-muted text-foreground/80 hover:text-foreground"
              title="Team Schedule & Calendar"
              aria-label="Open Team Schedule & Calendar"
            >
              <Calendar className="h-5 w-5" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                  <Bell className="h-5 w-5" />
                  {notifCount > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">{notifCount}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-84 sm:w-96 p-0">
                <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-semibold">
                  <span>Notifications & Alerts</span>
                  {unreadNotifs.length > 0 && (
                    <span className="text-xs font-normal text-muted-foreground">{unreadNotifs.length} unread</span>
                  )}
                </div>
                <ul className="max-h-84 overflow-y-auto text-sm">
                  {userNotifications.length > 0 && (
                    <li className="bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">Project Assignments</li>
                  )}
                  {userNotifications.map((n) => (
                    <li key={n.id} className={cn("border-b px-3 py-2 text-xs transition-colors", !n.read ? "bg-primary/5" : "opacity-80")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 font-semibold text-foreground">
                            <span className={cn("h-1.5 w-1.5 rounded-full", !n.read ? "bg-primary" : "bg-muted-foreground/40")} />
                            {n.title}
                          </div>
                          <p className="mt-1 text-muted-foreground leading-relaxed">{n.message}</p>
                          <span className="mt-1 block text-[10px] text-muted-foreground/70">
                            {new Date(n.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </div>
                        {!n.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                            onClick={() => void markNotificationRead(n.id)}
                            title="Mark as read"
                          >
                            Mark read
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                  {pendingProposals.length > 0 && (
                    <li className="border-b">
                      <Link to="/coordinator" className="block px-3 py-2 text-xs font-medium text-primary hover:bg-muted">
                        🤖 {pendingProposals.length} proposed update(s) awaiting review in AI Coordinator
                      </Link>
                    </li>
                  )}
                  {blocked.map((t) => (
                    <li key={t.id} className="border-b">
                      <button className="w-full px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => setOpenTaskId(t.id)}>
                        <span className="font-semibold text-destructive">Blocked:</span> {t.title}
                      </button>
                    </li>
                  ))}
                  {overdue.map((t) => (
                    <li key={`o${t.id}`} className="border-b">
                      <button className="w-full px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => setOpenTaskId(t.id)}>
                        <span className="font-semibold text-warning-foreground">Overdue:</span> {t.title}
                      </button>
                    </li>
                  ))}
                  {notifCount === 0 && <li className="px-3 py-4 text-center text-xs text-muted-foreground">All clear. No pending notifications.</li>}
                </ul>
              </PopoverContent>
            </Popover>
            <Button size="sm" onClick={() => openTaskDialog()}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Create Task</span></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">PR</span>
                  <ChevronDown className="hidden h-3 w-3 sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{currentUser}<div className="text-xs font-normal text-muted-foreground">Delivery Manager (demo profile)</div></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/team">Team</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/settings">Settings</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {data.settings.demoMode && (
          <div className="no-print flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-1.5 text-xs text-warning-foreground">
            <FlaskConical className="h-3.5 w-3.5" />
            Demo mode — sample portfolio data stored in this browser. No real messages are sent and no AI model is connected.
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
      <TaskDialog />
      <TaskSheet />
      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto p-2 sm:p-4">
          <DialogTitle className="sr-only">Team Schedule & Planner</DialogTitle>
          <CalendarView onClose={() => setCalendarOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
