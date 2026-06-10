// 健康记录附件：选择 / 压缩 / 上传 / 登记 / 查看（见 AIREADME/DECISIONS ADR-011）。
// 录入确认卡片（入口 A）与记录详情页（入口 B）共用。
// 客户端这里只做「预检 + 省流量」；配额硬校验（真实体积 / 1GB / 200MB·天）在 attachment 云函数，别依赖这里兜安全。
import { callFn } from '@/cloud'

export const ATT_MAX_PER_RECORD = 9
export const VIDEO_MAX_SEC = 30
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024 // 与服务端 FILE_BYTES_MAX.image 对齐，超限早拦免白传整批
export const VIDEO_MAX_BYTES = 30 * 1024 * 1024
export const PDF_MAX_BYTES = 10 * 1024 * 1024

export function fmtSize(n) {
  if (!n && n !== 0) return ''
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + 'KB'
  return (n / 1024 / 1024).toFixed(1) + 'MB'
}

// 选附件：弹菜单分流到 chooseMedia（图/视频）或 chooseMessageFile（PDF，小程序只能从聊天选文件）。
// 返回 [{tempPath, thumbTemp, type:'image'|'video'|'pdf', name, size}]；用户取消返回 []。
export function pickAttachments(remaining) {
  // #ifdef MP-WEIXIN
  return new Promise((resolve) => {
    uni.showActionSheet({
      itemList: ['拍照 / 相册（图片或视频）', '从微信聊天选文件（PDF）'],
      success: async (r) => {
        try {
          resolve(r.tapIndex === 0 ? await pickMedia(remaining) : await pickPdf(remaining))
        } catch (e) {
          if (!String((e && e.errMsg) || '').includes('cancel')) {
            uni.showToast({ title: (e && e.msg) || '选择失败', icon: 'none' })
          }
          resolve([])
        }
      },
      fail: () => resolve([]),
    })
  })
  // #endif
  // eslint-disable-next-line no-unreachable
  return Promise.resolve([])
}

function pickMedia(remaining) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: Math.min(remaining, 9),
      mediaType: ['image', 'video'],
      sizeType: ['compressed'],
      maxDuration: VIDEO_MAX_SEC, // 拍摄上限；相册选入超长的在下面再拦
      success: (res) => {
        const out = []
        for (const f of res.tempFiles || []) {
          if (f.fileType === 'video') {
            if (f.duration && f.duration > VIDEO_MAX_SEC + 1) {
              return reject({ msg: `视频不能超过 ${VIDEO_MAX_SEC} 秒` })
            }
            if (f.size > VIDEO_MAX_BYTES) return reject({ msg: '视频不能超过 30MB' })
            out.push({ tempPath: f.tempFilePath, thumbTemp: f.thumbTempFilePath || '', type: 'video', name: '视频', size: f.size })
          } else {
            // 压缩失败会回退原图（见 compressForUpload），故选择时即按 10MB 预检，避免超限图整批被服务端拒
            if (f.size > IMAGE_MAX_BYTES) return reject({ msg: '图片不能超过 10MB' })
            out.push({ tempPath: f.tempFilePath, thumbTemp: '', type: 'image', name: '图片', size: f.size })
          }
        }
        resolve(out)
      },
      fail: reject,
    })
  })
}

function pickPdf(remaining) {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: Math.min(remaining, 9),
      type: 'file',
      extension: ['pdf'],
      success: (res) => {
        const out = []
        for (const f of res.tempFiles || []) {
          if (!/\.pdf$/i.test(f.name || '')) return reject({ msg: '只支持 PDF 文件' })
          if (f.size > PDF_MAX_BYTES) return reject({ msg: 'PDF 不能超过 10MB（端侧压不了，请先压缩）' })
          out.push({ tempPath: f.path, thumbTemp: '', type: 'pdf', name: f.name || '文件.pdf', size: f.size })
        }
        resolve(out)
      },
      fail: reject,
    })
  })
}

// 图片压缩：长边 ≤2000 + quality 80（省存储），失败回退原图（压缩是优化不是门槛）
async function compressForUpload(path) {
  try {
    const info = await getImageInfo(path)
    const long = Math.max(info.width || 0, info.height || 0)
    const opt = { src: path, quality: 80 }
    if (long > 2000) opt.compressedWidth = Math.round((info.width * 2000) / long)
    const r = await wxp('compressImage', opt)
    return r.tempFilePath || path
  } catch (e) {
    return path
  }
}

// 缩略图：宽 ~360px 低质量小图，列表只下它、原图点开才下，省 CDN 下行（1GB/月 是真瓶颈）
async function makeThumb(path) {
  try {
    const r = await wxp('compressImage', { src: path, quality: 60, compressedWidth: 360 })
    return r.tempFilePath || ''
  } catch (e) {
    return ''
  }
}

function getImageInfo(src) {
  return wxp('getImageInfo', { src })
}
function wxp(api, opt) {
  return new Promise((resolve, reject) => wx[api]({ ...opt, success: resolve, fail: reject }))
}
function cloudUpload(cloudPath, filePath) {
  return new Promise((resolve, reject) => wx.cloud.uploadFile({ cloudPath, filePath, success: (r) => resolve(r.fileID), fail: reject }))
}

