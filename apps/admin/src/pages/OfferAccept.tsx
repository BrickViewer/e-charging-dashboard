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
        ) : invalid ? (
          <Card><CardContent className="space-y-3 p-8 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="text-xl font-bold">Offerte niet beschikbaar</h1>
            <p className="text-sm text-muted-foreground">{resp?.message || "Deze offerte-link is niet (meer) geldig."}</p>
          </CardContent></Card>
        ) : quote ? (
          <div className="space-y-5">
            {/* Samenvatting */}
            <Card><CardContent className="flex flex-wrap items-end justify-between gap-4 p-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Offerte {quote.quoteNumber}</p>
                <h1 className="mt-1 text-2xl font-bold">Wij plaatsen uw laadpalen.</h1>
                <p className="text-sm text-muted-foreground">Voor {quote.company || "uw organisatie"}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Eenmalige investering</p>
                <p className="text-2xl font-extrabold">{euro(quote.total)} <span className="text-sm font-medium text-muted-foreground">excl. BTW</span></p>
              </div>
            </CardContent></Card>

            {/* Volledige offerte (PDF) */}
            <Card><CardContent className="p-2">
              {pdfUrl ? (
                <iframe title="Offerte" src={`${pdfUrl}#view=FitH`} className="h-[70vh] w-full rounded-lg" />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Offerte laden…</div>
              )}
              {pdfUrl && (
                <div className="px-3 py-2 text-center">
                  <a href={pdfUrl} target="_blank" rel="noopener" className="text-xs font-medium text-primary hover:underline">Offerte in nieuw tabblad openen</a>
                </div>
              )}
            </CardContent></Card>

            {/* Akkoord + handtekening */}
            <Card><CardContent className="space-y-4 p-6">
              <div>
                <h2 className="text-lg font-bold">Akkoord geven</h2>
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
              <p className="text-center text-[11px] text-muted-foreground">Geldig tot {quote.validUntil || "—"}.</p>
            </CardContent></Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
