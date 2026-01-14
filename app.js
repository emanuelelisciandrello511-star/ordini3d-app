let orders = [];

const FLOW = {
  PREPARAZIONE: "PREPARAZIONE",
  ASSEMBLAGGIO: "ASSEMBLAGGIO",
  SPEDIZIONE: "SPEDIZIONE",
  COMPLETATO: "COMPLETATO",
};

const COLS = [
  { id: "PREP", title: "🟡 Preparazione", bg: "#fff7cc", border: "#f1d36a" },
  { id: "FRONTALE", title: "🔵 Stampa frontale", bg: "#e8f2ff", border: "#7fb0ff" },
  { id: "POSTERIORE", title: "🟠 Stampa posteriore", bg: "#ffe9dc", border: "#ffb184" },
  { id: "ASSEMBLAGGIO", title: "🟣 Assemblaggio", bg: "#f3e8ff", border: "#b68cff" },
  { id: "SPEDIZIONE", title: "🟤 Spedizione", bg: "#f1efe9", border: "#cbbfa6" },
  { id: "COMPLETATO", title: "🟢 Completato", bg: "#dfffe6", border: "#33c26b" },
];

function showNew() {
  document.getElementById("page-new").classList.remove("hide");
  document.getElementById("page-prep").classList.add("hide");
}
function showPrep() {
  document.getElementById("page-new").classList.add("hide");
  document.getElementById("page-prep").classList.remove("hide");
  render();
}

function addOrder() {
  const cliente = document.getElementById("cliente").value.trim();
  const sito = document.getElementById("sito").value.trim();
  const articolo = document.getElementById("progetto").value.trim();
  const prezzo = document.getElementById("prezzo").value.trim();
  const note = document.getElementById("note").value.trim();

  if (!cliente || !sito || !articolo || !prezzo) {
    alert("Compila Cliente, Sito vendita, Numero progetto e Prezzo.");
    return;
  }

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

  ["cliente","sito","progetto","prezzo","note"].forEach(x => document.getElementById(x).value = "");
  showPrep();
}

// ====== REGOLE OK STAMPA (DUE STANZE) ======
function setFrontaleOK(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.frontaleOK = true;
  autoToAssemblaggio(o);
  render();
}

function setPosterioreOK(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.posterioreOK = true;
  autoToAssemblaggio(o);
  render();
}

// Appena entrambi OK -> Assemblaggio
function autoToAssemblaggio(o) {
  if (o.flow === FLOW.PREPARAZIONE && o.frontaleOK && o.posterioreOK) {
    o.flow = FLOW.ASSEMBLAGGIO;
  }
}

// ====== AVANZAMENTO SOLO DOPO ASSEMBLAGGIO ======
function goPrev(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  if (o.flow === FLOW.ASSEMBLAGGIO) o.flow = FLOW.PREPARAZIONE;
  else if (o.flow === FLOW.SPEDIZIONE) o.flow = FLOW.ASSEMBLAGGIO;
  else if (o.flow === FLOW.COMPLETATO) o.flow = FLOW.SPEDIZIONE;

  // se torni in PREPARAZIONE, NON resettiamo gli OK (a meno che tu lo voglia)
  render();
}

function goNext(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  if (o.flow === FLOW.ASSEMBLAGGIO) o.flow = FLOW.SPEDIZIONE;
  else if (o.flow === FLOW.SPEDIZIONE) o.flow = FLOW.COMPLETATO;

  render();
}

function removeOrder(id) {
  if (!confirm("Eliminare questo ordine?")) return;
  orders = orders.filter(x => x.id !== id);
  render();
}

// ====== FILTRI COLONNE ======
function inCol(o, colId) {
  if (colId === "PREP") return o.flow === FLOW.PREPARAZIONE;

  // due stanze: vedono SOLO quelli non ok del loro pezzo
  if (colId === "FRONTALE") return o.flow === FLOW.PREPARAZIONE && !o.frontaleOK;
  if (colId === "POSTERIORE") return o.flow === FLOW.PREPARAZIONE && !o.posterioreOK;

  // assemblaggio SOLO dopo doppio OK (autoToAssemblaggio)
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

      card.innerHTML = `
        <div class="title">${o.articolo} — € ${o.prezzo}</div>
        <div class="meta">
          <b>Cliente:</b> ${o.cliente}<br>
          <b>Sito:</b> ${o.sito}<br>
          <b>Frontale:</b> ${o.frontaleOK ? "OK ✅" : "NO ❌"} &nbsp;|&nbsp;
          <b>Posteriore:</b> ${o.posterioreOK ? "OK ✅" : "NO ❌"}
          ${o.note ? `<br><b>Note:</b> ${o.note}` : ""}
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "actions";

      // ---- BOTTONI BLINDATI PER COLONNA ----
      if (colDef.id === "FRONTALE") {
        const b = document.createElement("button");
        b.className = "small ok";
        b.textContent = "OK Frontale ✔";
        b.onclick = () => setFrontaleOK(o.id);
        actions.appendChild(b);
      }
      else if (colDef.id === "POSTERIORE") {
        const b = document.createElement("button");
        b.className = "small ok";
        b.textContent = "OK Posteriore ✔";
        b.onclick = () => setPosterioreOK(o.id);
        actions.appendChild(b);
      }
      else if (colDef.id === "ASSEMBLAGGIO" || colDef.id === "SPEDIZIONE") {
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
      }
      else if (colDef.id === "COMPLETATO") {
        const prev = document.createElement("button");
        prev.className = "small";
        prev.textContent = "← Indietro";
        prev.onclick = () => goPrev(o.id);
        actions.appendChild(prev);
      }
      else if (colDef.id === "PREP") {
        // NESSUN AVANTI QUI. SOLO elimina (se vuoi)
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

showNew();
