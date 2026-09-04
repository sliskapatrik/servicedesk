const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");

const db = require("./database");
const authRoutes = require("./authRoutes");

const {
    authenticateToken,
    requireRole
} = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

const TICKET_STATUSES = [
    "New",
    "Open",
    "In Progress",
    "Waiting for Customer",
    "Resolved",
    "Closed"
];

const TICKET_PRIORITIES = [
    "Low",
    "Medium",
    "High",
    "Critical"
];

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api", authenticateToken);

app.get("/", function (req, res) {
    res.send("ServiceDesk API is running.");
});

app.get("/api/status", function (req, res) {
    res.json({
        success: true,
        message: "ServiceDesk backend is online"
    });
});

function canAccessTicket(user, ticket) {
    if (user.role === "admin") {
        return true;
    }

    if (user.role === "technician") {
        return !ticket.assigned_user_id ||
            ticket.assigned_user_id === user.id;
    }

    if (user.role === "customer") {
        return ticket.customer_user_id === user.id;
    }

    return false;
}

async function getTicketAccessRow(ticketId) {
    const [rows] = await db.query(
        `
        SELECT
            t.id,
            t.assigned_user_id,
            c.user_id AS customer_user_id
        FROM tickets t
        INNER JOIN customers c
            ON c.id = t.customer_id
        WHERE t.id = ?
        LIMIT 1
        `,
        [ticketId]
    );

    return rows[0] || null;
}

async function addHistory(
    connection,
    ticketId,
    userId,
    action,
    oldValue,
    newValue
) {
    await connection.query(
        `
        INSERT INTO ticket_history (
            id,
            ticket_id,
            user_id,
            action,
            old_value,
            new_value
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            crypto.randomUUID(),
            ticketId,
            userId || null,
            action,
            oldValue ?? null,
            newValue ?? null
        ]
    );
}

/* =========================================================
   CUSTOMERS
========================================================= */

app.get(
    "/api/customers",
    requireRole("admin", "technician"),
    async function (req, res) {
        try {
            const [rows] = await db.query(`
                SELECT
                    id,
                    user_id AS userId,
                    company,
                    contact_name AS contactName,
                    email,
                    phone,
                    created_at AS createdAt
                FROM customers
                ORDER BY company, contact_name
            `);

            res.json(rows);
        } catch (error) {
            console.error("GET customers error:", error);
            res.status(500).json({
                error: "Failed to load customers"
            });
        }
    }
);

app.post(
    "/api/customers",
    requireRole("admin", "technician"),
    async function (req, res) {
        try {
            const {
                id,
                company,
                contactName,
                email,
                phone
            } = req.body;

            if (!id || !contactName) {
                return res.status(400).json({
                    error: "Customer ID and contact name are required"
                });
            }

            await db.query(
                `
                INSERT INTO customers (
                    id,
                    company,
                    contact_name,
                    email,
                    phone
                )
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    id,
                    company || null,
                    contactName,
                    email || null,
                    phone || null
                ]
            );

            res.status(201).json({
                success: true,
                message: "Customer created"
            });
        } catch (error) {
            console.error("POST customer error:", error);
            res.status(500).json({
                error: "Failed to create customer"
            });
        }
    }
);

/* =========================================================
   TECHNICIANS
========================================================= */

app.get(
    "/api/technicians",
    requireRole("admin", "technician"),
    async function (req, res) {
        try {
            const [rows] = await db.query(`
                SELECT
                    id,
                    name,
                    email,
                    status
                FROM users
                WHERE role = 'technician'
                  AND status = 'active'
                ORDER BY name
            `);

            res.json(rows);
        } catch (error) {
            console.error("GET technicians error:", error);
            res.status(500).json({
                error: "Failed to load technicians"
            });
        }
    }
);

/* =========================================================
   TICKETS
========================================================= */

app.get("/api/tickets", async function (req, res) {
    try {
        let sql = `
            SELECT
                t.id,
                t.title,
                t.description,
                t.priority,
                t.status,
                DATE_FORMAT(t.sla_deadline, '%Y-%m-%d %H:%i:%s') AS slaDeadline,
                DATE_FORMAT(t.resolved_at, '%Y-%m-%d %H:%i:%s') AS resolvedAt,
                DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
                DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt,
                c.id AS customerId,
                c.company,
                c.contact_name AS customerName,
                u.id AS technicianId,
                u.name AS technician
            FROM tickets t
            INNER JOIN customers c
                ON c.id = t.customer_id
            LEFT JOIN users u
                ON u.id = t.assigned_user_id
        `;

        const params = [];

        if (req.user.role === "technician") {
            sql += `
                WHERE t.assigned_user_id = ?
                   OR t.assigned_user_id IS NULL
            `;
            params.push(req.user.id);
        } else if (req.user.role === "customer") {
            sql += `
                WHERE c.user_id = ?
            `;
            params.push(req.user.id);
        }

        sql += ` ORDER BY t.created_at DESC `;

        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error("GET tickets error:", error);
        res.status(500).json({
            error: "Failed to load tickets"
        });
    }
});

