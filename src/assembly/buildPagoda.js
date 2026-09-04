/**
 * assembly/buildPagoda.js —— 全塔组装(自底向上)
 * ─────────────────────────────────────────────────────────────
 * 台基 → 按 plan.js 放样表逐层 buildStorey → 塔刹;
 * 输出全塔包围盒与关键锚点(各层视点、刹尖)供相机使用。
 *
 * 验收自检点:
 *   [] 六层檐标高与收分连线平滑     [] 明暗层节奏可读
 *   [] 无构件悬空 / 穿模 / z-fighting [] 塔刹比例正确
 */

import { Group, Box3, Vector3 } from 'three';
import { planPagoda } from './plan.js';
import { buildStorey } from './buildStorey.js';
import { buildPlatform } from '../components/platform.js';
import { buildFinial } from '../components/finial.js';
import { GLOBAL } from '../data/pagodaParams.js';

export function buildPagoda() {
  const root = new Group();
  root.name = 'pagoda';
  const plan = planPagoda();

  root.add(buildPlatform());

  const storeys = [];
  for (const p of plan.storeys) {
    const s = buildStorey(p);
    // 分解位移:自下而上逐层递增,底层不动。
    // 位移量取「够读出明暗交替、又不至于散架」的中间值 —— 3.4 m × 层序,
    // 九层拉开共约 27 m,相机锚点(anchors.exploded)据此自动抬升拉远。
    s.group.userData.explodeOffset = storeys.length * 3.4;
    root.add(s.group);
    storeys.push({ ...s, plan: p });
  }

  // 塔刹须知道顶层屋面型线才能坐实(否则刹座悬在攒尖之上)
  root.add(buildFinial({ roof: plan.storeys.at(-1).roof }));

  /* ── 相机锚点:各明层檐下取景点 + 全景 + 刹尖 ─────────────── */
  const anchors = [
    { name: 'overview', position: new Vector3(0, plan.apexY * 0.45, 0), radius: GLOBAL.totalHeight * 1.35 },
  ];
  for (const p of plan.storeys) {
    if (p.type !== 'ming') continue;
    anchors.push({
      name: `L${p.level}`,
      position: new Vector3(0, (p.baseY + p.eaveY) / 2, 0),
      radius: p.eaveR * 2.1,
    });
  }
  anchors.push({ name: 'finial', position: new Vector3(0, (plan.apexY + GLOBAL.totalHeight) / 2, 0), radius: 26 });
  // 分解态:九层拉开后整体变高,取景点须相应抬升拉远
  const spread = storeys.at(-1)?.group.userData.explodeOffset ?? 0;
  anchors.push({
    name: 'exploded',
    position: new Vector3(0, (GLOBAL.totalHeight + spread) * 0.46, 0),
    radius: (GLOBAL.totalHeight + spread) * 1.55,
  });

  const bbox = new Box3().setFromObject(root);
  return { root, storeys, anchors, plan, bbox };
}
