/**
 * main.js —— 应用入口
 * ─────────────────────────────────────────────────────────────
 * 职责:
 *   1. 初始化 core/renderer(渲染器、相机、resize 监听)
 *   2. 构建场景:scene/*(灯光、天空、地面、雾)
 *   3. 调用 assembly/buildPagoda() 生成木塔并加入场景
 *   4. 初始化 interaction/*(巡航、自由视角控制器、状态机、拾取)
 *   5. 初始化 ui/*(HUD 挂载、面板绑定状态机)
 *   6. 启动 core/loop 渲染循环
 *
 * 原则:
 *   - main.js 只做「接线」,不含任何业务逻辑;
 *   - 所有尺寸单位 = 米(真实尺度,塔总高 67.31);
 *   - 初始化顺序:参数 → 几何 → 场景 → 交互 → UI。
 */

import {
  Vector3, Group, Plane, FrontSide, BackSide, DoubleSide, Mesh, InstancedMesh, MeshBasicMaterial,
  PointLight, Color,
} from 'three';
import { createRenderer, addDebugOutline } from './core/renderer.js';
import { startLoop, onTick } from './core/loop.js';
import { createEnvironmentSystem } from './scene/environment/EnvironmentSystem.js';
import { buildPagoda } from './assembly/buildPagoda.js';
import { createPagodaStatues } from './scene/statues/createPagodaStatues.js';
import { createExploder } from './assembly/explode.js';
import {
  DEFAULT_BUILD_PROGRESS, applyBuildState, rememberBuildState, restoreBuildState,
} from './assembly/buildTourLogic.js';
import { buildHeroBracket, createHeroExploder } from './components/bracket/heroCorner.js';
import { createControls } from './interaction/controls.js';
import { createStates, TRANSITION } from './interaction/states.js';
import { createCameraRig } from './interaction/cameraRig.js';
import { createPicking } from './interaction/picking.js';
import { createHUD } from './ui/hud.js';
import { createPanels } from './ui/panels.js';
import { createCameraTuner } from './ui/cameraTuner.js';
import { createSeasonSystem } from './scene/seasons/SeasonSystem.js';
import { SEASON_KEYS } from './scene/seasons/SeasonConfig.js';
import { createSeasonParticles } from './scene/seasons/createSeasonParticles.js';
import { createWarSmoke } from './scene/seasons/createWarSmoke.js';
import { createBuildingSnow } from './scene/seasons/createBuildingSnow.js';
import { TILE_ALL } from './materials/tile.js';
import { WOOD_ALL } from './materials/wood.js';
import { GLOBAL } from './data/pagodaParams.js';
import { createEdgeOverlay } from './scene/edgeOverlay.js';
import { setStudyMaterials } from './materials/studyMode.js';
import { applyBracketTones } from './materials/bracketTone.js';
import { createNightInterior } from './scene/nightInterior.js';
import { createFacadeHistory } from './facade/facadeHistory.js';
import { ERA_KEYS, ERA_DEFAULT } from './facade/facadeEras.js';

/**
 * 开发/截图与深链接参数:
 *   ?view=elev|finial|south|se|ne|close|top   预设机位
 *   &dist=…&y=…&el=…&fov=…  覆写距离(×总高)/ 目标高(×总高)/ 仰角(弧度)/ 视场角
 *   &mode=…&time=night  直接进入某场景状态
 *   &snap=1             取消过渡,一帧到位   &still=N  渲染 N 帧后停机
 *   &bare=1             隐藏 HUD(出净图,便于与测绘图并排比对)
 *   &fog=k              雾浓度乘以 k(fog=0 关雾;长焦远机位下雾会吃掉画面)
 *   &horizon=0          隐远山与霾带(净背景,供立面与测绘图叠合)
 *   &seasons=0          关巡航四季(场景恒为秋季基准 = 接四季之前的现状)
 *   &season=spring|summer|autumn|winter   冻结某一季(单独调某季时用)
 *   &war=0..1           冻结秋季时的烽烟强度(默认 1 = 烽火;基准态要显式写 &war=0)
 *   &era=ancient|modern 古今变化:立面落在夹泥墙(古貌)或木构(今貌),默认今貌
 */
/**
 * 着色器编译失败的**可见化**。
 * three.js 在着色器编译/链接失败时只 console.error,对象则静静地不绘制 ——
 * 于是画面上「某个东西不见了」,而没有任何报错、截图也照常产出。
 * 2026-09-04 因此吃过一次大亏:远山片元里一个局部变量取名 `patch`
 * (GLSL ES 3.0 保留字)导致整个远山着色器编译失败,山消失了两轮,
 * 期间一直在给一个没跑起来的着色器调雾和 Lambert。
 * 现在把这类错误挂到 window.__shaderErrors 与首屏提示上,离屏检查也能看见。
 */
{
  const origError = console.error.bind(console);
  window.__shaderErrors = [];
  console.error = (...args) => {
    const txt = args.map((v) => (typeof v === 'string' ? v : String(v))).join(' ');
    if (/Shader Error|ERROR: ?[0-9]+:[0-9]+|not compiled|VALIDATE_STATUS/i.test(txt)) {
      window.__shaderErrors.push(txt.slice(0, 600));
      document.title = `SHADER-ERROR(${window.__shaderErrors.length})`;
    }
    origError(...args);
  };
}

const q = new URLSearchParams(location.search);

/** ?snap=1:取消一切过渡,直接落到目标状态(开发期截图用,软件渲染跑不起长过渡) */
const SNAP = q.has('snap');
const TUNE = q.has('tune');
const dur = (d) => (SNAP ? 0.001 : d);

const loading = document.getElementById('loading');
const setLoading = (msg) => { if (loading) loading.textContent = msg ?? ''; };

// 生成期异常直接显示在首屏,避免「黑屏无线索」
window.addEventListener('error', (e) => {
  if (!loading) return;
  loading.style.display = 'grid';
  loading.textContent = `构建失败:${e.message}`;
  loading.setAttribute('data-error', e.message);
});

setLoading('正在生成几何……');

/* ── 1. 渲染器 ─────────────────────────────────────────────── */
const { renderer, camera, scene } = createRenderer(document.getElementById('app'),
  { preserveDrawingBuffer: q.has('still') });

/* ── 2. 场景 ───────────────────────────────────────────────── */
const environment = createEnvironmentSystem(scene, 'day');
const lighting = environment.lighting;
const ground = environment.ground;
const sky = environment.sky;
const sunDir = new Vector3();

/* ── 巡航四季 ───────────────────────────────────────────────
 * 独立模块 scene/seasons/,与木塔建模脱钩;不创建时场景 = 秋季基准(现状)。
 * 冻结规则:
 *   · ?seasons=0            → 完全不建,零开销、零改动;
 *   · ?season=xxx           → 冻结该季;
 *   · ?view=… 深链接静帧    → 默认冻结到**秋**。
 *     深链接是取景/截图通道,不巡航;若让它停在圈数 0(= 春),
 *     此前所有比对截图的基准就变了。秋 = 现状,截图才可比。
 */
const seasonFreeze = q.get('season')
  ?? (q.has('view') && !q.has('season') ? 'autumn' : null);
const seasonsOn = q.get('seasons') !== '0';
// 粒子与烽烟是季节模块自己的对象,关掉四季时连建都不建 —— 零几何、零 draw call
const seasonParticles = seasonsOn ? createSeasonParticles() : null;
const warSmoke = seasonsOn ? createWarSmoke() : null;
/* 建筑积雪:按世界法线朝上遮罩,在片元里混一层白。
 * 只作用于塔身 —— 城坊民宅已由 ground.setSeasonGround 的 prop 通道整体泛白。
 * 登记在几何建好之后做(见下),因为**材质族清单不够** ——
 * `scaleUV()` 返回的是 `material.clone()`,而 clone 不复制 onBeforeCompile,
 * 屋面用的正是这样一个克隆。必须遍历真正建出来的对象去登记。 */
