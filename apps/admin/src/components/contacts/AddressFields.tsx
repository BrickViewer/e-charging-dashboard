import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { usePostcodeLookup } from "@/hooks/usePostcodeLookup";

export type AddressValue = { street: string; houseNumber: string; postalCode: string; city: string };

const PC_RE = /^[1-9][0-9]{3}[A-Z]{2}$/;

// Herbruikbaar adresblok met automatische straat/plaats-invulling op basis van postcode + huisnummer (PDOK).
// Velden blijven handmatig bewerkbaar. Gebruikt op bedrijf, persoon én object.
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

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Postcode">
        <Input value={value.postalCode} disabled={disabled} placeholder="1234 AB" onChange={(e) => onChange({ postalCode: e.target.value })} />
      </Field>
      <Field label="Huisnummer">
        <Input value={value.houseNumber} disabled={disabled} onChange={(e) => onChange({ houseNumber: e.target.value })} />
      </Field>
      <Field label={<span className="flex items-center gap-1.5">Straat{loading && <Loader2 className="h-3 w-3 animate-spin" />}</span>}>
        <Input value={value.street} disabled={disabled} onChange={(e) => onChange({ street: e.target.value })} />
      </Field>
      <Field label="Plaats">
        <Input value={value.city} disabled={disabled} onChange={(e) => onChange({ city: e.target.value })} />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
