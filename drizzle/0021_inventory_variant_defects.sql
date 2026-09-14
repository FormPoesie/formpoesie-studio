CREATE TABLE IF NOT EXISTS inventory_variant_defects (
  variant_id TEXT PRIMARY KEY NOT NULL,
  source_variant_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS inventory_variant_defects_source_idx
  ON inventory_variant_defects (source_variant_id);
