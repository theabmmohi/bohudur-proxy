import "dotenv/config"

const require = (name: string): string => {
  const variable = process.env[name]
  if (!variable) throw new Error(`Missing variable ${variable}`)
  return variable;
}

const env = {
  bohudurURL: require("BOHUDUR_URL"),
  pgURL: require("PG_URL"),
  botToken: require("TG_BOT"),
  tgAdmin: require("TG_ADMIN")
} as const

export default env
