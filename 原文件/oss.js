// OSS 客户端与链接拼装，供主进程上传调用
const OSS = require('ali-oss')
const path = require('path')

/** 校验配置是否够用来上传，返回错误文案或空串 */
function checkConfig(config) {
  // AccessKey / Bucket 是硬门槛
  if (!config || !config.accessKeyId || !config.accessKeySecret) {
    return '请先在「阿里云配置」里填写并保存 AccessKey'
  }

  if (!config.bucket) {
    return '请先填写并保存 Bucket'
  }

  if (!config.region && !config.endpoint) {
    return '请先填写 Region 或 Endpoint'
  }

  return ''
}

/** 规范化对象前缀，保证目录分隔正确 */
function normalizePrefix(prefix) {
  /** 去掉首尾空白 */
  let text = String(prefix || '').trim()

  // 空前缀就直接上传到桶根
  if (!text) {
    return ''
  }

  // 去掉开头的 /，OSS objectKey 一般不以 / 开头
  text = text.replace(/^\/+/, '')

  // 没有结尾 / 就补上，避免和下一个文件名粘在一起
  if (!text.endsWith('/')) {
    text += '/'
  }

  return text
}

/** 用本地文件名拼 objectKey */
function buildKey(prefix, filePath) {
  /** 规范化后的前缀 */
  const head = normalizePrefix(prefix)
  /** 纯文件名 */
  const name = path.basename(filePath)
  return `${head}${name}`
}

/** 根据配置创建 ali-oss 客户端 */
function createClient(config) {
  /** 传给 SDK 的参数 */
  const options = {
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    // 超时放宽一点，大 APK 更稳
    timeout: 10 * 60 * 1000
  }

  // 有自定义 endpoint 就优先用，适配私有云或特殊域名
  if (config.endpoint) {
    options.endpoint = config.endpoint
    // 有些环境 endpoint 已含 bucket，这里关掉自动拼接
    options.cname = false
  } else {
    options.region = config.region
  }

  return new OSS(options)
}

/** 去掉 URL 末尾多余斜杠 */
function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '')
}

/** 从 endpoint 文本里抽出主机名 */
function endpointHost(endpoint) {
  try {
    return new URL(endpoint).host
  } catch (err) {
    // 用户可能只填了 oss-cn-xxx.aliyuncs.com
    return String(endpoint || '')
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
  }
}

/** 拼公网下载链接，优先自定义域名 */
function buildUrl(config, objectKey) {
  /** 去掉 objectKey 前导 / */
  const key = String(objectKey || '').replace(/^\/+/, '')

  // 自定义域名优先，方便扫码走 CDN
  if (config.customDomain) {
    return `${trimSlash(config.customDomain)}/${key}`
  }

  // 有 endpoint 就拼 bucket.endpoint 形式
  if (config.endpoint) {
    /** endpoint 主机 */
    const host = endpointHost(config.endpoint)
    return `https://${config.bucket}.${host}/${key}`
  }

  // 默认公网域名：bucket.region.aliyuncs.com
  return `https://${config.bucket}.${config.region}.aliyuncs.com/${key}`
}

/**
 * 上传单个本地文件到 OSS
 * @param {object} client ali-oss 实例
 * @param {string} objectKey 目标对象名
 * @param {string} filePath 本地路径
 * @param {(percent: number) => void} onProgress 进度回调
 */
async function putFile(client, objectKey, filePath, onProgress) {
  /** 按扩展名猜 Content-Type */
  const type = guessType(filePath)
  /** 上传结果 */
  const result = await client.put(objectKey, filePath, {
    headers: {
      'Content-Type': type
    },
    // SDK 进度：p 为 0~1
    progress: (p) => {
      // 没有回调就不推，避免空调用
      if (typeof onProgress === 'function') {
        onProgress(Math.round(p * 100))
      }
    }
  })

  return result
}

