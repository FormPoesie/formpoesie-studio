type PageSignal = {
  signal: string;
  headline: string;
};

type MakerWorldUser = {
  uid?: string | number;
  name?: string;
  handle?: string;
};

type MakerWorldDesign = {
  id?: string | number;
  title?: string;
  createTime?: string;
};

function normalizeText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function profileHandle(profileUrl: string) {
  const url = new URL(profileUrl);
  const segment = url.pathname
    .split('/')
    .map((part) => decodeURIComponent(part))
    .find((part) => part.startsWith('@'));
  return segment?.slice(1).trim() || '';
}

async function responseJson<T>(response: Response, message: string) {
  if (!response.ok) {
    throw new Error(`${message} (Status ${response.status}).`);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${message}: ungültige Antwort.`);
  }
}

export async function makerWorldSignal(
  profileUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<PageSignal> {
  const handle = profileHandle(profileUrl);
  if (!handle) throw new Error('MakerWorld-Benutzername fehlt in der Profil-URL.');

  const userSearch = new URL(
    'https://api.bambulab.com/v1/search-service/search/user',
  );
  userSearch.searchParams.set('keyword', handle);
  userSearch.searchParams.set('offset', '0');
  userSearch.searchParams.set('limit', '10');
  const users = await responseJson<{ hits?: MakerWorldUser[] }>(
    await fetcher(userSearch, { headers: { Accept: 'application/json' } }),
    'MakerWorld-Benutzer konnte nicht geladen werden',
  );
  const wanted = handle.toLocaleLowerCase('en');
  const user = (users.hits || []).find((item) =>
    [item.handle, item.name].some(
      (value) => value?.toLocaleLowerCase('en') === wanted,
    ),
  );
  if (user?.uid === undefined) {
    throw new Error(`MakerWorld-Profil @${handle} wurde nicht gefunden.`);
  }

  const designsUrl = new URL(
    `https://api.bambulab.com/v1/design-service/publisheddesigns/${encodeURIComponent(String(user.uid))}`,
  );
  designsUrl.searchParams.set('type', '3D');
  designsUrl.searchParams.set('offset', '0');
  designsUrl.searchParams.set('limit', '50');
  const designs = await responseJson<{ hits?: MakerWorldDesign[] }>(
    await fetcher(designsUrl, { headers: { Accept: 'application/json' } }),
    'MakerWorld-Modelle konnten nicht geladen werden',
  );
  const hits = (designs.hits || []).filter(
    (item): item is MakerWorldDesign & { id: string | number } =>
      item.id !== undefined,
  );
  const signal = hits
    .map((item) => String(item.id))
    .sort()
    .join('\n');
  return {
    signal: signal || `makerworld:${user.uid}:keine-modelle`,
    headline: hits[0]?.title?.trim() || `@${handle}: noch keine Modelle`,
  };
}

export function htmlPageSignal(html: string, platform: string): PageSignal {
  const linkPattern =
    platform === 'Patreon'
      ? /href=["']([^"']*\/(?:posts|join)\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi
      : /href=["']([^"']*\/(?:models|model)\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const matches: Array<{ href: string; title: string }> = [];
  for (const match of html.matchAll(linkPattern)) {
    const href = match[1];
    const title = normalizeText(match[2]);
    if (!matches.some((item) => item.href === href))
      matches.push({ href, title });
    if (matches.length >= 50) break;
  }
  if (matches.length) {
    return {
      signal: matches
        .map((item) => item.href)
        .sort()
        .join('\n'),
      headline: matches.find((item) => item.title)?.title || matches[0].href,
    };
  }
  const title = normalizeText(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '',
  );
  return { signal: title, headline: title };
}

export async function fetchPageSignal(
  profileUrl: string,
  platform: string,
  fetcher: typeof fetch = fetch,
): Promise<PageSignal> {
  if (platform === 'MakerWorld') return makerWorldSignal(profileUrl, fetcher);

  const response = await fetcher(profileUrl, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'FormPoesie-Masterbrain-Monitor/1.0',
    },
    redirect: 'follow',
  });
  if (!response.ok)
    throw new Error('Profil antwortet mit Status ' + response.status + '.');
  return htmlPageSignal(await response.text(), platform);
}
