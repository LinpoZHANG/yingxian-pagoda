/**
 * scene/seasons/SeasonConfig.js —— 巡航四季:四季调色板(唯一真值源)
 * ═════════════════════════════════════════════════════════════
 * ★ 模块边界(重要)
 *   本目录 scene/seasons/ 是**巡航四季模块**,与木塔本体的建模/材质
 *   完全脱钩:
 *     · 不 import 任何 assembly/* 或 components/*;
 *     · 需要改塔身表现时(三期积雪),走「运行时捕获基准 + 相对调制」,
 *       即启动时读取材质当下的颜色作基准,季节只在其上乘一个系数 ——
 *       另一会话继续重调 materials/wood.js 不会与本模块冲突,
 *       也不需要本模块跟着改数;
 *     · 不创建时(?seasons=0)整个场景行为与接入前逐字节一致。
 *
 * ★ 与昼夜的关系
 *   昼夜是**另一个模块**,不参与四季。本表只描述**昼态**;
 *   夜态仍是各模块里原有的那一套,最终色 = lerp(季节昼色, 原夜色, dayNightT)。
 *   但季节的**结构性存在**(积雪、粒子、云量)与昼夜无关 ——
 *   冬夜照样有雪,只是被月光照。
 *
 * ★ 秋 = 基准
 *   整套环境是按晋北秋季调出来的。autumn 这一列**逐值等于接入前的现状**,
 *   一个数都没动;另外三季只需描述「相对秋偏多少」。
 *   这样既保住已有的调校,也让四季之间可比。
 *   改秋季 = 改全局基调,请谨慎;改其余三季只影响那一季。
 */

import { Vector3 } from 'three';
import { SKY_BASE } from '../sky.js';
import { FOG_DENSITY } from '../ground.js';
import { DAY } from '../lighting.js';
import { SCRUB_BASE } from '../environment/createMountainTerrain.js';
import { getEnvironmentPreset } from '../environment/EnvironmentConfig.js';

/**
 * ★ 秋这一列是「引」出来的,不是「抄」出来的。
 * 上一轮实测到:把日仰角手抄成 18.3(真值 18.326801)会让太阳偏 0.027°,
 * 阴影边缘挪动、`?seasons=0` 与 `?season=autumn` 差出 145 个像素。
 * 「秋 = 现状」是这个模块的地基,靠人手保持同步迟早会再错一次 ——
 * 所以基准值一律从各模块的导出常量取,同步由 import 保证。
 */
const BASE = getEnvironmentPreset('day');
const AUTUMN_SUN_ELEV = (Math.asin(
  DAY.sunDir.y / Math.hypot(DAY.sunDir.x, DAY.sunDir.y, DAY.sunDir.z),
) * 180) / Math.PI;

/**
 * 一个季节占几圈。0.5 = 半圈一季(一圈 30 s ⇒ 一季 15 s、一年 2 圈 60 s)。
 * 交界落在方位 0° 与 180°,仍然确定。改这一个数就能变回一圈一季或两圈一季。
 *
 * ★ **改它就要回头看 `interaction/cameraRig.js:CRUISE.climbTurns`。**
 *   相机高度是周期 `2×climbTurns` 圈的 ping-pong,与这里的年长(`4×本值` 圈)
 *   会拍频:两者同拍时,每年开春相机都停在同一个高度,四季就永远配同一段立面。
 *   climbTurns 当初取 3 正是为了躲开「一年 4 圈」;本值改成 0.5 之后那条约束
 *   失效了,而相机那边隔了很久才跟上(第65轮),中间一直白慢着。
 *   耦合写在两边,才不会只改一边。
 */
export const TURNS_PER_SEASON = 0.5;

/**
 * 季节交界的过渡窗口。圈内进度到此值才开始过渡,之前是纯季节。
 * 0.75  ⇒ 后 25%(7.5 s / 90°)—— 太长;
 * 0.875 ⇒ 后 12.5%(3.75 s / 45°)—— 仍太长,用户反映「秋到冬雪都下满了火还没灭」;
 * 0.94  ⇒ 后 6%,一圈一季时是 1.8 s;
 * 改为**半圈一季**后一季只有 15 s,0.94 会压到 0.9 s(读作硬切),
 * 故放到 0.88 —— 后 12% × 15 s = **1.8 s**,与上一版的手感一致。
 * 这个常量是「季内比例」,季长一变就要重算它对应的秒数。
 * 过渡越短,交界处越需要各通道**同时**动作(见 WAR_RAMP 的 end)。
 */
