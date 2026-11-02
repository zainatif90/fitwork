/**
 * Team Chat (agency owners and members), laid out like a team messaging app:
 * conversations on the left (Team channel, job threads, direct messages), the open conversation on the right.
 *
 * New messages arrive by polling: every 4 s for the open conversation, every 15 s for the conversation list.
 * Polling pauses while the browser tab is hidden. Each poll asks for messages from 15 s before the newest one
 * we have (and drops the ones we already show): two messages sent at almost the same moment can be saved in
 * a different order than their timestamps, and without this overlap one of them could be skipped.
 * Archived conversations (someone left, or a job is no longer assigned) are read-only.
 * "Meet now" posts a Jitsi Meet video-call link into the conversation and opens it in a new tab.
 */
import clsx from "clsx";
import { Archive, ArrowLeft, Briefcase, ExternalLink, Hash, MessagesSquare, Search, SendHorizontal, Users, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Avatar } from "../components/agency/parts";
import { Alert, EmptyState, Spinner } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { timeAgo } from "../lib/format";
import { CHAT_UNREAD_EVENT } from "../lib/useChatUnread";
import type { ChatChannel, ChatChannels, ChatMessage } from "../lib/types";

const MESSAGE_POLL_MS = 4000;
const CHANNEL_POLL_MS = 15000;
const MAX_LENGTH = 2000;
const POLL_OVERLAP_MS = 15000;

/** Runs `fn` every `ms` while the tab is visible (and once right away when it becomes visible again). */
function usePolling(fn: () => void, ms: number, enabled = true) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => document.visibilityState === "visible" && saved.current(), ms);
    const onVisible = () => document.visibilityState === "visible" && saved.current();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms, enabled]);
}

function ChannelIcon({ channel, size = "md" }: { channel: ChatChannel; size?: "md" | "lg" }) {
  if (channel.kind === "direct" && channel.member_id) {
    return <Avatar id={channel.member_id} name={channel.title} size={size} />;
  }
  return (
    <span className={clsx(
      "inline-flex shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
      channel.kind === "team" ? "bg-brand-gradient" : "bg-gradient-to-br from-slate-700 to-slate-900",
      size === "lg" ? "h-12 w-12 [&>svg]:h-5 [&>svg]:w-5" : "h-10 w-10 [&>svg]:h-4 [&>svg]:w-4",
    )}>
      {channel.kind === "team" ? <Users /> : <Briefcase />}
    </span>
  );
}

