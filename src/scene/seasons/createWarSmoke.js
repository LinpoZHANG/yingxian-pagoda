/**
 * scene/seasons/createWarSmoke.js —— 巡航四季:秋·战乱烽烟
 * ═════════════════════════════════════════════════════════════
 * 与雨雪花瓣不是一类东西,所以另起一套:
 *   雨雪是**弥漫场** —— 跟随相机、均匀充满视野;
 *   烽烟是**定点升腾** —— 世界锚定在城坊里若干着火点上,有明确的柱状形态。
 * 用一套系统硬做两件事,会逼出一堆"这个季节忽略那个参数"的分支。
 *
 * ★ 秋仍然是基准
 *   战乱不改秋的调色板,而是一个 0→1 的**叠加层**,在秋这一圈里升起来:
 *     圈内 0~35%   war = 0  ⇒ 逐值等于太平的晋北秋色(基准不破)
 *     圈内 35~80%  起火起烟
 *     圈内 80~100% 满城烽烟,随即并入冬 —— 雪落下来把火盖住,是天然的收束
 *   这样既拿到叙事,又保住了 `?seasons=0` 与太平之秋逐像素相等这条地基。
 *
 * ★ 烟不用 Points 而用**朝相机的四边形带**
 *   Points 的 gl_PointSize 有上限(多数实现 64~256 px),近处的烟柱会被截断成
 *   一串小方块。烟柱要在中景占到几十米高,必须是真几何。
 */

import {
  AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute,
  Group, Mesh, NormalBlending, ShaderMaterial,
} from 'three';

/** 着火点:城坊里,避开寺院院墙(±78 × ±62)与塔基 */
/* 着火点分两圈。
 * 外圈(半径 250~480):成片烧起来的坊里,柱高柱粗,是画面的骨架。
 * 内圈(半径 135~230):贴着寺院院墙外的那几进房子,尺度小 ——
 *   这是「城内房子上也着火」需要的那一层:火贴在屋面上,而不是远远地烧。
 *   内圈必须避开寺院院墙(±78 × ±62),否则烟柱会从院子里长出来。 */
const SITES = [
  // 外圈
  { x: -210, z: 165, s: 1.00 }, { x: 175, z: 235, s: 0.88 },
  { x: -285, z: -120, s: 0.94 }, { x: 240, z: -195, s: 0.70 },
  { x: 95, z: 330, s: 1.05 }, { x: -140, z: -310, s: 0.76 },
  { x: 330, z: 60, s: 0.72 }, { x: -95, z: 250, s: 0.66 },
  { x: 300, z: 300, s: 0.92 }, { x: -350, z: 40, s: 0.80 },
  { x: 130, z: -300, s: 0.74 }, { x: -240, z: 380, s: 0.98 },
  // 内圈:屋面上的火,起点抬到屋脊高度
  { x: -118, z: 138, s: 0.34, y: 4.2 }, { x: 132, z: 122, s: 0.30, y: 3.8 },
  { x: -96, z: -145, s: 0.36, y: 4.0 }, { x: 155, z: -108, s: 0.28, y: 3.6 },
  { x: 42, z: 196, s: 0.32, y: 4.4 }, { x: -172, z: -68, s: 0.30, y: 3.9 },
  { x: 205, z: 45, s: 0.34, y: 4.1 }, { x: -55, z: -205, s: 0.29, y: 3.7 },
];
/* 第一版 7 处、每处 26 团、不透明度 0.34 —— 出图读作「几根烟囱」,不是被焚的城。
 * 烟柱要成立需要三件事同时给够:**处数**(城是成片烧的)、**粗细**(柱要比房子宽)、
 * **不透明度**(能挡住后面的房子才叫烟)。只加其中一样都还是烟囱。 */
const PUFFS = 64;          // 每根烟柱的烟团数(团多而小 ⇒ 有颗粒感;团少而大 ⇒ 棉花)
const RISE = 105;          // 烟柱高度(米)

