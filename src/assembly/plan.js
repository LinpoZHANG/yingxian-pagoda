/**
 * assembly/plan.js —— 竖向与平面的求解层(建造前的「放样」)
 * ─────────────────────────────────────────────────────────────
 * 把 data/ 中彼此独立的三组实测锚点(柱环半径、檐口标高/宽度、
 * 平座标高/宽度)解算成一份逐层完整放样表,供 buildStorey / roof /
 * bracket 共用。★ 本文件只做算术,不产生任何几何。
 *
 * 求解原则(全部可追溯,不引入新的自由数值):
 *   1. ★ 竖向骨架由**版3 十四段全链**驱动(CHAIN_NODES):
 *      各明层柱头与暗层柱头的绝对标高直接取链节点,柱高由「柱头 − 柱脚」反解。
 *      原先的 STOREYS[].columnH(2.86,系版17 单处读数推广各层)降为交叉校验,
 *      不再驱动几何 —— 它与链、与檐口都不自洽(见 adjustments.md)。
 *   2. 铺作层高 = caifen.bracketHeight(等级),铺作坐柱头之上 [法];
 *   3. 平座面 = 暗层柱头 + 普拍枋 + 平座铺作**实际**总高(含令栱与地面枋),
 *      由链节点推出;VERTICAL.pingzuo 的剪影读数降为交叉校验。
 *      用实际总高而非结构步进高,否则平座楼板会被斗拱顶穿;
 *   4. 檐口:实测的 eaveY 是**翼角角尖**标高、eaveW 是**立面剪影全宽**。
 *      故面心檐口 = eaveY − 翼角起翘,而外缘半径须由剪影半宽换算 ——
 *      八角在正立面上的最大投影出现在 ±67.5° 的两个顶点,
 *      故「剪影半宽 = 外接半径 × cos22.5°」,不可直接把半宽当半径用
 *      (那会把檐出压掉约 8%,只剩 0.2~0.9 m,椽与飞子根本放不下);
 *   5. 屋面举高 = ROOF.liftRatio × 檐口全宽 [法],若与上层柱身相犯
 *      则压低至相犯标高(屋面必须掩在平座之下);
 *   5a. 屋面剖面分两段,由**两个锚点**定死,不再靠任何人为抬升:
 *      檐口段(橑檐枋 → 檐口)是**直线**——那是檐椽与飞子的实跑;
 *      举折段(橑檐枋 → 上口)才是凹曲线。屋面本就搭在橑檐枋上,
 *      把型线锚在橑檐枋,铺作与瓦面的关系就天然成立,无须再「局部抬升」。
 *   5b. 铺作出跳的「基准半径」不是 柱环半径 + 出跳:铺作的臂沿**面法线**出跳,
 *      而八角的面法线比半径方向偏 22.5°。柱头坐平柱、补间坐面上,其外端的
 *      法距 = 边心距 + 出跳,换算回基准半径要除以 cos22.5°,即
 *      **liaoyanR = 角柱半径 + 出跳 / cos22.5°**。转角铺作的斜出跳加长
 *      1/cos22.5° 后落到同一半径,三种朵位由此对齐(见 adjustments.md §一)。
 *   6. 屋面在橑檐枋处必须高于铺作实际顶面 —— 檐口标高是实测的、铺作总高是
 *      材分推出的,两者本不保证相容。差额以「局部抬升」补足:在橑檐枋半径处
 *      抬 dy,向外至檐口、向内至上口各自线性收敛为 0。檐口实测标高因此不动,
 *      屋面只在檐椽段变陡 —— 这正是真实屋面「檐椽段直、举折段曲」的样子。
 */

import {
  PLATFORM, COLUMN_RINGS, VERTICAL, STOREYS, ROOF, PUZUO, WALL, GLOBAL, ROOF_BUILDUP, EAVE_BUILDUP, CHAIN_NODES, SHENG_QI, FINIAL,
} from '../data/pagodaParams.js';
import {
  bracketHeight, bracketReach, SECTION, fen, PUZUO_RISE, ZUCAI,
} from '../data/caifen.js';
import {
  bracketFullHeight, bracketOuterReach, normalizeConfig,
} from '../components/bracket/assemble.js';
import { OCT_N, faceOffsetForRadius } from './octagon.js';

/** 立面剪影半宽 → 八角外接半径(最大投影在 ±67.5° 顶点,故须除以 cos22.5°)*/
const silR = (eaveW) => eaveW / 2 / GLOBAL.cosOct;
/** 翼角起翘/冲出量的归一基准:取一层檐(参数即按此层调优)*/
const REF_SIL = silR(VERTICAL.eaves.find((e) => e.name === 'L1').eaveW);

/**
 * 由实测剪影全宽解出檐口几何。
 * 剪影半宽 = (外接半径 + 翼角冲出) × cos22.5°,故先除 cos22.5° 得含冲出的角点半径,
 * 再扣掉冲出量得到基准外接半径 —— 这样渲染出来的剪影宽度恰好回到实测值。
 */
