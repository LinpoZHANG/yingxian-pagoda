/**
 * components/wall.js —— 塔身墙面 / 门窗
 * ─────────────────────────────────────────────────────────────
 * 明层柱间墙体与门窗:灰白抹灰墙、板门(南北向)、直棂窗;
 * 首层为厚砖墙包裹 [图]9.pdf。门窗是立面「虚实节奏」的来源,
 * 位置由柱网分间自动生成 —— 每面 3 间:当心间设门/窗,次间实墙。
 *
 * 分间规则(与 octagon.ringPositions 的柱位一致):
 *   角柱 — 平柱 — 平柱 — 角柱  →  次间 / 当心间 / 次间
 */

import { Group, Mesh, BoxGeometry, InstancedMesh, Object3D, Vector3 } from 'three';
import { WALL } from '../data/pagodaParams.js';
import { fen, SECTION } from '../data/caifen.js';
import { WOOD } from '../materials/wood.js';
import { PLASTER, BRICK } from '../materials/tile.js';
import { OCT_N } from '../assembly/octagon.js';

const UP = new Vector3(0, 1, 0);

/**
 * 版壁:柱间的**横向叠板**墙(第22轮,用户以实照指出)。
 *
 * 实照里柱间不是一片抹平的板,而是一道道横向木板叠上去,板缝浅刻成阴影线。
 * 旧写法一片 BoxGeometry 抹灰到顶,近景一看就假。
 * 板广取一材 [法](`SECTION.bandaBoard`),自下而上排;最上一道按余高裁,
 * 板缝深与宽同取 `SECTION.bandaGroove`,只浅刻不通缝。
 * 板后另衬一片薄底板,避免自缝里看穿。
 */
function plankPanel(a, b, o) {
  const { y0, y1, thickness, inset = 0, partKey, level } = o;
  const h = y1 - y0;
  if (h <= 0) return null;
  const g = new Group();
  const boardH = fen(SECTION.bandaBoard);
  const groove = fen(SECTION.bandaGroove);
  // 衬板:薄一层,退在板缝之后
  const back = panel(a, b, { ...o, thickness: thickness * 0.45,
    inset: inset + thickness * 0.28, material: WOOD.plank ?? WOOD.pillar, partKey, level });
  if (back) g.add(back);
  const n = Math.max(1, Math.round(h / boardH));
  const step = h / n;
  for (let i = 0; i < n; i++) {
    const b0 = y0 + i * step;
    const b1 = b0 + step - groove;               // 板缝:每道板顶留一条浅槽
    const m = panel(a, b, { ...o, y0: b0, y1: b1, thickness,
      material: WOOD.plank ?? WOOD.pillar, partKey, level });
    if (m) g.add(m);
  }
  g.userData = { partKey, level, type: 'wall' };
  return g;
}

/** 在两柱之间竖一片板:自动定位、转向、贴合柱心连线 */
function panel(a, b, { y0, y1, thickness, material, inset = 0, partKey, level }) {
  const h = y1 - y0;
  if (h <= 0) return null;
  const dir = new Vector3().subVectors(b, a).setY(0);
  const len = dir.length();
  const mid = a.clone().add(b).multiplyScalar(0.5).setY(y0 + h / 2);
  const normal = new Vector3(mid.x, 0, mid.z).normalize();
  mid.addScaledVector(normal, -inset);
  const m = new Mesh(new BoxGeometry(len, h, thickness), material);
  m.position.copy(mid);
  m.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  m.castShadow = m.receiveShadow = true;
  m.userData = { partKey, level, type: 'wall' };
  return m;
}

/**
 * 格扇窗:一间分若干扇,每扇 = 边梃抹头 + **方格心**。
 *
 * ★ 第47轮按 2025 实景照重做。旧写法有三处不对:
 *   ① 棂条宽取 `SECTION.xunZhang`(8分 = **13.6 cm**)—— 那是勾阑扶手的尺寸,
 *      做窗棂粗了三四倍,九根一排就把格眼吃光了,窗看着是实的;
 *   ② 只有**竖棂**,而实照上是**横竖交织的方格心**,格眼在十厘米上下;
 *   ③ 一间只做一扇,而实照上一间是**一排格扇**,扇与扇之间有边梃。
 * 「开口太小」不是尺寸没调够,是**棂条尺度用错了来源**。
 */
