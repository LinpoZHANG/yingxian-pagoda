/**
 * scene/environment/EnvironmentConfig.js —— 昼夜环境预设
 * ─────────────────────────────────────────────────────────────
 * ★ 这里只保留**真正被读取**的字段。
 *
 * 这个文件原本是一套「中央预设」:天色、光照、地形/农田/远山调色板
 * 一应俱全。但它从来没有接上过 ——
 *   · 光照的真值是 lighting.js 里的 DAY / NIGHT 常量:构造末尾的 apply()
 *     会把 preset 初始化的每个值立刻覆盖回去;
 *   · 天色写死在 sky.js 的 GLSL 里:那对 uZenith / uHorizon uniform
 *     被 preset 写入,却从未被片元着色器读取;
 *   · 地面自己用 terrainColor(x, z) 逐点算色,不吃 terrainPalette;
 *   · 而唯一能把这些送进各模块的 EnvironmentSystem.applyPreset,
 *     一次也没有被调用过。
 * 于是「改这里 → 画面不变」。留着一堆看起来可调、其实没接线的旋钮,
 * 比没有旋钮更坏 —— 已全部删除,各自的真值在各自的模块里。
 *
 * 昼夜切换不走「换预设」,而是 main.js 每帧把 lighting.value(0→1)
 * 喂给 sky / ground / horizon 的 setDayNight,过渡才连续。
 */

import { Color, Vector3 } from 'three';

const environmentPresets = {
  day: {
    name: 'day',
    /** ground:scene.fog 与 background 的基色;horizon:山脊霾色 */
    fogColor: '#c8bea7',
    /** sky:太阳辉光方位(每帧还会被 main 的 sky.setSunDir 覆盖为实际光源方向) */
    sunDirection: new Vector3(0.7, 0.24, 0.46).normalize(),
    /** sky:夜间月轮方位,与 lighting 的月光同向 */
    moonDirection: new Vector3(-0.42, 0.7, 0.38).normalize(),
    /**
     * horizon:山体的受光坡 / 背光坡两端色。
     * ★ 会覆盖 createHorizonRange 的同名默认参数 —— 真值在这里。
     * 2026-09-04 远山改为真高程面之后,明暗由**真法线打光**算出,
     * 不再需要「近/中/远」三层各一个单色:层次来自真实距离与真实遮挡。
     * 同日再改为**岩土分带**:晋北恒山一带下部黄土(赭黄)、上部灰岩(偏冷灰),
     * 各一对「受光/背光」。只给一对暖沙色时画面读成沙漠。
     */
    /* 2026-09-04:受光端提亮、背光端压暗。
     * 实测旧值两端只差 1.7 倍(L133 / L78),过完空气透视后屏幕对比只剩 8~11%,
     * 山读作色块。拉到 2.6 倍(L163 / L62)—— 这是「坡面明暗层次」三处修正之一,
     * 另两处是 Lambert 重映射与凹凸项,见 createMountainTerrain。 */
    /* 2026-09-04 二次修正:**受光端退回原值**。
     * 上一版把 rockLit 提到 #a5a598、loessLit 提到 #bda173 想拉对比,
     * 但那同时改掉了山的**底色**(用户:「底色和一开始不一样了」)。
     * 对比改为只从背光端要:受光端不动,背光端压暗 15%。
     * 比值 1.73× → 2.04×,比上一版的 2.75× 克制,而底色分毫未动。 */
    /* 岩带要保持**偏灰**。把岩带也一起调暖,就抹掉了「上部灰岩 / 下部黄土」的分带,
     * 而 loessTop = 150 m 之下只占可见山体三成 —— 岩带才是主色。
     * 岩带一暖,整片山就读成沙丘(这正是第 17 轮「像沙漠」的老问题)。
     * 土红交给**黄土带**(loessLit #a8815a),岩带只把背光端从蓝黑改成暖褐。 */
    rockLit: '#a9a393',
    rockShadow: '#615249',
    loessLit: '#c59b72',
    loessShadow: '#80614c',
  },
  night: {
    name: 'night',
    fogColor: '#0e1524',
    sunDirection: new Vector3(-0.42, 0.7, 0.38).normalize(),
    moonDirection: new Vector3(-0.42, 0.7, 0.38).normalize(),
    rockLit: '#39414f',
    rockShadow: '#161b26',
    loessLit: '#3a3527',
    loessShadow: '#1d1a14',
  },
};

export function getEnvironmentPreset(name = 'day') {
  const preset = environmentPresets[name] ?? environmentPresets.day;
  return {
    ...preset,
    fogColorObject: new Color(preset.fogColor),
  };
}
