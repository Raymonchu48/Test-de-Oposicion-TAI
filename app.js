/* OpoStudy app.js (SPA + Supabase + Tests + Practicals + Temario + Stats + Coach)
   Requiere:
   - window.OPOSTUDY_CONFIG.SUPABASE_URL
   - window.OPOSTUDY_CONFIG.SUPABASE_ANON_KEY
*/

(function () {
  // Mermaid (opcional)
  if (window.mermaid) {
    try { mermaid.initialize({ startOnLoad: false, theme: "neutral" }); } catch {}
  }

  // Supabase
  const CFG = window.OPOSTUDY_CONFIG || {};
  if (!window.supabase || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
    console.warn("Supabase no configurado. Revisa config.js");
  }
  const sb = window.supabase
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
    : null;

  // Storage keys
  const STORAGE_KEY = "opostudy_stats_v2";
  const STORAGE_MISTAKES_KEY = "opostudy_mistakes_v1";
  const COACH_KEY = "opostudy_coach_chat_v1";
  const SYLLABUS_DONE_KEY = "opostudy_syllabus_done_v1";

  const MISTAKES_LOOKBACK_DAYS = 30;

  // UI refs (nav)
  const navBtns = document.querySelectorAll(".bottom-nav .nav-item");
  const screens = document.querySelectorAll(".screen");

  // Home CTA
  const btnGoTests = byId("btnGoTests");

  // Tests UI
  const modeSegment = byId("modeSegment");
  const blockSelect = byId("blockSelect");
  const countSelect = byId("countSelect");
  const timerToggle = byId("timerToggle");
  const startBtn = byId("startBtn");
  const blockHint = byId("blockHint");
  const practiceKindWrap = byId("practiceKindWrap");
  const practiceKindSegment = byId("practiceKindSegment");

  const btnGoTemario = byId("btnGoTemario");
  const btnGoStats = byId("btnGoStats");
  const btnGoExam = byId("btnGoExam");

  // KPIs
  const kpiAnswered = byId("kpiAnswered");
  const kpiAccuracy = byId("kpiAccuracy");
  const kpiStreak = byId("kpiStreak");
  const kpiMistakes = byId("kpiMistakes");

  // Plan
  const planDaily = byId("planDaily");
  const planReco = byId("planReco");

  // Temario
  const syllabusBlockSelect = byId("syllabusBlockSelect");
  const syllabusSearch = byId("syllabusSearch");
  const syllabusList = byId("syllabusList");
  const syllabusProgress = byId("syllabusProgress");

  // Stats screen
  const stTotalAnswered = byId("stTotalAnswered");
  const stAccuracy = byId("stAccuracy");
  const stStreak = byId("stStreak");
  const stPendingMistakes = byId("stPendingMistakes");
  const blockStats = byId("blockStats");
  const btnResetStats = byId("btnResetStats");
  const btnResetMistakes = byId("btnResetMistakes");

  // Simulacro
  const btnStartSimulacro = byId("btnStartSimulacro");

  // Coach
  const coachLog = byId("coachLog");
  const coachInput = byId("coachInput");
  const coachSend = byId("coachSend");
  const coachClear = byId("coachClear");

  // Install PWA
  const btnInstall = byId("btnInstall");
  let deferredPrompt = null;

  // App state
  const state = {
    screen: "home",

    // tests
    mode: "exam", // exam | full | practice | mistakes | simulacro
    practiceKind: "practical", // practical | test
    block: null,
    count: 15,
    timerEnabled: true,

    // runtime quiz
    questions: [],
    index: 0,
    selected: null,
    answers: [],
    timer: null,
    timeElapsed: 0,

    // timer advanced
    timerMode: "up", // up | down
    timerTotal: 0,   // seconds, when down

    stats: loadStats(),
  };

  // Init
  initNav();
  initTestsUI();
  initCoach();
  initInstall();
  renderKpis();
  renderPlan();
  initTemario();
  initStatsScreen();
  initSimulacro();

  // Default screen restore
  showScreen(localStorage.getItem("opostudy_last_screen") || "home", true);

  // -------------------------------
  // NAV
  // -------------------------------
  function initNav() {
    navBtns.forEach((b) => {
      b.addEventListener("click", () => showScreen(b.dataset.screen));
    });

    if (btnGoTests) btnGoTests.addEventListener("click", () => showScreen("tests"));
    if (btnGoTemario) btnGoTemario.addEventListener("click", () => showScreen("temario"));
    if (btnGoStats) btnGoStats.addEventListener("click", () => showScreen("stats"));
    if (btnGoExam) btnGoExam.addEventListener("click", () => showScreen("exam"));
  }

  function showScreen(name, silent = false) {
    state.screen = name;

    screens.forEach((s) => s.classList.remove("is-active"));
    const target = byId(`screen-${name}`);
    if (target) target.classList.add("is-active");

    navBtns.forEach((b) => b.classList.toggle("active", b.dataset.screen === name));

    localStorage.setItem("opostudy_last_screen", name);

    if (!silent) {
      if (name === "stats") renderStatsScreen();
      if (name === "temario") refreshTemario();
      renderKpis();
      renderPlan();
    }
  }
  window.showScreen = showScreen;

  // -------------------------------
  // TESTS UI
  // -------------------------------
  function initTestsUI() {
    state.count = Number(countSelect?.value || 15);
    state.timerEnabled = !!timerToggle?.checked;

    if (modeSegment) {
      modeSegment.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-mode]");
        if (!btn) return;
        setMode(btn.dataset.mode);
      });
    }

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

    if (blockSelect) {
      blockSelect.addEventListener("change", () => {
        state.block = blockSelect.value ? Number(blockSelect.value) : null;
        syncStartEnabled();
      });
    }

    if (countSelect) {
      countSelect.addEventListener("change", () => {
        state.count = Number(countSelect.value);
      });
    }

    if (timerToggle) {
      timerToggle.addEventListener("change", () => {
        state.timerEnabled = !!timerToggle.checked;
      });
    }

    if (startBtn) {
      startBtn.addEventListener("click", () => startTest());
    }

    setMode("exam", { silent: true });
    syncStartEnabled();
  }

  function setMode(mode, opts = {}) {
    state.mode = mode;

    // Active state only in modeSegment
    document.querySelectorAll("#modeSegment .segmented__btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.mode === mode);
    });

    // practice submode
    if (practiceKindWrap) {
      practiceKindWrap.style.display = (mode === "practice") ? "block" : "none";
    }

    // hint default
    if (blockHint) {
      blockHint.textContent = "En modo “Completo” no hace falta elegir bloque.";
    }

    // rules
    if (mode === "full") {
      if (blockSelect) blockSelect.value = "";
      state.block = null;
      if (blockSelect) blockSelect.disabled = true;
      if (blockHint) blockHint.style.display = "block";
    } else if (mode === "mistakes") {
      if (blockSelect) blockSelect.disabled = false;
      if (blockHint) {
        blockHint.style.display = "block";
        blockHint.textContent = `Se usarán tus fallos guardados (últimos ${MISTAKES_LOOKBACK_DAYS} días). El bloque es opcional y sirve como filtro.`;
      }
    } else {
      if (blockSelect) blockSelect.disabled = false;
      if (blockHint) blockHint.style.display = "none";
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

    if (state.mode === "full") {
      ok = true;
    } else if (state.mode === "mistakes") {
      const blockFilter = state.block ? Number(state.block) : null;
      ok = getPendingMistakesCount(blockFilter) > 0;
    } else {
      ok = !!state.block;
    }

    startBtn.disabled = !ok;
  }

  // -------------------------------
  // TEST ENGINE (questions + practicals)
  // -------------------------------
  async function startTest() {
    try {
      if (!sb) {
        alert("Supabase no está configurado. Revisa config.js");
        return;
      }

      // practice -> practical
      if (state.mode === "practice" && state.practiceKind === "practical") {
        await startPractical();
        return;
      }

      let data = [];
      state.timerMode = "up";
      state.timerTotal = 0;

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
      alert("Error: " + (e?.message || JSON.stringify(e)));
    }
  }

  async function startPractical() {
    if (!sb) return;

    if (!state.block) {
      alert("Selecciona un bloque para ver el trabajo práctico.");
      return;
    }

    const { data, error } = await sb.rpc("get_random_practicals", {
      p_count: 1,
      p_block: Number(state.block),
      p_topic: null,
    });

    if (error) throw error;
    if (!data || !data.length) {
      alert("No hay prácticos cargados para ese bloque todavía.");
      return;
    }

    openModal();
    renderPractical(data[0]);
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

  async function fetchMistakeQuestions() {
    const blockFilter = state.block ? Number(state.block) : null;
    const ids = getPendingMistakeIds({ block: blockFilter });

    if (!ids.length) return [];

    const take = Math.min(Number(state.count), ids.length);
    const chosenIds = shuffleArray(ids).slice(0, take);

    const { data, error } = await sb
      .from("questions")
      .select("*")
      .in("id", chosenIds);

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

  // -------------------------------
  // MODAL UI (quiz)
  // -------------------------------
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
  }

  function closeModal() {
    stopTimer();
    if (!modalEl) return;
    modalEl.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    // restore nav buttons (in case practical hid them)
    const prev = modalEl.querySelector("#quizPrev");
    const next = modalEl.querySelector("#quizNext");
    if (prev) prev.style.display = "";
    if (next) next.style.display = "";
  }

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

    const correctionNow =
      (state.mode === "practice" && state.practiceKind === "test");

    if (correctionNow) {
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

    updateStatsOnAnswer(isCorrect, q.block);

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

    const bodyEl = modalEl.querySelector("#quizBody");
    bodyEl.style.display = "none";

    const resultsEl = modalEl.querySelector("#quizResults");
    resultsEl.style.display = "block";

    const timeText = formatTimerDisplay();

    resultsEl.innerHTML = `
      <div class="res">
        <div class="res__score">${pct}%</div>
        <div class="res__line">
          Correctas: <strong>${correct}</strong> · Incorrectas: <strong>${total - correct}</strong> · Tiempo: <strong>${timeText}</strong>
        </div>
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
    renderPlan();
  }

  function startTimerIfNeeded() {
    stopTimer();
    modalEl.querySelector("#quizTimer").textContent = "00:00";

    if (!state.timerEnabled) return;

    state.timer = setInterval(() => {
      state.timeElapsed++;

      if (state.timerMode === "down") {
        const remaining = Math.max(state.timerTotal - state.timeElapsed, 0);
        modalEl.querySelector("#quizTimer").textContent = formatMMSS(remaining);

        if (remaining === 0) {
          stopTimer();
          finishTest();
        }
      } else {
        modalEl.querySelector("#quizTimer").textContent = formatMMSS(state.timeElapsed);
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function formatMMSS(sec) {
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function formatTimerDisplay() {
    if (state.timerMode === "down") {
      const remaining = Math.max(state.timerTotal - state.timeElapsed, 0);
      const spent = state.timerTotal - remaining;
      return formatMMSS(spent);
    }
    return formatMMSS(state.timeElapsed);
  }

  // -------------------------------
  // PRACTICAL VIEW (modal)
  // -------------------------------
  const PRACTICALS_STORE = "opostudy_practicals_progress_v1";

  function loadPracticalProgress() {
    try { return JSON.parse(localStorage.getItem(PRACTICALS_STORE) || "{}"); }
    catch { return {}; }
  }

  function savePracticalProgress(id, answer) {
    const store = loadPracticalProgress();
    store[id] = { answer, updated_at: new Date().toISOString() };
    localStorage.setItem(PRACTICALS_STORE, JSON.stringify(store));
  }

  function renderPractical(p) {
    const bodyEl = modalEl.querySelector("#quizBody");
    const resultsEl = modalEl.querySelector("#quizResults");
    resultsEl.style.display = "none";
    bodyEl.style.display = "block";

    modalEl.querySelector("#quizSub").textContent =
      `Trabajo práctico · Bloque ${p.block} · Tema ${p.topic} · Tipo: ${p.type}`;

    const qEl = modalEl.querySelector("#quizQuestion");
    qEl.textContent = p.title;

    const optsEl = modalEl.querySelector("#quizOptions");
    const saved = loadPracticalProgress()[p.id]?.answer || "";

    // mermaid render block if exists
    let mermaidHtml = "";
    if (p.mermaid) {
      mermaidHtml = `<div class="practical__mermaid"><div class="mermaid" id="mermaidBox">${escapeHtml(p.mermaid)}</div></div>`;
    }

    optsEl.innerHTML = `
      <div class="practical">
        <div class="practical__prompt"><strong>Enunciado</strong><br>${escapeHtml(p.prompt).replaceAll("\n","<br>")}</div>
        <div class="practical__deliverable"><strong>Entrega</strong><br>${escapeHtml(p.deliverable || "No especificada.").replaceAll("\n","<br>")}</div>
        ${mermaidHtml}

        <label class="label" style="margin-top:14px;">Tu respuesta</label>
        <textarea id="practicalAnswer" class="textarea" rows="8" placeholder="Escribe aquí tu solución...">${escapeHtml(saved)}</textarea>

        <div class="practical__actions">
          <button class="btn btn--ghost" id="savePractical" type="button">Guardar</button>
          <button class="btn btn--primary" id="showSolution" type="button">Ver guía</button>
        </div>

        <div id="solutionBox" class="practical__solution" style="display:none;"></div>
      </div>
    `;

    // Hide quiz nav
    modalEl.querySelector("#quizPrev").style.display = "none";
    modalEl.querySelector("#quizNext").style.display = "none";
    modalEl.querySelector("#quizBarFill").style.width = "0%";
    stopTimer();
    modalEl.querySelector("#quizTimer").textContent = "00:00";

    optsEl.querySelector("#savePractical").onclick = () => {
      const txt = optsEl.querySelector("#practicalAnswer").value || "";
      savePracticalProgress(p.id, txt);
      alert("Guardado.");
    };

    optsEl.querySelector("#showSolution").onclick = () => {
      const box = optsEl.querySelector("#solutionBox");
      box.style.display = "block";
      box.innerHTML =
        `<strong>Solución / guía</strong><br>${escapeHtml(p.solution || "Sin guía todavía.").replaceAll("\n","<br>")}`;
    };

    // Mermaid render (safe)
    if (p.mermaid && window.mermaid) {
      try {
        // Re-render all mermaid blocks inside modal
        window.mermaid.run({ querySelector: ".mermaid" });
      } catch {}
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

  // -------------------------------
  // STATS (local)
  // -------------------------------
  function loadStats() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeEmptyStats();
    try {
      const s = JSON.parse(raw);
      return migrateStats(s);
    } catch {
      return makeEmptyStats();
    }
  }

  function makeEmptyStats() {
    return {
      totalAnswered: 0,
      totalCorrect: 0,
      streakDays: 0,
      lastStudyDate: null, // YYYY-MM-DD
      byBlock: {
        "1": { a: 0, c: 0 },
        "2": { a: 0, c: 0 },
        "3": { a: 0, c: 0 },
        "4": { a: 0, c: 0 },
      },
    };
  }

  function migrateStats(s) {
    // v1 compatibility
    if (!s.byBlock) {
      s.byBlock = {
        "1": { a: 0, c: 0 },
        "2": { a: 0, c: 0 },
        "3": { a: 0, c: 0 },
        "4": { a: 0, c: 0 },
      };
    }
    // ensure fields
    if (typeof s.totalAnswered !== "number") s.totalAnswered = 0;
    if (typeof s.totalCorrect !== "number") s.totalCorrect = 0;
    if (typeof s.streakDays !== "number") s.streakDays = 0;
    if (!("lastStudyDate" in s)) s.lastStudyDate = null;

    ["1","2","3","4"].forEach(k=>{
      if (!s.byBlock[k]) s.byBlock[k] = { a:0, c:0 };
      if (typeof s.byBlock[k].a !== "number") s.byBlock[k].a = 0;
      if (typeof s.byBlock[k].c !== "number") s.byBlock[k].c = 0;
    });

    return s;
  }

  function saveStats() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stats));
  }

  function updateStatsOnAnswer(isCorrect, block) {
    state.stats.totalAnswered++;
    if (isCorrect) state.stats.totalCorrect++;

    const b = String(block || "");
    if (state.stats.byBlock[b]) {
      state.stats.byBlock[b].a++;
      if (isCorrect) state.stats.byBlock[b].c++;
    }

    // streak
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

    renderKpis();
    renderPlan();
  }

  function renderKpis() {
    if (!kpiAnswered) return;

    kpiAnswered.textContent = String(state.stats.totalAnswered);
    const acc = state.stats.totalAnswered
      ? Math.round((state.stats.totalCorrect / state.stats.totalAnswered) * 100)
      : 0;
    kpiAccuracy.textContent = `${acc}%`;
    kpiStreak.textContent = String(state.stats.streakDays);
    kpiMistakes.textContent = String(getPendingMistakesCount(null));

    // also update stats screen if visible
    if (stTotalAnswered) stTotalAnswered.textContent = String(state.stats.totalAnswered);
    if (stAccuracy) stAccuracy.textContent = `${acc}%`;
    if (stStreak) stStreak.textContent = String(state.stats.streakDays);
    if (stPendingMistakes) stPendingMistakes.textContent = String(getPendingMistakesCount(null));
  }

  function renderPlan() {
    if (planDaily) planDaily.textContent = "15 preguntas";
    if (!planReco) return;

    const pending = getPendingMistakesCount(null);
    if (pending > 0) planReco.textContent = "Repaso de fallos";
    else planReco.textContent = "Examen con corrección";
  }

  // -------------------------------
  // MISTAKES (local)
  // -------------------------------
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
    renderKpis();
  }

  function resolveMistake(questionId) {
    const list = loadMistakes();
    const now = new Date().toISOString();
    const idx = list.findIndex(m => m.id === questionId && !m.resolved_at);
    if (idx >= 0) {
      list[idx].resolved_at = now;
      saveMistakes(list);
      renderKpis();
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

  // -------------------------------
  // TEMARIO (Supabase + local done)
  // -------------------------------
  function initTemario() {
    if (!syllabusList) return;

    if (syllabusBlockSelect) syllabusBlockSelect.addEventListener("change", refreshTemario);
    if (syllabusSearch) syllabusSearch.addEventListener("input", debounce(refreshTemario, 250));

    // initial load when opening screen
  }

  async function refreshTemario() {
    if (!syllabusList) return;

    if (!sb) {
      syllabusList.innerHTML = `<div class="hint">Supabase no configurado. Revisa config.js</div>`;
      return;
    }

    const block = Number(syllabusBlockSelect?.value || 0);
    const q = (syllabusSearch?.value || "").trim().toLowerCase();

    syllabusList.innerHTML = `<div class="hint">Cargando temario...</div>`;

    let query = sb.from("syllabus_items").select("*").order("block", { ascending: true }).order("topic", { ascending: true }).order("order_in_topic", { ascending: true });

    if (block && block > 0) query = query.eq("block", block);

    const { data, error } = await query;
    if (error) {
      syllabusList.innerHTML = `<div class="hint">Error cargando temario: ${escapeHtml(error.message)}</div>`;
      return;
    }

    let items = data || [];
    if (q) {
      items = items.filter(it =>
        String(it.title || "").toLowerCase().includes(q) ||
        String(it.description || "").toLowerCase().includes(q)
      );
    }

    renderTemario(items);
  }

  function renderTemario(items) {
    const done = loadSyllabusDone();
    const total = items.length;
    const doneCount = items.filter(it => !!done[it.id]).length;
    const pct = total ? Math.round((doneCount / total) * 100) : 0;
    if (syllabusProgress) syllabusProgress.textContent = `${pct}% completado`;

    if (!items.length) {
      syllabusList.innerHTML = `<div class="hint">No hay items para ese filtro.</div>`;
      return;
    }

    const grouped = groupBy(items, it => `B${it.block} · Tema ${it.topic}`);
    const html = [];

    Object.keys(grouped).forEach(key => {
      html.push(`<div class="temario-group"><div class="temario-group__title">${escapeHtml(key)}</div>`);
      grouped[key].forEach(it => {
        const checked = done[it.id] ? "checked" : "";
        html.push(`
          <label class="temario-item">
            <input class="temario-item__chk" type="checkbox" data-syllabus-id="${escapeHtml(it.id)}" ${checked} />
            <div class="temario-item__body">
              <div class="temario-item__title">${escapeHtml(it.title || "")}</div>
              <div class="temario-item__desc">${escapeHtml(it.description || "")}</div>
            </div>
          </label>
        `);
      });
      html.push(`</div>`);
    });

    syllabusList.innerHTML = html.join("");

    syllabusList.querySelectorAll("input[data-syllabus-id]").forEach(chk => {
      chk.addEventListener("change", () => {
        const id = chk.getAttribute("data-syllabus-id");
        const map = loadSyllabusDone();
        if (chk.checked) map[id] = new Date().toISOString();
        else delete map[id];
        localStorage.setItem(SYLLABUS_DONE_KEY, JSON.stringify(map));
        refreshTemario();
      });
    });
  }

  function loadSyllabusDone() {
    try { return JSON.parse(localStorage.getItem(SYLLABUS_DONE_KEY) || "{}"); }
    catch { return {}; }
  }

  function groupBy(arr, fnKey) {
    return arr.reduce((acc, x) => {
      const k = fnKey(x);
      (acc[k] = acc[k] || []).push(x);
      return acc;
    }, {});
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // -------------------------------
  // STATS SCREEN
  // -------------------------------
  function initStatsScreen() {
    if (btnResetStats) {
      btnResetStats.addEventListener("click", () => {
        if (!confirm("¿Reset stats locales?")) return;
        state.stats = makeEmptyStats();
        saveStats();
        renderKpis();
        renderStatsScreen();
      });
    }
    if (btnResetMistakes) {
      btnResetMistakes.addEventListener("click", () => {
        if (!confirm("¿Reset fallos locales?")) return;
        localStorage.removeItem(STORAGE_MISTAKES_KEY);
        renderKpis();
        renderStatsScreen();
      });
    }
  }

  function renderStatsScreen() {
    renderKpis();

    if (!blockStats) return;

    const rows = ["1","2","3","4"].map(b => {
      const a = state.stats.byBlock[b]?.a || 0;
      const c = state.stats.byBlock[b]?.c || 0;
      const pct = a ? Math.round((c / a) * 100) : 0;
      return { b, a, c, pct };
    });

    blockStats.innerHTML = rows.map(r => `
      <div class="blockRow">
        <div class="blockRow__left">Bloque ${r.b}</div>
        <div class="blockRow__mid">${r.c}/${r.a}</div>
        <div class="blockRow__right">${r.pct}%</div>
      </div>
    `).join("");
  }

  // -------------------------------
  // SIMULACRO
  // -------------------------------
  function initSimulacro() {
    if (!btnStartSimulacro) return;

    btnStartSimulacro.addEventListener("click", async () => {
      if (!sb) {
        alert("Supabase no configurado. Revisa config.js");
        return;
      }

      try {
        state.mode = "simulacro";
        state.practiceKind = "test";
        state.block = null;
        state.count = 60;
        state.timerEnabled = true;

        const data = await fetchQuestions({
          mode: "full",
          block: null,
          count: 60,
        });

        if (!data.length) {
          alert("No hay preguntas suficientes para el simulacro.");
          return;
        }

        state.questions = data;
        state.index = 0;
        state.selected = null;
        state.answers = [];
        state.timeElapsed = 0;

        state.timerMode = "down";
        state.timerTotal = 60 * 60;

        openModal();
        renderQuestion();
        startTimerIfNeeded();
      } catch (e) {
        console.error(e);
        alert("Error simulacro: " + (e?.message || JSON.stringify(e)));
      }
    });
  }

  // -------------------------------
  // COACH (local)
  // -------------------------------
  function initCoach() {
    if (!coachLog) return;

    const history = loadCoach();
    if (history.length === 0) {
      pushCoach("bot", "Soy tu Coach TAI. Escribe “fallos”, “plan”, “bloque 2” o “tiempo”.");
    } else {
      renderCoach(history);
    }

    if (coachSend) coachSend.addEventListener("click", onCoachSend);
    if (coachInput) {
      coachInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") onCoachSend();
      });
    }
    if (coachClear) coachClear.addEventListener("click", () => {
      localStorage.removeItem(COACH_KEY);
      coachLog.innerHTML = "";
      pushCoach("bot", "Chat limpiado. Escribe “fallos”, “plan”, “bloque 2” o “tiempo”.");
    });
  }

  function onCoachSend() {
    const txt = (coachInput?.value || "").trim();
    if (!txt) return;

    pushCoach("me", txt);
    if (coachInput) coachInput.value = "";

    const t = txt.toLowerCase();
    if (t.includes("fallo")) {
      const pending = getPendingMistakesCount(null);
      pushCoach("bot", `Tienes ${pending} fallos pendientes. Ve a “Tests” y usa “Repaso de fallos” para limpiar deuda técnica.`);
      return;
    }
    if (t.includes("plan")) {
      const pending = getPendingMistakesCount(null);
      const rec = pending > 0
        ? "Hoy: 15 preguntas + 10 min repaso de fallos. Prioriza precisión."
        : "Hoy: 15 preguntas modo Examen + 1 práctico del bloque más débil.";
      pushCoach("bot", rec);
      return;
    }
    if (t.includes("bloque")) {
      const m = t.match(/bloque\s*([1-4])/);
      if (m) {
        pushCoach("bot", `Enfoque Bloque ${m[1]}: haz 15 preguntas en Examen y luego 1 práctico (Práctica → Trabajo práctico).`);
      } else {
        pushCoach("bot", "Dime el bloque exacto: “bloque 1”, “bloque 2”, “bloque 3” o “bloque 4”.");
      }
      return;
    }
    if (t.includes("tiempo")) {
      pushCoach("bot", "Ritmo recomendado: 60 preguntas/60 min. Si fallas, marca el fallo y repásalo en 24–48h.");
      return;
    }

    pushCoach("bot", "Entendido. Prueba con: “fallos”, “plan”, “bloque 2” o “tiempo”.");
  }

  function loadCoach() {
    try { return JSON.parse(localStorage.getItem(COACH_KEY) || "[]"); }
    catch { return []; }
  }

  function saveCoach(list) {
    localStorage.setItem(COACH_KEY, JSON.stringify(list));
  }

  function pushCoach(who, text) {
    const list = loadCoach();
    list.push({ who, text, ts: new Date().toISOString() });
    saveCoach(list);
    renderCoach(list);
  }

  function renderCoach(list) {
    coachLog.innerHTML = list.map(m => `
      <div class="coach__msg ${m.who === "me" ? "coach__msg--me" : "coach__msg--bot"}">
        <div class="coach__bubble">${escapeHtml(m.text)}</div>
      </div>
    `).join("");
    coachLog.scrollTop = coachLog.scrollHeight;
  }

  // -------------------------------
  // INSTALL (PWA)
  // -------------------------------
  function initInstall() {
    if (!btnInstall) return;

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      btnInstall.hidden = false;
    });

    btnInstall.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      btnInstall.hidden = true;
    });
  }

  // -------------------------------
  // Helpers
  // -------------------------------
  function byId(id) { return document.getElementById(id); }
})();
