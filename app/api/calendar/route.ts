const CALENDAR_DATA_URL =
  'https://formpoesie.github.io/formpoesie-themen-kalender/data.json';

export async function GET() {
  try {
    const response = await fetch(CALENDAR_DATA_URL, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok)
      return Response.json(
        { error: 'Der News-Kalender ist gerade nicht erreichbar.' },
        { status: 502 },
      );
    const archive = (await response.json()) as {
      meta?: Record<string, unknown>;
      eintraege?: unknown[];
    };
    if (!Array.isArray(archive.eintraege))
      return Response.json(
        { error: 'Die Kalenderdaten haben ein unbekanntes Format.' },
        { status: 502 },
      );
    return Response.json(archive, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Calendar-Source': CALENDAR_DATA_URL,
      },
    });
  } catch {
    return Response.json(
      { error: 'Der News-Kalender ist gerade nicht erreichbar.' },
      { status: 502 },
    );
  }
}
