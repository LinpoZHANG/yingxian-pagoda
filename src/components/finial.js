/**
 * components/finial.js —— 塔刹
 * ─────────────────────────────────────────────────────────────
 * 按 FINIAL 参数自下而上生成:刹座(仰莲)→ 覆钵 → 相轮(叠涩环)→
 * 圆光 → 仰月 → 宝盖 → 宝珠,外加铁刹拉链(自宝盖斜拉至八屋角)。
 * 总高 11.33m [测](55.98 → 67.31),约占全塔 1/6 —— 比例失当会
 * 直接毁掉天际线,故各段的起讫标高与口径全部按 FINIAL 表,
 * 本文件不引入任何自由尺寸。
 *
 * 轮廓一律用 LatheGeometry 车削(回转体),与真实铸铁刹件一致。
 *
 * ★ 口径语义:FINIAL.segments 的 w0/w1 是**全宽(直径)**,
 *   本文件两处取用(segmentProfile 与 xiangLun)一律先除以 2 再当半径。
 *   改动此文件时勿把 w 直接当半径用 —— 那会让整个刹放大一倍。
 */

import {
  Group, Mesh, LatheGeometry, TubeGeometry, CatmullRomCurve3, ExtrudeGeometry,
  Shape, Vector2, Vector3, CylinderGeometry,
} from 'three';
import { FINIAL, ROOF } from '../data/pagodaParams.js';
import { IRON, STONE_DARK } from '../materials/tile.js';
import { OCT_COS, OCT_N, OCT_ROT } from '../assembly/octagon.js';
import { roofYAtRadius, surfacePoint } from './roof.js';

const SEG = 20;

const lathe = (pts, seg = SEG) => new LatheGeometry(pts, seg);

/**
 * 顶层屋面在「距轴 R」处的标高。
 * 八角攒尖不是圆锥:同一 R 上,面心处最低、转角处最高(面心的边心距 = 角半径×cos22.5°)。
 * 刹座是回转体,要保证一圈都不悬空,须按**最低**的那一点(面心)取值,
 * 即用 R/cos22.5° 反算出的角半径去查型线。
 */
function roofYAt(roof, R) {
  if (!roof) return null;
  // ★ 走 roof.js 的剖面接口,不在此另算一条型线(第13轮:旧写法是第二条放样线,
  //   举折曲线一改就与瓦面脱节)。取面心最低点,故半径按 R/cos22.5° 反算。
  return roofYAtRadius(roof, Math.min(roof.eaveR, R / OCT_COS));
}

/**
 * 各段轮廓:kind 决定母线形状,起讫标高与口径来自 FINIAL.segments。
 * @param {boolean} lowest 是否为最下一段 —— 只有它需要坐到屋面上
 */
