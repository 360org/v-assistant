import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./lib/store";
import { OAuthCallbackPage } from "./pages/OAuthCallback";
import "./index.css";

const isCallbackRoute = window.location.pathname === "/callback";

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
