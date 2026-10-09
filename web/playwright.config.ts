import { defineConfig } from "@playwright/test";

// Supabase is not reachable from tests: each spec stubs its REST calls with page.route.
export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.e2e\.ts/,
  use: { baseURL: "http://localhost:5190/" },
  webServer: {
    command: "npm run dev -- --port 5190 --strictPort",
    url: "http://localhost:5190/",
    reuseExistingServer: false,
  },
});
