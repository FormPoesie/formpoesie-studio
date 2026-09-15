async function database() {
  const moduleName = 'cloudflare:workers';
  const runtime = await import(/* @vite-ignore */ moduleName);
  return runtime.env.DB as D1Database;
}

export type CloudflareUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

const seedUsers = [
  ['23175293-b48b-46e9-bb2d-ee03218019b7', 'formpoesie@gmail.com', 'Marlon', 'inhaber', '22774fc6cadc787feb7d02d781fcc8ec', 'fd79f14d4c52750efe035c6a1a38c64d6c3c604dcd4bfccc19db5aacc89eec91'],
  ['4e611679-ee4a-456b-b242-2ca8318b4ce0', 'jasmin_grossmann@outlook.de', 'Jasmin', 'vollzugriff', '070efb67c445c55b852986f1ad63b675', '6a956c1ec22c9f843bb61b0a40f0861d71fbd32191538a7d2f22fa1cd580ea9f'],
  ['30d12d05-c8df-4880-8418-42d4d8d12bea', 'jonasgrossmann09@gmail.com', 'Jonas', 'markt', '4fe57a33d490892ee56ed5f462e62d38', '85788d59be5ef1d8aed1770e01eb4f1083ee47199c1c4a33fa4ba2f531790f14'],
] as const;

async function ensureAuthTables() {
  const db = await database();
  await db.prepare(`CREATE TABLE IF NOT EXISTS inventory_users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL, role TEXT NOT NULL, password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS inventory_sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
  const now = new Date().toISOString();
  await db.batch(seedUsers.map((user) => db.prepare(
    `INSERT INTO inventory_users
      (id,email,name,role,password_salt,password_hash,created_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       email=excluded.email,name=excluded.name,role=excluded.role,
       password_salt=excluded.password_salt,password_hash=excluded.password_hash
     WHERE inventory_users.password_hash IN (
       'f182cd32d2eb67bcae2e87b343f92421f31f3d66dd5f8264d923c14882fc5f61',
       'a64acb6d9362fd586813889e9c5f60e76800ac3ba1555b7a2fa89525f8b52240',
       '02d277d0c0abdf64a1fe18c37a7aea5fb93a69888eb72bac5989e042562903d3'
     )`,
  ).bind(...user, now)));
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256));
}

export async function authenticateInventoryUser(email: string, password: string) {
  await ensureAuthTables();
  const db = await database();
  const row = await db.prepare(`SELECT id,email,name,role,password_salt AS salt,password_hash AS hash
    FROM inventory_users WHERE email=? COLLATE NOCASE`).bind(email.trim()).first<CloudflareUser & {salt:string;hash:string}>();
  if (!row || (await passwordHash(password, row.salt)) !== row.hash) return null;
  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 86400000).toISOString();
  await db.prepare('INSERT INTO inventory_sessions (token,user_id,expires_at,created_at) VALUES (?,?,?,?)')
    .bind(token, row.id, expires, now.toISOString()).run();
  return { token, user: { id: row.id, email: row.email, name: row.name, role: row.role } };
}

export async function inventoryUserForToken(token: string) {
  if (!token) return null;
  await ensureAuthTables();
  const db = await database();
  return db.prepare(`SELECT u.id,u.email,u.name,u.role FROM inventory_sessions s
    JOIN inventory_users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?`)
    .bind(token, new Date().toISOString()).first<CloudflareUser>();
}

export async function deleteInventorySession(token: string) {
  if (token) {
    const db = await database();
    await db.prepare('DELETE FROM inventory_sessions WHERE token=?').bind(token).run();
  }
}

export async function updateInventoryAccount(
  token: string,
  changes: { name?: string; email?: string; currentPassword?: string; password?: string },
) {
  const user = await inventoryUserForToken(token);
  if (!user) return { error: 'Anmeldung erforderlich.', status: 401 };
  const db = await database();
  if (changes.password) {
    if (changes.password.length < 10)
      return { error: 'Das neue Passwort muss mindestens 10 Zeichen lang sein.', status: 400 };
    const credential = await db.prepare('SELECT password_salt AS salt,password_hash AS hash FROM inventory_users WHERE id=?')
      .bind(user.id).first<{ salt: string; hash: string }>();
    if (!credential || !changes.currentPassword ||
        (await passwordHash(changes.currentPassword, credential.salt)) !== credential.hash)
      return { error: 'Das aktuelle Passwort ist nicht korrekt.', status: 400 };
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    await db.prepare('UPDATE inventory_users SET password_salt=?,password_hash=? WHERE id=?')
      .bind(salt, await passwordHash(changes.password, salt), user.id).run();
  }
  const name = changes.name?.trim() || user.name;
  const email = changes.email?.trim() || user.email;
  try {
    await db.prepare('UPDATE inventory_users SET name=?,email=? WHERE id=?')
      .bind(name, email, user.id).run();
  } catch {
    return { error: 'Diese E-Mail-Adresse wird bereits verwendet.', status: 400 };
  }
  return { saved: true, passwordChanged: Boolean(changes.password) };
}
