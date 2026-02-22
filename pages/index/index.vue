<template>
  <view class="page">
    <base-page-header
      :title="'PetsLog · 首页'"
      :subtitle="homeSubtitle"
    />
    <view v-if="auth.isLoggedIn.value && auth.familyName.value && !auth.needCreateFamily.value && !auth.needAddFirstPet.value" class="edit-family-wrap">
      <text class="edit-family-btn" @click="showEditFamily = true">编辑家庭名称</text>
    </view>

    <!-- 未登录：预览 + 登录按钮 -->
    <template v-if="!auth.isLoggedIn.value">
      <view class="preview-tip">
        <text class="tip-text">登录后即可使用完整功能</text>
        <button
          class="login-btn"
          open-type="getPhoneNumber"
          @getphonenumber="onGetPhoneNumber"
        >
          微信手机号登录
        </button>
        <view class="dev-login" @click="onDevLogin">
          <text class="dev-login-text">模拟登录（仅开发用）</text>
        </view>
      </view>
      <view class="preview-placeholder">
        <base-card title="体重趋势" tag="预览">
          <view class="chart-placeholder">
            <text class="placeholder-text">登录后展示体重数据</text>
          </view>
        </base-card>
        <base-card title="我的小动物们" tag="预览">
          <text class="placeholder-text">登录并添加宠物后显示</text>
        </base-card>
        <base-card title="当前主粮" tag="预览">
          <text class="placeholder-text">登录后管理主粮</text>
        </base-card>
        <base-card title="历史主粮" :no-margin="true">
          <text class="placeholder-text">登录后查看</text>
        </base-card>
      </view>
    </template>

    <!-- 已登录：无家庭则弹创建家庭（不可关闭） -->
    <template v-else-if="auth.needCreateFamily.value">
      <create-family-modal :visible="true" @success="onFamilyCreated" />
      <view class="preview-placeholder">
        <text class="placeholder-text">请先创建家庭</text>
      </view>
    </template>

    <!-- 已登录有家庭：无宠物则弹添加第一只宠物（不可关闭） -->
    <template v-else-if="auth.needAddFirstPet.value">
      <add-pet-modal :visible="true" :is-first="true" @success="onFirstPetAdded" />
      <view class="preview-placeholder">
        <text class="placeholder-text">请添加第一只宠物</text>
      </view>
    </template>

    <!-- 已登录 + 有家庭 + 有宠物：真实数据 -->
    <template v-else>
      <scroll-view class="page-scroll" scroll-y>
        <base-card title="体重趋势" tag="近1年">
          <view class="chart-placeholder">
            <text v-if="weightRecords.length === 0" class="placeholder-text">暂无体重记录，在「记录」里选择事件类型「称重」并填写体重</text>
            <view v-else class="weight-chart-wrap">
              <view v-for="(r, i) in weightChartList" :key="r._id || i" class="weight-row">
                <text class="weight-date">{{ r.date }}</text>
                <text class="weight-pet">{{ r.pet_name || '—' }}</text>
                <text class="weight-num">{{ r.weight }}{{ r.unit || 'kg' }}</text>
                <view class="weight-bar-bg">
                  <view class="weight-bar" :style="{ width: weightBarPercent(r) + '%' }" />
                </view>
              </view>
            </view>
          </view>
        </base-card>

        <base-card title="我的小动物们">
          <view class="pet-pill-row">
            <view
              v-for="p in pets"
              :key="p._id"
              class="pet-pill"
              :class="p.status === 'normal' ? 'cat-pill' : 'dog-pill'"
            >
              <text class="pet-emoji">🐱</text>
              <text class="pet-name">{{ p.name }}</text>
            </view>
          </view>
          <navigator url="/pages/pet/pet" class="link-text">管理宠物档案</navigator>
        </base-card>

        <base-card title="当前主粮" tag="粮草">
          <text v-if="stapleList.length === 0" class="placeholder-text">暂无主粮记录</text>
          <view v-else>
            <view v-for="s in currentStaple" :key="s._id" class="staple-item">
              <text class="staple-name">{{ s.brand }} {{ s.model }}</text>
              <text class="staple-date">{{ s.start_date }} 至今</text>
            </view>
          </view>
          <view class="btn-wrap">
            <base-button type="primary" size="small" @click="showAddStaple = true">添加主粮</base-button>
          </view>
        </base-card>

        <base-card title="历史主粮" :no-margin="true">
          <text v-if="stapleList.length === 0" class="placeholder-text">暂无</text>
          <view v-else>
            <view v-for="s in pastStaple" :key="s._id" class="staple-item">
              <text class="staple-name">{{ s.brand }} {{ s.model }}</text>
              <text class="staple-date">{{ s.start_date }} → {{ s.end_date || '至今' }}</text>
            </view>
          </view>
        </base-card>
      </scroll-view>
    </template>

    <edit-family-modal
      :visible="showEditFamily"
      :current-name="auth.familyName.value"
      @success="onEditFamilySuccess"
      @close="showEditFamily = false"
    />
    <add-staple-modal
      :visible="showAddStaple"
      :pets="pets"
      @success="onStapleAdded"
      @close="showAddStaple = false"
    />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BaseCard from '@/components/base/BaseCard.vue'
