import * as THREE from 'three';
import { Fighter, STAND_HEIGHT, CROUCH_HEIGHT, rayBox } from './fighter.js';
import { WEAPONS, SLOT_ORDER } from './weapons.js';
import { audio } from './audio.js';

const WALK = 7.0;
const JUMP_V = 7.6;

export class Player extends Fighter {
  constructor(game) {
    super('YOU', 'blue');
    this.game = game;
    this.keys = new Set();
    this.mouseDown = false;
    this.rightDown = false;
    this.firePressed = false;   // セミオート用の押下エッジ
    this.jumpPressed = false;
    this.lookDX = 0; this.lookDY = 0;
    this.sens = 1.0;
    this.ads = 0;
    this.sprinting = false;
    this.slideT = 0;
    this.slideDir = new THREE.Vector3();
    this.landDip = 0;
    this.camRecoil = 0;         // 視点のキック（上方向）
    this.camRecoilYaw = 0;
    this.bloom = 0;             // 連射による拡散
    this.stepT = 0;
    this.wasGround = true;
    this.fallV = 0;
    this.shake = 0;
  }

  resetForRound(spawn) {
    super.resetForRound(spawn);
    this.ads = 0; this.slideT = 0; this.bloom = 0; this.camRecoil = 0; this.camRecoilYaw = 0;
    this.mouseDown = false; this.firePressed = false;
  }

  // ---------- 入力 ----------
  onKeyDown(e) {
    const k = e.code;
    this.keys.add(k);
    if (!this.alive) return;
    if (k === 'Digit1') this.select('ar');
    else if (k === 'Digit2') this.select('pistol');
    else if (k === 'Digit3') this.select('fist');
    else if (k === 'Digit4') this.select('grenade');
    else if (k === 'KeyG') this.quickGrenade();
    else if (k === 'KeyQ') this.select(this.weapon === this.lastGun ? (this.lastGun === 'ar' ? 'pistol' : 'ar') : this.lastGun);
    else if (k === 'KeyR') { if (this.startReload()) audio.reload(0); }
    else if (k === 'Space') this.jumpPressed = true;
    else if ((k === 'KeyC' || k === 'ControlLeft') && this.sprinting && this.body.onGround && this.slideT <= 0) this.startSlide();
  }
  onKeyUp(e) { this.keys.delete(e.code); }
  onMouseDown(e) {
    if (e.button === 0) { this.mouseDown = true; this.firePressed = true; }
    if (e.button === 2) this.rightDown = true;
  }
  onMouseUp(e) {
    if (e.button === 0) this.mouseDown = false;
    if (e.button === 2) this.rightDown = false;
  }
  onWheel(e) {
    const i = SLOT_ORDER.indexOf(this.weapon);
    const n = SLOT_ORDER.length;
    let j = (i + (e.deltaY > 0 ? 1 : -1) + n) % n;
    if (SLOT_ORDER[j] === 'grenade' && this.loadout.grenadeCd > 0) j = (j + (e.deltaY > 0 ? 1 : -1) + n) % n;
    this.select(SLOT_ORDER[j]);
  }
  onMouseMove(e) {
    const s = 0.0022 * this.sens * (1 - this.ads * 0.35);
    this.yaw -= e.movementX * s;
    this.pitch -= e.movementY * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
    this.lookDX += e.movementX; this.lookDY += e.movementY;
  }
  releaseAll() {
    this.keys.clear(); this.mouseDown = false; this.rightDown = false;
  }

  select(id) {
    if (this.switchTo(id)) {
      this.game.viewmodel.show(id);
      audio.swap();
      this.game.hud.flashSlot(id);
    } else if (id === 'grenade' && this.loadout.grenadeCd > 0) {
      this.game.hud.toast(`グレネード クールダウン中 ${Math.ceil(this.loadout.grenadeCd)}秒`);
    }
  }

  quickGrenade() {
    if (this.loadout.grenadeCd > 0) { this.select('grenade'); return; }
    if (this.weapon !== 'grenade') this.select('grenade');
    this.quickThrow = true;
  }

  startSlide() {
    const v = this.body.vel;
    this.slideDir.set(v.x, 0, v.z).normalize();
    this.slideT = 0.75;
    v.x = this.slideDir.x * 13; v.z = this.slideDir.z * 13;
    audio.land(false);
  }

