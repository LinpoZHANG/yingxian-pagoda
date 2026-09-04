/**
 * scene/nightInterior.js —— 夜景内透(室内灯)
 * ─────────────────────────────────────────────────────────────
 * 夜景此前只有 `lighting.js` 的二十四盏**檐下**点光,坐在
 * `eaveW/2 × 0.82` 的半径上 —— 全在塔身**外面**,照的是檐口与瓦面。
 * 于是入夜后塔身是一具从外面打亮的壳子:五个明层的佛堂漆黑,
 * 满立面的格扇读成一片黑格子,而那本该是夜里这座塔最好看的地方。
 *
 * 这里给每个明层的**内槽**放一盏灯,做出内透:透过格眼看见被照亮的
 * 内槽柱、内槽铺作与佛像,棂条自身逆光成剪影。
 *
 * ═══ 为什么不用开阴影就不漏光 ═══
 *
 * 直觉上「室内点光会把外墙也照亮」,实际不会 —— **朗伯项自己会挡**:
 *   外墙外皮的法线朝外,室内灯的入射方向 L 朝内,`N·L < 0`,该面拿到 0。
 * 所以外墙外皮、棂条外侧、瓦面一律不受这盏灯影响,只有**朝内的面**受光,
 * 而朝内的面正是透过格眼能看见的那些。
 *
 * 同理它也不会串层:
 *   楼板上表面法线朝上,下层的灯在它**下方** → `N·L < 0`,上层地面不受下层灯照;
 *   楼板下表面法线朝下,本层的灯在它下方 → 受光,那正是本层的天花板。
 *
 * 点光源的立方体阴影贴图要渲六个面,五盏就是三十次 —— 在 145 万三角形上
 * 完全不可接受。靠法线方向拿到同样的结果,是这套做法唯一能成立的理由。
 *
 * ═══ 与古今面貌的关系 ═══
 *
 * 这盏灯不分年代,但**看见的结果分**:今貌满立面连续格扇,一整圈都透光;
 * 古貌次间是夹泥墙、斜向四面当心间封死,只有四正向那几扇小窗漏出光来。
 * 「由封闭转为玲珑通透」这句话,在夜里比白天更容易读出来。
 */

import { PointLight } from 'three';

/**
 * [估/表现] 佛堂灯的参数。
 *
 * 色温比檐下灯笼(0xffb865)更暖更红 —— 檐下挂的是灯笼(纸罩透光),
 * 堂内点的是佛前油灯与烛,火色更沉。
 */
