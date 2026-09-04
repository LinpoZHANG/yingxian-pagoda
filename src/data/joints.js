/**
 * data/joints.js —— 榫卯接触语义表(第12轮建立)
 * ─────────────────────────────────────────────────────────────
 * 木构里「两件挨着」不是一种关系,而是三种,容差也不同。断言四以前只查
 * 「悬空」一侧,于是**埋进去多少都算过** —— 柱头戳穿普拍枋 0.026 m、
 * 阑额上皮钻进普拍枋 0.166 m,全部在断言四里显示为 ✔。本表把关系写清楚,
 * 断言四按表**双侧**检查。
 *
 * 三类语义:
 *   坐于 seat    —— 上件底面压在下件顶面上。间隙 = 上件底 − 下件顶,
 *                   合法区间 [−0.5cm, +2cm]:负号是木材压实与找平的量级,
 *                   正号是施工缝。**超出即缺陷**,两侧都是。
 *   埋入 embed   —— 上件按构造插进下件里,重叠是设计要求(叉柱造、斗口咬合)。
 *                   合法区间是**负**的,且必须逐类给定范围,不许"允许重叠"了事。
 *   穿插 thread  —— 两件互相贯通(昂尾压栿、阑额入柱),竖向没有承托关系,
 *                   不做间隙判定,只登记在册,免得日后被误判成缺陷。
 *
 * 容差单位:米。gap = 上件底面标高 − 下件顶面标高(负 = 重叠)。
 * ★ 改动本表 = 改动验收标准,必须与 docs/joint-semantics.md 同步(该文档由本表生成)。
 */

import { fen, PART, DOU, CAI } from './caifen.js';

/**
 * 设计原则(第13轮 用户批复,原文入档)
 * ─────────────────────────────────────────────────────────────
 * **「给完全埋没发容差 = 把缺陷写进标准。」**
 *
 * 一件构件如果在它该在的位置上根本看不见、也不受力,那它不是「埋入」,是不该存在。
 * 埋入语义只发给**构造上必须重叠**的节点(叉柱造、斗口咬合),且必须逐类给出
 * 有上下界的区间;凡是「允许重叠」而不给范围的写法,一律视为把缺陷合法化。
 */
export const PRINCIPLES = [
  '给完全埋没发容差 = 把缺陷写进标准。',
  '坐于类两侧同限:悬空是缺陷,埋进去同样是缺陷。',
  '断言一律从世界几何量,不读放样表的名义数字 —— 自检脚本同受单一数据源宪法管辖。',
  '豁免不得成为第二个埋没容差:分类豁免只放行量级在容许范围内的折角,超限者一律立案。',
  '构件要用的标高,先在表里加行,不许就地凑。',
];

/** 各语义类的缺省容差 */
export const JOINT_KIND = {
  seat:   { label: '坐于', range: [-0.005, 0.02],
            basis: '[法/施工]−5mm 压实与找平,+2cm 施工缝;两侧同限' },
  embed:  { label: '埋入', range: null,
            basis: '[法]按构造逐类给定,不设通用值' },
  thread: { label: '穿插', range: null,
            basis: '无竖向承托关系,只登记不判定' },
  stack:  { label: '叠于', range: [-0.02, 0.02],
            basis: '[法]斜向叠置(飞子压檐椽),容差比坐于宽一倍以容纳斜面找平' },
};

/**
 * 节点表。
 *   id       断言输出里的标识
 *   upper/lower 上件 / 下件(用 partKey,便于断言直接按语义键取构件)
 *   kind     seat | embed | thread
 *   range    [min,max] 覆写缺省;embed 必填
 *   probe    断言四如何取接触点:'columnTop' 逐柱头 | 'bracketSeat' 逐朵铺作
 *            | 'chuanInner'/'feiziInner'/'jiaoTail' 逐杆件端头 | null 不可从外部量
 *   partial  该节点只在**局部**成立(如生头木仅存于角区):探空即「不适用」,
 *            不计缺陷,但探中数与探空数都要报出来,避免用「没探到」掩盖问题
 */
