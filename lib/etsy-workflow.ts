import type { InventoryItem } from './inventory-bridge';

export const ETSY_STATES = [
  'PRODUCT_LOADED',
  'IMAGE_UPLOAD',
  'IMAGE_PROCESSING',
  'IMAGE_REVIEW',
  'KEYWORD_RESEARCH',
  'IMAGE_ORDER',
  'TITLE',
  'CART_SUMMARY',
  'VARIANT_PRICING',
  'DESCRIPTION',
  'ALT_TEXT',
  'HOLIDAY',
  'FINAL_REVIEW',
  'COMPLETED',
] as const;
export type EtsyState = (typeof ETSY_STATES)[number];
export const STEP_LABELS: Record<EtsyState, string> = {
  PRODUCT_LOADED: 'Artikel',
  IMAGE_UPLOAD: 'Bilder hinzufügen',
  IMAGE_PROCESSING: 'Bilder bearbeiten',
  IMAGE_REVIEW: 'Bilder freigeben',
  KEYWORD_RESEARCH: 'Keywords',
  IMAGE_ORDER: 'Bildreihenfolge',
  TITLE: 'Titel',
  CART_SUMMARY: 'Warenkorb',
  VARIANT_PRICING: 'Preise',
  DESCRIPTION: 'Beschreibung',
  ALT_TEXT: 'Alt-Texte',
  HOLIDAY: 'Feiertag',
  FINAL_REVIEW: 'Final Check',
  COMPLETED: 'Fertig',
};
export const VISIBLE_STEPS: EtsyState[] = [
  'IMAGE_UPLOAD',
  'IMAGE_REVIEW',
  'KEYWORD_RESEARCH',
  'IMAGE_ORDER',
  'TITLE',
  'CART_SUMMARY',
  'VARIANT_PRICING',
  'DESCRIPTION',
  'ALT_TEXT',
  'HOLIDAY',
  'FINAL_REVIEW',
];
export const DEPENDENCIES: Partial<Record<EtsyState, EtsyState[]>> = {
  IMAGE_UPLOAD: ['IMAGE_REVIEW', 'IMAGE_ORDER', 'ALT_TEXT'],
  IMAGE_REVIEW: ['IMAGE_ORDER', 'ALT_TEXT'],
  KEYWORD_RESEARCH: ['TITLE', 'DESCRIPTION'],
  IMAGE_ORDER: ['ALT_TEXT'],
  VARIANT_PRICING: ['DESCRIPTION'],
};
export const HOLIDAYS = [
  'Weihnachten',
  'Cinco de Mayo',
  'Día de los Muertos',
  'Diwali',
  'Ostern',
  'Eid',
  'Vatertag',
  'Halloween',
  'Chanukka',
  'Holi',
  'Independence Day',
  'Kwanzaa',
  'Mondneujahr',
  'Mardi Gras',
  'Muttertag',
  'Neujahr',
  'Pessach',
  'Ramadan',
  'St. Patrick’s Day',
  'Thanksgiving',
  'Valentinstag',
  'Veterans Day',
];
export const DEFAULT_COPY = {
  shipping_de:
    'Kostenloser Versand ab 50 € im Inland mit dem Code „GRATISVERSAND“',
  shipping_en:
    'Free domestic shipping on orders over €50 with the code “GRATISVERSAND”.',
  color_de:
    'Deine Wunschfarbe ist nicht dabei? Schreib mir gern – weitere Farbtöne sind auf Anfrage möglich.',
  color_en:
    'Looking for another color? Send me a message – additional shades may be available on request.',
  manufacturing_de:
    'Jedes Exemplar wird einzeln 3D-gedruckt und sorgfältig nachbearbeitet. Feine sichtbare Drucklinien sind Teil dieser Fertigungsweise.',
  manufacturing_en:
    'Each piece is individually 3D printed and carefully finished. Fine visible print lines are part of this process.',
  sustainability_de:
    'Filamentreste und Fehldrucke werden gesammelt dem Recycling zugeführt. Geeignete gebrauchte Versandkartons werden wiederverwendet.',
  sustainability_en:
    'Filament scraps and failed prints are collected for recycling. Suitable used shipping boxes are reused.',
  safety_de:
    'Dekoratives Designobjekt, kein Spielzeug. Bei Bruch können scharfe Kanten entstehen. Nicht für Kinder unter 14 Jahren geeignet.',
  safety_en:
    'Decorative design object, not a toy. Broken parts may have sharp edges. Not suitable for children under 14.',
};

