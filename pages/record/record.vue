<template>
  <view class="page">
    <base-page-header title="添加记录" subtitle="为多只宠物快速批量录入" />

    <view v-if="!isLoggedIn" class="empty-tip">
      <text>请先登录后使用</text>
    </view>

    <template v-else-if="pets.length === 0">
      <base-card :no-margin="true">
        <text class="placeholder-text">还没有宠物，请先添加宠物后再记录</text>
        <navigator url="/pages/pet/pet" class="link">去添加宠物</navigator>
      </base-card>
    </template>

    <template v-else>
      <base-card title="选择宠物">
        <view class="pet-list">
          <view
            v-for="pet in pets"
            :key="pet._id"
            class="pet-item"
            :class="{ 'pet-item--selected': selectedPetIds.includes(pet._id) }"
            @click="togglePet(pet._id)"
          >
            <text class="pet-emoji">🐱</text>
            <text class="pet-name">{{ pet.name }}</text>
          </view>
        </view>
        <text class="hint">点击勾选/取消，可多选</text>
      </base-card>

      <base-card title="事件类型" tag-type="secondary">
        <view class="event-type-row">
          <view
            v-for="opt in eventTypeOptions"
            :key="opt.value"
            class="event-type-pill"
            :class="{ 'event-type-pill--active': eventType === opt.value }"
            @click="eventType = opt.value"
          >
            <text>{{ opt.label }}</text>
          </view>
        </view>
      </base-card>

      <base-card title="事件描述" v-if="eventType === 'other'">
        <input
          v-model="eventDesc"
          class="input"
          type="text"
          placeholder="必填：请描述事件"
          placeholder-class="input-placeholder"
        />
      </base-card>

      <base-card title="体重(kg)">
        <input
          v-model="weight"
          class="input"
          type="digit"
          :placeholder="eventType === 'weigh' ? '必填：称重数值，如 4.25' : '选填（称重时必填）'"
          placeholder-class="input-placeholder"
        />
      </base-card>

      <base-card title="附件" v-if="true">
        <view class="attach-list">
          <view v-for="(f, i) in attachmentList" :key="i" class="attach-item">
            <text class="attach-name">{{ f.name || '附件' + (i + 1) }}</text>
            <text class="attach-del" @click="removeAttachment(i)">删除</text>
          </view>
        </view>
        <base-button
          v-if="attachmentList.length < 5"
          type="secondary"
          size="small"
          :disabled="uploading"
          @click="onAddAttachment"
        >
          {{ uploading ? '上传中…' : '添加附件（最多5个，单文件≤10MB）' }}
        </base-button>
      </base-card>

      <base-card title="时间 & 备注" :no-margin="true">
        <view class="row">
          <text class="label">日期</text>
          <picker mode="date" :value="recordDate" @change="(e) => (recordDate = e.detail.value)">
            <view class="picker-value">{{ recordDate }}</view>
          </picker>
        </view>
        <view class="row">
          <text class="label">时间</text>
          <picker mode="time" :value="recordTime" @change="(e) => (recordTime = e.detail.value)">
            <view class="picker-value">{{ recordTime }}</view>
          </picker>
        </view>
        <view class="row">
          <text class="label">用药</text>
          <input v-model="medicine" class="input input--sm" placeholder="选填" placeholder-class="ph" />
        </view>
        <view class="row">
          <text class="label">就诊医院</text>
          <input v-model="hospital" class="input input--sm" placeholder="选填" placeholder-class="ph" />
        </view>
        <view class="row">
          <text class="label">费用(元)</text>
          <input v-model="costYuan" class="input input--sm" type="digit" placeholder="选填" placeholder-class="ph" />
        </view>
        <view class="row row--remark">
          <text class="label">备注</text>
          <input v-model="remark" class="input input--remark" placeholder="选填" placeholder-class="ph" />
        </view>
        <view class="btn-wrap">
          <base-button
            type="primary"
            :disabled="!canSubmit"
            :loading="submitting"
            @click="onSubmit"
          >
            保存记录
          </base-button>
        </view>
      </base-card>
    </template>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePageHeader from '@/components/base/BasePageHeader.vue'
