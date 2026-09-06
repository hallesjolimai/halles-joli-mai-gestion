// server.js
// Portail de gestion independant - Les Halles Joli Mai
// Aucune IA n'est utilisee : recuperation des factures Gmail par regles simples (API Gmail officielle).

require("dotenv").config();
const express = require("express");
const path = require("path");
const cron = require("node-cron");
const gmailService = require("./gmail-service");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Authentification Google ---

app.get("/auth/status", (req, res) => {
  res.json({ authorized: gmailService.isAuthorized() });
});

app.get("/auth/google", (req, res) => {
  const url = gmailService.getAuthUrl();
  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.status(400).send(`Autorisation refusee : ${error}`);
  }
  try {
    await gmailService.saveTokenFromCode(code);
    res.redirect("/?connected=1");
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors de la connexion a Gmail. Verifiez vos identifiants Google Cloud (.env).");
  }
});

// --- API Factures ---

app.get("/api/factures", (req, res) => {
  const index = gmailService.loadIndex();
  res.json(index);
});

app.post("/api/sync", async (req, res) => {
  if (!gmailService.isAuthorized()) {
    return res.status(401).json({ error: "Non connecte a Gmail. Rendez-vous sur /auth/google" });
  }
  try {
    const result = await gmailService.syncInvoices();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Echec de la synchronisation", details: err.message });
  }
});

app.get("/api/dashboard", (req, res) => {
  const index = gmailService.loadIndex();
  const now = new Date();
  const last30Days = index.filter(
    (f) => (now - new Date(f.date)) / (1000 * 60 * 60 * 24) <= 30
  );
  res.json({
    totalFactures: index.length,
    facturesLast30Days: last30Days.length,
    derniereSynchro: index.length > 0 ? index[0].syncedAt : null,
  });
});

// --- Synchronisation automatique ---
// Toutes les 30 minutes, si un compte Gmail est connecte, on verifie les nouvelles factures.
const SYNC_CRON = process.env.SYNC_CRON || "*/30 * * * *";
cron.schedule(SYNC_CRON, async () => {
  if (!gmailService.isAuthorized()) return;
  try {
    const result = await gmailService.syncInvoices();
    if (result.added > 0) {
      console.log(`[sync auto] ${result.added} nouvelle(s) facture(s) telechargee(s).`);
    }
  } catch (err) {
    console.error("[sync auto] erreur :", err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Portail Les Halles Joli Mai demarre sur le port ${PORT}`);
});
