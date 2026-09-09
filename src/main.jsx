import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";
// Phase 9A.1 built the theme candidates behind html[data-theme]; Phase 9A.2 makes
// the owner-selected Night Court V1 hybrid the product DEFAULT. It is applied
// before the first render so no unthemed frame is ever painted. There is no
// user-facing theme selector: the owner-only lab is the only other caller.
import "./theme/basketball-themes.css";
import { applyTheme, PRODUCTION_THEME_ID } from "./theme/themeResolver.js";
applyTheme(PRODUCTION_THEME_ID);

// Service worker registration lives here (not inline in index.html) so the
// Content-Security-Policy can stay script-src 'self' with no inline scripts.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
