// 检查更新独立模块：负责请求 GitHub Releases、下载 Windows 安装包并打开它
const { app, net, shell } = require('electron')
const fs = require('fs')
const path = require('path')

/** GitHub 仓库拥有者名称 */
const GITHUB_OWNER = 'AliangzaA'

/** GitHub 仓库名称 */
const GITHUB_REPO = 'oss-helper'

/**
 * 比对版本号（语义化判断远程版本是否高于本地版本）
 * @param {string} currentVer 当前应用版本（例如 "1.0.0"）
 * @param {string} remoteVer 远程最新版本（例如 "v1.0.1"）
 * @returns {boolean} 是否有更新
 */
function hasNewVersion(currentVer, remoteVer) {
  // 清洗版本号前缀
  const cleanCurrent = String(currentVer || '').replace(/^v/, '').trim()
  const cleanRemote = String(remoteVer || '').replace(/^v/, '').trim()

  // 转换为数字段数组
  const currentParts = cleanCurrent.split('.').map((item) => parseInt(item, 10) || 0)
  const remoteParts = cleanRemote.split('.').map((item) => parseInt(item, 10) || 0)

  // 逐位比对 [major, minor, patch]
  const length = Math.max(currentParts.length, remoteParts.length)
  for (let i = 0; i < length; i++) {
    const curr = currentParts[i] || 0
    const remote = remoteParts[i] || 0
    if (remote > curr) return true
    if (remote < curr) return false
  }
  return false
}

/** 下载过程中避免再点一次开出两个安装包 */
let installing = false

/** 只跟着 GitHub 自己的下载地址跳转 */
function hostOk(raw) {
  try {
    /** 解析后的地址 */
    const url = new URL(String(raw || ''))
    /** 主机名 */
    const host = url.hostname.toLowerCase()
    return (
      url.protocol === 'https:' &&
      (host === 'github.com' ||
        host === 'objects.githubusercontent.com' ||
        host === 'release-assets.githubusercontent.com' ||
        host === 'github-releases.githubusercontent.com')
    )
  } catch {
    return false
  }
}

/** 从 Release 资源里挑 Windows 安装包，不要 blockmap */
function pickExe(assets) {
  /** 以 .exe 结尾的附件 */
  const list = (Array.isArray(assets) ? assets : []).filter((item) => {
    /** 附件文件名 */
    const name = String((item && item.name) || '')
    return name.toLowerCase().endsWith('.exe')
  })
  /** 优先安装包，而不是别的 exe */
  const setup = list.find((item) => /setup/i.test(String(item.name || '')))
  return setup || list[0] || null
}

/**
 * 向 GitHub 要最新 Release 的原始 JSON
 * @returns {Promise<object>}
 */
