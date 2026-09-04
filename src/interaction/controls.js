/**
 * interaction/controls.js —— 自由视角控制器
 * ─────────────────────────────────────────────────────────────
 * 包装 OrbitControls:阻尼、距离与俯仰限制(不穿地、不出雾界)、
 * 目标点约束在塔身包围盒内;移动端触控可用。
 *
 * 两种可交互档:
 *   free    —— 完全自由(旋转 + 平移 + 缩放)
 *   orbit   —— **本层环绕**:锁死相机高度、禁用平移,只能绕塔转与推拉。
 *              逐层导览用这一档:视点仍在本层的标高上,但可以转着看一圈。
 */

import { Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLOBAL } from '../data/pagodaParams.js';

export function createControls(camera, dom) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.minDistance = 3;
  controls.maxDistance = GLOBAL.totalHeight * 4.5;
  // 不许钻到地面以下:极角上限留 4° 余量
  controls.maxPolarAngle = Math.PI / 2 - 0.07;
  controls.minPolarAngle = 0.08;
  controls.enabled = false;

  /* 高度锁。OrbitControls 的机位 = target + 球坐标(r, phi, theta),
   * 高度 = target.y + r·cos(phi)。要在**推拉时也保持高度不变**,
   * 就不能把 phi 定死成一个常数 —— r 一变高度就跟着变。
   * 每帧按当前 r 反解出该有的 phi,再把 min/max 都夹到它上面:
   *   phi = acos((lockY − target.y) / r)
   * 于是 update() 之后 y 恒等于 lockY,而 theta(方位)完全自由。 */
  let lockY = null;
  function applyHeightLock() {
    if (lockY == null) return;
    const t = controls.target;
    const r = camera.position.distanceTo(t);
    const dy = lockY - t.y;
    if (r < 1e-3 || Math.abs(dy) > r) return;   // 够不着这个高度就先不夹,免得 acos 出 NaN
    const phi = Math.acos(Math.min(1, Math.max(-1, dy / r)));
    controls.minPolarAngle = phi;
    controls.maxPolarAngle = phi;
  }
  const FREE_POLAR = { min: 0.08, max: Math.PI / 2 - 0.07 };

  const limit = new Vector3();
  controls.addEventListener('change', () => {
    // 目标点约束在塔身圆柱范围内,避免平移丢失主体
    const t = controls.target;
    limit.set(t.x, 0, t.z);
    const maxR = GLOBAL.totalHeight * 0.5;
    if (limit.length() > maxR) {
      limit.setLength(maxR);
      t.x = limit.x; t.z = limit.z;
    }
    t.y = Math.min(Math.max(t.y, 0.5), GLOBAL.totalHeight * 1.6);
  });

  return {
    controls,
    /** 完全自由视角 */
    enable() {
      lockY = null;
      controls.enablePan = true;
      controls.enableZoom = true;
      controls.minPolarAngle = FREE_POLAR.min;
      controls.maxPolarAngle = FREE_POLAR.max;
      controls.enabled = true;
    },
    /**
     * 本层环绕:相机高度锁在 y,禁用平移(右键),保留旋转与推拉。
     * 逐层导览用这一档 —— 「不能用右键,但可以在本层旋转建筑」。
     */
    enableOrbitAtHeight(y) {
      lockY = y;
      controls.enablePan = false;      // 右键平移会把视点带离本层
      controls.enableZoom = true;
      controls.enabled = true;
      applyHeightLock();
    },
    disable() {
      controls.enabled = false;
      lockY = null;
      controls.enablePan = true;
      controls.minPolarAngle = FREE_POLAR.min;
      controls.maxPolarAngle = FREE_POLAR.max;
    },
    update() {
      if (!controls.enabled) return;
      applyHeightLock();               // 必须在 update 之前:它靠的是极角上下限
      controls.update();
    },
  };
}
