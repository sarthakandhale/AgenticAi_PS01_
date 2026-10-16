import { useStore } from "@/lib/store";
import { Panel } from "@/components/pp/page";
import { ActivityList } from "@/components/pp/activity-list";

export function ActivityView() {
  const { data, selectedProjectId } = useStore();
  const items = data.activities.filter((a) => selectedProjectId === "all" || a.projectId === selectedProjectId);
  return <Panel title={`${items.length} events — items marked Illustrative are sample data`}><ActivityList items={items} /></Panel>;
}
