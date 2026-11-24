// ============================================================================
// PART 1 OF 3: CLASS PROMPT, STATE, ROUTER, SLIDESHOW & FOLDER HELPERS
// ============================================================================

let domLoaded = false;
let neonLoaded = Boolean(window.neon);
let slideshowInterval = null;
let allQuizzesCache = [];
let allMaterialsCache = [];
let allTestsCache = [];
let activeQuizTimer = null;
let secondsElapsed = 0;
let quizWatcherInterval = null;
let currentActiveQuizSession = null;

let activeMaterialFolderClass = null;
let activeMaterialFolderSubject = null;
let activeQuizFolderClass = null;
let activeQuizFolderSubject = null;
let activeTestFolderClass = null;
let activeTestFolderSubject = null;

const CLASS_FOLDERS = ["8th", "9th", "10th", "11th", "12th"];
const COMMERCE_DEFAULT_SUBJECTS = ["Eco", "BST", "Acc"];
const CLASS_STORAGE_KEY = "ft_selected_class";
const CLASS_PROMPT_SHOWN_KEY = "ft_class_prompt_shown";
const STUDENT_NAME_STORAGE_KEY = "ft_cached_student_name";

function getSelectedClass() {
    return localStorage.getItem(CLASS_STORAGE_KEY) || "All";
}

function setActiveClass(classValue) {
    applyStudentClassSelection(classValue, { syncHash: true });
}

function applyStudentClassSelection(classValue, opts = {}) {
    const validClasses = ["All", "8th", "9th", "10th", "11th", "12th"];
    const chosen = validClasses.includes(classValue) ? classValue : "All";

    localStorage.setItem(CLASS_STORAGE_KEY, chosen);
    localStorage.setItem(CLASS_PROMPT_SHOWN_KEY, "true");
    syncClassSelectorUI();

    const modal = document.getElementById("class-onboarding-modal");
    if (modal) modal.remove();

    if (document.getElementById("materials-list")) {
        activeMaterialFolderClass = chosen !== "All" ? chosen : null;
        activeMaterialFolderSubject = null;
        renderMaterialFoldersOrList(opts);
    }
    if (document.getElementById("quiz-list")) {
        activeQuizFolderClass = chosen !== "All" ? chosen : null;
        activeQuizFolderSubject = null;
        renderQuizFoldersOrList(opts);
    }
    if (document.getElementById("tests-list")) {
        activeTestFolderClass = chosen !== "All" ? chosen : null;
        activeTestFolderSubject = null;
        renderTestFoldersOrList(opts);
    }
}

function promptStudentClassOnFirstOpen() {
    const alreadyPicked = localStorage.getItem(CLASS_PROMPT_SHOWN_KEY) === "true";
    if (alreadyPicked) return;
    if (document.getElementById("class-onboarding-modal")) return;

    const modal = document.createElement("div");
    modal.id = "class-onboarding-modal";
    modal.className = "fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4";
    modal.innerHTML = `
        <div class="glass-card max-w-md w-full p-6 rounded-3xl space-y-4 border border-white/15">
            <h2 class="text-xl font-bold text-blue-300">🎓 Select Your Class</h2>
            <p class="text-xs text-gray-300">Choose your class so Future Track opens your class folder automatically.</p>
            <div class="grid grid-cols-3 gap-2">
                ${["8th", "9th", "10th", "11th", "12th", "All"].map(cls => `
                    <button type="button" onclick="applyStudentClassSelection('${cls}')"
                            class="py-2.5 px-3 rounded-2xl text-xs font-semibold bg-white/5 hover:bg-blue-600 border border-white/10 transition">
                        ${cls === "All" ? "All Classes" : `Class ${cls}`}
                    </button>
                `).join("")}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function syncClassSelectorUI() {
    const active = getSelectedClass();
    document.querySelectorAll(".class-pill").forEach(btn => {
        if (btn.dataset.class === active) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

function getCachedStudentName() {
    return (localStorage.getItem(STUDENT_NAME_STORAGE_KEY) || "").trim();
}

function setCachedStudentName(name) {
    const clean = String(name || "").trim();
    if (clean) {
        localStorage.setItem(STUDENT_NAME_STORAGE_KEY, clean);
    } else {
        localStorage.removeItem(STUDENT_NAME_STORAGE_KEY);
    }
}

function setSectionHash(hashStr) {
    if (window.location.hash !== hashStr) {
        history.pushState(null, "", hashStr);
    }
}

function normalizeClassParam(raw) {
    if (!raw) return null;
    const clean = decodeURIComponent(String(raw)).trim();
    return CLASS_FOLDERS.find(c => c.toLowerCase() === clean.toLowerCase()) || null;
}

function getSubjectsForClassFolder(className, items = []) {
    const cls = String(className || "").trim();
    const subjects = new Set();

    if (cls === "11th" || cls === "12th") {
        COMMERCE_DEFAULT_SUBJECTS.forEach(s => subjects.add(s));
    }

    (items || []).forEach(item => {
        const itemClass = String(item.class_level || "All").trim();
        if (itemClass.toLowerCase() === cls.toLowerCase() || itemClass.toLowerCase() === "all") {
            if (item.subject && String(item.subject).trim()) {
                subjects.add(String(item.subject).trim());
            }
        }
    });

    if (subjects.size === 0) subjects.add("General");
    return Array.from(subjects);
}

function subjectMatches(itemSubject, chosenSubject) {
    if (!chosenSubject || chosenSubject === "all") return true;
    const a = String(itemSubject || "").trim().toLowerCase();
    const b = decodeURIComponent(String(chosenSubject || "")).trim().toLowerCase();
    if (a === b) return true;
    if (b === "eco" && (a.includes("econ") || a === "eco")) return true;
    if (b === "bst" && (a.includes("business") || a === "bst" || a === "b.st")) return true;
    if (b === "acc" && (a.includes("account") || a === "acc" || a === "accounts")) return true;
    return false;
}

function tryStartApp() {
    if (domLoaded && neonLoaded) {
        syncClassSelectorUI();
        promptStudentClassOnFirstOpen();
        handleRoute();
    }
}

window.addEventListener("DOMContentLoaded", () => {
    domLoaded = true;
    syncClassSelectorUI();
    tryStartApp();
});

window.addEventListener("neonReady", () => {
    neonLoaded = true;
    tryStartApp();
});

window.addEventListener("hashchange", () => {
    if (neonLoaded) {
        handleRoute();
    }
});

window.addEventListener("popstate", () => {
    if (neonLoaded) {
        handleRoute();
    }
});

function cleanupQuizTimers() {
    if (activeQuizTimer) {
        clearInterval(activeQuizTimer);
        activeQuizTimer = null;
    }
    if (quizWatcherInterval) {
        clearInterval(quizWatcherInterval);
        quizWatcherInterval = null;
    }
    currentActiveQuizSession = null;
}

async function loadPage(pageName, opts = {}) {
    cleanupQuizTimers();
    if (slideshowInterval) {
        clearInterval(slideshowInterval);
        slideshowInterval = null;
    }

    if (!opts.skipHashUpdate) {
        setSectionHash(`#${pageName}`);
    }

    try {
        const response = await fetch(`pages/${pageName}.html`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const htmlContent = await response.text();
        document.getElementById("app").innerHTML = htmlContent;
        syncClassSelectorUI();
        window.scrollTo({ top: 0, behavior: "smooth" });

        if (pageName === "home") {
            initSlideshow();
        } else if (pageName === "quiz") {
            await loadQuizzesList(opts);
        } else if (pageName === "material") {
            await loadMaterialsList(opts);
        } else if (pageName === "test") {
            await loadTestsList(opts);
        } else if (pageName === "admin") {
            await loadAdminManageLists();
        }
    } catch (error) {
        console.error("Error loading page:", error);
        document.getElementById("app").innerHTML = `
            <div class="glass-card p-8 rounded-3xl text-center max-w-lg mx-auto mt-12">
                <h2 class="text-xl font-bold text-red-400 mb-2">Page Not Found</h2>
                <p class="text-gray-400 text-sm">Could not load <code class="text-blue-300">pages/${escapeHtml(pageName)}.html</code>.</p>
            </div>
        `;
    }
}

