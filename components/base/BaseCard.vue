<template>
  <view class="base-card" :class="{ 'base-card--no-margin': noMargin }">
    <view v-if="hasHeader" class="base-card__header">
      <text v-if="title" class="base-card__title">{{ title }}</text>
      <slot name="tag">
        <text v-if="tag" class="base-card__tag" :class="tagClass">{{ tag }}</text>
      </slot>
    </view>
    <view class="base-card__body">
      <slot />
    </view>
  </view>
</template>

<script setup>
import { computed, useSlots } from 'vue'

const props = defineProps({
  /** 卡片标题 */
  title: { type: String, default: '' },
  /** 右侧标签文案（主色/辅色由 tagType 控制） */
  tag: { type: String, default: '' },
  /** 标签样式：primary 暖黄，secondary 墨绿 */
  tagType: { type: String, default: 'primary', validator: (v) => ['primary', 'secondary'].includes(v) },
  /** 是否去掉底部外边距（用于最后一屏卡片） */
  noMargin: { type: Boolean, default: false }
})

const slots = useSlots()
const hasHeader = computed(() => !!(props.title || props.tag || slots.tag))
const tagClass = computed(() =>
  props.tagType === 'secondary' ? 'base-card__tag--secondary' : ''
)
</script>

<style scoped>
.base-card {
  background-color: #ffffff;
  border-radius: 24rpx;
  padding: 24rpx 24rpx 28rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.05);
}

.base-card--no-margin {
  margin-bottom: 0;
}

.base-card__header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.base-card__title {
  font-size: 30rpx;
  font-weight: 500;
  color: #2c5e4e;
}

.base-card__tag {
  font-size: 22rpx;
  color: #ffb800;
  background-color: #fff4d6;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
}

.base-card__tag--secondary {
  color: #2c5e4e;
  background-color: #e3f3ee;
}

.base-card__body {
  margin-top: 4rpx;
}
</style>
