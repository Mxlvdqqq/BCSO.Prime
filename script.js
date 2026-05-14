let users = [
  {
    matricule: "bcso",
    password: "1234",
    roles: ["État-major"],
    isOnDuty: false,
    serviceStart: null,
    totalMinutes: 0,
    serviceHistory: [],
    discordId: "YOUR_DISCORD_ID_HERE"
  },
  {
    matricule: "07",
    password: "pass07",
    roles: ["Corps exécutif", "Recruteur"],
    isOnDuty: false,
    serviceStart: null,
    totalMinutes: 924,
    serviceHistory: [],
    discordId: "YOUR_DISCORD_ID_HERE"
  },
  {
    matricule: "12",
    password: "pass12",
    roles: ["Corps d'encadrement", "État-major"],
    isOnDuty: false,
    serviceStart: null,
    totalMinutes: 512,
    serviceHistory: [],
    discordId: "YOUR_DISCORD_ID_HERE"
  },
  {
    matricule: "25",
    password: "pass25",
    roles: ["Corps de commandement"],
    isOnDuty: false,
    serviceStart: null,
    totalMinutes: 1335,
    serviceHistory: [],
    discordId: "YOUR_DISCORD_ID_HERE"
  }
];

let currentUser = null;
let activeServices = 0;
let sessionTimerId = null;

const DEFAULT_SERVICE_API_KEY = "bcso_service_api_key_secure";

function getApiBase() {
  if (typeof window === "undefined") return "";
  const custom = window.__BCSO_API_BASE__;
  if (typeof custom === "string" && custom.trim()) {
    return custom.replace(/\/$/, "");
  }
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

function getApiHeaders() {
  const headers = { "Content-Type": "application/json" };
  const key =
    typeof window !== "undefined" && typeof window.__BCSO_SERVICE_API_KEY__ === "string"
      ? window.__BCSO_SERVICE_API_KEY__
      : DEFAULT_SERVICE_API_KEY;
  if (key) headers["X-API-Key"] = key;
  return headers;
}
const availableRoles = [
  "Corps exécutif",
  "Corps d'encadrement",
  "Corps de commandement",
  "État-major",
  "Recruteur"
];

const ADMIN_ROLES = ["Corps de commandement", "État-major"];
const ACCOUNT_CREATION_ROLES = ["État-major", "Recruteur"];

function hasAccountCreationAccess(user = currentUser) {
  return user && ACCOUNT_CREATION_ROLES.some(role => user.roles.includes(role));
}

function hasAdminAccess(user = currentUser) {
  return user && ADMIN_ROLES.some(role => user.roles.includes(role));
}

function login() {
  const matricule = document.getElementById("matricule").value.trim();
  const password = document.getElementById("password").value.trim();
  const error = document.getElementById("loginError");

  const user = users.find(u => u.matricule === matricule && u.password === password);

  if (!user) {
    error.textContent = "Matricule ou mot de passe incorrect.";
    return;
  }

  currentUser = user;
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  error.textContent = "";

  updateUI();
  startSessionTimer();

  const logsBtn = document.getElementById("logsBtn");
  if (logsBtn) {
    logsBtn.style.display = hasAdminAccess() ? "block" : "none";
  }

  const createAccountHomeBtn = document.getElementById("createAccountHomeBtn");
  if (createAccountHomeBtn) {
    createAccountHomeBtn.style.display = hasAccountCreationAccess() ? "inline-flex" : "none";
  }

  const managePendingBtn = document.getElementById("managePendingBtn");
  if (managePendingBtn) {
    managePendingBtn.style.display = hasAdminAccess() ? "block" : "none";
  }
}

function switchTab(tabId, button) {
  if (tabId === 'logs' && !hasAdminAccess()) {
    toast("Accès refusé. Seuls les Corps de commandement et l'État-major peuvent accéder à cette page.", false);
    return;
  }
  
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.remove("active"));
  document.querySelectorAll(".menu-btn").forEach(btn => btn.classList.remove("active"));

  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add("active");
  if (button) button.classList.add("active");
}

function toggleService() {
  if (!currentUser) return;
  if (currentUser.isOnDuty) {
    void stopService();
  } else {
    void startService();
  }
}

