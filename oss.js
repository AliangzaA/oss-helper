// 用已保存的 OSS 配置列目录、按名字查找，以及上传、建目录、删除、改名
const OSS = require('ali-oss')
const path = require('path')

/** 一层最多翻多少页，避免大目录把窗口卡死 */
const pageCap = 20

/** 按名字查找时最多扫多少个对象 */
const scanCap = 3000

/** 查找结果最多返回多少条 */
const hitCap = 200

/** 配置够不够用来连 OSS，返回错误文案或空串 */
function checkConfig(config) {
  // 没有密钥就连不上
  if (!config || !config.accessKeyId || !config.accessKeySecret) {
    return '请先填写 AccessKey'
  }

  // 没有桶就不知道列哪里
  if (!config.bucket) {
    return '请先填写 Bucket'
  }

  // 地域和自定义域名至少要有一个
  if (!config.region && !config.endpoint) {
    return '请先填写 Region 或 Endpoint'
  }

  return ''
}

/** 用这条配置创建客户端 */
function createClient(config, timeout) {
  /** 传给 SDK 的参数 */
  const options = {
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    timeout: timeout || 60 * 1000,
    // 强制走 HTTPS 加密通道，避免明文 HTTP (80端口) 的 PUT 请求被本地代理或运营商网络断流
    secure: true
  }

  // 填了 Endpoint 就按它连，不再用 Region 猜
  if (config.endpoint) {
    options.endpoint = config.endpoint
    options.cname = false
  } else {
    options.region = config.region
  }

  return new OSS(options)
}

/** 查找范围不能跑到默认目录外面 */
function keepInside(root, place) {
  /** 配置里的默认目录，空就是桶根 */
  const head = String(root || '')
  /** 页面当前停的目录 */
  const here = String(place || '')

  // 没设默认目录，当前目录就是范围
  if (!head) {
    return here
  }

  // 还在默认目录里面
  if (here === head || here.startsWith(head)) {
    return here
  }

  return head
}

/** 从完整 key 里去掉当前目录，得到显示名 */
function showName(full, head) {
  return String(full || '')
    .slice(String(head || '').length)
    .replace(/\/$/, '')
}

/** 把 SDK 对象收成页面用的一条 */
function packItem(type, name, key, obj) {
  /** 更新时间，目录前缀通常没有 */
  let time = ''

  // 文件才带 lastModified
  if (obj && obj.lastModified) {
    time = new Date(obj.lastModified).toISOString()
  }

  return {
    type,
    name,
    key,
    size: obj && obj.size ? obj.size : 0,
    storage: obj && obj.storageClass ? obj.storageClass : '',
    time
  }
}

/**
 * 列出某一层：目录在前，文件在后
 * @param {object} client
 * @param {string} head 当前目录前缀
 */
async function listLevel(client, head) {
  /** 子目录 */
  const folders = []
  /** 文件 */
  const files = []
  /** 翻页游标 */
  let token = null
  /** 已经翻过的页数 */
  let pages = 0
  /** 这一层还有没有没拉完的 */
  let truncated = false

  do {
    /** 本页查询：delimiter 只拿当前层 */
    const query = {
      prefix: head,
      delimiter: '/',
      'max-keys': 200
    }

    // 续页
    if (token) {
      query['continuation-token'] = token
    }

    /** 本页结果 */
    const page = await client.listV2(query)
    pages += 1
    token = page.nextContinuationToken || null
    truncated = !!page.isTruncated && pages >= pageCap

    ;(page.prefixes || []).forEach((folderKey) => {
      folders.push(packItem('folder', showName(folderKey, head), folderKey, null))
    })

    ;(page.objects || []).forEach((obj) => {
      // 目录占位对象不要当成文件
      if (!obj.name || obj.name === head) {
        return
      }

      files.push(packItem('file', showName(obj.name, head), obj.name, obj))
    })

    // 页数到顶就停，剩下的用 truncated 告诉页面
    if (pages >= pageCap) {
      break
    }
  } while (token)

  folders.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  files.sort((a, b) => a.name.localeCompare(b.name, 'zh'))

  return {
    mode: 'list',
    place: head,
    items: folders.concat(files),
    truncated
  }
}

