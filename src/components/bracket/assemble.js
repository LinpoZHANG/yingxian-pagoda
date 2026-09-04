/**
 * components/bracket/assemble.js —— 铺作文法(组合规则引擎)
 * ─────────────────────────────────────────────────────────────
 * ★ 本项目「程序化生成能力」的核心展示件。
 *
 * 全塔 50+ 种斗拱不逐一建模,而是由同一套宋式规则 + 一组 config
 * 组合涌现。规则(《法式》卷四大木作制度):
 *
 *   竖向步进:栌斗 20分 坐底;此后每出一跳升一足材 21分。
 *     出跳构件(华栱/昂)高足材,交互斗坐栱头之上、以十字斗口
 *     卡住上一跳构件 —— 故斗与上层栱在高度上互相咬合,
 *     净升幅恰为一足材,与 caifen.bracketHeight() 一致。
 *   水平出跳:每跳 30分;第 k 跳构件通长 2×(k×30分)(里外对称)。
 *   计心/偷心:计心跳的跳头横置瓜子栱(末跳为令栱),偷心跳只过不置。
 *   昂:外侧若干跳改用下昂,昂身斜下、昂尾斜上入内(杠杆关系)。
 *   横向叠置:栌斗口内泥道栱 → 其上慢栱 → 再上柱头枋。
 *   转角:三向并置(两正身方向 ±22.5° + 角平分线斜出跳),
 *         斜出跳按 1/cos22.5° 加长 —— 八角塔的转角文法由此得出。
 *
 * config = {
 *   tiao, ang,                          // 出跳数 / 其中昂跳数(取自 PUZUO 表)
 *   role: 'zhutou'|'bujian'|'zhuanjiao',// 柱头 / 补间 / 转角
 *   facing: 'out'|'in',                 // 外檐 / 内槽
 *   bay: 'dangxin'|'cijian',            // 当心间 / 次间(补间分型,版20 已示)
 *   touxin: number[],                   // 偷心跳序号
 *   detail: 'far'|'near',
 * }
 *
 * 性能:同 config 的结果按 key 缓存;bracketGeometry() 产出单一
 * 合并几何,供 assembly 层用 InstancedMesh 全塔铺放(400+ 朵)。
 */

import { Group, Mesh, Matrix4, Euler, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  fen, PART, CAI, ZUCAI, ANG, TUOFENG, SHUATOU, PUZUO_RISE, ANG_RISE, ANZHI_H,
} from '../../data/caifen.js';
import { OCT_ROT } from '../../assembly/octagon.js';
import {
  makeDou, makeGong, makeAng, makeShuaTou, makeTuoFeng, makeFang, makeAnZhi, douHeight,
} from './parts.js';

const TIAO = fen(PART.tiao);                 // 一跳 30分
const STEP = fen(PUZUO_RISE.perTiao);        // 一足材 21分
const LU_H = fen(PART.luDou.h);              // 栌斗 20分
const STEP_ANG = fen(ANG_RISE);              // 昂跳步进 10.5分 —— 昂斜置,一跳升得比华栱少
const ANG_DROP = STEP - STEP_ANG;            // 一个昂跳比华栱跳少升的量(= 昂斜率×跳距)
/** 转角斜出跳加长系数:八角内角 135°,角平分线与正身夹角 22.5° */
const DIAG = 1 / Math.cos(OCT_ROT);

const geoCache = new Map();

/**
 * 收集器:把 (几何, 变换) 累积起来,末尾一次性合并或建 Group。
 *
 * 坐标约定 —— 每条「出跳臂」有自己的局部坐标系:
 *   臂frame = RotY(armA);臂内 +Z = 出跳方向(向外),+X = 横向(切向)。
 * parts.js 的构件长向一律沿 +X,故:
 *   横栱(泥道/瓜子/慢/令/枋)  localRy = 0        (长向 = 臂内 X = 横向)✔
 *   出跳件(华栱/昂/耍头)      localRy = -π/2     (长向转到臂内 +Z = 外)✔
 * 变换 = RotY(armA) · T(x,y,z) · RotY(localRy) · RotX(rx)
 */
function collector() {
  const items = [];
  const tmp = new Matrix4(), rot = new Matrix4(), e = new Euler();
  return {
    items,
    /** @param {number} armA 该臂方位;x/y/z 为臂内坐标 */
    add(geo, { armA = 0, x = 0, y = 0, z = 0, ry = 0, rx = 0, name = 'part', partKey = 'bracket' }) {
      const m = new Matrix4().makeRotationY(armA);
      tmp.makeTranslation(x, y, z);
      m.multiply(tmp);
      e.set(rx, ry, 0, 'YXZ');
      rot.makeRotationFromEuler(e);
      m.multiply(rot);
      items.push({ geo, matrix: m, name, partKey });
    },
  };
}

