import { SignJWT, jwtVerify } from "jose"
import { activeTokens } from "@db/users"
import env from "@util/env"

const secret = new TextEncoder().encode(env.jwtSecret)
const current = new Map<string, string>()

export async function warmCache(): Promise<void> {
  for (const { tg_id, jwt } of await activeTokens()) current.set(tg_id, jwt)
}

export function parseDuration(input: string): number | null {
  const m = /^(\d+)([mhd])$/.exec(input)
  if (!m) return null
  const secs = Number(m[1]) * { m: 60, h: 3600, d: 86400 }[m[2] as "m" | "h" | "d"]
  return secs > 0 ? secs : null
}

export async function issue(tgId: string, expiresIn: string): Promise<string> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(tgId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)
  current.set(tgId, token)
  return token
}

export function revoke(tgId: string): void {
  current.delete(tgId)
}

export async function verify(token: string | undefined): Promise<string | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] })
    const id = payload.sub
    return id && current.get(id) === token ? id : null
  } catch { return null }
}
