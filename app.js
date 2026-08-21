"use strict";

const APP_VERSION = "0.4.1-mockup";
const JSPsych_VERSION = "8.3.0";
// The jsPsych 8 browser bundle exposes plugin parameter types on the
// `jsPsychModule` namespace; `initJsPsych()` returns the experiment instance.
const ParameterType = jsPsychModule.ParameterType;

const els = {
  setupRoot: document.querySelector("#setup-root"),
  experimentRoot: document.querySelector("#experiment-root"),
  form: document.querySelector("#setup-form"),
  studyId: document.querySelector("#study-id"),
  participantId: document.querySelector("#participant-id"),
  sessionLabel: document.querySelector("#session-label"),
  studyCondition: document.querySelector("#study-condition"),
  pacingValues: document.querySelector("#pacing-values"),
  stimulusDuration: document.querySelector("#stimulus-duration"),
  restDuration: document.querySelector("#rest-duration"),
  pvsatDuration: document.querySelector("#pvsat-duration"),
  practicePace: document.querySelector("#practice-pace"),
  practiceStimulusDuration: document.querySelector("#practice-stimulus-duration"),
  practiceDuration: document.querySelector("#practice-duration"),
  practiceEnabled: document.querySelector("#practice-enabled"),
  orderMethod: document.querySelector("#order-method"),
  demoMode: document.querySelector("#demo-mode"),
  demoFeedback: document.querySelector("#demo-feedback"),
  taskPvsat: document.querySelector("#task-pvsat"),
  taskStroop: document.querySelector("#task-stroop"),
  taskTrailA: document.querySelector("#task-trail-a"),
  taskTrailB: document.querySelector("#task-trail-b"),
  taskCorsi: document.querySelector("#task-corsi"),
  taskReaction: document.querySelector("#task-reaction"),
  pvsatChoiceCount: document.querySelector("#pvsat-choice-count"),
  blockPreview: document.querySelector("#block-preview"),
  estimatedDuration: document.querySelector("#estimated-duration"),
  setupError: document.querySelector("#setup-error"),
};

const sessionState = {
  config: null,
  jsPsych: null,
  clock: null,
  trials: [],
  events: [],
  eventIndex: 0,
  running: false,
};

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parsePacingValues(raw) {
  const values = raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  if (!values.length || values.some((value) => value < 0.5 || value > 10)) {
    throw new Error("Enter comma-separated pacing intervals between 0.5 and 10 seconds.");
  }
  return [...new Set(values)];
}

function orderedPaces(paces, method, seed) {
  if (method === "reverse") return [...paces].reverse();
  if (method === "rotate") {
    const offset = seed % paces.length;
    return [...paces.slice(offset), ...paces.slice(0, offset)];
  }
  if (method === "random") return shuffled(paces, mulberry32(seed));
  return [...paces];
}

function readConfig() {
  const studyId = els.studyId.value.trim();
  const participantId = els.participantId.value.trim();
  const sessionLabel = els.sessionLabel.value.trim();
  const studyCondition = els.studyCondition.value.trim();
  if (!studyId || !participantId || !sessionLabel || !studyCondition) {
    throw new Error("Complete all four study identifier fields.");
  }

  const pacingSeconds = parsePacingValues(els.pacingValues.value);
  const stimulusSeconds = Number(els.stimulusDuration.value);
  const configuredRestSeconds = Number(els.restDuration.value);
  const configuredPvsatSeconds = Number(els.pvsatDuration.value);
  const practicePaceSeconds = Number(els.practicePace.value);
  const practiceStimulusSeconds = Number(els.practiceStimulusDuration.value);
  const configuredPracticeSeconds = Number(els.practiceDuration.value);
  if (
    !(
      stimulusSeconds > 0 &&
      configuredRestSeconds > 0 &&
      configuredPvsatSeconds > 0 &&
      practicePaceSeconds > 0 &&
      practiceStimulusSeconds > 0 &&
      configuredPracticeSeconds > 0
    )
  ) {
    throw new Error("All durations must be greater than zero.");
  }
  if (stimulusSeconds >= Math.min(...pacingSeconds)) {
    throw new Error("Digit display duration must be shorter than the fastest pacing interval.");
  }
  if (practiceStimulusSeconds >= practicePaceSeconds) {
    throw new Error("Practice digit display duration must be shorter than practice pacing.");
  }

  const seedText = `${studyId}|${participantId}|${sessionLabel}`;
  const seed = hashString(seedText);
  const demoMode = els.demoMode.checked;
  const restSeconds = demoMode ? 5 : configuredRestSeconds;
  const pvsatSeconds = demoMode ? 15 : configuredPvsatSeconds;
  const practiceSeconds = demoMode ? 20 : configuredPracticeSeconds;
  const paces = orderedPaces(pacingSeconds, els.orderMethod.value, seed);
  const practiceEnabled = els.practiceEnabled.checked;
  const pvsatChoiceCount = Number(els.pvsatChoiceCount.value);
  const selectedTasks = {
    pvsat: els.taskPvsat.checked,
    stroop: els.taskStroop.checked,
    trail_a: els.taskTrailA.checked,
    trail_b: els.taskTrailB.checked,
    corsi: els.taskCorsi.checked,
    reaction: els.taskReaction.checked,
  };
  if (!Object.values(selectedTasks).some(Boolean)) {
    throw new Error("Select at least one testing option.");
  }
  const blocks = [];

  if (selectedTasks.pvsat && practiceEnabled) {
    blocks.push({
      type: "practice",
      task: "pvsat",
      practice: true,
      durationSeconds: practiceSeconds,
      condition: `Practice-${practicePaceSeconds.toFixed(2)}s`,
      paceSeconds: practicePaceSeconds,
      stimulusSeconds: practiceStimulusSeconds,
    });
  }

  blocks.push({ type: "rest", durationSeconds: restSeconds, condition: "Rest" });

  if (selectedTasks.pvsat) {
    paces.forEach((paceSeconds) => {
      blocks.push({
        type: "pvsat",
        task: "pvsat",
        durationSeconds: pvsatSeconds,
        condition: `PVSAT-${paceSeconds.toFixed(2)}s`,
        paceSeconds,
      });
      blocks.push({ type: "rest", durationSeconds: restSeconds, condition: "Rest" });
    });
  }

  const additionalBlocks = [
    { key: "stroop", type: "stroop", condition: "Stroop", durationSeconds: demoMode ? 15 : 60 },
    { key: "trail_a", type: "trail_a", condition: "Trail Making A", durationSeconds: demoMode ? 30 : 90 },
    { key: "trail_b", type: "trail_b", condition: "Trail Making B", durationSeconds: demoMode ? 35 : 120 },
    { key: "corsi", type: "corsi", condition: "Corsi Spatial Span", durationSeconds: demoMode ? 30 : 75 },
    { key: "reaction", type: "reaction", condition: "Simple Reaction Time", durationSeconds: demoMode ? 20 : 60 },
  ];

  additionalBlocks.forEach((block) => {
    if (!selectedTasks[block.key]) return;
    blocks.push({ ...block, task: block.key });
    blocks.push({ type: "rest", durationSeconds: restSeconds, condition: "Rest" });
  });

  return {
    appVersion: APP_VERSION,
    jsPsychVersion: JSPsych_VERSION,
    studyId,
    participantId,
    sessionLabel,
    studyCondition,
    pacingSeconds,
    orderedPacingSeconds: paces,
    stimulusSeconds,
    practiceEnabled,
    practicePaceSeconds,
    practiceStimulusSeconds,
    configuredPracticeSeconds,
    practiceSeconds,
    pvsatChoiceCount,
    selectedTasks,
    configuredRestSeconds,
    configuredPvsatSeconds,
    restSeconds,
    pvsatSeconds,
    orderMethod: els.orderMethod.value,
    demoMode,
    demoFeedback: demoMode && els.demoFeedback.checked,
    seed,
    seedText,
    blocks,
  };
}

