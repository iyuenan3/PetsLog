<template>
  <view v-if="visible" class="mask" @click.stop>
    <view class="modal">
      <text class="modal-title">修改家庭名称</text>
      <input
        v-model="name"
        class="input"
        type="text"
        placeholder="请输入家庭名称"
        placeholder-class="ph"
      />
      <view class="btn-row">
        <base-button type="secondary" size="small" @click="$emit('close')">取消</base-button>
        <base-button type="primary" size="small" :disabled="!name.trim()" :loading="loading" @click="onSubmit">保存</base-button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { updateFamilyName } from '@/utils/auth.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  currentName: { type: String, default: '' }
})

const emit = defineEmits(['success', 'close'])

const name = ref('')
const loading = ref(false)

watch(() => [props.visible, props.currentName], ([v, n]) => {
  if (v) name.value = n || ''
})

async function onSubmit() {
  if (!name.value.trim()) return
  loading.value = true
  try {
    await updateFamilyName(name.value.trim())
    emit('success')
    emit('close')
  } catch (e) {
    uni.showToast({ title: e.message || '更新失败', icon: 'none' })
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
  background: #fff;
  border-radius: 24rpx;
  padding: 40rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.1);
}
.modal-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}
.input {
  width: 100%;
  height: 80rpx;
  margin-top: 24rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  color: #333;
  background: #f8f9fa;
  border-radius: 16rpx;
  box-sizing: border-box;
}
.ph { color: #999; }
.btn-row { margin-top: 32rpx; display: flex; justify-content: flex-end; gap: 16rpx; }
</style>
