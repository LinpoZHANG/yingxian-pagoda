/**
 * components/roof.js —— 屋檐(八角攒尖式檐面)★ 视觉关键
 * ─────────────────────────────────────────────────────────────
 * 不用 CylinderGeometry 圆台(檐口会平直如碟),一律自定义 BufferGeometry:
 *   1. 举折 —— 屋面纵剖按 plan.js:liftShape 参数化凹曲线生成(坡度沿程严格递增);
 *   2. 翼角 —— 檐口线在八角转角处「起翘 + 冲出」,作用区与衰减由参数控制;
 *   3. 檐口层次 —— 檐椽 + 飞子双层出檐(檐下阴影的来源),转角处扇列;
 *   4. 瓦垄 —— UV 按物理尺度铺设,瓦垄自檐口向脊收敛(与真实一致);
 *   5. 脊饰 —— 八条垂脊 + 脊端戗兽;
 *   6. 顶层攒尖收顶,与塔刹衔接。
 *
 * 实现路径:参数化生成单面网格 → 八面阵列,转角顶点由同一公式算出
 * 故位置完全重合(无裂缝);法线按面片分算,转角处自然成脊(垂脊压缝)。
 */

import {
  Group, Mesh, BufferGeometry, BufferAttribute, Vector3, InstancedMesh, Object3D, CylinderGeometry, BoxGeometry, SphereGeometry, DoubleSide,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOF, SHENG_QI } from '../data/pagodaParams.js';
import { fen, SECTION } from '../data/caifen.js';
import { liftShape } from '../assembly/plan.js';
import { OCT_N, OCT_COS, faceAngle, octagonRing } from '../assembly/octagon.js';
import { TILE, TILE_RIDGE, TILE_END, TERRACOTTA, scaleUV } from '../materials/tile.js';
import { WOOD } from '../materials/wood.js';

/** 望板材质:自木材质派生,双面渲染 */
const UNDER_MAT = WOOD.rafter.clone();
UNDER_MAT.side = DoubleSide;

export const SIN_HALF = Math.sin(Math.PI / OCT_N);   // 半面弦长系数
const NU = 28;   // 沿面宽向的基础分段
const NU_CORNER = 10;  // 角区(起翘区间)内的额外分段 —— 区间只有一两个椽档宽,
                       // 基础分段落进去不到两个采样点,翼角会被网格切成一个尖角
const NV = 12;   // 沿坡向分段(举折曲线)

/** 翼角起翘的绝对幅值(米):[图]cornerLift 按该层檐口尺度缩放 */
const cornerLiftAbs = (P) => ROOF.cornerLift * P.scale;

/**
 * 檐口生起(米)—— 第19轮补链。
 *
 * 檐口线在起翘区之外并非严格水平:它随柱头生起而微升。[法]三间之面
 * 当心间柱不生起、至角生起全额,故 **当心间水平、生起全发生在次间**。
 * 与柱头用**同一条插值律**(uFlat = 平柱的面内参数),幅值同为 SHENG_QI,
 * 沿坡向与起翘共用 liftFade —— 仍是单一权重源,不另开一套场。
 *
 * 这一项此前缺失,造成两个后果:
 *   ① 剖面锚在角柱标高而橑檐枋随柱生起,平柱处瓦面比枋高出一个生起;
 *   ② 檐口在起翘区外严格水平,斜视时那段纯粹的透视下行无任何抵消。
 */
/**
 * 角方位权重 hipWeight —— 第20轮「垂脊绷直」。
 *
 * 举折的凹曲线是**面心**的形态:那里的椽逐架搭在槫上,自然成凹。
 * 角方位不是这样 —— 那里压着一根**通直的大角梁**,自转角铺作直挑到檐口角尖,
 * 剖面被它绷成一条直弦,只有末端的仔角梁再翘一点。
 * 旧写法把同一条凹曲线无方位差别地用到全部方位,角方位母线 = 凹曲 + 末端起翘,
 * 两者叠加即成波浪(实测对弦偏离 0.14~0.68 m,五层出现符号变号)。
 *
 * 衰减域取**一个开间**(次间:自平柱 uFlat 到角柱),[估];
 * 待版18-19 精读后按图转 [图]。两端导数为零(smoothstep),故不引入折痕。
 */
function hipWeight(u, uFlat = 0) {
  const a = Math.min(1, Math.abs(u));
  if (a <= uFlat) return 0;
  const t = (a - uFlat) / Math.max(1 - uFlat, 1e-6);
  return t * t * (3 - 2 * t);
}

export function shengQiAt(u, uFlat = 0) {
  const a = Math.min(1, Math.abs(u));
  if (a <= uFlat) return 0;
  return SHENG_QI * (a - uFlat) / Math.max(1 - uFlat, 1e-6);
}

/**
 * 翼角作用沿坡向的衰减(第15轮:承托传力,不是皮肤场)。
 *
 * 檐椽段(橑檐枋 → 檐口)是一根**直椽**:它的内端坐在生头木上、外端就是檐口,
 * 整段随生头木**平移**抬起,幅值沿段内**恒定** —— 旧写法 (1−v)^k 在这一段里
 * 就开始衰减,等于把直椽掰弯,还让橑檐枋背处只剩 20~66% 的起翘,
 * 于是角区椽扇比承托线高出 0.15~0.49 m 而中间空无一物(第15轮实测)。
 * 起翘自橑檐枋**向内**才开始消散,到上口归零。
 *
 * @returns {number} 0..1,乘以 cornerLiftAbs 即该点的起翘量
 */
export function liftFade(P, v) {
  const vL = P.vLiao ?? 0;
  if (v <= vL) return 1;                       // 檐椽段:直椽整体平移
  const t = (v - vL) / Math.max(1 - vL, 1e-6);
  // 消散函数在 t=0 处必须**导数为零**,否则起翘量在橑檐枋那条线上一阶不连续,
  // 正身—翼角过渡就会出现一道折痕(第15轮断言六实测跳变 5.3~6.2°)。
  // smoothstep 的导数两端皆零,再取幂仍为零(链式法则),故 cornerFade 仍可调形。
  const sm = t * t * (3 - 2 * t);
  return Math.pow(1 - sm, ROOF.cornerFade / 2);   // 举折段:C1 连续地消散
}

