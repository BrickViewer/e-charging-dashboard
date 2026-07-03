import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ClientDetailBody } from "@/components/admin/client/ClientDetailBody";

// Slide-over-variant van de klantdetail. Deelt de volledige inhoud (ClientDetailBody) met de
// route-pagina AdminClientDetail; alleen de "terug"-actie verschilt (sheet sluiten i.p.v. navigeren).
export function ClientDetailSheet({
  clientId,
  open,
  onOpenChange,
}: {
  clientId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-3xl">
        {/* De body rendert zijn eigen zichtbare titel (klantnaam); een verborgen SheetTitle houdt de dialog toegankelijk. */}
        <SheetTitle className="sr-only">Klantdetail</SheetTitle>
        {clientId && <ClientDetailBody clientId={clientId} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}
