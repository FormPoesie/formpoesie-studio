# Pricing- und Portfolio-Engine – Bestandsanalyse

Stand: 11.09.2026. Diese Analyse ist Phase 1 der Implementierung und beschreibt den vorgefundenen Stand vor den Pricing-Änderungen.

## 1. Relevante bestehende Architektur

- Die Anwendung ist eine Vinext/React-Anwendung auf Cloudflare Workers.
- Supabase ist die operative Quelle für Artikel, Varianten, Materialien, Filamente, Produktionsdaten, Märkte, Marktverkäufe, Online-Verkäufe und Ausgaben.
- D1 enthält ergänzende Studio-Metadaten und langlebige Workflows. R2 enthält geschützte Dateien.
- `lib/inventory-production.ts` enthält den bestehenden Produktionskostenrechner. Sein `VariantCostBreakdown.totalCents` ist die einzige COGS-Quelle für die neue Engine.
- `app/api/inventory/workspace/route.ts` bündelt die geschützten Supabase-/D1-Daten für die interne Arbeitsfläche.
- `components/inventory-workspace.tsx` ist die bestehende Artikel-, Markt-, Kassen- und Verkaufsoberfläche.

## 2. Wiederverwendbare Komponenten

| Status | Bereich | Verwendung |
| --- | --- | --- |
| EXISTIERT | Artikel und Varianten | Supabase `products` / `product_variants` |
| EXISTIERT | Produktionskosten | `variantCostBreakdown(...).totalCents` als COGS |
| EXISTIERT | Maße | Produktfelder `width_mm`, `height_mm`, `depth_mm` |
| EXISTIERT | Reale Verkäufe | `sales`, `sale_items`, `online_sales` |
| EXISTIERT | Kanäle | Markt sowie freie Online-Kanalbezeichnung |
| EXISTIERT | Kostenverwaltung | Markt- und sonstige Ausgaben |
| WIEDERVERWENDBAR | Designer/Lizenzgeber | zentrale `designers`-Zuordnung und `commercial_license` |
| WIEDERVERWENDBAR | Dashboard | priorisierte Hinweise können in das bestehende Dashboard eingebettet werden |
| WIEDERVERWENDBAR | Persistenz/API | D1-Migrationen und geschützte Route mit bestehender Rollenprüfung |
| WIEDERVERWENDBAR | UI-System | bestehende Cards, Tabs, Dialoge, Eingaben und FormPoesie-Tokens |

Bestehende Verkaufspreise (`price_cents`, `default_price_cents`) werden ausschließlich als Vergleich angezeigt. Sie sind kein Rechenparameter.

## 3. Erforderliche Datenmodelländerungen

- D1-Assetmodell für Motiv/Person, Themencluster und gemeinsam gepflegte Nachfrage-/Konkurrenzwerte.
- D1-Produktprofil für Produkttyp, Marktgruppe, Tier, räumliche Präsenz, Value-Faktoren, Saison und digitale Lizenzrechte.
- Unveränderliche Empfehlungshistorie mit COGS-, Eingabe-, Konfigurations- und Ergebnis-Snapshot.
- Persistente B-Ware-Prüfungen und Markt-Istwerte.
- Zentrale, versionierbare Pricing-Konfiguration; Code-Defaults bleiben funktionsfähiger Fallback.

Alle neuen Felder sind nullable oder besitzen neutrale Defaults. Bestehende Supabase-Daten werden nicht verändert oder migriert.

## 4. Geplante neue Services/Funktionen

- Reine Funktionen für Mindestdeckungsbeitrag, Kanalinversion, Präsenz, Wert, Nachfrage/Konkurrenz, Marktanker, Rundung und Rabattsicherheit.
- Getrennte Engine für physische und digitale Produkte.
- B-Ware-Engine mit harten Sicherheits-/Funktions-/Offenlegungs-Gates.
- Portfolio-Auswertung nur aus vorhandenen Verkaufsfeldern, mit Kaltstart-, Saison- und Kleinstichprobenregeln.
- Geschützte Pricing-API zum Laden/Speichern von Profilen und unveränderlichen Empfehlungen.
- In die bestehende Arbeitsfläche integrierte, erklärende Pricing- und Portfolio-Oberfläche.

## 5. Migrationsrisiken

- Supabase-Verkaufszeilen besitzen historisch nicht überall Gebühren-, Rabatt-, Varianten- oder COGS-Snapshots. Fehlende Werte werden als unbekannt behandelt, nie erfunden.
- Maße können fehlen. Dann wird kein scheinpräziser physischer Marktanker berechnet; der Kosten-Floor bleibt verfügbar und die Confidence ist niedrig.
- Der bisherige Listing-Rechner enthält eine ältere, eigenständige Kosten-/Margenformel. Er wird auf die neue Engine abgebildet, ohne den Inventar-Kostenrechner zu ersetzen.
- Digitale Weiterverkaufsrechte sind bisher nicht präzise abgebildet. Unklare oder fehlende Freigaben führen zu `BLOCKED_LICENSE`.
- Der registrierte Sites-Projektverweis ist derzeit nicht über die Sites-Schnittstelle auflösbar. Das blockiert keine lokale Implementierung, kann aber eine spätere Veröffentlichung betreffen.

## 6. Implementierungsplan

1. Zentrale Konfiguration und pure Pricing Engine.
2. Vollständige Unit-/Invariantentests der spezifizierten Fälle.
3. Additive D1-Migration und geschützte API.
4. Pricing-/B-Ware-/Portfolio-Oberfläche im bestehenden Design.
5. Anbindung an reale Produkt- und Verkaufsdaten.
6. TypeScript, Lint, Tests und Produktionsbuild; anschließend Regressionen beheben.

