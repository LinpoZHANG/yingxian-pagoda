/**
 * scene/seasons/createSeasonParticles.js —— 巡航四季:环境粒子(雨 / 花瓣 / 雪)
 * ═════════════════════════════════════════════════════════════
 * 一套 Points 覆盖三季,靠 uniform 变形,不是三套系统:
 *   春 —— 细雨:细长竖条、快、几乎不飘
 *   夏 —— 杏花:粉白椭圆、慢、大幅翻飞(「杏花疏影」⇒ 数量最少)
 *   冬 —— 落雪:柔和圆点、中速、随风摆
 * 秋的战乱烟火是**定点升腾**而不是**弥漫场**,结构不同,另见 createWarSmoke.js。
 *
 * ★ 三条关键设计
 *
 * 1. 位置全在顶点着色器里由 (aSeed, uTime) 算出,CPU 每帧零工作、零缓冲上传。
 *    粒子在一个跟随相机的盒子里循环,所以「可见范围内的密度」恒定 ——
 *    相机升到塔顶也不会突然没有雪。
 *
 * 2. 数量用 setDrawRange 调,不重建缓冲。
 *    aSeed 本身是随机的,所以「取前 n 个」= 「随机取 n 个」。
 *
 * 3. **近裁剪淡出**必须一开始就写进去。
 *    粒子穿过镜头时会在极近处被投影成一大片,连续几帧就是刺眼的白斑
 *    ——「雪花不能穿透镜头形成大片闪烁」。事后再补很痛,因为那时
 *    大小/速度/数量都已经按"看着对"调过一轮了。
 */

import {
  BufferGeometry, Color, Float32BufferAttribute,
  NormalBlending, Points, ShaderMaterial, Vector3,
} from 'three';

/* 粒子盒(相机局部坐标,米)半尺寸。
 * ★ 第一版给了 70×52×70:体积 25.5 万 m³ 里放 700 片雪 = 每 364 m³ 才一片,
 *   出图几乎看不见。密度是**体积**的函数,不是数量的函数 ——
 *   同样 700 片,把盒子收到 30×26×30(3.8 万 m³)就是每 54 m³ 一片,差 6.7 倍。
 *   收盒子比加数量便宜:粒子只需要在近景成立,远处的雨雪本来就该并入雾。 */
const BOX = { x: 30, y: 26, z: 30 };
/* 上限跟着数量走。6000 个 Points 在这个场景里可以忽略不计 ——
 * 真正的成本在片元(每粒都是半透明、要混合),所以**尺寸**比**数量**贵。
 * 加密度优先加数量、其次收盒子,最后才动尺寸。 */
const MAX = 6000;

