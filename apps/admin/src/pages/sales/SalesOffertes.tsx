import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQuotes } from "@/hooks/useQuotes";
import { QuoteDetailSheet } from "@/components/sales/QuoteDetailSheet";
import { NewQuoteDialog } from "@/components/sales/NewQuoteDialog";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const STATUS: Record<string, { label: string; cls: string }> = {
  concept: { label: "Concept", cls: "bg-zinc-100 text-zinc-600" },
  verstuurd: { label: "Verstuurd", cls: "bg-amber-100 text-amber-700" },
  getekend: { label: "Getekend", cls: "bg-green-100 text-green-700" },
  verlopen: { label: "Verlopen", cls: "bg-zinc-100 text-zinc-500" },
  afgewezen: { label: "Afgewezen", cls: "bg-red-100 text-red-700" },
};

export default function SalesOffertes() {
  const quotes = useQuotes();
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search, 200).trim().toLowerCase();
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const qid = searchParams.get("quote");
    if (qid) {
      setSelected(qid);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const all = useMemo(() => quotes.data ?? [], [quotes.data]);
  const filtered = useMemo(
    () => all.filter((qt) => !q || [qt.quote_number, qt.prospect_company].filter(Boolean).join(" ").toLowerCase().includes(q)),
    [all, q],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Offertes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Offertes voortbouwend op de configurator — aanmaken, versturen en akkoord volgen.</p>
        </div>
        <Button onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" /> Nieuwe offerte</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Zoek op nummer of bedrijf…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {quotes.isLoading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : all.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nog geen offertes. Klik op <strong>Nieuwe offerte</strong> (vanuit een lead of standalone), of maak er een vanuit een lead.</p>
          <Button className="mt-4" onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" /> Nieuwe offerte</Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Nummer</th>
                <th className="px-4 py-2.5 font-medium">Bedrijf</th>
                <th className="px-4 py-2.5 text-right font-medium">Bedrag</th>
                <th className="px-4 py-2.5 font-medium">Geldig tot</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((qt) => {
                const total = (Number(qt.total_hardware_cost) || 0) + (Number(qt.total_installation_cost) || 0);
                const st = STATUS[qt.status] ?? { label: qt.status, cls: "bg-muted text-muted-foreground" };
                return (
                  <tr key={qt.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => setSelected(qt.id)}>
                    <td className="px-4 py-2.5 font-medium text-foreground tabular-nums">{qt.quote_number}</td>
                    <td className="px-4 py-2.5 text-foreground">{qt.prospect_company || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{euro(total)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{qt.valid_until || "—"}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Geen offertes.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <QuoteDetailSheet quoteId={selected} open={!!selected} onOpenChange={(v) => !v && setSelected(null)} />
      <NewQuoteDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={(quoteId) => setSelected(quoteId)} />
    </div>
  );
}
