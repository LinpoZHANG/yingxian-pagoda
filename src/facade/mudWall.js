/**
 * facade/mudWall.js —— 夹泥墙(古貌)与墙内斜撑
 * ─────────────────────────────────────────────────────────────
 * 只服务于「古今变化」模块,不参与常规组装 —— 现有 components/wall.js
 * 一行未改其几何,这里另起一套构件,与它在同一开间里互相显隐。
 *
 * 做法(资料源 reference/FacadeHistory/README §2、§5、§6):
 *   夹泥墙 = 木骨(上下槛 · 立颊 · 腰串)+ 其间的泥质填充,外表抹灰。
 *   故不是一片白板:框料满厚、抹灰面退入一线,侧光下框凸墙凹,
 *   自然读出「嵌在结构框架内的填充」,而不是贴在木塔外面的一层皮。
 *
 *   墙内斜撑 = 藏在墙体厚度中线的交叉木杆。外观上它在古貌里**看不见**,
 *   只在古今过渡的中段短暂显露 —— 这正是资料包 §5 建议的分阶段过渡:
 *   抹灰先退,斜撑一现,再由木格扇/版壁接手。它同时也是这次改动
 *   「拆的不只是饰面,还有一整套抗侧刚度」这句话唯一能被看见的形式。
 *
 * ★ 材质由本模块独占(PLASTER / WOOD 的克隆),因此可以自由改不透明度
 *   做过渡,不会牵动全塔共享材质。
 */

import { Group, Mesh, BoxGeometry, Vector3, Color } from 'three';
import { fen, SECTION } from '../data/caifen.js';
import { PLASTER } from '../materials/tile.js';
import { WOOD } from '../materials/wood.js';
import { MUD_WALL, ANCIENT_OPENING } from './facadeEras.js';

/* ── 材质:全部为克隆件,古今过渡时整族调不透明度 ───────────────── */

/** 抹灰面:温灰白 / 米白 / 浅土色数档,逐间轮换。
 *  资料包 §6.2 明令不得做成现代水泥板或纯白塑料面 —— 故保留 PLASTER 的
 *  抹灰噪点与雨痕法线,只换色相,并把粗糙度顶到近乎全漫反射。 */
export const MUD_PLASTER = MUD_WALL.plasterTones.map((hex) => {
  const m = PLASTER.clone();
  m.color = new Color(hex);
  m.roughness = 0.97;
  return m;
});

/** 墙的木骨(上下槛 · 立颊 · 腰串):比柱枋淡一档,与柱身区分得开 */
export const MUD_FRAME = WOOD.pillar.clone();

/** 墙内斜撑:同暗层斜撑一族的暗褐,藏在墙内,只在过渡中段现身 */
export const MUD_BRACE = WOOD.pillar.clone();

/** 古貌小窗的窗框与直棂:与木骨同族,随夹泥墙一同淡出 */
export const MUD_TRIM = WOOD.trim.clone();

/** 供 facadeHistory 统一调度的材质族 */
export const MUD_MATERIALS = {
  plaster: MUD_PLASTER, frame: [MUD_FRAME, MUD_TRIM], brace: [MUD_BRACE],
};

/* ── 放样 ──────────────────────────────────────────────────── */

/**
 * 在两柱心之间竖一片方料 / 板。
 * 与 components/wall.js 的 panel() 同一套定位逻辑(柱心连线 + 法向内收),
 * 但另加 `clear`:两端各让开半个柱径,墙才不会与柱身穿插(资料包 §6.7)。
 */
function slab(a, b, {
  y0, y1, thickness, material, inset = 0, clear = 0, partKey, level, face, bay,
}) {
  const h = y1 - y0;
  if (h <= 0) return null;
  const dir = new Vector3().subVectors(b, a).setY(0);
  const len = dir.length() - clear * 2;
  if (len <= 0) return null;
  const mid = a.clone().add(b).multiplyScalar(0.5).setY(y0 + h / 2);
  const normal = new Vector3(mid.x, 0, mid.z).normalize();
  mid.addScaledVector(normal, -inset);
  const m = new Mesh(new BoxGeometry(len, h, thickness), material);
  m.position.copy(mid);
  m.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  m.castShadow = m.receiveShadow = true;
  m.userData = { partKey, level, type: 'wall', face, bay, era: 'ancient' };
  return m;
}

