// --- INITIALIZATION & ROUTER ---

let domLoaded = false;
let neonLoaded = Boolean(window.neon);
let slideshowInterval = null;
let allQuizzesCache = [];
let activeQuizTimer = null;
let secondsElapsed = 0;
let quizWatcherInterval = null;
let currentActiveQuizSession = null;

function tryStartApp() {
    if (domLoaded && neonLoaded) {
        handleRoute();
    }
}

window.addEventListener("DOMContentLoaded", () => {
    domLoaded = true;
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

// Dynamically load pages from 'pages/' into #app
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
        window.scrollTo({ top: 0, behavior: "smooth" });

        if (pageName === "home") {
            initSlideshow();
        } else if (pageName === "quiz") {
            await loadQuizzesList();
        } else if (pageName === "material") {
            await loadMaterialsList();
        } else if (pageName === "test") {
            await loadTestsList();
        }
    } catch (error) {
        console.error("Error loading page:", error);
        document.getElementById("app").innerHTML = `
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl text-center max-w-lg mx-auto mt-12 shadow-2xl">
                <h2 class="text-xl font-bold text-red-400 mb-2">Page Not Found</h2>
                <p class="text-gray-400 text-sm">Could not load <code class="text-blue-300">pages/${escapeHtml(pageName)}.html</code>.</p>
            </div>
        `;
    }
}

// Check URL hash for #ftadmin, #quiz-<id>, or default page
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


// --- HOME SLIDESHOW (5 SECONDS) ---

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


// --- STUDY VAULT & TEST SERIES LOADERS ---

async function loadMaterialsList() {
    const container = document.getElementById("materials-list");
    if (!container) return;

    try {
        const materials = await queryDatabase("SELECT * FROM study_materials ORDER BY uploaded_at DESC");
        if (!materials || materials.length === 0) {
            container.innerHTML = `<p class="text-gray-400 text-sm col-span-2 text-center py-8">No study materials uploaded yet.</p>`;
            return;
        }
        container.innerHTML = materials.map(m => `
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl flex flex-col justify-between space-y-4">
                <div>
                    <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(m.subject)}</span>
                    <h3 class="text-lg font-bold mt-2">${escapeHtml(m.title)}</h3>
                </div>
                <a href="${escapeHtml(m.file_url)}" target="_blank" rel="noopener noreferrer" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2.5 px-4 rounded-xl transition text-center shadow-lg shadow-blue-600/30">Open / Download PDF</a>
            </div>
        `).join("");
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load materials: ${escapeHtml(err.message)}</p>`;
    }
}

async function loadTestsList() {
    const container = document.getElementById("tests-list");
    if (!container) return;

    try {
        const tests = await queryDatabase("SELECT * FROM test_timetables ORDER BY test_date ASC");
        if (!tests || tests.length === 0) {
            container.innerHTML = `<p class="text-gray-400 text-sm col-span-2 text-center py-8">No upcoming tests scheduled yet.</p>`;
            return;
        }
        container.innerHTML = tests.map(t => {
            const formattedDate = new Date(t.test_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
            return `
                <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-2">
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(t.subject)}</span>
                        <span class="text-xs text-gray-400">📅 ${escapeHtml(formattedDate)}</span>
                    </div>
                    <h3 class="text-lg font-bold pt-1">${escapeHtml(t.test_name)}</h3>
                    <p class="text-xs text-gray-300">${escapeHtml(t.syllabus)}</p>
                </div>
            `;
        }).join("");
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load test schedule: ${escapeHtml(err.message)}</p>`;
    }
}


// --- ADMIN PORTAL HANDLERS ---

async function handlePostMaterial(e) {
    e.preventDefault();
    const title = document.getElementById("mat-title").value.trim();
    const subject = document.getElementById("mat-subject").value.trim();
    const fileUrl = document.getElementById("mat-url").value.trim();

    try {
        await queryDatabase(
            "INSERT INTO study_materials (title, subject, file_url) VALUES ($1, $2, $3)",
            [title, subject, fileUrl]
        );
        alert("Study material posted successfully!");
        document.getElementById("material-form").reset();
    } catch (err) {
        alert("Error posting material: " + err.message);
    }
}

