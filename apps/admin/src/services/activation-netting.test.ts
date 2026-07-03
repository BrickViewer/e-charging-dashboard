import { describe, it, expect } from "vitest";
import { settlementVat } from "./calculations";
// De Deno edge-module die aggregate-settlements gebruikt (plain TS, geen Deno-globals).
import {
  ACTIVATION_VAT_RATE,
  computeActivationCost,
} from "../../../../supabase/functions/_shared/settlement-math";

// ============================================================================
// Activatiekosten-verrekening: bewijst de cap / doorschuif / idempotentie / BTW
// van computeActivationCost — de functie die aggregate-settlements per settlement
// aanroept om settlements.activation_cost te bepalen. client_payout blijft bruto;
// deze aftrek is los, gecapt op de incl-BTW-grondslag zodat "netto over te boeken"
// (vergoeding incl − activatie incl) nooit (meer dan een cent centronding) negatief wordt.
// ============================================================================

// Netto over te boeken zoals de vergoedingsfactuur/SettlementDetailRow het tonen:
// vergoeding incl − activatie incl (activatie ALTIJD 21% output-BTW van E-Charging).
const netToBook = (payout: number, vatRate: number, cost: number) =>
  settlementVat({ clientPayout: payout, vatRate }).inclVat
  - settlementVat({ clientPayout: cost, vatRate: ACTIVATION_VAT_RATE }).inclVat;

describe("computeActivationCost — cap, doorschuiven, BTW", () => {
  it("ACTIVATION_VAT_RATE is 21% (E-Charging output-BTW, los van de klant-BTW)", () => {
    expect(ACTIVATION_VAT_RATE).toBe(0.21);
  });

  it("1. volledig verrekend op de eerste ruime maand", () => {
    expect(computeActivationCost({ activationTotal: 100, alreadyNetted: 0, clientPayout: 500, vatRate: 0.21 })).toBe(100);
  });

  it("2. te kleine eerste maand -> gecapt, rest schuift door", () => {
    // cap = 60 * 1.21 / 1.21 = 60 (BTW-plichtig)
    expect(computeActivationCost({ activationTotal: 100, alreadyNetted: 0, clientPayout: 60, vatRate: 0.21 })).toBe(60);
  });

  it("3. tweede maand verrekent het restant", () => {
    expect(computeActivationCost({ activationTotal: 100, alreadyNetted: 60, clientPayout: 500, vatRate: 0.21 })).toBe(40);
  });

  it("4. niet-BTW-klant: cap op incl-grondslag houdt netto ~0 (nooit negatief)", () => {
    // vergoeding 0%, activatie 21% -> cap = 100 * 1 / 1.21 = 82,6446...
    const cost = computeActivationCost({ activationTotal: 100, alreadyNetted: 0, clientPayout: 100, vatRate: 0 });
    expect(cost).toBeCloseTo(82.6446, 3);
    const net = netToBook(100, 0, cost);
    expect(net).toBeGreaterThanOrEqual(-0.01); // exact ≥0; centronding max 1 cent
    expect(net).toBeLessThan(0.02);            // effectief volledig verrekend
  });

  it("5. geen activatie -> 0", () => {
    expect(computeActivationCost({ activationTotal: 0, alreadyNetted: 0, clientPayout: 500, vatRate: 0.21 })).toBe(0);
  });

  it("6. uitputting over meerdere maanden -> som == totaal", () => {
    const payouts = [30, 30, 30, 30];
    let netted = 0;
    const perMonth: number[] = [];
    for (const p of payouts) {
      const c = computeActivationCost({ activationTotal: 100, alreadyNetted: netted, clientPayout: p, vatRate: 0.21 });
      perMonth.push(c);
      netted += c;
    }
    expect(perMonth).toEqual([30, 30, 30, 10]);
    expect(netted).toBe(100);
  });

  it("7. negatieve payout-maand verrekent niets (schuift door)", () => {
    expect(computeActivationCost({ activationTotal: 100, alreadyNetted: 0, clientPayout: -50, vatRate: 0.21 })).toBe(0);
  });

  it("8. al (over)volledig verrekend -> 0, nooit negatief", () => {
    expect(computeActivationCost({ activationTotal: 100, alreadyNetted: 100, clientPayout: 500, vatRate: 0.21 })).toBe(0);
    expect(computeActivationCost({ activationTotal: 100, alreadyNetted: 120, clientPayout: 500, vatRate: 0.21 })).toBe(0);
  });

  it("idempotent: dezelfde input geeft exact dezelfde uitkomst", () => {
    const args = { activationTotal: 137.5, alreadyNetted: 42.3, clientPayout: 88.88, vatRate: 0.21 } as const;
    expect(computeActivationCost(args)).toBe(computeActivationCost(args));
  });

  it("9. invariant: netto over te boeken nooit meer dan een cent negatief, over een brede sweep", () => {
    for (const vatRate of [0, 0.21]) {
      for (let total = 0; total <= 300; total += 12.5) {
        for (let payout = -20; payout <= 300; payout += 6.65) { // 6.65 raakt bewust de centronding-hoek
          const cost = computeActivationCost({ activationTotal: total, alreadyNetted: 0, clientPayout: payout, vatRate });
          // aftrek nooit groter dan de resterende activatie, en niet negatief
          expect(cost).toBeGreaterThanOrEqual(0);
          expect(cost).toBeLessThanOrEqual(total + 1e-9);
          // excl-net (ClientFinancial-regel) altijd ≥ 0
          if (payout > 0) expect(payout - cost).toBeGreaterThanOrEqual(-1e-9);
          // incl-net (factuur "netto over te boeken") ≥ 0 op hooguit één cent centronding na
          // (die de PDF/detail op 0 klemmen -> nooit een negatief bedrag getoond).
          expect(netToBook(Math.max(0, payout), vatRate, cost)).toBeGreaterThan(-0.0101);
        }
      }
    }
  });
});
