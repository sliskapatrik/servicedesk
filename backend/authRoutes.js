const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const db = require("./database");

const {
    authenticateToken,
    requireRole
} = require("./middleware/auth");


const router =
    express.Router();


const loginLimiter =
    rateLimit({

        windowMs:
            15 * 60 * 1000,

        limit:
            10,

        standardHeaders:
            "draft-7",

        legacyHeaders:
            false,

        message: {
            error:
                "Too many login attempts. Try again later."
        }
    });


/* LOGIN */

router.post(
    "/login",

    loginLimiter,

    async function (req, res) {

        try {

            const {
                email,
                password
            } = req.body;


            if (
                !email ||
                !password
            ) {

                return res.status(400).json({
                    error:
                        "Email and password are required"
                });

            }


            const [rows] =
                await db.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        password_hash,
                        role,
                        status

                    FROM users

                    WHERE email = ?

                    LIMIT 1
                    `,
                    [
                        email
                            .trim()
                            .toLowerCase()
                    ]
                );


            if (
                rows.length === 0
            ) {

                return res.status(401).json({
                    error:
                        "Invalid email or password"
                });

            }


            const user =
                rows[0];


            if (
                user.status !== "active"
            ) {

                return res.status(403).json({
                    error:
                        "User account is inactive"
                });

            }


            const validPassword =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );


            if (!validPassword) {

                return res.status(401).json({
                    error:
                        "Invalid email or password"
                });

            }


            const token =
                jwt.sign(
                    {
                        id:
                            user.id,

                        name:
                            user.name,

                        email:
                            user.email,

                        role:
                            user.role
                    },

                    process.env.JWT_SECRET,

                    {
                        expiresIn:
                            process.env.JWT_EXPIRES_IN ||
                            "8h"
                    }
                );


            res.json({

                token,

                user: {
                    id:
                        user.id,

                    name:
                        user.name,

                    email:
                        user.email,

                    role:
                        user.role
                }

            });


        } catch (error) {

            console.error(
                "LOGIN error:",
                error
            );


            res.status(500).json({
                error:
                    "Login failed"
            });

        }

    }
);


/* CURRENT USER */

router.get(
    "/me",

    authenticateToken,

    async function (req, res) {

        try {

            const [rows] =
                await db.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role,
                        status,
                        created_at

                    FROM users

                    WHERE id = ?

                    LIMIT 1
                    `,
                    [
                        req.user.id
                    ]
                );


            if (
                rows.length === 0
            ) {

                return res.status(404).json({
                    error:
                        "User not found"
                });

            }


            res.json(
                rows[0]
            );


        } catch (error) {

            console.error(
                "GET ME error:",
                error
            );


            res.status(500).json({
                error:
                    "Failed to load user"
            });

        }

    }
);


/* GET USERS - ADMIN ONLY */

router.get(
    "/users",

    authenticateToken,

    requireRole(
        "admin"
    ),

    async function (req, res) {

        try {

            const [rows] =
                await db.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role,
                        status,
                        created_at

                    FROM users

                    ORDER BY created_at DESC
                    `
                );


            res.json(
                rows
            );


        } catch (error) {

            console.error(
                "GET USERS error:",
                error
            );


            res.status(500).json({
                error:
                    "Failed to load users"
            });

        }

    }
);


module.exports =
    router;