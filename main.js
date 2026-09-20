// 主进程：开窗口，并把配置读写交给 persist
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const persist = require('./persist')
const oss = require('./oss')

/** 选中还没传完的本地文件，页面只拿 id，避免随便传一个路径就能读盘 */
const pending = new Map()

/** 主窗口引用，避免被垃圾回收提前关掉 */
let win = null

/** 创建主窗口并加载页面 */
function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 780,
    title: 'OSS Helper',
    // 开在屏幕中间，不要一上来就铺满
    center: true,
    // 先藏起来，页面好了再显示，避免先闪空白窗
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

  // 页面好了再显示，保持普通窗口大小
  win.once('ready-to-show', () => {
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
  ipcMain.handle('config:export', async (_event, data) => {
    try {
      /** 用户取消时没有文件路径 */
      const result = await persist.exportConfig(data)

      // 取消不是失败
      if (result.canceled) {
        return { ok: false, canceled: true }
      }

      return { ok: true, canceled: false, file: result.file }
    } catch (err) {
      return { ok: false, canceled: false, error: err && err.message ? err.message : '导出失败' }
    }
  })
  ipcMain.handle('config:import', async () => {
    try {
      /** 读到的配置，或用户取消 */
      const result = await persist.importConfig()

      // 取消就不动表单
      if (result.canceled) {
        return { ok: false, canceled: true }
      }

      return { ok: true, canceled: false, config: result.config }
    } catch (err) {
      return { ok: false, canceled: false, error: err && err.message ? err.message : '导入失败' }
    }
  })
  ipcMain.handle('file:saveImage', async (_event, payload) => {
    try {
      /** 保存框结果 */
      const result = await persist.saveImage(payload && payload.name, payload && payload.dataUrl)

      // 取消不是失败
      if (result.canceled) {
        return { ok: false, canceled: true }
      }

      return { ok: true, canceled: false, file: result.file }
    } catch (err) {
      return { ok: false, canceled: false, error: err && err.message ? err.message : '保存失败' }
    }
  })
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
  ipcMain.handle('oss:pick', async (event) => {
    /** 挂到发起请求的窗口上 */
    const win = BrowserWindow.fromWebContents(event.sender)
    /** 文件框参数，允许多选 */
    const options = {
      title: '选择要上传的文件',
      properties: ['openFile', 'multiSelections']
    }
    /** 用户选的本地文件 */
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    // 取消就没有新文件
    if (picked.canceled || !picked.filePaths.length) {
      return { ok: true, canceled: true, files: [] }
    }

    /** 交给页面展示的条目，路径留在主进程 */
    const files = []

    for (const filePath of picked.filePaths) {
      // 空路径跳过
      if (!filePath) {
        continue
      }

      /** 页面用来指回这条路径的 id */
      const id = `up-${Date.now()}-${pending.size}`
      /** 列表上要显示的大小，读不到就当 0 */
      let size = 0

      try {
        size = fs.statSync(filePath).size
      } catch {
        // 文件刚被挪走时仍让用户看见名字，真正上传时再报错
        size = 0
      }

      pending.set(id, filePath)
      files.push({
        id,
        name: path.basename(filePath),
        size
      })
    }

    return { ok: true, canceled: false, files }
  })
  ipcMain.handle('oss:forget', (_event, ids) => {
    /** 页面关掉弹窗或拿掉的那些 id */
    const list = Array.isArray(ids) ? ids : []
    list.forEach((id) => pending.delete(id))
    return { ok: true }
  })
  ipcMain.handle('oss:upload', async (event, payload) => {
    /** 当前这条配置 */
    const hit = storeById(payload && payload.id)

    // 没有配置就不要传
    if (!hit) {
      return { ok: false, error: '没有这条 OSS 配置', uploaded: 0 }
    }

    /** 弹窗里还留着的文件 id */
    const ids = Array.isArray(payload && payload.fileIds) ? payload.fileIds : []
    /** 主进程里对应的本地路径，不采用页面传来的路径 */
    const paths = []

    for (const id of ids) {
      /** 当初选文件时记下的路径 */
      const filePath = pending.get(id)

      // 弹窗关过或 id 对不上，就不能传
      if (!filePath) {
        return { ok: false, error: '有文件已失效，请重新选择', uploaded: 0 }
      }

      paths.push(filePath)
    }

    // 一个都没留
    if (!paths.length) {
      return { ok: false, error: '请先添加文件', uploaded: 0 }
    }

    try {
      /** 传到当前目录，进度按 id 推回页面 */
      const data = await oss.upload(hit, payload && payload.place, paths, (index, percent) => {
        // 窗口已经关了就别再推
        if (event.sender.isDestroyed()) {
          return
        }

        event.sender.send('oss:progress', { id: ids[index], percent })
      })
      ids.forEach((id) => pending.delete(id))
      return { ok: true, error: '', ...data }
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : '上传失败',
        uploaded: 0
      }
    }
  })
  ipcMain.handle('oss:mkdir', async (_event, payload) => {
    /** 当前这条配置 */
    const hit = storeById(payload && payload.id)

    // 没有配置就建不了
    if (!hit) {
      return { ok: false, error: '没有这条 OSS 配置' }
    }

    try {
      /** 新建的目录 */
      const data = await oss.mkdir(hit, payload && payload.place, payload && payload.name)
      return { ok: true, error: '', ...data }
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : '新建文件夹失败' }
    }
  })
  ipcMain.handle('oss:remove', async (_event, payload) => {
    /** 当前这条配置 */
    const hit = storeById(payload && payload.id)

    // 没有配置就删不了
    if (!hit) {
      return { ok: false, error: '没有这条 OSS 配置' }
    }

    try {
      /** 删掉的数量 */
      const data = await oss.removeItems(hit, payload && payload.items)
      return { ok: true, error: '', ...data }
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : '删除失败' }
    }
  })
  ipcMain.handle('oss:rename', async (_event, payload) => {
    /** 当前这条配置 */
    const hit = storeById(payload && payload.id)

    // 没有配置就改不了
    if (!hit) {
      return { ok: false, error: '没有这条 OSS 配置' }
    }

    try {
      /** 改名结果 */
      const data = await oss.rename(hit, payload && payload.item, payload && payload.name)
      return { ok: true, error: '', ...data }
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : '改名失败' }
    }
  })
  ipcMain.handle('oss:logos', async (_event, payload) => {
    /** 当前这条配置 */
    const hit = storeById(payload && payload.id)

    // 没有配置就读不了 Logo
    if (!hit) {
      return { ok: false, error: '没有这条 OSS 配置', files: [] }
    }

    try {
      /** 桶里这一层的图片 */
      const data = await oss.listLogos(hit)
      return { ok: true, error: '', ...data }
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : '读取 Logo 失败',
        files: []
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
