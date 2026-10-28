import { ExternalLink, Pencil } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Badge, Card, FullPageSpinner, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Profile } from "../lib/types";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export default function Settings({ extra }: { extra?: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    api<Profile | null>("/profile/me").then(setProfile).catch(() => setProfile(null));
  }, []);

  if (profile === undefined) return <FullPageSpinner />;

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account and freelancer profile." />
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="font-semibold text-slate-900">Account</h2>
          <dl className="mt-2 divide-y divide-slate-100">
            <Row label="Name">{user?.full_name}</Row>
            <Row label="Email">
              {user?.email}{" "}
              {user?.is_verified ? <Badge className="ml-2 bg-emerald-50 text-emerald-700">Verified</Badge> : <Badge className="ml-2 bg-amber-50 text-amber-700">Not verified</Badge>}
            </Row>
          </dl>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Freelancer profile</h2>
            <Link to="/onboarding" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <Pencil className="h-3.5 w-3.5" /> {profile ? "Edit" : "Set up"}
            </Link>
          </div>
          {profile ? (
            <dl className="mt-2 divide-y divide-slate-100">
              <Row label="Skills">
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.map((s) => <Badge key={s} className="bg-brand-50 text-brand-700">{s}</Badge>)}
                </div>
              </Row>
              <Row label="Experience"><span className="capitalize">{profile.experience_level}</span></Row>
              <Row label="Hourly rate">${profile.hourly_rate}/hr</Row>
              <Row label="Bio"><p className="whitespace-pre-line text-slate-700">{profile.bio || "—"}</p></Row>
              <Row label="Portfolio">
                {profile.portfolio_urls.length ? (
                  <ul className="space-y-1">
                    {profile.portfolio_urls.map((u) => (
                      <li key={u}>
                        <a href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                          {u} <ExternalLink className="h-3 w-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : "—"}
              </Row>
              <Row label="Platforms">{profile.platforms.join(", ") || "—"}</Row>
              <Row label="Matching status">
                {profile.embedding_status === "ready" ? (
                  <Badge className="bg-emerald-50 text-emerald-700">Ready</Badge>
                ) : (
                  <Badge className="bg-amber-50 text-amber-700">Pending – will retry automatically</Badge>
                )}
              </Row>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">You haven't set up your profile yet.</p>
          )}
        </Card>
        {extra}
      </div>
    </>
  );
}
