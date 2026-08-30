const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const db = require("./database");

const authRoutes =
    require("./authRoutes");

const {
    authenticateToken,
    requireRole
} = require("./middleware/auth");

const app = express();

const PORT =
    process.env.PORT || 3000;


app.set(
    "trust proxy",
    1
);


app.use(
    helmet()
);

app.use(
    cors()
);

app.use(
    express.json()
);

app.use(
    "/api/auth",
    authRoutes
);

app.use(
    "/api",
    authenticateToken
);


/* TEST ROUTE */

app.get(
    "/",
    function (req, res) {

        res.send(
            "ServiceDesk API is running."
        );

    }
);


app.get(
    "/api/status",
    function (req, res) {

        res.json({
            success: true,
            message:
                "ServiceDesk backend is online"
        });

    }
);

/* =========================================================
   CUSTOMERS
========================================================= */

/* GET ALL CUSTOMERS */
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

/* CREATE CUSTOMER */
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

            await db.query(`
                INSERT INTO customers (
                    id,
                    company,
                    contact_name,
                    email,
                    phone
                )
                VALUES (?, ?, ?, ?, ?)
            `, [
                id,
                company || null,
                contactName,
                email || null,
                phone || null
            ]);

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
   TICKETS
========================================================= */

app.get(
    "/api/tickets",
    async function (req, res) {

        try {

            let sql = `
                SELECT
                    t.id,
                    t.title,
                    t.description,
                    t.priority,
                    t.status,

                    DATE_FORMAT(
                        t.sla_deadline,
                        '%Y-%m-%d %H:%i:%s'
                    ) AS slaDeadline,

                    DATE_FORMAT(
                        t.created_at,
                        '%Y-%m-%d'
                    ) AS createdAt,

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
                    WHERE
                        t.assigned_user_id = ?
                        OR t.assigned_user_id IS NULL
                `;

                params.push(
                    req.user.id
                );
            }


            if (req.user.role === "customer") {

                sql += `
                    WHERE
                        c.user_id = ?
                `;

                params.push(
                    req.user.id
                );
            }


            sql += `
                ORDER BY t.created_at DESC
            `;


            const [rows] =
                await db.query(
                    sql,
                    params
                );


            res.json(rows);


        } catch (error) {

            console.error(
                "GET tickets error:",
                error
            );


            res.status(500).json({
                error:
                    "Failed to load tickets"
            });

        }

    }
);

app.post(
    "/api/tickets",
    async function (req, res) {

        try {

            const {
                id,
                customerId,
                title,
                description,
                priority
            } = req.body;


            if (
                !id ||
                !title ||
                !description
            ) {

                return res.status(400).json({
                    error:
                        "Missing required ticket data"
                });

            }


            let finalCustomerId =
                customerId;


            if (
                req.user.role === "customer"
            ) {

                const [rows] =
                    await db.query(
                        `
                        SELECT id

                        FROM customers

                        WHERE user_id = ?

                        LIMIT 1
                        `,
                        [
                            req.user.id
                        ]
                    );


                if (
                    rows.length === 0
                ) {

                    return res.status(400).json({
                        error:
                            "Customer profile not found"
                    });

                }


                finalCustomerId =
                    rows[0].id;

            }


            if (!finalCustomerId) {

                return res.status(400).json({
                    error:
                        "Customer is required"
                });

            }


            await db.query(
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


            res.status(201).json({
                success: true,
                message:
                    "Ticket created"
            });


        } catch (error) {

            console.error(
                "POST ticket error:",
                error
            );


            res.status(500).json({
                error:
                    "Failed to create ticket"
            });

        }

    }
);

app.put(
    "/api/tickets/:id",

    requireRole(
        "admin",
        "technician"
    ),

    async function (req, res) {

        try {

            const id =
                req.params.id;


            const {
                assignedUserId,
                priority,
                status,
                slaDeadline
            } = req.body;


            const [result] =
                await db.query(
                    `
                    UPDATE tickets

                    SET
                        assigned_user_id = ?,
                        priority = ?,
                        status = ?,
                        sla_deadline = ?

                    WHERE id = ?
                    `,
                    [
                        assignedUserId || null,
                        priority,
                        status,
                        slaDeadline || null,
                        id
                    ]
                );


            if (
                result.affectedRows === 0
            ) {

                return res.status(404).json({
                    error:
                        "Ticket not found"
                });

            }


            res.json({
                success: true,
                message:
                    "Ticket updated"
            });


        } catch (error) {

            console.error(
                "PUT ticket error:",
                error
            );


            res.status(500).json({
                error:
                    "Failed to update ticket"
            });

        }

    }
);

app.delete(
    "/api/tickets/:id",

    requireRole(
        "admin"
    ),

    async function (req, res) {

        try {

            const [result] =
                await db.query(
                    `
                    DELETE FROM tickets
                    WHERE id = ?
                    `,
                    [
                        req.params.id
                    ]
                );


            if (
                result.affectedRows === 0
            ) {

                return res.status(404).json({
                    error:
                        "Ticket not found"
                });

            }


            res.json({
                success: true,
                message:
                    "Ticket deleted"
            });


        } catch (error) {

            console.error(
                "DELETE ticket error:",
                error
            );


            res.status(500).json({
                error:
                    "Failed to delete ticket"
            });

        }

    }
);

app.listen(
    PORT,
    function () {

        console.log(
            `ServiceDesk API running on http://localhost:${PORT}`
        );

    }
);