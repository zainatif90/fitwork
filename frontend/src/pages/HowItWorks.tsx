import { ArrowRight, Clapperboard } from "lucide-react";
import { Link } from "react-router-dom";

import { StoryPlayer } from "../components/story/StoryPlayer";
import { Logo, PageHeader } from "../components/ui";
import { useAuth } from "../lib/auth";

/** "How it works" tab inside the app: the animated story. */
export default function HowItWorks() {
  return (
    <>
      <PageHeader icon={<Clapperboard />} title="How FitWork works" subtitle="A 3-minute animated story with a narrator, in English or Urdu." />
      <div className="rounded-3xl bg-white/90 p-4 shadow-soft ring-1 ring-brand-100/60 sm:p-6">
        <StoryPlayer />
      </div>
    </>
  );
}

/** Public version (no account needed), linked from the landing page. */
export function PublicHowItWorks() {
  const { user } = useAuth();
  return (
    <div className="min-h-full bg-[#fdf8f5]">
      <header className="bg-hero text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
          <Link to="/"><Logo light /></Link>
          <Link to={user ? "/app" : "/register"} className="btn-3d inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-semibold">
            {user ? "Go to my matches" : "Find my matches, free"} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <h1 className="font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">How FitWork works</h1>
        <p className="mt-2 text-slate-600">A 3-minute animated story with a narrator, in English or Urdu.</p>
        <div className="mt-6 rounded-3xl bg-white p-4 shadow-soft ring-1 ring-brand-100/60 sm:p-6">
          <StoryPlayer />
        </div>
      </main>
    </div>
  );
}
