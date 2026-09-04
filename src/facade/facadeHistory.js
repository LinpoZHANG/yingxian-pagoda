/**
 * facade/facadeHistory.js —— 古今变化(立面材料演变)系统
 * ─────────────────────────────────────────────────────────────
 * 资料源:`reference/FacadeHistory/`(v1.0 2026-09-04)
 *
 * 这个模块只做一件事:让二至五层明层**次间**在两副面孔之间来回 ——
 *   古貌(survey_1933) 夹泥墙 + 墙内斜撑
 *   今貌(current_2017_plus) 木版壁(现有 components/wall.js 的产物)
 *
 * ★ 边界(用户第39轮裁定,与资料包时间线一致):
 *   柱、阑额、普拍枋、铺作、屋面、平座勾阑、首层、台基、塔刹在两个年代之间
 *   没有可考的形态变化 —— 一律不碰。既不改它们的几何,也不改它们的材质。
 *   本模块对既有代码的全部依赖只有一处:components/wall.js 给次间墙片挂上的
 *   `userData.{face,bay}` 语义标记(纯附加,不影响几何)。
 *
 * ★ 过渡(资料包 §5):不许瞬切,也不许只做色相切换。2 秒分三段 ——
 *   抹灰退 → 墙内斜撑短暂显露 → 木版壁接手。
 *   这是**历史结构解释动画**,不声称真实维修按此顺序发生。
 *
 * ★ 今貌一侧的次间材质由本模块接管为独占的一族(MODERN_PLANKS):
 *   一来能独立做淡入淡出,二来那面墙是**木板刷红涂料**,与裸木的栏杆斗栱
 *   本就不是同一种做法,该有自己的色号 —— 而且逐块板各不相同,不是平铺一色。
 */

import { Mesh, InstancedMesh, MeshStandardMaterial, Vector2, Vector3, Color } from 'three';
import { WOOD } from '../materials/wood.js';
import { PLASTER, BRICK } from '../materials/tile.js';
import { woodGrainTexture } from '../materials/textures.js';
import { fen, SECTION } from '../data/caifen.js';
import { registerStudyMaterial } from '../materials/studyMode.js';
import {
  buildHistoricWalls, buildHistoricCenterBays,
  MUD_PLASTER, MUD_FRAME, MUD_TRIM, MUD_BRACE, MUD_STUDY_COLORS,
} from './mudWall.js';
import {
  ERA_LEVELS, ERA_DEFAULT, ERA_TRANSITION, FACADE_ERAS,
  MODERN_COAT, MODERN_RED_WALL, COLUMN_COAT, COLUMN_ANCIENT, TRIM_COAT,
} from './facadeEras.js';

/** 与 materials/wood.js:woodMat 同一口径的木质材质(那里没导出,此处不重复其数值) */
function coatMat({ base, contrast, seed, roughness, mottle = 0 }) {
  const { map, normalMap, roughnessMap } = woodGrainTexture({ base, contrast, seed, mottle });
  return new MeshStandardMaterial({
    map, normalMap, roughnessMap,
    color: new Color(0xf2ece8),
    roughness, metalness: 0.0,
    normalScale: new Vector2(0.6, 0.6),
  });
}

/**
 * 今貌的油饰面:实物上的栱眼壁、门上余壁、窗上下余壁、门颊都是**木面加暗红油饰**,
 * 不是浅色抹灰。抹灰只属于古貌 —— 切到古貌时这些面原样交还给 PLASTER。
 */
const MODERN_COAT_MAT = coatMat(MODERN_COAT);

/**
 * 今貌次间版壁 —— **木板上刷红涂料**,与裸木的栏杆斗栱是两种做法,故另起一族。
 *
 * 逐块板一个色号:先做一份基底,再克隆出几份只换 `color` 乘子的变体。
 * `Material.clone()` 共享贴图,所以这几个色号既不多一张贴图,也不多一次绘制 ——
 * 版壁在 wall.js 里本来就是一块板一个网格。
 */
const MODERN_PLANKS = MODERN_COAT.plankBases.flatMap(({ base, seed }) => {
  const proto = coatMat({ base, contrast: MODERN_COAT.plankContrast, seed, roughness: 0.88 });
  return MODERN_COAT.plankTints.map((hex) => {
    const m = proto.clone();          // clone 共享贴图:六种板面只有两张贴图
    m.color = new Color(hex);
    return m;
  });
});

