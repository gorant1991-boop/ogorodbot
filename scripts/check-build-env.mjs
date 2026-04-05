import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const requiredEnvVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_OPENWEATHER_API_KEY',
]

function parseEnvFile(filePath) {
  const result = {}
  if (!existsSync(filePath)) return result

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue

    const [, key, rawValue] = match
    const value = rawValue
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2')

    result[key] = value
  }

  return result
}

const envFiles = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
]

const envFromFiles = envFiles.reduce((acc, fileName) => {
  const absolutePath = resolve(process.cwd(), fileName)
  return { ...acc, ...parseEnvFile(absolutePath) }
}, {})

const resolvedEnv = {
  ...envFromFiles,
  ...process.env,
}

const missingEnvVars = requiredEnvVars.filter(name => {
  const value = resolvedEnv[name]
  return typeof value !== 'string' || value.trim().length === 0
})

if (missingEnvVars.length > 0) {
  console.error('Missing required build env vars:')
  for (const name of missingEnvVars) {
    console.error(`- ${name}`)
  }
  console.error('This build would ship with broken auth or weather, so the build is being stopped.')
  process.exit(1)
}
