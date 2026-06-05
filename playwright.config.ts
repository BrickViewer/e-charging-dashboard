import { defineConfig, devices } from "@playwright/test";

// E2e voor het Sales/Leads-proces. De intake-journey draait puur via de API
// (geen login nodig). De UI-journeys vereisen een testlogin via env:
//   E2E_USER_EMAIL=...  E2E_USER_PASSWORD=...  (sales/admin/manager-account)
// Optioneel: E2E_BASE_URL (default http://localhost:8080),
//            LEAD_INTAKE_SECRET (voor de intake-journey).
export default defineConfig({
  testDir: "./apps/admin/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./apps/admin/e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    storageState: "apps/admin/e2e/.auth/state.json",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
