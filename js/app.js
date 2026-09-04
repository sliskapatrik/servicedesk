const API_URL =
    window.location.protocol === "file:" ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
        ? "http://localhost:3000/api"
        : "/api";

let authToken = localStorage.getItem("servicedeskToken");
let loggedUser = null;
let tickets = [];
let customers = [];
let technicians = [];
let currentTicketDetail = null;
let users = [];
let customerUsers = [];
let notifications = [];
let analyticsData = null;
let categories = [];
let tags = [];
let knowledgeArticles = [];
let savedFilters = [];
let cannedReplies = [];
let ticketTemplates = [];
let appConfig = { appName: "ServiceDesk", supportEmail: "", defaultPriority: "Medium", allowCustomerTicketCreation: true, sessionHours: 8, minimumPasswordLength: 8, slaRules: { Low: 72, Medium: 24, High: 8, Critical: 2 } };
let adminSettingsData = null;
let settingsAudit = [];
let activeQueue = "all";
const selectedTicketIds = new Set();

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    })[character]);
}

async function authFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 401 && authToken) {
            localStorage.removeItem("servicedeskToken");
            authToken = null;
            loggedUser = null;
            showLogin();
        }

        return response;
    } catch (error) {
        throw new Error("Could not reach the ServiceDesk server. Check that the backend is running.");
    }
}

async function readJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const requestId = response.headers.get("X-Request-Id");
        const suffix = requestId ? ` (Request ${requestId.slice(0, 8)})` : "";
        throw new Error((data.error || "Request failed") + suffix);
    }
    return data;
}

function isStaff() {
    return loggedUser && ["admin", "technician"].includes(loggedUser.role);
}

function isAdmin() {
    return loggedUser && loggedUser.role === "admin";
}

function showToast(message) {
    window.alert(message);
}

async function login(email, password) {
    const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await readJson(response);
    authToken = data.token;
    loggedUser = data.user;
    localStorage.setItem("servicedeskToken", authToken);
    await showApplication();
}

async function loadCurrentUser() {
    if (!authToken) return false;
    try {
        const response = await authFetch(`${API_URL}/auth/me`);
        loggedUser = await readJson(response);
        return true;
    } catch (error) {
        localStorage.removeItem("servicedeskToken");
        authToken = null;
        loggedUser = null;
        return false;
    }
}

$("loginForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    $("loginError").textContent = "";
    try {
        await login($("loginEmail").value.trim(), $("loginPassword").value);
        $("loginForm").reset();
    } catch (error) {
        $("loginError").textContent = error.message;
    }
});

$("logoutButton").addEventListener("click", function () {
    localStorage.removeItem("servicedeskToken");
    authToken = null;
    loggedUser = null;
    showLogin();
});

function showLogin() {
    $("loginScreen").classList.remove("hidden");
    $("app").style.display = "none";
}

async function showApplication() {
    $("loginScreen").classList.add("hidden");
    $("app").style.display = "flex";
    $("currentUserName").textContent = loggedUser.name;
    $("currentUserRole").textContent = loggedUser.role;

    applyRolePermissions();
    await Promise.all([
        loadCustomers(),
        loadTechnicians(),
        loadTickets(),
        loadCustomerUsers(),
        loadUsers(),
        loadNotifications(),
        loadCategories(),
        loadTags(),
        loadKnowledge(),
        loadSavedFilters(),
        loadCannedReplies(),
        loadTicketTemplates(),
        loadAppConfig()
    ]);
    renderDashboard();
    renderTickets();
    renderCustomers();
    renderUsers();
    populateBulkTechnicians();
    populateTicketTemplateSelect();
    populateCannedReplySelect();
    applyAppBranding();
}

function applyRolePermissions() {
    document.querySelectorAll(".admin-only").forEach((element) => {
        element.style.display = isAdmin() ? "" : "none";
    });

    document.querySelectorAll(".staff-only").forEach((element) => {
        element.style.display = isStaff() ? "" : "none";
    });

    const customerSelect = $("ticketCustomer");
    const customerLabel = $("ticketCustomerLabel");
    const customerRole = loggedUser.role === "customer";

    customerSelect.style.display = customerRole ? "none" : "";
    customerLabel.style.display = customerRole ? "none" : "";
    customerRole
        ? customerSelect.removeAttribute("required")
        : customerSelect.setAttribute("required", "required");
}

const views = {
    dashboard: $("dashboardView"),
    tickets: $("ticketsView"),
    customers: $("customersView"),
    users: $("usersView"),
    reports: $("reportsView"),
    knowledge: $("knowledgeView"),
    tools: $("toolsView"),
    settings: $("settingsView")
};

const titles = {
    dashboard: ["Dashboard", "ServiceDesk overview"],
    tickets: ["Tickets", "Support requests and incidents"],
    customers: ["Customers", "Customer directory"],
    users: ["Users", "ServiceDesk accounts"],
    reports: ["Reports", "Analytics, SLA performance and workload"],
    knowledge: ["Knowledge Base", "Solutions, FAQ and troubleshooting articles"],
    tools: ["Productivity", "Templates, canned replies and support workflow tools"],
    settings: ["Settings", "Application, SLA and security configuration"]
};

document.querySelectorAll(".menu-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
});

function showView(name) {
    Object.values(views).forEach((view) => view.classList.remove("active-view"));
    views[name].classList.add("active-view");
    document.querySelectorAll(".menu-item").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === name);
    });
    $("pageTitle").textContent = titles[name][0];
    $("pageSubtitle").textContent = titles[name][1];
    if (name === "tickets") renderTickets();
    if (name === "customers") renderCustomers();
    if (name === "users") renderUsers();
    if (name === "reports" && isAdmin()) loadAnalytics();
    if (name === "knowledge") renderKnowledge();
    if (name === "tools") renderProductivityTools();
    if (name === "settings" && isAdmin()) loadAdminSettings();
}

async function loadAppConfig() {
    try {
        appConfig = await readJson(await authFetch(`${API_URL}/config`));
        SLA_RULE_HOURS = { ...SLA_RULE_HOURS, ...(appConfig.slaRules || {}) };
    } catch (error) {
        console.error("Config API error:", error);
    }
}

function applyAppBranding() {
    const name = appConfig.appName || "ServiceDesk";
    document.title = name;
    document.querySelectorAll(".logo, .login-logo").forEach((element) => { element.textContent = name; });
    if ($("ticketPriority") && appConfig.defaultPriority) $("ticketPriority").value = appConfig.defaultPriority;
    if (loggedUser?.role === "customer") {
        const disabled = appConfig.allowCustomerTicketCreation === false;
        if ($("addTicketButton")) $("addTicketButton").style.display = disabled ? "none" : "";
        if ($("dashboardAddTicketButton")) $("dashboardAddTicketButton").style.display = disabled ? "none" : "";
    }
}

async function loadAdminSettings() {
    if (!isAdmin()) return;
    try {
        const [settings, audit] = await Promise.all([
            readJson(await authFetch(`${API_URL}/settings`)),
            readJson(await authFetch(`${API_URL}/settings/audit`))
        ]);
        adminSettingsData = settings;
        settingsAudit = audit;
        renderAdminSettings();
    } catch (error) {
        showToast(`Could not load settings: ${error.message}`);
    }
}

function renderAdminSettings() {
    if (!adminSettingsData) return;
    const values = adminSettingsData.settings || {};
    const rules = Object.fromEntries((adminSettingsData.slaRules || []).map((row) => [row.priority, Number(row.hours)]));
    $("settingAppName").value = values.app_name || "ServiceDesk";
    $("settingSupportEmail").value = values.support_email || "";
    $("settingDefaultPriority").value = values.default_priority || "Medium";
    $("settingCustomerCreation").checked = String(values.allow_customer_ticket_creation) === "1";
    $("settingSessionHours").value = values.session_hours || 8;
    $("settingMinPassword").value = values.minimum_password_length || 8;
    $("slaCritical").value = rules.Critical || 2;
    $("slaHigh").value = rules.High || 8;
    $("slaMedium").value = rules.Medium || 24;
    $("slaLow").value = rules.Low || 72;

    const summary = adminSettingsData.summary || {};
    $("settingsSystemSummary").innerHTML = `
        <div class="summary-box"><strong>${Number(summary.usersCount || 0)}</strong><span>Total users</span></div>
        <div class="summary-box"><strong>${Number(summary.activeUsersCount || 0)}</strong><span>Active users</span></div>
        <div class="summary-box"><strong>${Number(summary.activeTicketsCount || 0)}</strong><span>Active tickets</span></div>
        <div class="summary-box"><strong>${Number(summary.overdueTicketsCount || 0)}</strong><span>SLA overdue</span></div>
        <div class="summary-box settings-wide"><strong style="font-size:15px">${escapeHtml(summary.databaseTime || "—")}</strong><span>Database time</span></div>`;

    $("settingsAuditList").innerHTML = settingsAudit.length ? settingsAudit.map((entry) => `
        <div class="audit-entry">
            <strong>${escapeHtml(entry.settingKey)}</strong>
            <div>${escapeHtml(entry.oldValue ?? "—")} → ${escapeHtml(entry.newValue ?? "—")}</div>
            <small>${escapeHtml(entry.userName || "System")} · ${escapeHtml(entry.createdAt || "")}</small>
        </div>`).join("") : `<div class="empty-state compact-empty">No configuration changes recorded yet.</div>`;
}

