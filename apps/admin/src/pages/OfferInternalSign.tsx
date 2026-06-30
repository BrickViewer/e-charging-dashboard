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
import { offerPdfBlob, offerPdfBase64, type OfferPdfData, type OfferSignature } from "@/services/offerPdf";
import { defaultOfferEmail, type OfferDetails, type OfferTemplateValues } from "@/services/offerTypes";
import { OfferPreview } from "@/components/sales/OfferPreview";
import { SignaturePad } from "@/components/SignaturePad";
import { mdBoldToHtml } from "@/lib/emailBody";

type QuoteSummary = {
  quoteNumber: string;
  company?: string | null;
  contact?: string | null;
  addressLine?: string | null;
  numChargePoints?: number | null;
  total: number;
  withManagement?: boolean;
  withInstallation?: boolean;
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
  signerProfileName?: string | null;
  signerProfileFunction?: string | null;
  recipientEmail?: string | null;
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
  withInstallation: q.withInstallation,
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

const echargingSig = (q: QuoteSummary, sig: string | null) => ({
  echargingSignatureDataUrl: sig,
  echargingSignerName: q.internalSignerName ?? q.signerProfileName ?? null,
  echargingSignerFunction: q.internalSignerFunction ?? q.signerProfileFunction ?? null,
});

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
  const [pdfBusy, setPdfBusy] = useState(false);
  const [drawnSig, setDrawnSig] = useState<string | null>(null);
  const [redraw, setRedraw] = useState(false);

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

  // De offerte tonen we inline als schaalbare HTML-viewer; de PDF genereren we pas op verzoek
  // (mobiel-vriendelijk: geen zware html2canvas-render bij het laden).
  const openPdf = async () => {
    if (!quote || pdfBusy) return;
    if (pdfUrl) { window.open(pdfUrl, "_blank", "noopener"); return; }
    setPdfBusy(true);
    try {
      const blob = await offerPdfBlob(toPdfData(quote), { ...echargingSig(quote, drawnSig ?? quote.internalSignatureDataUrl ?? null) });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("PDF genereren mislukt");
    } finally { setPdfBusy(false); }
  };

  // Object-URL opruimen bij verlaten van de pagina.
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const approve = async () => {
    if (!token || !quote) return;
    setSubmitting(true);
    try {
      const sig = drawnSig ?? quote.internalSignatureDataUrl ?? null;
      const signedPdf = await offerPdfBase64(toPdfData(quote), { ...echargingSig(quote, sig) });
      const { data, error } = await supabase.functions.invoke("quote-internal-sign", { body: { token, action: "approve", signed_pdf_base64: signedPdf, signature_data_url: drawnSig } });
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

  const storedSig = quote.internalSignatureDataUrl ?? null;
  const effectiveSig = drawnSig ?? storedSig;
  const showPad = redraw || !storedSig || drawnSig != null;
  const sigName = quote.internalSignerName || quote.signerProfileName || "—";
  const sigFn = quote.internalSignerFunction || quote.signerProfileFunction || null;
  const emailGreeting = quote.offerDetails?.emailGreeting?.trim() || `Beste ${quote.contact || "klant"},`;
  const emailClosing = quote.offerDetails?.emailClosingName?.trim() || quote.internalSignerName || quote.signerProfileName || "Team E-Charging";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30 lg:h-[100dvh] lg:overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <img src={logoFull} alt="E-Charging" className="h-7" />
        <p className="text-xs font-medium text-muted-foreground">Interne ondertekening · Offerte {quote.quoteNumber}</p>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[1.65fr_1fr]">
        {/* Links: de offerte als schaalbare viewer (met E-Charging-handtekening vooraf ingevuld) */}
        <div className="flex min-h-0 flex-col gap-2 bg-muted/40 p-3 sm:p-5">
          <OfferPreview data={toPdfData(quote)} signature={echargingSig(quote, effectiveSig) as OfferSignature} className="h-[65vh] w-full lg:h-auto lg:flex-1" />
          <div className="text-center">
            <button type="button" onClick={openPdf} disabled={pdfBusy} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-60">
              {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Offerte als PDF openen
            </button>
          </div>
        </div>

        {/* Rechts: info + ondertekenen */}
        <aside className="flex flex-col border-t bg-background lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="space-y-6 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Offerte {quote.quoteNumber}</p>
              <h1 className="mt-1 text-xl font-bold leading-snug">Beoordelen en ondertekenen</h1>
              <p className="text-sm text-muted-foreground">Voor {quote.company || "de klant"}{quote.contact ? ` · ${quote.contact}` : ""}</p>
            </div>

            {/* Ondertekening: ter plekke tekenen of de opgeslagen handtekening gebruiken */}
            <div className="space-y-2">
              <h2 className="text-base font-bold">Jouw ondertekening</h2>
              {showPad ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Teken hieronder je handtekening. Klopt de offerte? Keur goed - dan gaat 'm direct naar de klant.</p>
                  <div className="rounded-lg border bg-white p-3">
                    <SignaturePad onChange={setDrawnSig} />
                    <div className="mt-1 border-t pt-2 text-sm">
                      <p className="font-semibold text-foreground">{sigName}</p>
                      {sigFn ? <p className="text-xs text-muted-foreground">{sigFn}</p> : null}
                      <p className="text-xs text-muted-foreground">E-Charging B.V.</p>
                    </div>
                  </div>
                  {storedSig ? (
                    <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => { setDrawnSig(null); setRedraw(false); }}>
                      Gebruik mijn opgeslagen handtekening
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Je tekent met je opgeslagen handtekening. Klopt de offerte? Keur goed - dan gaat 'm direct naar de klant.</p>
                  <div className="rounded-lg border bg-white p-3">
                    <div className="flex h-20 items-center justify-center">
                      <img src={storedSig as string} alt="Handtekening" className="max-h-16 max-w-full" />
                    </div>
                    <div className="mt-1 border-t pt-2 text-sm">
                      <p className="font-semibold text-foreground">{sigName}</p>
                      {sigFn ? <p className="text-xs text-muted-foreground">{sigFn}</p> : null}
                      <p className="text-xs text-muted-foreground">E-Charging B.V.</p>
                    </div>
                  </div>
                  <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setRedraw(true)}>Opnieuw tekenen</button>
                </div>
              )}
            </div>

            {/* Volledig e-mailbericht dat de klant ontvangt (ter controle vóór ondertekenen). */}
            <div className="space-y-2">
              <h2 className="text-base font-bold">E-mailbericht aan de klant</h2>
              {quote.recipientEmail ? <p className="text-sm text-muted-foreground">Aan: <span className="font-medium text-foreground">{quote.recipientEmail}</span></p> : null}
              <div className="rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed text-foreground [&_p]:mb-2 [&_strong]:font-bold">
                <p className="font-medium">{emailGreeting}</p>
                <div dangerouslySetInnerHTML={{ __html: mdBoldToHtml((quote.offerDetails?.emailMessage?.trim()) || defaultOfferEmail({ withInstallation: quote.withInstallation, withManagement: quote.withManagement })) }} />
                <p>Met vriendelijke groet,<br />{emailClosing}</p>
              </div>
              <p className="text-xs text-muted-foreground">De knop "Offerte bekijken en ondertekenen" en de geldigheid worden automatisch toegevoegd.</p>
            </div>

            <div className="space-y-2">
              <Button className="w-full" size="lg" onClick={approve} disabled={submitting || !effectiveSig}>
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
