import { describe, expect, it } from "vitest";
import { materialsGate, materialsProgressLabel, materialsTrafficLight } from "./workPreparation";
import type { MaterialStatus } from "./installationHandoff";

const mats = (...statuses: MaterialStatus[]) => statuses.map((status) => ({ status }));

describe("materialsGate", () => {
  it("laat een lege lijst door — zonder calculatie valt er niets te bestellen", () => {
    expect(materialsGate([])).toEqual({ ok: true, open: 0, total: 0 });
  });

  it("blokkeert zodra één regel nog te_bestellen is", () => {
    expect(materialsGate(mats("besteld", "binnen", "te_bestellen"))).toEqual({ ok: false, open: 1, total: 3 });
  });

  it("laat een mix van niet_nodig/besteld/binnen door", () => {
    expect(materialsGate(mats("niet_nodig", "besteld", "binnen"))).toEqual({ ok: true, open: 0, total: 3 });
  });
});

describe("materialsTrafficLight", () => {
  it("is rood zolang er iets te bestellen is", () => {
    expect(materialsTrafficLight(mats("binnen", "besteld", "te_bestellen", "te_bestellen"))).toEqual({
      tone: "red",
      label: "2 te bestellen",
    });
  });

  it("is oranje als alles besteld is maar nog niet alles binnen", () => {
    expect(materialsTrafficLight(mats("besteld", "besteld"))).toEqual({
      tone: "amber",
      label: "Besteld · wacht op levering",
    });
    expect(materialsTrafficLight(mats("besteld", "binnen", "niet_nodig"))).toEqual({
      tone: "amber",
      label: "Besteld · 1/2 binnen",
    });
  });

  it("is groen als alle relevante materialen binnen zijn", () => {
    expect(materialsTrafficLight(mats("binnen", "binnen", "niet_nodig"))).toEqual({
      tone: "green",
      label: "Alle materialen binnen",
    });
  });

  it("is grijs zonder (relevante) materialen", () => {
    expect(materialsTrafficLight([])).toEqual({ tone: "muted", label: "Geen materialen" });
    expect(materialsTrafficLight(mats("niet_nodig"))).toEqual({ tone: "muted", label: "Geen materialen" });
  });
});

describe("materialsProgressLabel", () => {
  it("telt besteld én binnen als besteld, over de relevante regels", () => {
    expect(materialsProgressLabel(mats("besteld", "binnen", "te_bestellen", "niet_nodig"))).toBe("2/3 besteld · 1 binnen");
  });

  it("laat het binnen-deel weg zolang er niets binnen is", () => {
    expect(materialsProgressLabel(mats("besteld", "te_bestellen"))).toBe("1/2 besteld");
  });

  it("benoemt lege en volledig niet-nodige lijsten expliciet", () => {
    expect(materialsProgressLabel([])).toBe("Geen materialen");
    expect(materialsProgressLabel(mats("niet_nodig"))).toBe("Geen materialen nodig");
  });
});
