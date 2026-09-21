// 检查更新独立模块：负责请求 GitHub Releases 并比对版本
const { app, net } = require('electron')

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
              publishedAt: release.published_at || ''
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
  checkForUpdates
}
