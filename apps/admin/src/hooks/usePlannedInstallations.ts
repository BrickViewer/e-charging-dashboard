// Geplande installaties voor de agenda: installatie-opdrachten met een plandatum
// die nog niet opgeleverd/gefactureerd zijn, met de omzet (eenmalige commerciële
// offerteprijs) erbij zodat de directie per dag ziet hoeveel er verdiend wordt.
//
// Zelfde definitie als summarizeOnboarding().planned in services/onboardingOverview.ts
// (plandatum + niet opgeleverd + niet gefactureerd); deze variant bestaat apart omdat
// de agenda óók de offertebedragen nodig heeft én terugkijkt in de tijd. Wijzig je de
// ene, wijzig dan de andere mee. invalidateOnboarding() ververst deze query.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlannedInstallation {
  id: string;
  /** Geplande installatiedatum (YYYY-MM-DD). */
  date: string;
  name: string;
  /** Eenmalige omzet: hardware + installatie uit de offerte. */
  revenue: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickName(row: any): string {
  const client = row.clients?.company_name as string | undefined;
  const lead = row.leads?.company_name as string | undefined;
  const q = row.quotes ?? {};
  return (
    client?.trim() || lead?.trim() || (q.prospect_company as string | undefined)?.trim() ||
    (q.prospect_contact as string | undefined)?.trim() || (row.leads?.contact_name as string | undefined)?.trim() || "Onbekend"
  );
}

export function usePlannedInstallations() {
  return useQuery({
    queryKey: ["planned-installations"],
    queryFn: async (): Promise<PlannedInstallation[]> => {
      const { data, error } = await supabase
        .from("installation_orders")
        .select("id, scheduled_date, clients(company_name), leads(company_name, contact_name), quotes(total_installation_cost, total_hardware_cost, prospect_company, prospect_contact)")
        .not("scheduled_date", "is", null)
        .is("completed_at", null)
        .is("invoiced_at", null);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((row) => {
        const q = row.quotes ?? {};
        const revenue = (Number(q.total_installation_cost) || 0) + (Number(q.total_hardware_cost) || 0);
        return { id: row.id as string, date: row.scheduled_date as string, name: pickName(row), revenue };
      });
    },
  });
}
