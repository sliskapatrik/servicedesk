const express = require("express");
const crypto = require("crypto");
const db = require("./database");
const { requireRole } = require("./middleware/auth");

const router = express.Router();
const STATUSES = ["New", "Open", "In Progress", "Waiting for Customer", "Resolved", "Closed"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];

async function getTicketAccess(ticketId) {
    const [rows] = await db.query(`
        SELECT t.id, t.assigned_user_id, c.user_id AS customer_user_id
        FROM tickets t
        INNER JOIN customers c ON c.id = t.customer_id
        WHERE t.id = ? LIMIT 1
    `, [ticketId]);
    return rows[0] || null;
}

function canAccess(user, ticket) {
    if (!ticket) return false;
    if (user.role === "admin") return true;
    if (user.role === "technician") return !ticket.assigned_user_id || ticket.assigned_user_id === user.id;
    return user.role === "customer" && ticket.customer_user_id === user.id;
}

/* CANNED REPLIES */
router.get("/canned-replies", requireRole("admin", "technician"), async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT cr.id, cr.title, cr.body, cr.created_by AS createdBy,
                   u.name AS createdByName,
                   DATE_FORMAT(cr.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
            FROM canned_replies cr
            LEFT JOIN users u ON u.id = cr.created_by
            WHERE cr.is_active = 1
            ORDER BY cr.title
        `);
        res.json(rows);
    } catch (error) {
        console.error("GET canned replies error:", error);
        res.status(500).json({ error: "Failed to load canned replies" });
    }
});

router.post("/canned-replies", requireRole("admin", "technician"), async (req, res) => {
    try {
        const title = String(req.body.title || "").trim();
        const body = String(req.body.body || "").trim();
        if (!title || !body) return res.status(400).json({ error: "Title and reply text are required" });
        const id = crypto.randomUUID();
        await db.query(`INSERT INTO canned_replies (id, title, body, created_by) VALUES (?, ?, ?, ?)`, [id, title, body, req.user.id]);
        res.status(201).json({ id, success: true });
    } catch (error) {
        console.error("POST canned reply error:", error);
        res.status(500).json({ error: "Failed to create canned reply" });
    }
});

router.put("/canned-replies/:id", requireRole("admin", "technician"), async (req, res) => {
    try {
        const title = String(req.body.title || "").trim();
        const body = String(req.body.body || "").trim();
        if (!title || !body) return res.status(400).json({ error: "Title and reply text are required" });
        const [owned] = await db.query(`SELECT created_by FROM canned_replies WHERE id = ?`, [req.params.id]);
        if (!owned.length) return res.status(404).json({ error: "Canned reply not found" });
        if (req.user.role !== "admin" && owned[0].created_by !== req.user.id) return res.status(403).json({ error: "Access denied" });
        await db.query(`UPDATE canned_replies SET title = ?, body = ? WHERE id = ?`, [title, body, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error("PUT canned reply error:", error);
        res.status(500).json({ error: "Failed to update canned reply" });
    }
});

router.delete("/canned-replies/:id", requireRole("admin", "technician"), async (req, res) => {
    try {
        const [owned] = await db.query(`SELECT created_by FROM canned_replies WHERE id = ?`, [req.params.id]);
        if (!owned.length) return res.status(404).json({ error: "Canned reply not found" });
        if (req.user.role !== "admin" && owned[0].created_by !== req.user.id) return res.status(403).json({ error: "Access denied" });
        await db.query(`UPDATE canned_replies SET is_active = 0 WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error("DELETE canned reply error:", error);
        res.status(500).json({ error: "Failed to delete canned reply" });
    }
});

