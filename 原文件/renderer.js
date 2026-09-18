// 渲染进程：选项卡、配置表单、批量上传列表与二维码操作

/** 配置表单里会读写的字段名列表 */
const configKeys = [
  'accessKeyId',
  'accessKeySecret',
  'region',
  'endpoint',
  'bucket',
  'prefix',
  'customDomain'
]

/** 待上传文件队列（含 UI 状态） */
let files = []

/** 是否正在上传，用于禁用按钮 */
let busy = false

/** 输入弹层的 resolve，取消时回传 null */
let promptResolve = null

/** 确认弹层的 resolve，确定 true / 取消 false */
let confirmResolve = null

/** 关闭输入弹层 */
function closePrompt(value) {
  document.getElementById('prompt-mask').hidden = true

  // 有等待中的 Promise 才回传
  if (promptResolve) {
    /** 暂存回调，避免递归清掉 */
    const resolve = promptResolve
    promptResolve = null
    resolve(value)
  }
}

/** 打开输入弹层，返回输入文本或 null */
function askText(title, message, defaultValue) {
  return new Promise((resolve) => {
    promptResolve = resolve
    document.getElementById('prompt-title').textContent = title || '输入'
    document.getElementById('prompt-message').textContent = message || ''
    /** 输入框 */
    const input = document.getElementById('prompt-input')
    input.value = defaultValue || ''
    document.getElementById('prompt-mask').hidden = false
    // 下一帧聚焦，避免弹层未显示完抢焦失败
    setTimeout(() => {
      input.focus()
      input.select()
    }, 0)
  })
}

/** 关闭确认弹层 */
function closeConfirm(ok) {
  document.getElementById('confirm-mask').hidden = true

  // 有等待中的 Promise 才回传
  if (confirmResolve) {
    /** 暂存回调 */
    const resolve = confirmResolve
    confirmResolve = null
    resolve(!!ok)
  }
}

/** 打开确认弹层 */
function askConfirm(message) {
  return new Promise((resolve) => {
    confirmResolve = resolve
    document.getElementById('confirm-message').textContent = message || ''
    document.getElementById('confirm-mask').hidden = false
  })
}

/** 绑定输入 / 确认弹层 */
function bindAskDialogs() {
  /** 输入遮罩 */
  const promptMask = document.getElementById('prompt-mask')
  /** 确认遮罩 */
  const confirmMask = document.getElementById('confirm-mask')
  /** 输入框 */
  const input = document.getElementById('prompt-input')

  document.getElementById('btn-prompt-ok').addEventListener('click', () => {
    closePrompt(input.value)
  })

  document.getElementById('btn-prompt-cancel').addEventListener('click', () => {
    closePrompt(null)
  })

  document.getElementById('btn-prompt-cancel-2').addEventListener('click', () => {
    closePrompt(null)
  })

  input.addEventListener('keydown', (event) => {
    // Enter 确认
    if (event.key === 'Enter') {
      event.preventDefault()
      closePrompt(input.value)
    }

    // Esc 取消
    if (event.key === 'Escape') {
      event.preventDefault()
      closePrompt(null)
    }
  })

  promptMask.addEventListener('click', (event) => {
    // 点遮罩空白取消
    if (event.target === promptMask) {
      closePrompt(null)
    }
  })

  document.getElementById('btn-confirm-ok').addEventListener('click', () => {
    closeConfirm(true)
  })

  document.getElementById('btn-confirm-cancel').addEventListener('click', () => {
    closeConfirm(false)
  })

  document.getElementById('btn-confirm-cancel-2').addEventListener('click', () => {
    closeConfirm(false)
  })

  confirmMask.addEventListener('click', (event) => {
    // 点遮罩空白取消
    if (event.target === confirmMask) {
      closeConfirm(false)
    }
  })
}

/** 当前弹层里的二维码上下文 */
let qrContext = {
  name: '',
  url: '',
  qr: ''
}

/** 缓存的 Logo DataURL，空串表示未设置 */
let logoDataUrl = ''

/** 把图片 DataURL 加载成 Image */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    /** 图片对象 */
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

/**
 * 在二维码中心叠 Logo；无 Logo 则原样返回
 * @param {string} qrDataUrl 原始二维码
 */
async function withLogo(qrDataUrl) {
  // 没有底图或没有 Logo 就直接用原图
  if (!qrDataUrl) {
    return ''
  }

  // Logo 还没拉过就先拉一次
  if (!logoDataUrl && window.configApi) {
    try {
      /** Logo 读取结果 */
      const logo = await window.configApi.getLogo()
      logoDataUrl = logo && logo.hasLogo ? logo.dataUrl : ''
    } catch (err) {
      logoDataUrl = ''
    }
  }

  // 仍无 Logo
  if (!logoDataUrl) {
    return qrDataUrl
  }

  try {
    /** 二维码图 */
    const qrImg = await loadImage(qrDataUrl)
    /** Logo 图 */
    const logoImg = await loadImage(logoDataUrl)
    /** 画布边长跟二维码一致 */
    const size = qrImg.width
    /** 画布 */
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    /** 2D 上下文 */
    const ctx = canvas.getContext('2d')

    ctx.drawImage(qrImg, 0, 0, size, size)

    /** Logo 约占二维码边长的 22%，太大不好扫 */
    const logoSize = Math.round(size * 0.22)
    /** 白底略大于 Logo，提高对比度 */
    const pad = Math.round(logoSize * 0.18)
    /** 白底边长 */
    const box = logoSize + pad * 2
    /** 白底左上角 */
    const boxX = (size - box) / 2
    /** 白底上边 */
    const boxY = (size - box) / 2
    /** Logo 左上角 */
    const logoX = (size - logoSize) / 2
    /** Logo 上边 */
    const logoY = (size - logoSize) / 2

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(boxX, boxY, box, box)
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize)

    return canvas.toDataURL('image/png')
  } catch (err) {
    console.error(err)
    // 叠图失败就退回原二维码，至少能用
    return qrDataUrl
  }
}

