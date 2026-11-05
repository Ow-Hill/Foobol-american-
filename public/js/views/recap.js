import { esc, n1, pct } from '../util.js';
import { card, histLoading } from '../ui.js';

const G = '#3ddc84';
const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const eb = (x) => { const t = Math.min(1, Math.max(0, x)); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

function standingsThrough(HM, season, wk) {
  const rows = {};
  for (const t of HM.seasons[season].teams) rows[t.ownerId] = { owner: t.owner, w: 0, l: 0, pf: 0 };
  for (const g of HM.games) {
    if (g.season !== season || g.wk > wk || g.period !== 'regular') continue;
    for (const [s, o] of [[g.a, g.b], [g.b, g.a]]) {
      const r = rows[s.ownerId];
      if (!r) continue;
      r.pf += s.pts;
      if (s.pts > o.pts) r.w++;
      else if (s.pts < o.pts) r.l++;
    }
  }
  return Object.values(rows).sort((a, b) => b.w - a.w || b.pf - a.pf);
}

export function buildScenes(M, HM, season, wk) {
  const f = HM.weekFacts(season, wk);
  const league = M.snap.league.name.toUpperCase();
  const meP = Object.values(HM.people).find((p) => p.name === M.me.owner);
  const myGame = meP && f.games.find((g) => g.a.ownerId === meP.id || g.b.ownerId === meP.id);
  const feat = myGame || f.games.slice().sort((a, b) => b.a.pts + b.b.pts - (a.a.pts + a.b.pts))[0];
  const stand = standingsThrough(HM, season, wk);
  const nextWk = wk + 1;
  const nextMu = (M.snap.matchups[nextWk] || M.snap.matchups[M.W] || []);
  return [
    { dur: 3.2, draw: sceneTitle(league, season, wk) },
    { dur: 5, draw: sceneGame(myGame ? 'YOUR MATCHUP' : 'GAME OF THE WEEK', feat, meP) },
    f.closest ? { dur: 4, draw: sceneGame('NAIL-BITER', f.closest, null, `DECIDED BY ${f.closest.margin.toFixed(2)}`) } : null,
    f.blowout ? { dur: 3.8, draw: sceneBig('BEATDOWN', f.blowout.margin, `${f.blowout.winner.owner} routed ${f.blowout.loser.owner}`, `${n1(f.blowout.winner.pts)} – ${n1(f.blowout.loser.pts)}`, '#ff7b7b', 'POINT MARGIN') } : null,
    { dur: 5.2, draw: sceneTop(f.topPlayers) },
    f.blunder && f.blunder.left > 5 ? { dur: 3.8, draw: sceneBig('LEFT ON THE BENCH', f.blunder.left, f.blunder.owner, `scored ${n1(f.blunder.pts)} · best possible ${n1(f.blunder.opt)}`, '#f6b94a', 'POINTS WASTED') } : null,
    { dur: 3.6, draw: sceneBig('HIGH SCORE', f.top.pts, f.top.owner, f.top.teamName, G, 'POINTS') },
    { dur: 6, draw: sceneStandings(stand, wk, meP, M) },
    { dur: 3.8, draw: sceneOutro(league, nextWk, M) },
  ].filter(Boolean);
}

// ---------- drawing helpers ----------
function bg(c, w, h, t) {
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#07110c');
  g.addColorStop(0.6, '#0a1620');
  g.addColorStop(1, '#0a0e13');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.save();
  c.globalAlpha = 0.07;
  c.strokeStyle = '#fff';
  c.lineWidth = 2;
  const gap = Math.min(w, h) / 9;
  const off = (t * 20) % gap;
  for (let y = -gap + off; y < h + gap; y += gap) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  c.restore();
  c.save();
  c.globalAlpha = 0.12;
  c.fillStyle = G;
  c.beginPath();
  c.arc(w * 0.9, h * 0.1, Math.min(w, h) * 0.35 + Math.sin(t) * 12, 0, 7);
  c.fill();
  c.restore();
}
function txt(c, s, x, y, { size = 40, weight = 800, color = '#fff', align = 'center', alpha = 1, maxW = 0, font = 'system-ui, -apple-system, Segoe UI, sans-serif' } = {}) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'middle';
  let sz = size;
  c.font = `${weight} ${sz}px ${font}`;
  if (maxW) while (c.measureText(s).width > maxW && sz > 10) { sz -= 2; c.font = `${weight} ${sz}px ${font}`; }
  c.fillText(String(s), x, y);
  c.restore();
}
const rr = (c, x, y, w, h, r) => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};
const fade = (p) => Math.min(1, p * 8, (1 - p) * 8);