const buildingSnow = seasonsOn ? createBuildingSnow() : null;
if (seasonParticles) scene.add(seasonParticles.object);
if (warSmoke) scene.add(warSmoke.group);
const seasons = !seasonsOn ? null : createSeasonSystem({
  sky,
  ground,
  horizon: environment.horizon,
  lighting,
  farmland: environment.farmland,
  vegetation: environment.vegetation,
  particles: seasonParticles,
  warSmoke,
  buildingSnow,
  freeze: SEASON_KEYS.includes(seasonFreeze) ? seasonFreeze : null,
  freezeWar: q.has('war') ? Number(q.get('war')) : null,
});

const STATUE_MASK_BLACK = new Color(0x000000);
const STATUE_MASK_BLACK_VEC = new Vector3(0, 0, 0);
const STATUE_ENV_MASK_ALPHA = 0.94;
const STATUE_SKY_MASK_ALPHA = 0.91;
const STATUE_FOG_MASK_ALPHA = 0.94;
const statueFocusTmpColor = new Color();
let statueEnvFocusOn = false;

function maskColorLike(value, base, alpha) {
  value.copy(base).lerp(STATUE_MASK_BLACK, alpha);
}

function maskUniformLike(value, base, alpha) {
  value.copy(base).lerp(value.isColor ? STATUE_MASK_BLACK : STATUE_MASK_BLACK_VEC, alpha);
}

function forEachMaterial(root, fn) {
  root?.traverse?.((obj) => {
    if (!obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => { if (mat) fn(mat); });
  });
}

function applyMaterialDim(root, enabled) {
  forEachMaterial(root, (mat) => {
    if (!mat.userData) mat.userData = {};
    if (!mat.userData.__statueEnvFocus) {
      mat.userData.__statueEnvFocus = {
        color: mat.color?.clone?.() ?? null,
        emissive: mat.emissive?.clone?.() ?? null,
      };
    }
    const base = mat.userData.__statueEnvFocus;
    if (enabled) {
      if (base.color && mat.color) maskColorLike(mat.color, base.color, STATUE_ENV_MASK_ALPHA);
      if (base.emissive && mat.emissive) maskColorLike(mat.emissive, base.emissive, STATUE_ENV_MASK_ALPHA);
    } else {
      if (base.color && mat.color) mat.color.copy(base.color);
      if (base.emissive && mat.emissive) mat.emissive.copy(base.emissive);
      delete mat.userData.__statueEnvFocus;
    }
  });
}

function applySkyDim(enabled) {
  const uniforms = sky?.mesh?.material?.uniforms;
  if (!uniforms) return;
  const keys = ['uFogDay', 'uZenith', 'uHorizon', 'uCloudTint'];
  const store = sky.mesh.material.userData ?? (sky.mesh.material.userData = {});
  if (!store.__statueEnvFocus) {
    store.__statueEnvFocus = Object.fromEntries(keys
      .filter((key) => uniforms[key]?.value?.clone)
      .map((key) => [key, uniforms[key].value.clone()]));
  }
  const base = store.__statueEnvFocus;
  for (const key of keys) {
    if (!base[key] || !uniforms[key]?.value?.copy) continue;
    if (enabled) maskUniformLike(uniforms[key].value, base[key], STATUE_SKY_MASK_ALPHA);
    else uniforms[key].value.copy(base[key]);
  }
  if (!enabled) delete store.__statueEnvFocus;
}

function applyStatueEnvironmentFocus(enabled) {
  if (enabled !== statueEnvFocusOn) {
    statueEnvFocusOn = enabled;
    applyMaterialDim(environment.root, enabled);
    applyMaterialDim(ground.group, enabled);
    applySkyDim(enabled);
  } else if (enabled) {
    applyMaterialDim(environment.root, true);
    applyMaterialDim(ground.group, true);
    applySkyDim(true);
  }
  if (!enabled) return;
  if (scene.background?.isColor) {
    statueFocusTmpColor.copy(scene.background).lerp(STATUE_MASK_BLACK, STATUE_FOG_MASK_ALPHA);
    scene.background.copy(statueFocusTmpColor);
  }
  if (scene.fog?.color) scene.fog.color.lerp(STATUE_MASK_BLACK, STATUE_FOG_MASK_ALPHA);
}

/* ── 3. 几何 ───────────────────────────────────────────────── */
const pagoda = buildPagoda();
scene.add(pagoda.root);
rememberBuildState(pagoda.root);

let buildTourProgress = DEFAULT_BUILD_PROGRESS;
let buildTourPlaying = false;
let buildTourActive = false;
let craftTourPlaying = false;
let craftTourProgress = 0;
let craftTourElapsed = 0;
const BUILD_TOUR_SPEED = 0.04;
const CRAFT_BUILD_DURATION = 40;
const CRAFT_RISE_DURATION = 64;
const CRAFT_SPIN_TURNS = 1.425;
const CRAFT_FOV = 78;
const CRAFT_START_Y = GLOBAL.totalHeight * 0.08;
const CRAFT_END_Y = GLOBAL.totalHeight * 1.08;
const CRAFT_LOOK_RADIUS = GLOBAL.totalHeight * 0.18;
const CRAFT_LOOK_DROP = GLOBAL.totalHeight * 0.045;

function updateCraftTour(dt) {
  if (!craftTourPlaying) return false;
  craftTourElapsed += dt;
  const buildK = Math.min(1, craftTourElapsed / CRAFT_BUILD_DURATION);
  craftTourProgress = Math.min(1, craftTourElapsed / CRAFT_RISE_DURATION);
  buildTourProgress = DEFAULT_BUILD_PROGRESS + (1 - DEFAULT_BUILD_PROGRESS) * buildK;
  applyBuildTourVisibility();

  const k = craftTourProgress * craftTourProgress * (3 - 2 * craftTourProgress);
  const y = CRAFT_START_Y + (CRAFT_END_Y - CRAFT_START_Y) * k;
  const az = Math.PI * CRAFT_SPIN_TURNS * k + Math.PI * 0.08;
  const target = new Vector3(
    Math.sin(az) * CRAFT_LOOK_RADIUS,
    Math.max(1.6, y - CRAFT_LOOK_DROP),
    Math.cos(az) * CRAFT_LOOK_RADIUS,
  );

  if (camera.fov !== CRAFT_FOV) {
    camera.fov = CRAFT_FOV;
    camera.updateProjectionMatrix();
  }
  camera.position.set(0, y, 0);
  camera.lookAt(target);
  rig.sync(camera.position, target);
  free.controls.object.position.copy(camera.position);
  free.controls.target.copy(target);
  if (craftTourProgress >= 1) {
    craftTourPlaying = false;
  }
  return true;
}

function applyBuildTourVisibility() {
  applyBuildState(pagoda.root, buildTourProgress, { keepActiveStoreys: pagoda.storeys });
}

function stopBuildTour() {
  buildTourActive = false;
  buildTourPlaying = false;
  craftTourPlaying = false;
  craftTourElapsed = 0;
  craftTourProgress = 0;
  panels?.showCraftEntry(false);
  restoreBuildState(pagoda.root);
  facade?.setEra?.(states.get().era, { instant: true });
}

/* 登记塔身**实际在用**的材质(含 scaleUV 产生的克隆)。
 * 跳过 DoubleSide:那是把单面片当双面用的构件(如檐下),
 * 几何法线可能朝任一侧,朝上遮罩会误判 —— 而檐下本来就不该积雪。 */