function segmentProfile(s, roof, lowest = false) {
  const r0 = s.w0 / 2, r1 = s.w1 / 2, h = s.y1 - s.y0;
  const P = [];
  const push = (r, t) => P.push(new Vector2(Math.max(r, 0.001), t * h));

  // ★ 结构落位:最下一段若整体高于屋面,塔刹就是悬空的。
  // 先把下口压到屋面实际标高,再起本段型线 —— 无论参数怎么改都不会脱空。
  if (lowest && roof) {
    const drop = s.y0 - roofYAt(roof, r0);
    if (drop > 0.01) {
      push(r0, -drop / h);
      push(r0 * 0.99, -drop * 0.4 / h);
    }
  }

  switch (s.kind) {
    case 'base':
      /**
       * 砖砌刹座 —— 形状按**版17 p89 右上「塔刹与攒尖交接」详图**,不再自行拟形。
       * 图上它是:**直边 + 两级台阶收分**的砖砌方座 ——
       * 每一级是一段**竖直**的砖面,级与级之间一道水平出沿;
       * 不是连续的斜锥面(我此前拟的斜面在图上找不到依据)。
       * 顶端收到上口 r1,恰承仰莲下口;下段延伸埋入屋面。
       */
      push(r0, 0); push(r0, 0.38);                    // 下段(含埋入屋面的一截)
      push(r0 * 0.90, 0.42); push(r0 * 0.90, 0.68);   // 第一级
      push(r0 * 0.80, 0.72); push(r0 * 0.80, 0.92);   // 第二级
      push(r1, 0.96); push(r1, 1);                    // 收到上口,承仰莲
      break;
    case 'lotus':      // 仰莲:向上外张的双层莲瓣(版17 大样:下窄上阔,瓣尖上翘)
      // 最宽 3.46 m 出现在 t≈0.90,即 w0 的 1.32 倍 [图]版17 量图
      push(r0, 0); push(r0 * 0.96, 0.10);
      push(r0 * 1.06, 0.30); push(r0 * 1.10, 0.35);   // 下层瓣尖
      push(r0 * 0.94, 0.40); push(r0 * 0.93, 0.46);   // 束腰
      push(r0 * 1.30, 0.76); push(r0 * 1.38, 0.86);   // 上层瓣尖(最宽 3.64 m [图]p89 像素标定)
      push(r0 * 1.24, 0.92); push(r1, 1);             // 瓣尖之上收口
      break;
    case 'bowl': {     // 覆钵:微鼓的桶身 —— 版17 大样量得最宽 2.52 m,
      // 仅为下口 2.54 m 的 0.99 倍,即几乎直桶、腰部略鼓,非旧版臆断的强鼓腹
      const F = [[0, r0], [0.18, r0 * 0.96], [0.50, r0 * 0.99],
                 [0.72, r0 * 0.95], [0.90, r1 * 1.05], [1, r1]];
      for (const [t, r] of F) push(r, t);
      break;
    }
    case 'disc':       // 圆光:薄圆盘(佛光)。版17 画作一面立着的圆板,
      // 段高含上下两截细颈,盘身只占中间约 1/6 —— 旧型线做成了通高的鼓筒
      push(r0 * 0.13, 0); push(r0 * 0.13, 0.40);
      push(r0 * 0.94, 0.44); push(r0, 0.48);
      push(r0, 0.54); push(r0 * 0.94, 0.58);
      push(r1 * 0.13, 0.62); push(r1 * 0.13, 1);
      break;
    case 'canopy':     // 宝盖:外张的伞盖,下缘外挑
      push(r1 * 0.5, 0); push(r0 * 1.35, 0.30); push(r0 * 1.30, 0.40);
      push(r1 * 0.9, 0.86); push(r1 * 0.55, 1);
      break;
    case 'moon':       // 仰月:本体是月牙薄板,不由此处车削(见 crescent()),
      // 这里只出上下两截穿在刹杆上的细颈
      push(r0 * 0.16, 0); push(r0 * 0.16, 1);
      break;
    case 'pearl':      // 宝珠:桃形顶珠
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        push(r0 * Math.sin(Math.pow(t, 0.72) * Math.PI) + r1 * 0.35 * (1 - t), t);
      }
      break;
    case 'mast': {     // 刹杆:贯穿全刹的铁杆,按 w0→w1 渐变收细,末段收成针尖
      const N = 8;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        // 幂次 <1:下部收得快、上部近乎等细,读起来更「纤」
        push(r0 + (r1 - r0) * Math.pow(t, 0.62), t);
      }
      push(r1 * 0.30, 0.965); push(0.004, 1);   // 刹尖
      break;
    }
    default:
      push(r0, 0); push(r1, 1);
  }
  return P;
}

/**
 * 仰月:上开口的月牙薄板。回转体做不出月牙,故单独以二维月牙轮廓挤出;
 * 交叉两片(0° / 90°),使各个方向看过去都读得出月牙 —— 实物铁刹亦多作交叉板。
 */
function yangYue(s) {
  const g = new Group();
  const R = s.w0 / 2;
  const th = Math.max(0.05, R * 0.12);
  const shape = new Shape();
  const A0 = Math.PI * 0.86, A1 = Math.PI * 0.14;      // 两只月角
  shape.absarc(0, 0, R, A0, A1 + Math.PI * 2, false);  // 外弧(下缘)
  const rIn = R * 0.80, cy = R * 0.34;                 // 内弧(上缘,偏心成月牙)
  const b0 = Math.atan2(R * Math.sin(A1) - cy, R * Math.cos(A1));
  const b1 = Math.atan2(R * Math.sin(A0) - cy, R * Math.cos(A0));
  shape.absarc(0, cy, rIn, b0, b1, false);
  shape.closePath();

  for (const rot of [0, Math.PI / 2]) {
    const geo = new ExtrudeGeometry(shape, { depth: th, bevelEnabled: false });
    geo.translate(0, 0, -th / 2);
    const m = new Mesh(geo, IRON);
    m.position.y = s.y0 + (s.y1 - s.y0) * 0.52;
    m.rotation.y = rot;
    m.castShadow = true;
    m.userData = { partKey: 'yangyue', type: 'finial' };
    g.add(m);
  }
  g.userData = { partKey: 'yangyue', type: 'finial' };
  return g;
}