/** 出跳件的朝向:长向由 +X 转到臂内 +Z */
const OUT_RY = -Math.PI / 2;

/**
 * 压缩后的每跳升幅,带**文法级硬底**。
 * 出跳件是足材(ZUCAI),而标称步进恰等于足材 —— 层间净空本就是零。
 * 故步进一旦被压到足材以下,上一跳的栱身就钻进下一跳、把交互斗整个吞掉,
 * 一朵铺作糊成木疙瘩(第12轮症状)。这条底线是文法不变量,不是数值调优:
 * 放样层给多大的裁额都不许突破它,越限只能转立案,不能靠压扁构件来平账。
 */
function stepCompressed(C, tiao) {
  const raw = STEP - (C.squash || 0) / Math.max(1, tiao - 1);
  return Math.max(ZUCAI, raw);
}

/**
 * 第 k 跳(1 起)的竖向步进。华栱跳升一足材;**昂跳只升 足材 − 昂斜率×跳距**
 * —— 下昂斜置,出挑更远而抬升更少,这是它的结构本义(第13轮裁决二)。
 * 昂跳一律排在外侧,故 k > 华栱跳数即为昂跳。
 */
function stepAt(C, k, stepC) {
  return k > C.tiao - C.ang ? stepC - ANG_DROP : stepC;
}

/** 一朵铺作自栌斗底到末跳背的累计升高(逐跳步进之和)*/
function armRise(C, stepC, upto = C.tiao) {
  let h = 0;
  for (let k = 1; k <= upto; k++) h += stepAt(C, k, stepC);
  return h;
}

/** 横栱两端散斗 + 中心齐心斗(斗沿栱长向 = 臂内 X 排布) */
function addDouOnGong(out, type, { armA, y, z, detail }) {
  const L = fen(PART[type].len);
  const gy = y + CAI.guang;
  const half = L / 2 - fen(PART.sanDou.w) / 2;
  [[-half, 'sanDou'], [0, 'qiXinDou'], [half, 'sanDou']].forEach(([off, kind]) => {
    out.add(makeDou(kind, { detail }),
      { armA, x: off, y: gy, z, name: `${kind}_${type}`, partKey: kind });
  });
}

/**
 * 一条出跳臂的全部内容:逐跳华栱/昂 → 跳头交互斗 → 计心横栱 → 耍头 → 橑檐枋。
 * @param {number} armA   臂方位(相对本朵正面)
 * @param {number} rScale 出跳加长系数(转角斜出跳 = DIAG)
 * @param {number} base   坐底抬高(补间的驼峰)
 */
