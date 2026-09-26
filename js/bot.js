import * as THREE from 'three';
import { Fighter, MAX_HEALTH } from './fighter.js';
import { CharacterModel } from './character.js';
import { WEAPONS } from './weapons.js';

export const DIFFICULTY = {
  easy: { label: 'イージー', reaction: 0.7, aimErr: 0.075, turn: 4.5, head: 0.08, lag: 0.28, jump: 0.02, nade: 0.25, fireHold: 0.55, speed: 0.85 },
  normal: { label: 'ノーマル', reaction: 0.42, aimErr: 0.045, turn: 7.5, head: 0.22, lag: 0.17, jump: 0.06, nade: 0.5, fireHold: 0.8, speed: 0.95 },
  hard: { label: 'ハード', reaction: 0.24, aimErr: 0.026, turn: 12, head: 0.38, lag: 0.08, jump: 0.12, nade: 0.8, fireHold: 1, speed: 1.0 },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

export class Bot extends Fighter {
  constructor(game, difficulty = 'normal') {
    super('RIVAL', 'red');
    this.game = game;
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.model = new CharacterModel();
    game.scene.add(this.model.root);
    this.path = null;
    this.pathTarget = new THREE.Vector3();
    this.repathT = 0;
    this.thinkT = 0;
    this.state = 'hunt';
    this.seeT = 0;          // 視認し続けている時間
    this.lostT = 99;        // 見失ってからの時間
    this.lastSeen = new THREE.Vector3();
    this.strafeDir = 1;
    this.strafeT = 0;
    this.aimYaw = 0; this.aimPitch = 0;
    this.targetHead = false;
    this.history = [];
    this.stuckT = 0;
    this.moveWish = new THREE.Vector3();
    this.retreatT = 0;
    this.retreatCd = 0;
    this.visibleNow = false;
    this.returnT = 0;
    this.returnTo = 'ar';
    this.burstT = 0;
    this.recoilAnim = 0;
    this.stepT = 0;
  }

  resetForRound(spawn) {
    super.resetForRound(spawn);
    this.aimYaw = spawn.yaw; this.aimPitch = 0;
    this.path = null; this.state = 'hunt';
    this.seeT = 0; this.lostT = 99;
    this.history = [];
    this.model.root.visible = true;
    this.model.setWeapon('ar');
    this.retreatT = 0;
    this.retreatCd = 0;
    this.visibleNow = false;
    this.returnT = 0;
    this.nadeTarget = null;
    this.syncModel(0);
  }

  hitTest(o, d, far) {
    if (!this.alive) return null;
    // 大まかなバウンディングで早期リジェクト
    const c = this.centerPos(_v3);
    const t = _v.subVectors(c, o).dot(d);
    if (t < 0 || t > far) return null;
    const closest = _v2.copy(o).addScaledVector(d, t);
    if (closest.distanceToSquared(c) > 1.6) return null;
    this.model.root.updateMatrixWorld(true);
    raycaster.set(o, d); raycaster.far = far;
    const hits = raycaster.intersectObjects(this.model.hitMeshes, false);
    if (!hits.length) return null;
    const h = hits[0];
    return { dist: h.distance, head: h.object.userData.hit === 'head', point: h.point.clone() };
  }

  canSee(target) {
    const eye = this.eyePos(_v);
    const w = this.game.world;
    if (!w.segmentBlocked(eye, target.eyePos(_v2))) return true;
    return !w.segmentBlocked(eye, target.centerPos(_v2));
  }

  syncModel(dt) {
    const r = this.model.root;
    r.position.copy(this.body.pos);
    r.rotation.y = this.yaw;
    const sp = Math.hypot(this.body.vel.x, this.body.vel.z);
    this.recoilAnim = Math.max(0, this.recoilAnim - dt * 8);
    this.model.animate({ dt, speed: sp, pitch: this.pitch, onGround: this.body.onGround, recoil: -this.recoilAnim * 0.25 });
    const sc = this.crouch ? 0.8 : 1;
    r.scale.set(1, sc, 1);
  }

  equip(id) {
    if (this.switchTo(id)) {
      this.model.setWeapon(id === 'fist' ? 'fist' : id);
      return true;
    }
    return false;
  }

  pickWeapon(dist) {
    const ar = this.loadout.ammo.ar, pi = this.loadout.ammo.pistol;
    if (this.weapon === 'grenade') return;
    if (dist < 2.2 && this.weapon === 'fist') return;
    if (dist < 2.0 && (this.def.type !== 'gun' || this.ammo.mag === 0)) { this.equip('fist'); return; }
    if (this.weapon === 'ar' && ar.mag === 0 && this.reloadT <= 0) {
      if (pi.mag > 0 && dist < 25) this.equip('pistol');
      else if (ar.reserve > 0) this.startReload();
      else if (pi.mag + pi.reserve > 0) this.equip('pistol');
      else this.equip('fist');
    } else if (this.weapon === 'pistol' && pi.mag === 0 && this.reloadT <= 0) {
      if (ar.mag > 0) this.equip('ar');
      else if (pi.reserve > 0) this.startReload();
      else if (ar.reserve > 0) { this.equip('ar'); }
      else this.equip('fist');
    } else if (this.weapon === 'fist' && dist > 3.5) {
      if (ar.mag + ar.reserve > 0) this.equip('ar');
      else if (pi.mag + pi.reserve > 0) this.equip('pistol');
    }
  }

  think(player) {
    const g = this.game;
    const d = this.diff;
    const dist = this.body.pos.distanceTo(player.body.pos);
    const visible = player.alive && this.canSee(player);
    this.visibleNow = visible;

    if (visible) {
      this.lastSeen.copy(player.body.pos);
      this.lostT = 0;
    }

    // 低体力なら遮蔽物へ退避
    if (this.state !== 'retreat' && visible && this.health < 50 && player.health > this.health + 25 && this.retreatCd <= 0 && Math.random() < 0.5) {
      const cover = this.findCover(player);
      if (cover) {
        this.state = 'retreat';
        this.retreatT = 3.5;
        this.setPath(cover);
      }
    }
    if (this.state === 'retreat') {
      if (this.retreatT <= 0 || (!visible && this.path === null)) {
        this.state = 'hunt';
        this.retreatCd = 8;
      }
      if (!visible && this.def.type === 'gun' && this.ammo.mag < this.def.mag * 0.7) this.startReload();
    } else if (visible) {
      this.state = 'combat';
    } else {
      this.state = 'hunt';
    }

    if (this.state !== 'retreat') this.pickWeapon(dist);

    // グレネード
    if (this.loadout.grenadeCd <= 0 && player.alive && this.weapon !== 'grenade' && !this.busy) {
      const hidden = !visible && this.lostT > 0.8 && this.lostT < 4;
      const inRange = dist > 7 && dist < 24;
      const chance = hidden ? 0.35 : 0.08;
      if (inRange && Math.random() < chance * d.nade) {
        const target = hidden ? this.lastSeen.clone() : player.body.pos.clone().addScaledVector(player.body.vel, 0.6);
        this.prevWeapon = this.weapon;
        this.equip('grenade');
        this.nadeTarget = target;
        this.pendingThrow = 0.35;
        this.model.throwNade();
      }
    }

    // 経路探索
    if (this.state === 'hunt') {
      const target = this.lostT < 5 ? this.lastSeen : player.body.pos;
      if (!this.path || this.repathT <= 0 || this.pathTarget.distanceTo(target) > 3) this.setPath(target);
      if (!visible && this.def.type === 'gun' && this.ammo.mag < this.def.mag * 0.4) this.startReload();
    } else if (this.state === 'combat') {
      this.path = null;
      // 距離調整＋ストレイフ
      const pref = this.weapon === 'fist' ? 0 : this.weapon === 'pistol' ? 9 : 12;
      const toP = _v.subVectors(player.body.pos, this.body.pos); toP.y = 0;
      const len = toP.length() || 1; toP.divideScalar(len);
      const side = _v2.set(-toP.z, 0, toP.x).multiplyScalar(this.strafeDir);
      let approach = 0;
      if (dist > pref + 4) approach = 1;
      else if (dist < pref - 4) approach = -0.8;
      this.moveWish.copy(side).multiplyScalar(this.weapon === 'fist' ? 0.4 : 1).addScaledVector(toP, approach);
      if (this.moveWish.lengthSq() > 1) this.moveWish.normalize();
      if (this.body.onGround && Math.random() < d.jump) this.body.vel.y = 7.2;
      // 遠すぎたり、進めない場合は経路で接近
      if (this.weapon === 'fist' && dist > 3) this.setPath(player.body.pos);
    }
  }

  setPath(target) {
    const nav = this.game.nav;
    const p = nav.findPath(this.body.pos.x, this.body.pos.z, target.x, target.z);
    this.path = p && p.length ? p : null;
    this.pathTarget.copy(target);
    this.repathT = 0.9;
  }

  findCover(player) {
    const nav = this.game.nav, w = this.game.world;
    const eye = player.eyePos(new THREE.Vector3());
    let best = null, bestScore = Infinity;
    for (let n = 0; n < 60; n++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 9;
      const x = this.body.pos.x + Math.cos(a) * r, z = this.body.pos.z + Math.sin(a) * r;
      const k = nav.nearestWalkable(x, z, 2);
      if (k < 0) continue;
      const c = nav.center(k);
      const p = new THREE.Vector3(c.x, 1.4, c.z);
      if (!w.segmentBlocked(eye, p)) continue;
      const score = r + p.distanceTo(eye) * -0.2;
      if (score < bestScore) { bestScore = score; best = new THREE.Vector3(c.x, 0, c.z); }
    }
    return best;
  }

  update(dt, player, active) {
    if (!this.alive) return;
    const d = this.diff;
    const ev = this.tickTimers(dt);
    if (ev === 'reloaded') this.game.onReloaded(this);
    this.repathT -= dt;
    this.retreatT -= dt;
    this.retreatCd -= dt;
    if (this.returnT > 0) {
      this.returnT -= dt;
      if (this.returnT <= 0 && this.weapon === 'grenade') this.equip(this.returnTo);
    }

    // プレイヤー位置の履歴（反応遅延）
    this.history.push({ t: this.game.time, p: player.body.pos.clone(), crouch: player.body.height });
    while (this.history.length > 2 && this.history[1].t < this.game.time - d.lag) this.history.shift();

    this.moveWish.set(0, 0, 0);
    if (active) {
      this.thinkT -= dt;
      if (this.thinkT <= 0) { this.thinkT = 0.18 + Math.random() * 0.1; this.think(player); }
    }

    const visible = active && player.alive && this.visibleNow;
    if (visible) { this.seeT += dt; this.lostT = 0; } else { this.seeT = 0; this.lostT += dt; }

    // 経路追従
    if (active && this.path) {
      const next = this.path[0];
      const dx = next.x - this.body.pos.x, dz = next.z - this.body.pos.z;
      const l = Math.hypot(dx, dz);
      if (l < 0.6) {
        this.path.shift();
        if (!this.path.length) this.path = null;
      } else {
        this.moveWish.set(dx / l, 0, dz / l);
      }
    }

    // ストレイフの向き変更
    this.strafeT -= dt;
    if (this.strafeT <= 0 || (this.body.hitWall && this.state === 'combat')) {
      this.strafeDir *= -1;
      this.strafeT = 0.5 + Math.random() * 1.1;
    }

    // 移動
    let speed = 6.6 * d.speed;
    if (this.weapon === 'fist') speed *= WEAPONS.fist.speedMul;
    const b = this.body;
    const accel = b.onGround ? 14 : 3;
    const k = 1 - Math.exp(-accel * dt);
    b.vel.x += (this.moveWish.x * speed - b.vel.x) * k;
    b.vel.z += (this.moveWish.z * speed - b.vel.z) * k;
    this.game.world.moveBody(b, dt);

    // 足音
    const hs = Math.hypot(b.vel.x, b.vel.z);
    if (b.onGround && hs > 2) {
      this.stepT -= dt * hs / 6.5;
      if (this.stepT <= 0) { this.stepT = 0.36; this.game.sound3D('step', b.pos); }
    }

    // スタック検知
    if (this.moveWish.lengthSq() > 0.1 && hs < 0.6) {
      this.stuckT += dt;
      if (this.stuckT > 0.5) {
        if (b.onGround) b.vel.y = 7.2;
        this.stuckT = 0;
        this.strafeDir *= -1;
        this.path = null; this.repathT = 0;
      }
    } else this.stuckT = 0;

    // 照準
    let lookTarget = null;
    if (visible || (active && this.lostT < 1.2 && this.state === 'combat')) {
      const h = this.history[0];
      const lagged = h ? h.p : player.body.pos;
      const ph = h ? h.crouch : player.body.height;
      lookTarget = _v3.set(lagged.x, lagged.y + (this.targetHead ? ph - 0.2 : ph * 0.55), lagged.z);
    } else if (this.moveWish.lengthSq() > 0.01) {
      lookTarget = _v3.set(b.pos.x + this.moveWish.x * 5, b.pos.y + 1.6, b.pos.z + this.moveWish.z * 5);
    } else if (this.lostT < 6) {
      lookTarget = _v3.set(this.lastSeen.x, this.lastSeen.y + 1.4, this.lastSeen.z);
    }
    if (this.weapon === 'grenade' && this.nadeTarget) {
      lookTarget = _v3.set(this.nadeTarget.x, this.nadeTarget.y + 1, this.nadeTarget.z);
    }
    if (lookTarget) {
      const eye = this.eyePos(_v);
      const dx = lookTarget.x - eye.x, dy = lookTarget.y - eye.y, dz = lookTarget.z - eye.z;
      this.aimYaw = Math.atan2(-dx, -dz);
      this.aimPitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
    let dyaw = this.aimYaw - this.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const turn = d.turn * dt;
    this.yaw += THREE.MathUtils.clamp(dyaw, -turn, turn) * (visible ? 1 : 0.7);
    this.pitch += THREE.MathUtils.clamp(this.aimPitch - this.pitch, -turn, turn);
    const aimErr = Math.abs(Math.atan2(Math.sin(this.aimYaw - this.yaw), Math.cos(this.aimYaw - this.yaw))) + Math.abs(this.aimPitch - this.pitch);

    // グレネード投擲
    if (this.pendingThrow > 0) {
      this.pendingThrow -= dt;
      if (this.pendingThrow <= 0 && this.weapon === 'grenade') {
        this.game.throwGrenadeAt(this, this.nadeTarget);
        this.nadeTarget = null;
        this.returnTo = this.prevWeapon && this.prevWeapon !== 'grenade' ? this.prevWeapon : 'ar';
        this.returnT = 0.3;
      }
    }

    // 射撃
    if (visible && active && !this.busy && this.seeT > d.reaction) {
      const dist = b.pos.distanceTo(player.body.pos);
      if (this.def.type === 'gun' && aimErr < 0.12 + 0.6 / Math.max(dist, 1)) {
        this.burstT -= dt;
        if (this.burstT < -d.fireHold * 1.2) this.burstT = 0.35 + Math.random() * 0.4;
        if (this.burstT > -d.fireHold && this.fireCd <= 0) {
          if (this.ammo.mag > 0) {
            if (this.def.auto || Math.random() < 0.85) {
              this.targetHead = Math.random() < d.head;
              const dir = this.forward(new THREE.Vector3());
              const err = d.aimErr * (1 + (player.body.vel.length() > 3 ? 0.4 : 0)) * (b.onGround ? 1 : 1.8);
              dir.x += gauss() * err; dir.y += gauss() * err; dir.z += gauss() * err;
              dir.normalize();
              this.game.fireGun(this, dir);
              this.recoilAnim = 1;
            } else this.fireCd = this.def.interval;
          } else this.startReload();
        }
      } else if (this.def.type === 'melee' && dist < WEAPONS.fist.range && this.fireCd <= 0 && aimErr < 0.5) {
        this.game.melee(this);
        this.model.punch();
      }
    }

    this.syncModel(dt);
  }

  kill() {
    this.alive = false;
    this.model.root.updateMatrixWorld(true);
    const meshes = [];
    this.model.root.traverse((o) => {
      if (!o.isMesh) return;
      let vis = true;
      for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
      if (vis) meshes.push(o);
    });
    this.model.root.visible = false;
    return meshes;
  }

  dispose() {
    this.game.scene.remove(this.model.root);
  }
}

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 0.9;
}

export { MAX_HEALTH };