/**
 * 相轮:n 道叠涩环,自下而上递减。
 * 道数 [图]版17 p89 大样**直接数得 5 道**(第37轮校图更正;
 * 旧值 6 来自版6 立面的宽度振荡计数 —— 那是间接推算,大样上数得着就不该用推的)。
 */
function xiangLun(s) {
  const g = new Group();
  const n = s.n ?? 5;
  const h = (s.y1 - s.y0) / n;
  // 轴颈取最小一道相轮的三成半:六道环因此都比轴显著出沿,远看仍数得清
  const neckR = (s.w1 / 2) * 0.35;
  /**
   * ★ 相轮是**实心叠涩盘**,不是镂空的箍(第37轮校图更正)。
   *   旧写法用 TorusGeometry 做成圆环,环内半径 1.02 而轴颈只有 0.39 ——
   *   中间留了 0.63 m 的空,从侧面**一眼看穿**到背后的天空。
   *   版17 大样上,五道相轮是一摞层层出沿的实心盘,盘间只有一道浅缝;
   *   它是铸铁实件,没有「中间那个洞」。
   *   故改为:出沿的扁盘 + 略细的束颈交替,整摞不透光。
   */
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const r = (s.w0 / 2) + ((s.w1 / 2) - (s.w0 / 2)) * t;
    const yb = s.y0 + h * i;
    // 盘:占一格的 58%,上下微收成叠涩的斜面
    const disc = new Mesh(new CylinderGeometry(r * 0.985, r, h * 0.58, SEG), IRON);
    disc.position.y = yb + h * 0.29;
    disc.castShadow = disc.receiveShadow = true;
    disc.userData = { partKey: 'xiangLun', type: 'finial', index: i };
    g.add(disc);
    // 束颈:填满余下 42%,取盘径的 0.86 —— 缝读得出,却不透光
    const waist = new Mesh(new CylinderGeometry(r * 0.86, r * 0.86, h * 0.44, SEG), IRON);
    waist.position.y = yb + h * 0.58 + h * 0.22 - 0.002;
    waist.castShadow = waist.receiveShadow = true;
    waist.userData = { partKey: 'xiangLun', type: 'finial', index: i };
    g.add(waist);
  }
  // 贯通轴颈:一根,填在盘摞之内(实心摞已不透光,它只保证与上下段连续)
  const neck = new Mesh(
    new CylinderGeometry(neckR, neckR, s.y1 - s.y0, 10), IRON);
  neck.position.y = (s.y0 + s.y1) / 2;
  neck.castShadow = true;
  neck.userData = { partKey: 'xiangLun', type: 'finial' };
  g.add(neck);
  g.userData = { partKey: 'xiangLun', type: 'finial' };
  return g;
}

/**
 * 交接封盖(露盘 / 承盘)—— 第37轮补。
 *
 * **病根**:`LatheGeometry` 只车侧面,**不封端面**。而塔刹本就是一层层收进去的,
 * 相邻两段的口径从来不相等 —— 于是每一处收分都露出一圈没有盖的环带,
 * 自斜上方能一直看进铸件的内腔。用户第37轮红框圈的三处,自检查出六处:
 *
 * | 交接 | 环带宽 |
 * |---|---|
 * | 仰莲上口 → 覆钵下口 | 0.395 m |
 * | 覆钵上口 → 相轮(相轮反而外挑) | 0.165 m,且顶口敞开 0.656 m |
 * | 相轮上口 → 圆光细颈 | 0.225 m |
 * | 圆光上口 → 仰月细颈 | 0.260 m |
 * | 仰月上口 → 宝珠 | 0.415 m |
 * | 刹基下口 → 屋面 | 底面全敞 |
 *
 * **图纸怎么画的**(版17 p89 大样):每一处收分都有一条水平封口线,
 * 覆钵下口外挑一只**露盘**坐在仰莲顶上,相轮上口托一块**外挑的宝盖**。
 * 也就是说,实物在这些位置本来就有盖板 —— 缺的不是补丁,是构件。
 *
 * 故本函数按交接逐处生成环盘:内径取两段口径的小者、外径取大者
 * (含相轮那种「上段反而更宽」的情形),厚 6 cm [估],骑在交接面上各埋一半。
 */
