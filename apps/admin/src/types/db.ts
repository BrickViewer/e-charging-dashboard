import type { Json, Tables } from "@/integrations/supabase/types";

export type ActivityLog = Tables<"activity_log">;
export type ChargePoint = Tables<"charge_points">;
export type ChargePointFault = Tables<"charge_point_faults">;
export type ChargePointFaultEvent = Tables<"charge_point_fault_events">;
export type ChargingSession = Tables<"charging_sessions">;
export type Client = Tables<"clients">;
export type Company = Tables<"companies">;
export type Person = Tables<"persons">;
export type ClientPaymentDetails = Tables<"client_payment_details">;
export type ClientInvitation = Tables<"client_invitations">;
export type EfluxSyncLog = Tables<"eflux_sync_log">;
export type Location = Tables<"locations">;
export type Notification = Tables<"notifications">;
export type Organization = Tables<"organizations">;
export type Profile = Tables<"profiles">;
export type Settlement = Tables<"settlements">;
/** @deprecated maandelijks model: gebruik Settlement. Alias voor compat. */
export type QuarterlySettlement = Settlement;

export type ClientInvitationSummary = Pick<
  ClientInvitation,
  | "id"
  | "client_id"
  | "email"
  | "status"
  | "invited_at"
  | "expires_at"
  | "accepted_at"
  | "invited_by"
  | "resend_count"
  | "last_resend_at"
  | "created_at"
>;

export type ClientWithRelations = Client & {
  companies?: Pick<Company, "id" | "name" | "kvk" | "city"> | null;
  persons?: Pick<Person, "id" | "full_name" | "email"> | null;
  locations?: LocationWithChargePoints[];
  client_invitations?: ClientInvitationSummary[];
  latest_invitation?: ClientInvitationSummary | null;
};

export type LocationWithChargePoints = Location & {
  charge_points?: ChargePoint[];
};

export type AdminLocation = Location & {
  charge_points?: Pick<ChargePoint, "id" | "status" | "connectivity_state" | "operational_status">[];
  clients?: Pick<Client, "id" | "client_number" | "company_name" | "status"> | null;
};

export type AdminLocationDetail = Location & {
  charge_points?: ChargePoint[];
  clients?: Pick<Client, "id" | "client_number" | "company_name" | "status" | "contact_name" | "contact_email"> | null;
};

export type AdminChargePoint = ChargePoint & {
  locations?: (Pick<Location, "name" | "address" | "client_id"> & {
    clients?: Pick<Client, "client_number" | "company_name"> | null;
  }) | null;
};

export type AdminSettlement = Settlement & {
  clients?: Pick<
    Client,
    | "client_number"
    | "company_name"
    | "payment_onboarding_status"
    | "kvk"
    | "btw_number"
  > | null;
};

export type PortalClient = Pick<
  Client,
  | "id"
  | "client_number"
  | "company_name"
  | "kvk"
  | "btw_number"
  | "contact_name"
  | "contact_email"
  | "contact_phone"
  | "billing_address"
  | "billing_address_street"
  | "billing_address_postal"
  | "billing_address_city"
  | "country"
  | "vat_status"
  | "vat_status_confirmed_at"
  | "onboarding_completed_at"
  | "contract_start_date"
  | "contract_duration_months"
  | "revenue_share_percentage"
  | "calculate_ere_enabled"
  | "status"
>;

export type PortalPaymentDetails = {
  client_id: string;
  invoice_email: string | null;
  payout_account_holder_name: string | null;
  payout_iban_masked: string | null;
  payout_iban_last4: string | null;
  payout_bic: string | null;
  account_holder_confirmed: boolean | null;
  status: string | null;
  updated_at: string | null;
};

export type AdminSession = ChargingSession & {
  clients?: Pick<Client, "client_number" | "company_name"> | null;
  charge_points?: Pick<ChargePoint, "name"> | null;
  locations?: Pick<Location, "name"> | null;
};

export type AdminActivity = ActivityLog & {
  clients?: Pick<Client, "client_number" | "company_name"> | null;
};

export type RecentInvitation = ClientInvitationSummary & {
  clients?: Pick<Client, "client_number" | "company_name"> | null;
};

export type CronJobStatus = {
  jobname?: string | null;
  schedule?: string | null;
  active?: boolean | null;
  last_run?: string | null;
  last_status?: string | null;
  [key: string]: Json | undefined;
};

export type PortalLocation = Pick<
  Location,
  | "id"
  | "name"
  | "address"
  | "city"
  | "postal_code"
  | "property_type"
  | "parking_spots"
  | "has_solar"
  | "solar_capacity_kwp"
> & {
  charge_points?: Pick<
    ChargePoint,
    "id" | "name" | "brand" | "model" | "type" | "status" | "max_power" | "num_connectors"
  >[];
};

// Netto-only sessie-rij zoals de get_portal_sessions RPC die teruggeeft.
// Bevat GEEN reimbursement_amount (bruto) — alleen het netto `vergoeding`-veld.
export type PortalSessionNet = {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  kwh_delivered: number | null;
  charge_point_id: string | null;
  charge_point_name: string | null;
  location_name: string | null;
  vergoeding: number | null;
};

// Netto-only: geen gross_revenue / echarging_fee_per_kwh / echarging_revenue.
// De klant ziet/ontvangt uitsluitend het netto (client_payout) + volumes.
export type PortalSettlement = Pick<
  Settlement,
  | "id"
  | "client_id"
  | "year"
  | "month"
  | "period_start"
  | "period_end"
  | "status"
  | "paid_at"
  | "eflux_reimbursed_at"
  | "invoice_sent_at"
  | "total_kwh"
  | "total_sessions"
  | "client_payout"
  | "activation_cost"
  | "vat_rate"
  | "vat_status"
  | "invoice_number"
>;
