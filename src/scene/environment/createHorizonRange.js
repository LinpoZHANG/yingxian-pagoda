/**
 * scene/environment/createHorizonRange.js —— 远山地平线(装配)
 * ─────────────────────────────────────────────────────────────
 * 本模块只负责把地平线一带的四件东西装到一起并统一昼夜:
 *
 *   1. 霾带 haze plain —— 地面方片(±1346 m)之外,把地平铺到 9.6 km。
 *      fog: true,与地面走同一条 FogExp2 曲线,接缝在数值上消失。
 *   2. 远山 mountain terrain —— 真高程面(见 createMountainTerrain.js)。
 *      2026-09-04 由三道竖直环带改来:环带只有一条脊线可调,底下是平幕布,
 *      没有山嘴、没有沟谷、层间没有真实遮挡,所以永远是「贴画」。
 *   3. 脊线辉光 —— 山脊外侧先亮再并入天色的 airlight。
 *      **由地形的天际线反算**,因此天生贴合;放在比山系更远的 9 km 上,
 *      任何山体都比它近,会自动挡掉 —— 它于是只出现在「背后是天空」的地方。
 *   4. 山前雾 —— 相机锚定的横雾带,绘制序在山之后,吃掉山脚。
 *
 * 视锥:山系外缘 8.6 km、辉光 9 km、霾带 9.6 km,均远小于 far = H×200 = 13.46 km。
 * 详见 docs/adjustments.md§二。
 */

import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group,
  Mesh, MeshBasicMaterial, ShaderMaterial,
} from 'three';
import { createMountainTerrain, SCRUB_BASE } from './createMountainTerrain.js';

/* ── 脊线辉光 ──────────────────────────────────────────────── */
const GLOW_R = 9000;
const EYE_REF = 45;
const GLOW_H = 470;                    // ≈3° @ 9 km

