const API_DB_URL = "https://future-track-api.vercel.app/api/db";

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
