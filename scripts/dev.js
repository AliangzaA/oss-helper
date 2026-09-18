// 开发启动：先起 Vite，页面能打开后再开 Electron
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

/** 项目根目录 */
const root = path.join(__dirname, '..')

/** Vite 地址，要和 vite.config.mjs 的端口一致 */
const devUrl = 'http://127.0.0.1:5173'

/** Vite 进程 */
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], {
  cwd: root,
  stdio: 'inherit'
})

/** Electron 进程，避免探测成功时开两次 */
let electron = null

/** 关掉 Vite，避免窗口关了端口还占着 */
function stopVite(code) {
  // 已经退出就别再杀
  if (vite && !vite.killed) {
    vite.kill()
  }

  process.exit(code ?? 0)
}

/** 等首页能访问，再打开窗口 */
function waitReady() {
  /** 探测开发服务 */
  const req = http.get(devUrl, (res) => {
    res.resume()

    // 窗口已经开过
    if (electron) {
      return
    }

    electron = spawn(
      process.execPath,
      [path.join(root, 'node_modules', 'electron', 'cli.js'), root, '--dev'],
      {
        cwd: root,
        stdio: 'inherit'
      }
    )

    electron.on('exit', (code) => {
      stopVite(code)
    })
  })

  req.on('error', () => {
    // 服务还没起来
    setTimeout(waitReady, 300)
  })
}

vite.on('exit', (code) => {
  // Vite 先挂了，窗口也关掉
  if (electron && !electron.killed) {
    electron.kill()
    return
  }

  // 窗口还没开就失败
  if (!electron) {
    process.exit(code ?? 1)
  }
})

waitReady()
