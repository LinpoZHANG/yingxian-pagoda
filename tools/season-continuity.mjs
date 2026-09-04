// 连续性审计:用**真的** SeasonSystem 配假通道跑一圈四季,
// 把每一路写出的值逐步记下,查相邻步之间的跳变。
// 不复刻公式 —— 复刻公式验公式,验的是复刻。
import { createSeasonSystem } from '../src/scene/seasons/SeasonSystem.js';
import { TURNS_PER_SEASON } from '../src/scene/seasons/SeasonConfig.js';
import { PARTICLE_PRESETS } from '../src/scene/seasons/createSeasonParticles.js';
import { Color } from 'three';
// 端点(from/to)在交界处必然换手,记它们只会记出假跳变。
// 要记的是**解出来的结果**:lerp(from, to, blend)。
const T = new Color();
const resolved = (from, to, k) => T.copy(from).lerp(to ?? from, k ?? 0);

const rec = {};
const put = (k, v) => { if (v != null && Number.isFinite(v)) rec[k] = v; };
// 带门限的量(如雪线:只在有雪时才有意义)门限一关就要**删掉**,
// 否则留着的陈值会在门限重开的那一帧记出一次假跳变 ——
// 一个每次都误报的审计工具,用不了几次就会被养成无视。
const drop = (k) => { delete rec[k]; };
const putC = (k, c) => { if (c) { rec[k + '.r'] = c.r; rec[k + '.g'] = c.g; rec[k + '.b'] = c.b; } };
const put3 = (k, a) => { if (a) a.forEach((v, i) => put(k + i, v)); };

const sky = {
  setSeasonSky(p) { put3('sky.zenith', p.zenith); put3('sky.horizon', p.horizon);
    put('sky.cloudLo', p.cloudLo); put('sky.cloudHi', p.cloudHi);
    put('sky.cover', p.cloudCover); put3('sky.tint', p.cloudTint); },
  setFogColor(c) { putC('sky.fog', c); },
};
const ground = {
  setSeasonFog(p) { putC('fog.color', p.color); put('fog.density', p.density); },
  setSeasonGround(p) { putC('gnd.tint', p.tint); put('gnd.amt', p.amt); putC('gnd.field', p.fieldTint);
    put('gnd.fieldAmt', p.fieldAmt); putC('gnd.crown', p.crownTint); put('gnd.crownAmt', p.crownAmt);
    put('gnd.snow', p.snow); },
};
const horizon = {
  setSeasonDay(p) {
    putC('hz.ridge', p.ridgeHaze);
    put('hz.scrubAmt', p.scrubAmt); put('hz.bloomAmt', p.bloomAmt);
    put('hz.snowAmt', p.snowAmt);
    // 雪线只在真有雪时才有意义 —— 雪量为 0 时它是什么值都不影响画面
    if (p.snowAmt > 0.002) put('hz.snowLine', p.snowLine); else drop('hz.snowLine');
    putC('hz.rockLit', resolved(p.rockLitFrom, p.rockLitTo, p.blend));
    putC('hz.rockShd', resolved(p.rockShadowFrom, p.rockShadowTo, p.blend));
    putC('hz.loessLit', resolved(p.loessLitFrom, p.loessLitTo, p.blend));
    putC('hz.scrub', resolved(p.scrubFrom, p.scrubTo, p.blend));
    putC('hz.bloom', resolved(p.bloomFrom, p.bloomTo, p.blend));
    putC('hz.mist', p.mistFrom); putC('hz.glow', p.glowFrom);
  },
};
const lighting = {
  setSeasonDay(p) { put('lt.sunI', p.sunIntensity); put('lt.hemiI', p.hemiIntensity);
    put('lt.ambI', p.ambientIntensity); putC('lt.sunC', p.sunColor);
    putC('lt.hemiSky', p.hemiSky);
    putC('lt.hemiGnd', resolved(p.hemiGround, p.hemiGroundTo, p.blend));
    putC('lt.amb', p.ambient);
    if (p.sunDir) { put('lt.sunY', p.sunDir.y); put('lt.sunX', p.sunDir.x); } },
};
// 粒子同理:记解出来的形态参数,不记 blend
const particles = { setSeason(p) {
  const A = PARTICLE_PRESETS[p.from] ?? PARTICLE_PRESETS.none;
  const B = PARTICLE_PRESETS[p.to] ?? PARTICLE_PRESETS.none;
  const k = p.blend ?? 0;
  const L = (key, dflt = 0) => (A[key] ?? dflt) + ((B[key] ?? dflt) - (A[key] ?? dflt)) * k;
  for (const key of ['opacity', 'fall', 'drift', 'size', 'axisX', 'soft', 'spin', 'slant', 'notch']) put('pt.' + key, L(key));
  put('pt.count', Math.max(L('count'), Math.min(A.count, B.count)));
} };
const warSmoke = { setWar(v) { put('war', v); } };
const farmland = { setSeason(p) { put('fm.amt', p.amt); } };
const vegetation = { setSeason(p) { put('vg.amt', p.amt); } };