/**
 * 起翘区间的起点(面内参数 u)—— 第16轮 版18 图证定案。
 *
 * 旧写法 `bayZone()` 把起坡点定在**末开间**(平柱的切向偏移处),于是起翘要在
 * 半个面宽上缓缓爬升;版18 的檐口线否掉了这条:**完成面檐口以平直为绝对主调**,
 * 一路水平直线走到角,只在角梁根部一带的最后一两个椽档内一挑到位。
 * 故起点由椽档派生:区间越靠角、越短促,中段严格零抬升。
 *
 * @param {number} eaveR 该层檐口基准半径(半弦长 = eaveR·sin22.5°)
 */
/** 平柱的面内参数 u —— 生起插值的折点(当心间水平,生起全在次间)*/
function uFlatOf(cornerR, flatR) {
  if (!flatR) return 0;
  const off = faceOffsetForRadius(cornerR, flatR);
  return Math.min(0.95, off / (cornerR * Math.sin(Math.PI / OCT_N)));
}

function cornerZoneOf(eaveR) {
  const half = eaveR * Math.sin(Math.PI / OCT_N);       // 半弦长
  const band = ROOF.cornerZoneRafters * fen(SECTION.chuanGap);
  return Math.max(0.5, Math.min(0.97, 1 - band / Math.max(half, 1e-6)));
}

/**
 * 面心檐缘的**法距**(边心距)。
 *
 * 【第13轮 冲出仲裁结案】立面剪影的极值出现在角尖 → 角尖R = 剪影半宽 / cos22.5°。
 * 角尖比基准八角多出的那一截就是**平面冲出**,资料方已用各层屋檐平面图轮廓
 * 射线求交独立实测得 [图]0.16 m(见 ROOF.cornerOut 的仲裁链)。故:
 *     基准八角角R = 角尖R − 冲出       ← 只在角部方向扣,扣的是实测真值
 *     面心法距    = 基准角R × cos22.5°
 * 第12轮那版「面心 = 剪影半宽」是把派生数当独立锚,已作废。
 */
const faceEaveApothem = (eaveW) => (silR(eaveW) - ROOF.cornerOut) * GLOBAL.cosOct;

/**
 * 由实测剪影解出檐口几何。
 * 冲出只属角部:基准八角(面心檐缘所在的那一圈)先扣掉实测冲出,
 * roof.js 再把同一个量**只加回角部**(cornerWeight 加权)—— 一扣一加,面心不受影响,
 * 角尖回到剪影实测位置。扣的量一旦不是真值(旧 [估]0.58),面心就被连累。
 */
function eaveGeom(eaveW, eaveY) {
  const rs = silR(eaveW);                       // 角尖R(剪影极值)—— 硬锚
  const scale = rs / REF_SIL;
  const eaveR = faceEaveApothem(eaveW) / GLOBAL.cosOct;   // 基准八角(= 角尖R − 冲出)
  return {
    eaveR,
    cornerOut: rs - eaveR,                      // [图]0.16,只加回角部
    scale,
    // 剖面锚是**瓦面上皮**;而剪影读数量到的是**檐口下皮**(资料方补正),
    // 故须加一个檐口构造厚。若 eaveY 记录的是角尖,再减去起翘量。
    eaveYFace: (VERTICAL.eaveYSemantics === 'cornerTip'
      ? eaveY - ROOF.cornerLift * scale
      : eaveY) + EAVE_BUILDUP,
    eaveYSoffit: VERTICAL.eaveYSemantics === 'cornerTip'
      ? eaveY - ROOF.cornerLift * scale
      : eaveY,
  };
}

const ring = (name) => COLUMN_RINGS.find((r) => r.name === name);
const eaveOf = (name) => VERTICAL.eaves.find((e) => e.name === name);
const pzOf = (name) => VERTICAL.pingzuo.find((p) => p.name === name);

/**
 * 举折型线(第13轮:废采样点表,改**参数化单调曲线**)。
 *
 * 旧 `ROOF.topProfile` 是 5 个采样点连折线,保序拟合后恰为一条直线 ——
 * 所采坡形在量图精度内测不出举折曲率,而折线端点还会制造伪折角(L5 的 −2.8°)。
 *
 * 新型线:u = (橑檐枋R − r)/橑檐枋R,自橑檐枋(u=0)向内到塔轴(u=1);
 *   形状函数 S(u) = e^{βu} − 1        (β>0 → S'' > 0,**坡度沿程严格递增**)
 *   剖面      y(r) = 橑檐枋背 + Δ · S(u)/S(u_top)
 * 单调递增是解析保证的,不再靠采样点碰运气。
 *
 * β 由「上口坡度」反解,闭式:令 z = β·u_top、平均坡 tanθ̄ = Δ/(橑檐枋R − 上口R),
 *   tanθ_上口 = tanθ̄ · φ(z),  φ(z) = z/(1 − e^{−z})  (φ 单调增,φ(0)=1)
 *   tanθ_檐口端 = tanθ̄ · ψ(z), ψ(z) = z/(e^z − 1)    (ψ 单调减,ψ(0)=1)
 * 即:上口抬多陡,檐口端就必然摊多缓 —— 两端由同一个 z 锁死,不能各自许愿。
 */
