/** Agency settings for owners: rename the agency, invite members, see and remove members. */
import { Check, Copy, Mail, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { api, ApiError } from "../lib/api";
import type { Agency, AgencyMemberRow } from "../lib/types";
import { Alert, Badge, Button, Card, Field, Input } from "./ui";

export function AgencySettings() {
  const [agency, setAgency] = useState<Agency | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [lastLink, setLastLink] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Agency>("/agency/me").then((a) => {
      setAgency(a);
      setName(a.name);
    }).catch(() => setError("Could not load your agency."));
  }, []);

  async function rename(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const a = await api<Agency>("/agency/me", { method: "PUT", body: { name } });
      setAgency(a);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not rename.");
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ member: AgencyMemberRow; invite_link: string }>("/agency/invite", { method: "POST", body: { email } });
      setLastLink({ email: res.member.email, link: res.invite_link });
      setEmail("");
      setAgency(await api<Agency>("/agency/me"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the invite.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api(`/agency/members/${id}`, { method: "DELETE" });
    setAgency(await api<Agency>("/agency/me"));
  }

  async function copy() {
    if (!lastLink) return;
    await navigator.clipboard.writeText(lastLink.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="p-6" >
      <h2 id="agency" className="scroll-mt-20 font-semibold text-slate-900">Agency settings</h2>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}

      <form onSubmit={rename} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <Field label="Agency name" htmlFor="agency-name">
            <Input id="agency-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" variant="secondary" icon={saved ? <Check className="h-4 w-4" /> : undefined}>{saved ? "Saved" : "Rename"}</Button>
      </form>

      <form onSubmit={invite} className="mt-6 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-6">
        <div className="min-w-[16rem] flex-1">
          <Field label="Invite a team member" htmlFor="invite-email" hint="They get a one-time link and join after logging in with this email.">
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" />
          </Field>
        </div>
        <Button type="submit" loading={busy} icon={<Mail className="h-4 w-4" />} disabled={!email}>Send invite</Button>
      </form>

      {lastLink && (
        <Alert tone="info" className="mt-4">
          <p>Invite link for <strong>{lastLink.email}</strong> (email sending is not set up, so share this link with them):</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="block flex-1 truncate rounded bg-white px-2 py-1 text-xs text-slate-700">{lastLink.link}</code>
            <Button size="sm" variant="secondary" onClick={copy} icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </Alert>
      )}

      <ul className="mt-6 divide-y divide-slate-100 border-t border-slate-100">
        {agency?.members.length === 0 && <li className="py-3 text-sm text-slate-500">No members yet.</li>}
        {agency?.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{m.name ?? m.email}</p>
              {m.name && <p className="text-xs text-slate-500">{m.email}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge className={m.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>{m.status}</Badge>
              <button onClick={() => remove(m.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${m.email}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
