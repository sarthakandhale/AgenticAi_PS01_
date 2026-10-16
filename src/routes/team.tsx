import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/pp/page";
import { TeamView } from "@/components/views/team";

export const Route = createFileRoute("/team")({
  head: () => seo("Team", "ProjectPilot Team page."),
  component: () => (<><PageHeader title="Team" /><TeamView /></>),
});