/* 勾阑的材质克隆**不受季节开关约束** —— 必须无条件做。
 * 克隆与原材质参数逐值相同,但**材质 id 不同**,而 three 的不透明队列排序键里含它;
 * 排序一变,共面构件的 z-fighting 就会翻面(这个项目吃过一次:删一行 import
 * 就能让垂脊与屋面互换胜负)。只在开季节时克隆,`?seasons=0` 与季节基准态
 * 就会差出 2691 个像素 —— 实测如此。 */
const railClonesAll = new Map();
pagoda.root.traverse((o) => {
  if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
  let p = o, isRail = false;
  while (p) {
    if (typeof p.name === 'string' && p.name.startsWith('balustrade')) { isRail = true; break; }
    p = p.parent;
  }
  if (!isRail || o.material.side === DoubleSide) return;
  let c = railClonesAll.get(o.material);
  if (!c) { c = o.material.clone(); railClonesAll.set(o.material, c); }
  o.material = c;
});

if (buildingSnow) {
  /* 勾阑单独一档:**只有横向构件的顶平面**积雪(寻杖顶、横栏顶、望柱帽),
   * 望柱侧面与格条侧面保持干净 —— 所以用比 flat 更严的 top 档(N.y ≥ 0.80)。
   * 需要独立材质是因为不能直接改 WOOD.trim:门窗框、直棂也在用它。
   * 判定靠祖先组名 `balustrade_*`,不动 components/balustrade.js。 */
  const railClones = railClonesAll;

  const mats = new Set([...TILE_ALL, ...WOOD_ALL]);
  pagoda.root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (m && m.side !== DoubleSide && !railClones.has(m)) mats.add(m);
    }
  });
  // 克隆本身要从 flat 档里排除(它们是 values,不是 keys)
  for (const c of railClones.values()) mats.delete(c);
  buildingSnow.register([...mats]);
  buildingSnow.register([...railClones.values()], { profile: 'top' });
}

// 铺作逐朵色差:全塔共用一份 WOOD.bracket,不做这一步整条铺作带是同一个色号。
// 走 InstancedMesh 的逐实例色,不拆材质、不加绘制批次(见 materials/bracketTone.js)。
applyBracketTones(pagoda.root);

/**
 * 夜景内透:每个明层内槽一盏佛堂灯。
 * 此前夜景只有檐下二十四盏,塔身是从外面打亮的壳子,五个佛堂漆黑、
 * 满立面的格扇读成黑格子。灯挂在各层 storey 组下,故分解时随层升起。
 * 不开阴影 —— 外墙外皮法线朝外,室内灯 N·L < 0,朗伯项自己就把光挡在里面。
 */
const nightInterior = createNightInterior({ pagoda });

/**
 * 古今变化(立面材料演变),独立子系统 —— 资料源 reference/FacadeHistory。
 * 它把夹泥墙与墙内斜撑挂进各明层的 storey 组,故分解、逐层、巡航、剖透视
 * 的一切变换都自动跟随,**不占用这四处的任何代码**。
 * 主体结构在两个年代之间无可考变化,故这里只换二至五层次间的那层墙。
 */
const eraParam = q.get('era');
const facade = createFacadeHistory({
  pagoda,
  initial: ERA_KEYS.includes(eraParam) ? eraParam : ERA_DEFAULT,
  snap: SNAP,
});


const statueSystem = createPagodaStatues({
  pagodaPlan: pagoda,
  quality: 'high',
  representationOverride: 'extant-survey',
  enableDebug: false,
});
scene.add(statueSystem);

const STATUE_HIDDEN_MODES = new Set(['exploded', 'buildtour']);

function syncStatueVisibility(mode) {
  statueSystem.visible = !STATUE_HIDDEN_MODES.has(mode);
}

const statueInteriorGlow = new PointLight(0xffc47a, 0, GLOBAL.totalHeight * 1.18, 1.18);
statueInteriorGlow.name = 'statue-mode-inner-glow';
statueInteriorGlow.position.set(
  GLOBAL.totalHeight * -0.08,
  GLOBAL.totalHeight * 0.46,
  GLOBAL.totalHeight * 0.08,
);
statueInteriorGlow.castShadow = false;
scene.add(statueInteriorGlow);

const statueCutawayFill = new PointLight(0xffd8a8, 0, GLOBAL.totalHeight * 1.25, 1.45);
statueCutawayFill.name = 'statue-mode-cutaway-fill';
statueCutawayFill.position.set(
  GLOBAL.totalHeight * -0.34,
  GLOBAL.totalHeight * 0.52,
  GLOBAL.totalHeight * 0.36,
);
statueCutawayFill.castShadow = false;
scene.add(statueCutawayFill);

const statueCutawayPlanes = [
  new Plane(new Vector3(1, 0, 0), 0),
  new Plane(new Vector3(0, 0, -1), 0),
];
const STATUE_CUTAWAY_START_OFFSET = GLOBAL.totalHeight * 1.45;
let statueCutawayReveal = 0;
let statueCutawayTarget = 0;
let statueModeActive = false;
let statueResourcesReady = false;
let statueClipEnabled = false;
let statueCutShellVisible = false;
const statueClipTargets = [];

/**
 * 剖切断口的「盖子」(第32轮,方案二:BackSide 深灰副本)。
 *
 * 第31轮试过在两个剖切面各铺一片深灰面板 —— 失败:一片平面不知道实体在哪里被切开,
 * 它在断口处是盖子,在空腔处就是挡板,整个室内被糊死。
 *
 * 本方案不猜断口在哪:给每个被切网格加一层**同几何、BackSide、深灰**的副本。
 * 实体被切开后朝向相机的正是它自己的内表面(背面),副本把它画成深灰 ——
 * 断口自然读作「剖到的实体」,而空腔处没有背面可画,不会被填。
 * 副本作为**同一父节点的兄弟**加入,故自动跟随分解/巡航等一切变换;
 * 不投影、不接受拾取,只在剖透视模式下显示。
 */
/** 剖到的地方一律**同一片均质暗色**,与正规建筑图纸的剖面表达一致。
 *  用 MeshBasic 而非 Standard:剖面不该有明暗,否则不同朝向的断口深浅不一,读不成「剖到」。
 *
 *  色值走过三轮:第33轮纯黑 → 第34轮转中性深灰 0x4a4a4f(纯黑在暗部与背景糊成一片,
 *  分不清「剖到的实体」与「被切掉之后的空」)→ 第43轮用户裁定再压向黑。
 *  取 0x1c1c20 而**不取纯黑**:第34轮那条理由仍然成立,断口要能自背景里读出边界;
 *  这个值已足够读作黑,又留了一线明度差,不至于与背景合成一片。*/
const CUT_FACE_MAT = new MeshBasicMaterial({ color: 0x1c1c20, side: BackSide });
CUT_FACE_MAT.clippingPlanes = statueCutawayPlanes;
CUT_FACE_MAT.clipIntersection = true;

let cutShell = null;
function buildCutShell() {
  const src = [];
  pagoda.root.traverse((o) => {
    // 古今面层的渐变副本与本体同几何,断口只做一份(副本随本体显隐,见 shown())
    if (o.isMesh && o.userData?.partKey !== 'cutFace' && !o.userData?.eraOverlay) src.push(o);
  });
  cutShell = [];
  for (const o of src) {
    const c = o.isInstancedMesh
      ? new InstancedMesh(o.geometry, CUT_FACE_MAT, o.count)
      : new Mesh(o.geometry, CUT_FACE_MAT);
    if (o.isInstancedMesh) {
      c.instanceMatrix.copy(o.instanceMatrix);
      c.instanceMatrix.needsUpdate = true;
    }
    c.position.copy(o.position);
    c.quaternion.copy(o.quaternion);
    c.scale.copy(o.scale);
    c.castShadow = c.receiveShadow = false;
    c.raycast = () => {};                 // 不参与拾取
    c.visible = false;
    // 记住本体:断口副本的可见性必须跟着本体走。古今变化会隐掉整族墙,
    // 副本若不跟,剖透视里就会留下一圈「被拆掉的墙」的鬼影(它没有本体了)。
    c.userData = { partKey: 'cutFace', src: o };
    o.parent.add(c);
    cutShell.push(c);
  }
}