function sceneTitle(league, season, wk) {
  return (c, p, w, h, t) => {
    const s = Math.min(w, h) / 720;
    const a = fade(p);
    c.save();
    c.translate(w / 2, h * 0.3);
    c.rotate(-0.6 + p * 0.5);
    c.globalAlpha = a;
    c.fillStyle = G;
    c.beginPath();
    c.ellipse(0, 0, 90 * s * eb(p * 3), 52 * s * eb(p * 3), 0, 0, 7);
    c.fill();
    c.strokeStyle = '#07110c';
    c.lineWidth = 5 * s;
    c.beginPath();
    c.moveTo(-34 * s, 0); c.lineTo(34 * s, 0);
    for (let i = -2; i <= 2; i++) { c.moveTo(i * 14 * s, -10 * s); c.lineTo(i * 14 * s, 10 * s); }
    c.stroke();
    c.restore();
    txt(c, 'WEEK ' + wk, w / 2, h * 0.5 + (1 - eo(p * 2.5)) * 60 * s, { size: 120 * s, alpha: a, maxW: w * 0.9 });
    txt(c, 'RECAP', w / 2, h * 0.62 + (1 - eo(p * 2.2)) * 60 * s, { size: 64 * s, color: G, alpha: a, weight: 900 });
    txt(c, league, w / 2, h * 0.75, { size: 30 * s, color: '#9db0c4', alpha: a * eo(p * 3), maxW: w * 0.9 });
    txt(c, season + ' SEASON', w / 2, h * 0.8, { size: 22 * s, color: '#5f7186', alpha: a * eo(p * 3) });
  };
}

function sceneGame(label, g, meP, sub) {
  return (c, p, w, h) => {
    const s = Math.min(w, h) / 720;
    const a = fade(p);
    const vertical = h > w;
    const mineIsA = meP && g.a.ownerId === meP.id;
    const L = meP ? (mineIsA ? g.a : g.b) : g.winner || g.a;
    const R = L === g.a ? g.b : g.a;
    const k = eo(p * 2.2);
    txt(c, label, w / 2, h * 0.12, { size: 40 * s, color: G, alpha: a, weight: 900 });
    const cy = vertical ? [h * 0.32, h * 0.62] : [h * 0.5, h * 0.5];
    const cx = vertical ? [w / 2, w / 2] : [w * 0.27, w * 0.73];
    const count = eo(p * 1.8);
    [[L, 0], [R, 1]].forEach(([t, i]) => {
      const x = cx[i] + (vertical ? 0 : (i ? 1 : -1) * (1 - k) * 200 * s);
      const y = cy[i] + (vertical ? (i ? 1 : -1) * (1 - k) * 160 * s : 0);
      const win = t.pts > (i ? L.pts : R.pts);
      txt(c, t.owner, x, y - 80 * s, { size: 38 * s, alpha: a, maxW: w * (vertical ? 0.85 : 0.42) });
      txt(c, t.teamName, x, y - 44 * s, { size: 20 * s, color: '#7e92a8', alpha: a, maxW: w * 0.4, weight: 500 });
      txt(c, n1(t.pts * count), x, y + 30 * s, { size: 110 * s, color: p > 0.65 ? (win ? G : '#ff6b6b') : '#fff', alpha: a, font: 'ui-monospace, Menlo, monospace', weight: 700 });
    });
    if (p > 0.62) {
      const stampP = eb((p - 0.62) * 4);
      const iWin = L.pts > R.pts;
      c.save();
      c.translate(w / 2, vertical ? h * 0.47 : h * 0.78);
      c.rotate(-0.07);
      c.scale(stampP, stampP);
      c.globalAlpha = a;
      const col = meP ? (iWin ? G : '#ff6b6b') : G;
      const label2 = meP ? (iWin ? 'WIN' : 'LOSS') : `${(L.pts > R.pts ? L : R).owner} WINS`.toUpperCase();
      c.strokeStyle = col;
      c.lineWidth = 6 * s;
      c.font = `900 ${50 * s}px system-ui, sans-serif`;
      const tw = c.measureText(label2).width + 50 * s;
      rr(c, -tw / 2, -40 * s, tw, 80 * s, 12 * s);
      c.stroke();
      txt(c, label2, 0, 0, { size: 50 * s, color: col, weight: 900 });
      c.restore();
    }
    if (sub) txt(c, sub, w / 2, h * 0.9, { size: 28 * s, color: '#f6b94a', alpha: a * eo((p - 0.4) * 3), weight: 800 });
  };
}

