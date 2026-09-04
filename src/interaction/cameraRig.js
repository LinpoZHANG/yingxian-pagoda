/**
 * interaction/cameraRig.js —— 相机编排(巡航 + 定点取景)
 * ─────────────────────────────────────────────────────────────
 * 1. 自动巡航:环塔的**闭式螺旋**,恒定角速度绕行、高度独立 ping-pong,
 *    lookAt 平滑跟随对应高度。累积圈数同时是 scene/seasons 的季节时钟;
 * 2. 定点取景:逐层导览 / 斗拱特写 / 分解视图的相机位库,
 *    任意状态之间用统一缓动(位置 + 目标点双补间)过渡;
 * 3. 与 controls 的交接:进入 free 模式把当前机位交给 OrbitControls,
 *    退出时收回 —— 交接瞬间不跳变。
 */

import { Vector3 } from 'three';
import { GLOBAL } from '../data/pagodaParams.js';
import { TRANSITION } from './states.js';

const H = GLOBAL.totalHeight;
const TAU = Math.PI * 2;
/** 缓动:两端平缓的三次曲线 */
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * 巡航螺旋(闭式)。
 * ★ 为什么不再用 CatmullRomCurve3:
 *   季节相位由**累积方位角**驱动(scene/seasons),而 getPoint(t) 不是弧长均匀的 ——
 *   沿曲线参数匀速推进,方位角会忽快忽慢,四个季节时长不等。
 *   路径本来就是一条解析螺旋,直接以恒定角速度积分方位角即可,曲线拟合没有增益。
 *   (rig.path 全项目无消费者,一并去掉。)
 *
 * ★ 高度与方位解耦
 *   方位角单调累积(季节的时钟);高度是**独立轨道**,按 climbTurns 做
 *   ping-pong(升到顶再缓降回底)。于是从塔底到塔顶可以跨过好几轮四季,
 *   而且全程没有任何位置跳变 —— 不需要转场。
 */
const CRUISE = {
  turnSeconds: 30,     // 一圈时长:相机在平面投影上扫满 360° 的秒数
  /* 升到顶用几圈(ping-pong 半周期)。**取值受四季年长约束,改前先看 TURNS_PER_SEASON。**
   *
   * 现行 2:每圈爬升 24~28.5 m,60 s 升顶,均速 0.88 m/s。
   *
   * ★ 这个数曾经是 3,理由是「climbTurns=2 时 4 圈就重复,春永远在底」——
   *   那是对着**一圈一季、一年 4 圈**算的:高度周期 2×2=4 圈与年长 4 圈同拍,
   *   每年开春相机都停在同一个高度。
   *   但四季后来改成 `TURNS_PER_SEASON = 0.5`(半圈一季、**一年 2 圈**),
   *   前提没了。按 2 圈一年重算(年长 2 圈 ⇒ 图样每 2×climbTurns 圈复现):
   *
   *     climbTurns │ 每圈爬升          │ 升顶  │ 均速     │ 复现  │ 开春高度
   *     ───────────┼───────────────────┼───────┼──────────┼───────┼──────────────
   *          2     │ 28.5 / 24.0       │  60 s │ 0.88 m/s │ 2 min │ 6.7、59.2(2 种)
   *          3     │ 18.0 / 20.5 / 14.0│  90 s │ 0.58 m/s │ 3 min │ 6.7、45.2 ×2(2 种)
   *          4     │ 12.5/16.1/14.8/9.1│ 120 s │ 0.44 m/s │ 4 min │ 3 种
   *
   *   关键在最后一列:2 与 3 的开春高度**同样是 2 种**,当年那个退化情形已经不存在;
   *   代价只是图样 2 分钟复现而非 3 分钟。用户第65轮反馈「上升速度好像降低了」,
   *   查下来参数并未被改动 —— 慢的是这条**约束早已作废、取值却没跟着回来**。
   *
   *   > **一个参数是为了避开另一个模块的拍频才取的,那个模块的周期一变,
   *   > 这个取值就失去依据。** 跨模块的耦合要写在两边,只写在一边就会像这次一样,
   *   > 四季那边改完,这边还守着一条不存在的约束。 */
  climbTurns: 2,
  /* 折返缓冲:只在一趟行程的首尾各 18% 内加减速,中段匀速。
   * ★ 这里原本用整段三次缓动 ease(tri),结果首尾两圈几乎不动
   *   (实测第 1 圈只升 4.6 m、第 4 圈 2.9 m,俯角变化 1.1°/1.4°)——
   *   三次 S 曲线把一半的**参数**耗在了首尾 12% 的**高度**里,
   *   用户直接反馈「垂直上的变化几乎不可见」。
   *   折返需要的是"到端点前减速",不是"整段都在加减速"。 */
  reversalEase: 0.18,
  yLow: 0.10, yHigh: 0.88, yPow: 0.88,
  rFar: 0.92, rNear: 0.62,   // 越高越近,压迫感递增
  startAzimuth: 0,     // 自正南起转;季节交界也落在这里
};

/**
 * 梯形速度剖面的三角波:v 在 [0,e] 由 0 升到 1、中段恒为 1、[1−e,1] 降回 0,
 * 取其积分并归一化到 [0,1]。折返点速度仍归零(不会急停),但中段是**匀速**的。
 */
