import { darkTheme } from 'naive-ui'

/** Naive 暗色主题，给 ConfigProvider 用 */
export const theme = darkTheme

/** 把 Naive 色板对齐 tokens.css，避免库默认灰蓝和我们脱节 */
export const overrides = {
  common: {
    fontFamily: "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    primaryColor: '#3d8bfd',
    primaryColorHover: '#5a9dff',
    primaryColorPressed: '#2f74d6',
    primaryColorSuppl: '#3d8bfd',
    bodyColor: '#0f1419',
    cardColor: '#1a2332',
    modalColor: '#1a2332',
    popoverColor: '#1a2332',
    borderColor: '#2a3648',
    dividerColor: '#2a3648',
    inputColor: '#121a26',
    hoverColor: 'rgba(61, 139, 253, 0.12)',
    textColorBase: '#e7ecf3',
    textColor1: '#e7ecf3',
    textColor2: '#8b9bb4',
    textColor3: '#8b9bb4',
    errorColor: '#d96b6b',
    successColor: '#3ecf8e'
  }
}
