
const STORAGE_KEY = "homeJobsV1";

const seed = {
  version: 1,
  rooms: [
    {id:"kitchen", name:"Kitchen", emoji:"🍽️"},
    {id:"living", name:"Living Room", emoji:"🛋️"},
    {id:"bathroom", name:"Bathroom", emoji:"🛁"},
    {id:"mainbed", name:"Main Bedroom", emoji:"🛏️"},
    {id:"caseyroom", name:"Casey's Bedroom", emoji:"🧸"},
    {id:"rileyroom", name:"Riley's Bedroom", emoji:"🎮"},
    {id:"hall", name:"Hall & Stairs", emoji:"🪜"},
    {id:"other", name:"Other", emoji:"✨"}
  ],
  people: [
    {id:"parent", name:"Parent", role:"adult", emoji:"🧑"},
    {id:"casey", name:"Casey", role:"child", emoji:"👧"},
    {id:"riley", name:"Riley", role:"child", emoji:"👦"}
  ],
  tasks: [
    {id:crypto.randomUUID(), title:"Empty dishwasher", roomId:"kitchen", assigneeId:"riley", due:todayISO(), reward:0.75, notes:"", requiresApproval:true, status:"open", approvedAt:null, paid:false, createdAt:Date.now()},
    {id:crypto.randomUUID(), title:"Polish bedroom", roomId:"caseyroom", assigneeId:"casey", due:todayISO(), reward:1.00, notes:"Desk, bedside table and shelves", requiresApproval:true, status:"open", approvedAt:null, paid:false, createdAt:Date.now()}
  ]
};

function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){ localStorage.setItem(STORAGE_KEY, JSON.stringify(seed)); return structuredClone(seed); }
  try{return JSON.parse(raw)}catch(e){return structuredClone(seed)}
}
let state = load();
let currentView = "home";
let roomFilter = "all";

function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); }
function money(n){ return new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(n||0)); }
function room(id){ return state.rooms.find(r=>r.id===id) || {name:"Other",emoji:"✨"}; }
function person(id){ return state.people.find(p=>p.id===id) || {name:"Unassigned",emoji:"👤"}; }

function weekStart(date=new Date()){
  const d=new Date(date); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d;
}
function earnedThisWeek(personId){
  const start=weekStart().getTime();
  return state.tasks.filter(t=>t.assigneeId===personId && t.status==="approved" && !t.paid && (t.approvedAt||0)>=start).reduce((s,t)=>s+Number(t.reward||0),0);
}
function approvedUnpaid(personId){
  return state.tasks.filter(t=>t.assigneeId===personId && t.status==="approved" && !t.paid).reduce((s,t)=>s+Number(t.reward||0),0);
}
function openCount(personId){
  return state.tasks.filter(t=>t.assigneeId===personId && ["open","pending"].includes(t.status)).length;
}

function render(){
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===currentView));
  const app=document.getElementById("app");
  if(currentView==="home") app.innerHTML=renderHome();
  if(currentView==="rooms") app.innerHTML=renderRooms();
  if(currentView==="family") app.innerHTML=renderFamily();
  if(currentView==="pay") app.innerHTML=renderPay();
  wireDynamic();
  populateTaskSelects();
}

function renderHome(){
  const today=todayISO();
  const todayTasks=state.tasks.filter(t=>t.due===today && t.status!=="approved");
  const pending=state.tasks.filter(t=>t.status==="pending").length;
  const weekTotal=state.people.filter(p=>p.role==="child").reduce((s,p)=>s+approvedUnpaid(p.id),0);
  const visible = state.tasks
    .filter(t=>t.status!=="approved" || !t.paid)
    .sort((a,b)=>(a.due||"9999").localeCompare(b.due||"9999"));

  return `
    <section class="hero">
      <p class="eyebrow" style="color:#cbd5e1">Today</p>
      <h2>${todayTasks.length ? `${todayTasks.length} job${todayTasks.length===1?"":"s"} to keep on top of` : "You're all caught up"}</h2>
      <div class="hero-stats">
        <div class="stat"><strong>${todayTasks.length}</strong><span>Due today</span></div>
        <div class="stat"><strong>${pending}</strong><span>Need approval</span></div>
        <div class="stat"><strong>${money(weekTotal)}</strong><span>To pay</span></div>
      </div>
    </section>
    <div class="section-head"><h2>Jobs</h2><button class="link-btn" data-action="openTask">+ Add</button></div>
    <div class="cards">
      ${visible.length ? visible.map(renderTaskCard).join("") : `<div class="empty">No jobs yet. Tap + to add one.</div>`}
    </div>`;
}

