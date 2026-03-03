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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}
/* ==========================
   Coach inline (local)
   ========================== */
const COACH_STORE = "opostudy_coach_chat_v1";

function loadCoachChat(){
  try { return JSON.parse(localStorage.getItem(COACH_STORE) || "[]"); }
  catch { return []; }
}

function saveCoachChat(list){
  localStorage.setItem(COACH_STORE, JSON.stringify(list));
}

function coachReply(text){
  const t = (text || "").toLowerCase();

  if (t.includes("fallos") || t.includes("repaso")) {
    return "Repaso rápido: entra en “Repaso de fallos”, haz 10–15 preguntas y apunta por qué fallaste (concepto, trampa, prisa).";
  }
  if (t.includes("plan")) {
    return "Plan recomendado: 15 preguntas/día + 5 de repaso de fallos. Alterna bloques (1→2→3→4) y cada 7 días haz un examen completo.";
  }
  if (t.includes("bloque 1")) return "Bloque 1: Constitución, organización del Estado, procedimiento, transparencia, eIDAS/administración electrónica. Prioriza artículos clave y definiciones.";
  if (t.includes("bloque 2")) return "Bloque 2: hardware, SO, redes básicas, bases de datos, seguridad básica. Ideal para subir nota rápida con práctica.";
  if (t.includes("bloque 3")) return "Bloque 3: desarrollo, BD, UML, POO, APIs. Enfócate en conceptos + ejemplos.";
  if (t.includes("bloque 4")) return "Bloque 4: redes, TCP/IP, servicios, DNS, VPN, seguridad perimetral. Practica preguntas tipo protocolo/puerto.";
  if (t.includes("tiempo") || t.includes("temporizador")) {
    return "Si vas justo: desactiva temporizador en práctica y actívalo en examen. Meta: 60–75s por pregunta con revisión posterior.";
  }
  if (t.includes("estrategia") || t.includes("nota")) {
    return "Estrategia: primero precisión (70%+), luego velocidad. Guarda fallos, repite hasta que caigan a 0 pendientes.";
  }

  return "Dime qué necesitas: “fallos”, “plan”, “bloque 1/2/3/4” o “tiempo”.";
}

function renderCoach(){
  const log = document.getElementById("coachLog");
  if (!log) return;

  const chat = loadCoachChat();
  log.innerHTML = "";

  for (const m of chat){
    const row = document.createElement("div");
    row.className = "coach__msg " + (m.role === "me" ? "coach__msg--me" : "coach__msg--bot");

    const bubble = document.createElement("div");
    bubble.className = "coach__bubble";
    bubble.textContent = m.text;

    row.appendChild(bubble);
    log.appendChild(row);
  }

  log.scrollTop = log.scrollHeight;
}

function pushCoach(role, text){
  const chat = loadCoachChat();
  chat.push({ role, text, ts: Date.now() });
  // limita historial
  if (chat.length > 120) chat.splice(0, chat.length - 120);
  saveCoachChat(chat);
  renderCoach();
}

function setupCoach(){
  const input = document.getElementById("coachInput");
  const send = document.getElementById("coachSend");
  const clear = document.getElementById("coachClear");

  if (!input || !send || !clear) return;

  renderCoach();

  const doSend = () => {
    const txt = (input.value || "").trim();
    if (!txt) return;
    input.value = "";
    pushCoach("me", txt);

    const r = coachReply(txt);
    setTimeout(() => pushCoach("bot", r), 180);
  };

  send.addEventListener("click", doSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSend();
  });
  clear.addEventListener("click", () => {
    localStorage.removeItem(COACH_STORE);
    renderCoach();
  });

  // mensaje inicial si está vacío
  if (loadCoachChat().length === 0){
    pushCoach("bot", "Soy tu Coach TAI. Escribe “fallos”, “plan”, “bloque 2” o “tiempo”.");
  }
}