export const BLEND_START = 0.88;

/**
 * 战乱在秋这一圈里的斜坡(按圈内进度 f)。
 * ★ 前 35% 必须是 war = 0 —— 那一段逐值等于太平的晋北秋色,
 *   `?seasons=0` 与 `?season=autumn` 逐像素相等这条地基就架在这里。
 * 80% 之后满城烽烟,随即并入冬:雪落下来把火盖住,是天然的收束。
 */
/**
 * 战乱在秋这一圈里的斜坡(按圈内进度 f)。
 * ★ start 必须是 0:用户要「四季交替连续、不应有 gap」——
 *   夏的花瓣在圈末淡出,秋一开始火就要起来,中间不能空着。
 *   旧值 0.35 意味着入秋后有约 10 秒既没有花也没有火。
 * ★ end 让火在**秋结束之前**熄灭,而不是拖进冬天:
 *   旧写法是「入冬后 35% 内熄」,于是雪都下满了火还在烧,
 *   两季读作糊在一起。现在秋的最后 6%(≈1.8 s)火迅速收掉,
 *   交接点上是「雪起、火灭」同时发生,而不是重叠十秒。
 */
export const WAR_RAMP = {
  start: 0.0, full: 0.42, end: 0.88,
  /* ★ pre:夏→秋的过渡窗口里火已经烧到的程度。
   * 秋这一圈的斜坡**必须从 pre 起步**,不能从 0 起步 ——
   * 否则交界那一帧 war 从 pre 掉回 0,烟与火整组 visible 翻假再翻真,
   * 画面上就是「退回去然后重新加载一遍」(用户实测于夏→秋)。 */
  pre: 0.35,
};

/**
 * 战乱的**大气叠加层**。
 * 只有烟柱是不够的 —— 实测出图后读作「几根烟囱」,而参考实景里战乱是
 * **整个大气都变了**:暗橙褐的天、压暗转红的日光、浓得看不见远山的烟霾。
 * 这些值不是第五季,而是乘/插在当季结果之上的一层修正 ——
 * 所以秋的调色板仍然是那份基准,war = 0 时这一层整体消失。
 */
export const WAR = {
  fogColor: '#8a6a4e',      // 烟霾:暖褐,吃掉远山
  fogDensityMul: 2.3,       // 能见度骤降
  skyZenith: [0.40, 0.29, 0.20],
  skyHorizon: [0.72, 0.50, 0.33],
  cloudCover: 0.86,
  cloudTint: [1.10, 0.82, 0.62],
  sunColor: '#ff8b4a',      // 透过烟的日头
  sunMul: 0.52,             // 直射被烟挡掉一半
  hemiMul: 0.74,
  hemiSky: '#8a6f5c',       // 天光也被染成烟色,阴影不再是冷的
  ambient: '#8b6f58',
  groundTint: '#6f5a45',    // 焦土
  groundAmt: 0.34,
  ridgeHaze: '#8a7660',
  mist: '#9c8065',
  glow: '#c98d55',
  /** 叠加强度:war=1 时各项按这个比例混入,不是全量替换 —— 全量会读成"另一个场景" */
  weight: 0.82,
};

/**
 * 巡航时的昼夜:每一季里白天占 3/4、夜占 1/4(用户裁定)。
 * 用**季内进度 f** 而不是另起一个时钟 —— 昼夜与季节因此永远同相位,
 * 换季不会撞上半截黄昏。一季 15 s ⇒ 昼约 11.5 s、夜约 3.5 s。
 * 黄昏与黎明各留一段 smoothstep,否则天色会硬切。
 */
export const NIGHT_WINDOW = { duskStart: 0.72, duskEnd: 0.80, dawnStart: 0.94, dawnEnd: 1.0 };
/* 黎明窗口原为 0.96→1.0,只有 0.6 s(18 帧),单帧跳 0.083 —— 是季节色速率的 3 倍,
 * 读作「一下子天亮」。放到 0.94 ⇒ 0.9 s、单帧 0.055,与黄昏(1.2 s)同一量级。 */

export const SEASON_KEYS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_LABELS = {
  spring: '春', summer: '夏', autumn: '秋', winter: '冬',
};

