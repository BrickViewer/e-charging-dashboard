import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { usePostcodeLookup } from "@/hooks/usePostcodeLookup";
import { splitHouse, combineHouse } from "@/lib/houseNumber";

export type AddressValue = { street: string; houseNumber: string; postalCode: string; city: string };

const PC_RE = /^[1-9][0-9]{3}[A-Z]{2}$/;

// Herbruikbaar adresblok met automatische straat/plaats-invulling op basis van postcode + huisnummer (PDOK).
// Velden blijven handmatig bewerkbaar. Gebruikt op bedrijf, persoon én object.
// Huisnummer is in de UI gesplitst in nummer + toevoeging, maar wordt als één string (`houseNumber`) doorgegeven.
export function AddressFields({ value, onChange, disabled }: {
  value: AddressValue;
  onChange: (patch: Partial<AddressValue>) => void;
  disabled?: boolean;
}) {
  const { lookup, loading } = usePostcodeLookup();
  const lastKey = useRef("");

  useEffect(() => {
    const pc = value.postalCode.replace(/\s+/g, "").toUpperCase();
    const huis = value.houseNumber.match(/\d+/)?.[0] ?? "";
    if (!PC_RE.test(pc) || !huis) return;
    const key = `${pc}|${huis}`;
    if (key === lastKey.current) return;
    const t = setTimeout(async () => {
      const r = await lookup(value.postalCode, value.houseNumber);
      if (r && (r.street || r.city)) {
        lastKey.current = key;
        onChange({ street: r.street, city: r.city });
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.postalCode, value.houseNumber]);

  const { number: houseNo, addition } = splitHouse(value.houseNumber);
  const setHouse = (num: string, add: string) => onChange({ houseNumber: combineHouse(num, add) });

  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <Field label="Postcode" className="sm:col-span-2">
        <Input value={value.postalCode} disabled={disabled} placeholder="1234 AB" onChange={(e) => onChange({ postalCode: e.target.value })} />
      </Field>
      <Field label="Huisnummer" className="sm:col-span-2">
        <Input value={houseNo} disabled={disabled} placeholder="10-14" onChange={(e) => setHouse(e.target.value, addition)} />
      </Field>
      <Field label="Toevoeging" className="sm:col-span-2">
        <Input value={addition} disabled={disabled} placeholder="A" onChange={(e) => setHouse(houseNo, e.target.value)} />
      </Field>
      <Field label={<>Straat{loading && <Loader2 className="h-3 w-3 animate-spin" />}</>} className="sm:col-span-4">
        <Input value={value.street} disabled={disabled} onChange={(e) => onChange({ street: e.target.value })} />
      </Field>
      <Field label="Plaats" className="sm:col-span-2">
        <Input value={value.city} disabled={disabled} onChange={(e) => onChange({ city: e.target.value })} />
      </Field>
    </div>
  );
}

function Field({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="flex h-4 items-center gap-1.5 text-xs">{label}</Label>
      {children}
    </div>
  );
}
