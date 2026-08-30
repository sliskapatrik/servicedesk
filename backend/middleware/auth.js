const jwt = require("jsonwebtoken");


function authenticateToken(req, res, next) {

    const authorization =
        req.headers.authorization;


    if (!authorization) {

        return res.status(401).json({
            error: "Authentication required"
        });

    }


    const parts =
        authorization.split(" ");


    if (
        parts.length !== 2 ||
        parts[0] !== "Bearer"
    ) {

        return res.status(401).json({
            error: "Invalid authorization header"
        });

    }


    const token =
        parts[1];


    try {

        const decoded =
            jwt.verify(
                token,
                process.env.JWT_SECRET
            );


        req.user =
            decoded;


        next();


    } catch (error) {

        return res.status(401).json({
            error: "Invalid or expired token"
        });

    }
}


function requireRole(...allowedRoles) {

    return function (req, res, next) {

        if (!req.user) {

            return res.status(401).json({
                error: "Authentication required"
            });

        }


        if (
            !allowedRoles.includes(
                req.user.role
            )
        ) {

            return res.status(403).json({
                error: "Access denied"
            });

        }


        next();
    };
}


module.exports = {
    authenticateToken,
    requireRole
};