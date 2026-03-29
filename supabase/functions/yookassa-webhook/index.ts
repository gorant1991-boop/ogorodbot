import { applySuccessfulPayment, fetchPaymentStatus, handleCors, json } from '../_shared/yookassa.ts'

Deno.serve(async (request) => {
  const cors = handleCors(request)
  if (cors) return cors

  try {
    const payload = await request.json()
    const paymentId = payload?.object?.id

    if (!paymentId) return json({ ok: true })

    const payment = await fetchPaymentStatus(String(paymentId))

    if (payment.status === 'succeeded' && payment.paid) {
      await applySuccessfulPayment(payment)
    }

    return json({ ok: true })
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Webhook handling failed',
    }, 400)
  }
})
