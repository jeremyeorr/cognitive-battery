const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function harness() {
  const nodes = new Map();
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', checked: false, hidden: false, disabled: false, innerHTML: '', textContent: '',
      listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; },
      querySelector: node, click() { this.listeners.click?.({}); },
    });
    return nodes.get(selector);
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const tag of html.matchAll(/<input\b[^>]*>/g)) {
    const id = tag[0].match(/id="([^"]+)"/);
    if (!id) continue;
    node('#' + id[1]).value = tag[0].match(/value="([^"]*)"/)?.[1] || '';
    node('#' + id[1]).checked = /\bchecked\b/.test(tag[0]);
  }
  node('#pvsat-choice-count').value = '3';
  const timers = new Map();
  const intervals = new Map();
  const players = [];
  const events = [];
  let timerId = 0;
  let now = 0;
  class Player {
    constructor(target, options) {
      this.events = options.events; this.time = 0; this.duration = 10000;
      this.state = -1; this.playCalls = 0; players.push(this);
    }
    ready() { this.events.onReady({ target: this }); }
    emit(state) { this.state = state; this.events.onStateChange({ target: this, data: state }); }
    getDuration() { return this.duration; }
    getCurrentTime() { return this.time; }
    getPlayerState() { return this.state; }
    playVideo() { this.playCalls++; }
    pauseVideo() { this.state = 2; }
    seekTo(time) { this.time = time; }
    setPlaybackRate() {}
    mute() {}
    destroy() { this.destroyed = true; }
  }
  const ctx = vm.createContext({
    URL, URLSearchParams, Date, Math, console,
    document: { querySelector: node },
    jsPsychModule: { ParameterType: {} },
    performance: { now: () => now },
    window: {
      location: { origin: 'http://localhost:8791' }, scrollTo() {},
      YT: { Player, PlayerState: { PLAYING: 1, PAUSED: 2, BUFFERING: 3, ENDED: 0 } },
      setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
      clearTimeout(id) { timers.delete(id); },
      setInterval(fn) { intervals.set(++timerId, fn); return timerId; },
      clearInterval(id) { intervals.delete(id); },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'nature-video.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ctx);
  const state = vm.runInContext('sessionState', ctx);
  ctx.logEvent = (event, details) => events.push({ event, ...details });
  let readyConfig = null;
  ctx.showReadyScreen = (config) => { readyConfig = config; };
  return { ctx, node, state, events, players, timers, intervals,
    ready: () => readyConfig,
    async flush() { await Promise.resolve(); await Promise.resolve(); },
    tick(ms = 50) { now += ms; for (const fn of [...intervals.values()]) fn(); },
  };
}

test('default sequence brackets the requested task order with two 6-minute videos', () => {
  const h = harness(); const c = h.ctx.readConfig();
  assert.equal(c.natureVideoCount, 2);
  assert.equal(c.natureVideoSeconds, 360);
  assert.equal(c.blocks[0].type, 'nature');
  assert.equal(c.blocks.at(-1).type, 'nature');
  assert.deepEqual(Array.from(c.sequenceEntries, e => e.type === 'nature' ? 'nature' : e.taskKey),
    ['nature', 'reaction', 'pvsat', 'stroop', 'trail_a', 'trail_b', 'corsi', 'nature']);
  assert.deepEqual(Array.from(c.blocks.filter(b => !['rest', 'practice'].includes(b.type)), b => b.type),
    ['nature', 'reaction', 'pvsat', 'pvsat', 'pvsat', 'stroop', 'trail_a', 'trail_b', 'corsi', 'nature']);
  assert.equal(c.requiredYoutubeEndSeconds, 732);
  assert.equal(c.youtubeStartSeconds, 12);
});

test('demo feedback defaults off but can be enabled; pacing follows entered order without a selector', () => {
  const h = harness();
  h.node('#demo-mode').checked = true;
  assert.equal(h.ctx.readConfig().demoFeedback, false);
  h.node('#demo-feedback').checked = true;
  assert.equal(h.ctx.readConfig().demoFeedback, true);
  h.node('#pacing-values').value = '2, 4, 3';
  assert.deepEqual(Array.from(h.ctx.readConfig().blocks.filter(b => b.type === 'pvsat'), b => b.paceSeconds), [2, 4, 3]);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /id="order-method"/);
});

test('add/remove/reorder and duration changes recompute total, including in demo', () => {
  const h = harness();
  h.ctx.addNatureVideo();
  h.node('#nature-video-duration').value = '7';
  h.node('#demo-mode').checked = true;
  let c = h.ctx.readConfig();
  assert.equal(c.requiredYoutubeEndSeconds, 1272);
  assert.equal(c.natureVideoSeconds, 10);
  for (let i = 0; i < 8; i++) h.ctx.moveSequenceEntry('nature-3', -1);
  c = h.ctx.readConfig();
  assert.equal(c.blocks[0].type, 'nature');
  assert.deepEqual(Array.from(c.blocks.filter(b => b.type === 'nature'), b => b.videoPeriod), [1, 2, 3]);
  h.ctx.removeNatureVideo('nature-3');
  assert.equal(h.ctx.readConfig().requiredYoutubeEndSeconds, 852);
  h.node('#nature-video-duration').value = '0';
  assert.throws(() => h.ctx.readConfig(), /duration must/);
});

test('length boundary requires offset plus ALL minutes and rejects unknown length', () => {
  const h = harness();
  assert.equal(h.ctx.natureLengthError(732, 732), null);
  for (const length of [731.99, 0, NaN, Infinity]) {
    assert.ok(h.ctx.natureLengthError(length, 732));
  }
  const u = new URL(h.ctx.natureEmbedUrl('AKeUssuu3Is', 372.25));
  assert.equal(u.searchParams.get('start'), '372');
  assert.equal(u.searchParams.get('autoplay'), '0');
  assert.equal(u.searchParams.has('loop'), false);
});

test('every added or reordered video retains Tap Start in both setup previews', () => {
  const h = harness();
  h.ctx.addNatureVideo();
  h.ctx.addNatureVideo();
  h.ctx.moveSequenceEntry('nature-4', -1);
  for (const demo of [false, true]) {
    h.node('#demo-mode').checked = demo;
    h.ctx.updatePreview();
    for (const selector of ['#task-order', '#block-preview']) {
      const rows = h.node(selector).innerHTML.match(/<li\b[^>]*>[\s\S]*?<\/li>/g)
        .filter(row => /Nature video/.test(row));
      assert.equal(rows.length, 4);
      rows.forEach(row => assert.match(row, /Tap Start when ready/));
    }
  }
});

test('preflight waits for a manual click and actual playback; records verified duration', async () => {
  const h = harness(); const c = h.ctx.readConfig();
  h.ctx.showNatureVideoCheck(c); await h.flush();
  const p = h.players[0]; p.duration = 732; p.ready();
  assert.equal(p.playCalls, 0); assert.equal(h.ready(), null);
  h.node('#video-check-play').click();
  assert.equal(p.playCalls, 1); assert.equal(h.ready(), null);
  p.emit(1);
  assert.equal(h.ready(), c);
  assert.equal(c.youtubeDurationSeconds, 732);
  assert.equal(p.destroyed, true);
  assert.equal(h.intervals.size, 0); assert.equal(h.timers.size, 0);
});

test('too-short or failed preflight cannot advance on a late player event', async () => {
  const h = harness();
  h.ctx.showNatureVideoCheck(h.ctx.readConfig()); await h.flush();
  const p = h.players[0]; p.duration = 731; p.ready();
  assert.match(h.node('#video-check-status').textContent, /Choose a longer video/);
  p.duration = 1000; p.emit(1); h.tick();
  assert.equal(h.ready(), null);
  h.node('#video-check-back').click();
  assert.equal(p.destroyed, true);
  assert.equal(h.node('#setup-root').hidden, false);
});

test('unknown metadata and API timeout block launch safely', async () => {
  const h = harness();
  h.ctx.showNatureVideoCheck(h.ctx.readConfig()); await h.flush();
  const p = h.players[0]; p.duration = 0; p.ready();
  h.node('#video-check-play').click(); p.emit(1); h.tick();
  assert.equal(h.ready(), null);
  for (const fn of [...h.timers.values()]) fn();
  assert.match(h.node('#video-check-status').textContent, /Could not verify/);
  p.duration = 1000; p.emit(1);
  assert.equal(h.ready(), null);
});

async function startPeriod(h, period, duration = 10) {
  const block = { type: 'nature', condition: `Nature video ${period}`, videoPeriod: period,
    durationSeconds: duration, videoProvider: 'youtube', youtubeVideoId: 'AKeUssuu3Is',
    youtubeStartSeconds: 12, videoSource: 'https://youtu.be/AKeUssuu3Is?t=12' };
  const rows = [];
  h.ctx.runContinuousYouTubeNature(h.node('#display'), { block, blockNumber: period, totalBlocks: 3 }, {
    finishTrial(row) { rows.push(row); },
  });
  await h.flush();
  const p = h.players.at(-1); p.ready();
  return { p, rows };
}

test('three periods resume exact prior stops; pause/buffering and ready screen consume no viewing time', async () => {
  const h = harness();
  h.state.config = { blocks: [1,2,3].map(videoPeriod => ({ type: 'nature', videoPeriod, durationSeconds: 10 })) };
  h.state.natureCursorSeconds = 12;
  for (let period = 1; period <= 3; period++) {
    const expected = h.state.natureCursorSeconds;
    const { p, rows } = await startPeriod(h, period);
    assert.equal(p.time, expected); assert.equal(p.playCalls, 0);
    assert.equal(h.node('#nature-start').disabled, false);
    assert.equal(h.node('#nature-start').textContent, 'Start nature video');
    assert.match(h.node('#nature-status').textContent, /paused until you tap/);
    p.emit(1); // unexpected play before Start is suppressed
    assert.equal(p.state, 2);
    assert.equal(h.events.filter(e => e.event === 'block_onset').length, period - 1);
    h.node('#nature-start').click(); p.emit(1);
    p.time += 3; p.emit(3); h.tick(60000); assert.equal(rows.length, 0);
    p.emit(2); h.tick(60000); assert.equal(rows.length, 0);
    assert.equal(h.node('#nature-start').hidden, false);
    h.node('#nature-start').click(); p.emit(1);
    p.time = expected + 10.025; h.tick();
    assert.equal(rows.length, 1);
    assert.equal(h.state.natureCursorSeconds, expected + 10.025);
    assert.equal(rows[0].media_start_seconds, expected);
    assert.equal(rows[0].media_end_seconds, p.time);
    assert.equal(h.intervals.size, 0); assert.equal(h.timers.size, 0);
  }
  assert.equal(h.state.trials.length, 3);
});

test('early ending or runtime error halts progression, offers partial export, never loops', async () => {
  const h = harness();
  h.state.config = { blocks: [{ type: 'nature', videoPeriod: 1, durationSeconds: 10 }] };
  h.state.natureCursorSeconds = 12;
  const { p, rows } = await startPeriod(h, 1);
  h.node('#nature-start').click(); p.emit(1); p.time = 15; p.emit(0);
  assert.equal(rows.length, 0); assert.equal(p.playCalls, 1);
  assert.equal(h.node('#nature-error-export').hidden, false);
  assert.ok(h.events.some(e => e.event === 'session_interrupted'));
  assert.equal(h.state.trials.at(-1).completion_status, 'interrupted');
  assert.ok(h.events.some(e => e.event === 'block_offset' && e.completion_status === 'interrupted'));
  assert.equal(h.intervals.size, 0);
  p.time = 30; p.emit(1); h.tick(); assert.equal(rows.length, 0);
});

test('runtime rechecks remaining source length before counting playback', async () => {
  const h = harness();
  h.state.config = { blocks: [1, 2].map(videoPeriod => ({ type: 'nature', videoPeriod, durationSeconds: 10 })) };
  h.state.natureCursorSeconds = 12;
  const { p, rows } = await startPeriod(h, 1);
  p.duration = 25;
  h.node('#nature-start').click(); p.emit(1);
  assert.equal(rows.length, 0);
  assert.equal(h.events.some(e => e.event === 'block_onset'), false);
  assert.match(h.node('#nature-status').textContent, /Choose a longer video/);
});
