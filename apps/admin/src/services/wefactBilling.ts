// Pure aggregatielaag voor de facturatie-tab (WeFact). Framework-vrij en testbaar.

export interface WefactInvoiceRow {
  id: string;
  invoice_code: string | null;
  debtor_name: string | null;
  kind: string;
  status: string | null;
  amount_incl: number | null;
  amount_paid: number | null;
  amount_outstanding: number | null;
  invoice_date: string | null;
}

export interface WefactBillingSummary {
  invoicedIncl: number;   // totaal gefactureerd (incl. btw)
  paidIncl: number;       // waarvan betaald
  outstandingIncl: number; // nog openstaand (verzonden/deels)
  overdueIncl: number;    // vervallen
  count: number;
}

// Verkoopfacturen, bedrag-gebaseerd (credit-correct): concepten tellen niet mee;
// creditnota's dragen negatieve bedragen en netten dus vanzelf op 'gefactureerd'.
// 'betaald' = feitelijk betaald bedrag (dekt ook deelbetalingen); 'openstaand' = restbedrag;
// 'vervallen' = restbedrag van vervallen facturen.
// Alleen de velden die de aggregatie gebruikt (optioneel), zodat alle factuur-rijvormen
// (spiegel-query, lijstcomponent) direct passen.
type SummarizableRow = {
  status?: string | null;
  amount_incl?: number | null;
  amount_paid?: number | null;
  amount_outstanding?: number | null;
};

export function summarizeWefactInvoices(rows: SummarizableRow[]): WefactBillingSummary {
  let invoicedIncl = 0, paidIncl = 0, outstandingIncl = 0, overdueIncl = 0, count = 0;
  for (const r of rows) {
    if (r.status === "concept") continue;
    invoicedIncl += Number(r.amount_incl ?? 0);
    paidIncl += Number(r.amount_paid ?? 0);
    outstandingIncl += Number(r.amount_outstanding ?? 0);
    if (r.status === "vervallen") overdueIncl += Number(r.amount_outstanding ?? 0);
    count++;
  }
  return {
    invoicedIncl: round2(invoicedIncl),
    paidIncl: round2(paidIncl),
    outstandingIncl: round2(outstandingIncl),
    overdueIncl: round2(overdueIncl),
    count,
  };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
