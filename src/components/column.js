/**
 * components/column.js —— 立柱(含侧脚与生起)
 * ─────────────────────────────────────────────────────────────
 * 生成单层柱网:外槽 24 柱(8 角 + 每面 2 平柱,每面 3 间)/ 内槽 8 柱,
 * 双套筒制式全塔贯通 [图]drawings-notes §2。实现两项宋式标志做法:
 *   侧脚 —— 柱脚外、柱头内的微倾(角柱双向,八角塔即径向内倾)[法]千分之九
 *   生起 —— 自当心间向角柱逐柱升高 [法];本塔每面 3 间,
 *           平柱升 1/2 生起量、角柱升满,由柱位序号推出,不另设数
 * 柱头卷杀以 Lathe 轮廓表达(收分 + 头部圆和)。
 *
 * 性能:同环同规格柱用 InstancedMesh;柱础一并生成。
 * 扩展:deform 通道预留(二层倾斜现状切换 DEFORM)。
 */

import {
  Group, InstancedMesh, LatheGeometry, Vector2, Vector3, Object3D,
} from 'three';
import { SECTION, fen } from '../data/caifen.js';
import { SIDE_FOOT, SHENG_QI } from '../data/pagodaParams.js';
import { ringPositions } from '../assembly/octagon.js';
import { WOOD } from '../materials/wood.js';
import { STONE_DARK } from '../materials/tile.js';

const LATHE_SEG = 12;

/** 柱身轮廓:柱脚径 → 柱头卷杀收分,高度归一化 0..1(实例按 scale.y 拉伸) */
function columnProfile(baseR) {
  const topR = baseR * (1 - SECTION.columnBatter);
  const pts = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // 梭柱微腹:中段略鼓;柱头卷杀收头。两者比例均取自 caifen.SECTION [法]
    const belly = Math.sin(t * Math.PI) * SECTION.columnEntasis;
    let r = baseR + (topR - baseR) * t + baseR * belly;
    const cut = SECTION.columnHeadCut;
    if (t > cut.start) r *= 1 - ((t - cut.start) / (1 - cut.start)) * cut.depth;
    pts.push(new Vector2(Math.max(r, 1e-3), t));
  }
  pts.unshift(new Vector2(0, 0));
  pts.push(new Vector2(0, 1));
  return new LatheGeometry(pts, LATHE_SEG);
}

/** 柱础(覆盆石):归一化高度 0..1 */
function plinthGeometry(dia, h) {
  const r = dia / 2;
  const pts = [
    new Vector2(0, 0), new Vector2(r, 0), new Vector2(r, h * 0.45),
    new Vector2(r * 0.86, h * 0.82), new Vector2(r * 0.62, h),
    new Vector2(0, h),
  ];
  return new LatheGeometry(pts, LATHE_SEG);
}

/**
 * 生成一环柱。
 *
 * ★ 竖向由 **topY(放样表柱头标高)** 驱动,不由「柱高」驱动(第12轮修正)。
 *   旧写法 `height = columnTop − baseY` + 内部 `footY = baseY + 柱础高`,
 *   把柱础高(0.136)与生起(0.06)双双叠到了放样表标高**之上**:
 *   柱头因此高出放样表 0.166~0.196 m,直接戳穿普拍枋(仅高 0.170)扎进栌斗,
 *   阑额上皮也随之钻进普拍枋 —— 即用户圈出的那两处枋、额、斗互相穿插。
 *   现改为:**放样表标高 = 角柱柱头顶面**,生起自此**向下**给出(角柱最高),
 *   故没有任何柱能高过放样表。见 docs/joint-semantics.md。
 *
 * @param {object} o
 *   o.cornerR 角柱环外接半径;o.flatR 平柱到心距离(null → 只做 8 柱内槽环)
 *   o.baseY 柱脚标高;o.topY 角柱柱头顶面标高(放样表唯一权威)
 *   o.dia 柱径(米,缺省取 SECTION.columnDia)
 *   o.sideFoot / o.shengqi 覆写(暗层柱可关闭)
 *   o.plinth 是否生成柱础;o.partKey 语义键
 * @returns {{group:Group, tops:Array, feet:Array, dia:number, baseY:number}}
 *   tops = 柱头中心(已含侧脚位移与生起),供梁枋与铺作定位;
 *   feet = 柱脚中心(在环上),供墙身与门窗分间。
 */
export function buildColumnRing({
  cornerR, flatR = null, baseY, topY,
  dia = fen(SECTION.columnDia),
  sideFoot = SIDE_FOOT, shengqi = SHENG_QI,
  plinth = true, partKey = 'column', level = 0, ringName = '',
}) {
  const group = new Group();
  group.name = `columnRing_${ringName}`;
  const slots = ringPositions(cornerR, flatR, 0);

  const geo = columnProfile(dia / 2);
  const mesh = new InstancedMesh(geo, WOOD.pillar, slots.length);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData = { partKey, level, type: 'column' };

  const plinthH = fen(SECTION.plinthH);
  const pGeo = plinth ? plinthGeometry(fen(SECTION.plinthDia), plinthH) : null;
  const pMesh = plinth ? new InstancedMesh(pGeo, STONE_DARK, slots.length) : null;
  if (pMesh) { pMesh.castShadow = pMesh.receiveShadow = true; pMesh.userData = { partKey: 'plinth', level }; }

  const dummy = new Object3D();
  const tops = [];
  const feet = [];
  const instMeta = [];

  slots.forEach((s, i) => {
    // 生起:角柱最高(= 放样表标高),两平柱同高、低一个全额生起。
    // [法]三间之面:当心间柱不生起,至角随间数生起 —— 故当心间是**水平**的,
    // 生起全发生在次间。自基准**向下**给,保证「柱头 ≤ 放样表标高」恒成立。
    const rise = s.kind === 'corner' ? 0 : -shengqi;
    const footY = baseY + (plinth ? plinthH : 0);
    const h = topY + rise - footY;
    // 侧脚:柱头较柱脚径向内收 sideFoot × 柱高
    const lean = sideFoot * h;
    const radial = new Vector3(Math.sin(s.angle), 0, Math.cos(s.angle));

    dummy.position.copy(s.pos).setY(footY);
    // 柱脚在环上,柱轴向内倾 lean/h(弧度近似)
    const axis = new Vector3().crossVectors(new Vector3(0, 1, 0), radial).normalize();
    dummy.quaternion.setFromAxisAngle(axis, -Math.atan(lean / h));
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    if (pMesh) {
      dummy.position.copy(s.pos).setY(baseY);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pMesh.setMatrixAt(i, dummy.matrix);
    }

    tops.push({
      pos: s.pos.clone().addScaledVector(radial, -lean).setY(footY + h),
      angle: s.angle, kind: s.kind, face: s.face, height: h, index: i,
    });
    feet.push({
      pos: s.pos.clone().setY(footY),
      angle: s.angle, kind: s.kind, face: s.face, index: i,
    });
    instMeta.push({ partKey, kind: s.kind, face: s.face, level });
  });

  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.instances = instMeta;      // InstancedMesh 拾取用 instanceId → 语义
  group.add(mesh);
  if (pMesh) { pMesh.instanceMatrix.needsUpdate = true; group.add(pMesh); }

  group.userData = { partKey, level, type: 'columnRing' };
  return { group, tops, feet, dia, baseY };
}