function durationLabel(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  if (!minutes) return `${remainder}s`;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function updatePreview() {
  try {
    const config = readConfig();
    els.setupError.textContent = "";
    els.blockPreview.innerHTML = config.blocks
      .map((block) => {
        const label = block.type === "rest" ? "Rest" : `${block.condition}`;
        const details = {
          rest: "Natural breathing",
          practice: `Guided ${config.pvsatChoiceCount}-choice practice`,
          pvsat: `${config.pvsatChoiceCount}-choice serial addition`,
          stroop: "Executive inhibition",
          trail_a: "Visual attention and speed",
          trail_b: "Executive set-shifting",
          corsi: "Visuospatial working memory",
          reaction: "Low-load motor control",
        };
        const detail = details[block.type];
        return `<li class="${block.type}-block"><span><strong>${label}</strong><small>${detail}</small></span><time>${durationLabel(block.durationSeconds)}</time></li>`;
      })
      .join("");
    const totalSeconds = config.blocks.reduce((sum, block) => sum + block.durationSeconds, 0);
    els.estimatedDuration.textContent = durationLabel(totalSeconds);
  } catch (error) {
    els.setupError.textContent = error.message;
  }
}

function relativeNow() {
  return performance.now() - sessionState.clock.performanceStart;
}

function relativeToIso(relativeMs) {
  return new Date(sessionState.clock.unixStart + relativeMs).toISOString();
}

function logEvent(event, details = {}) {
  const relativeMs = relativeNow();
  sessionState.events.push({
    event_index: ++sessionState.eventIndex,
    event,
    relative_ms: round(relativeMs, 3),
    unix_ms: round(sessionState.clock.unixStart + relativeMs, 3),
    iso_timestamp: relativeToIso(relativeMs),
    ...details,
  });
}

function round(value, decimals = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function waitUntil(targetPerformanceTime, callback) {
  const delay = Math.max(0, targetPerformanceTime - performance.now());
  return window.setTimeout(callback, delay);
}

function generateDigits(count, random) {
  const digits = [];
  for (let i = 0; i < count; i += 1) {
    let next = 1 + Math.floor(random() * 9);
    if (i > 0 && next === digits[i - 1]) {
      next = (next % 9) + 1;
    }
    digits.push(next);
  }
  return digits;
}

function generateOptions(correctSum, previousDigit, currentDigit, random, desiredCorrectPosition, optionCount = 3) {
  const candidates = Array.from({ length: 17 }, (_, index) => index + 2).filter(
    (candidate) => candidate !== correctSum,
  );
  const commonErrors = new Set([previousDigit, currentDigit, Math.abs(previousDigit - currentDigit)]);
  let bestOptions = null;
  let bestScore = Number.POSITIVE_INFINITY;

  const evaluateCombination = (combination) => {
      const options = [correctSum, ...combination].sort((a, b) => a - b);
      const actualPosition = options.indexOf(correctSum);
      const positionPenalty = actualPosition === desiredCorrectPosition ? 0 : 100 + Math.abs(actualPosition - desiredCorrectPosition) * 10;
      const distractorPenalty = combination.reduce(
        (sum, candidate) => sum + Math.abs(candidate - correctSum) - (commonErrors.has(candidate) ? 0.35 : 0),
        0,
      );
      const score = positionPenalty + distractorPenalty + random() * 0.01;
      if (score < bestScore) {
        bestScore = score;
        bestOptions = options;
      }
  };

  // Evaluate every distractor combination. Prefer the requested balanced
  // target position, then nearby sums and common operand/difference errors.
  const chooseDistractors = (startIndex, combination) => {
    if (combination.length === optionCount - 1) {
      evaluateCombination(combination);
      return;
    }
    for (let index = startIndex; index < candidates.length; index += 1) {
      chooseDistractors(index + 1, [...combination, candidates[index]]);
    }
  };
  chooseDistractors(0, []);

  return bestOptions;
}

function baseParticipantScreen(blockNumber, totalBlocks, condition) {
  const progress = ((blockNumber - 1) / totalBlocks) * 100;
  return `
    <div class="participant-screen">
      <header class="participant-topbar">
        <span>Block ${blockNumber} of ${totalBlocks} · ${condition}</span>
        <div class="progress-track" aria-label="Session progress"><span style="width:${progress}%"></span></div>
      </header>
      <div class="screen-slot"></div>
    </div>`;
}

class FixedClockBlockPlugin {
  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  static info = {
    name: "fixed-clock-block",
    version: APP_VERSION,
    parameters: {
      block: { type: ParameterType.OBJECT, default: undefined },
      blockNumber: { type: ParameterType.INT, default: 1 },
      totalBlocks: { type: ParameterType.INT, default: 1 },
    },
    data: {
      record_type: { type: ParameterType.STRING },
      block: { type: ParameterType.INT },
      condition: { type: ParameterType.STRING },
    },
  };

  trial(displayElement, trial) {
    if (trial.block.type === "rest") {
      this.runRest(displayElement, trial);
    } else {
      this.runPvsat(displayElement, trial);
    }
  }

  runRest(displayElement, trial) {
    const { block, blockNumber, totalBlocks } = trial;
    displayElement.innerHTML = baseParticipantScreen(blockNumber, totalBlocks, block.condition);
    const slot = displayElement.querySelector(".screen-slot");
    slot.className = "screen-slot rest-screen";
    slot.innerHTML = `
      <div class="rest-content">
        <div class="fixation" aria-hidden="true">+</div>
        <h2>Rest</h2>
        <p>Please stay still, keep your eyes open, and breathe naturally.</p>
      </div>`;

    const scheduledStartMs = relativeNow();
    const start = performance.now();
    logEvent("block_onset", {
      block: blockNumber,
      block_type: "rest",
      condition: block.condition,
      scheduled_relative_ms: round(scheduledStartMs),
    });

    waitUntil(start + block.durationSeconds * 1000, () => {
      const actualDuration = performance.now() - start;
      logEvent("block_offset", {
        block: blockNumber,
        block_type: "rest",
        condition: block.condition,
        scheduled_duration_ms: block.durationSeconds * 1000,
        actual_duration_ms: round(actualDuration),
      });
      this.jsPsych.finishTrial({
        record_type: "block_summary",
        block: blockNumber,
        block_type: "rest",
        condition: block.condition,
        scheduled_duration_ms: block.durationSeconds * 1000,
        actual_duration_ms: round(actualDuration),
      });
    });
  }

  runPvsat(displayElement, trial) {
    const { block, blockNumber, totalBlocks } = trial;
    const config = sessionState.config;
    const paceMs = block.paceSeconds * 1000;
    const stimulusMs = (block.stimulusSeconds ?? config.stimulusSeconds) * 1000;
    const durationMs = block.durationSeconds * 1000;
    const digitCount = Math.max(2, Math.floor((durationMs - 1) / paceMs) + 1);
    const blockRandom = mulberry32((config.seed + blockNumber * 9973) >>> 0);
    const digits = generateDigits(digitCount, blockRandom);
    const optionCount = config.pvsatChoiceCount;
    const correctPositions = [];
    while (correctPositions.length < digitCount - 1) {
      correctPositions.push(...shuffled(Array.from({ length: optionCount }, (_, index) => index), blockRandom));
    }
    const blockStartPerformance = performance.now();
    const blockStartRelative = relativeNow();
    let activeRecord = null;
    let activeToken = null;
    let digitHideTimer = null;
    let completedPairs = 0;

    displayElement.innerHTML = baseParticipantScreen(blockNumber, totalBlocks, block.condition);
    const slot = displayElement.querySelector(".screen-slot");
    slot.className = "screen-slot task-stage";
    slot.innerHTML = `
      <div class="digit-area"><div id="current-digit" class="digit" aria-live="assertive"></div></div>
      <div id="response-area" class="response-area"></div>`;

    const digitElement = displayElement.querySelector("#current-digit");
    const responseArea = displayElement.querySelector("#response-area");

    const finalizeRecord = () => {
      if (!activeRecord || activeRecord.finalized) return;
      if (activeRecord.selected_option === null) {
        activeRecord.omission = true;
        activeRecord.correct = false;
      }
      activeRecord.finalized = true;
      activeRecord.response_window_closed_ms = round(relativeNow());
      sessionState.trials.push({ ...activeRecord });
      // jsPsych 8's internal data.write() accepts a jsPsych Trial object, not
      // an arbitrary row. Stream rows into our session export collection and
      // let finishTrial() store the block summary in jsPsych normally.
      completedPairs += 1;
      activeRecord = null;
      activeToken = null;
    };

    const handleAnswer = (event) => {
      const button = event.target.closest(".answer-button");
      if (!button || !activeRecord || button.dataset.token !== activeToken || activeRecord.selected_option !== null) return;
      const nowRelative = relativeNow();
      const selected = Number(button.dataset.option);
      activeRecord.selected_option = selected;
      activeRecord.response_relative_ms = round(nowRelative);
      activeRecord.response_iso_timestamp = relativeToIso(nowRelative);
      activeRecord.rt_ms = round(nowRelative - activeRecord.actual_onset_relative_ms);
      activeRecord.late_response = nowRelative > activeRecord.response_deadline_relative_ms;
      activeRecord.omission = false;
      activeRecord.correct = selected === activeRecord.correct_sum;
      displayElement.querySelectorAll(".answer-button").forEach((choice) => {
        choice.disabled = true;
      });
      button.classList.add("is-selected");
      if (block.practice || config.demoFeedback) {
        button.classList.add(activeRecord.correct ? "is-correct" : "is-incorrect");
      }
      logEvent("response", {
        block: blockNumber,
        condition: block.condition,
        trial_number: activeRecord.trial_number,
        selected_option: selected,
        correct: activeRecord.correct,
        late_response: activeRecord.late_response,
        rt_ms: activeRecord.rt_ms,
      });
    };

    responseArea.addEventListener("pointerdown", handleAnswer);
    responseArea.addEventListener("click", handleAnswer);

    logEvent("block_onset", {
      block: blockNumber,
      block_type: block.type,
      condition: block.condition,
      pacing_ms: paceMs,
      stimulus_duration_ms: stimulusMs,
      practice: Boolean(block.practice),
      scheduled_relative_ms: round(blockStartRelative),
    });

    const presentDigit = (index) => {
      finalizeRecord();
      const scheduledPerformance = blockStartPerformance + index * paceMs;
      const scheduledRelative = blockStartRelative + index * paceMs;
      const actualRelative = relativeNow();
      const currentDigit = digits[index];
      digitElement.textContent = String(currentDigit);
      digitElement.classList.add("is-visible");

      if (digitHideTimer) window.clearTimeout(digitHideTimer);
      digitHideTimer = waitUntil(scheduledPerformance + stimulusMs, () => {
        digitElement.classList.remove("is-visible");
        logEvent("digit_offset", {
          block: blockNumber,
          condition: block.condition,
          digit_index: index + 1,
          digit: currentDigit,
          scheduled_relative_ms: round(scheduledRelative + stimulusMs),
        });
      });

      logEvent("digit_onset", {
        block: blockNumber,
        condition: block.condition,
        digit_index: index + 1,
        digit: currentDigit,
        scheduled_relative_ms: round(scheduledRelative),
        onset_error_ms: round(actualRelative - scheduledRelative),
      });

      if (index === 0) {
        responseArea.innerHTML = `<div class="first-digit-note">${block.practice ? "Practice: " : ""}Remember this first number.</div>`;
        return;
      }

      const previousDigit = digits[index - 1];
      const correctSum = previousDigit + currentDigit;
      const options = generateOptions(
        correctSum,
        previousDigit,
        currentDigit,
        blockRandom,
        correctPositions[index - 1],
        optionCount,
      );
      const token = `${blockNumber}-${index}-${Math.floor(blockRandom() * 1e9)}`;
      activeToken = token;
      activeRecord = {
        record_type: "pvsat_trial",
        app_version: APP_VERSION,
        jspsych_version: JSPsych_VERSION,
        study_id: config.studyId,
        participant_id: config.participantId,
        session_label: config.sessionLabel,
        study_condition: config.studyCondition,
        session_seed: config.seed,
        trial_number: sessionState.trials.length + 1,
        block_trial_number: index,
        block: blockNumber,
        block_type: block.type,
        task: "pvsat",
        practice: Boolean(block.practice),
        condition: block.condition,
        pacing_ms: paceMs,
        stimulus_duration_ms: stimulusMs,
        previous_digit: previousDigit,
        current_digit: currentDigit,
        correct_sum: correctSum,
        option_count: optionCount,
        option_1: options[0],
        option_2: options[1],
        option_3: options[2],
        option_4: options[3] ?? null,
        correct_option_position: options.indexOf(correctSum) + 1,
        options_json: JSON.stringify(options),
        selected_option: null,
        correct: false,
        rt_ms: null,
        omission: false,
        late_response: false,
        scheduled_onset_relative_ms: round(scheduledRelative),
        actual_onset_relative_ms: round(actualRelative),
        onset_error_ms: round(actualRelative - scheduledRelative),
        response_deadline_relative_ms: round(scheduledRelative + paceMs),
        response_relative_ms: null,
        onset_iso_timestamp: relativeToIso(actualRelative),
        response_iso_timestamp: null,
        finalized: false,
      };

      responseArea.innerHTML = `
        <p class="response-prompt">What is the sum of the last two numbers?</p>
        <div class="answer-grid choices-${optionCount}" role="group" aria-label="${optionCount} answer choices">
          ${options
            .map(
              (option) => `<button class="answer-button" type="button" data-token="${token}" data-option="${option}" aria-label="Answer ${option}">${option}</button>`,
            )
            .join("")}
        </div>`;
    };

    digits.forEach((_, index) => {
      waitUntil(blockStartPerformance + index * paceMs, () => presentDigit(index));
    });

    waitUntil(blockStartPerformance + durationMs, () => {
      finalizeRecord();
      if (digitHideTimer) window.clearTimeout(digitHideTimer);
      responseArea.removeEventListener("pointerdown", handleAnswer);
      responseArea.removeEventListener("click", handleAnswer);
      const actualDuration = performance.now() - blockStartPerformance;
      logEvent("block_offset", {
        block: blockNumber,
        block_type: block.type,
        condition: block.condition,
        pacing_ms: paceMs,
        practice: Boolean(block.practice),
        scheduled_duration_ms: durationMs,
        actual_duration_ms: round(actualDuration),
        completed_trials: completedPairs,
      });
      this.jsPsych.finishTrial({
        record_type: "block_summary",
        block: blockNumber,
        block_type: block.type,
        condition: block.condition,
        pacing_ms: paceMs,
        practice: Boolean(block.practice),
        scheduled_duration_ms: durationMs,
        actual_duration_ms: round(actualDuration),
        completed_trials: completedPairs,
      });
    });
  }
}

function taskRowBase(block, blockNumber, blockTrialNumber, recordType) {
  const config = sessionState.config;
  return {
    record_type: recordType,
    app_version: APP_VERSION,
    jspsych_version: JSPsych_VERSION,
    study_id: config.studyId,
    participant_id: config.participantId,
    session_label: config.sessionLabel,
    study_condition: config.studyCondition,
    session_seed: config.seed,
    trial_number: sessionState.trials.length + 1,
    block_trial_number: blockTrialNumber,
    block: blockNumber,
    block_type: block.type,
    task: block.task || block.type,
    practice: false,
    condition: block.condition,
  };
}

function saveTaskRow(row) {
  sessionState.trials.push(row);
}

class BatteryTaskPlugin {
  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  static info = {
    name: "cognitive-battery-task",
    version: APP_VERSION,
    parameters: {
      block: { type: ParameterType.OBJECT, default: undefined },
      blockNumber: { type: ParameterType.INT, default: 1 },
      totalBlocks: { type: ParameterType.INT, default: 1 },
    },
    data: {
      record_type: { type: ParameterType.STRING },
      block: { type: ParameterType.INT },
      condition: { type: ParameterType.STRING },
    },
  };

  trial(displayElement, trial) {
    const runners = {
      stroop: () => this.runStroop(displayElement, trial),
      trail_a: () => this.runTrail(displayElement, trial, false),
      trail_b: () => this.runTrail(displayElement, trial, true),
      corsi: () => this.runCorsi(displayElement, trial),
      reaction: () => this.runReaction(displayElement, trial),
    };
    runners[trial.block.type]();
  }

  startTaskBlock(block, blockNumber, extra = {}) {
    const startPerformance = performance.now();
    const startRelative = relativeNow();
    logEvent("block_onset", {
      block: blockNumber,
      block_type: block.type,
      task: block.task,
      condition: block.condition,
      scheduled_relative_ms: round(startRelative),
      ...extra,
    });
    return { startPerformance, startRelative };
  }

  finishTaskBlock(block, blockNumber, clock, summary = {}) {
    const actualDuration = performance.now() - clock.startPerformance;
    logEvent("block_offset", {
      block: blockNumber,
      block_type: block.type,
      task: block.task,
      condition: block.condition,
      actual_duration_ms: round(actualDuration),
      ...summary,
    });
    this.jsPsych.finishTrial({
      record_type: "block_summary",
      block: blockNumber,
      block_type: block.type,
      task: block.task,
      condition: block.condition,
      actual_duration_ms: round(actualDuration),
      ...summary,
    });
  }

  prepareScreen(displayElement, blockNumber, totalBlocks, condition, className, content) {
    displayElement.innerHTML = baseParticipantScreen(blockNumber, totalBlocks, condition);
    const slot = displayElement.querySelector(".screen-slot");
    slot.className = `screen-slot cognitive-stage ${className}`;
    slot.innerHTML = content;
    return slot;
  }

  runStroop(displayElement, trial) {
    const { block, blockNumber, totalBlocks } = trial;
    const colors = [
      { name: "RED", value: "#c74747" },
      { name: "BLUE", value: "#2d67b0" },
      { name: "GREEN", value: "#16805f" },
      { name: "YELLOW", value: "#d09a18" },
    ];
    const random = mulberry32((sessionState.config.seed + blockNumber * 1709) >>> 0);
    const clock = this.startTaskBlock(block, blockNumber);
    const slot = this.prepareScreen(
      displayElement,
      blockNumber,
      totalBlocks,
      block.condition,
      "stroop-stage",
      `<div class="task-instruction"><strong>Choose the ink color</strong><span>Ignore the word itself</span></div>
       <div id="stroop-word" class="stroop-word"></div>
       <div id="stroop-choices" class="stroop-choices"></div>`,
    );
    const wordElement = slot.querySelector("#stroop-word");
    const choicesElement = slot.querySelector("#stroop-choices");
    let active = null;
    let trialIndex = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (active) {
        saveTaskRow({
          ...taskRowBase(block, blockNumber, trialIndex, "stroop_trial"),
          word: active.word,
          ink_color: active.ink,
          congruent: active.congruent,
          selected_color: null,
          correct: false,
          rt_ms: null,
          omission: true,
          onset_relative_ms: round(active.onsetRelative),
        });
      }
      this.finishTaskBlock(block, blockNumber, clock, { completed_trials: trialIndex });
    };

    const beginTrial = () => {
      if (finished) return;
      if (performance.now() - clock.startPerformance >= block.durationSeconds * 1000) {
        finish();
        return;
      }
      trialIndex += 1;
      const inkIndex = Math.floor(random() * colors.length);
      const congruent = random() < 0.5;
      let wordIndex = inkIndex;
      if (!congruent) {
        const alternatives = [0, 1, 2, 3].filter((index) => index !== inkIndex);
        wordIndex = alternatives[Math.floor(random() * alternatives.length)];
      }
      active = {
        word: colors[wordIndex].name,
        ink: colors[inkIndex].name,
        congruent,
        onsetRelative: relativeNow(),
      };
      wordElement.textContent = active.word;
      wordElement.style.color = colors[inkIndex].value;
      choicesElement.innerHTML = colors
        .map((color) => `<button type="button" class="stroop-button" data-color="${color.name}">${color.name}</button>`)
        .join("");
    };

    const respond = (event) => {
      const button = event.target.closest(".stroop-button");
      if (!button || !active || finished) return;
      const nowRelative = relativeNow();
      const selected = button.dataset.color;
      const correct = selected === active.ink;
      saveTaskRow({
        ...taskRowBase(block, blockNumber, trialIndex, "stroop_trial"),
        word: active.word,
        ink_color: active.ink,
        congruent: active.congruent,
        selected_color: selected,
        correct,
        rt_ms: round(nowRelative - active.onsetRelative),
        omission: false,
        onset_relative_ms: round(active.onsetRelative),
        response_relative_ms: round(nowRelative),
      });
      logEvent("response", { block: blockNumber, task: block.task, trial_number: trialIndex, correct, rt_ms: round(nowRelative - active.onsetRelative) });
      active = null;
      choicesElement.querySelectorAll("button").forEach((choice) => { choice.disabled = true; });
      window.setTimeout(beginTrial, 250);
    };

    choicesElement.addEventListener("pointerdown", respond);
    window.setTimeout(finish, block.durationSeconds * 1000);
    beginTrial();
  }

  runTrail(displayElement, trial, alternating) {
    const { block, blockNumber, totalBlocks } = trial;
    const labels = alternating
      ? ["1", "A", "2", "B", "3", "C", "4", "D", "5", "E", "6", "F"]
      : Array.from({ length: 12 }, (_, index) => String(index + 1));
    const positions = [
      { x: 10, y: 15 }, { x: 36, y: 10 }, { x: 66, y: 17 }, { x: 88, y: 11 },
      { x: 18, y: 43 }, { x: 48, y: 36 }, { x: 78, y: 44 }, { x: 92, y: 64 },
      { x: 12, y: 75 }, { x: 38, y: 68 }, { x: 64, y: 79 }, { x: 82, y: 88 },
    ];
    const random = mulberry32((sessionState.config.seed + blockNumber * 2909) >>> 0);
    const shuffledPositions = shuffled(positions, random);
    const clock = this.startTaskBlock(block, blockNumber, { alternating });
    const slot = this.prepareScreen(
      displayElement,
      blockNumber,
      totalBlocks,
      block.condition,
      "trail-stage",
      `<div class="task-instruction"><strong>${alternating ? "Alternate numbers and letters" : "Connect the numbers in order"}</strong><span>${alternating ? "1 → A → 2 → B …" : "1 → 2 → 3 …"}</span></div>
       <div id="trail-board" class="trail-board" aria-label="${block.condition} board">
         <div id="trail-lines" class="trail-lines" aria-hidden="true"></div>
         ${labels.map((label, index) => `<button type="button" class="trail-node" data-index="${index}" style="left:${shuffledPositions[index].x}%;top:${shuffledPositions[index].y}%">${label}</button>`).join("")}
       </div>`,
    );
    const board = slot.querySelector("#trail-board");
    const lineLayer = slot.querySelector("#trail-lines");
    let targetIndex = 0;
    let tapIndex = 0;
    let errors = 0;
    let lastCorrectElement = null;
    let lastTapRelative = clock.startRelative;
    let finished = false;

    const finish = (completed) => {
      if (finished) return;
      finished = true;
      this.finishTaskBlock(block, blockNumber, clock, { completed, correct_targets: targetIndex, errors });
    };

    const drawLine = (from, to) => {
      const boardRect = board.getBoundingClientRect();
      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();
      const x1 = fromRect.left + fromRect.width / 2 - boardRect.left;
      const y1 = fromRect.top + fromRect.height / 2 - boardRect.top;
      const x2 = toRect.left + toRect.width / 2 - boardRect.left;
      const y2 = toRect.top + toRect.height / 2 - boardRect.top;
      const length = Math.hypot(x2 - x1, y2 - y1);
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      const line = document.createElement("div");
      line.className = "trail-line";
      line.style.width = `${length}px`;
      line.style.left = `${x1}px`;
      line.style.top = `${y1}px`;
      line.style.transform = `rotate(${angle}deg)`;
      lineLayer.appendChild(line);
    };

    board.addEventListener("pointerdown", (event) => {
      const node = event.target.closest(".trail-node");
      if (!node || finished) return;
      tapIndex += 1;
      const nowRelative = relativeNow();
      const selectedIndex = Number(node.dataset.index);
      const correct = selectedIndex === targetIndex;
      if (!correct) errors += 1;
      saveTaskRow({
        ...taskRowBase(block, blockNumber, tapIndex, alternating ? "trail_b_tap" : "trail_a_tap"),
        expected_target: labels[targetIndex],
        selected_target: labels[selectedIndex],
        correct,
        cumulative_errors: errors,
        rt_ms: round(nowRelative - clock.startRelative),
        intertap_rt_ms: round(nowRelative - lastTapRelative),
        response_relative_ms: round(nowRelative),
      });
      lastTapRelative = nowRelative;
      if (!correct) {
        node.classList.add("is-error");
        window.setTimeout(() => node.classList.remove("is-error"), 250);
        return;
      }
      if (lastCorrectElement) drawLine(lastCorrectElement, node);
      lastCorrectElement = node;
      node.classList.add("is-complete");
      node.disabled = true;
      targetIndex += 1;
      if (targetIndex === labels.length) window.setTimeout(() => finish(true), 300);
    });

    window.setTimeout(() => finish(false), block.durationSeconds * 1000);
  }

  runCorsi(displayElement, trial) {
    const { block, blockNumber, totalBlocks } = trial;
    const config = sessionState.config;
    const spanLengths = config.demoMode ? [2, 3, 4] : [3, 4, 5, 6];
    const random = mulberry32((config.seed + blockNumber * 3719) >>> 0);
    const clock = this.startTaskBlock(block, blockNumber);
    const slot = this.prepareScreen(
      displayElement,
      blockNumber,
      totalBlocks,
      block.condition,
      "corsi-stage",
      `<div class="task-instruction"><strong>Remember the flashing locations</strong><span id="corsi-prompt">Watch the sequence</span></div>
       <div id="corsi-grid" class="corsi-grid">${Array.from({ length: 9 }, (_, index) => `<button type="button" class="corsi-tile" data-index="${index}" aria-label="Spatial block ${index + 1}"></button>`).join("")}</div>`,
    );
    const grid = slot.querySelector("#corsi-grid");
    const prompt = slot.querySelector("#corsi-prompt");
    let sequenceTrial = 0;
    let active = null;
    let accepting = false;
    let finished = false;

    const delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    const finish = () => {
      if (finished) return;
      finished = true;
      accepting = false;
      this.finishTaskBlock(block, blockNumber, clock, { completed_sequences: sequenceTrial });
    };

    const presentNext = async () => {
      if (finished) return;
      if (sequenceTrial >= spanLengths.length) {
        finish();
        return;
      }
      const spanLength = spanLengths[sequenceTrial];
      const sequence = [];
      while (sequence.length < spanLength) {
        const candidate = Math.floor(random() * 9);
        if (candidate !== sequence[sequence.length - 1]) sequence.push(candidate);
      }
      active = { sequence, responses: [], responseStart: null };
      accepting = false;
      prompt.textContent = `Watch ${spanLength} locations`;
      await delay(500);
      for (const index of sequence) {
        if (finished) return;
        const blockElement = grid.querySelector(`[data-index="${index}"]`);
        blockElement.classList.add("is-lit");
        await delay(550);
        blockElement.classList.remove("is-lit");
        await delay(250);
      }
      active.responseStart = relativeNow();
      accepting = true;
      prompt.textContent = "Now tap the same locations in order";
    };

    grid.addEventListener("pointerdown", (event) => {
      const blockElement = event.target.closest(".corsi-tile");
      if (!blockElement || !accepting || !active || finished) return;
      const selected = Number(blockElement.dataset.index);
      active.responses.push(selected);
      blockElement.classList.add("is-pressed");
      window.setTimeout(() => blockElement.classList.remove("is-pressed"), 160);
      if (active.responses.length < active.sequence.length) return;
      accepting = false;
      const correct = active.sequence.every((value, index) => value === active.responses[index]);
      const nowRelative = relativeNow();
      saveTaskRow({
        ...taskRowBase(block, blockNumber, sequenceTrial + 1, "corsi_sequence"),
        span_length: active.sequence.length,
        presented_sequence: JSON.stringify(active.sequence.map((value) => value + 1)),
        selected_sequence: JSON.stringify(active.responses.map((value) => value + 1)),
        correct,
        rt_ms: round(nowRelative - active.responseStart),
        response_relative_ms: round(nowRelative),
      });
      prompt.textContent = correct ? "Correct" : "Sequence recorded";
      sequenceTrial += 1;
      window.setTimeout(presentNext, 600);
    });

    window.setTimeout(finish, block.durationSeconds * 1000);
    presentNext();
  }

  runReaction(displayElement, trial) {
    const { block, blockNumber, totalBlocks } = trial;
    const config = sessionState.config;
    const trialTarget = config.demoMode ? 6 : 20;
    const random = mulberry32((config.seed + blockNumber * 4519) >>> 0);
    const clock = this.startTaskBlock(block, blockNumber);
    const slot = this.prepareScreen(
      displayElement,
      blockNumber,
      totalBlocks,
      block.condition,
      "reaction-stage",
      `<div class="task-instruction"><strong>Tap the circle when it appears</strong><span>Keep your finger ready and wait for the target</span></div>
       <div id="reaction-field" class="reaction-field"><div id="reaction-fixation" class="reaction-fixation">+</div><button id="reaction-target" type="button" class="reaction-target" aria-label="Reaction target"></button></div>`,
    );
    const field = slot.querySelector("#reaction-field");
    const fixation = slot.querySelector("#reaction-fixation");
    const target = slot.querySelector("#reaction-target");
    let trialIndex = 0;
    let active = null;
    let targetVisible = false;
    let finished = false;
    let responseTimeout = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (responseTimeout) window.clearTimeout(responseTimeout);
      this.finishTaskBlock(block, blockNumber, clock, { completed_trials: trialIndex });
    };

    const beginTrial = () => {
      if (finished) return;
      if (trialIndex >= trialTarget) {
        finish();
        return;
      }
      trialIndex += 1;
      targetVisible = false;
      target.classList.remove("is-visible");
      fixation.hidden = false;
      const foreperiodMs = Math.round((config.demoMode ? 800 : 1000) + random() * (config.demoMode ? 900 : 1500));
      active = { foreperiodMs, targetOnset: null };
      window.setTimeout(() => {
        if (finished || !active) return;
        active.targetOnset = relativeNow();
        targetVisible = true;
        fixation.hidden = true;
        target.classList.add("is-visible");
        responseTimeout = window.setTimeout(() => {
          if (!active || finished) return;
          saveTaskRow({
            ...taskRowBase(block, blockNumber, trialIndex, "reaction_trial"),
            foreperiod_ms: active.foreperiodMs,
            target_onset_relative_ms: round(active.targetOnset),
            correct: false,
            false_start: false,
            omission: true,
            rt_ms: null,
          });
          active = null;
          window.setTimeout(beginTrial, 400);
        }, 2000);
      }, foreperiodMs);
    };

    field.addEventListener("pointerdown", (event) => {
      if (!active || finished) return;
      const nowRelative = relativeNow();
      if (!targetVisible || !event.target.closest(".reaction-target")) {
        saveTaskRow({
          ...taskRowBase(block, blockNumber, trialIndex, "reaction_trial"),
          foreperiod_ms: active.foreperiodMs,
          target_onset_relative_ms: active.targetOnset === null ? null : round(active.targetOnset),
          correct: false,
          false_start: true,
          omission: false,
          rt_ms: null,
          response_relative_ms: round(nowRelative),
        });
      } else {
        if (responseTimeout) window.clearTimeout(responseTimeout);
        saveTaskRow({
          ...taskRowBase(block, blockNumber, trialIndex, "reaction_trial"),
          foreperiod_ms: active.foreperiodMs,
          target_onset_relative_ms: round(active.targetOnset),
          correct: true,
          false_start: false,
          omission: false,
          rt_ms: round(nowRelative - active.targetOnset),
          response_relative_ms: round(nowRelative),
        });
      }
      active = null;
      targetVisible = false;
      target.classList.remove("is-visible");
      fixation.hidden = false;
      window.setTimeout(beginTrial, 450);
    });

    beginTrial();
  }
}

