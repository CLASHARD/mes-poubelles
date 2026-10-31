const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const USER_ID = process.env.SUPABASE_USER_ID;
const SEND_TEST = process.env.SEND_TEST === "true";
const EVENT_NAME = process.env.GITHUB_EVENT_NAME || "schedule";
const TIME_ZONE = "Europe/Paris";

if (!TOKEN || !CHAT_ID) {
  throw new Error("Secrets Telegram manquants : TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID.");
}
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !USER_ID) {
  throw new Error("Secrets Supabase manquants : SUPABASE_URL, SUPABASE_SECRET_KEY et SUPABASE_USER_ID.");
}

async function sendTelegramMessage(text) {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    throw new Error(`Erreur Telegram : ${result.description || `HTTP ${response.status}`}`);
  }
  console.log("Message Telegram envoyé avec succès.");
}

function parisDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, p.value]));
}
function parisToday() {
  const p = parisDateParts();
  return `${p.year}-${p.month}-${p.day}`;
}
function addOneDay(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function formatDate(value, includeYear = false) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long",
    ...(includeYear ? { year: "numeric" } : {})
  }).format(new Date(`${value}T12:00:00Z`));
}

async function getCollectes({ fromDate, exactDate } = {}) {
  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/collectes`);
  const params = new URLSearchParams({
    select: "type,date_collecte,done",
    owner_id: `eq.${USER_ID}`,
    order: "date_collecte.asc,type.asc"
  });
  if (exactDate) params.set("date_collecte", `eq.${exactDate}`);
  else if (fromDate) params.set("date_collecte", `gte.${fromDate}`);
  endpoint.search = params.toString();

  // With the new sb_secret_ API keys, send the key only in `apikey`.
  // It is an opaque API key, not a JWT, and must not be sent as Bearer.
  const response = await fetch(endpoint, {
    headers: { apikey: SUPABASE_SECRET_KEY, accept: "application/json" }
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Lecture Supabase impossible (HTTP ${response.status}) : ${bodyText.slice(0, 400)}`);
  }
  let rows;
  try { rows = JSON.parse(bodyText); }
  catch { throw new Error("Réponse Supabase invalide : JSON non lisible."); }
  if (!Array.isArray(rows)) throw new Error("Supabase n'a pas renvoyé une liste de collectes.");
  return rows;
}

// Run manually with the checkbox enabled to test both Telegram and Supabase.
if (EVENT_NAME === "workflow_dispatch" && SEND_TEST) {
  const rows = await getCollectes({ fromDate: parisToday() });
  const next = rows.find(row => row.date_collecte >= parisToday());
  const lines = [
    "✅ Test réussi !",
    "",
    "Le bot Telegram communique avec Supabase.",
    `${rows.length} collecte(s) future(s) trouvée(s) dans ton calendrier.`
  ];
  if (next) {
    lines.push("", `Prochaine collecte : ${formatDate(next.date_collecte, true)} — ${next.type === "jaune" ? "🟨 Poubelle jaune" : "🟥 Poubelle ménagère"}`);
  } else {
    lines.push("", "Aucune collecte future enregistrée.");
  }
  lines.push("", "Les rappels sont programmés la veille à 19 h (heure de Paris).");
  await sendTelegramMessage(lines.join("\n"));
  process.exit(0);
}

if (EVENT_NAME === "workflow_dispatch" && !SEND_TEST) {
  console.log("Exécution manuelle ignorée : coche 'Envoyer un message de test sur Telegram'.");
  process.exit(0);
}

// Scheduled run: send only unconfirmed collections taking place tomorrow.
const tomorrow = addOneDay(parisToday());
const rows = await getCollectes({ exactDate: tomorrow });
const pending = rows.filter(row => row.done === false);

if (pending.length === 0) {
  console.log(`Aucune collecte non confirmée le ${tomorrow}. Aucun message envoyé.`);
  process.exit(0);
}

const lines = ["🗑️ RAPPEL POUBELLES", "", `Demain, ${formatDate(tomorrow, true)} :`, ""];
for (const item of pending) {
  if (item.type === "jaune") lines.push("🟨 Poubelle jaune");
  else if (item.type === "menagere") lines.push("🟥 Poubelle ménagère");
}
lines.push("", "Pense à sortir le ou les bacs ce soir !");
await sendTelegramMessage(lines.join("\n"));
