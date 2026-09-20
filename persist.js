// 主进程落盘：设置目录记在 userData，OSS 配置写在所选目录
const { app, safeStorage, dialog, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

/** 记住用户选的目录，这个文件不跟配置走 */
const pointerName = 'settings.json'

/** OSS 配置文件名，落在用户选的目录里 */
const storesName = 'stores.json'

/** Electron 默认数据目录，没选过目录时配置也放这里 */
function userDir() {
  return app.getPath('userData')
}

/** 目录指针文件的完整路径 */
function pointerFile() {
  return path.join(userDir(), pointerName)
}

/** 读目录指针，没有或坏了就当没选过 */
function readPointer() {
  /** 指针文件路径 */
  const file = pointerFile()

  // 第一次启动还没有这个文件
  if (!fs.existsSync(file)) {
    return ''
  }

  try {
    /** 磁盘上的 JSON */
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return typeof data.dir === 'string' ? data.dir.trim() : ''
  } catch (err) {
    // 文件坏了就回默认目录，避免启动直接崩
    console.error('read pointer failed', err)
    return ''
  }
}

/** 把用户选的目录写进 userData，空串表示用默认目录 */
function writePointer(dir) {
  writeJson(pointerFile(), { dir: String(dir || '') })
}

/** 当前真正用来放配置的目录：选过且还在，否则默认目录 */
function dataDir() {
  /** 用户选过的目录 */
  const picked = readPointer()

  // 目录被删了就不要指向空位置
  if (picked && fs.existsSync(picked) && fs.statSync(picked).isDirectory()) {
    return picked
  }

  return userDir()
}

/** 配置文件完整路径 */
function storesFile() {
  return path.join(dataDir(), storesName)
}

/** 先写临时文件再替换，避免写到一半断电留下半截 JSON */
function writeJson(file, data) {
  /** 目标目录 */
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })

  /** 同目录临时文件，rename 在同一磁盘上才是替换 */
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

/** 打开文件列表用的目录：空=桶根；非空去掉开头 /，并补上结尾 / */
function cleanPrefix(prefix) {
  /** 去掉首尾空白和开头斜杠 */
  let text = String(prefix || '')
    .trim()
    .replace(/^\/+/, '')

  // 没填就停在桶根
  if (!text) {
    return ''
  }

  // 目录前缀统一带尾 /，避免和文件名粘在一起
  if (!text.endsWith('/')) {
    text += '/'
  }

  return text
}
/** 密钥加密后再落盘，空密钥不调用系统加密 */
function seal(text) {
  /** 去掉首尾空白后的密钥 */
  const secret = String(text || '')

  // 没填密钥就记空，避免无意义的密文
  if (!secret) {
    return { enc: '' }
  }

  // 系统没有加密能力时不能把明文写下去
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统不能加密密钥，已取消保存')
  }

  return { enc: safeStorage.encryptString(secret).toString('base64') }
}

/** 把磁盘上的密文解回页面用的字符串 */
function openSecret(packed) {
  /** 密文字段 */
  const enc = packed && typeof packed === 'object' ? String(packed.enc || '') : ''

  // 空密文就是没填
  if (!enc) {
    return ''
  }

  return safeStorage.decryptString(Buffer.from(enc, 'base64'))
}

/** 磁盘上的一条配置解成页面对象 */
function unpack(raw) {
  return {
    /** 列表项唯一标记 */
    id: String(raw.id || ''),
    /** 左侧显示名 */
    name: String(raw.name || ''),
    /** 阿里云 AccessKey ID */
    accessKeyId: String(raw.accessKeyId || ''),
    /** 解密后的密钥，只在内存里是明文 */
    accessKeySecret: openSecret(raw.accessKeySecret),
    /** 地域 */
    region: String(raw.region || ''),
    /** 自定义访问域名 */
    endpoint: String(raw.endpoint || ''),
    /** 文件列表起始目录，空就是桶根 */
    prefix: cleanPrefix(raw.prefix),
    /** 桶名 */
    bucket: String(raw.bucket || '')
  }
}

/** 页面对象收成可落盘的一条，密钥换成密文 */
function pack(raw) {
  return {
    id: String(raw.id || ''),
    name: String(raw.name || '').trim(),
    accessKeyId: String(raw.accessKeyId || '').trim(),
    accessKeySecret: seal(raw.accessKeySecret),
    region: String(raw.region || '').trim(),
    endpoint: String(raw.endpoint || '').trim(),
    prefix: cleanPrefix(raw.prefix),
    bucket: String(raw.bucket || '').trim()
  }
}