/**
 * 一根斜杆:自 p 到 q 的方料,两端不做榫,只求形与向对。
 *
 * ★ `castShadow` 默认关。斜撑在古貌里坐在墙厚中线上、被抹灰完全包住,
 *   本该看不见 —— 可它一旦投影,阴影就会穿到抹灰的**正面**上:
 *   墙面到斜撑只有 9 cm,而阴影贴图要覆盖一座 67 m 的塔,这点深度差落在
 *   贴图精度与 bias 之下,于是每一间墙上都印出一个十字(第39轮实见)。
 *   投影权由 facadeHistory 在过渡里按抹灰的存亡开合:抹灰退尽才给它投影。
 */
function strut(p, q, { w, h, material, partKey, level, face, bay }) {
  const d = new Vector3().subVectors(q, p);
  const len = d.length();
  if (len <= 1e-4) return null;
  const m = new Mesh(new BoxGeometry(w, h, len), material);
  m.position.copy(p).add(q).multiplyScalar(0.5);
  m.lookAt(q);
  m.castShadow = false;
  m.userData = { partKey, level, type: 'brace', face, bay, era: 'ancient' };
  return m;
}

/**
 * 一间夹泥墙(含墙内斜撑)。
 * @param {Vector3} a,b 该间两端柱心(柱脚)
 * @returns {{plaster:Group, brace:Group}} 抹灰面/木骨 与 墙内斜撑分组,便于分阶段过渡
 */
function historicBay(a, b, { y0, y1, level, face, bay, tone }) {
  const wall = new Group();
  const brace = new Group();
  const T = MUD_WALL.thickness;
  const fw = T * MUD_WALL.frameRatio;
  const clear = MUD_WALL.columnClear;
  const h = y1 - y0;
  if (h <= fw * 3) return { wall, brace };

  const opt = { thickness: T, clear, partKey: 'mudWall', level, face, bay };

  /* 木骨:下槛、上槛、腰串 —— 横向三道,满厚 */
  const waist = y0 + h * 0.46;                       // [估] 腰串:约当墙高中偏下
  const waistLo = waist - fw * 0.5, waistHi = waist + fw * 0.5;
  for (const [ry0, ry1] of [[y0, y0 + fw], [y1 - fw, y1], [waistLo, waistHi]]) {
    const m = slab(a, b, { ...opt, y0: ry0, y1: ry1, material: MUD_FRAME });
    if (m) wall.add(m);
  }

  /* 木骨:左右立颊 —— 竖向两道。以「整片墙 + 两端短板」拼不出立颊,
   * 故按间宽算出偏移,单独放两根竖料。 */
  const dir = new Vector3().subVectors(b, a).setY(0);
  const len = dir.length() - clear * 2;
  const rotY = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  const mid = a.clone().add(b).multiplyScalar(0.5);
  for (const s of [-1, 1]) {
    const m = new Mesh(new BoxGeometry(fw, h, T), MUD_FRAME);
    m.position.set(mid.x, y0 + h / 2, mid.z);
    m.rotation.y = rotY;
    m.translateX(s * (len - fw) / 2);
    m.castShadow = m.receiveShadow = true;
    m.userData = { partKey: 'mudWall', level, type: 'wall', face, bay, era: 'ancient' };
    wall.add(m);
  }

  /**
   * 抹灰面:填在木骨**围出的两格**里(腰串上下各一格),不与任何框料重叠。
   *
   * ★ 不重叠是硬要求,不是洁癖。立面机位是长焦远景(≈480 m),
   *   在 near=0.05 的透视深度缓冲下,该处的深度分辨率约 0.27 m ——
   *   几厘米的前后关系在那里根本分不出来,相叠的两个面必然打架。
   *   让抹灰**顶到框料为止**,前后关系就不必靠深度缓冲去仲裁。
   *   顺带这也是对的做法:木骨分格,泥填在格里。
   */
  const plasterT = T - MUD_WALL.plasterRecess * 2;
  for (const [py0, py1] of [[y0 + fw, waistLo], [waistHi, y1 - fw]]) {
    const m = slab(a, b, {
      ...opt, y0: py0, y1: py1,
      thickness: plasterT, clear: clear + fw,
      material: MUD_PLASTER[tone % MUD_PLASTER.length],
    });
    if (m) wall.add(m);
  }

  /* 墙内斜撑:交叉两向,坐在墙厚中线上。古貌静止态里**不显示** ——
   * 它本来就藏在墙里看不见,而在长焦远景的深度精度下,「藏在里面」是
   * 靠深度缓冲仲裁不出来的(第39轮:每间墙上都印出一个十字)。
   * 显隐权交给 facadeHistory:只在过渡中「抹灰已退、版壁未到」那一段现身。 */
  const bw = fen(MUD_WALL.brace.w), bh = fen(MUD_WALL.brace.h);
  const half = (len - fw * 2) / 2;
  const tan = new Vector3(Math.cos(rotY), 0, -Math.sin(rotY));   // 面内切向
  const corner = (sx, sy) => mid.clone()
    .addScaledVector(tan, sx * half)
    .setY(sy < 0 ? y0 + fw : y1 - fw);
  for (const [p, q] of [
    [corner(-1, -1), corner(1, 1)],
    [corner(1, -1), corner(-1, 1)],
  ]) {
    const m = strut(p, q, {
      w: bw, h: bh, material: MUD_BRACE, partKey: 'wallBrace', level, face, bay,
    });
    if (m) brace.add(m);
  }

  return { wall, brace };
}