const SMOKE_VERT = /* glsl */`
  attribute vec3 aQuad;      // x,y 角点偏移(-1..1) / z 该烟团在柱上的序号 0..1
  attribute vec2 aRnd;       // 每团的随机:摆动相位、尺寸
  uniform float uTime;
  uniform float uWar;
  uniform float uRise;
  uniform float uSiteScale;
  varying float vT;
  varying vec2  vUv;
  varying float vFade;

  void main() {
    // 沿柱上升并循环;uWar 同时控制柱高与显现
    float t = fract(aQuad.z + uTime * (0.055 + 0.03 * aRnd.y));
    vT = t;
    float h = t * uRise * uSiteScale * (0.35 + 0.65 * uWar);
    // 越高越散、越被风推开(与 lighting 的左侧来光同侧,读作同一场风)
    /* 柱底比一间房宽,但顶端不能一路摊成锥 —— 锥形读作"喷泉"。
     * 上半段收一收,让轮廓是**柱**而不是三角。 */
    float spread = 7.0 + (t - 0.55 * t * t) * 52.0 * uSiteScale;
    /* 湍流:两个不同频率的摆动叠加,再加每团自己的横向偏置。
     * 只用一个正弦时所有烟团同相,整柱像一根被吹弯的软管。 */
    float wob = sin(uTime * 0.6 + aRnd.x * 22.0 + t * 4.0) * (1.0 + t * 6.0)
              + sin(uTime * 1.7 + aRnd.y * 37.0 + t * 11.0) * (0.4 + t * 2.6);
    float lat = (aRnd.x - 0.5) * spread * 0.9;
    vec3 c = vec3(wob + lat - t * t * 40.0, h, wob * 0.7 + (aRnd.y - 0.5) * spread * 0.8 + t * 11.0);

    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    // 朝相机的四边形:在观察空间里直接加偏移,天然 billboard
    float sz = spread * (0.32 + 0.46 * aRnd.y);
    mv.xy += aQuad.xy * sz;
    gl_Position = projectionMatrix * mv;
    vUv = aQuad.xy;
    // 底部刚离地时淡入、顶端散尽时淡出
    vFade = smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.62, 1.0, t));
  }
`;

const SMOKE_FRAG = /* glsl */`
  precision highp float;
  uniform vec3  uNear;       // 柱底·**战况最烈**时:暖褐
  uniform vec3  uNearEarly;  // 柱底·刚起火时:浅烟灰
  uniform vec3  uFar;        // 柱顶:冷灰,并入天色
  uniform float uWar;
  varying float vT;
  varying vec2  vUv;
  varying float vFade;
  void main() {
    float d = length(vUv);
    float a = smoothstep(1.0, 0.05, d) * vFade * uWar * 0.40;
    if (a <= 0.004) discard;
    // 转灰要晚:柱身大半应当是暗褐,只有顶端散开的部分才并入天色
    /* 烟色随战况**逐渐加深**:刚起火是浅烟灰,烧起来才转暗褐。
     * 一上来就给最深的色,读作"已经烧了很久",没有"起火"这个过程。 */
    vec3 base = mix(uNearEarly, uNear, smoothstep(0.15, 0.85, uWar));
    // 转灰要晚:柱身大半应当是暗褐,只有顶端散开的部分才并入天色
    gl_FragColor = vec4(mix(base, uFar, smoothstep(0.45, 0.95, vT)), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const FIRE_VERT = /* glsl */`
  attribute vec3 aQuad;
  attribute vec2 aRnd;
  uniform float uTime;
  uniform float uWar;
  uniform float uSiteScale;
  varying vec2  vUv;
  varying float vFade;
  void main() {
    float t = fract(aQuad.z + uTime * (0.55 + 0.5 * aRnd.y));
    vec3 c = vec3(sin(uTime * 2.1 + aRnd.x * 19.0) * 3.4,
                  2.6 + t * 15.0 * uSiteScale,
                  cos(uTime * 1.7 + aRnd.x * 11.0) * 3.0);
    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    mv.xy += aQuad.xy * (5.2 - t * 3.6) * uSiteScale * (0.6 + aRnd.y);
    gl_Position = projectionMatrix * mv;
    vUv = aQuad.xy;
    /* 火与烟同时出现。火只有 14 个小四边形、烟有 64 个大的,
     * 同样线性上升时烟先被看见 —— 给火一个更快的起势(pow 0.55)补回来。 */
    vFade = (1.0 - t) * pow(uWar, 0.55);
  }
