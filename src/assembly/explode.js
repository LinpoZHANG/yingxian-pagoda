/**
 * assembly/explode.js —— 结构分解(爆炸视图)变换器
 * ─────────────────────────────────────────────────────────────
 * 基于 buildPagoda 返回的 storeys 句柄做纯变换动画:
 * 九个结构层沿 Y 轴按 explodeOffset 分离(缓动),可单层高亮;
 * 反向播放即复原。不修改任何几何,只动 Group.position。
 *
 * 「明五暗四」在分解视图里才真正看得见:拉开之后,
 * 明层与暗层交替的九层叠柱结构一目了然。
 */

import { Vector3 } from 'three';
import { setWoodFade } from '../materials/wood.js';
import { setTileFade } from '../materials/tile.js';

const ease = (t) => t * t * (3 - 2 * t);

/**
 * @param {Array} storeys buildPagoda().storeys
 * @param {object} extra  { finial, platform } 需要一同抬升/固定的对象
 */
export function createExploder(storeys, extra = {}) {
  const homes = storeys.map((s) => s.group.position.clone());
  const finialHome = extra.finial ? extra.finial.position.clone() : null;
  let current = 0;

  function apply(t) {
    current = t;
    const k = ease(Math.min(1, Math.max(0, t)));
    storeys.forEach((s, i) => {
      const off = s.group.userData.explodeOffset ?? 0;
      s.group.position.copy(homes[i]).add(new Vector3(0, off * k, 0));
    });
    if (extra.finial) {
      const top = storeys.at(-1)?.group.userData.explodeOffset ?? 0;
      extra.finial.position.copy(finialHome).add(new Vector3(0, (top + 2.2) * k, 0));
    }
  }
  apply(0);

  return {
    /** t: 0..1 */
    explode(t) { apply(t); },
    get value() { return current; },

    /**
     * 单层聚焦:其余层整体降透明度。
     * 材质是全局共享的,故走 materials 的统一 fade 接口,不逐 mesh 改。
     */
    focus(level) {
      if (level == null || level === 'all') {
        setWoodFade(1); setTileFade(1);
        for (const s of storeys) s.group.visible = true;
        return;
      }
      setWoodFade(1); setTileFade(1);
      for (const s of storeys) {
        s.group.visible = s.group.userData.level === level;
      }
    },

    reset() { apply(0); this.focus(null); },
  };
}
