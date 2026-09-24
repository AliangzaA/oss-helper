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
          <!-- 最下方操作区：检查更新与应用设置 -->
          <div class="rail-bottom">
            <!-- 检查更新按钮 -->
            <div class="down-wrap">
              <button
                class="down-btn"
                :class="{ on: showUpdateCard, spinning: checkingUpdate }"
                type="button"
                :title="hasUpdate ? '发现新版本，点击查看' : '检查更新'"
                @click="onDownloadClick"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 16l4-5h-3V4h-2v7H8l4 5zm-8 2h16v2H4v-2z"
                  />
                </svg>
                <!-- 有新版本时的红点 -->
                <span v-if="hasUpdate" class="red-dot" aria-label="有新版本" />
              </button>

              <!-- 无更新时的轻量气泡提示 -->
              <transition name="fade">
                <div v-if="updateTip" class="update-tip">
                  {{ updateTip }}
                </div>
              </transition>
            </div>

            <!-- 最下方设置应用的 -->
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
          </div>
        </aside>

        <!-- 类似编译器风格的左侧更新提示弹窗卡片 -->
        <transition name="pop-slide">
          <div
            v-if="showUpdateCard && updateInfo"
            class="update-card"
            role="dialog"
            aria-label="版本更新提示"
          >
            <div class="card-head">
              <div class="card-title">
                <span class="card-badge">NEW</span>
                <strong>发现新版本 {{ updateInfo.version }}</strong>
              </div>
              <button class="card-close" type="button" title="关闭" @click="showUpdateCard = false">×</button>
            </div>
            <div class="card-body">
              <p class="card-sub">当前运行版本：v{{ currentAppVersion }}</p>
              <div v-if="updateInfo.body" class="card-notes">
                <div class="notes-title">更新说明：</div>
                <div class="notes-content">{{ updateInfo.body }}</div>
              </div>
              <p v-else class="card-hint">发现新版本发布，是否立即前往下载？</p>
            </div>
            <div class="card-foot">
              <button class="btn-cancel" type="button" @click="showUpdateCard = false">暂不</button>
              <button class="btn-update" type="button" @click="onGoUpdate">立即更新</button>
            </div>
          </div>
        </transition>

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

        <!-- 文件列表右键快捷操作 -->
        <n-dropdown
          trigger="manual"
          placement="bottom-start"
          :show="hitMenuShow"
          :x="hitMenuX"
          :y="hitMenuY"
          :options="hitMenuOptions"
          @select="onHitMenu"
          @clickoutside="hitMenuShow = false"
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
              <n-form-item label="自定义域名（可选）" path="domain">
                <n-input v-model:value="draft.domain" placeholder="dlyepaiapp.com，APK 下载用这个" />
              </n-form-item>
              <n-form-item label="Logo 目录（可选）" path="logoDir">
                <n-input v-model:value="draft.logoDir" placeholder="apk/logo/，也可只填 logo（相对默认目录）" />
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
            <nav v-if="!String(keyword || '').trim()" class="crumbs" aria-label="当前目录">
              <template v-for="(item, i) in crumbs" :key="item.key || 'root'">
                <span v-if="i" class="crumb-sep">/</span>
                <button
                  v-if="i < crumbs.length - 1"
                  class="crumb"
                  type="button"
                  @click="goPlace(item.key)"
                >
                  {{ item.name }}
                </button>
                <span v-else class="crumb now">{{ item.name }}</span>
              </template>
            </nav>
            <p v-else class="hint where">{{ whereText }}</p>
            <div class="act-row">
              <n-button :disabled="working" @click="askUpload">上传</n-button>
              <n-button :disabled="working" @click="askMkdir">新建文件夹</n-button>
              <n-button :disabled="working" @click="askCreateConfig">+ 配置文件</n-button>
              <n-button :disabled="working || pickedItems.length !== 1" @click="askRename">改名</n-button>
              <n-button :disabled="working || !pickedItems.length" @click="askRemove">删除</n-button>
              <span class="hint">已选 {{ pickedItems.length }}</span>
            </div>
            <p v-if="findError" class="err">{{ findError }}</p>
            <p v-else-if="truncated" class="hint where">结果太多，只显示了一部分</p>
            <svg class="ico-src" aria-hidden="true">
              <symbol id="ico-folder" viewBox="0 0 24 24">
                <path fill="currentColor" d="M3.5 7.2A2.2 2.2 0 0 1 5.7 5h3.2l1.6 1.8h7.8a2.2 2.2 0 0 1 2.2 2.2v8.3a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V7.2z" />
              </symbol>
              <symbol id="ico-file" viewBox="0 0 24 24">
                <path fill="currentColor" d="M7 3.5h6.2L19 9.2V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7.5 3.5H7zm6 .8V9h4.6" />
              </symbol>
              <symbol id="ico-image" viewBox="0 0 24 24">
                <path fill="currentColor" d="M5 5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-13zm2.2 9.2 2.3-2.6 1.8 1.8 2.6-3.2 3 4H7.2zM9 9.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z" />
              </symbol>
              <symbol id="ico-video" viewBox="0 0 24 24">
                <path fill="currentColor" d="M4 7.5A1.5 1.5 0 0 1 5.5 6h8A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16.5v-9zm11 1.8 4-2.3v9.9l-4-2.2V9.3z" />
              </symbol>
              <symbol id="ico-audio" viewBox="0 0 24 24">
                <path fill="currentColor" d="M9 5.5v9.2a2.6 2.6 0 1 1-1.6-2.4V8.2l8-1.6v6.5a2.6 2.6 0 1 1-1.6-2.4V5.5L9 7v-1.5z" />
              </symbol>
              <symbol id="ico-archive" viewBox="0 0 24 24">
                <path fill="currentColor" d="M6 4.5h12A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5zm5 1.2h2v1.6h-2V5.7zm0 3h2v1.6h-2V8.7zm0 3H13v4.2h-2v-4.2z" />
              </symbol>
              <symbol id="ico-apk" viewBox="0 0 24 24">
                <path fill="currentColor" d="M8.2 8.2 6.4 6.4l1.1-1.1 1.9 1.9a6 6 0 0 1 5.2 0l1.9-1.9 1.1 1.1-1.8 1.8A6 6 0 0 1 18 12.5V17a2 2 0 0 1-2 2h-1v-4H9v4H8a2 2 0 0 1-2-2v-4.5a6 6 0 0 1 2.2-4.3zM9.5 12.2a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
              </symbol>
              <symbol id="ico-config" viewBox="0 0 24 24">
                <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.44.17-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
              </symbol>
            </svg>
            <div
              class="hits"
              :class="{ 'is-drag': listDrag }"
              @dragenter="onListDragEnter"
              @dragover="onListDragOver"
              @dragleave="onListDragLeave"
              @drop="onListDrop"
            >
              <div v-if="listDrag" class="hits-drag">松开以上传（支持文件夹）</div>
              <p v-if="finding" class="hint">正在查找…</p>
              <p v-else-if="!findError && !hits.length" class="hint">没有结果，也可把文件或文件夹拖到这里上传</p>
              <template v-else>
                <div class="hit hit-head">
                  <input class="tick" type="checkbox" :checked="allPicked" @click.prevent="toggleAll" />
                  <span>文件名</span>
                  <span>文件大小</span>
                  <span>存储类型</span>
                  <span>更新时间</span>
                  <span>操作</span>
                </div>
                <div
                  v-for="item in hits"
                  :key="item.key"
                  class="hit"
                  :class="{ on: isPicked(item) }"
                  @contextmenu.prevent="openHitMenu($event, item)"
                >
                  <input
                    class="tick"
                    type="checkbox"
                    :checked="isPicked(item)"
                    @click.stop="togglePick(item)"
                  />
                  <button
                    class="hit-file"
                    :class="{ folder: item.type === 'folder', 'config-file': kindOf(item) === 'config' }"
                    type="button"
                    @click="onHit(item)"
                  >
                    <svg class="ico" :class="`ico-${kindOf(item)}`" aria-hidden="true">
                      <use :href="`#ico-${kindOf(item)}`" />
                    </svg>
                    <span class="hit-name">{{ item.name }}</span>
                    <span v-if="kindOf(item) === 'config'" class="config-tag">配置文件</span>
                  </button>
                  <span class="hit-cell">{{ showSize(item) }}</span>
                  <span class="hit-cell">{{ showStorage(item) }}</span>
                  <span class="hit-cell">{{ formatTime(item.time) }}</span>
                  <span class="hit-ops">
                    <button
                      v-if="kindOf(item) === 'config'"
                      class="hit-act config-act"
                      type="button"
                      :disabled="working"
                      @click="openConfigModal(item)"
                    >
                      配置
                    </button>
                    <button class="hit-act" type="button" :disabled="working" @click="askRenameOne(item)">改名</button>
                    <button
                      v-if="item.type === 'file'"
                      class="hit-act"
                      type="button"
                      :disabled="working"
                      @click="askCode(item)"
                    >
                      二维码
                    </button>
                    <button class="hit-act danger" type="button" :disabled="working" @click="askRemoveOne(item)">删除</button>
                  </span>
                </div>
              </template>
            </div>
          </section>
          <p v-if="page === 'home' && diskError" class="err">{{ diskError }}</p>
        </main>
      </div>

      <!-- 新建文件夹和改名共用 -->
      <n-modal v-model:show="nameShow" preset="card" :title="nameTitle" style="width: 380px">
        <n-input v-model:value="nameDraft" placeholder="名称" @keyup.enter="submitName" />
        <template #footer>
          <n-space justify="end">
            <n-button @click="nameShow = false">取消</n-button>
            <n-button type="primary" :loading="working" @click="submitName">确定</n-button>
          </n-space>
        </template>
      </n-modal>

      <!-- 先看列表，点上传才开始传，进度留在每一行 -->
      <n-modal
        :show="upShow"
        preset="card"
        title="上传"
        style="width: 460px"
        :mask-closable="!working"
        :close-on-esc="!working"
        :closable="!working"
        @update:show="onUpShow"
      >
        <div class="up-head">
          <p class="hint">上传到 {{ showPlace(place) }}</p>
          <n-space :size="8">
            <n-button size="small" :disabled="working || upDone" @click="addUploads">添加文件</n-button>
            <n-button size="small" :disabled="working || upDone" @click="addFolders">添加文件夹</n-button>
          </n-space>
        </div>
        <p v-if="upError" class="err">{{ upError }}</p>
        <p v-else-if="!upFiles.length" class="up-empty">还没有文件，可添加文件 / 文件夹，或从列表拖入</p>
        <div v-else class="up-list">
          <div v-for="file in upFiles" :key="file.id" class="up-row">
            <svg class="ico" :class="`ico-${kindOf({ type: 'file', name: file.name })}`" aria-hidden="true">
              <use :href="`#ico-${kindOf({ type: 'file', name: file.name })}`" />
            </svg>
            <div class="up-main">
              <span class="up-name">{{ file.name }}</span>
              <span class="up-size">{{ formatSize(file.size) }}</span>
              <button class="up-drop" type="button" :disabled="working || upDone" @click="dropUpload(file)">移除</button>
              <n-progress
                v-if="working || upDone || file.percent > 0"
                class="up-bar"
                type="line"
                :percentage="file.percent"
                :height="6"
                :status="file.percent >= 100 ? 'success' : 'default'"
              />
              <p v-if="file.error" class="up-err">{{ file.error }}</p>
            </div>
          </div>
        </div>
        <template #footer>
          <n-space justify="end">
            <n-button v-if="!upDone" :disabled="working" @click="closeUpload">取消</n-button>
            <n-button type="primary" :loading="working" :disabled="!upDone && !upFiles.length" @click="confirmUpload">
              {{ upDone ? '完成' : '上传' }}
            </n-button>
          </n-space>
        </template>
      </n-modal>

      <!-- 文件公开地址和二维码，外网域名或自定义域名二选一 -->
      <n-modal v-model:show="codeShow" preset="card" title="二维码" style="width: 460px">
        <n-radio-group v-model:value="codeKind" class="code-kind" name="codeKind">
          <n-radio v-if="isApkItem" value="smart">智能分流(国内直下/海外跳商店)</n-radio>
          <n-radio value="custom">自定义域名直链</n-radio>
          <n-radio value="oss">外网域名直链</n-radio>
        </n-radio-group>
        <p v-if="codeHint" class="err">{{ codeHint }}</p>
        <p v-else-if="codeNote" class="hint where">{{ codeNote }}</p>
        <p v-if="codeLogoErr" class="err">{{ codeLogoErr }}</p>
        <div v-else-if="codeLogos.length" class="logo-pick">
          <p class="hint">中间 Logo</p>
          <div class="logo-list">
            <button class="logo-item" :class="{ on: !codeLogo }" type="button" @click="codeLogo = ''">无</button>
            <button
              v-for="logo in codeLogos"
              :key="logo.name"
              class="logo-item"
              :class="{ on: codeLogo === logo.name }"
              :title="logo.name"
              type="button"
              @click="codeLogo = logo.name"
            >
              <img :src="logo.src" :alt="logo.name" />
            </button>
          </div>
        </div>
        <p v-else-if="current && current.logoDir" class="hint where">这个目录里没有 png / jpg / webp 图片</p>
        <p v-else class="hint where">要在二维码中间放 Logo，先在 OSS 配置里填桶中的 Logo 目录</p>
        <img v-if="codeSrc" class="code-img" :src="codeSrc" alt="二维码" />
        <template #footer>
          <n-space justify="end">
            <n-button :disabled="!codeUrl" @click="copyCode">{{ codeCopied ? '已复制' : '复制链接' }}</n-button>
            <n-button :disabled="!codeSrc" :loading="codeSaving" @click="saveCode">
              {{ codeSaved ? '已保存' : '下载二维码' }}
            </n-button>
            <n-button type="primary" @click="codeShow = false">关闭</n-button>
          </n-space>
        </template>
      </n-modal>

      <!-- 删除前确认，文件夹会连带里面的文件 -->
      <n-modal v-model:show="dropShow" preset="card" title="删除" style="width: 380px">
        <p class="hint">删除选中的 {{ pickedItems.length }} 项。文件夹会连同里面的文件一起删，不能恢复。</p>
        <template #footer>
          <n-space justify="end">
            <n-button @click="dropShow = false">取消</n-button>
            <n-button type="primary" :loading="working" @click="removePicked">删除</n-button>
          </n-space>
        </template>
      </n-modal>

      <!-- 应用分发配置表单弹窗 -->
      <n-modal
        v-model:show="configShow"
        preset="card"
        title="应用分发配置 (config.json)"
        style="width: 520px"
      >
        <n-space vertical size="medium">
          <div class="config-modal-header">
            <span class="hint" style="font-size: 13px;">配置当前应用商店跳转地址与 APK 安装包</span>
            <n-radio-group v-model:value="configMode" size="small">
              <n-radio-button value="form">表单模式</n-radio-button>
              <n-radio-button value="raw">JSON 源码</n-radio-button>
            </n-radio-group>
          </div>

          <!-- 可视化表单模式 -->
          <template v-if="configMode === 'form'">
            <n-form label-placement="left" label-width="110">
              <n-form-item label="应用名称">
                <n-input v-model:value="configDraft.name" placeholder="例如：大湃" clearable />
              </n-form-item>
              <n-form-item label="苹果商店链接">
                <n-input v-model:value="configDraft.appleUrl" placeholder="https://apps.apple.com/..." clearable />
              </n-form-item>
              <n-form-item label="谷歌商店链接">
                <n-input v-model:value="configDraft.googleUrl" placeholder="https://play.google.com/store/apps/details?id=..." clearable />
              </n-form-item>
              <n-form-item label="默认 APK (可选)">
                <n-auto-complete
                  v-model:value="configDraft.apk"
                  :options="apkOptions"
                  placeholder="留空即可；直接点击任意 APK 的二维码更灵活"
                  clearable
                />
              </n-form-item>
            </n-form>
            <p class="hint" style="font-size: 12px; margin-top: -8px;">
              💡 推荐直接点击对应 APK 的「二维码」，系统会自动绑定本配置并直下该文件。此处可留空。
            </p>
          </template>

          <!-- 源码编辑模式 -->
          <template v-else>
            <n-input
              v-model:value="configRawText"
              type="textarea"
              :autosize="{ minRows: 8, maxRows: 14 }"
              placeholder="标准 JSON 格式代码"
              style="font-family: monospace; font-size: 13px;"
            />
          </template>

          <p v-if="configError" class="err">{{ configError }}</p>
        </n-space>

        <template #footer>
          <n-space justify="end">
            <n-button :disabled="configSaving" @click="configShow = false">取消</n-button>
            <n-button type="primary" :loading="configSaving" @click="submitConfigModal">保存到 OSS</n-button>
          </n-space>
        </template>
      </n-modal>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