import BasePageHeader from '@/components/base/BasePageHeader.vue'
import CreateFamilyModal from '@/components/CreateFamilyModal.vue'
import AddPetModal from '@/components/AddPetModal.vue'
import EditFamilyModal from '@/components/EditFamilyModal.vue'
import AddStapleModal from '@/components/AddStapleModal.vue'
import { useAuth } from '@/composables/useAuth.js'
import { getStoredUserId, getStoredFamilyId } from '@/utils/auth.js'
import { loginWithPhoneCode } from '@/utils/auth.js'

const auth = useAuth()
const pets = ref([])
const stapleList = ref([])
const weightRecords = ref([])
const showEditFamily = ref(false)
const showAddStaple = ref(false)

const homeSubtitle = computed(() => {
  if (!auth.isLoggedIn.value) return '多宠家庭的温馨健康手账'
  const name = auth.familyName.value || '我的'
  return name + '家庭的宠物健康手帐'
})

const currentStaple = computed(() => stapleList.value.filter(s => !s.end_date))
const pastStaple = computed(() => stapleList.value.filter(s => s.end_date))

const weightChartList = computed(() => {
  const list = [...weightRecords.value]
  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return list.slice(0, 12)
})
const weightMax = computed(() => {
  if (weightRecords.value.length === 0) return 1
  return Math.max(...weightRecords.value.map(r => Number(r.weight) || 0), 1)
})
function weightBarPercent(r) {
  const v = Number(r.weight)
  if (!v || !weightMax.value) return 0
  return Math.min(100, Math.round((v / weightMax.value) * 100))
}

async function onGetPhoneNumber(e) {
  if (e.detail.errMsg !== 'getPhoneNumber:ok') {
    const msg = e.detail.errMsg || ''
    if (msg.includes('-10000') || msg.includes('fail')) {
      uni.showToast({ title: '当前环境无法获取手机号，请用下方「模拟登录」', icon: 'none', duration: 3000 })
    } else {
      uni.showToast({ title: '需要授权手机号才能使用', icon: 'none' })
    }
    return
  }
  const code = e.detail.code
  if (!code) {
    uni.showToast({ title: '获取手机号失败，请用「模拟登录」或真机测试', icon: 'none' })
    return
  }
  try {
    await loginWithPhoneCode(code)
    await auth.init()
  } catch (err) {
    uni.showToast({ title: err.message || '登录失败', icon: 'none' })
  }
}

async function onDevLogin() {
  try {
    await loginWithPhoneCode('dev_simulator')
    await auth.init()
    uni.showToast({ title: '已模拟登录', icon: 'success' })
  } catch (err) {
    uni.showToast({ title: err.message || '模拟登录失败', icon: 'none' })
  }
}

function onFamilyCreated() {
  auth.setNeedCreateFamily(false)
  auth.setNeedAddFirstPet(true)
}

function onFirstPetAdded() {
  auth.setNeedAddFirstPet(false)
}

function onEditFamilySuccess() {
  auth.refreshFamilyName()
  showEditFamily.value = false
}

function onStapleAdded() {
  loadStaple()
  showAddStaple.value = false
}

function loadPets() {
  const uid = getStoredUserId()
  const fid = getStoredFamilyId()
  if (!uid || !fid) return
  uniCloud.callFunction({ name: 'pet-list', data: { family_id: fid, user_id: uid } })
    .then(res => {
      const d = res.result || {}
      pets.value = (d.code === 0 && d.data) ? d.data : []
    })
    .catch(() => { pets.value = [] })
}

function loadStaple() {
  const uid = getStoredUserId()
  const fid = getStoredFamilyId()
  if (!uid || !fid) return
  uniCloud.callFunction({ name: 'staple-food-list', data: { family_id: fid, user_id: uid } })
    .then(res => {
      const d = res.result || {}
      stapleList.value = (d.code === 0 && d.data) ? d.data : []
    })
    .catch(() => { stapleList.value = [] })
}

