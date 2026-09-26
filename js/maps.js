import * as THREE from 'three';
import { Tex } from './textures.js';

// ---------- ジオメトリ補助 ----------
function scaleBoxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  // 面順: +x, -x, +y, -y, +z, -z（各4頂点）
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * dims[f][0] / tile, uv.getY(idx) * dims[f][1] / tile);
    }
  }
  uv.needsUpdate = true;
}

function mat(opts) {
  const { tile = 2, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial(rest);
  m.userData.tile = tile;
  return m;
}

class Builder {
  constructor(root, world) {
    this.root = root;
    this.world = world;
  }

  // (x,z) は中心、y は底面
  box(x, y, z, w, h, d, material, { collide = true, cast = true, receive = true, rotY = 0 } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleBoxUV(geo, w, h, d, material.userData.tile || 2);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    m.castShadow = cast;
    m.receiveShadow = receive;
    this.root.add(m);
    if (collide) {
      if (rotY) {
        const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
        const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
        this.world.addBox(x - hw, y, z - hd, x + hw, y + h, z + hd);
      } else {
        this.world.addBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
      }
    }
    return m;
  }

  // スロープ：axis 方向に h0 → h1 へ上がる
  ramp(x0, x1, z0, z1, axis, h0, h1, material) {
    const w = x1 - x0, d = z1 - z0, h = Math.max(h0, h1);
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleBoxUV(geo, w, h, d, material.userData.tile || 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) <= 0) continue;
      const u = axis === 'z' ? pos.getZ(i) : pos.getX(i);
      const low = h0 < h1 ? u < 0 : u > 0;
      const lowH = Math.min(h0, h1);
      if (low) pos.setY(i, -h / 2 + Math.max(lowH, 0.001));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material);
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    m.castShadow = true; m.receiveShadow = true;
    this.root.add(m);
    this.world.addRamp(x0, x1, z0, z1, axis, h0, h1);
    return m;
  }

  add(obj) { this.root.add(obj); return obj; }
}

function skyDome(top, horizon, bottom, sunDir, sunColor, stars = false) {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) },
      horizon: { value: new THREE.Color(horizon) },
      bottom: { value: new THREE.Color(bottom) },
      sunDir: { value: sunDir.clone().normalize() },
      sunColor: { value: new THREE.Color(sunColor) },
      stars: { value: stars ? 1 : 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float stars;
      varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.35);
        if (stars > 0.5 && h > 0.05) {
          vec3 g = floor(d * 220.0);
          float st = step(0.9975, hash(g));
          col += vec3(st) * smoothstep(0.05, 0.4, h) * 0.9;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

function neonMat(color, intensity = 3) {
  return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, toneMapped: true });
}