async function saveAdminSettings() {
    if (!isAdmin()) return;
    const payload = {
        settings: {
            app_name: $("settingAppName").value.trim(),
            support_email: $("settingSupportEmail").value.trim(),
            default_priority: $("settingDefaultPriority").value,
            allow_customer_ticket_creation: $("settingCustomerCreation").checked,
            session_hours: Number($("settingSessionHours").value),
            minimum_password_length: Number($("settingMinPassword").value)
        },
        slaRules: {
            Critical: Number($("slaCritical").value),
            High: Number($("slaHigh").value),
            Medium: Number($("slaMedium").value),
            Low: Number($("slaLow").value)
        }
    };
    try {
        await readJson(await authFetch(`${API_URL}/settings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }));
        await loadAppConfig();
        applyAppBranding();
        await loadAdminSettings();
        showToast("Settings saved.");
    } catch (error) {
        showToast(`Could not save settings: ${error.message}`);
    }
}

async function loadAnalytics() {
    if (!isAdmin()) return;

    try {
        analyticsData = await readJson(await authFetch(`${API_URL}/analytics/overview`));
        renderAnalytics();
    } catch (error) {
        console.error("Analytics API error:", error);
        showToast(`Could not load reports: ${error.message}`);
    }
}

function renderBarChart(containerId, items) {
    const container = $(containerId);
    if (!container) return;

    if (!items || !items.length) {
        container.innerHTML = `<div class="empty-state compact-empty">No data yet.</div>`;
        return;
    }

    const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
    container.innerHTML = items.map((item) => {
        const value = Number(item.value || 0);
        const width = Math.max(4, Math.round((value / max) * 100));
        return `
            <div class="bar-row">
                <div class="bar-label"><span>${escapeHtml(item.label)}</span><strong>${value}</strong></div>
                <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
            </div>
        `;
    }).join("");
}

function buildLast14Days() {
    const result = [];
    const now = new Date();
    for (let offset = 13; offset >= 0; offset -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
        const key = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
        result.push({ key, label: `${date.getDate()}.${date.getMonth() + 1}.` });
    }
    return result;
}

function renderActivityChart() {
    const container = $("activityChart");
    if (!container || !analyticsData) return;

    const createdMap = new Map((analyticsData.createdByDay || []).map((item) => [item.day, Number(item.createdCount || 0)]));
    const resolvedMap = new Map((analyticsData.resolvedByDay || []).map((item) => [item.day, Number(item.resolvedCount || 0)]));
    const days = buildLast14Days();
    const max = Math.max(1, ...days.flatMap((day) => [createdMap.get(day.key) || 0, resolvedMap.get(day.key) || 0]));

    container.innerHTML = `
        <div class="activity-legend"><span><i class="legend-created"></i>Created</span><span><i class="legend-resolved"></i>Resolved</span></div>
        <div class="activity-columns">
            ${days.map((day) => {
                const created = createdMap.get(day.key) || 0;
                const resolved = resolvedMap.get(day.key) || 0;
                const createdHeight = Math.round((created / max) * 100);
                const resolvedHeight = Math.round((resolved / max) * 100);
                return `
                    <div class="activity-day" title="${day.key}: ${created} created, ${resolved} resolved">
                        <div class="activity-bars">
                            <div class="activity-bar created" style="height:${createdHeight}%"><span>${created || ""}</span></div>
                            <div class="activity-bar resolved" style="height:${resolvedHeight}%"><span>${resolved || ""}</span></div>
                        </div>
                        <small>${day.label}</small>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function renderAnalytics() {
    if (!analyticsData) return;
    const summary = analyticsData.summary || {};

    $("reportTotalTickets").textContent = summary.totalTickets ?? 0;
    $("reportActiveTickets").textContent = summary.activeTickets ?? 0;
    $("reportOverdueTickets").textContent = summary.overdueTickets ?? 0;
    $("reportSlaCompliance").textContent = summary.slaCompliancePct == null ? "—" : `${summary.slaCompliancePct}%`;
    $("reportAvgResolution").textContent = summary.avgResolutionHours == null ? "—" : `${summary.avgResolutionHours}h`;

    renderBarChart("statusChart", analyticsData.statusBreakdown || []);
    renderBarChart("priorityChart", analyticsData.priorityBreakdown || []);
    renderActivityChart();

    const workload = $("technicianWorkloadBody");
    const techniciansData = analyticsData.technicianWorkload || [];
    workload.innerHTML = techniciansData.length ? techniciansData.map((item) => `
        <tr>
            <td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.email)}</small></td>
            <td>${item.activeTickets}</td>
            <td class="${item.overdueTickets ? "metric-danger" : ""}">${item.overdueTickets}</td>
            <td>${item.resolvedLast30Days}</td>
            <td>${item.avgResolutionHours == null ? "—" : `${item.avgResolutionHours}h`}</td>
        </tr>
    `).join("") : `<tr><td colspan="5" class="table-empty">No active technicians.</td></tr>`;

    const customerList = $("topCustomersList");
    const customersData = analyticsData.topCustomers || [];
    customerList.innerHTML = customersData.length ? customersData.map((item, index) => `
        <div class="metric-list-row">
            <span class="metric-rank">${index + 1}</span>
            <div><strong>${escapeHtml(item.name)}</strong><small>${item.activeTickets} active</small></div>
            <span class="metric-value">${item.totalTickets}</span>
        </div>
    `).join("") : `<div class="empty-state compact-empty">No customer activity yet.</div>`;

    const auditList = $("recentAuditList");
    const audits = analyticsData.recentAudit || [];
    auditList.innerHTML = audits.length ? audits.map((item) => `
        <div class="audit-item">
            <div><strong>${escapeHtml(item.ticketNumber)}</strong> · ${escapeHtml(item.action)}</div>
            <p>${escapeHtml(item.userName || "System")} · ${escapeHtml(item.createdAt)}</p>
        </div>
    `).join("") : `<div class="empty-state compact-empty">No audit activity yet.</div>`;
}

async function exportTicketsCsv() {
    try {
        const response = await authFetch(`${API_URL}/reports/tickets.csv`);
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || "Export failed");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `servicedesk-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        showToast(`Could not export CSV: ${error.message}`);
    }
}

async function loadCannedReplies() {
    if (!isStaff()) { cannedReplies = []; return; }
    try {
        cannedReplies = await readJson(await authFetch(`${API_URL}/canned-replies`));
    } catch (error) {
        console.error("Canned replies API error:", error);
        cannedReplies = [];
    }
}

async function loadTicketTemplates() {
    if (!isStaff()) { ticketTemplates = []; return; }
    try {
        ticketTemplates = await readJson(await authFetch(`${API_URL}/ticket-templates`));
    } catch (error) {
        console.error("Ticket templates API error:", error);
        ticketTemplates = [];
    }
}

async function loadCustomers() {
    if (!isStaff()) {
        customers = [];
        return;
    }
    try {
        customers = await readJson(await authFetch(`${API_URL}/customers`));
    } catch (error) {
        console.error("Customers API error:", error);
        customers = [];
    }
}

async function loadCustomerUsers() {
    if (!isStaff()) {
        customerUsers = [];
        return;
    }
    try {
        customerUsers = await readJson(await authFetch(`${API_URL}/customer-users`));
    } catch (error) {
        console.error("Customer users API error:", error);
        customerUsers = [];
    }
}

async function loadUsers() {
    if (!isAdmin()) {
        users = [];
        return;
    }
    try {
        users = await readJson(await authFetch(`${API_URL}/users`));
    } catch (error) {
        console.error("Users API error:", error);
        users = [];
    }
}

async function loadTechnicians() {
    if (!isStaff()) {
        technicians = [];
        return;
    }
    try {
        technicians = await readJson(await authFetch(`${API_URL}/technicians`));
    } catch (error) {
        console.error("Technicians API error:", error);
        technicians = [];
    }
}

async function loadTickets() {
    try {
        tickets = await readJson(await authFetch(`${API_URL}/tickets`));
    } catch (error) {
        console.error("Tickets API error:", error);
        tickets = [];
    }
}

async function loadNotifications() {
    try {
        notifications = await readJson(await authFetch(`${API_URL}/notifications`));
    } catch (error) {
        console.error("Notifications API error:", error);
        notifications = [];
    }
    renderNotifications();
}

function renderNotifications() {
    const badge = $("notificationBadge");
    const list = $("notificationList");
    if (!badge || !list) return;

    const unread = notifications.filter((item) => !item.isRead).length;
    badge.textContent = unread;
    badge.style.display = unread ? "inline-flex" : "none";

    if (!notifications.length) {
        list.innerHTML = `<div class="empty-state compact-empty">No notifications.</div>`;
        return;
    }

    list.innerHTML = notifications.map((item) => `
        <button type="button" class="notification-item ${item.isRead ? "" : "unread"}" data-id="${escapeHtml(item.id)}" data-ticket="${escapeHtml(item.ticketId || "")}">
            <strong>${escapeHtml(item.ticketNumber || "ServiceDesk")}</strong>
            <span>${escapeHtml(item.message)}</span>
            <small>${escapeHtml(item.createdAt || "")}</small>
        </button>
    `).join("");

    list.querySelectorAll(".notification-item").forEach((button) => {
        button.addEventListener("click", async () => {
            try {
                await readJson(await authFetch(`${API_URL}/notifications/${button.dataset.id}/read`, { method: "PUT" }));
                const item = notifications.find((n) => n.id === button.dataset.id);
                if (item) item.isRead = 1;
                renderNotifications();
                if (button.dataset.ticket) {
                    $("notificationPanel").classList.remove("open");
                    await openTicketDetail(button.dataset.ticket);
                }
            } catch (error) {
                showToast(`Could not open notification: ${error.message}`);
            }
        });
    });
}

$("notificationButton").addEventListener("click", function () {
    $("notificationPanel").classList.toggle("open");
});

$("markAllNotificationsButton").addEventListener("click", async function () {
    try {
        await readJson(await authFetch(`${API_URL}/notifications/read-all`, { method: "PUT" }));
        notifications.forEach((item) => { item.isRead = 1; });
        renderNotifications();
    } catch (error) {
        showToast(`Could not mark notifications: ${error.message}`);
    }
});

function isTicketOverdue(ticket) {
    if (!ticket.slaDeadline || ["Resolved", "Closed"].includes(ticket.status)) return false;
    return new Date(ticket.slaDeadline.replace(" ", "T")).getTime() < Date.now();
}

function renderDashboard() {
    const roleTitle = $("dashboardRoleTitle");
    const roleText = $("dashboardRoleText");

    if (loggedUser.role === "admin") {
        roleTitle.textContent = "Admin operations overview";
        roleText.textContent = "All current support workload, critical incidents and SLA risk.";
    } else if (loggedUser.role === "technician") {
        roleTitle.textContent = "My technician workspace";
        roleText.textContent = "Tickets assigned to you plus unassigned work available to claim.";
    } else {
        roleTitle.textContent = "My support requests";
        roleText.textContent = "Track your open requests, replies and resolved issues.";
    }

    $("statNewTickets").textContent = tickets.filter((ticket) => ticket.status === "New").length;
    $("statOpenTickets").textContent = tickets.filter((ticket) => !["Resolved", "Closed"].includes(ticket.status)).length;
    $("statCriticalTickets").textContent = tickets.filter((ticket) => ticket.priority === "Critical").length;
    $("statClosedTickets").textContent = tickets.filter((ticket) => ticket.status === "Closed").length;
    $("statOverdueTickets").textContent = tickets.filter(isTicketOverdue).length;

    if (loggedUser.role === "technician") {
        $("statNewTickets").nextElementSibling.textContent = "Unassigned / New";
        $("statOpenTickets").nextElementSibling.textContent = "My Active Queue";
    } else if (loggedUser.role === "customer") {
        $("statNewTickets").nextElementSibling.textContent = "My New Tickets";
        $("statOpenTickets").nextElementSibling.textContent = "My Open Tickets";
    } else {
        $("statNewTickets").nextElementSibling.textContent = "New Tickets";
        $("statOpenTickets").nextElementSibling.textContent = "Open Tickets";
    }

    renderTicketCards($("dashboardTicketList"), tickets.slice(0, 5));
}

function renderCustomers() {
    const container = $("customerList");
    if (!container) return;
    if (!customers.length) {
        container.innerHTML = `<div class="empty-state">No customers found.</div>`;
        return;
    }

    container.innerHTML = customers.map((customer) => {
        const linked = customerUsers.find((user) => user.id === customer.userId);
        return `
            <div class="data-card">
                <div>
                    <h3>${escapeHtml(customer.company || customer.contactName)}</h3>
                    <p>${escapeHtml(customer.contactName)}</p>
                    <div class="card-meta">
                        <span>${escapeHtml(customer.email || "No email")}</span>
                        <span>${escapeHtml(customer.phone || "No phone")}</span>
                        <span>${linked ? `Account: ${escapeHtml(linked.email)}` : "No linked account"}</span>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="secondary-button edit-customer-button" type="button" data-id="${escapeHtml(customer.id)}">Edit</button>
                </div>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".edit-customer-button").forEach((button) => {
        button.addEventListener("click", () => openCustomerModal(button.dataset.id));
    });
}

function renderUsers() {
    const container = $("userList");
    if (!container || !isAdmin()) return;

    const role = $("userRoleFilter")?.value || "";
    const status = $("userStatusFilter")?.value || "";
    const search = ($("userSearch")?.value || "").trim().toLowerCase();

    const filtered = users.filter((user) => {
        const text = `${user.name} ${user.email} ${user.customerCompany || ""} ${user.customerContactName || ""}`.toLowerCase();
        return (!role || user.role === role) &&
            (!status || user.status === status) &&
            (!search || text.includes(search));
    });

    if (!filtered.length) {
        container.innerHTML = `<div class="empty-state">No users found.</div>`;
        return;
    }

    container.innerHTML = filtered.map((user) => `
        <div class="data-card user-card">
            <div>
                <div class="ticket-card-title-row">
                    <h3>${escapeHtml(user.name)}</h3>
                    <span class="badge role-badge">${escapeHtml(user.role)}</span>
                    <span class="badge ${user.status === "active" ? "status-resolved" : "status-closed"}">${escapeHtml(user.status)}</span>
                </div>
                <p>${escapeHtml(user.email)}</p>
                <div class="card-meta">
                    <span>Created: ${escapeHtml(user.createdAt || "—")}</span>
                    ${user.customerProfileId ? `<span>Customer: ${escapeHtml(user.customerCompany || user.customerContactName || "Linked")}</span>` : ""}
                </div>
            </div>
            <div class="card-actions user-actions">
                <button class="secondary-button edit-user-button" type="button" data-id="${escapeHtml(user.id)}">Edit</button>
                <button class="secondary-button reset-user-button" type="button" data-id="${escapeHtml(user.id)}">Reset password</button>
                ${user.id !== loggedUser.id ? `<button class="danger-small-button delete-user-button" type="button" data-id="${escapeHtml(user.id)}">Delete</button>` : ""}
            </div>
        </div>
    `).join("");

    container.querySelectorAll(".edit-user-button").forEach((button) => {
        button.addEventListener("click", () => openUserModal(button.dataset.id));
    });
    container.querySelectorAll(".reset-user-button").forEach((button) => {
        button.addEventListener("click", () => openPasswordModal(button.dataset.id));
    });
    container.querySelectorAll(".delete-user-button").forEach((button) => {
        button.addEventListener("click", () => deleteUser(button.dataset.id));
    });
}

function statusClass(status) {
    return ({
        "New": "status-new",
        "Open": "status-open",
        "In Progress": "status-progress",
        "Waiting for Customer": "status-waiting",
        "Resolved": "status-resolved",
        "Closed": "status-closed"
    })[status] || "";
}

function priorityClass(priority) {
    return `priority-${String(priority || "").toLowerCase()}`;
}

function formatDate(value) {
    if (!value) return "—";
    const normalized = String(value).replace(" ", "T");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function toDatetimeLocal(value) {
    if (!value) return "";
    return String(value).replace(" ", "T").slice(0, 16);
}

function renderTickets() {
    const status = $("ticketStatusFilter").value;
    const priority = $("ticketPriorityFilter").value;
    const category = $("ticketCategoryFilter")?.value || "";
    const search = $("ticketSearch").value.trim().toLowerCase();

    const filtered = tickets.filter((ticket) => {
        const customerText = `${ticket.company || ""} ${ticket.customerName || ""}`.toLowerCase();
        const baseMatch = (!status || ticket.status === status) &&
            (!priority || ticket.priority === priority) &&
            (!category || ticket.categoryId === category) &&
            (!search || ticket.title.toLowerCase().includes(search) || (ticket.ticketNumber || "").toLowerCase().includes(search) || customerText.includes(search));
        if (!baseMatch) return false;
        if (activeQueue === "mine") return ticket.technicianId === loggedUser.id && !["Resolved", "Closed"].includes(ticket.status);
        if (activeQueue === "unassigned") return !ticket.technicianId && !["Resolved", "Closed"].includes(ticket.status);
        if (activeQueue === "overdue") return isTicketOverdue(ticket);
        return true;
    });

    renderTicketCards($("ticketList"), filtered);
}

function renderTicketCards(container, items) {
    if (!items.length) {
        container.innerHTML = `<div class="empty-state">No tickets found.</div>`;
        updateBulkSelectedCount();
        return;
    }

    container.innerHTML = items.map((ticket) => `
        <div class="ticket-row-wrap">
            ${isStaff() ? `<label class="ticket-select-wrap" title="Select ticket"><input class="ticket-select-checkbox" type="checkbox" data-id="${escapeHtml(ticket.id)}" ${selectedTicketIds.has(ticket.id) ? "checked" : ""}></label>` : ""}
            <button class="ticket-card ticket-card-button" type="button" data-id="${escapeHtml(ticket.id)}">
                <div class="ticket-card-content">
                    <div class="ticket-card-title-row">
                        <h3><span class="ticket-number">${escapeHtml(ticket.ticketNumber || "Ticket")}</span> ${escapeHtml(ticket.title)}</h3>
                        ${isTicketOverdue(ticket) ? `<span class="badge sla-overdue">SLA overdue</span>` : ""}
                    </div>
                    <p>${escapeHtml(ticket.description)}</p>
                    <div class="card-meta">
                        <span>${escapeHtml(ticket.company || ticket.customerName || "Unknown customer")}</span>
                        <span>Technician: ${escapeHtml(ticket.technician || "Unassigned")}</span>
                        ${ticket.categoryName ? `<span>Category: ${escapeHtml(ticket.categoryName)}</span>` : ""}
                        ${ticket.tagNames ? `<span>Tags: ${escapeHtml(ticket.tagNames)}</span>` : ""}
                        <span>Created: ${escapeHtml(ticket.createdAt || "—")}</span>
                        ${ticket.slaDeadline ? `<span>SLA: ${escapeHtml(ticket.slaDeadline)}</span>` : ""}
                    </div>
                </div>
                <div class="card-actions">
                    <span class="badge ${priorityClass(ticket.priority)}">${escapeHtml(ticket.priority)}</span>
                    <span class="badge ${statusClass(ticket.status)}">${escapeHtml(ticket.status)}</span>
                </div>
            </button>
        </div>
    `).join("");

    container.querySelectorAll(".ticket-card-button").forEach((card) => {
        card.addEventListener("click", () => openTicketDetail(card.dataset.id));
    });
    container.querySelectorAll(".ticket-select-checkbox").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            checkbox.checked ? selectedTicketIds.add(checkbox.dataset.id) : selectedTicketIds.delete(checkbox.dataset.id);
            updateBulkSelectedCount();
        });
    });
    updateBulkSelectedCount();
}

$("ticketStatusFilter").addEventListener("change", renderTickets);
$("ticketPriorityFilter").addEventListener("change", renderTickets);
$("ticketCategoryFilter")?.addEventListener("change", renderTickets);
$("ticketSearch").addEventListener("input", renderTickets);

function populateTicketCustomerSelect() {
    const select = $("ticketCustomer");
    select.innerHTML = `<option value="">Select customer</option>`;
    customers.forEach((customer) => {
        const option = document.createElement("option");
        option.value = customer.id;
        option.textContent = customer.company
            ? `${customer.company} - ${customer.contactName}`
            : customer.contactName;
        select.appendChild(option);
    });
}

function populateTechnicianSelect(selectedId) {
    const select = $("detailTechnician");
    select.innerHTML = `<option value="">Unassigned</option>`;
    technicians.forEach((technician) => {
        const option = document.createElement("option");
        option.value = technician.id;
        option.textContent = `${technician.name} (${technician.email})`;
        select.appendChild(option);
    });
    select.value = selectedId || "";
}

function openModal(id) {
    $(id).classList.add("open");
    document.body.classList.add("modal-open");
}

function closeModal(id) {
    $(id).classList.remove("open");

    if (!document.querySelector(".modal.open")) {
        document.body.classList.remove("modal-open");
    }
}

function openTicketModal() {
    $("ticketForm").reset();
    if ($("ticketPriority") && appConfig.defaultPriority) $("ticketPriority").value = appConfig.defaultPriority;
    if (loggedUser.role !== "customer") populateTicketCustomerSelect();
    populateCategorySelect("ticketCategory");
    populateTagSelect("ticketTags");
    populateTicketTemplateSelect();
    openModal("ticketModal");
}

$("addTicketButton").onclick = openTicketModal;
$("dashboardAddTicketButton").onclick = openTicketModal;
$("cancelTicketButton").onclick = () => closeModal("ticketModal");

$("ticketForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    try {
        const response = await authFetch(`${API_URL}/tickets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: crypto.randomUUID(),
                customerId: loggedUser.role === "customer" ? null : $("ticketCustomer").value,
                title: $("ticketTitle").value.trim(),
                description: $("ticketDescription").value.trim(),
                priority: $("ticketPriority").value,
                categoryId: $("ticketCategory").value || null
            })
        });
        const created = await readJson(response);
        const tagIds = Array.from($("ticketTags").selectedOptions).map((option) => option.value);
        if (created.id && tagIds.length) {
            await readJson(await authFetch(`${API_URL}/tickets/${created.id}/tags`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tagIds })
            }));
        }
        await Promise.all([loadTickets(), loadNotifications()]);
        closeModal("ticketModal");
        renderDashboard();
        renderTickets();
    } catch (error) {
        showToast(`Could not create ticket: ${error.message}`);
    }
});