const INTERIOR_LAMP = {
  color: 0xff9a48,
  /**
   * [估] 灯位高度 / 明层柱高。取 0.45:约当佛坛上方、供桌灯烛的位置。
   * 太低则只照亮地面、格眼里看不见东西;太高会把内槽铺作照得过亮,
   * 抢了佛像的主体。
   */
  heightRatio: 0.45,
  /**
   * [估] 有效半径 / 该层角柱半径。
   * 1.55 让光刚好越过外槽柱、照到外墙与格扇的**内表面**(内透的着落点),
   * 又在平座勾阑那一圈之前衰减掉 —— 檐下与栏杆是檐下灯笼的活,
   * 两套光源各管一段,叠在一起会把夜景照成白昼。
   */
  reachRatio: 2.0,
  /**
   * [估/表现] 衰减指数。**不取物理的 2.0**。
   *
   * 一盏点光取平方衰减,内槽柱(6 m)与外槽墙(11 m)差 3.4 倍 ——
   * 出图就是「当心间一团死白、次间格扇几乎全黑」。而实际的佛堂里点的
   * 不是一盏灯:佛前、龛侧、四壁各有灯烛,合起来的照度分布远比单点平缓。
   * 与其铺二十盏点光把着色器撑爆(每个材质的着色器都要遍历全部灯),
   * 不如用一盏灯 + 平缓的衰减去**近似那一片灯**。
   *
   * 1.4 配合放大的 reachRatio 曾把内外比压到 2.5 倍;第62轮再压到 **1.05**,
   * 内外比 1.8 倍 —— 内槽仍更亮,而外圈那一圈格扇拿得到足够的光,
   * 内透才是「一整圈都透」而不是「当心间一个亮点」。
   */
  decay: 1.05,
  /**
   * [估] 夜间强度。随衰减指数一起重定 ——
   * 指数变了,同一个强度值的含义就完全不同,两者必须成对调。
   *
   * ★ 第62轮「增加室内灯源的亮度」时,**不能只抬 intensity**。出图实测:
   *     当心间内透  L 0.400,最亮处 R 已到 **254(削顶)**
   *     次间格扇    L 0.133  ← 比被灯笼照亮的柱枋(0.194)**还暗**
   *   整体加强度只会把已经削顶的中心烧得更穿,而外圈那一圈格扇仍旧不亮。
   *   病在**分布**不在总量:衰减 1.4 时 6 m 与 11 m 差 2.5 倍。
   *   压到 1.05 后差 1.8 倍,外圈的相对增益大于中心 ——
   *   再配合提强度,格扇才追得上灯笼照出来的木构。
   *
   * ★ 强度 12 → 13 那一步**几乎无效**,实测整塔中位只从 0.1588 动到 0.1608。
   *   原因是这盏灯在那些表面上只占总照度的约四分之一(其余是檐下灯笼、天光、环境光),
   *   把它翻倍只让总量 +25%,经 ACES 压缩后剩下几个百分点。
   *   **给一个只占小份额的分量加倍,看不出变化** —— 要动就得动到它足以主导:
   *   40 时内槽拿到 6.25,而檐下灯笼在同一处只有约 2.2,堂内的光才真正说了算。
   */
  intensity: 40.0,
  /**
   * [估] 首层另算:首层是砖墙 + 板门,几乎不透光,灯只为让门缝与
   * 门上余壁透出一点暖意,给足了反而糊。
   */
  groundFloorScale: 0.55,
};

/**
 * [估/表现] 格扇的夜间自发光。
 *
 * 单靠室内灯,格眼里看见的是被照亮的内槽 —— 那是对的,但**棂条本身**
 * 逆光全黑,远景里一扇格扇就退成一块黑斑,「满立面透光」读不出来。
 * 实际上棂条是薄木条,背后有光时边缘会透出一层暖晕(纸窗更明显)。
 * 给它一点自发光去补这一层,幅度压得很小 —— 大了就成了贴纸。
 */
const LATTICE_GLOW = {
  color: 0xff8a3c,
  /**
   * 夜间的 emissiveIntensity 上限;昼态恒为 0。
   *
   * 0.34 → **0.50**(第62轮)。这一项与距离无关,是**直接抬棂条本身**的唯一手段 ——
   * 室内灯照的是格眼里看见的内槽,而棂条逆光,亮不亮全靠这一项。
   * 檐下灯笼抬到 30 之后,木构整体上来了,棂条若不跟着抬,
   * 格扇就从「透光的窗」退回「木格子」。
   */
  intensity: 0.62,
};

/**
 * ═══ 为什么这里没有地面射灯 ═══
 *
 * 第59轮试过在月台外一圈布八盏上照射灯,第60轮按用户裁定去掉了 —— 记档留住理由,
 * 免得下次再走一遍:
 *
 * **地面射灯照不亮瓦面。** 与内透那条是同一个朗伯项,只是方向反过来:
 * 瓦面法线朝上外,地灯入射朝下内。设屋面坡角 θ、射灯俯角 φ,则 `N·L = sin(θ − φ)`,
 * 只有 θ > φ 才受光。本塔屋面坡角约 28°,而自 30 m 外的地面看 30 m 高处俯角已有 42°。
 * 往外挪俯角虽小但距离更远、照度掉得更快;往里挪就被副阶檐(滴水线 18.2 m)挡住。
 * 两头都堵死。
 *
 * 射灯能做的只是檐下与檐口(朝下、朝外的面),而那一带**檐下灯笼已经在做**。
 * 于是它付出八盏灯的着色器代价,换来的是与既有光源重叠的一层补光 —— 不划算。
 *
 * **瓦面只能靠上方的光**,也就是月光(`lighting.js:NIGHT.sunIntensity`)。
 * 「看不清屋檐瓦面」的正解是抬月光,不是加射灯。
 */

