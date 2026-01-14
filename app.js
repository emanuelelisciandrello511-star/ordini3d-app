let orders = [];

// STATI (aggiunto ASSEMBLAGGIO)
const STATI = [
  { key: 0, name: "Preparazione", color: "#fff7cc", border: "#f1d36a" },
  { key: 1, name: "Stampa frontale", color: "#e8f2ff", border: "#7fb0ff" },
  { key: 2, name: "Stampa posteriore", color: "#ffe9dc", border: "#ffb184" },
  { key: 3, name: "Assemblaggio", color: "#f3e8ff", border: "#b68cff" },
  { key: 4, name: "Spedizione", color: "#e8fff3", border: "#7fe0a8" },
  { key: 5, name: "Completato", color: "#dfffe6", border: "#33c26b" }
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

  STATI.forEach((s) => {
    const col = document.createElement("div");
    col.className = "col";
    col.style.background = "#fff";
    col.style.borderColor = "#e6e7ee";

    // header
    const items = orders.filter(o => o.stato === s.key);

    const header = document.createElement("h2");
    header.innerHTML = `<span>${s.name}</span><span class="count">${items.length}</span>`;
    col.appendChild(header);

    // cards
    items.forEach(o => {
      const card = document.createElement("div");
      card.className = "card" + (s.name === "Completato" ? " done" : "");
      card.style.background = s.color;
      card.style.borderColor = s.border;

      card.innerHTML = `
        <div class="title">${o.progetto} — € ${o.prezzo}</div>
        <div class="meta">
          <b>Cliente:</b> ${o.cliente}<br>
          <b>Sito:</b> ${o.sito}
          ${o.note ? `<br><b>Note:</b> ${o.note}` : ""}
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "actions";

      const bPrev = document.createElement("button");
      bPrev.className = "small";
      bPrev.textContent = "← Indietro";
      bPrev.disabled = (o.stato === 0);
      bPrev.onclick = () => { o.stato = Math.max(0, o.stato - 1); render(); };

      const bNext = document.createElement("button");
      bNext.className = "small ok";
      bNext.textContent = "Avanti →";
      bNext.disabled = (o.stato === STATI.length - 1);
      bNext.onclick = () => { o.stato = Math.min(STATI.length - 1, o.stato + 1); render(); };

      actions.appendChild(bPrev);
      actions.appendChild(bNext);

      card.appendChild(actions);
      col.appendChild(card);
    });

    board.appendChild(col);
  });
}

// Avvio
showNew();
