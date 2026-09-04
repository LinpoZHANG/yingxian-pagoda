/**
 * scene/environment/EnvironmentSystem.js —— 环境装配
 * ─────────────────────────────────────────────────────────────
 * 只负责「建好并挂上」。昼夜不走「切换预设」那条路 ——
 * 由 main.js 每帧把 lighting.value(同一个插值时钟)喂给各模块的
 * setDayNight,过渡才连续。曾经存在的 applyPreset/setPreset/syncState
 * 一次也没有被调用过,已删。
 */

import { Group } from 'three';
import { createGround } from '../ground.js';
import { createSky } from '../sky.js';
import { createLighting } from '../lighting.js';
import { createHorizonRange } from './createHorizonRange.js';
import { createFarmland } from './createFarmland.js';
import { createOutlyingHamlets } from './createOutlyingHamlets.js';
import { createDistantVegetation } from './createDistantVegetation.js';
import { getEnvironmentPreset } from './EnvironmentConfig.js';

export function createEnvironmentSystem(scene, initialPreset = 'day') {
  const preset = getEnvironmentPreset(initialPreset);
  const root = new Group();
  root.name = 'environment-root';

  // 远山地平线取代旧的 atmosphere 雾罩 + mountainLayers 球壳/立面片。
  // 雾罩(alpha 0.9 的球)是「山看不见」的直接凶手:它在所有山层之后绘制,
  // 把地平线以上的一切覆写掉九成。空气透视改由 scene.fog(按距离)
  // 与山脊着色器(按层)承担 —— 一层全局罩子做不出近浓远淡。
  const nightPreset = getEnvironmentPreset('night');
  const horizon = createHorizonRange({
    rockLit: preset.rockLit,
    rockShadow: preset.rockShadow,
    loessLit: preset.loessLit,
    loessShadow: preset.loessShadow,
    nightRockLit: nightPreset.rockLit,
    nightRockShadow: nightPreset.rockShadow,
    nightLoessLit: nightPreset.loessLit,
    nightLoessShadow: nightPreset.loessShadow,
  });
  const farmland = createFarmland({ towerHeight: 67.31, seed: 22.2 });
  const hamlets = createOutlyingHamlets({ towerHeight: 67.31, seed: 88.2 });
  const vegetation = createDistantVegetation({ towerHeight: 67.31, seed: 44.3 });

  root.add(horizon.group, farmland.group, hamlets.group, vegetation.group);
  scene.add(root);

  const ground = createGround(scene, preset);
  const sky = createSky(scene, preset);
  const lighting = createLighting(scene);
  // 天—地接缝消隐的前提:天空的地平线收敛色 = scene.fog 的颜色 = 霾带的颜色。
  // 三者同源才对得上;各写各的,接缝一定会回来。
  sky.setFogColor?.(preset.fogColor, nightPreset.fogColor);

  return {
    preset,
    root,
    ground,
    sky,
    lighting,
    horizon,
    farmland,
    hamlets,
    vegetation,
    /** 每帧:山脊层锚定到相机脚下(相机相对距离恒定) */
    tick(dt, camera) {
      horizon.tick(dt, camera);
    },
    dispose() {
      ground?.dispose?.();
      sky?.dispose?.();
      lighting?.dispose?.();
      horizon?.dispose?.();
      farmland?.dispose?.();
      hamlets?.dispose?.();
      vegetation?.dispose?.();
      scene.remove(root);
    },
  };
}
