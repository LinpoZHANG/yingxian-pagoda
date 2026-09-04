/**
 * components/plaque.js —— 牌匾(匾额)
 * ─────────────────────────────────────────────────────────────
 * 三方御题匾是这座塔在**立面上唯一的文字**,也是它从「一座木构」变成
 * 「釋迦塔」的那一笔。缺了它,南立面在视觉上少的不只是三块板 ——
 * 少的是尺度参照:匾把当心间的宽度、檐下的暗、木色的沉,一次性锚定住。
 *
 * 构造(三件套,全部程序化,无外部图片):
 *   匾框  木,四条边框料围出框口,框内缘一道**石青牙子** [图];
 *   匾面  灰白木本色的**竖向拼板**,退在框口之内 [图];
 *   文字  Canvas2D 现画 → CanvasTexture。系统字体,楷/宋回退链。
 *         竖匾自上而下,横匾**自右而左** [文](传统匾额书序)。
 *
 * 定位(全部读放样表与既有构件,不新增自由标高):
 *   平面 = 该层该面**当心间两平柱柱头**的中点,朝面外法线;
 *   竖向 = 板顶挂在**阑额下皮 − headGap**,向下展开;
 *   出挑 = 墙外皮 + standoff,故匾悬在门/窗之前,不与墙共面(免闪烁)。
 *
 * 尺寸等级见 pagodaParams.js:PLAQUES 抬头的抗辩说明 —— 版3 不画匾,
 * 比例为 [估],绝对值由当心间弦长与墙身带高([图] 级)钳定。
 */

import {
  Group, Mesh, BoxGeometry, PlaneGeometry, CanvasTexture, SRGBColorSpace,
  MeshStandardMaterial, Vector3, Color,
} from 'three';
import { PLAQUES, PLAQUE_STYLE as S, PLAQUE_PALETTE, WALL } from '../data/pagodaParams.js';
import { WOOD } from '../materials/wood.js';
import { fen, SECTION, ZUCAI, PART } from '../data/caifen.js';

/** 一跳的水平长度,用于把「高出普拍枋背多少」折算成「斗栱在那里挑出多少」 */
const TIAO_LEN = fen(PART.tiao);

/** 系统字体回退链:楷 → 宋 → 通用衬线。**不引外部字体文件** */
const FONT_STACK = '"STKaiti","Kaiti SC","KaiTi","STSong","Songti SC","SimSun","Noto Serif CJK SC",serif';

// 牙子与板底的材质**逐方现建**(配色一块一样),故此处不留共享常量。

/**
 * 画一方匾面:灰白木底 + 竖向板缝 + 墨字 [图]。
 * 在无 Canvas2D 的环境(node 自检桩)里返回 null,调用方回退到纯木底色。
 */
function plaqueTexture(text, vertical, wPx, hPx, pal) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(64, Math.round(wPx));
  cv.height = Math.max(64, Math.round(hPx));
  const ctx = cv.getContext('2d');
  if (!ctx || typeof ctx.fillText !== 'function') return null;   // 自检桩:无 2D 能力
  const W = cv.width, H = cv.height;

  ctx.fillStyle = pal.ground;
  ctx.fillRect(0, 0, W, H);

  // ★ 匾面是**竖向拼板**,板缝在实物照片上清清楚楚(IMG-001 数得出十几道)。
  //   缝是这块匾「由木板拼成」的唯一线索,少了它就成了一张纸。
  const planks = Math.max(4, Math.round(W / (H * 0.16)));
  ctx.strokeStyle = pal.plank;
  ctx.lineWidth = Math.max(1, W * 0.0022);
  for (let i = 1; i < planks; i++) {
    const x = (W * i) / planks;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  // 风化:极淡的随机斑,压掉塑料感
  ctx.globalAlpha = 0.045;
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = i % 3 ? '#a89f88' : '#efe8d6';
    ctx.fillRect(Math.random() * W, Math.random() * H, W * 0.02, H * 0.05);
  }
  ctx.globalAlpha = 1;

  // 文字
  const chars = [...text];
  const m = Math.min(W, H) * 0.075;
  ctx.fillStyle = pal.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pad = m * 1.9;
  if (vertical) {
    const cell = (H - 2 * pad) / chars.length;
    const fs = Math.min(cell * 0.86, (W - 2 * pad) * 0.94);
    ctx.font = `${fs.toFixed(1)}px ${FONT_STACK}`;
    chars.forEach((c, i) => ctx.fillText(c, W / 2, pad + cell * (i + 0.5)));
  } else {
    const cell = (W - 2 * pad) / chars.length;
    const fs = Math.min(cell * 0.86, (H - 2 * pad) * 0.94);
    ctx.font = `${fs.toFixed(1)}px ${FONT_STACK}`;
    // ★ 右起横书 [文]:首字在右端
    chars.forEach((c, i) => ctx.fillText(c, W - pad - cell * (i + 0.5), H / 2));
  }

  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * 解算一方匾的尺寸:比例 [估] → 绝对值,再受墙身带高钳定。
 * @param {object} spec  PLAQUES 中的一条
 * @param {number} bay   当心间弦长(两平柱柱头间距)[图 级派生]
 * @param {number} band  墙身带高 = 阑额下皮 − 楼面      [图 级派生]
 */