/**
 * 生头木顶面相对橑檐枋背的高度(米)—— **承托线的唯一来源**。
 * 皮肤、椽、生头木三者都从这里取值,不许各自再算一遍。
 */
export const shengTouAt = (P, u) => cornerLiftAbs(P) * cornerWeight(u, P.cornerZone);

/**
 * 翼角作用权重:面中段为 0,自**末开间**起以 smoothstep 平滑升至 1。
 * 起坡点 z 取该层平柱的面内参数(即末开间的起点),故起翘是「自末开间起坡」
 * 的连续曲线,而非角尖突踢;z 由柱网反解,不再是估值。
 */
export function cornerWeight(u, zone) {
  const a = Math.min(1, Math.abs(u));
  const z = zone ?? 0.85;
  if (a <= z) return 0;
  const t = (a - z) / (1 - z);
  // ★ t²,不是 smoothstep(第17轮)。两端都要求导数为零的曲线**必然有拐点**,
  //   拐点之后那一段是凹的 —— 檐口线在角尖前「落平」,与前面的陡升合读成一个 S,
  //   就是用户标注的「先凹后翘」。版18 的翼角到角尖**仍在上扬**,不落平。
  //   t² 满足:起点 w=0、w'=0(与平直段 C1 相接,不起折痕,断言六照旧);
  //           角尖 w=1、w'=2(仍在上扬,无凹段,升率单调递增)。
  //   角尖处相邻两面各自以非零斜率到达 → 转角处成一条**棱**,那正是垂脊所在,
  //   smoothstep 把它抹平反而是错的。
  return t * t;
}

/**
 * ★ 屋面剖面的唯一来源(single source of truth)。
 * 举折折线 + 翼角起翘冲出 + 局部抬升 + 上缘收口,四项修正全在这一个函数里。
 * **瓦面皮肤与全部屋架构件(椽/飞子/望板/檐口封边/垂脊)一律由此取点**,
 * 任何构件都不许在自己内部另算坡线 —— 双放线一旦脱节就会互相穿模。
 *
 * @param {number} fi 面序号  @param {number} u 面内参数 [-1,1](±1 = 转角)
 * @param {number} v 坡向参数 [0,1](0 = 檐口,1 = 上口/攒尖)
 */
/**
 * 剖面高程 y(r) —— 两段式,由两个锚点定死:
 *   r ≥ 橑檐枋半径:**直线**(檐椽 + 飞子的实跑),自橑檐枋背落到实测檐口;
 *                   r 超出檐口时继续沿该直线外推(飞子挑出的那一段);
 *   r < 橑檐枋半径:举折凹曲线,自橑檐枋背升到上口。
 * 屋面本就搭在橑檐枋上,型线锚在那里,铺作与瓦面天然不打架 —— 无须人为抬升。
 */
function sectionY(P, r) {
  if (r >= P.liaoyanR) {
    const f = (P.eaveR - r) / (P.eaveR - P.liaoyanR || 1);
    // 用**面心**檐口标高:实测 eaveY 是角尖,翼角起翘会在下面把角尖抬回 eaveY
    return P.eaveYFace + (P.liaoyanY - P.eaveYFace) * f;   // f<0 即檐口之外,自然外推
  }
  // 举折段:自变量自橑檐枋向内归一,型线为 liftShape(解析单调)
  const u = P.liaoyanR > 0 ? (P.liaoyanR - r) / P.liaoyanR : 0;
  const den = liftShape(P.uTop, P.beta);
  const g = den > 1e-12 ? liftShape(u, P.beta) / den : 0;
  return P.liaoyanY + (P.topY - P.liaoyanY) * Math.max(0, Math.min(1, g));
}

/** 面心剖面在半径 r 处的瓦面标高(构件放线的唯一入口之一)*/
export const roofYAtRadius = (P, r) => sectionY(P, r);

export function surfacePoint(fi, u, v, P, out = new Vector3()) {
  const r = P.eaveR + (P.topR - P.eaveR) * v;
  const a = faceAngle(fi);
  // 面内基点:边心距上偏移 u × 半弦长
  const apo = r * OCT_COS, half = r * SIN_HALF;
  const nx = Math.sin(a), nz = Math.cos(a);
  let x = nx * apo + Math.cos(a) * (u * half);
  let z = nz * apo - Math.sin(a) * (u * half);

  // 檐口处的抬升总量(生起 + 起翘),两种形态共用同一个值 —— 仍是单一权重源
  const fade = liftFade(P, v);
  const bump0 = shengQiAt(u, P.uFlat ?? 0)
    + cornerLiftAbs(P) * cornerWeight(u, P.cornerZone);

  // ① 面心形态:举折凹曲线(+ 沿坡衰减的抬升)
  let yFace = sectionY(P, r);
  // 上缘收口:升到收口标高即转平。不改举折坡度、不动檐口,只削平上缘,
  // 使上层平座铺作的出跳臂永远坐在瓦面之上(见 plan.js solveRoof)
  if (P.closeY !== null && P.closeY !== undefined && yFace > P.closeY) yFace = P.closeY;
  yFace += bump0 * fade;

  // ② 角方位形态:大角梁把剖面绷成**两锚直弦**(檐口角点 → 上口角点)。
  //    v 就是半径上的线性参数,故直弦即对 v 线性插值;两个锚点分文不动。
  //    只绷举折段的变体试过:断言七干净,但对单弦的偏离 0.09~0.31 m(橑檐枋处一个折点),
  //    与「垂脊应读作一条直线」的图证不符,故取通弦。
  const yEave = P.eaveYFace + bump0;
  const yHip = yEave + (P.topY - yEave) * v;

  // ③ 按方位混合:角部取直弦,向面心 C1 衰减到凹曲线
  const hw = hipWeight(u, P.uFlat ?? 0);
  let y = yFace + (yHip - yFace) * hw;
  if (P.closeY !== null && P.closeY !== undefined && y > P.closeY) y = P.closeY;

  // 翼角冲出:只改平面位置,不参与任何高程查询
  const w = cornerWeight(u, P.cornerZone) * fade;
  if (w > 0) {
    const len = Math.hypot(x, z) || 1;
    const k = 1 + ((P.cornerOut ?? 0) * w) / len;
    x *= k; z *= k;
  }
  return out.set(x, y, z);
}

