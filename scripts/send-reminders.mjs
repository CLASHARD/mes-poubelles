import { readFile } from "node:fs/promises";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SEND_TEST = process.env.SEND_TEST === "true";
const EVENT_NAME = process.env.GITHUB_EVENT_NAME || "schedule";
const TIME_ZONE = "Europe/Paris";

if (!TOKEN || !CHAT_ID) {
  throw new Error(
    "Secrets manquants : ajoute TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID dans Settings > Secrets and variables > Actions."
  );
}

async function sendTelegramMessage(text) {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Réponse Telegram illisible (HTTP ${response.status}).`);
  }

  if (!response.ok || result.ok !== true) {
    // Ne jamais afficher le token dans les journaux GitHub Actions.
    throw new Error(`Telegram a refusé l'envoi : ${result.description || `HTTP ${response.status}`}`);
  }
  console.log("Message Telegram envoyé avec succès.");
}

function parisDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, p.value]));
}

function addOneDay(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function formatFrenchDate(dateString) {
  // Midi UTC évite tout changement de jour lors de l'affichage dans le fuseau de Paris.
  const date = new Date(`${dateString}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

// Le lancement manuel sert uniquement à tester le bot, jamais à envoyer par erreur
// un rappel réel hors de l'heure prévue.
if (EVENT_NAME === "workflow_dispatch") {
  if (!SEND_TEST) {
    console.log("Exécution manuelle ignorée : coche 'Envoyer un message de test sur Telegram' pour tester le bot.");
    process.exit(0);
  }
  await sendTelegramMessage(
    "✅ Test réussi !\n\nLe bot Mes poubelles est correctement connecté à Telegram.\nLes rappels automatiques sont programmés chaque veille de collecte à 19 h (heure de Paris)."
  );
  process.exit(0);
}

const now = new Date();
const parisParts = parisDateParts(now);
const today = `${parisParts.year}-${parisParts.month}-${parisParts.day}`;
const tomorrow = addOneDay(today);

const raw = await readFile(new URL("../collectes.json", import.meta.url), "utf8");
const calendar = JSON.parse(raw);
if (!Array.isArray(calendar.collectes)) {
  throw new Error("Le fichier collectes.json ne contient pas de liste 'collectes'.");
}

const dueTomorrow = calendar.collectes
  .filter(item => item.date === tomorrow)
  .sort((a, b) => a.type.localeCompare(b.type));

if (dueTomorrow.length === 0) {
  console.log(`Aucune collecte prévue le ${tomorrow}. Aucun message envoyé.`);
  process.exit(0);
}

const lines = [
  "🗑️ RAPPEL POUBELLES",
  "",
  `Demain, ${formatFrenchDate(tomorrow)} :`,
  "",
];

for (const item of dueTomorrow) {
  if (item.type === "jaune") lines.push("🟨 Poubelle jaune");
  else if (item.type === "menagere") lines.push("🟥 Poubelle ménagère");
  else lines.push(`Collecte : ${item.type}`);
}

lines.push("", "Pense à sortir le ou les bacs ce soir !");
await sendTelegramMessage(lines.join("\n"));