`;

const FIRE_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uHot;
  varying vec2  vUv;
  varying float vFade;
  void main() {
    float a = smoothstep(1.0, 0.0, length(vUv)) * vFade * 0.55;
    if (a <= 0.004) discard;
    gl_FragColor = vec4(uHot * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** 每个着火点一组四边形:puffs 个 billboard,索引成两三角形 */
function buildPuffs(n, seed) {
  const quad = [], rnd = [], index = [];
  let s = seed;
  const r = () => { s = Math.sin(s * 77.3 + 5.7) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const a = r(), b = r();
    for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      quad.push(qx, qy, t);
      rnd.push(a, b);
    }
    const o = i * 4;
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(n * 4 * 3), 3));
  g.setAttribute('aQuad', new Float32BufferAttribute(quad, 3));
  g.setAttribute('aRnd', new Float32BufferAttribute(rnd, 2));
  g.setIndex(index);
  g.boundingSphere = null;
  return g;
}

export function createWarSmoke({
  /* ★ 烟必须**暗**。第二版给的是 near#6b5341 / far#8d8b88(浅灰),
   * 出图读作两团白棉花 —— 浅色烟在明亮的霾天里根本分不出是烟还是云。
   * 真实的浓烟在受光侧也只是暗褐,顶端散尽时才转灰。 */
  /* 最深的烟色比上一版提亮一档(#312620 → #4b3c31):
   * 纯黑的烟在暖褐的战乱大气里读作"洞",而不是烟。 */
  smokeNear = '#4b3c31',
  smokeNearEarly = '#9a8b7c',
  smokeFar = '#6d655c',
  fireColor = '#ff9a3c',
  nightSmokeNear = '#1a1410',
  nightSmokeFar = '#262a33',
} = {}) {
  const group = new Group();
  group.name = 'war-smoke';
  group.visible = false;

  const dNear = new Color(smokeNear), dFar = new Color(smokeFar);
  const nNear = new Color(nightSmokeNear), nFar = new Color(nightSmokeFar);

  const smokeMats = [], fireMats = [], geos = [];
  SITES.forEach((site, i) => {
    const sg = buildPuffs(PUFFS, 3.7 + i * 1.9);
    const sm = new ShaderMaterial({
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      blending: NormalBlending,
      uniforms: {
        uTime: { value: 0 }, uWar: { value: 0 }, uRise: { value: RISE },
        uSiteScale: { value: site.s },
        uNear: { value: dNear.clone() }, uFar: { value: dFar.clone() },
        uNearEarly: { value: new Color(smokeNearEarly) },
      },
    });
    const smoke = new Mesh(sg, sm);
    smoke.name = `war-smoke-column-${i}`;
    smoke.position.set(site.x, site.y ?? 0, site.z);
    smoke.frustumCulled = false;
    smoke.renderOrder = 8;

    const fg = buildPuffs(14, 11.3 + i * 2.7);
    const fm = new ShaderMaterial({
      vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      blending: AdditiveBlending,          // 火是发光体,必须加色而不是混色
      uniforms: {
        uTime: { value: 0 }, uWar: { value: 0 },
        uSiteScale: { value: site.s }, uHot: { value: new Color(fireColor) },
      },
    });
    const fire = new Mesh(fg, fm);
    fire.name = `war-fire-${i}`;
    fire.position.set(site.x, site.y ?? 0, site.z);
    fire.frustumCulled = false;
    fire.renderOrder = 9;

    group.add(smoke, fire);
    smokeMats.push(sm); fireMats.push(fm); geos.push(sg, fg);
  });

  let war = 0, suspended = false;
  const syncVisible = () => { group.visible = war > 0.002 && !suspended; };
  return {
    group,
    /** 佛像探索等模式下整组挂起:不绘制、不推进时钟 */
    setSuspended(v) { suspended = !!v; syncVisible(); },
    tick(dt) {
      if (!group.visible) return;
      for (const m of smokeMats) m.uniforms.uTime.value += dt;
      for (const m of fireMats) m.uniforms.uTime.value += dt;
    },
    /** 0 = 太平(整组不绘制,零开销) → 1 = 满城烽烟 */
    setWar(v) {
      war = Math.max(0, Math.min(1, v));
      syncVisible();
      for (const m of smokeMats) m.uniforms.uWar.value = war;
      for (const m of fireMats) m.uniforms.uWar.value = war;
    },
    get war() { return war; },
    /** 夜里烟色转暗、火光更显 —— 与其它模块同一条昼夜时钟 */
    setDayNight(t) {
      const k = Math.min(1, Math.max(0, t));
      for (const m of smokeMats) {
        m.uniforms.uNear.value.copy(dNear).lerp(nNear, k);
        m.uniforms.uFar.value.copy(dFar).lerp(nFar, k);
      }
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      smokeMats.forEach((m) => m.dispose());
      fireMats.forEach((m) => m.dispose());
    },
  };
}
