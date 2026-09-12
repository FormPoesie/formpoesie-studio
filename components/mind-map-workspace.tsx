'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-to-interactive-role */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Crosshair,
  Grip,
  Hand,
  Link2,
  Loader2,
  Maximize2,
  MessageCircle,
  Minus,
  Network,
  Palette,
  Plus,
  Save,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

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

type MindMapPayload = {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  comments: MindMapComment[];
};

const presets = [
  '#4a5c58',
  '#b5895a',
  '#8c5e58',
  '#765c82',
  '#52677a',
  '#6c7454',
  '#d1a83f',
  '#2f7d78',
  '#e9e2d6',
  '#252523',
];
const statuses: Array<{ value: MindMapStatus; label: string }> = [
  { value: 'waiting_review', label: 'Wartet auf Prüfung' },
  { value: 'in_progress', label: 'In Arbeit' },
  { value: 'completed', label: 'Abgeschlossen' },
];
const canvasWidth = 6000;
const canvasHeight = 4000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function normalizeHex(value: string) {
  const raw = value.trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw
      .split('')
      .map((character) => character + character)
      .join('')}`.toLowerCase();
  }
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toLowerCase()}` : null;
}

function hexToRgb(hex: string) {
  const safe = normalizeHex(hex) || '#4a5c58';
  return {
    r: Number.parseInt(safe.slice(1, 3), 16),
    g: Number.parseInt(safe.slice(3, 5), 16),
    b: Number.parseInt(safe.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) =>
      clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'),
    )
    .join('')}`;
}

function rgbToHsv(r: number, g: number, b: number) {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return { h: hue < 0 ? hue + 360 : hue, s: max ? delta / max : 0, v: max };
}

function hsvToHex(h: number, s: number, v: number) {
  const chroma = v * s;
  const section = h / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  let values = [0, 0, 0];
  if (section < 1) values = [chroma, x, 0];
  else if (section < 2) values = [x, chroma, 0];
  else if (section < 3) values = [0, chroma, x];
  else if (section < 4) values = [0, x, chroma];
  else if (section < 5) values = [x, 0, chroma];
  else values = [chroma, 0, x];
  const match = v - chroma;
  return rgbToHex(
    (values[0] + match) * 255,
    (values[1] + match) * 255,
    (values[2] + match) * 255,
  );
}

function ColorEditor({
  value,
  onPreview,
  onApply,
  onCancel,
}: {
  value: string;
  onPreview: (value: string) => void;
  onApply: (value: string) => void;
  onCancel: () => void;
}) {
  const rgbValue = hexToRgb(value);
  const initial = rgbToHsv(rgbValue.r, rgbValue.g, rgbValue.b);
  const [hue, setHue] = useState(initial.h);
  const [saturation, setSaturation] = useState(initial.s);
  const [brightness, setBrightness] = useState(initial.v);
  const [draft, setDraft] = useState(normalizeHex(value) || '#4a5c58');
  const [recent] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('fp-board-recent-colors') || '[]');
    } catch {
      return [];
    }
  });
  const fieldRef = useRef<HTMLDivElement>(null);

  function setColor(next: string) {
    const safe = normalizeHex(next);
    if (!safe) return;
    const nextRgb = hexToRgb(safe);
    const hsv = rgbToHsv(nextRgb.r, nextRgb.g, nextRgb.b);
    setDraft(safe);
    setHue(hsv.h);
    setSaturation(hsv.s);
    setBrightness(hsv.v);
    onPreview(safe);
  }

  function updateFromHsv(
    nextHue: number,
    nextSaturation: number,
    nextBrightness: number,
  ) {
    const next = hsvToHex(nextHue, nextSaturation, nextBrightness);
    setHue(nextHue);
    setSaturation(nextSaturation);
    setBrightness(nextBrightness);
    setDraft(next);
    onPreview(next);
  }

  function updateField(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = fieldRef.current?.getBoundingClientRect();
    if (!bounds) return;
    updateFromHsv(
      hue,
      clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      clamp(1 - (event.clientY - bounds.top) / bounds.height, 0, 1),
    );
  }

  function apply() {
    const nextRecent = [
      draft,
      ...recent.filter((item) => item !== draft),
    ].slice(0, 8);
    localStorage.setItem('fp-board-recent-colors', JSON.stringify(nextRecent));
    onApply(draft);
  }

  const rgb = hexToRgb(draft);
  return (
    <div className="fixed top-20 right-4 z-[70] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border bg-white p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Kachelfarbe</p>
          <p className="text-xs text-muted-foreground">
            Eigene Farbe präzise einstellen
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onCancel}
          aria-label="Farbeditor schließen"
        >
          <X />
        </Button>
      </div>
      <div
        ref={fieldRef}
        role="slider"
        tabIndex={0}
        aria-label="Sättigung und Helligkeit"
        aria-valuenow={Math.round(brightness * 100)}
        aria-valuetext={`${Math.round(saturation * 100)} Prozent Sättigung, ${Math.round(brightness * 100)} Prozent Helligkeit`}
        className="relative h-44 cursor-crosshair overflow-hidden rounded-xl"
        style={{ backgroundColor: `hsl(${hue} 100% 50%)` }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateField(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            updateField(event);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft')
            updateFromHsv(hue, clamp(saturation - 0.02, 0, 1), brightness);
          if (event.key === 'ArrowRight')
            updateFromHsv(hue, clamp(saturation + 0.02, 0, 1), brightness);
          if (event.key === 'ArrowDown')
            updateFromHsv(hue, saturation, clamp(brightness - 0.02, 0, 1));
          if (event.key === 'ArrowUp')
            updateFromHsv(hue, saturation, clamp(brightness + 0.02, 0, 1));
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
        <span
          className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{
            left: `${saturation * 100}%`,
            top: `${(1 - brightness) * 100}%`,
          }}
        />
      </div>
      <input
        aria-label="Farbton"
        type="range"
        min="0"
        max="359"
        value={Math.round(hue)}
        className="mt-3 h-3 w-full cursor-pointer accent-black"
        style={{
          background:
            'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
        }}
        onChange={(event) =>
          updateFromHsv(Number(event.target.value), saturation, brightness)
        }
      />
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <label
          htmlFor="board-color-hex"
          className="text-[11px] font-semibold text-muted-foreground"
        >
          HEX
          <Input
            id="board-color-hex"
            value={draft}
            className="mt-1 uppercase"
            onChange={(event) => {
              setDraft(event.target.value);
              const safe = normalizeHex(event.target.value);
              if (safe) setColor(safe);
            }}
          />
        </label>
        <label className="text-[11px] font-semibold text-muted-foreground">
          Farbrad
          <input
            type="color"
            value={draft}
            onChange={(event) => setColor(event.target.value)}
            className="mt-1 block h-8 w-12 cursor-pointer rounded-lg border bg-white p-1"
          />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(['r', 'g', 'b'] as const).map((channel) => (
          <label
            key={channel}
            className="text-[11px] font-semibold uppercase text-muted-foreground"
          >
            {channel}
            <Input
              type="number"
              min="0"
              max="255"
              value={rgb[channel]}
              className="mt-1"
              onChange={(event) =>
                setColor(
                  rgbToHex(
                    channel === 'r' ? Number(event.target.value) : rgb.r,
                    channel === 'g' ? Number(event.target.value) : rgb.g,
                    channel === 'b' ? Number(event.target.value) : rgb.b,
                  ),
                )
              }
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Vorgaben
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {presets.map((color) => (
          <button
            key={color}
            className="size-7 rounded-full border border-black/10 shadow-sm"
            style={{ backgroundColor: color }}
            onClick={() => setColor(color)}
            aria-label={`Farbe ${color}`}
          />
        ))}
      </div>
      {recent.length ? (
        <>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Zuletzt verwendet
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recent.map((color) => (
              <button
                key={color}
                className="size-7 rounded-full border border-black/10"
                style={{ backgroundColor: color }}
                onClick={() => setColor(color)}
                aria-label={`Farbe ${color}`}
              />
            ))}
          </div>
        </>
      ) : null}
      <Button className="mt-4 w-full" onClick={apply}>
        Übernehmen
      </Button>
    </div>
  );
}

export function MindMapWorkspace() {
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [edges, setEdges] = useState<MindMapEdge[]>([]);
  const [comments, setComments] = useState<MindMapComment[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [connectFromId, setConnectFromId] = useState('');
  const [colorEditorId, setColorEditorId] = useState('');
  const [colorBeforeEdit, setColorBeforeEdit] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [zoom, setZoom] = useState(0.8);
  const [panMode, setPanMode] = useState(false);
  const [deleteId, setDeleteId] = useState('');
  const [drag, setDrag] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [resize, setResize] = useState<{
    id: string;
    startX: number;
    startY: number;
    width: number;
    height: number;
  } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
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
        if (!response.ok) throw new Error(data.error || 'Board nicht geladen.');
        setNodes(data.nodes);
        setEdges(data.edges);
        setComments(data.comments);
        requestAnimationFrame(() => {
          if (viewportRef.current && data.nodes[0]) {
            viewportRef.current.scrollLeft = Math.max(
              0,
              data.nodes[0].x * 0.8 - 240,
            );
            viewportRef.current.scrollTop = Math.max(
              0,
              data.nodes[0].y * 0.8 - 180,
            );
          }
        });
      })
      .catch((error) =>
        setNotice(
          error instanceof Error
            ? error.message
            : 'Das Board ist gerade nicht erreichbar.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const selected = nodes.find((node) => node.id === selectedId) || null;
  const selectedComments = useMemo(
    () => comments.filter((comment) => comment.nodeId === selectedId),
    [comments, selectedId],
  );
  const commentsByNode = useMemo(() => {
    const counts = new Map<string, number>();
    comments.forEach((comment) =>
      counts.set(comment.nodeId, (counts.get(comment.nodeId) || 0) + 1),
    );
    return counts;
  }, [comments]);

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
      if (!quiet) setNotice('Änderungen gespeichert.');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Speichern fehlgeschlagen.',
      );
    } finally {
      if (!quiet) setSaving(false);
    }
  }

  async function addNode(parent: MindMapNode | null, duplicate?: MindMapNode) {
    setSaving(true);
    const index = nodes.length;
    const source = duplicate || parent;
    const width = source?.width || 240;
    const height = source?.height || 150;
    const x = source
      ? clamp(source.x + 48, 20, canvasWidth - width - 20)
      : 180 + (index % 5) * 280;
    const y = source
      ? clamp(source.y + 48, 20, canvasHeight - height - 20)
      : 160 + (index % 4) * 190;
    try {
      const response = await fetch('/api/mind-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'node',
          title: duplicate
            ? `${duplicate.title} – Kopie`
            : parent
              ? 'Neue Unteridee'
              : 'Neue Kachel',
          note: duplicate?.note || '',
          status: duplicate?.status || 'waiting_review',
          parentId: duplicate ? undefined : parent?.id,
          color: source?.color || presets[index % presets.length],
          width,
          height,
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
        throw new Error(data.error || 'Kachel konnte nicht erstellt werden.');
      setNodes((current) => [...current, data.node!]);
      if (data.edge) setEdges((current) => [...current, data.edge!]);
      setSelectedId(data.node.id);
      setNotice(duplicate ? 'Kachel dupliziert.' : 'Neue Kachel erstellt.');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Kachel konnte nicht erstellt werden.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function connectNodes(targetId: string) {
    const sourceId = connectFromId;
    setConnectFromId('');
    if (!sourceId || sourceId === targetId) return;
    if (
      edges.some(
        (edge) =>
          edge.sourceNodeId === sourceId && edge.targetNodeId === targetId,
      )
    ) {
      setNotice('Diese Verbindung besteht bereits.');
      return;
    }
    try {
      const response = await fetch('/api/mind-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'edge',
          sourceNodeId: sourceId,
          targetNodeId: targetId,
        }),
      });
      const data = (await response.json()) as {
        edge?: MindMapEdge;
        error?: string;
      };
      if (!response.ok || !data.edge)
        throw new Error(data.error || 'Verbindung fehlgeschlagen.');
      setEdges((current) => [...current, data.edge!]);
      setNotice('Kacheln verbunden.');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Verbindung fehlgeschlagen.',
      );
    }
  }

  async function updateEdgeColor(edge: MindMapEdge, color: string | null) {
    const response = await fetch('/api/mind-map', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'edge', id: edge.id, color }),
    });
    const data = (await response.json()) as {
      edge?: Pick<MindMapEdge, 'id' | 'color'>;
      error?: string;
    };
    if (!response.ok || !data.edge) {
      setNotice(
        data.error || 'Verbindungsfarbe konnte nicht gespeichert werden.',
      );
      return;
    }
    setEdges((current) =>
      current.map((item) =>
        item.id === edge.id ? { ...item, color: data.edge!.color } : item,
      ),
    );
  }

  async function deleteEntry(id: string, kind: 'node' | 'edge' | 'comment') {
    const response = await fetch(
      `/api/mind-map?id=${encodeURIComponent(id)}&kind=${kind}`,
      { method: 'DELETE' },
    );
    if (!response.ok) {
      setNotice('Löschen fehlgeschlagen.');
      return;
    }
    if (kind === 'node') {
      setNodes((current) => current.filter((node) => node.id !== id));
      setEdges((current) =>
        current.filter(
          (edge) => edge.sourceNodeId !== id && edge.targetNodeId !== id,
        ),
      );
      setComments((current) =>
        current.filter((comment) => comment.nodeId !== id),
      );
      setSelectedId('');
    } else if (kind === 'edge')
      setEdges((current) => current.filter((edge) => edge.id !== id));
    else
      setComments((current) => current.filter((comment) => comment.id !== id));
    setDeleteId('');
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
      setComments((current) => [...current, data.comment!]);
      setCommentBody('');
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

  function pointerPosition(event: React.PointerEvent) {
    const bounds = planeRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (event.clientX - bounds.left) / zoom,
      y: (event.clientY - bounds.top) / zoom,
    };
  }

  function finishTransform() {
    const state = drag || resize;
    if (!state) return;
    const node = nodesRef.current.find((item) => item.id === state.id);
    setDrag(null);
    setResize(null);
    if (node) void persistNode(node, true);
  }

  function centerBoard() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (!nodes.length) {
      viewport.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
      return;
    }
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    viewport.scrollTo({
      left: Math.max(0, minX * zoom - 80),
      top: Math.max(0, minY * zoom - 80),
      behavior: 'smooth',
    });
  }

  return (
    <section className="min-h-0 flex-1 bg-[#f4f1eb] p-3 sm:p-5">
      <div className="mx-auto flex h-[calc(100dvh-8.5rem)] min-h-[620px] max-w-[1600px] flex-col overflow-hidden rounded-[1.5rem] border border-black/10 bg-[#ece8df] shadow-[0_24px_70px_rgba(45,42,36,.12)]">
        <header className="relative z-30 flex flex-wrap items-center justify-between gap-3 border-b bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#263a37] text-white">
              <Network className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-heading text-lg font-semibold sm:text-xl">
                Visuelles Board
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Ideen, Projekte und Aufgaben frei strukturieren
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notice ? (
              <p className="hidden max-w-64 truncate text-xs text-muted-foreground md:block">
                {notice}
              </p>
            ) : null}
            <Button onClick={() => void addNode(null)} disabled={saving}>
              <Plus /> Kachel
            </Button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-white/95 p-1 shadow-lg backdrop-blur">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setZoom((value) => clamp(value - 0.1, 0.35, 1.6))}
              aria-label="Verkleinern"
            >
              <Minus />
            </Button>
            <span className="w-12 text-center text-xs font-semibold tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setZoom((value) => clamp(value + 0.1, 0.35, 1.6))}
              aria-label="Vergrößern"
            >
              <Plus />
            </Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button
              size="icon-sm"
              variant={panMode ? 'secondary' : 'ghost'}
              onClick={() => setPanMode((value) => !value)}
              aria-label="Arbeitsfläche verschieben"
            >
              <Hand />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={centerBoard}
              aria-label="Board zentrieren"
            >
              <Crosshair />
            </Button>
          </div>
          {connectFromId ? (
            <div className="absolute top-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#263a37] px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              Zielkachel anklicken{' '}
              <button onClick={() => setConnectFromId('')}>
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
          <div
            ref={viewportRef}
            className={`h-full overflow-auto overscroll-contain ${panMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onPointerDown={(event) => {
              if (!panMode) return;
              panRef.current = {
                x: event.clientX,
                y: event.clientY,
                left: event.currentTarget.scrollLeft,
                top: event.currentTarget.scrollTop,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!panRef.current) return;
              event.currentTarget.scrollLeft =
                panRef.current.left - (event.clientX - panRef.current.x);
              event.currentTarget.scrollTop =
                panRef.current.top - (event.clientY - panRef.current.y);
            }}
            onPointerUp={() => {
              panRef.current = null;
            }}
          >
            <div
              className="relative"
              style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}
            >
              <div
                ref={planeRef}
                role="application"
                tabIndex={0}
                aria-label="Arbeitsfläche des visuellen Boards"
                className="absolute inset-0 origin-top-left"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  transform: `scale(${zoom})`,
                  backgroundColor: '#ece8df',
                  backgroundImage:
                    'radial-gradient(rgba(57,62,55,.18) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
                onClick={(event) => {
                  if (event.target === event.currentTarget) {
                    setSelectedId('');
                    setConnectFromId('');
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSelectedId('');
                    setConnectFromId('');
                  }
                }}
                onPointerMove={(event) => {
                  const position = pointerPosition(event);
                  if (drag) {
                    const node = nodesRef.current.find(
                      (item) => item.id === drag.id,
                    );
                    if (!node) return;
                    replaceNode({
                      ...node,
                      x: clamp(
                        position.x - drag.offsetX,
                        0,
                        canvasWidth - node.width,
                      ),
                      y: clamp(
                        position.y - drag.offsetY,
                        0,
                        canvasHeight - node.height,
                      ),
                    });
                  } else if (resize) {
                    const node = nodesRef.current.find(
                      (item) => item.id === resize.id,
                    );
                    if (!node) return;
                    replaceNode({
                      ...node,
                      width: clamp(
                        resize.width + (event.clientX - resize.startX) / zoom,
                        160,
                        1400,
                      ),
                      height: clamp(
                        resize.height + (event.clientY - resize.startY) / zoom,
                        110,
                        1800,
                      ),
                    });
                  }
                }}
                onPointerUp={finishTransform}
                onPointerCancel={finishTransform}
              >
                <svg
                  className="pointer-events-none absolute inset-0"
                  width={canvasWidth}
                  height={canvasHeight}
                  aria-hidden="true"
                >
                  {edges.map((edge) => {
                    const source = nodes.find(
                      (node) => node.id === edge.sourceNodeId,
                    );
                    const target = nodes.find(
                      (node) => node.id === edge.targetNodeId,
                    );
                    if (!source || !target) return null;
                    const startX = source.x + source.width;
                    const startY = source.y + source.height / 2;
                    const endX = target.x;
                    const endY = target.y + target.height / 2;
                    const bend = Math.max(80, Math.abs(endX - startX) * 0.45);
                    return (
                      <path
                        key={edge.id}
                        d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`}
                        fill="none"
                        stroke={edge.color || source.color}
                        strokeWidth="4"
                        strokeLinecap="round"
                        opacity="0.75"
                      />
                    );
                  })}
                </svg>
                {nodes.map((node) => {
                  const active = selectedId === node.id;
                  const status = statuses.find(
                    (item) => item.value === node.status,
                  )!;
                  return (
                    <div
                      key={node.id}
                      className="absolute"
                      style={{
                        left: node.x,
                        top: node.y,
                        width: node.width,
                        height: node.height,
                      }}
                    >
                      {active ? (
                        <div
                          className="absolute -top-12 left-1/2 z-20 flex -translate-x-1/2 items-center rounded-xl border bg-white p-1 text-[#252523] shadow-xl"
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => {
                              setColorBeforeEdit(node.color);
                              setColorEditorId(node.id);
                            }}
                            aria-label="Farbe ändern"
                          >
                            <Palette />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => void addNode(null, node)}
                            aria-label="Duplizieren"
                          >
                            <Copy />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant={
                              connectFromId === node.id ? 'secondary' : 'ghost'
                            }
                            onClick={() =>
                              setConnectFromId(
                                connectFromId === node.id ? '' : node.id,
                              )
                            }
                            aria-label="Verbinden"
                          >
                            <Link2 />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setSelectedId(node.id)}
                            aria-label="Details und Kommentare"
                          >
                            <MessageCircle />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="destructive"
                            onClick={() => setDeleteId(node.id)}
                            aria-label="Löschen"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ) : null}
                      <article
                        role="button"
                        tabIndex={0}
                        className={`group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border shadow-[0_10px_30px_rgba(25,30,27,.16)] transition-shadow ${active ? 'ring-4 ring-white/90 shadow-2xl' : 'hover:shadow-xl'} ${connectFromId && connectFromId !== node.id ? 'cursor-crosshair' : ''}`}
                        style={{
                          backgroundColor: node.color,
                          color: node.textColor,
                          borderColor: `${node.textColor}33`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (connectFromId && connectFromId !== node.id)
                            void connectNodes(node.id);
                          setSelectedId(node.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            if (connectFromId && connectFromId !== node.id)
                              void connectNodes(node.id);
                            setSelectedId(node.id);
                          }
                        }}
                      >
                        <div
                          className="flex items-center justify-between border-b px-3 py-2"
                          style={{ borderColor: `${node.textColor}2b` }}
                        >
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: `${node.textColor}1f` }}
                          >
                            {status.label}
                          </span>
                          <button
                            className="cursor-grab rounded-md p-1 opacity-65 hover:opacity-100 active:cursor-grabbing"
                            aria-label="Kachel verschieben"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              const position = pointerPosition(event);
                              setDrag({
                                id: node.id,
                                offsetX: position.x - node.x,
                                offsetY: position.y - node.y,
                              });
                              planeRef.current?.setPointerCapture(
                                event.pointerId,
                              );
                            }}
                          >
                            <Grip className="size-4" />
                          </button>
                        </div>
                        <button
                          className="min-h-0 flex-1 overflow-auto px-4 py-3 text-left"
                          onClick={() => setSelectedId(node.id)}
                        >
                          <h2 className="font-heading text-lg font-semibold leading-tight">
                            {node.title}
                          </h2>
                          {node.note ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed opacity-85">
                              {node.note}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs opacity-60">
                              Beschreibung ergänzen …
                            </p>
                          )}
                        </button>
                        <div className="flex items-center justify-between px-4 pb-3 text-[10px] opacity-70">
                          <span>{node.updatedBy || 'FormPoesie'}</span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="size-3" />{' '}
                            {commentsByNode.get(node.id) || 0}
                          </span>
                        </div>
                        <button
                          className="absolute right-1 bottom-1 grid size-7 cursor-nwse-resize place-items-center rounded-lg opacity-50 hover:bg-white/15 hover:opacity-100"
                          aria-label="Kachelgröße ändern"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setResize({
                              id: node.id,
                              startX: event.clientX,
                              startY: event.clientY,
                              width: node.width,
                              height: node.height,
                            });
                            planeRef.current?.setPointerCapture(
                              event.pointerId,
                            );
                          }}
                        >
                          <Maximize2 className="size-3.5" />
                        </button>
                      </article>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {loading ? (
            <div className="absolute inset-0 z-40 grid place-items-center bg-[#ece8df]/80">
              <Loader2 className="size-7 animate-spin text-[#263a37]" />
            </div>
          ) : null}
        </div>
      </div>

      {colorEditorId ? (
        <ColorEditor
          value={
            nodes.find((node) => node.id === colorEditorId)?.color || '#4a5c58'
          }
          onPreview={(color) => {
            const node = nodesRef.current.find(
              (item) => item.id === colorEditorId,
            );
            if (node) replaceNode({ ...node, color });
          }}
          onApply={(color) => {
            const node = nodesRef.current.find(
              (item) => item.id === colorEditorId,
            );
            setColorEditorId('');
            setColorBeforeEdit('');
            if (node) void persistNode({ ...node, color });
          }}
          onCancel={() => {
            const node = nodesRef.current.find(
              (item) => item.id === colorEditorId,
            );
            if (node && colorBeforeEdit)
              replaceNode({ ...node, color: colorBeforeEdit });
            setColorEditorId('');
            setColorBeforeEdit('');
          }}
        />
      ) : null}

      <Sheet
        modal={false}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId('');
        }}
      >
        <SheetContent className="w-[min(92vw,430px)] sm:max-w-[430px]">
          {selected ? (
            <>
              <SheetHeader className="border-b pr-14">
                <SheetTitle>Kacheldetails</SheetTitle>
                <SheetDescription>
                  Inhalt, Status, Kommentare und Verbindungen
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-6">
                <div className="grid gap-4 pt-2">
                  <label
                    htmlFor="board-node-title"
                    className="grid gap-1.5 text-xs font-semibold text-muted-foreground"
                  >
                    Titel
                    <Input
                      id="board-node-title"
                      value={selected.title}
                      onChange={(event) =>
                        replaceNode({ ...selected, title: event.target.value })
                      }
                    />
                  </label>
                  <label
                    htmlFor="board-node-note"
                    className="grid gap-1.5 text-xs font-semibold text-muted-foreground"
                  >
                    Beschreibung
                    <Textarea
                      id="board-node-note"
                      className="min-h-32 resize-y"
                      value={selected.note}
                      onChange={(event) =>
                        replaceNode({ ...selected, note: event.target.value })
                      }
                      placeholder="Gedanken, Aufgaben oder Hintergrund festhalten …"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                    Status
                    <select
                      className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground"
                      value={selected.status}
                      onChange={(event) =>
                        replaceNode({
                          ...selected,
                          status: event.target.value as MindMapStatus,
                        })
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setColorBeforeEdit(selected.color);
                        setColorEditorId(selected.id);
                      }}
                    >
                      <Palette /> Farbe
                    </Button>
                    <Button
                      onClick={() => void persistNode(selected)}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="animate-spin" /> : <Save />}{' '}
                      Speichern
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-heading font-semibold">Verbindungen</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setConnectFromId(selected.id);
                        setSelectedId('');
                      }}
                    >
                      <Link2 /> Verbinden
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {edges
                      .filter(
                        (edge) =>
                          edge.sourceNodeId === selected.id ||
                          edge.targetNodeId === selected.id,
                      )
                      .map((edge) => {
                        const source = nodes.find(
                          (node) => node.id === edge.sourceNodeId,
                        );
                        const otherId =
                          edge.sourceNodeId === selected.id
                            ? edge.targetNodeId
                            : edge.sourceNodeId;
                        const other = nodes.find((node) => node.id === otherId);
                        return (
                          <div
                            key={edge.id}
                            className="flex items-center gap-2 rounded-xl border bg-muted/35 p-2"
                          >
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">
                              {other?.title || 'Kachel'}
                            </span>
                            <input
                              type="color"
                              value={
                                edge.color || source?.color || selected.color
                              }
                              className="size-7 cursor-pointer rounded border bg-white p-0.5"
                              aria-label="Verbindungsfarbe"
                              onChange={(event) =>
                                void updateEdgeColor(edge, event.target.value)
                              }
                            />
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => void updateEdgeColor(edge, null)}
                              aria-label="Quellfarbe verwenden"
                            >
                              <Palette />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="destructive"
                              onClick={() => void deleteEntry(edge.id, 'edge')}
                              aria-label="Verbindung entfernen"
                            >
                              <Unlink />
                            </Button>
                          </div>
                        );
                      })}
                    {!edges.some(
                      (edge) =>
                        edge.sourceNodeId === selected.id ||
                        edge.targetNodeId === selected.id,
                    ) ? (
                      <p className="text-xs text-muted-foreground">
                        Noch keine Verbindungen.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="border-t pt-5">
                  <h3 className="font-heading font-semibold">Kommentare</h3>
                  <div className="mt-3 space-y-2">
                    {selectedComments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-xl bg-muted/55 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold">
                            {comment.authorName}
                          </p>
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              void deleteEntry(comment.id, 'comment')
                            }
                            aria-label="Kommentar löschen"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                          {comment.body}
                        </p>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          {formatDate(comment.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <Textarea
                    className="mt-3 min-h-20"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="Kommentar hinzufügen …"
                  />
                  <Button
                    className="mt-2 w-full"
                    variant="outline"
                    onClick={() => void addComment()}
                    disabled={!commentBody.trim() || saving}
                  >
                    <MessageCircle /> Kommentieren
                  </Button>
                </div>

                <div className="border-t pt-5">
                  <p className="text-[11px] text-muted-foreground">
                    Zuletzt bearbeitet {formatDate(selected.updatedAt)} von{' '}
                    {selected.updatedBy || 'FormPoesie'}
                  </p>
                  <Button
                    className="mt-3 w-full"
                    variant="destructive"
                    onClick={() => setDeleteId(selected.id)}
                  >
                    <Trash2 /> Kachel löschen
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {deleteId ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="font-heading text-lg font-semibold">
              Kachel wirklich löschen?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Kommentare und alle zugehörigen Verbindungen werden ebenfalls
              entfernt.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteId('')}>
                Abbrechen
              </Button>
              <Button
                variant="destructive"
                onClick={() => void deleteEntry(deleteId, 'node')}
              >
                <Trash2 /> Löschen
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
