import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LocationDetailBody } from "./LocationDetailBody";

// Locatie-detail als slide-over. Deelt de body 1:1 met de route (AdminLocationDetail).
export function LocationDetailSheet({
  locationId,
  open,
  onOpenChange,
}: {
  locationId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-3xl">
        {/* De body toont zelf een <h1>; deze titel is puur voor screenreaders (Radix vereist een SheetTitle). */}
        <SheetTitle className="sr-only">Locatiedetails</SheetTitle>
        {locationId && (
          <LocationDetailBody locationId={locationId} onClose={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}