/* TICKET TEMPLATES */
router.get("/ticket-templates", requireRole("admin", "technician"), async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT tt.id, tt.name, tt.title, tt.description, tt.priority,
                   tt.category_id AS categoryId, tt.tag_ids_json AS tagIdsJson,
                   tt.created_by AS createdBy, u.name AS createdByName
            FROM ticket_templates tt
            LEFT JOIN users u ON u.id = tt.created_by
            WHERE tt.is_active = 1
            ORDER BY tt.name
        `);
        rows.forEach((row) => {
            try { row.tagIds = JSON.parse(row.tagIdsJson || "[]"); } catch { row.tagIds = []; }
            delete row.tagIdsJson;
        });
        res.json(rows);
    } catch (error) {
        console.error("GET templates error:", error);
        res.status(500).json({ error: "Failed to load ticket templates" });
    }
});

router.post("/ticket-templates", requireRole("admin", "technician"), async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const title = String(req.body.title || "").trim();
        const description = String(req.body.description || "").trim();
        const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : "Medium";
        const categoryId = req.body.categoryId || null;
        const tagIds = Array.isArray(req.body.tagIds) ? [...new Set(req.body.tagIds.filter(Boolean))] : [];
        if (!name || !title || !description) return res.status(400).json({ error: "Name, title and description are required" });
        const id = crypto.randomUUID();
        await db.query(`
            INSERT INTO ticket_templates (id, name, title, description, priority, category_id, tag_ids_json, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, name, title, description, priority, categoryId, JSON.stringify(tagIds), req.user.id]);
        res.status(201).json({ id, success: true });
    } catch (error) {
        console.error("POST template error:", error);
        res.status(500).json({ error: "Failed to create ticket template" });
    }
});

