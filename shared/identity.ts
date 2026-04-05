export function hashIdentityToUserId(identity: string) {
  let hash = 0
  for (let index = 0; index < identity.length; index += 1) {
    hash = (hash * 31 + identity.charCodeAt(index)) | 0
  }

  const normalized = Math.abs(hash) % 2147483000
  return Math.max(1000, normalized)
}
