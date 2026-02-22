<template>
  <view v-if="visible" class="mask" @click.stop>
    <view class="modal modal--scroll">
      <text class="modal-title">添加主粮</text>
      <text class="modal-desc">品牌、食用对象、起始日期为必填</text>
      <view class="form">
        <view class="row">
          <text class="label">品牌</text>
          <input v-model="form.brand" class="input" type="text" placeholder="如皇家、渴望" placeholder-class="ph" />
        </view>
        <view class="row">
          <text class="label">型号/口味</text>
          <input v-model="form.model" class="input" type="text" placeholder="选填" placeholder-class="ph" />
        </view>
        <view class="row">
          <text class="label">食用对象</text>
          <view class="pet-chips">
            <view
              v-for="p in pets"
              :key="p._id"
              class="pet-chip"
              :class="{ 'pet-chip--selected': form.pet_ids.includes(p._id) }"
              @click="togglePet(p._id)"
            >
              <text>{{ p.name }}</text>
            </view>
          </view>
        </view>
        <view class="row">
          <text class="label">开始日期</text>
          <picker mode="date" :value="form.start_date" @change="(e) => (form.start_date = e.detail.value)">
            <view class="picker">{{ form.start_date || '请选择' }}</view>
          </picker>
        </view>
        <view class="row">
          <text class="label">结束日期</text>
          <picker mode="date" :value="form.end_date" @change="(e) => (form.end_date = e.detail.value)">
            <view class="picker">{{ form.end_date || '不填表示至今' }}</view>
          </picker>
        </view>
      </view>
      <view class="btn-row">
        <base-button type="secondary" size="small" @click="$emit('close')">取消</base-button>
        <base-button
          type="primary"
          size="small"
          :disabled="!canSubmit"
          :loading="loading"
          @click="onSubmit"
        >
          保存
        </base-button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { getStoredUserId, getStoredFamilyId } from '@/utils/auth.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  pets: { type: Array, default: () => [] }
})

const emit = defineEmits(['success', 'close'])

const form = ref({
  brand: '',
  model: '',
  pet_ids: [],
  start_date: '',
  end_date: ''
})
const loading = ref(false)

const canSubmit = computed(() => {
  return form.value.brand.trim() && form.value.pet_ids.length > 0 && form.value.start_date
})

watch(() => props.visible, (v) => {
  if (v) {
    form.value = { brand: '', model: '', pet_ids: [], start_date: '', end_date: '' }
  }
})

function togglePet(id) {
  const idx = form.value.pet_ids.indexOf(id)
  if (idx === -1) {
    form.value.pet_ids = [...form.value.pet_ids, id]
  } else {
    form.value.pet_ids = form.value.pet_ids.filter(x => x !== id)
  }
}

async function onSubmit() {
  if (!canSubmit.value) return
  const uid = getStoredUserId()
  const fid = getStoredFamilyId()
  if (!uid || !fid) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  loading.value = true
  try {
    const res = await uniCloud.callFunction({
      name: 'staple-food-add',
      data: {
        family_id: fid,
        user_id: uid,
        brand: form.value.brand.trim(),
        model: (form.value.model || '').trim(),
        pet_ids: form.value.pet_ids,
        start_date: form.value.start_date,
        end_date: (form.value.end_date || '').trim() || undefined
      }
    })
    const d = res.result || {}
    if (d.code === 0) {
      uni.showToast({ title: '添加成功', icon: 'success' })
      emit('success')
      emit('close')
    } else {
      uni.showToast({ title: d.message || '添加失败', icon: 'none' })
    }
  } catch (e) {
    uni.showToast({ title: e.message || '添加失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.modal {
  width: 560rpx;
  max-height: 80vh;
  background: #fff;
  border-radius: 24rpx;
  padding: 40rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.1);
}
.modal--scroll {
  overflow-y: auto;
}
.modal-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}
.modal-desc {
  font-size: 24rpx;
  color: #999;
  margin-top: 8rpx;
  display: block;
}
.form {
  margin-top: 24rpx;
}
.row {
  margin-bottom: 24rpx;
}
.label {
  display: block;
  font-size: 26rpx;
  color: #666;
  margin-bottom: 8rpx;
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
.ph { color: #999; }
.picker {
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  color: #333;
  background: #f8f9fa;
  border-radius: 16rpx;
}
.pet-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.pet-chip {
  padding: 12rpx 20rpx;
  font-size: 26rpx;
  color: #666;
  background: #f0f0f0;
  border-radius: 999rpx;
}
.pet-chip--selected {
  color: #fff;
  background: #ffb800;
}
.btn-row {
  margin-top: 32rpx;
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
}
</style>
