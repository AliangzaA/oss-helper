import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 渲染层：开发走 5173，打包输出到 dist
export default defineConfig({
  plugins: [vue()],
  // Electron 用 file:// 加载打包结果时，资源必须用相对路径
  base: './',
  server: {
    // 固定 IPv4，和 main.js、dev.js 里的 127.0.0.1 一致
    // Windows 上 localhost 常落到 ::1，探测 127.0.0.1 会一直失败，窗口就打不开
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
