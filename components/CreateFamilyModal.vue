<template>
  <view v-if="visible" class="mask" @click.stop>
    <view class="modal">
      <text class="modal-title">创建家庭</text>
      <text class="modal-desc">为你的毛孩子们建一个家</text>
      <input
        v-model="name"
        class="input"
        type="text"
        placeholder="请输入家庭名称，如：小明的家"
        placeholder-class="placeholder"
      />
      <view class="btn-row">
        <base-button type="primary" :disabled="!name.trim()" :loading="loading" @click="onSubmit">
          创建
        </base-button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { createFamily } from '@/utils/auth.js'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['success'])

const name = ref('')
const loading = ref(false)

watch(() => props.visible, (v) => { if (v) name.value = '' })

async function onSubmit() {
  if (!name.value.trim()) return
  loading.value = true
  try {
    await createFamily(name.value.trim())
    emit('success')
  } catch (e) {
    uni.showToast({ title: e.message || '创建失败', icon: 'none' })
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
  width: 600rpx;
  background: #fff;
  border-radius: 24rpx;
  padding: 40rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.1);
}
.modal-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #333;
}
.modal-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #999;
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
.placeholder {
  color: #999;
}
.btn-row {
  margin-top: 32rpx;
}
</style>
