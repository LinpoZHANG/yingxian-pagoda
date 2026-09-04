/**
 * components/eavecorner.js —— 翼角承托构件:生头木 + 角梁
 * ─────────────────────────────────────────────────────────────
 * 起翘不是画在瓦面上的一个场,而是**垫出来、传下去**的。
 * 第15轮之前,起翘只施加于屋面型线与椽,而承托线(橑檐枋背)在一圈上是平的,
 * 角区椽扇因此比它下面的承托线高出 0.15~0.49 m,中间空无一物 —— 没有传力路径。
 *
 * 本文件补的正是那条路径:
 *   生头木 [法] 楔形垫木,坐在橑檐枋背上,高度场 h(u) = cornerLift × w(u);
 *             w 为角区权重(smoothstep,C1 连续:起坡点 0 → 角部 1)。
 *             檐椽的内端由它承托,起翘从此有出处。
 *   大角梁 [法] 坐于转角铺作最外跳,沿角平分线斜出至檐口角尖;
 *   仔角梁 [法] 叠于大角梁之上,再挑出一截,角区扇列椽逐根搭靠其侧。
 *
 * 一切高程都走 roof.js 的剖面接口(shengTouAt / createRoofSection),
 * 本文件不自算型线 —— 那会是第二条放样线。
 */

import {
  Group, Mesh, BoxGeometry, SphereGeometry, BufferGeometry, Float32BufferAttribute, Vector3,
} from 'three';
import { fen, SECTION, PART } from '../data/caifen.js';
import { ROOF_BUILDUP, ROOF } from '../data/pagodaParams.js';
import { OCT_N } from '../assembly/octagon.js';
import { createRoofSection, chordSag, SIN_HALF, shengQiAt } from './roof.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 套兽自梁端往外的**前伸量**,以 M = max(梁宽, 仔角梁高) 为单位。
 * 由几何定义反算,**与建模处同源**:套筒进深 L = 0.62M、前口 zF = 0.31M,
 * 最前的一件是吻(球心 zF + 0.40M,z 半轴 0.34M),梁端在局部 z = −0.15L。
 *   reach = (0.31 + 0.40 + 0.34) + 0.15 × 0.62 ≈ 1.14M
 * 改套兽尺寸时**必须同步改这里**,否则收口红线会失效。
 */
const TAOSHOU_REACH = 1.14;
import { WOOD } from '../materials/wood.js';
import { TERRACOTTA } from '../materials/tile.js';

const NS = 24;                       // 生头木沿面宽向的采样段数(楔面折线;段数不足会让弦低于光滑场,椽会陷进去)

/**
 * 生头木:每面两端各一条楔形垫木,自起坡点(|u| = cornerZone)渐高至角部。
 * 断面沿橑檐枋摆放:长向 = 面的切向,厚向 = 橑檐枋宽。
 */
