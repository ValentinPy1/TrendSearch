import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { PostHogProvider } from "posthog-js/react";

const isDevelopment = import.meta.env.MODE === "development";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isDevelopment ? (
      <App />
    ) : (
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        defaults: '2025-05-24',
        capture_exceptions: true,
        debug: false,
        // Enable surveys
        surveys: true,
        // Load surveys on initialization
        loaded: (posthog) => {
          if (import.meta.env.MODE !== 'development') {
            // Load surveys when PostHog is ready
            posthog.onSurveysLoaded(() => {
              console.log('PostHog surveys loaded');
            });
          }
        },
      }}
    >
      <App />
    </PostHogProvider>
    )}
  </React.StrictMode>
);