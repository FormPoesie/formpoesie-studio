'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { variantCostBreakdown } from '@/lib/inventory-production';
import { inventoryReviewStatus } from '@/lib/inventory-bridge';
import {
  applyRecommendationsToDraft,
  calculateAllChannelRecommendations,
  calculateDigitalRecommendation,
  calculateMarketCostPerSale,
  evaluatePortfolioSignals,
  suggestDefectScores,
  type DefectInputs,
  type DemandPerformanceInput,
  type ImpactType,
  type PortfolioSale,
  type PriceRecommendation,
} from '@/lib/pricing-engine';
import type {
  MarketCategory,
  MarketPsychology,
  SalesChannel,
} from '@/lib/pricing-config';

type Row = Record<string, unknown>;
type ChannelPsychologyMap = Record<SalesChannel, MarketPsychology>;
type ChannelMetricMap = Record<
  SalesChannel,
  { views30: string; favorites30: string; stockProduced90: string }
>;
type ChannelMarketMap = Record<
  SalesChannel,
  { demand: string; competition: string }
>;

const DEFAULT_CHANNEL_PSYCHOLOGY: ChannelPsychologyMap = {
  etsy: 'premium_seeking',
  direct: 'balanced',
  vinted: 'price_sensitive',
  ebay: 'balanced',
  market: 'balanced',
};

const CHANNEL_LABELS: Record<SalesChannel, string> = {
  etsy: 'Etsy',
  direct: 'Direkt',
  vinted: 'Vinted',
  ebay: 'eBay',
  market: 'Markt',
};

function emptyChannelMetrics(): ChannelMetricMap {
  return Object.fromEntries(
    (Object.keys(CHANNEL_LABELS) as SalesChannel[]).map((key) => [
      key,
      { views30: '', favorites30: '', stockProduced90: '' },
    ]),
  ) as ChannelMetricMap;
}

function emptyChannelMarket(): ChannelMarketMap {
  return Object.fromEntries(
    (Object.keys(CHANNEL_LABELS) as SalesChannel[]).map((key) => [
      key,
      { demand: 'unknown', competition: 'unknown' },
    ]),
  ) as ChannelMarketMap;
}

