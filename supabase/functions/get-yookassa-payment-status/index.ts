import { applySuccessfulPayment, fetchPaymentStatus, handleCors, json } from '../_shared/yookassa.ts'

Deno.serve(async (request) => {
  const cors = handleCors(request)
  if (cors) return cors

  try {
    const { paymentId, vkUserId } = await request.json()
    if (!paymentId) return json({ error: 'paymentId is required' }, 400)

    const payment = await fetchPaymentStatus(String(paymentId))
    if (Number(vkUserId ?? 0) > 0 && Number(payment.metadata?.vk_user_id ?? 0) !== Number(vkUserId)) {
      return json({ error: 'Платёж привязан к другому пользователю' }, 403)
    }
    const applied = payment.status === 'succeeded' && payment.paid
      ? await applySuccessfulPayment(payment)
      : null

    return json({
      paymentId: payment.id,
      status: payment.status,
      paid: payment.paid,
      subscription: applied?.subscription ?? null,
      onboardingPatch: applied?.onboardingPatch ?? null,
      offerId: applied?.offerId ?? null,
    })
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Не удалось получить статус платежа',
    }, 400)
  }
})
