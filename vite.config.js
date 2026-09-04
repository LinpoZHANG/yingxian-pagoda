// vite.config.js
// 极简配置:纯前端静态项目,无框架、无插件。
// base 设为 './' 以便 build 后可直接双击 index.html 或放任意静态目录运行(便于交付验收)。
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    // 两个入口都要进 dist:index.html 是成品场景,
    // debug-structure.html 是构造检视页(按建造顺序逐单元显隐,查支承关系)。
    // vite 默认只打包 index.html,不写这段的话调试页在构建产物里会缺席。
    rollupOptions: {
      input: {
        main: 'index.html',
        debug: 'debug-structure.html',
      },
    },
  },
});