app.get("/api/tickets/:id", async function (req, res) {
    try {
        const [rows] = await db.query(
            `
            SELECT
                t.id,
                t.customer_id AS customerId,
                t.assigned_user_id AS technicianId,
                t.title,
                t.description,
                t.priority,
                t.status,
                DATE_FORMAT(t.sla_deadline, '%Y-%m-%d %H:%i:%s') AS slaDeadline,
                DATE_FORMAT(t.resolved_at, '%Y-%m-%d %H:%i:%s') AS resolvedAt,
                DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
                DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt,
                c.company,
                c.contact_name AS customerName,
                c.email AS customerEmail,
                c.phone AS customerPhone,
                c.user_id AS customerUserId,
                u.name AS technician,
                u.email AS technicianEmail
            FROM tickets t
            INNER JOIN customers c
                ON c.id = t.customer_id
            LEFT JOIN users u
                ON u.id = t.assigned_user_id
            WHERE t.id = ?
            LIMIT 1
            `,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Ticket not found"
            });
        }

        const accessTicket = {
            assigned_user_id: rows[0].technicianId,
            customer_user_id: rows[0].customerUserId
        };

        if (!canAccessTicket(req.user, accessTicket)) {
            return res.status(403).json({
                error: "Access denied"
            });
        }

        const commentParams = [req.params.id];
        let commentVisibility = "";

        if (req.user.role === "customer") {
            commentVisibility = " AND cm.is_internal = 0 ";
        }

        const [comments] = await db.query(
            `
            SELECT
                cm.id,
                cm.message,
                cm.is_internal AS isInternal,
                DATE_FORMAT(cm.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
                u.id AS userId,
                u.name AS userName,
                u.role AS userRole
            FROM comments cm
            INNER JOIN users u
                ON u.id = cm.user_id
            WHERE cm.ticket_id = ?
            ${commentVisibility}
            ORDER BY cm.created_at ASC
            `,
            commentParams
        );

        const [history] = await db.query(
            `
            SELECT
                h.id,
                h.action,
                h.old_value AS oldValue,
                h.new_value AS newValue,
                DATE_FORMAT(h.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
                u.name AS userName
            FROM ticket_history h
            LEFT JOIN users u
                ON u.id = h.user_id
            WHERE h.ticket_id = ?
            ORDER BY h.created_at DESC
            `,
            [req.params.id]
        );

        res.json({
            ticket: rows[0],
            comments,
            history
        });
    } catch (error) {
        console.error("GET ticket detail error:", error);
        res.status(500).json({
            error: "Failed to load ticket"
        });
    }
});

app.post("/api/tickets", async function (req, res) {
    const connection = await db.getConnection();

    try {
        const {
            id,
            customerId,
            title,
            description,
            priority
        } = req.body;

        if (!id || !title || !description) {
            return res.status(400).json({
                error: "Missing required ticket data"
            });
        }

        if (!TICKET_PRIORITIES.includes(priority || "Medium")) {
            return res.status(400).json({
                error: "Invalid priority"
            });
        }

        let finalCustomerId = customerId;

        if (req.user.role === "customer") {
            const [customerRows] = await connection.query(
                `
                SELECT id
                FROM customers
                WHERE user_id = ?
                LIMIT 1
                `,
                [req.user.id]
            );

            if (customerRows.length === 0) {
                return res.status(400).json({
                    error: "Customer profile not found"
                });
            }

            finalCustomerId = customerRows[0].id;
        }

        if (!finalCustomerId) {
            return res.status(400).json({
                error: "Customer is required"
            });
        }

        await connection.beginTransaction();

        await connection.query(
            `
            INSERT INTO tickets (
                id,
                customer_id,
                title,
                description,
                priority,
                status
            )
            VALUES (?, ?, ?, ?, ?, 'New')
            `,
            [
                id,
                finalCustomerId,
                title,
                description,
                priority || "Medium"
            ]
        );

        await addHistory(
            connection,
            id,
            req.user.id,
            "Ticket created",
            null,
            "New"
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            message: "Ticket created",
            id
        });
    } catch (error) {
        await connection.rollback();
        console.error("POST ticket error:", error);
        res.status(500).json({
            error: "Failed to create ticket"
        });
    } finally {
        connection.release();
    }
});

