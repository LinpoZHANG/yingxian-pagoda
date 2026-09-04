/**
 * assembly/octagon.js —— 八角几何共享工具
 * ─────────────────────────────────────────────────────────────
 * 全项目唯一的八角平面数学来源,保证台基/柱网/屋檐/平座的
 * 八角轮廓角度对齐、朝向一致(正南为主入口面)。
 *
 * 方位约定(全项目统一):
 *   角度 θ 自「正南」起算,position = (R·sinθ, y, R·cosθ);
 *   θ=0 → +Z = 正南 = 主入口方向 [图]9.pdf 月台踏道朝南。
 *   面(face)i 的中心角 = i·45°,故 face0 正对南;
 *   角(vertex)i 的角度 = i·45° − 22.5°(= GLOBAL.octRotation)。
 *
 * radius 语义统一为「外接圆半径」(塔心→角点 / 角柱心);
 * 对边半径(边心距)= R × cos22.5°,换算在本文件完成,构件不自算。
 */

import {
  Vector2, Vector3, CylinderGeometry, BufferGeometry, Float32BufferAttribute,
} from 'three';
import { GLOBAL } from '../data/pagodaParams.js';

/** 八边形边数 */
export const OCT_N = 8;
/** 相邻两角的圆心角 */
export const OCT_STEP = (Math.PI * 2) / OCT_N;
/** 八角朝向偏转:半步 22.5°,决定「面朝南」而非「角朝南」[图]9.pdf */
export const OCT_ROT = GLOBAL.octRotation;
/** cos22.5° —— 对边径 = 对角径 × 此系数 [图]drawings-notes §2 */
export const OCT_COS = GLOBAL.cosOct;

/** 第 i 面(边)的中心方位角,face0 正南 */
export const faceAngle = (i) => i * OCT_STEP;
/** 第 i 角(顶点)的方位角 */
const vertexAngle = (i) => i * OCT_STEP - OCT_ROT;

/** 极坐标 → 场景坐标(θ 自正南顺时针) */
export function polar(angle, radius, y = 0) {
  return new Vector3(radius * Math.sin(angle), y, radius * Math.cos(angle));
}

/** 外接半径 → 边心距(对边半径) */
export const apothem = (R) => R * OCT_COS;
/** 边心距 → 外接半径 */
export const circumRadius = (a) => a / OCT_COS;
/** 单边边长(弦长) */
export const edgeLength = (R) => 2 * R * Math.sin(OCT_STEP / 2);

/**
 * 八角顶点(或边中点)序列。
 * @param {number} radius 外接圆半径
 * @param {{midEdge?:boolean, y?:number, as2D?:boolean}} opt
 *   midEdge=true 返回八条边的中点(位于边心距上)
 */
export function octagonPoints(radius, { midEdge = false, y = 0, as2D = false } = {}) {
  const out = [];
  const r = midEdge ? apothem(radius) : radius;
  for (let i = 0; i < OCT_N; i++) {
    const a = midEdge ? faceAngle(i) : vertexAngle(i);
    out.push(as2D
      ? new Vector2(r * Math.sin(a), r * Math.cos(a))
      : polar(a, r, y));
  }
  return out;
}

/**
 * 八条边的完整描述,构件沿面布置(墙、阑额、铺作朵位)统一用此。
 * @returns {{index:number, p0:Vector3, p1:Vector3, mid:Vector3,
 *            angle:number, normal:Vector3, length:number}[]}
 *   angle = 面法线方位角(即 faceAngle);normal 为水平外法线单位向量。
 */
export function octagonEdges(radius, y = 0) {
  const v = octagonPoints(radius, { y });
  const edges = [];
  for (let i = 0; i < OCT_N; i++) {
    const p0 = v[i];
    const p1 = v[(i + 1) % OCT_N];
    const a = faceAngle(i);
    edges.push({
      index: i,
      p0, p1,
      mid: polar(a, apothem(radius), y),
      angle: a,
      normal: new Vector3(Math.sin(a), 0, Math.cos(a)),
      length: p0.distanceTo(p1),
    });
  }
  return edges;
}

/**
 * 求「位于第 i 面上、到塔心距离恰为 targetR」的两个对称点的面内偏移。
 * ★ 平柱定位专用:CAD 量得的平柱环半径(COLUMN_RINGS.outerFlat)与
 *   角柱环半径(outerCorner)共同决定平柱在面上的位置,不另设间广数据
 *   ——「当心间宽于次间」的实际比例由这两个实测半径反解得出。
 * @param {number} cornerR 该环角柱外接半径
 * @param {number} flatR   该环平柱到塔心距离
 * @returns {number} 面内偏移量(米),两平柱位于 ±offset
 */
export function faceOffsetForRadius(cornerR, flatR) {
  const a = apothem(cornerR);
  const d2 = flatR * flatR - a * a;
  // 量图误差导致 flatR < 边心距时退化为面中点(不抛错,几何仍闭合)
  return d2 > 0 ? Math.sqrt(d2) : 0;
}