function sanitizeFilename(value) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "session";
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function trialsToCsv(trials) {
  if (!trials.length) return "";
  const columns = [...new Set(trials.flatMap((trial) => Object.keys(trial)))].filter(
    (column) => column !== "finalized",
  );
  return [columns.join(","), ...trials.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n");
}

function downloadText(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBaseName() {
  const config = sessionState.config;
  return [config.studyId, config.participantId, config.sessionLabel, sessionState.clock.sessionId]
    .map(sanitizeFilename)
    .join("_");
}

function exportJson() {
  const payload = {
    schema_version: "0.1.0",
    app_version: APP_VERSION,
    jspsych_version: JSPsych_VERSION,
    session_id: sessionState.clock.sessionId,
    session_started_iso: sessionState.clock.isoStart,
    performance_time_origin_ms: performance.timeOrigin,
    unix_start_ms: sessionState.clock.unixStart,
    config: sessionState.config,
    events: sessionState.events,
    trials: sessionState.trials.map(({ finalized, ...row }) => row),
  };
  downloadText(`${exportBaseName()}.json`, JSON.stringify(payload, null, 2), "application/json");
  logEvent("json_export_requested");
}

function exportCsv() {
  downloadText(`${exportBaseName()}.csv`, trialsToCsv(sessionState.trials), "text/csv;charset=utf-8");
  logEvent("csv_export_requested");
}

function showCompletion() {
  sessionState.running = false;
  window.onbeforeunload = null;
  logEvent("session_complete", { trial_count: sessionState.trials.length });
  const experimentalTrials = sessionState.trials.filter((trial) => trial.task === "pvsat" && !trial.practice);
  const responded = experimentalTrials.filter((trial) => !trial.omission);
  const correct = responded.filter((trial) => trial.correct && !trial.late_response);
  const accuracy = responded.length ? Math.round((correct.length / responded.length) * 100) : 0;
  const omissions = experimentalTrials.filter((trial) => trial.omission).length;
  const meanRt = responded.length
    ? Math.round(responded.reduce((sum, trial) => sum + (trial.rt_ms || 0), 0) / responded.length)
    : 0;

  els.experimentRoot.innerHTML = `
    <section class="complete-screen">
      <div class="complete-panel">
        <p class="eyebrow">Session complete</p>
        <h2>Data are ready</h2>
        <p>Save both files before closing this tab. The JSON includes the full session/event log; the CSV contains task-labeled rows for every selected test.</p>
        <div class="completion-summary" aria-label="Session summary">
          <div class="summary-stat"><strong>${experimentalTrials.length ? `${accuracy}%` : "—"}</strong><span>PVSAT accuracy</span></div>
          <div class="summary-stat"><strong>${responded.length ? `${meanRt} ms` : "—"}</strong><span>PVSAT mean RT</span></div>
          <div class="summary-stat"><strong>${experimentalTrials.length ? omissions : "—"}</strong><span>PVSAT omissions</span></div>
        </div>
        <div class="download-grid">
          <button id="download-csv" class="secondary-button" type="button">Download trial CSV</button>
          <button id="download-json" class="primary-button" type="button">Download full JSON</button>
        </div>
        <p class="completion-note">No study data have been uploaded or stored remotely.</p>
      </div>
    </section>`;
  document.querySelector("#download-csv").addEventListener("click", exportCsv);
  document.querySelector("#download-json").addEventListener("click", exportJson);
}

function beginExperiment(config) {
  // Remove the participant-ready panel before jsPsych creates its display
  // wrapper. Otherwise the running task is appended below that full-screen
  // panel and the Begin button appears to have done nothing.
  els.experimentRoot.innerHTML = "";
  window.scrollTo(0, 0);
  sessionState.config = config;
  sessionState.trials = [];
  sessionState.events = [];
  sessionState.eventIndex = 0;
  sessionState.clock = {
    performanceStart: performance.now(),
    unixStart: Date.now(),
    isoStart: new Date().toISOString(),
    sessionId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${config.seed}`,
  };
  sessionState.running = true;
  logEvent("session_start", {
    session_id: sessionState.clock.sessionId,
    study_id: config.studyId,
    participant_id: config.participantId,
    session_label: config.sessionLabel,
    study_condition: config.studyCondition,
  });
  window.onbeforeunload = () => "The session data have not been exported yet.";

  sessionState.jsPsych = initJsPsych({
    display_element: "experiment-root",
    on_finish: showCompletion,
    on_interaction_data_update: (data) => {
      logEvent("browser_interaction", { interaction: data.event });
    },
  });

  const fixedClockTypes = new Set(["rest", "practice", "pvsat"]);
  const timeline = config.blocks.map((block, index) => ({
    type: fixedClockTypes.has(block.type) ? FixedClockBlockPlugin : BatteryTaskPlugin,
    block,
    blockNumber: index + 1,
    totalBlocks: config.blocks.length,
    record_data: true,
  }));
  sessionState.jsPsych.run(timeline);
}

function showReadyScreen(config) {
  els.setupRoot.hidden = true;
  els.experimentRoot.hidden = false;
  els.experimentRoot.innerHTML = `
    <section class="ready-screen">
      <div class="ready-panel">
        <p class="eyebrow">Participant instructions</p>
        <h2>Follow the instructions for each selected task.</h2>
        <p>The battery will guide you through ${Object.values(config.selectedTasks).filter(Boolean).length} testing option${Object.values(config.selectedTasks).filter(Boolean).length === 1 ? "" : "s"}, with Rest blocks in between.</p>
        <ol class="instruction-list">
          <li><b>1</b><span>Read the task-specific instruction at the top of each screen.</span></li>
          <li><b>2</b><span>Respond by tapping the large on-screen targets.</span></li>
          <li><b>3</b><span>During paced tasks, the stimulus clock continues even without a response.</span></li>
        </ol>
        <button id="begin-session" class="primary-button" type="button">Begin session</button>
      </div>
    </section>`;
  document.querySelector("#begin-session").addEventListener(
    "click",
    () => {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      beginExperiment(config);
    },
    { once: true },
  );
}

els.form.addEventListener("input", updatePreview);
els.form.addEventListener("change", updatePreview);
els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const config = readConfig();
    els.setupError.textContent = "";
    showReadyScreen(config);
  } catch (error) {
    els.setupError.textContent = error.message;
  }
});

updatePreview();
