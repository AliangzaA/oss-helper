<template>
  <n-config-provider
    :theme="theme"
    :theme-overrides="overrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <n-message-provider>
      <div class="shell">
        <!-- 左侧：存储切换 + 底部加号 -->
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
            >
              {{ mark(item.name) }}
            </button>
            <button class="plus" type="button" title="添加 OSS" @click="openAdd">
              +
            </button>
          </div>
        </aside>

        <!-- 右侧：主页和配置页在这里切换，占满剩余区域 -->
        <main class="stage">
          <!-- 配置页：加号和编辑都走这里，不再弹窗 -->
          <section v-if="editing" class="form-page">
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
            </n-form>

            <footer class="form-foot">
              <n-button type="primary" @click="save">保存</n-button>
            </footer>
          </section>

          <!-- 主页：还没配任何存储 -->
          <p v-else-if="!current" class="hint">点左下角 + 添加 OSS</p>
          <!-- 主页：已选中，只露名字 -->
          <header v-else class="head">
            <strong>{{ current.name }}</strong>
            <span>{{ current.bucket || '未填 Bucket' }}</span>
            <n-button text type="primary" @click="openEdit">编辑</n-button>
          </header>
        </main>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
/** Naive 中文包，按钮占位符等走中文 */
import { dateZhCN, zhCN } from 'naive-ui'
import { overrides, theme } from './theme'

/** 已保存的存储列表，先放两条方便看切换 */
const stores = ref([
  emptyItem('1', '生产'),
  emptyItem('2', '测试')
])

/** 当前选中的存储 id */
const active = ref('1')

/** 右侧是否停在配置页 */
const editing = ref(false)

/** 正在编辑的 id；空串表示新建 */
const editId = ref('')

/** Naive 表单实例，用来校验和清错误 */
const formRef = ref(null)

/** 配置页里正在填的内容 */
const draft = reactive(emptyItem('', ''))

/** 配置页标题随新建 / 编辑切换 */
const title = computed(() => (editId.value ? '编辑 OSS' : '添加 OSS'))

/** 当前选中的那条配置 */
const current = computed(() => stores.value.find((item) => item.id === active.value) || null)

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

/** 点左侧圆点：切存储，并离开配置页 */
function pick(id) {
  active.value = id
  // 未保存的草稿丢掉，避免串到另一个存储上
  editing.value = false
}

/** 点加号：右侧换成空白配置页 */
function openAdd() {
  editId.value = ''
  reset()
  editing.value = true
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
  editing.value = true
  clearValid()
}

/** 返回主页，不改列表 */
function close() {
  editing.value = false
}

/** 保存：新建追加并选中，编辑则覆盖原项，然后回到主页 */
async function save() {
  try {
    await formRef.value?.validate()
  } catch {
    // 校验没过就留在配置页改
    return
  }

  /** 名称去掉首尾空格再入库 */
  const name = String(draft.name || '').trim()
  draft.name = name

  // 编辑已有项
  if (editId.value) {
    /** 列表里正在改的那条 */
    const hit = stores.value.find((item) => item.id === editId.value)

    // 列表被删光了就当新建，避免空引用
    if (hit) {
      Object.assign(hit, { ...draft, id: editId.value, name })
      close()
      return
    }
  }

  /** 新存储 id，用时间戳够这次演示 */
  const id = String(Date.now())
  stores.value.push({ ...draft, id, name })
  active.value = id
  close()
}
</script>

<style scoped>
.shell {
  display: flex;
  height: 100%;
}

.rail {
  display: flex;
  align-items: flex-start;
  padding: 12px 10px;
}

.pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: flex-start;
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

.stage {
  flex: 1;
  min-width: 0;
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
  justify-content: flex-end;
  padding-top: 12px;
}
</style>
