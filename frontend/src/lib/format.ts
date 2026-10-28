import type { JobSource, JobSummary } from "./types";

const money = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(n)}`);

export function formatBudget(job: Pick<JobSummary, "budget_min" | "budget_max" | "budget_type">): string {
  const { budget_min: lo, budget_max: hi, budget_type } = job;
  const suffix = budget_type === "hourly" ? "/hr" : " fixed";
  if (!lo && !hi) return "Budget not stated";
  if (lo && hi && lo !== hi) return `${money(lo)}–${money(hi)}${suffix}`;
  return `${money((hi || lo) as number)}${suffix}`;
}

export function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Platform name shown on the badge. CSV seed rows keep the platform they came from. */
export function platformLabel(source: JobSource, url: string | null): string {
  if (source === "freelancer") return "Freelancer.com";
  if (source === "upwork") return "Upwork";
  if (source === "manual") return "Added by you";
  if (source === "csv" && url?.includes("freelancer.com")) return "Freelancer.com · seed";
  if (source === "csv") return "Seed dataset";
  return "Synthetic";
}

export function sourceName(source: JobSource | null): string {
  if (!source) return "—";
  return { freelancer: "Freelancer.com", upwork: "Upwork", csv: "Seed dataset", manual: "Manual", synthetic: "Synthetic" }[source];
}

/** Score colour bands: green >= 75, yellow 50-74, red < 50. */
export function scoreTone(score: number): { bar: string; text: string; bg: string; label: string } {
  if (score >= 75) return { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", label: "Strong fit" };
  if (score >= 50) return { bar: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50", label: "Possible fit" };
  return { bar: "bg-red-500", text: "text-red-700", bg: "bg-red-50", label: "Weak fit" };
}