function capRing(rIn, rOut, y, th = 0.06) {
  const a = Math.max(0.004, Math.min(rIn, rOut));
  const b = Math.max(a + 0.004, Math.max(rIn, rOut));
  // 闭合剖面 → 车出的是完全封闭的环状实体(内外侧面 + 上下环面)
  const P = [
    new Vector2(a, -th / 2), new Vector2(b, -th / 2),
    new Vector2(b, th / 2), new Vector2(a, th / 2), new Vector2(a, -th / 2),
  ];
  const m = new Mesh(new LatheGeometry(P, SEG), IRON);
  m.position.y = y;
  m.castShadow = m.receiveShadow = true;
  m.userData = { partKey: 'luPan', type: 'finial' };
  return m;
}

/**
 * 铁刹拉链:自仰月/宝盖锚点斜拉至顶层八个屋角(戗脊端),
 * 是塔刹抗风倾覆的实际做法,也是天际线上最细的一笔。
 */
function chains(roof) {
  const g = new Group();
  g.name = 'chains';
  const n = FINIAL.chains.n;
  const anchor = new Vector3();
  for (let i = 0; i < n; i++) {
    /**
     * ★ 链端必须落在**戗脊端**上(第38轮:用户报「金属插在屋檐棱上」)。
     *   旧写法用「顶层剪影半宽 × 0.97」当半径、「名义檐口 + 0.45」当标高,
     *   两个数都是**面心的**,而链子拉向的是**角**:
     *     半径 12.445 vs 角尖实测 13.887 —— 短 1.442 m;
     *     标高 49.150 vs 戗脊端脊顶 50.169 —— 低 1.019 m。
     *   合起来链端落到瓦面**之下 0.264 m**,于是从外面看就是一根铁链插进瓦里。
     *   这是第13轮那条老规矩的重演:**剪影半宽是面心量,÷cos22.5° 才是角点**;
     *   而角部还有起翘,名义檐口标高同样不能直接用。
     *   现改为直接取屋面皮肤在角方位(u=1, v=0)的点,再抬一个脊高 ——
     *   链拴在戗脊端的铁环上,与实物做法一致。
     */
    const tip = surfacePoint(i, 1, 0, roof, new Vector3());
    const end = new Vector3(tip.x, tip.y + ROOF.tiles.ridgeH, tip.z);
    // 上锚在宝盖**外缘**、与链端**同一竖直面**内:图上八条链是自那块外挑板的
    // 八个角拉出去的;自轴心拉会让八条链在顶端挤成一束,而且链会扭。
    const a = Math.atan2(end.x, end.z);
    const aR = FINIAL.chains.anchorR ?? 0;
    anchor.set(Math.sin(a) * aR, FINIAL.chains.anchorY, Math.cos(a) * aR);
    // 自重下垂:中点略低于直线
    const mid = anchor.clone().lerp(end, 0.5);
    mid.y -= anchor.distanceTo(end) * 0.07;
    const curve = new CatmullRomCurve3([anchor.clone(), mid, end]);
    const tube = new Mesh(new TubeGeometry(curve, 14, 0.035, 5, false), IRON);
    tube.castShadow = true;
    tube.userData = { partKey: 'chain', type: 'finial' };
    g.add(tube);
  }
  return g;
}

/**
 * @param {object} o
 *   o.roof 顶层屋面的求解结果(plan.js)—— 刹座据此坐到屋面上,不留悬空
 * @returns {Group} 塔刹,原点在塔心地坪(各段自带绝对标高)
 */