/** Plain text with web links made clickable (React escapes everything else). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) => (/^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">{p}</a>
        : <span key={i}>{p}</span>))}
    </>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function CallCard({ m, mine }: { m: ChatMessage; mine: boolean }) {
  return (
    <div className="w-72 max-w-full overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-soft">
      <div className="flex items-center gap-3 bg-gradient-to-r from-brand-600 to-fuchsia-600 px-4 py-3 text-white">
        <span className="animate-pulse-ring rounded-full bg-white/20 p-2"><Video className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{mine ? "You started a video call" : `${m.sender_name.split(" ")[0]} started a video call`}</p>
          <p className="text-xs text-white/80">{clock(m.created_at)} · Jitsi Meet</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-xs text-slate-500">Opens in a new tab</span>
        <a href={m.body} target="_blank" rel="noopener noreferrer"
          className="shine inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 hover:bg-emerald-600">
          <Video className="h-3.5 w-3.5" /> Join call
        </a>
      </div>
    </div>
  );
}

function MessageList({ messages, me }: { messages: ChatMessage[]; me: string }) {
  const rows: ReactNode[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
    // Messages from the same person within 5 minutes are grouped (name and avatar shown once)
    const grouped = !newDay && prev && prev.sender_id === m.sender_id && prev.kind === "text" && m.kind === "text"
      && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000;
    const mine = m.sender_id === me;
    if (newDay) {
      rows.push(
        <div key={`day-${m.id}`} className="my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /> {dayLabel(m.created_at)} <span className="h-px flex-1 bg-slate-200" />
        </div>,
      );
    }
    rows.push(
      <div key={m.id} className={clsx("animate-fade-up flex gap-2.5", mine ? "flex-row-reverse" : "", grouped ? "mt-1" : "mt-4")}>
        <div className="w-8 shrink-0">
          {!grouped && !mine && <Avatar id={m.sender_id ?? m.id} name={m.sender_name} size="sm" />}
        </div>
        <div className={clsx("flex min-w-0 max-w-[85%] flex-col sm:max-w-[70%]", mine ? "items-end" : "items-start")}>
          {!grouped && (
            <p className={clsx("mb-1 flex items-baseline gap-2 text-xs", mine && "flex-row-reverse")}>
              <span className="font-semibold text-slate-800">{mine ? "You" : m.sender_name}</span>
              <span className="text-slate-400">{clock(m.created_at)}</span>
            </p>
          )}
          {m.kind === "call" ? <CallCard m={m} mine={mine} /> : (
            <div className={clsx(
              "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
              mine ? "rounded-tr-md bg-brand-gradient text-white" : "rounded-tl-md border border-slate-200/80 bg-white text-slate-800",
            )}>
              <Linkified text={m.body} />
            </div>
          )}
        </div>
      </div>,
    );
  });
  return <>{rows}</>;
}

function Conversation({ channel, me, onBack, onActivity }: {
  channel: ChatChannel; me: string; onBack: () => void; onActivity: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const base = `/agency/chat/channels/${channel.key}`;

  const add = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((cur) => {
      const known = new Set((cur ?? []).map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      if (fresh.length === 0) return cur;
      return [...(cur ?? []), ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setError(null);
    nearBottom.current = true;
    api<ChatMessage[]>(`${base}/messages`)
      .then((list) => { if (!cancelled) { setMessages(list); onActivity(); } })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load messages."));
    input.current?.focus();
    return () => { cancelled = true; };
  }, [base, onActivity]);

  usePolling(() => {
    if (!messages) return;
    const last = messages[messages.length - 1];
    const since = last ? new Date(new Date(last.created_at).getTime() - POLL_OVERLAP_MS).toISOString() : null;
    const query = since ? `?after=${encodeURIComponent(since)}` : "";
    api<ChatMessage[]>(`${base}/messages${query}`).then((list) => {
      const known = new Set(messages.map((m) => m.id));
      if (list.some((m) => !known.has(m.id))) { add(list); onActivity(); }
    }).catch(() => undefined); // a missed poll is fine; the next one catches up
  }, MESSAGE_POLL_MS, messages !== null);

  // Stay at the bottom when new messages arrive, unless the user scrolled up to read older ones
  useEffect(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const m = await api<ChatMessage>(`${base}/messages`, { method: "POST", body: { body } });
      nearBottom.current = true;
      add([m]);
      setText("");
      onActivity();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Message not sent. Please try again.");
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  async function startCall() {
    setCalling(true);
    setError(null);
    // Open the tab now (inside the click) so the browser does not block it as a pop-up; fill in the address after.
    const tab = window.open("", "_blank");
    try {
      const m = await api<ChatMessage>(`${base}/call`, { method: "POST" });
      nearBottom.current = true;
      add([m]);
      onActivity();
      if (tab) {
        tab.opener = null; // the call page gets no access back to FitWork
        tab.location.href = m.body;
      }
    } catch (err) {
      tab?.close();
      setError(err instanceof ApiError ? err.message : "Could not start the call.");
    } finally {
      setCalling(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  const jobId = channel.kind === "job" ? channel.key.slice(4) : null;

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-gradient-to-b from-white/60 to-brand-50/30">
      <header className="flex items-center gap-3 border-b border-slate-200/70 bg-white/80 px-3 py-3 backdrop-blur sm:px-5">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Back to conversations">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <ChannelIcon channel={channel} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display font-bold text-slate-900">{channel.title}</h2>
          <p className="truncate text-xs text-slate-500">{channel.subtitle}</p>
        </div>
        {jobId && (
          <Link to={`/app/jobs/${jobId}`} className="hidden h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:inline-flex">
            <ExternalLink className="h-4 w-4" /> Job
          </Link>
        )}
        {!channel.archived && <button onClick={startCall} disabled={calling}
          className="shine inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-gradient px-3 text-sm font-semibold text-white shadow-glow transition hover:-translate-y-0.5 disabled:opacity-70">
          {calling ? <Spinner className="h-4 w-4" /> : <Video className="h-4 w-4" />} <span className="hidden sm:inline">Meet now</span>
        </button>}
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-3 pb-4 sm:px-6"
        onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
        {!messages && !error && <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6 text-brand-600" /></div>}
        {messages && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <ChannelIcon channel={channel} size="lg" />
            <p className="mt-3 font-display text-lg font-bold text-slate-900">Start the conversation</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {channel.kind === "team" ? "Everyone in your agency can read this channel."
                : channel.kind === "job" ? "Only the agency owner and the teammate working on this job can see this thread."
                  : `Only you and ${channel.title.split(" ")[0]} can see these messages.`}
            </p>
          </div>
        )}
        {messages && messages.length > 0 && <MessageList messages={messages} me={me} />}
      </div>

      {channel.archived ? (
        <div className="border-t border-slate-200/70 bg-slate-50 px-5 py-4 text-center text-sm text-slate-500">
          {channel.kind === "direct"
            ? `${channel.title.split(" ")[0]} has left the agency. You can read this conversation, but not reply.`
            : "This job is no longer assigned in your agency. The conversation is kept for your records."}
        </div>
      ) : (
      <div className="border-t border-slate-200/70 bg-white/85 p-3 backdrop-blur sm:px-5">
        {error && <Alert tone="error" className="mb-2">{error}</Alert>}
        <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-1.5 pl-3 shadow-soft transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea
            id="chat-input"
            ref={input}
            rows={1}
            value={text}
            maxLength={MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder={`Message ${channel.kind === "direct" ? channel.title.split(" ")[0] : channel.kind === "team" ? "the team" : "about this job"}`}
            className="field-sizing-content max-h-36 min-h-[2.25rem] flex-1 resize-none bg-transparent py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:outline-none"
          />
          <button onClick={() => void send()} disabled={!text.trim() || sending} aria-label="Send"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none">
            {sending ? <Spinner className="h-4 w-4" /> : <SendHorizontal className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 hidden text-[11px] text-slate-400 sm:block">
          Enter to send · Shift + Enter for a new line{text.length > MAX_LENGTH - 200 && ` · ${MAX_LENGTH - text.length} characters left`}
        </p>
      </div>
      )}
    </section>
  );
}

function ChannelGroup({ title, icon, items, active, onPick }: {
  title: string; icon: ReactNode; items: ChatChannel[]; active: string | null; onPick: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="flex items-center gap-1.5 px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon} {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((c) => (
          <li key={c.key}>
            <button onClick={() => onPick(c.key)} aria-current={active === c.key ? "true" : undefined}
              className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                active === c.key ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-slate-50")}>
              <ChannelIcon channel={c} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={clsx("truncate text-sm", c.unread ? "font-bold text-slate-900" : "font-medium text-slate-800")}>{c.title}</span>
                  {c.last_at && <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(c.last_at)}</span>}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={clsx("truncate text-xs", c.unread ? "font-medium text-slate-700" : "text-slate-500")}>
                    {c.last_message ?? c.subtitle}
                  </span>
                  {c.unread > 0 && (
                    <span className="animate-pop-in shrink-0 rounded-full bg-fuchsia-500 px-1.5 text-[11px] font-bold tabular-nums text-white">{c.unread}</span>
                  )}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TeamChat() {
  const { user, reloadUser } = useAuth();
  const [data, setData] = useState<ChatChannels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [params, setParams] = useSearchParams();
  const isAgencyUser = user?.role === "agency_owner" || user?.role === "agency_member";
  const activeKey = params.get("c");

  const loadChannels = useCallback(() => {
    api<ChatChannels>("/agency/chat/channels")
      .then((d) => {
        setData(d);
        setError(null);
        window.dispatchEvent(new CustomEvent(CHAT_UNREAD_EVENT, { detail: d.unread_total })); // keep the sidebar badge in sync
      })
      .catch((err) => {
        // Removed from the team or the agency was closed: refresh the role so the page explains it
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) void reloadUser();
        setError(err instanceof ApiError ? err.message : "Could not load your chats.");
      });
  }, [reloadUser]);

  useEffect(() => {
    if (isAgencyUser) loadChannels();
  }, [isAgencyUser, loadChannels]);
  usePolling(loadChannels, CHANNEL_POLL_MS, isAgencyUser);

  // Desktop opens the Team channel by default; phones start on the conversation list
  useEffect(() => {
    if (data && !activeKey && window.matchMedia("(min-width: 1024px)").matches) setParams({ c: "team" }, { replace: true });
  }, [data, activeKey, setParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.channels ?? []).filter((c) => !q || c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q));
  }, [data, query]);

  if (!isAgencyUser) {
    return (
      <EmptyState icon={<MessagesSquare className="h-6 w-6" />} title="Team Chat is for agencies">
        Start or join an agency to chat with your team, discuss jobs and start video calls.{" "}
        <Link to="/app/agency" className="font-medium text-brand-600 hover:underline">Go to Agency →</Link>
      </EmptyState>
    );
  }
  if (error && !data) return <Alert tone="error">{error}</Alert>;

  const active = data?.channels.find((c) => c.key === activeKey) ?? null;
  const pick = (key: string) => setParams({ c: key });

  return (
    <div className="-mx-4 -my-6 h-[calc(100dvh-3.5rem)] p-0 sm:-mx-8 sm:-my-8 sm:p-4 lg:h-dvh lg:p-6">
      <div className="flex h-full overflow-hidden border-white/70 bg-white/90 shadow-lift ring-1 ring-brand-100/60 backdrop-blur sm:rounded-3xl sm:border">
        {/* Conversation list */}
        <aside className={clsx("w-full flex-col border-r border-slate-200/70 lg:flex lg:w-80 lg:shrink-0", active ? "hidden" : "flex")}>
          <div className="border-b border-slate-200/70 p-4">
            <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-slate-900">
              <span className="rounded-xl bg-brand-gradient p-2 text-white shadow-glow"><MessagesSquare className="h-4 w-4" /></span>
              Team Chat
            </h1>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <label htmlFor="chat-search" className="sr-only">Search conversations</label>
              <input id="chat-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people or jobs"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {!data ? <div className="flex justify-center p-8"><Spinner className="h-5 w-5 text-brand-600" /></div> : (
              <>
                <ChannelGroup title="Channels" icon={<Hash />} items={filtered.filter((c) => c.kind === "team")} active={activeKey} onPick={pick} />
                <ChannelGroup title="Job threads" icon={<Briefcase />} items={filtered.filter((c) => c.kind === "job" && !c.archived)} active={activeKey} onPick={pick} />
                <ChannelGroup title="Direct messages" icon={<Users />} items={filtered.filter((c) => c.kind === "direct" && !c.archived)} active={activeKey} onPick={pick} />
                <ChannelGroup title="Archived" icon={<Archive />} items={filtered.filter((c) => c.archived)} active={activeKey} onPick={pick} />
                {filtered.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No conversations match “{query}”.</p>}
                {data.channels.length === 1 && (
                  <p className="mx-2 mt-2 rounded-xl bg-brand-50/70 p-3 text-xs text-slate-600">
                    Direct messages and job threads appear here once teammates join and jobs are assigned.
                  </p>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Open conversation */}
        {active && data ? (
          <Conversation key={active.key} channel={active} me={data.me} onBack={() => setParams({})} onActivity={loadChannels} />
        ) : (
          <div className="hidden flex-1 items-center justify-center lg:flex">
            {activeKey && data ? (
              <p className="text-sm text-slate-500">This conversation is not available. Pick one from the list.</p>
            ) : <Spinner className="h-6 w-6 text-brand-600" />}
          </div>
        )}
      </div>
    </div>
  );
}
