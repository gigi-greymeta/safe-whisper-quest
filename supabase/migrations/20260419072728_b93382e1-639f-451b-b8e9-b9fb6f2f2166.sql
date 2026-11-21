-- Revoke public/anon execute on the SECURITY DEFINER pruner.
-- pg_cron invokes as postgres (superuser), so the scheduled job is unaffected.
REVOKE EXECUTE ON FUNCTION public.prune_idle_pairwise_queues() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prune_idle_pairwise_queues() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prune_idle_pairwise_queues() FROM authenticated;