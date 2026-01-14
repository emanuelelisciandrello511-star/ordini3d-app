let orders = [];

const STATI = [
  "Preparazione",
  "Stampa frontale",
  "Stampa posteriore",
  "Spedizione",
  "Completato"
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
  const progetto = document.getElementById("progetto").value.trim();
  const prezzo = document.getElementById("prezzo").value.trim();
  const note = document.getElementById("note").value.trim();

  if (!cliente || !sito || !progetto || !prezzo) {
    alert("Compila Cliente, Sito vendita, Numero progetto e Prezzo.");
    return;
  }

  orders.push({ cliente, sito, progetto, prezzo, note, stato: 0 });

  document.getElementById("cliente").value = "";
  document.getElementById("sito").value = "";
  document.getElementById("progetto").value = "";
  document.getElementById("prezzo").value = "";
  document.getElementById("note").value = "";

  showPrep();
}

function render() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  STATI.forEach((nome, index) => {
    const col = document.createElement("div");
    col.className = "col";
    col.innerHTML = `<h2><span>${nome}</span><span class="count"></span></h2>`;

    const items = orders.filter(o => o.stato === index);

    col.querySelector(".count").textContent = items.length;

    items.forEach(o => {
      const card = document.createElement("div");
      card.className = "card" + (index === 4 ? " done" : "");

      card.innerHTML = `
        <div class="title">${o.progetto} — € ${o.prezzo}</div>
        <div class="meta"><b>Cliente:</b> ${o.cliente}<br><b>Sito:</b> ${o.sito}${o.note ? `<br><b>Note:</b> ${o.note}` : ""}</div>
        <div class="actions">
          <button class="small ok" onclick="nextOrder('${o.progetto}')">Avanti →</button>
        </div>
      `;

      col.appendChild(card);
    });

    board.appendChild(col);
  });
}

function nextOrder(progetto) {
  const ordine = orders.find(o => o.progetto === progetto);
  if (ordine && ordine.stato < 4) {
    ordine.stato++;
    render();
  }
}

// Avvio
showNew();