async function handlePostTest(e) {
    e.preventDefault();
    const name = document.getElementById("test-name").value.trim();
    const subject = document.getElementById("test-subject").value.trim();
    const date = document.getElementById("test-date").value;
    const syllabus = document.getElementById("test-syllabus").value.trim();

    try {
        await queryDatabase(
            "INSERT INTO test_timetables (test_name, subject, test_date, syllabus) VALUES ($1, $2, $3, $4)",
            [name, subject, date, syllabus]
        );
        alert("Test timetable posted successfully!");
        document.getElementById("test-form").reset();
    } catch (err) {
        alert("Error posting test timetable: " + err.message);
    }
}

async function handleCreateQuiz(e) {
    e.preventDefault();
    const title = document.getElementById("quiz-title").value.trim();
    const subject = document.getElementById("quiz-subject").value.trim();
    const qText = document.getElementById("q-text").value.trim();
    const optA = document.getElementById("q-optA").value.trim();
    const optB = document.getElementById("q-optB").value.trim();
    const optC = document.getElementById("q-optC").value.trim();
    const optD = document.getElementById("q-optD").value.trim();
    const correct = document.getElementById("q-correct").value;

    try {
        const quizRes = await queryDatabase(
            "INSERT INTO quizzes (title, subject) VALUES ($1, $2) RETURNING id",
            [title, subject]
        );
        const quizId = quizRes[0].id;
        await queryDatabase(
            "INSERT INTO quiz_questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [quizId, qText, optA, optB, optC, optD, correct]
        );
        alert("Quiz and question created successfully!");
        document.getElementById("quiz-form").reset();
    } catch (err) {
        alert("Error creating quiz: " + err.message);
    }
}

async function handleUploadHtmlQuiz(e) {
    e.preventDefault();
    const title = document.getElementById("html-quiz-title").value.trim();
    const subject = document.getElementById("html-quiz-subject").value.trim();
    const fileInput = document.getElementById("html-quiz-file");
    const btn = document.getElementById("upload-quiz-btn");

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Please select an .html quiz file first.");
        return;
    }

    const file = fileInput.files[0];
    const originalBtnText = btn ? btn.textContent : "Upload & Publish Quiz";
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Uploading...";
    }

    try {
        const htmlContent = await file.text();
        const res = await queryDatabase(
            "INSERT INTO quizzes (title, subject, html_content) VALUES ($1, $2, $3) RETURNING id",
            [title, subject, htmlContent]
        );
        const newId = res[0].id;
        const shareLink = `${window.location.origin}${window.location.pathname}#quiz-${newId}`;

        alert(`Quiz uploaded successfully!\n\nShareable Link:\n${shareLink}`);
        document.getElementById("html-quiz-form").reset();
    } catch (err) {
        alert("Error uploading HTML quiz: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalBtnText;
        }
    }
}


// --- QUIZ PORTAL, NAME GATE, FULLSCREEN & AUTO-RESULT SCRAPER ---