/**
 * 屋面剖面接口:构件放线的唯一入口。
 * point() 取瓦面皮肤;under() 取「瓦面之下 drop 米」——
 * 所有屋架构件必须用 under(),drop 至少为一个瓦厚,否则构件会顶穿瓦面。
 */
export function createRoofSection(P) {
  return {
    P,
    point: (fi, u, v, out = new Vector3()) => surfacePoint(fi, u, v, P, out),
    under(fi, u, v, drop, out = new Vector3()) {
      surfacePoint(fi, u, v, P, out);
      out.y -= drop;
      return out;
    },
    /** 某半径对应的坡向参数 v(檐口 0,上口 1)*/
    vAtRadius: (r) => (P.topR === P.eaveR ? 0
      : Math.min(1, Math.max(0, (r - P.eaveR) / (P.topR - P.eaveR)))),
  };
}

/**
 * 直杆弦对凹剖面的最大亏欠(垂距)。
 * 举折与翼角冲出都使剖面外凸/内凹,直杆两端贴合时中段必然抬起;
 * 量出这个量再整体下压,即可让整根杆都待在瓦面之下,而不必把杆打断成多段。
 * (檐椽只跨檐口出挑这一「架」,故无须逐架分段;若日后椽跨越多架,
 *  应改为按檩位分段,每段各自调用本函数。)
 */
export function chordSag(sec, fi, u, vIn, drop, halfU = 0, samples = 10) {
  const p = new Vector3(), q = new Vector3();
  let worst = 0;
  // 翼角处剖面沿「面宽向」也是弯的,故构件的左右两边也要各扫一遍
  for (const du of halfU > 0 ? [-halfU, 0, halfU] : [0]) {
    const uu = Math.max(-1, Math.min(1, u + du));
    const a = sec.under(fi, uu, vIn, drop, new Vector3());
    const b = sec.under(fi, uu, 0, drop, new Vector3());
    for (let i = 0; i <= samples; i++) {
      const f = i / samples;
      p.lerpVectors(a, b, f);
      // 弦上该点对应的坡向参数:由半径反查,避免用 f 直接当 v(两者非线性)
      const r = Math.hypot(p.x, p.z);
      q.copy(sec.under(fi, uu, sec.vAtRadius(r), drop, q));
      worst = Math.max(worst, p.y - q.y);
    }
  }
  return worst;
}

/**
 * 坡向的取样序列。
 * ★ 剖面是折线:举折型线的折点、局部抬升的峰、上缘收口的转平点,都是**折角**。
 * 均匀取样会从折角上直接跨过去 —— 抬升峰若落在两行之间,瓦面就压根不会鼓起来,
 * 铺作照样穿出。故取样必须包含剖面的全部折点,再以均匀行补足密度。
 */
/**
 * 沿面宽向的采样 u —— 基础均布 + **角区加密**。
 * 第16轮把起翘区间收窄到最后一两个椽档(版18 图证),基础均布在区间内不足两点,
 * 网格会把「短促而流畅的一挑」渲染成折线尖角。故在 [zone,1] 与 [−1,−zone] 内补点。
 */
function uSamples(P) {
  const set = new Set();
  for (let i = 0; i <= NU; i++) set.add((i / NU) * 2 - 1);
  const z = P.cornerZone ?? 0.85;
  for (let i = 0; i <= NU_CORNER; i++) {
    const t = z + (1 - z) * (i / NU_CORNER);
    set.add(t); set.add(-t);
  }
  // 角方位混合域(一个开间)也要加密,否则绷直段会被网格切成折线
  const uf = P.uFlat ?? 0;
  for (let i = 0; i <= NU_CORNER; i++) {
    const t = uf + (1 - uf) * (i / NU_CORNER);
    set.add(t); set.add(-t);
  }
  return [...set].sort((a, b) => a - b);
}

function vSamples(P) {
  const set = new Set([0, 1]);
  const vOf = (r) => (P.topR === P.eaveR ? 0 : (r - P.eaveR) / (P.topR - P.eaveR));
  const put = (v) => { if (v > 1e-6 && v < 1 - 1e-6) set.add(v); };
  // 举折段已是解析光滑曲线,无折点可插;只需沿坡加密(见末尾的 NV 均布)
  put(vOf(P.liaoyanR));                                   // 檐口段与举折段的折角
  if (P.closeY !== null && P.closeY !== undefined) {            // 收口转平点
    let lo = 0, hi = 1;
    const yAt = (v) => surfacePoint(0, 0, v, P, new Vector3()).y;
    if (yAt(1) >= P.closeY - 1e-6) {
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (yAt(m) < P.closeY) lo = m; else hi = m; }
      put(lo); put(hi);
    }
  }
  for (let i = 0; i <= NV; i++) set.add(i / NV);
  return [...set].sort((a, b) => a - b);
}

/** 沿坡向累计弧长(取面中线),供瓦垄纵向 UV */
function slopeArc(P, vs) {
  const arc = [0];
  const a = new Vector3(), b = new Vector3();
  surfacePoint(0, 0, vs[0], P, a);
  for (let j = 1; j < vs.length; j++) {
    surfacePoint(0, 0, vs[j], P, b);
    arc.push(arc[j - 1] + a.distanceTo(b));
    a.copy(b);
  }
  return arc;
}

