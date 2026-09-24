import "dotenv/config"

const require = (name: string): string => {
  const variable = process.env[name]
  if (!variable) throw new Error(`Missing variable ${name}`)
  return variable;
}

const port = Number.parseInt(process.env.PORT ?? "3000", 10)
if (!Number.isInteger(port) || port <= 0) throw new Error("Invalid PORT")

const env = {
  jwtSecret: require("JWT_SECRET"),
  port: port,
  bohudurURL: require("BOHUDUR_URL"),
  pgURL: require("PG_URL"),
  botToken: require("TG_BOT"),
  tgAdmin: require("TG_ADMIN")
} as const

export default env
