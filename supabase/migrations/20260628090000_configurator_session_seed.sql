-- Demo → configurator: een demo zonder opgeslagen lead kan de configurator-sessie
-- voorvullen met de demo-schaal (palen/verbruik). configurator-session-start zet de
-- genormaliseerde PricingInput hierin; configurator-settings geeft 'm terug als
-- savedInput wanneer de sessie (nog) geen lead heeft. Service-role only (zoals de
-- rest van de sessie-flow); geen RLS-wijziging nodig.
ALTER TABLE public.configurator_sessions
  ADD COLUMN IF NOT EXISTS seed_config jsonb;
