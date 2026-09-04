/**
 * scene/environment/createOutlyingHamlets.js —— 城外村落
 * ─────────────────────────────────────────────────────────────
 * 空间递进里「农田水系」那一档的居民点:城墙(ground.js,±315/±230)之外、
 * 山前雾之内,散落的小聚落。
 *
 * 原先这里叫 createCityWall,做了**第二道城墙**(r ≈ 518)——
 * 与 ground.js 的真城墙重复,且外圈那 90 个建筑是**没有屋顶的裸方块**,
 * 远景里一眼就是「简陋」。现在:去掉重复的墙,方块按三五成群聚成村落,
 * 每栋加悬山顶,屋顶用与城内一致的青灰瓦色,聚落之间留出田地。
 */
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Color, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { GLOBAL } from '../../data/pagodaParams.js';

function valueNoise(x, z, seed) {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** 悬山顶:两坡 + 正脊 + 两山面,四面出檐;单位尺度,由 instance 矩阵缩放。
 *  与 scene/ground.js 的同名函数同一套形制(正脊沿面阔、四面出檐)——
 *  两处都改过一次:旧版正脊沿进深走,等于把屋顶转了 90°。 */
function gableRoofGeometry() {
  const EX = 0.58, EZ = 0.58, RW = 0.055, RY = 0.34;
  const p = [
    -EX, 0, EZ,   EX, 0, EZ,   EX, RY, RW,
    -EX, 0, EZ,   EX, RY, RW,  -EX, RY, RW,
    EX, 0, -EZ,  -EX, 0, -EZ,  -EX, RY, -RW,
    EX, 0, -EZ,  -EX, RY, -RW,  EX, RY, -RW,
    -EX, RY, -RW,  -EX, RY, RW,   EX, RY, RW,
    -EX, RY, -RW,   EX, RY, RW,   EX, RY, -RW,
    EX, 0, EZ,   EX, 0, -EZ,  EX, RY, -RW,
    EX, 0, EZ,   EX, RY, -RW, EX, RY, RW,
    -EX, 0, -EZ, -EX, 0, EZ,  -EX, RY, RW,
    -EX, 0, -EZ, -EX, RY, RW, -EX, RY, -RW,
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

export function createOutlyingHamlets({
  towerHeight = GLOBAL.totalHeight,
  seed = 88.2,
  wallColor = '#b09877',
  roofColor = '#84877f',      // 与夯土墙差 22(旧值差 46,太扎眼)
  yardColor = '#a28f70',
} = {}) {
  const group = new Group();
  group.name = 'outlying-hamlets';

  const MAX = 260;
  const boxGeo = new BoxGeometry(1, 1, 1);
  const roofGeo = gableRoofGeometry();
  const houses = new InstancedMesh(boxGeo, new MeshStandardMaterial({ color: new Color(wallColor), roughness: 0.96 }), MAX);
  const roofs = new InstancedMesh(roofGeo, new MeshStandardMaterial({ color: new Color(roofColor), roughness: 0.94 }), MAX);
  const yards = new InstancedMesh(boxGeo, new MeshStandardMaterial({ color: new Color(yardColor), roughness: 0.98 }), MAX);
  houses.name = 'hamlet-walls';
  roofs.name = 'hamlet-gable-roofs';
  yards.name = 'hamlet-yard-walls';

  const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3();
  const up = new Vector3(0, 1, 0);
  let hc = 0, yc = 0;

  const put = (mesh, i, x, y, z, w, h, d, rot) => {
    q.setFromAxisAngle(up, rot); p.set(x, y, z); sc.set(w, h, d);
    m.compose(p, q, sc); mesh.setMatrixAt(i, m);
  };

  // 24 个聚落,每个 3~7 栋 —— 三五成群才像村子,均匀撒点只是噪声
  for (let v = 0; v < 24; v++) {
    const a = valueNoise(v, seed + 7.5, 14.7) * Math.PI * 2;
    const r = towerHeight * (7.4 + valueNoise(v + 3.4, seed + 8.2, 12.6) * 11.5);
    const cx = Math.sin(a) * r, cz = Math.cos(a) * r;
    if (Math.hypot(cx, cz) < towerHeight * 6.2) continue;
    const rot = valueNoise(v + 9.3, seed + 22.3, 17.9) * Math.PI;
    const n = 3 + Math.floor(valueNoise(v + 1.7, seed + 3.1, 5.5) * 5);

    for (let i = 0; i < n && hc < MAX; i++) {
      const ox = (valueNoise(v * 9 + i, seed + 5.7, 9.7) - 0.5) * 62;
      const oz = (valueNoise(v * 9 + i + 40, seed + 11.3, 10.9) - 0.5) * 52;
      const x = cx + ox, z = cz + oz;
      const w = 7 + valueNoise(v * 9 + i, seed + 2.2, 6.1) * 7;
      const d = 6 + valueNoise(v * 9 + i + 80, seed + 4.4, 7.3) * 6;
      const h = 2.6 + valueNoise(v * 9 + i + 120, seed + 13.8, 13.1) * 1.4;
      put(houses, hc, x, h * 0.5, z, w, h, d, rot);
      // 檐口坐在墙顶上(旧值 h + 0.12 让屋顶悬空);举高按进深走,坡度才恒定
      put(roofs, hc, x, h - 0.05, z, w * 0.98, d * 0.30 / 0.34, d * 1.06, rot);
      hc++;
      if (yc < MAX && valueNoise(v * 9 + i + 200, seed + 6.6, 8.8) > 0.45) {
        put(yards, yc++, x + (w * 0.9), 0.6, z, 0.5, 1.2, d * 1.6, rot);
      }
    }
  }
  houses.count = roofs.count = hc;
  yards.count = yc;
  for (const mesh of [houses, roofs, yards]) { mesh.castShadow = false; mesh.receiveShadow = false; }
  group.add(yards, houses, roofs);

  return {
    group,
    dispose() {
      boxGeo.dispose(); roofGeo.dispose();
      houses.material.dispose(); roofs.material.dispose(); yards.material.dispose();
    },
  };
}
