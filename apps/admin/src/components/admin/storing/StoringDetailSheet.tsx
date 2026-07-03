import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StoringDetailBody } from "./StoringDetailBody";

// Slide-over variant van de storing-detailpagina. De body rendert zijn eigen
// header; de SheetTitle is enkel voor a11y (Radix vereist een titel) en visueel verborgen.
export function StoringDetailSheet({
  faultId,
  open,
  onOpenChange,
}: {
  faultId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="sr-only">
          <SheetTitle>Storing</SheetTitle>
        </SheetHeader>
        {faultId && <StoringDetailBody faultId={faultId} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}
