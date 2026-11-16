// Initialize the Neon SQL client using your connection string
const { neon } = window.neon;

// Connected to your Neon PostgreSQL database
const DATABASE_URL = "postgresql://neondb_owner:npg_LLSyBcdu5Ya2@ep-sweet-hill-a10jgoip-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const sql = neon(DATABASE_URL);

// Helper function to run SQL queries anywhere in your app
async function queryDatabase(queryText, params = []) {
    try {
        const result = await sql(queryText, params);
        return result;
    } catch (error) {
        console.error("Database query failed:", error);
        throw error;
    }
}
