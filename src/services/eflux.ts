import { supabase } from "@/integrations/supabase/client";

// V1: Supabase queries — V2: replace with Road.io API calls

export async function searchCPOSessions(params: {
  locationId?: string;
  evseControllerId?: string;
  clientId?: string;
  from?: string;
  to?: string;
  status?: 'ACTIVE' | 'COMPLETED';
  limit?: number;
  skip?: number;
}) {
  let query = supabase
    .from('charging_sessions')
    .select('*')
    .order('started_at', { ascending: false });

  if (params.clientId) query = query.eq('client_id', params.clientId);
  if (params.locationId) query = query.eq('location_id', params.locationId);
  if (params.from) query = query.gte('started_at', params.from);
  if (params.to) query = query.lte('started_at', params.to);
  if (params.limit) query = query.limit(params.limit);

  return query;
}

export async function searchEVSEControllers(params: {
  locationIds?: string[];
  connectivityStates?: string[];
  limit?: number;
}) {
  let query = supabase
    .from('charge_points')
    .select('*, locations(*)');

  if (params.connectivityStates) {
    query = query.in('connectivity_state', params.connectivityStates);
  }

  if (params.limit) query = query.limit(params.limit);

  return query;
}

export async function getChargePointsByClient(clientId: string) {
  return supabase
    .from('charge_points')
    .select('*, locations!inner(name, address, client_id)')
    .eq('locations.client_id', clientId);
}