/** 根据扩展名猜测 Content-Type */
function guessType(filePath) {
  /** 小写扩展名 */
  const ext = path.extname(filePath || '').toLowerCase()

  // APK 单独处理
  if (ext === '.apk') {
    return 'application/vnd.android.package-archive'
  }

  // 常见静态资源
  if (ext === '.png') {
    return 'image/png'
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg'
  }

  if (ext === '.gif') {
    return 'image/gif'
  }

  if (ext === '.webp') {
    return 'image/webp'
  }

  if (ext === '.json') {
    return 'application/json'
  }

  if (ext === '.txt' || ext === '.log') {
    return 'text/plain'
  }

  if (ext === '.zip') {
    return 'application/zip'
  }

  return 'application/octet-stream'
}

/** 校验单层名字是否合法，返回错误或空串 */
function checkName(name) {
  /** 去掉首尾空白 */
  const text = String(name || '').trim()

  // 空名不行
  if (!text) {
    return '名称不能为空'
  }

  // 单层名不能带路径分隔
  if (text.includes('/') || text.includes('\\')) {
    return '名称不能包含 / 或 \\'
  }

  // 避免相对路径写法
  if (text === '.' || text === '..') {
    return '名称不合法'
  }

  return ''
}

/** 在指定目录下创建空文件夹占位对象 */
async function mkdir(client, parentPrefix, name) {
  /** 名称校验 */
  const error = checkName(name)

  // 名字不合法直接抛，方便上层统一 catch
  if (error) {
    throw new Error(error)
  }

  /** 新目录完整前缀 */
  const folderKey = `${browsePrefix(parentPrefix)}${String(name).trim()}/`
  await client.put(folderKey, Buffer.alloc(0))
  return folderKey
}

/** 删除单个对象 */
async function removeObject(client, objectKey) {
  /** 目标 key */
  const key = String(objectKey || '').replace(/^\/+/, '')

  // 空 key 太危险，直接拒绝
  if (!key) {
    throw new Error('对象键不能为空')
  }

  await client.delete(key)
}

/** 列出某前缀下全部对象（不分目录层） */
async function listAllKeys(client, prefix) {
  /** 规范化前缀 */
  const head = browsePrefix(prefix)
  /** 收集到的 key */
  const keys = []
  /** 分页游标 */
  let token = null

  do {
    /** 查询参数：不加 delimiter，把子树全拉出来 */
    const query = {
      prefix: head,
      'max-keys': 1000
    }

    // 续页
    if (token) {
      query['continuation-token'] = token
    }

    /** 本页 */
    const page = await client.listV2(query)
    token = page.nextContinuationToken || null

    ;(page.objects || []).forEach((obj) => {
      // 有名字才入列
      if (obj.name) {
        keys.push(obj.name)
      }
    })
  } while (token)

  return keys
}

/** 按前缀批量删除（用于删「目录」） */
async function removePrefix(client, prefix) {
  /** 目录前缀 */
  const head = browsePrefix(prefix)

  // 禁止空前缀，避免误删整桶
  if (!head) {
    throw new Error('不能删除桶根')
  }

  /** 该前缀下全部对象 */
  const keys = await listAllKeys(client, head)

  // 一个都没有也算成功（可能只有逻辑目录）
  if (!keys.length) {
    return { deleted: 0 }
  }

  /** 已删数量 */
  let deleted = 0

  // 阿里云 deleteMulti 一次上限通常 1000，这里按 900 批更稳
  for (let i = 0; i < keys.length; i += 900) {
    /** 本批 key */
    const batch = keys.slice(i, i + 900)
    await client.deleteMulti(batch, { quiet: true })
    deleted += batch.length
  }

  return { deleted }
}

/**
 * 重命名当前层文件（同目录改名）
 * @param {object} client
 * @param {string} fromKey 原对象键
 * @param {string} newName 新文件名（不含路径）
 */
async function renameFile(client, fromKey, newName) {
  /** 名称校验 */
  const error = checkName(newName)

  if (error) {
    throw new Error(error)
  }

  /** 原 key */
  const source = String(fromKey || '').replace(/^\/+/, '')

  // 空源拒绝
  if (!source || source.endsWith('/')) {
    throw new Error('请选择有效文件')
  }

  /** 所在目录前缀 */
  const parent = source.includes('/') ? source.slice(0, source.lastIndexOf('/') + 1) : ''
  /** 新 key */
  const target = `${parent}${String(newName).trim()}`

  // 同名没必要动
  if (target === source) {
    return { from: source, to: target }
  }

  await client.copy(target, source)
  await client.delete(source)
  return { from: source, to: target }
}

