(() => {
  const API_BASE = window.location.port === "8090" ? "" : "http://localhost:8090";
  const storageKey = "banikAdminToken";
  const categoryKey = "banikAdminCategory";

  const state = {
    token: localStorage.getItem(storageKey) || "",
    user: null,
    categories: [],
    notifications: [],
    unread: 0,
    view: "dashboard",
    category: localStorage.getItem(categoryKey) || "",
    players: [],
    matches: [],
    articles: [],
    reservations: [],
    canManageReservations: false,
    users: [],
  };

  const els = {
    loginView: document.getElementById("loginView"),
    appView: document.getElementById("appView"),
    loginForm: document.getElementById("loginForm"),
    loginUsername: document.getElementById("loginUsername"),
    loginPassword: document.getElementById("loginPassword"),
    rolesNav: document.getElementById("rolesNav"),
    userAvatar: document.getElementById("userAvatar"),
    userName: document.getElementById("userName"),
    userRole: document.getElementById("userRole"),
    viewKicker: document.getElementById("viewKicker"),
    viewTitle: document.getElementById("viewTitle"),
    notificationButton: document.getElementById("notificationButton"),
    notificationCount: document.getElementById("notificationCount"),
    logoutButton: document.getElementById("logoutButton"),
    toast: document.getElementById("toast"),
    content: document.getElementById("content"),
  };

  const viewMeta = {
    dashboard: ["Správa klubu", "Přehled"],
    players: ["Kategorie", "Soupisky"],
    matches: ["Zápasy", "Výsledky"],
    articles: ["Redakce", "Články"],
    reservations: ["Hřiště", "Rezervace"],
    roles: ["Admin", "Role"],
  };

  const escapeMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => escapeMap[char]);
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function todayISO() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return "-";
    const parts = String(value).split("-");
    if (parts.length !== 3) return esc(value);
    return `${parts[2]}. ${parts[1]}. ${parts[0]}`;
  }

  function statusText(status) {
    return {
      pending: "Čeká",
      approved: "Schváleno",
      rejected: "Zamítnuto",
      played: "Odehráno",
      planned: "Plánováno",
      cancelled: "Zrušeno",
    }[status] || status || "-";
  }

  function statusClass(status) {
    if (status === "approved" || status === "played") return "green";
    if (status === "pending" || status === "planned") return "amber";
    if (status === "rejected" || status === "cancelled") return "red";
    return "blue";
  }

  function facilityText(value) {
    return {
      field: "Hřiště",
      clubhouse: "Klubovna",
    }[value] || value || "Hřiště";
  }

  function laneText(value) {
    return {
      full: "Celé hřiště",
      half_a: "Polovina A",
      half_b: "Polovina B",
      clubhouse: "Klubovna",
    }[value] || value || "Celé hřiště";
  }

  function isAdmin() {
    return Boolean(state.user && state.user.is_admin);
  }

  function canCategory(category, permission) {
    if (isAdmin()) return true;
    return Boolean(state.user?.permissions?.[category]?.[permission]);
  }

  function viewableCategories() {
    if (isAdmin()) return state.categories;
    return state.categories.filter((category) => (
      canCategory(category.key, "can_manage_roster") || canCategory(category.key, "can_write_results")
    ));
  }

  function categoriesFor(permission) {
    if (isAdmin()) return state.categories;
    return state.categories.filter((category) => canCategory(category.key, permission));
  }

  function ensureCategory(permission) {
    const list = permission ? categoriesFor(permission) : viewableCategories();
    if (!list.length) {
      state.category = "";
      localStorage.removeItem(categoryKey);
      return "";
    }
    if (!state.category || !list.some((category) => category.key === state.category)) {
      state.category = list[0].key;
    }
    localStorage.setItem(categoryKey, state.category);
    return state.category;
  }

  function categoryName(key) {
    return state.categories.find((category) => category.key === key)?.name || key || "-";
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body = options.body;
    if (body && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      body,
      credentials: "include",
    });

    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }
    }

    if (!response.ok) {
      if (response.status === 401 && path !== "/api/login") {
        clearSession();
        showLogin();
      }
      throw new Error(data.error || "Požadavek se nepovedl.");
    }
    return data;
  }

  function setToast(message, type = "info") {
    if (!message) {
      els.toast.hidden = true;
      els.toast.textContent = "";
      return;
    }
    els.toast.textContent = message;
    els.toast.classList.toggle("error", type === "error");
    els.toast.hidden = false;
    window.clearTimeout(setToast.timer);
    setToast.timer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 4200);
  }

  function clearSession() {
    state.token = "";
    state.user = null;
    localStorage.removeItem(storageKey);
  }

  function showLogin() {
    els.loginView.hidden = false;
    els.appView.hidden = true;
  }

  function showApp() {
    els.loginView.hidden = true;
    els.appView.hidden = false;
  }

  async function loadMe() {
    const data = await api("/api/me");
    state.user = data.user;
    state.categories = data.categories || [];
    ensureCategory();
  }

  async function loadNotifications() {
    const data = await api("/api/notifications");
    state.notifications = data.notifications || [];
    state.unread = Number(data.unread || 0);
  }

  async function loadPlayers() {
    ensureCategory();
    if (!state.category) {
      state.players = [];
      return;
    }
    const data = await api(`/api/players?category=${encodeURIComponent(state.category)}`);
    state.players = data.players || [];
  }

  async function loadMatches() {
    ensureCategory();
    if (!state.category) {
      state.matches = [];
      return;
    }
    const data = await api(`/api/matches?category=${encodeURIComponent(state.category)}`);
    state.matches = data.matches || [];
  }

  async function loadArticles() {
    ensureCategory("can_write_results");
    if (!state.category) {
      state.articles = [];
      state.matches = [];
      return;
    }
    const data = await api(`/api/articles?category=${encodeURIComponent(state.category)}`);
    state.articles = data.articles || [];
    await loadMatches();
  }

  async function loadReservations() {
    const data = await api("/api/reservations");
    state.reservations = data.reservations || [];
    state.canManageReservations = Boolean(data.can_manage);
  }

  async function loadUsers() {
    const data = await api("/api/admin/users");
    state.users = data.users || [];
  }

  function renderShell() {
    if (!state.user) return;
    const [kicker, title] = viewMeta[state.view] || viewMeta.dashboard;
    els.viewKicker.textContent = kicker;
    els.viewTitle.textContent = title;
    els.notificationCount.textContent = String(state.unread);
    els.rolesNav.classList.toggle("hidden-role", !isAdmin());
    els.userName.textContent = state.user.display_name;
    els.userRole.textContent = isAdmin() ? "Administrátor" : "Uživatel";
    els.userAvatar.textContent = (state.user.display_name || state.user.username || "U").slice(0, 1).toUpperCase();
    qsa("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === state.view);
    });
  }

  function setLoading() {
    els.content.innerHTML = '<div class="empty-state">Načítám data...</div>';
  }

  async function switchView(view) {
    if (view === "roles" && !isAdmin()) {
      view = "dashboard";
    }
    state.view = view;
    renderShell();
    setLoading();
    try {
      await loadNotifications();
      if (view === "dashboard") {
        await loadReservations();
      }
      if (view === "players") {
        await loadPlayers();
      }
      if (view === "matches") {
        await loadMatches();
      }
      if (view === "articles") {
        await loadArticles();
      }
      if (view === "reservations") {
        await loadReservations();
      }
      if (view === "roles") {
        await loadUsers();
      }
      renderShell();
      renderView();
    } catch (error) {
      els.content.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
      setToast(error.message, "error");
    }
  }

  function renderView() {
    if (state.view === "players") return renderPlayers();
    if (state.view === "matches") return renderMatches();
    if (state.view === "articles") return renderArticles();
    if (state.view === "reservations") return renderReservations();
    if (state.view === "roles") return renderRoles();
    return renderDashboard();
  }

  function metric(label, value, color) {
    return `<article class="metric ${color || ""}"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;
  }

  function dashboardTile(view, title, copy, value, tone, icon) {
    return `
      <button type="button" class="admin-tile ${tone || ""}" data-go="${esc(view)}">
        <span class="tile-icon" aria-hidden="true">${icon}</span>
        <span class="tile-copy">
          <strong>${esc(title)}</strong>
          <small>${esc(copy)}</small>
        </span>
        <span class="tile-value">${esc(value)}</span>
      </button>
    `;
  }

  function renderDashboard() {
    const rosterCount = categoriesFor("can_manage_roster").length;
    const resultCount = categoriesFor("can_write_results").length;
    const pending = state.reservations.filter((item) => item.status === "pending").length;
    const managedReservations = state.canManageReservations ? "Ano" : "Jen žádosti";
    const playerIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"></path><circle cx="17" cy="9" r="2.7"></circle><path d="M16.5 15.2c2.6.2 4.4 1.7 5 4.3"></path></svg>';
    const matchIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4"></path><path d="M6 3h12v6a6 6 0 0 1-12 0V3z"></path><path d="M6 5H3.5A1.5 1.5 0 0 0 2 6.5 3.5 3.5 0 0 0 5.5 10H6M18 5h2.5A1.5 1.5 0 0 1 22 6.5 3.5 3.5 0 0 1 18.5 10H18"></path></svg>';
    const articleIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5a2 2 0 0 1 2-2h9l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z"></path><path d="M14 3v6h6M8 13h8M8 17h6"></path></svg>';
    const reservationIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"></rect><path d="M8 2v4M16 2v4M3 9h18M8 14h3M8 17.5h6"></path></svg>';
    const roleIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 4v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V7l7-4z"></path><path d="M9.5 12.5l1.7 1.7 3.8-4"></path></svg>';

    els.content.innerHTML = `
      <section class="home-intro">
        <h2>Dobrý den</h2>
        <p>Co chcete dnes spravovat?</p>
      </section>

      <div class="admin-tile-grid">
        ${dashboardTile("players", "Soupisky", "Hráči, čísla a aktivita", `${rosterCount} týmů`, "green", playerIcon)}
        ${dashboardTile("matches", "Výsledky", "Zápasy, skóre a poznámky", `${resultCount} týmů`, "red", matchIcon)}
        ${dashboardTile("articles", "Články", "Reportáže a aktuality na web", "Editor", "blue", articleIcon)}
        ${dashboardTile("reservations", "Rezervace", "Hřiště a klubovna", pending ? `${pending} čeká` : managedReservations, "amber", reservationIcon)}
        ${isAdmin() ? dashboardTile("roles", "Role", "Uživatelé a oprávnění", "Admin", "dark", roleIcon) : ""}
      </div>

      <div class="grid cols-2" style="margin-top:14px">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">Nejbližší věci</h2>
              <p class="panel-copy">${pending ? `${pending} rezervací čeká na reakci.` : "V rezervacích teď nic nehoří."}</p>
            </div>
            <button type="button" class="ghost-btn" data-go="reservations">Rezervace</button>
          </div>
          <div class="records">
            ${state.reservations.slice(0, 4).map(reservationCard).join("") || '<div class="empty-state">Zatím tu nejsou žádné rezervace.</div>'}
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">Oznámení</h2>
              <p class="panel-copy">${state.unread ? `${state.unread} nových oznámení.` : "Všechno je přečtené."}</p>
            </div>
            <button type="button" class="ghost-btn" data-mark-read>Označit přečtené</button>
          </div>
          ${notificationList()}
        </section>
      </div>
    `;
  }

  function categoryToolbar(copy) {
    const categories = state.view === "articles" ? categoriesFor("can_write_results") : viewableCategories();
    ensureCategory(state.view === "articles" ? "can_write_results" : undefined);
    if (!categories.length) {
      return '<div class="empty-state">Tento účet nemá přidělenou žádnou kategorii.</div>';
    }
    return `
      <div class="toolbar">
        <div>
          <p class="panel-copy">${esc(copy)}</p>
        </div>
        <label>
          <span>Kategorie</span>
          <select id="categorySelect">
            ${categories.map((category) => `<option value="${esc(category.key)}" ${category.key === state.category ? "selected" : ""}>${esc(category.name)}</option>`).join("")}
          </select>
        </label>
      </div>
    `;
  }

  function renderPlayers() {
    const canEdit = state.category && canCategory(state.category, "can_manage_roster");
    const form = canEdit ? `
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2 class="panel-title" id="playerFormTitle">Přidat hráče</h2>
            <p class="panel-copy">Soupiska se ukládá do lokální SQLite databáze.</p>
          </div>
        </div>
        <form class="form-grid" id="playerForm">
          <label>
            <span>Jméno</span>
            <input name="first_name" required>
          </label>
          <label>
            <span>Příjmení</span>
            <input name="last_name" required>
          </label>
          <label>
            <span>Číslo</span>
            <input name="number" type="number" min="0" max="99">
          </label>
          <label>
            <span>Pozice</span>
            <input name="position" placeholder="Brankář, obránce...">
          </label>
          <label class="check-line wide">
            <input name="active" type="checkbox" checked>
            Aktivní hráč
          </label>
          <div class="form-actions">
            <button type="submit" class="primary-btn">Uložit hráče</button>
            <button type="button" class="ghost-btn" data-cancel-player>Vyčistit</button>
          </div>
        </form>
      </section>
    ` : `
      <section class="panel">
        <div class="empty-state">Tuhle soupisku můžete jen zobrazit. Úpravy musí povolit administrátor.</div>
      </section>
    `;

    els.content.innerHTML = `
      ${categoryToolbar("Vyber kategorii a spravuj hráče, čísla, pozice i aktivitu.")}
      <div class="grid cols-2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">${esc(categoryName(state.category))}</h2>
              <p class="panel-copy">${state.players.length} hráčů v soupisce.</p>
            </div>
            <span class="pill ${canEdit ? "green" : "amber"}">${canEdit ? "Lze upravit" : "Jen čtení"}</span>
          </div>
          <div class="records">
            ${state.players.map(playerCard).join("") || '<div class="empty-state">Zatím žádný hráč v této kategorii.</div>'}
          </div>
        </section>
        ${form}
      </div>
    `;
  }

  function playerCard(player) {
    const canEdit = canCategory(state.category, "can_manage_roster");
    return `
      <article class="record">
        <div class="record-main">
          <div class="record-title">
            <span class="pill blue">#${esc(player.number || "-")}</span>
            <strong>${esc(player.first_name)} ${esc(player.last_name)}</strong>
            <span class="pill ${player.active ? "green" : "red"}">${player.active ? "Aktivní" : "Neaktivní"}</span>
          </div>
          <div class="record-meta">${esc(player.position || "Pozice není vyplněná")}</div>
        </div>
        ${canEdit ? `
          <div class="record-actions">
            <button type="button" class="mini-btn" data-edit-player="${player.id}">Upravit</button>
            <button type="button" class="danger-btn" data-delete-player="${player.id}">Smazat</button>
          </div>
        ` : ""}
      </article>
    `;
  }

  function renderMatches() {
    const canEdit = state.category && canCategory(state.category, "can_write_results");
    const form = canEdit ? `
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2 class="panel-title" id="matchFormTitle">Zapsat výsledek</h2>
            <p class="panel-copy">Výsledky jsou oddělené podle kategorie.</p>
          </div>
        </div>
        <form class="form-grid" id="matchForm">
          <label>
            <span>Datum</span>
            <input name="played_on" type="date" value="${todayISO()}" required>
          </label>
          <label>
            <span>Soupeř</span>
            <input name="opponent" required>
          </label>
          <label>
            <span>Hřiště</span>
            <select name="home_away">
              <option value="home">Doma</option>
              <option value="away">Venku</option>
            </select>
          </label>
          <label>
            <span>Stav</span>
            <select name="status">
              <option value="played">Odehráno</option>
              <option value="planned">Plánováno</option>
              <option value="cancelled">Zrušeno</option>
            </select>
          </label>
          <label>
            <span>Góly Baník</span>
            <input name="goals_for" type="number" min="0" value="0">
          </label>
          <label>
            <span>Góly soupeř</span>
            <input name="goals_against" type="number" min="0" value="0">
          </label>
          <label class="wide">
            <span>Poznámka</span>
            <textarea name="note"></textarea>
          </label>
          <div class="form-actions">
            <button type="submit" class="primary-btn">Uložit výsledek</button>
            <button type="button" class="ghost-btn" data-cancel-match>Vyčistit</button>
          </div>
        </form>
      </section>
    ` : `
      <section class="panel">
        <div class="empty-state">Výsledky této kategorie můžete jen zobrazit. Úpravy musí povolit administrátor.</div>
      </section>
    `;

    els.content.innerHTML = `
      ${categoryToolbar("Vyber kategorii a zapisuj odehrané i plánované zápasy.")}
      <div class="grid cols-2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">${esc(categoryName(state.category))}</h2>
              <p class="panel-copy">${state.matches.length} zápasů v databázi.</p>
            </div>
            <span class="pill ${canEdit ? "green" : "amber"}">${canEdit ? "Lze upravit" : "Jen čtení"}</span>
          </div>
          <div class="records">
            ${state.matches.map(matchCard).join("") || '<div class="empty-state">Zatím žádný zápas v této kategorii.</div>'}
          </div>
        </section>
        ${form}
      </div>
    `;
  }

  function matchCard(match) {
    const canEdit = canCategory(state.category, "can_write_results");
    return `
      <article class="record">
        <div class="record-main">
          <div class="record-title">
            <span class="pill ${statusClass(match.status)}">${esc(statusText(match.status))}</span>
            <strong>${match.home_away === "home" ? "Baník Libušín" : esc(match.opponent)} ${esc(match.goals_for)}:${esc(match.goals_against)} ${match.home_away === "home" ? esc(match.opponent) : "Baník Libušín"}</strong>
          </div>
          <div class="record-meta">${formatDate(match.played_on)} · ${match.home_away === "home" ? "Doma" : "Venku"}${match.note ? ` · ${esc(match.note)}` : ""}</div>
        </div>
        ${canEdit ? `
          <div class="record-actions">
            <button type="button" class="mini-btn" data-edit-match="${match.id}">Upravit</button>
            <button type="button" class="danger-btn" data-delete-match="${match.id}">Smazat</button>
          </div>
        ` : ""}
      </article>
    `;
  }

  function articleTypeText(type) {
    return {
      match_report: "Zápas",
      news: "Aktualita",
      invitation: "Pozvánka",
      club: "Klub",
    }[type] || "Článek";
  }

  function articleStatusText(status) {
    return status === "published" ? "Zveřejněno" : "Rozepsáno";
  }

  function articleMatchTitle(match) {
    if (!match) return "";
    const home = match.home_away === "home" ? "SK Baník Libušín" : match.opponent;
    const away = match.home_away === "home" ? match.opponent : "SK Baník Libušín";
    const score = match.status === "played" ? `${match.goals_for}:${match.goals_against}` : statusText(match.status);
    return `${home} – ${away} ${score}`;
  }

  function renderArticles() {
    const canEdit = state.category && canCategory(state.category, "can_write_results");
    const matchOptions = state.matches.map((match) => `
      <option value="${match.id}">${esc(formatDate(match.played_on))} · ${esc(articleMatchTitle(match))}</option>
    `).join("");
    const form = canEdit ? `
      <section class="panel article-editor-panel">
        <div class="panel-head">
          <div>
            <h2 class="panel-title" id="articleFormTitle">Napsat článek</h2>
            <p class="panel-copy">Článek se uloží do SQLite. Zveřejněné články se ukážou na webu, rozepsané zůstanou jen tady.</p>
          </div>
        </div>
        <form class="form-grid article-form" id="articleForm">
          <label>
            <span>Typ článku</span>
            <select name="article_type">
              <option value="match_report">Zápas / reportáž</option>
              <option value="news">Aktualita</option>
              <option value="invitation">Pozvánka</option>
              <option value="club">Klubová zpráva</option>
            </select>
          </label>
          <label>
            <span>Zápas</span>
            <select name="match_id" id="articleMatchSelect">
              <option value="">Bez vybraného zápasu</option>
              ${matchOptions}
            </select>
          </label>
          <label class="wide">
            <span>Nadpis</span>
            <input name="title" id="articleTitleInput" placeholder="SK Baník Libušín – Soupeř 2:1 (1:0)" required>
          </label>
          <label class="wide">
            <span>Komentář pod nadpis</span>
            <textarea name="lead" class="short-textarea" placeholder="Krátké shrnutí, které se zobrazí v přehledu článků."></textarea>
          </label>
          <label>
            <span>Střelci / branky</span>
            <input name="goals" placeholder="28. Hlavsa, 90. Jechumtál">
          </label>
          <label>
            <span>Fotka článku</span>
            <input name="image_url" placeholder="assets/articles/fotka.jpg">
          </label>
          <label class="wide">
            <span>Sestava</span>
            <textarea name="lineup" placeholder="Holas – Pucholt, Chlumský..."></textarea>
          </label>
          <label class="wide">
            <span>Text článku</span>
            <textarea name="content" class="article-body-input" placeholder="Sem napište celý článek..." required></textarea>
          </label>
          <label>
            <span>Stav</span>
            <select name="status">
              <option value="draft">Rozepsáno</option>
              <option value="published">Zveřejnit na webu</option>
            </select>
          </label>
          <div class="form-actions">
            <button type="submit" class="primary-btn">Uložit článek</button>
            <button type="button" class="ghost-btn" data-cancel-article>Vyčistit</button>
          </div>
        </form>
      </section>
    ` : `
      <section class="panel">
        <div class="empty-state">Články této kategorie můžete jen zobrazit. Psaní musí povolit administrátor přes právo Výsledky.</div>
      </section>
    `;

    els.content.innerHTML = `
      ${categoryToolbar("Vyber tým, ke kterému článek patří. Zápasové články můžeš navázat přímo na uložený výsledek.")}
      <div class="grid cols-2 article-layout">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">${esc(categoryName(state.category))}</h2>
              <p class="panel-copy">${state.articles.length} článků v SQLite pro tuto kategorii.</p>
            </div>
            <span class="pill ${canEdit ? "green" : "amber"}">${canEdit ? "Lze psát" : "Jen čtení"}</span>
          </div>
          <div class="records">
            ${state.articles.map(articleCard).join("") || '<div class="empty-state">Zatím žádný článek v této kategorii.</div>'}
          </div>
        </section>
        ${form}
      </div>
    `;
  }

  function articleCard(article) {
    const canEdit = canCategory(article.category_key || state.category, "can_write_results");
    return `
      <article class="record article-record">
        <div class="record-main">
          <div class="record-title">
            <span class="pill ${article.status === "published" ? "green" : "amber"}">${esc(articleStatusText(article.status))}</span>
            <span class="pill blue">${esc(articleTypeText(article.article_type))}</span>
            <strong>${esc(article.title)}</strong>
          </div>
          <div class="record-meta">
            ${esc(article.category_name || categoryName(state.category))} · ${esc(String(article.updated_at || article.created_at || "").replace("T", " ").slice(0, 16))}
            ${article.match_label ? ` · ${esc(article.match_label)}` : ""}
            ${article.lead ? ` · ${esc(article.lead)}` : ""}
          </div>
        </div>
        ${canEdit ? `
          <div class="record-actions">
            <button type="button" class="mini-btn" data-edit-article="${article.id}">Upravit</button>
            ${article.status === "published" ? `<a class="mini-btn" href="clanek.html?id=db-${article.id}" target="_blank" rel="noopener">Otevřít</a>` : ""}
            <button type="button" class="danger-btn" data-delete-article="${article.id}">Smazat</button>
          </div>
        ` : ""}
      </article>
    `;
  }

  function renderReservations() {
    els.content.innerHTML = `
      <div class="grid cols-2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">Rezervace</h2>
              <p class="panel-copy">${state.canManageReservations ? "Vidíte všechny žádosti a můžete je schvalovat." : "Vidíte svoje žádosti. Správce dostane oznámení."}</p>
            </div>
            <span class="pill ${state.canManageReservations ? "green" : "blue"}">${state.canManageReservations ? "Správce" : "Žadatel"}</span>
          </div>
          <div class="records">
            ${state.reservations.map(reservationCard).join("") || '<div class="empty-state">Zatím tu nejsou žádné rezervace.</div>'}
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">Nová žádost</h2>
              <p class="panel-copy">Po odeslání dostane správce hřiště a admin oznámení.</p>
            </div>
          </div>
          <form class="form-grid" id="reservationForm">
            <label>
              <span>Jméno</span>
              <input name="requester_name" value="${esc(state.user.display_name)}" required>
            </label>
            <label>
              <span>Kontakt</span>
              <input name="requester_contact" value="${esc(state.user.email || "")}">
            </label>
            <label>
              <span>Prostor</span>
              <select name="facility">
                <option value="field">Hřiště</option>
                <option value="clubhouse">Klubovna</option>
              </select>
            </label>
            <label>
              <span>Část</span>
              <select name="lane">
                <option value="full">Celé hřiště</option>
                <option value="half_a">Polovina A</option>
                <option value="half_b">Polovina B</option>
                <option value="clubhouse">Klubovna</option>
              </select>
            </label>
            <label>
              <span>Datum</span>
              <input name="date" type="date" value="${todayISO()}" required>
            </label>
            <label>
              <span>Začátek</span>
              <input name="start_time" type="time" value="18:00" required>
            </label>
            <label>
              <span>Konec</span>
              <input name="end_time" type="time" value="19:30" required>
            </label>
            <label class="wide">
              <span>Účel</span>
              <textarea name="purpose" placeholder="Trénink, zápas, akce..."></textarea>
            </label>
            <div class="form-actions">
              <button type="submit" class="primary-btn">Odeslat žádost</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function reservationCard(reservation) {
    const status = reservation.status || "pending";
    const actions = state.canManageReservations ? `
      <div class="record-actions">
        ${status !== "approved" ? `<button type="button" class="success-btn" data-reservation-status="approved" data-reservation-id="${reservation.id}">Schválit</button>` : ""}
        ${status !== "pending" ? `<button type="button" class="warning-btn" data-reservation-status="pending" data-reservation-id="${reservation.id}">Čeká</button>` : ""}
        ${status !== "rejected" ? `<button type="button" class="danger-btn" data-reservation-status="rejected" data-reservation-id="${reservation.id}">Zamítnout</button>` : ""}
      </div>
    ` : "";
    return `
      <article class="record">
        <div class="record-main">
          <div class="record-title">
            <span class="pill ${statusClass(status)}">${esc(statusText(status))}</span>
            <strong>${esc(facilityText(reservation.facility))} · ${esc(laneText(reservation.lane))}</strong>
          </div>
          <div class="record-meta">
            ${formatDate(reservation.date)} · ${esc(reservation.start_time)}-${esc(reservation.end_time)} · ${esc(reservation.requester_name)}
            ${reservation.purpose ? ` · ${esc(reservation.purpose)}` : ""}
            ${reservation.note ? ` · Pozn.: ${esc(reservation.note)}` : ""}
          </div>
        </div>
        ${actions}
      </article>
    `;
  }

  function renderRoles() {
    const options = state.users.map((user) => `<option value="${user.id}">${esc(user.display_name)} (${esc(user.username)})</option>`).join("");
    els.content.innerHTML = `
      <div class="grid cols-2">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">Uživatelé</h2>
              <p class="panel-copy">Admin může přidat účet, změnit práva kategorií a nastavit správce rezervací.</p>
            </div>
          </div>
          <div class="toolbar">
            <label>
              <span>Vybrat uživatele</span>
              <select id="userSelect">
                <option value="">Nový uživatel</option>
                ${options}
              </select>
            </label>
            <button type="button" class="ghost-btn" data-new-user>Nový</button>
          </div>
          <div class="records">
            ${state.users.map(userCard).join("") || '<div class="empty-state">Zatím žádní uživatelé.</div>'}
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title" id="userFormTitle">Nový uživatel</h2>
              <p class="panel-copy">Heslo je povinné jen při vytvoření nového účtu nebo při změně hesla.</p>
            </div>
          </div>
          <form class="form-grid" id="userForm">
            <label>
              <span>Uživatelské jméno</span>
              <input name="username" id="userUsername" autocomplete="username" required>
            </label>
            <label>
              <span>Heslo</span>
              <input name="password" id="userPassword" type="password" autocomplete="new-password">
            </label>
            <label>
              <span>Zobrazované jméno</span>
              <input name="display_name" id="userDisplayName" autocomplete="name" required>
            </label>
            <label>
              <span>E-mail</span>
              <input name="email" id="userEmail" type="email" autocomplete="email">
            </label>
            <label class="check-line">
              <input name="is_admin" id="userIsAdmin" type="checkbox">
              Administrátor
            </label>
            <label class="check-line">
              <input name="active" id="userActive" type="checkbox" checked>
              Aktivní účet
            </label>
            <label class="check-line">
              <input name="can_manage_reservations" id="userCanReservations" type="checkbox">
              Spravuje rezervace
            </label>
            <label class="check-line">
              <input name="receive_reservation_notifications" id="userReservationNotifications" type="checkbox">
              Dostává oznámení
            </label>
            <div class="wide permission-grid">
              ${state.categories.map((category) => `
                <div class="permission-row">
                  <strong>${esc(category.name)}</strong>
                  <label class="check-line">
                    <input type="checkbox" data-perm-key="${esc(category.key)}" data-perm-type="can_manage_roster">
                    Soupiska
                  </label>
                  <label class="check-line">
                    <input type="checkbox" data-perm-key="${esc(category.key)}" data-perm-type="can_write_results">
                    Výsledky
                  </label>
                </div>
              `).join("")}
            </div>
            <div class="form-actions">
              <button type="submit" class="primary-btn">Uložit práva</button>
              <button type="button" class="ghost-btn" data-new-user>Vyčistit</button>
            </div>
          </form>
        </section>
      </div>
    `;
    resetUserForm();
  }

  function userCard(user) {
    const permissionSummary = user.is_admin
      ? "Všechny kategorie"
      : state.categories.map((category) => {
        const permissions = user.permissions?.[category.key] || {};
        const labels = [];
        if (permissions.can_manage_roster) labels.push("soupiska");
        if (permissions.can_write_results) labels.push("výsledky");
        return labels.length ? `${category.name}: ${labels.join(", ")}` : "";
      }).filter(Boolean).join(" · ") || "Bez kategorií";

    return `
      <article class="record">
        <div class="record-main">
          <div class="record-title">
            <strong>${esc(user.display_name)}</strong>
            <span class="pill ${user.active ? "green" : "red"}">${user.active ? "Aktivní" : "Vypnuto"}</span>
            ${user.is_admin ? '<span class="pill red">Admin</span>' : ""}
            ${user.can_manage_reservations ? '<span class="pill amber">Rezervace</span>' : ""}
          </div>
          <div class="record-meta">${esc(user.username)} · ${esc(user.email || "bez e-mailu")} · ${esc(permissionSummary)}</div>
        </div>
        <div class="record-actions">
          <button type="button" class="mini-btn" data-edit-user="${user.id}">Upravit</button>
        </div>
      </article>
    `;
  }

  function notificationList() {
    if (!state.notifications.length) {
      return '<div class="empty-state">Žádná oznámení.</div>';
    }
    return `
      <div class="notification-list">
        ${state.notifications.slice(0, 8).map((item) => `
          <article class="record notification ${item.seen ? "" : "unseen"}">
            <div class="record-main">
              <div class="record-title">
                <strong>${esc(item.title)}</strong>
                ${item.seen ? "" : '<span class="pill red">Nové</span>'}
              </div>
              <div class="record-meta">${esc(item.message)} · ${esc(String(item.created_at || "").replace("T", " ").slice(0, 16))}</div>
            </div>
          </article>
        `).join("")}
      </div>
    `;
  }

  function resetPlayerForm() {
    const form = qs("#playerForm", els.content);
    if (!form) return;
    form.reset();
    form.dataset.editId = "";
    qs("#playerFormTitle", els.content).textContent = "Přidat hráče";
    form.elements.active.checked = true;
  }

  function fillPlayerForm(id) {
    const player = state.players.find((item) => Number(item.id) === Number(id));
    const form = qs("#playerForm", els.content);
    if (!player || !form) return;
    form.dataset.editId = player.id;
    qs("#playerFormTitle", els.content).textContent = "Upravit hráče";
    form.elements.first_name.value = player.first_name || "";
    form.elements.last_name.value = player.last_name || "";
    form.elements.number.value = player.number || "";
    form.elements.position.value = player.position || "";
    form.elements.active.checked = Boolean(player.active);
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetMatchForm() {
    const form = qs("#matchForm", els.content);
    if (!form) return;
    form.reset();
    form.dataset.editId = "";
    qs("#matchFormTitle", els.content).textContent = "Zapsat výsledek";
    form.elements.played_on.value = todayISO();
    form.elements.goals_for.value = 0;
    form.elements.goals_against.value = 0;
  }

  function fillMatchForm(id) {
    const match = state.matches.find((item) => Number(item.id) === Number(id));
    const form = qs("#matchForm", els.content);
    if (!match || !form) return;
    form.dataset.editId = match.id;
    qs("#matchFormTitle", els.content).textContent = "Upravit výsledek";
    form.elements.played_on.value = match.played_on || todayISO();
    form.elements.opponent.value = match.opponent || "";
    form.elements.home_away.value = match.home_away || "home";
    form.elements.status.value = match.status || "played";
    form.elements.goals_for.value = match.goals_for ?? 0;
    form.elements.goals_against.value = match.goals_against ?? 0;
    form.elements.note.value = match.note || "";
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetArticleForm() {
    const form = qs("#articleForm", els.content);
    if (!form) return;
    form.reset();
    form.dataset.editId = "";
    qs("#articleFormTitle", els.content).textContent = "Napsat článek";
  }

  function fillArticleForm(id) {
    const article = state.articles.find((item) => Number(item.id) === Number(id));
    const form = qs("#articleForm", els.content);
    if (!article || !form) return;
    form.dataset.editId = article.id;
    qs("#articleFormTitle", els.content).textContent = "Upravit článek";
    form.elements.article_type.value = article.article_type || "match_report";
    form.elements.match_id.value = article.match_id || "";
    form.elements.title.value = article.title || "";
    form.elements.lead.value = article.lead || "";
    form.elements.goals.value = article.goals || "";
    form.elements.image_url.value = article.image_url || "";
    form.elements.lineup.value = article.lineup || "";
    form.elements.content.value = article.content || "";
    form.elements.status.value = article.status || "draft";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyArticleMatchPreset(matchId) {
    const form = qs("#articleForm", els.content);
    if (!form || !matchId) return;
    const match = state.matches.find((item) => Number(item.id) === Number(matchId));
    if (!match) return;
    if (!form.elements.title.value.trim()) {
      form.elements.title.value = articleMatchTitle(match);
    }
    if (!form.elements.lead.value.trim()) {
      form.elements.lead.value = `${formatDate(match.played_on)} · ${match.home_away === "home" ? "Domácí zápas" : "Venkovní zápas"}`;
    }
  }

  function resetUserForm() {
    const form = qs("#userForm", els.content);
    if (!form) return;
    form.reset();
    form.dataset.userId = "";
    qs("#userFormTitle", els.content).textContent = "Nový uživatel";
    qs("#userUsername", els.content).readOnly = false;
    qs("#userPassword", els.content).required = true;
    qs("#userActive", els.content).checked = true;
    qsa("[data-perm-key]", form).forEach((input) => {
      input.checked = false;
    });
    const select = qs("#userSelect", els.content);
    if (select) select.value = "";
  }

  function fillUserForm(id) {
    const user = state.users.find((item) => Number(item.id) === Number(id));
    const form = qs("#userForm", els.content);
    if (!user || !form) return;
    form.dataset.userId = user.id;
    qs("#userFormTitle", els.content).textContent = `Upravit: ${user.display_name}`;
    qs("#userUsername", els.content).readOnly = true;
    qs("#userPassword", els.content).required = false;
    form.elements.username.value = user.username || "";
    form.elements.password.value = "";
    form.elements.display_name.value = user.display_name || "";
    form.elements.email.value = user.email || "";
    form.elements.is_admin.checked = Boolean(user.is_admin);
    form.elements.active.checked = Boolean(user.active);
    form.elements.can_manage_reservations.checked = Boolean(user.can_manage_reservations);
    form.elements.receive_reservation_notifications.checked = Boolean(user.receive_reservation_notifications);
    qsa("[data-perm-key]", form).forEach((input) => {
      const category = input.dataset.permKey;
      const type = input.dataset.permType;
      input.checked = Boolean(user.permissions?.[category]?.[type]);
    });
    const select = qs("#userSelect", els.content);
    if (select) select.value = String(user.id);
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submitPlayer(form) {
    const payload = {
      category: state.category,
      first_name: form.elements.first_name.value.trim(),
      last_name: form.elements.last_name.value.trim(),
      number: form.elements.number.value ? Number(form.elements.number.value) : null,
      position: form.elements.position.value.trim(),
      active: form.elements.active.checked,
    };
    const id = form.dataset.editId;
    if (id) {
      await api(`/api/players/${id}`, { method: "PUT", body: payload });
      setToast("Hráč je upravený.");
    } else {
      await api("/api/players", { method: "POST", body: payload });
      setToast("Hráč je přidaný.");
    }
    await loadPlayers();
    renderPlayers();
  }

  async function submitMatch(form) {
    const payload = {
      category: state.category,
      played_on: form.elements.played_on.value,
      opponent: form.elements.opponent.value.trim(),
      home_away: form.elements.home_away.value,
      goals_for: Number(form.elements.goals_for.value || 0),
      goals_against: Number(form.elements.goals_against.value || 0),
      status: form.elements.status.value,
      note: form.elements.note.value.trim(),
    };
    const id = form.dataset.editId;
    if (id) {
      await api(`/api/matches/${id}`, { method: "PUT", body: payload });
      setToast("Výsledek je upravený.");
    } else {
      await api("/api/matches", { method: "POST", body: payload });
      setToast("Výsledek je uložený.");
    }
    await loadMatches();
    renderMatches();
  }

  async function submitArticle(form) {
    const payload = {
      category: state.category,
      article_type: form.elements.article_type.value,
      match_id: form.elements.match_id.value || null,
      title: form.elements.title.value.trim(),
      lead: form.elements.lead.value.trim(),
      goals: form.elements.goals.value.trim(),
      lineup: form.elements.lineup.value.trim(),
      content: form.elements.content.value.trim(),
      image_url: form.elements.image_url.value.trim(),
      status: form.elements.status.value,
    };
    const id = form.dataset.editId;
    if (id) {
      await api(`/api/articles/${id}`, { method: "PUT", body: payload });
      setToast("Článek je upravený.");
    } else {
      await api("/api/articles", { method: "POST", body: payload });
      setToast(payload.status === "published" ? "Článek je zveřejněný." : "Článek je uložený jako rozepsaný.");
    }
    await loadArticles();
    renderArticles();
  }

  async function submitReservation(form) {
    const payload = {
      requester_name: form.elements.requester_name.value.trim(),
      requester_contact: form.elements.requester_contact.value.trim(),
      facility: form.elements.facility.value,
      lane: form.elements.lane.value,
      date: form.elements.date.value,
      start_time: form.elements.start_time.value,
      end_time: form.elements.end_time.value,
      purpose: form.elements.purpose.value.trim(),
    };
    await api("/api/reservations", { method: "POST", body: payload });
    setToast("Žádost o rezervaci je odeslaná.");
    await loadReservations();
    await loadNotifications();
    renderShell();
    renderReservations();
  }

  function collectPermissions(form) {
    const permissions = {};
    state.categories.forEach((category) => {
      permissions[category.key] = {
        can_manage_roster: false,
        can_write_results: false,
      };
    });
    qsa("[data-perm-key]", form).forEach((input) => {
      permissions[input.dataset.permKey][input.dataset.permType] = input.checked;
    });
    return permissions;
  }

  async function submitUser(form) {
    const id = form.dataset.userId;
    const payload = {
      username: form.elements.username.value.trim(),
      password: form.elements.password.value,
      display_name: form.elements.display_name.value.trim(),
      email: form.elements.email.value.trim(),
      is_admin: form.elements.is_admin.checked,
      active: form.elements.active.checked,
      can_manage_reservations: form.elements.can_manage_reservations.checked,
      receive_reservation_notifications: form.elements.receive_reservation_notifications.checked,
      permissions: collectPermissions(form),
    };
    if (id) {
      await api(`/api/admin/users/${id}`, { method: "PUT", body: payload });
      setToast("Práva jsou uložená.");
    } else {
      if (!payload.password.trim()) {
        throw new Error("U nového účtu vyplňte heslo.");
      }
      await api("/api/admin/users", { method: "POST", body: payload });
      setToast("Uživatel je vytvořený.");
    }
    await loadUsers();
    await loadMe();
    renderShell();
    renderRoles();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    try {
      if (form.id === "playerForm") await submitPlayer(form);
      if (form.id === "matchForm") await submitMatch(form);
      if (form.id === "articleForm") await submitArticle(form);
      if (form.id === "reservationForm") await submitReservation(form);
      if (form.id === "userForm") await submitUser(form);
    } catch (error) {
      setToast(error.message, "error");
    }
  }

  async function handleContentClick(event) {
    const button = event.target.closest("button");
    if (!button) return;

    try {
      if (button.dataset.go) {
        await switchView(button.dataset.go);
      }
      if (button.dataset.markRead !== undefined) {
        await api("/api/notifications/read-all", { method: "POST" });
        await loadNotifications();
        renderShell();
        renderView();
        setToast("Oznámení jsou označená jako přečtená.");
      }
      if (button.dataset.cancelPlayer !== undefined) resetPlayerForm();
      if (button.dataset.cancelMatch !== undefined) resetMatchForm();
      if (button.dataset.cancelArticle !== undefined) resetArticleForm();
      if (button.dataset.editPlayer) fillPlayerForm(button.dataset.editPlayer);
      if (button.dataset.editMatch) fillMatchForm(button.dataset.editMatch);
      if (button.dataset.editArticle) fillArticleForm(button.dataset.editArticle);
      if (button.dataset.editUser) fillUserForm(button.dataset.editUser);
      if (button.dataset.newUser !== undefined) resetUserForm();
      if (button.dataset.deletePlayer) {
        if (!window.confirm("Opravdu smazat hráče?")) return;
        await api(`/api/players/${button.dataset.deletePlayer}`, { method: "DELETE" });
        await loadPlayers();
        renderPlayers();
        setToast("Hráč je smazaný.");
      }
      if (button.dataset.deleteMatch) {
        if (!window.confirm("Opravdu smazat zápas?")) return;
        await api(`/api/matches/${button.dataset.deleteMatch}`, { method: "DELETE" });
        await loadMatches();
        renderMatches();
        setToast("Zápas je smazaný.");
      }
      if (button.dataset.deleteArticle) {
        if (!window.confirm("Opravdu smazat článek?")) return;
        await api(`/api/articles/${button.dataset.deleteArticle}`, { method: "DELETE" });
        await loadArticles();
        renderArticles();
        setToast("Článek je smazaný.");
      }
      if (button.dataset.reservationStatus) {
        const note = window.prompt("Poznámka ke změně stavu:", "") || "";
        await api(`/api/reservations/${button.dataset.reservationId}`, {
          method: "PUT",
          body: { status: button.dataset.reservationStatus, note },
        });
        await loadReservations();
        await loadNotifications();
        renderShell();
        renderReservations();
        setToast("Stav rezervace je uložený.");
      }
    } catch (error) {
      setToast(error.message, "error");
    }
  }

  async function handleContentChange(event) {
    try {
      if (event.target.id === "categorySelect") {
        state.category = event.target.value;
        localStorage.setItem(categoryKey, state.category);
        if (state.view === "players") {
          await loadPlayers();
          renderPlayers();
        }
        if (state.view === "matches") {
          await loadMatches();
          renderMatches();
        }
        if (state.view === "articles") {
          await loadArticles();
          renderArticles();
        }
      }
      if (event.target.id === "articleMatchSelect") {
        applyArticleMatchPreset(event.target.value);
      }
      if (event.target.id === "userSelect") {
        if (event.target.value) {
          fillUserForm(event.target.value);
        } else {
          resetUserForm();
        }
      }
    } catch (error) {
      setToast(error.message, "error");
    }
  }

  async function login(event) {
    event.preventDefault();
    setToast("");
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: {
          username: els.loginUsername.value.trim(),
          password: els.loginPassword.value,
        },
      });
      state.token = data.token;
      localStorage.setItem(storageKey, state.token);
      await loadMe();
      await loadNotifications();
      showApp();
      renderShell();
      await switchView("dashboard");
    } catch (error) {
      setToast(error.message, "error");
    }
  }

  async function logout() {
    try {
      await api("/api/logout", { method: "POST" });
    } catch {
      // Odhlášení má proběhnout i při lokálním výpadku API.
    }
    clearSession();
    showLogin();
  }

  async function boot() {
    els.loginForm.addEventListener("submit", login);
    els.logoutButton.addEventListener("click", logout);
    els.notificationButton.addEventListener("click", () => switchView("dashboard"));
    els.content.addEventListener("click", handleContentClick);
    els.content.addEventListener("change", handleContentChange);
    els.content.addEventListener("submit", handleSubmit);
    qsa("[data-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });
    qsa("[data-demo-user]").forEach((button) => {
      button.addEventListener("click", () => {
        els.loginUsername.value = button.dataset.demoUser;
        els.loginPassword.value = button.dataset.demoPass;
      });
    });

    if (!state.token) {
      showLogin();
      return;
    }

    try {
      await loadMe();
      await loadNotifications();
      showApp();
      renderShell();
      await switchView("dashboard");
    } catch {
      clearSession();
      showLogin();
    }
  }

  boot();
})();
