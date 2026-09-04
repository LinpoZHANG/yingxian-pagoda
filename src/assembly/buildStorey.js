/**
 * assembly/buildStorey.js —— 单层组装器
 * ─────────────────────────────────────────────────────────────
 * 把构件库组装成一个「结构层」单元。两种类型:
 *   明层(ming):柱网 → 墙/门窗 → 梁枋 → 外檐铺作 → 屋檐
 *   暗层(an) :结构柱环(短)→ 斜撑 → 平座铺作 → 平座 + 勾阑
 *   首层特殊:重檐(副阶周匝,额外一圈柱廊、铺作与屋面)
 *
 * group.userData 携带 { level, type, explodeOffset },结构分解与
 * 逐层导览只读 userData,不遍历几何。
 */

import { Group, InstancedMesh, Object3D, Vector3 } from 'three';
import { buildColumnRing } from '../components/column.js';
import {
  buildLintelRing, buildPupaiRing, buildRadialBeams, buildDiagonalBraces, buildBeamRingAt,
} from '../components/beam.js';
import { buildWalls } from '../components/wall.js';
import { buildGongYanBi } from '../components/gongyanbi.js';
import { buildPlaques } from '../components/plaque.js';
import { buildApexFrame } from '../components/roofframe.js';
import { buildRoof } from '../components/roof.js';
import { buildShengTouMu, buildJiaoLiang } from '../components/eavecorner.js';
import { buildPingzuo, buildBalustrade } from '../components/balustrade.js';
import { bracketGeometry, normalizeConfig } from '../components/bracket/assemble.js';
import { fen, SECTION, PUZUO, ZUCAI } from '../data/caifen.js';
import { BRACKET_LAYOUT, PINGZUO, WALL, FINIAL, ROOF_BUILDUP } from '../data/pagodaParams.js';
import { OCT_N, OCT_COS, faceAngle, apothem, polar } from './octagon.js';
import { WOOD } from '../materials/wood.js';

/** 柱头处的实际外接半径(柱脚半径扣除侧脚内收),供普拍枋等贴合柱头的构件用 */
const topRadius = (tops) => {
  const c = tops.find((t) => t.kind === 'corner') ?? tops[0];
  return Math.hypot(c.pos.x, c.pos.z);
};

/**
 * @param {object} p planPagoda() 产出的单层放样项
 * @returns {{group:Group, meta:object}}
 */
