import {
  Group, Mesh, CylinderGeometry, SphereGeometry, BoxGeometry,
  LatheGeometry, Vector2, CanvasTexture, Object3D,
  DoubleSide, MeshStandardMaterial, Color, Box3,
} from 'three';
import { FLOOR_STATUE_CONFIG, metersToSceneUnits, representation } from './statueConfig.js';
import { createStatueMaterials } from './statueMaterials.js';

const STATUE_FLOOR_CLEARANCE = 0.04;
const statueBounds = new Box3();

function makeMuralTexture(baseColors) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6c4b3f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 80; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const w = 20 + Math.random() * 120;
    const h = 12 + Math.random() * 40;
    ctx.fillStyle = baseColors[i % baseColors.length];
    ctx.globalAlpha = 0.25 + Math.random() * 0.35;
    ctx.fillRect(x, y, w, h);
  }

  ctx.globalAlpha = 1;
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.strokeStyle = '#f3d7a6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 40, y + 22);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function buildLotusSeat({ radius = 1.2, height = 0.48, material }) {
  const seat = new Group();
  const base = new Mesh(new CylinderGeometry(radius, radius * 1.08, height, 24), material);
  base.castShadow = true;
  base.receiveShadow = true;
  seat.add(base);

  const petals = 14;
  for (let i = 0; i < petals; i++) {
    const petal = new Mesh(
      new LatheGeometry([
        new Vector2(0.08, 0),
        new Vector2(0.18, 0.03),
        new Vector2(0.30, 0.19),
        new Vector2(0.18, 0.37),
        new Vector2(0.06, 0.46),
      ], 18),
      material,
    );
    petal.rotation.z = (i / petals) * Math.PI * 2;
    petal.position.y = height * 0.5;
    petal.rotation.x = Math.PI * 0.5;
    petal.scale.set(1.3, 1.0, 1.3);
    seat.add(petal);
  }
  seat.userData = { category: 'lotus-seat' };
  return seat;
}

function createFigureCore({ kind, height = 2.5, width = 1.2, material, colorVariant = 'gold' }) {
  const group = new Group();
  const torsoMaterial = material || { gildedSkin: material };
  const bodyHeight = height * 0.62;
  const robe = new Mesh(new CylinderGeometry(width * 0.42, width * 0.54, bodyHeight, 18), torsoMaterial.redRobe || material);
  robe.position.y = bodyHeight * 0.5;
  group.add(robe);

  const shoulder = new Mesh(new SphereGeometry(width * 0.42, 18, 16), torsoMaterial.gildedSkin || material);
  shoulder.scale.set(1.1, 0.7, 1.1);
  shoulder.position.y = bodyHeight * 0.8;
  group.add(shoulder);

  const head = new Mesh(new SphereGeometry(width * 0.25, 16, 16), torsoMaterial.gildedSkin || material);
  head.position.y = height * 0.9;
  group.add(head);

  const ushnisha = new Mesh(new SphereGeometry(width * 0.11, 16, 16), torsoMaterial.darkBlueHair || material);
  ushnisha.position.y = height * 1.15;
  group.add(ushnisha);

  const leftArm = new Mesh(new CylinderGeometry(width * 0.08, width * 0.08, height * 0.35, 10), torsoMaterial.gildedSkin || material);
  leftArm.rotation.z = 0.9;
  leftArm.position.set(-width * 0.38, bodyHeight * 0.8, 0);
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.rotation.z = -0.9;
  rightArm.position.x = width * 0.38;
  group.add(rightArm);

  const legs = new Mesh(new CylinderGeometry(width * 0.16, width * 0.16, height * 0.34, 10), torsoMaterial.gildedSkin || material);
  legs.position.y = bodyHeight * 0.14;
  group.add(legs);

  group.userData = {
    category: 'pagoda-statue',
    kind,
    dimensions: { totalHeight: height },
    representation,
  };
  return group;
}

function createBuddhaFigure({ dims, material, direction = 0 }) {
  const h = dims.figureHeight ?? dims.totalHeight ?? 2;
  const figure = createFigureCore({ kind: 'buddha', height: h, width: dims.figureWidth ?? dims.baseWidth ?? 1.4, material, colorVariant: 'gold' });
  figure.rotation.y = direction;
  return figure;
}

function createBodhisattvaFigure({ dims, material, direction = 0 }) {
  const h = dims.figureHeight ?? dims.totalHeight ?? 2;
  const figure = createFigureCore({ kind: 'bodhisattva', height: h, width: dims.baseWidth ?? 1.2, material, colorVariant: 'gold' });
  const crown = new Mesh(new CylinderGeometry(0.22, 0.28, 0.45, 12), material.darkBlueHair || material.gildedSkin || material);
  crown.position.y = h * 0.98;
  figure.add(crown);
  figure.rotation.y = direction;
  return figure;
}

