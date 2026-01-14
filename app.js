const LS_KEY = "ordini3d_orders_v3";
let orders = loadOrders();

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

function loadOrders(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||"[]"); }catch{ return []; } }
function saveOrders(){ localStorage.setItem(LS_KEY, JSON.stringify(orders)); }

function pad(n){ return String(n).padStart(2,"0"); }
function fmtDT(iso){
  if(!iso) return "-";
  const d=new Date(iso);
  return ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())};
}
function dateKey(iso){
  const d=new Date(iso);
  return ${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())};
}
function euro(n){ const x=Number(n); return Number.isNaN(x) ? "0.00" : x.toFixed(2); }
function touch(o){ o.updatedAt=new Date().toISOString(); }

function $id(id){ return document.getElementById(id); }
function hideAllPages(){
  ["page-new","page-prep","page-sales"].forEach(id=>{
    const el=$id(id); if(el) el.classList.add("hide");
  });
}
function setActiveSafe(which){ try{ window.setActive(which); }catch{} }

function showNew(){
  hideAllPages();
  const el=$id("page-new"); if(el) el.classList.remove("hide");
  setActiveSafe("new");
  refreshActiveTable();
}
function showPrep(){
  hideAllPages();
  const el=$id("page-prep"); if(el) el.classList.remove("hide");
  setActiveSafe("prep");
  render();
}
function showSales(){
  hideAllPages();
  const el=$id("page-sales"); if(el) el.classList.remove("hide");
  setActiveSafe("sales");
  refreshSales();
}

function addOrder(){
  const cliente=($id("cliente")?.value||"").trim();
  const sito=($id("sito")?.value||"").trim();
  const articolo=($id("progetto")?.value||"").trim();
  const prezzo=($id("prezzo")?.value||"").trim();
  const note=($id("note")?.value||"").trim();

  if(!cliente||!sito||!articolo||!prezzo){ alert("Compila Cliente, Sito vendita, Numero progetto e Prezzo."); return; }

  const now=new Date().toISOString();
  const id=`${articolo}__${Date.now()}`;

  orders.unshift({
    id, cliente, sito, articolo, prezzo, note,
    flow: FLOW.PREPARAZIONE,
    frontaleOK:false, posterioreOK:false,
    createdAt: now, updatedAt: now, completedAt:null
  });

  saveOrders();
  ["cliente","sito","progetto","prezzo","note"].forEach(x=>{ const el=$id(x); if(el) el.value=""; });
  showPrep();
}

function autoToAssemblaggio(o){
  if(o.flow===FLOW.PREPARAZIONE && o.frontaleOK && o.posterioreOK){
    o.flow=FLOW.ASSEMBLAGGIO; touch(o);
  }
}
function setFrontaleOK(id){
  const o=orders.find(x=>x.id===id); if(!o) return;
  o.frontaleOK=true; touch(o); autoToAssemblaggio(o);
  saveOrders(); render(); refreshActiveTable();
}
function setPosterioreOK(id){
  const o=orders.find(x=>x.id===id); if(!o) return;
  o.posterioreOK=true; touch(o); autoToAssemblaggio(o);
  saveOrders(); render(); refreshActiveTable();
}

function goPrev(id){
  const o=orders.find(x=>x.id===id); if(!o) return;
  if(o.flow===FLOW.ASSEMBLAGGIO) o.flow=FLOW.PREPARAZIONE;
  else if(o.flow===FLOW.SPEDIZIONE) o.flow=FLOW.ASSEMBLAGGIO;
  else if(o.flow===FLOW.COMPLETATO) o.flow=FLOW.SPEDIZIONE;
  touch(o); saveOrders(); render(); refreshActiveTable(); refreshSales();
}
function goNext(id){
  const o=orders.find(x=>x.id===id); if(!o) return;
  if(o.flow===FLOW.ASSEMBLAGGIO) o.flow=FLOW.SPEDIZIONE;
  else if(o.flow===FLOW.SPEDIZIONE){ o.flow=FLOW.COMPLETATO; o.completedAt=new Date().toISOString(); }
touch(o); saveOrders(); render(); refreshActiveTable(); refreshSales();
}
function removeOrder(id){
  if(!confirm("Eliminare questo ordine?")) return;
  orders=orders.filter(x=>x.id!==id);
  saveOrders(); render(); refreshActiveTable(); refreshSales();
}

