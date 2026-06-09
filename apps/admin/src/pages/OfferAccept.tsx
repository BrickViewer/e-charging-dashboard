import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import logoBright from "@/assets/logo-bright.svg";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

type LineItem = { description: string; total: number };
type QuoteSummary = {
  quoteNumber: string;
  company?: string | null;
  lineItems: LineItem[];
  total: number;
  monthlyProjection?: { customerPerMonth?: number } | null;
  validUntil?: string | null;
  withManagement?: boolean;
};
type Resp = { status: string; message?: string; quote?: QuoteSummary };

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quote-accept`;
const AUTH = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

export default function OfferAccept() {
  const { token } = useParams<{ token: string }>();
  const [resp, setResp] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) { setResp({ status: "not_found", message: "Geen token" }); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, { headers: { Authorization: AUTH } });
        setResp(await res.json());
      } catch (e) {
        setResp({ status: "error", message: e instanceof Error ? e.message : "Laden mislukt" });
      } finally { setLoading(false); }
    })();
  }, [token]);

  const accept = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(FN_URL, { method: "POST", headers: { Authorization: AUTH, "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const json = (await res.json()) as Resp;
      if (json.status === "accepted" || json.status === "already_accepted") {
        setAccepted(true);
      } else {
        toast.error(json.message || "Akkoord mislukt");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Akkoord mislukt");
    } finally { setSubmitting(false); }
  };

  const quote = resp?.quote;
  const done = accepted || resp?.status === "already_accepted";
  const invalid = resp && !["ok", "already_accepted"].includes(resp.status);

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-12">
      <div className="mx-auto max-w-lg">
        <img src={logoBright} alt="E-Charging" className="mx-auto mb-8 h-8" />
        {loading ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : done ? (
          <Card><CardContent className="space-y-3 p-8 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-600" />
            <h1 className="text-xl font-bold">Bedankt — akkoord ontvangen</h1>
            <p className="text-sm text-muted-foreground">Offerte {quote?.quoteNumber} is digitaal geaccordeerd. We nemen contact op voor de planning van de installatie.</p>
          </CardContent></Card>
        ) : invalid ? (
          <Card><CardContent className="space-y-3 p-8 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="text-xl font-bold">Offerte niet beschikbaar</h1>
            <p className="text-sm text-muted-foreground">{resp?.message || "Deze offerte-link is niet (meer) geldig."}</p>
          </CardContent></Card>
        ) : quote ? (
          <Card><CardContent className="space-y-5 p-7">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Offerte {quote.quoteNumber}</p>
              <h1 className="mt-1 text-2xl font-bold">Voorstel laadpalen</h1>
              <p className="text-sm text-muted-foreground">Voor {quote.company || "uw organisatie"}</p>
            </div>
            <div className="space-y-1.5">
              {quote.lineItems.map((li, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{li.description}</span>
                  <span className="font-semibold text-foreground">{euro(Number(li.total) || 0)}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t pt-2">
                <span className="font-bold">Totaal investering</span>
                <span className="text-lg font-extrabold">{euro(quote.total)}</span>
              </div>
            </div>
            {quote.withManagement && (
              <p className="text-center text-xs font-medium text-primary">Inclusief e-Charging beheer — dashboard + maandelijkse opbrengstdeling.</p>
            )}
            <Button className="w-full" size="lg" onClick={accept} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Akkoord geven op deze offerte
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">Geldig tot {quote.validUntil || "—"}. Door te accorderen gaat u akkoord met dit voorstel.</p>
          </CardContent></Card>
        ) : null}
      </div>
    </div>
  );
}
