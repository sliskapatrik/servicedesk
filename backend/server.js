const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const multer = require("multer");

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

const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadsDir);
        },
        filename: function (req, file, cb) {
            const safeExt = path.extname(file.originalname).slice(0, 16);
            cb(null, `${crypto.randomUUID()}${safeExt}`);
        }
    }),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

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
   USERS
========================================================= */

app.get(
    "/api/users",
    requireRole("admin"),
    async function (req, res) {
        try {
            const [rows] = await db.query(`
                SELECT
                    u.id,
                    u.name,
                    u.email,
                    u.role,
                    u.status,
                    DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
                    c.id AS customerProfileId,
                    c.company AS customerCompany,
                    c.contact_name AS customerContactName
                FROM users u
                LEFT JOIN customers c
                    ON c.user_id = u.id
                ORDER BY u.created_at DESC
            `);

            res.json(rows);
        } catch (error) {
            console.error("GET users error:", error);
            res.status(500).json({ error: "Failed to load users" });
        }
    }
);

app.post(
    "/api/users",
    requireRole("admin"),
    async function (req, res) {
        try {
            const { name, email, password, role, status } = req.body;
            const allowedRoles = ["admin", "technician", "customer"];
            const allowedStatuses = ["active", "inactive"];

            if (!name || !email || !password || !allowedRoles.includes(role)) {
                return res.status(400).json({ error: "Name, email, password and valid role are required" });
            }

            if (password.length < 8) {
                return res.status(400).json({ error: "Password must be at least 8 characters" });
            }

            const id = crypto.randomUUID();
            const passwordHash = await bcrypt.hash(password, 12);

            await db.query(
                `
                INSERT INTO users (
                    id, name, email, password_hash, role, status
                )
                VALUES (?, ?, ?, ?, ?, ?)
                `,
                [
                    id,
                    name.trim(),
                    email.trim().toLowerCase(),
                    passwordHash,
                    role,
                    allowedStatuses.includes(status) ? status : "active"
                ]
            );

            res.status(201).json({ success: true, id, message: "User created" });
        } catch (error) {
            console.error("POST user error:", error);
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ error: "A user with this email already exists" });
            }
            res.status(500).json({ error: "Failed to create user" });
        }
    }
);

app.put(
    "/api/users/:id",
    requireRole("admin"),
    async function (req, res) {
        try {
            const { name, email, role, status } = req.body;
            const allowedRoles = ["admin", "technician", "customer"];
            const allowedStatuses = ["active", "inactive"];

            if (!name || !email || !allowedRoles.includes(role) || !allowedStatuses.includes(status)) {
                return res.status(400).json({ error: "Invalid user data" });
            }

            if (req.params.id === req.user.id && status !== "active") {
                return res.status(400).json({ error: "You cannot deactivate your own account" });
            }

            if (req.params.id === req.user.id && role !== "admin") {
                return res.status(400).json({ error: "You cannot remove your own admin role" });
            }

            if (role !== "customer") {
                await db.query(
                    `UPDATE customers SET user_id = NULL WHERE user_id = ?`,
                    [req.params.id]
                );
            }

            const [result] = await db.query(
                `
                UPDATE users
                SET name = ?, email = ?, role = ?, status = ?
                WHERE id = ?
                `,
                [name.trim(), email.trim().toLowerCase(), role, status, req.params.id]
            );

            if (!result.affectedRows) {
                return res.status(404).json({ error: "User not found" });
            }

            res.json({ success: true, message: "User updated" });
        } catch (error) {
            console.error("PUT user error:", error);
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ error: "A user with this email already exists" });
            }
            res.status(500).json({ error: "Failed to update user" });
        }
    }
);

