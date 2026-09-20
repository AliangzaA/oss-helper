<template>
  <n-config-provider
    :theme="theme"
    :theme-overrides="overrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <n-message-provider>
      <div class="shell">
        <!-- 左侧：上面切存储，底部是存储位置 -->
        <aside class="rail">
          <div class="pill">
            <button
              v-for="item in stores"
              :key="item.id"
              class="dot"
              :class="{ on: item.id === active }"
              :title="item.name"
              type="button"
              @click="pick(item.id)"
              @contextmenu.prevent="openMenu($event, item.id)"
            >
              {{ mark(item.name) }}
            </button>
            <button class="plus" type="button" title="添加 OSS" @click="openAdd">
              +
            </button>
          </div>
<!--          最下方设置应用的-->
          <button
            class="gear"
            :class="{ on: page === 'settings' }"
            type="button"
            title="设置"
            @click="openSettings"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.5a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .45-.18.5-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.56zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
              />
            </svg>
          </button>
        </aside>

        <n-dropdown
          trigger="manual"
          placement="bottom-start"
          :show="menuShow"
          :x="menuX"
          :y="menuY"
          :options="menuOptions"
          @select="onMenu"
          @clickoutside="menuShow = false"
        />

        <!-- 右侧：主页、配置页、存储位置在这里切换 -->
        <main class="stage">
          <!-- 配置页：加号和编辑都走这里 -->
          <section v-if="page === 'form'" class="form-page">
            <header class="form-head">
              <button class="back" type="button" title="返回" @click="close">←</button>
              <h2>{{ title }}</h2>
            </header>

            <n-form
              ref="formRef"
              class="form"
              :model="draft"
              :rules="rules"
              autocomplete="off"
              label-placement="top"
            >
              <n-form-item label="名称" path="name">
                <n-input v-model:value="draft.name" placeholder="生产 / 测试" />
              </n-form-item>
              <n-form-item label="AccessKey ID" path="accessKeyId">
                <n-input
                  v-model:value="draft.accessKeyId"
                  placeholder="LTAI5t..."
                  :input-props="{ spellcheck: false }"
                />
              </n-form-item>
              <n-form-item label="AccessKey Secret" path="accessKeySecret">
                <n-input
                  v-model:value="draft.accessKeySecret"
                  type="password"
                  show-password-on="click"
                  placeholder="密钥，仅保存在本机"
                />
              </n-form-item>
              <n-grid :cols="2" :x-gap="16">
                <n-gi>
                  <n-form-item label="Region" path="region">
                    <n-input v-model:value="draft.region" placeholder="oss-cn-hangzhou" />
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item label="Bucket" path="bucket">
                    <n-input v-model:value="draft.bucket" placeholder="your-bucket" />
                  </n-form-item>
                </n-gi>
              </n-grid>
              <n-form-item label="Endpoint（可选）" path="endpoint">
                <n-input
                  v-model:value="draft.endpoint"
                  placeholder="https://oss-cn-hangzhou.aliyuncs.com"
                />
              </n-form-item>
              <n-form-item label="默认目录（可选）" path="prefix">
                <n-input v-model:value="draft.prefix" placeholder="apk/release/，不填就是桶根" />
              </n-form-item>
            </n-form>

            <p v-if="diskError && page === 'form'" class="err">{{ diskError }}</p>
            <footer class="form-foot">
              <div class="foot-side">
                <n-button title="文件里包含 AccessKey，只交给要导入的那台电脑" @click="exportConfig">
                  导出
                </n-button>
                <n-button @click="importConfig">导入</n-button>
              </div>
              <n-button type="primary" @click="save">保存</n-button>
            </footer>
          </section>

          <!-- 设置页：选项从上往下排，以后加项就再接一块 -->
          <section v-else-if="page === 'settings'" class="settings">
            <header class="form-head">
              <button class="back" type="button" title="返回" @click="close">←</button>
              <h2>设置</h2>
            </header>
            <div class="settings-body">
              <section class="set-block">
                <h3>存储位置</h3>
                <p class="hint block">
                  配置写在这个文件里。换到空目录时，当前列表会写过去；那个目录里已经有文件，就改用那份。
                </p>
                <div class="path-row">
                  <p class="path">{{ filePath || '应用窗口里才会显示路径' }}</p>
                  <n-button :disabled="!custom" @click="useDefault">恢复默认</n-button>
                  <n-button type="primary" @click="chooseDir">选择目录</n-button>
                </div>
                <p class="path-note">目录选择记在 {{ pointer || 'userData/settings.json' }}，不跟配置文件走。</p>
                <p v-if="diskError" class="err">{{ diskError }}</p>
              </section>
            </div>
          </section>

          <!-- 主页：还没配任何存储 -->
          <p v-else-if="!current" class="hint">点左侧 + 添加 OSS</p>
          <!-- 主页：用当前配置列目录，或按名字查找 -->
          <section v-else class="home">
            <header class="head">
              <strong>{{ current.name }}</strong>
              <span>{{ current.bucket || '未填 Bucket' }}</span>
              <n-button text type="primary" @click="openEdit">编辑</n-button>
            </header>
            <div class="find-row">
              <n-input
                v-model:value="keyword"
                placeholder="按文件名查找，留空则列出当前目录"
                clearable
                @keyup.enter="runFind"
              />
              <n-button v-if="deeper" @click="up">返回上层</n-button>
              <n-button type="primary" :loading="finding" @click="runFind">查找</n-button>
            </div>
            <p class="hint where">{{ whereText }}</p>
            <p v-if="findError" class="err">{{ findError }}</p>
            <p v-else-if="truncated" class="hint where">结果太多，只显示了一部分</p>
            <div class="hits">
              <p v-if="finding" class="hint">正在查找…</p>
              <p v-else-if="!findError && !hits.length" class="hint">没有结果</p>
              <button
                v-for="item in hits"
                :key="item.key"
                class="hit"
                :class="{ file: item.type === 'file' }"
                type="button"
                @click="openHit(item)"
              >
                <span class="hit-name">{{ item.type === 'folder' ? `${item.name}/` : item.name }}</span>
                <span v-if="item.type === 'file'" class="hit-size">{{ formatSize(item.size) }}</span>
              </button>
            </div>
          </section>
          <p v-if="page === 'home' && diskError" class="err">{{ diskError }}</p>
        </main>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
