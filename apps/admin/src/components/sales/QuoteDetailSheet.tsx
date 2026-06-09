import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Send, Trash2 } from "lucide-react";
import { useQuote, useUpdateQuote, useSendQuote, useDeleteQuote, lineItemsOf, type QuoteLineItem } from "@/hooks/useQuotes";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const numOr = (v: string): number | null => { const n = Number(String(v).replace(",", ".")); return v.trim() !== "" && Number.isFinite(n) ? n : null; };
const STATUS_LABEL: Record<string, string> = { concept: "Concept", verstuurd: "Verstuurd", getekend: "Getekend", verlopen: "Verlopen", afgewezen: "Afgewezen" };

export function QuoteDetailSheet({ quoteId, open, onOpenChange }: { quoteId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const quoteQ = useQuote(open ? quoteId ?? undefined : undefined);
  const update = useUpdateQuote();
  const send = useSendQuote();
  const del = useDeleteQuote();
  const quote = quoteQ.data;

  const [items, setItems] = useState<QuoteLineItem[]>([]);
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [withManagement, setWithManagement] = useState(true);
  const [chargeRate, setChargeRate] = useState("");
  const [idleFee, setIdleFee] = useState("");
  const [idleGrace, setIdleGrace] = useState("");
  const [monthly, setMonthly] = useState("");

  useEffect(() => {
    if (quote) {
      setItems(lineItemsOf(quote));
      setEmail(quote.prospect_email ?? "");
      setNotes(quote.notes ?? "");
      setWithManagement(quote.with_management !== false);
      setChargeRate(quote.charge_rate_per_kwh != null ? String(quote.charge_rate_per_kwh) : "");
      const td = (quote.tariff_data ?? {}) as Record<string, unknown>;
      setIdleFee(td.idleFeePerMinute != null ? String(td.idleFeePerMinute) : "");
      setIdleGrace(td.idleGraceMinutes != null ? String(td.idleGraceMinutes) : "");
      const mp = (quote.monthly_projection ?? {}) as Record<string, unknown>;
      setMonthly(mp.customerPerMonth != null ? String(Math.round(Number(mp.customerPerMonth))) : "");
    }
  }, [quote]);

  if (!quoteId) return null;
  const isConcept = quote?.status === "concept";
  const grandTotal = items.reduce((s, i) => s + (Number(i.total) || 0), 0);

  const setItem = (idx: number, patch: Partial<QuoteLineItem>) =>
    setItems((arr) => arr.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, ...patch };
      next.total = Math.round((Number(next.qty) || 0) * (Number(next.unit_price) || 0));
      return next;
    }));

  const save = async () => {
    if (!quote) return;
    const hardware = items[0]?.total ?? 0;
    const installation = items.slice(1).reduce((s, i) => s + (Number(i.total) || 0), 0);
    const tariffData = withManagement && (numOr(chargeRate) != null || numOr(idleFee) != null || numOr(idleGrace) != null)
      ? { chargeTariffPerKwh: numOr(chargeRate), idleFeePerMinute: numOr(idleFee), idleGraceMinutes: numOr(idleGrace) }
      : null;
    const monthlyProj = withManagement && numOr(monthly) != null ? { customerPerMonth: numOr(monthly) } : null;
    try {
      await update.mutateAsync({
        id: quote.id,
        patch: {
          line_items: items as unknown as never,
          total_hardware_cost: hardware,
          total_installation_cost: installation,
          prospect_email: email.trim() || null,
          notes: notes.trim() || null,
          with_management: withManagement,
          charge_rate_per_kwh: withManagement ? numOr(chargeRate) : null,
          tariff_data: tariffData as unknown as never,
          monthly_projection: monthlyProj as unknown as never,
        },
      });
      toast.success("Offerte opgeslagen");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
  };

  const doSend = async () => {
    if (!quote) return;
    if (grandTotal <= 0 && !window.confirm("Het offertetotaal is €0. Toch versturen?")) return;
    if (isConcept) await save();
    if (!email.trim()) { toast.error("Vul een e-mailadres in"); return; }
    try {
      await send.mutateAsync({ quoteId: quote.id, email: email.trim() });
      toast.success(`Offerte verstuurd naar ${email.trim()}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Versturen mislukt"); }
  };

  const doDelete = async () => {
    if (!quote) return;
    if (!window.confirm(`Offerte ${quote.quote_number} definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    try {
      await del.mutateAsync(quote.id);
      toast.success("Offerte verwijderd");
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verwijderen mislukt"); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl">Offerte {quote?.quote_number ?? ""}</SheetTitle>
        </SheetHeader>

        {!quote ? (
          <p className="mt-6 text-sm text-muted-foreground">Laden…</p>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{quote.prospect_company || "—"}</p>
                <p className="text-[11px] text-muted-foreground">{quote.prospect_contact || ""}</p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{STATUS_LABEL[quote.status] ?? quote.status}</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Met beheer</p>
                <p className="text-[11px] text-muted-foreground">e-Charging dashboard + opbrengstdeling. Uit = alleen levering &amp; installatie.</p>
              </div>
              <Switch checked={withManagement} onCheckedChange={setWithManagement} disabled={!isConcept} />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Offerteregels</p>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_56px_84px_84px_auto] items-center gap-2">
                    <Input className="h-9" value={it.description} disabled={!isConcept} onChange={(e) => setItem(idx, { description: e.target.value })} />
                    <Input className="h-9 text-center" inputMode="numeric" value={it.qty} disabled={!isConcept} onChange={(e) => setItem(idx, { qty: Number(e.target.value) || 0 })} />
                    <Input className="h-9 text-right" inputMode="numeric" value={it.unit_price} disabled={!isConcept} onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) || 0 })} />
                    <span className="text-right text-sm font-semibold">{euro(it.total)}</span>
                    {isConcept && (
                      <button className="text-muted-foreground hover:text-red-600" onClick={() => setItems((a) => a.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {isConcept && (
                  <Button variant="outline" size="sm" onClick={() => setItems((a) => [...a, { description: "", qty: 1, unit_price: 0, total: 0 }])}>
                    <Plus className="mr-1.5 h-4 w-4" /> Regel toevoegen
                  </Button>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <span className="text-sm font-bold text-foreground">Totaal investering</span>
                <span className="text-lg font-extrabold text-foreground">{euro(grandTotal)}</span>
              </div>
            </div>

            {withManagement && (
              <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Beheer-gegevens (optioneel)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Laadtarief / kWh</Label><Input inputMode="decimal" value={chargeRate} disabled={!isConcept} onChange={(e) => setChargeRate(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Opbrengst / maand (€)</Label><Input inputMode="decimal" value={monthly} disabled={!isConcept} onChange={(e) => setMonthly(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Blokkeertarief / min</Label><Input inputMode="decimal" value={idleFee} disabled={!isConcept} onChange={(e) => setIdleFee(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Gratis minuten</Label><Input inputMode="numeric" value={idleGrace} disabled={!isConcept} onChange={(e) => setIdleGrace(e.target.value)} /></div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Notitie (op de offerte)</Label>
              <Textarea rows={2} value={notes} disabled={!isConcept} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">E-mail ontvanger</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={quote.status === "getekend"} />
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              {isConcept ? (
                <Button variant="outline" onClick={save} disabled={update.isPending}>Opslaan</Button>
              ) : <span className="text-xs text-muted-foreground">Geldig tot {quote.valid_until ?? "—"}</span>}
              {quote.status !== "getekend" && (
                <Button onClick={doSend} disabled={send.isPending || update.isPending}>
                  <Send className="mr-1.5 h-4 w-4" />
                  {quote.status === "verstuurd" ? "Opnieuw versturen" : "Versturen"}
                </Button>
              )}
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={doDelete} disabled={del.isPending}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Offerte verwijderen
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
