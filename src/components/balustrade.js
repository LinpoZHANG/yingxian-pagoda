/**
 * components/balustrade.js —— 平座与勾阑(暗层外观)
 * ─────────────────────────────────────────────────────────────
 * 暗层的外观表达:平座铺作承挑的外廊(平座板)+ 勾阑(栏杆):
 *   望柱 / 寻杖 / 盆唇 / 华板(以蜀柱格条表达,不做镂空贴图)。
 * 「明五暗四」的暗层节奏,在外观上正是靠平座与勾阑读出来的,
 * 故平座外缘半径直接取实测剪影 VERTICAL.pingzuo[i].w/2,不另设数。
 *
 * 性能:望柱与格条 InstancedMesh。
 */

import {
  Group, Mesh, BoxGeometry, InstancedMesh, Object3D, Vector3,
} from 'three';
import { fen, SECTION } from '../data/caifen.js';
import { PINGZUO } from '../data/pagodaParams.js';
import { WOOD } from '../materials/wood.js';
import {
  OCT_N, octagonPrism, octagonRing, faceAngle, apothem, polar, edgeLength,
} from '../assembly/octagon.js';

/**
 * 平座楼板:八角板,坐平座铺作之上;`openR` 给定时中间挖空成环板。
 *
 * ★ 注释与实现曾经不一致:抬头写「八角**环板**」,代码却是实心八角棱柱,
 *   一路铺到塔心。于是一层佛堂的上空被一张满铺的盖子封死 ——
 *   十一米的大佛顶着天花板(第35轮用户圈出)。资料方裁定:
 *   **内槽梁圈出的那一块是通高的,没有天花板**。故本函数补 `openR`,
 *   由放样侧决定哪一层开洞;不给就是满铺,行为与从前一致。
 *
 * @param {number} outerR 平座外缘外接半径(取实测剪影)
 * @param {number} y      平座面标高(板上皮)
 * @param {number} [openR] 洞口外接半径(= 该层内槽半径);省略即满铺
 */
export function buildPingzuo({ outerR, y, level = 0, openR = 0 }) {
  const g = new Group();
  g.name = `pingzuo_L${level}`;
  const th = fen(SECTION.pingzuoDeck);
  const R = outerR + PINGZUO.deckOverhang;
  const deck = new Mesh(
    openR > 0 ? octagonRing(R, openR, th) : octagonPrism(R, R, th),
    WOOD.trim,
  );
  deck.position.y = y - th / 2;
  deck.castShadow = deck.receiveShadow = true;
  deck.userData = { partKey: 'pingzuo', level, type: 'pingzuo' };
  g.add(deck);
  g.userData = { partKey: 'pingzuo', level, type: 'pingzuo' };
  return g;
}

/**
 * 勾阑(重台勾阑简化):望柱 → 华板格条 → 盆唇 → 寻杖。
 * 高度取 SECTION.gouLanH [法]四尺;望柱按每间等分,分格数取 PINGZUO.panelsPerBay。
 */
export function buildBalustrade({ outerR, y, level = 0 }) {
  const g = new Group();
  g.name = `balustrade_L${level}`;
  const H = fen(SECTION.gouLanH);
  const wz = fen(SECTION.wangZhu);
  const xz = fen(SECTION.xunZhang);
  const R = outerR - PINGZUO.railInset;
  const apo = apothem(R);
  const edge = edgeLength(R);
  const bays = 3;                                // 每面 3 间(与柱网分间一致)
  const perFace = bays;                          // 望柱按间设,每面 3 根 + 转角共用

  /* 望柱:八角每个转角 + 每面等分点 */
  const posts = [];
  for (let f = 0; f < OCT_N; f++) {
    const a = faceAngle(f);
    const mid = polar(a, apo, y);
    const tan = new Vector3(Math.cos(a), 0, -Math.sin(a));
    for (let i = 0; i <= perFace; i++) {
      if (i === perFace) continue;               // 末点与下一面首点重合
      const off = ((i / perFace) - 0.5) * edge;
      posts.push({ p: mid.clone().addScaledVector(tan, off), a });
    }
  }
  const postGeo = new BoxGeometry(wz, H, wz);
  const postMesh = new InstancedMesh(postGeo, WOOD.trim, posts.length);
  const d = new Object3D();
  posts.forEach((it, i) => {
    d.position.copy(it.p).setY(y + H / 2);
    d.rotation.set(0, it.a, 0);
    d.updateMatrix();
    postMesh.setMatrixAt(i, d.matrix);
  });
  postMesh.instanceMatrix.needsUpdate = true;
  postMesh.castShadow = true;
  postMesh.userData = { partKey: 'wangZhu', level, type: 'balustrade' };
  g.add(postMesh);

  /* 寻杖(顶)、盆唇(中)、地栿(底):三道水平环,逐面直段 */
  const rails = [
    { yy: y + H - xz / 2, w: xz, h: xz, key: 'xunZhang' },
    { yy: y + H * 0.56, w: xz * 1.5, h: xz * 0.8, key: 'penChun' },
    { yy: y + xz * 0.7, w: xz * 1.4, h: xz * 0.9, key: 'diFu' },
  ];
  for (const r of rails) {
    for (let f = 0; f < OCT_N; f++) {
      const a = faceAngle(f);
      const m = new Mesh(new BoxGeometry(edge + r.w, r.h, r.w), WOOD.trim);
      m.position.copy(polar(a, apo, r.yy));
      m.rotation.y = a;
      m.castShadow = true;
      m.userData = { partKey: r.key, level, type: 'balustrade' };
      g.add(m);
    }
  }

  /* 华板:盆唇与地栿之间的竖格条(万字纹以格条节奏示意) */
  const barH = rails[1].yy - rails[2].yy;
  const bars = [];
  for (let f = 0; f < OCT_N; f++) {
    const a = faceAngle(f);
    const mid = polar(a, apo, 0);
    const tan = new Vector3(Math.cos(a), 0, -Math.sin(a));
    const n = bays * PINGZUO.panelsPerBay;       // 每间再分 panelsPerBay 格
    for (let i = 1; i < n; i++) {
      const off = ((i / n) - 0.5) * edge;
      bars.push({ p: mid.clone().addScaledVector(tan, off), a });
    }
  }
  const barMesh = new InstancedMesh(
    new BoxGeometry(xz * 0.55, barH, xz * 0.55), WOOD.trim, bars.length);
  bars.forEach((it, i) => {
    d.position.copy(it.p).setY(rails[2].yy + barH / 2);
    d.rotation.set(0, it.a, 0);
    d.updateMatrix();
    barMesh.setMatrixAt(i, d.matrix);
  });
  barMesh.instanceMatrix.needsUpdate = true;
  barMesh.castShadow = true;
  barMesh.userData = { partKey: 'huaBan', level, type: 'balustrade' };
  g.add(barMesh);

  g.userData = { partKey: 'balustrade', level, type: 'balustrade' };
  return g;
}
