-- E-Charging is per 2026-07-16 een eigen B.V. (KvK 42107233). Registratievelden toevoegen en
-- de organisatie-rij bijwerken naar de nieuwe bedrijfsgegevens. Telefoon bewust leeg: de B.V.
-- heeft nog geen eigen nummer. Er bestaan nog geen goedgekeurde afrekeningen, dus geen
-- historie-conflict (afrekendocumenten renderen live uit deze rij).

alter table public.organizations
  add column if not exists rsin text,
  add column if not exists vestigingsnummer text,
  add column if not exists sbi_code text;

comment on column public.organizations.rsin is 'RSIN (Rechtspersonen Samenwerkingsverbanden Informatienummer) uit het KvK-register';
comment on column public.organizations.vestigingsnummer is 'KvK-vestigingsnummer van de hoofdvestiging';
comment on column public.organizations.sbi_code is 'SBI-code (hoofdactiviteit) uit het KvK-register';

update public.organizations set
  name = 'E-Charging B.V.',
  kvk = '42107233',
  btw_number = 'NL869765784B01',
  iban = 'NL09 RABO 0176 3641 29',
  bic = 'RABONL2U',
  phone = null,
  rsin = '869765784',
  vestigingsnummer = '000066105676',
  sbi_code = '43212',
  address_street = 'Dwarsweg 8',
  address_postal = '5301 KT',
  address_city = 'Zaltbommel',
  address = 'Dwarsweg 8, 5301 KT Zaltbommel';
