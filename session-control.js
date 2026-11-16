"use strict";

// Keep task time separate from the real monotonic clock used for acquisition
// synchronization. Only our task timers are suspended; browser/API timers are not.
class PausableClock {
  constructor(host = window, now = () => performance.now()) {
    this.host = host; this.wallNow = now; this.reset();
  }
  reset() {
    this.clearAll(); this.paused = false; this.stopped = false;
    this.totalPaused = 0; this.pauseStart = null; this.periods = [];
  }
  now() { return (this.paused ? this.pauseStart : this.wallNow()) - this.totalPaused; }
  schedule(fn, delay = 0, repeat = 0) {
    const token = { fn, due: this.now() + Math.max(0, delay), repeat, handle: null };
    if (this.stopped) return token;
    this.timers.add(token); this.arm(token); return token;
  }
  arm(token) {
    if (this.paused || this.stopped) return;
    token.handle = this.host.setTimeout(() => {
      if (this.paused || this.stopped || !this.timers.has(token)) return;
      if (!token.repeat) this.timers.delete(token);
      token.fn();
      if (token.repeat && this.timers.has(token)) {
        token.due = this.now() + token.repeat; this.arm(token);
      }
    }, Math.max(0, token.due - this.now()));
  }
  clear(token) { if (!token) return; this.host.clearTimeout(token.handle); this.timers.delete(token); }
  clearAll() {
    if (this.timers) for (const token of this.timers) this.host.clearTimeout(token.handle);
    this.timers = new Set();
  }
  pause() {
    if (this.paused || this.stopped) return false;
    this.pauseStart = this.wallNow(); this.paused = true;
    for (const token of this.timers) this.host.clearTimeout(token.handle);
    return true;
  }
  resume() {
    if (!this.paused || this.stopped) return false;
    const end = this.wallNow();
    this.periods.push({ start: this.pauseStart, end });
    this.totalPaused += end - this.pauseStart; this.paused = false;
    for (const token of this.timers) this.arm(token);
    return true;
  }
  elapsed(start, end) {
    const periods = this.paused ? [...this.periods, { start: this.pauseStart, end: this.wallNow() }] : this.periods;
    return end - start - periods.reduce((sum, p) => sum + Math.max(0, Math.min(end, p.end) - Math.max(start, p.start)), 0);
  }
  stop() { this.clearAll(); this.stopped = true; }
}

const taskClock = new PausableClock();
const taskNow = () => taskClock.now();
const taskTimeout = (fn, ms) => taskClock.schedule(fn, ms);
const taskInterval = (fn, ms) => taskClock.schedule(fn, ms, ms);
const clearTaskTimer = (token) => taskClock.clear(token);
function unpausedElapsed(startRelative, endRelative) {
  const origin = sessionState.clock.performanceStart;
  return taskClock.elapsed(origin + startRelative, origin + endRelative);
}

function taskInstructions(block) {
  const text = {
    reaction: ["Simple reaction time", "Wait for the target to appear, then tap it as quickly as you can. Do not tap while only the fixation cross is showing."],
    stroop: ["Stroop", "Tap the color of the ink, not the word you read. For example, if RED is written in blue ink, tap BLUE."],
    trail_a: ["Trail Making A", "Tap the numbered circles in order: 1 → 2 → 3 and so on. Work as quickly and accurately as you can. A new layout appears after each completed attempt."],
    trail_b: ["Trail Making B", "Alternate numbers and letters: 1 → A → 2 → B → 3 → C and so on. Tap in order, as quickly and accurately as you can."],
    corsi: ["Corsi spatial span", "Watch the blocks light up. When prompted, tap the same blocks in the same order. An incorrect sequence returns you to the starting span."],
  };
  if (block.type === "pvsat" || block.type === "practice") return [block.practice ? "PVSAT practice" : "PVSAT",
    `Remember the first digit. For every new digit, tap the sum of it and the immediately previous digit. Example: 4, then 7 → tap 11; then 2 → tap 9 (7 + 2). New digits arrive every ${block.paceSeconds} seconds, whether or not you answer.`];
  return text[block.type] || null;
}

