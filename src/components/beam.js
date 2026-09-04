/**
 * components/beam.js —— 梁枋层(阑额 / 普拍枋 / 乳栿 / 暗层斜撑)
 * ─────────────────────────────────────────────────────────────
 * 沿八角柱网生成水平联系构件:
 *   阑额   柱头之间的横向大枋(逐间随生起微斜,读得出「柱升」)
 *   普拍枋 阑额之上、承托斗拱的扁平枋(与阑额成 T 形断面)[法]
 *   乳栿   内外槽之间的径向联系梁(双套筒的结构表达,分解视图可见)
 *   斜撑   暗层的斜向支撑 [图]2.pdf「暗层斜撑」子图
 *
 * 断面一律取 caifen.SECTION,不出现魔法数字。
 * 要点:枋端头相交处让出微量重叠而非共面,避免 z-fighting。
 */

import { Group, Mesh, BoxGeometry, Vector3 } from 'three';
import { fen, SECTION } from '../data/caifen.js';
import { WOOD } from '../materials/wood.js';

const UP = new Vector3(0, 1, 0);

/**
 * 两点之间架一根方枋(自动对齐方向与坡度)。
 * @param a,b 端点(枋轴线两端);section {w,h} 单位:分°
 */
function beamBetween(a, b, section, material, { partKey = 'beam', level = 0, shrink = 0 } = {}) {
  const w = fen(section.w), h = fen(section.h);
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length() - shrink;
  if (len <= 0) return null;
  const mesh = new Mesh(new BoxGeometry(w, h, len), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.lookAt(b);                       // BoxGeometry 的 +Z 对齐到 b
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData = { partKey, level, type: 'beam' };
  return mesh;
}

/**
 * 任意标高的枋 / 栿环:沿柱位序列逐间架设,标高由调用方给定。
 * 用于「不在柱头、而在铺作背上」的那些环 —— 如内槽铺作所承的明栿。
 */
export function buildBeamRingAt(tops, y, {
  section = SECTION.rufu, partKey = 'mingFu', level = 0, material = WOOD.pillar,
} = {}) {
  const g = new Group();
  g.name = `beamRing_${partKey}`;
  const h = fen(section.h);
  for (let i = 0; i < tops.length; i++) {
    const a = tops[i].pos.clone().setY(y + h / 2);
    const b = tops[(i + 1) % tops.length].pos.clone().setY(y + h / 2);
    const m = beamBetween(a, b, section, material, { partKey, level, shrink: -fen(section.w) });
    if (m) g.add(m);
  }
  g.userData = { partKey, level, type: 'beamRing' };
  return g;
}

/**
 * 阑额环:沿柱头序列逐间架设(tops 已按方位角排序,首尾闭合)。
 * @param {Array} tops buildColumnRing 返回的柱头表
 * @param {object} o { section, drop, partKey, level } drop = 枋中线自柱头下沉量
 */
export function buildLintelRing(tops, {
  section = SECTION.lanE, drop = null, partKey = 'lanE', level = 0, material = WOOD.pillar,
} = {}) {
  const g = new Group();
  g.name = `lintelRing_${partKey}`;
  const h = fen(section.h);
  const dy = drop ?? h / 2;             // 缺省:枋上皮齐柱头
  for (let i = 0; i < tops.length; i++) {
    const a = tops[i].pos.clone().setY(tops[i].pos.y - dy);
    const b = tops[(i + 1) % tops.length].pos.clone();
    b.setY(b.y - dy);
    const m = beamBetween(a, b, section, material, { partKey, level });
    if (m) g.add(m);
  }
  g.userData = { partKey, level, type: 'beamRing' };
  return g;
}

/**
 * 普拍枋:八面连续的扁枋,坐阑额之上、承栌斗。
 * @param {number} cornerR 角柱环外接半径(取柱头处,已含侧脚内收)
 * @param {number} y       枋下皮标高(= 柱头标高)
 */
export function buildPupaiRing(tops, { level = 0, partKey = 'pupai', material = WOOD.pillar } = {}) {
  const g = new Group();
  g.name = 'pupaiRing';
  const s = SECTION.pupai;
  const h = fen(s.h), w = fen(s.w);
  // ★ 普拍枋**逐间架在柱头之上**,随生起起伏(第12轮修正)。
  //   旧写法是一圈平枋,标高另取放样表数字 —— 那是构件自带独立标高源:
  //   柱头一旦不在那个高度(生起 / 柱础),枋与柱就互相穿插或脱空。
  //   现在它只认「它下面那两根柱的柱头」,与柱头顶面恒为面对面接触。
  for (let i = 0; i < tops.length; i++) {
    const a = tops[i].pos.clone();
    const b = tops[(i + 1) % tops.length].pos.clone();
    a.y += h / 2; b.y += h / 2;                  // 枋下皮 = 柱头顶面
    const m = beamBetween(a, b, s, material, { partKey, level, shrink: -w });
    if (m) g.add(m);
  }
  g.userData = { partKey, level, type: 'beamRing' };
  return g;
}

/**
 * 乳栿:内槽柱头 → 外槽角柱头的径向联系梁,八向。
 * 内外槽双套筒的结构表达,结构分解视图的主要看点之一。
 */
export function buildRadialBeams(innerTops, outerTops, {
  section = SECTION.rufu, partKey = 'rufu', level = 0, y = null,
} = {}) {
  const g = new Group();
  g.name = 'radialBeams';
  const corners = outerTops.filter((t) => t.kind === 'corner');
  const h = fen(section.h);
  for (const inner of innerTops) {
    // 与该内柱方位最接近的外槽角柱
    let best = corners[0], bd = Infinity;
    for (const c of corners) {
      const d = Math.abs(Math.atan2(
        Math.sin(c.angle - inner.angle), Math.cos(c.angle - inner.angle)));
      if (d < bd) { bd = d; best = c; }
    }
    // y 给定时,梁架在该标高上(下皮 = y);否则挂柱头(上皮齐柱头)
    const a = inner.pos.clone().setY(y === null ? inner.pos.y - h / 2 : y + h / 2);
    const b = best.pos.clone().setY(y === null ? best.pos.y - h / 2 : y + h / 2);
    const m = beamBetween(a, b, section, WOOD.pillar, { partKey, level });
    if (m) g.add(m);
  }
  g.userData = { partKey, level, type: 'beamRing' };
  return g;
}

/**
 * 暗层斜撑:每面内外柱之间的交叉斜杆 [图]2.pdf。
 * 暗层是全塔的「结构腰带」——斜撑把柔性的叠柱框架变成刚性桁架层,
 * 结构分解视图中单独讲解。
 */
export function buildDiagonalBraces(tops, baseY, {
  section = { w: SECTION.braceW, h: SECTION.braceH }, level = 0, partKey = 'brace',
} = {}) {
  const g = new Group();
  g.name = 'diagBraces';
  const corners = tops.filter((t) => t.kind === 'corner');
  for (let i = 0; i < corners.length; i++) {
    const c0 = corners[i], c1 = corners[(i + 1) % corners.length];
    const foot0 = c0.pos.clone().setY(baseY);
    const foot1 = c1.pos.clone().setY(baseY);
    // 交叉斜撑:柱脚 → 邻柱柱头,两向各一
    for (const [a, b] of [[foot0, c1.pos], [foot1, c0.pos]]) {
      const m = beamBetween(a, b, section, WOOD.pillar, { partKey, level });
      if (m) g.add(m);
    }
  }
  g.userData = { partKey, level, type: 'brace' };
  return g;
}
