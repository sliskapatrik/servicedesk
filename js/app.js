const API_URL =
    "http://localhost:3000/api";


let authToken =
    localStorage.getItem(
        "servicedeskToken"
    );


let loggedUser =
    null;


let tickets = [];
let customers = [];


const $ =
    function (id) {

        return document.getElementById(id);

    };


function escapeHtml(value) {

    return String(
        value ?? ""
    ).replace(
        /[&<>'"]/g,
        function (character) {

            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "'": "&#39;",
                '"': "&quot;"
            }[character];

        }
    );
}


async function authFetch(
    url,
    options = {}
) {

    const headers = {
        ...(options.headers || {})
    };


    if (authToken) {

        headers.Authorization =
            `Bearer ${authToken}`;

    }


    return window.fetch(
        url,
        {
            ...options,
            headers
        }
    );
}


/* LOGIN */

async function login(
    email,
    password
) {

    const response =
        await fetch(
            `${API_URL}/auth/login`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        email,
                        password
                    })
            }
        );


    const data =
        await response.json();


    if (!response.ok) {

        throw new Error(
            data.error ||
            "Login failed"
        );

    }


    authToken =
        data.token;


    loggedUser =
        data.user;


    localStorage.setItem(
        "servicedeskToken",
        authToken
    );


    await showApplication();
}


async function loadCurrentUser() {

    if (!authToken) {
        return false;
    }


    try {

        const response =
            await authFetch(
                `${API_URL}/auth/me`
            );


        if (!response.ok) {

            throw new Error(
                "Invalid session"
            );

        }


        loggedUser =
            await response.json();


        return true;


    } catch (error) {

        localStorage.removeItem(
            "servicedeskToken"
        );


        authToken =
            null;


        loggedUser =
            null;


        return false;

    }
}


$("loginForm")
    .addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            $("loginError")
                .textContent =
                "";


            try {

                await login(
                    $("loginEmail")
                        .value
                        .trim(),

                    $("loginPassword")
                        .value
                );


                $("loginForm")
                    .reset();


            } catch (error) {

                $("loginError")
                    .textContent =
                    error.message;

            }

        }
    );


$("logoutButton")
    .addEventListener(
        "click",
        function () {

            localStorage.removeItem(
                "servicedeskToken"
            );


            authToken =
                null;


            loggedUser =
                null;


            showLogin();

        }
    );


function showLogin() {

    $("loginScreen")
        .classList
        .remove("hidden");


    $("app")
        .style.display =
        "none";
}


async function showApplication() {

    $("loginScreen")
        .classList
        .add("hidden");


    $("app")
        .style.display =
        "flex";


    $("currentUserName")
        .textContent =
        loggedUser.name;


    $("currentUserRole")
        .textContent =
        loggedUser.role;


    applyRolePermissions();

    await loadCustomers();
    await loadTickets();

    renderDashboard();
    renderTickets();
    renderCustomers();
}


/* ROLE UI */

function applyRolePermissions() {

    const isAdmin =
        loggedUser.role === "admin";


    const isStaff =
        loggedUser.role === "admin" ||
        loggedUser.role === "technician";


    document
        .querySelectorAll(
            ".admin-only"
        )
        .forEach(
            function (element) {

                element.style.display =
                    isAdmin
                        ? ""
                        : "none";

            }
        );


    document
        .querySelectorAll(
            ".staff-only"
        )
        .forEach(
            function (element) {

                element.style.display =
                    isStaff
                        ? ""
                        : "none";

            }
        );

    const customerSelect = $("ticketCustomer");
    const customerLabel = $("ticketCustomerLabel");

    if (customerSelect && customerLabel) {
        const isCustomer = loggedUser.role === "customer";
        customerSelect.style.display = isCustomer ? "none" : "";
        customerLabel.style.display = isCustomer ? "none" : "";

        if (isCustomer) {
            customerSelect.removeAttribute("required");
        } else {
            customerSelect.setAttribute("required", "required");
        }
    }
}


/* VIEWS */

const views = {

    dashboard:
        $("dashboardView"),

    tickets:
        $("ticketsView"),

    customers:
        $("customersView"),

    users:
        $("usersView")

};


const titles = {

    dashboard: [
        "Dashboard",
        "ServiceDesk overview"
    ],

    tickets: [
        "Tickets",
        "Support requests and incidents"
    ],

    customers: [
        "Customers",
        "Customer directory"
    ],

    users: [
        "Users",
        "ServiceDesk accounts"
    ]

};


