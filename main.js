// 主进程：开窗口，并把配置读写交给 persist
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const persist = require('./persist')
const oss = require('./oss')
const updater = require('./updater')

/** 选中还没传完的本地文件，页面只拿 id；值是 { path, rel } */
const pending = new Map()

/**
 * 把一个本地文件或文件夹展开成待传条目（文件夹保留相对路径）
 * @param {string} rootPath
 * @returns {Array<{ path: string, rel: string, size: number }>}
 */
function expandLocal(rootPath) {
  /** 结果列表 */
  const out = []

  /** 根路径元数据 */
  let st
  try {
    st = fs.statSync(rootPath)
  } catch {
    return out
  }

  // 单个文件：相对名就是文件名
  if (st.isFile()) {
    out.push({
      path: rootPath,
      rel: path.basename(rootPath),
      size: st.size
    })
    return out
  }

  // 不是目录也不是文件就跳过
  if (!st.isDirectory()) {
    return out
  }

  /** 文件夹顶层名，进 OSS 后作为这一层目录 */
  const baseName = path.basename(rootPath)

  /**
   * 递归读目录
   * @param {string} dir
   * @param {string} relDir - 相对路径，用 /
   */
  function walk(dir, relDir) {
    /** 这一层名字 */
    let names
    try {
      names = fs.readdirSync(dir)
    } catch {
      return
    }

    for (const name of names) {
      // 系统垃圾文件不传
      if (name === '.DS_Store' || name === 'Thumbs.db' || name === 'desktop.ini') {
        continue
      }

      /** 绝对路径 */
      const full = path.join(dir, name)
      /** OSS 对象相对键 */
      const rel = `${relDir}/${name}`.replace(/\\/g, '/')
      /** 子项元数据 */
      let child
      try {
        child = fs.statSync(full)
      } catch {
        continue
      }

      // 子目录继续往下走
      if (child.isDirectory()) {
        walk(full, rel)
        continue
      }

      // 普通文件收进列表
      if (child.isFile()) {
        out.push({ path: full, rel, size: child.size })
      }
    }
  }

  walk(rootPath, baseName)
  return out
}

/**
 * 把多条本地路径登记进 pending，返回给页面展示
 * @param {string[]} roots
 * @returns {{ ok: boolean, error?: string, files: Array<{ id: string, name: string, size: number }> }}
 */
