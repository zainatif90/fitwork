import { Briefcase, UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, FullPageSpinner, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Profile } from "../lib/types";

/** Placeholder until the matching engine (Prompt 4) is built. */
export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    api<Profile | null>("/profile/me").then(setProfile).catch(() => setProfile(null));
  }, []);

  if (profile === undefined) return <FullPageSpinner />;

  return (
    <>
      <PageHeader title={`Welcome, ${user?.full_name.split(" ")[0] ?? ""}`} subtitle="Your best-fit jobs will appear here." />
      {profile ? (
        <EmptyState icon={<Briefcase className="h-6 w-6" />} title="Matches are coming soon">
          Your profile is saved ({profile.skills.length} skills). Job matching is the next feature.
        </EmptyState>
      ) : (
        <EmptyState icon={<UserCog className="h-6 w-6" />} title="Complete your profile first">
          FitWork needs your skills to find matching jobs.{" "}
          <Link to="/onboarding" className="font-medium text-brand-600 hover:underline">Set up your profile →</Link>
        </EmptyState>
      )}
    </>
  );
}