export function buildStorey(p) {
  const group = new Group();
  group.name = `storey_${p.level}_${p.type}`;
  const meta = { level: p.level, type: p.type, key: p.key, rings: {} };

  /* ── 柱网 ───────────────────────────────────────────────── */
  const isAn = p.type === 'an';
  // 暗层为结构层,柱短而直:不做侧脚生起(叉柱造夹于上下铺作之间)
  const colOpt = isAn ? { sideFoot: 0, shengqi: 0, plinth: false } : {};

  const outer = buildColumnRing({
    cornerR: p.cornerR, flatR: p.flatR,
    baseY: p.baseY, topY: p.columnTop,
    level: p.level, ringName: `${p.key}_outer`,
    partKey: isAn ? 'anColumn' : 'column', ...colOpt,
  });
  group.add(outer.group);
  meta.rings.outer = outer;

  if (p.innerR) {
    const inner = buildColumnRing({
      cornerR: p.innerR, flatR: null,
      // 暗层内槽柱坐**内槽**铺作顶(叉柱造);外槽铺作等级更高、顶更高,
      // 拿外槽的顶当内槽柱脚,内槽柱就会凭空低 0.70 m(第31轮)。
      baseY: (isAn && p.innerSeat) ? p.innerSeat : p.baseY, topY: p.columnTop,
      level: p.level, ringName: `${p.key}_inner`,
      partKey: isAn ? 'anColumn' : 'innerColumn', ...colOpt,
    });
    group.add(inner.group);
    meta.rings.inner = inner;
  }

  /* ── 梁枋层:阑额 → 普拍枋 → 乳栿 ─────────────────────────── */
  const lanEH = fen(SECTION.lanE.h);
  group.add(buildLintelRing(outer.tops, { level: p.level, partKey: 'lanE' }));
  group.add(buildPupaiRing(outer.tops, { level: p.level }));

  if (meta.rings.inner) {
    group.add(buildLintelRing(meta.rings.inner.tops, { level: p.level, partKey: 'lanE' }));
    // 内槽同样要有普拍枋:内槽铺作坐在「柱头 + 普拍枋」之上(与外槽同一放样行),
    // 少了它,内槽铺作就凭空悬在柱头上方一个普拍枋高(0.17 m)。
    group.add(buildPupaiRing(meta.rings.inner.tops, { level: p.level, partKey: 'pupai' }));
    group.add(buildRadialBeams(meta.rings.inner.tops, outer.tops, {
      section: isAn ? SECTION.caofu : SECTION.rufu,
      partKey: isAn ? 'caofu' : 'rufu', level: p.level,
    }));
  }

  /* ── 暗层斜撑 [图]2.pdf:把叠柱框架变成刚性桁架层 ──────────── */
  if (p.diagBrace) {
    group.add(buildDiagonalBraces(outer.tops, p.baseY, { level: p.level }));
  }

  /* ── 墙身:明层门窗 / 暗层版壁 ─────────────────────────────── */
  group.add(buildWalls({
    feet: outer.feet,
    // 墙下皮 = **楼面**(放样表现成行),不是柱础顶面。
    // 旧写法 baseY + 柱础露明高,把整道墙抬离地面 0.136 m —— 用户第13轮圈出的悬空。
    // 柱础是柱子的座,不是墙的座;墙在础之间落到楼面上。
    y0: p.baseY,
    y1: p.columnTop - lanEH,
    level: p.level,
    brick: !!p.brickWall,
    solid: isAn,
  }));

  /* ── 牌匾:三方御题,挂在南面当心间阑额之下 ─────────────────── */
  // 只有明层挂匾(暗层是平座背后的实带,无当心间可挂)。
  if (!isAn) {
    /**
     * A 案(第37轮裁定)+ 第40轮放宽:匾可越过阑额,盖住铺作带。
     * 上限自「柱头枋底」放到**该层铺作顶(橑檐枋背)** —— 实景照上,
     * 释迦塔与天下奇观的顶缘都接近檐下,把当心间的斗栱遮掉一大半。
     * 再往上就顶到檐椽了,故以铺作顶为界。
     */
    /**
     * 竖向上限:阑额 + 普拍枋 + **一个足材** —— 匾顶最多探进铺作带**一跳**。
     * 第40轮放到「铺作顶」的写法让释迦塔顶到最外跳,于是整块匾被推出墙外 1.7 m
     * 悬在半空(用户第41轮:「不能脱离塔主体结构悬空」)。
     * 斗栱是逐跳向上向外挑的:匾顶探得越高,匾就得让得越远。
     * 一跳是「既能盖住铺作带下缘、又还贴着塔身」的分界。
     */
    const headroom = lanEH + fen(SECTION.pupai.h) + ZUCAI;
    // 平座勾阑顶:匾的下缘要高过它,否则栏杆会在视觉上切掉匾的下半(第40轮)
    // 明层的楼面就是下面暗层的平座面,勾阑自楼面起;首层无平座(它有副阶)
    const railTop = p.level >= 2 ? p.baseY + fen(SECTION.gouLanH) : 0;
    // 该层外檐铺作自柱心向外的实际出挑(取合并几何的包围盒,不用名义跳数 ——
    // 昂、耍头、橑檐枋都在跳头之外,名义值会短一截)
    let bracketOut = 0;
    if (p.bracketCfg) {
      const bg = bracketGeometry({ ...p.bracketCfg, top: isAn ? 'deck' : 'liaoyan' });
      if (!bg.boundingBox) bg.computeBoundingBox();
      bracketOut = bg.boundingBox.max.z;
    }
    const pl = buildPlaques({
      feet: outer.feet, y0: p.baseY, y1: p.columnTop - lanEH, level: p.level,
      wallThickness: p.brickWall ? WALL.brickThickness : WALL.thickness,
      headroom, bracketOut, railTop,
      // 副阶椽底(抵墙处):副阶檐下那一方匾的上限
      fujieSoffit: p.fujie?.roof ? p.fujie.roof.topY - ROOF_BUILDUP : 0,
      // 副阶抵墙线:挂在副阶屋面之上那一方匾的下限
      fujieTop: p.fujie?.roof?.topY ?? 0,
      // 门额上皮 与 普拍枋背 —— 一层两方匾各自的贴底线 / 顶棚
      doorTop: p.baseY + (WALL.doorHeightAbs?.[p.level]
        ?? (p.columnTop - lanEH - p.baseY) * WALL.doorHeightRatio),
      pupaiBackY: p.columnTop + fen(SECTION.pupai.h),
    });
    if (pl) group.add(pl);
  }

  // 佛像系统由独立的 pagoda statue subsystem 挂载到塔体根节点，不在此处直接插入内槽人像。
  // 这样能保留木塔主体与背景不变，且利用现有楼层锚点作统一定位。

  /* ── 副阶柱廊(仅首层重檐)──────────────────────────────── */
  if (p.fujie) {
    const fj = buildColumnRing({
      cornerR: p.fujie.cornerR, flatR: p.fujie.flatR,
      baseY: p.fujie.baseY, topY: p.fujie.columnTop,
      level: p.level, ringName: 'fujie', partKey: 'fujieColumn',
    });
    group.add(fj.group);
    group.add(buildLintelRing(fj.tops, { level: p.level, partKey: 'lanE' }));
    group.add(buildPupaiRing(fj.tops, { level: p.level }));
    meta.rings.fujie = fj;
  }

  /* ── 铺作:外檐(或平座)+ 内槽 ───────────────────────────── */
  // 铺作坐面 = **它自己那根柱的柱头** + 普拍枋高。不取放样表的单一数字:
  // 柱头随生起起伏,坐面必须跟着走,否则一圈里总有几朵悬空或埋进枋里。
  const seatRise = fen(SECTION.pupai.h);
  // 栱眼壁:铺作带的墙面层,与铺作同一放样行(泥道栱平面),逐间填在普拍枋背之上
  group.add(buildGongYanBi(outer.tops, { level: p.level }));
  if (meta.rings.inner) group.add(buildGongYanBi(meta.rings.inner.tops, { level: p.level }));
  if (p.fujie) group.add(buildGongYanBi(meta.rings.fujie.tops, { level: p.level }));

  group.add(placeBrackets({
    tops: outer.tops, cfgBase: { ...p.bracketCfg, top: isAn ? 'deck' : 'liaoyan' },
    seatRise,
    cornerR: topRadius(outer.tops), level: p.level, facing: 'out',
    tag: `${p.key}_outer`,
  }));
  if (meta.rings.inner && p.innerBracket) {
    group.add(placeBrackets({
      tops: meta.rings.inner.tops, cfgBase: p.innerCfg ?? PUZUO[p.innerBracket], seatRise,
      cornerR: topRadius(meta.rings.inner.tops), level: p.level, facing: 'in',
      withBujian: false, tag: `${p.key}_inner`,
    }));
    // 明栿:内槽铺作背上的一圈栿,是内槽铺作真正承托的东西。
    // 缺了它,自佛堂内仰视,内槽铺作顶上什么都没有 —— 一圈斗拱顶着空气。
    if (p.innerTop) {
      group.add(buildBeamRingAt(meta.rings.inner.tops, p.innerTop, {
        section: SECTION.rufu, partKey: 'mingFu', level: p.level,
      }));
      // 乳栿(明栿):自内槽铺作背上径向搭到外槽 —— 外檐铺作的**里跳**承的就是它。
      // 缺了它,自室内看,外圈那一圈铺作里跳同样顶着空气:第31轮只补了内槽一圈,
      // 外槽里跳仍无着落(用户第32轮指出「仅这一圈是否就是全部」)。
      // 标高取内槽铺作顶(两槽铺作等级不同、顶不等高,乳栿以低者为准,
      // 在外槽一侧穿入铺作 —— 那正是「乳栿入铺作」的做法,属穿插不属坐于)。
      group.add(buildRadialBeams(meta.rings.inner.tops, outer.tops, {
        section: SECTION.rufu, partKey: 'ruFuMing', level: p.level, y: p.innerTop,
      }));
    }
  }
  if (p.fujie) {
    group.add(placeBrackets({
      tops: meta.rings.fujie.tops, cfgBase: p.fujie.bracketCfg, seatRise,
      cornerR: topRadius(meta.rings.fujie.tops), level: p.level, facing: 'out',
      tag: 'fujie',
    }));
  }

  /* ── 平座与勾阑(暗层外观:「明五暗四」的可读性全靠这一圈)──── */
  if (p.pingzuoY) {
    // 通高层的楼面在内槽范围内不铺板(PINGZUO.openInner,第35轮资料方裁定)
    const openR = PINGZUO.openInner[p.level] ? (p.innerR ?? 0) : 0;
    group.add(buildPingzuo({ outerR: p.pingzuoR, y: p.pingzuoY, level: p.level, openR }));
    group.add(buildBalustrade({ outerR: p.pingzuoR, y: p.pingzuoY, level: p.level }));
  }

  /* ── 屋檐:檐口标高与外缘取实测剪影,举折/翼角由 roof.js 生成 ──── */
  // 翼角承托:生头木垫在橑檐枋背上把起翘垫出来,角梁坐转角铺作把它传下去。
  // 必须在屋面之前加入 —— 屋面皮肤的起翘幅值就取自这条承托线(roof.js:shengTouAt)。
  const eaveFrame = (rf, tag) => {
    group.add(buildShengTouMu(rf, { level: p.level }));
    group.add(buildJiaoLiang(rf, { level: p.level }));
    group.add(buildRoof({
      ...rf,
      // 顶层:垂脊收头于砖石刹基外缘,不再汇聚到塔心埋进刹里(第39轮)
      // 垂脊不再截断:顶层屋面的**上口**已经就是刹座下口(plan.js),
      // 八条脊自然在那一圈收住 —— 这才是「收口到一个位置」。
      // 第39轮的 ridgeStopR 是硬截断,断面露在座外成了八片孤立的鳍。
      ridgeStopR: 0,
    }, {
      level: p.level, name: tag,
      // 檐椽根部落在橑檐枋背 + 生头木上,不用名义铺作顶
      soffit: { innerR: rf.liaoyanR, innerY: rf.soffitY },
    }));
  };
  if (p.roof) eaveFrame(p.roof, `roof_L${p.level}`);

  /* ── 攒尖屋架:顶层屋顶之下的叠梁支撑(第45轮补)────────────── */
  // 内槽铺作顶到攒尖顶原有 6.95 m 的空档,除瓦皮与望板外一无所有 ——
  // 六米多高的攒尖靠自己立着。版17 断面上这一段是**层层叠架的梁与蜀柱**。
  if (p.roof?.isTop && meta.rings.inner && p.innerTop) {
    group.add(buildApexFrame({
      ...p.roof,
      ridgeStopR: 0,
    }, {
      level: p.level,
      innerR: p.innerR,
      innerTop: p.innerTop,
      shajiR: (FINIAL.segments[0].w0 / 2) / OCT_COS,
      shajiY: FINIAL.segments[0].y0,
    }));
  }
  if (p.fujie?.roof) eaveFrame(p.fujie.roof, 'roof_fujie');

  group.userData = {
    level: p.level, type: p.type, key: p.key,
    partKey: 'storey',
    // 分解视图:各层沿 Y 逐层拉开,间距随层序递增
    explodeOffset: 0,
  };
  return { group, meta, topY: p.bracketTop };
}

