const API_URL = "http://localhost:3000/api";

let authToken = localStorage.getItem("servicedeskToken");
let loggedUser = null;
let tickets = [];
let customers = [];
let technicians = [];
let currentTicketDetail = null;
let users = [];
let customerUsers = [];

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
    await Promise.all([
        loadCustomers(),
        loadTechnicians(),
        loadTickets(),
        loadCustomerUsers(),
        loadUsers()
    ]);
    renderDashboard();
    renderTickets();
    renderCustomers();
    renderUsers();
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
    if (name === "users") renderUsers();
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
        renderTicketDetail();
        openModal("ticketDetailModal");
    } catch (error) {
        showToast(`Could not load ticket: ${error.message}`);
    }
}

function renderTicketDetail() {
    const { ticket, comments, history, attachments = [] } = currentTicketDetail;
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
    renderAttachments(attachments);
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
        if (event.target === modal) modal.classList.remove("open");
    });
});

async function startApplication() {
    const validSession = await loadCurrentUser();
    if (validSession) await showApplication();
    else showLogin();
}

startApplication();