const sys = createSeasonSystem({ sky, ground, horizon, lighting, particles, warSmoke, farmland, vegetation });

const TURN_SEC = 30, DT = 1 / 30;          // 30 fps
const STEP_TURNS = DT / TURN_SEC;
const jumps = {}, range = {};
let prev = null, prevT = 0;
const SPAN = TURNS_PER_SEASON * 4 * 2;      // 两整年
for (let turns = 0; turns <= SPAN; turns += STEP_TURNS) {
  sys.setTurns(turns); sys.apply();
  const cur = { ...rec };
  if (prev) {
    for (const k of Object.keys(cur)) {
      if (typeof cur[k] !== 'number') continue;
      if (!(k in prev)) continue;          // 上一帧没有这一路 ⇒ 无从比较,不是跳变
      const d = Math.abs(cur[k] - prev[k]);
      if (!(k in jumps) || d > jumps[k].d) jumps[k] = { d, t: turns * TURN_SEC };
      const r = range[k] ?? (range[k] = { lo: cur[k], hi: cur[k] });
      r.lo = Math.min(r.lo, cur[k]); r.hi = Math.max(r.hi, cur[k]);
    }
  }
  prev = cur; prevT = turns;
}
/* 判据不能用绝对值 —— 不同通道的量纲差着几个数量级(雪线是米、不透明度是 0~1)。
 * 真正的问题是「一帧走完了这条通道全程的多大比例」:
 * 过渡窗口 1.8 s @30 fps = 54 帧,匀速时单帧占 1/54 ≈ 1.9%;
 * smoothstep 的峰值速率是匀速的 1.5 倍 ⇒ 正常上限约 2.8%。留一倍余量,>6% 判为跳变。 */
const rows = Object.entries(jumps).map(([k, v]) => {
  const r = range[k], span = Math.max(1e-9, r.hi - r.lo);
  return [k, { ...v, frac: v.d / span, span }];
}).sort((a, b) => b[1].frac - a[1].frac);
console.log(`逐帧(30 fps)最大单帧跳变,一季 = ${TURNS_PER_SEASON * TURN_SEC}s,共跑两年:\n`);
// 一帧内的正常变化上限:过渡窗口 1.8 s @30 fps = 54 帧,单帧最多走 1/54 ≈ 0.019
// 再留一倍余量,>0.05 才算跳变
console.log('  通道'.padEnd(20), '单帧/全程'.padStart(10), '   最大跳变'.padStart(12), '  发生在');
let bad = 0;
for (const [k, v] of rows.slice(0, 12)) {
  const isBad = v.frac > 0.06; if (isBad) bad++;
  console.log('  ' + k.padEnd(18), (v.frac * 100).toFixed(1).padStart(9) + '%',
    v.d.toFixed(4).padStart(12), `  t=${v.t.toFixed(2)}s` + (isBad ? '   ← 跳变' : '   ok'));
}
console.log(`\n共 ${rows.length} 条通道,判为跳变的:${rows.filter((r) => r[1].frac > 0.06).length} 条`);
