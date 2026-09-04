/**
 * scene/environment/createMountainTerrain.js —— 远山:真高程面
 * ─────────────────────────────────────────────────────────────
 * 取代此前的三道**竖直环带**。环带只有一条脊线可调,脊线以下是一张平幕布:
 * 没有伸向观者的山嘴、没有退进去的沟谷、层与层之间也没有真实遮挡 ——
 * 所以无论怎么调色都是「贴画」(用户语)。
 *
 * 这里改为一圈**真正的高程面**(环形地形),形与体积都是几何给的:
 *   · 山嘴与沟谷在深度上真实前后错开,自遮挡自然发生;
 *   · 剪影是三维形体的**副产品**,不再是一条手画的曲线;
 *   · 法线是真的,低日头的掠射在坡面上给出可信的明暗;
 *   · 远近层次来自**真实距离**,不再靠三层各自的 hazeMix 去假装。
 *
 * 世界锚定(不跟相机):这是真地形。相机在塔周 ±250 m 内活动,
 * 2.3~8.6 km 外的视差本就微乎其微,锚定反而会让山嘴的遮挡关系失真。
 */

import {
  BufferGeometry, Color, Float32BufferAttribute, Mesh, ShaderMaterial, Vector3,
} from 'three';

/* ── 尺度 ────────────────────────────────────────────────────
 * R0 山前平原的外缘(山体自此抬起);R1 山系外缘。
 * PEAK 主峰高程。900 m 那版画面窗口内最高只有 4.3°(全周 95 分位 6.8°)——
 * 高程场本身不低,是**可见方位窗口**恰好落在低处;提到 1180 m 补足。
 */
const R0 = 2300;
const R1 = 8600;
const PEAK = 1180;
const AZ = 512;          // 方位采样
const RAD = 56;          // 径向采样(几何级距,近处密)
const BASE_Y = 2.0;      // 整体抬离霾带(y = −1.2),避免共面闪烁

