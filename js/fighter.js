import * as THREE from 'three';
import { Body } from './world.js';
import { WEAPONS, Loadout, EQUIP_TIME } from './weapons.js';

export const MAX_HEALTH = 150;
export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.25;

// プレイヤーとボットの共通部分（体力・武器・弾薬の状態）
export class Fighter {
  constructor(name, team) {
    this.name = name;
    this.team = team;
    this.body = new Body();
    this.loadout = new Loadout();
    this.health = MAX_HEALTH;
    this.alive = true;
    this.weapon = 'ar';
    this.lastGun = 'ar';
    this.fireCd = 0;
    this.reloadT = 0;       // 残りリロード時間（0 = リロードしていない）
    this.equipT = 0;        // 残り持ち替え時間
    this.yaw = 0;
    this.pitch = 0;
    this.airJumps = 0;
    this.crouch = false;
    this.lastDamageT = -99;
    this.pendingThrow = 0;
    this.stats = { shots: 0, hits: 0, heads: 0, damage: 0, kills: 0 };
  }

  get def() { return WEAPONS[this.weapon]; }
  get ammo() { return this.loadout.ammo[this.weapon]; }

  eyePos(target = new THREE.Vector3()) {
    return target.set(this.body.pos.x, this.body.pos.y + this.body.height - 0.17, this.body.pos.z);
  }

  centerPos(target = new THREE.Vector3()) {
    return target.set(this.body.pos.x, this.body.pos.y + this.body.height * 0.55, this.body.pos.z);
  }

  forward(target = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return target.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  resetForRound(spawn) {
    this.body.pos.copy(spawn.pos);
    this.body.vel.set(0, 0, 0);
    this.body.height = STAND_HEIGHT;
    this.crouch = false;
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.health = MAX_HEALTH;
    this.alive = true;
    this.loadout.refill();
    this.weapon = 'ar';
    this.lastGun = 'ar';
    this.fireCd = 0;
    this.reloadT = 0;
    this.equipT = 0;
    this.pendingThrow = 0;
  }

  get busy() { return this.equipT > 0 || this.reloadT > 0; }

  switchTo(id) {
    if (id === this.weapon || !this.alive) return false;
    if (id === 'grenade' && this.loadout.grenadeCd > 0) return false;
    if (WEAPONS[this.weapon].type === 'gun') this.lastGun = this.weapon;
    this.weapon = id;
    this.reloadT = 0;
    this.equipT = EQUIP_TIME;
    this.fireCd = Math.max(this.fireCd, 0);
    return true;
  }

  canReload() {
    const d = this.def;
    if (d.type !== 'gun' || this.reloadT > 0 || this.equipT > 0) return false;
    const a = this.ammo;
    return a.mag < d.mag && a.reserve > 0;
  }

  startReload() {
    if (!this.canReload()) return false;
    this.reloadT = this.def.reload;
    return true;
  }

  get reloadProgress() {
    if (this.reloadT <= 0) return -1;
    return 1 - this.reloadT / this.def.reload;
  }

  tickTimers(dt) {
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.equipT = Math.max(0, this.equipT - dt);
    if (this.loadout.grenadeCd > 0) this.loadout.grenadeCd = Math.max(0, this.loadout.grenadeCd - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        const a = this.ammo, d = this.def;
        if (a) {
          const need = d.mag - a.mag;
          const take = Math.min(need, a.reserve);
          a.mag += take; a.reserve -= take;
        }
        return 'reloaded';
      }
    }
    return null;
  }

  // 被弾判定（サブクラスで実装）: {dist, head, point} or null
  hitTest() { return null; }
}

// レイ vs AABB（プレイヤーの当たり判定用）
export function rayBox(o, d, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = 0, tmax = Infinity;
  const lo = [minX, minY, minZ], hi = [maxX, maxY, maxZ], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-9) {
      if (oo[a] < lo[a] || oo[a] > hi[a]) return -1;
      continue;
    }
    let t1 = (lo[a] - oo[a]) / dd[a], t2 = (hi[a] - oo[a]) / dd[a];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}
