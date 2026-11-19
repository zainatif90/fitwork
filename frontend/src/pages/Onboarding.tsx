/**
 * Profile setup wizard (UC-2): 4 steps with a progress bar and per-step validation.
 * Also used to edit an existing profile (fields are pre-filled from GET /profile/me).
 */
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { SkillInput } from "../components/SkillInput";
import { Alert, Button, Card, Field, FullPageSpinner, Input, Logo, Textarea } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { profileStrength } from "../lib/profileStrength";
import { PLATFORMS, type ExperienceLevel, type Platform, type Profile, type ProfileInput } from "../lib/types";

const STEPS = ["Skills", "Experience & rate", "About you", "Platforms"];

const LEVELS: { value: ExperienceLevel; label: string; text: string }[] = [
  { value: "beginner", label: "Beginner", text: "Less than 1 year of paid work" },
  { value: "intermediate", label: "Intermediate", text: "1–4 years, solid track record" },
  { value: "expert", label: "Expert", text: "5+ years, complex projects" },
];

type Errors = Partial<Record<"skills" | "experience_level" | "hourly_rate" | "bio" | "portfolio_urls", string>>;

const EMPTY: ProfileInput = { skills: [], experience_level: "intermediate", hourly_rate: 0, bio: "", portfolio_urls: [], platforms: [] };

function isUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validateStep(step: number, p: ProfileInput, rate: string): Errors {
  const e: Errors = {};
  if (step === 0 && p.skills.length === 0) e.skills = "Add at least one skill.";
  if (step === 1) {
    const r = Number(rate);
    if (!rate || Number.isNaN(r) || r <= 0) e.hourly_rate = "Enter your hourly rate in USD.";
    else if (r > 1000) e.hourly_rate = "Rate must be $1000/hour or less.";
  }
  if (step === 2) {
    if (p.bio.length > 2000) e.bio = "Keep your bio under 2000 characters.";
    const bad = p.portfolio_urls.find((u) => u.trim() && !isUrl(u.trim()));
    if (bad) e.portfolio_urls = `"${bad}" is not a valid link (it must start with http:// or https://).`;
  }
  return e;
}