// ======================================================
// アリーナ：夜の近未来スタジアム。左右対称、中央台座、両サイドのキャットウォーク
// ======================================================
function buildArena(root, world) {
  const B = new Builder(root, world);
  const S = 22; // 半径
  world.bounds = { minX: -S, maxX: S, minZ: -S, maxZ: S };

  const floorM = mat({ map: Tex.arenaFloor(), color: 0xc8d0f0, roughness: 0.5, metalness: 0.2, tile: 8 });
  const wallM = mat({ map: Tex.arenaWall(), roughness: 0.6, metalness: 0.3, tile: 4 });
  const metalM = mat({ map: Tex.metal(), roughness: 0.35, metalness: 0.75, tile: 2 });
  const blueM = mat({ color: 0x2c6bff, roughness: 0.4, metalness: 0.3, map: Tex.metal(), tile: 2 });
  const redM = mat({ color: 0xff3d4f, roughness: 0.4, metalness: 0.3, map: Tex.metal(), tile: 2 });
  const coverM = mat({ map: Tex.arenaWall(), color: 0xc9d2ff, roughness: 0.5, metalness: 0.35, tile: 3 });
  const hazardM = mat({ map: Tex.hazard(), roughness: 0.6, tile: 1.5 });
  const neonBlue = neonMat(0x33a0ff, 4);
  const neonRed = neonMat(0xff3348, 4);
  const neonWhite = neonMat(0xffffff, 2.5);
  const neonPurple = neonMat(0xb04dff, 3.5);

  // 床
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, S * 2), floorM);
  floor.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (S * 2) / 8; });
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // 中央サークル（発光リング）
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.9, 64), neonPurple);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.52; root.add(ring);
  for (const [z, m] of [[16, neonMat(0x33a0ff, 1.6)], [-16, neonMat(0xff3348, 1.6)]]) {
    const r = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.8, 48), m);
    r.rotation.x = -Math.PI / 2; r.position.set(0, 0.02, z); root.add(r);
  }
  // センターライン
  const line = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, 0.12), neonWhite);
  line.rotation.x = -Math.PI / 2; line.position.y = 0.015; root.add(line);

  // 外壁
  const WH = 9;
  B.box(0, 0, -S - 0.5, S * 2 + 2, WH, 1, wallM);
  B.box(0, 0, S + 0.5, S * 2 + 2, WH, 1, wallM);
  B.box(-S - 0.5, 0, 0, 1, WH, S * 2, wallM);
  B.box(S + 0.5, 0, 0, 1, WH, S * 2, wallM);
  // 見えない天井代わりの高い壁
  world.addBox(-S - 5, WH, -S - 5, -S, 60, S + 5);
  world.addBox(S, WH, -S - 5, S + 5, 60, S + 5);
  world.addBox(-S - 5, WH, -S - 5, S + 5, 60, -S);
  world.addBox(-S - 5, WH, S, S + 5, 60, S + 5);

  // 壁のネオンライン
  for (const [y, m] of [[0.25, neonPurple], [WH - 0.3, neonWhite]]) {
    B.box(0, y, -S + 0.02, S * 2, 0.1, 0.04, m, { collide: false, cast: false });
    B.box(0, y, S - 0.02, S * 2, 0.1, 0.04, m, { collide: false, cast: false });
    B.box(-S + 0.02, y, 0, 0.04, 0.1, S * 2, m, { collide: false, cast: false });
    B.box(S - 0.02, y, 0, 0.04, 0.1, S * 2, m, { collide: false, cast: false });
  }
  // チームカラーの壁パネル
  for (let x = -16; x <= 16; x += 8) {
    B.box(x, 2, S - 0.06, 4, 3, 0.1, neonMat(0x1f66ff, 1.4), { collide: false, cast: false });
    B.box(x, 2, -S + 0.06, 4, 3, 0.1, neonMat(0xff2a3c, 1.4), { collide: false, cast: false });
  }

  // 中央台座（段差で登れる高さ）
  B.box(0, 0, 0, 10, 0.5, 10, metalM);
  B.box(0, 0.5, 0, 2.2, 3.2, 2.2, coverM);           // 中央柱
  B.box(0, 3.7, 0, 2.6, 0.2, 2.6, neonPurple, { collide: false });
  for (const s of [-1, 1]) {
    B.box(s * 3.4, 0.5, 0, 0.6, 1.1, 4, coverM);       // 台座上の低い壁
    B.box(0, 0.5, s * 3.4, 4, 1.1, 0.6, coverM);
  }

  // 中間の低いカバー壁
  for (const s of [-1, 1]) {
    B.box(-7, 0, s * 9, 6, 1.15, 0.9, coverM);
    B.box(7, 0, s * 9, 6, 1.15, 0.9, coverM);
    B.box(0, 0, s * 10.5, 2.4, 1.15, 0.9, hazardM);
    // 全身が隠れるブロック
    B.box(-11, 0, s * 4, 2.6, 2.6, 2.6, s > 0 ? blueM : redM);
    B.box(11, 0, s * 4, 2.6, 2.6, 2.6, s > 0 ? blueM : redM);
    B.box(-11, 2.6, s * 4, 2.62, 0.08, 2.62, s > 0 ? neonBlue : neonRed, { collide: false });
    B.box(11, 2.6, s * 4, 2.62, 0.08, 2.62, s > 0 ? neonBlue : neonRed, { collide: false });
    // スポーン前のカバー
    B.box(-4.5, 0, s * 15, 3, 1.6, 0.8, coverM);
    B.box(4.5, 0, s * 15, 3, 1.6, 0.8, coverM);
    B.box(0, 0, s * 19.5, 5, 2.2, 0.8, s > 0 ? blueM : redM);
    // 柱
    B.box(-6, 0, s * 4.5, 1.2, 5, 1.2, metalM);
    B.box(6, 0, s * 4.5, 1.2, 5, 1.2, metalM);
    // コーナーのL字カバー
    B.box(s * 15.5, 0, 15.5, 4, 2.4, 0.8, coverM);
    B.box(s * 15.5, 0, -15.5, 4, 2.4, 0.8, coverM);
  }

  // 両サイドのキャットウォーク（高さ2.5）＋スロープ
  const CH = 2.5;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 17 : -S, x1 = s > 0 ? S : -17;
    B.box((x0 + x1) / 2, 0, 0, x1 - x0, CH, 12, metalM);
    // 手すり（腰の高さ、射線は通る）
    const rx = s > 0 ? 17.1 : -17.1;
    B.box(rx, CH, -3.5, 0.15, 1.0, 5, coverM);
    B.box(rx, CH, 3.5, 0.15, 1.0, 5, coverM);
    B.box(rx, CH + 1.0, 0, 0.2, 0.08, 12, s > 0 ? neonBlue : neonRed, { collide: false });
    // スロープ（両端）
    B.ramp(x0, x1, 6, 13, 'z', CH, 0, metalM);
    B.ramp(x0, x1, -13, -6, 'z', 0, CH, metalM);
    B.box((x0 + x1) / 2, 0.01, 13.01, x1 - x0, 0.02, 0.2, hazardM, { collide: false, cast: false });
    B.box((x0 + x1) / 2, 0.01, -13.01, x1 - x0, 0.02, 0.2, hazardM, { collide: false, cast: false });
  }

  // 観客席と照明タワー（外側の装飾）
  const standM = mat({ color: 0x1a1d2b, roughness: 0.9, tile: 4 });
  for (let i = 0; i < 6; i++) {
    const h = 9 + i * 2.2, off = S + 2 + i * 2.6;
    for (const [x, z, w, d] of [[0, -off, (off) * 2, 2.6], [0, off, off * 2, 2.6], [-off, 0, 2.6, off * 2], [off, 0, 2.6, off * 2]]) {
      B.box(x, 0, z, w, h, d, standM, { collide: false, cast: false });
    }
  }
  const crowdColors = [0x33a0ff, 0xff3348, 0xffffff, 0xffc830, 0xb04dff];
  const crowdGeo = new THREE.BoxGeometry(0.5, 0.7, 0.5);
  const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, 1400);
  const tmp = new THREE.Object3D();
  let ci = 0;
  for (let i = 0; i < 6 && ci < 1400; i++) {
    const h = 9 + i * 2.2, off = S + 2 + i * 2.6;
    for (let t = -off + 1; t < off - 1 && ci < 1400; t += 1.1 + Math.random() * 0.8) {
      for (const [x, z] of [[t, -off], [t, off], [-off, t], [off, t]]) {
        if (ci >= 1400 || Math.random() < 0.35) continue;
        tmp.position.set(x, h + 0.35, z);
        tmp.updateMatrix();
        crowd.setMatrixAt(ci, tmp.matrix);
        crowd.setColorAt(ci, new THREE.Color(crowdColors[(Math.random() * crowdColors.length) | 0]).multiplyScalar(0.6));
        ci++;
      }
    }
  }
  crowd.count = ci;
  root.add(crowd);

  for (const [x, z] of [[-S - 10, -S - 10], [S + 10, -S - 10], [-S - 10, S + 10], [S + 10, S + 10]]) {
    B.box(x, 0, z, 1.2, 30, 1.2, metalM, { collide: false, cast: false });
    const head = B.box(x, 30, z, 5, 2.5, 1, neonWhite, { collide: false, cast: false });
    head.lookAt(0, 30, 0);
  }

  // 照明
  const hemi = new THREE.HemisphereLight(0xa9b8ff, 0x2a2233, 1.5);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xe6ebff, 2.6);
  sun.position.set(18, 38, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 100;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  root.add(sun);
  const p1 = new THREE.PointLight(0x3d8cff, 14, 24, 1.6); p1.position.set(0, 6, 15); root.add(p1);
  const p2 = new THREE.PointLight(0xff3d52, 14, 24, 1.6); p2.position.set(0, 6, -15); root.add(p2);
  const p3 = new THREE.PointLight(0xb04dff, 20, 18, 1.6); p3.position.set(0, 5.5, 0); root.add(p3);

  root.add(skyDome(0x05060f, 0x1c1a3a, 0x05050a, new THREE.Vector3(0.3, 0.5, -1), 0x6a5aff, true));

  return {
    name: 'アリーナ',
    fog: { color: 0x0b0c1a, near: 40, far: 140 },
    exposure: 1.05,
    bloom: { strength: 0.75, radius: 0.5, threshold: 0.82 },
    spawns: [
      { pos: new THREE.Vector3(0, 0, 17.5), yaw: 0 },
      { pos: new THREE.Vector3(0, 0, -17.5), yaw: Math.PI },
    ],
  };
}

