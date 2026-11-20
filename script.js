// ============================================================================
// PART 1: CLASS STATE, STUDENT NAME CACHE, ROUTER & ADMIN CRUD
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

const CLASS_STORAGE_KEY = "ft_selected_class";
const STUDENT_NAME_STORAGE_KEY = "ft_cached_student_name";

function getSelectedClass() {
    return localStorage.getItem(CLASS_STORAGE_KEY) || "All";
}

function setActiveClass(classValue) {
    localStorage.setItem(CLASS_STORAGE_KEY, classValue || "All");
    syncClassSelectorUI();

    const filterClassEl = document.getElementById("filter-class");
    if (filterClassEl) {
        filterClassEl.value = classValue === "All" ? "all" : classValue;
    }

    if (document.getElementById("quiz-list")) filterQuizzes();
    if (document.getElementById("materials-list")) renderMaterials(allMaterialsCache);
    if (document.getElementById("tests-list")) renderTests(allTestsCache);
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

function tryStartApp() {
    if (domLoaded && neonLoaded) {
        syncClassSelectorUI();
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

async function loadPage(pageName) {
    cleanupQuizTimers();
    if (slideshowInterval) {
        clearInterval(slideshowInterval);
        slideshowInterval = null;
    }

    try {
        const response = await fetch(`pages/${pageName}.html`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const htmlContent = await response.text();
        document.getElementById("app").innerHTML = htmlContent;
        syncClassSelectorUI();
        window.scrollTo({ top: 0, behavior: "smooth" });

        if (pageName === "home") {
            initSlideshow();
        } else if (pageName === "quiz") {
            await loadQuizzesList();
        } else if (pageName === "material") {
            await loadMaterialsList();
        } else if (pageName === "test") {
            await loadTestsList();
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
    const hash = window.location.hash;

    if (hash === "#ftadmin") {
        const enteredPin = prompt("Enter Admin Secret PIN:");
        if (!enteredPin) {
            history.replaceState(null, "", "#home");
            await loadPage("home");
            return;
        }

        try {
            await verifyAdminPinOnServer(enteredPin);
            await loadPage("admin");
        } catch (err) {
            if (typeof setSessionAdminPin === "function") {
                setSessionAdminPin("");
            }
            alert(err && err.message ? err.message : "Incorrect PIN");
            history.replaceState(null, "", "#home");
            await loadPage("home");
        }
    } else if (hash && hash.startsWith("#quiz-")) {
        const quizId = Number(hash.replace("#quiz-", ""));
        await loadPage("quiz");
        if (quizId) {
            await openQuizById(quizId);
        }
    } else {
        await loadPage("home");
    }
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

// --- STUDY VAULT & TEST SERIES ---

function matchesSelectedClass(itemClass) {
    const selected = getSelectedClass();
    if (!selected || selected === "All") return true;
    const normalized = String(itemClass || "All").toLowerCase();
    return normalized === "all" || normalized === selected.toLowerCase();
}

async function loadMaterialsList() {
    const container = document.getElementById("materials-list");
    if (!container) return;

    try {
        allMaterialsCache = await queryDatabase("SELECT * FROM study_materials ORDER BY uploaded_at DESC");
        renderMaterials(allMaterialsCache);
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load materials: ${escapeHtml(err.message)}</p>`;
    }
}

function renderMaterials(items) {
    const container = document.getElementById("materials-list");
    if (!container) return;

    const filtered = (items || []).filter(m => matchesSelectedClass(m.class_level));
    if (filtered.length === 0) {
        container.innerHTML = `<p class="text-gray-400 text-sm col-span-2 text-center py-8">No study materials for ${escapeHtml(getSelectedClass())} yet.</p>`;
        return;
    }

    container.innerHTML = filtered.map(m => `
        <div class="glass-card p-6 rounded-3xl flex flex-col justify-between space-y-4">
            <div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] bg-indigo-500/15 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/25">Class ${escapeHtml(m.class_level || "All")}</span>
                    <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(m.subject)}</span>
                </div>
                <h3 class="text-lg font-bold mt-2">${escapeHtml(m.title)}</h3>
            </div>
            <a href="${escapeHtml(m.file_url)}" target="_blank" rel="noopener noreferrer" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2.5 px-4 rounded-xl transition text-center shadow-lg shadow-blue-600/30">Open / Download PDF</a>
        </div>
    `).join("");
}

async function loadTestsList() {
    const container = document.getElementById("tests-list");
    if (!container) return;

    try {
        allTestsCache = await queryDatabase("SELECT * FROM test_timetables ORDER BY test_date ASC");
        renderTests(allTestsCache);
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load test schedule: ${escapeHtml(err.message)}</p>`;
    }
}

function renderTests(items) {
    const container = document.getElementById("tests-list");
    if (!container) return;

    const filtered = (items || []).filter(t => matchesSelectedClass(t.class_level));
    if (filtered.length === 0) {
        container.innerHTML = `<p class="text-gray-400 text-sm col-span-2 text-center py-8">No tests scheduled for ${escapeHtml(getSelectedClass())} yet.</p>`;
        return;
    }

    container.innerHTML = filtered.map(t => {
        const formattedDate = new Date(t.test_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        const hasResultPdf = Boolean(t.result_pdf_url && String(t.result_pdf_url).trim());

        return `
            <div class="glass-card p-6 rounded-3xl flex flex-col justify-between space-y-4">
                <div class="space-y-2">
                    <div class="flex flex-wrap justify-between items-center gap-2">
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] bg-indigo-500/15 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/25">Class ${escapeHtml(t.class_level || "All")}</span>
                            <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(t.subject)}</span>
                        </div>
                        <span class="text-xs text-gray-400">📅 ${escapeHtml(formattedDate)}</span>
                    </div>
                    <h3 class="text-lg font-bold pt-1">${escapeHtml(t.test_name)}</h3>
                    <p class="text-xs text-gray-300">${escapeHtml(t.syllabus)}</p>
                </div>

                <div class="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                    ${hasResultPdf
                        ? `<a href="${escapeHtml(t.result_pdf_url)}" target="_blank" rel="noopener noreferrer" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition text-center shadow-lg shadow-emerald-600/25">📄 View / Download Result PDF</a>`
                        : `<span class="text-[11px] text-gray-400">Result PDF: Not published yet</span>`
                    }
                </div>
            </div>
        `;
    }).join("");
}
// --- ADMIN CREATE, EDIT & DELETE ---

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
        const res = await queryDatabase(
            "INSERT INTO quizzes (class_level, title, subject, html_content) VALUES ($1, $2, $3, $4) RETURNING id",
            [classLevel, title, subject, htmlContent]
        );
        const shareLink = `${window.location.origin}${window.location.pathname}#quiz-${res[0].id}`;
        alert(`Quiz uploaded!\nShare Link:\n${shareLink}`);
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
// PART 2: QUIZ PORTAL, CACHED NAME + EDIT, FULLSCREEN & ATTEMPTS
// ============================================================================

async function loadQuizzesList() {
    const container = document.getElementById("quiz-list");
    if (!container) return;

    const filterClassEl = document.getElementById("filter-class");
    const selectedClass = getSelectedClass();
    if (filterClassEl && selectedClass !== "All") {
        filterClassEl.value = selectedClass;
    }

    try {
        allQuizzesCache = await queryDatabase("SELECT id, title, subject, class_level, html_url, created_at FROM quizzes ORDER BY created_at DESC");
        filterQuizzes();
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load quizzes: ${escapeHtml(err.message)}</p>`;
    }
}

function filterQuizzes() {
    const dropdownClass = document.getElementById("filter-class")?.value || "all";
    const activeTopClass = getSelectedClass();
    const effectiveClass = dropdownClass !== "all" ? dropdownClass : activeTopClass;

    const subjectFilter = document.getElementById("filter-subject")?.value || "all";
    const sortOrder = document.getElementById("filter-sort")?.value || "newest";

    let filtered = [...allQuizzesCache];

    if (effectiveClass && effectiveClass.toLowerCase() !== "all") {
        filtered = filtered.filter(q => {
            const qClass = String(q.class_level || "All").toLowerCase();
            return qClass === "all" || qClass === effectiveClass.toLowerCase();
        });
    }

    if (subjectFilter !== "all") {
        filtered = filtered.filter(q => String(q.subject).toLowerCase() === subjectFilter.toLowerCase());
    }

    filtered.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    renderQuizzes(filtered);
}

function getQuizShareLink(quizId) {
    return `${window.location.origin}${window.location.pathname}#quiz-${quizId}`;
}

function copyQuizLink(link) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => {
            alert("Quiz link copied:\n" + link);
        }).catch(() => {
            prompt("Copy quiz link:", link);
        });
    } else {
        prompt("Copy quiz link:", link);
    }
}

function renderQuizzes(quizzes) {
    const container = document.getElementById("quiz-list");
    if (!container) return;

    if (!quizzes || quizzes.length === 0) {
        container.innerHTML = `<p class="text-gray-400 text-sm col-span-2 text-center py-8">No quizzes found matching your filter.</p>`;
        return;
    }

    container.innerHTML = quizzes.map(q => {
        const postedDate = q.created_at
            ? new Date(q.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
            : "";
        const shareLink = getQuizShareLink(q.id);

        return `
            <div class="glass-card p-6 rounded-3xl flex flex-col justify-between space-y-4">
                <div>
                    <div class="flex justify-between items-center gap-2">
                        <div class="flex items-center gap-1.5">
                            <span class="text-[10px] bg-indigo-500/15 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/25">Class ${escapeHtml(q.class_level || "All")}</span>
                            <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(q.subject)}</span>
                        </div>
                        <span class="text-[11px] text-gray-400">${escapeHtml(postedDate)}</span>
                    </div>
                    <h3 class="text-lg font-bold mt-2">${escapeHtml(q.title)}</h3>
                    <p class="text-[11px] text-gray-400 mt-1 break-all">Link: <span class="text-blue-300">${escapeHtml(shareLink)}</span></p>
                </div>
                <div class="flex gap-2">
                    <button type="button" onclick="openQuizById(${Number(q.id)})" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2.5 px-4 rounded-xl transition shadow-lg shadow-blue-600/30 flex-1">Open Quiz & Results</button>
                    <button type="button" onclick="copyQuizLink('${escapeHtml(shareLink)}')" class="bg-white/10 hover:bg-white/20 text-gray-200 text-xs font-medium py-2.5 px-3 rounded-xl transition">Copy</button>
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
    if (editInput) {
        editInput.focus();
    }
}

async function openQuizById(quizId) {
    cleanupQuizTimers();
    const portal = document.getElementById("quiz-portal-container");
    if (!portal) return;

    history.replaceState(null, "", `#quiz-${quizId}`);
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
        const shareUrl = getQuizShareLink(quiz.id);
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
                        <div class="flex flex-wrap items-center gap-2 mt-2">
                            <code class="text-xs text-blue-300 bg-white/5 px-2.5 py-1 rounded-lg break-all">${escapeHtml(shareUrl)}</code>
                            <button type="button" onclick="copyQuizLink('${escapeHtml(shareUrl)}')" class="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 px-3 py-1 rounded-lg border border-blue-500/30 transition">Copy Link</button>
                        </div>
                    </div>
                    <button type="button" onclick="history.replaceState(null, '', '#quiz'); loadPage('quiz');" class="bg-white/10 hover:bg-white/20 text-xs px-4 py-2 rounded-xl transition">← All Quizzes</button>
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

            const text = (doc.body.innerText || "").trim();
            const isCompletedScreen = Boolean(text && /Quiz Complete!/i.test(text));

            if (currentActiveQuizSession.recordedForCurrentRun && !isCompletedScreen) {
                currentActiveQuizSession.recordedForCurrentRun = false;
                currentActiveQuizSession.attemptNumber += 1;
                updateAttemptHeaderUI();
                startLiveQuizClock();
                return;
            }

            if (!isCompletedScreen || currentActiveQuizSession.recordedForCurrentRun) return;

            const scoreMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
            const marks = scoreMatch ? Number(scoreMatch[1]) : 0;
            const totalMarks = scoreMatch ? Number(scoreMatch[2]) : 0;

            let finalSeconds = secondsElapsed;
            const timeMatch = text.match(/Time:\s*(?:(\d+)m\s*)?(\d+)s/i);
            if (timeMatch) {
                const mins = Number(timeMatch[1] || 0);
                const secs = Number(timeMatch[2] || 0);
                finalSeconds = mins * 60 + secs;
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
    history.replaceState(null, "", "#quiz");
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