/** 刷新配置页 Logo 预览 */
function renderLogoPreview() {
  /** 预览容器 */
  const box = document.getElementById('logo-preview')

  // 没节点就跳过
  if (!box) {
    return
  }

  // 未设置显示文案
  if (!logoDataUrl) {
    box.textContent = '未设置'
    return
  }

  box.innerHTML = ''
  /** 预览图 */
  const img = document.createElement('img')
  img.alt = '应用 Logo'
  img.src = logoDataUrl
  box.appendChild(img)
}

/** 从本机加载 Logo 到缓存并刷新预览 */
async function refreshLogo() {
  // 接口不可用就当没有
  if (!window.configApi || !window.configApi.getLogo) {
    logoDataUrl = ''
    renderLogoPreview()
    return
  }

  try {
    /** 读取结果 */
    const result = await window.configApi.getLogo()
    logoDataUrl = result && result.hasLogo ? result.dataUrl : ''
  } catch (err) {
    logoDataUrl = ''
    console.error(err)
  }

  renderLogoPreview()
}

/** 绑定 Logo 选择与清除 */
function bindLogo() {
  document.getElementById('btn-logo-pick').addEventListener('click', async () => {
    // 接口缺失
    if (!window.configApi || !window.configApi.pickLogo) {
      setConfigStatus('Logo 接口不可用', 'err')
      return
    }

    /** 选择结果 */
    const result = await window.configApi.pickLogo()

    // 用户取消
    if (result.canceled) {
      return
    }

    // 失败
    if (!result.ok) {
      setConfigStatus('Logo 保存失败', 'err')
      return
    }

    logoDataUrl = result.dataUrl || ''
    renderLogoPreview()
    setConfigStatus('Logo 已保存，生成二维码时会自动带上', 'ok')
  })

  document.getElementById('btn-logo-clear').addEventListener('click', async () => {
    // 接口缺失
    if (!window.configApi || !window.configApi.clearLogo) {
      return
    }

    await window.configApi.clearLogo()
    logoDataUrl = ''
    renderLogoPreview()
    setConfigStatus('Logo 已清除', '')
  })
}

/** 关闭二维码弹层 */
function closeQr() {
  document.getElementById('qr-mask').hidden = true
  qrContext = { name: '', url: '', qr: '' }
}

/** 打开二维码弹层并填内容 */
function openQr(payload) {
  qrContext = {
    name: payload.name || '',
    url: payload.url || '',
    qr: payload.qr || ''
  }

  document.getElementById('qr-name').textContent = qrContext.name
  document.getElementById('qr-image').src = qrContext.qr
  /** 链接节点 */
  const link = document.getElementById('qr-link')
  link.href = qrContext.url
  link.textContent = qrContext.url
  document.getElementById('qr-mask').hidden = false
}

/** 为某个文件生成并展示二维码（含 Logo） */
async function showFileQr(file) {
  // 接口或链接缺失就别生成
  if (!window.uploadApi || !file.url) {
    setBrowseStatus('二维码接口不可用', 'err')
    return
  }

  setBrowseStatus('正在生成二维码…', '')

  try {
    /** 主进程生成结果 */
    const result = await window.uploadApi.makeQr(file.url)

    // 生成失败直接提示
    if (!result.ok) {
      setBrowseStatus(result.error || '生成失败', 'err')
      return
    }

    /** 叠好 Logo 的最终图 */
    const qr = await withLogo(result.qr)

    openQr({
      name: file.name,
      url: file.url,
      qr
    })
    setBrowseStatus(
      logoDataUrl ? `已生成（含 Logo）：${file.name}` : `已生成：${file.name}`,
      'ok'
    )
  } catch (err) {
    setBrowseStatus(err && err.message ? err.message : '生成异常', 'err')
    console.error(err)
  }
}

