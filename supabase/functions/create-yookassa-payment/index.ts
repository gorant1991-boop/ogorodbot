import { createEmbeddedPayment, handleCors, json } from '../_shared/yookassa.ts'

Deno.serve(async (request) => {
  const cors = handleCors(request)
  if (cors) return cors

  try {
    const { offerId, vkUserId } = await request.json()
    return await createEmbeddedPayment({
      offerId: String(offerId ?? ''),
      vkUserId: Number(vkUserId ?? 0),
    })
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Не удалось создать платёж',
    }, 400)
  }
})
