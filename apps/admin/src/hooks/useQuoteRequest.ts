import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { QuoteFlow, QuoteTriage } from "@/lib/quoteRequest";

// Offerteaanvragen die vanaf www.e-charging.nl/offerte binnenkomen. De edge-functie
// quote-intake schrijft ze weg; hier lezen we ze alleen (RLS: admin/manager/sales).

type Row = Database["public"]["Tables"]["quote_requests"]["Row"];

export type QuoteRequestFile = {
  path: string;
  name: string;
  size: number;
  content_type: string;
  label: string;
  kind: "meterkast" | "plek" | "route" | "situatie";
};

export type QuoteRequest = Omit<Row, "flow" | "triage" | "files" | "payload"> & {
  flow: QuoteFlow;
  triage: QuoteTriage;
  files: QuoteRequestFile[];
  payload: ParticulierPayload | ZakelijkPayload;
};

export type UploadRef = { path: string; name: string; size: number; content_type: string };

export type LaadpaalPayload = {
  foto_plek: UploadRef[];
  foto_plek_overgeslagen: boolean;
  route_media: UploadRef[];
  route_overgeslagen: boolean;
  vaste_kabel: string;
  kabel_lengte: string;
  kleur_front: string;
};

export type ParticulierPayload = {
  gegevens: { naam: string; straat: string; huisnummer: string; postcode: string; plaats: string; email: string; telefoon: string };
  meterkast: { fotos: UploadRef[]; fotos_overgeslagen: boolean; kruipruimte: string; aansluiting: string };
  aantal_laadpalen: number;
  laadpalen: LaadpaalPayload[];
  verrekenen: { zakelijk_verrekenen: string; dynamisch_contract: string; laadtarief: string };
  afronden: { plaatsing: string; plaatsing_maand: string; opmerkingen: string; updates_opt_in: boolean };
};

export type ZakelijkPayload = {
  organisatie: {
    bedrijfsnaam: string; contactpersoon: string; functie: string; email: string; telefoon: string;
    type_organisatie: string; type_organisatie_anders: string; kvk: string;
  };
  locatie: {
    // Nieuwe aanvragen (vanaf juli 2026): losse adresvelden. Oude aanvragen:
    // één adres-string. Beide vormen blijven permanent voorkomen in de payload.
    adres?: string; straat?: string; huisnummer?: string; postcode?: string; plaats?: string;
    type_locatie: string; type_locatie_anders: string;
    eigendom: string; bestaand_of_nieuwbouw: string; wie_gaat_laden: string[];
  };
  // laadtype bestaat alleen nog op oude aanvragen (vraag is van de website verwijderd).
  schaal: { aantal_laadpunten: string; uitbreiding: string; uitbreiding_aantal: string; laadtype?: string };
  techniek: { foto_meterkast: UploadRef[]; situatie_media: UploadRef[]; aansluitwaarde: string; aansluitwaarde_onbekend: boolean };
  afronden: { opmerkingen: string; updates_opt_in: boolean };
};

/** De aanvraag die bij deze lead hoort (of null als het geen websiteaanvraag is). */
export function useQuoteRequest(leadId: string | undefined) {
  return useQuery({
    queryKey: ["quote-request", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_requests")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as QuoteRequest) ?? null;
    },
  });
}

/**
 * Korte signed URL voor een bestand in de privé-bucket intake-uploads.
 * Zelfde patroon als feedbackScreenshotUrl: pas ophalen wanneer iemand kijkt,
 * en maar 5 minuten geldig — het zijn foto's van iemands woning en meterkast.
 */
export async function intakeFileUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("intake-uploads").createSignedUrl(path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
}
