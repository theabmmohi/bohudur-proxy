import { db } from "@db/index"

export type User = {
  tg_id: string;
  username: string | null;
  name: string;
  jwt: string | null;
  banned: boolean;
}

export async function getUser(tgId: string): Promise<User | null> {
  const { rows } = await db.query<User>(`
    select * from users where tg_id = $1
  `, [tgId])
  return rows[0] ?? null
}

export async function saveUser(tgId: string, username: string | null, name: string, jwt: string): Promise<void> {
  await db.query(`
    insert into users (tg_id, username, name, jwt) values ($1, $2, $3, $4)
    on conflict (tg_id) do update set username = $2, name = $3, jwt = $4
  `, [tgId, username, name, jwt])
}

export async function clearJwt(tgId: string): Promise<void> {
  await db.query(`
    update users set jwt = null where tg_id = $1
  `, [tgId])
}

export async function setBanned(tgId: string, banned: boolean): Promise<boolean> {
  const r = await db.query(`
    update users set banned = $2, jwt = case when $2 then null else jwt end where tg_id = $1
  `, [tgId, banned])
  return (r.rowCount ?? 0) > 0
}

export async function listUsers(): Promise<User[]> {
  const { rows } = await db.query<User>(`
    select * from users order by created_at
  `)
  return rows
}

export async function activeTokens(): Promise<{ tg_id: string; jwt: string }[]> {
  const { rows } = await db.query<{ tg_id: string; jwt: string }>(`
    select tg_id, jwt from users where jwt is not null and not banned
  `)
  return rows
}
