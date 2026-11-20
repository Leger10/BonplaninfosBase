// main.jsx - Version sans Router
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App.jsx";
import "@/index.css";
import { HelmetProvider } from "react-helmet-async";
import ErrorBoundary from "@/components/ErrorBoundary";
import { initI18n } from "./i18n";
import LanguageTutorial from "@/components/tutorial/LanguageTutorial";
import { LanguageProvider } from "@/contexts/LanguageContext";
// ThemeProvider / AuthProvider / DataProvider sont montes une seule fois,
// dans App.jsx. Les monter aussi ici provoquait deux sessions, deux abonnements
// temps reel et deux chargements de profil concurrents (courses critiques).

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => console.log("SW registered:", registration))
      .catch((error) => console.log("SW registration failed:", error));
  });
}

(async () => {
  await initI18n();

  const root = ReactDOM.createRoot(document.getElementById("root"));

  root.render(
    <React.StrictMode>
      <HelmetProvider>
        <ErrorBoundary>
          <LanguageProvider>
            <LanguageTutorial />
            <App /> {/* 🔥 App contient BrowserRouter + Theme/Auth/Data providers */}
          </LanguageProvider>
        </ErrorBoundary>
      </HelmetProvider>
    </React.StrictMode>
  );
})();