export function buildShengTouMu(P, { level = 0 } = {}) {
  const g = new Group();
  g.name = `shengTouMu_L${level}`;
  const depth = fen(SECTION.liaoyan.w);
  // 橑檐枋背随柱头生起起伏(剖面为面心基准,故此处按 u 加回生起)
  const backAt = (u) => P.liaoyanY - ROOF_BUILDUP + shengQiAt(u, P.uFlat ?? 0);
  const sec = createRoofSection(P);
  const vL = sec.vAtRadius(P.liaoyanR);
  const zone = P.cornerZone;

  // ★ 上皮直接取**椽底线**在橑檐枋处的位置(sec.point − 构造厚),平面位置也照抄 ——
  //   不再另按理想八角线摆。角区的剖面带冲出,椽的内端因此被推到八角线之外,
  //   若生头木仍摆在八角线上,椽就落在它外侧的空气里(第15轮断言四实测:大量探空)。
  // 椽是**直杆**,而角区的剖面是弯的:roof.js 用 chordSag 把整根压下去以免顶穿瓦面。
  // 生头木的上皮必须**照抄这条压下去之后的线**,否则椽会嵌进它 sag 那么深。
  const dChuan = fen(SECTION.chuanDia), feiW = fen(SECTION.feiziW);
  const dropChuan = ROOF_BUILDUP - dChuan / 2;
  const pt = (fi, u) => {
    const halfU = (Math.max(dChuan, feiW) / 2) / (P.eaveR * SIN_HALF);
    const sag = chordSag(sec, fi, u, vL, dropChuan, halfU);
    const p = sec.point(fi, u, vL, new Vector3());
    return new Vector3(p.x, p.y - ROOF_BUILDUP - sag, p.z);
  };

  const topY = (fi, u) => pt(fi, u).y;
  g.userData = { topY };
  for (let fi = 0; fi < OCT_N; fi++) {
    for (const sign of [-1, 1]) {
      const pos = [], idx = [];
      for (let i = 0; i <= NS; i++) {
        const u = sign * (zone + (1 - zone) * (i / NS));
        const top = pt(fi, u);
        // 厚向 = 该点的径向(与橑檐枋垂直),半宽 depth/2
        const rad = new Vector3(top.x, 0, top.z).normalize().multiplyScalar(depth / 2);
        const back = backAt(u);
        for (const s2 of [-1, 1]) {
          pos.push(top.x + rad.x * s2, top.y, top.z + rad.z * s2);   // 上缘
          pos.push(top.x + rad.x * s2, back, top.z + rad.z * s2);    // 下缘
        }
      }
      // 每段 8 个顶点(内外两侧 × 上下),连成四个面
      for (let i = 0; i < NS; i++) {
        const a0 = i * 4, b0 = (i + 1) * 4;
        const quad = (p, q, r2, s3) => idx.push(p, q, r2, p, r2, s3);
        quad(a0 + 0, b0 + 0, b0 + 2, a0 + 2);       // 顶面
        quad(a0 + 1, a0 + 3, b0 + 3, b0 + 1);       // 底面
        quad(a0 + 0, a0 + 1, b0 + 1, b0 + 0);       // 内侧
        quad(a0 + 2, b0 + 2, b0 + 3, a0 + 3);       // 外侧
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new Mesh(geo, WOOD.rafter);
      m.castShadow = m.receiveShadow = true;
      m.userData = { partKey: 'shengTouMu', level, type: 'roof' };
      g.add(m);
    }
  }
  g.userData = { partKey: 'shengTouMu', level, type: 'roof' };
  return g;
}

/**
 * 生头木上皮在 (fi,u) 处的标高 —— **承托线的对外唯一读数口**。
 * 断言四用它做解析判据:椽是离散圆杆,铅垂投射会大量打空,量不准。
 */
export function shengTouTopY(P, fi, u) {
  const sec = createRoofSection(P);
  const vL = sec.vAtRadius(P.liaoyanR);
  const dChuan = fen(SECTION.chuanDia), feiW = fen(SECTION.feiziW);
  const halfU = (Math.max(dChuan, feiW) / 2) / (P.eaveR * SIN_HALF);
  const sag = chordSag(sec, fi, u, vL, ROOF_BUILDUP - dChuan / 2, halfU);
  return sec.point(fi, u, vL, new Vector3()).y - ROOF_BUILDUP - sag;
}

/**
 * 角梁:大角梁坐于转角铺作最外跳,仔角梁叠其上。
 * 断面取 2 倍椽径 [法,保守值;版18-19 精读后按图校]。
 */
export function buildJiaoLiang(P, { level = 0 } = {}) {
  const g = new Group();
  g.name = `jiaoLiang_L${level}`;
  const sec = createRoofSection(P);
  // ★ 断面高由**屋面构造厚反解**(第29轮:用户圈出的红楔即此件穿出瓦面)。
  //   旧值大小角梁各取 2 椽径(0.306)**上下叠放**,合高 0.612 m;
  //   而橑檐枋背到瓦面只有 ROOF_BUILDUP = 0.505 m,其中还要扣掉瓦厚 0.16 ——
  //   可用净空仅 0.345 m。**这一摞根本放不进去**,仔角梁于是顶穿瓦面
  //   (实测 L1 +0.033 / L2 +0.045 / L3 +0.109 / L5 +0.445 m)。
  //   宽度不受此限,仍取 2 椽径;高度按净空分配:大角梁 0.58、仔角梁 0.40。
  //   [派生]自 ROOF_BUILDUP 与 ROOF.thickness;版18-19 精读后按图校。
  const w = fen(SECTION.chuanDia) * 2;             // 断面**宽** = 2 椽径
  const clear = ROOF_BUILDUP - ROOF.thickness;     // 橑檐枋背 → 望板下皮 的净空
  const hDa = clear * 0.58, hZi = clear * 0.40;
  const back = P.liaoyanY - ROOF_BUILDUP + shengQiAt(1, P.uFlat ?? 0);   // 角部:转角铺作顶 = 橑檐枋背
  const tailIn = fen(PART.tiao) * 2;               // 尾端压入内跳两跳

  for (let fi = 0; fi < OCT_N; fi++) {
    const tip = sec.point(fi, 1, 0, new Vector3());                       // 檐口角尖
    const root = sec.point(fi, 1, sec.vAtRadius(P.liaoyanR), new Vector3());
    const horiz = new Vector3(root.x, 0, root.z).normalize();
    // 尾端自角部承托线再向内退两跳,坐到转角铺作背上
    const A0 = new Vector3(root.x, back, root.z).addScaledVector(horiz, -tailIn);
    const B0 = new Vector3(tip.x, 0, tip.z);
    // 首端顶面上限 = 望板下皮。★ 梁有宽度(2 椽径),它横跨的那一小段面内区间里
    //   起翘正在急剧下落 —— 只按 u=1 一点取限,梁的两个外角仍会顶穿
    //   (L5 实测 +0.262 m @u=0.97)。故在半宽范围内取**最低**的那一点为限。
    const halfU = (w / 2) / (P.eaveR * SIN_HALF);
    let tipTop = Infinity;
    for (const uu of [1, 1 - halfU * 0.5, 1 - halfU, 1 - halfU * 1.5]) {
      tipTop = Math.min(tipTop, sec.point(fi, Math.max(-1, uu), 0, new Vector3()).y);
    }
    tipTop -= ROOF.thickness;

    // 断面是方料,梁**斜置**:要让「尾端底面坐实、首端顶面不顶穿瓦面」,
    // 轴线须沿竖直方向各让半个断面的**斜距**(w/2 ÷ cos 倾角),故先估倾角再回代。
    for (const [k, extra, key, hB] of
      [[0, 0, 'daJiaoLiang', hDa], [1, w * 0.9, 'ziJiaoLiang', hZi]]) {
      // ★ 两端各自定死,不再靠包围盒事后平移(第29轮):
      //   尾端**底面**坐在承托面上,首端**顶面**贴在望板下皮之下 ——
      //   斜置方料的竖向让量是 (h/2)·cosθ,倾角由两端反解,故迭代两次即收敛。
      //   旧写法按包围盒把整根梁抬到尾端落位,首端随之抬起,L5 顶穿瓦面 0.445 m。
      const lift = k * hDa;
      let half = hB / 2;
      let p0 = A0.clone().setY(back + lift + half);
      let p1 = B0.clone().setY(tipTop - half);
      for (let it = 0; it < 3; it++) {
        const d0 = new Vector3().subVectors(p1, p0);
        const cosT = Math.hypot(d0.x, d0.z) / (d0.length() || 1);
        half = (hB / 2) * cosT;
        p0 = A0.clone().setY(back + lift + half);
        p1 = B0.clone().setY(tipTop - half);
      }
      const d = new Vector3().subVectors(p1, p0);
      const unit = d.clone().normalize();
      let len = d.length() + extra;

      /**
       * ★ 檐角收口(第49轮 · 资料方持实景照定案)
       *
       * 照片上的翼角是**干净收口**:瓦当排到角尖,没有木料挑到檐外。
       * 而我建的这一版量下来 —— 仔角梁头超出屋面角尖 **+0.39 m**,
       * 套兽再往外 **+0.83 m**,整个从檐口挑了出去。
       * 裁决:「把挑出来的木头和檐兽都收回去,至少和屋檐边缘在一个垂直位置」。
       *
       * 故以**屋面角尖的水平半径**为红线,逐根反解梁长:
       *   · 仔角梁 —— 端点半径 ≤ 红线 **减去套兽的前伸量**,
       *     因为套兽罩在它头上、必然比它更外,红线要留给套兽的最外点;
       *   · 大角梁 —— 再往内 0.5M,**短于仔角梁**。
       *     它在仔角梁下方,套兽只罩仔角梁头;只按红线收它,它就比仔角梁长出
       *     0.35 m,一个大方木头直接从兽头前面冒出来(第一版实测)。
       *     **只收一根的长度,另一根不会自己跟上。**
       * 半径沿 unit 不是线性的(unit 有向下分量),故二分反解,不按比例缩。
       */
      const Rlimit = Math.hypot(B0.x, B0.z) - 0.03;
      const M = Math.max(w, hZi);
      const cap = Rlimit - M * (TAOSHOU_REACH + (key === 'ziJiaoLiang' ? 0 : 0.5));
      const rAt = (t) => {
        const q = p0.clone().addScaledVector(unit, t);
        return Math.hypot(q.x, q.z);
      };
      if (rAt(len) > cap) {
        let lo = 0, hi = len;
        for (let it = 0; it < 40; it++) {
          const mid = (lo + hi) / 2;
          if (rAt(mid) > cap) hi = mid; else lo = mid;
        }
        len = Math.max(lo, hB);        // 兜底:再短也得是一根梁,不是一片纸
      }

      const mesh = new Mesh(new BoxGeometry(w, hB, len), WOOD.pillar);
      mesh.position.copy(p0).addScaledVector(unit, len / 2);
      mesh.lookAt(p0.clone().addScaledVector(unit, len));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { partKey: key, level, type: 'roof' };
      g.add(mesh);

      /**
       * 套兽 —— 套在**仔角梁头**上的陶件。
       *
       * ★ 第49轮:用户报「屋檐角的木头露出来了」。量下来是这样 ——
       *   仔角梁头在 r=16.944 / y 24.08~24.47,而我把套兽放在了
       *   **屋面皮肤的角尖**(r=16.643 / y=24.798):高 0.33~0.72 m、靠内 0.30 m,
       *   压根没罩住,那一截木头就明晃晃露在檐角外。
       *
       *   套兽是**套在角梁头上**的,不是摆在瓦面角上的 ——
       *   它的位置只能由角梁自己给出,所以这件构件就该生在这里,
       *   而不是在 roof.js 里按皮肤坐标另算一遍。
       *   **一个构件依附于谁,就该由谁来定位。**
       */
      if (key === 'ziJiaoLiang') {
        /* 形制:**短方兽头**,不是筒。第49轮先做成八棱锥台,资料方一眼看出
         * 「和现实完全不符」—— 那个细长收口的喇叭在檐角下斜伸出小半米,
         * 读起来像个漏斗。实物套兽是罩在梁头上的一顶**方帽子**:
         * 外廓比角梁断面大一圈、进深约一个断面高,前脸做兽面(吻、眼、角)。
         * 远观决定成败的是**轮廓**——短、贴梁头、头颅圆浑。
         * (第二版:头做成方板脸像个盒子,改用压扁的低分段球做头颅与吻。) */
        const tipEnd = p0.clone().addScaledVector(unit, len);
        // 套筒只求**刚好罩住**梁头断面(判据锚),尺寸压到最小,好整个藏进头颅里 ——
        // 套筒一旦比头颅宽,它的方边框就在头颅四周露出一圈,读成「相框里嵌个脸」(第四、五版)。
        const W = w * 1.08, H = hB * 1.10;
        const M = Math.max(w, hB);
        const L = M * 0.62;                       // **套筒段**进深(判据只认这一段;其余是兽面)
        const box = (x, y, z, sx, sy, sz, rx = 0) => {
          const b = new BoxGeometry(sx, sy, sz);
          if (rx) b.rotateX(rx);
          b.translate(x, y, z); return b;
        };
        const ball = (x, y, z, ax, ay, az) => {
          const b = new SphereGeometry(1, 8, 6);
          b.scale(ax, ay, az); b.translate(x, y, z); return b;
        };
        const zF = L / 2;                          // 筒的前口,兽面自此长出
        // (前伸量 TAOSHOU_REACH 由下面的吻的最前端反算,见文件顶部常量)
        const parts = [
          box(0, 0, 0, W, H, L),                                     // 套筒(罩梁头)
          /* 头颅要**近球**:z 向半轴与横向相当。做成横向扁椭球,俯视就读成贝壳(第三版);
           * 又不能比套筒窄,否则方套筒的前脸露出来,读成「方框里嵌个椭圆」(第四版)。 */
          ball(0, H * 0.02, zF + M * 0.20, W * 0.80, H * 0.82, M * 0.50),   // 头颅(要盖住套筒四角)
          ball(0, -H * 0.44, zF + M * 0.40, W * 0.44, H * 0.32, M * 0.34),  // 吻(前下探)
          ball(-W * 0.42, H * 0.40, zF + M * 0.52, W * 0.19, H * 0.19, M * 0.15), // 左目
          ball(W * 0.42, H * 0.40, zF + M * 0.52, W * 0.19, H * 0.19, M * 0.15),  // 右目
          box(-W * 0.42, H * 0.86, zF + M * 0.02, W * 0.17, H * 0.46, M * 0.17, -0.5), // 左角
          box(W * 0.42, H * 0.86, zF + M * 0.02, W * 0.17, H * 0.46, M * 0.17, -0.5)   // 右角
        ];
        const sock = new Mesh(mergeGeometries(parts, false), TERRACOTTA);
        // 梁端埋进筒内 0.15L 处(判据只认套筒段),兽面再往外伸
        sock.position.copy(tipEnd).addScaledVector(unit, L * 0.15);
        sock.lookAt(tipEnd.clone().addScaledVector(unit, 1));
        sock.castShadow = sock.receiveShadow = true;
        sock.userData = { partKey: 'taoShou', level, type: 'roof' };
        // 判据锚:**套筒段**尺寸(不含兽面凸起),挂 userData 供断言十三读
        sock.userData.socket = { W, H, L };
        g.add(sock);
      }
    }
  }
  g.userData = { partKey: 'jiaoLiang', level, type: 'roof' };
  return g;
}

