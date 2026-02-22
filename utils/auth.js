/**
 * 登录与家庭状态：供各页面使用
 * 存储：petslog_user_id, petslog_family_id
 */
const STORAGE_UID = 'petslog_user_id'
const STORAGE_FAMILY_ID = 'petslog_family_id'
const STORAGE_FAMILY_NAME = 'petslog_family_name'

export function getStoredUserId() {
  return uni.getStorageSync(STORAGE_UID) || ''
}

export function getStoredFamilyId() {
  return uni.getStorageSync(STORAGE_FAMILY_ID) || ''
}

export function getStoredFamilyName() {
  return uni.getStorageSync(STORAGE_FAMILY_NAME) || ''
}

export function setStoredUserId(uid) {
  if (uid) uni.setStorageSync(STORAGE_UID, uid)
  else uni.removeStorageSync(STORAGE_UID)
}

export function setStoredFamilyId(familyId) {
  if (familyId) uni.setStorageSync(STORAGE_FAMILY_ID, familyId)
  else uni.removeStorageSync(STORAGE_FAMILY_ID)
}

export function setStoredFamilyName(name) {
  if (name != null && name !== '') uni.setStorageSync(STORAGE_FAMILY_NAME, String(name))
  else uni.removeStorageSync(STORAGE_FAMILY_NAME)
}

/**
 * 登录（微信手机号 code）→ 存 uid
 */
export function loginWithPhoneCode(code) {
  return new Promise((resolve, reject) => {
    uniCloud.callFunction({
      name: 'auth-login',
      data: { code }
    }).then(res => {
      const data = res.result || {}
      if (data.code === 0 && data.data && data.data.uid) {
        setStoredUserId(data.data.uid)
        resolve(data.data)
      } else {
        reject(new Error(data.message || '登录失败'))
      }
    }).catch(e => reject(e))
  })
}

/**
 * 登出：清除本地
 */
export function logout() {
  setStoredUserId('')
  setStoredFamilyId('')
  setStoredFamilyName('')
}

/**
 * 更新家庭名称（需先有 family_id）
 */
export function updateFamilyName(name) {
  const uid = getStoredUserId()
  const familyId = getStoredFamilyId()
  if (!uid || !familyId) return Promise.reject(new Error('请先登录'))
  return uniCloud.callFunction({
    name: 'family-update',
    data: { family_id: familyId, user_id: uid, name: String(name).trim() }
  }).then(res => {
    const data = res.result || {}
    if (data.code === 0) {
      setStoredFamilyName(String(name).trim())
      return data.data
    }
    return Promise.reject(new Error(data.message || '更新失败'))
  })
}

/**
 * 获取当前用户家庭列表；若无则返回 []，并应引导创建家庭
 */
export function fetchMyFamilies() {
  const uid = getStoredUserId()
  if (!uid) return Promise.resolve([])
  return uniCloud.callFunction({
    name: 'family-my',
    data: { user_id: uid }
  }).then(res => {
    const data = res.result || {}
    if (data.code === 0 && Array.isArray(data.data)) return data.data
    return []
  }).catch(() => [])
}

/**
 * 创建家庭并设为当前家庭
 */
export function createFamily(name) {
  const uid = getStoredUserId()
  if (!uid) return Promise.reject(new Error('请先登录'))
  return uniCloud.callFunction({
    name: 'family-create',
    data: { name: String(name).trim(), user_id: uid }
  }).then(res => {
    const data = res.result || {}
    if (data.code === 0 && data.data && data.data._id) {
      setStoredFamilyId(data.data._id)
      setStoredFamilyName(data.data.name || name.trim())
      return data.data
    }
    return Promise.reject(new Error(data.message || '创建失败'))
  })
}

/**
 * 获取当前家庭宠物数量（用于判断是否需要添加第一只宠物）
 */
export function fetchPetCount() {
  const uid = getStoredUserId()
  const familyId = getStoredFamilyId()
  if (!uid || !familyId) return Promise.resolve(0)
  return uniCloud.callFunction({
    name: 'pet-list',
    data: { family_id: familyId, user_id: uid }
  }).then(res => {
    const data = res.result || {}
    if (data.code === 0 && Array.isArray(data.data)) return data.data.length
    return 0
  }).catch(() => 0)
}
