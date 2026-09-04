/**
 * materials/tile.js —— 瓦面 / 石作 / 墙面 / 铁作 材质
 * ─────────────────────────────────────────────────────────────
 *   TILE    青灰筒板瓦(法线瓦垄;夜景反射月光的主要载体)
 *   STONE   台基石作(浅暖灰,风化噪点)
 *   PLASTER 抹灰墙(暖白偏灰)
 *   IRON    塔刹铁件(黑褐锻铁 + 暗红棕锈,金属度逐点变化)
 */

import { MeshStandardMaterial, Vector2, Color } from 'three';
import { tileTexture, stoneTexture, plasterTexture, ironTexture } from './textures.js';

const tile = tileTexture();
export const TILE = new MeshStandardMaterial({
  map: tile.map, normalMap: tile.normalMap, roughnessMap: tile.roughnessMap,
  color: new Color(0x9aa2a6),
  roughness: 0.72, metalness: 0.04,
  normalScale: new Vector2(1.25, 1.25),
});

/**
 * 垂脊 / 博脊:几何上与屋面**共面**(垂脊「压住两面接缝」、博脊压屋面与柱身交接)。
 * 共面且都不带偏移时,谁压住谁由 three 的不透明排序决定 —— 而排序键含材质创建顺序,
 * 材质创建顺序又取决于模块求值顺序:**删一行 import 就能让这场 z-fighting 翻面**
 * (2026-09-03 第17轮清理时实测到:同一场 z-fighting 会随模块求值顺序翻面。)
 * 用 polygonOffset 把脊确定性地拉向相机一侧,让「压住接缝」成为约束而不是巧合。
 */
/**
 * 脊饰陶(戗兽 / 脊头)—— **不带瓦垄纹理**的深陶色。
 * 戗兽此前直接用 TILE,竖向瓦垄条纹让它读作一块灰板;兽是模制陶件,不是瓦。
 * 阶段三材质精修时按实物照片再调,此处为占位。
 */
export const TERRACOTTA = new MeshStandardMaterial({
  /**
   * ★ 第49轮由深褐 `0x4a4038` 改**灰陶** `0x5c6163`。
   *   用户报「屋檐角的木头露出来了」—— 那不是木头,是**套兽**:
   *   深褐色在檐下暗光里与木构一个色系,读成一根伸出瓦面的木料。
   *   实物脊饰与瓦同窑同料,是**灰陶**,只比瓦面深一档、更哑。
   *   「像木头」不是形状问题,是**它本来就不该是褐色的**。
   */
  color: 0x5c6163, roughness: 0.88, metalness: 0.0,
});

/**
 * 瓦当 / 滴水 —— 檐口那一排**白**的。
 * 实景照上它是全塔最显眼的一条亮线:瓦头经石灰勾抹,与深灰瓦面对比强烈。
 * 用 TILE 的深灰会让檐口整条消失 —— 那正是此前的样子。
 */
export const TILE_END = new MeshStandardMaterial({
  /**
   * 第49轮由灰白 `0xd6d3ca` 三步压到 `0x8d9496`。
   * 瓦面 TILE 的基色是 `0x9aa2a6` —— 瓦头**比它还暗一点**,是有意的:
   * 瓦当朝外朝上、正对天光,而瓦面在自身的阴影里;
   * albedo 取到相等,渲染出来瓦头仍会亮一大截。
   * **要让两者「看起来」接近,albedo 就得反着压。**
   * 粗糙度也抬到 0.94(瓦面 0.72),把瓦头上那道高光去掉。
   */
  color: new Color(0x6e7679), roughness: 0.94, metalness: 0.0,
});

export const TILE_RIDGE = TILE.clone();
TILE_RIDGE.polygonOffset = true;
TILE_RIDGE.polygonOffsetFactor = -2;
TILE_RIDGE.polygonOffsetUnits = -2;

const stone = stoneTexture();
export const STONE = new MeshStandardMaterial({
  map: stone.map, normalMap: stone.normalMap, roughnessMap: stone.roughnessMap,
  color: new Color(0xb9b2a4),
  roughness: 0.92, metalness: 0.0,
  normalScale: new Vector2(0.8, 0.8),
});
/** 台阶/月台顶面等需要与立面区分的深一档石色 */
export const STONE_DARK = STONE.clone();
STONE_DARK.color = new Color(0x9d968a);

const plaster = plasterTexture();
export const PLASTER = new MeshStandardMaterial({
  map: plaster.map, normalMap: plaster.normalMap,
  color: new Color(0xd8d0bd),
  roughness: 0.95, metalness: 0.0,
  normalScale: new Vector2(0.45, 0.45),
});

/** 首层厚砖墙 [图]9.pdf —— 比抹灰更暗更粗 */
export const BRICK = PLASTER.clone();
BRICK.color = new Color(0xa39a8b);
BRICK.roughness = 0.98;

/**
 * 塔刹与铁刹链的锻铁。
 *
 * 旧值是一份**裸材质**:纯色 0x453f37 + 全件等金属度 0.68、等粗糙度 0.48,
 * 没有 map / normalMap / roughnessMap。等参数的回转体在日照下只有一条环向
 * 高光带,别处全暗 —— 读作黑塑料,正是资料点名要避开的:
 *   「铁制构件…黑褐、暗红棕锈、少量冷灰反光 / 不应使用木材或纯黑塑料材质」
 *
 * 改法不在颜色,在**让金属度成为空间变量** —— 锈是氧化物、不是金属,
 * 有漫反射而无金属反光。生成逻辑与理由见 textures.js:ironTexture。
 *
 * ★ 三个标量都取 1.0:粗糙度与金属度**全部交给贴图**,color 亦不再染色
 *   (色相已烘进 map)。这与 TILE / STONE「标量兜底 × 贴图微调」的写法相反 ——
 *   那两者要的是整体均质、局部起伏;铁件要的恰是**两种截然不同的表面**
 *   (锈壳 0.94/0.03 与裸铁 0.34/0.78)在同一件上并存,标量再乘一道只会把
 *   两端一起压向中间,差别就没了。调色请改 ironTexture 的四个常量。
 */
const iron = ironTexture();
export const IRON = new MeshStandardMaterial({
  map: iron.map, normalMap: iron.normalMap,
  roughnessMap: iron.roughnessMap, metalnessMap: iron.metalnessMap,
  color: new Color(0xffffff),
  roughness: 1.0, metalness: 1.0,
  normalScale: new Vector2(0.7, 0.7),
});

/** 供 scene/seasons/createBuildingSnow 登记(只读清单,不改任何参数) */
export const TILE_ALL = [TILE, TILE_RIDGE, TILE_END, TERRACOTTA, STONE, STONE_DARK, PLASTER, BRICK, IRON];
const ALL = TILE_ALL;

export function setTileFade(alpha) {
  for (const m of ALL) {
    m.transparent = alpha < 0.999;
    m.opacity = alpha;
    m.depthWrite = alpha > 0.6;
    m.needsUpdate = true;
  }
}

/** 纹理重复密度换算:按构件实际尺寸(米)设置 repeat,保持物理尺度一致 */
export function scaleUV(material, uMeters, vMeters, texelPerMeter = 0.5) {
  const m = material.clone();
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
    if (!m[key]) continue;
    m[key] = m[key].clone();
    m[key].needsUpdate = true;
    m[key].repeat.set(uMeters * texelPerMeter, vMeters * texelPerMeter);
  }
  return m;
}
