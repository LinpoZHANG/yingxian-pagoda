/**
 * scene/ground.js —— 地面与环境陪衬
 * ─────────────────────────────────────────────────────────────
 * 大范围地面(接收阴影,黄土色微噪)+ 塔院暗示(环塔铺地圈、
 * 低矮院墙剪影,克制)。雾 FogExp2,颜色随昼夜插值。
 */

import {
  BufferAttribute, BufferGeometry, BoxGeometry, CylinderGeometry,
  IcosahedronGeometry, Float32BufferAttribute, Group, InstancedMesh,
  Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry,
  Quaternion, RingGeometry, Vector3, FogExp2, Color,
} from 'three';
import { paperNoise } from '../materials/textures.js';
import { PLATFORM, GLOBAL } from '../data/pagodaParams.js';

const H = GLOBAL.totalHeight;
const DAY_FOG = new Color(0xb8b6a5);
const NIGHT_FOG = new Color(0x0e1524);
const WORLD = H * 40;
/** 雾密度:见 createGround 中的反算注释。深链接 &fog=k 可整体缩放。 */
export const FOG_DENSITY = 0.00068;

/** 冬季地物并入的雪色:房屋道路偏灰白,水面结冰偏冷 */
const SNOW_PROP = new Color(0xdcdfe1);
const SNOW_ICE = new Color(0xc4ced6);

const hash = (x, z, seed = 0) => {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 41.3) * 43758.5453;
  return s - Math.floor(s);
};

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function valueNoise(x, z, scale, seed) {
  const px = x / scale;
  const pz = z / scale;
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const fx = px - ix;
  const fz = pz - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}

function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const nearTower = 1 - smoothstep(PLATFORM.lowerSquareHalf * 1.15, PLATFORM.lowerSquareHalf * 2.9, r);
  const large = valueNoise(x, z, 180, 2.1) - 0.5;
  const small = valueNoise(x, z, 38, 6.4) - 0.5;
  return (large * 1.3 + small * 0.22) * (1 - nearTower * 0.94);
}

/**
 * 农田权重:季节色只该染**农田**,不该染城坊踩实地与寺院夯土院 ——
 * 一个全局 tint 会把三者一起染绿,读不成"庄稼变了色"。
 * 与 terrainColor 用同一组遮罩,保证边界对得上。
 * 这个值烘焙进顶点属性 aFarm(每顶点 1 个 float,171×171 ≈ 117 KB),
 * 由着色器每帧读 —— 不能每帧在 CPU 上重算 terrainColor:
 * 29241 个顶点 × (3 次 valueNoise + 6 次 Color.lerp),移动端直接掉帧。
 */
function farmWeight(x, z) {
  const dist = Math.hypot(x, z);
  const temple = 1 - smoothstep(62, 118, dist);
  const city = smoothstep(65, 120, dist) * (1 - smoothstep(320, 430, dist));
  /* ★ 斜坡不能照抄 terrainColor 的 farmland(smoothstep(330, 620))。
   * 那一条是给「田埂纹理」用的,只需要在真正的田块上出现;
   * 而季节色要覆盖的是**寺院院墙以外的整个大地** —— 参考实景里春天的绿
   * 是从院墙外一直铺到地平线的。
   * 实测:用 330→620 时,画面里能变色的只剩一条被雾吃掉一半的窄带,
   * 城坊带(62~72% 画幅)的 R−B 只从 38.6 动到 34.1,基本看不出。
   * 改为 130→320:院子外就开始上色,城坊之间的空地也算进来
   * (坊里本来就有菜畦树木),只保留 0.25 的城坊折减。 */
  const open = smoothstep(100, 240, dist);
  return Math.max(0, Math.min(1, open - city * 0.15 - temple * 0.9));
}

function terrainColor(x, z) {
  const dist = Math.hypot(x, z);
  const temple = 1 - smoothstep(62, 118, dist);
  const city = smoothstep(65, 120, dist) * (1 - smoothstep(320, 430, dist));
  const farmland = smoothstep(330, 620, dist);
  const fieldGrid = Math.max(
    smoothstep(0.90, 0.985, Math.abs(Math.sin((x + 24) * 0.028))),
    smoothstep(0.90, 0.985, Math.abs(Math.sin((z - 18) * 0.031))),
  );
  const patch = valueNoise(x, z, 140, 4.8);
  const fine = valueNoise(x, z, 32, 8.2);
  // 晋北秋色:底子是土黄,收割后的田茬泛灰金,城坊内被踩实的地面转灰。
  // 旧值(0x9a8460 起)在 ACES + 低日头下压成一片暗褐,与参考图的暖金差一大截。
  const c = new Color(0xd8c49a);
  c.lerp(new Color(0xc0b8ae), fine * 0.24);              // 灰:未翻的旧土
  c.lerp(new Color(0xefe2bd), Math.max(0, patch - 0.46) * 0.34);  // 灰金:秋茬受光面
  c.lerp(new Color(0xcac2a0), fieldGrid * farmland * 0.26);       // 田埂
  c.lerp(new Color(0xc3b79b), city * 0.38);              // 城坊踩实地
  c.lerp(new Color(0xe2d7b8), temple * 0.50);            // 寺院夯土院
  return c;
}

