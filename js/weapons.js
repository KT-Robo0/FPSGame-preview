import * as THREE from 'three';
import { flashTexture } from './textures.js';

export const WEAPONS = {
  ar: {
    id: 'ar', slot: 1, name: 'アサルトライフル', short: 'AR', type: 'gun',
    body: 12, head: 15, mag: 20, reserve: 100, interval: 0.1, auto: true, reload: 2.0,
    spread: 0.022, adsSpread: 0.004, moveSpread: 0.03, recoil: 0.013, adsFov: 52, adsTime: 0.18, range: 250,
  },
  pistol: {
    id: 'pistol', slot: 2, name: 'ハンドガン', short: 'PISTOL', type: 'gun',
    body: 12, head: 15, mag: 13, reserve: 75, interval: 0.16, auto: false, reload: 1.4,
    spread: 0.014, adsSpread: 0.004, moveSpread: 0.02, recoil: 0.024, adsFov: 60, adsTime: 0.14, range: 200,
  },
  fist: {
    id: 'fist', slot: 3, name: '拳', short: 'FIST', type: 'melee',
    damage: 30, interval: 0.42, range: 2.7, speedMul: 1.12, doubleJump: true,
  },
  grenade: {
    id: 'grenade', slot: 4, name: 'グレネード', short: 'GRENADE', type: 'utility',
    damage: 75, radius: 6.5, cooldown: 50, fuse: 2.0,
  },
};
export const SLOT_ORDER = ['ar', 'pistol', 'fist', 'grenade'];
export const EQUIP_TIME = 0.32;

// 各キャラクターが持つ弾薬とクールダウン
export class Loadout {
  constructor() {
    this.ammo = {};
    this.grenadeCd = 0;
    this.refill();
  }
  refill() {
    for (const id of ['ar', 'pistol']) this.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  }
}

// ---------- 共有モデル ----------
const M = {
  dark: () => new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.45, metalness: 0.7 }),
  mid: () => new THREE.MeshStandardMaterial({ color: 0x3b3f48, roughness: 0.5, metalness: 0.6 }),
  poly: () => new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.8, metalness: 0.1 }),
  accent: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.4 }),
  glow: (c) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: 3 }),
  skin: () => new THREE.MeshStandardMaterial({ color: 0xf1c7a0, roughness: 0.7 }),
  glove: () => new THREE.MeshStandardMaterial({ color: 0x1d1f26, roughness: 0.75 }),
  sleeve: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }),
};