/**
 * @param {object} o
 *   pagoda  buildPagoda() 的返回值(要 storeys[].plan 与 storeys[].group)
 * @returns {{ setNight(t:number):void, lamps:PointLight[], count:number, dispose():void }}
 */
export function createNightInterior({ pagoda }) {
  const lamps = [];

  for (const s of pagoda.storeys) {
    const p = s.plan;
    if (p.type !== 'ming') continue;

    const h = p.columnTop - p.baseY;
    const lamp = new PointLight(
      INTERIOR_LAMP.color,
      0,                                        // 由 setNight 驱动,昼态为 0
      p.cornerR * INTERIOR_LAMP.reachRatio,
      INTERIOR_LAMP.decay,
    );
    lamp.name = `interiorLamp_L${p.level}`;
    // 坐在塔轴上 —— 内槽是八角形的堂,灯在正中,四方受光才匀
    lamp.position.set(0, p.baseY + h * INTERIOR_LAMP.heightRatio, 0);
    lamp.castShadow = false;                    // 见文件头:靠法线方向挡,不靠阴影
    lamp.userData = { partKey: 'interiorLamp', level: p.level };

    /**
     * 挂在**本层 storey 组**之下,不挂场景根:
     * 结构分解时每一层带着自己那盏灯一起升起,拉开之后仍能看见各层堂内的光。
     * 挂到根上的话,分解一开,五盏灯会全留在原地、照进空气里。
     */
    s.group.add(lamp);

    lamps.push({
      light: lamp,
      base: INTERIOR_LAMP.intensity * (p.level === 1 ? INTERIOR_LAMP.groundFloorScale : 1),
    });
  }

  /**
   * 格扇的材质(去重)。
   *
   * 按 `partKey === 'window'` 认 —— 板门(`'door'`)与勾阑(`type:'balustrade'`)
   * 都不在其内:门是实木板不透光,勾阑在檐下不属窗。
   * 这几份材质由 facade 模块独占(今貌九种 MODERN_TRIMS、古貌一种 MUD_TRIM),
   * 只供格扇使用,故直接改它们的 emissive 不会牵连别处。
   */
  const latticeMats = new Set();
  const usedElsewhere = new Set();
  pagoda.root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const isWindow = o.userData?.partKey === 'window';
    for (const m of mats) {
      if (!m || !('emissive' in m)) continue;
      if (isWindow) latticeMats.add(m); else usedElsewhere.add(m);
    }
  });
  /**
   * ★ 只留**专供窗用**的材质。
   *
   * 格扇的材质本该是 facade 模块的独占克隆件(今貌 MODERN_TRIMS 九份、
   * 古貌 MUD_TRIM 一份),但那要等 `createFacadeHistory` 跑过才成立 ——
   * 在它之前,窗挂的还是全塔共享的 `WOOD.trim`,而那一份还供着板门与勾阑。
   * 不设这道守卫,一旦调用顺序换了,夜里会连门带栏杆一起发光。
   * 与其依赖「谁先谁后」,不如让这里自己查清楚:被别的构件用过的,一律不碰。
   */
  for (const m of usedElsewhere) latticeMats.delete(m);
  for (const m of latticeMats) {
    m.emissive.set(LATTICE_GLOW.color);
    m.emissiveIntensity = 0;                  // 昼态不发光
  }

  return {
    /** @param {number} t 0 = 昼,1 = 夜(取 lighting.value) */
    setNight(t) {
      for (const { light, base } of lamps) light.intensity = base * t;
      const e = LATTICE_GLOW.intensity * t;
      for (const m of latticeMats) m.emissiveIntensity = e;
    },
    /** 供自检:参与自发光的格扇材质数 */
    get latticeMaterialCount() { return latticeMats.size; },
    get lamps() { return lamps.map((x) => x.light); },
    get count() { return lamps.length; },
    dispose() {
      for (const { light } of lamps) {
        light.parent?.remove(light);
        light.dispose?.();
      }
      lamps.length = 0;
    },
  };
}