/** 本体是否真在画面上:自身与全部祖先都可见(逐层聚焦、古今变化都是关**组**) */
function shown(o) {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}

function prepareStatueModeResources() {
  if (statueResourcesReady) return;
  if (!cutShell) buildCutShell();
  statueClipTargets.length = 0;
  pagoda.root.traverse((obj) => {
    if (!obj.material) return;
    if (obj.userData?.partKey === 'cutFace') return;

    if (!obj.userData.__statueModeOriginalMaterials) {
      obj.userData.__statueModeOriginalMaterials = obj.material;
    }

    const original = obj.userData.__statueModeOriginalMaterials;
    if (!obj.userData.__statueModeMaterials) {
      const mats = Array.isArray(original) ? original : [original];
      obj.userData.__statueModeMaterials = mats.map((mat) => {
        if (!mat) return mat;
        const nextMat = mat.clone();
        nextMat.clippingPlanes = statueCutawayPlanes;
        nextMat.clipIntersection = true;
        nextMat.clipShadows = true;
        // 保持单面,断口厚度交给 cutShell 的 BackSide 副本表达。
        nextMat.side = FrontSide;
        nextMat.needsUpdate = true;
        return nextMat;
      });
    }
    statueClipTargets.push(obj);
  });
  statueResourcesReady = true;
}

function syncCutShellVisibility(enabled, reveal = statueCutawayReveal) {
  const visible = enabled && reveal > 0.02;
  if (!cutShell) return;
  if (!visible) {
    if (statueCutShellVisible) for (const c of cutShell) c.visible = false;
    statueCutShellVisible = false;
    return;
  }
  for (const c of cutShell) c.visible = shown(c.userData.src);
  statueCutShellVisible = true;
}

function setStatueClipEnabled(enabled) {
  if (enabled) prepareStatueModeResources();
  if (statueClipEnabled === enabled) return;
  statueClipEnabled = enabled;

  renderer.localClippingEnabled = enabled;
  const em = edges.material;
  em.clippingPlanes = enabled ? statueCutawayPlanes : null;
  em.clipIntersection = true;
  em.needsUpdate = true;

  for (const obj of statueClipTargets) {
    const original = obj.userData.__statueModeOriginalMaterials;
    obj.material = enabled
      ? (Array.isArray(original) ? obj.userData.__statueModeMaterials : obj.userData.__statueModeMaterials[0])
      : original;
  }
  statueSystem.setHighlightMode?.(enabled);
}

function setStatueCutawayReveal(value) {
  const reveal = Math.min(1, Math.max(0, value));
  const offset = STATUE_CUTAWAY_START_OFFSET * (1 - reveal);
  for (const plane of statueCutawayPlanes) plane.constant = offset;
  statueInteriorGlow.intensity = statueClipEnabled ? 3.15 * reveal : 0;
  statueCutawayFill.intensity = statueClipEnabled ? 2.15 * reveal : 0;
  const shouldShowCutShell = statueClipEnabled && reveal > 0.02;
  if (shouldShowCutShell !== statueCutShellVisible) syncCutShellVisibility(statueClipEnabled, reveal);
}

function applyStatueMode(enabled, reveal = enabled ? 1 : 0) {
  setStatueClipEnabled(enabled);
  setStatueCutawayReveal(enabled ? reveal : 0);
  syncCutShellVisibility(enabled, enabled ? reveal : 0);
}

addDebugOutline(pagoda.root, {
  color: 0x000000,
  opacity: 1,
  thresholdAngle: 180,
  skip: (o) => {
    const name = o.name ?? '';
    return name.includes('sky') || name.includes('ground') || name.includes('dome') || name.includes('tree');
  },
});

const exploder = createExploder(pagoda.storeys, {
  finial: pagoda.root.getObjectByName('finial'),
});

/* 斗拱特写:独立一朵英雄级转角铺作,置于塔外空地,不干扰主体 */
const hero = buildHeroBracket();
const heroPivot = new Group();
heroPivot.name = 'heroPivot';
heroPivot.position.set(0, GLOBAL.totalHeight * 0.22, GLOBAL.totalHeight * 0.86);
heroPivot.scale.setScalar(1.5);          // 略放大以便看清榫卯搭接
heroPivot.add(hero.group);
heroPivot.visible = false;
scene.add(heroPivot);
const setHeroExplode = createHeroExploder(hero.parts);

/**
 * 构造读图模式(键 `L`,第35轮用户要求)。
 * 交付态是为氛围调的:低对比木纹 + 高填充光。看氛围对,**看构造不行** ——
 * 同色同材的斗与栱糊成一团,数不出跳数(用户原话「粘连在一起」)。
 * 一开三件:平色体块(去纹理 + flatShading)、棱线叠加、强直射光。
 * 三件缺一都不够:只加线会被木纹噪点淹掉,只调光会把暗部读成黑块。
 */
// ★ 英雄铺作(斗拱特写)是独立于塔身的一组 Mesh,必须一并挂线,
//   否则特写模式里一根线都没有 —— 而那正是最需要线的地方。
const edges = createEdgeOverlay([pagoda.root, heroPivot]);
let studyOn = false;
/**
 * 棱线**单独**可开:读图模式一定带线,但线本身也服务于那几个「为看构造而存在」
 * 的模式(斗拱特写 / 逐层 / 剖透视 / 分解)。全景与巡航保持干净 ——
 * 那里要的是氛围,满屏墨线会把它读成建筑图。
 */
// 巡航也上线,但走**最轻的一档**(第47轮):判读模式要看清构件,
// 巡航只要一道轮廓的暗示 —— 同一条线,三种分量。
const EDGE_MODES = new Set(['bracket', 'storey', 'statue', 'exploded', 'cruise']);
/** 斗拱特写与分解要「每个构件都读得出」;巡航只要最轻的一道 */
const FAINT_EDGE = new Set(['cruise']);
/**
 * 近景才上线。判据是**机位到塔心的距离**,不是模式 ——
 * 自由视角凑到檐下看斗拱,与按 B 进特写是同一件事,不该只认后者。
 * 双阈值防抖:近于 46 m 开,远于 58 m 关(中间保持原状)。
 * 46 m 的来历:副阶檐口外缘 19.7 m,再退一个塔身高的一半 —— 到这个距离,
 * 一朵铺作在 1080p 上还有约 40 px,线才有意义;更远线只会织成网。
 */
/**
 * ★ 第41轮实测:巡航的机位到塔身中点的距离在 **51.9 ~ 65.6 m** 之间摆动
 *   (螺旋半径 0.92H→0.62H、高度 0.10H→0.88H)。旧阈值 46/58 正好被它跨过 ——
 *   于是边线在巡航中**时有时无**,用户报「不稳定,要自己转动或 zoom in 才显示」。
 *   阈值抬到 70/85:巡航全程恒开,而全景预设(1.80H ≈ 121 m)仍在门外。
 */
const EDGE_NEAR = 70, EDGE_FAR = 85;
const TOWER_MID = new Vector3(0, GLOBAL.totalHeight * 0.42, 0);
let edgeAuto = false, edgeNear = false;
/** 斗拱特写与读图模式要「每个构件都读得出」,其余场合只要一道轮廓的暗示 */
const HEAVY_EDGE = new Set(['bracket', 'exploded']);
let lastMode = 'free';
function refreshEdges(mode) {
  if (mode !== undefined) { lastMode = mode; edgeAuto = EDGE_MODES.has(mode); }
  edges.setStyle(studyOn || HEAVY_EDGE.has(lastMode) ? 'study'
    : FAINT_EDGE.has(lastMode) ? 'faint' : 'trace');
  edges.set(studyOn || edgeAuto || edgeNear);
}
/** 预构建:首帧之后趁空把棱线层建好,免得第一次触发时卡一下、看着像「没生效」 */
let edgePrebuilt = false;
function prebuildEdges() {
  if (edgePrebuilt) return;
  edgePrebuilt = true;
  const run = () => { edges.set(true); edges.set(studyOn || edgeAuto || edgeNear); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 800);
}

