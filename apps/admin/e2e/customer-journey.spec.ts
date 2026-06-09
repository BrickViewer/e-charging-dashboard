import { test, expect } from "@playwright/test";
import fs from "node:fs";

// Volledige klantreis-smoke op UI-niveau. De backend-keten is apart getest;
// dit dekt de menselijke paden + de zojuist gefixte UI (leaddetail, eigenaar-
// lijst, uitnodiging-hint, fasen). UI-tests vereisen een ingelogde state
// (global-setup met E2E_USER_EMAIL/PASSWORD).

function loggedIn(): boolean {
  try {
    const s = JSON.parse(fs.readFileSync("apps/admin/e2e/.auth/state.json", "utf8"));
    return Boolean((s.cookies?.length ?? 0) > 0 || (s.origins?.length ?? 0) > 0);
  } catch { return false; }
}

test.describe("Publieke token-pagina's (geen login)", () => {
  test("ongeldige offerte-link toont nette melding", async ({ page }) => {
    await page.goto("/offerte/ongeldige-token-xyz");
    await expect(page.getByText(/niet beschikbaar|niet \(meer\) geldig|ongeldig|verlopen/i).first()).toBeVisible({ timeout: 15000 });
  });
  test("ongeldige uitnodiging-link toont nette melding", async ({ page }) => {
    await page.goto("/uitnodiging/ongeldige-token-xyz");
    await expect(page.getByText(/niet gevonden|ongeldig|verlopen|ingetrokken/i).first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Sales — leaddetail & eigenaar", () => {
  test.skip(!loggedIn(), "Geen testlogin (zet E2E_USER_EMAIL/PASSWORD)");

  test("leadboard laadt en een lead opent zonder wit scherm", async ({ page }) => {
    await page.goto("/sales/leads");
    await expect(page.getByRole("heading", { name: /leads/i })).toBeVisible({ timeout: 20000 });

    const card = page.locator('[class*="cursor-pointer"]').filter({ hasText: /BV|Groep|Holding|Vastgoed|test/i }).first();
    if (await card.count()) {
      await card.click();
      // Paneel opent: bedrijfsnaam-titel + primaire actie + fase-stepper zichtbaar (geen crash).
      await expect(page.getByRole("button", { name: /maak offerte/i })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/Fase \d+ \/ \d+|Potentieel|Gewonnen/i).first()).toBeVisible();
    }
  });

  test("eigenaar-lijst bevat geen oude/rolloze accounts", async ({ page }) => {
    await page.goto("/sales/leads");
    await expect(page.getByRole("heading", { name: /leads/i })).toBeVisible({ timeout: 20000 });
    const card = page.locator('[class*="cursor-pointer"]').filter({ hasText: /BV|Groep|Holding|Vastgoed|test/i }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(page.getByRole("button", { name: /maak offerte/i })).toBeVisible({ timeout: 10000 });
    // De eigenaar-Select openen (combobox in de meta-regel).
    const ownerTrigger = page.getByRole("combobox").last();
    await ownerTrigger.click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    // Oude testaccounts mogen NIET in de lijst staan.
    await expect(listbox).not.toContainText("spicysoda.com");
    await expect(listbox).not.toContainText("wwmjonkers@gmail.com");
    await page.keyboard.press("Escape");
  });
});

test.describe("Beheer — klantdetail uitnodiging-gating", () => {
  test.skip(!loggedIn(), "Geen testlogin (zet E2E_USER_EMAIL/PASSWORD)");

  test("klant zonder e-mailadres toont een duidelijke hint i.p.v. dode knop", async ({ page }) => {
    await page.goto("/admin/klanten");
    await expect(page.getByRole("heading", { name: /klanten/i })).toBeVisible({ timeout: 20000 });
    const search = page.getByPlaceholder(/zoek/i).first();
    if (await search.count()) await search.fill("Kragt");
    const row = page.getByText(/Kragt Groep/i).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.click();
    // Onboarding/Portal toont de e-mail-hint of de 'geen e-mailadres'-status (geen dode 'Uitnodiging sturen').
    await expect(page.getByText(/E-mailadres toevoegen|Geen e-mailadres|Geen e-mailadres bekend/i).first()).toBeVisible({ timeout: 15000 });
  });
});
