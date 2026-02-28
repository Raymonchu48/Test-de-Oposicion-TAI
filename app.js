// app.js (Supabase + UI + modal test + mistakes + practicals + mermaid)

const sb = supabase.createClient(
  window.OPOSTUDY_CONFIG.SUPABASE_URL,
  window.OPOSTUDY_CONFIG.SUPABASE_ANON_KEY
);

if (window.mermaid) {
  window.mermaid.initialize({ startOnLoad: false, theme: "neutral" });
}

const STORAGE_KEY = "opostudy_stats_v1";
const STORAGE_MISTAKES_KEY = "opostudy_mistakes_v1";
const PRACTICALS_STORE = "opostudy_practicals_progress_v1";
const MISTAKES_LOOKBACK_DAYS = 30;

// UI refs
const modeSegment = document.getElementById("modeSegment");
const blockSelect = document.getElementById("blockSelect");
const countSelect = document.getElementById("countSelect");
const timerToggle = document.getElementById("timerToggle");
const startBtn = document.getElementById("startBtn");
const blockHint = document.getElementById("blockHint");
const practiceKindWrap = document.getElementById("practiceKindWrap");
const practiceKindSegment = document.getElementById("practiceKindSegment");

// KPI refs
const kpiAnswered = document.getElementById("kpiAnswered");
const kpiAccuracy = document.getElementById("kpiAccuracy");
const kpiStreak = document.getElementById("kpiStreak");
const kpiMistakes = document.getElementById("kpiMistakes");

const state = {
  mode: "exam", // exam | full | practice | mistakes
  practiceKind: "practical", // practical | test
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

let modalEl = null;

init();
renderKpis();

/* ---------------------------
   Init / Mode
---------------------------- */

function init() {
  state.count = Number(countSelect.value);
  state.timerEnabled = !!timerToggle.checked;

  modeSegment.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    setMode(btn.dataset.mode);
  });

  if (practiceKindSegment) {
    practiceKindSegment.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-kind]");
      if (!btn) return;

      state.practiceKind = btn.dataset.kind;
      practiceKindSegment.querySelectorAll(".segmented__btn").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.kind === state.practiceKind);
      });

      syncStartEnabled();
    });
  }

  blockSelect.addEventListener("change", () => {
    state.block = blockSelect.value ? Number(blockSelect.value) : null;
    syncStartEnabled();
  });

  countSelect.addEventListener("change", () => {
    state.count = Number(countSelect.value);
  });

  timerToggle.addEventListener("change", () => {
    state.timerEnabled = !!timerToggle.checked;
  });

  startBtn.addEventListener("click", () => startFlow());

  syncStartEnabled();
  setMode("exam", { silent: true });
}

function setMode(mode, opts = {}) {
  state.mode = mode;

  // Solo botones de modo (no tocar los del submodo práctica)
  document.querySelectorAll("#modeSegment .segmented__btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.mode === mode);
  });

  if (practiceKindWrap) {
    practiceKindWrap.style.display = mode === "practice" ? "block" : "none";
  }

  blockHint.textContent = "En modo “Completo” no hace falta elegir bloque.";

  if (mode === "full") {
    blockSelect.value = "";
    state.block = null;
    blockSelect.disabled = true;
    blockHint.style.display = "block";
  } else if (mode === "mistakes") {
    blockSelect.disabled = false; // filtro opcional
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
  let ok = false;

  if (state.mode === "full") {
    ok = true;
  } else if (state.mode === "mistakes") {
    const blockFilter = state.block ? Number(state.block) : null;
    ok = getPendingMistakesCount(blockFilter) > 0;
  } else if (state.mode === "practice") {
    // En práctica: bloque obligatorio (tanto test como práctico)
    ok = !!state.block;
  } else {
    ok = !!state.block;
  }

  startBtn.disabled = !ok;
}

/* ---------------------------
   Main flow
---------------------------- */

