import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const ALLOWED_ORIGINS = [
    "https://futuretrackcoaching.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:5500"
];

async function verifyAdminPin(pin) {
    if (!pin || typeof pin !== "string") return false;
    const rows = await sql`SELECT pin_code FROM admin_settings LIMIT 1`;
    if (!rows || rows.length === 0) return false;
    return String(rows[0].pin_code).trim() === pin.trim();
}

export default async function handler(req, res) {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-pin");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { action, query, params = [], adminPin } = req.body || {};
        const headerPin = req.headers["x-admin-pin"] || adminPin;

        // 1. Dedicated endpoint action to verify admin PIN securely on the server
        if (action === "verify_admin") {
            const isValid = await verifyAdminPin(headerPin);
            if (!isValid) {
                return res.status(401).json({ authorized: false, error: "Invalid admin PIN" });
            }
            return res.status(200).json({ authorized: true });
        }

        if (!query || typeof query !== "string") {
            return res.status(400).json({ error: "Missing SQL query" });
        }

        const normalizedQuery = query.trim().toUpperCase();

        // 2. Block dangerous multi-statement or non-SELECT/INSERT queries
        const isSelect = normalizedQuery.startsWith("SELECT");
        const isInsertQuizResult =
            normalizedQuery.startsWith("INSERT INTO QUIZ_RESULTS");

        // Any other INSERT, UPDATE, DELETE, DROP, ALTER requires your Admin PIN
        if (!isSelect && !isInsertQuizResult) {
            const isValid = await verifyAdminPin(headerPin);
            if (!isValid) {
                return res.status(403).json({
                    error: "Unauthorized: Admin PIN required for this action."
                });
            }
        }

        const rows =
            Array.isArray(params) && params.length > 0 && typeof sql.query === "function"
                ? await sql.query(query, params)
                : await sql(query, params);

        return res.status(200).json({ rows });
    } catch (err) {
        console.error("Server error:", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
}