export function liftShape(u, beta) {
  const x = Math.min(1, Math.max(0, u));
  return beta < 1e-9 ? x : Math.expm1(beta * x);
}

/** 兼容旧调用名：屋面剖面型线在各组件间用同一函数名，避免历史导出残留造成编译错误 */
export const riseCurve = liftShape;

/** φ(z) = z/(1−e^{−z}):上口坡 / 平均坡 */
const phi = (z) => (z < 1e-9 ? 1 : z / -Math.expm1(-z));

/** ψ(z) = z/(e^z − 1):檐口端坡 / 平均坡(单调减,ψ(0)=1) */
const psi = (z) => (z < 1e-9 ? 1 : z / Math.expm1(z));

/** 由「上口坡度目标」反解 z = β·u_top;目标低于平均坡时退化为直线(z=0) */
function solveZ(ratio) {
  if (!(ratio > 1)) return 0;
  let lo = 0, hi = 1;
  while (phi(hi) < ratio && hi < 60) hi *= 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (phi(m) < ratio) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** 由「檐口端坡 / 平均坡」反解 z(ψ 单调减);比值 ≥1 表示平均坡本身已缓于檐椽段,
 *  任何正曲率只会让折角更大 —— 只能取直线(z=0),该层的回落是锚点夹逼的结果。*/
function solveZPsi(ratio) {
  if (!(ratio < 1)) return 0;
  let lo = 0, hi = 1;
  while (psi(hi) > ratio && hi < 60) hi *= 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (psi(m) > ratio) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/**
 * @returns {{storeys:Array, roofs:Array, top:{apexY:number}, height:number}}
 *  storeys[i] 字段见下方注释;roofs 与 storey 一一对应(暗层无屋面)。
 */
export function planPagoda() {
  const out = [];
  let prevBracketTop = PLATFORM.terraceTopY;

  for (const s of STOREYS) {
    const R = ring(s.ring);
    const cfg = PUZUO[s.bracket];
    const bH = bracketHeight(cfg);

    /**
     * 内槽铺作等级:**不得高于同层外槽**(第32轮)。
     * `PUZUO.inner` 是「以一层为准」的单一条目,注里写着「上层递简,建造期按版24-31核」——
     * 一直没核。于是 L4/L5 外槽已降到五/四铺作(两跳),内槽仍是三跳,
     * 内槽铺作顶反而**高过外槽铺作顶** 0.13 m,搭在其上的乳栿悬在外槽铺作之上。
     * 规则[法/推]:内槽跳数取 min(内槽名义, 同层外槽);待版24-31 精读后转 [图]。
     */
    const innerCfgOf = (mingCfg, key) => {
      if (!key) return null;
      const base = PUZUO[key];
      return base.tiao > mingCfg.tiao ? { ...base, tiao: mingCfg.tiao, ang: 0 } : base;
    };

    if (s.type === 'ming') {
      // 楼面:首层为台基顶,二层以上为本层暗层解出的平座面
      const anBelow = out.find((x) => x.type === 'an' && x.level === s.level);
      const baseY = s.level === 1 ? PLATFORM.terraceTopY : anBelow.pingzuoY;
      const columnTop = CHAIN_NODES[`L${s.level}Top`];      // [图]版3 全链
      const columnH = columnTop - baseY;
      const eave = eaveOf(`L${s.level}`);
      const item = {
        ...s, key: `L${s.level}_ming`,
        cornerR: R.outerCorner, flatR: R.outerFlat, innerR: R.inner,
        baseY, columnH, columnTop,
        columnHRecorded: s.columnH,          // 版17 单处读数,仅作交叉校验
        bracketCfg: cfg, bracketH: bH, bracketTop: columnTop + bH,
        bracketReach: bracketReach(cfg),
        eaveY: eave.eaveY, ...eaveGeom(eave.eaveW, eave.eaveY),
        // 内槽铺作顶 —— 明栿下皮,也是上层暗层内槽柱的柱脚(叉柱造)。
        // 此前表里没有这一行,于是内槽铺作之上什么都没有、顶着空气(第31轮用户自佛堂内发现);
        // 而暗层内槽柱却按**外槽**铺作顶起脚,两者差 0.70 m。
        innerCfg: innerCfgOf(cfg, s.innerBracket),
        innerTop: s.innerBracket
          ? columnTop + fen(SECTION.pupai.h)
            + bracketFullHeight(normalizeConfig({
              ...innerCfgOf(cfg, s.innerBracket), facing: 'in', role: 'zhutou' }))
          : null,
      };
      // 首层重檐:副阶自成一套柱环 + 铺作 + 屋面
      if (s.doubleEave) {
        const fj = ring('fujie');
        const fe = eaveOf('fujie');
        const fCfg = PUZUO[s.fujieBracket];
        const fH = bracketHeight(fCfg);
        item.fujie = {
          cornerR: fj.outerCorner, flatR: fj.outerFlat,
          baseY, bracketCfg: fCfg, bracketH: fH,
          bracketReach: bracketReach(fCfg),
          columnTop: CHAIN_NODES.fujieTop,          // [图]版3 链 443 = 版2 副阶柱高
          columnH: CHAIN_NODES.fujieTop - baseY,
          eaveY: fe.eaveY, ...eaveGeom(fe.eaveW, fe.eaveY),
        };
      }
      out.push(item);
      prevBracketTop = item.bracketTop;
    } else {
      // 暗层:柱脚踩在下层明层铺作之上(叉柱造简化),
      // 柱顶由本层平座面自上而下倒扣「楼板 + 铺作实际总高 + 普拍枋」反解
      const pz = pzOf(`L${s.level}`);
      const deckTh = fen(SECTION.pingzuoDeck);
      const pupaiH = fen(SECTION.pupai.h);
      const fullH = bracketFullHeight(normalizeConfig({ ...cfg, top: 'deck' }));
      // 暗层柱头取链节点;平座面 = 柱头 + 普拍枋 + 平座铺作实际总高
      const columnTop = CHAIN_NODES[`an${s.level}Top`];      // [图]版3 全链
      const pingzuoY = columnTop + pupaiH + fullH + deckTh;
      const mingBelow = out.find((x) => x.type === 'ming' && x.level === s.level - 1);
      out.push({
        ...s, key: `L${s.level}_an`,
        innerSeat: mingBelow?.innerTop ?? null,   // 内槽柱脚:坐下层内槽铺作顶
        cornerR: R.outerCorner, flatR: R.outerFlat, innerR: R.inner,
        baseY: prevBracketTop, columnH: columnTop - prevBracketTop, columnTop,
        bracketCfg: cfg, bracketH: bH, bracketTop: pingzuoY,
        bracketReach: bracketReach(cfg),
        pingzuoY,
        /**
         * ★ 平座外缘改由**平座铺作的实际出挑**推算(第48轮),不再直接取剪影半宽。
         *
         *   竖向早已改由链驱动、剪影 `pz.y` 降为交叉校验(见上一行的历史);
         *   **径向却还在用剪影** —— 这个不对称就是「各层平座宽度不一」的根因:
         *   剪影 `w` 的收分速率与柱脚的收分速率不同,于是可走宽度
         *   自 L2 的 **0.195 m**(勾阑甚至陷进上层墙面 0.082 m,贴着窗)
         *   一路涨到 L5 的 **1.220 m**(6 倍),用户第48轮一眼看出。
         *
         *   平座是**铺作挑出来的**,这是构造必然:同层跳数一定,挑出就一定。
         *   改后各层挑出 1.803 / 1.803 / 1.803 / 1.251 m(L5 少一跳),
         *   与「一圈可走的外廊」相符。
         *   佐证:L5 的推算值 11.331 与剪影 11.300 **本来就只差 0.031** ——
         *   四层里唯一吻合的那一层,恰是跳数与others不同的那层;
         *   若剪影可信,这种巧合无从解释。
         */
        pingzuoR: R.outerCorner
          + bracketOuterReach(normalizeConfig({ ...cfg, top: 'deck' })) / GLOBAL.cosOct,
        pingzuoYRecorded: pz.y,               // 剪影读数,仅作交叉校验
        pingzuoWRecorded: pz.w,               // 同上:径向剪影亦降为校验项
      });
      prevBracketTop = pingzuoY;
    }
  }

  /* ── 屋面求解:每一片屋面的上口收在何处 ────────────────────── */
  const deck = fen(SECTION.pingzuoDeck);
  const lanE = fen(SECTION.lanE.h);
  const pupaiH = fen(SECTION.pupai.h);
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    if (s.type !== 'ming') continue;

    // 上口半径 = 屋面抵在上层「墙外皮」而非柱心 —— 收在柱心上,
    // 暗层柱与斜撑就会从瓦面里冒出来。顶层收于攒尖。
    const above = out[i + 1];
    const isTop = !above;
    // 让过上层最粗的那一样(墙厚 / 柱径 / 普拍枋宽)的一半,柱身才不会戳出瓦面
    // 让量是「法线方向」的偏移,换算回基准半径同样要除以 cos22.5°
    /**
     * ★ 顶层的屋面上口**不是塔心**,是**砖石刹座的下口**(第42轮)。
     *
     *   旧值 0 让攒尖一路收到轴心,顶点落在 55.980 —— 而刹座顶只到 55.45,
     *   **屋面的尖顶比刹座还高 0.53 m**。于是无论垂脊截在哪,
     *   八条脊的断面都露在座外,竖成八片孤立的鳍(用户第42轮截图)。
     *   版17 详图上,攒尖的瓦面是**收在砖座四周**的,座从瓦面中间升起;
     *   屋面在那里根本没有尖顶 —— 它被座截断。
     *
     *   取座下口的**内切**半径:屋面上口是八角,座也是八角同向,
     *   座的下口外接 2.089 > 屋面上口 1.930,正好罩住这一圈。
     */
    const topR = isTop ? FINIAL.segments[0].w0 / 2
      : above.cornerR
        + Math.max(WALL.thickness, fen(SECTION.columnDia), fen(SECTION.pupai.w))
          / 2 / GLOBAL.cosOct;
    // 屋面不得穿破上层平座板
    const abutY = isTop ? ROOF.topApexY : above.pingzuoY - deck;

    // 收口标高:屋面上缘不得切到上层任何构件。上层是暗层时,最低的那一件不是
    // 平座铺作,而是托着它的**普拍枋** —— 枋下皮 = 暗层柱头。收在枋背等于
    // 把瓦面切在枋的半腰上(第12轮:驼峰移除后暴露出的 48 件跨皮即此)。
    // 让过普拍枋下皮,枋与其上的铺作就整体坐在瓦面之上,读作正常的外挑。
    const closeY = isTop ? null : (above.type === 'an' ? above.columnTop : above.baseY);

    // ── 分段二:铺作压缩裁定 ──
    const liaoR = s.cornerR + bracketOuterReach(normalizeConfig(s.bracketCfg)) / GLOBAL.cosOct;
    s.squashInfo = solveSquash({
      eaveR: s.eaveR, eaveYFace: s.eaveYFace, liaoyanR: liaoR,
      columnTop: s.columnTop, cfg: s.bracketCfg, pupaiH,
    });
    s.bracketCfg = { ...s.bracketCfg, squash: s.squashInfo.squash };

    s.roof = solveRoof({
      eaveR: s.eaveR, eaveY: s.eaveY, eaveYFace: s.eaveYFace, scale: s.scale,
      cornerZone: cornerZoneOf(s.eaveR), cornerOut: s.cornerOut,
      uFlat: uFlatOf(s.cornerR, s.flatR),
      topR, abutY, isTop, closeY,
      liaoyanR: liaoR,
      // 柱头链节点是**角柱**标高,而剖面以**面心**为基准(檐口读数即面心),
      // 故橑檐枋锚要退掉一个生起;角部再由 roof.js 的生起项加回,一退一加自洽。
      liaoyanY: s.columnTop - SHENG_QI + pupaiH + bracketTopOf(s.bracketCfg) + ROOF_BUILDUP,
    });

    if (s.fujie) {
      // 副阶屋面抵在首层柱身上,须低于首层阑额下皮
      const fLiaoR = s.fujie.cornerR
        + bracketOuterReach(normalizeConfig(s.fujie.bracketCfg)) / GLOBAL.cosOct;
      s.fujie.squashInfo = solveSquash({
        eaveR: s.fujie.eaveR, eaveYFace: s.fujie.eaveYFace, liaoyanR: fLiaoR,
        columnTop: s.fujie.columnTop, cfg: s.fujie.bracketCfg, pupaiH,
      });
      s.fujie.bracketCfg = { ...s.fujie.bracketCfg, squash: s.fujie.squashInfo.squash };

      s.fujie.roof = solveRoof({
        eaveR: s.fujie.eaveR, eaveY: s.fujie.eaveY,
        eaveYFace: s.fujie.eaveYFace, scale: s.fujie.scale,
        cornerZone: cornerZoneOf(s.fujie.eaveR), cornerOut: s.fujie.cornerOut,
        uFlat: uFlatOf(s.fujie.cornerR, s.fujie.flatR),
        topR: s.cornerR
          + Math.max(WALL.brickThickness, fen(SECTION.columnDia)) / 2 / GLOBAL.cosOct,
        abutY: s.columnTop - lanE, isTop: false,
        closeY: s.columnTop - lanE,
        liaoyanR: fLiaoR,
        liaoyanY: s.fujie.columnTop - SHENG_QI + pupaiH + bracketTopOf(s.fujie.bracketCfg) + ROOF_BUILDUP,
      });
    }
  }

  return {
    storeys: out,
    terraceTopY: PLATFORM.terraceTopY,
    apexY: ROOF.topApexY,
    height: VERTICAL.eaves.at(-1).eaveY,
  };
}

/**
 * 铺作压缩裁定(第11轮立案 → 第12轮判定为不可行)。
 * 由链预算反推:柱头(链锁死)与檐口(剪影锁死)之间只剩铺作总高可调。
 * 目标椽坡取验收带**上沿 27°** —— 坡越陡所需的橑檐枋背越高、裁额越小,
 * 故取上沿即「压缩量最小」,少造一分数据。
 * 第11轮的 [估]0.35 m 封顶已作废(见下:文法给出的真上限恒为 0)。
 */
const TARGET_CHUAN_SLOPE = 27 * Math.PI / 180;

/**
 * 压缩量的**几何可行上限**(第12轮实测判定,取代第11轮的 [估]0.35 m)。
 *
 * 文法规则是「每出一跳升一足材」,而出跳件(华栱/昂)本身就是足材 ——
 * 即 步进 ≡ 构件高,层与层本来就是**贴合叠放,净空恒为零**。
 * 因此任何正的压缩量都不是「荷载压缩」,而是让上一跳的栱身钻进下一跳、
 * 把中间的交互斗整个吞没:副阶 0.35 m 摊到 2 个步进 = 每跳 −0.175,
 * 步进只剩 0.182 m < 栱高 0.255 m,整朵铺作糊成一块木疙瘩。
 *
 * 故上限不再拍数,直接由材分推出 —— 恒为 0,一切正缺口一律转立案审计。
 * 保留这条公式而不是硬写 0:文法若改(如改用单材出跳),上限会自动跟上。
 */
const STEP_CLEARANCE = fen(PUZUO_RISE.perTiao) - ZUCAI;
const squashCap = (tiao) => Math.max(0, STEP_CLEARANCE * Math.max(1, tiao - 1));

function solveSquash({ eaveR, eaveYFace, liaoyanR, columnTop, cfg, pupaiH }) {
  const out = eaveR - liaoyanR;
  const need = (eaveYFace + out * Math.tan(TARGET_CHUAN_SLOPE))
    - ROOF_BUILDUP - columnTop - pupaiH;
  const fa = bracketFullHeight(normalizeConfig(cfg));
  const gap = fa - need;
  const cap = squashCap(cfg.tiao);
  const squash = Math.max(0, Math.min(cap, gap));
  return { fa, need, gap, squash, cap, over: gap > cap + 1e-9, reach: out };
}

/** 一朵铺作里最高的一型(补间坐驼峰,比柱头高)—— 屋面须让过最高者 */
function bracketTopOf(cfg) {
  return Math.max(
    bracketFullHeight(normalizeConfig({ ...cfg, role: 'zhutou' })),
    bracketFullHeight(normalizeConfig({ ...cfg, role: 'bujian' })),
  );
}

/**
 * 单片屋面的剖面求解 —— 两段式,由两个锚点定死:
 *   檐口段:橑檐枋背 →(直线,即檐椽+飞子的实跑)→ 实测檐口;
 *   举折段:橑檐枋背 →(参数化凹曲线 liftShape)→ 上口。
 * 屋面搭在橑檐枋上是事实,把型线锚在那里,铺作与瓦面的关系就自洽,
 * 不需要任何「局部抬升」。举高按 [法]举高比给出,曲率由「上口坡度」反解。
 */
function solveRoof({
  eaveR, eaveY, eaveYFace, scale, cornerZone, cornerOut = 0, uFlat = 0,
  topR, abutY, isTop, closeY = null, liaoyanR = 0, liaoyanY = 0,
}) {
  // 举折段的自变量:自橑檐枋向内归一(不再拿 eaveR 归一 —— 檐口出挑不属于举折)
  const uTop = liaoyanR > 0 ? (liaoyanR - topR) / liaoyanR : 1;

  // 举高 [法] = 举高比 × 前后橑檐枋心距;上口只走到 uTop 这一段
  const riseFull = ROOF.liftRatio * 2 * liaoyanR;
  let topY = liaoyanY + riseFull * (uTop ** 1);          // 先按直线取,再由夹逼裁定
  if (isTop) topY = abutY;                                // 顶层攒尖由 [图]版17 锚定
  else if (topY > abutY) topY = abutY;
  const closeAt = closeY !== null && topY > closeY ? closeY : null;
  const yTop = closeAt ?? topY;

  // 曲率:tanθ_上口 = tanθ̄ · φ(z) —— 由上口坡度目标反解 z,再得 β
  const run = Math.max(liaoyanR - topR, 1e-6);
  const meanTan = (yTop - liaoyanY) / run;
  const targetTan = Math.tan(ROOF.liftTopSlope * Math.PI / 180);
  const zTop = solveZ(targetTan / Math.max(meanTan, 1e-6));

  // 但曲率不能只听上口:z 越大,檐口端越缓(ψ 单调减),缓过檐椽段就在橑檐枋处
  // 制造折角 —— 断言五的「回落」。故再解一个上界:檐口端坡 ≥ 檐椽段坡。
  // 两端由同一个 z 锁死,不能各自许愿;取二者之小,并记下是谁卡住的。
  const chuanTan = (liaoyanY - eaveYFace) / Math.max(eaveR - liaoyanR, 1e-6);
  const zMono = solveZPsi(chuanTan / Math.max(meanTan, 1e-6));
  const z = Math.min(zTop, zMono);
  const beta = uTop > 1e-9 ? z / uTop : 0;

  return {
    eaveR, eaveY, eaveYFace, scale, cornerZone, cornerOut,
    topR, topY: yTop, rise: yTop - liaoyanY, isTop,
    liaoyanR, liaoyanY, beta, uTop, uFlat, closeY: closeAt,
    // 橑檐枋在坡向参数上的位置 —— 起翘自此向内消散(roof.js:liftFade)
    vLiao: (eaveR - liaoyanR) / Math.max(eaveR - topR, 1e-9),
    // 两端坡度(度),供断言五与放样表直接引用,不许别处再算一遍
    slopeTop: Math.atan(meanTan * phi(z)) * 180 / Math.PI,
    slopeLiao: Math.atan(meanTan * psi(z)) * 180 / Math.PI,
    slopeChuan: Math.atan(chuanTan) * 180 / Math.PI,
    slopeMean: Math.atan(meanTan) * 180 / Math.PI,
    // 形状由谁卡住:'top' 上口坡度目标 | 'mono' 檐口端不得缓于檐椽段 | 'flat' 平均坡已缓于檐椽段,只能取直线
    shapeBoundBy: zMono <= 1e-9 ? 'flat' : (zTop <= zMono ? 'top' : 'mono'),
    soffitY: liaoyanY,
  };
}

/* ═══════════════════════════════════════════════════════════════
 * 全塔标高总表(loft table)—— 竖向的唯一权威
 * ─────────────────────────────────────────────────────────────
 * 本表把历轮竖向裁决固化为一份可打印、可比对的清单。
 * ★ 今后任何竖向改动,必须先改 docs/loft-table.md,再改代码。
 * 构件不得再自带独立标高源:一切竖向定位都应能在本表里找到出处。
 * ═══════════════════════════════════════════════════════════════ */

/** 来源标注 */
const SRC = {
  MEASURE: '[测]陈明达锚点',
  CHAIN: '[图]版3全链',
  SIL: '[图]立面剪影',
  PLATE: '[图]图版读数',
  FA: '[法]材分推算',
  DERIVE: '[派生]由上下锚点反解',
  EST: '[估]',
  NA: '[未建模]',
  SIL_BUILD: '[图+构造厚]剪影下皮 + 椽径望板瓦',
};

/**
 * @returns {{level:string, item:string, y:number|null, src:string, round:string}[]}
 */
export function buildLoftTable(plan = planPagoda()) {
  const rows = [];
  const pupaiH = fen(SECTION.pupai.h);
  const deckTh = fen(SECTION.pingzuoDeck);
  const add = (level, item, y, src, round) =>
    rows.push({ level, item, y, src, round });

  add('台基', '地坪 ±0', 0, SRC.MEASURE, '—');
  add('台基', '下层方台顶', PLATFORM.lowerH, SRC.PLATE, '阶段2');
  add('台基', '月台面(= 一层楼面)', PLATFORM.terraceTopY, SRC.PLATE, '阶段2');

  for (const s of plan.storeys) {
    const L = `${s.level}${s.type === 'ming' ? '明' : '暗'}`;
    if (s.type === 'an') {
      add(L, '暗层柱脚(叉柱造,落下层铺作)', s.baseY, SRC.DERIVE, '第3轮');
      add(L, '暗层柱头', s.columnTop, SRC.CHAIN, '第9轮');
      add(L, '普拍枋背', s.columnTop + pupaiH, SRC.FA, '第9轮');
      add(L, '平座铺作底', s.columnTop + pupaiH, SRC.FA, '第9轮');
      const pzTop = s.pingzuoY - deckTh;
      add(L, '平座铺作顶(裁后)', pzTop, SRC.FA, '第6轮');
      add(L, '平座楼板面', s.pingzuoY, SRC.DERIVE, '第9轮');
      add(L, '  ↳ 剪影读数(交叉校验)', s.pingzuoYRecorded, SRC.SIL, '阶段2');
      add(L, '暗层斜撑:脚落柱脚 / 头落柱头', null, SRC.DERIVE, '第10轮');
      continue;
    }
    const pupaiTop = s.columnTop + pupaiH;
    const brTop = pupaiTop + bracketFullHeight(normalizeConfig(s.bracketCfg));
    if (s.fujie) {
      const fT = s.fujie.columnTop + pupaiH;
      const fBr = fT + bracketFullHeight(normalizeConfig(s.fujie.bracketCfg));
      add('副阶', '副阶柱脚', s.fujie.baseY, SRC.PLATE, '阶段2');
      add('副阶', '副阶柱头(角柱 = 生起基准)', s.fujie.columnTop, SRC.CHAIN, '第9轮');
      add('副阶', '  ↳ 平柱柱头(当心间不生起,低一个全额)', s.fujie.columnTop - SHENG_QI, SRC.FA, '第19轮');
      add('副阶', '普拍枋背 / 铺作底(角柱处;逐柱随生起起伏)', fT, SRC.FA, '第12轮');
      add('副阶', '铺作顶 = 橑檐枋背', fBr, SRC.FA, '第6轮');
      add('副阶', '檐口面心·瓦面上皮(剖面锚)', s.fujie.roof.eaveYFace, SRC.SIL_BUILD, '第11轮');
      add('副阶', '  ↳ 檐口面心·下皮(剪影原读数,交叉校验)', s.fujie.eaveY, SRC.SIL, '阶段2');
      add('副阶', '  ↳ 檐口平柱处(= 面心,当心间水平)', s.fujie.roof.eaveYFace, SRC.FA, '第19轮');
      add('副阶', '檐口(角尖,= 面心 + 生起 + 起翘)',
        s.fujie.roof.eaveYFace + SHENG_QI + ROOF.cornerLift * s.fujie.scale, SRC.DERIVE, '第19轮');
      add('副阶', '屋面上口', s.fujie.roof.topY, SRC.DERIVE, '第6轮');
    }
    add(L, '楼面 / 明层柱脚', s.baseY, s.level === 1 ? SRC.PLATE : SRC.DERIVE, '第9轮');
    add(L, '明层柱头(角柱 = 生起基准)', s.columnTop, SRC.CHAIN, '第9轮');
    add(L, '  ↳ 平柱柱头(当心间不生起,低一个全额)', s.columnTop - SHENG_QI, SRC.FA, '第19轮');
    add(L, '  ↳ 版17 读数柱高(交叉校验)', s.baseY + s.columnHRecorded, SRC.PLATE, '阶段2');
    add(L, '普拍枋背 / 铺作底(角柱处;逐柱随生起起伏)', pupaiTop, SRC.FA, '第12轮');
    add(L, '铺作顶(裁后)= 橑檐枋背', brTop, SRC.FA, '第6轮');
    add(L, '檐口面心·瓦面上皮(剖面锚)', s.roof.eaveYFace, SRC.SIL_BUILD, '第11轮');
    add(L, '  ↳ 檐口面心·下皮(剪影原读数,交叉校验)', s.eaveY, SRC.SIL, '阶段2');
    add(L, '  ↳ 檐口平柱处(= 面心,当心间水平)', s.roof.eaveYFace, SRC.FA, '第19轮');
    add(L, '檐口(角尖,= 面心 + 生起 + 起翘)',
      s.roof.eaveYFace + SHENG_QI + ROOF.cornerLift * s.scale, SRC.DERIVE, '第19轮');
    add(L, '  ↳ 剪影 eaveY 读数(face 语义下即面心)', s.eaveY, SRC.SIL, '阶段2');
    add(L, '屋面上口(收口后)', s.roof.topY, SRC.DERIVE, '第6轮');
    add(L, '内槽柱脚', s.baseY, SRC.DERIVE, '第10轮 对表');
    add(L, '内槽柱头', s.columnTop, SRC.DERIVE, '第10轮 对表');
    add(L, '内槽普拍枋背 / 内槽铺作底', pupaiTop, SRC.DERIVE, '第10轮 对表');
    add(L, '内槽铺作顶 = 明栿下皮 = 上层暗层内槽柱脚', s.innerTop, SRC.FA, '第31轮');
    add(L, '佛坛面', null, SRC.NA, '—');
    add(L, '楼板面(内槽,除平座外)', null, SRC.NA, '—');
  }
  add('顶', '屋顶攒尖', ROOF.topApexY, SRC.PLATE, '阶段2');
  add('顶', '  ↳ 版3 链读数(交叉校验)', CHAIN_NODES.roofApex, SRC.CHAIN, '第9轮');
  add('刹', '刹基下皮(埋入攒尖)', 54.28, SRC.PLATE, '第39轮·版17尺寸链倒推');
  add('刹', '刹尖', GLOBAL.totalHeight, SRC.MEASURE, '—');
  return rows;
}

/** 总表转 Markdown(写入 docs/loft-table.md)*/
export function loftTableMarkdown(rows = buildLoftTable()) {
  const out = ['| 层 | 部位 | 标高 m | 来源 | 裁决轮次 |', '|---|---|---|---|---|'];
  for (const r of rows) {
    out.push(`| ${r.level} | ${r.item} | ${r.y === null ? '—' : r.y.toFixed(3)} | ${r.src} | ${r.round} |`);
  }
  return out.join('\n');
}