/** Naive 中文包，按钮占位符等走中文 */
import { dateZhCN, zhCN } from 'naive-ui'
import { overrides, theme } from './theme'

/** 已保存的存储列表，启动后从磁盘灌进来 */
const stores = ref([])

/** 当前选中的存储 id */
const active = ref('')

/** 右侧页面：home 主页 / form 配置 / settings 存储位置 */
const page = ref('home')

/** 正在编辑的 id；空串表示新建 */
const editId = ref('')

/** Naive 表单实例，用来校验和清错误 */
const formRef = ref(null)

/** 配置页里正在填的内容 */
const draft = reactive(emptyItem('', ''))

/** stores.json 的完整路径 */
const filePath = ref('')

/** settings.json 的完整路径，只记目录选择 */
const pointer = ref('')

/** 是否用了用户自己选的目录 */
const custom = ref(false)

/** 读写磁盘失败时的提示 */
const diskError = ref('')

/** 配置页标题随新建 / 编辑切换 */
const title = computed(() => (editId.value ? '编辑 OSS' : '添加 OSS'))

/** 右键菜单是否打开 */
const menuShow = ref(false)

/** 右键菜单的横坐标 */
const menuX = ref(0)

/** 右键菜单的纵坐标 */
const menuY = ref(0)

/** 右键点中的存储 id */
const menuId = ref('')

/** 右键菜单项，带上名称避免删错 */
const menuOptions = computed(() => {
  /** 点中的那条 */
  const item = stores.value.find((row) => row.id === menuId.value)
  return [{ label: item ? `删除 ${item.name}` : '删除', key: 'drop' }]
})

/** 当前选中的那条配置 */
const current = computed(() => stores.value.find((item) => item.id === active.value) || null)

/** 查找框里的文件名，空着就只列当前目录 */
const keyword = ref('')

/** 正在列的目录，空就是桶根；不会超出这条配置的默认目录 */
const place = ref('')

/** 查找进行中 */
const finding = ref(false)

