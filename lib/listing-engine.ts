export type ProductVariantInput = {
  id?: string;
  inventoryVariantId?: string;
  name: string;
  sku?: string;
  color?: string;
  material?: string;
  size?: string;
  setSize: number;
  weightGrams?: number | null;
  printHours?: number | null;
  activeMinutes?: number | null;
  failureRate: number;
  recordedProductionCost?: number | null;
  currentPrice?: number | null;
};

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
  sourceImagePath?: string;
  kind: 'sculpture' | 'functional';
  variant: ProductVariantInput;
  variants?: ProductVariantInput[];
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

export function createStandardDescription(
  input: ProductInput,
  locale: 'de' | 'en',
) {
  const variants = input.variants?.length ? input.variants : [input.variant];
  const variantLines = variants.map((variant) => {
    const details = [variant.name, variant.size, variant.material]
      .map((value) => value?.trim())
      .filter(Boolean);
    return `• ${details.join(' – ') || (locale === 'de' ? 'Standard' : 'Standard')}`;
  });
  const verifiedDimensions =
    input.widthMm && input.heightMm && input.depthMm
      ? locale === 'de'
        ? `Bestätigte Artikelmaße: ${input.widthMm} × ${input.heightMm} × ${input.depthMm} mm`
        : `Verified product dimensions: ${input.widthMm} × ${input.heightMm} × ${input.depthMm} mm`
      : '';
  const audience =
    locale === 'de'
      ? {
          'Dark & Gothic':
            'für Menschen mit Liebe zu Gothic, Dark Fantasy, Dark Academia und ausdrucksstarker Kunst',
          Botanical:
            'für Menschen mit Liebe zu Naturmotiven, organischen Formen und besonderer Wohndekoration',
          'Functional Art':
            'für Menschen, die klare Gestaltung und eine praktische Funktion miteinander verbinden möchten',
          'Kunst & Skulptur':
            'für Menschen mit Liebe zu eigenständiger Kunst und bewusst gestalteten Räumen',
        }[input.buyerWorld]
      : {
          'Dark & Gothic':
            'for people drawn to gothic style, dark fantasy, dark academia, and expressive art',
          Botanical:
            'for people who love nature-inspired motifs, organic shapes, and distinctive home decor',
          'Functional Art':
            'for people who want clear design and practical function to work together',
          'Kunst & Skulptur':
            'for people who love distinctive art and thoughtfully composed interiors',
        }[input.buyerWorld];
  if (locale === 'de')
    return `${input.modelName} ist ${input.productType.toLowerCase()} mit einer eigenständigen Formensprache. Das Motiv setzt einen besonderen Akzent, ohne den Raum zu überladen, und lässt sich bewusst mit unterschiedlichen Einrichtungsstilen kombinieren.

Ein besonderes Objekt für Regal, Sideboard oder Schreibtisch und eine Geschenkidee ${audience}. ${input.kind === 'functional' ? 'Die Gestaltung verbindet die bestätigte Funktion mit der für FormPoesie typischen ruhigen Formsprache.' : 'Als skulpturales Objekt entfaltet die Form ihre Wirkung aus verschiedenen Blickwinkeln.'}

📐 Varianten & Maße:
${variantLines.join('\n')}${verifiedDimensions ? `\n${verifiedDimensions}` : ''}

💀 Bedeutung & Gefühl:
Welche Wirkung entwickelt ${input.modelName} im Raum?

Das Motiv lässt bewusst Raum für eine persönliche Interpretation. Licht, Schatten, Farbe und Blickwinkel verändern seine Wirkung und machen das Objekt zu einem ruhigen, individuellen Blickfang. So kann es allein stehen oder Teil einer bewusst zusammengestellten Szenerie werden.

📦 Kostenloser Versand ab 50 € im Inland mit dem Code „GRATISVERSAND“

✨ Farbe & Individualität:
Die gezeigten Bilder geben dir einen Eindruck verschiedener möglicher Farben und Wirkungen. Deine Wunschfarbe ist nicht dabei? Schreib mir einfach – weitere Farbtöne sind auf Anfrage möglich.

❓ Fragen zu Farbe oder Größe? Schreib mir vor der Bestellung – ich helfe gerne!

🛠️ Handgefertigt in Deutschland:
Jedes Exemplar wird einzeln gedruckt und von mir persönlich sorgfältig nachbearbeitet. Die feinen Drucklinien sind Teil seines modernen, technologischen Charakters – kein Industrieprodukt, sondern ein individuell gefertigtes Designobjekt.

♻️ Nachhaltigkeit:
Ich glaube nicht, dass etwas Schönes auf Kosten der Welt entstehen muss. Deshalb gehen Filamentreste und defekte Waren gesammelt an die Recycling Fabrik GmbH – damit aus Resten wieder Rohstoff wird, statt Müll. Versandt wird so oft es geht in bereits verwendeten Kartons – bewusst, konsequent, ohne Kompromisse.

⚠️ Sicherheits- & Produkthinweise:
${input.kind === 'functional' ? 'Bitte verwende den Artikel ausschließlich für die beschriebene, bestätigte Funktion.' : 'Bitte beachte, dass es sich bei diesem Artikel um ein dekoratives Designobjekt und ausdrücklich nicht um ein Spielzeug handelt.'} Einzelne Elemente können filigran gearbeitet sein. Bei einem Materialbruch können scharfe Kanten entstehen. Der Artikel ist daher nicht für Kinder unter 14 Jahren geeignet.

Der Artikel ist für den Innenbereich gedacht. Platziere ihn nicht dauerhaft im Außenbereich oder hinter Glas bei direkter, intensiver Sonneneinstrahlung – ab etwa 60 °C kann PLA weich werden und sich dauerhaft verformen. Reinige ihn bei Bedarf schonend per Hand mit einem feuchten Tuch. Nicht spülmaschinengeeignet. Die verwendeten Materialien sind grundsätzlich nicht lebensmittelecht und sollten nicht mit Lebensmitteln in Kontakt kommen.`;
  return `${input.modelName} is ${input.productType.toLowerCase()} with a distinctive visual language. The motif creates a considered focal point without overwhelming the room and can be combined with a range of interior styles.

A distinctive object for a shelf, sideboard, or desk and a thoughtful gift ${audience}. ${input.kind === 'functional' ? 'The design combines its confirmed function with FormPoesie’s characteristic calm visual language.' : 'As a sculptural object, the form unfolds from different viewing angles.'}

📐 Variants & Dimensions:
${variantLines.join('\n')}${verifiedDimensions ? `\n${verifiedDimensions}` : ''}

💀 Meaning & Feeling:
What kind of atmosphere does ${input.modelName} create?

The motif deliberately leaves room for personal interpretation. Light, shadow, color, and viewing angle change its effect and turn the object into a calm, individual focal point. It can stand alone or become part of a carefully composed scene.

📦 Free domestic shipping on orders over €50 with the code “GRATISVERSAND”

✨ Color & Individuality:
The images shown give you an impression of different possible colors and effects. Is your preferred color not shown? Just send me a message – additional shades are available on request.

❓ Questions about color or size? Message me before placing your order – I’m happy to help.

🛠️ Handcrafted in Germany:
Each piece is printed individually and carefully hand-finished by me personally. The fine print lines are part of its modern, technological character – not an industrial product, but an individually crafted design object.

♻️ Sustainability:
I don’t believe that creating something beautiful should come at the expense of our planet. That is why filament scraps and defective goods are collected and sent to Recycling Fabrik GmbH – turning leftovers back into raw materials instead of waste. Whenever possible, orders are shipped in repurposed cardboard boxes – intentional, consistent, and without compromises.

⚠️ Safety & Product Information:
${input.kind === 'functional' ? 'Please use this item only for its described and confirmed function.' : 'Please note that this item is a decorative design object and strictly not a toy.'} Some elements may be finely detailed. Sharp edges may occur in the event of material breakage. This item is therefore not suitable for children under 14 years of age.

The item is intended for indoor use. Please do not place it permanently outdoors or behind glass in direct, intense sunlight – from around 60°C (140°F) upward, PLA can soften and permanently deform. Clean gently by hand with a damp cloth if needed. Not dishwasher safe. The materials used are generally not food-safe and should not come into contact with food.`;
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
  return {
    locale,
    titles: titles.map((t) => t.slice(0, 140)),
    selectedTitle: 0,
    description: createStandardDescription(input, locale),
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
  issues.push(...validateListingContent(content));
  return issues;
}

export type ListingContentInput = {
  locale: string;
  titles: string[];
  selectedTitle: number;
  description: string;
  tags: string[];
};

export function validateListingContent(content: ListingContentInput[]) {
  const issues: Array<{ level: string; area: string; text: string }> = [];
  for (const locale of ['de', 'en']) {
    const entry = content.find((item) => item.locale === locale);
    const area = locale.toUpperCase();
    if (!entry) {
      issues.push({
        level: 'error',
        area,
        text: 'Listing-Inhalt fehlt.',
      });
      continue;
    }
    if (!entry.titles.length || entry.titles.some((title) => !title.trim()))
      issues.push({ level: 'error', area, text: 'Ein Titel ist leer.' });
    if (entry.titles.some((title) => title.length > 140))
      issues.push({
        level: 'error',
        area,
        text: 'Mindestens ein Titel überschreitet 140 Zeichen.',
      });
    if (!entry.titles[entry.selectedTitle])
      issues.push({
        level: 'error',
        area,
        text: 'Kein gültiger bevorzugter Titel ausgewählt.',
      });
    if (!entry.description.trim())
      issues.push({ level: 'error', area, text: 'Beschreibung fehlt.' });
    if (!entry.tags.length)
      issues.push({ level: 'error', area, text: 'Tags fehlen.' });
    if (entry.tags.length > 13)
      issues.push({
        level: 'error',
        area,
        text: 'Mehr als 13 Tags sind nicht zulässig.',
      });
    if (entry.tags.some((tag) => tag.length > 20))
      issues.push({
        level: 'error',
        area,
        text: 'Mindestens ein Tag überschreitet 20 Zeichen.',
      });
    const normalizedTags = entry.tags.map((tag) =>
      tag.trim().toLocaleLowerCase(locale),
    );
    if (new Set(normalizedTags).size !== normalizedTags.length)
      issues.push({
        level: 'warning',
        area,
        text: 'Doppelte Tags sollten entfernt werden.',
      });
  }
  return issues;
}
