ALTER TABLE locations ALTER COLUMN client_id DROP NOT NULL;

CREATE POLICY "Internal users can view unlinked locations" ON locations
  FOR SELECT USING (
    client_id IS NULL AND is_internal(auth.uid())
  );