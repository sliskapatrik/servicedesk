# ServiceDesk database

`schema.sql` contains the complete current database structure for a **fresh ServiceDesk v0.8 installation**.

For a clean installation:
1. Create an empty MySQL/MariaDB database named `servicedesk`.
2. Import `schema.sql`.
3. Optionally review/import `seed.sql` for demo content.

For an existing installation, do not expect `CREATE TABLE IF NOT EXISTS` to modify existing tables. Apply the manual SQL supplied with the release, then keep `schema.sql` as the reference schema.

ServiceDesk intentionally does not keep versioned JavaScript migration files in the repository.
