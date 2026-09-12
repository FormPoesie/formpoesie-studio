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
  Save,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { InventoryItem } from '@/lib/inventory-bridge';
import {
  STEP_LABELS,
  VISIBLE_STEPS,
  type EtsyState,
} from '@/lib/etsy-workflow';

type ProductSnapshot = {
  id: string;
  name: string;
  productType: string;
  buyerWorld: string;
  dimensions: {
    width: number | null;
    depth: number | null;
    height: number | null;
    unit: string;
  };
  variants: Array<{
    id: string;
    name: string;
    size: string;
    weight: { value: number | null; unit: string };
    productionCost: number | null;
    currentPrice: number | null;
  }>;
};
type Step = {
  status: string;
  result: Record<string, unknown>;
  activeVersion?: number;
  approvedAt?: string;
};
type WorkflowData = {
  workflow: {
    id: string;
    productId: string;
    product: ProductSnapshot;
    currentState: EtsyState;
    status: string;
    revision: number;
    updatedAt: string;
  };
  steps: Record<EtsyState, Step>;
  images: Array<{
    id: string;
    filename: string;
    referenceKind: 'PRODUCT' | 'BACKGROUND';
    status: string;
    position: number;
    activeVersionId?: string;
    originalUrl: string;
    versions: Array<{
      id: string;
      version: number;
      instruction?: string;
      status: string;
      approved: boolean;
      url?: string | null;
    }>;
  }>;
  imageSlots: Array<{
    id: string;
    position: number;
    title: string;
    perspective: string;
    instruction: string;
    format: string;
    status: string;
    activeVersionId?: string;
    approvedAt?: string;
    versions: Array<{
      id: string;
      version: number;
      status: string;
      taskPrompt: string;
      url?: string | null;
    }>;
  }>;
  prices: Record<string, number | null>;
  pricing: Record<
    string,
    {
      variantId: string;
      cogsCents: number | null;
      activePriceCents: number | null;
      recommendedPriceCents: number | null;
      floorPriceCents: number | null;
      marketAnchorCents: number | null;
      discountState: 'GREEN' | 'YELLOW' | 'RED' | null;
      status: string;
      confidence: string;
      reason: string;
      recommendationId?: string;
      createdAt?: string;
    }
  >;
  marketUpdates: Array<{
    id: string;
    variantId: string;
    previousRecommendationCents: number | null;
    newRecommendationCents: number | null;
    percentageDifference: number | null;
    status: string;
    createdAt: string;
  }>;
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
  STALE_KEYWORDS: 'Neue Marktdaten',
  ERROR: 'Fehler',
};

function displaySize(
  product: ProductSnapshot,
  variant: ProductSnapshot['variants'][number],
) {
  if (variant.size) return variant.size;
  const { width, depth, height, unit } = product.dimensions;
  return [width, depth, height].every((value) => typeof value === 'number')
    ? `${width} × ${depth} × ${height} ${unit}`
    : 'Maße im Inventar offen';
}

const chatStates: EtsyState[] = [
  'KEYWORD_RESEARCH',
  'IMAGE_ORDER',
  'TITLE',
  'CART_SUMMARY',
  'DESCRIPTION',
  'ALT_TEXT',
  'HOLIDAY',
];

function chatSchema(state: EtsyState) {
  const schemas: Partial<Record<EtsyState, unknown>> = {
    KEYWORD_RESEARCH: {
      primary_keyword: 'string',
      tags: ['exakt 13 Strings, je maximal 20 Zeichen'],
    },
    IMAGE_ORDER: { image_ids: ['stabile image_id in empfohlener Reihenfolge'] },
    TITLE: {
      candidates: [
        { id: 'A', title: 'string' },
        { id: 'B', title: 'string' },
        { id: 'C', title: 'string' },
      ],
      recommended: 'A|B|C',
      selected_title: 'string',
    },
    CART_SUMMARY: { cart_summary: 'string' },
    DESCRIPTION: { description_de: 'string', description_en: 'string' },
    ALT_TEXT: {
      items: [
        { image_id: 'string', alt_text_de: 'string', alt_text_en: 'string' },
      ],
    },
    HOLIDAY: {
      classification: 'HOLIDAY_SPECIFIC|HOLIDAY_RELEVANT|NO_HOLIDAY_RELATION',
      recommended_holiday: 'string|null',
      reason: 'string',
    },
  };
  return schemas[state] || {};
}

function buildChatPrompt(data: WorkflowData, state: EtsyState) {
  const approved = Object.fromEntries(
    Object.entries(data.steps)
      .filter(([, value]) => value?.status === 'APPROVED')
      .map(([key, value]) => [key, value.result]),
  );
  return `Du arbeitest am FormPoesie Etsy-Workflow. Erstelle ausschließlich den Schritt ${state}. Verwende keine API und erfinde keine Produkteigenschaften. Artikelname, Varianten, Maße und Gewichte sind autoritativ und dürfen nicht geändert werden. SKU, Lagerbestand, Inventarmaterial und Inventarfarbe sind außerhalb des Scopes. Antworte ausschließlich mit gültigem JSON ohne Markdown-Codeblock, passend zum angegebenen Ausgabeschema.\n\nWORKFLOW-KONTEXT:\n${JSON.stringify({ workflow_id: data.workflow.id, product: data.workflow.product, approved_steps: approved, images: data.images.filter((image) => image.status === 'APPROVED').map((image) => ({ image_id: image.id, filename: image.filename, position: image.position })) }, null, 2)}\n\nAUSGABESCHEMA:\n${JSON.stringify(chatSchema(state), null, 2)}`;
}

