-- Instelbaar ontvangeradres voor de e-portal handoff-notificatie. Zodra een
-- installatie-order wordt doorgestuurd naar de E-Group e-portal (order-handoff),
-- stuurt de edge een branded mail naar dit adres met de opdrachtdetails + het
-- OPD-ordernummer en de mededeling dat de opdracht in de e-portal klaarstaat.
-- Spiegelt het bestaande organizations.fault_notification_email-patroon.
alter table public.organizations
  add column if not exists handoff_notification_email text not null
    default 'willi-jan.jonkers@e-group.nl';