  hitTest(o, d, far) {
    if (!this.alive) return null;
    const p = this.body.pos, h = this.body.height;
    const headT = rayBox(o, d, p.x - 0.22, p.y + h - 0.42, p.z - 0.22, p.x + 0.22, p.y + h + 0.02, p.z + 0.22);
    const bodyT = rayBox(o, d, p.x - 0.36, p.y, p.z - 0.36, p.x + 0.36, p.y + h - 0.42, p.z + 0.36);
    let t = -1, head = false;
    if (headT >= 0 && (bodyT < 0 || headT <= bodyT)) { t = headT; head = true; }
    else if (bodyT >= 0) t = bodyT;
    if (t < 0 || t > far) return null;
    return { dist: t, head, point: o.clone().addScaledVector(d, t) };
  }

  currentSpread() {
    const d = this.def;
    if (d.type !== 'gun') return 0;
    const hs = Math.hypot(this.body.vel.x, this.body.vel.z);
    const moveK = Math.min(1, hs / WALK);
    let s = THREE.MathUtils.lerp(d.spread, d.adsSpread, this.ads);
    s += moveK * d.moveSpread * (1 - this.ads * 0.6);
    if (!this.body.onGround) s += 0.03;
    if (this.crouch && this.body.onGround) s *= 0.75;
    s += this.bloom;
    return s;
  }