async function startService() {
  if (!currentUser || currentUser.isOnDuty) return;

  const btn = document.getElementById("serviceBtn");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`${getApiBase()}/api/service/start`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ 
        matricule: currentUser.matricule,
        discordId: currentUser.discordId
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.detail || data.error || "Impossible d'enregistrer le service sur Discord.", false);
      return;
    }

    currentUser.isOnDuty = true;
    currentUser.serviceStart = new Date();
    updateUI();
  } catch {
    toast("Serveur injoignable — lancez le panel avec npm start (Node).", false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function stopService() {
  if (!currentUser || !currentUser.isOnDuty || !currentUser.serviceStart) return;

  const now = new Date();
  const diffMinutes = Math.floor((now - currentUser.serviceStart) / 60000);
  const matricule = currentUser.matricule;
  const discordId = currentUser.discordId;
  const sessionStart = currentUser.serviceStart;

  const btn = document.getElementById("serviceBtn");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`${getApiBase()}/api/service/end`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ 
        matricule, 
        discordId,
        durationMinutes: diffMinutes 
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.detail || data.error || "Impossible d'enregistrer la fin de service sur Discord.", false);
      return;
    }

    currentUser.totalMinutes += diffMinutes;
    currentUser.isOnDuty = false;
    currentUser.serviceHistory.unshift({
      start: sessionStart,
      end: now,
      duration: diffMinutes
    });
    currentUser.serviceStart = null;
    updateUI();
  } catch {
    toast("Serveur injoignable — lancez le panel avec npm start (Node).", false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function updateUI() {
  const statusText = document.getElementById("statusText");
  const serviceStatusPill = document.getElementById("serviceStatusPill");
  const serviceBtn = document.getElementById("serviceBtn");

  if (currentUser) {
    statusText.textContent = currentUser.isOnDuty ? "En service" : "Hors service";
    serviceStatusPill.innerHTML = currentUser.isOnDuty
      ? '<i class="fas fa-play"></i> En service'
      : '<i class="fas fa-pause"></i> Hors service';

    serviceBtn.textContent = currentUser.isOnDuty ? "Fin de service" : "Prendre service";
    serviceBtn.className = currentUser.isOnDuty ? "secondary-btn" : "primary-btn";

    activeServices = users.filter(u => u.isOnDuty).length;
    const hours = Math.floor(currentUser.totalMinutes / 60);
    const minutes = currentUser.totalMinutes % 60;

    document.getElementById("serviceTime").textContent = `${hours}h ${minutes.toString().padStart(2, "0")}m`;
    document.getElementById("activeServices").textContent = activeServices;
    document.getElementById("serviceSessionsCount").textContent = currentUser.serviceHistory.length;
    updateServiceHistory();
    updateAgentsServiceTime();
    updateActiveAgentsList();
  }
  updateCurrentSessionTimeDisplay();
}

function updateServiceHistory() {
  const historyList = document.getElementById("serviceHistory");
  if (!historyList || !currentUser) return;

  if (currentUser.serviceHistory.length === 0) {
    historyList.innerHTML = "<p>Aucune session récente.</p>";
    return;
  }

  historyList.innerHTML = currentUser.serviceHistory.slice(0, 10).map(session => {
    const start = new Date(session.start).toLocaleString("fr-FR");
    const hours = Math.floor(session.duration / 60);
    const minutes = session.duration % 60;
    return `<div class="history-item"><strong>${start}</strong> - ${hours}h ${minutes}m</div>`;
  }).join("");
}

function updateAgentsServiceTime() {
  const container = document.getElementById("agentsServiceTime");
  if (!container) return;

  container.innerHTML = users.map(user => {
    const hours = Math.floor(user.totalMinutes / 60);
    const minutes = user.totalMinutes % 60;
    return `<p>Agent ${user.matricule} : ${hours}h ${minutes.toString().padStart(2, "0")}m</p>`;
  }).join("");
}

function updateActiveAgentsList() {
  const list = document.getElementById("activeAgentsList");
  if (!list) return;

  const activeUsers = users.filter(user => user.isOnDuty);
  if (activeUsers.length === 0) {
    list.innerHTML = "<p>Aucun agent en service.</p>";
    return;
  }

  list.innerHTML = activeUsers.map(user =>
    `<div class="agent-status"><strong>Agent ${user.matricule}</strong> — En service</div>`
  ).join("");
}

function formatSessionHms(totalMs) {
  const totalSec = Math.max(0, Math.floor(totalMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function updateCurrentSessionTimeDisplay() {
  const el = document.getElementById("currentSessionTime");
  if (!el) return;
  if (!currentUser || !currentUser.isOnDuty || !currentUser.serviceStart) {
    el.textContent = "00h 00m 00s";
    return;
  }
  const start = currentUser.serviceStart instanceof Date
    ? currentUser.serviceStart.getTime()
    : new Date(currentUser.serviceStart).getTime();
  el.textContent = formatSessionHms(Date.now() - start);
}

function startSessionTimer() {
  if (sessionTimerId) return;

  sessionTimerId = setInterval(() => {
    updateCurrentSessionTimeDisplay();
  }, 250);
}

function toggleTheme() {
  document.documentElement.classList.toggle("light-mode");
}

function savePassword() {
  const currentPassword = document.getElementById("oldPassword").value.trim();
  const newPassword = document.getElementById("newPassword").value.trim();
  const confirmPassword = document.getElementById("confirmPassword").value.trim();

  if (!currentUser) {
    toast("Aucun utilisateur connecté.", false);
    return;
  }

  if (!currentPassword || !newPassword || !confirmPassword) {
    toast("Veuillez remplir tous les champs de mot de passe.", false);
    return;
  }

  if (currentPassword !== currentUser.password) {
    toast("Ancien mot de passe incorrect.", false);
    return;
  }

  if (newPassword.length < 6) {
    toast("Le nouveau mot de passe doit faire au moins 6 caractères.", false);
    return;
  }

  if (newPassword !== confirmPassword) {
    toast("Les mots de passe ne correspondent pas.", false);
    return;
  }

  currentUser.password = newPassword;
  document.getElementById("oldPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  toast("Mot de passe mis à jour avec succès.", true);
}

function showCreateAccountModal() {
  if (!hasAccountCreationAccess()) {
    toast("Seuls les État-major ou les Recruteurs peuvent créer des comptes.", false);
    return;
  }
  document.getElementById("createAccountModal").classList.remove("hidden");
}

function showManageAccountsModal() {
  if (!hasAdminAccess()) {
    toast("Accès refusé. Seuls les Corps de commandement et l'État-major peuvent gérer les comptes.", false);
    return;
  }
  updateAccountsList();
  document.getElementById("manageAccountsModal").classList.remove("hidden");
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add("hidden");
}

function createAccount() {
  const matricule = document.getElementById("newMatricule").value.trim();
  const password = document.getElementById("newPasswordInput").value.trim();
  const roleSelect = document.getElementById("newRoles");
  const roles = Array.from(roleSelect.selectedOptions).map(opt => opt.value);
  
  if (!matricule || !password || roles.length === 0) return;
  if (users.some(u => u.matricule === matricule)) return;
  
  users.push({
    matricule,
    password,
    roles,
    isOnDuty: false,
    serviceStart: null,
    totalMinutes: 0,
    serviceHistory: []
  });
  document.getElementById("newMatricule").value = "";
  document.getElementById("newPasswordInput").value = "";
  roleSelect.selectedIndex = -1;
  closeModal("createAccountModal");
  updateAccountsList();
}

function updateAccountsList() {
  const list = document.getElementById("accountsList");
  if (!list) return;
  list.innerHTML = users.map(user => `
    <div class="account-item">
      <div class="account-details">
        <div class="account-head">
          <span class="account-matricule">Agent ${user.matricule}</span>
          <span class="account-role-label">Rôles</span>
        </div>
        <select class="role-select multi-roles" multiple onchange="updateAccountRoles('${user.matricule}', this)">
          ${availableRoles.map(role => `<option value="${role}" ${user.roles.includes(role) ? 'selected' : ''}>${role}</option>`).join('')}
        </select>
        <div class="account-password">
          <span>Mot de passe :</span> ${user.password}
        </div>
      </div>
      <div class="account-actions">
        <button class="delete-btn" onclick="deleteAccount('${user.matricule}')">Supprimer</button>
      </div>
    </div>
  `).join("");
}

function updateAccountRole(matricule, role) {
  const user = users.find(u => u.matricule === matricule);
  if (!user || !availableRoles.includes(role)) return;
  
  // Store data for confirmation
  window.pendingConfirmation = {
    type: 'roleChange',
    matricule: matricule,
    newRole: role,
    oldRole: user.role
  };
  
  // Show confirmation modal
  const icon = document.getElementById("confirmationIcon");
  icon.innerHTML = '<i class="fas fa-shield-alt"></i>';
  document.getElementById("confirmationTitle").textContent = "Modifier le rôle";
  document.getElementById("confirmationMessage").textContent = 
    `Vous êtes sur le point de changer le rôle de l'agent ${matricule} de "${user.role}" à "${role}". Continuer ?`;
  document.getElementById("confirmationModal").classList.remove("hidden");
}

function updateAccountRoles(matricule, selectElement) {
  if (!hasAdminAccess()) {
    toast("Accès refusé. Seuls les Corps de commandement et l'État-major peuvent modifier les rôles.", false);
    const user = users.find(u => u.matricule === matricule);
    if (user) {
      Array.from(selectElement.options).forEach(option => {
        option.selected = user.roles.includes(option.value);
      });
    }
    return;
  }

  const user = users.find(u => u.matricule === matricule);
  if (!user) return;
  
  const selectedRoles = Array.from(selectElement.selectedOptions).map(opt => opt.value);
  
  if (selectedRoles.length === 0) {
    user.roles.forEach(role => {
      const option = selectElement.querySelector(`option[value="${role}"]`);
      if (option) option.selected = true;
    });
    toast("Un agent doit avoir au moins un rôle", false);
    return;
  }
  
  window.pendingConfirmation = {
    type: 'rolesChange',
    matricule: matricule,
    newRoles: selectedRoles,
    oldRoles: [...user.roles]
  };
  
  const icon = document.getElementById("confirmationIcon");
  icon.innerHTML = '<i class="fas fa-shield-alt"></i>';
  document.getElementById("confirmationTitle").textContent = "Modifier les rôles";
  document.getElementById("confirmationMessage").textContent = 
    `Vous êtes sur le point de changer les rôles de l'agent ${matricule} à : ${selectedRoles.join(", ")}. Continuer ?`;
  document.getElementById("confirmationModal").classList.remove("hidden");
}

function editAccount(matricule) {
  const user = users.find(u => u.matricule === matricule);
  if (!user) return;

  const newPassword = prompt("Nouveau mot de passe:", user.password) || user.password;
  user.password = newPassword;
  updateAccountsList();
}

function deleteAccount(matricule) {
  if (!hasAdminAccess()) {
    toast("Accès refusé. Seuls les Corps de commandement et l'État-major peuvent supprimer des comptes.", false);
    return;
  }
  if (!currentUser || matricule === currentUser.matricule) {
    toast("Vous ne pouvez pas supprimer votre propre compte depuis cette interface.", false);
    return;
  }
  users = users.filter(u => u.matricule !== matricule);
  updateAccountsList();
  updateAgentsServiceTime();
}

function modifyTime(minutes) {
  const matricule = document.getElementById("modifyMatricule").value.trim();
  const user = users.find(u => u.matricule === matricule);
  if (!user) return;
  
  // Store data for confirmation
  window.pendingConfirmation = {
    type: 'timeChange',
    matricule: matricule,
    minutes: minutes,
    action: minutes > 0 ? 'Ajout' : 'Retrait'
  };
  
  // Show confirmation modal
  const icon = document.getElementById("confirmationIcon");
  icon.innerHTML = '<i class="fas fa-clock"></i>';
  const absMins = Math.abs(minutes);
  const hours = Math.floor(absMins / 60);
  const mins = absMins % 60;
  const operation = minutes > 0 ? '+' : '-';
  document.getElementById("confirmationTitle").textContent = "Modifier les heures";
  let timeStr = '';
  if (hours > 0) timeStr += `${hours}h `;
  if (mins > 0) timeStr += `${mins}m`;
  document.getElementById("confirmationMessage").textContent = 
    `${operation} ${timeStr} pour l'agent ${matricule} ?`;
  document.getElementById("confirmationModal").classList.remove("hidden");
}

function applyCustomTime(mode) {
  const matricule = document.getElementById("modifyMatricule").value.trim();
  const hours = parseInt(document.getElementById("customHours").value, 10) || 0;
  const minutes = parseInt(document.getElementById("customMinutes").value, 10) || 0;
  if (!matricule || (hours === 0 && minutes === 0)) return;

  const user = users.find(u => u.matricule === matricule);
  if (!user) return;

  const total = hours * 60 + minutes;
  
  // Store data for confirmation
  window.pendingConfirmation = {
    type: 'timeChange',
    matricule: matricule,
    minutes: mode === 'remove' ? -total : total,
    action: mode === 'remove' ? 'Retrait' : 'Ajout'
  };
  
  // Show confirmation modal
  const icon = document.getElementById("confirmationIcon");
  icon.innerHTML = '<i class="fas fa-clock"></i>';
  const userObj = users.find(u => u.matricule === matricule);
  const operation = mode === 'remove' ? '- ' : '+ ';
  document.getElementById("confirmationTitle").textContent = "Modifier les heures";
  document.getElementById("confirmationMessage").textContent = 
    `${operation}${hours}h ${minutes}m pour l'agent ${matricule} ?`;
  document.getElementById("confirmationModal").classList.remove("hidden");
}

function toast(message, success) {
  const toastElement = document.createElement("div");
  toastElement.className = `toast ${success ? "toast-success" : "toast-error"}`;
  toastElement.textContent = message;
  document.body.appendChild(toastElement);
  setTimeout(() => toastElement.classList.add("visible"), 16);
  setTimeout(() => {
    toastElement.classList.remove("visible");
    setTimeout(() => document.body.removeChild(toastElement), 300);
  }, 2400);
}

// Confirmation System
window.pendingConfirmation = null;

function executeConfirmation() {
  const conf = window.pendingConfirmation;
  if (!conf) return;
  
  if (conf.type === 'resetHours') {
    users.forEach(user => user.totalMinutes = 0);
    updateAgentsServiceTime();
    if (currentUser) updateUI();
    toast("Toutes les heures ont été réinitialisées", true);
    closeModal("confirmationModal");
    window.pendingConfirmation = null;
    return;
  }
  
  switch (conf.type) {
    case 'roleChange':
      const user = users.find(u => u.matricule === conf.matricule);
      if (user) {
        user.role = conf.newRole;
        updateAccountsList();
        toast(`Rôle modifié pour l'agent ${conf.matricule}`, true);
      }
      break;
    case 'rolesChange':
      const rolesUser = users.find(u => u.matricule === conf.matricule);
      if (rolesUser) {
        rolesUser.roles = conf.newRoles;
        updateAccountsList();
        toast(`Rôles modifiés pour l'agent ${conf.matricule}`, true);
      }
      break;
    case 'timeChange':
      const timeUser = users.find(u => u.matricule === conf.matricule);
      if (timeUser) {
        timeUser.totalMinutes = Math.max(0, timeUser.totalMinutes + conf.minutes);
        updateAgentsServiceTime();
        if (currentUser && currentUser.matricule === conf.matricule) updateUI();
        const operation = conf.minutes > 0 ? 'Ajout' : 'Retrait';
        toast(`${operation} d'heures appliquées`, true);
        // Clear the input fields after successful application
        document.getElementById("modifyMatricule").value = "";
        document.getElementById("customHours").value = "";
        document.getElementById("customMinutes").value = "";
      }
      break;
    case 'resetHours':
      users.forEach(user => user.totalMinutes = 0);
      updateAgentsServiceTime();
      if (currentUser) updateUI();
      toast("Toutes les heures ont été réinitialisées", true);
      break;
  }
  
  closeModal("confirmationModal");
  window.pendingConfirmation = null;
}

function cancelConfirmation() {
  closeModal("confirmationModal");
  window.pendingConfirmation = null;
}

function showResetConfirm() {
  window.pendingConfirmation = {
    type: 'resetHours'
  };
  
  const icon = document.getElementById("confirmationIcon");
  icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
  document.getElementById("confirmationTitle").textContent = "Réinitialiser les heures";
  document.getElementById("confirmationMessage").textContent = 
    "Êtes-vous sûr de vouloir réinitialiser les heures de tous les agents ? Cette action est irréversible.";
  document.getElementById("confirmationModal").classList.remove("hidden");
}

// Account Creation Functions
function managePendingAccounts() {
  loadPendingAccounts();
  document.getElementById("managePendingAccountsModal").classList.remove("hidden");
}

async function requestAccountCreation() {
  const matricule = document.getElementById("newAccountMatricule")?.value.trim();
  const password = document.getElementById("newAccountPassword")?.value.trim();
  const discordId = document.getElementById("newAccountDiscordId")?.value.trim();
  const rolesSelect = document.getElementById("newAccountRoles");
  const roles = rolesSelect ? Array.from(rolesSelect.selectedOptions).map(opt => opt.value) : [];
  
  if (!hasAccountCreationAccess()) {
    toast("Seuls les État-major ou les Recruteurs peuvent créer des comptes.", false);
    return;
  }
  
  if (!matricule || !password || !discordId) {
    toast("Tous les champs sont requis (matricule, mot de passe, ID Discord)", false);
    return;
  }
  
  if (roles.length === 0) {
    toast("Au moins un rôle doit être sélectionné", false);
    return;
  }

  try {
    const res = await fetch(`${getApiBase()}/api/account/create`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ matricule, password, roles, discordId })
    });
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || "Erreur lors de la création du compte", false);
      return;
    }

    toast("Compte créé et envoyé pour validation", true);
    document.getElementById("newAccountMatricule").value = "";
    document.getElementById("newAccountPassword").value = "";
    document.getElementById("newAccountDiscordId").value = "";
    if (rolesSelect) rolesSelect.selectedIndex = -1;
    
    loadPendingAccounts();
  } catch (err) {
    console.error("Erreur lors de la création du compte:", err);
    toast("Serveur injoignable", false);
  }
}

async function loadPendingAccounts() {
  try {
    const res = await fetch(`${getApiBase()}/api/account/pending`, {
      method: "GET",
      headers: getApiHeaders()
    });
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Erreur:", data.error);
      return;
    }

    updatePendingAccountsList(data.accounts || []);
  } catch (err) {
    console.error("Erreur lors du chargement des comptes:", err);
  }
}