export const JOINTS = [
  {
    id: 'pupai-on-column', upper: 'pupai', lower: 'column',
    kind: 'seat', probe: 'columnTop',
    scope: '全塔外槽 / 内槽 / 副阶 / 暗层',
    basis: '[法]普拍枋覆于柱头与阑额之上,是铺作的坐面',
    note: '柱头随生起起伏,枋须逐间跟着走 —— 一圈平枋必然与柱头脱节。',
  },
  {
    id: 'ludou-on-pupai', upper: 'bracketSet', lower: 'pupai',
    kind: 'seat', probe: 'bracketSeat',
    scope: '全塔外槽 / 内槽 / 平座 / 副阶,柱头·补间·转角同规',
    basis: '[法]栌斗坐普拍枋背;补间与柱头共承一条橑檐枋,故同高',
    note: '坐面取「本朵那根柱的柱头 + 普拍枋高」,不取放样表的单一数字。',
  },
  {
    id: 'chuan-on-shengtoumu', upper: 'chuan', lower: 'shengTouMu',
    kind: 'seat', probe: 'chuanInner', partial: true,
    scope: '各层屋面角区(|u| > cornerZone),含副阶',
    basis: '[法]生头木垫于橑檐枋背,檐椽内端坐其上 —— 起翘由此传下',
    note: '第15轮之前起翘只画在皮肤与椽上,承托线是平的,角区椽扇高出 0.15~0.49 m '
      + '而中间空无一物。现幅值统一取自 roof.js:shengTouAt(),皮肤/椽/生头木同源。',
  },
  {
    id: 'jiaoliang-on-corner-puzuo', upper: 'daJiaoLiang', lower: 'bracketSet',
    kind: 'seat', probe: 'jiaoTail', partial: true,
    scope: '八转角 × 各层屋面',
    basis: '[法]大角梁坐于转角铺作最外跳,沿角平分线斜出至檐口角尖',
    note: '断面取 2 倍椽径 [法,保守值];版18-19 精读后按图校。'
      + '仔角梁叠其上再挑出一截,角区扇列椽逐根搭靠其侧。',
  },
  {
    id: 'feizi-on-chuan', upper: 'feizi', lower: 'chuan',
    kind: 'stack', probe: 'feiziInner', partial: true,
    scope: '全塔檐口一周',
    basis: '[法]飞子压在檐椽之上、瓦面之下,自檐口再挑出一段',
    note: '两者的沉量同源于 ROOF_BUILDUP 分解(瓦厚 → 飞子 → 檐椽),改一处两处同步。',
  },
  {
    id: 'shuzhu-on-caofu', upper: 'shuZhu', lower: 'caofu',
    kind: 'seat', probe: null,
    scope: '顶层攒尖屋架,五层梁环之间(第45轮)',
    basis: '[图]版17 p89 断面:叠梁式屋架,蜀柱立于下层梁背、承上层梁底',
    note: '第五层内槽铺作顶到攒尖顶原有 6.95 m 空档,除瓦皮与望板外一无所有 —— '
      + '十二条断言当时全绿,因为它们查的是构件之间的关系,不查「该有的构件在不在」。',
  },
  {
    id: 'chazhu-under-shaji', upper: 'shaji', lower: 'chaZhu',
    kind: 'seat', probe: null,
    scope: '攒尖顶中央,承刹柱与砖石刹座之间',
    basis: '[图]版17 p89 断面:砖座坐在屋架最上一层的木构上,不是直接坐在瓦面上',
    note: '承刹柱顶 = 砖座底(55.503);砖座自身再向下埋入屋面 0.448 m。',
  },
  {
    id: 'lanE-in-column', upper: 'lanE', lower: 'column',
    kind: 'thread',
    scope: '全塔各柱环',
    basis: '[法]阑额两端做榫卯入柱,上皮与柱头平',
    note: '阑额不坐在柱头顶面上,而是侧向卯入柱身;竖向不作承托判定。',
  },
  {
    id: 'column-foot-in-bracket', upper: 'anColumn', lower: 'bracketSet',
    kind: 'embed', range: [-0.60, -0.05], probe: null,
    scope: '暗层柱脚 ↔ 下层铺作(叉柱造)',
    basis: '[法]叉柱造:上层柱脚开十字口,骑在下层铺作栌斗之上',
    note: '重叠是设计要求。上限 −5cm 防"只搭一点",下限 −60cm 防柱脚穿透整朵。',
  },
  {
    id: 'jiaohudou-slot', upper: 'huaGong', lower: 'jiaoHuDou',
    kind: 'embed', range: [-fen(PART.jiaoHuDou.h) * DOU.profile.er, 0], probe: null,
    scope: '每一跳的跳头',
    basis: '[法]交互斗十字斗口卡住上一跳华栱,咬合深度 = 斗耳高',
    note: '铺作是一件合并几何,外部量不到内部节点;由 assemble.js 的步进规则保证,'
      + '硬底见 stepCompressed()(步进不得低于足材)。',
  },
  {
    id: 'sandou-on-gong', upper: 'sanDou', lower: 'gong',
    kind: 'seat', probe: null,
    scope: '横栱两端与中心',
    basis: '[法]散斗/齐心斗坐栱背,斗底压在栱上皮',
    note: `同上,合并几何内部节点。文法落位:斗底 = 栱底 + 材广(${CAI.guang} m)。`,
  },
  {
    id: 'tuofeng-on-pupai', upper: 'tuoFeng', lower: 'pupai',
    kind: 'seat', probe: null,
    scope: '仅**无普拍枋**的圈(本塔现无此情形,故不出件)',
    basis: '[法]驼峰垫平阑额与栌斗之间的空档',
    todo: '版20 副阶补间的驼峰蜀柱:待核该圈是否真无普拍枋;若确无,置 cfg.tuofeng = true。',
    note: '第12轮结案(第13轮用户批复「第三次抗辩成立」):驼峰不是"允许埋入"的件 —— 它一旦有普拍枋可坐就不该存在。'
      + '此前无条件垫在栌斗之下 0.374 m,整根埋在枋与额里,渲染看不见,'
      + '却把断言四的"铺作底"拉低同样的量,掩盖了真正的落座问题。'
      + '现由 cfg.tuofeng 开关控制,默认关;版20 副阶驼峰待核该圈是否真无普拍枋。',
  },
  {
    id: 'ang-tail-over-fu', upper: 'ang', lower: 'rufu',
    kind: 'thread',
    scope: '一层昂尾压草乳栿 [文]',
    basis: '[法]下昂杠杆:昂尾斜上入内,被上部构件压住',
    note: '斜向穿插,无水平接触面,不作间隙判定。',
  },
];

/** 取某节点的合法区间(embed 必须自带 range)*/
export function jointRange(j) {
  return j.range ?? JOINT_KIND[j.kind].range;
}
