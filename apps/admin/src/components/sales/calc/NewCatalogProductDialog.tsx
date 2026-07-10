import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { catalogCategoryLabel, netCost, sellPrice, useCreateCatalogProduct, type CatalogProduct } from "@/hooks/useCatalogProducts";
import { normalizeUrl } from "@/lib/url";
import type { CalcSection } from "@/services/calcTypes";
import { formatEuro as euro } from "@/services/calculations";

const num = (s: string) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const LEEG = { supplier: "", order_number: "", order_url: "", gross_price: "", supplier_discount_pct: "", sell_adjustment_pct: "", install_time_hours: "" };

/**
 * Een nieuw artikel dat je tijdens het calculeren intypt, meteen in de catalogus
 * bewaren. De categorie ligt vast: je opende deze dialoog vanuit die sectie.
 * Na opslaan komt het artikel als regel op het blad.
 *
 * Wordt pas gemount als je hem opent — zo staat er geen mutatie-hook onder elke
 * toevoeg-regel, en is elke opening een schoon formulier.
 */
export function NewCatalogProductDialog({
  onOpenChange,
  defaultName,
  section,
  onCreated,
}: {
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  section: CalcSection;
  onCreated: (product: CatalogProduct) => void;
}) {
  const isArbeid = section === "arbeid";
  const create = useCreateCatalogProduct();
  const [name, setName] = useState(defaultName);
  const [unit, setUnit] = useState(isArbeid ? "uur" : "stuk");
  const [velden, setVelden] = useState(LEEG);

  const bruto = num(velden.gross_price);
  const voorbeeld = {
    cost: netCost({ gross_price: bruto, supplier_discount_pct: num(velden.supplier_discount_pct) / 100 }),
    sell: sellPrice({ gross_price: bruto, sell_adjustment_pct: num(velden.sell_adjustment_pct) / 100 }),
  };

  const opslaan = async () => {
    if (!name.trim()) {
      toast.error("Vul een artikelnaam in");
      return;
    }
    const orderUrl = velden.order_url.trim() ? normalizeUrl(velden.order_url) : null;
    if (velden.order_url.trim() && !orderUrl) {
      toast.error("De bestellink is geen geldige link");
      return;
    }
    try {
      const product = await create.mutateAsync({
        kind: isArbeid ? "arbeid" : "product",
        category: section,
        name: name.trim(),
        supplier: velden.supplier.trim() || null,
        order_number: velden.order_number.trim() || null,
        order_url: orderUrl,
        unit,
        gross_price: bruto,
        supplier_discount_pct: num(velden.supplier_discount_pct) / 100,
        sell_adjustment_pct: num(velden.sell_adjustment_pct) / 100,
        install_time_hours: num(velden.install_time_hours),
      });
      toast.success(`"${product.name}" staat nu in de catalogus`);
      onCreated(product);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Opslaan mislukt: ${e instanceof Error ? e.message : e}`);
    }
  };

  const veld = (key: keyof typeof LEEG) => ({
    value: velden[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setVelden({ ...velden, [key]: e.target.value }),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nieuw artikel in de catalogus</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Wordt opgeslagen onder <strong>{catalogCategoryLabel(section)}</strong> en meteen op de calculatie gezet.
          </p>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Naam</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Eenheid</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stuk">stuk</SelectItem>
                  <SelectItem value="meter">meter</SelectItem>
                  <SelectItem value="uur">uur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Leverancier</Label>
              <Input placeholder="TU, Elektramat…" {...veld("supplier")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Bestelnummer</Label>
              <Input {...veld("order_number")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Bruto inkoop (€)</Label>
              <Input inputMode="decimal" {...veld("gross_price")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Korting lev. (%)</Label>
              <Input inputMode="decimal" placeholder="20" {...veld("supplier_discount_pct")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Toeslag verkoop (%)</Label>
              <Input inputMode="decimal" placeholder="-32 of 20" {...veld("sell_adjustment_pct")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Montagetijd (uur per eenheid)</Label>
              <Input inputMode="decimal" placeholder="0" {...veld("install_time_hours")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Bestellink</Label>
              <Input inputMode="url" placeholder="https://…" {...veld("order_url")} />
            </div>
          </div>

          {bruto > 0 && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Netto kostprijs <strong className="tabular-nums">{euro(voorbeeld.cost)}</strong> · verkoopprijs{" "}
              <strong className="tabular-nums">{euro(voorbeeld.sell)}</strong> per {unit}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={opslaan} disabled={create.isPending}>
            Opslaan en toevoegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
