-- Assign admin role to Wessel
INSERT INTO user_roles (user_id, role)
VALUES ('896f50bf-a634-4609-b153-ce9dd2bc8aad', 'admin')
ON CONFLICT DO NOTHING;

-- Link profile to E-Charging organization
UPDATE profiles
SET organization_id = '00000000-0000-0000-0000-000000000001',
    full_name = 'Wessel Jonkers'
WHERE user_id = '896f50bf-a634-4609-b153-ce9dd2bc8aad';