/* ═══════════════════════════════════════════════════════════════
 * 铺作铺放
 * ─────────────────────────────────────────────────────────────
 * 朵位规则 [图]BRACKET_LAYOUT:
 *   每面 = 2 朵柱头铺作(坐两平柱)+ 每间 1 朵补间(3 间);
 *   每角 1 朵转角铺作。单圈 48 朵,外檐+平座十圈共 480 朵。
 * 性能:同 config 只生成一次几何,同层同型用 InstancedMesh 一次绘制。
 * ═══════════════════════════════════════════════════════════════ */

/**
 * @param {object} o
 *   tops      柱头序列(决定柱头铺作朵位,pos.y 即该柱柱头顶面)
 *   cfgBase   PUZUO 表中的等级配置
 *   seatRise  自柱头顶面到栌斗底的高度(= 普拍枋高)
 *   cornerR   角柱环外接半径(补间按边心距定位)
 *   facing    'out' 外檐 | 'in' 内槽
 *   withBujian/withCorner  是否铺补间 / 转角(内槽从简)
 */
function placeBrackets({
  tops, cfgBase, seatRise, cornerR, level, facing = 'out',
  withBujian = true, withCorner = true, tag = '',
}) {
  const group = new Group();
  group.name = `brackets_${tag}`;
  /** @type {Map<string,{cfg:object, list:{pos:Vector3,angle:number,kind:string}[]}>} */
  const buckets = new Map();
  const push = (cfg, pos, angle, kind, face) => {
    const C = normalizeConfig(cfg);
    if (!buckets.has(C.key)) buckets.set(C.key, { cfg: C, list: [] });
    buckets.get(C.key).list.push({ pos, angle, kind, face });
  };

  for (const t of tops) {
    const isCorner = t.kind === 'corner';
    if (isCorner && !withCorner) continue;
    push(
      { ...cfgBase, facing, role: isCorner ? 'zhuanjiao' : 'zhutou' },
      new Vector3(t.pos.x, t.pos.y + seatRise, t.pos.z), t.angle,
      isCorner ? 'zhuanjiao' : 'zhutou', t.face,
    );
  }

  /* 补间:每间一朵,坐于该间的中点。
   * 间的划分不另设数 —— 直接由柱位反解:每面四柱(角·平·平·角)分出
   * 次间 / 当心间 / 次间三间,取相邻两柱的中点、再投影到面的边心距线上
   * (角柱在外接圆上,两柱中点略偏内,而补间坐在普拍枋上,须落在面线)。*/
  if (withBujian && BRACKET_LAYOUT.perFace.bujian > 0) {
    const apo = apothem(cornerR);
    for (let f = 0; f < OCT_N; f++) {
      const a = faceAngle(f);
      const faceMid = polar(a, apo, 0);
      const tan = new Vector3(Math.cos(a), 0, -Math.sin(a));
      const i0 = f * 3;
      const bayEnds = [
        tops[i0], tops[i0 + 1], tops[i0 + 2], tops[(i0 + 3) % tops.length],
      ];
      for (let b = 0; b < bayEnds.length - 1; b++) {
        const m = bayEnds[b].pos.clone().add(bayEnds[b + 1].pos).multiplyScalar(0.5);
        const off = m.clone().sub(faceMid).setY(0).dot(tan);   // 面内切向偏移
        // 补间的坐面 = 该间两端柱头的插值 + 普拍枋高(普拍枋在这一间正是这个斜面)
        const seatY = (bayEnds[b].pos.y + bayEnds[b + 1].pos.y) / 2 + seatRise;
        push(
          { ...cfgBase, facing, role: 'bujian', bay: b === 1 ? 'dangxin' : 'cijian' },
          faceMid.clone().addScaledVector(tan, off).setY(seatY), a, 'bujian', f,
        );
      }
    }
  }

  const dummy = new Object3D();
  for (const { cfg, list } of buckets.values()) {
    const geo = bracketGeometry(cfg);
    const mesh = new InstancedMesh(geo, WOOD.bracket, list.length);
    mesh.castShadow = mesh.receiveShadow = true;
    list.forEach((it, i) => {
      dummy.position.copy(it.pos);
      // 铺作局部 +Z = 出跳方向;绕 Y 转到该朵所在方位(内槽反向朝心)
      dummy.rotation.set(0, facing === 'in' ? it.angle + Math.PI : it.angle, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData = {
      partKey: 'bracketSet', level, type: 'bracket', config: cfg,
      instances: list.map((it) => ({ partKey: 'bracketSet', kind: it.kind, face: it.face, level, grade: cfg })),
    };
    group.add(mesh);
  }
  group.userData = { partKey: 'bracketSet', level, type: 'bracketRing' };
  return group;
}
