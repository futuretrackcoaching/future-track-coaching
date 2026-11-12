// Function to dynamically load pages from the 'pages/' folder into the main container
async function loadPage(pageName) {
    try {
        const response = await fetch(`pages/${pageName}.html`);
        if (!response.ok) {
            throw new Error('Page not found');
        }
        const htmlContent = await response.text();
        document.getElementById('app').innerHTML = htmlContent;
        
        // Scroll smoothly to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error('Error loading page:', error);
        document.getElementById('app').innerHTML = `
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl text-center max-w-lg mx-auto mt-12 shadow-2xl">
                <h2 class="text-xl font-bold text-red-400 mb-2">Page Not Found</h2>
                <p class="text-gray-400 text-sm">Could not load <code class="text-blue-300">pages/${pageName}.html</code>. Check your file name and folder structure!</p>
            </div>
        `;
    }
}

// Check URL hash for secret admin access (#ftadmin)
function handleRoute() {
    const hash = window.location.hash;
    if (hash === '#ftadmin') {
        const pin = prompt("Enter Admin Secret PIN:");
        if (pin === "1234") { // Change PIN as needed
            loadPage('admin');
        } else {
            alert("Incorrect PIN");
            window.location.hash = '#home';
            loadPage('home');
        }
    } else {
        loadPage('home');
    }
}

// Listen for hash changes and initial load
window.addEventListener('DOMContentLoaded', handleRoute);
window.addEventListener('hashchange', handleRoute);
