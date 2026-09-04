/**
 * 神游建造的共享规则。
 * 首页与结构调试页都从这里读取阶段,避免调试页调细后首页仍停在旧逻辑。
 */

export const DEFAULT_BUILD_PROGRESS = 0.04;
const BUILD_FADE_SPAN = 0.028;

const BUILD_ORDER = [
  { key: 'foundation', name: '备基定轴', start: 0.04, end: 0.10 },
  { key: 'L1_ming', name: '明一层', start: 0.10, end: 0.24 },
  { key: 'L2_an', name: '一二层间暗层', start: 0.24, end: 0.32 },
  { key: 'L2_ming', name: '明二层', start: 0.32, end: 0.44 },
  { key: 'L3_an', name: '二三层间暗层', start: 0.44, end: 0.52 },
  { key: 'L3_ming', name: '明三层', start: 0.52, end: 0.64 },
  { key: 'L4_an', name: '三四层间暗层', start: 0.64, end: 0.72 },
  { key: 'L4_ming', name: '明四层', start: 0.72, end: 0.82 },
  { key: 'L5_an', name: '四五层间暗层', start: 0.82, end: 0.88 },
  { key: 'L5_ming', name: '明五层', start: 0.88, end: 0.95 },
  { key: 'finial', name: '攒尖塔刹', start: 0.95, end: 1.00 },
];

const MING_ROLE_FLOW = {
  platform: 0.00,
  column: 0.05,
  beam: 0.18,
  brace: 0.26,
  bracket: 0.32,
  wall: 0.46,
  floor: 0.56,
  eaveSupport: 0.66,
  eaveTrim: 0.76,
  roofBase: 0.84,
  roofTile: 0.91,
  ridge: 0.97,
  plaque: 0.985,
  finial: 1.00,
  unknown: 0.40,
};

const AN_ROLE_FLOW = {
  platform: 0.00,
  column: 0.06,
  beam: 0.20,
  brace: 0.36,
  bracket: 0.55,
  wall: 0.62,
  floor: 0.72,
  eaveSupport: 0.80,
  eaveTrim: 0.84,
  roofBase: 0.88,
  roofTile: 0.92,
  ridge: 0.96,
  plaque: 0.98,
  finial: 1.00,
  unknown: 0.45,
};

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function matchBuildKey(value) {
  const text = String(value || '');
  const m = text.match(/L([1-5])_(ming|an)/i) || text.match(/storey_([1-5])_(ming|an)/i);
  if (!m) return null;
  return { level: Number(m[1]), storeyType: m[2].toLowerCase(), key: `L${Number(m[1])}_${m[2].toLowerCase()}` };
}

function getBuildUnit(obj) {
  const role = getStructureRole(obj);
  if (role === 'finial') return { level: 6, storeyType: 'finial', key: 'finial' };
  if (role === 'platform') return { level: 0, storeyType: 'foundation', key: 'foundation' };

  let cur = obj;
  while (cur) {
    const byKey = matchBuildKey(cur.userData?.key);
    if (byKey) return byKey;

    const byName = matchBuildKey(cur.name);
    if (byName) return byName;

    cur = cur.parent;
  }

  const level = Number(obj.userData?.level ?? obj.userData?.buildLevel ?? 1) || 1;
  if (level >= 6) return { level: 6, storeyType: 'finial', key: 'finial' };
  return { level, storeyType: 'ming', key: `L${Math.max(1, Math.min(5, level))}_ming` };
}

function getUnitRange(unit) {
  const key = unit?.key || 'L1_ming';
  return BUILD_ORDER.find((item) => item.key === key) ?? BUILD_ORDER[1];
}

function getRoleFraction(role, unit) {
  if (unit.storeyType === 'foundation') return role === 'platform' ? 0.00 : 0.55;
  if (unit.storeyType === 'an') return AN_ROLE_FLOW[role] ?? AN_ROLE_FLOW.unknown;
  if (unit.storeyType === 'finial') return 0.00;
  return MING_ROLE_FLOW[role] ?? MING_ROLE_FLOW.unknown;
}