function prebuildStatueModeResources() {
  const run = () => prepareStatueModeResources();
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3500 });
  else setTimeout(run, 1200);
}

function tickEdgeDistance() {
  const d = camera.position.distanceTo(TOWER_MID);
  const want = edgeNear ? d < EDGE_FAR : d < EDGE_NEAR;
  if (want !== edgeNear) { edgeNear = want; refreshEdges(); }
}
function setStudyMode(on) {
  studyOn = !!on;
  setStudyMaterials(studyOn);
  refreshEdges();
  lighting.setStudy(studyOn);
  document.body.classList.toggle('study-mode', studyOn);
}

/** 这朵铺作在世界尺度下的外接尺寸,供取景反算(分解后还要更大一圈) */
const heroSize = hero.box.getSize(new Vector3()).length() * heroPivot.scale.x;
const heroDist = heroSize * 1.05;

/* ── 4. 交互 ───────────────────────────────────────────────── */
const states = createStates({ era: facade.era });
const rig = createCameraRig(camera, pagoda.anchors);
const free = createControls(camera, renderer.domElement);
// 只对塔身与英雄斗拱做拾取:天空穹顶与地面不参与,省掉无谓的射线求交
const picking = createPicking(camera, [statueSystem, pagoda.root, heroPivot], renderer.domElement, {
  shouldAccept(key) {
    if (states.get().mode !== 'statue') return true;
    return key.partKey === 'statueFigure' || key.partKey === 'statueMural';
  },
});

/* ── 5. UI ─────────────────────────────────────────────────── */
const hudRoot = document.getElementById('hud');
hudRoot.toggleAttribute('data-tune', TUNE);
const hud = createHUD(states, hudRoot);
const panels = createPanels(hudRoot);
let cameraTuner = null;
hud.onHelp(() => panels.toggleHelp());
// ?help=1:直接展开说明面板(出图核对用,也方便把它当作可分享的说明页)
if (q.get('help') === '1') panels.toggleHelp();
panels.setLabels(hero.anchors);
const statueGuideAnchors = statueSystem.getFloorGuideAnchors?.() ?? [];
panels.setStatueGuideAnchors(statueGuideAnchors);
panels.setCraftEntryAnchor(new Vector3(0, GLOBAL.totalHeight * 0.18, 0));
panels.onCraftEntry(() => {
  if (states.get().mode !== 'buildtour') states.set({ mode: 'buildtour' });
  buildTourActive = true;
  buildTourPlaying = false;
  craftTourPlaying = true;
  craftTourProgress = 0;
  craftTourElapsed = 0;
  buildTourProgress = DEFAULT_BUILD_PROGRESS;
  applyBuildTourVisibility();
  panels.showCraftEntry(false);
  camera.fov = CRAFT_FOV;
  camera.updateProjectionMatrix();
  free.disable();
  rig.cruise(false);
});

const H = GLOBAL.totalHeight;
const STATUE_OVERVIEW_VIEW = {
  target: new Vector3(
    H * -0.006,
    H * 0.466,
    H * 0.067,
  ),
  position: new Vector3(
    H * -1.047,
    H * 0.932,
    H * 0.372,
  ),
  fov: 45,
};
const STATUE_FLOOR_VIEWS = {
  1: {
    target: new Vector3(H * -0.061, H * 0.15, H * 0.046),
    position: new Vector3(H * -0.327, H * 0.178, H * 0.339),
    fov: 45,
  },
  2: {
    target: new Vector3(H * -0.056, H * 0.346, H * 0.033),
    position: new Vector3(H * -0.321, H * 0.374, H * 0.326),
    fov: 45,
  },
  3: {
    target: new Vector3(H * -0.051, H * 0.477, H * 0.025),
    position: new Vector3(H * -0.316, H * 0.505, H * 0.318),
    fov: 45,
  },
  4: {
    target: new Vector3(H * -0.04, H * 0.626, H * 0.02),
    position: new Vector3(H * -0.306, H * 0.654, H * 0.313),
    fov: 45,
  },
  5: {
    target: new Vector3(H * -0.034, H * 0.749, H * 0.015),
    position: new Vector3(H * -0.299, H * 0.777, H * 0.308),
    fov: 45,
  },
};
let statueCameraTween = null;
const statueCameraTarget = new Vector3();

const easeCamera = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function statueFloorView(floor) {
  const view = STATUE_FLOOR_VIEWS[Number(floor)] ?? STATUE_FLOOR_VIEWS[3];
  if (!view) return null;
  return {
    target: view.target.clone(),
    position: view.position.clone(),
    fov: view.fov,
  };
}

function startStatueCameraTween(view, duration = 1.45, onComplete = null) {
  if (!view) return;
  free.disable();
  statueCameraTween = {
    t: 0,
    duration: dur(duration),
    fromP: camera.position.clone(),
    fromT: (free.controls.enabled ? free.controls.target : rig.target).clone(),
    fromFov: camera.fov,
    toP: view.position.clone(),
    toT: view.target.clone(),
    toFov: view.fov,
    onComplete,
  };
}

function tickStatueCameraTween(dt) {
  if (!statueCameraTween) return false;
  const tw = statueCameraTween;
  tw.t = Math.min(1, tw.t + dt / tw.duration);
  const k = easeCamera(tw.t);
  camera.position.lerpVectors(tw.fromP, tw.toP, k);
  statueCameraTarget.lerpVectors(tw.fromT, tw.toT, k);
  camera.fov = tw.fromFov + (tw.toFov - tw.fromFov) * k;
  camera.updateProjectionMatrix();
  camera.lookAt(statueCameraTarget);
  rig.sync(camera.position, statueCameraTarget);
  free.controls.object.position.copy(camera.position);
  free.controls.target.copy(statueCameraTarget);
  free.controls.update();
  if (tw.t >= 1) {
    statueCameraTween = null;
    tw.onComplete?.();
    if (states.get().mode === 'statue') free.enable();
  }
  return true;
}

function beginStatueCutawayReveal() {
  if (states.get().mode !== 'statue') return;
  statueCutawayTarget = 1;
  if (statueCutawayReveal < 0.045) {
    statueCutawayReveal = 0.045;
    applyStatueMode(true, statueCutawayReveal);
  }
}

function beginStatueModeIntro() {
  statueModeActive = true;
  statueCutawayReveal = 0;
  statueCutawayTarget = 0;
  applyStatueMode(true, 0);
  startStatueCameraTween({
    target: STATUE_OVERVIEW_VIEW.target.clone(),
    position: STATUE_OVERVIEW_VIEW.position.clone(),
    fov: STATUE_OVERVIEW_VIEW.fov,
  }, 1.65, () => {
    beginStatueCutawayReveal();
  });
}

function endStatueMode() {
  statueModeActive = false;
  statueCutawayReveal = 0;
  statueCutawayTarget = 0;
  applyStatueMode(false, 0);
}

function focusStatueFloor(floor) {
  if (states.get().mode !== 'statue') states.set({ mode: 'statue' });
  beginStatueCutawayReveal();
  startStatueCameraTween(statueFloorView(floor));
}
panels.onStatueFloorSelect((floor) => {
  if (!TUNE) focusStatueFloor(floor);
});

function hitLevel(hit) {
  let level = Number(hit?.meta?.level);
  if (Number.isInteger(level)) return level;
  for (let o = hit?.object; o; o = o.parent) {
    level = Number(o.userData?.level);
    if (Number.isInteger(level)) return level;
  }
  return null;
}

