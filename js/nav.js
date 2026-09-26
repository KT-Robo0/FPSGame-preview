// ボット用ナビゲーショングリッド（A*）
export class NavGrid {
  constructor(world, cell = 1.0) {
    const B = world.bounds;
    this.world = world;
    this.cell = cell;
    this.ox = B.minX; this.oz = B.minZ;
    this.w = Math.floor((B.maxX - B.minX) / cell);
    this.h = Math.floor((B.maxZ - B.minZ) / cell);
    this.walk = new Uint8Array(this.w * this.h);
    this.gy = new Float32Array(this.w * this.h);
    const R = 0.5;
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = this.ox + (i + 0.5) * cell, z = this.oz + (j + 0.5) * cell;
        let ok = x > B.minX + R && x < B.maxX - R && z > B.minZ + R && z < B.maxZ - R;
        let gy = 0;
        if (ok) {
          for (const b of world.boxes) {
            if (x + R <= b.min.x || x - R >= b.max.x || z + R <= b.min.z || z - R >= b.max.z) continue;
            if (b.min.y > 2.2) continue;         // 頭上の足場は通れる
            if (b.max.y <= 0.56) { gy = Math.max(gy, b.max.y); continue; } // 段差は登れる
            ok = false; break;
          }
        }
        if (ok) {
          for (const r of world.ramps) {
            if (world.inRamp(r, x, z, R)) { ok = false; break; }
          }
        }
        this.walk[j * this.w + i] = ok ? 1 : 0;
        this.gy[j * this.w + i] = gy;
      }
    }
  }

  idx(x, z) {
    const i = Math.floor((x - this.ox) / this.cell), j = Math.floor((z - this.oz) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  center(k) {
    const i = k % this.w, j = (k / this.w) | 0;
    return { x: this.ox + (i + 0.5) * this.cell, z: this.oz + (j + 0.5) * this.cell };
  }

  walkableAt(x, z) {
    const k = this.idx(x, z);
    return k >= 0 && this.walk[k] === 1;
  }

  nearestWalkable(x, z, maxR = 12) {
    const k0 = this.idx(x, z);
    if (k0 >= 0 && this.walk[k0]) return k0;
    const i0 = Math.floor((x - this.ox) / this.cell), j0 = Math.floor((z - this.oz) / this.cell);
    for (let r = 1; r <= maxR; r++) {
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const k = j * this.w + i;
        if (!this.walk[k]) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  lineWalkable(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / (this.cell * 0.35));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = ax + dx * t, z = az + dz * t;
      // 幅を考慮して左右もチェック
      const nx = -dz / (len || 1) * 0.3, nz = dx / (len || 1) * 0.3;
      if (!this.walkableAt(x, z) || !this.walkableAt(x + nx, z + nz) || !this.walkableAt(x - nx, z - nz)) return false;
    }
    return true;
  }

  findPath(sx, sz, tx, tz) {
    const s = this.nearestWalkable(sx, sz), t = this.nearestWalkable(tx, tz);
    if (s < 0 || t < 0) return null;
    const W = this.w, N = this.walk.length;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (k, f) => {
      heap.push([f, k]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    const ti = t % W, tj = (t / W) | 0;
    const hfn = (k) => {
      const dx = Math.abs(k % W - ti), dz = Math.abs(((k / W) | 0) - tj);
      return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz);
    };
    g[s] = 0; push(s, hfn(s));
    let iter = 0;
    while (heap.length && iter++ < 20000) {
      const [, k] = pop();
      if (k === t) break;
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % W, j = (k / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= this.h) continue;
        const nk = nj * W + ni;
        if (!this.walk[nk] || closed[nk]) continue;
        if (di && dj && (!this.walk[j * W + ni] || !this.walk[nj * W + i])) continue;
        const cost = g[k] + (di && dj ? 1.4142 : 1);
        if (cost < g[nk]) { g[nk] = cost; came[nk] = k; push(nk, cost + hfn(nk)); }
      }
    }
    if (came[t] < 0 && s !== t) return null;
    const cells = [];
    for (let k = t; k !== -1; k = came[k]) { cells.push(k); if (k === s) break; }
    cells.reverse();
    // 経路のスムージング
    const pts = cells.map((k) => this.center(k));
    pts[pts.length - 1] = this.walkableAt(tx, tz) ? { x: tx, z: tz } : pts[pts.length - 1];
    const out = [];
    let cur = { x: sx, z: sz };
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineWalkable(cur.x, cur.z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      cur = pts[j];
      i = j + 1;
    }
    return out;
  }
}
