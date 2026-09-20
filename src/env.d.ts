/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/** 主进程读写配置后回给页面的状态 */
interface DiskState {
  dir: string
  file: string
  pointer: string
  custom: boolean
  active: string
  stores: Array<{
    id: string
    name: string
    accessKeyId: string
    accessKeySecret: string
    region: string
    endpoint: string
    prefix: string
    bucket: string
  }>
}

interface Window {
  /** 预加载暴露的配置接口，浏览器预览里没有 */
  configApi?: {
    load: () => Promise<DiskState>
    save: (data: { active: string; stores: unknown[] }) => Promise<DiskState>
    pickDir: () => Promise<DiskState & { canceled?: boolean }>
    resetDir: () => Promise<DiskState>
  }
}
