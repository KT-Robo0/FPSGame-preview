import * as THREE from 'three';

// 手続き的に生成するキャンバステクスチャ（外部画像なしで高品質な見た目を作る）
const cache = new Map();

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function addNoise(g, size, amount, seed = 7) {
  const r = rand(seed);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function blotches(g, size, count, color, alphaMax, rMax, seed = 3) {
  const r = rand(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * size, y = r() * size, rad = 4 + r() * rMax;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, color.replace('A', (r() * alphaMax).toFixed(3)));
    grad.addColorStop(1, color.replace('A', '0'));
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

function make(name, size, draw) {
  if (cache.has(name)) return cache.get(name);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(name, t);
  return t;
}

export function clearTextureCache() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

export const Tex = {
  arenaFloor: () => make('arenaFloor', 512, (g, s) => {
    g.fillStyle = '#23283a'; g.fillRect(0, 0, s, s);
    const n = 4, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const shade = 34 + ((i + j) % 2) * 6;
      g.fillStyle = `rgb(${shade},${shade + 5},${shade + 22})`;
      g.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(i * t + 3, j * t + 3, t - 6, 3);
    }
    g.strokeStyle = '#141722'; g.lineWidth = 6;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * t); g.lineTo(s, i * t); g.stroke();
    }
    addNoise(g, s, 14, 11);
    blotches(g, s, 40, 'rgba(0,0,0,A)', 0.25, 30, 5);
  }),

  arenaWall: () => make('arenaWall', 512, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#3a4058'); grad.addColorStop(1, '#2a2f44');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#1b1e2c'; g.lineWidth = 5;
    g.strokeRect(6, 6, s - 12, s - 12);
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(12, 12, s / 2 - 20, 4); g.fillRect(s / 2 + 8, 12, s / 2 - 20, 4);
    g.fillStyle = '#1b1e2c';
    for (const [x, y] of [[20, 20], [s - 20, 20], [20, s - 20], [s - 20, s - 20], [s / 2 - 14, s / 2], [s / 2 + 14, s / 2]]) {
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    }
    addNoise(g, s, 12, 21);
  }),

  metal: () => make('metal', 256, (g, s) => {
    g.fillStyle = '#8c929e'; g.fillRect(0, 0, s, s);
    const r = rand(9);
    for (let i = 0; i < 400; i++) {
      g.strokeStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},255,${r() * 0.05})`;
      const y = r() * s;
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + (r() - 0.5) * 4); g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(2, 2, s - 4, s - 4);
    g.fillStyle = 'rgba(40,40,50,0.8)';
    for (const [x, y] of [[12, 12], [s - 12, 12], [12, s - 12], [s - 12, s - 12]]) {
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
    addNoise(g, s, 10, 2);
  }),

  concrete: () => make('concrete', 512, (g, s) => {
    g.fillStyle = '#a7a39a'; g.fillRect(0, 0, s, s);
    blotches(g, s, 120, 'rgba(60,55,50,A)', 0.18, 50, 17);
    blotches(g, s, 60, 'rgba(255,250,240,A)', 0.12, 40, 19);
    addNoise(g, s, 26, 23);
    g.strokeStyle = 'rgba(40,38,35,0.5)'; g.lineWidth = 3;
    g.strokeRect(0, 0, s, s);
    const r = rand(33);
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(30,28,25,0.35)';
    for (let k = 0; k < 5; k++) {
      let x = r() * s, y = r() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < 8; i++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
  }),

  sand: () => make('sand', 512, (g, s) => {
    g.fillStyle = '#c9ae7f'; g.fillRect(0, 0, s, s);
    blotches(g, s, 200, 'rgba(150,115,70,A)', 0.2, 60, 41);
    blotches(g, s, 150, 'rgba(240,220,180,A)', 0.2, 40, 43);
    addNoise(g, s, 34, 47);
    const r = rand(51);
    g.fillStyle = 'rgba(90,70,45,0.5)';
    for (let i = 0; i < 700; i++) g.fillRect(r() * s, r() * s, 1.5, 1.5);
  }),

  asphalt: () => make('asphalt', 512, (g, s) => {
    g.fillStyle = '#4a4a4c'; g.fillRect(0, 0, s, s);
    blotches(g, s, 100, 'rgba(20,20,20,A)', 0.3, 60, 61);
    addNoise(g, s, 40, 63);
    const r = rand(67);
    g.fillStyle = 'rgba(200,200,200,0.25)';
    for (let i = 0; i < 1500; i++) g.fillRect(r() * s, r() * s, 1, 1);
  }),

  container: (hex) => make('container' + hex, 256, (g, s) => {
    g.fillStyle = hex; g.fillRect(0, 0, s, s);
    const ribs = 10, w = s / ribs;
    for (let i = 0; i < ribs; i++) {
      const grad = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.28)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.12)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.05)');
      grad.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = grad; g.fillRect(i * w, 0, w, s);
    }
    blotches(g, s, 30, 'rgba(110,60,20,A)', 0.35, 25, 71);
    addNoise(g, s, 18, 73);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 0, s, 8); g.fillRect(0, s - 8, s, 8);
  }),

  wood: () => make('wood', 256, (g, s) => {
    g.fillStyle = '#9a6b3e'; g.fillRect(0, 0, s, s);
    const planks = 4, h = s / planks, r = rand(81);
    for (let i = 0; i < planks; i++) {
      g.fillStyle = `rgba(${120 + r() * 40},${80 + r() * 25},${40 + r() * 20},0.6)`;
      g.fillRect(0, i * h, s, h);
      g.strokeStyle = 'rgba(60,35,15,0.25)'; g.lineWidth = 1;
      for (let k = 0; k < 7; k++) {
        const y = i * h + r() * h;
        g.beginPath(); g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 8, s * 0.6, y + (r() - 0.5) * 8, s, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,20,5,0.8)'; g.fillRect(0, i * h, s, 3);
    }
    g.strokeStyle = '#4b2e14'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10);
    g.beginPath(); g.moveTo(5, 5); g.lineTo(s - 5, s - 5); g.stroke();
    addNoise(g, s, 16, 83);
  }),

  planks: () => make('planks', 256, (g, s) => {
    g.fillStyle = '#8a6038'; g.fillRect(0, 0, s, s);
    const n = 5, w = s / n, r = rand(85);
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${130 + r() * 40},${88 + r() * 25},${45 + r() * 20},0.7)`;
      g.fillRect(i * w, 0, w, s);
      g.strokeStyle = 'rgba(60,35,15,0.25)'; g.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const x = i * w + r() * w;
        g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 6, s * 0.3, x + (r() - 0.5) * 6, s * 0.6, x, s); g.stroke();
      }
      g.fillStyle = 'rgba(35,18,5,0.85)'; g.fillRect(i * w, 0, 3, s);
      g.fillStyle = 'rgba(30,30,30,0.9)';
      for (const y of [s * 0.15, s * 0.85]) { g.beginPath(); g.arc(i * w + w / 2, y, 2.5, 0, 7); g.fill(); }
    }
    addNoise(g, s, 16, 87);
  }),

  sandbag: () => make('sandbag', 256, (g, s) => {
    g.fillStyle = '#8c7c57'; g.fillRect(0, 0, s, s);
    const rows = 4, cols = 3, h = s / rows, w = s / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * w + (r % 2) * w / 2;
      for (const xx of [x, x - s]) {
        const grad = g.createRadialGradient(xx + w / 2, r * h + h / 2, 4, xx + w / 2, r * h + h / 2, w / 1.6);
        grad.addColorStop(0, '#b3a174'); grad.addColorStop(1, '#5d5136');
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(xx + w / 2, r * h + h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    addNoise(g, s, 24, 91);
  }),

  hazard: () => make('hazard', 256, (g, s) => {
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#1b1b1b';
    for (let i = -s; i < s * 2; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 - s, s); g.lineTo(i - s, s); g.fill();
    }
    addNoise(g, s, 20, 97);
  }),

  rock: () => make('rock', 256, (g, s) => {
    g.fillStyle = '#7d756b'; g.fillRect(0, 0, s, s);
    blotches(g, s, 120, 'rgba(40,35,30,A)', 0.3, 30, 101);
    blotches(g, s, 80, 'rgba(200,190,170,A)', 0.2, 20, 103);
    addNoise(g, s, 40, 107);
  }),

  grass: () => make('grass', 256, (g, s) => {
    g.fillStyle = '#5b6b35'; g.fillRect(0, 0, s, s);
    blotches(g, s, 100, 'rgba(30,45,15,A)', 0.3, 30, 111);
    addNoise(g, s, 30, 113);
  }),

  brick: () => make('brick', 512, (g, s) => {
    g.fillStyle = '#6b6159'; g.fillRect(0, 0, s, s);
    const rows = 8, cols = 4, h = s / rows, w = s / cols, r = rand(121);
    for (let i = 0; i < rows; i++) for (let j = -1; j < cols; j++) {
      const x = j * w + (i % 2) * w / 2;
      const c = 150 + r() * 30;
      g.fillStyle = `rgb(${c},${c * 0.82},${c * 0.66})`;
      g.fillRect(x + 3, i * h + 3, w - 6, h - 6);
    }
    blotches(g, s, 50, 'rgba(40,30,20,A)', 0.25, 40, 123);
    addNoise(g, s, 22, 127);
  }),

  stripe: () => make('stripe', 128, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
  }),
};

// 加算合成用の丸いグロースプライト
export function glowTexture() {
  if (cache.has('glow')) return cache.get('glow');
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,240,200,0.8)');
  grad.addColorStop(0.5, 'rgba(255,160,60,0.25)');
  grad.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set('glow', t);
  return t;
}

export function flashTexture() {
  if (cache.has('flash')) return cache.get('flash');
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3 + (i % 2) * 0.2);
    const grad = g.createLinearGradient(0, 0, 60, 0);
    grad.addColorStop(0, 'rgba(255,255,220,1)');
    grad.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(60, 0); g.lineTo(0, 7); g.fill();
  }
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = grad; g.fillRect(-30, -30, 60, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set('flash', t);
  return t;
}

export function decalTexture() {
  if (cache.has('decal')) return cache.get('decal');
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.3, 'rgba(15,12,10,0.9)');
  grad.addColorStop(0.55, 'rgba(40,35,30,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  cache.set('decal', t);
  return t;
}

export function smokeTexture() {
  if (cache.has('smoke')) return cache.get('smoke');
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = rand(131);
  for (let i = 0; i < 14; i++) {
    const x = 34 + r() * 60, y = 34 + r() * 60, rad = 20 + r() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  cache.set('smoke', t);
  return t;
}
