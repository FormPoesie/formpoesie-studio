import type { ListingCandidate } from './market-intelligence';

export type MarketResearchBindings = {
  MARKET_SEARCH_ENDPOINT?: string;
  MARKET_SEARCH_BEARER_TOKEN?: string;
};

export type SourceAttempt = {
  source: string;
  query: string;
  status: 'SUCCESS' | 'PARTIAL' | 'UNAVAILABLE';
  found: number;
  accepted: number;
  error?: string;
};

type SearchHit = { title: string; url: string; description?: string };

const USER_AGENT =
  'FormPoesieMarketWatch/1.0 (+https://formpoesie-masterbrain.formpoesie.workers.dev)';
const robotsCache = new Map<string, { expires: number; text: string | null }>();
const AUTOMATION_BLOCKED_HOSTS = ['ebay.com', 'ebay.de', 'kleinanzeigen.de'];

function decode(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function tag(block: string, name: string) {
  return decode(
    block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ||
      '',
  ).trim();
}

async function bingRss(query: string, limit: number): Promise<SearchHit[]> {
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'rss');
  url.searchParams.set('setlang', 'de-DE');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/rss+xml, application/xml;q=0.9',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok)
    throw new Error(`Discovery-Quelle antwortet mit ${response.status}.`);
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .slice(0, limit)
    .map((match) => ({
      title: tag(match[1], 'title'),
      url: tag(match[1], 'link'),
      description: tag(match[1], 'description'),
    }))
    .filter((item) => /^https?:\/\//.test(item.url));
}

async function configuredSearch(
  query: string,
  limit: number,
  bindings: MarketResearchBindings,
) {
  if (!bindings.MARKET_SEARCH_ENDPOINT) return null;
  const url = new URL(bindings.MARKET_SEARCH_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(limit));
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (bindings.MARKET_SEARCH_BEARER_TOKEN)
    headers.Authorization = `Bearer ${bindings.MARKET_SEARCH_BEARER_TOKEN}`;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok)
    throw new Error(`Konfigurierte Suche antwortet mit ${response.status}.`);
  const payload = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; description?: string }>;
    webPages?: {
      value?: Array<{ name?: string; url?: string; snippet?: string }>;
    };
  };
  const values = payload.results || payload.webPages?.value || [];
  return values
    .map((item) => {
      const row = item as {
        title?: string;
        name?: string;
        url?: string;
        description?: string;
        snippet?: string;
      };
      return {
        title: String(row.title || row.name || ''),
        url: String(row.url || ''),
        description: String(row.description || row.snippet || ''),
      };
    })
    .filter((item) => /^https?:\/\//.test(item.url))
    .slice(0, limit);
}

function relevantRobotsBlock(text: string) {
  const groups = text.split(/\n\s*\n/);
  const named = groups.find((group) =>
    /user-agent\s*:\s*formpoesiemarketwatch/i.test(group),
  );
  return (
    named || groups.find((group) => /user-agent\s*:\s*\*/i.test(group)) || ''
  );
}

async function robotsAllowed(url: URL) {
  const origin = url.origin;
  const cached = robotsCache.get(origin);
  let text = cached && cached.expires > Date.now() ? cached.text : undefined;
  if (text === undefined) {
    try {
      const response = await fetch(new URL('/robots.txt', origin), {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(6_000),
      });
      text = response.ok ? await response.text() : null;
    } catch {
      text = null;
    }
    robotsCache.set(origin, { expires: Date.now() + 3_600_000, text });
  }
  if (text == null) return false;
  const block = relevantRobotsBlock(text);
  const path = url.pathname + url.search;
  let decision: { allow: boolean; length: number } | null = null;
  for (const match of block.matchAll(
    /^\s*(allow|disallow)\s*:\s*(.*?)\s*$/gim,
  )) {
    const pattern = match[2].trim();
    if (!pattern) continue;
    const source = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\$$/, '$');
    if (!new RegExp(`^${source}`, 'i').test(path)) continue;
    if (!decision || pattern.length > decision.length)
      decision = {
        allow: match[1].toLowerCase() === 'allow',
        length: pattern.length,
      };
  }
  return decision?.allow ?? true;
}

function stripHtml(value: string) {
  return decode(
    value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function objects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(objects);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(objects)];
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function string(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return string(row.name || row.value || row['@id']);
  }
  return '';
}

function firstObject(value: unknown) {
  return objects(value)[0] || {};
}

