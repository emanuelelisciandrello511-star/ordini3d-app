// ====== DATI ======
let orders = [];

const STATI = [
  "Preparazione",
  "Stampa frontale",
  "Stampa posteriore",
  "Spedizione",
  "Completato"
];

// ====== NAVIGAZIONE ======
function showNew() {
  document.getElementById("page-new").classList.remove("hidden");
  document.getElementById("page-prep").classList.add("hidden");
}

function showPrep() {
  document.getElementById("page-new").classList.add("hidden");
  document.getElementById("page-prep").classList.remove("hidden");
  render();
}

// ====== AGGIUNGI ORDINE ======
function addOrder() {
  const cliente = document.getElementById("cliente").value;
  const sito = document.getElementById("sito").value;
  const progetto = document.getElementById("progetto").value;
  const prezzo = document.getElementById("prezzo").value;
  const note = document.getElementById("note").value;

  if (!cliente || !sito || !progetto || !prezzo) {
    alert("Compila tutti i campi obbligatori");
    return;
  }

  orders.push({
    cliente,
    sito,
    progetto,
    prezzo,
    note,
    stato: 0
  });

  document.getElementById("cliente").value = "";
  document.getElementById("sito").value = "";
  document.getElementById("progetto").value = "";
  document.getElementById("prezzo").value = "";
  document.getElementById("note").value = "";

  showPrep();
}

// ====== RENDER BOARD ======
function render() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  STATI.forEach((nome, index) => {
    const col = document.createElement("div");
    col.className = "col";
    col.innerHTML = `<b>${nome}</b>`;

    orders.filter(o => o.stato === index).forEach(o => {
      const card = document.createElement("div");
      card.className = "card" + (index === 4 ? " done" : "");

      card.innerHTML = `
        <div><b>${o.progetto}</b></div>
        <div>${o.cliente}</div>
        <div>${o.sito}</div>
        <div>€ ${o.prezzo}</div>
        <button onclick="nextOrder('${o.progetto}')">Avanti</button>
      `;

      col.appendChild(card);
    });

    board.appendChild(col);
  });
}

// ====== AVANZA STATO ======
function nextOrder(progetto) {
  const ordine = orders.find(o => o.progetto === progetto);
  if (ordine && ordine.stato < 4) {
    ordine.stato++;
    render();
  }
}

// ====== AVVIO ======
showNew();
