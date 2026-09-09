'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Package,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { InventoryItem } from '@/lib/inventory-bridge';
import { STEP_LABELS, VISIBLE_STEPS, type EtsyState } from '@/lib/etsy-workflow';

type ProductSnapshot = {
  id: string;
  name: string;
  productType: string;
  buyerWorld: string;
  dimensions: { width: number | null; depth: number | null; height: number | null; unit: string };
  variants: Array<{ id: string; name: string; size: string; weight: { value: number | null; unit: string } }>;
};
type Step = { status: string; result: Record<string, unknown>; activeVersion?: number; approvedAt?: string };
type WorkflowData = {
  workflow: { id: string; productId: string; product: ProductSnapshot; currentState: EtsyState; status: string; revision: number; updatedAt: string };
  steps: Record<EtsyState, Step>;
  images: Array<{
    id: string;
    filename: string;
    status: string;
    position: number;
    activeVersionId?: string;
    originalUrl: string;
    versions: Array<{ id: string; version: number; instruction?: string; status: string; approved: boolean; url?: string | null }>;
  }>;
  prices: Record<string, number | null>;
  holidays: string[];
};
type WorkflowSummary = WorkflowData['workflow'];

const statusLabel: Record<string, string> = {
  NOT_STARTED: 'Offen',
  IN_PROGRESS: 'In Arbeit',
  GENERATING: 'Wird erstellt',
  READY_FOR_REVIEW: 'Prüfen',
  APPROVED: 'Bestätigt',
  NEEDS_REVIEW: 'Erneut prüfen',
  ERROR: 'Fehler',
};

function displaySize(product: ProductSnapshot, variant: ProductSnapshot['variants'][number]) {
  if (variant.size) return variant.size;
  const { width, depth, height, unit } = product.dimensions;
  return [width, depth, height].every((value) => typeof value === 'number')
    ? `${width} × ${depth} × ${height} ${unit}`
    : 'Maße im Inventar offen';
}

const chatStates: EtsyState[] = ['KEYWORD_RESEARCH', 'IMAGE_ORDER', 'TITLE', 'CART_SUMMARY', 'DESCRIPTION', 'ALT_TEXT', 'HOLIDAY'];

function chatSchema(state: EtsyState) {
  const schemas: Partial<Record<EtsyState, unknown>> = {
    KEYWORD_RESEARCH: { primary_keyword: 'string', tags: ['exakt 13 Strings, je maximal 20 Zeichen'] },
    IMAGE_ORDER: { image_ids: ['stabile image_id in empfohlener Reihenfolge'] },
    TITLE: { candidates: [{ id: 'A', title: 'string' }, { id: 'B', title: 'string' }, { id: 'C', title: 'string' }], recommended: 'A|B|C', selected_title: 'string' },
    CART_SUMMARY: { cart_summary: 'string' },
    DESCRIPTION: { description_de: 'string', description_en: 'string' },
    ALT_TEXT: { items: [{ image_id: 'string', alt_text_de: 'string', alt_text_en: 'string' }] },
    HOLIDAY: { classification: 'HOLIDAY_SPECIFIC|HOLIDAY_RELEVANT|NO_HOLIDAY_RELATION', recommended_holiday: 'string|null', reason: 'string' },
  };
  return schemas[state] || {};
}

function buildChatPrompt(data: WorkflowData, state: EtsyState) {
  const approved = Object.fromEntries(Object.entries(data.steps).filter(([, value]) => value?.status === 'APPROVED').map(([key, value]) => [key, value.result]));
  return `Du arbeitest am FormPoesie Etsy-Workflow. Erstelle ausschließlich den Schritt ${state}. Verwende keine API und erfinde keine Produkteigenschaften. Artikelname, Varianten, Maße und Gewichte sind autoritativ und dürfen nicht geändert werden. SKU, Lagerbestand, Inventarmaterial und Inventarfarbe sind außerhalb des Scopes. Antworte ausschließlich mit gültigem JSON ohne Markdown-Codeblock, passend zum angegebenen Ausgabeschema.\n\nWORKFLOW-KONTEXT:\n${JSON.stringify({ workflow_id: data.workflow.id, product: data.workflow.product, approved_steps: approved, images: data.images.filter((image) => image.status === 'APPROVED').map((image) => ({ image_id: image.id, filename: image.filename, position: image.position })) }, null, 2)}\n\nAUSGABESCHEMA:\n${JSON.stringify(chatSchema(state), null, 2)}`;
}