async function handleRoute() {
    const rawHash = (window.location.hash || "#home").replace(/^#/, "");

    if (rawHash === "ftadmin") {
        const enteredPin = prompt("Enter Admin Secret PIN:");
        if (!enteredPin) {
            window.location.hash = "#home";
            await loadPage("home", { skipHashUpdate: true });
            return;
        }
        try {
            await verifyAdminPinOnServer(enteredPin);
            await loadPage("admin", { skipHashUpdate: true });
        } catch (err) {
            if (typeof setSessionAdminPin === "function") setSessionAdminPin("");
            alert(err && err.message ? err.message : "Incorrect PIN");
            window.location.hash = "#home";
            await loadPage("home", { skipHashUpdate: true });
        }
        return;
    }

    if (rawHash.startsWith("pdf-")) {
        const matId = Number(rawHash.replace("pdf-", ""));
        await loadPage("material", { skipHashUpdate: true, preserveFolder: true });
        if (matId) await openMaterialPdfPage(matId, { skipHashUpdate: true });
        return;
    }

    if (rawHash === "quiz" || rawHash.startsWith("quiz-")) {
        const rest = rawHash === "quiz" ? "" : rawHash.replace(/^quiz-/, "");
        await loadPage("quiz", { skipHashUpdate: true, preserveFolder: Boolean(rest) });
        if (/^\d+$/.test(rest)) {
            await openQuizById(Number(rest), { skipHashUpdate: true });
        } else if (rest) {
            const parts = rest.split("-");
            const cls = normalizeClassParam(parts[0]);
            const subj = parts.slice(1).join("-") || null;
            if (cls) {
                activeQuizFolderClass = cls;
                activeQuizFolderSubject = subj;
                renderQuizFoldersOrList({ syncHash: false });
            }
        }
        return;
    }

    if (rawHash === "material" || rawHash.startsWith("material-")) {
        const rest = rawHash === "material" ? "" : rawHash.replace(/^material-/, "");
        await loadPage("material", { skipHashUpdate: true, preserveFolder: Boolean(rest) });
        if (rest) {
            const parts = rest.split("-");
            const cls = normalizeClassParam(parts[0]);
            const subj = parts.slice(1).join("-") || null;
            if (cls) {
                activeMaterialFolderClass = cls;
                activeMaterialFolderSubject = subj;
                renderMaterialFoldersOrList({ syncHash: false });
            }
        }
        return;
    }

    if (rawHash === "test" || rawHash.startsWith("test-")) {
        const rest = rawHash === "test" ? "" : rawHash.replace(/^test-/, "");
        await loadPage("test", { skipHashUpdate: true, preserveFolder: Boolean(rest) });
        if (/^\d+$/.test(rest)) {
            await openTestDetailById(Number(rest), { skipHashUpdate: true });
        } else if (rest) {
            const parts = rest.split("-");
            const cls = normalizeClassParam(parts[0]);
            const subj = parts.slice(1).join("-") || null;
            if (cls) {
                activeTestFolderClass = cls;
                activeTestFolderSubject = subj;
                renderTestFoldersOrList({ syncHash: false });
            }
        }
        return;
    }

    await loadPage("home", { skipHashUpdate: rawHash === "home" });
}

function initSlideshow() {
    let currentSlide = 0;
    const slides = document.querySelectorAll(".slide");
    const dots = document.querySelectorAll(".dot");
    if (slides.length === 0) return;

    slideshowInterval = setInterval(() => {
        slides[currentSlide].style.opacity = "0";
        if (dots[currentSlide]) {
            dots[currentSlide].classList.remove("bg-white", "w-4");
            dots[currentSlide].classList.add("bg-white/50", "w-2");
        }
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].style.opacity = "1";
        if (dots[currentSlide]) {
            dots[currentSlide].classList.remove("bg-white/50", "w-2");
            dots[currentSlide].classList.add("bg-white", "w-4");
        }
    }, 5000);
}
// ============================================================================
// PART 2 OF 3: MATERIALS, TESTS, SCROLLABLE PDF VIEWER & ADMIN CRUD
// ============================================================================

function toEmbeddablePdfUrl(rawUrl) {
    const url = String(rawUrl || "").trim();
    if (!url) return "";

    const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveFileMatch && driveFileMatch[1]) {
        return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;
    }

    const driveOpenMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (url.includes("drive.google.com") && driveOpenMatch && driveOpenMatch[1]) {
        return `https://drive.google.com/file/d/${driveOpenMatch[1]}/preview`;
    }

    return url;
}

function buildPdfReaderHtml({ title, subject, classLevel, rawUrl, shareHash, backActionHtml }) {
    const embedUrl = toEmbeddablePdfUrl(rawUrl);
    const fullShareUrl = `${window.location.origin}${window.location.pathname}${shareHash}`;

    return `
        <div class="glass-card p-5 sm:p-7 rounded-3xl space-y-5">
            <div class="flex flex-wrap justify-between items-center gap-3 border-b border-white/10 pb-4">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] bg-indigo-500/15 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/25">Class ${escapeHtml(classLevel || "All")}</span>
                        ${subject ? `<span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(subject)}</span>` : ""}
                    </div>
                    <h2 class="text-xl sm:text-2xl font-extrabold mt-2">${escapeHtml(title || "PDF Document")}</h2>
                    <p class="text-[11px] text-gray-400 mt-1 break-all">Page Link: <span class="text-blue-300">${escapeHtml(fullShareUrl)}</span></p>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                    <a href="${escapeHtml(rawUrl)}" target="_blank" rel="noopener noreferrer" download
                       class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-emerald-600/25">
                        ⬇️ Download PDF
                    </a>
                    ${backActionHtml}
                </div>
            </div>

            <div class="w-full h-[75vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#060a12]">
                <iframe src="${escapeHtml(embedUrl)}" class="w-full min-h-[74vh] h-full border-0" loading="lazy"></iframe>
            </div>

            <div class="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                <span class="text-xs text-gray-400">Download this PDF:</span>
                <a href="${escapeHtml(rawUrl)}" target="_blank" rel="noopener noreferrer" download
                   class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition shadow-lg shadow-emerald-600/25">
                    ⬇️ Download PDF
                </a>
            </div>
        </div>
    `;
}

