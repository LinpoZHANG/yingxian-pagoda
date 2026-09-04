/**
 * scene/sky.js —— 天空(程序化 Shader 穹顶)
 * ─────────────────────────────────────────────────────────────
 * 大半径球体 + 自定义 ShaderMaterial(BackSide):
 *   昼 —— 晋北黄土高原的暖灰蓝渐变、地平线附近的尘霭、薄云噪声;
 *   夜 —— 深蓝渐变 + 程序星点 + 月轮(方位与 lighting 的月光一致)。
 * uniform uDayNight(0..1)与灯光系统共享同一插值时钟,过渡连续。
 */

import {
  Mesh, SphereGeometry, ShaderMaterial, BackSide, Vector3, Color,
} from 'three';
import { GLOBAL } from '../data/pagodaParams.js';

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  uniform float uDayNight;      // 0 昼 → 1 夜
  uniform vec3  uSunDir;
  uniform vec3  uMoonDir;
  uniform float uTime;
  uniform vec3  uFogDay;        // 与 scene.fog / 霾带同一个颜色
  uniform vec3  uFogNight;
  /* ── 季节可调项(由 scene/seasons 写入;不接四季时保持秋季基准值) ──
   * ⚠ 这里曾经有过一对 uZenith / uHorizon:preset 写进来了,片元着色器
   *   却从来没有读过它们,于是「改配置天空不变」。这一次务必确认
   *   下面每一个 u* 都在 main() 里真的被用到 —— 写了不读等于没有旋钮。 */
  uniform vec3  uZenith;        // 昼·天顶色
  uniform vec3  uHorizon;       // 昼·地平色
  uniform float uCloudLo;       // 云的 smoothstep 下阈:越低云越实
  uniform float uCloudHi;
  uniform float uCloudCover;    // 云的混合强度
  uniform vec3  uCloudTint;     // 云色乘子(冬季偏冷、夏季偏暖)

  // 值噪声(与 materials/textures 同族,保持画面颗粒一致)
  float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
  float noise(vec3 p){
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    float n = mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                      mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                  mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                      mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
    return n;
  }
  float fbm(vec3 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);      // 0 地平线下 → 1 天顶
    float horizon = pow(1.0 - abs(d.y), 6.0);

    /* ── 昼:天顶偏冷、近地平线转暖灰(黄土扬尘) ──
     * 旧值 zenith(0.49,0.59,0.64) / horizon(0.72,0.68,0.55) + pow(h,0.78):
     * 默认机位只看到 0~20° 的天,这一段里 h 仅 0.50→0.67,
     * pow 之后色差不到 4% —— 实测天空在 y=90~192 一路是 204~205,**一片死平**。
     * 拉开两端、并把指数压到 0.42(变化更多地发生在低空可见带内)。 */
    // 天顶明确偏蓝(旧值 0.33,0.47,0.62 蓝红差只有 0.29,读出来是灰);
    // 地平仍留一点暖,但去掉黄——真正的暖色交给 0~3° 的雾色收敛带。
    // 参考实景的天空**更亮更淡**:天顶是浅蓝而非饱和蓝,近地平几乎是暖白。
    // 上一版 (0.22,0.42,0.72) 蓝得过头,实测天空亮度 181 而参考约 205。
    // 秋季基准 zenith(0.34,0.53,0.78) / horizon(0.86,0.86,0.83) 现由 uniform 供给,
    // 默认值即上述两组 —— 不接四季时画面与之前逐值相同。
    vec3 day = mix(uHorizon, uZenith, pow(h, 0.42));

    /* ── 云层 ────────────────────────────────────────────
     * 旧写法 fbm(d*3.2) 直接在方向球面上取样:云成了均匀的大团,
     * 且 smoothstep(0.08,0.34,d.y) 的遮罩在 10° 处只有 0.35、强度又只有 0.24
     * ⇒ 可见天区里最大贡献 8%,等于没有。
     * 改为投影到一张**水平云平面**上取样(d / (d.y + k)):
     * 越近地平线拉得越长、越密 —— 这一步本身就给出纵深与渐变。 */
    vec3 cp = d / max(0.16, d.y + 0.20);
    float c1 = fbm(cp * 1.35 + vec3(uTime * 0.008, 0.0, uTime * 0.004));
    float c2 = fbm(cp * 3.60 + vec3(uTime * 0.014, 0.0, -uTime * 0.006));
    float cloud = smoothstep(uCloudLo, uCloudHi, c1 * 0.70 + c2 * 0.30);
    cloud *= smoothstep(0.015, 0.13, d.y);        // 地平线一带让位给山前雾

    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    // 受光侧暖白、背光侧冷灰:秋日层积云的读法
    vec3 cloudCol = mix(vec3(0.66, 0.72, 0.82), vec3(1.00, 0.94, 0.84),
                        pow(sd, 1.4) * 0.55 + 0.26) * uCloudTint;
    day = mix(day, cloudCol, cloud * uCloudCover);

    // 太阳附近的辉光
    day += vec3(1.0, 0.76, 0.45) * pow(sd, 36.0) * 0.35;
    day += vec3(1.0, 0.82, 0.55) * pow(sd, 5.0) * 0.10;

    /* ── 夜:深蓝渐变 + 星点 + 月轮 ── */
    vec3 nightZenith  = vec3(0.030, 0.048, 0.105);
    vec3 nightHorizon = vec3(0.085, 0.098, 0.150);
    vec3 night = mix(nightHorizon, nightZenith, pow(h, 0.7));
    // 星:高频噪声取阈值,越近天顶越密(近地平线为尘霭吞没)
    float st = hash(floor(d * 300.0));
    float star = smoothstep(0.9955, 0.9990, st) * smoothstep(0.01, 0.30, d.y);
    star *= 0.65 + 0.35 * sin(uTime * 2.0 + st * 90.0);   // 微闪
    night += vec3(0.92, 0.95, 1.0) * star * 1.6;
    // 月轮 + 月晕
    float md = max(dot(d, normalize(uMoonDir)), 0.0);
    night += vec3(0.86, 0.90, 1.0) * smoothstep(0.99955, 0.99975, md) * 1.4;
    night += vec3(0.40, 0.52, 0.78) * pow(md, 90.0) * 0.35;
    // 云在夜里遮星、并被月光染出一点冷白 —— 与昼用同一片云,昼夜切换时不跳
    night = mix(night, vec3(0.10, 0.12, 0.18) + vec3(0.16, 0.19, 0.26) * pow(md, 1.2),
                cloud * uCloudCover * 0.89);   // 0.55/0.62:与昼保持同一比例

    vec3 col = mix(day, night, uDayNight);

    /* ── 天—地接缝 ──────────────────────────────────────────
     * 旧写法是 col *= 1 − horizon*0.16:把地平线**压暗**。
     * 但地面那一侧是 FogExp2 淡出到雾色的**亮**边,一暗一亮,
     * 于是交界处永远有一道生硬的线。
     * 改为让天空在地平线附近**收敛到同一个雾色** ——
     * 地面淡出到雾色、天空也落到雾色,两边取到同一个值,接缝在数值上消失,
     * 只剩一片连续的山前雾。0.16 rad ≈ 9°,正好盖住远山所在的高度带。 */
    vec3 fogC = mix(uFogDay, uFogNight, uDayNight);
    // 带宽必须窄于远山的高度带:远山峰顶在 6.2°(d.y≈0.108),
    // 收敛带若盖到那里,山与天同色 —— 接缝是没了,山也没了(第一版即如此)。
    // 0.052 rad ≈ 3°,只吃掉地平线本身。
    float toHorizon = 1.0 - smoothstep(-0.030, 0.052, d.y);
    col = mix(col, fogC, toHorizon * 0.86);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * 天空的**秋季基准**。uniform 的默认值与 scene/seasons 的 autumn 列共用这一份 ——
 * 不是抄两遍。手抄基准值出过事:四季表里秋季日仰角抄成 18.3(真值 18.326801),
 * 0.027° 的偏转让阴影边缘挪了 145 个像素。基准列必须是「引」不是「抄」。
 */
