/**
 * materials/bracketTone.js —— 铺作的逐朵色差
 * ─────────────────────────────────────────────────────────────
 * 全塔五百余朵铺作共用一份 `WOOD.bracket`,于是整条铺作带是**同一个色号**。
 * 一朵之内已有层次(斗亮、栱中、昂暗,由 `bracket/assemble.js:PART_TONE`
 * 烘在顶点里),但**朵与朵之间**没有差别 —— 一圈四十八朵齐刷刷一个色,
 * 远看是一条均匀的带子,近看像同一个模型复制了四百遍,不像木作。
 *
 * 实物上朵与朵本来就不一样,来源有两条:
 *   1. **用料与修缮年份不同** —— 千年间历代补配,新老构件混杂(资料包 §7:
 *      「现存每根木构件的确切年代待专项检测」)。这条走一个逐朵的定值抖动。
 *   2. **朝向不同** —— 资料包 §2 记斗栱「檐下偏暗,端部及**朝阳面褪色**」。
 *      南面终日受晒,油色褪得快、返灰;北面终年背阴,留住油色,偏暗偏红。
 *      这条按面序的余弦给,南(面0)最褪、北(面4)最深。
 *
 * ★ 走 `InstancedMesh.setColorAt` 的**逐实例色**,不拆材质也不拆网格。
 *   逐朵换材质要把四百八十朵拆成四百八十次绘制;逐实例色与材质色、顶点色
 *   三者相乘,不加一次绘制,也不动任何几何。
 *
 * ★ 幅度压在 ±4.5% [估/表现]:目的是让"一片"读成"许多朵",
 *   不是做斑马纹。超过一成就会看出是随机噪声,而不是材料差异。
 *
 * ★ 本模块是**后处理**:自 pagoda.root 上认铺作、写实例色,不改 assembly/。
 *   铺作的朵位、等级、几何仍全部由 buildStorey.placeBrackets 决定。
 */

import { Color, Vector3, Matrix4 } from 'three';
import { OCT_STEP } from '../assembly/octagon.js';

/**
 * [估] 逐朵的两条轴。
 *
 * 走到现在改了三版,前两版各错在一处:
 *
 * 1. 只做**明度**一条轴(三通道同加一个 j)。实测相邻两朵明度差 2.40%、
 *    色调差只有 0.37% —— 四百八十朵仍是同一个木色,只在明暗上抖了抖。
 *    而真实的新老木料差的主要是**色调**:油色尚存的偏暖偏红,风化久的返灰发白。
 * 2. 补上色调轴,同时按**朵型**给了系统偏置(转角风化最重、补间最轻)。
 *    道理是对的,做出来却是灾难:**每一面的朵型序列完全一样**
 *    (转角·补间·柱头·补间·柱头·补间·转角),于是八个面、十二圈重复同一段节奏,
 *    实测它解释掉 22% 的色调方差 —— 用户一眼看出「整体出现材质颜色规律」。
 *
 * 现在两条轴都由**空间斑块噪声 + 逐朵抖动**合成,朵型偏置全部去掉:
 *   斑块(0.62) —— 真实的补配是**成片**换的,一次工程换掉一段檐,
 *                 相邻几朵常出自同一批料。这一项让色差有「片」的形状,
 *                 而不是逐朵互不相干的椒盐噪点。
 *   抖动(0.38) —— 同一批料里每根仍有差别,不至于整片死平。
 *
 * ★ 凡「按构件类型给系统偏置」都要先问一句:这个类型在立面上是不是**周期出现**的。
 *   是的话,再有道理的偏置也会读成花纹。
 */
const LIGHT = 0.072;
const WEATHER = 0.064;
/** 斑块与逐朵的配比。
 *  斑块占太多则相邻几乎同色(局部对比又没了),太少则退回椒盐噪点 ——
 *  0.55 是「看得出成片、又看得出片内每根不同」的分界。 */
const PATCH = 0.55;
/** [估] 斑块尺度(m):水平约两三朵宽,竖向不到一层 —— 一次修缮够得着的范围 */
const PATCH_XZ = 4.5;
const PATCH_Y = 4.0;

/**
 * [估/照] 朝阳面褪色:南北之间的差。褪色 = 提亮 + 去红(G/B 提得比 R 多)。
 * 资料包 §2「端部及朝阳面褪色」,道理成立,故保留 —— 但**压到原值的 55%**。
 *
 * ★ 第54轮实测:原幅度下,单是这一条就解释掉全塔铺作 **24.5% 的明度方差**、
 *   15.9% 的色调方差 —— 比朵型偏置那条(已删)还重。
 *   它确实是平缓梯度不是周期花纹,但它在**每一圈原样重复同一条南亮北暗**,
 *   十一圈叠起来照样读成规则。
 *   **判据是它解释掉多少方差,不是它长什么形状** —— 一条道理成立的规则,
 *   只要在画面上重复够多次、占的份额够大,就会从「真实」变成「图案」。
 *   压到 55% 后落在 8% 上下:朝向仍读得出,不再主导画面。
 */