function normalizedSalesChannel(value: unknown): SalesChannel | null {
  const key = string(value).trim().toLocaleLowerCase('de');
  if (key.includes('etsy')) return 'etsy';
  if (key.includes('vinted')) return 'vinted';
  if (key.includes('ebay')) return 'ebay';
  if (key.includes('markt')) return 'market';
  if (
    key.includes('direkt') ||
    key.includes('abholung') ||
    key.includes('formular')
  )
    return 'direct';
  return null;
}

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
function euro(value: number | undefined | null) {
  return typeof value === 'number'
    ? new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
      }).format(value)
    : '–';
}
function percent(value: number | undefined | null) {
  return typeof value === 'number'
    ? new Intl.NumberFormat('de-DE', {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(value)
    : '–';
}
function numericInput(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

const categories: Array<{ value: MarketCategory; label: string }> = [
  { value: 'gothic', label: 'Gothic' },
  { value: 'figures', label: 'Figuren' },
  { value: 'historicalBusts', label: 'Historische Büsten' },
  { value: 'gifts', label: 'Geschenke' },
  { value: 'functional', label: 'Funktional' },
  { value: 'hollow', label: 'Hohlkörper / Vase' },
  { value: 'sets', label: 'Sets' },
  { value: 'smallItems', label: 'Kleinartikel' },
  { value: 'digital', label: 'Digital STL / 3MF' },
];

const affectedAreas = [
  'Unterseite',
  'Rückseite',
  'Sockel',
  'Ornament',
  'Kleidung',
  'Nebenobjekt',
  'Hand',
  'charakteristisches Zubehör',
  'Krone',
  'Hut',
  'Instrument',
  'Gesicht',
  'Augen',
  'Brille',
  'identitätsprägendes Detail',
  'tragendes Element',
  'funktionales Element',
];

function inferredCategory(product: Row): MarketCategory {
  const value =
    `${string(product.name)} ${string(product.category)} ${string(product.productType)}`.toLocaleLowerCase(
      'de',
    );
  if (/stl|3mf|digital/.test(value)) return 'digital';
  if (/goth|horror|skelett|totenkopf/.test(value)) return 'gothic';
  if (/büste|bueste|histor/.test(value)) return 'historicalBusts';
  if (/vase|hohl/.test(value)) return 'hollow';
  if (/set|mehrteilig/.test(value)) return 'sets';
  if (/funktion|halter|lampe|dose|schale/.test(value)) return 'functional';
  if (/geschenk/.test(value)) return 'gifts';
  if (/mini|klein|anhänger|anhaenger/.test(value)) return 'smallItems';
  return 'figures';
}

function inferredImpactType(
  product: Row,
  category: MarketCategory,
  tier = 'standard',
): ImpactType {
  const value =
    `${string(product.name)} ${string(product.category)} ${string(product.productType)}`.toLocaleLowerCase(
      'de',
    );
  if (
    tier === 'ultra' ||
    /eyecatcher|meisterwerk|hochdetaill|filigran|ornament/.test(value)
  )
    return 'PREMIUM_IMPACT';
  if (
    ['functional', 'smallItems', 'sets'].includes(category) ||
    /box|kiste|clip|halter|adapter|sockel/.test(value)
  )
    return 'SOLID';
  return 'DETAILED';
}

function Field({
  label,
  value,
  onChange,
  type = 'number',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-white"
      />
    </label>
  );
}

function ScoreField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {Math.round(value * 100)} %
        </span>
      </span>
      <input
        aria-label={label}
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-[var(--fp-primary)]"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border bg-white px-3 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultCard({
  result,
  currentPrice,
}: {
  result: PriceRecommendation | null;
  currentPrice: number | null;
}) {
  if (!result)
    return (
      <div className="rounded-2xl border border-dashed bg-white/45 p-8 text-center text-sm text-muted-foreground">
        Eingaben prüfen und eine Empfehlung berechnen.
      </div>
    );
  if (result.status === 'BLOCKED_LICENSE')
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 p-5">
        <div className="flex items-center gap-2 font-semibold text-red-800">
          <ShieldAlert className="size-5" /> Digitalverkauf blockiert
        </div>
        <p className="mt-2 text-sm text-red-700">
          Die digitale Weiterverkaufsfreigabe ist nicht eindeutig belegt.
        </p>
      </div>
    );
  if (result.recommendedPrice == null)
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-center gap-2 font-semibold text-amber-900">
          <AlertTriangle className="size-5" /> Preisempfehlung nicht verfügbar
        </div>
        <p className="mt-2 text-sm text-amber-800">
          Status {result.status}:{' '}
          {result.diagnostics.warnings?.join(' ') || 'Eingabedaten prüfen.'}
        </p>
      </div>
    );
  const safety = result.discountSafety;
  return (
    <div className="rounded-2xl border bg-white/70 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
            Empfohlener {result.channel}-Preis
          </p>
          <div className="mt-1 text-4xl font-semibold tabular-nums">
            {euro(result.recommendedPrice)}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Aktiver Preis: {euro(currentPrice)} · wird nicht automatisch
            geändert
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">Confidence {result.confidence}</Badge>
          {result.status !== 'OK' ? (
            <Badge className="bg-amber-100 text-amber-900">
              {result.status === 'REVIEW_MARKET_FIT'
                ? 'Marktfit prüfen'
                : 'Prüfung empfohlen'}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Herstellungskosten" value={euro(result.cogs)} />
        <Metric
          label="Mindestdeckungsbeitrag"
          value={euro(result.minimumContribution)}
        />
        <Metric
          label="Kanal-Floor"
          value={euro(result.floorPrice)}
          active={result.diagnostics.priceDriver === 'floor'}
        />
        <Metric
          label="Marktanker"
          value={euro(result.marketPrice)}
          active={result.diagnostics.priceDriver === 'market'}
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric
          label="Erwarteter Deckungsbeitrag"
          value={euro(result.expectedContribution)}
        />
        <Metric
          label="Marge am Verkaufspreis"
          value={percent(result.marginRate)}
        />
        <Metric label="Aufschlag auf COGS" value={percent(result.markupRate)} />
      </div>
      <div className="mt-5 rounded-xl bg-[var(--fp-mist)] p-4 text-sm">
        <p className="font-semibold">Warum dieser Preis?</p>
        <ul className="mt-2 grid gap-1 text-muted-foreground">
          <li>
            Preisbestimmend:{' '}
            {result.diagnostics.priceDriver === 'market'
              ? 'Marktanker'
              : 'wirtschaftlicher Kanal-Floor'}
          </li>
          {result.diagnostics.presenceFactor != null ? (
            <li>
              Präsenzfaktor {result.diagnostics.presenceFactor.toFixed(2)} ·
              Value-Faktor {result.diagnostics.valueFactor?.toFixed(2)}
            </li>
          ) : null}
          <li>
            Visuelle Wirkung {result.diagnostics.impactType || 'DETAILED'} ·
            Faktor {result.diagnostics.impactMultiplier?.toFixed(2) || '1.00'}
          </li>
          <li>
            Reale Nachfrage{' '}
            {result.diagnostics.demandPerformanceStatus || 'UNKNOWN'} · Faktor{' '}
            {result.diagnostics.demandIndex?.toFixed(2) || '1.00'}
          </li>
          <li>
            Plattformpsychologie{' '}
            {result.diagnostics.marketPsychology || 'balanced'} · Quantil-Shift{' '}
            {(result.diagnostics.marketPsychologyShift || 0) >= 0 ? '+' : ''}
            {result.diagnostics.marketPsychologyShift?.toFixed(2) || '0.00'}
          </li>
          {result.diagnostics.demandEvidence?.map((evidence) => (
            <li key={evidence}>Datengrundlage: {evidence}</li>
          ))}
          <li>
            Nachfrage/Konkurrenz{' '}
            {result.diagnostics.demandCompetitionFactor?.toFixed(2) ||
              'neutral'}
          </li>
          {result.diagnostics.warnings?.map((warning) => (
            <li key={warning}>⚠ {warning}</li>
          ))}
        </ul>
      </div>
      {safety ? (
        <div className="mt-5">
          <p className="text-sm font-semibold">
            Rabattprüfung nach tatsächlichen Gebühren
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              safety.tenPercent,
              safety.fifteenPercent,
              safety.twentyPercent,
            ].map((item) => (
              <div
                key={item.discountRate}
                className="rounded-xl border p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{Math.round(item.discountRate * 100)} % Sale</span>
                  <Badge
                    className={
                      item.state === 'GREEN'
                        ? 'bg-emerald-100 text-emerald-900'
                        : item.state === 'YELLOW'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-red-100 text-red-900'
                    }
                  >
                    {item.state}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  DB {euro(item.contribution)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Maximal sicherer Rabatt: {percent(safety.maximumSafeDiscount)}
          </p>
        </div>
      ) : null}
      {result.diagnostics.etsyScenarios ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {Object.entries(result.diagnostics.etsyScenarios).map(
            ([key, value]) => (
              <Badge variant="outline" key={key}>
                {key}: {euro(value)}
              </Badge>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  active = false,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div
      className={
        'rounded-xl border p-3 ' +
        (active ? 'border-[var(--fp-primary)] bg-[#eef2ef]' : 'bg-white')
      }
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
      {active ? (
        <div className="mt-1 text-xs text-[var(--fp-primary)]">
          preisbestimmend
        </div>
      ) : null}
    </div>
  );
}

function ChannelSummary({
  result,
  currentPrice,
  draftPrice,
  selected,
  onSelect,
}: {
  result: PriceRecommendation;
  currentPrice: number | null;
  draftPrice?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = CHANNEL_LABELS[result.channel];
  const difference =
    result.recommendedPrice != null && currentPrice != null
      ? result.recommendedPrice - currentPrice
      : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-[var(--fp-primary)] bg-[#eef2ef] shadow-sm' : 'bg-white/75 hover:border-[var(--fp-primary)]/45'}`}
    >
      <span className="flex items-center justify-between gap-2">
        <strong>{label}</strong>
        <Badge variant="outline">
          {result.diagnostics.priceDriver === 'floor' ? 'Floor' : 'Markt'}
        </Badge>
      </span>
      <span className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2 tabular-nums">
        <span>
          <small className="block text-muted-foreground">Aktuell</small>
          {euro(currentPrice)}
        </span>
        <span className="pb-0.5 text-muted-foreground">→</span>
        <span>
          <small className="block text-muted-foreground">Empfohlen</small>
          <strong>{euro(result.recommendedPrice)}</strong>
        </span>
      </span>
      <span className="mt-2 block text-xs text-muted-foreground">
        {difference == null
          ? 'Noch kein Vergleichspreis'
          : `${difference >= 0 ? '+' : ''}${euro(difference)}`}
        {' · '}Wirkung ×
        {result.diagnostics.impactMultiplier?.toFixed(2) || '1.00'}
        {' · '}Nachfrage ×{result.diagnostics.demandIndex?.toFixed(2) || '1.00'}
        {' · '}Psychologie{' '}
        {result.diagnostics.marketPsychology === 'price_sensitive'
          ? 'preisorientiert'
          : result.diagnostics.marketPsychology === 'premium_seeking'
            ? 'premium'
            : 'ausgewogen'}
      </span>
      {draftPrice != null ? (
        <span className="mt-2 block text-xs font-medium text-[var(--fp-primary)]">
          Im Draft: {euro(draftPrice)}
        </span>
      ) : null}
    </button>
  );
}

function ChannelMarketInputs({
  channel,
  market,
  psychology,
  metrics,
  performance,
  onMarketChange,
  onPsychologyChange,
  onMetricChange,
}: {
  channel: SalesChannel;
  market: ChannelMarketMap[SalesChannel];
  psychology: MarketPsychology;
  metrics: ChannelMetricMap[SalesChannel];
  performance: DemandPerformanceInput;
  onMarketChange: (
    key: keyof ChannelMarketMap[SalesChannel],
    value: string,
  ) => void;
  onPsychologyChange: (value: MarketPsychology) => void;
  onMetricChange: (
    key: keyof ChannelMetricMap[SalesChannel],
    value: string,
  ) => void;
}) {
  return (
    <div className="grid content-start gap-3 rounded-xl border bg-[var(--fp-paper)]/55 p-3">
      <p className="font-semibold">{CHANNEL_LABELS[channel]}</p>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Nachfrage"
          value={market.demand}
          onChange={(value) => onMarketChange('demand', value)}
          options={[
            { value: 'unknown', label: 'Unbekannt' },
            { value: 'niche', label: 'Nische' },
            { value: 'known', label: 'Bekannt' },
            { value: 'very_known', label: 'Sehr bekannt' },
            { value: 'trend', label: 'Trend' },
          ]}
        />
        <SelectField
          label="Konkurrenz"
          value={market.competition}
          onChange={(value) => onMarketChange('competition', value)}
          options={[
            { value: 'unknown', label: 'Unbekannt' },
            { value: 'low', label: 'Niedrig' },
            { value: 'medium', label: 'Mittel' },
            { value: 'high', label: 'Hoch' },
          ]}
        />
      </div>
      <SelectField
        label="Marktpsychologie"
        value={psychology}
        onChange={(value) => onPsychologyChange(value as MarketPsychology)}
        options={[
          { value: 'price_sensitive', label: 'Preisorientiert / vergleichend' },
          { value: 'balanced', label: 'Ausgewogene Zahlungsbereitschaft' },
          { value: 'premium_seeking', label: 'Premium- und Entdeckungsmarkt' },
        ]}
      />
      <div className="grid grid-cols-3 gap-2">
        <Field
          label="Klicks 30 T."
          value={metrics.views30}
          onChange={(value) => onMetricChange('views30', value)}
        />
        <Field
          label="Favoriten 30 T."
          value={metrics.favorites30}
          onChange={(value) => onMetricChange('favorites30', value)}
        />
        <Field
          label="Produziert 90 T."
          value={metrics.stockProduced90}
          onChange={(value) => onMetricChange('stockProduced90', value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {performance.sales30} Verkäufe/30 T. · {performance.sales90} Verkäufe/90
        T.
      </p>
    </div>
  );
}

function MarketWatch({ productId = '' }: { productId?: string }) {
  const [data, setData] = useState<Row>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    const response = await fetch(
      '/api/market-intelligence' +
        (productId ? `?productId=${encodeURIComponent(productId)}` : ''),
    );
    const payload = (await response.json()) as Row & { error?: string };
    if (!response.ok)
      throw new Error(
        payload.error || 'Market Watch konnte nicht geladen werden.',
      );
    setData(payload);
  }
  useEffect(() => {
    let cancelled = false;
    void load().catch((reason) => {
      if (!cancelled)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Market Watch konnte nicht geladen werden.',
        );
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);
  async function run() {
    setBusy(true);
    setError('');
    const response = await fetch('/api/market-intelligence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productId ? { productId } : {}),
    });
    const payload = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok)
      return setError(payload.error || 'Recherche fehlgeschlagen.');
    await load();
  }
  async function ignore(changeId: string) {
    const response = await fetch('/api/market-intelligence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ignore-change', changeId }),
    });
    if (response.ok) await load();
  }
  const runData = object(data.lastRun);
  const counts = object(data.counts);
  const changes = rows(data.changes);
  const impacts = rows(data.pricingImpacts);
  const statusLabel =
    (
      {
        SUCCESS: 'Erfolgreich',
        PARTIAL: 'Teilweise',
        RESEARCH_FAILED: 'Fehler',
        RUNNING: 'Läuft',
        INSUFFICIENT_DATA: 'Zu wenig Vergleichsdaten',
        LOW_CONFIDENCE: 'Geringe Sicherheit',
        COMPLETED_NO_CHANGE: 'Geprüft, keine Änderung',
        COMPLETED_PRICE_SIGNAL: 'Neue Preisempfehlung',
      } as Record<string, string>
    )[string(runData.status)] || 'Noch kein Lauf';
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-3xl">Market Watch</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {productId
              ? 'Gezielte Artikelrecherche'
              : 'Sortimentsgesteuerte Wochenrecherche'}{' '}
            · aktive Preise bleiben unverändert
          </p>
        </div>
        <Button variant="outline" onClick={() => void run()} disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}{' '}
          {productId ? 'Artikel neu recherchieren' : 'Jetzt recherchieren'}
        </Button>
      </div>
      <div className="rounded-2xl border bg-white/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">
              Letzter Lauf
            </p>
            <p className="mt-1 font-semibold">
              {runData.finishedAt
                ? new Date(string(runData.finishedAt)).toLocaleString('de-DE')
                : 'Noch keine Baseline'}
            </p>
          </div>
          <Badge variant="outline">{statusLabel}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Metric label="Cluster" value={string(runData.clusterCount, '0')} />
          <Metric
            label="Beobachtungen"
            value={string(runData.comparableCount, '0')}
          />
          <Metric label="Änderungen" value={string(runData.changeCount, '0')} />
          <Metric
            label="Neue Segmente"
            value={string(counts.newSegments, '0')}
          />
          <Metric
            label="Bestätigte Trends"
            value={string(counts.confirmedTrends, '0')}
          />
          <Metric
            label="Verworfene Trends"
            value={string(counts.rejectedTrends, '0')}
          />
          <Metric
            label="Preisupdates"
            value={string(counts.pricingUpdates, '0')}
          />
        </div>
        {error ? (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {error}
          </p>
        ) : null}
      </div>
      {changes.map((change) => {
        const after = object(change.after);
        const changeImpacts = impacts.filter(
          (impact) => string(impact.marketChangeId) === string(change.id),
        );
        return (
          <article
            key={string(change.id)}
            className="rounded-2xl border bg-white/70 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-5 text-[var(--fp-primary)]" />
                  <h3 className="font-semibold">
                    {string(change.changeType) === 'MAJOR_CHANGE'
                      ? 'Wichtige Marktveränderung'
                      : 'Relevante Marktveränderung'}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Recherche{' '}
                  {change.detectedAt
                    ? new Date(string(change.detectedAt)).toLocaleString(
                        'de-DE',
                      )
                    : '–'}
                </p>
              </div>
              <Badge variant="outline">
                Confidence {string(change.confidence)}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric
                label="Marktmedian"
                value={
                  after.medianCents == null
                    ? '–'
                    : euro(number(after.medianCents) / 100)
                }
              />
              <Metric
                label="Nachfrage"
                value={
                  after.externalDemandScore == null
                    ? 'unbekannt'
                    : percent(number(after.externalDemandScore))
                }
              />
              <Metric
                label="Konkurrenz"
                value={
                  after.competitionScore == null
                    ? 'unbekannt'
                    : percent(number(after.competitionScore))
                }
              />
              <Metric
                label="Trend"
                value={
                  after.adjustedTrend == null
                    ? 'Baseline'
                    : `${number(after.adjustedTrend) > 0 ? '+' : ''}${number(after.adjustedTrend).toFixed(2)}`
                }
              />
            </div>
            {changeImpacts.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4">Variante</th>
                      <th className="py-2 pr-4">Kanal</th>
                      <th className="py-2 pr-4">Alt</th>
                      <th className="py-2 pr-4">Neu</th>
                      <th className="py-2">Änderung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changeImpacts.map((impact) => (
                      <tr key={string(impact.id)} className="border-t">
                        <td className="py-2 pr-4">
                          {string(impact.variantId, 'Standard')}
                        </td>
                        <td className="py-2 pr-4">{string(impact.channel)}</td>
                        <td className="py-2 pr-4">
                          {impact.previousRecommendationCents == null
                            ? '–'
                            : euro(
                                number(impact.previousRecommendationCents) /
                                  100,
                              )}
                        </td>
                        <td className="py-2 pr-4">
                          {impact.newRecommendationCents == null
                            ? '–'
                            : euro(number(impact.newRecommendationCents) / 100)}
                        </td>
                        <td className="py-2">
                          {impact.percentageDifference == null
                            ? '–'
                            : percent(number(impact.percentageDifference))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Keine belastbare Preisneuberechnung verfügbar; aktive Preise
                wurden nicht verändert.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm">Neue Empfehlungen prüfen</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void ignore(string(change.id))}
              >
                Ignorieren
              </Button>
            </div>
            <details className="mt-4 rounded-xl border bg-white p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Quellen & Analyse anzeigen
              </summary>
              <ul className="mt-3 grid gap-2 text-xs text-muted-foreground">
                {(Array.isArray(change.explanations)
                  ? change.explanations
                  : []
                ).map((item) => (
                  <li key={string(item)}>{string(item)}</li>
                ))}
                {(Array.isArray(change.sources) ? change.sources : []).map(
                  (source) => (
                    <li key={string(source)}>
                      <a
                        className="break-all underline"
                        href={string(source)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {string(source)}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            </details>
          </article>
        );
      })}
      {!changes.length ? (
        <div className="rounded-2xl border border-dashed bg-white/45 p-8 text-center text-sm text-muted-foreground">
          {productId
            ? 'Für diesen Artikel liegt kein relevantes Marktupdate vor.'
            : 'Noch keine relevanten Marktveränderungen. Die erste erfolgreiche Recherche erzeugt nur eine Baseline.'}
        </div>
      ) : null}
    </div>
  );
}

export function PricingWorkspace({ data }: { data: Row }) {
  const products = rows(data.products).filter(
    (product) =>
      !product.archivedAt &&
      inventoryReviewStatus(product.studioStatus) === 'final',
  );
  const components = rows(data.components);
  const [productId, setProductId] = useState('');
  const product =
    products.find((item) => string(item.id) === productId) || products[0] || {};
  const variants = rows(product.variants);
  const [variantId, setVariantId] = useState('');
  const variant =
    variants.find((item) => string(item.id) === variantId) || variants[0] || {};
  const cogs =
    variantCostBreakdown(product, variant, products, components).totalCents /
    100;
  const currentPrice =
    number(variant.priceCents || product.defaultPriceCents) / 100 || null;
  const [category, setCategory] = useState<MarketCategory>('figures');
  const [productKind, setProductKind] = useState<'physical' | 'digital'>(
    'physical',
  );
  const [channel, setChannel] = useState<SalesChannel>('etsy');
  const [channelScope, setChannelScope] = useState<SalesChannel | 'all'>('all');
  const [tier, setTier] = useState('standard');
  const [impactType, setImpactType] = useState<ImpactType>('DETAILED');
  const [channelPsychology, setChannelPsychology] =
    useState<ChannelPsychologyMap>(DEFAULT_CHANNEL_PSYCHOLOGY);
  const [channelMetrics, setChannelMetrics] =
    useState<ChannelMetricMap>(emptyChannelMetrics);
  const [season, setSeason] = useState('');
  const [assetId, setAssetId] = useState('');
  const [newAssetName, setNewAssetName] = useState('');
  const [pricingData, setPricingData] = useState<Row>({});
  const [channelMarket, setChannelMarket] =
    useState<ChannelMarketMap>(emptyChannelMarket);
  const { demand, competition } = channelMarket[channel];
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [buyerShipping, setBuyerShipping] = useState('0');
  const [offsite, setOffsite] = useState('0');
  const [standFee, setStandFee] = useState('0');
  const [travelCost, setTravelCost] = useState('0');
  const [marketExtra, setMarketExtra] = useState('0');
  const [expectedSales, setExpectedSales] = useState('10');
  const [values, setValues] = useState({
    complexity: 0.5,
    functionValue: 0.5,
    giftValue: 0.5,
    collectorValue: 0.5,
    personalization: 0,
    finish: 0.5,
  });
  const [digitalValues, setDigitalValues] = useState({
    modelComplexity: 0.5,
    demand: 0.5,
    differentiation: 0.5,
    utility: 0.5,
    printReadiness: 0.5,
  });
  const [redistribution, setRedistribution] = useState(false);
  const [licenseEvidence, setLicenseEvidence] = useState('');
  const [leadProduct, setLeadProduct] = useState(false);
  const [priceDraft, setPriceDraft] = useState<
    Partial<Record<SalesChannel, number>>
  >({});
  const [savedPrices, setSavedPrices] = useState<
    Partial<Record<SalesChannel, number>>
  >({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [affectedArea, setAffectedArea] = useState('Unterseite');
  const [visibility, setVisibility] = useState<
    'kaum' | 'leicht' | 'deutlich' | 'sehr' | 'identitaet'
  >('leicht');
  const [defects, setDefects] = useState<DefectInputs>(() =>
    suggestDefectScores('Unterseite', 'leicht'),
  );
  const [safetyRisk, setSafetyRisk] = useState(false);
  const [structural, setStructural] = useState(false);
  const [functionLost, setFunctionLost] = useState(false);
  const [disclosable, setDisclosable] = useState(true);
  const [futureCosts, setFutureCosts] = useState('2');
  const [bWareResult, setBWareResult] = useState<Row | null>(null);

  const selectedProductId = string(product.id);
  const selectedDepthMm = number(product.depthMm);
  const selectedWidthMm = number(product.widthMm);
  const selectedHeightMm = number(product.heightMm);
  const selectedProductCategory = string(product.category);

  useEffect(() => {
    if (!selectedProductId) return;
    let cancelled = false;
    void fetch(`/api/pricing?productId=${encodeURIComponent(selectedProductId)}`)
      .then(async (response) => {
        const payload = (await response.json()) as Row & { error?: string };
        if (!response.ok)
          throw new Error(
            payload.error || 'Pricing-Profile konnten nicht geladen werden.',
          );
        if (cancelled) return;
        setPricingData(payload);
        const profile = rows(payload.profiles).find(
          (item) => string(item.inventoryProductId) === selectedProductId,
        );
        const fallbackCategory = inferredCategory({
          category: selectedProductCategory,
        });
        const savedValue = object(profile?.value);
        const savedPerformance = object(savedValue.performance);
        const savedPerformanceByChannel = object(
          savedValue.performanceByChannel,
        );
        const savedChannelMarket = object(savedValue.channelMarket);
        const savedPsychology = object(savedValue.channelPsychology);
        const savedLicense = object(profile?.license);
        const savedAsset = rows(payload.assets).find(
          (item) => string(item.id) === string(profile?.assetId),
        );
        setCategory(
          (string(profile?.marketCategory) as MarketCategory) ||
            (string(savedAsset?.category) as MarketCategory) ||
            fallbackCategory,
        );
        setProductKind(
          string(profile?.productKind) === 'digital' ||
            fallbackCategory === 'digital'
            ? 'digital'
            : 'physical',
        );
        setTier(string(profile?.tier, 'standard'));
        const nextTier = string(profile?.tier, 'standard');
        const savedImpact = string(profile?.shapeType) as ImpactType;
        setImpactType(
          ['SOLID', 'DETAILED', 'PREMIUM_IMPACT'].includes(savedImpact)
            ? savedImpact
            : inferredImpactType(product, fallbackCategory, nextTier),
        );
        setChannelMetrics(
          Object.fromEntries(
            (Object.keys(CHANNEL_LABELS) as SalesChannel[]).map((key) => {
              const saved = object(savedPerformanceByChannel[key]);
              const legacy = key === 'etsy' ? savedPerformance : {};
              return [
                key,
                {
                  views30:
                    saved.views30 == null
                      ? legacy.views30 == null
                        ? ''
                        : string(legacy.views30)
                      : string(saved.views30),
                  favorites30:
                    saved.favorites30 == null
                      ? legacy.favorites30 == null
                        ? ''
                        : string(legacy.favorites30)
                      : string(saved.favorites30),
                  stockProduced90:
                    saved.stockProduced90 == null
                      ? legacy.stockProduced90 == null
                        ? ''
                        : string(legacy.stockProduced90)
                      : string(saved.stockProduced90),
                },
              ];
            }),
          ) as ChannelMetricMap,
        );
        setChannelPsychology({
          ...DEFAULT_CHANNEL_PSYCHOLOGY,
          ...Object.fromEntries(
            (Object.keys(DEFAULT_CHANNEL_PSYCHOLOGY) as SalesChannel[])
              .map((key) => [key, string(savedPsychology[key])])
              .filter(([, value]) =>
                ['price_sensitive', 'balanced', 'premium_seeking'].includes(
                  value,
                ),
              ),
          ),
        } as ChannelPsychologyMap);
        setSeason(string(profile?.season));
        const legacyDemand =
          string(profile?.demand) !== 'unknown' && string(profile?.demand)
            ? string(profile?.demand)
            : string(savedAsset?.demand, 'unknown');
        const legacyCompetition =
          string(profile?.competition) !== 'unknown' &&
          string(profile?.competition)
            ? string(profile?.competition)
            : string(savedAsset?.competition, 'unknown');
        setChannelMarket(
          Object.fromEntries(
            (Object.keys(CHANNEL_LABELS) as SalesChannel[]).map((key) => {
              const saved = object(savedChannelMarket[key]);
              return [
                key,
                {
                  demand: string(saved.demand, legacyDemand),
                  competition: string(saved.competition, legacyCompetition),
                },
              ];
            }),
          ) as ChannelMarketMap,
        );
        setAssetId(string(profile?.assetId));
        setLength(
          profile?.lengthCm != null
            ? string(profile.lengthCm)
            : selectedDepthMm
              ? String(selectedDepthMm / 10)
              : '',
        );
        setWidth(
          profile?.widthCm != null
            ? string(profile.widthCm)
            : selectedWidthMm
              ? String(selectedWidthMm / 10)
              : '',
        );
        setHeight(
          profile?.heightCm != null
            ? string(profile.heightCm)
            : selectedHeightMm
              ? String(selectedHeightMm / 10)
              : '',
        );
        if (Object.keys(savedValue).length)
          setValues((current) => ({
            ...current,
            ...Object.fromEntries(
              Object.entries(savedValue).filter(
                ([key, value]) => key in current && typeof value === 'number',
              ),
            ),
          }));
        if (Object.keys(savedValue).length)
          setDigitalValues((current) => ({
            ...current,
            ...Object.fromEntries(
              Object.entries(savedValue).filter(
                ([key, value]) => key in current && typeof value === 'number',
              ),
            ),
          }));
        setRedistribution(savedLicense.digitalRedistributionAllowed === true);
        setLicenseEvidence(string(savedLicense.evidence));
      })
      .catch((reason) => {
        if (!cancelled)
          setMessage(
            reason instanceof Error
              ? reason.message
              : 'Pricing-Daten konnten nicht geladen werden.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [
    selectedProductId,
    selectedDepthMm,
    selectedWidthMm,
    selectedHeightMm,
    selectedProductCategory,
  ]);

  function selectProduct(nextId: string) {
    const nextProduct =
      products.find((item) => string(item.id) === nextId) || {};
    const nextVariant = rows(nextProduct.variants)[0];
    const nextCategory = inferredCategory(nextProduct);
    setProductId(nextId);
    setVariantId(string(nextVariant?.id));
    setCategory(nextCategory);
    setProductKind(nextCategory === 'digital' ? 'digital' : 'physical');
    setImpactType(inferredImpactType(nextProduct, nextCategory));
    setChannelPsychology(DEFAULT_CHANNEL_PSYCHOLOGY);
    setChannelMetrics(emptyChannelMetrics());
    setChannelMarket(emptyChannelMarket());
    setLength(
      number(nextProduct.depthMm)
        ? String(number(nextProduct.depthMm) / 10)
        : '',
    );
    setWidth(
      number(nextProduct.widthMm)
        ? String(number(nextProduct.widthMm) / 10)
        : '',
    );
    setHeight(
      number(nextProduct.heightMm)
        ? String(number(nextProduct.heightMm) / 10)
        : '',
    );
    setPriceDraft({});
    setSavedPrices({});
  }

  function updateDefectDefaults(area: string, level: typeof visibility) {
    setDefects(suggestDefectScores(area, level));
  }

  const portfolioSales = useMemo(
    () => normalizePortfolio(data, rows(pricingData.profiles)),
    [data, pricingData.profiles],
  );
  const demandPerformanceByChannel = useMemo(() => {
    const now = Date.now();
    const liveSince = new Date(
      string(product.finalizedAt || product.createdAt),
    ).getTime();
    return Object.fromEntries(
      (Object.keys(CHANNEL_LABELS) as SalesChannel[]).map((nextChannel) => {
        const relevant = portfolioSales.filter(
          (sale) =>
            sale.productId === selectedProductId &&
            (!sale.variantId || !variantId || sale.variantId === variantId) &&
            normalizedSalesChannel(sale.channel) === nextChannel,
        );
        const quantity = (fromDays: number, toDays: number) =>
          relevant.reduce((sum, sale) => {
            const age = (now - new Date(sale.soldAt).getTime()) / 86_400_000;
            return age >= fromDays && age < toDays ? sum + sale.quantity : sum;
          }, 0);
        const metrics = channelMetrics[nextChannel];
        return [
          nextChannel,
          {
            sales30: quantity(0, 30),
            previous30: quantity(30, 60),
            sales90: quantity(0, 90),
            views30: metrics.views30 ? numericInput(metrics.views30) : null,
            favorites30: metrics.favorites30
              ? numericInput(metrics.favorites30)
              : null,
            stockProduced90: metrics.stockProduced90
              ? numericInput(metrics.stockProduced90)
              : null,
            daysObserved: Number.isFinite(liveSince)
              ? Math.max(1, Math.min(90, (now - liveSince) / 86_400_000))
              : 30,
          },
        ];
      }),
    ) as Record<SalesChannel, DemandPerformanceInput>;
  }, [portfolioSales, selectedProductId, variantId, product, channelMetrics]);

  const marketCost = useMemo(
    () =>
      calculateMarketCostPerSale(
        numericInput(standFee),
        numericInput(travelCost),
        numericInput(marketExtra),
        Math.max(1, numericInput(expectedSales)),
      ),
    [standFee, travelCost, marketExtra, expectedSales],
  );
  const profile = useMemo(
    () => ({
      assetId: assetId || null,
      productKind,
      marketCategory: category,
      tier,
      season: season || null,
      demand: channelMarket.etsy.demand,
      competition: channelMarket.etsy.competition,
      shapeType: impactType,
      lengthCm: numericInput(length) || null,
      widthCm: numericInput(width) || null,
      heightCm: numericInput(height) || null,
      value:
        productKind === 'digital'
          ? {
              ...digitalValues,
              channelPsychology,
              channelMarket,
              performanceByChannel: channelMetrics,
            }
          : {
              ...values,
              channelPsychology,
              channelMarket,
              performanceByChannel: channelMetrics,
            },
      license: {
        isOwnDesign: !string(product.designerId),
        physicalCommercialUseAllowed: true,
        digitalRedistributionAllowed: redistribution,
        buyerCommercialUseAllowed: false,
        evidence: licenseEvidence || undefined,
      },
    }),
    [
      assetId,
      productKind,
      category,
      tier,
      season,
      channelMarket,
      impactType,
      channelPsychology,
      length,
      width,
      height,
      digitalValues,
      values,
      redistribution,
      licenseEvidence,
      channelMetrics,
      product.designerId,
    ],
  );
  const calculatedRecommendations = useMemo(() => {
    const channels: SalesChannel[] = [
      'etsy',
      'direct',
      'vinted',
      'ebay',
      'market',
    ];
    if (productKind === 'digital') {
      return Object.fromEntries(
        channels.map((nextChannel) => [
          nextChannel,
          calculateDigitalRecommendation({
            channel: nextChannel,
            license: profile.license,
            ...digitalValues,
            competition: channelMarket[nextChannel].competition as
              | 'low'
              | 'medium'
              | 'high'
              | 'unknown',
            demandClass: channelMarket[nextChannel].demand as
              | 'niche'
              | 'known'
              | 'very_known'
              | 'trend'
              | 'unknown',
            marketPsychology: channelPsychology[nextChannel],
            isLeadProduct: leadProduct,
          }),
        ]),
      ) as Record<SalesChannel, PriceRecommendation>;
    }
    return calculateAllChannelRecommendations({
      cogs,
      category: category === 'digital' ? 'figures' : category,
      tier: tier as 'standard' | 'premium' | 'ultra',
      lengthCm: numericInput(length) || null,
      widthCm: numericInput(width) || null,
      heightCm: numericInput(height) || null,
      hollowBody: category === 'hollow',
      highEndCollector: tier === 'ultra',
      value: values,
      impactType,
      demandPerformanceByChannel,
      demand: demand as 'niche' | 'known' | 'very_known' | 'trend' | 'unknown',
      competition: competition as 'low' | 'medium' | 'high' | 'unknown',
      demandByChannel: Object.fromEntries(
        (Object.keys(CHANNEL_LABELS) as SalesChannel[]).map((key) => [
          key,
          channelMarket[key].demand,
        ]),
      ) as Record<
        SalesChannel,
        'niche' | 'known' | 'very_known' | 'trend' | 'unknown'
      >,
      competitionByChannel: Object.fromEntries(
        (Object.keys(CHANNEL_LABELS) as SalesChannel[]).map((key) => [
          key,
          channelMarket[key].competition,
        ]),
      ) as Record<SalesChannel, 'low' | 'medium' | 'high' | 'unknown'>,
      marketPsychologyByChannel: channelPsychology,
      buyerShipping: numericInput(buyerShipping),
      channelNonCogsCost: 0,
      channelNonCogsCosts: { market: marketCost },
      parameterSources: {
        cogs: 'AUTO',
        dimensions: length && width && height ? 'AUTO' : 'REVIEW',
        category: 'AUTO',
        tier: 'DEFAULT',
        demand: demand === 'unknown' ? 'DEFAULT' : 'MANUAL',
        competition: competition === 'unknown' ? 'DEFAULT' : 'MANUAL',
        value: 'AUTO',
      },
    });
  }, [
    productKind,
    profile,
    digitalValues,
    competition,
    demand,
    channelMarket,
    leadProduct,
    channelPsychology,
    cogs,
    category,
    tier,
    length,
    width,
    height,
    values,
    impactType,
    demandPerformanceByChannel,
    buyerShipping,
    marketCost,
  ]);
  const persistedMarketRecommendations = useMemo(() => {
    const result: Partial<Record<SalesChannel, PriceRecommendation>> = {};
    for (const row of rows(pricingData.recommendations)) {
      if (
        string(row.inventoryProductId) !== selectedProductId ||
        string(row.inventoryVariantId) !== string(variant.id) ||
        string(row.status) !== 'MARKET_UPDATED_REVIEW' ||
        !row.marketChangeId
      )
        continue;
      const nextChannel = normalizedSalesChannel(row.channel);
      if (nextChannel && !result[nextChannel])
        result[nextChannel] = object(
          row.result,
        ) as unknown as PriceRecommendation;
    }
    return result;
  }, [pricingData.recommendations, selectedProductId, variant.id]);
  const recommendations = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(CHANNEL_LABELS) as SalesChannel[]).map((nextChannel) => [
          nextChannel,
          persistedMarketRecommendations[nextChannel] ||
            calculatedRecommendations[nextChannel],
        ]),
      ) as Record<SalesChannel, PriceRecommendation>,
    [calculatedRecommendations, persistedMarketRecommendations],
  );
  const latestAnalysisJob = useMemo(
    () =>
      rows(pricingData.marketAnalysisJobs).find(
        (job) => string(job.productId) === selectedProductId,
      ) || null,
    [pricingData.marketAnalysisJobs, selectedProductId],
  );
  const analysisInProgress = ['QUEUED', 'RUNNING'].includes(
    string(latestAnalysisJob?.status),
  );
  const hasPersistedMarketRecommendation =
    Object.keys(persistedMarketRecommendations).length > 0;
  const latestAnalysisSucceeded = [
    'COMPLETED',
    'COMPLETED_NO_CHANGE',
    'COMPLETED_PRICE_SIGNAL',
  ].includes(string(latestAnalysisJob?.status));
  const marketResultUnavailable =
    Boolean(latestAnalysisJob) &&
    (!latestAnalysisSucceeded || !hasPersistedMarketRecommendation);
  const result = recommendations[channel];

  useEffect(() => {
    if (!analysisInProgress) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/pricing?productId=${encodeURIComponent(selectedProductId)}`)
        .then(async (response) => {
          if (response.ok) setPricingData((await response.json()) as Row);
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [analysisInProgress, selectedProductId]);

  function currentPriceForChannel(nextChannel: SalesChannel) {
    if (savedPrices[nextChannel] != null)
      return savedPrices[nextChannel] as number;
    const key = (
      {
        direct: 'directPriceCents',
        etsy: 'etsyPriceCents',
        vinted: 'vintedPriceCents',
        ebay: 'ebayPriceCents',
        market: 'marketPriceCents',
      } as const
    )[nextChannel];
    return (
      number(variant[key] ?? variant.priceCents ?? product.defaultPriceCents) /
        100 || null
    );
  }

  function applyRecommendations() {
    setPriceDraft((current) =>
      applyRecommendationsToDraft(current, recommendations),
    );
    setMessage(
      'Empfehlungen wurden in den lokalen Artikeldraft übernommen. Noch nichts gespeichert.',
    );
  }

  async function savePrices() {
    if (!Object.keys(priceDraft).length) {
      setMessage('Bitte zuerst „Preise übernehmen“ wählen.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const profileResponse = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-profile',
          productId: string(product.id),
          profile,
        }),
      });
      if (!profileResponse.ok)
        throw new Error('Pricing-Profil konnte nicht gespeichert werden.');
      const centsValue = (value: number | undefined) =>
        value == null ? undefined : Math.round(value * 100);
      const response = await fetch('/api/inventory/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'product_variants',
          id: variant.id,
          values: {
            priceCents: centsValue(priceDraft.direct),
            directPriceCents: centsValue(priceDraft.direct),
            etsyPriceCents: centsValue(priceDraft.etsy),
            vintedPriceCents: centsValue(priceDraft.vinted),
            ebayPriceCents: centsValue(priceDraft.ebay),
            marketPriceCents: centsValue(priceDraft.market),
          },
        }),
      });
      if (!response.ok)
        throw new Error('Kanalpreise konnten nicht gespeichert werden.');
      const historyResponses = await Promise.all(
        Object.entries(recommendations).map(([nextChannel, item]) =>
          fetch('/api/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action:
                productKind === 'digital'
                  ? 'recommend-digital'
                  : 'recommend-physical',
              productId: string(product.id),
              variantId: string(variant.id),
              activePrice: currentPriceForChannel(nextChannel as SalesChannel),
              input:
                productKind === 'digital'
                  ? {
                      channel: nextChannel,
                      license: profile.license,
                      ...digitalValues,
                      competition:
                        channelMarket[nextChannel as SalesChannel].competition,
                      demandClass:
                        channelMarket[nextChannel as SalesChannel].demand,
                      marketPsychology:
                        channelPsychology[nextChannel as SalesChannel],
                      isLeadProduct: leadProduct,
                    }
                  : {
                      cogs,
                      channel: nextChannel,
                      category: category === 'digital' ? 'figures' : category,
                      tier,
                      lengthCm: numericInput(length) || null,
                      widthCm: numericInput(width) || null,
                      heightCm: numericInput(height) || null,
                      hollowBody: category === 'hollow',
                      highEndCollector: tier === 'ultra',
                      value: values,
                      impactType,
                      demandPerformance:
                        demandPerformanceByChannel[nextChannel as SalesChannel],
                      demand: channelMarket[nextChannel as SalesChannel].demand,
                      competition:
                        channelMarket[nextChannel as SalesChannel].competition,
                      marketPsychology:
                        channelPsychology[nextChannel as SalesChannel],
                      buyerShipping: numericInput(buyerShipping),
                      channelNonCogsCost:
                        nextChannel === 'market' ? marketCost : 0,
                    },
              result: item,
            }),
          }),
        ),
      );
      if (historyResponses.some((item) => !item.ok))
        throw new Error(
          'Preise wurden gespeichert, aber die Empfehlungshistorie ist unvollständig.',
        );
      setSavedPrices(priceDraft);
      setPriceDraft({});
      setMessage(
        'Alle bestätigten Kanalpreise wurden gespeichert; Empfehlungshistorie wurde angelegt.',
      );
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Preise konnten nicht gespeichert werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  function calculate() {
    applyRecommendations();
  }

  async function calculateBWare() {
    const normalPrice = result?.recommendedPrice || currentPrice;
    if (!normalPrice) {
      setMessage('Zuerst einen regulären Preis berechnen.');
      return;
    }
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate-bware',
        productId: string(product.id),
        variantId: string(variant.id),
        affectedArea,
        input: {
          normalPrice,
          channel,
          defects,
          safetyRisk,
          structurallyUnreliable: structural,
          mainFunctionLost: functionLost,
          defectCanBeClearlyDisclosed: disclosable,
          futureNonFeeCosts: numericInput(futureCosts),
          buyerShipping: numericInput(buyerShipping),
          collectible: tier === 'ultra',
        },
      }),
    });
    const payload = (await response.json()) as { error?: string; result?: Row };
    setBusy(false);
    if (!response.ok)
      setMessage(payload.error || 'B-Ware-Prüfung fehlgeschlagen.');
    else {
      setBWareResult(payload.result || null);
      setMessage('B-Ware-Prüfung gespeichert.');
    }
  }

  async function createAsset() {
    const name = newAssetName.trim();
    if (!name) return;
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save-asset',
        asset: { name, category, demand, competition },
      }),
    });
    const payload = (await response.json()) as { error?: string; id?: string };
    setBusy(false);
    if (!response.ok)
      setMessage(payload.error || 'Asset konnte nicht gespeichert werden.');
    else {
      setAssetId(payload.id || '');
      setNewAssetName('');
      const refreshed = await fetch(
        `/api/pricing?productId=${encodeURIComponent(selectedProductId)}`,
      );
      if (refreshed.ok) setPricingData((await refreshed.json()) as Row);
      setMessage('Motiv-/Personen-Asset angelegt und ausgewählt.');
    }
  }

  const signals = useMemo(
    () =>
      evaluatePortfolioSignals(
        portfolioSales,
        new Date(),
        currentPortfolioSeason(),
      ),
    [portfolioSales],
  );
  const recommendationValues = Object.values(recommendations);
  const hasRecommendation = recommendationValues.some(
    (recommendation) => recommendation.recommendedPrice != null,
  );
  const sharedBlocker =
    recommendationValues.length > 0 &&
    recommendationValues.every(
      (recommendation) =>
        recommendation.recommendedPrice == null &&
        recommendation.status === recommendationValues[0]?.status,
    );

  if (!products.length)
    return (
      <section className="mt-6 grid gap-5">
        <MarketWatch />
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Preisempfehlungen werden ausschließlich für finalisierte Artikel
          erstellt. Entwürfe und Kundenaufträge bleiben außen vor.
        </div>
      </section>
    );

  return (
    <section className="mt-6">
      <div className="grid gap-3 rounded-2xl border bg-white/60 p-4 lg:grid-cols-[2fr_1fr_1fr]">
        <SelectField
          label="Artikel"
          value={string(product.id)}
          onChange={selectProduct}
          options={products.map((item) => ({
            value: string(item.id),
            label: string(item.name, 'Unbenannter Artikel'),
          }))}
        />
        <SelectField
          label="Variante"
          value={string(variant.id)}
          onChange={(value) => {
            setVariantId(value);
            setPriceDraft({});
          }}
          options={(variants.length ? variants : [{}]).map((item, index) => ({
            value: string(item.id, `standard-${index}`),
            label: string(item.name || item.size, 'Standard'),
          }))}
        />
        <SelectField
          label="Plattformauswahl"
          value={channelScope}
          onChange={(value) => {
            const next = value as SalesChannel | 'all';
            setChannelScope(next);
            if (next !== 'all') setChannel(next);
            setPriceDraft({});
          }}
          options={[
            { value: 'all', label: 'Alle Kanäle gleichzeitig' },
            { value: 'etsy', label: 'Etsy' },
            { value: 'direct', label: 'Direkt' },
            { value: 'vinted', label: 'Vinted' },
            { value: 'ebay', label: 'eBay' },
            { value: 'market', label: 'Markt' },
          ]}
        />
      </div>
      <Tabs defaultValue="pricing" className="mt-5">
        <TabsList className="max-w-full gap-1 overflow-x-auto p-1">
          <TabsTrigger value="pricing" className="gap-2 px-3">
            <CircleDollarSign className="size-4" /> Preis
          </TabsTrigger>
          <TabsTrigger value="market-watch" className="gap-2 px-3">
            <BarChart3 className="size-4" /> Market Watch
          </TabsTrigger>
          <TabsTrigger value="bware" className="gap-2 px-3">
            <ShieldAlert className="size-4" /> B-Ware
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="gap-2 px-3">
            <TrendingUp className="size-4" /> Portfolio
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="pricing"
          className="mt-4 grid gap-5 xl:grid-cols-[minmax(320px,440px)_1fr]"
        >
          <div className="rounded-2xl border bg-white/60 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-2xl">Preisprofil</h2>
                <p className="text-sm text-muted-foreground">
                  {productKind === 'digital'
                    ? 'Digitalprodukt · keine physischen COGS'
                    : `COGS: ${euro(cogs)} aus dem Produktionskostenrechner`}
                </p>
              </div>
              <Badge variant="outline">Altpreis {euro(currentPrice)}</Badge>
            </div>
            <details className="mt-5 rounded-xl border bg-white/70 p-4">
              <summary className="cursor-pointer font-semibold">
                Erweiterte Preisparameter
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Automatisch vorbelegt. Nur bei Bedarf manuell ändern.
              </p>
              <div className="mt-4 grid gap-4">
                <SelectField
                  label="Produkttyp"
                  value={productKind}
                  onChange={(value) =>
                    setProductKind(value as 'physical' | 'digital')
                  }
                  options={[
                    { value: 'physical', label: 'Physisches Produkt' },
                    { value: 'digital', label: 'Digital STL / 3MF' },
                  ]}
                />
                <SelectField
                  label="Marktgruppe"
                  value={category}
                  onChange={(value) => setCategory(value as MarketCategory)}
                  options={categories}
                />
                <SelectField
                  label="Motiv / historische Person"
                  value={assetId}
                  onChange={setAssetId}
                  options={[
                    { value: '', label: 'Noch nicht zugeordnet' },
                    ...rows(pricingData.assets).map((asset) => ({
                      value: string(asset.id),
                      label: string(asset.name),
                    })),
                  ]}
                />
                <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                  <Field
                    type="text"
                    label="Neues Motiv-/Personen-Asset"
                    value={newAssetName}
                    onChange={setNewAssetName}
                  />
                  <Button
                    variant="outline"
                    onClick={() => void createAsset()}
                    disabled={busy || !newAssetName.trim()}
                  >
                    Anlegen
                  </Button>
                </div>
                <Field
                  type="text"
                  label="Saison (optional)"
                  value={season}
                  onChange={setSeason}
                />
                {productKind === 'physical' ? (
                  <>
                    <SelectField
                      label="Positionierung"
                      value={tier}
                      onChange={setTier}
                      options={[
                        { value: 'standard', label: 'Standard' },
                        { value: 'premium', label: 'Premium' },
                        { value: 'ultra', label: 'Ultra / Sammler' },
                      ]}
                    />
                    <SelectField
                      label="Visuelle Wirkung"
                      value={impactType}
                      onChange={(value) => setImpactType(value as ImpactType)}
                      options={[
                        { value: 'SOLID', label: 'Einfach / massiv (0,75)' },
                        { value: 'DETAILED', label: 'Detailliert (1,00)' },
                        {
                          value: 'PREMIUM_IMPACT',
                          label: 'Premium-Wirkung (1,35)',
                        },
                      ]}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Field
                        label="Länge cm"
                        value={length}
                        onChange={setLength}
                      />
                      <Field
                        label="Breite cm"
                        value={width}
                        onChange={setWidth}
                      />
                      <Field
                        label="Höhe cm"
                        value={height}
                        onChange={setHeight}
                      />
                    </div>
                  </>
                ) : null}
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Verkäufe kommen automatisch aus dem Portfolio. Klicks und
                    Favoriten nur eintragen, wenn echte Plattformdaten
                    vorliegen.
                  </p>
                  <div
                    className={
                      channelScope === 'all' ? 'grid gap-3 2xl:grid-cols-2' : ''
                    }
                  >
                    {(channelScope === 'all'
                      ? (Object.keys(CHANNEL_LABELS) as SalesChannel[])
                      : [channel]
                    ).map((nextChannel) => (
                      <ChannelMarketInputs
                        key={nextChannel}
                        channel={nextChannel}
                        market={channelMarket[nextChannel]}
                        psychology={channelPsychology[nextChannel]}
                        metrics={channelMetrics[nextChannel]}
                        performance={demandPerformanceByChannel[nextChannel]}
                        onMarketChange={(key, value) =>
                          setChannelMarket((current) => ({
                            ...current,
                            [nextChannel]: {
                              ...current[nextChannel],
                              [key]: value,
                            },
                          }))
                        }
                        onPsychologyChange={(value) =>
                          setChannelPsychology((current) => ({
                            ...current,
                            [nextChannel]: value,
                          }))
                        }
                        onMetricChange={(key, value) =>
                          setChannelMetrics((current) => ({
                            ...current,
                            [nextChannel]: {
                              ...current[nextChannel],
                              [key]: value,
                            },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
                {productKind === 'physical' ? (
                  <div className="grid gap-3 border-t pt-4">
                    {Object.entries(values).map(([key, value]) => (
                      <ScoreField
                        key={key}
                        label={
                          (
                            {
                              complexity: 'Komplexität',
                              functionValue: 'Funktionswert',
                              giftValue: 'Geschenkwert',
                              collectorValue: 'Sammlerwert',
                              personalization: 'Personalisierung',
                              finish: 'Finish',
                            } as Record<string, string>
                          )[key]
                        }
                        value={value}
                        onChange={(next) =>
                          setValues((current) => ({ ...current, [key]: next }))
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 border-t pt-4">
                    {Object.entries(digitalValues).map(([key, value]) => (
                      <ScoreField
                        key={key}
                        label={
                          (
                            {
                              modelComplexity: 'Modellkomplexität',
                              demand: 'Nachfrage-Score',
                              differentiation: 'Differenzierung',
                              utility: 'Nutzwert',
                              printReadiness: 'Druckbereitschaft',
                            } as Record<string, string>
                          )[key]
                        }
                        value={value}
                        onChange={(next) =>
                          setDigitalValues((current) => ({
                            ...current,
                            [key]: next,
                          }))
                        }
                      />
                    ))}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={profile.license.isOwnDesign || redistribution}
                        disabled={profile.license.isOwnDesign}
                        onChange={(event) =>
                          setRedistribution(event.target.checked)
                        }
                      />{' '}
                      {profile.license.isOwnDesign
                        ? 'Eigener Entwurf – digitale Veröffentlichung erlaubt'
                        : 'Digitale Weitergabe ausdrücklich erlaubt'}
                    </label>
                    {!profile.license.isOwnDesign ? (
                      <Field
                        type="text"
                        label="Lizenznachweis"
                        value={licenseEvidence}
                        onChange={setLicenseEvidence}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Kein Fremdlizenz-Nachweis erforderlich.
                      </p>
                    )}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={leadProduct}
                        onChange={(event) =>
                          setLeadProduct(event.target.checked)
                        }
                      />{' '}
                      Explizites Lead-Produkt (1,90 € möglich)
                    </label>
                  </div>
                )}
                {channelScope === 'all' || channel === 'etsy' ? (
                  <div className="grid grid-cols-2 gap-3 rounded-xl border p-3">
                    <p className="col-span-2 font-semibold">Etsy-Kanalkosten</p>
                    <Field
                      label="Käuferversand €"
                      value={buyerShipping}
                      onChange={setBuyerShipping}
                    />
                    <SelectField
                      label="Offsite-Szenario"
                      value={offsite}
                      onChange={setOffsite}
                      options={[
                        { value: '0', label: 'Ohne Offsite' },
                        { value: '0.12', label: 'Offsite 12 %' },
                        { value: '0.15', label: 'Offsite 15 %' },
                      ]}
                    />
                  </div>
                ) : null}
                {channelScope === 'all' || channel === 'market' ? (
                  <div className="grid grid-cols-2 gap-3 rounded-xl border p-3">
                    <p className="col-span-2 font-semibold">
                      Markt-Kanalkosten
                    </p>
                    <Field
                      label="Standgebühr €"
                      value={standFee}
                      onChange={setStandFee}
                    />
                    <Field
                      label="Fahrtkosten €"
                      value={travelCost}
                      onChange={setTravelCost}
                    />
                    <Field
                      label="Weitere Kosten €"
                      value={marketExtra}
                      onChange={setMarketExtra}
                    />
                    <Field
                      label="Erwartete Verkäufe"
                      value={expectedSales}
                      onChange={setExpectedSales}
                    />
                  </div>
                ) : null}
              </div>
            </details>
            <div className="mt-4 grid gap-2">
              <Button
                onClick={() => calculate()}
                disabled={busy || !hasRecommendation || analysisInProgress}
              >
                {analysisInProgress ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {analysisInProgress
                  ? 'Marktprüfung läuft'
                  : 'Preise übernehmen'}
              </Button>
              <Button
                onClick={() => void savePrices()}
                disabled={busy || !Object.keys(priceDraft).length}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}{' '}
                Speichern
              </Button>
              <p className="text-xs text-muted-foreground">
                Automatische Empfehlungen verändern die Datenbank nicht. Erst
                „Preise übernehmen“ füllt den Draft; „Speichern“ persistiert
                ihn.
              </p>
            </div>
          </div>
          <div className="grid content-start gap-5">
            <div>
              <h2 className="font-heading text-2xl">Preisvorschläge</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Artikelwirkung, reale Nachfrage und kanalspezifische Kosten
                werden getrennt bewertet.
              </p>
            </div>
            {analysisInProgress ? (
              <div
                className="rounded-2xl border border-[#91a29d] bg-[#edf2f0] p-5 text-[#30443f]"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-3">
                  <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin" />
                  <div>
                    <p className="font-semibold">
                      Dieser Artikel wird am Markt geprüft
                    </p>
                    <p className="mt-1 text-sm leading-6">
                      Vergleichsangebote werden gesucht, bewertet und
                      anschließend in neue Preisvorschläge übersetzt. Bis dahin
                      zeigen wir bewusst keine vorläufigen Modellpreise an.
                    </p>
                  </div>
                </div>
              </div>
            ) : marketResultUnavailable ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">
                  Noch keine marktvalidierte Preisempfehlung
                </p>
                <p className="mt-1">
                  Analyse-Status: {string(latestAnalysisJob?.status)}. Die unten
                  sichtbaren Werte sind derzeit nur kalkulatorische Modellwerte
                  und keine Ergebnisse der Market Intelligence.
                </p>
              </div>
            ) : null}
            {analysisInProgress || marketResultUnavailable ? null : sharedBlocker ? (
              <ResultCard
                result={result}
                currentPrice={currentPriceForChannel(channel)}
              />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {(Object.keys(recommendations) as SalesChannel[]).map(
                    (nextChannel) => (
                      <ChannelSummary
                        key={nextChannel}
                        result={recommendations[nextChannel]}
                        currentPrice={currentPriceForChannel(nextChannel)}
                        draftPrice={priceDraft[nextChannel]}
                        selected={channel === nextChannel}
                        onSelect={() => {
                          setChannel(nextChannel);
                          if (channelScope !== 'all')
                            setChannelScope(nextChannel);
                        }}
                      />
                    ),
                  )}
                </div>
                <ResultCard
                  result={result}
                  currentPrice={currentPriceForChannel(channel)}
                />
              </>
            )}
            <details className="rounded-2xl border bg-white/60 p-4">
              <summary className="cursor-pointer font-semibold">
                Marktdaten anzeigen
              </summary>
              <div className="mt-4">
                <MarketWatch productId={selectedProductId} />
              </div>
            </details>
          </div>
        </TabsContent>
        <TabsContent value="market-watch" className="mt-4">
          <MarketWatch />
        </TabsContent>
        <TabsContent
          value="bware"
          className="mt-4 grid gap-5 xl:grid-cols-[minmax(320px,440px)_1fr]"
        >
          <div className="rounded-2xl border bg-white/60 p-5">
            <h2 className="font-heading text-2xl">
              Recovery Pricing / B-Ware-Verwertung
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Bewertet Bedeutung und Risiko des Mangels – nicht fehlende Gramm.
            </p>
            <div className="mt-5 grid gap-4">
              <SelectField
                label="Betroffener Bereich"
                value={affectedArea}
                onChange={(area) => {
                  setAffectedArea(area);
                  updateDefectDefaults(area, visibility);
                }}
                options={affectedAreas.map((area) => ({
                  value: area,
                  label: area,
                }))}
              />
              <SelectField
                label="Sichtbarkeit"
                value={visibility}
                onChange={(value) => {
                  const level = value as typeof visibility;
                  setVisibility(level);
                  updateDefectDefaults(affectedArea, level);
                }}
                options={[
                  { value: 'kaum', label: 'Kaum sichtbar' },
                  { value: 'leicht', label: 'Leicht sichtbar' },
                  { value: 'deutlich', label: 'Deutlich sichtbar' },
                  { value: 'sehr', label: 'Sehr auffällig' },
                  { value: 'identitaet', label: 'Identitätsprägend' },
                ]}
              />
              {Object.entries(defects).map(([key, value]) => (
                <ScoreField
                  key={key}
                  label={
                    (
                      {
                        aestheticVisibility: 'Ästhetische Sichtbarkeit',
                        functionalImpact: 'Funktionale Auswirkung',
                        structuralRisk: 'Strukturelles Risiko',
                        nonRepairability: 'Nicht reparierbar',
                        giftCollectorLoss: 'Geschenk-/Sammlerverlust',
                      } as Record<string, string>
                    )[key]
                  }
                  value={value}
                  onChange={(next) =>
                    setDefects((current) => ({ ...current, [key]: next }))
                  }
                />
              ))}
              <div className="grid gap-2 border-t pt-4">
                {[
                  [safetyRisk, setSafetyRisk, 'Sicherheitsrisiko'],
                  [structural, setStructural, 'Strukturell unzuverlässig'],
                  [functionLost, setFunctionLost, 'Hauptfunktion verloren'],
                  [disclosable, setDisclosable, 'Mangel klar offenlegbar'],
                ].map(([checked, setter, label]) => (
                  <label
                    key={String(label)}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(checked)}
                      onChange={(event) =>
                        (setter as (value: boolean) => void)(
                          event.target.checked,
                        )
                      }
                    />
                    {String(label)}
                  </label>
                ))}
              </div>
              <Field
                label="Noch entstehende Kosten €"
                value={futureCosts}
                onChange={setFutureCosts}
              />
              <Button onClick={() => void calculateBWare()} disabled={busy}>
                B-Ware prüfen & speichern
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border bg-white/70 p-5">
            {bWareResult ? (
              <>
                <div className="flex items-center gap-2">
                  {bWareResult.status === 'OK' ? (
                    <CheckCircle2 className="size-5 text-emerald-700" />
                  ) : (
                    <AlertTriangle className="size-5 text-red-700" />
                  )}
                  <h3 className="font-semibold">
                    {string(bWareResult.status)}
                  </h3>
                </div>
                {bWareResult.status === 'OK' ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Metric
                      label="B-Ware-Preis"
                      value={euro(number(bWareResult.recommendedPrice))}
                      active
                    />
                    <Metric
                      label="Recovery-Floor"
                      value={euro(number(bWareResult.economicRecoveryFloor))}
                    />
                    <Metric
                      label="Mängelfaktor"
                      value={number(bWareResult.defectFactor).toFixed(2)}
                    />
                    <Metric
                      label="Regulärer Referenzpreis"
                      value={euro(result?.recommendedPrice || currentPrice)}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Dieses Produkt darf in diesem Zustand nicht als B-Ware
                    bepreist werden.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Die harten Sicherheits- und Funktionsprüfungen laufen vor jeder
                Preisberechnung.
              </p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="portfolio" className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-3xl">Portfolio-Wächter</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Nur reale Verkäufe · maximal fünf priorisierte Hinweise · keine
                automatische Preisänderung
              </p>
            </div>
            <Badge variant="outline">
              {portfolioSales.length} Verkaufszeilen
            </Badge>
          </div>
          <div className="mt-4 grid gap-3">
            {signals.map((signal) => (
              <article
                key={signal.key}
                className="rounded-2xl border bg-white/65 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {signal.priority === 'chance'
                          ? '🔥'
                          : signal.priority === 'check'
                            ? '⚠️'
                            : '💡'}
                      </span>
                      <h3 className="font-semibold">{signal.sku}</h3>
                      <Badge variant="outline">{signal.channel}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {signal.reason}
                    </p>
                  </div>
                  <Badge>{signal.state}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>30 Tage: {signal.sales30}</span>
                  <span>vorige 30: {signal.previous30}</span>
                  <span>90 Tage: {signal.sales90}</span>
                  <span>Ebene: {signal.aggregatedAt}</span>
                  {signal.contributionMargin != null ? (
                    <span>Ø DB: {euro(signal.contributionMargin)}</span>
                  ) : null}
                </div>
              </article>
            ))}
            {!signals.length ? (
              <div className="rounded-2xl border border-dashed bg-white/45 p-8 text-center text-sm text-muted-foreground">
                Noch keine verknüpften Verkaufsdaten für Portfolio-Hinweise.
              </div>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
      {message ? (
        <div className="mt-4 rounded-xl border bg-white/70 p-3 text-sm">
          {message}
        </div>
      ) : null}
    </section>
  );
}

function normalizePortfolio(data: Row, profiles: Row[]): PortfolioSale[] {
  const result: PortfolioSale[] = [];
  const products = rows(data.products);
  const context = (productId: string) => {
    const product = products.find((item) => string(item.id) === productId);
    const profile = profiles.find(
      (item) => string(item.inventoryProductId) === productId,
    );
    return {
      familyId: string(product?.familyId) || undefined,
      launchedAt: string(product?.createdAt) || undefined,
      season: string(profile?.season) || undefined,
    };
  };
  for (const sale of rows(data.sales)) {
    if (sale.isCancelled) continue;
    for (const item of rows(sale.items)) {
      const articleVariant = object(item.articleVariant);
      const article = object(articleVariant.article);
      const productId = string(article.productId);
      result.push({
        productId,
        sku: string(
          article.productId || article.id || article.name,
          'Unbekannt',
        ),
        variantId:
          string(item.articleVariantId || articleVariant.id) || undefined,
        channel: `Markt ${string(sale.marketId)}`,
        soldAt: string(sale.date),
        quantity: number(item.quantity, 1),
        realizedPrice: number(item.unitSalePriceCents) / 100 || null,
        discounts: number(sale.discountCents) / 100 || null,
        cogsSnapshot: number(item.unitCostPriceCents) / 100 || null,
        ...context(productId),
      });
    }
  }
  for (const sale of rows(data.onlineSales)) {
    const quantity = Math.max(1, number(sale.quantity, 1));
    const productId = string(sale.productId);
    const perUnitCosts =
      [
        'filamentCostCents',
        'electricityCostCents',
        'machineCostCents',
        'licenseCostCents',
        'depreciationCostCents',
        'accessoryCostCents',
      ].reduce((sum, key) => sum + number(sale[key]), 0) / 100;
    result.push({
      productId,
      sku: string(sale.productId || sale.articleName, 'Unbekannt'),
      variantId: string(sale.productVariantId || sale.variantId) || undefined,
      channel: string(sale.channel, 'Online'),
      soldAt: string(sale.date),
      quantity,
      realizedPrice: number(sale.salePriceCents) / 100 || null,
      fees: number(sale.shippingCostCents) / 100 / quantity || null,
      cogsSnapshot: perUnitCosts || null,
      ...context(productId),
    });
  }
  return result;
}

function currentPortfolioSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 4) return 'ostern frühling';
  if (month >= 5 && month <= 8) return 'sommer';
  if (month >= 9 && month <= 10) return 'halloween herbst';
  if (month >= 11) return 'weihnachten winter';
  return 'winter';
}
