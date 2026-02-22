<template>
  <view class="base-page-header">
    <text class="base-page-header__title">{{ title }}</text>
    <text v-if="subtitle" class="base-page-header__subtitle">{{ subtitle }}</text>
  </view>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
})
</script>

<style scoped>
.base-page-header {
  padding: 8rpx 4rpx 24rpx;
}

.base-page-header__title {
  font-size: 40rpx;
  font-weight: 600;
  color: #333333;
}

.base-page-header__subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #999999;
}
</style>