app.post(
    "/api/users/:id/reset-password",
    requireRole("admin"),
    async function (req, res) {
        try {
            const { password } = req.body;
            if (!password || password.length < 8) {
                return res.status(400).json({ error: "Password must be at least 8 characters" });
            }

            const passwordHash = await bcrypt.hash(password, 12);
            const [result] = await db.query(
                `UPDATE users SET password_hash = ? WHERE id = ?`,
                [passwordHash, req.params.id]
            );

            if (!result.affectedRows) {
                return res.status(404).json({ error: "User not found" });
            }

            res.json({ success: true, message: "Password reset" });
        } catch (error) {
            console.error("RESET password error:", error);
            res.status(500).json({ error: "Failed to reset password" });
        }
    }
);

app.delete(
    "/api/users/:id",
    requireRole("admin"),
    async function (req, res) {
        try {
            if (req.params.id === req.user.id) {
                return res.status(400).json({ error: "You cannot delete your own account" });
            }

            const [activityRows] = await db.query(
                `
                SELECT
                    (SELECT COUNT(*) FROM comments WHERE user_id = ?) AS commentsCount,
                    (SELECT COUNT(*) FROM attachments WHERE user_id = ?) AS attachmentsCount
                `,
                [req.params.id, req.params.id]
            );

            const activity = activityRows[0];
            if (Number(activity.commentsCount) > 0 || Number(activity.attachmentsCount) > 0) {
                return res.status(409).json({
                    error: "This user has ticket activity. Deactivate the account instead of deleting it."
                });
            }

            const [result] = await db.query(`DELETE FROM users WHERE id = ?`, [req.params.id]);
            if (!result.affectedRows) {
                return res.status(404).json({ error: "User not found" });
            }

            res.json({ success: true, message: "User deleted" });
        } catch (error) {
            console.error("DELETE user error:", error);
            res.status(500).json({ error: "Failed to delete user" });
        }
    }
);

app.get(
    "/api/customer-users",
    requireRole("admin", "technician"),
    async function (req, res) {
        try {
            const [rows] = await db.query(`
                SELECT
                    u.id,
                    u.name,
                    u.email,
                    u.status,
                    c.id AS linkedCustomerId
                FROM users u
                LEFT JOIN customers c
                    ON c.user_id = u.id
                WHERE u.role = 'customer'
                ORDER BY u.name
            `);
            res.json(rows);
        } catch (error) {
            console.error("GET customer users error:", error);
            res.status(500).json({ error: "Failed to load customer accounts" });
        }
    }
);

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
                phone,
                userId
            } = req.body;

            if (!id || !contactName) {
                return res.status(400).json({
                    error: "Customer ID and contact name are required"
                });
            }

            if (userId) {
                const [userRows] = await db.query(
                    `SELECT id FROM users WHERE id = ? AND role = 'customer' LIMIT 1`,
                    [userId]
                );
                if (!userRows.length) {
                    return res.status(400).json({ error: "Selected account is not a customer account" });
                }
            }

            await db.query(
                `
                INSERT INTO customers (
                    id,
                    user_id,
                    company,
                    contact_name,
                    email,
                    phone
                )
                VALUES (?, ?, ?, ?, ?, ?)
                `,
                [
                    id,
                    userId || null,
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
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ error: "This customer account is already linked to another customer profile" });
            }
            res.status(500).json({
                error: "Failed to create customer"
            });
        }
    }
);

