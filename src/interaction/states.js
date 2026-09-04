/**
 * interaction/states.js —— 场景状态机(交互中枢)
 * ─────────────────────────────────────────────────────────────
 * 单一状态源。UI 只发指令、相机与场景只订阅,任何模块不得绕过
 * 状态机私自改场景。所有切换都带过渡时长,禁止瞬切。
 *
 * state = {
 *   mode: 'cruise' | 'free' | 'storey' | 'exploded' | 'bracket' | 'statue',
 *   level: 'all' | 1..6,      // storey / exploded 模式携带;6 为塔刹
 *   time:  'day' | 'night',
 *   era:   'ancient' | 'modern',  // 古今变化:立面材料年代(见 facade/facadeEras.js)
 *   pick:  partKey | null,     // 当前选中的构件
 *   viewTick: number,          // 同模式内强制重新取景
 * }
 *
 * era 与 mode 正交:它换的是立面上那一层墙的构件,不换镜头也不换模式,
 * 因此在巡航、逐层、分解、剖透视里都可以随时切 —— 状态机不为它设任何互斥。
 */

/** 各模式的过渡时长(秒)—— 距离越远给越长的时间 */
export const TRANSITION = {
  default: 1.5,
  toCruise: 2.2,
  toBracket: 2.0,
  toExploded: 1.8,
  dayNight: 2.4,
};

/** 合法迁移:任何模式都可互达,但记录来路以便「返回」 */
const MODES = ['cruise', 'free', 'storey', 'exploded', 'bracket', 'statue', 'buildtour'];

/** 立面年代:古貌(夹泥墙)/ 今貌(木构)*/
const ERAS = ['ancient', 'modern'];

export function createStates(initial = {}) {
  let state = {
    mode: 'cruise', level: 'all', time: 'day', era: 'modern', season: 'auto', pick: null, viewTick: 0,
    ...initial,
  };
  const listeners = new Set();
  let previousMode = 'cruise';

  function notify(patch, prev) {
    for (const fn of listeners) fn(state, patch, prev);
  }

  return {
    get() { return { ...state }; },
    get previousMode() { return previousMode; },

    /** 合并式更新;只有真正变化的字段才会广播 */
    set(patch) {
      const prev = { ...state };
      const next = { ...state, ...patch };
      if (next.mode && !MODES.includes(next.mode)) {
        throw new Error(`未知场景模式:${next.mode}`);
      }
      if (next.era && !ERAS.includes(next.era)) {
        throw new Error(`未知立面年代:${next.era}`);
      }
      // 逐层导览必须携带层号;给了层号即视为进入 storey
      if (patch.level != null && !patch.mode) next.mode = 'storey';
      if (next.mode === 'storey' && next.level == null) next.level = 'all';

      const changed = Object.keys(next).some((k) => next[k] !== state[k]);
      if (!changed) return state;
      if (next.mode !== state.mode) previousMode = state.mode;
      state = next;
      notify(patch, prev);
      return state;
    },

    toggleTime() { return this.set({ time: state.time === 'day' ? 'night' : 'day' }); },
  /**
   * 季节:'auto'(随巡航轮换)或四季之一(手动冻结)。
   * 与 era 同一个形状 —— 一枚键点一次换一个,点满一圈回到 auto。
   * 状态机不解释它,只广播;由 scene/seasons 消费。
   */
  cycleSeason(order) {
    const i = order.indexOf(state.season);
    return this.set({ season: order[(i + 1) % order.length] });
  },
    /** 古今变化:在夹泥墙(古)与木构(今)之间来回 */
    toggleEra() { return this.set({ era: state.era === 'modern' ? 'ancient' : 'modern' }); },
    /** 在某模式与「自由视角」之间来回切 */
    toggleMode(mode) {
      return this.set(state.mode === mode ? { mode: 'free' } : { mode });
    },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
