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
// Automated Photo Slideshow Logic (Changes every 5 seconds)
function initSlideshow() {
    let currentSlide = 0;
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');

    if (slides.length === 0) return; // Exit if not on home page

    setInterval(() => {
        // Hide current slide & reset dot
        slides[currentSlide].style.opacity = '0';
        if (dots[currentSlide]) dots[currentSlide].classList.remove('bg-white', 'w-4');

        // Move to next slide
        currentSlide = (currentSlide + 1) % slides.length;

        // Show new slide & highlight dot
        slides[currentSlide].style.opacity = '1';
        if (dots[currentSlide]) {
            dots[currentSlide].classList.add('bg-white', 'w-4');
        }
    }, 5000); // 5000ms = 5 seconds
}

// Hook slideshow into the page router so it starts when Home loads
const originalLoadPage = loadPage;
loadPage = async function(pageName) {
    await originalLoadPage(pageName);
    if (pageName === 'home') {
        setTimeout(initSlideshow, 100); // Initialize after HTML is injected
    }
};
// --- ADMIN FUNCTIONS ---
async function handlePostMaterial(e) {
    e.preventDefault();
    const title = document.getElementById('mat-title').value;
    const subject = document.getElementById('mat-subject').value;
    const file_url = document.getElementById('mat-url').value;
    try {
        await queryDatabase('INSERT INTO study_materials (title, subject, file_url) VALUES ($1, $2, $3)', [title, subject, file_url]);
        alert('Study material posted successfully!');
        document.getElementById('material-form').reset();
    } catch (err) { alert('Error posting material'); }
}

async function handlePostTest(e) {
    e.preventDefault();
    const name = document.getElementById('test-name').value;
    const subject = document.getElementById('test-subject').value;
    const date = document.getElementById('test-date').value;
    const syllabus = document.getElementById('test-syllabus').value;
    try {
        await queryDatabase('INSERT INTO test_timetables (test_name, subject, test_date, syllabus) VALUES ($1, $2, $3, $4)', [name, subject, date, syllabus]);
        alert('Test timetable posted successfully!');
        document.getElementById('test-form').reset();
    } catch (err) { alert('Error posting test timetable'); }
}

async function handleCreateQuiz(e) {
    e.preventDefault();
    const title = document.getElementById('quiz-title').value;
    const subject = document.getElementById('quiz-subject').value;
    const qText = document.getElementById('q-text').value;
    const optA = document.getElementById('q-optA').value;
    const optB = document.getElementById('q-optB').value;
    const optC = document.getElementById('q-optC').value;
    const optD = document.getElementById('q-optD').value;
    const correct = document.getElementById('q-correct').value;

    try {
        const quizRes = await queryDatabase('INSERT INTO quizzes (title, subject) VALUES ($1, $2) RETURNING id', [title, subject]);
        const quizId = quizRes[0].id;
        await queryDatabase(
            'INSERT INTO quiz_questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [quizId, qText, optA, optB, optC, optD, correct]
        );
        alert('Quiz and initial question created successfully!');
        document.getElementById('quiz-form').reset();
    } catch (err) { alert('Error creating quiz'); }
}

// --- QUIZ PORTAL FUNCTIONS ---
let activeQuizTimer = null;
let secondsElapsed = 0;

