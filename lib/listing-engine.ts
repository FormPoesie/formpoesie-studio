export type ProductInput = {
  id?: string;
  modelName: string;
  productType: string;
  buyerWorld:
    | 'Kunst & Skulptur'
    | 'Dark & Gothic'
    | 'Botanical'
    | 'Functional Art';
  sku?: string;
  material?: string;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  designOrigin?: string;
  inventorySourceId?: string;
  kind: 'sculpture' | 'functional';
  variant: {
    id?: string;
    name: string;
    color?: string;
    setSize: number;
    weightGrams?: number | null;
    printHours?: number | null;
    activeMinutes?: number | null;
    failureRate: number;
  };
  costs: {
    recordedProductionCost?: number | null;
    materialPerKg?: number | null;
    machinePerHour?: number | null;
    electricityPerHour?: number | null;
    electricityIncluded: boolean;
    laborPerHour?: number | null;
    packaging?: number | null;
    overhead?: number | null;
    postage?: number | null;
    buyerShipping?: number | null;
    targetMargin: number;
  };
  research: Array<{
    phrase: string;
    locale: 'de' | 'en';
    relevance: number;
    intent: number;
  }>;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const euro = (n: number) => Math.round(n * 100) / 100;

export function createImagePlan(input: ProductInput, originalCount = 0) {
  const base =
    input.kind === 'functional'
      ? [
          ['Hero', 'Stärkste 3/4-Ansicht ohne Text.'],
          ['Anwendung', 'Zeigt die bestätigte Funktion im Einsatz.'],
          [
            'Größe & Maße',
            'Ordnet bestätigte Abmessungen direkt am Objekt ein.',
          ],
          ['Detail', 'Zeigt Oberfläche oder ein kaufrelevantes Merkmal.'],
          [
            'Lifestyle',
            'Setzt das Produkt maßstäblich plausibel in Wohnkontext.',
          ],
          [
            'Konstruktives Detail',
            'Nur verwenden, wenn es eine zusätzliche Kaufentscheidung beantwortet.',
          ],
        ]
      : [
          ['Hero', 'Stärkste 3/4-Ansicht ohne Text.'],
          [
            'Seite',
            'Zeigt Tiefe und Silhouette aus einer echten weiteren Perspektive.',
          ],
          [
            'Größe & Maße',
            'Ordnet bestätigte Abmessungen direkt am Objekt ein.',
          ],
          ['Detail', 'Zeigt Oberfläche oder ein kaufrelevantes Merkmal.'],
          [
            'Lifestyle',
            'Setzt die Skulptur maßstäblich plausibel in Wohnkontext.',
          ],
        ];
  return base.map(([role, gain], index) => ({
    role,
    gain,
    status:
      role === 'Größe & Maße' && !input.heightMm
        ? 'blocked'
        : index > 0 &&
            originalCount < 2 &&
            ['Seite', 'Konstruktives Detail'].includes(role)
          ? 'needs_photo'
          : 'ready',
  }));
}

function sentence(input: ProductInput, locale: 'de' | 'en') {
  const dims =
    input.widthMm && input.heightMm && input.depthMm
      ? input.widthMm + ' × ' + input.heightMm + ' × ' + input.depthMm + ' mm'
      : locale === 'de'
        ? 'Maße noch zu bestätigen'
        : 'Dimensions to be confirmed';
  if (locale === 'de')
    return {
      intro:
        input.modelName +
        ' ist ' +
        input.productType.toLowerCase() +
        ' mit ruhiger, klarer Form für bewusst gestaltete Räume.',
      details:
        'Modell: ' +
        input.modelName +
        '\nMaße: ' +
        dims +
        '\nMaterial: ' +
        (input.material || 'noch zu bestätigen') +
        '\nVariante: ' +
        input.variant.name +
        '\nSetumfang: ' +
        input.variant.setSize,
      body:
        'Die reduzierte Silhouette setzt einen eigenständigen Akzent, ohne den Raum zu überladen. ' +
        (input.kind === 'functional'
          ? 'Die Anwendung folgt der bestätigten Produktfunktion.'
          : 'Als skulpturales Objekt wirkt die Form aus verschiedenen Blickwinkeln.'),
      note: 'Herstellung, Pflege, Bearbeitungszeit und Einschränkungen werden ergänzt, sobald sie bestätigt sind.\n\nFür Räume, die nach dir aussehen.',
    };
  return {
    intro:
      input.modelName +
      ' is ' +
      input.productType.toLowerCase() +
      ' with a calm, distinct shape for thoughtfully composed spaces.',
    details:
      'Model: ' +
      input.modelName +
      '\nDimensions: ' +
      dims +
      '\nMaterial: ' +
      (input.material || 'to be confirmed') +
      '\nVariant: ' +
      input.variant.name +
      '\nSet size: ' +
      input.variant.setSize,
    body:
      'Its restrained silhouette creates a distinctive focal point without overwhelming the room. ' +
      (input.kind === 'functional'
        ? 'The use shown follows the confirmed product function.'
        : 'As a sculptural object, the shape unfolds from different angles.'),
    note: 'Production, care, processing time and limitations will be added once confirmed.\n\nForm. Function. Feeling.',
  };
}

export function createLocaleContent(input: ProductInput, locale: 'de' | 'en') {
  const material =
    input.material || (locale === 'de' ? 'Material offen' : 'material pending');
  const titles =
    locale === 'de'
      ? [
          input.productType +
            ' ' +
            input.modelName +
            ' – skulpturale Form für besondere Räume',
          input.modelName + ' – ' + input.productType + ' in ' + material,
          input.productType + ' ' + input.modelName + ' – ' + input.buyerWorld,
        ]
      : [
          input.productType +
            ' ' +
            input.modelName +
            ' – sculptural form for considered interiors',
          input.modelName + ' – ' + input.productType + ' in ' + material,
          input.productType + ' ' + input.modelName + ' – ' + input.buyerWorld,
        ];
  const fallback =
    locale === 'de'
      ? [
          input.productType,
          input.productType + ' Deko',
          input.modelName,
          'skulpturale Deko',
          'besondere Wohnidee',
          'Wohnskulptur',
          'Wohnobjekt',
          input.buyerWorld,
          'moderne Skulptur',
          'Kunstobjekt',
          'Design Deko',
          'ruhige Dekoration',
          '3D Druck Kunst',
          'FormPoesie',
        ]
      : [
          input.productType,
          input.productType + ' decor',
          input.modelName,
          'sculptural decor',
          'distinctive home art',
          'minimalist art',
          'home object',
          input.buyerWorld,
          'modern sculpture',
          'art object',
          'design decor',
          'calm interior',
          '3D print art',
          'FormPoesie',
        ];
  const researched = input.research
    .filter((r) => r.locale === locale)
    .sort((a, b) => b.relevance + b.intent - (a.relevance + a.intent))
    .map((r) => r.phrase);
  const tags = Array.from(new Set([...researched, ...fallback]))
    .filter((tag) => tag.length <= 20)
    .slice(0, 13);
  const copy = sentence(input, locale);
  return {
    locale,
    titles: titles.map((t) => t.slice(0, 140)),
    selectedTitle: 0,
    description:
      copy.intro +
      '\n\n' +
      copy.details +
      '\n\n' +
      copy.body +
      '\n\n' +
      copy.note,
    tags,
  };
}

export function calculatePricing(input: ProductInput) {
  const c = input.costs;
  const material =
    ((input.variant.weightGrams || 0) / 1000) * (c.materialPerKg || 0);
  const machine = (input.variant.printHours || 0) * (c.machinePerHour || 0);
  const electricity = c.electricityIncluded
    ? 0
    : (input.variant.printHours || 0) * (c.electricityPerHour || 0);
  const labor =
    ((input.variant.activeMinutes || 0) / 60) * (c.laborPerHour || 0);
  const productionRisk =
    (material + machine + electricity) *
    Math.max(0, Math.min(input.variant.failureRate, 0.8));
  const recordedProduction = c.recordedProductionCost ?? null;
  const calculatedProduction =
    material + machine + electricity + productionRisk;
  const production = recordedProduction ?? calculatedProduction;
  const costs =
    production +
    labor +
    (c.packaging || 0) +
    (c.overhead || 0) +
    (c.postage || 0);
  const shipping = c.buyerShipping || 0;
  const transaction = 0.065,
    payment = 0.04,
    paymentFixed = 0.3,
    listingFeeEstimate = 0.18;
  const target = Math.max(0.05, Math.min(c.targetMargin || 0.3, 0.75));
  const floor =
    (costs +
      paymentFixed +
      listingFeeEstimate -
      shipping * (1 - transaction - payment)) /
    (1 - transaction - payment - target);
  const etsyPrice = Math.max(0.9, Math.ceil(floor) - 0.1);
  const directPrice = Math.ceil(costs / (1 - target)) - 0.1;
  const orderTotal = etsyPrice + shipping;
  const resultWithoutAds =
    orderTotal -
    orderTotal * transaction -
    orderTotal * payment -
    paymentFixed -
    listingFeeEstimate -
    costs;
  const resultWithAds = resultWithoutAds - orderTotal * 0.15;
  const known =
    recordedProduction != null
      ? 7
      : [
          input.variant.weightGrams,
          input.variant.printHours,
          input.variant.activeMinutes,
          c.materialPerKg,
          c.machinePerHour,
          c.laborPerHour,
          c.packaging,
        ].filter((v) => v != null).length;
  return {
    directPrice: euro(directPrice),
    etsyPrice: euro(etsyPrice),
    floorPrice: euro(floor),
    resultWithoutAds: euro(resultWithoutAds),
    resultWithAds: euro(resultWithAds),
    confidence: known >= 7 ? 'hoch' : known >= 4 ? 'mittel' : 'niedrig',
    breakdown: {
      inventoryProduction:
        recordedProduction == null ? 0 : euro(recordedProduction),
      material: recordedProduction == null ? euro(material) : 0,
      machine: recordedProduction == null ? euro(machine) : 0,
      electricity: recordedProduction == null ? euro(electricity) : 0,
      labor: euro(labor),
      productionRisk: recordedProduction == null ? euro(productionRisk) : 0,
      packaging: c.packaging || 0,
      overhead: c.overhead || 0,
      postage: c.postage || 0,
      totalRecordedCosts: euro(costs),
    },
    assumptions: [
      '6,5 % Etsy-Transaktionsgebühr',
      '4 % + 0,30 € Zahlungsbearbeitung (Profil DE)',
      '0,18 € Einstellgebühr als veränderbarer EUR-Näherungswert',
      '15 % Offsite Ads im Risikoszenario',
      recordedProduction == null
        ? c.electricityIncluded
          ? 'Strom ist im Maschinenstundensatz enthalten'
          : 'Strom wird separat berechnet'
        : 'Herstellungskosten wurden aus dem FormPoesie-Inventar übernommen',
    ],
  };
}

export function imageMetadata(
  input: ProductInput,
  roles: ReturnType<typeof createImagePlan>,
) {
  const base = slugify(
    'formpoesie-' + input.modelName + '-' + input.productType,
  );
  return roles.map((item, index) => ({
    ...item,
    order: index + 1,
    title: input.modelName + ' – ' + input.productType + ', ' + item.role,
    filename: base + '-' + slugify(item.role) + '.jpg',
    altText:
      input.productType +
      ' ' +
      input.modelName +
      ' in der Ansicht „' +
      item.role +
      '“' +
      (input.variant.color ? ' in ' + input.variant.color : '') +
      '.',
  }));
}

export function validateProduct(
  input: ProductInput,
  content: ReturnType<typeof createLocaleContent>[],
) {
  const issues: Array<{ level: string; area: string; text: string }> = [];
  if (!input.material)
    issues.push({
      level: 'error',
      area: 'Fakten',
      text: 'Material ist noch nicht bestätigt.',
    });
  if (!input.widthMm || !input.heightMm || !input.depthMm)
    issues.push({
      level: 'error',
      area: 'Fakten',
      text: 'Maße mit allen drei Achsen fehlen.',
    });
  if (!input.designOrigin)
    issues.push({
      level: 'warning',
      area: 'Etsy',
      text: 'Designherkunft und Etsy-Zulässigkeit sind ungeklärt.',
    });
  if (!input.variant.weightGrams || !input.variant.printHours)
    issues.push({
      level: 'error',
      area: 'Preis',
      text: 'Materialverbrauch oder Druckzeit fehlt.',
    });
  for (const locale of content) {
    if (locale.titles.some((t) => t.length > 140))
      issues.push({
        level: 'error',
        area: locale.locale.toUpperCase(),
        text: 'Mindestens ein Titel überschreitet 140 Zeichen.',
      });
    if (locale.tags.some((t) => t.length > 20))
      issues.push({
        level: 'error',
        area: locale.locale.toUpperCase(),
        text: 'Mindestens ein Tag überschreitet 20 Zeichen.',
      });
  }
  return issues;
}
