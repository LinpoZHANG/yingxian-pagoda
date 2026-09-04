/**
 * core/loop.js —— 渲染循环与时钟
 * ─────────────────────────────────────────────────────────────
 * 统一的 requestAnimationFrame 循环;维护 Clock;提供 onTick 订阅,
 * 巡航动画 / 状态过渡 / 材质 uniform 更新都以订阅方式挂入,
 * 避免各模块自建循环。
 */

import { Clock } from 'three';

const ticks = new Set();

/** 注册每帧回调 fn(delta, elapsed);**返回值就是解绑函数**,不另设 offTick */
export function onTick(fn) { ticks.add(fn); return () => ticks.delete(fn); }

export function startLoop({ renderer, scene, camera }) {
  const clock = new Clock();
  let running = true;

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    // 标签页切回时 delta 可能极大,钳制避免过渡动画瞬间跳完
    const delta = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.elapsedTime;
    // 订阅者抛错不得连累出图:摘掉出错的回调,画面继续
    for (const fn of ticks) {
      try {
        fn(delta, elapsed);
      } catch (err) {
        ticks.delete(fn);
        console.error('[loop] onTick 回调抛错,已摘除该回调:', err);
      }
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return { stop() { running = false; }, resume() { running = true; frame(); } };
}
