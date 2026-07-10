import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

const num = (s: string | number) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Nederlandse decimaalkomma, zonder duizendtalpunten — die zou `num` weer als
// decimaalpunt teruglezen ("1.900" → 1,9). `decimals` vast zetten voor bedragen
// (€ 834,00), weglaten voor aantallen en uren (2, niet 2,00).
const toText = (n: number, decimals?: number) => (decimals == null ? String(n) : n.toFixed(decimals)).replace(".", ",");

/** Numeriek invoerveld dat lokaal typwerk (komma's, lege string) tolereert. */
export function NumField({
  value,
  onCommit,
  className,
  disabled,
  decimals,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  disabled?: boolean;
  decimals?: number;
}) {
  const [text, setText] = useState(toText(value, decimals));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(toText(value, decimals));
  }, [value, decimals]);
  return (
    <Input
      inputMode="decimal"
      className={className}
      value={text}
      disabled={disabled}
      onFocus={() => (editing.current = true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        editing.current = false;
        onCommit(num(text));
      }}
    />
  );
}