/** 绑定二维码弹层按钮 */
function bindQrDialog() {
  /** 遮罩 */
  const mask = document.getElementById('qr-mask')

  document.getElementById('btn-qr-close').addEventListener('click', () => {
    closeQr()
  })

  mask.addEventListener('click', (event) => {
    // 点遮罩空白处关闭，点对话框内部不关
    if (event.target === mask) {
      closeQr()
    }
  })

  document.getElementById('btn-qr-copy').addEventListener('click', async () => {
    // 没有链接就不复制
    if (!qrContext.url || !window.uploadApi) {
      return
    }

    await window.uploadApi.copy(qrContext.url)
    setBrowseStatus('已复制链接', 'ok')
  })

  document.getElementById('btn-qr-save').addEventListener('click', async () => {
    // 没有图就不存
    if (!qrContext.qr || !window.uploadApi) {
      return
    }

    /** 保存结果 */
    const result = await window.uploadApi.saveQr({
      name: qrContext.name,
      qr: qrContext.qr
    })

    // 用户取消对话框就不提示成功
    if (result && result.ok) {
      setBrowseStatus('二维码已保存', 'ok')
    }
  })
}

/** 当前浏览前缀，空字符串表示桶根 */
let browsePrefix = ''

/** 最近一次浏览结果，供本地筛选 */
let browseData = {
  bucket: '',
  prefix: '',
  folders: [],
  files: []
}

/** 浏览列表是否正在请求 */
let browseBusy = false

/** 是否已经成功加载过一次浏览 */
let browseLoaded = false
/** 把 preload 暴露的版本信息填到「运行环境」面板 */
function fillInfo() {
  /** preload 挂到 window 上的只读信息 */
  const info = window.appInfo

  // 预加载没挂上就别往下写，避免报错打断页面
  if (!info) {
    return
  }

  document.getElementById('platform').textContent = info.platform
  document.getElementById('electron').textContent = info.electron
  document.getElementById('chrome').textContent = info.chrome
  document.getElementById('node').textContent = info.node
}

/** 切换顶部选项卡 */
function switchTab(name) {
  /** 所有选项卡按钮 */
  const tabs = document.querySelectorAll('.tab')
  /** 所有面板 */
  const panels = document.querySelectorAll('.tab-panel')

  tabs.forEach((tab) => {
    /** 当前按钮对应的面板名 */
    const active = tab.dataset.tab === name
    tab.classList.toggle('is-active', active)
    tab.setAttribute('aria-selected', active ? 'true' : 'false')
  })

  panels.forEach((panel) => {
    // 只显示点中的那一块
    if (panel.id === `panel-${name}`) {
      panel.hidden = false
      panel.classList.add('is-active')
    } else {
      panel.hidden = true
      panel.classList.remove('is-active')
    }
  })
}

/** 绑定选项卡点击 */
function bindTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      // 禁用项点了也不切
      if (tab.disabled) {
        return
      }

      /** 目标面板名 */
      const name = tab.dataset.tab
      switchTab(name)

      // 第一次进浏览页自动从桶根拉列表
      if (name === 'browse' && !browseLoaded && !browseBusy) {
        loadBrowse('')
      }
    })
  })
}

/** 从表单收集配置对象 */
function readForm() {
  /** 收集结果 */
  const data = {}

  configKeys.forEach((key) => {
    /** 对应输入框 */
    const input = document.getElementById(key)
    data[key] = input ? input.value.trim() : ''
  })

  return data
}

/** 把配置对象写回表单 */
function writeForm(data) {
  configKeys.forEach((key) => {
    /** 对应输入框 */
    const input = document.getElementById(key)

    // 缺字段就跳过，避免空引用
    if (!input) {
      return
    }

    input.value = data && data[key] ? data[key] : ''
  })
}

/** 更新配置区状态文案 */
function setConfigStatus(text, type) {
  /** 状态提示节点 */
  const el = document.getElementById('config-status')
  el.textContent = text
  el.classList.remove('is-ok', 'is-err')

  // 成功 / 失败用不同颜色
  if (type === 'ok') {
    el.classList.add('is-ok')
  } else if (type === 'err') {
    el.classList.add('is-err')
  }
}

/** 更新上传区状态文案 */
function setUploadStatus(text, type) {
  /** 状态提示节点 */
  const el = document.getElementById('upload-status')
  el.textContent = text
  el.classList.remove('is-ok', 'is-err')

  // 成功 / 失败用不同颜色
  if (type === 'ok') {
    el.classList.add('is-ok')
  } else if (type === 'err') {
    el.classList.add('is-err')
  }
}

/** 启动时从主进程拉已存配置 */
async function loadConfig() {
  // preload 没暴露 API 就提示，方便排查
  if (!window.configApi) {
    setConfigStatus('配置接口不可用，请检查 preload', 'err')
    return
  }

  try {
    /** 磁盘里的配置 */
    const data = await window.configApi.load()
    writeForm(data || {})

    // 有任一关键字段就算加载过
    if (data && (data.accessKeyId || data.bucket)) {
      setConfigStatus('已加载本机保存的配置', 'ok')
    }

    // 同步 Logo 预览
    await refreshLogo()
  } catch (err) {
    setConfigStatus('加载配置失败', 'err')
    console.error(err)
  }
}

/** 校验必填项，返回错误文案或空串 */
function validate(data) {
  // AccessKey / Bucket / Region 是上传最低门槛
  if (!data.accessKeyId) {
    return '请填写 AccessKey ID'
  }

  if (!data.accessKeySecret) {
    return '请填写 AccessKey Secret'
  }

  if (!data.bucket) {
    return '请填写 Bucket'
  }

  if (!data.region && !data.endpoint) {
    return '请至少填写 Region 或 Endpoint'
  }

  return ''
}

