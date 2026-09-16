'use client';

import Image from 'next/image';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Archive,
  Boxes,
  CalendarDays,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Factory,
  FileArchive,
  FileText,
  ImagePlus,
  GripVertical,
  Loader2,
  MapPin,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Truck,
  UserRound,
  Warehouse,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogFooter,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  buyerWorldFromCategory,
  inventoryReviewStatus,
  type InventoryItem,
} from '@/lib/inventory-bridge';
import {
  PRINTERS,
  filamentCostCents,
  isDigitalInventoryProduct,
  variantCostBreakdown,
  variantProductionIssues,
} from '@/lib/inventory-production';
import {
  expenseOccursInMonth,
  type ExpenseRecurrence,
} from '@/lib/recurring-expenses';
import {
  expenseAmountCents,
  filterSalesHistory,
  marketVenue,
  onlineVenue,
} from '@/lib/sales-history';
import { PricingWorkspace } from '@/components/pricing-workspace';

type Row = Record<string, unknown>;
export type InventoryArea =
  | 'overview'
  | 'products'
  | 'pricing'
  | 'materials'
  | 'markets'
  | 'shelves'
  | 'cash'
  | 'online'
  | 'expenses'
  | 'sales'
  | 'months'
  | 'account'
  | 'trash';

type AreaData = Record<string, unknown>;

const sections: Array<{
  id: InventoryArea;
  label: string;
  icon: typeof Boxes;
}> = [
  { id: 'overview', label: 'Übersicht', icon: Boxes },
  { id: 'products', label: 'Artikel', icon: Package },
  { id: 'pricing', label: 'Preisvorschläge', icon: Calculator },
  { id: 'materials', label: 'Material', icon: Warehouse },
  { id: 'markets', label: 'Märkte', icon: MapPin },
  { id: 'shelves', label: 'Regalflächen', icon: Warehouse },
  { id: 'cash', label: 'Kasse', icon: CircleDollarSign },
  { id: 'expenses', label: 'Einkäufe & Ausgaben', icon: FileArchive },
  { id: 'sales', label: 'Verkaufshistorie', icon: ShoppingBag },
  { id: 'months', label: 'Monatsübersicht', icon: CalendarDays },
  { id: 'account', label: 'Konto', icon: UserRound },
  { id: 'trash', label: 'Papierkorb', icon: Trash2 },
];

function object(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(object) : [];
}

function string(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback;
}

function number(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolean(value: unknown) {
  return value === true;
}

function cents(value: unknown) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(number(value) / 100);
}

function duration(minutes: number) {
  if (!minutes) return '–';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return [hours ? `${hours} h` : '', rest ? `${rest} min` : '']
    .filter(Boolean)
    .join(' ');
}

function date(value: unknown) {
  const raw = string(value);
  if (!raw) return '–';
  const parsed = new Date(raw.includes('T') ? raw : raw + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime())
    ? raw
    : new Intl.DateTimeFormat('de-DE').format(parsed);
}

function monthKey(value: unknown) {
  return string(value).slice(0, 7);
}

async function inventoryRequest(input: string, init?: RequestInit) {
  const response = await fetch(input, init);
  if (response.status !== 401) return response;

  const sessionResponse = await fetch('/api/inventory/session', {
    cache: 'no-store',
  });
  const session = (await sessionResponse.json().catch(() => ({}))) as {
    connected?: boolean;
  };
  if (!sessionResponse.ok || !session.connected) return response;

  return fetch(input, init);
}

function productImagePath(product: Row) {
  return string(
    product.studioPrimaryImageUrl || existingProductImagePath(product),
  );
}

function productImageCandidates(product: Row) {
  const candidates = [
    product.studioPrimaryImageUrl,
    ...rows(product.variants).map((variant) => variant.imageUrl),
    product.imageUri,
    ...rows(product.studioAssets)
      .filter((asset) => string(asset.assetKind) === 'image')
      .map((asset) => asset.url),
  ]
    .map((value) => string(value).trim())
    .filter(Boolean);
  return [...new Set(candidates)];
}

function existingProductImagePath(product: Row) {
  const variants = rows(product.variants);
  return string(
    variants.find((item) => string(item.imageUrl))?.imageUrl ||
      product.imageUri,
  );
}

function inventoryImageUrl(path: string) {
  return path.startsWith('/api/')
    ? path
    : '/api/inventory/image?path=' + encodeURIComponent(path);
}

function InventoryImage({ product, alt }: { product: Row; alt: string }) {
  const candidates = productImageCandidates(product);
  const candidateKey = candidates.join('\u0000');
  const [candidateIndex, setCandidateIndex] = useState(0);
  useEffect(() => setCandidateIndex(0), [candidateKey]);
  const path = candidates[candidateIndex] || '';
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#ebe5db]">
      {path ? (
        <Image
          src={inventoryImageUrl(path)}
          alt={alt}
          fill
          unoptimized
          sizes="(max-width: 768px) 45vw, 220px"
          className="object-cover"
          onError={() => setCandidateIndex((current) => current + 1)}
        />
      ) : (
        <div className="grid size-full place-items-center text-muted-foreground">
          <Package className="size-8" />
        </div>
      )}
    </div>
  );
}

function familyName(product: Row, data: AreaData) {
  const family = rows(data.families).find(
    (item) => string(item.id) === string(product.familyId),
  );
  return string(family?.name);
}

function designerName(product: Row, data: AreaData) {
  const designer = rows(data.designers).find(
    (item) => string(item.id) === string(product.designerId),
  );
  return string(designer?.name);
}

function materialChoiceLabel(material: Row) {
  const brand = string(object(material.brand).name);
  const color = string(material.variant);
  return [brand, color].filter(Boolean).join(' · ') || string(material.name);
}

function materialChoiceOption(material: Row) {
  const rollWeight = number(material.spoolWeightGrams);
  const rollPrice = number(material.pricePerRollCents);
  const pricePerKilogram =
    rollWeight > 0 && rollPrice > 0
      ? ` · ${cents(Math.round((rollPrice / rollWeight) * 1000))}/kg`
      : '';
  return materialChoiceLabel(material) + pricePerKilogram;
}

function productionDataMissing(
  product: Row,
  _products: Row[],
  _components: Row[],
) {
  const variants = rows(product.variants);
  if (isDigitalInventoryProduct(product)) {
    return variants.length
      ? variants.some(
          (variant) => variantProductionIssues(product, variant).length > 0,
        )
      : number(product.defaultPriceCents) <= 0;
  }
  return (
    !variants.length ||
    variants.some(
      (variant) => variantProductionIssues(product, variant).length > 0,
    )
  );
}

function inventoryItem(product: Row): InventoryItem {
  const variants = rows(product.variants);
  const filaments = rows(product.filaments);
  const firstVariant = variants[0] || {};
  const material = filaments
    .map((item) => string(object(item.material).name))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .join(', ');
  const weight =
    number(product.filamentGrams) ||
    filaments.reduce(
      (sum, item) => sum + number(item.grams) + number(item.wasteGrams),
      0,
    ) ||
    number(firstVariant.grams);
  const printMinutes =
    number(product.printMinutes) ||
    number(firstVariant.printMinutes) ||
    filaments.reduce((sum, item) => sum + number(item.printMinutes), 0);
  const productionCost =
    number(product.productionCostCents) ||
    number(firstVariant.productionCostCents);
  const price =
    number(product.etsyPriceCents) ||
    number(firstVariant.etsyPriceCents) ||
    number(product.defaultPriceCents) ||
    number(firstVariant.priceCents);
  const category = string(product.category, '3D-gedrucktes Objekt');
  const normalizedVariants = variants.length
    ? variants.map((variant, index) => ({
        id: string(variant.id, `variant-${index + 1}`),
        name: string(variant.name || variant.size, `Variante ${index + 1}`),
        sku: string(variant.sku),
        material: string(object(variant.material).name, material),
        size: string(variant.size),
        color: string(variant.appearance || variant.color),
        setSize: number(variant.quantity, 1),
        weightGrams: number(variant.grams) || null,
        printHours: number(variant.printMinutes)
          ? number(variant.printMinutes) / 60
          : null,
        productionCost: number(variant.productionCostCents)
          ? number(variant.productionCostCents) / 100
          : null,
        currentPrice: number(variant.etsyPriceCents || variant.priceCents)
          ? number(variant.etsyPriceCents || variant.priceCents) / 100
          : null,
      }))
    : [
        {
          id: 'standard',
          name: string(firstVariant.size || product.size, 'Standard'),
          sku: string(product.sku),
          material,
          size: string(firstVariant.size || product.size),
          color: '',
          setSize: 1,
          weightGrams: weight || null,
          printHours: printMinutes ? printMinutes / 60 : null,
          productionCost: productionCost ? productionCost / 100 : null,
          currentPrice: price ? price / 100 : null,
        },
      ];
  return {
    id: string(product.id),
    modelName: string(product.name, 'Unbenannter Artikel'),
    productType: category,
    sku: string(product.sku),
    material,
    size: string(firstVariant.size || product.size),
    widthMm: null,
    heightMm: null,
    depthMm: null,
    weightGrams: weight || null,
    printHours: printMinutes ? printMinutes / 60 : null,
    productionCost: productionCost ? productionCost / 100 : null,
    currentPrice: price ? price / 100 : null,
    stockQuantity: number(product.stockQuantity),
    complete: Boolean(material && weight && printMinutes && productionCost),
    category,
    imagePath: productImagePath(product),
    designOrigin: boolean(product.commercialLicense)
      ? 'Kommerzielle Lizenz'
      : 'Eigenes Design',
    buyerWorld: buyerWorldFromCategory(category),
    variants: normalizedVariants,
    updatedAt: string(product.updatedAt || product.createdAt),
  };
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-2xl border bg-white/65 p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground">
      {label}
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-white text-foreground"
      />
    </label>
  );
}

function decimalInputValue(value: unknown) {
  const parsed = number(value);
  const rounded = Math.round((parsed + Number.EPSILON) * 1000) / 1000;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',');
}

function decimalInputNumber(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function DecimalField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => decimalInputValue(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(decimalInputValue(value));
  }, [focused, value]);

  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground">
      {label}
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const parsed = decimalInputNumber(next);
            if (parsed !== null) onChange(parsed);
          }}
          onBlur={() => {
            setFocused(false);
            const parsed = decimalInputNumber(draft);
            if (parsed !== null) {
              onChange(parsed);
              setDraft(decimalInputValue(parsed));
            } else {
              setDraft(decimalInputValue(value));
            }
          }}
          className="bg-white pr-9 text-foreground"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          g
        </span>
      </div>
    </label>
  );
}

function DurationField({
  label = 'Druckzeit',
  value,
  onChange,
}: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const totalMinutes = Math.max(0, Math.round(value || 0));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return (
    <fieldset className="grid gap-1.5 text-sm font-medium text-foreground">
      <legend>{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-normal text-muted-foreground">
          <span>Stunden</span>
          <span className="relative">
            <Input
              type="number"
              min="0"
              value={hours}
              aria-label={`${label} Stunden`}
              onChange={(event) =>
                onChange(
                  Math.max(0, Number(event.target.value) || 0) * 60 + minutes,
                )
              }
              className="bg-white pr-7 text-foreground"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              h
            </span>
          </span>
        </label>
        <label className="grid gap-1 text-xs font-normal text-muted-foreground">
          <span>Minuten</span>
          <span className="relative">
            <Input
              type="number"
              min="0"
              max="59"
              value={minutes}
              aria-label={`${label} Minuten`}
              onChange={(event) =>
                onChange(
                  hours * 60 +
                    Math.max(0, Math.min(59, Number(event.target.value) || 0)),
                )
              }
              className="bg-white pr-9 text-foreground"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              min
            </span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}

function euroInputValue(value: unknown) {
  return (number(value) / 100).toFixed(2).replace('.', ',');
}

function euroInputCents(value: string) {
  const normalized = value
    .trim()
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : null;
}

function EuroField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => euroInputValue(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(euroInputValue(value));
  }, [focused, value]);

  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground">
      {label}
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const parsed = euroInputCents(next);
            if (parsed !== null) onChange(parsed);
          }}
          onBlur={() => {
            setFocused(false);
            const parsed = euroInputCents(draft);
            if (parsed !== null) {
              onChange(parsed);
              setDraft(euroInputValue(parsed));
            } else {
              setDraft(euroInputValue(value));
            }
          }}
          className="bg-white pr-10 text-foreground"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          €
        </span>
      </div>
    </label>
  );
}

const CHANNEL_PRICE_FIELDS = [
  ['marketPriceCents', 'Markt'],
  ['vintedPriceCents', 'Vinted'],
  ['etsyPriceCents', 'Etsy'],
] as const;

function SalesPriceFields({
  values,
  standardKey,
  onChange,
  className = '',
}: {
  values: Row;
  standardKey: 'priceCents' | 'defaultPriceCents';
  onChange: (key: string, value: number) => void;
  className?: string;
}) {
  return (
    <fieldset className={`rounded-xl border bg-white/55 p-3 ${className}`}>
      <legend className="px-1 text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase">
        Verkaufspreise
      </legend>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EuroField
          label="Standard / Direkt"
          value={number(values[standardKey])}
          onChange={(value) => onChange(standardKey, value)}
        />
        {CHANNEL_PRICE_FIELDS.map(([key, label]) => (
          <EuroField
            key={key}
            label={label}
            value={number(values[key] ?? values[standardKey])}
            onChange={(value) => onChange(key, value)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function priceForSalesChannel(product: Row, variant: Row, channel: string) {
  const standard =
    number(variant.priceCents) || number(product.defaultPriceCents);
  if (channel === 'Etsy')
    return (
      number(variant.etsyPriceCents) ||
      number(product.etsyPriceCents) ||
      standard
    );
  if (channel === 'Vinted')
    return (
      number(variant.vintedPriceCents) ||
      number(product.vintedPriceCents) ||
      standard
    );
  if (channel === 'Markt')
    return (
      number(variant.marketPriceCents) ||
      number(product.marketPriceCents) ||
      standard
    );
  return standard;
}

export function InventoryWorkspace({
  onCreateListing,
  initialArea = 'products',
  initialProductId = '',
  canManage = false,
}: {
  onCreateListing: (item: InventoryItem) => void;
  initialArea?: InventoryArea;
  initialProductId?: string;
  canManage?: boolean;
}) {
  const [active, setActive] = useState<InventoryArea>(initialArea);
  const [data, setData] = useState<Record<string, AreaData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState<
    'active' | 'archive' | 'all'
  >('active');
  const [editor, setEditor] = useState<{ entity: string; row: Row } | null>(
    null,
  );
  const [form, setForm] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [duplicatingProductId, setDuplicatingProductId] = useState('');
  const [editorMessage, setEditorMessage] = useState('');
  const [selectedMarket, setSelectedMarket] = useState<Row | null>(null);
  const openedInitialProduct = useRef('');

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', `inventory-${active}`);
    window.history.replaceState({}, '', url);
  }, [active]);

  const fetchArea = useCallback(
    async (area: Exclude<InventoryArea, 'overview'>) => {
      const response = await inventoryRequest(
        '/api/inventory/workspace?area=' + area,
      );
      const result = (await response.json()) as AreaData & { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'Daten konnten nicht geladen werden.');
      setData((current) => ({ ...current, [area]: result }));
      return result;
    },
    [],
  );

  useEffect(() => setActive(initialArea), [initialArea]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (active === 'overview') {
        await Promise.all([
          fetchArea('products'),
          fetchArea('materials'),
          fetchArea('markets'),
          fetchArea('online'),
        ]);
      } else {
        await fetchArea(active);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Daten konnten nicht geladen werden.',
      );
    } finally {
      setLoading(false);
    }
  }, [active, fetchArea]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openEditor = (entity: string, row: Row = {}) => {
    setEditor({ entity, row });
    setForm({ ...row });
    setEditorMessage('');
  };

  const setValue = (key: string, value: unknown) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!initialProductId || openedInitialProduct.current === initialProductId)
      return;
    const product = rows(data.products?.products).find(
      (item) => string(item.id) === initialProductId,
    );
    if (!product) return;
    openedInitialProduct.current = initialProductId;
    openEditor('products', product);
  }, [data.products, initialProductId]);

  async function saveEntity() {
    if (!editor) return;
    setSaving(true);
    setError('');
    try {
      const id = editor.row.id;
      const response = await inventoryRequest('/api/inventory/workspace', {
        method: id == null ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: editor.entity, id, values: form }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: Row[];
      };
      if (!response.ok)
        throw new Error(result.error || 'Speichern fehlgeschlagen.');
      if (editor.entity === 'products') {
        const productResult = await fetchArea('products');
        const savedId = id ?? rows(result.result)[0]?.id;
        const saved = rows(productResult.products).find(
          (item) => string(item.id) === string(savedId),
        );
        if (saved) {
          setEditor({ entity: 'products', row: saved });
          setForm({ ...saved });
          setEditorMessage(
            id == null
              ? 'Artikel gespeichert. Du kannst jetzt Varianten und Filamente hinzufügen.'
              : 'Artikeländerungen gespeichert.',
          );
        }
        return;
      }
      if (editor.entity === 'materials') {
        const materialResult = await fetchArea('materials');
        const savedId = id ?? rows(result.result)[0]?.id;
        const saved = rows(materialResult.materials).find(
          (item) => string(item.id) === string(savedId),
        );
        if (saved) {
          setEditor({ entity: 'materials', row: saved });
          setForm({ ...saved });
          setEditorMessage(
            id == null
              ? 'Material gespeichert. Du kannst jetzt Bilder hinzufügen.'
              : 'Materialänderungen gespeichert.',
          );
        }
        return;
      }
      setEditor(null);
      await refresh();
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.';
      setError(message);
      setEditorMessage(message);
    } finally {
      setSaving(false);
    }
  }

  async function refreshProductEditor(productId: unknown) {
    const productResult = await fetchArea('products');
    const saved = rows(productResult.products).find(
      (item) => string(item.id) === string(productId),
    );
    if (saved) {
      setEditor({ entity: 'products', row: saved });
      setForm((current) => ({
        ...saved,
        ...current,
        variants: saved.variants,
        filaments: saved.filaments,
        studioAssets: saved.studioAssets,
        studioPrimaryImageUrl: saved.studioPrimaryImageUrl,
      }));
      setEditorMessage('Herstellungsdaten gespeichert.');
    }
  }

  async function refreshMaterialEditor(materialId: unknown) {
    const materialResult = await fetchArea('materials');
    const saved = rows(materialResult.materials).find(
      (item) => string(item.id) === string(materialId),
    );
    if (saved) {
      setEditor({ entity: 'materials', row: saved });
      setForm({ ...saved });
      setEditorMessage('Materialbilder aktualisiert.');
    }
  }

  async function openProduct(productId: string) {
    const productSource = data.products || (await fetchArea('products'));
    const product = rows(productSource.products).find(
      (item) => string(item.id) === productId,
    );
    if (product) {
      setActive('products');
      openEditor('products', product);
    } else {
      setError('Der zugehörige Artikel wurde nicht gefunden.');
    }
  }

  async function moveToTrash(entity: string, id: unknown, restore = false) {
    const response = await inventoryRequest('/api/inventory/workspace', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, id, restore }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error || 'Aktion fehlgeschlagen.');
    else await refresh();
  }

  async function toggleOnline(row: Row, key: 'isPrinted' | 'isShipped') {
    const response = await inventoryRequest('/api/inventory/workspace', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity:
          string(row.sourceType) === 'cash-sale'
            ? 'fulfillment_tasks'
            : 'online_sales',
        id: row.id,
        values: { [key]: !boolean(row[key]) },
      }),
    });
    if (!response.ok) setError('Status konnte nicht gespeichert werden.');
    else await fetchArea('online');
  }

  async function patchEntity(entity: string, id: unknown, values: Row) {
    const response = await inventoryRequest('/api/inventory/workspace', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, id, values }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error || 'Änderung fehlgeschlagen.');
    else await refresh();
  }

  async function bulkPatchProducts(ids: string[], values: Row) {
    const responses = await Promise.all(
      ids.map((id) =>
        inventoryRequest('/api/inventory/workspace', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity: 'products', id, values }),
        }),
      ),
    );
    if (responses.some((response) => !response.ok)) {
      setError('Nicht alle ausgewählten Artikel konnten geändert werden.');
      return false;
    }
    await fetchArea('products');
    return true;
  }

  async function copyMarket(row: Row) {
    const response = await inventoryRequest('/api/inventory/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'markets',
        values: {
          name: string(row.name) + ' – Kopie',
          location: string(row.location),
          date: string(row.date),
          endDate: string(row.endDate) || null,
          status: 'geplant',
          venueKind: string(row.venueKind, 'market'),
        },
      }),
    });
    if (!response.ok) setError('Markt konnte nicht kopiert werden.');
    else await refresh();
  }

  async function duplicateProduct(row: Row) {
    const sourceId = string(row.id);
    if (!sourceId || duplicatingProductId) return;
    setDuplicatingProductId(sourceId);
    setError('');
    try {
      const response = await inventoryRequest('/api/inventory/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duplicateProduct', id: sourceId }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        productId?: string | number;
      };
      if (!response.ok || result.productId == null)
        throw new Error(
          result.error || 'Artikel konnte nicht dupliziert werden.',
        );
      const productResult = await fetchArea('products');
      const duplicate = rows(productResult.products).find(
        (item) => string(item.id) === string(result.productId),
      );
      if (!duplicate)
        throw new Error('Die neue Artikelkopie konnte nicht geladen werden.');
      setSearch('');
      setProductFilter('active');
      openEditor('products', duplicate);
      setEditorMessage(
        'Vollständige Arbeitskopie angelegt. Bestände, Etsy-Status und Final-Markierung wurden bewusst zurückgesetzt.',
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Artikel konnte nicht dupliziert werden.',
      );
    } finally {
      setDuplicatingProductId('');
    }
  }

  const productData = data.products || {};
  const products = rows(productData.products);
  const materials = rows(data.materials?.materials);
  const markets = rows(data.markets?.markets);
  const online = rows(data.online?.onlineSales);
  const cashTasks = rows(data.online?.fulfillmentTasks);
  const inventoryContext = ['overview', 'products', 'materials'].includes(
    active,
  );
  const visibleSections = inventoryContext
    ? sections.filter((section) =>
        ['products', 'materials'].includes(section.id),
      )
    : sections.filter((section) => section.id === active);
  const pageTitle = inventoryContext
    ? 'Inventar'
    : sections.find((section) => section.id === active)?.label ||
      'FORMPOESIE STUDIO';

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-9">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            Ein System · echte Inventardaten
          </p>
          <h1 className="mt-2 font-heading text-4xl leading-none md:text-5xl">
            {pageTitle}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            {inventoryContext
              ? 'Artikel und Material werden direkt in derselben FormPoesie-Datenbank bearbeitet.'
              : 'Dieser Bereich nutzt dieselben zentralen Artikel-, Bestands- und Verkaufsdaten.'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className={'size-4 ' + (loading ? 'animate-spin' : '')} />{' '}
          Aktualisieren
        </Button>
      </div>

      <nav
        className="mt-6 flex gap-2 overflow-x-auto pb-2"
        aria-label="Inventarbereiche"
      >
        {visibleSections
          .filter(
            (section) =>
              canManage ||
              ![
                'pricing',
                'sales',
                'months',
                'expenses',
                'account',
                'trash',
              ].includes(section.id),
          )
          .map((section) => {
            const Icon = section.icon;
            return (
              <Button
                key={section.id}
                variant={active === section.id ? 'default' : 'outline'}
                className={
                  active === section.id ? 'bg-[var(--fp-ink)]' : 'bg-white/55'
                }
                onClick={() => setActive(section.id)}
              >
                <Icon className="size-4" /> {section.label}
              </Button>
            );
          })}
      </nav>

      {error ? (
        <div className="mt-4 rounded-xl border border-[#b5895a]/50 bg-[#fff8ef] p-3 text-sm">
          {error}
        </div>
      ) : null}
      {loading && !Object.keys(data).length ? (
        <div className="grid min-h-[45vh] place-items-center">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : null}

      {active === 'overview' ? (
        <Overview
          products={products}
          materials={materials}
          markets={markets}
          online={online}
          cashTasks={cashTasks}
          onGo={setActive}
          onToggle={toggleOnline}
          onEditTask={(row) => openEditor('online_sales', row)}
        />
      ) : null}
      {active === 'products' ? (
        <Products
          data={productData}
          search={search}
          setSearch={setSearch}
          filter={productFilter}
          setFilter={setProductFilter}
          onEdit={(row) => openEditor('products', row)}
          onNew={() => openEditor('products')}
          onTrash={(row) => void moveToTrash('products', row.id)}
          onArchive={(row) => {
            void patchEntity('products', row.id, {
              archivedAt: row.archivedAt ? null : new Date().toISOString(),
            });
          }}
          onListing={(row) => onCreateListing(inventoryItem(row))}
          onDuplicate={(row) => void duplicateProduct(row)}
          duplicatingProductId={duplicatingProductId}
          onBulkEdit={bulkPatchProducts}
        />
      ) : null}
      {active === 'pricing' ? (
        <PricingWorkspace data={data.pricing || {}} />
      ) : null}
      {active === 'materials' ? (
        <Materials
          data={data.materials || {}}
          search={search}
          setSearch={setSearch}
          onEdit={(row) => openEditor('materials', row)}
          onNew={() => openEditor('materials')}
          onTrash={(row) => void moveToTrash('materials', row.id)}
        />
      ) : null}
      {active === 'markets' ? (
        <Markets
          data={data.markets || {}}
          onEdit={(row) => openEditor('markets', row)}
          onNew={() => openEditor('markets', { venueKind: 'market' })}
          onOpen={setSelectedMarket}
          onCopy={(row) => void copyMarket(row)}
          onTrash={(row) => void moveToTrash('markets', row.id)}
        />
      ) : null}
      {active === 'shelves' ? (
        <Markets
          data={data.shelves || {}}
          kind="shelf"
          onEdit={(row) => openEditor('markets', row)}
          onNew={() => openEditor('markets', { venueKind: 'shelf' })}
          onOpen={setSelectedMarket}
          onCopy={(row) => void copyMarket({ ...row, venueKind: 'shelf' })}
          onTrash={(row) => void moveToTrash('markets', row.id)}
        />
      ) : null}
      {active === 'online' ? (
        <OnlineSales
          items={[
            ...online.filter(
              (item) => !boolean(item.isPrinted) || !boolean(item.isShipped),
            ),
            ...cashTasks,
          ]}
          onToggle={toggleOnline}
          onEdit={(row) => openEditor('online_sales', row)}
        />
      ) : null}
      {active === 'cash' ? (
        <GeneralCashRegister
          data={data.cash || {}}
          onBooked={() => void refresh()}
        />
      ) : null}
      {active === 'expenses' ? (
        <Expenses
          data={data.expenses || {}}
          onEdit={(row) => openEditor('other_expenses', row)}
          onNew={() =>
            openEditor('other_expenses', {
              invoiceDate: new Intl.DateTimeFormat('sv-SE').format(new Date()),
              quantity: 1,
              recurrence: 'none',
              isMonthly: false,
            })
          }
          onTrash={(row) => void moveToTrash('other_expenses', row.id)}
          onChanged={() => void fetchArea('expenses')}
        />
      ) : null}
      {active === 'sales' ? (
        <Sales
          data={data.sales || {}}
          onOpenProduct={openProduct}
          onEdit={(entity, row) => openEditor(entity, row)}
          onDelete={(entity, row) => void moveToTrash(entity, row.id)}
        />
      ) : null}
      {active === 'months' ? (
        <Months data={data.months || {}} onOpenProduct={openProduct} />
      ) : null}
      {active === 'account' ? <Account data={data.account || {}} /> : null}
      {active === 'trash' ? (
        <InventoryTrash data={data.trash || {}} onRestore={moveToTrash} />
      ) : null}

      <EntityEditor
        editor={editor}
        form={form}
        setValue={setValue}
        data={data}
        saving={saving}
        message={editorMessage}
        onSave={() => void saveEntity()}
        onClose={() => setEditor(null)}
        onProductChanged={(productId) => void refreshProductEditor(productId)}
        onMaterialChanged={(materialId) =>
          void refreshMaterialEditor(materialId)
        }
      />
      <MarketDetail
        market={selectedMarket}
        data={data[active] || data.markets || {}}
        products={
          rows((data[active] || {}).products).length
            ? rows((data[active] || {}).products)
            : products
        }
        onClose={() => setSelectedMarket(null)}
        onChanged={() =>
          void fetchArea(active === 'shelves' ? 'shelves' : 'markets')
        }
      />
    </div>
  );
}

