/**
 * materials/textures.js —— 程序化纹理工具(Canvas 生成)
 * ─────────────────────────────────────────────────────────────
 * 全部贴图由代码生成,项目不使用任何外部图片资产。
 * 约定:尺寸 ≤1024;生成一次全局缓存。
 *
 * ★ 平铺:`makeNoise` **并不真的平铺**。它的格表按 256 取模,而 `noise(u*8)`
 *   在 u:0→1 上只走 8 格,走不到回绕点 —— 实测左右两列色差 41.2,
 *   而相邻两列只有 0.21。瓦面/石作/地面看不出来,是因为它们贴在平面上、
 *   接缝落在构件边线或视野之外。**贴到回转体(车削件的 u 绕一圈闭合)上就是
 *   一条竖直实缝**。需要真平铺时用下面的 `makeTileNoise`(按本次频率取模)。
 *
 * 导出:woodGrainTexture / tileTexture / plasterTexture / stoneTexture /
 *      ironTexture / paperNoise —— 均返回 { map, normalMap?, roughnessMap?, metalnessMap? }
 */

import {
  CanvasTexture, RepeatWrapping, SRGBColorSpace, LinearSRGBColorSpace,
} from 'three';

const CACHE = new Map();
const cached = (key, make) => (CACHE.has(key) ? CACHE.get(key) : (CACHE.set(key, make()), CACHE.get(key)));

/* ── 可平铺值噪声(环面取样,保证左右上下无缝)────────────────── */
function makeNoise(seed = 1) {
  const N = 256;
  const g = new Float32Array(N * N);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const at = (x, y) => g[((y & (N - 1)) * N) + (x & (N - 1))];
  const smooth = (t) => t * t * (3 - 2 * t);
  return function noise(x, y) {           // x,y 以格为单位,自动循环
    const xi = Math.floor(x), yi = Math.floor(y);
    const tx = smooth(x - xi), ty = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}
/** 分形叠加:freq 为基频(须为整数才能平铺) */
function fbm(noise, x, y, freq, octaves = 4, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * f, y * f);
    norm += amp; amp *= gain; f *= 2;
  }
  return sum / norm;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, ctx: c.getContext('2d', { willReadFrequently: true }) };
}