function populateTicketTemplateSelect() {
    const select = $("ticketTemplate");
    if (!select) return;
    select.innerHTML = `<option value="">No template</option>` + ticketTemplates.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
}

$("ticketTemplate")?.addEventListener("change", function () {
    const template = ticketTemplates.find((item) => item.id === this.value);
    if (!template) return;
    $("ticketTitle").value = template.title || "";
    $("ticketDescription").value = template.description || "";
    $("ticketPriority").value = template.priority || "Medium";
    $("ticketCategory").value = template.categoryId || "";
    const tagIds = new Set(template.tagIds || []);
    Array.from($("ticketTags").options).forEach((option) => option.selected = tagIds.has(option.value));
});

function populateBulkTechnicians() {
    const select = $("bulkTechnician");
    if (!select) return;
    select.innerHTML = `<option value="__unchanged__">Technician unchanged</option><option value="">Unassigned</option>` + technicians.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
}

function updateBulkSelectedCount() {
    const count = $("bulkSelectedCount");
    if (count) count.textContent = `${selectedTicketIds.size} selected`;
}

function visibleTicketIds() {
    return Array.from(document.querySelectorAll("#ticketList .ticket-select-checkbox")).map((item) => item.dataset.id);
}

$("bulkSelectAll")?.addEventListener("change", function () {
    visibleTicketIds().forEach((id) => this.checked ? selectedTicketIds.add(id) : selectedTicketIds.delete(id));
    renderTickets();
});

