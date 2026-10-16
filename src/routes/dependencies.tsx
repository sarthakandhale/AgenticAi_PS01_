import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { PageHeader } from "@/components/pp/page";
import { DependenciesView } from "@/components/views/dependencies";

export const Route = createFileRoute("/dependencies")({
  head: () => seo("Dependencies", "ProjectPilot Dependencies page."),
  component: () => (<><PageHeader title="Dependencies" /><DependenciesView /></>),
});
