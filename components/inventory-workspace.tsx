'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Boxes,
  CalendarDays,
  Calculator,
  Check,
  CircleDollarSign,
  ClipboardList,
  Download,
  ExternalLink,
  Factory,
  FileArchive,
  FileText,
  ImagePlus,
  Loader2,
  MapPin,
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
  buyerWorldFromCategory,
  inventoryReviewStatus,
  type InventoryItem,
} from '@/lib/inventory-bridge';
import { PRINTERS, variantCostBreakdown } from '@/lib/inventory-production';
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
  { id: 'pricing', label: 'Preise & Portfolio', icon: Calculator },
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

function productImagePath(product: Row) {
  const variants = rows(product.variants);
  return string(
    product.studioPrimaryImageUrl ||
      variants.find((item) => string(item.imageUrl))?.imageUrl ||
      product.imageUri,
  );
}

function InventoryImage({ product, alt }: { product: Row; alt: string }) {
  const path = productImagePath(product);
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#ebe5db]">
      {path ? (
        <Image
          src={
            path.startsWith('/api/')
              ? path
              : '/api/inventory/image?path=' + encodeURIComponent(path)
          }
          alt={alt}
          fill
          unoptimized
          sizes="(max-width: 768px) 45vw, 220px"
          className="object-cover"
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
    number(product.defaultPriceCents) || number(firstVariant.priceCents);
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
        currentPrice: number(variant.priceCents)
          ? number(variant.priceCents) / 100
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
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
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
  const [editorMessage, setEditorMessage] = useState('');
  const [selectedMarket, setSelectedMarket] = useState<Row | null>(null);
  const openedInitialProduct = useRef('');

  const fetchArea = useCallback(
    async (area: Exclude<InventoryArea, 'overview'>) => {
      const response = await fetch('/api/inventory/workspace?area=' + area);
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
    const id = editor.row.id;
    const response = await fetch('/api/inventory/workspace', {
      method: id == null ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: editor.entity, id, values: form }),
    });
    const result = (await response.json()) as {
      error?: string;
      result?: Row[];
    };
    setSaving(false);
    if (!response.ok) {
      setError(result.error || 'Speichern fehlgeschlagen.');
      return;
    }
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
  }

  async function refreshProductEditor(productId: unknown) {
    const productResult = await fetchArea('products');
    const saved = rows(productResult.products).find(
      (item) => string(item.id) === string(productId),
    );
    if (saved) {
      setEditor({ entity: 'products', row: saved });
      setForm({ ...saved });
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
    const response = await fetch('/api/inventory/workspace', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, id, restore }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error || 'Aktion fehlgeschlagen.');
    else await refresh();
  }

  async function toggleOnline(row: Row, key: 'isPrinted' | 'isShipped') {
    const response = await fetch('/api/inventory/workspace', {
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
    const response = await fetch('/api/inventory/workspace', {
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
        fetch('/api/inventory/workspace', {
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
    const response = await fetch('/api/inventory/workspace', {
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
              !['pricing', 'sales', 'months', 'expenses', 'account', 'trash'].includes(
                section.id,
              ),
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
        <Sales data={data.sales || {}} onOpenProduct={openProduct} />
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
        <Stat
          value={products.filter((item) => !item.archivedAt).length}
          label="aktive Artikel"
        />
        <Stat
          value={products.reduce(
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
  onBulkEdit: (ids: string[], values: Row) => Promise<boolean>;
}) {
  const [mainFilter, setMainFilter] = useState<'all' | 'missing'>('all');
  const [category, setCategory] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [designerId, setDesignerId] = useState('');
  const [reviewFilter, setReviewFilter] = useState<'final' | 'draft' | 'all'>(
    'all',
  );
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
    rows(product.variants).map((variant) =>
      variantCostBreakdown(product, variant, source, components),
    );
  const averageMargin = (product: Row) => {
    if (productMissing(product)) return null;
    const values = metrics(product)
      .map((item) => item.marginPercent)
      .filter((item): item is number => item != null);
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  };
  const productMissing = (product: Row) => {
    const variants = rows(product.variants);
    return (
      !variants.length ||
      variants.some((variant) => {
        const cost = variantCostBreakdown(product, variant, source, components);
        const purchased = /zubehör|zubehoer|zukauf|einkauf|handelsware/i.test(
          string(product.category),
        );
        const digital = /stl|digital/i.test(string(product.category));
        if (purchased || digital)
          return (
            number(variant.priceCents) <= 0 ||
            number(variant.extraCostCents) < 0
          );
        return (
          number(variant.priceCents) <= 0 ||
          cost.netGrams <= 0 ||
          cost.printMinutes <= 0 ||
          !string(variant.printer)
        );
      })
    );
  };
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
    if (
      filter !== 'all' &&
      (filter === 'archive' ? !product.archivedAt : Boolean(product.archivedAt))
    )
      return false;
    if (category && string(product.category) !== category) return false;
    if (familyId && string(product.familyId) !== familyId) return false;
    if (designerId && string(product.designerId) !== designerId) return false;
    if (
      reviewFilter !== 'all' &&
      inventoryReviewStatus(product.studioStatus) !== reviewFilter
    )
      return false;
    if (mainFilter === 'missing' && !productMissing(product)) return false;
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
          ['Studio-Status', bulkStudioStatus === 'final' ? 'Final' : 'Entwurf'],
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
      if (product.archivedAt) return summary;
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
        {(
          [
            ['final', 'Final'],
            ['draft', 'Entwürfe'],
            ['all', 'Alle Status'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={reviewFilter === value ? 'default' : 'outline'}
            onClick={() =>
              setReviewFilter((current) =>
                value !== 'all' && current === value ? 'all' : value,
              )
            }
          >
            {label}
            {' · '}
            {
              source.filter((item) =>
                value === 'all'
                  ? true
                  : inventoryReviewStatus(item.studioStatus) === value,
              ).length
            }
          </Button>
        ))}
        {(
          [
            ['all', 'Alle'],
            ['missing', 'Daten fehlen'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={mainFilter === value ? 'default' : 'outline'}
            onClick={() =>
              setMainFilter((current) =>
                value !== 'all' && current === value ? 'all' : value,
              )
            }
          >
            {label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={moreFilters ? 'default' : 'outline'}
          onClick={() => setMoreFilters((value) => !value)}
        >
          Weitere Filter
          {[
            category,
            familyId,
            designerId,
            sort !== 'name' || sortDirection !== 'asc' ? sort : '',
          ].filter(Boolean).length
            ? ` (${[category, familyId, designerId, sort !== 'name' || sortDirection !== 'asc' ? sort : ''].filter(Boolean).length})`
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
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          value={source.filter((item) => !item.archivedAt).length}
          label="aktive Artikel"
        />
        <Stat value={portfolio.stock} label="kalkulierte Stück im Bestand" />
        <Stat value={cents(portfolio.profitCents)} label="Gewinn im Bestand" />
        <Stat
          value={`${cents(portfolio.boundCents)} · ${portfolio.missing} offen`}
          label="gebunden · Kalkulation fehlt"
        />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {products.map((product) => {
          const variants = rows(product.variants);
          const price = variants.length
            ? Math.min(...variants.map((item) => number(item.priceCents)))
            : 0;
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
                'relative overflow-hidden rounded-[24px] border bg-white/65 p-3 ' +
                (selectedIds.includes(string(product.id))
                  ? 'ring-2 ring-[var(--fp-primary)]'
                  : '')
              }
            >
              <label
                className="absolute top-5 left-5 z-10 grid size-9 cursor-pointer place-items-center rounded-full border bg-white/90 shadow-sm"
                aria-label={string(product.name) + ' auswählen'}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(string(product.id))}
                  onChange={(event) =>
                    setSelectedIds((current) =>
                      event.target.checked
                        ? [...current, string(product.id)]
                        : current.filter((id) => id !== string(product.id)),
                    )
                  }
                  className="size-4"
                />
              </label>
              <InventoryImage product={product} alt={string(product.name)} />
              <div className="p-2 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium leading-tight">
                      {string(product.name)}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        string(product.category),
                        familyName(product, data),
                        designerName(product, data),
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Ohne Zuordnung'}
                    </p>
                  </div>
                  {product.archivedAt ? (
                    <Badge variant="outline">Archiv</Badge>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-1">
                      <Badge
                        variant={
                          inventoryReviewStatus(product.studioStatus) === 'final'
                            ? 'default'
                            : 'outline'
                        }
                      >
                        {inventoryReviewStatus(product.studioStatus) === 'final'
                          ? 'Final'
                          : 'Entwurf'}
                      </Badge>
                      {boolean(product.etsyListed) ? (
                        <Badge variant="outline">Etsy</Badge>
                      ) : null}
                    </div>
                  )}
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Bestand</dt>
                    <dd className="mt-1 font-medium">
                      {stock}
                      {marketStock ? ` + ${marketStock} vor Ort` : ''}
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
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {variants.length}{' '}
                  {variants.length === 1 ? 'Variante' : 'Varianten'} · Preis ab{' '}
                  {cents(price)} · {duration(printMinutes)} · {grams} g
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => onEdit(product)}>
                    <Pencil className="size-4" /> Bearbeiten
                  </Button>
                  <Button variant="outline" onClick={() => onListing(product)}>
                    <Sparkles className="size-4" /> Etsy
                  </Button>
                  <Button variant="ghost" onClick={() => onArchive(product)}>
                    <Archive className="size-4" />{' '}
                    {product.archivedAt ? 'Aktivieren' : 'Archivieren'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-red-700"
                    onClick={() => onTrash(product)}
                  >
                    <Trash2 className="size-4" /> Löschen
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
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Druckfrist</div>
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
};

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
  const customers = rows(data.customers);
  const [channel, setChannel] =
    useState<(typeof GENERAL_SALES_CHANNELS)[number]>('Abholung');
  const [saleDate, setSaleDate] = useState(() =>
    new Intl.DateTimeFormat('sv-SE').format(new Date()),
  );
  const [search, setSearch] = useState('');
  const [recipient, setRecipient] = useState('');
  const [shippingCost, setShippingCost] = useState('');
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
    );
  const total = cart.reduce(
    (sum, item) => sum + item.quantity * item.salePriceCents,
    0,
  );

  function itemKey(product: Row, variant: Row) {
    return `${string(product.id)}:${string(variant.id, 'standard')}`;
  }

  function add(product: Row, variant: Row) {
    const key = itemKey(product, variant);
    const price =
      number(variant.priceCents) || number(product.defaultPriceCents);
    setCart((current) => {
      const match = current.find(
        (item) => itemKey(item.product, item.variant) === key,
      );
      if (match)
        return current.map((item) =>
          item === match ? { ...item, quantity: item.quantity + 1 } : item,
        );
      return [
        ...current,
        { product, variant, quantity: 1, salePriceCents: price },
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
    setSaving(true);
    setMessage('');
    const response = await fetch('/api/inventory/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_online_order',
        order: {
          channel,
          date: saleDate,
          shippingRecipient: recipient,
          shippingCostCents: Math.max(
            0,
            Math.round(Number(shippingCost.replace(',', '.')) * 100) || 0,
          ),
          note,
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
          const filaments = rows(item.product.filaments).filter(
            (row) =>
              !string(row.productVariantId) ||
              string(row.productVariantId) === string(item.variant.id),
          );
          const primaryFilament = filaments.find(
            (row) => number(row.materialId) > 0,
          );
          return {
            productId: number(item.product.id),
            articleName: string(item.product.name, 'Artikel'),
            size: string(
              item.variant.size || item.variant.name || item.product.size,
            ),
            quantity: item.quantity,
            printer: string(item.variant.printer || item.product.printer),
            printMinutes: breakdown.printMinutes,
            filamentMaterialId: number(
              item.variant.materialId || primaryFilament?.materialId,
            ),
            filamentGrams: breakdown.netGrams + breakdown.wasteGrams,
            filamentCostCents: breakdown.filamentCents + breakdown.wasteCents,
            electricityCostCents: breakdown.electricityCents,
            machineCostCents: breakdown.machineCents,
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
                onChange={(event) =>
                  setChannel(
                    event.target
                      .value as (typeof GENERAL_SALES_CHANNELS)[number],
                  )
                }
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
              <Field
                label="Versandkosten in €"
                value={shippingCost}
                onChange={setShippingCost}
              />
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
              const breakdown = variantCostBreakdown(
                product,
                variant,
                products,
                components,
              );
              const price =
                number(variant.priceCents) || number(product.defaultPriceCents);
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
                      {string(
                        variant.name || variant.appearance || variant.size,
                        'Standard',
                      )}{' '}
                      · Kosten {cents(breakdown.totalCents)}
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
              return (
                <div
                  key={key}
                  className="rounded-xl border border-white/15 p-3"
                >
                  <div className="text-sm font-medium">
                    {string(item.product.name)}
                  </div>
                  <div className="text-xs text-white/60">
                    {string(item.variant.name || item.variant.size, 'Standard')}
                  </div>
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
                </div>
              );
            })}
            {!cart.length ? (
              <p className="text-sm text-white/60">
                Wähle links einen Artikel aus.
              </p>
            ) : null}
          </div>
          <div className="mt-6 border-t border-white/15 pt-5">
            <div className="flex items-end justify-between">
              <span className="text-sm text-white/65">Gesamtsumme</span>
              <span className="font-heading text-4xl">{cents(total)}</span>
            </div>
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
    const response = await fetch('/api/inventory/workspace', {
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
}: {
  data: AreaData;
  onOpenProduct: (productId: string) => void | Promise<void>;
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
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            Nach Monaten
          </p>
          <h2 className="mt-1 font-heading text-3xl">Verkaufshistorie</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[660px]">
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
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
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
              <div className="text-lg font-semibold">
                {cents(saleTotal(sale))}
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
              <div className="text-lg font-semibold">
                {cents(onlineSaleRevenue(sale))}
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
    const response = await fetch('/api/inventory/expense-documents', {
      method: 'POST',
      body,
    });
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
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {visible.map((expense) => (
          <article
            key={`${string(expense.expenseSource, 'other')}-${string(expense.id)}`}
            className="rounded-2xl border bg-white/65 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">
                  {string(expense.articleName || expense.label, 'Ausgabe')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[
                    string(expense.vendor || expense.marketName),
                    string(expense.category),
                    date(expense.invoiceDate || expense.date),
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
                Diese Ausgabe wird automatisch aus den Kosten des Verkaufsorts
                übernommen.
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
    const response = await fetch('/api/inventory/account', {
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
  onSave: () => void;
  onClose: () => void;
  onProductChanged: (productId: unknown) => void;
  onMaterialChanged: (materialId: unknown) => void;
}) {
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
  const isMaterial = editor.entity === 'materials';
  const isMarket = editor.entity === 'markets';
  const isOnline = editor.entity === 'online_sales';
  const isExpense = editor.entity === 'other_expenses';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-[#f8f4ed] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-3xl">
            {editor.row.id ? 'Bearbeiten' : 'Neu anlegen'}
          </DialogTitle>
          <DialogDescription>
            Alle Änderungen werden direkt in der gemeinsamen Inventardatenbank
            gespeichert.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          {isProduct ? (
            <>
              {input('name', 'Artikelname')}
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Kategorie
                <Input
                  list="product-categories"
                  value={string(form.category)}
                  onChange={(event) => setValue('category', event.target.value)}
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
              {input('modelUrl', 'Modell-/MakerWorld-Link', 'url')}
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Produktfamilie
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                  value={string(form.familyId)}
                  onChange={(event) =>
                    setValue(
                      'familyId',
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">Keine</option>
                  {rows(data.products?.families).map((item) => (
                    <option key={string(item.id)} value={string(item.id)}>
                      {string(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Designer/Lizenzgeber
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                  value={string(form.designerId)}
                  onChange={(event) =>
                    setValue(
                      'designerId',
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">Eigener Entwurf / keine Zuordnung</option>
                  {rows(data.products?.designers).map((item) => (
                    <option key={string(item.id)} value={string(item.id)}>
                      {string(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-xl border bg-white p-3 text-sm">
                <input
                  type="checkbox"
                  checked={boolean(form.commercialLicense)}
                  onChange={(event) =>
                    setValue('commercialLicense', event.target.checked)
                  }
                />{' '}
                Gewerbliche Lizenz vorhanden
              </label>
              <label className="flex items-center gap-2 rounded-xl border bg-white p-3 text-sm">
                <input
                  type="checkbox"
                  checked={
                    inventoryReviewStatus(form.studioStatus) === 'final'
                  }
                  onChange={(event) =>
                    setValue(
                      'studioStatus',
                      event.target.checked ? 'final' : 'draft',
                    )
                  }
                />{' '}
                Final überarbeitet
              </label>
              <label className="flex items-center gap-2 rounded-xl border bg-white p-3 text-sm">
                <input
                  type="checkbox"
                  checked={boolean(form.etsyListed)}
                  onChange={(event) =>
                    setValue('etsyListed', event.target.checked)
                  }
                />{' '}
                Auf Etsy inseriert
              </label>
              {inventoryReviewStatus(form.studioStatus) === 'final' ? (
                <Field
                  label="Datum der finalen Bestätigung"
                  type="date"
                  value={string(form.finalizedAt).slice(0, 10)}
                  onChange={(value) => setValue('finalizedAt', value)}
                />
              ) : null}
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">
                Notiz
                <Textarea
                  value={string(form.note)}
                  onChange={(event) => setValue('note', event.target.value)}
                  className="bg-white text-foreground"
                />
              </label>
              {editor.row.id ? (
                <ProductAssetManager
                  product={form}
                  onChanged={() => onProductChanged(editor.row.id)}
                />
              ) : null}
              {editor.row.id ? (
                <>
                  <ManufacturingEditor
                    product={editor.row}
                    materials={rows(data.products?.materials)}
                    products={rows(data.products?.products)}
                    components={rows(data.products?.components)}
                    onChanged={() => onProductChanged(editor.row.id)}
                  />
                  <RelationsSummary
                    product={editor.row}
                    data={data.products || {}}
                  />
                </>
              ) : (
                <p className="rounded-xl border border-dashed bg-white/55 p-4 text-sm text-muted-foreground sm:col-span-2">
                  Speichere zuerst den Produktstamm. Danach öffnet sich die
                  vollständige Varianten- und Kostenmaske.
                </p>
              )}
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
              {input('pricePerRollCents', 'Preis pro Rolle in Cent', 'number')}
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
              {input('priceCents', 'Betrag in Cent', 'number')}
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
              {input('printer', 'Drucker')}
              {input('printDeadline', 'Druckfrist', 'date')}
              {input('shippingMethod', 'Versandart')}
              {input('shippingDeadline', 'Versandfrist', 'date')}
              {input('shippingRecipient', 'Empfänger')}
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
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || (isProduct && !string(form.name))}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}{' '}
            Speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManufacturingEditor({
  product,
  materials,
  products,
  components,
  onChanged,
}: {
  product: Row;
  materials: Row[];
  products: Row[];
  components: Row[];
  onChanged: () => void | Promise<void>;
}) {
  const variants = rows(product.variants);
  const filaments = rows(product.filaments);
  const variantGroups = Array.from(
    variants.reduce((groups, variant) => {
      const label = string(variant.name, 'Standard').trim() || 'Standard';
      groups.set(label, [...(groups.get(label) || []), variant]);
      return groups;
    }, new Map<string, Row[]>()),
  );
  const [editing, setEditing] = useState<{
    entity: 'product_variants' | 'product_filaments';
    row: Row;
  } | null>(null);
  const [values, setValues] = useState<Row>({});
  const [message, setMessage] = useState('');

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
    setEditing({ entity, row });
    setValues({ ...defaults, ...row });
    setMessage('');
    window.requestAnimationFrame(() =>
      document
        .getElementById('manufacturing-editor-' + string(product.id))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  async function save() {
    if (!editing) return;
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
    const response = await fetch('/api/inventory/workspace', {
      method: editing.row.id == null ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: editing.entity,
        id: editing.row.id,
        values: saveValues,
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error || 'Ausführung konnte nicht gespeichert werden.');
      return;
    }
    if (editing.entity === 'product_filaments') {
      const nextFilaments = editing.row.id
        ? filaments.map((item) =>
            string(item.id) === string(editing.row.id) ? values : item,
          )
        : [...filaments, values];
      const nextProduct = { ...product, filaments: nextFilaments };
      await Promise.all(
        variants.map((variant) =>
          fetch('/api/inventory/workspace', {
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
    }
    await onChanged();
    setEditing(null);
  }

  return (
    <div className="sm:col-span-2 rounded-2xl border bg-white/55 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Ausführungen & Herstellung</h3>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => open('product_variants')}
          >
            <Plus className="size-3.5" /> Neue Variante
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => open('product_filaments')}
          >
            <Plus className="size-3.5" /> Neues Filament
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {variantGroups.map(([label, group]) => {
          const appearances = [
            ...new Set(
              group
                .map((variant) => string(variant.appearance, 'Standard'))
                .filter(Boolean),
            ),
          ];
          return (
            <details
              key={label}
              className="group rounded-xl border bg-white/55 open:bg-white"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {group.length}{' '}
                    {group.length === 1 ? 'Variante' : 'Varianten'}
                    {appearances.length ? ` · ${appearances.join(', ')}` : ''}
                  </span>
                </span>
                <Badge variant="outline">
                  {group.reduce(
                    (sum, variant) => sum + number(variant.quantity),
                    0,
                  )}{' '}
                  Stück
                </Badge>
                <span className="text-sm transition group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <div className="grid gap-2 border-t p-3 md:grid-cols-2">
                {group.map((variant) => {
                  const cost = variantCostBreakdown(
                    product,
                    variant,
                    products,
                    components,
                  );
                  return (
                    <article
                      key={string(variant.id)}
                      className="rounded-xl border bg-[var(--fp-paper)]/45 p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">
                            {string(variant.appearance, 'Standard')}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {[
                              string(variant.size),
                              string(object(variant.material).name),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`${label} – ${string(variant.appearance, 'Standard')} bearbeiten`}
                          onClick={() => open('product_variants', variant)}
                        >
                          <Pencil className="size-3.5" /> Bearbeiten
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        <span>{number(variant.quantity)} Stück</span>
                        <span>
                          {cost.netGrams} g + {cost.wasteGrams} g Ausschuss
                        </span>
                        <span>{cents(variant.priceCents)}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-[#f3ede4] p-2 text-xs">
                        <span>
                          Gesamtkosten <strong>{cents(cost.totalCents)}</strong>
                        </span>
                        <span>
                          Marge{' '}
                          <strong>
                            {cost.marginPercent == null
                              ? 'unklar'
                              : `${cost.marginPercent.toFixed(1)} %`}
                          </strong>
                        </span>
                        <span>Material {cents(cost.filamentCents)}</span>
                        <span>Ausschuss {cents(cost.wasteCents)}</span>
                        <span>Maschine {cents(cost.machineCents)}</span>
                        <span>Strom {cents(cost.electricityCents)}</span>
                        <span>Zusatz {cents(cost.extraCents)}</span>
                        <span>Bauteile {cents(cost.componentsCents)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
      {filaments.length ? (
        <details className="group mt-3 rounded-xl border bg-white/45">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-medium">
            Filamente & Bauteile ({filaments.length})
            <span className="text-sm transition group-open:rotate-180">⌄</span>
          </summary>
          <div className="flex flex-wrap gap-2 border-t p-3">
            {filaments.map((item) => (
              <button
                type="button"
                key={string(item.id)}
                onClick={() => open('product_filaments', item)}
                className="rounded-full border bg-white px-3 py-1 text-xs hover:border-[var(--fp-primary)]"
              >
                {string(item.part, 'Filament')}: {number(item.grams)} g{' '}
                {string(object(item.material).name)}
              </button>
            ))}
          </div>
        </details>
      ) : null}
      {!variants.length && !filaments.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Noch keine Ausführungen oder Filamente hinterlegt.
        </p>
      ) : null}
      {editing ? (
        <div
          id={'manufacturing-editor-' + string(product.id)}
          className="mt-4 scroll-mt-6 rounded-2xl border bg-[#f8f4ed] p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium">
              {editing.entity === 'product_variants'
                ? editing.row.id
                  ? 'Variante bearbeiten'
                  : 'Neue Variante'
                : editing.row.id
                  ? 'Filament bearbeiten'
                  : 'Neues Filament'}
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditing(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {editing.entity === 'product_variants' ? (
              <>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Gewichtsklasse / Variantengruppe
                  <select
                    className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                    value={string(values.weightClassGroup)}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        weightClassGroup: event.target.value || null,
                      }))
                    }
                  >
                    <option value="">Eigenständige Variante</option>
                    {variants
                      .filter((item) => string(item.id) !== string(values.id))
                      .map((item) => (
                        <option
                          key={string(item.id)}
                          value={string(item.weightClassGroup || item.id)}
                        >
                          Gewichtsklasse von{' '}
                          {string(
                            item.name || item.appearance,
                            'Variante ' + string(item.id),
                          )}
                        </option>
                      ))}
                  </select>
                </label>
                <Field
                  label="Name"
                  value={string(values.name)}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, name: value }))
                  }
                />
                <Field
                  label="Farbe / Erscheinung"
                  value={string(values.appearance)}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, appearance: value }))
                  }
                />
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Material / Rolle
                  <select
                    className="h-9 rounded-lg border bg-white px-3 text-sm text-foreground"
                    value={string(values.materialId)}
                    onChange={(event) => {
                      const material = materials.find(
                        (item) => string(item.id) === event.target.value,
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
                    <option value="">Material wählen</option>
                    {materials.map((item) => (
                      <option key={string(item.id)} value={string(item.id)}>
                        {[
                          string(object(item.brand).name),
                          string(item.name),
                          string(item.variant),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Größe"
                  value={string(values.size)}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, size: value }))
                  }
                />
                <Field
                  label="Bestand"
                  type="number"
                  value={string(values.quantity)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      quantity: Number(value),
                    }))
                  }
                />
                <Field
                  label="Nettogewicht in g"
                  type="number"
                  value={string(values.grams)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      grams: Number(value),
                    }))
                  }
                />
                <Field
                  label="Ausschuss in g"
                  type="number"
                  value={string(values.wasteGrams)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      wasteGrams: Number(value),
                    }))
                  }
                />
                <Field
                  label="Preis in Cent"
                  type="number"
                  value={string(values.priceCents)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      priceCents: Number(value),
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
                    <option value="">Drucker wählen</option>
                    {PRINTERS.map((printer) => (
                      <option key={printer}>{printer}</option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Druckzeit in Minuten"
                  type="number"
                  value={string(values.printMinutes)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      printMinutes: Number(value),
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
                    <option value="0">Kein Nachlass</option>
                    <option value="10">10 %</option>
                    <option value="15">15 %</option>
                    <option value="20">20 %</option>
                    <option value="25">25 %</option>
                    <option value="30">30 %</option>
                    <option value="50">50 %</option>
                  </select>
                </label>
                <Field
                  label="Mangel / Fehler"
                  value={string(values.defectNote)}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, defectNote: value }))
                  }
                />
                <Field
                  label="Zubehör, das mitgeht"
                  value={string(values.accessories)}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, accessories: value }))
                  }
                />
                <Field
                  label="Zusatzkosten je Stück in Cent"
                  type="number"
                  value={string(values.extraCostCents)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      extraCostCents: Number(value),
                    }))
                  }
                />
                {editing.row.id ? (
                  <ImageUpload
                    productId={string(product.id)}
                    variantId={string(editing.row.id)}
                    label="Bild dieser Variante ersetzen"
                    onUploaded={onChanged}
                  />
                ) : null}
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
                            Netto {cost.netGrams} g ·{' '}
                            {cents(cost.filamentCents)}
                          </span>
                          <span>
                            Ausschuss {cost.wasteGrams} g ·{' '}
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
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Material
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
                        {string(item.name)} · {string(item.variant)}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Bauteil / Bereich"
                  value={string(values.part)}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, part: value }))
                  }
                />
                <Field
                  label="Nettogewicht in g"
                  type="number"
                  value={string(values.grams)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      grams: Number(value),
                    }))
                  }
                />
                <Field
                  label="Ausschuss in g"
                  type="number"
                  value={string(values.wasteGrams)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      wasteGrams: Number(value),
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
                <Field
                  label="Druckzeit in Minuten"
                  type="number"
                  value={string(values.printMinutes)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      printMinutes: Number(value),
                    }))
                  }
                />
              </>
            )}
          </div>
          {message ? (
            <p className="mt-2 text-xs text-red-700">{message}</p>
          ) : null}
          <Button type="button" className="mt-3" onClick={() => void save()}>
            <Check className="size-4" /> Speichern
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RelationsSummary({ product, data }: { product: Row; data: AreaData }) {
  const allProducts = rows(data.products);
  const variants = rows(product.variants);
  const components = rows(data.components).filter(
    (item) => string(item.parentProductId) === string(product.id),
  );
  const accessories = rows(data.accessories).filter(
    (item) => string(item.productId) === string(product.id),
  );
  const productName = (id: unknown) =>
    string(
      allProducts.find((item) => string(item.id) === string(id))?.name,
      '#' + string(id),
    );
  const variantName = (id: unknown) =>
    string(variants.find((item) => string(item.id) === string(id))?.name);
  return (
    <div className="sm:col-span-2 grid gap-3 lg:grid-cols-2">
      <section className="rounded-2xl border bg-white/55 p-4">
        <h3 className="font-medium">Bauteile & Stückliste</h3>
        <div className="mt-3 space-y-2">
          {components.map((item) => (
            <div
              key={string(item.id)}
              className="rounded-xl border p-3 text-sm"
            >
              <div className="font-medium">
                {number(item.quantity, 1)} ×{' '}
                {productName(item.componentProductId)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {[
                  string(item.slot),
                  string(item.inventoryTrackingMode),
                  string(item.consumedAt),
                  variantName(item.parentVariantId),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          ))}
          {!components.length ? (
            <p className="text-sm text-muted-foreground">
              Keine Bauteile zugeordnet.
            </p>
          ) : null}
        </div>
      </section>
      <section className="rounded-2xl border bg-white/55 p-4">
        <h3 className="font-medium">Passendes Zubehör</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {accessories.map((item) => (
            <Badge key={string(item.id)} variant="outline">
              {productName(item.accessoryProductId)}
            </Badge>
          ))}
          {!accessories.length ? (
            <p className="text-sm text-muted-foreground">
              Kein Zubehör zugeordnet.
            </p>
          ) : null}
        </div>
      </section>
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
    const response = await fetch('/api/inventory/material-images', {
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
    const response = await fetch('/api/inventory/material-images', {
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

  async function upload(file: File, kind: 'image' | 'print') {
    setUploading(kind);
    setMessage('');
    const body = new FormData();
    body.set('file', file);
    body.set('productId', string(product.id));
    body.set('kind', kind);
    const response = await fetch('/api/inventory/product-assets', {
      method: 'POST',
      body,
    });
    const result = (await response.json()) as { error?: string };
    setUploading('');
    if (!response.ok) {
      setMessage(result.error || 'Upload fehlgeschlagen.');
      return;
    }
    setMessage(
      kind === 'image' ? 'Bild gespeichert.' : 'Druckdatei gespeichert.',
    );
    onChanged();
  }

  async function setPrimary(id: string) {
    const response = await fetch('/api/inventory/product-assets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isPrimary: true }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok)
      setMessage(result.error || 'Hauptbild nicht gespeichert.');
    else {
      setMessage('Hauptbild aktualisiert.');
      onChanged();
    }
  }

  async function remove(asset: Row) {
    if (!window.confirm(`„${string(asset.filename)}“ wirklich löschen?`))
      return;
    const response = await fetch('/api/inventory/product-assets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: asset.id }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setMessage(result.error || 'Datei nicht gelöscht.');
    else {
      setMessage('Datei gelöscht.');
      onChanged();
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border bg-white/55 p-4 sm:col-span-2">
      <div>
        <h3 className="font-medium">Bilder & interne Druckdateien</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Bilder werden zentral wiederverwendet. STL-, 3MF-, OBJ- und
          ZIP-Dateien bleiben geschützt und erscheinen nie automatisch in Etsy
          oder Katalogen.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-white p-3">
          {uploading === 'image' ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ImagePlus className="size-5" />
          )}
          <span className="text-sm">
            <span className="block font-medium">Weitere Bilder</span>
            <span className="text-xs text-muted-foreground">
              JPEG, PNG, WebP · max. 20 MB
            </span>
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={Boolean(uploading)}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file, 'image');
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
              STL, 3MF, OBJ, ZIP · max. 100 MB
            </span>
          </span>
          <input
            type="file"
            accept=".stl,.3mf,.obj,.zip"
            className="sr-only"
            disabled={Boolean(uploading)}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file, 'print');
              event.target.value = '';
            }}
          />
        </label>
      </div>
      {images.length ? (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase">
            Artikelbilder
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((asset) => (
              <article
                key={string(asset.id)}
                className="overflow-hidden rounded-xl border bg-white"
              >
                <div className="relative aspect-square bg-[#ebe5db]">
                  <Image
                    src={string(asset.url)}
                    alt={string(asset.filename, 'Artikelbild')}
                    fill
                    unoptimized
                    sizes="160px"
                    className="object-cover"
                  />
                  {boolean(asset.isPrimary) ? (
                    <Badge className="absolute top-2 left-2">Hauptbild</Badge>
                  ) : null}
                </div>
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
                        onClick={() => void setPrimary(string(asset.id))}
                      >
                        <Star className="size-3" /> Hauptbild
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-red-700"
                      aria-label={string(asset.filename) + ' löschen'}
                      onClick={() => void remove(asset)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
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
    </section>
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
    const response = await fetch('/api/inventory/image', {
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
    const response = await fetch('/api/inventory/workspace', {
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
