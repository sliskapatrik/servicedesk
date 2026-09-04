const API_URL = "http://localhost:3000/api";

let authToken = localStorage.getItem("servicedeskToken");
let loggedUser = null;
let tickets = [];
let customers = [];
let technicians = [];
let currentTicketDetail = null;

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
    return fetch(url, { ...options, headers });
}

async function readJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
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
    await Promise.all([loadCustomers(), loadTechnicians(), loadTickets()]);
    renderDashboard();
    renderTickets();
    renderCustomers();
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
    users: $("usersView")
};

const titles = {
    dashboard: ["Dashboard", "ServiceDesk overview"],
    tickets: ["Tickets", "Support requests and incidents"],
    customers: ["Customers", "Customer directory"],
    users: ["Users", "ServiceDesk accounts"]
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

function isTicketOverdue(ticket) {
    if (!ticket.slaDeadline || ["Resolved", "Closed"].includes(ticket.status)) return false;
    return new Date(ticket.slaDeadline.replace(" ", "T")).getTime() < Date.now();
}

function renderDashboard() {
    $("statNewTickets").textContent = tickets.filter((ticket) => ticket.status === "New").length;
    $("statOpenTickets").textContent = tickets.filter((ticket) => !["Resolved", "Closed"].includes(ticket.status)).length;
    $("statCriticalTickets").textContent = tickets.filter((ticket) => ticket.priority === "Critical").length;
    $("statClosedTickets").textContent = tickets.filter((ticket) => ticket.status === "Closed").length;
    $("statOverdueTickets").textContent = tickets.filter(isTicketOverdue).length;
    renderTicketCards($("dashboardTicketList"), tickets.slice(0, 5));
}

function renderCustomers() {
    const container = $("customerList");
    if (!container) return;
    if (!customers.length) {
        container.innerHTML = `<div class="empty-state">No customers found.</div>`;
        return;
    }

    container.innerHTML = customers.map((customer) => `
        <div class="data-card">
            <div>
                <h3>${escapeHtml(customer.company || customer.contactName)}</h3>
                <p>${escapeHtml(customer.contactName)}</p>
                <div class="card-meta">
                    <span>${escapeHtml(customer.email || "No email")}</span>
                    <span>${escapeHtml(customer.phone || "No phone")}</span>
                </div>
            </div>
        </div>
    `).join("");
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
    const search = $("ticketSearch").value.trim().toLowerCase();

    const filtered = tickets.filter((ticket) => {
        const customerText = `${ticket.company || ""} ${ticket.customerName || ""}`.toLowerCase();
        return (!status || ticket.status === status) &&
            (!priority || ticket.priority === priority) &&
            (!search || ticket.title.toLowerCase().includes(search) || customerText.includes(search));
    });

    renderTicketCards($("ticketList"), filtered);
}

function renderTicketCards(container, items) {
    if (!items.length) {
        container.innerHTML = `<div class="empty-state">No tickets found.</div>`;
        return;
    }

    container.innerHTML = items.map((ticket) => `
        <button class="ticket-card ticket-card-button" type="button" data-id="${escapeHtml(ticket.id)}">
            <div class="ticket-card-content">
                <div class="ticket-card-title-row">
                    <h3>${escapeHtml(ticket.title)}</h3>
                    ${isTicketOverdue(ticket) ? `<span class="badge sla-overdue">SLA overdue</span>` : ""}
                </div>
                <p>${escapeHtml(ticket.description)}</p>
                <div class="card-meta">
                    <span>${escapeHtml(ticket.company || ticket.customerName || "Unknown customer")}</span>
                    <span>Technician: ${escapeHtml(ticket.technician || "Unassigned")}</span>
                    <span>Created: ${escapeHtml(ticket.createdAt || "—")}</span>
                    ${ticket.slaDeadline ? `<span>SLA: ${escapeHtml(ticket.slaDeadline)}</span>` : ""}
                </div>
            </div>
            <div class="card-actions">
                <span class="badge ${priorityClass(ticket.priority)}">${escapeHtml(ticket.priority)}</span>
                <span class="badge ${statusClass(ticket.status)}">${escapeHtml(ticket.status)}</span>
            </div>
        </button>
    `).join("");

    container.querySelectorAll(".ticket-card-button").forEach((card) => {
        card.addEventListener("click", () => openTicketDetail(card.dataset.id));
    });
}

$("ticketStatusFilter").addEventListener("change", renderTickets);
$("ticketPriorityFilter").addEventListener("change", renderTickets);
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
}

function closeModal(id) {
    $(id).classList.remove("open");
}

function openTicketModal() {
    $("ticketForm").reset();
    if (loggedUser.role !== "customer") populateTicketCustomerSelect();
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
                priority: $("ticketPriority").value
            })
        });
        await readJson(response);
        await loadTickets();
        closeModal("ticketModal");
        renderDashboard();
        renderTickets();
    } catch (error) {
        showToast(`Could not create ticket: ${error.message}`);
    }
});

$("addCustomerButton").addEventListener("click", function () {
    $("customerForm").reset();
    openModal("customerModal");
});

$("cancelCustomerButton").addEventListener("click", () => closeModal("customerModal"));

$("customerForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    try {
        const response = await authFetch(`${API_URL}/customers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: crypto.randomUUID(),
                company: $("customerCompany").value.trim(),
                contactName: $("customerContactName").value.trim(),
                email: $("customerEmail").value.trim(),
                phone: $("customerPhone").value.trim()
            })
        });
        await readJson(response);
        await loadCustomers();
        closeModal("customerModal");
        renderCustomers();
    } catch (error) {
        showToast(`Could not create customer: ${error.message}`);
    }
});

async function openTicketDetail(ticketId) {
    try {
        currentTicketDetail = await readJson(await authFetch(`${API_URL}/tickets/${ticketId}`));
        renderTicketDetail();
        openModal("ticketDetailModal");
    } catch (error) {
        showToast(`Could not load ticket: ${error.message}`);
    }
}

function renderTicketDetail() {
    const { ticket, comments, history } = currentTicketDetail;
    const staff = isStaff();

    $("detailTicketId").textContent = ticket.id;
    $("detailTitle").textContent = ticket.title;
    $("detailCustomer").textContent = ticket.company
        ? `${ticket.company} — ${ticket.customerName}`
        : ticket.customerName;
    $("detailDescription").textContent = ticket.description;
    $("detailStatus").value = ticket.status;
    $("detailPriority").value = ticket.priority;
    $("detailSla").value = toDatetimeLocal(ticket.slaDeadline);
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
    renderHistory(history);
    renderSlaState(ticket);
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
                slaDeadline: $("detailSla").value || null
            })
        });
        await readJson(response);
        await loadTickets();
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
        await openTicketDetail(currentTicketDetail.ticket.id);
    } catch (error) {
        showToast(`Could not add comment: ${error.message}`);
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
        if (event.target === modal) modal.classList.remove("open");
    });
});

async function startApplication() {
    const validSession = await loadCurrentUser();
    if (validSession) await showApplication();
    else showLogin();
}

startApplication();