function registerLocals(roots) {
  /** 展开后的全部文件 */
  const expanded = []

  for (const root of roots || []) {
    // 空路径跳过
    if (!root) {
      continue
    }
    expanded.push(...expandLocal(root))
  }

  // 一次拖太多容易卡死窗口
  if (expanded.length > 800) {
    return { ok: false, error: '一次最多上传 800 个文件，请拆开再传', files: [] }
  }

  /** 交给页面的条目 */
  const files = []

  for (const item of expanded) {
    /** 页面用来指回这条路径的 id */
    const id = `up-${Date.now()}-${pending.size}`
    pending.set(id, { path: item.path, rel: item.rel })
    files.push({
      id,
      /** 列表上显示相对路径，文件夹里的文件才看得出结构 */
      name: item.rel,
      size: item.size
    })
  }

  return { ok: true, files }
}

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

  // 检查更新与唤起外部下载
  ipcMain.handle('updater:check', () => updater.checkForUpdates())
  ipcMain.handle('updater:openUrl', (_event, url) => {
    // 只允许打开 http 和 https 链接，防止安全隐患
    if (url && (String(url).startsWith('https://') || String(url).startsWith('http://'))) {
      shell.openExternal(url)
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
    /** 文件框参数，允许多选文件 */
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

    /** 登记进 pending */
    const res = registerLocals(picked.filePaths)
    // 超限等错误也交回页面
    if (!res.ok) {
      return { ok: false, canceled: false, error: res.error || '选择失败', files: [] }
    }
    return { ok: true, canceled: false, files: res.files }
  })
  ipcMain.handle('oss:pickFolder', async (event) => {
    /** 挂到发起请求的窗口上 */
    const win = BrowserWindow.fromWebContents(event.sender)
    /** 文件夹框，可多选 */
    const options = {
      title: '选择要上传的文件夹',
      properties: ['openDirectory', 'multiSelections']
    }
    /** 用户选的本地目录 */
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    // 取消
    if (picked.canceled || !picked.filePaths.length) {
      return { ok: true, canceled: true, files: [] }
    }

    /** 展开目录里所有文件并登记 */
    const res = registerLocals(picked.filePaths)
    if (!res.ok) {
      return { ok: false, canceled: false, error: res.error || '选择失败', files: [] }
    }
    // 空文件夹
    if (!res.files.length) {
      return { ok: false, canceled: false, error: '文件夹是空的', files: [] }
    }
    return { ok: true, canceled: false, files: res.files }
  })
  ipcMain.handle('oss:addFiles', async (_event, filePaths) => {
    /** 拖拽进来的路径，文件和文件夹都支持 */
    const res = registerLocals(Array.isArray(filePaths) ? filePaths : [])
    // 超限等
    if (!res.ok) {
      return { ok: false, error: res.error || '添加失败', files: [] }
    }
    return { ok: true, files: res.files }
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
    /** 主进程里对应的本地路径 + 相对键 */
    const items = []

    for (const id of ids) {
      /** 当初选文件时记下的条目 */
      const entry = pending.get(id)

      // 弹窗关过或 id 对不上，就不能传
      if (!entry) {
        return { ok: false, error: '有文件已失效，请重新选择', uploaded: 0 }
      }

      // 兼容旧数据：曾经直接存字符串路径
      if (typeof entry === 'string') {
        items.push({ path: entry, rel: path.basename(entry) })
      } else {
        items.push({ path: entry.path, rel: entry.rel })
      }
    }

    // 一个都没留
    if (!items.length) {
      return { ok: false, error: '请先添加文件', uploaded: 0 }
    }

    try {
      /** 传到当前目录，进度按 id 推回页面 */
      const data = await oss.upload(hit, payload && payload.place, items, (index, percent) => {
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
  ipcMain.handle('oss:readText', async (_event, payload) => {
    /** 当前匹配的 OSS 配置 */
    const hit = storeById(payload && payload.id)

    // 检查配置是否存在
    if (!hit) {
      return { ok: false, error: '没有这条 OSS 配置', content: '' }
    }

    try {
      /** 从 OSS 获取文本内容 */
      const data = await oss.readText(hit, payload && payload.key)
      return data
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : '读取文件失败',
        content: ''
      }
    }
  })
  ipcMain.handle('oss:saveText', async (_event, payload) => {
    /** 当前匹配的 OSS 配置 */
    const hit = storeById(payload && payload.id)

    // 检查配置是否存在
    if (!hit) {
      return { ok: false, error: '没有这条 OSS 配置' }
    }

    try {
      /** 保存文本至 OSS 覆盖同名对象 */
      const data = await oss.saveText(hit, payload && payload.key, payload && payload.text)
      return data
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : '保存文件失败'
      }
    }
  })
}

/** 配置应用顶栏菜单：macOS 仅保留必要主菜单并隐藏 Edit 保持快捷键生效，Windows/Linux 清空菜单 */
function setupAppMenu() {
  // macOS 环境下定制极简菜单，隐藏 File / Edit / View / Window
  if (process.platform === 'darwin') {
    /** 极简菜单模板：保留应用主菜单，Edit 菜单隐藏以保持快捷键可用 */
    const template = [
      {
        label: app.name,
        submenu: [
          { role: 'about', label: `关于 ${app.name}` },
          { type: 'separator' },
          { role: 'hide', label: `隐藏 ${app.name}` },
          { role: 'hideOthers', label: '隐藏其他' },
          { role: 'unhide', label: '显示全部' },
          { type: 'separator' },
          { role: 'quit', label: `退出 ${app.name}` }
        ]
      },
      {
        // 设为不可见：顶栏不显示，但保证 Cmd+C / Cmd+V / Cmd+A / Cmd+Z 等快捷键正常响应
        label: 'Edit',
        visible: false,
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      }
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  } else {
    // Windows / Linux 直接清空窗口菜单
    Menu.setApplicationMenu(null)
  }
}

// 应用就绪后再开窗
app.whenReady().then(() => {
  setupAppMenu()
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