function fetchLatest() {
  return new Promise((resolve, reject) => {
    /** 最新 Release 接口 */
    const request = net.request({
      method: 'GET',
      url: `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': 'OSS-Helper-App',
        Accept: 'application/vnd.github+json'
      }
    })

    request.on('response', (response) => {
      /** 响应正文 */
      let buffer = ''
      response.on('data', (chunk) => {
        buffer += chunk.toString()
      })
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`GitHub 响应码 ${response.statusCode}`))
          return
        }
        try {
          resolve(JSON.parse(buffer))
        } catch (err) {
          reject(err)
        }
      })
    })

    request.on('error', (err) => {
      reject(err)
    })

    request.end()
  })
}

/**
 * 把安装包下到临时目录
 * @param {string} url 只接受 GitHub 的 https 地址
 * @param {string} fileName 附件原名，必须是 exe
 * @param {(percent: number) => void} onProgress 0 到 100，总大小未知时不调用
 * @returns {Promise<string>} 落地后的 exe 路径
 */
function downloadExe(url, fileName, onProgress) {
  return new Promise((resolve, reject) => {
    if (!hostOk(url)) {
      reject(new Error('安装包地址不可用'))
      return
    }

    /** 只保留文件名，避免写到临时目录外面 */
    const base = path.basename(String(fileName || ''))
    if (!base.toLowerCase().endsWith('.exe') || base.includes('..')) {
      reject(new Error('安装包文件名不正确'))
      return
    }

    /** 临时目录 */
    const dir = path.join(app.getPath('temp'), 'oss-helper-update')
    fs.mkdirSync(dir, { recursive: true })
    /** 下完再改成正式名字，避免打开半截文件 */
    const part = path.join(dir, `${base}.part`)
    /** 最终安装包路径 */
    const dest = path.join(dir, base)
    /** 写入半截文件 */
    const file = fs.createWriteStream(part)
    /** 请求 */
    const request = net.request({ method: 'GET', url })
    /** 成功或失败只结算一次 */
    let settled = false

    /** 出错时删掉半截文件 */
    const fail = (err) => {
      if (settled) {
        return
      }
      settled = true
      file.destroy()
      fs.rm(part, { force: true }, () => {})
      reject(err instanceof Error ? err : new Error('下载安装包失败'))
    }

    request.on('redirect', (_status, _method, redirectUrl) => {
      if (!hostOk(redirectUrl)) {
        request.abort()
        fail(new Error('安装包跳转到了未知地址'))
        return
      }
      request.followRedirect()
    })

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        response.resume()
        fail(new Error(`下载失败，响应码 ${response.statusCode}`))
        return
      }

      /** 响应类型，网页说明不能当成安装包 */
      const type = String(response.headers['content-type'] || '')
      if (type.includes('text/html')) {
        response.resume()
        fail(new Error('下载地址返回的不是安装包'))
        return
      }

      /** 总字节，没有就只显示正在下载 */
      const total = Number(response.headers['content-length'] || 0)
      /** 已经写入的字节 */
      let received = 0

      response.on('data', (chunk) => {
        received += chunk.length
        if (!file.write(chunk)) {
          response.pause()
          file.once('drain', () => response.resume())
        }
        if (total > 0 && onProgress) {
          onProgress(Math.min(99, Math.round((received * 100) / total)))
        }
      })

      response.on('aborted', () => fail(new Error('下载已中断')))
      response.on('error', (err) => fail(err))
      response.on('end', () => {
        if (!settled) {
          file.end()
        }
      })
    })

    request.on('error', (err) => fail(err))

    file.on('error', (err) => fail(err))
    file.on('finish', () => {
      if (settled) {
        return
      }
      /** 太小的多半是错误页 */
      let size = 0
      try {
        size = fs.statSync(part).size
      } catch {
        size = 0
      }
      if (size < 100 * 1024) {
        settled = true
        fs.rm(part, { force: true }, () => {})
        reject(new Error('安装包不完整'))
        return
      }
      fs.rm(dest, { force: true }, () => {
        fs.rename(part, dest, (err) => {
          if (settled) {
            return
          }
          if (err) {
            settled = true
            reject(err)
            return
          }
          settled = true
          if (onProgress) {
            onProgress(100)
          }
          resolve(dest)
        })
      })
    })

    request.end()
  })
}

/**
 * Windows 下载安装包并打开，然后退出当前应用。
 * 其他系统打开 Release 页面。
 * @param {(percent: number) => void} onProgress
 */
async function installUpdate(onProgress) {
  if (installing) {
    return { ok: false, error: '正在下载安装包' }
  }

  installing = true
  try {
    /** 最新 Release */
    const release = await fetchLatest()
    /** 发布页，没有安装包时用它 */
    const pageUrl = release.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
    /** Windows 安装包附件 */
    const exe = pickExe(release.assets)

    // Mac 等系统继续打开发布页
    if (process.platform !== 'win32' || !exe || !exe.browser_download_url) {
      await shell.openExternal(pageUrl)
      return { ok: true, opened: true }
    }

    /** 落地的安装包 */
    const file = await downloadExe(exe.browser_download_url, exe.name, onProgress)
    /** 系统没能打开时的说明，空字符串表示已经交给系统 */
    const openErr = await shell.openPath(file)
    if (openErr) {
      return { ok: false, error: openErr }
    }

    // 安装程序会覆盖正在运行的文件，先让出
    app.quit()
    return { ok: true, opened: false }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : '下载安装包失败' }
  } finally {
    installing = false
  }
}

/**
 * 获取最新版本信息并返回比对结果
 * @returns {Promise<{ ok: boolean, hasUpdate: boolean, currentVersion: string, updateInfo: object|null, error?: string }>}
 */
function checkForUpdates() {
  return new Promise((resolve) => {
    /** 当前本地运行版本 */
    const currentVersion = app.getVersion()
    /** GitHub 最新 Release API 地址 */
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

    /** 网络请求对象 */
    const request = net.request({
      method: 'GET',
      url: apiUrl,
      headers: {
        'User-Agent': 'OSS-Helper-App'
      }
    })

    request.on('response', (response) => {
      // 仓库尚无任何 Release 时通常返回 404
      if (response.statusCode !== 200) {
        resolve({
          ok: false,
          hasUpdate: false,
          currentVersion,
          updateInfo: null,
          error: `GitHub 响应码 ${response.statusCode}`
        })
        return
      }

      /** 响应数据缓存字符串 */
      let buffer = ''
      response.on('data', (chunk) => {
        buffer += chunk.toString()
      })

      response.on('end', () => {
        try {
          /** 解析后的 GitHub Release 数据对象 */
          const release = JSON.parse(buffer)
          /** 远程最新版本标签（如 "v1.0.1"） */
          const remoteTag = release.tag_name || ''
          /** Windows 安装包附件，没有就只能打开网页 */
          const exe = pickExe(release.assets)

          // 比对是否有更高版本
          const isNewer = hasNewVersion(currentVersion, remoteTag)

          resolve({
            ok: true,
            hasUpdate: isNewer,
            currentVersion,
            updateInfo: {
              version: remoteTag,
              name: release.name || remoteTag,
              body: release.body || '',
              url: release.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
              publishedAt: release.published_at || '',
              canInstall: process.platform === 'win32' && !!(exe && exe.browser_download_url)
            }
          })
        } catch (err) {
          resolve({
            ok: false,
            hasUpdate: false,
            currentVersion,
            updateInfo: null,
            error: err && err.message ? err.message : '解析更新数据失败'
          })
        }
      })
    })

    request.on('error', (err) => {
      resolve({
        ok: false,
        hasUpdate: false,
        currentVersion,
        updateInfo: null,
        error: err && err.message ? err.message : '网络请求失败'
      })
    })

    request.end()
  })
}

module.exports = {
  hasNewVersion,
  checkForUpdates,
  installUpdate
}
