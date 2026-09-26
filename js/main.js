import { Game, SCORE_TO_WIN } from './game.js';
import { audio } from './audio.js';
import { ICONS } from './hud.js';
import { DIFFICULTY } from './bot.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');

const prefs = (() => {
  try { return JSON.parse(localStorage.getItem('rivals-prefs') || '{}'); } catch { return {}; }
})();
const savePrefs = () => { try { localStorage.setItem('rivals-prefs', JSON.stringify(prefs)); } catch { /* 無視 */ } };

let selMap = prefs.map || 'arena';
let selDiff = prefs.diff || 'normal';

const game = new Game(canvas, {
  onMatchEnd: showResults,
  onPause: (p) => {
    $('pause').classList.toggle('hidden', !p);
    $('sens2').value = game.settings.sens;
    $('sens2Out').textContent = Number(game.settings.sens).toFixed(2);
  },
});

// ---------- ロードアウト表示 ----------
const LO = [
  { id: 'ar', cat: 'メインウェポン', name: 'アサルトライフル', desc: '胴体12 / 頭15 ・ 20発 + 予備100 ・ フルオート' },
  { id: 'pistol', cat: 'サブウェポン', name: 'ハンドガン', desc: '胴体12 / 頭15 ・ 13発 + 予備75 ・ セミオート' },
  { id: 'fist', cat: 'メレー', name: '拳', desc: '30ダメージ ・ 弾なし ・ 装備中は空中で1回ジャンプ' },
  { id: 'grenade', cat: 'ユーティリティ', name: 'グレネード', desc: '最大75ダメージ ・ クールタイム50秒' },
];
$('loadout').innerHTML = LO.map((w, i) => `
  <div class="lo-item"><span class="k">${i + 1}</span>${ICONS[w.id]}<div><span class="cat">${w.cat}</span><b>${w.name}</b><small>${w.desc}</small></div></div>`).join('');

// ---------- メニュー ----------
function selectMap(id) {
  selMap = id;
  document.querySelectorAll('.map-card').forEach((c) => c.classList.toggle('selected', c.dataset.map === id));
  game.previewMap(id);
  prefs.map = id; savePrefs();
}
document.querySelectorAll('.map-card').forEach((c) => c.addEventListener('click', () => { audio.init(); audio.swap(); selectMap(c.dataset.map); }));

function selectDiff(d) {
  selDiff = d;
  document.querySelectorAll('#diffSeg button').forEach((b) => b.classList.toggle('on', b.dataset.diff === d));
  prefs.diff = d; savePrefs();
}
document.querySelectorAll('#diffSeg button').forEach((b) => b.addEventListener('click', () => selectDiff(b.dataset.diff)));

function selectQuality(q) {
  document.querySelectorAll('#qualSeg button').forEach((b) => b.classList.toggle('on', b.dataset.q === q));
  game.setQuality(q);
  prefs.quality = q; savePrefs();
}
document.querySelectorAll('#qualSeg button').forEach((b) => b.addEventListener('click', () => selectQuality(b.dataset.q)));

function bindRange(id, outId, fmt, apply) {
  const el = $(id), out = $(outId);
  const upd = () => { out.textContent = fmt(Number(el.value)); apply(Number(el.value)); };
  el.addEventListener('input', upd);
  return (v) => { el.value = v; upd(); };
}
const setSens = bindRange('sens', 'sensOut', (v) => v.toFixed(2), (v) => { game.settings.sens = v; if (game.player) game.player.sens = v; prefs.sens = v; savePrefs(); });
bindRange('sens2', 'sens2Out', (v) => v.toFixed(2), (v) => { setSens(v); });
const setFov = bindRange('fov', 'fovOut', (v) => String(v), (v) => { game.settings.fov = v; prefs.fov = v; savePrefs(); });
const setVol = bindRange('vol', 'volOut', (v) => String(Math.round(v * 100)), (v) => { audio.setVolume(v); prefs.vol = v; savePrefs(); });