$("applyBulkButton")?.addEventListener("click", async function () {
    if (!selectedTicketIds.size) return showToast("Select at least one ticket.");
    const body = { ticketIds: Array.from(selectedTicketIds) };
    if ($("bulkStatus").value) body.status = $("bulkStatus").value;
    if ($("bulkPriority").value) body.priority = $("bulkPriority").value;
    if ($("bulkTechnician").value !== "__unchanged__") body.assignedUserId = $("bulkTechnician").value || null;
    if (!body.status && !body.priority && !("assignedUserId" in body)) return showToast("Choose a status, priority or technician change.");
    try {
        const result = await readJson(await authFetch(`${API_URL}/tickets/bulk-update`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
        selectedTicketIds.clear();
        $("bulkSelectAll").checked = false;
        await loadTickets();
        renderTickets();
        renderDashboard();
        showToast(`${result.updated} ticket(s) updated.`);
    } catch (error) { showToast(`Bulk update failed: ${error.message}`); }
});

document.querySelectorAll(".queue-chip").forEach((button) => button.addEventListener("click", () => {
    activeQueue = button.dataset.queue;
    document.querySelectorAll(".queue-chip").forEach((item) => item.classList.toggle("active", item === button));
    renderTickets();
}));

function renderProductivityTools() {
    if (!isStaff()) return;
    const replies = $("cannedReplyList");
    const templates = $("templateList");
    replies.innerHTML = cannedReplies.length ? cannedReplies.map((item) => `
        <div class="productivity-item"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p><small class="muted">Created by ${escapeHtml(item.createdByName || "Unknown")}</small></div>
        <div class="card-actions"><button class="secondary-button edit-reply" data-id="${escapeHtml(item.id)}" type="button">Edit</button><button class="danger-small-button delete-reply" data-id="${escapeHtml(item.id)}" type="button">Delete</button></div></div>`).join("") : `<div class="empty-state">No canned replies yet.</div>`;
    templates.innerHTML = ticketTemplates.length ? ticketTemplates.map((item) => `
        <div class="productivity-item"><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.title)} · ${escapeHtml(item.priority)}</p><small class="muted">Created by ${escapeHtml(item.createdByName || "Unknown")}</small></div>
        <div class="card-actions"><button class="secondary-button edit-template" data-id="${escapeHtml(item.id)}" type="button">Edit</button><button class="danger-small-button delete-template" data-id="${escapeHtml(item.id)}" type="button">Delete</button></div></div>`).join("") : `<div class="empty-state">No ticket templates yet.</div>`;
    replies.querySelectorAll(".edit-reply").forEach((b) => b.addEventListener("click", () => openCannedReplyModal(b.dataset.id)));
    replies.querySelectorAll(".delete-reply").forEach((b) => b.addEventListener("click", () => deleteCannedReply(b.dataset.id)));
    templates.querySelectorAll(".edit-template").forEach((b) => b.addEventListener("click", () => openTemplateModal(b.dataset.id)));
    templates.querySelectorAll(".delete-template").forEach((b) => b.addEventListener("click", () => deleteTicketTemplate(b.dataset.id)));
}

function openCannedReplyModal(id = "") {
    $("cannedReplyForm").reset();
    $("cannedReplyEditId").value = id;
    const item = cannedReplies.find((entry) => entry.id === id);
    $("cannedReplyModalTitle").textContent = item ? "Edit Canned Reply" : "New Canned Reply";
    if (item) { $("cannedReplyTitle").value = item.title; $("cannedReplyBody").value = item.body; }
    openModal("cannedReplyModal");
}

function openTemplateModal(id = "") {
    $("templateForm").reset();
    $("templateEditId").value = id;
    populateCategorySelect("templateCategory");
    populateTagSelect("templateTags");
    const item = ticketTemplates.find((entry) => entry.id === id);
    $("templateModalTitle").textContent = item ? "Edit Ticket Template" : "New Ticket Template";
    if (item) {
        $("templateName").value = item.name || ""; $("templateTitle").value = item.title || ""; $("templateDescription").value = item.description || "";
        $("templatePriority").value = item.priority || "Medium"; $("templateCategory").value = item.categoryId || "";
        const ids = new Set(item.tagIds || []); Array.from($("templateTags").options).forEach((o) => o.selected = ids.has(o.value));
    }
    openModal("templateModal");
}

$("addCannedReplyButton")?.addEventListener("click", () => openCannedReplyModal());
$("addTemplateButton")?.addEventListener("click", () => openTemplateModal());
$("cancelCannedReplyButton")?.addEventListener("click", () => closeModal("cannedReplyModal"));
$("cancelTemplateButton")?.addEventListener("click", () => closeModal("templateModal"));

$("cannedReplyForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("cannedReplyEditId").value;
    try {
        await readJson(await authFetch(`${API_URL}/canned-replies${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: $("cannedReplyTitle").value.trim(), body: $("cannedReplyBody").value.trim() }) }));
        closeModal("cannedReplyModal"); await loadCannedReplies(); renderProductivityTools(); populateCannedReplySelect();
    } catch (error) { showToast(`Could not save canned reply: ${error.message}`); }
});

$("templateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("templateEditId").value;
    try {
        await readJson(await authFetch(`${API_URL}/ticket-templates${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            name: $("templateName").value.trim(), title: $("templateTitle").value.trim(), description: $("templateDescription").value.trim(), priority: $("templatePriority").value,
            categoryId: $("templateCategory").value || null, tagIds: Array.from($("templateTags").selectedOptions).map((o) => o.value)
        }) }));
        closeModal("templateModal"); await loadTicketTemplates(); renderProductivityTools(); populateTicketTemplateSelect();
    } catch (error) { showToast(`Could not save template: ${error.message}`); }
});