import { getStoredUserId, getStoredFamilyId } from '@/utils/auth.js'

const eventTypeOptions = [
  { value: 'vomit', label: '呕吐' },
  { value: 'diarrhea', label: '拉稀' },
  { value: 'blood_stool', label: '便血' },
  { value: 'clinic', label: '就诊' },
  { value: 'weigh', label: '称重' },
  { value: 'deworm', label: '驱虫' },
  { value: 'neuter', label: '绝育' },
  { value: 'vaccine', label: '疫苗' },
  { value: 'other', label: '其他' }
]

const pets = ref([])
const selectedPetIds = ref([])
const eventType = ref('weigh')
const eventDesc = ref('')
const weight = ref('')
const recordDate = ref('')
const recordTime = ref('')
const medicine = ref('')
const hospital = ref('')
const costYuan = ref('')
const remark = ref('')
const submitting = ref(false)
const attachmentList = ref([]) // { fileID, name }
const uploading = ref(false)
const MAX_ATTACHMENTS = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const isLoggedIn = computed(() => !!getStoredUserId() && !!getStoredFamilyId())

function initDateTime() {
  const d = new Date()
  recordDate.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  recordTime.value = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}
initDateTime()

function togglePet(id) {
  const i = selectedPetIds.value.indexOf(id)
  if (i >= 0) selectedPetIds.value = selectedPetIds.value.filter(x => x !== id)
  else selectedPetIds.value = [...selectedPetIds.value, id]
}

const canSubmit = computed(() => {
  if (selectedPetIds.value.length === 0) return false
  if (!recordDate.value || !recordTime.value) return false
  if (eventType.value === 'other') return !!String(eventDesc.value).trim()
  if (eventType.value === 'weigh') return weight.value !== '' && weight.value != null
  return true
})

async function onAddAttachment() {
  if (attachmentList.value.length >= MAX_ATTACHMENTS) {
    uni.showToast({ title: '最多添加 ' + MAX_ATTACHMENTS + ' 个附件', icon: 'none' })
    return
  }
  try {
    const res = await new Promise((resolve, reject) => {
      uni.chooseMessageFile({
        count: Math.min(MAX_ATTACHMENTS - attachmentList.value.length, 5),
        type: 'all',
        success: resolve,
        fail: reject
      })
    })
    const files = res.tempFiles || []
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        uni.showToast({ title: '单个文件不能超过10MB', icon: 'none' })
        continue
      }
      uploading.value = true
      const up = await uniCloud.uploadFile({
        filePath: f.path,
        cloudPath: 'record/' + Date.now() + '-' + (f.name || 'file')
      })
      attachmentList.value.push({ fileID: up.fileID, name: f.name })
    }
  } catch (e) {
    if (e.errMsg && !e.errMsg.includes('cancel')) uni.showToast({ title: '选择失败', icon: 'none' })
  } finally {
    uploading.value = false
  }
}

function removeAttachment(i) {
  attachmentList.value = attachmentList.value.filter((_, idx) => idx !== i)
}

function loadPets() {
  const uid = getStoredUserId()
  const fid = getStoredFamilyId()
  if (!uid || !fid) return
  uniCloud.callFunction({
    name: 'pet-list',
    data: { family_id: fid, user_id: uid, status: 'normal' }
  }).then(res => {
    const d = res.result || {}
    pets.value = (d.code === 0 && d.data) ? d.data : []
  }).catch(() => { pets.value = [] })
}

