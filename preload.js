// 预加载：只把配置读写暴露给页面，页面碰不到 Node
const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('configApi', {
  /** 读当前目录里的配置，以及两个文件路径 */
  load: () => ipcRenderer.invoke('store:load'),
  /** 把存储列表写进当前目录的 stores.json */
  save: (data) => ipcRenderer.invoke('store:save', data),
  /** 让用户选一个目录，指针写进 userData */
  pickDir: () => ipcRenderer.invoke('store:pickDir'),
  /** 丢掉自定义目录，回到默认位置 */
  resetDir: () => ipcRenderer.invoke('store:resetDir'),
  /** 把当前表单导出成一份给别的电脑用的 json */
  export: (data) => ipcRenderer.invoke('config:export', data),
  /** 选一份导出的 json，把字段交回页面 */
  import: () => ipcRenderer.invoke('config:import')
})

contextBridge.exposeInMainWorld('ossApi', {
  /** 用某条已保存的配置列目录或按名字查找 */
  find: (data) => ipcRenderer.invoke('oss:find', data),
  /** 默认目录在桶里不存在时建出来 */
  ensure: (data) => ipcRenderer.invoke('oss:ensure', data),
  /** 弹出系统文件框，只把名字和大小交回页面 */
  pick: () => ipcRenderer.invoke('oss:pick'),
  /** 弹出系统文件夹框，展开里面的文件再交回页面 */
  pickFolder: () => ipcRenderer.invoke('oss:pickFolder'),
  /** 拖拽文件/文件夹直接把本地路径加入待传 */
  addFiles: (paths) => ipcRenderer.invoke('oss:addFiles', paths),
  /** 获取拖拽 File 对象的本地文件路径 */
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file)
      }
    } catch {}
    return (file && file.path) || ''
  },
  /** 弹窗关掉或移除某一条时，丢掉主进程里记下的路径 */
  forget: (ids) => ipcRenderer.invoke('oss:forget', ids),
  /** 按挑选时的 id 上传到当前目录 */
  upload: (data) => ipcRenderer.invoke('oss:upload', data),
  /** 订阅每个文件的上传进度，返回取消订阅 */
  onProgress: (cb) => {
    /** 主进程推过来的百分比 */
    const handler = (_event, data) => cb(data)
    ipcRenderer.on('oss:progress', handler)
    return () => ipcRenderer.removeListener('oss:progress', handler)
  },
  /** 在当前目录新建文件夹 */
  mkdir: (data) => ipcRenderer.invoke('oss:mkdir', data),
  /** 删除选中的文件或文件夹 */
  remove: (data) => ipcRenderer.invoke('oss:remove', data),
  /** 给选中的一项改名 */
  rename: (data) => ipcRenderer.invoke('oss:rename', data),
  /** 列出桶里 Logo 目录的图片 */
  logos: (data) => ipcRenderer.invoke('oss:logos', data),
  /** 把当前二维码存成 png */
  saveQr: (data) => ipcRenderer.invoke('file:saveImage', data),
  /** 读取 OSS 上的文本或 JSON 文件内容 */
  readText: (data) => ipcRenderer.invoke('oss:readText', data),
  /** 保存文本或 JSON 覆盖 OSS 上的文件 */
  saveText: (data) => ipcRenderer.invoke('oss:saveText', data)
})

contextBridge.exposeInMainWorld('updaterApi', {
  /** 检查 GitHub 远程最新版本 */
  check: () => ipcRenderer.invoke('updater:check'),
  /** 用系统默认浏览器打开外部下载链接 */
  openUrl: (url) => ipcRenderer.invoke('updater:openUrl', url)
})
