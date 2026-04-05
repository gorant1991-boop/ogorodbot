alter table public.notification_jobs
  add column if not exists job_key text;

create unique index if not exists notification_jobs_job_key_key
  on public.notification_jobs (job_key)
  where job_key is not null;