async function onSubmit() {
  if (!canSubmit.value) {
    if (selectedPetIds.value.length === 0) uni.showToast({ title: '请至少选择一只宠物', icon: 'none' })
    else if (eventType.value === 'other' && !eventDesc.value.trim()) uni.showToast({ title: '请填写事件描述', icon: 'none' })
    else if (eventType.value === 'weigh' && (weight.value === '' || weight.value == null)) uni.showToast({ title: '请填写体重', icon: 'none' })
    return
  }

  const uid = getStoredUserId()
  const fid = getStoredFamilyId()
  if (!uid || !fid) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }

  submitting.value = true
  const cost = costYuan.value !== '' && costYuan.value != null ? Math.round(parseFloat(costYuan.value) * 100) : undefined
  try {
    const res = await uniCloud.callFunction({
      name: 'record-add',
      data: {
        family_id: fid,
        user_id: uid,
        pet_ids: selectedPetIds.value,
        event_type: eventType.value,
        date: recordDate.value,
        time: recordTime.value,
        event_desc: [eventDesc.value.trim(), remark.value.trim()].filter(Boolean).join(' ') || '',
        weight: weight.value !== '' && weight.value != null ? Number(weight.value) : undefined,
        medicine: medicine.value || '',
        hospital: hospital.value || '',
        cost,
        attachments: attachmentList.value.map(a => a.fileID).slice(0, MAX_ATTACHMENTS)
      }
    })
    const data = res.result || {}
    if (data.code === 0) {
      selectedPetIds.value = []
      eventDesc.value = ''
      weight.value = ''
      remark.value = ''
      medicine.value = ''
      hospital.value = ''
      costYuan.value = ''
      attachmentList.value = []
      initDateTime()
      uni.showToast({ title: `已记录 ${data.data?.count || 0} 条`, icon: 'success' })
    } else {
      uni.showToast({ title: data.message || '保存失败', icon: 'none' })
    }
  } catch (e) {
    uni.showToast({ title: '保存失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

onMounted(loadPets)
onShow(loadPets)
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #fffdf8;
  padding: 32rpx 24rpx 40rpx;
}
.empty-tip {
  padding: 48rpx 24rpx;
  text-align: center;
  font-size: 28rpx;
  color: #999;
}
.placeholder-text {
  font-size: 24rpx;
  color: #999;
}
.link {
  display: block;
  margin-top: 16rpx;
  font-size: 28rpx;
  color: #ffb800;
}
.pet-list {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.pet-item {
  display: flex;
  align-items: center;
  padding: 12rpx 20rpx;
  border-radius: 999rpx;
  border: 2rpx solid #e8e8e8;
  background: #f8f9fa;
}
.pet-item--selected {
  border-color: #ffb800;
  background: #fff4d6;
}
.pet-emoji { font-size: 28rpx; margin-right: 8rpx; }
.pet-name { font-size: 26rpx; color: #333; }
.hint { display: block; margin-top: 16rpx; font-size: 22rpx; color: #999; }
.event-type-row { display: flex; flex-wrap: wrap; gap: 12rpx; }
.event-type-pill {
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  background: #f3f4f6;
  font-size: 24rpx;
  color: #666;
}
.event-type-pill--active {
  background: #ffb800;
  color: #333;
}
.input {
  width: 100%;
  height: 72rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  color: #333;
  background: #f8f9fa;
  border-radius: 16rpx;
  box-sizing: border-box;
}
.input--sm { height: 64rpx; }
.input--remark { flex: 1; margin-left: 16rpx; height: 64rpx; }
.input-placeholder, .ph { color: #999; }
.row {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}
.row--remark { margin-bottom: 0; }
.label { width: 140rpx; font-size: 26rpx; color: #666; flex-shrink: 0; }
.picker-value {
  flex: 1;
  font-size: 28rpx;
  color: #333;
  padding: 16rpx 20rpx;
  background: #f8f9fa;
  border-radius: 16rpx;
}
.btn-wrap { margin-top: 32rpx; }
.attach-list { margin-bottom: 16rpx; }
.attach-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;
  font-size: 26rpx;
  color: #333;
}
.attach-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attach-del { color: #ff6b6b; margin-left: 16rpx; }
</style>
