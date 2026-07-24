// ============================================================================
// Gedeeld financieel model voor de Financieel-module (CFO-cockpit + Afrekeningen).
//
// Eén bron van waarheid die de server-side reconciliatie (RPC monthly_financial_
// overview) combineert met de ruwe afrekening-rijen (useAllSettlements), zodat het
// Maandoverzicht en de Afrekeningen-tab gegarandeerd dezelfde bedragen tonen.
//
// De onderliggende afreken-/reconciliatie-wiskunde blijft ongewijzigd; dit bestand
// LEEST en aggregeert alleen. Alle geldstromen krijgen een expliciete BTW-basis:
//   - eFlux-vergoeding/-kosten en de "over te boeken" bedragen: INCL. BTW.
//   - sessie-omzet, uit te keren, fee, marge: EXCL. BTW.
// ============================================================================
import type { MonthlyFinancialRow } from "@/hooks/useAdminData";
import type { AdminSettlement } from "@/types/db";
import { settlementVat, settlementNetToTransfer, settlementNetExcl } from "@/services/calculations";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// eFlux self-billing op de CPO-vergoeding is altijd 21%; zelfde constante als de RPC.
const EFLUX_VAT = 1.21;

// ---------------------------------------------------------------------------
// Afrekening-helpers (verhuisd uit AdminFinancial zodat beide tabs ze delen).
// ---------------------------------------------------------------------------

// Bruto vergoeding (excl BTW). Blijft de bron voor de teken-routing:
// positief = uitbetalen aan klant, negatief = incasso/factuur naar klant.
export const customerCashflow = (s: AdminSettlement) => Number(s.client_payout || 0);

// Netto / BTW / incl van de afrekening. GEEN activatie-aftrek meer: het handboek verbiedt
// saldering op één document en activatiekosten worden sinds 22-07-2026 apart gefactureerd via
// WeFact. De afrekening betaalt dus het VOLLE stroombedrag — gelijk aan wat de self-billing
// inkoopfactuur uitbetaalt. settlements.activation_cost blijft alleen als historie bestaan.
export function vatInfo(s: AdminSettlement): { vatRate: number; net: number; vatAmount: number; inclVat: number } {
  const payout = Number(s.client_payout || 0);
  const rate = Number(s.vat_rate ?? 0.21);
  if (payout < 0) return settlementVat({ clientPayout: payout, vatRate: rate });
  const net = settlementNetExcl({ clientPayout: payout, activationCost: 0, vatRate: rate });
  const inclVat = settlementNetToTransfer({ clientPayout: payout, activationCost: 0, vatRate: rate });
  return { vatRate: rate, net, vatAmount: round2(inclVat - net), inclVat };
}

// incl. BTW, netto over te boeken (getekend: positief = uitbetalen, negatief = incasso).
export const inclAmount = (s: AdminSettlement) => vatInfo(s).inclVat;
export const inclAbs = (s: AdminSettlement) => Math.abs(inclAmount(s));

// ---------------------------------------------------------------------------
// Per-maand financieel model
// ---------------------------------------------------------------------------

export interface MonthFinancials {
  year: number;
  month: number;

  // eFlux-kasstroom (incl. BTW)
  creditIncl: number;          // gesynced cpo-credit — wat eFlux ons betaalde
  usageIncl: number;           // cpo-usage — platformkosten die eFlux ons rekent
  usageExcl: number;           // usageIncl / 1,21

  // Ontvangen (met "verwacht" voor de lopende maand die nog geen creditfactuur heeft)
  ontvangenActueel: number;    // = creditIncl (daadwerkelijk binnen)
  ontvangenVerwacht: number;   // sessie-omzet incl. als de creditfactuur nog niet gesynced is
  factuurOntbreekt: boolean;   // sessies aanwezig maar geen creditfactuur (lopend/geen_factuur)

  // Reconciliatie eFlux ↔ sessie-omzet
  reconStatus: MonthlyFinancialRow["recon_status"];
  reconDiffIncl: number;

