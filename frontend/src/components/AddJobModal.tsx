/** Paste a job from any website so FitWork can score it for you. */
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { api, ApiError } from "../lib/api";
import type { Job } from "../lib/types";
import { Modal } from "./Modal";
import { Alert, Button, Field, Input, Textarea } from "./ui";

export function AddJobModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budgetType, setBudgetType] = useState<"fixed" | "hourly">("fixed");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 3) return setError("Please add a job title.");
    if (description.trim().length < 20) return setError("Please paste the full job description (at least 20 characters).");
    if (budgetMin && budgetMax && Number(budgetMin) > Number(budgetMax)) {
      return setError("Minimum budget can't be more than the maximum budget.");
    }
    if (url.trim() && !/^https?:\/\//i.test(url.trim())) return setError("Links must start with https://");
    setSaving(true);
    try {
      const job = await api<Job>("/jobs/manual", {
        method: "POST",
        body: {
          title: title.trim(),
          description: description.trim(),
          budget_type: budgetType,
          budget_min: budgetMin ? Number(budgetMin) : null,
          budget_max: budgetMax ? Number(budgetMax) : null,
          url: url.trim() || null,
        },
      });
      onClose();
      navigate(`/app/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the job.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Score a job from anywhere">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Job title" htmlFor="job-title">
          <Input id="job-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Shopify store redesign" />
        </Field>
        <Field label="Job description" htmlFor="job-desc">
          <Textarea id="job-desc" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Paste the full description here…" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Type" htmlFor="job-type">
            <select id="job-type" value={budgetType} onChange={(e) => setBudgetType(e.target.value as "fixed" | "hourly")} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm shadow-sm">
              <option value="fixed">Fixed</option>
              <option value="hourly">Hourly</option>
            </select>
          </Field>
          <Field label="Min $" htmlFor="job-min">
            <Input id="job-min" type="number" min={0} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
          </Field>
          <Field label="Max $" htmlFor="job-max">
            <Input id="job-max" type="number" min={0} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
          </Field>
        </div>
        <Field label="Link (optional)" htmlFor="job-url">
          <Input id="job-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Add and score</Button>
        </div>
      </form>
    </Modal>
  );
}
