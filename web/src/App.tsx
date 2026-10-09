import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { GOOGLE_CALENDAR_SCOPE } from "./lib/config";
import { configured, supabase } from "./lib/supabase";
import { Tasks } from "./Tasks";
import { People } from "./People";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

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
      <p>Signed in as {session.user.email}</p>
      <button type="button" onClick={() => supabase!.auth.signOut()}>
        Sign out
      </button>
      <Tasks googleToken={session.provider_token ?? null} onReconnect={signIn} />
      <People />
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