// 上传一批附件并登记到记录。返回 {ok, attachments?|msg}。
// 流程：压缩 → 传云存储 → attachment.register 服务端复核（不过则服务端删文件回滚）。
// 中途上传失败时尽力删掉已传的，避免无主文件占共享配额。
export async function uploadAndRegister(recordId, picked) {
  // #ifdef MP-WEIXIN
  const files = []
  const uploadedIDs = []
  try {
    for (let i = 0; i < picked.length; i++) {
      const p = picked[i]
      const stamp = `${Date.now()}_${i}`
      let mainPath = p.tempPath
      let thumbPath = p.thumbTemp
      if (p.type === 'image') {
        mainPath = await compressForUpload(p.tempPath)
        thumbPath = await makeThumb(mainPath)
      }
      const ext = p.type === 'pdf' ? 'pdf' : p.type === 'video' ? 'mp4' : 'jpg'
      const fileID = await cloudUpload(`att/${recordId}/${stamp}.${ext}`, mainPath)
      uploadedIDs.push(fileID)
      let thumb = ''
      if (thumbPath) {
        thumb = await cloudUpload(`att/${recordId}/${stamp}_t.jpg`, thumbPath)
        uploadedIDs.push(thumb)
      }
      files.push({ fileID, thumb, type: p.type, name: p.name, size: p.size })
    }
  } catch (e) {
    if (uploadedIDs.length) wx.cloud.deleteFile({ fileList: uploadedIDs }).catch(() => {})
    return { ok: false, msg: '附件上传失败，请重试' }
  }
  // register 调用必须包进 try：弱网下「上传成功但调用 reject」是真机常见时序，
  // 不删已传文件就成不计配额、无法回收的永久孤儿（评审 high）。
  let res
  try {
    res = await callFn('attachment', { action: 'register', record_id: recordId, files })
  } catch (e) {
    if (uploadedIDs.length) wx.cloud.deleteFile({ fileList: uploadedIDs }).catch(() => {})
    return { ok: false, msg: '附件保存失败，请重试' }
  }
  const r = (res && res.result) || {}
  // 服务端校验不过（且未删文件的早退路径，如 BAD_PATH）：客户端补删自己刚传的文件，免孤儿
  if (!r.ok && uploadedIDs.length) wx.cloud.deleteFile({ fileList: uploadedIDs }).catch(() => {})
  return r.ok ? { ok: true, attachments: r.attachments } : { ok: false, msg: r.msg || '附件保存失败' }
  // #endif
  // eslint-disable-next-line no-unreachable
  return { ok: false, msg: 'not mp' }
}

// ---------- 查看 ----------
// 临时 URL 缓存（带 TTL：getTempFileURL 返回限时签名链，整会话死缓存会在链过期后预览空白且永不重取，评审 low）
const urlCache = {} // fileID -> { url, t }
const URL_TTL = 100 * 60 * 1000 // < 官方有效期，留余量
const pdfCache = {} // fileID -> 本地临时文件路径（看过不再走 CDN）
function freshUrl(id) {
  const c = urlCache[id]
  return c && Date.now() - c.t < URL_TTL ? c.url : ''
}

// 预览：图片 / 视频用 previewMedia（同记录内可左右滑），PDF 下载后 openDocument
export async function previewAttachment(att, list) {
  // #ifdef MP-WEIXIN
  if (att.type === 'pdf') {
    try {
      uni.showLoading({ title: '打开文档…', mask: true })
      let path = pdfCache[att.fileID]
      if (!path) {
        const r = await new Promise((resolve, reject) =>
          wx.cloud.downloadFile({ fileID: att.fileID, success: resolve, fail: reject })
        )
        path = r.tempFilePath
        pdfCache[att.fileID] = path
      }
      uni.hideLoading()
      // openDocument 是回调式 API，失败不会 throw（外层 try/catch 接不住）：必须给 fail 回调，
      // 并清掉 pdfCache，否则缓存的临时路径失效后每次点击都静默命中死路径（评审 medium）。
      wx.openDocument({
        filePath: path,
        fileType: 'pdf',
        showMenu: true,
        fail: () => {
          delete pdfCache[att.fileID]
          uni.showToast({ title: '文档打开失败', icon: 'none' })
        },
      })
    } catch (e) {
      uni.hideLoading()
      uni.showToast({ title: '文档打开失败', icon: 'none' })
    }
    return
  }
  // 图片 + 视频混合预览；只换当前记录里媒体类附件的链（仅换缓存缺失 / 已过期的）
  const media = (list || [att]).filter((a) => a.type !== 'pdf')
  const need = media.map((a) => a.fileID).filter((id) => !freshUrl(id))
  try {
    if (need.length) {
      const res = await new Promise((resolve, reject) =>
        wx.cloud.getTempFileURL({ fileList: need, success: resolve, fail: reject })
      )
      for (const f of res.fileList || []) if (f.status === 0) urlCache[f.fileID] = { url: f.tempFileURL, t: Date.now() }
    }
    const sources = media
      .filter((a) => freshUrl(a.fileID))
      .map((a) => ({ url: freshUrl(a.fileID), type: a.type === 'video' ? 'video' : 'image' }))
    if (!sources.length) throw new Error('no url')
    const current = Math.max(0, media.filter((a) => freshUrl(a.fileID)).findIndex((a) => a.fileID === att.fileID))
    wx.previewMedia({ sources, current })
  } catch (e) {
    uni.showToast({ title: '附件加载失败', icon: 'none' })
  }
  // #endif
}
