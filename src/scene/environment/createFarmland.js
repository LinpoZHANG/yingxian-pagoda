import { Group, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3, Color } from 'three';
import { GLOBAL } from '../../data/pagodaParams.js';

function valueNoise(x, z, seed) {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function createFarmland({
  towerHeight = GLOBAL.totalHeight,
  seed = 22.2,
  palette = ['#bca976', '#a8986b', '#8a8468', '#c6b58b'],
  maxCount = 420,
} = {}) {
  const group = new Group();
  group.name = 'farmland-patches';

  const geometry = new PlaneGeometry(18, 12);
  const material = new MeshStandardMaterial({
    color: new Color(palette[0]),
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.96,
  });

  const fields = new InstancedMesh(geometry, material, maxCount);
  fields.name = 'field-patches';

  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  const up = new Vector3(0, 1, 0);

  let count = 0;
  const ringRadius = towerHeight * 18;
  for (let i = 0; i < maxCount && count < maxCount; i++) {
    const angle = valueNoise(i, seed, 12.1) * Math.PI * 2;
    const radius = ringRadius * (0.65 + valueNoise(i * 1.7, seed + 4.2, 8.4) * 0.9);
    const x = Math.sin(angle) * radius + (valueNoise(i + seed, 1.2, 5.1) - 0.5) * 70;
    const z = Math.cos(angle) * radius + (valueNoise(i + 5.7, seed * 2.3, 4.7) - 0.5) * 70;

    const distFromTower = Math.hypot(x, z);
    if (distFromTower < towerHeight * 8) continue;
    if (distFromTower > towerHeight * 35) continue;

    const localSeed = valueNoise(i + seed, 3.1, 33.3);
    const w = 18 + localSeed * 34;
    const d = 12 + valueNoise(i * 1.3, seed + 18.7, 22.7) * 22;
    const y = 0.08 + (valueNoise(i, seed + 29.1, 6.2) - 0.5) * 0.2;
    const rot = valueNoise(i + 9.1, seed + 19.3, 13.8) * Math.PI;

    q.setFromAxisAngle(up, rot);
    p.set(x, y, z);
    s.set(w, 0.1, d);
    m.compose(p, q, s);
    fields.setMatrixAt(count, m);
    fields.setColorAt(count, new Color(palette[count % palette.length]));
    count++;
  }

  fields.count = count;
  group.add(fields);

  /* 季节:换季时按新调色板重写 instanceColor。
   * 不走 material.color —— 那是**乘**在 instanceColor 上的,乘不出雪白。
   * 两处防浪费:
   *   · 门控在 blend 的 0.01 粒度。相邻两季的最大通道差约 0x1f(31),
   *     0.01×31 < 1,在 8 bit 上不足一个最低位,看不出台阶;
   *     一次过渡重写 ~100 次,而不是每帧一次。
   *   · 调色板只在 key 变化时解析成 Color,不在 420 格的循环里 new。 */
  const tmp = new Color();
  const paletteCache = new Map();
  const parse = (arr) => {
    let v = paletteCache.get(arr);
    if (!v) { v = arr.map((h) => new Color(h)); paletteCache.set(arr, v); }
    return v;
  };
  let lastKey = null;

  return {
    group,
    /**
     * 供 scene/seasons:两季调色板 + 混合量。不调用时保持秋季基准(= 构造时的 palette)。
     * @param {{from:string[], to:string[], blend:number}} p
     */
    setSeason({ from, to, blend = 0 } = {}) {
      if (!from) return;
      const dst = to ?? from;
      const key = `${from[0]}|${dst[0]}|${blend.toFixed(2)}`;
      if (key === lastKey) return;
      lastKey = key;
      const a = parse(from), b = parse(dst);
      for (let i = 0; i < count; i++) {
        tmp.copy(a[i % a.length]).lerp(b[i % b.length], blend);
        fields.setColorAt(i, tmp);
      }
      if (fields.instanceColor) fields.instanceColor.needsUpdate = true;
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
