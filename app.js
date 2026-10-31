const STORAGE_KEY = "mes-poubelles-collectes-v1";
let collectes = [];
let filtre = "toutes";

const $ = (id) => document.getElementById(id);
const dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
const shortFmt = new Intl.DateTimeFormat("fr-FR", { day:"numeric", month:"short" });

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function parseDate(s) { return new Date(`${s}T12:00:00`); }
function sorted(items) { return [...items].sort((a,b) => a.date.localeCompare(b.date)); }
function label(type) { return type === "jaune" ? "Poubelle jaune" : "Poubelle ménagère"; }
function emoji(type) { return type === "jaune" ? "🟨" : "🟥"; }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(collectes)); }

async function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { collectes = JSON.parse(saved); }
    catch { await loadInitial(); }
  } else {
    await loadInitial();
  }
  render();
}
async function loadInitial() {
  const response = await fetch("collectes.json");
  const data = await response.json();
  collectes = data.collectes || [];
  save();
}
function nextFor(type) {
  return sorted(collectes.filter(c => c.type === type && c.date >= localToday()))[0];
}
function render() {
  const upcoming = sorted(collectes.filter(c => c.date >= localToday()));
  const next = upcoming[0];
  $("next-title").textContent = next ? label(next.type) : "Aucune collecte programmée";
  $("next-date").textContent = next ? dateFmt.format(parseDate(next.date)) : "Ajoute tes prochaines dates pour continuer.";
  $("next-icon").textContent = next ? (next.type === "jaune" ? "🟨" : "🟥") : "🗑️";
  const yellow = nextFor("jaune"), red = nextFor("menagere");
  $("yellow-next").textContent = yellow ? shortFmt.format(parseDate(yellow.date)) : "Aucune";
  $("red-next").textContent = red ? shortFmt.format(parseDate(red.date)) : "Aucune";

  const visible = upcoming.filter(c => filtre === "toutes" || c.type === filtre);
  $("collection-list").innerHTML = "";
  $("empty-state").hidden = visible.length > 0;
  visible.forEach(c => {
    const row = document.createElement("article");
    row.className = "collection-item";
    const icon = document.createElement("div");
    icon.className = `bin-icon ${c.type}`;
    icon.textContent = c.type === "jaune" ? "♻️" : "🗑️";
    const main = document.createElement("div");
    main.className = "item-main";
    const name = document.createElement("strong");
    name.textContent = label(c.type);
    const status = document.createElement("small");
    status.textContent = c.done ? "Sortie ✓" : "À sortir la veille";
    main.append(name,status);
    const date = document.createElement("div");
    date.className = "item-date";
    date.textContent = shortFmt.format(parseDate(c.date));
    const actions = document.createElement("div");
    actions.className = "item-actions";
    const doneLabel = document.createElement("label");
    doneLabel.className = "done-label";
    doneLabel.title = "Confirmer que la poubelle est sortie";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox"; checkbox.checked = !!c.done;
    checkbox.addEventListener("change", () => { c.done = checkbox.checked; save(); render(); });
    doneLabel.append(checkbox, document.createTextNode("Sortie"));
    const edit = document.createElement("button");
    edit.className = "edit-button"; edit.type = "button"; edit.textContent = "Modifier";
    edit.addEventListener("click", () => openDialog(c));
    actions.append(doneLabel,edit);
    row.append(icon,main,date,actions);
    $("collection-list").append(row);
  });
}
function openDialog(item) {
  $("collection-form").reset();
  $("edit-id").value = item?.id || "";
  $("dialog-title").textContent = item ? "Modifier une collecte" : "Ajouter une collecte";
  $("type").value = item?.type || "jaune";
  $("date").value = item?.date || "";
  $("delete-button").hidden = !item;
  $("collection-dialog").showModal();
}
function closeDialog() { $("collection-dialog").close(); }

$("add-button").addEventListener("click", () => openDialog());
$("close-dialog").addEventListener("click", closeDialog);
$("cancel-dialog").addEventListener("click", closeDialog);
$("collection-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("edit-id").value;
  const type = $("type").value;
  const date = $("date").value;
  if (!date) return;
  if (id) {
    const item = collectes.find(c => c.id === id);
    if (item) { item.type = type; item.date = date; item.done = false; }
  } else {
    collectes.push({id:`${type}-${date}-${Date.now()}`,type,date,done:false});
  }
  save(); closeDialog(); render();
});
$("delete-button").addEventListener("click", () => {
  const id = $("edit-id").value;
  if (id && confirm("Supprimer cette date de collecte ?")) {
    collectes = collectes.filter(c => c.id !== id);
    save(); closeDialog(); render();
  }
});
document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  filtre = button.dataset.filter;
  document.querySelectorAll(".filter").forEach(b => b.classList.toggle("active", b === button));
  render();
}));
init().catch(error => {
  console.error(error);
  $("next-title").textContent = "Impossible de charger le calendrier";
  $("next-date").textContent = "Vérifie que collectes.json est bien présent dans le dépôt.";
});
