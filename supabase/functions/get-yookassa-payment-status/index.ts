import { applySuccessfulPayment, fetchPaymentStatus, handleCors, json } from '../_shared/yookassa.ts'

Deno.serve(async (request) => {
  const cors = handleCors(request)
  if (cors) return cors

  try {
    const { paymentId } = await request.json()
    if (!paymentId) return json({ error: 'paymentId is required' }, 400)

    const payment = await fetchPaymentStatus(String(paymentId))
    const subscription = payment.status === 'succeeded' && payment.paid
      ? await applySuccessfulPayment(payment)
      : null

    return json({
      paymentId: payment.id,
      status: payment.status,
      paid: payment.paid,
      subscription,
    })
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Не удалось получить статус платежа',
    }, 400)
  }
})
