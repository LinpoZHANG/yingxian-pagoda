/**
 * scene/edgeOverlay.js —— 构件棱线叠加层
 * ─────────────────────────────────────────────────────────────
 * 木构的**层次**是靠棱读出来的:一朵七铺作是四跳华栱 + 两层昂 + 十几只斗,
 * 相邻构件同色同材、又互相咬合,只靠明暗几乎分不开 ——
 * 用户第35轮的原话是「所有斗拱部分粘连在一起」。
 * 建筑图上的解法是**加线**,这一层做的就是这件事。
 *
 * 怎么做的:
 *   每个网格取 `EdgesGeometry`(只留夹角超过阈值的棱,共面处不出线),
 *   作为**该网格自己的子节点**加进去 —— 于是它自动跟着父节点的变换走,
 *   分解视图、剖切、逐层显隐一概不用另写一份逻辑。
 *   InstancedMesh 没有实例化的线渲染,故把实例矩阵**烘进顶点**合并成一条
 *   LineSegments;全塔合计约 3.3 M 顶点(其中铺作 2.9 M),≈38 MB 显存,
 *   首次开启时才构建,关闭后保留以免反复重建。
 *
 * 只在**构造读图模式**下开启,不进交付默认态 —— 加线会把「历史氛围」读成
 * 「建筑图」,那是两种成品,不该混在一个画面里。
 */

import {
  LineSegments, LineBasicMaterial, EdgesGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Vector3,
} from 'three';

/** 阈值 22°:方料之间的咬合棱全留,弧面(瓦垄、覆盆础)的细分棱不出线 */
const THRESHOLD = 22;
/** 顶点数超过此值的网格不出线(屋面皮肤这类大面,出线只会织成一张网) */
const MAX_VERTS = 200000;

/**
 * @param {Object3D|Object3D[]} roots 要挂棱线的根节点。
 *   ★ 必须把**斗拱特写的英雄节点**也传进来:它是独立于塔身的一组 Mesh,
 *   只挂 pagoda.root 的话,特写模式里一根线都没有(第37轮实见)。
 */
export function createEdgeOverlay(roots) {
  const rootList = Array.isArray(roots) ? roots : [roots];
  // fog: true —— 让棱线跟着场景雾一起退。少了这一条,远景的塔会变成一张
  // 密不透风的墨线网:线不受雾影响,而它下面的体块受,越远线越抢。
  const mat = new LineBasicMaterial({
    color: 0x1b1f24, transparent: true, opacity: 0.70, depthWrite: false, fog: true,
  });
  const built = [];
  let ready = false;

  function build() {
    const targets = [];
    for (const root of rootList) {
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData?.partKey === 'cutFace') return;    // 剖切断口副本不出线
        if (o.userData?.eraOverlay) return;              // 古今面层的渐变副本与本体同几何,线只出一份
        if (o.geometry.attributes.position.count > MAX_VERTS) return;
        targets.push(o);
      });
    }
    const m = new Matrix4(), v = new Vector3();
    for (const o of targets) {
      const eg = new EdgesGeometry(o.geometry, THRESHOLD);
      const src = eg.attributes.position.array;
      if (!src.length) { eg.dispose(); continue; }
      let geo;
      if (o.isInstancedMesh) {
        // 实例矩阵烘进顶点:线渲染没有 instancing,只能合并
        const out = new Float32Array(src.length * o.count);
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          const base = i * src.length;
          for (let k = 0; k < src.length; k += 3) {
            v.set(src[k], src[k + 1], src[k + 2]).applyMatrix4(m);
            out[base + k] = v.x; out[base + k + 1] = v.y; out[base + k + 2] = v.z;
          }
        }
        geo = new BufferGeometry();
        geo.setAttribute('position', new Float32BufferAttribute(out, 3));
        eg.dispose();
      } else {
        geo = eg;
      }
      const ls = new LineSegments(geo, mat);
      ls.userData = { partKey: 'edgeOverlay' };
      ls.raycast = () => {};                 // 不参与拾取
      ls.frustumCulled = true;
      ls.visible = false;
      o.add(ls);                             // 挂成子节点:变换/显隐自动跟随
      built.push(ls);
    }
    ready = true;
  }

  return {
    /** 首次调用时才构建(约 0.3 s / 38 MB),之后只切显隐 */
    set(on) {
      if (on && !ready) build();
      for (const ls of built) ls.visible = on;
    },
    get material() { return mat; },
    /**
     * 两档线宽 —— WebGL 的 `linewidth` 恒为 1 px,画不出真正的细线,
     * 于是「细」只能靠**降对比**做:颜色由黑转灰、不透明度压低,
     * 线就退成一道轮廓的暗示,而不是一条描边。
     *   'trace'  近景自由视角:**冷调深灰** 0.70 —— 压得出暗、又不夺构件的色;
     *   'faint'  巡航:同色 **0.42** —— 只留一道轮廓的暗示,不把氛围读成建筑图;
     *   'study'  斗拱特写与读图模式:近黑 1.00 —— 每个构件都要读得出。
     */
    setStyle(kind) {
      // 第38轮用户定值:交付/近景灰 + 50%;斗拱特写近黑 + 100%
      // 第42轮用户定:交付/近景档由**暖灰改冷灰**并提高不透明度。
      // 暖灰(0x7a7168)与木构同色系,线陷在木色里读不出来;
      // 冷灰与暖木色**互补**,同样的明度下轮廓一下就跳出来了 ——
      // 「看不清」有时不是对比不够,是**色相太近**。
      // 第43轮用户定:交付/近景档也要**深灰接近黑色**。
      // 第42轮的冷灰 0x5c646e 解决了「色相太近」,但明度仍不够 ——
      // 线要能在木色上压出一道暗,而不只是换个色相。
      // 保留一点冷调(蓝分量略高),与暖木色仍互补。
      // 三档。WebGL 的 linewidth 恒为 1 px,「更细」只能靠更低的不透明度做。
      if (kind === 'study') { mat.color.setHex(0x14110e); mat.opacity = 1.0; }
      else if (kind === 'faint') { mat.color.setHex(0x191d22); mat.opacity = 0.42; }
      else { mat.color.setHex(0x1b1f24); mat.opacity = 0.70; }
      mat.transparent = mat.opacity < 0.999;
      mat.needsUpdate = true;
    },
    get count() { return built.length; },
    dispose() {
      for (const ls of built) { ls.geometry.dispose(); ls.parent?.remove(ls); }
      built.length = 0; ready = false; mat.dispose();
    },
  };
}
