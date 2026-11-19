import { Github, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api, ApiError } from "../lib/api";
import { Alert, Button, Input } from "./ui";

interface Suggestion { skill: string; repos: number; examples: string[] }
interface GitHubSkills { username: string; repos_scanned: number; suggestions: Suggestion[] }

/**
 * "Import from GitHub" in the profile wizard: reads the languages and topics of the user's public repositories
 * (GET /api/profile/github-skills) and suggests skills, each with the repositories it came from as evidence.
 * Nothing is added until the user clicks a suggestion (or "Add all").
 */
export function GitHubImport({ skills, onAdd, max = 40 }: { skills: string[]; onAdd: (s: string[]) => void; max?: number }) {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<GitHubSkills | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const have = new Set(skills.map((s) => s.toLowerCase()));
  const open = result?.suggestions.filter((s) => !have.has(s.skill.toLowerCase())) ?? [];
  const room = Math.max(0, max - skills.length);

  async function lookUp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await api<GitHubSkills>("/profile/github-skills", { query: { username: username.trim() } }));
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "Could not reach GitHub. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Github className="h-4 w-4" /> Import skills from GitHub <span className="font-normal text-slate-500">(optional)</span>
      </p>
      <form onSubmit={lookUp} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input aria-label="GitHub username" placeholder="your GitHub username" value={username} autoComplete="off"
          onChange={(e) => setUsername(e.target.value)} className="sm:max-w-xs" />
        <Button type="submit" variant="secondary" loading={busy} disabled={!username.trim()}>Find my skills</Button>
      </form>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      {result && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-slate-600">
            {result.repos_scanned} public repositories of <b>{result.username}</b> checked.{" "}
            {open.length === 0 ? "No new skills found: your list already covers them." : "Click a skill to add it:"}
          </p>
          {open.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                {open.map((s) => (
                  <button key={s.skill} type="button" disabled={room === 0} onClick={() => onAdd([s.skill])}
                    title={`Used in: ${s.examples.join(", ")}`}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-white px-3 py-1 font-medium text-brand-700 transition hover:bg-brand-50 disabled:opacity-50">
                    <Plus className="h-3.5 w-3.5" /> {s.skill}
                    <span className="text-xs font-normal text-slate-400">· {s.repos} repo{s.repos === 1 ? "" : "s"}</span>
                  </button>
                ))}
              </div>
              <Button type="button" size="sm" variant="ghost" disabled={room === 0}
                onClick={() => onAdd(open.slice(0, room).map((s) => s.skill))}>
                Add all ({Math.min(open.length, room)})
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