function getFinialFraction(obj) {
  const combined = `${obj.name || ''} ${obj.userData?.partKey || ''} ${obj.userData?.type || ''}`.toLowerCase();
  if (/(lupan|露盘|覆钵|yangyue|仰月)/.test(combined)) return 0.10;
  if (/(xianglun|相轮)/.test(combined)) return 0.44;
  if (/(chain|链|索)/.test(combined)) return 0.72;
  if (/(tip|宝珠|刹尖)/.test(combined)) return 0.90;
  return 0.24;
}

function getStructureRole(obj) {
  const key = (obj.name || obj.userData?.partKey || '').toLowerCase();
  const type = (obj.userData?.type || '').toLowerCase();
  const partKey = (obj.userData?.partKey || '').toLowerCase();
  const combined = `${key} ${partKey} ${type}`;

  if (/(platform|plinth|stair|terrace|base|台基|基座)/.test(combined)) return 'platform';
  if (/(column|pillar|innercolumn|ancolumn|柱)/.test(combined) && !/(beam|lintel|pupai|lanE|rufu|caofu|brace|diag)/.test(combined)) return 'column';
  if (/(lanE|pupai|rufu|caofu|beam|lintel|radial|乳栿|梁枋|枋|普拍枋|阑额)/.test(combined)) return 'beam';
  if (/(brace|diagonal|diag|斜撑|strut|wallbrace)/.test(combined) || type === 'brace') return 'brace';
  if (/(shengtou|jiaoliang|taoshou|eave|soffit|rafter|fascia|檐口|檐|椽|飞子)/.test(combined) && !/(roof|tile|ridge|finial|刹|脊|瓦)/.test(combined)) return 'eaveSupport';
  if (/(bracket|puzuo|gongyan|斗拱|铺作|栱眼|ludou|mangong|ang|huagong|shuatou)/.test(combined) || type === 'bracket') return 'bracket';
  if (/(wall|mudwall|door|window|版壁|墙|wallbrace)/.test(combined) && !/(brace|diagonal|diag|斜撑)/.test(combined)) return 'wall';
  if (/(pingzuo|balustrade|勾阑|栏杆|平座|楼面|deck|floor|wangzhu|huaban)/.test(combined)) return 'floor';
  if (/(chuan|feizi|rafter|fascia|eavetrim|檐椽|飞子|椽)/.test(combined)) return 'eaveTrim';
  if (/(roof|roofbase|wangban|waDang|瓦当|望板)/.test(combined) && !/(ridge|tile|finial|刹|脊)/.test(combined)) return 'roofBase';
  if (/(tile|瓦|roofTile|roof_surface)/.test(combined)) return 'roofTile';
  if (/(ridge|boji|chuiji|脊|垂脊|戗兽|jiTou)/.test(combined)) return 'ridge';
  if (/(plaque|匾|牌)/.test(combined)) return 'plaque';
  if (/(finial|刹|tip|xianglun|luPan|yangyue)/.test(combined)) return 'finial';
  return 'unknown';
}

function getBuildStage(obj) {
  const unit = getBuildUnit(obj);
  const role = getStructureRole(obj);
  const range = getUnitRange(unit);

  if (unit.storeyType === 'finial') return lerp(range.start, range.end, getFinialFraction(obj));
  return lerp(range.start, range.end, getRoleFraction(role, unit));
}

function getBuildSupportGate(obj) {
  const unit = getBuildUnit(obj);
  const role = getStructureRole(obj);
  const range = getUnitRange(unit);
  if (role === 'platform' || role === 'column') return DEFAULT_BUILD_PROGRESS;
  return Math.max(DEFAULT_BUILD_PROGRESS, range.start);
}

