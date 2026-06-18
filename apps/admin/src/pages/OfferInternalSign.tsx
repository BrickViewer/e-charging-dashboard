import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle, Loader2, PenLine, Pencil } from "lucide-react";
import { toast } from "sonner";
import logoFull from "@/assets/logo-full-color.svg";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { offerPdfBlob, offerPdfBase64, type OfferPdfData } from "@/services/offerPdf";
import type { OfferDetails, OfferTemplateValues } from "@/services/offerTypes";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const fmtNlDate = (iso?: string | null) => { if (!iso) return "—"; const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }); };

type QuoteSummary = {
  quoteNumber: string;
  company?: string | null;
  contact?: string | null;
  addressLine?: string | null;
  numChargePoints?: number | null;
  total: number;
  withManagement?: boolean;
  durationMonths?: number | null;
  noticeMonths?: number | null;
  chargeTariffPerKwh?: number | null;
  idleFeePerMinute?: number | null;
  startFeePerSession?: number | null;
  idleGraceMinutes?: number | null;
  validUntil?: string | null;
  date?: string | null;
  offerDetails?: OfferDetails | null;
  offerTemplate?: OfferTemplateValues | null;
  internalSignerName?: string | null;
  internalSignerFunction?: string | null;
  internalSignatureDataUrl?: string | null;
};

const toPdfData = (q: QuoteSummary): OfferPdfData => ({
  quoteNumber: q.quoteNumber,
  date: q.date ?? null,
  company: q.company ?? "",
  contactName: q.contact ?? null,
  addressLine: q.addressLine ?? null,
  numChargePoints: q.numChargePoints ?? null,
  totalInvestment: q.total,
  withManagement: q.withManagement,
  durationMonths: q.durationMonths ?? null,
  noticeMonths: q.noticeMonths ?? null,
  chargeTariffPerKwh: q.chargeTariffPerKwh ?? null,
  idleFeePerMinute: q.idleFeePerMinute ?? null,
  startFeePerSession: q.startFeePerSession ?? null,
  idleGraceMinutes: q.idleGraceMinutes ?? null,
  validUntil: q.validUntil ?? null,
  offerDetails: q.offerDetails ?? null,
  offerTemplate: q.offerTemplate ?? null,
});

const echargingSig = (q: QuoteSummary) => ({
  echargingSignatureDataUrl: q.internalSignatureDataUrl ?? null,
  echargingSignerName: q.internalSignerName ?? null,
  echargingSignerFunction: q.internalSignerFunction ?? null,
});

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "text-right font-bold text-foreground" : "text-right font-medium text-foreground"}>{value}</span>
    </div>
  );
}

