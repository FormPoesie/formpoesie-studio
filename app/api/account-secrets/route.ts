import { env } from 'cloudflare:workers';
import { requireInventoryAdmin } from '@/lib/inventory-bridge';

type EncryptedSecret = {
  accountId: string;
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
};

function validSecret(value: unknown): value is EncryptedSecret {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<EncryptedSecret>;
  return Boolean(
    item.accountId &&
    item.ciphertext &&
    item.iv &&
    item.salt &&
    Number.isInteger(item.iterations) &&
    Number(item.iterations) >= 100000,
  );
}

export async function GET(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const rows = await env.DB.prepare(
    `SELECT account_id AS accountId, ciphertext, iv, salt, iterations
     FROM account_secrets ORDER BY account_id`,
  ).all<EncryptedSecret>();
  return Response.json({ secrets: rows.results || [] });
}

export async function POST(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const body = (await request.json()) as { secret?: unknown };
  if (!validSecret(body.secret))
    return Response.json(
      { error: 'Verschlüsselter Zugang fehlt.' },
      { status: 400 },
    );
  const instant = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO account_secrets
      (account_id, ciphertext, iv, salt, iterations, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       ciphertext = excluded.ciphertext,
       iv = excluded.iv,
       salt = excluded.salt,
       iterations = excluded.iterations,
       updated_at = excluded.updated_at`,
  )
    .bind(
      body.secret.accountId,
      body.secret.ciphertext,
      body.secret.iv,
      body.secret.salt,
      body.secret.iterations,
      instant,
      instant,
    )
    .run();
  return Response.json({ saved: true });
}

export async function DELETE(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const body = (await request.json()) as { accountId?: string };
  if (!body.accountId)
    return Response.json({ error: 'Konto fehlt.' }, { status: 400 });
  await env.DB.prepare('DELETE FROM account_secrets WHERE account_id = ?')
    .bind(body.accountId)
    .run();
  return Response.json({ deleted: true });
}
