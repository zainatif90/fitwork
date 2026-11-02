/**
 * Keeps an open tab on the latest deployed version of the website.
 *
 * Every build gets a new file name (assets/index-<hash>.js). When the tab comes back into focus
 * (at most once a minute) we fetch index.html and compare that file name with the one this tab is running.
 * If a newer version is live, the next page change does a full reload, so the user lands on the
 * new page instead of an old copy. We never reload in the middle of a page (no lost typing).
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const CHECK_EVERY_MS = 60_000;
let lastCheck = 0;
let stale = false;

function runningBuild(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return script ? new URL(script.src).pathname : null;
}

async function checkForNewBuild(): Promise<void> {
  const current = runningBuild();
  if (!current || stale || Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();
  try {
    const html = await (await fetch("/", { cache: "no-store" })).text();
    const live = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
    if (live && live !== current) stale = true;
  } catch {
    // Offline or a network hiccup: try again later.
  }
}

export function useFreshVersion(): void {
  const location = useLocation();

  // A newer build was found earlier: load it now, as the user moves to another page.
  useEffect(() => {
    if (stale) window.location.reload();
    else void checkForNewBuild();
  }, [location.pathname]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void checkForNewBuild(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
}