/**
 * 底栏季节键的循环序列。
 * 'auto' 排在四季之后:点满一圈能回到「随巡航自动轮换」,
 * 不必靠切换模式才退得出手动态 —— 底栏其余功能键也都是「点一下换一个」。
 * 标签与提示放在这里而不是 data/narrative.js:季节的数据归季节模块,
 * 且那个文件由另一个会话维护,不去挤它。
 */
export const SEASON_CYCLE = ['auto', 'spring', 'summer', 'autumn', 'winter'];
export const SEASON_UI = {
  auto: { label: '四季轮回', hint: '随巡航自动轮换:半圈一季' },
  spring: { label: '春', hint: '晋北早春:细雨、残雪、地面解冻' },
  summer: { label: '夏', hint: '盛夏:天最蓝、山最绿、杏花疏影' },
  autumn: { label: '秋', hint: '秋:晋北秋色与战乱烽火' },
  winter: { label: '冬', hint: '冬:飘雪与覆雪,远山薄雪' },
};


/**
 * 太阳方位锁死、只放仰角。
 * 现状 sunDir(-0.78, 0.32, 0.57):水平分量长 0.966,仰角 atan(0.32/0.966) = 18.3°。
 * 这个方位(画面左侧低角度)是檐口/斗拱/瓦垄层次的来源,四季一律不动;
 * 夏季仰角封顶 28° —— 真实天文该到 60°,但那会把掠射拍平、层次立刻塌掉。
 * 牺牲天文正确,保住已验证的画面语言。
 */
const SUN_AZ = new Vector3(DAY.sunDir.x, 0, DAY.sunDir.z).normalize();
export function sunDirFromElevation(deg) {
  const el = (deg * Math.PI) / 180;
  return new Vector3(
    SUN_AZ.x * Math.cos(el), Math.sin(el), SUN_AZ.z * Math.cos(el),
  ).normalize();
}

/**
 * 四季表。
 * fog.color 是**同源色**:同时写入 scene.fog.color 与 sky 的地平线收敛色。
 * 这两处必须永远相等,否则天—地接缝会重新出现(见 sky.js 的收敛带注释)。
 * horizon 的 ridgeHaze / mist 是**故意不同**的另外两个色,不要跟着同源。
 */