function loadWeightRecords() {
  const uid = getStoredUserId()
  const fid = getStoredFamilyId()
  if (!uid || !fid) return
  const end = new Date()
  const start = new Date()
  start.setFullYear(start.getFullYear() - 1)
  const dateFrom = start.toISOString().slice(0, 10)
  const dateTo = end.toISOString().slice(0, 10)
  uniCloud.callFunction({
    name: 'record-list',
    data: { family_id: fid, user_id: uid, date_from: dateFrom, date_to: dateTo, limit: 500 }
  }).then(res => {
    const d = res.result || {}
    const list = (d.code === 0 && d.data) ? d.data : []
    weightRecords.value = list.filter(r => r.weight != null && r.weight !== '')
  }).catch(() => { weightRecords.value = [] })
}

function refreshData() {
  loadPets()
  loadStaple()
  loadWeightRecords()
}

onMounted(() => {
  auth.init().then(() => {
    if (auth.isLoggedIn.value && !auth.needCreateFamily.value && !auth.needAddFirstPet.value) {
      refreshData()
    }
  })
})

onShow(() => {
  if (auth.initDone.value && auth.isLoggedIn.value && !auth.needCreateFamily.value && !auth.needAddFirstPet.value) {
    refreshData()
  }
})
</script>

<style scoped>
.page {
  flex: 1;
  min-height: 100vh;
  background-color: #fffdf8;
  padding: 32rpx 24rpx 40rpx;
  box-sizing: border-box;
}

.preview-tip {
  padding: 24rpx 0;
  text-align: center;
}
.tip-text {
  font-size: 26rpx;
  color: #999;
}
.login-btn {
  margin-top: 16rpx;
  padding: 20rpx 48rpx;
  font-size: 28rpx;
  color: #333;
  background-color: #ffb800;
  border-radius: 24rpx;
  border: none;
}
.dev-login {
  margin-top: 24rpx;
  padding: 16rpx;
}
.dev-login-text {
  font-size: 24rpx;
  color: #999;
  text-decoration: underline;
}

.preview-placeholder {
  padding: 24rpx 0;
}
.placeholder-text {
  font-size: 24rpx;
  color: #999;
}

.page-scroll {
  max-height: calc(100vh - 140rpx);
}

.chart-placeholder {
  min-height: 160rpx;
  border-radius: 20rpx;
  border: 2rpx dashed rgba(255, 184, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fff7e6, #fffdf8);
}
.weight-chart-wrap {
  width: 100%;
  padding: 8rpx 0;
}
.weight-row {
  display: flex;
  align-items: center;
  margin-bottom: 12rpx;
  font-size: 22rpx;
}
.weight-date {
  width: 140rpx;
  color: #666;
  flex-shrink: 0;
}
.weight-pet {
  width: 80rpx;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
.weight-num {
  width: 88rpx;
  color: #ffb800;
  font-weight: 600;
  flex-shrink: 0;
}
.weight-bar-bg {
  flex: 1;
  height: 24rpx;
  background: #f0f0f0;
  border-radius: 12rpx;
  overflow: hidden;
  margin-left: 12rpx;
}
.weight-bar {
  height: 100%;
  background: linear-gradient(90deg, #ffb800, #ffd54f);
  border-radius: 12rpx;
  min-width: 4rpx;
}

.pet-pill-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  margin-bottom: 12rpx;
}
.pet-pill {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  margin-right: 12rpx;
  margin-bottom: 8rpx;
}
.cat-pill {
  background-color: #fff4d6;
}
.dog-pill {
  background-color: #e3f3ee;
}
.pet-emoji {
  font-size: 30rpx;
  margin-right: 8rpx;
}
.pet-name {
  font-size: 24rpx;
  color: #333;
}
.link-text {
  font-size: 24rpx;
  color: #ffb800;
  margin-top: 8rpx;
}
.edit-family-wrap {
  padding: 0 4rpx 16rpx;
}
.edit-family-btn {
  font-size: 24rpx;
  color: #999;
  text-decoration: underline;
}
.staple-item {
  margin-bottom: 8rpx;
}
.staple-name {
  font-size: 26rpx;
  color: #333;
}
.staple-date {
  font-size: 22rpx;
  color: #999;
  margin-left: 8rpx;
}
.btn-wrap {
  margin-top: 16rpx;
}
</style>
