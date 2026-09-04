/**
 * components/bracket/heroCorner.js —— 英雄级转角铺作(特写交互专用)
 * ─────────────────────────────────────────────────────────────
 * 单独精做一朵一层外檐转角铺作 —— 全塔最复杂的节点:
 * 两正身方向 + 45°(八角为 22.5°)斜出跳三向并置,
 * 斗/栱/昂/耍头的搭接关系完整可读。
 * 选型依据:[图]版21(pdf p93)转角铺作正侧面 + 版22(p94)转角平面,
 * 见 docs/bracket-study.md §二。
 *
 * 与 assemble.js 的关系:仍走同一套文法(证明文法本身是对的),
 * 只是 detail='near'、构件独立成 Mesh、并额外产出分解动画与标注数据。
 * 本文件不追求性能,追求构造正确与可读性。
 */

import { Vector3, Box3 } from 'three';
import { assembleBracketSet } from './assemble.js';
import { WOOD } from '../../materials/wood.js';
import { PUZUO } from '../../data/caifen.js';
import { PART_INFO } from '../../data/narrative.js';

/**
 * 标注取哪几类构件、按什么次序排 —— 依「一朵铺作自下而上的搭接顺序」,
 * 读标注即读装配顺序。全标会糊成一片,故只取这七类主干。
 */
const LABEL_ORDER = [
  'luDou', 'huaGong', 'niDaoGong', 'jiaoHuDou', 'ang', 'lingGong', 'shuaTou',
];

/** 分解方向:按构件类别给出各自「拆装」的自然方向 */
function explodeDirection(partKey, localPos) {
  const radial = new Vector3(localPos.x, 0, localPos.z);
  const r = radial.length();
  switch (partKey) {
    case 'luDou':                       // 栌斗最后拆,几乎不动
      return new Vector3(0, -0.16, 0);
    case 'huaGong': case 'ang': case 'shuaTou':
      return radial.clone().normalize().multiplyScalar(r > 0.01 ? 0.26 : 0).setY(0.30);
    case 'liaoYanFang': case 'diMianFang':
      return new Vector3(0, 0.56, 0).add(radial.normalize().multiplyScalar(0.24));
    case 'niDaoGong': case 'guaZiGong': case 'manGong': case 'lingGong': case 'zhuTouFang':
      return new Vector3(0, 0.46, 0);   // 横栱竖直抽离,露出出跳关系
    default:                            // 各类斗
      return new Vector3(0, 0.24, 0).add(radial.normalize().multiplyScalar(0.14));
  }
}

/**
 * @returns {{
 *   group: Group,
 *   parts: {name:string, partKey:string, mesh:Mesh, home:Vector3, explodeDir:Vector3}[],
 *   anchors: {key:string, label:string, position:Vector3}[],
 *   height: number,
 * }}
 */
export function buildHeroBracket({
  cfg = { ...PUZUO.L1out, role: 'zhuanjiao', facing: 'out' },
} = {}) {
  const group = assembleBracketSet({ ...cfg, detail: 'near' }, WOOD.bracket);
  group.name = 'heroBracket';

  const parts = [];
  const seen = new Map();
  for (const mesh of group.children) {
    const home = mesh.position.clone();
    const dir = explodeDirection(mesh.userData.partKey, home);
    // 上层构件走得更远,分解后层次不叠在一起(但总位移须小于构件自身尺度的数倍,
    // 否则整朵散成一片、读不出装配关系)
    dir.multiplyScalar(1 + home.y * 0.42);
    mesh.userData.home = home;
    mesh.userData.explodeDir = dir;
    parts.push({
      name: mesh.name, partKey: mesh.userData.partKey,
      mesh, home, explodeDir: dir,
    });
    // 每类构件取一个代表点作为标注锚点(避免同名构件重复标注)
    if (!seen.has(mesh.userData.partKey)) seen.set(mesh.userData.partKey, mesh);
  }

  const box = new Box3().setFromObject(group);
  // 标注锚点:每类构件取一个代表(同名构件不重复标),
  // 挂 mesh 引用而非固定坐标 —— 分解动画中标注跟着构件走。
  const anchors = [];
  for (const key of LABEL_ORDER) {
    const mesh = seen.get(key);
    const info = PART_INFO[key];
    if (!mesh || !info) continue;
    anchors.push({ key, label: info.name, role: info.role, mesh });
  }

  group.userData = { partKey: 'heroBracket', type: 'bracket', config: cfg };
  return { group, parts, anchors, height: box.max.y - box.min.y, box };
}

/**
 * 分解播放器:t=0 复原,t=1 完全散开。纯变换,不改几何。
 * 由 loop.onTick 驱动补间,与 interaction/states 的 bracket 态联动。
 */
export function createHeroExploder(parts) {
  const tmp = new Vector3();
  return function setExplode(t) {
    const k = t * t * (3 - 2 * t);            // smoothstep,起止平缓
    for (const p of parts) {
      tmp.copy(p.explodeDir).multiplyScalar(k);
      p.mesh.position.copy(p.home).add(tmp);
    }
  };
}