export const SEASONS = {
  /* ── 春:晋北早春。空气清冷、雾带轻薄、峰顶残雪、地面开始解冻 ── */
  spring: {
    /* 参考实景:春天几乎是一片**白天**,不是"淡蓝天" ——
     * 天顶只余一点点蓝,近地平是奶白,整体高明度低对比。
     * 上一版 (0.36,0.52,0.74) 还是太蓝了。 */
    sky: {
      zenith: [0.50, 0.60, 0.74],
      horizon: [0.90, 0.90, 0.89],
      cloudLo: 0.42, cloudHi: 0.80,    // 下阈压低、上阈抬高 ⇒ 云摊得开而淡,读作高层薄云
      cloudCover: 0.58,
      cloudTint: [1.00, 1.00, 1.02],
    },
    fog: { color: '#c6c2b4', density: 0.00092 },   // 春雨天的湿雾,四季里最浓   // 浓于秋:近处城坊化在雾里
    light: {
      sunElevDeg: 20, sunColor: '#ffe2c2', sunIntensity: 2.30,
      hemiSky: '#c0d2e0', hemiGround: '#c2bda6', hemiIntensity: 2.00,
      ambient: '#c2ccd4', ambientIntensity: 0.76,
    },
    /** 春雨:细密、快、几乎不飘 */
    particles: 'rain',
    /* ── 地面(二期)──────────────────────────────────────────
     * 参考实景:早春的平畴是**大片绿**(冬麦返青),一直铺到地平线。
     * 但要压住饱和度 —— 上一轮刚定下的「褪色旧照」基调不能被一片鲜绿掀翻,
     * 所以取灰绿而不是嫩绿,混合量也只给 0.42~0.55。
     * tint 只按 aFarm 加权染农田,城坊踩实地与寺院夯土院不跟着变绿。 */
    ground: {
      tint: '#9fae86', amt: 0.42,
      fieldTint: '#93a67e', fieldAmt: 0.50,
      crownTint: '#8aa06a', crownAmt: 0.55,
      snow: 0,
    },
    /* ★ 山的季相靠**颜色**,不靠把它藏进雾里(我们的远山建模比参考视频实,
     *   藏掉是浪费)。早春:刚解冻,土湿而暗、岩面偏冷灰,灌丛还没发 ⇒ 斑最少。 */
    horizon: {
      ridgeHaze: '#a9b0b4', mist: '#c2c0b6', glow: '#e9e4d6',
      rockLit: '#a2a092', rockShadow: '#5e5b53',   // 岩带保持偏灰,土色交给黄土带
      loessLit: '#c6ad80', loessShadow: '#7c6c58',
      scrub: '#6a6650', scrubAmt: 0.24, bloom: '#e6d4dd', bloomAmt: 0.1,
      // 雪线取 620 m:实测可见山体高程中位数 209 m、95 分位 435 m,
      // 620 m 之上只剩最高的几处峰顶 ⇒ 读作「残雪」而非「雪山」。
      snowLine: 620, snowAmt: 0.55,
    },
  },

  /* ── 夏:偏暖蓝、阳光清晰、檐下阴影浓重 ──
   * ⚠ 「阴影浓重」靠**日光/天光比值**做,不靠压天光:
   *    夏 2.85/1.85 = 1.54,秋 2.45/1.95 = 1.26。
   *    lighting.js 的既有结论是「檐下天光给不足,斗拱层会糊成一团黑」,
   *    压 hemi 就会踩到它。
   * ⚠ 「空气通透度提高」守 0.00052 的密度下限:通透但不清澈,
   *    不破上一轮定下的「褪色旧照」基调。 */
  summer: {
    /* 参考实景:夏是四张里**最蓝**的一张,而且云不多、空气最通透 ——
     * 上一版给了 cloudCover 0.75(比秋还多云),与参考相反,压到 0.48。 */
    sky: {
      zenith: [0.24, 0.46, 0.80],
      horizon: [0.86, 0.87, 0.86],
      cloudLo: 0.50, cloudHi: 0.74,   // 下阈抬高 ⇒ 云少而边界清楚
      cloudCover: 0.48,
      cloudTint: [1.02, 1.01, 0.99],
    },
    fog: { color: '#ccc4ab', density: 0.00044 },   // 盛夏最通透   // 通透但不清澈:守住 0.00052 下限
    light: {
      sunElevDeg: 28, sunColor: '#fff0d0', sunIntensity: 2.85,
      hemiSky: '#b6cadc', hemiGround: '#c6bd96', hemiIntensity: 1.85,
      ambient: '#bcc6cf', ambientIntensity: 0.70,
    },
    /** 夏·杏花疏影:粉白花瓣,慢而翻飞,数量最少 —— 「疏影」是数量的约束,不是形容词 */
    particles: 'petal',
    /* ── 地面(二期)──────────────────────────────────────────
     * ★ 参考纠正了我一处地理错误:**晋北盛夏的平畴是锈金褐,不是绿。**
     * 半干旱区的旱地作物盛夏就是这个色,我原来按江南写的「灰绿饱满一档」是错的。
     * 树冠反而是四季里最绿的 —— 树有根、够得着水,庄稼地够不着。 */
    ground: {
      tint: '#b08a55', amt: 0.38,
      fieldTint: '#b08a4e', fieldAmt: 0.42,
      crownTint: '#48603c', crownAmt: 0.60,
      snow: 0,
    },
    /* 夏:植被最盛,山明显**转绿** —— 但晋北的绿是灰绿/黄绿,不是江南的饱和绿。
     * 主力是 scrubAmt(0.34 → 0.52),岩土两带只跟着偏一点。 */
    horizon: {
      ridgeHaze: '#a6ada9', mist: '#c8c1b0', glow: '#f2e8d2',
      rockLit: '#97ab79', rockShadow: '#516146',
      loessLit: '#acb76d', loessShadow: '#5a6845',
      scrub: '#40542f', scrubAmt: 0.58, bloom: '#e3b9c9', bloomAmt: 0.42,
      snowLine: 9999, snowAmt: 0,
    },
  },

  /* ── 秋:★ 基准列。逐值 = 接入四季之前的现状,不要顺手"优化" ── */
  autumn: {
    /* 这一列全部「引」自各模块的导出常量,没有一个手抄的数。
     * 于是别人调 sky.js / lighting.js / EnvironmentConfig 时,基准自动跟上。 */
    sky: { ...SKY_BASE },
    fog: { color: BASE.fogColor, density: FOG_DENSITY },
    light: {
      sunElevDeg: AUTUMN_SUN_ELEV,
      sunColor: `#${DAY.sunColor.getHexString()}`,
      sunIntensity: DAY.sunIntensity,
      hemiSky: `#${DAY.hemiSky.getHexString()}`,
      hemiGround: `#${DAY.hemiGround.getHexString()}`,
      hemiIntensity: DAY.hemiIntensity,
      ambient: `#${DAY.ambient.getHexString()}`,
      ambientIntensity: DAY.ambientIntensity,
    },
    /** 秋无弥漫粒子:战乱的烟是**定点升腾**,走 createWarSmoke,不是这一路 */
    particles: 'none',
    /* ── 地面(二期)──────────────────────────────────────────
     * 混合量全为 0 ⇒ 逐值恒等于各模块构造时的调色板。基准不抄,只归零。 */
    ground: {
      tint: '#ffffff', amt: 0,
      fieldTint: '#ffffff', fieldAmt: 0,
      crownTint: '#ffffff', crownAmt: 0,
      snow: 0,
    },
    horizon: {
      ridgeHaze: '#adb2b3', mist: '#c4bcae', glow: '#efe4cd',
      rockLit: BASE.rockLit, rockShadow: BASE.rockShadow,
      loessLit: BASE.loessLit, loessShadow: BASE.loessShadow,
      scrub: SCRUB_BASE.color, scrubAmt: SCRUB_BASE.amt,
      bloom: '#e8cfd6', bloomAmt: 0,
      snowLine: 9999, snowAmt: 0,
    },
  },

  /* ── 冬:冷灰蓝、雾色转冷、远山薄雪 ──
   * ⚠ 「木塔不能被白色环境吞没」:冬季**不降塔身明度**(见三期),
   *    并给地面积雪覆盖率设上限 —— 靠明度差而不是饱和度守住视觉中心。 */
  winter: {
    sky: {
      zenith: [0.46, 0.54, 0.66],      // 降饱和的冷灰蓝,比上一版再淡一档(参考是冷灰白)
      horizon: [0.87, 0.88, 0.90],     // 冷白
      cloudLo: 0.40, cloudHi: 0.74,
      cloudCover: 0.72,                // 低平灰云
      cloudTint: [0.97, 0.98, 1.02],
    },
    fog: { color: '#c4c6c9', density: 0.00072 },   // 冬:冷雾,比秋略浓
    light: {
      sunElevDeg: 14, sunColor: '#f6e6d4', sunIntensity: 2.15,
      hemiSky: '#c2d2e2',
      hemiGround: '#d8dade',           // 雪地反白:冬季天光的地面项要抬到近白
      hemiIntensity: 2.10,
      ambient: '#c4ccd6', ambientIntensity: 0.80,
    },
    /** 冬雪:柔和圆点,大小速度分层 */
    particles: 'snow',
    /* ── 地面(二期)──────────────────────────────────────────
     * 参考实景:雪几乎盖满,街巷屋顶一片白,塔是画面里唯一的暖色/暗色。
     * 积雪走 ground 的 snow 通道(全局 + 噪声斑驳),不走 tint ——
     * 雪不挑地方,农田城坊道路一起白;而 tint 是按 aFarm 加权的。
     * snow 给 0.78 而不是 1:留出踩实的路面与背风的土色,
     * 全白会把地面读成一张纸,也会让塔失去它唯一的对比来源。 */
    ground: {
      tint: '#ffffff', amt: 0,
      fieldTint: '#d6d9da', fieldAmt: 0.72,
      crownTint: '#6b6558', crownAmt: 0.55,
      snow: 0.78,
    },
    /* 冬:灌丛枯死 ⇒ 斑最少最灰;岩土两带整体去饱和、偏冷。 */
    horizon: {
      ridgeHaze: '#b0b6bc', mist: '#c6c8cb', glow: '#ecebe6',
      rockLit: '#91929b', rockShadow: '#464c57',
      loessLit: '#9c9384', loessShadow: '#55524d',
      scrub: '#4a4d4a', scrubAmt: 0.14, bloom: '#e8cfd6', bloomAmt: 0.0,
      /* 190 m + 弱扰动出图读作**满山雪**,与晋北的干冷少雪不符。
       * 抬到 290 m,并在着色器里加大扰动、收紧坡度遮罩、再乘一层斑块噪声,
       * 目标是可见山体七成见雪、三成露岩土。 */
      snowLine: 205, snowAmt: 0.97,
    },
  },
};
