import clsx from "clsx";
import { Briefcase, LogOut, Menu, MessagesSquare, Radar, Settings, UserCog, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useChatUnread } from "../lib/useChatUnread";
import type { Role } from "../lib/types";
import { ShootingStars } from "./ShootingStars";
import { CodeBackdrop } from "./CodeBackdrop";
import { Logo } from "./ui";

const roleLabel: Record<Role, string> = {
  freelancer: "Solo Freelancer",
  agency_owner: "Agency Owner",
  agency_member: "Agency Member",
};

/** Main app shell: left sidebar navigation + page content. */
export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Mobile menu: Escape closes it, focus moves into it while open and back to the ☰ button after
  useEffect(() => {
    if (!mobileOpen) return;
    drawerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    const menuButton = menuButtonRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      menuButton?.focus();
    };
  }, [mobileOpen]);

  const isAgencyUser = user?.role === "agency_owner" || user?.role === "agency_member";
  const unread = useChatUnread(isAgencyUser);
  const nav = [
    { to: "/app", label: "Matches", icon: Briefcase, end: true },
    { to: "/app/skill-gap", label: "Skill Gap", icon: Radar },
    { to: "/app/agency", label: "Agency", icon: Users },
    ...(isAgencyUser ? [{ to: "/app/chat", label: "Team Chat", icon: MessagesSquare, badge: unread }] : []),
    { to: "/onboarding", label: "My Profile & Skills", icon: UserCog },
    { to: "/app/settings", label: "Settings", icon: Settings },
  ];

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  async function resendVerification() {
    setResendError(null);
    try {
      await api("/auth/resend-verification", { method: "POST" });
      setResent(true);
    } catch (err) {
      setResendError(err instanceof ApiError ? err.message : "Could not send the email. Please try again.");
    }
  }

  const sidebar = (
    <div className="bg-hero relative flex h-full flex-col overflow-hidden text-white">
      <div className="pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-violet-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-16 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
      <ShootingStars />
      <div className="relative flex h-16 items-center justify-between px-5">
        <NavLink to="/" aria-label="FitWork home"><Logo light /></NavLink>
        <button className="rounded-md p-1 text-slate-300 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="relative flex-1 space-y-1.5 px-3 py-6">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Menu</p>
        {nav.map(({ to, label, icon: Icon, end, badge }, i) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            style={{ "--i": i } as React.CSSProperties}
            className={({ isActive }) =>
              clsx(
                "tab-3d tab-3d-enter flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                isActive ? "bg-brand-gradient shine text-white ring-1 ring-white/20" : "text-slate-300 hover:bg-white/10 hover:text-white",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
            {!!badge && (
              <span className="animate-pop-in ml-auto rounded-full bg-fuchsia-500 px-1.5 text-[11px] font-bold tabular-nums text-white shadow-glow"
                aria-label={`${badge} unread`}>{badge > 99 ? "99+" : badge}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="relative border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-2 py-2 ring-1 ring-white/10">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white ring-2 ring-white/30">
            {user?.full_name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user?.full_name}</p>
            <p className="truncate text-xs text-brand-200">{user ? roleLabel[user.role] : ""}</p>
          </div>
          <button onClick={onLogout} className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Log out" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 shadow-2xl lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="animate-fade-in absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside ref={drawerRef} className="animate-slide-in-left absolute inset-y-0 left-0 w-64 shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-hero flex h-14 items-center gap-3 px-4 text-white lg:hidden">
          <button ref={menuButtonRef} onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-slate-200"
            aria-label="Open menu" aria-expanded={mobileOpen}>
            <Menu className="h-5 w-5" />
          </button>
          <Logo light />
        </header>

        {user && !user.is_verified && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-8">
            Please verify your email address.{" "}
            {resent ? (
              <span className="font-medium">A new link has been sent.</span>
            ) : resendError ? (
              <span className="font-medium" role="alert">{resendError}</span>
            ) : (
              <button onClick={resendVerification} className="font-medium underline underline-offset-2 hover:text-amber-700">
                Resend link
              </button>
            )}
          </div>
        )}

        <main className="app-canvas app-matrix flex-1 overflow-y-auto">
          {/* glowing green code scrolling behind every page (decorative) */}
          <CodeBackdrop />
          {/* key = page address: every page fades in, its sections one after another */}
          <div key={location.pathname} className="stagger-children relative mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
