/**
 * AI Proposal Assistant (UC-6): choose tone + length, generate, edit, regenerate, copy.
 * If the AI is unavailable the backend returns a template draft and we show a notice.
 */
import clsx from "clsx";
import { Check, Copy, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { api, ApiError } from "../lib/api";
import { Alert, Button, Card, Spinner, Textarea } from "./ui";

type Tone = "professional" | "friendly" | "technical";
type Length = "concise" | "standard" | "detailed";

interface GeneratedProposal {
  id: string;
  content: string;
  is_fallback: boolean;
  provider: string;
  model: string | null;
  remaining_today: number;
}

interface SavedProposal {
  id: string;
  content: string;
  tone: Tone;
  length: Length;
  is_fallback: boolean;
}

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "technical", label: "Technical" },
];

const LENGTHS: { value: Length; label: string; words: string }[] = [
  { value: "concise", label: "Concise", words: "~120 words" },
  { value: "standard", label: "Standard", words: "~200 words" },
  { value: "detailed", label: "Detailed", words: "~280 words" },
];

function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; words?: string }[];
  label: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            title={o.words}
            className={clsx(
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProposalPanel({ jobId }: { jobId: string }) {
  const [tone, setTone] = useState<Tone>("professional");
  const [length, setLength] = useState<Length>("standard");
  const [text, setText] = useState("");
  const [meta, setMeta] = useState<{ is_fallback: boolean; remaining?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Show the latest saved draft for this job, if any
  useEffect(() => {
    api<SavedProposal[]>("/proposals", { query: { job_id: jobId } })
      .then((list) => {
        if (list[0]) {
          setText(list[0].content);
          setTone(list[0].tone);
          setLength(list[0].length);
          setMeta({ is_fallback: list[0].is_fallback });
        }
      })
      .catch(() => undefined);
  }, [jobId]);

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await api<GeneratedProposal>("/proposals/generate", { method: "POST", body: { job_id: jobId, tone, length } });
      setText(res.content);
      setMeta({ is_fallback: res.is_fallback, remaining: res.remaining_today });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate a proposal.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed. Select the text and press Ctrl+C.");
    }
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-brand-600" /> Proposal assistant
          </h2>
          <p className="mt-1 text-sm text-slate-500">A first draft written only from your real profile. Always review before sending.</p>
        </div>
        {meta?.remaining !== undefined && <span className="text-xs text-slate-400">{meta.remaining} generations left today</span>}
      </div>

      <div className="mt-5 flex flex-wrap gap-5">
        <Segmented label="Tone" value={tone} onChange={setTone} options={TONES} />
        <Segmented label="Length" value={length} onChange={setLength} options={LENGTHS} />
      </div>

      {error && <Alert tone="error" className="mt-4">{error}</Alert>}

      {!text && !loading && (
        <Button className="mt-5" onClick={generate} icon={<Sparkles className="h-4 w-4" />}>
          Generate proposal
        </Button>
      )}

      {loading && !text && (
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          <Spinner className="h-5 w-5" /> Writing your draft… this can take up to 30 seconds.
        </div>
      )}

      {text && (
        <div className="mt-5 space-y-3">
          {meta?.is_fallback && (
            <Alert tone="info">The AI service was unavailable, so this is a template draft filled with your profile. Edit it before sending.</Alert>
          )}
          <div className="relative">
            <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} aria-label="Proposal draft" className={clsx("leading-relaxed", loading && "opacity-50")} />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400">{words} words</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={generate} loading={loading} icon={<RefreshCw className="h-4 w-4" />}>
                Regenerate
              </Button>
              <Button onClick={copy} icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}>
                {copied ? "Copied" : "Copy to clipboard"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
