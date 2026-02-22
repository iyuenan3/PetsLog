<template>
  <view class="page">
    <base-page-header title="记录列表" subtitle="查看每一次为孩子们记下的小事" />

    <view v-if="!isLoggedIn" class="empty-tip">
      <text>请先登录后使用</text>
    </view>

    <base-card v-else-if="records.length === 0" :no-margin="true">
      <text class="empty-text">暂时还没有记录。在「记录」里为毛孩子们添加记录吧。</text>
    </base-card>

    <scroll-view v-else class="list-scroll" scroll-y>
      <base-card
        v-for="item in records"
        :key="item._id"
        :title="(item.pet_name || '') + ' · ' + eventTypeLabel(item.event_type)"
        :no-margin="false"
      >
        <view v-if="editingId === item._id">
          <view class="row">
            <text class="label">事件类型</text>
            <picker :value="eventTypeOptions.findIndex(x => x.value === editEventType)" :range="eventTypeOptions" range-key="label" @change="(e) => (editEventType = eventTypeOptions[e.detail.value].value)">
              <view class="picker-value">{{ eventTypeOptions.find(x => x.value === editEventType)?.label }}</view>
            </picker>
          </view>
          <view class="row" v-if="editEventType === 'other'">
            <text class="label">事件描述</text>
            <input v-model="editEventDesc" class="input" placeholder="必填" placeholder-class="ph" />
          </view>
          <view class="row" v-if="editEventType === 'weigh'">
            <text class="label">体重(kg)</text>
            <input v-model="editWeight" class="input" type="digit" placeholder="必填" placeholder-class="ph" />
          </view>
          <view class="row">
            <text class="label">日期</text>
            <picker mode="date" :value="editDate" @change="(e) => (editDate = e.detail.value)">
              <view class="picker-value">{{ editDate }}</view>
            </picker>
          </view>
          <view class="row">
            <text class="label">时间</text>
            <picker mode="time" :value="editTime" @change="(e) => (editTime = e.detail.value)">
              <view class="picker-value">{{ editTime }}</view>
            </picker>
          </view>
          <view class="row" v-if="editEventType !== 'other'">
            <text class="label">描述/备注</text>
            <input v-model="editEventDesc" class="input input--remark" placeholder="选填" placeholder-class="ph" />
          </view>
          <view class="btn-row">
            <base-button type="secondary" size="small" @click="cancelEdit">取消</base-button>
            <base-button type="primary" size="small" :disabled="!canSaveEdit" @click="saveEdit(item)">保存</base-button>
          </view>
        </view>
        <view v-else>
          <view class="row">
            <text class="label">时间</text>
            <text class="value">{{ item.date }} {{ item.time }}</text>
          </view>
          <view class="row" v-if="item.event_desc">
            <text class="label">描述</text>
            <text class="value">{{ item.event_desc }}</text>
          </view>
          <view class="row" v-if="item.weight != null">
            <text class="label">体重</text>
            <text class="value">{{ item.weight }} kg</text>
          </view>
          <view class="row" v-if="item.event_desc && editingId !== item._id">
            <text class="label">描述</text>
            <text class="value">{{ item.event_desc }}</text>
          </view>
          <view class="btn-row">
            <base-button type="text" size="small" @click="startEdit(item)">修改</base-button>
            <base-button type="text" size="small" @click="deleteRecord(item)">删除</base-button>
          </view>
        </view>
      </base-card>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
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
const eventTypeLabels = eventTypeOptions

function eventTypeLabel(v) {
  return eventTypeOptions.find(x => x.value === v)?.label || v
}

const records = ref([])
const editingId = ref('')
const editEventType = ref('')
const editDate = ref('')
const editTime = ref('')
const editEventDesc = ref('')
const editWeight = ref('')

const isLoggedIn = computed(() => !!getStoredUserId() && !!getStoredFamilyId())

const canSaveEdit = computed(() => {
  if (editEventType.value === 'other') return !!String(editEventDesc.value).trim()
  if (editEventType.value === 'weigh') return editWeight.value !== '' && editWeight.value != null
  return true
})

function loadRecords() {
  const uid = getStoredUserId()
  const fid = getStoredFamilyId()
  if (!uid || !fid) {
    records.value = []
    return
  }
  uniCloud.callFunction({
    name: 'record-list',
    data: { family_id: fid, user_id: uid, limit: 200 }
  }).then(res => {
    const d = res.result || {}
    records.value = (d.code === 0 && d.data) ? d.data : []
  }).catch(() => { records.value = [] })
}

function startEdit(item) {
  editingId.value = item._id
  editEventType.value = item.event_type || 'weigh'
  editDate.value = item.date || ''
  editTime.value = item.time || ''
  editEventDesc.value = item.event_desc || ''
  editWeight.value = item.weight != null ? String(item.weight) : ''
}

function cancelEdit() {
  editingId.value = ''
}

async function saveEdit(item) {
  if (!canSaveEdit.value) {
    uni.showToast({ title: editEventType.value === 'weigh' ? '请填写体重' : '请填写事件描述', icon: 'none' })
    return
  }
  const uid = getStoredUserId()
  const fid = getStoredFamilyId()
  if (!uid || !fid) return
  try {
    const res = await uniCloud.callFunction({
      name: 'record-update',
      data: {
        family_id: fid,
        user_id: uid,
        record_id: item._id,
        event_type: editEventType.value,
        date: editDate.value,
        time: editTime.value,
        event_desc: editEventDesc.value,
        weight: editEventType.value === 'weigh' ? Number(editWeight.value) : undefined
      }
    })
    const d = res.result || {}
    if (d.code === 0) {
      editingId.value = ''
      loadRecords()
      uni.showToast({ title: '已更新', icon: 'success' })
    } else {
      uni.showToast({ title: d.message || '更新失败', icon: 'none' })
    }
  } catch (e) {
    uni.showToast({ title: '更新失败', icon: 'none' })
  }
}

function deleteRecord(item) {
  uni.showModal({
    title: '删除确认',
    content: '确定要删除这条记录吗？',
    success(res) {
      if (!res.confirm) return
      const uid = getStoredUserId()
      const fid = getStoredFamilyId()
      if (!uid || !fid) return
      uniCloud.callFunction({
        name: 'record-remove',
        data: { family_id: fid, user_id: uid, record_id: item._id }
      }).then(r => {
        const d = r.result || {}
        if (d.code === 0) {
          loadRecords()
          uni.showToast({ title: '已删除', icon: 'success' })
        } else {
          uni.showToast({ title: d.message || '删除失败', icon: 'none' })
        }
      }).catch(() => uni.showToast({ title: '删除失败', icon: 'none' }))
    }
  })
}

onShow(loadRecords)
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
.list-scroll {
  max-height: calc(100vh - 140rpx);
}
.row { display: flex; align-items: center; margin-bottom: 8rpx; }
.label { width: 120rpx; font-size: 24rpx; color: #999; }
.value { flex: 1; font-size: 26rpx; color: #333; }
.empty-text { font-size: 24rpx; color: #999; line-height: 1.6; }
.input { flex: 1; height: 64rpx; padding: 0 16rpx; font-size: 28rpx; background: #f8f9fa; border-radius: 12rpx; }
.input--remark { margin-left: 16rpx; }
.ph { color: #999; }
.picker-value { flex: 1; font-size: 28rpx; padding: 16rpx; background: #f8f9fa; border-radius: 12rpx; }
.btn-row { margin-top: 16rpx; }
</style>