function updatePendingAccountsList(accounts) {
  const container = document.getElementById("pendingAccountsList");
  if (!container) return;

  if (accounts.length === 0) {
    container.innerHTML = "<p>Aucun compte en attente de validation.</p>";
    return;
  }

  container.innerHTML = accounts.map(account => `
    <div class="account-request-item">
      <div class="account-request-header">
        <strong>Agent ${account.matricule}</strong>
        <span class="badge-pending">En attente</span>
      </div>
      <div class="account-request-details">
        <p><strong>Rôles :</strong> ${account.roles.join(", ")}</p>
        <p><strong>ID Discord :</strong> ${account.discordId}</p>
        <p><strong>Créé :</strong> ${new Date(account.createdAt).toLocaleString("fr-FR")}</p>
      </div>
      <div class="account-request-actions">
        <button class="validate-btn" onclick="validateAccountRequest('${account.id}')">
          <i class="fas fa-check"></i> Valider
        </button>
        <button class="reject-btn" onclick="rejectAccountRequest('${account.id}')">
          <i class="fas fa-times"></i> Refuser
        </button>
      </div>
    </div>
  `).join("");
}

async function validateAccountRequest(accountId) {
  if (!currentUser || (!currentUser.roles.includes("Corps de commandement") && !currentUser.roles.includes("État-major"))) {
    toast("Seuls les Corps de commandement et État-major peuvent valider les comptes", false);
    return;
  }

  try {
    const res = await fetch(`${getApiBase()}/api/account/validate`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ 
        accountId,
        validatorDiscordId: currentUser.discordId
      })
    });
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || "Erreur lors de la validation", false);
      return;
    }

    toast("Compte validé avec succès", true);
    loadPendingAccounts();
  } catch (err) {
    console.error("Erreur:", err);
    toast("Serveur injoignable", false);
  }
}

