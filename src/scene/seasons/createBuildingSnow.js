/**
 * scene/seasons/createBuildingSnow.js —— 巡航四季:建筑积雪
 * ═════════════════════════════════════════════════════════════
 * 给木塔(以及任何登记进来的材质)加一层**按朝向**的积雪。
 *
 * ★ 为什么是着色器混合,不是生成几何
 *   壳体外扩会把翼角撑胖、draw call 翻倍 —— 而翼角轮廓恰恰是不能动的。
 *   烘焙贴图也不行:塔是程序生成的,UV 按面归一化,没有统一 UV 集。
 *   在片元里按**世界法线**混一层白,是唯一既不动几何又不动 UV 的做法;
 *   而且因为是**混合**不是覆盖,瓦垄的法线贴图仍在参与光照,纹理不会被吃掉。
 *
 * ★ 朝向遮罩自带正确性
 *   `smoothstep(uLo, uHi, N.y)` 一条就同时满足了:
 *   正脊/垂脊/栏杆顶面/台阶/月台**积雪**,而檐下、斗栱底面、立柱侧面**不积雪**
 *   —— 后者的法线朝下或水平,遮罩天然为 0,不需要任何人工标注。
 *
 * ★ 与 setWoodFade / setTileFade 共存
 *   那两个函数会改 transparent/opacity 并置 needsUpdate,触发重编译、
 *   onBeforeCompile 会再跑一次。uniform 是**按引用共享**的同一个对象,
 *   重编译后依然指向它,所以不会失联。
 *
 * ★ 开销
 *   `if (uSnowAmt > 0.001)` 是 uniform 分支,整个 draw call 内一致,
 *   非冬季三季 GPU 代价可忽略;冬季多两次噪声取样。
 */

import { Color, Vector2 } from 'three';

const VERT_HEAD = /* glsl */`
  varying vec3 vSnowN;
  varying vec3 vSnowP;
`;

/* objectNormal 在 <beginnormal_vertex> 里声明,transformed 在 <begin_vertex> 里;
 * 实例化的位移与旋转由 instanceMatrix 承担,必须自己乘上 —— 城坊民宅是 InstancedMesh。 */
const VERT_BODY = /* glsl */`
  vec3 snowObjN = objectNormal;
  vec4 snowObjP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    snowObjN = mat3(instanceMatrix) * snowObjN;
    snowObjP = instanceMatrix * snowObjP;
  #endif
  vSnowN = normalize(mat3(modelMatrix) * snowObjN);
  vSnowP = (modelMatrix * snowObjP).xyz;
`;

const FRAG_HEAD = /* glsl */`
  varying vec3 vSnowN;
  varying vec3 vSnowP;
  uniform float uSnowAmt;      // 0 = 无雪,1 = 满覆
  uniform vec3  uSnowColor;
  uniform vec2  uSnowWind;     // 迎风方向(世界 XZ),迎风面被吹蚀
  uniform float uSnowLo;       // 朝上遮罩的下阈(法线 y)
  uniform float uSnowHi;

  float bsHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float bsNoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(bsHash(i), bsHash(i+vec2(1,0)), f.x),
               mix(bsHash(i+vec2(0,1)), bsHash(i+vec2(1,1)), f.x), f.y);
  }
`;

const FRAG_BODY = /* glsl */`
  if (uSnowAmt > 0.001) {
    vec3 sN = normalize(vSnowN);
    // 朝上才积雪 —— 檐下、斗栱底面、柱侧的法线朝下或水平,这一项自动为 0
    float up = smoothstep(uSnowLo, uSnowHi, sN.y);
    // 迎风面吹蚀:水平分量指向来风的那一侧留不住雪
    float face = dot(normalize(sN.xz + vec2(1e-5)), uSnowWind);
    float wind = 1.0 - 0.45 * max(0.0, face) * (1.0 - up * 0.5);
    /* 斑驳:两个尺度。0.35 m 那层给瓦垄之间的疏密,3.2 m 那层给「这一坡厚、那一坡薄」。
     * 都不细过瓦垄本身,否则读作噪点而不是雪。 */
    float mot = bsNoise(vSnowP.xz * 2.9 + vSnowP.y * 0.7) * 0.45
              + bsNoise(vSnowP.xz * 0.31) * 0.55;
    /* ★ 覆盖率:下限 0.55 —— 最薄处也有过半的白,**不露底**。
     * 这一版曾被改成 smoothstep(0.31~0.39, …) 以求「有的地方漏出底色」,
     * 试到 露底 24% 与 8% 两档,用户裁定**回到满覆**:
     * 屋面通体是雪,厚薄的层次由 0.55~1.3 的渐变(clamp 到 1)给,不靠露出瓦色。 */
    float cover = up * wind * (0.55 + 0.75 * mot);
    // 近乎水平的顶面(正脊、栏杆顶、台阶)再补一档,让脊线读得出来
    cover += smoothstep(0.93, 0.995, sN.y) * 0.45;
    diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor,
                           clamp(cover * uSnowAmt, 0.0, 1.0));
  }
`;

export function createBuildingSnow({
  color = '#e9eef4',
  wind = [-0.80, 0.60],
  lo = 0.34,
  hi = 0.76,
} = {}) {
  const w = Math.hypot(wind[0], wind[1]) || 1;
  const shared = {
    uSnowAmt: { value: 0 },
    uSnowColor: { value: new Color(color) },
    uSnowWind: { value: new Vector2(wind[0] / w, wind[1] / w) },
  };
  /* 两套朝向阈值,**共用同一个 uSnowAmt 对象**(按引用),所以季节时钟只写一处。
   *
   *  flat —— 屋面、台基、月台这类有**面**的构件。
   *  top  —— 勾阑。**只认真正水平的顶面**:寻杖顶、横栏顶、望柱帽。
   *          曾经试过反方向的 wrap 档(下阈推到 −0.30,让竖直面也吃 44% 的雪,
   *          以求细杆上的雪帽有宽度)—— 结果整圈栏杆糊成全白,被用户否掉:
   *          「仅应该更改横向构件上的平面」。
   *          所以这一档比 flat 更**严**:N.y < 0.80 一律为 0,望柱侧、格条侧全部干净。 */
  const profiles = {
    flat: { ...shared, uSnowLo: { value: lo }, uSnowHi: { value: hi } },
    top: { ...shared, uSnowLo: { value: 0.80 }, uSnowHi: { value: 0.94 } },
  };
  const uniforms = profiles.flat;
  const registered = new Set();

  /** 把一批材质接进来。重复登记无害(Set 去重) */
  function register(materials, { profile = 'flat' } = {}) {
    const u = profiles[profile] ?? profiles.flat;
    for (const m of materials) {
      if (!m || registered.has(m)) continue;
      registered.add(m);
      m.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, u);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
          .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
          .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_BODY}`);
      };
      // 已经编译过的材质要强制重编译,否则这一次登记不生效
      m.needsUpdate = true;
    }
  }

  return {
    register,
    /** t: 0 无雪 → 1 满覆。0 时着色器整段跳过 */
    setSnow(t) { shared.uSnowAmt.value = Math.max(0, Math.min(1, t)); },
    get amount() { return shared.uSnowAmt.value; },
    get count() { return registered.size; },
    uniforms: shared,
  };
}
