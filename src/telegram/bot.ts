import { getUser, getUserByUsername, saveUser, setBanned } from "@db/users"
import { issue, revoke, verify, parseDuration } from "@util/auth"
import type { User as TelegramUser } from "grammy/types"
import type { User as DatabaseUser } from "@db/users"
import { Bot, Context, Keyboard } from "grammy"
import { decodeJwt } from "jose"
import env from "@util/env"

export const bot = new Bot(env.botToken)

const privateChat = bot.filter(
  (context): context is Context & { from: TelegramUser } =>
    context.from !== undefined && context.chat?.type === "private"
)

const markdownV2 = { parse_mode: "MarkdownV2" } as const
const pendingInputs = new Map<string, "duration" | "search" | "toggleBan">()
const isAdmin = (context: { from: TelegramUser }) => String(context.from.id) === env.tgAdmin
const buttonLabels = {
  get: "🔑 Get",
  rotate: "🔄 Rotate",
  search: "🔍 Search",
  toggleBan: "🚫 Ban/Unban"
}

function buildMenuKeyboard(isAdminUser: boolean) {
  const keyboard = new Keyboard().text(buttonLabels.get).text(buttonLabels.rotate)
  if (isAdminUser) keyboard.row().text(buttonLabels.search).text(buttonLabels.toggleBan)
  return keyboard.resized().persistent()
}

function formatKeyMessage(token: string): string {
  const expirationTimestamp = decodeJwt(token).exp
  const expiresAt = expirationTimestamp ? new Date(expirationTimestamp * 1000).toUTCString() : "never"
  return (
    "*Your key*\n" +
    `Expires: ${expiresAt}\n\n` +
    "`" + token + "`\n\n" +
    "Send it as the `x-relay-key` header\\. Rotate replaces it\\."
  )
}

function formatUserRow(user: DatabaseUser): string {
  const safeName = user.name.trim().replace(/[`\\]/g, "") || "-"
  const username = user.username ? `@${user.username}` : "-"
  return [
    `Telegram ID: \`${user.tg_id}\``,
    `Username: ${username}`,
    `Name: ${safeName}`,
    `JWT: \`${user.jwt ?? "-"}\``,
    `Banned: ${user.banned ? "Yes" : "No"}`,
  ].join("\n")
}

async function findUserByIdentifier(identifier: string): Promise<DatabaseUser | null | undefined> {
  if (/^\d+$/.test(identifier)) return getUser(identifier)
  if (identifier.startsWith("@") && identifier.length > 1) return getUserByUsername(identifier.slice(1))
  return undefined
}

privateChat.command("start", async (context) => {
  pendingInputs.delete(String(context.from.id))
  await context.reply("Use the buttons below to get or rotate your relay key\\.", {
    ...markdownV2,
    reply_markup: buildMenuKeyboard(isAdmin(context)),
  })
})

privateChat.hears(buttonLabels.get, async (context) => {
  const telegramId = String(context.from.id)
  pendingInputs.delete(telegramId)
  const user = await getUser(telegramId)
  if (user?.banned) return context.reply("You're blocked\\.", markdownV2)
  if (user?.jwt && (await verify(user.jwt))) return context.reply(formatKeyMessage(user.jwt), markdownV2)
  pendingInputs.set(telegramId, "duration")
  await context.reply("No active key\\. How long should it last? e\\.g\\. 30m, 12h, 7d", markdownV2)
})

privateChat.hears(buttonLabels.rotate, async (context) => {
  pendingInputs.set(String(context.from.id), "duration")
  await context.reply("How long should the new key last? e\\.g\\. 30m, 12h, 7d", markdownV2)
})

privateChat.hears(buttonLabels.search, async (context) => {
  if (!isAdmin(context)) return
  pendingInputs.set(String(context.from.id), "search")
  await context.reply("Send a Telegram ID \\(digits\\) or an @username\\.", markdownV2)
})

privateChat.hears(buttonLabels.toggleBan, async (context) => {
  if (!isAdmin(context)) return
  pendingInputs.set(String(context.from.id), "toggleBan")
  await context.reply("Send a Telegram ID \\(digits\\) or an @username to ban/unban\\.", markdownV2)
})

privateChat.on("message:text", async (context) => {
  const telegramId = String(context.from.id)
  const pendingInput = pendingInputs.get(telegramId)
  const messageText = context.msg.text.trim()

  if (pendingInput === "duration") {
    const duration = messageText.toLowerCase()
    if (!parseDuration(duration)) {
      return context.reply("Invalid\\. Use a number plus m, h or d, e\\.g\\. 30m, 12h, 7d", markdownV2)
    }
    pendingInputs.delete(telegramId)
    if ((await getUser(telegramId))?.banned) return context.reply("You're blocked\\.", markdownV2)
    const displayName = [context.from.first_name, context.from.last_name].filter(Boolean).join(" ")
    const token = await issue(telegramId, duration)
    await saveUser(telegramId, context.from.username ?? null, displayName, token)
    return context.reply(formatKeyMessage(token), markdownV2)
  }

  if ((pendingInput === "search" || pendingInput === "toggleBan") && isAdmin(context)) {
    const user = await findUserByIdentifier(messageText)
    if (user === undefined) {
      return context.reply("Send digits \\(Telegram ID\\) or @username\\.", markdownV2)
    }
    pendingInputs.delete(telegramId)
    if (!user) return context.reply("Not found\\.", markdownV2)
    if (pendingInput === "search") return context.reply(formatUserRow(user), markdownV2)
    const isNowBanned = !user.banned
    if (isNowBanned) revoke(user.tg_id)
    await setBanned(user.tg_id, isNowBanned)
    const updatedUser = (await getUser(user.tg_id)) ?? user
    const title = isNowBanned ? "*Banned*" : "*Unbanned*"
    return context.reply(`${title}\n${formatUserRow(updatedUser)}`, markdownV2)
  }

  if (!pendingInput) {
    return context.reply("Nothing to do !")
  }
})

bot.catch((error) => console.error("Bot error: ", error.message))
