// ====== DATI (locale) ======
let orders = [];

// Stati "macro" (flusso reale)
const FLOW = {
  PREPARAZIONE: "PREPARAZIONE",
  ASSEMBLAGGIO: "ASSEMBLAGGIO",
  SPEDIZIONE: "SPEDIZIONE",
  COMPLETATO: "COMPLETATO",
};

// Colonne board (vista produzione)
// NOTA: Stampa frontale/posteriore sono "code di lavoro" basate sui flag OK, NON sullo stato.
const COLS = [
  { id: "PREP", title: "🟡 Preparazione", bg: "#fff7cc", border: "#f1d36a" },
  { id: "FRONTALE", title: "🔵 Stampa frontale (OK)", bg: "#e8f2ff", border: "#7fb0ff" },
  { id: "POSTERIORE", title: "🟠 Stampa posteriore (OK)", bg: "#ffe9dc", border: "#ffb184" },
  { id: "ASSEMBLAGGIO", title: "🟣 Assemblaggio", bg: "#f3e8ff", border: "#b68cff" },
  { id: "SPEDIZIONE", title: "🟤 Spedizione", bg: "#f1efe9", border: "#cbbfa6" },
  { id: "COMPLETATO", title: "🟢 Completato", bg: "#dfffe6", border: "#33c26b" },
];

// ====== NAV ======
function showNew() {
  document.getElementById("page-new").classList.remove("hide");
  document.getElementById("page-prep").classList.add("hide");
}
function showPrep() {
  document.getElementById("page-new").classList.add("hide");
  document.getElementById("page-prep").classList.remove("hide");
  render();
}

// ====== CREAZIONE ORDINE ======
function addOrder() {
  const cliente = document.getElementById("cliente").value.trim();
  const sito = document.getElementById("sito").value.trim();
  const articolo = document.getElementById("progetto").value.trim(); // numero progetto = articolo
  const prezzo = document.getElementById("prezzo").value.trim();
  const note = document.getElementById("note").value.trim();

  if (!cliente || !sito || !articolo || !prezzo) {
    alert("Compila Cliente, Sito vendita, Numero progetto e Prezzo.");
    return;
  }

  // id semplice
  const id = `${articolo}__${Date.now()}`;

  orders.unshift({
    id,
    cliente,
    sito,
    articolo,
    prezzo,
    note,
    flow: FLOW.PREPARAZIONE,
    frontaleOK: false,
    posterioreOK: false,
    createdAt: new Date().toISOString(),
  });

  // reset form
  ["cliente","sito","progetto","prezzo","note"].forEach(x => document.getElementById(x).value = "");
  showPrep();
}

// ====== HELPERS ======
function setFrontaleOK(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.frontaleOK = true;
  autoAdvanceToAssemblaggio(o);
  render();
}
function setPosterioreOK(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.posterioreOK = true;
  autoAdvanceToAssemblaggio(o);
  render();
}

function autoAdvanceToAssemblaggio(o) {
  // Se entrambi i pezzi sono OK e siamo ancora in preparazione -> passa ad assemblaggio
  if (o.flow === FLOW.PREPARAZIONE && o.frontaleOK && o.posterioreOK) {
    o.flow = FLOW.ASSEMBLAGGIO;
  }
}

function goPrev(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  if (o.flow === FLOW.ASSEMBLAGGIO) o.flow = FLOW.PREPARAZIONE;
  else if (o.flow === FLOW.SPEDIZIONE) o.flow = FLOW.ASSEMBLAGGIO;
  else if (o.flow === FLOW.COMPLETATO) o.flow = FLOW.SPEDIZIONE;

  render();
}

function goNext(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  // regola: NON puoi assemblare se non sono ok entrambi
  if (o.flow === FLOW.PREPARAZIONE) {
    alert("Non puoi andare avanti manualmente. Devono fare OK Frontale e OK Posteriore.");
    return;
  }

  if (o.flow === FLOW.ASSEMBLAGGIO) o.flow = FLOW.SPEDIZIONE;
  else if (o.flow === FLOW.SPEDIZIONE) o.flow = FLOW.COMPLETATO;

  render();
}

