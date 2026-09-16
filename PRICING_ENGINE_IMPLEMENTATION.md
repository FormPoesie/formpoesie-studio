# Pricing Engine – Implementierungsbericht

Stand: 14.09.2026

## 1. Analysierte Bestandsarchitektur

Die Anwendung ist eine Vinext-/React-Anwendung auf Cloudflare Workers. Supabase hält die operativen Artikel-, Varianten-, Produktions- und Verkaufsdaten; D1 ergänzt Studio-Metadaten, Pricing-Profile, Empfehlungen, B-Ware-Prüfungen und Marktergebnisse. `variantCostBreakdown(...).totalCents` aus `lib/inventory-production.ts` bleibt die einzige COGS-Quelle.

## 2. Integrationsmatrix

| Status | Struktur | Umsetzung |
| --- | --- | --- |
| EXISTIERT | Produkte, Varianten, Maße, Standardpreise | direkt aus dem Inventory-Workspace übernommen |
| EXISTIERT | Produktionskostenrechner | `totalCents` unverändert als COGS verwendet |
| EXISTIERT | Verkäufe und Portfolio-Daten | ausschließlich reale Verkäufe aggregiert |
| WIEDERVERWENDBAR | D1 Pricing-Profile und Assets | für Kategorie, Tier, Saison, Lizenz, Demand und Competition verwendet |
| WIEDERVERWENDBAR | Empfehlungshistorie | erst bei ausdrücklichem Speichern befüllt |
| ERWEITERT | Kanalpreise | bestehende Tabelle additiv um Direkt und eBay ergänzt |
| ERWEITERT | Pricing Domain | All-Channel-Lauf, Validierung, Parameterquellen und getrennte Rabattgrenzen |
| ERWEITERT | Pricing UI | automatische Ergebnisansicht, optionale erweiterte Parameter, Draft/Save-Grenze |
| NEU ERFORDERLICH | Migration 0022 | Direct-/eBay-Preise hatten keine persistierbaren Spalten |

## 3. Architekturgrenzen und wiederverwendete Strukturen

- Rechenlogik bleibt in puren Funktionen in `lib/pricing-engine.ts`.
- Kanal- und Seed-Regeln bleiben zentral in `lib/pricing-config.ts`.
- Die UI berechnet aus einem einmal geladenen Kontext lokal; keine Datenbankabfrage pro Parameteränderung.
- Bestehende aktive Preise werden nur zum Vergleich gelesen und nie als Formeleingabe verwendet.
- Persistenz nutzt die bestehende Inventory-API und Pricing-Historie.

## 4. Pricing-, Channel- und Digital-Engine

- Physischer Floor: COGS plus `max(5 €, 40 % COGS)` plus kanalspezifische Folgekosten.
- Marktanker bleibt vollständig vom Kosten-Floor getrennt.
- Etsy-Gebühren werden algebraisch invertiert; Offsite 0/12/15 % bleibt als Diagnose sichtbar.
- Etsy-, Direkt-, Vinted-, eBay- und Marktpreise werden in einem Lauf separat berechnet.
- Marktkosten werden nur dem Marktkanal zugerechnet.
- Fehlende Maße verwenden Präsenz 1,00 mit `REVIEW`; fehlende/Null-COGS blockieren physisches Pricing.
- Digitalprodukte verwenden Quantilinterpolation und Preisleiter; ohne belegtes Redistribution-Recht bleibt der Preis blockiert.
- Normalisierte Eingaben, COGS und Channel IDs liefern konkrete Fehlerstatus statt NaN/Infinity.

## 5. B-Ware und Portfolio-Wächter

Die vorhandene B-Ware-Engine behält Safety-, Structural-, Function- und Disclosure-Gates sowie semantische Mängeldefaults und Recovery Floor. Der Portfolio-Wächter wertet nur vorhandene Verkäufe aus, trennt SKU/Variante/Kanal und berücksichtigt Kaltstart, Kleinstichproben und Saison; er persistiert keine Preise.

## 6. Zero-Input UX und Persistenz

Beim Auswählen eines Artikels/einer Variante werden COGS, Maße, aktive Kanalpreise, Profil, Asset und Lizenz automatisch geladen. Demand/Competition werden aus dem Profil, ersatzweise aus dem Asset, sonst neutral übernommen. Alle Kanalempfehlungen erscheinen ohne Berechnen-Schritt. Erweiterte Parameter einschließlich Value-Scores sind standardmäßig eingeklappt.

`Preise übernehmen` erzeugt ausschließlich eine neue lokale Draft-Kopie. `Speichern` persistiert anschließend die bestätigten fünf Kanalpreise, das Profil und genau einen Empfehlungssnapshot pro Kanal. Abbrechen bzw. Artikel-/Variantenwechsel verwirft den Draft. Automatische Rechenläufe schreiben nichts.

## 7. Migration und Backfill

`drizzle/0022_inventory_all_channel_prices.sql` ergänzt nullable `direct_price_cents` und `ebay_price_cents`. Bestehende Zeilen bleiben gültig. Solange kein eigener Kanalpreis vorhanden ist, fällt die Leseansicht rückwärtskompatibel auf den bestehenden Standardpreis zurück; ein Daten-Backfill ist daher nicht erforderlich.

## 8. Tests und Verifikation

- Unit-/Regression-/Invariantentests: 92 bestanden.
- TypeScript: `npx tsc --noEmit` bestanden.
- Produktionsbuild: `npm run build` bestanden.
- Projekt-Lint: drei bereits vor dieser Änderung vorhandene Fehler in `app/page.tsx` (Zeilen 4090, 4478, 4491); die Pricing-Domain/API/Schema-Tests sind lint-frei. `components/` ist im bestehenden `npm run lint` nicht enthalten und besitzt zusätzliche vorbestehende Befunde.
- Buildhinweis: bestehende Warnung für einen Client-Chunk über 500 kB; kein Buildfehler.

## 9. Geänderte Dateien

- `lib/pricing-engine.ts`: Domain-Validierung, All-Channel-Berechnung, Draft-Übernahme, Rabattdiagnostik und Parameterquellen.
- `components/pricing-workspace.tsx`: automatische Context-Aggregation, fünf Ergebnisse, eingeklappte Overrides und expliziter Draft-/Save-Workflow.
- `components/inventory-workspace.tsx`: Bezeichnung „Preisvorschläge“ und Anzeige aller fünf Kanalpreise.
- `app/api/inventory/workspace/route.ts`: Lesen und Speichern von Direct-/eBay-Kanalpreisen.
- `db/schema.ts`: additive Spaltenabbildung.
- `drizzle/0022_inventory_all_channel_prices.sql`: rückwärtskompatible Migration.
- `tests/pricing-engine.test.ts`: All-Channel-, Markt-Kosten-, Validierungs-, Rabatt- und Draft-Regressionen.

## 10. Echte Einschränkungen

- eBay, Vinted und Direkt besitzen getrennte Konfigurationsobjekte, verwenden aber bis zur Pflege belastbarer realer Gebühren neutrale Gebührenwerte. Es wurden keine Business-Werte erfunden.
- Externe Research-Daten werden vom bestehenden Market-Watch-Subsystem geliefert. Nur bereits gespeicherte Profil-/Assetwerte fließen automatisch in die normale Berechnung ein; ungeprüfte externe Beobachtungen verändern keine Preise.
- Die Migration muss vor der ersten Speicherung von Direct-/eBay-Preisen in der Zielumgebung ausgeführt werden.
