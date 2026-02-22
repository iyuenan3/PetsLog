<template>
  <view class="page">
    <base-page-header title="宠物档案" subtitle="管理家里的小动物" />

    <view v-if="!isLoggedIn" class="empty-tip">
      <text>请先登录后使用</text>
    </view>

    <template v-else>
      <view class="btn-bar">
        <base-button type="primary" size="small" @click="showAddModal = true">添加宠物</base-button>
      </view>

      <view v-if="pets.length === 0" class="empty-tip">
        <text>还没有宠物，点击上方「添加宠物」</text>
        <text class="link" @click="showAddModal = true">去添加</text>
      </view>

      <scroll-view v-else class="list-scroll" scroll-y>
        <base-card
          v-for="p in pets"
          :key="p._id"
          :title="p.name"
          :tag="p.status !== 'normal' ? statusText(p.status) : '正常'"
          :tag-type="p.status === 'normal' ? 'primary' : 'secondary'"
        >
          <view class="pet-row pet-row--avatar" v-if="p.avatar">
            <text class="label">头像</text>
            <image class="pet-avatar" :src="p.avatar" mode="aspectFill" />
          </view>
          <view class="pet-row">
            <text class="label">品种</text>
            <text class="value">{{ p.breed }}</text>
          </view>
          <view class="pet-row" v-if="p.birthday">
            <text class="label">生日</text>
            <text class="value">{{ p.birthday }}</text>
          </view>
          <view class="pet-row" v-if="p.home_date">
            <text class="label">到家日</text>
            <text class="value">{{ p.home_date }}</text>
          </view>
          <view class="pet-row" v-if="p.initial_price != null && p.initial_price > 0">
            <text class="label">初始身价</text>
            <text class="value">{{ (p.initial_price / 100).toFixed(2) }} 元</text>
          </view>
          <view class="pet-row" v-if="p.intro">
            <text class="label">简介</text>
            <text class="value">{{ p.intro }}</text>
          </view>
          <view class="pet-row" v-if="p.medical_history">
            <text class="label">病史</text>
            <text class="value">{{ p.medical_history }}</text>
          </view>
          <view class="pet-row" v-if="p.remark">
            <text class="label">备注</text>
            <text class="value">{{ p.remark }}</text>
          </view>
          <view class="btn-row">
            <base-button type="text" size="small" @click="openEdit(p)">编辑</base-button>
            <base-button
              v-if="p.status === 'normal'"
              type="text"
              size="small"
              @click="setStatus(p, 'passed')"
            >
              标记去世
            </base-button>
            <base-button
              v-if="p.status === 'normal'"
              type="text"
              size="small"
              @click="setStatus(p, 'left')"
            >
              标记离家
            </base-button>
          </view>
        </base-card>
      </scroll-view>

      <add-pet-modal
        :visible="showAddModal"
        :is-first="false"
        @success="onPetAdded"
        @close="showAddModal = false"
      />
      <add-pet-modal
        :visible="!!editingPet"
        :is-first="false"
        :edit-pet="editingPet"
        @success="onPetUpdated"
        @close="editingPet = null"
      />
    </template>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePageHeader from '@/components/base/BasePageHeader.vue'
import AddPetModal from '@/components/AddPetModal.vue'
import { getStoredUserId, getStoredFamilyId } from '@/utils/auth.js'

const pets = ref([])
const showAddModal = ref(false)
const editingPet = ref(null)

const isLoggedIn = computed(() => !!getStoredUserId() && !!getStoredFamilyId())

function statusText(s) {
  return s === 'passed' ? '去世' : s === 'left' ? '离家' : ''
}

function loadPets() {
  const uid = getStoredUserId()
  const familyId = getStoredFamilyId()
  if (!uid || !familyId) {
    pets.value = []
    return
  }
  uniCloud.callFunction({
    name: 'pet-list',
    data: { family_id: familyId, user_id: uid }
  }).then(res => {
    const data = res.result || {}
    pets.value = (data.code === 0 && data.data) ? data.data : []
  }).catch(() => { pets.value = [] })
}

function openEdit(p) {
  editingPet.value = p
}

function setStatus(p, status) {
  const familyId = getStoredFamilyId()
  const uid = getStoredUserId()
  if (!familyId || !uid) return
  uni.showModal({
    title: status === 'passed' ? '标记去世' : '标记离家',
    content: '确定吗？',
    success(res) {
      if (!res.confirm) return
      uniCloud.callFunction({
        name: 'pet-update',
        data: { family_id: familyId, user_id: uid, pet_id: p._id, status }
      }).then(r => {
        const d = r.result || {}
        if (d.code === 0) loadPets()
        else uni.showToast({ title: d.message || '操作失败', icon: 'none' })
      })
    }
  })
}

function onPetAdded() {
  showAddModal.value = false
  loadPets()
}

function onPetUpdated() {
  editingPet.value = null
  loadPets()
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
.btn-bar {
  margin-bottom: 24rpx;
}
.empty-tip {
  padding: 48rpx 24rpx;
  text-align: center;
  font-size: 28rpx;
  color: #999;
}
.link {
  color: #ffb800;
  margin-left: 8rpx;
}
.list-scroll {
  max-height: calc(100vh - 200rpx);
}
.pet-row {
  display: flex;
  align-items: center;
  margin-bottom: 8rpx;
}
.pet-row--avatar {
  align-items: flex-start;
}
.pet-avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: #f0f0f0;
}
.label {
  width: 120rpx;
  font-size: 24rpx;
  color: #999;
  flex-shrink: 0;
}
.value {
  flex: 1;
  font-size: 26rpx;
  color: #333;
  word-break: break-all;
}
.btn-row {
  margin-top: 16rpx;
}
</style>