/**
 * 在默认目录下按名字找，名字包含关键字就算
 * @param {object} client
 * @param {string} head 默认目录
 * @param {string} word 小写关键字
 */
async function searchNames(client, head, word) {
  /** 命中的条目 */
  const items = []
  /** 翻页游标 */
  let token = null
  /** 已经看过的对象数 */
  let scanned = 0
  /** 后面还有没有没扫到的 */
  let truncated = false

  do {
    /** 不加 delimiter，把默认目录下面整棵树拉出来再筛 */
    const query = {
      prefix: head,
      'max-keys': 200
    }

    // 续页
    if (token) {
      query['continuation-token'] = token
    }

    /** 本页 */
    const page = await client.listV2(query)
    token = page.nextContinuationToken || null

    ;(page.objects || []).forEach((obj) => {
      scanned += 1

      // 已经够条数了就不再收
      if (!obj.name || items.length >= hitCap) {
        return
      }

      /** 相对默认目录的名字 */
      const name = showName(obj.name, head)

      // 空名字或对不上关键字
      if (!name || !name.toLowerCase().includes(word)) {
        return
      }

      /** 以 / 结尾的是目录占位 */
      const folder = obj.name.endsWith('/')

      items.push(packItem(folder ? 'folder' : 'file', name, obj.name, obj))
    })

    // 条数或扫描量到顶，避免把整个桶拉完
    if (items.length >= hitCap || scanned >= scanCap) {
      truncated = !!token || items.length >= hitCap
      break
    }
  } while (token)

  return {
    mode: 'find',
    place: head,
    items,
    truncated
  }
}

/**
 * 查找入口
 * @param {object} config 已解密的一条 OSS 配置
 * @param {string} place 当前要列的目录
 * @param {string} keyword 名字关键字，空则只列一层
 */
async function find(config, place, keyword) {
  /** 配置问题 */
  const error = checkConfig(config)

  // 配置不齐就不连
  if (error) {
    throw new Error(error)
  }

  /** 客户端 */
  const client = createClient(config)
  /** 默认目录，查找不能跑出去 */
  const root = String(config.prefix || '')
  /** 去掉首尾空白的关键字 */
  const word = String(keyword || '').trim().toLowerCase()

  // 有关键字就在默认目录下按名字找
  if (word) {
    return searchNames(client, root, word)
  }

  return listLevel(client, keepInside(root, place))
}

/**
 * 默认目录不存在就放一个空对象，OSS 靠它显示文件夹
 * @param {object} config 已解密的一条配置
 */
async function ensureDir(config) {
  /** 配置问题 */
  const error = checkConfig(config)

  // 配置不齐就建不了目录
  if (error) {
    throw new Error(error)
  }

  /** 整理过的目录前缀，空就是桶根，不用建 */
  const head = String(config.prefix || '')

  // 桶根一直都在
  if (!head) {
    return { created: false }
  }

  /** 客户端 */
  const client = createClient(config)
  /** 看这个前缀下有没有任何对象 */
  const page = await client.listV2({
    prefix: head,
    'max-keys': 1
  })
  /** 已经有文件或子目录，文件夹就算在 */
  const exists = (page.objects || []).some((obj) => obj.name) || (page.prefixes || []).length > 0

  // 已经有了就别再放占位对象
  if (exists) {
    return { created: false }
  }

  await client.put(head, Buffer.alloc(0))
  return { created: true }
}

/** 配置不齐就抛错，齐了返回客户端 */
function openClient(config, timeout) {
  /** 配置问题 */
  const error = checkConfig(config)

  // 没配齐就不要发请求
  if (error) {
    throw new Error(error)
  }

  return createClient(config, timeout)
}

