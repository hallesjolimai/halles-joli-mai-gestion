// gmail-service.js
// Toute la logique de connexion a Gmail et de recuperation des factures.
// Aucune IA n'est utilisee ici : on se base sur des regles simples
// (mots-cles dans le sujet/expediteur + presence d'une piece jointe PDF).

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { google } = require("googleapis");

const TOKEN_PATH = path.join(__dirname, "data", "token.json");
const INDEX_PATH = path.join(__dirname, "data", "invoices-index.json");
const DRIVE_FOLDER_NAME = process.env.DRIVE_FOLDER_NAME || "Factures Halles Joli Mai";
let cachedDriveFolderId = null;

// Mots-cles utilises pour reperer les emails de factures.
// Modifiable via la variable d'environnement FACTURE_KEYWORDS (separes par des virgules)
const DEFAULT_KEYWORDS = ["facture", "invoice", "recu", "reçu"];

function getKeywords() {
  const raw = process.env.FACTURE_KEYWORDS;
  if (!raw) return DEFAULT_KEYWORDS;
  return raw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
}

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    client.setCredentials(token);
  }

  return client;
}

function isAuthorized() {
  return fs.existsSync(TOKEN_PATH);
}

function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      // drive.file : l'app ne peut voir/modifier QUE les fichiers qu'elle a elle-meme crees.
      // Elle n'a jamais acces au reste du Google Drive de l'utilisateur.
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
}

async function saveTokenFromCode(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  client.setCredentials(tokens);
  return client;
}

function loadIndex() {
  if (!fs.existsSync(INDEX_PATH)) return [];
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
}

function saveIndex(index) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
}

function decodeFilenameSafe(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Retrouve (ou cree si besoin) le dossier Google Drive dedie aux factures.
 * Le dossier est cree une seule fois puis reutilise (son id est mis en cache).
 */
async function getOrCreateDriveFolder(drive) {
  if (cachedDriveFolderId) return cachedDriveFolderId;

  const search = await drive.files.list({
    q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (search.data.files && search.data.files.length > 0) {
    cachedDriveFolderId = search.data.files[0].id;
    return cachedDriveFolderId;
  }

  const created = await drive.files.create({
    requestBody: {
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  cachedDriveFolderId = created.data.id;
  return cachedDriveFolderId;
}

/**
 * Upload un buffer PDF dans le dossier Drive dedie et renvoie l'id + le lien de visualisation.
 */
async function uploadToDrive(drive, folderId, filename, buffer) {
  const media = {
    mimeType: "application/pdf",
    body: Readable.from(buffer),
  };

  const file = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media,
    fields: "id, webViewLink",
  });

  return { id: file.data.id, webViewLink: file.data.webViewLink };
}

// Cherche dans les parts d'un message les pieces jointes PDF (recursif, gere les emails multipart imbriques)
function findPdfAttachments(payload) {
  const results = [];
  function walk(part) {
    if (!part) return;
    const filename = part.filename || "";
    if (
      filename &&
      part.body &&
      part.body.attachmentId &&
      filename.toLowerCase().endsWith(".pdf")
    ) {
      results.push({ filename, attachmentId: part.body.attachmentId });
    }
    if (part.parts) {
      part.parts.forEach(walk);
    }
  }
  walk(payload);
  return results;
}

/**
 * Scanne la boite Gmail a la recherche de nouvelles factures et telecharge
 * les PDF trouves dans le dossier /invoices. Renvoie la liste mise a jour.
 */
async function syncInvoices({ maxResults = 50 } = {}) {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });
  const folderId = await getOrCreateDriveFolder(drive);

  const keywords = getKeywords();
  // Requete Gmail : uniquement les emails avec piece jointe, sur les mots-cles factures
  const keywordQuery = keywords.map((k) => `"${k}"`).join(" OR ");
  const query = `has:attachment filename:pdf (${keywordQuery})`;

  const listResp = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const messages = listResp.data.messages || [];
  const index = loadIndex();
  const knownIds = new Set(index.map((i) => i.messageId));
  let added = 0;

  for (const msgRef of messages) {
    if (knownIds.has(msgRef.id)) continue; // deja telechargee

    const msg = await gmail.users.messages.get({
      userId: "me",
      id: msgRef.id,
      format: "full",
    });

    const headers = msg.data.payload.headers || [];
    const subject = (headers.find((h) => h.name === "Subject") || {}).value || "(sans objet)";
    const from = (headers.find((h) => h.name === "From") || {}).value || "expediteur inconnu";
    const dateHeader = (headers.find((h) => h.name === "Date") || {}).value;
    const receivedDate = dateHeader ? new Date(dateHeader) : new Date(Number(msg.data.internalDate));

    const attachments = findPdfAttachments(msg.data.payload);

    for (const att of attachments) {
      const attachmentData = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: msgRef.id,
        id: att.attachmentId,
      });

      const buffer = Buffer.from(attachmentData.data.data, "base64");
      const safeName = decodeFilenameSafe(att.filename);
      const storedFilename = `${msgRef.id}_${safeName}`;

      const driveFile = await uploadToDrive(drive, folderId, storedFilename, buffer);

      index.push({
        messageId: msgRef.id,
        subject,
        from,
        date: receivedDate.toISOString(),
        filename: storedFilename,
        originalFilename: att.filename,
        sizeBytes: buffer.length,
        driveFileId: driveFile.id,
        driveViewLink: driveFile.webViewLink,
        syncedAt: new Date().toISOString(),
      });
      added++;
    }
  }

  // Tri du plus recent au plus ancien
  index.sort((a, b) => new Date(b.date) - new Date(a.date));
  saveIndex(index);

  return { total: index.length, added };
}

module.exports = {
  isAuthorized,
  getAuthUrl,
  saveTokenFromCode,
  syncInvoices,
  loadIndex,
};