const SUN = { r: 0.0055, g: 0.011, b: 0.013 };

/** 32 位雪崩混合(murmur3 finalizer)。
 *  ★ 必须用它而不是「各乘大质数再异或」:弱混合的低位会原样透到取值上,
 *    表现就是规则的条纹 —— 版壁逐块选色时踩过一次(见 adjustments.md H-17)。*/
function mix32(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** 由 (层·面·朵型·序号) 定值的 −1..1 抖动 —— 不用随机数:
 *  一朵铺作的新旧是它自己的属性,不该每次刷新换一张脸。
 *  `salt` 用来取**互相独立**的第二条轴:同一朵的明暗与风化不该同涨同落。
 *  ★ 不再吃 kindCode —— 朵型在立面上是周期出现的,拿它当输入就是在造花纹。 */
function jitter(level, face, index, salt = 0) {
  let h = mix32(level + 0x5bf0 + salt);
  h = mix32(h ^ face);
  h = mix32(h ^ index);
  return (h / 0xffffffff) * 2 - 1;
}

/** 格点哈希 → 0..1 */
function lattice(i, j, k, seed) {
  let h = mix32(Math.imul(i, 374761393) + seed);
  h = mix32(h ^ Math.imul(j, 668265263));
  h = mix32(h ^ Math.imul(k, 1442695041));
  return h / 0xffffffff;
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * 三维值噪声,返回 −1..1。用它而不是几条正弦叠加:
 * 正弦在圆环上必然生出周期,而这里要躲的正是周期。
 */
function vnoise(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
  const c00 = lerp(lattice(xi, yi, zi, seed), lattice(xi + 1, yi, zi, seed), u);
  const c10 = lerp(lattice(xi, yi + 1, zi, seed), lattice(xi + 1, yi + 1, zi, seed), u);
  const c01 = lerp(lattice(xi, yi, zi + 1, seed), lattice(xi + 1, yi, zi + 1, seed), u);
  const c11 = lerp(lattice(xi, yi + 1, zi + 1, seed), lattice(xi + 1, yi + 1, zi + 1, seed), u);
  return lerp(lerp(c00, c10, v), lerp(c01, c11, v), w) * 2 - 1;
}

/** 斑块 + 逐朵,合成一条轴的 −1..1 */
function axis(pos, level, face, index, seed) {
  const patch = vnoise(pos.x / PATCH_XZ, pos.y / PATCH_Y, pos.z / PATCH_XZ, seed);
  const grain = jitter(level, face, index, seed);
  return patch * PATCH + grain * (1 - PATCH);
}

const tmp = new Color();
const tmpPos = new Vector3();
const tmpMat = new Matrix4();

/**
 * 给一株塔上的所有铺作写入逐朵色差。
 * @param {Object3D} root 塔体根节点(pagoda.root)
 * @returns {number} 着色的朵数,供自检
 */
export function applyBracketTones(root) {
  let count = 0;
  root.updateMatrixWorld(true);      // 斑块按世界坐标采样,先把矩阵结算出来
  root.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const metas = o.userData?.instances;
    if (o.userData?.partKey !== 'bracketSet' || !metas) return;

    for (let i = 0; i < o.count; i++) {
      const m = metas[i] ?? {};
      const face = m.face ?? 0;
      const lvl = m.level ?? 0;
      // 这一朵的世界坐标 —— 斑块噪声按位置采样,故必须用世界系,
      // 否则各层的实例坐标各自从零起算,层与层会采到同一片斑块。
      o.getMatrixAt(i, tmpMat);
      tmpPos.setFromMatrixPosition(tmpMat).applyMatrix4(o.matrixWorld);
      // 面序 0 = 正南;cos 为 +1 时最晒,−1 时终年背阴
      const sun = Math.cos(face * OCT_STEP);
      const light = axis(tmpPos, lvl, face, i, 0) * LIGHT;
      // 风化轴:正 = 返灰,负 = 油色尚存
      const weather = axis(tmpPos, lvl, face, i, 0x9e3779b9) * WEATHER;
      tmp.setRGB(
        1 + SUN.r * sun + light - weather * 0.55,
        1 + SUN.g * sun + light + weather * 0.30,
        1 + SUN.b * sun + light + weather * 0.55,
      );
      o.setColorAt(i, tmp);
      count++;
    }
    o.instanceColor.needsUpdate = true;
    // 逐朵色是这朵的**基色**;拾取高亮会在它之上再乘一道,
    // 撤销时须还原到这里写下的值,而不是白色(见 interaction/picking.js)。
  });
  return count;
}
