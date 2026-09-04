/**
 * components/platform.js —— 台基(阶基)
 * ─────────────────────────────────────────────────────────────
 * 双层台基:下层方形石台(台明)+ 上层八角形月台,含三面踏道。
 * 南侧踏道为主入口方向,决定巡航起点朝向 [图]9.pdf。
 * 八角平面一律走 assembly/octagon,保证与塔身各层轮廓零错位。
 */

import { Group, Mesh, BoxGeometry } from 'three';
import { PLATFORM } from '../data/pagodaParams.js';
import { octagonPrism, faceAngle, apothem, edgeLength, polar } from '../assembly/octagon.js';
import { STONE, STONE_DARK } from '../materials/tile.js';

/** 一道压阑石(台沿石):比本体略外挑的扁棱柱 */
function coping(radius, y, { square = false, half = 0 } = {}) {
  const P = PLATFORM;
  const geo = square
    ? new BoxGeometry((half + P.copingOut) * 2, P.copingH, (half + P.copingOut) * 2)
    : octagonPrism(radius + P.copingOut, radius + P.copingOut, P.copingH);
  const m = new Mesh(geo, STONE_DARK);
  m.position.y = y - P.copingH / 2;
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * 踏道:自地坪逐级升至月台面,踏步外挑 extend 米。
 * 级数由 terraceTopY / stepRise 取整得出,不另设级数参数。
 */
function stairs(faceIndex) {
  const P = PLATFORM;
  const g = new Group();
  const steps = Math.round(P.terraceTopY / P.stepRise);
  const rise = P.terraceTopY / steps;
  const width = edgeLength(P.upperOctR) * P.stairWidthRatio;
  const a = faceAngle(faceIndex);
  const inner = apothem(P.upperOctR);          // 月台面边心距 = 踏道内端
  const run = P.stairs.extend / steps;         // 每级踏面进深

  for (let i = 0; i < steps; i++) {
    // 第 i 级顶面标高 (i+1)*rise;外端自内端外推,越低越远
    const depth = P.stairs.extend - i * run + run;
    const geo = new BoxGeometry(width, rise, depth);
    const m = new Mesh(geo, STONE);
    const rOut = inner + depth / 2;
    m.position.copy(polar(a, rOut, (i + 0.5) * rise));
    m.rotation.y = a;
    m.castShadow = m.receiveShadow = true;
    m.userData.partKey = 'stair';
    g.add(m);
  }
  // 垂带(两侧斜置的边石)
  const beltW = width * 0.10;
  for (const s of [-1, 1]) {
    const len = Math.hypot(P.stairs.extend, P.terraceTopY);
    const geo = new BoxGeometry(beltW, len, beltW * 1.4);
    const m = new Mesh(geo, STONE_DARK);
    const rMid = inner + P.stairs.extend / 2;
    const p = polar(a, rMid, P.terraceTopY / 2);
    const tan = polar(a + Math.PI / 2, 1, 0);
    m.position.copy(p).addScaledVector(tan, s * (width / 2 + beltW / 2));
    m.rotation.y = a;
    m.rotateX(-Math.atan2(P.stairs.extend, P.terraceTopY));
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  g.userData.partKey = 'stair';
  return g;
}

/** @returns {THREE.Group} 台基,原点在塔心地坪 */
export function buildPlatform() {
  const P = PLATFORM;
  const root = new Group();
  root.name = 'platform';

  // ★ 台身一律**止于压阑石下皮**,不与压阑石共面(第34轮:用户报基座材质闪烁)。
  //   原写法台身顶面与压阑石顶面同在一个标高,两个水平面完全重合,
  //   深度缓冲无法定序,转镜头就闪。压阑石本就是盖在台身上口的一道边石,
  //   台身到它下皮为止才是构造实情。
  const cap = P.copingH;

  // 下层方台(台明):地坪 → lowerH − 压阑石高
  const lowerH = P.lowerH - cap;
  const lower = new Mesh(
    new BoxGeometry(P.lowerSquareHalf * 2, lowerH, P.lowerSquareHalf * 2), STONE);
  lower.position.y = lowerH / 2;
  lower.receiveShadow = lower.castShadow = true;
  lower.userData.partKey = 'platform';
  root.add(lower, coping(0, P.lowerH, { square: true, half: P.lowerSquareHalf }));

  // 上层八角月台:自下层压阑石内(埋入 40%,避免底面与其顶面共面)→ terraceTopY − 压阑石高
  const upFrom = P.lowerH - cap * 0.4;
  const upTo = P.terraceTopY - cap;
  const upperH = upTo - upFrom;
  const upper = new Mesh(octagonPrism(P.upperOctR, P.upperOctR, upperH), STONE);
  upper.position.y = upFrom + upperH / 2;
  upper.receiveShadow = upper.castShadow = true;
  upper.userData.partKey = 'platform';
  root.add(upper, coping(P.upperOctR, P.terraceTopY));

  // 踏道:南(主入口)/ 东 / 西
  const faces = [];
  if (P.stairs.south) faces.push(0);
  if (P.stairs.east)  faces.push(2);
  if (P.stairs.west)  faces.push(6);
  for (const f of faces) root.add(stairs(f));

  root.userData = { partKey: 'platform', level: 0, type: 'platform' };
  return root;
}
