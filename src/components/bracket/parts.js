/**
 * components/bracket/parts.js —— 斗拱基础词汇(最小构件集)
 * ─────────────────────────────────────────────────────────────
 * 文法引擎的「词汇表」。全部尺寸取自 data/caifen.js 的材分制,
 * 本文件不出现任何绝对尺寸。
 *
 * 几何约定(文法层依赖,勿改):
 *   · 原点 = 受力接触面中心(构件底面中心),便于逐层叠放;
 *   · 长向 = X 轴(栱长 / 昂长 / 耍头长);厚向 = Z;高 = +Y;
 *   · 华栱、昂、耍头等出跳构件由文法层绕 Y 轴旋转到出跳方向。
 *
 * LOD:detail 'far' | 'near' 两档,远景省去卷杀分瓣与斗欹斜面。
 */

import {
  BoxGeometry, CylinderGeometry, ExtrudeGeometry, Shape,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  fen, PART, CAI, ZUCAI, DOU, JUANSHA, ANG, SHUATOU, TUOFENG, ANZHI_H,
} from '../../data/caifen.js';

const cache = new Map();
const memo = (key, make) => (cache.has(key) ? cache.get(key) : (cache.set(key, make()), cache.get(key)));

/**
 * 统一几何形制:一律转为非索引、只保留 position/normal/uv。
 * 文法层要把「斗(挤压/棱台)」与「栱(挤出侧样)」合并成一朵,
 * 属性集必须一致,否则 mergeGeometries 拒绝合并。
 */
function unify(g, userData) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) {
    if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  out.userData = userData;
  return out;
}

/** 把 2D 侧样(XY 平面)挤出成构件:厚度沿 Z 居中 */
function extrudeProfile(points, thickness, { bevel = 0 } = {}) {
  const shape = new Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: bevel > 0,
    bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1,
  });
  g.translate(0, 0, -thickness / 2);
  return g;
}

/* ══════════════ 斗 ══════════════
 * 斗身自下而上:斗底(欹的下口)→ 斗欹(斜收)→ 斗平 → 斗耳(开口卡栱)。
 * 斗耳按「是否十字开口」分两类:栌斗/交互斗开十字,散斗/齐心斗开单向。 */
export function makeDou(type = 'sanDou', { detail = 'near' } = {}) {
  return memo(`dou_${type}_${detail}`, () => {
    const spec = PART[type];
    const w = fen(spec.w);                       // 斗「长」(面宽向)
    const d = fen(DOU.depth[type] ?? spec.w);    // 斗「广」(进深向)
    const h = fen(spec.h);
    const hQi = h * DOU.profile.qi;
    const hPing = h * DOU.profile.ping;
    const hEr = h * DOU.profile.er;
    const b = DOU.bottomRatio;
    const parts = [];

    // 斗欹:四棱台(下小上大)。远景档退化为方块。
    if (detail === 'near') {
      const qi = new CylinderGeometry(1, 1, hQi, 4);
      qi.rotateY(Math.PI / 4);                   // 棱对齐轴向 → 方形断面
      qi.scale(w / 2 * Math.SQRT2, 1, d / 2 * Math.SQRT2);
      // 上下口分别缩放:CylinderGeometry 无法直接非均匀,故按顶点 y 手动收分
      const pos = qi.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const k = y < 0 ? b : 1;
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
      }
      qi.computeVertexNormals();
      qi.translate(0, hQi / 2, 0);
      parts.push(qi);
    } else {
      const qi = new BoxGeometry(w * (1 + b) / 2, hQi, d * (1 + b) / 2);
      qi.translate(0, hQi / 2, 0);
      parts.push(qi);
    }

    // 斗平
    const ping = new BoxGeometry(w, hPing, d);
    ping.translate(0, hQi + hPing / 2, 0);
    parts.push(ping);

    // 斗耳:开口宽 = 栱厚(斗口),十字口留四角、单向口留两侧
    const kou = fen(PART.gongSection.w);
    const earY = hQi + hPing + hEr / 2;
    if (DOU.cross[type]) {
      const ew = (w - kou) / 2, ed = (d - kou) / 2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const e = new BoxGeometry(ew, hEr, ed);
        e.translate(sx * (w - ew) / 2, earY, sz * (d - ed) / 2);
        parts.push(e);
      }
    } else {
      const ed = (d - kou) / 2;
      for (const sz of [-1, 1]) {
        const e = new BoxGeometry(w, hEr, ed);
        e.translate(0, earY, sz * (d - ed) / 2);
        parts.push(e);
      }
    }
    const g = mergeGeometries(parts.map((x) => unify(x, {})), false);
    return unify(g, { partKey: type, height: h, width: w, depth: d });
  });
}

/** 斗的总高(米)—— 文法层叠放用 */
export const douHeight = (type) => fen(PART[type].h);

/* ══════════════ 栱 ══════════════
 * 侧样:中段满高,两端卷杀(端面只保留 endRise 比例的高度),
 * 分瓣以折线近似(near 档 4 瓣,far 档 1 瓣直斜面)。 */