async function rejectAccountRequest(accountId) {
  if (!currentUser || (!currentUser.roles.includes("Corps de commandement") && !currentUser.roles.includes("État-major"))) {
    toast("Seuls les Corps de commandement et État-major peuvent refuser les comptes", false);
    return;
  }

  const reason = prompt("Raison du refus (optionnel) :");

  try {
    const res = await fetch(`${getApiBase()}/api/account/reject`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ 
        accountId,
        rejectorDiscordId: currentUser.discordId,
        reason: reason || ""
      })
    });
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || "Erreur lors du refus", false);
      return;
    }

    toast("Compte refusé avec succès", true);
    loadPendingAccounts();
  } catch (err) {
    console.error("Erreur:", err);
    toast("Serveur injoignable", false);
  }
}

function showResetConfirm() {
  window.pendingConfirmation = {
    type: 'resetHours'
  };
  
  const icon = document.getElementById("confirmationIcon");
  icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
  document.getElementById("confirmationTitle").textContent = "Réinitialiser les heures";
  document.getElementById("confirmationMessage").textContent = 
    "Êtes-vous sûr de vouloir réinitialiser les heures de tous les agents ? Cette action ne peut pas être annulée.";
  document.getElementById("confirmationModal").classList.remove("hidden");
}

window.addEventListener("keydown", event => {
  if (event.key === "Enter" && !document.getElementById("loginScreen").classList.contains("hidden")) {
    login();
  }
});

updateUI();