/** 当前目录前缀，保证在默认目录里面，并且非空时以 / 结尾 */
function dirPrefix(config, place) {
  /** 收进默认目录后的位置 */
  let here = keepInside(config.prefix || '', place || '')

  // 子目录统一带尾斜杠，上传才不会和文件名粘住
  if (here && !here.endsWith('/')) {
    here += '/'
  }

  return here
}

/** 单层名字是否能用，返回错误或空串 */
function checkName(name) {
  /** 去掉首尾空白 */
  const text = String(name || '').trim()

  // 空名字建不出来
  if (!text) {
    return '名称不能为空'
  }

  // 只允许当前这一层，路径分隔留给目录本身
  if (text.includes('/') || text.includes('\\')) {
    return '名称不能包含 / 或 \\'
  }

  // 避免相对路径
  if (text === '.' || text === '..') {
    return '名称不合法'
  }

  return ''
}

/** 对象必须在默认目录里，空 key 视为桶根，直接拒绝 */
function assertInside(root, key) {
  /** 默认目录 */
  const head = String(root || '')
  /** 要动的对象 */
  const text = String(key || '')

  // 空 key 会作用到整桶
  if (!text) {
    throw new Error('不能操作桶根')
  }

  // 跑到默认目录外面
  if (head && text !== head && !text.startsWith(head)) {
    throw new Error('不能操作默认目录以外的对象')
  }
}

/** 拉出某个前缀下的全部对象名 */
async function listAllKeys(client, prefix) {
  /** 目录前缀 */
  const head = String(prefix || '')

  // 空前缀会把整桶列出来
  if (!head) {
    throw new Error('不能删除桶根')
  }

  /** 收集到的 key */
  const keys = []
  /** 翻页游标 */
  let token = null

  do {
    /** 不加 delimiter，子目录里的文件也算上 */
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
      // 没有名字的跳过
      if (obj.name) {
        keys.push(obj.name)
      }
    })
  } while (token)

  return keys
}

/** 删掉一个目录前缀下的全部对象 */
async function removePrefix(client, prefix) {
  /** 要删的目录 */
  const head = String(prefix || '')
  /** 这个前缀下的对象 */
  const keys = await listAllKeys(client, head)

  // 只有逻辑目录、没有对象时，再试一次占位对象
  if (!keys.includes(head)) {
    keys.push(head)
  }

  // deleteMulti 一次太多容易失败，按 900 一批
  for (let i = 0; i < keys.length; i += 900) {
    /** 这一批 key */
    const batch = keys.slice(i, i + 900)
    await client.deleteMulti(batch, { quiet: true })
  }
}

/**
 * 上传本地文件到当前目录，并按文件回报 0–100 的进度
 * @param {object} config
 * @param {string} place 当前目录
 * @param {string[]} paths 本地路径
 * @param {(index: number, percent: number) => void} [onProgress]
 */
/**
 * 上传本地文件到当前目录；支持相对路径（文件夹上传）
 * @param {object} config
 * @param {string} place
 * @param {Array<string|{ path: string, rel: string }>} paths
 * @param {(index: number, percent: number) => void} [onProgress]
 */