function setNoShadow(obj) {
  obj.traverse((part) => {
    part.castShadow = false;
    part.receiveShadow = false;
  });
}

function createTerrain(extent) {
  const geo = new PlaneGeometry(extent, extent, 170, 170);
  const pos = geo.attributes.position;
  const colors = [];
  const farm = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = -pos.getY(i);
    pos.setZ(i, terrainHeight(x, z));
    const c = terrainColor(x, z);
    colors.push(c.r, c.g, c.b);
    farm.push(farmWeight(x, z));
  }
  geo.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geo.setAttribute('aFarm', new BufferAttribute(new Float32Array(farm), 1));
  geo.computeVertexNormals();
  const mat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
  });

  /* ── 季节通道 ────────────────────────────────────────────────
   * 顶点色是**烘焙**的(建构时算好写进 BufferAttribute),不能每帧重算,
   * 所以季节不改顶点色,而是在着色器里于顶点色之上再混两层:
   *   1. uSeasonTint —— 按 aFarm 加权,只染农田(春灰绿 / 夏锈金);
   *   2. uSnowAmt    —— 全局积雪,带噪声斑驳,不分农田城坊(雪不挑地方)。
   * 两层都插在 <color_fragment> **之后**:那一段才刚把顶点色乘进 diffuseColor。 */
  const seasonUniforms = {
    uSeasonTint: { value: new Color(0xffffff) },
    uSeasonAmt: { value: 0 },
    uSnowColor: { value: new Color(0xdfe2e6) },
    uSnowAmt: { value: 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, seasonUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aFarm;
        varying float vFarm;
        varying vec2 vSeasonPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFarm = aFarm;
        vSeasonPos = position.xy;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3  uSeasonTint;
        uniform float uSeasonAmt;
        uniform vec3  uSnowColor;
        uniform float uSnowAmt;
        varying float vFarm;
        varying vec2  vSeasonPos;
        float sh2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sn2(vec2 p){
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(sh2(i), sh2(i+vec2(1,0)), f.x),
                     mix(sh2(i+vec2(0,1)), sh2(i+vec2(1,1)), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // 田块级的斑驳:同一季里地块之间也该有深浅,否则一片死平
          float mott = sn2(vSeasonPos * 0.016) * 0.62 + sn2(vSeasonPos * 0.071) * 0.38;
          diffuseColor.rgb = mix(diffuseColor.rgb, uSeasonTint,
                                 uSeasonAmt * vFarm * (0.72 + 0.56 * mott));
          if (uSnowAmt > 0.001) {
            // 积雪不覆满:低洼与背风处厚、道路与踩实地薄 —— 用噪声当替身
            float sm = smoothstep(0.34, 0.78, sn2(vSeasonPos * 0.021) * 0.7
                                            + sn2(vSeasonPos * 0.095) * 0.3);
            diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor,
                                   clamp(uSnowAmt * (0.45 + 0.75 * sm), 0.0, 1.0));
          }
        }`);
  };

  const plane = new Mesh(geo, mat);
  plane.name = 'jinbei-weathered-earth';
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  return { plane, mat, seasonUniforms };
}

function createFlatRect(name, w, d, color, yOffset = 0.04) {
  const mat = new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.96,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new Mesh(new PlaneGeometry(w, d), mat);
  mesh.name = name;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = yOffset;
  return mesh;
}

function createBox(name, w, h, d, color, x, z, rot = 0) {
  const mesh = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshStandardMaterial({ color: new Color(color), roughness: 0.94, metalness: 0 }),
  );
  mesh.name = name;
  mesh.position.set(x, terrainHeight(x, z) + h * 0.5, z);
  mesh.rotation.y = rot;
  setNoShadow(mesh);
  return mesh;
}

function placeMesh(mesh, x, z, h, rot = 0) {
  mesh.position.set(x, terrainHeight(x, z) + h, z);
  mesh.rotation.y = rot;
  setNoShadow(mesh);
  return mesh;
}

function gableRoofGeometry() {
  /* 悬山顶(单位尺度,由 instance 矩阵缩放)。
   * ★ 旧版有两处错:
   *   1. **正脊方向反了** —— 顶点在 x=0 成脊、沿 z 铺开,于是脊落在**进深**方向。
   *      中国建筑的正脊沿**面阔**(长边)走、两坡向前后落水;
   *      旧版的房子等于把屋顶转了 90°,读起来就是「形态不正确」。
   *   2. 只有两坡两山,**没有出檐**,檐口与墙齐平 —— 读作一个盖在盒子上的三角块。
   * 现在:脊沿 X(长边),两坡向 ±Z 落水,四面出檐,脊顶给一条窄平带当正脊。 */
  const EX = 0.58;     // 面阔方向的出檐(墙半宽 0.5 ⇒ 出挑 16%)
  const EZ = 0.58;     // 进深方向的出檐
  const RW = 0.055;    // 正脊半宽
  const RY = 0.34;     // 脊高(保持与旧版同量,既有调用方的 h 语义不变)
  const p = [
    // 南坡
    -EX, 0, EZ,   EX, 0, EZ,   EX, RY, RW,
    -EX, 0, EZ,   EX, RY, RW,  -EX, RY, RW,
    // 北坡
    EX, 0, -EZ,  -EX, 0, -EZ,  -EX, RY, -RW,
    EX, 0, -EZ,  -EX, RY, -RW,  EX, RY, -RW,
    // 正脊顶面
    -EX, RY, -RW,  -EX, RY, RW,   EX, RY, RW,
    -EX, RY, -RW,   EX, RY, RW,   EX, RY, -RW,
    // 东山面
    EX, 0, EZ,   EX, 0, -EZ,  EX, RY, -RW,
    EX, 0, EZ,   EX, RY, -RW, EX, RY, RW,
    // 西山面
    -EX, 0, -EZ, -EX, 0, EZ,  -EX, RY, RW,
    -EX, 0, -EZ, -EX, RY, RW, -EX, RY, -RW,
  ];
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(p, 3));
  geo.computeVertexNormals();
  return geo;
}

function createGableRoof(name, w, h, d, color, x, z, rot = 0, baseY = h) {
  const mesh = new Mesh(
    gableRoofGeometry(),
    new MeshStandardMaterial({ color: new Color(color), roughness: 0.93, metalness: 0 }),
  );
  mesh.name = name;
  mesh.scale.set(w, h, d);
  return placeMesh(mesh, x, z, baseY, rot);
}

function createRoadRibbon(name, points, width, color, yOffset = 0.11) {
  const positions = [];
  const indices = [];
  const colors = [];
  const colorA = new Color(color);
  const colorB = new Color(0x756a52);

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const wobble = 0.82 + valueNoise(points[i][0], points[i][1], 42, 18.4) * 0.28;
    const half = width * wobble * 0.5;
    for (const side of [-1, 1]) {
      const x = points[i][0] + nx * half * side;
      const z = points[i][1] + nz * half * side;
      positions.push(x, terrainHeight(x, z) + yOffset, z);
      const c = colorA.clone().lerp(colorB, hash(i, side, 19.5) * 0.22);
      colors.push(c.r, c.g, c.b);
    }
    if (i < points.length - 1) {
      const j = i * 2;
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.99,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const road = new Mesh(geo, mat);
  road.name = name;
  setNoShadow(road);
  return road;
}

function createCourtSurfaceDetail() {
  const group = new Group();
  group.name = 'worn-court-slab-and-drainage-marks';
  for (let x = -54; x <= 54; x += 12) {
    const line = createFlatRect('subtle-north-south-slab-joint', 0.16, 96, 0x756d5e, 0.075);
    line.position.x = x + (hash(x, 1, 21) - 0.5) * 1.5;
    line.position.z = 0;
    group.add(line);
  }
  for (let z = -42; z <= 42; z += 10.5) {
    const line = createFlatRect('subtle-east-west-slab-joint', 112, 0.14, 0x776f60, 0.076);
    line.position.x = 0;
    line.position.z = z + (hash(z, 2, 22) - 0.5) * 1.2;
    group.add(line);
  }
  group.add(
    createRoadRibbon('west-court-drainage-trace', [[-63, -47], [-61, -18], [-63, 15], [-60, 47]], 0.62, 0x6e6759, 0.115),
    createRoadRibbon('east-court-drainage-trace', [[63, -42], [61, -12], [62, 18], [60, 45]], 0.55, 0x6e6759, 0.115),
  );
  setNoShadow(group);
  return group;
}

function createTemplePrecinct() {
  const group = new Group();
  group.name = 'temple-precinct-and-courtyard';
  const courtR = PLATFORM.lowerSquareHalf * 1.52;
  const plaza = createFlatRect('beaten-earth-temple-court', 136, 112, 0x9f9274, 0.045);
  group.add(plaza);
  group.add(createCourtSurfaceDetail());

  const apron = new Mesh(
    new RingGeometry(PLATFORM.lowerSquareHalf * 1.05, courtR, 64),
    new MeshStandardMaterial({ color: new Color(0xaaa08d), roughness: 0.95 }),
  );
  apron.name = 'octagonal-pagoda-apron';
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.055;
  apron.receiveShadow = true;
  group.add(apron);

  const wallH = 2.8;
  const wallT = 1.25;
  const halfX = 78;
  const halfZ = 62;
  const hallWall = 0x94795d;
  const tile = 0x465052;
  group.add(
    createBox('south-temple-wall-west', halfX - 9, wallH, wallT, 0x8d7559, -43.5, halfZ),
    createBox('south-temple-wall-east', halfX - 9, wallH, wallT, 0x8d7559, 43.5, halfZ),
    createBox('north-temple-wall', halfX * 2, wallH, wallT, 0x85735a, 0, -halfZ),
    createBox('east-temple-wall', wallT, wallH, halfZ * 2, 0x8a7459, halfX, 0),
    createBox('west-temple-wall', wallT, wallH, halfZ * 2, 0x8a7459, -halfX, 0),
    createBox('low-south-gate-base', 15, 4.2, 6, 0x8d7357, 0, halfZ + 1.5),
    createGableRoof('low-south-gate-roof', 19, 3.8, 8, tile, 0, halfZ + 1.5, 0, 4.25),
    createBox('east-side-hall-wall', 26, 4.1, 12, hallWall, 50, 20, -0.04),
    createGableRoof('east-side-hall-roof', 31, 3.8, 15, tile, 50, 20, -0.04, 4.15),
    createBox('west-side-hall-wall', 30, 4.0, 13, hallWall, -52, -12, 0.03),
    createGableRoof('west-side-hall-roof', 35, 3.7, 16, tile, -52, -12, 0.03, 4.05),
    createBox('north-utility-range-wall', 38, 3.4, 10, 0x8e7960, 0, -46, 0),
    createGableRoof('north-utility-range-roof', 43, 3.2, 12, 0x4b5354, 0, -46, 0, 3.45),
  );
  group.add(createRoadRibbon('temple-entry-worn-path', [[0, 92], [0, 70], [-2, 48], [0, 28]], 5.2, 0x87765a, 0.12));
  setNoShadow(group);
  return group;
}

function createCityBlocks() {
  const group = new Group();
  group.name = 'low-abstract-yingzhou-town';
  const maxHouses = 260;
  const maxYardWalls = 360;
  const wallGeo = new BoxGeometry(1, 1, 1);
  const roofGeo = gableRoofGeometry();
  const wallMat = new MeshStandardMaterial({ color: new Color(0x927f66), roughness: 0.96 });
  /* 民宅灰瓦。旧值 0x50585a(L86)比夯土墙(L130)暗 44 —— 一片深色斑点扎在暖土色里,
   * 远景第一眼全是屋顶。灰瓦在尘霾里本来就是**中灰**,不是深青。
   * 提到 L110、与墙差 20:仍读得出是瓦而不是墙,但不再抢。
   * 寺院与城门楼的瓦保持深色 —— 官式建筑本来就该比民宅重。 */
  const roofMat = new MeshStandardMaterial({ color: new Color(0x6a6f70), roughness: 0.94 });
  const yardMat = new MeshStandardMaterial({ color: new Color(0x7f705b), roughness: 0.98 });
  const houses = new InstancedMesh(wallGeo, wallMat, maxHouses);
  const roofs = new InstancedMesh(roofGeo, roofMat, maxHouses);
  const yardWalls = new InstancedMesh(wallGeo, yardMat, maxYardWalls);
  houses.name = 'courtyard-house-walls';
  roofs.name = 'courtyard-grey-tile-roofs';
  yardWalls.name = 'low-courtyard-walls';

  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  const up = new Vector3(0, 1, 0);
  let houseCount = 0;
  let yardCount = 0;

  function addBox(mesh, index, x, z, y, w, h, d, rot) {
    q.setFromAxisAngle(up, rot);
    p.set(x, terrainHeight(x, z) + y, z);
    s.set(w, h, d);
    m.compose(p, q, s);
    mesh.setMatrixAt(index, m);
  }

  function addHouse(x, z, w, d, h, rot) {
    if (houseCount >= maxHouses) return;
    addBox(houses, houseCount, x, z, h * 0.5, w, h, d, rot);
    q.setFromAxisAngle(up, rot);
    /* ★ 檐口要**坐在墙顶上**。旧值 h + 0.16 让屋顶悬在墙上方 16 cm,
     * 远景看就是「屋顶和房子脱离」。取 h − 0.06 让檐口略压进墙里,保证不留缝。
     * 举高按进深走(d × 0.30),房子越深屋顶越高 —— 坡度才恒定。 */
    p.set(x, terrainHeight(x, z) + h - 0.06, z);
    s.set(w * 0.98, d * 0.30 / 0.34, d * 1.06);
    m.compose(p, q, s);
    roofs.setMatrixAt(houseCount, m);
    houseCount++;
  }

  function addYardWall(x, z, w, d, rot) {
    if (yardCount >= maxYardWalls) return;
    addBox(yardWalls, yardCount++, x, z, 0.7, w, 1.4, d, rot);
  }

  let seed = 0;
  for (let gx = -255; gx <= 255; gx += 32) {
    for (let gz = -190; gz <= 190; gz += 28) {
      const x = gx + (hash(seed, 1, 1.1) - 0.5) * 7;
      const z = gz + (hash(seed, 2, 2.2) - 0.5) * 6;
      seed++;
      if (Math.abs(x) < 92 && Math.abs(z) < 74) continue;
      if (Math.abs(x) > 286 || Math.abs(z) > 213) continue;
      if (Math.abs(x) < 10 || Math.abs(z) < 9) continue;
      const r = Math.hypot(x, z);
      const density = 0.92 - smoothstep(155, 310, r) * 0.38;
      if (hash(seed, 3, 3.3) > density) continue;

      const rot = (hash(seed, 4, 4.4) > 0.5 ? 0 : Math.PI / 2) + (hash(seed, 5, 5.5) - 0.5) * 0.05;
      const cw = 19 + hash(seed, 6, 6.6) * 10;
      const cd = 16 + hash(seed, 7, 7.7) * 8;
      const h = 3.0 + hash(seed, 8, 8.8) * 1.1;
      const t = 0.42;
      addYardWall(x, z - cd * 0.52, cw, t, rot);
      addYardWall(x, z + cd * 0.52, cw, t, rot);
      addYardWall(x - cw * 0.52, z, t, cd, rot);
      addYardWall(x + cw * 0.52, z, t, cd, rot);
      addHouse(x, z - cd * 0.22, cw * 0.50, cd * 0.30, h, rot);
      if (hash(seed, 9, 9.9) > 0.25) addHouse(x - cw * 0.26, z + cd * 0.12, cw * 0.32, cd * 0.28, h * 0.86, rot);
      if (hash(seed, 10, 10.1) > 0.45) addHouse(x + cw * 0.25, z + cd * 0.16, cw * 0.30, cd * 0.25, h * 0.82, rot);
    }
  }
  houses.count = houseCount;
  roofs.count = houseCount;
  yardWalls.count = yardCount;
  setNoShadow(houses);
  setNoShadow(roofs);
  setNoShadow(yardWalls);
  group.add(yardWalls, houses, roofs);
  return group;
}

function createCityWall() {
  const group = new Group();
  group.name = 'distant-rammed-earth-city-wall';
  const halfX = 315;
  const halfZ = 230;
  const h = 6.3;
  const t = 3.0;
  group.add(
    createBox('city-wall-north-west', halfX - 18, h, t, 0x83745d, -166, -halfZ),
    createBox('city-wall-north-east', halfX - 18, h, t, 0x83745d, 166, -halfZ),
    createBox('city-wall-south-west', halfX - 28, h, t, 0x8d785b, -171, halfZ),
    createBox('city-wall-south-east', halfX - 28, h, t, 0x8d785b, 171, halfZ),
    createBox('city-wall-east', t, h, halfZ * 2, 0x82735b, halfX, 0),
    createBox('city-wall-west', t, h, halfZ * 2, 0x82735b, -halfX, 0),
    createBox('north-gate-tower', 24, 9, 11, 0x756854, 0, -halfZ - 2),
    createGableRoof('north-gate-tower-roof', 31, 4.2, 15, 0x465052, 0, -halfZ - 2, 0, 9.15),
    createBox('south-gate-low-tower', 20, 7, 9, 0x7c6a53, 0, halfZ + 1),
    createGableRoof('south-gate-low-roof', 26, 3.8, 12, 0x4c5556, 0, halfZ + 1, 0, 7.15),
  );
  setNoShadow(group);
  return group;
}

function createFieldPatches() {
  const group = new Group();
  group.name = 'farmland-patchwork';
  // 秋收后的晋北田块:灰金(未收)、土黄(翻过的地)、灰绿(冬麦)、浅金(茬地)
  const colors = [0xd2bd84, 0xb9a473, 0x9aa079, 0xdccb96];
  const geo = new PlaneGeometry(1, 1);
  const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  const m = new Matrix4();
  const p = new Vector3();
  const s = new Vector3();
  colors.forEach((color, layer) => {
    const mesh = new InstancedMesh(
      geo,
      new MeshStandardMaterial({
        color: new Color(color),
        roughness: 0.98,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      54,
    );
    mesh.name = `muted-field-plots-${layer}`;
    let used = 0;
    for (let i = 0; i < 130 && used < 54; i++) {
      const a = hash(i, layer, 12.4) * Math.PI * 2;
      const r = 340 + hash(i, layer, 13.5) * 1180;   // 外推到 1.5 km,接上山前雾
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (Math.abs(x) < 330 && Math.abs(z) < 260) continue;
      p.set(x, terrainHeight(x, z) + 0.075, z);
      s.set(42 + hash(i, layer, 14.6) * 84, 24 + hash(i, layer, 15.7) * 48, 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(used++, m);
    }
    mesh.count = used;
    setNoShadow(mesh);
    group.add(mesh);
  });
  return group;
}

function createRoads() {
  const group = new Group();
  group.name = 'soft-dust-roads';
  group.add(
    createRoadRibbon('south-gate-main-earth-road', [[0, 760], [-5, 520], [8, 330], [0, 232], [0, 98], [0, 64]], 6.2, 0x8d7b5b),
    createRoadRibbon('north-gate-main-earth-road', [[0, -760], [18, -520], [0, -330], [0, -232], [2, -120], [0, -68]], 5.8, 0x88765a),
    createRoadRibbon('west-city-lane', [[-305, -70], [-210, -54], [-122, -62], [-78, -72]], 3.4, 0x817157),
    createRoadRibbon('east-city-lane', [[305, 86], [210, 78], [128, 72], [82, 66]], 3.3, 0x837358),
    createRoadRibbon('cross-town-lane', [[-286, 18], [-160, 12], [-82, 8], [82, 10], [172, 18], [286, 24]], 3.8, 0x806f55),
  );
  return group;
}

/** 水面 ribbon:与土路同一套放样,但低粗糙度 + 微金属 —— 接得住天光与低日头的反射,
 *  这是「水系」能从画面里读出来的唯一原因;做成 roughness 0.99 就只是一条灰带子。 */
function createWaterRibbon(name, points, width, color, yOffset = 0.06) {
  const w = createRoadRibbon(name, points, width, color, yOffset);
  w.material.roughness = 0.28;
  w.material.metalness = 0.12;
  w.material.color = new Color(0xffffff);      // 顶点色已带河道深浅,这里不再压色
  return w;
}

/* ── 农田水系 ────────────────────────────────────────────────
 * 空间递进的第三档:城墙之外、山前雾之内的一整片。
 * 一条主河自西南向东北斜穿平畴,四条支渠把农田切成条块 ——
 * 水系是「农田」这一档能被读成一个层次、而不是一片色斑的骨架。
 */
function createWaterSystem() {
  const group = new Group();
  group.name = 'farmland-water-system';
  group.add(
    // 主河:桑干河一路的走向,自西南斜向东北
    /* ★ 改道:旧走向在 x = −190 / 40 / 270 三处把河面(半宽 13 m)推到 z = 223 / 192 / 219,
     * 而南城墙在 z = 228.5~231.5 —— 城墙直接架在河上。
     * 桑干河本来就在应州城**南**,把中段整体南移,最近处 z = 272
     * ⇒ 北岸 259,距墙外沿 27.5 m,留出滩地。 */
    createWaterRibbon('sanggan-main-channel', [
      [-880, 470], [-620, 400], [-395, 330], [-190, 290], [40, 272],
      [270, 292], [500, 340], [742, 396], [980, 470],
    ], 26, 0x9fb0b4, 0.05),
    // 支渠:自主河北引,穿过农田带
    createWaterRibbon('north-branch-canal-w', [[-560, 386], [-520, 236], [-486, 112], [-470, -46]], 8.5, 0x9aacb0),
    createWaterRibbon('north-branch-canal-e', [[430, 322], [468, 158], [486, 30], [472, -104]], 7.5, 0x9aacb0),
    createWaterRibbon('field-ditch-south', [[-330, 560], [-90, 540], [170, 552], [420, 578]], 5.0, 0x96a8ad),
    createWaterRibbon('field-ditch-north', [[-470, -300], [-210, -318], [60, -306], [330, -326]], 5.5, 0x96a8ad),
  );
  return group;
}

function createRiverChannel() {
  const river = createRoadRibbon(
    'faint-distant-river-channel',
    [[-820, -410], [-620, -382], [-430, -402], [-245, -356], [-60, -382], [165, -348], [420, -370], [760, -332]],
    13,
    0x8d9384,
    0.07,
  );
  river.material.color = new Color(0x9aa08f);
  river.material.roughness = 1;
  river.name = 'mist-softened-river-channel';
  return river;
}

function createTreeLines() {
  const group = new Group();
  group.name = 'sparse-northern-trees';
  const count = 150;
  const trunkGeo = new CylinderGeometry(0.16, 0.24, 2.6, 6);
  const crownGeo = new IcosahedronGeometry(1.0, 1);
  const trunkMat = new MeshStandardMaterial({ color: new Color(0x574633), roughness: 1 });
  const crownMat = new MeshStandardMaterial({ color: new Color(0x657052), roughness: 1 });
  const autumnMat = new MeshStandardMaterial({ color: new Color(0x8a7749), roughness: 1 });
  const trunks = new InstancedMesh(trunkGeo, trunkMat, count);
  const crowns = new InstancedMesh(crownGeo, crownMat, count);
  const autumnCrowns = new InstancedMesh(crownGeo, autumnMat, Math.floor(count * 0.35));
  trunks.name = 'tree-trunks';
  crowns.name = 'irregular-grey-green-tree-crowns';
  autumnCrowns.name = 'muted-autumn-tree-crowns';
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  let treeCount = 0;
  let crownCount = 0;
  let autumnCount = 0;
  for (let i = 0; i < count; i++) {
    const lane = Math.floor(hash(i, 33, 1) * 6);
    const z = -330 + lane * 122 + (hash(i, 34, 2) - 0.5) * 30;
    const x = -575 + hash(i, 35, 3) * 1150;
    if (Math.abs(x) < 98 && Math.abs(z) < 74) continue;
    const h = terrainHeight(x, z);
    q.setFromAxisAngle(new Vector3(0, 1, 0), hash(i, 36, 4) * Math.PI * 2);
    p.set(x, h + 1.28, z);
    s.setScalar(0.75 + hash(i, 37, 5) * 0.8);
    m.compose(p, q, s);
    trunks.setMatrixAt(treeCount++, m);
    p.y = h + 3.9 + hash(i, 38, 6) * 1.8;
    s.set(1.7 + hash(i, 39, 7) * 1.7, 1.3 + hash(i, 40, 8) * 1.1, 1.5 + hash(i, 41, 9) * 1.8);
    m.compose(p, q, s);
    if (hash(i, 42, 10) > 0.68 && autumnCount < autumnCrowns.count) {
      autumnCrowns.setMatrixAt(autumnCount++, m);
    } else {
      crowns.setMatrixAt(crownCount++, m);
    }
  }
  trunks.count = treeCount;
  crowns.count = crownCount;
  autumnCrowns.count = autumnCount;
  setNoShadow(trunks);
  setNoShadow(crowns);
  setNoShadow(autumnCrowns);
  group.add(trunks, crowns, autumnCrowns);
  return group;
}

/* 旧的 mountainBand / createDistantMountains 已移除。
 * 它把「远山」做成 r = 900/1260/1700 m、高 7…17 m 的窄环带 ——
 * 张角只有 0.4…0.6°(1080p 下 8…11 px),与地面同色,本就读不出来;
 * 且 r = 1700 那道在天空穹顶(r ≈ 1481)之外,又以 renderOrder −6 抢在穹顶之前绘制,
 * 每帧都被穹顶覆写。远山改由 environment/createHorizonRange 统一负责。
 */

export function createGround(scene, preset = null) {
  const g = new Group();
  g.name = 'historic-yingzhou-environment';
  const extent = WORLD;
  // 地面自己用 terrainColor(x, z) 逐顶点算色,不吃外部调色板;
  // preset 在这里只提供雾色。原先那三份 terrain/field/mountain 调色板无人读取,已删。
  const envPreset = preset ?? { fogColorObject: DAY_FOG };

  // ★ paperNoise 的 base 是**乘**在顶点色上的,默认 (0.52,0.44,0.33) 是一层深褐滤镜:
  //   有效反照率 = 顶点色 × 贴图 ≈ (0.58,0.42,0.20) × (0.32,0.22,0.12) = (0.19,0.09,0.02)
  //   —— 于是 terrainColor() 里怎么调都出不来暖金,平畴实测亮度只有目标的 45%。
  //   贴图改为中性(只留颗粒,不带色),把地面的颜色权交还给 terrainColor()。
  const { map, normalMap } = paperNoise({ base: [0.80, 0.79, 0.77] });
  map.repeat.set(extent / 42, extent / 42);
  normalMap.repeat.copy(map.repeat);
  const { plane, mat, seasonUniforms } = createTerrain(extent);
  mat.map = map;
  mat.normalMap = normalMap;
  mat.needsUpdate = true;
  g.add(plane);

  g.add(
    createFieldPatches(),
    createRiverChannel(),
    createWaterSystem(),
    createRoads(),
    createCityWall(),
    createCityBlocks(),
    createTreeLines(),
    createTemplePrecinct(),
  );

  scene.add(g);
  const baseFogColor = envPreset.fogColorObject ? envPreset.fogColorObject.clone() : DAY_FOG.clone();
  // FogExp2 密度按「塔身不受影响、地面边缘化掉一半」反算:
  //   d = 0.00068 → 150 m(塔) 0.99;400 m(街市) 0.93;
  //   1346 m(地面方片边缘) 0.42;2300 m(最近一道山脚) 0.08。
  //   为「更模糊的历史感」自 0.00045 加浓:中景越早并入雾色,画面越像褪色的旧照。
  // 之前这里被写成 scene.fog = null,于是所有 fog:true 的材质形同虚设,
  // 空气透视只能靠一层全局雾罩伪造 —— 而罩子分不出远近,只会把山一起抹平。
  scene.fog = new FogExp2(baseFogColor.getHex(), FOG_DENSITY);
  scene.background = new Color(baseFogColor);

  /* ── 季节:除主地面之外的地物 ────────────────────────────────
   * 主地面走着色器(顶点色是烘焙的,改不动);其余地物各自是独立材质,
   * 直接 lerp material.color 即可。按用途分三档,因为它们该有不同的季节响应:
   *   field  农田色块  —— 整片换色(春灰绿 / 夏锈金 / 冬雪)
   *   crown  行道树冠  —— 换色
   *   prop   房屋城墙道路 —— 只吃雪,不吃季节色(夯土墙不会变绿)
   *   water  水系      —— 冬季结冰泛白,其余不动
   * 基色在这里**捕获运行时的当前值**,不是抄一份常量:
   * 别人调 createFieldPatches / createTreeLines 的调色板,季节自动跟上。 */
  const seasonMats = { field: [], crown: [], prop: [], water: [] };
  const FIELD_RE = /^muted-field-plots-/;
  const CROWN_RE = /tree-crowns$/;
  const WATER_RE = /water-system|river-channel/;
  g.traverse((obj) => {
    if (!obj.isMesh || obj === plane) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const bucket = FIELD_RE.test(obj.name) ? 'field'
      : CROWN_RE.test(obj.name) ? 'crown'
        : (WATER_RE.test(obj.name) || WATER_RE.test(obj.parent?.name ?? '')) ? 'water'
          : 'prop';
    for (const m of mats) {
      if (!m?.color) continue;
      seasonMats[bucket].push({ mat: m, base: m.color.clone() });
    }
  });

  let propsSnowed = false;
  const c = new Color();
  const dayGround = new Color(0xffffff);
  const nightGround = new Color(0x2c3242);
  /* 雾浓度的两个来源要分开:
   *   seasonDensity —— scene/seasons 每帧写入的季节值(不接四季时即 FOG_DENSITY);
   *   fogScale      —— 深链接 ?fog=k 的一次性倍率。
   * 早先 ?fog=k 是直接 `scene.fog.density *= k`,一旦季节每帧改写密度,
   * 这个倍率第二帧就没了 —— 故改为在这里合成。 */
  let seasonDensity = FOG_DENSITY;
  let fogScale = 1;

  return {
    /** t: 0 昼 → 1 夜 */
    setDayNight(t) {
      c.copy(baseFogColor).lerp(NIGHT_FOG, t);
      if (scene.fog) scene.fog.color.copy(c);
      mat.color.copy(dayGround).lerp(nightGround, t * 0.85);
      scene.background.copy(c);
    },
    /**
     * 供 scene/seasons 写入昼态雾色与浓度。不调用时保持秋季基准。
     * ★ color 写的是**昼态基准**(baseFogColor),随后由 setDayNight 在其上做昼→夜插值 ——
     *   所以每帧的调用顺序必须是 seasons.apply() 在 setDayNight 之前。
     * ★ 这个 color 必须与 sky 的地平线收敛色同源,否则天—地接缝会重新出现。
     */
    setSeasonFog({ color, density } = {}) {
      if (color) baseFogColor.copy(color);
      if (density != null) {
        seasonDensity = density;
        if (scene.fog) scene.fog.density = seasonDensity * fogScale;
      }
    },
    /**
     * 供 scene/seasons 写入昼态地面季相。不调用时保持秋季基准(= 现状)。
     * @param {{tint:Color, amt:number, snow:number,
     *          fieldTint:Color, fieldAmt:number, crownTint:Color, crownAmt:number}} p
     */
    setSeasonGround(p = {}) {
      if (!seasonUniforms) return;
      if (p.tint) seasonUniforms.uSeasonTint.value.copy(p.tint);
      if (p.amt != null) seasonUniforms.uSeasonAmt.value = p.amt;
      const snow = p.snow ?? 0;
      seasonUniforms.uSnowAmt.value = snow;

      /* 农田色块与树冠:走「基色 + 季节色 × 混合量」,不是换一整套调色板。
       * 两个理由:
       *   1. 混合量为 0 时结果**恒等于基色**,秋季基准不需要我再抄一份
       *      —— 抄基准出过事(见 C-7 的 0.027°);
       *   2. 四块田、两种树冠本来各有各的色,整体换套会把这份差异抹平;
       *      混合保留相对差,只是一起朝季节色偏。 */
      if (p.fieldTint) {
        for (const e of seasonMats.field) e.mat.color.copy(e.base).lerp(p.fieldTint, p.fieldAmt ?? 0);
      }
      if (p.crownTint) {
        for (const e of seasonMats.crown) e.mat.color.copy(e.base).lerp(p.crownTint, p.crownAmt ?? 0);
      }
      /* 房屋/城墙/道路也吃一点季节色。
       * 实测(全强度品红诊断图):城坊一带的地面虽然是主地面、也确实上了色,
       * 但画面中段一半以上是房屋与院墙的**立面**,它们不吃季节色 ——
       * 于是整个城坊读起来像一块"免疫季节"的孤岛。
       * 给 0.16 的很小混合量:夯土墙不会变绿,但会跟着整体色温走。 */
      if (p.tint) {
        const pa = (p.amt ?? 0) * 0.16;
        for (const e of seasonMats.prop) e.mat.color.copy(e.base).lerp(p.tint, pa);
      }
      // 房屋/城墙/道路:再吃雪。0.62 而不是 1 —— 屋面雪厚、墙面立着挂不住,
      // 一个系数当所有立面与顶面的平均值(真正的按朝向覆雪在三期,那是塔身的事)。
      // 多写一帧(snowed 仍为真但 snow 已归零)才能把雪**擦干净**,
      // 否则冬→春过渡的最后一帧会把房屋永远留在半白。
      if (snow > 0.0005 || propsSnowed) {
        // ★ 注意 lerp 的起点是**当前色**而不是 e.base:上面刚写过季节色,
        //   再从 base 起算会把它抹掉。冬季 tint 的混合量是 0,所以不会重复叠加。
        for (const e of seasonMats.prop) e.mat.color.lerp(SNOW_PROP, snow * 0.62);
        for (const e of seasonMats.water) e.mat.color.copy(e.base).lerp(SNOW_ICE, snow * 0.55);
        propsSnowed = snow > 0.0005;
      }
    },
    /** 深链接 ?fog=k:k=0 直接关雾,否则作为倍率与季节浓度合成 */
    setFogScale(k) {
      fogScale = k;
      if (k <= 0) { scene.fog = null; return; }
      if (scene.fog) scene.fog.density = seasonDensity * fogScale;
    },
    dispose() {
      g.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose?.());
        }
      });
      scene.remove(g);
    },
    group: g,
  };
}
