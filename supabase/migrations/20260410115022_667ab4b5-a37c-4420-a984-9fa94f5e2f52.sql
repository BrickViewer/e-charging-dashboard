
-- =============================================
-- Batch 1: Schema extensions for admin panel
-- =============================================

-- 1. ORGANIZATIONS: add default settings columns
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS default_charge_rate_per_kwh NUMERIC DEFAULT 0.45,
  ADD COLUMN IF NOT EXISTS default_energy_cost_per_kwh NUMERIC DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS default_revenue_share_pct NUMERIC DEFAULT 50,
  ADD COLUMN IF NOT EXISTS default_ere_rate_per_kwh NUMERIC DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS default_eflux_cost_ac NUMERIC DEFAULT 5.50,
  ADD COLUMN IF NOT EXISTS default_eflux_cost_dc NUMERIC DEFAULT 10.40,
  ADD COLUMN IF NOT EXISTS eflux_api_key TEXT,
  ADD COLUMN IF NOT EXISTS stripe_secret_key TEXT,
  ADD COLUMN IF NOT EXISTS stripe_publishable_key TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. CLIENTS: add billing address split + tariff overrides
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_address_street TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_postal TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_city TEXT,
  ADD COLUMN IF NOT EXISTS charge_rate_per_kwh NUMERIC DEFAULT 0.45,
  ADD COLUMN IF NOT EXISTS energy_cost_per_kwh NUMERIC DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS ere_rate_per_kwh NUMERIC DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS monthly_platform_surcharge NUMERIC DEFAULT 0;

-- Update stripe_onboarding_status constraint to include 'not_started'
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_stripe_onboarding_status_check;
ALTER TABLE clients ADD CONSTRAINT clients_stripe_onboarding_status_check
  CHECK (stripe_onboarding_status IN ('not_started', 'pending', 'complete', 'restricted'));

-- Update status constraint to include all statuses
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE clients ADD CONSTRAINT clients_status_check
  CHECK (status IN ('prospect', 'offerte', 'getekend', 'actief', 'inactief'));

-- 3. CHARGE_POINTS: add connectivity + hardware columns
ALTER TABLE charge_points
  ADD COLUMN IF NOT EXISTS serial_number TEXT,
  ADD COLUMN IF NOT EXISTS eflux_evse_controller_id TEXT,
  ADD COLUMN IF NOT EXISTS connectivity_state TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS num_connectors INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_power NUMERIC,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE charge_points DROP CONSTRAINT IF EXISTS charge_points_connectivity_state_check;
ALTER TABLE charge_points ADD CONSTRAINT charge_points_connectivity_state_check
  CHECK (connectivity_state IN ('connected', 'maybe-connected', 'disconnected', 'access-denied', 'unknown', 'pending-first-connection'));

-- 4. CHARGING_SESSIONS: add e-Flux compatible columns
ALTER TABLE charging_sessions
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS external_calculated_price NUMERIC,
  ADD COLUMN IF NOT EXISTS energy_costs NUMERIC,
  ADD COLUMN IF NOT EXISTS time_costs NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_costs NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idle_costs NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_price NUMERIC,
  ADD COLUMN IF NOT EXISTS power_type TEXT,
  ADD COLUMN IF NOT EXISTS connector_id TEXT,
  ADD COLUMN IF NOT EXISTS excluded BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE charging_sessions DROP CONSTRAINT IF EXISTS charging_sessions_status_check;
ALTER TABLE charging_sessions ADD CONSTRAINT charging_sessions_status_check
  CHECK (status IN ('ACTIVE', 'COMPLETED'));

ALTER TABLE charging_sessions DROP CONSTRAINT IF EXISTS charging_sessions_power_type_check;
ALTER TABLE charging_sessions ADD CONSTRAINT charging_sessions_power_type_check
  CHECK (power_type IS NULL OR power_type IN ('ac', 'dc'));

-- 5. QUOTES: add calculator fields
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS num_charge_points INTEGER,
  ADD COLUMN IF NOT EXISTS charge_point_type TEXT,
  ADD COLUMN IF NOT EXISTS estimated_kwh_per_point NUMERIC,
  ADD COLUMN IF NOT EXISTS charge_rate_per_kwh NUMERIC,
  ADD COLUMN IF NOT EXISTS energy_cost_per_kwh NUMERIC,
  ADD COLUMN IF NOT EXISTS revenue_share_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS ere_rate_per_kwh NUMERIC,
  ADD COLUMN IF NOT EXISTS has_solar BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS solar_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS calculation_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update quotes status constraint
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('concept', 'verstuurd', 'getekend', 'verlopen', 'afgewezen'));

-- 6. LOCATIONS: add geo + updated_at
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 7. ACTIVITY_LOG: add description + metadata
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 8. NEW TABLE: eflux_sync_log
CREATE TABLE IF NOT EXISTS eflux_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  records_synced INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE eflux_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view sync logs" ON eflux_sync_log
  FOR SELECT USING (is_internal(auth.uid()));

CREATE POLICY "Internal users can manage sync logs" ON eflux_sync_log
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 9. Updated_at triggers for new columns
CREATE OR REPLACE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_charge_points_updated_at
  BEFORE UPDATE ON charge_points
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_charging_sessions_updated_at
  BEFORE UPDATE ON charging_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