export const SKY_BASE = {
  zenith: [0.34, 0.53, 0.78],
  horizon: [0.86, 0.86, 0.83],
  cloudLo: 0.44,
  cloudHi: 0.76,
  cloudCover: 0.62,
  cloudTint: [1.0, 1.0, 1.0],
};

export function createSky(scene, preset = null) {
  // 天顶/地平色写死在下面的 GLSL 里(dayZenith / dayHorizon / nightZenith / nightHorizon)。
  // 曾有一对 uZenith / uHorizon uniform 由 preset 写入,但片元着色器从来没读过它们 ——
  // 于是「改 EnvironmentConfig.skyZenith 天空不变」。uniform 与 applyPreset 已删,
  // 要调天色请直接改 GLSL 常量。preset 在这里只提供太阳与月亮方位。
  const envPreset = preset ?? {
    sunDirection: new Vector3(0.55, 0.62, 0.56).normalize(),
    moonDirection: new Vector3(-0.42, 0.70, 0.38).normalize(),
  };

  const mat = new ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    side: BackSide, depthWrite: false, fog: false,
    uniforms: {
      uDayNight: { value: 0 },
      uSunDir: { value: envPreset.sunDirection.clone().normalize() },
      uMoonDir: { value: envPreset.moonDirection.clone().normalize() },
      uTime: { value: 0 },
      uFogDay: { value: new Color(0xc8bea7) },
      uFogNight: { value: new Color(0x0e1524) },
      // ↓ 秋季基准(= 接四季之前写死在 GLSL 里的那组值),与四季表同源
      uZenith: { value: new Vector3(...SKY_BASE.zenith) },
      uHorizon: { value: new Vector3(...SKY_BASE.horizon) },
      uCloudLo: { value: SKY_BASE.cloudLo },
      uCloudHi: { value: SKY_BASE.cloudHi },
      uCloudCover: { value: SKY_BASE.cloudCover },
      uCloudTint: { value: new Vector3(...SKY_BASE.cloudTint) },
    },
  });
  const dome = new Mesh(new SphereGeometry(GLOBAL.totalHeight * 22, 48, 32), mat);
  dome.name = 'sky';
  dome.frustumCulled = false;
  // 穹顶不写深度,但**必须排在不透明队列最前**:否则任何 renderOrder 更小、
  // 且比穹顶半径(H×22 ≈ 1.48 km)更远的物体会被它覆写 ——
  // 旧的 ground.createDistantMountains(r = 1.7 km, renderOrder −6)正是这样被抹掉的。
  dome.renderOrder = -1000;
  scene.add(dome);

  return {
    /** t: 0 昼 → 1 夜(与 lighting 同一插值时钟) */
    setDayNight(t) { mat.uniforms.uDayNight.value = t; },
    /** 地平线收敛色:必须与 scene.fog.color / 霾带同源,否则接缝会重新出现 */
    setFogColor(dayC, nightC) {
      if (dayC) mat.uniforms.uFogDay.value.set(dayC);
      if (nightC) mat.uniforms.uFogNight.value.set(nightC);
    },
    /** 与 lighting 的太阳方向保持一致,天光与照明不脱节 */
    setSunDir(v) { mat.uniforms.uSunDir.value.copy(v).normalize(); },
    /**
     * 供 scene/seasons 写入昼态天色与云量。不调用时保持秋季基准。
     * 只写**昼**的一端 —— 夜色仍是 GLSL 里的 nightZenith/nightHorizon,
     * 昼夜的 mix 在着色器内部完成,四季与昼夜互不覆写。
     */
    setSeasonSky({ zenith, horizon, cloudLo, cloudHi, cloudCover, cloudTint } = {}) {
      const u = mat.uniforms;
      if (zenith) u.uZenith.value.set(zenith[0], zenith[1], zenith[2]);
      if (horizon) u.uHorizon.value.set(horizon[0], horizon[1], horizon[2]);
      if (cloudLo != null) u.uCloudLo.value = cloudLo;
      if (cloudHi != null) u.uCloudHi.value = cloudHi;
      if (cloudCover != null) u.uCloudCover.value = cloudCover;
      if (cloudTint) u.uCloudTint.value.set(cloudTint[0], cloudTint[1], cloudTint[2]);
    },
    tick(dt) { mat.uniforms.uTime.value += dt; },
    dispose() { mat.dispose(); dome.geometry.dispose?.(); },
    mesh: dome,
  };
}
