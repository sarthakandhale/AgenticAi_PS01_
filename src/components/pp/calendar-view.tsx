import { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Video,
  ExternalLink,
  Trash2,
  Flag,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  CalendarDays,
  MapPin,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useLookup, useStore } from "@/lib/store";
import { today } from "@/lib/rules";
import type { ScheduledEvent } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  meeting: { bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/30" },
  review: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", border: "border-violet-500/30" },
  release: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30" },
  milestone: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", border: "border-sky-500/30" },
  deadline: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30" },
  general: { bg: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-400", border: "border-slate-500/30" },
};

function formatDateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function CalendarView({ onClose }: { onClose?: () => void } = {}) {
  const { data, selectedProjectId, addEvent, deleteEvent, setOpenTaskId } = useStore();
  const { project, member } = useLookup();

  const todayStr = useMemo(() => today(), []);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  // Form State for Scheduling
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState(todayStr);
  const [formTime, setFormTime] = useState("10:00 AM");
  const [formProjectId, setFormProjectId] = useState<string>("all");
  const [formType, setFormType] = useState<ScheduledEvent["type"]>("meeting");
  const [formUrl, setFormUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-indexed

  // Month navigation
  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  const jumpToToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(todayStr);
  };

  // Month stats
  const monthName = currentDate.toLocaleString("default", { month: "long" });

  // Grid calculation (Monday-first)
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7; // 0 = Mon, 6 = Sun

  const filteredProjects = useMemo(() => {
    return selectedProjectId === "all"
      ? data.projects
      : data.projects.filter((p) => p.id === selectedProjectId);
  }, [data.projects, selectedProjectId]);

  const activeProjectIds = useMemo(() => new Set(filteredProjects.map((p) => p.id)), [filteredProjects]);

  // Aggregate items by YYYY-MM-DD
  const calendarItems = useMemo(() => {
    const map = new Map<
      string,
      {
        events: ScheduledEvent[];
        tasks: typeof data.tasks;
        milestones: Array<{ id: string; name: string; date: string; done: boolean; projectName: string; projectId: string }>;
      }
    >();

    const getEntry = (date: string) => {
      if (!map.has(date)) {
        map.set(date, { events: [], tasks: [], milestones: [] });
      }
      return map.get(date)!;
    };

    // 1. Scheduled Events
    for (const ev of data.events || []) {
      if (ev.projectId && !activeProjectIds.has(ev.projectId)) continue;
      getEntry(ev.date).events.push(ev);
    }

    // 2. Tasks Due Dates
    for (const t of data.tasks) {
      if (t.deadline && activeProjectIds.has(t.projectId)) {
        getEntry(t.deadline).tasks.push(t);
      }
    }

    // 3. Project Milestones
    for (const p of filteredProjects) {
      for (const m of p.milestones) {
        if (m.date) {
          getEntry(m.date).milestones.push({ ...m, projectName: p.name, projectId: p.id });
        }
      }
    }

    return map;
  }, [data.events, data.tasks, filteredProjects, activeProjectIds]);

  const openScheduleModalForDate = (dateStr: string) => {
    setFormDate(dateStr);
    setFormTitle("");
    setFormTime("10:00 AM");
    setFormProjectId(selectedProjectId !== "all" ? selectedProjectId : (data.projects[0]?.id || ""));
    setFormType("meeting");
    const slug = (selectedProjectId !== "all" ? selectedProjectId : "team").toLowerCase().replace(/[^a-z0-9]/g, "");
    setFormUrl(`https://meet.jit.si/projectpilot-${slug}-${Date.now().toString(36)}`);
    setFormDescription("");
    setScheduleModalOpen(true);
  };

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    addEvent({
      title: formTitle.trim(),
      date: formDate,
      time: formTime.trim() || undefined,
      projectId: formProjectId && formProjectId !== "all" ? formProjectId : undefined,
      type: formType,
      meetingUrl: formUrl.trim() || undefined,
      description: formDescription.trim() || undefined,
    });

    setScheduleModalOpen(false);
  };

  const selectedDayData = calendarItems.get(selectedDate) || { events: [], tasks: [], milestones: [] };
  const totalItemsForSelectedDate =
    selectedDayData.events.length + selectedDayData.tasks.length + selectedDayData.milestones.length;

  const formattedSelectedDate = useMemo(() => {
    try {
      const [y, m, d] = selectedDate.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("default", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden transition-all">
      {/* Calendar Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
            <CalendarIcon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              Team Schedule & Planner
              <span className="text-xs font-normal text-muted-foreground px-2 py-0.5 rounded-full bg-muted border">
                Real-Time
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Coordinate sprints, deadlines, meetings, and project milestones in one unified view.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end sm:pr-8">
          <div className="flex items-center border rounded-lg bg-background shadow-xs p-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth} title="Previous Month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-semibold px-2 min-w-[110px] text-center">
              {monthName} {currentYear}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth} title="Next Month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={jumpToToday} className="h-8 text-xs font-medium">
            Today
          </Button>

          <Button
            size="sm"
            onClick={() => openScheduleModalForDate(selectedDate)}
            className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground font-medium shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Schedule Event
          </Button>
        </div>
      </div>

      {/* Main Content Layout: Grid + Day Agenda */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x">
        {/* Left Column: Month Grid (8 Cols) */}
        <div className="lg:col-span-8 p-4">
          {/* Weekday Row */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground mb-1.5">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 auto-rows-fr">
            {/* Blank filler cells before 1st of month */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} className="min-h-[84px] rounded-lg border border-transparent bg-muted/10 opacity-30" />
            ))}

            {/* Month Day Cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateKey = formatDateKey(currentYear, currentMonth, dayNum);
              const isToday = dateKey === todayStr;
              const isSelected = dateKey === selectedDate;
              const cellData = calendarItems.get(dateKey);

              const hasEvents = (cellData?.events.length ?? 0) > 0;
              const hasTasks = (cellData?.tasks.length ?? 0) > 0;
              const hasMilestones = (cellData?.milestones.length ?? 0) > 0;
              const totalBadges =
                (cellData?.events.length || 0) + (cellData?.tasks.length || 0) + (cellData?.milestones.length || 0);

              return (
                <div
                  key={dateKey}
                  onClick={() => setSelectedDate(dateKey)}
                  onDoubleClick={() => openScheduleModalForDate(dateKey)}
                  className={`min-h-[88px] p-1.5 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer relative group ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-xs"
                      : isToday
                        ? "border-primary/40 bg-card hover:border-primary/60"
                        : "border-border/60 bg-card hover:bg-muted/40 hover:border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-medium ${
                        isToday
                          ? "bg-primary text-primary-foreground font-bold shadow-xs"
                          : isSelected
                            ? "bg-foreground/10 text-foreground font-semibold"
                            : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      {dayNum}
                    </span>

                    {/* Quick Add Button on Hover */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openScheduleModalForDate(dateKey);
                      }}
                      className="opacity-0 group-hover:opacity-100 h-4 w-4 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-opacity"
                      title="Quick Schedule"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Day Micro Badge List */}
                  <div className="mt-1 space-y-0.5 overflow-hidden">
                    {/* Scheduled Meetings / Events */}
                    {cellData?.events.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`text-[10px] truncate px-1 py-0.5 rounded font-medium border flex items-center gap-1 ${
                          EVENT_TYPE_COLORS[ev.type]?.bg || "bg-indigo-500/10"
                        } ${EVENT_TYPE_COLORS[ev.type]?.text || "text-indigo-600"} ${
                          EVENT_TYPE_COLORS[ev.type]?.border || "border-indigo-500/20"
                        }`}
                        title={`${ev.time ? ev.time + " - " : ""}${ev.title}`}
                      >
                        <span className="h-1 w-1 rounded-full bg-current shrink-0" />
                        <span className="truncate">{ev.title}</span>
                      </div>
                    ))}

                    {/* Tasks Due */}
                    {cellData?.tasks.slice(0, cellData.events.length > 0 ? 1 : 2).map((t) => (
                      <div
                        key={t.id}
                        className="text-[10px] truncate px-1 py-0.5 rounded font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1"
                        title={`Due: ${t.title}`}
                      >
                        <span className="h-1 w-1 rounded-full bg-amber-500 shrink-0" />
                        <span className="truncate">Due: {t.title}</span>
                      </div>
                    ))}

                    {/* Milestones */}
                    {cellData?.milestones.slice(0, 1).map((m) => (
                      <div
                        key={m.id}
                        className="text-[10px] truncate px-1 py-0.5 rounded font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center gap-1"
                        title={`Milestone: ${m.name}`}
                      >
                        <Flag className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{m.name}</span>
                      </div>
                    ))}

                    {/* Counter for Extra Items */}
                    {totalBadges > 2 && (
                      <div className="text-[9px] text-muted-foreground font-semibold px-1">
                        +{totalBadges - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Color Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Legend:</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-500" /> Meetings & Syncs
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Task Deadlines
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" /> Milestones
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Releases
            </span>
          </div>
        </div>

        {/* Right Column: Selected Day Agenda & Detail (4 Cols) */}
        <div className="lg:col-span-4 p-4 flex flex-col justify-between bg-muted/10">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2 pb-3 border-b">
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold text-primary">Day Agenda</div>
                <h4 className="text-sm font-semibold text-foreground mt-0.5">{formattedSelectedDate}</h4>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {totalItemsForSelectedDate === 0
                    ? "No events scheduled"
                    : `${totalItemsForSelectedDate} planned item${totalItemsForSelectedDate === 1 ? "" : "s"}`}
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => openScheduleModalForDate(selectedDate)}
                className="h-7 text-xs gap-1"
              >
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>

            {/* List of items on this date */}
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {/* Scheduled Events */}
              {selectedDayData.events.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" /> Scheduled Events & Meets
                  </div>
                  {selectedDayData.events.map((ev) => {
                    const typeStyle = EVENT_TYPE_COLORS[ev.type] || EVENT_TYPE_COLORS.general;
                    const proj = ev.projectId ? project(ev.projectId) : null;
                    return (
                      <div
                        key={ev.id}
                        className="rounded-lg border bg-card p-3 space-y-2 hover:border-primary/40 transition-all shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded border ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}
                              >
                                {ev.type}
                              </span>
                              {ev.time && (
                                <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  {ev.time}
                                </span>
                              )}
                            </div>
                            <div className="font-semibold text-sm text-foreground">{ev.title}</div>
                          </div>

                          <button
                            type="button"
                            onClick={() => deleteEvent(ev.id)}
                            className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-muted"
                            title="Remove Event"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {proj && <div className="text-[11px] text-muted-foreground font-medium">Project: {proj.name}</div>}

                        {ev.description && <p className="text-xs text-muted-foreground line-clamp-2">{ev.description}</p>}

                        {ev.meetingUrl && (
                          <div className="pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(ev.meetingUrl, "_blank")}
                              className="h-7 text-xs gap-1.5 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 w-full"
                            >
                              <Video className="h-3.5 w-3.5" /> Join Call Link <ExternalLink className="h-3 w-3 ml-auto" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tasks Due Today */}
              {selectedDayData.tasks.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Clock className="h-3 w-3 text-amber-500" /> Tasks Due Today ({selectedDayData.tasks.length})
                  </div>
                  {selectedDayData.tasks.map((t) => {
                    const proj = project(t.projectId);
                    const owner = member(t.ownerId);
                    return (
                      <div
                        key={t.id}
                        onClick={() => setOpenTaskId(t.id)}
                        className="rounded-lg border bg-card p-2.5 space-y-1 hover:border-amber-500/50 transition-all cursor-pointer shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-xs text-foreground truncate">{t.title}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              t.status === "Complete"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : t.status === "Blocked"
                                  ? "bg-rose-500/10 text-rose-600"
                                  : "bg-blue-500/10 text-blue-600"
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                          <span>{proj?.name}</span>
                          <span>Assignee: {owner?.name || "Unassigned"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Milestones on this Day */}
              {selectedDayData.milestones.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Flag className="h-3 w-3 text-sky-500" /> Project Milestones
                  </div>
                  {selectedDayData.milestones.map((m) => (
                    <div key={m.id} className="rounded-lg border bg-sky-50/40 dark:bg-sky-950/20 border-sky-500/20 p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-sky-900 dark:text-sky-200">{m.name}</span>
                        {m.done ? (
                          <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </span>
                        ) : (
                          <span className="text-[10px] text-sky-600 font-medium">Target</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{m.projectName}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty Day State */}
              {totalItemsForSelectedDate === 0 && (
                <div className="py-8 text-center space-y-2 border border-dashed rounded-lg p-4">
                  <div className="h-9 w-9 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div className="text-xs font-medium text-foreground">Clear Schedule</div>
                  <p className="text-[11px] text-muted-foreground">No tasks, meetings, or milestones on this day.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openScheduleModalForDate(selectedDate)}
                    className="text-xs h-7 mt-1 gap-1"
                  >
                    <Plus className="h-3 w-3" /> Plan an event
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Tip: Double-click any day to schedule</span>
            <Button
              variant="link"
              size="sm"
              onClick={() => openScheduleModalForDate(todayStr)}
              className="h-auto p-0 text-[11px]"
            >
              + Plan for Today
            </Button>
          </div>
        </div>
      </div>

      {/* Schedule Event Dialog Modal */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreateEvent}>
            <DialogHeader>
              <div className="flex items-center gap-2 text-primary">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                </div>
                <DialogTitle>Schedule Team Event</DialogTitle>
              </div>
              <DialogDescription>
                Plan a sprint sync, client review, meeting, or milestone for your team.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-3">
              <div className="space-y-1">
                <Label htmlFor="ev-title" className="text-xs font-semibold">Event Title *</Label>
                <Input
                  id="ev-title"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Sprint 2 Review & Demo"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ev-date" className="text-xs font-semibold">Date</Label>
                  <Input
                    id="ev-date"
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ev-time" className="text-xs font-semibold">Time (Optional)</Label>
                  <Input
                    id="ev-time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    placeholder="e.g. 10:30 AM"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Project</Label>
                  <Select value={formProjectId} onValueChange={setFormProjectId}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">General / Cross-Project</SelectItem>
                      {data.projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Event Type</Label>
                  <Select value={formType} onValueChange={(val) => setFormType(val as ScheduledEvent["type"])}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meeting">Team Meeting</SelectItem>
                      <SelectItem value="review">Sprint / Client Review</SelectItem>
                      <SelectItem value="release">Deployment / Release</SelectItem>
                      <SelectItem value="milestone">Milestone Target</SelectItem>
                      <SelectItem value="deadline">Critical Deadline</SelectItem>
                      <SelectItem value="general">General Event</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ev-url" className="text-xs font-semibold">Call Link (Optional)</Label>
                  <button
                    type="button"
                    onClick={() => {
                      const slug = formTitle.toLowerCase().replace(/[^a-z0-9]/g, "") || "room";
                      setFormUrl(`https://meet.jit.si/projectpilot-${slug}-${Date.now().toString(36)}`);
                    }}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Auto-Generate Call Room
                  </button>
                </div>
                <Input
                  id="ev-url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://meet.jit.si/... or Google Meet"
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="ev-desc" className="text-xs font-semibold">Notes / Agenda (Optional)</Label>
                <Textarea
                  id="ev-desc"
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Goals, agenda items, or links"
                  className="resize-none text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setScheduleModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!formTitle.trim()} className="gap-1.5 font-medium">
                <Plus className="h-4 w-4" /> Add to Schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