function buildArm(C, out, armA, rScale, base) {
  const { tiao, ang, detail, touxin } = C;
  // 压缩后的每跳升幅。总高只累计 (tiao−1) 个步进(末跳之上另叠令栱/散斗/枋),
  // 故均摊的分母是 tiao−1,这样「实减」才恰好等于裁额。
  const STEP_C = stepCompressed(C, tiao);
  const huaCount = tiao - ang;
  const diag = rScale !== 1;         // 斜出跳:里跳内容从简,避免转角三臂互相塞满
  let y = base + LU_H;
  let lastGongY = null;              // 末跳令栱标高,橑檐枋据此落位

  for (let k = 1; k <= tiao; k++) {
    const reach = TIAO * k * rScale;
    const prev = TIAO * (k - 1) * rScale;
    const isAng = k > huaCount;
    let headDrop = 0;

    if (!isAng) {
      // 华栱:里外对称通长,足材;第 k 跳通长 2×k 跳
      out.add(makeGong('huaGong', { detail, zucai: true, lenOverride: reach * 2 }),
        { armA, y, ry: OUT_RY, name: `huaGong_${k}`, partKey: 'huaGong' });
    } else {
      // 下昂:昂尾入内斜上、昂身斜下出跳,批竹昂嘴。
      // 转角斜出跳跑得更远(×DIAG),斜率按臂长归一 —— 令**昂头的下降量与正身相同**,
      // 三种朵位才落在同一条橑檐枋上(否则转角朵会比柱头朵矮一截)。
      const slopeK = ANG_DROP / (TIAO * rScale);
      const tail = TIAO * rScale * ANG.tailRatio;
      const len = reach + tail;
      out.add(makeAng(len, { detail }), {
        armA, z: -tail, y: y + slopeK * (prev + tail),
        ry: OUT_RY, rx: Math.atan(slopeK),
        name: `ang_${k - huaCount}`, partKey: 'ang',
      });
      headDrop = ANG_DROP;
    }

    // 跳头交互斗:坐栱头之上,十字斗口卡住上一跳构件
    const headY = y + ZUCAI - headDrop;
    out.add(makeDou('jiaoHuDou', { detail }),
      { armA, y: headY, z: reach, name: `jiaoHuDou_${k}`, partKey: 'jiaoHuDou' });
    if (!diag) {
      out.add(makeDou('jiaoHuDou', { detail }),
        { armA, y: headY, z: -reach, name: `jiaoHuDouIn_${k}`, partKey: 'jiaoHuDou' });
    }

    // 计心跳:跳头横置栱(末跳令栱承橑檐枋,中间跳瓜子栱 + 其上慢栱)
    const isLast = k === tiao;
    if (!touxin.includes(k)) {
      const type = isLast ? 'lingGong' : 'guaZiGong';
      const gy = headY + douHeight('jiaoHuDou') - CAI.guang * 0.27;
      for (const s of diag ? [1] : [1, -1]) {
        out.add(makeGong(type, { detail }),
          { armA, y: gy, z: s * reach, name: `${type}_${k}`, partKey: type });
        addDouOnGong(out, type, { armA, y: gy, z: s * reach, detail });
        if (isLast && s === 1) lastGongY = gy;
        if (!isLast) {
          const st = stepAt(C, k + 1, STEP_C);
          out.add(makeGong('manGong', { detail }),
            { armA, y: gy + st, z: s * reach, name: `manGong_${k}`, partKey: 'manGong' });
          addDouOnGong(out, 'manGong', { armA, y: gy + st, z: s * reach, detail });
        }
      }
    }
    y += stepAt(C, k, STEP_C);
  }

  /* 耍头:令栱之上再挑出,蚂蚱头造型 */
  const stY = base + LU_H + armRise(C, STEP_C);
  const stReach = TIAO * tiao * rScale;
  out.add(makeShuaTou({ detail }), {
    armA, y: stY, z: stReach - fen(SHUATOU.len) * 0.35,
    ry: OUT_RY, name: 'shuaTou', partKey: 'shuaTou',
  });

  /* 最上一道通长枋:落在末跳令栱的散斗口内。
   * 外檐是橑檐枋(承檐椽),平座是地面枋(承平座楼板)—— 位置同,受力对象不同。 */
  if (C.facing === 'out' && !diag) {
    const fy = (lastGongY ?? stY) + CAI.guang + douHeight('sanDou') - CAI.guang * 0.27;
    const key = C.top === 'deck' ? 'diMianFang' : 'liaoYanFang';
    out.add(makeFang(fen(PART.lingGong.len) * 1.5, { zucai: true }),
      { armA, y: fy, z: stReach, name: key, partKey: key });
  }
}

/** 栌斗口内的横向叠置:泥道栱 → 慢栱 → 柱头枋(垫至铺作顶),道间以暗栔填实 */
function buildTransverseStack(C, out, armA, base) {
  const { detail, tiao } = C;
  const STEP_C = stepCompressed(C, tiao);
  const gongW = fen(PART.gongSection.w);
  /** 暗栔:填在本道构件背面与下一道之间的那条栔缝 [法](第13轮裁决三)*/
  const anZhi = (y, len, n) => {
    const gap = ANZHI_H;
    if (gap <= 1e-4) return;
    out.add(makeAnZhi(len), { armA, y: y + CAI.guang + gap / 2, name: `anZhi_${n}`, partKey: 'anZhi' });
  };
  let y = base + LU_H;
  out.add(makeGong('niDaoGong', { detail }), { armA, y, name: 'niDaoGong', partKey: 'niDaoGong' });
  addDouOnGong(out, 'niDaoGong', { armA, y, z: 0, detail });
  anZhi(y, fen(PART.niDaoGong.len), 0);
  y += stepAt(C, 1, STEP_C);
  out.add(makeGong('manGong', { detail }), { armA, y, name: 'manGong_ni', partKey: 'manGong' });
  addDouOnGong(out, 'manGong', { armA, y, z: 0, detail });
  anZhi(y, fen(PART.manGong.len), 1);
  y += stepAt(C, 2, STEP_C);
  const top = base + LU_H + armRise(C, STEP_C);
  let n = 0;
  while (y + CAI.guang <= top + 1e-6 && n < 6) {
    out.add(makeFang(fen(PART.manGong.len), { zucai: false }),
      { armA, y, name: `zhuTouFang_${n}`, partKey: 'zhuTouFang' });
    const st = stepAt(C, 3 + n, STEP_C);
    if (y + st + CAI.guang <= top + 1e-6) anZhi(y, fen(PART.manGong.len), 2 + n);
    y += st; n++;
  }
}