/** 绑定配置表单保存与清空 */
function bindForm() {
  /** 配置表单 */
  const form = document.getElementById('config-form')
  /** 清空按钮 */
  const clearBtn = document.getElementById('btn-clear')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    /** 当前表单数据 */
    const data = readForm()
    /** 校验错误 */
    const error = validate(data)

    // 必填没齐就不落盘
    if (error) {
      setConfigStatus(error, 'err')
      return
    }

    // preload 没挂上就别调，直接告诉原因
    if (!window.configApi) {
      setConfigStatus('配置接口不可用，请检查 preload', 'err')
      return
    }

    try {
      await window.configApi.save(data)
      setConfigStatus('已保存到本机', 'ok')
    } catch (err) {
      /** 具体失败原因，方便排查 */
      const reason = err && err.message ? err.message : '未知错误'
      setConfigStatus(`保存失败：${reason}`, 'err')
      console.error(err)
    }
  })

  clearBtn.addEventListener('click', () => {
    writeForm({})
    setConfigStatus('表单已清空（尚未写入磁盘）', '')
  })
}

/** 把字节数格式化成可读大小 */
function formatSize(bytes) {
  // 小于 1KB 直接显示 B
  if (bytes < 1024) {
    return `${bytes} B`
  }

  // 小于 1MB 显示 KB
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** 同步上传按钮可用状态 */
function syncUploadButtons() {
  /** 开始上传按钮 */
  const uploadBtn = document.getElementById('btn-upload')
  /** 清空列表按钮 */
  const clearBtn = document.getElementById('btn-clear-files')
  /** 选择文件按钮 */
  const pickBtn = document.getElementById('btn-pick')
  /** 是否有待传文件 */
  const hasFiles = files.length > 0

  uploadBtn.disabled = busy || !hasFiles
  clearBtn.disabled = busy || !hasFiles
  pickBtn.disabled = busy
}

/** 渲染文件列表卡片 */
function renderFiles() {
  /** 列表容器 */
  const list = document.getElementById('file-list')
  /** 空状态文案 */
  const empty = document.getElementById('file-empty')

  // 没文件就显示空态
  if (!files.length) {
    list.hidden = true
    list.innerHTML = ''
    empty.hidden = false
    syncUploadButtons()
    return
  }

  empty.hidden = true
  list.hidden = false
  list.innerHTML = ''

  files.forEach((file, index) => {
    /** 单文件卡片 */
    const card = document.createElement('div')
    card.className = 'file-card'
    card.dataset.index = String(index)

    /** 状态文案 */
    let stateText = '等待上传'
    /** 状态样式 */
    let stateClass = ''

    // 按阶段给不同文案
    if (file.stage === 'uploading') {
      stateText = `上传中 ${file.percent || 0}%`
      stateClass = 'is-uploading'
    } else if (file.stage === 'done') {
      stateText = '上传成功'
      stateClass = 'is-done'
    } else if (file.stage === 'error') {
      stateText = `失败：${file.error || '未知错误'}`
      stateClass = 'is-error'
    }

    card.innerHTML = `
      <div class="file-top">
        <div class="file-name"></div>
        <div class="file-meta"></div>
      </div>
      <div class="file-state ${stateClass}"></div>
      <div class="progress"><span style="width:${file.percent || 0}%"></span></div>
      <div class="file-result ${file.url ? 'is-show' : ''}">
        <img class="file-qr" alt="二维码" />
        <div class="file-link-wrap">
          <a class="file-link" target="_blank" rel="noreferrer"></a>
          <div class="file-ops">
            <button type="button" class="btn btn-tiny" data-act="copy">复制链接</button>
            <button type="button" class="btn btn-tiny" data-act="save">保存二维码</button>
          </div>
        </div>
      </div>
    `

    card.querySelector('.file-name').textContent = file.name
    card.querySelector('.file-meta').textContent = formatSize(file.size)
    card.querySelector('.file-state').textContent = stateText

    /** 二维码图 */
    const qrImg = card.querySelector('.file-qr')
    /** 链接锚点 */
    const link = card.querySelector('.file-link')

    // 有结果才填链接和二维码
    if (file.url) {
      link.href = file.url
      link.textContent = file.url
      qrImg.src = file.qr || ''
    }

    card.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      // 没链接就不用复制
      if (!file.url) {
        return
      }

      await window.uploadApi.copy(file.url)
      setUploadStatus(`已复制：${file.name}`, 'ok')
    })

    card.querySelector('[data-act="save"]').addEventListener('click', async () => {
      // 没二维码就不用存
      if (!file.qr) {
        return
      }

      /** 保存结果 */
      const result = await window.uploadApi.saveQr({
        name: file.name,
        qr: file.qr
      })

      // 用户取消对话框就不提示成功
      if (result && result.ok) {
        setUploadStatus('二维码已保存', 'ok')
      }
    })

    list.appendChild(card)
  })

  syncUploadButtons()
}

