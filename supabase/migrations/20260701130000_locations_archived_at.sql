-- Locaties die in e-Flux/Road zijn verwijderd (of geen laadpunt meer hebben) worden door
-- eflux-reconcile-locations gemarkeerd met archived_at i.p.v. blijven staan. NULL = actief/zichtbaar.
-- Precedent: customer_configurations.archived_at.
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Ondersteunt de "alleen actieve locaties"-lijstquery's.
CREATE INDEX IF NOT EXISTS idx_locations_active ON public.locations (id) WHERE archived_at IS NULL;
