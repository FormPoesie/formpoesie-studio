'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  CalendarDays,
  Calculator,
  Camera,
  Check,
  CheckCircle2,
  CircleHelp,
  CircleDollarSign,
  CreditCard,
  Download,
  ExternalLink,
  FilePenLine,
  Image as ImageIcon,
  Import,
  Leaf,
  Link2,
  Loader2,
  Lock,
  MoreHorizontal,
  Music2,
  Network,
  Package,
  Palette,
  Plus,
  Pin,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  WalletCards,
  Warehouse,
  MapPin,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { InventoryItem } from '@/lib/inventory-bridge';
import { validateListingContent } from '@/lib/listing-engine';
import {
  InventoryWorkspace,
  type InventoryArea,
} from '@/components/inventory-workspace';
import { MindMapWorkspace } from '@/components/mind-map-workspace';
import { EtsyWorkflow } from '@/components/etsy-workflow';

type ProductRow = {
  id: string;
  model_name: string;
  product_type: string;
  buyer_world: string;
  material: string | null;
  status: string;
  updated_at: string;
  asset_count: number;
  variant_count: number;
  image_path: string | null;
  asset_id: string | null;
};
type Created = {
  id: string;
  facts: {
    material: string;
    widthMm: number | null;
    heightMm: number | null;
    depthMm: number | null;
    designOrigin: string;
  };
  content: Array<{
    locale: string;
    titles: string[];
    selectedTitle: number;
    description: string;
    tags: string[];
  }>;
  plan: Array<{
    role: string;
    gain: string;
    status: string;
    title: string;
    filename: string;
    altText: string;
    order: number;
  }>;
  pricing: {
    directPrice: number;
    etsyPrice: number;
    floorPrice: number;
    resultWithoutAds: number;
    resultWithAds: number;
    confidence: string;
    breakdown: Record<string, number>;
    assumptions: string[];
  };
  issues: Array<{ level: string; area: string; text: string }>;
};

type CalendarEntry = {
  id: string;
  thema: string;
  kategorie: string;
  organisation?: string;
  ort?: string;
  ereignisDatum: string;
  veroeffentlichungsDatum?: string;
  erfasstAm?: string;
  quelleUrl?: string;
  quelleName?: string;
  zusaetzlicheQuellen?: Array<{ name?: string; url?: string }>;
  status?: string;
  vertrauensniveau?: string;
  zusammenfassung?: string;
  wasIstNeu?: string;
  relevanz?: string;
  endnutzerRelevanz?: string;
  flag?: string;
  bild?: { url?: string; alt?: string; credit?: string; quelleUrl?: string };
};

type CalendarArchive = {
  meta?: {
    aktualisiertAm?: string;
    hinweis?: string;
    masterbrainSync?: {
      status?: string;
      schedule?: string;
      lastSyncedAt?: string;
      lastResult?: string;
      importedCount?: number;
      todayCount?: number;
    };
  };
  eintraege: CalendarEntry[];
};

type AccountItem = {
  id: string;
  group: 'subscription' | 'social' | 'license-monitor';
  name: string;
  url?: string;
  username?: string;
  email?: string;
  expiresAt?: string;
  ongoing?: boolean;
  status?: 'active' | 'cancelled';
  profileUrl?: string;
  note?: string;
  licensed?: boolean;
  licenseExpiresAt?: string;
  monthlyPrice?: string;
  monitoringEnabled?: boolean;
  lastCheckedAt?: string;
  lastStatus?: string;
  lastHeadline?: string;
  lastError?: string;
};

type EncryptedSecret = {
  accountId: string;
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
};

const initialForm = {
  inventorySourceId: '',
  modelName: '',
  productType: '',
  buyerWorld: 'Kunst & Skulptur',
  sku: '',
  material: '',
  widthMm: '',
  heightMm: '',
  depthMm: '',
  designOrigin: '',
  kind: 'sculpture',
  variantName: 'Standard',
  color: '',
  setSize: '1',
  weightGrams: '',
  printHours: '',
  activeMinutes: '',
  failureRate: '8',
  recordedProductionCost: '',
  materialPerKg: '',
  machinePerHour: '',
  electricityPerHour: '',
  electricityIncluded: true,
  laborPerHour: '',
  packaging: '',
  overhead: '',
  postage: '',
  buyerShipping: '0',
  targetMargin: '30',
};

const navPrimary = [
  ['Übersicht', Boxes],
  ['Produkte', Leaf],
  ['Preise & Portfolio', Calculator],
  ['Kasse', CircleDollarSign],
  ['Etsy Workflow', Sparkles],
] as const;

const navGroups = [
  {
    label: 'Verkaufsorte',
    items: [
      ['Märkte', MapPin],
      ['Regalflächen', Warehouse],
    ],
  },
  {
    label: 'Social Media',
    items: [
      ['News-Kalender', CalendarDays],
      ['Mindmap', Network],
    ],
  },
  {
    label: 'Katalog & Bestellungen',
    items: [
      ['Kataloge', BookOpen],
      ['Bestellformular', ShoppingCart],
    ],
  },
  {
    label: 'Verwaltung',
    restricted: true,
    items: [
      ['Verkaufshistorie', FilePenLine],
      ['Monatsübersicht', CalendarDays],
      ['Einkäufe & Ausgaben', WalletCards],
      ['Konten & Abos', CreditCard],
    ],
  },
] as const;

const defaultPalette = [
  '#1a1a18',
  '#f5f0e8',
  '#e8e0d4',
  '#c8b89a',
  '#4a5c58',
  '#b5895a',
];

function parseNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function money(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
      }).format(value)
    : 'offen';
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        'size-2.5 rounded-full ' +
        (ok ? 'bg-[var(--fp-primary)]' : 'bg-[var(--fp-accent)]')
      }
    />
  );
}

