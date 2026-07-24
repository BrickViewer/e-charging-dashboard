import { describe, it, expect } from "vitest";
import { EMAIL_TEMPLATES, TEMPLATES_BY_KEY, missingPlaceholders, requiredPlaceholders } from "./emailTemplates";

// De Deno-tweeling importeert niets, dus vitest kan hem gewoon transformeren en inladen.
// Zo controleren we de ECHTE inhoud van beide registers in plaats van een snapshot die
// stilletjes kan verouderen.
import { EMAIL_TEMPLATES as DENO_TEMPLATES } from "../../../../supabase/functions/_shared/emailTemplates";

describe("e-mailsjabloon-register", () => {
  it("heeft unieke sleutels", () => {
    const keys = EMAIL_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("heeft per sjabloon unieke slotnamen", () => {
    for (const t of EMAIL_TEMPLATES) {
      const names = t.slots.map((s) => s.name);
      expect(new Set(names).size, `dubbele slotnaam in ${t.key}`).toBe(names.length);
    }
  });

  // Zonder dit zou een sjabloon dat nog nooit is aangepast al ongeldig zijn: de standaardtekst
  // moet zelf de verplichte placeholders bevatten, anders kan de gebruiker nooit geldig opslaan.
  it("standaardteksten bevatten alle verplichte placeholders", () => {
    for (const t of EMAIL_TEMPLATES) {
      expect(missingPlaceholders(t.key, {}), `standaardtekst van ${t.key} mist een verplichte placeholder`).toEqual([]);
    }
  });

  it("gebruikte placeholders zijn ook gedeclareerd", () => {
    for (const t of EMAIL_TEMPLATES) {
      const declared = new Set(t.placeholders.map((p) => p.name));
      for (const slot of t.slots) {
        for (const m of slot.default.matchAll(/\{\{(\w+)\}\}/g)) {
          expect(declared.has(m[1]), `${t.key}/${slot.name} gebruikt {{${m[1]}}} maar die staat niet in placeholders`).toBe(true);
        }
      }
    }
  });

  it("elk sjabloon heeft voorbeeldwaarden voor alle placeholders", () => {
    for (const t of EMAIL_TEMPLATES) {
      for (const p of t.placeholders) {
        expect(t.sample[p.name], `${t.key} mist een voorbeeldwaarde voor {{${p.name}}}`).toBeTruthy();
      }
    }
  });
});

// Loopt dit uit elkaar, dan verstuurt de edge function andere tekst dan de editor toont.
describe("tweeling met supabase/functions/_shared/emailTemplates.ts", () => {
  it("heeft dezelfde sleutels", () => {
    expect(DENO_TEMPLATES.map((t) => t.key).sort()).toEqual(EMAIL_TEMPLATES.map((t) => t.key).sort());
  });

  it("heeft per sjabloon dezelfde slotnamen en standaardteksten", () => {
    for (const deno of DENO_TEMPLATES) {
      const app = TEMPLATES_BY_KEY[deno.key];
      expect(app, `sjabloon ${deno.key} ontbreekt aan de app-kant`).toBeTruthy();
      expect(deno.slots.map((s) => s.name)).toEqual(app.slots.map((s) => s.name));
      for (const slot of deno.slots) {
        const appSlot = app.slots.find((s) => s.name === slot.name)!;
        expect(slot.default, `standaardtekst van ${deno.key}/${slot.name} loopt uiteen`).toBe(appSlot.default);
      }
    }
  });

  it("heeft dezelfde verplichte placeholders", () => {
    for (const deno of DENO_TEMPLATES) {
      expect([...deno.required].sort(), `verplichte placeholders van ${deno.key} lopen uiteen`)
        .toEqual([...requiredPlaceholders(deno.key)].sort());
    }
  });
});
