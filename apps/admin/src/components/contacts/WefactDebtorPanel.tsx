import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Link2, RefreshCw, Search, Receipt } from "lucide-react";
import { WefactManualInvoiceDialog } from "./WefactManualInvoiceDialog";

type AnchorTable = "companies" | "persons";

interface DebtorSearchRow {
  Identifier: string;
  DebtorCode: string;
  CompanyName: string;
  SurName: string;
  EmailAddress: string;
}

// WeFact-debiteurpaneel voor een concreet bedrijf of persoon (= het debiteur-anker).
// Puur de koppeling: aanmaken/bijwerken in WeFact of koppelen aan een bestaande
// debiteur. GEEN bankgegevens — een debiteur (die óns betaalt) heeft geen IBAN nodig;
// uitbetaal-bankgegevens horen bij beheerklanten (client_payment_details).
export function WefactDebtorPanel({
  table,
  subjectId,
  onChanged,
  allowInvoice = false,
}: {
  table: AnchorTable;
  subjectId: string;
  onChanged?: () => void;
  allowInvoice?: boolean;
}) {
  const subjectType = table === "companies" ? "company" : "person";
  const [debtorCode, setDebtorCode] = useState<string | null>(null);
  const [missingAddress, setMissingAddress] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DebtorSearchRow[]>([]);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from(table)
      .select("wefact_debtor_code, address_street, postal_code, city")
      .eq("id", subjectId)
      .maybeSingle();
    setDebtorCode(data?.wefact_debtor_code ?? null);
    // Zonder adres krijgt de WeFact-debiteur (en dus de factuur) geen adresblok.
    setMissingAddress(!!data && !data.address_street && !data.postal_code && !data.city);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, subjectId]);

  const syncDebtor = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("wefact-debtor-sync", {
        body: { action: "create", subjectType, subjectId },
      });
      if (error) throw new Error(error.message);
      if (data?.status === "not_configured") throw new Error("WeFact is nog niet geconfigureerd.");
      if (data?.status !== "ok") throw new Error(data?.message ?? "WeFact gaf een fout");
      toast.success(debtorCode ? `Bijgewerkt in WeFact (${data.debtorCode})` : `Aangemaakt in WeFact (${data.debtorCode})`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "WeFact-sync mislukt");
    } finally {
      setSyncing(false);
    }
  };

  const runSearch = async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("wefact-debtor-sync", {
        body: { action: "search", term },
      });
      if (error) throw new Error(error.message);
      if (data?.status !== "ok") throw new Error(data?.message ?? "Zoeken mislukt");
      setResults(data.debtors ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zoeken mislukt");
    } finally {
      setSearching(false);
    }
  };

  const linkExisting = async (code: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("wefact-debtor-sync", {
        body: { action: "link", subjectType, subjectId, debtorCode: code },
      });
      if (error) throw new Error(error.message);
      if (data?.status !== "ok") throw new Error(data?.message ?? "Koppelen mislukt");
      toast.success(`Gekoppeld aan ${data.debtorCode}`);
      setSearchOpen(false);
      setResults([]);
      setTerm("");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Koppelen mislukt");
    }
  };

  const linked = !!debtorCode;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">WeFact-facturatie</p>
        {linked ? (
          <Badge variant="outline" className="gap-1 border-emerald-300 text-[11px] text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> {debtorCode}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[11px]">Niet gekoppeld</Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {linked
          ? `Gekoppeld aan WeFact-debiteur ${debtorCode}. Facturen voor dit contact lopen via deze debiteur.`
          : "Nog niet gekoppeld aan WeFact. Maak een debiteur aan of koppel aan een bestaande."}
      </p>

      {missingAddress && (
        <p className="text-[11px] text-amber-700">
          Adres ontbreekt bij dit contact — de factuur krijgt dan geen adresblok. Vul eerst het adres in
          en klik daarna op <span className="font-medium">{linked ? "Bijwerken in WeFact" : "Aanmaken in WeFact"}</span>.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {allowInvoice && (
          <Button size="sm" onClick={() => setInvoiceOpen(true)}>
            <Receipt className="mr-1.5 h-4 w-4" />Factuur sturen
          </Button>
        )}
        {linked ? (
          <Button size="sm" variant="outline" onClick={syncDebtor} disabled={syncing}>
            {syncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Bijwerken in WeFact
          </Button>
        ) : (
          <Button size="sm" variant={allowInvoice ? "outline" : "default"} onClick={syncDebtor} disabled={syncing}>
            {syncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}
            Aanmaken in WeFact
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setSearchOpen((v) => !v)}>
          <Search className="mr-1.5 h-4 w-4" />{linked ? "Andere debiteur koppelen" : "Koppelen aan bestaande"}
        </Button>
      </div>

      {searchOpen && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2">
          <div className="flex gap-2">
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Zoek op naam of e-mail" onKeyDown={(e) => e.key === "Enter" && runSearch()} />
            <Button size="sm" variant="outline" onClick={runSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Zoek"}
            </Button>
          </div>
          <div className="space-y-1">
            {results.map((d) => (
              <button
                key={d.Identifier}
                onClick={() => linkExisting(d.DebtorCode)}
                className="flex w-full items-center gap-2 rounded border bg-background p-2 text-left text-sm hover:bg-muted/50"
              >
                <span className="font-mono text-[11px] text-muted-foreground">{d.DebtorCode}</span>
                <span className="flex-1 truncate">{d.CompanyName || d.SurName || "—"}</span>
                <span className="truncate text-[11px] text-muted-foreground">{d.EmailAddress}</span>
              </button>
            ))}
            {results.length === 0 && !searching && <p className="py-1 text-center text-xs text-muted-foreground">Geen resultaten.</p>}
          </div>
        </div>
      )}

      {allowInvoice && (
        <WefactManualInvoiceDialog
          open={invoiceOpen}
          onOpenChange={setInvoiceOpen}
          subjectType={subjectType}
          subjectId={subjectId}
          onCreated={() => { void load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}
