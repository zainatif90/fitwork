/**
 * How useful a profile is for matching (shown in the profile wizard). The Match Score compares the MEANING of
 * the profile text with each job, so a profile with one vague skill and no bio gives a vague embedding:
 * weak matches and an empty Skill Gap ("cold start"). These tips are the cheapest fix.
 * Unit-tested in profileStrength.test.ts.
 */
export type Strength = "weak" | "good" | "strong";

/** Skills too general to tell the model what kind of work the user does. */
const GENERIC = new Set(["developer", "freelancer", "programming", "computer", "it", "design", "writing", "work", "online"]);

export function profileStrength(skills: string[], bio: string): { level: Strength; tips: string[] } {
  const specific = skills.filter((s) => !GENERIC.has(s.trim().toLowerCase()));
  const bioWords = bio.trim().split(/\s+/).filter(Boolean).length;
  const tips: string[] = [];
  if (specific.length < 3) tips.push("Add at least 3 specific skills (e.g. “React”, “Logo Design”), not general words.");
  else if (specific.length < 5) tips.push("5 or more specific skills give clearly better matches.");
  if (bioWords < 15) tips.push("Write a short bio (2–3 sentences) about the work you do: it is matched with the job text.");
  const level: Strength = specific.length >= 5 && bioWords >= 15 ? "strong" : specific.length >= 3 && bioWords >= 5 ? "good" : "weak";
  return { level, tips };
}
