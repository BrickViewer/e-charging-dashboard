import { describe, it, expect } from "vitest";

import { evaluatePassword, PASSWORD_MIN_LENGTH } from "./passwordStrength";

describe("evaluatePassword", () => {
  it("weigert een leeg wachtwoord", async () => {
    const r = await evaluatePassword("");
    expect(r.ok).toBe(false);
  });

  it("weigert te korte wachtwoorden (< PASSWORD_MIN_LENGTH) ook al zijn ze complex", async () => {
    const short = "9f!Kd2-tR"; // 9 tekens
    expect(short.length).toBeLessThan(PASSWORD_MIN_LENGTH);
    const r = await evaluatePassword(short);
    expect(r.ok).toBe(false);
    expect(r.warningNl).toContain(String(PASSWORD_MIN_LENGTH));
  });

  it("weigert zwakke/veelvoorkomende wachtwoorden", async () => {
    expect((await evaluatePassword("password")).ok).toBe(false);
    expect((await evaluatePassword("Password123")).ok).toBe(false);
    expect((await evaluatePassword("Welkom12345")).ok).toBe(false);
    expect((await evaluatePassword("aaaaaaaaaa")).ok).toBe(false);
  });

  it("accepteert een lang, onvoorspelbaar wachtwoord", async () => {
    const strong = "9f!Kd2-tRq7wZ";
    const r = await evaluatePassword(strong);
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.labelNl).not.toBe("");
  });

  it("straft wachtwoorden af die de eigen gegevens bevatten (userInputs)", async () => {
    // Het wachtwoord IS het e-mailadres → zxcvbn geeft score 0 → niet ok.
    const r = await evaluatePassword("gebruiker@voorbeeld.nl", ["gebruiker@voorbeeld.nl"]);
    expect(r.ok).toBe(false);
  });
});
