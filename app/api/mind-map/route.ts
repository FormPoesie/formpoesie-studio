import { env } from 'cloudflare:workers';
import {
  getInventoryAccess,
  requireInventoryAdmin,
} from '@/lib/inventory-bridge';

type MindMapNode = {
  id: string;
  title: string;
  note: string;
  color: string;
  x: number;
  y: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type MindMapEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  createdBy: string | null;
  createdAt: string;
};

type MindMapComment = {
  id: string;
  nodeId: string;
  body: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

const allowedColors = new Set([
  '#4a5c58',
  '#b5895a',
  '#72665a',
  '#7b5962',
  '#52677a',
  '#6c7454',
]);

function cleanText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function finitePosition(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(24, Math.min(1050, number))
    : fallback;
}

async function identity(request: Request) {
  const access = await getInventoryAccess(request);
  const id = access.user?.id || access.user?.email || 'formpoesie';
  const name =
    access.profile?.name?.trim() ||
    access.user?.email?.split('@')[0] ||
    'FormPoesie';
  return { id, name };
}

async function ensureRootNode(author: string) {
  const existing = await env.DB.prepare(
    'SELECT id FROM mind_map_nodes LIMIT 1',
  ).first<{ id: string }>();
  if (existing) return;
  const instant = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO mind_map_nodes
      (id, title, note, color, position_x, position_y, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      'FormPoesie Content',
      'Zentrale Sammlung für Themen, Geschichten und konkrete Content-Ideen.',
      '#4a5c58',
      440,
      270,
      author,
      author,
      instant,
      instant,
    )
    .run();
}

export async function GET(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const author = await identity(request);
  await ensureRootNode(author.name);
  const [nodes, edges, comments] = await Promise.all([
    env.DB.prepare(
      `SELECT id, title, note, color, position_x AS x, position_y AS y,
              created_by AS createdBy, updated_by AS updatedBy,
              created_at AS createdAt, updated_at AS updatedAt
       FROM mind_map_nodes ORDER BY created_at`,
    ).all<MindMapNode>(),
    env.DB.prepare(
      `SELECT id, source_node_id AS sourceNodeId,
              target_node_id AS targetNodeId, created_by AS createdBy,
              created_at AS createdAt
       FROM mind_map_edges ORDER BY created_at`,
    ).all<MindMapEdge>(),
    env.DB.prepare(
      `SELECT id, node_id AS nodeId, body, author_id AS authorId,
              author_name AS authorName, created_at AS createdAt,
              updated_at AS updatedAt
       FROM mind_map_comments ORDER BY created_at`,
    ).all<MindMapComment>(),
  ]);
  return Response.json({
    nodes: nodes.results || [],
    edges: edges.results || [],
    comments: comments.results || [],
    viewer: author,
  });
}

export async function POST(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const body = (await request.json()) as Record<string, unknown>;
  const author = await identity(request);
  const instant = new Date().toISOString();

  if (body.kind === 'comment') {
    const nodeId = cleanText(body.nodeId, 80);
    const commentBody = cleanText(body.body, 1200);
    if (!nodeId || !commentBody)
      return Response.json(
        { error: 'Knoten und Kommentartext sind erforderlich.' },
        { status: 400 },
      );
    const comment: MindMapComment = {
      id: crypto.randomUUID(),
      nodeId,
      body: commentBody,
      authorId: author.id,
      authorName: author.name,
      createdAt: instant,
      updatedAt: instant,
    };
    await env.DB.prepare(
      `INSERT INTO mind_map_comments
        (id, node_id, body, author_id, author_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        comment.id,
        comment.nodeId,
        comment.body,
        comment.authorId,
        comment.authorName,
        instant,
        instant,
      )
      .run();
    return Response.json({ comment }, { status: 201 });
  }

  if (body.kind === 'edge') {
    const sourceNodeId = cleanText(body.sourceNodeId, 80);
    const targetNodeId = cleanText(body.targetNodeId, 80);
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId)
      return Response.json(
        { error: 'Für eine Verbindung werden zwei Knoten benötigt.' },
        { status: 400 },
      );
    const edge: MindMapEdge = {
      id: crypto.randomUUID(),
      sourceNodeId,
      targetNodeId,
      createdBy: author.name,
      createdAt: instant,
    };
    await env.DB.prepare(
      `INSERT OR IGNORE INTO mind_map_edges
        (id, source_node_id, target_node_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        edge.id,
        edge.sourceNodeId,
        edge.targetNodeId,
        edge.createdBy,
        edge.createdAt,
      )
      .run();
    return Response.json({ edge }, { status: 201 });
  }

  const title = cleanText(body.title, 120) || 'Neue Idee';
  const color = allowedColors.has(String(body.color))
    ? String(body.color)
    : '#4a5c58';
  const node: MindMapNode = {
    id: crypto.randomUUID(),
    title,
    note: cleanText(body.note, 2000),
    color,
    x: finitePosition(body.x, 440),
    y: finitePosition(body.y, 270),
    createdBy: author.name,
    updatedBy: author.name,
    createdAt: instant,
    updatedAt: instant,
  };
  const parentId = cleanText(body.parentId, 80);
  const statements = [
    env.DB.prepare(
      `INSERT INTO mind_map_nodes
        (id, title, note, color, position_x, position_y, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      node.id,
      node.title,
      node.note,
      node.color,
      node.x,
      node.y,
      node.createdBy,
      node.updatedBy,
      instant,
      instant,
    ),
  ];
  let edge: MindMapEdge | null = null;
  if (parentId) {
    edge = {
      id: crypto.randomUUID(),
      sourceNodeId: parentId,
      targetNodeId: node.id,
      createdBy: author.name,
      createdAt: instant,
    };
    statements.push(
      env.DB.prepare(
        `INSERT INTO mind_map_edges
          (id, source_node_id, target_node_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        edge.id,
        edge.sourceNodeId,
        edge.targetNodeId,
        edge.createdBy,
        edge.createdAt,
      ),
    );
  }
  await env.DB.batch(statements);
  return Response.json({ node, edge }, { status: 201 });
}

export async function PATCH(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const body = (await request.json()) as Record<string, unknown>;
  const id = cleanText(body.id, 80);
  const title = cleanText(body.title, 120);
  if (!id || !title)
    return Response.json(
      { error: 'Knoten und Titel sind erforderlich.' },
      { status: 400 },
    );
  const author = await identity(request);
  const color = allowedColors.has(String(body.color))
    ? String(body.color)
    : '#4a5c58';
  const node = {
    id,
    title,
    note: cleanText(body.note, 2000),
    color,
    x: finitePosition(body.x, 440),
    y: finitePosition(body.y, 270),
    updatedBy: author.name,
    updatedAt: new Date().toISOString(),
  };
  await env.DB.prepare(
    `UPDATE mind_map_nodes SET title = ?, note = ?, color = ?,
       position_x = ?, position_y = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      node.title,
      node.note,
      node.color,
      node.x,
      node.y,
      node.updatedBy,
      node.updatedAt,
      node.id,
    )
    .run();
  return Response.json({ node });
}

export async function DELETE(request: Request) {
  const denied = await requireInventoryAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get('id'), 80);
  const kind = url.searchParams.get('kind');
  if (!id) return Response.json({ error: 'Eintrag fehlt.' }, { status: 400 });
  if (kind === 'comment') {
    await env.DB.prepare('DELETE FROM mind_map_comments WHERE id = ?')
      .bind(id)
      .run();
  } else if (kind === 'edge') {
    await env.DB.prepare('DELETE FROM mind_map_edges WHERE id = ?')
      .bind(id)
      .run();
  } else {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM mind_map_comments WHERE node_id = ?').bind(
        id,
      ),
      env.DB.prepare(
        'DELETE FROM mind_map_edges WHERE source_node_id = ? OR target_node_id = ?',
      ).bind(id, id),
      env.DB.prepare('DELETE FROM mind_map_nodes WHERE id = ?').bind(id),
    ]);
  }
  return Response.json({ deleted: true });
}
