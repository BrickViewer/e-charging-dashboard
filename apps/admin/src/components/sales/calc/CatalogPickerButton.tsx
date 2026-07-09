import { useState } from "react";
import { ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { sellPrice, type CatalogProduct } from "@/hooks/useCatalogProducts";
import { formatEuro as euro } from "@/services/calculations";

/** Artikelkiezer voor één sectie van het calculatieblad: de aanroeper levert de
    al gefilterde artikelen, zodat je onder "Laadpalen" nooit een kabel pakt. */
export function CatalogPickerButton({
  products,
  label,
  onPick,
}: {
  products: CatalogProduct[];
  label: string;
  onPick: (p: CatalogProduct) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> {label}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek artikel…" />
          <CommandList>
            <CommandEmpty>Geen artikelen gevonden.</CommandEmpty>
            {products.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.name} ${p.supplier ?? ""} ${p.order_number ?? ""}`}
                onSelect={() => {
                  onPick(p);
                  setOpen(false);
                }}
              >
                <span className="flex-1 truncate">{p.name}</span>
                <span className="ml-2 tabular-nums text-xs text-muted-foreground">
                  {p.kind === "arbeid" ? `${Number(p.gross_price)}/u` : euro(sellPrice(p))}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