/** 按路径去重合并新选文件 */
function mergeFiles(picked) {
  /** 已有路径集合 */
  const seen = new Set(files.map((item) => item.path))

  picked.forEach((item) => {
    // 同一路径不重复入队
    if (seen.has(item.path)) {
      return
    }

    files.push({
      path: item.path,
      name: item.name,
      size: item.size,
      percent: 0,
      stage: 'pending',
      url: '',
      qr: '',
      error: ''
    })
    seen.add(item.path)
  })
}

/** 根据主进程进度事件更新对应卡片状态 */
function applyProgress(payload) {
  /** 目标下标 */
  const index = payload.index
  /** 队列里的那一项 */
  const file = files[index]

  // 下标对不上就忽略，避免错改
  if (!file) {
    return
  }

  // 开始或进行中都标成 uploading
  if (payload.stage === 'start' || payload.stage === 'progress') {
    file.stage = 'uploading'
    file.percent = payload.percent || 0
  } else if (payload.stage === 'done') {
    file.stage = 'done'
    file.percent = 100
    file.url = payload.url || ''
    file.qr = payload.qr || ''
    file.error = ''
    renderFiles()

    // 异步叠 Logo，叠完再刷一次卡片
    if (payload.qr) {
      withLogo(payload.qr).then((qr) => {
        file.qr = qr
        renderFiles()
      })
    }
    return
  } else if (payload.stage === 'error') {
    file.stage = 'error'
    file.percent = 0
    file.error = payload.error || '上传失败'
  }

  renderFiles()
}

/** 绑定上传区按钮与进度监听 */
function bindUpload() {
  /** 选文件按钮 */
  const pickBtn = document.getElementById('btn-pick')
  /** 上传按钮 */
  const uploadBtn = document.getElementById('btn-upload')
  /** 清空按钮 */
  const clearBtn = document.getElementById('btn-clear-files')

  // preload 异常时直接提示
  if (!window.uploadApi) {
    setUploadStatus('上传接口不可用，请检查 preload', 'err')
    return
  }

  window.uploadApi.onProgress((payload) => {
    applyProgress(payload)
  })

  pickBtn.addEventListener('click', async () => {
    /** 对话框选出的文件 */
    const picked = await window.uploadApi.pick()

    // 取消或空选就不动列表
    if (!picked || !picked.length) {
      return
    }

    mergeFiles(picked)
    renderFiles()
    setUploadStatus(`已加入 ${picked.length} 个文件`, 'ok')
  })

  clearBtn.addEventListener('click', () => {
    // 上传中不允许清空，避免状态错乱
    if (busy) {
      return
    }

    files = []
    renderFiles()
    setUploadStatus('列表已清空', '')
  })

  uploadBtn.addEventListener('click', async () => {
    // 没文件或忙着就忽略
    if (busy || !files.length) {
      return
    }

    busy = true
    syncUploadButtons()
    setUploadStatus('正在上传…', '')

    // 开始前把旧结果清掉，避免展示过期二维码
    files.forEach((file) => {
      file.stage = 'pending'
      file.percent = 0
      file.url = ''
      file.qr = ''
      file.error = ''
    })
    renderFiles()

    try {
      /** 本机路径列表 */
      const paths = files.map((file) => file.path)
      /** 主进程批量上传结果 */
      const result = await window.uploadApi.start(paths)

      // 配置类错误整批失败
      if (!result.ok) {
        setUploadStatus(result.error || '上传失败', 'err')
        return
      }

      // 用最终结果再对齐一遍，防止进度事件漏了
      for (let index = 0; index < result.items.length; index += 1) {
        /** 单项结果 */
        const item = result.items[index]
        /** 对应队列项 */
        const file = files[index]

        // 数量不对就跳过
        if (!file) {
          continue
        }

        // 成功项补齐链接与二维码（含 Logo）
        if (item.ok) {
          file.stage = 'done'
          file.percent = 100
          file.url = item.url
          file.qr = await withLogo(item.qr)
          file.error = ''
        } else {
          file.stage = 'error'
          file.error = item.error || '上传失败'
        }
      }

      renderFiles()

      /** 成功个数 */
      const okCount = result.items.filter((item) => item.ok).length
      /** 失败个数 */
      const failCount = result.items.length - okCount

      // 有失败就用警告语气
      if (failCount > 0) {
        setUploadStatus(`完成：成功 ${okCount}，失败 ${failCount}`, 'err')
      } else {
        setUploadStatus(`全部上传成功（${okCount}）`, 'ok')
      }
    } catch (err) {
      setUploadStatus(err && err.message ? err.message : '上传异常', 'err')
      console.error(err)
    } finally {
      busy = false
      syncUploadButtons()
    }
  })

  syncUploadButtons()
}

/** 更新浏览区状态文案 */
function setBrowseStatus(text, type) {
  /** 状态提示节点 */
  const el = document.getElementById('browse-status')
  el.textContent = text
  el.classList.remove('is-ok', 'is-err')

  // 成功 / 失败用不同颜色
  if (type === 'ok') {
    el.classList.add('is-ok')
  } else if (type === 'err') {
    el.classList.add('is-err')
  }
}

