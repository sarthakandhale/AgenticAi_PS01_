import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/pp/page";
import { CoordinatorView } from "@/components/views/coordinator";

export const Route = createFileRoute("/coordinator")({
  head: () => seo("Coordinator", "ProjectPilot Coordinator page."),
  component: () => (<><PageHeader title="Coordinator" /><CoordinatorView /></>),
});