async function upload(config, place, paths, onProgress) {
  /** 大文件放宽超时 */
  const client = openClient(config, 10 * 60 * 1000)
  /** 当前目录 */
  const head = dirPrefix(config, place)
  /** 成功个数 */
  let uploaded = 0
  /** 页面这次要传的条目 */
  const list = paths || []

  for (let index = 0; index < list.length; index += 1) {
    /** 这一条：兼容旧版纯字符串路径 */
    const raw = list[index]
    /** 本地绝对路径 */
    const filePath = typeof raw === 'string' ? raw : raw && raw.path
    /** OSS 对象相对键，文件夹上传会带层级 */
    const rel = typeof raw === 'string'
      ? path.basename(raw)
      : String((raw && raw.rel) || path.basename(filePath || '')).replace(/\\/g, '/')

    // 对话框有时会给空项
    if (!filePath || !rel) {
      continue
    }

    // 相对路径每一层都要合法，避免 ../ 之类
    for (const part of rel.split('/')) {
      /** 这一层名字的问题 */
      const error = checkName(part)
      // 本地文件名本身就不该进 OSS
      if (error) {
        throw new Error(`${rel}：${error}`)
      }
    }

    // 开始传之前先把进度归零，进度条才有起点
    if (onProgress) {
      onProgress(index, 0)
    }

    try {
      // 分片上传才会持续回调进度，小文件也会很快走到 100
      await client.multipartUpload(`${head}${rel}`, filePath, {
        progress: (ratio) => {
          // 还没人听进度就别算百分比
          if (!onProgress) {
            return
          }

          /** SDK 给的是 0 到 1，收成整数百分比 */
          const percent = Math.max(0, Math.min(100, Math.round(Number(ratio) * 100)))
          onProgress(index, percent)
        }
      })
    } catch (err) {
      /** 带上相对路径，弹窗才知道是哪一条失败 */
      const message = err && err.message ? err.message : '上传失败'
      throw new Error(`${rel}：${message}`)
    }

    // 有的小文件回调停在 99，传完强制记成完成
    if (onProgress) {
      onProgress(index, 100)
    }

    uploaded += 1
  }

  return { uploaded }
}

/**
 * 在当前目录建一个空文件夹
 * @param {object} config
 * @param {string} place
 * @param {string} name 单层目录名
 */
async function mkdir(config, place, name) {
  /** 名称问题 */
  const error = checkName(name)

  // 名字不合法就不连
  if (error) {
    throw new Error(error)
  }

  /** 客户端 */
  const client = openClient(config)
  /** 新目录完整前缀 */
  const folderKey = `${dirPrefix(config, place)}${String(name).trim()}/`
  await client.put(folderKey, Buffer.alloc(0))
  return { key: folderKey }
}

/**
 * 删除选中的文件或文件夹
 * @param {object} config
 * @param {{ type: string, key: string }[]} items
 */
async function removeItems(config, items) {
  /** 没有选中就不用发请求 */
  const list = Array.isArray(items) ? items : []

  // 空选择没有意义
  if (!list.length) {
    throw new Error('请先选择文件或文件夹')
  }

  /** 客户端 */
  const client = openClient(config)
  /** 默认目录 */
  const root = String(config.prefix || '')

  for (const item of list) {
    /** 对象键 */
    const key = String((item && item.key) || '')
    assertInside(root, key)

    // 文件夹要连带里面的文件一起删
    if (item.type === 'folder' || key.endsWith('/')) {
      await removePrefix(client, key)
    } else {
      await client.delete(key)
    }
  }

  return { removed: list.length }
}

/** 同目录给文件改名：复制到新 key 再删旧的 */
async function renameFile(client, fromKey, name) {
  /** 原 key */
  const source = String(fromKey || '').replace(/^\/+/, '')

  // 目录不走这条
  if (!source || source.endsWith('/')) {
    throw new Error('请选择文件')
  }

  /** 所在目录 */
  const parent = source.includes('/') ? source.slice(0, source.lastIndexOf('/') + 1) : ''
  /** 新 key */
  const target = `${parent}${name}`

  // 名字没变
  if (target === source) {
    return { from: source, to: target }
  }

  // 复制对象；遇到空闲长连接断开 (socket hang up) 自动重试一次
  try {
    await client.copy(target, source)
  } catch (err) {
    if (err && (String(err.message).includes('socket hang up') || err.code === 'ECONNRESET')) {
      await client.copy(target, source)
    } else {
      throw err
    }
  }

  await client.delete(source)
  return { from: source, to: target }
}