  // ---------- 毎フレーム ----------
  update(dt, canMove) {
    const b = this.body;
    const g = this.game;

    const ev = this.tickTimers(dt);
    if (ev === 'reloaded') { audio.reload(2); g.onReloaded(this); }
    if (this.reloadT > 0) {
      const p = this.reloadProgress;
      if (p > 0.45 && !this._rs1) { this._rs1 = true; audio.reload(1); }
    } else this._rs1 = false;

    if (!this.alive) { this.lookDX = this.lookDY = 0; return; }

    // 入力方向
    let fx = 0, fz = 0;
    if (canMove) {
      if (this.keys.has('KeyW')) fz -= 1;
      if (this.keys.has('KeyS')) fz += 1;
      if (this.keys.has('KeyA')) fx -= 1;
      if (this.keys.has('KeyD')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin, wz = -fx * sin + fz * cos;

    // しゃがみ
    const wantCrouch = canMove && (this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.slideT > 0);
    if (wantCrouch && !this.crouch) { this.crouch = true; b.height = CROUCH_HEIGHT; }
    else if (!wantCrouch && this.crouch) {
      // 頭上チェック
      b.height = STAND_HEIGHT;
      if (g.world._blockedAt(b, b.pos.y)) b.height = CROUCH_HEIGHT;
      else this.crouch = false;
    }

    const def = this.def;
    this.sprinting = canMove && this.keys.has('ShiftLeft') && fz < 0 && !this.rightDown && !this.crouch && b.onGround && !this.mouseDown;
    if (this.keys.has('ShiftLeft') && !b.onGround && this.sprinting === false && Math.hypot(b.vel.x, b.vel.z) > WALK) this.sprinting = true;

    let speed = WALK;
    if (def.type === 'melee') speed *= def.speedMul;
    if (this.sprinting) speed *= 1.3;
    if (this.crouch) speed *= 0.5;
    speed *= 1 - this.ads * 0.38;

    if (this.slideT > 0) {
      this.slideT -= dt;
      const f = Math.exp(-2.2 * dt);
      b.vel.x *= f; b.vel.z *= f;
      if (!this.keys.has('KeyC') && !this.keys.has('ControlLeft')) this.slideT = Math.min(this.slideT, 0.05);
    } else {
      const accel = b.onGround ? 16 : 4;
      const k = 1 - Math.exp(-accel * dt);
      const tx = wx * speed, tz = wz * speed;
      if (b.onGround || len > 0) {
        b.vel.x += (tx - b.vel.x) * k;
        b.vel.z += (tz - b.vel.z) * k;
      }
    }

    // ジャンプ（拳装備で空中ジャンプ1回）
    if (b.onGround) this.airJumps = def.doubleJump ? 1 : 0;
    else if (!def.doubleJump) this.airJumps = 0;
    if (this.jumpPressed && canMove) {
      if (b.onGround) {
        b.vel.y = JUMP_V; audio.jump();
        if (this.slideT > 0) { this.slideT = 0; }
      } else if (def.doubleJump && this.airJumps > 0) {
        this.airJumps--;
        b.vel.y = JUMP_V * 0.95;
        // 空中ジャンプは入力方向へ勢いを付ける
        if (len > 0) { b.vel.x = wx * speed * 1.1; b.vel.z = wz * speed * 1.1; }
        audio.jump();
        g.effects.sparks(b.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), new THREE.Vector3(0, -1, 0), new THREE.Color(0.6, 0.8, 1), 14, 3);
      }
    }
    this.jumpPressed = false;

    const vyBefore = b.vel.y;
    g.world.moveBody(b, dt);
    if (b.onGround && !this.wasGround) {
      const hard = vyBefore < -9;
      this.landDip = Math.min(0.08, -vyBefore * 0.006);
      audio.land(hard);
    }
    this.wasGround = b.onGround;
    this.landDip = Math.max(0, this.landDip - dt * 0.35);

    // 足音
    const hs = Math.hypot(b.vel.x, b.vel.z);
    if (b.onGround && hs > 2 && this.slideT <= 0 && !this.crouch) {
      this.stepT -= dt * hs / 6.5;
      if (this.stepT <= 0) { this.stepT = this.sprinting ? 0.3 : 0.38; audio.step(); }
    }

    // ADS
    const canAds = def.type === 'gun' && this.rightDown && this.reloadT <= 0 && !this.sprinting && canMove;
    const adsSpeed = def.adsTime ? 1 / def.adsTime : 6;
    this.ads = THREE.MathUtils.clamp(this.ads + (canAds ? 1 : -1) * adsSpeed * dt, 0, 1);

    // 射撃
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    if (canMove && this.equipT <= 0) {
      if (def.type === 'gun') {
        const want = def.auto ? this.mouseDown : this.firePressed;
        if (want && this.fireCd <= 0 && this.reloadT <= 0) {
          if (this.ammo.mag > 0) this.shoot();
          else if (this.firePressed) {
            audio.empty();
            if (this.startReload()) audio.reload(0);
          }
        }
      } else if (def.type === 'melee') {
        if (this.mouseDown && this.fireCd <= 0) {
          g.melee(this);
          g.viewmodel.punch();
        }
      } else if (def.type === 'utility') {
        if ((this.firePressed || this.quickThrow) && this.fireCd <= 0 && this.loadout.grenadeCd <= 0) {
          this.quickThrow = false;
          g.viewmodel.throwNade();
          this.pendingThrow = 0.2;
          this.fireCd = 0.6;
          audio.pin();
        }
      }
    }
    if (this.pendingThrow > 0) {
      this.pendingThrow -= dt;
      if (this.pendingThrow <= 0) {
        g.throwGrenadeFromView(this);
        this.returnT = 0.3;
      }
    }
    if (this.returnT > 0) {
      this.returnT -= dt;
      if (this.returnT <= 0 && this.weapon === 'grenade') this.select(this.lastGun || 'ar');
    }
    this.firePressed = false;

    // リコイル回復
    const rec = Math.min(1, dt * 6);
    const back = this.camRecoil * rec, backY = this.camRecoilYaw * rec;
    this.camRecoil -= back; this.camRecoilYaw -= backY;
    if (!this.mouseDown) { this.pitch -= back * 0.8; this.yaw -= backY * 0.8; }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  shoot() {
    const def = this.def;
    const g = this.game;
    const spread = this.currentSpread();
    const dir = this.forward(new THREE.Vector3());
    const r = Math.sqrt(Math.random()) * spread, a = Math.random() * Math.PI * 2;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    g.fireGun(this, dir);
    g.viewmodel.kick(def.recoil * (1 - this.ads * 0.5));
    const kickP = def.recoil * (0.85 + Math.random() * 0.4) * (1 - this.ads * 0.35) * (this.crouch ? 0.75 : 1);
    const kickY = (Math.random() - 0.5) * def.recoil * 0.7;
    this.pitch = Math.min(1.5, this.pitch + kickP);
    this.yaw += kickY;
    this.camRecoil += kickP; this.camRecoilYaw += kickY;
    this.bloom = Math.min(0.05, this.bloom + (def.auto ? 0.004 : 0.008) * (1 - this.ads * 0.7));
    this.sprinting = false;
  }
}

export { WEAPONS };
