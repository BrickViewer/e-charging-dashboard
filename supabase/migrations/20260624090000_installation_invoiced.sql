-- Onboarding-pijplijn: "gefactureerd"-stap na oplevering. Markeer-als-gefactureerd
-- zet invoiced_at; de kaart schuift dan door naar 'Locaties koppelen'.
alter table public.installation_orders add column if not exists invoiced_at timestamptz;
