/**
 * scene/seasons/SeasonSystem.js —— 巡航四季:季节时钟与分发
 * ═════════════════════════════════════════════════════════════
 * 复刻昼夜那条已验证的范式:**单一插值时钟 + 每帧分发**,不切预设。
 * 昼夜的时钟是 lighting.value(0→1);四季的时钟是**相机累积圈数**。
 *
 * ★ 时钟来源:方位角,不是高度、不是曲线参数
 *   season = 累积方位角 / (2π × TURNS_PER_SEASON)。
 *   于是「一圈」= 相机在平面投影上扫满 360°,恒定角速度下是恒定时长;
 *   高度是一条**独立轨道**,从塔底到塔顶可以跨过好几轮四季。
 *   (曲线参数不行:CatmullRomCurve3.getPoint(t) 不是弧长均匀的,
 *    沿 t 匀速推进会让四季时长不等 —— 这正是 cameraRig 换回闭式螺旋的原因。)
 *
 * ★ 写入时序(会踩坑,务必保持)
 *   本系统写的是各模块的**昼态基准值**,再由 setDayNight 在其上做昼→夜插值。
 *   所以每帧必须:
 *       seasons.apply()  →  lighting.tick()  →  *.setDayNight()
 *   顺序反了,季节会被夜色插值覆写掉。
 *
 * ★ 可摘除
 *   不创建本系统,场景行为与接入前逐字节一致(秋季即现状)。
 *   ?seasons=0 关闭;?season=spring|summer|autumn|winter 冻结某季调试。
 */

import { Color, Vector3 } from 'three';
import {
  SEASONS, SEASON_KEYS, SEASON_LABELS, TURNS_PER_SEASON, BLEND_START, WAR_RAMP, WAR, NIGHT_WINDOW,
  sunDirFromElevation,
} from './SeasonConfig.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k, out) => {
  out[0] = lerp(a[0], b[0], k);
  out[1] = lerp(a[1], b[1], k);
  out[2] = lerp(a[2], b[2], k);
  return out;
};

/** 把配置里的色串预解析成 Color,避免每帧 new/parse */
function prepare() {
  const cache = {};
  for (const key of SEASON_KEYS) {
    const s = SEASONS[key];
    cache[key] = {
      fogColor: new Color(s.fog.color),
      sunColor: new Color(s.light.sunColor),
      hemiSky: new Color(s.light.hemiSky),
      hemiGround: new Color(s.light.hemiGround),
      ambient: new Color(s.light.ambient),
      ridgeHaze: new Color(s.horizon.ridgeHaze),
      mist: new Color(s.horizon.mist),
      glow: new Color(s.horizon.glow),
      rockLit: new Color(s.horizon.rockLit),
      rockShadow: new Color(s.horizon.rockShadow),
      loessLit: new Color(s.horizon.loessLit),
      loessShadow: new Color(s.horizon.loessShadow),
      scrub: new Color(s.horizon.scrub),
      bloom: new Color(s.horizon.bloom),
      gTint: new Color(s.ground.tint),
      gField: new Color(s.ground.fieldTint),
      gCrown: new Color(s.ground.crownTint),
      sunDir: sunDirFromElevation(s.light.sunElevDeg),
    };
  }
  return cache;
}