function latticeWindow(a, b, { y0, y1, thickness, level }) {
  const g = new Group();
  const dir = new Vector3().subVectors(b, a).setY(0);
  const len = dir.length();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const rotY = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  const bian = fen(SECTION.geShanBian);      // 边梃 / 抹头
  const ling = fen(SECTION.lingTiao);        // 棂条
  const h = y1 - y0;
  const leaves = Math.max(2, Math.round(len / WALL.leafWidth));
  const leafW = len / leaves;

  /** 一根方料,长向沿间宽(dx)或竖向(dy) */
  const bar = (w, hh, dep, offX, cy, key) => {
    const m = new Mesh(new BoxGeometry(w, hh, dep), WOOD.trim);
    m.position.set(mid.x, cy, mid.z);
    m.rotation.y = rotY;
    m.translateX(offX);
    m.castShadow = true;
    m.userData = { partKey: key, level, type: 'window' };
    return m;
  };

  // 通间的上下抹头
  g.add(bar(len, bian, thickness * 1.1, 0, y0 + bian / 2, 'window'));
  g.add(bar(len, bian, thickness * 1.1, 0, y1 - bian / 2, 'window'));
  // 每扇之间的边梃(含两端)
  for (let i = 0; i <= leaves; i++) {
    const x = -len / 2 + i * leafW;
    g.add(bar(bian, h, thickness * 1.1, x, y0 + h / 2, 'window'));
  }

  /* 格心:横竖棂条交织。棂条细而密 —— 格眼按 WALL.latticeCell 排,
     不按「几根」排:间宽逐层收分,按根数排会让上层的格眼越来越小。 */
  const cell = WALL.latticeCell;
  const innerH = h - bian * 2;
  const innerW = leafW - bian;
  const nV = Math.max(1, Math.round(innerW / cell) - 1);   // 每扇的竖棂
  const nH = Math.max(1, Math.round(innerH / cell) - 1);   // 横棂(通间)
  const total = leaves * nV + nH;
  const inst = new InstancedMesh(new BoxGeometry(1, 1, ling), WOOD.trim, total);
  const d = new Object3D();
  let k = 0;
  for (let L = 0; L < leaves; L++) {
    const x0 = -len / 2 + L * leafW + leafW / 2;
    for (let i = 1; i <= nV; i++) {
      const x = x0 + (i / (nV + 1) - 0.5) * innerW;
      d.position.set(mid.x, y0 + h / 2, mid.z);
      d.rotation.set(0, rotY, 0);
      d.scale.set(ling, innerH, 1);
      d.updateMatrix(); d.translateX(x); d.updateMatrix();
      inst.setMatrixAt(k++, d.matrix);
    }
  }
  for (let j = 1; j <= nH; j++) {
    const y = y0 + bian + (j / (nH + 1)) * innerH;
    d.position.set(mid.x, y, mid.z);
    d.rotation.set(0, rotY, 0);
    d.scale.set(len - bian * 2, ling, 1);
    d.updateMatrix();
    inst.setMatrixAt(k++, d.matrix);
  }
  inst.count = k;
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = true;
  inst.userData = { partKey: 'window', level, type: 'window',
    instances: Array(k).fill({ partKey: 'window' }) };
  g.add(inst);
  g.userData = { partKey: 'window', level };
  return g;
}

/** 板门:门额 + 门颊 + 双扇门板(微开合角度=0,合闭) */
function boardDoor(a, b, { y0, y1, thickness, level }) {
  const g = new Group();
  const dir = new Vector3().subVectors(b, a).setY(0);
  const len = dir.length();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const rotY = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  const w = len * WALL.doorWidthRatio;
  const frameW = fen(SECTION.lanE.w) * 1.4;

  const parts = [
    // 左右门颊
    [(len - w) / 2, y1 - y0, -(w + (len - w) / 2) / 2, (y0 + y1) / 2],
    [(len - w) / 2, y1 - y0, (w + (len - w) / 2) / 2, (y0 + y1) / 2],
  ];
  for (const [pw, ph, off, cy] of parts) {
    const m = new Mesh(new BoxGeometry(pw, ph, thickness), PLASTER);
    m.position.set(mid.x, cy, mid.z);
    m.rotation.y = rotY;
    m.translateX(off);
    m.castShadow = m.receiveShadow = true;
    m.userData = { partKey: 'wall', level, type: 'wall' };
    g.add(m);
  }
  // 门框(立颊 + 门额)
  for (const [pw, ph, off, cy] of [
    [frameW, y1 - y0, -(w / 2 - frameW / 2), (y0 + y1) / 2],
    [frameW, y1 - y0, (w / 2 - frameW / 2), (y0 + y1) / 2],
    [w, frameW, 0, y1 - frameW / 2],
  ]) {
    const m = new Mesh(new BoxGeometry(pw, ph, thickness * 1.15), WOOD.trim);
    m.position.set(mid.x, cy, mid.z);
    m.rotation.y = rotY;
    m.translateX(off);
    m.castShadow = true;
    m.userData = { partKey: 'door', level, type: 'door' };
    g.add(m);
  }
  // 双扇门板
  const leafW = (w - frameW * 2) / 2;
  for (const s of [-1, 1]) {
    const m = new Mesh(new BoxGeometry(leafW * 0.98, y1 - y0 - frameW, thickness * 0.5), WOOD.trim);
    m.position.set(mid.x, (y0 + y1) / 2 - frameW / 2, mid.z);
    m.rotation.y = rotY;
    m.translateX(s * leafW / 2);
    m.castShadow = true;
    m.userData = { partKey: 'door', level, type: 'door' };
    g.add(m);
  }
  g.userData = { partKey: 'door', level };
  return g;
}