export function plaqueSize(spec, bay, band, headroom = 0, availH = 0) {
  const gap = spec.headGap;
  // 实测尺寸优先:资料包给了实物长宽的,直接按实物长宽比,不再用估的 aspect
  const t = spec.trueSize?.totalWH;
  let w = spec.widthRatio != null ? bay * spec.widthRatio : null;
  let h = spec.heightRatio != null ? band * spec.heightRatio : null;
  const aspect = t ? t[1] / t[0] : spec.aspect;
  if (h == null) h = w * aspect;
  if (w == null) w = h / aspect;
  /**
   * 竖向可用高 = 墙身带 + **铺作带下部的可占高度**。
   *
   * 第37轮资料方裁定「先选 A」:释迦塔实物通高 3.08 m 装不进 1.324 m 的墙身带,
   * 判为**匾本就挂过阑额、盖住铺作带下部** —— 不是模型标高错。
   * 故上限自「阑额下皮」抬到「阑额下皮 + headroom」,headroom 由调用方给
   * (取普拍枋背到栱眼壁上皮的一段:匾盖到这里为止,再上去就要压住铺作出跳了)。
   * 下限仍是楼面:匾不能越过楼板。
   */
  /**
   * 前倾之后,匾在立面上占的是**竖向投影高** h·cosθ,故钳定按投影算。
   * `availH` 是调用方给的「顶棚 − 底线」净空:顶棚 = 阑额下皮 + 可占的铺作带
   * (副阶檐下那一方则是副阶椽底),底线 = 勾阑顶 / 楼面。
   * **匾必须装进这一段** —— 装不下就缩,不能让下缘穿进勾阑
   * (第42轮:释迦塔撞地栿 0.036 m)。
   */
  const ct = Math.cos((S.tilt ?? 0) * Math.PI / 180);
  const hMax = (availH > 0 ? availH : band - gap + headroom) / ct;
  if (h > hMax) { const k = hMax / h; h = hMax; w *= k; }
  // 上限:不得越出当心间(两侧各留一个边框宽)
  const wMax = bay - S.frameW * 2;
  if (w > wMax) { const k = wMax / w; w = wMax; h *= k; }
  return { w, h, gap };
}

/**
 * 造一方匾(局部坐标:+X 面内切向 = 观者右手,+Y 上,+Z 面外法线;
 * 原点在**板背面**的中心,故所有件的 z 自 0 起算)。
 */