/** 查找失败的文案 */
const findError = ref('')

/** 当前列出的目录和文件 */
const hits = ref([])

/** 结果被截断了 */
const truncated = ref(false)

/** 已经进入默认目录的子目录，才显示返回上层 */
const deeper = computed(() => {
  /** 这条配置的默认目录 */
  const root = current.value?.prefix || ''
  return !!place.value && place.value !== root && !String(keyword.value || '').trim()
})

/** 查找范围说明 */
const whereText = computed(() => {
  /** 默认目录，空显示成桶根 */
  const root = current.value?.prefix || '桶根'

  // 填了关键字就固定在默认目录下找，不跟着点进去的子目录走
  if (String(keyword.value || '').trim()) {
    return `在 ${root} 里按名字找`
  }

  return place.value || '桶根'
})

/** 连上阿里云的最低门槛，再加我们自己的名称 */
const rules = {
  name: {
    required: true,
    message: '请填名称',
    trigger: ['blur']
  },
  accessKeyId: {
    required: true,
    message: '请填 AccessKey ID',
    trigger: ['blur']
  },
  accessKeySecret: {
    required: true,
    message: '请填 AccessKey Secret',
    trigger: ['blur']
  },
  bucket: {
    required: true,
    message: '请填 Bucket',
    trigger: ['blur']
  },
  region: {
    trigger: ['blur'],
    /** Region 和 Endpoint 二选一，两个都空就连不上 */
    validator(_rule, value) {
      // 任一有值即可
      if (String(value || '').trim() || String(draft.endpoint || '').trim()) {
        return true
      }

      return new Error('Region 和 Endpoint 至少填一个')
    }
  }
}

/** 造一条空配置，给列表初始值和表单重置用 */
function emptyItem(id, name) {
  return {
    /** 列表项唯一标记 */
    id,
    /** 左侧圆点上显示的短名 */
    name,
    /** 阿里云 AccessKey ID */
    accessKeyId: '',
    /** 阿里云 AccessKey Secret */
    accessKeySecret: '',
    /** 地域代号，如 oss-cn-hangzhou */
    region: '',
    /** 自定义访问域名，有它就可以不填 Region */
    endpoint: '',
    /** 打开文件列表时的起始目录，空就是桶根 */
    prefix: '',
    /** 桶名 */
    bucket: ''
  }
}

/** 圆点上只取名称第一个字 */
function mark(name) {
  return String(name || '?').slice(0, 1)
}

/** 把 draft 清成空白，避免上次填的残留 */
function reset() {
  Object.assign(draft, emptyItem('', ''))
}

/** 切到配置页后再清校验，避免旧红字贴上来 */
function clearValid() {
  nextTick(() => {
    formRef.value?.restoreValidation()
  })
}

