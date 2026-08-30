require("dotenv").config();

const bcrypt =
    require("bcryptjs");

const crypto =
    require("crypto");

const db =
    require("./database");


async function createAdmin() {

    try {

        const name =
            "ServiceDesk Admin";

        const email =
            "admin@servicedesk.local";

        const password =
            "ChangeMe123!";


        const passwordHash =
            await bcrypt.hash(
                password,
                12
            );


        const id =
            crypto.randomUUID();


        await db.query(
            `
            INSERT INTO users (
                id,
                name,
                email,
                password_hash,
                role,
                status
            )

            VALUES (?, ?, ?, ?, 'admin', 'active')
            `,
            [
                id,
                name,
                email,
                passwordHash
            ]
        );


        console.log(
            "ServiceDesk admin created successfully."
        );

        console.log(
            "Email:",
            email
        );

        console.log(
            "Temporary password:",
            password
        );


    } catch (error) {

        if (
            error.code ===
            "ER_DUP_ENTRY"
        ) {

            console.log(
                "ServiceDesk admin already exists."
            );

        } else {

            console.error(
                "Could not create ServiceDesk admin:",
                error
            );

        }

    } finally {

        await db.end();

    }
}


createAdmin();