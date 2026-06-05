import { test, expect } from "@playwright/test";

// Website-intake journey — puur via de publieke edge-functie (geen login nodig).
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "https://uuldldhmuanmjlyvnagt.supabase.co";
const SECRET = process.env.LEAD_INTAKE_SECRET ?? "";
const INTAKE_URL = `${SUPABASE_URL}/functions/v1/lead-intake`;

test.describe("Website-intake", () => {
  test("zonder secret wordt geweigerd (401)", async ({ request }) => {
    const res = await request.post(INTAKE_URL, { data: { company_name: "E2E-NoSecret" } });
    expect(res.status()).toBe(401);
  });

  test("met geldige secret maakt een lead aan", async ({ request }) => {
    test.skip(!SECRET, "Stel LEAD_INTAKE_SECRET in om de intake te testen");
    const res = await request.post(INTAKE_URL, {
      headers: { "x-intake-secret": SECRET },
      data: {
        company_name: "E2E-Intake BV",
        contact_name: "Test Persoon",
        contact_email: "test@e2e.nl",
        city: "Amersfoort",
        location_type: "workplace",
        estimated_charge_points: 8,
        message: "E2E intake-test",
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.id).toBeTruthy();
  });

  test("honeypot-veld blokkeert de bot (geen lead)", async ({ request }) => {
    test.skip(!SECRET, "Stel LEAD_INTAKE_SECRET in om de intake te testen");
    const res = await request.post(INTAKE_URL, {
      headers: { "x-intake-secret": SECRET },
      data: { company_name: "E2E-Bot", hp: "ik ben een bot" },
    });
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.id).toBeUndefined();
  });

  test("zonder company_name → 400", async ({ request }) => {
    test.skip(!SECRET, "Stel LEAD_INTAKE_SECRET in om de intake te testen");
    const res = await request.post(INTAKE_URL, {
      headers: { "x-intake-secret": SECRET },
      data: { contact_name: "Geen bedrijf" },
    });
    expect(res.status()).toBe(400);
  });
});
