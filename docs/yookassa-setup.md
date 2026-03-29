# YooKassa Setup

В проекте уже подготовлены:

- фронтовый checkout в профиле подписки
- `create-yookassa-payment`
- `get-yookassa-payment-status`
- `yookassa-webhook`
- таблица `billing_payments`

## 1. Применить миграцию

```bash
supabase db push
```

## 2. Добавить секреты в Supabase

```bash
supabase secrets set \
  YOOKASSA_SHOP_ID=your_shop_id \
  YOOKASSA_SECRET_KEY=your_secret_key
```

Опционально:

```bash
supabase secrets set YOOKASSA_ENABLE_RECURRING=false
```

## 3. Задеплоить функции

```bash
supabase functions deploy create-yookassa-payment
supabase functions deploy get-yookassa-payment-status
supabase functions deploy yookassa-webhook --no-verify-jwt
```

## 4. Указать webhook в YooKassa

Webhook URL:

```text
https://<your-project-ref>.supabase.co/functions/v1/yookassa-webhook
```

## 5. Проверить оплату

1. Открыть `Профиль`
2. Выбрать платный тариф
3. Открыть виджет ЮKassa
4. После успешной оплаты проверить, что:
   - обновился тариф
   - в `garden_data.onboarding.subscription` появилась подписка
   - в `notifications` появилась запись `subscription`

## Примечания

- Секретный ключ ЮKassa должен храниться только в Supabase secrets, не во фронте.
- В проекте сейчас включён сценарий разовой оплаты подписки. Автосписания можно включить позже через `YOOKASSA_ENABLE_RECURRING=true`, если аккаунт YooKassa это поддерживает.
- Для embedded widget использована официальная документация YooKassa:
  - https://yookassa.ru/developers/payment-acceptance/integration-scenarios/widget/quick-start
  - https://yookassa.ru/developers/payment-acceptance/integration-scenarios/widget/additional-settings/recurring-payments
