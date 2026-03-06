// OpoStudy · app.js (SPA + Supabase + Tests + Parte práctica + Test oficial + Coach Drawer + PWA install)

const { createClient } = window.supabase;

const sb = createClient(
  window.OPOSTUDY_CONFIG.SUPABASE_URL,
  window.OPOSTUDY_CONFIG.SUPABASE_ANON_KEY
);

// Mermaid (si usas diagramas en prácticos)
if (window.mermaid) {
  mermaid.initialize({ startOnLoad: false, theme: "neutral" });
}

/* =========================
   Storage
========================= */
const STORAGE_KEY = "opostudy_stats_v2";
const STORAGE_MISTAKES_KEY = "opostudy_mistakes_v1";
const STORAGE_PRACTICA_DONE = "opostudy_practica_done_v1";

const MISTAKES_LOOKBACK_DAYS = 30;

/* =========================
   Navigation (screens)
========================= */
const screens = Array.from(document.querySelectorAll(".screen"));
const navBtns = Array.from(document.querySelectorAll("[data-nav]"));
const goBtns = Array.from(document.querySelectorAll("[data-go]"));

function showScreen(name) {
  document.body.dataset.screen = name;
  screens.forEach(s => s.classList.toggle("is-active", s.dataset.screen === name));
  navBtns.forEach(b => b.classList.toggle("is-active", b.dataset.nav === name));

  // Coach FAB solo en Home
  const coachFab = document.getElementById("coachFab");
  if (coachFab) coachFab.style.display = (name === "home") ? "inline-flex" : "none";

  // si sales de home, cierro drawer para no “romper” móvil
  if (name !== "home") closeCoach();

  // si hay modal abierto y navegas, lo cierro (evita que “se vea en todas las pantallas”)
  if (modalEl && modalEl.classList.contains("is-open")) closeModal();
}

navBtns.forEach(btn => btn.addEventListener("click", () => showScreen(btn.dataset.nav)));
goBtns.forEach(btn => btn.addEventListener("click", () => showScreen(btn.dataset.go)));

/* =========================
   Stats + Mistakes
========================= */
function loadStats() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      totalAnswered: 0,
      totalCorrect: 0,
      streakDays: 0,
      lastStudyDate: null,
      byBlock: { "1": { a: 0, c: 0 }, "2": { a: 0, c: 0 }, "3": { a: 0, c: 0 }, "4": { a: 0, c: 0 } }
    };
  }
  try { return JSON.parse(raw); } catch { return null; }
}