/** 32 位雪崩混合(murmur3 的 finalizer)——一位输入之差要能翻遍输出的每一位 */
function mix32(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * 立面外檐柱的油饰红 —— 与版壁同一套做法,只是压深一档(见 facadeEras.COLUMN_COAT)。
 * 与年代无关:两个年代柱子都是红的,古貌里与浅色夹泥墙相间成「红白相间」。
 */
const COLUMN_MAT = coatMat(COLUMN_COAT);

/**
 * 古貌的立面柱枋 —— 赭土色,与夹泥墙同色系、低一档(见 facadeEras.COLUMN_ANCIENT)。
 * 与今貌那遍红之间走**面层渐变遮罩**:本体挂这一份,副本挂 COLUMN_MAT,
 * 切换年代时渐变互换 —— 与栱眼壁、余壁、一层墙同一条曲线,整块一起变。
 */
const COLUMN_ANCIENT_MAT = coatMat(COLUMN_ANCIENT);
const colTmp = new Color();
/** 逐柱抖动:与 plankTone / bracketTone 同一口径,定值不随机 */
function colJitter(level, index) {
  let h = mix32(level + 0x2f19);
  h = mix32(h ^ index);
  return (h / 0xffffffff) * 2 - 1;
}

/**
 * 逐块板选色:由 (层·面·间·板序) 定值,不用随机数 ——
 * 随机数每次加载会换一张脸,而木板的深浅是**它自己的属性**,不该随刷新变。
 * 间序自板心的水平位置取:同一面的两个次间在 userData 里都记作 'cijian',
 * 分不开,而它们的坐标分得开。
 *
 * ★ 四个输入必须**逐级混合**,不能各乘一个大质数再异或。
 *   头一版那么写,出来是 `A B A B A B` 的条纹:板面种数是 6 = 2×3,
 *   而 `板序 × 奇数` 的**奇偶性随板序交替**,异或与右移 13 位都盖不住这一位,
 *   于是它直接漏到了 `% 6` 的结果上 —— 逐块变化反倒成了整齐的横道。
 *   凡「哈希 → 取模选变体」的地方,模数与输入之间的公因子都得先用雪崩打散。
 */
function plankTone(level, face, mesh, index) {
  const bay = Math.round((mesh.position.x + mesh.position.z) * 7);
  let h = mix32(level + 0x9e37);
  h = mix32(h ^ face);
  h = mix32(h ^ bay);
  h = mix32(h ^ index);
  return MODERN_PLANKS[h % MODERN_PLANKS.length];
}
/** 版壁衬板在 wall.js 里用的是 `WOOD.plank ?? WOOD.pillar`,两个来源都要认 */
const PLANK_SOURCES = [WOOD.plank, WOOD.pillar];

/**
 * 勾阑与格扇的木色族 —— 三档明度,共用一张贴图(`Material.clone()` 共享 map)。
 *
 * 做**两套**同色的材质,不是一套:
 *   `TRIM_TONES`  给勾阑 —— 两个年代都在,**不参与过渡**,永远不透明;
 *   `MODERN_TRIMS` 给明层格扇 —— 只属今貌,要跟着 modernAlpha 淡入淡出。
 * 共用一套的话,古今切换时会把全塔的勾阑一起拖淡 ——
 * 这正是第47轮格扇改挂 `WOOD.trim` 之后踩过的那个坑的反面。
 */
function trimFamily() {
  // 三种木纹 × 三档明度 = 九种面。木纹按 seed 分,`woodGrainTexture` 内部有缓存,
  // 故两套家族(勾阑 / 格扇)共九个材质对象,底下只有三张贴图。
  return TRIM_COAT.seeds.flatMap((seed) => {
    const proto = coatMat({ ...TRIM_COAT, seed });
    return TRIM_COAT.tints.map((hex) => {
      const m = proto.clone();
      m.color = new Color(hex);
      return m;
    });
  });
}
const TRIM_TONES = trimFamily();
const MODERN_TRIMS = trimFamily();

/**
 * 逐件选色:与 plankTone / bracketTone 同一口径,由**位置**定值,不用随机数。
 *
 * ★ 取位置时必须落到**真有坐标的那一层**。`latticeWindow` 返回的组自身
 *   停在原点(子网格各自带世界坐标),拿组的 position 去哈希,整层的窗
 *   会算出同一个色 —— 头一版就是这样,44/22/22 的分布正是「每层一个色」。
 *   故对组取其首个子网格的坐标。
 */
function anchorOf(obj) {
  if (obj.isMesh || obj.isInstancedMesh) return obj.position;
  let found = null;
  obj.traverse((c) => { if (!found && (c.isMesh || c.isInstancedMesh)) found = c; });
  return found ? found.position : obj.position;
}

function trimTone(pool, level, obj, salt = 0) {
  const p = anchorOf(obj);
  let h = mix32(level + 0x7c31 + salt);
  h = mix32(h ^ Math.round((p.x + p.z * 3.7) * 5));
  h = mix32(h ^ Math.round(p.y * 11));
  return pool[h % pool.length];
}

/**
 * 今貌首层红墙:抹灰质地 + 铁红油饰。
 * 用 BRICK 的贴图族(砖墙的粗噪点与接缝)而非木纹 —— 它是抹在砖上的一遍色,
 * 不是木面。只换色相与粗糙度。
 */
const MODERN_RED_MAT = BRICK.clone();
MODERN_RED_MAT.color = new Color(MODERN_RED_WALL.color);
MODERN_RED_MAT.roughness = MODERN_RED_WALL.roughness;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 统一的淡入淡出写法(与 materials/wood.js:setWoodFade 同一口径),
 * 但**只在 transparent 真的翻转时**才置 needsUpdate ——
 * setWoodFade 是离散事件调用,每次重编译无所谓;这里每帧都调,
 * 逐帧重编译六份着色器足以把 2 秒的过渡拖成幻灯片。
 * opacity 与 depthWrite 都是 uniform / 状态位,改了不必重编译。
 */
function fade(materials, alpha) {
  for (const m of materials) {
    const want = alpha < 0.999;
    if (m.transparent !== want) { m.transparent = want; m.needsUpdate = true; }
    m.opacity = alpha;
    m.depthWrite = alpha > 0.6;
  }
}

/**
 * @param {object} o
 *   pagoda  buildPagoda() 的返回值(需要 storeys[].meta.rings.outer.feet 与 plan)
 *   initial 起始年代 'ancient' | 'modern'
 *   snap    截图/深链接用:跳过过渡直接落位
 * @returns 系统句柄:{ setEra, tick, era, target, progress, info, dispose }
 */
export function createFacadeHistory({ pagoda, initial = ERA_DEFAULT, snap = false }) {
  const lanEH = fen(SECTION.lanE.h);

  /** 每层一条记录:古貌构件组 + 今貌次间墙片 */
  const layers = [];
  /** 明层 2–5 的墙面余壁 → 它今貌那一面该用哪块红木板(逐块定色) */
  const plankFaced = new Map();

  for (const s of pagoda.storeys) {
    const p = s.plan;
    if (p.type !== 'ming' || !ERA_LEVELS.includes(p.level)) continue;
    const feet = s.meta?.rings?.outer?.feet;
    if (!feet?.length) continue;

    // 与 buildStorey 传给 buildWalls 的是同一组数,故两副墙严丝合缝地占同一开间
    const { group, wallGroup, braceGroup } = buildHistoricWalls({
      feet, y0: p.baseY, y1: p.columnTop - lanEH, level: p.level,
    });
    // 挂在**本层 storey 组**之下 —— 结构分解、逐层聚焦、巡航的一切变换自动跟随,
    // 不必在 explode / cameraRig 里加一行(那两处正在改,更不该占)。
    s.group.add(group);

    /* 今貌一侧,三样东西 ——
     *   ① 次间的版壁(WALL.secondaryLattice = false 时才有)
     *   ② 次间与当心间的格扇/直棂窗:古貌里斜向四面根本没有,四正向的也更小
     *   ③ 窗上下的**余壁**:第47轮次间改格扇之后,墙面只剩这几条,
     *      但它们仍是墙 —— 今貌该是刷了红漆的木板,不是抹灰(用户第49轮裁定)。
     * 三样都要能整块淡入淡出,故材质一律换成本模块独占的克隆件。 */
    const modern = [];
    const modernWindows = [];
    const wallPanels = [];
    const bands = [];
    s.group.traverse((o) => {
      const u = o.userData;
      if (!u || u.level !== p.level || u.era === 'ancient') return;
      // 只认**整扇**,不认扇内的边梃与棂条:latticeWindow 给每根棂条也挂了
      // partKey 'window',但 `bay` 只挂在整扇那一层。逐棂条收进来会让过渡里
      // 每帧多跑几百次显隐,而它们本来就跟着整扇一起动。
      if (u.partKey === 'window' && u.bay) {
        modernWindows.push(o);
        // 窗洞上下皮直接自今貌的窗上读,古貌的墙因此与现有做法严丝合缝,不另拍标高
        if (u.bay === 'dangxin') bands.push({ face: u.face, sill: u.sill, head: u.head });
      } else if (u.bay === 'cijian' && u.partKey === 'wall' && o.type === 'Group') {
        modern.push(o);                       // 版壁(整组横板)
      } else if (u.partKey === 'wall' && o.isMesh && o.material === PLASTER) {
        wallPanels.push(o);                   // 余壁:门上、窗上、窗下
      }
    });
    for (const o of modern) {
      let i = 0;
      o.traverse((c) => {
        if (!c.isMesh || !PLANK_SOURCES.includes(c.material)) return;
        c.material = plankTone(p.level, o.userData.face ?? 0, c, i++);
      });
    }
    for (const o of modernWindows) {
      // 整扇一个色号:一扇之内的边梃、抹头、棂条同料同漆,不该各是各的
      const tone = trimTone(MODERN_TRIMS, p.level, o, 1);
      o.traverse((c) => { if (c.isMesh && c.material === WOOD.trim) c.material = tone; });
    }
    // 余壁交给面层遮罩那一套:本体留 PLASTER(古貌的抹灰),
    // 副本挂逐块定色的红木板(今貌),两者渐变互换 —— 见下面 coats 的构建。
    for (const o of wallPanels) plankFaced.set(o, plankTone(p.level, o.userData.face ?? 0, o, 0));

    /* 古貌当心间:斜向四面封死、四正向留一扇更小的窗(资料包 §3.1) */
    const centerGroup = buildHistoricCenterBays({ feet, bands, level: p.level });
    s.group.add(centerGroup);

    layers.push({
      level: p.level, group, wallGroup, braceGroup, centerGroup,
      modern, modernWindows, braceCasts: false,
    });
  }

  /**
   * 面层接管:全塔外露面里由**年代**决定颜色的两族 ——
   *   `PLASTER` 组(栱眼壁、门上余壁、窗上下余壁、板门门颊)
   *       古 = 暖白抹灰   今 = 木面暗红油饰
   *   `BRICK`   组(首层厚墙)
   *       古 = 砖/抹灰土色  今 = 铁红油饰(实照取色)
   *
   * ★ 做法是**叠一层渐变遮罩**,不是到点换材质。
   *   第40轮直接在 t = 0.5 整批换材质,用户一眼看出「太生硬」—— 一个网格
   *   只能挂一份材质,换就是跳变。这里给每个面加一片**同几何的兄弟副本**,
   *   挂今貌材质、`polygonOffset` 拉向相机一侧,再让它的不透明度 0→1 渐显。
   *   底下那片古貌的面**始终不透明**,所以过渡中不会露出塔内(栱眼壁一透,
   *   檐下就能一穿到底 —— 那正是 gongyanbi.js 存在的理由)。
   *
   * ★ 为什么不逐层过滤:面层是**年代的口径**,不是某一层的做法。只改上层,
   *   一层与副阶仍是另一套颜色,同一张立面上并行两套口径,比全都不改更难读。
   */
  const coats = [];
  const makeOverlay = (src, mat) => {
    // 柱子是 InstancedMesh,副本要连实例矩阵与逐柱色一起复制,否则只出一根柱
    const o = src.isInstancedMesh
      ? new InstancedMesh(src.geometry, mat, src.count)
      : new Mesh(src.geometry, mat);
    if (src.isInstancedMesh) {
      o.instanceMatrix.copy(src.instanceMatrix);
      o.instanceMatrix.needsUpdate = true;
      if (src.instanceColor) {
        o.instanceColor = src.instanceColor.clone();
        o.instanceColor.needsUpdate = true;
      }
    }
    o.position.copy(src.position);
    o.quaternion.copy(src.quaternion);
    o.scale.copy(src.scale);
    o.castShadow = src.castShadow;
    o.receiveShadow = src.receiveShadow;
    o.visible = false;
    // 与本体同语义:过渡中任一片被拾取,信息卡都对
    o.userData = { ...src.userData, eraOverlay: true };
    src.parent.add(o);
    return o;
  };
  for (const mat of [MODERN_COAT_MAT, MODERN_RED_MAT, COLUMN_MAT, ...MODERN_PLANKS]) {
    // 与本体共面,必须确定性地压在它前面 —— 否则由不透明排序决定谁在上,
    // 而排序键含材质创建顺序,删一行 import 就能让它翻面(tile.js 的旧账)。
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
  }
  pagoda.root.traverse((o) => {
    if (!o.isMesh || o.userData?.eraOverlay) return;
    // 明层的墙面余壁另算:它今貌是**刷红漆的木板**,不是油饰面(第49轮)
    const plank = plankFaced.get(o);
    if (plank) coats.push({ src: o, mat: plank });
    else if (o.material === PLASTER) coats.push({ src: o, mat: MODERN_COAT_MAT });
    else if (o.material === BRICK) coats.push({ src: o, mat: MODERN_RED_MAT });
  });

  /**
   * 立面外檐柱刷油饰红(第49轮:「窗户和窗户之间的柱子」)。
   *
   * `buildColumnRing` 每一环各建一个 InstancedMesh,所以**换这一环的 material
   * 只影响这一环** —— 暗层柱、内槽柱、副阶柱各有自己的 partKey 与网格,不受牵连。
   * 同时按逐实例色给一圈二十四柱各自的深浅:一圈同色号,与铺作那条毛病是同一个
   * (见 materials/bracketTone.js)。
   */
  let columnRings = 0;
  pagoda.root.traverse((o) => {
    if (!o.isInstancedMesh || o.userData?.partKey !== 'column') return;
    // 本体挂**古貌的赭土色**,今貌那遍红作为渐变副本叠在其上(第56轮)。
    // 逐柱色差写在本体的 instanceColor 上,makeOverlay 会连同实例矩阵一并复制,
    // 故两个年代看到的是同一组柱、同一套深浅,只是面层不同。
    o.material = COLUMN_ANCIENT_MAT;
    coats.push({ src: o, mat: COLUMN_MAT });
    for (let i = 0; i < o.count; i++) {
      const j = colJitter(o.userData.level ?? 0, i) * COLUMN_COAT.jitter;
      colTmp.setRGB(1 + j, 1 + j * 1.15, 1 + j * 1.25);
      o.setColorAt(i, colTmp);
    }
    if (o.instanceColor) o.instanceColor.needsUpdate = true;
    columnRings++;
  });

  /**
   * 阑额与普拍枋也归这套色系(第50轮,用户裁定)。
   *
   * 用户量出的事:墙顶停在**阑额底**,比柱头矮整整一个阑额(L3 实测 0.51 m)。
   * 那 0.51 m 是阑额占着的,而阑额此前还挂着 `WOOD.pillar` 那套褪色裸木 ——
   * 于是立面上「红柱 → 红余壁 → 灰褐一条 → 斗栱」在梁下断开,
   * 墙看着就比柱矮一截。
   *
   * 实物上**柱与阑额本就是同一遍油饰**:柱头之间那道横枋与柱子一起刷,
   * 一起褪。把它并进柱子那套色系,立面上的墙才「和柱子一样高」。
   * 普拍枋压在阑额之上、同属这道枋带,一并归入。
   *
   * ★ 只取**外槽**那一圈。内槽、副阶用的是同一个 partKey,只能按到轴线的水平距离夹取:
   *   下界 =(内槽 + 外槽)/2,上界 =(外槽 + 副阶)/2。
   *   内槽在室内不属立面;**副阶更要排除** —— 实照上副阶柱是终年受晒的灰褐裸木,
   *   它那圈枋跟着上红,就会出现「灰柱顶着红枋」的怪相。
   */
  let beamCount = 0;
  const beamPos = new Vector3();
  for (const s of pagoda.storeys) {
    if (s.plan?.type !== 'ming') continue;
    const outerR = s.meta?.rings?.outer?.tops?.[0]
      ? Math.hypot(s.meta.rings.outer.tops[0].pos.x, s.meta.rings.outer.tops[0].pos.z) : null;
    if (!outerR) continue;
    const innerR = s.plan.innerR ?? 0;
    const fujieR = s.plan.fujie?.cornerR ?? null;
    const lo = innerR ? (innerR + outerR) / 2 : outerR * 0.6;
    const hi = fujieR ? (outerR + fujieR) / 2 : Infinity;
    s.group.traverse((o) => {
      if (!o.isMesh) return;
      const k = o.userData?.partKey;
      if (k !== 'lanE' && k !== 'pupai') return;
      o.getWorldPosition(beamPos);
      const r = Math.hypot(beamPos.x, beamPos.z);
      if (r < lo || r >= hi) return;        // 内槽在里、副阶在外,都跳过
      o.material = COLUMN_ANCIENT_MAT;
      coats.push({ src: o, mat: COLUMN_MAT });
      beamCount++;
    });
  }

  /* 遮罩副本一次建齐 —— 必须排在墙面、一层砖墙、柱与枋**全部登记完**之后。
   * 早一步建,后登记的那些就没有副本,切到今貌时它们会原地不动。 */
  for (const c of coats) c.overlay = makeOverlay(c.src, c.mat);

  /**
   * 勾阑上同一族色(第51轮)。
   *
   * 勾阑与格扇是同一类活 —— 外露的薄料细工,与檐下的斗栱不是一回事,
   * 该有自己的色号(见 facadeEras.TRIM_COAT)。全塔勾阑十圈、每圈
   * 望柱一件 + 三道横枋各八段 + 华板一件,逐件在三档里取,
   * 一圈不再是一个色号。
   *
   * ★ 与年代无关:两个年代勾阑都在,故用 `TRIM_TONES` 那一套(永不淡化),
   *   不能借格扇那套 —— 借了古今切换会把全塔勾阑一起拖淡。
   */
  let trimPieces = 0;
  pagoda.root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    if (o.userData?.type !== 'balustrade' || o.material !== WOOD.trim) return;
    o.material = trimTone(TRIM_TONES, o.userData.level ?? 0, o);
    trimPieces++;
  });

  /* 读图态族色:新材质须与既有构件同规格归族,否则按 L 后整塔平色里空一块 */
  for (const [m, c] of MUD_STUDY_COLORS) registerStudyMaterial(m, c);
  for (const m of MODERN_PLANKS) registerStudyMaterial(m, 0xb08a70);
  registerStudyMaterial(MODERN_COAT_MAT, 0xc2907a);
  for (const m of [...TRIM_TONES, ...MODERN_TRIMS]) registerStudyMaterial(m, 0xa07a60);
  registerStudyMaterial(MODERN_RED_MAT, 0xb0806e);
  registerStudyMaterial(COLUMN_MAT, 0x8a6552);   // 与 WOOD.pillar 同族色,读图态归为柱枋
  registerStudyMaterial(COLUMN_ANCIENT_MAT, 0x8a6552);

  /* ── 过渡:t = 0 古貌,t = 1 今貌 ──────────────────────────────
   * 三段错开的窗口,合起来就是资料包 §5 描述的那段解释动画。
   * 反向播放(今→古)即同一条曲线倒着走,不另写一套。 */
  const PHASE = {
    plaster: [0.00, 0.42],   // 抹灰先退
    frame:   [0.12, 0.58],   // 木骨随后
    braceIn: [0.30, 0.44],   // 抹灰退尽,斜撑显露
    braceOut:[0.58, 0.72],   // 斜撑随木骨一并拆除
    modern:  [0.70, 1.00],   // 版壁与直棂窗接手
    coat:    [0.28, 0.80],   // 面层:抹灰 ⇄ 油饰,整程渐变遮罩
  };

  let target = initial === 'ancient' ? 0 : 1;
  let now = target;
  let era = initial;
  let onSettled = null;

  function apply(t) {
    const ancientPlaster = 1 - smoothstep(...PHASE.plaster, t);
    const ancientFrame = 1 - smoothstep(...PHASE.frame, t);
    /**
     * 斜撑是一段**脉冲**,不是自 1 衰减到 0 —— 两端都要归零:
     *   古貌静止态它藏在墙里,本来就看不见;
     *   今貌它已被拆除,更不该在。
     * 一直画着不行:立面机位是 ≈480 m 的长焦远景,near=0.05 的透视深度缓冲
     * 在那里的分辨率约 0.27 m,而斜撑离抹灰正面只有 9 cm ——「藏在里面」
     * 仲裁不出来,每一间墙上都会印出一个十字(第39轮实见)。
     * 只在抹灰退尽、版壁未到那一段现身,既避开了深度精度,也正是资料包 §5
     * 要的那句话:拆的不只是饰面,墙里那套抗侧刚度也一并没了。
     */
    const ancientBrace = smoothstep(...PHASE.braceIn, t) * (1 - smoothstep(...PHASE.braceOut, t));
    const modernAlpha = smoothstep(...PHASE.modern, t);
    const coatAlpha = smoothstep(...PHASE.coat, t);

    fade(MUD_PLASTER, ancientPlaster);
    fade([MUD_FRAME, MUD_TRIM], ancientFrame);
    fade([MUD_BRACE], ancientBrace);
    fade(MODERN_TRIMS, modernAlpha);

    // 面层:今貌那一片自 0 渐显到 1 盖住底下的古貌面。底面始终不透明,
    // 故过渡中立面不会变成半透明的壳。
    fade([MODERN_COAT_MAT, MODERN_RED_MAT], coatAlpha);
    // 版壁色族既是版壁本身的材质,也是余壁遮罩的材质 —— 两处同用一条曲线:
    // 版壁与余壁都属今貌,该一起来、一起走。
    fade(MODERN_PLANKS, Math.max(coatAlpha, modernAlpha));
    for (const c of coats) {
      c.overlay.visible = coatAlpha > 0.004;
      c.src.visible = coatAlpha < 0.996;
    }

    // 斜撑只在露出来的那一段投影;此外它不进管线,投影权也无从谈起。
    const braceCasts = ancientBrace > 0.5;

    // 全透明的东西不必再进管线:整族一起关,比逐 mesh 判快得多
    for (const L of layers) {
      L.wallGroup.visible = ancientPlaster > 0.004 || ancientFrame > 0.004;
      L.braceGroup.visible = ancientBrace > 0.004;
      if (L.braceCasts !== braceCasts) {
        L.braceCasts = braceCasts;
        L.braceGroup.traverse((o) => { if (o.isMesh) o.castShadow = braceCasts; });
      }
      L.centerGroup.visible = ancientPlaster > 0.004 || ancientFrame > 0.004;
      for (const o of L.modern) o.visible = modernAlpha > 0.004;
      for (const o of L.modernWindows) o.visible = modernAlpha > 0.004;
    }
  }
  apply(now);

  return {
    /** 当前年代键(指令值,过渡中即已生效) */
    get era() { return era; },
    get target() { return target; },
    /** 0 = 古貌,1 = 今貌;过渡中为中间值 */
    get progress() { return now; },
    get transitioning() { return Math.abs(target - now) > 1e-4; },
    /** 当前年代的文案与证据等级(UI 用,零硬编码) */
    get info() { return FACADE_ERAS[era]; },
    layers,

    /** @param {'ancient'|'modern'} key */
    setEra(key, { instant = false } = {}) {
      if (!FACADE_ERAS[key]) throw new Error(`未知立面年代:${key}`);
      era = key;
      target = key === 'ancient' ? 0 : 1;
      if (instant || snap) { now = target; apply(now); onSettled?.(era); }
      return era;
    },

    /** 过渡落位时回调一次(main 用它重刷剖面壳等派生物) */
    onSettled(fn) { onSettled = fn; },

    tick(dt) {
      if (Math.abs(target - now) < 1e-4) return false;
      const step = dt / ERA_TRANSITION;
      now += Math.sign(target - now) * Math.min(step, Math.abs(target - now));
      apply(now);
      if (Math.abs(target - now) < 1e-4) { now = target; apply(now); onSettled?.(era); }
      return true;
    },
  };
}
