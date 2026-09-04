# Database setup

For a clean installation, create an empty `servicedesk` database and import `schema.sql`.

`schema.sql` is the single source of truth for the current v0.7 database structure. Versioned Node migration scripts are intentionally not used.

For an existing installation, apply the release SQL manually in HeidiSQL before starting the updated application. `CREATE TABLE IF NOT EXISTS` does not add missing columns or constraints to tables that already exist.

`seed.sql` is optional and contains example/reference seed data only.