/** 归一化 config,补默认值并生成缓存键 */
export function normalizeConfig(cfg) {
  const c = {
    tiao: cfg.tiao, ang: cfg.ang ?? 0,
    role: cfg.role ?? 'zhutou',
    facing: cfg.facing ?? 'out',
    bay: cfg.bay ?? 'cijian',
    touxin: cfg.touxin ?? [],
    // 竖向压缩量(米,第11轮终裁):由链预算反解、封顶 0.35 m。
    // 均摊到各跳的步进上 —— 每跳少升 squash/tiao,总高恰减 squash。
    squash: cfg.squash ?? 0,
    top: cfg.top ?? 'liaoyan',        // 最上通长枋的身份:橑檐枋 / 平座地面枋
    tuofeng: cfg.tuofeng ?? false,    // 补间是否垫驼峰(仅无普拍枋的圈才需要)
    detail: cfg.detail ?? 'far',
  };
  c.key = `${c.tiao}-${c.ang}-${c.role}-${c.facing}-${c.bay}-${c.touxin.join('.')}`
    + `-${c.top}-${c.squash.toFixed(4)}-${c.tuofeng ? 'tf' : 'nf'}-${c.detail}`;
  return c;
}

/** 组装一朵铺作 → 收集器条目(内部用) */
function assembleItems(C) {
  const out = collector();

  // 补间与柱头的栌斗同高 —— 两者共同承一条橑檐枋,不同高是错的。
  // 版20 已示副阶当心间/次间补间分型,此处以 bay 维度区分。
  //
  // ★ 驼峰(第12轮改为**按需**,默认不出):驼峰是「无普拍枋时垫平阑额与栌斗」
  //   的填充件。本塔各圈都有普拍枋,补间栌斗直接坐枋背即可;此前无条件在栌斗
  //   之下垫 0.374 m 驼峰,结果整根埋在普拍枋与阑额里 —— 渲染中根本看不见,
  //   却把断言四的「铺作底」拉低 0.374,掩盖了真正的落座问题。
  //   若日后判明某圈确无普拍枋(版20 副阶待核),置 cfg.tuofeng = true 即恢复。
  const base = 0;
  if (C.role === 'bujian' && C.tuofeng) {
    out.add(makeTuoFeng({ detail: C.detail }),
      { y: -fen(TUOFENG.h), name: 'tuoFeng', partKey: 'tuoFeng' });
  }

  // 转角:两正身方向(±22.5°)+ 角平分线斜出跳(加长 1/cos22.5°)
  const arms = C.role === 'zhuanjiao'
    ? [[-OCT_ROT, 1], [OCT_ROT, 1], [0, DIAG]]
    : [[0, 1]];

  out.add(makeDou('luDou', { detail: C.detail }), { y: base, name: 'luDou', partKey: 'luDou' });

  for (const [armA, scale] of arms) buildArm(C, out, armA, scale, base);

  // 转角三臂的横栱已互相搭交,正身朵才另置泥道栱叠层
  if (C.role !== 'zhuanjiao') buildTransverseStack(C, out, 0, base);

  return out.items;
}

/**
 * 合并几何(单材质),供 InstancedMesh 全塔铺放。同 config 只算一次。
 * @returns {BufferGeometry}
 */
/**
 * 构件族 → 明度系数,烘进顶点色。
 *
 * 为什么要做:一朵七铺作是四跳华栱 + 两层昂 + 十几只斗,**全部同色同材**。
 * 相邻构件互相咬合、共面搭接,自阴影又画不出来(阴影贴图一个纹素 2.6 cm,
 * 斗耳才 6.8 cm),于是整朵读成一块深褐色板 —— 用户第35、36轮连报两次
 * 「斗拱粘连、可读性很差」。
 *
 * 为什么这样做站得住:**斗是端面朝上的小方块,栱是顺纹的长材**。
 * 端面吸水快、风化后返灰返白,顺纹面则留住油色 —— 实照上斗确实比栱亮一档。
 * 故这里不是给几何随便涂色,而是把这条真实的材面差写进顶点。
 * 幅度取 ±14% [估/表现],比实照保守,只求把层次读出来,不做彩画。
 *
 * 走顶点色而不是拆材质:一朵铺作是**一件合并几何**,拆材质就要拆成十几个
 * InstancedMesh,四百八十朵会把绘制批次从十次抬到上百次。顶点色不加一次绘制。
 */