function renderTaskCard(t){
  const p=person(t.assigneeId), r=room(t.roomId);
  const statusText = t.status==="pending" ? "Waiting for approval" : t.status==="approved" ? (t.paid?"Paid":"Approved") : "To do";
  return `<article class="card task-card">
    <div>
      <div class="task-title">${escapeHtml(t.title)}</div>
      <div class="meta">${r.emoji} ${escapeHtml(r.name)} · ${p.emoji} ${escapeHtml(p.name)}${t.due?` · Due ${friendlyDate(t.due)}`:""}</div>
      <div class="badges">
        <span class="badge">${statusText}</span>
        ${Number(t.reward)>0?`<span class="badge reward">${money(t.reward)}</span>`:""}
      </div>
      ${t.notes?`<p class="meta" style="margin:10px 0 0">${escapeHtml(t.notes)}</p>`:""}
      <div class="task-actions">
        ${t.status==="open" ? `<button class="small-btn done" data-action="done" data-id="${t.id}">✓ Done</button>`:""}
        ${t.status==="pending" ? `<button class="small-btn approve" data-action="approve" data-id="${t.id}">Approve</button>`:""}
        ${t.status==="approved" && !t.paid ? `<button class="small-btn done" data-action="undoApproval" data-id="${t.id}">Undo</button>`:""}
        <button class="small-btn delete" data-action="deleteTask" data-id="${t.id}">Delete</button>
      </div>
    </div>
    <div style="font-size:26px">${r.emoji}</div>
  </article>`;
}

function renderRooms(){
  const tasksFor = id => state.tasks.filter(t=>t.roomId===id && t.status!=="approved").length;
  return `
    <div class="section-head"><h2>Rooms</h2><button class="link-btn" data-action="openRoom">+ Add room</button></div>
    <div class="room-grid">
      ${state.rooms.map(r=>`<button class="card room-card" data-action="filterRoom" data-id="${r.id}" style="text-align:left;border:1px solid var(--line)">
        <span class="room-emoji">${r.emoji}</span>
        <span><strong>${escapeHtml(r.name)}</strong><br><span class="meta">${tasksFor(r.id)} open job${tasksFor(r.id)===1?"":"s"}</span></span>
      </button>`).join("")}
    </div>
    ${roomFilter!=="all" ? `
      <div class="section-head"><h2>${room(roomFilter).name}</h2><button class="link-btn" data-action="clearRoomFilter">Show all</button></div>
      <div class="cards">${state.tasks.filter(t=>t.roomId===roomFilter).map(renderTaskCard).join("") || `<div class="empty">No jobs in this room yet.</div>`}</div>`:""}`;
}

function renderFamily(){
  return `
    <div class="section-head"><h2>Family</h2><button class="link-btn" data-action="openPerson">+ Add person</button></div>
    <div class="cards">
      ${state.people.map(p=>`<article class="card person-row">
        <div class="avatar">${p.emoji||"👤"}</div>
        <div class="person-main">
          <strong>${escapeHtml(p.name)}</strong>
          <span class="meta">${p.role==="child"?"Child":"Adult"} · ${openCount(p.id)} open</span>
        </div>
        <div style="text-align:right"><div class="money">${p.role==="child"?money(approvedUnpaid(p.id)):"—"}</div><span class="meta">${p.role==="child"?"unpaid":" "}</span></div>
      </article>`).join("")}
    </div>`;
}

function renderPay(){
  const kids=state.people.filter(p=>p.role==="child");
  return `
    <section class="hero">
      <p class="eyebrow" style="color:#cbd5e1">Weekly rewards</p>
      <h2>${money(kids.reduce((s,p)=>s+approvedUnpaid(p.id),0))} currently owed</h2>
      <p style="opacity:.85;margin-bottom:0">Only approved jobs count towards payment.</p>
    </section>
    <div class="cards">
      ${kids.map(p=>{
        const total=approvedUnpaid(p.id);
        const week=earnedThisWeek(p.id);
        const approvedTasks=state.tasks.filter(t=>t.assigneeId===p.id && t.status==="approved" && !t.paid);
        return `<article class="card">
          <div class="paid-row"><div><strong style="font-size:18px">${p.emoji} ${escapeHtml(p.name)}</strong><div class="meta">${approvedTasks.length} approved job${approvedTasks.length===1?"":"s"}</div></div><div class="money">${money(total)}</div></div>
          <div class="badges"><span class="badge">This week: ${money(week)}</span></div>
          ${total>0?`<button class="primary full" data-action="markPaid" data-id="${p.id}">Mark ${money(total)} as paid</button>`:`<div class="meta" style="margin-top:12px">Nothing to pay yet.</div>`}
        </article>`;
      }).join("")}
    </div>`;
}