/** 单面屋面片(索引网格,法线在面片内平滑、面片之间成脊) */
function facePatch(fi, P, arc, yOffset, flip, vs, us) {
  const NVv = vs.length - 1, NUu = us.length - 1;
  const pos = new Float32Array((NUu + 1) * (NVv + 1) * 3);
  const uv = new Float32Array((NUu + 1) * (NVv + 1) * 2);
  const idx = [];
  const p = new Vector3();
  const tileU = ROOF.tiles.longSpacing * 6;    // tileTexture 一个循环含 6 垄
  const tileV = ROOF.tileLap * 7;              // 纹理一个循环含 7 道搭接
  const halfEave = P.eaveR * SIN_HALF;

  for (let j = 0; j <= NVv; j++) {
    for (let i = 0; i <= NUu; i++) {
      const u = us[i];
      surfacePoint(fi, u, vs[j], P, p);
      const k = (j * (NUu + 1) + i);
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y + yOffset; pos[k * 3 + 2] = p.z;
      // 瓦垄沿坡向连续:U 只随 u 变(垄自檐口向脊自然收敛)
      uv[k * 2] = (u * halfEave) / tileU;
      uv[k * 2 + 1] = arc[j] / tileV;
    }
  }
  for (let j = 0; j < NVv; j++) {
    for (let i = 0; i < NUu; i++) {
      const a = j * (NUu + 1) + i, b = a + 1, c = a + NUu + 1, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 檐口封边:瓦面与望板之间的一圈立面(檐口厚度,阴影关键) */
function eaveFascia(fi, P, thickness, us) {
  const pos = [], uv = [], idx = [];
  const p = new Vector3();
  const halfEave = P.eaveR * SIN_HALF;
  const tileU = ROOF.tiles.longSpacing * 6;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    surfacePoint(fi, u, 0, P, p);
    pos.push(p.x, p.y, p.z, p.x, p.y - thickness, p.z);
    uv.push((u * halfEave) / tileU, 0, (u * halfEave) / tileU, thickness / tileU);
  }
  for (let i = 0; i < us.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 瓦当 + 滴水 —— 檐口一周的瓦头,与角尖的**套兽**。
 *
 * 实景照上,檐口那一排**白**是全塔最显眼的一条线:瓦头经石灰勾抹,
 * 与深灰瓦面对比强烈,一层层把出檐勾出来。模型里此前只有一道深色封边,
 * 檐口整条消失在瓦面里(用户第48轮:「屋脊的端口可以细化了」)。
 *
 * 三件:
 *   瓦当  筒瓦头,圆;沿瓦垄间距排,一垄一个;
 *   滴水  板瓦头,垂尖;排在两瓦当之间,略低、略外挑;
 *   套兽  仔角梁头上套的兽头,只在八个角 —— 那是「脊的端口」最外的一件。
 *
 * 全部走 InstancedMesh:一檐两三百个,六檐一千五,逐个 Mesh 会把批次打满。
 */
function eaveTiles(P, level) {
  const g = new Group();
  g.name = `eaveTiles_L${level}`;
  const step = ROOF.tiles.longSpacing;
  /**
   * 瓦当直径 = **0.48 垄距** ≈ 20 cm —— 筒瓦头的实际宽度。
   *
   * ★ 这个数我来回改了四次(0.46 → 0.36 → 0.30 → 0.84 → 0.48),记档为戒:
   *   第一版 0.46 其实就在对的量级上,但瓦当整个**浮在瓦面之上**,
   *   看着像一串珠子。我把「看着太大」判成了尺寸问题,一路往小收到 0.30,
   *   结果成了一排稀疏的白点;再矫枉过正拉到 0.84,瓦当大到盖住整个檐口和椽。
   *   真正的毛病自始至终是**位置** —— 瓦当该嵌在檐口断面里、只露半个头。
   *   **「看起来太大」可能是位置错了,不是尺寸错了。
   *     一个参数反复来回,通常说明在调的不是出问题的那个参数。**
   */
  const dia = step * 0.48;
  const p = new Vector3(), q = new Vector3(), t = new Vector3();

  /**
   * 瓦当要**落在瓦垄上** —— 而瓦垄是**贴图**画的,不是几何(用户第49轮:「不能错位」)。
   * 所以位置不能自己按弧长均布,必须**用瓦面 UV 的同一个公式反解**:
   *
   *   瓦面:U = (u · halfEave) / tileU,  tileU = 垄距 × 6(一个纹理循环含 6 垄)
   *   贴图:垄坐标 = U × 6 = (u · halfEave) / 垄距;垄内相位 f = frac(垄坐标)
   *         f < 0.62 是板瓦(凹),f ≥ 0.62 是**筒瓦(凸)**,峰在 f ≈ 0.81
   *
   * 瓦当正是**筒瓦的端头**,故取 f = 0.81 那一列:
   *   u = (k + 0.81) · 垄距 / halfEave,  k 取遍使 u 落在檐口内的整数。
   *
   * 这样瓦当与贴图上的每一条筒瓦**逐条对齐**;垄距、檐口半径、纹理循环数
   * 任何一个改了,两边同时跟着变 —— 因为它们现在用的是同一个式子。
   */
  const halfEave = P.eaveR * SIN_HALF;
  const RIDGE_PHASE = 0.81;                    // 筒瓦(凸)在垄内的相位中心
  /** ★ 仍要**避开面的两端**:相邻两面在角部各自采到 u = ±1 附近,
   *   两面一叠角上就是双倍密度;角部由套兽收口,不靠瓦当去补。 */
  const EDGE = 0.06;
  const pts = [];
  for (let fi = 0; fi < OCT_N; fi++) {
    const kLo = Math.ceil((-1 + EDGE) * halfEave / step - RIDGE_PHASE);
    const kHi = Math.floor((1 - EDGE) * halfEave / step - RIDGE_PHASE);
    for (let k = kLo; k <= kHi; k++) {
      const u = (k + RIDGE_PHASE) * step / halfEave;
      surfacePoint(fi, u, 0, P, p);
      surfacePoint(fi, u, 0.02, P, q);         // 稍往坡上一点,求朝外的方向
      t.subVectors(p, q).normalize();          // 檐口的外挑方向(含起翘的倾角)
      pts.push({ pos: p.clone(), dir: t.clone() });
    }
  }

  const d = new Object3D();
  /** 瓦当:圆筒头,轴沿外挑方向 */
  const wd = new InstancedMesh(
    // 12 段而非 8:瓦头是圆的,八棱柱在近景读成一块多面体
    new CylinderGeometry(dia / 2, dia / 2, dia * 0.42, 16), TILE_END, pts.length);
  /**
   * ★ 这里曾经有过滴水(板瓦头),**已撤**。
   *   我用 BoxGeometry 做的垂尖在这个尺度上读成一排小方块 —— 形状不对,
   *   远看只是噪点,近看更假。滴水的形制(如意形垂尖)要另做几何才对得起,
   *   在那之前**不如没有**:一件形状不对的构件,比缺这件构件更误导。
   */
  pts.forEach((it, i) => {
    const look = it.pos.clone().add(it.dir);
    // 瓦当:圆柱默认轴沿 +Y,先转成沿外挑方向
    /**
     * ★ 只沿**檐口方向**外挑,不再额外下移。
     *   `it.dir` 本身已含向下的分量(它是从坡上指向檐口的方向),
     *   再 `setY(-0.32·dia)` 就把瓦当压到了**檐口封边与飞子之下** ——
     *   于是它与瓦面之间隔出一条深带,看着像挂在檐外的一串灯笼(用户第49轮的图)。
     *   瓦当是**骑在瓦面末端上**的,不在它下面。
     */
    d.position.copy(it.pos).addScaledVector(it.dir, dia * 0.22);
    d.lookAt(look); d.rotateX(Math.PI / 2);
    d.scale.set(1, 1, 1); d.updateMatrix();
    wd.setMatrixAt(i, d.matrix);
  });
  wd.instanceMatrix.needsUpdate = true;
  for (const m of [wd]) {
    m.castShadow = m.receiveShadow = true;
    m.userData = { partKey: 'waDang', level, type: 'roof',
      instances: Array(pts.length).fill({ partKey: 'waDang' }) };
    g.add(m);
  }

  /**
   * ★ 套兽**不在这里生成**(第49轮移走)。
   *   它套在**仔角梁头**上,而角梁的端点只有 `eavecorner.js:buildJiaoLiang()` 知道;
   *   我此前按屋面皮肤的角尖 `surfacePoint(fi,1,0)` 另算了一遍,
   *   结果高了 0.33~0.72 m、内了 0.30 m,角梁头那截木料就露在檐角外。
   *   **一个构件依附于谁,就该由谁来定位。**
   */

  g.userData = { partKey: 'waDang', level, type: 'roof' };
  return g;
}

/** 垂脊:沿转角线(u=1)铺一道三棱脊,压住两面接缝 */
/**
 * 垂脊末端让给脊头的那一段(v 参数)。
 * ★ 版18 详图:垂脊到末端并不是一刀切断,最后一节是一件**圆头的横卧收头**
 *   (筒瓦状,端面浑圆),兽坐在它上方偏后,再往外才是檐口的瓦当。
 *   所以脊本身要在这里停住,把这一段让出来 —— 否则脊的三角断面会从收头周围支出来。
 *   `hipRidge()` 与 `ridgeEnd()` 共用这个数,改一处两处都跟着走。
 *   取 0.145 而非 0.085:让出的段太短,筒身(0.17 m)比圆头(R=0.19 m)还短,
 *   整件就读成**一个球挂在脊端**,而不是一节横卧的筒瓦。
 */
const RIDGE_END_V = 0.145;

function hipRidge(fi, P, yOffset) {
  const w = ROOF.hipRidgeW / 2, h = ROOF.tiles.ridgeH;
  const pos = [], uv = [], idx = [];
  const p = new Vector3(), q = new Vector3(), t = new Vector3();
  const N = NV * 3;
  const tileV = ROOF.tileLap * 7;
  /**
   * ★ 顶层攒尖的上口收在塔心(topR = 0),八条垂脊若一路铺到 v=1,
   *   就会**全部汇聚到轴心、埋进砖石刹基里**。实物上它们收头在刹基四周。
   *   `P.ridgeStopR` 给定时,半径一降到它就停铺 —— 由放样侧按刹基下口径给。
   */
  const stopR = P.ridgeStopR ?? 0;
  let NN = N;
  for (let j = 0; j <= N; j++) {
    const v = RIDGE_END_V + (1 - RIDGE_END_V) * (j / N);   // ★ 起点让给脊头
    surfacePoint(fi, 1, v, P, p);
    // 脊的横向:沿面内方向(指向本面内侧)
    surfacePoint(fi, 1 - (1 - (P.cornerZone ?? 0.85)) / NU_CORNER, v, P, q);
    t.subVectors(q, p).setY(0).normalize();
    const cy = p.y + yOffset;
    pos.push(
      p.x + t.x * w, cy - h * 0.15, p.z + t.z * w,   // 内侧脚
      p.x, cy + h, p.z,                               // 脊顶
      p.x - t.x * w, cy - h * 0.15, p.z - t.z * w,   // 外侧脚(邻面)
    );
    const vv = (v * P.rise * 1.4) / tileV;
    uv.push(0, vv, 0.5, vv, 1, vv);
    if (stopR > 0 && Math.hypot(p.x, p.z) <= stopR) { NN = j; break; }
  }
  for (let j = 0; j < NN; j++) {
    const a = j * 3, b = a + 3;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
    idx.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 戗兽:垂脊下端的小兽(高度简化为分段收束的体块,远看只需剪影正确) */
function ridgeBeast(fi, P, yOffset) {
  const p = surfacePoint(fi, 1, 0.06, P, new Vector3());
  const q = surfacePoint(fi, 1, 0.16, P, new Vector3());
  const dir = new Vector3().subVectors(q, p).normalize();   // 指向脊内(上坡)
  const h = ROOF.tiles.ridgeH;

  /**
   * 戗兽:**一件**合并几何,面朝檐口蹲在垂脊下端。
   *
   * ★ 第50轮重做。旧件是四个分离的 Mesh(座/躯体/首部/吻)各自定位,毛病有三:
   *   ① **件间有缝** —— 躯体顶在 0.70h、首部底在 0.80h,中间空 0.10h(3.5 cm),
   *      兽的头是浮在身子上方的;
   *   ② 躯体用四棱台 + rotateY(45°),棱正对观察者,读作**两根下垂的尖刺**;
   *   ③ 每件都 `.setY()` 定死高度,而 dir 沿垂脊上坡自带 y 分量、各件的 along 又是负值,
   *      于是它们被钉在同一水平面上、脊面却在下坡 —— 整只兽散成一堆浮在瓦面上的方块。
   *
   *   现在合并成一件,相邻体块**必须重叠**(座↔身↔头↔吻每处都咬进去),
   *   一次定位一次朝向,散不开。
   *
   * 局部坐标:+z 朝脊内(上坡),−z 朝檐口;+y 向上;原点在脊面上。
   */
  const box = (x, y, z, sx, sy, sz, rx = 0) => {
    const b = new BoxGeometry(sx, sy, sz);
    if (rx) b.rotateX(rx);
    b.translate(x, y, z); return b;
  };
  const ball = (x, y, z, ax, ay, az) => {
    const b = new SphereGeometry(1, 8, 6);
    b.scale(ax, ay, az); b.translate(x, y, z); return b;
  };
  const parts = [
    box(0, h * 0.13, 0, h * 0.72, h * 0.30, h * 0.95),                     // 座:骑在脊顶的矮座
    box(0, h * 0.52, -h * 0.04, h * 0.56, h * 0.62, h * 0.74, -0.30),      // 躯:前倾的蹲姿(要看得见,别被首吃掉)
    ball(0, h * 0.92, -h * 0.20, h * 0.22, h * 0.24, h * 0.25),            // 首:小一号,否则整只兽读成一个球
    ball(0, h * 0.80, -h * 0.42, h * 0.14, h * 0.12, h * 0.22),            // 吻:明显前伸,给出朝向
    box(-h * 0.15, h * 1.08, -h * 0.10, h * 0.08, h * 0.20, h * 0.09, -0.4), // 左耳
    box(h * 0.15, h * 1.08, -h * 0.10, h * 0.08, h * 0.20, h * 0.09, -0.4)   // 右耳
  ];

  const m = new Mesh(mergeGeometries(parts, false), TERRACOTTA);
  /* ★ 抬到**垂脊顶面**。`hipRidge()` 的脊顶在瓦面上方 +1.0h、两脚在 −0.15h;
   *   旧写法按**瓦面**定位,座顶只到 +0.28h —— 整只兽埋在脊里,
   *   脊的三角截面从它中间穿出来,读作「一个 ∧ 形加两根下垂的尖刺」。
   *   资料方圈出的就是这个。座底取 0.83h,略低于脊顶,骑住脊尖。 */
  m.position.copy(p);
  m.position.y += yOffset + h * 0.85;
  m.lookAt(m.position.clone().add(dir));      // +z 对齐上坡方向
  m.castShadow = m.receiveShadow = true;
  m.userData = { partKey: 'ridgeBeast', level: P.level ?? 0, type: 'ridge' };
  return m;
}


/**
 * 脊头:垂脊外端的收头(当沟 / 圭角的简化型)。
 * 脊在檐口端原先是直接切断的,断面朝天。补一块前倾的收头压住它。
 */
function ridgeEnd(fi, P, yOffset) {
  const p = surfacePoint(fi, 1, 0, P, new Vector3());          // 脊的最外端(檐口)
  const q = surfacePoint(fi, 1, RIDGE_END_V, P, new Vector3()); // 垂脊起点
  const dir = new Vector3().subVectors(q, p).normalize();
  const span = p.distanceTo(q);
  const h = ROOF.tiles.ridgeH;

  /**
   * 脊头(垂脊末端收头)—— **圆头筒瓦形**,不是方块。
   *
   * ★ 第50轮按版18 详图重做。旧件是 `BoxGeometry`:一个方盒子扣在脊端,
   *   资料方要求「不要方块收头」。详图上这一件是横卧的一节筒瓦,
   *   端面浑圆、略粗于脊身,与脊交界处有一道箍(线脚)。
   *
   * 半径按脊的三角断面反算:断面顶在 +1.0h、脚在 −0.15h、半宽 hipRidgeW/2。
   * 取等效圆心 y=0.45h、R=0.55h —— 顶正好到 1.0h(与脊顶齐),
   * 横向 1.10h ≈ 0.385 m,只比脊宽 0.34 m 饱满 13%。
   * (头一版取 R=0.62h,直径 0.43 m,粗得把兽都压住了 —— 收头比脊身饱满一点就够,
   *  不是越大越像收头。断面的两只脚落在 −0.15h、埋在瓦面下,不必罩。)
   *
   * 局部坐标:+z 沿脊上坡(lookAt 对齐 dir),圆头在 z=0 即檐口端。
   */
  /* 截面是**拱形**,不是圆:顶到脊高、宽同脊身、底埋进瓦面。
   * 用椭圆柱 —— 圆截面会让端头读成一个球(前两版都栽在这)。
   * 半轴要按脊截面的**实际中心和半高**取,不是拿全脊高当半轴 ——
   * 脊截面顶 +1.0h、脚 −0.15h,故中心 y=0.425h、半高 0.575h。
   * (拿 ay=1.0h、拱心放在瓦面,拱就成了半米高的竖立鸡蛋。)
   *   ax = 半宽(略宽于脊身)  ay = 半高  az = 端头的前后半轴 */
  const ax = ROOF.hipRidgeW / 2 * 1.10;
  const ay = h * 0.575;
  const az = h * 0.50;
  const L = Math.max(h * 0.5, span - az);

  const cap = new SphereGeometry(1, 16, 10);
  cap.scale(ax, ay, az);
  cap.translate(0, 0, az);                     // 最前端落在 z=0,不伸出檐口
  const barrel = new CylinderGeometry(1, 1, L, 16);
  barrel.rotateX(Math.PI / 2);                 // 轴 +y → +z,截面落到 xy
  barrel.scale(ax, ay, 1);
  barrel.translate(0, 0, az + L * 0.5);
  const ring = new CylinderGeometry(1, 1, h * 0.13, 16);   // 箍:一道线脚
  ring.rotateX(Math.PI / 2);
  ring.scale(ax * 1.13, ay * 1.10, 1);
  ring.translate(0, 0, az * 1.45);

  const m = new Mesh(mergeGeometries([cap, barrel, ring], false), TILE_RIDGE);
  m.position.copy(p);
  m.position.y += yOffset + h * 0.425;   // 拱心 = 脊截面中心
  m.lookAt(m.position.clone().add(dir));
  m.castShadow = m.receiveShadow = true;
  m.userData = { partKey: 'jiTou', level: 0, type: 'ridge' };
  return m;
}


/**
 * 檐椽 + 飞子:自橑檐枋挑出至檐口,转角处扇列(翼角椽)。
 * 这层是檐下深影的来源,缺了屋檐就「飘」。
 */
function rafters(P, soffit) {
  const g = new Group();
  const dChuan = fen(SECTION.chuanDia);
  const gap = fen(SECTION.chuanGap);
  const feiW = fen(SECTION.feiziW);
  const sec = createRoofSection(P);
  const vIn = sec.vAtRadius(soffit.innerR);        // 橑檐枋所在的坡向参数

  // 自瓦面向下逐层落位:瓦厚 → 飞子 → 檐椽。
  // 构件顶面一律低于瓦面至少一个瓦厚,故不可能顶穿(自检断言据此)。
  // 用「半对角」而非「半宽」作让量:飞子是带倾角的方料,倾斜后顶棱比半宽更高,
  // 半对角覆盖任意倾角,余量只有几厘米,肉眼不可辨。
  // 对瓦面的净空用**半对角**(斜置方料的顶棱上界);而飞子对檐椽是**坐于**关系,
  // 落座用的是断面**半高** —— 两者混用会让飞子悬在椽背上方 2.3 cm(第15轮断言四抓出)。
  const feiClear = feiW * Math.SQRT1_2;
  const dropChuan = ROOF.thickness + feiClear * 2 + dChuan / 2;
  const dropFei = dropChuan - dChuan / 2 - feiW / 2;   // 飞子底面 = 檐椽顶面

  /**
   * ★ 檐口重锚(第26轮裁决)。
   * 旧锚:v=0 = **檐椽头**,飞子再自那里沿杆轴外挑半个飞子长 ——
   *   于是 ① 瓦面止于椽头,整层飞子(0.39~0.60 m)裸在瓦外;
   *        ② 模型最外可见边缘是飞子尖,比 [图]eaveW 宽 2.3~4.3%,六层全超 1.5% 阈。
   * 新锚:**v=0 = 飞子尖**。[图]剪影量的就是最外可见边缘,那就是飞子头;
   *   檐椽与飞子一律由这条线**向内反排**:
   *     飞子出 : 椽出 = feiziRatio : 1   [法]
   *     椽头半径 = 檐口半径 − 檐出 × feiziRatio/(1+feiziRatio)
   *   eaveR / 放样表 / 竖向锚点**一律不动** —— 重锚只改椽与飞子在这条线内的排布。
   */
  const feiShare = SECTION.feiziRatio / (1 + SECTION.feiziRatio);
  const feiOutR = (P.eaveR - soffit.innerR) * feiShare;      // 飞子出(径向)
  const vHead = feiOutR / Math.max(P.eaveR - P.topR, 1e-6);  // 椽头所在的坡向参数

  const pOut = new Vector3(), pIn = new Vector3(), dir = new Vector3();
  const chuanGeo = new CylinderGeometry(dChuan / 2, dChuan / 2, 1, 6);
  chuanGeo.rotateX(Math.PI / 2);            // 轴向对齐 +Z
  const feiGeo = new BoxGeometry(feiW, feiW, 1);

  // 每面的椽数由面宽与椽中距推出,不另设数
  const per = Math.max(6, Math.round((2 * P.eaveR * SIN_HALF) / gap));
  const total = per * OCT_N;
  const chuan = new InstancedMesh(chuanGeo, WOOD.rafter, total);
  const feizi = new InstancedMesh(feiGeo, WOOD.rafter, total);
  const d = new Object3D();
  let n = 0;

  for (let fi = 0; fi < OCT_N; fi++) {
    for (let i = 0; i < per; i++) {
      const u = ((i + 0.5) / per) * 2 - 1;
      // 两端都走剖面接口:内端在橑檐枋处、外端在檐口,各自沉到椽的中心线。
      // 翼角段的剖面在「冲出」修正下是弯的,而椽是直杆 —— 直线弦会略高于凹曲线。
      // 故沿弦采样量出实际亏欠(垂距),把整根再压下去,弦便整体位于瓦面之下。
      // 构件半宽换算到面内参数 u(半弦长 = r·sin22.5°)
      const halfU = (Math.max(dChuan, feiW) / 2) / (P.eaveR * SIN_HALF);
      // 翼角扇列(第15轮):角区椽的**内端**逐根并到角梁根部,外端仍匀布于檐口 ——
      // 这正是「扇列椽搭靠角梁侧」的做法。归并权重复用角区权重(C1 连续,
      // 起坡点不并、角部全并),故正身段一根不动,过渡无折痕。
      const wf = cornerWeight(u, P.cornerZone);
      const uIn = u + (Math.sign(u) - u) * wf;
      // 亏欠逐端各算:扇列之后内端在 uIn、外端在 u,两处的弦-弧亏欠本就不同。
      // 用同一个值会让内端错开生头木上皮(第15轮断言四实测最大 6.7 cm)。
      const sagIn = chordSag(sec, fi, uIn, vIn, dropChuan, halfU);
      const sag = chordSag(sec, fi, u, vHead, dropChuan, halfU);
      sec.under(fi, uIn, vIn, dropChuan + sagIn, pIn);
      sec.under(fi, u, vHead, dropChuan + sag, pOut);   // 外端 = **椽头**,不再是檐口
      dir.subVectors(pOut, pIn);
      const len = dir.length();
      d.position.copy(pIn).addScaledVector(dir, 0.5);
      d.lookAt(pOut);
      d.scale.set(1, 1, len);
      d.updateMatrix();
      chuan.setMatrixAt(n, d.matrix);

      // 飞子:压在檐椽之上、瓦面之下,自檐口向外再挑一段并微微反翘。
      // 反翘只发生在檐口之外(那里没有瓦面),故不会顶穿。
      const unit = dir.clone().normalize();
      // 飞子沿椽的杆轴外挑(试过改用剖面外推切向:断言七的毫米级下沉分毫未减,
      // 反而让飞子底面扎进椽 2.2 mm,断言四越限 —— 故维持原做法)。
      const unitR = unit;
      // 飞子**坐在檐椽背上**:落位由椽反解,不再各自向剖面取点 ——
      // 两条独立取点在角区会因弦-弧亏欠不同而错开 2~3 cm(第15轮断言四抓出)。
      const ch = Math.hypot(unitR.x, unitR.z) || 1;
      const perpUp = new Vector3(-unitR.y * unitR.x / ch, ch, -unitR.y * unitR.z / ch);
      // 飞子:**与椽共轴**(钉在椽背上,不另取方向),自椽头前后各伸一段:
      //   向外伸到半径 = 檐口半径(即 v=0,剪影锚点),向内等长搭接压在椽背上。
      //   共轴是「叠于」这条接触语义的硬性要求 —— 一旦另取方向,内半段就会扎进椽里
      //   (重锚第一版按剖面取尖点,断言四实测扎入 4.2 cm)。
      const chF = Math.hypot(unit.x, unit.z) || 1;
      const fwd = feiOutR / chF;                        // 沿杆轴前伸到檐口半径
      const feiSeat = pOut.clone().addScaledVector(perpUp, dChuan / 2 + feiW / 2);
      const start = feiSeat.clone().addScaledVector(unit, -fwd);
      const tip = feiSeat.clone().addScaledVector(unit, fwd);
      d.position.copy(start).add(tip).multiplyScalar(0.5);
      d.lookAt(tip);
      d.scale.set(1, 1, start.distanceTo(tip));
      d.updateMatrix();
      feizi.setMatrixAt(n, d.matrix);
      n++;
    }
  }
  chuan.instanceMatrix.needsUpdate = true;
  feizi.instanceMatrix.needsUpdate = true;
  chuan.castShadow = true;
  chuan.userData = { partKey: 'chuan', type: 'rafter' };
  feizi.castShadow = true;
  feizi.userData = { partKey: 'feizi', type: 'rafter' };
  g.add(chuan, feizi);
  return g;
}

/**
 * @param {object} P { eaveR, eaveY, topR, rise, isTop }  ← plan.js 求解结果
 * @param {object} o { level, soffit:{innerR,innerY}, boji:boolean }
 * @returns {Group}
 */
export function buildRoof(P, { level = 0, soffit = null, name = 'roof' } = {}) {
  const g = new Group();
  g.name = name;
  // 起翘量的缩放系数由 plan.js 随剖面一并给出(单源),此处不另算
  const params = { ...P };
  const vs = vSamples(params);
  const us = uSamples(params);
  const arc = slopeArc(params, vs);
  const th = ROOF.thickness;

  const upper = [], lower = [], ridges = [];
  for (let fi = 0; fi < OCT_N; fi++) {
    upper.push(facePatch(fi, params, arc, 0, true, vs, us));
    lower.push(facePatch(fi, params, arc, -th, false, vs, us));
    lower.push(eaveFascia(fi, params, th, us));
    ridges.push(hipRidge(fi, params, 0));
  }

  const tileMat = scaleUV(TILE, 1, 1, 1);
  const roofMesh = new Mesh(mergeGeometries(upper, false), tileMat);
  roofMesh.castShadow = roofMesh.receiveShadow = true;
  roofMesh.userData = { partKey: 'roof', level, type: 'roof' };

  // 望板与檐口封边:双面(仰视看得到,且避免封边朝向判断出错时露空)
  const underMesh = new Mesh(mergeGeometries(lower, false), UNDER_MAT);
  underMesh.castShadow = underMesh.receiveShadow = true;
  underMesh.userData = { partKey: 'wangban', level, type: 'roof' };

  const ridgeMesh = new Mesh(mergeGeometries(ridges, false), TILE_RIDGE);
  ridgeMesh.castShadow = ridgeMesh.receiveShadow = true;
  ridgeMesh.userData = { partKey: 'chuiji', level, type: 'ridge' };

  g.add(roofMesh, underMesh, ridgeMesh);

  if (ROOF.ridgeBeast) {
    for (let fi = 0; fi < OCT_N; fi++) { g.add(ridgeBeast(fi, params, 0)); g.add(ridgeEnd(fi, params, 0)); }
  }
  if (soffit) g.add(rafters(params, soffit));
  g.add(eaveTiles(params, level));   // 檐口瓦当 / 滴水 / 角部套兽

  // 上口收头:非顶层加一道博脊压住屋面与上层柱身的交接。
  // ★ 必须是**环**,不是盘(第35轮)。旧写法用实心 CylinderGeometry,
  //   于是每一道博脊都是一张**直径二十余米、封满全塔平面的盖子**:
  //   一层的那张压在 y=12.05,正扣在十一米大佛的头顶上 —— 用户圈出的
  //   「一楼佛像上空的天花板」就是它(不是平座楼板,楼板还在 19.62)。
  //   博脊本身只是压在屋面与上层柱身交接线上的一道脊瓦,宽度是分米级的;
  //   它从来不该有「内部」。宽度取脊高的 1.6 倍 [估],与垂脊同量级。
  if (!P.isTop && P.topR > 0) {
    const rO = P.topR * 1.012;
    const boji = new Mesh(
      octagonRing(rO, Math.max(0.2, rO - ROOF.tiles.ridgeH * 1.6), ROOF.tiles.ridgeH),
      TILE_RIDGE,
    );
    boji.position.y = P.topY;
    boji.castShadow = boji.receiveShadow = true;
    boji.userData = { partKey: 'boji', level, type: 'ridge' };
    g.add(boji);
  }

  g.userData = { partKey: 'roof', level, type: 'roof' };
  return g;
}
