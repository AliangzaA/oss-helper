// 主进程：窗口、配置读写、选文件、批量上传、二维码
const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')
const QRCode = require('qrcode')
const {
  checkConfig,
  buildKey,
  createClient,
  buildUrl,
  putFile,
  listDir,
  mkdir,
  removeObject,
  removePrefix,
  renameFile,
  renameFolder,
  browsePrefix
} = require('./oss')

/** 主窗口引用，避免被垃圾回收提前关掉 */
let win = null

/** 是否正在上传，防止重复点击 */
let uploading = false

/** 配置文件名，落在 userData 目录 */
const configName = 'oss-config.json'

/** 拼出配置文件完整路径 */
function configPath() {
  return path.join(app.getPath('userData'), configName)
}

/** 从磁盘读 OSS 配置，没有文件就返回空对象 */
function loadConfig() {
  /** 配置文件路径 */
  const file = configPath()

  // 还没保存过就当空配置，避免首次启动报错
  if (!fs.existsSync(file)) {
    return {}
  }

  try {
    /** 磁盘上的原始 JSON 文本 */
    const raw = fs.readFileSync(file, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    // 文件坏了就返回空，让用户重新填
    console.error('load config failed', err)
    return {}
  }
}

/** 把 OSS 配置写到磁盘 */
function saveConfig(data) {
  /** 只保留白名单字段，防止脏数据写进文件 */
  const next = {
    accessKeyId: String(data.accessKeyId || ''),
    accessKeySecret: String(data.accessKeySecret || ''),
    region: String(data.region || ''),
    endpoint: String(data.endpoint || ''),
    bucket: String(data.bucket || ''),
    prefix: String(data.prefix || ''),
    customDomain: String(data.customDomain || '')
  }

  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

/** 向渲染进程推送上传进度事件 */
function sendProgress(payload) {
  // 窗口没了就别发，避免空引用
  if (!win || win.isDestroyed()) {
    return
  }

  win.webContents.send('upload:progress', payload)
}

/** 把链接生成二维码 DataURL（高纠错，方便中间叠 Logo） */
async function makeQr(url) {
  return QRCode.toDataURL(url, {
    margin: 2,
    width: 360,
    errorCorrectionLevel: 'H'
  })
}

/** Logo 文件名前缀，落在 userData */
const logoPrefix = 'app-logo'

/** 找出已保存的 Logo 文件路径，没有则 null */
function findLogoFile() {
  /** userData 目录 */
  const dir = app.getPath('userData')

  // 目录异常时当没有 Logo
  if (!fs.existsSync(dir)) {
    return null
  }

  /** 匹配 app-logo.* */
  const hit = fs.readdirSync(dir).find((name) => name.startsWith(`${logoPrefix}.`))

  // 没找到
  if (!hit) {
    return null
  }

  return path.join(dir, hit)
}

/** 扩展名对应 MIME */
function logoMime(filePath) {
  /** 小写扩展名 */
  const ext = path.extname(filePath || '').toLowerCase()

  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg'
  }

  if (ext === '.webp') {
    return 'image/webp'
  }

  if (ext === '.gif') {
    return 'image/gif'
  }

  return 'image/png'
}

/** 清除已保存的 Logo 文件 */
function clearLogoFiles() {
  /** userData 目录 */
  const dir = app.getPath('userData')

  // 目录不存在就不用清
  if (!fs.existsSync(dir)) {
    return
  }

  fs.readdirSync(dir).forEach((name) => {
    // 只删 Logo 相关文件
    if (name.startsWith(`${logoPrefix}.`)) {
      fs.unlinkSync(path.join(dir, name))
    }
  })
}

/** 选择并保存应用 Logo */
async function pickLogo() {
  /** 对话框 */
  const result = await dialog.showOpenDialog(win, {
    title: '选择应用 Logo',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
    ]
  })

  // 取消
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true, hasLogo: !!findLogoFile() }
  }

  /** 源文件 */
  const src = result.filePaths[0]
  /** 扩展名 */
  const ext = path.extname(src).toLowerCase() || '.png'
  /** 目标路径 */
  const dest = path.join(app.getPath('userData'), `${logoPrefix}${ext}`)

  clearLogoFiles()
  fs.copyFileSync(src, dest)

  return {
    ok: true,
    canceled: false,
    hasLogo: true,
    dataUrl: fileToDataUrl(dest)
  }
}

/** 本地图片转 DataURL */
function fileToDataUrl(filePath) {
  /** 二进制 */
  const buf = fs.readFileSync(filePath)
  return `data:${logoMime(filePath)};base64,${buf.toString('base64')}`
}

