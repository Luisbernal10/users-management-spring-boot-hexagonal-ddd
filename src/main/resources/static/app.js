const API_BASE = "/api";
const TOKEN_KEY = "nexo.accessToken";
const ROLE_LABELS = { ADMIN: "Administrador", MEMBER: "Miembro", REVIEWER: "Revisor" };
const STATUS_LABELS = { ACTIVE: "Activo", INACTIVE: "Inactivo", PENDING: "Pendiente", BLOCKED: "Bloqueado" };
const AVATAR_COLORS = ["avatar-lilac", "avatar-blue", "avatar-rose", "avatar-mint", "avatar-amber"];

const loginView = document.querySelector("#login-view");
const appView = document.querySelector("#app-view");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const usersBody = document.querySelector("#users-table-body");
const loadingState = document.querySelector("#loading-state");
const emptyState = document.querySelector("#empty-state");
const userDialog = document.querySelector("#user-dialog");
const userForm = document.querySelector("#user-form");
const toast = document.querySelector("#toast");

let users = [];
let currentRole = "";
let editingUserId = null;
let toastTimeout;

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function decodeToken(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function showLogin() {
  loginView.hidden = false;
  appView.hidden = true;
  currentRole = "";
  users = [];
}

function showApp(role) {
  currentRole = role;
  loginView.hidden = true;
  appView.hidden = false;
  const roleLabel = ROLE_LABELS[role] || "Usuario";
  document.querySelector("#profile-role").textContent = roleLabel;
  const initial = roleLabel.charAt(0).toUpperCase();
  document.querySelector("#profile-avatar").textContent = initial;
  document.querySelector("#topbar-avatar").textContent = initial;
  const canManage = role === "ADMIN";
  document.querySelector("#create-user-button").hidden = !canManage;
  document.querySelector("#empty-create-button").hidden = !canManage;
  loadUsers();
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (getToken()) headers.set("Authorization", `Bearer ${getToken()}`);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401 && path !== "/auth/login") {
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin();
    throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
  }
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    if (response.status === 403) throw new Error("No tienes permisos para realizar esta acción.");
    throw new Error(data?.message || `No se pudo completar la solicitud (${response.status}).`);
  }
  return data;
}

function setFormError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.toggle("toast-error", isError);
  toast.classList.add("toast-visible");
  toastTimeout = window.setTimeout(() => toast.classList.remove("toast-visible"), 3200);
}

