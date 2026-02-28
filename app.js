// app.js (Supabase + UI + modal test)

const sb = supabase.createClient(
  window.OPOSTUDY_CONFIG.SUPABASE_URL,
  window.OPOSTUDY_CONFIG.SUPABASE_ANON_KEY
);

const STORAGE_KEY = "opostudy_stats_v1";
const STORAGE_MISTAKES_KEY = "opostudy_mistakes_v1";
const MISTAKES_LOOKBACK_DAYS = 30; // repaso por defecto: últimos 30 días

// UI refs
const modeSegment = document.getElementById("modeSegment");
const blockSelect = document.getElementById("blockSelect");
const countSelect = document.getElementById("countSelect");
const timerToggle = document.getElementById("timerToggle");
const startBtn = document.getElementById("startBtn");
const blockHint = document.getElementById("blockHint");

// KPI refs
const kpiAnswered = document.getElementById("kpiAnswered");
const kpiAccuracy = document.getElementById("kpiAccuracy");
const kpiStreak = document.getElementById("kpiStreak");
const kpiMistakes = document.getElementById("kpiMistakes");

const state = {
  mode: "exam", // exam | full | practice
  practiceKind: "practical", // practical | test   ✅ aquí
  block: null,
  count: 15,
  timerEnabled: true,

  questions: [],
  index: 0,
  selected: null,
  answers: [],

  timer: null,
  timeElapsed: 0,

  stats: loadStats(),
};

init();
renderKpis();

function init() {
  // Defaults from UI
  state.count = Number(countSelect.value);
  state.timerEnabled = !!timerToggle.checked;

  // Mode buttons
  modeSegment.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    setMode(btn.dataset.mode);
  });

  // Block
  blockSelect.addEventListener("change", () => {
    state.block = blockSelect.value ? Number(blockSelect.value) : null;
    syncStartEnabled();
  });

  // Count
  countSelect.addEventListener("change", () => {
    state.count = Number(countSelect.value);
  });

  // Timer
  timerToggle.addEventListener("change", () => {
    state.timerEnabled = !!timerToggle.checked;
  });

  // Start
  startBtn.addEventListener("click", () => startTest());

  // Start enabled/disabled
  syncStartEnabled();

  // Default mode visual
  setMode("exam", { silent: true });
}

function setMode(mode, opts = {}) {
  state.mode = mode;

  // UI active state
  document.querySelectorAll(".segmented__btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.mode === mode);
  });

  // UX rules
  if (mode === "full") {
    blockSelect.value = "";
    state.block = null;
    blockSelect.disabled = true;
    blockHint.style.display = "block";
  } else {
    blockSelect.disabled = false;
    blockHint.style.display = "none";
  }
  if (mode === "mistakes") {
  blockSelect.disabled = false; // lo dejamos para filtrar fallos por bloque si quieres
  blockHint.style.display = "block";
  blockHint.textContent = `Se usarán tus fallos guardados (últimos ${MISTAKES_LOOKBACK_DAYS} días). El bloque es opcional y sirve como filtro.`;
}

  // Count suggestion
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
  let ok = false;

  if (state.mode === "full") {
    ok = true;
  } else if (state.mode === "mistakes") {
    // si hay bloque seleccionado, filtra; si no, todos
    const blockFilter = state.block ? Number(state.block) : null;
    ok = getPendingMistakesCount(blockFilter) > 0;
  } else {
    ok = !!state.block;
  }

  startBtn.disabled = !ok;
}

