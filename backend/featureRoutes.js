const express = require("express");
const crypto = require("crypto");
const db = require("./database");
const { requireRole } = require("./middleware/auth");

const router = express.Router();

async function getAccess(ticketId) {
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

router.get("/categories", async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT id, name, description, is_active AS isActive FROM ticket_categories WHERE is_active = 1 ORDER BY name`);
        res.json(rows);
    } catch (error) {
        console.error("GET categories error:", error);
        res.status(500).json({ error: "Failed to load categories" });
    }
});

router.get("/tags", async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT id, name FROM tags ORDER BY name`);
        res.json(rows);
    } catch (error) {
        console.error("GET tags error:", error);
        res.status(500).json({ error: "Failed to load tags" });
    }
});

router.post("/tags", requireRole("admin", "technician"), async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        if (!name) return res.status(400).json({ error: "Tag name is required" });
        const id = crypto.randomUUID();
        await db.query(`INSERT INTO tags (id, name) VALUES (?, ?)`, [id, name]);
        res.status(201).json({ id, name });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Tag already exists" });
        console.error("POST tag error:", error);
        res.status(500).json({ error: "Failed to create tag" });
    }
});

router.get("/tickets/:id/tags", async (req, res) => {
    try {
        const access = await getAccess(req.params.id);
        if (!canAccess(req.user, access)) return res.status(access ? 403 : 404).json({ error: access ? "Access denied" : "Ticket not found" });
        const [rows] = await db.query(`
            SELECT tg.id, tg.name
            FROM ticket_tags tt
            INNER JOIN tags tg ON tg.id = tt.tag_id
            WHERE tt.ticket_id = ? ORDER BY tg.name
        `, [req.params.id]);
        res.json(rows);
    } catch (error) {
        console.error("GET ticket tags error:", error);
        res.status(500).json({ error: "Failed to load ticket tags" });
    }
});

router.put("/tickets/:id/tags", async (req, res) => {
    const connection = await db.getConnection();
    try {
        const access = await getAccess(req.params.id);
        if (!canAccess(req.user, access)) return res.status(access ? 403 : 404).json({ error: access ? "Access denied" : "Ticket not found" });
        const tagIds = Array.isArray(req.body.tagIds) ? [...new Set(req.body.tagIds.filter(Boolean))] : [];
        await connection.beginTransaction();
        await connection.query(`DELETE FROM ticket_tags WHERE ticket_id = ?`, [req.params.id]);
        for (const tagId of tagIds) {
            await connection.query(`INSERT INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)`, [req.params.id, tagId]);
        }
        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error("PUT ticket tags error:", error);
        res.status(500).json({ error: "Failed to update ticket tags" });
    } finally {
        connection.release();
    }
});