function saveStats(stats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function loadMistakes() {
  const raw = localStorage.getItem(STORAGE_MISTAKES_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveMistakes(list) {
  localStorage.setItem(STORAGE_MISTAKES_KEY, JSON.stringify(list));
}

function upsertMistake(questionId, block, topic) {
  const list = loadMistakes();
  const now = new Date().toISOString();

  const idx = list.findIndex(m => m.id === questionId && !m.resolved_at);
  if (idx >= 0) {
    list[idx].wrong_count = (list[idx].wrong_count || 1) + 1;
    list[idx].last_seen = now;
  } else {
    list.push({
      id: questionId,
      block,
      topic,
      wrong_count: 1,
      first_seen: now,
      last_seen: now,
      resolved_at: null
    });
  }
  saveMistakes(list);
}

function resolveMistake(questionId) {
  const list = loadMistakes();
  const now = new Date().toISOString();
  const idx = list.findIndex(m => m.id === questionId && !m.resolved_at);
  if (idx >= 0) {
    list[idx].resolved_at = now;
    saveMistakes(list);
  }
}

function getPendingMistakeIds({ block = null, lookbackDays = MISTAKES_LOOKBACK_DAYS } = {}) {
  const list = loadMistakes();
  const now = Date.now();
  const maxAgeMs = lookbackDays * 24 * 60 * 60 * 1000;

  return list
    .filter(m => !m.resolved_at)
    .filter(m => (block ? Number(m.block) === Number(block) : true))
    .filter(m => {
      const t = Date.parse(m.last_seen || m.first_seen || "");
      if (!Number.isFinite(t)) return true;
      return (now - t) <= maxAgeMs;
    })
    .map(m => m.id);
}

function getPendingMistakesCount(block = null) {
  return getPendingMistakeIds({ block }).length;
}

function updateStatsOnAnswer(stats, block, isCorrect) {
  // si no se puede corregir (null), no tocamos stats
  if (isCorrect === null || isCorrect === undefined) return;

  stats.totalAnswered++;
  if (isCorrect) stats.totalCorrect++;

  // byBlock solo si block es 1..4
  const bNum = Number(block);
  const isValidBlock = [1, 2, 3, 4].includes(bNum);
  if (isValidBlock) {
    const b = String(bNum);
    if (!stats.byBlock[b]) stats.byBlock[b] = { a: 0, c: 0 };
    stats.byBlock[b].a++;
    if (isCorrect) stats.byBlock[b].c++;
  }

  // streak
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10);
  if (!stats.lastStudyDate) stats.streakDays = 1;
  else if (stats.lastStudyDate !== ymd) {
    const last = new Date(stats.lastStudyDate + "T00:00:00Z");
    const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
    stats.streakDays = (diffDays === 1) ? (stats.streakDays + 1) : 1;
  }
  stats.lastStudyDate = ymd;

  saveStats(stats);
}

/* Render KPIs */
const stats = loadStats();

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

function renderBlockBars() {
  const el = document.getElementById("blockBars");
  if (!el) return;
  const blocks = ["1", "2", "3", "4"].map(b => {
    const a = stats.byBlock?.[b]?.a || 0;
    const c = stats.byBlock?.[b]?.c || 0;
    const pct = a ? Math.round((c / a) * 100) : 0;
    return { b, pct, a, c };
  });

  el.innerHTML = blocks.map(x => `
    <div class="bar">
      <div class="bar__top">
        <div class="bar__name">Bloque ${x.b}</div>
        <div class="bar__pct">${x.pct}%</div>
      </div>
      <div class="bar__track">
        <div class="bar__fill" style="width:${x.pct}%;"></div>
      </div>
      <div class="hint" style="margin-top:8px;">${x.c}/${x.a} correctas</div>
    </div>
  `).join("");
}

function renderKpis() {
  const acc = stats.totalAnswered ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100) : 0;
  const pending = getPendingMistakesCount(null);

  // Home
  setText("kpiAnsweredHome", stats.totalAnswered);
  setText("kpiAccuracyHome", `${acc}%`);
  setText("kpiStreakHome", stats.streakDays);
  setText("kpiMistakesHome", pending);

  // Stats screen
  setText("kpiAnsweredStats", stats.totalAnswered);
  setText("kpiAccuracyStats", `${acc}%`);
  setText("kpiStreakStats", stats.streakDays);
  setText("kpiMistakesStats", pending);

  renderBlockBars();
}

/* Reset buttons */
document.getElementById("resetStats")?.addEventListener("click", () => {
  if (!confirm("¿Resetear stats locales?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});
document.getElementById("resetMistakes")?.addEventListener("click", () => {
  if (!confirm("¿Resetear fallos locales?")) return;
  localStorage.removeItem(STORAGE_MISTAKES_KEY);
  renderKpis();
});

/* =========================
   Tests (modal)
========================= */
const modeSegment = document.getElementById("modeSegment");
const practiceKindWrap = document.getElementById("practiceKindWrap");
const practiceKindSegment = document.getElementById("practiceKindSegment");
const blockSelect = document.getElementById("blockSelect");
const countSelect = document.getElementById("countSelect");
const timerToggle = document.getElementById("timerToggle");
const startBtn = document.getElementById("startBtn");
const blockHint = document.getElementById("blockHint");

const state = {
  mode: "exam",                 // exam | full | practice | mistakes
  practiceKind: "practical",    // practical | test
  block: null,
  count: 15,
  timerEnabled: true,

  questions: [],
  index: 0,
  selected: null,
  answers: [],
  timeElapsed: 0,
  timer: null,

  examHardMode: false,
};

function initTestsUI() {
  state.count = Number(countSelect?.value || 15);
  state.timerEnabled = !!timerToggle?.checked;

  modeSegment?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    setMode(btn.dataset.mode);
  });

  practiceKindSegment?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-kind]");
    if (!btn) return;
    state.practiceKind = btn.dataset.kind;
    practiceKindSegment.querySelectorAll(".segmented__btn").forEach(b => {
      b.classList.toggle("is-active", b.dataset.kind === state.practiceKind);
    });
  });

  blockSelect?.addEventListener("change", () => {
    state.block = blockSelect.value ? Number(blockSelect.value) : null;
    syncStartEnabled();
  });

  countSelect?.addEventListener("change", () => {
    state.count = Number(countSelect.value);
  });

  timerToggle?.addEventListener("change", () => {
    state.timerEnabled = !!timerToggle.checked;
  });

  startBtn?.addEventListener("click", () => startTest());

  setMode("exam", { silent: true });
  syncStartEnabled();
}

function setMode(mode, opts = {}) {
  state.mode = mode;

  document.querySelectorAll("#modeSegment .segmented__btn").forEach(b => {
    b.classList.toggle("is-active", b.dataset.mode === mode);
  });

  if (practiceKindWrap) {
    practiceKindWrap.style.display = (mode === "practice") ? "block" : "none";
  }

  if (mode === "full") {
    blockSelect.value = "";
    state.block = null;
    blockSelect.disabled = true;
    blockHint.style.display = "block";
    blockHint.textContent = "En modo “Completo” no hace falta elegir bloque.";
  } else if (mode === "mistakes") {
    blockSelect.disabled = false;
    blockHint.style.display = "block";
    blockHint.textContent = `Se usarán tus fallos guardados (últimos ${MISTAKES_LOOKBACK_DAYS} días). El bloque es opcional y sirve como filtro.`;
  } else {
    blockSelect.disabled = false;
    blockHint.style.display = "none";
  }

  if (!opts.silent) {
    if (mode === "full" && Number(countSelect.value) < 30) {
      countSelect.value = "30";
      state.count = 30;
    }
    if ((mode === "exam" || mode === "practice") && Number(countSelect.value) > 15) {
      countSelect.value = "15";
      state.count = 15;
    }
  }

  syncStartEnabled();
}

