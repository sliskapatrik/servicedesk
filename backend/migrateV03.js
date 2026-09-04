require("dotenv").config();
const db = require("./database");

async function hasIndex(tableName, indexName) {
    const [rows] = await db.query(
        `
        SELECT COUNT(*) AS count
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND index_name = ?
        `,
        [tableName, indexName]
    );
    return Number(rows[0].count) > 0;
}

async function run() {
    try {
        console.log("Starting ServiceDesk v0.3 migration...");

        const duplicateRows = await db.query(`
            SELECT user_id
            FROM customers
            WHERE user_id IS NOT NULL
            GROUP BY user_id
            HAVING COUNT(*) > 1
        `);

        if (duplicateRows[0].length) {
            throw new Error(
                "Duplicate customer user links exist. Unlink duplicate customer.user_id values before running v0.3 migration."
            );
        }

        if (!(await hasIndex("customers", "uq_customers_user_id"))) {
            await db.query(`
                ALTER TABLE customers
                ADD UNIQUE KEY uq_customers_user_id (user_id)
            `);
            console.log("Added unique customer account link index.");
        } else {
            console.log("Customer account link index already exists.");
        }

        console.log("ServiceDesk v0.3 migration completed successfully.");
    } catch (error) {
        console.error("ServiceDesk v0.3 migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

run();