function removeOrder(id) {
  if (!confirm("Eliminare questo ordine?")) return;
  orders = orders.filter(x => x.id !== id);
  render();
}

// ====== SELEZIONE ORDINI PER COLONNA ======
function inCol(o, colId) {
  // PREPARAZIONE: tutti quelli con flow PREPARAZIONE (anche se pezzi non ok)
  if (colId === "PREP") return o.flow === FLOW.PREPARAZIONE;

  // STAMPA FRONTALE: quelli NON ancora frontaleOK e ancora non completati
  if (colId === "FRONTALE") return o.flow === FLOW.PREPARAZIONE && !o.frontaleOK;

  // STAMPA POSTERIORE: quelli NON ancora posterioreOK e ancora non completati
  if (colId === "POSTERIORE") return o.flow === FLOW.PREPARAZIONE && !o.posterioreOK;

  // ASSEMBLAGGIO: SOLO se flow=ASSEMBLAGGIO (che arriva solo con ok ok)
  if (colId === "ASSEMBLAGGIO") return o.flow === FLOW.ASSEMBLAGGIO;

  if (colId === "SPEDIZIONE") return o.flow === FLOW.SPEDIZIONE;
  if (colId === "COMPLETATO") return o.flow === FLOW.COMPLETATO;

  return false;
}

// ====== RENDER ======
function render() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  COLS.forEach(colDef => {
    const col = document.createElement("div");
    col.className = "col";

    const items = orders.filter(o => inCol(o, colDef.id));

    const h2 = document.createElement("h2");
    h2.innerHTML = `<span>${colDef.title}</span><span class="count">${items.length}</span>`;
    col.appendChild(h2);

    items.forEach(o => {
      const card = document.createElement("div");
      card.className = "card" + (o.flow === FLOW.COMPLETATO ? " done" : "");
      card.style.background = colDef.bg;
      card.style.borderColor = colDef.border;

      // articolo = numero progetto
      card.innerHTML = `
        <div class="title">${o.articolo} — € ${o.prezzo}</div>
        <div class="meta">
          <b>Cliente:</b> ${o.cliente}<br>
          <b>Sito:</b> ${o.sito}<br>
          <b>Frontale:</b> ${o.frontaleOK ? "OK ✅" : "NO ❌"} &nbsp; | &nbsp;
          <b>Posteriore:</b> ${o.posterioreOK ? "OK ✅" : "NO ❌"}
          ${o.note ? `<br><b>Note:</b> ${o.note}` : ""}
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "actions";

      // Bottoni diversi per colonna
      if (colDef.id === "FRONTALE") {
        const b = document.createElement("button");
        b.className = "small ok";
        b.textContent = "OK Frontale ✔";
        b.onclick = () => setFrontaleOK(o.id);
        actions.appendChild(b);
      } else if (colDef.id === "POSTERIORE") {
        const b = document.createElement("button");
        b.className = "small ok";
        b.textContent = "OK Posteriore ✔";
        b.onclick = () => setPosterioreOK(o.id);
        actions.appendChild(b);
      } else if (colDef.id === "ASSEMBLAGGIO" || colDef.id === "SPEDIZIONE") {
        const prev = document.createElement("button");
        prev.className = "small";
        prev.textContent = "← Indietro";
        prev.onclick = () => goPrev(o.id);

        const next = document.createElement("button");
        next.className = "small ok";
        next.textContent = "Avanti →";
        next.onclick = () => goNext(o.id);

        actions.appendChild(prev);
        actions.appendChild(next);
      } else if (colDef.id === "COMPLETATO") {
        // niente avanti
        const prev = document.createElement("button");
        prev.className = "small";
        prev.textContent = "← Indietro";
        prev.onclick = () => goPrev(o.id);
        actions.appendChild(prev);
      } else if (colDef.id === "PREP") {
        // in preparazione: solo elimina (e info)
        const del = document.createElement("button");
        del.className = "small danger";
        del.textContent = "Elimina";
        del.onclick = () => removeOrder(o.id);
        actions.appendChild(del);
      }

      card.appendChild(actions);
      col.appendChild(card);
    });

    board.appendChild(col);
  });
}

// Avvio
showNew();