const VERT = /* glsl */`
  attribute vec4 aSeed;          // x 速度抖动 / y 初相 / z,w 平面位置
  uniform float uTime;
  uniform vec3  uBox;
  uniform float uFall;           // 下落速度 m/s
  uniform float uDrift;          // 水平漂移幅度 m
  uniform float uFlutterHz;      // 摆动频率
  uniform float uSlant;          // 水平速度 / 下落速度。雨斜、雪几乎不斜
  uniform float uSize;           // 基准点径(像素 @ 单位距离)
  uniform float uSizeJitter;
  uniform float uNear;           // 近裁剪淡出的起点(米)
  varying float vAlpha;
  varying float vSpin;

  void main() {
    float sp = uFall * (0.62 + 0.76 * aSeed.x);
    // 竖向循环:mod 保证任何时刻分布都是均匀的,不需要"重生"逻辑
    float y = uBox.y - mod(aSeed.y * uBox.y * 2.0 + uTime * sp, uBox.y * 2.0);
    float ph = aSeed.y * 31.4 + aSeed.x * 17.3;
    /* 斜雨:水平位移与下落用**同一个 sp**,比值恒为 uSlant ——
     * 于是运动方向恒定,与片元里把雨丝旋转的角度 atan(uSlant) 严格一致。
     * 若横向另给一个独立速度,快粒和慢粒的倾角会不同,而雨丝的画法只有一个角度,
     * 就会出现"丝的方向和走的方向不一样"。 */
    float xBase = mod(aSeed.z * uBox.x * 2.0 + uTime * sp * uSlant, uBox.x * 2.0) - uBox.x;
    float x = xBase + uDrift * sin(uTime * uFlutterHz + ph);
    float z = (aSeed.w * 2.0 - 1.0) * uBox.z + uDrift * cos(uTime * uFlutterHz * 0.83 + ph * 1.7);


    vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
    float dist = -mv.z;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 - uSizeJitter + uSizeJitter * 2.0 * aSeed.x) * (60.0 / max(dist, 1.0));

    /* 近裁剪淡出:粒子贴到镜头上时会被投影成一大片,几帧连起来就是刺眼的白斑。
     * 从 uNear 到 uNear×8 之间淡入,盒子边缘再淡出一次,免得看见"墙"。 */
    float nearFade = smoothstep(uNear, uNear * 6.0, dist);
    float farFade = 1.0 - smoothstep(uBox.x * 0.75, uBox.x * 1.25, dist);
    vAlpha = nearFade * farFade;
    vSpin = ph;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform vec3  uColor;      // 花瓣的**外缘**色(杏花近白)
  uniform vec3  uColorBase;   // 花瓣的**基部**色(杏花基部泛粉)
  uniform float uOpacity;
  uniform float uAxisX;      // 形状:横纵轴比。雨 0.10(细长)/ 雪 1.0(圆)/ 花瓣 0.55
  uniform float uSoft;       // 边缘柔度。雨硬、雪柔
  uniform float uSpinAmt;    // 自转幅度(花瓣翻飞用,雨雪为 0)
  uniform float uSlant;      // 与顶点同一个值:雨丝要按运动方向斜过来
  uniform float uNotch;      // 花瓣末端的缺口深度。杏花是**有缺口的实心瓣**,
                             // 不是一团糊边 —— 糊边读作鹅毛,不是花
  uniform float uTime;
  varying float vAlpha;
  varying float vSpin;

  void main() {
    vec2 pc = gl_PointCoord - 0.5;
    if (uSpinAmt > 0.001) {
      float a = vSpin + uTime * uSpinAmt;
      float c = cos(a), s = sin(a);
      pc = mat2(c, -s, s, c) * pc;
      // 花瓣侧翻:横轴按时间收放,读作在空中翻面
      pc.x /= max(0.22, abs(cos(a * 0.7)));
    } else if (abs(uSlant) > 0.001) {
      // 雨丝按运动方向倾斜。角度取 atan(uSlant),与顶点里的位移比同源
      float a = atan(uSlant);
      float c = cos(a), s = sin(a);
      pc = mat2(c, -s, s, c) * pc;
    }
    float d;
    float ty = 0.0;
    if (uNotch > 0.001) {
      /* ── 花瓣的轮廓 ────────────────────────────────────────
       * 椭圆 + 一个缺口仍然读作"带豁口的圆片"。真花瓣是**扇形**:
       * 基部窄、向外张开、外缘圆而中间微凹。
       * 这里用一个「宽度随纵向张开」的超椭圆:
       *   w(ty) 基部 0.20、外缘 1.00,pow(ty, 0.45) 让它张得快、收得慢;
       *   3 次 p-范数把直角磨圆;
       *   缺口只咬外缘中段(nx 小的地方),两侧的瓣尖留住。 */
      ty = clamp(pc.y + 0.5, 0.0, 1.0);
      float w = uAxisX * (0.20 + 0.80 * pow(ty, 0.45));
      float nx = abs(pc.x) / max(w, 1e-3);
      float tipEdge = 1.0 - uNotch * (1.0 - smoothstep(0.0, 0.55, nx));
      float ny = ty / max(tipEdge, 1e-3);
      d = pow(pow(nx, 3.0) + pow(ny, 3.0), 0.3333) * 0.5;
    } else {
      d = length(vec2(pc.x / uAxisX, pc.y));
    }
    float a = smoothstep(0.5, 0.5 - uSoft, d) * vAlpha * uOpacity;
    if (a <= 0.004) discard;
    // 基部泛粉、外缘近白 —— 单色的瓣读作纸片
    vec3 col = uNotch > 0.001 ? mix(uColorBase, uColor, smoothstep(0.10, 0.80, ty)) : uColor;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * 三季的形态。
 *
 * ★ 遮蔽力 ∝ 数量 × 单粒面积 × 不透明度 —— 加密度时必须同时缩小单粒。
 *   实测(平均视距 30 m、画幅 800×500):数量 ×5 而尺寸不动,
 *   雨对背景的遮蔽从 0.4% 涨到 12%、雪从 17% 涨到 **83%** ——
 *   远山被整片雨幕/雪幕洗掉,而远山正是要看的东西。
 *   「更多」是**数量**的诉求,不是**遮蔽**的诉求;两者靠单粒面积解耦:
 *   粒数 ×5、面积 ×⅓ ⇒ 看到的是更密的雪,而不是更白的雾。
 *   下面每一项的 size/opacity 都是按这个乘积反算回去的,不是"看着调小一点"。
 */
const PARTICLE_PRESETS = {
  none: { count: 0, color: '#ffffff', opacity: 0, slant: 0, notch: 0 },
  /** 春雨:细密、快、几乎不飘。数量最多但每粒极小 */
  rain: {
    /* 数量 ×5。另外雨「不明显」是三件事一起造成的:
     * 条太短(size 3.6 ⇒ 屏上不到 8 px)、太淡(0.42)、颜色太贴近天色。
     * 点精灵是方的,雨丝的**长度**由 size 决定、**粗细**由 axisX 锁住,
     * 所以加长只能加 size —— 加了不会变粗。 */
    count: 5500, color: '#b9c6d0', opacity: 0.34,
    fall: 24, drift: 0.35, flutterHz: 0.6,
    /* 雨丝再加长 30%(size 6.2 → 8.1)。
     * 点精灵是方的,长度由 size 决定 —— 但面积 ∝ size²,直接加长遮蔽会涨 70%。
     * 同步把 axisX 0.055 → 0.042(变细 24%)抵掉:遮蔽 3.1% → 3.2%,几乎不变。 */
    size: 8.1, sizeJitter: 0.30, axisX: 0.042, soft: 0.26, spin: 0,
    slant: 0.34, notch: 0,          // 0.34 ⇒ 偏离竖直约 19°
  },
  /** 夏·杏花:粉白、慢、大幅翻飞。「疏影」⇒ 数量最少 */
  petal: {
    /* 杏花:外缘近白、基部泛粉,轮廓是扇形而不是椭圆。
     * soft 0.10 → 0.055:再实一档,瓣要有明确的边;
     * opacity → 0.88:半透明的瓣读作纸屑。花瓣是不透光的,该几乎全不透明;
     * axisX 0.62 → 0.74、notch 0.28:更宽更张、缺口更明显。 */
    count: 600, color: '#fdf7f8', colorBase: '#efb9c7', opacity: 0.88,
    fall: 1.25, drift: 3.4, flutterHz: 0.42,
    size: 7.5, sizeJitter: 0.42, axisX: 0.74, soft: 0.055, spin: 1.15,
    slant: 0, notch: 0.28,
  },
  /** 冬雪:柔和圆点、中速、随风摆。大小速度分层由 aSeed.x 给 */
  snow: {
    count: 4500, color: '#f4f8fc', opacity: 0.46,
    /* 「太快太乱」是三个参数一起造成的:
     *   fall 2.6      —— 对 cm 级雪片太快,读作被风裹着走
     *   drift 2.2     —— 摆幅太大
     *   flutterHz 0.55 —— 频率太高
     * 降到 1.4 / 0.95 / 0.24:慢、摆幅小、周期长 ⇒ 飘落。 */
    fall: 1.4, drift: 0.95, flutterHz: 0.24,
    // 更大更实(soft 0.86→0.45),遮蔽用 opacity 补回来
    /* 不透明度 0.34 → 0.46 换「实体感」,单粒 4.6 → 4.0 把遮蔽抵回去:
     * 25.4% → 26.0%,几乎不变。更实的雪片,不是更白的雾。 */
    size: 4.0, sizeJitter: 0.50, axisX: 1.0, soft: 0.34, spin: 0,
    slant: 0.06, notch: 0,
  },
};

const LERP_KEYS = ['opacity', 'fall', 'drift', 'flutterHz', 'size', 'sizeJitter',
  'axisX', 'soft', 'spin', 'slant', 'notch'];
const lerp = (a, b, k) => a + (b - a) * k;

export function createSeasonParticles({ near = 0.9 } = {}) {
  const seeds = new Float32Array(MAX * 4);
  const pos = new Float32Array(MAX * 3);      // 占位:真实位置在顶点着色器里算
  let s = 1234.567;
  const rnd = () => {
    s = Math.sin(s * 91.7 + 13.13) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < MAX; i++) {
    seeds[i * 4] = rnd(); seeds[i * 4 + 1] = rnd();
    seeds[i * 4 + 2] = rnd(); seeds[i * 4 + 3] = rnd();
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new Float32BufferAttribute(seeds, 4));
  geo.setDrawRange(0, 0);
  // 位置是算出来的,包围球没有意义;关掉视锥剔除,否则整团会被误剔
  geo.boundingSphere = null;

  const mat = new ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: true, fog: false,
    blending: NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uBox: { value: new Vector3(BOX.x, BOX.y, BOX.z) },
      uFall: { value: 2.6 }, uDrift: { value: 2.0 }, uFlutterHz: { value: 0.5 },
      uSize: { value: 9 }, uSizeJitter: { value: 0.5 }, uNear: { value: near },
      uColor: { value: new Color('#eef2f6') },
      uColorBase: { value: new Color('#eef2f6') },
      uOpacity: { value: 0 },
      uAxisX: { value: 1 }, uSoft: { value: 0.86 }, uSpinAmt: { value: 0 },
      uSlant: { value: 0 }, uNotch: { value: 0 },
    },
  });

  let suspended = false, wantVisible = false;
  const points = new Points(geo, mat);
  points.name = 'season-particles';
  points.frustumCulled = false;
  // 排在不透明之后、山前雾之前:粒子该被塔与地面遮挡,但不该被雾罩吃掉
  points.renderOrder = 10;
  const cA = new Color(), cB = new Color();

  return {
    object: points,
    /** 每帧:跟随相机(盒子恒定包住视野),并推进时钟 */
    tick(dt, camera) {
      if (suspended) return;
      mat.uniforms.uTime.value += dt;
      if (camera) points.position.copy(camera.position);
    },
    /** 佛像探索等模式下整组挂起:不绘制、不推进时钟 */
    setSuspended(v) { suspended = !!v; points.visible = !suspended && wantVisible; },
    /**
     * 供 scene/seasons:两季形态 + 混合量。
     * 形态之间**逐参数插值**而不是硬切 —— 雨渐渐变慢变圆就成了雪,
     * 交界处不会出现"一帧之间换了一种天气"。
     */
    setSeason({ from, to, blend = 0 } = {}) {
      const a = PARTICLE_PRESETS[from] ?? PARTICLE_PRESETS.none;
      const b = PARTICLE_PRESETS[to] ?? PARTICLE_PRESETS.none;
      const k = blend;
      const u = mat.uniforms;
      for (const key of LERP_KEYS) {
        const va = a[key] ?? PARTICLE_PRESETS.snow[key] ?? 0;
        const vb = b[key] ?? PARTICLE_PRESETS.snow[key] ?? 0;
        const v = lerp(va, vb, k);
        switch (key) {
          case 'opacity': u.uOpacity.value = v; break;
          case 'fall': u.uFall.value = v; break;
          case 'drift': u.uDrift.value = v; break;
          case 'flutterHz': u.uFlutterHz.value = v; break;
          case 'size': u.uSize.value = v; break;
          case 'sizeJitter': u.uSizeJitter.value = v; break;
          case 'axisX': u.uAxisX.value = Math.max(0.05, v); break;
          case 'soft': u.uSoft.value = v; break;
          case 'slant': u.uSlant.value = v; break;
          case 'notch': u.uNotch.value = v; break;
          default: u.uSpinAmt.value = v;
        }
      }
      cA.set(a.color); cB.set(b.color);
      u.uColor.value.copy(cA).lerp(cB, k);
      // 基部色缺省时退回主色 ⇒ 雨雪不受影响
      cA.set(a.colorBase ?? a.color); cB.set(b.colorBase ?? b.color);
      u.uColorBase.value.copy(cA).lerp(cB, k);
      // 数量取两端的较大值 —— 过渡中途密度不塌,靠 opacity 收尾
      const n = Math.round(Math.max(lerp(a.count, b.count, k), Math.min(a.count, b.count)));
      geo.setDrawRange(0, Math.min(MAX, n));
      wantVisible = n > 0 && u.uOpacity.value > 0.004;
      points.visible = wantVisible && !suspended;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