function populateTaskSelects(){
  const roomSel=document.getElementById("taskRoom");
  const personSel=document.getElementById("taskAssignee");
  if(roomSel) roomSel.innerHTML=state.rooms.map(r=>`<option value="${r.id}">${r.emoji} ${escapeHtml(r.name)}</option>`).join("");
  if(personSel) personSel.innerHTML=state.people.map(p=>`<option value="${p.id}">${p.emoji||"👤"} ${escapeHtml(p.name)}</option>`).join("");
  const due=document.getElementById("taskDue");
  if(due && !due.value) due.value=todayISO();
}

function wireDynamic(){
  document.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click", ()=>{
    const a=el.dataset.action, id=el.dataset.id;
    if(a==="openTask") openDialog("taskDialog");
    if(a==="openRoom") openDialog("roomDialog");
    if(a==="openPerson") openDialog("personDialog");
    if(a==="done") completeTask(id);
    if(a==="approve") approveTask(id);
    if(a==="undoApproval"){const t=state.tasks.find(x=>x.id===id); if(t){t.status="pending";t.approvedAt=null;save();}}
    if(a==="deleteTask"){ if(confirm("Delete this job?")){state.tasks=state.tasks.filter(x=>x.id!==id);save();}}
    if(a==="filterRoom"){roomFilter=id;render();}
    if(a==="clearRoomFilter"){roomFilter="all";render();}
    if(a==="markPaid"){ if(confirm(`Mark all approved rewards for ${person(id).name} as paid?`)){state.tasks.forEach(t=>{if(t.assigneeId===id&&t.status==="approved"&&!t.paid)t.paid=true});save();}}
  }));
}

function completeTask(id){
  const t=state.tasks.find(x=>x.id===id); if(!t)return;
  if(t.requiresApproval){t.status="pending"} else {t.status="approved"; t.approvedAt=Date.now()}
  save();
}
function approveTask(id){
  const t=state.tasks.find(x=>x.id===id); if(!t)return;
  t.status="approved"; t.approvedAt=Date.now(); save();
}

document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>{currentView=b.dataset.view;roomFilter="all";render()}));
document.getElementById("quickAddBtn").addEventListener("click",()=>openDialog("taskDialog"));
document.getElementById("settingsBtn").addEventListener("click",()=>openDialog("settingsDialog"));
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>document.getElementById(b.dataset.close).close()));

document.getElementById("taskForm").addEventListener("submit", e=>{
  e.preventDefault();
  state.tasks.push({
    id:crypto.randomUUID(),
    title:document.getElementById("taskTitle").value.trim(),
    roomId:document.getElementById("taskRoom").value,
    assigneeId:document.getElementById("taskAssignee").value,
    due:document.getElementById("taskDue").value,
    reward:Number(document.getElementById("taskReward").value||0),
    notes:document.getElementById("taskNotes").value.trim(),
    requiresApproval:document.getElementById("taskRequiresApproval").checked,
    status:"open", approvedAt:null, paid:false, createdAt:Date.now()
  });
  document.getElementById("taskForm").reset();
  document.getElementById("taskRequiresApproval").checked=true;
  document.getElementById("taskDialog").close();
  save();
});

document.getElementById("roomForm").addEventListener("submit",e=>{
  e.preventDefault();
  const name=document.getElementById("roomName").value.trim();
  if(!name)return;
  state.rooms.push({id:crypto.randomUUID(),name,emoji:"🚪"});
  document.getElementById("roomForm").reset(); document.getElementById("roomDialog").close(); save();
});

document.getElementById("personForm").addEventListener("submit",e=>{
  e.preventDefault();
  const name=document.getElementById("personName").value.trim();
  if(!name)return;
  state.people.push({id:crypto.randomUUID(),name,role:document.getElementById("personRole").value,emoji:"👤"});
  document.getElementById("personForm").reset(); document.getElementById("personDialog").close(); save();
});

document.getElementById("exportBtn").addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`home-jobs-backup-${todayISO()}.json`; a.click(); URL.revokeObjectURL(a.href);
});
document.getElementById("importInput").addEventListener("change",async e=>{
  const f=e.target.files?.[0]; if(!f)return;
  try{const imported=JSON.parse(await f.text()); if(!imported.rooms||!imported.people||!imported.tasks) throw new Error(); state=imported; save(); document.getElementById("settingsDialog").close(); alert("Backup imported.");}
  catch{alert("That backup file could not be read.");}
});
document.getElementById("resetBtn").addEventListener("click",()=>{
  if(confirm("Reset the app and remove all jobs from this device?")){state=structuredClone(seed);save();document.getElementById("settingsDialog").close();}
});

function openDialog(id){ populateTaskSelects(); document.getElementById(id).showModal(); }
function friendlyDate(iso){
  if(!iso)return "";
  const d=new Date(iso+"T12:00:00");
  if(iso===todayISO()) return "Today";
  const tomorrow=new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const tom=`${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,"0")}-${String(tomorrow.getDate()).padStart(2,"0")}`;
  if(iso===tom)return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short"}).format(d);
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))}
render();
