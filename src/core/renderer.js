/**
 * core/renderer.js —— 渲染器与相机
 * ─────────────────────────────────────────────────────────────
 * 创建 WebGLRenderer(抗锯齿、物理光照、ACESFilmic 色调映射、
 * PCFSoft 阴影)与 PerspectiveCamera(按真实尺度配置 near/far),
 * 处理窗口 resize 与像素比上限。
 * 相机初始位不写死在这里,由 interaction/cameraRig 决定。
 */

import {
  WebGLRenderer, PerspectiveCamera, Scene,
  PCFSoftShadowMap, ACESFilmicToneMapping, SRGBColorSpace,
  LineSegments, LineBasicMaterial, EdgesGeometry,
} from 'three';
import { GLOBAL } from '../data/pagodaParams.js';

/** 像素比上限:高分屏下 67m 尺度的全塔场景以 2 为性能与清晰度平衡点 */
const MAX_PIXEL_RATIO = 2;

/**
 * @param {HTMLElement} container
 * @param {{preserveDrawingBuffer?:boolean}} opt
 *   preserveDrawingBuffer 仅用于开发期离屏截图(停机后画面仍需可读取),
 *   正常运行不开启,以免多一次帧缓冲拷贝。
 */
export function addDebugOutline(root, {
  color = 0x0d0807,
  opacity = 1,
  thresholdAngle = 180,
  skip = () => false,
} = {}) {
  const material = new LineBasicMaterial({
    color,
    transparent: false,
    opacity,
    depthTest: true,
    depthWrite: false,
  });

  function walk(object) {
    if (!object || skip(object)) return;

    if (object.isMesh && object.geometry && !object.userData.debugOutline) {
      const outline = new LineSegments(
        new EdgesGeometry(object.geometry, thresholdAngle),
        material,
      );
      outline.name = `${object.name || 'mesh'}_outline`;
      outline.renderOrder = 999;
      object.userData.debugOutline = outline;
      object.add(outline);
    }

    object.children?.forEach(walk);
  }

  walk(root);
  return root;
}

export function createRenderer(container, { preserveDrawingBuffer = false } = {}) {
  const renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // near/far 按真实尺度:近景看斗拱榫卯(分级 1.7cm),远景含天空穹顶
  const camera = new PerspectiveCamera(
    45, window.innerWidth / window.innerHeight,
    0.05, GLOBAL.totalHeight * 200,
  );

  const scene = new Scene();

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  return { renderer, camera, scene, onResize };
}
