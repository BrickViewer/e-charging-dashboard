import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import logoFull from "@/assets/logo-full-color.svg";
import { offerPdfBlob, offerPdfBase64, type OfferPdfData, type OfferSignature } from "@/services/offerPdf";
import type { OfferDetails, OfferTemplateValues } from "@/services/offerTypes";
import { SignaturePad } from "@/components/SignaturePad";
import { OfferPreview } from "@/components/sales/OfferPreview";

const fmtNlDate = (iso?: string | null) => { if (!iso) return "—"; const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }); };

type QuoteSummary = {
  quoteNumber: string;
  company?: string | null;
  contact?: string | null;
  signerEmail?: string | null;
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
  // Interne (E-Charging) mede-ondertekening — al gezet voordat de klant tekent.
  internalSignatureDataUrl?: string | null;
  internalSignerName?: string | null;
  internalSignerFunction?: string | null;
};
type Resp = { status: string; message?: string; quote?: QuoteSummary };

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quote-accept`;
const AUTH = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

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

// Bouwt het interne (E-Charging) mede-ondertekening-deel van de OfferSignature.
const echargingSig = (q: QuoteSummary): Partial<OfferSignature> => ({
  echargingSignatureDataUrl: q.internalSignatureDataUrl ?? null,
  echargingSignerName: q.internalSignerName ?? null,
  echargingSignerFunction: q.internalSignerFunction ?? null,
});

export default function OfferAccept() {
  const { token } = useParams<{ token: string }>();
  const [resp, setResp] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerFunction, setSignerFunction] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [authorityChecked, setAuthorityChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);

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

  const quote = resp?.quote;

  // De offerte zelf tonen we inline als schaalbare HTML-viewer (OfferPreview). De PDF genereren we
  // pas op verzoek — mobiel-vriendelijk: geen zware html2canvas-render bij het laden van de pagina.
  const openPdf = async () => {
    if (!quote || pdfBusy) return;
    if (pdfUrl) { window.open(pdfUrl, "_blank", "noopener"); return; }
    setPdfBusy(true);
    try {
      const blob = await offerPdfBlob(toPdfData(quote), { ...echargingSig(quote) });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("PDF genereren mislukt");
    } finally { setPdfBusy(false); }
  };

  // Object-URL opruimen bij verlaten van de pagina.
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const sign = async () => {
    if (!token || !quote) return;
    if (!signerName.trim()) { toast.error("Vul uw naam in"); return; }
    if (!signature) { toast.error("Zet uw handtekening"); return; }
    if (!authorityChecked || !termsChecked) { toast.error("Bevestig de twee verklaringen om te ondertekenen"); return; }
    setSubmitting(true);
    try {
      const signedPdf = await offerPdfBase64(toPdfData(quote), {
        signerName: signerName.trim(),
        signatureDataUrl: signature,
        date: new Date().toISOString(),
        ...echargingSig(quote),
      });
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { Authorization: AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signer_name: signerName.trim(),
          signer_function: signerFunction.trim() || undefined,
          authority_confirmed: true,
          terms_accepted: true,
          signed_pdf_base64: signedPdf,
        }),
      });
      const out = (await res.json()) as Resp;
      if (out.status === "accepted" || out.status === "already_accepted") setAccepted(true);
      else toast.error(out.message || "Akkoord mislukt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Akkoord mislukt");
    } finally { setSubmitting(false); }
  };

  const done = accepted || resp?.status === "already_accepted";
  const invalid = resp && !["ok", "already_accepted"].includes(resp.status);

  // Gecentreerde toestanden (laden / getekend / ongeldig).
  if (loading || done || invalid || !quote) {
    return (
      <div className="min-h-screen bg-muted/30 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <img src={logoFull} alt="E-Charging" className="mx-auto mb-8 h-9" />
          {loading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : done ? (
            <Card><CardContent className="space-y-3 p-8 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-green-600" />
              <h1 className="text-xl font-bold">Bedankt — uw offerte is getekend</h1>
              <p className="text-sm text-muted-foreground">Offerte {quote?.quoteNumber} is digitaal ondertekend. U ontvangt per e-mail een bevestiging met de getekende offerte. Wij nemen contact op voor de planning van de installatie.</p>
              <p className="text-xs text-muted-foreground">Uw digitale ondertekening is geregistreerd.</p>
            </CardContent></Card>
          ) : (
            <Card><CardContent className="space-y-3 p-8 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
              <h1 className="text-xl font-bold">Offerte niet beschikbaar</h1>
              <p className="text-sm text-muted-foreground">{resp?.message || "Deze offerte-link is niet (meer) geldig."}</p>
            </CardContent></Card>
          )}
        </div>
      </div>
    );
  }

  // Actieve offerte: DocuSign-achtige twee-kolom — PDF links, info + tekenen rechts.
  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30 lg:h-[100dvh] lg:overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <img src={logoFull} alt="E-Charging" className="h-7" />
        <p className="text-xs font-medium text-muted-foreground">Offerte {quote.quoteNumber}</p>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[1.65fr_1fr]">
        {/* Links: de volledige offerte als schaalbare viewer (fit-to-width, alle pagina's, zoom) */}
        <div className="flex min-h-0 flex-col gap-2 bg-muted/40 p-3 sm:p-5">
          <OfferPreview data={toPdfData(quote)} signature={echargingSig(quote) as OfferSignature} className="h-[65vh] w-full lg:h-auto lg:flex-1" />
          <div className="text-center">
            <button type="button" onClick={openPdf} disabled={pdfBusy} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-60">
              {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Offerte als PDF openen
            </button>
          </div>
        </div>

        {/* Rechts: belangrijke info + ondertekenen */}
        <aside className="flex flex-col border-t bg-background lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="space-y-6 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Offerte {quote.quoteNumber}</p>
              <h1 className="mt-1 text-xl font-bold leading-snug">Wij plaatsen uw laadpalen.</h1>
              <p className="text-sm text-muted-foreground">Voor {quote.company || "uw organisatie"}</p>
            </div>

            {quote.internalSignerName ? (
              <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ondertekenaars</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">E-Charging · {quote.internalSignerName}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-green-700"><CheckCircle className="h-3.5 w-3.5" /> Getekend</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{quote.company || "U"}</span>
                  <span className="text-muted-foreground">Nog te tekenen</span>
                </div>
              </div>
            ) : null}

            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold">Akkoord geven</h2>
                <p className="text-sm text-muted-foreground">Onderteken hieronder digitaal: vul uw naam in, bevestig de verklaringen en plaats uw handtekening.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signer">Naam ondertekenaar</Label>
                <Input id="signer" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Voor- en achternaam" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signer-fn">Functie <span className="font-normal text-muted-foreground">(optioneel)</span></Label>
                <Input id="signer-fn" value={signerFunction} onChange={(e) => setSignerFunction(e.target.value)} placeholder="Bijv. directeur, eigenaar" />
              </div>

              {/* Verplichte, niet-vooraangevinkte verklaringen — juridisch bindende ondertekening. */}
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Verklaringen</p>
                <label className="flex items-start gap-2.5 text-sm leading-snug">
                  <Checkbox className="mt-0.5 shrink-0" checked={authorityChecked} onCheckedChange={(v) => setAuthorityChecked(v === true)} />
                  <span>Ik ben bevoegd om namens {quote.company || "mijn organisatie"} deze offerte te aanvaarden en een bindende overeenkomst aan te gaan.</span>
                </label>
                <div className="flex items-start gap-2.5 text-sm leading-snug">
                  <Checkbox className="mt-0.5 shrink-0" checked={termsChecked} onCheckedChange={(v) => setTermsChecked(v === true)} />
                  <span>Ik aanvaard deze offerte en ga akkoord met de <a href="https://www.e-charging.nl/algemene-voorwaarden" target="_blank" rel="noopener noreferrer" className="text-inherit underline">Algemene Voorwaarden</a> en de <a href="https://www.e-charging.nl/verwerkersovereenkomst" target="_blank" rel="noopener noreferrer" className="text-inherit underline">Verwerkersovereenkomst</a>, en met elektronisch ondertekenen.</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Handtekening</Label>
                <SignaturePad onChange={setSignature} />
              </div>
              <Button className="w-full" size="lg" onClick={sign} disabled={submitting || !signerName.trim() || !signature || !authorityChecked || !termsChecked}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Akkoord &amp; tekenen
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">Deze offerte is geldig t/m {fmtNlDate(quote.validUntil)}.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
