/**
 * components/roofframe.js —— 攒尖屋架(顶层屋顶之下的支撑结构)
 * ─────────────────────────────────────────────────────────────
 * 第五层的内槽铺作顶(49.03)到攒尖顶(55.98)之间,原本有 **6.95 m 的竖向空档**:
 * 除了一层瓦皮和望板,什么结构都没有 —— 六米多高的攒尖顶悬在空中,靠自己立着。
 * 用户第45轮指出:「高耸的屋顶必须要内部结构支撑」。
 *
 * 版17 p89 断面图上,这一段画得很满,构造逻辑是**叠梁**:
 *   内槽铺作 → 蜀柱 → 一层横梁(梁背贴望板底、梁端承椽)
 *            → 再一层蜀柱 → 更高更内的一层横梁 …… 层层收进
 *            → 最上一层托起塔刹的砖座。
 * 中央另有刹柱贯穿,两侧的椽斜搭在各层梁端上。
 *
 * 本文件按这个逻辑生成:N 层**八角梁环** + 层间**蜀柱**,
 * 半径自内槽递减到刹座,每层的**梁背贴着望板底**(留一个椽径的余量)——
 * 「贴着屋面」不是装饰,那正是它承托屋面的方式。
 */

import { Group, Mesh, BoxGeometry } from 'three';
import { fen, SECTION } from '../data/caifen.js';
import { ROOF } from '../data/pagodaParams.js';
import { OCT_N, OCT_COS, octagonPoints } from '../assembly/octagon.js';
import { roofYAtRadius } from './roof.js';
import { WOOD } from '../materials/wood.js';

/** 一圈八角梁:八根方料首尾相接,梁心在半径 R 的八角上 */
export function beamRing(R, yCenter, w, h, partKey, level) {
  const g = new Group();
  const pts = octagonPoints(R, { y: yCenter });
  for (let i = 0; i < OCT_N; i++) {
    const a = pts[i], b = pts[(i + 1) % OCT_N];
    const len = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const m = new Mesh(new BoxGeometry(len + w * 0.6, h, w), WOOD.pillar);
    m.position.copy(mid);
    m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    m.castShadow = m.receiveShadow = true;
    m.userData = { partKey, level, type: 'frame' };
    g.add(m);
  }
  return g;
}

/**
 * @param {object} P    顶层屋面参数(plan.js 的 roof 项)—— 净空由它查
 * @param {object} o    { level, innerR, innerTop, shajiR, shajiY }
 *   innerTop 内槽铺作顶(明栿下皮)= 屋架的起点
 *   shajiR/shajiY 砖石刹座的外接半径与底标高 = 屋架的终点
 */
export function buildApexFrame(P, { level = 5, innerR, innerTop, shajiR, shajiY }) {
  const g = new Group();
  g.name = `apexFrame_L${level}`;
  const bw = fen(SECTION.caofu.w), bh = fen(SECTION.caofu.h);
  const zhuW = fen(SECTION.columnDia) * 0.62;      // 蜀柱径,取柱径的六成
  const dChuan = fen(SECTION.chuanDia);

  /** 该半径处梁背的上限:望板下皮再让一个椽径 —— 椽正是搭在这上头的 */
  const backAt = (R) => roofYAtRadius(P, Math.min(P.eaveR, R / OCT_COS))
    - ROOF.thickness - dChuan;

  const N = 5;
  const rEnd = shajiR + 0.75;                      // 最上一层稍大于刹座,好托住它
  const rings = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const R = innerR + (rEnd - innerR) * t;
    // 梁背贴望板底;但不得低于起点,也不得高于刹座底(最上一层要托刹)
    const top = Math.min(backAt(R), shajiY + bh);
    rings.push({ R, top, bot: top - bh });
  }

  let prev = null;
  for (const [i, r] of rings.entries()) {
    g.add(beamRing(r.R, r.bot + bh / 2, bw, bh, 'caofu', level));
    // 蜀柱:自下一层的梁背(或内槽铺作顶)立到本层梁底
    const from = prev ? prev.top : innerTop;
    const h = r.bot - from;
    if (h > 0.05) {
      const pts = octagonPoints(r.R, { y: 0 });
      for (let k = 0; k < OCT_N; k++) {
        const p = pts[k];
        const m = new Mesh(new BoxGeometry(zhuW, h, zhuW), WOOD.pillar);
        m.position.set(p.x, from + h / 2, p.z);
        m.rotation.y = Math.atan2(p.x, p.z);
        m.castShadow = m.receiveShadow = true;
        m.userData = { partKey: 'shuZhu', level, type: 'frame' };
        g.add(m);
      }
    }
    prev = r;
  }

  // 承刹:最上一层梁环之上,八根短柱托到砖座底
  const last = rings[rings.length - 1];
  const hCha = shajiY - last.top;
  if (hCha > 0.05) {
    const pts = octagonPoints(shajiR * 0.86, { y: 0 });
    for (let k = 0; k < OCT_N; k++) {
      const p = pts[k];
      const m = new Mesh(new BoxGeometry(zhuW, hCha, zhuW), WOOD.pillar);
      m.position.set(p.x, last.top + hCha / 2, p.z);
      m.rotation.y = Math.atan2(p.x, p.z);
      m.castShadow = m.receiveShadow = true;
      m.userData = { partKey: 'chaZhu', level, type: 'frame' };
      g.add(m);
    }
  }

  g.userData = { partKey: 'apexFrame', level, type: 'frame' };
  return g;
}


/**
 * ★ 这里曾经有过一个 `buildEaveBackFang()`(承椽枋),**已撤**。
 *
 * 起因是我的第一版承托探针在**恒定半径**的圆上采样,而屋面上口是**八角** ——
 * 面心方位的半径只有 R·cos22.5,采样点落在屋面之外,自然打空。
 * 探针据此报 L3/L4「上口 8/16 悬空」,我就加了一圈枋去接。
 *
 * 探针按八角线改正后复测:**五层全部 0/16**,而且把新加的枋关掉仍然全绿 ——
 * 屋面内端本来就由**暗层斜撑 + 乳栿**承托了一整圈。那一圈枋修的是个不存在的缺陷。
 *
 * 版16 p88「第一至四層平坐斷面」也是这么画的:明层屋面的内端搭在上层暗层上,
 * 不另起塔架。**顶层攒尖是例外** —— 它的上口在塔心、无上层可搭,故有 `buildApexFrame`。
 *
 * 记档(与 joints.js 的「给完全埋没发容差 = 把缺陷写进标准」同源):
 * **不该存在的构件不该存在。** 判据误报时,先查判据,别急着加件去满足它。
 */