picking.onPick((hit) => {
  if (TUNE) return;
  if (states.get().mode === 'exploded' && states.get().level !== 'all') {
    panels.hidePart();
    states.set({ mode: 'exploded', level: 'all', pick: null });
    return;
  }
  if (!hit) { panels.hidePart(); states.set({ pick: null }); return; }
  if (states.get().mode === 'exploded') {
    const level = hitLevel(hit);
    if (Number.isInteger(level) && level >= 1 && level <= 6) {
      states.set({ mode: 'exploded', level, pick: hit.partKey });
      return;
    }
  }
  if (states.get().mode === 'statue' && hit.meta?.floor) {
    panels.showPart('statueOverview', { floor: 'all' });
    panels.openStatueFloor(hit.meta.floor, { notify: false });
    focusStatueFloor(hit.meta.floor);
    states.set({ pick: hit.partKey });
    return;
  }
  panels.showPart(hit.partKey, hit.meta);
  states.set({ pick: hit.partKey });
});

/* ── 状态机 → 场景:所有场景变化的唯一入口 ─────────────────── */
/* 逐层 / 分解聚焦的镜头接管:定点补间走完后才交给 OrbitControls,
 * 否则补间与控制器会互相拉扯。 */
let storeyOrbit = false;
/* 巡航自动昼夜的接管标志。
 * 用户一按昼/夜键就交还控制权(否则那枚键在巡航里按了没反应),
 * 重新进入巡航模式时再收回。 */
let timeManual = false;
let autoTimeWriting = false;
let explodeTarget = 0, explodeNow = 0;
let heroTarget = 0, heroNow = 0;

function applyMode(s, prevMode) {
  syncStatueVisibility(s.mode);
  if (buildTourActive && s.mode !== 'buildtour') stopBuildTour();
  if (prevMode === 'statue' && s.mode !== 'statue') endStatueMode();
  statueCameraTween = null;
  if (s.mode !== 'statue' && camera.fov !== 45) {
    camera.fov = 45;
    camera.updateProjectionMatrix();
  }
  /* 从 free 或「定高环绕」交回时都要收回机位,否则 rig 内部缓存还是接管前的。
   * 不能加 `s.mode !== prevMode` 的条件 —— 逐层之间换层(storey → storey)
   * 模式没变但控制器已经把相机挪走了,不收回就会从旧机位补间过去,画面一跳。 */
  if (prevMode === 'free' || storeyOrbit) rig.takeBack(free.controls);

  free.disable();
  storeyOrbit = false;
  rig.cruise(false);
  explodeTarget = 0;
  heroTarget = 0;
  heroPivot.visible = false;
  panels.showLabels(false);
  exploder.focus(null);

  switch (s.mode) {
    case 'cruise':
      rig.cruise(true);
      timeManual = false;     // 重新进入巡航 ⇒ 自动昼夜收回控制权
      break;
    case 'free':
      rig.handoff(free.controls);
      free.enable();
      break;
    case 'buildtour':
      buildTourProgress = DEFAULT_BUILD_PROGRESS;
      buildTourActive = true;
      buildTourPlaying = true;
      craftTourPlaying = false;
      craftTourProgress = 0;
      craftTourElapsed = 0;
      applyBuildTourVisibility();
      panels.showCraftEntry(true);
      rig.goToView('overview', null, dur(TRANSITION.default));
      break;
    case 'storey':
      rig.goToView(null, s.level, dur(TRANSITION.default));
      break;
    case 'exploded': {
      explodeTarget = 1;
      // 分解态下选层 = 镜头靠近该结构层,但保留全塔爆炸图的上下文。
      exploder.focus(null);
      if (s.level === 'all') {
        rig.goToView('exploded', null, dur(TRANSITION.toExploded));
      } else {
        // 该层在「拉开后」的标高,取景点须跟着走,否则镜头对着空处。
        // level 6 是塔刹:不在 storeys 里,单独按分解后的刹身锚点取景。
        const group = pagoda.storeys.filter((x) => x.plan.level === s.level);
        const topOffset = (pagoda.storeys.at(-1)?.group.userData.explodeOffset ?? 0) + 2.2;
        const finialAnchor = pagoda.anchors.find((a) => a.name === 'finial');
        const y = s.level === 6
          ? (finialAnchor?.position.y ?? GLOBAL.totalHeight * 0.92) + topOffset
          : group.reduce((a, x) =>
            a + x.plan.baseY + (x.group.userData.explodeOffset ?? 0), 0) / group.length;
        const r = s.level === 6
          ? (finialAnchor?.radius ?? 26) * 0.86
          : Math.max(...group.map((x) => x.plan.eaveR ?? x.plan.cornerR)) * 2.5;
        const az = s.level === 6 ? Math.PI * 0.06 : Math.PI * 0.22;
        const el = s.level === 6 ? 0.05 : 0.20;
        rig.goToPosition(
          new Vector3(Math.sin(az) * Math.cos(el) * r, y + Math.sin(el) * r, Math.cos(az) * Math.cos(el) * r),
          new Vector3(0, y + (s.level === 6 ? 0 : 1.5), 0),
          dur(TRANSITION.toExploded),
        );
      }
      break;
    }
    case 'bracket': {
      heroPivot.visible = true;
      heroTarget = 1;
      panels.showLabels(true);
      // 取景按这朵的实际尺度反算,换斗拱等级/改材分都不必重调机位
      const c = heroPivot.position;
      const az = Math.PI * 0.20;
      rig.goToPosition(
        c.clone().add(new Vector3(
          Math.sin(az) * heroDist, heroSize * 0.42, Math.cos(az) * heroDist)),
        c.clone().add(new Vector3(0, heroSize * 0.30, 0)),
        dur(TRANSITION.toBracket),
      );
      break;
    }
    case 'statue': {
      // 佛像模式:先推进到剖透视机位,再让剖切面形成。
      beginStatueModeIntro();
      break;
    }
  }
}

states.onChange((s, patch, prev) => {
  // 底栏季节键:'auto' 交还给巡航轮换,四季之一则冻结
  if (s.season !== prev?.season) seasons?.setManual(s.season === 'auto' ? null : s.season);
  if (s.era !== prev.era) facade.setEra(s.era, { instant: SNAP });
  if (s.time !== prev.time) {
    lighting.setMode(s.time === 'night' ? 'night' : 'day', { instant: SNAP });
    // 只有**用户按键**才算接管;自动昼夜自己回写 states.time 时不接管
    if (!autoTimeWriting) timeManual = true;
  }
  if (s.mode !== prev.mode || s.level !== prev.level || s.viewTick !== prev.viewTick) applyMode(s, prev.mode);
  if (s.mode !== prev.mode) refreshEdges(s.mode);
  if (!TUNE && s.mode === 'statue' && prev.mode !== 'statue') panels.showPart('statueOverview', { floor: 'all' });
  panels.showStatueGuides(!TUNE && s.mode === 'statue');
  if (prev.mode === 'statue' && s.mode !== 'statue') {
    panels.hidePart();
  }
});

// 年代过渡落位后重刷一次剖透视的断口副本 —— 拆掉的墙不该在剖面里留鬼影
facade.onSettled(() => applyStatueMode(states.get().mode === 'statue', statueCutawayReveal));

