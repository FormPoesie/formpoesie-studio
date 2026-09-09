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
- Allgemeine Kasse von Markt-/Regalbeständen getrennt. Sie schreibt Bestellungen mit mehreren Positionen in die vorhandene `online_sales`-Struktur und bietet ausschließlich Abholung, eBay, eBay Kleinanzeigen, Vinted, Etsy und Bestellformular an.
- Druck-/Versandstatus wieder speicherbar gemacht; die Erledigung des Versands nutzt wie die ursprüngliche Inventarseite `versand_buchen`/`versand_zuruecknehmen` und setzt den Status bei einem Bestandsfehler zurück.
- Artikelstatus `Entwurf`/`Final`, Bestätigungsdatum und der davon unabhängige Etsy-Status als persistente Studiometadaten ergänzt. Bestehende gepflegte Inventarartikel bleiben beim Übergang final sichtbar; neue Artikel starten als Entwurf.
- Markt- und Regalflächenmasken laden das zentrale Produktportfolio wieder direkt. Final überarbeitete Artikel und Entwürfe sind bei der Bestandszuordnung getrennt; beide bleiben buchbar.
- Zentrale Artikel-Assetbibliothek ergänzt: mehrere JPEG-/PNG-/WebP-Bilder, ein frei definierbares Hauptbild und mehrere geschützte STL-/3MF-/OBJ-/ZIP-Druckdateien. Das Hauptbild wird in Inventar und allen darauf basierenden Artikelansichten wiederverwendet; Druckdateien werden nur nach FormPoesie-Anmeldung als Download ausgeliefert.
- Geschützte Verwaltungsseite `Einkäufe & Ausgaben` ergänzt. Vorhandene Ausgaben bleiben erhalten und können um Kategorie, einmalige/monatliche/jährliche Wiederholung sowie PDF-/Bildbelege ergänzt werden. Die API prüft Marlon/Jasmin auch bei direkten Schreib- und Löschaufrufen.
- Monatsübersicht um das responsive Diagramm `Einnahmen vs. Ausgaben` erweitert; monatliche und jährliche Ausgaben werden anhand Start- und optionalem Enddatum periodengerecht berücksichtigt.
- Kasse um persistente Rechnungsentwürfe mit atomar fortlaufender Jahresnummer, Kundendaten, unveränderlicher Positions-/Preiskopie, Wiederaufruf und A4-Druckansicht erweitert. Über den Druckdialog kann der Entwurf als PDF gesichert und eine adressierte E-Mail vorbereitet werden.
- Verifizierte FormPoesie-Rechnungsangaben ergänzt: §-19-UStG-Hinweis, USt-IdNr., Anschrift sowie PayPal- und Bankverbindung. Neue Rechnungen werden mit unveränderlicher Kopie dieser Angaben ausgestellt; ältere Entwürfe bleiben historisch unverändert.
- Artikel-Massenbearbeitung auf Kategorie, Produktfamilie, Designer/Lizenzgeber, gewerbliche Lizenz, Studio- und Etsy-Status, Archivstatus sowie gemeinsame Notizen erweitert. Vor dem Speichern zeigt eine Vorschau alle geplanten Änderungen und die betroffenen Artikel.
- Den externen Canva-Content-Kalender durch eine persistente, kollaborative Mindmap ersetzt. Ideen besitzen frei verschiebbare Positionen, farbige Knoten, gerichtete Verbindungen, Detailnotizen und nutzergebundene Kommentare.
- Etsy-Workflow als persistenter Entwurfsprozess vervollständigt: Artikelauswahl mit Bild und Variantenzahl, vollständige Variantenübernahme, editierbare DE-/EN-Titel, Beschreibung und Tags, speicherbare Feldsperren und Recherche, wiederöffnbare Entwürfe, Bildrollen sowie ein Exportpaket für die manuelle Etsy-Übertragung.
- Zweisprachige FormPoesie-Standardbeschreibung integriert. Produktname, Motiv, Zielgruppe, Verwendung, Varianten, bestätigte Maße und Sicherheit werden artikelspezifisch aufgebaut; Versand-, Farb-, Handarbeit-, Nachhaltigkeits- und PLA-Pflegeblöcke bleiben als geprüfte Standardteile erhalten. Nicht bestätigte Maße werden nicht ergänzt.
- Etsy-Prüfung ergänzt: beide Sprachen, ausgewählter Titel, Titellänge, maximal 13 Tags, maximale Taglänge und doppelte Tags werden vor der Übertragung geprüft. Ein echter Etsy-Publish bleibt ohne OAuth-Anbindung bewusst gesperrt.

## Vorhanden, aber noch weiter abzusichern

- Inventarbild-Upload, Variantenbearbeitung, Kostenformeln und Markt-/Regal-Kassen verwenden die bestehende Supabase-Logik.
- Designer-Beobachtung speichert Konfiguration und Prüfergebnis in D1; die manuelle Prüfung existiert. Ein verlässlicher externer Zeitplan muss beim Hosting noch separat geprüft werden.
- News-Synchronisierung besitzt dieselbe Logik für geplanten und manuellen Lauf.
- Verwaltung ist im Frontend und in den Lese-APIs für Monatsübersicht/Verkaufshistorie auf Marlon/Jasmin begrenzt.

## Noch offen – neue Backend-/Migrationsarbeit

- Serverseitigen PDF-Anhang und transaktionalen E-Mail-Versand ergänzen. Aktuell wird die A4-Rechnung über den Druckdialog als PDF gespeichert und die adressierte E-Mail vorbereitet.
- Etsy-OAuth und die Etsy-API für echte Entwurfsübertragung ergänzen. Bis dahin erzeugt der Workflow ein geprüftes, vollständiges Exportpaket und verändert den realen Etsy-Shop nicht.
- Bestandsfehler Place to Be anhand einer kontrollierten Testbuchung und Datenbankfunktion verifizieren.
- Restbestand einer Regalfläche mit Historie in den Folgemonat übertragen.
- Allgemeine, von Einkäufen unabhängige Dokumentenverwaltung.
- Öffentliche Katalogdaten/-suche sind architektonisch vorzubereiten, aber laut Masterprompt noch nicht als vollständige Plattform zu bauen.

## Sicherheits- und Datenrisiken

- Keine Zugangsdaten gehören in Quellcode oder allgemeine Account-Metadaten. Der vorhandene Tresor verschlüsselt clientseitig mit AES-GCM; der Tresor-Code wird nicht gespeichert.
- Vor realen Kassenbuchungen wurde die bestehende `online_sales`-Schreiblogik aus der ausgelieferten Originalanwendung geprüft und übernommen; die allgemeine Kasse verwendet keinen Markt-RPC.
- Neue Rollenregeln müssen immer in Navigation und API gelten; reines Ausblenden ist nicht ausreichend.
- Keine Migration darf vorhandene Artikel, Varianten, Bilder, Bestände oder Verkaufsdaten überschreiben.

## QA-Gates für kommende Lieferabschnitte

1. TypeScript, Lint, Unit-Tests und Produktionsbuild.
2. Desktop, Tablet und 390 × 844 Pixel ohne horizontales Seiten-Scrolling.
3. Testbenutzer Marlon/Jasmin/Jonas für Navigation und direkte API-Aufrufe.
4. Mutationen nur mit sichtbarem Speichern/Fehler, Doppelklickschutz und anschließender Neuladekontrolle.
5. Bestandsbuchungen mit Vorher-/Nachher-Menge und genau einem Journal-/Fulfillment-Eintrag.
