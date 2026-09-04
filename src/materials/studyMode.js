/**
 * materials/studyMode.js —— 构造读图模式的材质切换
 * ─────────────────────────────────────────────────────────────
 * 交付态的材质是为「历史氛围」调的:低对比、低饱和、木纹柔和(第33轮)。
 * 这套调子对**看氛围**是对的,对**看构造**是灾难 ——
 * 木纹把构件轮廓吞掉,同色同材的斗与栱糊成一团(用户第35轮:「粘连在一起」)。
 *
 * 这里不改交付态,而是给同一批材质加一个**可切回的第二副面孔**:
 *   · 摘掉贴图(map / normalMap / roughnessMap)—— 体块归体块,纹理不参与判读;
 *   · 打开 flatShading —— 方料的每个面拿到一个常数明度,棱自然显形;
 *   · 按构件族给互不相同的**平色**,颜色本身就是分类信息;
 *   · 粗糙度拉高、金属度归零 —— 去掉高光,免得亮斑冒充棱线。
 * 配合 scene/lighting 的 setStudy(强直射 + 压天光)与 scene/edgeOverlay 的棱线,
 * 三件一起开,才是一张「能数出跳数」的图。
 *
 * 原值存在各材质的 userData 里,切回时逐字段还原 —— 不重建材质,
 * 因为材质是全塔共享的单例,重建等于要求所有网格重新绑定。
 */

import { WOOD } from './wood.js';
import {
  TILE, TILE_RIDGE, TILE_END, TERRACOTTA, STONE, STONE_DARK, PLASTER, BRICK, IRON,
} from './tile.js';

/** 读图态的族色:同族一色,异族拉开明度,不追求写实 */
const STUDY_COLOR = new Map([
  [WOOD.pillar,  0x8a6552],   // 柱枋:最暗一档,做背景
  [WOOD.bracket, 0xc09a7c],   // 斗栱:最亮一档 —— 判读的主角
  [WOOD.trim,    0xa07a60],
  [WOOD.rafter,  0x94705a],
  [WOOD.plank,   0xb08a70],
  [TILE,         0x6a727a],
  [TILE_RIDGE,   0x59616a],
  [TILE_END,     0xc9c6bd],
  [TERRACOTTA,   0x62676a],
  [STONE,        0xada699],
  [STONE_DARK,   0x958e82],
  [PLASTER,      0xe2dbcb],
  [BRICK,        0xb0a696],
  [IRON,         0x5a544c],
]);

const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
let on = false;

/**
 * 登记一份**族外**材质的读图色。
 *
 * 上表是全塔共享材质的名册,但有的子系统自带独占克隆件(如古今立面的夹泥墙、
 * 墙内斜撑与今貌版壁 —— 它们要能单独调不透明度做年代过渡,不能共用单例)。
 * 不登记的话,按 L 进读图态时整塔归平色、独独这几片仍是交付态贴图,
 * 在一张「数跳数」的图里格外扎眼。故给子系统一个登记口,而不是把它们的
 * 材质硬写进上表 —— 名册留给 materials/,子系统各报各的族色。
 */
export function registerStudyMaterial(material, color) {
  if (!material || STUDY_COLOR.has(material)) return;
  STUDY_COLOR.set(material, color);
  if (!on) return;
  // 已在读图态里登记的,立刻补做一次切换,否则要等下次开关才跟上
  if (!material.userData.__deliver) {
    const keep = { color: material.color.getHex(), roughness: material.roughness,
      metalness: material.metalness, flatShading: material.flatShading };
    for (const k of MAPS) keep[k] = material[k] ?? null;
    material.userData.__deliver = keep;
  }
  for (const k of MAPS) material[k] = null;
  material.color.setHex(color);
  material.roughness = 0.92;
  material.metalness = 0.0;
  material.flatShading = true;
  material.needsUpdate = true;
}

/** @param {boolean} enabled */
export function setStudyMaterials(enabled) {
  if (enabled === on) return;
  on = enabled;
  for (const [m, color] of STUDY_COLOR) {
    if (enabled) {
      if (!m.userData.__deliver) {
        const keep = { color: m.color.getHex(), roughness: m.roughness,
          metalness: m.metalness, flatShading: m.flatShading };
        for (const k of MAPS) keep[k] = m[k] ?? null;
        m.userData.__deliver = keep;
      }
      for (const k of MAPS) m[k] = null;
      m.color.setHex(color);
      m.roughness = 0.92;
      m.metalness = 0.0;
      m.flatShading = true;
    } else {
      const d = m.userData.__deliver;
      if (!d) continue;
      for (const k of MAPS) m[k] = d[k];
      m.color.setHex(d.color);
      m.roughness = d.roughness;
      m.metalness = d.metalness;
      m.flatShading = d.flatShading;
    }
    m.needsUpdate = true;
  }
}

export function isStudyMaterials() { return on; }
