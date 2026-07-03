import { useState } from "react";
import { Check, ChevronsUpDown, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useProjectLocationSearch, useCreateProjectLocation, type ObjectSearchResult } from "@/hooks/useProjectLocations";

const fmt = (r: ObjectSearchResult) => r.display_name;

export function ObjectPicker({ value, valueLabel, onChange, placeholder = "Kies een object…" }: {
  value: string | null;
  valueLabel?: string | null;
  onChange: (id: string | null, label?: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 200);
  const search = useProjectLocationSearch(debounced);
  const results = search.data ?? [];
  const createObj = useCreateProjectLocation();
  const exact = results.some((r) => (r.display_name ?? "").toLowerCase() === query.trim().toLowerCase());

  const handleCreate = async () => {
    const name = query.trim();
    if (!name) return;
    try {
      const created = await createObj.mutateAsync({ display_name: name, address_street: null, postal_code: null, city: null });
      onChange(created.id, created.display_name);
      toast.success(`Object "${created.display_name}" aangemaakt`);
      setOpen(false);
      setQuery("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aanmaken mislukt");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="flex items-center gap-2 truncate">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={`truncate ${valueLabel || value ? "" : "text-muted-foreground"}`}>{valueLabel || (value ? "Object" : placeholder)}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Zoek object / adres…" value={query} onValueChange={setQuery} />
          <CommandList>
            {results.length === 0 && <CommandEmpty>{query.trim() ? "Geen objecten gevonden." : "Typ om te zoeken…"}</CommandEmpty>}
            {results.length > 0 && (
              <CommandGroup heading="Objecten">
                {results.map((r) => (
                  <CommandItem key={r.id} value={r.id} onSelect={() => { onChange(r.id, fmt(r)); setOpen(false); setQuery(""); }}>
                    <Check className={`mr-2 h-4 w-4 ${value === r.id ? "opacity-100" : "opacity-0"}`} />
                    <span className="flex-1 truncate">{fmt(r)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {query.trim() && !exact && (
              <CommandGroup>
                <CommandItem value={`__create__${query}`} onSelect={handleCreate} disabled={createObj.isPending}>
                  <Plus className="mr-2 h-4 w-4" /> Object "{query.trim()}" aanmaken
                </CommandItem>
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
