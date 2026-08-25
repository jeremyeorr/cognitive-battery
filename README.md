# Respiratory cognitive-task battery mockup

[Live GitHub Pages app](https://jeremyeorr.github.io/cognitive-battery/)

This is a first working mockup of a static, iPad-friendly jsPsych 8 cognitive-task battery for respiratory physiology studies. Coordinators can select any combination of modified PVSAT, Stroop, Trail Making A, Trail Making B, Corsi spatial span, and simple reaction time.

## What is implemented

- Configurable onset-to-onset pacing, initially 4, 3, and 2 seconds.
- Separately configurable digit display duration, initially 1 second.
- A configurable slow practice block, initially 5.0-second pacing with a 1.0-second digit display, immediately before the experimental PVSAT conditions.
- Separate duration controls for every test, initially 3 minutes. Complete attempts continue until the configured minimum time is reached or surpassed.
- Thirty-second Rest blocks by default, inserted between testing conditions.
- Convenient arrow-button reordering of the selected cognitive tests, plus fixed, reversed, rotated, or seeded-random PVSAT pacing order.
- Any number of muted six-minute nature-video periods can be added, reordered, or removed in the session sequence, with shortened versions in demo mode. Each period waits for the participant to tap Start, and its timer begins only when playback starts.
- A short demo mode and optional demo-only answer feedback.
- Modified PVSAT with configurable 3- or 4-choice touchscreen responses. Answers are sorted numerically, while correct positions are balanced in shuffled groups.
- Functioning touchscreen demos for Stroop, repeated Trail Making A/B attempts, Corsi spatial span, and simple reaction time.
- Corsi returns to its starting span after an incorrect sequence and continues until the configured minimum duration is met.
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

The jsPsych version is pinned to `8.3.0` on unpkg. The default nature block loops the CC0 flower footage hosted in MDN's interactive examples. For a production deployment, vendor the exact dependency and approved study video files so data collection does not depend on third-party CDNs.

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
