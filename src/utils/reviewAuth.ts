const REVIEW_AUTH_STORAGE_KEY = 'ogorodbot_review_auth'
export const REVIEW_USER_ID = 990000001

export interface ReviewAuthState {
  login: string
  password: string
  userId: number
}

export function saveReviewAuth(auth: ReviewAuthState | null) {
  if (!auth) {
    localStorage.removeItem(REVIEW_AUTH_STORAGE_KEY)
    return
  }
  localStorage.setItem(REVIEW_AUTH_STORAGE_KEY, JSON.stringify(auth))
}

export function loadReviewAuth(): ReviewAuthState | null {
  try {
    const raw = localStorage.getItem(REVIEW_AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ReviewAuthState
    if (!parsed?.login || !parsed?.password || !parsed?.userId) return null
    return parsed
  } catch {
    return null
  }
}

export function clearReviewAuth() {
  saveReviewAuth(null)
}
