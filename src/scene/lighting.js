/**
 * scene/lighting.js —— 灯光系统(昼/夜双状态)
 * ─────────────────────────────────────────────────────────────
 * 昼:太阳 DirectionalLight(暖白,阴影相机按 67m 尺度配置)
 *     + 天光 HemisphereLight + 低强度环境光
 * 夜:月光(冷蓝低强度)+ 檐下暖色点光(灯笼氛围)+ 地面反打微光
 * 状态插值由 states 驱动、在 loop.onTick 中缓动,禁止瞬切。
 */

import {
  DirectionalLight, HemisphereLight, AmbientLight, PointLight,
  Color, Vector3, Group,
} from 'three';
import { GLOBAL, VERTICAL } from '../data/pagodaParams.js';

const H = GLOBAL.totalHeight;

/** 昼夜两端的光照配置(t=0 昼 → t=1 夜),全部按 t 线性插值 */
/**
 * 昼:晋北秋日的**左侧低角度暖光 + 冷色天光**。
 * 方位取默认机位(overview az≈32°、se az≈40°)的**画面左侧**:
 *   视线 v = −(sinA, 0, cosA),画面左 = (−cosA, 0, sinA);A≈36° → (−0.81, ·, 0.59)。
 *   仰角 18°(y/√(x²+z²) = 0.33)—— 低日头才有长影与掠射,
 *   檐口、斗拱、瓦垄的层次全靠这道掠射拉开。
 * 暖冷分工:太阳给金,天光给青灰。两者拉开色温差,阴影才不是"变暗的亮部",
 * 而是**偏冷的另一种光** —— 这是历史氛围与"塑料感"的分界。
 * 2026-09-04:为「整体减淡 / 更模糊的历史感」压直射、抬天光与环境光
 * (2.95→2.45 / 1.52→1.95 / 0.52→0.74)。褪色感 = 高亮度 + 低对比 + 低饱和,
 * 三者缺一不可;只把颜色调亮而不压对比,只会变成「曝光过度」。
 */
export const DAY = {
  sunColor: new Color(0xffd6a6), sunIntensity: 2.45,
  sunDir: new Vector3(-0.78, 0.32, 0.57),
  // 檐下是全塔最深的影,天光与地面反光必须给足,否则斗拱层糊成一团黑
  hemiSky: new Color(0xbcd0de), hemiGround: new Color(0xc9b391), hemiIntensity: 1.95,
  ambient: new Color(0xc0c9d0), ambientIntensity: 0.74,
  lanternIntensity: 0.0,
};
const NIGHT = {
  /**
   * 月光。0.95 → 1.45(第59轮)→ **2.10**(第60轮)。
   *
   * 用户「看不清屋檐瓦面」。**瓦面只能靠上方的光** —— 任何位于屋面下方的光都照不到它:
   * 瓦面法线朝上外,地灯入射朝下内,`N·L = sin(坡角 − 俯角)`,而本塔坡角 28°、
   * 自 30 m 外看 30 m 高处俯角 42°(推导见 scene/nightInterior.js 文件头)。
   * 第59轮为此加过八盏地面射灯,第60轮按用户裁定去掉 —— 射灯只能补檐下,
   * 而檐下灯笼已经在做,那八盏是与既有光源重叠的一层补光,不值它的着色器代价。
   *
   * 所以「看不清瓦面」的正解就是**抬月光**。
   *
   * ★ 第60轮后用户仍说「月光还不够亮**针对塔身**」—— 这个限定要当真:
   *   **瓦面与塔身暗得不是同一个原因,因而不归同一盏灯管。**
   *     瓦面 是朝上的面,月光(高度角 51°)直给,`N·L ≈ 0.82`,抬月光立竿见影;
   *     塔身 是**竖直面**,`N·L ≤ 0.63`,且只有朝月的那几面拿得到;
   *          更要紧的是斗栱带整条**退在檐影里** —— 有向光根本进不去。
   *   故塔身靠的是**填充**:天光、环境光、以及檐下那 24 盏灯笼。
   *   只把主光往上推,推到 3.0 也只是让瓦面过曝,塔身照样不亮。
   *   本轮四个值一起动,见下。
   */
  sunColor: new Color(0x9fb6e0), sunIntensity: 3.20,
  sunDir: new Vector3(-0.42, 0.70, 0.38),
  /**
   * 天光与环境光:0.50 → 0.62(第60轮撤射灯后补背月侧)→ **0.95 / 0.52**(第61轮)。
   * 这两盏是**无向**的,不受檐影限制,是塔身唯一进得去的光 ——
   * 「月光不够亮针对塔身」的实际着力点在这里,不在主光。
   */
  hemiSky: new Color(0x2a3d5c), hemiGround: new Color(0x1c1710), hemiIntensity: 1.10,
  ambient: new Color(0x36436a), ambientIntensity: 0.58,
  /**
   * 檐下灯笼 11.0 → 17.0 → **30.0**,是「针对塔身」的**主要着力点**。
   *
   * 三盏候选里只有它是**只照塔、不照城**的:
   *   月光   有向,且塔身是竖直面又退在檐影里,推到 3.0 也只是让瓦面过曝;
   *   天光/环境光  无向,进得去檐影,但它们**同时照亮周围城郭与地面** ——
   *     抬到能把塔身提起来的量,整张图就成了黄昏,夜没有了;
   *   檐下灯笼  点光,作用半径 `eaveW × 0.85`(三层约 22 m),
   *     出了塔就衰减殆尽,城郭一点拿不到。
   * 「针对某个物体加亮」要先问哪一组光源的**作用域**与那个物体重合。
   */
  lanternIntensity: 30.0,
};

