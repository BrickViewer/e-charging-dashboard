
-- Create organization
INSERT INTO public.organizations (id, name, kvk, address, phone, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'E-Charging BV', '12345678', 'Stationsplein 1, Eindhoven', '040-1234567', 'info@e-charging.nl');

-- Create 3 active clients + 1 prospect
INSERT INTO public.clients (id, organization_id, company_name, kvk, contact_name, contact_email, contact_phone, billing_address, contract_start_date, contract_duration_months, revenue_share_percentage, status)
VALUES
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Van der Berg Vastgoed BV', '87654321', 'Peter van der Berg', 'peter@vanderberg.nl', '06-12345678', 'Fellenoord 15, Eindhoven', '2025-04-01', 36, 50, 'actief'),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Zorggroep Brabant', '11223344', 'Maria Jansen', 'maria@zorggroepbrabant.nl', '06-87654321', 'Helmond Centrum 5, Helmond', '2025-08-01', 36, 50, 'actief'),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Parkstad Retail BV', '55667788', 'Jan de Vries', 'jan@parkstadretail.nl', '06-11223344', 'Promenade 22, Heerlen', '2026-01-01', 36, 50, 'actief'),
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Hendriksen Properties', '99887766', 'Tom Hendriksen', 'tom@hendriksen.nl', '06-99887766', 'Spoorlaan 10, Tilburg', NULL, 36, 50, 'offerte');