  // Bestemming van de vergoeding (excl. BTW) — sluit: assigned + unassigned = sessie-omzet excl.
  sessionsReimbExcl: number;
  sessionsReimbIncl: number;
  assignedExcl: number;        // gross_total van afrekeningen (= payout + fee)
  unassignedExcl: number;      // vergoeding van ongekoppelde/eigenaarloze sessies ⚠ actiepunt
  payoutTotal: number;         // Σ client_payout (bruto, excl BTW) — "uit te keren"
  feeTotal: number;            // Σ echarging_revenue — "onze fee"
  activationTotal: number;     // Σ verrekende activatie (informatief)

  // Resultaat (excl. BTW) — ongekoppeld telt bewust NIET mee als marge
  margeExcl: number;           // feeTotal − usageExcl

  // Uitbetaalstatus van de toegewezen afrekeningen (incl. BTW, netto over te boeken)
  uitbetaaldIncl: number;      // paid | invoice_paid — geld is de deur uit
  teBetalenBankIncl: number;   // approved & payout ≥ 0 — klaar voor bankbetaling
  factuurTeSturenIncl: number; // approved & payout < 0 — incassofactuur te sturen
  factuurOpenIncl: number;     // invoice_sent — factuur verstuurd, nog niet voldaan
  nogNietGoedgekeurdIncl: number; // live | calculated — nog niet in de betaalflow
  openstaandIncl: number;      // teBetalenBank + factuurTeSturen + factuurOpen (goedgekeurd, nog niet afgerond)

  // Tellingen
  settlementsTotal: number;
  settlementsFinal: number;
}

type Buckets = {
  uitbetaald: number; teBetalenBank: number; factuurTeSturen: number;
  factuurOpen: number; nogNietGoedgekeurd: number;
};

function emptyBuckets(): Buckets {
  return { uitbetaald: 0, teBetalenBank: 0, factuurTeSturen: 0, factuurOpen: 0, nogNietGoedgekeurd: 0 };
}

// Verdeel één afrekening over de juiste uitbetaal-bucket (mirror van de pipeline in
// de Afrekeningen-tab). charged_back = legacy/terminaal → telt nergens in mee.
function addToBucket(b: Buckets, s: AdminSettlement) {
  const incl = inclAbs(s);
  const payout = customerCashflow(s);
  switch (s.status) {
    case "paid":
    case "invoice_paid":
      b.uitbetaald += incl; break;
    case "approved":
      if (payout >= 0) b.teBetalenBank += incl;
      else b.factuurTeSturen += incl;
      break;
    case "invoice_sent":
      b.factuurOpen += incl; break;
    case "live":
    case "calculated":
      b.nogNietGoedgekeurd += incl; break;
    default: // charged_back / overdue (legacy) — geen bucket
      break;
  }
}

