import { useCallback, useState } from "react";

export type AddressLookupResult = { street: string; city: string };

const PC_RE = /^[1-9][0-9]{3}[A-Z]{2}$/;

// PDOK/BAG Locatieserver — gratis, publiek, CORS-vriendelijk. Postcode + huisnummer → straat + plaats.
// Geen API-sleutel/edge nodig. Geeft null bij ongeldige invoer of geen match.
export function usePostcodeLookup() {
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (postcode: string, houseNumber: string): Promise<AddressLookupResult | null> => {
    const pc = postcode.replace(/\s+/g, "").toUpperCase();
    const huis = houseNumber.match(/\d+/)?.[0] ?? "";
    if (!PC_RE.test(pc) || !huis) return null;
    setLoading(true);
    try {
      const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&fl=straatnaam,woonplaatsnaam&fq=type:adres&fq=postcode:${pc}&fq=huisnummer:${huis}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      const doc = data?.response?.docs?.[0];
      if (!doc) return null;
      return { street: doc.straatnaam ?? "", city: doc.woonplaatsnaam ?? "" };
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { lookup, loading };
}