export function getPhaseLabel(progress) {
  const phase = BUILD_ORDER.find((item) => progress < item.end);
  return phase?.name ?? '塔刹';
}

function materialList(material) {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function cloneBuildMaterials(obj) {
  if (!obj.material || !materialList(obj.material).some((m) => m && 'opacity' in m)) return [];

  if (!obj.userData.__buildOriginalMaterials) {
    obj.userData.__buildOriginalMaterials = obj.material;
    const originals = materialList(obj.material);
    obj.userData.__buildBaseOpacities = originals.map((m) => (m && 'opacity' in m ? m.opacity : 1));
    obj.userData.__buildFadeMaterials = originals.map((m) => (m && m.clone ? m.clone() : m));
  }

  obj.material = Array.isArray(obj.userData.__buildOriginalMaterials)
    ? obj.userData.__buildFadeMaterials
    : obj.userData.__buildFadeMaterials[0];

  return obj.userData.__buildFadeMaterials;
}

function restoreBuildMaterials(obj) {
  const original = obj.userData.__buildOriginalMaterials;
  if (!original) return;
  for (const [i, m] of materialList(original).entries()) {
    if (!m || !('opacity' in m)) continue;
    m.opacity = obj.userData.__buildBaseOpacities?.[i] ?? 1;
    m.transparent = m.opacity < 1;
    m.depthWrite = m.opacity >= 1;
  }
  obj.material = original;
  delete obj.userData.__buildOriginalMaterials;
  delete obj.userData.__buildBaseOpacities;
  delete obj.userData.__buildFadeMaterials;
}

function setBuildOpacity(obj, alpha) {
  if (!obj.material) return;
  if (alpha >= 0.999) {
    restoreBuildMaterials(obj);
    return;
  }

  const mats = cloneBuildMaterials(obj);
  mats.forEach((m, i) => {
    if (!m || !('opacity' in m)) return;
    const baseOpacity = obj.userData.__buildBaseOpacities?.[i] ?? 1;
    m.transparent = true;
    m.opacity = baseOpacity * alpha;
    m.depthWrite = alpha >= 0.999;
    m.needsUpdate = true;
  });
}

export function rememberBuildState(root) {
  root.traverse((obj) => {
    if (!obj.isObject3D || obj === root) return;
    if (!obj.userData.__homePosition) obj.userData.__homePosition = obj.position.clone();

    obj.userData.buildStage = getBuildStage(obj);
    obj.userData.supportGate = getBuildSupportGate(obj);
  });
}

export function restoreBuildState(root) {
  root.traverse((obj) => {
    if (!obj.isObject3D || obj === root) return;
    obj.visible = true;
    restoreBuildMaterials(obj);
  });
}

export function applyBuildState(root, progress, { activeLevel = 'all', keepActiveStoreys = [] } = {}) {
  const selectLevel = activeLevel === 'all' ? null : Number(String(activeLevel).replace('L', ''));

  root.traverse((obj) => {
    if (!obj.isObject3D || obj === root) return;
    const currentLevel = obj.userData.level ?? obj.userData.buildLevel ?? null;
    const inSelectedLevel = selectLevel == null || currentLevel === selectLevel;
    if (!inSelectedLevel) {
      obj.visible = false;
      return;
    }

    const stage = obj.userData.buildStage ?? getBuildStage(obj);
    const supportGate = obj.userData.supportGate ?? getBuildSupportGate(obj);
    const alpha = smoothstep((progress - Math.max(stage, supportGate)) / BUILD_FADE_SPAN);
    if (!obj.material) {
      obj.visible = alpha > 0.01;
      return;
    }
    obj.visible = alpha > 0.01;
    setBuildOpacity(obj, alpha);
  });

  for (const storey of keepActiveStoreys) {
    const level = storey.plan?.level;
    if (selectLevel == null || level === selectLevel) storey.group.visible = true;
  }
}
