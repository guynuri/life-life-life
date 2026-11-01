import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { GOOGLE_CALENDAR_SCOPE } from "./lib/config";
import { configured, supabase } from "./lib/supabase";
import { Tasks } from "./Tasks";
import { People } from "./People";
import { MoodScreen } from "./MoodScreen";
import { Today } from "./Today";
import { Settings } from "./Settings";
import { Icon, type IconName } from "./Icon";
import { placeTasks } from "./lib/calendarSync";
import { clearCalendarCache } from "./lib/fixedEvents";
import { placementQueue } from "./lib/serialQueue";
import { formatPage, parsePage, swipePage, type PageId } from "./lib/route";
import { forgetGoogleAccess, googleAccessToken, rememberGoogleSession } from "./lib/googleAccess";

// Touches that start here keep their own gestures: the mood pinch, text entry, sheets, and segmented choices.
const NO_SWIPE = "input, textarea, select, .mood-grid, .sheet-backdrop, .segmented, .tabbar";

// [Assumed] Four pages behind a tab bar, all in one page with no router. Each page stays mounted and is hidden
// when another tab is open, so its state and effects keep running.
const pages: { id: PageId; label: string; icon: IconName }[] = [
  { id: "today", label: "Today", icon: "today" },
  { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "people", label: "People", icon: "people" },
  { id: "mood", label: "Mood", icon: "mood" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [ready, setReady] = useState(!configured);
  // The open tab lives only in the URL hash, so back, forward, and reload keep it (SPEC Pages).
  const [hash, setHash] = useState(location.hash);
  const page: PageId = parsePage(hash);
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Swipe left or right to change tab. Starting a touch on a control with its own gesture cancels the swipe.
  function onTouchStart(e: React.TouchEvent) {
    const start = e.changedTouches[0];
    const target = e.target instanceof Element ? e.target : null;
    touchStart.current = start && !target?.closest(NO_SWIPE) ? { x: start.clientX, y: start.clientY } : null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    const end = e.changedTouches[0];
    touchStart.current = null;
    if (!start || !end) return;
    const next = swipePage(page, end.clientX - start.x, end.clientY - start.y);
    if (next) location.hash = formatPage(next);
  }

  useEffect(() => {
    const onHash = () => setHash(location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      rememberGoogleSession(next);
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Keeps a fresh Google token for the open session: checked on sign-in and every 10 minutes (tokens last about an hour).
  useEffect(() => {
    if (!session) {
      setGoogleToken(null);
      setGoogleReady(false);
      return;
    }
    const refreshToken = () =>
      googleAccessToken(session).then((token) => {
        setGoogleToken(token);
        setGoogleReady(true);
      });
    refreshToken();
    const timer = setInterval(refreshToken, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [session]);

  // SPEC Pages: Refresh re-reads Google and places tasks first, then every page reloads what is stored.
  async function refreshAll() {
    setRefreshing(true);
    clearCalendarCache();
    try {
      const token = await googleAccessToken(session);
      setGoogleToken(token);
      await placementQueue(() => placeTasks(token, Date.now()));
      setRefreshError(null);
    } catch (error) {
      setRefreshError(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    setRefreshTick((t) => t + 1);
    setRefreshing(false);
  }

  if (!configured) {
    return <Shell status="Set the Supabase URL and anon key in web/src/lib/config.ts." />;
  }
  if (!ready) return <Shell status="Loading..." />;

  if (!session) {
    return (
      <Shell>
        <section className="welcome card">
          <p>Sign in to see your day, your tasks, and the people you want to keep in touch with.</p>
          <button type="button" className="btn primary" onClick={signIn}>
            Sign in with Google
          </button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell
      actions={
        <>
          <button
            type="button"
            className="icon-btn"
            aria-label="Refresh"
            title="Refresh"
            onClick={refreshAll}
            disabled={refreshing}
          >
            <span className={refreshing ? "spin" : undefined}>
              <Icon name="refresh" />
            </span>
          </button>
          <button type="button" className="icon-btn" aria-label="Sign out" title="Sign out" onClick={signOut}>
            <Icon name="logout" />
          </button>
        </>
      }
    >
      {refreshError && (
        <p className="toast error" role="alert">
          {refreshError}
        </p>
      )}
      <div className="pages" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div hidden={page !== "today"}>
          <Today refreshTick={refreshTick} googleToken={googleToken} onReconnect={signIn} />
        </div>
        <div hidden={page !== "tasks"}>
          <Tasks googleToken={googleToken} googleReady={googleReady} onReconnect={signIn} refreshTick={refreshTick} />
        </div>
        <div hidden={page !== "people"}>
          <People refreshTick={refreshTick} />
        </div>
        <div hidden={page !== "mood"}>
          <MoodScreen refreshTick={refreshTick} />
        </div>
        <div hidden={page !== "settings"}>
          <Settings onSaved={refreshAll} />
        </div>
      </div>

      <nav className="tabbar" role="tablist" aria-label="Pages">
        {pages.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={page === p.id}
            className="tab"
            onClick={() => {
              location.hash = formatPage(p.id);
            }}
          >
            <Icon name={p.icon} size={22} />
            <span>{p.label}</span>
          </button>
        ))}
      </nav>
    </Shell>
  );
}

function signOut() {
  forgetGoogleAccess();
  supabase!.auth.signOut();
}

function signIn() {
  supabase!.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: GOOGLE_CALENDAR_SCOPE,
      queryParams: { access_type: "offline", prompt: "consent" },
      redirectTo: new URL("./", location.href).href,
    },
  });
}

function Shell({ children, status, actions }: { children?: React.ReactNode; status?: string; actions?: React.ReactNode }) {
  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>life</span>
        </div>
        {actions && <div className="topbar-actions">{actions}</div>}
      </header>
      {status && <p className="status">{status}</p>}
      {children}
    </main>
  );
}
