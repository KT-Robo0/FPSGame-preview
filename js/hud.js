import * as THREE from 'three';
import { WEAPONS, SLOT_ORDER } from './weapons.js';
import { MAX_HEALTH } from './fighter.js';

const $ = (id) => document.getElementById(id);

export const ICONS = {
  ar: '<svg viewBox="0 0 120 40"><path d="M4 16h14l2-4h40l2-3h14l2 3h26v6h8v5h-8v3H74l-4 3-2 10h-9l1-9-6-1-4 9h-9l3-12H22l-4 5H6l2-6H4z"/></svg>',
  pistol: '<svg viewBox="0 0 80 50"><path d="M8 8h62v5h4v6H52l-3 3-1 3h-9l-2-3-5 1-6 22H12l7-24-11-2z"/></svg>',
  fist: '<svg viewBox="0 0 60 60"><path d="M14 22c0-4 3-7 7-7h4c1-3 3-5 6-5h3c3 0 5 2 6 4 3-1 7 1 8 4 3 0 6 3 6 6v12c0 9-7 16-16 16H27c-7 0-13-6-13-13z"/><path d="M8 26c3-2 7-1 8 2l2 8-6 2-5-7c-1-2-1-4 1-5z"/></svg>',
  grenade: '<svg viewBox="0 0 50 60"><ellipse cx="25" cy="37" rx="17" ry="20"/><rect x="18" y="10" width="14" height="10" rx="2"/><path d="M30 12l12-6 3 4-12 7z"/><circle cx="14" cy="10" r="5" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
};

export class HUD {
  constructor() {
    this.el = $('hud');
    this.hpFill = $('hpFill');
    this.hpGhost = $('hpGhost');
    this.hpText = $('hpText');
    this.mag = $('mag');
    this.reserve = $('reserve');
    this.weaponName = $('weaponName');
    this.timer = $('timer');
    this.scoreBlue = $('scoreBlue');
    this.scoreRed = $('scoreRed');
    this.cross = $('crosshair');
    this.hitmarker = $('hitmarker');
    this.banner = $('banner');
    this.killfeed = $('killfeed');
    this.toastEl = $('toast');
    this.vignette = $('vignette');
    this.hurt = $('hurtFlash');
    this.enemyTag = $('enemyTag');
    this.enemyFill = $('enemyFill');
    this.dmgNumbers = $('dmgNumbers');
    this.dmgInd = $('dmgIndicators');
    this.reloadBar = $('reloadBar');
    this.reloadFill = $('reloadFill');
    this.nadeReady = $('nadeReady');
    this.ghostHp = MAX_HEALTH;
    this.enemyShowT = 0;
    this.numbers = [];
    this.indicators = [];
    this.bannerT = 0;
    this.toastT = 0;
    this.hitT = 0;

    const slots = $('slots');
    slots.innerHTML = '';
    this.slotEls = {};
    SLOT_ORDER.forEach((id, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = `<span class="key">${i + 1}</span><span class="icon">${ICONS[id]}</span><span class="cd"></span>`;
      slots.appendChild(d);
      this.slotEls[id] = d;
    });
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  setScores(blue, red, target) {
    this.scoreBlue.textContent = blue;
    this.scoreRed.textContent = red;
    for (const [id, n, cls] of [['pipsBlue', blue, 'blue'], ['pipsRed', red, 'red']]) {
      const el = $(id);
      el.innerHTML = '';
      for (let i = 0; i < target; i++) {
        const p = document.createElement('i');
        if (i < n) p.className = cls;
        el.appendChild(p);
      }
    }
  }

  setTimer(sec, overtime) {
    if (overtime) {
      this.timer.textContent = 'サドンデス';
      this.timer.classList.add('ot');
      return;
    }
    this.timer.classList.remove('ot');
    const s = Math.max(0, Math.ceil(sec));
    this.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timer.classList.toggle('low', s <= 10);
  }

  flashSlot(id) {
    const el = this.slotEls[id];
    if (!el) return;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  hit(head, kill) {
    this.hitmarker.className = kill ? 'kill' : head ? 'head' : 'body';
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
    this.hitT = 0.25;
  }

  damageNumber(worldPos, amount, head, camera) {
    const el = document.createElement('div');
    el.className = 'dnum' + (head ? ' head' : '');
    el.textContent = amount;
    this.dmgNumbers.appendChild(el);
    this.numbers.push({ el, pos: worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.3, 0)), t: 0, camera });
  }

  damageFrom(angle) {
    const el = document.createElement('div');
    el.className = 'dind';
    el.style.transform = `rotate(${angle}rad)`;
    this.dmgInd.appendChild(el);
    this.indicators.push({ el, t: 0 });
    this.hurt.classList.remove('show'); void this.hurt.offsetWidth; this.hurt.classList.add('show');
  }

  showBanner(big, small = '', cls = '', dur = 2) {
    this.banner.className = cls;
    this.banner.querySelector('.big').textContent = big;
    this.banner.querySelector('.small').textContent = small;
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.bannerT = dur;
  }

