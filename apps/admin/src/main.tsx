import { createRoot } from "react-dom/client";
import { MsalProvider } from "@azure/msal-react";
import App from "./App.tsx";
import { msalInstance } from "./lib/msal";
import "./index.css";

async function bootstrap() {
  try {
    await msalInstance.initialize();
    await msalInstance.handleRedirectPromise().catch((e) => console.error("[MSAL] redirect", e));
  } catch (e) {
    console.error("[MSAL] init", e);
  }
  createRoot(document.getElementById("root")!).render(
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>,
  );
}

bootstrap();
