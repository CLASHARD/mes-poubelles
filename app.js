const $ = (id) => document.getElementById(id);
const TIME_ZONE = "Europe/Paris";
const CONFIG = window.MES_POUBELLES_CONFIG || {};
let supabaseClient = null;
let activeUser = null;
let collectes = [];
let filtre = "toutes";
let loadingUserId = null;

const dateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday:"long", day:"numeric", month:"long", year:"numeric" });
const shortFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day:"numeric", month:"short" });

function parisToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type,p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function parseDate(value) { return new Date(`${value}T12:00:00Z`); }
function sorted(items) { return [...items].sort((a,b) => a.date_collecte.localeCompare(b.date_collecte)); }
function label(type) { return type === "jaune" ? "Poubelle jaune" : "Poubelle ménagère"; }
function setMessage(id, text, kind="") {
  const node = $(id); node.textContent = text; node.className = `message ${kind}`;
}
function showAppMessage(text, kind="") { setMessage("app-message", text, kind); }
function setBusy(button, busy, busyText="Patiente…") {
  if (busy) { button.dataset.originalText = button.textContent; button.textContent = busyText; button.disabled = true; }
  else { button.textContent = button.dataset.originalText || button.textContent; button.disabled = false; }
}

function requireConfig() {
  const url = CONFIG.supabaseUrl;
  const key = CONFIG.supabasePublishableKey;
  if (!window.supabase || !url || !key || url.includes("COLLE_ICI") || key.includes("COLLE_ICI")) {
    setMessage("auth-message", "La connexion à Supabase n'est pas encore configurée. Complète les deux valeurs dans config.js puis republie le site.", "error");
    $("login-button").disabled = true;
    $("signup-button").disabled = true;
    return false;
  }
  supabaseClient = window.supabase.createClient(url, key);
  return true;
}

async function activateSession(session) {
  const user = session?.user || null;
  activeUser = user;
  if (!user) {
    loadingUserId = null;
    $("auth-panel").hidden = false;
    $("account-panel").hidden = true;
    $("calendar-app").hidden = true;
    return;
  }
  $("auth-panel").hidden = true;
  $("account-panel").hidden = false;
  $("calendar-app").hidden = false;
  $("account-email").textContent = user.email || "Compte connecté";
  $("account-user-id").textContent = user.id;
  if (loadingUserId === user.id) return;
  loadingUserId = user.id;
  try {
    showAppMessage("Synchronisation du calendrier…");
    await ensureInitialCalendar(user.id);
    await loadCollectes();
    showAppMessage("Calendrier synchronisé avec Supabase.", "success");
  } catch (error) {
    console.error(error);
    showAppMessage(`Erreur de synchronisation : ${error.message}`, "error");
  } finally {
    loadingUserId = null;
  }
}

async function ensureInitialCalendar(userId) {
  let { data: setting, error } = await supabaseClient
    .from("collectes_settings").select("initialised").eq("owner_id", userId).maybeSingle();
  if (error) throw error;
  if (!setting) {
    const created = await supabaseClient.from("collectes_settings")
      .insert({ owner_id: userId, initialised: false }).select("initialised").single();
    if (created.error && created.error.code !== "23505") throw created.error;
    if (created.error) {
      const retry = await supabaseClient.from("collectes_settings").select("initialised").eq("owner_id", userId).single();
      if (retry.error) throw retry.error;
      setting = retry.data;
    } else setting = created.data;
  }
  if (setting.initialised) return;

  const response = await fetch("./collectes.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Impossible de lire collectes.json pour initialiser ton calendrier.");
  const initial = await response.json();
  const rows = (initial.collectes || []).map(item => ({
    owner_id: userId,
    type: item.type,
    date_collecte: item.date,
    done: false
  }));
  if (rows.length) {
    const imported = await supabaseClient.from("collectes")
      .upsert(rows, { onConflict: "owner_id,type,date_collecte", ignoreDuplicates: true });
    if (imported.error) throw imported.error;
  }
  const marked = await supabaseClient.from("collectes_settings")
    .update({ initialised: true }).eq("owner_id", userId);
  if (marked.error) throw marked.error;
}

async function loadCollectes() {
  const { data, error } = await supabaseClient.from("collectes")
    .select("id,type,date_collecte,done").order("date_collecte", { ascending: true });
  if (error) throw error;
  collectes = data || [];
  render();
}

