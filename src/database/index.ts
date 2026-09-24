import env from "@util/env"
import pg from "pg"

export const db = new pg.Pool({
  connectionString: env.pgURL,
  max: 15
})

export async function initDB (): Promise<void> {
  await db.query(`
    create table if not exists users (
      tg_id      text primary key,
      username   text,
      name       text not null,
      jwt        text,
      banned     boolean not null default false,
      created_at timestamptz not null default now()
    )
  `)
}