export default function OfferInternalSign() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const [resp, setResp] = useState<{ status: string; message?: string; quote?: QuoteSummary } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | "approved" | "edited">(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Inloggen vereist: niet-ingelogd -> sla het pad op en stuur naar login.
  useEffect(() => {
    if (!authLoading && !user) {
      try { sessionStorage.setItem("ec_post_login", location.pathname); } catch { /* ignore */ }
      navigate("/login/admin");
    }
  }, [authLoading, user, location.pathname, navigate]);

  // Laad de offerte zodra we ingelogd zijn.
  useEffect(() => {
    if (!user || !token) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("quote-internal-sign", { body: { token, action: "load" } });
        if (error) {
          // functions.invoke geeft non-2xx als error; toon nette tekst.
          setResp({ status: "error", message: "Kon de offerte niet laden of deze is aan iemand anders toegewezen." });
        } else {
          setResp(data as { status: string; message?: string; quote?: QuoteSummary });
        }
      } catch (e) {
        setResp({ status: "error", message: e instanceof Error ? e.message : "Laden mislukt" });
      } finally { setLoading(false); }
    })();
  }, [user, token]);

  const quote = resp?.quote;

  useEffect(() => {
    if (resp?.status !== "ok" || !quote) return;
    let url: string | null = null;
    (async () => {
      try {
        const blob = await offerPdfBlob(toPdfData(quote), { ...echargingSig(quote) });
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } catch { /* preview-fout mag tekenen niet blokkeren */ }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [resp?.status, quote]);

  const approve = async () => {
    if (!token || !quote) return;
    setSubmitting(true);
    try {
      const signedPdf = await offerPdfBase64(toPdfData(quote), { ...echargingSig(quote) });
      const { data, error } = await supabase.functions.invoke("quote-internal-sign", { body: { token, action: "approve", signed_pdf_base64: signedPdf } });
      if (error) throw new Error("Goedkeuren mislukt");
      const out = data as { status: string; message?: string };
      if (out.status === "approved") setDone("approved");
      else toast.error(out.message || "Goedkeuren mislukt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Goedkeuren mislukt");
    } finally { setSubmitting(false); }
  };

  const requestEdit = async () => {
    if (!token) return;
    if (!window.confirm("De offerte wordt teruggezet op concept zodat die kan worden aangepast. Doorgaan?")) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("quote-internal-sign", { body: { token, action: "edit" } });
      if (error) throw new Error("Wijzigen mislukt");
      const out = data as { status: string; message?: string };
      if (out.status === "edited") setDone("edited");
      else toast.error(out.message || "Wijzigen mislukt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wijzigen mislukt");
    } finally { setSubmitting(false); }
  };

  const invalid = resp && resp.status !== "ok";

  if (authLoading || !user || loading || done || invalid || !quote) {
    return (
      <div className="min-h-screen bg-muted/30 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <img src={logoFull} alt="E-Charging" className="mx-auto mb-8 h-9" />
          {authLoading || !user || loading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : done === "approved" ? (
            <Card><CardContent className="space-y-3 p-8 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-green-600" />
              <h1 className="text-xl font-bold">Getekend en verstuurd</h1>
              <p className="text-sm text-muted-foreground">Offerte {quote?.quoteNumber} is ondertekend en automatisch naar de klant gestuurd ter ondertekening.</p>
              <Button className="mt-2" onClick={() => navigate("/sales/offertes")}>Naar offertes</Button>
            </CardContent></Card>
          ) : done === "edited" ? (
            <Card><CardContent className="space-y-3 p-8 text-center">
              <Pencil className="mx-auto h-12 w-12 text-amber-500" />
              <h1 className="text-xl font-bold">Teruggezet op concept</h1>
              <p className="text-sm text-muted-foreground">Offerte {quote?.quoteNumber} staat weer op concept. Pas 'm aan in het systeem en stuur 'm daarna opnieuw ter ondertekening of teken zelf.</p>
              <Button className="mt-2" onClick={() => navigate("/sales/offertes")}>Offerte aanpassen</Button>
            </CardContent></Card>
          ) : (
            <Card><CardContent className="space-y-3 p-8 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
              <h1 className="text-xl font-bold">Offerte niet beschikbaar</h1>
              <p className="text-sm text-muted-foreground">{resp?.message || "Deze tekenlink is niet (meer) geldig."}</p>
            </CardContent></Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30 lg:h-[100dvh] lg:overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <img src={logoFull} alt="E-Charging" className="h-7" />
        <p className="text-xs font-medium text-muted-foreground">Interne ondertekening · Offerte {quote.quoteNumber}</p>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[1.65fr_1fr]">
        {/* Links: de offerte als PDF (met E-Charging-handtekening vooraf ingevuld) */}
        <div className="flex min-h-0 flex-col gap-2 bg-muted/40 p-3 sm:p-5">
          {pdfUrl ? (
            <iframe title="Offerte" src={`${pdfUrl}#view=FitH`} className="min-h-[60vh] w-full flex-1 rounded-lg border bg-white shadow-sm" />
          ) : (
            <div className="flex min-h-[60vh] flex-1 items-center justify-center rounded-lg border bg-white text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Offerte laden…
            </div>
          )}
          {pdfUrl && (
            <div className="text-center">
              <a href={pdfUrl} target="_blank" rel="noopener" className="text-xs font-medium text-primary hover:underline">Offerte in nieuw tabblad openen</a>
            </div>
          )}
        </div>

        {/* Rechts: info + ondertekenen */}
        <aside className="flex flex-col border-t bg-background lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="space-y-6 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Offerte {quote.quoteNumber}</p>
              <h1 className="mt-1 text-xl font-bold leading-snug">Beoordelen en ondertekenen</h1>
              <p className="text-sm text-muted-foreground">Voor {quote.company || "de klant"}{quote.contact ? ` · ${quote.contact}` : ""}</p>
            </div>

            <div className="space-y-2.5 rounded-xl border bg-muted/30 p-4">
              <InfoRow label="Eenmalige investering" value={`${euro(quote.total)} excl. BTW`} strong />
              {quote.numChargePoints ? <InfoRow label="Laadpunten" value={String(quote.numChargePoints)} /> : null}
              {quote.withManagement && quote.durationMonths ? <InfoRow label="Looptijd beheer" value={`${quote.durationMonths} maanden`} /> : null}
              <InfoRow label="Geldig t/m" value={fmtNlDate(quote.validUntil)} />
            </div>

            {/* Voorgevulde ondertekening (read-only) */}
            <div className="space-y-2">
              <h2 className="text-base font-bold">Jouw ondertekening</h2>
              <p className="text-sm text-muted-foreground">Je tekent met je opgeslagen handtekening. Klopt de offerte? Keur goed — dan gaat 'm direct naar de klant.</p>
              <div className="rounded-lg border bg-white p-3">
                <div className="flex h-20 items-center justify-center">
                  {quote.internalSignatureDataUrl
                    ? <img src={quote.internalSignatureDataUrl} alt="Handtekening" className="max-h-16 max-w-full" />
                    : <span className="text-xs text-muted-foreground">Geen handtekening gevonden</span>}
                </div>
                <div className="mt-1 border-t pt-2 text-sm">
                  <p className="font-semibold text-foreground">{quote.internalSignerName || "—"}</p>
                  {quote.internalSignerFunction ? <p className="text-xs text-muted-foreground">{quote.internalSignerFunction}</p> : null}
                  <p className="text-xs text-muted-foreground">E-Charging B.V.</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Button className="w-full" size="lg" onClick={approve} disabled={submitting || !quote.internalSignatureDataUrl}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
                Goedkeuren &amp; versturen naar klant
              </Button>
              <Button className="w-full" size="lg" variant="outline" onClick={requestEdit} disabled={submitting}>
                <Pencil className="mr-2 h-4 w-4" /> Wijzigen (terug naar concept)
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
