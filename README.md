# ОгородБот

Веб-приложение для ведения огорода: культуры, объекты, дневник, советы агронома, прогноз погоды, лунный календарь, история сезонов, экспорт данных и уведомления по email и во ВКонтакте.

Сайт: `https://ogorod-ai.ru`

## Что уже работает

- вход по email magic link и через VK ID
- профиль огорода, объекты, культуры и сорта
- дневник по культурам и сезонам
- советы агронома внутри приложения
- утренние советы по расписанию
- доставка советов в приложение, на email и во ВКонтакте
- история сезонов и экспорт данных
- прогноз погоды и лунный календарь
- GitHub Actions cron для `Morning Advice`

## Локальный запуск

```bash
npm install
npm run dev
```

## Фронтовые переменные окружения

Создайте `.env` со значениями:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
VITE_VK_APP_ID=<vk-app-id>
VITE_VK_REDIRECT_URI=https://ogorod-ai.ru
VITE_OPENWEATHER_API_KEY=<openweathermap-api-key>
```

## Supabase

В проекте используются:

- таблицы `garden_data`, `diary`, `seasons`, `notifications`, `billing_payments`, `analytics_events`
- edge functions для пользовательских данных, утренних советов и оплаты

Применить миграции:

```bash
supabase db push
```

## Советы по расписанию

Серверная функция:

- `generate-morning-advice`

Нужные Supabase secrets:

```bash
RESEND_API_KEY=...
ADVICE_FROM_EMAIL=advice@ogorod-ai.ru
VK_COMMUNITY_TOKEN=...
VK_API_VERSION=5.199
```

GitHub Actions вызывает функцию по расписанию через secret:

```bash
MORNING_ADVICE_URL=https://<project-ref>.supabase.co/functions/v1/generate-morning-advice
```

Функция проверяет и утреннее, и вечернее время пользователя, так что отдельный cron для вечера не нужен.

Подробности: [`docs/morning-advice-setup.md`](docs/morning-advice-setup.md)

## ЮKassa

В проекте уже подготовлены:

- `create-yookassa-payment`
- `get-yookassa-payment-status`
- `yookassa-webhook`

Для включения оплаты нужно задать secrets и webhook в YooKassa.

Подробности: [`docs/yookassa-setup.md`](docs/yookassa-setup.md)

## Полезные команды

```bash
npm run dev
npm run build
npm run deploy
supabase functions deploy generate-morning-advice
supabase functions deploy user-data
supabase functions deploy create-yookassa-payment
supabase functions deploy get-yookassa-payment-status
supabase functions deploy yookassa-webhook
```

## Деплой сайта

Публикация идёт через `gh-pages`:

```bash
npm run deploy
```

## Текущее состояние

Продукт уже готов к использованию без ЮKassa. Главный оставшийся платёжный хвост — боевая настройка YooKassa и, при желании, дальнейшая полировка документации и мониторинга.