function bx(w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}
function cyl(r, len, m, x, y, z, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

export function buildGunModel(kind, accent = 0x3d9bff) {
  const g = new THREE.Group();
  const dark = M.dark(), mid = M.mid(), poly = M.poly(), acc = M.accent(accent);
  const muzzle = new THREE.Object3D();
  if (kind === 'ar') {
    g.add(bx(0.07, 0.085, 0.4, mid, 0, 0, 0));                 // レシーバー
    g.add(bx(0.072, 0.02, 0.2, acc, 0, 0.03, -0.02));           // アクセント
    g.add(bx(0.066, 0.068, 0.26, dark, 0, 0.004, -0.32));       // ハンドガード
    for (let i = 0; i < 4; i++) g.add(bx(0.07, 0.012, 0.03, poly, 0, 0.004, -0.23 - i * 0.055));
    g.add(cyl(0.013, 0.2, dark, 0, 0.012, -0.54));             // バレル
    g.add(bx(0.034, 0.034, 0.07, poly, 0, 0.012, -0.66));        // マズル
    g.add(bx(0.045, 0.16, 0.075, poly, 0, -0.1, -0.06, 0.22));  // マガジン
    g.add(bx(0.04, 0.11, 0.05, poly, 0, -0.085, 0.1, -0.35));   // グリップ
    g.add(bx(0.05, 0.075, 0.22, poly, 0, -0.012, 0.3));         // ストック
    g.add(bx(0.055, 0.1, 0.04, poly, 0, -0.03, 0.41));
    g.add(bx(0.02, 0.012, 0.28, dark, 0, 0.05, -0.05));         // レール
    g.add(bx(0.04, 0.04, 0.09, dark, 0, 0.077, -0.02));         // ドットサイト
    g.add(bx(0.034, 0.03, 0.005, M.glow(0x00ffc8), 0, 0.08, -0.064));
    const dot = bx(0.004, 0.004, 0.002, M.glow(0xff2040), 0, 0.078, 0.02);
    g.add(dot);
    muzzle.position.set(0, 0.012, -0.72);
    g.userData.sightY = 0.078;
  } else if (kind === 'pistol') {
    g.add(bx(0.038, 0.042, 0.19, mid, 0, 0.02, -0.02));         // スライド
    g.add(bx(0.04, 0.008, 0.12, acc, 0, 0.044, -0.02));
    for (let i = 0; i < 5; i++) g.add(bx(0.04, 0.03, 0.004, dark, 0, 0.022, 0.04 + i * 0.01));
    g.add(bx(0.034, 0.03, 0.17, poly, 0, -0.012, -0.03));        // フレーム
    g.add(bx(0.034, 0.11, 0.055, poly, 0, -0.07, 0.04, -0.25)); // グリップ
    g.add(bx(0.008, 0.012, 0.01, dark, 0, 0.047, -0.1));        // フロントサイト
    g.add(bx(0.03, 0.012, 0.01, dark, 0, 0.047, 0.06));
    g.add(bx(0.006, 0.006, 0.002, M.glow(0x00ff88), 0, 0.05, -0.1));
    muzzle.position.set(0, 0.022, -0.13);
    g.userData.sightY = 0.05;
  }
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  return g;
}

export function buildGrenadeModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshStandardMaterial({ color: 0x3d5a2a, roughness: 0.6, metalness: 0.2 }));
  body.scale.y = 1.15;
  g.add(body);
  g.add(bx(0.03, 0.03, 0.03, M.dark(), 0, 0.06, 0));
  g.add(bx(0.012, 0.07, 0.02, M.mid(), 0.025, 0.04, 0, 0, 0, -0.3));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 6, 16), M.mid());
  ring.position.set(-0.02, 0.075, 0); g.add(ring);
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.051, 0.004, 6, 24), M.poly());
    band.rotation.x = Math.PI / 2; band.position.y = -0.025 + i * 0.025; g.add(band);
  }
  return g;
}

function buildArm(side, sleeveColor) {
  // 前腕 + 手（side: 1 右, -1 左）
  const arm = new THREE.Group();
  arm.add(bx(0.075, 0.075, 0.34, M.sleeve(sleeveColor), 0, 0, 0.17));
  arm.add(bx(0.08, 0.02, 0.04, M.sleeve(0x111111), 0, 0, 0.02));
  const hand = new THREE.Group();
  hand.add(bx(0.07, 0.065, 0.08, M.glove(), 0, 0, -0.02));
  hand.add(bx(0.03, 0.03, 0.05, M.skin(), side * 0.03, 0.02, -0.06));
  arm.add(hand);
  return arm;
}

function buildFist(side) {
  const f = new THREE.Group();
  f.add(bx(0.085, 0.085, 0.36, M.sleeve(0x2459c4), 0, 0, 0.2));
  f.add(bx(0.1, 0.1, 0.1, M.glove(), 0, 0, -0.02));
  for (let i = 0; i < 4; i++) f.add(bx(0.022, 0.03, 0.03, M.skin(), -0.035 + i * 0.023, 0.03, -0.075));
  f.add(bx(0.03, 0.03, 0.05, M.skin(), side * -0.05, -0.01, -0.04));
  const band = bx(0.105, 0.03, 0.03, M.accent(0xffcc33), 0, 0, 0.04);
  f.add(band);
  return f;
}