function createDiscipleFigure({ dims, material, direction = 0 }) {
  const h = dims.figureHeight ?? dims.totalHeight ?? 2;
  const figure = createFigureCore({ kind: 'disciple', height: h, width: 0.95, material, colorVariant: 'gold' });
  figure.scale.set(0.95, 1.08, 0.95);
  figure.rotation.y = direction;
  return figure;
}

function createAttendantFigure({ dims, material, direction = 0 }) {
  const h = dims.figureHeight ?? dims.totalHeight ?? 1.4;
  const figure = createFigureCore({ kind: 'attendant', height: h, width: 0.9, material, colorVariant: 'ochre' });
  figure.scale.set(0.75, 1.0, 0.8);
  figure.rotation.y = direction;
  return figure;
}

function createMuralPanel({ floor, x, y, z, width, height, material, colors }) {
  const panel = new Mesh(
    new BoxGeometry(width, height, 0.08),
    new MeshStandardMaterial({
      map: makeMuralTexture(colors),
      side: DoubleSide,
      roughness: 0.95,
      metalness: 0.02,
      transparent: false,
    }),
  );
  panel.position.set(x, y, z);
  panel.userData = {
    category: 'statue-mural',
    partKey: 'statueMural',
    floor,
    id: `floor${floor}-six-buddha-murals`,
    name: '六佛壁画',
    type: 'mural',
    evidenceLevel: 'measured',
    representation: 'interpretive',
  };
  return panel;
}

function createFloorMurals({ floor, baseY, innerR, materials, wallRotation = 0 }) {
  const murals = new Group();
  murals.name = `mural-wall-${floor}`;

  const panelW = 1.8;
  const panelH = 1.5;
  const count = 6;
  const radius = Math.max(innerR * 0.7, 3.4);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + wallRotation;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const panel = createMuralPanel({
      floor,
      x,
      y: baseY + 2.2,
      z,
      width: panelW,
      height: panelH,
      colors: ['#a66b57', '#dcd4ac', '#6d7f61', '#d18c48', '#7b463a'],
      material: materials.mural,
    });
    panel.rotation.y = -angle + Math.PI / 2;
    murals.add(panel);
  }
  return murals;
}

function createFloorGroup({ floor, pagodaLevel, innerR, floorY, materials, isDebug = false }) {
  const config = FLOOR_STATUE_CONFIG.find((entry) => entry.floor === floor) ?? null;
  if (!config) return null;

  const group = new Group();
  group.name = config.groupName;
  group.position.y = floorY;
  group.userData = {
    category: 'pagoda-statue-floor',
    floor,
    representation,
    itemCount: config.items.length,
  };

  const maxTopHeight = Math.max(...config.items.map((item) => item.dims?.topHeight ?? item.dims?.totalHeight ?? 2));
  const guideAnchor = new Object3D();
  guideAnchor.name = `statue-guide-anchor-${floor}`;
  guideAnchor.position.set(innerR * 0.46, Math.max(1.4, maxTopHeight * 0.62), innerR * 0.10);
  guideAnchor.userData = {
    category: 'statue-guide-anchor',
    floor,
  };
  group.add(guideAnchor);

  const altarMaterial = materials.woodAltar;
  const lotusMaterial = materials.lotusRed;
  const seatMaterial = materials.gildedSkin;

  for (const item of config.items) {
    const base = new Group();
    base.name = item.id;
    base.position.set(item.x * metersToSceneUnits, 0.2, item.z * metersToSceneUnits);
    base.userData = {
      category: 'pagoda-statue',
      partKey: 'statueFigure',
      floor,
      id: item.id,
      name: item.name,
      type: item.type,
      dimensions: item.dims,
      representation,
      evidenceLevel: item.evidenceLevel,
      source: '2021 survey',
    };

    const seat = buildLotusSeat({ radius: (item.dims.baseWidth ?? 2) * 0.42, height: 0.3 + (item.dims.totalHeight ?? 2) * 0.08, material: lotusMaterial });
    base.add(seat);

    let figure;
    if (item.type === 'buddha') figure = createBuddhaFigure({ dims: item.dims, material: { gildedSkin: materials.gildedSkin, redRobe: materials.redRobe, darkBlueHair: materials.darkBlueHair }, direction: item.direction ?? 0 });
    else if (item.type === 'bodhisattva') figure = createBodhisattvaFigure({ dims: item.dims, material: { gildedSkin: materials.gildedSkin, redRobe: materials.redRobe, darkBlueHair: materials.darkBlueHair }, direction: item.direction ?? 0 });
    else if (item.type === 'disciple') figure = createDiscipleFigure({ dims: item.dims, material: { gildedSkin: materials.gildedSkin, redRobe: materials.ochreRobe }, direction: item.direction ?? 0 });
    else if (item.type === 'attendant') figure = createAttendantFigure({ dims: item.dims, material: { gildedSkin: materials.gildedSkin, redRobe: materials.redRobe }, direction: item.direction ?? 0 });
    else figure = createBuddhaFigure({ dims: item.dims, material: { gildedSkin: materials.gildedSkin, redRobe: materials.redRobe, darkBlueHair: materials.darkBlueHair }, direction: item.direction ?? 0 });

    figure.position.y = 0.5;
    base.add(figure);

    const altar = new Mesh(new CylinderGeometry((item.dims.baseWidth ?? 2.0) * 0.48, (item.dims.baseWidth ?? 2.0) * 0.6, 0.37, 18), altarMaterial);
    altar.position.y = 0.18;
    altar.castShadow = true;
    altar.receiveShadow = true;
    base.add(altar);

    base.updateMatrixWorld(true);
    statueBounds.setFromObject(base);
    if (statueBounds.min.y < STATUE_FLOOR_CLEARANCE) {
      base.position.y += STATUE_FLOOR_CLEARANCE - statueBounds.min.y;
    }

    group.add(base);
  }

  if (floor === 1) {
    const muralGroup = createFloorMurals({ floor, baseY: floorY, innerR: innerR || 6.5, materials, wallRotation: Math.PI / 12 });
    group.add(muralGroup);
  }

  if (isDebug) {
    const debug = new Mesh(new CylinderGeometry(innerR * 0.92, innerR * 0.92, 0.04, 24), new MeshStandardMaterial({ color: '#ff0', transparent: true, opacity: 0.08 }));
    debug.position.y = 0.02;
    debug.name = `floor-${floor}-debug-ring`;
    group.add(debug);
  }

  return group;
}

