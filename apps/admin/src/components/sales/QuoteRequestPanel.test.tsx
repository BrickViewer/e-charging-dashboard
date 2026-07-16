import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { QuoteRequest } from "@/hooks/useQuoteRequest";

// De hook praat met Supabase; hier prikken we er een vaste aanvraag in zodat we
// alleen de weergave testen (labels, overgeslagen uploads, triage-chip).
const mockQuery = vi.fn();
vi.mock("@/hooks/useQuoteRequest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useQuoteRequest")>();
  return { ...actual, useQuoteRequest: () => mockQuery(), intakeFileUrl: vi.fn() };
});

const { QuoteRequestPanel } = await import("./QuoteRequestPanel");

const bestand = (path: string, label: string, kind: string) => ({
  path,
  name: `${label}.jpg`,
  size: 2048,
  content_type: "image/jpeg",
  label,
  kind,
});

const particulier = {
  id: "1",
  created_at: "2026-07-09T12:00:00Z",
  privacy_accepted_at: "2026-07-09T12:00:00Z",
  flow: "particulier",
  triage: "opname_op_locatie",
  updates_opt_in: true,
  files: [bestand("qi/a/b.jpg", "Meterkast", "meterkast")],
  payload: {
    gegevens: {
      naam: "Jan de Vries",
      straat: "Dwarsweg",
      huisnummer: "8",
      postcode: "5301 KT",
      plaats: "Zaltbommel",
      email: "jan@voorbeeld.nl",
      telefoon: "0612345678",
    },
    meterkast: {
      fotos: [{ path: "qi/a/b.jpg", name: "Meterkast.jpg", size: 2048, content_type: "image/jpeg" }],
      fotos_overgeslagen: false,
      kruipruimte: "weet_ik_niet",
      aansluiting: "3_fase",
    },
    aantal_laadpalen: 2,
    laadpalen: [
      {
        foto_plek: [],
        foto_plek_overgeslagen: true,
        route_media: [],
        route_overgeslagen: true,
        vaste_kabel: "ja",
        kabel_lengte: "7_5",
        kleur_front: "zwart",
      },
      {
        foto_plek: [],
        foto_plek_overgeslagen: false,
        route_media: [],
        route_overgeslagen: false,
        vaste_kabel: "nee",
        kabel_lengte: "",
        kleur_front: "wit",
      },
    ],
    verrekenen: { zakelijk_verrekenen: "ja", dynamisch_contract: "weet_ik_niet", laadtarief: "adviseer_mij" },
    afronden: { plaatsing: "specifieke_maand", plaatsing_maand: "2026-09", opmerkingen: "Let op de heg", updates_opt_in: true },
  },
} as unknown as QuoteRequest;

// Oude vorm (t/m juli 2026): één adres-string en een laadtype; moet leesbaar blijven.
const zakelijkOud = {
  id: "2",
  created_at: "2026-07-09T12:00:00Z",
  privacy_accepted_at: "2026-07-09T12:00:00Z",
  flow: "zakelijk",
  triage: "project",
  updates_opt_in: false,
  files: [],
  payload: {
    organisatie: {
      bedrijfsnaam: "Voorbeeld BV",
      contactpersoon: "Piet Jansen",
      functie: "Facilitair manager",
      email: "piet@voorbeeld.nl",
      telefoon: "0612345678",
      type_organisatie: "anders",
      type_organisatie_anders: "Woningcorporatie",
      kvk: "30241843",
    },
    locatie: {
      adres: "Dwarsweg 8",
      type_locatie: "parkeergarage",
      type_locatie_anders: "",
      eigendom: "huurder",
      bestaand_of_nieuwbouw: "nieuwbouw_renovatie",
      wie_gaat_laden: ["bewoners", "bezoekers"],
    },
    schaal: { aantal_laadpunten: "12", uitbreiding: "ja", uitbreiding_aantal: "8", laadtype: "ac" },
    techniek: { foto_meterkast: [], situatie_media: [], aansluitwaarde: "", aansluitwaarde_onbekend: true },
    afronden: { opmerkingen: "", updates_opt_in: false },
  },
} as unknown as QuoteRequest;