async function loadQuizzesList() {
    const container = document.getElementById("quiz-list");
    if (!container) return;

    try {
        allQuizzesCache = await queryDatabase("SELECT id, title, subject, html_url, created_at FROM quizzes ORDER BY created_at DESC");
        renderQuizzes(allQuizzesCache);
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load quizzes: ${escapeHtml(err.message)}</p>`;
    }
}

function filterQuizzes() {
    const subjectFilter = document.getElementById("filter-subject")?.value || "all";
    const sortOrder = document.getElementById("filter-sort")?.value || "newest";

    let filtered = [...allQuizzesCache];

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
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl flex flex-col justify-between space-y-4">
                <div>
                    <div class="flex justify-between items-center gap-2">
                        <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(q.subject)}</span>
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
            "SELECT * FROM quiz_results WHERE quiz_id = $1 ORDER BY marks DESC, time_taken_seconds ASC, submitted_at DESC",
            [quiz.id]
        );
        const attemptsCount = existingResults ? existingResults.length : 0;
        const shareUrl = getQuizShareLink(quiz.id);

        // Step 1: Student enters their name first, then starts in fullscreen
        portal.innerHTML = `
            <div class="space-y-6">
                <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl flex flex-wrap justify-between items-center gap-4">
                    <div>
                        <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(quiz.subject)}</span>
                        <h2 class="text-xl font-bold mt-2">${escapeHtml(quiz.title)}</h2>
                        <p class="text-xs text-gray-400 mt-1">Total Attempts: <span class="text-blue-300 font-semibold">${attemptsCount}</span></p>
                        <div class="flex flex-wrap items-center gap-2 mt-2">
                            <code class="text-xs text-blue-300 bg-white/5 px-2.5 py-1 rounded-lg break-all">${escapeHtml(shareUrl)}</code>
                            <button type="button" onclick="copyQuizLink('${escapeHtml(shareUrl)}')" class="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 px-3 py-1 rounded-lg border border-blue-500/30 transition">Copy Link</button>
                        </div>
                    </div>
                    <button type="button" onclick="history.replaceState(null, '', '#quiz'); loadPage('quiz');" class="bg-white/10 hover:bg-white/20 text-xs px-4 py-2 rounded-xl transition">← All Quizzes</button>
                </div>

                <!-- Student Name Gate Before Fullscreen Launch -->
                <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-4 max-w-xl mx-auto">
                    <h3 class="text-lg font-bold text-blue-300">Enter Your Details to Begin</h3>
                    <p class="text-xs text-gray-400">Enter your name below. The quiz will open in fullscreen with a live timer and attempts counter at the top.</p>
                    <input type="text" id="quiz-start-student-name" placeholder="Enter Your Full Name" required
                           class="w-full bg-white/5 border border-white/10 p-3.5 rounded-2xl text-sm focus:outline-none focus:border-blue-500">
                    <button type="button" id="start-fullscreen-quiz-btn"
                            class="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-2xl text-sm font-semibold transition shadow-lg shadow-blue-600/30">
                        Start Quiz in Fullscreen →
                    </button>
                </div>

                <!-- Results & Attempts Visible to All Students -->
                <div id="quiz-attempts-beneath"></div>
            </div>
        `;

        await renderAttemptsTable(quiz.id, "quiz-attempts-beneath");

        document.getElementById("start-fullscreen-quiz-btn")?.addEventListener("click", async () => {
            const nameInput = document.getElementById("quiz-start-student-name");
            const studentName = (nameInput?.value || "").trim();
            if (!studentName) {
                alert("Please enter your full name before starting the quiz.");
                nameInput?.focus();
                return;
            }
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

    secondsElapsed = 0;
    currentActiveQuizSession = {
        quizId: Number(quiz.id),
        quizTitle: quiz.title,
        studentName,
        attemptsCount,
        recorded: false
    };

    portal.innerHTML = `
        <div id="quiz-fullscreen-stage" class="bg-[#060A12] border border-white/15 rounded-3xl overflow-hidden flex flex-col min-h-screen">
            <!-- Top Quiz Header: Seconds, Attempts & Time -->
            <div class="sticky top-0 z-30 bg-[#0b1120]/95 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p class="text-xs text-gray-400">Student: <span class="text-white font-semibold">${escapeHtml(studentName)}</span></p>
                    <h3 class="text-sm font-bold text-blue-400 truncate max-w-xs sm:max-w-md">${escapeHtml(quiz.title)}</h3>
                </div>

                <div class="flex flex-wrap items-center gap-2 text-xs">
                    <div class="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                        ⏱️ Time: <span id="header-time-mmss" class="font-bold text-blue-300">00:00</span>
                    </div>
                    <div class="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                        ⏳ Seconds: <span id="header-seconds-count" class="font-bold text-green-300">0s</span>
                    </div>
                    <div class="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                        📊 Attempts: <span id="header-attempts-count" class="font-bold text-yellow-300">${attemptsCount}</span>
                    </div>
                    <button type="button" onclick="exitQuizFullscreenAndReturn()" class="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl transition">
                        Exit
                    </button>
                </div>
            </div>

            <!-- Untouched Third-Party HTML Quiz Frame -->
            <iframe id="uploaded-quiz-frame" class="w-full flex-grow min-h-[75vh] border-0 bg-[#060A12]"></iframe>
        </div>

        <div id="quiz-attempts-beneath" class="mt-6"></div>
    `;

    const stageEl = document.getElementById("quiz-fullscreen-stage");
    if (stageEl && stageEl.requestFullscreen) {
        try {
            await stageEl.requestFullscreen();
        } catch (_) {
            // Continue smoothly if browser blocks automatic fullscreen
        }
    }

    // Live timer updating both Time (MM:SS) and Seconds
    activeQuizTimer = setInterval(() => {
        secondsElapsed++;
        const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
        const secs = String(secondsElapsed % 60).padStart(2, "0");
        const mmssEl = document.getElementById("header-time-mmss");
        const secEl = document.getElementById("header-seconds-count");
        if (mmssEl) mmssEl.textContent = `${mins}:${secs}`;
        if (secEl) secEl.textContent = `${secondsElapsed}s`;
    }, 1000);

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
        if (!currentActiveQuizSession || currentActiveQuizSession.recorded) return;

        try {
            const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
            if (!doc || !doc.body) return;

            const text = (doc.body.innerText || "").trim();
            if (!text || !/Quiz Complete!/i.test(text)) return;

            // Parse score like "2 / 8" or "2/8"
            const scoreMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
            const marks = scoreMatch ? Number(scoreMatch[1]) : 0;
            const totalMarks = scoreMatch ? Number(scoreMatch[2]) : 0;

            // Parse time like "0m 9s" or "1m 25s" if shown inside HTML, otherwise fallback to timer
            let finalSeconds = secondsElapsed;
            const timeMatch = text.match(/Time:\s*(?:(\d+)m\s*)?(\d+)s/i);
            if (timeMatch) {
                const mins = Number(timeMatch[1] || 0);
                const secs = Number(timeMatch[2] || 0);
                finalSeconds = mins * 60 + secs;
            }

            currentActiveQuizSession.recorded = true;
            if (activeQuizTimer) {
                clearInterval(activeQuizTimer);
                activeQuizTimer = null;
            }
            if (quizWatcherInterval) {
                clearInterval(quizWatcherInterval);
                quizWatcherInterval = null;
            }

            const percentage = totalMarks > 0 ? Number(((marks / totalMarks) * 100).toFixed(2)) : 0;
            const { quizId, studentName } = currentActiveQuizSession;

            await queryDatabase(
                "INSERT INTO quiz_results (quiz_id, student_name, marks, total_marks, percentage, time_taken_seconds) VALUES ($1, $2, $3, $4, $5, $6)",
                [quizId, studentName, marks, totalMarks, percentage, finalSeconds]
            );

            if (document.fullscreenElement && document.exitFullscreen) {
                try {
                    await document.exitFullscreen();
                } catch (_) {}
            }

            await renderAttemptsTable(quizId, "quiz-attempts-beneath");
            const newAttemptCount = currentActiveQuizSession.attemptsCount + 1;
            const attemptsBadge = document.getElementById("header-attempts-count");
            if (attemptsBadge) attemptsBadge.textContent = String(newAttemptCount);
        } catch (err) {
            console.error("Error reading/saving quiz completion:", err);
        }
    }, 600);
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
                <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl flex justify-between items-center text-xs text-gray-400">
                    <span>No attempts recorded for this quiz yet.</span>
                    <span>Total Attempts: 0</span>
                </div>
            `;
            return;
        }

        target.innerHTML = `
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-4">
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
