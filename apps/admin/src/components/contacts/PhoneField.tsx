import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { normalizePhone, formatPhone, isValidPhone } from "@/lib/phone";

// Herbruikbaar telefoonveld: toont het nummer internationaal gegroepeerd, normaliseert op blur
// naar E.164 en geeft dat via onChange terug. Accepteert elk nummer (mobiel/vast/internationaal);
// blokkeert nooit — bij een onwaarschijnlijk nummer verschijnt alleen een zachte hint.
export function PhoneField({ value, onChange, placeholder = "+31 6 12345678 of 06-12345678", disabled, id, className }: {
  value: string | null | undefined;
  onChange: (normalized: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const [text, setText] = useState(() => formatPhone(value) || (value ?? ""));

  // Externe wijziging (bv. prefill) overnemen.
  useEffect(() => { setText(formatPhone(value) || (value ?? "")); }, [value]);

  const commit = () => {
    const normalized = normalizePhone(text);
    onChange(normalized);
    setText(formatPhone(normalized) || (normalized ?? ""));
  };

  const showHint = text.trim() !== "" && !isValidPhone(text);

  return (
    <div className="space-y-1">
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        className={className}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
      {showHint && <p className="text-[11px] text-amber-600">Controleer het telefoonnummer.</p>}
    </div>
  );
}
