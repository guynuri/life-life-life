import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { clearNotifications } from "./lib/push";
import { applyTheme, readStoredTheme, resolveTheme } from "./lib/theme";
import "./styles.css";

// Set before the first render, so the page never flashes the wrong theme.
applyTheme(resolveTheme(readStoredTheme()));
// Opening the app clears its notifications from Notification Center.
void clearNotifications().catch(() => undefined);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
