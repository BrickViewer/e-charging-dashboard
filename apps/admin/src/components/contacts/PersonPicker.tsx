import { useState } from "react";
import { Check, ChevronsUpDown, Plus, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePersonSearch, useCreatePerson, useLinkPersonToCompany, splitName } from "@/hooks/useContacts";

export type PersonCreateDefaults = {
  email?: string | null;
  phone?: string | null;
  address?: { street?: string | null; houseNumber?: string | null; postalCode?: string | null; city?: string | null } | null;
};

export function PersonPicker({
  value,
  valueLabel,
  onChange,
  companyId,
  defaults,
  placeholder = "Kies of zoek persoon…",
}: {
  value: string | null;
  valueLabel?: string | null;
  onChange: (personId: string | null, person?: { id: string; full_name: string }) => void;
  /** Wanneer gezet: nieuw/gekozen persoon wordt aan dit bedrijf gekoppeld. */
  companyId?: string | null;
  /** Voorinvulling (bv. uit de lead) voor een NIEUW aangemaakte persoon — een debiteur
   *  zonder adres levert facturen zonder adresblok op. Bestaande personen blijven ongemoeid. */
  defaults?: PersonCreateDefaults;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 200);
  const search = usePersonSearch(debounced);
  const createPerson = useCreatePerson();
  const link = useLinkPersonToCompany();

  const results = search.data ?? [];
  const exact = results.some((p) => (p.full_name ?? "").toLowerCase() === debounced.trim().toLowerCase());

  const linkIfNeeded = async (personId: string) => {
    if (companyId) {
      try {
        await link.mutateAsync({ companyId, personId });
      } catch {
        /* koppeling is best-effort */
      }
    }
  };

  const handleSelect = async (p: { id: string; full_name: string | null }) => {
    await linkIfNeeded(p.id);
    onChange(p.id, { id: p.id, full_name: p.full_name ?? "" });
    setOpen(false);
    setQuery("");
  };

  const handleCreate = async () => {
    const full = query.trim();
    if (!full) return;
    try {
      const { first_name, last_name } = splitName(full);
      const created = await createPerson.mutateAsync({
        first_name,
        last_name,
        email: defaults?.email?.trim() || null,
        phone: defaults?.phone?.trim() || null,
        address_street: defaults?.address?.street?.trim() || null,
        house_number: defaults?.address?.houseNumber?.trim() || null,
        postal_code: defaults?.address?.postalCode?.trim() || null,
        city: defaults?.address?.city?.trim() || null,
      });
      await linkIfNeeded(created.id);
      onChange(created.id, { id: created.id, full_name: created.full_name ?? full });
      toast.success(`Persoon "${created.full_name || full}" aangemaakt`);
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
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={`truncate ${valueLabel || value ? "" : "text-muted-foreground"}`}>
              {valueLabel || (value ? "Persoon" : placeholder)}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Zoek persoon…" value={query} onValueChange={setQuery} />
          <CommandList>
            {results.length === 0 && !query.trim() && <CommandEmpty>Typ om te zoeken…</CommandEmpty>}
            {results.length > 0 && (
              <CommandGroup heading="Personen">
                {results.map((p) => (
                  <CommandItem key={p.id} value={p.id} onSelect={() => handleSelect(p)}>
                    <Check className={`mr-2 h-4 w-4 ${value === p.id ? "opacity-100" : "opacity-0"}`} />
                    <span className="flex-1 truncate">{p.full_name || "(naamloos)"}</span>
                    {p.email && <span className="ml-2 truncate text-xs text-muted-foreground">{p.email}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {query.trim() && !exact && (
              <CommandGroup>
                <CommandItem value={`__create__${query}`} onSelect={handleCreate} disabled={createPerson.isPending}>
                  <Plus className="mr-2 h-4 w-4" />
                  Persoon "{query.trim()}" aanmaken
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
