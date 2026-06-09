import { test, expect } from "@playwright/test";
import fs from "node:fs";

// Verifieert de nieuwe Marketing-workspace + de werkende Blog-module.
function loggedIn(): boolean {
  try {
    const s = JSON.parse(fs.readFileSync("apps/admin/e2e/.auth/state.json", "utf8"));
    return Boolean((s.cookies?.length ?? 0) > 0 || (s.origins?.length ?? 0) > 0);
  } catch { return false; }
}

test.describe("Marketing — workspace + blog", () => {
  test.skip(!loggedIn(), "Geen testlogin (zet E2E_USER_EMAIL/PASSWORD)");

  test("Marketing-werkblad in de switcher-slider + blogs-pagina laadt", async ({ page }) => {
    await page.goto("/marketing/blogs");
    await expect(page.getByRole("heading", { name: /^blogs$/i })).toBeVisible({ timeout: 20000 });
    // De werkblad-switcher is een slider: het actieve werkblad als label + pijltjes.
    await expect(page.getByRole("button", { name: "Volgend werkblad" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Vorig werkblad" })).toBeVisible();
    await expect(page.getByRole("button", { name: /nieuwe blog/i })).toBeVisible();
  });

  test("nieuwe blog: titel + inhoud → opslaan → verschijnt in de lijst", async ({ page }) => {
    const title = `E2E Blog ${Date.now()}`;
    await page.goto("/marketing/blogs/nieuw");
    await page.getByPlaceholder(/titel van de blog/i).fill(title);
    await page.locator(".rich-content").click();
    await page.keyboard.type("Dit is een testblog met wat inhoud voor de leestijd.");
    await page.getByRole("button", { name: /^opslaan$/i }).click();
    await expect(page).toHaveURL(/\/marketing\/blogs\/[0-9a-f-]{36}/, { timeout: 15000 });
    await page.goto("/marketing/blogs");
    await expect(page.getByText(title)).toBeVisible({ timeout: 15000 });
  });
});