function syncStartEnabled() {
  if (!startBtn) return;

  let ok = false;
  if (state.mode === "full") ok = true;
  else if (state.mode === "mistakes") ok = getPendingMistakesCount(state.block ? Number(state.block) : null) > 0;
  else ok = !!state.block;

  startBtn.disabled = !ok;
}

/* Helpers */
function normalizeOptions(opts) {
  if (Array.isArray(opts)) return opts;
  if (typeof opts === "string") {
    try { return JSON.parse(opts); } catch { return [opts]; }
  }
  return [];
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Fetchers */
async function fetchQuestions({ mode, block, count }) {
  const params = {
    p_count: Number(count),
    p_block: mode === "full" ? null : Number(block),
    p_topic: null,
  };

  const { data, error } = await sb.rpc("get_random_questions", params);
  if (error) throw error;

  return (data || []).map(q => ({
    kind: "db_questions",
    id: q.id,
    block: q.block,
    topic: q.topic,
    difficulty: q.difficulty,
    statement: q.statement,
    options: normalizeOptions(q.options),
    correctIndex: q.correct_index,
    explanation: q.explanation || "",
    reference: q.reference || "",
  }));
}

async function fetchMistakeQuestions() {
  const ids = getPendingMistakeIds({ block: state.block ? Number(state.block) : null });
  if (!ids.length) return [];

  const take = Math.min(Number(state.count), ids.length);
  const chosenIds = shuffleArray(ids).slice(0, take);

  const { data, error } = await sb.from("questions").select("*").in("id", chosenIds);
  if (error) throw error;

  return shuffleArray(data || []).map(q => ({
    kind: "db_questions",
    id: q.id,
    block: q.block,
    topic: q.topic,
    difficulty: q.difficulty,
    statement: q.statement,
    options: normalizeOptions(q.options),
    correctIndex: q.correct_index,
    explanation: q.explanation || "",
    reference: q.reference || "",
  }));
}

async function startPractical() {
  if (!state.block) {
    alert("Selecciona un bloque para ver el trabajo práctico.");
    return;
  }

  const { data, error } = await sb.rpc("get_random_practicals", {
    p_count: 1,
    p_block: Number(state.block),
    p_topic: null
  });

  if (error) throw error;
  if (!data || !data.length) {
    alert("No hay prácticos cargados para ese bloque todavía.");
    return;
  }

  openModal();
  renderPractical(data[0]);
}

async function startTest() {
  try {
    state.examHardMode = false;

    if (state.mode === "practice" && state.practiceKind === "practical") {
      await startPractical();
      return;
    }

    let data = [];
    if (state.mode === "mistakes") data = await fetchMistakeQuestions();
    else data = await fetchQuestions({ mode: state.mode, block: state.block, count: state.count });

    if (!data.length) {
      alert("No hay preguntas disponibles para esa selección.");
      return;
    }

    state.questions = data;
    state.index = 0;
    state.selected = null;
    state.answers = [];
    state.timeElapsed = 0;

    openModal();
    renderQuestion();
    startTimerIfNeeded();
  } catch (e) {
    console.error(e);
    alert("Error: " + (e?.message || JSON.stringify(e)));
  }
}

/* Simulacro (Exam) */
document.getElementById("startExam")?.addEventListener("click", async () => {
  try {
    state.examHardMode = true;
    state.mode = "exam";

    const examBlock = document.getElementById("examBlock")?.value || "";
    const blk = examBlock ? Number(examBlock) : null;

    const data = await fetchQuestions({ mode: blk ? "exam" : "full", block: blk || 1, count: 60 });
    if (!data.length) return alert("No hay preguntas para el simulacro.");

    state.questions = data;
    state.index = 0;
    state.selected = null;
    state.answers = [];
    state.timeElapsed = 0;

    openModal();
    renderQuestion();
    startTimerIfNeeded(60 * 60); // 60 min
  } catch (e) {
    console.error(e);
    alert("Error simulacro: " + (e?.message || JSON.stringify(e)));
  }
});

/* =========================
   Modal UI
========================= */
let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;

  modalEl = document.createElement("div");
  modalEl.className = "modal";
  modalEl.innerHTML = `
    <div class="modal__backdrop" data-close="1"></div>
    <div class="modal__panel" role="dialog" aria-modal="true" aria-label="Test OpoStudy">
      <div class="quiz">
        <div class="quiz__top">
          <div class="quiz__meta">
            <div class="quiz__title">Test</div>
            <div class="quiz__sub" id="quizSub">Cargando...</div>
          </div>
          <div class="quiz__right">
            <div class="quiz__timer" id="quizTimer">00:00</div>
            <button class="btn btn--ghost btn--small" id="quizCloseBtn" type="button">Salir</button>
          </div>
        </div>

        <div class="quiz__progress">
          <div class="quiz__bar"><div class="quiz__barFill" id="quizBarFill" style="width:0%"></div></div>
        </div>

        <div class="quiz__body" id="quizBody">
          <div class="quiz__q" id="quizQuestion"></div>
          <div class="quiz__opts" id="quizOptions"></div>
          <div class="quiz__explain" id="quizExplain" style="display:none;"></div>
        </div>

        <div class="quiz__footer">
          <button class="btn btn--ghost" id="quizPrev" type="button">Anterior</button>
          <button class="btn btn--primary" id="quizNext" type="button" disabled>Siguiente</button>
        </div>

        <div class="quiz__results" id="quizResults" style="display:none;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  modalEl.addEventListener("click", (e) => {
    if (e.target?.dataset?.close) closeModal();
  });

  modalEl.querySelector("#quizCloseBtn").addEventListener("click", () => closeModal());
  modalEl.querySelector("#quizPrev").addEventListener("click", () => goPrev());
  modalEl.querySelector("#quizNext").addEventListener("click", () => goNext());

  return modalEl;
}

function openModal() {
  ensureModal();
  modalEl.classList.add("is-open");
  document.body.classList.add("no-scroll");
  document.body.classList.add("has-modal-open"); // oculta bottom-nav

  // por si venimos de práctico (que los oculta)
  modalEl.querySelector("#quizPrev").style.display = "";
  modalEl.querySelector("#quizNext").style.display = "";
}

function closeModal() {
  stopTimer();
  if (!modalEl) return;
  modalEl.classList.remove("is-open");
  document.body.classList.remove("no-scroll");
  document.body.classList.remove("has-modal-open");
}

function renderQuestion() {
  const q = state.questions[state.index];

  const resultsEl = modalEl.querySelector("#quizResults");
  resultsEl.style.display = "none";
  const bodyEl = modalEl.querySelector("#quizBody");
  bodyEl.style.display = "block";

  // Subtítulo
  if (q.kind === "practice_questions") {
    modalEl.querySelector("#quizSub").textContent =
      `Supuesto ${q.supuesto} · Pregunta ${q.question_number}${q.is_reserve ? " (Reserva)" : ""}`;
  } else if (q.kind === "official_test") {
    modalEl.querySelector("#quizSub").textContent =
      `${q.testCode} · Parte ${q.part} · Pregunta ${q.question_number}${q.is_reserve ? " (Reserva)" : ""}`;
  } else {
    modalEl.querySelector("#quizSub").textContent =
      `Pregunta ${state.index + 1} de ${state.questions.length} · Bloque ${q.block} · Tema ${q.topic}`;
  }

  modalEl.querySelector("#quizQuestion").textContent = q.statement;

  const optsEl = modalEl.querySelector("#quizOptions");
  optsEl.innerHTML = "";

  state.selected = null;
  modalEl.querySelector("#quizNext").disabled = true;

  q.options.forEach((text, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt";
    btn.dataset.index = String(i);
    btn.innerHTML = `
      <span class="opt__key">${String.fromCharCode(65 + i)}</span>
      <span class="opt__text"></span>
    `;
    btn.querySelector(".opt__text").textContent = text;

    // si parece código/HTML, estilo monospace
    const t = String(text || "");
    const looksCode = t.includes("<") || t.includes(">") || t.includes("{") || t.includes("}") || t.includes(";") || t.includes("=>");
    if (looksCode) btn.classList.add("is-code");

    btn.addEventListener("click", () => selectOption(i));
    optsEl.appendChild(btn);
  });

  const pct = (state.index / state.questions.length) * 100;
  modalEl.querySelector("#quizBarFill").style.width = `${pct}%`;
  modalEl.querySelector("#quizPrev").disabled = state.index === 0;

  const ex = modalEl.querySelector("#quizExplain");
  ex.style.display = "none";
  ex.textContent = "";
}

function selectOption(i) {
  const q = state.questions[state.index];
  state.selected = i;

  modalEl.querySelectorAll(".opt").forEach((b) => {
    b.classList.toggle("is-selected", Number(b.dataset.index) === i);
    b.classList.remove("is-correct", "is-wrong");
  });

  const showImmediateCorrection =
    (state.mode === "practice" && state.practiceKind === "test") &&
    !state.examHardMode;

  if (showImmediateCorrection) {
    // Pintar correcto/incorrecto (si hay correctIndex)
    const hasCorrect = Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3;

    if (q.kind === "practice_questions") {
      const raw = (q.correctRaw || "").toString().trim().toUpperCase();
      if (raw !== "ANULADA" && hasCorrect) {
        modalEl.querySelectorAll(".opt").forEach((b) => {
          const idx = Number(b.dataset.index);
          if (idx === q.correctIndex) b.classList.add("is-correct");
          if (idx === i && i !== q.correctIndex) b.classList.add("is-wrong");
        });
      }
    } else {
      if (hasCorrect) {
        modalEl.querySelectorAll(".opt").forEach((b) => {
          const idx = Number(b.dataset.index);
          if (idx === q.correctIndex) b.classList.add("is-correct");
          if (idx === i && i !== q.correctIndex) b.classList.add("is-wrong");
        });
      }
    }

    // Texto de explicación/corrección
    const ex = modalEl.querySelector("#quizExplain");
    ex.style.display = "block";

    if (q.kind === "practice_questions") {
      const raw = (q.correctRaw || "").toString().trim().toUpperCase();
      if (raw === "ANULADA" || q.correctIndex < 0) ex.textContent = "Pregunta anulada.";
      else if (raw === "A" || raw === "B" || raw === "C" || raw === "D") ex.textContent = `Respuesta correcta: ${raw}.`;
      else ex.textContent = "Respuesta correcta no disponible.";
    } else {
      ex.textContent = q.explanation ? `Explicación: ${q.explanation}` : "Explicación no disponible.";
    }
  }

  modalEl.querySelector("#quizNext").disabled = false;
}

function goPrev() {
  if (state.index <= 0) return;
  state.index--;
  renderQuestion();
}

function goNext() {
  if (state.selected === null) return;

  const q = state.questions[state.index];

  // Evaluación (puede ser null si no hay plantilla)
  let isCorrect = false;

  if (q.kind === "practice_questions") {
    const raw = (q.correctRaw || "").toString().trim().toUpperCase();
    if (raw === "ANULADA" || q.correctIndex < 0) isCorrect = true;
    else isCorrect = state.selected === q.correctIndex;

  } else if (q.kind === "official_test") {
    // si no hay plantilla (correctIndex null), no evaluamos
    if (q.correctIndex === null || q.correctIndex === undefined) isCorrect = null;
    else isCorrect = state.selected === q.correctIndex;

  } else {
    isCorrect = state.selected === q.correctIndex;
  }

  // Mistakes SOLO para tabla questions normal
  if (q.kind !== "practice_questions" && q.kind !== "official_test") {
    if (isCorrect === false) upsertMistake(q.id, q.block, q.topic);
    else if (state.mode === "mistakes" && isCorrect === true) resolveMistake(q.id);
  }

  state.answers.push({
    id: q.id,
    block: q.block,
    topic: q.topic,
    selected: state.selected,
    correct: q.correctIndex,
    isCorrect,
  });

  // Stats: solo si evaluable
  updateStatsOnAnswer(stats, q.block, isCorrect);

  state.index++;

  if (state.index >= state.questions.length) finishTest();
  else renderQuestion();

  renderKpis();

  // Si viene de Parte práctica: marcar completado automáticamente
  if (q.kind === "practice_questions") {
    practicaDone[q.id] = true;
    savePracticaDone();
    renderPractica();
  }
}

function finishTest() {
  stopTimer();

  const graded = state.answers.filter(a => a.isCorrect !== null && a.isCorrect !== undefined);
  const correct = graded.filter(a => a.isCorrect).length;
  const total = graded.length;
  const pct = total ? Math.round((correct / total) * 100) : null;

  const bodyEl = modalEl.querySelector("#quizBody");
  bodyEl.style.display = "none";

  const resultsEl = modalEl.querySelector("#quizResults");
  resultsEl.style.display = "block";

  const mm = String(Math.floor(state.timeElapsed / 60)).padStart(2, "0");
  const ss = String(state.timeElapsed % 60).padStart(2, "0");

  const scoreHtml = (pct === null)
    ? `<div class="res__score">—</div><div class="res__line">Sin plantilla de respuestas (no se puede corregir).</div>`
    : `<div class="res__score">${pct}%</div><div class="res__line">Correctas: <strong>${correct}</strong> · Incorrectas: <strong>${total - correct}</strong></div>`;

  resultsEl.innerHTML = `
    <div class="res">
      ${scoreHtml}
      <div class="res__line">Tiempo: <strong>${mm}:${ss}</strong></div>
      <div class="res__actions">
        <button class="btn btn--ghost" id="resClose" type="button">Cerrar</button>
        <button class="btn btn--primary" id="resAgain" type="button">Repetir</button>
      </div>
    </div>
  `;

  modalEl.querySelector("#quizBarFill").style.width = "100%";
  resultsEl.querySelector("#resClose").addEventListener("click", () => closeModal());
  resultsEl.querySelector("#resAgain").addEventListener("click", () => startTest());
}

function startTimerIfNeeded(maxSeconds = null) {
  stopTimer();
  modalEl.querySelector("#quizTimer").textContent = "00:00";

  if (!state.timerEnabled && !state.examHardMode) return;

  state.timer = setInterval(() => {
    state.timeElapsed++;

    if (maxSeconds && state.timeElapsed >= maxSeconds) {
      finishTest();
      return;
    }

    const mm = String(Math.floor(state.timeElapsed / 60)).padStart(2, "0");
    const ss = String(state.timeElapsed % 60).padStart(2, "0");
    modalEl.querySelector("#quizTimer").textContent = `${mm}:${ss}`;
  }, 1000);
}

function stopTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

/* =========================
   Practicals (tu sistema anterior)
========================= */
function renderPractical(p) {
  const resultsEl = modalEl.querySelector("#quizResults");
  resultsEl.style.display = "none";
  const bodyEl = modalEl.querySelector("#quizBody");
  bodyEl.style.display = "block";

  modalEl.querySelector("#quizSub").textContent =
    `Trabajo práctico · Bloque ${p.block} · Tema ${p.topic} · Tipo: ${p.type}`;

  modalEl.querySelector("#quizQuestion").textContent = p.title || "Trabajo práctico";

  const optsEl = modalEl.querySelector("#quizOptions");
  optsEl.innerHTML = `
    <div class="practical">
      <div class="practical__prompt"><strong>Enunciado</strong><br>${escapeHtml(p.prompt || "").replaceAll("\n","<br>")}</div>
      <div class="practical__deliverable"><strong>Entrega</strong><br>${escapeHtml(p.deliverable || "No especificada.").replaceAll("\n","<br>")}</div>

      <label class="label" style="margin-top:14px;">Tu respuesta</label>
      <textarea id="practicalAnswer" class="textarea" rows="8" placeholder="Escribe aquí tu solución..."></textarea>

      <div class="practical__actions">
        <button class="btn btn--ghost" id="savePractical" type="button">Guardar</button>
        <button class="btn btn--primary" id="showSolution" type="button">Ver guía</button>
      </div>

      <div id="solutionBox" class="practical__solution" style="display:none;"></div>
    </div>
  `;

  // oculto navegación test
  modalEl.querySelector("#quizPrev").style.display = "none";
  modalEl.querySelector("#quizNext").style.display = "none";
  modalEl.querySelector("#quizBarFill").style.width = "0%";

  optsEl.querySelector("#savePractical").onclick = () => alert("Guardado (local).");

  optsEl.querySelector("#showSolution").onclick = () => {
    const box = optsEl.querySelector("#solutionBox");
    box.style.display = "block";
    box.innerHTML = `<strong>Guía</strong><br>${escapeHtml(p.solution || "Sin guía todavía.").replaceAll("\n","<br>")}`;

    if (p.assets?.mermaid && window.mermaid) {
      const id = "mmd_" + Math.random().toString(16).slice(2);
      box.innerHTML += `<div class="mermaid" id="${id}">${escapeHtml(p.assets.mermaid)}</div>`;
      try { mermaid.run({ querySelector: `#${id}` }); } catch {}
    }
  };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =========================
   Parte práctica (Supabase) — reusa IDs del temario
