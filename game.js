import { PROFILES_KEY, loadProfiles, storeProfile, newStudent } from "./profiles.js";
import { exportProgressCSV, importProgressCSV } from "./progress-csv.js";
import {
  FACTS,
  TABLES,
  ROUND_LENGTH,
  STORAGE_KEY,
  freshProgress,
  status,
  hint,
  Mission,
} from "./engine.js";

export function mountGame(root) {
  const $ = (id) => root.querySelector("#" + id);
  const listeners = [];
  const on = (el, event, fn) => {
    el.addEventListener(event, fn);
    listeners.push(() => el.removeEventListener(event, fn));
  };
  let data = freshProgress(),
    mission = null,
    page = "play",
    frame = null,
    soundContext = null,
    stale = false;
  let roster = loadProfiles(null, null);
  try {
    roster = loadProfiles(localStorage.getItem(PROFILES_KEY), localStorage.getItem(STORAGE_KEY));
    data = roster.profiles.find(p => p.id === roster.active).progress;
  } catch {
    stale = true;
    warning(
      "Saved profiles could not be loaded. Existing data has not been overwritten. Reload before continuing; do not clear browser storage.",
    );
  }
  function warning(text) {
    $("storage-warning").hidden = false;
    $("storage-warning").textContent = text;
  }
  function save() {
    if (stale) return;
    try {
      roster = storeProfile(localStorage, roster, data, roster.active);
    } catch {
      warning(
        "Your browser is not saving progress. You can still play, but this session’s progress may disappear when you leave.",
      );
    }
  }
  function sound(correct) {
    if (!data.settings.sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      soundContext ||= new AudioContext();
      soundContext.resume().catch(() => {});
      const start = soundContext.currentTime;
      (correct ? [523.25, 659.25, 783.99] : [329.63, 293.66]).forEach((frequency, i) => {
        const oscillator = soundContext.createOscillator(),
          gain = soundContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start + i * 0.07);
        gain.gain.linearRampToValueAtTime(0.055, start + i * 0.07 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + i * 0.07 + 0.18);
        oscillator.connect(gain);
        gain.connect(soundContext.destination);
        oscillator.start(start + i * 0.07);
        oscillator.stop(start + i * 0.07 + 0.2);
      });
    } catch {
      /* Sound is optional; gameplay always remains available. */
    }
  }
  function stopClock() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }
  function tick() {
    stopClock();
    if (
      !mission ||
      mission.stage !== "answer" ||
      mission.settings.mode !== "sprint" ||
      page !== "play"
    )
      return;
    const left = Math.max(0, mission.settings.goal - mission.elapsedMs());
    $("pace").max = mission.settings.goal;
    $("pace").value = left;
    $("pace-label").textContent = mission.wasPaused
      ? "No rush"
      : left
        ? `${(left / 1000).toFixed(1)}s`
        : "No rush";
    if (left) frame = requestAnimationFrame(tick);
  }
  function showScreen(name) {
    for (const n of ["ready", "question", "pause", "results"]) $(n + "-screen").hidden = n !== name;
  }
  function updateStats() {
    $("total-xp").textContent = data.xp.toLocaleString();
    const level = Math.floor(data.xp / 500) + 1;
    $("level-label").textContent =
      `Level ${level} · ${level < 4 ? "Fact explorer" : level < 10 ? "Pattern finder" : "Recall adventurer"}`;
    $("round-xp").textContent = (mission?.xp || 0).toLocaleString();
    $("streak").textContent = mission?.streak || 0;
    $("best-streak").textContent = mission?.best || 0;
    $("energy-fill").style.width = `${((mission?.history.length || 0) / ROUND_LENGTH) * 100}%`;
    const secure = FACTS.filter((f) => status(data.facts[f.key]) === "secure").length;
    $("secure-count").textContent = `${secure} / 66`;
    const featured = [
      [2, 2],
      [2, 5],
      [2, 10],
      [5, 5],
      [5, 10],
      [6, 7],
      [7, 8],
      [10, 10],
    ];
    $("collection-preview").innerHTML = featured
      .map(
        ([a, b]) =>
          `<div class="${status(data.facts[`${a}x${b}`])}" title="${a} × ${b}">${a}×${b}</div>`,
      )
      .join("");
    $("lifetime-summary").textContent =
      `${data.missions} missions finished · ${Object.values(data.facts).reduce((n, r) => n + r.attempts, 0)} first attempts · ${secure} facts feeling fluent.`;
    if (page === "facts") renderFacts();
  }
  function setup() {
    renderStudents();
    $("student-name").value = data.student;
    $("active-student").textContent = `Current student: ${data.student || "Unnamed student"}`;
    root.querySelectorAll("[data-mode]").forEach((b) => {
      const selected = b.dataset.mode === data.settings.mode;
      b.classList.toggle("selected", selected);
      b.setAttribute("aria-pressed", String(selected));
    });
    $("sprint-settings").hidden = data.settings.mode !== "sprint";
    $("speed-goal").value = String(data.settings.goal);
    $("table-picker").innerHTML = TABLES.map(
      (t) =>
        `<button type="button" data-table="${t}" aria-label="${t} times table" aria-pressed="${data.settings.tables.includes(t)}">${t}</button>`,
    ).join("");
    $("all-tables").textContent =
      data.settings.tables.length === 11 ? "Use starter set" : "Select all";
    $("round-label").textContent =
      data.settings.mode === "sprint" ? "12 facts · speed bonuses" : "12 facts · your pace";
    $("sound").setAttribute("aria-pressed", String(data.settings.sound));
    $("sound").innerHTML = `♪ <span>Sound ${data.settings.sound ? "on" : "off"}</span>`;
  }
  function focusAnswer() {
    (mission?.stage === "feedback"
      ? $("next")
      : mission?.settings.mode === "choice" && mission?.stage === "answer"
        ? $("choices").querySelector("button")
        : $("answer")
    )?.focus({ preventScroll: true });
  }
  function start() {
    if (stale || (mission && !mission.finished)) return;
    stopClock();
    mission = new Mission(data);
    save();
    $("setup").hidden = true;
    $("mission-label").textContent =
      `${data.settings.mode === "sprint" ? "SPRINT" : data.settings.mode === "choice" ? "CHOOSE" : "RECALL"} MISSION`;
    $("arena-status").textContent = "One fact at a time. You’ve got this.";
    showScreen("question");
    renderQuestion();
    updateStats();
    $("equation").scrollIntoView({ block: "nearest", behavior: "auto" });
  }
  function renderQuestion() {
    const q = mission.question;
    $("round-label").textContent = `Fact ${mission.history.length + 1} of ${ROUND_LENGTH}`;
    $("mission-progress").innerHTML = Array.from(
      { length: ROUND_LENGTH },
      (_, i) =>
        `<span class="${i < mission.history.length ? (mission.history[i].correct ? "right" : "wrong") : i === mission.history.length ? "current" : ""}"></span>`,
    ).join("");
    $("mission-progress").setAttribute(
      "aria-label",
      `${mission.history.length} of ${ROUND_LENGTH} facts answered`,
    );
    $("question-kind").textContent = q.review
      ? "ANOTHER CHANCE TO MAKE IT STICK"
      : mission.settings.mode === "choice"
        ? "CHOOSE THE PRODUCT"
        : "RECALL PRACTICE";
    $("equation").innerHTML = `${q.a} <em>×</em> ${q.b} <small>=</small> <b>?</b>`;
    $("equation").setAttribute("aria-label", `${q.a} times ${q.b} equals what?`);
    $("answer").value = "";
    $("answer").disabled = false;
    $("check").disabled = true;
    $("answer-form").hidden = mission.settings.mode === "choice";
    $("choices").hidden = mission.settings.mode !== "choice";
    $("choices").innerHTML = q.options
      .map(
        (n, i) =>
          `<button type="button" data-answer="${n}" aria-label="Answer ${n}, shortcut ${i + 1}"><small aria-hidden="true">${i + 1}</small>${n}</button>`,
      )
      .join("");
    $("feedback").textContent = "";
    $("feedback").className = "feedback";
    $("next").hidden = true;
    $("keyboard-tip").textContent =
      mission.settings.mode === "choice"
        ? "Choose an answer or press 1–4"
        : "Type your answer and press Enter";
    $("pace-row").hidden = mission.settings.mode !== "sprint";
    focusAnswer();
    tick();
  }
  function submit(value) {
    if (page !== "play") return;
    const result = mission?.submit(value);
    if (!result) return;
    stopClock();
    sound(result.correct);
    save();
    updateStats();
    const q = mission.question;
    if (result.guided) {
      if (result.correct) {
        $("feedback").className = "feedback correct";
        $("feedback").innerHTML =
          `<strong>You’ve got it: ${q.a} × ${q.b} = ${q.answer}.</strong><span class="hint">Let’s give that fact a little time to stick.</span>`;
        showNext();
      } else {
        $("feedback").innerHTML =
          `<strong>Type ${q.answer} to practice the correct answer.</strong><span class="hint">${hint(q.a, q.b)}</span>`;
        $("answer").value = "";
        $("check").disabled = true;
        $("answer").focus();
      }
      return;
    }
    $("choices")
      .querySelectorAll("button")
      .forEach((b) => {
        b.disabled = true;
        b.classList.toggle("correct", Number(b.dataset.answer) === q.answer);
        b.classList.toggle("wrong", Number(b.dataset.answer) === value && !result.correct);
      });
    $("feedback").className = `feedback ${result.correct ? "correct" : "wrong"}`;
    if (result.correct) {
      $("feedback").innerHTML =
        `<strong>${result.streakBonus ? "Streak bonus. Keep it popping!" : mission.settings.mode === "choice" ? "That’s the one. Nice work!" : "That’s it. Nice recall!"} +${result.earned} XP</strong><span class="hint">${q.a} × ${q.b} = ${q.answer}${result.speed ? " · Speed bonus earned" : ""}</span>`;
      $("equation").classList.remove("pop");
      void $("equation").offsetWidth;
      $("equation").classList.add("pop");
      showNext();
    } else {
      $("pace-row").hidden = true;
      $("question-kind").textContent = "LET’S LEARN THIS ONE";
      $("feedback").innerHTML =
        `<strong>${q.a} × ${q.b} = ${q.answer}. Let’s try that together.</strong><span class="hint">${hint(q.a, q.b)} Type ${q.answer} below the question. +20 XP for trying.</span>`;
      $("answer-form").hidden = false;
      $("choices").hidden = true;
      $("answer").value = "";
      $("check").disabled = true;
      $("keyboard-tip").textContent = "Guided retry · This won’t count as an unassisted answer";
      $("answer").focus({ preventScroll: true });
    }
  }
  function showNext() {
    $("answer").disabled = true;
    $("check").disabled = true;
    $("next").hidden = false;
    $("next").textContent =
      mission.history.length === ROUND_LENGTH ? "See my mission →" : "Next fact →";
    $("keyboard-tip").textContent = "Press Enter to continue";
    $("next").focus({ preventScroll: true });
  }
  function next() {
    if (mission?.stage !== "feedback") return;
    mission.next();
    if (mission.finished) finish();
    else renderQuestion();
  }
  function finish() {
    stopClock();
    mission.finish();
    save();
    updateStats();
    showScreen("results");
    const h = mission.history,
      correct = h.filter((r) => r.correct),
      times = correct
        .filter((r) => !r.paused)
        .map((r) => r.ms)
        .sort((a, b) => a - b);
    const median = times.length
      ? (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2
      : null;
    $("result-title").textContent = !h.length
      ? "A fresh start is waiting."
      : correct.length === h.length
        ? "A perfect little mission!"
        : "Look at you grow.";
    $("result-message").textContent = h.length
      ? `${correct.length} of ${h.length} right on the first try. ${correct.length === h.length ? "Enjoy the win, then take a break or play again." : "Every tricky fact is a chance to learn."}`
      : "No answers recorded. Come back when you’re ready.";
    $("result-stats").innerHTML =
      `<div><strong>+${mission.xp}</strong><span>XP collected</span></div><div><strong>${h.length ? Math.round((correct.length / h.length) * 100) + "%" : "—"}</strong><span>first-try accuracy</span></div><div><strong>${median !== null ? (median / 1000).toFixed(1) + "s" : "—"}</strong><span>${mission.settings.mode === "choice" ? "median choice time" : "median correct recall"}</span></div>`;
    const missed = [...new Map(h.filter((r) => !r.correct).map((r) => [r.key, r])).values()];
    $("review-facts").innerHTML = missed.length
      ? "<strong>A little more practice for these:</strong>" +
        missed.map((r) => `<span>${r.a} × ${r.b} = ${r.a * r.b}</span>`).join("")
      : "";
    $("round-label").textContent = `${h.length} facts practiced`;
    $("arena-status").textContent = "Your effort adds up.";
    $("replay").focus({ preventScroll: true });
  }
  function pause() {
    if (mission?.pause()) {
      stopClock();
      showScreen("pause");
      $("resume").focus({ preventScroll: true });
    }
  }
  function renderFacts() {
    $("fact-grid").innerHTML = FACTS.map((f) => {
      const s = status(data.facts[f.key]);
      return `<button class="fact-cell ${s}" data-fact="${f.key}" aria-label="${f.a} times ${f.b}, ${s === "secure" ? "feeling fluent" : s === "learning" ? "practicing" : "new"}">${f.a} × ${f.b}<span>${s === "secure" ? "✓ Fluent" : s === "learning" ? "Practicing" : "New"}</span></button>`;
    }).join("");
  }
  function navigate(destination) {
    if (destination !== "play" && mission && !mission.finished) pause();
    page = destination;
    for (const p of ["play", "facts", "guide"]) $(p + "-page").hidden = p !== page;
    root.querySelectorAll("nav [data-page]").forEach((b) => {
      const active = b.dataset.page === page;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    $("page-title").innerHTML =
      page === "facts"
        ? "Little facts. <span>Big progress.</span>"
        : page === "guide"
          ? "A little help. <span>A lot of growth.</span>"
          : "Ready, set, <span>multiply.</span>";
    updateStats();
    $("main").focus({ preventScroll: true });
  }
  on(root, "click", (event) => {
    const button = event.target.closest("button");
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.dataset.page) navigate(button.dataset.page);
    if (button.dataset.mode && (!mission || mission.finished)) {
      data.settings.mode = button.dataset.mode;
      setup();
      save();
    }
    if (button.dataset.table && (!mission || mission.finished)) {
      const t = Number(button.dataset.table),
        i = data.settings.tables.indexOf(t);
      if (i >= 0 && data.settings.tables.length === 1) {
        $("table-note").textContent = "Keep at least one table selected. You can add any others.";
        return;
      }
      if (i >= 0) data.settings.tables.splice(i, 1);
      else data.settings.tables.push(t);
      setup();
      save();
      $("table-picker").querySelector(`[data-table="${t}"]`).focus();
    }
    if (button.dataset.answer) submit(Number(button.dataset.answer));
    if (button.dataset.fact) {
      const f = FACTS.find((f) => f.key === button.dataset.fact),
        r = data.facts[f.key];
      $("fact-detail").textContent =
        `${f.a} × ${f.b} = ${f.answer}. ${r ? `${r.correct}/${r.attempts} first attempts correct; ${r.typedCorrect}/${r.typed} typed attempts correct. ${status(r) === "secure" ? "Feeling fluent — keep revisiting it." : "Keep practicing for confident recall."}` : "A new fact waiting to be explored."}`;
    }
  });
  on($("answer"), "input", () => {
    $("answer").value = $("answer")
      .value.replace(/[^0-9]/g, "")
      .slice(0, 3);
    $("check").disabled = !$("answer").value;
  });
  on($("answer-form"), "submit", (e) => {
    e.preventDefault();
    if (/^\d{1,3}$/.test($("answer").value)) submit(Number($("answer").value));
  });
  on($("start"), "click", start);
  on($("replay"), "click", start);
  on($("next"), "click", next);
  on($("change"), "click", () => {
    mission = null;
    showScreen("ready");
    $("setup").hidden = false;
    $("mission-label").textContent = "YOUR NEXT MISSION";
    setup();
    updateStats();
    $("start").focus();
  });
  on($("pause"), "click", pause);
  on($("resume"), "click", () => {
    if (mission?.resume()) {
      showScreen("question");
      focusAnswer();
      tick();
    }
  });
  on($("end"), "click", finish);
  on($("sound"), "click", () => {
    data.settings.sound = !data.settings.sound;
    $("sound").setAttribute("aria-pressed", String(data.settings.sound));
    $("sound").innerHTML = `♪ <span>Sound ${data.settings.sound ? "on" : "off"}</span>`;
    save();
    if (data.settings.sound) sound(true);
  });
  on($("speed-goal"), "change", () => {
    data.settings.goal = Number($("speed-goal").value);
    save();
  });
  on($("all-tables"), "click", () => {
    data.settings.tables = data.settings.tables.length === 11 ? [2, 5, 10] : [...TABLES];
    setup();
    save();
  });
  on(document, "visibilitychange", () => {
    if (document.hidden && page === "play") pause();
  });
  on(window, "keydown", (e) => {
    if (
      page !== "play" ||
      !mission ||
      mission.finished ||
      e.repeat ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return;
    if (e.key === "Escape" && mission.stage !== "paused") {
      e.preventDefault();
      pause();
      return;
    }
    if (
      mission.stage === "answer" &&
      mission.settings.mode === "choice" &&
      /^[1-4]$/.test(e.key) &&
      !["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)
    ) {
      e.preventDefault();
      submit(mission.question.options[Number(e.key) - 1]);
    }
  });
  on($("reset"), "click", () => {
    $("reset-confirm").hidden = false;
    $("reset-cancel").focus();
  });
  on($("reset-cancel"), "click", () => {
    $("reset-confirm").hidden = true;
    $("reset").focus();
  });
  on($("reset-yes"), "click", () => {
    const cleared = freshProgress();
    cleared.student = data.student;
    if (!switchStudent(roster.active, cleared)) return;
    $("reset-confirm").hidden = true;
    showScreen("ready");
    $("setup").hidden = false;
    $("mission-label").textContent = "YOUR NEXT MISSION";
    $("fact-detail").textContent = "Choose a fact below.";
    setup();
    updateStats();
    $("reset").focus();
  });
  let pendingProgress = null;
  function transferStatus(message) { $("transfer-status").textContent = message; }
  function downloadProgress() {
    const url = URL.createObjectURL(new Blob([exportProgressCSV(data)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    const name = (data.student || "student").replace(/[^a-z0-9_-]/gi, "-").slice(0, 60);
    a.download = "fact-pop-" + name + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  on($("student-name"), "input", () => {
    if (stale) return;
    data.student = $("student-name").value;
    $("active-student").textContent = "Current student: " + (data.student || "Unnamed student");
    save();
    renderStudents();
  });
  on($("export"), "click", downloadProgress);
  function previewImport(progress) {
    pendingProgress = progress;
    $("import-summary").textContent = "Switch to " + (progress.student || "a new unnamed student") + "? " + progress.xp + " XP · " + progress.missions + " missions · " + Object.keys(progress.facts).length + " facts practiced.";
    $("import-target").value = "new";
    $("import-confirm").hidden = false;
    $("import-backup").focus();
  }
  function renderStudents() {
    $("student-picker").replaceChildren(...roster.profiles.map(p => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.progress.student || "Unnamed student";
      option.selected = p.id === roster.active;
      return option;
    }));
  }
  function switchStudent(id, incoming) {
    if (stale) return false;
    try { roster = storeProfile(localStorage, roster, data, id, incoming); }
    catch { warning("Could not save student profiles. Nothing was switched. Download the current CSV and free browser storage before trying again."); return false; }
    stopClock();
    data = roster.profiles.find(p => p.id === roster.active).progress;
    mission = null;
    pendingProgress = null;
    $("import-confirm").hidden = true;
    $("reset-confirm").hidden = true;
    showScreen("ready");
    $("setup").hidden = false;
    $("mission-label").textContent = "YOUR NEXT MISSION";
    $("arena-status").textContent = "Made for your growing brain";
    $("fact-detail").textContent = "Choose a fact below.";
    setup(); updateStats();
    return true;
  }
  on($("student-picker"), "change", () => {
    switchStudent($("student-picker").value);
    renderStudents();
  });
  on($("add-student-form"), "submit", e => {
    e.preventDefault();
    try {
      const progress = newStudent($("new-student-name").value);
      if (switchStudent(crypto.randomUUID(), progress)) {
        $("new-student-name").value = "";
        $("profile-status").textContent = "Added " + progress.student + ". Ready to play!";
      }
    } catch (error) { $("profile-status").textContent = error.message; }
  });
  on($("new-student"), "click", () => { $("new-student-name").focus(); });
  on($("import-file"), "change", async () => {
    const file = $("import-file").files[0];
    $("import-file").value = "";
    pendingProgress = null;
    $("import-confirm").hidden = true;
    if (!file || stale) return;
    try {
      if (file.size > 1_000_000) throw Error("Choose a CSV smaller than 1 MB.");
      const progress = importProgressCSV(await file.text());
      if (stale) return;
      transferStatus("");
      previewImport(progress);
    } catch (error) { transferStatus("Nothing changed. " + error.message); }
  });
  on($("import-cancel"), "click", () => {
    pendingProgress = null;
    $("import-confirm").hidden = true;
    $("import-file").focus();
  });
  function applyImport(backup) {
    if (!pendingProgress || stale) return;
    if (backup) downloadProgress();
    const target = $("import-target").value === "new" ? crypto.randomUUID() : roster.active;
    if (!switchStudent(target, pendingProgress)) return;
    transferStatus("Ready for " + (data.student || "a new student") + ". Progress saved in this browser.");
    $("student-name").focus();
  }
  on($("import-backup"), "click", () => applyImport(true));
  on($("import-yes"), "click", () => applyImport(false));
  on(window, "storage", (e) => {
    if (e.key === PROFILES_KEY || e.key === STORAGE_KEY || e.key === null) {
      stale = true;
      warning(
        "Progress changed in another tab. Reload this page before playing again to keep your latest progress.",
      );
      pause();
      for (const id of ["start", "replay", "resume", "end", "reset-yes", "import-file", "import-yes", "import-backup", "new-student", "student-name", "export", "student-picker", "add-student", "new-student-name"]) $(id).disabled = true;
    }
  });
  setup();
  updateStats();
  if (stale) root.querySelectorAll("button, input, select").forEach(el => { el.disabled = true; });
  return () => {
    stopClock();
    listeners.forEach((off) => off());
    soundContext?.close().catch(() => {});
  };
}
