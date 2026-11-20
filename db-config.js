const DATABASE_URL = "postgresql://neondb_owner:npg_LLSyBcdu5Ya2@ep-sweet-hill-a10jgoip-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

let sqlClient = null;

// Lazily initialize the Neon SQL client once window.neon is loaded by index.html
function getSqlClient() {
    if (sqlClient) return sqlClient;

    const neonFactory =
        (window.neon && typeof window.neon.neon === "function" && window.neon.neon) ||
        (typeof window.neon === "function" && window.neon) ||
        null;

    if (neonFactory) {
        sqlClient = neonFactory(DATABASE_URL);
    }
    return sqlClient;
}

// Helper function to run SQL queries anywhere in your app
async function queryDatabase(queryText, params = []) {
    const sql = getSqlClient();
    if (!sql) {
        throw new Error("Neon database driver is still loading. Please try again in a second.");
    }

    try {
        if (Array.isArray(params) && params.length > 0 && typeof sql.query === "function") {
            return await sql.query(queryText, params);
        }
        return await sql(queryText, params);
    } catch (error) {
        console.error("Database query failed:", error);
        throw error;
    }
}


const API_DB_URL = "https://your-api-project.vercel.app/api/db";

function setSessionAdminPin(pin) {
    if (pin) {
        sessionStorage.setItem("ft_admin_pin", pin.trim());
    } else {
        sessionStorage.removeItem("ft_admin_pin");
    }
}

function getSessionAdminPin() {
    return sessionStorage.getItem("ft_admin_pin") || "";
}

async function verifyAdminPinOnServer(pin) {
    const response = await fetch(API_DB_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-admin-pin": pin.trim()
        },
        body: JSON.stringify({ action: "verify_admin", adminPin: pin.trim() })
    });

    const data = await response.json();
    if (!response.ok || !data.authorized) {
        throw new Error(data.error || "Invalid PIN");
    }
    setSessionAdminPin(pin.trim());
    return true;
}

async function queryDatabase(queryText, params = []) {
    const pin = getSessionAdminPin();

    try {
        const response = await fetch(API_DB_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(pin ? { "x-admin-pin": pin } : {})
            },
            body: JSON.stringify({ query: queryText, params, adminPin: pin })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        return data.rows;
    } catch (error) {
        console.error("Database query failed:", error);
        throw error;
    }
}