function physicalKind(value: string): ListingCandidate['physicalOrDigital'] {
  if (
    /\b(stl|3mf|obj file|digital download|download datei|druckdatei)\b/i.test(
      value,
    )
  )
    return 'digital';
  if (
    /\b(shipping|versand|material|handmade|handgemacht|physical)\b/i.test(value)
  )
    return 'physical';
  return 'unknown';
}

function priceCents(value: unknown) {
  const number = finite(value);
  return number != null && number > 0 ? Math.round(number * 100) : null;
}

function parseProductJsonLd(
  html: string,
  pageUrl: string,
): ListingCandidate | null {
  const jsonValues: unknown[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      jsonValues.push(JSON.parse(match[1].trim()));
    } catch {
      // Malformed structured data is ignored instead of guessed.
    }
  }
  const product = jsonValues
    .flatMap(objects)
    .find((row) => string(row['@type']).toLowerCase() === 'product');
  if (!product) return null;
  const offers = objects(product.offers).find((row) =>
    /offer/i.test(string(row['@type']) || 'Offer'),
  );
  const aggregate = firstObject(product.aggregateRating);
  const seller = firstObject(offers?.seller || product.brand);
  const title = string(product.name).trim();
  if (!title) return null;
  const price = priceCents(offers?.price || offers?.lowPrice);
  const highPrice = priceCents(offers?.highPrice);
  const currency = string(offers?.priceCurrency).toUpperCase() || null;
  const material = string(product.material).trim() || null;
  const description = stripHtml(string(product.description));
  const bundle = finite(product.numberOfItems || product.quantity);
  return {
    source: new URL(pageUrl).hostname,
    sourceUrl: pageUrl,
    platform: new URL(pageUrl).hostname.replace(/^www\./, ''),
    title,
    seller: string(seller.name).trim() || null,
    physicalOrDigital: physicalKind(`${title} ${description} ${pageUrl}`),
    currency,
    regularPriceCents: highPrice && highPrice !== price ? highPrice : price,
    salePriceCents: highPrice && price && highPrice > price ? price : null,
    visibleCustomerPriceCents: price,
    productType: string(product.category).trim() || null,
    material,
    personalization: /personalis|custom|personalized/i.test(
      `${title} ${description}`,
    ),
    bundleSize: bundle == null ? null : Math.max(1, Math.round(bundle)),
    reviewCount: finite(aggregate.reviewCount || aggregate.ratingCount),
    rating: finite(aggregate.ratingValue),
    popularitySignals: {},
    sourceQualityScore: price ? 0.82 : 0.58,
    rawMetadata: {
      availability: string(offers?.availability) || null,
      itemCondition: string(offers?.itemCondition) || null,
      sku: string(product.sku) || null,
    },
  };
}

async function inspectHit(hit: SearchHit): Promise<ListingCandidate | null> {
  const url = new URL(hit.url);
  if (
    AUTOMATION_BLOCKED_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  )
    return null;
  if (!(await robotsAllowed(url))) return null;
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (
    !response.ok ||
    !/text\/html/i.test(response.headers.get('content-type') || '')
  )
    return null;
  const html = await response.text();
  return parseProductJsonLd(html.slice(0, 1_500_000), response.url || hit.url);
}

export async function researchQuery(
  query: string,
  limit: number,
  bindings: MarketResearchBindings = {},
) {
  const attempts: SourceAttempt[] = [];
  let hits: SearchHit[] = [];
  try {
    const configured = await configuredSearch(query, limit, bindings);
    if (configured) {
      hits = configured;
      attempts.push({
        source: 'configured-search',
        query,
        status: 'SUCCESS',
        found: hits.length,
        accepted: 0,
      });
    } else {
      hits = await bingRss(query, limit);
      attempts.push({
        source: 'bing-rss-discovery',
        query,
        status: 'SUCCESS',
        found: hits.length,
        accepted: 0,
      });
    }
  } catch (error) {
    attempts.push({
      source: bindings.MARKET_SEARCH_ENDPOINT
        ? 'configured-search'
        : 'bing-rss-discovery',
      query,
      status: 'UNAVAILABLE',
      found: 0,
      accepted: 0,
      error: error instanceof Error ? error.message : 'Quelle nicht verfügbar.',
    });
    return { candidates: [] as ListingCandidate[], attempts };
  }
  const candidates: ListingCandidate[] = [];
  for (const hit of hits) {
    try {
      const candidate = await inspectHit(hit);
      if (candidate) candidates.push(candidate);
    } catch {
      // One blocked or malformed page does not discard the other sources.
    }
  }
  attempts[0].accepted = candidates.length;
  if (hits.length && candidates.length < hits.length)
    attempts[0].status = 'PARTIAL';
  return { candidates, attempts };
}
