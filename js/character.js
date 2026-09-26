import * as THREE from 'three';
import { buildGunModel, buildGrenadeModel } from './weapons.js';

function part(w, h, d, mat, y, hitTag) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = y;
  m.castShadow = true;
  m.receiveShadow = true;
  if (hitTag) m.userData.hit = hitTag;
  return m;
}

// ブロック調のキャラクターモデル（ライバル）
export class CharacterModel {
  constructor({ shirt = 0xe0303f, pants = 0x2a2c35, skin = 0xf1c7a0, accent = 0xff5060 } = {}) {
    this.root = new THREE.Group();
    this.mats = [];
    const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o }); this.mats.push(m); return m; };
    const shirtM = M(shirt), pantsM = M(pants), skinM = M(skin), shoeM = M(0x15161a), accM = M(accent, { emissive: accent, emissiveIntensity: 0.6 });
    const visorM = M(0x101218, { roughness: 0.2, metalness: 0.8 });

    // 脚（腰を支点に回転）
    this.legL = new THREE.Group(); this.legL.position.set(-0.16, 0.85, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.16, 0.85, 0);
    for (const leg of [this.legL, this.legR]) {
      leg.add(part(0.3, 0.72, 0.32, pantsM, -0.38, 'body'));
      leg.add(part(0.32, 0.14, 0.38, shoeM, -0.78, 'body'));
      leg.children[1].position.z = -0.03;
    }
    // 胴体
    this.torso = new THREE.Group(); this.torso.position.y = 0.85;
    const chest = part(0.7, 0.65, 0.36, shirtM, 0.33, 'body');
    this.torso.add(chest);
    this.torso.add(part(0.72, 0.08, 0.38, accM, 0.5, null));
    this.torso.add(part(0.4, 0.3, 0.1, M(0x2a2c35), 0.3, null));
    this.torso.children[2].position.z = -0.2;
    // 頭
    this.headPivot = new THREE.Group(); this.headPivot.position.y = 0.68;
    const head = part(0.4, 0.4, 0.4, skinM, 0.22, 'head');
    this.headPivot.add(head);
    const visor = part(0.34, 0.1, 0.05, visorM, 0.26, null); visor.position.z = -0.2; this.headPivot.add(visor);
    const band = part(0.42, 0.06, 0.42, accM, 0.34, null); this.headPivot.add(band);
    const hair = part(0.42, 0.1, 0.42, M(0x2a1a12), 0.42, 'head'); this.headPivot.add(hair);
    this.head = head;
    this.torso.add(this.headPivot);

    // 腕（肩を支点に）
    this.armL = new THREE.Group(); this.armL.position.set(-0.46, 0.58, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.46, 0.58, 0);
    for (const arm of [this.armL, this.armR]) {
      arm.add(part(0.22, 0.62, 0.24, shirtM, -0.28, 'body'));
      arm.add(part(0.2, 0.14, 0.2, skinM, -0.64, 'body'));
    }
    this.torso.add(this.armL, this.armR);

    // 武器（右手）
    this.weapons = {
      ar: buildGunModel('ar', accent),
      pistol: buildGunModel('pistol', accent),
      grenade: buildGrenadeModel(),
    };
    for (const k in this.weapons) {
      const w = this.weapons[k];
      w.scale.setScalar(k === 'grenade' ? 1.8 : 1.6);
      w.position.set(0, -0.68, 0.02);
      w.rotation.x = -Math.PI / 2;
      w.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      w.visible = false;
      this.armR.add(w);
    }

    this.root.add(this.legL, this.legR, this.torso);
    this.hitMeshes = [];
    this.root.traverse((o) => { if (o.isMesh && o.userData.hit) this.hitMeshes.push(o); });

    this.walkT = 0;
    this.flashT = 0;
    this.punchT = 1;
    this.throwT = 1;
    this.weapon = 'ar';
    this.setWeapon('ar');
  }

  setWeapon(id) {
    this.weapon = id;
    for (const k in this.weapons) this.weapons[k].visible = k === id;
  }

  muzzleWorld(target) {
    const w = this.weapons[this.weapon];
    if (w && w.userData.muzzle) return w.userData.muzzle.getWorldPosition(target);
    return this.armR.getWorldPosition(target);
  }

  hitFlash() { this.flashT = 0.12; }
  punch() { this.punchT = 0; }
  throwNade() { this.throwT = 0; }

  // s: {dt, speed, pitch, onGround, crouch}
  animate(s) {
    const dt = s.dt;
    const moveK = Math.min(1, s.speed / 6);
    this.walkT += dt * 10 * moveK;
    const swing = Math.sin(this.walkT) * 0.75 * moveK;
    if (s.onGround) {
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
    } else {
      this.legL.rotation.x = THREE.MathUtils.lerp(this.legL.rotation.x, -0.5, 10 * dt);
      this.legR.rotation.x = THREE.MathUtils.lerp(this.legR.rotation.x, 0.4, 10 * dt);
    }
    this.torso.position.y = 0.85 + Math.abs(Math.cos(this.walkT)) * 0.04 * moveK;
    this.headPivot.rotation.x = s.pitch * 0.6;

    // 腕はデフォルトで下向き。x回転 π/2 で前方(-z)を向く
    const aim = Math.PI / 2 + s.pitch;
    this.armR.position.z = 0;
    this.armL.position.z = 0;
    if (this.weapon === 'fist') {
      this.punchT = Math.min(1, this.punchT + dt / 0.3);
      const p = this.punchT < 1 ? Math.sin(this.punchT * Math.PI) : 0;
      this.armR.rotation.set(aim - 0.35 + p * 0.35, 0, 0);
      this.armL.rotation.set(aim - 0.4, 0, 0.25);
      this.armR.position.z = -p * 0.35;
    } else if (this.weapon === 'grenade') {
      this.throwT = Math.min(1, this.throwT + dt / 0.5);
      const t = this.throwT;
      let a;
      if (t < 0.4) a = THREE.MathUtils.lerp(aim - 0.3, Math.PI + 0.4, t / 0.4);
      else a = THREE.MathUtils.lerp(Math.PI + 0.4, aim - 0.3, Math.min(1, (t - 0.4) / 0.25));
      this.armR.rotation.set(a, 0, 0);
      this.armL.rotation.set(aim - 0.6, 0, 0.3);
    } else {
      this.armR.rotation.set(aim, 0, 0);
      this.armL.rotation.set(aim + 0.05, 0, 0.65);
      this.armL.position.z = -0.05;
    }
    if (s.recoil) this.armR.rotation.x += s.recoil;

    this.flashT -= dt;
    const f = Math.max(0, this.flashT / 0.12);
    for (const m of this.mats) {
      if (m.userData.baseEm === undefined) m.userData.baseEm = m.emissive.clone(), m.userData.baseEI = m.emissiveIntensity;
      if (f > 0) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = f * 0.9; }
      else { m.emissive.copy(m.userData.baseEm); m.emissiveIntensity = m.userData.baseEI; }
    }
  }
}