function sceneBig(label, value, who, sub, color, unit) {
  return (c, p, w, h) => {
    const s = Math.min(w, h) / 720;
    const a = fade(p);
    txt(c, label, w / 2, h * 0.2, { size: 50 * s, color, alpha: a, weight: 900 });
    txt(c, n1(value * eo(p * 1.6)), w / 2, h * 0.47, { size: 190 * s, color: '#fff', alpha: a, font: 'ui-monospace, Menlo, monospace', weight: 700 });
    txt(c, unit, w / 2, h * 0.62, { size: 22 * s, color: '#7e92a8', alpha: a, weight: 700 });
    txt(c, who, w / 2, h * 0.75, { size: 44 * s, alpha: a * eo((p - 0.15) * 4), maxW: w * 0.9 });
    txt(c, sub, w / 2, h * 0.82, { size: 24 * s, color: '#9db0c4', alpha: a * eo((p - 0.25) * 4), weight: 500, maxW: w * 0.9 });
  };
}

function sceneTop(list) {
  return (c, p, w, h) => {
    const s = Math.min(w, h) / 720;
    const a = fade(p);
    txt(c, 'TOP PERFORMERS', w / 2, h * 0.12, { size: 46 * s, color: G, alpha: a, weight: 900 });
    const max = Math.max(...list.map((x) => x.pts), 1);
    const left = w * 0.08;
    const bw = w * 0.84;
    const top = h * 0.24;
    const rowH = (h * 0.64) / Math.max(list.length, 1);
    list.forEach((x, i) => {
      const q = eo((p - 0.08 * i - 0.05) * 2.4);
      const y = top + i * rowH;
      c.save();
      c.globalAlpha = a * q;
      c.fillStyle = '#16212d';
      rr(c, left, y, bw, rowH * 0.78, 12 * s);
      c.fill();
      c.fillStyle = i === 0 ? G : '#2b6b4a';
      rr(c, left, y, Math.max(20 * s, (bw * (x.pts / max)) * q), rowH * 0.78, 12 * s);
      c.fill();
      c.restore();
      txt(c, `${x.n}`, left + 20 * s, y + rowH * 0.28, { size: 30 * s, align: 'left', alpha: a * q, maxW: bw * 0.7, color: i === 0 ? '#07140d' : '#fff' });
      txt(c, `${x.pos} · ${x.owner}`, left + 20 * s, y + rowH * 0.55, { size: 18 * s, align: 'left', alpha: a * q, weight: 500, color: i === 0 ? '#0a3a22' : '#a9bacb', maxW: bw * 0.7 });
      txt(c, n1(x.pts * q), left + bw - 20 * s, y + rowH * 0.39, { size: 40 * s, align: 'right', alpha: a * q, font: 'ui-monospace, Menlo, monospace', color: '#fff' });
    });
  };
}

