-- Fix IBAN validation permissions and make the database validator
-- reject wrong country-specific lengths before the checksum step.

CREATE OR REPLACE FUNCTION app_private.is_valid_iban(p_iban text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v_iban text;
  v_rearranged text;
  v_char text;
  v_digits text;
  v_digit text;
  v_remainder integer := 0;
  v_expected_length integer;
  i integer;
  j integer;
BEGIN
  v_iban := upper(regexp_replace(coalesce(p_iban, ''), '\s+', '', 'g'));

  IF v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$' THEN
    RETURN false;
  END IF;

  v_expected_length := CASE substring(v_iban from 1 for 2)
    WHEN 'AD' THEN 24
    WHEN 'AE' THEN 23
    WHEN 'AL' THEN 28
    WHEN 'AT' THEN 20
    WHEN 'AZ' THEN 28
    WHEN 'BA' THEN 20
    WHEN 'BE' THEN 16
    WHEN 'BG' THEN 22
    WHEN 'BH' THEN 22
    WHEN 'BR' THEN 29
    WHEN 'BY' THEN 28
    WHEN 'CH' THEN 21
    WHEN 'CR' THEN 22
    WHEN 'CY' THEN 28
    WHEN 'CZ' THEN 24
    WHEN 'DE' THEN 22
    WHEN 'DK' THEN 18
    WHEN 'DO' THEN 28
    WHEN 'EE' THEN 20
    WHEN 'EG' THEN 29
    WHEN 'ES' THEN 24
    WHEN 'FI' THEN 18
    WHEN 'FO' THEN 18
    WHEN 'FR' THEN 27
    WHEN 'GB' THEN 22
    WHEN 'GE' THEN 22
    WHEN 'GI' THEN 23
    WHEN 'GL' THEN 18
    WHEN 'GR' THEN 27
    WHEN 'GT' THEN 28
    WHEN 'HR' THEN 21
    WHEN 'HU' THEN 28
    WHEN 'IE' THEN 22
    WHEN 'IL' THEN 23
    WHEN 'IQ' THEN 23
    WHEN 'IS' THEN 26
    WHEN 'IT' THEN 27
    WHEN 'JO' THEN 30
    WHEN 'KW' THEN 30
    WHEN 'KZ' THEN 20
    WHEN 'LB' THEN 28
    WHEN 'LC' THEN 32
    WHEN 'LI' THEN 21
    WHEN 'LT' THEN 20
    WHEN 'LU' THEN 20
    WHEN 'LV' THEN 21
    WHEN 'MC' THEN 27
    WHEN 'MD' THEN 24
    WHEN 'ME' THEN 22
    WHEN 'MK' THEN 19
    WHEN 'MR' THEN 27
    WHEN 'MT' THEN 31
    WHEN 'MU' THEN 30
    WHEN 'NL' THEN 18
    WHEN 'NO' THEN 15
    WHEN 'PK' THEN 24
    WHEN 'PL' THEN 28
    WHEN 'PS' THEN 29
    WHEN 'PT' THEN 25
    WHEN 'QA' THEN 29
    WHEN 'RO' THEN 24
    WHEN 'RS' THEN 22
    WHEN 'SA' THEN 24
    WHEN 'SC' THEN 31
    WHEN 'SE' THEN 24
    WHEN 'SI' THEN 19
    WHEN 'SK' THEN 24
    WHEN 'SM' THEN 27
    WHEN 'ST' THEN 25
    WHEN 'SV' THEN 28
    WHEN 'TL' THEN 23
    WHEN 'TN' THEN 24
    WHEN 'TR' THEN 26
    WHEN 'UA' THEN 29
    WHEN 'VA' THEN 22
    WHEN 'VG' THEN 24
    WHEN 'XK' THEN 20
    ELSE NULL
  END;

  IF v_expected_length IS NULL OR char_length(v_iban) <> v_expected_length THEN
    RETURN false;
  END IF;

  v_rearranged := substring(v_iban from 5) || substring(v_iban from 1 for 4);

  FOR i IN 1..char_length(v_rearranged) LOOP
    v_char := substring(v_rearranged from i for 1);
    IF v_char ~ '^[A-Z]$' THEN
      v_digits := (ascii(v_char) - 55)::text;
    ELSE
      v_digits := v_char;
    END IF;

    FOR j IN 1..char_length(v_digits) LOOP
      v_digit := substring(v_digits from j for 1);
      v_remainder := (v_remainder * 10 + v_digit::integer) % 97;
    END LOOP;
  END LOOP;

  RETURN v_remainder = 1;
END;
$$;

REVOKE ALL ON FUNCTION app_private.is_valid_iban(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_private.is_valid_iban(text) FROM anon;
GRANT EXECUTE ON FUNCTION app_private.is_valid_iban(text) TO authenticated, service_role;
