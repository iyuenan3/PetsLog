import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import fs from 'node:fs'
import path from 'node:path'

// 把根目录 cloudfunctions/ 拷进 mp-weixin 构建产物，
// 使微信开发者工具在打开产物目录时能识别 cloudfunctionRoot（manifest.json 中声明）。
// 云函数源码留在仓库版本管理，产物目录走 .gitignore。
// 【不拷 node_modules】：否则 8 个函数的依赖共数百 MB / 数万文件灌进 DevTools 监视的产物目录，
// 引发「不停自动刷新」并拖慢每次构建。依赖改由 DevTools「上传并部署：云端安装依赖」
// 按各函数 package.json 在云端安装（已确认 8 个函数均含 package.json + wx-server-sdk）。
function copyCloudfunctions() {
  return {
    name: 'petslog:copy-cloudfunctions',
    closeBundle() {
      const outDir = process.env.UNI_OUTPUT_DIR
      if (!outDir || !outDir.includes('mp-weixin')) return
      const src = path.resolve(process.cwd(), 'cloudfunctions')
      if (!fs.existsSync(src)) return
      const dest = path.resolve(outDir, 'cloudfunctions')
      // 旧产物可能残留体积巨大的 node_modules，先清掉再拷，避免陈旧依赖滞留
      fs.rmSync(dest, { recursive: true, force: true })
      fs.cpSync(src, dest, {
        recursive: true,
        filter: (s) => !s.split(path.sep).includes('node_modules'),
      })
      console.log('[petslog] cloudfunctions copied (无 node_modules) ->', dest)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), copyCloudfunctions()],
})
