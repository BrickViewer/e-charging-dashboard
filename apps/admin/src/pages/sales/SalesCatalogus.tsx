import { useMemo, useState } from "react";
import { Package, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { normalizeUrl, urlHost } from "@/lib/url";
import { OrderLinksCell, parseExtraLinks, type ExtraLink } from "@/components/sales/OrderLinksCell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatEuro as euro } from "@/services/calculations";
import {
  useCatalogProducts,
  useCreateCatalogProduct,
  useUpdateCatalogProduct,
  netCost,
  sellPrice,
  CATALOG_CATEGORIES,
  catalogCategoryLabel,
  type CatalogProduct,
} from "@/hooks/useCatalogProducts";

const pct = (n: number) => `${Math.round(Number(n) * 1000) / 10}%`;

type Draft = {
  id?: string;
  kind: string;
  category: string;
  name: string;
  supplier: string;
  order_number: string;
  order_url: string;
  extra_links: ExtraLink[];
  unit: string;
  gross_price: string;
  supplier_discount_pct: string; // als % (bv. "20")
  sell_adjustment_pct: string;   // als % (bv. "-32")
  install_time_hours: string;
  notes: string;
};

const emptyDraft = (): Draft => ({
  kind: "product",
  category: "laadpalen",
  name: "",
  supplier: "",
  order_number: "",
  order_url: "",
  extra_links: [],
  unit: "stuk",
  gross_price: "",
  supplier_discount_pct: "",
  sell_adjustment_pct: "",
  install_time_hours: "",
  notes: "",
});

const toDraft = (p: CatalogProduct): Draft => ({
  id: p.id,
  kind: p.kind,
  category: p.category,
  name: p.name,
  supplier: p.supplier ?? "",
  order_number: p.order_number ?? "",
  order_url: p.order_url ?? "",
  extra_links: parseExtraLinks(p.extra_links),
  unit: p.unit,
  gross_price: String(p.gross_price ?? ""),
  supplier_discount_pct: p.supplier_discount_pct ? String(Math.round(Number(p.supplier_discount_pct) * 1000) / 10) : "",
  sell_adjustment_pct: p.sell_adjustment_pct ? String(Math.round(Number(p.sell_adjustment_pct) * 1000) / 10) : "",
  install_time_hours: Number(p.install_time_hours) ? String(p.install_time_hours) : "",
  notes: p.notes ?? "",
});

const num = (s: string) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export default function SalesCatalogus() {
  const [showInactive, setShowInactive] = useState(false);
  const products = useCatalogProducts({ includeInactive: showInactive });
  const create = useCreateCatalogProduct();
  const update = useUpdateCatalogProduct();

  const [tab, setTab] = useState<string>("alles");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search, 200).trim().toLowerCase();
  const [draft, setDraft] = useState<Draft | null>(null);

  const all = useMemo(() => products.data ?? [], [products.data]);
  const filtered = useMemo(
    () =>
      all.filter(
        (p) =>
          (tab === "alles" || p.category === tab) &&
          (!q || [p.name, p.supplier, p.order_number].filter(Boolean).join(" ").toLowerCase().includes(q)),
      ),
    [all, tab, q],
  );

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Vul een artikelnaam in");
      return;
    }
    // Bestellinks: normaliseren (https:// erbij als dat ontbreekt) en alleen
    // echte http(s)-links opslaan — ze worden als klikbare <a href> gerenderd.
    const orderUrl = draft.order_url.trim() ? normalizeUrl(draft.order_url) : null;
    if (draft.order_url.trim() && !orderUrl) {
      toast.error("De bestellink is geen geldige link");
      return;
    }
    const extraLinks: ExtraLink[] = [];
    for (const l of draft.extra_links) {
      if (!l.url.trim() && !l.label.trim()) continue; // lege rij: stilzwijgend overslaan
      const u = normalizeUrl(l.url);
      if (!u) {
        toast.error(`De link van ${l.label.trim() || "de extra leverancier"} is geen geldige link`);
        return;
      }
      extraLinks.push({ label: l.label.trim() || urlHost(u), url: u });
    }
    const patch = {
      kind: draft.category === "arbeid" ? "arbeid" : "product",
      category: draft.category,
      name: draft.name.trim(),
      supplier: draft.supplier.trim() || null,
      order_number: draft.order_number.trim() || null,
      order_url: orderUrl,
      extra_links: extraLinks,
      unit: draft.unit,
      gross_price: num(draft.gross_price),
      supplier_discount_pct: num(draft.supplier_discount_pct) / 100,
      sell_adjustment_pct: num(draft.sell_adjustment_pct) / 100,
      install_time_hours: num(draft.install_time_hours),
      notes: draft.notes.trim() || null,
    };
    try {
      if (draft.id) await update.mutateAsync({ id: draft.id, patch });
      else await create.mutateAsync(patch);
      toast.success(draft.id ? "Artikel bijgewerkt" : "Artikel toegevoegd");
      setDraft(null);
    } catch (e) {
      toast.error(`Opslaan mislukt: ${e instanceof Error ? e.message : e}`);
    }
  };

  // Zelfde formules als de tabel/calculator gebruiken — preview mag nooit
  // afwijken van wat na opslaan daadwerkelijk gerekend wordt.
  const draftPreview = draft
    ? {
        cost: netCost({ gross_price: num(draft.gross_price), supplier_discount_pct: num(draft.supplier_discount_pct) / 100 }),
        sell: sellPrice({ gross_price: num(draft.gross_price), sell_adjustment_pct: num(draft.sell_adjustment_pct) / 100 }),
      }
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Catalogus</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Producten en arbeid voor de interne calculatie — bruto inkoop, leverancierskorting, verkooptoeslag en montagetijd.
          </p>
        </div>
        <Button onClick={() => setDraft(emptyDraft())}>
          <Plus className="mr-2 h-4 w-4" /> Nieuw artikel
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Zoek op naam, leverancier of bestelnummer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex rounded-lg border bg-card p-0.5 text-sm">
          {[{ value: "alles", label: "Alles" }, ...CATALOG_CATEGORIES].map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setTab(c.value)}
              className={`rounded-md px-3 py-1.5 transition-colors ${tab === c.value ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Inactief tonen
        </label>
      </div>

      {products.isLoading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Artikel</th>
                  <th className="px-4 py-2.5 font-medium">Leverancier</th>
                  <th className="px-4 py-2.5 font-medium">Bestelnr.</th>
                  <th className="px-4 py-2.5 text-right font-medium">Bruto</th>
                  <th className="px-4 py-2.5 text-right font-medium">Korting</th>
                  <th className="px-4 py-2.5 text-right font-medium">Netto (kost)</th>
                  <th className="px-4 py-2.5 text-right font-medium">Verkoop</th>
                  <th className="px-4 py-2.5 text-right font-medium">Uur/eenh.</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/40 ${p.is_active ? "" : "opacity-50"}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-foreground">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {catalogCategoryLabel(p.category)} · per {p.unit}
                        {p.is_active ? "" : " · inactief"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.supplier || "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {p.order_number || "—"}
                        <OrderLinksCell orderUrl={p.order_url} extraLinks={p.extra_links} supplier={p.supplier} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{euro(Number(p.gross_price))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{Number(p.supplier_discount_pct) ? pct(p.supplier_discount_pct) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{euro(netCost(p))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{euro(sellPrice(p))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{Number(p.install_time_hours) ? Number(p.install_time_hours).toLocaleString("nl-NL") : "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(p))}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Switch
                          checked={p.is_active}
                          onCheckedChange={(v) =>
                            update.mutate(
                              { id: p.id, patch: { is_active: v } },
                              { onError: (e) => toast.error(`Wijzigen mislukt: ${e instanceof Error ? e.message : e}`) },
                            )
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      <Package className="mx-auto mb-2 h-7 w-7" />
                      Geen artikelen{q ? " voor deze zoekopdracht" : ""}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Artikel bewerken" : "Nieuw artikel"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>Naam</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Categorie</Label>
                  <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v, unit: v === "arbeid" ? "uur" : draft.unit })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATALOG_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Eenheid</Label>
                  <Select value={draft.unit} onValueChange={(v) => setDraft({ ...draft, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stuk">stuk</SelectItem>
                      <SelectItem value="meter">meter</SelectItem>
                      <SelectItem value="uur">uur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Leverancier</Label>
                  <Input value={draft.supplier} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} placeholder="TU, Elektramat…" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Bestelnummer</Label>
                  <Input value={draft.order_number} onChange={(e) => setDraft({ ...draft, order_number: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Bestellink</Label>
                <Input
                  inputMode="url"
                  value={draft.order_url}
                  onChange={(e) => setDraft({ ...draft, order_url: e.target.value })}
                  placeholder="https://…"
                />
                {draft.extra_links.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-center gap-2">
                    <Input
                      value={l.label}
                      onChange={(e) =>
                        setDraft({ ...draft, extra_links: draft.extra_links.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)) })
                      }
                      placeholder="Leverancier"
                    />
                    <Input
                      inputMode="url"
                      value={l.url}
                      onChange={(e) =>
                        setDraft({ ...draft, extra_links: draft.extra_links.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)) })
                      }
                      placeholder="https://…"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Verwijder deze link"
                      onClick={() => setDraft({ ...draft, extra_links: draft.extra_links.filter((_, idx) => idx !== i) })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {/* Bewust onopvallend: de meeste artikelen hebben maar één leverancier. */}
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, extra_links: [...draft.extra_links, { label: "", url: "" }] })}
                  className="justify-self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  + link van een andere leverancier
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label>Bruto inkoop (€)</Label>
                  <Input inputMode="decimal" value={draft.gross_price} onChange={(e) => setDraft({ ...draft, gross_price: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Korting lev. (%)</Label>
                  <Input inputMode="decimal" value={draft.supplier_discount_pct} onChange={(e) => setDraft({ ...draft, supplier_discount_pct: e.target.value })} placeholder="20" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Toeslag verkoop (%)</Label>
                  <Input inputMode="decimal" value={draft.sell_adjustment_pct} onChange={(e) => setDraft({ ...draft, sell_adjustment_pct: e.target.value })} placeholder="-32 of 20" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Montagetijd (uur per eenheid)</Label>
                  <Input inputMode="decimal" value={draft.install_time_hours} onChange={(e) => setDraft({ ...draft, install_time_hours: e.target.value })} placeholder="0" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Notitie</Label>
                  <Input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                </div>
              </div>
              {draftPreview && (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  Netto kostprijs <strong className="tabular-nums">{euro(draftPreview.cost)}</strong> · verkoopprijs{" "}
                  <strong className="tabular-nums">{euro(draftPreview.sell)}</strong> per {draft.unit}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Annuleren</Button>
            <Button onClick={saveDraft} disabled={create.isPending || update.isPending}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