========================= */
let practicaCache = [];
let practicaDone = loadPracticaDone();

function loadPracticaDone() {
  try { return JSON.parse(localStorage.getItem(STORAGE_PRACTICA_DONE) || "{}"); }
  catch { return {}; }
}
function savePracticaDone() {
  localStorage.setItem(STORAGE_PRACTICA_DONE, JSON.stringify(practicaDone));
}

function correctOptionToIndex(v) {
  if (!v) return null;
  const s = String(v).trim().toUpperCase();
  if (s === "ANULADA") return -1;
  const map = { A: 0, B: 1, C: 2, D: 3 };
  return (s in map) ? map[s] : null;
}

async function loadPractica() {
  const listEl = document.getElementById("temarioList");
  if (!listEl) return;

  listEl.textContent = "Cargando parte práctica...";

  const { data, error } = await sb
    .from("practice_questions")
    .select("id,supuesto,is_reserve,question_number,statement,option_a,option_b,option_c,option_d,correct_option,source_pdf,created_at")
    .order("supuesto", { ascending: true })
    .order("is_reserve", { ascending: true })
    .order("question_number", { ascending: true });

  if (error) {
    listEl.textContent = "Error cargando parte práctica: " + error.message;
    return;
  }

  practicaCache = data || [];
  renderPractica();
}

