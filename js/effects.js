import * as THREE from 'three';
import { glowTexture, decalTexture, smokeTexture, flashTexture } from './textures.js';

const MAX_PARTICLES = 900;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    // 火花・破片パーティクル
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.09, map: glowTexture(), vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles.push({ life: 0 });
    this.pIdx = 0;

    // トレーサー
    this.tracers = [];
    const tGeo = new THREE.BoxGeometry(1, 1, 1);
    tGeo.translate(0, 0, -0.5);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      this.group.add(m);
      this.tracers.push({ mesh: m, t: 0, dur: 0.07 });
    }
    this.tIdx = 0;

    // 弾痕デカール
    this.decals = [];
    const dGeo = new THREE.PlaneGeometry(0.16, 0.16);
    const dMat = new THREE.MeshBasicMaterial({ map: decalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(dGeo, dMat);
      m.visible = false;
      this.group.add(m);
      this.decals.push(m);
    }
    this.dIdx = 0;

    // 煙
    this.smokes = [];
    for (let i = 0; i < 60; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, color: 0x888888 }));
      s.visible = false;
      this.group.add(s);
      this.smokes.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 1 });
    }
    this.sIdx = 0;

    // 爆発フラッシュ
    this.flashes = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false;
      const light = new THREE.PointLight(0xff9a3c, 0, 18, 1.5);
      this.group.add(s, light);
      this.flashes.push({ s, light, t: 1 });
    }
    this.fIdx = 0;

    // 衝撃波リング
    this.rings = [];
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffc080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      r.rotation.x = -Math.PI / 2; r.visible = false;
      this.group.add(r);
      this.rings.push({ m: r, t: 1 });
    }

    // 世界側のマズルライト（ボット用）
    this.muzzleLights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffa24a, 0, 7, 2);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.visible = false; sp.scale.setScalar(0.45);
      this.group.add(l, sp);
      this.muzzleLights.push({ l, sp, t: 0 });
    }
    this.mIdx = 0;

    this.debris = [];
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  spawnParticle(pos, vel, color, life, gravity = 9.8, drag = 0) {
    const p = this.particles[this.pIdx];
    this.pIdx = (this.pIdx + 1) % MAX_PARTICLES;
    p.x = pos.x; p.y = pos.y; p.z = pos.z;
    p.vx = vel.x; p.vy = vel.y; p.vz = vel.z;
    p.r = color.r; p.g = color.g; p.b = color.b;
    p.life = life; p.max = life; p.grav = gravity; p.drag = drag;
  }

  sparks(pos, normal, color = new THREE.Color(1, 0.75, 0.35), count = 10, speed = 5) {
    for (let i = 0; i < count; i++) {
      this._v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.4).add(normal).normalize()
        .multiplyScalar(speed * (0.3 + Math.random()));
      this.spawnParticle(pos, this._v, color, 0.2 + Math.random() * 0.35, 12, 2);
    }
  }

  impact(point, normal, surfaceColor) {
    this.sparks(point, normal, new THREE.Color(1, 0.8, 0.45), 7, 5);
    const dust = new THREE.Color(surfaceColor ?? 0x9a9186);
    this.puff(point.clone().addScaledVector(normal, 0.1), 0.25, 0.5, dust, normal.clone().multiplyScalar(0.8));
    this.decal(point, normal);
  }

  bloodHit(point, head) {
    const c = head ? new THREE.Color(1, 0.95, 0.4) : new THREE.Color(1, 0.25, 0.2);
    this.sparks(point, new THREE.Vector3(0, 0.5, 0), c, head ? 18 : 10, head ? 6 : 4);
  }

  decal(point, normal) {
    const m = this.decals[this.dIdx];
    this.dIdx = (this.dIdx + 1) % this.decals.length;
    m.visible = true;
    m.position.copy(point).addScaledVector(normal, 0.01);
    this._v.copy(point).add(normal);
    m.lookAt(this._v);
    m.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.7 + Math.random() * 0.5;
    m.scale.set(s, s, s);
  }

  tracer(from, to, color = 0xffd98a, width = 0.018) {
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    const tr = this.tracers[this.tIdx];
    this.tIdx = (this.tIdx + 1) % this.tracers.length;
    tr.mesh.visible = true;
    tr.mesh.material.color.set(color);
    tr.mesh.material.opacity = 1;
    tr.mesh.position.copy(from);
    tr.mesh.lookAt(to);
    tr.mesh.scale.set(width, width, len);
    tr.t = 0; tr.dur = 0.08;
    tr.from = from.clone(); tr.to = to.clone(); tr.len = len;
  }

  puff(pos, size, life, color, vel) {
    const sm = this.smokes[this.sIdx];
    this.sIdx = (this.sIdx + 1) % this.smokes.length;
    sm.s.visible = true;
    sm.s.position.copy(pos);
    sm.s.material.color.copy(color);
    sm.s.material.opacity = 0.7;
    sm.s.material.rotation = Math.random() * 6;
    sm.size = size; sm.s.scale.setScalar(size);
    sm.life = life; sm.max = life;
    sm.vel.copy(vel || this._v.set(0, 0.5, 0));
    sm.grow = 1.8;
  }

  worldMuzzle(pos) {
    const m = this.muzzleLights[this.mIdx];
    this.mIdx = (this.mIdx + 1) % this.muzzleLights.length;
    m.l.position.copy(pos); m.sp.position.copy(pos);
    m.l.intensity = 6; m.sp.visible = true; m.t = 0.05;
    m.sp.material.rotation = Math.random() * 6;
  }

  explosion(pos) {
    const f = this.flashes[this.fIdx];
    this.fIdx = (this.fIdx + 1) % this.flashes.length;
    f.s.visible = true; f.s.position.copy(pos); f.t = 0;
    f.light.position.copy(pos).y += 0.5;

    const ring = this.rings.find((r) => r.t >= 1) || this.rings[0];
    ring.t = 0; ring.m.visible = true; ring.m.position.set(pos.x, Math.max(0.05, pos.y - 0.2), pos.z);

    const fire = new THREE.Color(1, 0.55, 0.15), hot = new THREE.Color(1, 0.9, 0.6);
    for (let i = 0; i < 90; i++) {
      this._v.set(Math.random() - 0.5, Math.random() * 0.9 - 0.1, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 14);
      this.spawnParticle(pos, this._v, i % 3 ? fire : hot, 0.3 + Math.random() * 0.8, 10, 1.5);
    }
    for (let i = 0; i < 14; i++) {
      this._v.set(Math.random() - 0.5, Math.random() * 0.6 + 0.2, Math.random() - 0.5).multiplyScalar(3);
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5));
      this.puff(p, 1.6 + Math.random() * 1.4, 1.6 + Math.random() * 1.4, new THREE.Color(0.25, 0.23, 0.22), this._v.clone());
    }
    for (let i = 0; i < 6; i++) {
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5)));
      this.puff(p, 1.2 + Math.random(), 0.35, new THREE.Color(1, 0.6, 0.25), new THREE.Vector3(0, 1.5, 0));
    }
    this.decal(new THREE.Vector3(pos.x, 0.01, pos.z), new THREE.Vector3(0, 1, 0));
  }

  // ボットが倒れた時にパーツが飛び散る
  shatter(meshes, origin, impulse) {
    for (const src of meshes) {
      const m = src.clone();
      m.material = src.material.clone();
      m.material.transparent = true;
      src.getWorldPosition(m.position);
      src.getWorldQuaternion(this._q);
      m.quaternion.copy(this._q);
      src.getWorldScale(m.scale);
      m.castShadow = true;
      this.group.add(m);
      const dir = m.position.clone().sub(origin); dir.y = Math.abs(dir.y) + 0.5; dir.normalize();
      const vel = dir.multiplyScalar(3 + Math.random() * 3).add(impulse);
      const half = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).y / 2;
      this.debris.push({
        m, vel, ang: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
        life: 3.2, half: Math.max(0.05, half * 0.6),
      });
    }
  }

  clear() {
    for (const p of this.particles) p.life = 0;
    for (const t of this.tracers) t.mesh.visible = false;
    for (const d of this.decals) d.visible = false;
    for (const s of this.smokes) { s.life = 0; s.s.visible = false; }
    for (const d of this.debris) { this.group.remove(d.m); d.m.material.dispose(); }
    this.debris = [];
  }

  update(dt) {
    // パーティクル
    let n = 0;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const f = p.life / p.max;
      this.pPos[n * 3] = p.x; this.pPos[n * 3 + 1] = p.y; this.pPos[n * 3 + 2] = p.z;
      this.pCol[n * 3] = p.r * f; this.pCol[n * 3 + 1] = p.g * f; this.pCol[n * 3 + 2] = p.b * f;
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;

    for (const tr of this.tracers) {
      if (!tr.mesh.visible) continue;
      tr.t += dt;
      const k = tr.t / tr.dur;
      if (k >= 1) { tr.mesh.visible = false; continue; }
      // トレーサーは始点が進んで短くなる
      tr.mesh.position.lerpVectors(tr.from, tr.to, k * 0.7);
      tr.mesh.scale.z = tr.len * (1 - k * 0.7);
      tr.mesh.material.opacity = 1 - k;
    }

    for (const sm of this.smokes) {
      if (sm.life <= 0) { if (sm.s.visible) sm.s.visible = false; continue; }
      sm.life -= dt;
      const k = 1 - sm.life / sm.max;
      sm.s.position.addScaledVector(sm.vel, dt);
      sm.vel.multiplyScalar(Math.max(0, 1 - 1.5 * dt));
      sm.s.scale.setScalar(sm.size * (1 + k * sm.grow));
      sm.s.material.opacity = 0.7 * (1 - k);
    }

    for (const f of this.flashes) {
      if (f.t >= 1) continue;
      f.t += dt / 0.35;
      const k = Math.min(1, f.t);
      f.s.scale.setScalar(3 + k * 7);
      f.s.material.opacity = 1 - k;
      f.light.intensity = 250 * (1 - k) * (1 - k);
      if (k >= 1) { f.s.visible = false; f.light.intensity = 0; }
    }
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t += dt / 0.4;
      const k = Math.min(1, r.t);
      r.m.scale.setScalar(0.5 + k * 7);
      r.m.material.opacity = (1 - k) * 0.8;
      if (k >= 1) r.m.visible = false;
    }
    for (const m of this.muzzleLights) {
      if (m.t <= 0) continue;
      m.t -= dt;
      if (m.t <= 0) { m.l.intensity = 0; m.sp.visible = false; }
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.vel.y -= 20 * dt;
      d.m.position.addScaledVector(d.vel, dt);
      if (d.m.position.y < d.half) {
        d.m.position.y = d.half;
        d.vel.y *= -0.35; d.vel.x *= 0.7; d.vel.z *= 0.7; d.ang.multiplyScalar(0.7);
      }
      d.m.rotation.x += d.ang.x * dt; d.m.rotation.y += d.ang.y * dt; d.m.rotation.z += d.ang.z * dt;
      if (d.life < 0.8) d.m.material.opacity = Math.max(0, d.life / 0.8);
      if (d.life <= 0) {
        this.group.remove(d.m);
        d.m.material.dispose();
        this.debris.splice(i, 1);
      }
    }
  }
}