function softTri(t, e) {
  const total = 1 - e;
  if (t < e) return (t * t) / (2 * e) / total;
  if (t > 1 - e) { const u = 1 - t; return (1 - e - (u * u) / (2 * e)) / total; }
  return (t - e / 2) / total;
}

/** 累积圈数 → 机位。turns 单调递增,高度靠三角波折返 */
function helixAt(turns) {
  const az = CRUISE.startAzimuth + turns * TAU;
  const s = (turns / CRUISE.climbTurns) % 2;
  const tri = s <= 1 ? s : 2 - s;
  const k = softTri(tri, CRUISE.reversalEase);
  return {
    az,
    y: H * (CRUISE.yLow + (CRUISE.yHigh - CRUISE.yLow) * Math.pow(k, CRUISE.yPow)),
    r: H * (CRUISE.rFar + (CRUISE.rNear - CRUISE.rFar) * k),
  };
}

export function createCameraRig(camera, anchors) {
  const byName = new Map(anchors.map((a) => [a.name, a]));

  const camPos = camera.position.clone();
  const camTarget = new Vector3(0, H * 0.42, 0);
  // 过渡补间
  let tween = null;
  let cruiseTurns = 0, cruising = false;

  function viewFor(name, level) {
    if (name === 'bracket') {
      // 斗拱特写由 states 调度,具体机位在 setBracketView 中给定
      return null;
    }
    const key = level && level !== 'all' ? `L${level}` : (name ?? 'overview');
    const a = byName.get(key) ?? byName.get('overview');
    const az = key === 'overview' ? Math.PI * 0.18 : Math.PI * 0.22;
    const el = key === 'overview' ? 0.16 : 0.10;
    const d = a.radius;
    return {
      position: new Vector3(
        Math.sin(az) * Math.cos(el) * d,
        a.position.y + Math.sin(el) * d,
        Math.cos(az) * Math.cos(el) * d,
      ),
      target: a.position.clone(),
    };
  }

  function goTo(view, duration = TRANSITION.default) {
    if (!view) return;
    tween = {
      t: 0, duration,
      fromP: camPos.clone(), fromT: camTarget.clone(),
      toP: view.position.clone(), toT: view.target.clone(),
    };
    cruising = false;
  }

  return {
    /** 直接给定机位(斗拱特写等自定义视点) */
    goToPosition(position, target, duration = TRANSITION.default) {
      goTo({ position, target }, duration);
    },
    goToView(name, level, duration) { goTo(viewFor(name, level), duration); },

    cruise(on) {
      cruising = on;
      if (on) {
        tween = null;
        /* 就近接入:只把累积圈数**平移不到半圈**去对齐当前方位角,
         * 不重置圈数 —— 否则每次退出/重入巡航,季节都会跳回起点。 */
        const camAz = Math.atan2(camPos.x, camPos.z);
        const pathAz = CRUISE.startAzimuth + cruiseTurns * TAU;
        let d = camAz - pathAz;
        d = Math.atan2(Math.sin(d), Math.cos(d));      // 归一到 ±π
        cruiseTurns += d / TAU;
      }
    },
    get cruising() { return cruising; },
    /** 定点取景的补间是否仍在进行 —— 逐层导览要等它走完才交给 OrbitControls */
    get tweening() { return tween !== null; },
    /** 累积圈数(float,单调)。scene/seasons 的季节时钟就读这个 */
    get cruiseTurns() { return cruiseTurns; },

    /**
     * 交接给 OrbitControls:以「相机此刻实际所在」为准交出,
     * 而不是以 rig 内部缓存为准 —— 否则外部直接摆过相机时会被拉回原点。
     */
    handoff(controls) {
      camPos.copy(camera.position);
      controls.object.position.copy(camPos);
      controls.target.copy(camTarget);
      controls.update();
      tween = null; cruising = false;
    },

    /** 外部直接摆放相机后,把 rig 内部状态同步过来(开发期取景 / 深链接) */
    sync(position, target) {
      camPos.copy(position);
      if (target) camTarget.copy(target);
      tween = null;
    },
    /** 从 OrbitControls 收回控制权 */
    takeBack(controls) {
      camPos.copy(controls.object.position);
      camTarget.copy(controls.target);
    },

    tick(dt, freeMode) {
      if (freeMode) { camPos.copy(camera.position); return; }
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / tween.duration);
        const k = ease(tween.t);
        camPos.lerpVectors(tween.fromP, tween.toP, k);
        camTarget.lerpVectors(tween.fromT, tween.toT, k);
        if (tween.t >= 1) tween = null;
      } else if (cruising) {
        // 恒定角速度 ⇒ 「一圈」是恒定时长,与半径、高度、路径长度都无关
        cruiseTurns += dt / CRUISE.turnSeconds;
        const { az, y, r } = helixAt(cruiseTurns);
        camPos.set(Math.sin(az) * r, y, Math.cos(az) * r);
        // 看向塔身对应高度(略低于相机,形成仰望→平视→俯瞰的连续变化)
        camTarget.set(0, camPos.y * 0.72 + H * 0.08, 0);
      }
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
    },
    get target() { return camTarget; },
  };
}
