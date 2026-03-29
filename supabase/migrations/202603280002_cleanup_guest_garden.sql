update public.garden_data
set onboarding = '{}'::jsonb,
    plan = 'free',
    updated_at = now()
where vk_user_id = 1;