async function loadMaterialsList(opts = {}) {
    const container = document.getElementById("materials-list");
    if (!container) return;

    const selectedClass = getSelectedClass();
    if (!opts.preserveFolder) {
        activeMaterialFolderClass = selectedClass !== "All" ? selectedClass : null;
        activeMaterialFolderSubject = null;
    }

    try {
        allMaterialsCache = await queryDatabase("SELECT * FROM study_materials ORDER BY uploaded_at DESC");
        renderMaterialFoldersOrList(opts);
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load materials: ${escapeHtml(err.message)}</p>`;
    }
}

function selectMaterialFolder(className, subjectName = null) {
    activeMaterialFolderClass = className;
    activeMaterialFolderSubject = subjectName;
    renderMaterialFoldersOrList({ syncHash: true });
}

function renderMaterialFoldersOrList(opts = {}) {
    const container = document.getElementById("materials-list");
    if (!container) return;

    const selectedClass = getSelectedClass();
    if (!activeMaterialFolderClass && selectedClass !== "All") {
        activeMaterialFolderClass = selectedClass;
    }

    if (!activeMaterialFolderClass) {
        if (opts.syncHash !== false) setSectionHash("#material");
        container.innerHTML = CLASS_FOLDERS.map(cls => {
            const count = (allMaterialsCache || []).filter(m => {
                const c = String(m.class_level || "All").toLowerCase();
                return c === cls.toLowerCase() || c === "all";
            }).length;
            return `
                <div onclick="selectMaterialFolder('${cls}', null)" class="glass-card p-6 rounded-3xl cursor-pointer hover:border-blue-400/50 transition flex items-center justify-between">
                    <div>
                        <span class="text-2xl">📁</span>
                        <h3 class="text-lg font-bold mt-2">Class ${cls}</h3>
                        <p class="text-xs text-gray-400">${count} study file(s)</p>
                    </div>
                    <span class="text-xs text-blue-300 font-semibold">Open Folder →</span>
                </div>
            `;
        }).join("");
        return;
    }

    if (!activeMaterialFolderSubject) {
        if (opts.syncHash !== false) setSectionHash(`#material-${encodeURIComponent(activeMaterialFolderClass)}`);
        const subjects = getSubjectsForClassFolder(activeMaterialFolderClass, allMaterialsCache);

        container.innerHTML = `
            <div class="col-span-1 md:col-span-2 flex flex-wrap justify-between items-center gap-2 glass-card px-5 py-3.5 rounded-2xl">
                <div class="text-xs text-gray-300">
                    📁 Class <strong class="text-blue-300">${escapeHtml(activeMaterialFolderClass)}</strong> / Choose Subject Folder
                </div>
                <button type="button" onclick="activeMaterialFolderClass=null; activeMaterialFolderSubject=null; renderMaterialFoldersOrList();" class="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition">
                    ← All Class Folders
                </button>
            </div>
            ${subjects.map(subj => {
                const subCount = (allMaterialsCache || []).filter(m => {
                    const c = String(m.class_level || "All").toLowerCase();
                    const inClass = c === activeMaterialFolderClass.toLowerCase() || c === "all";
                    return inClass && subjectMatches(m.subject, subj);
                }).length;

                return `
                    <div onclick="selectMaterialFolder('${escapeHtml(activeMaterialFolderClass)}', '${escapeHtml(subj)}')" class="glass-card p-6 rounded-3xl cursor-pointer hover:border-blue-400/50 transition flex items-center justify-between">
                        <div>
                            <span class="text-xl">📂</span>
                            <h3 class="text-lg font-bold mt-2">${escapeHtml(subj)}</h3>
                            <p class="text-xs text-gray-400">Class ${escapeHtml(activeMaterialFolderClass)} • ${subCount} PDF(s)</p>
                        </div>
                        <span class="text-xs text-blue-300 font-semibold">Open →</span>
                    </div>
                `;
            }).join("")}
        `;
        return;
    }

    if (opts.syncHash !== false) {
        setSectionHash(`#material-${encodeURIComponent(activeMaterialFolderClass)}-${encodeURIComponent(activeMaterialFolderSubject)}`);
    }

    const items = (allMaterialsCache || []).filter(m => {
        const c = String(m.class_level || "All").toLowerCase();
        const inClass = c === activeMaterialFolderClass.toLowerCase() || c === "all";
        return inClass && subjectMatches(m.subject, activeMaterialFolderSubject);
    });

    const headerBar = `
        <div class="col-span-1 md:col-span-2 flex flex-wrap justify-between items-center gap-2 glass-card px-5 py-3.5 rounded-2xl">
            <div class="text-xs text-gray-300">
                📁 Class <strong class="text-blue-300">${escapeHtml(activeMaterialFolderClass)}</strong> / 📂 <strong class="text-indigo-300">${escapeHtml(activeMaterialFolderSubject)}</strong>
            </div>
            <button type="button" onclick="selectMaterialFolder('${escapeHtml(activeMaterialFolderClass)}', null)" class="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition">
                ← Subject Folders
            </button>
        </div>
    `;

    if (items.length === 0) {
        container.innerHTML = headerBar + `<p class="text-gray-400 text-sm col-span-2 text-center py-8">No PDFs in this folder yet.</p>`;
        return;
    }

    container.innerHTML = headerBar + items.map(m => `
        <div class="glass-card p-6 rounded-3xl flex flex-col justify-between space-y-4">
            <div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] bg-indigo-500/15 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/25">Class ${escapeHtml(m.class_level || activeMaterialFolderClass)}</span>
                    <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(m.subject)}</span>
                </div>
                <h3 class="text-lg font-bold mt-2">${escapeHtml(m.title)}</h3>
            </div>
            <button type="button"
                    onclick="openMaterialPdfPage(${Number(m.id)})"
                    class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2.5 px-4 rounded-xl transition text-center shadow-lg shadow-blue-600/30">
                📖 Open PDF Page
            </button>
        </div>
    `).join("");
}

async function openMaterialPdfPage(materialId, opts = {}) {
    const container = document.getElementById("materials-list");
    if (!container) return;

    let item = (allMaterialsCache || []).find(m => Number(m.id) === Number(materialId));
    if (!item) {
        const rows = await queryDatabase("SELECT * FROM study_materials WHERE id = $1", [materialId]);
        item = rows && rows[0];
    }
    if (!item) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">PDF not found.</p>`;
        return;
    }

    if (!opts.skipHashUpdate) {
        setSectionHash(`#pdf-${Number(item.id)}`);
    }

    container.innerHTML = `
        <div class="col-span-1 md:col-span-2">
            ${buildPdfReaderHtml({
                title: item.title,
                subject: item.subject,
                classLevel: item.class_level || activeMaterialFolderClass || "All",
                rawUrl: item.file_url,
                shareHash: `#pdf-${Number(item.id)}`,
                backActionHtml: `<button type="button" onclick="renderMaterialFoldersOrList()" class="bg-white/10 hover:bg-white/20 text-xs px-4 py-2 rounded-xl transition">← Back</button>`
            })}
        </div>
    `;
}

async function loadTestsList(opts = {}) {
    const container = document.getElementById("tests-list");
    if (!container) return;

    const selectedClass = getSelectedClass();
    if (!opts.preserveFolder) {
        activeTestFolderClass = selectedClass !== "All" ? selectedClass : null;
        activeTestFolderSubject = null;
    }

    try {
        allTestsCache = await queryDatabase("SELECT * FROM test_timetables ORDER BY test_date ASC");
        renderTestFoldersOrList(opts);
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load test schedule: ${escapeHtml(err.message)}</p>`;
    }
}

function selectTestFolder(className, subjectName = null) {
    activeTestFolderClass = className;
    activeTestFolderSubject = subjectName;
    renderTestFoldersOrList({ syncHash: true });
}

