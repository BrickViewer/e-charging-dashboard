import { describe, expect, it } from "vitest";
import { materialsGate, materialsProgressLabel } from "./workPreparation";
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
