import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  generateSelfBillingInvoicePdf,
  InvoiceValidationError,
  type SelfBillingSettlement,
  type SelfBillingClient,
  type SelfBillingOrg,
  type SelfBillingPaymentDetails,
  type InvoiceSessionLine,
} from "@/services/invoicePdf";

// Voorbeelddocumenten: rendert met vaste dummy-data elk van de drie afrekeningsdocumenten
// (self-billing factuur, betaalspecificatie-KOR, betaalspecificatie-particulier) via dezelfde
// generator die de echte afrekeningen maakt. Zo is 1-op-1 te toetsen tegen het handboek zonder
// een echte klant/afrekening nodig te hebben. Geen persoons- of bedrijfsdata: alles fictief.

// Eigen (afnemer-)gegevens uit het handboek/de offerte-footer.
const SAMPLE_ORG: SelfBillingOrg = {
  name: "E-Charging B.V.",
  address_street: "Dwarsweg 8",
  address_postal: "5301 KT",
  address_city: "Zaltbommel",
  country: "Nederland",
  kvk: "30241843",
  btw_number: "NL821392402B01",
  iban: "NL33RABO0143928449",
  email: "info@e-charging.nl",
};

// Uitbetaalrekening van de fictieve leverancier (placeholder-IBAN).
const SAMPLE_PAYMENT: SelfBillingPaymentDetails = {
  payout_account_holder_name: "Voorbeeld",
  payout_iban: "NL91ABNA0417164300",
  payout_bic: "ABNANL2A",
};

// 8 fictieve sessies van € 6,00 = € 48,00 (matcht de client_payout hieronder).
const SAMPLE_SESSIONS: InvoiceSessionLine[] = Array.from({ length: 8 }, (_, i) => ({
  started_at: `2026-06-0${i + 1}T10:15:00`,
  charge_point_name: `Laadpunt ${String.fromCharCode(65 + (i % 3))}`,
  location_name: "Parkeerterrein Voorbeeld",
  duration_minutes: 60 + i * 5,
  kwh_delivered: 15,
  vergoeding: 6,
}));

type SampleKind = "vat_liable" | "kor" | "private";

function sampleData(kind: SampleKind): { settlement: SelfBillingSettlement; client: SelfBillingClient } {
  const base = {
    year: 2026,
    month: 6,
    period_start: "2026-06-01",
    period_end: "2026-06-30",
    total_kwh: 120,
    total_sessions: 8,
    gross_revenue: 60,
    echarging_fee_per_kwh: 0.1,
    echarging_revenue: 12,
    client_payout: 48,
  };
  if (kind === "vat_liable") {
    return {
      settlement: { ...base, vat_rate: 0.21, vat_status: "vat_liable", invoice_number: "S-2026-06-901" },
      client: {
        company_name: "Voorbeeldbedrijf B.V.",
        contact_name: "A. Voorbeeld",
        client_number: 901,
        kvk: "87654321",
        btw_number: "NL001234567B01",
        billing_address_street: "Voorbeeldstraat 1",
        billing_address_postal: "5301 AA",
        billing_address_city: "Zaltbommel",
        country: "Nederland",
        vat_status: "vat_liable",
      },
    };
  }
  if (kind === "kor") {
    return {
      settlement: { ...base, vat_rate: 0, vat_status: "kor", invoice_number: "B-2026-06-902" },
      client: {
        company_name: "Voorbeeld VOF",
        contact_name: "B. Voorbeeld",
        client_number: 902,
        kvk: "76543210",
        billing_address_street: "Voorbeeldstraat 2",
        billing_address_postal: "5301 BB",
        billing_address_city: "Zaltbommel",
        country: "Nederland",
        vat_status: "kor",
      },
    };
  }
  return {
    settlement: { ...base, vat_rate: 0, vat_status: "private", invoice_number: "B-2026-06-903" },
    client: {
      company_name: "J. Voorbeeld",
      contact_name: "J. Voorbeeld",
      client_number: 903,
      billing_address_street: "Voorbeeldstraat 3",
      billing_address_postal: "5301 CC",
      billing_address_city: "Zaltbommel",
      country: "Nederland",
      vat_status: "private",
    },
  };
}

const KINDS: { kind: SampleKind; title: string; sub: string }[] = [
  { kind: "vat_liable", title: "Self-billing factuur", sub: "BTW-ondernemer · 21% · nummer S-…" },
  { kind: "kor", title: "Betaalspecificatie (KOR)", sub: "Kleineondernemersregeling · 0% · nummer B-…" },
  { kind: "private", title: "Betaalspecificatie (particulier)", sub: "Geen ondernemer · 0% · nummer B-…" },
];

export function SampleDocumentsCard() {
  const [busy, setBusy] = useState<SampleKind | null>(null);

  const generate = async (kind: SampleKind) => {
    setBusy(kind);
    try {
      const { settlement, client } = sampleData(kind);
      await generateSelfBillingInvoicePdf(settlement, client, SAMPLE_ORG, SAMPLE_PAYMENT, SAMPLE_SESSIONS);
    } catch (err) {
      if (err instanceof InvoiceValidationError) {
        toast.error(`Voorbeeld geblokkeerd — ontbrekend: ${err.issues.map((i) => i.label).join(", ")}`);
      } else {
        toast.error((err as Error).message || "Voorbeeld genereren mislukt");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Voorbeelddocumenten</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Genereer met fictieve gegevens een voorbeeld van elk afrekeningsdocument, om te toetsen tegen het handboek.
            Er wordt geen echte klantdata gebruikt.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {KINDS.map(({ kind, title, sub }) => (
            <div key={kind} className="rounded-lg border border-border p-4 flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </div>
              <Button size="sm" variant="outline" className="mt-auto" onClick={() => generate(kind)} disabled={busy !== null}>
                {busy === kind ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1.5" />}
                Voorbeeld (PDF)
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
