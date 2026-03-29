update public.garden_data
set onboarding = jsonb_set(
  coalesce(onboarding, '{}'::jsonb),
  '{vkContactUserId}',
  to_jsonb(16761047),
  true
)
where vk_user_id = 1503284993;