app.put(
    "/api/customers/:id",
    requireRole("admin", "technician"),
    async function (req, res) {
        try {
            const { company, contactName, email, phone, userId } = req.body;
            if (!contactName) {
                return res.status(400).json({ error: "Contact name is required" });
            }

            if (userId) {
                const [userRows] = await db.query(
                    `SELECT id FROM users WHERE id = ? AND role = 'customer' LIMIT 1`,
                    [userId]
                );
                if (!userRows.length) {
                    return res.status(400).json({ error: "Selected account is not a customer account" });
                }
            }

            const [result] = await db.query(
                `
                UPDATE customers
                SET user_id = ?, company = ?, contact_name = ?, email = ?, phone = ?
                WHERE id = ?
                `,
                [userId || null, company || null, contactName, email || null, phone || null, req.params.id]
            );

            if (!result.affectedRows) {
                return res.status(404).json({ error: "Customer not found" });
            }

            res.json({ success: true, message: "Customer updated" });
        } catch (error) {
            console.error("PUT customer error:", error);
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ error: "This customer account is already linked to another customer profile" });
            }
            res.status(500).json({ error: "Failed to update customer" });
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

        const [attachments] = await db.query(
            `
            SELECT
                a.id,
                a.file_name AS fileName,
                a.mime_type AS mimeType,
                a.file_size AS fileSize,
                DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
                u.name AS userName
            FROM attachments a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE a.ticket_id = ?
            ORDER BY a.created_at DESC
            `,
            [req.params.id]
        );

        res.json({
            ticket: rows[0],
            comments,
            history,
            attachments
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

app.post(
    "/api/tickets/:id/attachments",
    upload.single("file"),
    async function (req, res) {
        try {
            const ticketId = req.params.id;
            const accessRow = await getTicketAccessRow(ticketId);

            if (!accessRow) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(404).json({ error: "Ticket not found" });
            }

            if (!canAccessTicket(req.user, accessRow)) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(403).json({ error: "Access denied" });
            }

            if (!req.file) {
                return res.status(400).json({ error: "Select a file to upload" });
            }

            const attachmentId = crypto.randomUUID();
            await db.query(
                `
                INSERT INTO attachments (
                    id, ticket_id, user_id, file_name, file_path, mime_type, file_size
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    attachmentId,
                    ticketId,
                    req.user.id,
                    req.file.originalname,
                    req.file.filename,
                    req.file.mimetype || null,
                    req.file.size
                ]
            );

            res.status(201).json({ success: true, id: attachmentId, message: "Attachment uploaded" });
        } catch (error) {
            if (req.file) fs.unlink(req.file.path, () => {});
            console.error("POST attachment error:", error);
            if (error.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({ error: "File is too large. Maximum size is 10 MB." });
            }
            res.status(500).json({ error: "Failed to upload attachment" });
        }
    }
);

app.get("/api/attachments/:id/download", async function (req, res) {
    try {
        const [rows] = await db.query(
            `
            SELECT
                a.id,
                a.ticket_id,
                a.file_name,
                a.file_path,
                t.assigned_user_id,
                c.user_id AS customer_user_id
            FROM attachments a
            INNER JOIN tickets t ON t.id = a.ticket_id
            INNER JOIN customers c ON c.id = t.customer_id
            WHERE a.id = ?
            LIMIT 1
            `,
            [req.params.id]
        );

        if (!rows.length) {
            return res.status(404).json({ error: "Attachment not found" });
        }

        const item = rows[0];
        if (!canAccessTicket(req.user, item)) {
            return res.status(403).json({ error: "Access denied" });
        }

        const absolutePath = path.join(uploadsDir, item.file_path);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: "Stored file was not found" });
        }

        res.download(absolutePath, item.file_name);
    } catch (error) {
        console.error("DOWNLOAD attachment error:", error);
        res.status(500).json({ error: "Failed to download attachment" });
    }
});

app.delete(
    "/api/attachments/:id",
    requireRole("admin"),
    async function (req, res) {
        try {
            const [rows] = await db.query(`SELECT file_path FROM attachments WHERE id = ? LIMIT 1`, [req.params.id]);
            if (!rows.length) {
                return res.status(404).json({ error: "Attachment not found" });
            }

            await db.query(`DELETE FROM attachments WHERE id = ?`, [req.params.id]);
            const absolutePath = path.join(uploadsDir, rows[0].file_path);
            if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);

            res.json({ success: true, message: "Attachment deleted" });
        } catch (error) {
            console.error("DELETE attachment error:", error);
            res.status(500).json({ error: "Failed to delete attachment" });
        }
    }
);

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

app.use(function (error, req, res, next) {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ error: "File is too large. Maximum size is 10 MB." });
        }
        return res.status(400).json({ error: error.message });
    }
    next(error);
});

app.listen(PORT, function () {
    console.log(`ServiceDesk API running on http://localhost:${PORT}`);
});
