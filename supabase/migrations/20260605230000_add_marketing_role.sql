-- Nieuwe interne rol voor het Marketing-werkblad (mirror van 'sales').
-- ALTER TYPE ADD VALUE moet los van gebruik gecommit worden.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing';