/** 读取当前 Logo DataURL */
function loadLogoDataUrl() {
  /** Logo 路径 */
  const file = findLogoFile()

  // 没设过
  if (!file) {
    return { ok: true, hasLogo: false, dataUrl: '' }
  }

  try {
    return { ok: true, hasLogo: true, dataUrl: fileToDataUrl(file) }
  } catch (err) {
    return {
      ok: false,
      hasLogo: false,
      dataUrl: '',
      error: err && err.message ? err.message : String(err)
    }
  }
}

/** 创建主窗口并加载页面 */
function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 780,
    title: 'OSS Helper',
    webPreferences: {
      // 预加载脚本：在渲染进程暴露安全 API
      preload: path.join(__dirname, 'preload.js'),
      // 隔离上下文，防止页面脚本直接碰 Node
      contextIsolation: true,
      // 关闭渲染进程 Node，更安全
      nodeIntegration: false
    }
  })

  // 开发时加载 Vite 空白页；打包后才走 dist
  if (process.argv.includes('--dev')) {
    win.loadURL('http://127.0.0.1:5173')
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  // F12 / Ctrl+Shift+I 打开或关闭开发者工具（Electron 默认不跟浏览器一样绑 F12）
  win.webContents.on('before-input-event', (_event, input) => {
    // 只处理按下，忽略松开
    if (input.type !== 'keyDown') {
      return
    }

    /** 是否按下 F12 */
    const hitF12 = input.key === 'F12'
    /** 是否 Ctrl+Shift+I（Windows）或 Cmd+Option+I（mac） */
    const hitInspect =
      input.key.toLowerCase() === 'i' &&
      input.shift &&
      ((process.platform === 'darwin' && input.meta) ||
        (process.platform !== 'darwin' && input.control))

    // 命中快捷键就切换控制台
    if (hitF12 || hitInspect) {
      win.webContents.toggleDevTools()
    }
  })
}