export function createPagodaStatues({ pagodaPlan, quality = 'high', representationOverride = representation, enableDebug = false } = {}) {
  const materials = createStatueMaterials();
  const root = new Group();
  root.name = 'pagoda-statues';
  root.userData = {
    category: 'pagoda-statue-system',
    representation: representationOverride,
    quality,
    counts: { total: 26 },
    metersToSceneUnits,
    floorLevels: [],
  };

  const mingStoreys = (pagodaPlan?.storeys ?? []).flatMap((storey) => {
    const plan = storey?.plan ?? storey;
    return plan?.type === 'ming' ? [plan] : [];
  });
  const configuredFloors = new Set(FLOOR_STATUE_CONFIG.map((entry) => entry.floor));
  const activeLevels = mingStoreys.length > 0
    ? mingStoreys.map((storey) => storey.level)
    : [...configuredFloors].sort((a, b) => a - b);

  root.userData.floorLevels = activeLevels;

  const countTotal = activeLevels.reduce((sum, floor) => {
    const config = FLOOR_STATUE_CONFIG.find((entry) => entry.floor === floor);
    return sum + (config ? config.items.length : 0);
  }, 0);
  root.userData.counts = { total: countTotal };

  for (const level of activeLevels) {
    const config = FLOOR_STATUE_CONFIG.find((entry) => entry.floor === level) ?? null;
    const mingStorey = (pagodaPlan?.storeys ?? []).find((storey) => {
      const plan = storey?.plan ?? storey;
      return plan.level === level && plan.type === 'ming';
    });
    const floorY = mingStorey ? (mingStorey.plan?.baseY ?? mingStorey.baseY ?? 0) : 0;
    const floorGroup = createFloorGroup({
      floor: level,
      pagodaLevel: level,
      innerR: config?.innerR ?? (mingStorey?.plan?.innerR ?? mingStorey?.innerR ?? 6.2),
      floorY,
      materials,
      isDebug: enableDebug,
    });
    if (floorGroup) root.add(floorGroup);
  }

  root.setFloorVisible = (floor, visible) => {
    const group = root.getObjectByName(`statues-floor-${floor}`);
    if (group) group.visible = visible;
  };

  root.setFocusMode = (mode) => {
    root.userData.focusMode = mode;
  };

  root.getPickables = () => {
    const pickables = [];
    root.traverse((obj) => {
      if (obj.userData?.partKey === 'statueFigure' || obj.userData?.partKey === 'statueMural') {
        pickables.push(obj);
      }
    });
    return pickables;
  };

  root.getFloorGuideAnchors = () => activeLevels
    .map((floor) => {
      const group = root.getObjectByName(`statues-floor-${floor}`);
      const anchor = group?.getObjectByName(`statue-guide-anchor-${floor}`);
      return anchor ? { floor, anchor } : null;
    })
    .filter(Boolean);

  root.highlightStatue = (id) => {
    root.traverse((obj) => {
      obj.userData = obj.userData || {};
      obj.userData.highlighted = obj.name === id;
    });
  };

  root.setHighlightMode = (enabled) => {
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        if (!mat || !('emissive' in mat) || !('emissiveIntensity' in mat)) return;
        mat.emissive = enabled ? new Color('#6a4718') : new Color('#000000');
        mat.emissiveIntensity = enabled ? 0.78 : 0;
      });
    });
  };

  root.clearHighlight = () => {
    root.traverse((obj) => {
      if (obj.userData) obj.userData.highlighted = false;
    });
  };

  root.update = () => {};
  root.dispose = () => {
    root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((material) => material.dispose?.());
      }
    });
  };

  return root;
}