async function startFlow() {
  try {
    // Práctica → Trabajo práctico
    if (state.mode === "practice" && state.practiceKind === "practical") {
      await startPractical();
      return;
    }

    // Test normal (exam/full/practice-test/mistakes)
    let questions = [];
    if (state.mode === "mistakes") {
      questions = await fetchMistakeQuestions();
    } else {
      questions = await fetchQuestions({
        mode: state.mode,
        block: state.block,
        count: state.count,
      });
    }

    if (!questions.length) {
      alert("No hay preguntas disponibles para esa selección.");
      return;
    }

    state.questions = questions;
    state.index = 0;
    state.selected = null;
    state.answers = [];
    state.timeElapsed = 0;

    openModal();
    setQuizNavVisible(true);
    renderQuestion();
    startTimerIfNeeded();
  } catch (e) {
    console.error(e);
    alert("Error: " + (e?.message || JSON.stringify(e)));
  }
}

/* ---------------------------
   Supabase fetch
---------------------------- */

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

async function fetchMistakeQuestions() {
  const blockFilter = state.block ? Number(state.block) : null;
  const ids = getPendingMistakeIds({ block: blockFilter });
  if (!ids.length) return [];

  const take = Math.min(Number(state.count), ids.length);
  const chosenIds = shuffleArray(ids).slice(0, take);

  const { data, error } = await sb.from("questions").select("*").in("id", chosenIds);
  if (error) throw error;

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

async function startPractical() {
  if (!state.block) {
    alert("Selecciona un bloque para ver el trabajo práctico.");
    return;
  }

  const { data, error } = await sb.rpc("get_random_practicals", {
    p_count: 1,
    p_block: Number(state.block),
  });

  if (error) throw error;
  if (!data || !data.length) {
    alert("No hay prácticos cargados para ese bloque todavía.");
    return;
  }

  openModal();
  setQuizNavVisible(false);
  stopTimer();

  renderPractical(data[0]);
}

function normalizeOptions(opts) {
  if (Array.isArray(opts)) return opts;
  if (typeof opts === "string") {
    try { return JSON.parse(opts); } catch { return [opts]; }
  }
  return [];
}

function normalizeAssets(a) {
  if (!a) return {};
  if (typeof a === "object") return a;
  if (typeof a === "string") {
    try { return JSON.parse(a); } catch { return {}; }
  }
  return {};
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------------------
   Modal
---------------------------- */

function ensureModal() {
  if (modalEl) return modalEl;

  modalEl = document.createElement("div");
  modalEl.className = "modal";
  modalEl.innerHTML = `
    <div class="modal__backdrop" data-close="1"></div>
    <div class="modal__panel" role="dialog" aria-modal="true" aria-label="OpoStudy">
      <div class="quiz">
        <div class="quiz__top">
          <div class="quiz__meta">
            <div class="quiz__title">OpoStudy</div>
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

        <div class="quiz__footer" id="quizFooter">
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
}

function closeModal() {
  stopTimer();
  if (!modalEl) return;
  modalEl.classList.remove("is-open");
  document.body.classList.remove("no-scroll");
}

function setQuizNavVisible(visible) {
  const footer = modalEl.querySelector("#quizFooter");
  footer.style.display = visible ? "flex" : "none";
  modalEl.querySelector("#quizTimer").style.display = visible ? "block" : "none";
}

/* ---------------------------
   Test render
---------------------------- */

function renderQuestion() {
  const q = state.questions[state.index];

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

  if (state.mode === "practice") {
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

  // mistakes logic
  if (!isCorrect) upsertMistake(q.id, q.block, q.topic);
  else if (state.mode === "mistakes") resolveMistake(q.id);

  state.answers.push({
    id: q.id,
    block: q.block,
    topic: q.topic,
    selected: state.selected,
    correct: q.correctIndex,
    isCorrect,
  });

  updateStatsOnAnswer(isCorrect);

  state.index++;

  if (state.index >= state.questions.length) finishTest();
  else renderQuestion();
}

function finishTest() {
  stopTimer();

  const correct = state.answers.filter((a) => a.isCorrect).length;
  const total = state.answers.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;

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
  resultsEl.querySelector("#resAgain").addEventListener("click", () => startFlow());

  renderKpis();
}

/* ---------------------------
   Practical render
---------------------------- */

function renderPractical(p) {
  const assets = normalizeAssets(p.assets);

  const resultsEl = modalEl.querySelector("#quizResults");
  resultsEl.style.display = "none";
  const bodyEl = modalEl.querySelector("#quizBody");
  bodyEl.style.display = "block";

  modalEl.querySelector("#quizSub").textContent =
    `Trabajo práctico · Bloque ${p.block} · Tema ${p.topic} · Tipo: ${p.type}`;

  modalEl.querySelector("#quizQuestion").textContent = p.title;

  const optsEl = modalEl.querySelector("#quizOptions");

  const diagramHtml = assets.mermaid
    ? `<div class="practical__prompt"><strong>Diagrama</strong><pre class="mermaid" id="mmd">${escapeHtml(assets.mermaid)}</pre></div>`
    : "";

  optsEl.innerHTML = `
    <div class="practical">
      ${diagramHtml}
      <div class="practical__prompt"><strong>Enunciado</strong><br>${escapeHtml(p.prompt).replaceAll("\n","<br>")}</div>
      <div class="practical__deliverable"><strong>Entrega</strong><br>${escapeHtml(p.deliverable || "No especificada.").replaceAll("\n","<br>")}</div>

      <label class="label" style="margin-top:14px;">Tu respuesta</label>
      <textarea id="practicalAnswer" class="textarea" rows="8" placeholder="Escribe aquí tu solución..."></textarea>

      <div class="practical__actions">
        <button class="btn btn--ghost" id="savePractical" type="button">Guardar</button>
        <button class="btn btn--primary" id="showSolution" type="button">Ver solución</button>
      </div>

      <div id="solutionBox" class="practical__solution" style="display:none;"></div>
    </div>
  `;

  // Load saved answer
  const store = loadPracticalProgress();
  if (store[p.id]?.answer) {
    optsEl.querySelector("#practicalAnswer").value = store[p.id].answer;
  }

  // Actions
  optsEl.querySelector("#savePractical").onclick = () => {
    const txt = optsEl.querySelector("#practicalAnswer").value || "";
    savePracticalProgress(p.id, txt);
    alert("Guardado.");
  };

  optsEl.querySelector("#showSolution").onclick = () => {
    const box = optsEl.querySelector("#solutionBox");
    box.style.display = "block";
    box.innerHTML = `<strong>Solución / guía</strong><br>${escapeHtml(p.solution || "Sin solución todavía.").replaceAll("\n","<br>")}`;
  };

  // Mermaid render (si existe)
  if (assets.mermaid && window.mermaid) {
    const node = optsEl.querySelector("#mmd");
    if (node) {
      window.mermaid.run({ nodes: [node] });
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadPracticalProgress() {
  try { return JSON.parse(localStorage.getItem(PRACTICALS_STORE) || "{}"); }
  catch { return {}; }
}

function savePracticalProgress(id, answer) {
  const store = loadPracticalProgress();
  store[id] = { answer, updated_at: new Date().toISOString() };
  localStorage.setItem(PRACTICALS_STORE, JSON.stringify(store));
}

/* ---------------------------
   Timer
---------------------------- */

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
    return { totalAnswered: 0, totalCorrect: 0, mistakes: 0, streakDays: 0, lastStudyDate: null };
  }
  try { return JSON.parse(raw); }
  catch { return { totalAnswered: 0, totalCorrect: 0, mistakes: 0, streakDays: 0, lastStudyDate: null }; }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stats));
}

function updateStatsOnAnswer(isCorrect) {
  state.stats.totalAnswered++;
  if (isCorrect) state.stats.totalCorrect++;
  if (!isCorrect) state.stats.mistakes++;

  const today = new Date();
  const ymd = today.toISOString().slice(0, 10);

  if (!state.stats.lastStudyDate) state.stats.streakDays = 1;
  else if (state.stats.lastStudyDate !== ymd) {
    const last = new Date(state.stats.lastStudyDate + "T00:00:00Z");
    const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
    state.stats.streakDays = diffDays === 1 ? state.stats.streakDays + 1 : 1;
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

/* ---------------------------
   Mistakes store
---------------------------- */

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