/**
 * 光照的唯一真值是上面的 DAY / NIGHT 两组常量,由 apply() 按 t 插值。
 * 曾经这里还收一个 preset 并用它初始化三盏灯 —— 但构造末尾的 apply()
 * 会把每一个值立刻覆盖回 DAY/NIGHT,所以 EnvironmentConfig 里那套
 * sunColor / hemi* / ambient* 从来没有生效过。已删,免得再有人去调它。
 */
export function createLighting(scene) {
  /**
   * 昼态的**运行时基准**。默认逐值 = DAY(即接四季之前的现状),
   * scene/seasons 每帧覆写它,再由 apply() 在其上做昼→夜插值。
   * DAY 本身保持只读,作为「秋季/无四季」的出厂值留在上面备查。
   */
  const dayNow = {
    sunColor: DAY.sunColor.clone(), sunIntensity: DAY.sunIntensity,
    sunDir: DAY.sunDir.clone(),
    hemiSky: DAY.hemiSky.clone(), hemiGround: DAY.hemiGround.clone(),
    hemiIntensity: DAY.hemiIntensity,
    ambient: DAY.ambient.clone(), ambientIntensity: DAY.ambientIntensity,
    lanternIntensity: DAY.lanternIntensity,
  };

  const sun = new DirectionalLight(DAY.sunColor, DAY.sunIntensity);
  sun.castShadow = true;
  const S = H * 0.8;
  /**
   * 阴影分辨率与斗拱尺度的账(第36轮实算):
   *   相机半宽 53.85 m 是**塔身包围球**定的,不能再收 —— 收了塔自己的影就缺角;
   *   2048 贴图 → 一个纹素 5.26 cm,而斗耳只有 4分 = 6.8 cm。
   *   再叠上 normalBias 3 cm(占斗耳的 44%)与 PCFSoft 的一格模糊,
   *   **木构层次的主要来源——构件间的自阴影——在数学上就画不出来**。
   * 4096 → 2.63 cm/纹素,normalBias 收到 1 cm(斗耳的 15%),接触影才立得住。
   * 代价:阴影贴图显存 16 MB → 67 MB,只在桌面端可接受;
   *   移动端由 core/renderer 的像素比上限一并降级(见该文件)。
   */
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S;   sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 1;  sun.shadow.camera.far = H * 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.010;
  sun.target.position.set(0, H * 0.35, 0);
  scene.add(sun, sun.target);

  const hemi = new HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemiIntensity);
  hemi.position.set(0, H, 0);
  const amb = new AmbientLight(DAY.ambient, DAY.ambientIntensity);
  scene.add(hemi, amb);

  const lanterns = new Group();
  lanterns.name = 'lanterns';
  const lampList = [];
  for (const e of VERTICAL.eaves) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const r = e.eaveW / 2 * 0.82;
      /**
       * 衰减 2.0 → 1.45、半径 ×0.55 → ×0.85(第61轮)。
       * 灯坐在檐下 0.9 m,取平方衰减时贴着灯的那片椽底是 6 m 外斗栱带的 44 倍 ——
       * 抬强度只会先把灯下那一小片烧白,塔身仍旧不亮。
       * 压平到 1.45 后这个比降到 11,再把半径放远,光才铺得到整条塔身。
       */
      const p = new PointLight(0xffb865, 0, e.eaveW * 0.85, 1.45);
      p.position.set(Math.sin(a) * r, e.eaveY - 0.9, Math.cos(a) * r);
      lanterns.add(p);
      lampList.push(p);
    }
  }
  scene.add(lanterns);

  let t = 0, target = 0;
  const c = new Color();

  /**
   * 构造读图态的光照(第35轮)。
   * 交付态为「褪色的历史感」压了直射、抬了天光与环境光(2.95→2.45 / 1.52→1.95 / 0.52→0.74);
   * 低对比对氛围是对的,对判读是致命的 —— 没有明确的受光面/背光面,
   * 斗与栱就只剩一个轮廓。读图态把这三个数反着调回去:**强直射 + 压填充**。
   * 天光不敢压到底:檐下是全塔最深的影,压过头斗拱会糊成一团黑,
   * 那和糊成一团亮是同一种失败。
   */
  const STUDY = { sun: 3.30, hemi: 1.00, amb: 0.40 };
  let study = false;

  function apply() {
    const lerp = (a, b) => a + (b - a) * t;
    sun.intensity = lerp(dayNow.sunIntensity, NIGHT.sunIntensity);
    sun.color.copy(c.copy(dayNow.sunColor).lerp(NIGHT.sunColor, t));
    const d = dayNow.sunDir.clone().lerp(NIGHT.sunDir, t).normalize();
    sun.position.copy(d).multiplyScalar(H * 1.6).add(sun.target.position);
    hemi.intensity = lerp(dayNow.hemiIntensity, NIGHT.hemiIntensity);
    hemi.color.copy(c.copy(dayNow.hemiSky).lerp(NIGHT.hemiSky, t));
    hemi.groundColor.copy(c.copy(dayNow.hemiGround).lerp(NIGHT.hemiGround, t));
    amb.intensity = lerp(dayNow.ambientIntensity, NIGHT.ambientIntensity);
    amb.color.copy(c.copy(dayNow.ambient).lerp(NIGHT.ambient, t));
    const li = lerp(dayNow.lanternIntensity, NIGHT.lanternIntensity);
    for (const p of lampList) p.intensity = li;
    // 读图态最后覆写强度(方向/色温仍随昼夜与季节走,免得两套逻辑各说各话)
    if (study) {
      sun.intensity = STUDY.sun;
      hemi.intensity = STUDY.hemi;
      amb.intensity = STUDY.amb;
    }
  }

  apply();

  return {
    /** @param {'day'|'night'} mode @param {{instant?:boolean}} opt */
    setMode(mode, { instant = false } = {}) {
      target = mode === 'night' ? 1 : 0;
      if (instant) { t = target; apply(); }
    },
    /** 0..1,昼 → 夜 */
    get value() { return t; },
    /**
     * 直接给定昼夜值(巡航的自动昼夜用)。
     * 不动 target —— 一旦外部停止驱动,tick() 会从当前 t 缓动回按钮设定的那一端,
     * 交接处不会跳。
     */
    setValue(v) {
      const n = Math.max(0, Math.min(1, v));
      if (Math.abs(n - t) < 1e-5) return;
      t = n; apply();
    },
    /** 构造读图态:强直射 + 压填充,让每个面拿到不同明度 */
    setStudy(on) { study = !!on; apply(); },
    /** 供调参:读图态的三个强度 */
    get studyLevels() { return STUDY; },
    /**
     * 供 scene/seasons 写入昼态光照。不调用时保持 DAY 常量(= 秋季基准)。
     * ★ 必须自己调 apply():tick() 在昼夜插值收敛后会提前 return,
     *   光靠它是推不出季节变化的 —— 这是「参数写了却没进管线」的老陷阱。
     * hemi/ambient 走 from/to + blend 而不是外部先算好色,是为了省掉
     * 调用方的临时 Color(每帧一次分配,昼夜那条路径已经证明可以零分配)。
     */
    setSeasonDay(p = {}) {
      if (p.sunDir) dayNow.sunDir.copy(p.sunDir).normalize();
      if (p.sunColor) dayNow.sunColor.copy(p.sunColor);
      if (p.sunIntensity != null) dayNow.sunIntensity = p.sunIntensity;
      if (p.hemiIntensity != null) dayNow.hemiIntensity = p.hemiIntensity;
      if (p.ambientIntensity != null) dayNow.ambientIntensity = p.ambientIntensity;
      const k = p.blend ?? 0;
      if (p.hemiSky) dayNow.hemiSky.copy(p.hemiSky).lerp(p.hemiSkyTo ?? p.hemiSky, k);
      if (p.hemiGround) dayNow.hemiGround.copy(p.hemiGround).lerp(p.hemiGroundTo ?? p.hemiGround, k);
      if (p.ambient) dayNow.ambient.copy(p.ambient).lerp(p.ambientTo ?? p.ambient, k);
      apply();
    },
    sun,
    tick(dt) {
      if (Math.abs(target - t) < 1e-4) { t = target; return false; }
      t += (target - t) * Math.min(1, dt * 1.8);
      apply();
      return true;
    },
    dispose() {
      scene.remove(sun, hemi, amb, lanterns);
      sun.dispose?.();
      hemi.dispose?.();
      amb.dispose?.();
      for (const p of lampList) p.dispose?.();
    },
  };
}
