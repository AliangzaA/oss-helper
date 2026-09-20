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
    export: (data: Record<string, string>) => Promise<{
      ok: boolean
      canceled?: boolean
      error?: string
      file?: string
    }>
    import: () => Promise<{
      ok: boolean
      canceled?: boolean
      error?: string
      config?: {
        name: string
        accessKeyId: string
        accessKeySecret: string
        region: string
        endpoint: string
        bucket: string
        prefix: string
      }
    }>
  }
  /** 用已保存配置查找 OSS 对象 */
  ossApi?: {
    find: (data: { id: string; place: string; keyword: string }) => Promise<{
      ok: boolean
      error: string
      mode?: 'list' | 'find'
      place?: string
      truncated?: boolean
      items: Array<{
        type: 'folder' | 'file'
        name: string
        key: string
        size: number
        storage?: string
        time?: string
      }>
    }>
    ensure: (data: { id: string }) => Promise<{ ok: boolean; error: string; created: boolean }>
    pick: () => Promise<{
      ok: boolean
      canceled?: boolean
      files: Array<{ id: string; name: string; size: number }>
    }>
    forget: (ids: string[]) => Promise<{ ok: boolean }>
    upload: (data: { id: string; place: string; fileIds: string[] }) => Promise<{
      ok: boolean
      error?: string
      uploaded?: number
    }>
    onProgress: (cb: (data: { id: string; percent: number }) => void) => () => void
    mkdir: (data: { id: string; place: string; name: string }) => Promise<{
      ok: boolean
      error?: string
    }>
    remove: (data: {
      id: string
      items: Array<{ type: string; key: string }>
    }) => Promise<{ ok: boolean; error?: string }>
    rename: (data: {
      id: string
      item: { type: string; key: string }
      name: string
    }) => Promise<{ ok: boolean; error?: string }>
  }
}
