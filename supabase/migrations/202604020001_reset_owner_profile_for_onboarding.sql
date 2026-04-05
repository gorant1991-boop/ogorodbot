begin;

delete from notification_jobs
where vk_user_id = 16761047;

delete from notifications
where vk_user_id = 16761047;

delete from diary
where vk_user_id = 16761047;

delete from seasons
where vk_user_id = 16761047;

delete from garden_data
where vk_user_id = 16761047;

commit;