function sceneStandings(rows, wk, meP, M) {
  return (c, p, w, h) => {
    const s = Math.min(w, h) / 720;
    const a = fade(p);
    txt(c, `STANDINGS AFTER WEEK ${wk}`, w / 2, h * 0.09, { size: 40 * s, color: G, alpha: a, weight: 900, maxW: w * 0.92 });
    const top = h * 0.17;
    const rowH = (h * 0.76) / rows.length;
    rows.forEach((r, i) => {
      const q = eo((p - 0.045 * i) * 2.6);
      const y = top + i * rowH;
      const me = meP && r.owner === meP.name;
      c.save();
      c.globalAlpha = a * q;
      c.translate((1 - q) * 120 * s, 0);
      c.fillStyle = me ? '#17402b' : i < 6 ? '#142029' : '#10171f';
      rr(c, w * 0.08, y, w * 0.84, rowH * 0.82, 10 * s);
      c.fill();
      c.restore();
      const al = a * q;
      txt(c, i + 1, w * 0.12, y + rowH * 0.41, { size: 28 * s, alpha: al, color: i < 2 ? G : '#7e92a8', font: 'ui-monospace, Menlo, monospace' });
      txt(c, r.owner, w * 0.17, y + rowH * 0.41, { size: 28 * s, align: 'left', alpha: al, maxW: w * 0.4, color: me ? G : '#fff' });
      txt(c, `${r.w}-${r.l}`, w * 0.66, y + rowH * 0.41, { size: 28 * s, alpha: al, font: 'ui-monospace, Menlo, monospace' });
      txt(c, n1(r.pf), w * 0.88, y + rowH * 0.41, { size: 24 * s, align: 'right', alpha: al, color: '#9db0c4', font: 'ui-monospace, Menlo, monospace', weight: 600 });
    });
  };
}

function sceneOutro(league, nextWk, M) {
  const opp = M.opp;
  const pw = opp ? M.winProb(M.me.id, opp.id, [M.myOpt, M.oppOpt]) : null;
  return (c, p, w, h) => {
    const s = Math.min(w, h) / 720;
    const a = Math.min(1, p * 6, (1 - p) * 3);
    txt(c, 'NEXT UP', w / 2, h * 0.25, { size: 40 * s, color: G, alpha: a, weight: 900 });
    txt(c, 'WEEK ' + nextWk, w / 2, h * 0.4, { size: 130 * s, alpha: a * eo(p * 3) });
    if (opp) {
      txt(c, `${M.me.owner} vs ${opp.owner}`, w / 2, h * 0.58, { size: 38 * s, alpha: a * eo((p - 0.2) * 3), maxW: w * 0.9 });
      txt(c, `${pct(pw)} win chance on projections`, w / 2, h * 0.66, { size: 26 * s, color: '#9db0c4', alpha: a * eo((p - 0.3) * 3), weight: 500 });
    }
    txt(c, league, w / 2, h * 0.86, { size: 24 * s, color: '#5f7186', alpha: a, maxW: w * 0.9 });
  };
}

// ---------- view ----------
export function render(M, ctx) {
  const wait = histLoading(ctx);
  if (wait) return `<div class="page-h"><div><h1>Video recaps</h1></div></div>${wait}`;
  const HM = ctx.HM;
  const season = M.snap.meta.season;
  const ui = (ctx.ui.recap ||= { wk: null, vertical: false });
  const last = HM.lastWeek(season);
  const wk = ui.wk && ui.wk <= last ? ui.wk : last;
  const wkOpts = Array.from({ length: last }, (_, i) => last - i).map((w) => `<option value="${w}" ${w === wk ? 'selected' : ''}>Week ${w}</option>`).join('');
  const canRec = typeof MediaRecorder !== 'undefined';
  return `<div class="page-h"><div><h1>Video recaps</h1><p>Turn any week into a shareable league video: your matchup, the nail-biter, the beatdown, top performers, bench blunders and the standings — animated and ready to download.</p></div>
  <div class="btn-row"><select id="rcWeek" aria-label="Week">${wkOpts}</select><select id="rcFmt" aria-label="Format"><option value="h" ${ui.vertical ? '' : 'selected'}>Widescreen 16:9</option><option value="v" ${ui.vertical ? 'selected' : ''}>Vertical 9:16 (stories)</option></select></div></div>
  ${card(`Week ${wk} recap`, `<canvas id="rcCanvas" class="recap ${ui.vertical ? 'vertical' : ''}" width="${ui.vertical ? 720 : 1280}" height="${ui.vertical ? 1280 : 720}" role="img" aria-label="Animated recap video for week ${wk}"></canvas>
  <div class="progress"><span id="rcBar"></span></div>
  <div class="btn-row"><button class="btn" id="rcPlay">▶ Play</button><button class="btn" id="rcRestart">↺ Restart</button><button class="btn" id="rcRec" ${canRec ? '' : 'disabled'}>⬤ Record & download video</button><span class="muted" id="rcStatus"></span></div>
  <p class="note">${canRec ? 'Recording plays the whole recap in real time (about 40 seconds) and saves a .webm file you can post to chat or socials.' : 'Your browser can\u2019t record video; use screen capture instead.'} Every number comes from the week's actual results.</p>`, { sub: 'Built in your browser — nothing is uploaded' })}`;
}

