const express = require("express");
const crypto = require("crypto");
const db = require("./database");
const { requireRole } = require("./middleware/auth");

const router = express.Router();

const DEFAULTS = {
    app_name: "ServiceDesk",
    support_email: "support@example.com",
    default_priority: "Medium",
    allow_customer_ticket_creation: "1",
    session_hours: "8",
    minimum_password_length: "8"
};

async function readSettings() {
    const [rows] = await db.query(`SELECT setting_key, setting_value FROM app_settings`);
    const values = { ...DEFAULTS };
    rows.forEach((row) => { values[row.setting_key] = row.setting_value; });
    return values;
}

router.get("/config", async (req, res) => {
    try {
        const settings = await readSettings();
        const [rules] = await db.query(`SELECT priority, response_hours AS hours FROM sla_rules WHERE is_active = 1 ORDER BY FIELD(priority,'Critical','High','Medium','Low')`);
        res.json({
            appName: settings.app_name,
            supportEmail: settings.support_email,
            defaultPriority: settings.default_priority,
            allowCustomerTicketCreation: settings.allow_customer_ticket_creation === "1",
            sessionHours: Number(settings.session_hours || 8),
            minimumPasswordLength: Number(settings.minimum_password_length || 8),
            slaRules: Object.fromEntries(rules.map((row) => [row.priority, Number(row.hours)]))
        });
    } catch (error) {
        console.error("GET config error:", error);
        res.status(500).json({ error: "Failed to load configuration" });
    }
});

router.get("/settings", requireRole("admin"), async (req, res) => {
    try {
        const settings = await readSettings();
        const [rules] = await db.query(`SELECT priority, response_hours AS hours, is_active AS isActive FROM sla_rules ORDER BY FIELD(priority,'Critical','High','Medium','Low')`);
        const [[summary]] = await db.query(`
            SELECT
                (SELECT COUNT(*) FROM users) AS usersCount,
                (SELECT COUNT(*) FROM users WHERE status='active') AS activeUsersCount,
                (SELECT COUNT(*) FROM tickets WHERE status NOT IN ('Resolved','Closed')) AS activeTicketsCount,
                (SELECT COUNT(*) FROM tickets WHERE sla_deadline < NOW() AND status NOT IN ('Resolved','Closed')) AS overdueTicketsCount,
                NOW() AS databaseTime
        `);
        res.json({ settings, slaRules: rules, summary });
    } catch (error) {
        console.error("GET settings error:", error);
        res.status(500).json({ error: "Failed to load settings" });
    }
});

router.put("/settings", requireRole("admin"), async (req, res) => {
    const connection = await db.getConnection();
    try {
        const incoming = req.body.settings || {};
        const allowed = ["app_name", "support_email", "default_priority", "allow_customer_ticket_creation", "session_hours", "minimum_password_length"];
        const priorities = ["Low", "Medium", "High", "Critical"];
        if (!priorities.includes(incoming.default_priority || "Medium")) return res.status(400).json({ error: "Invalid default priority" });
        const sessionHours = Number(incoming.session_hours);
        const minPassword = Number(incoming.minimum_password_length);
        if (!Number.isFinite(sessionHours) || sessionHours < 1 || sessionHours > 168) return res.status(400).json({ error: "Session duration must be between 1 and 168 hours" });
        if (!Number.isFinite(minPassword) || minPassword < 8 || minPassword > 64) return res.status(400).json({ error: "Minimum password length must be between 8 and 64" });

        await connection.beginTransaction();
        const [currentRows] = await connection.query(`SELECT setting_key, setting_value FROM app_settings`);
        const current = Object.fromEntries(currentRows.map((row) => [row.setting_key, row.setting_value]));

        for (const key of allowed) {
            let value = incoming[key];
            if (key === "allow_customer_ticket_creation") value = value ? "1" : "0";
            value = String(value ?? "").trim();
            await connection.query(`INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`, [key, value, req.user.id]);
            if ((current[key] ?? DEFAULTS[key] ?? "") !== value) {
                await connection.query(`INSERT INTO settings_audit (id, user_id, setting_key, old_value, new_value) VALUES (?, ?, ?, ?, ?)`, [crypto.randomUUID(), req.user.id, key, current[key] ?? DEFAULTS[key] ?? null, value]);
            }
        }

        const slaRules = req.body.slaRules || {};
        for (const priority of priorities) {
            const hours = Number(slaRules[priority]);
            if (!Number.isFinite(hours) || hours < 1 || hours > 720) throw new Error(`Invalid SLA hours for ${priority}`);
            const [[oldRule]] = await connection.query(`SELECT response_hours FROM sla_rules WHERE priority = ?`, [priority]);
            await connection.query(`INSERT INTO sla_rules (priority, response_hours, is_active, updated_by) VALUES (?, ?, 1, ?) ON DUPLICATE KEY UPDATE response_hours=VALUES(response_hours), is_active=1, updated_by=VALUES(updated_by), updated_at=CURRENT_TIMESTAMP`, [priority, hours, req.user.id]);
            if (!oldRule || Number(oldRule.response_hours) !== hours) {
                await connection.query(`INSERT INTO settings_audit (id, user_id, setting_key, old_value, new_value) VALUES (?, ?, ?, ?, ?)`, [crypto.randomUUID(), req.user.id, `sla_${priority.toLowerCase()}_hours`, oldRule ? String(oldRule.response_hours) : null, String(hours)]);
            }
        }

        await connection.commit();
        res.json({ success: true, message: "Settings saved" });
    } catch (error) {
        await connection.rollback();
        console.error("PUT settings error:", error);
        res.status(500).json({ error: error.message || "Failed to save settings" });
    } finally {
        connection.release();
    }
});

router.get("/settings/audit", requireRole("admin"), async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT a.id, a.setting_key AS settingKey, a.old_value AS oldValue, a.new_value AS newValue,
                   u.name AS userName, DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i:%s') AS createdAt
            FROM settings_audit a
            LEFT JOIN users u ON u.id = a.user_id
            ORDER BY a.created_at DESC LIMIT 100
        `);
        res.json(rows);
    } catch (error) {
        console.error("GET settings audit error:", error);
        res.status(500).json({ error: "Failed to load settings audit" });
    }
});

module.exports = router;