/**
 * 一整层的古貌立面(仅次间;当心间的门窗古今同存,不在此列)。
 *
 * 为什么只接管次间:资料包时间线记的是「二至五层明层**大量夹泥墙**被拆、
 * 改装连续格扇」,而 1934 年照片上每面当心间仍是开口。当心间的门与窗
 * 在两个年代都在,故一律留给现有 components/wall.js,这里不生成、不隐藏。
 *
 * @param {object} o
 *   feet   该层外槽柱脚序列(与 buildWalls 同一序列,分间规则一致)
 *   y0/y1  墙身上下皮标高(与 buildWalls 同值)
 * @returns {{group:Group, wallGroup:Group, braceGroup:Group}}
 */
export function buildHistoricWalls({ feet, y0, y1, level }) {
  const group = new Group();
  group.name = `facadeAncient_L${level}`;
  const wallGroup = new Group();
  wallGroup.name = 'mudWalls';
  const braceGroup = new Group();
  braceGroup.name = 'wallBraces';

  const OCT = feet.length / 3;
  let tone = level;                                  // 抹灰色相自层号起算,逐间轮换
  for (let f = 0; f < OCT; f++) {
    const idx = f * 3;
    const c0 = feet[idx], p0 = feet[idx + 1], p1 = feet[idx + 2];
    const c1 = feet[(idx + 3) % feet.length];
    for (const [a, b] of [[c0.pos, p0.pos], [p1.pos, c1.pos]]) {
      const { wall, brace } = historicBay(a, b, {
        y0, y1, level, face: f, bay: 'cijian', tone: tone++,
      });
      wallGroup.add(wall);
      braceGroup.add(brace);
    }
  }

  group.add(wallGroup, braceGroup);
  group.userData = { partKey: 'mudWall', level, type: 'facadeEra', era: 'ancient' };
  return { group, wallGroup, braceGroup };
}

/* ── 当心间:古貌的开口 ──────────────────────────────────────── */

/**
 * 古貌的直棂窗 —— 比今貌的通间窗小一圈,棂少而粗。
 * 不复用 components/wall.js 的 latticeWindow:那一扇是今貌的做法(通间、九棂),
 * 而且它用的是全塔共享的 WOOD.trim,淡入淡出会牵动门与勾阑。
 */
function smallLattice(mid, rotY, { cx, y0, y1, width, thickness }) {
  const g = new Group();
  const h = y1 - y0;
  const bar = fen(SECTION.xunZhang);
  const put = (w, hh, off, cy, d = thickness * 1.1) => {
    const m = new Mesh(new BoxGeometry(w, hh, d), MUD_TRIM);
    m.position.set(mid.x, cy, mid.z);
    m.rotation.y = rotY;
    m.translateX(off);
    m.castShadow = true;
    // 挂 partKey:窗 —— 夜景内透靠它认出格扇给自发光(scene/nightInterior.js)。
    // 不挂的话古貌这几扇小窗夜里不会透光,只有今貌的格扇透,两个年代对不上。
    m.userData = { partKey: 'window', type: 'window', era: 'ancient' };
    return m;
  };
  // 上下抹头 + 左右立颊
  for (const [w, hh, off, cy] of [
    [width, bar * 1.4, cx, y0 + bar * 0.7],
    [width, bar * 1.4, cx, y1 - bar * 0.7],
    [bar * 1.4, h, cx - (width / 2 - bar * 0.7), y0 + h / 2],
    [bar * 1.4, h, cx + (width / 2 - bar * 0.7), y0 + h / 2],
  ]) g.add(put(w, hh, off, cy));
  // 竖棂:古貌棂少而粗
  const n = ANCIENT_OPENING.lattice;
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1) - 0.5;
    g.add(put(bar * 1.25, h - bar * 2.8, cx + t * (width - bar * 3), y0 + h / 2, bar * 1.5));
  }
  return g;
}