/** 读配置文件，没有就当空列表 */
function readStores() {
  /** 配置文件路径 */
  const file = storesFile()

  // 还没保存过
  if (!fs.existsSync(file)) {
    return { active: '', stores: [] }
  }

  /** 磁盘 JSON */
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  /** 解出来的列表，丢掉没有 id 的脏数据 */
  const stores = (Array.isArray(data.stores) ? data.stores : [])
    .map(unpack)
    .filter((item) => item.id)

  return {
    active: String(data.active || ''),
    stores
  }
}

/** 给页面的一份完整状态：配置在哪、指针在哪、列表是什么 */
function snapshot(bundle) {
  /** 指针里记的目录，空表示没用自定义 */
  const picked = readPointer()

  return {
    /** 配置实际所在目录 */
    dir: dataDir(),
    /** stores.json 完整路径 */
    file: storesFile(),
    /** settings.json 完整路径，这个永远在 userData */
    pointer: pointerFile(),
    /** 选过的目录还在，才算自定义；目录丢了就按默认位置用 */
    custom: Boolean(picked) && dataDir() === picked,
    /** 当前选中的存储 id */
    active: bundle.active,
    /** 已解密的存储列表 */
    stores: bundle.stores
  }
}

/** 启动或换目录后读取 */
function loadAll() {
  return snapshot(readStores())
}

/** 把页面上的列表写进当前目录 */
function saveStores(payload) {
  /** 收干净的列表 */
  const stores = (Array.isArray(payload && payload.stores) ? payload.stores : [])
    .map(pack)
    .filter((item) => item.id)

  /** 选中项不在列表里就清空，避免指向不存在的 id */
  const wanted = String((payload && payload.active) || '')
  const active = stores.some((item) => item.id === wanted) ? wanted : ''

  writeJson(storesFile(), {
    version: 1,
    active,
    stores
  })

  return loadAll()
}

/** 弹出目录选择，选中后只改指针，不搬旧文件 */
async function pickDir() {
  /** 挂到当前窗口上，避免对话框跑到后面 */
  const win = BrowserWindow.getFocusedWindow()
  /** 目录框参数 */
  const options = {
    title: '选择配置保存目录',
    properties: ['openDirectory', 'createDirectory']
  }
  /** 系统目录框的结果；没有窗口时不能把 undefined 当成选项 */
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)

  // 用户取消就保持原目录
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true }
  }

  writePointer(result.filePaths[0])
  return { canceled: false, ...loadAll() }
}

/** 清掉自定义目录，回到 userData */
function resetDir() {
  writePointer('')
  return loadAll()
}

/** 文件名里不能带路径符号 */
function fileTitle(name) {
  /** 空名称用 oss，避免保存框没有默认文件名 */
  const text = String(name || '').trim() || 'oss'
  return text.replace(/[\\/:*?"<>|]/g, '_')
}

/** 收成给别的电脑用的配置，密钥是明文 */
function portableFrom(data) {
  return {
    /** 文件格式版本 */
    version: 1,
    name: String((data && data.name) || '').trim(),
    accessKeyId: String((data && data.accessKeyId) || '').trim(),
    accessKeySecret: String((data && data.accessKeySecret) || ''),
    region: String((data && data.region) || '').trim(),
    endpoint: String((data && data.endpoint) || '').trim(),
    bucket: String((data && data.bucket) || '').trim(),
    prefix: cleanPrefix(data && data.prefix)
  }
}

/** 读入别人导出的文件，字段不对就拒绝 */
function portableRead(raw) {
  // 不是对象就不可能是我们的配置
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('不是 OSS 配置文件')
  }

  /** 只留认识的字段 */
  const next = portableFrom(raw)

  // 连名称、密钥、桶都没有，多半选错了文件
  if (!next.name && !next.accessKeyId && !next.bucket) {
    throw new Error('不是 OSS 配置文件')
  }

  return next
}

/** 弹出保存框，把当前表单写成 json */
async function exportConfig(data) {
  /** 挂到当前窗口上 */
  const win = BrowserWindow.getFocusedWindow()
  /** 保存框参数 */
  const options = {
    title: '导出 OSS 配置',
    defaultPath: `${fileTitle(data && data.name)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }
  /** 用户选的路径 */
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)

  // 取消就什么都不写
  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  writeJson(result.filePath, portableFrom(data || {}))
  return { canceled: false, file: result.filePath }
}

/** 弹出打开框，读一份导出的 json */
async function importConfig() {
  /** 挂到当前窗口上 */
  const win = BrowserWindow.getFocusedWindow()
  /** 打开框参数 */
  const options = {
    title: '导入 OSS 配置',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }
  /** 用户选的文件 */
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

  // 取消就保持表单原样
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true }
  }

  /** 文件内容 */
  const raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'))
  return { canceled: false, config: portableRead(raw) }
}

module.exports = {
  loadAll,
  saveStores,
  pickDir,
  resetDir,
  exportConfig,
  importConfig
}
