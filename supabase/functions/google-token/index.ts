// Exchanges the Google refresh token for a fresh access token (SPEC 1). Google access tokens last about an hour;
// the browser keeps the refresh token and calls this once per hour. Needs the GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets.
// Deployed with JWT verification on, so only a signed-in user can call it. The browser calls it cross-origin,
// so every response carries CORS headers and the OPTIONS preflight gets an empty 204.
const CORS = {
  "Access-Control-Allow-Origin": "https://guynuri.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });
  const { refresh_token } = await req.json().catch(() => ({ refresh_token: undefined }));
  if (typeof refresh_token !== "string" || refresh_token === "") {
    return Response.json({ error: "missing refresh_token" }, { status: 400, headers: CORS });
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    // invalid_grant means the refresh token was revoked or expired; the app then asks for Reconnect.
    return Response.json({ error: data.error ?? "refresh failed" }, { status: 401, headers: CORS });
  }
  return Response.json({ access_token: data.access_token, expires_in: data.expires_in }, { headers: CORS });
});