function inCol(o, colId){
  if(colId==="PREP") return o.flow===FLOW.PREPARAZIONE;
  if(colId==="FRONTALE") return o.flow===FLOW.PREPARAZIONE && !o.frontaleOK;
  if(colId==="POSTERIORE") return o.flow===FLOW.PREPARAZIONE && !o.posterioreOK;
  if(colId==="ASSEMBLAGGIO") return o.flow===FLOW.ASSEMBLAGGIO;
  if(colId==="SPEDIZIONE") return o.flow===FLOW.SPEDIZIONE;
  if(colId==="COMPLETATO") return o.flow===FLOW.COMPLETATO;
  return false;
}

function statusLabel(o){
  if(o.flow===FLOW.COMPLETATO) return {text:"COMPLETATO", cls:"pill ok"};
  if(o.flow===FLOW.SPEDIZIONE) return {text:"SPEDIZIONE", cls:"pill info"};
  if(o.flow===FLOW.ASSEMBLAGGIO) return {text:"ASSEMBLAGGIO", cls:"pill info"};
  if(!o.frontaleOK && !o.posterioreOK) return {text:"IN STAMPA (front+post)", cls:"pill warn"};
  if(o.frontaleOK && !o.posterioreOK) return {text:"ATTESA POSTERIORE", cls:"pill warn"};
  if(!o.frontaleOK && o.posterioreOK) return {text:"ATTESA FRONTALE", cls:"pill warn"};
  return {text:"PREPARAZIONE", cls:"pill warn"};
}

function render(){
  const board=$id("board"); if(!board) return;
  board.innerHTML="";

  COLS.forEach(colDef=>{
    const col=document.createElement("div");
    col.className="col";

    const items=orders.filter(o=>inCol(o,colDef.id));
    const h2=document.createElement("h2");
    h2.innerHTML=`<span>${colDef.title}</span><span class="count">${items.length}</span>`;
    col.appendChild(h2);

    items.forEach(o=>{
      const card=document.createElement("div");
      card.className="card"+(o.flow===FLOW.COMPLETATO?" done":"");
      card.style.background=colDef.bg;
      card.style.borderColor=colDef.border;

      card.innerHTML=`
        <div class="title">${o.articolo} — € ${euro(o.prezzo)}</div>
        <div class="meta">
          <b>Cliente:</b> ${o.cliente}<br>
          <b>Sito:</b> ${o.sito}<br>
          <b>Frontale:</b> ${o.frontaleOK?"OK ✅":"NO ❌"} &nbsp;|&nbsp;
          <b>Posteriore:</b> ${o.posterioreOK?"OK ✅":"NO ❌"}<br>
          <b>Creato:</b> ${fmtDT(o.createdAt)}<br>
          <b>Agg.:</b> ${fmtDT(o.updatedAt)}
          ${o.note?`<br><b>Note:</b> ${o.note}`:""}
        </div>
      `;

      const actions=document.createElement("div");
      actions.className="actions";

      if(colDef.id==="FRONTALE"){
        const b=document.createElement("button");
        b.className="small ok"; b.textContent="OK Frontale ✔";
        b.onclick=()=>setFrontaleOK(o.id);
        actions.appendChild(b);
      } else if(colDef.id==="POSTERIORE"){
        const b=document.createElement("button");
        b.className="small ok"; b.textContent="OK Posteriore ✔";
        b.onclick=()=>setPosterioreOK(o.id);
        actions.appendChild(b);
      } else if(colDef.id==="ASSEMBLAGGIO" || colDef.id==="SPEDIZIONE"){
        const prev=document.createElement("button");
        prev.className="small"; prev.textContent="← Indietro";
        prev.onclick=()=>goPrev(o.id);

        const next=document.createElement("button");
        next.className="small ok"; next.textContent="Avanti →";
        next.onclick=()=>goNext(o.id);

        actions.appendChild(prev); actions.appendChild(next);
      } else if(colDef.id==="COMPLETATO"){
        const prev=document.createElement("button");
        prev.className="small"; prev.textContent="← Indietro";
        prev.onclick=()=>goPrev(o.id);
        actions.appendChild(prev);
      } else if(colDef.id==="PREP"){
        const del=document.createElement("button");
        del.className="small danger"; del.textContent="Elimina";
        del.onclick=()=>removeOrder(o.id);
        actions.appendChild(del);
      }

      card.appendChild(actions);
      col.appendChild(card);
    });

    board.appendChild(col);
  });
}

