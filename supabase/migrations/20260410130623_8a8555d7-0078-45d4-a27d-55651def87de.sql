
-- Clean up orphan records before adding constraints
DELETE FROM locations WHERE client_id NOT IN (SELECT id FROM clients);
DELETE FROM charge_points WHERE location_id NOT IN (SELECT id FROM locations);
DELETE FROM charging_sessions WHERE client_id NOT IN (SELECT id FROM clients);
DELETE FROM charging_sessions WHERE location_id NOT IN (SELECT id FROM locations);
DELETE FROM charging_sessions WHERE charge_point_id NOT IN (SELECT id FROM charge_points);
DELETE FROM monthly_settlements WHERE client_id NOT IN (SELECT id FROM clients);
DELETE FROM quotes WHERE organization_id NOT IN (SELECT id FROM organizations);
DELETE FROM quotes WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM clients);
DELETE FROM activity_log WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM clients);
DELETE FROM activity_log WHERE organization_id IS NOT NULL AND organization_id NOT IN (SELECT id FROM organizations);
DELETE FROM profiles WHERE organization_id IS NOT NULL AND organization_id NOT IN (SELECT id FROM organizations);
DELETE FROM tariff_profiles WHERE client_id NOT IN (SELECT id FROM clients);
DELETE FROM tariff_profiles WHERE location_id IS NOT NULL AND location_id NOT IN (SELECT id FROM locations);

-- Add foreign key constraints (skip if already exists)
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clients ADD CONSTRAINT clients_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE locations ADD CONSTRAINT locations_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE charge_points ADD CONSTRAINT charge_points_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE charging_sessions ADD CONSTRAINT charging_sessions_charge_point_id_fkey FOREIGN KEY (charge_point_id) REFERENCES charge_points(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE charging_sessions ADD CONSTRAINT charging_sessions_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE charging_sessions ADD CONSTRAINT charging_sessions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE monthly_settlements ADD CONSTRAINT monthly_settlements_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE quotes ADD CONSTRAINT quotes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE quotes ADD CONSTRAINT quotes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE activity_log ADD CONSTRAINT activity_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE activity_log ADD CONSTRAINT activity_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tariff_profiles ADD CONSTRAINT tariff_profiles_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tariff_profiles ADD CONSTRAINT tariff_profiles_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
