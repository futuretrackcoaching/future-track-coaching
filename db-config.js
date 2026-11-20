// Safely resolve the Neon serverless client factory in the browser
const neonClientFactory =
    (window.neon && typeof window.neon.neon === "function" && window.neon.neon) ||
    (typeof window.neon === "function" && window.neon) ||
    (typeof neon === "function" && neon) ||
    (window.neondatabaseServerless && typeof window.neondatabaseServerless.neon === "function" && window.neondatabaseServerless.neon) ||
    null;

// Connected to your Neon PostgreSQL database
const DATABASE_URL = "postgresql://neondb_owner:npg_LLSyBcdu5Ya2@ep-sweet-hill-a10jgoip-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const sql = neonClientFactory ? neonClientFactory(DATABASE_URL) : null;

// Helper function to run SQL queries anywhere in your app
async function queryDatabase(queryText, params = []) {
    if (!sql) {
        const err = new Error("Neon SQL client is not initialized. Check the @neondatabase/serverless script in index.html.");
        console.error(err.message);
        throw err;
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
