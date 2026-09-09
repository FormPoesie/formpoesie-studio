# FormPoesie Studio

Eine eigenständige, GitHub-taugliche Frontend-Nachbildung der FormPoesie-Arbeitsoberfläche. Sie umfasst Übersicht, Inventar, Kasse und einen Etsy-Workflow und läuft ohne Backend oder Build-Schritt.

## Funktionen

- Responsive Dashboard-Oberfläche im FormPoesie-Design
- Durchsuchbares Beispiel-Inventar
- Funktionsfähige Kasse mit Warenkorb, Mengen und Verkaufsspeicherung
- Verkäufe und Warenkorb werden im Browser über `localStorage` gespeichert
- Mehrfachauswahl-Import der Canva-Monats-CSV-Dateien mit Dublettenschutz
- Etsy-Workflow mit lokalem Entwurfsdialog
- Tastatur-Fokus, mobile Navigation und Unterstützung für reduzierte Bewegung
- Vorbereiteter GitHub-Pages-Workflow

## Lokal starten

```bash
python3 -m http.server 4173
```

Danach [http://localhost:4173](http://localhost:4173) öffnen.

Alternativ kann `index.html` direkt geöffnet werden; ein lokaler Server ist für die verlässlichste Darstellung empfohlen.

## GitHub veröffentlichen

1. Ein leeres Repository auf GitHub erstellen.
2. Dieses Projekt als Inhalt des Repositorys pushen.
3. Unter **Settings → Pages → Source** die Option **GitHub Actions** wählen.
4. Der enthaltene Workflow veröffentlicht die statische Seite bei jedem Push auf `main`.

```bash
git init
git add .
git commit -m "Initial FormPoesie Studio"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/DEIN-REPO.git
git push -u origin main
```

## Daten und Backend

Dieses Repository enthält absichtlich keine privaten Daten oder API-Zugänge der Ausgangsseite. Die Oberfläche verwendet lokale Beispieldaten. Importierte Verkaufsdaten bleiben ausschließlich im `localStorage` des verwendeten Browsers und werden nicht in GitHub hochgeladen. Für den produktiven Einsatz können die Datenzugriffe in `app.js` später durch eine eigene API ersetzt werden.

## Herkunft

Die Implementierung wurde anhand der öffentlich erreichbaren Darstellung von `formpoesie-masterbrain.ma-sti.chatgpt.site` erstellt. Markenname, Inhalte und bereitgestellte Assets bleiben Eigentum ihrer jeweiligen Rechteinhaber.
