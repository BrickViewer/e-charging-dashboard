import { useState } from "react";
import { BookmarkPlus, PenLine, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ROW_GRID } from "./CalcRow";
import { NewCatalogProductDialog } from "./NewCatalogProductDialog";
import { sellPrice, type CatalogProduct } from "@/hooks/useCatalogProducts";
import type { CalcSection } from "@/services/calcTypes";
import { formatEuro as euro } from "@/services/calculations";

/**
 * De enige manier om een regel toe te voegen: één subtiele + op een eigen regel.
 * Erachter zit een zoeklijst met de catalogus van die sectie. Typ je een naam
 * die er niet in staat, dan kun je hem als eigen regel neerzetten óf meteen in
 * de catalogus bewaren.
 */
export function AddLineRow({
  section,
  sectionLabel,
  products,
  hint,
  onPickProduct,
  onCreateFree,
}: {
  section: CalcSection;
  sectionLabel: string;
  products: CatalogProduct[];
  hint: string;
  onPickProduct: (p: CatalogProduct) => void;
  onCreateFree: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dialoog, setDialoog] = useState(false);

  const naam = query.trim();
  const zoek = naam.toLowerCase();
  const gevonden = zoek ? products.filter((p) => `${p.name} ${p.supplier ?? ""} ${p.order_number ?? ""}`.toLowerCase().includes(zoek)) : products;
  const bestaatAl = products.some((p) => p.name.toLowerCase() === zoek);
  const kanNieuw = naam.length > 0 && !bestaatAl;

  const sluit = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={`add-${section}`}
            aria-label={`Regel toevoegen aan ${sectionLabel}`}
            className={cn(
              ROW_GRID,
              "w-full border-b border-border/60 py-1.5 text-left text-muted-foreground/70 transition-colors hover:bg-muted/30 hover:text-foreground",
            )}
          >
            <span className="flex h-6 items-center justify-center">
              <Plus className="h-3.5 w-3.5" />
            </span>
            <span />
            <span className="flex h-6 items-center truncate px-1 text-xs">{hint}</span>
            <span />
            <span />
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-[420px] p-0" align="start">
          {/* Eigen filter: het "nieuw"-item moet zichtbaar blijven ook als geen
              enkel catalogusartikel op de zoekterm past. */}
          <Command shouldFilter={false}>
            <CommandInput placeholder="Zoek een artikel of typ een nieuwe naam…" value={query} onValueChange={setQuery} />
            <CommandList>
              {gevonden.length > 0 && (
                <CommandGroup heading="Uit de catalogus">
                  {gevonden.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => {
                        onPickProduct(p);
                        sluit();
                      }}
                    >
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="ml-2 shrink-0 tabular-nums text-xs text-muted-foreground">
                        {p.kind === "arbeid" ? `${Number(p.gross_price)}/u` : euro(sellPrice(p))}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {kanNieuw && (
                <CommandGroup heading="Nieuw">
                  <CommandItem
                    value="nieuw-eigen-regel"
                    onSelect={() => {
                      onCreateFree(naam);
                      sluit();
                    }}
                  >
                    <PenLine className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">
                      “{naam}” als eigen regel
                    </span>
                  </CommandItem>
                  <CommandItem
                    value="nieuw-in-catalogus"
                    onSelect={() => {
                      setOpen(false);
                      setDialoog(true);
                    }}
                  >
                    <BookmarkPlus className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">
                      “{naam}” opslaan in de catalogus…
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}

              {gevonden.length === 0 && !kanNieuw && (
                <p className="py-6 text-center text-sm text-muted-foreground">Typ een naam om een eigen regel te maken.</p>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {dialoog && (
        <NewCatalogProductDialog
          onOpenChange={(o) => {
            setDialoog(o);
            if (!o) setQuery("");
          }}
          defaultName={naam}
          section={section}
          onCreated={onPickProduct}
        />
      )}
    </>
  );
}