router.put("/ticket-templates/:id", requireRole("admin", "technician"), async (req, res) => {
    try {
        const [owned] = await db.query(`SELECT created_by FROM ticket_templates WHERE id = ?`, [req.params.id]);
        if (!owned.length) return res.status(404).json({ error: "Template not found" });
        if (req.user.role !== "admin" && owned[0].created_by !== req.user.id) return res.status(403).json({ error: "Access denied" });
        const name = String(req.body.name || "").trim();
        const title = String(req.body.title || "").trim();
        const description = String(req.body.description || "").trim();
        const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : "Medium";
        const categoryId = req.body.categoryId || null;
        const tagIds = Array.isArray(req.body.tagIds) ? [...new Set(req.body.tagIds.filter(Boolean))] : [];
        if (!name || !title || !description) return res.status(400).json({ error: "Name, title and description are required" });
        await db.query(`
            UPDATE ticket_templates SET name = ?, title = ?, description = ?, priority = ?, category_id = ?, tag_ids_json = ?
            WHERE id = ?
        `, [name, title, description, priority, categoryId, JSON.stringify(tagIds), req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error("PUT template error:", error);
        res.status(500).json({ error: "Failed to update ticket template" });
    }
});

router.delete("/ticket-templates/:id", requireRole("admin", "technician"), async (req, res) => {
    try {
        const [owned] = await db.query(`SELECT created_by FROM ticket_templates WHERE id = ?`, [req.params.id]);
        if (!owned.length) return res.status(404).json({ error: "Template not found" });
        if (req.user.role !== "admin" && owned[0].created_by !== req.user.id) return res.status(403).json({ error: "Access denied" });
        await db.query(`UPDATE ticket_templates SET is_active = 0 WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error("DELETE template error:", error);
        res.status(500).json({ error: "Failed to delete ticket template" });
    }
});

/* WATCHERS */
router.get("/tickets/:id/watchers", async (req, res) => {
    try {
        const access = await getTicketAccess(req.params.id);
        if (!canAccess(req.user, access)) return res.status(access ? 403 : 404).json({ error: access ? "Access denied" : "Ticket not found" });
        const [rows] = await db.query(`
            SELECT tw.user_id AS userId, u.name, u.role
            FROM ticket_watchers tw
            INNER JOIN users u ON u.id = tw.user_id
            WHERE tw.ticket_id = ? ORDER BY u.name
        `, [req.params.id]);
        res.json({ watchers: rows, watching: rows.some((row) => row.userId === req.user.id) });
    } catch (error) {
        console.error("GET watchers error:", error);
        res.status(500).json({ error: "Failed to load watchers" });
    }
});

router.post("/tickets/:id/watchers/self", async (req, res) => {
    try {
        const access = await getTicketAccess(req.params.id);
        if (!canAccess(req.user, access)) return res.status(access ? 403 : 404).json({ error: access ? "Access denied" : "Ticket not found" });
        await db.query(`INSERT IGNORE INTO ticket_watchers (ticket_id, user_id) VALUES (?, ?)`, [req.params.id, req.user.id]);
        res.status(201).json({ success: true });
    } catch (error) {
        console.error("POST watcher error:", error);
        res.status(500).json({ error: "Failed to watch ticket" });
    }
});

router.delete("/tickets/:id/watchers/self", async (req, res) => {
    try {
        await db.query(`DELETE FROM ticket_watchers WHERE ticket_id = ? AND user_id = ?`, [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (error) {
        console.error("DELETE watcher error:", error);
        res.status(500).json({ error: "Failed to stop watching ticket" });
    }
});

/* BULK UPDATE */
router.post("/tickets/bulk-update", requireRole("admin", "technician"), async (req, res) => {
    const connection = await db.getConnection();
    try {
        const ticketIds = Array.isArray(req.body.ticketIds) ? [...new Set(req.body.ticketIds.filter(Boolean))].slice(0, 50) : [];
        if (!ticketIds.length) return res.status(400).json({ error: "Select at least one ticket" });
        const status = req.body.status && STATUSES.includes(req.body.status) ? req.body.status : null;
        const priority = req.body.priority && PRIORITIES.includes(req.body.priority) ? req.body.priority : null;
        const assignedUserId = Object.prototype.hasOwnProperty.call(req.body, "assignedUserId") ? (req.body.assignedUserId || null) : undefined;
        if (req.user.role === "technician" && assignedUserId !== undefined && assignedUserId !== null && assignedUserId !== req.user.id) {
            return res.status(403).json({ error: "Technicians can only assign selected tickets to themselves" });
        }
        if (!status && !priority && assignedUserId === undefined) return res.status(400).json({ error: "Choose a bulk change" });

        await connection.beginTransaction();
        let updated = 0;
        for (const ticketId of ticketIds) {
            const [rows] = await connection.query(`SELECT assigned_user_id FROM tickets WHERE id = ? LIMIT 1`, [ticketId]);
            if (!rows.length) continue;
            if (req.user.role === "technician" && rows[0].assigned_user_id && rows[0].assigned_user_id !== req.user.id) continue;
            const fields = [];
            const params = [];
            if (status) { fields.push("status = ?"); params.push(status); if (["Resolved", "Closed"].includes(status)) fields.push("resolved_at = COALESCE(resolved_at, NOW())"); else fields.push("resolved_at = NULL"); }
            if (priority) { fields.push("priority = ?"); params.push(priority); }
            if (assignedUserId !== undefined) { fields.push("assigned_user_id = ?"); params.push(assignedUserId); }
            params.push(ticketId);
            await connection.query(`UPDATE tickets SET ${fields.join(", ")} WHERE id = ?`, params);
            await connection.query(`INSERT INTO ticket_history (id, ticket_id, user_id, action, old_value, new_value) VALUES (?, ?, ?, 'Bulk update', NULL, ?)`, [crypto.randomUUID(), ticketId, req.user.id, JSON.stringify({ status, priority, assignedUserId })]);
            updated++;
        }
        await connection.commit();
        res.json({ success: true, updated });
    } catch (error) {
        await connection.rollback();
        console.error("BULK update error:", error);
        res.status(500).json({ error: "Failed to update selected tickets" });
    } finally {
        connection.release();
    }
});

module.exports = router;
