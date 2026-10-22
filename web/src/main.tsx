import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, readStoredTheme, resolveTheme } from "./lib/theme";
import "./styles.css";

// Set before the first render, so the page never flashes the wrong theme.
applyTheme(resolveTheme(readStoredTheme(), window.matchMedia("(prefers-color-scheme: dark)").matches));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
