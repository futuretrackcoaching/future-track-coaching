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