/** 弹出多选 APK 对话框 */
async function pickFiles() {
  /** 对话框结果 */
  const result = await dialog.showOpenDialog(win, {
    title: '选择 APK 文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Android APK', extensions: ['apk'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  // 用户取消就不返回路径
  if (result.canceled || !result.filePaths.length) {
    return []
  }

  return result.filePaths.map((filePath) => {
    /** 文件体积，用于列表展示 */
    const size = fs.statSync(filePath).size
    return {
      path: filePath,
      name: path.basename(filePath),
      size
    }
  })
}

/** 按队列逐个上传，返回每项结果 */
async function uploadFiles(filePaths) {
  /** 当前已存配置 */
  const config = loadConfig()
  /** 配置校验错误 */
  const configError = checkConfig(config)

  // 配置不齐直接拒绝整批
  if (configError) {
    return { ok: false, error: configError, items: [] }
  }

  // 已经在传就拒绝重入
  if (uploading) {
    return { ok: false, error: '正在上传中，请稍候', items: [] }
  }

  // 空列表没意义
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return { ok: false, error: '请先选择 APK 文件', items: [] }
  }

  uploading = true

  /** OSS 客户端 */
  const client = createClient(config)
  /** 汇总结果 */
  const items = []

  try {
    for (let i = 0; i < filePaths.length; i += 1) {
      /** 当前本地路径 */
      const filePath = filePaths[i]
      /** 文件名 */
      const name = path.basename(filePath)
      /** 对象键 */
      const objectKey = buildKey(config.prefix, filePath)
      /** 单项结果骨架 */
      const item = {
        name,
        path: filePath,
        objectKey,
        ok: false,
        url: '',
        qr: '',
        error: ''
      }

      try {
        sendProgress({
          index: i,
          total: filePaths.length,
          name,
          percent: 0,
          stage: 'start'
        })

        await putFile(client, objectKey, filePath, (percent) => {
          sendProgress({
            index: i,
            total: filePaths.length,
            name,
            percent,
            stage: 'progress'
          })
        })

        /** 公网链接 */
        const url = buildUrl(config, objectKey)
        /** 二维码图 */
        const qr = await makeQr(url)

        item.ok = true
        item.url = url
        item.qr = qr

        sendProgress({
          index: i,
          total: filePaths.length,
          name,
          percent: 100,
          stage: 'done',
          url,
          qr
        })
      } catch (err) {
        item.error = err && err.message ? err.message : String(err)
        sendProgress({
          index: i,
          total: filePaths.length,
          name,
          percent: 0,
          stage: 'error',
          error: item.error
        })
      }

      items.push(item)
    }

    return { ok: true, error: '', items }
  } finally {
    uploading = false
  }
}

// 渲染进程要读配置
ipcMain.handle('config:load', () => {
  return loadConfig()
})

// 渲染进程要存配置
ipcMain.handle('config:save', (_event, data) => {
  return saveConfig(data || {})
})

/** 浏览某一层目录，空前缀从桶根开始 */
async function browseDir(prefix) {
  /** 当前已存配置 */
  const config = loadConfig()
  /** 配置校验错误 */
  const configError = checkConfig(config)

  // 配置不齐无法连 OSS
  if (configError) {
    return { ok: false, error: configError, prefix: '', folders: [], files: [] }
  }

  try {
    /** OSS 客户端 */
    const client = createClient(config)
    /** 列表结果 */
    const data = await listDir(client, prefix || '')

    // 给每个文件带上公网链接，方便前端复制
    data.files = (data.files || []).map((file) => ({
      ...file,
      url: buildUrl(config, file.key)
    }))

    return {
      ok: true,
      error: '',
      bucket: config.bucket,
      ...data
    }
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
      prefix: String(prefix || ''),
      folders: [],
      files: []
    }
  }
}

/** 向渲染进程推送浏览页上传进度 */
function sendBrowseProgress(payload) {
  // 窗口没了就别发
  if (!win || win.isDestroyed()) {
    return
  }

  win.webContents.send('browse:upload-progress', payload)
}

/** 弹出多选任意文件对话框（浏览页上传用） */
async function pickAnyFiles() {
  // 先把主窗口拉到前台，避免系统文件框被挡住像“没反应”
  if (win && !win.isDestroyed()) {
    win.focus()
  }

  /** 对话框结果 */
  const result = await dialog.showOpenDialog(win, {
    title: '选择要上传的文件',
    properties: ['openFile', 'multiSelections']
  })

  // 用户取消
  if (result.canceled || !result.filePaths.length) {
    return []
  }

  return result.filePaths
}

/** 把本地文件上传到指定浏览目录 */
async function uploadToDir(prefix, filePaths) {
  /** 当前配置 */
  const config = loadConfig()
  /** 配置错误 */
  const configError = checkConfig(config)

  if (configError) {
    return { ok: false, error: configError, items: [] }
  }

  // 空列表直接返回
  if (!Array.isArray(filePaths) || !filePaths.length) {
    return { ok: false, error: '未选择文件', items: [] }
  }

  /** OSS 客户端 */
  const client = createClient(config)
  /** 目标目录前缀 */
  const head = browsePrefix(prefix)
  /** 结果列表 */
  const items = []
  /** 总数 */
  const total = filePaths.length

  sendBrowseProgress({
    stage: 'start',
    index: 0,
    total,
    name: '',
    percent: 0,
    message: `开始上传，共 ${total} 个文件`
  })

  for (let i = 0; i < filePaths.length; i += 1) {
    /** 当前本地路径 */
    const filePath = filePaths[i]
    /** 文件名 */
    const name = path.basename(filePath)
    /** 对象键 */
    const objectKey = `${head}${name}`
    /** 单项 */
    const item = { name, objectKey, ok: false, error: '' }

    sendBrowseProgress({
      stage: 'file-start',
      index: i,
      total,
      name,
      percent: 0,
      message: `正在上传（${i + 1}/${total}）：${name}`
    })

    try {
      await putFile(client, objectKey, filePath, (percent) => {
        sendBrowseProgress({
          stage: 'progress',
          index: i,
          total,
          name,
          percent,
          message: `正在上传（${i + 1}/${total}）：${name} ${percent}%`
        })
      })
      item.ok = true
      sendBrowseProgress({
        stage: 'file-done',
        index: i,
        total,
        name,
        percent: 100,
        message: `已完成（${i + 1}/${total}）：${name}`
      })
    } catch (err) {
      item.error = err && err.message ? err.message : String(err)
      sendBrowseProgress({
        stage: 'file-error',
        index: i,
        total,
        name,
        percent: 0,
        message: `失败（${i + 1}/${total}）：${name}`,
        error: item.error
      })
    }

    items.push(item)
  }

  /** 成功数 */
  const okCount = items.filter((item) => item.ok).length
  sendBrowseProgress({
    stage: 'done',
    index: total,
    total,
    name: '',
    percent: 100,
    message: `上传结束：成功 ${okCount} / ${total}`
  })

  return {
    ok: okCount > 0,
    error: okCount === items.length ? '' : `成功 ${okCount} / ${items.length}`,
    items
  }
}

/** 统一包一层：配置校验后拿 client */
function withClient() {
  /** 配置 */
  const config = loadConfig()
  /** 错误 */
  const error = checkConfig(config)

  // 配置不齐
  if (error) {
    return { ok: false, error, client: null, config: null }
  }

  return { ok: true, error: '', client: createClient(config), config }
}

// 浏览桶内目录（空=根）
ipcMain.handle('browse:list', async (_event, prefix) => {
  return browseDir(prefix || '')
})

// 当前目录新建文件夹
ipcMain.handle('browse:mkdir', async (_event, payload) => {
  /** client 包装 */
  const pack = withClient()

  if (!pack.ok) {
    return { ok: false, error: pack.error }
  }

  try {
    /** 新建出的目录前缀 */
    const folderKey = await mkdir(
      pack.client,
      payload && payload.prefix,
      payload && payload.name
    )
    return { ok: true, error: '', prefix: folderKey }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) }
  }
})

