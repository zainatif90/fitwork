import { Construction } from "lucide-react";

import { EmptyState, PageHeader } from "../components/ui";

/** Temporary page for sections that are not built yet. */
export default function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={<Construction className="h-6 w-6" />} title="Coming soon">
        This section is being built.
      </EmptyState>
    </>
  );
}
