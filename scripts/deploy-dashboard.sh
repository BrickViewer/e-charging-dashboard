#!/usr/bin/env sh
# Deployt de gebouwde admin+configurator-bundle naar Cloudflare Pages (dashboard.e-charging.nl).
# Aanroepen via `npm run deploy:dashboard` (die bouwt eerst met build:dashboard).
# Creds komen uit de root-.env (gitignored); dezelfde waarden staan in de Supabase Vault
# (cloudflare_api_token / cloudflare_account_id / cloudflare_pages_project).
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "FOUT: root-.env ontbreekt (met CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID)." >&2
  exit 1
fi
set -a; . ./.env; set +a

if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "FOUT: CLOUDFLARE_API_TOKEN of CLOUDFLARE_ACCOUNT_ID ontbreekt in .env (waarden staan in de Supabase Vault)." >&2
  exit 1
fi

npx wrangler pages deploy apps/admin/dist \
  --project-name="${CLOUDFLARE_PAGES_PROJECT:-echarging-admin-app}" \
  --branch=main

echo ""
echo "Klaar. Verifieer: curl -s https://dashboard.e-charging.nl/ | grep -o 'src=\"[^\"]*\"'"