function renderPractica() {
  const listEl = document.getElementById("temarioList");
  const sel = document.getElementById("temarioBlock"); // filtro supuesto
  const q = (document.getElementById("temarioSearch")?.value || "").trim().toLowerCase();

  const supuesto = sel?.value && sel.value !== "ALL" ? String(sel.value) : null;

  let items = [...practicaCache];
  if (supuesto) items = items.filter(x => String(x.supuesto) === supuesto);
  if (q) items = items.filter(x =>
    (x.statement || "").toLowerCase().includes(q) ||
    String(x.question_number || "").includes(q)
  );

  const total = items.length;
  const done = items.filter(x => !!practicaDone[x.id]).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const pctEl = document.getElementById("temarioPct");
  const fillEl = document.getElementById("temarioFill");
  if (pctEl) pctEl.textContent = `${pct}% completado`;
  if (fillEl) fillEl.style.width = `${pct}%`;

  if (!items.length) {
    listEl.textContent = "No hay ejercicios para ese filtro.";
    return;
  }

  listEl.innerHTML = items.map(x => {
    const checked = practicaDone[x.id] ? "checked" : "";
    const meta = `Supuesto ${escapeHtml(x.supuesto)} · Pregunta ${x.question_number}${x.is_reserve ? " (Reserva)" : ""}`;
    const preview = escapeHtml((x.statement || "").slice(0, 140)) + ((x.statement || "").length > 140 ? "…" : "");

    return `
      <div class="tema ${practicaDone[x.id] ? "is-done" : ""}" data-id="${x.id}">
        <input class="tema__check" type="checkbox" ${checked} aria-label="Marcar completado">
        <div>
          <div class="tema__title">${meta}</div>
          <div class="tema__meta">${preview}</div>
          <div class="tema__detail"></div>
        </div>
        <div class="tema__actions">
          <button class="btn btn--ghost btn--small practica__resolve" type="button">Resolver</button>
        </div>
      </div>
    `;
  }).join("");

  listEl.querySelectorAll(".tema").forEach(row => {
    const id = row.dataset.id;

    row.querySelector(".tema__check").addEventListener("change", (e) => {
      practicaDone[id] = !!e.target.checked;
      savePracticaDone();
      renderPractica();
    });

    row.querySelector(".practica__resolve").addEventListener("click", () => {
      const item = practicaCache.find(x => x.id === id);
      if (!item) return;
      openPracticeQuestion(item);
    });
  });
}

