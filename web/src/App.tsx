import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { GOOGLE_CALENDAR_SCOPE } from "./lib/config";
import { configured, supabase } from "./lib/supabase";
import { Tasks } from "./Tasks";
import { People } from "./People";
import { MoodScreen } from "./MoodScreen";
import { Reminders } from "./Reminders";
import { placeTasks } from "./lib/calendarSync";

// [Assumed] Four pages behind a tab bar, all in one page with no router. Each page stays mounted and is hidden
// when another tab is open, so its state and effects keep running.
const pages = [
  { id: "today", label: "Today" },
  { id: "tasks", label: "Tasks" },
  { id: "people", label: "People" },
  { id: "mood", label: "Mood" },
] as const;
type PageId = (typeof pages)[number]["id"];

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);
  const [page, setPage] = useState<PageId>("today");
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

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
      await placeTasks(session?.provider_token ?? null, Date.now());
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
        <button type="button" onClick={signIn}>
          Sign in with Google
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="topbar">
        <p>Signed in as {session.user.email}</p>
        <div className="topbar-actions">
          <button type="button" onClick={refreshAll} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" onClick={() => supabase!.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      {refreshError && <p className="error" role="alert">{refreshError}</p>}
      <nav className="tabs" role="tablist" aria-label="Pages">
        {pages.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={page === p.id} onClick={() => setPage(p.id)}>
            {p.label}
          </button>
        ))}
      </nav>
      <div hidden={page !== "today"}>
        <p>Today is added in phase 7.</p>
        <Reminders />
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

function Shell({ children, status }: { children?: React.ReactNode; status?: string }) {
  return (
    <main className="app">
      <h1>life-life-life</h1>
      {status && <p className="status">{status}</p>}
      {children}
    </main>
  );
}
