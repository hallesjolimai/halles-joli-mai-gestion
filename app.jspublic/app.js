const etatBadge = document.getElementById("connexion-etat");
const zoneConnexion = document.getElementById("zone-connexion");
const btnSync = document.getElementById("btn-sync");
const messageSync = document.getElementById("message-sync");
const corpsFactures = document.getElementById("corps-factures");

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function afficherMessage(texte, type) {
  messageSync.textContent = texte;
  messageSync.className = `message ${type}`;
  messageSync.classList.remove("hidden");
  setTimeout(() => messageSync.classList.add("hidden"), 5000);
}

async function verifierConnexion() {
  const res = await fetch("/auth/status");
  const data = await res.json();
  if (data.authorized) {
    etatBadge.textContent = "Gmail connecte";
    etatBadge.className = "etat-badge connecte";
    zoneConnexion.classList.add("hidden");
  } else {
    etatBadge.textContent = "Gmail non connecte";
    etatBadge.className = "etat-badge deconnecte";
    zoneConnexion.classList.remove("hidden");
  }
  return data.authorized;
}

async function chargerTableauDeBord() {
  const res = await fetch("/api/dashboard");
  const data = await res.json();
  document.getElementById("stat-total").textContent = data.totalFactures;
  document.getElementById("stat-30j").textContent = data.facturesLast30Days;
  document.getElementById("stat-sync").textContent = data.derniereSynchro
    ? formatDate(data.derniereSynchro)
    : "Jamais";
}

async function chargerFactures() {
  const res = await fetch("/api/factures");
  const factures = await res.json();

  if (factures.length === 0) {
    corpsFactures.innerHTML = `<tr><td colspan="4" class="vide">Aucune facture pour le moment.</td></tr>`;
    return;
  }

  corpsFactures.innerHTML = factures
    .map(
      (f) => `
      <tr>
        <td>${formatDate(f.date)}</td>
        <td>${escapeHtml(f.from)}</td>
        <td>${escapeHtml(f.subject)}</td>
        <td><a href="${f.driveViewLink || "#"}" target="_blank" rel="noopener">Ouvrir sur Drive</a></td>
      </tr>`
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function synchroniser() {
  btnSync.disabled = true;
  btnSync.textContent = "Synchronisation en cours...";
  try {
    const res = await fetch("/api/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur inconnue");
    afficherMessage(
      data.added > 0
        ? `${data.added} nouvelle(s) facture(s) telechargee(s).`
        : "Aucune nouvelle facture trouvee.",
      "succes"
    );
    await chargerTableauDeBord();
    await chargerFactures();
  } catch (err) {
    afficherMessage(err.message, "erreur");
  } finally {
    btnSync.disabled = false;
    btnSync.textContent = "Synchroniser maintenant";
  }
}

btnSync.addEventListener("click", synchroniser);

(async function init() {
  const connecte = await verifierConnexion();
  await chargerTableauDeBord();
  await chargerFactures();
  if (connecte && new URLSearchParams(window.location.search).get("connected")) {
    synchroniser();
  }
})();
