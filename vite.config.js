import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import fs from 'node:fs'
import path from 'node:path'

// 把根目录 cloudfunctions/ 拷进 mp-weixin 构建产物，
// 使微信开发者工具在打开产物目录时能识别 cloudfunctionRoot（manifest.json 中声明）。
// 云函数源码留在仓库版本管理，产物目录走 .gitignore。
function copyCloudfunctions() {
  return {
    name: 'petslog:copy-cloudfunctions',
    closeBundle() {
      const outDir = process.env.UNI_OUTPUT_DIR
      if (!outDir || !outDir.includes('mp-weixin')) return
      const src = path.resolve(process.cwd(), 'cloudfunctions')
      if (!fs.existsSync(src)) return
      const dest = path.resolve(outDir, 'cloudfunctions')
      fs.cpSync(src, dest, { recursive: true })
      console.log('[petslog] cloudfunctions copied ->', dest)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), copyCloudfunctions()],
})