/** 把前缀拆成面包屑段 */
function crumbParts(prefix) {
  /** 去掉尾部 / 再按段切 */
  const clean = String(prefix || '').replace(/\/+$/, '')

  // 根目录只有一段
  if (!clean) {
    return [{ label: '根目录', prefix: '' }]
  }

  /** 路径各段 */
  const parts = clean.split('/').filter(Boolean)
  /** 面包屑结果，始终带根 */
  const items = [{ label: '根目录', prefix: '' }]
  /** 累加前缀 */
  let acc = ''

  parts.forEach((part) => {
    acc += `${part}/`
    items.push({ label: part, prefix: acc })
  })

  return items
}

/** 渲染面包屑 */
function renderCrumb() {
  /** 面包屑容器 */
  const nav = document.getElementById('browse-crumb')
  /** 路径段 */
  const parts = crumbParts(browsePrefix)
  nav.innerHTML = ''

  parts.forEach((part, index) => {
    // 段与段之间加分隔符
    if (index > 0) {
      /** 分隔符 */
      const sep = document.createElement('span')
      sep.className = 'crumb-sep'
      sep.textContent = '/'
      nav.appendChild(sep)
    }

    /** 可点击路径按钮 */
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'crumb'
    btn.textContent = part.label

    // 最后一段就是当前位置，不再点击
    if (index === parts.length - 1) {
      btn.disabled = true
    } else {
      btn.addEventListener('click', () => {
        loadBrowse(part.prefix)
      })
    }

    nav.appendChild(btn)
  })

  // 有桶名就标在根旁边，方便确认连的是哪只桶
  if (browseData.bucket) {
    /** 桶名提示 */
    const mark = document.createElement('span')
    mark.className = 'crumb-sep'
    mark.textContent = `（${browseData.bucket}）`
    nav.appendChild(mark)
  }
}

/** 格式化修改时间 */
function formatTime(text) {
  // 没有时间就显示占位
  if (!text) {
    return '-'
  }

  /** 解析后的日期 */
  const date = new Date(text)

  // 非法日期原样返回
  if (Number.isNaN(date.getTime())) {
    return text
  }

  return date.toLocaleString()
}

/** 按筛选框过滤当前层名称 */
function filteredItems() {
  /** 筛选关键字 */
  const keyword = document.getElementById('browse-filter').value.trim().toLowerCase()
  /** 目录 */
  let folders = browseData.folders || []
  /** 文件 */
  let filesOnly = browseData.files || []

  // 有关键字就只留名字包含的
  if (keyword) {
    folders = folders.filter((item) => item.name.toLowerCase().includes(keyword))
    filesOnly = filesOnly.filter((item) => item.name.toLowerCase().includes(keyword))
  }

  return { folders, files: filesOnly }
}

/** 渲染浏览表格 */
function renderBrowse() {
  /** 空态 */
  const empty = document.getElementById('browse-empty')
  /** 表格外层 */
  const wrap = document.getElementById('browse-table-wrap')
  /** 表体 */
  const body = document.getElementById('browse-body')
  /** 过滤后的列表 */
  const { folders, files: filesOnly } = filteredItems()

  renderCrumb()
  body.innerHTML = ''

  // 当前层什么都没有
  if (!folders.length && !filesOnly.length) {
    wrap.hidden = true
    empty.hidden = false
    empty.textContent = browseLoaded
      ? '当前目录为空（或筛选无结果）'
      : '点「刷新」从桶根加载。'
    return
  }

  empty.hidden = true
  wrap.hidden = false

  folders.forEach((folder) => {
    /** 目录行 */
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>
        <div class="browse-name">
          <span class="browse-icon is-folder">D</span>
          <button type="button" class="browse-open"></button>
        </div>
      </td>
      <td class="col-size">-</td>
      <td class="col-time">-</td>
      <td class="col-act">
        <button type="button" class="btn btn-tiny" data-act="enter">打开</button>
        <button type="button" class="btn btn-tiny" data-act="rename">重命名</button>
        <button type="button" class="btn btn-tiny btn-danger" data-act="remove">删除</button>
      </td>
    `
    tr.querySelector('.browse-open').textContent = folder.name
    tr.querySelector('.browse-open').addEventListener('click', () => {
      loadBrowse(folder.prefix)
    })
    tr.querySelector('[data-act="enter"]').addEventListener('click', () => {
      loadBrowse(folder.prefix)
    })
    tr.querySelector('[data-act="rename"]').addEventListener('click', () => {
      renameItem('folder', folder.prefix, folder.name)
    })
    tr.querySelector('[data-act="remove"]').addEventListener('click', () => {
      removeItem('folder', folder.prefix, folder.name)
    })
    body.appendChild(tr)
  })

  filesOnly.forEach((file) => {
    /** 文件行 */
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>
        <div class="browse-name">
          <span class="browse-icon is-file">F</span>
          <span class="file-label"></span>
        </div>
      </td>
      <td class="col-size"></td>
      <td class="col-time"></td>
      <td class="col-act">
        <button type="button" class="btn btn-tiny" data-act="copy">复制链接</button>
        <button type="button" class="btn btn-tiny" data-act="qr">二维码</button>
        <button type="button" class="btn btn-tiny" data-act="rename">重命名</button>
        <button type="button" class="btn btn-tiny btn-danger" data-act="remove">删除</button>
      </td>
    `
    tr.querySelector('.file-label').textContent = file.name
    tr.querySelector('.col-size').textContent = formatSize(file.size)
    tr.querySelector('.col-time').textContent = formatTime(file.lastModified)
    tr.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      // 剪贴板走 uploadApi 已有封装
      if (!window.uploadApi || !file.url) {
        setBrowseStatus('复制接口不可用', 'err')
        return
      }

      try {
        await window.uploadApi.copy(file.url)
        setBrowseStatus(`已复制链接：${file.name}`, 'ok')
      } catch (err) {
        setBrowseStatus('复制失败', 'err')
      }
    })
    tr.querySelector('[data-act="qr"]').addEventListener('click', () => {
      showFileQr(file)
    })
    tr.querySelector('[data-act="rename"]').addEventListener('click', () => {
      renameItem('file', file.key, file.name)
    })
    tr.querySelector('[data-act="remove"]').addEventListener('click', () => {
      removeItem('file', file.key, file.name)
    })
    body.appendChild(tr)
  })
}

