import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./lib/store";
import { OAuthCallbackPage } from "./pages/OAuthCallback";
import "./index.css";

// Runtime marker also makes entry-level changes trigger a full dev-page
// refresh instead of preserving stale channel effects through Fast Refresh.
document.documentElement.dataset.vAssistantRuntime = "session-sync-v2";

const search = new URLSearchParams(window.location.search);
const isCallbackRoute =
  window.location.pathname === "/callback" ||
  // OpenRouter returns to the origin root. Render the relay page there so the
  // authorization code is posted back to the opener rather than booting chat
  // inside the OAuth popup.
  (window.location.pathname === "/" && search.has("code"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isCallbackRoute ? (
      <OAuthCallbackPage />
    ) : (
      <AppProvider>
        <App />
      </AppProvider>
    )}
  </React.StrictMode>,
);
