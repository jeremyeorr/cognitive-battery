# Respiratory cognitive-task battery mockup

[Live GitHub Pages app](https://jeremyeorr.github.io/cognitive-battery/)

This is a first working mockup of a static, iPad-friendly jsPsych 8 cognitive-task battery for respiratory physiology studies. Coordinators can select any combination of modified PVSAT, Stroop, Trail Making A, Trail Making B, Corsi spatial span, and simple reaction time.

## What is implemented

- Configurable onset-to-onset pacing, initially 4, 3, and 2 seconds.
- Separately configurable digit display duration, initially 1 second.
- A configurable slow practice block, initially 5.0-second pacing with a 1.0-second digit display, immediately before the experimental PVSAT conditions.
- Separate duration controls for every test, initially 3 minutes. Complete attempts continue until the configured minimum time is reached or surpassed.
- Thirty-second Rest blocks by default, inserted between testing conditions.
- Convenient arrow-button reordering of the selected cognitive tests. PVSAT pacing intervals run in the order entered (4, 3, then 2 seconds by default).
- The default sequence is nature video → simple reaction time → PVSAT → Stroop → Trail Making A → Trail Making B → Corsi → nature video, with the existing rest and PVSAT practice blocks retained.
- Two muted nature-video periods bracket the cognitive battery by default (6 minutes each). Duration per period is configurable; any number of periods can be added, reordered, or removed. Each waits for an explicit Start tap.
- YouTube periods continue from the preceding period's observed media position, including across intervening tasks. Viewing duration follows media time, so pauses and buffering do not consume viewing time. No YouTube looping or silent substitute footage is used.
- Before the battery, a coordinator playback/length check requires enough footage for the starting offset plus **all configured nature minutes**, even in demo mode. For the default link at 12 seconds and two 6-minute periods, the video must extend through **12 minutes 12 seconds**. Unavailable, unverified, or too-short videos block launch. Runtime errors stop progression and offer partial-data downloads.
- An optional YouTube watch, share, Shorts, or embed link can supply every nature-video period. The default link starts at 12 seconds; clearing the field restores the built-in clip. YouTube playback uses its privacy-enhanced embedded player and requires network access.
- A short demo mode and optional demo-only answer feedback, off by default.
- Short task-specific instructions appear before every cognitive block (including PVSAT practice and each pacing condition). Tap Start to begin; instruction time is not counted as test time.
- Sessions stay in the normal browser view; the app does not request fullscreen, avoiding browser-generated fullscreen exit notices over task targets.
- A small technician-only Pause control at the top right is available during tests, rests, instructions, and videos. Participant instructions do not invite pausing. Pause hides the task, blocks responses, suspends task timers, and pauses video playback. Resume continues with the remaining time, without skipping stimuli. Video awaiting its first Start tap stays waiting after Resume.
- The pause screen offers End session early, followed by a separate confirmation. Cancelling stays paused. Confirming stops the remaining battery and opens the CSV/JSON download screen, labelled as partial data; download both files before closing the tab.
- Modified PVSAT with configurable 3- or 4-choice touchscreen responses. Answers are sorted numerically, while correct positions are balanced in shuffled groups.
- Functioning touchscreen demos for Stroop, repeated Trail Making A/B attempts, Corsi spatial span, and simple reaction time.
- Corsi returns to its starting span after an incorrect sequence and continues until the configured minimum duration is met.
- Automatic Rest blocks between selected testing conditions.
- Absolute stimulus scheduling: a response never starts or delays the next digit timer.
- Trial-level CSV export and full JSON export containing configuration, trial rows, and a session/event log.
- Completion and confirmed early exit open a save checkpoint: request CSV and JSON separately, verify both files in Downloads/Files, then explicitly confirm they are saved. Partial downloads made during the battery do not satisfy the final checkpoint. The browser leave/refresh warning remains active until confirmation. A page cannot verify download completion or prevent forced closure; iPad/mobile browsers may suppress the warning. No persistent recovery copy is stored, so save before leaving.
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

The jsPsych version is pinned to `8.3.0` on unpkg. Nature periods default to an embedded YouTube video; clearing the coordinator field uses the CC0 flower footage hosted in MDN's interactive examples. YouTube embeds contact YouTube during the session, and all remote-video options require network access. For a production deployment, vendor the exact dependency and approved study video files so data collection does not depend on third-party CDNs.

## Export structure

The CSV contains the union of task-specific fields across the battery. PVSAT practice rows are marked with `practice=true`; task and record-type columns distinguish PVSAT pairs, Stroop trials, Trail Making taps, Corsi sequences, and reaction-time trials.

The JSON adds:

- the full setup configuration and randomization seed;
- session clock anchors (`performance.timeOrigin`, session Unix time, and ISO start);
- precise relative block onset/offset events;
- digit onset/offset events and browser focus/fullscreen interaction events;
- all trial records.

Nature-video block summaries include the media start/end positions and played duration. YouTube player-state events identify pauses and buffering; configuration records the verified source duration. Browser polling is not frame-accurate (50-ms polling with up to 0.5 seconds of endpoint tolerance for successive-boundary rounding). The observed stop position is reused for the next period. Use prerecorded videos, not live streams. The blank-link built-in clip is a looping demo, not continuous study footage. Ads and third-party availability remain limitations of YouTube; pre-screen the chosen footage on the study device.

Run the local regression checks with `node --test tests/nature-video.test.cjs`.

High-resolution relative times use `performance.now()`. Wall-clock/ISO times are derived from the session's paired monotonic and Unix clock anchors.

Session pause/resume and early-end events preserve real monotonic/ISO timestamps for synchronization. Cognitive durations and RTs exclude time explicitly paused; event `active_relative_ms` is the pause-adjusted session time. PVSAT `pause_interrupted` and other tasks' conservative `block_pause_interrupted` flags identify affected data. Pauses can alter cognitive performance even when timing is corrected; exclude or review affected observations according to the study protocol. Instruction onset/offset events are separate from test onset/offset. Early-end exports retain completed responses, available in-progress PVSAT/Corsi data, and an interrupted-block summary; they do not treat an unfinished response window as an ordinary omission.

## Important mockup limitations

This is not yet a validated clinical/research production instrument. Before real enrollment, the protocol should define and test response-window scoring, distractor rules, practice trials, interruption handling, device/browser locking, data naming and transfer SOPs, clock synchronization with the respiratory acquisition system, and recovery behavior if a tab is closed. Timing should also be characterized on the exact iPad/browser model used in the study.
