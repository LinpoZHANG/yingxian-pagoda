import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildPagoda } from './assembly/buildPagoda.js';
import {
  DEFAULT_BUILD_PROGRESS,
  applyBuildState as applySharedBuildState,
  getPhaseLabel,
  rememberBuildState,
} from './assembly/buildTourLogic.js';

const app = document.getElementById('app');
const statusEl = document.getElementById('status');
const toggleBtn = document.getElementById('toggleBuild');
const resetBtn = document.getElementById('resetBuild');
const overviewBtn = document.getElementById('overviewView');
const interiorBtn = document.getElementById('interiorView');
const levelSelect = document.getElementById('levelSelect');
const progressSlider = document.getElementById('progressSlider');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xf3ebdc, 1);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3ebdc);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 28, 62);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableRotate = true;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.9;
controls.minDistance = 18;
controls.maxDistance = 180;
controls.minPolarAngle = 0.2;
controls.maxPolarAngle = Math.PI * 0.48;
controls.target.set(0, 12, 0);

const ambient = new THREE.HemisphereLight(0xfefae2, 0x8b6d52, 1.25);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.7);
keyLight.position.set(42, 68, 22);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xd8e7ff, 0.65);
fillLight.position.set(-30, 20, -28);
scene.add(fillLight);

const grid = new THREE.GridHelper(120, 36, 0x9d8a6a, 0xdcccb2);
grid.rotation.x = Math.PI / 2;
grid.position.y = 0.02;
scene.add(grid);

const pagoda = buildPagoda();
scene.add(pagoda.root);

const levels = ['all', ...pagoda.storeys.map(({ plan }) => `L${plan.level}`)];
levels.forEach((value) => {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = value === 'all' ? '全部' : value;
  levelSelect.appendChild(option);
});

let activeLevel = 'all';
let isPlaying = false;
let buildProgress = DEFAULT_BUILD_PROGRESS;
let lastTime = performance.now();
let interiorMode = false;
let interiorYaw = 0;

function objectTint(obj) {
  if (!obj.material || !('color' in obj.material)) return;
  const key = (obj.name || obj.userData.partKey || '').toLowerCase();
  const type = (obj.userData.type || '').toLowerCase();
  let color = 0xd9b66c;
  if (/(column|pillar|柱)/.test(key)) color = 0xe7c27a;
  else if (/(lanE|pupai|rufu|caofu|beam|lintel|radial|乳栿|梁枋|枋|阑额|普拍枋)/.test(key)) color = 0xc99861;
  else if (/(brace|diagonal|diag|斜撑)/.test(key) || type === 'brace') color = 0x8d5d3d;
  else if (/(bracket|puzuo|gongyan|斗拱|铺作|栱眼|生头木|角梁)/.test(key)) color = 0xd79d43;
  else if (/(wall|版壁|墙)/.test(key) && !/(brace|diagonal|diag|斜撑)/.test(key)) color = 0xb08767;
  else if (/(pingzuo|balustrade|勾阑|栏杆|平座|楼面|deck)/.test(key)) color = 0xb2a07a;
  else if (/(roof|ridge|roof_|脊|瓦|檐|tile|椽)/.test(key)) color = 0xb96345;
  else if (/(plaque|匾|牌)/.test(key)) color = 0xf1ddaf;
  else if (/(finial|刹|tip)/.test(key)) color = 0xf6d08e;

  if (obj.material.clone) {
    obj.material = obj.material.clone();
    obj.material.color.setHex(color);
    obj.material.needsUpdate = true;
  }
}

function rememberState(root) {
  rememberBuildState(root);
  root.traverse((obj) => {
    if (obj.isObject3D && obj !== root) objectTint(obj);
  });
}

rememberState(pagoda.root);

function refreshStatus() {
  statusEl.textContent = `${getPhaseLabel(buildProgress)} · ${Math.round(buildProgress * 100)}%`;
  toggleBtn.textContent = isPlaying ? '暂停' : '继续';
  progressSlider.value = String(Math.round(buildProgress * 100));
}

function applyBuildState() {
  applySharedBuildState(pagoda.root, buildProgress, {
    activeLevel,
    keepActiveStoreys: pagoda.storeys,
  });
  refreshStatus();
}

function setOverviewCamera() {
  interiorMode = false;
  camera.position.set(0, 28, 62);
  controls.target.set(0, 12, 0);
  controls.update();
}

function setInteriorCamera() {
  interiorMode = true;
  interiorYaw = 0;
}

function updateInteriorCamera(dt) {
  if (!interiorMode) return;
  interiorYaw += dt * 0.22;
  const rise = 1.2 + buildProgress * 18;
  const radius = 7.0 + buildProgress * 8.0;
  const x = Math.sin(interiorYaw) * radius;
  const z = Math.cos(interiorYaw) * radius;
  camera.position.set(x, rise, z);
  controls.target.set(0, 2.6 + buildProgress * 14, 0);
  controls.update();
}

function setBuildProgress(next) {
  buildProgress = Math.min(1, Math.max(0, next));
  applyBuildState();
}

toggleBtn.addEventListener('click', () => {
  isPlaying = !isPlaying;
  refreshStatus();
});

resetBtn.addEventListener('click', () => {
  isPlaying = false;
  setBuildProgress(DEFAULT_BUILD_PROGRESS);
  refreshStatus();
});

overviewBtn.addEventListener('click', () => {
  isPlaying = false;
  setOverviewCamera();
});

interiorBtn.addEventListener('click', () => {
  setInteriorCamera();
  isPlaying = true;
  refreshStatus();
});

levelSelect.addEventListener('change', (event) => {
  activeLevel = event.target.value;
  applyBuildState();
});

progressSlider.addEventListener('input', (event) => {
  isPlaying = false;
  setBuildProgress(Number(event.target.value) / 100);
});

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (isPlaying) {
    buildProgress += dt * 0.18;
    if (buildProgress >= 1) {
      buildProgress = 1;
      isPlaying = false;
    }
    applyBuildState();
  }

  if (interiorMode) {
    updateInteriorCamera(dt);
  } else {
    controls.update();
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

setOverviewCamera();
setBuildProgress(DEFAULT_BUILD_PROGRESS);
animate();
