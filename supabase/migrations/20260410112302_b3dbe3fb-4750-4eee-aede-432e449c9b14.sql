
-- ============================================================
-- STAP 1: Monthly settlements herberekenen met realistische kWh
-- Seizoenspatroon: zomer hoog, winter laag
-- Formules: gross=kwh*0.45, energy=kwh*0.24, platform=77,
--           net=gross-energy-platform, payout=net*0.50, ere=kwh*0.10
-- ============================================================

-- Apr 2025: 9500 kWh, 380 sessies
UPDATE monthly_settlements SET
  total_kwh = 9500, total_sessions = 380,
  gross_revenue = 9500 * 0.45,
  total_energy_cost = 9500 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (9500 * 0.45) - (9500 * 0.24) - 77.00,
  client_payout = ((9500 * 0.45) - (9500 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((9500 * 0.45) - (9500 * 0.24) - 77.00) * 0.50,
  ere_estimate = 9500 * 0.10
WHERE id = '28e3f06b-8af0-448b-99d1-285bbca9d3d4';

-- May 2025: 9900 kWh, 396 sessies
UPDATE monthly_settlements SET
  total_kwh = 9900, total_sessions = 396,
  gross_revenue = 9900 * 0.45,
  total_energy_cost = 9900 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (9900 * 0.45) - (9900 * 0.24) - 77.00,
  client_payout = ((9900 * 0.45) - (9900 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((9900 * 0.45) - (9900 * 0.24) - 77.00) * 0.50,
  ere_estimate = 9900 * 0.10
WHERE id = '53325186-58a4-4cc8-aa00-6e32106a318c';

-- Jun 2025: 11100 kWh, 444 sessies (zomer)
UPDATE monthly_settlements SET
  total_kwh = 11100, total_sessions = 444,
  gross_revenue = 11100 * 0.45,
  total_energy_cost = 11100 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (11100 * 0.45) - (11100 * 0.24) - 77.00,
  client_payout = ((11100 * 0.45) - (11100 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((11100 * 0.45) - (11100 * 0.24) - 77.00) * 0.50,
  ere_estimate = 11100 * 0.10
WHERE id = '35203700-94d3-4b79-98ee-aa8c565a23cf';

-- Jul 2025: 11500 kWh, 460 sessies (zomerpiek)
UPDATE monthly_settlements SET
  total_kwh = 11500, total_sessions = 460,
  gross_revenue = 11500 * 0.45,
  total_energy_cost = 11500 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (11500 * 0.45) - (11500 * 0.24) - 77.00,
  client_payout = ((11500 * 0.45) - (11500 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((11500 * 0.45) - (11500 * 0.24) - 77.00) * 0.50,
  ere_estimate = 11500 * 0.10
WHERE id = 'b7c0e865-0bde-4e29-863b-6b352c46302d';

-- Aug 2025: 11200 kWh, 448 sessies
UPDATE monthly_settlements SET
  total_kwh = 11200, total_sessions = 448,
  gross_revenue = 11200 * 0.45,
  total_energy_cost = 11200 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (11200 * 0.45) - (11200 * 0.24) - 77.00,
  client_payout = ((11200 * 0.45) - (11200 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((11200 * 0.45) - (11200 * 0.24) - 77.00) * 0.50,
  ere_estimate = 11200 * 0.10
WHERE id = 'efbe75c4-1a66-410b-9070-7e2ea91374dc';

-- Sep 2025: 10500 kWh, 420 sessies
UPDATE monthly_settlements SET
  total_kwh = 10500, total_sessions = 420,
  gross_revenue = 10500 * 0.45,
  total_energy_cost = 10500 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (10500 * 0.45) - (10500 * 0.24) - 77.00,
  client_payout = ((10500 * 0.45) - (10500 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((10500 * 0.45) - (10500 * 0.24) - 77.00) * 0.50,
  ere_estimate = 10500 * 0.10
WHERE id = 'bd460683-4117-4c60-97ad-e4dfa9ab2905';

-- Oct 2025: 9900 kWh, 396 sessies
UPDATE monthly_settlements SET
  total_kwh = 9900, total_sessions = 396,
  gross_revenue = 9900 * 0.45,
  total_energy_cost = 9900 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (9900 * 0.45) - (9900 * 0.24) - 77.00,
  client_payout = ((9900 * 0.45) - (9900 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((9900 * 0.45) - (9900 * 0.24) - 77.00) * 0.50,
  ere_estimate = 9900 * 0.10
WHERE id = 'd52abace-70ad-48f1-80e3-f384d183ebd8';

-- Nov 2025: 9200 kWh, 368 sessies (herfst)
UPDATE monthly_settlements SET
  total_kwh = 9200, total_sessions = 368,
  gross_revenue = 9200 * 0.45,
  total_energy_cost = 9200 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (9200 * 0.45) - (9200 * 0.24) - 77.00,
  client_payout = ((9200 * 0.45) - (9200 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((9200 * 0.45) - (9200 * 0.24) - 77.00) * 0.50,
  ere_estimate = 9200 * 0.10
WHERE id = 'b392283c-fce3-42fe-8abe-7626a643d496';

-- Dec 2025: 8800 kWh, 352 sessies (winter)
UPDATE monthly_settlements SET
  total_kwh = 8800, total_sessions = 352,
  gross_revenue = 8800 * 0.45,
  total_energy_cost = 8800 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (8800 * 0.45) - (8800 * 0.24) - 77.00,
  client_payout = ((8800 * 0.45) - (8800 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((8800 * 0.45) - (8800 * 0.24) - 77.00) * 0.50,
  ere_estimate = 8800 * 0.10
WHERE id = '97bdedf1-02db-42b5-9f3e-0bee17d52276';

-- Jan 2026: 8600 kWh, 344 sessies (winter dieptepunt)
UPDATE monthly_settlements SET
  total_kwh = 8600, total_sessions = 344,
  gross_revenue = 8600 * 0.45,
  total_energy_cost = 8600 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (8600 * 0.45) - (8600 * 0.24) - 77.00,
  client_payout = ((8600 * 0.45) - (8600 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((8600 * 0.45) - (8600 * 0.24) - 77.00) * 0.50,
  ere_estimate = 8600 * 0.10
WHERE id = 'ad18853a-6373-4c9d-82ff-0609406aa65b';

-- Feb 2026: 9000 kWh, 360 sessies
UPDATE monthly_settlements SET
  total_kwh = 9000, total_sessions = 360,
  gross_revenue = 9000 * 0.45,
  total_energy_cost = 9000 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (9000 * 0.45) - (9000 * 0.24) - 77.00,
  client_payout = ((9000 * 0.45) - (9000 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((9000 * 0.45) - (9000 * 0.24) - 77.00) * 0.50,
  ere_estimate = 9000 * 0.10
WHERE id = 'd7b594c9-40e6-4d96-8aff-accaafd83f64';

-- Mar 2026: 9800 kWh, 392 sessies (lente)
UPDATE monthly_settlements SET
  total_kwh = 9800, total_sessions = 392,
  gross_revenue = 9800 * 0.45,
  total_energy_cost = 9800 * 0.24,
  total_platform_cost = 77.00,
  net_margin = (9800 * 0.45) - (9800 * 0.24) - 77.00,
  client_payout = ((9800 * 0.45) - (9800 * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((9800 * 0.45) - (9800 * 0.24) - 77.00) * 0.50,
  ere_estimate = 9800 * 0.10
WHERE id = 'e1890895-5623-4ee8-8ec7-a76520da5c3f';

-- ============================================================
-- STAP 2: Charging sessions — kWh opschalen per maand
-- Schaalfactor = target_settlement_kwh / huidige_session_kwh_sum
-- Dan financials herberekenen vanuit kWh × tarieven
-- ============================================================

-- Apr 2025: target 9500 kWh, huidige sum 1952.90 → factor 4.864
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (9500.0 / 1952.90),
  gross_revenue = kwh_delivered * (9500.0 / 1952.90) * 0.45,
  energy_cost = kwh_delivered * (9500.0 / 1952.90) * 0.24,
  net_margin = kwh_delivered * (9500.0 / 1952.90) * (0.45 - 0.24),
  client_share = kwh_delivered * (9500.0 / 1952.90) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (9500.0 / 1952.90) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (9500.0 / 1952.90) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2025-04-01' AND started_at < '2025-05-01';

-- May 2025: target 9900, sum 1943.75 → factor 5.093
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (9900.0 / 1943.75),
  gross_revenue = kwh_delivered * (9900.0 / 1943.75) * 0.45,
  energy_cost = kwh_delivered * (9900.0 / 1943.75) * 0.24,
  net_margin = kwh_delivered * (9900.0 / 1943.75) * (0.45 - 0.24),
  client_share = kwh_delivered * (9900.0 / 1943.75) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (9900.0 / 1943.75) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (9900.0 / 1943.75) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2025-05-01' AND started_at < '2025-06-01';

-- Jun 2025: target 11100, sum 1533.38
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (11100.0 / 1533.38),
  gross_revenue = kwh_delivered * (11100.0 / 1533.38) * 0.45,
  energy_cost = kwh_delivered * (11100.0 / 1533.38) * 0.24,
  net_margin = kwh_delivered * (11100.0 / 1533.38) * (0.45 - 0.24),
  client_share = kwh_delivered * (11100.0 / 1533.38) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (11100.0 / 1533.38) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (11100.0 / 1533.38) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2025-06-01' AND started_at < '2025-07-01';

-- Jul 2025: target 11500, sum 1367.17
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (11500.0 / 1367.17),
  gross_revenue = kwh_delivered * (11500.0 / 1367.17) * 0.45,
  energy_cost = kwh_delivered * (11500.0 / 1367.17) * 0.24,
  net_margin = kwh_delivered * (11500.0 / 1367.17) * (0.45 - 0.24),
  client_share = kwh_delivered * (11500.0 / 1367.17) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (11500.0 / 1367.17) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (11500.0 / 1367.17) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2025-07-01' AND started_at < '2025-08-01';

-- Aug 2025: target 11200, sum 1607.66
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (11200.0 / 1607.66),
  gross_revenue = kwh_delivered * (11200.0 / 1607.66) * 0.45,
  energy_cost = kwh_delivered * (11200.0 / 1607.66) * 0.24,
  net_margin = kwh_delivered * (11200.0 / 1607.66) * (0.45 - 0.24),
  client_share = kwh_delivered * (11200.0 / 1607.66) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (11200.0 / 1607.66) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (11200.0 / 1607.66) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2025-08-01' AND started_at < '2025-09-01';

-- Sep 2025: target 10500, sum 1441.24
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (10500.0 / 1441.24),
  gross_revenue = kwh_delivered * (10500.0 / 1441.24) * 0.45,
  energy_cost = kwh_delivered * (10500.0 / 1441.24) * 0.24,
  net_margin = kwh_delivered * (10500.0 / 1441.24) * (0.45 - 0.24),
  client_share = kwh_delivered * (10500.0 / 1441.24) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (10500.0 / 1441.24) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (10500.0 / 1441.24) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2025-09-01' AND started_at < '2025-10-01';

-- Oct 2025: target 9900, sum 1566.60
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (9900.0 / 1566.60),
  gross_revenue = kwh_delivered * (9900.0 / 1566.60) * 0.45,
  energy_cost = kwh_delivered * (9900.0 / 1566.60) * 0.24,
  net_margin = kwh_delivered * (9900.0 / 1566.60) * (0.45 - 0.24),
  client_share = kwh_delivered * (9900.0 / 1566.60) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (9900.0 / 1566.60) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (9900.0 / 1566.60) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2025-10-01' AND started_at < '2025-11-01';

-- Nov 2025: target 9200, sum 1718.11
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (9200.0 / 1718.11),
  gross_revenue = kwh_delivered * (9200.0 / 1718.11) * 0.45,
  energy_cost = kwh_delivered * (9200.0 / 1718.11) * 0.24,
  net_margin = kwh_delivered * (9200.0 / 1718.11) * (0.45 - 0.24),
  client_share = kwh_delivered * (9200.0 / 1718.11) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (9200.0 / 1718.11) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (9200.0 / 1718.11) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2025-11-01' AND started_at < '2025-12-01';

-- Dec 2025: target 8800, sum 1270.30
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (8800.0 / 1270.30),
  gross_revenue = kwh_delivered * (8800.0 / 1270.30) * 0.45,
  energy_cost = kwh_delivered * (8800.0 / 1270.30) * 0.24,
  net_margin = kwh_delivered * (8800.0 / 1270.30) * (0.45 - 0.24),
  client_share = kwh_delivered * (8800.0 / 1270.30) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (8800.0 / 1270.30) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (8800.0 / 1270.30) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2025-12-01' AND started_at < '2026-01-01';

-- Jan 2026: target 8600, sum 1580.73
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (8600.0 / 1580.73),
  gross_revenue = kwh_delivered * (8600.0 / 1580.73) * 0.45,
  energy_cost = kwh_delivered * (8600.0 / 1580.73) * 0.24,
  net_margin = kwh_delivered * (8600.0 / 1580.73) * (0.45 - 0.24),
  client_share = kwh_delivered * (8600.0 / 1580.73) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (8600.0 / 1580.73) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (8600.0 / 1580.73) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2026-01-01' AND started_at < '2026-02-01';

-- Feb 2026: target 9000, sum 1320.77
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (9000.0 / 1320.77),
  gross_revenue = kwh_delivered * (9000.0 / 1320.77) * 0.45,
  energy_cost = kwh_delivered * (9000.0 / 1320.77) * 0.24,
  net_margin = kwh_delivered * (9000.0 / 1320.77) * (0.45 - 0.24),
  client_share = kwh_delivered * (9000.0 / 1320.77) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (9000.0 / 1320.77) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (9000.0 / 1320.77) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2026-02-01' AND started_at < '2026-03-01';

-- Mar 2026: target 9800, sum 1091.84
UPDATE charging_sessions SET
  kwh_delivered = kwh_delivered * (9800.0 / 1091.84),
  gross_revenue = kwh_delivered * (9800.0 / 1091.84) * 0.45,
  energy_cost = kwh_delivered * (9800.0 / 1091.84) * 0.24,
  net_margin = kwh_delivered * (9800.0 / 1091.84) * (0.45 - 0.24),
  client_share = kwh_delivered * (9800.0 / 1091.84) * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (9800.0 / 1091.84) * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * (9800.0 / 1091.84) * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001'
  AND started_at >= '2026-03-01' AND started_at < '2026-04-01';

-- ============================================================
-- STAP 3: Duration aanpassen zodat het past bij de nieuwe kWh
-- Bij 11kW AC laden: duration_minutes = (kwh / 11) * 60
-- ============================================================
UPDATE charging_sessions SET
  duration_minutes = ROUND((kwh_delivered / 11.0) * 60)
WHERE client_id = '10000000-0000-0000-0000-000000000001';