function openPracticeQuestion(item) {
  const correctIndex = correctOptionToIndex(item.correct_option);

  const q = {
    kind: "practice_questions",
    id: item.id,
    supuesto: String(item.supuesto || ""),
    is_reserve: !!item.is_reserve,
    question_number: Number(item.question_number || 0),

    statement: item.statement || "",
    options: [item.option_a, item.option_b, item.option_c, item.option_d].map(x => x || ""),

    correctIndex: (correctIndex === null ? 0 : correctIndex),
    correctRaw: (item.correct_option || "").toString(),

    explanation: "",
    reference: item.source_pdf || "",

    block: 0,
    topic: 0,
    difficulty: null,
  };

  // Forzamos modo práctica-test con corrección inmediata
  state.examHardMode = false;
  state.mode = "practice";
  state.practiceKind = "test";
  state.timerEnabled = false;

  state.questions = [q];
  state.index = 0;
  state.selected = null;
  state.answers = [];
  state.timeElapsed = 0;

  openModal();
  renderQuestion();
}

document.getElementById("temarioBlock")?.addEventListener("change", renderPractica);
document.getElementById("temarioSearch")?.addEventListener("input", renderPractica);

/* =========================
   Test oficial (TAI-2024) desde Supabase
========================= */
const officialTestSelect = document.getElementById("officialTestSelect");
const btnOfficialPart1 = document.getElementById("btnOfficialPart1");
const btnOfficialPart2 = document.getElementById("btnOfficialPart2");
const officialTestMeta = document.getElementById("officialTestMeta");

