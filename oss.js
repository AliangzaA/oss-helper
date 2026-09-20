// 用已保存的 OSS 配置列目录、按名字查找
const OSS = require('ali-oss')

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
function createClient(config) {
  /** 传给 SDK 的参数 */
  const options = {
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    timeout: 60 * 1000
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
      folders.push({
        type: 'folder',
        name: showName(folderKey, head),
        key: folderKey,
        size: 0
      })
    })

    ;(page.objects || []).forEach((obj) => {
      // 目录占位对象不要当成文件
      if (!obj.name || obj.name === head) {
        return
      }

      files.push({
        type: 'file',
        name: showName(obj.name, head),
        key: obj.name,
        size: obj.size || 0
      })
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

      items.push({
        type: folder ? 'folder' : 'file',
        name,
        key: obj.name,
        size: obj.size || 0
      })
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

module.exports = {
  find,
  ensureDir
}
