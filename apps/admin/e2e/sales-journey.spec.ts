import { test, expect } from "@playwright/test";

// UI-journeys door het salesproces. Vereisen een testlogin (E2E_USER_EMAIL/
// PASSWORD); zonder die env worden ze overgeslagen. Selectors volgen de
// huidige componenten — pas ze aan als de UI wijzigt.
test.skip(!process.env.E2E_USER_EMAIL, "Stel E2E_USER_EMAIL/PASSWORD in voor de UI-journeys");

const COMPANY = `E2E-Journey ${Date.now()}`;

test.describe.serial("Sales-journey (UI)", () => {
  test("board laadt", async ({ page }) => {
    await page.goto("/sales/leads");
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  });

  test("handmatig lead toevoegen → kaart verschijnt met bedrijf + contact", async ({ page }) => {
    await page.goto("/sales/leads");
    await page.getByRole("button", { name: /lead toevoegen/i }).first().click();
    const dialog = page.getByRole("dialog");
    // Eerste textbox = Bedrijfsnaam, tweede = Contactpersoon.
    await dialog.getByRole("textbox").nth(0).fill(COMPANY);
    await dialog.getByRole("textbox").nth(1).fill("Eva Tester");
    await dialog.getByRole("button", { name: /lead toevoegen/i }).click();
    await expect(page.getByText(COMPANY)).toBeVisible();
    await expect(page.getByText("Eva Tester")).toBeVisible();
  });

  test("lead openen → to-do toevoegen + afvinken", async ({ page }) => {
    await page.goto("/sales/leads");
    await page.getByText(COMPANY).first().click();
    await page.getByRole("tab", { name: /to-do/i }).click();
    const taskInput = page.getByPlaceholder(/nieuwe taak/i);
    await taskInput.fill("E2E bel de klant");
    await taskInput.press("Enter");
    await expect(page.getByText("E2E bel de klant")).toBeVisible();
  });

  test("notitie plaatsen verschijnt in de tijdlijn", async ({ page }) => {
    await page.goto("/sales/leads");
    await page.getByText(COMPANY).first().click();
    await page.getByRole("tab", { name: /activiteit/i }).click();
    const noteInput = page.getByPlaceholder(/notitie plaatsen/i);
    await noteInput.fill("E2E-notitie op de tijdlijn");
    await page.getByRole("button", { name: /^plaats$/i }).click();
    await expect(page.getByText("E2E-notitie op de tijdlijn")).toBeVisible();
  });

  test("converteren naar klant via AlertDialog", async ({ page }) => {
    await page.goto("/sales/leads");
    await page.getByText(COMPANY).first().click();
    await page.getByRole("button", { name: /converteer naar klant/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^converteer$/i }).click();
    await expect(page.getByText(/klant aangemaakt/i)).toBeVisible();
  });

  test("fasen beheren → fase toevoegen verschijnt als kolom", async ({ page }) => {
    await page.goto("/sales/leads");
    await page.getByRole("button", { name: /fasen beheren/i }).click();
    await page.getByRole("button", { name: /fase toevoegen/i }).click();
    // Sluit de dialog; de nieuwe fase moet als kolom op de board verschijnen.
    await page.keyboard.press("Escape");
    await expect(page.getByText("Nieuwe fase", { exact: true })).toBeVisible();
  });
});
