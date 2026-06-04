import { useEffect, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

// Normaliseer voor een tolerante vergelijking: trim, spaties samenvouwen, lowercase.
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Optioneel rood waarschuwingskader boven het invoerveld. */
  warning?: ReactNode;
  /** De tekst die de gebruiker exact (genormaliseerd) moet overtypen, bv. de bedrijfsnaam. */
  confirmationValue: string;
  /** Label boven het invoerveld; standaard "Typ {confirmationValue} om te bevestigen". */
  confirmationLabel?: ReactNode;
  /** Tekst op de bevestig-knop; standaard "Verwijderen". */
  confirmLabel?: string;
  isSubmitting?: boolean;
  /** Aangeroepen bij bevestiging; krijgt de exact getypte waarde mee (voor server-side checks). */
  onConfirm: (typedValue: string) => void;
}

/**
 * Herbruikbare bevestigingsdialoog voor destructieve acties: de gebruiker moet
 * een naam overtypen voordat de actie-knop activeert. Gebruikt door o.a. het
 * verwijderen van een klantprofiel en het ontkoppelen van een locatie.
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  warning,
  confirmationValue,
  confirmationLabel,
  confirmLabel = "Verwijderen",
  isSubmitting = false,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [value, setValue] = useState("");

  // Reset het invoerveld telkens als de dialoog (her)opent.
  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const matches =
    confirmationValue.trim().length > 0 && normalize(value) === normalize(confirmationValue);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {warning && (
            <div className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm">
              {warning}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="delete-confirm-input">
              {confirmationLabel ?? (
                <>
                  Typ <span className="font-medium text-foreground">{confirmationValue}</span> om te bevestigen *
                </>
              )}
            </Label>
            <Input
              id="delete-confirm-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={confirmationValue}
              autoComplete="off"
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Annuleren</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => onConfirm(value)}
            disabled={isSubmitting || !matches}
          >
            {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