document
    .querySelectorAll(
        ".menu-item"
    )
    .forEach(
        function (button) {

            button.addEventListener(
                "click",
                function () {

                    showView(
                        button.dataset.view
                    );

                }
            );

        }
    );


function showView(name) {

    Object.values(views)
        .forEach(
            function (view) {

                view.classList.remove(
                    "active-view"
                );

            }
        );


    views[name]
        .classList
        .add(
            "active-view"
        );


    document
        .querySelectorAll(
            ".menu-item"
        )
        .forEach(
            function (button) {

                button.classList.toggle(
                    "active",
                    button.dataset.view === name
                );

            }
        );


    $("pageTitle")
        .textContent =
        titles[name][0];


    $("pageSubtitle")
        .textContent =
        titles[name][1];


    if (name === "tickets") {
        renderTickets();
    }

    if (name === "customers") {
        renderCustomers();
    }
}

/* DASHBOARD */

function renderDashboard() {

    $("statNewTickets")
        .textContent =
        tickets.filter(
            function (ticket) {

                return ticket.status ===
                    "New";

            }
        ).length;


    $("statOpenTickets")
        .textContent =
        tickets.filter(
            function (ticket) {

                return ![
                    "Resolved",
                    "Closed"
                ].includes(
                    ticket.status
                );

            }
        ).length;


    $("statCriticalTickets")
        .textContent =
        tickets.filter(
            function (ticket) {

                return ticket.priority ===
                    "Critical";

            }
        ).length;


    $("statClosedTickets")
        .textContent =
        tickets.filter(
            function (ticket) {

                return ticket.status ===
                    "Closed";

            }
        ).length;


    renderTicketCards(
        $("dashboardTicketList"),
        tickets.slice(0, 5)
    );
}


async function loadCustomers() {

    if (!loggedUser || loggedUser.role === "customer") {
        customers = [];
        return;
    }

    try {
        const response = await authFetch(
            `${API_URL}/customers`
        );

        if (!response.ok) {
            throw new Error("Could not load customers");
        }

        customers = await response.json();
    } catch (error) {
        console.error("Customers API error:", error);
        customers = [];
    }
}


