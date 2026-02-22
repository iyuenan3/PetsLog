<template>
  <view
    class="base-button"
    :class="[
      `base-button--${type}`,
      sizeClass,
      { 'base-button--disabled': disabled, 'base-button--loading': loading }
    ]"
    @click="onClick"
  >
    <text v-if="loading" class="base-button__loading">提交中...</text>
    <slot v-else />
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** 按钮类型：primary 主色填充，secondary 辅色描边，text 文字按钮 */
  type: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'secondary', 'text'].includes(v)
  },
  /** 尺寸：medium / small */
  size: { type: String, default: 'medium', validator: (v) => ['medium', 'small'].includes(v) },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['click'])

const sizeClass = computed(() => `base-button--${props.size}`)

function onClick() {
  if (props.disabled || props.loading) return
  emit('click')
}
</script>

<style scoped>
.base-button {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  border-radius: 24rpx;
  font-size: 28rpx;
  font-weight: 500;
}

/* primary：暖黄主色 */
.base-button--primary {
  background-color: #ffb800;
  color: #333333;
  border: none;
}

.base-button--primary.base-button--disabled {
  background-color: #ffd966;
  color: #999999;
}

/* secondary：墨绿描边 */
.base-button--secondary {
  background-color: transparent;
  color: #2c5e4e;
  border: 2rpx solid #2c5e4e;
}

.base-button--secondary.base-button--disabled {
  border-color: #a8c4bc;
  color: #999999;
}

/* text：无边框，辅色文字 */
.base-button--text {
  background-color: transparent;
  color: #2c5e4e;
  border: none;
}

.base-button--text.base-button--disabled {
  color: #999999;
}

/* 尺寸 */
.base-button--medium {
  height: 80rpx;
  padding-left: 32rpx;
  padding-right: 32rpx;
  min-width: 160rpx;
}

.base-button--small {
  height: 56rpx;
  padding-left: 20rpx;
  padding-right: 20rpx;
  font-size: 24rpx;
  min-width: 100rpx;
}

.base-button--disabled {
  opacity: 0.7;
}

.base-button__loading {
  font-size: 28rpx;
  color: inherit;
}
</style>