/**
 * 一环柱位序列:8 角柱 + 每面 2 平柱(共 24 柱,每面 3 间)。
 * [图]各层平面柱圆检测:外槽 24 柱制式全塔一致(drawings-notes §2)。
 * @returns {{pos:Vector3, angle:number, kind:'corner'|'flat',
 *            face:number, bay:'dangxin'|'cijian'}[]}
 *   angle = 该柱所在方位角(角柱取角平分线,平柱取所属面法线),
 *   供柱侧脚倾斜方向与铺作朝向使用。
 */
export function ringPositions(cornerR, flatR, y = 0) {
  const out = [];
  const off = flatR ? faceOffsetForRadius(cornerR, flatR) : 0;
  for (let i = 0; i < OCT_N; i++) {
    const va = vertexAngle(i);
    out.push({ pos: polar(va, cornerR, y), angle: va, kind: 'corner', face: i, bay: 'corner' });
    if (!flatR) continue;
    const fa = faceAngle(i);
    const mid = polar(fa, apothem(cornerR), y);
    // 面内切向(沿边方向)
    const tan = new Vector3(Math.cos(fa), 0, -Math.sin(fa));
    for (const s of [-1, 1]) {
      out.push({
        pos: mid.clone().addScaledVector(tan, s * off),
        angle: fa, kind: 'flat', face: i, bay: 'cijian',
      });
    }
  }
  return out;
}

/**
 * 八角闭合轮廓 Shape 用点串(带可选圆角化步进),供台基/平座板挤出。
 * segments>1 时在每条边上插值,便于生成收分曲面的环。
 */
export function octagonLoop(radius, segments = 1, y = 0) {
  const v = octagonPoints(radius, { y });
  if (segments <= 1) return v;
  const out = [];
  for (let i = 0; i < OCT_N; i++) {
    const p0 = v[i], p1 = v[(i + 1) % OCT_N];
    for (let s = 0; s < segments; s++) out.push(p0.clone().lerp(p1, s / segments));
  }
  return out;
}

/* ── 八角体几何工具 ────────────────────────────────────────── */

/** 索引几何 → 非索引 + 重算法线,得到棱角分明的平面着色(八角面不圆滑) */
function faceted(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

/**
 * 八角棱柱/棱台。半径语义 = 外接半径,已对齐全局朝向(面朝南)。
 * @param {number} rBottom 下口外接半径
 * @param {number} rTop    上口外接半径(可 0 → 八角锥)
 * @param {number} h       高
 */
export function octagonPrism(rBottom, rTop, h, { open = false, flat = true } = {}) {
  const g = new CylinderGeometry(rTop, rBottom, h, OCT_N, 1, open);
  g.rotateY(-OCT_ROT);   // 令顶点落在 ±22.5°,即「面」正对南
  return flat ? faceted(g) : g;
}

/**
 * 八角**环板**:外接半径 rOuter 的八角,中间挖掉外接半径 rInner 的八角。
 * 上下面 + 内外两圈侧壁,共 8×4 个四边形;非索引,平面着色。
 *
 * 为什么需要它:楼板不都是满铺的。一层佛堂的上空是**通高**的 ——
 * 内槽梁圈出的那一块没有天花板,不然十一米的大佛就顶着一张盖子
 * (第35轮用户圈出)。满铺的八角实心板画不出这件事。
 *
 * @param {number} rOuter 外缘外接半径
 * @param {number} rInner 洞口外接半径(必须 < rOuter)
 * @param {number} h      板厚(几何以 y=0 为板心)
 */
export function octagonRing(rOuter, rInner, h) {
  const so = octagonPoints(rOuter), si = octagonPoints(rInner);
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const at = (p, y) => new Vector3(p.x, y, p.z);
  const yT = h / 2, yB = -h / 2;
  for (let i = 0; i < OCT_N; i++) {
    const j = (i + 1) % OCT_N;
    const o0 = so[i], o1 = so[j], i0 = si[i], i1 = si[j];
    // 顶面(法线 +Y):外→内
    tri(at(o0, yT), at(o1, yT), at(i1, yT));
    tri(at(o0, yT), at(i1, yT), at(i0, yT));
    // 底面(法线 −Y):绕向反过来
    tri(at(o0, yB), at(i0, yB), at(i1, yB));
    tri(at(o0, yB), at(i1, yB), at(o1, yB));
    // 外侧壁
    tri(at(o0, yB), at(o1, yB), at(o1, yT));
    tri(at(o0, yB), at(o1, yT), at(o0, yT));
    // 内侧壁(朝洞口内,绕向反过来)
    tri(at(i0, yB), at(i0, yT), at(i1, yT));
    tri(at(i0, yB), at(i1, yT), at(i1, yB));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