function letterToIndex(letter) {
  const s = String(letter || "").trim().toUpperCase();
  if (s === "A") return 0;
  if (s === "B") return 1;
  if (s === "C") return 2;
  if (s === "D") return 3;
  return null;
}

async function countOfficialParts(testCode) {
  const { count: c1, error: e1 } = await sb
    .from("official_test_questions")
    .select("*", { count: "exact", head: true })
    .eq("test_code", testCode)
    .eq("part", 1);

  const { count: c2, error: e2 } = await sb
    .from("official_test_questions")
    .select("*", { count: "exact", head: true })
    .eq("test_code", testCode)
    .eq("part", 2);

  if (e1 || e2) {
    if (officialTestMeta) officialTestMeta.textContent = "No puedo leer el test (revisa RLS o tabla).";
    return;
  }

  if (officialTestMeta) officialTestMeta.textContent =
    `Parte 1: ${c1 ?? 0} preguntas · Parte 2: ${c2 ?? 0} preguntas`;
}

async function fetchOfficialTest({ testCode, part }) {
  const { data, error } = await sb
    .from("official_test_questions")
    .select("id,test_code,part,question_number,statement,option_a,option_b,option_c,option_d,correct_option,is_reserve")
    .eq("test_code", testCode)
    .eq("part", Number(part))
    .order("is_reserve", { ascending: true })
    .order("question_number", { ascending: true });

  if (error) throw error;

  return (data || []).map(r => ({
    kind: "official_test",
    id: r.id,
    testCode: r.test_code,
    part: r.part,
    is_reserve: !!r.is_reserve,
    question_number: r.question_number,

    block: 0,
    topic: 0,
    difficulty: null,

    statement: r.statement,
    options: [r.option_a, r.option_b, r.option_c, r.option_d],
    correctIndex: letterToIndex(r.correct_option), // puede ser null
    explanation: "",
    reference: "",
  }));
}

async function startOfficialPart(part) {
  try {
    const testCode = officialTestSelect?.value || "TAI-2024";
    const qs = await fetchOfficialTest({ testCode, part });

    if (!qs.length) {
      alert(`No hay preguntas cargadas para ${testCode} Parte ${part}. Importa el CSV en Supabase.`);
      return;
    }

    // modo examen: sin corrección inmediata
    state.examHardMode = true;
    state.mode = "exam";
    state.practiceKind = "test";

    state.questions = qs;
    state.index = 0;
    state.selected = null;
    state.answers = [];
    state.timeElapsed = 0;

    openModal();
    renderQuestion();
    startTimerIfNeeded(); // sin límite fijo
  } catch (e) {
    console.error(e);
    alert("Error cargando test oficial: " + (e?.message || JSON.stringify(e)));
  }
}

