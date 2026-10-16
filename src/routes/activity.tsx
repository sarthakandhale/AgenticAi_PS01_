import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/pp/page";
import { ActivityView } from "@/components/views/activity";

export const Route = createFileRoute("/activity")({
  head: () => seo("Activity", "ProjectPilot Activity page."),
  component: () => (<><PageHeader title="Activity" /><ActivityView /></>),
});
