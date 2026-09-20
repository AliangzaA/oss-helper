// Vue 入口：公共样式先挂上，再挂页面
import { createApp } from 'vue'
import App from './App.vue'
import './styles/base.css'

createApp(App).mount('#app')
