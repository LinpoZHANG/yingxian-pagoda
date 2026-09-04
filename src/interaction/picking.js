/**
 * interaction/picking.js —— 构件拾取与信息查看
 * ─────────────────────────────────────────────────────────────
 * Raycaster 拾取(悬停节流,点击即时);命中后读 userData.partKey
 * → 取 data/narrative.PART_INFO 文案 → 交给 ui/panels 显示。
 *
 * 高亮策略(要点):全塔材质是共享实例(WOOD.bracket 一份供四百余朵斗拱用),
 * 直接改材质的 emissive 会让整座塔一起发亮。故:
 *   · InstancedMesh —— 走 setColorAt(),只染中的那一个实例;
 *   · 普通 Mesh     —— 临时换上该 mesh 专属的材质克隆(按 mesh 缓存,不反复 new)。
 * 不引入描边后处理,控制复杂度。
 *
 * InstancedMesh 命中给出 instanceId,由构件生成时写入的
 * userData.instances[] 映射回语义(层号 / 柱型 / 铺作等级)。
 */

import { Raycaster, Vector2, Color } from 'three';
import { hasPartInfo } from '../data/narrative.js';

/** 高亮色:实例走乘算(提亮),普通 mesh 走 emissive(微微自发光) */
const TINT = new Color(1.55, 1.42, 1.20);
const WHITE = new Color(1, 1, 1);
const EMISSIVE = new Color(0x3a2a12);
/** 高亮色的暂存:每次悬停都 new 一个 Color 是没必要的分配 */
const tintTmp = new Color();
/** 悬停拾取节流(毫秒):全塔 140 万三角形,不必每帧都射线 */
const HOVER_MS = 90;
/** 鼠标 / 触控移动超过这个距离,就视为拖拽而不是单击 */
const CLICK_DRAG_PX = 6;

export function createPicking(camera, roots, dom, { shouldAccept = null } = {}) {
  const list = Array.isArray(roots) ? roots : [roots];
  const ray = new Raycaster();
  const ndc = new Vector2();
  const handlers = new Set();
  let enabled = true;
  let hover = null;      // { object, instanceId, restore() }
  let down = null;        // { x, y, pointerId }
  let suppressClick = false;

  function pickAt(clientX, clientY) {
    const rect = dom.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(list, true)) {
      // three 的 intersectObjects 不跳过不可见子树,故这里自己判 ——
      // 而且要一路判到根:逐层聚焦(explode.focus)与古今变化关的都是**组**,
      // 只看 h.object.visible 会拾到画面上根本不存在的构件。
      if (!visibleInTree(h.object)) continue;
      const key = resolveKey(h.object, h.instanceId);
      if (key && hasPartInfo(key.partKey) && (!shouldAccept || shouldAccept(key, h))) {
        return { ...key, object: h.object, instanceId: h.instanceId, point: h.point };
      }
    }
    return null;
  }

  /** 自身与全部祖先都可见,才算真的在画面上 */
  function visibleInTree(o) {
    for (let n = o; n; n = n.parent) if (!n.visible) return false;
    return true;
  }

  /** 自命中对象向上找到带 partKey 的语义节点 */
  function resolveKey(object, instanceId) {
    if (object.isInstancedMesh && instanceId != null) {
      const meta = object.userData.instances?.[instanceId];
      if (meta) return { partKey: meta.partKey, meta };
    }
    let o = object;
    while (o) {
      if (o.userData?.partKey) return { partKey: o.userData.partKey, meta: o.userData };
      o = o.parent;
    }
    return null;
  }

  function clearHover() {
    if (!hover) return;
    hover.restore();
    hover = null;
    dom.style.cursor = '';
  }

  function setHover(hit) {
    if (hover && hover.object === hit?.object && hover.instanceId === hit?.instanceId) return;
    clearHover();
    if (!hit) return;
    const o = hit.object;

    if (o.isInstancedMesh && hit.instanceId != null) {
      // 逐实例染色:instanceColor 与材质色相乘,只影响命中的那一朵
      if (!o.instanceColor) {
        for (let i = 0; i < o.count; i++) o.setColorAt(i, WHITE);
      }
      // ★ 高亮是**在这朵的基色之上再乘一道**,撤销时还原到基色 —— 不是刷成白。
      //   铺作已有逐朵色差(materials/bracketTone.js 写在 instanceColor 里),
      //   旧写法把 restore 硬编成 WHITE,鼠标扫过一圈就把那圈色差抹平了。
      const base = new Color();
      o.getColorAt(hit.instanceId, base);
      o.setColorAt(hit.instanceId, tintTmp.copy(base).multiply(TINT));
      o.instanceColor.needsUpdate = true;
      hover = {
        object: o, instanceId: hit.instanceId,
        restore() { o.setColorAt(hit.instanceId, base); o.instanceColor.needsUpdate = true; },
      };
    } else if (o.material?.emissive) {
      // 共享材质不可直接改:换上该 mesh 专属克隆(缓存在 userData,不反复 new)
      const shared = o.userData.__sharedMat ?? o.material;
      o.userData.__sharedMat = shared;
      if (!o.userData.__hoverMat) {
        o.userData.__hoverMat = shared.clone();
        o.userData.__hoverMat.emissive.copy(EMISSIVE);
      }
      o.material = o.userData.__hoverMat;
      hover = { object: o, instanceId: undefined, restore() { o.material = shared; } };
    } else {
      hover = { object: o, instanceId: hit.instanceId, restore() {} };
    }
    dom.style.cursor = 'pointer';
  }

  let last = 0;
  function onDown(e) {
    if (!enabled) return;
    down = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    suppressClick = false;
  }

  function onMove(e) {
    if (!enabled) return;
    if (down && (down.pointerId == null || down.pointerId === e.pointerId)) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (dx * dx + dy * dy > CLICK_DRAG_PX * CLICK_DRAG_PX) suppressClick = true;
    }
    const now = performance.now();
    if (now - last < HOVER_MS) return;
    last = now;
    setHover(pickAt(e.clientX, e.clientY));
  }

  function onUp() {
    down = null;
  }

  function onClick(e) {
    if (!enabled) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const hit = pickAt(e.clientX, e.clientY);
    for (const fn of handlers) fn(hit);
  }

  dom.addEventListener('pointerdown', onDown, { passive: true });
  dom.addEventListener('pointermove', onMove, { passive: true });
  dom.addEventListener('pointerup', onUp, { passive: true });
  dom.addEventListener('pointercancel', onUp, { passive: true });
  dom.addEventListener('click', onClick);

  return {
    enable() { enabled = true; },
    disable() { enabled = false; clearHover(); },
    onPick(fn) { handlers.add(fn); return () => handlers.delete(fn); },
    dispose() {
      clearHover();
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('click', onClick);
    },
    pickAt,
  };
}