/** 给文件夹改名：子树复制过去再删旧前缀 */
async function renameFolder(client, fromPrefix, name) {
  /** 旧前缀 */
  const source = String(fromPrefix || '')

  // 桶根本身不能改名
  if (!source || !source.endsWith('/')) {
    throw new Error('请选择文件夹')
  }

  /** 父目录 */
  const parent = source.slice(0, source.lastIndexOf('/', source.length - 2) + 1)
  /** 新前缀 */
  const target = `${parent}${name}/`

  // 名字没变
  if (target === source) {
    return { from: source, to: target }
  }

  /** 旧前缀下的对象 */
  const keys = await listAllKeys(client, source)

  // 空目录至少放一个占位，列表才看得到
  if (!keys.length) {
    await client.put(target, Buffer.alloc(0))
    return { from: source, to: target }
  }

  for (const key of keys) {
    /** 相对旧前缀的后半段 */
    const tail = key.slice(source.length)
    // 复制子对象；遇到 socket hang up 自动重试
    try {
      await client.copy(`${target}${tail}`, key)
    } catch (err) {
      if (err && (String(err.message).includes('socket hang up') || err.code === 'ECONNRESET')) {
        await client.copy(`${target}${tail}`, key)
      } else {
        throw err
      }
    }
  }

  await removePrefix(client, source)
  return { from: source, to: target }
}

/**
 * 改名，一次只处理一个
 * @param {object} config
 * @param {{ type: string, key: string }} item
 * @param {string} name
 */
async function rename(config, item, name) {
  /** 名称问题 */
  const error = checkName(name)

  // 名字不合法就停
  if (error) {
    throw new Error(error)
  }

  /** 去掉空白后的新名字 */
  const nextName = String(name).trim()
  /** 原对象 */
  const key = String((item && item.key) || '')
  assertInside(String(config.prefix || ''), key)

  /** 客户端 */
  const client = openClient(config)

  // 文件夹改的是整棵子树
  if (item.type === 'folder' || key.endsWith('/')) {
    return renameFolder(client, key, nextName)
  }

  return renameFile(client, key, nextName)
}

/** 文件名对应的图片类型，不是图片就空 */
function logoMime(name) {
  /** 小写扩展名 */
  const ext = path.extname(String(name || '')).toLowerCase()

  // PNG
  if (ext === '.png') {
    return 'image/png'
  }

  // JPG
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg'
  }

  // GIF
  if (ext === '.gif') {
    return 'image/gif'
  }

  // WebP
  if (ext === '.webp') {
    return 'image/webp'
  }

  return ''
}

/**
 * Logo 目录：已在默认目录下就原样用，否则接到默认目录后面
 * 填 logo、默认目录是 apk 时，实际去 apk/logo/
 * @param {object} config
 */
function logoHead(config) {
  /** 配置里的 Logo 目录，保存时已经补过尾斜杠 */
  let dir = String((config && config.logoDir) || '')

  // 旧数据可能没尾斜杠，列目录会对不上
  if (dir && !dir.endsWith('/')) {
    dir += '/'
  }

  /** 默认目录 */
  const root = String((config && config.prefix) || '')

  // 没填 Logo 目录
  if (!dir) {
    return ''
  }

  // 没设默认目录，或已经从桶根写到默认目录里面
  if (!root || dir === root || dir.startsWith(root)) {
    return dir
  }

  return `${root}${dir}`
}

/**
 * 列出桶里 Logo 目录这一层的图片，收成页面能显示的 data URL
 * @param {object} config
 */