function renderCustomers() {

    const container = $("customerList");

    if (!container) {
        return;
    }

    if (customers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                No customers found.
            </div>
        `;
        return;
    }

    container.innerHTML = customers
        .map(function (customer) {
            return `
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
            `;
        })
        .join("");
}


/* TICKETS */

function statusClass(status) {

    const map = {

        "New":
            "status-new",

        "Open":
            "status-open",

        "In Progress":
            "status-progress",

        "Waiting for Customer":
            "status-waiting",

        "Resolved":
            "status-resolved",

        "Closed":
            "status-closed"

    };


    return map[status] || "";
}


function priorityClass(priority) {

    return (
        "priority-" +
        priority
            .toLowerCase()
    );
}


function renderTickets() {

    const status =
        $("ticketStatusFilter")
            .value;


    const priority =
        $("ticketPriorityFilter")
            .value;


    const search =
        $("ticketSearch")
            .value
            .trim()
            .toLowerCase();


    const filtered =
        tickets.filter(
            function (ticket) {

                const statusMatch =
                    !status ||
                    ticket.status ===
                        status;


                const priorityMatch =
                    !priority ||
                    ticket.priority ===
                        priority;


                const searchMatch =
                    !search ||
                    ticket.title
                        .toLowerCase()
                        .includes(search) ||
                    `${ticket.company || ""} ${ticket.customerName || ""}`
                        .toLowerCase()
                        .includes(search);


                return (
                    statusMatch &&
                    priorityMatch &&
                    searchMatch
                );

            }
        );


    renderTicketCards(
        $("ticketList"),
        filtered
    );
}


function renderTicketCards(
    container,
    items
) {

    if (items.length === 0) {

        container.innerHTML = `
            <div class="empty-state">
                No tickets found.
            </div>
        `;

        return;

    }


    container.innerHTML =
        items.map(
            function (ticket) {

                return `
                    <div
                        class="ticket-card"
                        data-id="${ticket.id}"
                    >

                        <div>

                            <h3>
                                ${escapeHtml(
                                    ticket.title
                                )}
                            </h3>

                            <p>
                                ${escapeHtml(
                                    ticket.description
                                )}
                            </p>

                            <div class="card-meta">

                                <span>
                                    ${escapeHtml(
                                        ticket.company || ticket.customerName || "Unknown customer"
                                    )}
                                </span>

                                <span>
                                    Technician:
                                    ${escapeHtml(
                                        ticket.technician || "Unassigned"
                                    )}
                                </span>

                                <span>
                                    ${escapeHtml(
                                        ticket.createdAt
                                    )}
                                </span>

                            </div>

                        </div>


                        <div class="card-actions">

                            <span
                                class="badge ${priorityClass(
                                    ticket.priority
                                )}"
                            >
                                ${escapeHtml(
                                    ticket.priority
                                )}
                            </span>

                            <span
                                class="badge ${statusClass(
                                    ticket.status
                                )}"
                            >
                                ${escapeHtml(
                                    ticket.status
                                )}
                            </span>

                        </div>

                    </div>
                `;

            }
        )
        .join("");
}


$("ticketStatusFilter")
    .addEventListener(
        "change",
        renderTickets
    );


$("ticketPriorityFilter")
    .addEventListener(
        "change",
        renderTickets
    );


$("ticketSearch")
    .addEventListener(
        "input",
        renderTickets
    );


/* CREATE TICKET MODAL */

function populateTicketCustomerSelect() {

    const select = $("ticketCustomer");

    if (!select) {
        return;
    }

    select.innerHTML = `
        <option value="">
            Select customer
        </option>
    `;

    customers.forEach(function (customer) {
        const option = document.createElement("option");
        option.value = customer.id;
        option.textContent = customer.company
            ? `${customer.company} - ${customer.contactName}`
            : customer.contactName;
        select.appendChild(option);
    });
}


function openTicketModal() {

    $("ticketForm").reset();

    if (loggedUser.role !== "customer") {
        populateTicketCustomerSelect();
    }

    openModal("ticketModal");
}


function openModal(id) {

    $(id)
        .classList
        .add("open");
}


function closeModal(id) {

    $(id)
        .classList
        .remove("open");
}


$("addTicketButton")
    .onclick =
    openTicketModal;


$("dashboardAddTicketButton")
    .onclick =
    openTicketModal;


$("cancelTicketButton")
    .onclick =
    function () {

        closeModal(
            "ticketModal"
        );

    };


$("ticketForm")
    .addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const data = {

                id:
                    crypto.randomUUID(),

                customerId:
                    loggedUser.role === "customer"
                        ? null
                        : $("ticketCustomer").value,

                title:
                    $("ticketTitle")
                        .value
                        .trim(),

                description:
                    $("ticketDescription")
                        .value
                        .trim(),

                priority:
                    $("ticketPriority")
                        .value
            };


            try {

                const response =
                    await authFetch(
                        `${API_URL}/tickets`,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify(
                                    data
                                )
                        }
                    );


                const result =
                    await response.json();


                if (!response.ok) {

                    throw new Error(
                        result.error ||
                        "Could not create ticket"
                    );

                }


                await loadTickets();


                closeModal(
                    "ticketModal"
                );


                renderDashboard();

                renderTickets();


            } catch (error) {

                alert(
                    "Could not create ticket: " +
                    error.message
                );

            }

        }
    );

$("addCustomerButton").onclick = function () {
    $("customerForm").reset();
    openModal("customerModal");
};

$("cancelCustomerButton").onclick = function () {
    closeModal("customerModal");
};

$("customerForm").addEventListener(
    "submit",
    async function (event) {
        event.preventDefault();

        const data = {
            id: crypto.randomUUID(),
            company: $("customerCompany").value.trim(),
            contactName: $("customerContactName").value.trim(),
            email: $("customerEmail").value.trim(),
            phone: $("customerPhone").value.trim()
        };

        try {
            const response = await authFetch(
                `${API_URL}/customers`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(data)
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Could not create customer");
            }

            await loadCustomers();
            closeModal("customerModal");
            renderCustomers();
        } catch (error) {
            alert("Could not create customer: " + error.message);
        }
    }
);


document
    .querySelectorAll(
        ".modal"
    )
    .forEach(
        function (modal) {

            modal.addEventListener(
                "click",
                function (event) {

                    if (
                        event.target === modal
                    ) {

                        modal.classList.remove(
                            "open"
                        );

                    }

                }
            );

        }
    );


/* START */

async function startApplication() {

    const validSession =
        await loadCurrentUser();


    if (validSession) {

        await showApplication();

    } else {

        showLogin();

    }
}


startApplication();

async function loadTickets() {

    try {

        const response =
            await authFetch(
                `${API_URL}/tickets`
            );


        if (!response.ok) {

            throw new Error(
                "Could not load tickets"
            );

        }


        tickets =
            await response.json();


    } catch (error) {

        console.error(
            "Tickets API error:",
            error
        );


        tickets = [];

    }

}