export function createSeasonSystem({
  sky, ground, horizon, lighting, farmland, vegetation,
  particles, warSmoke, buildingSnow, freeze = null, freezeWar = null,
} = {}) {
  const C = prepare();

  // 每帧复用的临时量(零分配)
  const tmpColor = new Color();
  /* 战乱叠加层曾用 `w > 0 ? 战乱色 : 当季色` 的硬分支 ——
   * w 从极小值归零的那一帧会整块换色。改为按 w 插值到临时色再传出。 */
  const tmpHemiSky = new Color();
  const tmpAmbient = new Color();
  const tmpMist = new Color();
  const tmpGlow = new Color();
  const tmpGround = new Color();
  const tmpField = new Color();
  const tmpCrown = new Color();
  const tmpSun = new Vector3();
  /* 战乱大气层的常量色预解析一次。w 是叠加强度,war=0 时整层不生效。 */
  const W = {
    fog: new Color(WAR.fogColor), sun: new Color(WAR.sunColor),
    hemiSky: new Color(WAR.hemiSky), ambient: new Color(WAR.ambient),
    ground: new Color(WAR.groundTint), ridge: new Color(WAR.ridgeHaze),
    mist: new Color(WAR.mist), glow: new Color(WAR.glow),
  };
  const tmpZenith = [0, 0, 0];
  const tmpHorizon = [0, 0, 0];
  const tmpTint = [0, 0, 0];

  let turns = 0;
  /* 手动冻结:底栏季节键写入,'auto' 表示随巡航轮换。
   * 与构造期的 freeze(深链接 ?season=)是同一条通路 —— 运行时可改。 */
  let manual = SEASON_KEYS.includes(freeze) ? freeze : null;
  let idx = SEASON_KEYS.indexOf(freeze ?? 'autumn');
  if (idx < 0) idx = 2;
  let blend = 0;
  let war = 0;
  /* 巡航昼夜:null = 不由季节驱动(冻结某季 / 非巡航模式),交还给昼夜按钮。 */
  let night = null;
  let fromKey = SEASON_KEYS[idx], toKey = SEASON_KEYS[idx];

  /** 冻结模式下不看时钟;否则由累积圈数解出「当前季 + 向下一季的过渡量」 */
  function resolve() {
    if (manual) {
      fromKey = toKey = manual;
      blend = 0;
      night = null;                       // 冻结某季时不跑昼夜,交给昼夜按钮
      /* ★ 手动选秋 = **带烽火的秋**。
       * 秋这一季的内容就是战乱(用户裁定),底栏点「秋」若给太平态,
       * 等于四季里少了一季的主角。默认 1。
       * 「秋 = 现状」那条基准仍然可验,只是要显式写出太平态:
       *   ?seasons=0  与  ?season=autumn&war=0  逐像素相等。
       * 把默认从 0 改成 1 的代价就是这个 —— 恒等测试的链接要带 &war=0。 */
      war = manual === 'autumn' ? (freezeWar ?? 1) : 0;
      return;
    }
    const phase = turns / TURNS_PER_SEASON;
    const i = Math.floor(phase);
    const f = phase - i;
    // 圈内前 75% 是纯季节,后 25% 过渡 ⇒ 交界恒定落在同一方位角(整数 TURNS_PER_SEASON 时)
    blend = smoothstep(BLEND_START, 1, f);
    /* 昼夜与季节共用同一个 f ⇒ 永远同相位,换季不会撞上半截黄昏。
     * 黄昏 0.72→0.80 入夜,黎明 0.96→1.0 回昼;夜的核心段约占一季的 1/4。 */
    night = smoothstep(NIGHT_WINDOW.duskStart, NIGHT_WINDOW.duskEnd, f)
          * (1 - smoothstep(NIGHT_WINDOW.dawnStart, NIGHT_WINDOW.dawnEnd, f));
    fromKey = SEASON_KEYS[((i % 4) + 4) % 4];
    toKey = SEASON_KEYS[(((i + 1) % 4) + 4) % 4];
    /* 战乱只在秋这一圈里升起来,并在并入冬时随雪落熄灭。
     * 用**圈内进度 f** 而不是 blend:blend 是两季之间的过渡量,
     * 它在圈的前 75% 恒为 0 —— 拿它当战乱的时钟,火会在最后四分之一圈里
     * 从无到满,读作"突然着火"而不是"渐渐烧起来"。 */
    if (fromKey === 'autumn') {
      /* 从 pre 起步而不是从 0 —— 夏→秋的过渡窗口已经把火烧到 pre,
       * 这里必须**接上**那个值,否则交界一帧掉回 0(见 WAR_RAMP.pre)。 */
      const rise = WAR_RAMP.pre
        + (1 - WAR_RAMP.pre) * smoothstep(WAR_RAMP.start, WAR_RAMP.full, f);
      war = rise * (1 - smoothstep(WAR_RAMP.end, 1, f));
    } else if (toKey === 'autumn') {
      // 夏→秋的过渡窗口里火先冒头,避免「花没了、火还没来」的空档
      war = blend * WAR_RAMP.pre;
    } else war = 0;
  }

  function apply() {
    resolve();
    const a = SEASONS[fromKey], b = SEASONS[toKey];
    const ca = C[fromKey], cb = C[toKey];
    const k = blend;

    /* 战乱叠加量。0 时以下每一处 lerp 的 k 都是 0 ⇒ 结果逐值等于当季本身,
     * 「秋 = 基准」不受这一层影响。 */
    const w = war * WAR.weight;

    /* ── 天空 ── */
    lerp3(a.sky.zenith, b.sky.zenith, k, tmpZenith);
    lerp3(a.sky.horizon, b.sky.horizon, k, tmpHorizon);
    lerp3(a.sky.cloudTint, b.sky.cloudTint, k, tmpTint);
    if (w > 0) {
      lerp3(tmpZenith, WAR.skyZenith, w, tmpZenith);
      lerp3(tmpHorizon, WAR.skyHorizon, w, tmpHorizon);
      lerp3(tmpTint, WAR.cloudTint, w, tmpTint);
    }
    sky?.setSeasonSky?.({
      zenith: tmpZenith,
      horizon: tmpHorizon,
      cloudLo: lerp(a.sky.cloudLo, b.sky.cloudLo, k),
      cloudHi: lerp(a.sky.cloudHi, b.sky.cloudHi, k),
      cloudCover: lerp(lerp(a.sky.cloudCover, b.sky.cloudCover, k), WAR.cloudCover, w),
      cloudTint: tmpTint,
    });

    /* ── 雾:同源色,一次算出、写两处 ──
     * scene.fog.color 与天空的地平线收敛色必须永远相等,
     * 否则天—地接缝会重新出现(sky.js 收敛带的前提条件)。 */
    tmpColor.copy(ca.fogColor).lerp(cb.fogColor, k);
    if (w > 0) tmpColor.lerp(W.fog, w);
    ground?.setSeasonFog?.({
      color: tmpColor,
      density: lerp(a.fog.density, b.fog.density, k) * (1 + (WAR.fogDensityMul - 1) * w),
    });
    sky?.setFogColor?.(tmpColor, null);

    /* ── 光照:只改仰角,方位锁死(见 SeasonConfig 的说明) ── */
    tmpSun.copy(ca.sunDir).lerp(cb.sunDir, k).normalize();
    tmpColor.copy(ca.sunColor).lerp(cb.sunColor, k);
    if (w > 0) tmpColor.lerp(W.sun, w);
    lighting?.setSeasonDay?.({
      sunDir: tmpSun,
      sunColor: tmpColor,
      sunIntensity: lerp(a.light.sunIntensity, b.light.sunIntensity, k) * (1 - (1 - WAR.sunMul) * w),
      // 天光也被烟染成暖褐:战乱里阴影不再是"偏冷的另一种光",这是它与太平最大的差别
      hemiSky: tmpHemiSky.copy(ca.hemiSky).lerp(cb.hemiSky, k).lerp(W.hemiSky, w),
      hemiGround: ca.hemiGround, hemiGroundTo: cb.hemiGround,
      ambient: tmpAmbient.copy(ca.ambient).lerp(cb.ambient, k).lerp(W.ambient, w),
      blend: k,
      hemiIntensity: lerp(a.light.hemiIntensity, b.light.hemiIntensity, k) * (1 - (1 - WAR.hemiMul) * w),
      ambientIntensity: lerp(a.light.ambientIntensity, b.light.ambientIntensity, k),
    });

    /* ── 远山:霾/雾/辉光 + 雪 ──
     * 雪线不能直接线性插值:秋(9999, 量 0)→ 冬(190, 量 0.95) 若同时插,
     * 中途雪线还在 5000 m 以上、什么都不显,末尾才突然全铺开。
     * 改为:一端量为 0 时直接采用另一端的雪线,只让**覆盖量**渐变 ⇒ 雪在正确的高度带淡入;
     * 两端都有雪时才插雪线 ⇒ 冬→春是雪线上移的「融雪」,不是整体变淡。 */
    const aOn = a.horizon.snowAmt > 0, bOn = b.horizon.snowAmt > 0;
    let snowLine;
    if (aOn && bOn) snowLine = lerp(a.horizon.snowLine, b.horizon.snowLine, k);
    else if (aOn) snowLine = a.horizon.snowLine;
    else if (bOn) snowLine = b.horizon.snowLine;
    else snowLine = a.horizon.snowLine;

    horizon?.setSeasonDay?.({
      ridgeHaze: tmpColor.copy(ca.ridgeHaze).lerp(cb.ridgeHaze, k).lerp(W.ridge, w),
      mistFrom: tmpMist.copy(ca.mist).lerp(cb.mist, k).lerp(W.mist, w),
      glowFrom: tmpGlow.copy(ca.glow).lerp(cb.glow, k).lerp(W.glow, w),
      /* 山的季相:岩土两带 + 灌丛斑。用户裁定「春夏靠山的**颜色**变化体现」,
       * 不靠加雾把山藏掉 —— 我们的远山是真高程面,藏掉是浪费。 */
      rockLitFrom: ca.rockLit, rockLitTo: cb.rockLit,
      rockShadowFrom: ca.rockShadow, rockShadowTo: cb.rockShadow,
      loessLitFrom: ca.loessLit, loessLitTo: cb.loessLit,
      loessShadowFrom: ca.loessShadow, loessShadowTo: cb.loessShadow,
      scrubFrom: ca.scrub, scrubTo: cb.scrub,
      scrubAmt: lerp(a.horizon.scrubAmt, b.horizon.scrubAmt, k),
      bloomFrom: ca.bloom, bloomTo: cb.bloom,
      bloomAmt: lerp(a.horizon.bloomAmt, b.horizon.bloomAmt, k),
      blend: k,
      snowLine,
      snowAmt: lerp(a.horizon.snowAmt, b.horizon.snowAmt, k),
    });

    /* ── 地面 / 农田 / 植被(二期)──────────────────────────────
     * 一律「基色 + 季节色 × 混合量」:秋季混合量为 0 ⇒ 逐值恒等于基准,
     * 不需要把基准再抄进这张表(抄基准出过事,见 C-7)。 */
    tmpGround.copy(ca.gTint).lerp(cb.gTint, k);
    let gAmt = lerp(a.ground.amt, b.ground.amt, k);
    // lerp(..., 1) 是**全量替换**:w 从 1e-9 归零时整块换色。按 w 插值才连续。
    if (w > 0) { tmpGround.lerp(W.ground, w); gAmt += (WAR.groundAmt - gAmt) * w; }
    ground?.setSeasonGround?.({
      tint: tmpGround,
      amt: gAmt,
      fieldTint: tmpField.copy(ca.gField).lerp(cb.gField, k),
      fieldAmt: lerp(a.ground.fieldAmt, b.ground.fieldAmt, k),
      crownTint: tmpCrown.copy(ca.gCrown).lerp(cb.gCrown, k),
      crownAmt: lerp(a.ground.crownAmt, b.ground.crownAmt, k),
      snow: lerp(a.ground.snow, b.ground.snow, k),
    });
    // 远处的农田环(540~2360 m)与稀疏行道树:与近处地面同一套季节色
    farmland?.setSeason?.({ tint: tmpField, amt: lerp(a.ground.fieldAmt, b.ground.fieldAmt, k) });
    vegetation?.setSeason?.({ tint: tmpCrown, amt: lerp(a.ground.crownAmt, b.ground.crownAmt, k) });

    /* ── 粒子 ────────────────────────────────────────────────
     * 形态之间逐参数插值而不是硬切:雨渐渐变慢变圆就成了雪,
     * 交界处不会"一帧之间换了一种天气"。 */
    particles?.setSeason?.({ from: a.particles, to: b.particles, blend: k });
    warSmoke?.setWar?.(war);
    /* 建筑积雪与地面积雪同一个时钟,但**不共用同一个量**:
     * 地面的 0.78 是"覆盖率上限",屋面是按朝向逐片元算的,给满即可。
     * 战乱的火会把屋面的雪化掉一部分 —— 乘 (1 − 0.6·w)。 */
    buildingSnow?.setSnow?.(lerp(a.ground.snow, b.ground.snow, k) / 0.78 * (1 - 0.6 * w));
  }

  return {
    /** 由 cameraRig 每帧喂入累积圈数(float,单调递增;非巡航时保持不变 ⇒ 季节冻结) */
    setTurns(v) { turns = v; },
    /** 底栏季节键 / 深链接:传四季之一冻结,传 null 或 'auto' 回到随巡航轮换 */
    setManual(key) { manual = SEASON_KEYS.includes(key) ? key : null; },
    get manual() { return manual; },
    apply,
    get turns() { return turns; },
    get frozen() { return !!manual; },
    /** 当前季节读数,供调试与 HUD */
    get current() {
      return {
        from: fromKey, to: toKey, blend, war,
        label: blend < 0.5 ? SEASON_LABELS[fromKey] : SEASON_LABELS[toKey],
      };
    },
    get war() { return war; },
    /** 巡航昼夜 0..1(0 昼 → 1 夜);null 表示该由昼夜按钮说了算 */
    get night() { return night; },
    /** 调试:手动推进一季(不改变冻结态) */
    advance(n = 1) { turns += n * TURNS_PER_SEASON; },
  };
}