/** Last step: tells the user if the profile is too thin to match well, with a link back to the right step. */
function ProfileStrengthHint({ skills, bio, onFix }: { skills: string[]; bio: string; onFix: (step: number) => void }) {
  const { level, tips } = profileStrength(skills, bio);
  const tone = { weak: "border-amber-200 bg-amber-50 text-amber-800", good: "border-sky-200 bg-sky-50 text-sky-800",
                 strong: "border-emerald-200 bg-emerald-50 text-emerald-800" }[level];
  const label = { weak: "Weak: matches will be vague", good: "Good", strong: "Strong: ready for accurate matches" }[level];
  return (
    <div className={clsx("rounded-xl border p-4 text-sm", tone)} role="status">
      <p className="font-semibold">Profile strength: {label}</p>
      {tips.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {tips.map((t) => (
            <li key={t}>
              {t}{" "}
              <button type="button" className="font-medium underline" onClick={() => onFix(t.includes("bio") ? 2 : 0)}>
                Fix it
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEdit, setIsEdit] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProfileInput>(EMPTY);
  const [rate, setRate] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    api<Profile | null>("/profile/me")
      .then((p) => {
        if (p) {
          setIsEdit(true);
          setForm({ skills: p.skills, experience_level: p.experience_level, hourly_rate: p.hourly_rate, bio: p.bio, portfolio_urls: p.portfolio_urls, platforms: p.platforms });
          setRate(String(p.hourly_rate));
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  function next() {
    const found = validateStep(step, form, rate);
    setErrors(found);
    if (Object.keys(found).length === 0) setStep((s) => s + 1);
  }

  async function save() {
    setServerError(null);
    const payload: ProfileInput = {
      ...form,
      hourly_rate: Number(rate),
      bio: form.bio.trim(),
      portfolio_urls: form.portfolio_urls.map((u) => u.trim()).filter(Boolean),
    };
    setSaving(true);
    try {
      await api<Profile>("/profile/me", { method: "PUT", body: payload });
      navigate("/app", { replace: true, state: { profileSaved: true } });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <FullPageSpinner />;

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Logo />
          {isEdit && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/app/settings")}>
              Cancel
            </Button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <p className="text-sm font-medium text-brand-600">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {isEdit ? "Edit your profile" : `Let's set up your profile${user ? `, ${user.full_name.split(" ")[0]}` : ""}`}
        </h1>

        {/* Progress bar with step labels */}
        <div className="mt-6">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
            <div className="h-full rounded-full bg-brand-gradient transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <ol className="mt-3 hidden grid-cols-4 text-xs sm:grid">
            {STEPS.map((label, i) => (
              <li key={label} className={clsx("flex items-center gap-1.5", i <= step ? "font-medium text-slate-900" : "text-slate-400")}>
                <span className={clsx("flex h-5 w-5 items-center justify-center rounded-full text-[10px]", i < step ? "bg-brand-600 text-white" : i === step ? "border-2 border-brand-600 text-brand-600" : "border border-slate-300")}>
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>

        {/* key = step: each step slides in */}
        <Card key={step} className="animate-fade-up mt-8 p-6 sm:p-8">
          {serverError && <Alert tone="error" className="mb-5">{serverError}</Alert>}

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">What are you good at?</h2>
                <p className="text-sm text-slate-500">Your skills are the most important input for matching. Add 5–15 for the best results.</p>
              </div>
              <Field label="Skills" error={errors.skills} hint={`${form.skills.length} added`}>
                <SkillInput value={form.skills} onChange={(s) => update("skills", s)} invalid={!!errors.skills} />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Experience and rate</h2>
                <p className="text-sm text-slate-500">We use your rate to check whether a job's budget fits you.</p>
              </div>
              <div role="radiogroup" aria-label="Experience level" className="grid gap-3 sm:grid-cols-3">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    role="radio"
                    aria-checked={form.experience_level === l.value}
                    onClick={() => update("experience_level", l.value)}
                    className={clsx(
                      "rounded-xl border p-4 text-left transition",
                      form.experience_level === l.value ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <p className="font-semibold text-slate-900">{l.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{l.text}</p>
                  </button>
                ))}
              </div>
              <Field label="Hourly rate (USD)" htmlFor="rate" error={errors.hourly_rate}>
                <div className="relative max-w-xs">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">$</span>
                  <Input id="rate" type="number" inputMode="decimal" min={1} max={1000} value={rate} invalid={!!errors.hourly_rate} onChange={(e) => setRate(e.target.value)} className="pl-7 pr-12" placeholder="25" />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">/ hr</span>
                </div>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Tell clients about yourself</h2>
                <p className="text-sm text-slate-500">Your bio helps matching and is used to write proposal drafts. Only write what is true.</p>
              </div>
              <Field label="Bio" htmlFor="bio" error={errors.bio} hint={`${form.bio.length}/2000`}>
                <Textarea id="bio" rows={6} value={form.bio} invalid={!!errors.bio} onChange={(e) => update("bio", e.target.value)} placeholder="I'm a frontend developer who builds fast, accessible dashboards with React and Tailwind…" />
              </Field>
              <Field label="Portfolio links (optional)" error={errors.portfolio_urls}>
                <div className="space-y-2">
                  {form.portfolio_urls.map((url, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={url}
                        placeholder="https://github.com/you"
                        onChange={(e) => update("portfolio_urls", form.portfolio_urls.map((u, j) => (j === i ? e.target.value : u)))}
                      />
                      <Button type="button" variant="ghost" onClick={() => update("portfolio_urls", form.portfolio_urls.filter((_, j) => j !== i))} aria-label="Remove link">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {form.portfolio_urls.length < 10 && (
                    <Button type="button" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => update("portfolio_urls", [...form.portfolio_urls, ""])}>
                      Add link
                    </Button>
                  )}
                </div>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Where do you find work?</h2>
                <p className="text-sm text-slate-500">Select the platforms you use. This is optional.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p: Platform) => {
                  const on = form.platforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      onClick={() => update("platforms", on ? form.platforms.filter((x) => x !== p) : [...form.platforms, p])}
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                        on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600 hover:border-slate-400",
                      )}
                    >
                      {on && <Check className="h-3.5 w-3.5" />}
                      {p}
                    </button>
                  );
                })}
              </div>
              <ProfileStrengthHint skills={form.skills} bio={form.bio} onFix={(s) => setStep(s)} />
            </div>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0} icon={<ArrowLeft className="h-4 w-4" />}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={save} loading={saving} icon={<Check className="h-4 w-4" />}>
                {isEdit ? "Save changes" : "Finish setup"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