function Overview({
  products,
  materials,
  markets,
  online,
  cashTasks,
  onGo,
  onToggle,
  onEditTask,
}: {
  products: Row[];
  materials: Row[];
  markets: Row[];
  online: Row[];
  cashTasks: Row[];
  onGo: (area: InventoryArea) => void;
  onToggle: (row: Row, key: 'isPrinted' | 'isShipped') => Promise<void>;
  onEditTask: (row: Row) => void;
}) {
  const finalProducts = products.filter(
    (item) =>
      !item.archivedAt && inventoryReviewStatus(item.studioStatus) === 'final',
  );
  const activeMarkets = markets.filter(
    (item) => string(item.status) !== 'abgeschlossen',
  );
  const fulfillment = [...online, ...cashTasks];
  const printTasks = fulfillment.filter((item) => !boolean(item.isPrinted));
  const shippingTasks = fulfillment.filter(
    (item) =>
      !boolean(item.isShipped) &&
      string(item.shippingMethod) !== 'abholung' &&
      string(item.fulfillmentMode) !== 'pickup',
  );
  const lowMaterials = materials.filter((item) =>
    ['niedrig', 'fast_leer', 'leer'].includes(string(item.status)),
  );
  return (
    <div className="mt-6 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat value={finalProducts.length} label="aktive Artikel" />
        <Stat
          value={finalProducts.reduce(
            (sum, item) => sum + number(item.stockQuantity),
            0,
          )}
          label="fertige Stücke"
        />
        <Stat value={lowMaterials.length} label="Materialwarnungen" />
        <Stat value={activeMarkets.length} label="offene Märkte" />
        <Stat
          value={printTasks.length + shippingTasks.length}
          label="Druck- & Versandaufgaben"
        />
      </div>
      <section className="rounded-[26px] border bg-white/65 p-5 md:p-6">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-5 text-[var(--fp-primary)]" />
          <h2 className="font-heading text-2xl">Heute zu erledigen</h2>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Task
            icon={Warehouse}
            count={lowMaterials.length}
            title="Material prüfen"
            detail="niedrig, fast leer oder leer"
            onClick={() => onGo('materials')}
          />
          <details className="group rounded-2xl border bg-white/60 open:bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--fp-mist)]">
                <Truck className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Druck & Versand</span>
                <span className="block text-xs text-muted-foreground">
                  {printTasks.length} zu drucken · {shippingTasks.length} zu
                  versenden
                </span>
              </span>
              <Badge>{printTasks.length + shippingTasks.length}</Badge>
              <span className="text-sm transition group-open:rotate-180">
                ⌄
              </span>
            </summary>
            <div className="border-t px-4 pb-4">
              <OnlineSales
                items={fulfillment.filter(
                  (item) =>
                    !boolean(item.isPrinted) || !boolean(item.isShipped),
                )}
                onToggle={onToggle}
                onEdit={onEditTask}
              />
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}

function Task({
  icon: Icon,
  count,
  title,
  detail,
  onClick,
}: {
  icon: typeof Boxes;
  count: number;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border bg-white/60 p-4 text-left transition hover:border-[var(--fp-primary)]"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-[var(--fp-mist)]">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <Badge>{count}</Badge>
    </button>
  );
}

function BulkSelect({
  label,
  value,
  onChange,
  options,
  clearLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  clearLabel?: string;
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
      >
        <option value="keep">Beibehalten</option>
        {clearLabel ? <option value="clear">{clearLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Products({
  data,
  search,
  setSearch,
  filter,
  setFilter,
  onEdit,
  onNew,
  onTrash,
  onArchive,
  onListing,
  onDuplicate,
  duplicatingProductId,
  onBulkEdit,
}: {
  data: AreaData;
  search: string;
  setSearch: (value: string) => void;
  filter: 'active' | 'archive' | 'all';
  setFilter: (value: 'active' | 'archive' | 'all') => void;
  onEdit: (row: Row) => void;
  onNew: () => void;
  onTrash: (row: Row) => void;
  onArchive: (row: Row) => void;
  onListing: (row: Row) => void;
  onDuplicate: (row: Row) => void;
  duplicatingProductId: string;
  onBulkEdit: (ids: string[], values: Row) => Promise<boolean>;
}) {
  const [category, setCategory] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [designerId, setDesignerId] = useState('');
  const [reviewFilter, setReviewFilter] = useState<
    'final' | 'draft' | 'customer_order' | 'all'
  >('final');
  const [sort, setSort] = useState<
    'name' | 'margin' | 'cost' | 'printTime' | 'updated'
  >('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [moreFilters, setMoreFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkFamilyId, setBulkFamilyId] = useState('keep');
  const [bulkDesignerId, setBulkDesignerId] = useState('keep');
  const [bulkCommercialLicense, setBulkCommercialLicense] = useState('keep');
  const [bulkStudioStatus, setBulkStudioStatus] = useState('keep');
  const [bulkEtsyListed, setBulkEtsyListed] = useState('keep');
  const [bulkArchiveStatus, setBulkArchiveStatus] = useState('keep');
  const [bulkNoteEnabled, setBulkNoteEnabled] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const source = rows(data.products);
  const components = rows(data.components);
  const metrics = (product: Row) =>
    rows(product.variants).length
      ? rows(product.variants).map((variant) =>
          variantCostBreakdown(product, variant, source, components),
        )
      : isDigitalInventoryProduct(product)
        ? [
            variantCostBreakdown(
              product,
              { priceCents: product.defaultPriceCents },
              source,
              components,
            ),
          ]
        : [];
  const averageMargin = (product: Row) => {
    if (productMissing(product)) return null;
    const values = metrics(product)
      .map((item) => item.marginPercent)
      .filter((item): item is number => item != null);
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  };
  const productMissing = (product: Row) =>
    productionDataMissing(product, source, components);
  const products = source.filter((product) => {
    const query = search.trim().toLocaleLowerCase('de');
    const matches = [
      product.name,
      product.category,
      product.size,
      familyName(product, data),
      designerName(product, data),
    ]
      .join(' ')
      .toLocaleLowerCase('de')
      .includes(query);
    if (!matches) return false;
    const studioStatus = inventoryReviewStatus(product.studioStatus);
    if (filter === 'archive' && !product.archivedAt) return false;
    if (filter === 'active' && product.archivedAt) return false;
    if (
      filter === 'active' &&
      studioStatus === 'customer_order' &&
      reviewFilter !== 'customer_order'
    )
      return false;
    if (category && string(product.category) !== category) return false;
    if (familyId && string(product.familyId) !== familyId) return false;
    if (designerId && string(product.designerId) !== designerId) return false;
    if (reviewFilter !== 'all' && studioStatus !== reviewFilter) return false;
    return true;
  });
  products.sort((a, b) => {
    const costA = Math.max(0, ...metrics(a).map((item) => item.totalCents));
    const costB = Math.max(0, ...metrics(b).map((item) => item.totalCents));
    let comparison = 0;
    if (sort === 'margin')
      comparison =
        (averageMargin(a) ?? -Infinity) - (averageMargin(b) ?? -Infinity);
    else if (sort === 'cost') comparison = costA - costB;
    else if (sort === 'printTime')
      comparison =
        Math.max(0, ...metrics(a).map((item) => item.printMinutes)) -
        Math.max(0, ...metrics(b).map((item) => item.printMinutes));
    else if (sort === 'updated')
      comparison = string(a.updatedAt || a.createdAt).localeCompare(
        string(b.updatedAt || b.createdAt),
      );
    else comparison = string(a.name).localeCompare(string(b.name), 'de');
    return sortDirection === 'asc' ? comparison : -comparison;
  });
  const categories = [
    ...new Set(source.map((item) => string(item.category)).filter(Boolean)),
  ].sort();
  const selectedProducts = source.filter((product) =>
    selectedIds.includes(string(product.id)),
  );
  const bulkValues: Row = {
    ...(bulkCategory.trim() ? { category: bulkCategory.trim() } : {}),
    ...(bulkFamilyId !== 'keep'
      ? { familyId: bulkFamilyId === 'clear' ? null : Number(bulkFamilyId) }
      : {}),
    ...(bulkDesignerId !== 'keep'
      ? {
          designerId:
            bulkDesignerId === 'clear' ? null : Number(bulkDesignerId),
        }
      : {}),
    ...(bulkCommercialLicense !== 'keep'
      ? { commercialLicense: bulkCommercialLicense === 'yes' }
      : {}),
    ...(bulkStudioStatus !== 'keep' ? { studioStatus: bulkStudioStatus } : {}),
    ...(bulkEtsyListed !== 'keep'
      ? { etsyListed: bulkEtsyListed === 'yes' }
      : {}),
    ...(bulkArchiveStatus !== 'keep'
      ? {
          archivedAt:
            bulkArchiveStatus === 'archived' ? new Date().toISOString() : null,
        }
      : {}),
    ...(bulkNoteEnabled ? { note: bulkNote.trim() || null } : {}),
  };
  const bulkChanges: Array<[string, string]> = [
    ...(bulkCategory.trim()
      ? ([['Kategorie', bulkCategory.trim()]] as Array<[string, string]>)
      : []),
    ...(bulkFamilyId !== 'keep'
      ? ([
          [
            'Produktfamilie',
            bulkFamilyId === 'clear'
              ? 'Zuordnung entfernen'
              : string(
                  rows(data.families).find(
                    (item) => string(item.id) === bulkFamilyId,
                  )?.name,
                  'Ausgewählte Familie',
                ),
          ],
        ] as Array<[string, string]>)
      : []),
    ...(bulkDesignerId !== 'keep'
      ? ([
          [
            'Designer / Lizenzgeber',
            bulkDesignerId === 'clear'
              ? 'Zuordnung entfernen'
              : string(
                  rows(data.designers).find(
                    (item) => string(item.id) === bulkDesignerId,
                  )?.name,
                  'Ausgewählter Designer',
                ),
          ],
        ] as Array<[string, string]>)
      : []),
    ...(bulkCommercialLicense !== 'keep'
      ? ([
          [
            'Gewerbliche Lizenz',
            bulkCommercialLicense === 'yes' ? 'Vorhanden' : 'Nicht vorhanden',
          ],
        ] as Array<[string, string]>)
      : []),
    ...(bulkStudioStatus !== 'keep'
      ? ([
          [
            'Studio-Status',
            bulkStudioStatus === 'final'
              ? 'Final'
              : bulkStudioStatus === 'customer_order'
                ? 'Kundenauftrag'
                : 'Entwurf',
          ],
        ] as Array<[string, string]>)
      : []),
    ...(bulkEtsyListed !== 'keep'
      ? ([
          [
            'Etsy-Status',
            bulkEtsyListed === 'yes' ? 'Inseriert' : 'Nicht inseriert',
          ],
        ] as Array<[string, string]>)
      : []),
    ...(bulkArchiveStatus !== 'keep'
      ? ([
          [
            'Archivstatus',
            bulkArchiveStatus === 'archived' ? 'Archiviert' : 'Aktiv',
          ],
        ] as Array<[string, string]>)
      : []),
    ...(bulkNoteEnabled
      ? ([['Notiz', bulkNote.trim() || 'Notiz entfernen']] as Array<
          [string, string]
        >)
      : []),
  ];
  const resetBulkEdit = () => {
    setBulkCategory('');
    setBulkFamilyId('keep');
    setBulkDesignerId('keep');
    setBulkCommercialLicense('keep');
    setBulkStudioStatus('keep');
    setBulkEtsyListed('keep');
    setBulkArchiveStatus('keep');
    setBulkNoteEnabled(false);
    setBulkNote('');
  };
  const portfolio = source.reduce<{
    stock: number;
    boundCents: number;
    profitCents: number;
    missing: number;
  }>(
    (summary, product) => {
      if (
        product.archivedAt ||
        inventoryReviewStatus(product.studioStatus) !== 'final'
      )
        return summary;
      if (productMissing(product)) {
        summary.missing += 1;
        return summary;
      }
      for (const [index, variant] of rows(product.variants).entries()) {
        const quantity = number(variant.quantity);
        const cost = metrics(product)[index];
        summary.stock += quantity;
        summary.boundCents += cost.totalCents * quantity;
        summary.profitCents += Math.max(0, cost.marginCents || 0) * quantity;
      }
      return summary;
    },
    { stock: 0, boundCents: 0, profitCents: 0, missing: 0 },
  );
  return (
    <section className="mt-6">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="bg-white pl-9"
            placeholder="Artikel, Familie oder Designer suchen"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as typeof filter)}
          className="h-9 rounded-lg border bg-white px-3 text-sm"
        >
          <option value="active">Aktives Sortiment</option>
          <option value="archive">Archiv</option>
          <option value="all">Alle Artikel</option>
        </select>
        <Button onClick={onNew}>
          <Plus className="size-4" /> Neuer Artikel
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={reviewFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setReviewFilter('all')}
        >
          Alle
        </Button>
        <Button
          size="sm"
          variant={reviewFilter === 'final' ? 'default' : 'outline'}
          onClick={() =>
            setReviewFilter((current) =>
              current === 'final' ? 'all' : 'final',
            )
          }
        >
          Final
        </Button>
        <Button
          size="sm"
          variant={reviewFilter === 'draft' ? 'default' : 'outline'}
          onClick={() =>
            setReviewFilter((current) =>
              current === 'draft' ? 'all' : 'draft',
            )
          }
        >
          Entwurf
        </Button>
        <Button
          size="sm"
          variant={reviewFilter === 'customer_order' ? 'default' : 'outline'}
          onClick={() =>
            setReviewFilter((current) =>
              current === 'customer_order' ? 'all' : 'customer_order',
            )
          }
        >
          Kundenauftrag
        </Button>
        <Button
          size="sm"
          variant={moreFilters ? 'default' : 'outline'}
          onClick={() => setMoreFilters((value) => !value)}
        >
          Weitere Filter · {sort === 'name' ? 'A–Z' : 'Sortiert'}
          {[
            category,
            familyId,
            designerId,
            sort !== 'name' || sortDirection !== 'asc' ? sort : '',
          ].filter(Boolean).length
            ? ` (${
                [
                  category,
                  familyId,
                  designerId,
                  sort !== 'name' || sortDirection !== 'asc' ? sort : '',
                ].filter(Boolean).length
              })`
            : ''}
        </Button>
      </div>
      {selectedIds.length ? (
        <div className="sticky top-20 z-10 mt-3 rounded-2xl border border-[var(--fp-primary)]/35 bg-[#eef1ec] p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-sm font-medium">
              {selectedIds.length} Artikel ausgewählt
            </div>
            <Button
              type="button"
              disabled={!bulkChanges.length || bulkSaving}
              onClick={() => setBulkPreviewOpen(true)}
            >
              <Pencil className="size-4" /> Änderungen prüfen
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSelectedIds([]);
                resetBulkEdit();
              }}
            >
              Auswahl aufheben
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Kategorie
              <Input
                list="bulk-product-categories"
                value={bulkCategory}
                onChange={(event) => setBulkCategory(event.target.value)}
                className="bg-white text-foreground"
                placeholder="Beibehalten"
              />
              <datalist id="bulk-product-categories">
                {categories.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </label>
            <BulkSelect
              label="Produktfamilie"
              value={bulkFamilyId}
              onChange={setBulkFamilyId}
              options={rows(data.families).map((item) => ({
                value: string(item.id),
                label: string(item.name),
              }))}
              clearLabel="Zuordnung entfernen"
            />
            <BulkSelect
              label="Designer / Lizenzgeber"
              value={bulkDesignerId}
              onChange={setBulkDesignerId}
              options={rows(data.designers).map((item) => ({
                value: string(item.id),
                label: string(item.name),
              }))}
              clearLabel="Zuordnung entfernen"
            />
            <BulkSelect
              label="Gewerbliche Lizenz"
              value={bulkCommercialLicense}
              onChange={setBulkCommercialLicense}
              options={[
                { value: 'yes', label: 'Vorhanden' },
                { value: 'no', label: 'Nicht vorhanden' },
              ]}
            />
            <BulkSelect
              label="Studio-Status"
              value={bulkStudioStatus}
              onChange={setBulkStudioStatus}
              options={[
                { value: 'final', label: 'Final' },
                { value: 'draft', label: 'Entwurf' },
                { value: 'customer_order', label: 'Kundenauftrag' },
              ]}
            />
            <BulkSelect
              label="Etsy-Status"
              value={bulkEtsyListed}
              onChange={setBulkEtsyListed}
              options={[
                { value: 'yes', label: 'Inseriert' },
                { value: 'no', label: 'Nicht inseriert' },
              ]}
            />
            <BulkSelect
              label="Archivstatus"
              value={bulkArchiveStatus}
              onChange={setBulkArchiveStatus}
              options={[
                { value: 'active', label: 'Aktiv' },
                { value: 'archived', label: 'Archiviert' },
              ]}
            />
            <label className="grid gap-1 text-xs text-muted-foreground">
              Notiz
              <span className="flex min-h-9 items-center gap-2 rounded-lg border bg-white px-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={bulkNoteEnabled}
                  onChange={(event) => setBulkNoteEnabled(event.target.checked)}
                  className="size-4"
                />
                Gemeinsam ersetzen
              </span>
            </label>
            {bulkNoteEnabled ? (
              <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2 xl:col-span-4">
                Neue gemeinsame Notiz (leer lassen zum Entfernen)
                <Textarea
                  value={bulkNote}
                  onChange={(event) => setBulkNote(event.target.value)}
                  className="bg-white text-foreground"
                />
              </label>
            ) : null}
          </div>
        </div>
      ) : null}
      <Dialog open={bulkPreviewOpen} onOpenChange={setBulkPreviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-[#f8f4ed] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              Massenänderung prüfen
            </DialogTitle>
            <DialogDescription>
              Erst mit der Bestätigung werden die gemeinsamen Felder bei allen
              ausgewählten Artikeln überschrieben.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <section className="rounded-xl border bg-white/70 p-4">
              <h3 className="text-sm font-medium">Geplante Änderungen</h3>
              <dl className="mt-3 grid gap-2">
                {bulkChanges.map(([label, value]) => (
                  <div
                    key={label}
                    className="grid gap-1 border-b pb-2 text-sm last:border-0 last:pb-0 sm:grid-cols-[11rem_1fr]"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium wrap-break-word">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="rounded-xl border bg-white/70 p-4">
              <h3 className="text-sm font-medium">
                Betroffene Artikel · {selectedProducts.length}
              </h3>
              <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                {selectedProducts.slice(0, 12).map((product) => (
                  <li key={string(product.id)} className="truncate">
                    {string(product.name)}
                  </li>
                ))}
              </ul>
              {selectedProducts.length > 12 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  und {selectedProducts.length - 12} weitere Artikel
                </p>
              ) : null}
            </section>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkPreviewOpen(false)}
              disabled={bulkSaving}
            >
              Zurück
            </Button>
            <Button
              type="button"
              disabled={!bulkChanges.length || bulkSaving}
              onClick={async () => {
                setBulkSaving(true);
                const saved = await onBulkEdit(selectedIds, bulkValues);
                setBulkSaving(false);
                if (saved) {
                  setBulkPreviewOpen(false);
                  setSelectedIds([]);
                  resetBulkEdit();
                }
              }}
            >
              {bulkSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {selectedIds.length} Artikel ändern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {moreFilters ? (
        <div className="mt-3 grid gap-3 rounded-2xl border bg-white/55 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Kategorie
            <select
              className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Alle Kategorien</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Familie
            <select
              className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
              value={familyId}
              onChange={(event) => setFamilyId(event.target.value)}
            >
              <option value="">Alle Familien</option>
              {rows(data.families).map((item) => (
                <option key={string(item.id)} value={string(item.id)}>
                  {string(item.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Designer / Lizenzgeber
            <select
              className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
              value={designerId}
              onChange={(event) => setDesignerId(event.target.value)}
            >
              <option value="">Alle Designer</option>
              {rows(data.designers).map((item) => (
                <option key={string(item.id)} value={string(item.id)}>
                  {string(item.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground xl:col-span-1">
            Sortierung
            <span className="grid grid-cols-[1fr_auto] gap-2">
              <select
                className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
              >
                <option value="name">Alphabetisch</option>
                <option value="margin">Marge</option>
                <option value="cost">Produktionskosten</option>
                <option value="printTime">Druckdauer</option>
                <option value="updated">Zuletzt bearbeitet</option>
              </select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={
                  sortDirection === 'asc' ? 'Aufsteigend' : 'Absteigend'
                }
                onClick={() =>
                  setSortDirection((value) =>
                    value === 'asc' ? 'desc' : 'asc',
                  )
                }
              >
                {sortDirection === 'asc' ? '↑' : '↓'}
              </Button>
            </span>
          </label>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border bg-white/60 px-4 py-3 text-sm">
        <strong>{products.length} Artikel</strong>
        <span>
          Gewinn im Bestand <strong>{cents(portfolio.profitCents)}</strong>
        </span>
        <span>{portfolio.stock} Stück</span>
        <span>{cents(portfolio.boundCents)} gebunden</span>
        {portfolio.missing ? (
          <span className="text-[#8b5c27]">
            {portfolio.missing} ohne vollständige Kalkulation
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {products.map((product) => {
          const variants = rows(product.variants);
          const isDigital = isDigitalInventoryProduct(product);
          const price = variants.length
            ? Math.min(...variants.map((item) => number(item.priceCents)))
            : number(product.defaultPriceCents);
          const stock = variants.reduce(
            (sum, item) => sum + number(item.quantity),
            0,
          );
          const margin = averageMargin(product);
          const productMetrics = metrics(product);
          const printMinutes = Math.max(
            0,
            ...productMetrics.map((item) => item.printMinutes),
          );
          const grams = Math.max(
            0,
            ...productMetrics.map((item) => item.netGrams + item.wasteGrams),
          );
          const studioStatus = inventoryReviewStatus(product.studioStatus);
          const isFinal = studioStatus === 'final';
          const marketStock = rows(data.marketArticles)
            .filter(
              (article) => string(article.productId) === string(product.id),
            )
            .flatMap((article) => rows(article.variants))
            .reduce((sum, variant) => sum + number(variant.quantityInStock), 0);
          return (
            <article
              key={string(product.id)}
              className={
                'group relative overflow-hidden rounded-[24px] border bg-white/75 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ' +
                (selectedIds.includes(string(product.id))
                  ? 'ring-2 ring-[var(--fp-primary)]'
                  : '')
              }
            >
              <label
                className="absolute top-5 left-5 z-10 grid size-9 cursor-pointer place-items-center rounded-full border bg-white/95 shadow-sm"
                aria-label={string(product.name) + ' auswählen'}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(string(product.id))}
                  onChange={(event) =>
                    setSelectedIds((current) =>
                      event.target.checked
                        ? current.includes(string(product.id))
                          ? current
                          : [...current, string(product.id)]
                        : current.filter((id) => id !== string(product.id)),
                    )
                  }
                  className="size-4"
                />
              </label>
              <div className="overflow-hidden rounded-[18px] bg-[var(--fp-mist)]">
                <InventoryImage
                  product={product}
                  alt={string(product.name, 'Artikelbild')}
                />
              </div>
              <div className="p-2 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-medium leading-tight">
                      {string(product.name)}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {[
                        string(product.category),
                        familyName(product, data),
                        designerName(product, data),
                        string(product.size),
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Ohne Zuordnung'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {product.archivedAt ? (
                      <Badge variant="outline">Archiv</Badge>
                    ) : (
                      <Badge variant={isFinal ? 'default' : 'outline'}>
                        {isFinal
                          ? 'Final'
                          : studioStatus === 'customer_order'
                            ? 'Kundenauftrag'
                            : 'Entwurf'}
                      </Badge>
                    )}
                    {boolean(product.etsyListed) ? (
                      <Badge variant="outline">Etsy</Badge>
                    ) : null}
                  </div>
                </div>
                {productMissing(product) ? (
                  <p className="mt-3 rounded-lg bg-[#f3eadb] px-2.5 py-2 text-xs text-[#795124]">
                    {isFinal
                      ? 'Kalkulation prüfen'
                      : 'Produktionsdaten unvollständig'}
                  </p>
                ) : null}
                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Bestand</dt>
                    <dd className="mt-1 font-medium">
                      {isDigital ? (
                        'Unbegrenzt'
                      ) : (
                        <>
                          {stock}
                          {marketStock ? ` + ${marketStock} vor Ort` : ''}
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Preis</dt>
                    <dd className="mt-1 font-medium">{cents(price)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Marge</dt>
                    <dd className="mt-1 font-medium">
                      {margin == null ? 'unklar' : `${margin.toFixed(1)} %`}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {isDigital ? (
                    <>
                      {variants.length || 1}{' '}
                      {(variants.length || 1) === 1 ? 'Variante' : 'Varianten'}{' '}
                      · digitale Datei · kein Stücklimit
                    </>
                  ) : (
                    <>
                      {variants.length}{' '}
                      {variants.length === 1 ? 'Variante' : 'Varianten'} ·{' '}
                      {duration(printMinutes)} · {decimalInputValue(grams)} g
                    </>
                  )}
                </p>
                <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => onEdit(product)}
                  >
                    <Pencil className="size-4" /> Bearbeiten
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    disabled={Boolean(duplicatingProductId)}
                    onClick={() => onDuplicate(product)}
                  >
                    {duplicatingProductId === string(product.id) ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    Duplizieren
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Weitere Optionen für ${string(product.name)}`}
                      className="grid size-9 place-items-center rounded-lg border bg-white hover:bg-[var(--fp-mist)]"
                    >
                      <MoreHorizontal className="size-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => onListing(product)}>
                        <Sparkles /> Für Etsy öffnen
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onArchive(product)}>
                        <Archive />
                        {product.archivedAt ? 'Aktivieren' : 'Archivieren'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onTrash(product)}
                      >
                        <Trash2 /> Löschen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </article>
          );
        })}
        {!products.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Keine passenden Artikel gefunden.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Materials({
  data,
  search,
  setSearch,
  onEdit,
  onNew,
  onTrash,
}: {
  data: AreaData;
  search: string;
  setSearch: (value: string) => void;
  onEdit: (row: Row) => void;
  onNew: () => void;
  onTrash: (row: Row) => void;
}) {
  const items = rows(data.materials).filter((item) =>
    [item.name, item.variant, item.materialType, object(item.brand).name]
      .join(' ')
      .toLocaleLowerCase('de')
      .includes(search.trim().toLocaleLowerCase('de')),
  );
  return (
    <section className="mt-6">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="bg-white pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Material, Marke oder Farbe suchen"
          />
        </div>
        <Button onClick={onNew}>
          <Plus className="size-4" /> Material
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const image = rows(item.studioImages)[0];
          return (
            <article
              key={string(item.id)}
              className="overflow-hidden rounded-2xl border bg-white/65"
            >
              {image ? (
                <div className="relative aspect-[16/7] bg-[#ebe5db]">
                  <Image
                    src={string(image.url)}
                    alt={string(item.name, 'Materialbild')}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 420px"
                    className="object-cover"
                  />
                </div>
              ) : null}
              <div className="p-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <h2 className="font-medium">{string(item.name)}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        string(object(item.brand).name),
                        string(item.materialType),
                        string(item.variant),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {string(item.status, 'offen').replace('_', ' ')}
                  </Badge>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Menge</dt>
                    <dd className="mt-1 font-medium">
                      {number(item.quantity)} {string(item.unit)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Rollenpreis</dt>
                    <dd className="mt-1 font-medium">
                      {cents(item.pricePerRollCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Lagerorte</dt>
                    <dd className="mt-1 font-medium">
                      {rows(item.locations).length ||
                        (item.storageLocationId ? 1 : 0)}
                    </dd>
                  </div>
                </dl>
                {rows(item.locations).length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rows(item.locations).map((location) => (
                      <Badge key={string(location.id)} variant="outline">
                        {string(
                          object(location.storageLocation).name,
                          'Lagerort',
                        )}
                        : {number(location.quantity)} {string(item.unit)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => onEdit(item)}
                  >
                    <Pencil className="size-4" /> Bearbeiten
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-700"
                    onClick={() => onTrash(item)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Markets({
  data,
  kind = 'market',
  onEdit,
  onNew,
  onOpen,
  onCopy,
  onTrash,
}: {
  data: AreaData;
  kind?: 'market' | 'shelf';
  onEdit: (row: Row) => void;
  onNew: () => void;
  onOpen: (row: Row) => void;
  onCopy: (row: Row) => void;
  onTrash: (row: Row) => void;
}) {
  const items = rows(data.markets).filter(
    (item) => string(item.venueKind, 'market') === kind,
  );
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-2xl">
            {kind === 'shelf'
              ? 'Aktuelle und vergangene Regalflächen'
              : 'Aktuelle und vergangene Märkte'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bestand, Verkäufe, Ausgaben und Bedarf pro{' '}
            {kind === 'shelf' ? 'Mietregal' : 'Markt'}.
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus className="size-4" />{' '}
          {kind === 'shelf' ? 'Regalfläche' : 'Markt'}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map((market) => {
          const marketArticles = rows(data.articles).filter(
            (item) => string(item.marketId) === string(market.id),
          );
          const marketStock = marketArticles
            .flatMap((article) => rows(article.variants))
            .reduce((sum, variant) => sum + number(variant.quantityInStock), 0);
          const marketSales = rows(data.sales).filter(
            (sale) =>
              !boolean(sale.isCancelled) &&
              string(sale.marketId) === string(market.id),
          );
          const revenue = marketSales.reduce(
            (sum, sale) => sum + saleTotal(sale),
            0,
          );
          return (
            <article
              key={string(market.id)}
              className="rounded-2xl border bg-white/65 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{string(market.name)}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {string(market.location)} · {date(market.date)}
                    {market.endDate ? ' – ' + date(market.endDate) : ''}
                  </p>
                </div>
                <Badge variant="outline">{string(market.status)}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Bestand</div>
                  {marketStock} Stück
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Verkäufe</div>
                  {marketSales.length}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Umsatz</div>
                  {cents(revenue)}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => onOpen(market)}>
                  <CircleDollarSign className="size-4" /> Öffnen / Kasse
                </Button>
                <Button variant="ghost" onClick={() => onEdit(market)}>
                  <Pencil className="size-4" /> Bearbeiten
                </Button>
                <Button
                  variant="ghost"
                  className="text-red-700"
                  onClick={() => onTrash(market)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {!items.length ? (
        <div className="mt-4 rounded-2xl border border-dashed bg-white/45 p-8 text-center text-sm text-muted-foreground">
          Noch keine {kind === 'shelf' ? 'Regalfläche' : 'Märkte'} in diesem
          Bereich.
        </div>
      ) : null}
    </section>
  );
}

function saleTotal(sale: Row) {
  if (string(sale.pricingMode) === 'TOTAL') return number(sale.totalPriceCents);
  return (
    rows(sale.items).reduce(
      (sum, item) =>
        sum + number(item.quantity) * number(item.unitSalePriceCents),
      0,
    ) - number(sale.discountCents)
  );
}

function onlineSaleRevenue(sale: Row) {
  return number(sale.salePriceCents) * Math.max(0, number(sale.quantity, 1));
}

function onlineSaleCost(sale: Row) {
  const perUnit =
    number(sale.filamentCostCents) +
    number(sale.electricityCostCents) +
    number(sale.machineCostCents) +
    number(sale.licenseCostCents) +
    number(sale.depreciationCostCents) +
    number(sale.accessoryCostCents);
  return (
    perUnit * Math.max(0, number(sale.quantity, 1)) +
    Math.max(0, number(sale.shippingCostCents))
  );
}

function OnlineSales({
  items,
  onToggle,
  onEdit,
}: {
  items: Row[];
  onToggle: (row: Row, key: 'isPrinted' | 'isShipped') => void;
  onEdit: (row: Row) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'print' | 'shipping' | 'pickup'>(
    'all',
  );
  const [copied, setCopied] = useState('');
  const visible = items.filter((item) => {
    const pickup =
      string(item.shippingMethod).toLowerCase() === 'abholung' ||
      string(item.fulfillmentMode) === 'pickup';
    if (filter === 'print' && boolean(item.isPrinted)) return false;
    if (filter === 'shipping' && (boolean(item.isShipped) || pickup))
      return false;
    if (filter === 'pickup' && (!pickup || boolean(item.isShipped)))
      return false;
    return [
      item.articleName,
      item.productName,
      item.orderKey,
      item.channel,
      item.shippingRecipient,
    ]
      .join(' ')
      .toLocaleLowerCase('de')
      .includes(search.trim().toLocaleLowerCase('de'));
  });

  async function copyShippingMessage(item: Row) {
    const recipient = string(item.shippingRecipient).trim();
    const greeting = recipient
      ? `Hallo ${recipient.split(/\s+/)[0]},`
      : 'Hallo,';
    const article = string(
      item.articleName || item.productName,
      'deine Bestellung',
    );
    const pickup =
      string(item.shippingMethod).toLowerCase() === 'abholung' ||
      string(item.fulfillmentMode) === 'pickup';
    const message = pickup
      ? `${greeting}\n\n„${article}“ ist fertig und kann jetzt abgeholt werden. Melde dich gern kurz, damit wir einen passenden Zeitpunkt abstimmen können.\n\nLiebe Grüße\nFormPoesie`
      : `${greeting}\n\ndeine Bestellung „${article}“ ist fertig und wurde versendet. Sie ist jetzt auf dem Weg zu dir.\n\nVielen Dank für deine Bestellung und viel Freude damit.\n\nLiebe Grüße\nFormPoesie`;
    await navigator.clipboard.writeText(message);
    setCopied(string(item.id));
    window.setTimeout(() => setCopied(''), 1800);
  }

  return (
    <section className="mt-6">
      <div className="rounded-[24px] border bg-white/65 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              className="bg-white pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Artikel, Empfänger oder Bestellung suchen"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', 'Alle'],
                ['print', 'Offen: Druck'],
                ['shipping', 'Offen: Versand'],
                ['pickup', 'Offen: Abholung'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={filter === value ? 'default' : 'outline'}
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {visible.length} von {items.length} Verkaufspositionen
        </p>
      </div>
      <div className="grid gap-3">
        {visible.map((item) => (
          <article
            key={string(item.id)}
            className="grid gap-4 rounded-2xl border bg-white/65 p-4 lg:grid-cols-[1fr_1fr_auto]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">
                  {string(
                    item.articleName || item.productName,
                    'Online-Bestellung',
                  )}
                </h2>
                <Badge variant="outline">
                  {string(item.channel, 'Online')}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[
                  string(item.orderKey),
                  string(item.customerName || item.shippingRecipient),
                  date(item.date || item.saleDate),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="mt-2 text-sm">
                {number(item.quantity, 1)} × {cents(item.salePriceCents)}
              </p>
              {item.note ? (
                <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
                  {string(item.note)}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Geplant für</div>
                {date(item.printDeadline)}
              </div>
              <div>
                <div className="text-muted-foreground">Versandfrist</div>
                {date(item.shippingDeadline)}
              </div>
              <div>
                <div className="text-muted-foreground">Drucker</div>
                {string(item.printer, '–')}
              </div>
              <div>
                <div className="text-muted-foreground">Versand</div>
                {string(
                  item.shippingMethod,
                  string(item.fulfillmentMode) === 'pickup' ? 'Abholung' : '–',
                )}
              </div>
              <div>
                <div className="text-muted-foreground">Kosten</div>
                {cents(onlineSaleCost(item))}
              </div>
              <div>
                <div className="text-muted-foreground">Ergebnis</div>
                {cents(onlineSaleRevenue(item) - onlineSaleCost(item))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button
                variant={boolean(item.isPrinted) ? 'default' : 'outline'}
                onClick={() => void onToggle(item, 'isPrinted')}
              >
                <Check className="size-4" /> Gedruckt
              </Button>
              <Button
                variant="ghost"
                onClick={() => void copyShippingMessage(item)}
              >
                <ClipboardList className="size-4" />{' '}
                {copied === string(item.id) ? 'Kopiert' : 'Versandnachricht'}
              </Button>
              <Button
                variant={boolean(item.isShipped) ? 'default' : 'outline'}
                onClick={() => void onToggle(item, 'isShipped')}
              >
                <Truck className="size-4" /> Versendet
              </Button>
              {string(item.sourceType) !== 'cash-sale' ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(item)}
                >
                  <Pencil className="size-4" />
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type CartItem = {
  variant: Row;
  articleName: string;
  quantity: number;
};

type GeneralCartItem = {
  product: Row;
  variant: Row;
  quantity: number;
  salePriceCents: number;
  filamentMaterialId: string;
  filamentSearch: string;
  filamentSelections: Array<{
    key: string;
    label: string;
    grams: number;
    materialId: string;
    search: string;
  }>;
};

function cashFilamentParts(product: Row, variant: Row) {
  const variantId = string(variant.id);
  const all = rows(product.filaments);
  const shared = all.filter((row) => !string(row.productVariantId));
  const own = all.filter(
    (row) => variantId && string(row.productVariantId) === variantId,
  );
  const replaced = new Set(
    own
      .map((row) => string(row.part).trim().toLocaleLowerCase('de'))
      .filter(Boolean),
  );
  const filaments = [
    ...shared.filter(
      (row) =>
        !replaced.has(string(row.part).trim().toLocaleLowerCase('de')),
    ),
    ...own,
  ];
  const parts: Array<{
    key: string;
    label: string;
    grams: number;
    materialId: string;
    search: string;
  }> = [];
  const variantGrams = number(variant.grams) + number(variant.wasteGrams);
  if (variantGrams > 0)
    parts.push({
      key: `variant:${variantId || 'standard'}`,
      label: string(variant.part || variant.name, 'Hauptteil'),
      grams: variantGrams,
      materialId: string(variant.materialId || object(variant.material).id),
      search: '',
    });
  filaments.forEach((row, index) => {
    const grams = number(row.grams) + number(row.wasteGrams);
    if (grams <= 0) return;
    parts.push({
      key: `filament:${string(row.id, String(index))}`,
      label: string(row.part || row.name, `Druckteil ${index + 1}`),
      grams,
      materialId: string(row.materialId || object(row.material).id),
      search: '',
    });
  });
  return parts;
}

const GENERAL_SALES_CHANNELS = [
  'Abholung',
  'eBay',
  'eBay Kleinanzeigen',
  'Vinted',
  'Etsy',
  'Bestellformular',
] as const;

function html(value: unknown) {
  return string(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function printInvoice(invoice: Row) {
  const items = rows(invoice.items);
  const business = object(invoice.business);
  const verified = boolean(business.verified);
  const documentTitle = verified ? 'Rechnung' : 'Rechnungsentwurf';
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.opener = null;
  const itemRows = items
    .map(
      (item) =>
        `<tr><td>${html(item.description)}${item.variant ? `<small>${html(item.variant)}</small>` : ''}</td><td>${number(item.quantity, 1)}</td><td>${html(cents(item.unitPriceCents))}</td><td>${html(cents(number(item.quantity, 1) * number(item.unitPriceCents)))}</td></tr>`,
    )
    .join('');
  popup.document
    .write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${html(invoice.invoiceNumber)}</title><style>
    @page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:14px/1.5 Arial,sans-serif;color:#1f2522;margin:0}header{display:flex;justify-content:space-between;gap:30px;border-bottom:2px solid #425b54;padding-bottom:22px}h1{font:36px Georgia,serif;margin:0}.brand{font-size:20px;font-weight:700;color:#425b54}.warning{margin:24px 0;padding:12px;border:2px solid #a86d32;background:#fff8ed;font-weight:700}.meta{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin:28px 0;white-space:pre-line}.meta h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#66716d}table{width:100%;border-collapse:collapse;margin-top:28px}th,td{padding:10px 8px;border-bottom:1px solid #ccd2cf;text-align:left}th:nth-child(n+2),td:nth-child(n+2){text-align:right}small{display:block;color:#66716d}.totals{margin:24px 0 0 auto;width:280px}.totals div{display:flex;justify-content:space-between;padding:5px}.totals .total{border-top:2px solid #425b54;font-size:18px;font-weight:700;margin-top:6px;padding-top:10px}footer{margin-top:70px;border-top:1px solid #ccd2cf;padding-top:14px;color:#66716d;font-size:12px}@media print{button{display:none}}</style></head><body>
    <header><div><div class="brand">${html(business.name || 'FormPoesie')}</div><div>${html(business.street)} · ${html(business.postalCode)} ${html(business.city)}</div><div>USt-IdNr. ${html(business.vatId)}</div></div><div><h1>${documentTitle}</h1><div>${html(invoice.invoiceNumber)}</div></div></header>
    ${verified ? '' : '<div class="warning">ENTWURF – noch nicht als steuerliche Rechnung verwenden. Unternehmens- und Steuerangaben müssen zuerst verifiziert werden.</div>'}
    <div class="meta"><section><h2>Rechnung an</h2><strong>${html(invoice.customerName)}</strong><br>${html(invoice.customerAddress).replaceAll('\n', '<br>')}<br>${html(invoice.customerEmail)}</section><section><h2>Angaben</h2>Rechnungsdatum: ${html(date(invoice.issueDate))}<br>Leistungsdatum entspricht dem Rechnungsdatum.<br>Verkaufskanal: ${html(invoice.channel)}<br>Bestellung: ${html(invoice.orderKey || '–')}</section></div>
    <table><thead><tr><th>Position</th><th>Menge</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead><tbody>${itemRows}${number(invoice.shippingCents) ? `<tr><td>Versand</td><td>1</td><td>${html(cents(invoice.shippingCents))}</td><td>${html(cents(invoice.shippingCents))}</td></tr>` : ''}</tbody></table>
    <div class="totals"><div><span>Zwischensumme</span><span>${html(cents(invoice.subtotalCents))}</span></div>${number(invoice.shippingCents) ? `<div><span>Versand</span><span>${html(cents(invoice.shippingCents))}</span></div>` : ''}<div class="total"><span>Gesamt</span><span>${html(cents(invoice.totalCents))}</span></div></div>
    <section style="margin-top:35px"><strong>Zahlung</strong><p>PayPal: ${html(business.paypal)}<br>Überweisung: IBAN ${html(business.iban)} · BIC ${html(business.bic)}</p></section>
    <p>${html(business.taxNote)}</p>${invoice.note ? `<p><strong>Hinweis:</strong> ${html(invoice.note)}</p>` : ''}<footer>${html(business.name || 'FormPoesie')} · ${html(business.street)} · ${html(business.postalCode)} ${html(business.city)} · USt-IdNr. ${html(business.vatId)}</footer><script>window.addEventListener('load',()=>window.print())</script></body></html>`);
  popup.document.close();
  return true;
}

function InvoiceDialog({
  invoice,
  onClose,
}: {
  invoice: Row | null;
  onClose: () => void;
}) {
  if (!invoice) return null;
  const business = object(invoice.business);
  const verified = boolean(business.verified);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-[#f8f4ed] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-3xl">
            {verified ? 'Rechnung' : 'Rechnungsentwurf'}{' '}
            {string(invoice.invoiceNumber)}
          </DialogTitle>
          <DialogDescription>
            Gespeicherter Stand zur Bestellung {string(invoice.orderKey, '–')}
          </DialogDescription>
        </DialogHeader>
        {!verified ? (
          <div className="rounded-xl border border-amber-700/40 bg-amber-50 p-3 text-sm text-amber-950">
            Noch nicht als steuerliche Rechnung verwenden: Unternehmens- und
            Steuerangaben sind nicht verifiziert.
          </div>
        ) : null}
        <div className="grid gap-4 rounded-2xl border bg-white/70 p-5 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Rechnung an</p>
            <p className="font-medium">{string(invoice.customerName)}</p>
            <p className="mt-1 whitespace-pre-line text-sm">
              {string(invoice.customerAddress)}
            </p>
            <p className="text-sm">{string(invoice.customerEmail)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rechnungsdatum</p>
            <p>{date(invoice.issueDate)}</p>
            <p className="mt-3 text-xs text-muted-foreground">Kanal</p>
            <p>{string(invoice.channel)}</p>
          </div>
          <div className="sm:col-span-2 space-y-2">
            {rows(invoice.items).map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_auto] gap-3 border-t pt-2 text-sm"
              >
                <span>
                  {number(item.quantity, 1)} × {string(item.description)}{' '}
                  <span className="text-muted-foreground">
                    {string(item.variant)}
                  </span>
                </span>
                <strong>
                  {cents(
                    number(item.quantity, 1) * number(item.unitPriceCents),
                  )}
                </strong>
              </div>
            ))}
            {number(invoice.shippingCents) ? (
              <div className="flex justify-between border-t pt-2 text-sm">
                <span>Versand</span>
                <strong>{cents(invoice.shippingCents)}</strong>
              </div>
            ) : null}
            <div className="flex justify-between border-t-2 pt-3 text-lg">
              <strong>Gesamt</strong>
              <strong>{cents(invoice.totalCents)}</strong>
            </div>
          </div>
          {verified ? (
            <div className="space-y-2 border-t pt-4 text-sm sm:col-span-2">
              <p>{string(business.taxNote)}</p>
              <p>
                <strong>PayPal:</strong> {string(business.paypal)}
                <br />
                <strong>Überweisung:</strong> IBAN {string(business.iban)} · BIC{' '}
                {string(business.bic)}
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          {invoice.customerEmail ? (
            <a
              className="inline-flex h-9 items-center justify-center rounded-lg border bg-white px-4 text-sm"
              href={`mailto:${encodeURIComponent(string(invoice.customerEmail))}?subject=${encodeURIComponent((verified ? 'Rechnung ' : 'Rechnungsentwurf ') + string(invoice.invoiceNumber))}&body=${encodeURIComponent('Hallo ' + string(invoice.customerName) + `,\n\nanbei erhältst du ${verified ? 'die Rechnung ' : 'den Rechnungsentwurf '}` + string(invoice.invoiceNumber) + '. Bitte die zuvor als PDF gespeicherte Datei anhängen.\n\nLiebe Grüße\nFormPoesie')}`}
            >
              E-Mail vorbereiten
            </a>
          ) : null}
          <Button onClick={() => printInvoice(invoice)}>
            <Printer className="size-4" /> Drucken / als PDF sichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GeneralCashRegister({
  data,
  onBooked,
}: {
  data: AreaData;
  onBooked: () => void;
}) {
  const products = rows(data.products);
  const components = rows(data.components);
  const materials = useMemo(
    () =>
      rows(data.materials).sort((left, right) =>
        materialChoiceLabel(left).localeCompare(
          materialChoiceLabel(right),
          'de',
          {
            numeric: true,
            sensitivity: 'base',
          },
        ),
      ),
    [data.materials],
  );
  const customers = rows(data.customers);
  const [channel, setChannel] =
    useState<(typeof GENERAL_SALES_CHANNELS)[number]>('Abholung');
  const [saleDate, setSaleDate] = useState(() =>
    new Intl.DateTimeFormat('sv-SE').format(new Date()),
  );
  const [search, setSearch] = useState('');
  const [recipient, setRecipient] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [plannedFor, setPlannedFor] = useState('');
  const [shippingDeadline, setShippingDeadline] = useState('');
  const [combinedPrint, setCombinedPrint] = useState(false);
  const [combinedPrintHours, setCombinedPrintHours] = useState('');
  const [combinedPrintMinutes, setCombinedPrintMinutes] = useState('');
  const [combinedWeight, setCombinedWeight] = useState('');
  const [note, setNote] = useState('');
  const [issueInvoice, setIssueInvoice] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [saveCustomer, setSaveCustomer] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Row | null>(null);
  const [cart, setCart] = useState<GeneralCartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const choices = products
    .flatMap((product) => {
      const variants = rows(product.variants);
      return (variants.length ? variants : [{}]).map((variant) => ({
        product,
        variant,
      }));
    })
    .filter(({ product, variant }) =>
      [
        product.name,
        product.category,
        variant.name,
        variant.appearance,
        variant.size,
      ]
        .join(' ')
        .toLocaleLowerCase('de')
        .includes(search.trim().toLocaleLowerCase('de')),
    )
    .sort((left, right) => {
      const productOrder = string(left.product.name).localeCompare(
        string(right.product.name),
        'de',
        { numeric: true, sensitivity: 'base' },
      );
      if (productOrder) return productOrder;
      return cashVariantLabel(left.product, left.variant).localeCompare(
        cashVariantLabel(right.product, right.variant),
        'de',
        { numeric: true, sensitivity: 'base' },
      );
    });
  const total = cart.reduce(
    (sum, item) => sum + item.quantity * item.salePriceCents,
    0,
  );
  const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0);
  const combinedMinutes =
    Math.max(0, Math.trunc(Number(combinedPrintHours) || 0)) * 60 +
    Math.min(59, Math.max(0, Math.trunc(Number(combinedPrintMinutes) || 0)));
  const combinedGrams = Math.max(0, decimalInputNumber(combinedWeight) || 0);
  const shippingCostCents = Math.max(
    0,
    Math.round(Number(shippingCost.replace(',', '.')) * 100) || 0,
  );

  function cashVariantLabel(product: Row, variant: Row) {
    const breakdown = variantCostBreakdown(
      product,
      variant,
      products,
      components,
    );
    const grams = breakdown.netGrams;
    const explicitSize = [variant.name, variant.size]
      .map(
        (value) => string(value).match(/\b(klein|mittel|groß|gross)\b/i)?.[0],
      )
      .find(Boolean);
    const productVariants = rows(product.variants);
    const variantIndex = productVariants.findIndex(
      (item) => string(item.id) === string(variant.id),
    );
    const inferredSize =
      !explicitSize && productVariants.length >= 6 && variantIndex >= 0
        ? ['Klein', 'Mittel', 'Groß'][Math.floor(variantIndex / 3)] || ''
        : '';
    const sizeLabel = explicitSize
      ? explicitSize.toLocaleLowerCase('de') === 'gross'
        ? 'Groß'
        : explicitSize[0].toLocaleUpperCase('de') + explicitSize.slice(1)
      : inferredSize;
    if (grams > 0)
      return `${sizeLabel ? `${sizeLabel} ` : ''}${decimalInputValue(grams)} g`;
    return isDigitalInventoryProduct(product)
      ? 'Digitale Datei'
      : 'Gewicht fehlt';
  }

  function productionForCartItem(item: GeneralCartItem) {
    const breakdown = variantCostBreakdown(
      item.product,
      item.variant,
      products,
      components,
    );
    const applyActualFilament = (production: {
      printMinutes: number;
      filamentGrams: number;
      filamentCostCents: number;
      electricityCostCents: number;
      machineCostCents: number;
    }) => {
      if (item.filamentSelections.length) {
        const originalTotal = item.filamentSelections.reduce(
          (sum, part) => sum + part.grams,
          0,
        );
        const scale =
          originalTotal > 0 ? production.filamentGrams / originalTotal : 1;
        return {
          ...production,
          filamentCostCents: item.filamentSelections.reduce((sum, part) => {
            const material = materials.find(
              (entry) => string(entry.id) === part.materialId,
            );
            return (
              sum +
              filamentCostCents(
                part.grams * scale,
                number(material?.pricePerRollCents),
                number(material?.spoolWeightGrams),
              )
            );
          }, 0),
        };
      }
      const material = materials.find(
        (entry) => string(entry.id) === item.filamentMaterialId,
      );
      if (
        !material ||
        number(material.pricePerRollCents) <= 0 ||
        number(material.spoolWeightGrams) <= 0
      )
        return production;
      return {
        ...production,
        filamentCostCents: filamentCostCents(
          production.filamentGrams,
          number(material.pricePerRollCents),
          number(material.spoolWeightGrams),
        ),
      };
    };
    if (!combinedPrint || combinedMinutes <= 0 || combinedGrams <= 0)
      return applyActualFilament({
        printMinutes: breakdown.printMinutes,
        filamentGrams: breakdown.netGrams + breakdown.wasteGrams,
        filamentCostCents: breakdown.filamentCents + breakdown.wasteCents,
        electricityCostCents: breakdown.electricityCents,
        machineCostCents: breakdown.machineCents,
      });
    const expectedMinutes = cart.reduce((sum, entry) => {
      const value = variantCostBreakdown(
        entry.product,
        entry.variant,
        products,
        components,
      );
      return sum + value.printMinutes * entry.quantity;
    }, 0);
    const expectedGrams = cart.reduce((sum, entry) => {
      const value = variantCostBreakdown(
        entry.product,
        entry.variant,
        products,
        components,
      );
      return sum + (value.netGrams + value.wasteGrams) * entry.quantity;
    }, 0);
    const originalGrams = breakdown.netGrams + breakdown.wasteGrams;
    const printMinutes =
      expectedMinutes > 0
        ? (combinedMinutes * breakdown.printMinutes) / expectedMinutes
        : combinedMinutes / Math.max(1, totalUnits);
    const filamentGrams =
      expectedGrams > 0
        ? (combinedGrams * originalGrams) / expectedGrams
        : combinedGrams / Math.max(1, totalUnits);
    const timeScale =
      breakdown.printMinutes > 0 ? printMinutes / breakdown.printMinutes : 0;
    const weightScale = originalGrams > 0 ? filamentGrams / originalGrams : 0;
    return applyActualFilament({
      printMinutes,
      filamentGrams,
      filamentCostCents:
        (breakdown.filamentCents + breakdown.wasteCents) * weightScale,
      electricityCostCents: breakdown.electricityCents * timeScale,
      machineCostCents: breakdown.machineCents * timeScale,
    });
  }

  function adjustedUnitCost(item: GeneralCartItem) {
    const production = productionForCartItem(item);
    const breakdown = variantCostBreakdown(
      item.product,
      item.variant,
      products,
      components,
    );
    return (
      production.filamentCostCents +
      production.electricityCostCents +
      production.machineCostCents +
      breakdown.extraCents +
      breakdown.componentsCents
    );
  }

  const adjustedProductionTotal = cart.reduce(
    (sum, item) => sum + adjustedUnitCost(item) * item.quantity,
    0,
  );
  const adjustedMargin = total - adjustedProductionTotal - shippingCostCents;
  const adjustedMarginPercent = total > 0 ? (adjustedMargin / total) * 100 : 0;
  const incompleteFilamentItems = cart.filter((item) => {
    if (isDigitalInventoryProduct(item.product)) return false;
    const selections = item.filamentSelections.length
      ? item.filamentSelections
      : [
          {
            materialId: item.filamentMaterialId,
            grams: variantCostBreakdown(
              item.product,
              item.variant,
              products,
              components,
            ).netGrams,
          },
        ];
    return selections.some((selection) => {
      if (selection.grams <= 0) return false;
      const material = materials.find(
        (entry) => string(entry.id) === selection.materialId,
      );
      return (
        !material ||
        number(material.pricePerRollCents) <= 0 ||
        number(material.spoolWeightGrams) <= 0
      );
    });
  });

  function itemKey(product: Row, variant: Row) {
    return `${string(product.id)}:${string(variant.id, 'standard')}`;
  }

  function add(product: Row, variant: Row) {
    const key = itemKey(product, variant);
    const price = priceForSalesChannel(product, variant, channel);
    setCart((current) => {
      const match = current.find(
        (item) => itemKey(item.product, item.variant) === key,
      );
      if (match)
        return current.map((item) =>
          item === match ? { ...item, quantity: item.quantity + 1 } : item,
        );
      const relevantFilaments = rows(product.filaments).filter(
        (row) =>
          !string(row.productVariantId) ||
          string(row.productVariantId) === string(variant.id),
      );
      const defaultMaterialId = string(
        variant.materialId ||
          relevantFilaments.find((row) => number(row.materialId) > 0)
            ?.materialId,
      );
      const filamentSelections = cashFilamentParts(product, variant);
      return [
        ...current,
        {
          product,
          variant,
          quantity: 1,
          salePriceCents: price,
          filamentMaterialId: defaultMaterialId,
          filamentSearch: '',
          filamentSelections:
            filamentSelections.length > 0
              ? filamentSelections
              : [
                  {
                    key: 'aggregate',
                    label: 'Gesamter Druck',
                    grams:
                      variantCostBreakdown(
                        product,
                        variant,
                        products,
                        components,
                      ).netGrams +
                      variantCostBreakdown(
                        product,
                        variant,
                        products,
                        components,
                      ).wasteGrams,
                    materialId: defaultMaterialId,
                    search: '',
                  },
                ],
        },
      ];
    });
  }

  function patchCart(key: string, values: Partial<GeneralCartItem>) {
    setCart((current) =>
      current
        .map((item) =>
          itemKey(item.product, item.variant) === key
            ? { ...item, ...values }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function patchFilamentSelection(
    itemKeyValue: string,
    partKey: string,
    values: Partial<GeneralCartItem['filamentSelections'][number]>,
  ) {
    setCart((current) =>
      current.map((item) =>
        itemKey(item.product, item.variant) === itemKeyValue
          ? {
              ...item,
              filamentSelections: item.filamentSelections.map((part) =>
                part.key === partKey ? { ...part, ...values } : part,
              ),
            }
          : item,
      ),
    );
  }

  function selectCustomer(id: string) {
    setCustomerId(id);
    setSaveCustomer(false);
    if (!id) {
      setRecipient('');
      setCustomerEmail('');
      setCustomerAddress('');
      return;
    }
    const customer = customers.find((item) => string(item.id) === id);
    if (!customer) return;
    setRecipient(string(customer.name));
    setCustomerEmail(string(customer.email));
    setCustomerAddress(string(customer.address));
  }

  async function book() {
    if (!cart.length || saving) return;
    if (incompleteFilamentItems.length) {
      setMessage(
        'Bitte für jeden gedruckten Artikel ein Filament mit Rollenpreis und Rollengewicht auswählen.',
      );
      return;
    }
    setSaving(true);
    setMessage('');
    const response = await inventoryRequest('/api/inventory/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_online_order',
        order: {
          channel,
          date: saleDate,
          shippingRecipient: recipient,
          shippingCostCents,
          printDeadline: plannedFor,
          shippingDeadline: channel === 'Abholung' ? '' : shippingDeadline,
          note: note.trim(),
          issueInvoice,
          customerId,
          saveCustomer: saveCustomer && !customerId,
          customerName: recipient,
          customerEmail,
          customerAddress,
        },
        items: cart.map((item) => {
          const breakdown = variantCostBreakdown(
            item.product,
            item.variant,
            products,
            components,
          );
          const production = productionForCartItem(item);
          const originalPartGrams = item.filamentSelections.reduce(
            (sum, part) => sum + part.grams,
            0,
          );
          const partScale =
            originalPartGrams > 0
              ? production.filamentGrams / originalPartGrams
              : 1;
          const filamentSelections = item.filamentSelections.map((part) => {
            const material = materials.find(
              (entry) => string(entry.id) === part.materialId,
            );
            const grams = Math.max(0, Math.round(part.grams * partScale));
            return {
              partKey: part.key,
              partLabel: part.label,
              materialId: number(part.materialId),
              grams,
              costCents: filamentCostCents(
                grams,
                number(material?.pricePerRollCents),
                number(material?.spoolWeightGrams),
              ),
            };
          });
          return {
            productId: number(item.product.id),
            articleName: string(item.product.name, 'Artikel'),
            size: string(
              item.variant.size || item.variant.name || item.product.size,
            ),
            quantity: item.quantity,
            printer: string(item.variant.printer || item.product.printer),
            printMinutes: production.printMinutes,
            filamentMaterialId: number(item.filamentMaterialId),
            filamentGrams: production.filamentGrams,
            filamentCostCents: production.filamentCostCents,
            filamentSelections,
            electricityCostCents: production.electricityCostCents,
            machineCostCents: production.machineCostCents,
            accessoryCostCents:
              breakdown.extraCents + breakdown.componentsCents,
            salePriceCents: item.salePriceCents,
          };
        }),
      }),
    });
    const result = (await response.json()) as {
      error?: string;
      orderKey?: string;
      invoice?: Row;
      invoiceError?: string;
    };
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || 'Verkauf konnte nicht gespeichert werden.');
      return;
    }
    setMessage(
      result.invoiceError
        ? `Verkauf gespeichert. Die Rechnung konnte nicht angelegt werden: ${result.invoiceError}`
        : `Verkauf ${result.orderKey ? result.orderKey + ' ' : ''}gespeichert.${result.invoice ? ' Rechnung angelegt.' : ''} Offene Positionen stehen auf der Übersicht unter Druck & Versand.`,
    );
    if (result.invoice) setSelectedInvoice(result.invoice);
    setCart([]);
    setRecipient('');
    setShippingCost('');
    setPlannedFor('');
    setShippingDeadline('');
    setCombinedPrint(false);
    setCombinedPrintHours('');
    setCombinedPrintMinutes('');
    setCombinedWeight('');
    setNote('');
    setCustomerEmail('');
    setCustomerAddress('');
    setCustomerId('');
    setSaveCustomer(false);
    setIssueInvoice(false);
    onBooked();
  }

  return (
    <>
      <section className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
        <div className="rounded-[26px] border bg-white/65 p-5 md:p-6">
          <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            Allgemeiner Verkauf
          </p>
          <h2 className="mt-1 font-heading text-3xl">Kasse</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Märkte und Regalflächen werden ausschließlich in ihrem eigenen
            Bereich gebucht.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Verkaufsort
              <select
                className="h-10 rounded-lg border bg-white px-3 text-sm text-foreground"
                value={channel}
                onChange={(event) => {
                  const next = event.target
                    .value as (typeof GENERAL_SALES_CHANNELS)[number];
                  setChannel(next);
                  setCart((current) =>
                    current.map((item) => ({
                      ...item,
                      salePriceCents: priceForSalesChannel(
                        item.product,
                        item.variant,
                        next,
                      ),
                    })),
                  );
                }}
              >
                {GENERAL_SALES_CHANNELS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Verkaufsdatum"
              type="date"
              value={saleDate}
              onChange={setSaleDate}
            />
            <Field
              label="Auftrag geplant für"
              type="date"
              value={plannedFor}
              onChange={setPlannedFor}
            />
            <Field
              label={
                issueInvoice
                  ? 'Kundenname (erforderlich)'
                  : channel === 'Abholung'
                    ? 'Name (optional)'
                    : 'Empfänger (optional)'
              }
              value={recipient}
              onChange={setRecipient}
            />
            {channel !== 'Abholung' ? (
              <>
                <Field
                  label="Versand spätestens bis"
                  type="date"
                  value={shippingDeadline}
                  onChange={setShippingDeadline}
                />
                <Field
                  label="Versandkosten in €"
                  value={shippingCost}
                  onChange={setShippingCost}
                />
              </>
            ) : (
              <div />
            )}
          </div>
          <div className="relative mt-4">
            <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              className="bg-white pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Artikel oder Variante suchen"
            />
          </div>
          <div className="mt-3 grid max-h-[500px] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
            {choices.map(({ product, variant }) => {
              const price = priceForSalesChannel(product, variant, channel);
              return (
                <button
                  type="button"
                  key={itemKey(product, variant)}
                  onClick={() => add(product, variant)}
                  className="flex items-center gap-3 rounded-xl border bg-white/70 p-3 text-left transition hover:border-[var(--fp-primary)]"
                >
                  <div className="size-14 shrink-0">
                    <InventoryImage
                      product={{
                        ...product,
                        variants: variant.id ? [variant] : [],
                      }}
                      alt={string(product.name)}
                    />
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {string(product.name)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {cashVariantLabel(product, variant)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold">{cents(price)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <aside className="rounded-[26px] border bg-[var(--fp-ink)] p-5 text-[var(--fp-paper)] md:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-2xl">Warenkorb</h2>
            <Badge className="bg-white/10 text-white">
              {cart.reduce((sum, item) => sum + item.quantity, 0)} Stück
            </Badge>
          </div>
          <div className="mt-5 space-y-3">
            {cart.map((item) => {
              const key = itemKey(item.product, item.variant);
              const unitCost = adjustedUnitCost(item);
              const itemMargin =
                (item.salePriceCents - unitCost) * item.quantity;
              return (
                <div
                  key={key}
                  className="rounded-xl border border-white/15 p-3"
                >
                  <div className="text-sm font-medium">
                    {string(item.product.name)}
                  </div>
                  <div className="text-xs text-white/60">
                    {cashVariantLabel(item.product, item.variant)}
                  </div>
                  {!isDigitalInventoryProduct(item.product) ? (
                    <div className="mt-3 grid gap-2">
                      {item.filamentSelections.map((part) => {
                        const query = part.search
                          .trim()
                          .toLocaleLowerCase('de');
                        const matching = materials.filter((material) =>
                          [
                            materialChoiceLabel(material),
                            material.name,
                            material.materialType,
                          ]
                            .join(' ')
                            .toLocaleLowerCase('de')
                            .includes(query),
                        );
                        const selected = materials.find(
                          (material) =>
                            string(material.id) === part.materialId,
                        );
                        const visible =
                          selected &&
                          !matching.some(
                            (material) =>
                              string(material.id) === part.materialId,
                          )
                            ? [selected, ...matching]
                            : matching;
                        return (
                          <div
                            key={part.key}
                            className="grid gap-2 rounded-lg border border-white/15 p-2"
                          >
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <strong>{part.label}</strong>
                              <span className="text-white/60">
                                {decimalInputValue(part.grams)} g
                              </span>
                            </div>
                            <Input
                              aria-label={`Filament für ${part.label} suchen`}
                              className="h-9 bg-white text-black"
                              value={part.search}
                              onChange={(event) =>
                                patchFilamentSelection(key, part.key, {
                                  search: event.target.value,
                                })
                              }
                              placeholder="Marke, Farbe oder Art"
                            />
                            <select
                              aria-label={`Verwendetes Filament für ${part.label}`}
                              className="h-9 min-w-0 rounded-lg border border-white/20 bg-white px-2 text-sm text-black"
                              value={part.materialId}
                              onChange={(event) =>
                                patchFilamentSelection(key, part.key, {
                                  materialId: event.target.value,
                                })
                              }
                            >
                              <option value="">Filament auswählen</option>
                              {visible.map((material) => (
                                <option
                                  key={string(material.id)}
                                  value={string(material.id)}
                                >
                                  {materialChoiceOption(material)}
                                </option>
                              ))}
                            </select>
                            {query && !visible.length ? (
                              <p className="text-xs text-amber-200">
                                Kein passendes Filament gefunden.
                              </p>
                            ) : null}
                            {selected &&
                            (number(selected.pricePerRollCents) <= 0 ||
                              number(selected.spoolWeightGrams) <= 0) ? (
                              <p className="text-xs text-amber-200">
                                Bei dieser Rolle fehlen Preis oder Rollengewicht.
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          patchCart(key, { quantity: item.quantity - 1 })
                        }
                      >
                        −
                      </Button>
                      <span className="min-w-6 text-center text-sm">
                        {item.quantity}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          patchCart(key, { quantity: item.quantity + 1 })
                        }
                      >
                        +
                      </Button>
                    </div>
                    <Input
                      aria-label={`Einzelpreis ${string(item.product.name)}`}
                      className="h-9 bg-white text-black"
                      value={(item.salePriceCents / 100)
                        .toFixed(2)
                        .replace('.', ',')}
                      onChange={(event) =>
                        patchCart(key, {
                          salePriceCents: Math.max(
                            0,
                            Math.round(
                              Number(event.target.value.replace(',', '.')) *
                                100,
                            ) || 0,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="mt-2 text-xs text-white/65">
                    Herstellung {cents(unitCost * item.quantity)} · Marge{' '}
                    {cents(itemMargin)}
                  </div>
                </div>
              );
            })}
            {!cart.length ? (
              <p className="text-sm text-white/60">
                Wähle links einen Artikel aus.
              </p>
            ) : null}
            {incompleteFilamentItems.length ? (
              <p className="rounded-lg border border-amber-300/40 bg-amber-200/10 p-3 text-xs text-amber-100">
                Vor dem Speichern braucht jeder gedruckte Artikel ein Filament
                mit vollständigen Kostendaten.
              </p>
            ) : null}
          </div>
          <div className="mt-6 border-t border-white/15 pt-5">
            <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 p-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={combinedPrint}
                onChange={(event) => setCombinedPrint(event.target.checked)}
              />
              Artikel werden zusammen gedruckt
            </label>
            {combinedPrint ? (
              <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-white/15 p-3">
                <label className="grid gap-1.5 text-xs text-white/65">
                  Druckzeit Stunden
                  <Input
                    type="number"
                    min="0"
                    className="bg-white text-black"
                    value={combinedPrintHours}
                    onChange={(event) =>
                      setCombinedPrintHours(event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-white/65">
                  Minuten
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    className="bg-white text-black"
                    value={combinedPrintMinutes}
                    onChange={(event) =>
                      setCombinedPrintMinutes(event.target.value)
                    }
                  />
                </label>
                <label className="col-span-2 grid gap-1.5 text-xs text-white/65">
                  Gesamtgewicht in g
                  <Input
                    inputMode="decimal"
                    className="bg-white text-black"
                    value={combinedWeight}
                    onChange={(event) => setCombinedWeight(event.target.value)}
                    placeholder="z. B. 228,5"
                  />
                </label>
                {combinedMinutes <= 0 || combinedGrams <= 0 ? (
                  <p className="col-span-2 text-xs text-amber-200">
                    Für einen gemeinsamen Druck werden Druckzeit und
                    Gesamtgewicht benötigt.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-end justify-between">
              <span className="text-sm text-white/65">Gesamtsumme</span>
              <span className="font-heading text-4xl">{cents(total)}</span>
            </div>
            {cart.length ? (
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-white/15 p-3 text-sm">
                <div>
                  <span className="block text-xs text-white/60">
                    Herstellung gesamt
                  </span>
                  <strong>{cents(adjustedProductionTotal)}</strong>
                </div>
                <div>
                  <span className="block text-xs text-white/60">
                    Marge des Verkaufs
                  </span>
                  <strong>
                    {cents(adjustedMargin)} ·{' '}
                    {adjustedMarginPercent.toLocaleString('de-DE', {
                      maximumFractionDigits: 1,
                    })}{' '}
                    %
                  </strong>
                </div>
                {combinedPrint && combinedMinutes > 0 && combinedGrams > 0 ? (
                  <p className="col-span-2 text-xs text-white/65">
                    Mit {duration(combinedMinutes)} gemeinsamer Druckzeit und{' '}
                    {decimalInputValue(combinedGrams)} g Gesamtgewicht neu
                    berechnet.
                  </p>
                ) : null}
              </div>
            ) : null}
            <label className="mt-5 grid gap-1.5 text-xs text-white/65">
              Notiz (optional)
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="border-white/20 bg-white text-black"
              />
            </label>
            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 p-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={issueInvoice}
                onChange={(event) => setIssueInvoice(event.target.checked)}
              />
              Rechnung erstellen
            </label>
            {issueInvoice ? (
              <div className="mt-3 grid gap-3">
                <label className="grid gap-1.5 text-xs text-white/65">
                  Kunde
                  <select
                    className="h-10 rounded-lg border border-white/20 bg-white px-3 text-sm text-black"
                    value={customerId}
                    onChange={(event) => selectCustomer(event.target.value)}
                  >
                    <option value="">Neuen Kunden eingeben</option>
                    {customers.map((customer) => (
                      <option
                        key={string(customer.id)}
                        value={string(customer.id)}
                      >
                        {string(customer.name)}
                        {customer.email ? ` · ${string(customer.email)}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  className="bg-white text-black"
                  type="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  placeholder="E-Mail (optional)"
                />
                <Textarea
                  className="bg-white text-black"
                  value={customerAddress}
                  onChange={(event) => setCustomerAddress(event.target.value)}
                  placeholder="Rechnungsanschrift (erforderlich)"
                />
                {!customerId ? (
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={saveCustomer}
                      onChange={(event) =>
                        setSaveCustomer(event.target.checked)
                      }
                    />
                    Als neuen Kunden speichern
                  </label>
                ) : (
                  <p className="text-xs text-white/65">
                    Die ausgewählten Kundendaten werden in diese Rechnung
                    übernommen.
                  </p>
                )}
                {!recipient.trim() ? (
                  <p className="text-xs text-amber-200">
                    Bitte oben einen Kunden- oder Empfängernamen eintragen.
                  </p>
                ) : null}
                {!customerAddress.trim() ? (
                  <p className="text-xs text-amber-200">
                    Bitte die vollständige Rechnungsanschrift eintragen.
                  </p>
                ) : null}
              </div>
            ) : null}
            <Button
              className="mt-4 w-full bg-[var(--fp-paper)] text-[var(--fp-ink)] hover:bg-white"
              onClick={() => void book()}
              disabled={
                !cart.length ||
                saving ||
                incompleteFilamentItems.length > 0 ||
                (combinedPrint &&
                  (combinedMinutes <= 0 || combinedGrams <= 0)) ||
                (issueInvoice && (!recipient.trim() || !customerAddress.trim()))
              }
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CircleDollarSign className="size-4" />
              )}{' '}
              Verkauf speichern
            </Button>
            {message ? (
              <p className="mt-3 text-xs text-white/75">{message}</p>
            ) : null}
          </div>
        </aside>
      </section>
      <section className="mt-5 rounded-[26px] border bg-white/65 p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
              Gespeichert
            </p>
            <h2 className="font-heading text-2xl">Rechnungen</h2>
          </div>
          <Badge variant="outline">{rows(data.invoices).length}</Badge>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {rows(data.invoices).map((invoice) => (
            <button
              type="button"
              key={string(invoice.id)}
              onClick={() => setSelectedInvoice(invoice)}
              className="flex items-center gap-3 rounded-xl border bg-white p-3 text-left hover:border-[var(--fp-primary)]"
            >
              <FileText className="size-5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {string(invoice.invoiceNumber)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {date(invoice.issueDate)} · {string(invoice.customerName)} ·{' '}
                  {cents(invoice.totalCents)}
                </span>
              </span>
            </button>
          ))}
          {!rows(data.invoices).length ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Rechnungen gespeichert.
            </p>
          ) : null}
        </div>
      </section>
      <InvoiceDialog
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />
    </>
  );
}

function CashRegister({
  data,
  onBooked,
  initialVenueId = '',
  lockVenue = false,
  compact = false,
}: {
  data: AreaData;
  onBooked: () => void;
  initialVenueId?: string;
  lockVenue?: boolean;
  compact?: boolean;
}) {
  const venues = rows(data.markets);
  const articles = rows(data.articles);
  const [venueId, setVenueId] = useState(initialVenueId);
  const [saleDate, setSaleDate] = useState(() =>
    new Intl.DateTimeFormat('sv-SE').format(new Date()),
  );
  const [paymentMethod, setPaymentMethod] = useState('BAR');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [cashGiven, setCashGiven] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const selectedVenue = venues.find((item) => string(item.id) === venueId);
  const variants = articles
    .filter((article) => string(article.marketId) === venueId)
    .flatMap((article) =>
      rows(article.variants).map((variant) => ({
        variant,
        articleName: string(article.name, 'Artikel'),
      })),
    )
    .filter(({ variant, articleName }) =>
      [articleName, variant.color, variant.name, variant.size]
        .join(' ')
        .toLocaleLowerCase('de')
        .includes(search.trim().toLocaleLowerCase('de')),
    );
  const total = cart.reduce(
    (sum, item) => sum + item.quantity * number(item.variant.salePriceCents),
    0,
  );
  const givenCents = Math.round(Number(cashGiven.replace(',', '.')) * 100);
  const change = Number.isFinite(givenCents) ? givenCents - total : null;
  const today = new Intl.DateTimeFormat('sv-SE').format(new Date());

  useEffect(() => {
    if (initialVenueId) {
      setVenueId(initialVenueId);
      setCart([]);
    }
  }, [initialVenueId]);

  function add(articleName: string, variant: Row) {
    setCart((current) => {
      const match = current.find(
        (item) => string(item.variant.id) === string(variant.id),
      );
      if (match)
        return current.map((item) =>
          item === match ? { ...item, quantity: item.quantity + 1 } : item,
        );
      return [...current, { articleName, variant, quantity: 1 }];
    });
  }

  function setQuantity(id: unknown, quantity: number) {
    setCart((current) =>
      current
        .map((item) =>
          string(item.variant.id) === string(id) ? { ...item, quantity } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function book() {
    if (!venueId || !cart.length || saving) return;
    setSaving(true);
    setMessage('');
    const response = await inventoryRequest('/api/inventory/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rpc: 'verkauf_buchen',
        createFulfillment: saleDate === today,
        args: {
          p_operation_id: crypto.randomUUID(),
          p_market_id: number(selectedVenue?.id),
          p_date: saleDate,
          p_discount_cents: 0,
          p_pricing_mode: 'ITEMIZED',
          p_total_price_cents: null,
          p_payment_method: paymentMethod || null,
          p_note: note.trim() || null,
          p_zeilen: cart.map((item) => ({
            article_variant_id: number(item.variant.id),
            quantity: item.quantity,
            unit_sale_price_cents: number(item.variant.salePriceCents),
            unit_cost_price_cents: number(item.variant.costPriceCents),
            discount_percent: number(item.variant.discountPercent),
            component_choices: null,
          })),
        },
      }),
    });
    const result = (await response.json()) as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || 'Verkauf konnte nicht gebucht werden.');
      return;
    }
    setMessage(
      saleDate === today
        ? 'Verkauf gebucht. Die Positionen stehen jetzt unter Druck & Versand.'
        : 'Vergangener Verkauf gebucht. Die Monatsauswertung wurde aktualisiert.',
    );
    setCart([]);
    setCashGiven('');
    setNote('');
    onBooked();
  }

  return (
    <section
      className={
        (compact ? 'mt-4 ' : 'mt-6 ') + 'grid gap-5 xl:grid-cols-[1.35fr_.85fr]'
      }
    >
      <div className="rounded-[26px] border bg-white/65 p-5 md:p-6">
        <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
          Verkauf erfassen
        </p>
        <h2 className="mt-1 font-heading text-3xl">Kasse</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">
            Markt oder Regalfläche
            <select
              className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
              value={venueId}
              disabled={lockVenue}
              onChange={(event) => {
                setVenueId(event.target.value);
                setCart([]);
              }}
            >
              <option value="">Verkaufsort wählen</option>
              {venues.map((venue) => (
                <option key={string(venue.id)} value={string(venue.id)}>
                  {string(venue.venueKind) === 'shelf'
                    ? 'Regal · '
                    : 'Markt · '}
                  {string(venue.name)}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Verkaufsdatum"
            type="date"
            value={saleDate}
            onChange={setSaleDate}
          />
        </div>
        <div className="relative mt-4">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="bg-white pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              venueId
                ? 'Artikel oder Variante suchen'
                : 'Zuerst Verkaufsort wählen'
            }
            disabled={!venueId}
          />
        </div>
        <div className="mt-3 grid max-h-[430px] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
          {variants.map(({ variant, articleName }) => (
            <button
              type="button"
              key={string(variant.id)}
              onClick={() => add(articleName, variant)}
              disabled={number(variant.quantityInStock) <= 0}
              className="flex items-center justify-between gap-3 rounded-xl border bg-white/70 p-3 text-left transition hover:border-[var(--fp-primary)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span>
                <span className="block text-sm font-medium">{articleName}</span>
                <span className="block text-xs text-muted-foreground">
                  {string(variant.color || variant.name, 'Standard')} ·{' '}
                  {number(variant.quantityInStock)} verfügbar
                </span>
              </span>
              <span className="font-semibold">
                {cents(variant.salePriceCents)}
              </span>
            </button>
          ))}
          {venueId && !variants.length ? (
            <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground md:col-span-2">
              An diesem Verkaufsort wurde kein passender Artikel gefunden.
            </p>
          ) : null}
        </div>
      </div>
      <aside className="rounded-[26px] border bg-[var(--fp-ink)] p-5 text-[var(--fp-paper)] md:p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-2xl">Warenkorb</h2>
          <Badge className="bg-white/10 text-white">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} Stück
          </Badge>
        </div>
        <div className="mt-5 space-y-2">
          {cart.map((item) => (
            <div
              key={string(item.variant.id)}
              className="rounded-xl border border-white/15 p-3"
            >
              <div className="flex justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">{item.articleName}</div>
                  <div className="text-xs text-white/60">
                    {string(
                      item.variant.color || item.variant.name,
                      'Standard',
                    )}
                  </div>
                </div>
                <div>
                  {cents(item.quantity * number(item.variant.salePriceCents))}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setQuantity(item.variant.id, item.quantity - 1)
                  }
                >
                  −
                </Button>
                <span className="min-w-8 text-center text-sm">
                  {item.quantity}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setQuantity(item.variant.id, item.quantity + 1)
                  }
                >
                  +
                </Button>
              </div>
            </div>
          ))}
          {!cart.length ? (
            <p className="text-sm text-white/60">
              Tippe links auf Artikel, um sie in den Warenkorb zu legen.
            </p>
          ) : null}
        </div>
        <div className="mt-6 border-t border-white/15 pt-5">
          <div className="flex items-end justify-between">
            <span className="text-sm text-white/65">Gesamtsumme</span>
            <span className="font-heading text-4xl">{cents(total)}</span>
          </div>
          <label className="mt-5 grid gap-1.5 text-xs text-white/65">
            Zahlungsart
            <select
              className="h-10 rounded-lg border border-white/20 bg-white px-3 text-sm text-black"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              <option value="BAR">Bar</option>
              <option value="PAYPAL">PayPal</option>
              <option value="KARTE">Karte</option>
              <option value="SONSTIGES">Überweisung / Sonstiges</option>
              <option value="">Ohne Angabe</option>
            </select>
          </label>
          {paymentMethod === 'BAR' ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field
                label="Gegeben in €"
                value={cashGiven}
                onChange={setCashGiven}
              />
              <div className="rounded-xl border border-white/15 p-3 text-sm">
                <div className="text-xs text-white/60">
                  {change != null && change < 0 ? 'Fehlt' : 'Rückgeld'}
                </div>
                <div className="mt-1 font-semibold">
                  {change == null ? '–' : cents(Math.abs(change))}
                </div>
              </div>
            </div>
          ) : null}
          <label className="mt-3 grid gap-1.5 text-xs text-white/65">
            Notiz (optional)
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="border-white/20 bg-white text-black"
            />
          </label>
          {saleDate !== today ? (
            <p className="mt-3 rounded-xl bg-white/8 p-3 text-xs text-white/70">
              Nachgetragener Verkauf: Er aktualisiert Historie und Modell des
              Monats, erzeugt aber keine heutige Druck-/Versandaufgabe.
            </p>
          ) : null}
          <Button
            className="mt-4 w-full bg-[var(--fp-paper)] text-[var(--fp-ink)] hover:bg-white"
            onClick={() => void book()}
            disabled={
              !venueId ||
              !cart.length ||
              saving ||
              (paymentMethod === 'BAR' && change != null && change < 0)
            }
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CircleDollarSign className="size-4" />
            )}{' '}
            Verkauf buchen
          </Button>
          {message ? (
            <p className="mt-3 text-xs text-white/75">{message}</p>
          ) : null}
        </div>
      </aside>
    </section>
  );
}

function Sales({
  data,
  onOpenProduct,
  onEdit,
  onDelete,
}: {
  data: AreaData;
  onOpenProduct: (productId: string) => void | Promise<void>;
  onEdit: (entity: 'sales' | 'online_sales', row: Row) => void;
  onDelete: (entity: 'sales' | 'online_sales', row: Row) => void;
}) {
  const items = rows(data.sales).filter((sale) => !boolean(sale.isCancelled));
  const online = rows(data.onlineSales);
  const articles = rows(data.articles);
  const markets = rows(data.markets);
  const keys = [
    ...new Set(
      [...items, ...online].map((sale) => monthKey(sale.date)).filter(Boolean),
    ),
  ]
    .sort()
    .reverse();
  const [selectedMonth, setSelectedMonth] = useState('');
  const activeMonth = selectedMonth || keys[0] || '';
  const [selectedVenue, setSelectedVenue] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const filtered = filterSalesHistory(items, online, markets, {
    month: activeMonth,
    date: selectedDate,
    venue: selectedVenue,
  });
  const monthSales = filtered.marketSales;
  const monthOnline = filtered.onlineSales;
  const articleName = (saleItem: Row) => {
    const nested = string(object(object(saleItem.articleVariant).article).name);
    if (nested) return nested;
    for (const article of articles) {
      if (
        rows(article.variants).some(
          (variant) => string(variant.id) === string(saleItem.articleVariantId),
        )
      )
        return string(article.name, 'Artikel');
    }
    return 'Artikel';
  };
  const productId = (saleItem: Row) => {
    const nested = object(object(saleItem.articleVariant).article);
    if (nested.productId) return string(nested.productId);
    const article = articles.find((candidate) =>
      rows(candidate.variants).some(
        (variant) => string(variant.id) === string(saleItem.articleVariantId),
      ),
    );
    return string(article?.productId);
  };
  const soldPieces =
    monthSales.reduce(
      (sum, sale) =>
        sum +
        rows(sale.items).reduce(
          (part, item) => part + number(item.quantity),
          0,
        ),
      0,
    ) + monthOnline.reduce((sum, sale) => sum + number(sale.quantity, 1), 0);
  const productionCosts = monthSales.reduce(
    (sum, sale) =>
      sum +
      rows(sale.items).reduce(
        (part, item) =>
          part + number(item.unitCostPriceCents) * number(item.quantity),
        0,
      ),
    0,
  );
  const onlineCosts = monthOnline.reduce(
    (sum, sale) => sum + onlineSaleCost(sale),
    0,
  );
  const revenue =
    monthSales.reduce((sum, sale) => sum + saleTotal(sale), 0) +
    monthOnline.reduce((sum, sale) => sum + onlineSaleRevenue(sale), 0);
  const visibleMarketCosts = rows(data.marketExpenses).filter((expense) => {
    const expenseDate = string(expense.date).slice(0, 10);
    const dateMatches = selectedDate
      ? expenseDate === selectedDate
      : !activeMonth || expenseDate.slice(0, 7) === activeMonth;
    const venueMatches =
      !selectedVenue ||
      (selectedVenue.startsWith('market:') &&
        `market:${string(expense.marketId)}` === selectedVenue);
    return dateMatches && venueMatches;
  });
  const visibleMarketCostTotal = visibleMarketCosts.reduce(
    (sum, expense) => sum + expenseAmountCents(expense),
    0,
  );
  const venues = [
    ...items.map((sale) => marketVenue(sale, markets)),
    ...online.map(onlineVenue),
  ].filter(
    (venue, index, all) =>
      all.findIndex((item) => item.key === venue.key) === index,
  );
  const onlineSignatures = monthOnline.map((sale) =>
    [
      sale.date,
      sale.articleName,
      sale.quantity,
      sale.salePriceCents,
      sale.channel,
      sale.shippingRecipient,
      sale.orderKey,
    ].join('|'),
  );
  const possibleDuplicateCount =
    onlineSignatures.length - new Set(onlineSignatures).size;
  return (
    <section className="mt-6">
      <div className="flex min-w-0 flex-col justify-between gap-3 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            Nach Monaten
          </p>
          <h2 className="mt-1 font-heading text-3xl">Verkaufshistorie</h2>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-3 xl:min-w-[660px]">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Monat
            <select
              className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
              value={activeMonth}
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setSelectedDate('');
              }}
            >
              {keys.map((key) => (
                <option key={key} value={key}>
                  {new Intl.DateTimeFormat('de-DE', {
                    month: 'long',
                    year: 'numeric',
                  }).format(new Date(key + '-01T12:00:00Z'))}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Verkaufsort
            <select
              className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
              value={selectedVenue}
              onChange={(event) => setSelectedVenue(event.target.value)}
            >
              <option value="">Alle Verkaufsorte</option>
              {venues.map((venue) => (
                <option key={venue.key} value={venue.key}>
                  {venue.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Datum
            <Input
              type="date"
              className="bg-white"
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                if (event.target.value)
                  setSelectedMonth(event.target.value.slice(0, 7));
              }}
            />
          </label>
        </div>
      </div>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Stat value={soldPieces} label="sichtbare verkaufte Artikel" />
        <Stat
          value={monthSales.length + monthOnline.length}
          label="sichtbare Verkaufsvorgänge"
        />
        <Stat value={cents(revenue)} label="Umsatz" />
        <Stat
          value={cents(productionCosts + onlineCosts)}
          label="Artikel- und Versandkosten"
        />
        <Stat value={cents(visibleMarketCostTotal)} label="Marktkosten" />
        <Stat
          value={cents(
            revenue - productionCosts - onlineCosts - visibleMarketCostTotal,
          )}
          label="Ergebnis nach erfassten Kosten"
        />
      </div>
      {possibleDuplicateCount ? (
        <div className="mt-4 rounded-xl border border-[#b5895a]/45 bg-[#fff8ef] p-3 text-sm">
          {possibleDuplicateCount} möglicherweise doppelte Online-Buchung
          {possibleDuplicateCount === 1 ? '' : 'en'} gefunden. Sie bleibt in der
          Summe enthalten, bis Jasmin oder Marlon sie geprüft hat.
        </div>
      ) : null}
      <div className="mt-4 grid gap-3">
        {monthSales.map((sale) => (
          <article
            key={string(sale.id)}
            className="rounded-2xl border bg-white/65 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">Verkauf #{string(sale.id)}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {date(sale.date)} · {marketVenue(sale, markets).label} ·{' '}
                  {string(sale.paymentMethod, 'Zahlungsart nicht erfasst')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">
                  {cents(saleTotal(sale))}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit('sales', sale)}
                >
                  <Pencil className="size-3.5" /> Bearbeiten
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-[#9f463d]"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Diesen Verkauf wirklich löschen? Der verkaufte Bestand wird zurückgebucht.',
                      )
                    )
                      onDelete('sales', sale);
                  }}
                >
                  <Trash2 className="size-3.5" /> Löschen
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {rows(sale.items).map((item) => {
                const quantity = number(item.quantity);
                const salePrice = number(item.unitSalePriceCents) * quantity;
                const cost = number(item.unitCostPriceCents) * quantity;
                const linkedProductId = productId(item);
                const hasCost = number(item.unitCostPriceCents) > 0;
                return (
                  <button
                    key={string(item.id)}
                    type="button"
                    disabled={!linkedProductId}
                    onClick={() => void onOpenProduct(linkedProductId)}
                    className="rounded-xl border bg-white p-3 text-left transition hover:border-[var(--fp-primary)] disabled:cursor-default disabled:opacity-70"
                  >
                    <span className="block font-medium">
                      {quantity} × {string(articleName(item), 'Artikel')}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Verkauf {cents(salePrice)} · Herstellung {cents(cost)} ·
                      Deckungsbeitrag {cents(salePrice - cost)}
                    </span>
                    {!hasCost ? (
                      <span className="mt-2 block text-xs font-semibold text-amber-700">
                        Herstellungskosten fehlen oder sind 0,00 €
                      </span>
                    ) : null}
                    <span className="mt-2 block text-xs font-medium text-[var(--fp-primary)]">
                      {linkedProductId
                        ? 'Artikeldaten und Kalkulation öffnen'
                        : 'Kein verknüpfter Artikel vorhanden'}
                    </span>
                  </button>
                );
              })}
            </div>
            {sale.note ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {string(sale.note)}
              </p>
            ) : null}
          </article>
        ))}
        {monthOnline.map((sale) => (
          <article
            key={`online-${string(sale.id)}`}
            className="rounded-2xl border bg-white/65 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium">
                  {string(sale.articleName, 'Online-Verkauf')}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {date(sale.date)} · {onlineVenue(sale).label} ·{' '}
                  {string(sale.shippingRecipient, 'kein Empfänger')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">
                  {cents(onlineSaleRevenue(sale))}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit('online_sales', sale)}
                >
                  <Pencil className="size-3.5" /> Bearbeiten
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-[#9f463d]"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Diesen Verkauf wirklich löschen? Bereits abgezogener Bestand wird zurückgebucht.',
                      )
                    )
                      onDelete('online_sales', sale);
                  }}
                >
                  <Trash2 className="size-3.5" /> Löschen
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">{number(sale.quantity, 1)} Stück</Badge>
              <Badge variant="outline">
                {boolean(sale.isPrinted) ? 'gedruckt' : 'Druck offen'}
              </Badge>
              <Badge variant="outline">
                {boolean(sale.isShipped) ? 'erledigt' : 'Versand offen'}
              </Badge>
              <Badge variant="outline">
                Ergebnis {cents(onlineSaleRevenue(sale) - onlineSaleCost(sale))}
              </Badge>
              {sale.productId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void onOpenProduct(string(sale.productId))}
                >
                  Artikeldaten und Kalkulation öffnen
                </Button>
              ) : null}
            </div>
          </article>
        ))}
        {!monthSales.length && !monthOnline.length ? (
          <div className="rounded-2xl border border-dashed bg-white/45 p-8 text-center text-sm text-muted-foreground">
            Für diesen Monat gibt es noch keine Verkaufspositionen.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function expenseTotal(expense: Row) {
  return expenseAmountCents(expense);
}

function expenseDateValue(expense: Row) {
  return string(expense.invoiceDate || expense.date);
}

function expenseDateTimestamp(expense: Row) {
  const value = expenseDateValue(expense);
  if (!value) return 0;
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function expenseMonthLabel(key: string) {
  if (key === 'without-date') return 'Ohne Datum';
  const parsed = new Date(`${key}-01T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? key
    : new Intl.DateTimeFormat('de-DE', {
        month: 'long',
        year: 'numeric',
      }).format(parsed);
}

function ReceiptUpload({
  expenseId,
  onChanged,
}: {
  expenseId: string;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  async function upload(file: File) {
    setUploading(true);
    setMessage('');
    const body = new FormData();
    body.set('file', file);
    body.set('expenseId', expenseId);
    const response = await inventoryRequest(
      '/api/inventory/expense-documents',
      {
        method: 'POST',
        body,
      },
    );
    const result = (await response.json()) as { error?: string };
    setUploading(false);
    if (!response.ok)
      setMessage(result.error || 'Beleg-Upload fehlgeschlagen.');
    else {
      setMessage('Beleg gespeichert.');
      onChanged();
    }
  }
  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
        {uploading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" />
        )}
        Beleg
        <input
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
      </label>
      {message ? (
        <span className="ml-2 text-xs text-muted-foreground">{message}</span>
      ) : null}
    </div>
  );
}

function Expenses({
  data,
  onEdit,
  onNew,
  onTrash,
  onChanged,
}: {
  data: AreaData;
  onEdit: (row: Row) => void;
  onNew: () => void;
  onTrash: (row: Row) => void;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState('');
  const [recurrence, setRecurrence] = useState<'all' | ExpenseRecurrence>(
    'all',
  );
  const [expenseSource, setExpenseSource] = useState<
    'all' | 'market' | 'other'
  >('all');
  const [expandedExpenseMonths, setExpandedExpenseMonths] = useState<
    Record<string, boolean>
  >({});
  const expenses = rows(data.expenses);
  const markets = rows(data.markets);
  const marketExpenses: Row[] = rows(data.marketExpenses).map((expense) => ({
    ...expense,
    expenseSource: 'market',
    marketName: (() => {
      const market = markets.find(
        (item) => string(item.id) === string(expense.marketId),
      );
      return (
        [string(market?.name), string(market?.location)]
          .filter(Boolean)
          .join(' · ') || 'Markt'
      );
    })(),
  }));
  const allExpenses: Row[] = [...marketExpenses, ...expenses];
  const visible = allExpenses.filter((expense) => {
    const source =
      string(expense.expenseSource) === 'market' ? 'market' : 'other';
    if (expenseSource !== 'all' && source !== expenseSource) return false;
    if (
      recurrence !== 'all' &&
      string(expense.recurrence, 'none') !== recurrence
    )
      return false;
    return [
      expense.articleName,
      expense.label,
      expense.vendor,
      expense.marketName,
      expense.category,
      expense.note,
    ]
      .join(' ')
      .toLocaleLowerCase('de')
      .includes(search.trim().toLocaleLowerCase('de'));
  });
  const expenseGroups = Object.entries(
    [...visible]
      .sort((left, right) => {
        const dateDifference =
          expenseDateTimestamp(right) - expenseDateTimestamp(left);
        return (
          dateDifference || string(right.id).localeCompare(string(left.id))
        );
      })
      .reduce<Record<string, Row[]>>((groups, expense) => {
        const key = monthKey(expenseDateValue(expense)) || 'without-date';
        (groups[key] ||= []).push(expense);
        return groups;
      }, {}),
  ).sort(([left], [right]) => {
    if (left === 'without-date') return 1;
    if (right === 'without-date') return -1;
    return right.localeCompare(left);
  });
  const thisMonth = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  const thisMonthTotal =
    expenses
      .filter((expense) =>
        expenseOccursInMonth(
          string(expense.invoiceDate),
          string(expense.endDate),
          string(expense.recurrence, 'none') as ExpenseRecurrence,
          thisMonth,
        ),
      )
      .reduce((sum, expense) => sum + expenseTotal(expense), 0) +
    marketExpenses
      .filter((expense) => monthKey(expense.date) === thisMonth)
      .reduce((sum, expense) => sum + expenseTotal(expense), 0);
  return (
    <section className="mt-6">
      <div className="mb-4">
        <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
          Verwaltung
        </p>
        <h2 className="mt-1 font-heading text-3xl">Ausgabenübersicht</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manuelle Ausgaben und automatisch übernommene Marktkosten in einer
          Übersicht.
        </p>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="bg-white pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Beschreibung, Lieferant oder Kategorie suchen"
          />
        </div>
        <select
          value={expenseSource}
          onChange={(event) =>
            setExpenseSource(event.target.value as typeof expenseSource)
          }
          className="h-9 rounded-lg border bg-white px-3 text-sm"
          aria-label="Kostenart"
        >
          <option value="all">Alle Kostenarten</option>
          <option value="market">Nur Marktkosten</option>
          <option value="other">Nur sonstige Ausgaben</option>
        </select>
        <select
          value={recurrence}
          onChange={(event) =>
            setRecurrence(event.target.value as typeof recurrence)
          }
          className="h-9 rounded-lg border bg-white px-3 text-sm"
        >
          <option value="all">Alle Ausgaben</option>
          <option value="none">Einmalig</option>
          <option value="monthly">Monatlich</option>
          <option value="yearly">Jährlich</option>
        </select>
        <Button onClick={onNew}>
          <Plus className="size-4" /> Ausgabe erfassen
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat value={allExpenses.length} label="Ausgaben gesamt" />
        <Stat value={cents(thisMonthTotal)} label="für diesen Monat" />
        <Stat
          value={cents(
            marketExpenses.reduce(
              (sum, expense) => sum + expenseTotal(expense),
              0,
            ),
          )}
          label="Marktkosten gesamt"
        />
      </div>
      <div className="mt-4 grid gap-3">
        {expenseGroups.map(([key, monthExpenses], groupIndex) => (
          <details
            key={key}
            className="group overflow-hidden rounded-2xl border bg-white/45"
            open={expandedExpenseMonths[key] ?? groupIndex === 0}
            onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              setExpandedExpenseMonths((current) =>
                current[key] === isOpen
                  ? current
                  : { ...current, [key]: isOpen },
              );
            }}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden">
              <div>
                <h3 className="font-heading text-xl capitalize">
                  {expenseMonthLabel(key)}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {monthExpenses.length}{' '}
                  {monthExpenses.length === 1 ? 'Eintrag' : 'Einträge'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <strong>
                  {cents(
                    monthExpenses.reduce(
                      (sum, expense) => sum + expenseTotal(expense),
                      0,
                    ),
                  )}
                </strong>
                <ChevronDown className="size-5 transition-transform group-open:rotate-180" />
              </div>
            </summary>
            <div className="grid gap-3 border-t p-3 lg:grid-cols-2">
              {monthExpenses.map((expense) => (
                <article
                  key={`${string(expense.expenseSource, 'other')}-${string(expense.id)}`}
                  className="rounded-2xl border bg-white/65 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-medium">
                        {string(
                          expense.articleName || expense.label,
                          'Ausgabe',
                        )}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[
                          string(expense.vendor || expense.marketName),
                          string(expense.category),
                          date(expenseDateValue(expense)),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        {cents(expenseTotal(expense))}
                      </div>
                      <Badge variant="outline" className="mt-1">
                        {string(expense.expenseSource) === 'market'
                          ? 'automatisch aus Markt'
                          : string(expense.recurrence, 'none') === 'monthly'
                            ? 'monatlich'
                            : string(expense.recurrence, 'none') === 'yearly'
                              ? 'jährlich'
                              : 'einmalig'}
                      </Badge>
                    </div>
                  </div>
                  {expense.note ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {string(expense.note)}
                    </p>
                  ) : null}
                  {string(expense.expenseSource) === 'market' ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Diese Ausgabe wird automatisch aus den Kosten des
                      Verkaufsorts übernommen.
                    </p>
                  ) : null}
                  {string(expense.expenseSource) !== 'market' ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(expense)}
                      >
                        <Pencil className="size-3.5" /> Bearbeiten
                      </Button>
                      <ReceiptUpload
                        expenseId={string(expense.id)}
                        onChanged={onChanged}
                      />
                      {rows(expense.documents).map((document) => (
                        <a
                          key={string(document.id)}
                          href={string(document.url)}
                          className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          <Download className="size-3.5" />
                          <span className="max-w-32 truncate">
                            {string(document.filename)}
                          </span>
                        </a>
                      ))}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto text-red-700"
                        aria-label={
                          string(expense.articleName, 'Ausgabe') + ' löschen'
                        }
                        onClick={() => onTrash(expense)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </details>
        ))}
      </div>
      {!visible.length ? (
        <div className="mt-4 rounded-2xl border border-dashed bg-white/45 p-8 text-center text-sm text-muted-foreground">
          Keine passenden Ausgaben gefunden.
        </div>
      ) : null}
    </section>
  );
}

function Months({
  data,
  onOpenProduct,
}: {
  data: AreaData;
  onOpenProduct: (productId: string) => void | Promise<void>;
}) {
  const sales = rows(data.sales).filter((sale) => !boolean(sale.isCancelled));
  const online = rows(data.onlineSales);
  const marketExpenses = rows(data.expenses);
  const otherExpenses = rows(data.otherExpenses);
  const expenses = [...marketExpenses, ...otherExpenses];
  const highlights = rows(data.highlights);
  const keys = [
    ...new Set(
      [
        ...sales.map((item) => monthKey(item.date)),
        ...online.map((item) => monthKey(item.date)),
        ...expenses.map((item) => monthKey(item.date || item.invoiceDate)),
        ...(otherExpenses.some((item) =>
          ['monthly', 'yearly'].includes(string(item.recurrence)),
        )
          ? [new Intl.DateTimeFormat('sv-SE').format(new Date()).slice(0, 7)]
          : []),
      ].filter(Boolean),
    ),
  ]
    .sort()
    .reverse();
  const chartData = keys
    .slice(0, 12)
    .reverse()
    .map((key) => {
      const monthSales = sales.filter((item) => monthKey(item.date) === key);
      const monthOnline = online.filter((item) => monthKey(item.date) === key);
      const income =
        monthSales.reduce((sum, item) => sum + saleTotal(item), 0) +
        monthOnline.reduce((sum, item) => sum + onlineSaleRevenue(item), 0);
      const production =
        monthSales.reduce(
          (sum, item) =>
            sum +
            rows(item.items).reduce(
              (part, saleItem) =>
                part +
                number(saleItem.unitCostPriceCents) * number(saleItem.quantity),
              0,
            ),
          0,
        ) + monthOnline.reduce((sum, item) => sum + onlineSaleCost(item), 0);
      const other =
        marketExpenses
          .filter((item) => monthKey(item.date) === key)
          .reduce(
            (sum, item) => sum + number(item.amountCents || item.priceCents),
            0,
          ) +
        otherExpenses
          .filter((item) =>
            expenseOccursInMonth(
              string(item.invoiceDate),
              string(item.endDate),
              string(item.recurrence, 'none') as ExpenseRecurrence,
              key,
            ),
          )
          .reduce((sum, item) => sum + expenseTotal(item), 0);
      return { key, income, expenses: production + other };
    });
  const chartMaximum = Math.max(
    1,
    ...chartData.flatMap((item) => [item.income, item.expenses]),
  );
  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-[24px] border bg-white/65 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
              Entwicklung
            </p>
            <h2 className="mt-1 font-heading text-2xl">
              Einnahmen vs. Ausgaben
            </h2>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[var(--fp-primary)]" />
              Einnahmen
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[var(--fp-accent)]" />
              Ausgaben inkl. Herstellung
            </span>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto pb-2">
          <div className="flex h-52 min-w-[560px] items-end gap-3 border-b px-1">
            {chartData.map((item) => (
              <div
                key={item.key}
                className="flex h-full min-w-12 flex-1 flex-col justify-end"
                title={`${item.key}: ${cents(item.income)} Einnahmen, ${cents(item.expenses)} Ausgaben`}
              >
                <div className="flex h-[170px] items-end justify-center gap-1">
                  <div
                    className="w-3 rounded-t bg-[var(--fp-primary)] sm:w-4"
                    style={{
                      height: `${Math.max(2, (item.income / chartMaximum) * 100)}%`,
                    }}
                  />
                  <div
                    className="w-3 rounded-t bg-[var(--fp-accent)] sm:w-4"
                    style={{
                      height: `${Math.max(2, (item.expenses / chartMaximum) * 100)}%`,
                    }}
                  />
                </div>
                <div className="py-2 text-center text-[10px] text-muted-foreground">
                  {new Intl.DateTimeFormat('de-DE', {
                    month: 'short',
                    year: '2-digit',
                  }).format(new Date(item.key + '-01T12:00:00Z'))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {keys.map((key) => {
          const monthSales = sales.filter(
            (item) => monthKey(item.date) === key,
          );
          const monthOnline = online.filter(
            (item) => monthKey(item.date) === key,
          );
          const soldPieces =
            monthSales.reduce(
              (sum, sale) =>
                sum +
                rows(sale.items).reduce(
                  (part, item) => part + number(item.quantity),
                  0,
                ),
              0,
            ) +
            monthOnline.reduce(
              (sum, item) => sum + number(item.quantity, 1),
              0,
            );
          const revenue =
            monthSales.reduce((sum, item) => sum + saleTotal(item), 0) +
            monthOnline.reduce((sum, item) => sum + onlineSaleRevenue(item), 0);
          const costs =
            monthSales.reduce(
              (sum, item) =>
                sum +
                rows(item.items).reduce(
                  (part, saleItem) =>
                    part +
                    number(saleItem.unitCostPriceCents) *
                      number(saleItem.quantity),
                  0,
                ),
              0,
            ) +
            monthOnline.reduce((sum, item) => sum + onlineSaleCost(item), 0);
          const other =
            marketExpenses
              .filter((item) => monthKey(item.date) === key)
              .reduce(
                (sum, item) =>
                  sum + number(item.amountCents || item.priceCents),
                0,
              ) +
            otherExpenses
              .filter((item) =>
                expenseOccursInMonth(
                  string(item.invoiceDate),
                  string(item.endDate),
                  string(item.recurrence, 'none') as ExpenseRecurrence,
                  key,
                ),
              )
              .reduce((sum, item) => sum + expenseTotal(item), 0);
          const highlight = highlights.find(
            (item) => string(item.month) === key,
          );
          return (
            <article key={key} className="rounded-2xl border bg-white/65 p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-2xl">
                  {new Intl.DateTimeFormat('de-DE', {
                    month: 'long',
                    year: 'numeric',
                  }).format(new Date(key + '-01T00:00:00Z'))}
                </h2>
                <Badge variant="outline">{soldPieces} verkaufte Artikel</Badge>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Umsatz</dt>
                  <dd className="mt-1 font-semibold">{cents(revenue)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Herstellung</dt>
                  <dd className="mt-1">{cents(costs)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Ausgaben</dt>
                  <dd className="mt-1">{cents(other)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Ergebnis</dt>
                  <dd className="mt-1 font-semibold">
                    {cents(revenue - costs - other)}
                  </dd>
                </div>
              </dl>
              {highlight ? (
                <div className="mt-5 rounded-xl bg-[var(--fp-mist)] p-4 text-sm">
                  <div className="text-xs font-semibold tracking-[.1em] text-[var(--fp-primary)] uppercase">
                    Modell des Monats
                  </div>
                  {highlight.productId ? (
                    <button
                      type="button"
                      className="mt-1 text-left font-medium underline decoration-[var(--fp-primary)]/35 underline-offset-4 hover:decoration-[var(--fp-primary)]"
                      onClick={() =>
                        void onOpenProduct(string(highlight.productId))
                      }
                    >
                      {string(highlight.productName)} ·{' '}
                      {number(highlight.productQuantity)} von{' '}
                      {number(highlight.totalQuantity)} verkauften Artikeln
                    </button>
                  ) : (
                    <div className="mt-1 font-medium">
                      {string(highlight.productName)} ·{' '}
                      {number(highlight.productQuantity)} von{' '}
                      {number(highlight.totalQuantity)} verkauften Artikeln
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Account({ data }: { data: AreaData }) {
  const user = object(data.user);
  const profile = object(data.profile);
  const [name, setName] = useState(string(profile.name));
  const [email, setEmail] = useState(string(user.email));
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(string(profile.name));
    setEmail(string(user.email));
  }, [profile.name, user.email]);

  async function save() {
    const response = await inventoryRequest('/api/inventory/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    const result = (await response.json()) as {
      emailRequested?: boolean;
      error?: string;
    };
    setMessage(
      response.ok
        ? result.emailRequested
          ? 'Gespeichert. Bitte bestätige die neue E-Mail-Adresse.'
          : 'Kontodaten gespeichert.'
        : result.error || 'Kontodaten konnten nicht gespeichert werden.',
    );
  }
  return (
    <section className="mt-6 max-w-2xl rounded-[26px] border bg-white/65 p-6">
      <UserRound className="size-8 text-[var(--fp-primary)]" />
      <h2 className="mt-4 font-heading text-3xl">FormPoesie-Konto</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={name} onChange={setName} />
        <Field label="E-Mail" type="email" value={email} onChange={setEmail} />
        <div>
          <div className="text-xs text-muted-foreground">Rolle</div>
          <div className="mt-1">
            <Badge variant="outline">{string(profile.role, 'Admin')}</Badge>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Datenquelle</div>
          <div className="mt-1 font-medium">FormPoesie Supabase</div>
        </div>
      </div>
      <Button className="mt-5" onClick={() => void save()}>
        <Check className="size-4" /> Kontodaten speichern
      </Button>
      {message ? (
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      ) : null}
    </section>
  );
}

function InventoryTrash({
  data,
  onRestore,
}: {
  data: AreaData;
  onRestore: (entity: string, id: unknown, restore?: boolean) => Promise<void>;
}) {
  const groups: Array<[string, string, Row[]]> = [
    ['products', 'Artikel', rows(data.products)],
    ['materials', 'Materialien', rows(data.materials)],
    ['markets', 'Märkte', rows(data.markets)],
    ['other_expenses', 'Ausgaben', rows(data.otherExpenses)],
  ];
  return (
    <section className="mt-6 space-y-5">
      {groups.map(([entity, label, items]) => (
        <div key={entity} className="rounded-[24px] border bg-white/65 p-5">
          <h2 className="font-heading text-2xl">{label}</h2>
          <div className="mt-3 space-y-2">
            {items.map((item) => (
              <div
                key={string(item.id)}
                className="flex items-center justify-between rounded-xl border bg-white/55 p-3"
              >
                <div>
                  <div className="font-medium">
                    {string(
                      item.name || item.articleName,
                      '#' + string(item.id),
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    gelöscht am {date(item.deletedAt)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void onRestore(entity, item.id, true)}
                >
                  <RotateCcw className="size-4" /> Wiederherstellen
                </Button>
              </div>
            ))}
            {!items.length ? (
              <p className="text-sm text-muted-foreground">Keine Einträge.</p>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}

function EntityEditor({
  editor,
  form,
  setValue,
  data,
  saving,
  message,
  onSave,
  onClose,
  onProductChanged,
  onMaterialChanged,
}: {
  editor: { entity: string; row: Row } | null;
  form: Row;
  setValue: (key: string, value: unknown) => void;
  data: Record<string, AreaData>;
  saving: boolean;
  message: string;
  onSave: () => void | Promise<void>;
  onClose: () => void;
  onProductChanged: (productId: unknown) => void;
  onMaterialChanged: (materialId: unknown) => void;
}) {
  const manufacturingEditorRef = useRef<ManufacturingEditorHandle>(null);
  if (!editor) return null;
  const input = (key: string, label: string, type = 'text') => (
    <Field
      label={label}
      type={type}
      value={string(form[key])}
      onChange={(value) =>
        setValue(key, type === 'number' && value ? Number(value) : value)
      }
    />
  );
  const isProduct = editor.entity === 'products';
  const productHasVariants = isProduct && rows(editor.row.variants).length > 0;
  const isMaterial = editor.entity === 'materials';
  const isMarket = editor.entity === 'markets';
  const isSale = editor.entity === 'sales';
  const isOnline = editor.entity === 'online_sales';
  const isExpense = editor.entity === 'other_expenses';
  const onlineProducts = rows(data.sales?.products).sort((left, right) =>
    string(left.name).localeCompare(string(right.name), 'de'),
  );
  const onlineMaterials = rows(data.sales?.materials).sort((left, right) =>
    materialChoiceLabel(left).localeCompare(materialChoiceLabel(right), 'de'),
  );
  const onlineProduct = onlineProducts.find(
    (item) => string(item.id) === string(form.productId),
  );
  const onlineVariants = rows(onlineProduct?.variants);
  const onlineMaterial = onlineMaterials.find(
    (item) => string(item.id) === string(form.filamentMaterialId),
  );
  async function saveEverything() {
    if (isProduct && editor?.row.id) {
      const manufacturingSaved =
        await manufacturingEditorRef.current?.savePending();
      if (manufacturingSaved === false) return;
    }
    await onSave();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[96vh] overflow-x-hidden overflow-y-auto bg-[#f8f4ed] sm:max-w-[min(1500px,96vw)]">
        <DialogHeader>
          <DialogTitle className="font-heading text-3xl">
            {isProduct
              ? editor.row.id
                ? 'Artikel bearbeiten'
                : 'Artikel anlegen'
              : editor.row.id
                ? 'Bearbeiten'
                : 'Neu anlegen'}
          </DialogTitle>
          <DialogDescription>
            Von oben nach unten bearbeiten. Kosten und Marge werden automatisch
            aus den Produktionsdaten berechnet.
          </DialogDescription>
        </DialogHeader>
        <div
          className={
            isProduct
              ? 'grid gap-4 py-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]'
              : 'grid gap-4 py-2 sm:grid-cols-2'
          }
        >
          {isProduct ? (
            <>
              <section className="rounded-2xl border bg-white/70 p-4 sm:col-span-2">
                <div className="mb-3">
                  <h3 className="font-heading text-xl">Basis</h3>
                  <p className="text-sm text-muted-foreground">
                    Was es ist – Bild, Name, Einordnung und Vorlage.
                  </p>
                </div>
                <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div>
                    <div className="aspect-square overflow-hidden rounded-[24px] border bg-[#ebe5db]">
                      <InventoryImage
                        product={{ ...editor.row, ...form }}
                        alt={string(form.name, 'Artikelbild')}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Titelbild und weitere Bilder verwaltest du im Abschnitt
                      „Bilder &amp; Druckdateien“.
                    </p>
                  </div>
                  <div className="grid content-start gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      {input('name', 'Artikelname')}
                    </div>
                    <label className="grid gap-1.5 text-sm font-medium text-foreground">
                      Kategorie
                      <Input
                        list="product-categories"
                        value={string(form.category)}
                        onChange={(event) =>
                          setValue('category', event.target.value)
                        }
                        className="bg-white text-foreground"
                        placeholder="Vorhandene wählen oder neu anlegen"
                      />
                      <datalist id="product-categories">
                        {[
                          ...new Set(
                            rows(data.products?.products)
                              .map((item) => string(item.category))
                              .filter(Boolean),
                          ),
                        ]
                          .sort()
                          .map((item) => (
                            <option key={item} value={item} />
                          ))}
                      </datalist>
                    </label>
                    {input('size', 'Größe')}
                    <label className="grid gap-1.5 text-sm font-medium text-foreground">
                      Familie
                      <select
                        className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                        value={string(form.familyId)}
                        onChange={(event) =>
                          setValue(
                            'familyId',
                            event.target.value
                              ? Number(event.target.value)
                              : null,
                          )
                        }
                      >
                        <option value="">Ohne Familie</option>
                        {rows(data.products?.families).map((item) => (
                          <option key={string(item.id)} value={string(item.id)}>
                            {string(item.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-foreground">
                      Designer / Lizenzgeber
                      <select
                        className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                        value={string(form.designerId)}
                        onChange={(event) =>
                          setValue(
                            'designerId',
                            event.target.value
                              ? Number(event.target.value)
                              : null,
                          )
                        }
                      >
                        <option value="">Eigener Entwurf</option>
                        {rows(data.products?.designers).map((item) => (
                          <option key={string(item.id)} value={string(item.id)}>
                            {string(item.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border bg-white p-3 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={boolean(form.commercialLicense)}
                        onChange={(event) =>
                          setValue('commercialLicense', event.target.checked)
                        }
                      />
                      <span>
                        <span className="block font-medium">
                          Verkaufslizenz
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {boolean(form.commercialLicense)
                            ? 'Ja, dieses Produkt darf verkauft werden.'
                            : 'Nein, für dieses Produkt ist keine Verkaufslizenz hinterlegt.'}
                        </span>
                      </span>
                    </label>
                    <div className="sm:col-span-2">
                      {input('modelUrl', 'Modell-Link', 'url')}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Die Seite, von der die Vorlage stammt. Optional.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
              <section className="order-first rounded-2xl border border-[var(--fp-primary)]/30 bg-[var(--fp-mist)]/65 p-4 sm:col-span-2">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(150px,210px)_minmax(170px,230px)] sm:items-end">
                  <div>
                    <h3 className="font-heading text-xl">
                      {string(form.name, 'Neuer Artikel')}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {editor.row.id &&
                      productionDataMissing(
                        { ...editor.row, ...form },
                        rows(data.products?.products),
                        rows(data.products?.components),
                      )
                        ? 'Produktionsdaten unvollständig · Marge bleibt offen'
                        : 'Produktionsdaten vollständig'}
                    </p>
                  </div>
                  <label className="grid gap-1.5 text-sm font-medium text-foreground">
                    Status
                    <select
                      className="h-10 rounded-lg border bg-white px-3 text-sm text-foreground"
                      value={inventoryReviewStatus(form.studioStatus)}
                      onChange={(event) => {
                        const status = event.target.value as
                          | 'draft'
                          | 'final'
                          | 'customer_order';
                        setValue('studioStatus', status);
                        if (status === 'final' && !form.finalizedAt)
                          setValue(
                            'finalizedAt',
                            new Intl.DateTimeFormat('sv-SE').format(new Date()),
                          );
                      }}
                    >
                      <option value="draft">Entwurf</option>
                      <option value="final">Final</option>
                      <option value="customer_order">Kundenauftrag</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium text-foreground">
                    Etsy
                    <select
                      className="h-10 rounded-lg border bg-white px-3 text-sm text-foreground"
                      value={boolean(form.etsyListed) ? 'online' : 'offline'}
                      onChange={(event) =>
                        setValue('etsyListed', event.target.value === 'online')
                      }
                    >
                      <option value="offline">Nicht auf Etsy</option>
                      <option value="online">Auf Etsy online</option>
                    </select>
                  </label>
                </div>
              </section>
              {editor.row.id ? (
                <ProductEditorSidebar
                  product={{ ...editor.row, ...form }}
                  products={rows(data.products?.products)}
                  components={rows(data.products?.components)}
                  saving={saving}
                  onSave={() => void saveEverything()}
                />
              ) : null}
              {!productHasVariants ? (
                <section className="rounded-2xl border border-[var(--fp-primary)]/25 bg-white/80 p-4 sm:col-span-2">
                  <div className="mb-3">
                    <h3 className="font-heading text-xl">
                      {isDigitalInventoryProduct(form)
                        ? 'Preise'
                        : 'Preis und Bestand'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {isDigitalInventoryProduct(form)
                        ? 'Digitale Dateien sind nach dem Kauf unbegrenzt verfügbar.'
                        : 'Preis in Euro und aktuelle fertige Stückzahl.'}
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SalesPriceFields
                      values={form}
                      standardKey="defaultPriceCents"
                      className="sm:col-span-2"
                      onChange={setValue}
                    />
                    {!isDigitalInventoryProduct(form) ? (
                      <Field
                        label="Fertigbestand"
                        type="number"
                        value={string(form.stockQuantity)}
                        onChange={(value) => {
                          const quantity = Math.max(0, Number(value) || 0);
                          setValue('stockQuantity', quantity);
                          setValue('baseStockQuantity', quantity);
                        }}
                      />
                    ) : (
                      <div className="rounded-xl border bg-[var(--fp-mist)]/60 p-3 text-sm sm:col-span-2">
                        <strong>Unbegrenzter Bestand</strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Für diesen digitalen Artikel wird keine Stückzahl
                          geführt.
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              ) : null}
              {editor.row.id ? (
                <>
                  <ProductAssetManager
                    product={form}
                    onChanged={() => onProductChanged(editor.row.id)}
                  />
                  {productionDataMissing(
                    editor.row,
                    rows(data.products?.products),
                    rows(data.products?.components),
                  ) ? (
                    <div className="rounded-2xl border border-[#d6a15e] bg-[#fff8e8] p-4 text-sm sm:col-span-2">
                      <div className="font-medium text-[#744719]">
                        ⚠ Produktionsdaten unvollständig
                      </div>
                      <p className="mt-1 text-[#8b5c27]">
                        Marge und Bestandswert stimmen erst, wenn Material,
                        Druckzeit und Herstellung vollständig eingetragen sind.
                      </p>
                    </div>
                  ) : null}
                  <ManufacturingEditor
                    ref={manufacturingEditorRef}
                    product={editor.row}
                    materials={rows(data.products?.materials)}
                    products={rows(data.products?.products)}
                    components={rows(data.products?.components)}
                    onChanged={() => onProductChanged(editor.row.id)}
                  />
                  <RelationsSummary
                    product={editor.row}
                    data={data.products || {}}
                    onChanged={() => onProductChanged(editor.row.id)}
                  />
                </>
              ) : (
                <p className="rounded-xl border border-dashed bg-white/55 p-4 text-sm text-muted-foreground sm:col-span-2">
                  Speichere zuerst den Produktstamm. Danach öffnet sich die
                  vollständige Varianten- und Kostenmaske.
                </p>
              )}
              <details className="group rounded-2xl border bg-white/55 sm:col-span-2">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 font-medium">
                  <span>
                    Weitere Angaben &amp; Notiz
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      Alles, was sonst nirgends hingehört.
                    </span>
                  </span>
                  <span className="transition group-open:rotate-180">⌄</span>
                </summary>
                <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                  {inventoryReviewStatus(form.studioStatus) === 'final' ? (
                    <Field
                      label="Datum der finalen Bestätigung"
                      type="date"
                      value={string(form.finalizedAt).slice(0, 10)}
                      onChange={(value) => setValue('finalizedAt', value)}
                    />
                  ) : null}
                  <label className="grid gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
                    Notiz
                    <Textarea
                      value={string(form.note)}
                      onChange={(event) => setValue('note', event.target.value)}
                      className="bg-white text-foreground"
                    />
                  </label>
                </div>
              </details>
            </>
          ) : null}
          {isMaterial ? (
            <>
              {input('name', 'Materialname')}
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Marke
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                  value={string(form.brandId)}
                  onChange={(event) =>
                    setValue(
                      'brandId',
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">Keine Marke</option>
                  {rows(data.materials?.brands).map((item) => (
                    <option key={string(item.id)} value={string(item.id)}>
                      {string(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              {input('variant', 'Farbe / Variante')}
              {input('materialType', 'Materialtyp')}
              <EuroField
                label="Preis pro Rolle"
                value={number(form.pricePerRollCents)}
                onChange={(value) => setValue('pricePerRollCents', value)}
              />
              {input('spoolWeightGrams', 'Rollengewicht in g', 'number')}
              {input('quantity', 'Gesamtmenge', 'number')}
              {input('unit', 'Einheit')}
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Standard-Lagerort
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                  value={string(form.storageLocationId)}
                  onChange={(event) =>
                    setValue(
                      'storageLocationId',
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">Kein Lagerort</option>
                  {rows(data.materials?.storageLocations).map((item) => (
                    <option key={string(item.id)} value={string(item.id)}>
                      {string(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Status
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                  value={string(form.status)}
                  onChange={(event) => setValue('status', event.target.value)}
                >
                  <option value="ausreichend">ausreichend</option>
                  <option value="niedrig">niedrig</option>
                  <option value="fast_leer">fast leer</option>
                  <option value="leer">leer</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">
                Notiz
                <Textarea
                  value={string(form.note)}
                  onChange={(event) => setValue('note', event.target.value)}
                  className="bg-white text-foreground"
                />
              </label>
              {editor.row.id ? (
                <MaterialImageManager
                  material={form}
                  onChanged={() => onMaterialChanged(editor.row.id)}
                />
              ) : (
                <p className="rounded-xl border border-dashed bg-white/55 p-4 text-sm text-muted-foreground sm:col-span-2">
                  Speichere zuerst das Material. Danach kannst du Bilder
                  hinzufügen.
                </p>
              )}
            </>
          ) : null}
          {isMarket ? (
            <>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Bereich
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                  value={string(form.venueKind, 'market')}
                  onChange={(event) =>
                    setValue('venueKind', event.target.value)
                  }
                >
                  <option value="market">Markt</option>
                  <option value="shelf">Regalfläche / Mietregal</option>
                </select>
              </label>
              {input('name', 'Marktname')}
              {input('location', 'Ort')}
              {input('date', 'Beginn', 'date')}
              {input('endDate', 'Ende', 'date')}
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Status
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                  value={string(form.status, 'geplant')}
                  onChange={(event) => setValue('status', event.target.value)}
                >
                  <option value="geplant">geplant</option>
                  <option value="aktiv">aktiv</option>
                  <option value="abgeschlossen">abgeschlossen</option>
                </select>
              </label>
            </>
          ) : null}
          {isExpense ? (
            <>
              {input('articleName', 'Beschreibung')}
              {input('vendor', 'Lieferant')}
              {input('invoiceDate', 'Datum', 'date')}
              <EuroField
                label="Betrag"
                value={number(form.priceCents)}
                onChange={(value) => setValue('priceCents', value)}
              />
              {input('quantity', 'Menge', 'number')}
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Kategorie
                <Input
                  list="expense-categories"
                  value={string(form.category)}
                  onChange={(event) => setValue('category', event.target.value)}
                  className="bg-white text-foreground"
                />
                <datalist id="expense-categories">
                  {[
                    'Material',
                    'Werkzeug & Maschine',
                    'Verpackung & Versand',
                    'Markt & Regalfläche',
                    'Software & Abo',
                    'Marketing',
                    'Büro',
                    'Sonstiges',
                  ].map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Wiederholung
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                  value={string(form.recurrence, 'none')}
                  onChange={(event) => {
                    setValue('recurrence', event.target.value);
                    setValue('isMonthly', event.target.value === 'monthly');
                  }}
                >
                  <option value="none">Einmalig</option>
                  <option value="monthly">Monatlich</option>
                  <option value="yearly">Jährlich</option>
                </select>
              </label>
              {string(form.recurrence, 'none') !== 'none'
                ? input('endDate', 'Endet am (optional)', 'date')
                : null}
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">
                Notiz
                <Textarea
                  value={string(form.note)}
                  onChange={(event) => setValue('note', event.target.value)}
                  className="bg-white text-foreground"
                />
              </label>
            </>
          ) : null}
          {isOnline ? (
            <>
              <label className="grid gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
                Artikel
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                  value={string(form.productId)}
                  onChange={(event) => {
                    const selected = onlineProducts.find(
                      (item) => string(item.id) === event.target.value,
                    );
                    setValue('productId', Number(event.target.value));
                    if (selected) {
                      setValue('articleName', selected.name);
                      const firstVariant = rows(selected.variants)[0];
                      if (firstVariant)
                        setValue(
                          'size',
                          string(firstVariant.size || firstVariant.name),
                        );
                    }
                  }}
                >
                  <option value="">Artikel auswählen</option>
                  {onlineProducts.map((item) => (
                    <option key={string(item.id)} value={string(item.id)}>
                      {string(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              {onlineVariants.length ? (
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  Variante / Größe
                  <select
                    className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                    value={string(form.size)}
                    onChange={(event) => setValue('size', event.target.value)}
                  >
                    {onlineVariants.map((item) => {
                      const label = string(item.size || item.name, 'Standard');
                      return (
                        <option key={string(item.id)} value={label}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : (
                input('size', 'Variante / Größe')
              )}
              {input('quantity', 'Menge', 'number')}
              {input('date', 'Verkaufsdatum', 'date')}
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Verkaufskanal
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                  value={string(form.channel, 'Abholung')}
                  onChange={(event) => setValue('channel', event.target.value)}
                >
                  {[
                    'Abholung',
                    'eBay',
                    'eBay Kleinanzeigen',
                    'Vinted',
                    'Etsy',
                    'Bestellformular',
                  ].map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </label>
              {input('orderKey', 'Bestellnummer')}
              <EuroField
                label="Verkaufspreis je Stück"
                value={number(form.salePriceCents)}
                onChange={(value) => setValue('salePriceCents', value)}
              />
              {input('printer', 'Drucker')}
              <DurationField
                label="Druckzeit"
                value={number(form.printMinutes)}
                onChange={(value) => setValue('printMinutes', value)}
              />
              <label className="grid gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
                Tatsächlich verwendetes Filament
                <Input
                  list={`sale-filaments-${string(editor.row.id, 'new')}`}
                  value={onlineMaterial ? materialChoiceLabel(onlineMaterial) : ''}
                  onChange={(event) => {
                    const selected = onlineMaterials.find(
                      (item) =>
                        materialChoiceLabel(item) === event.target.value ||
                        materialChoiceOption(item) === event.target.value,
                    );
                    if (selected) setValue('filamentMaterialId', selected.id);
                    else if (!event.target.value)
                      setValue('filamentMaterialId', null);
                  }}
                  placeholder="Marke oder Farbe suchen"
                  className="bg-white text-foreground"
                />
                <datalist id={`sale-filaments-${string(editor.row.id, 'new')}`}>
                  {onlineMaterials.map((item) => (
                    <option key={string(item.id)} value={materialChoiceOption(item)} />
                  ))}
                </datalist>
              </label>
              {input('filamentGrams', 'Verwendetes Filament in g', 'number')}
              <EuroField
                label="Materialkosten (werden neu berechnet)"
                value={
                  onlineMaterial && number(form.filamentGrams) > 0
                    ? Math.round(
                        (number(form.filamentGrams) *
                          number(onlineMaterial.pricePerRollCents)) /
                          Math.max(1, number(onlineMaterial.spoolWeightGrams)),
                      )
                    : number(form.filamentCostCents)
                }
                onChange={() => undefined}
              />
              {input('printDeadline', 'Geplant für', 'date')}
              {input('shippingMethod', 'Versandart')}
              {input('shippingDeadline', 'Versandfrist', 'date')}
              {input('shippingRecipient', 'Empfänger')}
              <EuroField
                label="Versandkosten"
                value={number(form.shippingCostCents)}
                onChange={(value) => setValue('shippingCostCents', value)}
              />
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">
                Notiz
                <Textarea
                  value={string(form.note)}
                  onChange={(event) => setValue('note', event.target.value)}
                  className="bg-white text-foreground"
                />
              </label>
            </>
          ) : null}
          {isSale ? (
            <>
              {input('date', 'Verkaufsdatum', 'date')}
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Zahlungsart
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                  value={string(form.paymentMethod)}
                  onChange={(event) =>
                    setValue('paymentMethod', event.target.value || null)
                  }
                >
                  <option value="">Ohne Angabe</option>
                  <option value="BAR">Bar</option>
                  <option value="PAYPAL">PayPal</option>
                  <option value="KARTE">Karte</option>
                  <option value="SONSTIGES">Überweisung / Sonstiges</option>
                </select>
              </label>
              <EuroField
                label="Rabatt gesamt"
                value={number(form.discountCents)}
                onChange={(value) => setValue('discountCents', value)}
              />
              {string(form.pricingMode) === 'TOTAL' ? (
                <EuroField
                  label="Gesamtpreis"
                  value={number(form.totalPriceCents)}
                  onChange={(value) => setValue('totalPriceCents', value)}
                />
              ) : null}
              <div className="grid gap-3 sm:col-span-2">
                <div>
                  <h3 className="font-medium">Verkaufspositionen</h3>
                  <p className="text-xs text-muted-foreground">
                    Mengenänderungen korrigieren den zugehörigen Marktbestand.
                  </p>
                </div>
                {rows(form.items).map((item, index) => {
                  const article = object(object(item.articleVariant).article);
                  return (
                    <div
                      key={string(item.id, String(index))}
                      className="grid gap-3 rounded-xl border bg-white/65 p-3 sm:grid-cols-3"
                    >
                      <div className="sm:col-span-3">
                        <span className="font-medium">
                          {string(article.name, 'Artikel')}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {string(
                            object(item.articleVariant).color ||
                              object(item.articleVariant).name,
                            'Standard',
                          )}
                        </span>
                      </div>
                      <Field
                        label="Menge"
                        type="number"
                        value={string(item.quantity, '1')}
                        onChange={(value) =>
                          setValue(
                            'items',
                            rows(form.items).map((candidate, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...candidate,
                                    quantity: Math.max(
                                      1,
                                      Math.trunc(Number(value) || 1),
                                    ),
                                  }
                                : candidate,
                            ),
                          )
                        }
                      />
                      <EuroField
                        label="Verkaufspreis je Stück"
                        value={number(item.unitSalePriceCents)}
                        onChange={(value) =>
                          setValue(
                            'items',
                            rows(form.items).map((candidate, itemIndex) =>
                              itemIndex === index
                                ? { ...candidate, unitSalePriceCents: value }
                                : candidate,
                            ),
                          )
                        }
                      />
                      <EuroField
                        label="Herstellung je Stück"
                        value={number(item.unitCostPriceCents)}
                        onChange={(value) =>
                          setValue(
                            'items',
                            rows(form.items).map((candidate, itemIndex) =>
                              itemIndex === index
                                ? { ...candidate, unitCostPriceCents: value }
                                : candidate,
                            ),
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">
                Notiz
                <Textarea
                  value={string(form.note)}
                  onChange={(event) => setValue('note', event.target.value)}
                  className="bg-white text-foreground"
                />
              </label>
            </>
          ) : null}
        </div>
        {message ? (
          <p className="rounded-xl border border-[var(--fp-primary)]/25 bg-white/65 px-3 py-2 text-sm text-[var(--fp-primary)]">
            {message}
          </p>
        ) : null}
        <div
          className={`sticky -bottom-6 z-10 -mx-4 justify-end gap-2 border-t bg-[#f8f4ed]/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 ${
            isProduct && editor.row.id ? 'flex lg:hidden' : 'flex'
          }`}
        >
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => void saveEverything()}
            disabled={saving || (isProduct && !string(form.name))}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}{' '}
            Alle Änderungen speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ManufacturingEditorHandle = {
  savePending: () => Promise<boolean>;
};

const ManufacturingEditor = forwardRef<
  ManufacturingEditorHandle,
  {
    product: Row;
    materials: Row[];
    products: Row[];
    components: Row[];
    onChanged: () => void | Promise<void>;
  }
>(function ManufacturingEditor(
  { product, materials, products, components, onChanged },
  ref,
) {
  const variants = rows(product.variants);
  const filaments = rows(product.filaments);
  const isDigital = isDigitalInventoryProduct(product);
  const hasSharedProduction = filaments.some(
    (item) => !string(item.productVariantId),
  );
  const filamentGroups = Array.from(
    filaments.reduce((groups, filament) => {
      const label = string(filament.part, 'Druckteil').trim() || 'Druckteil';
      groups.set(label, [...(groups.get(label) || []), filament]);
      return groups;
    }, new Map<string, Row[]>()),
  );
  const [editing, setEditing] = useState<{
    entity: 'product_variants' | 'product_filaments';
    row: Row;
  } | null>(null);
  const [values, setValues] = useState<Row>({});
  const [message, setMessage] = useState('');
  const [quickValues, setQuickValues] = useState<Record<string, Row>>({});
  const [openVariants, setOpenVariants] = useState<Record<string, boolean>>({});
  const [variantOrder, setVariantOrder] = useState<string[]>([]);
  const [draggedVariantId, setDraggedVariantId] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [pendingRemovalKey, setPendingRemovalKey] = useState('');

  useEffect(() => {
    setVariantOrder(variants.map((variant) => string(variant.id)));
    setQuickValues((current) =>
      Object.fromEntries(
        variants.map((variant) => [
          string(variant.id),
          { ...variant, ...(current[string(variant.id)] || {}) },
        ]),
      ),
    );
  }, [product.id, product.variants]);

  const orderedVariants = [
    ...variantOrder
      .map((id) => variants.find((variant) => string(variant.id) === id))
      .filter((variant): variant is Row => Boolean(variant)),
    ...variants.filter((variant) => !variantOrder.includes(string(variant.id))),
  ];

  function setOrderedVariants(ids: string[]) {
    setVariantOrder(ids);
    setQuickValues((current) => {
      const next = { ...current };
      ids.forEach((id, position) => {
        const source =
          next[id] ||
          variants.find((variant) => string(variant.id) === id) ||
          {};
        next[id] = { ...source, position };
      });
      return next;
    });
    setMessage(
      'Neue Variantenreihenfolge vorbereitet. Mit „Alle Änderungen speichern“ übernehmen.',
    );
  }

  function moveVariant(id: string, direction: -1 | 1) {
    const ids = orderedVariants.map((variant) => string(variant.id));
    const currentIndex = ids.indexOf(id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    [ids[currentIndex], ids[nextIndex]] = [ids[nextIndex], ids[currentIndex]];
    setOrderedVariants(ids);
  }

  function dropVariant(sourceId: string, targetId: string) {
    if (!sourceId || sourceId === targetId) return;
    const ids = orderedVariants.map((variant) => string(variant.id));
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    ids.splice(sourceIndex, 1);
    ids.splice(targetIndex, 0, sourceId);
    setOrderedVariants(ids);
  }

  function updateVariant(id: unknown, key: string, value: unknown) {
    setQuickValues((current) => ({
      ...current,
      [string(id)]: {
        ...(current[string(id)] ||
          variants.find((variant) => string(variant.id) === string(id)) ||
          {}),
        [key]: value,
      },
    }));
  }

  function filamentDefinitionKey(row: Row) {
    return JSON.stringify([
      string(row.part).trim(),
      string(row.materialId),
      number(row.grams),
      number(row.wasteGrams),
      string(row.printer),
      number(row.printMinutes),
      number(row.stockQuantity),
      boolean(row.printedTogether),
    ]);
  }

  function linkedFilamentRows(row: Row) {
    if (!row.id || !string(row.part).trim()) return row.id ? [row] : [];
    const definition = filamentDefinitionKey(row);
    return filaments.filter(
      (item) =>
        string(item.part).trim() && filamentDefinitionKey(item) === definition,
    );
  }

  function open(
    entity: 'product_variants' | 'product_filaments',
    row: Row = {},
  ) {
    const defaults =
      entity === 'product_variants'
        ? {
            productId: number(product.id),
            name: 'Standard',
            quantity: 0,
            position: variants.length,
          }
        : {
            productId: number(product.id),
            grams: 0,
            wasteGrams: 0,
            position: filaments.length,
          };
    const quick = quickValues[string(row.id)];
    const linkedVariantIds =
      entity === 'product_filaments'
        ? linkedFilamentRows(row)
            .map((item) => string(item.productVariantId))
            .filter(Boolean)
        : [];
    setEditing({ entity, row });
    setValues({
      ...defaults,
      ...row,
      ...(entity === 'product_variants' && quick ? quick : {}),
      ...(entity === 'product_filaments'
        ? {
            productVariantIds:
              linkedVariantIds.length > 0
                ? linkedVariantIds
                : string(row.productVariantId)
                  ? [string(row.productVariantId)]
                  : [],
          }
        : {}),
    });
    setMessage('');
    window.requestAnimationFrame(() =>
      document
        .getElementById('manufacturing-editor-' + string(product.id))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  function duplicateVariant(row: Row) {
    const copy = { ...row };
    delete copy.id;
    delete copy.createdAt;
    delete copy.updatedAt;
    setEditing({ entity: 'product_variants', row: {} });
    setValues({
      ...copy,
      productId: number(product.id),
      position: variants.length,
    });
    setMessage(
      'Kopie vorbereitet. Passe die gewünschten Felder an und speichere anschließend alle Änderungen.',
    );
    window.requestAnimationFrame(() =>
      document
        .getElementById('manufacturing-editor-' + string(product.id))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  function addMaterialToPart(row: Row) {
    open('product_filaments', {
      productId: number(product.id),
      productVariantId: row.productVariantId || null,
      part: string(row.part, 'Druckteil'),
      grams: 0,
      wasteGrams: 0,
      printer: row.printer || null,
      printMinutes: 0,
      position: filaments.length,
    });
    setMessage(
      `Weitere Farbe für „${string(row.part, 'Druckteil')}“: Material, Teilgewicht und gegebenenfalls Druckzeit ergänzen.`,
    );
  }

  function addColorToVariant(row: Row) {
    open('product_filaments', {
      productId: number(product.id),
      productVariantId: number(row.id),
      productVariantIds: [string(row.id)],
      part: '',
      grams: 0,
      wasteGrams: 0,
      printer: row.printer || null,
      printMinutes: 0,
      position: filaments.length,
    });
    setMessage(
      `Weitere Farbe für „${string(row.name, 'Variante')}“: Filament und Teilgewicht ergänzen.`,
    );
  }

  function addPartToVariant(row: Row, part = 'Bauteil') {
    open('product_filaments', {
      productId: number(product.id),
      productVariantId: number(row.id),
      productVariantIds: [string(row.id)],
      part,
      grams: 0,
      wasteGrams: 0,
      printer: row.printer || null,
      printMinutes: 0,
      position: filaments.length,
    });
    setMessage(
      `${part} für „${string(row.name, 'Variante')}“: Material, Gewicht und Druckzeit ergänzen.`,
    );
  }

  async function removeManufacturingRow(
    entity: 'product_variants' | 'product_filaments',
    row: Row,
    label: string,
  ) {
    const removalKey = `${entity}:${string(row.id)}`;
    if (pendingRemovalKey !== removalKey) {
      setPendingRemovalKey(removalKey);
      setMessage(
        `„${label}“ entfernen? Bitte den rot markierten Knopf noch einmal anklicken.`,
      );
      return;
    }
    setDetailSaving(true);
    setMessage('');
    try {
      const response = await inventoryRequest('/api/inventory/workspace', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, id: row.id }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Eintrag nicht entfernt.');
      setPendingRemovalKey('');
      setMessage(`${label} wurde entfernt.`);
      await onChanged();
    } catch (reason) {
      setPendingRemovalKey('');
      setMessage(
        reason instanceof Error ? reason.message : 'Eintrag nicht entfernt.',
      );
    } finally {
      setDetailSaving(false);
    }
  }

  async function save(refreshAfterSave = true) {
    if (!editing) return true;
    setDetailSaving(true);
    setMessage('');
    const saveValues =
      editing.entity === 'product_variants'
        ? {
            ...values,
            productionCostCents: variantCostBreakdown(
              {
                ...product,
                variants: variants.map((item) =>
                  string(item.id) === string(values.id) ? values : item,
                ),
              },
              values,
              products,
              components,
            ).totalCents,
          }
        : values;
    try {
      let nextFilaments = filaments;
      if (editing.entity === 'product_filaments') {
        const selectedVariantIds = Array.isArray(values.productVariantIds)
          ? values.productVariantIds.map((item) => string(item)).filter(Boolean)
          : string(values.productVariantId)
            ? [string(values.productVariantId)]
            : [];
        const desiredVariantIds: Array<string | null> =
          selectedVariantIds.length ? selectedVariantIds : [null];
        const sourceRows = editing.row.id
          ? linkedFilamentRows(editing.row)
          : [];
        const unusedRows = [...sourceRows];
        const savedRows: Row[] = [];
        const filamentValues = { ...values };
        delete filamentValues.productVariantIds;

        for (const [index, variantId] of desiredVariantIds.entries()) {
          let rowIndex = unusedRows.findIndex(
            (item) => string(item.productVariantId) === string(variantId),
          );
          if (rowIndex < 0 && index === 0 && unusedRows.length) rowIndex = 0;
          const existing =
            rowIndex >= 0 ? unusedRows.splice(rowIndex, 1)[0] : null;
          const rowValues = {
            ...filamentValues,
            productVariantId: variantId ? Number(variantId) : null,
          };
          const response = await inventoryRequest('/api/inventory/workspace', {
            method: existing?.id == null ? 'POST' : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity: 'product_filaments',
              id: existing?.id,
              values: rowValues,
            }),
          });
          const result = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!response.ok)
            throw new Error(
              result.error || 'Bauteil konnte nicht gespeichert werden.',
            );
          savedRows.push({ ...rowValues, id: existing?.id });
        }

        for (const obsolete of unusedRows) {
          const response = await inventoryRequest('/api/inventory/workspace', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity: 'product_filaments',
              id: obsolete.id,
            }),
          });
          if (!response.ok)
            throw new Error(
              'Eine abgewählte Varianten-Zuordnung konnte nicht entfernt werden.',
            );
        }

        const sourceIds = new Set(sourceRows.map((item) => string(item.id)));
        nextFilaments = [
          ...filaments.filter((item) => !sourceIds.has(string(item.id))),
          ...savedRows,
        ];
      } else {
        const response = await inventoryRequest('/api/inventory/workspace', {
          method: editing.row.id == null ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity: editing.entity,
            id: editing.row.id,
            values: saveValues,
          }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            result.error || 'Ausführung konnte nicht gespeichert werden.',
          );
      }
      if (editing.entity === 'product_filaments') {
        const nextProduct = { ...product, filaments: nextFilaments };
        const costResponses = await Promise.all(
          variants.map((variant) =>
            inventoryRequest('/api/inventory/workspace', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity: 'product_variants',
                id: variant.id,
                values: {
                  productionCostCents: variantCostBreakdown(
                    nextProduct,
                    variant,
                    products,
                    components,
                  ).totalCents,
                },
              }),
            }),
          ),
        );
        if (costResponses.some((item) => !item.ok))
          throw new Error(
            'Die Herstellkosten der Varianten konnten nicht vollständig aktualisiert werden.',
          );
      }
      if (refreshAfterSave) await onChanged();
      setEditing(null);
      setMessage('Variante und Herstellungsdaten wurden gespeichert.');
      return true;
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Ausführung konnte nicht gespeichert werden.',
      );
      return false;
    } finally {
      setDetailSaving(false);
    }
  }

  async function saveQuickValues(
    refreshAfterSave = true,
    excludedVariantId = '',
  ) {
    const changed = variants.filter((variant) => {
      if (string(variant.id) === excludedVariantId) return false;
      const next = quickValues[string(variant.id)];
      if (!next) return false;
      const fields = [
        'weightClassGroup',
        'defectSourceVariantId',
        'name',
        'materialId',
        'grams',
        'wasteGrams',
        'size',
        'appearance',
        'quantity',
        'discountPercent',
        'defectNote',
        'accessories',
        'extraCostCents',
        'priceCents',
        'marketPriceCents',
        'vintedPriceCents',
        'etsyPriceCents',
        'printer',
        'printMinutes',
        'position',
      ];
      return fields.some((field) => next[field] !== variant[field]);
    });
    if (!changed.length) {
      return true;
    }
    setQuickSaving(true);
    setMessage('');
    try {
      for (const variant of changed) {
        const next = quickValues[string(variant.id)];
        const nextProduct = {
          ...product,
          variants: variants.map(
            (item) => quickValues[string(item.id)] || item,
          ),
        };
        const response = await inventoryRequest('/api/inventory/workspace', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity: 'product_variants',
            id: variant.id,
            values: {
              ...next,
              quantity: Math.max(0, Math.trunc(number(next.quantity))),
              priceCents: Math.max(0, Math.trunc(number(next.priceCents))),
              productionCostCents: variantCostBreakdown(
                nextProduct,
                next,
                products,
                components,
              ).totalCents,
            },
          }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            result.error ||
              `${string(variant.name, 'Variante')} konnte nicht gespeichert werden.`,
          );
      }
      if (refreshAfterSave) await onChanged();
      setMessage(
        `${changed.length} ${changed.length === 1 ? 'Variante wurde' : 'Varianten wurden'} gespeichert.`,
      );
      return true;
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Bestand und Preise konnten nicht gespeichert werden.',
      );
      return false;
    } finally {
      setQuickSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({
    async savePending() {
      const editedVariantId =
        editing?.entity === 'product_variants' ? string(editing.row.id) : '';
      if (editing) {
        const detailSaved = await save(false);
        if (!detailSaved) return false;
      }
      return saveQuickValues(false, editedVariantId);
    },
  }));

  return (
    <section className="min-w-0 rounded-2xl border bg-white/70 p-4 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-xl">Varianten</h3>
          <p className="text-sm text-muted-foreground">
            {isDigital
              ? 'Jede digitale Ausführung mit eigenem Preis und ohne Stückbegrenzung.'
              : 'Jede Ausführung mit eigenem Preis, eigener Größe, eigenem Bestand und eigener Produktion.'}
          </p>
        </div>
        <Badge variant="outline">
          {isDigital
            ? 'Unbegrenzt verfügbar'
            : `${variants.reduce(
                (sum, variant) =>
                  sum +
                  number(
                    quickValues[string(variant.id)]?.quantity ??
                      variant.quantity,
                  ),
                0,
              )} fertig`}
        </Badge>
      </div>
      {message ? (
        <p className="mt-3 rounded-xl border bg-[var(--fp-paper)]/70 p-3 text-sm">
          {message}
        </p>
      ) : null}
      <div className="mt-4 space-y-4">
        {orderedVariants.map((variant, index) => {
          const id = string(variant.id);
          const draft = quickValues[id] || variant;
          const draftProduct = {
            ...product,
            variants: variants.map(
              (item) => quickValues[string(item.id)] || item,
            ),
          };
          const cost = variantCostBreakdown(
            draftProduct,
            draft,
            products,
            components,
          );
          const issues = variantProductionIssues(draftProduct, draft);
          const sharedParts = filaments.filter(
            (item) => !string(item.productVariantId),
          );
          const variantParts = filaments.filter(
            (item) => string(item.productVariantId) === id,
          );
          const overriddenPartNames = new Set(
            variantParts
              .map((item) => string(item.part).trim())
              .filter(Boolean),
          );
          const effectiveParts = [
            ...sharedParts.filter(
              (item) =>
                !string(item.part).trim() ||
                !overriddenPartNames.has(string(item.part).trim()),
            ),
            ...variantParts,
          ];
          // Mirror the calculation engine: an unnamed legacy filament row is
          // only a fallback when the variant has no own production weight.
          const relevantParts =
            number(draft.grams) > 0
              ? effectiveParts.filter(
                  (item) =>
                    string(item.part).trim() ||
                    string(item.productVariantId) === id,
                )
              : effectiveParts;
          const structuralParts = relevantParts.filter((item) =>
            string(item.part).trim(),
          );
          const variantNamedParts = variantParts.filter((item) =>
            string(item.part).trim(),
          );
          const additionalColors = variantParts.filter(
            (item) => !string(item.part).trim(),
          );
          const partNames = new Set(
            structuralParts
              .map((item) => string(item.part).trim())
              .filter(Boolean),
          );
          const usesPartProduction = structuralParts.length > 0;
          const isMultipart = partNames.size > 1;
          const defectSource = variants.find(
            (item) => string(item.id) === string(draft.defectSourceVariantId),
          );
          const simpleColorCount =
            (string(draft.materialId) ? 1 : 0) + additionalColors.length;
          const productionLabel = isDigital
            ? 'Digital · unbegrenzt'
            : isMultipart
              ? `Mehrteilig · ${partNames.size} Bauteile`
              : usesPartProduction
                ? `Einfach · ${structuralParts.length} Materialien`
                : simpleColorCount > 1
                  ? `Einfach · ${simpleColorCount} Farben`
                  : 'Einfach';
          const imagePath = string(draft.imageUrl || productImagePath(product));
          const printMinutes = number(draft.printMinutes);
          return (
            <details
              key={id}
              open={openVariants[id] ?? false}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setOpenVariants((current) => ({
                  ...current,
                  [id]: isOpen,
                }));
              }}
              onDragOver={(event) => {
                if (draggedVariantId) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropVariant(
                  event.dataTransfer.getData('text/plain') || draggedVariantId,
                  id,
                );
                setDraggedVariantId('');
              }}
              className={`group min-w-0 max-w-full overflow-hidden rounded-2xl border bg-[var(--fp-paper)]/55 transition ${
                draggedVariantId === id ? 'opacity-55' : ''
              }`}
            >
              <summary className="grid cursor-pointer list-none gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <span className="min-w-0">
                  <strong className="block truncate">
                    {string(draft.name, `Variante ${index + 1}`)}
                  </strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {[string(draft.size), string(draft.appearance)]
                      .filter(Boolean)
                      .join(' · ') || 'Größe und Ausprägung noch offen'}
                  </span>
                  {defectSource ? (
                    <span className="mt-1 block text-xs font-medium text-[#8b5c27]">
                      Mangelware von{' '}
                      {string(
                        defectSource.name || defectSource.size,
                        'gewählter Variante',
                      )}{' '}
                      · {number(draft.quantity)} Stück
                    </span>
                  ) : null}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {isDigital ? (
                      <>Digitale Datei · kein Stücklimit · 100 % Marge</>
                    ) : (
                      <>
                        {productionLabel} ·{' '}
                        {decimalInputValue(cost.netGrams + cost.wasteGrams)} g ·{' '}
                        {duration(cost.printMinutes)} · Herstellungskosten{' '}
                        {cents(cost.totalCents)} ·{' '}
                        {cost.marginPercent == null
                          ? 'Marge offen'
                          : `${cost.marginPercent.toFixed(1)} % Marge`}
                      </>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Direkt{' '}
                    {cents(number(draft.directPriceCents ?? draft.priceCents))}
                    {' · '}Markt{' '}
                    {cents(number(draft.marketPriceCents ?? draft.priceCents))}
                    {' · '}Vinted{' '}
                    {cents(number(draft.vintedPriceCents ?? draft.priceCents))}
                    {' · '}eBay{' '}
                    {cents(number(draft.ebayPriceCents ?? draft.priceCents))}
                    {' · '}Etsy{' '}
                    {cents(number(draft.etsyPriceCents ?? draft.priceCents))}
                  </span>
                  {issues.length ? (
                    <span className="mt-2 block text-xs font-medium text-[#8b5c27]">
                      ⚠ {issues.join(' · ')}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground sm:justify-end">
                  <span
                    draggable
                    role="button"
                    tabIndex={0}
                    aria-label={`${string(draft.name, `Variante ${index + 1}`)} verschieben`}
                    title="Ziehen, um die Variante zu verschieben"
                    className="grid size-8 cursor-grab place-items-center rounded-lg border bg-white active:cursor-grabbing"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', id);
                      setDraggedVariantId(id);
                    }}
                    onDragEnd={() => setDraggedVariantId('')}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      moveVariant(id, event.key === 'ArrowUp' ? -1 : 1);
                    }}
                  >
                    <GripVertical className="size-4" />
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={index === 0}
                    aria-label={`${string(draft.name, `Variante ${index + 1}`)} nach oben`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      moveVariant(id, -1);
                    }}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={index === orderedVariants.length - 1}
                    aria-label={`${string(draft.name, `Variante ${index + 1}`)} nach unten`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      moveVariant(id, 1);
                    }}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <span>
                    {isDigital
                      ? 'Unbegrenzt'
                      : `${number(draft.quantity)} Stück`}
                  </span>
                  <strong className="text-foreground">
                    {cents(number(draft.priceCents))}
                  </strong>
                  <span className="text-base transition group-open:rotate-180">
                    ⌄
                  </span>
                </span>
              </summary>
              <div className="min-w-0 max-w-full border-t p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Produktion: {productionLabel}</span>
                  <span>
                    {cost.marginPercent == null
                      ? 'Marge offen'
                      : `${cost.marginPercent.toFixed(1)} % Marge`}
                  </span>
                </div>
                {hasSharedProduction &&
                number(draft.grams) <= 0 &&
                number(draft.printMinutes) <= 0 ? (
                  <p className="mb-4 rounded-xl border border-[var(--fp-primary)]/20 bg-[var(--fp-mist)]/70 p-3 text-sm text-foreground">
                    Produktion aus den gemeinsamen Druckteilen:{' '}
                    <strong>
                      {decimalInputValue(cost.netGrams + cost.wasteGrams)} g ·{' '}
                      {duration(cost.printMinutes)}
                    </strong>
                    . Die Felder unten sind nur für eine abweichende Herstellung
                    dieser Variante gedacht.
                  </p>
                ) : null}
                <div className="grid min-w-0 gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                  <div>
                    <div className="relative aspect-square overflow-hidden rounded-2xl border bg-[#ebe5db]">
                      {imagePath ? (
                        <Image
                          src={inventoryImageUrl(imagePath)}
                          alt={`Bild für Variante ${index + 1}`}
                          fill
                          unoptimized
                          sizes="180px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-sm text-muted-foreground">
                          + Bild der Variante
                        </div>
                      )}
                    </div>
                    <ImageUpload
                      productId={string(product.id)}
                      variantId={id}
                      label={`Bild für Variante ${index + 1} wählen`}
                      onUploaded={onChanged}
                    />
                    {!string(draft.imageUrl) && imagePath ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Hier wird das Produktbild verwendet.
                      </p>
                    ) : null}
                  </div>
                  <div className="grid min-w-0 content-start gap-4 sm:grid-cols-2">
                    <h4 className="text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase sm:col-span-2">
                      Verkauf &amp; Bestand
                    </h4>
                    <Field
                      label="Name der Variante"
                      value={string(draft.name)}
                      onChange={(value) => updateVariant(id, 'name', value)}
                    />
                    {!isDigital && !usesPartProduction ? (
                      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                        Filament / Material
                        <select
                          className={`h-9 rounded-lg border bg-white px-3 text-sm text-foreground ${issues.includes('Filament fehlt') ? 'border-[#b87935]' : ''}`}
                          value={string(draft.materialId)}
                          onChange={(event) =>
                            updateVariant(
                              id,
                              'materialId',
                              event.target.value
                                ? Number(event.target.value)
                                : null,
                            )
                          }
                        >
                          <option value="">Filament wählen</option>
                          {materials.map((item) => (
                            <option
                              key={string(item.id)}
                              value={string(item.id)}
                            >
                              {materialChoiceOption(item)}
                            </option>
                          ))}
                        </select>
                        {issues.includes('Filament fehlt') ? (
                          <span className="font-normal text-[#8b5c27]">
                            ⚠ Für die Kostenberechnung erforderlich
                          </span>
                        ) : null}
                      </label>
                    ) : !isDigital ? (
                      <div className="rounded-xl border bg-white p-3 text-sm">
                        <span className="font-medium">
                          Mehrteilige Produktion
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Materialien werden unten je Bauteil gepflegt.
                        </span>
                      </div>
                    ) : null}
                    <Field
                      label="Einheit / Größe"
                      value={string(draft.size)}
                      onChange={(value) => updateVariant(id, 'size', value)}
                    />
                    <div className="sm:col-span-2">
                      <SalesPriceFields
                        values={draft}
                        standardKey="priceCents"
                        onChange={(key, value) => updateVariant(id, key, value)}
                      />
                      {issues.includes('Verkaufspreis fehlt') ? (
                        <p className="mt-1 text-xs text-[#8b5c27]">
                          ⚠ Für die Kalkulation erforderlich
                        </p>
                      ) : null}
                    </div>
                    {isDigital ? (
                      <div className="rounded-xl border bg-[var(--fp-mist)]/60 p-3 text-sm sm:col-span-2">
                        <strong>Unbegrenzt verfügbar</strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Digitale Varianten benötigen keinen Fertigbestand.
                        </span>
                      </div>
                    ) : (
                      <>
                        <Field
                          label={
                            string(draft.defectSourceVariantId)
                              ? 'Anzahl Mangelware'
                              : 'Fertigbestand'
                          }
                          type="number"
                          value={string(number(draft.quantity))}
                          onChange={(value) =>
                            updateVariant(
                              id,
                              'quantity',
                              Math.max(0, Number(value) || 0),
                            )
                          }
                        />
                        <div className="hidden sm:block" />
                      </>
                    )}
                    <h4 className="border-t pt-4 text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase sm:col-span-2">
                      Produktion
                    </h4>
                    {usesPartProduction ? (
                      <div className="rounded-xl border bg-[var(--fp-mist)]/60 p-3 text-sm sm:col-span-2">
                        <strong>
                          Automatisch aus{' '}
                          {isMultipart
                            ? `${partNames.size} Bauteilen`
                            : `${structuralParts.length} Material${structuralParts.length === 1 ? '' : 'ien'}`}
                        </strong>
                        <span className="mt-1 block text-muted-foreground">
                          {decimalInputValue(cost.netGrams + cost.wasteGrams)} g
                          {' · '}
                          {duration(cost.printMinutes)}. Gewicht, Druckzeit,
                          Drucker und Material werden ausschließlich an den
                          Bauteilen bearbeitet.
                        </span>
                      </div>
                    ) : (
                      <>
                        <div>
                          <DecimalField
                            label="Nettogewicht (Gramm)"
                            value={number(draft.grams)}
                            onChange={(value) =>
                              updateVariant(id, 'grams', value)
                            }
                          />
                          {issues.includes('Gewicht fehlt') ? (
                            <p className="mt-1 text-xs text-[#8b5c27]">
                              ⚠ Für die Kostenberechnung erforderlich
                            </p>
                          ) : null}
                        </div>
                        <DecimalField
                          label="Abfall (Gramm)"
                          value={number(draft.wasteGrams)}
                          onChange={(value) =>
                            updateVariant(id, 'wasteGrams', value)
                          }
                        />
                        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">
                          Drucker
                          <select
                            className={`h-9 rounded-lg border bg-white px-3 text-sm text-foreground ${issues.includes('Drucker fehlt') ? 'border-[#b87935]' : ''}`}
                            value={string(draft.printer)}
                            onChange={(event) =>
                              updateVariant(
                                id,
                                'printer',
                                event.target.value || null,
                              )
                            }
                          >
                            <option value="">Kein Drucker gewählt</option>
                            {PRINTERS.map((printer) => (
                              <option key={printer}>{printer}</option>
                            ))}
                          </select>
                          <span
                            className={
                              issues.includes('Drucker fehlt')
                                ? 'font-normal text-[#8b5c27]'
                                : 'font-normal'
                            }
                          >
                            {issues.includes('Drucker fehlt') ? '⚠ ' : ''}Ohne
                            Gerät lassen sich die Stromkosten nicht berechnen.
                          </span>
                        </label>
                        <div>
                          <DurationField
                            value={printMinutes}
                            onChange={(value) =>
                              updateVariant(id, 'printMinutes', value)
                            }
                          />
                          {issues.includes('Druckzeit fehlt') ? (
                            <p className="mt-1 text-xs text-[#8b5c27]">
                              ⚠ Für die Kostenberechnung erforderlich
                            </p>
                          ) : null}
                        </div>
                      </>
                    )}
                    <div className="rounded-xl border bg-white/75 p-3 sm:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h5 className="text-sm font-medium">
                            Farben dieser Variante
                          </h5>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Jede Farbe erhält ihr eigenes Teilgewicht und fließt
                            in die Kosten ein.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addColorToVariant(draft)}
                        >
                          <Plus className="size-3.5" /> Weitere Farbe
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!usesPartProduction && string(draft.materialId) ? (
                          <span className="rounded-xl border bg-[var(--fp-mist)]/55 px-3 py-2 text-xs">
                            <strong className="block">Hauptfarbe</strong>
                            <span className="mt-0.5 block text-muted-foreground">
                              {materialChoiceLabel(object(draft.material)) ||
                                'Filament gewählt'}{' '}
                              · {decimalInputValue(draft.grams)} g
                            </span>
                          </span>
                        ) : null}
                        {additionalColors.map((item) => {
                          const label =
                            materialChoiceLabel(object(item.material)) ||
                            'Material offen';
                          return (
                            <span
                              key={string(item.id)}
                              className="inline-flex overflow-hidden rounded-xl border bg-white"
                            >
                              <button
                                type="button"
                                className="px-3 py-2 text-left text-xs hover:bg-[var(--fp-mist)]"
                                onClick={() => open('product_filaments', item)}
                              >
                                <strong className="block">
                                  {string(item.part, 'Zusatzfarbe')}
                                </strong>
                                <span className="mt-0.5 block text-muted-foreground">
                                  {label} · {decimalInputValue(item.grams)} g
                                </span>
                              </button>
                              <Button
                                type="button"
                                variant={
                                  pendingRemovalKey ===
                                  `product_filaments:${string(item.id)}`
                                    ? 'destructive'
                                    : 'ghost'
                                }
                                size="icon"
                                className="h-auto w-9 rounded-none border-l text-red-700"
                                disabled={detailSaving}
                                aria-label={
                                  pendingRemovalKey ===
                                  `product_filaments:${string(item.id)}`
                                    ? `${label} endgültig entfernen`
                                    : `${label} entfernen`
                                }
                                onClick={() =>
                                  void removeManufacturingRow(
                                    'product_filaments',
                                    item,
                                    label,
                                  )
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </span>
                          );
                        })}
                        {!string(draft.materialId) &&
                        !additionalColors.length ? (
                          <span className="text-xs text-muted-foreground">
                            Noch keine Farbe hinterlegt.
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {!isDigital ? (
                      <div className="rounded-xl border bg-white/75 p-3 sm:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h5 className="text-sm font-medium">
                              Bauteile dieser Variante
                            </h5>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Zum Beispiel Wandhalterung oder Tischständer –
                              jeweils mit eigenem Material, Gewicht und eigener
                              Druckzeit.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                addPartToVariant(draft, 'Wandhalterung')
                              }
                            >
                              <Plus className="size-3.5" /> Wandhalterung
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                addPartToVariant(draft, 'Tischständer')
                              }
                            >
                              <Plus className="size-3.5" /> Tischständer
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => addPartToVariant(draft)}
                            >
                              <Plus className="size-3.5" /> Weiteres Bauteil
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {variantNamedParts.map((item) => {
                            const materialLabel =
                              materialChoiceLabel(object(item.material)) ||
                              'Material offen';
                            const partLabel = string(item.part, 'Bauteil');
                            return (
                              <span
                                key={string(item.id)}
                                className="inline-flex overflow-hidden rounded-xl border bg-white"
                              >
                                <button
                                  type="button"
                                  className="px-3 py-2 text-left text-xs hover:bg-[var(--fp-mist)]"
                                  onClick={() =>
                                    open('product_filaments', item)
                                  }
                                >
                                  <strong className="block">{partLabel}</strong>
                                  <span className="mt-0.5 block text-muted-foreground">
                                    {materialLabel} ·{' '}
                                    {decimalInputValue(item.grams)} g
                                    {number(item.printMinutes) > 0
                                      ? ` · ${duration(number(item.printMinutes))}`
                                      : ''}
                                  </span>
                                </button>
                                <Button
                                  type="button"
                                  variant={
                                    pendingRemovalKey ===
                                    `product_filaments:${string(item.id)}`
                                      ? 'destructive'
                                      : 'ghost'
                                  }
                                  size="icon"
                                  className="h-auto w-9 rounded-none border-l text-red-700"
                                  disabled={detailSaving}
                                  aria-label={
                                    pendingRemovalKey ===
                                    `product_filaments:${string(item.id)}`
                                      ? `${partLabel} endgültig entfernen`
                                      : `${partLabel} entfernen`
                                  }
                                  onClick={() =>
                                    void removeManufacturingRow(
                                      'product_filaments',
                                      item,
                                      partLabel,
                                    )
                                  }
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </span>
                            );
                          })}
                          {!variantNamedParts.length ? (
                            <span className="text-xs text-muted-foreground">
                              Noch keine Bauteile für diese Variante angelegt.
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <details className="group/more mt-4 rounded-xl border bg-white/55">
                  <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium">
                    Mangelware, Zubehör &amp; Zusatzkosten
                    <span className="transition group-open/more:rotate-180">
                      ⌄
                    </span>
                  </summary>
                  <div className="grid gap-4 border-t p-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                      Mangelware von Variante
                      <select
                        className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                        value={string(draft.defectSourceVariantId)}
                        onChange={(event) =>
                          updateVariant(
                            id,
                            'defectSourceVariantId',
                            event.target.value
                              ? Number(event.target.value)
                              : null,
                          )
                        }
                      >
                        <option value="">
                          Keine Mangelware – normale Variante
                        </option>
                        {variants
                          .filter(
                            (item) =>
                              string(item.id) !== id &&
                              !string(item.defectSourceVariantId),
                          )
                          .map((item) => (
                            <option
                              key={string(item.id)}
                              value={string(item.id)}
                            >
                              {string(
                                item.name || item.appearance,
                                'Variante ' + string(item.id),
                              )}
                              {string(item.size)
                                ? ` · ${string(item.size)}`
                                : ''}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                      Nachlass bei Mangelware
                      <select
                        className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                        value={string(draft.discountPercent, '0')}
                        onChange={(event) =>
                          updateVariant(
                            id,
                            'discountPercent',
                            Number(event.target.value),
                          )
                        }
                      >
                        {[0, 10, 15, 20, 25, 30, 50].map((value) => (
                          <option key={value} value={value}>
                            {value ? `${value} %` : 'Kein Nachlass'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field
                      label="Mangel / Fehler"
                      value={string(draft.defectNote)}
                      onChange={(value) =>
                        updateVariant(id, 'defectNote', value)
                      }
                    />
                    <Field
                      label="Mitgegebenes Zubehör (Freitext)"
                      value={string(draft.accessories)}
                      onChange={(value) =>
                        updateVariant(id, 'accessories', value)
                      }
                    />
                    <EuroField
                      label="Zusatzkosten je Stück"
                      value={number(draft.extraCostCents)}
                      onChange={(value) =>
                        updateVariant(id, 'extraCostCents', value)
                      }
                    />
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          document
                            .getElementById(
                              `product-components-${string(product.id)}`,
                            )
                            ?.scrollIntoView({ behavior: 'smooth' })
                        }
                      >
                        <Plus className="size-3.5" /> Bauteil zuordnen
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          document
                            .getElementById(
                              `product-accessories-${string(product.id)}`,
                            )
                            ?.scrollIntoView({ behavior: 'smooth' })
                        }
                      >
                        <Plus className="size-3.5" /> Zubehörartikel zuordnen
                      </Button>
                    </div>
                  </div>
                </details>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => duplicateVariant(draft)}
                  >
                    <Plus className="size-3.5" /> Variante duplizieren
                  </Button>
                  <Button
                    type="button"
                    variant={
                      pendingRemovalKey ===
                      `product_variants:${string(variant.id)}`
                        ? 'destructive'
                        : 'ghost'
                    }
                    size="sm"
                    className="text-red-700"
                    disabled={detailSaving}
                    onClick={() =>
                      void removeManufacturingRow(
                        'product_variants',
                        variant,
                        string(draft.name, `Variante ${index + 1}`),
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />{' '}
                    {pendingRemovalKey ===
                    `product_variants:${string(variant.id)}`
                      ? 'Löschen bestätigen'
                      : 'Variante entfernen'}
                  </Button>
                </div>
              </div>
            </details>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-4"
        onClick={() =>
          variants.length
            ? duplicateVariant(
                quickValues[string(variants.at(-1)?.id)] || variants.at(-1)!,
              )
            : open('product_variants')
        }
      >
        <Plus className="size-3.5" /> Weitere Variante
      </Button>
      {!isDigital ? (
        <details
          open={filaments.length > 0}
          className="group mt-4 rounded-xl border bg-white/45"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-medium">
            <span>
              Herstellung
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                Woraus ein Stück entsteht – Druckteile, Lagerartikel und
                Zubehör.
              </span>
            </span>
            <span className="text-sm transition group-open:rotate-180">⌄</span>
          </summary>
          <div className="border-t p-3">
            <div className="space-y-3">
              {filamentGroups.map(([part, partFilaments]) => (
                <div key={part} className="rounded-xl border bg-white/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong className="text-sm">{part}</strong>
                      <p className="text-xs text-muted-foreground">
                        {partFilaments.length}{' '}
                        {partFilaments.length === 1
                          ? 'Farbe / Material'
                          : 'Farben / Materialien'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addMaterialToPart(partFilaments[0])}
                    >
                      <Plus className="size-3.5" /> Farbe / Material
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {partFilaments.map((item) => {
                      const assignedVariant = variants.find(
                        (variant) =>
                          string(variant.id) === string(item.productVariantId),
                      );
                      const label =
                        materialChoiceLabel(object(item.material)) ||
                        'Material offen';
                      return (
                        <span
                          key={string(item.id)}
                          className="inline-flex overflow-hidden rounded-xl border bg-white"
                        >
                          <button
                            type="button"
                            onClick={() => open('product_filaments', item)}
                            className="px-3 py-2 text-left text-xs hover:bg-[var(--fp-mist)]"
                          >
                            <span className="block font-medium">{label}</span>
                            <span className="mt-1 block text-muted-foreground">
                              {decimalInputValue(item.grams)} g
                              {number(item.printMinutes) > 0
                                ? ` · ${duration(number(item.printMinutes))}`
                                : ''}
                              {' · '}
                              {assignedVariant
                                ? string(assignedVariant.name, 'Variante')
                                : 'alle Varianten'}
                            </span>
                          </button>
                          <Button
                            type="button"
                            variant={
                              pendingRemovalKey ===
                              `product_filaments:${string(item.id)}`
                                ? 'destructive'
                                : 'ghost'
                            }
                            size="icon"
                            className="h-auto w-9 rounded-none border-l text-red-700"
                            disabled={detailSaving}
                            aria-label={
                              pendingRemovalKey ===
                              `product_filaments:${string(item.id)}`
                                ? `${label} endgültig entfernen`
                                : `${label} entfernen`
                            }
                            onClick={() =>
                              void removeManufacturingRow(
                                'product_filaments',
                                item,
                                `${part} · ${label}`,
                              )
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {!filaments.length ? (
              <p className="text-sm text-muted-foreground">
                Noch keine eigenen Druckteile hinterlegt.
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => open('product_filaments')}
            >
              <Plus className="size-3.5" /> Neues Bauteil
            </Button>
          </div>
        </details>
      ) : null}
      {!isDigital && !variants.length && !filaments.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Noch keine Ausführungen oder Filamente hinterlegt.
        </p>
      ) : null}
      {editing ? (
        <div
          id={'manufacturing-editor-' + string(product.id)}
          className="mt-4 scroll-mt-6 overflow-hidden rounded-2xl border bg-[var(--fp-paper)]/55"
        >
          <div className="flex items-start justify-between gap-3 p-4">
            <div>
              <h4 className="font-medium">
                {editing.entity === 'product_variants'
                  ? editing.row.id
                    ? 'Variante bearbeiten'
                    : 'Neue Variante'
                  : editing.row.id
                    ? 'Bauteil bearbeiten'
                    : 'Neues Bauteil'}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {editing.entity === 'product_variants'
                  ? 'Dieselben Angaben wie bei jeder bereits gespeicherten Variante.'
                  : 'Material und Produktionsdaten dieses Druckteils.'}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditing(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div
            className={
              editing.entity === 'product_variants'
                ? 'grid min-w-0 gap-4 border-t p-4'
                : 'grid min-w-0 gap-4 border-t p-4 sm:grid-cols-2 lg:grid-cols-3'
            }
          >
            {editing.entity === 'product_variants' ? (
              <>
                <section className="rounded-xl border bg-white/70 p-4">
                  <h5 className="text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase">
                    {isDigital ? 'Verkauf' : 'Verkauf & Bestand'}
                  </h5>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Name der Variante"
                      value={string(values.name)}
                      onChange={(value) =>
                        setValues((current) => ({ ...current, name: value }))
                      }
                    />
                    <Field
                      label="Einheit / Größe"
                      value={string(values.size)}
                      onChange={(value) =>
                        setValues((current) => ({ ...current, size: value }))
                      }
                    />
                    {!isDigital ? (
                      <>
                        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                          Filament / Material
                          <select
                            className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                            value={string(values.materialId)}
                            onChange={(event) => {
                              const material = materials.find(
                                (item) =>
                                  string(item.id) === event.target.value,
                              );
                              setValues((current) => ({
                                ...current,
                                materialId: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                                material: material || null,
                              }));
                            }}
                          >
                            <option value="">Filament wählen</option>
                            {materials.map((item) => (
                              <option
                                key={string(item.id)}
                                value={string(item.id)}
                              >
                                {materialChoiceOption(item)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Field
                          label={
                            string(values.defectSourceVariantId)
                              ? 'Anzahl Mangelware'
                              : 'Fertigbestand'
                          }
                          type="number"
                          value={string(values.quantity)}
                          onChange={(value) =>
                            setValues((current) => ({
                              ...current,
                              quantity: Math.max(0, Number(value) || 0),
                            }))
                          }
                        />
                      </>
                    ) : (
                      <div className="rounded-xl border bg-[var(--fp-mist)]/60 p-3 text-sm sm:col-span-2">
                        <strong>Unbegrenzt verfügbar · 100 % Marge</strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Für selbst erstellte digitale Dateien entstehen keine
                          Stück- oder Produktionskosten.
                        </span>
                      </div>
                    )}
                    <SalesPriceFields
                      values={values}
                      standardKey="priceCents"
                      className="sm:col-span-2"
                      onChange={(key, value) =>
                        setValues((current) => ({ ...current, [key]: value }))
                      }
                    />
                  </div>
                </section>
                <section className="rounded-xl border bg-white/70 p-4">
                  <h5 className="text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase">
                    Produktion
                  </h5>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <DecimalField
                      label="Nettogewicht (Gramm)"
                      value={number(values.grams)}
                      onChange={(value) =>
                        setValues((current) => ({ ...current, grams: value }))
                      }
                    />
                    <DecimalField
                      label="Abfall (Gramm)"
                      value={number(values.wasteGrams)}
                      onChange={(value) =>
                        setValues((current) => ({
                          ...current,
                          wasteGrams: value,
                        }))
                      }
                    />
                    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                      Drucker
                      <select
                        className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                        value={string(values.printer)}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            printer: event.target.value || null,
                          }))
                        }
                      >
                        <option value="">Kein Drucker gewählt</option>
                        {PRINTERS.map((printer) => (
                          <option key={printer}>{printer}</option>
                        ))}
                      </select>
                    </label>
                    <DurationField
                      value={number(values.printMinutes)}
                      onChange={(value) =>
                        setValues((current) => ({
                          ...current,
                          printMinutes: value,
                        }))
                      }
                    />
                  </div>
                </section>
                <details className="group/more rounded-xl border bg-white/55">
                  <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium">
                    Mangelware, Zubehör &amp; Zusatzkosten
                    <span className="transition group-open/more:rotate-180">
                      ⌄
                    </span>
                  </summary>
                  <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                      Mangelware von Variante
                      <select
                        className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                        value={string(values.defectSourceVariantId)}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            defectSourceVariantId: event.target.value
                              ? Number(event.target.value)
                              : null,
                          }))
                        }
                      >
                        <option value="">
                          Keine Mangelware – normale Variante
                        </option>
                        {variants
                          .filter(
                            (item) =>
                              string(item.id) !== string(values.id) &&
                              !string(item.defectSourceVariantId),
                          )
                          .map((item) => (
                            <option
                              key={string(item.id)}
                              value={string(item.id)}
                            >
                              {string(
                                item.name || item.appearance,
                                'Variante ' + string(item.id),
                              )}
                              {string(item.size)
                                ? ` · ${string(item.size)}`
                                : ''}
                            </option>
                          ))}
                      </select>
                    </label>
                    <Field
                      label="Farbe / Erscheinung"
                      value={string(values.appearance)}
                      onChange={(value) =>
                        setValues((current) => ({
                          ...current,
                          appearance: value,
                        }))
                      }
                    />
                    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                      Nachlass bei Mangelware
                      <select
                        className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                        value={string(values.discountPercent, '0')}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            discountPercent: Number(event.target.value),
                          }))
                        }
                      >
                        {![0, 10, 15, 20, 25, 30, 50].includes(
                          number(values.discountPercent),
                        ) ? (
                          <option value={string(values.discountPercent)}>
                            {string(values.discountPercent)} %
                          </option>
                        ) : null}
                        {[0, 10, 15, 20, 25, 30, 50].map((value) => (
                          <option key={value} value={value}>
                            {value ? `${value} %` : 'Kein Nachlass'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field
                      label="Mangel / Fehler"
                      value={string(values.defectNote)}
                      onChange={(value) =>
                        setValues((current) => ({
                          ...current,
                          defectNote: value,
                        }))
                      }
                    />
                    <Field
                      label="Mitgegebenes Zubehör (Freitext)"
                      value={string(values.accessories)}
                      onChange={(value) =>
                        setValues((current) => ({
                          ...current,
                          accessories: value,
                        }))
                      }
                    />
                    <EuroField
                      label="Zusatzkosten je Stück"
                      value={number(values.extraCostCents)}
                      onChange={(value) =>
                        setValues((current) => ({
                          ...current,
                          extraCostCents: value,
                        }))
                      }
                    />
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          document
                            .getElementById(
                              `product-components-${string(product.id)}`,
                            )
                            ?.scrollIntoView({ behavior: 'smooth' })
                        }
                      >
                        <Plus className="size-3.5" /> Bauteil zuordnen
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          document
                            .getElementById(
                              `product-accessories-${string(product.id)}`,
                            )
                            ?.scrollIntoView({ behavior: 'smooth' })
                        }
                      >
                        <Plus className="size-3.5" /> Zubehörartikel zuordnen
                      </Button>
                    </div>
                  </div>
                </details>
                <div className="rounded-xl border bg-white p-3 text-xs sm:col-span-2 lg:col-span-3">
                  {(() => {
                    const cost = variantCostBreakdown(
                      product,
                      values,
                      products,
                      components,
                    );
                    return (
                      <>
                        <div className="font-medium">
                          Automatische Kostenberechnung
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-4">
                          <span>
                            Netto {decimalInputValue(cost.netGrams)} g ·{' '}
                            {cents(cost.filamentCents)}
                          </span>
                          <span>
                            Ausschuss {decimalInputValue(cost.wasteGrams)} g ·{' '}
                            {cents(cost.wasteCents)}
                          </span>
                          <span>Maschine {cents(cost.machineCents)}</span>
                          <span>Strom {cents(cost.electricityCents)}</span>
                          <span>Zusatz {cents(cost.extraCents)}</span>
                          <span>Bauteile {cents(cost.componentsCents)}</span>
                          <strong>Herstellung {cents(cost.totalCents)}</strong>
                          <strong>
                            Marge{' '}
                            {cost.marginPercent == null
                              ? 'unklar'
                              : `${cents(cost.marginCents)} · ${cost.marginPercent.toFixed(1)} %`}
                          </strong>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            ) : (
              <>
                <fieldset className="grid gap-2 rounded-xl border bg-white p-3 sm:col-span-2">
                  <legend className="px-1 text-xs font-medium text-muted-foreground">
                    Passende Varianten
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    Wähle alle Varianten, bei denen dieses Bauteil verwendet
                    wird.
                  </p>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm">
                    <input
                      type="checkbox"
                      checked={
                        !Array.isArray(values.productVariantIds) ||
                        values.productVariantIds.length === 0
                      }
                      onChange={() =>
                        setValues((current) => ({
                          ...current,
                          productVariantIds: [],
                          productVariantId: null,
                        }))
                      }
                    />
                    Für alle Varianten
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {variants.map((variant, index) => {
                      const variantId = string(variant.id);
                      const selected = Array.isArray(values.productVariantIds)
                        ? values.productVariantIds.map((item) => string(item))
                        : [];
                      const checked = selected.includes(variantId);
                      return (
                        <label
                          key={variantId}
                          className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setValues((current) => {
                                const currentIds = Array.isArray(
                                  current.productVariantIds,
                                )
                                  ? current.productVariantIds.map((item) =>
                                      string(item),
                                    )
                                  : [];
                                const nextIds = event.target.checked
                                  ? Array.from(
                                      new Set([...currentIds, variantId]),
                                    )
                                  : currentIds.filter(
                                      (item) => item !== variantId,
                                    );
                                return {
                                  ...current,
                                  productVariantIds: nextIds,
                                  productVariantId:
                                    nextIds.length === 1
                                      ? Number(nextIds[0])
                                      : null,
                                };
                              })
                            }
                          />
                          {string(
                            variant.name || variant.appearance,
                            `Variante ${index + 1}`,
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Farbe / Material
                  <select
                    className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                    value={string(values.materialId)}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        materialId: event.target.value
                          ? Number(event.target.value)
                          : null,
                      }))
                    }
                  >
                    <option value="">Material wählen</option>
                    {materials.map((item) => (
                      <option key={string(item.id)} value={string(item.id)}>
                        {materialChoiceOption(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Bauteil"
                  value={string(values.part)}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, part: value }))
                  }
                />
                <DecimalField
                  label="Nettogewicht in g"
                  value={number(values.grams)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      grams: value,
                    }))
                  }
                />
                <DecimalField
                  label="Ausschuss in g"
                  value={number(values.wasteGrams)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      wasteGrams: value,
                    }))
                  }
                />
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Drucker für dieses Teil
                  <select
                    className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                    value={string(values.printer)}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        printer: event.target.value || null,
                      }))
                    }
                  >
                    <option value="">Drucker der Variante</option>
                    {PRINTERS.map((printer) => (
                      <option key={printer}>{printer}</option>
                    ))}
                  </select>
                </label>
                <DurationField
                  value={number(values.printMinutes)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      printMinutes: value,
                    }))
                  }
                />
              </>
            )}
          </div>
          <p className="mt-3 rounded-xl border border-[var(--fp-primary)]/20 bg-white/70 p-3 text-sm">
            Auch diese Angaben werden unten mit „Alle Änderungen speichern“
            übernommen.
          </p>
        </div>
      ) : null}
    </section>
  );
});

function ProductEditorSidebar({
  product,
  products,
  components,
  saving,
  onSave,
}: {
  product: Row;
  products: Row[];
  components: Row[];
  saving: boolean;
  onSave: () => void;
}) {
  const variants = rows(product.variants);
  const isDigital = isDigitalInventoryProduct(product);
  const costs = variants.map((variant) =>
    variantCostBreakdown(product, variant, products, components),
  );
  const average = (key: keyof (typeof costs)[number]) =>
    costs.length
      ? Math.round(
          costs.reduce((sum, item) => sum + number(item[key]), 0) /
            costs.length,
        )
      : 0;
  const marginValues = costs
    .map((item) => item.marginPercent)
    .filter((value): value is number => value != null);
  const margin = isDigital
    ? 100
    : marginValues.length === costs.length && costs.length
      ? marginValues.reduce((sum, value) => sum + value, 0) /
        marginValues.length
      : null;
  const stock = variants.reduce(
    (sum, variant) => sum + number(variant.quantity),
    0,
  );
  const priceLabel = (key: string, fallbackKey = 'priceCents') => {
    const priceValues = variants
      .map((variant) => number(variant[key] ?? variant[fallbackKey]))
      .filter((value) => value > 0);
    return priceValues.length
      ? Math.min(...priceValues) === Math.max(...priceValues)
        ? cents(priceValues[0])
        : `${cents(Math.min(...priceValues))} – ${cents(Math.max(...priceValues))}`
      : 'offen';
  };
  const productionIssues = variants.flatMap((variant, index) =>
    variantProductionIssues(product, variant).map(
      (issue) => `${string(variant.name, `Variante ${index + 1}`)}: ${issue}`,
    ),
  );
  const items: Array<[string, number]> = [
    ['Filament', average('filamentCents') + average('wasteCents')],
    ['Maschine', average('machineCents')],
    ['Strom', average('electricityCents')],
    ['Zusatzkosten', average('extraCents')],
    ['Bauteile', average('componentsCents')],
  ];
  return (
    <aside className="sm:col-span-2 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:row-span-[20]">
      <div className="space-y-4 lg:sticky lg:top-0">
        <section className="rounded-[24px] bg-[#e9e1d5] p-4">
          <h3 className="font-heading text-xl">Zusammenfassung</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-white/70 p-3">
              <div className="text-xs text-muted-foreground">Varianten</div>
              <strong className="mt-1 block">{variants.length}</strong>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <div className="text-xs text-muted-foreground">Bestand</div>
              <strong className="mt-1 block">
                {isDigital ? 'Unbegrenzt' : `${stock} fertig`}
              </strong>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <div className="text-xs text-muted-foreground">Standard</div>
              <strong className="mt-1 block">{priceLabel('priceCents')}</strong>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <div className="text-xs text-muted-foreground">Markt</div>
              <strong className="mt-1 block">
                {priceLabel('marketPriceCents')}
              </strong>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <div className="text-xs text-muted-foreground">Vinted</div>
              <strong className="mt-1 block">
                {priceLabel('vintedPriceCents')}
              </strong>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <div className="text-xs text-muted-foreground">Etsy</div>
              <strong className="mt-1 block">
                {priceLabel('etsyPriceCents')}
              </strong>
            </div>
          </div>
        </section>
        <section className="rounded-[24px] bg-[#e9e1d5] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-heading text-xl">Herstellungskosten</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Durchschnitt je Variante
              </p>
            </div>
            <strong className={margin == null ? 'text-[#8b5c27]' : ''}>
              {margin == null ? 'Marge offen' : `${margin.toFixed(1)} %`}
            </strong>
          </div>
          <dl className="mt-4 rounded-2xl bg-white/75 p-4 text-sm">
            {items.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 py-1.5">
                <dt>{label}</dt>
                <dd>{cents(value)}</dd>
              </div>
            ))}
            <div className="mt-2 flex justify-between gap-3 border-t pt-3 font-semibold">
              <dt>Je Stück</dt>
              <dd>{cents(average('totalCents'))}</dd>
            </div>
          </dl>
          {productionIssues.length ? (
            <div className="mt-3 rounded-2xl border border-[#d6a15e] bg-[#fff8e8] p-3 text-sm text-[#744719]">
              <strong>Marge offen</strong>
              <ul className="mt-2 space-y-1 text-xs">
                {productionIssues.map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-xs font-medium text-[var(--fp-primary)]">
              ✓ Artikel vollständig kalkuliert
            </p>
          )}
        </section>
        <Button className="h-12 w-full" onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}{' '}
          Alle Änderungen speichern
        </Button>
      </div>
    </aside>
  );
}

function RelationsSummary({
  product,
  data,
  onChanged,
}: {
  product: Row;
  data: AreaData;
  onChanged: () => void | Promise<void>;
}) {
  const isDigital = isDigitalInventoryProduct(product);
  const allProducts = rows(data.products);
  const variants = rows(product.variants);
  const allComponents = rows(data.components);
  const components = allComponents.filter(
    (item) => string(item.parentProductId) === string(product.id),
  );
  const usedBy = allComponents.filter(
    (item) => string(item.componentProductId) === string(product.id),
  );
  const accessories = rows(data.accessories).filter(
    (item) => string(item.productId) === string(product.id),
  );
  const selectableProducts = allProducts.filter(
    (item) =>
      string(item.id) !== string(product.id) && !string(item.archivedAt),
  );
  const [componentDraft, setComponentDraft] = useState<Row>({ quantity: 1 });
  const [accessoryDraft, setAccessoryDraft] = useState<Row>({});
  const [relationMessage, setRelationMessage] = useState('');
  const [relationSaving, setRelationSaving] = useState(false);
  const [componentFormOpen, setComponentFormOpen] = useState(true);
  const selectedComponent = selectableProducts.find(
    (item) => string(item.id) === string(componentDraft.componentProductId),
  );
  const productName = (id: unknown) =>
    string(
      allProducts.find((item) => string(item.id) === string(id))?.name,
      '#' + string(id),
    );
  const variantName = (id: unknown) =>
    string(variants.find((item) => string(item.id) === string(id))?.name);

  async function saveRelation(
    entity: 'product_components' | 'product_accessories',
    values: Row,
  ) {
    setRelationSaving(true);
    setRelationMessage('');
    try {
      const response = await inventoryRequest('/api/inventory/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, values }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Zuordnung nicht gespeichert.');
      if (entity === 'product_components') setComponentDraft({ quantity: 1 });
      else setAccessoryDraft({});
      setRelationMessage('Zuordnung gespeichert.');
      await onChanged();
    } catch (reason) {
      setRelationMessage(
        reason instanceof Error
          ? reason.message
          : 'Zuordnung nicht gespeichert.',
      );
    } finally {
      setRelationSaving(false);
    }
  }

  async function removeRelation(
    entity: 'product_components' | 'product_accessories',
    id: unknown,
    label: string,
  ) {
    if (!window.confirm(`„${label}“ wirklich aus diesem Artikel entfernen?`))
      return;
    setRelationSaving(true);
    setRelationMessage('');
    try {
      const response = await inventoryRequest('/api/inventory/workspace', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, id }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Zuordnung nicht entfernt.');
      setRelationMessage('Zuordnung entfernt.');
      await onChanged();
    } catch (reason) {
      setRelationMessage(
        reason instanceof Error ? reason.message : 'Zuordnung nicht entfernt.',
      );
    } finally {
      setRelationSaving(false);
    }
  }
  return (
    <div className="sm:col-span-2 grid gap-3 lg:grid-cols-2">
      {!isDigital ? (
        <details className="group rounded-2xl border bg-white/55 lg:col-span-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
            <span>
              <span className="block font-medium">Bestand</span>
              <span className="text-xs text-muted-foreground">
                Was fertig ist, was daneben liegt und was daraus wird.
              </span>
            </span>
            <span className="flex items-center gap-3 text-sm">
              {variants.reduce(
                (sum, variant) => sum + number(variant.quantity),
                0,
              )}{' '}
              fertig
              <span className="transition group-open:rotate-180">⌄</span>
            </span>
          </summary>
          <div className="space-y-2 border-t p-4">
            {variants.map((variant, index) => (
              <div
                key={string(variant.id, String(index))}
                className="flex justify-between rounded-xl border bg-white p-3 text-sm"
              >
                <span>
                  {string(
                    variant.name || variant.appearance || variant.size,
                    `Variante ${index + 1}`,
                  )}
                </span>
                <strong>{number(variant.quantity)} Stück</strong>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <section
        id={`product-components-${string(product.id)}`}
        className="scroll-mt-6 rounded-2xl border bg-white/55 p-4"
      >
        <h3 className="font-medium">Bauteile erfassen</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Lagerartikel, die fest in diesem Artikel oder einer Variante verbaut
          werden.
        </p>
        <div className="mt-3 space-y-2">
          {components.map((item) => (
            <div
              key={string(item.id)}
              className="flex items-start justify-between gap-3 rounded-xl border p-3 text-sm"
            >
              <div>
                <div className="font-medium">
                  {number(item.quantity, 1)} ×{' '}
                  {productName(item.componentProductId)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[
                    string(item.slot),
                    string(item.inventoryTrackingMode),
                    string(item.colorRequirement),
                    variantName(item.parentVariantId),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-red-700"
                disabled={relationSaving}
                aria-label={`${productName(item.componentProductId)} entfernen`}
                onClick={() =>
                  void removeRelation(
                    'product_components',
                    item.id,
                    productName(item.componentProductId),
                  )
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          {!components.length ? (
            <p className="text-sm text-muted-foreground">
              Keine Bauteile zugeordnet.
            </p>
          ) : null}
          <details
            open={componentFormOpen}
            onToggle={(event) => setComponentFormOpen(event.currentTarget.open)}
            className="group rounded-xl border border-dashed bg-white/60"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium">
              <span>+ Lagerartikel als Bauteil</span>
              <span className="transition group-open:rotate-180">⌄</span>
            </summary>
            <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                Lagerartikel
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm"
                  value={string(componentDraft.componentProductId)}
                  onChange={(event) =>
                    setComponentDraft((current) => ({
                      ...current,
                      componentProductId: event.target.value
                        ? Number(event.target.value)
                        : null,
                      componentVariantId: null,
                    }))
                  }
                >
                  <option value="">Artikel wählen</option>
                  {selectableProducts.map((item) => (
                    <option key={string(item.id)} value={string(item.id)}>
                      {string(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              {rows(selectedComponent?.variants).length ? (
                <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                  Ausführung des Lagerartikels
                  <select
                    className="h-9 rounded-lg border bg-white px-3 text-sm"
                    value={string(componentDraft.componentVariantId)}
                    onChange={(event) =>
                      setComponentDraft((current) => ({
                        ...current,
                        componentVariantId: event.target.value
                          ? Number(event.target.value)
                          : null,
                      }))
                    }
                  >
                    <option value="">Standard / günstigste Ausführung</option>
                    {rows(selectedComponent?.variants).map((variant, index) => (
                      <option
                        key={string(variant.id)}
                        value={string(variant.id)}
                      >
                        {string(variant.name, `Variante ${index + 1}`)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Field
                label="Bauteil / Position"
                value={string(componentDraft.slot)}
                onChange={(value) =>
                  setComponentDraft((current) => ({
                    ...current,
                    slot: value,
                  }))
                }
              />
              <Field
                label="Menge"
                type="number"
                value={string(componentDraft.quantity, '1')}
                onChange={(value) =>
                  setComponentDraft((current) => ({
                    ...current,
                    quantity: Math.max(1, Number(value) || 1),
                  }))
                }
              />
              <label className="grid gap-1.5 text-sm font-medium">
                Gilt für
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm"
                  value={string(componentDraft.parentVariantId)}
                  onChange={(event) =>
                    setComponentDraft((current) => ({
                      ...current,
                      parentVariantId: event.target.value
                        ? Number(event.target.value)
                        : null,
                    }))
                  }
                >
                  <option value="">Alle Varianten</option>
                  {variants.map((variant, index) => (
                    <option key={string(variant.id)} value={string(variant.id)}>
                      {string(variant.name, `Variante ${index + 1}`)}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Farbvorgabe (optional)"
                value={string(componentDraft.colorRequirement)}
                onChange={(value) =>
                  setComponentDraft((current) => ({
                    ...current,
                    colorRequirement: value,
                  }))
                }
              />
              <Button
                type="button"
                className="sm:col-span-2"
                disabled={relationSaving || !componentDraft.componentProductId}
                onClick={() =>
                  void saveRelation('product_components', {
                    ...componentDraft,
                    parentProductId: number(product.id),
                  })
                }
              >
                <Plus className="size-4" /> Bauteil zuordnen
              </Button>
            </div>
          </details>
        </div>
      </section>
      <section
        id={`product-accessories-${string(product.id)}`}
        className="scroll-mt-6 rounded-2xl border bg-white/55 p-4"
      >
        <h3 className="font-medium">Zubehör erfassen</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Auswählbare Artikel, die mitgegeben oder dieser Variante zugeordnet
          werden.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {accessories.map((item) => (
            <span
              key={string(item.id)}
              className="inline-flex items-center gap-1 rounded-full border bg-white pl-3 text-xs"
            >
              {productName(item.accessoryProductId)}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 rounded-full text-red-700"
                disabled={relationSaving}
                aria-label={`${productName(item.accessoryProductId)} entfernen`}
                onClick={() =>
                  void removeRelation(
                    'product_accessories',
                    item.id,
                    productName(item.accessoryProductId),
                  )
                }
              >
                <X className="size-3" />
              </Button>
            </span>
          ))}
          {!accessories.length ? (
            <p className="text-sm text-muted-foreground">
              Kein Zubehör zugeordnet.
            </p>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2">
          <select
            aria-label="Zubehörartikel"
            className="h-9 rounded-lg border bg-white px-3 text-sm"
            value={string(accessoryDraft.accessoryProductId)}
            onChange={(event) =>
              setAccessoryDraft((current) => ({
                ...current,
                accessoryProductId: event.target.value
                  ? Number(event.target.value)
                  : null,
              }))
            }
          >
            <option value="">Zubehörartikel wählen</option>
            {selectableProducts.map((item) => (
              <option key={string(item.id)} value={string(item.id)}>
                {string(item.name)}
              </option>
            ))}
          </select>
          <select
            aria-label="Zubehör gilt für"
            className="h-9 rounded-lg border bg-white px-3 text-sm"
            value={string(accessoryDraft.productVariantId)}
            onChange={(event) =>
              setAccessoryDraft((current) => ({
                ...current,
                productVariantId: event.target.value
                  ? Number(event.target.value)
                  : null,
              }))
            }
          >
            <option value="">Für alle Varianten</option>
            {variants.map((variant, index) => (
              <option key={string(variant.id)} value={string(variant.id)}>
                Nur {string(variant.name, `Variante ${index + 1}`)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            disabled={relationSaving || !accessoryDraft.accessoryProductId}
            onClick={() =>
              void saveRelation('product_accessories', {
                ...accessoryDraft,
                productId: number(product.id),
              })
            }
          >
            <Plus className="size-4" /> Zubehör zuordnen
          </Button>
        </div>
      </section>
      {relationMessage ? (
        <p className="text-sm text-muted-foreground lg:col-span-2">
          {relationMessage}
        </p>
      ) : null}
      <details className="group rounded-2xl border bg-white/55 lg:col-span-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <span>
            <span className="block font-medium">Wo verwendet</span>
            <span className="text-xs text-muted-foreground">
              Artikel, die diesen hier einbauen.
            </span>
          </span>
          <span className="flex items-center gap-3 text-sm">
            {usedBy.length ? `${usedBy.length} Zuordnungen` : 'nirgends'}
            <span className="transition group-open:rotate-180">⌄</span>
          </span>
        </summary>
        <div className="space-y-2 border-t p-4">
          {usedBy.map((item, index) => (
            <div
              key={string(item.id, String(index))}
              className="rounded-xl border bg-white p-3 text-sm"
            >
              {productName(item.parentProductId)}
            </div>
          ))}
          {!usedBy.length ? (
            <p className="text-sm text-muted-foreground">
              Dieser Artikel wird derzeit in keinem anderen Artikel verbaut.
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function formatBytes(value: unknown) {
  const bytes = number(value);
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function MaterialImageManager({
  material,
  onChanged,
}: {
  material: Row;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const images = rows(material.studioImages);

  async function upload(file: File) {
    setUploading(true);
    setMessage('');
    const body = new FormData();
    body.set('file', file);
    body.set('materialId', string(material.id));
    const response = await inventoryRequest('/api/inventory/material-images', {
      method: 'POST',
      body,
    });
    const result = (await response.json()) as { error?: string };
    setUploading(false);
    if (!response.ok) {
      setMessage(result.error || 'Bild konnte nicht gespeichert werden.');
      return;
    }
    setMessage('Materialbild gespeichert.');
    onChanged();
  }

  async function remove(image: Row) {
    if (!window.confirm(`„${string(image.filename)}“ wirklich löschen?`))
      return;
    const response = await inventoryRequest('/api/inventory/material-images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: image.id }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok)
      setMessage(result.error || 'Bild konnte nicht gelöscht werden.');
    else {
      setMessage('Materialbild gelöscht.');
      onChanged();
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border bg-white/55 p-4 sm:col-span-2">
      <div>
        <h3 className="font-medium">Materialbilder</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Das zuerst hinzugefügte Bild wird in der Materialübersicht angezeigt.
        </p>
      </div>
      <label className="flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-white p-3">
        {uploading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <ImagePlus className="size-5" />
        )}
        <span className="text-sm">
          <span className="block font-medium">Bild hinzufügen</span>
          <span className="text-xs text-muted-foreground">
            JPEG, PNG oder WebP · maximal 20 MB
          </span>
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
      </label>
      {images.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <article
              key={string(image.id)}
              className="overflow-hidden rounded-xl border bg-white"
            >
              <div className="relative aspect-square bg-[#ebe5db]">
                <Image
                  src={string(image.url)}
                  alt={string(image.filename, 'Materialbild')}
                  fill
                  unoptimized
                  sizes="160px"
                  className="object-cover"
                />
                {index === 0 ? (
                  <Badge className="absolute top-2 left-2">Vorschaubild</Badge>
                ) : null}
              </div>
              <div className="p-2">
                <p className="truncate text-xs" title={string(image.filename)}>
                  {string(image.filename)}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {formatBytes(image.sizeBytes)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-red-700"
                    aria-label={string(image.filename) + ' löschen'}
                    onClick={() => void remove(image)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {message ? (
        <p className="text-xs text-muted-foreground">{message}</p>
      ) : null}
    </section>
  );
}

function ProductAssetManager({
  product,
  onChanged,
}: {
  product: Row;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState<'image' | 'print' | ''>('');
  const [message, setMessage] = useState('');
  const assets = rows(product.studioAssets);
  const images = assets.filter((asset) => string(asset.assetKind) === 'image');
  const printFiles = assets.filter(
    (asset) => string(asset.assetKind) === 'print',
  );
  const existingImage = string(product.imageUri);
  const hasUploadedPrimary = images.some((asset) => boolean(asset.isPrimary));
  const [savingPrimary, setSavingPrimary] = useState(false);
  const [pendingDelete, setPendingDelete] = useState('');

  async function upload(files: File[], kind: 'image' | 'print') {
    if (!files.length) return;
    setUploading(kind);
    setMessage('');
    try {
      let uploaded = 0;
      for (const file of files) {
        const body = new FormData();
        body.set('file', file);
        body.set('productId', string(product.id));
        body.set('kind', kind);
        if (kind === 'image') {
          body.set(
            'isPrimary',
            String(!existingImage && !hasUploadedPrimary && uploaded === 0),
          );
        }
        const response = await inventoryRequest(
          '/api/inventory/product-assets',
          {
            method: 'POST',
            body,
          },
        );
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            result.error || `„${file.name}“ konnte nicht hochgeladen werden.`,
          );
        uploaded += 1;
      }
      setMessage(
        kind === 'image'
          ? `${uploaded} ${uploaded === 1 ? 'Bild wurde' : 'Bilder wurden'} zur Galerie hinzugefügt.`
          : 'Druckdatei gespeichert.',
      );
      onChanged();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Die Verbindung wurde beim Upload unterbrochen. Bitte erneut versuchen.',
      );
    } finally {
      setUploading('');
    }
  }

  async function setPrimary(id: string) {
    setSavingPrimary(true);
    setMessage('');
    try {
      const response = await inventoryRequest('/api/inventory/product-assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isPrimary: true }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Hauptbild nicht gespeichert.');
      setMessage('Hauptbild aktualisiert.');
      onChanged();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Hauptbild nicht gespeichert.',
      );
    } finally {
      setSavingPrimary(false);
    }
  }

  async function useExistingImage() {
    setSavingPrimary(true);
    setMessage('');
    try {
      const response = await inventoryRequest('/api/inventory/product-assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          useExistingImage: true,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Hauptbild nicht gespeichert.');
      setMessage('Vorhandenes Bild ist wieder das Hauptbild.');
      onChanged();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Hauptbild nicht gespeichert.',
      );
    } finally {
      setSavingPrimary(false);
    }
  }

  async function remove(asset: Row) {
    setPendingDelete('');
    setMessage('');
    try {
      const response = await inventoryRequest('/api/inventory/product-assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: asset.id }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Datei nicht gelöscht.');
      setMessage('Datei gelöscht.');
      onChanged();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : 'Datei nicht gelöscht.',
      );
    }
  }

  async function replaceExistingImage(file: File) {
    setUploading('image');
    setMessage('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('productId', string(product.id));
      const response = await inventoryRequest('/api/inventory/image', {
        method: 'POST',
        body,
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Artikelbild nicht ersetzt.');
      setMessage('Artikelbild ersetzt.');
      onChanged();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : 'Artikelbild nicht ersetzt.',
      );
    } finally {
      setUploading('');
    }
  }

  async function removeExistingImage() {
    setPendingDelete('');
    setMessage('');
    try {
      const response = await inventoryRequest('/api/inventory/image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Artikelbild nicht gelöscht.');
      setMessage('Artikelbild gelöscht.');
      onChanged();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Artikelbild nicht gelöscht.',
      );
    }
  }

  async function replaceAsset(asset: Row, file: File) {
    setUploading('image');
    setMessage('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('productId', string(product.id));
      body.set('kind', 'image');
      body.set('isPrimary', String(boolean(asset.isPrimary)));
      const uploadResponse = await inventoryRequest(
        '/api/inventory/product-assets',
        {
          method: 'POST',
          body,
        },
      );
      const uploadResult = (await uploadResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!uploadResponse.ok)
        throw new Error(uploadResult.error || 'Bild nicht ersetzt.');
      const deleteResponse = await inventoryRequest(
        '/api/inventory/product-assets',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: asset.id }),
        },
      );
      if (!deleteResponse.ok)
        throw new Error(
          'Das neue Bild wurde gespeichert, das alte aber nicht entfernt.',
        );
      setMessage('Galeriebild ersetzt.');
      onChanged();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : 'Bild nicht ersetzt.',
      );
    } finally {
      setUploading('');
    }
  }

  return (
    <details className="group rounded-2xl border bg-white/55 sm:col-span-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span>
          <span className="block font-medium">Bilder &amp; Druckdateien</span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {images.length} Bilder · {printFiles.length} interne Druckdateien
          </span>
        </span>
        <span className="transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="space-y-4 border-t p-4">
        <p className="text-xs text-muted-foreground">
          Galeriebilder, aktives Titelbild und geschützte STL-, 3MF-, OBJ- oder
          ZIP-Dateien werden hier gemeinsam verwaltet.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-white p-3">
            {uploading === 'image' ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ImagePlus className="size-5" />
            )}
            <span className="text-sm">
              <span className="block font-medium">
                Galeriebilder hinzufügen
              </span>
              <span className="text-xs text-muted-foreground">
                Mehrfachauswahl möglich · ändert das Hauptbild nicht
              </span>
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={Boolean(uploading)}
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                if (files.length) void upload(files, 'image');
                event.target.value = '';
              }}
            />
          </label>
          <label className="flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-white p-3">
            {uploading === 'print' ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <FileArchive className="size-5" />
            )}
            <span className="text-sm">
              <span className="block font-medium">Druckdatei hinzufügen</span>
              <span className="text-xs text-muted-foreground">
                STL, 3MF, OBJ, GCODE, BGCODE, STEP, ZIP · max. 100 MB
              </span>
            </span>
            <input
              type="file"
              accept=".stl,.3mf,.obj,.gcode,.gco,.bgcode,.step,.stp,.zip"
              className="sr-only"
              disabled={Boolean(uploading)}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload([file], 'print');
                event.target.value = '';
              }}
            />
          </label>
        </div>
        {images.length || existingImage ? (
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase">
              Artikelbilder
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {existingImage ? (
                <article className="overflow-hidden rounded-xl border bg-white">
                  <label className="group/image relative block aspect-square cursor-pointer bg-[#ebe5db]">
                    <Image
                      src={inventoryImageUrl(existingImage)}
                      alt="Vorhandenes Artikelbild"
                      fill
                      unoptimized
                      sizes="160px"
                      className="object-cover"
                    />
                    {!hasUploadedPrimary ? (
                      <Badge className="absolute top-2 left-2">Hauptbild</Badge>
                    ) : null}
                    <span className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-lg bg-black/65 px-2 py-1.5 text-xs text-white opacity-0 transition group-hover/image:opacity-100">
                      <Pencil className="size-3" /> Bild ersetzen
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={Boolean(uploading)}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void replaceExistingImage(file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  <div className="p-2">
                    <p className="truncate text-xs">Vorhandenes Artikelbild</p>
                    <div className="mt-2 flex gap-1">
                      {hasUploadedPrimary ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 flex-1 px-2 text-xs"
                          disabled={savingPrimary}
                          onClick={() => void useExistingImage()}
                        >
                          <Star className="size-3" /> Als Hauptbild
                        </Button>
                      ) : null}
                      <Button
                        size={pendingDelete === 'existing' ? 'sm' : 'icon'}
                        variant={
                          pendingDelete === 'existing' ? 'destructive' : 'ghost'
                        }
                        className={
                          pendingDelete === 'existing'
                            ? 'h-8 flex-1 px-2 text-xs'
                            : 'size-8 text-red-700'
                        }
                        aria-label={
                          pendingDelete === 'existing'
                            ? 'Löschen bestätigen'
                            : 'Vorhandenes Artikelbild löschen'
                        }
                        onClick={() => {
                          if (pendingDelete === 'existing') {
                            void removeExistingImage();
                            return;
                          }
                          setPendingDelete('existing');
                          setMessage(
                            'Zum endgültigen Löschen bitte noch einmal bestätigen.',
                          );
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        {pendingDelete === 'existing'
                          ? ' Löschen bestätigen'
                          : null}
                      </Button>
                      {pendingDelete === 'existing' ? (
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-8"
                          aria-label="Löschen abbrechen"
                          onClick={() => {
                            setPendingDelete('');
                            setMessage('');
                          }}
                        >
                          <X className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ) : null}
              {images.map((asset) => {
                const deleteKey = `asset:${string(asset.id)}`;
                const awaitsDeleteConfirmation = pendingDelete === deleteKey;
                return (
                  <article
                    key={string(asset.id)}
                    className="overflow-hidden rounded-xl border bg-white"
                  >
                    <label className="group/image relative block aspect-square cursor-pointer bg-[#ebe5db]">
                      <Image
                        src={string(asset.url)}
                        alt={string(asset.filename, 'Artikelbild')}
                        fill
                        unoptimized
                        sizes="160px"
                        className="object-cover"
                      />
                      {boolean(asset.isPrimary) ? (
                        <Badge className="absolute top-2 left-2">
                          Hauptbild
                        </Badge>
                      ) : null}
                      <span className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-lg bg-black/65 px-2 py-1.5 text-xs text-white opacity-0 transition group-hover/image:opacity-100">
                        <Pencil className="size-3" /> Bild ersetzen
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={Boolean(uploading)}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void replaceAsset(asset, file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <div className="p-2">
                      <p
                        className="truncate text-xs"
                        title={string(asset.filename)}
                      >
                        {string(asset.filename)}
                      </p>
                      <div className="mt-2 flex gap-1">
                        {!boolean(asset.isPrimary) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 flex-1 px-2 text-xs"
                            disabled={savingPrimary}
                            onClick={() => void setPrimary(string(asset.id))}
                          >
                            <Star className="size-3" /> Als Hauptbild
                          </Button>
                        ) : null}
                        <Button
                          size={awaitsDeleteConfirmation ? 'sm' : 'icon'}
                          variant={
                            awaitsDeleteConfirmation ? 'destructive' : 'ghost'
                          }
                          className={
                            awaitsDeleteConfirmation
                              ? 'h-8 flex-1 px-2 text-xs'
                              : 'size-8 text-red-700'
                          }
                          aria-label={
                            awaitsDeleteConfirmation
                              ? `${string(asset.filename)} löschen bestätigen`
                              : `${string(asset.filename)} löschen`
                          }
                          onClick={() => {
                            if (awaitsDeleteConfirmation) {
                              void remove(asset);
                              return;
                            }
                            setPendingDelete(deleteKey);
                            setMessage(
                              'Zum endgültigen Löschen bitte noch einmal bestätigen.',
                            );
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          {awaitsDeleteConfirmation
                            ? ' Löschen bestätigen'
                            : null}
                        </Button>
                        {awaitsDeleteConfirmation ? (
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-8"
                            aria-label="Löschen abbrechen"
                            onClick={() => {
                              setPendingDelete('');
                              setMessage('');
                            }}
                          >
                            <X className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
        {printFiles.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase">
              Interne Druckdateien
            </p>
            <div className="space-y-2">
              {printFiles.map((asset) => (
                <article
                  key={string(asset.id)}
                  className="flex items-center gap-3 rounded-xl border bg-white p-3"
                >
                  <FileArchive className="size-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {string(asset.filename)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(asset.sizeBytes)} · geschützt
                    </p>
                  </div>
                  <a
                    href={string(asset.url)}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border bg-white hover:bg-muted"
                    aria-label={string(asset.filename) + ' herunterladen'}
                  >
                    <Download className="size-4" />
                  </a>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-700"
                    aria-label={string(asset.filename) + ' löschen'}
                    onClick={() => void remove(asset)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </article>
              ))}
            </div>
          </div>
        ) : null}
        {message ? (
          <p className="text-xs text-muted-foreground">{message}</p>
        ) : null}
      </div>
    </details>
  );
}

function ImageUpload({
  productId,
  variantId,
  label = 'Produktbild ersetzen',
  onUploaded,
}: {
  productId: string;
  variantId?: string;
  label?: string;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  async function upload(file: File) {
    setUploading(true);
    setMessage('');
    const body = new FormData();
    body.append('file', file);
    body.append('productId', productId);
    if (variantId) body.append('variantId', variantId);
    const response = await inventoryRequest('/api/inventory/image', {
      method: 'POST',
      body,
    });
    const result = (await response.json()) as { error?: string };
    setUploading(false);
    if (!response.ok) setMessage(result.error || 'Upload fehlgeschlagen.');
    else {
      setMessage('Bild gespeichert.');
      onUploaded();
    }
  }
  return (
    <label className="sm:col-span-2 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed bg-white/55 p-4">
      <ImagePlus className="size-5" />
      <span className="flex-1 text-sm">
        <span className="block font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          JPEG, PNG oder WebP · maximal 12 MB
        </span>
      </span>
      {uploading ? <Loader2 className="size-4 animate-spin" /> : null}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {message ? <span className="text-xs">{message}</span> : null}
    </label>
  );
}

function MarketDetail({
  market,
  data,
  products,
  onClose,
  onChanged,
}: {
  market: Row | null;
  data: AreaData;
  products: Row[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [stockProductId, setStockProductId] = useState('');
  const [stockVariantId, setStockVariantId] = useState('');
  const [stockQuantity, setStockQuantity] = useState('1');
  const [actionMessage, setActionMessage] = useState('');
  if (!market) return null;
  const currentMarket = market;
  const articles = rows(data.articles).filter(
    (item) => string(item.marketId) === string(currentMarket.id),
  );
  const sales = rows(data.sales).filter(
    (item) =>
      !boolean(item.isCancelled) &&
      string(item.marketId) === string(currentMarket.id),
  );
  const expenses = rows(data.expenses).filter(
    (item) => string(item.marketId) === string(currentMarket.id),
  );
  const demands = rows(data.demands).filter(
    (item) => string(item.marketId) === string(currentMarket.id),
  );
  const revenue = sales.reduce((sum, item) => sum + saleTotal(item), 0);
  const costs = expenses.reduce(
    (sum, item) => sum + number(item.amountCents),
    0,
  );
  const stockProduct = products.find(
    (item) => string(item.id) === stockProductId,
  );
  const stockCount = articles
    .flatMap((article) => rows(article.variants))
    .reduce((sum, variant) => sum + number(variant.quantityInStock), 0);

  async function rpc(name: string, args: Row) {
    setActionMessage('');
    const response = await inventoryRequest('/api/inventory/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rpc: name, args }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setActionMessage(result.error || 'Buchung fehlgeschlagen.');
      return false;
    }
    setActionMessage('Buchung gespeichert.');
    onChanged();
    return true;
  }

  async function bookStock() {
    if (!stockProductId || Number(stockQuantity) <= 0) return;
    await rpc('markt_buchen', {
      p_operation_id: crypto.randomUUID(),
      p_market_id: number(currentMarket.id),
      p_product_id: Number(stockProductId),
      p_menge: Math.trunc(Number(stockQuantity)),
      p_variant_id: stockVariantId ? Number(stockVariantId) : null,
    });
  }

  function exportCsv() {
    const lines = [
      ['Artikel', 'Variante', 'Bestand', 'Preis'],
      ...articles.flatMap((article) =>
        rows(article.variants).map((variant) => [
          string(article.name),
          string(variant.color, 'Standard'),
          String(number(variant.quantityInStock)),
          (number(variant.salePriceCents) / 100).toFixed(2),
        ]),
      ),
    ];
    const csv = lines
      .map((line) =>
        line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(';'),
      )
      .join('\n');
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${string(currentMarket.name, 'markt')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-[#f8f4ed] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-3xl">
            {string(currentMarket.name)}
          </DialogTitle>
          <DialogDescription>
            {string(currentMarket.location)} · {date(currentMarket.date)} –{' '}
            {date(currentMarket.endDate || currentMarket.date)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <CircleDollarSign className="size-4" /> CSV exportieren
          </Button>
          <Badge variant="outline">{string(currentMarket.status)}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat value={stockCount} label="Stück Restbestand" />
          <Stat value={sales.length} label="Verkäufe" />
          <Stat value={cents(revenue)} label="Umsatz" />
          <Stat value={cents(revenue - costs)} label="Ergebnis" />
        </div>
        <div className="mt-4 grid gap-4">
          <section className="rounded-2xl border bg-white/60 p-4">
            <h3 className="font-medium">Bestand am Markt</h3>
            <div className="mt-3 space-y-2">
              {articles.map((article) => (
                <div key={string(article.id)} className="rounded-xl border p-3">
                  <div className="font-medium">{string(article.name)}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {rows(article.variants).map((variant) => (
                      <Badge key={string(variant.id)} variant="outline">
                        {string(variant.color, 'Standard')}:{' '}
                        {number(variant.quantityInStock)} ·{' '}
                        {cents(variant.salePriceCents)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border bg-white/60 p-4">
            <h3 className="font-medium">Bedarf & Ausgaben</h3>
            <p className="mt-3 text-sm">
              {demands.length} geplante Produktionspositionen
            </p>
            <div className="mt-3 space-y-2">
              {demands.map((demand) => (
                <div
                  key={string(demand.id)}
                  className="rounded-xl border p-3 text-sm"
                >
                  <span className="font-medium">
                    {number(demand.quantity)} ×{' '}
                    {string(
                      products.find(
                        (item) => string(item.id) === string(demand.productId),
                      )?.name,
                      'Artikel #' + string(demand.productId),
                    )}
                  </span>
                  {demand.note ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {string(demand.note)}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-2 text-sm">
              {expenses.length} Ausgaben · {cents(costs)}
            </p>
          </section>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border bg-white/60 p-4">
            <h3 className="font-medium">Bestand auf den Markt buchen</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <select
                className="h-9 rounded-lg border bg-white px-3 text-sm"
                value={stockProductId}
                onChange={(event) => {
                  setStockProductId(event.target.value);
                  setStockVariantId('');
                }}
              >
                <option value="">Portfolio-Artikel wählen</option>
                <optgroup label="Final überarbeitet">
                  {products
                    .filter(
                      (item) =>
                        !item.archivedAt &&
                        inventoryReviewStatus(item.studioStatus) === 'final',
                    )
                    .map((item) => (
                      <option key={string(item.id)} value={string(item.id)}>
                        {string(item.name)}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Entwürfe">
                  {products
                    .filter(
                      (item) =>
                        !item.archivedAt &&
                        inventoryReviewStatus(item.studioStatus) === 'draft',
                    )
                    .map((item) => (
                      <option key={string(item.id)} value={string(item.id)}>
                        {string(item.name)} · Entwurf
                      </option>
                    ))}
                </optgroup>
              </select>
              <select
                className="h-9 rounded-lg border bg-white px-3 text-sm"
                value={stockVariantId}
                onChange={(event) => setStockVariantId(event.target.value)}
                disabled={!rows(stockProduct?.variants).length}
              >
                <option value="">Hauptartikel</option>
                {rows(stockProduct?.variants).map((item) => (
                  <option key={string(item.id)} value={string(item.id)}>
                    {string(item.name, string(item.appearance, 'Ausführung'))}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min="1"
                value={stockQuantity}
                onChange={(event) => setStockQuantity(event.target.value)}
              />
              <Button
                onClick={() => void bookStock()}
                disabled={!stockProductId || Number(stockQuantity) <= 0}
              >
                Bestand buchen
              </Button>
            </div>
          </section>
        </div>
        <div className="mt-4 rounded-2xl border bg-white/40 p-3">
          <CashRegister
            data={data}
            initialVenueId={string(currentMarket.id)}
            lockVenue
            compact
            onBooked={onChanged}
          />
        </div>
        {actionMessage ? (
          <p className="text-sm text-muted-foreground">{actionMessage}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