// ======================================================
// 一人称ビューモデル（別シーンで描画し、壁へのめり込みを防ぐ）
// ======================================================
export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3440, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(0.6, 1, 0.8); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.2);
    rim.position.set(-1, 0.3, -1); this.scene.add(rim);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.models = {};

    // AR
    const ar = new THREE.Group();
    const arGun = buildGunModel('ar');
    ar.add(arGun);
    const rArm = buildArm(1, 0x2459c4); rArm.position.set(0.02, -0.1, 0.1); rArm.rotation.set(0.75, 0.3, 0); ar.add(rArm);
    const lArm = buildArm(-1, 0x2459c4); lArm.position.set(0.0, -0.06, -0.3); lArm.rotation.set(0.95, -0.55, 0); ar.add(lArm);
    ar.userData = { gun: arGun, hip: new THREE.Vector3(0.2, -0.2, -0.5), ads: new THREE.Vector3(0, -arGun.userData.sightY, -0.36), yaw: 0.05 };
    this.models.ar = ar;

    // ピストル
    const pi = new THREE.Group();
    const piGun = buildGunModel('pistol');
    pi.add(piGun);
    const pr = buildArm(1, 0x2459c4); pr.position.set(0.0, -0.09, 0.06); pr.rotation.set(0.8, 0.2, 0); pi.add(pr);
    const pl = buildArm(-1, 0x2459c4); pl.position.set(-0.035, -0.1, 0.04); pl.rotation.set(0.85, -0.45, 0.2); pi.add(pl);
    pi.userData = { gun: piGun, hip: new THREE.Vector3(0.15, -0.13, -0.42), ads: new THREE.Vector3(0, -piGun.userData.sightY, -0.32), yaw: 0.06 };
    this.models.pistol = pi;

    // 拳
    const fi = new THREE.Group();
    const fl = buildFist(-1), fr = buildFist(1);
    fi.add(fl, fr);
    fi.userData = { left: fl, right: fr, hip: new THREE.Vector3(0, -0.15, -0.46), ads: new THREE.Vector3(0, -0.15, -0.46) };
    this.models.fist = fi;

    // グレネード
    const gr = new THREE.Group();
    const gm = buildGrenadeModel(); gm.position.set(0, 0.02, -0.04);
    const ga = buildArm(1, 0x2459c4); ga.rotation.set(0.35, 0.1, 0); ga.position.set(0, -0.04, 0.05);
    gr.add(gm, ga);
    gr.userData = { nade: gm, hip: new THREE.Vector3(0.18, -0.2, -0.36), ads: new THREE.Vector3(0.18, -0.2, -0.36) };
    this.models.grenade = gr;

    for (const k in this.models) { this.models[k].visible = false; this.root.add(this.models[k]); }

    // マズルフラッシュ
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.set(0.2, 0.2, 0.2);
    this.flash.visible = false;
    this.scene.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffa640, 0, 1.5);
    this.scene.add(this.flashLight);

    this.current = 'ar';
    this.recoil = new THREE.Vector3(); // x: pitch kick, y: yaw, z: back
    this.recoilVel = new THREE.Vector3();
    this.sway = new THREE.Vector2();
    this.bobT = 0;
    this.punchT = 1; this.punchSide = 1;
    this.throwT = 1;
    this.flashT = 0;
    this.tmp = new THREE.Vector3();
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  show(id) {
    for (const k in this.models) this.models[k].visible = k === id;
    this.current = id;
  }

  kick(amount) {
    this.recoilVel.x += amount * 18;
    this.recoilVel.z += amount * 5;
    this.recoilVel.y += (Math.random() - 0.5) * amount * 6;
    this.flashT = 0.05;
    this.flash.material.rotation = Math.random() * Math.PI;
    const s = 0.14 + Math.random() * 0.1;
    this.flash.scale.set(s, s, s);
  }

  punch() { this.punchT = 0; this.punchSide *= -1; }
  throwNade() { this.throwT = 0; }

  muzzleWorld(target) {
    const m = this.models[this.current];
    if (!m || !m.userData.gun) return null;
    return m.userData.gun.userData.muzzle.getWorldPosition(target);
  }

  // s: {dt, speed, onGround, ads, sprint, lookDX, lookDY, reloadP, equipP, crouch}
  update(s) {
    const dt = s.dt;
    const m = this.models[this.current];
    if (!m) return;

    // バネでリコイルを戻す
    const k = 180, damp = 18;
    this.recoilVel.addScaledVector(this.recoil, -k * dt);
    this.recoilVel.multiplyScalar(Math.max(0, 1 - damp * dt));
    this.recoil.addScaledVector(this.recoilVel, dt);

    // スウェイ
    this.sway.x = THREE.MathUtils.lerp(this.sway.x, THREE.MathUtils.clamp(-s.lookDX * 0.0009, -0.05, 0.05), 1 - Math.exp(-10 * dt));
    this.sway.y = THREE.MathUtils.lerp(this.sway.y, THREE.MathUtils.clamp(s.lookDY * 0.0009, -0.05, 0.05), 1 - Math.exp(-10 * dt));

    // ボブ
    const moving = s.onGround ? Math.min(1, s.speed / 7) : 0;
    this.bobT += dt * (s.sprint ? 13 : 9.5) * moving;
    const adsK = s.ads;
    const bobAmp = (1 - adsK * 0.85) * moving;
    const bobX = Math.sin(this.bobT) * 0.012 * bobAmp;
    const bobY = -Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmp;

    const ud = m.userData;
    const pos = this.tmp.copy(ud.hip).lerp(ud.ads, adsK);
    pos.x += bobX + this.sway.x * (1 - adsK * 0.7);
    pos.y += bobY + this.sway.y * (1 - adsK * 0.7);
    pos.z += this.recoil.z * 0.04;
    m.position.copy(pos);
    m.rotation.set(this.recoil.x * 0.06 + this.sway.y * 1.5, this.recoil.y * 0.05 + this.sway.x * 1.5 + (ud.yaw || 0) * (1 - adsK), 0);

    if (s.sprint && !adsK && ud.gun) {
      m.rotation.x -= 0.35; m.rotation.y += 0.55; m.position.x -= 0.05; m.position.y -= 0.03;
    }
    // 着地の沈み込み
    m.position.y -= s.landDip || 0;

    // 持ち替え
    if (s.equipP < 1) {
      const e = 1 - s.equipP;
      m.position.y -= e * e * 0.35;
      m.rotation.x -= e * 0.9;
    }
    // リロード
    if (s.reloadP >= 0 && s.reloadP < 1 && ud.gun) {
      const r = Math.sin(s.reloadP * Math.PI);
      m.rotation.x += r * 0.35;
      m.rotation.z += r * 0.6;
      m.position.y -= r * 0.07;
      m.position.x -= r * 0.04;
    }

    // 拳
    if (this.current === 'fist') {
      this.punchT = Math.min(1, this.punchT + dt / 0.3);
      const base = [[-0.15, 0, 0], [0.15, 0, 0]];
      const fists = [ud.left, ud.right];
      for (let i = 0; i < 2; i++) {
        const f = fists[i];
        const side = i === 0 ? -1 : 1;
        f.position.set(base[i][0], base[i][1] + Math.sin(this.bobT + i) * 0.006, base[i][2]);
        f.rotation.set(0.55, side * -0.2, side * -0.3);
        if (this.punchSide === side && this.punchT < 1) {
          const p = this.punchT < 0.35 ? this.punchT / 0.35 : 1 - (this.punchT - 0.35) / 0.65;
          const e = Math.sin(p * Math.PI / 2);
          f.position.z -= e * 0.28;
          f.position.x -= side * e * 0.12;
          f.position.y += e * 0.06;
          f.rotation.z += side * e * 0.5;
        }
      }
    }
    // グレネード投擲
    if (this.current === 'grenade') {
      this.throwT = Math.min(1, this.throwT + dt / 0.45);
      const t = this.throwT;
      ud.nade.visible = t < 0.45 || t >= 1;
      if (t < 1) {
        const back = t < 0.35 ? t / 0.35 : Math.max(0, 1 - (t - 0.35) / 0.2);
        const fwd = t < 0.35 ? 0 : Math.sin(Math.min(1, (t - 0.35) / 0.3) * Math.PI);
        m.position.z += back * 0.12 - fwd * 0.25;
        m.position.y += back * 0.12 + fwd * 0.05;
        m.rotation.x += back * -0.8 + fwd * 0.9;
      }
    }

    // マズルフラッシュ
    this.flashT -= dt;
    const showFlash = this.flashT > 0 && ud.gun;
    this.flash.visible = !!showFlash;
    this.flashLight.intensity = showFlash ? 4 : 0;
    if (showFlash) {
      m.updateMatrixWorld(true);
      ud.gun.userData.muzzle.getWorldPosition(this.flash.position);
      this.flashLight.position.copy(this.flash.position);
    }
  }
}
