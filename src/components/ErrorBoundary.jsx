// ── Top-level error boundary ───────────────────────────────────────────────────
// A rendering failure in one module (e.g. a Postgame card) must never blank
// the whole app. Shows a safe fallback with a support id; logs through the
// analytics error pipe; never exposes stack traces to users.
import { Component } from "react";
import { T } from "../theme.js";
import { reportError } from "../errors.js";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, supportId: null };
  }
  static getDerivedStateFromError() {
    const supportId = Math.random().toString(36).slice(2, 10);
    return { error: true, supportId };
  }
  componentDidCatch(error) {
    reportError("render", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", background: "#0b0e17", color: T.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui" }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 34 }}>🏀</div>
          <h1 style={{ fontSize: 20, fontStyle: "italic", fontWeight: 900 }}>
            ERA<span style={{ color: T.gold }}>CLASH</span> hit the rim
          </h1>
          <p style={{ fontSize: 13.5, color: T.textDim, lineHeight: 1.6 }}>
            Something went wrong displaying this screen. Your saved data is untouched.
            <br />Support code: <b style={{ color: T.text }}>{this.state.supportId}</b>
          </p>
          <button onClick={() => window.location.assign("/")} style={{ padding: "12px 28px", fontSize: 14, fontWeight: 800, border: "none", borderRadius: 10, background: T.gold, color: "#fffdf8", cursor: "pointer" }}>
            Back to the arena
          </button>
        </div>
      </div>
    );
  }
}
