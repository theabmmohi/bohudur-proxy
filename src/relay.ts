import type { IncomingMessage, ServerResponse } from "http"
import { verify } from "@util/auth"
import env from "@util/env"

const targetBaseUrl = env.bohudurURL.replace(/\/+$/, "")
const upstreamTimeoutMilliseconds = 30_000

const hopByHopHeaders = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "te",
  "content-length",
  "accept-encoding",
  "x-relay-key"
])

const identityHeaderPrefixes = ["x-forwarded-", "cf-", "x-render-", "rndr-"]
const identityHeaders = new Set(["forwarded", "via", "x-real-ip", "true-client-ip", "x-request-id"])

function buildUpstreamHeaders(request: IncomingMessage): Record<string, string> {
  const upstreamHeaders: Record<string, string> = {}
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue
    if (hopByHopHeaders.has(name) || identityHeaders.has(name)) continue
    if (identityHeaderPrefixes.some((prefix) => name.startsWith(prefix))) continue
    upstreamHeaders[name] = Array.isArray(value) ? value.join(", ") : value
  }
  return upstreamHeaders
}

async function readRequestBody(request: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return new Uint8Array(Buffer.concat(chunks))
}

export async function relayRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const memberTelegramId = await verify(request.headers["x-relay-key"] as string | undefined)
  if (!memberTelegramId) {
    response.writeHead(401, { "content-type": "text/plain" }).end("unauthorized")
    return
  }
  const method = request.method ?? "GET"
  const hasBody = method !== "GET" && method !== "HEAD"
  const requestBody = hasBody ? await readRequestBody(request) : undefined
  try {
    const upstreamResponse = await fetch(targetBaseUrl + (request.url ?? "/"), {
      method,
      headers: buildUpstreamHeaders(request),
      body: requestBody,
      redirect: "manual",
      signal: AbortSignal.timeout(upstreamTimeoutMilliseconds)
    })
    const responseHeaders: Record<string, string | string[]> = {}
    upstreamResponse.headers.forEach((value, name) => {
      if (["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"].includes(name)) return
      responseHeaders[name] = value
    })
    const cookies = upstreamResponse.headers.getSetCookie()
    if (cookies.length > 0) responseHeaders["set-cookie"] = cookies
    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer())
    response.writeHead(upstreamResponse.status, responseHeaders).end(responseBody)
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError"
    response
      .writeHead(isTimeout ? 504 : 502, { "content-type": "text/plain" })
      .end(isTimeout ? "gateway timeout" : "bad gateway")
  }
}