/**
 * 重命名当前层文件夹（复制子树后删除旧前缀）
 * @param {object} client
 * @param {string} fromPrefix 原目录前缀
 * @param {string} newName 新目录名（单层）
 */
async function renameFolder(client, fromPrefix, newName) {
  /** 名称校验 */
  const error = checkName(newName)

  if (error) {
    throw new Error(error)
  }

  /** 旧前缀 */
  const source = browsePrefix(fromPrefix)

  // 不能改桶根
  if (!source) {
    throw new Error('不能重命名桶根')
  }

  /** 父目录 */
  const parent = source.slice(0, source.lastIndexOf('/', source.length - 2) + 1)
  /** 新前缀 */
  const target = `${parent}${String(newName).trim()}/`

  // 同名跳过
  if (target === source) {
    return { from: source, to: target, moved: 0 }
  }

  /** 旧前缀下全部对象 */
  const keys = await listAllKeys(client, source)

  // 没有任何对象时，至少放一个空目录占位
  if (!keys.length) {
    await client.put(target, Buffer.alloc(0))
    return { from: source, to: target, moved: 0 }
  }

  for (const key of keys) {
    /** 相对旧前缀的后缀 */
    const tail = key.slice(source.length)
    /** 新对象键 */
    const nextKey = `${target}${tail}`
    await client.copy(nextKey, key)
  }

  await removePrefix(client, source)
  return { from: source, to: target, moved: keys.length }
}

/** 规范化浏览前缀：空=桶根；非空保证以 / 结尾 */
function browsePrefix(prefix) {
  /** 去掉首尾空白与开头斜杠 */
  let text = String(prefix || '')
    .trim()
    .replace(/^\/+/, '')

  // 空就是桶根
  if (!text) {
    return ''
  }

  // 目录前缀统一带尾 /
  if (!text.endsWith('/')) {
    text += '/'
  }

  return text
}

/** 从完整 key / 前缀里抽出当前层显示名 */
function displayName(full, currentPrefix) {
  /** 去掉当前前缀后的相对路径 */
  const relative = String(full || '').slice(String(currentPrefix || '').length)
  return relative.replace(/\/$/, '')
}

/**
 * 列出某一层目录（空前缀=桶根）
 * @param {object} client ali-oss 实例
 * @param {string} prefix 当前目录前缀
 */
async function listDir(client, prefix) {
  /** 规范化后的当前前缀 */
  const current = browsePrefix(prefix)
  /** 文件夹列表 */
  const folders = []
  /** 文件列表 */
  const files = []
  /** 分页游标 */
  let token = null
  /** 是否还有下一页（对外只汇总，内部翻完） */
  let truncated = false

  do {
    /** listV2 查询参数 */
    const query = {
      prefix: current,
      delimiter: '/',
      'max-keys': 1000
    }

    // 有续传 token 就带上，把整层翻完
    if (token) {
      query['continuation-token'] = token
    }

    /** 本页结果 */
    const page = await client.listV2(query)

    truncated = !!page.isTruncated
    token = page.nextContinuationToken || null

    // 子目录：CommonPrefixes
    ;(page.prefixes || []).forEach((folderPrefix) => {
      folders.push({
        type: 'folder',
        name: displayName(folderPrefix, current),
        prefix: folderPrefix
      })
    })

    // 对象：跳过与当前前缀同名的目录占位对象
    ;(page.objects || []).forEach((obj) => {
      // 目录占位（key 正好等于 prefix）不当文件展示
      if (obj.name === current) {
        return
      }

      files.push({
        type: 'file',
        name: displayName(obj.name, current),
        key: obj.name,
        size: obj.size || 0,
        lastModified: obj.lastModified || ''
      })
    })
  } while (token)

  // 目录在前、文件在后，同组按名字排
  folders.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  files.sort((a, b) => a.name.localeCompare(b.name, 'zh'))

  return {
    prefix: current,
    folders,
    files,
    truncated
  }
}

module.exports = {
  checkConfig,
  buildKey,
  createClient,
  buildUrl,
  putFile,
  browsePrefix,
  listDir,
  mkdir,
  removeObject,
  removePrefix,
  renameFile,
  renameFolder,
  checkName
}