  hideBanner() { this.banner.classList.remove('show'); this.bannerT = 0; }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastT = 1.6;
  }

  feed(killer, victim, weapon, head, killerTeam) {
    const el = document.createElement('div');
    el.className = 'feed';
    el.innerHTML = `<span class="${killerTeam}">${killer}</span><span class="ficon">${ICONS[weapon] || ''}</span>${head ? '<span class="hs">◎</span>' : ''}<span class="${killerTeam === 'blue' ? 'red' : 'blue'}">${victim}</span>`;
    this.killfeed.prepend(el);
    setTimeout(() => el.classList.add('out'), 4500);
    setTimeout(() => el.remove(), 5200);
  }

  clearFeed() { this.killfeed.innerHTML = ''; this.dmgNumbers.innerHTML = ''; this.numbers = []; }

  update(dt, game) {
    const p = game.player;
    const bot = game.bot;
    if (!p) return;

    // 体力
    const hpK = Math.max(0, p.health) / MAX_HEALTH;
    this.hpFill.style.width = `${hpK * 100}%`;
    this.hpFill.classList.toggle('low', hpK < 0.35);
    this.ghostHp = Math.max(p.health, this.ghostHp - dt * 60);
    this.hpGhost.style.width = `${Math.max(0, this.ghostHp) / MAX_HEALTH * 100}%`;
    this.hpText.textContent = Math.max(0, Math.ceil(p.health));
    this.vignette.style.opacity = hpK < 0.4 ? (0.4 - hpK) / 0.4 * 0.9 : 0;

    // 武器
    const d = p.def;
    this.weaponName.textContent = d.name;
    if (d.type === 'gun') {
      const a = p.ammo;
      this.mag.textContent = a.mag;
      this.reserve.textContent = `/ ${a.reserve}`;
      this.mag.classList.toggle('low', a.mag <= Math.ceil(d.mag * 0.25));
    } else if (d.type === 'melee') {
      this.mag.textContent = '∞'; this.reserve.textContent = '';
      this.mag.classList.remove('low');
    } else {
      const cd = p.loadout.grenadeCd;
      this.mag.textContent = cd > 0 ? Math.ceil(cd) : '1';
      this.reserve.textContent = cd > 0 ? '秒' : '';
      this.mag.classList.toggle('low', cd > 0);
    }
    for (const id of SLOT_ORDER) {
      const el = this.slotEls[id];
      el.classList.toggle('active', p.weapon === id);
      if (id === 'grenade') {
        const cd = p.loadout.grenadeCd;
        el.classList.toggle('cooldown', cd > 0);
        el.querySelector('.cd').textContent = cd > 0 ? Math.ceil(cd) : '';
        el.style.setProperty('--cdk', cd > 0 ? cd / WEAPONS.grenade.cooldown : 0);
      }
    }
    this.nadeReady.classList.toggle('show', p.loadout.grenadeCd <= 0 && p.weapon !== 'grenade');

    // リロードバー
    const rp = p.reloadProgress;
    this.reloadBar.classList.toggle('show', rp >= 0);
    if (rp >= 0) this.reloadFill.style.width = `${rp * 100}%`;

    // クロスヘア
    const spread = p.currentSpread();
    const gap = 5 + spread * 900 * (1 - p.ads * 0.6);
    this.cross.style.setProperty('--gap', `${gap}px`);
    this.cross.className = d.type === 'gun' ? (p.ads > 0.8 ? 'ads' : '') : d.type === 'melee' ? 'melee' : 'nade';

    this.hitT -= dt;
    if (this.hitT <= 0) this.hitmarker.classList.remove('show');

    // 敵の体力タグ
    const cam = game.camera;
    this.enemyShowT -= dt;
    if (bot && bot.alive && this.enemyShowT > 0) {
      const v = bot.body.pos.clone(); v.y += bot.body.height + 0.45;
      v.project(cam);
      if (v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2) {
        this.enemyTag.style.display = 'block';
        this.enemyTag.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
        this.enemyTag.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
        this.enemyFill.style.width = `${Math.max(0, bot.health) / MAX_HEALTH * 100}%`;
      } else this.enemyTag.style.display = 'none';
    } else this.enemyTag.style.display = 'none';

    // ダメージ数値
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += dt;
      const v = n.pos.clone(); v.y += n.t * 0.8;
      v.project(cam);
      if (n.t > 0.9 || v.z > 1) { n.el.remove(); this.numbers.splice(i, 1); continue; }
      n.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      n.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
      n.el.style.opacity = n.t < 0.6 ? 1 : 1 - (n.t - 0.6) / 0.3;
      n.el.style.transform = `translate(-50%,-50%) scale(${n.t < 0.08 ? 1.6 - n.t * 7 : 1})`;
    }
    for (let i = this.indicators.length - 1; i >= 0; i--) {
      const ind = this.indicators[i];
      ind.t += dt;
      ind.el.style.opacity = Math.max(0, 1 - ind.t / 1.2);
      if (ind.t > 1.2) { ind.el.remove(); this.indicators.splice(i, 1); }
    }

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.remove('show');
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('show');
    }
  }
}