// 删除文件或目录
ipcMain.handle('browse:remove', async (_event, payload) => {
  /** client 包装 */
  const pack = withClient()

  if (!pack.ok) {
    return { ok: false, error: pack.error }
  }

  try {
    /** 类型：file / folder */
    const type = payload && payload.type
    /** 目标 */
    const target = payload && payload.target

    // 删目录走前缀批量
    if (type === 'folder') {
      /** 删除统计 */
      const result = await removePrefix(pack.client, target)
      return { ok: true, error: '', deleted: result.deleted }
    }

    await removeObject(pack.client, target)
    return { ok: true, error: '', deleted: 1 }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) }
  }
})

// 重命名文件或目录（同层改名）
ipcMain.handle('browse:rename', async (_event, payload) => {
  /** client 包装 */
  const pack = withClient()

  if (!pack.ok) {
    return { ok: false, error: pack.error }
  }

  try {
    /** 类型 */
    const type = payload && payload.type
    /** 原路径 */
    const from = payload && payload.from
    /** 新名字 */
    const name = payload && payload.name

    // 目录与文件走不同实现
    if (type === 'folder') {
      /** 目录改名结果 */
      const result = await renameFolder(pack.client, from, name)
      return { ok: true, error: '', ...result }
    }

    /** 文件改名结果 */
    const result = await renameFile(pack.client, from, name)
    return { ok: true, error: '', ...result }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) }
  }
})

// 上传到当前浏览目录
ipcMain.handle('browse:upload', async (_event, prefix) => {
  /** 选出的本地路径 */
  const paths = await pickAnyFiles()

  // 取消选择
  if (!paths.length) {
    return { ok: false, error: '', canceled: true, items: [] }
  }

  return uploadToDir(prefix || '', paths)
})

// 选择本地 APK
ipcMain.handle('upload:pick', async () => {
  return pickFiles()
})

// 批量上传
ipcMain.handle('upload:start', async (_event, filePaths) => {
  return uploadFiles(filePaths || [])
})

// 复制文本到系统剪贴板
ipcMain.handle('clipboard:write', (_event, text) => {
  clipboard.writeText(String(text || ''))
  return true
})

// 按链接生成二维码 DataURL
ipcMain.handle('qr:make', async (_event, url) => {
  /** 要编码的链接 */
  const text = String(url || '').trim()

  // 空链接没法生成
  if (!text) {
    return { ok: false, error: '链接为空', qr: '' }
  }

  try {
    /** 二维码图 */
    const qr = await makeQr(text)
    return { ok: true, error: '', qr }
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
      qr: ''
    }
  }
})

// 选择应用 Logo
ipcMain.handle('logo:pick', async () => {
  return pickLogo()
})

// 读取应用 Logo
ipcMain.handle('logo:get', () => {
  return loadLogoDataUrl()
})

// 清除应用 Logo
ipcMain.handle('logo:clear', () => {
  clearLogoFiles()
  return { ok: true, hasLogo: false }
})

// 把二维码 DataURL 存成 png
ipcMain.handle('qr:save', async (_event, payload) => {
  /** 默认文件名 */
  const defaultName = (payload && payload.name) || 'qrcode.png'
  /** 保存对话框 */
  const result = await dialog.showSaveDialog(win, {
    title: '保存二维码',
    defaultPath: defaultName.replace(/\.apk$/i, '') + '-qr.png',
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  })

  // 取消就不写盘
  if (result.canceled || !result.filePath) {
    return { ok: false }
  }

  /** dataURL 正文 */
  const dataUrl = payload && payload.qr ? String(payload.qr) : ''
  /** 去掉前缀，留下 base64 */
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'))
  return { ok: true, path: result.filePath }
})

// 应用就绪后再开窗
app.whenReady().then(() => {
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
