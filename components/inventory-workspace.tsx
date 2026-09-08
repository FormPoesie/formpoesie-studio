'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Boxes,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  Factory,
  ImagePlus,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
  UserRound,
  Warehouse,
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

type Row = Record<string, unknown>;
type Area =
  | 'overview'
  | 'products'
  | 'materials'
  | 'markets'
  | 'online'
  | 'sales'
  | 'months'
  | 'account'
  | 'trash';

type AreaData = Record<string, unknown>;

const sections: Array<{
  id: Area;
  label: string;
  icon: typeof Boxes;
}> = [
  { id: 'overview', label: 'Übersicht', icon: Boxes },
  { id: 'products', label: 'Artikel', icon: Package },
  { id: 'materials', label: 'Material', icon: Warehouse },
  { id: 'markets', label: 'Märkte', icon: MapPin },
  { id: 'online', label: 'Online', icon: Truck },
  { id: 'sales', label: 'Verkäufe', icon: ShoppingBag },
  { id: 'months', label: 'Monate', icon: CalendarDays },
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
          src={'/api/inventory/image?path=' + encodeURIComponent(path)}
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
  return {
    id: string(product.id),
    modelName: string(product.name, 'Unbenannter Artikel'),
    productType: string(product.category, '3D-gedrucktes Objekt'),
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
}: {
  onCreateListing: (item: InventoryItem) => void;
}) {
  const [active, setActive] = useState<Area>('overview');
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
  const [selectedMarket, setSelectedMarket] = useState<Row | null>(null);

  const fetchArea = useCallback(async (area: Exclude<Area, 'overview'>) => {
    const response = await fetch('/api/inventory/workspace?area=' + area);
    const result = (await response.json()) as AreaData & { error?: string };
    if (!response.ok)
      throw new Error(result.error || 'Daten konnten nicht geladen werden.');
    setData((current) => ({ ...current, [area]: result }));
    return result;
  }, []);

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
          fetchArea('months'),
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
    if (active === 'overview' || !data[active]) void refresh();
  }, [active, data, refresh]);

  const openEditor = (entity: string, row: Row = {}) => {
    setEditor({ entity, row });
    setForm({ ...row });
  };

  const setValue = (key: string, value: unknown) =>
    setForm((current) => ({ ...current, [key]: value }));

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
    const result = (await response.json()) as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setError(result.error || 'Speichern fehlgeschlagen.');
      return;
    }
    setEditor(null);
    await refresh();
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
        entity: 'online_sales',
        id: row.id,
        values: { [key]: !boolean(row[key]) },
      }),
    });
    if (!response.ok) setError('Status konnte nicht gespeichert werden.');
    else await fetchArea('online');
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
        },
      }),
    });
    if (!response.ok) setError('Markt konnte nicht kopiert werden.');
    else await fetchArea('markets');
  }

  const productData = data.products || {};
  const products = rows(productData.products);
  const materials = rows(data.materials?.materials);
  const markets = rows(data.markets?.markets);
  const online = rows(data.online?.onlineSales);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-9">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            Ein System · echte Inventardaten
          </p>
          <h1 className="mt-2 font-heading text-4xl leading-none md:text-5xl">
            Inventar
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Artikel, Material, Märkte, Verkäufe und Auswertungen werden direkt
            in derselben FormPoesie-Datenbank bearbeitet.
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
        {sections.map((section) => {
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
          onGo={setActive}
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
            openEditor('products', row);
            setForm({
              ...row,
              archivedAt: row.archivedAt ? null : new Date().toISOString(),
            });
          }}
          onListing={(row) => onCreateListing(inventoryItem(row))}
        />
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
          onNew={() => openEditor('markets')}
          onOpen={setSelectedMarket}
          onCopy={(row) => void copyMarket(row)}
          onTrash={(row) => void moveToTrash('markets', row.id)}
        />
      ) : null}
      {active === 'online' ? (
        <OnlineSales
          items={online}
          onToggle={toggleOnline}
          onEdit={(row) => openEditor('online_sales', row)}
        />
      ) : null}
      {active === 'sales' ? <Sales data={data.sales || {}} /> : null}
      {active === 'months' ? <Months data={data.months || {}} /> : null}
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
        onSave={() => void saveEntity()}
        onClose={() => setEditor(null)}
      />
      <MarketDetail
        market={selectedMarket}
        data={data.markets || {}}
        products={products}
        onClose={() => setSelectedMarket(null)}
        onChanged={() => void fetchArea('markets')}
      />
    </div>
  );
}

