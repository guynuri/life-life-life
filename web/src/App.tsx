import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { LucideIcon } from "lucide-react";
import { ListChecks, LogIn, Palette, RefreshCw, Settings as SettingsIcon, Sun, Users } from "lucide-react";
import { GOOGLE_CALENDAR_SCOPE } from "./lib/config";
import { configured, supabase } from "./lib/supabase";
import { Tasks } from "./Tasks";
import { People } from "./People";
import { MoodScreen } from "./MoodScreen";
import { Today } from "./Today";
import { Settings } from "./Settings";
import { placeTasks } from "./lib/calendarSync";
import { placementQueue } from "./lib/serialQueue";
import { formatPage, parsePage, type PageId } from "./lib/route";
import { Label } from "./ui";

// [Decided] Five pages behind a bottom tab bar (SPEC Pages). Each page stays mounted and is hidden when inactive,
// so its state and effects keep running. The open tab is the URL hash.
const pages: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Today", icon: Sun },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "people", label: "People", icon: Users },
  { id: "mood", label: "Mood", icon: Palette },
  { id: "settings", label: "Settings", icon: SettingsIcon },
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
        <button type="button" onClick={signIn}>
          <Label icon={LogIn}>Sign in with Google</Label>
        </button>
      </Shell>
    );
  }

  return (
    <Shell
      action={
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh"
          title="Refresh"
          onClick={refreshAll}
          disabled={refreshing}
        >
          <RefreshCw aria-hidden="true" size={20} strokeWidth={2.25} className={refreshing ? "spin" : undefined} />
        </button>
      }
      tabs={
        <nav className="tabs" role="tablist" aria-label="Pages">
          {pages.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={page === p.id}
                onClick={() => {
                  location.hash = formatPage(p.id);
                }}
              >
                <Icon aria-hidden="true" size={22} strokeWidth={2.25} />
                <span>{p.label}</span>
              </button>
            );
          })}
        </nav>
      }
    >
      {refreshError && (
        <p className="error" role="alert">
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
        <Settings
          googleToken={session.provider_token ?? null}
          onReconnect={signIn}
          onSignOut={() => void supabase!.auth.signOut()}
          email={session.user.email ?? ""}
        />
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

function Shell({
  children,
  status,
  action,
  tabs,
}: {
  children?: React.ReactNode;
  status?: string;
  action?: React.ReactNode;
  tabs?: React.ReactNode;
}) {
  return (
    <div className="shell">
      <header className="topbar">
        <h1>life-life-life</h1>
        {action}
      </header>
      <main className="content">
        {status && <p className="status">{status}</p>}
        {children}
      </main>
      {tabs}
    </div>
  );
}