/* ── 键盘可达 ─────────────────────────────────────────────── */
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '5') states.set({ mode: 'storey', level: Number(k) });
  else if (k === '0') states.set({ mode: 'free', level: 'all' });
  else if (k === ' ') { e.preventDefault(); states.toggleMode('cruise'); }
  else if (k === 'n') states.toggleTime();
  else if (k === 'j') {                       // J = 季:手动推进一季(调试用)
    if (seasons && !seasons.frozen) {
      seasons.advance(1);
      console.log('[季节]', seasons.current);
    }
  }
  else if (k === 'x') states.toggleMode('exploded');
  else if (k === 'b') states.toggleMode('bracket');
  else if (k === 'v') states.toggleMode('statue');
  else if (k === 'g') states.toggleEra();      // G = 古今:立面在夹泥墙与木构之间切
  else if (k === 'l') {                       // L = layer:构造读图模式(体块 + 棱线 + 强光)
    setStudyMode(!studyOn);
    // 首次开启要建 3.3 M 顶点的棱线层,会卡一下 —— 给个明确回执,免得以为按坏了
    setLoading(studyOn ? '构造读图模式:开(体块 + 棱线 + 强光)' : '构造读图模式:关(回交付态)');
    if (loading) {
      loading.style.display = 'grid';
      setTimeout(() => { loading.style.display = 'none'; setLoading(''); }, 1400);
    }
  }
  else if (k === 'c') {
    if (states.get().mode !== 'free' && states.get().mode !== 'statue') states.set({ mode: 'statue' });
    cameraTuner?.toggle();
  }
  else if (k === 'p') {                       // P = position:复制当前机位深链接
    const link = camLink();
    const done = (okMsg) => {
      setLoading(okMsg);
      if (loading) { loading.style.display = 'grid'; setTimeout(() => { loading.style.display = 'none'; setLoading(''); }, 1600); }
    };
    // 剪贴板在非安全上下文(http://localhost 之外)会被拒,故必有回退
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link)
        .then(() => done('机位已复制到剪贴板'))
        .catch(() => { window.prompt('复制这段机位链接:', link); });
    } else {
      window.prompt('复制这段机位链接:', link);
    }
    console.log('[机位]', link);
  }
  else if (k === '?' || k === 'h') panels.toggleHelp();
  else if (k === 'escape') { panels.hideHelp(); panels.hidePart(); }
});

/* ── 6. 渲染循环 ──────────────────────────────────────────── */
onTick((dt) => {
  const s = states.get();
  const wantsLevelOrbit = s.mode === 'storey' || (s.mode === 'exploded' && s.level !== 'all');
  /* 逐层 / 分解聚焦:定点镜头到位后交给 OrbitControls,但**锁死高度、禁用平移** ——
   * 视点仍在本层的标高上,只能绕塔转与推拉。
   * 必须等 rig 的补间走完再接管,否则补间与控制器会互相拉扯。 */
  if (wantsLevelOrbit && !storeyOrbit && !rig.tweening) {
    rig.handoff(free.controls);
    free.enableOrbitAtHeight(camera.position.y);
    storeyOrbit = true;
  }
  if (s.mode === 'buildtour' && buildTourPlaying) {
    buildTourProgress = Math.min(1, buildTourProgress + dt * BUILD_TOUR_SPEED);
    applyBuildTourVisibility();
    if (buildTourProgress >= 1) {
      buildTourPlaying = false;
    }
  }
  const craftCameraActive = s.mode === 'buildtour' && updateCraftTour(dt);
  const isFree = s.mode === 'free' || s.mode === 'statue' || storeyOrbit;
  const cameraTweening = tickStatueCameraTween(dt);
  if (isFree && !cameraTweening && !craftCameraActive) free.update();
  if (!craftCameraActive) rig.tick(dt, isFree);
  if (statueModeActive) {
    const nextReveal = statueCutawayReveal
      + (statueCutawayTarget - statueCutawayReveal) * (SNAP ? 1 : Math.min(1, dt * 1.8));
    if (Math.abs(nextReveal - statueCutawayReveal) > 1e-4 || Math.abs(statueCutawayTarget - nextReveal) > 1e-4) {
      statueCutawayReveal = nextReveal;
      setStatueCutawayReveal(statueCutawayReveal);
    }
  }

  // 远山层锚定到相机脚下:相机相对距离恒定 ⇒ 永不越过 far,构图不随机位漂移
  environment.tick(dt, camera);

  /* ★ 时序:季节写的是各模块的**昼态基准值**,昼夜再在其上插值。
   *    seasons.apply() 必须排在 lighting.tick 与所有 setDayNight 之前,
   *    顺序反了季节会被夜色覆写。
   *    圈数只在巡航时增长 ⇒ 退出巡航季节自动冻结在当前值,不回跳。 */
  if (seasons) {
    /* 佛像探索模式挂起天气:那是进到塔内看造像的通道,
     * 室外的雨雪花烟既挡视线又白费开销。挂起是整组不绘制、不推进时钟,
     * 不是把不透明度调到 0 —— 后者照样要走完全部片元。 */
    const weatherOff = s.mode === 'statue';
    seasonParticles?.setSuspended(weatherOff);
    warSmoke?.setSuspended(weatherOff);

    seasons.setTurns(rig.cruiseTurns);
    seasons.apply();
    seasonParticles?.tick(dt, camera);   // 粒子盒跟随相机 ⇒ 可见密度恒定
    warSmoke?.tick(dt);
    warSmoke?.setDayNight(lighting.value);
  }

  facade.tick(dt);                     // 古今过渡:2 秒分三段的解释动画,与镜头无关
  prebuildEdges();
  tickEdgeDistance();
  /* 巡航 + 季节自动 ⇒ 昼夜跟着季节时钟走(每季白天 3/4、夜 1/4);
   * 冻结某季、非巡航模式、或用户按过昼/夜键 ⇒ 交还给按钮。 */
  const autoNight = (seasons && !timeManual && s.mode === 'cruise') ? seasons.night : null;
  if (autoNight != null) {
    lighting.setValue(autoNight);
    // 回写状态机,底栏那枚键的字样才跟得上画面;写的时候别把自己当成"用户接管"
    const wantNight = autoNight > 0.5 ? 'night' : 'day';
    if (states.get().time !== wantNight) {
      autoTimeWriting = true;
      states.set({ time: wantNight });
      autoTimeWriting = false;
    }
  } else {
    lighting.tick(dt);
  }
  sky.setDayNight(lighting.value);
  ground.setDayNight(lighting.value);
  environment.horizon.setDayNight(lighting.value);
  nightInterior.setNight(lighting.value);
  sunDir.copy(lighting.sun.position).sub(lighting.sun.target.position).normalize();
  sky.setSunDir(sunDir);
  environment.horizon.setSunDir(sunDir, camera);   // 远山是真打光,方向须与光源一致
  sky.tick(dt);
  applyStatueEnvironmentFocus(s.mode === 'statue' && !TUNE);

  // 结构分解 / 斗拱分解:统一缓动,禁止瞬切
  if (Math.abs(explodeTarget - explodeNow) > 1e-4) {
    explodeNow += (explodeTarget - explodeNow) * (SNAP ? 1 : Math.min(1, dt * 2.2));
    exploder.explode(explodeNow);
  }
  if (Math.abs(heroTarget - heroNow) > 1e-4) {
    heroNow += (heroTarget - heroNow) * (SNAP ? 1 : Math.min(1, dt * 1.8));
    setHeroExplode(heroNow);
  }
  if (heroPivot.visible) panels.updateLabels(camera, renderer.domElement);
  if (s.mode === 'buildtour' && !craftTourPlaying) panels.updateCraftEntry(camera, renderer.domElement);
  if (s.mode === 'statue') panels.updateStatueGuides(camera, renderer.domElement);
});

setLoading('');
if (loading) loading.style.display = 'none';

// 起始态:巡航优先(叙事),用户一交互即转自由视角。
// 初始 mode 与默认值相同不会触发 onChange,故此处显式应用一次。
applyMode(states.get(), null);

/**
 * 精确机位深链接 `?cam=px,py,pz,tx,ty,tz`(可选 &fov=)。
 * 与 ?view= 的预设不同,这是**逐位复现**用的:按 C 复制当前机位即得此串。
 * 用户报缺陷时把它贴回来,双方看到的就是同一帧,不必再靠截图猜角度。
 */