router.put("/tickets/:id/category", async (req, res) => {
    try {
        const access = await getAccess(req.params.id);
        if (!canAccess(req.user, access)) return res.status(access ? 403 : 404).json({ error: access ? "Access denied" : "Ticket not found" });
        const categoryId = req.body.categoryId || null;
        await db.query(`UPDATE tickets SET category_id = ? WHERE id = ?`, [categoryId, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error("PUT ticket category error:", error);
        res.status(500).json({ error: "Failed to update category" });
    }
});

router.get("/knowledge", async (req, res) => {
    try {
        const query = String(req.query.q || "").trim();
        const params = [];
        let sql = `
            SELECT a.id, a.title, a.summary, a.content, a.visibility, a.status,
                   a.category_id AS categoryId, c.name AS categoryName,
                   u.name AS authorName,
                   DATE_FORMAT(a.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
            FROM knowledge_articles a
            LEFT JOIN ticket_categories c ON c.id = a.category_id
            LEFT JOIN users u ON u.id = a.author_user_id
            WHERE 1 = 1
        `;
        if (req.user.role === "customer") sql += ` AND a.status = 'published' AND a.visibility = 'public' `;
        if (query) {
            sql += ` AND (a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ?) `;
            const pattern = `%${query}%`;
            params.push(pattern, pattern, pattern);
        }
        sql += ` ORDER BY a.updated_at DESC `;
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error("GET knowledge error:", error);
        res.status(500).json({ error: "Failed to load knowledge base" });
    }
});

router.post("/knowledge", requireRole("admin", "technician"), async (req, res) => {
    try {
        const { title, summary, content, visibility = "public", status = "published", categoryId } = req.body;
        if (!title || !content) return res.status(400).json({ error: "Title and content are required" });
        const id = crypto.randomUUID();
        await db.query(`
            INSERT INTO knowledge_articles (id, title, summary, content, visibility, status, category_id, author_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, title.trim(), summary || null, content, visibility, status, categoryId || null, req.user.id]);
        res.status(201).json({ id, success: true });
    } catch (error) {
        console.error("POST knowledge error:", error);
        res.status(500).json({ error: "Failed to create article" });
    }
});

router.put("/knowledge/:id", requireRole("admin", "technician"), async (req, res) => {
    try {
        const { title, summary, content, visibility = "public", status = "published", categoryId } = req.body;
        if (!title || !content) return res.status(400).json({ error: "Title and content are required" });
        const [result] = await db.query(`
            UPDATE knowledge_articles
            SET title = ?, summary = ?, content = ?, visibility = ?, status = ?, category_id = ?
            WHERE id = ?
        `, [title.trim(), summary || null, content, visibility, status, categoryId || null, req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ error: "Article not found" });
        res.json({ success: true });
    } catch (error) {
        console.error("PUT knowledge error:", error);
        res.status(500).json({ error: "Failed to update article" });
    }
});

router.delete("/knowledge/:id", requireRole("admin"), async (req, res) => {
    try {
        const [result] = await db.query(`DELETE FROM knowledge_articles WHERE id = ?`, [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ error: "Article not found" });
        res.json({ success: true });
    } catch (error) {
        console.error("DELETE knowledge error:", error);
        res.status(500).json({ error: "Failed to delete article" });
    }
});

router.get("/tickets/:id/articles", async (req, res) => {
    try {
        const access = await getAccess(req.params.id);
        if (!canAccess(req.user, access)) return res.status(access ? 403 : 404).json({ error: access ? "Access denied" : "Ticket not found" });
        const params = [req.params.id];
        let visibility = "";
        if (req.user.role === "customer") visibility = ` AND a.visibility = 'public' `;
        const [rows] = await db.query(`
            SELECT a.id, a.title, a.summary, a.visibility, c.name AS categoryName
            FROM ticket_articles ta
            INNER JOIN knowledge_articles a ON a.id = ta.article_id
            LEFT JOIN ticket_categories c ON c.id = a.category_id
            WHERE ta.ticket_id = ? ${visibility}
            ORDER BY a.title
        `, params);
        res.json(rows);
    } catch (error) {
        console.error("GET ticket articles error:", error);
        res.status(500).json({ error: "Failed to load related articles" });
    }
});

router.post("/tickets/:id/articles", requireRole("admin", "technician"), async (req, res) => {
    try {
        const access = await getAccess(req.params.id);
        if (!canAccess(req.user, access)) return res.status(access ? 403 : 404).json({ error: access ? "Access denied" : "Ticket not found" });
        if (!req.body.articleId) return res.status(400).json({ error: "Article is required" });
        await db.query(`INSERT IGNORE INTO ticket_articles (ticket_id, article_id) VALUES (?, ?)`, [req.params.id, req.body.articleId]);
        res.status(201).json({ success: true });
    } catch (error) {
        console.error("LINK article error:", error);
        res.status(500).json({ error: "Failed to link article" });
    }
});

router.delete("/tickets/:ticketId/articles/:articleId", requireRole("admin", "technician"), async (req, res) => {
    try {
        const access = await getAccess(req.params.ticketId);
        if (!canAccess(req.user, access)) return res.status(access ? 403 : 404).json({ error: access ? "Access denied" : "Ticket not found" });
        await db.query(`DELETE FROM ticket_articles WHERE ticket_id = ? AND article_id = ?`, [req.params.ticketId, req.params.articleId]);
        res.json({ success: true });
    } catch (error) {
        console.error("UNLINK article error:", error);
        res.status(500).json({ error: "Failed to unlink article" });
    }
});

router.get("/saved-filters", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT id, name, filter_json AS filterJson, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
            FROM saved_filters WHERE user_id = ? ORDER BY name
        `, [req.user.id]);
        res.json(rows.map((row) => ({ ...row, filter: JSON.parse(row.filterJson || "{}") })));
    } catch (error) {
        console.error("GET filters error:", error);
        res.status(500).json({ error: "Failed to load saved filters" });
    }
});

router.post("/saved-filters", async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        if (!name) return res.status(400).json({ error: "Filter name is required" });
        const id = crypto.randomUUID();
        await db.query(`INSERT INTO saved_filters (id, user_id, name, filter_json) VALUES (?, ?, ?, ?)`, [id, req.user.id, name, JSON.stringify(req.body.filter || {})]);
        res.status(201).json({ id, success: true });
    } catch (error) {
        console.error("POST filter error:", error);
        res.status(500).json({ error: "Failed to save filter" });
    }
});

router.delete("/saved-filters/:id", async (req, res) => {
    try {
        await db.query(`DELETE FROM saved_filters WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (error) {
        console.error("DELETE filter error:", error);
        res.status(500).json({ error: "Failed to delete filter" });
    }
});

router.get("/search", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        if (q.length < 2) return res.json({ tickets: [], articles: [] });
        const pattern = `%${q}%`;
        const params = [pattern, pattern, pattern];
        let ticketWhere = `(t.title LIKE ? OR t.description LIKE ? OR CONCAT('SD-', LPAD(t.ticket_no, 6, '0')) LIKE ?)`;
        if (req.user.role === "technician") {
            ticketWhere += ` AND (t.assigned_user_id = ? OR t.assigned_user_id IS NULL)`;
            params.push(req.user.id);
        } else if (req.user.role === "customer") {
            ticketWhere += ` AND c.user_id = ?`;
            params.push(req.user.id);
        }
        const [tickets] = await db.query(`
            SELECT t.id, CONCAT('SD-', LPAD(t.ticket_no, 6, '0')) AS ticketNumber,
                   t.title, t.status, t.priority, c.company, c.contact_name AS customerName
            FROM tickets t INNER JOIN customers c ON c.id = t.customer_id
            WHERE ${ticketWhere}
            ORDER BY t.updated_at DESC LIMIT 8
        `, params);
        const articleParams = [pattern, pattern, pattern];
        let articleSql = `
            SELECT id, title, summary, visibility FROM knowledge_articles
            WHERE status = 'published' AND (title LIKE ? OR summary LIKE ? OR content LIKE ?)
        `;
        if (req.user.role === "customer") articleSql += ` AND visibility = 'public' `;
        articleSql += ` ORDER BY updated_at DESC LIMIT 8`;
        const [articles] = await db.query(articleSql, articleParams);
        res.json({ tickets, articles });
    } catch (error) {
        console.error("GLOBAL search error:", error);
        res.status(500).json({ error: "Search failed" });
    }
});

module.exports = router;
