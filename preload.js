// 预加载：只把配置读写暴露给页面，页面碰不到 Node
const { contextBridge, ipcRenderer } = require('electron')

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
  ensure: (data) => ipcRenderer.invoke('oss:ensure', data)
})