async function deleteCannedReply(id) {
    if (!confirm("Delete this canned reply?")) return;
    try { await readJson(await authFetch(`${API_URL}/canned-replies/${id}`, { method: "DELETE" })); await loadCannedReplies(); renderProductivityTools(); } catch (error) { showToast(error.message); }
}
async function deleteTicketTemplate(id) {
    if (!confirm("Delete this ticket template?")) return;
    try { await readJson(await authFetch(`${API_URL}/ticket-templates/${id}`, { method: "DELETE" })); await loadTicketTemplates(); renderProductivityTools(); } catch (error) { showToast(error.message); }
}

function populateCannedReplySelect() {
    const select = $("cannedReplySelect");
    if (!select) return;
    select.innerHTML = `<option value="">Insert canned reply...</option>` + cannedReplies.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join("");
}

$("cannedReplySelect")?.addEventListener("change", function () {
    const item = cannedReplies.find((entry) => entry.id === this.value);
    if (!item) return;
    const textarea = $("commentMessage");
    textarea.value = textarea.value ? `${textarea.value}\n\n${item.body}` : item.body;
    textarea.focus();
    this.value = "";
});

async function refreshWatcherState() {
    if (!currentTicketDetail) return;
    try {
        const data = await readJson(await authFetch(`${API_URL}/tickets/${currentTicketDetail.ticket.id}/watchers`));
        const button = $("watchTicketButton");
        button.dataset.watching = data.watching ? "1" : "0";
        button.textContent = data.watching ? `Watching (${data.watchers.length})` : `Watch ticket (${data.watchers.length})`;
    } catch (error) { console.error("Watcher state error:", error); }
}

$("watchTicketButton")?.addEventListener("click", async function () {
    if (!currentTicketDetail) return;
    const watching = this.dataset.watching === "1";
    try {
        await readJson(await authFetch(`${API_URL}/tickets/${currentTicketDetail.ticket.id}/watchers/self`, { method: watching ? "DELETE" : "POST" }));
        await refreshWatcherState();
    } catch (error) { showToast(`Could not update watcher: ${error.message}`); }
});

function populateCustomerUserSelect(selectedUserId = "", currentCustomerId = "") {
    const select = $("customerUser");
    select.innerHTML = `<option value="">No linked account</option>`;

    customerUsers.forEach((user) => {
        if (user.linkedCustomerId && user.linkedCustomerId !== currentCustomerId) return;
        const option = document.createElement("option");
        option.value = user.id;
        option.textContent = `${user.name} — ${user.email}${user.status !== "active" ? " (inactive)" : ""}`;
        select.appendChild(option);
    });

    select.value = selectedUserId || "";
}

function openCustomerModal(customerId = null) {
    $("customerForm").reset();
    $("customerEditId").value = customerId || "";
    const customer = customers.find((item) => item.id === customerId);

    if (customer) {
        $("customerModalTitle").textContent = "Edit Customer";
        $("customerCompany").value = customer.company || "";
        $("customerContactName").value = customer.contactName || "";
        $("customerEmail").value = customer.email || "";
        $("customerPhone").value = customer.phone || "";
        populateCustomerUserSelect(customer.userId || "", customer.id);
    } else {
        $("customerModalTitle").textContent = "New Customer";
        populateCustomerUserSelect();
    }

    openModal("customerModal");
}

$("addCustomerButton").addEventListener("click", () => openCustomerModal());
$("cancelCustomerButton").addEventListener("click", () => closeModal("customerModal"));

$("customerForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    try {
        const editId = $("customerEditId").value;
        const payload = {
            company: $("customerCompany").value.trim(),
            contactName: $("customerContactName").value.trim(),
            email: $("customerEmail").value.trim(),
            phone: $("customerPhone").value.trim(),
            userId: $("customerUser").value || null
        };

        if (!editId) payload.id = crypto.randomUUID();

        const response = await authFetch(
            editId ? `${API_URL}/customers/${editId}` : `${API_URL}/customers`,
            {
                method: editId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }
        );
        await readJson(response);
        await Promise.all([loadCustomers(), loadCustomerUsers(), loadUsers()]);
        closeModal("customerModal");
        renderCustomers();
        renderUsers();
    } catch (error) {
        showToast(`Could not save customer: ${error.message}`);
    }
});

