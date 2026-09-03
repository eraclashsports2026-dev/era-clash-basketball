import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";
// Phase 9A.1: the four Basketball theme candidates. Scoped to html[data-theme];
// inert on the default product.
import "./theme/basketball-themes.css";

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
