<template>
  <view class="page">
    <base-page-header
      title="粮草库"
      subtitle="管理猫粮、狗粮与零食库存"
    />

    <base-card title="当前主粮" tag="品牌占位">
      <text class="placeholder-text">
        这里将展示每种猫粮 / 狗粮的品牌、口味、适用对象以及开封日期。
      </text>
    </base-card>

    <base-card title="用量 & 周期" tag="统计占位" tag-type="secondary">
      <text class="placeholder-text">
        未来会根据你的记录，自动估算一袋粮可以吃多久，并在快吃完时提醒补货。
      </text>
    </base-card>

    <base-card title="补货计划" :no-margin="true">
      <text class="placeholder-text">
        这里会有一个简单的清单视图，用来记录「待购买」的粮食、零食和猫砂等物资。
      </text>
      <view class="btn-wrap">
        <base-button type="secondary" size="small">添加待购</base-button>
      </view>
    </base-card>
  </view>
</template>

<script setup>
import BaseCard from '@/components/base/BaseCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePageHeader from '@/components/base/BasePageHeader.vue'
</script>

<style scoped>
.page {
  flex: 1;
  min-height: 100vh;
  background-color: #fffdf8;
  padding: 32rpx 24rpx 40rpx;
  box-sizing: border-box;
}

.placeholder-text {
  font-size: 24rpx;
  color: #999999;
  line-height: 1.5;
}

.btn-wrap {
  margin-top: 24rpx;
}
</style>