function Overview({
  products,
  materials,
  markets,
  online,
  onGo,
}: {
  products: Row[];
  materials: Row[];
  markets: Row[];
  online: Row[];
  onGo: (area: Area) => void;
}) {
  const activeMarkets = markets.filter(
    (item) => string(item.status) !== 'abgeschlossen',
  );
  const printTasks = online.filter((item) => !boolean(item.isPrinted));
  const shippingTasks = online.filter(
    (item) =>
      !boolean(item.isShipped) && string(item.shippingMethod) !== 'abholung',
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
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <Task
            icon={Factory}
            count={printTasks.length}
            title="Drucken"
            detail="verkaufte Artikel noch nicht gedruckt"
            onClick={() => onGo('online')}
          />
          <Task
            icon={Truck}
            count={shippingTasks.length}
            title="Versenden"
            detail="gedruckte oder offene Bestellungen"
            onClick={() => onGo('online')}
          />
          <Task
            icon={Warehouse}
            count={lowMaterials.length}
            title="Material prüfen"
            detail="niedrig, fast leer oder leer"
            onClick={() => onGo('materials')}
          />
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
}) {
  const products = rows(data.products).filter((product) => {
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
    return (
      matches &&
      (filter === 'all' ||
        (filter === 'archive'
          ? Boolean(product.archivedAt)
          : !product.archivedAt))
    );
  });
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
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {products.map((product) => {
          const variants = rows(product.variants);
          const price =
            number(product.defaultPriceCents) ||
            number(variants[0]?.priceCents);
          const cost =
            number(product.productionCostCents) ||
            number(variants[0]?.productionCostCents);
          return (
            <article
              key={string(product.id)}
              className="overflow-hidden rounded-[24px] border bg-white/65 p-3"
            >
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
                  ) : null}
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Bestand</dt>
                    <dd className="mt-1 font-medium">
                      {number(product.stockQuantity)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Preis</dt>
                    <dd className="mt-1 font-medium">{cents(price)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Marge</dt>
                    <dd className="mt-1 font-medium">
                      {cents(Math.max(0, price - cost))}
                    </dd>
                  </div>
                </dl>
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
        {items.map((item) => (
          <article
            key={string(item.id)}
            className="rounded-2xl border bg-white/65 p-4"
          >
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
          </article>
        ))}
      </div>
    </section>
  );
}

function Markets({
  data,
  onEdit,
  onNew,
  onOpen,
  onCopy,
  onTrash,
}: {
  data: AreaData;
  onEdit: (row: Row) => void;
  onNew: () => void;
  onOpen: (row: Row) => void;
  onCopy: (row: Row) => void;
  onTrash: (row: Row) => void;
}) {
  const items = rows(data.markets);
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-2xl">
            Aktuelle und vergangene Märkte
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bestand, Verkäufe, Ausgaben und Bedarf pro Markt.
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus className="size-4" /> Markt
        </Button>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map((market) => {
          const marketSales = rows(data.sales).filter(
            (sale) => string(sale.marketId) === string(market.id),
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
                  <div className="text-xs text-muted-foreground">Artikel</div>
                  {
                    rows(data.articles).filter(
                      (item) => string(item.marketId) === string(market.id),
                    ).length
                  }
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
                  Öffnen
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

function OnlineSales({
  items,
  onToggle,
  onEdit,
}: {
  items: Row[];
  onToggle: (row: Row, key: 'isPrinted' | 'isShipped') => void;
  onEdit: (row: Row) => void;
}) {
  return (
    <section className="mt-6">
      <div className="grid gap-3">
        {items.map((item) => (
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
                  date(item.date),
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
                {string(item.shippingMethod, '–')}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button
                variant={boolean(item.isPrinted) ? 'default' : 'outline'}
                onClick={() => void onToggle(item, 'isPrinted')}
              >
                <Check className="size-4" /> Gedruckt
              </Button>
              <Button variant="ghost" onClick={() => onCopy(market)}>
                <ClipboardList className="size-4" /> Kopieren
              </Button>
              <Button
                variant={boolean(item.isShipped) ? 'default' : 'outline'}
                onClick={() => void onToggle(item, 'isShipped')}
              >
                <Truck className="size-4" /> Versendet
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onEdit(item)}>
                <Pencil className="size-4" />
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Sales({ data }: { data: AreaData }) {
  const items = rows(data.sales);
  return (
    <section className="mt-6">
      <div className="grid gap-3">
        {items.map((sale) => (
          <article
            key={string(sale.id)}
            className="rounded-2xl border bg-white/65 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">Verkauf #{string(sale.id)}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {date(sale.date)} ·{' '}
                  {string(sale.paymentMethod, 'Zahlungsart nicht erfasst')}
                </p>
              </div>
              <div className="text-lg font-semibold">
                {cents(saleTotal(sale))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {rows(sale.items).map((item) => (
                <Badge key={string(item.id)} variant="outline">
                  {number(item.quantity)} ×{' '}
                  {string(
                    object(object(item.articleVariant).article).name,
                    'Artikel',
                  )}
                </Badge>
              ))}
            </div>
            {sale.note ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {string(sale.note)}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function Months({ data }: { data: AreaData }) {
  const sales = rows(data.sales);
  const online = rows(data.onlineSales);
  const expenses = [...rows(data.expenses), ...rows(data.otherExpenses)];
  const keys = [
    ...new Set(
      [
        ...sales.map((item) => monthKey(item.date)),
        ...online.map((item) => monthKey(item.date)),
        ...expenses.map((item) => monthKey(item.date || item.invoiceDate)),
      ].filter(Boolean),
    ),
  ]
    .sort()
    .reverse();
  return (
    <section className="mt-6 grid gap-3 lg:grid-cols-2">
      {keys.map((key) => {
        const monthSales = sales.filter((item) => monthKey(item.date) === key);
        const monthOnline = online.filter(
          (item) => monthKey(item.date) === key,
        );
        const revenue =
          monthSales.reduce((sum, item) => sum + saleTotal(item), 0) +
          monthOnline.reduce(
            (sum, item) =>
              sum + number(item.salePriceCents) * number(item.quantity, 1),
            0,
          );
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
          monthOnline.reduce(
            (sum, item) =>
              sum +
              number(item.productionCostCents) * number(item.quantity, 1) +
              number(item.shippingCostCents),
            0,
          );
        const other = expenses
          .filter((item) => monthKey(item.date || item.invoiceDate) === key)
          .reduce(
            (sum, item) => sum + number(item.amountCents || item.priceCents),
            0,
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
              <Badge variant="outline">
                {monthSales.length + monthOnline.length} Verkäufe
              </Badge>
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
          </article>
        );
      })}
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
  onSave,
  onClose,
}: {
  editor: { entity: string; row: Row } | null;
  form: Row;
  setValue: (key: string, value: unknown) => void;
  data: Record<string, AreaData>;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
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
              {input('category', 'Kategorie')}
              {input('size', 'Größe')}
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
              {input('printer', 'Drucker')}
              {input('printMinutes', 'Druckzeit in Minuten', 'number')}
              {input('filamentGrams', 'Filament gesamt in g', 'number')}
              {input(
                'productionCostCents',
                'Produktionskosten in Cent',
                'number',
              )}
              {input('extraCostCents', 'Zusatzkosten in Cent', 'number')}
              {input('defaultPriceCents', 'Standardpreis in Cent', 'number')}
              {input('baseStockQuantity', 'Grundbestand', 'number')}
              {input('stockQuantity', 'Gesamtbestand', 'number')}
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
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">
                Notiz
                <Textarea
                  value={string(form.note)}
                  onChange={(event) => setValue('note', event.target.value)}
                  className="bg-white text-foreground"
                />
              </label>
              {editor.row.id ? (
                <ImageUpload
                  productId={string(editor.row.id)}
                  onUploaded={onClose}
                />
              ) : null}
              <ManufacturingEditor
                product={editor.row}
                materials={rows(data.products?.materials)}
                onChanged={onClose}
              />
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
            </>
          ) : null}
          {isMarket ? (
            <>
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
  onChanged,
}: {
  product: Row;
  materials: Row[];
  onChanged: () => void;
}) {
  const variants = rows(product.variants);
  const filaments = rows(product.filaments);
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
  }

  async function save() {
    if (!editing) return;
    const response = await fetch('/api/inventory/workspace', {
      method: editing.row.id == null ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: editing.entity,
        id: editing.row.id,
        values,
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(result.error || 'Ausführung konnte nicht gespeichert werden.');
      return;
    }
    onChanged();
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
            <Plus className="size-3.5" /> Ausführung
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => open('product_filaments')}
          >
            <Plus className="size-3.5" /> Filament
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {variants.map((variant) => (
          <button
            type="button"
            key={string(variant.id)}
            onClick={() => open('product_variants', variant)}
            className="rounded-xl border p-3 text-left text-sm transition hover:border-[var(--fp-primary)]"
          >
            <div className="flex items-center justify-between gap-2 font-medium">
              {string(variant.name, 'Standard')}
              <Pencil className="size-3.5" />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {[
                string(variant.appearance),
                string(variant.size),
                string(object(variant.material).name),
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div className="mt-2 flex gap-3 text-xs">
              <span>{number(variant.quantity)} Stück</span>
              <span>{number(variant.grams)} g</span>
              <span>{cents(variant.priceCents)}</span>
            </div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
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
      {!variants.length && !filaments.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Noch keine Ausführungen oder Filamente hinterlegt.
        </p>
      ) : null}
      {editing ? (
        <div className="mt-4 rounded-2xl border bg-[#f8f4ed] p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium">
              {editing.entity === 'product_variants'
                ? 'Ausführung'
                : 'Filament'}{' '}
              bearbeiten
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
                <Field
                  label="Produktionskosten in Cent"
                  type="number"
                  value={string(values.productionCostCents)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      productionCostCents: Number(value),
                    }))
                  }
                />
                <Field
                  label="Drucker"
                  value={string(values.printer)}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, printer: value }))
                  }
                />
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
                <Field
                  label="Rabatt in %"
                  type="number"
                  value={string(values.discountPercent)}
                  onChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      discountPercent: Number(value),
                    }))
                  }
                />
                <Field
                  label="Mangel / Fehler"
                  value={string(values.defectNote)}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, defectNote: value }))
                  }
                />
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
                <Field
                  label="Drucker"
                  value={string(values.printer)}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, printer: value }))
                  }
                />
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

function ImageUpload({
  productId,
  onUploaded,
}: {
  productId: string;
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
        <span className="block font-medium">Produktbild ersetzen</span>
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
  const [saleVariantId, setSaleVariantId] = useState('');
  const [saleQuantity, setSaleQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState('BAR');
  const [actionMessage, setActionMessage] = useState('');
  if (!market) return null;
  const articles = rows(data.articles).filter(
    (item) => string(item.marketId) === string(market.id),
  );
  const sales = rows(data.sales).filter(
    (item) => string(item.marketId) === string(market.id),
  );
  const expenses = rows(data.expenses).filter(
    (item) => string(item.marketId) === string(market.id),
  );
  const demands = rows(data.demands).filter(
    (item) => string(item.marketId) === string(market.id),
  );
  const revenue = sales.reduce((sum, item) => sum + saleTotal(item), 0);
  const costs = expenses.reduce(
    (sum, item) => sum + number(item.amountCents),
    0,
  );
  const stockProduct = products.find(
    (item) => string(item.id) === stockProductId,
  );
  const saleVariants = articles.flatMap((article) =>
    rows(article.variants).map((variant) => ({
      ...variant,
      articleName: string(article.name),
    })),
  );

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
      p_market_id: number(market.id),
      p_product_id: Number(stockProductId),
      p_menge: Math.trunc(Number(stockQuantity)),
      p_variant_id: stockVariantId ? Number(stockVariantId) : null,
    });
  }

  async function bookSale() {
    const variant = saleVariants.find(
      (item) => string(item.id) === saleVariantId,
    );
    const quantity = Math.trunc(Number(saleQuantity));
    if (!variant || quantity <= 0) return;
    await rpc('verkauf_buchen', {
      p_operation_id: crypto.randomUUID(),
      p_market_id: number(market.id),
      p_date: new Date().toISOString(),
      p_discount_cents: 0,
      p_pricing_mode: 'ITEMIZED',
      p_total_price_cents: null,
      p_payment_method: paymentMethod || null,
      p_note: null,
      p_zeilen: [
        {
          article_variant_id: number(variant.id),
          quantity,
          unit_sale_price_cents: number(variant.salePriceCents),
          unit_cost_price_cents: number(variant.costPriceCents),
          discount_percent: number(variant.discountPercent),
          component_choices: null,
        },
      ],
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
    anchor.download = `${string(market.name, 'markt')}.csv`;
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
            {string(market.name)}
          </DialogTitle>
          <DialogDescription>
            {string(market.location)} · {date(market.date)} –{' '}
            {date(market.endDate || market.date)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <CircleDollarSign className="size-4" /> CSV exportieren
          </Button>
          <Badge variant="outline">{string(market.status)}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat value={articles.length} label="Marktartikel" />
          <Stat value={sales.length} label="Verkäufe" />
          <Stat value={cents(revenue)} label="Umsatz" />
          <Stat value={cents(revenue - costs)} label="Ergebnis" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
                {products
                  .filter((item) => !item.archivedAt)
                  .map((item) => (
                    <option key={string(item.id)} value={string(item.id)}>
                      {string(item.name)}
                    </option>
                  ))}
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
          <section className="rounded-2xl border bg-white/60 p-4">
            <h3 className="font-medium">Schnellverkauf</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <select
                className="h-9 rounded-lg border bg-white px-3 text-sm sm:col-span-2"
                value={saleVariantId}
                onChange={(event) => setSaleVariantId(event.target.value)}
              >
                <option value="">Marktartikel wählen</option>
                {saleVariants.map((item) => (
                  <option key={string(item.id)} value={string(item.id)}>
                    {string(item.articleName)} ·{' '}
                    {string(item.color, 'Standard')} ·{' '}
                    {cents(item.salePriceCents)}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min="1"
                value={saleQuantity}
                onChange={(event) => setSaleQuantity(event.target.value)}
              />
              <select
                className="h-9 rounded-lg border bg-white px-3 text-sm"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option value="BAR">Bar</option>
                <option value="KARTE">Karte</option>
                <option value="PAYPAL">PayPal</option>
                <option value="">Nicht erfasst</option>
              </select>
              <Button
                className="sm:col-span-2"
                onClick={() => void bookSale()}
                disabled={!saleVariantId || Number(saleQuantity) <= 0}
              >
                Verkauf buchen
              </Button>
            </div>
          </section>
        </div>
        {actionMessage ? (
          <p className="text-sm text-muted-foreground">{actionMessage}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
