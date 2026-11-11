// Function to dynamically load pages from the 'pages/' folder
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
            <div class="bg-white/5 backdrop-blur-lg border border-white/10 p-8 rounded-3xl text-center max-w-lg mx-auto mt-12 shadow-xl">
                <h2 class="text-xl font-bold text-red-400 mb-2">Page Not Found</h2>
                <p class="text-gray-400 text-sm">Could not load <code class="text-blue-300">pages/${pageName}.html</code>. Check your file name and folder structure!</p>
            </div>
        `;
    }
}

// Load Home page by default on startup
window.addEventListener('DOMContentLoaded', () => {
    loadPage('home');
});