function toTexture(c, { srgb = true, repeat = 1 } = {}) {
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

/** 由高度场生成切线空间法线图(Sobel 差分) */
function normalFromHeight(height, size, strength = 2.0) {
  const { c, ctx } = canvas(size);
  const img = ctx.createImageData(size, size);
  const H = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

/** 单通道灰度图 → 纹理(粗糙度/AO 用,线性空间) */
function grayTexture(data, size) {
  const { c, ctx } = canvas(size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(0, Math.min(255, data[i] * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

/* ══════════════ 木纹 ══════════════
 * 年轮拉丝:沿 U 方向的低频扰动 + 沿 V 的高频细纹 + 稀疏节疤。
 * hue/sat/light 让柱枋(暗红褐)与斗拱(稍浅)共用一套生成逻辑。 */
/**
 * @param {number} mottle 色斑强度(0 = 关,与旧行为逐位一致)。
 *   年轮走的是 `shade` —— 三通道同乘,只出**明暗**;木料上另有一种起伏是**色相**的:
 *   同一根料受晒受潮不均,一片偏暖留住油色、一片返灰褪净。明暗轴表达不了它,
 *   在细料(棂条、望柱)上尤其明显 —— 那些构件截面小、年轮几乎看不见,
 *   能读出「这是木头」的恰恰是这层色斑。
 *   故单开一路:只动 R 与 B 的平衡,不动明度,不会把年轮糊掉。
 */
export function woodGrainTexture({
  seed = 3, base = [0.30, 0.14, 0.10], contrast = 0.34, mottle = 0, size = 512,
} = {}) {
  return cached(`wood_${seed}_${base.join(',')}_${contrast}_${mottle}`, () => {
    const noise = makeNoise(seed);
    const { c, ctx } = canvas(size);
    const img = ctx.createImageData(size, size);
    const rough = new Float32Array(size * size);
    const height = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        // 年轮:沿 v(木材长向)拉长的条纹,被低频噪声弯曲
        // 第33轮:年轮频率 9→3.5、弯曲 4→1.6、细纹与节疤压到近乎不可见。
        // 原参数在斗栱这类小构件上(UV 按面归一化)会挤成密集折线,近景一片花,
        // 用户反映「看得眼花,影响细节检查」。木纹是**质感**不是**图案** ——
        // 它该在近景才隐约看得出,不该在中景就抢构件轮廓。
        const warp = fbm(noise, u, v, 2, 3) * 0.55 + fbm(noise, u, v, 7, 2) * 0.10;
        const rings = Math.abs(Math.sin((u * 3.5 + warp * 1.6) * Math.PI));
        const fine = fbm(noise, u, v, 48, 2) * 0.06;           // 细导管纹
        let g = rings * 0.55 + fine + fbm(noise, u, v, 4, 3) * 0.3;
        // 节疤:稀疏圆斑
        const kn = fbm(noise, u, v, 3, 1);
        if (kn > 0.92) g += (kn - 0.92) * 1.4;
        g = Math.max(0, Math.min(1, g));
        const shade = 1 - contrast * 0.5 + g * contrast;
        // 色斑:粗斑打底 + 细斑点缀,合成 −1..1。两个尺度叠加才「细腻」——
        // 只用粗的会读成脏印子,只用细的会读成噪点。
        const mot = mottle === 0 ? 0
          : ((fbm(noise, u, v, 3, 3) - 0.5) * 0.62
            + (fbm(noise, u * 1.7, v * 0.8, 9, 2) - 0.5) * 0.38) * 2 * mottle;
        const i = (y * size + x) * 4;
        img.data[i]     = Math.min(255, base[0] * shade * (1 + mot * 0.55) * 255 * 1.72);
        img.data[i + 1] = Math.min(255, base[1] * shade * (1 - mot * 0.10) * 255 * 1.78);
        img.data[i + 2] = Math.min(255, base[2] * shade * (1 - mot * 0.60) * 255 * 1.86);
        img.data[i + 3] = 255;
        height[y * size + x] = g;
        rough[y * size + x] = 0.70 + g * 0.10;                 // 沟纹处略粗糙
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: toTexture(c),
      normalMap: normalFromHeight(height, size, 0.45),
      roughnessMap: grayTexture(rough, size),
    };
  });
}

/* ══════════════ 筒板瓦垄 ══════════════
 * U 方向一个循环 = 一垄(板瓦凹面 + 筒瓦凸脊);V 方向为瓦片搭接节奏。
 * 法线图承担绝大部分瓦垄立体感,几何只做少量真实起伏(性能)。 */
export function tileTexture({ size = 512, ridges = 6 } = {}) {
  return cached(`tile_${ridges}`, () => {
    const noise = makeNoise(11);
    const { c, ctx } = canvas(size);
    const img = ctx.createImageData(size, size);
    const height = new Float32Array(size * size);
    const rough = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * ridges;         // 垄坐标
        const f = u - Math.floor(u);           // 垄内 0..1
        // 前 62% 板瓦(浅凹),后 38% 筒瓦(半圆凸)
        let h;
        if (f < 0.62) h = 0.30 - Math.cos((f / 0.62) * Math.PI * 2) * 0.06;
        else h = 0.30 + Math.sin(((f - 0.62) / 0.38) * Math.PI) * 0.70;
        // 瓦片搭接横缝
        const lap = (y / size) * 7;
        const seam = Math.abs(lap - Math.round(lap)) < 0.035 ? -0.14 : 0;
        h += seam;
        const grit = fbm(noise, x / size, y / size, 24, 3) * 0.05;
        const wear = fbm(noise, x / size, y / size, 3, 3);
        // 青灰瓦:凸脊受光偏亮、凹处积垢偏暗
        const l = 0.34 + h * 0.20 + grit + (wear - 0.5) * 0.10 + (seam ? -0.05 : 0);
        const i = (y * size + x) * 4;
        img.data[i]     = Math.min(255, l * 245);
        img.data[i + 1] = Math.min(255, l * 252);
        img.data[i + 2] = Math.min(255, l * 258);
        img.data[i + 3] = 255;
        height[y * size + x] = h + grit * 0.4;
        rough[y * size + x] = 0.74 - h * 0.16 + (wear - 0.5) * 0.10;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: toTexture(c),
      normalMap: normalFromHeight(height, size, 3.4),
      roughnessMap: grayTexture(rough, size),
    };
  });
}

/* ══════════════ 抹灰墙 ══════════════ */
export function plasterTexture({ size = 512 } = {}) {
  return cached('plaster', () => {
    const noise = makeNoise(23);
    const { c, ctx } = canvas(size);
    const img = ctx.createImageData(size, size);
    const height = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const g = fbm(noise, u, v, 6, 4) * 0.6 + fbm(noise, u, v, 40, 2) * 0.4;
        const streak = fbm(noise, u, v * 0.25, 5, 3);          // 雨痕竖向拉长
        const l = 0.80 + (g - 0.5) * 0.14 - Math.max(0, streak - 0.62) * 0.35;
        const i = (y * size + x) * 4;
        img.data[i]     = l * 232;
        img.data[i + 1] = l * 225;
        img.data[i + 2] = l * 210;
        img.data[i + 3] = 255;
        height[y * size + x] = g;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { map: toTexture(c), normalMap: normalFromHeight(height, size, 0.7) };
  });
}

/* ══════════════ 石作(台基)══════════════ */
export function stoneTexture({ size = 512 } = {}) {
  return cached('stone', () => {
    const noise = makeNoise(41);
    const { c, ctx } = canvas(size);
    const img = ctx.createImageData(size, size);
    const height = new Float32Array(size * size);
    const rough = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const g = fbm(noise, u, v, 8, 4);
        const pit = fbm(noise, u, v, 32, 3);                   // 风化麻点
        const l = 0.72 + (g - 0.5) * 0.22 - Math.max(0, pit - 0.66) * 0.5;
        const i = (y * size + x) * 4;
        img.data[i]     = l * 208;
        img.data[i + 1] = l * 200;
        img.data[i + 2] = l * 186;
        img.data[i + 3] = 255;
        height[y * size + x] = g * 0.6 + pit * 0.4;
        rough[y * size + x] = 0.80 + (g - 0.5) * 0.12;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: toTexture(c),
      normalMap: normalFromHeight(height, size, 1.6),
      roughnessMap: grayTexture(rough, size),
    };
  });
}

/* ══════════════ 地面颗粒(黄土)══════════════ */
export function paperNoise({ size = 512, base = [0.52, 0.44, 0.33] } = {}) {
  return cached(`ground_${base.join(',')}`, () => {
    const noise = makeNoise(67);
    const { c, ctx } = canvas(size);
    const img = ctx.createImageData(size, size);
    const height = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const g = fbm(noise, u, v, 5, 4) * 0.65 + fbm(noise, u, v, 36, 2) * 0.35;
        const l = 0.86 + (g - 0.5) * 0.30;
        const i = (y * size + x) * 4;
        img.data[i]     = Math.min(255, base[0] * l * 255 * 1.35);
        img.data[i + 1] = Math.min(255, base[1] * l * 255 * 1.35);
        img.data[i + 2] = Math.min(255, base[2] * l * 255 * 1.35);
        img.data[i + 3] = 255;
        height[y * size + x] = g;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { map: toTexture(c), normalMap: normalFromHeight(height, size, 0.8) };
  });
}

/* ══════════════ 锻铁 / 铁锈(塔刹、铁链)══════════════
 *
 * 塔刹此前挂的是一份**没有任何贴图**的 MeshStandardMaterial
 * (纯色 0x453f37 + 金属度 0.68 铺满全件)。资料明确禁的正是这个结果:
 *   「铁制构件…黑褐、暗红棕锈、少量冷灰反光 / **不应使用木材或纯黑塑料材质**」
 *     —— reference/FacadeHistory/README.md 表:塔刹、铁链
 * 一件通体等金属度、等粗糙度的回转体,在日照下只得到一条环向高光带、其余全暗;
 * 「黑塑料」是**参数均质**造成的,与颜色调得多准无关。
 *
 * ★ 这张图真正在做的事,是把**金属度做成空间变量**。
 *   锈(Fe₂O₃·nH₂O)是氧化物、**不是金属**:有完整漫反射,没有金属反光。
 *   故锈斑 metalness→0.03 / roughness→0.94,裸铁 metalness 0.78 / roughness 0.34:
 *     · 六成面积是**有漫反射的暗红棕锈** → 相轮的道数、覆钵的曲面读得出来,
 *       不再退成剪影;
 *     · 少数未锈处才给锐高光,而它的反照率取**冷灰**(122,127,134)——
 *       金属的 albedo 就是它的 F0(高光颜色),这是「少量冷灰反光」唯一的落点。
 *   两件事在一张 metalnessMap 里同时成立,单靠调 color 一件也做不到。
 *
 * ★ 场景**没有 envMap**(`scene.environment` 未设,全靠解析光源)。
 *   金属在无 IBL 时只剩直射高光,metalness 每高一分就丢一分漫反射。
 *   故裸铁不能铺满 —— 锈的覆盖率不只是写实,更是**这件东西亮度的来源**。
 *   日后若接环境贴图,可抬 RUST.edge 的下界来减锈、增金属。
 *
 * ★ 两条踩出来的教训(第64轮,初稿实测):
 *   1. **既有的 makeNoise 并不平铺**,尽管文件头这么写着。它的格表按 256 取模,
 *      而 `noise(u*8)` 在 u:0→1 上只走 8 格、根本走不到 256 那个回绕点。
 *      实测左右两列色差 41.2,而相邻两列只有 0.21 —— 200 倍,是一道**实缝**。
 *      瓦面石作看不出来是因为它们贴在平面上、缝落在构件边线上;车削件的 u
 *      绕一圈闭合,缝会变成一条挂在相轮上的竖线。故这里另起 `makeTileNoise`,
 *      把格点索引按**当前频率**取模,f 与 2f 都真正回绕。
 *   2. **fbm 的输出向 0.5 收敛**,直接送进 smoothstep 得到的是一片中间值 ——
 *      初稿金属度分布 22/31/28/18/0(%),没有一端占优,等于把「锈壳」与「裸铁」
 *      调和成了一种中庸表面,恰恰**回到均质**。要两种表面并存,阈值前必须先
 *      把 r 拉开对比度(CONTRAST),让分布压到两端。
 *
 * 走向:v 是车削件的**高度方向**,故流锈在 u 上取高频、v 上取低频 ——
 * 出来是自上而下的锈痕,与雨水在铸件上的走向一致。
 */

/** 真正可平铺的值噪声:格点索引按**本次调用的频率**取模,f 与 2f 都回绕 */
function makeTileNoise(seed = 1) {
  const N = 256;
  const g = new Float32Array(N * N);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const smooth = (t) => t * t * (3 - 2 * t);
  /** @param {number} u,v ∈[0,1) @param {number} fx,fy 格数(整数,≤256) */
  return function tn(u, v, fx, fy = fx) {
    const X = Math.min(fx, N), Y = Math.min(fy, N);
    const x = u * X, y = v * Y;
    const xi = Math.floor(x), yi = Math.floor(y);
    const tx = smooth(x - xi), ty = smooth(y - yi);
    const at = (a, b) => g[(((b % Y) + Y) % Y) * N + (((a % X) + X) % X)];
    const p = at(xi, yi), q = at(xi + 1, yi), r = at(xi, yi + 1), w = at(xi + 1, yi + 1);
    return (p + (q - p) * tx) * (1 - ty) + (r + (w - r) * tx) * ty;
  };
}

/** 平铺 fbm(频率逐层加倍,每层各自回绕) */
function tfbm(tn, u, v, f, octaves = 4, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, ff = f;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tn(u, v, ff);
    norm += amp; amp *= gain; ff *= 2;
  }
  return sum / norm;
}

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const sstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** [估/表现] 锈的几个可调常量 —— 改塔刹的观感先动这里,不要动材质端的标量 */
const RUST = {
  /**
   * fbm 收敛于 0.5,不拉开对比度就得不到「锈 / 裸铁」两种面。
   * 2.6 实测:锈 63.4% / 裸铁 23.9% / 过渡带仅 11% —— 两端占优,才叫两种表面。
   */
  contrast: 2.6,
  /** 锈壳的判定带:窄 → 锈缘锐利(像剥落的壳);宽 → 过渡糊,回到均质 */
  edge: [0.34, 0.58],
  /**
   * 「少量」冷灰反光的稀疏度。初值 [0.56,0.86] 实测只覆盖裸铁的 4.9%
   * (全图 0.6%)—— 等于没有:高光仍旧全是暗暖色,「冷灰反光」读不出来。
   * 放到 [0.44,0.78] 后覆盖裸铁 18.2%、占全图 4.4%:看得见,又确实是「少量」。
   * ★ 判据是**占裸铁的比例**,不是占全图 —— 冷灰只可能出现在没锈的地方,
   *   拿全图当分母会把「锈太多」误读成「反光太少」。
   */
  polish: [0.44, 0.78],
  /**
   * 四个反照率。**全部按逐通道反推定值,不要照着「锈是什么颜色」直接填。**
   *
   * 初稿填的是眼睛认可的锈色(deep 92,44,28 / lite 140,78,47,材质端 B/R≈0.31),
   * 出图实测却是 **S 0.822、L 0.122**,而同一帧里中性青灰的瓦面只有 S 0.346 ——
   * 塔刹成了天上一团橙红的余烬。
   *
   * 用同帧的瓦面当**光探针**反推(TILE 反照率 154,162,166,材质端线性 B/R 1.18;
   * 出图 45.4/22.3,线性 B/R 0.216)得这一刻的光比 **B/R ≈ 0.183** ——
   * 夕照把蓝分量压到不足两成。于是材质端 B/R 0.31 落到画面上只剩 0.07。
   *   > 暖光下,**材质端的蓝要按光比的倒数预付**,否则进不到画面里。
   * 按目标出图 B/R≈0.30 反推,材质端须给到 0.62 上下 —— 这个数在色卡上
   * 看着已经是「灰褐」而不是「锈红」了,但那正是它在夕照里变成锈红的前提。
   *
   * ★ 第二轮出图:S 0.839→0.655、H 9.1°→15.9°(火橙 → 暗红棕,对了),
   *   但 **L 反而从 0.130 掉到 0.120** —— 提 B/G 的同时把 R 也压了,
   *   等于顺手把整件调暗。第三轮按同比例整体抬亮约三成,只动明度不动比例。
   *   > **色相与明度要分两步走**:一步里同时改两者,出图只会告诉你「变了」,
   *   > 不会告诉你是哪一项在起作用。
   */
  base: [84, 80, 75],    // 黑褐:锻铁本体(同时是它的高光色),近中性
  cool: [150, 157, 166], // 冷灰:未锈、被雨水磨亮处
  deep: [104, 78, 70],   // 暗红棕:厚锈壳
  lite: [150, 116, 102], // 浮锈:新翻的锈面,偏橙
  /**
   * 裸铁的金属度。初稿 0.78 —— 无 envMap 时金属丢掉同比例的漫反射,
   * 出图实测覆钵与相轮上 **L<0.10 的像素占 43–49%**:那些不是「暗铁」,
   * 是**黑洞**,正好撞上资料禁的「纯黑塑料」。
   * 压到 0.50 保住一半漫反射,高光仍在(粗糙度 0.40 仍远低于锈壳的 0.94)。
   */
  metal: 0.50,
  /** 裸铁粗糙度 → 锈壳粗糙度。两端拉得开,才是两种表面 */
  rough: [0.40, 0.94],
};

export function ironTexture({ size = 512 } = {}) {
  return cached('iron', () => {
    const na = makeTileNoise(103);
    const nb = makeTileNoise(211);
    const { c, ctx } = canvas(size);
    const img = ctx.createImageData(size, size);
    const height = new Float32Array(size * size);
    const rough = new Float32Array(size * size);
    const metal = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const patch = tfbm(na, u, v, 4, 4);                             // 大块锈斑
        const streak = na(u, v, 24, 3) * 0.62 + na(u, v, 48, 6) * 0.38; // 竖向流锈
        // 先拉对比度,再判阈值 —— 顺序反了就得到一片中庸的灰
        const r = clamp01((patch * 0.56 + streak * 0.44 - 0.5) * RUST.contrast + 0.5);
        const k = sstep(RUST.edge[0], RUST.edge[1], r);                 // 锈覆盖
        const grain = tfbm(nb, u, v, 32, 2);                            // 锈壳颗粒 + 铸面砂眼

        // 「少量」= 磨亮斑本身稀疏 × 只落在裸铁上
        const cool = sstep(RUST.polish[0], RUST.polish[1], tfbm(nb, u, v, 8, 3)) * (1 - k);
        const wet = sstep(0.55, 1.00, r);                               // 厚锈 → 浮锈

        const i = (y * size + x) * 4;
        const shade = 0.88 + grain * 0.24;
        for (let ch = 0; ch < 3; ch++) {
          const met = RUST.base[ch] + (RUST.cool[ch] - RUST.base[ch]) * cool;
          const rst = RUST.deep[ch] + (RUST.lite[ch] - RUST.deep[ch]) * wet;
          img.data[i + ch] = Math.min(255, (met + (rst - met) * k) * shade);
        }
        img.data[i + 3] = 255;

        height[y * size + x] = r * 0.72 + grain * 0.28;   // 锈是鼓起的壳,不是凹坑
        rough[y * size + x] = RUST.rough[0] + (RUST.rough[1] - RUST.rough[0]) * k
          + (grain - 0.5) * 0.10;
        metal[y * size + x] = RUST.metal * (1 - k) + 0.03 * k;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: toTexture(c),
      normalMap: normalFromHeight(height, size, 1.4),
      roughnessMap: grayTexture(rough, size),
      metalnessMap: grayTexture(metal, size),
    };
  });
}
