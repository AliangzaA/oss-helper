// 主进程：开窗口，并把配置读写交给 persist
const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const path = require('path')
const persist = require('./persist')
const oss = require('./oss')

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
    // 菜单被清掉后，系统不再带调试快捷键，开发时用 F12 自己开
    win.webContents.on('before-input-event', (_event, input) => {
      // 只认按下，避免松开再关一次
      if (input.type === 'keyDown' && input.key === 'F12') {
        win.webContents.toggleDevTools()
      }
    })
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }
}

/** 按 id 从磁盘取出一条已解密的配置，没有就 null */
function storeById(id) {
  /** 当前目录里的全部配置 */
  const all = persist.loadAll()
  return all.stores.find((item) => item.id === String(id || '')) || null
}

/** 页面来读配置、写配置、改目录，都走这里 */
function bindStore() {
  ipcMain.handle('store:load', () => persist.loadAll())
  ipcMain.handle('store:save', (_event, data) => persist.saveStores(data))
  ipcMain.handle('store:pickDir', () => persist.pickDir())
  ipcMain.handle('store:resetDir', () => persist.resetDir())
  ipcMain.handle('oss:find', async (_event, payload) => {
    /** 页面点中的那一条 */
    const hit = storeById(payload && payload.id)

    // 列表里没有，多半是刚删掉或 id 不对
    if (!hit) {
      return { ok: false, error: '没有这条 OSS 配置', items: [] }
    }

    try {
      /** 查找结果 */
      const data = await oss.find(hit, payload && payload.place, payload && payload.keyword)
      return { ok: true, error: '', ...data }
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : '查找失败',
        items: []
      }
    }
  })
  ipcMain.handle('oss:ensure', async (_event, payload) => {
    /** 刚保存的那一条 */
    const hit = storeById(payload && payload.id)

    // 磁盘上还没有这条，就先别连 OSS
    if (!hit) {
      return { ok: false, error: '没有这条 OSS 配置', created: false }
    }

    try {
      /** 没有目录时是否新建了 */
      const data = await oss.ensureDir(hit)
      return { ok: true, error: '', ...data }
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : '创建目录失败',
        created: false
      }
    }
  })
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