// Combineer de RPC-reconciliatie met de afrekening-rijen tot één model per maand.
export function buildMonthlyFinancials(
  rpcRows: MonthlyFinancialRow[] | undefined,
  settlements: AdminSettlement[] | undefined,
): MonthFinancials[] {
  // Uitbetaal-buckets per maand uit de ruwe afrekeningen.
  const bucketByKey = new Map<string, Buckets>();
  for (const s of settlements ?? []) {
    if (!s.year || !s.month) continue;
    const key = `${s.year}-${s.month}`;
    let b = bucketByKey.get(key);
    if (!b) { b = emptyBuckets(); bucketByKey.set(key, b); }
    addToBucket(b, s);
  }

  return (rpcRows ?? []).map((r) => {
    const b = bucketByKey.get(`${r.year}-${r.month}`) ?? emptyBuckets();
    const creditIncl = Number(r.eflux_credit_incl || 0);
    const usageIncl = Number(r.eflux_usage_incl || 0);
    const usageExcl = round2(usageIncl / EFLUX_VAT);
    const sessionsReimbExcl = Number(r.sessions_reimb_excl || 0);
    const sessionsReimbIncl = Number(r.sessions_reimb_incl || 0);
    const feeTotal = Number(r.fee_total || 0);
    // Creditfactuur nog niet binnen terwijl er wél sessie-omzet is → "verwacht" tonen
    // i.p.v. een misleidende €0/negatieve netto.
    const factuurOntbreekt =
      (r.recon_status === "lopend" || r.recon_status === "geen_factuur") && sessionsReimbIncl > 0;

    const openstaandIncl = round2(b.teBetalenBank + b.factuurTeSturen + b.factuurOpen);

    return {
      year: r.year,
      month: r.month,
      creditIncl,
      usageIncl,
      usageExcl,
      ontvangenActueel: creditIncl,
      ontvangenVerwacht: factuurOntbreekt ? sessionsReimbIncl : 0,
      factuurOntbreekt,
      reconStatus: r.recon_status,
      reconDiffIncl: Number(r.recon_diff_incl || 0),
      sessionsReimbExcl,
      sessionsReimbIncl,
      assignedExcl: Number(r.gross_total || 0),
      unassignedExcl: Number(r.unassigned_reimb || 0),
      payoutTotal: Number(r.payout_total || 0),
      feeTotal,
      activationTotal: Number(r.activation_total || 0),
      margeExcl: round2(feeTotal - usageExcl),
      uitbetaaldIncl: round2(b.uitbetaald),
      teBetalenBankIncl: round2(b.teBetalenBank),
      factuurTeSturenIncl: round2(b.factuurTeSturen),
      factuurOpenIncl: round2(b.factuurOpen),
      nogNietGoedgekeurdIncl: round2(b.nogNietGoedgekeurd),
      openstaandIncl,
      settlementsTotal: Number(r.settlements_total || 0),
      settlementsFinal: Number(r.settlements_final || 0),
    };
  });
}

export interface FinancialsTotals {
  creditIncl: number; usageIncl: number; usageExcl: number;
  ontvangenActueel: number; ontvangenVerwacht: number;
  sessionsReimbExcl: number; assignedExcl: number; unassignedExcl: number;
  payoutTotal: number; feeTotal: number; activationTotal: number; margeExcl: number;
  uitbetaaldIncl: number; openstaandIncl: number;
  teBetalenBankIncl: number; factuurTeSturenIncl: number; factuurOpenIncl: number;
  nogNietGoedgekeurdIncl: number;
}

// Jaartotalen voor de KPI-strip.
export function sumFinancials(months: MonthFinancials[]): FinancialsTotals {
  const t: FinancialsTotals = {
    creditIncl: 0, usageIncl: 0, usageExcl: 0, ontvangenActueel: 0, ontvangenVerwacht: 0,
    sessionsReimbExcl: 0, assignedExcl: 0, unassignedExcl: 0, payoutTotal: 0, feeTotal: 0,
    activationTotal: 0, margeExcl: 0, uitbetaaldIncl: 0, openstaandIncl: 0,
    teBetalenBankIncl: 0, factuurTeSturenIncl: 0, factuurOpenIncl: 0, nogNietGoedgekeurdIncl: 0,
  };
  for (const m of months) {
    t.creditIncl += m.creditIncl;
    t.usageIncl += m.usageIncl;
    t.usageExcl += m.usageExcl;
    t.ontvangenActueel += m.ontvangenActueel;
    t.ontvangenVerwacht += m.ontvangenVerwacht;
    t.sessionsReimbExcl += m.sessionsReimbExcl;
    t.assignedExcl += m.assignedExcl;
    t.unassignedExcl += m.unassignedExcl;
    t.payoutTotal += m.payoutTotal;
    t.feeTotal += m.feeTotal;
    t.activationTotal += m.activationTotal;
    t.margeExcl += m.margeExcl;
    t.uitbetaaldIncl += m.uitbetaaldIncl;
    t.openstaandIncl += m.openstaandIncl;
    t.teBetalenBankIncl += m.teBetalenBankIncl;
    t.factuurTeSturenIncl += m.factuurTeSturenIncl;
    t.factuurOpenIncl += m.factuurOpenIncl;
    t.nogNietGoedgekeurdIncl += m.nogNietGoedgekeurdIncl;
  }
  // Sommen op de cent afronden (voorkomt drijvende-komma-ruis in de weergave).
  (Object.keys(t) as (keyof FinancialsTotals)[]).forEach((k) => { t[k] = round2(t[k]); });
  return t;
}
