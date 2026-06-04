-- Configurator foundation: settings, short-lived sessions, autosave drafts and versioned customer configurations.

CREATE TABLE IF NOT EXISTS public.configurator_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  settings jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT configurator_settings_version_positive CHECK (version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS configurator_settings_active_per_org_idx
  ON public.configurator_settings (organization_id)
  WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS configurator_settings_org_version_idx
  ON public.configurator_settings (organization_id, version);

CREATE TABLE IF NOT EXISTS public.configurator_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scopes text[] NOT NULL DEFAULT ARRAY['configurator:write', 'customer:create'],
  status text NOT NULL DEFAULT 'active',
  settings_id uuid NOT NULL REFERENCES public.configurator_settings(id),
  settings_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT configurator_sessions_status_check CHECK (status IN ('active', 'finalized', 'expired', 'revoked'))
);

CREATE INDEX IF NOT EXISTS configurator_sessions_actor_idx
  ON public.configurator_sessions (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS configurator_sessions_expiry_idx
  ON public.configurator_sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.configurator_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.configurator_sessions(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step integer NOT NULL DEFAULT 1,
  draft jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT configurator_drafts_step_check CHECK (current_step BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS configurator_drafts_session_idx
  ON public.configurator_drafts (session_id);

CREATE TABLE IF NOT EXISTS public.customer_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  settings_version integer NOT NULL,
  pricing_input jsonb NOT NULL,
  pricing_result jsonb NOT NULL,
  source_session_id uuid REFERENCES public.configurator_sessions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'agreed',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_configurations_version_positive CHECK (version > 0),
  CONSTRAINT customer_configurations_status_check CHECK (status IN ('draft', 'agreed', 'superseded', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_configurations_client_version_idx
  ON public.customer_configurations (client_id, version);

ALTER TABLE public.configurator_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configurator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configurator_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal read configurator settings" ON public.configurator_settings;
CREATE POLICY "Internal read configurator settings"
  ON public.configurator_settings FOR SELECT
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin manage configurator settings" ON public.configurator_settings;
CREATE POLICY "Admin manage configurator settings"
  ON public.configurator_settings FOR ALL
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Configurator sessions owned by actor" ON public.configurator_sessions;
CREATE POLICY "Configurator sessions owned by actor"
  ON public.configurator_sessions FOR SELECT
  USING (
    actor_user_id = auth.uid()
    AND (
      app_private.has_role(auth.uid(), 'admin'::public.app_role)
      OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Configurator sessions created by internal" ON public.configurator_sessions;
CREATE POLICY "Configurator sessions created by internal"
  ON public.configurator_sessions FOR INSERT
  WITH CHECK (
    actor_user_id = auth.uid()
    AND (
      app_private.has_role(auth.uid(), 'admin'::public.app_role)
      OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Configurator drafts owned by actor" ON public.configurator_drafts;
CREATE POLICY "Configurator drafts owned by actor"
  ON public.configurator_drafts FOR SELECT
  USING (
    actor_user_id = auth.uid()
    AND (
      app_private.has_role(auth.uid(), 'admin'::public.app_role)
      OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Internal read customer configurations" ON public.customer_configurations;
CREATE POLICY "Internal read customer configurations"
  ON public.customer_configurations FOR SELECT
  USING (app_private.is_internal(auth.uid()));

DROP POLICY IF EXISTS "Admin manager manage customer configurations" ON public.customer_configurations;
CREATE POLICY "Admin manager manage customer configurations"
  ON public.customer_configurations FOR ALL
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

INSERT INTO public.configurator_settings (organization_id, version, settings, is_active)
SELECT
  o.id,
  1,
  '{
    "baseTargetNetEchargingPerChargePointMonth": 20,
    "maxServiceFeePct": 0.4,
    "useTieredTarget": true,
    "tiers": [
      {"minNetReturnPerChargePointMonth": 0, "maxNetReturnPerChargePointMonth": 75, "targetNetEchargingPerChargePointMonth": 20},
      {"minNetReturnPerChargePointMonth": 75, "maxNetReturnPerChargePointMonth": 150, "targetNetEchargingPerChargePointMonth": 30},
      {"minNetReturnPerChargePointMonth": 150, "maxNetReturnPerChargePointMonth": 250, "targetNetEchargingPerChargePointMonth": 40},
      {"minNetReturnPerChargePointMonth": 250, "maxNetReturnPerChargePointMonth": 400, "targetNetEchargingPerChargePointMonth": 55},
      {"minNetReturnPerChargePointMonth": 400, "maxNetReturnPerChargePointMonth": 600, "targetNetEchargingPerChargePointMonth": 70},
      {"minNetReturnPerChargePointMonth": 600, "maxNetReturnPerChargePointMonth": null, "targetNetEchargingPerChargePointMonth": 85}
    ],
    "efluxSubscriptionPerSocketMonth": 5.5,
    "efluxSetupPerSocket": 16.5,
    "efluxSetupAmortizationMonths": 12,
    "defaultContractDurationMonths": 12,
    "defaultNoticePeriodMonths": 3,
    "defaultChargeTariffPerKwh": 0.58,
    "defaultEnergyCostPerKwh": 0.25,
    "defaultStartFeeEnabled": true,
    "defaultStartFeePerSession": 0.5,
    "defaultIdleFeeEnabled": true,
    "defaultIdleFeePerMinute": 0.05,
    "defaultIdleGraceMinutes": 60,
    "locationTypeDefaults": {
      "workplace": {"sessionsPerChargePointMonth": 12, "kwhPerChargePointMonth": 200, "averageSessionDurationHours": 6, "effectiveChargingPowerKw": 8},
      "destination": {"sessionsPerChargePointMonth": 35, "kwhPerChargePointMonth": 420, "averageSessionDurationHours": 2.5, "effectiveChargingPowerKw": 10},
      "fleet": {"sessionsPerChargePointMonth": 24, "kwhPerChargePointMonth": 650, "averageSessionDurationHours": 8, "effectiveChargingPowerKw": 11},
      "public": {"sessionsPerChargePointMonth": 50, "kwhPerChargePointMonth": 520, "averageSessionDurationHours": 1.8, "effectiveChargingPowerKw": 11},
      "other": {"sessionsPerChargePointMonth": 12, "kwhPerChargePointMonth": 200, "averageSessionDurationHours": 6, "effectiveChargingPowerKw": 8}
    }
  }'::jsonb,
  true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.configurator_settings cs
  WHERE cs.organization_id = o.id
);