export function EtsyWorkflow({
  inventoryItems,
  initialProductId = '',
}: {
  inventoryItems: InventoryItem[];
  initialProductId?: string;
}) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [data, setData] = useState<WorkflowData | null>(null);
  const [selectedStep, setSelectedStep] = useState<EtsyState>('IMAGE_UPLOAD');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);
  const backgroundUploadRef = useRef<HTMLInputElement>(null);
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
    const response = await fetch(
      `/api/etsy-workflow?workflowId=${encodeURIComponent(workflowId)}`,
    );
    if (!response.ok) return;
    const next = (await response.json()) as WorkflowData;
    setData(next);
    setSelectedStep(
      next.workflow.currentState === 'COMPLETED'
        ? 'FINAL_REVIEW'
        : next.workflow.currentState,
    );
  }
  useEffect(() => {
    void loadList();
  }, []);
  useEffect(() => {
    if (!initialProductId) return;
    void start(initialProductId);
  }, [initialProductId]);

  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options?: unknown,
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) =>
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => undefined);
    void register({
      name: 'read_etsy_workflow_context',
      title: 'Etsy-Workflow lesen',
      description:
        'Liest den aktuell geöffneten FormPoesie Etsy-Workflow mit autoritativen Produktdaten, Freigaben und dem aktuellen Schritt. Meldet klar, wenn noch kein Workflow geöffnet ist.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () =>
        data
          ? {
              workflow_id: data.workflow.id,
              revision: data.workflow.revision,
              current_state: data.workflow.currentState,
              product: data.workflow.product,
              steps: data.steps,
              images: data.images.map((image) => ({
                image_id: image.id,
                filename: image.filename,
                status: image.status,
                position: image.position,
              })),
            }
          : { workflow: null, message: 'Noch kein Etsy-Workflow geöffnet.' },
    });
    void register({
      name: 'stage_etsy_workflow_result',
      title: 'Chat-Ergebnis im Etsy-Workflow ablegen',
      description:
        'Speichert ein im Chat erzeugtes strukturiertes Ergebnis zur manuellen Prüfung. Bestätigt es niemals automatisch.',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: chatStates },
          result: { type: 'object' },
        },
        required: ['state', 'result'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        if (!data)
          throw new Error('Öffne zuerst einen Etsy-Workflow in der Website.');
        const value = input as {
          state?: EtsyState;
          result?: Record<string, unknown>;
        };
        if (!value.state || !chatStates.includes(value.state) || !value.result)
          throw new Error(
            'Ungültiger Workflow-Schritt oder fehlendes Ergebnis.',
          );
        const response = await fetch('/api/etsy-workflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'stage',
            workflowId: data.workflow.id,
            revision: data.workflow.revision,
            state: value.state,
            result: value.result,
          }),
        });
        const next = (await response.json()) as WorkflowData & {
          error?: string;
        };
        if (!response.ok || !next.workflow)
          throw new Error(
            next.error || 'Ergebnis konnte nicht gespeichert werden.',
          );
        setData(next);
        setSelectedStep(value.state);
        return {
          workflow_id: next.workflow.id,
          state: value.state,
          status: next.steps[value.state].status,
          revision: next.workflow.revision,
        };
      },
    });
    return () => lifecycle.abort();
  }, [data]);

  async function start(productId: string) {
    setBusy('start');
    setMessage('');
    const response = await fetch('/api/etsy-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', productId }),
    });
    const result = (await response.json().catch(() => ({}))) as WorkflowData & {
      error?: string;
    };
    setBusy('');
    if (!response.ok || !result.workflow) {
      setMessage(result.error || 'Workflow konnte nicht gestartet werden.');
      return;
    }
    setPickerOpen(false);
    setData(result);
    setSelectedStep(result.workflow.currentState);
    void loadList();
  }

  async function workflowAction(
    action: string,
    state?: EtsyState,
    result?: unknown,
    extra: Record<string, unknown> = {},
  ) {
    if (!data) return;
    setBusy(`${action}-${state || ''}`);
    setMessage('');
    const response = await fetch('/api/etsy-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        workflowId: data.workflow.id,
        revision: data.workflow.revision,
        state,
        result,
        ...extra,
      }),
    });
    const next = (await response.json().catch(() => ({}))) as WorkflowData & {
      error?: string;
    };
    setBusy('');
    if (!response.ok || !next.workflow) {
      setMessage(
        next.error === 'WORKFLOW_STATE_CONFLICT'
          ? 'Der Workflow wurde in einem anderen Tab geändert. Ich lade den aktuellen Stand.'
          : next.error || 'Änderung konnte nicht gespeichert werden.',
      );
      await loadWorkflow(data.workflow.id);
      return;
    }
    setData(next);
    setSelectedStep(
      next.workflow.currentState === 'COMPLETED'
        ? 'FINAL_REVIEW'
        : next.workflow.currentState,
    );
    void loadList();
  }

  async function uploadReferences(
    files: FileList | null,
    kind: 'product-reference' | 'background-reference',
  ) {
    if (!data || !files?.length) return;
    setBusy('upload');
    setMessage('');
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      form.append('workflowId', data.workflow.id);
      form.append('kind', kind);
      const response = await fetch('/api/etsy-workflow/images', {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        setMessage('Ein Bild konnte nicht gespeichert werden.');
        break;
      }
    }
    setBusy('');
    if (uploadRef.current) uploadRef.current.value = '';
    if (backgroundUploadRef.current) backgroundUploadRef.current.value = '';
    await loadWorkflow(data.workflow.id);
  }

  async function imageAction(
    slotId: string,
    action: string,
    versionId = '',
    instruction = '',
  ) {
    if (!data) return;
    setBusy(`${action}-${slotId}`);
    setMessage('');
    const response = await fetch('/api/etsy-workflow/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slotId,
        action,
        versionId,
        instruction,
        revision: data.workflow.revision,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      prompt?: string;
    };
    setBusy('');
    if (!response.ok) setMessage(result.error || 'Bildaktion fehlgeschlagen.');
    else if (action === 'create-task' && result.prompt) {
      await navigator.clipboard.writeText(result.prompt);
      setMessage(
        'Vollständige Einzelbild-Aufgabe kopiert. Öffne die Referenzen aus dem ersten Schritt im Chat, erzeuge genau ein Bild und importiere es anschließend in diesen Slot.',
      );
    }
    await loadWorkflow(data.workflow.id);
  }

  async function uploadGenerated(file: File | undefined) {
    if (!data || !file || !uploadTarget) return;
    setBusy(`external-${uploadTarget}`);
    const form = new FormData();
    form.append('file', file);
    form.append('workflowId', data.workflow.id);
    form.append('slotId', uploadTarget);
    form.append('kind', 'slot-result');
    const response = await fetch('/api/etsy-workflow/images', {
      method: 'POST',
      body: form,
    });
    setBusy('');
    if (!response.ok)
      setMessage('Bearbeitete Version konnte nicht gespeichert werden.');
    if (generatedUploadRef.current) generatedUploadRef.current.value = '';
    await loadWorkflow(data.workflow.id);
  }

  async function copyChatTask(state: EtsyState) {
    if (!data) return;
    await navigator.clipboard.writeText(buildChatPrompt(data, state));
    setMessage(
      'Chat-Aufgabe kopiert. Füge sie in der FormPoesie-Etsy-Aufgabe ein; das strukturierte Ergebnis kannst du anschließend hier importieren.',
    );
  }

  async function importChatResult() {
    if (!data) return;
    try {
      const result = JSON.parse(importText) as Record<string, unknown>;
      await workflowAction('stage', importState, result);
      setImportOpen(false);
      setImportText('');
    } catch {
      setMessage(
        'Das Chat-Ergebnis ist kein gültiges JSON. Bitte nur den vollständigen JSON-Block einfügen.',
      );
    }
  }

  const filteredItems = inventoryItems
    .filter((item) =>
      `${item.modelName} ${item.productType}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .slice(0, 30);
  if (!data)
    return (
      <div className="mx-auto max-w-[1260px] px-4 py-8 md:px-8">
        <section className="rounded-[30px] border bg-white/60 p-6 md:p-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
                Etsy-Produktion
              </p>
              <h1 className="mt-2 font-heading text-4xl md:text-5xl">
                Etsy Workflow
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                Ein geführter Ablauf vom Inventarartikel bis zum geprüften
                Etsy-Listing.
              </p>
            </div>
            <Button
              onClick={() => setPickerOpen(true)}
              disabled={busy === 'start'}
            >
              <Sparkles className="size-4" /> Workflow starten
            </Button>
          </div>
          <div className="mt-7 grid gap-3 md:grid-cols-3">
            {[
              [
                Package,
                'Inventar',
                'Artikel und alle Varianten verbindlich übernehmen',
              ],
              [
                ImageIcon,
                'Bildstudio',
                'Originale, Versionen und Freigaben getrennt sichern',
              ],
              [
                CheckCircle2,
                'Listing',
                'Jeden Inhalt prüfen und ausdrücklich bestätigen',
              ],
            ].map(([Icon, title, detail]) => {
              const C = Icon as typeof Package;
              return (
                <div
                  key={String(title)}
                  className="rounded-2xl border bg-white/45 p-5"
                >
                  <C className="size-5 text-[var(--fp-primary)]" />
                  <h2 className="mt-5 font-heading text-xl">{String(title)}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {String(detail)}
                  </p>
                </div>
              );
            })}
          </div>
          {message ? (
            <p className="mt-5 rounded-xl border bg-[#fffaf2] p-3 text-sm">
              {message}
            </p>
          ) : null}
          <div className="mt-7 space-y-3">
            {workflows.map((workflow) => (
              <button
                key={workflow.id}
                onClick={() => void loadWorkflow(workflow.id)}
                className="flex w-full items-center gap-4 rounded-2xl border bg-white/65 p-4 text-left transition hover:bg-white"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-[var(--fp-mist)]">
                  <Sparkles className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {workflow.product.name}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {workflow.status === 'READY_FOR_ETSY'
                      ? 'Abgeschlossen'
                      : `Fortsetzen bei „${STEP_LABELS[workflow.currentState]}“`}
                  </span>
                </span>
                <ArrowRight className="size-4" />
              </button>
            ))}
          </div>
          {!workflows.length ? (
            <div className="mt-7 rounded-2xl border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Noch kein Etsy-Workflow vorhanden.
              </p>
              <Button className="mt-4" onClick={() => setPickerOpen(true)}>
                Inventarartikel auswählen
              </Button>
            </div>
          ) : null}
        </section>
        <ProductPicker
          open={pickerOpen}
          setOpen={setPickerOpen}
          search={search}
          setSearch={setSearch}
          items={filteredItems}
          start={start}
          busy={busy === 'start'}
        />
      </div>
    );

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white/60 p-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zur Workflow-Übersicht"
          onClick={() => {
            setData(null);
            void loadList();
          }}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-[190px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl">
              {data.workflow.product.name}
            </h1>
            <Badge variant="outline">
              {data.workflow.status === 'READY_FOR_ETSY'
                ? 'Bereit für Etsy'
                : 'Gespeichert'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.workflow.product.variants.length}{' '}
            {data.workflow.product.variants.length === 1
              ? 'Variante'
              : 'Varianten'}{' '}
            · jederzeit fortsetzbar
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Stand {new Date(data.workflow.updatedAt).toLocaleString('de-DE')}
        </div>
      </div>
      {message ? (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-[#d8b88b] bg-[#fffaf2] p-3 text-sm">
          <span>{message}</span>
          <button onClick={() => setMessage('')} aria-label="Hinweis schließen">
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      <div className="mt-5 grid gap-5 xl:grid-cols-[255px_minmax(0,1fr)]">
        <nav
          className="h-fit rounded-2xl border bg-white/55 p-2 xl:sticky xl:top-20"
          aria-label="Workflow-Schritte"
        >
          {VISIBLE_STEPS.map((state, index) => {
            const status = data.steps[state]?.status || 'NOT_STARTED';
            const current = selectedStep === state;
            return (
              <button
                key={state}
                data-step={state}
                onClick={() => setSelectedStep(state)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${current ? 'bg-[var(--fp-ink)] text-white' : 'hover:bg-white/70'}`}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full border text-[11px] ${status === 'APPROVED' ? 'border-[var(--fp-primary)] bg-[var(--fp-primary)] text-white' : status === 'NEEDS_REVIEW' || status === 'STALE_KEYWORDS' || status === 'ERROR' ? 'border-[#a35f43] text-[#a35f43]' : ''}`}
                >
                  {status === 'APPROVED' ? (
                    <Check className="size-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {STEP_LABELS[state]}
                </span>
                {status === 'NEEDS_REVIEW' || status === 'STALE_KEYWORDS' ? (
                  <AlertTriangle className="size-4 text-[#d9a06d]" />
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="space-y-3">
          {chatStates.includes(selectedStep) ? (
            <ChatHandoff
              state={selectedStep}
              onCopy={() => void copyChatTask(selectedStep)}
              onImport={() => {
                setImportState(selectedStep);
                setImportOpen(true);
              }}
            />
          ) : null}
          <WorkflowStep
            data={data}
            state={selectedStep}
            busy={busy}
            setData={setData}
            action={workflowAction}
            imageAction={imageAction}
            onUpload={() => uploadRef.current?.click()}
            onBackgroundUpload={() => backgroundUploadRef.current?.click()}
            onExternalUpload={(slotId) => {
              setUploadTarget(slotId);
              generatedUploadRef.current?.click();
            }}
          />
        </div>
      </div>
      <input
        ref={uploadRef}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) =>
          void uploadReferences(event.target.files, 'product-reference')
        }
      />
      <input
        ref={backgroundUploadRef}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) =>
          void uploadReferences(event.target.files, 'background-reference')
        }
      />
      <input
        ref={generatedUploadRef}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => void uploadGenerated(event.target.files?.[0])}
      />
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="border-[#d9d0c3] bg-[#f8f4ed] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-3xl">
              Chat-Ergebnis importieren
            </DialogTitle>
            <DialogDescription>
              Füge das vollständige JSON-Ergebnis für „
              {STEP_LABELS[importState]}“ ein. Es wird zuerst als neue Version
              zur Prüfung gespeichert.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="mt-3 min-h-72 bg-white font-mono text-xs"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder='{"…":"…"}'
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={!importText.trim() || Boolean(busy)}
              onClick={() => void importChatResult()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Als neue Version übernehmen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChatHandoff({
  state,
  onCopy,
  onImport,
}: {
  state: EtsyState;
  onCopy: () => void;
  onImport: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--fp-primary)]/30 bg-[#edf1ed] p-4 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--fp-ink)] text-white">
        <Sparkles className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">
          Diesen Schritt im Chat bearbeiten
        </div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">
          Keine API: Kontext kopieren, in der FormPoesie-Etsy-Aufgabe bearbeiten
          und das JSON-Ergebnis zurückholen.
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onCopy}>
          Chat-Aufgabe kopieren
        </Button>
        <Button onClick={onImport}>Ergebnis importieren</Button>
      </div>
    </div>
  );
}

function ProductPicker({
  open,
  setOpen,
  search,
  setSearch,
  items,
  start,
  busy,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  search: string;
  setSearch: (value: string) => void;
  items: InventoryItem[];
  start: (id: string) => void;
  busy: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[#d9d0c3] bg-[#f8f4ed] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-3xl">
            Inventarartikel auswählen
          </DialogTitle>
          <DialogDescription>
            Der Workflow übernimmt automatisch alle Varianten, Maße und
            Gewichte.
          </DialogDescription>
        </DialogHeader>
        <Input
          className="mt-3 bg-white"
          placeholder="Artikel suchen"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              disabled={busy}
              onClick={() => void start(String(item.id))}
              className="flex w-full items-center gap-3 rounded-xl border bg-white/70 p-3 text-left"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--fp-mist)]">
                <Package className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {item.modelName}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {item.productType} · {item.variants.length} Varianten
                </span>
              </span>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4" />
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowStep({
  data,
  state,
  busy,
  setData,
  action,
  imageAction,
  onUpload,
  onBackgroundUpload,
  onExternalUpload,
}: {
  data: WorkflowData;
  state: EtsyState;
  busy: string;
  setData: React.Dispatch<React.SetStateAction<WorkflowData | null>>;
  action: (
    action: string,
    state?: EtsyState,
    result?: unknown,
    extra?: Record<string, unknown>,
  ) => Promise<void>;
  imageAction: (
    slotId: string,
    action: string,
    versionId?: string,
    instruction?: string,
  ) => Promise<void>;
  onUpload: () => void;
  onBackgroundUpload: () => void;
  onExternalUpload: (slotId: string) => void;
}) {
  const step = data.steps[state] || { status: 'NOT_STARTED', result: {} };
  const result = step.result;
  const updateResult = (next: Record<string, unknown>) =>
    setData((current) =>
      current
        ? {
            ...current,
            steps: {
              ...current.steps,
              [state]: { ...current.steps[state], result: next },
            },
          }
        : current,
    );
  const approved = step.status === 'APPROVED';
  const generating = busy.startsWith('generate-');
  const footer = (canApprove = true) => (
    <div className="mt-6 flex flex-wrap justify-end gap-2 border-t pt-4">
      {state !== 'IMAGE_UPLOAD' &&
      !['IMAGE_REVIEW', 'VARIANT_PRICING', 'FINAL_REVIEW'].includes(state) ? (
        <Button
          variant="outline"
          disabled={generating}
          onClick={() => void action('generate', state)}
        >
          <RefreshCw className={`size-4 ${generating ? 'animate-spin' : ''}`} />{' '}
          {Object.keys(result).length
            ? 'Rohentwurf neu'
            : 'Rohentwurf ohne Chat'}
        </Button>
      ) : null}
      <Button
        disabled={!canApprove || Boolean(busy)}
        onClick={() => void action('approve', state, result)}
      >
        <Check className="size-4" />{' '}
        {approved ? 'Erneut bestätigen' : 'Bestätigen'}
      </Button>
    </div>
  );

  if (state === 'IMAGE_UPLOAD')
    return (
      <ImageInputs
        data={data}
        busy={busy}
        action={action}
        onUpload={onUpload}
        onBackgroundUpload={onBackgroundUpload}
      />
    );

  if (state === 'IMAGE_REVIEW')
    return (
      <ImageReview
        data={data}
        busy={busy}
        action={action}
        imageAction={imageAction}
        onUpload={onUpload}
        onExternalUpload={onExternalUpload}
      />
    );

  if (state === 'KEYWORD_RESEARCH') {
    const tags = Array.isArray(result.tags) ? (result.tags as string[]) : [];
    const candidates = Array.isArray(result.candidates)
      ? (result.candidates as Array<{
          tag: string;
          score: number;
          reason: string;
          source: string;
          intent: string;
        }>)
      : [];
    return (
      <Shell
        title="Keywords erstellen"
        eyebrow="3 · Suchintention"
        status={step.status}
      >
        {step.status === 'STALE_KEYWORDS' ? (
          <div className="mb-5 rounded-xl border border-[#d8b88b] bg-[#fffaf2] p-4 text-sm">
            <strong>Neue Marktdaten verfügbar.</strong> Bestehende Tags bleiben
            erhalten, bis du neue Vorschläge übernimmst.
          </div>
        ) : null}
        {!Object.keys(result).length ? (
          <EmptyGenerate
            busy={generating}
            onClick={() => void action('generate', state)}
            label="Hauptkeyword und 13 Tags erstellen"
          />
        ) : (
          <>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Hauptkeyword</span>
              <Input
                value={String(result.primary_keyword || '')}
                onChange={(e) =>
                  updateResult({ ...result, primary_keyword: e.target.value })
                }
              />
            </label>
            <div className="mt-5 overflow-hidden rounded-xl border bg-white">
              <div className="grid grid-cols-[1fr_70px_1fr] gap-3 bg-[#edf1ed] px-4 py-2 text-xs font-semibold">
                <span>Tag</span>
                <span>Score</span>
                <span>Grund</span>
              </div>
              {candidates.map((candidate) => (
                <div
                  key={candidate.tag}
                  className="grid grid-cols-[1fr_70px_1fr] gap-3 border-t px-4 py-3 text-sm"
                >
                  <span>{candidate.tag}</span>
                  <span className="font-medium">{candidate.score}</span>
                  <span className="text-xs text-muted-foreground">
                    {candidate.reason} · {candidate.source}
                  </span>
                </div>
              ))}
            </div>
            <label className="mt-5 grid gap-2 text-sm">
              <span className="font-medium">Ausgewählte 13 Etsy-Tags</span>
              <Textarea
                className="min-h-28"
                value={tags.join(', ')}
                onChange={(e) =>
                  updateResult({
                    ...result,
                    tags: e.target.value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                      .slice(0, 13),
                  })
                }
              />
              <span
                className={
                  tags.length === 13
                    ? 'text-xs text-[var(--fp-primary)]'
                    : 'text-xs text-[#a35f43]'
                }
              >
                {tags.length} von 13 · Quelle:{' '}
                {String(result.source || 'Produktdaten')} · Confidence:{' '}
                {String(result.confidence || 'mittel')}
              </span>
            </label>
          </>
        )}
        {footer(tags.length === 13 && Boolean(result.primary_keyword))}
      </Shell>
    );
  }

  if (state === 'IMAGE_ORDER') {
    const ids = (
      Array.isArray(result.image_ids)
        ? result.image_ids
        : data.imageSlots
            .filter((slot) => slot.status === 'APPROVED')
            .map((slot) => slot.id)
    ) as string[];
    const move = (index: number, delta: number) => {
      const next = [...ids];
      const target = index + delta;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      updateResult({ image_ids: next });
    };
    return (
      <Shell
        title="Bildreihenfolge"
        eyebrow="4 · Kaufargumente"
        status={step.status}
      >
        {!Object.keys(result).length ? (
          <EmptyGenerate
            busy={generating}
            onClick={() => void action('generate', state)}
            label="Reihenfolge vorschlagen"
          />
        ) : (
          <div className="space-y-2">
            {ids.map((id, index) => {
              const slot = data.imageSlots.find((item) => item.id === id);
              if (!slot) return null;
              const version = slot.versions.find(
                (item) => item.id === slot.activeVersionId,
              );
              return (
                <div
                  key={id}
                  className="flex items-center gap-3 rounded-xl border bg-white p-3"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-[var(--fp-ink)] text-sm text-white">
                    {index + 1}
                  </span>
                  <div className="relative size-16 overflow-hidden rounded-lg bg-[var(--fp-mist)]">
                    {version?.url ? (
                      <Image
                        src={version.url}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {slot.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move(index, 1)}
                    disabled={index === ids.length - 1}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {footer(ids.length > 0)}
      </Shell>
    );
  }

  if (state === 'TITLE') {
    const candidates = Array.isArray(result.candidates)
      ? (result.candidates as Array<{ id: string; title: string }>)
      : [];
    return (
      <Shell
        title="Etsy-Titel"
        eyebrow="5 · Klick & Klarheit"
        status={step.status}
      >
        {!candidates.length ? (
          <EmptyGenerate
            busy={generating}
            onClick={() => void action('generate', state)}
            label="Drei Titelvarianten erstellen"
          />
        ) : (
          <div className="space-y-3">
            {candidates.map((candidate, index) => (
              <label
                key={candidate.id}
                className="flex gap-3 rounded-xl border bg-white p-4"
              >
                <input
                  type="radio"
                  checked={result.selected_title === candidate.title}
                  onChange={() =>
                    updateResult({ ...result, selected_title: candidate.title })
                  }
                />
                <span className="flex-1">
                  <Textarea
                    value={candidate.title}
                    className="min-h-20"
                    onChange={(e) => {
                      const next = candidates.map((item, i) =>
                        i === index ? { ...item, title: e.target.value } : item,
                      );
                      updateResult({
                        ...result,
                        candidates: next,
                        selected_title:
                          result.selected_title === candidate.title
                            ? e.target.value
                            : result.selected_title,
                      });
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {candidate.title.length}/140 Zeichen
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        {footer(Boolean(result.selected_title))}
      </Shell>
    );
  }

  if (state === 'CART_SUMMARY')
    return (
      <TextStep
        title="Warenkorb-Zusammenfassung"
        eyebrow="6 · Kurz & eindeutig"
        field="cart_summary"
        data={data}
        state={state}
        result={result}
        status={step.status}
        busy={busy}
        action={action}
        updateResult={updateResult}
      />
    );
  if (state === 'VARIANT_PRICING')
    return <PricingStep data={data} busy={busy} action={action} />;
  if (state === 'DESCRIPTION')
    return (
      <DescriptionStep
        result={result}
        status={step.status}
        busy={busy}
        action={action}
        updateResult={updateResult}
      />
    );
  if (state === 'ALT_TEXT')
    return (
      <AltTextStep
        data={data}
        result={result}
        status={step.status}
        busy={busy}
        action={action}
        updateResult={updateResult}
      />
    );
  if (state === 'HOLIDAY')
    return (
      <HolidayStep
        data={data}
        result={result}
        status={step.status}
        busy={busy}
        action={action}
        updateResult={updateResult}
      />
    );
  if (state === 'FINAL_REVIEW')
    return <FinalReview data={data} busy={busy} action={action} />;
  return (
    <Shell title={STEP_LABELS[state]} status={step.status}>
      <p className="text-sm text-muted-foreground">
        Dieser Schritt wird aus den bestätigten Ergebnissen aufgebaut.
      </p>
      {footer()}
    </Shell>
  );
}

function Shell({
  title,
  eyebrow,
  status,
  children,
}: {
  title: string;
  eyebrow?: string;
  status?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border bg-white/62 p-5 md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="text-xs font-bold tracking-[.12em] text-[var(--fp-primary)] uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-1 font-heading text-3xl">{title}</h2>
        </div>
        {status ? (
          <Badge variant="outline">{statusLabel[status] || status}</Badge>
        ) : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}
function EmptyGenerate({
  busy,
  onClick,
  label,
}: {
  busy: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed p-8 text-center">
      <Sparkles className="mx-auto size-7 text-[var(--fp-primary)]" />
      <p className="mt-3 text-sm text-muted-foreground">
        Nutze oben die Chat-Übergabe. Optional kann die Webseite einen einfachen
        Rohentwurf ohne KI erzeugen.
      </p>
      <Button
        className="mt-4"
        variant="outline"
        disabled={busy}
        onClick={onClick}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        Rohentwurf ohne Chat<span className="sr-only">: {label}</span>
      </Button>
    </div>
  );
}

function ImageInputs({
  data,
  busy,
  action,
  onUpload,
  onBackgroundUpload,
}: {
  data: WorkflowData;
  busy: string;
  action: (
    action: string,
    state?: EtsyState,
    result?: unknown,
    extra?: Record<string, unknown>,
  ) => Promise<void>;
  onUpload: () => void;
  onBackgroundUpload: () => void;
}) {
  const productRefs = data.images.filter(
      (image) => image.referenceKind === 'PRODUCT',
    ),
    background = data.images.find(
      (image) => image.referenceKind === 'BACKGROUND',
    );
  const [slots, setSlots] = useState(
    data.imageSlots.map((slot) => ({
      id: slot.id,
      title: slot.title,
      perspective: slot.perspective,
      instruction: slot.instruction,
      format: slot.format,
    })),
  );
  const change = (index: number, key: string, value: string) =>
    setSlots((current) =>
      current.map((slot, i) =>
        i === index ? { ...slot, [key]: value } : slot,
      ),
    );
  return (
    <Shell
      title="Referenzen & Bildplan"
      eyebrow="1 · Ausgangsmaterial"
      status={data.steps.IMAGE_UPLOAD?.status}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold">Produktreferenzen</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Mehrere echte Perspektiven definieren ausschließlich das Produkt.
          </p>
          <button
            onClick={onUpload}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-[var(--fp-primary)]/45 bg-[#eef1ec] p-4 text-left"
          >
            <Upload className="size-5" />
            <span>
              {busy === 'upload'
                ? 'Wird gespeichert …'
                : '+ Produktbilder hinzufügen'}
            </span>
          </button>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {productRefs.map((image) => (
              <a
                key={image.id}
                href={image.originalUrl}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-lg border bg-white"
              >
                <div className="relative aspect-square">
                  <Image
                    src={image.originalUrl}
                    alt={image.filename}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
                <div className="truncate p-2 text-xs">{image.filename}</div>
              </a>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-semibold">
            Hintergrundreferenz{' '}
            <span className="font-normal text-muted-foreground">
              · optional, genau eine
            </span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Definiert nur Szene, Licht, Farbwelt und fotografischen Stil.
          </p>
          <button
            onClick={onBackgroundUpload}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-[#c99f73] bg-[#fffaf2] p-4 text-left"
          >
            <ImageIcon className="size-5" />
            <span>
              {background
                ? 'Hintergrundreferenz ersetzen'
                : '+ Referenzbild hinzufügen'}
            </span>
          </button>
          {background ? (
            <a
              href={background.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block overflow-hidden rounded-lg border bg-white"
            >
              <div className="relative aspect-[16/9]">
                <Image
                  src={background.originalUrl}
                  alt={background.filename}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
              <div className="truncate p-2 text-xs">
                Nur Hintergrund: {background.filename}
              </div>
            </a>
          ) : null}
        </div>
      </div>
      <div className="mt-7">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold">Bildplan</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Automatisch aus den Produktdaten vorgeschlagen und vollständig
              editierbar.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() =>
              void action('update-plan', 'IMAGE_UPLOAD', undefined, { slots })
            }
          >
            <Save className="size-4" />
            Plan speichern
          </Button>
        </div>
        <div className="mt-3 space-y-3">
          {slots.map((slot, index) => (
            <div
              key={slot.id}
              className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[36px_1fr_1fr_90px]"
            >
              <span className="grid size-8 place-items-center rounded-full bg-[var(--fp-ink)] text-sm text-white">
                {index + 1}
              </span>
              <Input
                aria-label={`Titel Bild ${index + 1}`}
                value={slot.title}
                onChange={(event) => change(index, 'title', event.target.value)}
              />
              <Input
                aria-label={`Perspektive Bild ${index + 1}`}
                value={slot.perspective}
                onChange={(event) =>
                  change(index, 'perspective', event.target.value)
                }
              />
              <Input
                aria-label={`Format Bild ${index + 1}`}
                value={slot.format}
                onChange={(event) =>
                  change(index, 'format', event.target.value)
                }
              />
              <Textarea
                className="md:col-start-2 md:col-span-3 min-h-16"
                aria-label={`Anweisung Bild ${index + 1}`}
                value={slot.instruction}
                onChange={(event) =>
                  change(index, 'instruction', event.target.value)
                }
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 flex justify-end border-t pt-4">
        <Button
          disabled={!productRefs.length || Boolean(busy)}
          onClick={() => void action('approve', 'IMAGE_UPLOAD')}
        >
          <Check className="size-4" />
          Referenzen und Plan bestätigen
        </Button>
      </div>
    </Shell>
  );
}

function ImageReview({
  data,
  busy,
  action,
  imageAction,
  onUpload,
  onExternalUpload,
}: {
  data: WorkflowData;
  busy: string;
  action: (
    action: string,
    state?: EtsyState,
    result?: unknown,
  ) => Promise<void>;
  imageAction: (
    slotId: string,
    action: string,
    versionId?: string,
    instruction?: string,
  ) => Promise<void>;
  onUpload: () => void;
  onExternalUpload: (slotId: string) => void;
}) {
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const terminal =
    data.imageSlots.length > 0 &&
    data.imageSlots.every((slot) =>
      ['APPROVED', 'REJECTED'].includes(slot.status),
    );
  return (
    <Shell
      title="Etsy-Bilder einzeln erstellen"
      eyebrow="2 · Iterativer Bildprozess"
      status={data.steps.IMAGE_REVIEW?.status}
    >
      <div className="mb-5 rounded-xl border border-[var(--fp-primary)]/25 bg-[#edf1ed] p-4 text-sm">
        <strong>Ein Slot nach dem anderen:</strong> vollständige Chat-Aufgabe
        erzeugen, genau ein Ergebnis importieren, prüfen und freigeben. Produkt-
        und Hintergrundquelle bleiben strikt getrennt.
      </div>
      <div className="space-y-4">
        {data.imageSlots.map((slot) => {
          const active =
              slot.versions.find(
                (version) => version.id === slot.activeVersionId,
              ) || slot.versions.at(-1),
            loading = busy.endsWith(slot.id);
          return (
            <article key={slot.id} className="rounded-2xl border bg-white p-4">
              <div className="grid gap-4 md:grid-cols-[80px_1fr_220px]">
                <div className="grid size-14 place-items-center rounded-full bg-[var(--fp-ink)] text-xl text-white">
                  {slot.position}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{slot.title}</h3>
                    <Badge variant="outline">{slot.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {slot.perspective} · {slot.format}
                  </p>
                  <p className="mt-2 text-sm">{slot.instruction}</p>
                </div>
                <div className="relative grid aspect-[4/5] place-items-center overflow-hidden rounded-xl bg-[#eee9e1]">
                  {active?.url ? (
                    <Image
                      src={active.url}
                      alt={slot.title}
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  ) : (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      <ImageIcon className="mx-auto mb-2 size-6" />
                      Noch kein Ergebnis importiert
                    </div>
                  )}
                </div>
              </div>
              <Textarea
                className="mt-4 min-h-16"
                placeholder="Optionaler Wunsch nur für diese Aufnahme"
                value={instructions[slot.id] || ''}
                onChange={(event) =>
                  setInstructions((current) => ({
                    ...current,
                    [slot.id]: event.target.value,
                  }))
                }
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() =>
                    void imageAction(
                      slot.id,
                      'create-task',
                      '',
                      instructions[slot.id] || '',
                    )
                  }
                >
                  <Sparkles className="size-4" />
                  {slot.versions.length
                    ? 'Neu generieren'
                    : 'Chat-Aufgabe erzeugen'}
                </Button>
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => onExternalUpload(slot.id)}
                >
                  <Upload className="size-4" />
                  Ergebnis importieren
                </Button>
                {active?.url ? (
                  <Button
                    disabled={loading}
                    onClick={() =>
                      void imageAction(slot.id, 'approve', active.id)
                    }
                  >
                    <Check className="size-4" />
                    Freigeben
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  disabled={loading}
                  className="text-[#8b453a]"
                  onClick={() => void imageAction(slot.id, 'reject')}
                >
                  Verwerfen
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap justify-between gap-2 border-t pt-4">
        <Button variant="outline" onClick={onUpload}>
          <Upload className="size-4" />
          Produktreferenz ergänzen
        </Button>
        <Button
          disabled={!terminal || Boolean(busy)}
          onClick={() =>
            void action('approve', 'IMAGE_REVIEW', {
              image_ids: data.imageSlots
                .filter((slot) => slot.status === 'APPROVED')
                .map((slot) => slot.id),
            })
          }
        >
          <Check className="size-4" />
          Bildauswahl abschließen
        </Button>
      </div>
    </Shell>
  );
}

function TextStep({
  title,
  eyebrow,
  field,
  state,
  result,
  status,
  busy,
  action,
  updateResult,
}: {
  title: string;
  eyebrow: string;
  field: string;
  data: WorkflowData;
  state: EtsyState;
  result: Record<string, unknown>;
  status: string;
  busy: string;
  action: (
    action: string,
    state?: EtsyState,
    result?: unknown,
  ) => Promise<void>;
  updateResult: (next: Record<string, unknown>) => void;
}) {
  const generating = busy.startsWith('generate-');
  return (
    <Shell title={title} eyebrow={eyebrow} status={status}>
      {!Object.keys(result).length ? (
        <EmptyGenerate
          busy={generating}
          onClick={() => void action('generate', state)}
          label="Vorschlag erstellen"
        />
      ) : (
        <Textarea
          className="min-h-32"
          value={String(result[field] || '')}
          onChange={(event) =>
            updateResult({ ...result, [field]: event.target.value })
          }
        />
      )}
      <div className="mt-6 flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          disabled={generating}
          onClick={() => void action('generate', state)}
        >
          <RefreshCw className="size-4" />
          Rohentwurf neu
        </Button>
        <Button
          disabled={!result[field] || Boolean(busy)}
          onClick={() => void action('approve', state, result)}
        >
          <Check className="size-4" />
          Bestätigen
        </Button>
      </div>
    </Shell>
  );
}

function PricingStep({
  data,
  busy,
  action,
}: {
  data: WorkflowData;
  busy: string;
  action: (
    action: string,
    state?: EtsyState,
    result?: unknown,
    extra?: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [details, setDetails] = useState(false),
    [prices, setPrices] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        data.workflow.product.variants.map((variant) => [
          variant.id,
          String(
            (data.prices[variant.id] ??
              data.pricing[variant.id]?.recommendedPriceCents ??
              0) / 100,
          ).replace('.', ','),
        ]),
      ),
    );
  const euro = (value: number | null | undefined) =>
    typeof value === 'number'
      ? new Intl.NumberFormat('de-DE', {
          style: 'currency',
          currency: 'EUR',
        }).format(value / 100)
      : '–';
  const overrides = Object.fromEntries(
      Object.entries(prices).map(([id, value]) => [
        id,
        Math.round(Number(value.replace(',', '.')) * 100),
      ]),
    ),
    valid = data.workflow.product.variants.every(
      (variant) =>
        Number.isFinite(overrides[variant.id]) && overrides[variant.id] > 0,
    );
  const latestUpdate = data.marketUpdates[0];
  return (
    <Shell
      title="Varianten & Preise"
      eyebrow="7 · Zentrale Pricing Engine"
      status={data.steps.VARIANT_PRICING?.status}
    >
      {latestUpdate ? (
        <div className="mb-5 rounded-xl border border-[#d8b88b] bg-[#fffaf2] p-4">
          <div className="text-xs font-bold tracking-[.12em] text-[#8b5b32] uppercase">
            Marktupdate
          </div>
          <div className="mt-1 font-semibold">
            Neue Preisempfehlung verfügbar
          </div>
          <p className="mt-2 text-sm">
            Alt: {euro(latestUpdate.previousRecommendationCents)} · Neu:{' '}
            {euro(latestUpdate.newRecommendationCents)} · Grund: Marktmedian,
            Nachfrage oder neue Marktinformationen.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => void action('accept-prices', 'VARIANT_PRICING')}
            >
              Neue Empfehlung übernehmen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDetails(true)}
            >
              Details
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void action('ignore-market-update', 'VARIANT_PRICING')
              }
            >
              Ignorieren
            </Button>
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <div className="min-w-[1020px]">
          <div className="grid grid-cols-[1.2fr_repeat(7,1fr)] gap-3 bg-[#edf1ed] px-4 py-3 text-xs font-semibold">
            <span>Variante</span>
            <span>COGS</span>
            <span>Etsy-Floor</span>
            <span>Marktanker</span>
            <span>Empfehlung</span>
            <span>Aktuell</span>
            <span>15 % Rabatt</span>
            <span>Status</span>
          </div>
          {data.workflow.product.variants.map((variant) => {
            const price = data.pricing[variant.id],
              chosen = data.prices[variant.id];
            return (
              <div
                key={variant.id}
                className="grid grid-cols-[1.2fr_repeat(7,1fr)] items-center gap-3 border-t px-4 py-4 text-sm"
              >
                <div>
                  <div className="font-medium">{variant.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {displaySize(data.workflow.product, variant)}
                  </div>
                </div>
                <span>{euro(price?.cogsCents)}</span>
                <span>{euro(price?.floorPriceCents)}</span>
                <span>{euro(price?.marketAnchorCents)}</span>
                <div>
                  {editing ? (
                    <Input
                      className="h-9"
                      value={prices[variant.id] || ''}
                      onChange={(event) =>
                        setPrices((current) => ({
                          ...current,
                          [variant.id]: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <strong>{euro(price?.recommendedPriceCents)}</strong>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {price?.confidence}
                  </div>
                </div>
                <span>{euro(price?.activePriceCents)}</span>
                <Badge
                  className={
                    price?.discountState === 'GREEN'
                      ? 'bg-[#edf3ee] text-[#315b45]'
                      : price?.discountState === 'YELLOW'
                        ? 'bg-[#fff3d8] text-[#7a5b18]'
                        : 'bg-[#f8e2de] text-[#8b453a]'
                  }
                >
                  {price?.discountState || 'OFFEN'}
                </Badge>
                <Badge variant="outline">
                  {chosen ? 'Bestätigt' : 'Vorschlag'}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
      {details ? (
        <div className="mt-4 space-y-2 rounded-xl border bg-white p-4">
          {data.workflow.product.variants.map((variant) => (
            <div key={variant.id} className="text-sm">
              <strong>{variant.name}:</strong>{' '}
              {data.pricing[variant.id]?.reason}. Status{' '}
              {data.pricing[variant.id]?.status}.
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setDetails((value) => !value)}>
          Details anzeigen
        </Button>
        <Button variant="outline" onClick={() => setEditing((value) => !value)}>
          {editing ? 'Bearbeitung schließen' : 'Einzelne Preise bearbeiten'}
        </Button>
        <Button
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => void action('recalculate-prices', 'VARIANT_PRICING')}
        >
          <RefreshCw className="size-4" />
          Neu berechnen
        </Button>
        <Button
          disabled={
            !valid ||
            Boolean(busy) ||
            data.workflow.product.variants.some(
              (variant) => !data.pricing[variant.id]?.recommendedPriceCents,
            )
          }
          onClick={() =>
            void action('accept-prices', 'VARIANT_PRICING', undefined, {
              prices: editing ? overrides : {},
            })
          }
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Empfehlungen übernehmen
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Übernahme nur nach Bestätigung. Aktive Shoppreise werden niemals
        automatisch überschrieben.
      </p>
    </Shell>
  );
}

function DescriptionStep({
  result,
  status,
  busy,
  action,
  updateResult,
}: {
  result: Record<string, unknown>;
  status: string;
  busy: string;
  action: (
    action: string,
    state?: EtsyState,
    result?: unknown,
  ) => Promise<void>;
  updateResult: (next: Record<string, unknown>) => void;
}) {
  const generating = busy.startsWith('generate-');
  return (
    <Shell
      title="Produktbeschreibung"
      eyebrow="8 · Deutsch & Englisch"
      status={status}
    >
      {!Object.keys(result).length ? (
        <EmptyGenerate
          busy={generating}
          onClick={() => void action('generate', 'DESCRIPTION')}
          label="Beschreibungen erstellen"
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Deutsch</span>
            <Textarea
              className="min-h-[520px] leading-6"
              value={String(result.description_de || '')}
              onChange={(event) =>
                updateResult({ ...result, description_de: event.target.value })
              }
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium">English</span>
            <Textarea
              className="min-h-[520px] leading-6"
              value={String(result.description_en || '')}
              onChange={(event) =>
                updateResult({ ...result, description_en: event.target.value })
              }
            />
          </label>
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          onClick={() => void action('generate', 'DESCRIPTION')}
          disabled={generating}
        >
          <RefreshCw className="size-4" />
          Rohentwurf neu
        </Button>
        <Button
          disabled={
            !result.description_de || !result.description_en || Boolean(busy)
          }
          onClick={() => void action('approve', 'DESCRIPTION', result)}
        >
          <Check className="size-4" />
          Beide Versionen bestätigen
        </Button>
      </div>
    </Shell>
  );
}

function AltTextStep({
  data,
  result,
  status,
  busy,
  action,
  updateResult,
}: {
  data: WorkflowData;
  result: Record<string, unknown>;
  status: string;
  busy: string;
  action: (
    action: string,
    state?: EtsyState,
    result?: unknown,
  ) => Promise<void>;
  updateResult: (next: Record<string, unknown>) => void;
}) {
  const items = Array.isArray(result.items)
    ? (result.items as Array<{
        image_id: string;
        alt_text_de: string;
        alt_text_en: string;
      }>)
    : [];
  const generating = busy.startsWith('generate-');
  return (
    <Shell
      title="Alt-Texte"
      eyebrow="9 · Barrierefreie Bildbeschreibung"
      status={status}
    >
      {!items.length ? (
        <EmptyGenerate
          busy={generating}
          onClick={() => void action('generate', 'ALT_TEXT')}
          label="Alt-Texte erstellen"
        />
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => {
            const slot = data.imageSlots.find(
                (entry) => entry.id === item.image_id,
              ),
              version = slot?.versions.find(
                (v) => v.id === slot.activeVersionId,
              );
            return (
              <div
                key={item.image_id}
                className="grid gap-4 rounded-xl border bg-white p-4 md:grid-cols-[120px_1fr]"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-[var(--fp-mist)]">
                  {version?.url ? (
                    <Image
                      src={version.url}
                      alt=""
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="space-y-3">
                  <Textarea
                    value={item.alt_text_de}
                    aria-label="Alt-Text Deutsch"
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = {
                        ...item,
                        alt_text_de: event.target.value,
                      };
                      updateResult({ items: next });
                    }}
                  />
                  <Textarea
                    value={item.alt_text_en}
                    aria-label="Alt text English"
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = {
                        ...item,
                        alt_text_en: event.target.value,
                      };
                      updateResult({ items: next });
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          onClick={() => void action('generate', 'ALT_TEXT')}
        >
          <RefreshCw className="size-4" />
          Rohentwurf neu
        </Button>
        <Button
          disabled={
            !items.length ||
            items.some((item) => !item.alt_text_de || !item.alt_text_en) ||
            Boolean(busy)
          }
          onClick={() => void action('approve', 'ALT_TEXT', result)}
        >
          <Check className="size-4" />
          Bestätigen
        </Button>
      </div>
    </Shell>
  );
}

function HolidayStep({
  data,
  result,
  status,
  busy,
  action,
  updateResult,
}: {
  data: WorkflowData;
  result: Record<string, unknown>;
  status: string;
  busy: string;
  action: (
    action: string,
    state?: EtsyState,
    result?: unknown,
  ) => Promise<void>;
  updateResult: (next: Record<string, unknown>) => void;
}) {
  const generating = busy.startsWith('generate-');
  return (
    <Shell
      title="Feiertagsattribut"
      eyebrow="10 · Korrekte Einordnung"
      status={status}
    >
      {!Object.keys(result).length ? (
        <EmptyGenerate
          busy={generating}
          onClick={() => void action('generate', 'HOLIDAY')}
          label="Einordnung prüfen"
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <Badge variant="outline">
              {String(result.classification || '')}
            </Badge>
            <p className="mt-3 text-sm leading-6">
              {String(result.reason || '')}
            </p>
          </div>
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Feiertag</span>
            <select
              className="h-10 rounded-lg border bg-white px-3"
              value={String(result.recommended_holiday || '')}
              onChange={(event) =>
                updateResult({
                  ...result,
                  recommended_holiday: event.target.value || null,
                  classification: event.target.value
                    ? 'HOLIDAY_RELEVANT'
                    : 'NO_HOLIDAY_RELATION',
                })
              }
            >
              <option value="">Kein Feiertag</option>
              {data.holidays.map((holiday) => (
                <option key={holiday}>{holiday}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          onClick={() => void action('generate', 'HOLIDAY')}
        >
          <RefreshCw className="size-4" />
          Rohentwurf neu
        </Button>
        <Button
          disabled={!Object.keys(result).length || Boolean(busy)}
          onClick={() => void action('approve', 'HOLIDAY', result)}
        >
          <Check className="size-4" />
          Entscheidung übernehmen
        </Button>
      </div>
    </Shell>
  );
}

function FinalReview({
  data,
  busy,
  action,
}: {
  data: WorkflowData;
  busy: string;
  action: (
    action: string,
    state?: EtsyState,
    result?: unknown,
  ) => Promise<void>;
}) {
  const review = data.steps.FINAL_REVIEW?.result as {
    status?: string;
    issues?: Array<{ type: string; state: EtsyState; message: string }>;
  };
  const ready = review.status === 'READY_FOR_ETSY';
  return (
    <Shell
      title="Final Check"
      eyebrow="11 · Konsistenzprüfung"
      status={data.steps.FINAL_REVIEW?.status}
    >
      {!review.status ? (
        <EmptyGenerate
          busy={busy.startsWith('generate-')}
          onClick={() => void action('generate', 'FINAL_REVIEW')}
          label="Listing vollständig prüfen"
        />
      ) : (
        <>
          <div
            className={`flex items-center gap-3 rounded-xl border p-4 ${ready ? 'bg-[#edf3ee] text-[#31443f]' : 'bg-[#fffaf2]'}`}
          >
            {ready ? (
              <CheckCircle2 className="size-6" />
            ) : (
              <AlertTriangle className="size-6" />
            )}
            <div>
              <div className="font-semibold">
                {ready ? 'READY_FOR_ETSY' : 'NEEDS_FIX'}
              </div>
              <div className="text-xs">
                {ready
                  ? 'Alle Pflichtbereiche sind konsistent bestätigt.'
                  : `${review.issues?.length || 0} Punkte müssen geprüft werden.`}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {review.issues?.map((issue) => (
              <button
                key={`${issue.type}-${issue.message}`}
                className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left"
                onClick={() =>
                  document
                    .querySelector<HTMLButtonElement>(
                      `button[data-step='${issue.state}']`,
                    )
                    ?.click()
                }
              >
                <AlertTriangle className="size-4 text-[#a35f43]" />
                <span className="flex-1 text-sm">{issue.message}</span>
                <Badge variant="outline">{STEP_LABELS[issue.state]}</Badge>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mt-6 flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          onClick={() => void action('generate', 'FINAL_REVIEW')}
        >
          <RefreshCw className="size-4" />
          Erneut prüfen
        </Button>
        <Button
          disabled={
            !ready || Boolean(busy) || data.workflow.status === 'READY_FOR_ETSY'
          }
          onClick={() => void action('complete')}
        >
          <CheckCircle2 className="size-4" />
          {data.workflow.status === 'READY_FOR_ETSY'
            ? 'Abgeschlossen'
            : 'Listing abschließen'}
        </Button>
      </div>
    </Shell>
  );
}
