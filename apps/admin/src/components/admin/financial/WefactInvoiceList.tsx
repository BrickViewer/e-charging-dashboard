import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, MoreHorizontal, Loader2, CheckCircle2, RotateCcw, Send, Trash2 } from "lucide-react";
import { formatEuro } from "@/services/calculations";

export interface WefactInvoiceRowData {
  id: string;
  wefact_invoice_id: string;
  invoice_code: string | null;
  kind: string;
  status: string | null;
  amount_incl: number | null;
  amount_outstanding: number | null;
  invoice_date: string | null;
  pay_before: string | null;
  client_id: string | null;
  debtor_name: string | null;
  payment_url?: string | null;
}

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  betaald: { cls: "border-emerald-300 text-emerald-700", label: "Betaald" },
  verzonden: { cls: "border-amber-300 text-amber-700", label: "Verzonden" },
  deels_betaald: { cls: "border-amber-300 text-amber-700", label: "Deels betaald" },
  vervallen: { cls: "border-red-300 text-red-700", label: "Vervallen" },
  concept: { cls: "border-muted-foreground/30 text-muted-foreground", label: "Concept" },
  credit: { cls: "border-blue-300 text-blue-700", label: "Creditnota" },
};

export function WefactStatusBadge({ status }: { status: string | null }) {
  const s = STATUS_STYLE[status ?? ""] ?? { cls: "border-muted-foreground/30 text-muted-foreground", label: status ?? "—" };
  return <Badge variant="outline" className={`text-[10px] ${s.cls}`}>{s.label}</Badge>;
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

// Gedeelde verkoopfactuur-lijst met datums, volledige statusbadges, klik→klant en
// per-rij beheeracties (PDF, markeer betaald, crediteren, versturen). Gebruikt op
// /admin/facturatie, klant-Financieel en contactdetail.
export function WefactInvoiceList({
  rows,
  showDebtor = false,
  onChanged,
}: {
  rows: WefactInvoiceRowData[];
  showDebtor?: boolean;
  onChanged?: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    onChanged?.();
    qc.invalidateQueries({ queryKey: ["wefact-invoices-client"] });
    qc.invalidateQueries({ queryKey: ["wefact-billing-invoices"] });
    qc.invalidateQueries({ queryKey: ["wefact-invoices-contact"] });
    qc.invalidateQueries({ queryKey: ["wefact-monthly-overview"] });
  };

  const act = async (row: WefactInvoiceRowData, action: "pdf" | "send" | "markpaid" | "credit" | "delete") => {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("wefact-invoice-actions", {
        body: { action, wefactInvoiceId: row.wefact_invoice_id },
      });
      if (error) throw new Error(error.message);
      if (data?.status === "not_configured") throw new Error("WeFact is nog niet geconfigureerd.");
      if (data?.status !== "ok") throw new Error(data?.message ?? "Actie mislukt");
      if (action === "pdf") {
        openPdf(data.base64, data.filename ?? "factuur.pdf");
      } else {
        // Crediteren maakt in WeFact een APARTE creditnota (negatief). Draai daarom de status-sync
        // mee, die álle facturen ophaalt (incl. de nieuwe creditnota + bijgewerkte statussen), zodat
        // de omzet netto tegenboekt. De credit-respons zelf is niet betrouwbaar te spiegelen.
        if (action === "credit") {
          await supabase.functions.invoke("wefact-status-sync");
        }
        const labels: Record<string, string> = { send: "verstuurd", markpaid: "gemarkeerd als betaald", credit: "gecrediteerd", delete: "verwijderd" };
        toast.success(`Factuur ${labels[action]}`);
        refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Actie mislukt");
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">Nog geen facturen in WeFact.</p>;
  }

  return (
    <div className="space-y-1.5">
      {rows.map((i) => (
        <div key={i.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
          <button
            onClick={() => i.client_id && navigate(`/beheer/klanten/${i.client_id}`)}
            disabled={!i.client_id}
            className="flex min-w-0 flex-1 items-center gap-2 text-left enabled:hover:text-primary"
          >
            <span className="font-mono text-[11px] text-muted-foreground">{i.invoice_code || "concept"}</span>
            <Badge variant="secondary" className="text-[10px] capitalize">{i.kind}</Badge>
            {showDebtor && <span className="truncate">{i.debtor_name || "—"}</span>}
            <span className="text-[11px] text-muted-foreground">{fmtDate(i.invoice_date)}</span>
          </button>
          <span className="tabular-nums">{formatEuro(Number(i.amount_incl ?? 0))}</span>
          <WefactStatusBadge status={i.status} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busyId === i.id}>
                {busyId === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => act(i, "pdf")}><FileText className="mr-2 h-4 w-4" />PDF bekijken</DropdownMenuItem>
              {i.status === "concept" && (
                <DropdownMenuItem onClick={() => act(i, "send")}><Send className="mr-2 h-4 w-4" />Versturen</DropdownMenuItem>
              )}
              {i.status === "concept" && (
                <DropdownMenuItem className="text-red-600" onClick={() => act(i, "delete")}><Trash2 className="mr-2 h-4 w-4" />Verwijderen</DropdownMenuItem>
              )}
              {i.status !== "betaald" && i.status !== "concept" && i.status !== "credit" && (
                <DropdownMenuItem onClick={() => act(i, "markpaid")}><CheckCircle2 className="mr-2 h-4 w-4" />Markeer als betaald</DropdownMenuItem>
              )}
              {i.status !== "concept" && i.status !== "credit" && (
                <DropdownMenuItem className="text-red-600" onClick={() => act(i, "credit")}><RotateCcw className="mr-2 h-4 w-4" />Crediteren</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}

function openPdf(base64: string, filename: string) {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    toast.error("PDF kon niet worden geopend");
  }
}
