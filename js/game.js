import * as THREE from 'three';
import { EffectComposer } from '../lib/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/addons/postprocessing/OutputPass.js';
import { World, GRAVITY } from './world.js';
import { MAPS } from './maps.js';
import { NavGrid } from './nav.js';
import { Effects } from './effects.js';
import { ViewModel, WEAPONS, buildGrenadeModel } from './weapons.js';
import { Player } from './player.js';
import { Bot } from './bot.js';
import { HUD } from './hud.js';
import { audio } from './audio.js';

export const SCORE_TO_WIN = 5;
export const MATCH_TIME = 90;
const BASE_FOV = 78;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class Game {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.cb = callbacks;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.viewmodel = new ViewModel();
    this.hud = new HUD();
    this.scene = null;
    this.state = 'menu';
    this.paused = false;
    this.time = 0;
    this.quality = 'high';
    this.grenades = [];
    this.nadeGeo = null;
    this.clock = new THREE.Clock();
    this.settings = { sens: 1, fov: BASE_FOV };
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel.setAspect(w / h);
    if (this.composer) {
      this.composer.setSize(w, h);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
    }
  }

  setQuality(q) {
    this.quality = q;
    const pr = { high: Math.min(devicePixelRatio, 1.5), medium: Math.min(devicePixelRatio, 1), low: Math.min(devicePixelRatio, 1) * 0.8 }[q];
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.resize();
    if (this.scene) this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  // ---------------- マップ読み込み ----------------
  disposeScene() {
    if (!this.scene) return;
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    if (this.envRT) this.envRT.dispose();
    this.scene = null;
  }

  loadMap(id) {
    this.disposeScene();
    const scene = new THREE.Scene();
    const world = new World();
    const root = new THREE.Group();
    scene.add(root);
    const info = MAPS[id].build(root, world);
    this.mapInfo = info;
    scene.fog = new THREE.Fog(info.fog.color, info.fog.near, info.fog.far);
    scene.background = new THREE.Color(info.fog.color);
    this.renderer.toneMappingExposure = info.exposure;

    // 空から環境マップを生成して金属に映り込みを付ける
    const sky = root.children.find((c) => c.material && c.material.isShaderMaterial);
    if (sky) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      const envScene = new THREE.Scene();
      const skyClone = new THREE.Mesh(sky.geometry, sky.material);
      skyClone.scale.setScalar(0.2);
      envScene.add(skyClone);
      envScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
      this.envRT = pm.fromScene(envScene, 0.04, 0.1, 200);
      scene.environment = this.envRT.texture;
      scene.environmentIntensity = 0.55;
      pm.dispose();
    }

    this.scene = scene;
    this.world = world;
    this.nav = new NavGrid(world, 1.0);
    this.effects = new Effects(scene);
    this.viewmodel.scene.environment = scene.environment;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), info.bloom.strength, info.bloom.radius, info.bloom.threshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  // ---------------- 試合の流れ ----------------
  startMatch(mapId, difficulty) {
    this.mapId = mapId;
    this.difficulty = difficulty;
    this.loadMap(mapId);
    if (this.bot) this.bot.dispose?.();
    this.player = new Player(this);
    this.player.sens = this.settings.sens;
    this.bot = new Bot(this, difficulty);
    this.score = { blue: 0, red: 0 };
    this.timeLeft = MATCH_TIME;
    this.overtime = false;
    this.round = 0;
    this.paused = false;
    this.hud.clearFeed();
    this.hud.setScores(0, 0, SCORE_TO_WIN);
    this.hud.setTimer(this.timeLeft, false);
    this.hud.show(true);
    this.startRound();
  }

  startRound() {
    this.round++;
    const [s0, s1] = this.mapInfo.spawns;
    this.player.resetForRound(s0);
    this.bot.resetForRound(s1);
    // グレネードのクールダウンは試合を通して持ち越す
    this.effects.clear();
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades = [];
    this.viewmodel.show('ar');
    this.state = 'countdown';
    this.countdown = 3.0;
    this.lastBeep = 4;
    this.deathCam = 0;
    this.hud.showBanner(`ラウンド ${this.round}`, this.overtime ? 'サドンデス — 次のキルで勝利' : `先に${SCORE_TO_WIN}キルで勝利`, 'round', 1.4);
  }

  endRound(winnerTeam) {
    this.state = 'roundEnd';
    this.roundEndT = 3.0;
    const win = winnerTeam === 'blue';
    audio.roundWin(win);
    const done = this.score.blue >= SCORE_TO_WIN || this.score.red >= SCORE_TO_WIN || this.overtime;
    if (done) {
      this.roundEndT = 2.2;
      this.pendingMatchEnd = true;
    }
    this.hud.showBanner(win ? 'ラウンド勝利' : 'ラウンド敗北', `${this.score.blue} - ${this.score.red}`, win ? 'win' : 'lose', 2.4);
  }

  endMatch() {
    this.state = 'matchEnd';
    this.pendingMatchEnd = false;
    const b = this.score.blue, r = this.score.red;
    const result = b > r ? 'win' : b < r ? 'lose' : 'draw';
    audio.fanfare(result === 'win');
    this.hud.hideBanner();
    this.cb.onMatchEnd?.({ result, score: { ...this.score }, stats: { ...this.player.stats }, botStats: { ...this.bot.stats } });
  }

  quitToMenu() {
    this.state = 'menu';
    this.hud.show(false);
  }

  setPaused(p) {
    if (this.state === 'menu' || this.state === 'matchEnd') return;
    this.paused = p;
    if (p) this.player.releaseAll();
    this.cb.onPause?.(p);
  }

  // ---------------- 戦闘 ----------------
  opponentOf(f) { return f === this.player ? this.bot : this.player; }

  fireGun(shooter, dir) {
    const def = shooter.def;
    const a = shooter.ammo;
    a.mag--;
    shooter.fireCd = def.interval;
    shooter.stats.shots++;
    const origin = shooter.eyePos(new THREE.Vector3());
    const target = this.opponentOf(shooter);
    const far = def.range;
    const wh = this.world.raycast(origin, dir, far);
    const wd = wh ? wh.dist : far;
    const th = target.hitTest(origin, dir, wd);

    // 銃口位置（トレーサーの始点）
    let muzzle;
    if (shooter === this.player) {
      this.viewmodel.root.updateMatrixWorld(true);
      muzzle = this.viewmodel.muzzleWorld(new THREE.Vector3()) || origin.clone();
      muzzle.applyMatrix4(this.camera.matrixWorld);
      audio.shot(def.id);
    } else {
      muzzle = shooter.model.muzzleWorld(new THREE.Vector3());
      this.effects.worldMuzzle(muzzle);
      this.sound3D(def.id === 'ar' ? 'ar' : 'pistol', muzzle);
    }

    const end = th ? th.point : origin.clone().addScaledVector(dir, wd);
    this.effects.tracer(muzzle, end, shooter === this.player ? 0xffe0a0 : 0xff9a7a, shooter === this.player ? 0.014 : 0.022);

    if (th) {
      const dmg = th.head ? def.head : def.body;
      shooter.stats.hits++;
      if (th.head) shooter.stats.heads++;
      this.effects.bloodHit(th.point, th.head);
      this.applyDamage(target, dmg, shooter, th.head, def.id, origin);
    } else if (wh) {
      this.effects.impact(wh.point, wh.normal);
      if (shooter === this.player) audio.impact({ dist: wh.dist, pan: 0 });
      // 近くを弾が通過した音
      if (shooter !== this.player && this.player.alive) {
        const eye = this.player.eyePos(_v);
        const t = _v2.subVectors(eye, origin).dot(dir);
        if (t > 0 && t < wd) {
          const closest = origin.clone().addScaledVector(dir, t);
          if (closest.distanceTo(eye) < 1.5) audio.whiz();
        }
      }
    }
  }

  melee(attacker) {
    const def = WEAPONS.fist;
    attacker.fireCd = def.interval;
    const target = this.opponentOf(attacker);
    const eye = attacker.eyePos(new THREE.Vector3());
    const tc = target.centerPos(new THREE.Vector3());
    const to = tc.clone().sub(eye);
    const dist = to.length();
    let hit = false;
    if (target.alive && dist < def.range + 0.4) {
      const fwd = attacker.forward(new THREE.Vector3());
      const flat = to.clone(); flat.y *= 0.4; flat.normalize();
      if (fwd.dot(flat) > 0.55 && !this.world.segmentBlocked(eye, tc)) hit = true;
    }
    if (attacker === this.player) audio.punch({ hit });
    else this.sound3D('punch', eye, { hit });
    if (hit) {
      attacker.stats.shots++; attacker.stats.hits++;
      this.effects.sparks(tc.clone().lerp(eye, 0.3), to.clone().normalize().negate(), new THREE.Color(1, 1, 1), 12, 4);
      const push = to.clone().setY(0).normalize().multiplyScalar(4);
      target.body.vel.add(push); target.body.vel.y += 2;
      this.applyDamage(target, def.damage, attacker, false, 'fist', eye);
    } else if (attacker === this.player) {
      attacker.stats.shots++;
    }
  }

  throwGrenadeFromView(p) {
    const fwd = p.forward(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const origin = p.eyePos(new THREE.Vector3()).addScaledVector(fwd, 0.5).addScaledVector(right, 0.15);
    const vel = fwd.multiplyScalar(19).add(new THREE.Vector3(0, 3.2, 0)).addScaledVector(p.body.vel, 0.5);
    this.spawnGrenade(p, origin, vel);
  }

  throwGrenadeAt(bot, target) {
    const origin = bot.eyePos(new THREE.Vector3());
    origin.y += 0.2;
    const d = target.clone().sub(origin);
    const flat = Math.hypot(d.x, d.z);
    const T = THREE.MathUtils.clamp(flat / 15, 0.55, 1.5);
    const vel = new THREE.Vector3(d.x / T, (d.y + 0.3) / T + 0.5 * GRAVITY * T, d.z / T);
    this.spawnGrenade(bot, origin, vel);
  }

  spawnGrenade(owner, origin, vel) {
    owner.loadout.grenadeCd = WEAPONS.grenade.cooldown;
    const mesh = buildGrenadeModel();
    mesh.scale.setScalar(1.6);
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    mesh.position.copy(origin);
    // 点滅ライト
    const blink = new THREE.PointLight(owner.team === 'blue' ? 0x3d9bff : 0xff3d4f, 2, 4);
    mesh.add(blink);
    this.scene.add(mesh);
    this.grenades.push({ owner, mesh, blink, pos: origin.clone(), vel: vel.clone(), fuse: WEAPONS.grenade.fuse, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) });
    if (owner !== this.player) this.sound3D('bounce', origin);
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      const steps = 3, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        g.vel.y -= GRAVITY * h;
        const speed = g.vel.length();
        if (speed < 1e-4) continue;
        const dir = _v.copy(g.vel).divideScalar(speed);
        const hit = this.world.raycast(g.pos, dir, speed * h + 0.08);
        if (hit) {
          g.pos.copy(hit.point).addScaledVector(hit.normal, 0.08);
          const vn = hit.normal.clone().multiplyScalar(g.vel.dot(hit.normal));
          const vt = g.vel.clone().sub(vn);
          g.vel.copy(vt.multiplyScalar(0.7)).addScaledVector(vn, -0.42);
          g.spin.multiplyScalar(0.6);
          if (speed > 3) this.sound3D('bounce', g.pos);
        } else {
          g.pos.addScaledVector(g.vel, h);
        }
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt;
      g.blink.intensity = (Math.sin(g.fuse * (g.fuse < 0.8 ? 40 : 16)) > 0) ? 3 : 0.2;
      if (g.fuse <= 0) {
        this.explode(g);
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  explode(g) {
    const pos = g.pos.clone();
    pos.y = Math.max(pos.y, 0.15);
    this.effects.explosion(pos);
    this.sound3D('explosion', pos);
    const R = WEAPONS.grenade.radius, full = WEAPONS.grenade.damage;
    for (const f of [this.player, this.bot]) {
      if (!f.alive) continue;
      const c = f.centerPos(new THREE.Vector3());
      const d = c.distanceTo(pos);
      if (d > R) continue;
      const from = pos.clone(); from.y += 0.3;
      const blocked = this.world.segmentBlocked(from, c) && this.world.segmentBlocked(from, f.eyePos(new THREE.Vector3()));
      if (blocked) continue;
      let dmg = d <= 2 ? full : Math.round(full * (1 - ((d - 2) / (R - 2)) * 0.7));
      if (f === g.owner) dmg = Math.round(dmg * 0.5);
      const push = c.clone().sub(pos).setY(0).normalize().multiplyScalar(9 * (1 - d / R));
      f.body.vel.add(push); f.body.vel.y += 5 * (1 - d / R);
      if (g.owner !== f) { g.owner.stats.hits++; }
      this.applyDamage(f, dmg, g.owner, false, 'grenade', pos);
    }
    if (this.player) {
      const d = this.player.body.pos.distanceTo(pos);
      this.player.shake = Math.max(this.player.shake, Math.max(0, 1 - d / 18));
    }
  }

  applyDamage(target, amount, attacker, head, weapon, fromPos) {
    if (!target.alive || (this.state !== 'playing')) return;
    target.health -= amount;
    target.lastDamageT = this.time;
    if (attacker !== target) attacker.stats.damage += amount;
    const killed = target.health <= 0;

    if (target === this.player) {
      const d = _v.subVectors(fromPos, target.body.pos);
      const yaw = target.yaw;
      const lx = d.x * Math.cos(yaw) - d.z * Math.sin(yaw);
      const lf = -d.x * Math.sin(yaw) - d.z * Math.cos(yaw);
      this.hud.damageFrom(Math.atan2(lx, lf));
      audio.hurt();
      this.player.shake = Math.max(this.player.shake, 0.25);
    } else {
      target.model.hitFlash();
      this.hud.enemyShowT = 3;
      const p = target.eyePos(new THREE.Vector3());
      this.hud.damageNumber(p, amount, head, this.camera);
      if (attacker === this.player) {
        this.hud.hit(head, killed);
        audio.hit(head);
      }
      // 撃たれたら撃ち返す（ボットは被弾で位置を把握）
      if (attacker === this.player) { target.lastSeen.copy(this.player.body.pos); target.lostT = Math.min(target.lostT, 0.5); }
    }

    if (killed) this.onKill(attacker, target, weapon, head);
  }

  onKill(killer, victim, weapon, head) {
    victim.health = 0;
    const scorer = killer === victim ? this.opponentOf(victim) : killer;
    this.score[scorer.team]++;
    scorer.stats.kills++;
    if (victim === this.bot) {
      const meshes = this.bot.kill();
      const imp = victim.body.pos.clone().sub(killer.body.pos).setY(0).normalize().multiplyScalar(weapon === 'grenade' ? 8 : 3);
      this.effects.shatter(meshes, victim.centerPos(new THREE.Vector3()), imp);
      audio.kill();
    } else {
      victim.alive = false;
      this.viewmodel.show('none');
    }
    this.hud.feed(killer === victim ? victim.name : killer.name, victim.name, weapon, head, scorer.team);
    this.hud.setScores(this.score.blue, this.score.red, SCORE_TO_WIN);
    this.endRound(scorer.team);
  }

  sound3D(kind, pos, extra = {}) {
    const cam = this.camera;
    const d = _v.subVectors(pos, cam.position);
    const dist = d.length();
    const right = _v2.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const pan = dist > 0.01 ? d.normalize().dot(right) * 0.8 : 0;
    const o = { pan, dist, ...extra };
    if (kind === 'ar' || kind === 'pistol') audio.shot(kind, o);
    else if (kind === 'explosion') audio.explosion(o);
    else if (kind === 'bounce') audio.bounce(o);
    else if (kind === 'step') audio.step(o);
    else if (kind === 'punch') audio.punch(o);
  }

  onReloaded() {}

  separate() {
    const a = this.player.body, b = this.bot.body;
    if (!this.player.alive || !this.bot.alive) return;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz), min = a.radius + b.radius;
    if (d < min && d > 1e-4 && a.pos.y < b.pos.y + b.height && b.pos.y < a.pos.y + a.height) {
      const push = (min - d) / 2;
      a.pos.x -= dx / d * push; a.pos.z -= dz / d * push;
      b.pos.x += dx / d * push; b.pos.z += dz / d * push;
    }
  }

  // ---------------- ループ ----------------
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.scene) return;
    if (this.state === 'menu') {
      // メニュー背景：カメラをゆっくり回す
      this.time += dt;
      const r = this.mapId === 'battleground' ? 30 : 20;
      this.camera.position.set(Math.cos(this.time * 0.08) * r, 9, Math.sin(this.time * 0.08) * r);
      this.camera.fov = 60; this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 1.5, 0);
      this.effects.update(dt);
      this.render(false);
      return;
    }
    if (!this.paused) this.update(dt);
    this.render(this.player && this.player.alive && this.state !== 'matchEnd');
  }

  update(dt) {
    this.time += dt;
    const p = this.player, bot = this.bot;
    const active = this.state === 'playing';

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n < this.lastBeep && n > 0) {
        this.lastBeep = n;
        audio.beep(false);
        this.hud.showBanner(String(n), '', 'count', 0.9);
      }
      if (this.countdown <= 0) {
        this.state = 'playing';
        audio.beep(true);
        this.hud.showBanner('FIGHT!', '', 'fight', 0.9);
      }
    } else if (this.state === 'playing') {
      if (!this.overtime) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          if (this.score.blue !== this.score.red) { this.endMatch(); return; }
          this.overtime = true;
          this.hud.showBanner('サドンデス', '次のキルで勝利！', 'ot', 2.2);
          audio.beep(true);
        }
      }
    } else if (this.state === 'roundEnd') {
      this.roundEndT -= dt;
      if (this.roundEndT <= 0) {
        if (this.pendingMatchEnd) { this.endMatch(); return; }
        this.startRound();
        return;
      }
    }
    this.hud.setTimer(this.timeLeft, this.overtime);

    const canMove = this.state === 'playing' || this.state === 'roundEnd';
    const canLook = this.state !== 'matchEnd';
    if (canLook) p.update(dt, canMove && p.alive);
    bot.update(dt, p, active || (this.state === 'roundEnd' && bot.alive && false));
    if (this.state === 'countdown') {
      // カウントダウン中は移動禁止（向きは変えられる）
      p.body.vel.x = p.body.vel.z = 0;
    }
    this.separate();
    this.updateGrenades(dt);
    this.effects.update(dt);

    // カメラ
    const cam = this.camera;
    if (p.alive) {
      p.eyePos(cam.position);
      cam.position.y -= p.landDip;
      const sh = p.shake * p.shake * 0.05;
      cam.rotation.set(p.pitch + (Math.random() - 0.5) * sh, p.yaw + (Math.random() - 0.5) * sh, p.slideT > 0 ? 0.05 : 0);
      let fov = this.settings.fov;
      if (p.def.type === 'gun') fov = THREE.MathUtils.lerp(fov, p.def.adsFov, p.ads);
      if (p.sprinting) fov += 5;
      if (p.slideT > 0) fov += 7;
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 14);
      cam.updateProjectionMatrix();
      this.viewmodel.update({
        dt, speed: Math.hypot(p.body.vel.x, p.body.vel.z), onGround: p.body.onGround, ads: p.ads,
        sprint: p.sprinting, lookDX: p.lookDX, lookDY: p.lookDY, reloadP: p.reloadProgress,
        equipP: 1 - p.equipT / 0.32, landDip: p.landDip * 1.5,
      });
      p.lookDX = 0; p.lookDY = 0;
    } else {
      // デスカメラ
      this.deathCam = Math.min(1, this.deathCam + dt * 1.5);
      const k = this.deathCam;
      cam.position.y = Math.max(p.body.pos.y + 0.35, cam.position.y - dt * 3);
      cam.rotation.z = k * 0.6;
      if (bot.alive) {
        const t = bot.centerPos(_v);
        const dx = t.x - cam.position.x, dz = t.z - cam.position.z, dy = t.y - cam.position.y;
        const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
        cam.rotation.y += Math.atan2(Math.sin(yaw - cam.rotation.y), Math.cos(yaw - cam.rotation.y)) * Math.min(1, dt * 3);
        cam.rotation.x += (pitch - cam.rotation.x) * Math.min(1, dt * 3);
      }
    }
    this.hud.update(dt, this);
  }

  render(withViewModel) {
    const r = this.renderer;
    if (this.quality === 'high' && this.composer) this.composer.render();
    else r.render(this.scene, this.camera);
    if (withViewModel) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.viewmodel.scene, this.viewmodel.camera);
      r.autoClear = true;
    }
  }

  previewMap(id) {
    this.mapId = id;
    this.loadMap(id);
    this.state = 'menu';
  }
}