export function snapshotProduct(item: InventoryItem) {
  return {
    id: String(item.id),
    name: item.modelName,
    productType: item.productType,
    buyerWorld: item.buyerWorld,
    inventoryUpdatedAt: item.updatedAt,
    dimensions: {
      width: item.widthMm,
      height: item.heightMm,
      depth: item.depthMm,
      unit: 'mm',
    },
    variants: item.variants.map((v) => ({
      id: String(v.id),
      name: v.name,
      size: v.size,
      weight: { value: v.weightGrams, unit: 'g' },
      productionCost:
        typeof v.productionCost === 'number' ? v.productionCost : null,
      currentPrice: typeof v.currentPrice === 'number' ? v.currentPrice : null,
      printHours: typeof v.printHours === 'number' ? v.printHours : null,
      setSize: typeof v.setSize === 'number' ? v.setSize : 1,
    })),
  };
}
export type ProductSnapshot = ReturnType<typeof snapshotProduct>;
export type KeywordCandidate = {
  tag: string;
  score: number;
  reason: string;
  source: string;
  intent: string;
};

const clean = (value: string) =>
  value
    .toLocaleLowerCase('de')
    .replace(/[|,;:()[\]{}]/g, ' ')
    .replace(/[^a-z0-9äöüß&\-\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const tag = (value: string) => clean(value).slice(0, 20).trim();
const words = (value: string) =>
  Array.from(
    new Set(
      clean(value)
        .split(' ')
        .filter((word) => word.length > 2),
    ),
  );
const overlap = (a: string, b: string) => {
  const left = new Set(words(a));
  const right = new Set(words(b));
  return (
    [...left].filter((word) => right.has(word)).length /
    Math.max(1, Math.min(left.size, right.size))
  );
};
function productSignals(product: ProductSnapshot) {
  const text = clean(
    `${product.name} ${product.productType} ${product.buyerWorld}`,
  );
  return {
    text,
    functional:
      /halter|ablage|vase|lampe|dose|schale|organizer|ständer|staender|aufbewahrung|ring/i.test(
        text,
      ),
    bust: /büste|bueste|portrait|kopf|histor/i.test(text),
    animal: /affe|tier|katze|hund|vogel|drache|eule/i.test(text),
    gothic: /goth|dark|horror|totenkopf|dämon|daemon|skelett|nacht/i.test(text),
    gift: /geschenk|sammler|personalis/i.test(text),
    figure: /figur|skulptur|statue|büste|bueste/i.test(text),
    motif: words(product.name).slice(0, 3).join(' '),
    type: words(product.productType).slice(0, 2).join(' '),
  };
}

export function generateKeywords(
  product: ProductSnapshot,
  marketTerms: string[] = [],
) {
  const s = productSignals(product),
    candidates: Array<Omit<KeywordCandidate, 'score'>> = [];
  const add = (
    value: string,
    intent: string,
    reason: string,
    source = 'Produktdaten',
  ) => {
    const valueTag = tag(value);
    if (valueTag) candidates.push({ tag: valueTag, intent, reason, source });
  };
  add(`${s.motif} ${s.type}`, 'Hauptprodukt', 'Motiv und Produkttyp');
  add(product.name, 'Motiv', 'Konkreter Produktname');
  add(product.productType, 'Produkttyp', 'Autoritativer Produkttyp');
  if (s.functional) {
    add(`${s.motif} Halter`, 'Funktion', 'Konkrete Produktfunktion');
    add(`${s.motif} benutzen`, 'Nutzung', 'Funktionsnahe Suche');
  }
  if (s.figure) add(`${s.motif} Figur`, 'Synonym', 'Produkttyp-Synonym');
  if (s.bust) {
    add(`${s.motif} Büste`, 'Nische', 'Büsten-Suche');
    add(`${s.motif} Profil`, 'Motiv', 'Motiv und Ansicht');
  }
  if (s.animal)
    add(`${s.motif} Geschenk`, 'Zielgruppe', 'Geschenk für Motivfans');
  if (s.gothic) {
    add(`${s.motif} Gothic`, 'Stil', 'Passende Stilwelt');
    add(`Dark Academia ${s.type}`, 'Stil', 'Kaufnahe Stil-Suche');
  }
  add(`${s.motif} Geschenk`, 'Geschenk', 'Geschenkintention');
  add(`${s.motif} Sammler`, 'Zielgruppe', 'Sammlerintention');
  add(`${s.type} fürs Regal`, 'Raum', 'Konkrete Platzierung');
  add(`${s.motif} Schreibtisch`, 'Nutzung', 'Konkreter Nutzungskontext');
  add(`${s.motif} Skulptur`, 'Synonym', 'Präziser Produktbegriff');
  add(`${s.motif} Dekofigur`, 'Longtail', 'Motivbezogene Longtail-Suche');
  add(`${s.motif} gift`, 'Englisch', 'Relevante englische Suche');
  for (const term of marketTerms.slice(0, 12))
    add(term, 'Markt', 'Aktuelle Market Intelligence', 'Market Intelligence');
  const accepted: KeywordCandidate[] = [];
  for (const candidate of candidates) {
    if (
      candidate.tag.length < 3 ||
      accepted.some(
        (entry) =>
          entry.tag === candidate.tag ||
          overlap(entry.tag, candidate.tag) >= 0.9,
      )
    )
      continue;
    const specificity = Math.min(1, words(candidate.tag).length / 3),
      purchase = /geschenk|gift|halter|sammler|büste|figur|skulptur/i.test(
        candidate.tag,
      )
        ? 1
        : 0.55,
      market = candidate.source === 'Market Intelligence' ? 1 : 0.6;
    accepted.push({
      ...candidate,
      score: Math.round(
        (specificity * 0.3 + purchase * 0.3 + market * 0.2 + 0.2) * 100,
      ),
    });
  }
  const fallbacks = [
    `${s.motif} Wohnfigur`,
    `${s.motif} Kunstobjekt`,
    `${s.type} Geschenkidee`,
    `${s.motif} Wohnszene`,
    `${s.motif} Liebhaber`,
    `${s.type} Sammlerstück`,
  ];
  for (const value of fallbacks) {
    if (accepted.length >= 13) break;
    const valueTag = tag(value);
    if (
      valueTag &&
      !accepted.some(
        (entry) =>
          entry.tag === valueTag || overlap(entry.tag, valueTag) >= 0.9,
      )
    )
      accepted.push({
        tag: valueTag,
        score: 62,
        reason: 'Differenzierender Produktbegriff',
        source: 'Produktdaten',
        intent: 'Nische',
      });
  }
  const selected = accepted.sort((a, b) => b.score - a.score).slice(0, 13);
  return {
    primary_keyword: selected[0]?.tag || tag(`${s.motif} ${s.type}`),
    tags: selected.map((entry) => entry.tag),
    candidates: selected,
    source: marketTerms.length
      ? 'Produktdaten + Market Intelligence'
      : 'Produktdaten',
    created_at: new Date().toISOString(),
    research_state: marketTerms.length
      ? 'CURRENT_MARKET_RESEARCH'
      : 'NO_MATCHING_RESEARCH',
    confidence: marketTerms.length ? 'high' : 'medium',
  };
}

export type ImagePlanSlot = {
  title: string;
  perspective: string;
  instruction: string;
  format: string;
};
export type ImageSlotStatus =
  | 'DRAFT'
  | 'GENERATED'
  | 'IMPORTED'
  | 'APPROVED'
  | 'REJECTED';
export function imageSlotTransition(
  action: 'create-task' | 'import' | 'approve' | 'reject',
): ImageSlotStatus {
  if (action === 'create-task') return 'GENERATED';
  if (action === 'import') return 'IMPORTED';
  if (action === 'approve') return 'APPROVED';
  return 'REJECTED';
}
export function suggestImagePlan(product: ProductSnapshot): ImagePlanSlot[] {
  const s = productSignals(product);
  const plan: ImagePlanSlot[] = [
    {
      title: 'Hero Shot',
      perspective: '3/4 von vorn',
      instruction:
        'Klares Titelbild mit ruhiger Komposition und vollständig sichtbarem Produkt.',
      format: '4:5',
    },
  ];
  if (s.functional)
    plan.push({
      title: 'Produkt in Funktion',
      perspective: 'nahe 3/4-Perspektive',
      instruction:
        'Die reale Funktion verständlich zeigen; ergänzende Objekte dürfen nicht wie Lieferumfang wirken.',
      format: '4:5',
    });
  plan.push(
    {
      title: '3/4-Perspektive',
      perspective: 'gegenüberliegende 3/4-Ansicht',
      instruction: 'Form und Tiefe aus einer klar anderen Perspektive zeigen.',
      format: '4:5',
    },
    {
      title: s.bust ? 'Profil' : 'Seitenansicht',
      perspective: 'seitlich',
      instruction: 'Silhouette, Tiefe und charakteristische Konturen zeigen.',
      format: '4:5',
    },
    {
      title: 'Rückansicht',
      perspective: 'von hinten',
      instruction: 'Rückseite vollständig und unverfälscht zeigen.',
      format: '4:5',
    },
    {
      title: 'Detailaufnahme',
      perspective: 'Nahaufnahme',
      instruction:
        'Oberfläche und identitätsprägendes Detail zeigen, ohne Details zu erfinden.',
      format: '4:5',
    },
    {
      title: 'Größenkontext',
      perspective: 'leicht erhöht',
      instruction:
        'Glaubwürdigen Größenvergleich herstellen; Proportionen des Produkts nicht verändern.',
      format: '4:5',
    },
    {
      title: 'Geschenk & Lifestyle',
      perspective: 'atmosphärische 3/4-Ansicht',
      instruction:
        'Hochwertige Wohn- oder Geschenkszene in derselben Lichtwelt.',
      format: '4:5',
    },
  );
  if (product.variants.length > 1)
    plan.push({
      title: 'Variantenübersicht',
      perspective: 'frontal',
      instruction:
        'Nur tatsächlich vorhandene Varianten zeigen; jede Variante eindeutig und maßstäblich konsistent.',
      format: '4:5',
    });
  return plan.slice(0, 8);
}

export function buildImageChatTask(input: {
  product: ProductSnapshot;
  slot: {
    id: string;
    title: string;
    perspective: string;
    instruction: string;
    format: string;
  };
  productReferences: Array<{ id: string; filename: string; url: string }>;
  backgroundReference?: { id: string; filename: string; url: string } | null;
  userInstruction?: string;
}) {
  const refs = input.productReferences
    .map(
      (ref, index) =>
        `${index + 1}. ${ref.filename} – ${ref.url} (Produktreferenz ${ref.id})`,
    )
    .join('\n');
  const background = input.backgroundReference
    ? `${input.backgroundReference.filename} – ${input.backgroundReference.url} (nur Stil/Hintergrund, niemals Produktquelle)`
    : 'Keine Hintergrundreferenz; nutze eine ruhige, hochwertige FormPoesie-Studioszene.';
  return `Erzeuge genau EIN einzelnes Etsy-Produktfoto für „${input.product.name}“ im Format ${input.slot.format}. Keine Collage, kein Grid, kein Kontaktbogen, kein Split Screen, keine Mehrfachansicht und kein Moodboard.\n\nAUFNAHME\nSlot: ${input.slot.title}\nPerspektive: ${input.slot.perspective}\nKomposition: ${input.slot.instruction}${input.userInstruction ? `\nZusatzwunsch: ${input.userInstruction}` : ''}\n\nPRODUKTREFERENZEN – ausschließlich diese Bilder definieren Produktform, Geometrie, Farbe, Materialwirkung, Details, Anzahl, Gravuren und reale Proportionen:\n${refs}\n\nHINTERGRUNDREFERENZ – ausschließlich für Umgebung, Licht, Farbwelt, Untergrund und fotografischen Stil:\n${background}\n\nHARTE REGELN\n- Das Produkt kommt ausschließlich aus den Produktreferenzen.\n- Übernimm niemals ein Objekt aus der Hintergrundreferenz als Produkt.\n- Erfinde oder ersetze keine Produktform, Details, Gravuren, Anzahl oder Farben.\n- Zeige genau eine Aufnahme und genau die Perspektive dieses Slots.\n- Das Produkt bleibt vollständig konsistent mit allen bereits erzeugten Bildern dieses Listings.\n- Hochwertige, ruhige Etsy-Ästhetik, glaubwürdige Kontaktfläche, natürliche Schatten, keine irreführenden Props.\n\nErzeuge das Bild direkt im Chat. Ich importiere das einzelne Ergebnis anschließend in den Bildslot ${input.slot.id}.`;
}

export function generateTitles(p: ProductSnapshot, primary: string) {
  const candidates = [
    `${primary} | ${p.buyerWorld} | besondere Deko`,
    `${p.name} – ${p.productType} für Regal & Sideboard`,
    `${p.productType} ${p.name} | Designobjekt als Geschenkidee`,
  ].map((title, i) => ({
    id: String.fromCharCode(65 + i),
    title: title.slice(0, 140),
  }));
  return { candidates, recommended: 'A', selected_title: candidates[0].title };
}
export const generateCartSummary = (p: ProductSnapshot) => ({
  cart_summary: `${p.name}: ${p.productType} in ${p.variants.length} ${p.variants.length === 1 ? 'Variante' : 'Varianten'}.`,
});
export function generateDescription(
  p: ProductSnapshot,
  primary: string,
  prices: Record<string, number | null>,
) {
  const size = (v: (typeof p.variants)[number]) =>
    v.size ||
    ([p.dimensions.width, p.dimensions.depth, p.dimensions.height].every(
      (x) => typeof x === 'number',
    )
      ? `${p.dimensions.width} × ${p.dimensions.depth} × ${p.dimensions.height} mm`
      : '');
  const de = p.variants
    .map(
      (v) =>
        `• ${v.name}${size(v) ? ` – ${size(v)}` : ''}${prices[v.id] ? ` – ${(prices[v.id]! / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}` : ''}`,
    )
    .join('\n');
  const en = p.variants
    .map(
      (v) =>
        `• ${v.name}${size(v) ? ` – ${size(v)}` : ''}${prices[v.id] ? ` – ${(prices[v.id]! / 100).toLocaleString('en-GB', { style: 'currency', currency: 'EUR' })}` : ''}`,
    )
    .join('\n');
  return {
    description_de: `${p.name} ist eine ${p.productType}, die mit klarer Form und ruhiger Präsenz einen besonderen Akzent setzt. Die Suchidee „${primary}“ beschreibt das Objekt, ohne seinen Charakter auf ein Schlagwort zu reduzieren.\n\n📐 WÄHLE DEINE VARIANTE\n${de}\n\n✨ DESIGN & WIRKUNG\nAus verschiedenen Blickwinkeln entwickelt ${p.name} eine eigene Wirkung. Das Objekt kann allein stehen oder eine bewusst zusammengestellte Szenerie ergänzen.\n\n📦 VERSAND\n${DEFAULT_COPY.shipping_de}\n\n✨ FARBE & INDIVIDUALITÄT\n${DEFAULT_COPY.color_de}\n\n🛠️ HERSTELLUNG\n${DEFAULT_COPY.manufacturing_de}\n\n♻️ NACHHALTIGKEIT\n${DEFAULT_COPY.sustainability_de}\n\n⚠️ SICHERHEIT & PRODUKTHINWEISE\n${DEFAULT_COPY.safety_de}`,
    description_en: `${p.name} is a ${p.productType.toLowerCase()} with a clear shape and a calm presence. It creates a distinctive accent without overwhelming its surroundings.\n\n📐 CHOOSE YOUR VARIANT\n${en}\n\n✨ DESIGN & CHARACTER\nViewed from different angles, ${p.name} develops its own visual character. It can stand alone or become part of a thoughtfully composed scene.\n\n📦 SHIPPING\n${DEFAULT_COPY.shipping_en}\n\n✨ COLOR & INDIVIDUALITY\n${DEFAULT_COPY.color_en}\n\n🛠️ MAKING\n${DEFAULT_COPY.manufacturing_en}\n\n♻️ SUSTAINABILITY\n${DEFAULT_COPY.sustainability_en}\n\n⚠️ SAFETY & PRODUCT INFORMATION\n${DEFAULT_COPY.safety_en}`,
  };
}
export function classifyHoliday(p: ProductSnapshot) {
  const match = /halloween|goth|dämon|totenkopf|geist|hex/i.test(
    `${p.name} ${p.productType} ${p.buyerWorld}`,
  );
  return match
    ? {
        classification: 'HOLIDAY_RELEVANT',
        recommended_holiday: 'Halloween',
        reason:
          'Die Gestaltung passt zur Halloween-Suche, wirkt aber zugleich als ganzjährige Gothic-Dekoration.',
      }
    : {
        classification: 'NO_HOLIDAY_RELATION',
        recommended_holiday: null,
        reason:
          'Das Produkt ist nicht erkennbar an einen einzelnen Feiertag gebunden.',
      };
}
