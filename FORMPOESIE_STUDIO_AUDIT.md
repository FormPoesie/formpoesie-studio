# FORMPOESIE STUDIO – Bestandsaufnahme und Lieferplan

Stand: 09.09.2026. Dieses Dokument trennt vorhandene Funktion, Reparatur und neue Backend-Arbeit. Es ist keine Fertigmeldung.

## Vorhandene zentrale Datenquellen

- Supabase-Inventar: Benutzer/Profile/Rollen, Artikel, Varianten, Filamente, Material, Markt-/Regalzeiträume, lokale Bestände, Verkäufe, Online-Verkäufe und Ausgaben.
- D1-Ergänzungen: Etsy-Entwürfe, Listing-Inhalte, Bildpläne, verschlüsselter Passwort-Tresor, News-Archiv, Designer-Monitorstatus, Aktivitätsfeed, Regal-/Marktklassifikation, Fulfillment-Aufgaben und Monatsmodelle.
- R2: Etsy-Originalbilder. Inventarbilder liegen weiterhin im bestehenden Supabase-Bucket und werden geschützt ausgeliefert.

## In diesem Lieferabschnitt umgesetzt oder repariert

- Branding auf `FORMPOESIE STUDIO · Interne Arbeitsfläche` umgestellt; vorhandenes FormPoesie-Icon in Login und Navigation verwendet.
- Vollständige mobile Navigation mit geschützten Verwaltungsbereichen und persönlichen Kontofunktionen über das Profil-Icon.
- Inventar fachlich auf Artikel und Material reduziert; Märkte, Regalflächen, Kasse, Monatsübersicht und Verkaufshistorie bleiben eigenständige Einstiege.
- „Buchungen der Woche“ entfernt; Dashboard zeigt verkaufte Stück, Umsatz und stärksten Artikel.
- Social-Media-Direktzugriffe ohne Passwörter auf dem Dashboard.
- Newsbilder werden im Tagesfeed und in der mobilen Kalenderansicht angezeigt, wenn die Quelle ein Bild liefert.
- Etsy-Workflow übernimmt alle Varianten, zeigt Artikelbild und Variantenzahl und leitet Käuferwelt/Lizenz aus zentralen Artikeldaten ab. Varianten bleiben vor Erstellung prüfbar.
- Inventarfilter „Nichts auf Lager“ und „Marge unklar“ entfernt.
- Sortierung auf eine Sortierart plus Richtung reduziert; „Zuletzt bearbeitet“ ergänzt.
- Persistente Massenbearbeitung für die gemeinsame Kategorie mehrerer Artikel ergänzt.
- Abo-Status `Laufend` und `Gekündigt` getrennt; gekündigte Einträge bleiben erhalten.
- Katalogübersicht und Bestellformular als auffindbare, responsive Bereiche ergänzt.

## Vorhanden, aber noch weiter abzusichern

- Inventarbild-Upload, Variantenbearbeitung, Kostenformeln und Markt-/Regal-Kassen verwenden die bestehende Supabase-Logik.
- Designer-Beobachtung speichert Konfiguration und Prüfergebnis in D1; die manuelle Prüfung existiert. Ein verlässlicher externer Zeitplan muss beim Hosting noch separat geprüft werden.
- News-Synchronisierung besitzt dieselbe Logik für geplanten und manuellen Lauf.
- Verwaltung ist im Frontend und in den Lese-APIs für Monatsübersicht/Verkaufshistorie auf Marlon/Jasmin begrenzt.

## Noch offen – neue Backend-/Migrationsarbeit

- Artikelstatus `Entwurf`/`Final`, Bestätigungsdatum und `Auf Etsy inseriert` als zentrale Inventarmetadaten samt Migration und UI.
- Mehrere Bilder mit definierbarem Hauptbild.
- Mehrere interne STL-/Druckdateien pro Artikel mit geschütztem Download.
- Vollständige Bulk-Aktionen über Kategorie hinaus, inklusive Vorschau.
- Allgemeine Kasse von Markt-/Regal-RPC trennen; nur Abholung, eBay, eBay Kleinanzeigen, Vinted, Etsy und Bestellformular. Das vorhandene Online-Sale-Schema muss vor realen Buchungen exakt verifiziert werden.
- Rechnungsdaten, eindeutige Rechnungsnummer, A4-PDF, Wiederaufruf und E-Mail-Versand. Unternehmens-/Steuerdaten dürfen erst nach verifizierter Übernahme der Canva-Referenz gespeichert werden.
- Bestandsfehler Place to Be anhand einer kontrollierten Testbuchung und Datenbankfunktion verifizieren.
- Restbestand einer Regalfläche mit Historie in den Folgemonat übertragen.
- Belegupload für Einkäufe, allgemeine Dokumentenverwaltung und wiederkehrende Ausgaben samt korrekter Monatsabgrenzung.
- Einnahmen-vs.-Ausgaben-Diagramm mit wiederkehrenden Ausgaben.
- Kollaborative Mindmap mit Knoten, Kanten, Positionen und nutzergebundenen Kommentaren; der bestehende Canva-Bereich ist bis dahin weiterhin nur eine externe Quelle.
- Öffentliche Katalogdaten/-suche sind architektonisch vorzubereiten, aber laut Masterprompt noch nicht als vollständige Plattform zu bauen.

## Sicherheits- und Datenrisiken

- Keine Zugangsdaten gehören in Quellcode oder allgemeine Account-Metadaten. Der vorhandene Tresor verschlüsselt clientseitig mit AES-GCM; der Tresor-Code wird nicht gespeichert.
- Eine allgemeine Kasse darf nicht vor Prüfung der tatsächlichen Supabase-Spalten auf den Marktverkaufs-RPC umgebogen werden. Das würde Bestände am falschen Ort verändern.
- Neue Rollenregeln müssen immer in Navigation und API gelten; reines Ausblenden ist nicht ausreichend.
- Keine Migration darf vorhandene Artikel, Varianten, Bilder, Bestände oder Verkaufsdaten überschreiben.

## QA-Gates für kommende Lieferabschnitte

1. TypeScript, Lint, Unit-Tests und Produktionsbuild.
2. Desktop, Tablet und 390 × 844 Pixel ohne horizontales Seiten-Scrolling.
3. Testbenutzer Marlon/Jasmin/Jonas für Navigation und direkte API-Aufrufe.
4. Mutationen nur mit sichtbarem Speichern/Fehler, Doppelklickschutz und anschließender Neuladekontrolle.
5. Bestandsbuchungen mit Vorher-/Nachher-Menge und genau einem Journal-/Fulfillment-Eintrag.
