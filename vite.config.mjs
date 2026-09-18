import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 渲染层：开发走 5173，打包输出到 dist
export default defineConfig({
  plugins: [vue()],
  // Electron 用 file:// 加载打包结果时，资源必须用相对路径
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