describe("QuoteRequestPanel", () => {
  it("toont niets als er geen aanvraag bij de lead hoort", () => {
    mockQuery.mockReturnValue({ isLoading: false, data: null });
    const { container } = render(<QuoteRequestPanel leadId="lead-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("toont de particuliere aanvraag met vertaalde labels", () => {
    mockQuery.mockReturnValue({ isLoading: false, data: particulier });
    render(<QuoteRequestPanel leadId="lead-1" />);

    expect(screen.getByText("Particulier")).toBeInTheDocument();
    expect(screen.getByText("Opname op locatie")).toBeInTheDocument();
    expect(screen.getByText("Nieuwsbrief-opt-in")).toBeInTheDocument();

    expect(screen.getByText("Dwarsweg 8, 5301 KT Zaltbommel")).toBeInTheDocument();
    expect(screen.getByText("3-fase")).toBeInTheDocument();
    // "Weet ik niet" staat er twee keer: kruipruimte en dynamisch energiecontract.
    expect(screen.getAllByText("Weet ik niet").length).toBe(2);

    // Beide laadpalen, met vertaalde kabel- en kleurkeuzes.
    expect(screen.getByText("Laadpaal 1 van 2")).toBeInTheDocument();
    expect(screen.getByText("Laadpaal 2 van 2")).toBeInTheDocument();
    expect(screen.getByText("Ja, 7,5 meter")).toBeInTheDocument();
    expect(screen.getByText("Zwart")).toBeInTheDocument();
    expect(screen.getByText("Wit")).toBeInTheDocument();

    // Maand als leesbare tekst, niet als 2026-09.
    expect(screen.getByText("september 2026")).toBeInTheDocument();
    expect(screen.getByText("Adviseer mij")).toBeInTheDocument();
    expect(screen.getByText("Let op de heg")).toBeInTheDocument();

    // Een geüploade foto krijgt een bekijk-knop; overgeslagen uploads worden gemeld.
    expect(screen.getByRole("button", { name: /Foto bekijken/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Overgeslagen door de aanvrager/).length).toBe(2);
  });

  it("toont de zakelijke aanvraag, inclusief anders-invulvelden en onbekende capaciteit", () => {
    mockQuery.mockReturnValue({ isLoading: false, data: zakelijkOud });
    render(<QuoteRequestPanel leadId="lead-2" />);

    expect(screen.getByText("Zakelijk")).toBeInTheDocument();
    expect(screen.getByText("Projecttraject")).toBeInTheDocument();
    expect(screen.getByText("Voorbeeld BV")).toBeInTheDocument();
    expect(screen.getByText("Piet Jansen (Facilitair manager)")).toBeInTheDocument();
    expect(screen.getByText("Anders: Woningcorporatie")).toBeInTheDocument();
    expect(screen.getByText("Parkeergarage")).toBeInTheDocument();
    expect(screen.getByText("Huurder")).toBeInTheDocument();
    expect(screen.getByText("Nieuwbouw of renovatie")).toBeInTheDocument();
    expect(screen.getByText("Bewoners, Bezoekers")).toBeInTheDocument();
    expect(screen.getByText("Ja, ongeveer 8 extra")).toBeInTheDocument();
    expect(screen.getByText("AC-laden")).toBeInTheDocument();
    expect(screen.getByText("Onbekend")).toBeInTheDocument();
    expect(screen.queryByText("Nieuwsbrief-opt-in")).not.toBeInTheDocument();
  });

  it("toont een nieuwe zakelijke aanvraag met losse adresvelden en zonder laadtype-rij", () => {
    // Nieuwe vorm (vanaf juli 2026): straat/huisnummer/postcode/plaats, geen laadtype.
    const zakelijkNieuw = {
      ...zakelijkOud,
      id: "3",
      payload: {
        ...(zakelijkOud as unknown as { payload: Record<string, unknown> }).payload,
        locatie: {
          straat: "Dwarsweg",
          huisnummer: "8",
          toevoeging: "A",
          postcode: "5301 KT",
          plaats: "Zaltbommel",
          type_locatie: "parkeergarage",
          type_locatie_anders: "",
          eigendom: "huurder",
          bestaand_of_nieuwbouw: "nieuwbouw_renovatie",
          wie_gaat_laden: ["bewoners"],
        },
        schaal: { aantal_laadpunten: "12", uitbreiding: "nee", uitbreiding_aantal: "" },
      },
    } as unknown as QuoteRequest;

    mockQuery.mockReturnValue({ isLoading: false, data: zakelijkNieuw });
    render(<QuoteRequestPanel leadId="lead-3" />);

    expect(screen.getByText("Dwarsweg 8 A, 5301 KT Zaltbommel")).toBeInTheDocument();
    expect(screen.queryByText("Gewenst laadtype")).not.toBeInTheDocument();
  });
});
