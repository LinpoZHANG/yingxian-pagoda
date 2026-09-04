// vite.config.js
// 极简配置:纯前端静态项目,无框架、无插件。
// base 设为 './' 以便 build 后可直接双击 index.html 或放任意静态目录运行(便于交付验收)。
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
