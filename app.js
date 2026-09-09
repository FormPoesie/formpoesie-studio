const products = [
  { id: 1, name: "Apollo Vase", variant: "15 cm · Marmorweiß", cost: 2.52, price: 15, stock: 4 },
  { id: 2, name: "Aufgerissenes Herz", variant: "15 cm · Kupfer", cost: 3.31, price: 17.99, stock: 3 },
  { id: 3, name: "Capybara Schlüsselanhänger", variant: "Einheitsgröße", cost: .49, price: 3, stock: 12 },
  { id: 4, name: "Cäsar Katzen Büste", variant: "17,5 cm · Sandstein", cost: 3.5, price: 14.99, stock: 2 },
  { id: 5, name: "David Eierbecher", variant: "Marmorbraun", cost: .31, price: 5, stock: 8 },
  { id: 6, name: "Eicheldose", variant: "Dunkelbraun / Knochenweiß", cost: .37, price: 10, stock: 5 },
  { id: 7, name: "Fledermausschale", variant: "23 cm · Schwarz matt", cost: .39, price: 15, stock: 3 },
  { id: 8, name: "Skeletthand Ringhalter", variant: "20 cm · Knochenweiß", cost: 2.79, price: 20, stock: 1 },
  { id: 9, name: "Strickcapybara", variant: "Einheitsgröße", cost: .67, price: 5, stock: 9 },
  { id: 10, name: "Vulkan Räucherkegelhalter", variant: "Dunkel", cost: .91, price: 8, stock: 6 },
  { id: 11, name: "Yogahase Hund", variant: "Mittel · 12,4 cm", cost: 1.42, price: 17, stock: 4 },
  { id: 12, name: "Zersprungene Vase", variant: "Einheitsgröße", cost: 2.34, price: 7.99, stock: 2 }
];

const navItems = [
  ["overview", "⌂", "Übersicht"],
  ["products", "◇", "Produkte"],
  ["pos", "€", "Kasse"],
  ["etsy", "✦", "Etsy Workflow"]
];

const state = {
  page: location.hash.slice(1) || "overview",
  search: "",
  cart: JSON.parse(localStorage.getItem("fp-cart") || "{}"),
  sales: JSON.parse(localStorage.getItem("fp-sales") || "[]"),
  menuOpen: false
};

const euro = value => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
const today = () => new Date().toISOString().slice(0, 10);
const el = document.querySelector("#app");

