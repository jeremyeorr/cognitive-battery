"use strict";

// YouTube media time, not elapsed wall time, governs viewing duration. The
// participant must press Start for every period; videos never loop to fill time.
function natureLengthError(duration, requiredEnd) {
  if (!Number.isFinite(duration) || duration <= 0) return "YouTube has not supplied a video length. Playback cannot be verified yet.";
  if (duration < requiredEnd) {
    return `This video is ${durationLabel(duration)} long, but the session needs footage through ${durationLabel(requiredEnd)}. Choose a longer video, reduce the minutes, or remove a viewing period.`;
  }
  return null;
}

function natureEmbedUrl(videoId, startSeconds) {
  const origin = window.location.origin;
  const params = new URLSearchParams({
    enablejsapi: "1", autoplay: "0", controls: "0", playsinline: "1", rel: "0", disablekb: "1",
    start: String(Math.floor(startSeconds)),
  });
  if (origin !== "null") params.set("origin", origin);
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}

function natureIframe(videoId, startSeconds) {
  return `<iframe id="nature-youtube" class="nature-youtube" src="${natureEmbedUrl(videoId, startSeconds)}"
    title="YouTube nature video" allow="autoplay; encrypted-media; picture-in-picture"
    referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
}

function showNatureVideoCheck(config) {
  els.setupRoot.hidden = true;
  els.experimentRoot.hidden = false;
  window.scrollTo(0, 0);
  els.experimentRoot.innerHTML = `<section class="ready-screen"><div class="ready-panel nature-check-panel">
    <p class="eyebrow">Coordinator video check</p><h2>Check footage before the battery</h2>
    <p>${config.natureVideoCount} viewing periods need ${durationLabel(config.natureVideoCount * config.configuredNatureVideoSeconds)} of footage, starting at ${durationLabel(config.youtubeStartSeconds)}. The video must be at least ${durationLabel(config.requiredYoutubeEndSeconds)} long.</p>
    ${natureIframe(config.youtubeVideoId, config.youtubeStartSeconds)}
    <p id="video-check-status" role="status">Loading YouTube. This checks length and embedding, not suitability of the content.</p>
    <button id="video-check-play" class="primary-button" type="button" disabled>Loading player…</button>
    <button id="video-check-back" class="secondary-button" type="button">Back to setup</button>
    <p>Use prerecorded footage. Ads, network interruptions, and platform changes can affect playback; inspect your chosen video before data collection.</p>
    </div></section>`;
  const status = document.querySelector("#video-check-status");
  const play = document.querySelector("#video-check-play");
  let player = null;
  let disposed = false;
  let failed = false;
  let attempted = false;
  let poll = null;
  let timeout = null;
  const clean = () => {
    disposed = true;
    window.clearInterval(poll);
    window.clearTimeout(timeout);
    player?.destroy();
  };
  const fail = (message) => {
    if (disposed || failed) return;
    failed = true;
    window.clearInterval(poll);
    window.clearTimeout(timeout);
    player?.pauseVideo?.();
    status.textContent = message;
    play.disabled = true;
    play.textContent = "Return to setup to adjust or retry";
  };
  const inspect = () => {
    if (disposed || failed) return;
    const duration = Number(player?.getDuration());
    if (!Number.isFinite(duration) || duration <= 0) return;
    const error = natureLengthError(duration, config.requiredYoutubeEndSeconds);
    if (error) { fail(error); return; }
    // A short playback check also verifies that the embed can actually start.
    if (!attempted || player.getPlayerState() !== 1) return;
    config.youtubeDurationSeconds = duration;
    config.youtubeLengthCheckedIso = new Date().toISOString();
    clean();
    showReadyScreen(config);
  };
  document.querySelector("#video-check-back").addEventListener("click", () => {
    clean();
    els.experimentRoot.innerHTML = "";
    els.experimentRoot.hidden = true;
    els.setupRoot.hidden = false;
    updatePreview();
  });
  timeout = window.setTimeout(() => fail("YouTube did not load. Check the connection, then return to setup to retry."), 15000);
  loadYouTubeIframeApi().then((YT) => {
    if (disposed || failed) return;
    player = new YT.Player(document.querySelector("#nature-youtube"), { events: {
      onReady: () => {
        if (disposed || failed) return;
        window.clearTimeout(timeout);
        player.mute();
        play.disabled = false;
        play.textContent = "Check playback and continue";
        status.textContent = "Tap to briefly play the video and verify its length. This is not part of the session; the first viewing period still starts at the link’s offset.";
        inspect();
      },
      onStateChange: inspect,
      onError: (event) => fail(`YouTube cannot play this embed (code ${event.data}). Return to setup and choose another video or retry.`),
      onAutoplayBlocked: () => {
        if (disposed || failed) return;
        window.clearTimeout(timeout);
        window.clearInterval(poll);
        play.disabled = false;
        play.textContent = "Tap to check playback again";
      },
    }});
  }).catch((error) => fail(error.message));
  play.addEventListener("click", () => {
    attempted = true;
    play.disabled = true;
    status.textContent = "Checking playback and available footage…";
    poll = window.setInterval(inspect, 200);
    timeout = window.setTimeout(() => fail("Could not verify the video length or playback. Return to setup to retry or choose another video."), 20000);
    player.playVideo();
  });
}

function runContinuousYouTubeNature(displayElement, trial, jsPsych) {
  const { block, blockNumber, totalBlocks } = trial;
  const startPosition = sessionState.natureCursorSeconds ?? block.youtubeStartSeconds;
  const plannedEnd = startPosition + block.durationSeconds;
  displayElement.innerHTML = baseParticipantScreen(blockNumber, totalBlocks, block.condition);
  const slot = displayElement.querySelector(".screen-slot");
  slot.className = "screen-slot nature-screen";
  slot.innerHTML = `<div class="nature-content">
    ${natureIframe(block.youtubeVideoId, startPosition)}
    <button id="nature-start" class="primary-button nature-start" type="button" disabled>Loading YouTube player…</button>
    <p id="nature-status" role="status">Preparing viewing period ${block.videoPeriod}, continuing at ${durationLabel(startPosition)}.</p>
    <div id="nature-error-export" class="download-grid" hidden>
      <button id="nature-save-csv" class="secondary-button" type="button">Save partial CSV</button>
      <button id="nature-save-json" class="secondary-button" type="button">Save partial JSON</button>
    </div></div>`;
  const start = slot.querySelector("#nature-start");
  const status = slot.querySelector("#nature-status");
  let player = null;
  let started = false;
  let stopped = false;
  let requested = false;
  let onset = null;
  let poll = null;
  let timeout = null;
  let lastState = null;
  const details = () => ({
    block: blockNumber, block_type: "nature", condition: block.condition,
    video_period: block.videoPeriod, sequence_item_id: block.sequenceItemId,
    video_provider: "youtube", video_source: block.videoSource,
    youtube_video_id: block.youtubeVideoId, youtube_start_seconds: startPosition,
    media_time_seconds: round(Number(player?.getCurrentTime()) || startPosition),
    playback_mode: "youtube",
  });
  const stopTimers = () => { window.clearInterval(poll); window.clearTimeout(timeout); };
  const fail = (message) => {
    if (stopped) return;
    stopped = true;
    stopTimers();
    player?.pauseVideo?.();
    logEvent("video_playback_error", { ...details(), error_message: message });
    if (started) {
      const interrupted = { ...details(), record_type: "block_summary", completion_status: "interrupted",
        media_start_seconds: startPosition, media_end_seconds: Number(player.getCurrentTime()),
        scheduled_duration_ms: block.durationSeconds * 1000,
        actual_duration_ms: round(performance.now() - onset),
      };
      logEvent("video_playback_offset", interrupted);
      logEvent("block_offset", interrupted);
      sessionState.trials.push(interrupted);
    }
    logEvent("session_interrupted", { ...details(), reason: "nature_video_unavailable" });
    status.textContent = `${message} Session stopped here; no replacement footage or looping was used. Save the partial data before returning to setup or reloading.`;
    start.hidden = true;
    slot.querySelector("#nature-error-export").hidden = false;
  };
  slot.querySelector("#nature-save-csv").addEventListener("click", exportCsv);
  slot.querySelector("#nature-save-json").addEventListener("click", exportJson);
  const finish = () => {
    if (stopped) return;
    stopped = true;
    stopTimers();
    player.pauseVideo();
    // Save the observed media position, not a fresh start or a wall-clock guess.
    const endPosition = Number(player.getCurrentTime());
    sessionState.natureCursorSeconds = endPosition;
    const row = { ...details(), record_type: "block_summary", completion_status: "complete",
      scheduled_duration_ms: block.durationSeconds * 1000,
      actual_duration_ms: round(performance.now() - onset),
      media_start_seconds: startPosition, media_end_seconds: endPosition,
      media_played_seconds: round(endPosition - startPosition),
    };
    logEvent("video_playback_offset", row);
    logEvent("block_offset", row);
    sessionState.trials.push(row);
    player.destroy();
    jsPsych.finishTrial(row);
  };
  const inspect = () => {
    if (stopped || !player) return;
    const position = Number(player.getCurrentTime());
    if (started && position >= plannedEnd) finish();
  };
  timeout = window.setTimeout(() => fail("YouTube did not load in time."), 15000);
  loadYouTubeIframeApi().then((YT) => {
    if (stopped) return;
    player = new YT.Player(slot.querySelector("#nature-youtube"), { events: {
      onReady: () => {
        if (stopped) return;
        window.clearTimeout(timeout);
        player.mute();
        player.setPlaybackRate(1);
        // start= uses whole seconds; seekTo preserves the fractional resume point.
        player.seekTo(startPosition, true);
        start.disabled = false;
        start.textContent = "Start nature video";
        status.textContent = `Tap Start when ready. This period starts at ${durationLabel(startPosition)} and needs ${durationLabel(block.durationSeconds)} of video playback.`;
      },
      onStateChange: (event) => {
        if (stopped) return;
        if (event.data !== lastState) {
          logEvent("video_player_state", { ...details(), player_state: event.data });
          lastState = event.data;
        }
        if (event.data === YT.PlayerState.PLAYING) {
          // Seeking a cued player must never bypass the explicit Start button.
          if (!requested) { player.pauseVideo(); return; }
          window.clearTimeout(timeout);
          const remaining = sessionState.config.blocks.filter((b) => b.type === "nature" && b.videoPeriod >= block.videoPeriod)
            .reduce((sum, b) => sum + b.durationSeconds, 0);
          // Allow only sub-second polling/seek rounding at successive boundaries.
          const error = natureLengthError(Number(player.getDuration()), startPosition + remaining - 0.5);
          if (error) { fail(error); return; }
          if (!started) {
            started = true;
            onset = performance.now();
            logEvent("block_onset", details());
            logEvent("video_playback_onset", details());
            poll = window.setInterval(inspect, 50);
          }
          start.hidden = true;
          status.textContent = "Please watch the video, remain still, and breathe naturally.";
        } else if (event.data === YT.PlayerState.ENDED) {
          if (started && Number(player.getCurrentTime()) >= plannedEnd - 0.5) finish();
          else fail("The video ended before the requested viewing time was complete.");
        } else if (event.data === YT.PlayerState.PAUSED && started) {
          start.hidden = false;
          start.disabled = false;
          start.textContent = "Resume nature video";
          status.textContent = "Video paused. Viewing time does not advance while paused.";
        } else if (event.data === YT.PlayerState.BUFFERING && requested) {
          status.textContent = "Buffering video… Viewing time follows video playback, not the loading delay.";
        }
      },
      onError: (event) => fail(`YouTube playback failed (code ${event.data}).`),
      onAutoplayBlocked: () => {
        if (stopped) return;
        window.clearTimeout(timeout);
        start.hidden = false;
        start.disabled = false;
        start.textContent = "Tap to start video";
        status.textContent = "The browser blocked playback. Tap Start again.";
      },
    }});
  }).catch((error) => fail(error.message));
  start.addEventListener("click", () => {
    requested = true;
    start.disabled = true;
    start.textContent = "Starting…";
    timeout = window.setTimeout(() => fail("Video playback did not start in time."), 20000);
    player.playVideo();
  });
}