function openUserModal(userId = null) {
    $("userForm").reset();
    $("userEditId").value = userId || "";
    const user = users.find((item) => item.id === userId);

    if (user) {
        $("userModalTitle").textContent = "Edit User";
        $("userName").value = user.name || "";
        $("userEmail").value = user.email || "";
        $("userRole").value = user.role;
        $("userStatus").value = user.status;
        $("userPasswordWrap").style.display = "none";
        $("userPassword").removeAttribute("required");
    } else {
        $("userModalTitle").textContent = "New User";
        $("userStatus").value = "active";
        $("userPasswordWrap").style.display = "";
        $("userPassword").setAttribute("required", "required");
    }

    openModal("userModal");
}

$("addUserButton").addEventListener("click", () => openUserModal());
$("cancelUserButton").addEventListener("click", () => closeModal("userModal"));

$("userForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    try {
        const editId = $("userEditId").value;
        const payload = {
            name: $("userName").value.trim(),
            email: $("userEmail").value.trim(),
            role: $("userRole").value,
            status: $("userStatus").value
        };
        if (!editId) payload.password = $("userPassword").value;

        const response = await authFetch(
            editId ? `${API_URL}/users/${editId}` : `${API_URL}/users`,
            {
                method: editId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }
        );
        await readJson(response);
        await Promise.all([loadUsers(), loadTechnicians(), loadCustomerUsers(), loadCustomers()]);
        closeModal("userModal");
        renderUsers();
        renderCustomers();
    } catch (error) {
        showToast(`Could not save user: ${error.message}`);
    }
});

function openPasswordModal(userId) {
    const user = users.find((item) => item.id === userId);
    if (!user) return;
    $("passwordForm").reset();
    $("passwordUserId").value = userId;
    $("passwordUserLabel").textContent = `${user.name} — ${user.email}`;
    openModal("passwordModal");
}

$("cancelPasswordButton").addEventListener("click", () => closeModal("passwordModal"));
$("passwordForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    try {
        const userId = $("passwordUserId").value;
        const response = await authFetch(`${API_URL}/users/${userId}/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: $("newUserPassword").value })
        });
        await readJson(response);
        closeModal("passwordModal");
        showToast("Password reset successfully.");
    } catch (error) {
        showToast(`Could not reset password: ${error.message}`);
    }
});

async function deleteUser(userId) {
    const user = users.find((item) => item.id === userId);
    if (!user || !confirm(`Delete user ${user.name}?`)) return;
    try {
        await readJson(await authFetch(`${API_URL}/users/${userId}`, { method: "DELETE" }));
        await Promise.all([loadUsers(), loadTechnicians(), loadCustomerUsers(), loadCustomers()]);
        renderUsers();
        renderCustomers();
    } catch (error) {
        showToast(`Could not delete user: ${error.message}`);
    }
}

$("userRoleFilter").addEventListener("change", renderUsers);
$("userStatusFilter").addEventListener("change", renderUsers);
$("userSearch").addEventListener("input", renderUsers);

async function openTicketDetail(ticketId) {
    try {
        currentTicketDetail = await readJson(await authFetch(`${API_URL}/tickets/${ticketId}`));
        const [ticketTags, linkedArticles] = await Promise.all([
            readJson(await authFetch(`${API_URL}/tickets/${ticketId}/tags`)),
            readJson(await authFetch(`${API_URL}/tickets/${ticketId}/articles`))
        ]);
        currentTicketDetail.ticketTags = ticketTags;
        currentTicketDetail.linkedArticles = linkedArticles;
        renderTicketDetail();
        openModal("ticketDetailModal");
    } catch (error) {
        showToast(`Could not load ticket: ${error.message}`);
    }
}

function renderTicketDetail() {
    const { ticket, comments, history, attachments = [], ticketTags = [], linkedArticles = [] } = currentTicketDetail;
    const staff = isStaff();

    $("detailTicketId").textContent = ticket.ticketNumber || ticket.id;
    $("detailTitle").textContent = ticket.title;
    $("detailCustomer").textContent = ticket.company
        ? `${ticket.company} — ${ticket.customerName}`
        : ticket.customerName;
    $("detailDescription").textContent = ticket.description;
    $("detailStatus").value = ticket.status;
    $("detailPriority").value = ticket.priority;
    populateCategorySelect("detailCategory", ticket.categoryId || "");
    populateTagSelect("detailTags", ticketTags.map((item) => item.id));
    $("detailSla").value = toDatetimeLocal(ticket.slaDeadline);
    $("detailApplySlaRule").checked = false;
    updateSlaRuleHint();
    $("detailCreatedAt").textContent = formatDate(ticket.createdAt);
    $("detailUpdatedAt").textContent = formatDate(ticket.updatedAt);
    $("detailResolvedAt").textContent = formatDate(ticket.resolvedAt);
    $("detailCustomerEmail").textContent = ticket.customerEmail || "—";
    $("detailCustomerPhone").textContent = ticket.customerPhone || "—";

    populateTechnicianSelect(ticket.technicianId);

    document.querySelectorAll(".staff-only-detail").forEach((element) => {
        element.style.display = staff ? "" : "none";
    });
    document.querySelectorAll(".admin-only-detail").forEach((element) => {
        element.style.display = isAdmin() ? "" : "none";
    });

    if (loggedUser.role === "technician") {
        const technicianSelect = $("detailTechnician");
        technicianSelect.innerHTML = `<option value="">Unassigned</option>`;
        const selfOption = document.createElement("option");
        selfOption.value = loggedUser.id;
        selfOption.textContent = `${loggedUser.name} (assign to me)`;
        technicianSelect.appendChild(selfOption);
        technicianSelect.value = ticket.technicianId || "";
    }

    if (!staff) {
        $("detailStatus").disabled = true;
        $("detailPriority").disabled = true;
    } else {
        $("detailStatus").disabled = false;
        $("detailPriority").disabled = false;
    }

    renderComments(comments);
    renderAttachments(attachments);
    renderHistory(history);
    renderLinkedArticles(linkedArticles);
    renderSlaState(ticket);
    populateCannedReplySelect();
    refreshWatcherState();
}

function renderComments(comments) {
    $("commentCount").textContent = `${comments.length} message${comments.length === 1 ? "" : "s"}`;
    if (!comments.length) {
        $("commentList").innerHTML = `<div class="empty-state compact-empty">No comments yet.</div>`;
        return;
    }

    $("commentList").innerHTML = comments.map((comment) => `
        <div class="comment-card ${comment.isInternal ? "internal-comment" : ""}">
            <div class="comment-header">
                <strong>${escapeHtml(comment.userName)}</strong>
                <span>${escapeHtml(comment.userRole)}</span>
                ${comment.isInternal ? `<span class="badge internal-badge">Internal</span>` : ""}
                <time>${escapeHtml(comment.createdAt)}</time>
            </div>
            <p>${escapeHtml(comment.message)}</p>
        </div>
    `).join("");
}

function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAttachments(attachments) {
    $("attachmentCount").textContent = `${attachments.length} file${attachments.length === 1 ? "" : "s"}`;
    if (!attachments.length) {
        $("attachmentList").innerHTML = `<div class="empty-state compact-empty">No attachments yet.</div>`;
        return;
    }

    $("attachmentList").innerHTML = attachments.map((item) => `
        <div class="attachment-item">
            <div>
                <strong>${escapeHtml(item.fileName)}</strong>
                <p>${escapeHtml(item.userName || "Unknown user")} · ${escapeHtml(item.createdAt || "—")} · ${escapeHtml(formatFileSize(item.fileSize))}</p>
            </div>
            <div class="card-actions">
                <button type="button" class="secondary-button download-attachment-button" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.fileName)}">Download</button>
                ${isAdmin() ? `<button type="button" class="danger-small-button delete-attachment-button" data-id="${escapeHtml(item.id)}">Delete</button>` : ""}
            </div>
        </div>
    `).join("");

    $("attachmentList").querySelectorAll(".download-attachment-button").forEach((button) => {
        button.addEventListener("click", () => downloadAttachment(button.dataset.id, button.dataset.name));
    });
    $("attachmentList").querySelectorAll(".delete-attachment-button").forEach((button) => {
        button.addEventListener("click", () => deleteAttachment(button.dataset.id));
    });
}

async function downloadAttachment(id, fileName) {
    try {
        const response = await authFetch(`${API_URL}/attachments/${id}/download`);
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "Download failed");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName || "attachment";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        showToast(`Could not download attachment: ${error.message}`);
    }
}

async function deleteAttachment(id) {
    if (!isAdmin() || !confirm("Delete this attachment?")) return;
    try {
        await readJson(await authFetch(`${API_URL}/attachments/${id}`, { method: "DELETE" }));
        await openTicketDetail(currentTicketDetail.ticket.id);
    } catch (error) {
        showToast(`Could not delete attachment: ${error.message}`);
    }
}

function renderHistory(history) {
    if (!history.length) {
        $("historyList").innerHTML = `<div class="empty-state compact-empty">No activity yet.</div>`;
        return;
    }

    $("historyList").innerHTML = history.map((item) => `
        <div class="history-item">
            <div class="history-dot"></div>
            <div>
                <strong>${escapeHtml(item.action)}</strong>
                <p>${escapeHtml(item.userName || "System")} · ${escapeHtml(item.createdAt)}</p>
                ${(item.oldValue || item.newValue) ? `<small>${escapeHtml(item.oldValue || "—")} → ${escapeHtml(item.newValue || "—")}</small>` : ""}
            </div>
        </div>
    `).join("");
}

function renderSlaState(ticket) {
    const state = $("detailSlaState");
    state.className = "sla-state";

    if (!ticket.slaDeadline) {
        state.textContent = "No SLA deadline set";
        return;
    }

    if (["Resolved", "Closed"].includes(ticket.status)) {
        state.textContent = "Ticket completed";
        state.classList.add("sla-ok-text");
        return;
    }

    const deadline = new Date(ticket.slaDeadline.replace(" ", "T")).getTime();
    const remaining = deadline - Date.now();

    if (remaining < 0) {
        const hours = Math.ceil(Math.abs(remaining) / 3600000);
        state.textContent = `Overdue by approximately ${hours} h`;
        state.classList.add("sla-overdue-text");
    } else {
        const hours = Math.max(1, Math.floor(remaining / 3600000));
        state.textContent = `Approximately ${hours} h remaining`;
        state.classList.add("sla-ok-text");
    }
}

let SLA_RULE_HOURS = { Low: 72, Medium: 24, High: 8, Critical: 2 };

function updateSlaRuleHint() {
    const priority = $("detailPriority").value || "Medium";
    $("detailSlaRuleHint").textContent = `Automatic SLA for ${priority}: ${SLA_RULE_HOURS[priority]} hours from now.`;
}

$("detailPriority").addEventListener("change", updateSlaRuleHint);

$("closeTicketDetailButton").addEventListener("click", () => closeModal("ticketDetailModal"));

$("saveTicketButton").addEventListener("click", async function () {
    if (!currentTicketDetail) return;
    try {
        const response = await authFetch(`${API_URL}/tickets/${currentTicketDetail.ticket.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                assignedUserId: $("detailTechnician").value || null,
                priority: $("detailPriority").value,
                status: $("detailStatus").value,
                categoryId: $("detailCategory").value || null,
                slaDeadline: $("detailSla").value || null,
                applySlaRule: $("detailApplySlaRule").checked
            })
        });
        await readJson(response);
        const tagIds = Array.from($("detailTags").selectedOptions).map((option) => option.value);
        await readJson(await authFetch(`${API_URL}/tickets/${currentTicketDetail.ticket.id}/tags`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagIds })
        }));
        await Promise.all([loadTickets(), loadNotifications()]);
        await openTicketDetail(currentTicketDetail.ticket.id);
        renderDashboard();
        renderTickets();
    } catch (error) {
        showToast(`Could not update ticket: ${error.message}`);
    }
});

