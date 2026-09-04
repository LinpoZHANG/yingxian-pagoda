/**
 * materials/wood.js —— 木构材质族
 * ─────────────────────────────────────────────────────────────
 * 基于 textures.woodGrainTexture 的全塔木材质:
 *   pillar  柱/枋 —— 深朱(千年氧化的暗红褐,非鲜红)
 *   bracket 斗拱  —— 稍浅木色,与柱枋拉开层次(呼应彩画残留)
 *   trim    门窗/勾阑 —— 中间调
 * 昼夜不改颜色,明暗统一交给 scene/lighting。
 */

import { MeshStandardMaterial, Vector2, Color } from 'three';
import { woodGrainTexture } from './textures.js';

/**
 * 木纹贴图的重复取 1:斗栱等挤出构件的 UV 本就以米为单位,
 * 一米一个纹理循环恰好合真实木纹尺度;方料(Box)按面归一化,
 * 长材上会略有拉伸,远景不可辨,不为此另做一套 UV。
 */
function woodMat({ base, contrast, seed, roughness, color = 0xffffff, vertexColors = false }) {
  const { map, normalMap, roughnessMap } = woodGrainTexture({ base, contrast, seed });
  return new MeshStandardMaterial({
    map, normalMap, roughnessMap,
    color: new Color(color),
    roughness, metalness: 0.0,
    normalScale: new Vector2(0.6, 0.6),
    vertexColors,
  });
}

export const WOOD = {
  /**
   * 第33轮全族重调:**降饱和、降对比、降凹凸**。
   * 用户反映近景「木纹眼花,影响细节检查」,同时早前以实照指出塔身偏鲜红。
   * 两条指向同一处:红分量过强 + 年轮对比过高。现按实照的千年氧化色重定 ——
   * 红仍在,但绿蓝各提一档,整体落到**灰调暗褐**;对比统一压到 0.07~0.10,
   * 法线强度 1.1→0.45。构件轮廓因此从纹理里跳出来,近景才隐约见木纹。
   * 阶段三上 env map 后再按实照精修,此处是可检查的中间态。
   */
  /**
   * 柱、阑额、普拍枋、梁栿 —— 千年氧化的灰调暗褐。
   *
   * 第41轮再降一档饱和(用户以实照裁定「整个建筑像红木了,木头颜色应偏原色」)。
   * 量 `reference/FacadeHistory/images/2025_current_exterior.JPG`:今天的立面木构
   * 一律是 **H 13–28°、S 0.11–0.19** 的灰褐,受光处甚至泛银 —— 是裸露的旧木,
   * 不是红木家具。第33轮已降过一次(那次针对的是**对比**与木纹噪点),
   * 这次针对的是**红分量**。
   *
   * ★ 定值必须**逐通道反推**,不能按材质端的 S 定。第一次只把 base 的 S 自 0.27
   *   压到 0.18,出图的 S 却只从 0.33 动到 0.32 —— 场景是暖色阳光,蓝分量在光源端
   *   本就被压着,材质端加的那点蓝进不到画面里。故按「出图目标 → 除以各通道的
   *   光照系数 → 材质端取值」反推:R 431、G 401、B 340(自上一版实测反解)。
   *   现值出图 S 约 0.24,与实照的 0.11–0.19 仍有一档差,那是全场景色彩分级的事。
   *
   * 这也正是资料包 §2 与 §6.5 的两条禁令:「不应统一成鲜红色或黄色原木」、
   * 「不要给整塔施加一套统一红色材质」。红留给一层墙的朱红油饰去担。
   */
  pillar:  woodMat({ base: [0.216, 0.184, 0.170], contrast: 0.10, seed: 3, roughness: 0.84, color: 0xf2ece8 }),
  /**
   * 斗、栱、昂、耍头。
   * 第36轮:对比 0.07 → 0.15,并开 **vertexColors** ——
   * 一朵铺作是一件合并几何,构件族的明暗差由 `bracket/assemble.js:PART_TONE`
   * 烘在顶点里(斗亮、栱中、昂与枋暗),这是把「端面 vs 顺纹」的真实材面差
   * 写进模型,同时也是唯一不加绘制批次的分层办法。
   * 第33轮把对比压到 0.07 是为了消近景摩尔纹,但它同时也消掉了构件的可读性 ——
   * 摩尔纹的病根是**年轮频率**(已 9→3.5),不是对比,不该拿对比去抵。
   */
  bracket: woodMat({
    base: [0.250, 0.213, 0.198], contrast: 0.15, seed: 8,
    roughness: 0.80, color: 0xf4efeb, vertexColors: true,
  }),
  /** 门窗框、直棂、勾阑 —— 中间调 */
  trim:    woodMat({ base: [0.234, 0.198, 0.183], contrast: 0.08, seed: 15, roughness: 0.78, color: 0xf3edea }),
  /** 椽、飞子(檐下密集小构件,对比最低以免摩尔纹) */
  rafter:  woodMat({ base: [0.212, 0.180, 0.166], contrast: 0.06, seed: 21, roughness: 0.86 }),
  /** 版壁横板 —— 比柱枋淡一档、更哑 */
  plank:   woodMat({ base: [0.244, 0.208, 0.193], contrast: 0.08, seed: 34, roughness: 0.88, color: 0xf1ebe6 }),
};

/** 供 scene/seasons/createBuildingSnow 登记(只读清单,不改任何参数) */
export const WOOD_ALL = Object.values(WOOD);
const ALL = WOOD_ALL;

/** 供 explode.focus 整体降透明度(统一入口,避免逐 mesh 改材质) */
export function setWoodFade(alpha) {
  for (const m of ALL) {
    m.transparent = alpha < 0.999;
    m.opacity = alpha;
    m.depthWrite = alpha > 0.6;
    m.needsUpdate = true;
  }
}
