/* =========================
   ORDINI 3D - LAB APP.JS
   ========================= */

const STORAGE_KEY = "ordini3d_lab_v1";

/* ---------- DATI ---------- */
let orders = loadOrders();

/* ---------- COSTANTI ---------- */
const FLOW = {
  PREPARAZIONE: "PREPARAZIONE",
  ASSEMBLAGGIO: "ASSEMBLAGGIO",
  SPEDIZIONE: "SPEDIZIONE",
  COMPLETATO: "COMPLETATO",
};

const COLS = [
  { id: "PREP", title: "🟡 Preparazione" },
  { id: "FRONTALE", title: "🔵 Stampa frontale" },
  { id: "POSTERIORE", title: "🟠 Stampa posteriore" },
  { id: "ASSEMBLAGGIO", title: "🟣 Assemblaggio" },
  { id: "SPEDIZIONE", title: "🟤 Spedizione" },
  { id: "COMPLETATO", title: "🟢 Completato" },
];

/* ---------- UTILS ---------- */
function loadOrders() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveOrders() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function nowISO() {
  return new Date().toISOString();
}

function fmt(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT") + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function $(id) {
  return document.getElementById(id);
}

/* ---------- NAV ---------- */
function hideAll() {
  ["page-new", "page-prep", "page-sales"].forEach(id => {
    const el = $(id);
    if (el) el.classList.add("hide");
  });
}

function showNew() {
  hideAll();
  $("page-new")?.classList.remove("hide");
  refreshActiveTable();
}

function showPrep() {
  hideAll();
  $("page-prep")?.classList.remove("hide");
  renderBoard();
}

/* ---------- NUOVO ORDINE ---------- */
function addOrder() {
  const cliente = $("cliente")?.value.trim();
  const sito = $("sito")?.value.trim();
  const articolo = $("progetto")?.value.trim();
  const prezzo = $("prezzo")?.value.trim();
  const note = $("note")?.value.trim();

  if (!cliente  !sito  !articolo || !prezzo) {
    alert("Compila tutti i campi obbligatori");
    return;
  }

  const order = {
    id: articolo + "_" + Date.now(),
    cliente,
    sito,
    articolo,
    prezzo: Number(prezzo),
    note,
    flow: FLOW.PREPARAZIONE,
    frontaleOK: false,
    posterioreOK: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    completedAt: null,
  };

  orders.unshift(order);
  saveOrders();

  ["cliente", "sito", "progetto", "prezzo", "note"].forEach(id => {
    if ($(id)) $(id).value = "";
  });

  showPrep();
}

/* ---------- LOGICA PRODUZIONE ---------- */
function autoToAssemblaggio(o) {
  if (
    o.flow === FLOW.PREPARAZIONE &&
    o.frontaleOK &&
    o.posterioreOK
  ) {
    o.flow = FLOW.ASSEMBLAGGIO;
    o.updatedAt = nowISO();
  }
}

function setFrontaleOK(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.frontaleOK = true;
  o.updatedAt = nowISO();
  autoToAssemblaggio(o);
  saveOrders();
  renderBoard();
  refreshActiveTable();
}

function setPosterioreOK(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.posterioreOK = true;
  o.updatedAt = nowISO();
  autoToAssemblaggio(o);
  saveOrders();
  renderBoard();
  refreshActiveTable();
}

function goNext(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  if (o.flow === FLOW.ASSEMBLAGGIO) o.flow = FLOW.SPEDIZIONE;
  else if (o.flow === FLOW.SPEDIZIONE) {
    o.flow = FLOW.COMPLETATO;
    o.completedAt = nowISO();
  }

  o.updatedAt = nowISO();
  saveOrders();
  renderBoard();
  refreshActiveTable();
}

function goPrev(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  if (o.flow === FLOW.SPEDIZIONE) o.flow = FLOW.ASSEMBLAGGIO;
  else if (o.flow === FLOW.COMPLETATO) o.flow = FLOW.SPEDIZIONE;

  o.updatedAt = nowISO();
  saveOrders();
  renderBoard();
  refreshActiveTable();
}

/* ---------- FILTRI COLONNE ---------- */
function inColumn(o, col) {
  if (col === "PREP") return o.flow === FLOW.PREPARAZIONE;
  if (col === "FRONTALE") return o.flow === FLOW.PREPARAZIONE && !o.frontaleOK;
  if (col === "POSTERIORE") return o.flow === FLOW.PREPARAZIONE && !o.posterioreOK;
if (col === "ASSEMBLAGGIO") return o.flow === FLOW.ASSEMBLAGGIO;
  if (col === "SPEDIZIONE") return o.flow === FLOW.SPEDIZIONE;
  if (col === "COMPLETATO") return o.flow === FLOW.COMPLETATO;
  return false;
}

/* ---------- BOARD ---------- */
function renderBoard() {
  const board = $("board");
  if (!board) return;
  board.innerHTML = "";

  COLS.forEach(col => {
    const colEl = document.createElement("div");
    colEl.className = "col";

    const title = document.createElement("h2");
    const items = orders.filter(o => inColumn(o, col.id));
    title.innerHTML = <span>${col.title}</span><span class="count">${items.length}</span>;
    colEl.appendChild(title);

    items.forEach(o => {
      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <div class="title">${o.articolo} — € ${o.prezzo.toFixed(2)}</div>
        <div class="meta">
          <b>Cliente:</b> ${o.cliente}<br>
          <b>Sito:</b> ${o.sito}<br>
          <b>Frontale:</b> ${o.frontaleOK ? "OK ✅" : "NO ❌"} |
          <b>Posteriore:</b> ${o.posterioreOK ? "OK ✅" : "NO ❌"}<br>
          <b>Creato:</b> ${fmt(o.createdAt)}<br>
          <b>Agg.:</b> ${fmt(o.updatedAt)}
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "actions";

      if (col.id === "FRONTALE") {
        actions.innerHTML = <button class="small ok" onclick="setFrontaleOK('${o.id}')">OK Frontale</button>;
      } else if (col.id === "POSTERIORE") {
        actions.innerHTML = <button class="small ok" onclick="setPosterioreOK('${o.id}')">OK Posteriore</button>;
      } else if (col.id === "ASSEMBLAGGIO" || col.id === "SPEDIZIONE") {
        actions.innerHTML = `
          <button class="small" onclick="goPrev('${o.id}')">←</button>
          <button class="small ok" onclick="goNext('${o.id}')">→</button>
        `;
      } else if (col.id === "COMPLETATO") {
        actions.innerHTML = <button class="small" onclick="goPrev('${o.id}')">←</button>;
      }

      card.appendChild(actions);
      colEl.appendChild(card);
    });

    board.appendChild(colEl);
  });
}

/* ---------- TABELLA ORDINI ATTIVI ---------- */
function refreshActiveTable() {
  const tbody = $("activeTbody");
  if (!tbody) return;

  const active = orders.filter(o => o.flow !== FLOW.COMPLETATO);
  tbody.innerHTML = "";

  if (active.length === 0) {
    tbody.innerHTML = <tr><td colspan="7">Nessun ordine attivo</td></tr>;
    return;
  }

  active.forEach(o => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${o.articolo}</td>
      <td>${o.cliente}</td>
      <td>${o.sito}</td>
      <td>€ ${o.prezzo.toFixed(2)}</td>
      <td>${o.flow}</td>
      <td>${fmt(o.createdAt)}</td>
      <td>${fmt(o.updatedAt)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------- AVVIO ---------- */
document.addEventListener("DOMContentLoaded", () => {
  showNew();
});