function sidebar() {
  const groups = [
    ["⌖", "Verkaufsorte", ["Märkte", "Regalflächen", "Online"]],
    ["◎", "Social Media", ["Instagram", "TikTok", "Pinterest"]],
    ["▤", "Katalog & Bestellungen", ["Katalog", "Bestellungen", "Versand"]],
    ["⚙", "Verwaltung", ["Material", "Profile", "Regeln"]]
  ];
  return `<aside class="sidebar" aria-label="Seitennavigation">
    <div class="brand"><img src="assets/formpoesie-icon.png" alt="FormPoesie Logo"><div><div class="brand-name">FORMPOESIE<br>STUDIO</div><div class="brand-sub">Interne Arbeitsfläche</div></div></div>
    <nav class="nav" aria-label="Hauptnavigation">
      ${navItems.map(([id, icon, label]) => `<button class="nav-button ${state.page === id ? "active" : ""}" data-page="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join("")}
      ${groups.map(([icon,label,items],i) => `<div class="nav-group"><button class="nav-group-title" data-group="${i}"><span><span class="nav-icon">${icon}</span>${label}</span><span class="chevron">⌄</span></button><div class="nav-sub">${items.map(x=>`<button data-placeholder="${x}">${x}</button>`).join("")}</div></div>`).join("")}
    </nav>
    <div class="sidebar-footer"><button data-placeholder="Papierkorb"><span class="nav-icon">♲</span>Papierkorb</button><button data-placeholder="Profile & Regeln"><span class="nav-icon">≛</span>Profile & Regeln</button><button data-placeholder="Info"><span class="nav-icon">ⓘ</span>Info</button></div>
  </aside>`;
}

function topbar() {
  const label = navItems.find(x => x[0] === state.page)?.[2] || "Arbeitsfläche";
  return `<header class="topbar"><div style="display:flex;align-items:center;gap:10px"><button class="mobile-menu" aria-label="Menü öffnen">☰</button><button class="workspace-switch">${label}</button></div><div class="top-actions"><a class="etsy-link" href="https://www.etsy.com/de/shop/3DFormPoesie" target="_blank" rel="noreferrer">✓ 3DFormPoesie</a><button class="avatar" title="Persönliches Konto">M</button></div></header>`;
}

function overview() {
  const revenue = state.sales.reduce((sum,s) => sum + s.total, 0);
  const units = state.sales.reduce((sum,s) => sum + s.units, 0);
  return `<section class="page">
    <p class="eyebrow">FormPoesie Studio · Interne Arbeitsfläche</p><h1>Was läuft heute?</h1>
    <p class="section-label">Erfolge</p><h2>Diese Woche</h2>
    <div class="metrics"><div class="metric"><strong>${units}</strong><span>verkaufte Artikel diese Woche</span></div><div class="metric"><strong>${euro(revenue)}</strong><span>Umsatz diese Woche</span></div><div class="metric"><strong>${units ? "Apollo Vase" : "Noch kein Verkauf"}</strong><span>${units} Stück · stärkster Artikel</span></div></div>
    <p class="section-label">Direktzugriff</p><h2>Social Media</h2>
    <div class="quick-grid"><a class="quick-card" href="https://www.instagram.com/form.poesie/" target="_blank" rel="noreferrer"><span class="quick-symbol">◎</span><span><strong>Instagram</strong><small>@form.poesie</small></span></a><a class="quick-card" href="https://www.tiktok.com/" target="_blank" rel="noreferrer"><span class="quick-symbol">♪</span><span><strong>TikTok</strong><small>formpoesie</small></span></a><a class="quick-card" href="https://www.pinterest.de/3DFormPoesie/" target="_blank" rel="noreferrer"><span class="quick-symbol">⌖</span><span><strong>Pinterest</strong><small>@3DFormPoesie</small></span></a><a class="quick-card" href="https://www.paypal.com/" target="_blank" rel="noreferrer"><span class="quick-symbol">€</span><span><strong>PayPal</strong><small>Geschäftskonto</small></span></a></div>
    <div class="panel"><div class="panel-head"><div><h3>Druck & Versand</h3><p>2 zu drucken · 1 zu versenden</p></div><span class="status-pill">3 offen</span></div></div>
    <p class="section-label">Tägliche Automationen</p>
    <div class="panel"><div class="panel-head"><div><h2>Heute im Masterbrain</h2></div><div style="display:flex;gap:8px;align-items:center"><span class="status-pill">Automation aktiv</span><button class="mini-btn" data-placeholder="Kalender">Kalender öffnen</button></div></div><article class="article-row"><div class="article-visual"></div><div><strong>Ein neues LCP-Filament verbindet FFF-Druckbarkeit mit aluminiumähnlicher Festigkeit.</strong><small>Material & Werkstoffe · 09.09.26, 10:30</small></div><button class="mini-btn" data-placeholder="Zusammenfassung">Zusammenfassung</button></article><article class="article-row"><div class="article-visual blue"></div><div><strong>Blaue Laser drucken Kupferschaltungen direkt auf wärmeleitende Keramiksubstrate.</strong><small>Fertigung & Industrie · 09.09.26, 10:30</small></div><button class="mini-btn" data-placeholder="Zusammenfassung">Zusammenfassung</button></article></div>
  </section>`;
}

function productCards(items = products) {
  if (!items.length) return `<div class="empty">Keine Artikel für diese Suche gefunden.</div>`;
  return items.map((p,i) => `<article class="product-card"><div class="product-art">${["◒","⌁","✦","◇"][i%4]}</div><div><h3>${p.name}</h3><p>${p.variant} · Kosten ${euro(p.cost)}</p><span class="price">${euro(p.price)}</span></div><span class="stock">${p.stock} Stk.</span></article>`).join("");
}

function productsPage() {
  const filtered = products.filter(p => `${p.name} ${p.variant}`.toLowerCase().includes(state.search.toLowerCase()));
  const value = products.reduce((s,p)=>s+p.price*p.stock,0);
  return `<section class="page"><div class="page-head"><div><p class="eyebrow">Ein System · lokale Beispieldaten</p><h1>Inventar</h1><p class="lead">Artikel und Material werden direkt in derselben FormPoesie-Arbeitsfläche bearbeitet.</p></div><button class="btn ghost" data-placeholder="Aktualisieren">↻ Aktualisieren</button></div>
    <div class="tabs"><button class="tab active">Artikel</button><button class="tab" data-placeholder="Material">Material</button></div>
    <div class="toolbar"><input class="input" id="product-search" type="search" placeholder="Artikel, Familie oder Designer suchen" value="${state.search}"><select class="select"><option>Aktives Sortiment</option><option>Archiv</option><option>Alle Artikel</option></select><button class="btn primary" id="new-product">＋ Neuer Artikel</button></div>
    <div class="inventory-summary"><div><strong>${products.length}</strong><span>aktive Artikel</span></div><div><strong>${products.reduce((s,p)=>s+p.stock,0)}</strong><span>kalkulierte Stück im Bestand</span></div><div><strong>${euro(value)}</strong><span>Warenwert im Bestand</span></div><div><strong>${euro(value-products.reduce((s,p)=>s+p.cost*p.stock,0))}</strong><span>möglicher Rohertrag</span></div></div>
    <div class="product-grid">${productCards(filtered)}</div>
  </section>`;
}

function posPage() {
  const filtered = products.filter(p => `${p.name} ${p.variant}`.toLowerCase().includes(state.search.toLowerCase()));
  const lines = Object.entries(state.cart).map(([id,qty])=>[products.find(p=>p.id===Number(id)),qty]).filter(x=>x[0]);
  const units = lines.reduce((s,[,q])=>s+q,0); const total = lines.reduce((s,[p,q])=>s+p.price*q,0);
  return `<section class="page"><div class="page-head"><div><p class="eyebrow">Ein System · lokale Beispieldaten</p><h1>Kasse</h1><p class="lead">Verkäufe werden mit zentralen Artikel-, Bestands- und Verkaufsdaten erfasst.</p></div><button class="btn ghost" data-placeholder="Aktualisieren">↻ Aktualisieren</button></div>
    <div class="pos-layout"><div><div class="sale-form"><div class="field"><label for="place">Verkaufsort</label><select id="place" class="select"><option>Abholung</option><option>Etsy</option><option>Markt</option><option>Bestellformular</option></select></div><div class="field"><label for="date">Verkaufsdatum</label><input id="date" class="input" type="date" value="${today()}"></div><div class="field"><label for="customer">Name (optional)</label><input id="customer" class="input" placeholder="Kundin oder Kunde"></div></div><input class="input" id="product-search" type="search" placeholder="Artikel oder Variante suchen" value="${state.search}"><div class="pos-products"><div class="sale-list" style="margin-top:10px">${filtered.map(p=>`<button class="sale-item" data-add="${p.id}"><span><strong>${p.name}</strong><small>${p.variant} · Kosten ${euro(p.cost)}</small></span><b>${euro(p.price)}</b></button>`).join("")}</div></div></div>
    <aside class="cart"><div class="cart-head"><h2>Warenkorb</h2><span class="cart-count">${units} Stück</span></div>${lines.length ? lines.map(([p,q])=>`<div class="cart-line"><span><strong>${p.name}</strong><small>${euro(p.price*q)}</small></span><span class="qty"><button data-qty="${p.id}" data-delta="-1">−</button><small>${q}</small><button data-qty="${p.id}" data-delta="1">＋</button></span></div>`).join("") : `<p class="cart-empty">Wähle links einen Artikel aus.</p>`}<div class="cart-foot"><div class="cart-total"><span>Gesamtsumme</span><strong>${euro(total)}</strong></div><textarea class="textarea" id="sale-note" placeholder="Notiz (optional)"></textarea><label class="check"><input id="invoice" type="checkbox"> Rechnung erstellen</label><button class="btn primary" id="save-sale" style="width:100%" ${lines.length ? "" : "disabled"}>Verkauf speichern</button></div></aside></div>
  </section>`;
}

function etsyPage() {
  return `<section class="page"><div class="page-head"><div><p class="eyebrow">Etsy-Produktion</p><h1>Etsy Workflow</h1><p class="lead">Ein geführter Ablauf vom Inventarartikel bis zum geprüften Etsy-Listing.</p></div><button class="btn primary" id="start-workflow">Workflow starten</button></div><div class="workflow-track"><article class="workflow-card"><span class="workflow-no">1</span><h2>Inventar</h2><p>Artikel und alle Varianten verbindlich übernehmen.</p></article><article class="workflow-card"><span class="workflow-no">2</span><h2>Bildstudio</h2><p>Originale, Versionen und Freigaben getrennt sichern.</p></article><article class="workflow-card"><span class="workflow-no">3</span><h2>Listing</h2><p>Jeden Inhalt prüfen und ausdrücklich bestätigen.</p></article></div><button class="draft" id="resume-workflow"><span><strong>2er Set Flamingo Pflanzenstecker</strong><span>Fortsetzen bei „Bilder hinzufügen“</span></span><span class="progress"><i></i></span></button></section>`;
}

function render() {
  const view = state.page === "products" ? productsPage() : state.page === "pos" ? posPage() : state.page === "etsy" ? etsyPage() : overview();
  el.innerHTML = `<div class="app-shell ${state.menuOpen ? "menu-open" : ""}">${sidebar()}${topbar()}<main class="main">${view}</main></div>`;
  bind();
}

function bind() {
  document.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => { state.page=b.dataset.page; state.search=""; state.menuOpen=false; location.hash=state.page; render(); }));
  document.querySelectorAll("[data-group]").forEach(b => b.addEventListener("click", () => b.closest(".nav-group").classList.toggle("open")));
  document.querySelectorAll("[data-placeholder]").forEach(b => b.addEventListener("click", () => toast(`${b.dataset.placeholder} ist in dieser lokalen Demo noch nicht verbunden.`)));
  document.querySelector(".mobile-menu")?.addEventListener("click",()=>{ state.menuOpen=!state.menuOpen; render(); });
  const search = document.querySelector("#product-search");
  search?.addEventListener("input", e => { const pos=e.target.selectionStart; state.search=e.target.value; render(); requestAnimationFrame(()=>{ const next=document.querySelector("#product-search"); next?.focus(); next?.setSelectionRange(pos,pos); }); });
  document.querySelectorAll("[data-add]").forEach(b=>b.addEventListener("click",()=>{ const id=b.dataset.add; state.cart[id]=(state.cart[id]||0)+1; saveCart(); render(); toast("Artikel zum Warenkorb hinzugefügt."); }));
  document.querySelectorAll("[data-qty]").forEach(b=>b.addEventListener("click",()=>{ const id=b.dataset.qty; state.cart[id]=(state.cart[id]||0)+Number(b.dataset.delta); if(state.cart[id]<=0) delete state.cart[id]; saveCart(); render(); }));
  document.querySelector("#save-sale")?.addEventListener("click", saveSale);
  document.querySelector("#new-product")?.addEventListener("click", () => openDialog("Neuen Artikel anlegen", "Der Formularentwurf demonstriert die lokale Produkterfassung.", "Artikel anlegen"));
  document.querySelector("#start-workflow")?.addEventListener("click", () => openDialog("Listing-Erstellung starten", "Lege Modellname und Produktart für den neuen Etsy-Workflow fest.", "Workflow anlegen"));
  document.querySelector("#resume-workflow")?.addEventListener("click",()=>toast("Entwurf geöffnet: Als Nächstes Produktbilder hinzufügen."));
}

function saveCart(){ localStorage.setItem("fp-cart",JSON.stringify(state.cart)); }
function saveSale(){
  const lines=Object.entries(state.cart); const total=lines.reduce((s,[id,q])=>s+(products.find(p=>p.id===Number(id))?.price||0)*q,0); const units=lines.reduce((s,[,q])=>s+q,0);
  state.sales.push({id:Date.now(),date:document.querySelector("#date")?.value||today(),place:document.querySelector("#place")?.value,total,units,invoice:document.querySelector("#invoice")?.checked||false});
  localStorage.setItem("fp-sales",JSON.stringify(state.sales)); state.cart={}; saveCart(); render(); toast("Verkauf lokal gespeichert.");
}

function openDialog(title, text, action) {
  const wrap=document.createElement("div"); wrap.className="dialog-backdrop"; wrap.innerHTML=`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${title}</h2><p class="lead">${text}</p><form><input class="input" required placeholder="Modell- oder Artikelname"><select class="select"><option>Dekoration</option><option>Skulptur</option><option>Funktionales Design</option><option>Digitale Datei</option></select><div class="dialog-actions"><button class="btn ghost" type="button" data-close>Abbrechen</button><button class="btn primary" type="submit">${action}</button></div></form></div>`;
  document.body.append(wrap); const close=()=>wrap.remove(); wrap.querySelector("[data-close]").addEventListener("click",close); wrap.addEventListener("click",e=>{if(e.target===wrap)close();}); wrap.querySelector("form").addEventListener("submit",e=>{e.preventDefault();close();toast(`${action}: Entwurf lokal erstellt.`);}); wrap.querySelector("input").focus();
}

function toast(message) { const t=document.createElement("div"); t.className="toast"; t.textContent=message; document.querySelector("#toast-region").append(t); setTimeout(()=>t.remove(),3000); }
window.addEventListener("hashchange",()=>{ state.page=location.hash.slice(1)||"overview"; render(); });
render();