btnOfficialPart1?.addEventListener("click", () => startOfficialPart(1));
btnOfficialPart2?.addEventListener("click", () => startOfficialPart(2));

officialTestSelect?.addEventListener("change", () => {
  countOfficialParts(officialTestSelect.value);
});

if (officialTestSelect) countOfficialParts(officialTestSelect.value);

/* =========================
   Coach Drawer (right slide)
========================= */
const coachFab = document.getElementById("coachFab");
const coachDrawer = document.getElementById("coachDrawer");
const coachClose = document.getElementById("coachClose");
const coachSend = document.getElementById("coachSend");
const coachClear = document.getElementById("coachClear");
const coachInput = document.getElementById("coachInput");
const coachLog = document.getElementById("coachLog");

function openCoach() {
  if (!coachDrawer) return;
  coachDrawer.classList.add("is-open");
  coachDrawer.setAttribute("aria-hidden", "false");
  setTimeout(() => coachInput?.focus(), 50);
}
function closeCoach() {
  if (!coachDrawer) return;
  coachDrawer.classList.remove("is-open");
  coachDrawer.setAttribute("aria-hidden", "true");
}

coachFab?.addEventListener("click", openCoach);
coachClose?.addEventListener("click", closeCoach);
coachDrawer?.addEventListener("click", (e) => {
  if (e.target?.dataset?.coachClose) closeCoach();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCoach();
});

function coachAdd(role, text) {
  if (!coachLog) return;
  const wrap = document.createElement("div");
  wrap.className = `coach__msg ${role === "me" ? "coach__msg--me" : "coach__msg--bot"}`;
  wrap.innerHTML = `<div class="coach__bubble">${escapeHtml(text)}</div>`;
  coachLog.appendChild(wrap);
  coachLog.scrollTop = coachLog.scrollHeight;
}

function coachReply(input) {
  const t = input.trim().toLowerCase();

  if (!t || t === "ayuda") {
    coachAdd("bot", "Dime qué necesitas: “fallos”, “plan”, “bloque 1/2/3/4” o “tiempo”.");
    return;
  }

  if (t.includes("fallo")) {
    const pending = getPendingMistakesCount(null);
    const b1 = getPendingMistakesCount(1);
    const b2 = getPendingMistakesCount(2);
    const b3 = getPendingMistakesCount(3);
    const b4 = getPendingMistakesCount(4);
    coachAdd("bot", `Tienes ${pending} fallos pendientes. B1:${b1} · B2:${b2} · B3:${b3} · B4:${b4}. Recomendación: repasa primero el bloque con más fallos y haz 15 preguntas.`);
    return;
  }

  if (t.includes("plan")) {
    const acc = stats.totalAnswered ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100) : 0;
    coachAdd("bot",
      `Plan rápido (20–30 min):\n1) 10 preguntas (bloque flojo)\n2) 5 repaso de fallos\n3) 5 preguntas mixtas.\nTu acierto actual: ${acc}%. Objetivo hoy: +3%.`
    );
    return;
  }

  if (t.includes("tiempo")) {
    coachAdd("bot", "Regla examen: 60 preguntas / 60 min ≈ 60s por pregunta. En entreno: 75–90s al principio, bajando a 60s cuando estés estable.");
    return;
  }

  const m = t.match(/bloque\s*(\d)/);
  if (m) {
    const b = Number(m[1]);
    coachAdd("bot", `Enfoque Bloque ${b}: 15 preguntas + repaso de fallos del bloque. Si tu acierto cae <70%, cambia a práctica (con corrección) 1 sesión.`);
    return;
  }

  coachAdd("bot", "No te pillo. Prueba: “fallos”, “plan”, “bloque 2”, “tiempo”.");
}

function sendCoach() {
  const txt = (coachInput?.value || "").trim();
  if (!txt) return;
  coachAdd("me", txt);
  coachInput.value = "";
  coachReply(txt);
}

coachSend?.addEventListener("click", sendCoach);
coachInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendCoach();
});
coachClear?.addEventListener("click", () => {
  if (!coachLog) return;
  coachLog.innerHTML = "";
  coachAdd("bot", "Soy tu Coach TAI. Escribe “fallos”, “plan”, “bloque 2” o “tiempo”.");
});

/* =========================
   PWA Install button
========================= */
let deferredPrompt = null;
const btnInstall = document.getElementById("btnInstall");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (btnInstall) btnInstall.hidden = false;
});

btnInstall?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  btnInstall.hidden = true;
});

/* =========================
   Init
========================= */
initTestsUI();
renderKpis();
loadPractica();

// Arranque coach mensaje
coachAdd("bot", "Soy tu Coach TAI. Escribe “fallos”, “plan”, “bloque 2” o “tiempo”.");

// Arranque en Start
showScreen("start");
document.getElementById("enterAppBtn")?.addEventListener("click", () => {
  showScreen("home");
  setTimeout(() => openCoach(), 180);
});