-- Locations
INSERT INTO public.locations (id, client_id, name, address, city, postal_code, property_type, parking_spots, grid_connection_amps, ean_code, has_solar) VALUES
('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Kantoor Fellenoord', 'Fellenoord 15', 'Eindhoven', '5611AA', 'kantoor', 50, 80, '871234567890123456', true),
('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Bedrijfshal Strijp', 'Strijp-S 42', 'Eindhoven', '5616GM', 'bedrijfsverzamelgebouw', 30, 63, '871234567890123457', false),
('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Zorgcentrum De Bron', 'Helmond Centrum 5', 'Helmond', '5701AA', 'zorg', 25, 50, '871234567890123458', false),
('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'Winkelcentrum Parkstad', 'Promenade 22', 'Heerlen', '6411AA', 'retail', 200, 160, '871234567890123459', true);

-- Charge points for Van der Berg (14 total: 8+6)
INSERT INTO public.charge_points (id, location_id, name, type, brand, model, status, monthly_platform_cost) VALUES
('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'LP-01', 'ac_22', 'Zaptec', 'Go', 'online', 5.50),
('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'LP-02', 'ac_22', 'Zaptec', 'Go', 'online', 5.50),
('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'LP-03', 'ac_22', 'Zaptec', 'Go', 'online', 5.50),
('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'LP-04', 'ac_22', 'Zaptec', 'Go', 'in_use', 5.50),
('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'LP-05', 'ac_11', 'Peblar', 'Home', 'online', 5.50),
('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 'LP-06', 'ac_11', 'Peblar', 'Home', 'online', 5.50),
('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 'LP-07', 'ac_11', 'Peblar', 'Home', 'offline', 5.50),
('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', 'LP-08', 'ac_11', 'Peblar', 'Home', 'online', 5.50),
('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', 'LP-09', 'ac_22', 'Alfen', 'Eve Single', 'online', 5.50),
('30000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000002', 'LP-10', 'ac_22', 'Alfen', 'Eve Single', 'online', 5.50),
('30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000002', 'LP-11', 'ac_22', 'Alfen', 'Eve Single', 'online', 5.50),
('30000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000002', 'LP-12', 'ac_22', 'Alfen', 'Eve Single', 'error', 5.50),
('30000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000002', 'LP-13', 'ac_11', 'Alfen', 'Eve Single', 'online', 5.50),
('30000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000002', 'LP-14', 'ac_11', 'Alfen', 'Eve Single', 'online', 5.50);

-- Charge points for Zorggroep (6)
INSERT INTO public.charge_points (id, location_id, name, type, brand, model, status, monthly_platform_cost) VALUES
('30000000-0000-0000-0000-000000000015', '20000000-0000-0000-0000-000000000003', 'LP-01', 'ac_11', 'Zaptec', 'Go', 'online', 5.50),
('30000000-0000-0000-0000-000000000016', '20000000-0000-0000-0000-000000000003', 'LP-02', 'ac_11', 'Zaptec', 'Go', 'online', 5.50),
('30000000-0000-0000-0000-000000000017', '20000000-0000-0000-0000-000000000003', 'LP-03', 'ac_11', 'Zaptec', 'Go', 'online', 5.50),
('30000000-0000-0000-0000-000000000018', '20000000-0000-0000-0000-000000000003', 'LP-04', 'ac_11', 'Zaptec', 'Go', 'in_use', 5.50),
('30000000-0000-0000-0000-000000000019', '20000000-0000-0000-0000-000000000003', 'LP-05', 'ac_11', 'Zaptec', 'Go', 'online', 5.50),
('30000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000003', 'LP-06', 'ac_11', 'Zaptec', 'Go', 'online', 5.50);

-- Charge points for Parkstad (20)
INSERT INTO public.charge_points (location_id, name, type, brand, model, status, monthly_platform_cost)
SELECT
  '20000000-0000-0000-0000-000000000004',
  'LP-' || lpad(n::text, 2, '0'),
  CASE WHEN n <= 4 THEN 'dc' ELSE 'ac_22' END,
  CASE WHEN n <= 4 THEN 'ABB' WHEN n <= 12 THEN 'Zaptec' ELSE 'Peblar' END,
  CASE WHEN n <= 4 THEN 'Terra 54' WHEN n <= 12 THEN 'Go' ELSE 'Home' END,
  CASE WHEN n = 7 THEN 'offline' WHEN n = 15 THEN 'in_use' ELSE 'online' END,
  CASE WHEN n <= 4 THEN 10.40 ELSE 5.50 END
FROM generate_series(1, 20) n;

-- Tariff profiles
INSERT INTO public.tariff_profiles (client_id, charge_rate_per_kwh, energy_cost_per_kwh, ere_rate_per_kwh) VALUES
('10000000-0000-0000-0000-000000000001', 0.45, 0.24, 0.10),
('10000000-0000-0000-0000-000000000002', 0.42, 0.22, 0.09),
('10000000-0000-0000-0000-000000000003', 0.48, 0.26, 0.11);

-- Generate charging sessions for Van der Berg (12 months, ~560 sessions)
INSERT INTO public.charging_sessions (charge_point_id, location_id, client_id, started_at, ended_at, kwh_delivered, duration_minutes, gross_revenue, energy_cost, net_margin, client_share, echarging_share, ere_estimate)
SELECT
  cp_id,
  loc_id,
  '10000000-0000-0000-0000-000000000001',
  ts,
  ts + (interval '1 minute' * dur),
  kwh,
  dur,
  kwh * 0.45,
  kwh * 0.24,
  kwh * 0.21,
  kwh * 0.105,
  kwh * 0.105,
  kwh * 0.10
FROM (
  SELECT
    c.id as cp_id, c.location_id as loc_id,
    ('2025-04-01'::timestamptz + (interval '1 day' * floor(random() * 365)::int) + (interval '1 hour' * (7 + floor(random() * 12)::int)) + (interval '1 minute' * floor(random() * 60)::int)) as ts,
    (10 + random() * 50)::numeric(6,2) as kwh,
    (30 + floor(random() * 180))::int as dur
  FROM public.charge_points c
  CROSS JOIN generate_series(1, 40) s
  WHERE c.location_id IN ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')
) sub;

-- Generate charging sessions for Zorggroep (8 months, ~150 sessions)
INSERT INTO public.charging_sessions (charge_point_id, location_id, client_id, started_at, ended_at, kwh_delivered, duration_minutes, gross_revenue, energy_cost, net_margin, client_share, echarging_share, ere_estimate)
SELECT
  cp_id,
  loc_id,
  '10000000-0000-0000-0000-000000000002',
  ts,
  ts + (interval '1 minute' * dur),
  kwh,
  dur,
  kwh * 0.42,
  kwh * 0.22,
  kwh * 0.20,
  kwh * 0.10,
  kwh * 0.10,
  kwh * 0.09
FROM (
  SELECT
    c.id as cp_id, c.location_id as loc_id,
    ('2025-08-01'::timestamptz + (interval '1 day' * floor(random() * 245)::int) + (interval '1 hour' * (7 + floor(random() * 12)::int)) + (interval '1 minute' * floor(random() * 60)::int)) as ts,
    (8 + random() * 30)::numeric(6,2) as kwh,
    (30 + floor(random() * 120))::int as dur
  FROM public.charge_points c
  CROSS JOIN generate_series(1, 25) s
  WHERE c.location_id = '20000000-0000-0000-0000-000000000003'
) sub;

-- Generate charging sessions for Parkstad (3 months, ~600 sessions)
INSERT INTO public.charging_sessions (charge_point_id, location_id, client_id, started_at, ended_at, kwh_delivered, duration_minutes, gross_revenue, energy_cost, net_margin, client_share, echarging_share, ere_estimate)
SELECT
  cp_id,
  loc_id,
  '10000000-0000-0000-0000-000000000003',
  ts,
  ts + (interval '1 minute' * dur),
  kwh,
  dur,
  kwh * 0.48,
  kwh * 0.26,
  kwh * 0.22,
  kwh * 0.11,
  kwh * 0.11,
  kwh * 0.11
FROM (
  SELECT
    c.id as cp_id, c.location_id as loc_id,
    ('2026-01-01'::timestamptz + (interval '1 day' * floor(random() * 90)::int) + (interval '1 hour' * (8 + floor(random() * 14)::int)) + (interval '1 minute' * floor(random() * 60)::int)) as ts,
    (15 + random() * 80)::numeric(6,2) as kwh,
    (15 + floor(random() * 90))::int as dur
  FROM public.charge_points c
  CROSS JOIN generate_series(1, 30) s
  WHERE c.location_id = '20000000-0000-0000-0000-000000000004'
) sub;

-- Monthly settlements for Van der Berg (12 months)
INSERT INTO public.monthly_settlements (client_id, month, total_kwh, total_sessions, gross_revenue, total_energy_cost, total_platform_cost, net_margin, client_payout, echarging_revenue, ere_estimate, status, paid_at)
SELECT
  '10000000-0000-0000-0000-000000000001',
  date_trunc('month', '2025-04-01'::date + (interval '1 month' * n))::date,
  kwh_est,
  (35 + floor(random() * 20))::int,
  kwh_est * 0.45,
  kwh_est * 0.24,
  77.00,
  kwh_est * 0.45 - kwh_est * 0.24 - 77,
  (kwh_est * 0.45 - kwh_est * 0.24 - 77) * 0.5,
  (kwh_est * 0.45 - kwh_est * 0.24 - 77) * 0.5,
  kwh_est * 0.10,
  CASE WHEN n < 10 THEN 'paid' WHEN n = 10 THEN 'approved' ELSE 'calculated' END,
  CASE WHEN n < 10 THEN (date_trunc('month', '2025-04-01'::date + (interval '1 month' * (n+1))) + interval '25 days')::timestamptz ELSE NULL END
FROM (
  SELECT n, (1400 + random() * 600)::numeric(8,2) as kwh_est
  FROM generate_series(0, 11) n
) sub;

-- Monthly settlements for Zorggroep (8 months)
INSERT INTO public.monthly_settlements (client_id, month, total_kwh, total_sessions, gross_revenue, total_energy_cost, total_platform_cost, net_margin, client_payout, echarging_revenue, ere_estimate, status, paid_at)
SELECT
  '10000000-0000-0000-0000-000000000002',
  date_trunc('month', '2025-08-01'::date + (interval '1 month' * n))::date,
  kwh_est,
  (20 + floor(random() * 10))::int,
  kwh_est * 0.42,
  kwh_est * 0.22,
  33.00,
  kwh_est * 0.42 - kwh_est * 0.22 - 33,
  (kwh_est * 0.42 - kwh_est * 0.22 - 33) * 0.5,
  (kwh_est * 0.42 - kwh_est * 0.22 - 33) * 0.5,
  kwh_est * 0.09,
  CASE WHEN n < 6 THEN 'paid' WHEN n = 6 THEN 'approved' ELSE 'calculated' END,
  CASE WHEN n < 6 THEN (date_trunc('month', '2025-08-01'::date + (interval '1 month' * (n+1))) + interval '25 days')::timestamptz ELSE NULL END
FROM (
  SELECT n, (450 + random() * 250)::numeric(8,2) as kwh_est
  FROM generate_series(0, 7) n
) sub;

-- Monthly settlements for Parkstad (3 months)
INSERT INTO public.monthly_settlements (client_id, month, total_kwh, total_sessions, gross_revenue, total_energy_cost, total_platform_cost, net_margin, client_payout, echarging_revenue, ere_estimate, status, paid_at)
SELECT
  '10000000-0000-0000-0000-000000000003',
  date_trunc('month', '2026-01-01'::date + (interval '1 month' * n))::date,
  kwh_est,
  (80 + floor(random() * 40))::int,
  kwh_est * 0.48,
  kwh_est * 0.26,
  130.00,
  kwh_est * 0.48 - kwh_est * 0.26 - 130,
  (kwh_est * 0.48 - kwh_est * 0.26 - 130) * 0.5,
  (kwh_est * 0.48 - kwh_est * 0.26 - 130) * 0.5,
  kwh_est * 0.11,
  CASE WHEN n < 2 THEN 'paid' ELSE 'calculated' END,
  CASE WHEN n < 2 THEN (date_trunc('month', '2026-01-01'::date + (interval '1 month' * (n+1))) + interval '25 days')::timestamptz ELSE NULL END
FROM (
  SELECT n, (2800 + random() * 1200)::numeric(8,2) as kwh_est
  FROM generate_series(0, 2) n
) sub;

-- Quote for Hendriksen
INSERT INTO public.quotes (organization_id, client_id, prospect_company, prospect_contact, prospect_email, quote_number, status, valid_until, locations_data, tariff_data, calculation_data)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000004',
  'Hendriksen Properties',
  'Tom Hendriksen',
  'tom@hendriksen.nl',
  'OFF-2026-001',
  'verstuurd',
  '2026-05-15',
  '[{"name":"Bedrijfsverzamelgebouw Tilburg","address":"Spoorlaan 10","city":"Tilburg","chargePoints":10,"type":"ac_22"}]'::jsonb,
  '{"chargeRate":0.45,"energyCost":0.25,"revenueShare":50}'::jsonb,
  '{"grossRevenueYear":27000,"energyCostYear":15000,"platformCostYear":660,"netMarginYear":11340,"clientShareYear":5670,"ereEstimateYear":3000,"clientTotalYear":8670}'::jsonb
);