export function buildFinial({ roof = null } = {}) {
  const root = new Group();
  root.name = 'finial';

  // 最下一段(刹杆除外)负责与屋面交接
  const lowest = FINIAL.segments
    .filter((s) => s.kind !== 'mast')
    .reduce((a, b) => (b.y0 < a.y0 ? b : a));

  /** 各段实际的上下口半径与绝对标高 —— 封盖按它算,不按 FINIAL 表的名义 w。
   *  圆光/仰月的下口是细颈(型线首点),名义 w 是盘径,拿名义值补盖会补出一圈飞边。 */
  const ends = new Map();

  for (const s of FINIAL.segments) {
    if (s.kind === 'rings') {
      root.add(xiangLun(s));
      // 相轮不是车削件:上下口取轴颈,最大外沿取最下一道环的外半径
      const neckR = (s.w1 / 2) * 0.35;
      ends.set(s.name, { rBot: neckR, rTop: neckR, yBot: s.y0, yTop: s.y1,
        rWidest: s.w0 / 2 });
      continue;
    }
    if (s.kind === 'moon') root.add(yangYue(s));      // 月牙板另出,细颈仍走车削
    // ★ 刹杆同样要落到屋面:图上刹杆一贯到底、穿过砖座。
    //   旧写法把它排除在 lowest 之外,杆下端停在 54.68 而屋面在 54.478 —— 悬空 0.202 m。
    const toRoof = (s === lowest) || s.kind === 'mast';
    const P = segmentProfile(s, roof, toRoof);
    /**
     * ★ 砖石刹基必须是**八角**,不能是圆(第40轮:用户报「没有完整的结构收口」)。
     *   它要收口的是**八角**攒尖:圆锥台插进八角锥面,交线在面心低、在垂脊高,
     *   露出来就是一圈参差的「花瓣」—— 那正是用户看到的破口感。
     *   同形同向的八角座插进八角瓦面,交线才整齐。
     *
     *   半径语义同时要换:图纸上量的 w0 = 3.86 是**正视投影宽度**,
     *   即八角的**对边宽**(内切径×2);八角的外接半径要 ÷cos22.5°。
     *   这就是第13轮那条老规矩 ——「剪影半宽是面心量,÷cos22.5° 才是角点」。
     *   换算后:下口外接 2.089(投影仍是 3.86 ✔),
     *   上口外接 1.423,其**内切**恰好 1.315 = 仰莲下口 —— 座在任何方位都不小于它所托的件。
     */
    const isBase = s.kind === 'base';
    const geo = isBase
      ? (() => {
        const PP = P.map((v) => new Vector2(v.x / OCT_COS, v.y));
        const g = new LatheGeometry(PP, OCT_N);
        g.rotateY(-OCT_ROT);          // 顶点落 ±22.5°,面朝南 —— 与屋面同向
        return g;
      })()
      : lathe(P, s.kind === 'mast' ? 10 : SEG);
    // ★ 刹基是**砖石**,不是铁(FINIAL 表抬头本就写着「砖石刹基」,
    //   但这里一律用了 IRON —— 于是与屋面交接的那一圈渲染成金属,
    //   用户第38轮问「金属插在屋檐棱上是否正确」,答:不正确,那里该是砖石)。
    const m = new Mesh(geo, s.kind === 'base' ? STONE_DARK : IRON);
    m.position.y = s.y0;
    m.castShadow = m.receiveShadow = true;
    m.name = s.name;
    m.userData = { partKey: s.name, type: 'finial' };
    root.add(m);
    if (s.kind !== 'mast') {
      const k = isBase ? 1 / OCT_COS : 1;
      ends.set(s.name, {
        rBot: P[0].x * k, rTop: P.at(-1).x * k,
        yBot: s.y0 + P[0].y, yTop: s.y0 + P.at(-1).y,
        rWidest: P[0].x * k, octagon: isBase,
      });
    }
  }

  /* ── 交接封盖:逐处把敞开的环带盖上 ─────────────────────── */
  const ordered = FINIAL.segments.filter((s) => s.kind !== 'mast')
    .sort((a, b) => a.y0 - b.y0);
  for (let i = 0; i < ordered.length - 1; i++) {
    const lo = ends.get(ordered[i].name), up = ends.get(ordered[i + 1].name);
    if (!lo || !up) continue;
    const rOut = Math.max(lo.rTop, up.rBot, up.rWidest ?? 0);
    const rIn = Math.min(lo.rTop, up.rBot);
    if (rOut - rIn < 0.02) continue;                  // 本就齐平,不补
    // 八角座的**顶面本身就是盖**:它的内切半径已等于上段下口,
    // 再补一圈圆环盘只会在面心处支出 0.108 m 的飞边。
    if (lo.octagon) continue;
    root.add(capRing(rIn, rOut, lo.yTop));
  }
  // 最下一段的底面:坐在屋面上,同样不能是敞口。
  // ★ 这一块**不能骑在交接面上**:它下面就是瓦面,骑着放会有一半露在瓦上
  //   —— 断言二当场判「跨皮 0.030 m」。故顶面对齐筒底,整块埋进屋面里。
  const CAP_T = 0.06;
  const b0 = ends.get(ordered[0].name);
  if (b0) root.add(capRing(0.004, b0.rBot, b0.yBot - CAP_T / 2, CAP_T));
  // 最上一段的顶面:宝珠型线已收到轴心,无需补(留判据在断言里)

  if (roof) root.add(chains(roof));

  root.userData = { partKey: 'finial', type: 'finial', level: 6 };
  return root;
}
