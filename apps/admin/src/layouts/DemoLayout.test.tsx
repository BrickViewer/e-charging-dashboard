import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Elke Supabase-tabelaanroep wordt geteld; de scenario-demo moet 100% lokaal zijn.
// vi.hoisted: de mock-factory wordt boven de imports gehesen, dus de spy ook.
const { fromSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  })),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromSpy },
}));

// ClientLayout is bestaande chrome; stub naar een kale Outlet zodat de test puur
// de DemoLayout-bedrading test (param -> dataset -> context), niet het hele portaal.
vi.mock("@/layouts/ClientLayout", () => ({
  default: () => <Outlet />,
}));

import DemoLayout from "./DemoLayout";
import { useDemoDatasetOptional } from "@/contexts/demoDatasetContextValue";
import { encodeDemoConfig, decodeDemoConfig } from "@/lib/demoScenarios";

// Leest de dataset uit de context zoals een echte portaalpagina dat doet.
function Probe() {
  const ds = useDemoDatasetOptional();
  if (!ds) return <div data-testid="probe">geen-dataset</div>;
  const cps = ds.locations.flatMap((l) => l.charge_points ?? []).length;
  return <div data-testid="probe">{`${ds.id}|cps=${cps}|ere=${ds.client.calculate_ere_enabled}`}</div>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/demo" element={<DemoLayout />}>
            <Route index element={<Probe />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fromSpy.mockClear();
  sessionStorage.clear();
});

describe("DemoLayout", () => {
  it("scenario=10 levert de 10-palen dataset via context, zonder enige Supabase-aanroep", () => {
    renderAt("/demo?scenario=10");
    expect(screen.getByTestId("probe").textContent).toBe("scenario-10|cps=10|ere=true");
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("scenario=5 levert de 5-palen dataset", () => {
    renderAt("/demo?scenario=5");
    expect(screen.getByTestId("probe").textContent).toBe("scenario-5|cps=5|ere=true");
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("zonder scenario/leadId toont het keuzescherm met de drie scenario's", () => {
    renderAt("/demo");
    expect(screen.getByText("Kies een demo-scenario")).toBeInTheDocument();
    expect(screen.getByText("Van der Velde Retail B.V.")).toBeInTheDocument();
    expect(screen.getByText("Hofstede Vastgoed B.V.")).toBeInTheDocument();
    expect(screen.getByText("Rijnpoort Logistiek B.V.")).toBeInTheDocument();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("een scenario kiezen navigeert en rendert dat portaal (klik -> dataset)", () => {
    renderAt("/demo");
    // De 5-palen-kaart bevat de naam van klant 5; klik op de omhullende knop.
    const card = screen.getByText("Van der Velde Retail B.V.").closest("button")!;
    fireEvent.click(card);
    expect(sessionStorage.getItem("demo.scenario")).toBe("5");
    expect(screen.getByTestId("probe").textContent).toBe("scenario-5|cps=5|ere=true");
  });

  it("cfg-link (no-login): bouwt de dataset uit de gecodeerde config, zonder Supabase", () => {
    const cfg = encodeDemoConfig({
      leadId: "demo-x",
      config: {
        pricing_input: {
          hardware: { chargePoints: 7 },
          usage: { kwhPerChargePointMonth: 400, sessionsPerChargePointMonth: 20, effectiveChargingPowerKw: 11 },
          customer: { companyName: "Testklant BV", contactEmail: "info@testklant.nl" },
        },
        pricing_result: { customerNetPerChargePointMonth: 232.4 },
        ere: true,
      },
    });
    renderAt(`/demo?cfg=${cfg}`);
    expect(screen.getByTestId("probe").textContent).toBe("lead-demo-x|cps=7|ere=true");
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("cfg-link met ERE uit → geen ERE in de demo", () => {
    const cfg = encodeDemoConfig({
      leadId: "demo-y",
      config: {
        pricing_input: { hardware: { chargePoints: 3 }, usage: { kwhPerChargePointMonth: 300, sessionsPerChargePointMonth: 15 }, customer: { companyName: "Zonder ERE BV" } },
        pricing_result: { customerNetPerChargePointMonth: 174.3 },
        ere: false,
      },
    });
    renderAt(`/demo?cfg=${cfg}`);
    expect(screen.getByTestId("probe").textContent).toBe("lead-demo-y|cps=3|ere=false");
    expect(fromSpy).not.toHaveBeenCalled();
  });
});

describe("demo-config codec", () => {
  it("encode → decode is een round-trip", () => {
    const payload = {
      leadId: "abc-123",
      config: {
        pricing_input: { hardware: { chargePoints: 9 }, customer: { companyName: "Ünïcode & Co B.V." } },
        pricing_result: { customerNetPerChargePointMonth: 250.5 },
        ere: true,
      },
    };
    expect(decodeDemoConfig(encodeDemoConfig(payload))).toEqual(payload);
  });
});