app.put("/api/tickets/:id", requireRole("admin", "technician"), async function (req, res) {
    const connection = await db.getConnection();

    try {
        const ticketId = req.params.id;
        const accessRow = await getTicketAccessRow(ticketId);

        if (!accessRow) {
            return res.status(404).json({
                error: "Ticket not found"
            });
        }

        if (!canAccessTicket(req.user, accessRow)) {
            return res.status(403).json({
                error: "Access denied"
            });
        }

        const [currentRows] = await connection.query(
            `
            SELECT
                assigned_user_id,
                priority,
                status,
                sla_deadline
            FROM tickets
            WHERE id = ?
            LIMIT 1
            `,
            [ticketId]
        );

        const current = currentRows[0];

        const assignedUserId = Object.prototype.hasOwnProperty.call(req.body, "assignedUserId")
            ? (req.body.assignedUserId || null)
            : current.assigned_user_id;

        const priority = req.body.priority || current.priority;
        const status = req.body.status || current.status;
        const slaDeadline = Object.prototype.hasOwnProperty.call(req.body, "slaDeadline")
            ? (req.body.slaDeadline || null)
            : current.sla_deadline;

        if (!TICKET_PRIORITIES.includes(priority)) {
            return res.status(400).json({
                error: "Invalid priority"
            });
        }

        if (!TICKET_STATUSES.includes(status)) {
            return res.status(400).json({
                error: "Invalid status"
            });
        }

        if (req.user.role === "technician") {
            if (
                assignedUserId &&
                assignedUserId !== req.user.id
            ) {
                return res.status(403).json({
                    error: "Technicians can only assign tickets to themselves"
                });
            }

            if (
                current.assigned_user_id &&
                current.assigned_user_id !== req.user.id
            ) {
                return res.status(403).json({
                    error: "This ticket is assigned to another technician"
                });
            }
        }

        if (assignedUserId) {
            const [technicianRows] = await connection.query(
                `
                SELECT id
                FROM users
                WHERE id = ?
                  AND role = 'technician'
                  AND status = 'active'
                LIMIT 1
                `,
                [assignedUserId]
            );

            if (technicianRows.length === 0) {
                return res.status(400).json({
                    error: "Selected technician is not available"
                });
            }
        }

        await connection.beginTransaction();

        const resolvedAt = ["Resolved", "Closed"].includes(status)
            ? new Date()
            : null;

        await connection.query(
            `
            UPDATE tickets
            SET
                assigned_user_id = ?,
                priority = ?,
                status = ?,
                sla_deadline = ?,
                resolved_at = ?
            WHERE id = ?
            `,
            [
                assignedUserId,
                priority,
                status,
                slaDeadline,
                resolvedAt,
                ticketId
            ]
        );

        if ((current.assigned_user_id || null) !== (assignedUserId || null)) {
            await addHistory(
                connection,
                ticketId,
                req.user.id,
                "Technician changed",
                current.assigned_user_id || "Unassigned",
                assignedUserId || "Unassigned"
            );
        }

        if (current.priority !== priority) {
            await addHistory(
                connection,
                ticketId,
                req.user.id,
                "Priority changed",
                current.priority,
                priority
            );
        }

        if (current.status !== status) {
            await addHistory(
                connection,
                ticketId,
                req.user.id,
                "Status changed",
                current.status,
                status
            );
        }

        const currentSla = current.sla_deadline
            ? new Date(current.sla_deadline).toISOString()
            : null;

        const nextSla = slaDeadline
            ? new Date(slaDeadline).toISOString()
            : null;

        if (currentSla !== nextSla) {
            await addHistory(
                connection,
                ticketId,
                req.user.id,
                "SLA deadline changed",
                currentSla,
                nextSla
            );
        }

        await connection.commit();

        res.json({
            success: true,
            message: "Ticket updated"
        });
    } catch (error) {
        await connection.rollback();
        console.error("PUT ticket error:", error);
        res.status(500).json({
            error: "Failed to update ticket"
        });
    } finally {
        connection.release();
    }
});

app.post("/api/tickets/:id/comments", async function (req, res) {
    const connection = await db.getConnection();

    try {
        const ticketId = req.params.id;
        const { message, isInternal } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({
                error: "Comment cannot be empty"
            });
        }

        const accessRow = await getTicketAccessRow(ticketId);

        if (!accessRow) {
            return res.status(404).json({
                error: "Ticket not found"
            });
        }

        if (!canAccessTicket(req.user, accessRow)) {
            return res.status(403).json({
                error: "Access denied"
            });
        }

        const finalIsInternal =
            req.user.role === "customer"
                ? 0
                : (isInternal ? 1 : 0);

        await connection.beginTransaction();

        await connection.query(
            `
            INSERT INTO comments (
                id,
                ticket_id,
                user_id,
                message,
                is_internal
            )
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                crypto.randomUUID(),
                ticketId,
                req.user.id,
                message.trim(),
                finalIsInternal
            ]
        );

        await addHistory(
            connection,
            ticketId,
            req.user.id,
            finalIsInternal ? "Internal note added" : "Comment added",
            null,
            null
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            message: "Comment added"
        });
    } catch (error) {
        await connection.rollback();
        console.error("POST comment error:", error);
        res.status(500).json({
            error: "Failed to add comment"
        });
    } finally {
        connection.release();
    }
});

app.delete(
    "/api/tickets/:id",
    requireRole("admin"),
    async function (req, res) {
        try {
            const [result] = await db.query(
                `
                DELETE FROM tickets
                WHERE id = ?
                `,
                [req.params.id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "Ticket not found"
                });
            }

            res.json({
                success: true,
                message: "Ticket deleted"
            });
        } catch (error) {
            console.error("DELETE ticket error:", error);
            res.status(500).json({
                error: "Failed to delete ticket"
            });
        }
    }
);

app.listen(PORT, function () {
    console.log(`ServiceDesk API running on http://localhost:${PORT}`);
});
