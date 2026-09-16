import type { ListingCandidate } from './market-intelligence';

export type MarketResearchBindings = {
  MARKET_SEARCH_ENDPOINT?: string;
  MARKET_SEARCH_BEARER_TOKEN?: string;
  SERPER_API_KEY?: string;
};

export type SourceAttempt = {
  source: string;
  query: string;
  status: 'SUCCESS' | 'PARTIAL' | 'UNAVAILABLE';
  found: number;
  accepted: number;
  error?: string;
};

type SearchHit = {
  title: string;
  url: string;
  description?: string;
  priceCents?: number | null;
  currency?: string | null;
  seller?: string | null;
  source?: string;
};

const USER_AGENT =
  'FormPoesieMarketWatch/1.0 (+https://formpoesie-masterbrain.formpoesie.workers.dev)';
const robotsCache = new Map<string, { expires: number; text: string | null }>();
const AUTOMATION_BLOCKED_HOSTS = ['ebay.com', 'ebay.de', 'kleinanzeigen.de'];

function marketplacePlatform(hit: SearchHit) {
  const page = new URL(hit.url);
  const evidence = `${hit.seller || ''} ${hit.source || ''} ${page.hostname}`.toLowerCase();
  if (evidence.includes('etsy')) return 'etsy';
  if (evidence.includes('ebay')) return 'ebay';
  if (evidence.includes('vinted')) return 'vinted';
  return page.hostname.replace(/^www\./, '');
}

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
  if (bindings.SERPER_API_KEY) {
    const serperApiKey = bindings.SERPER_API_KEY;
    const request = (endpoint: 'shopping' | 'search') =>
      fetch(`https://google.serper.dev/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': serperApiKey,
        },
        body: JSON.stringify({ q: query, gl: 'de', hl: 'de', num: limit }),
        signal: AbortSignal.timeout(12_000),
      });
    const [shoppingResponse, searchResponse] = await Promise.all([
      request('shopping'),
      request('search'),
    ]);
    if (!shoppingResponse.ok || !searchResponse.ok)
      throw new Error(
        `Serper-Suche antwortet mit ${shoppingResponse.ok ? searchResponse.status : shoppingResponse.status}.`,
      );
    const shoppingPayload = (await shoppingResponse.json()) as {
      shopping?: Array<Record<string, unknown>>;
    };
    const searchPayload = (await searchResponse.json()) as {
      organic?: Array<Record<string, unknown>>;
    };
    const money = (value: unknown) => {
      const text = string(value).replace(/\s/g, '');
      const match = text.match(/(\d[\d.]*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)/);
      if (!match) return null;
      const normalized = match[1].includes(',')
        ? match[1].replace(/\./g, '').replace(',', '.')
        : match[1];
      const amount = Number(normalized);
      return Number.isFinite(amount) && amount > 0
        ? Math.round(amount * 100)
        : null;
    };
    const shopping = (shoppingPayload.shopping || []).map((item) => ({
      title: string(item.title),
      url: string(item.link),
      description: string(item.snippet),
      priceCents: money(item.price),
      currency: /€|EUR/i.test(string(item.price)) ? 'EUR' : null,
      seller: string(item.source).trim() || null,
      source: 'serper-shopping',
    }));
    const organic = (searchPayload.organic || []).map((item) => {
      const snippet = string(item.snippet);
      const priceMatch = snippet.match(
        /(?:€\s*([\d.]+(?:,\d{1,2})?)|([\d.]+(?:,\d{1,2})?)\s*(?:€|EUR))/i,
      );
      const eurPrice = priceMatch
        ? money(priceMatch[1] || priceMatch[2])
        : null;
      return {
        title: string(item.title),
        url: string(item.link),
        description: snippet,
        priceCents: eurPrice,
        currency: eurPrice ? 'EUR' : null,
        seller: null,
        source: 'serper-organic',
      };
    });
    return [...shopping, ...organic]
      .filter((item) => /^https?:\/\//.test(item.url))
      .filter(
        (item, index, all) =>
          all.findIndex((row) => row.url === item.url) === index,
      )
      .slice(0, limit * 2);
  }
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
    /(?:\b(?:stl|3mf|obj)\s*(?:file|files|datei|dateien)?\b|\bdigital(?:e[rsn]?)?\s+(?:download|file|files|datei|dateien|produkt)\b|\binstant download\b|\bdownload[- ]?datei\b|\bdruckdatei\b|\bno physical item\b|\bkein physischer artikel\b|\bnur (?:die )?datei\b)/i.test(
      value,
    )
  )
    return 'digital';
  // FormPoesie sells additively manufactured objects. Other physical goods
  // (ceramic, wax, cast resin, etc.) are not valid pricing comparables.
  if (
    /(?:\b3d[- ]?(?:printed|print|druck|gedruckt)\b|\b(?:pla|petg|abs|asa|tpu)\b|\b(?:fdm|filament)(?:druck| print| printed)?\b)/i.test(
      value,
    )
  )
    return 'physical';
  return 'unknown';
}

function bundleSize(value: string) {
  const match = value.match(
    /(?:\b(\d{1,2})\s*(?:er(?:[- ]?set)?|pcs?|pieces?|teilig(?:es)?\s+set)\b|\bset\s+(?:of\s+)?(\d{1,2})\b|\bthree[- ]piece\b)/i,
  );
  if (!match)
    return /\b(?:set|bundle|pack|lot|collection|trio|paar|pair|mehrteilig)\b/i.test(value)
      ? null
      : 1;
  if (/three[- ]piece/i.test(match[0])) return 3;
  const amount = Number(match[1] || match[2]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
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
  const bundle =
    finite(product.numberOfItems || product.quantity) ??
    bundleSize(`${title} ${description}`);
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
      observedAt: new Date().toISOString(),
      bundleAmbiguous: bundle == null,
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
        source: bindings.SERPER_API_KEY ? 'serper' : 'configured-search',
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
      source: bindings.SERPER_API_KEY
        ? 'serper'
        : bindings.MARKET_SEARCH_ENDPOINT
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
    if (hit.priceCents && hit.currency) {
      const page = new URL(hit.url);
      candidates.push({
        source: hit.source || page.hostname,
        sourceUrl: hit.url,
        platform: marketplacePlatform(hit),
        title: hit.title,
        seller: hit.seller || null,
        physicalOrDigital: physicalKind(
          `${hit.title} ${hit.description || ''} ${hit.url}`,
        ),
        currency: hit.currency,
        regularPriceCents: hit.priceCents,
        visibleCustomerPriceCents: hit.priceCents,
        motif: hit.description || null,
        bundleSize: bundleSize(`${hit.title} ${hit.description || ''}`),
        sourceQualityScore: 0.68,
        popularitySignals: {},
        rawMetadata: {
          discovery: hit.source || 'configured-search',
          snippet: hit.description || null,
          observedAt: new Date().toISOString(),
          bundleAmbiguous:
            bundleSize(`${hit.title} ${hit.description || ''}`) == null,
        },
      });
      continue;
    }
    if (candidates.length >= 4) continue;
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