setSens(prefs.sens ?? 1);
setFov(prefs.fov ?? 78);
setVol(prefs.vol ?? 0.6);
selectDiff(selDiff);
selectQuality(prefs.quality || 'high');
selectMap(selMap);

// ---------- ポインターロック ----------
function lock() {
  const p = canvas.requestPointerLock?.({ unadjustedMovement: true });
  if (p && p.catch) p.catch(() => canvas.requestPointerLock?.());
}
const locked = () => document.pointerLockElement === canvas;

document.addEventListener('pointerlockchange', () => {
  const inMatch = ['countdown', 'playing', 'roundEnd'].includes(game.state);
  if (!inMatch) return;
  if (locked()) { game.setPaused(false); $('clickToPlay').classList.add('hidden'); }
  else game.setPaused(true);
});

function startMatch() {
  audio.init();
  $('menu').classList.add('hidden');
  $('results').classList.add('hidden');
  $('pause').classList.add('hidden');
  game.startMatch(selMap, selDiff);
  lock();
}
$('startBtn').addEventListener('click', startMatch);
$('againBtn').addEventListener('click', startMatch);
$('resumeBtn').addEventListener('click', () => { audio.init(); lock(); });
$('quitBtn').addEventListener('click', toMenu);
$('menuBtn').addEventListener('click', toMenu);

function toMenu() {
  $('pause').classList.add('hidden');
  $('results').classList.add('hidden');
  $('menu').classList.remove('hidden');
  game.quitToMenu();
  game.previewMap(selMap);
  if (locked()) document.exitPointerLock();
}

function showResults({ result, score, stats, botStats }) {
  if (locked()) document.exitPointerLock();
  setTimeout(() => {
    const t = $('resTitle');
    t.textContent = result === 'win' ? '勝利' : result === 'lose' ? '敗北' : '引き分け';
    t.className = 'res-title ' + result;
    $('resScore').innerHTML = `<span class="blue">${score.blue}</span> - <span class="red">${score.red}</span>`;
    const acc = (s) => (s.shots ? Math.round((s.hits / s.shots) * 100) : 0) + '%';
    const rows = [
      ['キル', stats.kills, botStats.kills],
      ['与ダメージ', stats.damage, botStats.damage],
      ['命中率', acc(stats), acc(botStats)],
      ['ヘッドショット', stats.heads, botStats.heads],
    ];
    $('resStats').innerHTML = `<span class="h">${DIFFICULTY[selDiff].label} ・ 先取${SCORE_TO_WIN}</span><span class="h">YOU</span><span class="h">RIVAL</span>` +
      rows.map(([k, a, b]) => `<span>${k}</span><span class="v b">${a}</span><span class="v r">${b}</span>`).join('');
    $('results').classList.remove('hidden');
  }, 1200);
}

// ---------- 入力 ----------
const playing = () => game.player && locked() && !game.paused && game.state !== 'menu' && game.state !== 'matchEnd';

document.addEventListener('keydown', (e) => {
  if (!playing()) return;
  if (['Space', 'Tab'].includes(e.code) || e.ctrlKey) e.preventDefault();
  if (e.repeat) return;
  game.player.onKeyDown(e);
});
document.addEventListener('keyup', (e) => { if (game.player) game.player.onKeyUp(e); });
document.addEventListener('mousedown', (e) => {
  if (playing()) game.player.onMouseDown(e);
  else if (['countdown', 'playing', 'roundEnd'].includes(game.state) && !locked() && e.target === canvas) lock();
});
document.addEventListener('mouseup', (e) => { if (game.player) game.player.onMouseUp(e); });
document.addEventListener('mousemove', (e) => { if (playing()) game.player.onMouseMove(e); });
document.addEventListener('wheel', (e) => { if (playing()) game.player.onWheel(e); }, { passive: true });
document.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => game.player?.releaseAll());

// デバッグ・テスト用
window.__game = game;
