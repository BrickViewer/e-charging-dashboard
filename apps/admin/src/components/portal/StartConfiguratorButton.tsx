import { useState } from "react";
import { WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConfiguratorSource } from "@/contexts/demoConfiguratorSourceValue";

// "Start configurator" vanuit de demo: opent (in een nieuw venster) de configurator,
// voorgevuld met deze business case — bestaande lead heropenen of een verse sessie
// met de demo-schaal als seed. Vereist een ingelogde sales/admin/manager (de demo is
// publiek; bij niet-ingelogd toont 'ie een nette melding i.p.v. te crashen).
export function StartConfiguratorButton() {
  const source = useConfiguratorSource();
  const [busy, setBusy] = useState(false);

  if (!source || (!source.leadId && !source.seed)) return null;

  const start = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (source.leadId) body.lead_id = source.leadId;
      else if (source.seed) body.seed = source.seed;

      const { data, error } = await supabase.functions.invoke<{ url?: string }>(
        "configurator-session-start",
        { body },
      );
      if (error) throw error;
      const url = data?.url;
      if (!url) throw new Error("no-url");

      window.open(url, "_blank", "noopener,noreferrer,width=1400,height=900");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      if (/401|403|unauthorized|forbidden|jwt|authorization/i.test(msg)) {
        toast.error("Log eerst in als sales (admin/manager) om de configurator te starten.");
      } else {
        toast.error("Configurator starten mislukt. Probeer het opnieuw.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="portal-demo-start"
      onClick={start}
      disabled={busy}
      aria-label="Start configurator met deze business case"
    >
      <WandSparkles size={15} strokeWidth={1.6} />
      <span>{busy ? "Bezig…" : "Start configurator"}</span>
    </button>
  );
}