export const PART_TONE = {
  luDou: 1.14, jiaoHuDou: 1.14, sanDou: 1.14, qiXinDou: 1.14,   // 斗:端面朝上,最亮
  huaGong: 0.90, niDaoGong: 0.90, guaZiGong: 0.90,
  manGong: 0.90, lingGong: 0.90,                                 // 栱:顺纹,基准暗一档
  ang: 0.80,                                                     // 昂:斜面背光,再暗一档
  shuaTou: 0.98,
  fang: 0.72, anZhi: 0.68,                                       // 枋与暗栔:退在最里,压到底
  tuoFeng: 0.94,
};

/** 给一件几何写入 color 属性(单色填充);合并前逐件调用,属性表才对得齐 */
function tintGeometry(geo, partKey) {
  const t = PART_TONE[partKey] ?? 1.0;
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  arr.fill(t);
  geo.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return geo;
}

export function bracketGeometry(cfg) {
  const C = normalizeConfig(cfg);
  if (geoCache.has(C.key)) return geoCache.get(C.key);
  const items = assembleItems(C);
  const parts = items.map(({ geo, matrix, partKey }) =>
    tintGeometry(geo.clone().applyMatrix4(matrix), partKey));
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error(`铺作合并失败:${C.key}`);
  merged.userData = { config: C, partCount: items.length };
  geoCache.set(C.key, merged);
  return merged;
}

/**
 * 组装一朵铺作为 Group(构件独立可拾取/可分解),用于近景与英雄节点。
 * 材质由调用方传入 —— 本模块只管几何与文法,不引用 materials,
 * 以便放样层(assembly/plan.js)可以只为求高度而加载它,不牵出整条材质链。
 * @param {object} cfg
 * @param {THREE.Material} material
 * @returns {Group}
 */
export function assembleBracketSet(cfg, material) {
  const C = normalizeConfig({ ...cfg, detail: cfg.detail ?? 'near' });
  const g = new Group();
  g.name = `bracket_${C.key}`;
  for (const { geo, matrix, name, partKey } of assembleItems(C)) {
    // 分件路径也要写顶点色:材质是同一份(vertexColors 已开),
    // 少了 color 属性的网格会渲染成黑块。
    const m = new Mesh(tintGeometry(geo.clone(), partKey), material);
    m.applyMatrix4(matrix);
    m.name = name;
    m.castShadow = m.receiveShadow = true;
    m.userData = { partKey, type: 'bracket', config: C.key };
    g.add(m);
  }
  g.userData = { partKey: 'bracketSet', type: 'bracket', config: C };
  return g;
}

/**
 * 铺作的「结构总高」(米):栌斗底 → 末跳华栱背。与 caifen.bracketHeight 同源,
 * 是叠柱堆叠的步进量,不含其上的令栱与通长枋。
 */
export const bracketTotalHeight = (cfg) => LU_H + armRise(normalizeConfig(cfg), STEP);

/**
 * 铺作的「实际总高」(米):栌斗底 → 全朵最高点(含令栱、散斗、橑檐/地面枋)。
 * 由合并后的几何包围盒量得 —— 文法一改,此值自动跟上,不需手工同步公式。
 * 平座楼板必须坐在这个高度上,否则斗拱会穿出平座面。
 */
export function bracketFullHeight(cfg) {
  const geo = bracketGeometry(cfg);
  if (!geo.boundingBox) geo.computeBoundingBox();
  return geo.boundingBox.max.y;
}

/**
 * 铺作的「下缘」(米,相对栌斗底,补间因驼峰垫在栌斗之下而为负)。
 * 屋面上缘收口要让过的是这个面,不是栌斗底 —— 否则驼峰会扎进瓦面。
 */
/**
 * 铺作的最外出跳半径(米,自栌斗心量到构件外皮)。
 * 橑檐枋本身有厚度,其外皮比「出跳」还远;屋面局部抬升须一直平推到这里,
 * 否则枋的外半边仍会顶穿瓦面。
 */
export function bracketOuterReach(cfg) {
  const geo = bracketGeometry(cfg);
  if (!geo.boundingBox) geo.computeBoundingBox();
  return geo.boundingBox.max.z;
}

export function bracketBottom(cfg) {
  const geo = bracketGeometry(cfg);
  if (!geo.boundingBox) geo.computeBoundingBox();
  return geo.boundingBox.min.y;
}
