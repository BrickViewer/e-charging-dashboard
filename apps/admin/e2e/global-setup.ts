import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const STATE = "apps/admin/e2e/.auth/state.json";
const EMPTY = { cookies: [], origins: [] };

// Logt in via de echte login-flow van de app en bewaart de sessie als
// storageState. Zonder E2E_USER_EMAIL/PASSWORD wordt een lege state geschreven
// en slaan de UI-journeys zichzelf over.
export default async function globalSetup(_config: FullConfig) {
  mkdirSync(dirname(STATE), { recursive: true });

  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";

  if (!email || !password) {
    writeFileSync(STATE, JSON.stringify(EMPTY));
    console.log("[e2e] Geen E2E_USER_EMAIL/PASSWORD gezet — UI-journeys worden overgeslagen.");
    return;
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseURL}/login`);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /inloggen/i }).click();
    await page.waitForURL(/\/(admin|sales|portal)/, { timeout: 15_000 });
    await page.context().storageState({ path: STATE });
    console.log("[e2e] Ingelogd; sessie opgeslagen in", STATE);
  } catch (err) {
    writeFileSync(STATE, JSON.stringify(EMPTY));
    console.warn("[e2e] Login mislukt — UI-journeys worden overgeslagen.", (err as Error).message);
  } finally {
    await browser.close();
  }
}