/**
 * 生成一层的墙身与门窗。
 * @param {object} o
 *   feet   柱脚序列(buildColumnRing.feet,已按方位排序)
 *   y0/y1  墙身上下皮标高(y1 通常 = 柱头 − 阑额高)
 *   level  层号;brick 首层厚砖墙;doors 开门的面序号
 *   solid  暗层版壁:三间通做实壁、不开门窗(暗层无采光需求,
 *          外观上是平座勾阑背后的一道实带,缺了它「明五暗四」读不出来)
 */
export function buildWalls({
  feet, y0, y1, level = 1, brick = false, solid = false, doors = WALL.doorFaces,
}) {
  const g = new Group();
  g.name = `walls_L${level}`;
  const thickness = brick ? WALL.brickThickness : WALL.thickness;
  const solidMat = brick ? BRICK : PLASTER;
  const h = y1 - y0;

  for (let f = 0; f < OCT_N; f++) {
    // 该面的四个柱脚:角柱f、平柱-、平柱+、角柱f+1
    const idx = f * 3;
    const c0 = feet[idx], p0 = feet[idx + 1], p1 = feet[idx + 2];
    const c1 = feet[(idx + 3) % feet.length];

    // 次间:实墙。砖墙(首层)仍作整片;木构各层作**横向叠板版壁**
    // 每片挂 { face, bay } —— 古今立面模块据此逐间接管次间(见 facade/facadeHistory.js);
    // 这是纯附加的语义标记,不改任何几何。
    /**
     * ★ 明层今貌的次间是**连续格扇**,不是版壁(第47轮)。
     *   1930 年代拆掉二至五层的夹泥墙与墙内斜撑后,次间也改成一排格扇,
     *   建筑由封闭转为通透(facadeEras.js / FacadeHistory 资料包)。
     *   此前次间一律作版壁实墙 —— 那是拆改**之前**的样子,与默认的今貌态不符。
     *   古貌态由 facade/mudWall.js 另加泥墙覆盖,不靠这里作实。
     *   `{face, bay}` 标记照旧,古今模块仍按它逐间接管。
     */
    const secLattice = !brick && !solid && WALL.secondaryLattice;
    for (const [a, b] of [[c0.pos, p0.pos], [p1.pos, c1.pos]]) {
      if (secLattice) {
        const sill = y0 + h * WALL.windowSillRatio;
        const head = Math.min(y1, sill + h * WALL.windowHeightRatio);
        for (const [ya, yb] of [[y0, sill], [head, y1]]) {
          const mm = panel(a, b, { y0: ya, y1: yb, thickness, material: solidMat, partKey: 'wall', level });
          if (mm) { Object.assign(mm.userData, { face: f, bay: 'cijian' }); g.add(mm); }
        }
        const w2 = latticeWindow(a, b, { y0: sill, y1: head, thickness, level });
        Object.assign(w2.userData, { face: f, bay: 'cijian', sill, head });
        g.add(w2);
        continue;
      }
      const m = brick
        ? panel(a, b, { y0, y1, thickness, material: solidMat, partKey: 'wall', level })
        : plankPanel(a, b, { y0, y1, thickness, partKey: 'wall', level });
      if (m) { Object.assign(m.userData, { face: f, bay: 'cijian' }); g.add(m); }
    }

    // 当心间:南北设板门,其余设直棂窗(首层砖墙层与暗层版壁作实墙)
    const isDoor = !solid && doors.includes(f);
    if (isDoor) {
      // 首层门高取绝对值(见 WALL.doorHeightAbs 的说明:比例参数不能跨尺度复用)
      const doorH = WALL.doorHeightAbs?.[level] ?? h * WALL.doorHeightRatio;
      g.add(boardDoor(p0.pos, p1.pos, { y0, y1: y0 + doorH, thickness, level }));
      // 门上余壁
      const m = panel(p0.pos, p1.pos, {
        y0: y0 + doorH, y1, thickness, material: solidMat, partKey: 'wall', level,
      });
      if (m) g.add(m);
    } else if (brick || solid) {
      const m = panel(p0.pos, p1.pos, { y0, y1, thickness, material: solidMat, partKey: 'wall', level });
      if (m) g.add(m);
    } else {
      const sill = y0 + h * WALL.windowSillRatio;
      const head = Math.min(y1, sill + h * WALL.windowHeightRatio);
      for (const [a, b] of [[y0, sill], [head, y1]]) {
        const m = panel(p0.pos, p1.pos, { y0: a, y1: b, thickness, material: solidMat, partKey: 'wall', level });
        if (m) { Object.assign(m.userData, { face: f, bay: 'dangxin' }); g.add(m); }
      }
      // 窗洞连同上下皮一并记下 —— 古今立面模块要按面认出当心间的窗:
      // 拆改前上层开口只在四正向,斜向四面封闭,四正向的窗也更小
      // (见 facade/facadeEras.js:ANCIENT_OPENING)。纯附加标记,不改几何。
      const win = latticeWindow(p0.pos, p1.pos, { y0: sill, y1: head, thickness, level });
      Object.assign(win.userData, { face: f, bay: 'dangxin', sill, head });
      g.add(win);
    }
  }

  g.userData = { partKey: 'wall', level, type: 'wallRing' };
  return g;
}