function applyCamParam(str, fovStr, toFree = true) {
  const n = str.split(',').map(Number);
  if (n.length < 6 || n.some((x) => !Number.isFinite(x))) return false;
  // 与 ?mode= 同时给出时不切自由态:剖透视里的机位链接必须**留在剖透视里**,
  // 否则「站在佛堂内报缺陷」这条路走不通(第35轮:内景验收图取不到景)。
  if (toFree) states.set({ mode: 'free' });
  statueCameraTween = null;                    // 掐掉造像模式的入场推镜,免得把机位拽走
  // camLink() 一直在往链接里写 fov,这一侧却没读 —— 深链接因此是**有损**的:
  // 复制的是长焦机位,打开是 45° 广角。第34轮补上。
  const fov = parseFloat(fovStr);
  if (Number.isFinite(fov) && fov > 0) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const target = new Vector3(n[3], n[4], n[5]);
  camera.position.set(n[0], n[1], n[2]);
  camera.lookAt(target);
  rig.sync(camera.position, target);
  free.controls.target.copy(target);
  const d = camera.position.distanceTo(target);
  free.controls.maxDistance = Math.max(free.controls.maxDistance, d * 1.25);
  free.controls.maxPolarAngle = Math.PI;
  free.controls.minPolarAngle = 0;
  free.controls.update();
  return true;
}

/** 当前机位 → 深链接(六位小数足够复现到毫米) */
function camLink() {
  const c = camera.position, t = free.controls.target;
  const f = (x) => x.toFixed(3);
  const cam = [c.x, c.y, c.z, t.x, t.y, t.z].map(f).join(',');
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('cam', cam);
  u.searchParams.set('fov', String(Math.round(camera.fov * 10) / 10));
  return u.toString();
}

/* 开发/截图取景 */
// ?mode= 先落,再让 ?cam= 覆盖机位 —— 深链接比模式预设更具体,应当赢
if (q.has('mode') && q.has('cam')) states.set({ mode: q.get('mode') });
if (q.has('cam')) applyCamParam(q.get('cam'), q.get('fov'), !q.has('mode'));
else if (q.has('view')) {
  const H = GLOBAL.totalHeight;
  const VIEWS = {
    // elev:远机位 + 长焦,近似正交投影 —— 相机与塔身中高等高、视线水平,
    // 上下不再有仰视透视,可与测绘立面图并排比对
    elev:   { az: 0, el: 0, dist: 7.1, y: 0.50, fov: 9 },
    finial: { az: Math.PI * 0.06, el: 0.05, dist: 1.02, y: 0.915, fov: 12 },
    south:  { az: 0, el: 0.10, dist: 2.05, y: 0.42 },
    ne:     { az: Math.PI * 0.72, el: 0.22, dist: 1.85, y: 0.40 },
    se:     { az: Math.PI * 0.22, el: 0.20, dist: 1.80, y: 0.40 },
    close:  { az: Math.PI * 0.18, el: 0.06, dist: 0.55, y: 0.16 },
    top:    { az: Math.PI * 0.25, el: 0.75, dist: 1.6,  y: 0.55 },
  };
  const v = VIEWS[q.get('view')] ?? VIEWS.se;
  const dist = (parseFloat(q.get('dist')) || v.dist) * H;
  const ty = (parseFloat(q.get('y')) || v.y) * H;
  const el = q.has('el') ? parseFloat(q.get('el')) : v.el;
  // 长焦:视场角越小越接近正交,配合等比拉远的机位即可保持取景大小
  const fov = parseFloat(q.get('fov')) || v.fov;
  // ★ 必须在 states.set 之**后**改 fov:applyMode() 对一切非 statue 模式
  //   都把 fov 拉回 45,先设就被它抹掉 —— `view=elev` 的长焦一直没生效
  //   (第34轮发现:478 m 远机位配 45° 广角,塔在画面里只有 1/6 高)。
  states.set({ mode: 'free' });
  if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const target = new Vector3(0, ty, 0);
  camera.position.set(
    Math.sin(v.az) * Math.cos(el) * dist,
    ty + Math.sin(el) * dist,
    Math.cos(v.az) * Math.cos(el) * dist,
  );
  camera.lookAt(target);
  rig.sync(camera.position, target);     // rig 内部状态跟上,交接时不被拉回
  free.controls.target.copy(target);
  // 交付态的 OrbitControls 限制会把开发机位拽回来:
  //   maxDistance(总高×4.5)会把长焦远机位拉近、裁掉塔身;
  //   maxPolarAngle(≈水平)会禁止「自下仰望」,内槽这类机位根本站不住。
  // 开发取景一并放宽,交付默认值不动。
  free.controls.maxDistance = Math.max(free.controls.maxDistance, dist * 1.25);
  free.controls.maxPolarAngle = Math.PI;
  free.controls.minPolarAngle = 0;
  free.controls.update();
}
if (q.has('mode') && !q.has('cam')) states.set({ mode: q.get('mode') });
// ?study=1 —— 截图/判读用,省得进页面再按键
if (q.get('study') === '1') setStudyMode(true);
if (TUNE && states.get().mode !== 'free' && states.get().mode !== 'statue') {
  states.set({ mode: 'statue' });
}
if (q.get('time') === 'night') states.set({ time: 'night' });
lighting.setMode(q.get('time') === 'night' ? 'night' : 'day', { instant: SNAP });
nightInterior.setNight(lighting.value);   // 初值:?time=night&snap=1 的静帧要一帧到位
// 深链接 ?season= 也同步进状态机,否则底栏季节键会显示「四季」而场景是冻结的
if (SEASON_KEYS.includes(seasonFreeze)) states.set({ season: seasonFreeze });

if (q.has('bare')) hudRoot.style.display = 'none';
prebuildStatueModeResources();
// &horizon=0:隐去远山与霾带。立面/塔刹这类要与测绘图叠合比对的净图,
// 背景越空越好;长焦(fov 9°)下远山会被压缩放大到与塔身等高,喧宾夺主。
if (q.get('horizon') === '0') environment.horizon.group.visible = false;
if (q.has('fog') && scene.fog) {
  const k = parseFloat(q.get('fog'));
  // 经 ground.setFogScale 合成,而不是直接改 density:
  // 季节每帧都在写 density,直接改的话这个倍率第二帧就没了。
  ground.setFogScale(k > 0 ? k : 0);
}

cameraTuner = createCameraTuner({
  mount: hudRoot,
  camera,
  controls: free.controls,
  rig,
  totalHeight: GLOBAL.totalHeight,
  initialOpen: TUNE,
  slots: [1, 2, 3, 4, 5].map((floor) => ({
    id: `statue-floor-${floor}`,
    label: `${floor}层`,
    floor,
  })),
});

const loop = startLoop({ renderer, scene, camera });

/* ?still=N:渲染 N 帧后停机(开发期离屏截图用,软件渲染跑不起持续循环)。
 * 停机后把画面转存为一张 <img> 铺在 canvas 之上 —— 离屏截图抓的是合成结果,
 * 而 WebGL 画面的合成时机不受页面控制,直接抓常得到空白;换成普通 DOM 图片
 * 即与合成时机无关,截图必定稳定。 */
if (q.has('still')) {
  let n = 0;
  const frames = Number(q.get('still')) || 8;
  onTick(() => {
    if (++n < frames) return;
    loop.stop();
    const snap = new Image();
    snap.src = renderer.domElement.toDataURL('image/png');
    snap.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:1';
    document.body.appendChild(snap);
  });
}

renderer.domElement.addEventListener('pointerdown', () => {
  if (states.get().mode === 'cruise') states.set({ mode: 'free' });
}, { once: false });

window.__pagoda = pagoda;
window.__states = states;
window.__ready = true;
