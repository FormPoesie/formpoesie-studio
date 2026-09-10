'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDollarSign, Loader2, Save, ShieldAlert, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { variantCostBreakdown } from '@/lib/inventory-production';
import {
  calculateMarketCostPerSale,
  evaluatePortfolioSignals,
  suggestDefectScores,
  type DefectInputs,
  type PortfolioSale,
  type PriceRecommendation,
} from '@/lib/pricing-engine';
import type { MarketCategory, SalesChannel } from '@/lib/pricing-config';

type Row = Record<string, unknown>;

function object(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};
}
function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(object) : [];
}
function string(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}
function number(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function euro(value: number | undefined | null) {
  return typeof value === 'number'
    ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
    : '–';
}
function percent(value: number | undefined | null) {
  return typeof value === 'number'
    ? new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 }).format(value)
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
  'Unterseite', 'Rückseite', 'Sockel', 'Ornament', 'Kleidung', 'Nebenobjekt',
  'Hand', 'charakteristisches Zubehör', 'Krone', 'Hut', 'Instrument', 'Gesicht',
  'Augen', 'Brille', 'identitätsprägendes Detail', 'tragendes Element', 'funktionales Element',
];

function inferredCategory(product: Row): MarketCategory {
  const value = string(product.category).toLocaleLowerCase('de');
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

function Field({ label, value, onChange, type = 'number' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="grid gap-1.5 text-sm"><span className="text-muted-foreground">{label}</span><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="bg-white" /></label>;
}

function ScoreField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="grid gap-2 text-sm"><span className="flex justify-between gap-2"><span>{label}</span><span className="tabular-nums text-muted-foreground">{Math.round(value * 100)} %</span></span><input aria-label={label} type="range" min="0" max="1" step="0.05" value={value} onChange={(event) => onChange(Number(event.target.value))} className="accent-[var(--fp-primary)]" /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="grid gap-1.5 text-sm"><span className="text-muted-foreground">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-lg border bg-white px-3 text-sm">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function ResultCard({ result, currentPrice }: { result: PriceRecommendation | null; currentPrice: number | null }) {
  if (!result) return <div className="rounded-2xl border border-dashed bg-white/45 p-8 text-center text-sm text-muted-foreground">Eingaben prüfen und eine Empfehlung berechnen.</div>;
  if (result.status === 'BLOCKED_LICENSE') return <div className="rounded-2xl border border-red-300 bg-red-50 p-5"><div className="flex items-center gap-2 font-semibold text-red-800"><ShieldAlert className="size-5" /> Digitalverkauf blockiert</div><p className="mt-2 text-sm text-red-700">Die digitale Weiterverkaufsfreigabe ist nicht eindeutig belegt.</p></div>;
  const safety = result.discountSafety;
  return <div className="rounded-2xl border bg-white/70 p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold tracking-[.12em] text-[var(--fp-primary)] uppercase">Empfohlener {result.channel}-Preis</p><div className="mt-1 text-4xl font-semibold tabular-nums">{euro(result.recommendedPrice)}</div><p className="mt-1 text-sm text-muted-foreground">Aktiver Preis: {euro(currentPrice)} · wird nicht automatisch geändert</p></div>
      <div className="flex gap-2"><Badge variant="outline">Confidence {result.confidence}</Badge>{result.status !== 'OK' ? <Badge className="bg-amber-100 text-amber-900">Marktfit prüfen</Badge> : null}</div>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Herstellungskosten" value={euro(result.cogs)} />
      <Metric label="Mindestdeckungsbeitrag" value={euro(result.minimumContribution)} />
      <Metric label="Kanal-Floor" value={euro(result.floorPrice)} active={result.diagnostics.priceDriver === 'floor'} />
      <Metric label="Marktanker" value={euro(result.marketPrice)} active={result.diagnostics.priceDriver === 'market'} />
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <Metric label="Erwarteter Deckungsbeitrag" value={euro(result.expectedContribution)} />
      <Metric label="Marge am Verkaufspreis" value={percent(result.marginRate)} />
      <Metric label="Aufschlag auf COGS" value={percent(result.markupRate)} />
    </div>
    <div className="mt-5 rounded-xl bg-[var(--fp-mist)] p-4 text-sm">
      <p className="font-semibold">Warum dieser Preis?</p>
      <ul className="mt-2 grid gap-1 text-muted-foreground">
        <li>Preisbestimmend: {result.diagnostics.priceDriver === 'market' ? 'Marktanker' : 'wirtschaftlicher Kanal-Floor'}</li>
        {result.diagnostics.presenceFactor != null ? <li>Präsenzfaktor {result.diagnostics.presenceFactor.toFixed(2)} · Value-Faktor {result.diagnostics.valueFactor?.toFixed(2)}</li> : null}
        <li>Nachfrage/Konkurrenz {result.diagnostics.demandCompetitionFactor?.toFixed(2) || 'neutral'}</li>
        {result.diagnostics.warnings?.map((warning) => <li key={warning}>⚠ {warning}</li>)}
      </ul>
    </div>
    {safety ? <div className="mt-5"><p className="text-sm font-semibold">Rabattprüfung nach tatsächlichen Gebühren</p><div className="mt-2 grid grid-cols-3 gap-2">{[safety.tenPercent, safety.fifteenPercent, safety.twentyPercent].map((item) => <div key={item.discountRate} className="rounded-xl border p-3 text-sm"><div className="flex items-center justify-between gap-2"><span>{Math.round(item.discountRate * 100)} % Sale</span><Badge className={item.state === 'GREEN' ? 'bg-emerald-100 text-emerald-900' : item.state === 'YELLOW' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-900'}>{item.state}</Badge></div><p className="mt-2 text-xs text-muted-foreground">DB {euro(item.contribution)}</p></div>)}</div><p className="mt-2 text-xs text-muted-foreground">Maximal sicherer Rabatt: {percent(safety.maximumSafeDiscount)}</p></div> : null}
    {result.diagnostics.etsyScenarios ? <div className="mt-4 flex flex-wrap gap-2 text-xs">{Object.entries(result.diagnostics.etsyScenarios).map(([key, value]) => <Badge variant="outline" key={key}>{key}: {euro(value)}</Badge>)}</div> : null}
  </div>;
}

function Metric({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return <div className={'rounded-xl border p-3 ' + (active ? 'border-[var(--fp-primary)] bg-[#eef2ef]' : 'bg-white')}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-semibold tabular-nums">{value}</div>{active ? <div className="mt-1 text-xs text-[var(--fp-primary)]">preisbestimmend</div> : null}</div>;
}

export function PricingWorkspace({ data }: { data: Row }) {
  const products = rows(data.products).filter((product) => !product.archivedAt);
  const components = rows(data.components);
  const [productId, setProductId] = useState('');
  const product = products.find((item) => string(item.id) === productId) || products[0] || {};
  const variants = rows(product.variants);
  const [variantId, setVariantId] = useState('');
  const variant = variants.find((item) => string(item.id) === variantId) || variants[0] || {};
  const cogs = variantCostBreakdown(product, variant, products, components).totalCents / 100;
  const currentPrice = number(variant.priceCents || product.defaultPriceCents) / 100 || null;
  const [category, setCategory] = useState<MarketCategory>('figures');
  const [productKind, setProductKind] = useState<'physical' | 'digital'>('physical');
  const [channel, setChannel] = useState<SalesChannel>('etsy');
  const [tier, setTier] = useState('standard');
  const [season, setSeason] = useState('');
  const [assetId, setAssetId] = useState('');
  const [newAssetName, setNewAssetName] = useState('');
  const [pricingData, setPricingData] = useState<Row>({});
  const [demand, setDemand] = useState('unknown');
  const [competition, setCompetition] = useState('unknown');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [buyerShipping, setBuyerShipping] = useState('0');
  const [offsite, setOffsite] = useState('0');
  const [standFee, setStandFee] = useState('0');
  const [travelCost, setTravelCost] = useState('0');
  const [marketExtra, setMarketExtra] = useState('0');
  const [expectedSales, setExpectedSales] = useState('10');
  const [values, setValues] = useState({ complexity: 0.5, functionValue: 0.5, giftValue: 0.5, collectorValue: 0.5, personalization: 0, finish: 0.5 });
  const [digitalValues, setDigitalValues] = useState({ modelComplexity: 0.5, demand: 0.5, differentiation: 0.5, utility: 0.5, printReadiness: 0.5 });
  const [redistribution, setRedistribution] = useState(false);
  const [licenseEvidence, setLicenseEvidence] = useState('');
  const [leadProduct, setLeadProduct] = useState(false);
  const [result, setResult] = useState<PriceRecommendation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [affectedArea, setAffectedArea] = useState('Unterseite');
  const [visibility, setVisibility] = useState<'kaum' | 'leicht' | 'deutlich' | 'sehr' | 'identitaet'>('leicht');
  const [defects, setDefects] = useState<DefectInputs>(() => suggestDefectScores('Unterseite', 'leicht'));
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
    void fetch('/api/pricing')
      .then(async (response) => {
        const payload = (await response.json()) as Row & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Pricing-Profile konnten nicht geladen werden.');
        if (cancelled) return;
        setPricingData(payload);
        const profile = rows(payload.profiles).find(
          (item) => string(item.inventoryProductId) === selectedProductId,
        );
        const fallbackCategory = inferredCategory({ category: selectedProductCategory });
        const savedValue = object(profile?.value);
        const savedLicense = object(profile?.license);
        setCategory((string(profile?.marketCategory) as MarketCategory) || fallbackCategory);
        setProductKind(
          string(profile?.productKind) === 'digital' || fallbackCategory === 'digital'
            ? 'digital'
            : 'physical',
        );
        setTier(string(profile?.tier, 'standard'));
        setSeason(string(profile?.season));
        setDemand(string(profile?.demand, 'unknown'));
        setCompetition(string(profile?.competition, 'unknown'));
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
              Object.entries(savedValue).filter(([, value]) => typeof value === 'number'),
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
          setMessage(reason instanceof Error ? reason.message : 'Pricing-Daten konnten nicht geladen werden.');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProductId, selectedDepthMm, selectedWidthMm, selectedHeightMm, selectedProductCategory]);

  function selectProduct(nextId: string) {
    const nextProduct = products.find((item) => string(item.id) === nextId) || {};
    const nextVariant = rows(nextProduct.variants)[0];
    const nextCategory = inferredCategory(nextProduct);
    setProductId(nextId);
    setVariantId(string(nextVariant?.id));
    setCategory(nextCategory);
    setProductKind(nextCategory === 'digital' ? 'digital' : 'physical');
    setLength(number(nextProduct.depthMm) ? String(number(nextProduct.depthMm) / 10) : '');
    setWidth(number(nextProduct.widthMm) ? String(number(nextProduct.widthMm) / 10) : '');
    setHeight(number(nextProduct.heightMm) ? String(number(nextProduct.heightMm) / 10) : '');
    setResult(null);
  }

  function updateDefectDefaults(area: string, level: typeof visibility) {
    setDefects(suggestDefectScores(area, level));
  }

  async function calculate() {
    setBusy(true); setMessage('');
    const marketCost = channel === 'market' ? calculateMarketCostPerSale(numericInput(standFee), numericInput(travelCost), numericInput(marketExtra), Math.max(1, numericInput(expectedSales))) : 0;
    const profile = { assetId: assetId || null, productKind, marketCategory: category, tier, season: season || null, demand, competition, shapeType: category === 'hollow' ? 'hollow' : 'solid', lengthCm: numericInput(length) || null, widthCm: numericInput(width) || null, heightCm: numericInput(height) || null, value: productKind === 'digital' ? digitalValues : values, license: { physicalCommercialUseAllowed: true, digitalRedistributionAllowed: redistribution, buyerCommercialUseAllowed: false, evidence: licenseEvidence || undefined } };
    const profileResponse = await fetch('/api/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-profile', productId: string(product.id), profile }) });
    if (!profileResponse.ok) { const problem = await profileResponse.json() as { error?: string }; setMessage(problem.error || 'Profil konnte nicht gespeichert werden.'); setBusy(false); return; }
    const input = productKind === 'digital'
      ? { channel, license: profile.license, ...digitalValues, competition, demandClass: demand, isLeadProduct: leadProduct }
      : { cogs, channel, category: category === 'digital' ? 'figures' : category, tier, lengthCm: numericInput(length) || null, widthCm: numericInput(width) || null, heightCm: numericInput(height) || null, hollowBody: category === 'hollow', highEndCollector: tier === 'ultra', value: values, demand, competition, buyerShipping: numericInput(buyerShipping), channelNonCogsCost: marketCost, offsiteRate: Number(offsite) };
    const response = await fetch('/api/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: productKind === 'digital' ? 'recommend-digital' : 'recommend-physical', productId: string(product.id), variantId: string(variant.id), activePrice: currentPrice, input }) });
    const payload = await response.json() as { error?: string; result?: PriceRecommendation };
    setBusy(false);
    if (!response.ok) setMessage(payload.error || 'Berechnung fehlgeschlagen.');
    else { setResult(payload.result || null); setMessage('Empfehlung und unveränderlicher Snapshot gespeichert. Der aktive Preis blieb unverändert.'); }
  }

  async function calculateBWare() {
    const normalPrice = result?.recommendedPrice || currentPrice;
    if (!normalPrice) { setMessage('Zuerst einen regulären Preis berechnen.'); return; }
    setBusy(true); setMessage('');
    const response = await fetch('/api/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'evaluate-bware', productId: string(product.id), variantId: string(variant.id), affectedArea, input: { normalPrice, channel, defects, safetyRisk, structurallyUnreliable: structural, mainFunctionLost: functionLost, defectCanBeClearlyDisclosed: disclosable, futureNonFeeCosts: numericInput(futureCosts), buyerShipping: numericInput(buyerShipping), collectible: tier === 'ultra' } }) });
    const payload = await response.json() as { error?: string; result?: Row };
    setBusy(false);
    if (!response.ok) setMessage(payload.error || 'B-Ware-Prüfung fehlgeschlagen.'); else { setBWareResult(payload.result || null); setMessage('B-Ware-Prüfung gespeichert.'); }
  }

  async function createAsset() {
    const name = newAssetName.trim();
    if (!name) return;
    setBusy(true); setMessage('');
    const response = await fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save-asset', asset: { name, category, demand, competition } }),
    });
    const payload = await response.json() as { error?: string; id?: string };
    setBusy(false);
    if (!response.ok) setMessage(payload.error || 'Asset konnte nicht gespeichert werden.');
    else {
      setAssetId(payload.id || '');
      setNewAssetName('');
      const refreshed = await fetch('/api/pricing');
      if (refreshed.ok) setPricingData(await refreshed.json() as Row);
      setMessage('Motiv-/Personen-Asset angelegt und ausgewählt.');
    }
  }

  const portfolioSales = useMemo(
    () => normalizePortfolio(data, rows(pricingData.profiles)),
    [data, pricingData.profiles],
  );
  const signals = useMemo(
    () => evaluatePortfolioSignals(portfolioSales, new Date(), currentPortfolioSeason()),
    [portfolioSales],
  );

  if (!products.length) return <div className="mt-6 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Für Pricing werden zuerst Inventarartikel benötigt.</div>;

  return <section className="mt-6">
    <div className="grid gap-3 rounded-2xl border bg-white/60 p-4 lg:grid-cols-[2fr_1fr_1fr]">
      <SelectField label="Artikel" value={string(product.id)} onChange={selectProduct} options={products.map((item) => ({ value: string(item.id), label: string(item.name, 'Unbenannter Artikel') }))} />
      <SelectField label="Variante" value={string(variant.id)} onChange={(value) => { setVariantId(value); setResult(null); }} options={(variants.length ? variants : [{}]).map((item, index) => ({ value: string(item.id, `standard-${index}`), label: string(item.name || item.size, 'Standard') }))} />
      <SelectField label="Kanal" value={channel} onChange={(value) => { setChannel(value as SalesChannel); setResult(null); }} options={[{ value: 'etsy', label: 'Etsy' }, { value: 'direct', label: 'Direkt' }, { value: 'vinted', label: 'Vinted' }, { value: 'ebay', label: 'eBay' }, { value: 'market', label: 'Markt' }]} />
    </div>
    <Tabs defaultValue="pricing" className="mt-5">
      <TabsList><TabsTrigger value="pricing"><CircleDollarSign className="size-4" /> Preis</TabsTrigger><TabsTrigger value="bware"><ShieldAlert className="size-4" /> B-Ware</TabsTrigger><TabsTrigger value="portfolio"><TrendingUp className="size-4" /> Portfolio</TabsTrigger></TabsList>
      <TabsContent value="pricing" className="mt-4 grid gap-5 xl:grid-cols-[minmax(320px,440px)_1fr]">
        <div className="rounded-2xl border bg-white/60 p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-heading text-2xl">Preisprofil</h2><p className="text-sm text-muted-foreground">COGS: {euro(cogs)} aus dem Produktionskostenrechner</p></div><Badge variant="outline">Altpreis {euro(currentPrice)}</Badge></div>
          <div className="mt-5 grid gap-4">
            <SelectField label="Produkttyp" value={productKind} onChange={(value) => setProductKind(value as 'physical' | 'digital')} options={[{ value: 'physical', label: 'Physisches Produkt' }, { value: 'digital', label: 'Digital STL / 3MF' }]} />
            <SelectField label="Marktgruppe" value={category} onChange={(value) => setCategory(value as MarketCategory)} options={categories} />
            <SelectField label="Motiv / historische Person" value={assetId} onChange={setAssetId} options={[{ value: '', label: 'Noch nicht zugeordnet' }, ...rows(pricingData.assets).map((asset) => ({ value: string(asset.id), label: string(asset.name) }))]} />
            <div className="grid grid-cols-[1fr_auto] items-end gap-2"><Field type="text" label="Neues Motiv-/Personen-Asset" value={newAssetName} onChange={setNewAssetName} /><Button variant="outline" onClick={() => void createAsset()} disabled={busy || !newAssetName.trim()}>Anlegen</Button></div>
            <Field type="text" label="Saison (optional)" value={season} onChange={setSeason} />
            {productKind === 'physical' ? <><SelectField label="Positionierung" value={tier} onChange={setTier} options={[{ value: 'standard', label: 'Standard' }, { value: 'premium', label: 'Premium' }, { value: 'ultra', label: 'Ultra / Sammler' }]} /><div className="grid grid-cols-3 gap-2"><Field label="Länge cm" value={length} onChange={setLength} /><Field label="Breite cm" value={width} onChange={setWidth} /><Field label="Höhe cm" value={height} onChange={setHeight} /></div></> : null}
            <div className="grid grid-cols-2 gap-3"><SelectField label="Nachfrage" value={demand} onChange={setDemand} options={[{ value: 'unknown', label: 'Unbekannt' }, { value: 'niche', label: 'Nische' }, { value: 'known', label: 'Bekannt' }, { value: 'very_known', label: 'Sehr bekannt' }, { value: 'trend', label: 'Trend' }]} /><SelectField label="Konkurrenz" value={competition} onChange={setCompetition} options={[{ value: 'unknown', label: 'Unbekannt' }, { value: 'low', label: 'Niedrig' }, { value: 'medium', label: 'Mittel' }, { value: 'high', label: 'Hoch' }]} /></div>
            {productKind === 'physical' ? <div className="grid gap-3 border-t pt-4">{Object.entries(values).map(([key, value]) => <ScoreField key={key} label={({ complexity: 'Komplexität', functionValue: 'Funktionswert', giftValue: 'Geschenkwert', collectorValue: 'Sammlerwert', personalization: 'Personalisierung', finish: 'Finish' } as Record<string, string>)[key]} value={value} onChange={(next) => setValues((current) => ({ ...current, [key]: next }))} />)}</div> : <div className="grid gap-3 border-t pt-4">{Object.entries(digitalValues).map(([key, value]) => <ScoreField key={key} label={({ modelComplexity: 'Modellkomplexität', demand: 'Nachfrage-Score', differentiation: 'Differenzierung', utility: 'Nutzwert', printReadiness: 'Druckbereitschaft' } as Record<string, string>)[key]} value={value} onChange={(next) => setDigitalValues((current) => ({ ...current, [key]: next }))} />)}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={redistribution} onChange={(event) => setRedistribution(event.target.checked)} /> Digitale Weitergabe ausdrücklich erlaubt</label><Field type="text" label="Lizenznachweis" value={licenseEvidence} onChange={setLicenseEvidence} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={leadProduct} onChange={(event) => setLeadProduct(event.target.checked)} /> Explizites Lead-Produkt (1,90 € möglich)</label></div>}
            {channel === 'etsy' ? <div className="grid grid-cols-2 gap-3"><Field label="Käuferversand €" value={buyerShipping} onChange={setBuyerShipping} /><SelectField label="Offsite-Szenario" value={offsite} onChange={setOffsite} options={[{ value: '0', label: 'Ohne Offsite' }, { value: '0.12', label: 'Offsite 12 %' }, { value: '0.15', label: 'Offsite 15 %' }]} /></div> : null}
            {channel === 'market' ? <div className="grid grid-cols-2 gap-3 border-t pt-4"><Field label="Standgebühr €" value={standFee} onChange={setStandFee} /><Field label="Fahrtkosten €" value={travelCost} onChange={setTravelCost} /><Field label="Weitere Kosten €" value={marketExtra} onChange={setMarketExtra} /><Field label="Erwartete Verkäufe" value={expectedSales} onChange={setExpectedSales} /></div> : null}
            <Button onClick={() => void calculate()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Empfehlung berechnen & speichern</Button>
          </div>
        </div>
        <ResultCard result={result} currentPrice={currentPrice} />
      </TabsContent>
      <TabsContent value="bware" className="mt-4 grid gap-5 xl:grid-cols-[minmax(320px,440px)_1fr]">
        <div className="rounded-2xl border bg-white/60 p-5"><h2 className="font-heading text-2xl">Recovery Pricing / B-Ware-Verwertung</h2><p className="mt-1 text-sm text-muted-foreground">Bewertet Bedeutung und Risiko des Mangels – nicht fehlende Gramm.</p><div className="mt-5 grid gap-4"><SelectField label="Betroffener Bereich" value={affectedArea} onChange={(area) => { setAffectedArea(area); updateDefectDefaults(area, visibility); }} options={affectedAreas.map((area) => ({ value: area, label: area }))} /><SelectField label="Sichtbarkeit" value={visibility} onChange={(value) => { const level = value as typeof visibility; setVisibility(level); updateDefectDefaults(affectedArea, level); }} options={[{ value: 'kaum', label: 'Kaum sichtbar' }, { value: 'leicht', label: 'Leicht sichtbar' }, { value: 'deutlich', label: 'Deutlich sichtbar' }, { value: 'sehr', label: 'Sehr auffällig' }, { value: 'identitaet', label: 'Identitätsprägend' }]} />{Object.entries(defects).map(([key, value]) => <ScoreField key={key} label={({ aestheticVisibility: 'Ästhetische Sichtbarkeit', functionalImpact: 'Funktionale Auswirkung', structuralRisk: 'Strukturelles Risiko', nonRepairability: 'Nicht reparierbar', giftCollectorLoss: 'Geschenk-/Sammlerverlust' } as Record<string, string>)[key]} value={value} onChange={(next) => setDefects((current) => ({ ...current, [key]: next }))} />)}<div className="grid gap-2 border-t pt-4">{[[safetyRisk, setSafetyRisk, 'Sicherheitsrisiko'], [structural, setStructural, 'Strukturell unzuverlässig'], [functionLost, setFunctionLost, 'Hauptfunktion verloren'], [disclosable, setDisclosable, 'Mangel klar offenlegbar']].map(([checked, setter, label]) => <label key={String(label)} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(checked)} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} />{String(label)}</label>)}</div><Field label="Noch entstehende Kosten €" value={futureCosts} onChange={setFutureCosts} /><Button onClick={() => void calculateBWare()} disabled={busy}>B-Ware prüfen & speichern</Button></div></div>
        <div className="rounded-2xl border bg-white/70 p-5">{bWareResult ? <><div className="flex items-center gap-2">{bWareResult.status === 'OK' ? <CheckCircle2 className="size-5 text-emerald-700" /> : <AlertTriangle className="size-5 text-red-700" />}<h3 className="font-semibold">{string(bWareResult.status)}</h3></div>{bWareResult.status === 'OK' ? <div className="mt-5 grid gap-3 sm:grid-cols-2"><Metric label="B-Ware-Preis" value={euro(number(bWareResult.recommendedPrice))} active /><Metric label="Recovery-Floor" value={euro(number(bWareResult.economicRecoveryFloor))} /><Metric label="Mängelfaktor" value={number(bWareResult.defectFactor).toFixed(2)} /><Metric label="Regulärer Referenzpreis" value={euro(result?.recommendedPrice || currentPrice)} /></div> : <p className="mt-3 text-sm text-muted-foreground">Dieses Produkt darf in diesem Zustand nicht als B-Ware bepreist werden.</p>}</> : <p className="text-sm text-muted-foreground">Die harten Sicherheits- und Funktionsprüfungen laufen vor jeder Preisberechnung.</p>}</div>
      </TabsContent>
      <TabsContent value="portfolio" className="mt-4"><div className="flex items-end justify-between gap-3"><div><h2 className="font-heading text-3xl">Portfolio-Wächter</h2><p className="mt-1 text-sm text-muted-foreground">Nur reale Verkäufe · maximal fünf priorisierte Hinweise · keine automatische Preisänderung</p></div><Badge variant="outline">{portfolioSales.length} Verkaufszeilen</Badge></div><div className="mt-4 grid gap-3">{signals.map((signal) => <article key={signal.key} className="rounded-2xl border bg-white/65 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="text-lg">{signal.priority === 'chance' ? '🔥' : signal.priority === 'check' ? '⚠️' : '💡'}</span><h3 className="font-semibold">{signal.sku}</h3><Badge variant="outline">{signal.channel}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{signal.reason}</p></div><Badge>{signal.state}</Badge></div><div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span>30 Tage: {signal.sales30}</span><span>vorige 30: {signal.previous30}</span><span>90 Tage: {signal.sales90}</span><span>Ebene: {signal.aggregatedAt}</span>{signal.contributionMargin != null ? <span>Ø DB: {euro(signal.contributionMargin)}</span> : null}</div></article>)}{!signals.length ? <div className="rounded-2xl border border-dashed bg-white/45 p-8 text-center text-sm text-muted-foreground">Noch keine verknüpften Verkaufsdaten für Portfolio-Hinweise.</div> : null}</div></TabsContent>
    </Tabs>
    {message ? <div className="mt-4 rounded-xl border bg-white/70 p-3 text-sm">{message}</div> : null}
  </section>;
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
        sku: string(article.productId || article.id || article.name, 'Unbekannt'),
        variantId: string(item.articleVariantId || articleVariant.id) || undefined,
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
    const perUnitCosts = ['filamentCostCents', 'electricityCostCents', 'machineCostCents', 'licenseCostCents', 'depreciationCostCents', 'accessoryCostCents'].reduce((sum, key) => sum + number(sale[key]), 0) / 100;
    result.push({
      productId,
      sku: string(sale.productId || sale.articleName, 'Unbekannt'),
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