function startBlockWithInstructions(displayElement, trial, run) {
  taskClock.clearAll();
  sessionState.media = null; sessionState.abortCurrent = null;
  sessionState.currentBlock = { block: trial.blockNumber, block_type: trial.block.type, condition: trial.block.condition };
  sessionState.blockOnset = null;
  const instruction = taskInstructions(trial.block);
  sessionState.phase = instruction ? "instructions" : "task";
  if (!instruction) { run(); return; }
  displayElement.innerHTML = baseParticipantScreen(trial.blockNumber, trial.totalBlocks, trial.block.condition);
  const slot = displayElement.querySelector(".screen-slot");
  slot.innerHTML = `<section class="test-instructions"><p class="eyebrow">Before this test</p>
    <h2>${instruction[0]}</h2><p>${instruction[1]}</p>
    <p class="instruction-note">Stay seated and breathe naturally.</p>
    <button id="start-test" type="button" class="primary-button">Start ${instruction[0]}</button></section>`;
  logEvent("instructions_onset", sessionState.currentBlock);
  slot.querySelector("#start-test").addEventListener("click", () => {
    if (taskClock.paused || taskClock.stopped) return;
    logEvent("instructions_offset", sessionState.currentBlock);
    sessionState.phase = "task"; run();
  }, { once: true });
}

function setPausePanel(confirmEnd = false) {
  if (!taskClock.paused || taskClock.stopped) return;
  sessionState.confirmingEnd = confirmEnd;
  document.querySelector("#pause-actions").hidden = confirmEnd;
  document.querySelector("#end-confirmation").hidden = !confirmEnd;
  document.querySelector(confirmEnd ? "#cancel-end" : "#resume-session").focus();
}
function pauseSession() {
  if (!sessionState.running || !taskClock.pause()) return;
  logEvent("session_pause", { ...sessionState.currentBlock, phase: sessionState.phase });
  sessionState.media?.pause();
  els.experimentRoot.inert = true;
  els.experimentRoot.classList.add("session-is-paused");
  document.querySelector("#session-controls").hidden = true;
  document.querySelector("#pause-overlay").hidden = false;
  setPausePanel();
}
function resumeSession() {
  if (!sessionState.running || !taskClock.paused || taskClock.stopped) return;
  const pauseMs = performance.now() - taskClock.pauseStart;
  taskClock.resume();
  logEvent("session_resume", { ...sessionState.currentBlock, pause_duration_ms: round(pauseMs), total_pause_duration_ms: round(taskClock.totalPaused) });
  document.querySelector("#pause-overlay").hidden = true;
  document.querySelector("#session-controls").hidden = false;
  els.experimentRoot.inert = false;
  els.experimentRoot.classList.remove("session-is-paused");
  sessionState.media?.resume();
  document.querySelector("#pause-session").focus();
}
function endSessionEarly() {
  if (!sessionState.running || !taskClock.paused || !sessionState.confirmingEnd || sessionState.endedEarly) return;
  sessionState.confirmingEnd = false;
  sessionState.endedEarly = true;
  sessionState.abortCurrent?.();
  const row = { ...sessionState.currentBlock, record_type: "block_summary", completion_status: "ended_early", phase: sessionState.phase };
  if (sessionState.blockOnset !== null) {
    row.actual_duration_ms = round(unpausedElapsed(sessionState.blockOnset, relativeNow()));
    sessionState.trials.push(row); logEvent("block_offset", row);
  } else if (sessionState.phase === "instructions") logEvent("instructions_offset", row);
  logEvent("session_end_early_confirmed", row);
  taskClock.stop();
  sessionState.media?.dispose(); sessionState.media = null;
  document.querySelector("#pause-overlay").hidden = true;
  document.querySelector("#session-controls").hidden = true;
  els.experimentRoot.inert = false;
  els.experimentRoot.classList.remove("session-is-paused");
  sessionState.jsPsych.abortExperiment("", { completion_status: "ended_early" });
}
