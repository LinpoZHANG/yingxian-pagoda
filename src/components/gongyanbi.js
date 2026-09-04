/**
 * components/gongyanbi.js —— 栱眼壁
 * ─────────────────────────────────────────────────────────────
 * 泥道栱与柱头枋之间的白灰壁板,逐间填在铺作带的**墙面层**里。
 *
 * 为什么必须有:铺作是一排孤立的木构件,靠它们自己封不住檐下的墙面。
 * 缺了这层板,自铺作带外侧水平射线打进去,15~19% 会一穿到底 ——
 * 檐下能直接看穿塔身(第13轮用户在深檐下发现)。
 *
 * 定位规则(全部取自放样表与材分,无自由尺寸):
 *   下皮 = 普拍枋背(= 该间两端柱头 + 普拍枋高),**随生起起伏**;
 *   上皮 = 柱头枋底 = 下皮 + 栌斗高 + 两个足材(泥道栱、慢栱各占一个);
 *   厚   = 栱厚(壁板嵌在泥道栱同一平面里,栌斗自两侧凸出于它);
 *   平面 = 柱心连线(与阑额/普拍枋同一竖直面)。
 * 内外槽 / 平座 / 副阶同规。
 */

import { Group, Mesh, BoxGeometry, Vector3 } from 'three';
import { fen, PART, ZUCAI, SECTION } from '../data/caifen.js';
import { PLASTER } from '../materials/tile.js';

/** 壁板上皮相对普拍枋背的高度:栌斗 + 泥道栱 + 慢栱 = 柱头枋底 [法] */
export const GONGYAN_TOP = fen(PART.luDou.h) + ZUCAI * 2;

/**
 * @param {Array} tops   柱头序列(pos.y 即该柱柱头顶面)
 * @param {object} o     { level, partKey }
 * @returns {Group}
 */
export function buildGongYanBi(tops, { level = 0, partKey = 'gongYanBi' } = {}) {
  const g = new Group();
  g.name = `gongYanBi_L${level}`;
  const seatRise = fen(SECTION.pupai.h);          // 柱头顶面 → 普拍枋背
  // ★ 壁板必须**退在栱面之后**(第19轮:用户报旋转时闪烁)。
  //   原厚度取满一个栱厚、又与泥道栱同心同面 —— 两个面在数学上完全重合,
  //   深度缓冲无法定序,转动镜头就闪。构造上栱眼壁本就是嵌在栱面之内的薄板,
  //   故取栱厚的 0.6,两侧各退 0.2 个栱厚(≈3.4 cm)。
  const th = fen(PART.gongSection.w) * 0.6;
  const h = GONGYAN_TOP;

  for (let i = 0; i < tops.length; i++) {
    const a = tops[i].pos.clone();
    const b = tops[(i + 1) % tops.length].pos.clone();
    const len = a.distanceTo(b);
    if (len <= 1e-3) continue;
    // 板心:两端普拍枋背的中点再抬半个板高
    const y0a = a.y + seatRise, y0b = b.y + seatRise;
    const mid = a.clone().add(b).multiplyScalar(0.5).setY((y0a + y0b) / 2 + h / 2);
    // 端头各伸半个栌斗宽,与相邻间搭接(转角处不留缝)
    const mesh = new Mesh(new BoxGeometry(th, h, len + fen(PART.luDou.w) * 0.5), PLASTER);
    mesh.position.copy(mid);
    mesh.lookAt(new Vector3(b.x, mid.y, b.z));    // 长向对齐该间,俯仰不跟生起(板是竖直的)
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { partKey, level, type: 'wall' };
    g.add(mesh);
  }
  g.userData = { partKey, level, type: 'wall' };
  return g;
}