// ======================================================
// バトルグラウンド：昼の砂漠の軍事拠点。コンテナ、廃墟、監視塔
// ======================================================
function buildBattleground(root, world) {
  const B = new Builder(root, world);
  const HX = 36, HZ = 30;
  world.bounds = { minX: -HX, maxX: HX, minZ: -HZ, maxZ: HZ };

  const sandM = mat({ map: Tex.sand(), roughness: 0.95, tile: 10 });
  const asphaltM = mat({ map: Tex.asphalt(), roughness: 0.9, tile: 6 });
  const concreteM = mat({ map: Tex.concrete(), roughness: 0.9, tile: 4 });
  const brickM = mat({ map: Tex.brick(), roughness: 0.85, tile: 3 });
  const woodM = mat({ map: Tex.wood(), roughness: 0.8, tile: 1.2 });
  const plankM = mat({ map: Tex.planks(), roughness: 0.85, tile: 1.6 });
  const metalM = mat({ map: Tex.metal(), roughness: 0.4, metalness: 0.7, tile: 2 });
  const sandbagM = mat({ map: Tex.sandbag(), roughness: 1, tile: 1 });
  const hazardM = mat({ map: Tex.hazard(), roughness: 0.6, tile: 1.5 });
  const rockM = mat({ map: Tex.rock(), roughness: 0.95, flatShading: true, tile: 3 });
  const contM = [
    mat({ map: Tex.container('#b0402c'), roughness: 0.6, metalness: 0.4, tile: 2.6 }),
    mat({ map: Tex.container('#2d6aa0'), roughness: 0.6, metalness: 0.4, tile: 2.6 }),
    mat({ map: Tex.container('#3f7a3a'), roughness: 0.6, metalness: 0.4, tile: 2.6 }),
    mat({ map: Tex.container('#c98a1d'), roughness: 0.6, metalness: 0.4, tile: 2.6 }),
  ];

  // 地面
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260, 1, 1), sandM);
  ground.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 260 / 10; });
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
  // 道路
  const road = new THREE.Mesh(new THREE.PlaneGeometry(8, HZ * 2), asphaltM);
  road.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = i % 2 === 0 ? v * 8 / 6 : v * HZ * 2 / 6; });
  road.rotation.x = -Math.PI / 2; road.position.set(-20, 0.01, 0); road.receiveShadow = true; root.add(road);
  for (let z = -HZ + 2; z < HZ; z += 5) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 2.2), new THREE.MeshStandardMaterial({ color: 0xe8dcb0, roughness: 0.8 }));
    dash.rotation.x = -Math.PI / 2; dash.position.set(-20, 0.02, z); root.add(dash);
  }

  // 外周：積み上げたコンテナの壁
  const wallH = 5.2;
  let k = 0;
  for (let x = -HX; x < HX; x += 6.1) {
    B.box(x + 3, 0, -HZ - 1.3, 6, 2.6, 2.6, contM[k++ % 4]);
    B.box(x + 3, 2.6, -HZ - 1.3, 6, 2.6, 2.6, contM[k++ % 4]);
    B.box(x + 3, 0, HZ + 1.3, 6, 2.6, 2.6, contM[k++ % 4]);
    B.box(x + 3, 2.6, HZ + 1.3, 6, 2.6, 2.6, contM[k++ % 4]);
  }
  for (let z = -HZ; z < HZ; z += 6.1) {
    B.box(-HX - 1.3, 0, z + 3, 2.6, 2.6, 6, contM[k++ % 4]);
    B.box(-HX - 1.3, 2.6, z + 3, 2.6, 2.6, 6, contM[k++ % 4]);
    B.box(HX + 1.3, 0, z + 3, 2.6, 2.6, 6, contM[k++ % 4]);
    B.box(HX + 1.3, 2.6, z + 3, 2.6, 2.6, 6, contM[k++ % 4]);
  }
  world.addBox(-HX - 5, wallH, -HZ - 5, HX + 5, 60, -HZ);
  world.addBox(-HX - 5, wallH, HZ, HX + 5, 60, HZ + 5);
  world.addBox(-HX - 5, wallH, -HZ - 5, -HX, 60, HZ + 5);
  world.addBox(HX, wallH, -HZ - 5, HX + 5, 60, HZ + 5);

  // 中央の廃墟（2階なし、窓のある壁）
  const WT = 0.4, RH = 3.6;
  const ruin = (cx, cz) => {
    // 北壁：中央にドア
    B.box(cx - 3.5, 0, cz - 5, 3, RH, WT, brickM);
    B.box(cx + 3.5, 0, cz - 5, 3, RH, WT, brickM);
    B.box(cx, 2.4, cz - 5, 4, RH - 2.4, WT, brickM);
    // 南壁：窓
    B.box(cx - 4, 0, cz + 5, 2, RH, WT, brickM);
    B.box(cx + 4, 0, cz + 5, 2, RH, WT, brickM);
    B.box(cx, 0, cz + 5, 6, 1.1, WT, brickM);
    B.box(cx, 2.4, cz + 5, 6, RH - 2.4, WT, brickM);
    B.box(cx - 1.2, 1.1, cz + 5, 0.4, 1.3, WT, brickM);
    B.box(cx + 1.2, 1.1, cz + 5, 0.4, 1.3, WT, brickM);
    // 東西の壁：崩れた壁とドア
    B.box(cx - 5, 0, cz - 2.8, WT, RH, 4.4, brickM);
    B.box(cx - 5, 0, cz + 3.6, WT, 1.6, 2.8, brickM);
    B.box(cx + 5, 0, cz + 2.8, WT, RH, 4.4, brickM);
    B.box(cx + 5, 0, cz - 3.6, WT, 2.2, 2.8, brickM);
    // 屋上（一部崩落）と内部の木箱
    B.box(cx - 2.5, RH, cz, 5.4, 0.3, 10.4, concreteM);
    B.box(cx - 3, 0, cz - 3, 1.4, 1.4, 1.4, woodM);
    B.box(cx - 3, 1.4, cz - 3, 1.0, 1.0, 1.0, woodM, { rotY: 0.3 });
    B.box(cx + 2.5, 0, cz + 2.5, 1.6, 1.0, 1.0, woodM);
    // 屋上への木箱の階段
    B.box(cx + 1.2, 0, cz - 3.8, 1.2, 1.0, 1.2, woodM);
    B.box(cx + 1.2, 0, cz - 2.6, 1.2, 2.0, 1.2, woodM);
    B.box(cx + 0.3, 0, cz - 1.4, 0.8, 3.0, 1.2, concreteM);
  };
  ruin(0, 0);

  // コンテナ配置（点対称）
  const sym = (fn) => { fn(1); fn(-1); };
  sym((s) => {
    B.box(s * 12, 0, s * 8, 6, 2.6, 2.6, contM[s > 0 ? 1 : 0]);
    B.box(s * 12, 2.6, s * 8, 6, 2.6, 2.6, contM[3], { rotY: 0 });
    B.box(s * -10, 0, s * 12, 2.6, 2.6, 6, contM[2]);
    B.box(s * 25, 0, s * -2, 2.6, 2.6, 6, contM[0]);
    B.box(s * 22, 0, s * -10, 6, 2.6, 2.6, contM[1]);
    // コンテナの上に登るスロープ（木の板）
    B.ramp(s > 0 ? 15 : -21, s > 0 ? 21 : -15, s * 8 - 1.3, s * 8 + 1.3, 'x', s > 0 ? 5.2 : 0, s > 0 ? 0 : 5.2, plankM);
    // 土嚢ライン
    B.box(s * 5, 0, s * 13, 5, 1.05, 1, sandbagM);
    B.box(s * -5, 0, s * 16, 4, 1.05, 1, sandbagM);
    B.box(s * 16, 0, s * 17, 1, 1.05, 4, sandbagM);
    B.box(s * 29, 0, s * 8, 4, 1.05, 1, sandbagM);
    B.box(s * -28, 0, s * -8, 1, 1.05, 4, sandbagM);
    // バリケード
    B.box(s * -8, 0, s * 4, 3, 1.3, 0.5, hazardM);
    B.box(s * 8, 0, s * -4, 0.5, 1.3, 3, hazardM);
    // 木箱群
    B.box(s * 11, 0, s * 21, 1.5, 1.5, 1.5, woodM);
    B.box(s * 12.6, 0, s * 21.3, 1.5, 1.5, 1.5, woodM);
    B.box(s * 11.8, 1.5, s * 21.1, 1.4, 1.4, 1.4, woodM, { rotY: 0.2 });
    B.box(s * -18, 0, s * 20, 1.5, 1.5, 1.5, woodM);
    B.box(s * 30, 0, s * -20, 1.6, 1.6, 1.6, woodM);
    B.box(s * 31.6, 0, s * -20.2, 1.6, 1.6, 1.6, woodM);
    // 岩
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.7, 0), rockM);
    rock.position.set(s * -26, 1.0, s * 18); rock.scale.set(1.4, 0.9, 1.1); rock.rotation.set(0.3, s, 0.2);
    rock.castShadow = rock.receiveShadow = true; root.add(rock);
    world.addBox(s * -26 - 2.0, 0, s * 18 - 1.5, s * -26 + 2.0, 2.2, s * 18 + 1.5);
    const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), rockM);
    rock2.position.set(s * 18, 0.8, s * -20); rock2.scale.set(1.2, 1, 1.3);
    rock2.castShadow = rock2.receiveShadow = true; root.add(rock2);
    world.addBox(s * 18 - 1.5, 0, s * -20 - 1.6, s * 18 + 1.5, 1.8, s * -20 + 1.6);
  });

  // 監視塔（2基、スロープで登れる）
  const tower = (cx, cz, s) => {
    const TH = 3.8;
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      B.box(cx + dx, 0, cz + dz, 0.3, TH, 0.3, plankM);
    }
    B.box(cx, TH, cz, 3.8, 0.3, 3.8, plankM);
    // 胸壁
    B.box(cx, TH + 0.3, cz - 1.8, 3.8, 1.0, 0.2, plankM);
    B.box(cx, TH + 0.3, cz + 1.8, 3.8, 1.0, 0.2, plankM);
    B.box(cx + s * 1.8, TH + 0.3, cz, 0.2, 1.0, 3.8, plankM);
    // 屋根
    B.box(cx, TH + 2.6, cz, 4.4, 0.2, 4.4, metalM, { collide: true });
    for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) {
      B.box(cx + dx, TH + 1.3, cz + dz, 0.15, 1.3, 0.15, plankM);
    }
    // スロープ（塔の内側方向から）
    const x0 = s > 0 ? cx - 1.9 - 8 : cx + 1.9, x1 = s > 0 ? cx - 1.9 : cx + 1.9 + 8;
    B.ramp(x0, x1, cz - 0.9, cz + 0.9, 'x', s > 0 ? 0 : TH + 0.3, s > 0 ? TH + 0.3 : 0, plankM);
  };
  tower(30, 22, 1);
  tower(-30, -22, -1);

  // 装飾：外側の山、木、電柱
  const mtnM = new THREE.MeshStandardMaterial({ color: 0xa88c68, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, r = 120 + Math.random() * 60;
    const h = 20 + Math.random() * 35;
    const m = new THREE.Mesh(new THREE.ConeGeometry(18 + Math.random() * 20, h, 6 + (i % 3)), mtnM);
    m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    m.rotation.y = Math.random() * 3;
    root.add(m);
  }
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 1 });
  const leafM = new THREE.MeshStandardMaterial({ color: 0x5f7a32, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2, r = 48 + Math.random() * 40;
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), trunkM);
    t.position.y = 1.5; g.add(t);
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8 + Math.random(), 0), leafM);
    l.position.y = 3.8; l.castShadow = true; g.add(l);
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    root.add(g);
  }
  const grassM = mat({ map: Tex.grass(), roughness: 1, tile: 4 });
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 30;
    const p = new THREE.Mesh(new THREE.CircleGeometry(4 + Math.random() * 6, 10), grassM);
    p.rotation.x = -Math.PI / 2; p.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r); p.receiveShadow = true;
    root.add(p);
  }

  // 照明
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x9c7c55, 1.0);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, 3.2);
  sun.position.set(-30, 45, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  root.add(sun);

  root.add(skyDome(0x3f7fd6, 0xdcd3c0, 0xb89c72, new THREE.Vector3(-30, 45, 20), 0xfff2c8, false));

  return {
    name: 'バトルグラウンド',
    fog: { color: 0xd9ceb8, near: 70, far: 240 },
    exposure: 1.0,
    bloom: { strength: 0.25, radius: 0.4, threshold: 0.92 },
    spawns: [
      { pos: new THREE.Vector3(6, 0, 25), yaw: 0 },
      { pos: new THREE.Vector3(-6, 0, -25), yaw: Math.PI },
    ],
  };
}

export const MAPS = {
  arena: { id: 'arena', name: 'アリーナ', desc: '夜のネオンスタジアム。左右対称で近〜中距離戦。', build: buildArena },
  battleground: { id: 'battleground', name: 'バトルグラウンド', desc: '砂漠の軍事拠点。コンテナと廃墟、監視塔で遠距離戦も。', build: buildBattleground },
};