/**
 * 一面当心间在**窗洞带**(今貌窗的上下皮之间)里的古貌做法。
 *
 * 四正向(南、东、北、西)留一扇小窗,其余四个斜向面整条封死 —— 这是资料包
 * §3.1 记的「只有四个正向设置主要门或开口,其他开间较封闭」。
 * 南、北两面是板门,门本身两个年代都在,不走这条路(band 高度为 0 即跳过)。
 */
function historicCenterBand(a, b, { y0, y1, level, face, tone, opened }) {
  const wall = new Group();
  const T = MUD_WALL.thickness;
  const fw = T * MUD_WALL.frameRatio;
  const clear = MUD_WALL.columnClear;
  const h = y1 - y0;
  if (h <= fw * 2) return wall;

  const dir = new Vector3().subVectors(b, a).setY(0);
  const len = dir.length() - clear * 2;
  const rotY = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const opt = { thickness: T, clear, partKey: 'mudWall', level, face, bay: 'dangxin' };
  const plasterT = T - MUD_WALL.plasterRecess * 2;
  const mat = MUD_PLASTER[tone % MUD_PLASTER.length];

  if (!opened) {
    // 封死:上下各一道槛,当中一片抹灰 —— 与次间同一做法,只是没有腰串
    for (const [ry0, ry1] of [[y0, y0 + fw], [y1 - fw, y1]]) {
      const m = slab(a, b, { ...opt, y0: ry0, y1: ry1, material: MUD_FRAME });
      if (m) wall.add(m);
    }
    const m = slab(a, b, {
      ...opt, y0: y0 + fw, y1: y1 - fw, thickness: plasterT, clear: clear + fw, material: mat,
    });
    if (m) wall.add(m);
    wall.userData = { partKey: 'mudWall', level, type: 'wall', face, bay: 'dangxin', era: 'ancient' };
    return wall;
  }

  /* 开一扇小窗:窗居中,其余四边填抹灰 */
  const winW = len * ANCIENT_OPENING.widthRatio;
  const winH = h * ANCIENT_OPENING.heightRatio;
  const wy0 = y0 + (h - winH) / 2, wy1 = wy0 + winH;

  // 上下两条:通宽
  for (const [ry0, ry1] of [[y0, wy0], [wy1, y1]]) {
    const m = slab(a, b, { ...opt, y0: ry0, y1: ry1, thickness: plasterT, clear: clear + fw * 0.5, material: mat });
    if (m) wall.add(m);
  }
  // 左右两块:窗侧的余壁,按偏移单独放(slab 只会做通间的片)
  const sideW = (len - winW) / 2 - fw * 0.5;
  if (sideW > 0.02) {
    for (const sgn of [-1, 1]) {
      const m = new Mesh(new BoxGeometry(sideW, winH, plasterT), mat);
      m.position.set(mid.x, wy0 + winH / 2, mid.z);
      m.rotation.y = rotY;
      m.translateX(sgn * (winW + sideW) / 2);
      m.castShadow = m.receiveShadow = true;
      m.userData = { partKey: 'mudWall', level, type: 'wall', face, bay: 'dangxin', era: 'ancient' };
      wall.add(m);
    }
  }
  wall.add(smallLattice(mid, rotY, { cx: 0, y0: wy0, y1: wy1, width: winW, thickness: T * 0.6 }));
  wall.userData = { partKey: 'mudWall', level, type: 'wall', face, bay: 'dangxin', era: 'ancient' };
  return wall;
}

/**
 * 一层的古貌当心间(只做窗洞带;门与门上余壁两个年代同在,不动)。
 *
 * @param {Array} bands 逐面的窗洞带 { face, sill, head } —— 由 facadeHistory
 *   自今貌的直棂窗上读出,故与现有做法严丝合缝,不另拍标高。
 */
export function buildHistoricCenterBays({ feet, bands, level }) {
  const g = new Group();
  g.name = `facadeAncientCenter_L${level}`;
  let tone = level + 1;
  for (const { face, sill, head } of bands) {
    const idx = face * 3;
    const p0 = feet[idx + 1], p1 = feet[idx + 2];
    g.add(historicCenterBand(p0.pos, p1.pos, {
      y0: sill, y1: head, level, face, tone: tone++,
      opened: ANCIENT_OPENING.cardinalFaces.includes(face),
    }));
  }
  g.userData = { partKey: 'mudWall', level, type: 'facadeEra', era: 'ancient' };
  return g;
}

/** 供 studyMode 登记族色用 —— 读图态下泥墙与木骨也须归族平色 */
export const MUD_STUDY_COLORS = [
  ...MUD_PLASTER.map((m) => [m, 0xe6dfcd]),
  [MUD_FRAME, 0x8a6552],
  [MUD_TRIM, 0xa07a60],
  [MUD_BRACE, 0x9a7a62],
];
