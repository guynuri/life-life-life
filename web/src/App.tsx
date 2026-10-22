import { useEffect, useState } from "react";
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
import { placementQueue } from "./lib/serialQueue";
import { formatPage, parsePage, type PageId } from "./lib/route";

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
  const [ready, setReady] = useState(!configured);
  // The open tab lives only in the URL hash, so back, forward, and reload keep it (SPEC Pages).
  const [hash, setHash] = useState(location.hash);
  const page: PageId = parsePage(hash);
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

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
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // SPEC Pages: Refresh re-reads Google and places tasks first, then every page reloads what is stored.
  async function refreshAll() {
    setRefreshing(true);
    try {
      await placementQueue(() => placeTasks(session?.provider_token ?? null, Date.now()));
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
          <button type="button" className="icon-btn" aria-label="Sign out" title="Sign out" onClick={() => supabase!.auth.signOut()}>
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
      <div hidden={page !== "today"}>
        <Today refreshTick={refreshTick} />
      </div>
      <div hidden={page !== "tasks"}>
        <Tasks googleToken={session.provider_token ?? null} onReconnect={signIn} refreshTick={refreshTick} />
      </div>
      <div hidden={page !== "people"}>
        <People refreshTick={refreshTick} />
      </div>
      <div hidden={page !== "mood"}>
        <MoodScreen refreshTick={refreshTick} />
      </div>
      <div hidden={page !== "settings"}>
        <Settings />
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
