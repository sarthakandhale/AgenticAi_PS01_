import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/pp/page";
import { BlockersView } from "@/components/views/blockers";

export const Route = createFileRoute("/blockers")({
  head: () => seo("Blockers", "ProjectPilot Blockers page."),
  component: () => (<><PageHeader title="Blockers" /><BlockersView /></>),
});