export default function Home() {
  const [_products, setProducts] = useState<ProductRow[]>([]);
  const [trashedProducts, setTrashedProducts] = useState<ProductRow[]>([]);
  const [activeProduct, setActiveProduct] = useState<Created | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarEntryId, setCalendarEntryId] = useState('');
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryArea, setInventoryArea] = useState<InventoryArea>('overview');
  const [inventoryProductId, setInventoryProductId] = useState('');
  const [draftModule, setDraftModule] = useState<'workflow' | null>(null);
  const [etsyStartProductId, setEtsyStartProductId] = useState('');
  const [mindMapOpen, setMindMapOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [catalogsOpen, setCatalogsOpen] = useState(false);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeName, setActiveName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createSource, setCreateSource] = useState<'inventory' | 'new'>(
    'inventory',
  );
  const [inventoryConnected, setInventoryConnected] = useState(false);
  const [inventoryCanManage, setInventoryCanManage] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [inventoryEmail, setInventoryEmail] = useState('');
  const [inventoryUserName, setInventoryUserName] = useState('');
  const [inventoryPassword, setInventoryPassword] = useState('');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [selectedInventory, setSelectedInventory] =
    useState<InventoryItem | null>(null);
  const [brandVoice, setBrandVoice] = useState(
    'Ruhig, geerdet, minimalistisch, hochwertig und künstlerisch. Kurze, verständliche Sätze. Einladen statt drängen.',
  );
  const [brandRules, setBrandRules] = useState(
    'Keine Verkaufsschreie, falsche Dringlichkeit oder Superlative.\nMaterial, Designherkunft und Eigenschaften nur auf bestätigter Grundlage.\nProdukt und Käuferabsicht stehen vor dem Herstellungsverfahren.\nFür Räume, die nach dir aussehen.',
  );
  const [brandPalette, setBrandPalette] = useState(defaultPalette);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'autopilot' | 'pro'>('autopilot');
  const [activeStep, setActiveStep] = useState('fakten');
  const [keywords, setKeywords] = useState('');
  const [researchSaved, setResearchSaved] = useState(false);
  const [uploaded, setUploaded] = useState<
    Array<{ id: string; filename: string; url: string }>
  >([]);
  const [locks, setLocks] = useState<Record<string, boolean>>({});
  const uploadRef = useRef<HTMLInputElement>(null);

  async function loadProducts() {
    const response = await fetch('/api/products');
    if (response.ok) setProducts(await response.json());
  }

  async function loadTrash() {
    const response = await fetch('/api/products?view=trash');
    if (response.ok) setTrashedProducts(await response.json());
  }

  function closeModules() {
    setCalendarOpen(false);
    setInventoryOpen(false);
    setMindMapOpen(false);
    setAccountsOpen(false);
    setCatalogsOpen(false);
    setOrderFormOpen(false);
    setTrashOpen(false);
    setDraftModule(null);
  }

  function openCalendar(entryId = '') {
    setActiveProduct(null);
    closeModules();
    setCalendarEntryId(entryId);
    setCalendarOpen(true);
  }

  function openInventory(area: InventoryArea = 'overview', productId = '') {
    if (
      ['pricing', 'sales', 'months', 'expenses', 'trash'].includes(area) &&
      !inventoryCanManage
    )
      return;
    setActiveProduct(null);
    closeModules();
    setInventoryArea(area);
    setInventoryProductId(productId);
    setInventoryOpen(true);
    void loadInventory();
  }

  function openNavigation(label: string) {
    if (label === 'Übersicht') {
      setActiveProduct(null);
      closeModules();
    } else if (label === 'Produkte') openInventory('products');
    else if (label === 'Preise & Portfolio') openInventory('pricing');
    else if (label === 'Kasse') openInventory('cash');
    else if (label === 'Märkte') openInventory('markets');
    else if (label === 'Regalflächen') openInventory('shelves');
    else if (label === 'Verkaufshistorie') openInventory('sales');
    else if (label === 'Monatsübersicht') openInventory('months');
    else if (label === 'Einkäufe & Ausgaben') openInventory('expenses');
    else if (label === 'Etsy Workflow') {
      setActiveProduct(null);
      closeModules();
      setEtsyStartProductId('');
      setDraftModule('workflow');
    } else if (label === 'News-Kalender') {
      openCalendar();
    } else if (label === 'Mindmap') {
      setActiveProduct(null);
      closeModules();
      setMindMapOpen(true);
    } else if (label === 'Konten & Abos') {
      setActiveProduct(null);
      closeModules();
      setAccountsOpen(true);
    } else if (label === 'Kataloge') {
      setActiveProduct(null);
      closeModules();
      setCatalogsOpen(true);
    } else if (label === 'Bestellformular') {
      setActiveProduct(null);
      closeModules();
      setOrderFormOpen(true);
    }
  }

  function openMobileNavigation(label: string) {
    setMobileNavOpen(false);
    openNavigation(label);
  }

  function navigationActive(label: string) {
    if (label === 'Übersicht')
      return (
        !activeProduct &&
        !calendarOpen &&
        !inventoryOpen &&
        !mindMapOpen &&
        !accountsOpen &&
        !catalogsOpen &&
        !orderFormOpen &&
        !draftModule &&
        !trashOpen
      );
    const inventoryTarget: Record<string, InventoryArea> = {
      Produkte: 'products',
      'Preise & Portfolio': 'pricing',
      Kasse: 'cash',
      Märkte: 'markets',
      Regalflächen: 'shelves',
      Verkaufshistorie: 'sales',
      Monatsübersicht: 'months',
      'Einkäufe & Ausgaben': 'expenses',
    };
    if (inventoryTarget[label])
      return inventoryOpen && inventoryArea === inventoryTarget[label];
    if (label === 'Etsy Workflow') return draftModule === 'workflow';
    if (label === 'News-Kalender') return calendarOpen;
    if (label === 'Mindmap') return mindMapOpen;
    if (label === 'Konten & Abos') return accountsOpen;
    if (label === 'Kataloge') return catalogsOpen;
    if (label === 'Bestellformular') return orderFormOpen;
    return false;
  }

  function openTrash() {
    setActiveProduct(null);
    closeModules();
    setTrashOpen(true);
    void loadTrash();
  }

  async function loadInventory() {
    setInventoryLoading(true);
    try {
      const sessionResponse = await fetch('/api/inventory/session');
      const session = (await sessionResponse.json()) as {
        connected?: boolean;
        email?: string;
        name?: string;
        canManage?: boolean;
      };
      setInventoryConnected(Boolean(session.connected));
      setInventoryCanManage(Boolean(session.canManage));
      if (session.email) setInventoryEmail(session.email);
      if (session.name) setInventoryUserName(session.name);
      if (!session.connected) return false;
      const response = await fetch('/api/inventory');
      const data = (await response.json()) as {
        connected?: boolean;
        items?: InventoryItem[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'Inventar nicht lesbar.');
      setInventoryItems(data.items || []);
      return true;
    } catch (error) {
      setInventoryConnected(false);
      setNotice(
        error instanceof Error
          ? error.message
          : 'Inventar konnte nicht geladen werden.',
      );
      return false;
    } finally {
      setInventoryLoading(false);
      setSessionChecked(true);
    }
  }

  function _beginCreate(source: 'inventory' | 'new' = 'inventory') {
    closeModules();
    setKeywords('');
    setResearchSaved(false);
    setUploaded([]);
    setLocks({});
    setCreateSource(source);
    setSelectedInventory(null);
    setForm(initialForm);
    setCreateOpen(true);
    if (source === 'inventory') void loadInventory();
  }

  async function connectInventory() {
    setInventoryLoading(true);
    setNotice('');
    try {
      const response = await fetch('/api/inventory/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inventoryEmail,
          password: inventoryPassword,
        }),
      });
      const data = (await response.json()) as {
        connected?: boolean;
        name?: string;
        canManage?: boolean;
        error?: string;
      };
      if (!response.ok || !data.connected)
        throw new Error(data.error || 'Inventar-Anmeldung fehlgeschlagen.');
      setInventoryPassword('');
      setInventoryConnected(true);
      setInventoryCanManage(Boolean(data.canManage));
      if (data.name) setInventoryUserName(data.name);
      const inventoryResponse = await fetch('/api/inventory');
      const inventory = (await inventoryResponse.json()) as {
        items?: InventoryItem[];
        error?: string;
      };
      if (!inventoryResponse.ok)
        throw new Error(inventory.error || 'Inventar nicht lesbar.');
      setInventoryItems(inventory.items || []);
      await loadProducts();
      setNotice(
        'Inventar verbunden. Artikel und Produktionsdaten sind verfügbar.',
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Verbindung fehlgeschlagen.',
      );
    } finally {
      setInventoryLoading(false);
    }
  }

  function useInventoryItem(item: InventoryItem) {
    const primaryVariant = item.variants[0];
    setSelectedInventory(item);
    setForm((current) => ({
      ...current,
      inventorySourceId: String(item.id),
      modelName: item.modelName,
      productType: item.productType,
      buyerWorld: item.buyerWorld,
      sku: item.sku,
      material: item.material,
      designOrigin: item.designOrigin,
      kind: item.buyerWorld === 'Functional Art' ? 'functional' : 'sculpture',
      variantName: primaryVariant?.name || item.size || 'Standard',
      color: primaryVariant?.color || '',
      setSize: String(primaryVariant?.setSize || 1),
      widthMm: item.widthMm == null ? '' : String(item.widthMm),
      heightMm: item.heightMm == null ? '' : String(item.heightMm),
      depthMm: item.depthMm == null ? '' : String(item.depthMm),
      weightGrams:
        item.weightGrams == null ? '' : String(Math.round(item.weightGrams)),
      printHours:
        item.printHours == null
          ? ''
          : String(Math.round(item.printHours * 100) / 100),
      recordedProductionCost:
        item.productionCost == null ? '' : String(item.productionCost),
    }));
  }

  async function openSettings() {
    const response = await fetch('/api/setup');
    if (response.ok) {
      const data = (await response.json()) as {
        brand?: { voice?: string; rules?: string[]; palette?: string[] };
      };
      if (data.brand?.voice) setBrandVoice(data.brand.voice);
      if (data.brand?.rules) setBrandRules(data.brand.rules.join('\n'));
      if (data.brand?.palette?.length === 6)
        setBrandPalette(data.brand.palette);
    }
    setSettingsOpen(true);
  }

  async function saveSettings(reset = false) {
    const response = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voice: brandVoice,
        rules: brandRules.split(/\r?\n/).filter(Boolean),
        palette: brandPalette,
        reset,
      }),
    });
    if (response.ok) {
      const data = (await response.json()) as {
        voice: string;
        rules: string[];
        palette: string[];
      };
      setBrandVoice(data.voice);
      setBrandRules(data.rules.join('\n'));
      setBrandPalette(data.palette);
      setNotice(
        reset ? 'Markenregeln zurückgesetzt.' : 'Markenregeln gespeichert.',
      );
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadInventory().then((connected) => {
        if (!connected) return;
        void loadProducts().catch(() =>
          setNotice('Die Produktdatenbank wird vorbereitet.'),
        );
        void fetch('/api/setup')
          .then((response) => response.json())
          .then((data) => {
            const setup = data as { brand?: { palette?: string[] } };
            if (setup.brand?.palette?.length === 6)
              setBrandPalette(setup.brand.palette);
          })
          .catch(() => undefined);
      });
    });
  }, []);

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
    const execute = async (input: unknown) => {
      const value = input as { modelName?: string; productType?: string };
      if (!value.modelName?.trim() || !value.productType?.trim())
        throw new Error('modelName und productType sind erforderlich');
      setForm((current) => ({
        ...current,
        modelName: value.modelName || '',
        productType: value.productType || '',
      }));
      setCreateSource('new');
      setCreateOpen(true);
      return { status: 'prepared', next: 'confirm_facts' };
    };
    void Promise.resolve(
      context.registerTool(
        {
          name: 'start_listing_creation',
          title: 'Listing-Erstellung starten',
          description:
            'Öffnet die Produkterfassung mit Modellname und Produktart. Speichert noch nichts.',
          inputSchema: {
            type: 'object',
            properties: {
              modelName: { type: 'string' },
              productType: { type: 'string' },
            },
            required: ['modelName', 'productType'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute,
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const setField = (key: string, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function createProduct(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    const body = {
      inventorySourceId: form.inventorySourceId || undefined,
      sourceImagePath: selectedInventory?.imagePath || undefined,
      modelName: form.modelName,
      productType: form.productType,
      buyerWorld: form.buyerWorld,
      sku: form.sku || undefined,
      material: form.material || undefined,
      widthMm: parseNumber(form.widthMm),
      heightMm: parseNumber(form.heightMm),
      depthMm: parseNumber(form.depthMm),
      designOrigin: form.designOrigin || undefined,
      kind: form.kind,
      variant: {
        name: form.variantName,
        color: form.color || undefined,
        setSize: parseNumber(form.setSize) || 1,
        weightGrams: parseNumber(form.weightGrams),
        printHours: parseNumber(form.printHours),
        activeMinutes: parseNumber(form.activeMinutes),
        failureRate: (parseNumber(form.failureRate) || 0) / 100,
      },
      variants:
        selectedInventory && form.inventorySourceId
          ? selectedInventory.variants.map((variant) => ({
              inventoryVariantId: String(variant.id),
              name: variant.name,
              sku: variant.sku || undefined,
              color: variant.color || undefined,
              material: variant.material || form.material || undefined,
              size: variant.size || undefined,
              setSize: variant.setSize || 1,
              weightGrams: variant.weightGrams,
              printHours: variant.printHours,
              activeMinutes: null,
              failureRate: (parseNumber(form.failureRate) || 0) / 100,
              recordedProductionCost: variant.productionCost,
              currentPrice: variant.currentPrice,
            }))
          : undefined,
      costs: {
        recordedProductionCost: parseNumber(form.recordedProductionCost),
        materialPerKg: parseNumber(form.materialPerKg),
        machinePerHour: parseNumber(form.machinePerHour),
        electricityPerHour: parseNumber(form.electricityPerHour),
        electricityIncluded: form.electricityIncluded,
        laborPerHour: parseNumber(form.laborPerHour),
        packaging: parseNumber(form.packaging),
        overhead: parseNumber(form.overhead),
        postage: parseNumber(form.postage),
        buyerShipping: parseNumber(form.buyerShipping),
        targetMargin: (parseNumber(form.targetMargin) || 30) / 100,
      },
      research: [],
    };
    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as Created & { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'Speichern fehlgeschlagen.');
      setActiveProduct(result);
      setActiveName(form.modelName);
      setCreateOpen(false);
      setActiveStep('fakten');
      setNotice('Produkt und Entwurf wurden dauerhaft gespeichert.');
      await loadProducts();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Speichern fehlgeschlagen.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function _openProduct(row: ProductRow, targetStep = 'fakten') {
    closeModules();
    const response = await fetch(
      '/api/products?id=' + encodeURIComponent(row.id),
    );
    if (!response.ok) return;
    const data = (await response.json()) as Record<string, unknown>;
    const contents: Created['content'] = (
      Array.isArray(data.contents) ? data.contents : []
    ).map((item: Record<string, unknown>) => ({
      locale: String(item.locale),
      titles: JSON.parse(String(item.titles_json)) as string[],
      selectedTitle: Number(item.selected_title),
      description: String(item.description),
      tags: JSON.parse(String(item.tags_json)) as string[],
    }));
    const restoredLocks: Record<string, boolean> = {};
    for (const item of Array.isArray(data.contents) ? data.contents : []) {
      const row = item as Record<string, unknown>;
      const locale = typeof row.locale === 'string' ? row.locale : '';
      const locked = JSON.parse(
        typeof row.locked_json === 'string' ? row.locked_json : '[]',
      ) as string[];
      for (const key of locked) restoredLocks[`${locale}-${key}`] = true;
    }
    const pricingRow = (
      data.pricing && typeof data.pricing === 'object' ? data.pricing : {}
    ) as Record<string, unknown>;
    const productRow = (
      data.product && typeof data.product === 'object' ? data.product : {}
    ) as Record<string, unknown>;
    setActiveProduct({
      id: row.id,
      facts: {
        material:
          typeof productRow.material === 'string' ? productRow.material : '',
        widthMm:
          typeof productRow.width_mm === 'number' ? productRow.width_mm : null,
        heightMm:
          typeof productRow.height_mm === 'number'
            ? productRow.height_mm
            : null,
        depthMm:
          typeof productRow.depth_mm === 'number' ? productRow.depth_mm : null,
        designOrigin:
          typeof productRow.design_origin === 'string'
            ? productRow.design_origin
            : '',
      },
      content: contents,
      plan:
        data.plan && typeof data.plan === 'object' && 'roles_json' in data.plan
          ? JSON.parse(String(data.plan.roles_json))
          : [],
      pricing: {
        directPrice: Number(pricingRow.direct_price),
        etsyPrice: Number(pricingRow.etsy_price),
        floorPrice: Number(pricingRow.floor_price),
        resultWithoutAds: Number(pricingRow.result_without_ads),
        resultWithAds: Number(pricingRow.result_with_ads),
        confidence:
          typeof pricingRow.confidence === 'string'
            ? pricingRow.confidence
            : 'niedrig',
        breakdown:
          typeof pricingRow.breakdown_json === 'string'
            ? (JSON.parse(pricingRow.breakdown_json) as Record<string, number>)
            : {},
        assumptions:
          typeof pricingRow.assumptions_json === 'string'
            ? (JSON.parse(pricingRow.assumptions_json) as string[])
            : [],
      },
      issues: Array.isArray(data.issues)
        ? (data.issues as Created['issues'])
        : [],
    });
    setActiveName(row.model_name);
    setUploaded(
      (Array.isArray(data.assets) ? data.assets : []).map(
        (asset: Record<string, unknown>) => ({
          id: String(asset.id),
          filename: String(asset.filename),
          url: '/api/assets?id=' + String(asset.id),
        }),
      ),
    );
    const researchRows = Array.isArray(data.research) ? data.research : [];
    setKeywords(
      researchRows
        .map((item) => {
          const phrase = (item as Record<string, unknown>).phrase;
          return typeof phrase === 'string' ? phrase : '';
        })
        .filter(Boolean)
        .join('\n'),
    );
    setResearchSaved(researchRows.length > 0);
    setLocks(restoredLocks);
    setActiveStep(targetStep);
  }

  async function _moveToTrash(row: ProductRow) {
    const response = await fetch(
      '/api/products?id=' + encodeURIComponent(row.id),
      { method: 'DELETE' },
    );
    if (!response.ok) {
      setNotice(
        'Der Entwurf konnte nicht in den Papierkorb verschoben werden.',
      );
      return;
    }
    if (activeProduct?.id === row.id) setActiveProduct(null);
    setNotice('„' + row.model_name + '“ liegt jetzt im Papierkorb.');
    await Promise.all([loadProducts(), loadTrash()]);
  }

  async function restoreProduct(row: ProductRow) {
    const response = await fetch('/api/products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, action: 'restore' }),
    });
    if (!response.ok) {
      setNotice('Der Entwurf konnte nicht wiederhergestellt werden.');
      return;
    }
    setNotice('„' + row.model_name + '“ wurde wiederhergestellt.');
    await Promise.all([loadProducts(), loadTrash()]);
  }

  function createFromInventory(item: InventoryItem) {
    setActiveProduct(null);
    closeModules();
    setEtsyStartProductId(String(item.id));
    setDraftModule('workflow');
  }

  async function saveFacts(facts: Created['facts']) {
    if (!activeProduct) return;
    const response = await fetch('/api/products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeProduct.id, facts }),
    });
    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      setNotice('Die Produktangaben konnten nicht gespeichert werden.');
      return;
    }
    setActiveProduct((current) =>
      current
        ? {
            ...current,
            facts,
            issues: Array.isArray(data.issues)
              ? (data.issues as Created['issues'])
              : current.issues,
          }
        : current,
    );
    setNotice('Produktfakten gespeichert.');
    await loadProducts();
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files || !activeProduct) return;
    try {
      for (const file of Array.from(files).slice(0, 5)) {
        const payload = new FormData();
        payload.append('file', file);
        payload.append('productId', activeProduct.id);
        payload.append('view', uploaded.length === 0 ? 'hero' : 'additional');
        const response = await fetch('/api/assets', {
          method: 'POST',
          body: payload,
        });
        const result = (await response.json().catch(() => ({}))) as {
          id?: string;
          filename?: string;
          url?: string;
          error?: string;
        };
        if (!response.ok || !result.id || !result.filename || !result.url)
          throw new Error(result.error || 'Upload fehlgeschlagen.');
        setUploaded((current) => [
          ...current,
          {
            id: result.id || '',
            filename: result.filename || '',
            url: result.url || '',
          },
        ]);
      }
      setNotice('Bild sicher gespeichert.');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Das Bild konnte nicht hochgeladen werden.',
      );
    } finally {
      if (uploadRef.current) uploadRef.current.value = '';
    }
  }

  async function saveResearch() {
    if (!activeProduct) return;
    const rows = keywords
      .split(/\r?\n/)
      .map((phrase) => phrase.trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((phrase) => ({ phrase, relevance: 4, intent: 4 }));
    if (!rows.length) return;
    const response = await fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: activeProduct.id,
        locale: 'de',
        market: 'DE',
        source: 'Manuelle Eingabe',
        rows,
      }),
    });
    setResearchSaved(response.ok);
    setNotice(
      response.ok
        ? rows.length +
            ' Suchphrasen mit unbekannten Nachfragewerten gespeichert.'
        : 'Recherche konnte nicht gespeichert werden.',
    );
  }

  function updateContent(
    locale: string,
    key: 'description' | 'tags',
    value: string | string[],
  ) {
    if (!activeProduct || locks[locale + '-' + key]) return;
    setActiveProduct({
      ...activeProduct,
      content: activeProduct.content.map((item) =>
        item.locale === locale ? { ...item, [key]: value } : item,
      ),
    });
  }

  function updateTitle(locale: string, index: number, value: string) {
    if (!activeProduct || locks[locale + '-titles']) return;
    setActiveProduct({
      ...activeProduct,
      content: activeProduct.content.map((item) =>
        item.locale === locale
          ? {
              ...item,
              titles: item.titles.map((title, titleIndex) =>
                titleIndex === index ? value : title,
              ),
            }
          : item,
      ),
    });
  }

  function selectTitle(locale: string, index: number) {
    if (!activeProduct) return;
    setActiveProduct({
      ...activeProduct,
      content: activeProduct.content.map((item) =>
        item.locale === locale ? { ...item, selectedTitle: index } : item,
      ),
    });
  }

  async function persistLocale(locale: string) {
    if (!activeProduct) return;
    const item = activeProduct.content.find((entry) => entry.locale === locale);
    if (!item) return;
    const response = await fetch('/api/products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeProduct.id,
        locale,
        titles: item.titles,
        selectedTitle: item.selectedTitle,
        description: item.description,
        tags: item.tags,
        locked: Object.entries(locks)
          .filter(([key, value]) => value && key.startsWith(locale))
          .map(([key]) => key.split('-').slice(1).join('-')),
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      issues?: Created['issues'];
    };
    if (response.ok && Array.isArray(result.issues))
      setActiveProduct((current) =>
        current
          ? { ...current, issues: result.issues || current.issues }
          : current,
      );
    setNotice(
      response.ok
        ? 'Änderungen gespeichert.'
        : 'Änderungen konnten nicht gespeichert werden.',
    );
  }

  const completion = useMemo(() => {
    if (!activeProduct) return 0;
    let done = 2;
    if (uploaded.length) done++;
    if (researchSaved) done++;
    if (activeProduct.content.length === 2) done++;
    if (activeProduct.pricing.etsyPrice) done++;
    return Math.round((done / 7) * 100);
  }, [activeProduct, uploaded, researchSaved]);

  if (!sessionChecked)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f0e8]">
        <div className="text-center">
          <Loader2 className="mx-auto size-7 animate-spin text-[#4a5c58]" />
          <p className="mt-3 text-sm text-muted-foreground">
            FORMPOESIE STUDIO wird geöffnet …
          </p>
        </div>
      </main>
    );

  if (!inventoryConnected)
    return (
      <AdminLogin
        email={inventoryEmail}
        password={inventoryPassword}
        setEmail={setInventoryEmail}
        setPassword={setInventoryPassword}
        connect={connectInventory}
        loading={inventoryLoading}
        error={notice}
      />
    );

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      style={
        {
          '--fp-ink': brandPalette[0],
          '--fp-paper': brandPalette[1],
          '--fp-mist': brandPalette[2],
          '--fp-sand': brandPalette[3],
          '--fp-primary': brandPalette[4],
          '--fp-accent': brandPalette[5],
          backgroundColor: brandPalette[1],
        } as React.CSSProperties
      }
    >
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[228px] flex-col border-r border-white/8 bg-[var(--fp-ink)] px-4 py-5 text-[var(--fp-paper)] lg:flex">
        <div className="flex items-center gap-3 px-2">
          <Image
            src="/icon-192.png"
            width={36}
            height={36}
            alt="FormPoesie Logo"
            className="size-9 rounded-lg object-contain"
            priority
          />
          <div>
            <div className="text-sm font-semibold leading-none tracking-wide">
              FORMPOESIE STUDIO
            </div>
            <div className="mt-1 text-[11px] tracking-[.12em] text-[var(--fp-sand)] uppercase">
              Interne Arbeitsfläche
            </div>
          </div>
        </div>
        <nav
          className="mt-8 min-h-0 flex-1 space-y-0.5 overflow-y-auto"
          aria-label="Hauptnavigation"
        >
          {navPrimary.map(([label, Icon]) => (
            <button
              key={label}
              onClick={() => openNavigation(label)}
              className={
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ' +
                (navigationActive(label)
                  ? 'bg-[var(--fp-paper)] text-[var(--fp-ink)]'
                  : 'text-[var(--fp-paper)]/68 hover:bg-white/7 hover:text-white')
              }
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
            </button>
          ))}
          {navGroups
            .filter((group) => !('restricted' in group) || inventoryCanManage)
            .map((group) => (
              <details
                key={group.label}
                className="group rounded-xl"
                open={
                  group.items.some(([label]) => navigationActive(label)) ||
                  undefined
                }
              >
                <summary className="cursor-pointer list-none rounded-xl px-3 py-2.5 text-sm text-[var(--fp-paper)]/68 transition hover:bg-white/7 hover:text-white">
                  <span className="flex items-center justify-between gap-2">
                    {group.label}
                    <span className="text-xs transition group-open:rotate-180">
                      ⌄
                    </span>
                  </span>
                </summary>
                <div className="ml-2 space-y-0.5 border-l border-white/10 pl-2">
                  {group.items.map(([label, Icon]) => (
                    <button
                      key={label}
                      onClick={() => openNavigation(label)}
                      className={
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ' +
                        (navigationActive(label)
                          ? 'bg-[var(--fp-paper)] text-[var(--fp-ink)]'
                          : 'text-[var(--fp-paper)]/62 hover:bg-white/7 hover:text-white')
                      }
                    >
                      <Icon className="size-4" />
                      <span className="flex-1">{label}</span>
                    </button>
                  ))}
                </div>
              </details>
            ))}
        </nav>
        <div className="mt-auto space-y-1">
          {inventoryCanManage ? (
            <button
              type="button"
              onClick={openTrash}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--fp-paper)]/68"
            >
              <Trash2 className="size-4" />
              Papierkorb
              {trashedProducts.length ? (
                <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px]">
                  {trashedProducts.length}
                </span>
              ) : null}
            </button>
          ) : null}
          {inventoryCanManage ? (
            <button
              onClick={() => void openSettings()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--fp-paper)]/68"
            >
              <Settings2 className="size-4" />
              Profile & Regeln
            </button>
          ) : null}
          <button
            onClick={() => setHelpOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--fp-paper)]/68"
          >
            <CircleHelp className="size-4" />
            Info
          </button>
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[82dvh] overflow-y-auto rounded-t-[28px] border-[#d9d0c3] bg-[#f8f4ed] pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden"
        >
          <SheetHeader className="border-b px-5 pt-5 pb-4 text-left">
            <SheetTitle className="font-heading text-2xl">
              FORMPOESIE STUDIO
            </SheetTitle>
            <SheetDescription>Interne Arbeitsfläche</SheetDescription>
          </SheetHeader>
          <nav className="space-y-5 px-4 pb-2" aria-label="Mobile Navigation">
            {navGroups
              .filter((group) => !('restricted' in group) || inventoryCanManage)
              .map((group) => (
                <section key={group.label}>
                  <h2 className="px-2 text-xs font-semibold tracking-[.12em] text-muted-foreground uppercase">
                    {group.label}
                  </h2>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {group.items.map(([label, Icon]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => openMobileNavigation(label)}
                        className={
                          'flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm ' +
                          (navigationActive(label)
                            ? 'border-[var(--fp-primary)] bg-[var(--fp-primary)] text-white'
                            : 'bg-white/70')
                        }
                      >
                        <Icon className="size-5 shrink-0" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            <section>
              <h2 className="px-2 text-xs font-semibold tracking-[.12em] text-muted-foreground uppercase">
                System
              </h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {inventoryCanManage ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNavOpen(false);
                      openTrash();
                    }}
                    className="flex min-h-12 items-center gap-3 rounded-2xl border bg-white/70 px-4 py-3 text-left text-sm"
                  >
                    <Trash2 className="size-5" /> Papierkorb
                  </button>
                ) : null}
                {inventoryCanManage ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNavOpen(false);
                      void openSettings();
                    }}
                    className="flex min-h-12 items-center gap-3 rounded-2xl border bg-white/70 px-4 py-3 text-left text-sm"
                  >
                    <Settings2 className="size-5" /> Profile & Regeln
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    setHelpOpen(true);
                  }}
                  className="flex min-h-12 items-center gap-3 rounded-2xl border bg-white/70 px-4 py-3 text-left text-sm"
                >
                  <CircleHelp className="size-5" /> Info
                </button>
              </div>
            </section>
          </nav>
        </SheetContent>
      </Sheet>

      <section className="min-w-0 overflow-x-hidden pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pl-[228px] lg:pb-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-[var(--fp-paper)]/92 px-5 backdrop-blur md:px-8">
          <button
            onClick={() => {
              setActiveProduct(null);
              closeModules();
            }}
            className="flex items-center gap-2"
          >
            {activeProduct ||
            calendarOpen ||
            inventoryOpen ||
            draftModule ||
            mindMapOpen ||
            accountsOpen ||
            catalogsOpen ||
            orderFormOpen ||
            trashOpen ? (
              <ArrowLeft className="size-4" />
            ) : null}
            <span className="text-sm font-semibold tracking-wide lg:hidden">
              FORMPOESIE STUDIO
            </span>
            <span className="hidden text-sm text-muted-foreground lg:block">
              {activeProduct
                ? activeName
                : calendarOpen
                  ? 'News-Kalender'
                  : inventoryOpen
                    ? inventoryArea === 'markets'
                      ? 'Märkte'
                      : inventoryArea === 'pricing'
                        ? 'Preise & Portfolio'
                        : inventoryArea === 'shelves'
                        ? 'Regalflächen'
                        : inventoryArea === 'cash'
                          ? 'Kasse'
                          : inventoryArea === 'sales'
                            ? 'Verkaufshistorie'
                            : inventoryArea === 'expenses'
                              ? 'Einkäufe & Ausgaben'
                              : inventoryArea === 'months'
                                ? 'Monatsübersicht'
                                : inventoryArea === 'online'
                                  ? 'Druck & Versand'
                                  : 'Inventar'
                    : draftModule === 'workflow'
                      ? 'Etsy Workflow'
                      : mindMapOpen
                        ? 'Mindmap'
                        : accountsOpen
                          ? 'Konten & Abos'
                          : catalogsOpen
                            ? 'Kataloge'
                            : orderFormOpen
                              ? 'Bestellformular'
                              : trashOpen
                                ? 'Papierkorb'
                                : 'Interne Arbeitsfläche'}
            </span>
          </button>
          <div className="flex items-center gap-3">
            {activeProduct ? (
              <div className="hidden items-center gap-2 rounded-full border bg-white/50 px-3 py-1.5 sm:flex">
                <span className="text-xs text-muted-foreground">Modus</span>
                <button
                  onClick={() =>
                    setMode(mode === 'autopilot' ? 'pro' : 'autopilot')
                  }
                  className="text-xs font-semibold"
                >
                  {mode === 'autopilot' ? 'Autopilot' : 'Pro'}
                </button>
              </div>
            ) : null}
            <a
              href="https://www.etsy.com/de/shop/3DFormPoesie"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:block"
            >
              <Badge
                variant="outline"
                className="rounded-full border-[var(--fp-primary)]/35 bg-white/55 text-[#31443f]"
              >
                <Check className="size-3" /> 3DFormPoesie
              </Badge>
            </a>
            {inventoryCanManage ? (
              <button
                aria-label="Profile und Regeln öffnen"
                onClick={() => void openSettings()}
                className="grid size-8 place-items-center rounded-full border bg-white/45 text-[var(--fp-primary)] lg:hidden"
              >
                <Settings2 className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Persönliches Konto öffnen"
              onClick={() => openInventory('account')}
              className="grid size-9 place-items-center rounded-full bg-[var(--fp-primary)] text-xs font-medium text-white"
              title={inventoryUserName || inventoryEmail}
            >
              {(inventoryUserName || inventoryEmail || 'FP')
                .split(/[\s@._-]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toLocaleUpperCase('de'))
                .join('')}
            </button>
          </div>
        </header>

        {notice ? (
          <output className="mx-auto mt-4 flex max-w-[1220px] items-center justify-between rounded-xl border border-[var(--fp-sand)]/55 bg-[#fffaf2] px-4 py-3 text-sm">
            <span>{notice}</span>
            <button
              aria-label="Hinweis schließen"
              onClick={() => setNotice('')}
            >
              <X className="size-4" />
            </button>
          </output>
        ) : null}

        {calendarOpen ? (
          <NewsCalendar initialEntryId={calendarEntryId} />
        ) : inventoryOpen ? (
          <InventoryWorkspace
            initialArea={inventoryArea}
            initialProductId={inventoryProductId}
            canManage={inventoryCanManage}
            onCreateListing={createFromInventory}
          />
        ) : draftModule ? (
          <EtsyWorkflow
            inventoryItems={inventoryItems}
            initialProductId={etsyStartProductId}
          />
        ) : mindMapOpen ? (
          <MindMapWorkspace />
        ) : accountsOpen ? (
          <AccountsHub onInventory={() => openInventory('products')} />
        ) : catalogsOpen ? (
          <CatalogHub />
        ) : orderFormOpen ? (
          <OrderFormHub />
        ) : trashOpen ? (
          <TrashBin rows={trashedProducts} onRestore={restoreProduct} />
        ) : !activeProduct ? (
          <Dashboard
            onCalendar={openCalendar}
            onInventoryProduct={(productId) =>
              openInventory('products', productId)
            }
            canManage={inventoryCanManage}
          />
        ) : (
          <Workspace
            product={activeProduct}
            productName={activeName}
            activeStep={activeStep}
            setActiveStep={setActiveStep}
            completion={completion}
            uploaded={uploaded}
            onUpload={() => uploadRef.current?.click()}
            onSaveFacts={saveFacts}
            keywords={keywords}
            setKeywords={setKeywords}
            researchSaved={researchSaved}
            saveResearch={saveResearch}
            locks={locks}
            setLocks={setLocks}
            updateContent={updateContent}
            updateTitle={updateTitle}
            selectTitle={selectTitle}
            persistLocale={persistLocale}
          />
        )}
      </section>

      <nav
        aria-label="Schnellnavigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[var(--fp-ink)] px-2 pt-1 text-[var(--fp-paper)] shadow-[0_-8px_30px_rgba(26,26,24,.15)] lg:hidden"
        style={{ paddingBottom: 'max(.35rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {navPrimary.map(([label, Icon]) => (
            <button
              key={label}
              type="button"
              onClick={() => openMobileNavigation(label)}
              className={
                'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] transition ' +
                (navigationActive(label)
                  ? 'bg-white/12 text-white'
                  : 'text-[var(--fp-paper)]/65')
              }
            >
              <Icon className="size-5" />
              <span className="max-w-full truncate">
                {label === 'Etsy Workflow' ? 'Etsy' : label}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] text-[var(--fp-paper)]/65"
          >
            <MoreHorizontal className="size-5" />
            <span>Mehr</span>
          </button>
        </div>
      </nav>

      <input
        ref={uploadRef}
        type="file"
        className="hidden"
        multiple
        accept="image/jpeg,image/png"
        onChange={(event) => void uploadPhotos(event.target.files)}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[#d9d0c3] bg-[#f8f4ed] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-3xl">
              Neues Listing beginnen
            </DialogTitle>
            <DialogDescription>
              Vorhandenen Inventarartikel auswählen – oder nur für einen
              wirklich neuen Artikel die Eckdaten erfassen.
            </DialogDescription>
          </DialogHeader>
          <ProductForm
            form={form}
            setField={setField}
            saving={saving}
            onSubmit={createProduct}
            source={createSource}
            setSource={(source) => {
              setCreateSource(source);
              setSelectedInventory(null);
              setForm(initialForm);
              if (source === 'inventory') void loadInventory();
            }}
            inventoryConnected={inventoryConnected}
            inventoryEmail={inventoryEmail}
            inventoryPassword={inventoryPassword}
            setInventoryEmail={setInventoryEmail}
            setInventoryPassword={setInventoryPassword}
            connectInventory={connectInventory}
            inventoryLoading={inventoryLoading}
            inventoryItems={inventoryItems}
            inventorySearch={inventorySearch}
            setInventorySearch={setInventorySearch}
            selectedInventory={selectedInventory}
            selectInventoryItem={useInventoryItem}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="border-[#d9d0c3] bg-[#f8f4ed] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-3xl">
              Markenprofil & Regeln
            </DialogTitle>
            <DialogDescription>
              Globale Regeln sind sichtbar und ändern neue Generierungen.
              Einzelkorrekturen werden nicht automatisch global.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 space-y-5">
            <div className="grid gap-2 text-sm">
              <label htmlFor="brand-voice" className="font-medium">
                Markenstimme
              </label>
              <Textarea
                id="brand-voice"
                value={brandVoice}
                onChange={(event) => setBrandVoice(event.target.value)}
                className="min-h-24 bg-white"
              />
            </div>
            <div className="grid gap-2 text-sm">
              <label htmlFor="brand-rules" className="font-medium">
                Eine Regel pro Zeile
              </label>
              <Textarea
                id="brand-rules"
                value={brandRules}
                onChange={(event) => setBrandRules(event.target.value)}
                className="min-h-40 bg-white"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Palette className="size-4" /> Farbpalette
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Änderungen werden sofort in der Arbeitsfläche sichtbar.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  'Dunkel',
                  'Fläche',
                  'Nebel',
                  'Sand',
                  'Markenfarbe',
                  'Akzent',
                ].map((label, index) => (
                  <label
                    key={label}
                    className="flex items-center gap-2 rounded-xl border bg-white/55 p-2 text-xs"
                  >
                    <input
                      type="color"
                      aria-label={label + ' wählen'}
                      value={brandPalette[index]}
                      onChange={(event) =>
                        setBrandPalette((current) =>
                          current.map((color, colorIndex) =>
                            colorIndex === index ? event.target.value : color,
                          ),
                        )
                      }
                      className="size-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                    />
                    <span>
                      <span className="block font-medium">{label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {brandPalette[index]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-between border-t pt-4">
              <Button variant="outline" onClick={() => void saveSettings(true)}>
                Zurücksetzen
              </Button>
              <Button onClick={() => void saveSettings(false)}>
                Profil speichern
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MasterbrainInfo open={helpOpen} onOpenChange={setHelpOpen} />
    </main>
  );
}

function MasterbrainInfo({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [automation, setAutomation] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    void fetch('/api/activity')
      .then(async (response) => {
        const result = (await response.json()) as {
          automation?: Record<string, string>;
        };
        if (response.ok) setAutomation(result.automation || {});
      })
      .catch(() => undefined);
  }, [open]);

  const lastResult =
    automation.last_result === 'success'
      ? `Erfolgreich · ${automation.last_today_count || '0'} heutige News`
      : automation.last_result === 'failed'
        ? 'Fehlgeschlagen'
        : 'Noch kein Ergebnis';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[#d9d0c3] bg-[#f8f4ed] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-3xl">
            Info zum Masterbrain
          </DialogTitle>
          <DialogDescription>
            Aktueller Systemstatus und nachvollziehbare Berechnungsgrundlagen.
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border bg-white/65 p-4">
            <div className="text-xs text-muted-foreground">Zeitplan</div>
            <div className="mt-1 font-medium">
              {automation.automation_schedule || 'Täglich ab 20:00 Uhr'}
            </div>
          </div>
          <div className="rounded-2xl border bg-white/65 p-4">
            <div className="text-xs text-muted-foreground">
              Letzte Synchronisierung
            </div>
            <div className="mt-1 font-medium">
              {automation.last_synced_at
                ? new Intl.DateTimeFormat('de-DE', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(automation.last_synced_at))
                : 'noch ausstehend'}
            </div>
          </div>
          <div className="rounded-2xl border bg-white/65 p-4">
            <div className="text-xs text-muted-foreground">Letzter Lauf</div>
            <div className="mt-1 font-medium">{lastResult}</div>
          </div>
          <div className="rounded-2xl border bg-white/65 p-4">
            <div className="text-xs text-muted-foreground">
              Modell des Monats
            </div>
            <div className="mt-1 font-medium">
              Aktiv · am 1. und nach jeder Verkaufserfassung
            </div>
          </div>
        </section>

        <section className="mt-2 space-y-3">
          <h3 className="font-heading text-2xl">So setzt es sich zusammen</h3>
          {[
            [
              'Wochen-Erfolge',
              'Gezählt wird von Montag 00:00 Uhr bis jetzt. Verkaufte Artikel sind die summierten Stückzahlen. Umsatz umfasst Markt- und Onlineverkäufe. Der stärkste Artikel ist das Modell mit der höchsten Stückzahl.',
            ],
            [
              'Tagesnews',
              'Im Feed erscheinen nur Kalendereinträge, die heute erfasst wurden, sowie heutige Meldungen zu neuen Modellen der gespeicherten Lizenz-Designer. Ältere Monatsauswertungen werden dort nicht erneut eingeblendet.',
            ],
            [
              'News-Synchronisierung',
              'Der Masterbrain gleicht die Kalenderquelle und die gespeicherten Designer-Profile täglich ab 20:00 Uhr ab. „Heutige News“ zählt die Einträge mit dem heutigen Erfassungsdatum – nicht alle jemals importierten Datensätze. Manuelle Änderungen im Masterbrain bleiben erhalten.',
            ],
            [
              'Modell des Monats',
              'Markt- und Onlineverkäufe werden nach verkauften Stückzahlen zusammengeführt; stornierte Verkäufe zählen nicht. Das Modell mit den meisten verkauften Exemplaren gewinnt. Angezeigt werden seine Stückzahl und alle im Monat verkauften Artikel. Vergangene Monate aktualisieren sich bei Nachträgen.',
            ],
            [
              'Artikelkosten & Marge',
              'Gesamtkosten bestehen aus Filament, Ausschuss, Maschinenzeit, Strom, Zusatzkosten und Bauteilen. Maschinenzeit wird mit 0,10 € je Stunde berechnet; Strom abhängig vom Drucker. Marge = Verkaufspreis minus Gesamtkosten. Die Prozentmarge bezieht diese Marge auf den Verkaufspreis.',
            ],
            [
              'Kasse & Bestand',
              'Die allgemeine Kasse speichert Abholung, eBay, eBay Kleinanzeigen, Vinted, Etsy und Bestellformular als Onlineverkäufe. Märkte und Regalflächen haben eigene Kassen. Der Bestand eines allgemeinen Verkaufs wird erst beim Abschließen von Versand oder Abholung abgezogen.',
            ],
            [
              'Daten & Papierkorb',
              'Produkte lesen die gemeinsame Inventardatenbank direkt; ein Import ist nicht nötig. Etsy-Entwürfe können in den Papierkorb verschoben und wiederhergestellt werden. Markenstimme, Regeln und Farben liegen unter „Profile & Regeln“.',
            ],
          ].map(([title, detail]) => (
            <details
              key={title}
              className="group rounded-2xl border bg-white/55 open:bg-white/75"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium">
                {title}
                <span className="text-sm transition group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <p className="border-t px-4 py-3 text-sm leading-6 text-muted-foreground">
                {detail}
              </p>
            </details>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}

const calendarColors: Record<string, string> = {
  'Aufklärung / Marke': '#1a1a18',
  'Bauen & Architektur': '#4a5c58',
  'Energie & Infrastruktur': '#8a7137',
  'Forschung & Verfahren': '#75647c',
  'Konsum & Alltag': '#a96f66',
  'Material & Werkstoffe': '#a97849',
  'Medizin & Körper': '#8b5e3c',
  'Natur & Umwelt': '#6e8a63',
  'Raumfahrt & Mobilität': '#5c6b78',
};

const monthNames = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

function formatCalendarDate(value?: string) {
  if (!value) return 'nicht belegt';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value + 'T00:00:00Z'));
}

function safeExternalUrl(value?: string) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function vaultKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new Uint8Array(salt).buffer as ArrayBuffer,
      iterations,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptVaultSecret(
  accountId: string,
  password: string,
  passphrase: string,
): Promise<EncryptedSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 310000;
  const key = await vaultKey(passphrase, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(password),
  );
  return {
    accountId,
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    iterations,
  };
}

async function decryptVaultSecret(secret: EncryptedSecret, passphrase: string) {
  const key = await vaultKey(
    passphrase,
    base64ToBytes(secret.salt),
    secret.iterations,
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(secret.iv) },
    key,
    base64ToBytes(secret.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

function AdminLogin({
  email,
  password,
  setEmail,
  setPassword,
  connect,
  loading,
  error,
}: {
  email: string;
  password: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  connect: () => void;
  loading: boolean;
  error: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f0e8] px-5 py-10 text-[#1a1a18]">
      <section className="w-full max-w-md rounded-[30px] border border-[#d9d0c3] bg-white/70 p-7 shadow-[0_24px_70px_rgba(40,45,42,.12)] md:p-9">
        <Image
          src="/icon-192.png"
          width={48}
          height={48}
          alt="FormPoesie Logo"
          className="size-12 rounded-xl object-contain"
          priority
        />
        <p className="mt-7 text-xs font-semibold tracking-[.14em] text-[#4a5c58] uppercase">
          Interne Arbeitsfläche
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-wide">
          FORMPOESIE STUDIO
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Keine ChatGPT-Anmeldung. Melde dich mit demselben FormPoesie-Konto wie
          in deiner Inventarverwaltung an.
        </p>
        <div className="mt-7 space-y-3">
          <Input
            aria-label="FormPoesie E-Mail-Adresse"
            type="email"
            autoComplete="username"
            placeholder="E-Mail-Adresse"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && email && password) connect();
            }}
          />
          <Input
            aria-label="FormPoesie Passwort"
            type="password"
            autoComplete="current-password"
            placeholder="Passwort"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && email && password) connect();
            }}
          />
        </div>
        {error ? (
          <p className="mt-3 rounded-xl border border-[#b5895a]/40 bg-[#fff8ef] p-3 text-sm">
            {error}
          </p>
        ) : null}
        <Button
          className="mt-4 h-11 w-full rounded-full bg-[#1a1a18]"
          onClick={connect}
          disabled={loading || !email || !password}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          Sicher anmelden
        </Button>
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Dein Passwort wird nicht im FORMPOESIE STUDIO gespeichert.
        </p>
      </section>
    </main>
  );
}

function NewsCalendar({ initialEntryId = '' }: { initialEntryId?: string }) {
  const [archive, setArchive] = useState<CalendarArchive | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [focusedEntryId, setFocusedEntryId] = useState(initialEntryId);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/calendar', { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as CalendarArchive & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error || 'Kalender nicht lesbar.');
        const entries = [...data.eintraege].sort((a, b) =>
          a.ereignisDatum.localeCompare(b.ereignisDatum),
        );
        setArchive({ ...data, eintraege: entries });
        setMonth(entries.at(-1)?.ereignisDatum.slice(0, 7) || '');
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError')
          return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'Der News-Kalender ist gerade nicht erreichbar.',
        );
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const categories = useMemo(
    () =>
      [
        ...new Set((archive?.eintraege || []).map((entry) => entry.kategorie)),
      ].sort((a, b) => a.localeCompare(b, 'de')),
    [archive],
  );
  const visibleEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('de');
    return (archive?.eintraege || []).filter((entry) => {
      const text = [
        entry.thema,
        entry.kategorie,
        entry.organisation,
        entry.ort,
        entry.zusammenfassung,
      ]
        .join(' ')
        .toLocaleLowerCase('de');
      return (
        (!query || text.includes(query)) &&
        (!category || entry.kategorie === category)
      );
    });
  }, [archive, category, search]);
  const selectedEntries = visibleEntries.filter((entry) =>
    focusedEntryId
      ? entry.id === focusedEntryId
      : entry.ereignisDatum === selectedDay,
  );
  const monthEntries = visibleEntries
    .filter((entry) => entry.ereignisDatum.startsWith(month))
    .sort((a, b) => a.ereignisDatum.localeCompare(b.ereignisDatum));

  const monthDate = month ? new Date(month + '-01T00:00:00Z') : null;
  const year = monthDate?.getUTCFullYear() || 0;
  const monthIndex = monthDate?.getUTCMonth() || 0;
  const firstWeekday = monthDate ? (monthDate.getUTCDay() + 6) % 7 : 0;
  const lastDay = monthDate ? new Date(monthDate.getTime()) : null;
  if (lastDay) lastDay.setUTCMonth(monthIndex + 1, 0);
  const daysInMonth = lastDay?.getUTCDate() || 0;
  const days = Array.from({ length: firstWeekday + daysInMonth }, (_, index) =>
    index < firstWeekday ? null : index - firstWeekday + 1,
  );
  while (days.length % 7) days.push(null);

  function shiftMonth(delta: number) {
    if (!monthDate) return;
    const next = new Date(monthDate.getTime());
    next.setUTCMonth(monthIndex + delta, 1);
    setMonth(
      next.getUTCFullYear() +
        '-' +
        String(next.getUTCMonth() + 1).padStart(2, '0'),
    );
  }

  async function syncNow() {
    setSyncing(true);
    setError('');
    try {
      const response = await fetch('/api/calendar?sync=1');
      const result = (await response.json()) as CalendarArchive & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Synchronisierung fehlgeschlagen.');
      const entries = [...result.eintraege].sort((a, b) =>
        a.ereignisDatum.localeCompare(b.ereignisDatum),
      );
      setArchive({ ...result, eintraege: entries });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Synchronisierung fehlgeschlagen.',
      );
    } finally {
      setSyncing(false);
    }
  }

  async function saveCalendarEntry() {
    if (!editingEntry) return;
    setSavingEntry(true);
    const response = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: editingEntry }),
    });
    setSavingEntry(false);
    if (!response.ok) {
      setError('Kalendereintrag konnte nicht gespeichert werden.');
      return;
    }
    setArchive((current) =>
      current
        ? {
            ...current,
            eintraege: current.eintraege.map((entry) =>
              entry.id === editingEntry.id ? editingEntry : entry,
            ),
          }
        : current,
    );
    setEditingEntry(null);
  }

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-6 md:px-8 md:py-9">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            <RefreshCw className="size-3.5" /> Täglich aus der
            News-Automatisierung
          </div>
          <h1 className="mt-2 font-heading text-4xl leading-none md:text-5xl">
            News-Kalender
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="w-fit rounded-full bg-white/50 px-4 py-2"
          >
            <CheckCircle2 className="size-4" /> Automation{' '}
            {archive?.meta?.masterbrainSync?.status === 'ACTIVE'
              ? 'aktiv'
              : 'wird geprüft'}
          </Badge>
          <Button
            variant="outline"
            onClick={() => void syncNow()}
            disabled={syncing}
          >
            <RefreshCw
              className={'size-4 ' + (syncing ? 'animate-spin' : '')}
            />{' '}
            Jetzt synchronisieren
          </Button>
        </div>
      </div>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white/62 p-4">
          <div className="text-xs text-muted-foreground">Rhythmus</div>
          <div className="mt-1 font-medium">
            {archive?.meta?.masterbrainSync?.schedule || 'Täglich ab 20:00 Uhr'}
          </div>
        </div>
        <div className="rounded-2xl border bg-white/62 p-4">
          <div className="text-xs text-muted-foreground">
            Letzte Masterbrain-Synchronisierung
          </div>
          <div className="mt-1 font-medium">
            {archive?.meta?.masterbrainSync?.lastSyncedAt
              ? new Intl.DateTimeFormat('de-DE', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(archive.meta.masterbrainSync.lastSyncedAt))
              : 'noch ausstehend'}
          </div>
        </div>
        <div className="rounded-2xl border bg-white/62 p-4">
          <div className="text-xs text-muted-foreground">Letztes Ergebnis</div>
          <div className="mt-1 font-medium">
            {archive?.meta?.masterbrainSync?.lastResult === 'success'
              ? 'Erfolgreich'
              : archive?.meta?.masterbrainSync?.lastResult === 'failed'
                ? 'Fehlgeschlagen'
                : 'Noch kein Lauf'}{' '}
            · {archive?.meta?.masterbrainSync?.todayCount || 0}{' '}
            {archive?.meta?.masterbrainSync?.todayCount === 1
              ? 'heutige News'
              : 'heutige News'}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[26px] border bg-white/62 p-4 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label="News durchsuchen"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Thema, Organisation oder Ort suchen"
              className="bg-white pl-9"
            />
          </div>
          <select
            aria-label="News-Kategorie wählen"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-9 rounded-lg border bg-white px-3 text-sm"
          >
            <option value="">Alle Kategorien</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <div className="text-sm text-muted-foreground">
            {loading
              ? 'Kalender wird geladen …'
              : error
                ? error
                : visibleEntries.length +
                  ' Einträge · Stand ' +
                  formatCalendarDate(archive?.meta?.aktualisiertAm)}
          </div>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-[26px] border bg-white/68">
        <div className="flex items-center justify-between border-b px-4 py-4 md:px-6">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Vorheriger Monat"
            onClick={() => shiftMonth(-1)}
            disabled={!month}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h2 className="font-heading text-2xl">
            {month ? monthNames[monthIndex] + ' ' + year : 'Kalender'}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Nächster Monat"
            onClick={() => shiftMonth(1)}
            disabled={!month}
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>

        {error ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {error}
          </div>
        ) : (
          <>
            <div className="space-y-2 p-3 lg:hidden">
              {monthEntries.map((entry) => {
                const imageUrl = newsImageUrl(entry.bild?.url);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setSelectedDay(null);
                      setFocusedEntryId(entry.id);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl border bg-white/75 p-3 text-left"
                  >
                    {imageUrl ? (
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-[var(--fp-mist)]">
                        <Image
                          src={imageUrl}
                          alt=""
                          fill
                          unoptimized
                          sizes="64px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <span
                        className="grid size-12 shrink-0 place-items-center rounded-xl text-xs font-semibold text-white"
                        style={{
                          backgroundColor:
                            calendarColors[entry.kategorie] || '#5d707b',
                        }}
                      >
                        {entry.ereignisDatum.slice(-2)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">
                        {formatCalendarDate(entry.ereignisDatum)} ·{' '}
                        {entry.kategorie}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-sm font-medium">
                        {entry.thema}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0" />
                  </button>
                );
              })}
              {!monthEntries.length ? (
                <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Für diesen Monat gibt es keine passenden Einträge.
                </p>
              ) : null}
            </div>
            <div className="hidden p-5 lg:block">
              <div
                className="grid min-w-[860px] grid-cols-7 gap-2"
                aria-label="News-Kalender"
              >
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
                  <div
                    key={day}
                    className="px-2 pb-1 text-xs font-semibold text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
                {days.map((day, index) => {
                  if (!day)
                    return (
                      <div
                        key={'empty-' + index}
                        className="min-h-32 rounded-xl bg-[var(--fp-paper)]/45"
                        aria-hidden="true"
                      />
                    );
                  const date = month + '-' + String(day).padStart(2, '0');
                  const events = visibleEntries.filter(
                    (entry) => entry.ereignisDatum === date,
                  );
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => {
                        setFocusedEntryId('');
                        setSelectedDay(date);
                      }}
                      aria-label={
                        formatCalendarDate(date) +
                        (events.length
                          ? ', ' + events.length + ' Einträge'
                          : '')
                      }
                      className={
                        'min-h-32 rounded-xl border p-2 text-left transition ' +
                        (events.length
                          ? 'border-[var(--fp-primary)]/35 bg-[#fbfaf7] hover:border-[var(--fp-primary)]'
                          : 'border-transparent bg-[var(--fp-paper)]/45')
                      }
                    >
                      <span className="text-sm font-semibold">{day}</span>
                      <span className="mt-2 block space-y-1.5">
                        {events.slice(0, 2).map((entry) => (
                          <span
                            key={entry.id}
                            className="block rounded-lg border-l-4 bg-white p-1.5 text-[11px] leading-4"
                            style={{
                              borderLeftColor:
                                calendarColors[entry.kategorie] || '#5d707b',
                            }}
                          >
                            <span className="block truncate font-semibold">
                              {entry.kategorie}
                            </span>
                            <span className="line-clamp-2 block text-muted-foreground">
                              {entry.thema}
                            </span>
                          </span>
                        ))}
                        {events.length > 2 ? (
                          <span className="block text-[11px] text-muted-foreground">
                            +{events.length - 2} weitere
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </section>

      <Dialog
        open={selectedDay !== null || Boolean(focusedEntryId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDay(null);
            setFocusedEntryId('');
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto border-[#d9d0c3] bg-[#f8f4ed] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-3xl">
              {formatCalendarDate(
                selectedEntries[0]?.ereignisDatum || selectedDay || '',
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedEntries.length === 1
                ? '1 Eintrag'
                : selectedEntries.length + ' Einträge'}{' '}
              aus dem automatisierten News-Archiv
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            {selectedEntries.length ? (
              selectedEntries.map((entry) => {
                const sourceUrl = safeExternalUrl(entry.quelleUrl);
                const imageUrl = entry.bild?.url?.startsWith('assets/images/')
                  ? 'https://formpoesie.github.io/formpoesie-themen-kalender/' +
                    entry.bild.url
                  : safeExternalUrl(entry.bild?.url);
                return (
                  <article
                    key={entry.id}
                    className="rounded-2xl border bg-white/65 p-4 md:p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        style={{
                          backgroundColor:
                            calendarColors[entry.kategorie] || '#5d707b',
                          color: 'white',
                        }}
                      >
                        {entry.kategorie}
                      </Badge>
                      {entry.vertrauensniveau ? (
                        <Badge variant="outline">
                          Vertrauen: {entry.vertrauensniveau}
                        </Badge>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => setEditingEntry(entry)}
                      >
                        <FilePenLine className="size-4" /> Bearbeiten
                      </Button>
                    </div>
                    <h3 className="mt-3 font-heading text-2xl leading-tight">
                      {entry.thema}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {[entry.organisation, entry.ort]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {imageUrl ? (
                      <figure className="mt-4 overflow-hidden rounded-xl border bg-[var(--fp-mist)]">
                        <Image
                          src={imageUrl}
                          alt={entry.bild?.alt || entry.thema}
                          width={960}
                          height={540}
                          unoptimized
                          className="max-h-80 w-full object-cover"
                          loading="lazy"
                        />
                        {entry.bild?.credit ? (
                          <figcaption className="px-3 py-2 text-xs text-muted-foreground">
                            {entry.bild.credit}
                          </figcaption>
                        ) : null}
                      </figure>
                    ) : null}
                    {entry.zusammenfassung ? (
                      <p className="mt-4 text-sm leading-6">
                        {entry.zusammenfassung}
                      </p>
                    ) : null}
                    {entry.wasIstNeu ? (
                      <p className="mt-3 text-sm leading-6">
                        <strong>Neu:</strong> {entry.wasIstNeu}
                      </p>
                    ) : null}
                    {entry.relevanz ? (
                      <p className="mt-3 text-sm leading-6">
                        <strong>Relevanz:</strong> {entry.relevanz}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
                      <span>
                        Ereignis: {formatCalendarDate(entry.ereignisDatum)}
                      </span>
                      <span>·</span>
                      <span>
                        Erfasst: {formatCalendarDate(entry.erfasstAm)}
                      </span>
                      {sourceUrl ? (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto font-medium text-[#31443f]"
                        >
                          {entry.quelleName || 'Quelle'} ↗
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="py-6 text-sm text-muted-foreground">
                An diesem Tag gibt es keinen Eintrag.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingEntry !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEntry(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-[#f8f4ed] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-3xl">
              News bearbeiten
            </DialogTitle>
            <DialogDescription>
              Die Änderung wird im Masterbrain gespeichert und bleibt bei der
              nächsten Synchronisierung nachvollziehbar.
            </DialogDescription>
          </DialogHeader>
          {editingEntry ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">
                Thema
                <Input
                  className="bg-white text-foreground"
                  value={editingEntry.thema}
                  onChange={(event) =>
                    setEditingEntry({
                      ...editingEntry,
                      thema: event.target.value,
                    })
                  }
                />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                Kategorie
                <Input
                  className="bg-white text-foreground"
                  value={editingEntry.kategorie}
                  onChange={(event) =>
                    setEditingEntry({
                      ...editingEntry,
                      kategorie: event.target.value,
                    })
                  }
                />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                Ereignisdatum
                <Input
                  type="date"
                  className="bg-white text-foreground"
                  value={editingEntry.ereignisDatum}
                  onChange={(event) =>
                    setEditingEntry({
                      ...editingEntry,
                      ereignisDatum: event.target.value,
                    })
                  }
                />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                Organisation
                <Input
                  className="bg-white text-foreground"
                  value={editingEntry.organisation || ''}
                  onChange={(event) =>
                    setEditingEntry({
                      ...editingEntry,
                      organisation: event.target.value,
                    })
                  }
                />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                Ort
                <Input
                  className="bg-white text-foreground"
                  value={editingEntry.ort || ''}
                  onChange={(event) =>
                    setEditingEntry({
                      ...editingEntry,
                      ort: event.target.value,
                    })
                  }
                />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">
                Zusammenfassung
                <Textarea
                  className="bg-white text-foreground"
                  value={editingEntry.zusammenfassung || ''}
                  onChange={(event) =>
                    setEditingEntry({
                      ...editingEntry,
                      zusammenfassung: event.target.value,
                    })
                  }
                />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">
                Was ist neu?
                <Textarea
                  className="bg-white text-foreground"
                  value={editingEntry.wasIstNeu || ''}
                  onChange={(event) =>
                    setEditingEntry({
                      ...editingEntry,
                      wasIstNeu: event.target.value,
                    })
                  }
                />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">
                Quelle
                <Input
                  type="url"
                  className="bg-white text-foreground"
                  value={editingEntry.quelleUrl || ''}
                  onChange={(event) =>
                    setEditingEntry({
                      ...editingEntry,
                      quelleUrl: event.target.value,
                    })
                  }
                />
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => void saveCalendarEntry()}
              disabled={savingEntry}
            >
              {savingEntry ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}{' '}
              Speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function InventoryHub({
  connected,
  email,
  password,
  setEmail,
  setPassword,
  connect,
  loading,
  items,
  search,
  setSearch,
  refresh,
  createListing,
}: {
  connected: boolean;
  email: string;
  password: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  connect: () => void;
  loading: boolean;
  items: InventoryItem[];
  search: string;
  setSearch: (value: string) => void;
  refresh: () => void | Promise<boolean>;
  createListing: (item: InventoryItem) => void;
}) {
  const filtered = items.filter((item) =>
    [item.modelName, item.productType, item.sku, item.material]
      .join(' ')
      .toLocaleLowerCase('de')
      .includes(search.trim().toLocaleLowerCase('de')),
  );
  const complete = items.filter((item) => item.complete).length;
  const stock = items.reduce((sum, item) => sum + item.stockQuantity, 0);
  return (
    <div className="mx-auto max-w-[1320px] px-5 py-7 md:px-8 md:py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            Live verbunden
          </p>
          <h1 className="font-heading text-4xl leading-none md:text-5xl">
            Inventar
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Artikel, Bestand und Produktionskosten sind direkt im Masterbrain.
            Ein Dateiimport ist nicht mehr nötig.
          </p>
        </div>
        {connected ? (
          <Button
            variant="outline"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw
              className={'size-4 ' + (loading ? 'animate-spin' : '')}
            />
            Aktualisieren
          </Button>
        ) : null}
      </div>

      {!connected ? (
        <section className="mt-7 max-w-2xl rounded-[26px] border bg-white/65 p-6 md:p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 text-[var(--fp-primary)]" />
            <div>
              <h2 className="font-heading text-2xl">
                Einmal als Admin anmelden
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Verwende dein bestehendes FormPoesie-Konto. Das Passwort wird
                nur an die bestehende Anmeldung übertragen und nicht im
                Masterbrain gespeichert.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Input
              type="email"
              autoComplete="username"
              placeholder="E-Mail-Adresse"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Passwort"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Button
            className="mt-3"
            onClick={connect}
            disabled={loading || !email || !password}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            Inventar verbinden
          </Button>
        </section>
      ) : (
        <>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white/60 p-4">
              <div className="text-3xl font-semibold">{items.length}</div>
              <div className="mt-1 text-sm text-muted-foreground">Artikel</div>
            </div>
            <div className="rounded-2xl border bg-white/60 p-4">
              <div className="text-3xl font-semibold">{complete}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Produktionsdaten vollständig
              </div>
            </div>
            <div className="rounded-2xl border bg-white/60 p-4">
              <div className="text-3xl font-semibold">{stock}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Stück im Bestand
              </div>
            </div>
          </div>
          <div className="relative mt-6">
            <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              className="bg-white pl-9"
              placeholder={'In ' + items.length + ' Artikeln suchen'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {filtered.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border bg-white/62 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--fp-mist)]">
                    <Package className="size-5 text-[var(--fp-primary)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium">{item.modelName}</h2>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {[item.productType, item.sku].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      item.complete
                        ? 'border-[var(--fp-primary)]/40'
                        : 'border-[var(--fp-accent)]/55'
                    }
                  >
                    {item.complete ? 'vollständig' : 'offen'}
                  </Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Material</dt>
                    <dd className="mt-1 truncate">
                      {item.material || 'offen'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Druckzeit</dt>
                    <dd className="mt-1">
                      {item.printHours == null
                        ? 'offen'
                        : item.printHours.toLocaleString('de-DE', {
                            maximumFractionDigits: 2,
                          }) + ' h'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Kosten</dt>
                    <dd className="mt-1">
                      {money(item.productionCost || undefined)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Bestand</dt>
                    <dd className="mt-1">{item.stockQuantity}</dd>
                  </div>
                </dl>
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={() => createListing(item)}
                >
                  <Sparkles className="size-4" /> Etsy-Entwurf erstellen
                </Button>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CatalogHub() {
  const catalogs = [
    [
      'Halloween',
      'Dunkle Figuren, saisonale Dekoration und Sammlerstücke',
      'https://canva.link/bhydat1tgwdhp8y',
    ],
    [
      'Mythen & Entdeckungen',
      'Personen zwischen Geschichte, Mythos und Entdeckung',
      'https://canva.link/efn8yiifg9czwr7',
    ],
    [
      'Denker, Dichter & Erfinder',
      'Ideen, Literatur und große Erfindungen',
      'https://canva.link/3at0ic05gbe1z2j',
    ],
    [
      'Bild & Kunst',
      'Künstlerinnen, Künstler und Werke',
      'https://canva.link/rjbeb4yz5c64cps',
    ],
    [
      'Bühne, Film & Populärkultur',
      'Ikonen aus Bühne, Film und Popkultur',
      'https://canva.link/bvx7z86dmrj4hns',
    ],
  ];
  return (
    <div className="mx-auto max-w-[1220px] px-5 py-7 md:px-8 md:py-10">
      <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
        Öffentliche Produktwelten vorbereiten
      </p>
      <h1 className="mt-2 font-heading text-4xl md:text-5xl">Kataloge</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        Die bestehenden Canva-Kataloge bleiben erreichbar. Diese Übersicht ist
        bereits so gegliedert, dass später freigegebene Katalogdaten und eine
        öffentliche Suche ergänzt werden können.
      </p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {catalogs.map(([title, description, href], index) => (
          <a
            key={title}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="group flex min-h-52 flex-col justify-between overflow-hidden rounded-[26px] border bg-white/65 p-5 transition hover:-translate-y-1 hover:bg-white"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-[var(--fp-mist)]">
                  <BookOpen className="size-5" />
                </span>
                <span className="font-heading text-4xl text-[var(--fp-sand)]">
                  0{index + 1}
                </span>
              </div>
              <h2 className="mt-5 font-heading text-2xl leading-tight">
                {title}
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            </div>
            <span className="mt-5 flex items-center gap-2 text-sm font-medium text-[var(--fp-primary)]">
              Katalog öffnen <ExternalLink className="size-4" />
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function OrderFormHub() {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-[900px] place-items-center px-5 py-10">
      <section className="w-full overflow-hidden rounded-[30px] border bg-white/70 p-6 md:p-10">
        <span className="grid size-12 place-items-center rounded-2xl bg-[var(--fp-mist)]">
          <ShoppingCart className="size-6 text-[var(--fp-primary)]" />
        </span>
        <p className="mt-7 text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
          Bestellungen & Marktanfragen
        </p>
        <h1 className="mt-2 font-heading text-4xl md:text-5xl">
          Bestellformular
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          Das bestehende Formular ist der zentrale Eingang für individuelle
          Bestellungen. Verkäufe aus diesem Kanal werden in der allgemeinen
          Kasse als „Bestellformular“ geführt.
        </p>
        <a
          href="https://formpoesie-marktanfrage.ma-sti.chatgpt.site/"
          target="_blank"
          rel="noreferrer"
          className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--fp-ink)] px-5 text-sm font-medium text-white"
        >
          Formular öffnen <ExternalLink className="size-4" />
        </a>
      </section>
    </div>
  );
}

function AccountsHub({ onInventory }: { onInventory: () => void }) {
  const [items, setItems] = useState<AccountItem[]>([]);
  const [encryptedSecrets, setEncryptedSecrets] = useState<EncryptedSecret[]>(
    [],
  );
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [vaultValues, setVaultValues] = useState<Record<string, string>>({});
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultMessage, setVaultMessage] = useState('');
  const [monitoring, setMonitoring] = useState(false);
  const [monitorMessage, setMonitorMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void Promise.all([fetch('/api/accounts'), fetch('/api/account-secrets')])
      .then(async ([accountsResponse, secretsResponse]) => {
        const accounts = (await accountsResponse.json()) as {
          items?: AccountItem[];
          error?: string;
        };
        const secrets = (await secretsResponse.json()) as {
          secrets?: EncryptedSecret[];
          error?: string;
        };
        if (!accountsResponse.ok)
          throw new Error(
            accounts.error || 'Konten konnten nicht geladen werden.',
          );
        if (!secretsResponse.ok)
          throw new Error(
            secrets.error || 'Passwort-Tresor konnte nicht geladen werden.',
          );
        setItems(accounts.items || []);
        setEncryptedSecrets(secrets.secrets || []);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : 'Konten konnten nicht geladen werden.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function update(id: string, key: keyof AccountItem, value: string | boolean) {
    setSaved(false);
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    );
  }

  async function save() {
    const response = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    setSaved(response.ok);
    if (!response.ok) setError('Konten konnten nicht gespeichert werden.');
  }

  async function unlockVault() {
    if (!vaultPassphrase) return;
    setVaultMessage('');
    try {
      const decrypted = Object.fromEntries(
        await Promise.all(
          encryptedSecrets.map(async (secret) => [
            secret.accountId,
            await decryptVaultSecret(secret, vaultPassphrase),
          ]),
        ),
      );
      setVaultValues(decrypted);
      setVaultUnlocked(true);
      setVaultMessage(
        encryptedSecrets.length
          ? 'Tresor entsperrt.'
          : 'Neuer Tresor bereit. Hinterlege jetzt die Passwörter.',
      );
    } catch {
      setVaultUnlocked(false);
      setVaultValues({});
      setVaultMessage('Tresor-Code ist nicht korrekt.');
    }
  }

  async function saveSecret(accountId: string) {
    const value = vaultValues[accountId] || '';
    if (!vaultUnlocked || !vaultPassphrase || !value) return;
    const secret = await encryptVaultSecret(accountId, value, vaultPassphrase);
    const response = await fetch('/api/account-secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret }),
    });
    if (!response.ok) {
      setVaultMessage('Passwort konnte nicht gespeichert werden.');
      return;
    }
    setEncryptedSecrets((current) => [
      ...current.filter((item) => item.accountId !== accountId),
      secret,
    ]);
    setVaultMessage('Passwort verschlüsselt gespeichert.');
  }

  async function checkDesigners() {
    setMonitoring(true);
    setMonitorMessage('');
    await save();
    const response = await fetch('/api/designer-monitor', { method: 'POST' });
    const result = (await response.json()) as {
      checked?: number;
      results?: Array<{ changed?: boolean; status?: string; error?: string }>;
      error?: string;
    };
    if (!response.ok) {
      setMonitorMessage(result.error || 'Designer-Prüfung fehlgeschlagen.');
    } else {
      const refreshed = await fetch('/api/accounts');
      const accounts = (await refreshed.json()) as { items?: AccountItem[] };
      setItems(accounts.items || items);
      const changed = (result.results || []).filter(
        (item) => item.changed,
      ).length;
      const failed = (result.results || []).filter(
        (item) => item.status === 'failed',
      ).length;
      setMonitorMessage(
        failed
          ? `${result.checked || 0} Profile geprüft · ${failed} fehlgeschlagen`
          : `${result.checked || 0} Profile geprüft · ${changed} neue Änderungen`,
      );
    }
    setMonitoring(false);
  }

  function addDesigner() {
    setItems((current) => [
      ...current,
      {
        id: 'designer-' + crypto.randomUUID(),
        group: 'license-monitor',
        name: '',
        profileUrl: '',
        note: 'MakerWorld',
        licensed: false,
        monthlyPrice: '',
        monitoringEnabled: true,
      },
    ]);
  }

  if (loading)
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  if (error && !items.length)
    return (
      <div className="mx-auto max-w-2xl px-5 py-12 md:px-8">
        <section className="rounded-[26px] border bg-white/65 p-7 text-center">
          <ShieldCheck className="mx-auto size-8 text-[var(--fp-primary)]" />
          <h1 className="mt-4 font-heading text-3xl">
            Admin-Anmeldung erforderlich
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Konten und Laufzeiten sind geschützt und erst nach der
            Inventar-Anmeldung sichtbar.
          </p>
          <Button className="mt-5" onClick={onInventory}>
            Zum Admin-Login
          </Button>
        </section>
      </div>
    );

  const subscriptions = items.filter((item) => item.group === 'subscription');
  const social = items.filter((item) => item.group === 'social');
  const designers = items.filter((item) => item.group === 'license-monitor');
  const subscriptionCard = (item: AccountItem) => (
    <div
      key={item.id}
      className="grid gap-3 rounded-2xl border bg-white/55 p-4 sm:grid-cols-[1fr_170px]"
    >
      <div>
        <div className="flex items-center gap-2 font-medium">
          {item.name}
          {safeExternalUrl(item.url) ? (
            <a
              href={safeExternalUrl(item.url)}
              target="_blank"
              rel="noreferrer"
              aria-label={item.name + ' öffnen'}
              className="text-[var(--fp-primary)]"
            >
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={Boolean(item.ongoing)}
            onChange={(event) =>
              update(item.id, 'ongoing', event.target.checked)
            }
          />
          laufend
        </label>
      </div>
      <select
        aria-label={'Status ' + item.name}
        value={item.status || 'active'}
        onChange={(event) => update(item.id, 'status', event.target.value)}
        className="h-9 rounded-lg border bg-white px-3 text-sm"
      >
        <option value="active">Laufend</option>
        <option value="cancelled">Gekündigt</option>
      </select>
      <Input
        type="date"
        aria-label={'Laufzeit ' + item.name}
        disabled={item.ongoing}
        value={item.expiresAt || ''}
        onChange={(event) => update(item.id, 'expiresAt', event.target.value)}
      />
      <Input
        type="url"
        aria-label={'Webseite ' + item.name}
        placeholder="Direkter Anbieterlink"
        value={item.url || ''}
        onChange={(event) => update(item.id, 'url', event.target.value)}
      />
    </div>
  );
  return (
    <div className="mx-auto max-w-[1220px] px-5 py-7 md:px-8 md:py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            Geschützter Adminbereich
          </p>
          <h1 className="font-heading text-4xl leading-none md:text-5xl">
            Konten & Abos
          </h1>
        </div>
        <Button onClick={() => void save()}>
          {saved ? <Check className="size-4" /> : null} Änderungen speichern
        </Button>
      </div>
      <div className="mt-7 grid gap-5 xl:grid-cols-2">
        <section className="rounded-[26px] border bg-white/65 p-5 md:p-6">
          <h2 className="font-heading text-2xl">Abos</h2>
          <div className="mt-4 space-y-3">
            <p className="text-xs font-semibold tracking-[.1em] text-muted-foreground uppercase">
              Laufend
            </p>
            {subscriptions
              .filter((item) => item.status !== 'cancelled')
              .map(subscriptionCard)}
            {subscriptions.some((item) => item.status === 'cancelled') ? (
              <>
                <p className="pt-3 text-xs font-semibold tracking-[.1em] text-muted-foreground uppercase">
                  Gekündigt · Historie
                </p>
                {subscriptions
                  .filter((item) => item.status === 'cancelled')
                  .map(subscriptionCard)}
              </>
            ) : null}
          </div>
        </section>
        <section className="rounded-[26px] border bg-white/65 p-5 md:p-6">
          <h2 className="font-heading text-2xl">Social-Media-Profile</h2>
          <div className="mt-4 space-y-3">
            {social.map((item) => (
              <div key={item.id} className="rounded-2xl border bg-white/55 p-4">
                <div className="flex items-center gap-2 font-medium">
                  {item.name}
                  {safeExternalUrl(item.url) ? (
                    <a
                      href={safeExternalUrl(item.url)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={item.name + ' öffnen'}
                      className="text-[var(--fp-primary)]"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Input
                    aria-label={'Benutzername ' + item.name}
                    placeholder="Benutzername"
                    value={item.username || ''}
                    onChange={(event) =>
                      update(item.id, 'username', event.target.value)
                    }
                  />
                  <Input
                    aria-label={'E-Mail ' + item.name}
                    type="email"
                    placeholder="Login-E-Mail"
                    value={item.email || ''}
                    onChange={(event) =>
                      update(item.id, 'email', event.target.value)
                    }
                  />
                  <Input
                    aria-label={'Webseite ' + item.name}
                    type="url"
                    placeholder="Direkter Anbieterlink"
                    className="sm:col-span-2"
                    value={item.url || ''}
                    onChange={(event) =>
                      update(item.id, 'url', event.target.value)
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-[26px] border bg-white/65 p-5 md:p-6">
        <div className="flex items-start gap-3">
          <Lock className="mt-1 size-5 text-[var(--fp-primary)]" />
          <div className="flex-1">
            <h2 className="font-heading text-2xl">Separater Passwort-Tresor</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Die Passwörter werden im Browser verschlüsselt. Der Tresor-Code
              wird weder übertragen noch gespeichert und kann nicht
              wiederhergestellt werden.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Tresor-Code"
            value={vaultPassphrase}
            onChange={(event) => setVaultPassphrase(event.target.value)}
            disabled={vaultUnlocked}
          />
          {vaultUnlocked ? (
            <Button
              variant="outline"
              onClick={() => {
                setVaultUnlocked(false);
                setVaultPassphrase('');
                setVaultValues({});
                setVaultMessage('Tresor gesperrt.');
              }}
            >
              <Lock className="size-4" /> Sperren
            </Button>
          ) : (
            <Button
              onClick={() => void unlockVault()}
              disabled={!vaultPassphrase}
            >
              <ShieldCheck className="size-4" /> Entsperren
            </Button>
          )}
        </div>
        {vaultMessage ? (
          <p className="mt-2 text-xs text-muted-foreground">{vaultMessage}</p>
        ) : null}
        {vaultUnlocked ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {[...subscriptions, ...social].map((item) => (
              <div key={item.id} className="rounded-2xl border bg-white/55 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{item.name}</span>
                  <Badge variant="outline">
                    {encryptedSecrets.some(
                      (secret) => secret.accountId === item.id,
                    )
                      ? 'verschlüsselt gespeichert'
                      : 'noch leer'}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="Passwort"
                    value={vaultValues[item.id] || ''}
                    onChange={(event) =>
                      setVaultValues((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    variant="outline"
                    onClick={() => void saveSecret(item.id)}
                    disabled={!vaultValues[item.id]}
                  >
                    Speichern
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section className="mt-5 rounded-[26px] border bg-white/65 p-5 md:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-heading text-2xl">
              Lizenz-Designer beobachten
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              MakerWorld- und Patreon-Profile für Benachrichtigungen bei neuen
              Modellen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void checkDesigners()}
              disabled={monitoring || !designers.length}
            >
              <RefreshCw
                className={'size-4 ' + (monitoring ? 'animate-spin' : '')}
              />{' '}
              Jetzt prüfen
            </Button>
            <Button variant="outline" onClick={addDesigner}>
              <Plus className="size-4" /> Designer hinzufügen
            </Button>
          </div>
        </div>
        {monitorMessage ? (
          <p className="mt-3 text-sm text-muted-foreground">{monitorMessage}</p>
        ) : null}
        <div className="mt-4 space-y-3">
          {designers.map((item) => (
            <div key={item.id} className="rounded-2xl border bg-white/55 p-4">
              <div className="grid gap-2 md:grid-cols-[140px_1fr_2fr_auto]">
                <select
                  value={item.note || 'MakerWorld'}
                  onChange={(event) =>
                    update(item.id, 'note', event.target.value)
                  }
                  className="h-9 rounded-lg border bg-white px-3 text-sm"
                >
                  <option>MakerWorld</option>
                  <option>Patreon</option>
                </select>
                <Input
                  placeholder="Designername"
                  value={item.name}
                  onChange={(event) =>
                    update(item.id, 'name', event.target.value)
                  }
                />
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="Profil-URL"
                    value={item.profileUrl || ''}
                    onChange={(event) =>
                      update(item.id, 'profileUrl', event.target.value)
                    }
                  />
                  {safeExternalUrl(item.profileUrl) ? (
                    <a
                      href={safeExternalUrl(item.profileUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Profil öffnen"
                      >
                        <ExternalLink className="size-4" />
                      </Button>
                    </a>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Designer entfernen"
                  onClick={() =>
                    setItems((current) =>
                      current.filter((candidate) => candidate.id !== item.id),
                    )
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex items-center gap-2 rounded-xl border bg-white p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(item.monitoringEnabled)}
                    onChange={(event) =>
                      update(item.id, 'monitoringEnabled', event.target.checked)
                    }
                  />
                  Überwachung aktiv
                </label>
                <label className="flex items-center gap-2 rounded-xl border bg-white p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(item.licensed)}
                    onChange={(event) =>
                      update(item.id, 'licensed', event.target.checked)
                    }
                  />
                  Lizenz vorhanden
                </label>
                <Input
                  type="date"
                  aria-label="Lizenz gültig bis"
                  disabled={!item.licensed}
                  value={item.licensed ? item.licenseExpiresAt || '' : ''}
                  onChange={(event) =>
                    update(item.id, 'licenseExpiresAt', event.target.value)
                  }
                />
                <Input
                  inputMode="decimal"
                  aria-label="Lizenzpreis pro Monat"
                  placeholder="Preis pro Monat in €"
                  value={item.monthlyPrice || ''}
                  onChange={(event) =>
                    update(item.id, 'monthlyPrice', event.target.value)
                  }
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">
                  {item.lastStatus === 'success'
                    ? 'Prüfung erfolgreich'
                    : item.lastStatus === 'failed'
                      ? 'Prüfung fehlgeschlagen'
                      : 'Noch nicht geprüft'}
                </Badge>
                <span>
                  Letzte Prüfung:{' '}
                  {item.lastCheckedAt
                    ? new Intl.DateTimeFormat('de-DE', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(item.lastCheckedAt))
                    : 'ausstehend'}
                </span>
                {item.lastHeadline ? (
                  <span>· Zuletzt erkannt: {item.lastHeadline}</span>
                ) : null}
                {item.lastStatus === 'failed' && item.lastError ? (
                  <span className="text-red-700">· {item.lastError}</span>
                ) : null}
              </div>
            </div>
          ))}
          {!designers.length ? (
            <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
              Noch keine Profile hinterlegt. Nach dem Eintragen kann der
              tägliche Monitor aktiviert werden.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function TrashBin({
  rows,
  onRestore,
}: {
  rows: ProductRow[];
  onRestore: (row: ProductRow) => void;
}) {
  return (
    <div className="mx-auto max-w-[1000px] px-5 py-7 md:px-8 md:py-10">
      <p className="mb-2 text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
        Rückgängig machbar
      </p>
      <h1 className="font-heading text-4xl leading-none md:text-5xl">
        Papierkorb
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Gelöschte Entwürfe bleiben mit Bildern und Texten erhalten.
      </p>
      <div className="mt-7 space-y-3">
        {rows.map((row) => (
          <article
            key={row.id}
            className="flex items-center gap-4 rounded-2xl border bg-white/65 p-4"
          >
            <div className="grid size-11 place-items-center rounded-xl bg-[var(--fp-mist)]">
              <Trash2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-medium">{row.model_name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.product_type}
              </p>
            </div>
            <Button variant="outline" onClick={() => onRestore(row)}>
              <RotateCcw className="size-4" /> Wiederherstellen
            </Button>
          </article>
        ))}
        {!rows.length ? (
          <div className="rounded-2xl border border-dashed bg-white/35 p-10 text-center text-sm text-muted-foreground">
            Der Papierkorb ist leer.
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ActivityEvent = {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  sourceUrl?: string;
  occurredAt: string;
  productId?: string;
  calendarEntryId?: string;
  imageUrl?: string;
  imageAlt?: string;
};

function newsImageUrl(value?: string) {
  if (!value) return '';
  if (value.startsWith('assets/images/'))
    return `https://formpoesie.github.io/formpoesie-themen-kalender/${value}`;
  return safeExternalUrl(value);
}

function DailyNewsFeed({
  onCalendar,
  onProduct,
}: {
  onCalendar: (entryId?: string) => void;
  onProduct: (productId: string) => void;
}) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [automation, setAutomation] = useState<Record<string, string>>({});
  const [feedError, setFeedError] = useState('');

  useEffect(() => {
    void fetch('/api/calendar?sync=auto')
      .then(() => fetch('/api/activity'))
      .then(async (response) => {
        const result = (await response.json()) as {
          events?: ActivityEvent[];
          automation?: Record<string, string>;
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            result.error || 'Tagesnews konnten nicht geladen werden.',
          );
        setEvents(result.events || []);
        setAutomation(result.automation || {});
      })
      .catch((reason: unknown) =>
        setFeedError(
          reason instanceof Error
            ? reason.message
            : 'Tagesnews nicht erreichbar.',
        ),
      );
  }, []);

  return (
    <section className="mt-6 overflow-hidden rounded-[28px] border bg-white/65">
      <div className="flex flex-col justify-between gap-3 border-b p-5 sm:flex-row sm:items-center md:px-7">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            <RefreshCw className="size-3.5" /> Tägliche Automationen
          </div>
          <h2 className="mt-2 font-heading text-2xl">Heute im Masterbrain</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-white">
            <StatusDot ok={automation.automation_status === 'ACTIVE'} />
            {automation.automation_status === 'ACTIVE'
              ? 'Automation aktiv'
              : 'Status wird geprüft'}
          </Badge>
          <Button variant="outline" onClick={() => onCalendar()}>
            Kalender öffnen
          </Button>
        </div>
      </div>
      <div>
        <div className="divide-y">
          {events.slice(0, 6).map((event) => {
            const imageUrl = newsImageUrl(event.imageUrl);
            return (
              <article
                key={event.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center md:px-7"
              >
                {imageUrl ? (
                  <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-xl bg-[var(--fp-mist)] sm:w-32">
                    <Image
                      src={imageUrl}
                      alt={event.imageAlt || ''}
                      fill
                      unoptimized
                      sizes="(max-width: 640px) 100vw, 128px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--fp-mist)]">
                    {event.kind === 'designer-model' ||
                    event.kind === 'model-of-month' ? (
                      <Package className="size-4" />
                    ) : (
                      <CalendarDays className="size-4" />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {event.kind === 'model-of-month' && event.productId ? (
                    <button
                      type="button"
                      className="font-medium underline decoration-[var(--fp-primary)]/35 underline-offset-4 hover:decoration-[var(--fp-primary)]"
                      onClick={() => onProduct(event.productId || '')}
                    >
                      {event.title}
                    </button>
                  ) : (
                    <div className="font-medium">{event.title}</div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {[
                      event.detail,
                      new Intl.DateTimeFormat('de-DE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(event.occurredAt)),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                {event.kind === 'calendar-news' && event.calendarEntryId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => onCalendar(event.calendarEntryId || '')}
                  >
                    Zusammenfassung
                  </Button>
                ) : safeExternalUrl(event.sourceUrl) ? (
                  <a
                    href={safeExternalUrl(event.sourceUrl)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Quelle öffnen"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                ) : event.kind === 'model-of-month' && event.productId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => onProduct(event.productId || '')}
                  >
                    Artikel öffnen
                  </Button>
                ) : null}
              </article>
            );
          })}
          {!events.length ? (
            <p className="p-6 text-sm text-muted-foreground">
              {feedError ||
                'Heute gibt es noch keine neuen News oder Designer-Modelle.'}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type DashboardFulfillmentRow = Record<string, unknown>;

function dashboardText(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback;
}

function DashboardFulfillment() {
  const [items, setItems] = useState<DashboardFulfillmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const response = await fetch('/api/inventory/workspace?area=online');
    const result = (await response.json()) as {
      onlineSales?: DashboardFulfillmentRow[];
      fulfillmentTasks?: DashboardFulfillmentRow[];
      error?: string;
    };
    if (!response.ok) {
      setError(result.error || 'Druck- und Versandaufgaben nicht erreichbar.');
      setLoading(false);
      return;
    }
    setItems(
      [
        ...(result.onlineSales || []),
        ...(result.fulfillmentTasks || []),
      ].filter((item) => item.isPrinted !== true || item.isShipped !== true),
    );
    setError('');
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  async function toggle(
    item: DashboardFulfillmentRow,
    key: 'isPrinted' | 'isShipped',
  ) {
    const response = await fetch('/api/inventory/workspace', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity:
          item.sourceType === 'cash-sale'
            ? 'fulfillment_tasks'
            : 'online_sales',
        id: item.id,
        values: { [key]: item[key] !== true },
      }),
    });
    if (!response.ok) {
      setError('Status konnte nicht gespeichert werden.');
      return;
    }
    await load();
  }

  const openPrint = items.filter((item) => item.isPrinted !== true).length;
  const openShipping = items.filter(
    (item) =>
      item.isShipped !== true &&
      item.shippingMethod !== 'abholung' &&
      item.fulfillmentMode !== 'pickup',
  ).length;

  return (
    <details className="group mt-6 rounded-[24px] border bg-white/60 open:bg-white/75">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5 md:px-6">
        <span className="grid size-10 place-items-center rounded-xl bg-[var(--fp-mist)]">
          <Truck className="size-5 text-[var(--fp-primary)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-xl">Druck & Versand</span>
          <span className="block text-xs text-muted-foreground">
            {loading
              ? 'Aufgaben werden geladen …'
              : `${openPrint} zu drucken · ${openShipping} zu versenden`}
          </span>
        </span>
        <Badge>{items.length}</Badge>
        <span className="text-sm transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="space-y-2 border-t p-4 md:px-6">
        {items.map((item) => {
          const name = dashboardText(
            item.articleName || item.productName,
            'Verkaufter Artikel',
          );
          const pickup =
            item.shippingMethod === 'abholung' ||
            item.fulfillmentMode === 'pickup';
          return (
            <article
              key={String(item.id)}
              className="flex flex-col gap-3 rounded-xl border bg-white/65 p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[item.variantName, item.shippingRecipient, item.saleDate]
                    .map((value) => dashboardText(value))
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={item.isPrinted === true ? 'default' : 'outline'}
                  onClick={() => void toggle(item, 'isPrinted')}
                >
                  {item.isPrinted === true ? 'Gedruckt' : 'Druck offen'}
                </Button>
                <Button
                  size="sm"
                  variant={item.isShipped === true ? 'default' : 'outline'}
                  onClick={() => void toggle(item, 'isShipped')}
                >
                  {item.isShipped === true
                    ? pickup
                      ? 'Abgeholt'
                      : 'Versendet'
                    : pickup
                      ? 'Abholung offen'
                      : 'Versand offen'}
                </Button>
              </div>
            </article>
          );
        })}
        {!loading && !items.length ? (
          <p className="py-3 text-sm text-muted-foreground">
            Aktuell sind keine verkauften Artikel zu drucken oder zu versenden.
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    </details>
  );
}

function _EtsyWorkflowHub({
  products,
  onOpen,
  onStart,
  onDelete,
}: {
  products: ProductRow[];
  onOpen: (row: ProductRow, step: string) => void;
  onStart: () => void;
  onDelete: (row: ProductRow) => void;
}) {
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
              Entwurf, Keyword-Recherche und Bildstudio gehören zu einem Produkt
              und bleiben hier als ein durchgängiger Ablauf zusammen.
            </p>
          </div>
          <Button onClick={onStart}>
            <Sparkles className="size-4" /> Workflow starten
          </Button>
        </div>
        <div className="mt-7 grid gap-3 md:grid-cols-3">
          {[
            [FilePenLine, 'Entwürfe', 'Fakten, Texte, Preis und Prüfung'],
            [Search, 'Recherche', 'Keywords, Markt und Wettbewerb'],
            [
              ImageIcon,
              'Bildstudio',
              'Originale und vollständige Etsy-Bildserie',
            ],
          ].map(([Icon, title, detail]) => (
            <div
              key={String(title)}
              className="rounded-2xl border bg-[var(--fp-paper)]/65 p-4"
            >
              <Icon className="size-5 text-[var(--fp-primary)]" />
              <div className="mt-3 font-medium">{String(title)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {String(detail)}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="rounded-2xl border bg-white/70 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--fp-mist)]">
                  {product.asset_id || product.image_path ? (
                    <Image
                      src={
                        product.asset_id
                          ? '/api/assets?id=' +
                            encodeURIComponent(product.asset_id)
                          : '/api/inventory/image?path=' +
                            encodeURIComponent(product.image_path || '')
                      }
                      alt={product.model_name}
                      fill
                      unoptimized
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <Sparkles className="size-5" />
                  )}
                </span>
                <Badge variant="outline">
                  {product.status === 'draft' ? 'Entwurf' : product.status}
                </Badge>
              </div>
              <h2 className="mt-5 font-heading text-2xl leading-tight">
                {product.model_name}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {[product.product_type, product.buyer_world]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="mt-2 text-xs font-medium text-[var(--fp-primary)]">
                {product.variant_count || 1}{' '}
                {(product.variant_count || 1) === 1 ? 'Variante' : 'Varianten'}
                {' · '}
                {product.asset_count || 0}{' '}
                {(product.asset_count || 0) === 1 ? 'Bild' : 'Bilder'}
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpen(product, 'fakten')}
                >
                  <FilePenLine className="size-3.5" /> Entwurf
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpen(product, 'recherche')}
                >
                  <Search className="size-3.5" /> Recherche
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpen(product, 'bilder')}
                >
                  <ImageIcon className="size-3.5" /> Bilder
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3 w-full text-muted-foreground hover:text-[#8b453a]"
                onClick={() => onDelete(product)}
              >
                <Trash2 className="size-3.5" /> In den Papierkorb
              </Button>
            </article>
          ))}
        </div>
        {!products.length ? (
          <div className="mt-7 rounded-2xl border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Noch kein Etsy-Entwurf vorhanden. Lege ihn aus einem
              Inventarartikel an.
            </p>
            <Button className="mt-4" onClick={onStart}>
              Inventarartikel auswählen
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function WeeklySuccesses({ enabled }: { enabled: boolean }) {
  const [stats, setStats] = useState<{
    pieces: number;
    revenue: number;
    top: string;
    topCount: number;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void fetch('/api/inventory/workspace?area=sales')
      .then(
        async (response) =>
          (await response.json()) as {
            sales?: Record<string, unknown>[];
            onlineSales?: Record<string, unknown>[];
          },
      )
      .then((data) => {
        const now = new Date();
        const day = (now.getDay() + 6) % 7;
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - day);
        const inWeek = (value: unknown) => {
          const date = new Date(String(value));
          return (
            Number.isFinite(date.getTime()) && date >= start && date <= now
          );
        };
        const sales = (data.sales || []).filter(
          (sale) => sale.isCancelled !== true && inWeek(sale.date),
        );
        const online = (data.onlineSales || []).filter((sale) =>
          inWeek(sale.date),
        );
        let pieces = 0;
        let revenue = 0;
        const counts = new Map<string, number>();
        for (const sale of sales) {
          const items = Array.isArray(sale.items)
            ? (sale.items as Record<string, unknown>[])
            : [];
          let itemRevenue = 0;
          for (const item of items) {
            const quantity = Number(item.quantity || 0);
            pieces += quantity;
            itemRevenue += quantity * Number(item.unitSalePriceCents || 0);
            const variant = (item.articleVariant || {}) as Record<
              string,
              unknown
            >;
            const article = (variant.article || {}) as Record<string, unknown>;
            const name = dashboardText(article.name, 'Artikel');
            counts.set(name, (counts.get(name) || 0) + quantity);
          }
          revenue +=
            sale.pricingMode === 'TOTAL'
              ? Number(sale.totalPriceCents || 0)
              : itemRevenue - Number(sale.discountCents || 0);
        }
        for (const sale of online) {
          const quantity = Math.max(0, Number(sale.quantity || 1));
          const name = dashboardText(sale.articleName, 'Online-Artikel');
          pieces += quantity;
          revenue += quantity * Number(sale.salePriceCents || 0);
          counts.set(name, (counts.get(name) || 0) + quantity);
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        setStats({
          pieces,
          revenue,
          top: top?.[0] || 'Noch kein Verkauf',
          topCount: top?.[1] || 0,
        });
      });
  }, [enabled]);

  if (!enabled) return null;
  const cards = [
    [stats?.pieces ?? '…', 'verkaufte Artikel diese Woche'],
    [stats ? money(stats.revenue / 100) : '…', 'Umsatz diese Woche'],
    [
      stats?.top || '…',
      stats
        ? `${stats.topCount} Stück · stärkster Artikel`
        : 'stärkster Artikel',
    ],
  ];
  return (
    <section className="mt-7">
      <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
        Erfolge
      </p>
      <h2 className="mt-1 font-heading text-3xl">Diese Woche</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([value, label]) => (
          <div
            key={String(label)}
            className="rounded-2xl border bg-white/65 p-5"
          >
            <div className="truncate text-2xl font-semibold">{value}</div>
            <div className="mt-2 text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Dashboard({
  onCalendar,
  onInventoryProduct,
  canManage,
}: {
  onCalendar: (entryId?: string) => void;
  onInventoryProduct: (productId: string) => void;
  canManage: boolean;
}) {
  return (
    <div className="mx-auto max-w-[1220px] px-5 py-7 md:px-8 md:py-10">
      <p className="mb-2 text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
        FORMPOESIE STUDIO · Interne Arbeitsfläche
      </p>
      <h1 className="font-heading text-4xl leading-none tracking-tight md:text-5xl">
        Was läuft heute?
      </h1>

      <WeeklySuccesses enabled={canManage} />

      <SocialMediaLinks />

      <DashboardFulfillment />

      <DailyNewsFeed onCalendar={onCalendar} onProduct={onInventoryProduct} />
    </div>
  );
}

function SocialMediaLinks() {
  const channels = [
    {
      name: 'Instagram',
      account: '@form.poesie',
      href: 'https://www.instagram.com/form.poesie/',
      icon: Camera,
    },
    {
      name: 'TikTok',
      account: 'formpoesie@gmail.com',
      href: 'https://www.tiktok.com/',
      icon: Music2,
    },
    {
      name: 'Pinterest',
      account: '@3DFormPoesie',
      href: 'https://www.pinterest.de/3DFormPoesie/',
      icon: Pin,
    },
    {
      name: 'PayPal',
      account: 'formpoesie1@gmail.com',
      href: 'https://www.paypal.com/',
      icon: WalletCards,
    },
  ];
  return (
    <section className="mt-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            Direktzugriff
          </p>
          <h2 className="mt-1 font-heading text-2xl">Social Media</h2>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {channels.map(({ name, account, href, icon: Icon }) => (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="group flex min-w-0 items-center gap-3 rounded-2xl border bg-white/65 p-4 transition hover:-translate-y-0.5 hover:bg-white"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--fp-mist)] text-[var(--fp-primary)]">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {account}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

function ProductForm({
  form,
  setField,
  saving,
  onSubmit,
  source,
  setSource,
  inventoryConnected,
  inventoryEmail,
  inventoryPassword,
  setInventoryEmail,
  setInventoryPassword,
  connectInventory,
  inventoryLoading,
  inventoryItems,
  inventorySearch,
  setInventorySearch,
  selectedInventory,
  selectInventoryItem,
}: {
  form: typeof initialForm;
  setField: (key: string, value: string | boolean) => void;
  saving: boolean;
  onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  source: 'inventory' | 'new';
  setSource: (source: 'inventory' | 'new') => void;
  inventoryConnected: boolean;
  inventoryEmail: string;
  inventoryPassword: string;
  setInventoryEmail: (value: string) => void;
  setInventoryPassword: (value: string) => void;
  connectInventory: () => void;
  inventoryLoading: boolean;
  inventoryItems: InventoryItem[];
  inventorySearch: string;
  setInventorySearch: (value: string) => void;
  selectedInventory: InventoryItem | null;
  selectInventoryItem: (item: InventoryItem) => void;
}) {
  const field = (
    label: string,
    key: string,
    placeholder = '',
    type = 'text',
  ) => (
    <label className="grid gap-1.5 text-sm">
      <span>{label}</span>
      <Input
        type={type}
        value={String(form[key as keyof typeof form])}
        onChange={(event) => setField(key, event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
  const filteredInventory = inventoryItems
    .filter((item) =>
      [item.modelName, item.productType, item.sku]
        .join(' ')
        .toLowerCase()
        .includes(inventorySearch.toLowerCase().trim()),
    )
    .slice(0, 12);
  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-6">
      <div className="grid grid-cols-2 rounded-xl border bg-white/45 p-1">
        <button
          type="button"
          onClick={() => setSource('inventory')}
          className={
            'rounded-lg px-3 py-2 text-sm font-medium ' +
            (source === 'inventory' ? 'bg-[var(--fp-ink)] text-white' : '')
          }
        >
          Aus Inventar
        </button>
        <button
          type="button"
          onClick={() => setSource('new')}
          className={
            'rounded-lg px-3 py-2 text-sm font-medium ' +
            (source === 'new' ? 'bg-[var(--fp-ink)] text-white' : '')
          }
        >
          Neuer Artikel
        </button>
      </div>

      {source === 'inventory' ? (
        <section className="space-y-4">
          {!inventoryConnected ? (
            <div className="rounded-2xl border bg-white/55 p-4">
              <div className="flex items-start gap-3">
                <Link2 className="mt-0.5 size-5 text-[var(--fp-primary)]" />
                <div>
                  <h3 className="font-medium">Inventar einmal verbinden</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Melde dich mit demselben FormPoesie-Konto an. Das Passwort
                    wird nicht in der Listing-App gespeichert.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input
                  type="email"
                  autoComplete="username"
                  placeholder="E-Mail-Adresse"
                  value={inventoryEmail}
                  onChange={(event) => setInventoryEmail(event.target.value)}
                />
                <Input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Passwort"
                  value={inventoryPassword}
                  onChange={(event) => setInventoryPassword(event.target.value)}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={connectInventory}
                  disabled={
                    inventoryLoading || !inventoryEmail || !inventoryPassword
                  }
                >
                  {inventoryLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Link2 className="size-4" />
                  )}{' '}
                  Verbinden
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={
                    'In ' + inventoryItems.length + ' Artikeln suchen'
                  }
                  value={inventorySearch}
                  onChange={(event) => setInventorySearch(event.target.value)}
                />
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {filteredInventory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectInventoryItem(item)}
                    className={
                      'flex w-full items-center gap-3 rounded-xl border p-3 text-left ' +
                      (selectedInventory?.id === item.id
                        ? 'border-[var(--fp-primary)] bg-[#eef1ec]'
                        : 'bg-white/45')
                    }
                  >
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-[#ebe5db]">
                      {item.imagePath ? (
                        <Image
                          src={
                            '/api/inventory/image?path=' +
                            encodeURIComponent(item.imagePath)
                          }
                          alt=""
                          fill
                          unoptimized
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-muted-foreground">
                          <Package className="size-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {item.modelName}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {item.productType} · {item.variants.length}{' '}
                        {item.variants.length === 1 ? 'Variante' : 'Varianten'}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        item.complete
                          ? 'border-[var(--fp-primary)]/35'
                          : 'border-[var(--fp-accent)]/55'
                      }
                    >
                      {item.complete
                        ? money(item.productionCost || undefined) + ' Kosten'
                        : 'Daten offen'}
                    </Badge>
                  </button>
                ))}
              </div>
              {selectedInventory ? (
                <div className="rounded-2xl border border-[var(--fp-primary)]/30 bg-[#eef1ec] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#31443f]">
                    <CheckCircle2 className="size-4" /> Produktionsdaten
                    übernommen
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {selectedInventory.variants.length} Varianten aus dem
                    zentralen Artikel übernommen. Käuferwelt und Lizenz wurden
                    aus Kategorie und Artikeldaten abgeleitet und können vor dem
                    Erstellen geprüft werden.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm">
                      <span>Käuferwelt</span>
                      <select
                        value={form.buyerWorld}
                        onChange={(event) =>
                          setField('buyerWorld', event.target.value)
                        }
                        className="h-9 rounded-lg border bg-white px-3"
                      >
                        <option>Kunst & Skulptur</option>
                        <option>Dark & Gothic</option>
                        <option>Botanical</option>
                        <option>Functional Art</option>
                      </select>
                    </label>
                    {field(
                      'Designherkunft / Lizenz (abgeleitet)',
                      'designOrigin',
                      'eigenes Design oder Lizenz',
                    )}
                  </div>
                  <details className="mt-4 rounded-xl border bg-white/70">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
                      Alle {selectedInventory.variants.length} Varianten prüfen
                      <span aria-hidden="true">⌄</span>
                    </summary>
                    <div className="space-y-2 border-t p-3">
                      {selectedInventory.variants.map((variant) => (
                        <div
                          key={String(variant.id)}
                          className="grid gap-1 rounded-lg border bg-white p-3 text-xs sm:grid-cols-[1fr_auto] sm:items-center"
                        >
                          <div>
                            <div className="font-medium">{variant.name}</div>
                            <div className="mt-1 text-muted-foreground">
                              {[
                                variant.size,
                                variant.material,
                                variant.weightGrams
                                  ? `${Math.round(variant.weightGrams)} g`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'Details noch offen'}
                            </div>
                          </div>
                          <div className="text-muted-foreground sm:text-right">
                            {variant.productionCost == null
                              ? 'Kosten offen'
                              : money(variant.productionCost)}
                            {variant.currentPrice == null
                              ? ''
                              : ` · ${money(variant.currentPrice)} Verkauf`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : (
        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {field('Modellname *', 'modelName', 'z. B. Fragment')}
            {field('Produktart *', 'productType', 'z. B. Kopfskulptur')}
            {field('Material', 'material', 'nur wenn bestätigt')}
            {field(
              'Designherkunft / Lizenz',
              'designOrigin',
              'eigenes Design oder Lizenz',
            )}
          </div>
          <details className="rounded-2xl border bg-white/45 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Maße und Produktionskosten ergänzen
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              Nur nötig, weil dieser Artikel noch nicht im Inventar vorhanden
              ist.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {field('Breite (mm)', 'widthMm', '120', 'number')}
              {field('Höhe (mm)', 'heightMm', '180', 'number')}
              {field('Tiefe (mm)', 'depthMm', '95', 'number')}
              {field(
                'Verbrauch inkl. Abfall (g)',
                'weightGrams',
                '280',
                'number',
              )}
              {field('Druckzeit (h)', 'printHours', '14', 'number')}
              {field('Aktive Arbeit (min)', 'activeMinutes', '25', 'number')}
              {field(
                'Materialpreis (€/kg)',
                'materialPerKg',
                '24,90',
                'number',
              )}
              {field('Maschine (€/h)', 'machinePerHour', '0,80', 'number')}
              {field('Arbeit (€/h)', 'laborPerHour', '22', 'number')}
              {field('Verpackung (€)', 'packaging', '1,20', 'number')}
              {field('Porto (€)', 'postage', '5,49', 'number')}
              {field('Zielmarge (%)', 'targetMargin', '30', 'number')}
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <Switch
                aria-label="Strom im Maschinenpreis enthalten"
                checked={form.electricityIncluded}
                onCheckedChange={(checked) =>
                  setField('electricityIncluded', checked)
                }
              />
              Strom ist im Maschinenstundensatz enthalten
            </div>
          </details>
        </section>
      )}
      <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs leading-5 text-muted-foreground">
          Inventardaten werden übernommen, nicht kopiert geschätzt. Offene Werte
          bleiben ausdrücklich offen.
        </p>
        <Button
          type="submit"
          disabled={
            saving ||
            !form.modelName ||
            !form.productType ||
            (source === 'inventory' && !selectedInventory)
          }
          className="w-full rounded-full bg-[var(--fp-ink)] px-5 sm:w-auto"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}{' '}
          Entwurf erstellen
        </Button>
      </div>
    </form>
  );
}

function Workspace(props: {
  product: Created;
  productName: string;
  activeStep: string;
  setActiveStep: (value: string) => void;
  completion: number;
  uploaded: Array<{ id: string; filename: string; url: string }>;
  onUpload: () => void;
  onSaveFacts: (facts: Created['facts']) => Promise<void>;
  keywords: string;
  setKeywords: (value: string) => void;
  researchSaved: boolean;
  saveResearch: () => void;
  locks: Record<string, boolean>;
  setLocks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  updateContent: (
    locale: string,
    key: 'description' | 'tags',
    value: string | string[],
  ) => void;
  updateTitle: (locale: string, index: number, value: string) => void;
  selectTitle: (locale: string, index: number) => void;
  persistLocale: (locale: string) => void;
}) {
  const steps = [
    ['fakten', 'Fakten'],
    ['recherche', 'Recherche'],
    ['texte', 'DE / EN'],
    ['bilder', 'Bildserie'],
    ['preis', 'Preis'],
    ['pruefung', 'Prüfung'],
  ] as const;
  const issueCount =
    props.product.issues.length + (props.uploaded.length === 0 ? 1 : 0);
  return (
    <div className="mx-auto max-w-[1260px] px-4 py-6 md:px-8">
      <div className="rounded-2xl border bg-white/55 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[180px] flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-2xl">{props.productName}</h1>
              <Badge variant="outline">Lokaler Entwurf</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Fortschritt {props.completion}% · jederzeit fortsetzbar
            </div>
          </div>
          <Progress value={props.completion} className="h-1.5 w-40" />
          <a href={'/api/export?id=' + props.product.id}>
            <Button variant="outline" className="rounded-full">
              <Download className="size-4" /> Exportpaket
            </Button>
          </a>
          <Button disabled className="rounded-full">
            Etsy-Entwurf senden
          </Button>
        </div>
      </div>
      <div
        className="mt-5 flex gap-2 overflow-x-auto pb-2"
        aria-label="Arbeitsschritte"
      >
        {steps.map(([key, label], index) => (
          <button
            key={key}
            onClick={() => props.setActiveStep(key)}
            className={
              'flex min-w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm ' +
              (props.activeStep === key
                ? 'border-[var(--fp-ink)] bg-[var(--fp-ink)] text-white'
                : 'bg-white/50')
            }
          >
            <span className="text-xs opacity-60">{index + 1}</span>
            {label}
            {key === 'pruefung' && issueCount ? (
              <span className="rounded-full bg-[var(--fp-accent)] px-1.5 text-[11px] text-white">
                {issueCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {props.activeStep === 'fakten' ? (
          <FactsPanel
            key={props.product.id}
            product={props.product}
            uploaded={props.uploaded}
            onUpload={props.onUpload}
            onSaveFacts={props.onSaveFacts}
          />
        ) : null}
        {props.activeStep === 'recherche' ? (
          <ResearchPanel
            keywords={props.keywords}
            setKeywords={props.setKeywords}
            saved={props.researchSaved}
            save={props.saveResearch}
          />
        ) : null}
        {props.activeStep === 'texte' ? (
          <ContentPanel
            product={props.product}
            locks={props.locks}
            setLocks={props.setLocks}
            update={props.updateContent}
            updateTitle={props.updateTitle}
            selectTitle={props.selectTitle}
            save={props.persistLocale}
          />
        ) : null}
        {props.activeStep === 'bilder' ? (
          <ImagePanel
            product={props.product}
            uploaded={props.uploaded}
            onUpload={props.onUpload}
          />
        ) : null}
        {props.activeStep === 'preis' ? (
          <PricingPanel pricing={props.product.pricing} />
        ) : null}
        {props.activeStep === 'pruefung' ? (
          <ReviewPanel product={props.product} uploaded={props.uploaded} />
        ) : null}
      </div>
    </div>
  );
}

function Panel({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
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
        {action}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function FactsPanel({
  product,
  uploaded,
  onUpload,
  onSaveFacts,
}: {
  product: Created;
  uploaded: Array<{ id: string; filename: string; url: string }>;
  onUpload: () => void;
  onSaveFacts: (facts: Created['facts']) => Promise<void>;
}) {
  const facts = product.issues.filter(
    (issue) => issue.area === 'Fakten' || issue.area === 'Etsy',
  );
  const [editing, setEditing] = useState(facts.length > 0);
  const [savingFacts, setSavingFacts] = useState(false);
  const [factForm, setFactForm] = useState({
    material: product.facts.material,
    widthMm: product.facts.widthMm?.toString() || '',
    heightMm: product.facts.heightMm?.toString() || '',
    depthMm: product.facts.depthMm?.toString() || '',
    designOrigin: product.facts.designOrigin,
  });

  async function submitFacts(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingFacts(true);
    await onSaveFacts({
      material: factForm.material.trim(),
      widthMm: parseNumber(factForm.widthMm),
      heightMm: parseNumber(factForm.heightMm),
      depthMm: parseNumber(factForm.depthMm),
      designOrigin: factForm.designOrigin.trim(),
    });
    setSavingFacts(false);
    setEditing(false);
  }

  const factField = (
    label: string,
    key: keyof typeof factForm,
    type = 'text',
  ) => (
    <label className="grid gap-1.5 text-sm">
      <span>{label}</span>
      <Input
        type={type}
        value={factForm[key]}
        onChange={(event) =>
          setFactForm((current) => ({
            ...current,
            [key]: event.target.value,
          }))
        }
      />
    </label>
  );
  return (
    <Panel
      eyebrow="Bestätigungsstatus"
      title="Produktfakten"
      action={
        <Button
          variant="outline"
          onClick={() => setEditing((current) => !current)}
          className="rounded-full"
        >
          <FilePenLine className="size-4" /> Angaben bearbeiten
        </Button>
      }
    >
      <button
        type="button"
        onClick={onUpload}
        className="flex w-full items-center gap-4 rounded-2xl border border-dashed border-[var(--fp-primary)]/45 bg-[#eef1ec] p-4 text-left transition hover:border-[var(--fp-primary)]"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--fp-ink)] text-white">
          <Upload className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            Produktbilder auswählen
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            JPEG oder PNG · bis 20 MB · mehrere Bilder möglich
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0" />
      </button>

      {editing ? (
        <form
          onSubmit={submitFacts}
          className="mt-5 rounded-2xl border bg-white/70 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                Fehlende Angaben ergänzen
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Nur bestätigte Werte eintragen. Leere Felder bleiben offen.
              </p>
            </div>
            <Button type="submit" size="sm" disabled={savingFacts}>
              {savingFacts ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Speichern
            </Button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {factField('Material', 'material')}
            {factField('Breite (mm)', 'widthMm', 'number')}
            {factField('Höhe (mm)', 'heightMm', 'number')}
            {factField('Tiefe (mm)', 'depthMm', 'number')}
            <div className="sm:col-span-2">
              {factField('Designherkunft / Lizenz', 'designOrigin')}
            </div>
          </div>
        </form>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div>
          <h3 className="text-sm font-semibold">Offene Angaben</h3>
          <div className="mt-3 space-y-2">
            {facts.length ? (
              facts.map((issue) => (
                <div
                  key={issue.text}
                  className="flex gap-3 rounded-xl border border-[var(--fp-accent)]/35 bg-[#fffaf2] p-3 text-sm"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#9b704a]" />
                  <div>
                    <span className="font-medium">{issue.area}:</span>{' '}
                    {issue.text}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex gap-2 text-sm text-[var(--fp-primary)]">
                <CheckCircle2 className="size-4" /> Pflichtfakten sind erfasst.
              </div>
            )}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Originalfotos</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {uploaded.map((item) => (
              <div
                key={item.id}
                className="relative aspect-square overflow-hidden rounded-xl border bg-[var(--fp-mist)]"
              >
                <Image
                  src={item.url}
                  alt={item.filename}
                  fill
                  sizes="180px"
                  unoptimized
                  className="object-cover"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={onUpload}
              className="grid aspect-square place-items-center rounded-xl border border-dashed text-xs text-muted-foreground"
            >
              <Plus className="size-5" />
              JPEG/PNG
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Originale werden privat archiviert. Ein Foto erzeugt keine erfundene
            Rückansicht.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function ResearchPanel({
  keywords,
  setKeywords,
  saved,
  save,
}: {
  keywords: string;
  setKeywords: (value: string) => void;
  saved: boolean;
  save: () => void;
}) {
  const rows = keywords.split(/\r?\n/).filter(Boolean);
  return (
    <Panel
      eyebrow="DE · Zielmarkt Deutschland"
      title="Suchabsicht belegen"
      action={<Badge variant="outline">Manueller Adapter</Badge>}
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div>
          <label className="text-sm font-medium" htmlFor="keywords">
            Eine Suchphrase pro Zeile
          </label>
          <Textarea
            id="keywords"
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            className="mt-2 min-h-56 bg-white"
            placeholder={
              'abstrakte kopfskulptur\ngothic deko skulptur\nmoderne büste'
            }
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {rows.length} von 20 Phrasen
            </span>
            <Button
              onClick={save}
              disabled={!rows.length}
              className="rounded-full"
            >
              {saved ? (
                <Check className="size-4" />
              ) : (
                <Import className="size-4" />
              )}
              {saved ? 'Gespeichert' : 'Recherche speichern'}
            </Button>
          </div>
        </div>
        <aside className="rounded-2xl bg-[var(--fp-ink)] p-5 text-[var(--fp-paper)]">
          <h3 className="font-heading text-2xl">Was wir wissen</h3>
          <p className="mt-3 text-sm leading-6 text-white/67">
            Phrasen, Sprache, Markt, Quelle und Abrufdatum werden gespeichert.
            Nachfrage und Konkurrenz bleiben „unbekannt“, solange keine echte
            Datenquelle Werte liefert.
          </p>
          <div className="mt-5 space-y-2 text-xs">
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span>Produktrelevanz</span>
              <span>1 niedrig → 5 hoch</span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span>Kaufintention</span>
              <span>1 niedrig → 5 hoch</span>
            </div>
            <div className="flex justify-between">
              <span>Suchvolumen</span>
              <span>unbekannt</span>
            </div>
          </div>
        </aside>
      </div>
    </Panel>
  );
}

function ContentPanel({
  product,
  locks,
  setLocks,
  update,
  updateTitle,
  selectTitle,
  save,
}: {
  product: Created;
  locks: Record<string, boolean>;
  setLocks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  update: (
    locale: string,
    key: 'description' | 'tags',
    value: string | string[],
  ) => void;
  updateTitle: (locale: string, index: number, value: string) => void;
  selectTitle: (locale: string, index: number) => void;
  save: (locale: string) => void;
}) {
  return (
    <Panel eyebrow="Eigenständig formuliert" title="Listing-Texte">
      <Tabs defaultValue="de">
        <TabsList className="bg-[var(--fp-mist)]">
          <TabsTrigger value="de">Deutsch</TabsTrigger>
          <TabsTrigger value="en">English</TabsTrigger>
        </TabsList>
        {product.content.map((item) => (
          <TabsContent key={item.locale} value={item.locale} className="mt-6">
            <div className="grid gap-5 xl:grid-cols-[1fr_.9fr]">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Titelvarianten</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setLocks((current) => ({
                        ...current,
                        [item.locale + '-titles']:
                          !current[item.locale + '-titles'],
                      }))
                    }
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <Lock className="size-3" />
                    {locks[item.locale + '-titles']
                      ? 'Titel gesperrt'
                      : 'Titel sperren'}
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {item.titles.map((title, index) => (
                    <label
                      key={index}
                      className="flex gap-3 rounded-xl border bg-white p-3"
                    >
                      <input
                        type="radio"
                        checked={index === item.selectedTitle}
                        onChange={() => selectTitle(item.locale, index)}
                      />
                      <span className="flex-1 text-sm">
                        <Textarea
                          aria-label={`Titel ${index + 1} ${item.locale.toUpperCase()}`}
                          disabled={locks[item.locale + '-titles']}
                          value={title}
                          onChange={(event) =>
                            updateTitle(item.locale, index, event.target.value)
                          }
                          className="min-h-16 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                        />
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {title.length}/140 Zeichen
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">13 Tags</h3>
                  <button
                    onClick={() =>
                      setLocks((current) => ({
                        ...current,
                        [item.locale + '-tags']:
                          !current[item.locale + '-tags'],
                      }))
                    }
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <Lock className="size-3" />
                    {locks[item.locale + '-tags'] ? 'Gesperrt' : 'Sperren'}
                  </button>
                </div>
                <Textarea
                  disabled={locks[item.locale + '-tags']}
                  value={item.tags.join(', ')}
                  onChange={(event) =>
                    update(
                      item.locale,
                      'tags',
                      event.target.value
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                        .slice(0, 13),
                    )
                  }
                  className="mt-2 min-h-28 bg-white"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Beschreibung</h3>
                  <button
                    onClick={() =>
                      setLocks((current) => ({
                        ...current,
                        [item.locale + '-description']:
                          !current[item.locale + '-description'],
                      }))
                    }
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <Lock className="size-3" />
                    {locks[item.locale + '-description']
                      ? 'Gesperrt'
                      : 'Sperren'}
                  </button>
                </div>
                <Textarea
                  disabled={locks[item.locale + '-description']}
                  value={item.description}
                  onChange={(event) =>
                    update(item.locale, 'description', event.target.value)
                  }
                  className="mt-3 min-h-[330px] bg-white leading-6"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    onClick={() => save(item.locale)}
                    className="rounded-full"
                  >
                    Änderungen speichern
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </Panel>
  );
}

function ImagePanel({
  product,
  uploaded,
  onUpload,
}: {
  product: Created;
  uploaded: Array<{ id: string; filename: string; url: string }>;
  onUpload: () => void;
}) {
  return (
    <Panel
      eyebrow="Produktgetreue Serie"
      title="Bildplan"
      action={
        <Button onClick={onUpload} variant="outline" className="rounded-full">
          <Upload className="size-4" /> Weitere Ansicht
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {product.plan.map((item) => (
          <article
            key={item.role}
            className="overflow-hidden rounded-2xl border bg-white"
          >
            <div
              className={
                'relative aspect-[4/3] overflow-hidden ' +
                (item.role === 'Hero' ? 'bg-[#344440]' : 'bg-[var(--fp-mist)]')
              }
            >
              {uploaded[0] ? (
                <Image
                  src={
                    uploaded[Math.min(item.order - 1, uploaded.length - 1)].url
                  }
                  alt={item.altText}
                  fill
                  sizes="(min-width: 1280px) 30vw, 50vw"
                  unoptimized
                  className={
                    'object-contain p-5 ' +
                    (item.status === 'needs_photo' ? 'opacity-30' : '')
                  }
                />
              ) : (
                <div className="grid h-full place-items-center text-center text-xs text-muted-foreground">
                  <ImageIcon className="mx-auto mb-2 size-7" />
                  Originalfoto fehlt
                </div>
              )}
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs">
                {item.order} · {item.role}
              </span>
              {item.status !== 'ready' ? (
                <span className="absolute inset-x-3 bottom-3 rounded-lg bg-[#fffaf2]/95 p-2 text-xs text-[#7a5637]">
                  {item.status === 'blocked'
                    ? 'Bestätigte Maße fehlen'
                    : 'Passende echte Ansicht fehlt'}
                </span>
              ) : null}
            </div>
            <div className="p-4">
              <p className="text-sm leading-5">{item.gain}</p>
              <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                <div className="truncate">{item.filename}</div>
                <div className="mt-1 line-clamp-2">{item.altText}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--fp-primary)]/25 bg-[#edf0ed] p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--fp-primary)]" />
        <div>
          <strong>Originalprodukt gesperrt.</strong> Szenen können erst nach
          geprüfter Freistellungsmaske erzeugt werden. Bis dahin zeigt die App
          keine vermeintlich fertige Bearbeitung.
        </div>
      </div>
    </Panel>
  );
}

function PricingPanel({ pricing }: { pricing: Created['pricing'] }) {
  const labels: Record<string, string> = {
    material: 'Material',
    machine: 'Maschine',
    electricity: 'Strom',
    labor: 'Aktive Arbeit',
    productionRisk: 'Fehldruckrisiko',
    packaging: 'Verpackung',
    overhead: 'Gemeinkosten',
    postage: 'Porto',
    totalRecordedCosts: 'Erfasste Gesamtkosten',
  };
  return (
    <Panel
      eyebrow="Ergebnis nach erfassten Kosten"
      title="Preisempfehlung"
      action={
        <Badge variant="outline">Verlässlichkeit: {pricing.confidence}</Badge>
      }
    >
      <div className="grid gap-4 md:grid-cols-5">
        {[
          ['Empfohlener Etsy-Preis', pricing.etsyPrice],
          ['Direktpreis', pricing.directPrice],
          ['Preisuntergrenze', pricing.floorPrice],
          ['Ergebnis ohne Ads', pricing.resultWithoutAds],
          ['Ergebnis mit Ads', pricing.resultWithAds],
        ].map(([label, value], index) => (
          <div
            key={String(label)}
            className={
              'rounded-2xl p-4 ' +
              (index === 0
                ? 'bg-[var(--fp-primary)] text-white'
                : 'border bg-white')
            }
          >
            <div
              className={
                'text-xs ' +
                (index === 0 ? 'text-white/65' : 'text-muted-foreground')
              }
            >
              {label}
            </div>
            <div className="mt-3 font-heading text-3xl">
              {money(Number(value))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Kostenaufschlüsselung</h3>
          <div className="mt-3 overflow-hidden rounded-xl border">
            {Object.entries(pricing.breakdown).map(([key, value]) => (
              <div
                key={key}
                className={
                  'flex justify-between border-b px-4 py-2.5 text-sm last:border-0 ' +
                  (key === 'totalRecordedCosts'
                    ? 'bg-[var(--fp-mist)] font-semibold'
                    : 'bg-white')
                }
              >
                <span>{labels[key] || key}</span>
                <span>{money(value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Annahmen</h3>
          <ul className="mt-3 space-y-2">
            {pricing.assumptions.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-5">
                <Check className="mt-0.5 size-4 shrink-0 text-[var(--fp-primary)]" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-xl bg-[#fffaf2] p-3 text-xs leading-5 text-[#77583e]">
            Gebühren sind als datiertes, editierbares Profil modelliert. Die
            Einstellgebühr ist wegen Währungsumrechnung eine EUR-Näherung und
            kein universell hardcodierter Nachweis.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function ReviewPanel({
  product,
  uploaded,
}: {
  product: Created;
  uploaded: Array<{ id: string }>;
}) {
  const issues = [
    ...product.issues.filter((issue) => !['DE', 'EN'].includes(issue.area)),
    ...validateListingContent(product.content),
  ];
  if (!uploaded.length)
    issues.push({
      level: 'error',
      area: 'Bilder',
      text: 'Noch kein Originalfoto hochgeladen.',
    });
  return (
    <Panel
      eyebrow="Konkrete Prüfung"
      title={
        issues.length
          ? issues.length + ' Punkte vor dem Export'
          : 'Bereit für den Export'
      }
      action={
        <a href={'/api/export?id=' + product.id}>
          <Button className="rounded-full">
            <Download className="size-4" /> ZIP exportieren
          </Button>
        </a>
      }
    >
      <div className="grid gap-3">
        {issues.length ? (
          issues.map((issue) => (
            <div
              key={issue.area + issue.text}
              className="flex items-start gap-3 rounded-xl border bg-white p-4"
            >
              <AlertTriangle
                className={
                  'mt-0.5 size-5 shrink-0 ' +
                  (issue.level === 'error'
                    ? 'text-[#a35f43]'
                    : 'text-[var(--fp-accent)]')
                }
              />
              <div>
                <div className="text-sm font-semibold">{issue.area}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {issue.text}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-[#edf0ed] p-6 text-center">
            <CheckCircle2 className="mx-auto size-8 text-[var(--fp-primary)]" />
            <p className="mt-3 font-medium">
              Alle prüfbaren Punkte sind erfüllt.
            </p>
          </div>
        )}
        <div className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">Etsy-Übertragung:</strong> Shop
          3DFormPoesie ist bestätigt, OAuth/API-Zugang fehlt. Deshalb bleibt der
          Versandbutton deaktiviert; das vollständige lokale Exportpaket
          funktioniert unabhängig davon.
        </div>
      </div>
    </Panel>
  );
}
