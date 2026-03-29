# Morning Advice Setup

## Что уже реализовано

- время утренних и вечерних советов хранится в профиле пользователя
- сохраняется `timeZone` пользователя из браузера
- серверная функция `generate-morning-advice` создаёт запись в `notifications`
- если включён канал `email` и настроены почтовые секреты, функция отправляет письмо

## Что нужно задеплоить

```bash
supabase db push
supabase functions deploy generate-morning-advice --no-verify-jwt
```

## Секреты для email

Если хотите реальную отправку писем, задайте:

```bash
RESEND_API_KEY=...
ADVICE_FROM_EMAIL=advice@your-domain.com
```

Если этих секретов нет, email-канал сохраняется в профиле, но письма не отправляются.

## Секреты для VK

Если хотите реальную отправку в личные сообщения ВКонтакте от имени сообщества, задайте:

```bash
VK_COMMUNITY_TOKEN=...
VK_API_VERSION=5.199
```

Нужен именно токен сообщества с правом отправки сообщений.

Важно:

- пользователь должен разрешить сообщения от сообщества или раньше написать в сообщество
- без этого VK может отклонять `messages.send`

## Как запускать по расписанию

Функцию нужно вызывать регулярно, например каждые 10 минут:

```bash
POST https://<project-ref>.supabase.co/functions/v1/generate-morning-advice
```

Подходящие варианты:

- GitHub Actions cron
- cron-job.org
- любой внешний cron

В репозитории уже добавлен workflow:

- `.github/workflows/morning-advice.yml`

Для него нужен GitHub secret:

- `MORNING_ADVICE_URL=https://<project-ref>.supabase.co/functions/v1/generate-morning-advice`

## Ручная проверка

Сгенерировать совет для одного пользователя сразу:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/generate-morning-advice" \
  -H "Content-Type: application/json" \
  -d '{"targetVkUserId":123456,"force":true}'
```

Сгенерировать совет на тестовое время:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/generate-morning-advice" \
  -H "Content-Type: application/json" \
  -d '{"nowIso":"2026-03-29T03:00:00.000Z"}'
```
