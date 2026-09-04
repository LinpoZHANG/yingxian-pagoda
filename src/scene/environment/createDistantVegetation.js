import { CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, Color } from 'three';
import { GLOBAL } from '../../data/pagodaParams.js';

function valueNoise(x, z, seed) {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function createDistantVegetation({
  towerHeight = GLOBAL.totalHeight,
  seed = 44.3,
  treeColors = ['#5d6d50', '#7c7a4b', '#7e6d4e'],
} = {}) {
  const group = new Group();
  group.name = 'distant-vegetation';

  const trunkGeometry = new CylinderGeometry(0.15, 0.23, 1.8, 6);
  const crownGeometry = new CylinderGeometry(0.9, 1.5, 2.2, 8, 1, true);
  const trunkMaterial = new MeshStandardMaterial({ color: new Color('#564735'), roughness: 1 });
  const crownMaterial = new MeshStandardMaterial({ color: new Color(treeColors[0]), roughness: 1 });

  const trunkMesh = new InstancedMesh(trunkGeometry, trunkMaterial, 180);
  const crownMesh = new InstancedMesh(crownGeometry, crownMaterial, 180);
  trunkMesh.name = 'sparse-distant-trunks';
  crownMesh.name = 'sparse-distant-crowns';

  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  const up = new Vector3(0, 1, 0);

  let trunkCount = 0;
  let crownCount = 0;
  for (let i = 0; i < 180; i++) {
    const angle = valueNoise(i, seed + 1.2, 12.1) * Math.PI * 2;
    const radius = towerHeight * (7.5 + valueNoise(i + 4.0, seed + 2.2, 7.7) * 11.4);
    const x = Math.sin(angle) * radius + (valueNoise(i + 4.4, seed + 9.4, 9.1) - 0.5) * 42;
    const z = Math.cos(angle) * radius + (valueNoise(i + 8.8, seed + 5.3, 8.1) - 0.5) * 42;
    if (Math.hypot(x, z) < towerHeight * 5) continue;

    const height = 1.1 + valueNoise(i + 6.7, seed + 7.2, 11.3) * 1.7;
    q.setFromAxisAngle(up, valueNoise(i + 2.8, seed + 18.5, 15.4) * Math.PI * 2);
    p.set(x, 0.8, z);
    s.set(1, height, 1);
    m.compose(p, q, s);
    trunkMesh.setMatrixAt(trunkCount++, m);

    p.set(x, height + 0.6, z);
    s.set(1.8 + valueNoise(i + 11.4, seed + 27.7, 6.4), 1.05 + valueNoise(i + 22.9, seed + 18.2, 9.5), 1.8 + valueNoise(i + 14.5, seed + 21.5, 8.3));
    m.compose(p, q, s);
    crownMesh.setMatrixAt(crownCount++, m);
  }

  trunkMesh.count = trunkCount;
  crownMesh.count = crownCount;
  group.add(trunkMesh, crownMesh);

  return {
    group,
    /**
     * 供 scene/seasons:树冠与树干的季节色。不调用时保持秋季基准
     * (= treeColors[0] 与 '#564735',即构造时的值)。
     * 只换色不换形:改冠幅要重写 instanceMatrix,而过渡是连续的,
     * 每帧重写 180 个矩阵不划算 —— 冬季的落叶感交给**降饱和 + 压暗**。
     */
    setSeason({ crownFrom, crownTo, trunkFrom, trunkTo, blend = 0 } = {}) {
      if (crownFrom) crownMaterial.color.copy(crownFrom).lerp(crownTo ?? crownFrom, blend);
      if (trunkFrom) trunkMaterial.color.copy(trunkFrom).lerp(trunkTo ?? trunkFrom, blend);
    },
    dispose() {
      trunkGeometry.dispose(); crownGeometry.dispose();
      trunkMaterial.dispose(); crownMaterial.dispose();
    },
  };
}