function plaqueMesh(spec, w, h) {
  const g = new Group();
  const { frameW: fw, frameT: ft, panelT: pt, edgeLine: gl } = S;
  const iw = w - fw * 2, ih = h - fw * 2;                 // 框口净尺寸

  // ① 匾面(拼板),退在框口之内、框厚之后。配色逐方覆写,默认值只兜底
  const pal = { ground: S.ground, ink: S.ink, edge: S.edge, plank: S.plank,
    ...(PLAQUE_PALETTE[spec.key] ?? {}) };
  const board = new MeshStandardMaterial({
    color: new Color(pal.ground), roughness: 0.86, metalness: 0.0,
  });
  const tex = plaqueTexture(spec.text, spec.vertical, iw * S.px, ih * S.px, pal);
  const face = tex
    ? new MeshStandardMaterial({ map: tex, roughness: 0.86, metalness: 0.0 })
    : board;
  // ★ 板比框口各边大 6 mm(压在框料之下,免露缝),背面则**再退 3 mm**:
  //   板背与框背若同在 z=0,两片同向背面就在那 6 mm 重叠带里共面 —— 又是一处
  //   仰角掠视时会闪的地方(与第34轮台基共面同因)。
  const panel = new Mesh(new BoxGeometry(iw + 0.012, ih + 0.012, pt + 0.006), board);
  panel.position.z = pt / 2 - 0.003;
  g.add(panel);
  // 字面单出一片,免得整块盒子六面共用一张贴图
  const skin = new Mesh(new PlaneGeometry(iw, ih), face);
  skin.position.z = pt + 0.002;
  g.add(skin);

  // ② 匾框:四条边框料
  for (const [bw, bh, bx, by] of [
    [w, fw, 0, (h - fw) / 2], [w, fw, 0, -(h - fw) / 2],
    [fw, ih, -(w - fw) / 2, 0], [fw, ih, (w - fw) / 2, 0],
  ]) {
    const m = new Mesh(new BoxGeometry(bw, bh, ft), WOOD.trim);
    m.position.set(bx, by, ft / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }

  // ③ 牙子:框内缘一圈边(四条互不重叠,免共面闪烁)。
  //    `edge: null` 的匾是**素板无牙子** —— 天宫高耸、万古观瞻实物即如此,
  //    统一给所有匾都镶一道边,等于把一种做法安到全部匾上。
  if (pal.edge) {
    const qing = new MeshStandardMaterial({
      color: new Color(pal.edge), roughness: 0.82, metalness: 0.0,
    });
    for (const [bw, bh, bx, by] of [
      [w - fw, gl, 0, (h - fw) / 2], [w - fw, gl, 0, -(h - fw) / 2],
      [gl, ih - fw, -(w - fw) / 2, 0], [gl, ih - fw, (w - fw) / 2, 0],
    ]) {
      const m = new Mesh(new BoxGeometry(bw, bh, gl * 0.35), qing);
      m.position.set(bx, by, ft + gl * 0.175 - 0.001);
      g.add(m);
    }
  }

  for (const o of g.children) {
    o.userData = { partKey: spec.key, level: spec.level, type: 'plaque' };
  }
  return g;
}

/**
 * 挂本层该面的匾(没有就返回 null)。
 * @param {object} o
 *   feet    外槽柱脚序列(buildColumnRing.feet,顺序同 octagon.ringPositions)
 *           —— 取柱脚而非柱头:墙板正是按柱脚弦线立的,匾须挂在同一面上,
 *           取柱头会因侧脚内收 ~2 cm 而把匾压进墙里。
 *   y1      阑额下皮 = 墙身带上皮
 *   y0      楼面 = 墙身带下皮
 *   level   层号
 */
export function buildPlaques({
  feet, y0, y1, level, wallThickness = WALL.thickness, headroom = 0, bracketOut = 0,
  railTop = 0, fujieSoffit = 0, fujieTop = 0, doorTop = 0, pupaiBackY = 0,
}) {
  const list = PLAQUES.filter((s) => s.level === level);
  if (!list.length) return null;
  // 阑额下皮之上、铺作出跳开始之前的那一小段(阑额 + 普拍枋)。
  // 匾顶只要不超过它,就还在墙面层里,前面没有斗栱。
  const lanEHeadroomFree = fen(SECTION.lanE.h) + fen(SECTION.pupai.h);
  const g = new Group();
  g.name = `plaques_L${level}`;
  const band = y1 - y0;

  for (const spec of list) {
    // 该面当心间的两根平柱:ringPositions 每面三点(角、平−、平+)
    const i = spec.face * 3;
    const a = feet[i + 1]?.pos, b = feet[i + 2]?.pos;
    if (!a || !b) continue;
    const bay = a.distanceTo(b);
    // 先定这一方匾的「顶棚」与「底线」,可用净空即由两者相减 —— 尺寸按它钳
    /**
     * 顶棚按 zone 选(第43轮细分):
     *   fujieUnder  副阶檐下 → 副阶椽底;
     *   aboveFujie  副阶之上 → **普拍枋背**,即铺作出跳的起点。
     *     原用「阑额下皮 + headroom」,顶到 13.258,已探进铺作带 0.357 m ——
     *     匾被斗栱挡进去几乎看不见(用户第43轮)。一层这一带只有 0.68 m,
     *     匾必须整个落在里面。
     *   其余      塔身 → 阑额下皮 + 可占的铺作带。
     */
    const ceil0 = spec.zone === 'fujieUnder' && fujieSoffit > 0 ? fujieSoffit
      : spec.zone === 'aboveFujie' && pupaiBackY > 0 ? pupaiBackY
        : y1 + headroom;
    /**
     * `zone: 'aboveFujie'` —— 挂在**副阶屋面之上**的塔身(一层的「天柱地軸」)。
     * 下限不是楼面,而是**副阶抵墙线**:照片里这方匾在副阶瓦面之上、已进一层铺作带下缘。
     * 少了这一条,它会落在副阶屋面之下并穿出瓦面(断言二实测跨皮 0.048 m)。
     */
    const floor0 = spec.zone === 'aboveFujie' && fujieTop > 0
      ? fujieTop + 0.08
      : spec.zone === 'fujieUnder' && doorTop > 0
        ? doorTop + 0.12                       // 副阶檐下那一方:**坐在门额之上**
        : Math.max(y0, railTop > 0 ? railTop + 0.08 : y0);
    const availH = Math.max(0.2, ceil0 - spec.headGap - floor0);
    const { w, h, gap } = plaqueSize(spec, bay, band, headroom, availH);

    const mid = a.clone().add(b).multiplyScalar(0.5);
    const normal = new Vector3(mid.x, 0, mid.z).normalize();
    // 板背 = 墙外皮 + 挂空。柱脚中点即墙板中心所在的弦线,两者同面。
    // 首层是厚砖墙(0.86 m),用默认木墙厚会把匾埋进砖里 —— 墙厚由调用方给
    /**
     * 板背的贴附基准 = **该层墙面层最外的那件**的外皮 + 挂空。
     * 不能只看墙:普拍枋(38分 = 0.65 m 宽)比木墙(0.34)还外,
     * 只按墙算会让匾下缘撞进普拍枋(实测 0.053 m)。
     */
    /**
     * ★ 基准要按**匾所在的那一带**选,不能一律用墙厚。
     *   天柱地軸整个挂在墙带**之上**(阑额/普拍枋一带),那里根本没有墙;
     *   按首层砖墙(0.86 m)算,匾就被推出去 0.43 m 吊在空档里
     *   (第42轮实测下缘净距 0.464 m)。
     */
    const aboveWall = floor0 >= y1 - 1e-6;
    const faceOut = Math.max(aboveWall ? 0 : wallThickness / 2,
      fen(SECTION.pupai.w) / 2, fen(SECTION.lanE.w) / 2);
    const rBack = Math.hypot(mid.x, mid.z) + faceOut + S.standoff;

    const one = plaqueMesh(spec, w, h);
    /**
     * 板顶的常规位置就是**阑额下皮 − headGap** —— 匾挂在檐下、门窗之上,
     * 这是常制,不因为「允许越界」就都挤到铺作里去。
     * 只有**装不下**的那一方(释迦塔通高 3.08 m)才向上借铺作带,
     * 借到刚好落在楼面上为止,且不超过 headroom。这就是 A 案的意思:
     * 「可以盖住铺作带下部」是**例外的许可**,不是**统一的做法**。
     */
    const tilt = (S.tilt ?? 0) * Math.PI / 180;
    const hProj = h * Math.cos(tilt);         // 前倾后在立面上的竖向投影高
    /**
     * 竖向落位的三条约束,按优先级:
     *   ① 下缘**高于平座勾阑顶** —— 实景照(SRC-35)上,匾的下缘都在寻杖之上,
     *      栏杆不遮匾。第39轮之前匾底陷在勾阑后 0.5 m,视觉上被切掉一截。
     *   ② 上缘不超过该层**铺作顶**(橑檐枋背)—— 再往上就顶到椽了。
     *   ③ 下缘不越过楼面。
     * 三条打架时(释迦塔:实物 3.08 m 高,而勾阑顶到铺作顶只有 2.2 m),
     * 保 ② 放 ① —— 宁可下部被栏杆挡一截,也不能让匾捅穿屋檐。
     */
    const floor = floor0;
    /**
     * `zone: 'fujieUnder'` —— 挂在**副阶檐下**(一层的「萬古觀瞻」)。
     * 上限不是塔身的阑额下皮,而是**副阶椽底**:照片里这方匾头顶就是副阶的椽,
     * 按塔身基准挂会直接埋进副阶望板(第36轮实测入侵 0.136 m,当时因此撤件)。
     */
    const ceiling = ceil0;
    /**
     * 副阶檐下那一方**贴底挂**:它是给站在门前的人看的,
     * 挂到带的顶上就缩进副阶的阴影里了(用户第43轮:「应该更低在门上方即可见」)。
     * 其余各方仍是贴顶挂(匾挂檐下是常制),装不下才向下让。
     */
    let top = spec.zone === 'fujieUnder'
      ? floor + hProj
      : Math.min(y1 - gap, ceiling - gap);
    if (top - hProj < floor) top = floor + hProj;
    top = Math.min(top, ceiling - gap);
    /**
     * 前倾:绕**下缘**转,不绕板心。
     *   下缘要保持在挂空位置 rBack —— 绕板心转会让下缘往里钻 (h/2)·sinθ,
     *   对释迦塔是 0.32 m,正好钻进 0.34 m 厚的墙里。
     *   故反解板心:径向 rBack + (h/2)·sinθ,标高 下缘 + (h/2)·cosθ。
     */
    /**
     * ★ 外移量按**匾顶那个高度上**斗栱的实际外挑算,不是最外跳。
     *
     *   第40轮的写法一律推到「铺作最外跳 + 5 cm」,可匾的**主体**在墙面高度上,
     *   那里根本没有斗栱 —— 实测天宫高耸背后 2.07 m、释迦塔 0.83 m 内空无一物,
     *   整块匾**脱离塔身悬在半空**(用户第41轮指出)。
     *
     *   斗栱是自普拍枋背**逐跳向上向外**挑的:高出枋背 Δy,大致挑出
     *   Δy / 足材 × 一跳。匾顶只探进铺作带一点点,就只需让开一点点。
     *   下限 0:匾顶不到枋背时完全贴墙。
     */
    const pupaiBack = y1 + lanEHeadroomFree;
    const over = Math.max(0, top - pupaiBack);
    const outAtTop = Math.min(bracketOut, (over / ZUCAI) * TIAO_LEN);
    const rHang = Math.max(rBack, Math.hypot(mid.x, mid.z) + outAtTop + 0.04);
    const rC = rHang + (h / 2) * Math.sin(tilt);
    const yC = (top - hProj) + (h / 2) * Math.cos(tilt);
    one.position.set(normal.x * rC, yC, normal.z * rC);
    // YXZ:先绕局部 X 前倾,再绕 Y 转向 —— 顺序反了就成了绕世界 X 倾,匾会歪
    one.rotation.set(tilt, Math.atan2(normal.x, normal.z), 0, 'YXZ');
    one.userData = { partKey: spec.key, level, type: 'plaque' };
    g.add(one);
  }
  g.userData = { partKey: 'plaque', level, type: 'plaque' };
  return g;
}
