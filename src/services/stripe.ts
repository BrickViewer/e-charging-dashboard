import { supabase } from "@/integrations/supabase/client";

// V1: Supabase stubs — V2: replace with Stripe API calls

export async function createConnectedAccount(clientId: string) {
  return supabase
    .from('clients')
    .update({ stripe_onboarding_status: 'pending' })
    .eq('id', clientId);
}

export async function getOnboardingStatus(clientId: string) {
  const { data } = await supabase
    .from('clients')
    .select('stripe_onboarding_status, stripe_connected_account_id')
    .eq('id', clientId)
    .single();
  return data;
}

export async function createTransfer(params: {
  amount: number;
  destinationAccountId: string;
  description: string;
}) {
  // V1: noop, log only
  console.log('Transfer would be:', params);
  return { success: true, message: 'Beschikbaar na Stripe koppeling' };
}
