// Canonieke objectnaam: «straat» «huisnr», «plaats» («objectnr»).
// Spiegel van de DB-functie app_private.build_object_label. display_name wordt
// server-side (trigger) afgeleid; deze helper is voor read-only weergave / optimistic UI.
export function buildObjectLabel(
  street: string | null | undefined,
  houseNumber: string | null | undefined,
  city: string | null | undefined,
  locationNumber: number | null | undefined,
): string {
  const sp = `${street ?? ""} ${houseNumber ?? ""}`.replace(/\s+/g, " ").trim();
  const c = (city ?? "").trim();
  const base = sp && c ? `${sp}, ${c}` : sp || c || "Object";
  return locationNumber != null ? `${base} (${locationNumber})` : base;
}

// Canonieke adresregel van een object/lead: «straat» «huisnr», «plaats» (huisnummer altijd
// inbegrepen, géén postcode — gelijk aan display_name zonder het objectnummer). Eén bron voor
// alle adresweergave; terugval op display_name als er geen adresdelen zijn.
export function formatObjectAddress(o: {
  address_street?: string | null;
  house_number?: string | null;
  city?: string | null;
  display_name?: string | null;
}): string {
  const base = buildObjectLabel(o.address_street, o.house_number, o.city, null);
  return base !== "Object" ? base : ((o.display_name ?? "").trim() || "Adres onbekend");
}
