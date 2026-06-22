import { useState } from "react";
import { Check, ChevronsUpDown, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useLeadSearch } from "@/hooks/useLeads";

const fmt = (r: { company_name: string; contact_name: string | null }) =>
  [r.company_name, r.contact_name].filter(Boolean).join(" · ") || "(naamloze lead)";

// Lead kiezen (geen inline-create; leads ontstaan via de pipeline/intake).
export function LeadPicker({ value, valueLabel, onChange, placeholder = "Kies of zoek lead…" }: {
  value: string | null;
  valueLabel?: string | null;
  onChange: (leadId: string | null, label?: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 200);
  const search = useLeadSearch(debounced);
  const results = search.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="flex items-center gap-2 truncate">
            <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={`truncate ${valueLabel || value ? "" : "text-muted-foreground"}`}>{valueLabel || (value ? "Lead" : placeholder)}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Zoek lead…" value={query} onValueChange={setQuery} />
          <CommandList>
            {results.length === 0 && <CommandEmpty>{query.trim() ? "Geen leads gevonden." : "Typ om te zoeken…"}</CommandEmpty>}
            {results.length > 0 && (
              <CommandGroup heading="Leads">
                {results.map((r) => (
                  <CommandItem key={r.id} value={r.id} onSelect={() => { onChange(r.id, fmt(r)); setOpen(false); setQuery(""); }}>
                    <Check className={`mr-2 h-4 w-4 ${value === r.id ? "opacity-100" : "opacity-0"}`} />
                    <span className="flex-1 truncate">{fmt(r)}</span>
                    {r.city && <span className="ml-2 text-xs text-muted-foreground">{r.city}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {value && (
              <CommandGroup>
                <CommandItem value="__clear__" onSelect={() => { onChange(null); setOpen(false); setQuery(""); }}>
                  <span className="text-muted-foreground">Selectie wissen</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
