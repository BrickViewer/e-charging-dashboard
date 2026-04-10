UPDATE monthly_settlements
SET
  client_payout = client_payout * 6.79,
  echarging_revenue = echarging_revenue * 6.79,
  gross_revenue = gross_revenue * 6.79,
  net_margin = net_margin * 6.79,
  ere_estimate = ere_estimate * 6.79,
  total_energy_cost = total_energy_cost * 6.79,
  total_platform_cost = total_platform_cost * 6.79
WHERE client_id = '10000000-0000-0000-0000-000000000001';