create extension if not exists pg_cron;
create extension if not exists pg_net;

select
  cron.schedule(
    'generate-morning-advice-every-10-minutes',
    '*/10 * * * *',
    $$
    select
      net.http_post(
        url:='https://ghlvnpsuklruauuabdev.supabase.co/functions/v1/generate-morning-advice',
        headers:='{"Content-Type": "application/json"}'::jsonb,
        body:='{}'::jsonb
      ) as request_id;
    $$
  );
