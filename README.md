# Respiratory cognitive-task battery mockup

[Live GitHub Pages app](https://jeremyeorr.github.io/cognitive-battery/)

This is a first working mockup of a static, iPad-friendly jsPsych 8 cognitive-task battery for respiratory physiology studies. Coordinators can select any combination of modified PVSAT, Stroop, Trail Making A, Trail Making B, Corsi spatial span, and simple reaction time.

## What is implemented

- Configurable onset-to-onset pacing, initially 3.0, 2.0, and 1.5 seconds.
- Separately configurable digit display duration, initially 0.75 seconds.
- A configurable slow practice block, initially 4.0-second pacing with a 1.0-second digit display, before the first Rest block.
- Rest → PVSAT → Rest sequencing with fixed, reversed, rotated, or seeded-random pacing order.
- A short demo mode and optional demo-only answer feedback.
- Modified PVSAT with configurable 3- or 4-choice touchscreen responses. Answers are sorted numerically, while correct positions are balanced in shuffled groups.
- Functioning touchscreen demos for Stroop, Trail Making A/B, Corsi spatial span, and simple reaction time.
- Automatic Rest blocks between selected testing conditions.
- Absolute stimulus scheduling: a response never starts or delays the next digit timer.
- Trial-level CSV export and full JSON export containing configuration, trial rows, and a session/event log.
- All study data remain in browser memory until the coordinator downloads them. There is no upload endpoint and nothing is written to GitHub.

## Run locally

Serve this folder with any static web server and open `index.html` through the local web address. A server is preferred over opening the file directly because the app loads its pinned jsPsych dependency from a CDN and browsers apply stricter rules to `file://` pages.

For example, if Python is available:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Publish with GitHub Pages

Place these files at the root of a GitHub repository, then enable GitHub Pages for the repository branch and root folder. The app is entirely static and does not require a build step or server-side storage.

The jsPsych version is pinned to `8.3.0` on unpkg. For a production deployment, consider vendoring the exact dependency files into the repository so the task does not depend on a third-party CDN during data collection.

## Export structure

The CSV contains the union of task-specific fields across the battery. PVSAT practice rows are marked with `practice=true`; task and record-type columns distinguish PVSAT pairs, Stroop trials, Trail Making taps, Corsi sequences, and reaction-time trials.

The JSON adds:

- the full setup configuration and randomization seed;
- session clock anchors (`performance.timeOrigin`, session Unix time, and ISO start);
- precise relative block onset/offset events;
- digit onset/offset events and browser focus/fullscreen interaction events;
- all trial records.

High-resolution relative times use `performance.now()`. Wall-clock/ISO times are derived from the session's paired monotonic and Unix clock anchors.

## Important mockup limitations

This is not yet a validated clinical/research production instrument. Before real enrollment, the protocol should define and test response-window scoring, distractor rules, practice trials, interruption handling, device/browser locking, data naming and transfer SOPs, clock synchronization with the respiratory acquisition system, and recovery behavior if a tab is closed. Timing should also be characterized on the exact iPad/browser model used in the study.
