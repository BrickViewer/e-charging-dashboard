import { test, expect } from "@playwright/test";
import fs from "node:fs";

// Smoke-suite voor het Beheer-werkblad: elke route rendert (bekende heading
// zichtbaar) zonder wit scherm of uncaught error. Plus twee gerichte checks
// (Klanten-tabel/zoekveld, Storingen-status) en de regressie dat "MSP Locaties"
// definitief weg is. UI-tests vereisen een ingelogde state (global-setup met
// E2E_USER_EMAIL/PASSWORD); zonder login slaat de hele file zichzelf over.
function loggedIn(): boolean {
  try {
    const s = JSON.parse(fs.readFileSync("apps/admin/e2e/.auth/state.json", "utf8"));
    return Boolean((s.cookies?.length ?? 0) > 0 || (s.origins?.length ?? 0) > 0);
  } catch {
    return false;
  }
}

// Route → een heading die de pagina uniek en betrouwbaar markeert.
const BEHEER_ROUTES: { path: string; heading: RegExp }[] = [
  { path: "/beheer", heading: /^dashboard$/i },
  { path: "/beheer/klanten", heading: /^klanten$/i },
  { path: "/beheer/locaties", heading: /^locaties$/i },
  { path: "/beheer/storingen", heading: /^storingen$/i },
  { path: "/beheer/financieel", heading: /financieel/i },
  { path: "/beheer/instellingen", heading: /^instellingen$/i },
];

test.describe("Beheer — smoke", () => {
  test.skip(!loggedIn(), "Geen testlogin (zet E2E_USER_EMAIL/PASSWORD)");

  for (const { path, heading } of BEHEER_ROUTES) {
    test(`${path} rendert zonder crash`, async ({ page }) => {
      // Vang echte JS-fouten (white-screen-oorzaak) op; console.error telt niet mee.
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto(path);
      // Bekende heading zichtbaar = pagina is echt gerenderd (geen leeg Outlet / wit scherm).
      await expect(
        page.getByRole("heading", { name: heading }).first(),
      ).toBeVisible({ timeout: 20000 });

      expect(errors, `Uncaught fouten op ${path}: ${errors.join(" | ")}`).toEqual([]);
    });
  }

  test("Klanten toont een tabel of een lege/foutstatus + gelabeld zoekveld", async ({ page }) => {
    await page.goto("/beheer/klanten");
    await expect(page.getByRole("heading", { name: /^klanten$/i })).toBeVisible({ timeout: 20000 });

    // Zoekveld aanwezig en gelabeld (placeholder fungeert als toegankelijke naam).
    await expect(page.getByPlaceholder(/zoek/i).first()).toBeVisible();

    // Determinate uitkomst: óf de tabel, óf de lege-staat, óf de foutbanner.
    const table = page.getByRole("table");
    const empty = page.getByText(/geen klanten gevonden/i);
    const error = page.getByText(/kon klanten niet laden/i);
    await expect(table.or(empty).or(error).first()).toBeVisible({ timeout: 20000 });
  });

  test("Klant-rij navigeert naar de volledige detailpagina", async ({ page }) => {
    await page.goto("/beheer/klanten");
    await expect(page.getByRole("heading", { name: /^klanten$/i })).toBeVisible({ timeout: 20000 });

    // Rij = role=button met aria-label "Open klant …". Zonder data niets te openen → skip.
    const firstRow = page.getByRole("button", { name: /open klant/i }).first();
    if ((await firstRow.count()) === 0) { test.skip(true, "Geen klanten om te openen"); return; }

    await firstRow.click();
    // Klik gaat naar de volledige route-pagina (geen zijpaneel).
    await expect(page).toHaveURL(/\/beheer\/klanten\/[^/]+$/, { timeout: 20000 });
  });

  test("Storingen toont een determinate status (storingen, leeg of fout)", async ({ page }) => {
    await page.goto("/beheer/storingen");
    await expect(page.getByRole("heading", { name: /^storingen$/i })).toBeVisible({ timeout: 20000 });

    const table = page.getByRole("table");
    const empty = page.getByText(/geen actieve storingen|geen storingen in deze weergave/i);
    const error = page.getByText(/storingen konden niet worden geladen/i);
    await expect(table.or(empty).or(error).first()).toBeVisible({ timeout: 20000 });
  });

  test("MSP Locaties is weg: geen navlink en geen werkende pagina", async ({ page }) => {
    await page.goto("/beheer");
    await expect(page.getByRole("heading", { name: /^dashboard$/i })).toBeVisible({ timeout: 20000 });

    // De sidebar heeft geen "MSP Locaties"-link; de echte "Locaties"-link staat er wél.
    await expect(page.getByRole("link", { name: /msp locaties/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^locaties$/i }).first()).toBeVisible();

    // Direct navigeren levert geen werkende "MSP Locaties"-pagina op (404 of leeg,
    // maar nooit een heading die de oude pagina zou markeren).
    await page.goto("/beheer/msp-locaties");
    await expect(page.getByRole("heading", { name: /msp locaties/i })).toHaveCount(0);
  });
});
