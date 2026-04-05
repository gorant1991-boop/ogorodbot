select cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * *',
  $$delete from public.notifications where created_at < now() - interval '90 days'$$
);

select cron.schedule(
  'cleanup-old-analytics-events',
  '0 3 * * *',
  $$delete from public.analytics_events where created_at < now() - interval '180 days'$$
);
