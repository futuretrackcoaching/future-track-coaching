// --- INITIALIZATION & ROUTER ---

let domLoaded = false;
let neonLoaded = Boolean(window.neon);
let slideshowInterval = null;
let allQuizzesCache = [];
let activeQuizTimer = null;
let secondsElapsed = 0;

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

// Dynamically load pages from 'pages/' into #app
async function loadPage(pageName) {
    if (activeQuizTimer) {
        clearInterval(activeQuizTimer);
        activeQuizTimer = null;
    }
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

        // Initialize page-specific features after HTML injection
        if (pageName === "home") {
            initSlideshow();
        } else if (pageName === "quiz") {
            loadQuizzesList();
        } else if (pageName === "material") {
            loadMaterialsList();
        } else if (pageName === "test") {
            loadTestsList();
        }
    } catch (error) {
        console.error("Error loading page:", error);
        document.getElementById("app").innerHTML = `
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl text-center max-w-lg mx-auto mt-12 shadow-2xl">
                <h2 class="text-xl font-bold text-red-400 mb-2">Page Not Found</h2>
                <p class="text-gray-400 text-sm">Could not load <code class="text-blue-300">pages/${pageName}.html</code>.</p>
            </div>
        `;
    }
}

// Check URL hash for secret admin access (#ftadmin) verified against Neon DB
async function handleRoute() {
    const hash = window.location.hash;
    if (hash === "#ftadmin") {
        const enteredPin = prompt("Enter Admin Secret PIN:");
        if (!enteredPin) {
            history.replaceState(null, "", "#home");
            loadPage("home");
            return;
        }

        try {
            await verifyAdminPinOnServer(enteredPin);
            loadPage("admin");
        } catch (err) {
            setSessionAdminPin("");
            alert(err && err.message ? err.message : "Incorrect PIN");
            history.replaceState(null, "", "#home");
            loadPage("home");
        }
    } else {
        loadPage("home");
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
        if (materials.length === 0) {
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
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load materials.</p>`;
    }
}

async function loadTestsList() {
    const container = document.getElementById("tests-list");
    if (!container) return;

    try {
        const tests = await queryDatabase("SELECT * FROM test_timetables ORDER BY test_date ASC");
        if (tests.length === 0) {
            container.innerHTML = `<p class="text-gray-400 text-sm col-span-2 text-center py-8">No upcoming tests scheduled yet.</p>`;
            return;
        }
        container.innerHTML = tests.map(t => {
            const formattedDate = new Date(t.test_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
            return `
                <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-2">
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(t.subject)}</span>
                        <span class="text-xs text-gray-400">📅 ${formattedDate}</span>
                    </div>
                    <h3 class="text-lg font-bold pt-1">${escapeHtml(t.test_name)}</h3>
                    <p class="text-xs text-gray-300">${escapeHtml(t.syllabus)}</p>
                </div>
            `;
        }).join("");
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load test schedule.</p>`;
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


// --- QUIZ PORTAL, FILTERS, TIMER & RANKINGS ---

async function loadQuizzesList() {
    const container = document.getElementById("quiz-list");
    if (!container) return;

    try {
        allQuizzesCache = await queryDatabase("SELECT * FROM quizzes ORDER BY created_at DESC");
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
        filtered = filtered.filter(q => q.subject.toLowerCase() === subjectFilter.toLowerCase());
    }

    filtered.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    renderQuizzes(filtered);
}

function renderQuizzes(quizzes) {
    const container = document.getElementById("quiz-list");
    if (!container) return;

    if (quizzes.length === 0) {
        container.innerHTML = `<p class="text-gray-400 text-sm col-span-2 text-center py-8">No quizzes found matching your filter.</p>`;
        return;
    }

    container.innerHTML = quizzes.map(q => {
        const postedDate = q.created_at
            ? new Date(q.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
            : "";
        return `
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl flex flex-col justify-between space-y-4">
                <div>
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(q.subject)}</span>
                        <span class="text-[11px] text-gray-400">${postedDate}</span>
                    </div>
                    <h3 class="text-lg font-bold mt-2">${escapeHtml(q.title)}</h3>
                </div>
                <button type="button" onclick="openQuiz(${q.id})" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2.5 px-4 rounded-xl transition shadow-lg shadow-blue-600/30 w-full">Start Quiz & View Rankings</button>
            </div>
        `;
    }).join("");
}

async function openQuiz(quizId) {
    const portal = document.getElementById("quiz-portal-container");
    const quizObj = allQuizzesCache.find(q => q.id === quizId);
    const quizTitle = quizObj ? quizObj.title : "Quiz";
    secondsElapsed = 0;

    portal.innerHTML = `
        <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-6">
            <div class="flex flex-wrap justify-between items-center gap-3 border-b border-white/10 pb-4">
                <h2 class="text-xl font-bold text-blue-400">${escapeHtml(quizTitle)}</h2>
                <div class="text-sm bg-blue-500/10 text-blue-300 px-4 py-1.5 rounded-xl border border-blue-500/20">
                    ⏱️ Time Taken: <span id="timer-display">00:00</span>
                </div>
            </div>

            <div id="quiz-questions-box" class="space-y-6">
                <p class="text-gray-400 text-sm">Loading questions...</p>
            </div>

            <div class="space-y-3 pt-4 border-t border-white/10">
                <input type="text" id="student-name" placeholder="Enter Your Full Name" class="w-full bg-white/5 border border-white/10 p-3 rounded-2xl text-sm focus:outline-none focus:border-blue-500" required>
                <button type="button" onclick="submitQuiz(${quizId})" class="bg-green-600 hover:bg-green-500 text-white w-full py-3 rounded-2xl font-medium transition shadow-lg shadow-green-600/30">Submit Quiz & View Ranking</button>
            </div>
            <button type="button" onclick="loadPage('quiz')" class="text-xs text-gray-400 hover:underline">← Back to Quiz List</button>
        </div>

        <div id="quiz-leaderboard-box" class="mt-6"></div>
    `;

    activeQuizTimer = setInterval(() => {
        secondsElapsed++;
        const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, "0");
        const secs = (secondsElapsed % 60).toString().padStart(2, "0");
        const timerEl = document.getElementById("timer-display");
        if (timerEl) timerEl.innerText = `${mins}:${secs}`;
    }, 1000);

    try {
        const questions = await queryDatabase("SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY id ASC", [quizId]);
        const qBox = document.getElementById("quiz-questions-box");
        qBox.dataset.questions = JSON.stringify(questions);

        if (questions.length === 0) {
            qBox.innerHTML = `<p class="text-gray-400 text-sm">No questions added to this quiz yet.</p>`;
        } else {
            qBox.innerHTML = questions.map((q, idx) => `
                <div class="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-3">
                    <p class="font-medium text-sm">Q${idx + 1}. ${escapeHtml(q.question_text)}</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <label class="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10"><input type="radio" name="q_${q.id}" value="A"> A) ${escapeHtml(q.option_a)}</label>
                        <label class="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10"><input type="radio" name="q_${q.id}" value="B"> B) ${escapeHtml(q.option_b)}</label>
                        <label class="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10"><input type="radio" name="q_${q.id}" value="C"> C) ${escapeHtml(q.option_c)}</label>
                        <label class="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10"><input type="radio" name="q_${q.id}" value="D"> D) ${escapeHtml(q.option_d)}</label>
                    </div>
                </div>
            `).join("");
        }

        // Also show existing results under the quiz
        renderLeaderboardTable(quizId, "quiz-leaderboard-box");
    } catch (err) {
        document.getElementById("quiz-questions-box").innerHTML = `<p class="text-red-400 text-sm">Error loading questions.</p>`;
    }
}

async function submitQuiz(quizId) {
    const studentName = document.getElementById("student-name").value.trim();
    if (!studentName) {
        alert("Please enter your name before submitting.");
        return;
    }

    if (activeQuizTimer) {
        clearInterval(activeQuizTimer);
        activeQuizTimer = null;
    }

    const qBox = document.getElementById("quiz-questions-box");
    const questions = JSON.parse(qBox.dataset.questions || "[]");
    let score = 0;

    questions.forEach(q => {
        const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
        if (selected && selected.value === q.correct_option) {
            score++;
        }
    });

    const total = questions.length;
    const percentage = total > 0 ? ((score / total) * 100).toFixed(2) : 0;

    try {
        await queryDatabase(
            "INSERT INTO quiz_results (quiz_id, student_name, marks, total_marks, percentage, time_taken_seconds) VALUES ($1, $2, $3, $4, $5, $6)",
            [quizId, studentName, score, total, percentage, secondsElapsed]
        );
        loadQuizResultsView(quizId, score, total, percentage);
    } catch (err) {
        alert("Error submitting quiz result: " + err.message);
    }
}

async function loadQuizResultsView(quizId, score, total, percentage) {
    const portal = document.getElementById("quiz-portal-container");
    portal.innerHTML = `
        <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-6">
            <div>
                <h2 class="text-xl font-bold text-green-400">🎉 Quiz Submitted Successfully!</h2>
                <p class="text-sm text-gray-200 mt-1">Your Score: <span class="font-bold text-blue-400">${score} / ${total}</span> (${Number(percentage).toFixed(1)}%)</p>
            </div>
            <div id="submitted-leaderboard"></div>
            <button type="button" onclick="loadPage('quiz')" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2.5 px-5 rounded-xl transition shadow-lg shadow-blue-600/30">Back to All Quizzes</button>
        </div>
    `;
    await renderLeaderboardTable(quizId, "submitted-leaderboard");
}

async function renderLeaderboardTable(quizId, targetElementId) {
    const target = document.getElementById(targetElementId);
    if (!target) return;

    try {
        const results = await queryDatabase(
            "SELECT * FROM quiz_results WHERE quiz_id = $1 ORDER BY marks DESC, time_taken_seconds ASC",
            [quizId]
        );

        if (results.length === 0) {
            target.innerHTML = `
                <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl text-xs text-gray-400">
                    No attempts recorded for this quiz yet. Be the first on the leaderboard!
                </div>
            `;
            return;
        }

        target.innerHTML = `
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-4">
                <h3 class="text-base font-bold text-blue-300">🏆 Quiz Rankings & Results</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                        <thead>
                            <tr class="border-b border-white/10 text-gray-400">
                                <th class="pb-3">Rank</th>
                                <th class="pb-3">Student Name</th>
                                <th class="pb-3">Marks</th>
                                <th class="pb-3">Percentage</th>
                                <th class="pb-3">Time Taken</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${results.map((r, idx) => `
                                <tr class="${idx === 0 ? "text-yellow-400 font-bold" : ""}">
                                    <td class="py-3">#${idx + 1}</td>
                                    <td class="py-3">${escapeHtml(r.student_name)}</td>
                                    <td class="py-3">${r.marks} / ${r.total_marks}</td>
                                    <td class="py-3">${Number(r.percentage).toFixed(1)}%</td>
                                    <td class="py-3">${Math.floor(r.time_taken_seconds / 60)}m ${r.time_taken_seconds % 60}s</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (err) {
        target.innerHTML = `<p class="text-red-400 text-xs">Could not load rankings.</p>`;
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
async function handleAddHtmlQuiz(e) {
    e.preventDefault();
    const title = document.getElementById("html-quiz-title").value.trim();
    const subject = document.getElementById("html-quiz-subject").value.trim();
    const htmlUrl = document.getElementById("html-quiz-url").value.trim();

    try {
        await queryDatabase(
            "INSERT INTO quizzes (title, subject, html_url) VALUES ($1, $2, $3)",
            [title, subject, htmlUrl]
        );
        alert("HTML Quiz added successfully!");
        document.getElementById("html-quiz-form").reset();
    } catch (err) {
        alert("Error adding HTML quiz: " + err.message);
    }
}

function getQuizShareLink(quizId) {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#quiz-${quizId}`;
}

async function openHtmlQuizView(quizId) {
    const portal = document.getElementById("quiz-portal-container");
    if (!portal) return;

    const quizzes = await queryDatabase("SELECT * FROM quizzes WHERE id = $1", [quizId]);
    const quiz = quizzes && quizzes[0];
    if (!quiz) {
        portal.innerHTML = `<p class="text-red-400 text-sm">Quiz not found.</p>`;
        return;
    }

    const shareUrl = getQuizShareLink(quiz.id);
    const frameSrc = quiz.html_url
        ? `${quiz.html_url}${quiz.html_url.includes("?") ? "&" : "?"}quizId=${quiz.id}`
        : "";

    portal.innerHTML = `
        <div class="space-y-6">
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl flex flex-wrap justify-between items-center gap-3">
                <div>
                    <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${escapeHtml(quiz.subject)}</span>
                    <h2 class="text-xl font-bold mt-2">${escapeHtml(quiz.title)}</h2>
                    <p class="text-xs text-gray-400 mt-1 break-all">Quiz Link: <a href="${escapeHtml(shareUrl)}" class="text-blue-400 hover:underline">${escapeHtml(shareUrl)}</a></p>
                </div>
                <button type="button" onclick="history.replaceState(null, '', '#quiz'); loadPage('quiz');" class="bg-white/10 hover:bg-white/20 text-xs px-4 py-2 rounded-xl transition">← All Quizzes</button>
            </div>

            ${frameSrc ? `
                <div class="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-xl">
                    <iframe src="${escapeHtml(frameSrc)}" class="w-full min-h-[560px] border-0 bg-white" loading="lazy"></iframe>
                </div>
            ` : `
                <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl text-xs text-gray-400">
                    No HTML file URL attached to this quiz yet.
                </div>
            `}

            <div id="quiz-attempts-beneath"></div>
        </div>
    `;

    await renderAttemptsBeneathQuiz(quiz.id, "quiz-attempts-beneath");
}

async function renderAttemptsBeneathQuiz(quizId, targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;

    const results = await queryDatabase(
        "SELECT * FROM quiz_results WHERE quiz_id = $1 ORDER BY marks DESC, time_taken_seconds ASC",
        [quizId]
    );

    target.innerHTML = `
        <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-4">
            <div class="flex justify-between items-center">
                <h3 class="text-base font-bold text-blue-300">📊 Attempts & Results</h3>
                <span class="text-xs text-gray-400">Total Attempts: ${results.length}</span>
            </div>
            ${results.length === 0 ? `
                <p class="text-xs text-gray-400">No attempts yet for this quiz.</p>
            ` : `
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                        <thead>
                            <tr class="border-b border-white/10 text-gray-400">
                                <th class="pb-3">Rank</th>
                                <th class="pb-3">Student</th>
                                <th class="pb-3">Score</th>
                                <th class="pb-3">Percentage</th>
                                <th class="pb-3">Time Taken</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${results.map((r, i) => `
                                <tr class="${i === 0 ? "text-yellow-400 font-bold" : ""}">
                                    <td class="py-3">#${i + 1}</td>
                                    <td class="py-3">${escapeHtml(r.student_name)}</td>
                                    <td class="py-3">${r.marks} / ${r.total_marks}</td>
                                    <td class="py-3">${Number(r.percentage).toFixed(1)}%</td>
                                    <td class="py-3">${Math.floor(r.time_taken_seconds / 60)}m ${r.time_taken_seconds % 60}s</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `}
        </div>
    `;
}

// Receive score + time from inside any uploaded HTML quiz file
window.addEventListener("message", async (event) => {
    const data = event.data;
    if (!data || data.type !== "FT_QUIZ_RESULT") return;

    const quizId = Number(data.quizId);
    const studentName = String(data.studentName || "").trim();
    const marks = Number(data.marks || 0);
    const totalMarks = Number(data.totalMarks || 0);
    const timeTakenSeconds = Number(data.timeTakenSeconds || 0);
    const percentage = totalMarks > 0 ? Number(((marks / totalMarks) * 100).toFixed(2)) : 0;

    if (!quizId || !studentName) return;

    try {
        await queryDatabase(
            "INSERT INTO quiz_results (quiz_id, student_name, marks, total_marks, percentage, time_taken_seconds) VALUES ($1, $2, $3, $4, $5, $6)",
            [quizId, studentName, marks, totalMarks, percentage, timeTakenSeconds]
        );
        await renderAttemptsBeneathQuiz(quizId, "quiz-attempts-beneath");
    } catch (err) {
        console.error("Failed to save HTML quiz result:", err);
    }
});
