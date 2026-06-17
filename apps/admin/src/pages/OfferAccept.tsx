import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import logoFull from "@/assets/logo-full-color.svg";
import { offerPdfBlob, offerPdfBase64, type OfferPdfData } from "@/services/offerPdf";

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
  idleGraceMinutes?: number | null;
  validUntil?: string | null;
  date?: string | null;
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
  durationMonths: q.durationMonths ?? null,
  noticeMonths: q.noticeMonths ?? null,
  chargeTariffPerKwh: q.chargeTariffPerKwh ?? null,
  idleFeePerMinute: q.idleFeePerMinute ?? null,
  idleGraceMinutes: q.idleGraceMinutes ?? null,
  validUntil: q.validUntil ?? null,
});

// Klein, zelfstandig handtekening-tekenvlak (geen externe dependency).
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.max(1, rect.width) * dpr;
    c.height = Math.max(1, rect.height) * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(ref.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={ref}
        className="h-40 w-full touch-none rounded-lg border border-input bg-white"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>Teken hier met uw muis of vinger</span>
        <button type="button" className="font-medium hover:text-foreground" onClick={clear}>Wissen</button>
      </div>
    </div>
  );
}

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "text-right font-bold text-foreground" : "text-right font-medium text-foreground"}>{value}</span>
    </div>
  );
}

export default function OfferAccept() {
  const { token } = useParams<{ token: string }>();
  const [resp, setResp] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);

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

  // Genereer de offerte-PDF voor de preview zodra de samenvatting binnen is.
  useEffect(() => {
    if (resp?.status !== "ok" || !quote) return;
    let url: string | null = null;
    (async () => {
      try {
        const blob = await offerPdfBlob(toPdfData(quote));
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } catch { /* preview-fout mag tekenen niet blokkeren */ }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [resp?.status, quote]);

  const sign = async () => {
    if (!token || !quote) return;
    if (!signerName.trim()) { toast.error("Vul uw naam in"); return; }
    if (!signature) { toast.error("Zet uw handtekening"); return; }
    setSubmitting(true);
    try {
      const signedPdf = await offerPdfBase64(toPdfData(quote), {
        signerName: signerName.trim(),
        signatureDataUrl: signature,
        date: new Date().toISOString(),
      });
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { Authorization: AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ token, signer_name: signerName.trim(), signed_pdf_base64: signedPdf }),
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
        {/* Links: de volledige offerte als PDF */}
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

        {/* Rechts: belangrijke info + ondertekenen */}
        <aside className="flex flex-col border-t bg-background lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="space-y-6 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Offerte {quote.quoteNumber}</p>
              <h1 className="mt-1 text-xl font-bold leading-snug">Wij plaatsen uw laadpalen.</h1>
              <p className="text-sm text-muted-foreground">Voor {quote.company || "uw organisatie"}</p>
            </div>

            <div className="space-y-2.5 rounded-xl border bg-muted/30 p-4">
              <InfoRow label="Eenmalige investering" value={`${euro(quote.total)} excl. BTW`} strong />
              {quote.numChargePoints ? <InfoRow label="Laadpunten" value={String(quote.numChargePoints)} /> : null}
              {quote.withManagement && quote.durationMonths ? <InfoRow label="Looptijd beheer" value={`${quote.durationMonths} maanden`} /> : null}
              <InfoRow label="Geldig t/m" value={fmtNlDate(quote.validUntil)} />
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold">Akkoord geven</h2>
                <p className="text-sm text-muted-foreground">Door te ondertekenen gaat u akkoord met deze offerte, de Algemene Voorwaarden en de Verwerkersovereenkomst E-Charging.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signer">Naam ondertekenaar</Label>
                <Input id="signer" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Voor- en achternaam" />
              </div>
              <div className="space-y-1.5">
                <Label>Handtekening</Label>
                <SignaturePad onChange={setSignature} />
              </div>
              <Button className="w-full" size="lg" onClick={sign} disabled={submitting || !signerName.trim() || !signature}>
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