/** 字节数收成短一点的显示 */
function formatSize(size) {
  /** 原始字节 */
  const n = Number(size) || 0

  // 小于 1KB 直接显示字节
  if (n < 1024) {
    return `${n} B`
  }

  // 小于 1MB
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`
  }

  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** 当前目录的上一层，不能高过默认目录 */
function parentPlace(here, root) {
  /** 默认目录 */
  const head = String(root || '')
  /** 去掉尾部斜杠再找上一层 */
  const cut = String(here || '').replace(/\/$/, '')
  /** 最后一个斜杠 */
  const at = cut.lastIndexOf('/')
  /** 上一层前缀 */
  const parent = at < 0 ? '' : `${cut.slice(0, at)}/`

  // 再往上就越过默认目录了
  if (parent.length < head.length) {
    return head
  }

  return parent
}

/** 用当前配置向 OSS 查找 */
async function runFind() {
  // 没选中存储就没有配置可用
  if (!current.value) {
    return
  }

  // 浏览器预览没有预加载
  if (!window.ossApi) {
    findError.value = '请在应用窗口里查找'
    hits.value = []
    return
  }

  /** 去掉首尾空白的关键字 */
  const word = String(keyword.value || '').trim()
  finding.value = true
  findError.value = ''

  try {
    /** 主进程按 id 读配置再查，页面不把密钥再传一遍 */
    const res = await window.ossApi.find({
      id: current.value.id,
      place: place.value,
      keyword: word
    })

    // 配置不齐或 OSS 拒绝
    if (!res.ok) {
      findError.value = res.error || '查找失败'
      hits.value = []
      truncated.value = false
      return
    }

    hits.value = res.items || []
    truncated.value = !!res.truncated

    // 列目录时用服务端确认过的前缀，避免页面和桶对不齐
    if (!word) {
      place.value = res.place || ''
    }
  } catch (err) {
    findError.value = err && err.message ? err.message : '查找失败'
    hits.value = []
  } finally {
    finding.value = false
  }
}

/** 点目录就进去列一层；文件只展示，不打开 */
function openHit(item) {
  // 文件没有下一层
  if (!item || item.type !== 'folder') {
    return
  }

  place.value = item.key
  keyword.value = ''
  runFind()
}

/** 从子目录回到上一层 */
function up() {
  place.value = parentPlace(place.value, current.value?.prefix || '')
  keyword.value = ''
  runFind()
}

/** 右键圆点：在指针处弹出删除 */
function openMenu(event, id) {
  menuId.value = id
  menuX.value = event.clientX
  menuY.value = event.clientY
  // 先关掉再开，否则第二次右键位置不更新
  menuShow.value = false
  nextTick(() => {
    menuShow.value = true
  })
}

/** 点了菜单里的删除 */
function onMenu(key) {
  menuShow.value = false

  // 目前只有删除一项
  if (key === 'drop') {
    dropStore(menuId.value)
  }
}

/** 从列表和磁盘去掉这条配置，不删桶里的文件 */
async function dropStore(id) {
  /** 删掉之后剩下的 */
  const list = stores.value.filter((item) => item.id !== id)
  /** 删的是当前项就改选旁边那条 */
  const nextActive = active.value === id ? list[0]?.id || '' : active.value

  try {
    /** 没写进磁盘就不要改页面上的选中项 */
    const wrote = await writeDisk(nextActive, list)

    // 浏览器预览写不了，writeDisk 自己会提示
    if (!wrote) {
      return
    }
  } catch (err) {
    diskError.value = err && err.message ? err.message : '删除失败'
    return
  }

  // 正在编辑被删的那条，回到主页，避免把已删配置又存回去
  if (page.value === 'form' && editId.value === id) {
    page.value = 'home'
  }

  keyword.value = ''
  hits.value = []
  truncated.value = false
  findError.value = ''

  // 还有别的配置就列它的默认目录
  if (current.value) {
    place.value = current.value.prefix || ''
    runFind()
    return
  }

  place.value = ''
}

/** 点左侧圆点：切存储，并离开配置页或设置页 */
function pick(id) {
  active.value = id
  // 未保存的草稿丢掉，避免串到另一个存储上
  page.value = 'home'
  diskError.value = ''
  keyword.value = ''
  /** 切过去的那条配置 */
  const item = stores.value.find((row) => row.id === id)
  place.value = item?.prefix || ''
  runFind()
}

/** 点加号：右侧换成空白配置页 */
function openAdd() {
  editId.value = ''
  reset()
  page.value = 'form'
  diskError.value = ''
  clearValid()
}

/** 点编辑：右侧换成当前存储的配置页 */
function openEdit() {
  // 没选中就别开，避免空对象写入
  if (!current.value) {
    return
  }

  editId.value = current.value.id
  Object.assign(draft, { ...current.value })
  page.value = 'form'
  diskError.value = ''
  clearValid()
}

/** 点齿轮：右侧换成存储位置 */
function openSettings() {
  page.value = 'settings'
  diskError.value = ''
}

/** 返回主页，不改列表 */
function close() {
  page.value = 'home'
  diskError.value = ''
}

/** 把主进程回传的路径和列表灌进页面 */
function applyAll(data) {
  /** 解过密的列表 */
  const list = Array.isArray(data.stores) ? data.stores : []
  stores.value = list
  // 选中项丢了就落到第一条，避免高亮空 id
  active.value = list.some((item) => item.id === data.active) ? data.active : list[0]?.id || ''
  filePath.value = data.file || ''
  pointer.value = data.pointer || ''
  custom.value = !!data.custom
}

/** 只更新路径，列表保持页面上这份 */
function applyPath(data) {
  filePath.value = data.file || ''
  pointer.value = data.pointer || ''
  custom.value = !!data.custom
}

/** 把当前列表写到现在指向的目录 */
async function writeDisk(nextActive, list) {
  // 浏览器预览没有预加载，只能停在内存里
  if (!window.configApi) {
    stores.value = list
    active.value = nextActive
    diskError.value = '浏览器预览写不了磁盘，请用应用窗口'
    return false
  }

  applyAll(await window.configApi.save({ active: nextActive, stores: list }))
  return true
}

/** 目标目录没文件时，把当前列表写过去；已有文件就改用那份 */
async function takeOver(data) {
  applyPath(data)

  // 那边已经有配置，不能用内存里的盖掉
  if (data.stores && data.stores.length) {
    applyAll(data)
    return
  }

  await writeDisk(active.value, stores.value)
}

/** 选择配置存放目录 */
async function chooseDir() {
  // 目录框只有应用窗口能弹
  if (!window.configApi) {
    diskError.value = '请在应用窗口里选目录'
    return
  }

  diskError.value = ''

  try {
    /** 用户选完后的状态；取消时只有 canceled */
    const picked = await window.configApi.pickDir()

    // 取消就留在当前目录
    if (!picked || picked.canceled) {
      return
    }

    await takeOver(picked)
  } catch (err) {
    diskError.value = err && err.message ? err.message : '选择目录失败'
  }
}

/** 回到 userData，规则和选择目录一样 */
async function useDefault() {
  // 已经是默认目录就不用再写一次指针
  if (!custom.value) {
    return
  }

  // 浏览器预览没有这条接口
  if (!window.configApi) {
    diskError.value = '请在应用窗口里操作'
    return
  }

  diskError.value = ''

  try {
    await takeOver(await window.configApi.resetDir())
  } catch (err) {
    diskError.value = err && err.message ? err.message : '恢复默认失败'
  }
}

/** 当前表单里要带走的字段，不含本机 id */
function draftBody() {
  return {
    name: draft.name,
    accessKeyId: draft.accessKeyId,
    accessKeySecret: draft.accessKeySecret,
    region: draft.region,
    endpoint: draft.endpoint,
    bucket: draft.bucket,
    prefix: draft.prefix
  }
}

/** 把当前表单导出成 json，给别的客户端导入 */
async function exportConfig() {
  // 浏览器预览没有保存框
  if (!window.configApi || !window.configApi.export) {
    diskError.value = '请在应用窗口里导出'
    return
  }

  diskError.value = ''

  try {
    /** 取消时没有 error */
    const res = await window.configApi.export(draftBody())

    // 选错或写失败才提示
    if (!res.canceled && !res.ok) {
      diskError.value = res.error || '导出失败'
    }
  } catch (err) {
    diskError.value = err && err.message ? err.message : '导出失败'
  }
}

/** 选一份导出的 json，填进当前表单，不直接落盘 */
async function importConfig() {
  // 浏览器预览没有打开框
  if (!window.configApi || !window.configApi.import) {
    diskError.value = '请在应用窗口里导入'
    return
  }

  diskError.value = ''

  try {
    /** 文件里的配置 */
    const res = await window.configApi.import()

    // 用户取消
    if (res.canceled) {
      return
    }

    // 文件不是我们导出的
    if (!res.ok || !res.config) {
      diskError.value = res.error || '导入失败'
      return
    }

    draft.name = res.config.name
    draft.accessKeyId = res.config.accessKeyId
    draft.accessKeySecret = res.config.accessKeySecret
    draft.region = res.config.region
    draft.endpoint = res.config.endpoint
    draft.bucket = res.config.bucket
    draft.prefix = res.config.prefix
    clearValid()
  } catch (err) {
    diskError.value = err && err.message ? err.message : '导入失败'
  }
}

/** 保存：校验后先落盘，成功再回到主页 */
async function save() {
  try {
    await formRef.value?.validate()
  } catch {
    // 校验没过就留在配置页改
    return
  }

  /** 名称去掉首尾空格再入库 */
  const name = String(draft.name || '').trim()
  /** 新建用时间戳，编辑沿用原 id */
  const id = editId.value || String(Date.now())
  /** 这一条的最终内容 */
  const next = { ...draft, id, name }
  /** 写盘用的完整列表 */
  let list = stores.value

  // 编辑已有项就替换，找不到就追加
  if (editId.value) {
    /** 列表里正在改的那条 */
    const hit = stores.value.find((item) => item.id === editId.value)

    // 还在列表里就覆盖，避免新增一条重复的
    if (hit) {
      list = stores.value.map((item) => (item.id === editId.value ? next : item))
    } else {
      list = [...stores.value, next]
    }
  } else {
    list = [...stores.value, next]
  }

  diskError.value = ''

  try {
    /** 落盘是否成功；浏览器预览会失败并留在本页 */
    const wrote = await writeDisk(id, list)

    // 没写进磁盘就别装成已经保存
    if (!wrote) {
      return
    }

    /** 刚写入的这条，前缀已经被整理过 */
    const saved = stores.value.find((item) => item.id === id)

    // 填了默认目录，桶里没有就建
    if (saved && saved.prefix) {
      // 建目录只能在应用窗口里做
      if (!window.ossApi) {
        diskError.value = '配置已保存，请在应用窗口里创建目录'
        return
      }

      /** 桶里是否已经有这个目录 */
      const made = await window.ossApi.ensure({ id })

      // 配置在了，目录没建成，留在这一页看错误
      if (!made.ok) {
        diskError.value = made.error || '创建目录失败'
        return
      }
    }
  } catch (err) {
    diskError.value = err && err.message ? err.message : '写入失败'
    return
  }

  close()
  keyword.value = ''
  place.value = current.value?.prefix || ''
  runFind()
}

// 窗口起来就读盘，浏览器预览没有接口就保持空列表
onMounted(async () => {
  // 预览页没有预加载
  if (!window.configApi) {
    return
  }

  try {
    applyAll(await window.configApi.load())
    place.value = current.value?.prefix || ''
    runFind()
  } catch (err) {
    diskError.value = err && err.message ? err.message : '读取配置失败'
  }
})
</script>

<style scoped>
.shell {
  display: flex;
  flex: 1;
  height: 100%;
  min-height: 0;
}

.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  flex-shrink: 0;
  padding: 12px 10px;
}

.pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  border-radius: 999px;
  background: var(--rail);
  box-shadow: 0 0 0 1px var(--line);
}

.dot,
.plus {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  line-height: 36px;
  padding: 0;
}

.dot {
  color: var(--text);
  background: var(--dot);
}

.dot.on {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.plus {
  color: #fff;
  font-size: 22px;
  background: var(--plus);
}

.gear {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  padding: 0;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--text);
  background: var(--dot);
}

.gear.on {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.stage {
  flex: 1;
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 18px 28px 16px;
  border-left: 1px solid var(--line);
}

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}

.hint.block {
  margin-bottom: 18px;
  line-height: 1.6;
}

.path {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--input);
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}

.err {
  margin: 12px 0 0;
  color: var(--danger);
  font-size: 13px;
}

.head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.head strong {
  font-size: 18px;
}

.head span {
  color: var(--muted);
  font-size: 13px;
}

.head :deep(.n-button) {
  margin-left: auto;
}

.home {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.find-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.find-row :deep(.n-input) {
  flex: 1;
}

.where {
  margin-top: 10px;
}

.hits {
  flex: 1;
  min-height: 0;
  margin-top: 8px;
  overflow: auto;
}

.hit {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: 0 0 4px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.hit:hover {
  background: var(--dot);
}

.hit.file {
  cursor: default;
}

.hit-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hit-size {
  color: var(--muted);
  font-size: 12px;
}

.form-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.form-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}

.form-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
}

.back {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 18px;
}

.back:hover {
  background: var(--dot);
}

.form {
  flex: 1;
  min-height: 0;
  overflow: auto;
  max-width: 720px;
}

.form-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
}

.foot-side {
  display: flex;
  gap: 8px;
}

.settings {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.set-block h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 650;
}

.path-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-row .path {
  flex: 1;
  min-width: 0;
  margin: 0;
}

.path-note {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}
</style>
