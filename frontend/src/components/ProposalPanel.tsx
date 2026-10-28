import { Sparkles } from "lucide-react";

import { Button, Card } from "./ui";

/** Placeholder: the AI Proposal Assistant is built in Prompt 5. */
export function ProposalPanel({ jobId }: { jobId: string }) {
  return (
    <Card className="p-6" data-job={jobId}>
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <Sparkles className="h-4 w-4 text-brand-600" /> Proposal assistant
      </h2>
      <p className="mt-1 text-sm text-slate-500">Generate a first draft based on this job and your profile.</p>
      <Button className="mt-4" disabled>Generate proposal (coming soon)</Button>
    </Card>
  );
}