function nextFor(type) {
  return sorted(collectes.filter(c => c.type === type && c.date_collecte >= parisToday() && !c.done))[0];
}
function render() {
  const today = parisToday();
  const upcoming = sorted(collectes.filter(c => c.date_collecte >= today));
  const next = upcoming.find(c => !c.done);
  $("next-title").textContent = next ? label(next.type) : "Aucune collecte à venir";
  $("next-date").textContent = next ? dateFmt.format(parseDate(next.date_collecte)) : "Ajoute tes prochaines dates pour continuer.";
  $("next-icon").textContent = next ? (next.type === "jaune" ? "🟨" : "🟥") : "🗑️";
  const yellow = nextFor("jaune"), red = nextFor("menagere");
  $("yellow-next").textContent = yellow ? shortFmt.format(parseDate(yellow.date_collecte)) : "Aucune";
  $("red-next").textContent = red ? shortFmt.format(parseDate(red.date_collecte)) : "Aucune";

  const visible = upcoming.filter(c => filtre === "toutes" || c.type === filtre);
  $("collection-list").replaceChildren();
  $("empty-state").hidden = visible.length > 0;
  visible.forEach(c => {
    const row = document.createElement("article"); row.className = "collection-item";
    const icon = document.createElement("div"); icon.className = `bin-icon ${c.type}`; icon.textContent = c.type === "jaune" ? "♻️" : "🗑️";
    const main = document.createElement("div"); main.className = "item-main";
    const name = document.createElement("strong"); name.textContent = label(c.type);
    const status = document.createElement("small"); status.textContent = c.done ? "Sortie confirmée ✓" : "À sortir la veille";
    main.append(name,status);
    const date = document.createElement("div"); date.className = "item-date"; date.textContent = shortFmt.format(parseDate(c.date_collecte));
    const actions = document.createElement("div"); actions.className = "item-actions";
    const doneLabel = document.createElement("label"); doneLabel.className = "done-label"; doneLabel.title = "Confirmer que la poubelle est sortie";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = !!c.done;
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      const { error } = await supabaseClient.from("collectes").update({ done: checkbox.checked }).eq("id", c.id);
      if (error) { checkbox.checked = !checkbox.checked; showAppMessage(`Impossible d'enregistrer la confirmation : ${error.message}`, "error"); }
      else { showAppMessage("Confirmation enregistrée et synchronisée.", "success"); await loadCollectes(); }
      checkbox.disabled = false;
    });
    doneLabel.append(checkbox, document.createTextNode("Sortie"));
    const edit = document.createElement("button"); edit.className = "edit-button"; edit.type = "button"; edit.textContent = "Modifier";
    edit.addEventListener("click", () => openDialog(c));
    actions.append(doneLabel,edit); row.append(icon,main,date,actions); $("collection-list").append(row);
  });
}

function openDialog(item) {
  $("collection-form").reset();
  $("edit-id").value = item?.id || "";
  $("dialog-title").textContent = item ? "Modifier une collecte" : "Ajouter une collecte";
  $("type").value = item?.type || "jaune";
  $("date").value = item?.date_collecte || "";
  $("delete-button").hidden = !item;
  $("collection-dialog").showModal();
}
function closeDialog() { $("collection-dialog").close(); }

$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("login-button"); setBusy(button,true,"Connexion…");
  setMessage("auth-message", "");
  const { error } = await supabaseClient.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
  if (error) setMessage("auth-message", error.message, "error");
  setBusy(button,false);
});
$("signup-button").addEventListener("click", async () => {
  const button = $("signup-button"); setBusy(button,true,"Création…"); setMessage("auth-message", "");
  const email = $("email").value.trim(), password = $("password").value;
  if (!email || !password || password.length < 6) {
    setMessage("auth-message", "Renseigne une adresse e-mail et un mot de passe d'au moins 6 caractères.", "error"); setBusy(button,false); return;
  }
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
  if (error) setMessage("auth-message", error.message, "error");
  else if (!data.session) setMessage("auth-message", "Compte créé. Vérifie ta boîte e-mail pour confirmer l'adresse, puis connecte-toi ici.", "success");
  else setMessage("auth-message", "Compte créé et connecté.", "success");
  setBusy(button,false);
});
$("logout-button").addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) showAppMessage(error.message,"error");
});
$("copy-user-id").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(activeUser.id); showAppMessage("Identifiant copié. Colle-le dans le secret GitHub SUPABASE_USER_ID.","success"); }
  catch { showAppMessage(`Identifiant du compte : ${activeUser.id}`,"success"); }
});

$("add-button").addEventListener("click", () => openDialog());
$("close-dialog").addEventListener("click", closeDialog);
$("cancel-dialog").addEventListener("click", closeDialog);
$("collection-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("edit-id").value, type = $("type").value, date = $("date").value;
  if (!date) return;
  const button = event.submitter; if (button) setBusy(button,true,"Enregistrement…");
  const payload = { type, date_collecte: date, done: false };
  const result = id
    ? await supabaseClient.from("collectes").update(payload).eq("id",id)
    : await supabaseClient.from("collectes").insert(payload);
  if (button) setBusy(button,false);
  if (result.error) { showAppMessage(`Enregistrement impossible : ${result.error.message}`,"error"); return; }
  closeDialog(); showAppMessage("Collecte enregistrée et synchronisée.","success"); await loadCollectes();
});
$("delete-button").addEventListener("click", async () => {
  const id = $("edit-id").value;
  if (!id || !confirm("Supprimer cette date de collecte ?")) return;
  const { error } = await supabaseClient.from("collectes").delete().eq("id",id);
  if (error) { showAppMessage(`Suppression impossible : ${error.message}`,"error"); return; }
  closeDialog(); showAppMessage("Collecte supprimée.","success"); await loadCollectes();
});
document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  filtre = button.dataset.filter;
  document.querySelectorAll(".filter").forEach(b => b.classList.toggle("active", b === button));
  render();
}));

async function start() {
  if (!requireConfig()) return;
  supabaseClient.auth.onAuthStateChange((_event, session) => { void activateSession(session); });
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) setMessage("auth-message", error.message, "error");
  await activateSession(data?.session || null);
}
start().catch(error => { console.error(error); setMessage("auth-message", `Erreur de démarrage : ${error.message}`, "error"); });
