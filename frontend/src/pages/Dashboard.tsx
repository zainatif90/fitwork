import { Briefcase } from "lucide-react";

import { EmptyState, PageHeader } from "../components/ui";
import { useAuth } from "../lib/auth";

/** Placeholder until the matching engine (Prompt 4) is built. */
export default function Dashboard() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title={`Welcome, ${user?.full_name.split(" ")[0] ?? ""}`} subtitle="Your best-fit jobs will appear here." />
      <EmptyState icon={<Briefcase className="h-6 w-6" />} title="Matches are coming soon">
        Complete your profile so FitWork can match jobs to your skills.
      </EmptyState>
    </>
  );
}
