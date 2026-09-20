// 预加载：在隔离环境下，把少量安全 API 挂到 window
const { contextBridge, ipcRenderer } = require('electron')

/** 暴露给渲染进程的只读环境信息 */
const appInfo = {
  /** 运行平台，如 win32 / darwin */
  platform: process.platform,
  /** 当前 Electron 版本 */
  electron: process.versions.electron,
  /** 当前 Chromium 版本 */
  chrome: process.versions.chrome,
  /** 当前 Node 版本 */
  node: process.versions.node
}

/** 配置读写 API，页面只能走这里，不能直接碰文件系统 */
const configApi = {
  /** 读取已保存的 OSS 配置 */
  load: () => ipcRenderer.invoke('config:load'),
  /** 保存 OSS 配置到本地 */
  save: (data) => ipcRenderer.invoke('config:save', data),
  /** 选择应用 Logo */
  pickLogo: () => ipcRenderer.invoke('logo:pick'),
  /** 读取应用 Logo */
  getLogo: () => ipcRenderer.invoke('logo:get'),
  /** 清除应用 Logo */
  clearLogo: () => ipcRenderer.invoke('logo:clear')
}

/** 桶内浏览与增删改 API */
const browseApi = {
  /** 列出指定前缀下一层；传空字符串从桶根开始 */
  list: (prefix) => ipcRenderer.invoke('browse:list', prefix || ''),
  /** 在当前目录新建文件夹 */
  mkdir: (payload) => ipcRenderer.invoke('browse:mkdir', payload),
  /** 删除文件或文件夹 */
  remove: (payload) => ipcRenderer.invoke('browse:remove', payload),
  /** 重命名文件或文件夹 */
  rename: (payload) => ipcRenderer.invoke('browse:rename', payload),
  /** 上传本地文件到当前目录 */
  upload: (prefix) => ipcRenderer.invoke('browse:upload', prefix || ''),
  /** 订阅浏览页上传进度 */
  onUploadProgress: (handler) => {
    /** 监听函数 */
    const listen = (_event, payload) => handler(payload)
    ipcRenderer.on('browse:upload-progress', listen)
    return () => ipcRenderer.removeListener('browse:upload-progress', listen)
  }
}

/** 上传与二维码相关 API */
const uploadApi = {
  /** 打开系统对话框多选 APK */
  pick: () => ipcRenderer.invoke('upload:pick'),
  /** 按路径列表开始批量上传 */
  start: (paths) => ipcRenderer.invoke('upload:start', paths),
  /** 订阅上传进度 */
  onProgress: (handler) => {
    /** 实际监听函数，转一层方便卸载 */
    const listen = (_event, payload) => handler(payload)
    ipcRenderer.on('upload:progress', listen)
    // 返回取消订阅函数
    return () => ipcRenderer.removeListener('upload:progress', listen)
  },
  /** 复制文本到剪贴板 */
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  /** 按链接生成二维码 */
  makeQr: (url) => ipcRenderer.invoke('qr:make', url),
  /** 保存二维码 PNG */
  saveQr: (payload) => ipcRenderer.invoke('qr:save', payload)
}

// 页面里用 window.appInfo / window.configApi / window.browseApi / window.uploadApi
contextBridge.exposeInMainWorld('appInfo', appInfo)
contextBridge.exposeInMainWorld('configApi', configApi)
contextBridge.exposeInMainWorld('browseApi', browseApi)
contextBridge.exposeInMainWorld('uploadApi', uploadApi)