async function loadQuizzesList() {
    const container = document.getElementById('quiz-list');
    if (!container) return;
    try {
        const quizzes = await queryDatabase('SELECT * FROM quizzes ORDER BY created_at DESC');
        if (quizzes.length === 0) {
            container.innerHTML = `<p class="text-gray-400 text-sm col-span-2 text-center py-8">No quizzes uploaded yet.</p>`;
            return;
        }
        container.innerHTML = quizzes.map(q => `
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-3xl flex flex-col justify-between space-y-4">
                <div>
                    <span class="text-[10px] bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">${q.subject}</span>
                    <h3 class="text-lg font-bold mt-2">${q.title}</h3>
                </div>
                <button onclick="openQuiz(${q.id}, '${q.title}')" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2.5 px-4 rounded-xl transition shadow-lg shadow-blue-600/30 w-full">Start Quiz & View Rankings</button>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-red-400 text-sm col-span-2 text-center py-8">Failed to load quizzes from database.</p>`;
    }
}

async function openQuiz(quizId, quizTitle) {
    const portal = document.getElementById('quiz-portal-container');
    secondsElapsed = 0;

    portal.innerHTML = `
        <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-6">
            <div class="flex justify-between items-center border-b border-white/10 pb-4">
                <h2 class="text-xl font-bold text-blue-400">${quizTitle}</h2>
                <div class="text-sm bg-blue-500/10 text-blue-300 px-4 py-1.5 rounded-xl border border-blue-500/20">
                    ⏱️ Time Taken: <span id="timer-display">00:00</span>
                </div>
            </div>
            
            <div id="quiz-questions-box" class="space-y-6">
                <p class="text-gray-400 text-sm">Loading questions...</p>
            </div>

            <div class="space-y-3 pt-4 border-t border-white/10">
                <input type="text" id="student-name" placeholder="Enter Your Full Name" class="w-full bg-white/5 border border-white/10 p-3 rounded-2xl text-sm focus:outline-none focus:border-blue-500" required>
                <button onclick="submitQuiz(${quizId})" class="bg-green-600 hover:bg-green-500 text-white w-full py-3 rounded-2xl font-medium transition shadow-lg shadow-green-600/30">Submit Quiz & View Ranking</button>
            </div>
            <button onclick="loadPage('quiz')" class="text-xs text-gray-400 hover:underline">← Back to Quiz List</button>
        </div>
    `;

    // Start Timer
    activeQuizTimer = setInterval(() => {
        secondsElapsed++;
        let mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
        let secs = (secondsElapsed % 60).toString().padStart(2, '0');
        const timerEl = document.getElementById('timer-display');
        if (timerEl) timerEl.innerText = `${mins}:${secs}`;
    }, 1000);

    // Fetch Questions
    try {
        const questions = await queryDatabase('SELECT * FROM quiz_questions WHERE quiz_id = $1', [quizId]);
        const qBox = document.getElementById('quiz-questions-box');
        qBox.dataset.questions = JSON.stringify(questions);

        qBox.innerHTML = questions.map((q, idx) => `
            <div class="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-3">
                <p class="font-medium text-sm">Q${idx + 1}. ${q.question_text}</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <label class="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10"><input type="radio" name="q_${q.id}" value="A"> A) ${q.option_a}</label>
                    <label class="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10"><input type="radio" name="q_${q.id}" value="B"> B) ${q.option_b}</label>
                    <label class="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10"><input type="radio" name="q_${q.id}" value="C"> C) ${q.option_c}</label>
                    <label class="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10"><input type="radio" name="q_${q.id}" value="D"> D) ${q.option_d}</label>
                </div>
            </div>
        `).join('');
    } catch (err) {
        document.getElementById('quiz-questions-box').innerHTML = `<p class="text-red-400 text-sm">Error loading questions.</p>`;
    }
}

async function submitQuiz(quizId) {
    clearInterval(activeQuizTimer);
    const studentName = document.getElementById('student-name').value.trim();
    if (!studentName) {
        alert('Please enter your name before submitting.');
        return;
    }

    const qBox = document.getElementById('quiz-questions-box');
    const questions = JSON.parse(qBox.dataset.questions || '[]');
    let score = 0;

    questions.forEach(q => {
        const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
        if (selected && selected.value === q.correct_option) {
            score++;
        }
    });

    const total = questions.length;
    const percentage = total > 0 ? (score / total) * 100 : 0;

    try {
        await queryDatabase(
            'INSERT INTO quiz_results (quiz_id, student_name, marks, total_marks, percentage, time_taken_seconds) VALUES ($1, $2, $3, $4, $5, $6)',
            [quizId, studentName, score, total, percentage, secondsElapsed]
        );
        loadQuizResultsView(quizId);
    } catch (err) {
        alert('Error submitting quiz result.');
    }
}

async function loadQuizResultsView(quizId) {
    const portal = document.getElementById('quiz-portal-container');
    try {
        const results = await queryDatabase('SELECT * FROM quiz_results WHERE quiz_id = $1 ORDER BY marks DESC, time_taken_seconds ASC', [quizId]);
        
        portal.innerHTML = `
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl space-y-6">
                <h2 class="text-xl font-bold text-green-400">🎉 Quiz Submitted Successfully!</h2>
                <p class="text-xs text-gray-300">Here is the leaderboard and ranking for this quiz:</p>
                
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
                                <tr class="${idx === 0 ? 'text-yellow-400 font-bold' : ''}">
                                    <td class="py-3">#${idx + 1}</td>
                                    <td class="py-3">${r.student_name}</td>
                                    <td class="py-3">${r.marks} / ${r.total_marks}</td>
                                    <td class="py-3">${Number(r.percentage).toFixed(1)}%</td>
                                    <td class="py-3">${Math.floor(r.time_taken_seconds / 60)}m ${r.time_taken_seconds % 60}s</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <button onclick="loadPage('quiz')" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2.5 px-5 rounded-xl transition shadow-lg shadow-blue-600/30">Back to All Quizzes</button>
            </div>
        `;
    } catch (err) {
        portal.innerHTML = `<p class="text-red-400 text-sm">Error loading rankings.</p>`;
    }
}

// Hook quiz loader into router
const oldRouter = loadPage;
loadPage = async function(pageName) {
    await oldRouter(pageName);
    if (pageName === 'quiz') {
        loadQuizzesList();
    }
};