setupCoach();
// ==========================
// Coach TAI (inline) · v1 local (sin API)
// ==========================
(function setupCoachTAI(){
  const coachCard = document.getElementById("coachCard");
  const logEl = document.getElementById("coachLog");
  const inputEl = document.getElementById("coachInput");
  const sendBtn = document.getElementById("coachSend");
  const clearBtn = document.getElementById("coachClear");

  if (!coachCard || !logEl || !inputEl || !sendBtn || !clearBtn) return;

  const COACH_STORE = "opostudy_coach_v1";

  function loadChat(){
    try { return JSON.parse(localStorage.getItem(COACH_STORE) || "[]"); }
    catch { return []; }
  }
  function saveChat(msgs){
    localStorage.setItem(COACH_STORE, JSON.stringify(msgs.slice(-40))); // limita historial
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function addMsg(role, text){
    const msg = { role, text, t: new Date().toISOString() };
    const msgs = loadChat();
    msgs.push(msg);
    saveChat(msgs);
    render();
  }

  function render(){
    const msgs = loadChat();
    logEl.innerHTML = "";
    msgs.forEach(m => {
      const row = document.createElement("div");
      row.className = "coach__msg " + (m.role === "me" ? "coach__msg--me" : "coach__msg--bot");
      row.innerHTML = `<div class="coach__bubble">${escapeHtml(m.text).replaceAll("\n","<br>")}</div>`;
      logEl.appendChild(row);
    });
    logEl.scrollTop = logEl.scrollHeight;
  }

  function normalizeCmd(raw){
    return raw.trim().toLowerCase();
  }

  function getAccuracy(){
    const a = state?.stats?.totalAnswered || 0;
    const c = state?.stats?.totalCorrect || 0;
    return a ? Math.round((c / a) * 100) : 0;
  }

  function reply(cmdRaw){
    const cmd = normalizeCmd(cmdRaw);

    // ayuda
    if (cmd === "ayuda" || cmd === "help" || cmd === "?"){
      return [
        "Comandos disponibles:",
        "- fallos → repaso inteligente (últimos " + (typeof MISTAKES_LOOKBACK_DAYS !== "undefined" ? MISTAKES_LOOKBACK_DAYS : 30) + " días)",
        "- plan → plan de estudio para hoy",
        "- bloque 1|2|3|4 → recomendación por bloque",
        "- tiempo → sesiones 10/20/45 min",
        "- ayuda → ver comandos"
      ].join("\n");
    }

    // fallos
    if (cmd.startsWith("fallos")){
      const pending = (typeof getPendingMistakesCount === "function") ? getPendingMistakesCount(null) : 0;
      if (!pending) return "No tienes fallos pendientes 🎯. Haz 15 preguntas en modo Examen o sube dificultad.";
      return `Tienes ${pending} fallos pendientes.\nRecomendación: entra en “Repaso de fallos” y haz 15.\nTip: si quieres filtrar: escribe “bloque 2”.`;
    }

    // bloque N
    const mBlock = cmd.match(/^bloque\s*([1-4])$/);
    if (mBlock){
      const b = Number(mBlock[1]);
      return [
        `Bloque ${b}: plan recomendado`,
        `1) Examen (15) del Bloque ${b}`,
        `2) Práctica → Trabajo práctico del Bloque ${b}`,
        `3) Repaso de fallos (si tienes pendientes)`,
      ].join("\n");
    }

    // plan
    if (cmd.startsWith("plan")){
      const acc = getAccuracy();
      const pending = (typeof getPendingMistakesCount === "function") ? getPendingMistakesCount(null) : 0;

      let foco = "Examen (15)";
      if (pending >= 10) foco = "Repaso de fallos (15)";
      else if (acc < 60) foco = "Práctica (test con corrección)";

      return [
        "Plan de hoy (15–25 min):",
        `- Foco: ${foco}`,
        `- Acierto actual: ${acc}%`,
        `- Fallos pendientes: ${pending}`,
        "Regla: si fallas 3 seguidas → cambia a Práctica y lee explicación."
      ].join("\n");
    }

    // tiempo
    if (cmd.startsWith("tiempo")){
      return [
        "Sesiones rápidas:",
        "- 10 min: 10 preguntas (Práctica)",
        "- 20 min: 15 preguntas (Examen)",
        "- 45 min: 30 preguntas (Completo) + repaso de fallos"
      ].join("\n");
    }

    // default
    return `No pillo ese comando.\nEscribe “ayuda” para ver opciones.`;
  }

  // Eventos
  sendBtn.addEventListener("click", () => {
    const txt = inputEl.value.trim();
    if (!txt) return;
    addMsg("me", txt);
    const ans = reply(txt);
    addMsg("bot", ans);
    inputEl.value = "";
    inputEl.focus();
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      sendBtn.click();
    }
  });

  clearBtn.addEventListener("click", () => {
    localStorage.removeItem(COACH_STORE);
    render();
    addMsg("bot", "Chat limpio. Escribe “ayuda” para ver comandos.");
  });

  // Init
  render();
  if (!loadChat().length){
    addMsg("bot", 'Soy tu Coach TAI. Escribe “fallos”, “plan”, “bloque 2” o “tiempo”.');
  }
})();
// ===== Navegación tipo app (SPA) =====
(function initSpaNav(){
  const splash = document.getElementById("splash");
  const enterApp = document.getElementById("enterApp");
  const tabbar = document.getElementById("tabbar");
  const pages = Array.from(document.querySelectorAll(".page"));

  function showPage(name){
    pages.forEach(p => p.classList.toggle("is-active", p.dataset.page === name));
    tabbar?.querySelectorAll(".tabbar__btn")
      .forEach(b => b.classList.toggle("is-active", b.dataset.page === name));
    // Scroll arriba al cambiar
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Splash: recordar que ya entró
  const seen = localStorage.getItem("opostudy_seen_splash") === "1";
  if (seen && splash) splash.classList.add("is-hidden");

  enterApp?.addEventListener("click", () => {
    localStorage.setItem("opostudy_seen_splash", "1");
    splash?.classList.add("is-hidden");
    showPage("dashboard");
  });

  tabbar?.addEventListener("click", (e) => {
    const btn = e.target.closest(".tabbar__btn[data-page]");
    if (!btn) return;
    showPage(btn.dataset.page);
  });

  // Botón “Abrir test” desde tab Tests (si existe tu modal)
  const openFromTab = document.getElementById("openTestFromTab");
  openFromTab?.addEventListener("click", () => {
    // reutiliza tu flujo existente
    startTest();
  });

  // Default
  showPage("dashboard");
})();

/* ==========================
   Temario (Supabase) + Progreso (local)
   ========================== */

const SYLLABUS_TABLE = "syllabus_items";
const TEMARIO_PROGRESS_KEY = "opostudy_temario_progress_v1";

function loadTemarioProgress(){
  try { return JSON.parse(localStorage.getItem(TEMARIO_PROGRESS_KEY) || "{}"); }
  catch { return {}; }
}
function saveTemarioProgress(store){
  localStorage.setItem(TEMARIO_PROGRESS_KEY, JSON.stringify(store));
}

let _temarioCache = null;

async function fetchSyllabusItems(){
  if (_temarioCache) return _temarioCache;

  const { data, error } = await sb
    .from(SYLLABUS_TABLE)
    .select("id, block, topic, title, detail, ord")
    .order("block", { ascending: true })
    .order("topic", { ascending: true })
    .order("ord", { ascending: true });

  if (error) throw error;
  _temarioCache = data || [];
  return _temarioCache;
}

function groupByBlock(items){
  const m = new Map();
  for (const it of items){
    const b = Number(it.block);
    if (!m.has(b)) m.set(b, []);
    m.get(b).push(it);
  }
  return Array.from(m.entries()).sort((a,b)=>a[0]-b[0]);
}

function computeBlockPct(items, progressStore, block){
  const blockItems = items.filter(x => Number(x.block) === Number(block));
  if (!blockItems.length) return 0;
  const done = blockItems.filter(x => progressStore[x.id]?.done).length;
  return Math.round((done / blockItems.length) * 100);
}

function renderTemarioSummary(items){
  const el = document.getElementById("temarioSummary");
  if (!el) return;
  const store = loadTemarioProgress();

  const blocks = [1,2,3,4].map(b => ({
    block: b,
    pct: computeBlockPct(items, store, b)
  }));

  el.innerHTML = blocks.map(b => `
    <div class="temario__chip">
      <div class="temario__chipTitle">Bloque ${b.block}</div>
      <div class="temario__bar"><div class="temario__barFill" style="width:${b.pct}%"></div></div>
      <div class="hint" style="margin-top:8px;">${b.pct}% completado</div>
    </div>
  `).join("");
}

function renderTemario(items){
  const listEl = document.getElementById("temarioList");
  if (!listEl) return;

  const store = loadTemarioProgress();
  const groups = groupByBlock(items);

  listEl.innerHTML = groups.map(([block, blockItems]) => {
    const doneCount = blockItems.filter(x => store[x.id]?.done).length;
    const pct = blockItems.length ? Math.round((doneCount / blockItems.length) * 100) : 0;

    return `
      <div class="temario__block">
        <div class="temario__blockHead">
          <div class="temario__blockTitle">Bloque ${block}</div>
          <div class="temario__blockMeta">${doneCount}/${blockItems.length} · ${pct}%</div>
        </div>
        <div class="temario__items">
          ${blockItems.map(it => {
            const checked = !!store[it.id]?.done;
            return `
              <div class="temario__item">
                <input class="temario__check" type="checkbox" data-temario-id="${it.id}" ${checked ? "checked" : ""}>
                <div>
                  <div class="temario__title">${escapeHtml(it.title)}</div>
                  ${it.detail ? `<div class="temario__detail">${escapeHtml(it.detail)}</div>` : ""}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");

  // listeners
  listEl.querySelectorAll('input[type="checkbox"][data-temario-id]').forEach(chk => {
    chk.addEventListener("change", () => {
      const id = chk.getAttribute("data-temario-id");
      const storeNow = loadTemarioProgress();
      storeNow[id] = { done: chk.checked, updated_at: new Date().toISOString() };
      saveTemarioProgress(storeNow);

      // re-render summary + stats
      renderTemarioSummary(items);
      renderStatsBlocks(items);
    });
  });
}

function renderStatsBlocks(items){
  const el = document.getElementById("statsBlocks");
  if (!el) return;

  const store = loadTemarioProgress();
  const blocks = [1,2,3,4].map(b => ({
    block: b,
    pct: computeBlockPct(items, store, b),
    done: items.filter(x => Number(x.block)===b && store[x.id]?.done).length,
    total: items.filter(x => Number(x.block)===b).length
  }));

  el.innerHTML = blocks.map(b => `
    <div class="statsCard">
      <div class="statsCard__top">
        <div class="statsCard__title">Bloque ${b.block}</div>
        <div class="statsCard__pct">${b.pct}%</div>
      </div>
      <div class="temario__bar" style="margin-top:10px;">
        <div class="temario__barFill" style="width:${b.pct}%"></div>
      </div>
      <div class="hint" style="margin-top:10px;">${b.done}/${b.total} subtemas completados</div>
    </div>
  `).join("");
}

async function initTemarioPage(){
  const items = await fetchSyllabusItems();
  renderTemarioSummary(items);
  renderTemario(items);
}

async function initStatsPage(){
  const items = await fetchSyllabusItems();
  renderStatsBlocks(items);
}

// Hook por hash (tu nav ya lo cambia)
function currentPageId(){
  return (location.hash || "#dashboard").replace("#", "");
}
async function onPageChange(){
  const p = currentPageId();
  try{
    if (p === "temario") await initTemarioPage();
    if (p === "stats") await initStatsPage();
  }catch(e){
    console.error(e);
    alert("Error cargando datos: " + (e?.message || JSON.stringify(e)));
  }
}
window.addEventListener("hashchange", onPageChange);
onPageChange();
