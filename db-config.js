// Initialize the Neon SQL client using your connection string
const { neon } = window.neon;

// Replace with your actual Neon connection string securely
const DATABASE_URL = "YOUR_NEON_CONNECTION_STRING_HERE";

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
