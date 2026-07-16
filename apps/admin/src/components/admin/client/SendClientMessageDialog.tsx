import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Staf stuurt een klant een bericht dat in het klantportaal (onder "Berichten") verschijnt én
// per e-mail binnenkomt. Eén edge-call (send-client-message) doet beide kanalen; klanten zonder
// portaalaccount krijgen alleen de e-mail. Spiegelt RejectQuoteDialog (compose → invoke → toast).
export function SendClientMessageDialog({
  clientId,
  clientName,
  hasPortalAccount,
  recipientEmail,
  open,
  onClose,
}: {
  clientId: string;
  clientName: string;
  hasPortalAccount: boolean;
  recipientEmail: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Zonder portaalaccount én zonder e-mailadres is er geen kanaal om af te leveren.
  const noChannel = !hasPortalAccount && !recipientEmail;

  const reset = () => { setSubject(""); setMessage(""); };
  const close = () => { if (!sending) { reset(); onClose(); } };

  const submit = async () => {
    if (!subject.trim()) { toast.error("Vul een onderwerp in"); return; }
    if (!message.trim()) { toast.error("Vul een bericht in"); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-client-message", {
        body: { client_id: clientId, subject: subject.trim(), message: message.trim() },
      });
      if (error) throw error;
      if (data?.status === "sent") {
        if (data.portal_delivered && data.email_delivered) {
          toast.success(`Bericht in het portaal geplaatst en gemaild naar ${data.to}`);
        } else if (data.portal_delivered && !data.email_delivered) {
          toast.warning("Bericht in het portaal geplaatst, maar de e-mail kon niet worden verstuurd");
        } else if (!data.portal_delivered && data.email_delivered) {
          toast.success(`Bericht gemaild naar ${data.to} (klant heeft nog geen portaalaccount)`);
        } else {
          toast.success("Bericht verstuurd");
        }
        queryClient.invalidateQueries({ queryKey: ["admin-client-activity", clientId] });
        queryClient.invalidateQueries({ queryKey: ["admin-client", clientId] });
        reset();
        onClose();
      } else if (data?.status === "not_configured") {
        toast.error("Resend nog niet geconfigureerd. Voeg RESEND_API_KEY toe in Supabase secrets.");
      } else {
        toast.error(data?.message || "Versturen mislukt");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Versturen mislukt");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bericht sturen aan {clientName}</DialogTitle>
          <DialogDescription>
            {hasPortalAccount ? (
              <>
                Dit bericht verschijnt in het klantportaal onder <strong>Berichten</strong>
                {recipientEmail ? <> en wordt gemaild naar <strong>{recipientEmail}</strong></> : null}.
              </>
            ) : recipientEmail ? (
              <>
                De klant heeft nog geen portaalaccount — het bericht wordt <strong>alleen gemaild</strong> naar{" "}
                <strong>{recipientEmail}</strong>.
              </>
            ) : (
              <>Deze klant heeft geen e-mailadres en geen portaalaccount, dus er is geen manier om het bericht af te leveren.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Onderwerp *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Bijv. Onderhoud aan je laadpaal"
              maxLength={150}
              disabled={noChannel}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bericht *</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              placeholder="Typ hier je bericht aan de klant…"
              disabled={noChannel}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={sending}>Annuleren</Button>
          <Button onClick={submit} disabled={sending || noChannel || !subject.trim() || !message.trim()}>
            <Mail className="w-4 h-4 mr-1.5" />
            {sending ? "Versturen…" : "Versturen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