/** 从 OSS 拉取某一层目录 */
async function loadBrowse(prefix) {
  // preload 异常直接提示
  if (!window.browseApi) {
    setBrowseStatus('浏览接口不可用，请检查 preload', 'err')
    return
  }

  // 正在请求就忽略重入
  if (browseBusy) {
    return
  }

  browseBusy = true
  setBrowseStatus('加载中…', '')

  try {
    /** 主进程列表结果 */
    const result = await window.browseApi.list(prefix)

    // 配置或网络错误
    if (!result.ok) {
      setBrowseStatus(result.error || '加载失败', 'err')
      return
    }

    browsePrefix = result.prefix || ''
    browseData = {
      bucket: result.bucket || '',
      prefix: result.prefix || '',
      folders: result.folders || [],
      files: result.files || []
    }
    browseLoaded = true
    renderBrowse()

    /** 本层条目数 */
    const count = browseData.folders.length + browseData.files.length
    setBrowseStatus(
      browsePrefix ? `已加载 ${count} 项` : `桶根，共 ${count} 项`,
      'ok'
    )
  } catch (err) {
    setBrowseStatus(err && err.message ? err.message : '加载异常', 'err')
    console.error(err)
  } finally {
    browseBusy = false
  }
}

/** 新建文件夹 */
async function createFolder() {
  // 接口缺失直接提示
  if (!window.browseApi) {
    setBrowseStatus('浏览接口不可用', 'err')
    return
  }

  /** 用户输入的目录名（Electron 不支持 window.prompt，用自建弹层） */
  const name = await askText('新建文件夹', '请输入新文件夹名称', '')

  // 取消
  if (name === null) {
    return
  }

  setBrowseStatus('正在创建…', '')

  try {
    /** 创建结果 */
    const result = await window.browseApi.mkdir({
      prefix: browsePrefix,
      name
    })

    // 失败提示
    if (!result.ok) {
      setBrowseStatus(result.error || '创建失败', 'err')
      return
    }

    setBrowseStatus(`已创建：${name}`, 'ok')
    await loadBrowse(browsePrefix)
  } catch (err) {
    setBrowseStatus(err && err.message ? err.message : '创建异常', 'err')
  }
}

/** 浏览页是否正在上传 */
let browseUploading = false

/** 显示 / 更新浏览上传进度条 */
function showBrowseProgress(message, percent) {
  /** 进度面板 */
  const box = document.getElementById('browse-progress')
  /** 文案 */
  const text = document.getElementById('browse-progress-text')
  /** 进度条 */
  const bar = document.getElementById('browse-progress-bar')

  box.hidden = false
  text.textContent = message || '上传中…'
  /** 限制在 0~100 */
  const width = Math.max(0, Math.min(100, Number(percent) || 0))
  bar.style.width = `${width}%`
}

/** 隐藏浏览上传进度条 */
function hideBrowseProgress() {
  document.getElementById('browse-progress').hidden = true
  document.getElementById('browse-progress-bar').style.width = '0%'
}

/** 同步浏览页上传相关按钮禁用态 */
function syncBrowseUploadButtons() {
  document.getElementById('btn-browse-upload').disabled = browseUploading
  document.getElementById('btn-browse-mkdir').disabled = browseUploading
  document.getElementById('btn-browse-refresh').disabled = browseUploading
}

/** 根据进度事件换算整批百分比 */
function browseBatchPercent(payload) {
  /** 总数 */
  const total = payload.total || 1
  /** 当前下标 */
  const index = payload.index || 0
  /** 当前文件进度 */
  const filePercent = payload.percent || 0

  // 整批进度 = 已完成文件 + 当前文件比例
  return Math.round(((index + filePercent / 100) / total) * 100)
}

/** 处理浏览上传进度事件 */
function onBrowseUploadProgress(payload) {
  /** 文案 */
  const message = payload.message || '上传中…'
  /** 百分比 */
  let percent = 0

  // 整批结束顶满
  if (payload.stage === 'done') {
    percent = 100
  } else if (payload.stage === 'start') {
    percent = 0
  } else {
    percent = browseBatchPercent(payload)
  }

  showBrowseProgress(message, percent)
  setBrowseStatus(message, payload.stage === 'file-error' ? 'err' : '')
}