function renderTestFoldersOrList(opts = {}) {
    const container = document.getElementById("tests-list");
    if (!container) return;

    const selectedClass = getSelectedClass();
    if (!activeTestFolderClass && selectedClass !== "All") {
        activeTestFolderClass = selectedClass;
    }

    if (!activeTestFolderClass) {
        if (opts.syncHash !== false) setSectionHash("#test");
        container.innerHTML = CLASS_FOLDERS.map(cls => {
            const count = (allTestsCache || []).filter(t => {
                const c = String(t.class_level || "All").toLowerCase();
                return c === cls.toLowerCase() || c === "all";
            }).length;
            return `
                <div onclick="selectTestFolder('${cls}', null)" class="glass-card p-6 rounded-3xl cursor-pointer hover:border-blue-400/50 transition flex items-center justify-between">
                    <div>
                        <span class="text-2xl">📁</span>
                        <h3 class="text-lg font-bold mt-2">Class ${cls}</h3>
                        <p class="text-xs text-gray-400">${count} test(s)</p>
                    </div>
                    <span class="text-xs text-blue-300 font-semibold">Open Folder →</span>
                </div>
            `;
        }).join("");
        return;
    }

    if (!activeTestFolderSubject) {
        if (opts.syncHash !== false) setSectionHash(`#test-${encodeURIComponent(activeTestFolderClass)}`);
        const subjects = getSubjectsForClassFolder(activeTestFolderClass, allTestsCache);

        container.innerHTML = `
            <div class="col-span-1 md:col-span-2 flex flex-wrap justify-between items-center gap-2 glass-card px-5 py-3.5 rounded-2xl">
                <div class="text-xs text-gray-300">
                    📁 Class <strong class="text-blue-300">${escapeHtml(activeTestFolderClass)}</strong> / Choose Subject Folder
                </div>
                <button type="button" onclick="activeTestFolderClass=null; activeTestFolderSubject=null; renderTestFoldersOrList();" class="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition">
                    ← All Class Folders
                </button>
            </div>
            ${subjects.map(subj => {
                const subCount = (allTestsCache || []).filter(t => {
                    const c = String(t.class_level || "All").toLowerCase();
                    const inClass = c === activeTestFolderClass.toLowerCase() || c === "all";
                    return inClass && subjectMatches(t.subject, subj);
                }).length;

                return `
                    <div onclick="selectTestFolder('${escapeHtml(activeTestFolderClass)}', '${escapeHtml(subj)}')" class="glass-card p-6 rounded-3xl cursor-pointer hover:border-blue-400/50 transition flex items-center justify-between">
                        <div>
                            <span class="text-xl">📂</span>
                            <h3 class="text-lg font-bold mt-2">${escapeHtml(subj)}</h3>
                            <p class="text-xs text-gray-400">Class ${escapeHtml(activeTestFolderClass)} • ${subCount} test(s)</p>
                        </div>
                        <span class="text-xs text-blue-300 font-semibold">Open →</span>
                    </div>
                `;
            }).join("")}
        `;
        return;
    }

    if (opts.syncHash !== false) {
        setSectionHash(`#test-${encodeURIComponent(activeTestFolderClass)}-${encodeURIComponent(activeTestFolderSubject)}`);
    }

    const items = (allTestsCache || []).filter(t => {
        const c = String(t.class_level || "All").toLowerCase();
        const inClass = c === activeTestFolderClass.toLowerCase() || c === "all";
        return inClass && subjectMatches(t.subject, activeTestFolderSubject);
    });

    const headerBar = `
        <div class="col-span-1 md:col-span-2 flex flex-wrap justify-between items-center gap-2 glass-card px-5 py-3.5 rounded-2xl">
            <div class="text-xs text-gray-300">
                📁 Class <strong class="text-blue-300">${escapeHtml(activeTestFolderClass)}</strong> / 📂 <strong class="text-indigo-300">${escapeHtml(activeTestFolderSubject)}</strong>
            </div>
            <button type="button" onclick="selectTestFolder('${escapeHtml(activeTestFolderClass)}', null)" class="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition">
                ← Subject Folders
            </button>
        </div>
    `;

    if (items.length === 0) {
        container.innerHTML = headerBar + `<p class="text-gray-400 text-sm col-span-2 text-center py-8">No tests in this folder yet.</p>`;
        return;
    }

    container.innerHTML = headerBar + items.map(t => {
        const formattedDate = new Date(t.test_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        const hasResultPdf = Boolean(t.result_pdf_url && String(t.result_pdf_url).trim());

        return `
            <div onclick="openTestDetailById(${Number(t.id)})" class="glass-card p-6 rounded-3xl flex flex-col justify-between space-y-4 cursor-pointer hover:border-blue-400/50 transition">
                <div class="space-y-2">
                    <div class="flex flex-wrap justify-between items-center gap-2">
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] bg-indigo-500/15 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/25">Class ${escapeHtml(t.class_level || activeTestFolderClass)}</span>
                            <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(t.subject)}</span>
                        </div>
                        <span class="text-xs text-gray-400">📅 ${escapeHtml(formattedDate)}</span>
                    </div>
                    <h3 class="text-lg font-bold pt-1">${escapeHtml(t.test_name)}</h3>
                    <p class="text-xs text-gray-300 line-clamp-2">${escapeHtml(t.syllabus)}</p>
                </div>

                <div class="pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-xs">
                    <span class="text-blue-300 font-semibold">Open Test Page →</span>
                    ${hasResultPdf
                        ? `<span class="text-emerald-300 font-semibold">📄 Result PDF Ready</span>`
                        : `<span class="text-gray-400">Result PDF Pending</span>`
                    }
                </div>
            </div>
        `;
    }).join("");
}

async function openTestDetailById(testId, opts = {}) {
    const container = document.getElementById("tests-list");
    if (!container) return;

    let test = (allTestsCache || []).find(t => Number(t.id) === Number(testId));
    if (!test) {
        const rows = await queryDatabase("SELECT * FROM test_timetables WHERE id = $1", [testId]);
        test = rows && rows[0];
    }
    if (!test) return;

    if (!opts.skipHashUpdate) {
        setSectionHash(`#test-${Number(test.id)}`);
    }

    const formattedDate = new Date(test.test_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
    const hasResultPdf = Boolean(test.result_pdf_url && String(test.result_pdf_url).trim());
    const embedPdfUrl = hasResultPdf ? toEmbeddablePdfUrl(test.result_pdf_url) : "";

    container.innerHTML = `
        <div class="col-span-1 md:col-span-2 glass-card p-6 sm:p-8 rounded-3xl space-y-6">
            <div class="flex flex-wrap justify-between items-start gap-3 border-b border-white/10 pb-4">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] bg-indigo-500/15 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/25">Class ${escapeHtml(test.class_level || "All")}</span>
                        <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(test.subject)}</span>
                    </div>
                    <h2 class="text-2xl font-extrabold mt-2">${escapeHtml(test.test_name)}</h2>
                    <p class="text-xs text-gray-400 mt-1">📅 Test Date: ${escapeHtml(formattedDate)}</p>
                </div>
                <div class="flex gap-2">
                    <button type="button" onclick="copyShareUrlByHash('#test-${Number(test.id)}')" class="bg-blue-600/20 hover:bg-blue-600/35 text-blue-200 border border-blue-500/30 text-xs px-3.5 py-2 rounded-xl transition">🔗 Copy Share URL</button>
                    <button type="button" onclick="renderTestFoldersOrList()" class="bg-white/10 hover:bg-white/20 text-xs px-4 py-2 rounded-xl transition">← Back</button>
                </div>
            </div>

            <div class="space-y-2">
                <h3 class="text-sm font-bold text-blue-300">📝 Syllabus</h3>
                <p class="text-sm text-gray-200 whitespace-pre-line bg-white/5 p-4 rounded-2xl border border-white/10">${escapeHtml(test.syllabus)}</p>
            </div>

            ${hasResultPdf ? `
                <div class="space-y-4">
                    <div class="flex flex-wrap justify-between items-center gap-2">
                        <h3 class="text-sm font-bold text-emerald-300">📄 Test Result PDF</h3>
                        <a href="${escapeHtml(test.result_pdf_url)}" target="_blank" rel="noopener noreferrer" download class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition">⬇️ Download PDF</a>
                    </div>
                    <div class="w-full h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#060a12]">
                        <iframe src="${escapeHtml(embedPdfUrl)}" class="w-full h-full border-0" loading="lazy"></iframe>
                    </div>
                    <div class="pt-2 flex justify-end">
                        <a href="${escapeHtml(test.result_pdf_url)}" target="_blank" rel="noopener noreferrer" download class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition">⬇️ Download PDF</a>
                    </div>
                </div>
            ` : `
                <p class="text-xs text-gray-400">Result PDF has not been published for this test yet.</p>
            `}
        </div>
    `;
}

async function handlePostMaterial(e) {
    e.preventDefault();
    const classLevel = document.getElementById("mat-class").value;
    const title = document.getElementById("mat-title").value.trim();
    const subject = document.getElementById("mat-subject").value.trim();
    const fileUrl = document.getElementById("mat-url").value.trim();

    try {
        await queryDatabase(
            "INSERT INTO study_materials (class_level, title, subject, file_url) VALUES ($1, $2, $3, $4)",
            [classLevel, title, subject, fileUrl]
        );
        alert("Study material posted!");
        document.getElementById("material-form").reset();
        await loadAdminManageLists();
    } catch (err) {
        alert("Error posting material: " + err.message);
    }
}

async function handlePostTest(e) {
    e.preventDefault();
    const classLevel = document.getElementById("test-class").value;
    const name = document.getElementById("test-name").value.trim();
    const subject = document.getElementById("test-subject").value.trim();
    const date = document.getElementById("test-date").value;
    const resultPdf = document.getElementById("test-result-pdf").value.trim() || null;
    const syllabus = document.getElementById("test-syllabus").value.trim();

    try {
        await queryDatabase(
            "INSERT INTO test_timetables (class_level, test_name, subject, test_date, syllabus, result_pdf_url) VALUES ($1, $2, $3, $4, $5, $6)",
            [classLevel, name, subject, date, syllabus, resultPdf]
        );
        alert("Test schedule published!");
        document.getElementById("test-form").reset();
        await loadAdminManageLists();
    } catch (err) {
        alert("Error posting test: " + err.message);
    }
}

async function handleUploadHtmlQuiz(e) {
    e.preventDefault();
    const classLevel = document.getElementById("html-quiz-class").value;
    const title = document.getElementById("html-quiz-title").value.trim();
    const subject = document.getElementById("html-quiz-subject").value.trim();
    const fileInput = document.getElementById("html-quiz-file");
    const btn = document.getElementById("upload-quiz-btn");

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Please select an .html quiz file first.");
        return;
    }

    const file = fileInput.files[0];
    const originalText = btn ? btn.textContent : "Upload & Publish Quiz";
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Uploading...";
    }

    try {
        const htmlContent = await file.text();
        await queryDatabase(
            "INSERT INTO quizzes (class_level, title, subject, html_content) VALUES ($1, $2, $3, $4)",
            [classLevel, title, subject, htmlContent]
        );
        alert("HTML Quiz uploaded and published!");
        document.getElementById("html-quiz-form").reset();
        await loadAdminManageLists();
    } catch (err) {
        alert("Error uploading quiz: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

async function loadAdminManageLists() {
    await Promise.all([
        renderAdminQuizzesManage(),
        renderAdminTestsManage(),
        renderAdminMaterialsManage()
    ]);
}

async function renderAdminQuizzesManage() {
    const box = document.getElementById("admin-quizzes-list");
    if (!box) return;

    const quizzes = await queryDatabase("SELECT id, title, subject, class_level, created_at FROM quizzes ORDER BY id DESC");
    if (!quizzes || quizzes.length === 0) {
        box.innerHTML = `<p class="text-gray-400">No quizzes yet.</p>`;
        return;
    }

    box.innerHTML = quizzes.map(q => `
        <div class="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-3">
            <div class="flex flex-wrap justify-between items-center gap-2">
                <div>
                    <span class="text-[10px] bg-blue-500/15 text-blue-300 px-2 py-0.5 rounded-full">Class ${escapeHtml(q.class_level || "All")}</span>
                    <span class="text-[10px] bg-white/10 text-gray-300 px-2 py-0.5 rounded-full ml-1">${escapeHtml(q.subject)}</span>
                    <strong class="text-sm text-white ml-2">${escapeHtml(q.title)}</strong>
                </div>
                <div class="flex gap-2">
                    <button type="button" onclick="editQuizItem(${q.id})" class="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-3 py-1 rounded-lg">Edit</button>
                    <button type="button" onclick="deleteQuizItem(${q.id})" class="bg-red-500/20 hover:bg-red-500/30 text-red-200 px-3 py-1 rounded-lg">Delete</button>
                    <button type="button" onclick="toggleAdminAttempts(${q.id})" class="bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 px-3 py-1 rounded-lg">Attempts</button>
                </div>
            </div>
            <div id="admin-attempts-for-quiz-${q.id}" class="hidden pt-2 border-t border-white/10"></div>
        </div>
    `).join("");
}

async function editQuizItem(id) {
    const rows = await queryDatabase("SELECT id, title, subject, class_level FROM quizzes WHERE id = $1", [id]);
    const item = rows && rows[0];
    if (!item) return;

    const newTitle = prompt("New Quiz Title:", item.title);
    if (!newTitle) return;
    const newSubject = prompt("New Subject:", item.subject);
    if (!newSubject) return;
    const newClass = prompt("New Class (8th, 9th, 10th, 11th, 12th, All):", item.class_level || "12th");
    if (!newClass) return;

    await queryDatabase(
        "UPDATE quizzes SET title = $1, subject = $2, class_level = $3 WHERE id = $4",
        [newTitle.trim(), newSubject.trim(), newClass.trim(), id]
    );
    await renderAdminQuizzesManage();
}

async function deleteQuizItem(id) {
    if (!confirm("Delete this quiz and all its recorded attempts?")) return;
    await queryDatabase("DELETE FROM quiz_results WHERE quiz_id = $1", [id]);
    await queryDatabase("DELETE FROM quizzes WHERE id = $1", [id]);
    await renderAdminQuizzesManage();
}

async function toggleAdminAttempts(quizId) {
    const container = document.getElementById(`admin-attempts-for-quiz-${quizId}`);
    if (!container) return;

    if (!container.classList.contains("hidden")) {
        container.classList.add("hidden");
        return;
    }

    container.classList.remove("hidden");
    const attempts = await queryDatabase(
        "SELECT * FROM quiz_results WHERE quiz_id = $1 ORDER BY submitted_at DESC, id DESC",
        [quizId]
    );

    if (!attempts || attempts.length === 0) {
        container.innerHTML = `<p class="text-gray-400">No student attempts recorded.</p>`;
        return;
    }

    container.innerHTML = attempts.map(a => `
        <div class="flex flex-wrap justify-between items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
            <span><strong class="text-white">${escapeHtml(a.student_name)}</strong> — ${escapeHtml(a.marks)}/${escapeHtml(a.total_marks)} (${Number(a.percentage).toFixed(1)}%) • ${Number(a.time_taken_seconds)}s</span>
            <button type="button" onclick="deleteSingleAttempt(${a.id}, ${quizId})" class="bg-red-600/25 hover:bg-red-600/40 text-red-200 px-2.5 py-1 rounded-lg">Delete Attempt</button>
        </div>
    `).join("");
}

async function deleteSingleAttempt(attemptId, quizId) {
    if (!confirm("Delete this student attempt?")) return;
    await queryDatabase("DELETE FROM quiz_results WHERE id = $1", [attemptId]);
    const container = document.getElementById(`admin-attempts-for-quiz-${quizId}`);
    if (container) {
        container.classList.add("hidden");
        await toggleAdminAttempts(quizId);
    }
}

async function renderAdminTestsManage() {
    const box = document.getElementById("admin-tests-list");
    if (!box) return;

    const tests = await queryDatabase("SELECT * FROM test_timetables ORDER BY test_date DESC, id DESC");
    if (!tests || tests.length === 0) {
        box.innerHTML = `<p class="text-gray-400">No tests scheduled yet.</p>`;
        return;
    }

    box.innerHTML = tests.map(t => `
        <div class="bg-white/5 border border-white/10 p-4 rounded-2xl flex flex-wrap justify-between items-center gap-2">
            <div>
                <span class="text-[10px] bg-indigo-500/15 text-indigo-300 px-2 py-0.5 rounded-full">Class ${escapeHtml(t.class_level || "All")}</span>
                <strong class="text-sm text-white ml-2">${escapeHtml(t.test_name)}</strong>
                <span class="text-gray-400 ml-2">(${escapeHtml(t.subject)})</span>
                <p class="text-[11px] text-emerald-300 mt-1">${t.result_pdf_url ? "Result PDF Attached" : "No Result PDF yet"}</p>
            </div>
            <div class="flex gap-2">
                <button type="button" onclick="editTestItem(${t.id})" class="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-3 py-1 rounded-lg">Edit / Add PDF</button>
                <button type="button" onclick="deleteTestItem(${t.id})" class="bg-red-500/20 hover:bg-red-500/30 text-red-200 px-3 py-1 rounded-lg">Delete</button>
            </div>
        </div>
    `).join("");
}

async function editTestItem(id) {
    const rows = await queryDatabase("SELECT * FROM test_timetables WHERE id = $1", [id]);
    const item = rows && rows[0];
    if (!item) return;

    const testName = prompt("Test Name:", item.test_name);
    if (!testName) return;
    const subject = prompt("Subject:", item.subject);
    if (!subject) return;
    const classLevel = prompt("Class (8th, 9th, 10th, 11th, 12th, All):", item.class_level || "12th");
    if (!classLevel) return;
    const syllabus = prompt("Syllabus:", item.syllabus);
    if (!syllabus) return;
    const resultPdf = prompt("Result PDF URL (leave blank if optional/none):", item.result_pdf_url || "");

    await queryDatabase(
        "UPDATE test_timetables SET test_name = $1, subject = $2, class_level = $3, syllabus = $4, result_pdf_url = $5 WHERE id = $6",
        [testName.trim(), subject.trim(), classLevel.trim(), syllabus.trim(), (resultPdf || "").trim() || null, id]
    );
    await renderAdminTestsManage();
}

async function deleteTestItem(id) {
    if (!confirm("Delete this test entry?")) return;
    await queryDatabase("DELETE FROM test_timetables WHERE id = $1", [id]);
    await renderAdminTestsManage();
}

async function renderAdminMaterialsManage() {
    const box = document.getElementById("admin-materials-list");
    if (!box) return;

    const mats = await queryDatabase("SELECT * FROM study_materials ORDER BY id DESC");
    if (!mats || mats.length === 0) {
        box.innerHTML = `<p class="text-gray-400">No study materials yet.</p>`;
        return;
    }

    box.innerHTML = mats.map(m => `
        <div class="bg-white/5 border border-white/10 p-4 rounded-2xl flex flex-wrap justify-between items-center gap-2">
            <div>
                <span class="text-[10px] bg-indigo-500/15 text-indigo-300 px-2 py-0.5 rounded-full">Class ${escapeHtml(m.class_level || "All")}</span>
                <strong class="text-sm text-white ml-2">${escapeHtml(m.title)}</strong>
                <span class="text-gray-400 ml-2">(${escapeHtml(m.subject)})</span>
            </div>
            <div class="flex gap-2">
                <button type="button" onclick="editMaterialItem(${m.id})" class="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-3 py-1 rounded-lg">Edit</button>
                <button type="button" onclick="deleteMaterialItem(${m.id})" class="bg-red-500/20 hover:bg-red-500/30 text-red-200 px-3 py-1 rounded-lg">Delete</button>
            </div>
        </div>
    `).join("");
}

async function editMaterialItem(id) {
    const rows = await queryDatabase("SELECT * FROM study_materials WHERE id = $1", [id]);
    const item = rows && rows[0];
    if (!item) return;

    const title = prompt("Material Title:", item.title);
    if (!title) return;
    const subject = prompt("Subject:", item.subject);
    if (!subject) return;
    const classLevel = prompt("Class (8th, 9th, 10th, 11th, 12th, All):", item.class_level || "12th");
    if (!classLevel) return;
    const fileUrl = prompt("PDF URL:", item.file_url);
    if (!fileUrl) return;

    await queryDatabase(
        "UPDATE study_materials SET title = $1, subject = $2, class_level = $3, file_url = $4 WHERE id = $5",
        [title.trim(), subject.trim(), classLevel.trim(), fileUrl.trim(), id]
    );
    await renderAdminMaterialsManage();
}

async function deleteMaterialItem(id) {
    if (!confirm("Delete this study material?")) return;
    await queryDatabase("DELETE FROM study_materials WHERE id = $1", [id]);
    await renderAdminMaterialsManage();
}
// ============================================================================
// PART 3 OF 3: QUIZ FOLDERS, SHARE URL, FULLSCREEN, AUTO-RESULT & ATTEMPTS
// ============================================================================

async function loadQuizzesList(opts = {}) {
    const container = document.getElementById("quiz-list");
    if (!container) return;

    const selectedClass = getSelectedClass();
    if (!opts.preserveFolder) {
        activeQuizFolderClass = selectedClass !== "All" ? selectedClass : null;
        activeQuizFolderSubject = null;
    }

    try {
        allQuizzesCache = await queryDatabase("SELECT id, title, subject, class_level, html_url, created_at FROM quizzes ORDER BY created_at DESC");
        renderQuizFoldersOrList(opts);
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load quizzes: ${escapeHtml(err.message)}</p>`;
    }
}

function selectQuizFolder(className, subjectName = null) {
    activeQuizFolderClass = className;
    activeQuizFolderSubject = subjectName;
    renderQuizFoldersOrList({ syncHash: true });
}

function filterQuizzes() {
    const sortOrder = document.getElementById("filter-sort")?.value || "newest";
    allQuizzesCache.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });
    renderQuizFoldersOrList({ syncHash: false });
}

function copyShareUrlByHash(hashTarget) {
    const fullUrl = `${window.location.origin}${window.location.pathname}${hashTarget}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullUrl).then(() => {
            alert("Share URL copied!");
        }).catch(() => {
            prompt("Copy Share URL:", fullUrl);
        });
    } else {
        prompt("Copy Share URL:", fullUrl);
    }
}

function renderQuizFoldersOrList(opts = {}) {
    const container = document.getElementById("quiz-list");
    if (!container) return;

    const selectedClass = getSelectedClass();
    if (!activeQuizFolderClass && selectedClass !== "All") {
        activeQuizFolderClass = selectedClass;
    }

    if (!activeQuizFolderClass) {
        if (opts.syncHash !== false) setSectionHash("#quiz");
        container.innerHTML = CLASS_FOLDERS.map(cls => {
            const count = (allQuizzesCache || []).filter(q => {
                const c = String(q.class_level || "All").toLowerCase();
                return c === cls.toLowerCase() || c === "all";
            }).length;
            return `
                <div onclick="selectQuizFolder('${cls}', null)" class="glass-card p-6 rounded-3xl cursor-pointer hover:border-blue-400/50 transition flex items-center justify-between">
                    <div>
                        <span class="text-2xl">📁</span>
                        <h3 class="text-lg font-bold mt-2">Class ${cls}</h3>
                        <p class="text-xs text-gray-400">${count} quiz(zes)</p>
                    </div>
                    <span class="text-xs text-blue-300 font-semibold">Open Folder →</span>
                </div>
            `;
        }).join("");
        return;
    }

    if (!activeQuizFolderSubject) {
        if (opts.syncHash !== false) setSectionHash(`#quiz-${encodeURIComponent(activeQuizFolderClass)}`);
        const subjects = getSubjectsForClassFolder(activeQuizFolderClass, allQuizzesCache);

        container.innerHTML = `
            <div class="col-span-1 md:col-span-2 flex flex-wrap justify-between items-center gap-2 glass-card px-5 py-3.5 rounded-2xl">
                <div class="text-xs text-gray-300">
                    📁 Class <strong class="text-blue-300">${escapeHtml(activeQuizFolderClass)}</strong> / Choose Subject Folder
                </div>
                <button type="button" onclick="activeQuizFolderClass=null; activeQuizFolderSubject=null; renderQuizFoldersOrList();" class="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition">
                    ← All Class Folders
                </button>
            </div>
            ${subjects.map(subj => {
                const subCount = (allQuizzesCache || []).filter(q => {
                    const c = String(q.class_level || "All").toLowerCase();
                    const inClass = c === activeQuizFolderClass.toLowerCase() || c === "all";
                    return inClass && subjectMatches(q.subject, subj);
                }).length;

                return `
                    <div onclick="selectQuizFolder('${escapeHtml(activeQuizFolderClass)}', '${escapeHtml(subj)}')" class="glass-card p-6 rounded-3xl cursor-pointer hover:border-blue-400/50 transition flex items-center justify-between">
                        <div>
                            <span class="text-xl">📂</span>
                            <h3 class="text-lg font-bold mt-2">${escapeHtml(subj)}</h3>
                            <p class="text-xs text-gray-400">Class ${escapeHtml(activeQuizFolderClass)} • ${subCount} quiz(zes)</p>
                        </div>
                        <span class="text-xs text-blue-300 font-semibold">Open →</span>
                    </div>
                `;
            }).join("")}
        `;
        return;
    }

    if (opts.syncHash !== false) {
        setSectionHash(`#quiz-${encodeURIComponent(activeQuizFolderClass)}-${encodeURIComponent(activeQuizFolderSubject)}`);
    }

    const quizzes = (allQuizzesCache || []).filter(q => {
        const c = String(q.class_level || "All").toLowerCase();
        const inClass = c === activeQuizFolderClass.toLowerCase() || c === "all";
        return inClass && subjectMatches(q.subject, activeQuizFolderSubject);
    });

    const headerBar = `
        <div class="col-span-1 md:col-span-2 flex flex-wrap justify-between items-center gap-2 glass-card px-5 py-3.5 rounded-2xl">
            <div class="text-xs text-gray-300">
                📁 Class <strong class="text-blue-300">${escapeHtml(activeQuizFolderClass)}</strong> / 📂 <strong class="text-indigo-300">${escapeHtml(activeQuizFolderSubject)}</strong>
            </div>
            <button type="button" onclick="selectQuizFolder('${escapeHtml(activeQuizFolderClass)}', null)" class="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition">
                ← Subject Folders
            </button>
        </div>
    `;

    if (quizzes.length === 0) {
        container.innerHTML = headerBar + `<p class="text-gray-400 text-sm col-span-2 text-center py-8">No quizzes in this folder yet.</p>`;
        return;
    }

    container.innerHTML = headerBar + quizzes.map(q => {
        const postedDate = q.created_at
            ? new Date(q.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
            : "";

        return `
            <div class="glass-card p-6 rounded-3xl flex flex-col justify-between space-y-4">
                <div>
                    <div class="flex justify-between items-center gap-2">
                        <div class="flex items-center gap-1.5">
                            <span class="text-[10px] bg-indigo-500/15 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/25">Class ${escapeHtml(q.class_level || activeQuizFolderClass)}</span>
                            <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(q.subject)}</span>
                        </div>
                        <span class="text-[11px] text-gray-400">${escapeHtml(postedDate)}</span>
                    </div>
                    <h3 class="text-lg font-bold mt-2">${escapeHtml(q.title)}</h3>
                </div>
                <div class="flex gap-2">
                    <button type="button" onclick="openQuizById(${Number(q.id)})" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2.5 px-4 rounded-xl transition shadow-lg shadow-blue-600/30 flex-1">Open Quiz & Results</button>
                    <button type="button" onclick="copyShareUrlByHash('#quiz-${Number(q.id)}')" class="bg-white/10 hover:bg-white/20 text-blue-200 text-xs font-medium py-2.5 px-3.5 rounded-xl transition">🔗 Copy Share URL</button>
                </div>
            </div>
        `;
    }).join("");
}

function getStudentAttemptNumber(resultsList, studentName) {
    const cleanName = String(studentName || "").trim().toLowerCase();
    if (!cleanName || !Array.isArray(resultsList)) return 1;
    const priorAttempts = resultsList.filter(
        r => String(r.student_name || "").trim().toLowerCase() === cleanName
    ).length;
    return priorAttempts + 1;
}

function startLiveQuizClock() {
    if (activeQuizTimer) {
        clearInterval(activeQuizTimer);
        activeQuizTimer = null;
    }
    secondsElapsed = 0;
    updateClockHeaderUI();

    activeQuizTimer = setInterval(() => {
        secondsElapsed++;
        updateClockHeaderUI();
    }, 1000);
}

function updateClockHeaderUI() {
    const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
    const secs = String(secondsElapsed % 60).padStart(2, "0");
    const mmssEl = document.getElementById("header-time-mmss");
    const secEl = document.getElementById("header-seconds-count");
    if (mmssEl) mmssEl.textContent = `${mins}:${secs}`;
    if (secEl) secEl.textContent = `${secondsElapsed}s`;
}

function updateAttemptHeaderUI() {
    if (!currentActiveQuizSession) return;
    const studentAttemptEl = document.getElementById("header-student-attempt");
    const totalAttemptsEl = document.getElementById("header-attempts-count");
    if (studentAttemptEl) studentAttemptEl.textContent = String(currentActiveQuizSession.attemptNumber);
    if (totalAttemptsEl) totalAttemptsEl.textContent = String(currentActiveQuizSession.totalAttemptsSoFar);
}

function enableCachedNameEdit() {
    const displayWrap = document.getElementById("cached-name-display");
    const editWrap = document.getElementById("cached-name-edit");
    const editInput = document.getElementById("quiz-start-student-name");
    if (displayWrap) displayWrap.classList.add("hidden");
    if (editWrap) editWrap.classList.remove("hidden");
    if (editInput) editInput.focus();
}

async function openQuizById(quizId, opts = {}) {
    cleanupQuizTimers();
    const portal = document.getElementById("quiz-portal-container");
    if (!portal) return;

    if (!opts.skipHashUpdate) {
        setSectionHash(`#quiz-${Number(quizId)}`);
    }
    portal.innerHTML = `<p class="text-gray-400 text-sm text-center py-8">Loading quiz...</p>`;

    try {
        const rows = await queryDatabase("SELECT * FROM quizzes WHERE id = $1", [quizId]);
        const quiz = rows && rows[0];

        if (!quiz) {
            portal.innerHTML = `<p class="text-red-400 text-sm text-center py-8">Quiz not found.</p>`;
            return;
        }

        const existingResults = await queryDatabase(
            "SELECT * FROM quiz_results WHERE quiz_id = $1 ORDER BY submitted_at ASC, id ASC",
            [quiz.id]
        );
        const attemptsCount = existingResults ? existingResults.length : 0;
        const cachedName = getCachedStudentName();

        portal.innerHTML = `
            <div class="space-y-6">
                <div class="glass-card p-6 rounded-3xl flex flex-wrap justify-between items-center gap-4">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] bg-indigo-500/15 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/25">Class ${escapeHtml(quiz.class_level || "All")}</span>
                            <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(quiz.subject)}</span>
                        </div>
                        <h2 class="text-xl font-bold mt-2">${escapeHtml(quiz.title)}</h2>
                        <p class="text-xs text-gray-400 mt-1">Total Attempts: <span class="text-blue-300 font-semibold">${attemptsCount}</span></p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="copyShareUrlByHash('#quiz-${Number(quiz.id)}')" class="bg-blue-600/20 hover:bg-blue-600/35 text-blue-200 border border-blue-500/30 text-xs px-3.5 py-2 rounded-xl transition">🔗 Copy Share URL</button>
                        <button type="button" onclick="renderQuizFoldersOrList()" class="bg-white/10 hover:bg-white/20 text-xs px-4 py-2 rounded-xl transition">← Back</button>
                    </div>
                </div>

                <div class="glass-card p-8 rounded-3xl space-y-4 max-w-xl mx-auto">
                    <h3 class="text-lg font-bold text-blue-300">Ready to Start</h3>

                    <div id="cached-name-display" class="${cachedName ? "" : "hidden"} bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between gap-3">
                        <div>
                            <p class="text-[11px] text-gray-400">Saved Student Name</p>
                            <p id="saved-name-label" class="text-sm font-bold text-white">${escapeHtml(cachedName)}</p>
                        </div>
                        <button type="button" onclick="enableCachedNameEdit()" class="text-xs bg-white/10 hover:bg-white/20 text-blue-300 px-3.5 py-1.5 rounded-xl transition">✏️ Edit</button>
                    </div>

                    <div id="cached-name-edit" class="${cachedName ? "hidden" : ""} space-y-2">
                        <label for="quiz-start-student-name" class="block text-xs text-gray-300">Student Full Name</label>
                        <input type="text" id="quiz-start-student-name" value="${escapeHtml(cachedName)}" placeholder="Enter Your Full Name"
                               class="w-full bg-white/5 border border-white/10 p-3.5 rounded-2xl text-sm focus:outline-none focus:border-blue-500">
                    </div>

                    <button type="button" id="start-fullscreen-quiz-btn"
                            class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-3.5 rounded-2xl text-sm font-semibold transition shadow-lg shadow-blue-600/30">
                        Start Quiz in Fullscreen →
                    </button>
                </div>

                <div id="quiz-attempts-beneath"></div>
            </div>
        `;

        await renderAttemptsTable(quiz.id, "quiz-attempts-beneath");

        document.getElementById("start-fullscreen-quiz-btn")?.addEventListener("click", async () => {
            const editBox = document.getElementById("cached-name-edit");
            const isEditing = editBox && !editBox.classList.contains("hidden");
            const inputName = (document.getElementById("quiz-start-student-name")?.value || "").trim();
            const studentName = isEditing ? inputName : (getCachedStudentName() || inputName);

            if (!studentName) {
                alert("Please enter your full name before starting the quiz.");
                enableCachedNameEdit();
                return;
            }

            setCachedStudentName(studentName);
            await launchFullscreenQuizStage(quiz, studentName, attemptsCount);
        });
    } catch (err) {
        portal.innerHTML = `<p class="text-red-400 text-sm text-center py-8">Error loading quiz: ${escapeHtml(err.message)}</p>`;
    }
}

async function launchFullscreenQuizStage(quiz, studentName, attemptsCount) {
    cleanupQuizTimers();
    const portal = document.getElementById("quiz-portal-container");
    if (!portal) return;

    const existingResults = await queryDatabase(
        "SELECT * FROM quiz_results WHERE quiz_id = $1 ORDER BY submitted_at ASC, id ASC",
        [quiz.id]
    );
    const totalAttemptsSoFar = existingResults ? existingResults.length : attemptsCount;
    const nextStudentAttempt = getStudentAttemptNumber(existingResults, studentName);

    currentActiveQuizSession = {
        quizId: Number(quiz.id),
        quizTitle: quiz.title,
        studentName,
        attemptNumber: nextStudentAttempt,
        totalAttemptsSoFar,
        recordedForCurrentRun: false
    };

    portal.innerHTML = `
        <div id="quiz-fullscreen-stage" class="bg-[#060A12] border border-white/15 rounded-3xl overflow-hidden flex flex-col min-h-screen shadow-2xl">
            <div class="sticky top-0 z-30 bg-[#070d1a]/95 backdrop-blur-2xl border-b border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-xs shrink-0">
                        #${nextStudentAttempt}
                    </div>
                    <div class="min-w-0">
                        <p class="text-xs text-gray-300 truncate">
                            <span class="font-semibold text-white">${escapeHtml(studentName)}</span>
                            <span class="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-blue-500/15 text-blue-300 border border-blue-500/25">
                                Attempt #<span id="header-student-attempt">${nextStudentAttempt}</span>
                            </span>
                        </p>
                        <h3 class="text-sm font-bold text-blue-400 truncate">${escapeHtml(quiz.title)}</h3>
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-2 text-xs">
                    <div class="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                        ⏱️ Time: <span id="header-time-mmss" class="font-bold text-blue-300">00:00</span>
                    </div>
                    <div class="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                        ⏳ Seconds: <span id="header-seconds-count" class="font-bold text-emerald-300">0s</span>
                    </div>
                    <div class="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                        📊 Attempts: <span id="header-attempts-count" class="font-bold text-amber-300">${totalAttemptsSoFar}</span>
                    </div>
                    <button type="button" onclick="exitQuizFullscreenAndReturn()" class="bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 px-3 py-1.5 rounded-xl transition font-medium">
                        Exit
                    </button>
                </div>
            </div>

            <iframe id="uploaded-quiz-frame" class="w-full flex-grow min-h-[78vh] border-0 bg-[#060A12]"></iframe>
        </div>

        <div id="quiz-attempts-beneath" class="mt-6"></div>
    `;

    const stageEl = document.getElementById("quiz-fullscreen-stage");
    if (stageEl && stageEl.requestFullscreen) {
        try {
            await stageEl.requestFullscreen();
        } catch (_) {}
    }

    startLiveQuizClock();

    const iframe = document.getElementById("uploaded-quiz-frame");
    if (quiz.html_content) {
        iframe.srcdoc = quiz.html_content;
    } else if (quiz.html_url) {
        iframe.src = quiz.html_url;
    }

    await renderAttemptsTable(quiz.id, "quiz-attempts-beneath");
    startWatchingIframeCompletion(iframe);
}

function startWatchingIframeCompletion(iframe) {
    quizWatcherInterval = setInterval(async () => {
        if (!currentActiveQuizSession) return;

        try {
            const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
            if (!doc || !doc.body) return;

            const resultEl = doc.querySelector("#result");
            const quizEl = doc.querySelector("#quiz");
            const bodyText = (doc.body.innerText || "").trim();
            const isCompletedScreen = Boolean(
                (resultEl && !resultEl.classList.contains("hidden")) ||
                (quizEl && quizEl.classList.contains("hidden") && resultEl && resultEl.innerText.trim().length > 0) ||
                /Quiz Complete!|Outstanding!|Excellent work!|Good effort|Revise the chapter/i.test(bodyText)
            );

            if (currentActiveQuizSession.recordedForCurrentRun && !isCompletedScreen) {
                currentActiveQuizSession.recordedForCurrentRun = false;
                currentActiveQuizSession.attemptNumber += 1;
                updateAttemptHeaderUI();
                startLiveQuizClock();
                return;
            }

            if (!isCompletedScreen || currentActiveQuizSession.recordedForCurrentRun) return;

            const resultText = (resultEl ? resultEl.innerText : bodyText).trim();
            const scoreMatch = resultText.match(/(\d+)\s*\/\s*(\d+)/);
            const marks = scoreMatch ? Number(scoreMatch[1]) : 0;
            const totalMarks = scoreMatch ? Number(scoreMatch[2]) : 0;

            let finalSeconds = secondsElapsed;
            const minSecMatch = bodyText.match(/Time:\s*(?:(\d+)m\s*)?(\d+)s/i);
            const mmssMatch = resultText.match(/(\d{2,}):(\d{2})/);
            if (minSecMatch) {
                finalSeconds = Number(minSecMatch[1] || 0) * 60 + Number(minSecMatch[2] || 0);
            } else if (mmssMatch) {
                finalSeconds = Number(mmssMatch[1] || 0) * 60 + Number(mmssMatch[2] || 0);
            }

            currentActiveQuizSession.recordedForCurrentRun = true;
            if (activeQuizTimer) {
                clearInterval(activeQuizTimer);
                activeQuizTimer = null;
            }

            const percentage = totalMarks > 0 ? Number(((marks / totalMarks) * 100).toFixed(2)) : 0;
            const { quizId, studentName } = currentActiveQuizSession;

            await queryDatabase(
                "INSERT INTO quiz_results (quiz_id, student_name, marks, total_marks, percentage, time_taken_seconds) VALUES ($1, $2, $3, $4, $5, $6)",
                [quizId, studentName, marks, totalMarks, percentage, finalSeconds]
            );

            currentActiveQuizSession.totalAttemptsSoFar += 1;
            updateAttemptHeaderUI();
            await renderAttemptsTable(quizId, "quiz-attempts-beneath");
        } catch (err) {
            console.error("Error reading/saving quiz completion:", err);
        }
    }, 500);
}

async function exitQuizFullscreenAndReturn() {
    if (document.fullscreenElement && document.exitFullscreen) {
        try {
            await document.exitFullscreen();
        } catch (_) {}
    }
    cleanupQuizTimers();
    await loadPage("quiz");
}

async function renderAttemptsTable(quizId, targetElementId) {
    const target = document.getElementById(targetElementId);
    if (!target) return;

    try {
        const results = await queryDatabase(
            "SELECT * FROM quiz_results WHERE quiz_id = $1 ORDER BY marks DESC, time_taken_seconds ASC, submitted_at DESC",
            [quizId]
        );

        if (!results || results.length === 0) {
            target.innerHTML = `
                <div class="glass-card p-6 rounded-3xl flex justify-between items-center text-xs text-gray-400">
                    <span>No attempts recorded for this quiz yet.</span>
                    <span>Total Attempts: 0</span>
                </div>
            `;
            return;
        }

        const chronological = [...results].sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at) || a.id - b.id);
        const studentCounter = {};
        const attemptNumberById = {};
        chronological.forEach(r => {
            const key = String(r.student_name || "").trim().toLowerCase();
            studentCounter[key] = (studentCounter[key] || 0) + 1;
            attemptNumberById[r.id] = studentCounter[key];
        });

        target.innerHTML = `
            <div class="glass-card p-6 rounded-3xl space-y-4">
                <div class="flex justify-between items-center">
                    <h3 class="text-base font-bold text-blue-300">🏆 Attempts & Results</h3>
                    <span class="text-xs text-gray-400">Total Attempts: ${results.length}</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                        <thead>
                            <tr class="border-b border-white/10 text-gray-400">
                                <th class="pb-3">Rank</th>
                                <th class="pb-3">Student Name</th>
                                <th class="pb-3">Attempt</th>
                                <th class="pb-3">Score</th>
                                <th class="pb-3">Percentage</th>
                                <th class="pb-3">Time Taken</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${results.map((r, idx) => `
                                <tr class="${idx === 0 ? "text-yellow-400 font-bold" : ""}">
                                    <td class="py-3">#${idx + 1}</td>
                                    <td class="py-3">${escapeHtml(r.student_name)}</td>
                                    <td class="py-3">Attempt #${attemptNumberById[r.id] || 1}</td>
                                    <td class="py-3">${escapeHtml(r.marks)} / ${escapeHtml(r.total_marks)}</td>
                                    <td class="py-3">${Number(r.percentage).toFixed(1)}%</td>
                                    <td class="py-3">${Math.floor(Number(r.time_taken_seconds) / 60)}m ${Number(r.time_taken_seconds) % 60}s</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (err) {
        target.innerHTML = `<p class="text-red-400 text-xs">Could not load attempts: ${escapeHtml(err.message)}</p>`;
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}