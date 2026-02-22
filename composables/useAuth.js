import { ref, computed } from 'vue'
import {
  getStoredUserId,
  getStoredFamilyId,
  setStoredFamilyId,
  setStoredFamilyName,
  getStoredFamilyName,
  fetchMyFamilies,
  fetchPetCount
} from '@/utils/auth.js'

const isLoggedIn = ref(false)
const needCreateFamily = ref(false)
const needAddFirstPet = ref(false)
const initDone = ref(false)
const familyName = ref('')

export function useAuth() {
  const userId = computed(() => getStoredUserId())
  const familyId = computed(() => getStoredFamilyId())

  async function init() {
    const uid = getStoredUserId()
    isLoggedIn.value = !!uid
    needCreateFamily.value = false
    needAddFirstPet.value = false

    if (!uid) {
      familyName.value = ''
      initDone.value = true
      return
    }

    const families = await fetchMyFamilies()
    if (families.length === 0) {
      needCreateFamily.value = true
      setStoredFamilyId('')
      setStoredFamilyName('')
      familyName.value = ''
      initDone.value = true
      return
    }

    let fid = getStoredFamilyId()
    if (!fid || !families.find(f => f._id === fid)) {
      fid = families[0]._id
      setStoredFamilyId(fid)
    }
    const current = families.find(f => f._id === fid)
    if (current && current.name) {
      setStoredFamilyName(current.name)
      familyName.value = current.name
    } else {
      familyName.value = getStoredFamilyName()
    }

    const count = await fetchPetCount()
    if (count === 0) {
      needAddFirstPet.value = true
    }
    initDone.value = true
  }

  function setNeedCreateFamily(v) {
    needCreateFamily.value = v
  }

  function setNeedAddFirstPet(v) {
    needAddFirstPet.value = v
  }

  /** 仅刷新家庭名称（编辑家庭名称成功后调用，使界面立即更新） */
  function refreshFamilyName() {
    familyName.value = getStoredFamilyName()
  }

  return {
    isLoggedIn,
    needCreateFamily,
    needAddFirstPet,
    initDone,
    userId,
    familyId,
    familyName,
    init,
    setNeedCreateFamily,
    setNeedAddFirstPet,
    refreshFamilyName
  }
}
