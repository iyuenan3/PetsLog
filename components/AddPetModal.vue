<template>
  <view v-if="visible" class="mask" @click.stop>
    <view class="modal modal--scroll">
      <text class="modal-title">{{ editPet ? '编辑宠物' : (isFirst ? '添加第一只宠物' : '添加宠物') }}</text>
      <text class="modal-desc">姓名、品种、生日为必填</text>
      <view class="form">
        <view class="row row--avatar">
          <text class="label">头像</text>
          <view class="avatar-wrap">
            <image v-if="form.avatar" class="avatar-img" :src="form.avatar" mode="aspectFill" />
            <view v-else class="avatar-placeholder">未设置</view>
            <base-button type="secondary" size="small" @click="onChooseAvatar">选择图片</base-button>
          </view>
        </view>
        <view class="row">
          <text class="label">姓名</text>
          <input v-model="form.name" class="input" type="text" placeholder="必填" placeholder-class="ph" />
        </view>
        <view class="row">
          <text class="label">品种</text>
          <input v-model="form.breed" class="input" type="text" placeholder="如缅因猫、田园犬" placeholder-class="ph" />
        </view>
        <view class="row">
          <text class="label">生日</text>
          <picker mode="date" :value="form.birthday" @change="(e) => (form.birthday = e.detail.value)">
            <view class="picker">{{ form.birthday || '请选择' }}</view>
          </picker>
        </view>
        <view class="row">
          <text class="label">到家日期</text>
          <picker mode="date" :value="form.home_date" @change="(e) => (form.home_date = e.detail.value)">
            <view class="picker">{{ form.home_date || '选填' }}</view>
          </picker>
        </view>
        <view class="row">
          <text class="label">初始身价(元)</text>
          <input v-model="form.initial_price_yuan" class="input" type="digit" placeholder="选填" placeholder-class="ph" />
        </view>
        <view class="row">
          <text class="label">简介</text>
          <input v-model="form.intro" class="input" type="text" placeholder="选填" placeholder-class="ph" />
        </view>
        <view class="row">
          <text class="label">病史</text>
          <input v-model="form.medical_history" class="input" type="text" placeholder="选填" placeholder-class="ph" />
        </view>
        <view class="row">
          <text class="label">备注</text>
          <input v-model="form.remark" class="input" type="text" placeholder="选填" placeholder-class="ph" />
        </view>
        <view class="row" v-if="editPet">
          <text class="label">状态</text>
          <picker :value="statusIndex" :range="statusOptions" range-key="label" @change="(e) => (form.status = statusOptions[e.detail.value].value)">
            <view class="picker">{{ statusOptions.find(s => s.value === form.status)?.label }}</view>
          </picker>
        </view>
      </view>
      <view class="btn-row">
        <base-button v-if="!isFirst || editPet" type="secondary" size="small" @click="onClose">取消</base-button>
        <base-button
          type="primary"
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
  isFirst: { type: Boolean, default: false },
  editPet: { type: Object, default: null }
})

const emit = defineEmits(['success', 'close'])

const statusOptions = [
  { value: 'normal', label: '正常' },
  { value: 'passed', label: '去世' },
  { value: 'left', label: '离家' }
]

const form = ref({
  name: '',
  breed: '',
  birthday: '',
  home_date: '',
  intro: '',
  avatar: '',
  initial_price_yuan: '',
  medical_history: '',
  remark: '',
  status: 'normal'
})
const loading = ref(false)

const statusIndex = computed(() => statusOptions.findIndex(s => s.value === form.value.status) >= 0 ? statusOptions.findIndex(s => s.value === form.value.status) : 0)

const canSubmit = computed(() => {
  const f = form.value
  return f.name.trim() && f.breed.trim() && f.birthday
})

watch(() => [props.visible, props.editPet], ([v, pet]) => {
  if (v) {
    if (pet) {
      form.value = {
        name: pet.name || '',
        breed: pet.breed || '',
        birthday: pet.birthday || '',
        home_date: pet.home_date || '',
        intro: pet.intro || '',
        avatar: pet.avatar || '',
        initial_price_yuan: pet.initial_price != null ? (pet.initial_price / 100).toFixed(2) : '',
        medical_history: pet.medical_history || '',
        remark: pet.remark || '',
        status: pet.status || 'normal'
      }
    } else {
      form.value = {
        name: '', breed: '', birthday: '', home_date: '', intro: '',
        avatar: '', initial_price_yuan: '', medical_history: '', remark: '', status: 'normal'
      }
    }
  }
}, { deep: true })

async function onChooseAvatar() {
  try {
    const [file] = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => resolve(res.tempFilePaths),
        fail: reject
      })
    })
    uni.showLoading({ title: '上传中' })
    const res = await uniCloud.uploadFile({
      filePath: file,
      cloudPath: 'pets/avatar/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.jpg'
    })
    form.value.avatar = res.fileID
    uni.hideLoading()
    uni.showToast({ title: '已选择头像', icon: 'success' })
  } catch (e) {
    uni.hideLoading()
    if (e.errMsg && !e.errMsg.includes('cancel')) uni.showToast({ title: '选择失败', icon: 'none' })
  }
}

function onClose() {
  emit('close')
}

async function onSubmit() {
  if (!canSubmit.value) return
  const uid = getStoredUserId()
  const familyId = getStoredFamilyId()
  if (!uid || !familyId) {
    uni.showToast({ title: '请先登录并创建家庭', icon: 'none' })
    return
  }
  loading.value = true
  const f = form.value
  const initial_price = f.initial_price_yuan !== '' && f.initial_price_yuan != null
    ? Math.round(parseFloat(f.initial_price_yuan) * 100)
    : undefined
  const base = {
    family_id: familyId,
    user_id: uid,
    name: f.name.trim(),
    breed: f.breed.trim(),
    birthday: f.birthday || undefined,
    home_date: f.home_date || undefined,
    intro: f.intro || undefined,
    avatar: f.avatar || undefined,
    initial_price,
    medical_history: f.medical_history || undefined,
    remark: f.remark || undefined,
    status: f.status
  }
  try {
    const name = props.editPet ? 'pet-update' : 'pet-add'
    const data = props.editPet
      ? { ...base, pet_id: props.editPet._id }
      : base
    const res = await uniCloud.callFunction({ name, data })
    const out = res.result || {}
    if (out.code === 0) {
      emit('success')
    } else {
      uni.showToast({ title: out.message || '操作失败', icon: 'none' })
    }
  } catch (e) {
    uni.showToast({ title: '操作失败', icon: 'none' })
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
  width: 620rpx;
  max-height: 85vh;
  background: #fff;
  border-radius: 24rpx;
  padding: 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.1);
}
.modal--scroll {
  overflow-y: auto;
}
.row--avatar {
  align-items: flex-start;
}
.avatar-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.avatar-img {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: #f0f0f0;
}
.avatar-placeholder {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: #f0f0f0;
  font-size: 22rpx;
  color: #999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #333;
}
.modal-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #999;
}
.form {
  margin-top: 24rpx;
}
.row {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}
.label {
  width: 140rpx;
  font-size: 26rpx;
  color: #666;
}
.input,
.picker {
  flex: 1;
  height: 64rpx;
  padding: 0 16rpx;
  font-size: 28rpx;
  color: #333;
  background: #f8f9fa;
  border-radius: 12rpx;
}
.picker {
  line-height: 64rpx;
}
.ph {
  color: #999;
}
.btn-row {
  margin-top: 24rpx;
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
}
</style>