/* ── 二维值噪声(可平铺哈希,与地面 ground.js 同族) ───────────── */
function hash2(ix, iz, seed) {
  const s = Math.sin(ix * 127.1 + iz * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}
const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ── 鞍部:塔背后开垭口 ──────────────────────────────────────
 * 塔在原点、相机在方位 A,则塔背后的山在 A+180°。
 * 默认机位 south/elev(0°)、overview(32°)、se(40°)对应 180°/212°/220°。
 */
/* ★ 宽度只需盖住**塔的方位角**,不是盖住整个画面。
 * 塔顶在 se 机位只占 ±3° 左右,而第一版给了 19° 宽 —— 画面窗口(196°~244°)
 * 的天际线于是全在垭口里:实测窗口内只有 1.7°~2.6°,而全周中位数 3.6°、95 分位 6.8°。
 * 「山看着又低又平」的真因在这里,不在高程场。
 * 现取 7° 宽、两处(180° 对 south/elev,216° 对 overview/se)。 */
const SADDLES = [
  { centerDeg: 182, widthDeg: 7, depth: 0.34 },
  { centerDeg: 216, widthDeg: 7, depth: 0.34 },
  { centerDeg: 310, widthDeg: 9, depth: 0.22 },
];
function saddle(a) {
  let k = 1;
  for (const s of SADDLES) {
    let d = a - (s.centerDeg * Math.PI) / 180;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const w = (s.widthDeg * Math.PI) / 180;
    k -= s.depth * Math.exp(-(d / w) * (d / w));
  }
  return Math.max(0.15, k);
}

/** 高程场:ridged 多倍频 × 径向抬升 × 山群包络 × 鞍部 */
function heightAt(x, z) {
  const r = Math.hypot(x, z);
  if (r < R0) return 0;
  const a = Math.atan2(x, z);

  // 径向:自 R0 抬起,到 R0+2600 完全成形;外缘再缓缓收一点,免得切在 R1 上
  const rise = smoothstep(R0, R0 + 2600, r) * (1 - smoothstep(R1 - 900, R1, r) * 0.55);
  // 山群:低频包络,主峰群与低丘交替
  const massif = 0.38 + 0.62 * (
    0.60 * (0.5 + 0.5 * Math.sin(1.7 * a + 2.1)) +
    0.40 * (0.5 + 0.5 * Math.sin(3.3 * a - 0.7))
  );

  // ridged 多倍频:波长 3400 / 1700 / 820 / 400 / 190 m
  let n = 0, sw = 0;
  /* ★ 原本还有一层 190 m 波长(权重 0.07)。径向网格间距在 5 km 处是 118 m,
   * 每波长只有 1.6 格 —— **低于奈奎斯特**。那一层进不了几何,只会走样成碎面。
   * 删掉它、把权重给 820/400 两层。可靠的下限是波长 ≥ 3 格 ≈ 350 m,
   * 400 m 那层(3.4 格)刚好压线保留。 */
  for (const [L, w, sd] of [[3400, 0.40, 1.7], [1700, 0.25, 5.3], [820, 0.19, 9.1], [400, 0.16, 13.7]]) {
    n += w * (1 - Math.abs(vnoise(x / L, z / L, sd) * 2 - 1));
    sw += w;
  }
  /* 幂次 1.30 → 1.55 → 1.75。最后这一档是**补偿删掉 190 m 倍频**(C-19)带来的圆化:
   * 少了一层高频,山形整体变缓,而「圆缓读作沙丘,有棱才是岩山」这条判据仍然成立。
   * 提幂次压低缓坡、抬高山脊,不引入新的频率 —— 不会重新走样。 */
  n = Math.pow(n / sw, 1.75);

  return PEAK * rise * massif * saddle(a) * n;
}

const VERT = /* glsl */`
  attribute float aRelief;     // 凹凸度:该点高于/低于邻域的程度,-1..1
  varying vec3 vN;
  varying float vDist;
  varying float vY;
  varying vec3 vW;
  varying float vRelief;
  void main() {
    vRelief = aRelief;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    vY = position.y;
    vW = position;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec3 vN;
  varying float vDist;
  varying float vY;
  varying vec3 vW;
  varying float vRelief;

  /* ★ 「远山只剩色块边界、没有坡面明暗」的三个叠加原因,实测:
   *   ① 低日头(仰角 18°)把 dot(N, sunDir) 挤在很窄的低区:
   *      5% 分位 0.000、中位 0.274、95% 分位 0.678。pow(·,0.85) 几乎不改善;
   *   ② 受光/背光两端本身只差 1.7 倍(L133 / L78);
   *   ③ 空气透视再把两端一起拉向霾色。
   *   合计:屏幕上最亮坡与最暗坡只差 8~11%,而山带只有约 60 px 高 —— 看不见。
   * 对策就是分别打这三处:重映射 Lambert、拉开两端、外加一层由高程场
   * **烘焙出来的凹凸项**(沟谷压暗、山脊提亮),后者才是"立体"的主要来源。 */
  uniform float uLamLo;        // Lambert 重映射的下端(按实测 5% 分位取)
  uniform float uLamHi;        // 上端(按 95% 分位取)
  uniform float uReliefAmt;    // 凹凸项的强度

  uniform vec3  uRockLit;      // 上部基岩·受光(灰岩:灰赭)
  uniform vec3  uRockShadow;   // 上部基岩·背光(偏冷的石青灰)
  uniform vec3  uLoessLit;     // 下部黄土·受光(赭黄)
  uniform vec3  uLoessShadow;  // 下部黄土·背光(暖褐灰)
  uniform vec3  uScrub;        // 灌丛/林斑:压暗压绿的斑块
  uniform float uScrubAmt;
  uniform vec3  uBloom;        // 山花:向阳缓坡上的成片花色(仅夏季)
  uniform float uBloomAmt;
  uniform vec3  uHaze;
  uniform vec3  uSunDir;
  uniform float uNear;
  uniform float uFar;
  uniform float uHazeMin;
  uniform float uHazeMax;
  uniform float uValleyLen;
  uniform float uValleyAmt;
  /* ── 季节积雪(由 scene/seasons 写入;非冬季 uSnowAmt = 0,整段等于不存在) ──
   * 复用已有的「高程分带 + 坡度遮罩」那套机制:雪不过是更高的一条带。
   * uSnowLine 与 uLoessTop 同一坐标系(米),阈值按**实测高程分布**取,
   * 不按语义猜:可见山体高程中位数 209 m、95 分位 435 m。 */
  uniform float uSnowLine;     // 雪线高程(米)
  uniform float uSnowAmt;      // 覆盖强度 0..1
  uniform vec3  uSnowLit;      // 雪·受光
  uniform vec3  uSnowShadow;   // 雪·背光(冷蓝灰,雪的影子从来不是灰白)

  uniform float uLoessTop;     // 黄土覆盖的上界(米)。
                               // 实测:画面窗口内高程中位数 209 m、95 分位 435 m,
                               // 上界取 430 时 94% 的可见山体都在黄土带 —— 整片沙色。
                               // 取 150 m,约三成在黄土带(沟谷与山脚),其余露灰岩。

  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h2(i), h2(i+vec2(1,0)), f.x),
               mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y);
  }

  void main() {
    // 真法线 + 低日头掠射:坡面的明暗是算出来的,不是画上去的
    float lam = max(dot(normalize(vN), normalize(uSunDir)), 0.0);
    // 把实测的 [5%, 95%] 区间铺满 0..1,而不是原样交给一个几乎不改形的 pow
    lam = smoothstep(uLamLo, uLamHi, lam);
    // 凹凸:沟谷比坡面暗、山脊比坡面亮。这一项与太阳无关,是**形体自己的**明暗,
    // 所以即使在背光侧也能把沟壑读出来 —— 低日头下它比 Lambert 更管用。
    lam = clamp(lam + vRelief * uReliefAmt, 0.0, 1.0);

    /* ── 晋北的岩土分带 ────────────────────────────────────
     * 恒山一带:下部为黄土覆盖(赭黄),上部露出灰岩基岩(偏冷的灰)。
     * 整片用一个暖沙色就成了沙丘 —— 分带是「像山西的山」与「像沙漠」的分界。
     * 分界线加噪声扰动,免得成一条等高线。 */
    /* 第二项原为 0.0135(波长 74 m),**细于网格间距**,只会变成麻点而不是地貌。
     * 波长放到 190 m(0.0053)、幅度减半。 */
    float jitter = (n2(vW.xz * 0.0032) - 0.5) * 170.0
                 + (n2(vW.xz * 0.0053) - 0.5) * 36.0;
    float band = smoothstep(uLoessTop * 0.45, uLoessTop, vY + jitter);
    // 陡坡留不住黄土:坡度越陡越早露岩
    float steep = 1.0 - clamp(vN.y, 0.0, 1.0);
    band = clamp(band + steep * 0.55, 0.0, 1.0);

    vec3 lit = mix(uLoessLit, uRockLit, band);
    vec3 shd = mix(uLoessShadow, uRockShadow, band);
    vec3 col = mix(shd, lit, lam);

    // 灌丛斑:低处与缓坡上零散的深色植被
    // 同上:0.021(48 m)远细于网格,压到 0.0090(111 m)并降权
    float sc = n2(vW.xz * 0.0068) * 0.72 + n2(vW.xz * 0.0090) * 0.28;
    sc = smoothstep(0.56, 0.80, sc) * (1.0 - band * 0.65) * clamp(vN.y, 0.0, 1.0);
    col = mix(col, uScrub, sc * uScrubAmt);

    /* ── 积雪:在空气透视**之前**混入,雪才会跟着一起入雾 ──
     * 分界同样加噪声扰动,免得雪线成一条等高线;
     * 坡度遮罩让陡崖露岩 —— 这一条不用额外做,vN.y 已经在手上。 */
    if (uSnowAmt > 0.001) {
      /* 覆盖率靠三件事一起压,不是只抬雪线:
       *   · 扰动加大(150/60 → 300/130)—— 雪线不再是一条等高线,而是斑驳的边界;
       *   · 坡度遮罩收紧(0.28~0.62 → 0.36~0.72)—— 更多陡坡露岩;
       *   · 再乘一层低频斑块噪声 —— 背风坡积、迎风坡吹蚀,同高度也该有厚有薄。
       * 只抬雪线的话,雪线以上仍然是**齐刷刷一片白**,读作雪山而不是薄雪。 */
      float sJit = (n2(vW.xz * 0.0045) - 0.5) * 300.0
                 + (n2(vW.xz * 0.0190) - 0.5) * 130.0;
      /* 「没有积雪覆盖的感觉,建模感连在一起」——
       * 根因是过渡带太宽(300 m):雪与岩之间是一长条灰过渡,
       * 读作「这块地本来就是浅色的」,而不是「上面盖了雪」。
       * 雪要读作**覆盖**,边界就得硬:收到 140 m。 */
      float snow = smoothstep(uSnowLine, uSnowLine + 140.0, vY + sJit);
      snow *= smoothstep(0.26, 0.58, vN.y);         // 陡崖挂不住雪(放宽:更多中等坡度也积雪)
      /* ★ 这个变量原名 patch —— **GLSL ES 3.0 的保留字**(细分曲面用)。
       * 用它做局部变量会让整个片元着色器编译失败,而 three.js 只把错误
       * 打到 console.error、对象静静地不绘制:画面上远山"消失",没有任何报错。
       * 排查花了两轮,期间我一直在给一个没跑起来的着色器调参数。 */
      // 斑块下限 0.28 → 0.06:有的地方是**真的没雪**,才有"覆盖"的对照
      float snowPatch = n2(vW.xz * 0.0026) * 0.65 + n2(vW.xz * 0.0062) * 0.35;
      snow *= smoothstep(0.20, 0.56, snowPatch) * 0.82 + 0.18;   // 下限 0.06→0.18:露岩的斑更少
      snow *= uSnowAmt;
      col = mix(col, mix(uSnowShadow, uSnowLit, lam), clamp(snow, 0.0, 1.0));
    }

    /* 山花烂漫(仅夏季 uBloomAmt > 0)。
     * 只落在**向阳的缓坡**上:乘 vN.y(缓)与 lam(向阳)——
     * 陡崖与背阴面不开花,这一条比花色本身更决定它像不像。
     * 波长 111 m / 294 m,都粗于网格间距,不会变成麻点(C-19 的教训)。 */
    if (uBloomAmt > 0.001) {
      float bl = n2(vW.xz * 0.0090 + 31.7) * 0.62 + n2(vW.xz * 0.0034) * 0.38;
      bl = smoothstep(0.60, 0.84, bl) * clamp(vN.y, 0.0, 1.0) * lam;
      col = mix(col, uBloom, clamp(bl * uBloomAmt, 0.0, 1.0));
    }

    // 空气透视按真实距离
    float d = smoothstep(uNear, uFar, vDist);
    float haze = mix(uHazeMin, uHazeMax, d);
    // 谷底积霾
    haze += (1.0 - haze) * uValleyAmt * (1.0 - smoothstep(0.0, uValleyLen, vY));

    col = mix(col, uHaze, clamp(haze, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** 山体植被斑的秋季基准。与 scene/seasons 的 autumn 列同源,不抄两遍。 */
export const SCRUB_BASE = { color: '#4d5347', amt: 0.34 };

export function createMountainTerrain({
  // 晋北恒山一带:下部黄土、上部灰岩。两套「受光/背光」按高程与坡度混合。
  rockLit = '#8e8878',
  rockShadow = '#474e58',
  loessLit = '#a38f66',
  loessShadow = '#585044',
  scrubColor = SCRUB_BASE.color,
  scrubAmt = SCRUB_BASE.amt,
  loessTop = 150,
  hazeColor = '#bdb4a2',
  snowLit = '#e8ecf0',
  snowShadow = '#93a2b4',
  // 空气透视:第一版 0.30~0.80,主峰在 5.8 km 处被洗到 0.56,几乎看不见。
  /* 「没有前中后的感觉」= 空气透视的**梯度**不够。
   * 上一轮为了让山重新看得见把 hazeMax 压到 0.42,近 0.08、远 0.42,
   * 跨度只有 0.34 —— 近的不够实、远的不够虚,所有山挤在同一个平面上。
   * 拉到 0.03~0.62:近山几乎不入雾(实、色重),远山过半并入霾色(虚、色淡)。 */
  hazeMin = 0.03,
  /* ★ 空气透视是「远山只剩轮廓、看不到轮廓内的内容」的直接原因。
   * 旧值 hazeMax 0.55 + valleyAmt 0.30:在 5 km、低高程处合计 0.467,
   * 8 km 处 0.64 —— 山体六成并入霾色,剩下的四成再被前面的雨雪幕削一道,
   * 坡面的明暗就只剩几个灰阶,读作一张剪影。
   * 降到 0.42 / 0.20 后,同样两处是 0.30 / 0.44,内部仍看得见沟谷与受背光。
   * 这一步部分回退了「更模糊的历史感」那一轮的浓度 —— 是刻意的取舍:
   * 山的**体积**比雾的**氛围**优先,雾在天与地那两条线上已经给足了。 */
  hazeMax = 0.62,
  valleyLen = 160,
  valleyAmt = 0.20,
} = {}) {
  const position = [], index = [];
  const radii = [];
  const k = Math.log(R1 / R0);
  for (let j = 0; j <= RAD; j++) radii.push(R0 * Math.exp(k * (j / RAD)));

  for (let j = 0; j <= RAD; j++) {
    const r = radii[j];
    for (let i = 0; i <= AZ; i++) {
      const a = (i / AZ) * Math.PI * 2;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      position.push(x, BASE_Y + heightAt(x, z), z);
    }
  }
  const stride = AZ + 1;
  for (let j = 0; j < RAD; j++) {
    for (let i = 0; i < AZ; i++) {
      const p = j * stride + i;
      index.push(p, p + stride, p + 1, p + 1, p + stride, p + stride + 1);
    }
  }

  /* 凹凸度:每个顶点相对四邻的高差,按 RELIEF_SCALE 归一后钳到 [-1, 1]。
   * 山脊为正、沟谷为负。在建构期算一次(3 万个顶点、纯算术),
   * 运行期只是读一个 float —— 而它给出的立体感是 Lambert 给不出的:
   * Lambert 只认「坡朝不朝着太阳」,凹凸认「这里是脊还是沟」,
   * 低日头下后者才是把山读成形体的主力。 */
  /* ★ 取样半径必须**大于网格间距**,否则量到的不是「脊与沟」而是网格噪声,
   * 逐顶点插值后就沿着三角形边界显形 —— 用户看到的「碎面」。
   * 半径 1 格(61~118 m)时 5~95 分位是 −21.6~+24.1 m、最大 117 m,
   * 除以 46 之后大量样本被钳到 ±1,再乘 0.38 加到 lam 上 —— 等于把走样放大。
   * 改为半径 3 格(≈180~350 m,对应真实的沟脊尺度),尺度同步放大到 150。 */
  const RELIEF_RADIUS = 3;
  const RELIEF_SCALE = 150;
  const relief = new Float32Array((AZ + 1) * (RAD + 1));
  const H = (i, j) => position[((j * (AZ + 1)) + ((i % (AZ + 1)) + AZ + 1) % (AZ + 1)) * 3 + 1];
  for (let j = 0; j <= RAD; j++) {
    for (let i = 0; i <= AZ; i++) {
      const h = H(i, j);
      const jm = Math.max(0, j - RELIEF_RADIUS), jp = Math.min(RAD, j + RELIEF_RADIUS);
      const mean = (H(i - RELIEF_RADIUS, j) + H(i + RELIEF_RADIUS, j) + H(i, jm) + H(i, jp)) * 0.25;
      relief[j * (AZ + 1) + i] = Math.max(-1, Math.min(1, (h - mean) / RELIEF_SCALE));
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(position, 3));
  geo.setAttribute('aRelief', new Float32BufferAttribute(relief, 1));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.boundingSphere = null;

  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: false,
    uniforms: {
      uRockLit: { value: new Color(rockLit) },
      uRockShadow: { value: new Color(rockShadow) },
      uLoessLit: { value: new Color(loessLit) },
      uLoessShadow: { value: new Color(loessShadow) },
      uScrub: { value: new Color(scrubColor) },
      uScrubAmt: { value: scrubAmt },
      uBloom: { value: new Color('#e8cfd6') },
      uBloomAmt: { value: 0 },
      uLoessTop: { value: loessTop },
      uHaze: { value: new Color(hazeColor) },
      uSunDir: { value: new Vector3(-0.78, 0.32, 0.57).normalize() },
      uNear: { value: R0 + 400 },
      uFar: { value: R1 },
      uHazeMin: { value: hazeMin },
      uHazeMax: { value: hazeMax },
      uValleyLen: { value: valleyLen },
      uValleyAmt: { value: valleyAmt },
      // 按实测分位取:5% 分位 0.00、95% 分位 0.68 —— 把这段铺满 0..1
      /* 0.03~0.62 是按实测 5~95 分位铺满 0..1 —— 对比是够了,但把坡与坡之间的
       * 细微差别也一起放大,叠上走样就是「建模感」。放宽到 0.0~0.72:
       * 仍比原来的 pow(·,0.85) 有力,但不再把每一片小坡都推到两端。 */
      uLamLo: { value: 0.0 },
      uLamHi: { value: 0.72 },
      uReliefAmt: { value: 0.16 },
      uSnowLine: { value: 9999 },
      uSnowAmt: { value: 0 },
      uSnowLit: { value: new Color(snowLit) },
      uSnowShadow: { value: new Color(snowShadow) },
    },
  });

  const mesh = new Mesh(geo, material);
  mesh.name = 'mountain-terrain';
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.renderOrder = -40;

  /** 逐方位的天际线仰角(参考眼高),供脊线辉光对齐 */
  function skyline(eyeRef = 45) {
    const out = new Float32Array(AZ + 1);
    for (let i = 0; i <= AZ; i++) {
      let best = -1e9;
      for (let j = 0; j <= RAD; j++) {
        const p = (j * stride + i) * 3;
        const y = position[p + 1], r = radii[j];
        const ang = Math.atan((y - eyeRef) / r);
        if (ang > best) best = ang;
      }
      out[i] = best;
    }
    return out;
  }

  return {
    mesh,
    material,
    skyline,
    azimuthSteps: AZ,
    /** 太阳方向须与 lighting 一致;着色器用视图空间,故每帧由外部转换 */
    setSunDirWorld(v, camera) {
      const d = new Vector3(v.x, v.y, v.z).normalize();
      d.transformDirection(camera.matrixWorldInverse);
      material.uniforms.uSunDir.value.copy(d);
    },
    setColors({ rockLit: rl, rockShadow: rs, loessLit: ll, loessShadow: ls, haze } = {}) {
      const u = material.uniforms;
      if (rl) u.uRockLit.value.set(rl);
      if (rs) u.uRockShadow.value.set(rs);
      if (ll) u.uLoessLit.value.set(ll);
      if (ls) u.uLoessShadow.value.set(ls);
      if (haze) u.uHaze.value.set(haze);
    },
    /** 灌丛斑:夏季最盛(绿而密)、冬季枯灰而稀 —— 山的季相主要靠这一条 + 岩土带色 */
    setScrub({ color, amt } = {}) {
      const u = material.uniforms;
      if (color) u.uScrub.value.copy(color);
      if (amt != null) u.uScrubAmt.value = amt;
    },
    /** 山花:只有夏季给量;amt = 0 时着色器整段跳过 */
    setBloom({ color, amt } = {}) {
      const u = material.uniforms;
      if (color) u.uBloom.value.copy(color);
      if (amt != null) u.uBloomAmt.value = amt;
    },
    /** 供 scene/seasons:雪线(米)与覆盖强度。amt = 0 时着色器整段跳过 */
    setSnow({ line, amt, lit, shadow } = {}) {
      const u = material.uniforms;
      if (line != null) u.uSnowLine.value = line;
      if (amt != null) u.uSnowAmt.value = amt;
      if (lit) u.uSnowLit.value.set(lit);
      if (shadow) u.uSnowShadow.value.set(shadow);
    },
    dispose() { geo.dispose(); material.dispose(); },
  };
}
