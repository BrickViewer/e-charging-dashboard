
-- Stap 1: Sessie-financials herberekenen vanuit huidige kwh_delivered
UPDATE charging_sessions SET
  gross_revenue = kwh_delivered * 0.45,
  energy_cost = kwh_delivered * 0.24,
  net_margin = kwh_delivered * (0.45 - 0.24),
  client_share = kwh_delivered * (0.45 - 0.24) * 0.50,
  echarging_share = kwh_delivered * (0.45 - 0.24) * 0.50,
  ere_estimate = kwh_delivered * 0.10
WHERE client_id = '10000000-0000-0000-0000-000000000001';

-- Stap 2: Settlements herberekenen vanuit werkelijke sessie-aggregaten
UPDATE monthly_settlements ms SET
  total_kwh = agg.sum_kwh,
  total_sessions = agg.cnt,
  gross_revenue = agg.sum_kwh * 0.45,
  total_energy_cost = agg.sum_kwh * 0.24,
  total_platform_cost = 77.00,
  net_margin = (agg.sum_kwh * 0.45) - (agg.sum_kwh * 0.24) - 77.00,
  client_payout = ((agg.sum_kwh * 0.45) - (agg.sum_kwh * 0.24) - 77.00) * 0.50,
  echarging_revenue = ((agg.sum_kwh * 0.45) - (agg.sum_kwh * 0.24) - 77.00) * 0.50,
  ere_estimate = agg.sum_kwh * 0.10
FROM (
  SELECT
    DATE_TRUNC('month', started_at)::date as m,
    count(*) as cnt,
    sum(kwh_delivered) as sum_kwh
  FROM charging_sessions
  WHERE client_id = '10000000-0000-0000-0000-000000000001'
  GROUP BY DATE_TRUNC('month', started_at)
) agg
WHERE ms.client_id = '10000000-0000-0000-0000-000000000001'
  AND ms.month = agg.m;
