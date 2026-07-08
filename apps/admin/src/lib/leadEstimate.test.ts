import { describe, it, expect } from "vitest";
import { estimateYearlyManagementRevenue, leadMgmtYearEstimate, leadPipelineValue, leadQuoteValue } from "./leadEstimate";
import type { LeadWithTasks, LeadQuoteMini } from "@/hooks/useLeads";

const mkQuote = (over: Partial<LeadQuoteMini>): LeadQuoteMini => ({
  id: "q1", status: "concept", sent_at: null, with_installation: true, with_management: true,
  num_charge_points: null, total_installation_cost: 0, total_hardware_cost: 0,
  monthly_projection: null, created_at: "2026-01-01T00:00:00Z", ...over,
});
const mkLead = (over: Partial<LeadWithTasks>): LeadWithTasks =>
  ({ estimated_value: null, estimated_charge_points: null, quotes: [], lead_tasks: [], ...over } as unknown as LeadWithTasks);

describe("estimateYearlyManagementRevenue", () => {
  it("vermenigvuldigt palen met de gemiddelde jaaromzet per paal", () => {
    expect(estimateYearlyManagementRevenue(10, 178.51)).toBeCloseTo(1785.1, 6);
    expect(estimateYearlyManagementRevenue(1, 200)).toBe(200);
  });

  it("geeft null wanneer palen of gemiddelde ontbreekt of niet-positief is", () => {
    expect(estimateYearlyManagementRevenue(null, 180)).toBeNull();
    expect(estimateYearlyManagementRevenue(5, null)).toBeNull();
    expect(estimateYearlyManagementRevenue(0, 180)).toBeNull();
    expect(estimateYearlyManagementRevenue(5, 0)).toBeNull();
    expect(estimateYearlyManagementRevenue(undefined, undefined)).toBeNull();
    expect(estimateYearlyManagementRevenue(-2, 180)).toBeNull();
  });
});

describe("leadMgmtYearEstimate", () => {
  it("gebruikt de offerte-palen als terugval (lead heeft geen eigen schatting)", () => {
    const lead = mkLead({ quotes: [mkQuote({ num_charge_points: 10, with_management: true })] });
    expect(leadMgmtYearEstimate(lead, 180)).toBe(1800);
  });

  it("verkiest de lead-palen boven de offerte (offerte is slechts terugval)", () => {
    const lead = mkLead({ estimated_charge_points: 4, quotes: [mkQuote({ num_charge_points: 1, with_management: true })] });
    expect(leadMgmtYearEstimate(lead, 180)).toBe(720); // 4×180, niet 1×180
  });

  it("valt terug op estimated_charge_points zonder offerte", () => {
    const lead = mkLead({ estimated_charge_points: 5 });
    expect(leadMgmtYearEstimate(lead, 180)).toBe(900);
  });

  it("geeft null wanneer beheer niet in scope zit (alleen_installatie)", () => {
    const lead = mkLead({ quotes: [mkQuote({ num_charge_points: 10, with_management: false })] });
    expect(leadMgmtYearEstimate(lead, 180)).toBeNull();
  });

  it("geeft null zonder gemiddelde", () => {
    const lead = mkLead({ quotes: [mkQuote({ num_charge_points: 10 })] });
    expect(leadMgmtYearEstimate(lead, null)).toBeNull();
  });
});

describe("leadQuoteValue", () => {
  it("somt hardware + installatie van de primaire offerte", () => {
    const lead = mkLead({ quotes: [mkQuote({ total_hardware_cost: 700, total_installation_cost: 300 })] });
    expect(leadQuoteValue(lead)).toBe(1000);
  });

  it("is 0 zonder offerte", () => {
    expect(leadQuoteValue(mkLead({}))).toBe(0);
  });

  it("negeert het eenmalige bedrag bij alleen-beheer (activatie telt niet als omzet)", () => {
    const lead = mkLead({ quotes: [mkQuote({ total_installation_cost: 500, with_installation: false, with_management: true })] });
    expect(leadQuoteValue(lead)).toBe(0);
  });
});

describe("leadPipelineValue", () => {
  it("telt de offerte waarde op bij de jaarschatting", () => {
    const lead = mkLead({ quotes: [mkQuote({ total_hardware_cost: 700, total_installation_cost: 300, num_charge_points: 10, with_management: true })] });
    expect(leadPipelineValue(lead, 180)).toBe(2800); // 1000 + 10*180
  });

  it("telt alleen de offerte waarde wanneer er geen beheer-schatting is", () => {
    const lead = mkLead({ quotes: [mkQuote({ total_hardware_cost: 700, total_installation_cost: 300, with_management: false, num_charge_points: 10 })] });
    expect(leadPipelineValue(lead, 180)).toBe(1000);
  });

  it("is 0 wanneer er niets bekend is", () => {
    expect(leadPipelineValue(mkLead({}), 180)).toBe(0);
  });

  it("bij alleen-beheer telt alleen de jaarschatting, niet de eenmalige activatie", () => {
    const lead = mkLead({ quotes: [mkQuote({ total_installation_cost: 500, with_installation: false, with_management: true, num_charge_points: 10 })] });
    expect(leadPipelineValue(lead, 180)).toBe(1800); // 0 activatie + 10×180
  });
});
