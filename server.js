require("dotenv").config();
const path = require("path");
const express = require("express");
const { sendServiceLog, sendAdminLog } = require("./bot");

const app = express();
app.use(express.json());

let pendingAccounts = [];

function verifyApiKey(req, res, next) {
  const expected = process.env.SERVICE_API_KEY;
  if (!expected) return next();
  const provided = req.get("x-api-key") || req.get("X-API-Key") || "";
  if (provided !== expected) {
    return res.status(401).json({ error: "Non autorise" });
  }
  next();
}

function formatParisDate(date = new Date()) {
  return date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
}

function formatParisTime(date = new Date(), showSeconds = false) {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: showSeconds ? "2-digit" : undefined,
    hour12: false,
    timeZone: "Europe/Paris"
  });
}

function getDiscordMention(userId) {
  if (!userId || userId === null) return "@Utilisateur inconnu";
  return `<@${userId}>`;
}

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Serve index.html for root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Service Logging - Prise de service
app.post("/api/service/start", verifyApiKey, async (req, res) => {
  try {
    const matricule = String(req.body?.matricule || "").trim();
    const discordId = String(req.body?.discordId || "").trim();
    
    if (!matricule) {
      return res.status(400).json({ error: "Matricule requis" });
    }

    const now = new Date();
    const date = formatParisDate(now);
    const time = formatParisTime(now, true);
    const timeShort = formatParisTime(now, false);
    const mention = discordId ? getDiscordMention(discordId) : `Agent ${matricule}`;
    
    const message =
`BCSO (Blaine County Sheriff Office)

🟢 Prise de service

${mention} a pris son service.

📅 Date
${date}

🕒 Heure
${time}

Blaine County Sheriff Office • Aujourd'hui à ${timeShort}`;

    await sendServiceLog(message);
    res.json({ ok: true });
  } catch (err) {
    console.error("[API] service/start:", err);
    res.status(503).json({
      error: "Impossible d'envoyer le log Discord",
      detail: err.message
    });
  }
});

// Service Logging - Fin de service
app.post("/api/service/end", verifyApiKey, async (req, res) => {
  try {
    const matricule = String(req.body?.matricule || "").trim();
    const discordId = String(req.body?.discordId || "").trim();
    const durationMinutes = Number(req.body?.durationMinutes);

    if (!matricule) {
      return res.status(400).json({ error: "Matricule requis" });
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
      return res.status(400).json({ error: "Duree invalide" });
    }

    const now = new Date();
    const date = formatParisDate(now);
    const time = formatParisTime(now, true);
    const timeShort = formatParisTime(now, false);
    const mention = discordId ? getDiscordMention(discordId) : `Agent ${matricule}`;
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    const duration = `${hours}h${minutes.toString().padStart(2, '0')}m`;

    const message =
`BCSO (Blaine County Sheriff Office)

🔴 Fin de service

${mention} a termine son service.

📅 Date
${date}

🕒 Heure
${time}

⏱️ Duree totale
${duration}

Blaine County Sheriff Office • Aujourd'hui à ${timeShort}`;

    await sendServiceLog(message);
    res.json({ ok: true });
  } catch (err) {
    console.error("[API] service/end:", err);
    res.status(503).json({
      error: "Impossible d'envoyer le log Discord",
      detail: err.message
    });
  }
});

// Account Management - Creer un compte
app.post("/api/account/create", verifyApiKey, async (req, res) => {
  try {
    const { matricule, password, roles, discordId } = req.body;
    
    if (!matricule || !password) {
      return res.status(400).json({ error: "Matricule et mot de passe requis" });
    }
    if (!discordId) {
      return res.status(400).json({ error: "ID Discord requis" });
    }
    if (!Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: "Au moins un rôle requis" });
    }

    const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const pendingAccount = {
      id: accountId,
      matricule,
      password,
      roles,
      discordId,
      createdAt: new Date().toISOString(),
      status: "pending"
    };

    pendingAccounts.push(pendingAccount);
    res.json({ ok: true, accountId });
  } catch (err) {
    console.error("[API] account/create:", err);
    res.status(500).json({ error: "Erreur lors de la création du compte", detail: err.message });
  }
});

// Get Pending Accounts
app.get("/api/account/pending", verifyApiKey, (req, res) => {
  try {
    res.json({ accounts: pendingAccounts });
  } catch (err) {
    console.error("[API] account/pending:", err);
    res.status(500).json({ error: "Erreur lors de la récupération des comptes", detail: err.message });
  }
});

// Validate Account
app.post("/api/account/validate", verifyApiKey, async (req, res) => {
  try {
    const { accountId, validatorDiscordId } = req.body;
    
    if (!accountId || !validatorDiscordId) {
      return res.status(400).json({ error: "Account ID et ID Discord du validateur requis" });
    }

    const accountIndex = pendingAccounts.findIndex(a => a.id === accountId);
    if (accountIndex === -1) {
      return res.status(404).json({ error: "Compte non trouvé" });
    }

    const account = pendingAccounts[accountIndex];
    const userMention = getDiscordMention(account.discordId);
    const validatorMention = getDiscordMention(validatorDiscordId);

    const now = new Date();
    const dateTime = `${formatParisDate(now)} à ${formatParisTime(now, true)}`;

    const logMessage =
`✅ VALIDATION DE COMPTE

${validatorMention} a validé la création du compte de ${userMention}

📋 Détails :
• Matricule : ${account.matricule}
• Rôles : ${account.roles.join(", ")}
• Validé le : ${dateTime}`;

    await sendAdminLog(logMessage);

    pendingAccounts.splice(accountIndex, 1);
    res.json({ ok: true });
  } catch (err) {
    console.error("[API] account/validate:", err);
    res.status(503).json({ error: "Erreur lors de la validation", detail: err.message });
  }
});

// Reject Account
app.post("/api/account/reject", verifyApiKey, async (req, res) => {
  try {
    const { accountId, rejectorDiscordId, reason } = req.body;
    
    if (!accountId || !rejectorDiscordId) {
      return res.status(400).json({ error: "Account ID et ID Discord du validateur requis" });
    }

    const accountIndex = pendingAccounts.findIndex(a => a.id === accountId);
    if (accountIndex === -1) {
      return res.status(404).json({ error: "Compte non trouvé" });
    }

    const account = pendingAccounts[accountIndex];
    const userMention = getDiscordMention(account.discordId);
    const rejectorMention = getDiscordMention(rejectorDiscordId);

    const now = new Date();
    const dateTime = `${formatParisDate(now)} à ${formatParisTime(now, true)}`;

    const logMessage =
`❌ REFUS DE COMPTE

${rejectorMention} a refusé la création du compte de ${userMention}

📋 Détails :
• Matricule : ${account.matricule}
• Rôles demandés : ${account.roles.join(", ")}
• Raison : ${reason || "Non spécifiée"}
• Refusé le : ${dateTime}`;

    await sendAdminLog(logMessage);

    pendingAccounts.splice(accountIndex, 1);
    res.json({ ok: true });
  } catch (err) {
    console.error("[API] account/reject:", err);
    res.status(503).json({ error: "Erreur lors du refus", detail: err.message });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`BCSO Panel + API : http://localhost:${PORT}`);
});
