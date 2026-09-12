type UnknownRow = Record<string, unknown>;

export const MACHINE_COST_CENTS_PER_HOUR = 10;
export const ELECTRICITY_COST_CENTS_PER_HOUR: Record<string, number> = {
  'A1 Mini': 3,
  X2D: 9,
};
export const PRINTERS = ['X2D', 'A1 Mini'] as const;

function numeric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function textual(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function list(value: unknown): UnknownRow[] {
  return Array.isArray(value) ? (value as UnknownRow[]) : [];
}

export function machineCostCents(printMinutes: number) {
  if (!Number.isFinite(printMinutes) || printMinutes <= 0) return 0;
  return Math.round((printMinutes / 60) * MACHINE_COST_CENTS_PER_HOUR);
}

export function electricityCostCents(
  printer: string | null | undefined,
  printMinutes: number,
) {
  const perHour = printer ? ELECTRICITY_COST_CENTS_PER_HOUR[printer] || 0 : 0;
  if (!Number.isFinite(printMinutes) || printMinutes <= 0 || perHour <= 0)
    return 0;
  return Math.round((printMinutes / 60) * perHour);
}

export function filamentCostCents(
  grams: number,
  pricePerRollCents: number,
  spoolWeightGrams: number,
) {
  if (grams <= 0 || pricePerRollCents <= 0 || spoolWeightGrams <= 0) return 0;
  return Math.round((grams * pricePerRollCents) / spoolWeightGrams);
}

function materialOf(row: UnknownRow) {
  return row.material && typeof row.material === 'object'
    ? (row.material as UnknownRow)
    : {};
}

function materialCost(row: UnknownRow, grams: number) {
  const material = materialOf(row);
  return filamentCostCents(
    grams,
    numeric(material.pricePerRollCents),
    numeric(material.spoolWeightGrams),
  );
}

function effectiveFilaments(product: UnknownRow, variant: UnknownRow) {
  const variantId = textual(variant.id);
  const all = list(product.filaments);
  const shared = all.filter((row) => !textual(row.productVariantId));
  const own = all.filter(
    (row) => textual(row.productVariantId) === variantId && variantId,
  );
  const replaced = new Set(
    own
      .map((row) => textual(row.part).trim().toLocaleLowerCase('de'))
      .filter(Boolean),
  );
  const merged = [
    ...shared.filter(
      (row) => !replaced.has(textual(row.part).trim().toLocaleLowerCase('de')),
    ),
    ...own,
  ];
  return numeric(variant.grams) > 0
    ? merged.filter((row) => textual(row.part).trim() !== '')
    : merged;
}

export function variantProductionIssues(
  product: UnknownRow,
  variant: UnknownRow,
) {
  const priceCents = Math.max(0, Math.round(numeric(variant.priceCents)));
  const category = textual(product.category);
  const doesNotRequirePrinting =
    /stl|digital|zubehör|zubehoer|zukauf|einkauf|handelsware/i.test(category);
  const issues: string[] = [];
  if (priceCents <= 0) issues.push('Verkaufspreis fehlt');
  if (doesNotRequirePrinting) return issues;

  const filaments = effectiveFilaments(product, variant);
  const ownWeight = numeric(variant.grams) + numeric(variant.wasteGrams);
  const totalWeight =
    ownWeight +
    filaments.reduce(
      (sum, row) => sum + numeric(row.grams) + numeric(row.wasteGrams),
      0,
    );
  const ownHasMaterial = Boolean(textual(materialOf(variant).id));
  const everyPartHasMaterial = filaments
    .filter((row) => numeric(row.grams) + numeric(row.wasteGrams) > 0)
    .every((row) => Boolean(textual(materialOf(row).id)));
  const hasMaterial =
    (ownWeight <= 0 || ownHasMaterial) && everyPartHasMaterial;
  if (totalWeight <= 0) issues.push('Gewicht fehlt');
  if (!hasMaterial) issues.push('Filament fehlt');

  const timedParts = filaments.filter((row) => numeric(row.printMinutes) > 0);
  const printMinutes = timedParts.length
    ? timedParts.reduce((sum, row) => sum + numeric(row.printMinutes), 0)
    : numeric(variant.printMinutes);
  if (printMinutes <= 0) issues.push('Druckzeit fehlt');
  const hasPrinter = timedParts.length
    ? timedParts.every(
        (row) => textual(row.printer) || textual(variant.printer),
      )
    : Boolean(textual(variant.printer));
  if (!hasPrinter) issues.push('Drucker fehlt');
  return issues;
}

function componentCosts(
  product: UnknownRow,
  variant: UnknownRow,
  products: UnknownRow[],
  components: UnknownRow[],
) {
  const relevant = components.filter((row) => {
    if (textual(row.parentProductId) !== textual(product.id)) return false;
    const parentVariantId = textual(row.parentVariantId);
    return !parentVariantId || parentVariantId === textual(variant.id);
  });
  const costs = relevant.map((row) => {
    const componentProduct = products.find(
      (item) => textual(item.id) === textual(row.componentProductId),
    );
    const componentVariant = list(componentProduct?.variants).find(
      (item) => textual(item.id) === textual(row.componentVariantId),
    );
    const unitCost =
      numeric(componentVariant?.productionCostCents) ||
      numeric(componentProduct?.productionCostCents);
    return {
      slot: textual(row.slot).trim().toLocaleLowerCase('de'),
      cents: Math.max(0, Math.trunc(numeric(row.quantity))) * unitCost,
    };
  });
  let total = 0;
  const slots = new Map<string, number>();
  for (const item of costs) {
    if (!item.slot) total += item.cents;
    else slots.set(item.slot, Math.max(slots.get(item.slot) || 0, item.cents));
  }
  for (const value of slots.values()) total += value;
  return total;
}

export type VariantCostBreakdown = {
  netGrams: number;
  wasteGrams: number;
  filamentCents: number;
  wasteCents: number;
  machineCents: number;
  electricityCents: number;
  extraCents: number;
  componentsCents: number;
  totalCents: number;
  printMinutes: number;
  marginCents: number;
  marginPercent: number | null;
};

export function variantCostBreakdown(
  product: UnknownRow,
  variant: UnknownRow,
  products: UnknownRow[] = [],
  components: UnknownRow[] = [],
): VariantCostBreakdown {
  const filaments = effectiveFilaments(product, variant);
  const ownMaterial = materialOf(variant);
  const ownNet = numeric(variant.grams);
  const ownWaste = numeric(variant.wasteGrams);
  const ownHasMaterial = Boolean(textual(ownMaterial.id));
  const filamentCents =
    (ownHasMaterial ? materialCost(variant, ownNet) : 0) +
    filaments.reduce(
      (sum, row) => sum + materialCost(row, numeric(row.grams)),
      0,
    );
  const wasteCents =
    (ownHasMaterial ? materialCost(variant, ownWaste) : 0) +
    filaments.reduce(
      (sum, row) => sum + materialCost(row, numeric(row.wasteGrams)),
      0,
    );
  const partHasTime = filaments.some((row) => numeric(row.printMinutes) > 0);
  const printMinutes = partHasTime
    ? filaments.reduce(
        (sum, row) => sum + Math.round(numeric(row.printMinutes)),
        0,
      )
    : Math.round(numeric(variant.printMinutes));
  const machineCents = partHasTime
    ? filaments.reduce(
        (sum, row) => sum + machineCostCents(numeric(row.printMinutes)),
        0,
      )
    : machineCostCents(printMinutes);
  const electricityCents = partHasTime
    ? filaments.reduce(
        (sum, row) =>
          sum +
          electricityCostCents(
            textual(row.printer) || textual(variant.printer),
            numeric(row.printMinutes),
          ),
        0,
      )
    : electricityCostCents(textual(variant.printer), printMinutes);
  const extraCents = Math.max(0, Math.round(numeric(variant.extraCostCents)));
  const componentsCents = componentCosts(
    product,
    variant,
    products,
    components,
  );
  const totalCents =
    filamentCents +
    wasteCents +
    machineCents +
    electricityCents +
    extraCents +
    componentsCents;
  const priceCents = Math.max(0, Math.round(numeric(variant.priceCents)));
  const marginCents = priceCents - totalCents;
  const calculationComplete =
    variantProductionIssues(product, variant).length === 0;
  return {
    netGrams:
      ownNet + filaments.reduce((sum, row) => sum + numeric(row.grams), 0),
    wasteGrams:
      ownWaste +
      filaments.reduce((sum, row) => sum + numeric(row.wasteGrams), 0),
    filamentCents,
    wasteCents,
    machineCents,
    electricityCents,
    extraCents,
    componentsCents,
    totalCents,
    printMinutes,
    marginCents,
    marginPercent:
      priceCents > 0 && calculationComplete
        ? (marginCents / priceCents) * 100
        : null,
  };
}