async function listLogos(config) {
  /** 真正去列的前缀 */
  const head = logoHead(config)

  // 没配目录就没有 Logo
  if (!head) {
    return { files: [] }
  }

  /** 客户端 */
  const client = openClient(config)
  /** 页面要的缩略图 */
  const files = []
  /** 翻页游标 */
  let token = null

  do {
    /** 不加 delimiter，避免没尾斜杠时文件被收成子目录 */
    const query = {
      prefix: head,
      'max-keys': 100
    }

    // 续页
    if (token) {
      query['continuation-token'] = token
    }

    /** 本页 */
    const page = await client.listV2(query)
    token = page.nextContinuationToken || null

    for (const obj of page.objects || []) {
      // 目录占位不要
      if (!obj.name || obj.name === head || obj.name.endsWith('/')) {
        continue
      }

      // 必须还在 Logo 目录里
      if (!obj.name.startsWith(head)) {
        continue
      }

      /** 这一层的文件名 */
      const name = showName(obj.name, head)

      // 子路径或空名不要
      if (!name || name.includes('/')) {
        continue
      }

      /** 能贴进二维码的类型 */
      const mime = logoMime(name)

      // 不是图片
      if (!mime) {
        continue
      }

      // 太大的当海报
      if ((obj.size || 0) > 2 * 1024 * 1024) {
        continue
      }

      try {
        /** 对象内容 */
        const got = await client.get(obj.name)
        /** 文件字节 */
        const buf = got && got.content

        // SDK 偶发给空
        if (!buf) {
          continue
        }

        files.push({
          /** 文件名，弹窗里展示用 */
          name,
          /** 桶内完整路径，拼进 download.html?logo= 与二维码中间同一张 */
          key: obj.name,
          src: `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
        })
      } catch {
        // 单张读失败就跳过，别把整个列表打没
        continue
      }

      // 目录里图太多就停，避免把窗口拖死
      if (files.length >= 40) {
        break
      }
    }
  } while (token && files.length < 40)

  files.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return { files }
}

/**
 * 读取 OSS 存储桶中指定 key 的文本/JSON 文件内容
 * @param {Object} config - OSS 连接配置
 * @param {string} key - 对象在桶中的完整路径
 * @returns {Promise<{ok: boolean, error: string, content: string}>}
 */
async function readText(config, key) {
  /** 校验配置完整性 */
  const err = checkConfig(config)
  if (err) {
    return { ok: false, error: err, content: '' }
  }

  // 必须指定有效的对象路径
  if (!key || typeof key !== 'string') {
    return { ok: false, error: '缺少文件路径', content: '' }
  }

  try {
    /** 实例化的 OSS 客户端 */
    const client = createClient(config, 15000)
    /** 从 OSS 获取对象数据 */
    const got = await client.get(key)
    /** 文件内容字节缓冲区 */
    const buf = got && got.content
    /** 转为 UTF-8 格式的文本字符串 */
    const content = buf ? buf.toString('utf-8') : ''
    return { ok: true, error: '', content }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : '读取文件失败', content: '' }
  }
}

/**
 * 将文本内容上传或覆盖到 OSS 存储桶指定 key
 * @param {Object} config - OSS 连接配置
 * @param {string} key - 对象在桶中的完整路径
 * @param {string} text - 待保存的文本或 JSON 字符串
 * @returns {Promise<{ok: boolean, error: string}>}
 */
async function saveText(config, key, text) {
  /** 校验配置完整性 */
  const err = checkConfig(config)
  if (err) {
    return { ok: false, error: err }
  }

  // 必须指定有效的对象路径
  if (!key || typeof key !== 'string') {
    return { ok: false, error: '缺少文件路径' }
  }

  try {
    /** 实例化的 OSS 客户端 */
    const client = createClient(config, 20000)
    /** 构造 UTF-8 字节缓冲区 */
    const buf = Buffer.from(String(text || ''), 'utf-8')
    /** 上传对象并声明 Content-Type 为 application/json */
    await client.put(key, buf, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    })
    return { ok: true, error: '' }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : '保存文件失败' }
  }
}

module.exports = {
  find,
  ensureDir,
  upload,
  mkdir,
  removeItems,
  rename,
  listLogos,
  readText,
  saveText
}
