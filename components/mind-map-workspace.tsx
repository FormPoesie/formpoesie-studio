'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Grip,
  Loader2,
  MessageCircle,
  Network,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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

type MindMapPayload = {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  comments: MindMapComment[];
  viewer: { id: string; name: string };
};

const colors = [
  '#4a5c58',
  '#b5895a',
  '#72665a',
  '#7b5962',
  '#52677a',
  '#6c7454',
];
const surfaceWidth = 1120;
const surfaceHeight = 700;
const nodeWidth = 190;
const nodeHeight = 104;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function MindMapWorkspace() {
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [edges, setEdges] = useState<MindMapEdge[]>([]);
  const [comments, setComments] = useState<MindMapComment[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [drag, setDrag] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    void fetch('/api/mind-map', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as MindMapPayload & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error || 'Mindmap nicht geladen.');
        setNodes(data.nodes);
        setEdges(data.edges);
        setComments(data.comments);
        setSelectedId(data.nodes[0]?.id || '');
      })
      .catch((error) =>
        setNotice(
          error instanceof Error
            ? error.message
            : 'Die Mindmap ist gerade nicht erreichbar.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const selected = nodes.find((node) => node.id === selectedId) || null;
  const selectedComments = useMemo(
    () => comments.filter((comment) => comment.nodeId === selectedId),
    [comments, selectedId],
  );

  function replaceNode(next: MindMapNode) {
    setNodes((current) => {
      const updated = current.map((node) =>
        node.id === next.id ? next : node,
      );
      nodesRef.current = updated;
      return updated;
    });
  }

  async function persistNode(node: MindMapNode, quiet = false) {
    if (!quiet) setSaving(true);
    try {
      const response = await fetch('/api/mind-map', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(node),
      });
      const data = (await response.json()) as {
        node?: Partial<MindMapNode>;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || 'Speichern fehlgeschlagen.');
      replaceNode({ ...node, ...data.node });
      if (!quiet) setNotice('Idee gespeichert.');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Speichern fehlgeschlagen.',
      );
    } finally {
      if (!quiet) setSaving(false);
    }
  }

  async function addNode(parent: MindMapNode | null) {
    setSaving(true);
    setNotice('');
    const siblings = parent
      ? edges.filter((edge) => edge.sourceNodeId === parent.id).length
      : nodes.length;
    const x = parent
      ? Math.min(surfaceWidth - nodeWidth - 30, parent.x + 245)
      : 90 + (siblings % 4) * 220;
    const y = parent
      ? Math.max(
          30,
          Math.min(
            surfaceHeight - nodeHeight - 30,
            parent.y - 90 + siblings * 130,
          ),
        )
      : 90 + (siblings % 3) * 150;
    try {
      const response = await fetch('/api/mind-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'node',
          title: parent ? 'Neue Unteridee' : 'Neue Idee',
          parentId: parent?.id,
          color: parent?.color || colors[nodes.length % colors.length],
          x,
          y,
        }),
      });
      const data = (await response.json()) as {
        node?: MindMapNode;
        edge?: MindMapEdge | null;
        error?: string;
      };
      if (!response.ok || !data.node)
        throw new Error(data.error || 'Idee konnte nicht erstellt werden.');
      setNodes((current) => [...current, data.node as MindMapNode]);
      if (data.edge)
        setEdges((current) => [...current, data.edge as MindMapEdge]);
      setSelectedId(data.node.id);
      setNotice('Neue Idee angelegt.');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Idee konnte nicht erstellt werden.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function addComment() {
    if (!selected || !commentBody.trim()) return;
    setSaving(true);
    try {
      const response = await fetch('/api/mind-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'comment',
          nodeId: selected.id,
          body: commentBody,
        }),
      });
      const data = (await response.json()) as {
        comment?: MindMapComment;
        error?: string;
      };
      if (!response.ok || !data.comment)
        throw new Error(
          data.error || 'Kommentar konnte nicht gespeichert werden.',
        );
      setComments((current) => [...current, data.comment as MindMapComment]);
      setCommentBody('');
      setNotice('Kommentar hinzugefügt.');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Kommentar konnte nicht gespeichert werden.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelected() {
    if (!selected || nodes.length === 1) return;
    if (
      !window.confirm(
        `„${selected.title}“ mit Verbindungen und Kommentaren löschen?`,
      )
    )
      return;
    const response = await fetch(
      `/api/mind-map?kind=node&id=${encodeURIComponent(selected.id)}`,
      { method: 'DELETE' },
    );
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setNotice(data.error || 'Idee konnte nicht gelöscht werden.');
      return;
    }
    setNodes((current) => current.filter((node) => node.id !== selected.id));
    setEdges((current) =>
      current.filter(
        (edge) =>
          edge.sourceNodeId !== selected.id &&
          edge.targetNodeId !== selected.id,
      ),
    );
    setComments((current) =>
      current.filter((comment) => comment.nodeId !== selected.id),
    );
    setSelectedId(nodes.find((node) => node.id !== selected.id)?.id || '');
    setNotice('Idee gelöscht.');
  }

  function pointerPosition(event: React.PointerEvent) {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function startDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    node: MindMapNode,
  ) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = pointerPosition(event);
    setSelectedId(node.id);
    setDrag({
      id: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const point = pointerPosition(event);
    setNodes((current) => {
      const updated = current.map((node) =>
        node.id === drag.id
          ? {
              ...node,
              x: Math.max(
                20,
                Math.min(surfaceWidth - nodeWidth - 20, point.x - drag.offsetX),
              ),
              y: Math.max(
                20,
                Math.min(
                  surfaceHeight - nodeHeight - 20,
                  point.y - drag.offsetY,
                ),
              ),
            }
          : node,
      );
      nodesRef.current = updated;
      return updated;
    });
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const node = nodesRef.current.find((item) => item.id === drag.id);
    setDrag(null);
    if (node) void persistNode(node, true);
  }

  if (loading)
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <Loader2 className="size-7 animate-spin text-[var(--fp-primary)]" />
      </div>
    );

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-8 md:py-10">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            Social Media Ideenraum
          </p>
          <h1 className="font-heading text-4xl leading-none md:text-5xl">
            Mindmap
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Themen sammeln, miteinander verbinden und gemeinsam bis zur
            konkreten Content-Idee entwickeln.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-full bg-white/65"
            onClick={() => void addNode(null)}
            disabled={saving}
          >
            <Plus className="size-4" /> Freie Idee
          </Button>
          <Button
            className="rounded-full bg-[var(--fp-ink)] px-5"
            onClick={() => void addNode(selected)}
            disabled={!selected || saving}
          >
            <Network className="size-4" /> Unteridee
          </Button>
        </div>
      </div>

      {notice ? (
        <output className="mt-5 flex items-center gap-2 rounded-xl border bg-white/60 px-4 py-3 text-sm">
          <Check className="size-4 text-[var(--fp-primary)]" /> {notice}
        </output>
      ) : null}

      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-[28px] border bg-white/60 shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-3 text-xs text-muted-foreground">
            <span>
              {nodes.length} Ideen · {edges.length} Verbindungen
            </span>
            <span className="flex items-center gap-1.5">
              <Grip className="size-3.5" /> Knoten ziehen zum Sortieren
            </span>
          </div>
          <div className="max-w-full overflow-auto">
            <div
              ref={surfaceRef}
              className="relative touch-none bg-[radial-gradient(circle,#c8b89a_1px,transparent_1px)] bg-[size:24px_24px]"
              style={{ width: surfaceWidth, height: surfaceHeight }}
            >
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 size-full"
                viewBox={`0 0 ${surfaceWidth} ${surfaceHeight}`}
              >
                {edges.map((edge) => {
                  const source = nodes.find(
                    (node) => node.id === edge.sourceNodeId,
                  );
                  const target = nodes.find(
                    (node) => node.id === edge.targetNodeId,
                  );
                  if (!source || !target) return null;
                  const x1 = source.x + nodeWidth / 2;
                  const y1 = source.y + nodeHeight / 2;
                  const x2 = target.x + nodeWidth / 2;
                  const y2 = target.y + nodeHeight / 2;
                  const bend = Math.max(55, Math.abs(x2 - x1) * 0.42);
                  return (
                    <path
                      key={edge.id}
                      d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="#9d927f"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  );
                })}
              </svg>

              {nodes.map((node) => {
                const count = comments.filter(
                  (comment) => comment.nodeId === node.id,
                ).length;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onPointerDown={(event) => startDrag(event, node)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={() => setDrag(null)}
                    className={
                      'absolute flex cursor-grab select-none flex-col rounded-2xl border bg-white p-4 text-left shadow-[0_10px_28px_rgba(26,26,24,.12)] transition-shadow active:cursor-grabbing ' +
                      (selectedId === node.id
                        ? 'ring-2 ring-[var(--fp-primary)] ring-offset-2'
                        : 'hover:shadow-[0_14px_34px_rgba(26,26,24,.16)]')
                    }
                    style={{
                      left: node.x,
                      top: node.y,
                      width: nodeWidth,
                      height: nodeHeight,
                      borderTopWidth: 5,
                      borderTopColor: node.color,
                    }}
                  >
                    <span className="line-clamp-2 text-sm font-semibold leading-5">
                      {node.title}
                    </span>
                    <span className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {node.updatedBy || node.createdBy || 'FormPoesie'}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="size-3" /> {count}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="rounded-[28px] border bg-white/70 p-5 xl:sticky xl:top-24 xl:self-start">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
                    Ausgewählte Idee
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Zuletzt von{' '}
                    {selected.updatedBy || selected.createdBy || 'FormPoesie'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Idee löschen"
                  className="grid size-9 place-items-center rounded-full border text-muted-foreground hover:text-destructive disabled:opacity-40"
                  onClick={() => void deleteSelected()}
                  disabled={nodes.length === 1}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              <label
                htmlFor="mind-map-title"
                className="mt-5 block text-xs font-medium text-muted-foreground"
              >
                Titel
              </label>
              <Input
                id="mind-map-title"
                className="mt-1 bg-white"
                value={selected.title}
                onChange={(event) =>
                  replaceNode({ ...selected, title: event.target.value })
                }
                maxLength={120}
              />
              <label
                htmlFor="mind-map-note"
                className="mt-4 block text-xs font-medium text-muted-foreground"
              >
                Notiz
              </label>
              <Textarea
                id="mind-map-note"
                className="mt-1 min-h-28 bg-white"
                value={selected.note}
                onChange={(event) =>
                  replaceNode({ ...selected, note: event.target.value })
                }
                placeholder="Gedanke, Hook, Format oder nächster Schritt …"
                maxLength={2000}
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex gap-1.5" aria-label="Knotenfarbe">
                  {colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Farbe ${color}`}
                      onClick={() => replaceNode({ ...selected, color })}
                      className="size-7 rounded-full border-2 border-white shadow-sm ring-offset-1"
                      style={{
                        backgroundColor: color,
                        outline:
                          selected.color === color
                            ? `2px solid ${color}`
                            : 'none',
                      }}
                    />
                  ))}
                </div>
                <Button
                  size="sm"
                  className="rounded-full bg-[var(--fp-primary)]"
                  onClick={() => void persistNode(selected)}
                  disabled={saving || !selected.title.trim()}
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Speichern
                </Button>
              </div>

              <div className="mt-6 border-t pt-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <MessageCircle className="size-4" /> Kommentare
                </h2>
                <div className="mt-3 max-h-52 space-y-3 overflow-auto pr-1">
                  {selectedComments.length ? (
                    selectedComments.map((comment) => (
                      <article
                        key={comment.id}
                        className="rounded-xl bg-[var(--fp-paper)] px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <strong className="font-medium text-foreground">
                            {comment.authorName}
                          </strong>
                          <time>{formatDate(comment.createdAt)}</time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-5">
                          {comment.body}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Noch kein Kommentar zu dieser Idee.
                    </p>
                  )}
                </div>
                <Textarea
                  className="mt-3 min-h-20 bg-white"
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Kommentar hinzufügen …"
                  maxLength={1200}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full rounded-full bg-white"
                  onClick={() => void addComment()}
                  disabled={saving || !commentBody.trim()}
                >
                  <Plus className="size-4" /> Kommentar hinzufügen
                </Button>
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Wähle einen Knoten aus oder lege eine neue Idee an.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
