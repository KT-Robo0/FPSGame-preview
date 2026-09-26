import * as THREE from 'three';

export const GRAVITY = 22;
const STEP = 0.55;
const EPS = 1e-4;

// 当たり判定の世界（AABB + スロープ）。プレイヤーとボットの物理を共通で扱う。
export class World {
  constructor() {
    this.boxes = [];
    this.ramps = [];
    this.bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ) {
    this.boxes.push({ min: new THREE.Vector3(minX, minY, minZ), max: new THREE.Vector3(maxX, maxY, maxZ) });
  }

  // axis: 'x' | 'z'。h0 は座標の小さい側、h1 は大きい側の高さ
  addRamp(x0, x1, z0, z1, axis, h0, h1) {
    const r = { x0, x1, z0, z1, axis, h0, h1 };
    const len = axis === 'z' ? z1 - z0 : x1 - x0;
    r.k = (h1 - h0) / len;
    r.c = h0 - r.k * (axis === 'z' ? z0 : x0);
    r.normal = axis === 'z'
      ? new THREE.Vector3(0, 1, -r.k).normalize()
      : new THREE.Vector3(-r.k, 1, 0).normalize();
    r.top = Math.max(h0, h1);
    this.ramps.push(r);
  }

  rampHeight(r, x, z) {
    const u = r.axis === 'z' ? z : x;
    const lo = r.axis === 'z' ? r.z0 : r.x0, hi = r.axis === 'z' ? r.z1 : r.x1;
    return r.k * THREE.MathUtils.clamp(u, lo, hi) + r.c;
  }

  inRamp(r, x, z, pad = 0) {
    return x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
  }

  _overlaps(b, box, y = b.pos.y) {
    const r = b.radius;
    return b.pos.x + r > box.min.x && b.pos.x - r < box.max.x &&
      b.pos.z + r > box.min.z && b.pos.z - r < box.max.z &&
      y < box.max.y - EPS && y + b.height > box.min.y + EPS;
  }

  _blockedAt(b, y) {
    for (const box of this.boxes) if (this._overlaps(b, box, y)) return true;
    return false;
  }

  _resolveAxis(b, axis) {
    const r = b.radius;
    for (const box of this.boxes) {
      if (!this._overlaps(b, box)) continue;
      const stepH = box.max.y - b.pos.y;
      if (stepH > 0 && stepH <= STEP && b.onGround && !this._blockedAt(b, box.max.y + 0.01)) {
        b.pos.y = box.max.y;
        continue;
      }
      const c = (box.min[axis] + box.max[axis]) / 2;
      b.pos[axis] = b.pos[axis] < c ? box.min[axis] - r - EPS : box.max[axis] + r + EPS;
      b.vel[axis] = 0;
      b.hitWall = true;
    }
    // スロープの側面・下側は壁として扱う
    for (const rp of this.ramps) {
      if (!this.inRamp(rp, b.pos.x, b.pos.z, r)) continue;
      const hy = this.rampHeight(rp, b.pos.x, b.pos.z);
      if (b.pos.y < hy - STEP && b.pos.y + b.height > 0) {
        const lo = axis === 'x' ? rp.x0 : rp.z0, hi = axis === 'x' ? rp.x1 : rp.z1;
        const c = (lo + hi) / 2;
        b.pos[axis] = b.pos[axis] < c ? lo - r - EPS : hi + r + EPS;
        b.vel[axis] = 0;
        b.hitWall = true;
      }
    }
  }

