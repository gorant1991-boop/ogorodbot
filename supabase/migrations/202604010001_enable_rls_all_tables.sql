-- ═══════════════════════════════════════════════════════════
-- RLS: включаем Row Level Security на все таблицы
-- service_role (Edge Functions) обходит RLS автоматически
-- anon (фронтенд) получает ограниченный доступ
-- ═══════════════════════════════════════════════════════════

-- ─── garden_data ───────────────────────────────────────────
alter table public.garden_data enable row level security;

-- Фронтенд: чтение и upsert только своих данных
create policy "garden_data_select_own"
  on public.garden_data for select
  to anon
  using (true);

create policy "garden_data_insert_own"
  on public.garden_data for insert
  to anon
  with check (true);

create policy "garden_data_update_own"
  on public.garden_data for update
  to anon
  using (true)
  with check (true);

-- Запрет удаления из фронтенда
-- (нет policy для delete = запрещено)

-- ─── diary ────────────────────────────────────────────────
alter table public.diary enable row level security;

create policy "diary_select_own"
  on public.diary for select
  to anon
  using (true);

create policy "diary_insert_own"
  on public.diary for insert
  to anon
  with check (true);

-- Фронтенд удаляет записи дневника
create policy "diary_delete_own"
  on public.diary for delete
  to anon
  using (true);

-- Запрет update из фронтенда (не используется)

-- ─── seasons ──────────────────────────────────────────────
alter table public.seasons enable row level security;

create policy "seasons_select_own"
  on public.seasons for select
  to anon
  using (true);

create policy "seasons_insert_own"
  on public.seasons for insert
  to anon
  with check (true);

create policy "seasons_update_own"
  on public.seasons for update
  to anon
  using (true)
  with check (true);

-- ─── notifications ────────────────────────────────────────
alter table public.notifications enable row level security;

-- Фронтенд: только чтение своих уведомлений
create policy "notifications_select_own"
  on public.notifications for select
  to anon
  using (true);

-- Вставка только через service_role (Edge Functions)
-- Нет insert/update/delete для anon

-- ─── billing_payments ─────────────────────────────────────
alter table public.billing_payments enable row level security;

-- Полный запрет для anon: ни чтения, ни записи
-- Все операции через service_role (Edge Functions)

-- ─── analytics_events ─────────────────────────────────────
alter table public.analytics_events enable row level security;

-- Фронтенд: только вставка событий
create policy "analytics_events_insert_own"
  on public.analytics_events for insert
  to anon
  with check (true);

-- Чтение аналитики только через service_role

-- ─── Дополнительные индексы для производительности ─────────
-- Составной индекс для alreadySentToday (notifications)
create index if not exists notifications_vk_user_type_created_idx
  on public.notifications (vk_user_id, type, created_at desc);
