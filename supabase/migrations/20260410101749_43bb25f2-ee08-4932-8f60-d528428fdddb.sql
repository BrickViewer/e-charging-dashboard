
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'viewer');

-- Organizations
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kvk text,
  address text,
  phone text,
  email text,
  stripe_account_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- User roles table (separate from profiles per security best practice)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper: check if user is internal (has any role)
CREATE OR REPLACE FUNCTION public.is_internal(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
$$;

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  organization_id uuid REFERENCES public.organizations(id),
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Clients
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) NOT NULL,
  company_name text NOT NULL,
  kvk text,
  contact_name text,
  contact_email text,
  contact_phone text,
  billing_address text,
  stripe_connected_account_id text,
  stripe_onboarding_status text DEFAULT 'pending' CHECK (stripe_onboarding_status IN ('pending', 'complete', 'restricted')),
  contract_start_date date,
  contract_duration_months integer DEFAULT 36,
  revenue_share_percentage numeric DEFAULT 50,
  status text DEFAULT 'prospect' CHECK (status IN ('prospect', 'offerte', 'getekend', 'actief', 'inactief')),
  notes text,
  portal_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Locations
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name text,
  address text,
  city text,
  postal_code text,
  property_type text DEFAULT 'kantoor' CHECK (property_type IN ('kantoor', 'retail', 'zorg', 'wonen', 'bedrijfsverzamelgebouw', 'overig')),
  parking_spots integer,
  grid_connection_amps integer,
  ean_code text,
  has_solar boolean DEFAULT false,
  solar_capacity_kwp numeric,
  eflux_location_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Charge Points
CREATE TABLE public.charge_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  name text,
  type text DEFAULT 'ac_11' CHECK (type IN ('ac_11', 'ac_22', 'dc')),
  brand text,
  model text,
  has_mid_meter boolean DEFAULT true,
  eflux_evse_id text,
  status text DEFAULT 'online' CHECK (status IN ('online', 'offline', 'in_use', 'error', 'installation_pending')),
  monthly_platform_cost numeric DEFAULT 5.50,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.charge_points ENABLE ROW LEVEL SECURITY;

-- Tariff Profiles
CREATE TABLE public.tariff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  charge_rate_per_kwh numeric DEFAULT 0.45,
  energy_cost_per_kwh numeric DEFAULT 0.25,
  ere_rate_per_kwh numeric DEFAULT 0.10,
  valid_from date DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tariff_profiles ENABLE ROW LEVEL SECURITY;

-- Charging Sessions
CREATE TABLE public.charging_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id uuid REFERENCES public.charge_points(id) ON DELETE CASCADE NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  eflux_session_id text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  kwh_delivered numeric DEFAULT 0,
  duration_minutes integer DEFAULT 0,
  gross_revenue numeric DEFAULT 0,
  energy_cost numeric DEFAULT 0,
  net_margin numeric DEFAULT 0,
  client_share numeric DEFAULT 0,
  echarging_share numeric DEFAULT 0,
  ere_estimate numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.charging_sessions ENABLE ROW LEVEL SECURITY;

-- Monthly Settlements
CREATE TABLE public.monthly_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  month date NOT NULL,
  total_kwh numeric DEFAULT 0,
  total_sessions integer DEFAULT 0,
  gross_revenue numeric DEFAULT 0,
  total_energy_cost numeric DEFAULT 0,
  total_platform_cost numeric DEFAULT 0,
  net_margin numeric DEFAULT 0,
  client_payout numeric DEFAULT 0,
  echarging_revenue numeric DEFAULT 0,
  ere_estimate numeric DEFAULT 0,
  stripe_transfer_id text,
  status text DEFAULT 'calculated' CHECK (status IN ('calculated', 'approved', 'paid', 'overdue')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.monthly_settlements ENABLE ROW LEVEL SECURITY;

-- Quotes
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id),
  organization_id uuid REFERENCES public.organizations(id) NOT NULL,
  prospect_company text,
  prospect_contact text,
  prospect_email text,
  quote_number text,
  locations_data jsonb,
  tariff_data jsonb,
  calculation_data jsonb,
  total_hardware_cost numeric DEFAULT 0,
  total_installation_cost numeric DEFAULT 0,
  monthly_projection jsonb,
  valid_until date,
  status text DEFAULT 'concept' CHECK (status IN ('concept', 'verstuurd', 'getekend', 'verlopen', 'afgewezen')),
  signed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text,
  title text,
  message text,
  read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Activity Log
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  action text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: get client_id for portal user
CREATE OR REPLACE FUNCTION public.get_client_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE portal_user_id = _user_id LIMIT 1
$$;

-- ==================
-- RLS POLICIES
-- ==================

-- Organizations: internal users can read their org
CREATE POLICY "Internal users can view their org" ON public.organizations
  FOR SELECT USING (public.is_internal(auth.uid()));
CREATE POLICY "Admins can manage orgs" ON public.organizations
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- User roles: only admins can manage
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Internal users can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_internal(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage profiles" ON public.profiles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Clients: internal see all, portal user sees own
CREATE POLICY "Internal users can view all clients" ON public.clients
  FOR SELECT USING (public.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own client" ON public.clients
  FOR SELECT USING (portal_user_id = auth.uid());
CREATE POLICY "Admins and managers can manage clients" ON public.clients
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Locations
CREATE POLICY "Internal users can view all locations" ON public.locations
  FOR SELECT USING (public.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own locations" ON public.locations
  FOR SELECT USING (client_id = public.get_client_id_for_user(auth.uid()));
CREATE POLICY "Admins and managers can manage locations" ON public.locations
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Charge Points
CREATE POLICY "Internal users can view all charge points" ON public.charge_points
  FOR SELECT USING (public.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own charge points" ON public.charge_points
  FOR SELECT USING (
    location_id IN (SELECT id FROM public.locations WHERE client_id = public.get_client_id_for_user(auth.uid()))
  );
CREATE POLICY "Admins and managers can manage charge points" ON public.charge_points
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Tariff Profiles
CREATE POLICY "Internal users can view all tariffs" ON public.tariff_profiles
  FOR SELECT USING (public.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own tariffs" ON public.tariff_profiles
  FOR SELECT USING (client_id = public.get_client_id_for_user(auth.uid()));
CREATE POLICY "Admins and managers can manage tariffs" ON public.tariff_profiles
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Charging Sessions
CREATE POLICY "Internal users can view all sessions" ON public.charging_sessions
  FOR SELECT USING (public.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own sessions" ON public.charging_sessions
  FOR SELECT USING (client_id = public.get_client_id_for_user(auth.uid()));
CREATE POLICY "Admins and managers can manage sessions" ON public.charging_sessions
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Monthly Settlements
CREATE POLICY "Internal users can view all settlements" ON public.monthly_settlements
  FOR SELECT USING (public.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own settlements" ON public.monthly_settlements
  FOR SELECT USING (client_id = public.get_client_id_for_user(auth.uid()));
CREATE POLICY "Admins and managers can manage settlements" ON public.monthly_settlements
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Quotes
CREATE POLICY "Internal users can view all quotes" ON public.quotes
  FOR SELECT USING (public.is_internal(auth.uid()));
CREATE POLICY "Admins and managers can manage quotes" ON public.quotes
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid());
CREATE POLICY "Internal users can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (public.is_internal(auth.uid()));

-- Activity Log
CREATE POLICY "Internal users can view activity log" ON public.activity_log
  FOR SELECT USING (public.is_internal(auth.uid()));
CREATE POLICY "Internal users can create log entries" ON public.activity_log
  FOR INSERT WITH CHECK (public.is_internal(auth.uid()));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
