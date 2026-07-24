import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useOrganization, useUpdateOrganization } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface WefactTaxCode { TaxCode: string; Name: string; Rate: number | string | null }
interface WefactProduct { ProductCode: string; ProductName: string }
interface WefactTestResult {
  status: "ok" | "not_configured" | "wefact_error" | "error";
  message: string;
  statusCode?: number;
  errors?: string[];
  taxCodesSale?: WefactTaxCode[];
  taxCodesPurchase?: WefactTaxCode[];
  products?: WefactProduct[];
}

// WeFact-integratie: aan/uit + de administratie-specifieke mappings (BTW-codes,
// activatie-product, debiteurgroep). De API-key zelf staat server-side (Supabase
// secret WEFACT_API_KEY / Vault wefact_api_key) en komt nooit in de DB of frontend.
export function WefactSettingsCard() {
  const { data: org } = useOrganization();
  const updateOrg = useUpdateOrganization();

  const [form, setForm] = useState({
    wefact_enabled: false,
    wefact_tax_code_sale: "",
    wefact_tax_code_purchase: "",
    wefact_product_code_activation: "",
    wefact_debtor_group_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<WefactTestResult | null>(null);

  useEffect(() => {
    if (!org) return;
    setForm({
      wefact_enabled: org.wefact_enabled ?? false,
      wefact_tax_code_sale: org.wefact_tax_code_sale ?? "",
      wefact_tax_code_purchase: org.wefact_tax_code_purchase ?? "",
      wefact_product_code_activation: org.wefact_product_code_activation ?? "",
      wefact_debtor_group_id: org.wefact_debtor_group_id ?? "",
    });
  }, [org]);

  const handleSave = async () => {
    if (!org) return;
    setSaving(true);
    try {
      await updateOrg.mutateAsync({
        id: org.id,
        patch: {
          wefact_enabled: form.wefact_enabled,
          wefact_tax_code_sale: form.wefact_tax_code_sale || null,
          wefact_tax_code_purchase: form.wefact_tax_code_purchase || null,
          wefact_product_code_activation: form.wefact_product_code_activation || null,
          wefact_debtor_group_id: form.wefact_debtor_group_id || null,
        },
      });
      toast.success("WeFact-instellingen opgeslagen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fout bij opslaan");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<WefactTestResult>("wefact-test-connection");
      if (error) setResult({ status: "error", message: error.message ?? "Fout bij aanroep" });
      else if (data) setResult(data);
    } catch (err) {
      setResult({ status: "error", message: err instanceof Error ? err.message : "Onbekende fout" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="portal-card">
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">WeFact-facturatie</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Koppeling voor facturen (installatie, activatie, self-billing) en betaalstatus
          </p>
        </div>

        <div className="p-3 rounded-md border border-border bg-muted/40 space-y-1 max-w-lg">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">WeFact API Key</Label>
          <p className="text-sm">Beheerd via Supabase-secret <code className="font-mono text-xs bg-background px-1.5 py-0.5 rounded">WEFACT_API_KEY</code></p>
          <p className="text-xs text-muted-foreground">Wijzig via Supabase Dashboard → Edge Functions → Secrets. In WeFact (Instellingen → API) de key aanzetten en het IP whitelisten (0.0.0.0/0). Klik "Test verbinding" om te verifiëren.</p>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="wefact-enabled"
            checked={form.wefact_enabled}
            onCheckedChange={(v) => setForm((p) => ({ ...p, wefact_enabled: v }))}
          />
          <Label htmlFor="wefact-enabled" className="cursor-pointer">Koppeling actief</Label>
        </div>

        <div className="grid gap-4 max-w-lg sm:grid-cols-2">
          <div>
            <Label htmlFor="wefact-tax-sale">BTW-code verkoop</Label>
            <Input id="wefact-tax-sale" value={form.wefact_tax_code_sale} onChange={(e) => setForm((p) => ({ ...p, wefact_tax_code_sale: e.target.value }))} placeholder="bijv. V21" />
          </div>
          <div>
            <Label htmlFor="wefact-tax-purchase">BTW-code inkoop</Label>
            <Input id="wefact-tax-purchase" value={form.wefact_tax_code_purchase} onChange={(e) => setForm((p) => ({ ...p, wefact_tax_code_purchase: e.target.value }))} placeholder="bijv. I21" />
          </div>
          <div>
            <Label htmlFor="wefact-product-activation">Productcode activatiekosten (optioneel)</Label>
            <Input id="wefact-product-activation" value={form.wefact_product_code_activation} onChange={(e) => setForm((p) => ({ ...p, wefact_product_code_activation: e.target.value }))} placeholder="bijv. P0002" />
          </div>
          <div>
            <Label htmlFor="wefact-debtor-group">Debiteurgroep-ID (optioneel)</Label>
            <Input id="wefact-debtor-group" value={form.wefact_debtor_group_id} onChange={(e) => setForm((p) => ({ ...p, wefact_debtor_group_id: e.target.value }))} placeholder="bijv. 1" />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />{saving ? "Opslaan…" : "Opslaan"}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testen…</> : "Test WeFact-verbinding"}
          </Button>
        </div>

        {result && (
          <div className={`mt-2 p-3 rounded-md border text-sm flex items-start gap-2 max-w-lg ${
            result.status === "ok" ? "border-primary/30 bg-primary/5 text-foreground" :
            result.status === "not_configured" ? "border-[hsl(var(--status-amber)/0.30)] bg-[hsl(var(--status-amber)/0.05)] text-foreground" :
            "border-destructive/30 bg-destructive/5 text-foreground"
          }`}>
            {result.status === "ok"
              ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              : <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${result.status === "not_configured" ? "text-[hsl(var(--status-amber))]" : "text-destructive"}`} />}
            <div className="space-y-1 w-full">
              <p className="font-medium">{result.message}</p>
              {result.errors && result.errors.length > 0 && (
                <ul className="text-xs text-destructive ml-4 list-disc">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
              )}
              {(result.taxCodesSale?.length || result.taxCodesPurchase?.length) && (
                <div className="text-xs text-muted-foreground mt-1 space-y-1">
                  {result.taxCodesSale && result.taxCodesSale.length > 0 && (
                    <p>Verkoop-BTW-codes: {result.taxCodesSale.map((c) => `${c.TaxCode} (${c.Name})`).join(", ")}</p>
                  )}
                  {result.taxCodesPurchase && result.taxCodesPurchase.length > 0 && (
                    <p>Inkoop-BTW-codes: {result.taxCodesPurchase.map((c) => `${c.TaxCode} (${c.Name})`).join(", ")}</p>
                  )}
                </div>
              )}
              {result.products && result.products.length > 0 && (
                <details className="text-xs text-muted-foreground mt-1">
                  <summary className="cursor-pointer">Producten ({result.products.length})</summary>
                  <ul className="mt-1 ml-4 list-disc font-mono text-[11px]">
                    {result.products.map((p) => <li key={p.ProductCode}>{p.ProductCode} — {p.ProductName}</li>)}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
