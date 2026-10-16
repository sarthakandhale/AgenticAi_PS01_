import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/pp/page";
import { TasksView } from "@/components/views/tasks";

export const Route = createFileRoute("/tasks")({
  head: () => seo("Tasks", "ProjectPilot Tasks page."),
  component: () => (<><PageHeader title="Tasks" /><TasksView /></>),
});