/** 把文件 URL 画成二维码 */
import QRCode from 'qrcode'
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

/** 是否有新版本可用 */
const hasUpdate = ref(false)

/** 是否显示左下角更新提示弹窗 */
const showUpdateCard = ref(false)

/** 新版本详情数据 */
const updateInfo = ref(null)

/** 当前本地运行的应用版本 */
const currentAppVersion = ref('1.0.0')

/** 正在检查更新的加载中状态 */
const checkingUpdate = ref(false)

/** 无更新或检测结果的气泡提示文字 */
const updateTip = ref('')

/** 气泡提示自动隐藏计时器 */
let updateTipTimer = null

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

/** 文件列表右键菜单是否打开 */
const hitMenuShow = ref(false)

/** 文件列表右键菜单位置 */
const hitMenuX = ref(0)
const hitMenuY = ref(0)

/** 右键点中的文件/文件夹 */
const hitMenuItem = ref(null)

/** 文件列表右键菜单项 */
const hitMenuOptions = computed(() => {
  /** 当前右键的那一项 */
  const item = hitMenuItem.value
  // 没有点中就不显示
  if (!item) {
    return []
  }

  /** 菜单条目 */
  const options = []

  // 文件夹可以打开进入
  if (item.type === 'folder') {
    options.push({ label: '打开', key: 'open' })
  }

  // config.json 快捷进编辑
  if (kindOf(item) === 'config') {
    options.push({ label: '编辑配置', key: 'config' })
  }

  options.push({ label: '改名', key: 'rename', disabled: working.value })

  // 只有文件才有公开地址二维码
  if (item.type === 'file') {
    options.push({ label: '二维码', key: 'code', disabled: working.value })
  }

  /** 多选时删除文案带数量 */
  const multi = picked.value.includes(item.key) && pickedItems.value.length > 1
  options.push({
    label: multi ? `删除选中的 ${pickedItems.value.length} 项` : '删除',
    key: 'remove',
    disabled: working.value
  })

  return options
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

/** 勾选中的对象键 */
const picked = ref([])

/** 上传、删除、改名进行中 */
const working = ref(false)

/** 新建文件夹或改名弹层 */
const nameShow = ref(false)

/** 弹层里正在填的名字 */
const nameDraft = ref('')

/** mkdir 新建文件夹，rename 改名 */
const nameKind = ref('mkdir')

/** 删除确认是否打开 */
const dropShow = ref(false)

/** 配置文件弹窗是否打开 */
const configShow = ref(false)

/** 配置文件保存中状态 */
const configSaving = ref(false)

/** 配置文件弹窗编辑模式：form 表单模式，raw 源码模式 */
const configMode = ref('form')

/** 配置文件表单数据草稿 */
const configDraft = reactive({
  name: '',
  appleUrl: '',
  googleUrl: '',
  apk: ''
})

/** 配置文件源码文本 */
const configRawText = ref('')

/** 配置文件正在编辑的 key 路径 */
const configKey = ref('')

/** 配置文件错误提示 */
const configError = ref('')

/** 当前目录下所有 APK 文件的名称列表，供下拉候选 */
const apkOptions = computed(() => {
  return hits.value
    .filter((item) => item && item.type === 'file' && String(item.name || '').toLowerCase().endsWith('.apk'))
    .map((item) => ({ label: item.name, value: item.name }))
})

/** 二维码弹窗是否打开 */
const codeShow = ref(false)

/** oss 外网域名，custom 绑定域名 */
const codeKind = ref('oss')

/** 正在生成二维码的文件 */
const codeItem = ref(null)

/** 画出来的二维码 */
const codeSrc = ref('')

/** 当前选中的 Logo 文件名，空就是不贴 */
const codeLogo = ref('')

/** Logo 目录里读到的图片 */
const codeLogos = ref([])

/** 读 Logo 失败的原因 */
const codeLogoErr = ref('')

/** 复制成功的短暂提示 */
const codeCopied = ref(false)

/** 正在弹出保存框 */
const codeSaving = ref(false)

/** 保存成功的短暂提示 */
const codeSaved = ref(false)

/** 复制提示计时 */
let copyTimer = null

/** 保存提示计时 */
let saveTimer = null

/** 上传弹窗是否打开 */
const upShow = ref(false)

/** 弹窗里待传的文件，路径不在页面上 */
const upFiles = ref([])

/** 这一批已经全部传完 */
const upDone = ref(false)

/** 上传弹窗里的错误 */
const upError = ref('')

/** 文件列表是否正被拖入本地文件 */
const listDrag = ref(false)

/** 拖入嵌套计数，避免子元素 dragleave 把高亮闪掉 */
let dragDepth = 0

/** 取消进度订阅 */
let offProgress = null

/** 结果被截断了 */
const truncated = ref(false)

/** 勾选中的条目，按当前列表过滤，避免删掉已经不在的项 */
const pickedItems = computed(() => hits.value.filter((item) => picked.value.includes(item.key)))

/** 当前页是否全选 */
const allPicked = computed(() => hits.value.length > 0 && pickedItems.value.length === hits.value.length)

/** 弹层标题 */
const nameTitle = computed(() => (nameKind.value === 'rename' ? '改名' : '新建文件夹'))

/** 已经进入默认目录的子目录，才显示返回上层 */
const deeper = computed(() => {
  /** 这条配置的默认目录 */
  const root = current.value?.prefix || ''
  return !!place.value && place.value !== root && !String(keyword.value || '').trim()
})

/** 目录前缀去掉尾斜杠再给人看，空的就是桶根 */
function showPlace(key) {
  /** 只去掉结尾那一个斜杠，中间的路径分隔留着 */
  const text = String(key || '').replace(/\/$/, '')

  // 桶根没有前缀
  if (!text) {
    return '桶根'
  }

  return text
}

/** 列表图标：文件夹，或按扩展名粗分成常见类型 */
function kindOf(item) {
  // 目录不看扩展名
  if (!item || item.type === 'folder') {
    return 'folder'
  }

  /** 文件名最后一段扩展名 */
  const name = String(item.name || '')

  // 配置文件单独标出来 (config.json)
  if (name.toLowerCase() === 'config.json') {
    return 'config'
  }

  /** 最后一个点，没有就不是扩展名 */
  const dot = name.lastIndexOf('.')
  /** 小写扩展名 */
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''

  // 图片
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return 'image'
  }

  // 视频
  if (['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext)) {
    return 'video'
  }

  // 音频
  if (['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(ext)) {
    return 'audio'
  }

  // 压缩包
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return 'archive'
  }

  // 安装包单独标出来
  if (ext === 'apk') {
    return 'apk'
  }

  return 'file'
}

/** 查找范围说明 */
const whereText = computed(() => {
  /** 默认目录，空显示成桶根 */
  const root = showPlace(current.value?.prefix || '')

  // 填了关键字就固定在默认目录下找，不跟着点进去的子目录走
  if (String(keyword.value || '').trim()) {
    return `在 ${root} 里按名字找`
  }

  return showPlace(place.value)
})

/** 当前路径拆成可点的每一层，不会高于默认目录 */
const crumbs = computed(() => {
  /** 配置里的默认目录 */
  const root = String(current.value?.prefix || '')
  /** 正在列的目录 */
  const here = String(place.value || root)
  /** 去掉尾斜杠再切 */
  const text = here.replace(/\/$/, '')
  /** 面包屑 */
  const items = []

  // 默认目录就是桶根，先放一个根
  if (!root) {
    items.push({ name: '桶根', key: '' })
  }

  // 空路径只显示根
  if (!text) {
    return items.length ? items : [{ name: '桶根', key: '' }]
  }

  /** 累加前缀，每一段都是完整 key */
  let acc = ''
  text.split('/').forEach((part) => {
    acc += `${part}/`
    items.push({ name: part, key: acc })
  })

  return items
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
    /** 公开下载用的绑定域名 */
    domain: '',
    /** 桶里放 Logo 的目录，从桶根算 */
    logoDir: '',
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

/** 文件夹没有准确大小，跟控制台一样写未统计 */
function showSize(item) {
  // 目录下面还有文件，这一层列不出来总和
  if (!item || item.type === 'folder') {
    return '未统计'
  }

  return formatSize(item.size)
}

/** OSS 存储类型的中文名 */
function showStorage(item) {
  // 目录本身没有存储类型
  if (!item || item.type === 'folder') {
    return '—'
  }

  /** SDK 给的存储类型 */
  const code = String(item.storage || '')

  // 没带就当标准存储
  if (!code || code === 'Standard') {
    return '标准存储'
  }

  // 低频
  if (code === 'IA') {
    return '低频访问'
  }

  // 归档
  if (code === 'Archive') {
    return '归档存储'
  }

  // 冷归档
  if (code === 'ColdArchive') {
    return '冷归档'
  }

  return code
}

/** 更新时间显示成本地日期时间 */
function formatTime(iso) {
  // 目录前缀通常没有时间
  if (!iso) {
    return '—'
  }

  /** 解析后的时间 */
  const date = new Date(iso)

  // 坏日期不要显示 Invalid Date
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  /** 补成两位数 */
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
    picked.value = []

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

/** 点目录名就进去列一层；点配置文件打开表单；其他文件不勾选 */
function onHit(item) {
  // 目录进入下一层
  if (item && item.type === 'folder') {
    place.value = item.key
    keyword.value = ''
    runFind()
    return
  }

  // 点击配置文件直接打开表单编辑
  if (item && kindOf(item) === 'config') {
    openConfigModal(item)
  }
}

/** 这一项是否已勾选 */
function isPicked(item) {
  return picked.value.includes(item && item.key)
}

/** 勾选或取消勾选，不进入目录 */
function togglePick(item) {
  // 空项不记
  if (!item || !item.key) {
    return
  }

  // 已选就拿掉
  if (picked.value.includes(item.key)) {
    picked.value = picked.value.filter((key) => key !== item.key)
    return
  }

  picked.value = picked.value.concat(item.key)
}

/** 表头勾选：全选或清空 */
function toggleAll() {
  // 已经全选就清空
  if (allPicked.value) {
    picked.value = []
    return
  }

  picked.value = hits.value.map((item) => item.key)
}

/** 操作结束后重新列当前目录，方便看到结果 */
async function refreshList() {
  keyword.value = ''
  await runFind()
}

/** 打开上传弹窗，先不选文件、也不开始传 */
function askUpload() {
  // 没选中存储就没有目标目录
  if (!current.value) {
    return
  }

  // 浏览器预览没有文件框
  if (!window.ossApi || !window.ossApi.pick) {
    findError.value = '请在应用窗口里上传'
    return
  }

  upFiles.value = []
  upError.value = ''
  upDone.value = false
  upShow.value = true
}

/**
 * 把主进程登记好的文件合进弹窗列表，同名只留最新
 * @param {Array<{ id: string, name: string, size: number }>} files
 */
async function mergeUpFiles(files) {
  for (const file of files || []) {
    /** 同名的旧条目，OSS 上也会被后一个盖掉 */
    const old = upFiles.value.find((item) => item.name === file.name)

    // 同名只留最新一次选择
    if (old && window.ossApi && window.ossApi.forget) {
      await window.ossApi.forget([old.id])
      upFiles.value = upFiles.value.filter((item) => item.id !== old.id)
    }

    upFiles.value = upFiles.value.concat({
      id: file.id,
      name: file.name,
      size: file.size,
      percent: 0,
      error: ''
    })
  }
}

/** dataTransfer 里是不是带着本地文件 */
function hasFileDrag(e) {
  const types = e && e.dataTransfer && e.dataTransfer.types
  // 没有 types 就当不是拖文件
  if (!types) {
    return false
  }
  return Array.from(types).includes('Files')
}

/** 文件拖进列表区 */
function onListDragEnter(e) {
  // 没选存储或正在干活时不接
  if (!current.value || working.value) {
    return
  }
  // 不是文件拖拽就别理
  if (!hasFileDrag(e)) {
    return
  }
  e.preventDefault()
  dragDepth += 1
  listDrag.value = true
}

/** 拖在列表上方移动时必须 preventDefault，否则 drop 不会触发 */
function onListDragOver(e) {
  // 不是文件拖拽就别理
  if (!hasFileDrag(e)) {
    return
  }
  e.preventDefault()
  // 提示系统这是复制/加入，不是移动走
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

/** 拖出列表区（含子元素进出） */
function onListDragLeave(e) {
  // 当前没在高亮就不用减
  if (!listDrag.value) {
    return
  }
  e.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  // 真正离开整块区域才关高亮
  if (dragDepth === 0) {
    listDrag.value = false
  }
}

/** 在文件列表松开：登记路径并弹出上传框 */
async function onListDrop(e) {
  e.preventDefault()
  dragDepth = 0
  listDrag.value = false

  // 没选存储或正在上传中途，不打断
  if (!current.value || working.value) {
    return
  }

  // 预览页没有拖拽登记接口
  if (!window.ossApi || !window.ossApi.addFiles || !window.ossApi.getPathForFile) {
    findError.value = '请在应用窗口里上传'
    return
  }

  /** 系统拖进来的 FileList */
  const fileList = e.dataTransfer && e.dataTransfer.files
  // 空放下就结束
  if (!fileList || !fileList.length) {
    return
  }

  /** 本机绝对路径，主进程才能读盘上传 */
  const paths = []
  for (let i = 0; i < fileList.length; i++) {
    /** Electron 给的真实路径 */
    const localPath = window.ossApi.getPathForFile(fileList[i])
    // 拿不到路径的（网页拖图等）跳过
    if (localPath) {
      paths.push(localPath)
    }
  }

  // 全是无效项
  if (!paths.length) {
    findError.value = '无法读取拖入文件的路径'
    return
  }

  // 弹窗已传完或没开：清空后重开；开着且未传完则往现有列表追加
  if (!upShow.value || upDone.value) {
    upFiles.value = []
    upError.value = ''
    upDone.value = false
    upShow.value = true
  }

  try {
    /** 主进程登记后的 id / 名称 / 大小 */
    const res = await window.ossApi.addFiles(paths)
    // 一个有效文件都没有（例如空文件夹）
    if (!res || !res.ok) {
      upError.value = (res && res.error) || '拖入失败'
      return
    }
    if (!(res.files || []).length) {
      upError.value = '没有可上传的文件'
      return
    }
    await mergeUpFiles(res.files)
  } catch (err) {
    upError.value = err && err.message ? err.message : '拖入文件失败'
  }
}

/** 把主进程推来的百分比写到对应那一行 */
function applyProgress(data) {
  /** 弹窗里的那一条 */
  const row = upFiles.value.find((item) => item.id === data.id)

  // 已经移除的文件不再改进度
  if (!row || !data) {
    return
  }

  row.percent = data.percent
}

/** 系统文件框多选，加进弹窗列表 */
async function addUploads() {
  // 正在传或已经传完就别再加
  if (working.value || upDone.value || !window.ossApi || !window.ossApi.pick) {
    return
  }

  upError.value = ''

  try {
    /** 只有名字和大小，路径留在主进程 */
    const res = await window.ossApi.pick()

    // 用户取消选择
    if (!res || res.canceled) {
      return
    }

    // 超限等错误
    if (!res.ok) {
      upError.value = res.error || '选择文件失败'
      return
    }

    await mergeUpFiles(res.files || [])
  } catch (err) {
    upError.value = err && err.message ? err.message : '选择文件失败'
  }
}

/** 系统文件夹框，展开后加进弹窗列表 */
async function addFolders() {
  // 正在传或已经传完就别再加
  if (working.value || upDone.value || !window.ossApi || !window.ossApi.pickFolder) {
    return
  }

  upError.value = ''

  try {
    /** 展开后的文件列表 */
    const res = await window.ossApi.pickFolder()

    // 用户取消
    if (!res || res.canceled) {
      return
    }

    // 空目录或超限
    if (!res.ok) {
      upError.value = res.error || '选择文件夹失败'
      return
    }

    await mergeUpFiles(res.files || [])
  } catch (err) {
    upError.value = err && err.message ? err.message : '选择文件夹失败'
  }
}

/** 从列表拿掉一条，并让主进程忘掉路径 */
async function dropUpload(file) {
  // 传输过程中不能改列表
  if (!file || working.value || upDone.value) {
    return
  }

  upFiles.value = upFiles.value.filter((item) => item.id !== file.id)

  // 浏览器预览没有这条接口
  if (window.ossApi && window.ossApi.forget) {
    await window.ossApi.forget([file.id])
  }
}

/** 关掉弹窗。正在上传时不关，避免进度丢了还在传 */
async function closeUpload() {
  // 传了一半不能把窗口收掉
  if (working.value) {
    return
  }

  /** 还没传的 id，主进程里的路径要放开 */
  const ids = upFiles.value.map((file) => file.id)
  upShow.value = false
  upFiles.value = []
  upError.value = ''
  upDone.value = false

  // 没有待传文件就不用通知主进程
  if (!ids.length || !window.ossApi || !window.ossApi.forget) {
    return
  }

  await window.ossApi.forget(ids)
}

/** 点遮罩或关闭按钮 */
function onUpShow(show) {
  // 打开只发生在 askUpload
  if (show) {
    upShow.value = true
    return
  }

  closeUpload()
}

/** 传完后的完成，或还没传时的开始 */
function confirmUpload() {
  // 已经成功就只负责关掉
  if (upDone.value) {
    closeUpload()
    return
  }

  submitUpload()
}

/** 按弹窗里的列表上传，进度由主进程推回来 */
async function submitUpload() {
  // 没选中存储或列表是空的
  if (!current.value || !upFiles.value.length || working.value) {
    return
  }

  // 浏览器预览传不了
  if (!window.ossApi || !window.ossApi.upload) {
    upError.value = '请在应用窗口里上传'
    return
  }

  working.value = true
  upError.value = ''
  upFiles.value.forEach((file) => {
    file.percent = 0
    file.error = ''
  })

  try {
    /** 只提交 id，路径由主进程自己查 */
    const res = await window.ossApi.upload({
      id: current.value.id,
      place: place.value,
      fileIds: upFiles.value.map((file) => file.id)
    })

    // 中途失败时，第一条还没到 100 的就是失败项
    if (!res.ok) {
      upError.value = res.error || '上传失败'
      /** 是否已经标过失败的那一条 */
      let marked = false
      upFiles.value.forEach((file) => {
        // 已完成的保持 100，后面还没开始的先不动
        if (file.percent >= 100 || marked) {
          return
        }

        file.error = res.error || '上传失败'
        marked = true
      })
      return
    }

    upFiles.value.forEach((file) => {
      file.percent = 100
    })
    upDone.value = true
    await refreshList()
  } catch (err) {
    upError.value = err && err.message ? err.message : '上传失败'
  } finally {
    working.value = false
  }
}

/** 打开新建文件夹 */
function askMkdir() {
  nameKind.value = 'mkdir'
  nameDraft.value = ''
  nameShow.value = true
}

/** 打开改名，只能选一项 */
function askRename() {
  /** 当前勾的那一项 */
  const item = pickedItems.value[0]

  // 没选或多选都不改
  if (!item || pickedItems.value.length !== 1) {
    return
  }

  nameKind.value = 'rename'
  nameDraft.value = item.name
  nameShow.value = true
}

/** 行内改名，只动这一项 */
function askRenameOne(item) {
  // 空行没有名字
  if (!item) {
    return
  }

  picked.value = [item.key]
  askRename()
}

/** 提交新建或改名 */
async function submitName() {
  // 没选中存储
  if (!current.value) {
    return
  }

  // 浏览器预览没有这些接口
  if (!window.ossApi || !window.ossApi.mkdir || !window.ossApi.rename) {
    findError.value = '请在应用窗口里操作'
    return
  }

  working.value = true
  findError.value = ''

  try {
    /** 接口返回 */
    let res

    // 改名只动勾选的那一项
    if (nameKind.value === 'rename') {
      // 弹层开着时选择被清掉就别发空请求
      if (!pickedItems.value[0]) {
        findError.value = '请选择一项'
        return
      }

      // 响应式对象过不了 IPC，只带改名要用的字段
      const item = pickedItems.value[0]
      res = await window.ossApi.rename({
        id: current.value.id,
        item: { type: item.type, key: item.key },
        name: nameDraft.value
      })
    } else {
      res = await window.ossApi.mkdir({
        id: current.value.id,
        place: place.value,
        name: nameDraft.value
      })
    }

    // 名称不合法或 OSS 拒绝
    if (!res.ok) {
      findError.value = res.error || '操作失败'
      return
    }

    nameShow.value = false
    await refreshList()
  } catch (err) {
    findError.value = err && err.message ? err.message : '操作失败'
  } finally {
    working.value = false
  }
}

/** 打开删除确认 */
function askRemove() {
  // 没勾选就不要弹
  if (!pickedItems.value.length) {
    return
  }

  dropShow.value = true
}

/** 行内删除，只动这一项 */
function askRemoveOne(item) {
  // 空行删不了
  if (!item || !item.key) {
    return
  }

  picked.value = [item.key]
  askRemove()
}

/** 外网域名用的 region，没填就从 Endpoint 里拆 */
function regionOf(config) {
  /** 配置里写的地域 */
  const region = String((config && config.region) || '').trim()

  // 填了就直接用
  if (region) {
    return region
  }

  /** Endpoint 的主机 */
  const host = String((config && config.endpoint) || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
  /** oss-cn-hangzhou.aliyuncs.com */
  const plain = host.match(/^(oss-[a-z0-9-]+)\.aliyuncs\.com$/i)

  // 普通 Endpoint
  if (plain) {
    return plain[1]
  }

  /** bucket.oss-cn-hangzhou.aliyuncs.com */
  const virtual = host.match(/\.((oss-[a-z0-9-]+)\.aliyuncs\.com)$/i)

  // 虚拟主机写法
  if (virtual) {
    return virtual[2]
  }

  return ''
}

/** 对象 key 编进 URL 路径，中文不能裸放 */
function encodeKey(key) {
  return String(key || '')
    .replace(/^\/+/, '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

/** 公开访问地址 */
function fileUrl(config, key, kind) {
  /** 编码后的对象路径 */
  const path = encodeKey(key)

  // 智能分流模式走自定义域名下的 [默认目录/]download.html?apk=...
  if (kind === 'smart') {
    /** 配置里的绑定域名 */
    const host = String((config && config.domain) || '').trim()

    // 没填就拼不出
    if (!host) {
      return ''
    }

    /** 默认目录前缀，如 'apk/' */
    const prefix = String((config && config.prefix) || '').trim().replace(/^\/+/, '')

    // v= 用来冲掉微信对旧 download.html 的缓存（曾默认显示「示例应用」）
    return `https://${host}/${prefix}download.html?v=3&apk=${path}`
  }

  // 自定义域名走绑定的主机
  if (kind === 'custom') {
    /** 配置里的绑定域名 */
    const host = String((config && config.domain) || '').trim()

    // 没填就拼不出
    if (!host) {
      return ''
    }

    return `https://${host}/${path}`
  }

  /** 桶名 */
  const bucket = String((config && config.bucket) || '').trim()
  /** 地域 */
  const region = regionOf(config)

  // 默认域名必须有桶和地域
  if (!bucket || !region) {
    return ''
  }

  return `https://${bucket}.${region}.aliyuncs.com/${path}`
}

/** 当前正在生成二维码的文件是否为 APK 安装包 */
const isApkItem = computed(() => {
  return String(codeItem.value?.name || '').toLowerCase().endsWith('.apk')
})

/** 当前弹窗里的文件地址 */
const codeUrl = computed(() => {
  // 还没选文件或没选存储
  if (!codeItem.value || !current.value) {
    return ''
  }

  /** 基础公开地址 */
  let url = fileUrl(current.value, codeItem.value.key, codeKind.value)

  // 智能分流页顶部图标要和二维码中间同一张 Logo
  if (url && codeKind.value === 'smart' && codeLogo.value) {
    /** 当前选中的 Logo */
    const logo = codeLogos.value.find((item) => item.name === codeLogo.value)

    // 有桶内路径才拼进下载页，扫码打开就能显示
    if (logo && logo.key) {
      url += `&logo=${encodeURIComponent(logo.key)}`
    }
  }

  return url
})

/** 拼不出地址时的原因 */
const codeHint = computed(() => {
  // 智能分流没填自定义域名
  if (codeKind.value === 'smart' && !String(current.value?.domain || '').trim()) {
    return '智能分流需要在 OSS 配置里填写自定义域名'
  }

  // 自定义域名没填
  if (codeKind.value === 'custom' && !String(current.value?.domain || '').trim()) {
    return '先在 OSS 配置里填自定义域名'
  }

  // 外网域名拼不出来
  if (codeKind.value === 'oss' && !codeUrl.value) {
    return '外网域名需要 Bucket 和 Region'
  }

  return ''
})

/** APK 用不同模式时的提醒 */
const codeNote = computed(() => {
  /** 是不是安装包 */
  const apk = String(codeItem.value?.name || '').toLowerCase().endsWith('.apk')

  // 智能分流码提示
  if (apk && codeKind.value === 'smart') {
    return '💡 智能分流码：国内安卓扫码直接下载本文件，苹果/海外安卓自动跳转应用商店'
  }

  // APK 用默认域名经常被拦
  if (apk && codeKind.value === 'oss') {
    return 'APK 用阿里云默认域名经常打不开，建议改用自定义域名或智能分流'
  }

  return ''
})

/** 打开二维码，安装包默认优先使用智能分流码 */
function askCode(item) {
  // 目录没有公开下载地址
  if (!item || item.type === 'folder') {
    return
  }

  codeItem.value = item
  codeCopied.value = false
  codeSaved.value = false
  /** 是不是安装包 */
  const apk = String(item.name || '').toLowerCase().endsWith('.apk')

  // 安装包且配了自定义域名，默认优先生成智能分流码
  if (apk && String(current.value?.domain || '').trim()) {
    codeKind.value = 'smart'
  } else if (apk) {
    codeKind.value = 'custom'
  } else {
    codeKind.value = 'oss'
  }

  codeShow.value = true
  loadLogos()
}

/** 读当前配置的 Logo 目录 */
async function loadLogos() {
  codeLogoErr.value = ''

  // 没选中存储
  if (!current.value) {
    codeLogos.value = []
    return
  }

  // 预加载没带上这条接口，多半没重启
  if (!window.ossApi || !window.ossApi.logos) {
    codeLogos.value = []
    codeLogoErr.value = '请完全退出后重新打开应用'
    return
  }

  try {
    /** 主进程按配置里的 Logo 目录去桶里拉图 */
    const res = await window.ossApi.logos({ id: current.value.id })

    // 目录不在或没权限
    if (!res.ok) {
      codeLogos.value = []
      codeLogoErr.value = res.error || '读取 Logo 失败'
      return
    }

    codeLogos.value = res.files || []

    // 上次选的文件已经不在了
    if (!codeLogos.value.some((item) => item.name === codeLogo.value)) {
      codeLogo.value = ''
    }
  } catch (err) {
    codeLogos.value = []
    codeLogoErr.value = err && err.message ? err.message : '读取 Logo 失败'
  }

  await drawCode()
}

/** 把 data URL 载成图片，用来叠 Logo */
function loadImg(src) {
  return new Promise((resolve, reject) => {
    /** 画布用的位图 */
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片读失败'))
    img.src = src
  })
}

/** 二维码中间留白再贴 Logo，周围留一圈白边 */
async function stampLogo(qrSrc, logoSrc) {
  /** 原二维码 */
  const qr = await loadImg(qrSrc)
  /** 选中的 Logo */
  const logo = await loadImg(logoSrc)
  /** 叠完的画布 */
  const canvas = document.createElement('canvas')
  canvas.width = qr.width
  canvas.height = qr.height
  /** 2d 画笔 */
  const ctx = canvas.getContext('2d')

  // 画布不可用就退回原图
  if (!ctx) {
    return qrSrc
  }

  ctx.drawImage(qr, 0, 0)
  /** Logo 大约占二维码边长的五分之一 */
  const size = Math.round(qr.width * 0.2)
  /** 白边，避免黑块贴到 Logo */
  const pad = Math.round(size * 0.14)
  /** 白底方块边长 */
  const box = size + pad * 2
  /** 水平居中 */
  const x = (qr.width - box) / 2
  /** 垂直居中 */
  const y = (qr.height - box) / 2
  ctx.fillStyle = '#fff'
  ctx.fillRect(x, y, box, box)
  ctx.drawImage(logo, x + pad, y + pad, size, size)
  return canvas.toDataURL('image/png')
}

/** 把当前地址画成二维码，有 Logo 就叠到中间 */
async function drawCode() {
  /** 要画进二维码的地址 */
  const url = codeUrl.value

  // 地址无效就清空图
  if (!url) {
    codeSrc.value = ''
    return
  }

  try {
    /** 先画完整二维码，容错开高一点，中间挖掉还能扫 */
    const base = await QRCode.toDataURL(url, {
      width: 280,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#0f1419', light: '#ffffff' }
    })
    /** 选中的那张 Logo */
    const logo = codeLogos.value.find((item) => item.name === codeLogo.value)

    // 没选 Logo 就用原图
    if (!logo) {
      codeSrc.value = base
      return
    }

    codeSrc.value = await stampLogo(base, logo.src)
  } catch {
    codeSrc.value = ''
  }
}

/** 地址或 Logo 变了就重画 */
watch([codeUrl, codeLogo], () => {
  drawCode()
})

/** 复制当前链接 */
async function copyCode() {
  // 没有地址就不用写剪贴板
  if (!codeUrl.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(codeUrl.value)
    codeCopied.value = true

    // 清掉上一次的计时
    if (copyTimer) {
      clearTimeout(copyTimer)
    }

    copyTimer = setTimeout(() => {
      codeCopied.value = false
    }, 1500)
  } catch {
    codeCopied.value = false
  }
}

/** 下载当前这张二维码，中间有 Logo 的也一起带上 */
async function saveCode() {
  // 还没画出图
  if (!codeSrc.value) {
    return
  }

  // 浏览器预览没有保存框
  if (!window.ossApi || !window.ossApi.saveQr) {
    codeLogoErr.value = '请在应用窗口里下载'
    return
  }

  /** 文件名用对象名，去掉后缀再加 -qr */
  const raw = String((codeItem.value && codeItem.value.name) || 'qr')
  /** 最后一个点，用来去掉原后缀 */
  const dot = raw.lastIndexOf('.')
  /** 保存框里的默认名 */
  const name = `${dot > 0 ? raw.slice(0, dot) : raw}-qr`

  codeSaving.value = true

  try {
    /** 主进程弹保存框并写盘 */
    const res = await window.ossApi.saveQr({
      name,
      dataUrl: codeSrc.value
    })

    // 用户取消
    if (!res || res.canceled) {
      return
    }

    // 写失败
    if (!res.ok) {
      codeLogoErr.value = res.error || '保存失败'
      return
    }

    codeSaved.value = true

    // 清掉上一次的计时
    if (saveTimer) {
      clearTimeout(saveTimer)
    }

    saveTimer = setTimeout(() => {
      codeSaved.value = false
    }, 1500)
  } catch (err) {
    codeLogoErr.value = err && err.message ? err.message : '保存失败'
  } finally {
    codeSaving.value = false
  }
}

/** 打开配置文件编辑弹窗 */
async function openConfigModal(item) {
  // 没选中存储直接返回
  if (!current.value) {
    return
  }

  // 预加载接口不可用
  if (!window.ossApi || !window.ossApi.readText) {
    findError.value = '请完全退出后重新打开应用以启用配置文件功能'
    return
  }

  /** 对象在桶里的完整 key */
  const key = item ? item.key : `${place.value || current.value.prefix || ''}config.json`
  configKey.value = key
  configError.value = ''
  configMode.value = 'form'
  configSaving.value = false

  // 从当前目录推测默认应用名称（如 "apk/大湃/" -> "大湃"）
  let defaultAppName = ''
  /** 当前所在路径字符串 */
  const rawPath = String(place.value || current.value.prefix || '').replace(/\/$/, '')
  /** 分割后的路径段 */
  const parts = rawPath ? rawPath.split('/') : []
  if (parts.length && parts[parts.length - 1]) {
    defaultAppName = parts[parts.length - 1]
  }

  // 初始化草稿
  configDraft.name = defaultAppName
  configDraft.appleUrl = ''
  configDraft.googleUrl = ''
  /** 列表中检测到的首个 APK 文件名 */
  const firstApk = apkOptions.value[0]?.value || ''
  configDraft.apk = firstApk
  configRawText.value = ''

  configShow.value = true

  // 如果点击的是已有文件，从 OSS 读内容并回填
  if (item) {
    configSaving.value = true
    try {
      /** 从 OSS 读取到的文本返回结果 */
      const res = await window.ossApi.readText({
        id: current.value.id,
        key: item.key
      })

      if (!res.ok) {
        configError.value = res.error || '读取配置文件失败'
        return
      }

      configRawText.value = res.content || '{}'

      // 尝试解析 JSON 并填充表单
      try {
        const parsed = JSON.parse(res.content)
        if (parsed && typeof parsed === 'object') {
          configDraft.name = parsed.name || defaultAppName
          configDraft.appleUrl = parsed.appleUrl || ''
          configDraft.googleUrl = parsed.googleUrl || ''
          configDraft.apk = parsed.apk || firstApk
        }
      } catch {
        // 如果文件不是合法 JSON，切到源码模式由用户直接修改
        configMode.value = 'raw'
      }
    } catch (err) {
      configError.value = err && err.message ? err.message : '读取配置文件失败'
    } finally {
      configSaving.value = false
    }
  } else {
    // 新建模式，根据草稿生成初始源码
    configRawText.value = JSON.stringify(
      {
        name: configDraft.name,
        appleUrl: configDraft.appleUrl,
        googleUrl: configDraft.googleUrl,
        apk: configDraft.apk
      },
      null,
      2
    )
  }
}

/** 快捷新建配置文件 */
function askCreateConfig() {
  /** 检查当前目录下是否已存在 config.json */
  const existing = hits.value.find(
    (item) => item && item.type === 'file' && String(item.name || '').toLowerCase() === 'config.json'
  )

  // 已有则直接打开编辑已有文件
  if (existing) {
    openConfigModal(existing)
    return
  }

  // 没有则以新建模式打开
  openConfigModal(null)
}

/** 监听模式切换，同步表单与源码 */
watch(configMode, (newMode) => {
  if (newMode === 'raw') {
    /** 当前表单组装出的对象 */
    const data = {
      name: String(configDraft.name || '').trim(),
      appleUrl: String(configDraft.appleUrl || '').trim(),
      googleUrl: String(configDraft.googleUrl || '').trim(),
      apk: String(configDraft.apk || '').trim()
    }
    configRawText.value = JSON.stringify(data, null, 2)
  } else {
    try {
      /** 解析源码为对象 */
      const parsed = JSON.parse(configRawText.value)
      if (parsed && typeof parsed === 'object') {
        configDraft.name = parsed.name || ''
        configDraft.appleUrl = parsed.appleUrl || ''
        configDraft.googleUrl = parsed.googleUrl || ''
        configDraft.apk = parsed.apk || ''
        configError.value = ''
      }
    } catch {
      configError.value = '当前 JSON 格式有误，无法切回表单'
    }
  }
})

/** 提交并保存配置文件至 OSS */
async function submitConfigModal() {
  // 未选择存储或没有目标 key
  if (!current.value || !configKey.value) {
    return
  }

  /** 最终待保存的 JSON 文本 */
  let finalJson = ''
  if (configMode.value === 'form') {
    const data = {
      name: String(configDraft.name || '').trim(),
      appleUrl: String(configDraft.appleUrl || '').trim(),
      googleUrl: String(configDraft.googleUrl || '').trim(),
      apk: String(configDraft.apk || '').trim()
    }
    finalJson = JSON.stringify(data, null, 2)
  } else {
    try {
      const parsed = JSON.parse(configRawText.value)
      finalJson = JSON.stringify(parsed, null, 2)
    } catch (err) {
      configError.value = 'JSON 格式不合法：' + (err && err.message ? err.message : '')
      return
    }
  }

  configSaving.value = true
  configError.value = ''

  try {
    /** 调用主进程将 JSON 保存覆盖至 OSS */
    const res = await window.ossApi.saveText({
      id: current.value.id,
      key: configKey.value,
      text: finalJson
    })

    if (!res.ok) {
      configError.value = res.error || '保存失败'
      return
    }

    configShow.value = false
    await refreshList()
  } catch (err) {
    configError.value = err && err.message ? err.message : '保存失败'
  } finally {
    configSaving.value = false
  }
}

/** 删除勾选的文件和文件夹 */
async function removePicked() {
  // 没选中存储
  if (!current.value) {
    return
  }

  // 浏览器预览删不了桶里的对象
  if (!window.ossApi || !window.ossApi.remove) {
    findError.value = '请在应用窗口里删除'
    return
  }

  working.value = true
  findError.value = ''

  try {
    /** 只把类型和 key 交给主进程 */
    const res = await window.ossApi.remove({
      id: current.value.id,
      items: pickedItems.value.map((item) => ({ type: item.type, key: item.key }))
    })

    // 删失败就留着确认框上的列表，错误写在主区域
    if (!res.ok) {
      findError.value = res.error || '删除失败'
      dropShow.value = false
      return
    }

    dropShow.value = false
    await refreshList()
  } catch (err) {
    findError.value = err && err.message ? err.message : '删除失败'
  } finally {
    working.value = false
  }
}

/** 从子目录回到上一层 */
function up() {
  place.value = parentPlace(place.value, current.value?.prefix || '')
  keyword.value = ''
  runFind()
}

/** 点路径里的某一层，进到那个目录 */
function goPlace(key) {
  place.value = key
  keyword.value = ''
  runFind()
}

/** 右键圆点：在指针处弹出删除 */
function openMenu(event, id) {
  hitMenuShow.value = false
  menuId.value = id
  menuX.value = event.clientX
  menuY.value = event.clientY
  // 先关掉再开，否则第二次右键位置不更新
  menuShow.value = false
  nextTick(() => {
    menuShow.value = true
  })
}

/** 点了左侧存储的右键菜单 */
function onMenu(key) {
  menuShow.value = false

  // 目前只有删除一项
  if (key === 'drop') {
    dropStore(menuId.value)
  }
}

/** 打开文件列表右键菜单 */
function openHitMenu(event, item) {
  // 空项不弹
  if (!item || !item.key) {
    return
  }

  // 关掉左侧存储菜单，避免两个叠在一起
  menuShow.value = false
  hitMenuItem.value = item
  hitMenuX.value = event.clientX
  hitMenuY.value = event.clientY
  // 先关掉再开，否则第二次右键位置不更新
  hitMenuShow.value = false
  nextTick(() => {
    hitMenuShow.value = true
  })

  // 点在未选中项上：改成只选这一项（和资源管理器一样）
  if (!picked.value.includes(item.key)) {
    picked.value = [item.key]
  }
}

/** 文件列表右键菜单选中某一项 */
function onHitMenu(key) {
  hitMenuShow.value = false
  /** 右键当时那一项 */
  const item = hitMenuItem.value
  // 项已经没了就结束
  if (!item) {
    return
  }

  // 打开文件夹
  if (key === 'open') {
    onHit(item)
    return
  }

  // 编辑 config.json
  if (key === 'config') {
    openConfigModal(item)
    return
  }

  // 改名
  if (key === 'rename') {
    askRenameOne(item)
    return
  }

  // 二维码
  if (key === 'code') {
    askCode(item)
    return
  }

  // 删除：若右键落在多选之一上，删整批选中
  if (key === 'remove') {
    if (picked.value.includes(item.key) && pickedItems.value.length > 1) {
      askRemove()
      return
    }
    askRemoveOne(item)
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

/**
 * 执行版本检测
 * @param {boolean} isManual 是否为用户手动点击触发
 */
async function runCheckUpdate(isManual = false) {
  if (!window.updaterApi) {
    return
  }

  checkingUpdate.value = true
  try {
    const res = await window.updaterApi.check()
    if (res && res.currentVersion) {
      currentAppVersion.value = res.currentVersion
    }

    if (res && res.hasUpdate && res.updateInfo) {
      hasUpdate.value = true
      updateInfo.value = res.updateInfo
      showUpdateCard.value = true
    } else {
      hasUpdate.value = false
      if (isManual) {
        showLatestTip('当前已是最新版本 v' + currentAppVersion.value)
      }
    }
  } catch {
    if (isManual) {
      showLatestTip('检测更新失败，请稍后重试')
    }
  } finally {
    checkingUpdate.value = false
  }
}

/**
 * 弹出简易提示气泡
 * @param {string} msg 提示内容
 */
function showLatestTip(msg) {
  updateTip.value = msg
  if (updateTipTimer) {
    clearTimeout(updateTipTimer)
  }
  updateTipTimer = setTimeout(() => {
    updateTip.value = ''
  }, 2500)
}

/**
 * 点击左侧下载图标
 */
function onDownloadClick() {
  // 如果已存在新版本信息，直接展开/折叠更新弹窗
  if (hasUpdate.value && updateInfo.value) {
    showUpdateCard.value = !showUpdateCard.value
    return
  }

  // 否则发起检查更新
  runCheckUpdate(true)
}

/**
 * 点击弹窗的立即更新按钮，调用系统浏览器打开 Release 页面
 */
function onGoUpdate() {
  if (updateInfo.value?.url && window.updaterApi) {
    window.updaterApi.openUrl(updateInfo.value.url)
  }
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
    domain: draft.domain,
    logoDir: draft.logoDir,
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
    draft.domain = res.config.domain || ''
    draft.logoDir = res.config.logoDir || ''
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
  // 进度可能在上传过程中随时过来
  if (window.ossApi && window.ossApi.onProgress) {
    offProgress = window.ossApi.onProgress(applyProgress)
  }

  // 启动 2 秒后自动静默检测是否有新版本发布
  setTimeout(() => {
    runCheckUpdate(false)
  }, 2000)

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

onUnmounted(() => {
  // 清除更新提示计时器
  if (updateTipTimer) {
    clearTimeout(updateTipTimer)
    updateTipTimer = null
  }

  // 窗口拆掉时别再收进度
  if (offProgress) {
    offProgress()
    offProgress = null
  }

  // 复制提示的计时也清掉
  if (copyTimer) {
    clearTimeout(copyTimer)
    copyTimer = null
  }

  // 保存提示的计时也清掉
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
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

/* 左侧栏底部容器 */
.rail-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

/* 下载按钮包装器（相对定位供红点和气泡锚定） */
.down-wrap {
  position: relative;
}

/* 下载按钮本体 */
.down-btn {
  position: relative;
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
  transition: background 0.2s ease, transform 0.15s ease, color 0.2s ease;
}

.down-btn:hover {
  background: var(--line);
  color: #fff;
}

.down-btn.on {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.down-btn.spinning svg {
  animation: spin-icon 1s linear infinite;
}

@keyframes spin-icon {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 右上角醒目红点 */
.red-dot {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff4d4f;
  box-shadow: 0 0 0 2px var(--rail);
  animation: dot-glow 2s ease-in-out infinite;
}

@keyframes dot-glow {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 2px var(--rail), 0 0 4px rgba(255, 77, 79, 0.6);
  }
  50% {
    transform: scale(1.15);
    box-shadow: 0 0 0 2px var(--rail), 0 0 8px rgba(255, 77, 79, 0.9);
  }
}

/* 无更新时的轻量气泡提示 */
.update-tip {
  position: absolute;
  left: 46px;
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--line);
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 999;
  pointer-events: none;
}

/* 仿编译器风格的左侧更新提示卡片 */
.update-card {
  position: fixed;
  left: 64px;
  bottom: 24px;
  width: 310px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(10px);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}

.card-badge {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #ff4d4f;
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.5px;
}

.card-close {
  background: transparent;
  border: 0;
  color: var(--muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  border-radius: 4px;
  transition: color 0.15s ease;
}

.card-close:hover {
  color: var(--text);
}

.card-body {
  padding: 10px 14px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}

.card-sub {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: var(--muted);
}

.card-notes {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 10px;
  max-height: 130px;
  overflow-y: auto;
}

.notes-title {
  font-size: 11px;
  color: var(--text);
  font-weight: 600;
  margin-bottom: 4px;
}

.notes-content {
  font-size: 11px;
  color: var(--muted);
  white-space: pre-wrap;
  word-break: break-word;
}

.card-hint {
  margin: 0;
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px 12px;
  background: rgba(0, 0, 0, 0.1);
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel:hover {
  background: var(--dot);
  color: var(--text);
}

.btn-update {
  background: var(--accent);
  border: 0;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 14px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-update:hover {
  background: var(--accent-hover);
}

.btn-update:active {
  background: var(--accent-press);
}

/* 弹窗滑出滑入动画 */
.pop-slide-enter-active,
.pop-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.pop-slide-enter-from,
.pop-slide-leave-to {
  opacity: 0;
  transform: translateX(-16px) scale(0.95);
}

/* 提示淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-6px);
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

.crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 14px;
}

.crumb {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
}

.crumb:hover {
  color: var(--accent-hover);
}

.crumb.now {
  color: var(--text);
  cursor: default;
}

.crumb-sep {
  color: var(--muted);
}

.act-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.tick {
  width: 16px;
  height: 16px;
  margin: 0;
  flex-shrink: 0;
}

.hits {
  flex: 1;
  min-height: 0;
  margin-top: 8px;
  overflow: auto;
  position: relative;
  border-radius: 8px;
  transition: box-shadow 0.15s ease, background 0.15s ease;
}

/* 拖文件到列表时的高亮提示 */
.hits.is-drag {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  box-shadow: inset 0 0 0 2px var(--accent);
}

.hits-drag {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: var(--accent);
  font-size: 15px;
  font-weight: 600;
  background: color-mix(in srgb, var(--panel, #fff) 72%, transparent);
}

.hit {
  display: grid;
  grid-template-columns: 22px minmax(120px, 1.4fr) 80px 80px 130px 180px;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  text-align: left;
}

.hit-head {
  position: sticky;
  top: 0;
  z-index: 1;
  color: var(--muted);
  font-size: 12px;
  background: var(--bg);
}

.hit:hover,
.hit.on {
  background: var(--dot);
}

.hit-head span:last-child {
  text-align: right;
}

.hit-file {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: default;
}

.hit-file.folder {
  cursor: pointer;
}

.hit-file.folder .hit-name {
  color: var(--accent);
}

.hit-cell {
  color: var(--muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hit-ops {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.hit-act {
  height: 20px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}

.hit-act:hover {
  color: var(--accent-hover);
}

.hit-act.danger {
  color: var(--danger);
}

.hit-act:disabled {
  opacity: 0.45;
  cursor: default;
}

.ico-src {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.ico {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.ico-folder {
  color: #e8b84a;
}

.ico-file {
  color: var(--muted);
}

.ico-image {
  color: #6cb6ff;
}

.ico-video {
  color: #c58bff;
}

.ico-audio {
  color: #5dcaa5;
}

.ico-archive {
  color: #e0a15a;
}

.ico-apk {
  color: #7dce6a;
}

.ico-config {
  color: #38bdf8;
}

.hit-file.config-file {
  cursor: pointer;
}

.hit-file.config-file:hover .hit-name {
  color: #38bdf8;
}

.config-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.35);
  font-size: 11px;
  margin-left: 6px;
  flex-shrink: 0;
  line-height: 16px;
}

.hit-act.config-act {
  color: #38bdf8;
  font-weight: 600;
}

.hit-act.config-act:hover {
  color: #7dd3fc;
}

.config-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.up-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.up-empty {
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.up-list {
  max-height: 320px;
  margin-top: 12px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--input);
}

.up-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.up-row + .up-row {
  border-top: 1px solid var(--line);
}

.up-main {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  column-gap: 12px;
}

.up-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 20px;
}

.up-size {
  color: var(--muted);
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}

.up-drop {
  height: 20px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}

.up-drop:hover {
  color: var(--danger);
}

.up-drop:disabled {
  opacity: 0.45;
  cursor: default;
}

.up-bar,
.up-err {
  grid-column: 1 / -1;
}

.up-bar {
  margin-top: 6px;
}

.up-err {
  margin: 4px 0 0;
  color: var(--danger);
  font-size: 12px;
}

.code-img {
  display: block;
  width: 280px;
  height: 280px;
  margin: 14px auto 0;
  border-radius: 8px;
  background: #fff;
}

.logo-pick {
  margin-top: 12px;
}

.logo-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.logo-item {
  width: 48px;
  height: 48px;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--input);
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  overflow: hidden;
}

.logo-item img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.logo-item.on {
  border-color: var(--accent);
  color: var(--accent);
}

.code-kind {
  display: flex;
  gap: 16px;
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
