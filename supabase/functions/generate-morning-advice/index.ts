import { generateMorningAdvice, handleCors, json } from '../_shared/notifications.ts'

Deno.serve(async (request) => {
  const cors = handleCors(request)
  if (cors) return cors

  try {
    const body = request.method === 'POST'
      ? await request.json().catch(() => ({}))
      : {}

    return await generateMorningAdvice({
      nowIso: typeof body?.nowIso === 'string' ? body.nowIso : undefined,
      targetVkUserId: Number(body?.targetVkUserId ?? 0) || undefined,
      force: Boolean(body?.force),
    })
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Не удалось сгенерировать утренние советы',
    }, 400)
  }
})
