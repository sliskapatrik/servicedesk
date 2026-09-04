require("dotenv").config();

const db = require("./database");

async function columnExists(tableName, columnName) {
    const [rows] = await db.query(
        `
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        `,
        [tableName, columnName]
    );

    return Number(rows[0].count) > 0;
}

async function migrate() {
    try {
        console.log("Starting ServiceDesk v0.2 migration...");

        await db.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id VARCHAR(64) PRIMARY KEY,
                ticket_id VARCHAR(64) NOT NULL,
                user_id VARCHAR(64) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_comments_ticket
                    FOREIGN KEY (ticket_id)
                    REFERENCES tickets(id)
                    ON DELETE CASCADE,
                CONSTRAINT fk_comments_user
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS ticket_history (
                id VARCHAR(64) PRIMARY KEY,
                ticket_id VARCHAR(64) NOT NULL,
                user_id VARCHAR(64) NULL,
                action VARCHAR(255) NOT NULL,
                old_value TEXT,
                new_value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_history_ticket
                    FOREIGN KEY (ticket_id)
                    REFERENCES tickets(id)
                    ON DELETE CASCADE,
                CONSTRAINT fk_history_user
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE SET NULL
            )
        `);

        if (!(await columnExists("comments", "is_internal"))) {
            await db.query(`
                ALTER TABLE comments
                ADD COLUMN is_internal TINYINT(1) NOT NULL DEFAULT 0
                AFTER message
            `);
            console.log("Added comments.is_internal");
        }

        if (!(await columnExists("tickets", "resolved_at"))) {
            await db.query(`
                ALTER TABLE tickets
                ADD COLUMN resolved_at DATETIME NULL
                AFTER sla_deadline
            `);
            console.log("Added tickets.resolved_at");
        }

        console.log("ServiceDesk v0.2 migration completed successfully.");
    } catch (error) {
        console.error("ServiceDesk v0.2 migration failed:", error);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

migrate();