function refreshActiveTable(){
  const tbody=$id("activeTbody"); if(!tbody) return;
  const actives=orders.
filter(o=>o.flow!==FLOW.COMPLETATO);
  tbody.innerHTML="";

  if(actives.length===0){
    tbody.innerHTML=`<tr><td colspan="7" class="muted">Nessun ordine attivo.</td></tr>`;
    return;
  }

  actives.forEach(o=>{
    const st=statusLabel(o);
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td>${o.articolo}</td>
      <td>${o.cliente}</td>
      <td>${o.sito}</td>
      <td>€ ${euro(o.prezzo)}</td>
      <td><span class="${st.cls}">${st.text}</span></td>
      <td>${fmtDT(o.createdAt)}</td>
      <td>${fmtDT(o.updatedAt)}</td>
    `;
    tbody.appendChild(tr);
  });
}

const SALES_UNLOCK_KEY="ordini3d_sales_unlocked";
function openSales(){
  const unlocked=sessionStorage.getItem(SALES_UNLOCK_KEY)==="1";
  if(!unlocked){
    const pass=prompt("Password Vendite:");
    if(pass!=="0000"){ alert("Password errata."); return; }
    sessionStorage.setItem(SALES_UNLOCK_KEY,"1");
  }
  showSales();
}
function lockSales(){
  sessionStorage.removeItem(SALES_UNLOCK_KEY);
  alert("Vendite bloccate.");
  showNew();
}
function refreshSales(){
  const wrap=$id("salesWrap"); if(!wrap) return;

  const completed=orders.filter(o=>o.flow===FLOW.COMPLETATO).slice()
    .sort((a,b)=>(b.completedAt||"").localeCompare(a.completedAt||""));

  if(completed.length===0){
    wrap.innerHTML=`<div class="muted">Nessuna vendita per ora.</div>`;
    return;
  }

  const map=new Map();
  completed.forEach(o=>{
    const k=dateKey(o.completedAt||o.updatedAt||o.createdAt);
    if(!map.has(k)) map.set(k,[]);
    map.get(k).push(o);
  });

  const days=Array.from(map.keys()).sort((a,b)=>b.localeCompare(a));
  wrap.innerHTML="";

  days.forEach(day=>{
    const arr=map.get(day);
    const total=arr.reduce((s,o)=>s+(Number(o.prezzo)||0),0);

    const block=document.createElement("div");
    block.className="panel";
    block.style.marginBottom="12px";

    block.innerHTML=`
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>${day}</b>
        <span class="pill ok">Totale € ${euro(total)} • Ordini ${arr.length}</span>
      </div>

      <table>
        <thead><tr><th>Ora</th><th>Articolo</th><th>Cliente</th><th>Sito</th><th>€</th></tr></thead>
        <tbody>
          ${arr.map(o=>`
            <tr>
              <td>${(fmtDT(o.completedAt).split(" ")[1]||"-")}</td>
              <td>${o.articolo}</td>
              <td>${o.cliente}</td>
              <td>${o.sito}</td>
              <td>€ ${euro(o.prezzo)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    wrap.appendChild(block);
  });
}

// AVVIO
showNew();
