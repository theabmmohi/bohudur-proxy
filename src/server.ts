import { webhookCallback } from "grammy"
import { relayRequest } from "@/relay"
import { db, initDB } from "@db/index"
import { warmCache } from "@util/auth"
import { createHash } from "crypto"
import { bot } from "@tg/bot"
import env from "@util/env"
import http from "http"

await initDB()
await warmCache()

const telegramWebhookPath = "/telegram/webhook"
const telegramWebhookSecret = createHash("sha256").update(`${env.jwtSecret}:telegram`).digest("hex")
const handleTelegramUpdate = webhookCallback(bot, "http", { secretToken: telegramWebhookSecret })

function replyWithServerError(response: http.ServerResponse): void {
  if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain" })
  response.end("internal error")
}

const server = http.createServer((request, response) => {
  const isTelegramUpdate = request.method === "POST" && request.url === telegramWebhookPath
  const handling = isTelegramUpdate ? handleTelegramUpdate(request, response) : relayRequest(request, response)
  Promise.resolve(handling).catch((error) => {
    console.error("request error:", error instanceof Error ? error.message : error)
    replyWithServerError(response)
  })
})

server.listen(env.port, () => console.log(`listening on ${env.port}`))

const publicURL = env.publicURL.replace(/\/+$/, "")
if (publicURL) {
  await bot.api.setWebhook(publicURL + telegramWebhookPath, { secret_token: telegramWebhookSecret })
  console.log("telegram webhook set")
} else {
  void bot.start({ onStart: () => console.log("telegram polling started") })
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close()
    void db.end().finally(() => process.exit(0))
  })
}