export function EtsyWorkflow({ inventoryItems, initialProductId = '' }: { inventoryItems: InventoryItem[]; initialProductId?: string }) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [data, setData] = useState<WorkflowData | null>(null);
  const [selectedStep, setSelectedStep] = useState<EtsyState>('IMAGE_UPLOAD');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);
  const generatedUploadRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importState, setImportState] = useState<EtsyState>('KEYWORD_RESEARCH');

  async function loadList() {
    const response = await fetch('/api/etsy-workflow');
    if (response.ok) setWorkflows(await response.json());
  }
  async function loadWorkflow(workflowId: string) {
    const response = await fetch(`/api/etsy-workflow?workflowId=${encodeURIComponent(workflowId)}`);
    if (!response.ok) return;
    const next = (await response.json()) as WorkflowData;
    setData(next);
    setSelectedStep(next.workflow.currentState === 'COMPLETED' ? 'FINAL_REVIEW' : next.workflow.currentState);
  }
  useEffect(() => { void loadList(); }, []);
  useEffect(() => {
    if (!initialProductId) return;
    void start(initialProductId);
  }, [initialProductId]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: unknown) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    void register({
      name: 'read_etsy_workflow_context',
      title: 'Etsy-Workflow lesen',
      description: 'Liest den aktuell geöffneten FormPoesie Etsy-Workflow mit autoritativen Produktdaten, Freigaben und dem aktuellen Schritt. Meldet klar, wenn noch kein Workflow geöffnet ist.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () => data ? ({ workflow_id: data.workflow.id, revision: data.workflow.revision, current_state: data.workflow.currentState, product: data.workflow.product, steps: data.steps, images: data.images.map((image) => ({ image_id: image.id, filename: image.filename, status: image.status, position: image.position })) }) : ({ workflow: null, message: 'Noch kein Etsy-Workflow geöffnet.' }),
    });
    void register({
      name: 'stage_etsy_workflow_result',
      title: 'Chat-Ergebnis im Etsy-Workflow ablegen',
      description: 'Speichert ein im Chat erzeugtes strukturiertes Ergebnis zur manuellen Prüfung. Bestätigt es niemals automatisch.',
      inputSchema: { type: 'object', properties: { state: { type: 'string', enum: chatStates }, result: { type: 'object' } }, required: ['state', 'result'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        if (!data) throw new Error('Öffne zuerst einen Etsy-Workflow in der Website.');
        const value = input as { state?: EtsyState; result?: Record<string, unknown> };
        if (!value.state || !chatStates.includes(value.state) || !value.result) throw new Error('Ungültiger Workflow-Schritt oder fehlendes Ergebnis.');
        const response = await fetch('/api/etsy-workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stage', workflowId: data.workflow.id, revision: data.workflow.revision, state: value.state, result: value.result }) });
        const next = (await response.json()) as WorkflowData & { error?: string };
        if (!response.ok || !next.workflow) throw new Error(next.error || 'Ergebnis konnte nicht gespeichert werden.');
        setData(next); setSelectedStep(value.state);
        return { workflow_id: next.workflow.id, state: value.state, status: next.steps[value.state].status, revision: next.workflow.revision };
      },
    });
    return () => lifecycle.abort();
  }, [data]);

  async function start(productId: string) {
    setBusy('start'); setMessage('');
    const response = await fetch('/api/etsy-workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', productId }) });
    const result = (await response.json().catch(() => ({}))) as WorkflowData & { error?: string };
    setBusy('');
    if (!response.ok || !result.workflow) { setMessage(result.error || 'Workflow konnte nicht gestartet werden.'); return; }
    setPickerOpen(false); setData(result); setSelectedStep(result.workflow.currentState); void loadList();
  }

  async function workflowAction(action: string, state?: EtsyState, result?: unknown, extra: Record<string, unknown> = {}) {
    if (!data) return;
    setBusy(`${action}-${state || ''}`); setMessage('');
    const response = await fetch('/api/etsy-workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, workflowId: data.workflow.id, revision: data.workflow.revision, state, result, ...extra }) });
    const next = (await response.json().catch(() => ({}))) as WorkflowData & { error?: string };
    setBusy('');
    if (!response.ok || !next.workflow) { setMessage(next.error === 'WORKFLOW_STATE_CONFLICT' ? 'Der Workflow wurde in einem anderen Tab geändert. Ich lade den aktuellen Stand.' : next.error || 'Änderung konnte nicht gespeichert werden.'); await loadWorkflow(data.workflow.id); return; }
    setData(next); setSelectedStep(next.workflow.currentState === 'COMPLETED' ? 'FINAL_REVIEW' : next.workflow.currentState); void loadList();
  }

  async function uploadOriginals(files: FileList | null) {
    if (!data || !files?.length) return;
    setBusy('upload'); setMessage('');
    for (const file of Array.from(files)) {
      const form = new FormData(); form.append('file', file); form.append('workflowId', data.workflow.id); form.append('kind', 'original');
      const response = await fetch('/api/etsy-workflow/images', { method: 'POST', body: form });
      if (!response.ok) { setMessage('Ein Bild konnte nicht gespeichert werden.'); break; }
    }
    setBusy(''); if (uploadRef.current) uploadRef.current.value = ''; await loadWorkflow(data.workflow.id);
  }

  async function imageAction(imageId: string, action: string, versionId = '', instruction = '') {
    if (!data) return;
    setBusy(`${action}-${imageId}`); setMessage('');
    const response = await fetch('/api/etsy-workflow/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId, action, versionId, instruction, revision: data.workflow.revision }) });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy('');
    if (!response.ok) setMessage(result.error || 'Bildaktion fehlgeschlagen.');
    await loadWorkflow(data.workflow.id);
  }

  async function uploadGenerated(file: File | undefined) {
    if (!data || !file || !uploadTarget) return;
    setBusy(`external-${uploadTarget}`);
    const form = new FormData(); form.append('file', file); form.append('workflowId', data.workflow.id); form.append('imageId', uploadTarget); form.append('kind', 'generated');
    const response = await fetch('/api/etsy-workflow/images', { method: 'POST', body: form });
    setBusy(''); if (!response.ok) setMessage('Bearbeitete Version konnte nicht gespeichert werden.');
    if (generatedUploadRef.current) generatedUploadRef.current.value = ''; await loadWorkflow(data.workflow.id);
  }

  async function copyChatTask(state: EtsyState) {
    if (!data) return;
    await navigator.clipboard.writeText(buildChatPrompt(data, state));
    setMessage('Chat-Aufgabe kopiert. Füge sie in der FormPoesie-Etsy-Aufgabe ein; das strukturierte Ergebnis kannst du anschließend hier importieren.');
  }

  async function importChatResult() {
    if (!data) return;
    try {
      const result = JSON.parse(importText) as Record<string, unknown>;
      await workflowAction('stage', importState, result);
      setImportOpen(false); setImportText('');
    } catch {
      setMessage('Das Chat-Ergebnis ist kein gültiges JSON. Bitte nur den vollständigen JSON-Block einfügen.');
    }
  }

  const filteredItems = inventoryItems.filter((item) => `${item.modelName} ${item.productType}`.toLowerCase().includes(search.toLowerCase())).slice(0, 30);
  if (!data) return (
    <div className="mx-auto max-w-[1260px] px-4 py-8 md:px-8">
      <section className="rounded-[30px] border bg-white/60 p-6 md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">Etsy-Produktion</p><h1 className="mt-2 font-heading text-4xl md:text-5xl">Etsy Workflow</h1><p className="mt-3 max-w-2xl text-sm text-muted-foreground">Ein geführter Ablauf vom Inventarartikel bis zum geprüften Etsy-Listing.</p></div>
          <Button onClick={() => setPickerOpen(true)} disabled={busy === 'start'}><Sparkles className="size-4" /> Workflow starten</Button>
        </div>
        <div className="mt-7 grid gap-3 md:grid-cols-3">{[[Package, 'Inventar', 'Artikel und alle Varianten verbindlich übernehmen'], [ImageIcon, 'Bildstudio', 'Originale, Versionen und Freigaben getrennt sichern'], [CheckCircle2, 'Listing', 'Jeden Inhalt prüfen und ausdrücklich bestätigen']].map(([Icon, title, detail]) => { const C = Icon as typeof Package; return <div key={String(title)} className="rounded-2xl border bg-white/45 p-5"><C className="size-5 text-[var(--fp-primary)]"/><h2 className="mt-5 font-heading text-xl">{String(title)}</h2><p className="mt-1 text-xs text-muted-foreground">{String(detail)}</p></div>; })}</div>
        {message ? <p className="mt-5 rounded-xl border bg-[#fffaf2] p-3 text-sm">{message}</p> : null}
        <div className="mt-7 space-y-3">{workflows.map((workflow) => <button key={workflow.id} onClick={() => void loadWorkflow(workflow.id)} className="flex w-full items-center gap-4 rounded-2xl border bg-white/65 p-4 text-left transition hover:bg-white"><span className="grid size-11 place-items-center rounded-xl bg-[var(--fp-mist)]"><Sparkles className="size-5"/></span><span className="min-w-0 flex-1"><span className="block font-medium">{workflow.product.name}</span><span className="mt-1 block text-xs text-muted-foreground">{workflow.status === 'READY_FOR_ETSY' ? 'Abgeschlossen' : `Fortsetzen bei „${STEP_LABELS[workflow.currentState]}“`}</span></span><ArrowRight className="size-4"/></button>)}</div>
        {!workflows.length ? <div className="mt-7 rounded-2xl border border-dashed p-8 text-center"><p className="text-sm text-muted-foreground">Noch kein Etsy-Workflow vorhanden.</p><Button className="mt-4" onClick={() => setPickerOpen(true)}>Inventarartikel auswählen</Button></div> : null}
      </section>
      <ProductPicker open={pickerOpen} setOpen={setPickerOpen} search={search} setSearch={setSearch} items={filteredItems} start={start} busy={busy === 'start'} />
    </div>
  );

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white/60 p-4">
        <Button variant="ghost" size="icon" aria-label="Zur Workflow-Übersicht" onClick={() => { setData(null); void loadList(); }}><ArrowLeft className="size-4"/></Button>
        <div className="min-w-[190px] flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="font-heading text-2xl">{data.workflow.product.name}</h1><Badge variant="outline">{data.workflow.status === 'READY_FOR_ETSY' ? 'Bereit für Etsy' : 'Gespeichert'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{data.workflow.product.variants.length} {data.workflow.product.variants.length === 1 ? 'Variante' : 'Varianten'} · jederzeit fortsetzbar</p></div>
        <div className="text-xs text-muted-foreground">Stand {new Date(data.workflow.updatedAt).toLocaleString('de-DE')}</div>
      </div>
      {message ? <div className="mt-4 flex items-center justify-between rounded-xl border border-[#d8b88b] bg-[#fffaf2] p-3 text-sm"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Hinweis schließen"><X className="size-4"/></button></div> : null}
      <div className="mt-5 grid gap-5 xl:grid-cols-[255px_minmax(0,1fr)]">
        <nav className="h-fit rounded-2xl border bg-white/55 p-2 xl:sticky xl:top-20" aria-label="Workflow-Schritte">
          {VISIBLE_STEPS.map((state, index) => { const status = data.steps[state]?.status || 'NOT_STARTED'; const current = selectedStep === state; return <button key={state} data-step={state} onClick={() => setSelectedStep(state)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${current ? 'bg-[var(--fp-ink)] text-white' : 'hover:bg-white/70'}`}><span className={`grid size-6 shrink-0 place-items-center rounded-full border text-[11px] ${status === 'APPROVED' ? 'border-[var(--fp-primary)] bg-[var(--fp-primary)] text-white' : status === 'NEEDS_REVIEW' || status === 'ERROR' ? 'border-[#a35f43] text-[#a35f43]' : ''}`}>{status === 'APPROVED' ? <Check className="size-3.5"/> : index + 1}</span><span className="min-w-0 flex-1 truncate">{STEP_LABELS[state]}</span>{status === 'NEEDS_REVIEW' ? <AlertTriangle className="size-4 text-[#d9a06d]"/> : null}</button>; })}
        </nav>
        <div className="space-y-3">
          {chatStates.includes(selectedStep) ? <ChatHandoff state={selectedStep} onCopy={() => void copyChatTask(selectedStep)} onImport={() => { setImportState(selectedStep); setImportOpen(true); }} /> : null}
          <WorkflowStep data={data} state={selectedStep} busy={busy} setData={setData} action={workflowAction} imageAction={imageAction} onUpload={() => uploadRef.current?.click()} onExternalUpload={(imageId) => { setUploadTarget(imageId); generatedUploadRef.current?.click(); }} onImageChat={async (imageId, instruction) => { const image = data.images.find((item) => item.id === imageId); if (!image) return; await navigator.clipboard.writeText(`Bearbeite das angehängte Originalbild für den FormPoesie Etsy-Workflow. Stabile image_id: ${imageId}. Erhalte das Produkt exakt: Form, Proportionen, Anzahl, Oberfläche, Gravuren, Logos und Perspektive nicht verändern. Passe nur Hintergrund, Untergrund, Licht, Schatten, Umgebung und dezente Props an die hochwertige, ruhige, atmosphärische FormPoesie-Bildsprache an. Das Produkt bleibt der klare Mittelpunkt; Props dürfen nicht wie Lieferumfang wirken.${instruction ? ` Änderungswunsch: ${instruction}` : ''}\n\nErzeuge das bearbeitete Bild direkt im Chat. Ich lade es anschließend über „Bearbeitete Version hochladen“ wieder in den Workflow.`); setMessage(`Chat-Anweisung für „${image.filename}“ kopiert. Lade das Original im Chat hoch und anschließend die erzeugte Version hier wieder ein.`); }} />
        </div>
      </div>
      <input ref={uploadRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void uploadOriginals(event.target.files)} />
      <input ref={generatedUploadRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadGenerated(event.target.files?.[0])} />
      <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent className="border-[#d9d0c3] bg-[#f8f4ed] sm:max-w-2xl"><DialogHeader><DialogTitle className="font-heading text-3xl">Chat-Ergebnis importieren</DialogTitle><DialogDescription>Füge das vollständige JSON-Ergebnis für „{STEP_LABELS[importState]}“ ein. Es wird zuerst als neue Version zur Prüfung gespeichert.</DialogDescription></DialogHeader><Textarea className="mt-3 min-h-72 bg-white font-mono text-xs" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='{"…":"…"}'/><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setImportOpen(false)}>Abbrechen</Button><Button disabled={!importText.trim() || Boolean(busy)} onClick={() => void importChatResult()}>{busy ? <Loader2 className="size-4 animate-spin"/> : <Upload className="size-4"/>}Als neue Version übernehmen</Button></div></DialogContent></Dialog>
    </div>
  );
}

function ChatHandoff({ state, onCopy, onImport }: { state: EtsyState; onCopy: () => void; onImport: () => void }) {
  return <div className="flex flex-col gap-3 rounded-2xl border border-[var(--fp-primary)]/30 bg-[#edf1ed] p-4 sm:flex-row sm:items-center"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--fp-ink)] text-white"><Sparkles className="size-5"/></span><div className="min-w-0 flex-1"><div className="text-sm font-semibold">Diesen Schritt im Chat bearbeiten</div><div className="mt-1 text-xs leading-5 text-muted-foreground">Keine API: Kontext kopieren, in der FormPoesie-Etsy-Aufgabe bearbeiten und das JSON-Ergebnis zurückholen.</div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onCopy}>Chat-Aufgabe kopieren</Button><Button onClick={onImport}>Ergebnis importieren</Button></div></div>;
}

function ProductPicker({ open, setOpen, search, setSearch, items, start, busy }: { open: boolean; setOpen: (open: boolean) => void; search: string; setSearch: (value: string) => void; items: InventoryItem[]; start: (id: string) => void; busy: boolean }) {
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto border-[#d9d0c3] bg-[#f8f4ed] sm:max-w-2xl"><DialogHeader><DialogTitle className="font-heading text-3xl">Inventarartikel auswählen</DialogTitle><DialogDescription>Der Workflow übernimmt automatisch alle Varianten, Maße und Gewichte.</DialogDescription></DialogHeader><Input className="mt-3 bg-white" placeholder="Artikel suchen" value={search} onChange={(event) => setSearch(event.target.value)}/><div className="mt-3 space-y-2">{items.map((item) => <button key={item.id} disabled={busy} onClick={() => void start(String(item.id))} className="flex w-full items-center gap-3 rounded-xl border bg-white/70 p-3 text-left"><span className="grid size-11 place-items-center rounded-xl bg-[var(--fp-mist)]"><Package className="size-5"/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.modelName}</span><span className="block text-xs text-muted-foreground">{item.productType} · {item.variants.length} Varianten</span></span>{busy ? <Loader2 className="size-4 animate-spin"/> : <ArrowRight className="size-4"/>}</button>)}</div></DialogContent></Dialog>;
}

function WorkflowStep({ data, state, busy, setData, action, imageAction, onUpload, onExternalUpload, onImageChat }: { data: WorkflowData; state: EtsyState; busy: string; setData: React.Dispatch<React.SetStateAction<WorkflowData | null>>; action: (action: string, state?: EtsyState, result?: unknown, extra?: Record<string, unknown>) => Promise<void>; imageAction: (imageId: string, action: string, versionId?: string, instruction?: string) => Promise<void>; onUpload: () => void; onExternalUpload: (imageId: string) => void; onImageChat: (imageId: string, instruction: string) => Promise<void> }) {
  const step = data.steps[state] || { status: 'NOT_STARTED', result: {} };
  const result = step.result;
  const updateResult = (next: Record<string, unknown>) => setData((current) => current ? { ...current, steps: { ...current.steps, [state]: { ...current.steps[state], result: next } } } : current);
  const approved = step.status === 'APPROVED';
  const generating = busy.startsWith('generate-');
  const footer = (canApprove = true) => <div className="mt-6 flex flex-wrap justify-end gap-2 border-t pt-4">{state !== 'IMAGE_UPLOAD' && !['IMAGE_REVIEW', 'VARIANT_PRICING', 'FINAL_REVIEW'].includes(state) ? <Button variant="outline" disabled={generating} onClick={() => void action('generate', state)}><RefreshCw className={`size-4 ${generating ? 'animate-spin' : ''}`}/> {Object.keys(result).length ? 'Rohentwurf neu' : 'Rohentwurf ohne Chat'}</Button> : null}<Button disabled={!canApprove || Boolean(busy)} onClick={() => void action('approve', state, result)}><Check className="size-4"/> {approved ? 'Erneut bestätigen' : 'Bestätigen'}</Button></div>;

  if (state === 'IMAGE_UPLOAD') return <Shell title="Weitere Produktbilder hinzufügen" eyebrow="1 · Ausgangsmaterial" status={step.status}><button onClick={onUpload} className="flex w-full items-center gap-4 rounded-2xl border border-dashed border-[var(--fp-primary)]/45 bg-[#eef1ec] p-5 text-left"><span className="grid size-11 place-items-center rounded-full bg-[var(--fp-ink)] text-white">{busy === 'upload' ? <Loader2 className="size-5 animate-spin"/> : <Upload className="size-5"/>}</span><span><span className="block font-medium">Produktbilder auswählen</span><span className="text-xs text-muted-foreground">JPEG, PNG oder WebP · mehrere Bilder · Originale bleiben unverändert</span></span></button><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{data.images.map((image) => <div key={image.id} className="overflow-hidden rounded-xl border bg-white"><div className="relative aspect-square"><Image src={image.originalUrl} alt={image.filename} fill unoptimized className="object-cover"/></div><div className="truncate p-2 text-xs">{image.filename}</div></div>)}</div>{footer(data.images.length > 0)}</Shell>;

  if (state === 'IMAGE_REVIEW') return <ImageReview data={data} busy={busy} action={action} imageAction={imageAction} onUpload={onUpload} onExternalUpload={onExternalUpload} onImageChat={onImageChat}/>;

  if (state === 'KEYWORD_RESEARCH') { const tags = Array.isArray(result.tags) ? result.tags as string[] : []; return <Shell title="Keywords erstellen" eyebrow="3 · Suchintention" status={step.status}>{!Object.keys(result).length ? <EmptyGenerate busy={generating} onClick={() => void action('generate', state)} label="Hauptkeyword und 13 Tags erstellen"/> : <><label className="grid gap-2 text-sm"><span className="font-medium">Hauptkeyword</span><Input value={String(result.primary_keyword || '')} onChange={(e) => updateResult({ ...result, primary_keyword: e.target.value })}/></label><label className="mt-5 grid gap-2 text-sm"><span className="font-medium">13 Etsy-Tags</span><Textarea className="min-h-32" value={tags.join(', ')} onChange={(e) => updateResult({ ...result, tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 13) })}/><span className={tags.length === 13 ? 'text-xs text-[var(--fp-primary)]' : 'text-xs text-[#a35f43]'}>{tags.length} von 13 Tags</span></label></>}{footer(tags.length === 13 && Boolean(result.primary_keyword))}</Shell>; }

  if (state === 'IMAGE_ORDER') { const ids = (Array.isArray(result.image_ids) ? result.image_ids : data.images.filter((image) => image.status === 'APPROVED').map((image) => image.id)) as string[]; const move = (index: number, delta: number) => { const next = [...ids]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; updateResult({ image_ids: next }); }; return <Shell title="Bildreihenfolge" eyebrow="4 · Kaufargumente" status={step.status}>{!Object.keys(result).length ? <EmptyGenerate busy={generating} onClick={() => void action('generate', state)} label="Reihenfolge vorschlagen"/> : <div className="space-y-2">{ids.map((id, index) => { const image = data.images.find((item) => item.id === id); if (!image) return null; const version = image.versions.find((item) => item.id === image.activeVersionId); return <div key={id} className="flex items-center gap-3 rounded-xl border bg-white p-3"><span className="grid size-8 place-items-center rounded-full bg-[var(--fp-ink)] text-sm text-white">{index + 1}</span><div className="relative size-16 overflow-hidden rounded-lg"><Image src={version?.url || image.originalUrl} alt="" fill unoptimized className="object-cover"/></div><span className="min-w-0 flex-1 truncate text-sm">{image.filename}</span><Button variant="ghost" size="icon" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp className="size-4"/></Button><Button variant="ghost" size="icon" onClick={() => move(index, 1)} disabled={index === ids.length - 1}><ArrowDown className="size-4"/></Button></div>; })}</div>}{footer(ids.length > 0)}</Shell>; }

  if (state === 'TITLE') { const candidates = Array.isArray(result.candidates) ? result.candidates as Array<{ id: string; title: string }> : []; return <Shell title="Etsy-Titel" eyebrow="5 · Klick & Klarheit" status={step.status}>{!candidates.length ? <EmptyGenerate busy={generating} onClick={() => void action('generate', state)} label="Drei Titelvarianten erstellen"/> : <div className="space-y-3">{candidates.map((candidate, index) => <label key={candidate.id} className="flex gap-3 rounded-xl border bg-white p-4"><input type="radio" checked={result.selected_title === candidate.title} onChange={() => updateResult({ ...result, selected_title: candidate.title })}/><span className="flex-1"><Textarea value={candidate.title} className="min-h-20" onChange={(e) => { const next = candidates.map((item, i) => i === index ? { ...item, title: e.target.value } : item); updateResult({ ...result, candidates: next, selected_title: result.selected_title === candidate.title ? e.target.value : result.selected_title }); }}/><span className="text-xs text-muted-foreground">{candidate.title.length}/140 Zeichen</span></span></label>)}</div>}{footer(Boolean(result.selected_title))}</Shell>; }

  if (state === 'CART_SUMMARY') return <TextStep title="Warenkorb-Zusammenfassung" eyebrow="6 · Kurz & eindeutig" field="cart_summary" data={data} state={state} result={result} status={step.status} busy={busy} action={action} updateResult={updateResult}/>;
  if (state === 'VARIANT_PRICING') return <PricingStep data={data} busy={busy} action={action}/>;
  if (state === 'DESCRIPTION') return <DescriptionStep result={result} status={step.status} busy={busy} action={action} updateResult={updateResult}/>;
  if (state === 'ALT_TEXT') return <AltTextStep data={data} result={result} status={step.status} busy={busy} action={action} updateResult={updateResult}/>;
  if (state === 'HOLIDAY') return <HolidayStep data={data} result={result} status={step.status} busy={busy} action={action} updateResult={updateResult}/>;
  if (state === 'FINAL_REVIEW') return <FinalReview data={data} busy={busy} action={action}/>;
  return <Shell title={STEP_LABELS[state]} status={step.status}><p className="text-sm text-muted-foreground">Dieser Schritt wird aus den bestätigten Ergebnissen aufgebaut.</p>{footer()}</Shell>;
}

function Shell({ title, eyebrow, status, children }: { title: string; eyebrow?: string; status?: string; children: React.ReactNode }) { return <section className="rounded-[24px] border bg-white/62 p-5 md:p-7"><div className="flex items-start justify-between gap-4"><div>{eyebrow ? <p className="text-xs font-bold tracking-[.12em] text-[var(--fp-primary)] uppercase">{eyebrow}</p> : null}<h2 className="mt-1 font-heading text-3xl">{title}</h2></div>{status ? <Badge variant="outline">{statusLabel[status] || status}</Badge> : null}</div><div className="mt-6">{children}</div></section>; }
function EmptyGenerate({ busy, onClick, label }: { busy: boolean; onClick: () => void; label: string }) { return <div className="rounded-2xl border border-dashed p-8 text-center"><Sparkles className="mx-auto size-7 text-[var(--fp-primary)]"/><p className="mt-3 text-sm text-muted-foreground">Nutze oben die Chat-Übergabe. Optional kann die Webseite einen einfachen Rohentwurf ohne KI erzeugen.</p><Button className="mt-4" variant="outline" disabled={busy} onClick={onClick}>{busy ? <Loader2 className="size-4 animate-spin"/> : <RefreshCw className="size-4"/>}Rohentwurf ohne Chat<span className="sr-only">: {label}</span></Button></div>; }

function ImageReview({ data, busy, action, imageAction, onUpload, onExternalUpload, onImageChat }: { data: WorkflowData; busy: string; action: (action: string, state?: EtsyState, result?: unknown) => Promise<void>; imageAction: (imageId: string, action: string, versionId?: string, instruction?: string) => Promise<void>; onUpload: () => void; onExternalUpload: (imageId: string) => void; onImageChat: (imageId: string, instruction: string) => Promise<void> }) {
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const terminal = data.images.length > 0 && data.images.every((image) => ['APPROVED', 'REJECTED'].includes(image.status));
  return <Shell title="Bilder einzeln prüfen" eyebrow="2 · Hintergrund & Inszenierung" status={data.steps.IMAGE_REVIEW?.status}><div className="mb-5 rounded-xl border border-[var(--fp-primary)]/25 bg-[#edf1ed] p-4 text-sm"><strong>Bearbeitung im Chat:</strong> Anweisung kopieren, dieses Original im Chat anhängen, dort das Bild erzeugen und die fertige Version anschließend wieder hochladen.</div><div className="space-y-5">{data.images.map((image) => { const latest = image.versions.at(-1); const loading = busy.endsWith(image.id); return <article key={image.id} className="rounded-2xl border bg-white p-4"><div className="grid gap-4 md:grid-cols-2"><figure><figcaption className="mb-2 text-xs font-medium text-muted-foreground">ORIGINAL · {image.id}</figcaption><div className="relative aspect-square overflow-hidden rounded-xl bg-[var(--fp-mist)]"><Image src={image.originalUrl} alt={`Original ${image.filename}`} fill unoptimized className="object-contain"/></div></figure><figure><figcaption className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground"><span>BEARBEITETE VERSION</span><Badge variant="outline">{image.status}</Badge></figcaption><div className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-[#eee9e1]">{latest?.url ? <Image src={latest.url} alt={`Bearbeitete Version ${image.filename}`} fill unoptimized className="object-contain"/> : <div className="p-5 text-center text-xs text-muted-foreground"><ImageIcon className="mx-auto mb-2 size-7"/>Noch keine Version hochgeladen</div>}</div></figure></div><Textarea className="mt-4 min-h-20" placeholder="Optionaler Änderungswunsch, z. B. heller Hintergrund, weniger Props …" value={instructions[image.id] || ''} onChange={(event) => setInstructions((current) => ({ ...current, [image.id]: event.target.value }))}/><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={loading} onClick={() => void onImageChat(image.id, instructions[image.id] || '')}><Sparkles className="size-4"/>Chat-Anweisung kopieren</Button><a href={image.originalUrl} target="_blank" rel="noreferrer"><Button type="button" variant="outline">Original öffnen</Button></a><Button variant="outline" disabled={loading} onClick={() => onExternalUpload(image.id)}><Upload className="size-4"/>Bearbeitete Version hochladen</Button>{latest?.url ? <Button disabled={loading} onClick={() => void imageAction(image.id, 'approve', latest.id)}><Check className="size-4"/>Bild bestätigen</Button> : null}<Button variant="ghost" disabled={loading} className="text-[#8b453a]" onClick={() => void imageAction(image.id, 'reject')}>Bild verwerfen</Button></div></article>; })}</div><div className="mt-5 flex flex-wrap justify-between gap-2 border-t pt-4"><Button variant="outline" onClick={onUpload}><Upload className="size-4"/>Weitere Bilder</Button><Button disabled={!terminal || Boolean(busy)} onClick={() => void action('approve', 'IMAGE_REVIEW', { image_ids: data.images.filter((image) => image.status === 'APPROVED').map((image) => image.id) })}><Check className="size-4"/>Bildauswahl abschließen</Button></div></Shell>;
}

function TextStep({ title, eyebrow, field, state, result, status, busy, action, updateResult }: { title: string; eyebrow: string; field: string; data: WorkflowData; state: EtsyState; result: Record<string, unknown>; status: string; busy: string; action: (action: string, state?: EtsyState, result?: unknown) => Promise<void>; updateResult: (next: Record<string, unknown>) => void }) { const generating = busy.startsWith('generate-'); return <Shell title={title} eyebrow={eyebrow} status={status}>{!Object.keys(result).length ? <EmptyGenerate busy={generating} onClick={() => void action('generate', state)} label="Vorschlag erstellen"/> : <Textarea className="min-h-32" value={String(result[field] || '')} onChange={(event) => updateResult({ ...result, [field]: event.target.value })}/>}<div className="mt-6 flex justify-end gap-2 border-t pt-4"><Button variant="outline" disabled={generating} onClick={() => void action('generate', state)}><RefreshCw className="size-4"/>Rohentwurf neu</Button><Button disabled={!result[field] || Boolean(busy)} onClick={() => void action('approve', state, result)}><Check className="size-4"/>Bestätigen</Button></div></Shell>; }

function PricingStep({ data, busy, action }: { data: WorkflowData; busy: string; action: (action: string, state?: EtsyState, result?: unknown, extra?: Record<string, unknown>) => Promise<void> }) { const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(data.workflow.product.variants.map((variant) => [variant.id, data.prices[variant.id] ? String((data.prices[variant.id] || 0) / 100).replace('.', ',') : '']))); const valid = data.workflow.product.variants.every((variant) => Number(String(prices[variant.id] || '').replace(',', '.')) > 0); return <Shell title="Varianten & Preise" eyebrow="7 · Verbindliche Inventardaten" status={data.steps.VARIANT_PRICING?.status}><div className="overflow-hidden rounded-xl border">{data.workflow.product.variants.map((variant) => <div key={variant.id} className="grid gap-3 border-b bg-white p-4 last:border-0 sm:grid-cols-[1fr_1fr_1fr_160px] sm:items-center"><div><div className="text-xs text-muted-foreground">Variante</div><div className="font-medium">{variant.name}</div></div><div><div className="text-xs text-muted-foreground">Größe · schreibgeschützt</div><div className="text-sm">{displaySize(data.workflow.product, variant)}</div></div><div><div className="text-xs text-muted-foreground">Gewicht · schreibgeschützt</div><div className="text-sm">{variant.weight.value == null ? 'offen' : `${variant.weight.value} ${variant.weight.unit}`}</div></div><label className="grid gap-1 text-xs"><span>Etsy-Preis (€)</span><Input inputMode="decimal" value={prices[variant.id] || ''} onChange={(event) => setPrices((current) => ({ ...current, [variant.id]: event.target.value }))}/></label></div>)}</div><div className="mt-5 flex justify-end"><Button disabled={!valid || Boolean(busy)} onClick={() => void action('save-prices', 'VARIANT_PRICING', undefined, { prices: Object.fromEntries(Object.entries(prices).map(([key, value]) => [key, Number(value.replace(',', '.'))])) })}>{busy ? <Loader2 className="size-4 animate-spin"/> : <Check className="size-4"/>}Preise bestätigen</Button></div></Shell>; }

function DescriptionStep({ result, status, busy, action, updateResult }: { result: Record<string, unknown>; status: string; busy: string; action: (action: string, state?: EtsyState, result?: unknown) => Promise<void>; updateResult: (next: Record<string, unknown>) => void }) { const generating = busy.startsWith('generate-'); return <Shell title="Produktbeschreibung" eyebrow="8 · Deutsch & Englisch" status={status}>{!Object.keys(result).length ? <EmptyGenerate busy={generating} onClick={() => void action('generate', 'DESCRIPTION')} label="Beschreibungen erstellen"/> : <div className="grid gap-5 lg:grid-cols-2"><label className="grid gap-2 text-sm"><span className="font-medium">Deutsch</span><Textarea className="min-h-[520px] leading-6" value={String(result.description_de || '')} onChange={(event) => updateResult({ ...result, description_de: event.target.value })}/></label><label className="grid gap-2 text-sm"><span className="font-medium">English</span><Textarea className="min-h-[520px] leading-6" value={String(result.description_en || '')} onChange={(event) => updateResult({ ...result, description_en: event.target.value })}/></label></div>}<div className="mt-6 flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => void action('generate', 'DESCRIPTION')} disabled={generating}><RefreshCw className="size-4"/>Rohentwurf neu</Button><Button disabled={!result.description_de || !result.description_en || Boolean(busy)} onClick={() => void action('approve', 'DESCRIPTION', result)}><Check className="size-4"/>Beide Versionen bestätigen</Button></div></Shell>; }

function AltTextStep({ data, result, status, busy, action, updateResult }: { data: WorkflowData; result: Record<string, unknown>; status: string; busy: string; action: (action: string, state?: EtsyState, result?: unknown) => Promise<void>; updateResult: (next: Record<string, unknown>) => void }) { const items = Array.isArray(result.items) ? result.items as Array<{ image_id: string; alt_text_de: string; alt_text_en: string }> : []; const generating = busy.startsWith('generate-'); return <Shell title="Alt-Texte" eyebrow="9 · Barrierefreie Bildbeschreibung" status={status}>{!items.length ? <EmptyGenerate busy={generating} onClick={() => void action('generate', 'ALT_TEXT')} label="Alt-Texte erstellen"/> : <div className="space-y-4">{items.map((item, index) => { const image = data.images.find((entry) => entry.id === item.image_id); return <div key={item.image_id} className="grid gap-4 rounded-xl border bg-white p-4 md:grid-cols-[120px_1fr]"><div className="relative aspect-square overflow-hidden rounded-lg">{image ? <Image src={image.versions.find((v) => v.id === image.activeVersionId)?.url || image.originalUrl} alt="" fill unoptimized className="object-cover"/> : null}</div><div className="space-y-3"><Textarea value={item.alt_text_de} aria-label="Alt-Text Deutsch" onChange={(event) => { const next = [...items]; next[index] = { ...item, alt_text_de: event.target.value }; updateResult({ items: next }); }}/><Textarea value={item.alt_text_en} aria-label="Alt text English" onChange={(event) => { const next = [...items]; next[index] = { ...item, alt_text_en: event.target.value }; updateResult({ items: next }); }}/></div></div>; })}</div>}<div className="mt-6 flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => void action('generate', 'ALT_TEXT')}><RefreshCw className="size-4"/>Rohentwurf neu</Button><Button disabled={!items.length || items.some((item) => !item.alt_text_de || !item.alt_text_en) || Boolean(busy)} onClick={() => void action('approve', 'ALT_TEXT', result)}><Check className="size-4"/>Bestätigen</Button></div></Shell>; }

function HolidayStep({ data, result, status, busy, action, updateResult }: { data: WorkflowData; result: Record<string, unknown>; status: string; busy: string; action: (action: string, state?: EtsyState, result?: unknown) => Promise<void>; updateResult: (next: Record<string, unknown>) => void }) { const generating = busy.startsWith('generate-'); return <Shell title="Feiertagsattribut" eyebrow="10 · Korrekte Einordnung" status={status}>{!Object.keys(result).length ? <EmptyGenerate busy={generating} onClick={() => void action('generate', 'HOLIDAY')} label="Einordnung prüfen"/> : <div className="space-y-4"><div className="rounded-xl border bg-white p-4"><Badge variant="outline">{String(result.classification || '')}</Badge><p className="mt-3 text-sm leading-6">{String(result.reason || '')}</p></div><label className="grid gap-2 text-sm"><span className="font-medium">Feiertag</span><select className="h-10 rounded-lg border bg-white px-3" value={String(result.recommended_holiday || '')} onChange={(event) => updateResult({ ...result, recommended_holiday: event.target.value || null, classification: event.target.value ? 'HOLIDAY_RELEVANT' : 'NO_HOLIDAY_RELATION' })}><option value="">Kein Feiertag</option>{data.holidays.map((holiday) => <option key={holiday}>{holiday}</option>)}</select></label></div>}<div className="mt-6 flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => void action('generate', 'HOLIDAY')}><RefreshCw className="size-4"/>Rohentwurf neu</Button><Button disabled={!Object.keys(result).length || Boolean(busy)} onClick={() => void action('approve', 'HOLIDAY', result)}><Check className="size-4"/>Entscheidung übernehmen</Button></div></Shell>; }

function FinalReview({ data, busy, action }: { data: WorkflowData; busy: string; action: (action: string, state?: EtsyState, result?: unknown) => Promise<void> }) { const review = data.steps.FINAL_REVIEW?.result as { status?: string; issues?: Array<{ type: string; state: EtsyState; message: string }> }; const ready = review.status === 'READY_FOR_ETSY'; return <Shell title="Final Check" eyebrow="11 · Konsistenzprüfung" status={data.steps.FINAL_REVIEW?.status}>{!review.status ? <EmptyGenerate busy={busy.startsWith('generate-')} onClick={() => void action('generate', 'FINAL_REVIEW')} label="Listing vollständig prüfen"/> : <><div className={`flex items-center gap-3 rounded-xl border p-4 ${ready ? 'bg-[#edf3ee] text-[#31443f]' : 'bg-[#fffaf2]'}`}>{ready ? <CheckCircle2 className="size-6"/> : <AlertTriangle className="size-6"/>}<div><div className="font-semibold">{ready ? 'READY_FOR_ETSY' : 'NEEDS_FIX'}</div><div className="text-xs">{ready ? 'Alle Pflichtbereiche sind konsistent bestätigt.' : `${review.issues?.length || 0} Punkte müssen geprüft werden.`}</div></div></div><div className="mt-4 space-y-2">{review.issues?.map((issue) => <button key={`${issue.type}-${issue.message}`} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left" onClick={() => document.querySelector<HTMLButtonElement>(`button[data-step='${issue.state}']`)?.click()}><AlertTriangle className="size-4 text-[#a35f43]"/><span className="flex-1 text-sm">{issue.message}</span><Badge variant="outline">{STEP_LABELS[issue.state]}</Badge></button>)}</div></>}<div className="mt-6 flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => void action('generate', 'FINAL_REVIEW')}><RefreshCw className="size-4"/>Erneut prüfen</Button><Button disabled={!ready || Boolean(busy) || data.workflow.status === 'READY_FOR_ETSY'} onClick={() => void action('complete')}><CheckCircle2 className="size-4"/>{data.workflow.status === 'READY_FOR_ETSY' ? 'Abgeschlossen' : 'Listing abschließen'}</Button></div></Shell>; }