const GLOW_VERT = /* glsl */`
  attribute float aGlowT;
  varying float vT;
  void main() {
    vT = aGlowT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAG = /* glsl */`
  precision highp float;
  varying float vT;
  uniform vec3  uGlow;
  uniform float uStrength;
  uniform float uPow;
  void main() {
    float a = uStrength * pow(1.0 - vT, uPow);
    if (a <= 0.003) discard;
    gl_FragColor = vec4(uGlow, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** 由地形天际线(逐方位仰角)反算辉光带:底缘贴着山,顶缘向上淡出 */
function buildGlowGeometry(skyline, steps) {
  const position = [], t = [], index = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const yBase = EYE_REF + Math.tan(skyline[i]) * GLOW_R;
    const x = Math.sin(a) * GLOW_R, z = Math.cos(a) * GLOW_R;
    // 底缘再压低 12 m:宁可被山挡住一点,也不要露出一线天缝
    position.push(x, yBase - 12, z, x, yBase + GLOW_H, z);
    t.push(0, 1);
    if (i < steps) {
      const j = i * 2;
      index.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(position, 3));
  geo.setAttribute('aGlowT', new Float32BufferAttribute(t, 1));
  geo.setIndex(index);
  geo.boundingSphere = null;
  return geo;
}

/* ── 山前雾 ────────────────────────────────────────────────── */
/* opacity 0.46 → 0.34:山前雾压在山脚上,和空气透视是**叠加**的两道 ——
 * 两道都给满,山就只剩天际线那一条边。 */
const MIST = { radius: 2600, bottom: -140, top: 112, parallax: 0.95, opacity: 0.34 };
const MIST_STEPS = 512;

const MIST_VERT = /* glsl */`
  attribute float aT;
  varying float vT;
  void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const MIST_FRAG = /* glsl */`
  precision highp float;
  varying float vT;
  uniform vec3 uFog;
  uniform float uOpacity;
  void main() {
    float a = uOpacity * pow(1.0 - vT, 2.2);
    if (a <= 0.003) discard;
    gl_FragColor = vec4(uFog, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function buildMistGeometry() {
  const position = [], t = [], index = [];
  for (let i = 0; i <= MIST_STEPS; i++) {
    const a = (i / MIST_STEPS) * Math.PI * 2;
    const top = MIST.top * (0.82 + 0.18 * (0.5 + 0.5 * Math.sin(2 * a + 1.7))
                                 + 0.10 * (0.5 + 0.5 * Math.sin(5 * a + 4.1)));
    const x = Math.sin(a) * MIST.radius, z = Math.cos(a) * MIST.radius;
    position.push(x, MIST.bottom, z, x, top, z);
    t.push(0, 1);
    if (i < MIST_STEPS) {
      const j = i * 2;
      index.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(position, 3));
  geo.setAttribute('aT', new Float32BufferAttribute(t, 1));
  geo.setIndex(index);
  geo.boundingSphere = null;
  return geo;
}

/* ── 地平霾带 ──────────────────────────────────────────────── */
function buildHazePlain({ inner = 1150, outer = 9600, rings = 28, segments = 192, nearColor, farColor }) {
  const position = [], color = [], index = [];
  const c = new Color();
  const k = Math.log(outer / inner);
  for (let ri = 0; ri <= rings; ri++) {
    const r = inner * Math.exp(k * (ri / rings));
    const t = Math.min(1, (r - inner) / 3000);
    c.copy(nearColor).lerp(farColor, t * t * (3 - 2 * t));
    for (let si = 0; si <= segments; si++) {
      const a = (si / segments) * Math.PI * 2;
      position.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      color.push(c.r, c.g, c.b);
    }
  }
  const stride = segments + 1;
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segments; si++) {
      const a = ri * stride + si;
      index.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(position, 3));
  geo.setAttribute('color', new Float32BufferAttribute(color, 3));
  geo.setIndex(index);
  return geo;
}

export function createHorizonRange({
  /* 曾有一个 hazeColor 参数,EnvironmentSystem 也一直在传 —— 但它只被存进一个
   * 从未被读取的局部变量。霾带是 fog:true,颜色本来就跟着 scene.fog 走,
   * 根本不需要单独的入参。留着会让人误以为它是季节的雾色旋钮,已删。 */
  /** 远山空气透视并入的方向:比地面雾色暗一档,否则过 ACES 后与天空等亮、毫无对比。
   *  色相要**偏冷**:暖霾(#bdb4a2)会把整片山推回沙色 —— 晋北的远山入雾是灰青的。 */
  ridgeHazeColor = '#adb2b3',
  /** 山体分带色:晋北恒山一带下部黄土、上部灰岩,各一对「受光/背光」。
   *  只给一对暖沙色会读成沙丘 —— 分带是「山西的山」与「沙漠」的分界。 */
  rockLit = '#8e8878',
  rockShadow = '#474e58',
  loessLit = '#a38f66',
  loessShadow = '#585044',
  mistColor = '#c4bcae',
  glowColor = '#efe4cd',
  nightHazeColor = '#394152',
  nightRidgeHazeColor = '#2b3242',
  nightRockLit = '#39414f',
  nightRockShadow = '#161b26',
  nightLoessLit = '#3a3527',
  nightLoessShadow = '#1d1a14',
  nightGlowColor = '#4a5266',
  nightPlainTint = '#12161f',
  /** 雪在夜里的两端:月光下的雪是冷蓝,不是灰白 */
  snowLit = '#e8ecf0',
  snowShadow = '#93a2b4',
  nightSnowLit = '#5a6b86',
  nightSnowShadow = '#26303f',
} = {}) {
  const group = new Group();
  group.name = 'horizon-range';

  const nightHaze = new Color(nightHazeColor);
  const dayRidgeHaze = new Color(ridgeHazeColor);
  const nightRidgeHaze = new Color(nightRidgeHazeColor);
  const dRockLit = new Color(rockLit), dRockShadow = new Color(rockShadow);
  const dLoessLit = new Color(loessLit), dLoessShadow = new Color(loessShadow);
  const nRockLit = new Color(nightRockLit), nRockShadow = new Color(nightRockShadow);
  const nLoessLit = new Color(nightLoessLit), nLoessShadow = new Color(nightLoessShadow);
  const dayMist = new Color(mistColor);
  const dayGlow = new Color(glowColor);
  const nGlow = new Color(nightGlowColor);
  const plainDayTint = new Color(0xffffff);
  const plainNightTint = new Color(nightPlainTint);
  const dSnowLit = new Color(snowLit), dSnowShadow = new Color(snowShadow);
  const nSnowLit = new Color(nightSnowLit), nSnowShadow = new Color(nightSnowShadow);
  /* 灌丛斑的昼态基准由季节写入(夏绿冬枯),夜端固定 —— 月下的植被读不出季相。 */
  const dScrub = new Color(SCRUB_BASE.color);
  const tmpBloom = new Color();
  const nScrub = new Color('#1b2028');

  /* 1. 霾带:世界锚定、不透明写深度 */
  const plainGeo = buildHazePlain({
    nearColor: new Color('#c4ab7c'),
    farColor: new Color('#bfb5a4'),
  });
  const plainMat = new MeshBasicMaterial({
    vertexColors: true, side: DoubleSide, fog: true, depthWrite: true, depthTest: true,
  });
  const plain = new Mesh(plainGeo, plainMat);
  plain.name = 'horizon-haze-plain';
  plain.position.y = -1.2;
  plain.renderOrder = -50;
  plain.frustumCulled = false;
  plain.castShadow = plain.receiveShadow = false;
  group.add(plain);

  /* 2. 远山:真高程面(世界锚定) */
  const terrain = createMountainTerrain({
    rockLit, rockShadow, loessLit, loessShadow,
    hazeColor: ridgeHazeColor,
  });
  group.add(terrain.mesh);

  /* 3. 脊线辉光:由天际线反算,放在山系之外 */
  const glowMat = new ShaderMaterial({
    vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
    side: DoubleSide, transparent: true, depthWrite: false, depthTest: true, fog: false,
    uniforms: {
      uGlow: { value: dayGlow.clone() },
      uStrength: { value: 0.52 },
      uPow: { value: 1.8 },
    },
  });
  const glow = new Mesh(buildGlowGeometry(terrain.skyline(EYE_REF), terrain.azimuthSteps), glowMat);
  glow.name = 'ridge-glow';
  glow.frustumCulled = false;
  glow.castShadow = glow.receiveShadow = false;
  glow.renderOrder = -32;
  group.add(glow);

  /* 4. 山前雾:相机锚定,绘制序在山之后 */
  const mistGeo = buildMistGeometry();
  const mistMat = new ShaderMaterial({
    vertexShader: MIST_VERT, fragmentShader: MIST_FRAG,
    side: DoubleSide, transparent: true, depthWrite: false, depthTest: true, fog: false,
    uniforms: { uFog: { value: dayMist.clone() }, uOpacity: { value: MIST.opacity } },
  });
  const mist = new Mesh(mistGeo, mistMat);
  mist.name = 'foothill-mist';
  mist.frustumCulled = false;
  mist.castShadow = mist.receiveShadow = false;
  mist.renderOrder = -28;
  const mistAnchor = new Group();
  mistAnchor.name = 'foothill-mist-anchor';
  mistAnchor.add(mist);
  group.add(mistAnchor);

  return {
    group,
    terrain,
    /** 每帧:只有山前雾跟相机(大气效果);远山是真地形,世界锚定 */
    tick(_dt, camera) {
      if (!camera) return;
      mistAnchor.position.set(camera.position.x * MIST.parallax, 0, camera.position.z * MIST.parallax);
    },
    /** 太阳方向须与 lighting 一致 —— 山的明暗现在是真打光,方向错了立刻看得出来 */
    setSunDir(v, camera) {
      if (camera) terrain.setSunDirWorld(v, camera);
    },
    /** t: 0 昼 → 1 夜(与 lighting 同一插值时钟) */
    setDayNight(t) {
      const k = Math.min(1, Math.max(0, t));
      const c = new Color();
      const tu = terrain.material.uniforms;
      tu.uRockLit.value.copy(dRockLit).lerp(nRockLit, k);
      tu.uRockShadow.value.copy(dRockShadow).lerp(nRockShadow, k);
      tu.uLoessLit.value.copy(dLoessLit).lerp(nLoessLit, k);
      tu.uLoessShadow.value.copy(dLoessShadow).lerp(nLoessShadow, k);
      terrain.material.uniforms.uHaze.value.copy(dayRidgeHaze).lerp(nightRidgeHaze, k);
      glowMat.uniforms.uGlow.value.copy(dayGlow).lerp(nGlow, k);
      glowMat.uniforms.uStrength.value = 0.52 * (1 - k * 0.55);
      mistMat.uniforms.uFog.value.copy(dayMist).lerp(nightHaze, k);
      mistMat.uniforms.uOpacity.value = MIST.opacity * (1 - k * 0.35);
      plainMat.color.copy(plainDayTint).lerp(plainNightTint, k);
      // 积雪的两端也走同一条昼夜时钟:季节只管雪线与覆盖量,雪的**色**归昼夜
      tu.uSnowLit.value.copy(dSnowLit).lerp(nSnowLit, k);
      tu.uSnowShadow.value.copy(dSnowShadow).lerp(nSnowShadow, k);
      tu.uScrub.value.copy(dScrub).lerp(nScrub, k);
      void c;
    },
    /**
     * 供 scene/seasons 写入昼态的霾/雾/辉光与积雪。不调用时保持秋季基准。
     * ★ 写的是**昼态基准**(dayRidgeHaze / dayMist / dayGlow),
     *   随后由 setDayNight 在其上做昼→夜插值 ——
     *   所以每帧顺序必须是 seasons.apply() 在 setDayNight 之前。
     * ★ 雪线与覆盖量与昼夜**无关**:冬夜照样有雪,只是被月光照。
     */
    setSeasonDay({
      ridgeHaze, mistFrom, mistTo, glowFrom, glowTo, blend = 0, snowLine, snowAmt,
      rockLitFrom, rockLitTo, rockShadowFrom, rockShadowTo,
      loessLitFrom, loessLitTo, loessShadowFrom, loessShadowTo,
      scrubFrom, scrubTo, scrubAmt, bloomFrom, bloomTo, bloomAmt,
    } = {}) {
      if (ridgeHaze) dayRidgeHaze.copy(ridgeHaze);
      if (mistFrom) dayMist.copy(mistFrom).lerp(mistTo ?? mistFrom, blend);
      if (glowFrom) dayGlow.copy(glowFrom).lerp(glowTo ?? glowFrom, blend);
      /* 山的季相:岩土两带的四个端色 + 灌丛斑。
       * 写的是**昼态基准**,夜色仍由 setDayNight 在其上插值 ——
       * 与 mist/glow 同一条路径,四季与昼夜不互相覆写。 */
      if (rockLitFrom) dRockLit.copy(rockLitFrom).lerp(rockLitTo ?? rockLitFrom, blend);
      if (rockShadowFrom) dRockShadow.copy(rockShadowFrom).lerp(rockShadowTo ?? rockShadowFrom, blend);
      if (loessLitFrom) dLoessLit.copy(loessLitFrom).lerp(loessLitTo ?? loessLitFrom, blend);
      if (loessShadowFrom) dLoessShadow.copy(loessShadowFrom).lerp(loessShadowTo ?? loessShadowFrom, blend);
      if (scrubFrom) dScrub.copy(scrubFrom).lerp(scrubTo ?? scrubFrom, blend);
      if (scrubAmt != null) terrain.setScrub({ amt: scrubAmt });
      if (bloomFrom) {
        tmpBloom.copy(bloomFrom).lerp(bloomTo ?? bloomFrom, blend);
        terrain.setBloom({ color: tmpBloom, amt: bloomAmt ?? 0 });
      }
      terrain.setSnow({ line: snowLine, amt: snowAmt });
    },
    dispose() {
      plainGeo.dispose(); plainMat.dispose();
      terrain.dispose();
      glow.geometry.dispose(); glowMat.dispose();
      mistGeo.dispose(); mistMat.dispose();
    },
  };
}