export function mount(root, M, ctx) {
  const HM = ctx.HM;
  if (!HM) return;
  const ui = ctx.ui.recap;
  const season = M.snap.meta.season;
  const last = HM.lastWeek(season);
  const wk = ui.wk && ui.wk <= last ? ui.wk : last;
  root.querySelector('#rcWeek')?.addEventListener('change', (e) => ((ui.wk = Number(e.target.value)), ctx.rerender()));
  root.querySelector('#rcFmt')?.addEventListener('change', (e) => ((ui.vertical = e.target.value === 'v'), ctx.rerender()));
  const canvas = root.querySelector('#rcCanvas');
  if (!canvas) return;
  const c = canvas.getContext('2d');
  const scenes = buildScenes(M, HM, season, wk);
  const total = scenes.reduce((s, x) => s + x.dur, 0);
  const frame = (t) => {
    let acc = 0;
    t = Math.min(Math.max(t, 0), total - 0.001);
    for (const sc of scenes) {
      if (t < acc + sc.dur) {
        bg(c, canvas.width, canvas.height, t);
        sc.draw(c, (t - acc) / sc.dur, canvas.width, canvas.height, t);
        return;
      }
      acc += sc.dur;
    }
  };
  let playing = false;
  let t0 = 0;
  let offset = 0;
  let recorder = null;
  let track = null;
  const bar = root.querySelector('#rcBar');
  const playBtn = root.querySelector('#rcPlay');
  const status = root.querySelector('#rcStatus');
  const stop = () => {
    playing = false;
    playBtn.textContent = '▶ Play';
  };
  const tick = (now) => {
    if (!playing) return;
    const t = offset + (now - t0) / 1000;
    if (t >= total) {
      frame(total - 0.01);
      track?.requestFrame?.();
      bar.style.width = '100%';
      stop();
      offset = 0;
      if (recorder) { const r = recorder; recorder = null; track = null; setTimeout(() => r.stop(), 250); }
      return;
    }
    frame(t);
    track?.requestFrame?.();
    bar.style.width = (t / total) * 100 + '%';
  };
  const timer = setInterval(() => {
    if (!canvas.isConnected) return clearInterval(timer);
    tick(performance.now());
  }, 33);
  frame(1.6);
  const start = () => {
    playing = true;
    t0 = performance.now();
    playBtn.textContent = '❚❚ Pause';
  };
  playBtn.addEventListener('click', () => {
    if (playing) { offset += (performance.now() - t0) / 1000; stop(); }
    else start();
  });
  root.querySelector('#rcRestart').addEventListener('click', () => { offset = 0; start(); });
  root.querySelector('#rcRec')?.addEventListener('click', () => {
    if (recorder) return;
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const stream = canvas.captureStream(30);
    track = stream.getVideoTracks()[0];
    const chunks = [];
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `week-${wk}-recap.webm`;
      a.click();
      status.textContent = `Saved week-${wk}-recap.webm (${(blob.size / 1e6).toFixed(1)} MB)`;
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    status.textContent = 'Recording… keep this tab in view until it finishes';
    recorder.start(250);
    offset = 0;
    start();
  });
}