$("commentForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!currentTicketDetail) return;

    try {
        const response = await authFetch(`${API_URL}/tickets/${currentTicketDetail.ticket.id}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: $("commentMessage").value.trim(),
                isInternal: isStaff() && $("commentInternal").checked
            })
        });
        await readJson(response);
        $("commentMessage").value = "";
        $("commentInternal").checked = false;
        await Promise.all([openTicketDetail(currentTicketDetail.ticket.id), loadNotifications()]);
    } catch (error) {
        showToast(`Could not add comment: ${error.message}`);
    }
});

$("attachmentForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!currentTicketDetail) return;
    const file = $("attachmentFile").files[0];
    if (!file) return;

    try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await authFetch(`${API_URL}/tickets/${currentTicketDetail.ticket.id}/attachments`, {
            method: "POST",
            body: formData
        });
        await readJson(response);
        $("attachmentForm").reset();
        await openTicketDetail(currentTicketDetail.ticket.id);
    } catch (error) {
        showToast(`Could not upload attachment: ${error.message}`);
    }
});

$("deleteTicketButton").addEventListener("click", async function () {
    if (!currentTicketDetail || !isAdmin()) return;
    if (!confirm("Delete this ticket permanently?")) return;

    try {
        const response = await authFetch(`${API_URL}/tickets/${currentTicketDetail.ticket.id}`, {
            method: "DELETE"
        });
        await readJson(response);
        closeModal("ticketDetailModal");
        currentTicketDetail = null;
        await loadTickets();
        renderDashboard();
        renderTickets();
    } catch (error) {
        showToast(`Could not delete ticket: ${error.message}`);
    }
});

document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", function (event) {
        if (event.target === modal) closeModal(modal.id);
    });
});


if ($("refreshReportsButton")) {
    $("refreshReportsButton").addEventListener("click", loadAnalytics);
}

if ($("exportTicketsButton")) {
    $("exportTicketsButton").addEventListener("click", exportTicketsCsv);
}


/* =========================================================
   V0.6 - KNOWLEDGE, CATEGORIES, TAGS, SAVED FILTERS, SEARCH
========================================================= */

async function loadCategories() {
    try {
        categories = await readJson(await authFetch(`${API_URL}/categories`));
    } catch (error) {
        console.error("Categories API error:", error);
        categories = [];
    }
    populateCategorySelect("ticketCategoryFilter");
    populateCategorySelect("knowledgeCategoryFilter");
    populateCategorySelect("knowledgeCategory");
}

async function loadTags() {
    try {
        tags = await readJson(await authFetch(`${API_URL}/tags`));
    } catch (error) {
        console.error("Tags API error:", error);
        tags = [];
    }
}

async function loadKnowledge(query = "") {
    try {
        knowledgeArticles = await readJson(await authFetch(`${API_URL}/knowledge${query ? `?q=${encodeURIComponent(query)}` : ""}`));
    } catch (error) {
        console.error("Knowledge API error:", error);
        knowledgeArticles = [];
    }
    renderKnowledge();
}

async function loadSavedFilters() {
    try {
        savedFilters = await readJson(await authFetch(`${API_URL}/saved-filters`));
    } catch (error) {
        console.error("Saved filters API error:", error);
        savedFilters = [];
    }
    renderSavedFilters();
}

function populateCategorySelect(id, selected = "") {
    const select = $(id);
    if (!select) return;
    const firstLabel = id.includes("Filter") ? "All categories" : "No category";
    select.innerHTML = `<option value="">${firstLabel}</option>` + categories.map((category) =>
        `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`
    ).join("");
    select.value = selected || "";
}

function populateTagSelect(id, selectedIds = []) {
    const select = $(id);
    if (!select) return;
    const selected = new Set(selectedIds || []);
    select.innerHTML = tags.map((tag) =>
        `<option value="${escapeHtml(tag.id)}" ${selected.has(tag.id) ? "selected" : ""}>${escapeHtml(tag.name)}</option>`
    ).join("");
}

function renderKnowledge() {
    const container = $("knowledgeList");
    if (!container) return;
    const query = ($("knowledgeSearch")?.value || "").trim().toLowerCase();
    const category = $("knowledgeCategoryFilter")?.value || "";
    const filtered = knowledgeArticles.filter((article) => {
        const text = `${article.title} ${article.summary || ""} ${article.content || ""}`.toLowerCase();
        return (!query || text.includes(query)) && (!category || article.categoryId === category);
    });
    if (!filtered.length) {
        container.innerHTML = `<div class="empty-state">No knowledge articles found.</div>`;
        return;
    }
    container.innerHTML = filtered.map((article) => `
        <article class="knowledge-card">
            <div class="knowledge-card-head">
                <div>
                    <div class="ticket-card-title-row">
                        <h3>${escapeHtml(article.title)}</h3>
                        ${article.visibility === "internal" ? `<span class="badge internal-badge">Internal</span>` : ""}
                    </div>
                    <p>${escapeHtml(article.summary || "No summary")}</p>
                    <div class="card-meta">
                        ${article.categoryName ? `<span>${escapeHtml(article.categoryName)}</span>` : ""}
                        <span>Updated: ${escapeHtml(article.updatedAt || "—")}</span>
                        <span>Author: ${escapeHtml(article.authorName || "Unknown")}</span>
                    </div>
                </div>
                ${isStaff() ? `<div class="card-actions"><button class="secondary-button edit-knowledge-button" type="button" data-id="${escapeHtml(article.id)}">Edit</button>${isAdmin() ? `<button class="danger-small-button delete-knowledge-button" type="button" data-id="${escapeHtml(article.id)}">Delete</button>` : ""}</div>` : ""}
            </div>
            <div class="knowledge-content">${escapeHtml(article.content).replace(/\n/g, "<br>")}</div>
        </article>
    `).join("");
    container.querySelectorAll(".edit-knowledge-button").forEach((button) => button.addEventListener("click", () => openKnowledgeModal(button.dataset.id)));
    container.querySelectorAll(".delete-knowledge-button").forEach((button) => button.addEventListener("click", () => deleteKnowledge(button.dataset.id)));
}

function openKnowledgeModal(articleId = null) {
    $("knowledgeForm").reset();
    $("knowledgeEditId").value = articleId || "";
    populateCategorySelect("knowledgeCategory");
    const article = knowledgeArticles.find((item) => item.id === articleId);
    $("knowledgeModalTitle").textContent = article ? "Edit Knowledge Article" : "New Knowledge Article";
    if (article) {
        $("knowledgeTitle").value = article.title || "";
        $("knowledgeSummary").value = article.summary || "";
        $("knowledgeContent").value = article.content || "";
        $("knowledgeCategory").value = article.categoryId || "";
        $("knowledgeVisibility").value = article.visibility || "public";
        $("knowledgeStatus").value = article.status || "published";
    }
    openModal("knowledgeModal");
}

async function deleteKnowledge(id) {
    if (!isAdmin() || !confirm("Delete this knowledge article?")) return;
    try {
        await readJson(await authFetch(`${API_URL}/knowledge/${id}`, { method: "DELETE" }));
        await loadKnowledge();
    } catch (error) {
        showToast(`Could not delete article: ${error.message}`);
    }
}

function renderLinkedArticles(items) {
    const container = $("linkedArticleList");
    if (!container) return;
    $("linkedArticleCount").textContent = `${items.length} linked`;
    if (!items.length) {
        container.innerHTML = `<div class="empty-state compact-empty">No related articles linked.</div>`;
    } else {
        container.innerHTML = items.map((article) => `
            <div class="linked-article-item">
                <div><strong>${escapeHtml(article.title)}</strong><p>${escapeHtml(article.summary || "")}</p></div>
                ${isStaff() ? `<button class="danger-small-button unlink-article-button" type="button" data-id="${escapeHtml(article.id)}">Unlink</button>` : ""}
            </div>
        `).join("");
        container.querySelectorAll(".unlink-article-button").forEach((button) => {
            button.addEventListener("click", async () => {
                try {
                    await readJson(await authFetch(`${API_URL}/tickets/${currentTicketDetail.ticket.id}/articles/${button.dataset.id}`, { method: "DELETE" }));
                    await openTicketDetail(currentTicketDetail.ticket.id);
                } catch (error) {
                    showToast(`Could not unlink article: ${error.message}`);
                }
            });
        });
    }
    const select = $("linkArticleSelect");
    if (select) {
        const linked = new Set(items.map((item) => item.id));
        select.innerHTML = `<option value="">Select article...</option>` + knowledgeArticles
            .filter((article) => !linked.has(article.id))
            .map((article) => `<option value="${escapeHtml(article.id)}">${escapeHtml(article.title)}</option>`).join("");
    }
}

function renderSavedFilters() {
    const select = $("savedFilterSelect");
    if (!select) return;
    select.innerHTML = `<option value="">Saved filters</option>` + savedFilters.map((filter) =>
        `<option value="${escapeHtml(filter.id)}">${escapeHtml(filter.name)}</option>`
    ).join("");
}

$("knowledgeSearch")?.addEventListener("input", renderKnowledge);
$("knowledgeCategoryFilter")?.addEventListener("change", renderKnowledge);
$("addKnowledgeButton")?.addEventListener("click", () => openKnowledgeModal());
$("cancelKnowledgeButton")?.addEventListener("click", () => closeModal("knowledgeModal"));

$("knowledgeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        const id = $("knowledgeEditId").value;
        const response = await authFetch(`${API_URL}/knowledge${id ? `/${id}` : ""}`, {
            method: id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: $("knowledgeTitle").value.trim(),
                summary: $("knowledgeSummary").value.trim(),
                content: $("knowledgeContent").value.trim(),
                categoryId: $("knowledgeCategory").value || null,
                visibility: $("knowledgeVisibility").value,
                status: $("knowledgeStatus").value
            })
        });
        await readJson(response);
        closeModal("knowledgeModal");
        await loadKnowledge();
    } catch (error) {
        showToast(`Could not save article: ${error.message}`);
    }
});

$("linkArticleButton")?.addEventListener("click", async () => {
    if (!currentTicketDetail || !$("linkArticleSelect").value) return;
    try {
        await readJson(await authFetch(`${API_URL}/tickets/${currentTicketDetail.ticket.id}/articles`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ articleId: $("linkArticleSelect").value })
        }));
        await openTicketDetail(currentTicketDetail.ticket.id);
    } catch (error) {
        showToast(`Could not link article: ${error.message}`);
    }
});

$("saveCurrentFilterButton")?.addEventListener("click", async () => {
    const name = prompt("Name this filter:");
    if (!name) return;
    try {
        await readJson(await authFetch(`${API_URL}/saved-filters`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                filter: {
                    status: $("ticketStatusFilter").value,
                    priority: $("ticketPriorityFilter").value,
                    category: $("ticketCategoryFilter").value,
                    search: $("ticketSearch").value
                }
            })
        }));
        await loadSavedFilters();
    } catch (error) {
        showToast(`Could not save filter: ${error.message}`);
    }
});

$("savedFilterSelect")?.addEventListener("change", () => {
    const item = savedFilters.find((filter) => filter.id === $("savedFilterSelect").value);
    if (!item) return;
    $("ticketStatusFilter").value = item.filter?.status || "";
    $("ticketPriorityFilter").value = item.filter?.priority || "";
    $("ticketCategoryFilter").value = item.filter?.category || "";
    $("ticketSearch").value = item.filter?.search || "";
    renderTickets();
});

$("deleteSavedFilterButton")?.addEventListener("click", async () => {
    const id = $("savedFilterSelect")?.value;
    if (!id) return;
    try {
        await readJson(await authFetch(`${API_URL}/saved-filters/${id}`, { method: "DELETE" }));
        await loadSavedFilters();
    } catch (error) {
        showToast(`Could not delete filter: ${error.message}`);
    }
});

let globalSearchTimer = null;
$("globalSearchInput")?.addEventListener("input", () => {
    clearTimeout(globalSearchTimer);
    const query = $("globalSearchInput").value.trim();
    if (query.length < 2) {
        $("globalSearchPanel").classList.remove("open");
        $("globalSearchPanel").innerHTML = "";
        return;
    }
    globalSearchTimer = setTimeout(async () => {
        try {
            const results = await readJson(await authFetch(`${API_URL}/search?q=${encodeURIComponent(query)}`));
            const ticketHtml = (results.tickets || []).map((ticket) => `
                <button type="button" class="global-search-result ticket-result" data-ticket="${escapeHtml(ticket.id)}">
                    <strong>${escapeHtml(ticket.ticketNumber)} · ${escapeHtml(ticket.title)}</strong>
                    <span>${escapeHtml(ticket.status)} · ${escapeHtml(ticket.priority)}</span>
                </button>`).join("");
            const articleHtml = (results.articles || []).map((article) => `
                <button type="button" class="global-search-result article-result" data-article="${escapeHtml(article.id)}">
                    <strong>${escapeHtml(article.title)}</strong>
                    <span>${escapeHtml(article.summary || "Knowledge article")}</span>
                </button>`).join("");
            $("globalSearchPanel").innerHTML = `${ticketHtml}${articleHtml}` || `<div class="empty-state compact-empty">No results.</div>`;
            $("globalSearchPanel").classList.add("open");
            $("globalSearchPanel").querySelectorAll("[data-ticket]").forEach((button) => button.addEventListener("click", async () => {
                $("globalSearchPanel").classList.remove("open");
                await openTicketDetail(button.dataset.ticket);
            }));
            $("globalSearchPanel").querySelectorAll("[data-article]").forEach((button) => button.addEventListener("click", () => {
                $("globalSearchPanel").classList.remove("open");
                showView("knowledge");
                $("knowledgeSearch").value = knowledgeArticles.find((article) => article.id === button.dataset.article)?.title || "";
                renderKnowledge();
            }));
        } catch (error) {
            console.error("Global search error:", error);
        }
    }, 250);
});

document.addEventListener("click", (event) => {
    if (!event.target.closest(".topbar-search-wrap")) $("globalSearchPanel")?.classList.remove("open");
});

async function startApplication() {
    const validSession = await loadCurrentUser();
    if (validSession) await showApplication();
    else showLogin();
}

startApplication();

if ($("saveSettingsButton")) $("saveSettingsButton").addEventListener("click", saveAdminSettings);
