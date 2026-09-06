# Portail Les Halles Joli Mai — version indépendante

Cette application fonctionne **toute seule, sans intelligence artificielle**. Elle se connecte à votre Gmail via l'API officielle de Google, cherche les emails avec une pièce jointe PDF contenant des mots comme "facture" ou "invoice", les télécharge, et les range automatiquement dans un dossier **Google Drive** dédié ("Factures Halles Joli Mai") — rien n'est perdu même si le serveur redémarre ou s'endort.

Compte Gmail prévu pour cette app : `halles.jolimai@gmail.com` (à utiliser à l'étape 1 et à la connexion finale).

---

## Étape 1 — Créer les identifiants Google (15 minutes, une seule fois)

1. Allez sur https://console.cloud.google.com/
2. Connectez-vous avec `halles.jolimai@gmail.com` (le compte qui reçoit les factures).
3. En haut, cliquez sur le sélecteur de projet → **"Nouveau projet"**. Donnez-lui un nom, par exemple `halles-joli-mai`. Cliquez sur **Créer**.
4. Une fois le projet sélectionné, allez dans le menu ☰ → **APIs et services** → **Bibliothèque**.
5. Activez **deux** API (cherchez chacune, puis cliquez sur **Activer**) :
   - **Gmail API**
   - **Google Drive API**
6. Allez dans **APIs et services** → **Écran de consentement OAuth**.
   - Type d'utilisateur : **Externe** → Créer.
   - Remplissez le nom de l'app (`Halles Joli Mai`), l'email `halles.jolimai@gmail.com`, et enregistrez (les autres champs peuvent rester vides).
   - Dans "Utilisateurs test" (Test users), ajoutez `halles.jolimai@gmail.com`.
7. Allez dans **APIs et services** → **Identifiants** → **Créer des identifiants** → **ID client OAuth**.
   - Type d'application : **Application Web**.
   - Nom : `Portail Halles Joli Mai`.
   - Dans **URI de redirection autorisés**, ajoutez (vous mettrez la vraie adresse une fois Render configuré à l'étape 2) :
     ```
     https://VOTRE-NOM-D-APP.onrender.com/auth/google/callback
     ```
8. Cliquez sur **Créer**. Notez le **Client ID** et le **Client Secret** affichés : vous en aurez besoin à l'étape 3.

---

## Étape 2 — Héberger l'application sur Render (gratuit pour commencer)

1. Créez un compte sur https://render.com (vous pouvez vous inscrire avec GitHub).
2. Mettez ce dossier de code sur GitHub :
   - Créez un nouveau dépôt sur https://github.com/new (par exemple `halles-joli-mai-gestion`).
   - Suivez les instructions de GitHub pour y envoyer les fichiers de ce projet (ou utilisez GitHub Desktop si vous n'êtes pas à l'aise avec les lignes de commande).
3. Sur Render, cliquez sur **New +** → **Web Service**, puis connectez votre dépôt GitHub.
4. Configuration :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Plan** : Free suffit pour ce projet — les factures sont stockées sur Google Drive, pas sur le disque de Render, donc rien n'est perdu si le service redémarre ou "s'endort".
5. Une fois créé, Render vous donne une adresse du type `https://halles-joli-mai-gestion.onrender.com`. C'est cette adresse qu'il fallait mettre à l'étape 1.7.

ℹ️ Seule limite du plan gratuit : le service s'endort après ~15 minutes sans visite, et se réveille en quelques secondes à la prochaine visite ou lors de la synchro automatique suivante. Si vous voulez une synchro strictement toutes les 30 minutes sans interruption, passez au plan payant Starter (~7$/mois, toujours actif) — mais ce n'est plus indispensable ici.

---

## Étape 3 — Configurer les variables d'environnement sur Render

Dans votre service Render → onglet **Environment**, ajoutez :

| Clé | Valeur |
|---|---|
| `GOOGLE_CLIENT_ID` | le Client ID obtenu à l'étape 1 |
| `GOOGLE_CLIENT_SECRET` | le Client Secret obtenu à l'étape 1 |
| `GOOGLE_REDIRECT_URI` | `https://VOTRE-NOM-D-APP.onrender.com/auth/google/callback` |
| `FACTURE_KEYWORDS` | `facture,invoice,recu,reçu` (ajustez selon vos fournisseurs) |

Sauvegardez : Render redéploie automatiquement.

---

## Étape 4 — Se connecter et utiliser le portail

1. Ouvrez l'adresse de votre app Render dans le navigateur.
2. Cliquez sur **"Connecter mon compte Gmail"**.
3. Google va vous avertir que l'app n'est pas "vérifiée" (normal, car c'est votre app personnelle, pas publique) : cliquez sur **"Paramètres avancés"** puis **"Accéder à [nom de l'app] (non sécurisé)"**, puis autorisez l'accès en lecture seule à Gmail et la création de fichiers dans Drive.
4. Vous revenez sur le portail, connecté. Cliquez sur **"Synchroniser maintenant"** pour lancer le premier téléchargement de vos factures.
5. Ensuite, l'application se synchronise automatiquement toutes les 30 minutes (réglable via `SYNC_CRON`) tant qu'elle est en ligne.

---

## Développement en local (optionnel, pour tester avant de mettre en ligne)

```bash
npm install
cp .env.example .env
# remplissez .env avec vos identifiants (redirect URI = http://localhost:3000/auth/google/callback)
npm start
```//
Puis ouvrez http://localhost:3000

---

## Ce que fait exactement l'application (aucune IA)

- Elle interroge l'API Gmail avec une recherche classique : `has:attachment filename:pdf (facture OR invoice OR ...)`.
- Elle télécharge chaque pièce jointe PDF trouvée, puis l'envoie directement dans le dossier Google Drive **"Factures Halles Joli Mai"** (créé automatiquement au premier lancement).
- Elle garde un index (`data/invoices-index.json`, sur le serveur) pour ne jamais retélécharger deux fois le même email — mais les PDF eux-mêmes vivent sur votre Drive, pas sur le serveur.
- Le droit d'accès Drive demandé (`drive.file`) est volontairement restreint : l'application ne peut voir ou modifier QUE les fichiers qu'elle a elle-même créés, jamais le reste de votre Drive.
- Aucune donnée n'est envoyée à un service tiers d'IA : uniquement Google (Gmail + Drive) et votre propre serveur.

## Prochaines étapes possibles

Ce projet couvre la brique "factures automatiques". Le portail d'origine avait aussi : articles, prix de vente, marges, caisse, ardoises, équipe et heures. Je peux ajouter ces modules un par un dans cette même application si vous le souhaitez — dites-moi simplement lesquels sont prioritaires.
