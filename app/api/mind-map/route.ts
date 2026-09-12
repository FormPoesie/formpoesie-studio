import { env } from 'cloudflare:workers';
import { getInventoryAccess } from '@/lib/inventory-bridge';

type MindMapStatus = 'waiting_review' | 'in_progress' | 'completed';

type MindMapNode = {
  id: string;
  title: string;
  note: string;
  status: MindMapStatus;
  color: string;
  textColor: string;
  x: number;
  y: number;
  width: number;
  height: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type MindMapEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  color: string | null;
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

const allowedStatuses = new Set<MindMapStatus>([
  'waiting_review',
  'in_progress',
  'completed',
]);

function cleanStatus(value: unknown): MindMapStatus {
  return allowedStatuses.has(value as MindMapStatus)
    ? (value as MindMapStatus)
    : 'waiting_review';
}

function cleanText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function cleanColor(value: unknown, fallback = '#4a5c58') {
  const color = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
}

function optionalColor(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const color = cleanColor(value, '');
  return color || null;
}

function contrastTextColor(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.43 ? '#1a1a18' : '#ffffff';
}

function finiteNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, number))
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
  const color = '#4a5c58';
  await env.DB.prepare(
    `INSERT INTO mind_map_nodes
      (id, title, note, status, color, text_color, position_x, position_y, width, height,
       created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      'Neues Board',
      'Sammle und verbinde hier Ideen, Projekte, Aufgaben und Notizen.',
      'waiting_review',
      color,
      contrastTextColor(color),
      440,
      270,
      260,
      160,
      author,
      author,
      instant,
      instant,
    )
    .run();
}

export async function GET(request: Request) {
  const author = await identity(request);
  await ensureRootNode(author.name);
  const [nodes, edges, comments] = await Promise.all([
    env.DB.prepare(
      `SELECT id, title, note, status, color, text_color AS textColor,
              position_x AS x, position_y AS y, width, height,
              created_by AS createdBy, updated_by AS updatedBy,
              created_at AS createdAt, updated_at AS updatedAt
       FROM mind_map_nodes ORDER BY created_at`,
    ).all<MindMapNode>(),
    env.DB.prepare(
      `SELECT id, source_node_id AS sourceNodeId, target_node_id AS targetNodeId,
              color, created_by AS createdBy, created_at AS createdAt
       FROM mind_map_edges ORDER BY created_at`,
    ).all<MindMapEdge>(),
    env.DB.prepare(
      `SELECT id, node_id AS nodeId, body, author_id AS authorId,
              author_name AS authorName, created_at AS createdAt, updated_at AS updatedAt
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
  const body = (await request.json()) as Record<string, unknown>;
  const author = await identity(request);
  const instant = new Date().toISOString();

  if (body.kind === 'comment') {
    const nodeId = cleanText(body.nodeId, 80);
    const commentBody = cleanText(body.body, 4000);
    if (!nodeId || !commentBody) {
      return Response.json(
        { error: 'Kachel und Kommentartext sind erforderlich.' },
        { status: 400 },
      );
    }
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
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
      return Response.json(
        { error: 'Für eine Verbindung werden zwei Kacheln benötigt.' },
        { status: 400 },
      );
    }
    const existing = await env.DB.prepare(
      `SELECT id, source_node_id AS sourceNodeId, target_node_id AS targetNodeId,
              color, created_by AS createdBy, created_at AS createdAt
       FROM mind_map_edges WHERE source_node_id = ? AND target_node_id = ?`,
    )
      .bind(sourceNodeId, targetNodeId)
      .first<MindMapEdge>();
    if (existing) return Response.json({ edge: existing });
    const edge: MindMapEdge = {
      id: crypto.randomUUID(),
      sourceNodeId,
      targetNodeId,
      color: optionalColor(body.color),
      createdBy: author.name,
      createdAt: instant,
    };
    await env.DB.prepare(
      `INSERT INTO mind_map_edges
        (id, source_node_id, target_node_id, color, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        edge.id,
        edge.sourceNodeId,
        edge.targetNodeId,
        edge.color,
        edge.createdBy,
        edge.createdAt,
      )
      .run();
    return Response.json({ edge }, { status: 201 });
  }

  const color = cleanColor(body.color);
  const node: MindMapNode = {
    id: crypto.randomUUID(),
    title: cleanText(body.title, 160) || 'Neue Kachel',
    note: cleanText(body.note, 8000),
    status: cleanStatus(body.status),
    color,
    textColor: contrastTextColor(color),
    x: finiteNumber(body.x, 440, 0, 20000),
    y: finiteNumber(body.y, 270, 0, 20000),
    width: finiteNumber(body.width, 240, 160, 1400),
    height: finiteNumber(body.height, 150, 110, 1800),
    createdBy: author.name,
    updatedBy: author.name,
    createdAt: instant,
    updatedAt: instant,
  };
  const parentId = cleanText(body.parentId, 80);
  const statements = [
    env.DB.prepare(
      `INSERT INTO mind_map_nodes
        (id, title, note, status, color, text_color, position_x, position_y, width, height,
         created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      node.id,
      node.title,
      node.note,
      node.status,
      node.color,
      node.textColor,
      node.x,
      node.y,
      node.width,
      node.height,
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
      color: null,
      createdBy: author.name,
      createdAt: instant,
    };
    statements.push(
      env.DB.prepare(
        `INSERT INTO mind_map_edges
          (id, source_node_id, target_node_id, color, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        edge.id,
        edge.sourceNodeId,
        edge.targetNodeId,
        edge.color,
        edge.createdBy,
        edge.createdAt,
      ),
    );
  }
  await env.DB.batch(statements);
  return Response.json({ node, edge }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const id = cleanText(body.id, 80);
  if (!id) return Response.json({ error: 'Eintrag fehlt.' }, { status: 400 });

  if (body.kind === 'edge') {
    const color = optionalColor(body.color);
    await env.DB.prepare('UPDATE mind_map_edges SET color = ? WHERE id = ?')
      .bind(color, id)
      .run();
    return Response.json({ edge: { id, color } });
  }

  const title = cleanText(body.title, 160);
  if (!title)
    return Response.json(
      { error: 'Ein Titel ist erforderlich.' },
      { status: 400 },
    );
  const author = await identity(request);
  const color = cleanColor(body.color);
  const node = {
    id,
    title,
    note: cleanText(body.note, 8000),
    status: cleanStatus(body.status),
    color,
    textColor: contrastTextColor(color),
    x: finiteNumber(body.x, 440, 0, 20000),
    y: finiteNumber(body.y, 270, 0, 20000),
    width: finiteNumber(body.width, 240, 160, 1400),
    height: finiteNumber(body.height, 150, 110, 1800),
    updatedBy: author.name,
    updatedAt: new Date().toISOString(),
  };
  await env.DB.prepare(
    `UPDATE mind_map_nodes SET title = ?, note = ?, status = ?, color = ?, text_color = ?,
       position_x = ?, position_y = ?, width = ?, height = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      node.title,
      node.note,
      node.status,
      node.color,
      node.textColor,
      node.x,
      node.y,
      node.width,
      node.height,
      node.updatedBy,
      node.updatedAt,
      node.id,
    )
    .run();
  return Response.json({ node });
}

export async function DELETE(request: Request) {
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
