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
  resetDir: () => ipcRenderer.invoke('store:resetDir')
})
