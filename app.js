// Stato semplice in memoria (per iniziare)
let orders = [];

// Mostra pagina nuovo ordine
function showNew() {
  document.getElementById("new").classList.remove("hide");
  document.getElementById("prep").classList.add("hide");
}

// Mostra pagina preparazione
function showPrep() {
  document.getElementById("new").classList.add("hide");
  document.getElementById("prep").classList.remove("hide");
  render();
}

// Aggiunge un ordine
function add() {
  const cliente = document.getElementById("cliente").value;
  const sito = document.getElementById("sito").value;
  const progetto = document.getElementById("progetto").value;
  const prezzo = document.getElementById("prezzo").value;
  const note = document.getElementById("note").value;

  if (!cliente || !sito || !progetto || !prezzo) {
    alert("Compila tutti i campi principali");
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

// Disegna la board
function render() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  const stati = [
    "Preparazione",
    "Stampa frontale",
    "Stampa posteriore",
    "Spedizione",
    "Completato"
  ];

  stati.forEach((nome, i) => {
    const col = document.createElement("div");
    col.className = "col";
    col.innerHTML = "<b>" + nome + "</b>";

    orders.filter(o => o.stato === i).forEach(o => {
      const card = document.createElement("div");
      card.className = "card" + (i === 4 ? " done" : "");
      card.innerHTML = `
        <div><b>${o.progetto}</b></div>
        <div>${o.cliente}</div>
        <div>€ ${o.prezzo}</div>
        <button onclick="next(this)">Avanti</button>
      `;
      col.appendChild(card);
    });

    board.appendChild(col);
  });
}

// Avanza stato
function next(btn) {
  const progetto = btn.parentElement.querySelector("b").innerText;
  const o = orders.find(x => x.progetto === progetto);
  if (o && o.stato < 4) o.stato++;
  render();
}

// Avvio
showNew();
