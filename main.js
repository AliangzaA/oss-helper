// 主进程：开窗口，并把配置读写交给 persist
const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const path = require('path')
const persist = require('./persist')

/** 主窗口引用，避免被垃圾回收提前关掉 */
let win = null

/** 创建主窗口并加载页面 */
function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 780,
    title: 'OSS Helper',
    // 先藏起来，最大化后再显示，避免先闪一下小窗
    show: false,
    webPreferences: {
      // 预加载脚本：以后在这里暴露安全 API
      preload: path.join(__dirname, 'preload.js'),
      // 隔离上下文，防止页面脚本直接碰 Node
      contextIsolation: true,
      // 关闭渲染进程 Node，更安全
      nodeIntegration: false
    }
  })

  // 窗口级菜单也清掉，避免按 Alt 又把 File / Edit 顶出来
  win.removeMenu()

  // 铺满工作区：标题栏、任务栏都留着
  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  // 开发时加载 Vite；打包后才走 dist
  if (process.argv.includes('--dev')) {
    win.loadURL('http://127.0.0.1:5173')
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }
}

/** 页面来读配置、写配置、改目录，都走这里 */
function bindStore() {
  ipcMain.handle('store:load', () => persist.loadAll())
  ipcMain.handle('store:save', (_event, data) => persist.saveStores(data))
  ipcMain.handle('store:pickDir', () => persist.pickDir())
  ipcMain.handle('store:resetDir', () => persist.resetDir())
}

// 应用就绪后再开窗
app.whenReady().then(() => {
  // 去掉 Electron 在 Windows 上默认的 File / Edit / View / Window
  Menu.setApplicationMenu(null)
  bindStore()
  createWindow()

  // macOS 点 Dock 图标时，没有窗口就再开一个
  app.on('activate', () => {
    // 当前没有任何窗口才重建
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关掉时退出（macOS 除外，习惯挂在后台）
app.on('window-all-closed', () => {
  // 非 macOS 直接退出进程
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