/** 上传文件到当前目录 */
async function uploadHere() {
  // 接口缺失直接提示
  if (!window.browseApi) {
    setBrowseStatus('浏览接口不可用', 'err')
    return
  }

  // 正在传就别重入
  if (browseUploading) {
    return
  }

  browseUploading = true
  syncBrowseUploadButtons()
  showBrowseProgress('请在弹出的窗口中选择文件…', 0)
  setBrowseStatus('请选择本地文件（若没看到窗口，检查任务栏是否被挡住）', '')

  try {
    /** 上传结果 */
    const result = await window.browseApi.upload(browsePrefix)

    // 用户取消对话框
    if (result.canceled) {
      hideBrowseProgress()
      setBrowseStatus('已取消上传', '')
      return
    }

    // 整批失败
    if (!result.ok && (!result.items || !result.items.length)) {
      hideBrowseProgress()
      setBrowseStatus(result.error || '上传失败', 'err')
      return
    }

    /** 成功数 */
    const okCount = (result.items || []).filter((item) => item.ok).length
    /** 总数 */
    const total = (result.items || []).length
    showBrowseProgress(`上传完成：成功 ${okCount} / ${total}`, 100)
    setBrowseStatus(`上传完成：成功 ${okCount} / ${total}`, okCount === total ? 'ok' : 'err')
    await loadBrowse(browsePrefix)

    // 稍留一会儿让用户看到 100%，再收起
    setTimeout(() => {
      // 若又开始新上传就别藏
      if (!browseUploading) {
        hideBrowseProgress()
      }
    }, 1200)
  } catch (err) {
    hideBrowseProgress()
    setBrowseStatus(err && err.message ? err.message : '上传异常', 'err')
  } finally {
    browseUploading = false
    syncBrowseUploadButtons()
  }
}

/** 重命名文件或文件夹 */
async function renameItem(type, from, oldName) {
  // 接口缺失直接提示
  if (!window.browseApi) {
    setBrowseStatus('浏览接口不可用', 'err')
    return
  }

  /** 新名称 */
  const name = await askText('重命名', '请输入新名称', oldName || '')

  // 取消
  if (name === null) {
    return
  }

  // 没改就不请求
  if (String(name).trim() === String(oldName || '').trim()) {
    return
  }

  setBrowseStatus('正在重命名…', '')

  try {
    /** 改名结果 */
    const result = await window.browseApi.rename({
      type,
      from,
      name
    })

    // 失败提示
    if (!result.ok) {
      setBrowseStatus(result.error || '重命名失败', 'err')
      return
    }

    setBrowseStatus(`已重命名为：${name}`, 'ok')
    await loadBrowse(browsePrefix)
  } catch (err) {
    setBrowseStatus(err && err.message ? err.message : '重命名异常', 'err')
  }
}

/** 删除文件或文件夹 */
async function removeItem(type, target, label) {
  // 接口缺失直接提示
  if (!window.browseApi) {
    setBrowseStatus('浏览接口不可用', 'err')
    return
  }

  /** 确认文案 */
  const tip =
    type === 'folder'
      ? `确定删除文件夹「${label}」及其下全部文件？此操作不可恢复。`
      : `确定删除文件「${label}」？此操作不可恢复。`

  /** 是否确认 */
  const ok = await askConfirm(tip)

  // 用户取消
  if (!ok) {
    return
  }

  setBrowseStatus('正在删除…', '')

  try {
    /** 删除结果 */
    const result = await window.browseApi.remove({
      type,
      target
    })

    // 失败提示
    if (!result.ok) {
      setBrowseStatus(result.error || '删除失败', 'err')
      return
    }

    setBrowseStatus(
      type === 'folder' ? `已删除目录（${result.deleted || 0} 个对象）` : '已删除文件',
      'ok'
    )
    await loadBrowse(browsePrefix)
  } catch (err) {
    setBrowseStatus(err && err.message ? err.message : '删除异常', 'err')
  }
}

/** 绑定浏览页按钮与筛选 */
function bindBrowse() {
  // 订阅上传进度（只绑一次）
  if (window.browseApi && window.browseApi.onUploadProgress) {
    window.browseApi.onUploadProgress(onBrowseUploadProgress)
  }

  document.getElementById('btn-browse-refresh').addEventListener('click', () => {
    loadBrowse(browsePrefix)
  })

  document.getElementById('btn-browse-root').addEventListener('click', () => {
    loadBrowse('')
  })

  document.getElementById('btn-browse-mkdir').addEventListener('click', () => {
    createFolder()
  })

  document.getElementById('btn-browse-upload').addEventListener('click', () => {
    uploadHere()
  })

  document.getElementById('browse-filter').addEventListener('input', () => {
    // 只过滤本地缓存，不重新请求
    if (!browseLoaded) {
      return
    }

    renderBrowse()
  })
}

fillInfo()
bindTabs()
bindForm()
bindLogo()
bindBrowse()
bindAskDialogs()
bindQrDialog()
bindUpload()
loadConfig()