  moveBody(b, dt) {
    const wasGround = b.onGround;
    b.hitWall = false;
    b.pos.x += b.vel.x * dt; this._resolveAxis(b, 'x');
    b.pos.z += b.vel.z * dt; this._resolveAxis(b, 'z');

    const prevY = b.pos.y;
    b.vel.y -= GRAVITY * dt;
    b.pos.y += b.vel.y * dt;
    b.onGround = false;

    for (const box of this.boxes) {
      if (!this._overlaps(b, box)) continue;
      if (b.vel.y <= 0 && prevY >= box.max.y - 0.3) {
        b.pos.y = box.max.y; b.vel.y = 0; b.onGround = true;
      } else if (b.vel.y > 0 && prevY + b.height <= box.min.y + 0.3) {
        b.pos.y = box.min.y - b.height; b.vel.y = 0;
      }
    }
    for (const rp of this.ramps) {
      if (!this.inRamp(rp, b.pos.x, b.pos.z)) continue;
      const hy = this.rampHeight(rp, b.pos.x, b.pos.z);
      const snap = wasGround && b.vel.y <= 0 && b.pos.y - hy < 0.35;
      if ((b.pos.y <= hy && prevY >= hy - STEP - 0.1) || (snap && b.pos.y >= hy - 0.01)) {
        b.pos.y = hy; b.vel.y = Math.max(0, b.vel.y); b.onGround = true;
      }
    }
    // 下り段差のスナップ（小さな段差で浮かないように）
    if (!b.onGround && wasGround && b.vel.y <= 0) {
      for (const box of this.boxes) {
        const d = b.pos.y - box.max.y;
        if (d > 0 && d < 0.3 && this._overlaps(b, box, box.max.y - 0.01)) {
          b.pos.y = box.max.y; b.vel.y = 0; b.onGround = true; break;
        }
      }
    }
    if (b.pos.y <= 0) { b.pos.y = 0; b.vel.y = Math.max(0, b.vel.y); b.onGround = true; }

    const B = this.bounds;
    b.pos.x = THREE.MathUtils.clamp(b.pos.x, B.minX + b.radius, B.maxX - b.radius);
    b.pos.z = THREE.MathUtils.clamp(b.pos.z, B.minZ + b.radius, B.maxZ - b.radius);
  }

  // レイキャスト：{dist, point, normal} or null
  raycast(o, d, far = 500) {
    let best = far, normal = null;
    for (const box of this.boxes) {
      let tmin = -Infinity, tmax = Infinity, axisIn = -1, signIn = 0;
      let miss = false;
      for (let a = 0; a < 3; a++) {
        const key = a === 0 ? 'x' : a === 1 ? 'y' : 'z';
        const oa = o[key], da = d[key], mn = box.min[key], mx = box.max[key];
        if (Math.abs(da) < 1e-9) {
          if (oa < mn || oa > mx) { miss = true; break; }
          continue;
        }
        let t1 = (mn - oa) / da, t2 = (mx - oa) / da, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axisIn = a; signIn = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { miss = true; break; }
      }
      if (miss || tmax < 0 || tmin < 0 || tmin >= best) continue;
      best = tmin;
      normal = new THREE.Vector3();
      normal.setComponent(axisIn, signIn);
    }
    for (const r of this.ramps) {
      const f0 = o.y - r.k * (r.axis === 'z' ? o.z : o.x) - r.c;
      const df = d.y - r.k * (r.axis === 'z' ? d.z : d.x);
      if (Math.abs(df) < 1e-9) continue;
      const t = -f0 / df;
      if (t <= 0 || t >= best) continue;
      const px = o.x + d.x * t, pz = o.z + d.z * t;
      if (!this.inRamp(r, px, pz)) continue;
      best = t; normal = r.normal.clone();
      if (f0 < 0) normal.negate();
    }
    if (d.y < 0) {
      const t = -o.y / d.y;
      if (t > 0 && t < best) { best = t; normal = new THREE.Vector3(0, 1, 0); }
    }
    if (!normal) return null;
    return { dist: best, point: o.clone().addScaledVector(d, best), normal };
  }

  segmentBlocked(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-5) return false;
    d.divideScalar(len);
    const hit = this.raycast(a, d, len);
    return !!hit && hit.dist < len - 0.05;
  }
}

// 物理ボディ（プレイヤー・ボット共通）
export class Body {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = 0.38;
    this.height = 1.8;
    this.onGround = false;
    this.hitWall = false;
  }
}