async function startTest() {
  try {
    if (state.mode !== "full" && !state.block) {
      alert("Selecciona un bloque antes de empezar.");
      return;
    }

   let data = [];

if (state.mode === "mistakes") {
  data = await fetchMistakeQuestions();
} else {
  data = await fetchQuestions({
    mode: state.mode,
    block: state.block,
    count: state.count,
  });
}

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
    alert("Error cargando preguntas: " + (e?.message || JSON.stringify(e)));
  }
}
async function fetchMistakeQuestions() {
  const blockFilter = state.block ? Number(state.block) : null;
  const ids = getPendingMistakeIds({ block: blockFilter });

  if (!ids.length) return [];

  // Limitar a lo pedido (barajar luego)
  const take = Math.min(Number(state.count), ids.length);
  const chosenIds = shuffleArray(ids).slice(0, take);

  const { data, error } = await sb
    .from("questions")
    .select("*")
    .in("id", chosenIds);

  if (error) throw error;

  // Barajar para orden aleatorio
  const shuffled = shuffleArray(data || []);

  return shuffled.map((q) => ({
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

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
async function fetchQuestions({ mode, block, count }) {
  const params = {
    p_count: Number(count),
    p_block: mode === "full" ? null : Number(block),
    p_topic: null,
  };

  const { data, error } = await sb.rpc("get_random_questions", params);
  if (error) throw error;

  return (data || []).map((q) => ({
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

function normalizeOptions(opts) {
  if (Array.isArray(opts)) return opts;
  if (typeof opts === "string") {
    try { return JSON.parse(opts); } catch { return [opts]; }
  }
  return [];
}

/* ---------------------------
   Modal UI (test)
---------------------------- */

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

  // close handlers
  modalEl.addEventListener("click", (e) => {
    if (e.target?.dataset?.close) closeModal();
  });
  modalEl.querySelector("#quizCloseBtn").addEventListener("click", () => closeModal());

  // nav handlers
  modalEl.querySelector("#quizPrev").addEventListener("click", () => goPrev());
  modalEl.querySelector("#quizNext").addEventListener("click", () => goNext());

  return modalEl;
}

function openModal() {
  ensureModal();
  modalEl.classList.add("is-open");
  document.body.classList.add("no-scroll");
}

function closeModal() {
  stopTimer();
  if (!modalEl) return;
  modalEl.classList.remove("is-open");
  document.body.classList.remove("no-scroll");
}

function renderQuestion() {
  const q = state.questions[state.index];

  // reset view
  const resultsEl = modalEl.querySelector("#quizResults");
  resultsEl.style.display = "none";
  const bodyEl = modalEl.querySelector("#quizBody");
  bodyEl.style.display = "block";

  modalEl.querySelector("#quizSub").textContent =
    `Pregunta ${state.index + 1} de ${state.questions.length} · Bloque ${q.block} · Tema ${q.topic}`;

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

    btn.addEventListener("click", () => selectOption(i));
    optsEl.appendChild(btn);
  });

  // progress
  const pct = (state.index / state.questions.length) * 100;
  modalEl.querySelector("#quizBarFill").style.width = `${pct}%`;

  // prev button
  modalEl.querySelector("#quizPrev").disabled = state.index === 0;

  // explanation (practice only)
  const ex = modalEl.querySelector("#quizExplain");
  ex.style.display = "none";
  ex.textContent = "";
}

function selectOption(i) {
  const q = state.questions[state.index];
  state.selected = i;

  // highlight selected
  modalEl.querySelectorAll(".opt").forEach((b) => {
    b.classList.toggle("is-selected", Number(b.dataset.index) === i);
    b.classList.remove("is-correct", "is-wrong");
  });

  if (state.mode === "practice") {
    // show correction immediately
    modalEl.querySelectorAll(".opt").forEach((b) => {
      const idx = Number(b.dataset.index);
      if (idx === q.correctIndex) b.classList.add("is-correct");
      if (idx === i && i !== q.correctIndex) b.classList.add("is-wrong");
    });

    const ex = modalEl.querySelector("#quizExplain");
    ex.style.display = "block";
    ex.textContent = q.explanation ? `Explicación: ${q.explanation}` : "Explicación no disponible.";
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
  const isCorrect = state.selected === q.correctIndex;
  if (!isCorrect) {
  upsertMistake(q.id, q.block, q.topic);
} else if (state.mode === "mistakes") {
  // Si lo aciertas en repaso, lo quitamos de "pendientes"
  resolveMistake(q.id);
}

  state.answers.push({
    id: q.id,
    block: q.block,
    topic: q.topic,
    selected: state.selected,
    correct: q.correctIndex,
    isCorrect,
  });

  // stats
  updateStatsOnAnswer(isCorrect);

  state.index++;

  if (state.index >= state.questions.length) {
    finishTest();
  } else {
    renderQuestion();
  }
}

function finishTest() {
  stopTimer();

  const correct = state.answers.filter((a) => a.isCorrect).length;
  const total = state.answers.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  // results view
  const bodyEl = modalEl.querySelector("#quizBody");
  bodyEl.style.display = "none";

  const resultsEl = modalEl.querySelector("#quizResults");
  resultsEl.style.display = "block";

  const mm = String(Math.floor(state.timeElapsed / 60)).padStart(2, "0");
  const ss = String(state.timeElapsed % 60).padStart(2, "0");

  resultsEl.innerHTML = `
    <div class="res">
      <div class="res__score">${pct}%</div>
      <div class="res__line">Correctas: <strong>${correct}</strong> · Incorrectas: <strong>${total - correct}</strong> · Tiempo: <strong>${mm}:${ss}</strong></div>
      <div class="res__actions">
        <button class="btn btn--ghost" id="resClose" type="button">Cerrar</button>
        <button class="btn btn--primary" id="resAgain" type="button">Repetir</button>
      </div>
    </div>
  `;

  modalEl.querySelector("#quizBarFill").style.width = "100%";
  resultsEl.querySelector("#resClose").addEventListener("click", () => closeModal());
  resultsEl.querySelector("#resAgain").addEventListener("click", () => startTest());

  renderKpis();
}

function startTimerIfNeeded() {
  stopTimer();
  modalEl.querySelector("#quizTimer").textContent = "00:00";

  if (!state.timerEnabled) return;

  state.timer = setInterval(() => {
    state.timeElapsed++;
    const mm = String(Math.floor(state.timeElapsed / 60)).padStart(2, "0");
    const ss = String(state.timeElapsed % 60).padStart(2, "0");
    modalEl.querySelector("#quizTimer").textContent = `${mm}:${ss}`;
  }, 1000);
}

function stopTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

/* ---------------------------
   Stats
---------------------------- */

function loadStats() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      totalAnswered: 0,
      totalCorrect: 0,
      mistakes: 0,
      streakDays: 0,
      lastStudyDate: null, // YYYY-MM-DD
    };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {
      totalAnswered: 0,
      totalCorrect: 0,
      mistakes: 0,
      streakDays: 0,
      lastStudyDate: null,
    };
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stats));
}

function updateStatsOnAnswer(isCorrect) {
  state.stats.totalAnswered++;
  if (isCorrect) state.stats.totalCorrect++;
  if (!isCorrect) state.stats.mistakes++;

  // streak logic (simple)
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10);

  if (!state.stats.lastStudyDate) {
    state.stats.streakDays = 1;
  } else if (state.stats.lastStudyDate !== ymd) {
    const last = new Date(state.stats.lastStudyDate + "T00:00:00Z");
    const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) state.stats.streakDays += 1;
    else state.stats.streakDays = 1;
  }

  state.stats.lastStudyDate = ymd;
  saveStats();
}

function renderKpis() {
  kpiAnswered.textContent = String(state.stats.totalAnswered);
  const acc = state.stats.totalAnswered
    ? Math.round((state.stats.totalCorrect / state.stats.totalAnswered) * 100)
    : 0;
  kpiAccuracy.textContent = `${acc}%`;
  kpiStreak.textContent = String(state.stats.streakDays);
  kpiMistakes.textContent = String(getPendingMistakesCount(null));

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


