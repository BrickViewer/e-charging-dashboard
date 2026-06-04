-- admin_get_cron_status verwees nog naar public.has_role, maar die helper is verhuisd
-- naar app_private (public.has_role is gedropt) → de RPC faalde → de settings konden de
-- cron-status niet laden ("cron werkt niet"). Fix: app_private.has_role gebruiken.
CREATE OR REPLACE FUNCTION public.admin_get_cron_status()
 RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, last_run timestamp with time zone, last_status text, last_duration_ms integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
  SELECT
    j.jobid::bigint,
    j.jobname::text,
    j.schedule::text,
    j.active,
    lr.start_time AS last_run,
    lr.status::text AS last_status,
    CASE
      WHEN lr.end_time IS NOT NULL AND lr.start_time IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (lr.end_time - lr.start_time)) * 1000)::integer
      ELSE NULL
    END AS last_duration_ms
  FROM cron.job AS j
  LEFT JOIN LATERAL (
    SELECT d.start_time, d.end_time, d.status
    FROM cron.job_run_details AS d
    WHERE d.jobid = j.jobid
    ORDER BY d.start_time DESC
    LIMIT 1
  ) AS lr ON true
  WHERE app_private.has_role(auth.uid(), 'admin')
  ORDER BY j.jobname;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_get_cron_status() TO authenticated;
