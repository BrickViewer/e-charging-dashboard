import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useCompanySearch, useCreateCompany } from "@/hooks/useContacts";

export function CompanyPicker({
  value,
  valueLabel,
  onChange,
  placeholder = "Kies of zoek bedrijf…",
}: {
  value: string | null;
  valueLabel?: string | null;
  onChange: (companyId: string | null, company?: { id: string; name: string }) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 200);
  const search = useCompanySearch(debounced);
  const createCompany = useCreateCompany();

  const results = search.data ?? [];
  const exact = results.some((c) => c.name.toLowerCase() === debounced.trim().toLowerCase());

  const handleCreate = async () => {
    const name = query.trim();
    if (!name) return;
    try {
      const created = await createCompany.mutateAsync({ name });
      onChange(created.id, { id: created.id, name: created.name });
      toast.success(`Bedrijf "${created.name}" aangemaakt`);
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
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={`truncate ${valueLabel || value ? "" : "text-muted-foreground"}`}>
              {valueLabel || (value ? "Bedrijf" : placeholder)}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Zoek bedrijf…" value={query} onValueChange={setQuery} />
          <CommandList>
            {results.length === 0 && !query.trim() && <CommandEmpty>Typ om te zoeken…</CommandEmpty>}
            {results.length > 0 && (
              <CommandGroup heading="Bedrijven">
                {results.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onChange(c.id, { id: c.id, name: c.name });
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === c.id ? "opacity-100" : "opacity-0"}`} />
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.city && <span className="ml-2 text-xs text-muted-foreground">{c.city}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {query.trim() && !exact && (
              <CommandGroup>
                <CommandItem value={`__create__${query}`} onSelect={handleCreate} disabled={createCompany.isPending}>
                  <Plus className="mr-2 h-4 w-4" />
                  Bedrijf "{query.trim()}" aanmaken
                </CommandItem>
              </CommandGroup>
            )}
            {value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                    setQuery("");
                  }}
                >
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