export function makeGong(type = 'lingGong', { detail = 'near', zucai = false, lenOverride = null } = {}) {
  return memo(`gong_${type}_${detail}_${zucai}_${lenOverride ?? ''}`, () => {
    const L = lenOverride ?? fen(PART[type].len);
    const h = zucai ? ZUCAI : CAI.guang;          // 足材(华栱)/ 单材(横栱)
    const t = fen(PART.gongSection.w);
    const js = fen(JUANSHA.len);
    const rise = h * JUANSHA.endRise;
    const bans = detail === 'near' ? JUANSHA.bans : 1;

    // 自左端面下沿,沿卷杀折线升到中段底面,再对称回来
    const pts = [[-L / 2, h - rise]];
    for (let i = 1; i <= bans; i++) {
      const f = i / bans;
      pts.push([-L / 2 + js * f, (h - rise) * (1 - Math.pow(f, 0.72))]);
    }
    pts.push([L / 2 - js, 0]);
    for (let i = bans - 1; i >= 0; i--) {
      const f = i / bans;
      pts.push([L / 2 - js * f, (h - rise) * (1 - Math.pow(f, 0.72))]);
    }
    pts.push([L / 2, h], [-L / 2, h]);
    return unify(extrudeProfile(pts, t), { partKey: type, height: h, length: L, thickness: t });
  });
}

/* ══════════════ 下昂 ══════════════
 * 批竹昂:长杆件,外端斜削成昂嘴。几何按水平生成,
 * 倾角由文法层施加(ANG.slope),原点在内端底面中心。 */
export function makeAng(length, { detail = 'near' } = {}) {
  return memo(`ang_${length.toFixed(3)}_${detail}`, () => {
    const h = ZUCAI;
    const t = fen(PART.gongSection.w);
    const tip = CAI.guang * ANG.tipRatio;         // 批竹斜面长
    const pts = [
      [0, 0], [length - tip, 0],                  // 底面
      [length, h * 0.82],                         // 昂嘴尖(批竹一刀直下)
      [length, h], [0, h],
    ];
    return unify(extrudeProfile(pts, t), { partKey: 'ang', height: h, length, thickness: t });
  });
}

/* ══════════════ 耍头(蚂蚱头)══════════════ */
export function makeShuaTou({ detail = 'near' } = {}) {
  return memo(`shuatou_${detail}`, () => {
    const L = fen(SHUATOU.len);
    const h = ZUCAI;
    const t = fen(PART.gongSection.w);
    const k = SHUATOU.headRatio;
    const pts = [
      [-L / 2, 0], [L / 2 - h * 0.5, 0],
      [L / 2, h * 0.30],                          // 下颚斜出
      [L / 2 - h * 0.18, h * k],                  // 收口
      [L / 2, h * 0.86], [L / 2 - h * 0.42, h],
      [-L / 2, h],
    ];
    return unify(extrudeProfile(pts, t), { partKey: 'shuaTou', height: h, length: L, thickness: t });
  });
}

/* ══════════════ 驼峰 / 蜀柱(补间坐底)══════════════ */
export function makeTuoFeng({ detail = 'near' } = {}) {
  return memo(`tuofeng_${detail}`, () => {
    const L = fen(TUOFENG.len), h = fen(TUOFENG.h);
    const t = fen(PART.gongSection.w) * 1.6;
    const pts = [[-L / 2, 0], [L / 2, 0]];
    // 峰形:两侧内凹上收的驼背曲线
    const N = detail === 'near' ? 10 : 4;
    for (let i = 0; i <= N; i++) {
      const f = 1 - i / N;
      const x = (f - 0.5) * L * 0.72;
      pts.push([x, h * Math.pow(Math.cos((f - 0.5) * Math.PI), 0.55)]);
    }
    return unify(extrudeProfile(pts, t), { partKey: 'tuoFeng', height: h, length: L, thickness: t });
  });
}

/** 枋(柱头枋 / 罗汉枋 / 橑檐枋):横向长材,文法层按需截取长度 */
export function makeFang(length, { zucai = true } = {}) {
  return memo(`fang_${length.toFixed(3)}_${zucai}`, () => {
    const h = zucai ? ZUCAI : CAI.guang;
    const g = new BoxGeometry(length, h, fen(PART.gongSection.w));
    g.translate(0, h / 2, 0);
    return unify(g, { partKey: 'fang', height: h, length });
  });
}

/**
 * 暗栔:柱头枋道与道之间的填木(第13轮裁决三)。
 * 单材枋高 15 分、步进 21 分,每道之上留 6 分 = 一个栔的缝;《法式》的原厂答案
 * 就是拿填木塞实,而不是把枋改成足材(那会动到咬合逻辑)。
 * 尺寸全部派生:高 = 栔,厚 = 栱厚,长 = 所填那道枋的长。
 */
export function makeAnZhi(length) {
  return memo(`anzhi_${length.toFixed(3)}`, () => unify(
    new BoxGeometry(length, ANZHI_H, fen(PART.gongSection.w)),
    { partKey: 'anZhi', height: ANZHI_H, length },
  ));
}