function updateStats() {
  document.querySelector("#user-count").textContent = users.length;
  document.querySelector("#stat-total").textContent = users.length;
  document.querySelector("#stat-active").textContent = users.filter(user => user.status === "ACTIVE").length;
  document.querySelector("#stat-pending").textContent = users.filter(user => user.status === "PENDING").length;
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase() || "?";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function visibleUsers() {
  const query = document.querySelector("#search-input").value.trim().toLocaleLowerCase();
  const status = document.querySelector("#status-filter").value;
  return users.filter(user => {
    const matchesQuery = [user.name, user.email, user.id, ROLE_LABELS[user.role]]
      .some(value => String(value || "").toLocaleLowerCase().includes(query));
    return matchesQuery && (!status || user.status === status);
  });
}

function renderUsers() {
  updateStats();
  const filteredUsers = visibleUsers();
  const isEmpty = filteredUsers.length === 0;
  usersBody.innerHTML = filteredUsers.map((user, index) => {
    const role = escapeHtml(user.role);
    const status = escapeHtml(user.status);
    const avatarClass = AVATAR_COLORS[index % AVATAR_COLORS.length];
    const actions = currentRole === "ADMIN"
      ? `<div class="row-actions">
          <button class="icon-button" type="button" data-action="edit" data-id="${escapeHtml(user.id)}" aria-label="Editar ${escapeHtml(user.name)}" title="Editar">✎</button>
          <button class="icon-button danger" type="button" data-action="delete" data-id="${escapeHtml(user.id)}" aria-label="Eliminar ${escapeHtml(user.name)}" title="Eliminar">⌫</button>
        </div>`
      : `<span class="muted">—</span>`;
    return `<tr>
      <td><div class="user-cell"><span class="avatar ${avatarClass}">${escapeHtml(initials(user.name))}</span><span class="user-identity"><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.email)}</span></span></div></td>
      <td><span class="user-id">${escapeHtml(user.id)}</span></td>
      <td><span class="role-chip role-${role.toLowerCase()}">${escapeHtml(ROLE_LABELS[user.role] || user.role)}</span></td>
      <td><span class="status-chip status-${status.toLowerCase()}">${escapeHtml(STATUS_LABELS[user.status] || user.status)}</span></td>
      <td>${actions}</td>
    </tr>`;
  }).join("");
  emptyState.hidden = !isEmpty;
  document.querySelector("#empty-title").textContent = users.length ? "No encontramos resultados" : "Aún no hay usuarios";
  document.querySelector("#empty-copy").textContent = users.length
    ? "Prueba con otro nombre, correo o filtro."
    : "Cuando agregues personas, aparecerán aquí.";
  document.querySelector("#results-label").textContent =
    `Mostrando ${filteredUsers.length} de ${users.length} ${users.length === 1 ? "usuario" : "usuarios"}`;
}

async function loadUsers() {
  loadingState.hidden = false;
  emptyState.hidden = true;
  usersBody.innerHTML = "";
  setFormError(document.querySelector("#load-error"), "");
  try {
    const data = await apiRequest("/users");
    if (!Array.isArray(data)) throw new Error("La respuesta del servidor no tiene el formato esperado.");
    users = data;
    renderUsers();
  } catch (error) {
    setFormError(document.querySelector("#load-error"), error.message);
    document.querySelector("#results-label").textContent = "No se pudieron cargar los usuarios";
  } finally {
    loadingState.hidden = true;
  }
}

function openUserDialog(user = null) {
  editingUserId = user ? user.id : null;
  userForm.reset();
  setFormError(document.querySelector("#dialog-error"), "");
  const isEditing = Boolean(user);
  document.querySelector("#dialog-title").textContent = isEditing ? "Editar usuario" : "Nuevo usuario";
  document.querySelector("#dialog-description").textContent = isEditing
    ? "Actualiza la información y los accesos de esta persona."
    : "Completa los datos para agregar una persona.";
  document.querySelector("#save-user-button").textContent = isEditing ? "Guardar cambios" : "Crear usuario";
  document.querySelector("#user-id-field").hidden = isEditing;
  document.querySelector("#password-field").hidden = false;
  document.querySelector("#status-field").hidden = !isEditing;
  const password = userForm.elements.password;
  userForm.elements.id.required = !isEditing;
  password.required = !isEditing;
  document.querySelector("#password-hint").textContent = isEditing
    ? "Déjalo vacío si no deseas cambiar la contraseña."
    : "Debe tener al menos 8 caracteres.";
  if (user) {
    userForm.elements.id.value = user.id;
    userForm.elements.name.value = user.name;
    userForm.elements.email.value = user.email;
    userForm.elements.role.value = user.role;
    userForm.elements.status.value = user.status;
  }
  userDialog.showModal();
}

async function submitUser(event) {
  event.preventDefault();
  const saveButton = document.querySelector("#save-user-button");
  const errorBox = document.querySelector("#dialog-error");
  const formData = new FormData(userForm);
  const payload = {
    name: formData.get("name").trim(),
    email: formData.get("email").trim(),
    role: formData.get("role")
  };
  const password = formData.get("password");
  if (password) payload.password = password;

  const path = editingUserId
    ? `/users/${encodeURIComponent(editingUserId)}`
    : "/users";
  const method = editingUserId ? "PUT" : "POST";
  if (editingUserId) {
    payload.status = formData.get("status");
  } else {
    payload.id = formData.get("id").trim();
    payload.password = password;
  }

  saveButton.disabled = true;
  saveButton.textContent = editingUserId ? "Guardando..." : "Creando...";
  setFormError(errorBox, "");
  try {
    await apiRequest(path, { method, body: JSON.stringify(payload) });
    userDialog.close();
    showToast(editingUserId ? "Usuario actualizado correctamente." : "Usuario creado correctamente.");
    await loadUsers();
  } catch (error) {
    setFormError(errorBox, error.message);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = editingUserId ? "Guardar cambios" : "Crear usuario";
  }
}

async function deleteUser(id) {
  const user = users.find(item => item.id === id);
  if (!user || !window.confirm(`¿Eliminar a ${user.name}? Esta acción no se puede deshacer.`)) return;
  try {
    await apiRequest(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });
    showToast("Usuario eliminado correctamente.");
    await loadUsers();
  } catch (error) {
    showToast(error.message, true);
  }
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = loginForm.querySelector("button[type=submit]");
  const formData = new FormData(loginForm);
  setFormError(loginError, "");
  submitButton.disabled = true;
  submitButton.querySelector("span:first-child").textContent = "Ingresando...";
  try {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: formData.get("email").trim(), password: formData.get("password") })
    });
    if (!result?.accessToken) throw new Error("El servidor no devolvió un token de acceso válido.");
    sessionStorage.setItem(TOKEN_KEY, result.accessToken);
    const claims = decodeToken(result.accessToken);
    showApp(claims?.role || "");
  } catch (error) {
    setFormError(loginError, error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span:first-child").textContent = "Iniciar sesión";
  }
});

document.querySelector("#logout-button").addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  showLogin();
  loginForm.reset();
});
document.querySelector("#create-user-button").addEventListener("click", () => openUserDialog());
document.querySelector("#empty-create-button").addEventListener("click", () => openUserDialog());
document.querySelector("#close-dialog-button").addEventListener("click", () => userDialog.close());
document.querySelector("#cancel-dialog-button").addEventListener("click", () => userDialog.close());
userForm.addEventListener("submit", submitUser);
document.querySelector("#search-input").addEventListener("input", renderUsers);
document.querySelector("#status-filter").addEventListener("change", renderUsers);
usersBody.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const user = users.find(item => item.id === button.dataset.id);
  if (button.dataset.action === "edit" && user) openUserDialog(user);
  if (button.dataset.action === "delete") deleteUser(button.dataset.id);
});
document.addEventListener("keydown", event => {
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    document.querySelector("#search-input").focus();
  }
});

const savedToken = getToken();
const savedClaims = savedToken ? decodeToken(savedToken) : null;
if (savedClaims?.role) showApp(savedClaims.role);
else showLogin();
