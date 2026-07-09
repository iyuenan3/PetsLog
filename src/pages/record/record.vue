<template>
  <view class="page" :class="{ 'page--entry': !parsed }" @click="onScrimTap">
    <!-- 入口卡（点＋弹出，见 ADR-017）：自然语言居中主入口 + 结构化 / 语音次级。
         卡在普通文档流（非 position:fixed），原生 textarea 不踩层级穿透坑；暗背景点空白处关闭。 -->
    <view v-if="!parsed" class="card" @click.stop>
      <view class="card__head">
        <view class="card__title"><text>记录</text><image class="ic" src="/static/icon/paw.png" mode="aspectFit" /></view>
        <text class="card__close" hover-class="card__close--press" hover-stay-time="60" @click="close">✕</text>
      </view>
      <text class="card__hint">用大白话说一句，AI 自动归档。可记健康、设提醒、入库药品。</text>
      <textarea
        v-model="draft"
        class="rec__input"
        :class="{ 'rec__input--focus': focused }"
        :maxlength="200"
        placeholder="例如「示例猫今天吐了，体重 4.2kg」"
        placeholder-class="rec__ph"
        :disabled="parsing"
        :focus="forceFocus"
        auto-height
        @focus="focused = true"
        @blur="onBlur"
      />
      <view class="rec__examples">
        <text
          v-for="(ex, i) in examples"
          :key="i"
          class="rec__ex"
          hover-class="rec__ex--press"
          hover-stay-time="60"
          @click="fill(ex)"
        >{{ ex }}</text>
      </view>
      <button
        class="rec__btn"
        :class="{ 'rec__btn--loading': parsing }"
        hover-class="rec__btn--press"
        hover-stay-time="60"
        :loading="parsing"
        @click="onSend"
      >{{ parsing ? '解析中…' : '记 录' }}</button>

      <!-- 或换种方式：结构化（点开整页表单，不调 LLM）/ 语音（聚焦输入框 + 系统键盘麦克风听写，零后端） -->
      <view class="card__alt-divider">
        <view class="card__alt-line"></view>
        <text class="card__alt-text">或换种方式</text>
        <view class="card__alt-line"></view>
      </view>
      <view class="alt-entries">
        <view class="alt-entry" hover-class="alt-entry--press" hover-stay-time="60" @click="openManual">
          <image class="alt-entry__ico" src="/static/icon/keyboard.png" mode="aspectFit" />
          <text class="alt-entry__name">结构化逐项</text>
        </view>
        <view class="alt-entry" hover-class="alt-entry--press" hover-stay-time="60" @click="voiceInput">
          <image class="alt-entry__ico" src="/static/icon/mic.png" mode="aspectFit" />
          <text class="alt-entry__name">语音</text>
        </view>
      </view>
    </view>

    <!-- 录入表单（整页内联，不用弹层）：结构化直填 + AI 结果可编辑，见 ADR-017 -->
    <view v-else class="form">
        <!-- 手动直填可切类型（AI 解析态 kind 由解析决定，不显示切换） -->
        <view v-if="manual" class="kind-switch">
          <view :class="['kind-switch__item', parsed.kind === 'record' ? 'kind-switch__item--active' : '']" @click="setManualKind('record')"><image class="kind-switch__ico" src="/static/icon/stetho.png" mode="aspectFit" /><text>记录</text></view>
          <view :class="['kind-switch__item', parsed.kind === 'reminder' ? 'kind-switch__item--active' : '']" @click="setManualKind('reminder')"><image class="kind-switch__ico" src="/static/icon/bell.png" mode="aspectFit" /><text>提醒</text></view>
          <view :class="['kind-switch__item', parsed.kind === 'med_stock' ? 'kind-switch__item--active' : '']" @click="setManualKind('med_stock')"><image class="kind-switch__ico" src="/static/icon/pill.png" mode="aspectFit" /><text>入库</text></view>
        </view>

        <!-- 药品入库（可编辑，见 ADR-017） -->
        <block v-if="parsed.kind === 'med_stock'">
          <view class="sheet__title"><text>{{ manual ? '手动入库一盒药' : '入库一盒药' }}</text><image class="ic" src="/static/icon/pill.png" mode="aspectFit" /></view>
          <text class="sheet__hint">确认后存进药品库存</text>
          <view class="sheet__fields">
            <view class="field-row"><text class="field-row__label">药品</text><input class="field-row__input" v-model="parsed.med_name" placeholder="药品名" placeholder-class="ph" /></view>
            <view class="field-row"><text class="field-row__label">功效</text><input class="field-row__input" v-model="parsed.med_effect" placeholder="选填" placeholder-class="ph" /></view>
            <view class="field-row"><text class="field-row__label">类型</text>
              <picker class="field-row__pick" mode="selector" :range="medTypes" :value="medTypeIdx" @change="onPickMedType($event)">
                <view class="pickbox"><text class="pickbox__v">{{ parsed.med_type || '用药' }}</text><text class="pickbox__c">▾</text></view>
              </picker>
            </view>
            <view class="field-row"><text class="field-row__label">数量</text><input class="field-row__input" type="number" v-model="parsed.med_quantity" placeholder="1" placeholder-class="ph" /></view>
            <view class="field-row"><text class="field-row__label">过期</text>
              <picker class="field-row__pick" mode="date" :value="parsed.med_expire || today()" @change="onPickDate('med_expire', $event)">
                <view class="pickbox"><text class="pickbox__v" :class="{ 'field-row__value--empty': !parsed.med_expire }">{{ parsed.med_expire || '未填' }}</text><text class="pickbox__c">▾</text></view>
              </picker>
            </view>
            <view v-if="!manual" class="field-row"><text class="field-row__label">原文</text><text class="field-row__value">{{ parsed.raw || draft }}</text></view>
          </view>
        </block>

        <!-- 提醒（可编辑，见 ADR-017） -->
        <block v-else-if="parsed.kind === 'reminder'">
          <view class="sheet__title"><text>{{ manual ? '手动设提醒' : '设个提醒' }}</text><image class="ic" src="/static/icon/bell.png" mode="aspectFit" /></view>
          <text class="sheet__hint">到期会在宠物页和健康页提示你</text>
          <view class="sheet__fields">
            <!-- 提醒不挂幽灵宠物名（ADR-015 评审硬化）：错别字时从已有宠物点选，正常态 picker 选（宠物可空） -->
            <view class="field-row" v-if="parsed.pet_unknown">
              <text class="field-row__label">选一只</text>
              <view class="chips" v-if="petOptions.length">
                <text v-for="n in petOptions" :key="n" class="chip" @click="pickPet(n)">{{ n }}</text>
              </view>
              <text v-else class="field-row__value field-row__value--empty">还没有宠物档案，先到宠物页添加</text>
            </view>
            <view class="field-row" v-else>
              <text class="field-row__label">宠物</text>
              <picker v-if="petOptions.length" class="field-row__pick" mode="selector" :range="petOptions" :value="petIdx" @change="onPickPet($event)">
                <view class="pickbox"><text class="pickbox__v" :class="{ 'field-row__value--empty': !parsed.pet }">{{ parsed.pet || '不指定' }}</text><text class="pickbox__c">▾</text></view>
              </picker>
              <text v-else class="field-row__value field-row__value--empty">不指定</text>
            </view>
            <view class="field-row"><text class="field-row__label">类型</text>
              <picker class="field-row__pick" mode="selector" :range="remTypes" :value="remTypeIdx" @change="onPickRemType($event)">
                <view class="pickbox"><text class="pickbox__v">{{ parsed.rem_type || '其它' }}</text><text class="pickbox__c">▾</text></view>
              </picker>
            </view>
            <view class="field-row"><text class="field-row__label">事项</text><input class="field-row__input" v-model="parsed.rem_title" placeholder="做什么" placeholder-class="ph" /></view>
            <view class="field-row"><text class="field-row__label">到期</text>
              <picker class="field-row__pick" mode="date" :value="parsed.rem_date || today()" @change="onPickDate('rem_date', $event)">
                <view class="pickbox"><text class="pickbox__v" :class="{ 'field-row__value--empty': !parsed.rem_date }">{{ parsed.rem_date || '未识别' }}</text><text class="pickbox__c">▾</text></view>
              </picker>
            </view>
            <view class="field-row"><text class="field-row__label">重复</text>
              <picker class="field-row__pick" mode="selector" :range="repeatLabels" :value="repeatIdx" @change="onPickRepeat($event)">
                <view class="pickbox"><text class="pickbox__v">{{ repeatText(parsed.rem_repeat_days) }}</text><text class="pickbox__c">▾</text></view>
              </picker>
            </view>
            <view v-if="!manual" class="field-row"><text class="field-row__label">原文</text><text class="field-row__value">{{ parsed.raw || draft }}</text></view>
          </view>
        </block>

        <!-- 多事件拆条（ADR-030 Round 2）：N 张精简可编辑卡，每卡 宠物单选 + 类型 + 体重 + 描述 + 删卡 -->
        <block v-else-if="parsed.kind === 'multi'">
          <view class="sheet__title"><text>拆成 {{ parsed.records.length }} 条记录</text><image class="ic" src="/static/icon/stetho.png" mode="aspectFit" /></view>
          <text class="sheet__hint">识别出几件不同的事，逐条确认；多余的可删</text>
          <view v-for="(rec, i) in parsed.records" :key="rec._k" class="multi-card">
            <view class="multi-card__head">
              <text class="multi-card__idx">第 {{ i + 1 }} 条<text v-if="rec.pet_unknown" class="multi-card__warn"> · 没找到这只，请重选</text></text>
              <text v-if="parsed.records.length > 1" class="multi-card__del" @click="delRec(i)">删除</text>
            </view>
            <view class="field-row"><text class="field-row__label">宠物</text>
              <view class="chips" v-if="petOptions.length"><text v-for="n in petOptions" :key="n" :class="['chip', rec.pet === n ? 'chip--active' : '']" @click="setRecPet(i, n)">{{ n }}</text></view>
              <text v-else class="field-row__value field-row__value--empty" @click="goAddPet">还没有宠物，去添加 ›</text>
            </view>
            <view class="field-row"><text class="field-row__label">类型</text>
              <picker class="field-row__pick" mode="selector" :range="multiEventTypes" :value="recEvtIdx(rec)" @change="onPickRecEvt(i, $event)">
                <view class="pickbox"><text class="pickbox__v">{{ rec.event_type || '其它' }}</text><text class="pickbox__c">▾</text></view>
              </picker>
            </view>
            <view class="field-row"><text class="field-row__label">体重</text><input class="field-row__input" type="digit" v-model="rec.weight" placeholder="选填，单位 kg" placeholder-class="ph" /></view>
            <view class="field-row"><text class="field-row__label">描述</text><input class="field-row__input" v-model="rec.desc" placeholder="症状 / 事件描述" placeholder-class="ph" /></view>
          </view>
          <view v-if="!manual" class="field-row"><text class="field-row__label">原文</text><text class="field-row__value">{{ parsed.raw || draft }}</text></view>
        </block>

        <!-- 健康记录（可编辑，见 ADR-017） -->
        <block v-else>
          <view class="sheet__title"><text>{{ manual ? '手动记录' : '记录健康事件' }}</text><image class="ic" src="/static/icon/stetho.png" mode="aspectFit" /></view>
          <text class="sheet__hint">确认后归档到时间线</text>
          <view class="sheet__fields">
            <!-- 宠物三态：① is_new 建档意图（名字可改 + 选种类，ADR-015 唯一建档通道）② 错别字没匹配上→点选 ③ 正常→picker 选已有 -->
            <template v-if="parsed.is_new">
              <view class="field-row"><text class="field-row__label">宠物</text><input class="field-row__input" v-model="parsed.pet" placeholder="新宠物名" placeholder-class="ph" /><text class="new-badge">将建档</text></view>
              <view class="field-row"><text class="field-row__label">种类</text>
                <view class="chips">
                  <text v-for="s in speciesList" :key="s.key" :class="['chip', parsed.species === s.key ? 'chip--active' : '']" @click="setSpecies(s.key)">{{ s.emoji }} {{ s.label }}</text>
                </view>
              </view>
            </template>
            <template v-else-if="parsed.pet_unknown">
              <view class="field-row"><text class="field-row__label">宠物</text><text class="field-row__value field-row__value--empty">{{ parsed.pet || '待确认' }}<text class="new-badge new-badge--warn">没找到这只</text></text></view>
              <view class="field-row"><text class="field-row__label">选一只</text>
                <view class="chips" v-if="petOptions.length"><text v-for="n in petOptions" :key="n" class="chip" @click="pickPet(n)">{{ n }}</text></view>
                <text v-else class="field-row__value field-row__value--empty">还没有宠物档案，先到宠物页添加</text>
              </view>
            </template>
            <!-- 正常态（record + 已有宠）：多选 chips（ADR-029 Round 1），勾几只各存一条；建档 / 错别字仍单宠（上两态） -->
            <template v-else>
              <view class="field-row"><text class="field-row__label">宠物</text>
                <view class="chips" v-if="petOptions.length"><text v-for="n in petOptions" :key="n" :class="['chip', selectedPets.includes(n) ? 'chip--active' : '']" @click="togglePet(n)">{{ n }}</text></view>
                <text v-else class="field-row__value field-row__value--empty" @click="goAddPet">还没有宠物，去添加 ›</text>
              </view>
              <view v-if="isBatch" class="field-row"><text class="field-row__label"></text><text class="batch-hint">已选 {{ selectedPets.length }} 只 · 确认后各存一条（批量暂不挂附件）</text></view>
            </template>
            <view class="field-row"><text class="field-row__label">时间</text>
              <view class="dt-pick">
                <picker class="dt-pick__part" mode="date" :value="timeDate" @change="onPickTimeDate($event)">
                  <view class="pickbox"><text class="pickbox__v">{{ timeDate }}</text><text class="pickbox__c">▾</text></view>
                </picker>
                <picker class="dt-pick__part" mode="time" :value="timeClock" @change="onPickTimeClock($event)">
                  <view class="pickbox"><text class="pickbox__v">{{ timeClock }}</text><text class="pickbox__c">▾</text></view>
                </picker>
              </view>
            </view>
            <view class="field-row"><text class="field-row__label">类型</text>
              <picker class="field-row__pick" mode="selector" :range="eventTypes" :value="evtIdx" @change="onPickEvt($event)">
                <view class="pickbox"><text class="pickbox__v">{{ parsed.event_type || '其它' }}</text><text class="pickbox__c">▾</text></view>
              </picker>
            </view>
            <!-- 养护参数（ADR-024）：event_type=养护 且该物种有结构化参数（爬宠温湿度 / 鱼水质）时展开 -->
            <view v-for="f in husbandryFields" :key="f.key" class="field-row">
              <text class="field-row__label">{{ f.label }}</text>
              <input class="field-row__input" type="digit" v-model="parsed.params[f.key]" :placeholder="'选填' + (f.unit ? '，单位 ' + f.unit : '')" placeholder-class="ph" />
            </view>
            <view class="field-row"><text class="field-row__label">体重</text><input class="field-row__input" type="digit" v-model="parsed.weight" placeholder="选填，单位 kg" placeholder-class="ph" /></view>
            <view class="field-row"><text class="field-row__label">描述</text><input class="field-row__input" v-model="parsed.desc" placeholder="症状 / 事件描述" placeholder-class="ph" /></view>
            <view class="field-row"><text class="field-row__label">用药</text><input class="field-row__input" v-model="parsed.med" placeholder="选填" placeholder-class="ph" /></view>
            <view class="field-row"><text class="field-row__label">医院</text><input class="field-row__input" v-model="parsed.hospital" placeholder="选填" placeholder-class="ph" /></view>
            <view class="field-row"><text class="field-row__label">费用</text><input class="field-row__input" type="digit" v-model="parsed.cost" placeholder="选填，单位 元" placeholder-class="ph" /></view>
            <view class="field-row"><text class="field-row__label">病程</text><input class="field-row__input" v-model="parsed.tag" placeholder="如 嗜酸性肉芽肿（选填）" placeholder-class="ph" /></view>
            <view v-if="!manual" class="field-row"><text class="field-row__label">原文</text><text class="field-row__value">{{ parsed.raw || draft }}</text></view>
          </view>

          <!-- 附件（见 ADR-011）：确认归档前可挂图片 / 视频 / PDF，保存后上传登记。批量(>1 只)隐藏：附件按单 record 登记，多只语义模糊（ADR-029） -->
          <view v-if="!isBatch" class="att">
            <text class="att__label">附件（病历照片 / 视频 / PDF，选填）</text>
            <scroll-view scroll-x class="att__scroll" :show-scrollbar="false">
              <view class="att__inner">
                <view v-for="(a, i) in atts" :key="i" class="att-cell">
                  <image v-if="a.type === 'image'" :src="a.tempPath" class="att-cell__img" mode="aspectFill" />
                  <block v-else-if="a.type === 'video'">
                    <image v-if="a.thumbTemp" :src="a.thumbTemp" class="att-cell__img" mode="aspectFill" />
                    <view class="att-cell__mask">▶</view>
                  </block>
                  <view v-else class="att-cell__pdf">
                    <image class="att-cell__pdf-ico" src="/static/icon/fn-pdf.png" mode="aspectFit" />
                    <text class="att-cell__pdf-name">{{ a.name }}</text>
                  </view>
                  <text class="att-cell__del" @click.stop="removeAtt(i)">✕</text>
                </view>
                <view v-if="atts.length < attMax" class="att-cell att-cell--add" @click="addAtt">＋</view>
              </view>
            </scroll-view>
          </view>
        </block>

        <view class="sheet__actions">
          <button class="btn-ghost" hover-class="btn-ghost--press" hover-stay-time="60" @click="cancelParse">返回修改</button>
          <button class="btn-primary" hover-class="btn-primary--press" hover-stay-time="60" :loading="saving" @click="confirmSave">{{ confirmBtnText() }}</button>
        </view>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { callFn } from '@/cloud'
import { pickAttachments, uploadAndRegister, ATT_MAX_PER_RECORD } from '@/attachments'
import { SPECIES } from '@/species'
import { eventTypesFor, reminderTypesFor, husbandryFor } from '@/speciesProfile'

export default {
  data() {
    return {
      draft: '',
      focused: false,
      forceFocus: false, // 「语音」入口 = 聚焦 NL 输入框弹键盘，用系统键盘🎤听写（零后端）
      parsing: false,
      saving: false,
      parsed: null, // 结构化结果（AI 解析 or 手动直填），待用户确认 / 编辑
      manual: false, // 手动直填态（ADR-017）：可切 kind、隐藏「原文」、标题改「手动…」
      petOptions: [], // 家庭已有宠物名单（AI 走 parseRecord 带回，手动走 pets list），多选 chips / 错别字点选用
      selectedPets: [], // 正常态多选名单（ADR-029 Round 1）：>1 即批量，确认后各存一条；单一真相驱动 chips 高亮
      petsList: [], // 家庭宠物全量（含 species），选已有宠时按名查物种以驱动 event_type / 养护表单（ADR-024）
      speciesList: SPECIES, // 建档物种 chip（ADR-023 多物种）
      multiEventTypes: ['症状', '用药', '疫苗', '驱虫', '体重', '就医', '其它'], // multi 卡类型候选（ADR-030，不含养护：multi 不做养护参数）
      atts: [], // 待上传附件（本地临时文件，确认归档后才上传，取消不留孤儿）
      attMax: ATT_MAX_PER_RECORD,
      examples: ['示例猫今天吐了，体重 4.2kg', '下月 15 号给示例狗打疫苗', '买了盒驱虫药 2 支，明年 3 月过期'],
      REPEAT_OPTS: [
        { label: '不重复', days: 0 },
        { label: '每天', days: 1 },
        { label: '每周', days: 7 },
        { label: '每两周', days: 14 },
        { label: '每月', days: 30 },
        { label: '每3个月', days: 90 },
        { label: '每半年', days: 182 },
        { label: '每年', days: 365 },
      ],
    }
  },
  computed: {
    // 当前记录的物种（ADR-024）：parsed.species 是单一真相（建档 chip 选 / 选已有宠时 onPickPet 同步 / AI 由 LLM 给）
    curSpecies() {
      return (this.parsed && this.parsed.species) || 'other'
    },
    // 物种感知的 event_type 候选（ADR-024 B 档）：按物种收敛，含「养护」（爬宠 / 鱼）。
    // 并入「当前值」（若不在物种候选内）：避免切物种后 picker 高亮回退到末项而 parsed.event_type 字面不变 →
    // 显示 / 高亮 / 落库三者错配 + 不点 picker 直接提交会静默把原值改派成「其它」（守本项目「落库不静默改派」原则）。
    eventTypes() {
      const base = eventTypesFor(this.curSpecies)
      const cur = this.parsed && this.parsed.event_type
      return cur && !base.includes(cur) ? [...base, cur] : base
    },
    // 物种感知的提醒分类候选（ADR-024，仅分类无周期值）；同样并入当前值防错配。
    remTypes() {
      const base = reminderTypesFor(this.curSpecies)
      const cur = this.parsed && this.parsed.rem_type
      return cur && !base.includes(cur) ? [...base, cur] : base
    },
    // 药品类型候选（ADR-035）：固定 5 值（药品库存不绑宠物 / 物种，非物种感知）；并入当前值防错配。
    medTypes() {
      const base = ['用药', '疫苗', '驱虫', '养护', '其它']
      const cur = this.parsed && this.parsed.med_type
      return cur && !base.includes(cur) ? [...base, cur] : base
    },
    // 养护参数输入字段（ADR-024）：仅 event_type=养护 且该物种有结构化参数（爬宠 / 鱼）时非空。
    // 批量态隐藏（ADR-029）：批量不落 params（物种特定、可能跨物种），不显输入行免用户填了被静默丢。
    husbandryFields() {
      if (!this.parsed || this.parsed.event_type !== '养护' || this.isBatch) return []
      return husbandryFor(this.curSpecies)
    },
    // 批量态（ADR-029 Round 1）：正常态选中 >1 只 → fan-out。建档 / 错别字态不批量（selectedPets 恒空）。
    isBatch() {
      return this.selectedPets.length > 1
    },
    // 提醒块选宠 picker 高亮下标（提醒仍单宠，不批量）：值不在名单回 0
    petIdx() {
      const i = this.petOptions.indexOf(this.parsed && this.parsed.pet)
      return i < 0 ? 0 : i
    },
    evtIdx() {
      const i = this.eventTypes.indexOf(this.parsed && this.parsed.event_type)
      return i < 0 ? this.eventTypes.length - 1 : i
    },
    remTypeIdx() {
      const i = this.remTypes.indexOf(this.parsed && this.parsed.rem_type)
      return i < 0 ? this.remTypes.length - 1 : i
    },
    medTypeIdx() {
      const i = this.medTypes.indexOf(this.parsed && this.parsed.med_type)
      return i < 0 ? 0 : i // 默认落「用药」（枚举首位），非提醒的末位「其它」
    },
    repeatLabels() {
      return this.REPEAT_OPTS.map((o) => o.label)
    },
    repeatIdx() {
      const d = (this.parsed && this.parsed.rem_repeat_days) || 0
      const i = this.REPEAT_OPTS.findIndex((o) => o.days === d)
      return i < 0 ? 0 : i
    },
    // 事件时间拆「日期 / 时刻」给两个 picker（parsed.time 是单一真相 'YYYY-MM-DD HH:mm'，见 ADR-018）
    timeDate() {
      const t = String((this.parsed && this.parsed.time) || '')
      return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : this.today()
    },
    timeClock() {
      const t = String((this.parsed && this.parsed.time) || '')
      return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t) ? t.slice(11, 16) : '12:00'
    },
  },
  methods: {
    cloudReady() {
      // #ifdef MP-WEIXIN
      return typeof wx !== 'undefined' && !!wx.cloud && !!CLOUD_ENV
      // #endif
      // eslint-disable-next-line no-unreachable
      return false
    },
    fill(ex) {
      this.draft = ex
    },
    repeatText(x) {
      if (!x) return '不重复'
      if (x % 365 === 0) return `每${x / 365}年`
      if (x % 30 === 0) return `每${x / 30}个月`
      if (x % 7 === 0) return `每${x / 7}周`
      return `每${x}天`
    },
    confirmBtnText() {
      const k = this.parsed && this.parsed.kind
      if (k === 'multi') return `确认归档 ${(this.parsed.records || []).length} 条`
      return k === 'med_stock' ? '确认入库' : k === 'reminder' ? '确认提醒' : '确认归档'
    },
    onSend() {
      const text = (this.draft || '').trim()
      if (!text) {
        uni.showToast({ title: '先说一句吧', icon: 'none' })
        return
      }
      if (!this.cloudReady()) {
        uni.showToast({ title: '请先配置云环境(CLOUD_ENV)', icon: 'none' })
        return
      }
      this.parse(text)
    },
    async parse(text) {
      this.parsing = true
      try {
        const res = await callFn('parseRecord', { text })
        const r = res.result || {}
        if (this.manual) return // 解析返回前用户已切到结构化手动表单：丢弃这次 NL 结果，不覆盖
        if (!r.ok) {
          uni.showToast({ title: r.msg || '解析失败', icon: 'none' })
          return
        }
        if (r.parsed && r.parsed.valid === false) {
          uni.showToast({ title: '这条看起来不是健康记录', icon: 'none' })
          return
        }
        this.atts = [] // 新一次解析，清掉上一轮残留的待传附件
        this.petOptions = r.pets || []
        // 名→物种映射（ADR-023/024）：AI 流确认卡里重选已有宠时 syncSpeciesByName 据此跟随物种（否则 petsList 空、species 停在 AI 值）
        this.petsList = Object.entries(r.petSpecies || {}).map(([name, species]) => ({ name, species }))
        // 多事件拆条（ADR-030 Round 2）：kind=multi → N 张卡；只剩 1 条降级单条编辑器；0 条视作无效
        if (r.parsed && r.parsed.kind === 'multi') {
          const recs = Array.isArray(r.parsed.records) ? r.parsed.records : []
          if (recs.length >= 2) {
            recs.forEach((rc, i) => (rc._k = 'm' + i)) // 稳定 key（ADR-030 评审）：删卡时 mp 同层 input 焦点 / 输入法不错位
            this.parsed = r.parsed
            this.selectedPets = []
            return
          }
          if (recs.length === 1) {
            this.parsed = { ...this.blankRecord(), ...recs[0], kind: 'record', is_new: false, new_pet: false, pet_unknown: !!recs[0].pet_unknown, raw: r.parsed.raw }
            if (this.parsed.params == null) this.parsed.params = {}
            this.initSelectedPets()
            this.ensureEventClock()
            return
          }
          uni.showToast({ title: '没识别出有效记录', icon: 'none' })
          return
        }
        this.parsed = r.parsed
        if (this.parsed && this.parsed.params == null) this.parsed.params = {} // 养护参数绑定前确保对象（AI 非养护时 params=null）
        this.initSelectedPets() // 多选名单（ADR-029）：AI 预选多只则全勾，否则单只
        this.ensureEventClock() // 事件时间精确到分（ADR-018）：AI 只给日期时补当前时刻，卡片显示=落库时间
      } catch (e) {
        uni.showModal({
          title: 'AI 解析出错',
          content: String((e && e.errMsg) || (e && e.message) || JSON.stringify(e)),
          showCancel: false,
        })
        console.error(e)
      } finally {
        this.parsing = false
      }
    },
    setSpecies(s) {
      if (!this.parsed) return
      if (this.parsed.species !== s) this.parsed.params = {} // 物种变 → 旧物种养护参数作废，防跨物种脏 params（ADR-024 review）
      this.parsed.species = s
    },
    pickPet(name) {
      if (!this.parsed) return
      this.parsed.pet = name
      this.parsed.pet_unknown = false
      this.selectedPets = [name] // 错别字选定后进正常态，多选名单以此只起步（ADR-029）
      this.syncSpeciesByName(name) // 跟随所选宠物物种（ADR-024）
    },
    // 正常态多选切换（ADR-029 Round 1）：勾/取消一只；parsed.pet 镜像首只（供 species 同步 + 单宠路径兼容）。
    togglePet(name) {
      if (!this.parsed) return
      const i = this.selectedPets.indexOf(name)
      if (i >= 0) this.selectedPets.splice(i, 1)
      else this.selectedPets.push(name)
      this.parsed.pet = this.selectedPets[0] || ''
      if (this.parsed.pet) this.syncSpeciesByName(this.parsed.pet) // 物种跟随首只（批量共享 event_type）
    },
    // 初始化正常态多选名单（ADR-029）：AI 预选多只(parsed.pets≥2) → 全勾；否则单只(已有宠) → 勾它；建档 / 错别字 / 非 record → 空
    initSelectedPets() {
      const p = this.parsed
      if (!p || p.kind !== 'record' || p.is_new || p.pet_unknown) {
        this.selectedPets = []
        return
      }
      if (Array.isArray(p.pets) && p.pets.length >= 2) this.selectedPets = p.pets.filter((n) => this.petOptions.includes(n))
      else if (p.pet && this.petOptions.includes(p.pet)) this.selectedPets = [p.pet]
      else this.selectedPets = []
    },
    // ===== 多事件拆条（ADR-030 Round 2）=====
    recEvtIdx(rec) {
      const i = this.multiEventTypes.indexOf(rec && rec.event_type)
      return i < 0 ? this.multiEventTypes.length - 1 : i // 不在候选(如养护)回兜底「其它」
    },
    setRecPet(i, name) {
      const rec = this.parsed && this.parsed.records && this.parsed.records[i]
      if (!rec) return
      rec.pet = name
      rec.pet_unknown = false
      const hit = this.petsList.find((p) => p.name === name) // 跟随该宠物种（multi 不展养护，仅留记录用）
      if (hit && hit.species) rec.species = hit.species
    },
    onPickRecEvt(i, e) {
      const rec = this.parsed && this.parsed.records && this.parsed.records[i]
      const v = this.multiEventTypes[Number(e.detail.value)]
      if (rec && v) rec.event_type = v
    },
    delRec(i) {
      if (this.saving) return // 提交进行中禁止删卡（review #3）：避免与 confirmSave 的失败卡 index 竞态
      if (!this.parsed || !this.parsed.records) return
      this.parsed.records.splice(i, 1)
      if (!this.parsed.records.length) this.cancelParse() // 删空 = 等于取消
    },
    // 出站清洗一条 multi 子记录（拼成 saveRecord 的 record 形状；数字强转，raw 带原句留 provenance）
    buildMultiRecord(rec) {
      return {
        kind: 'record', valid: true, pet: (rec.pet || '').trim(), new_pet: false, species: rec.species || 'other',
        time: rec.time || this.nowDateTime(), event_type: rec.event_type || '其它', weight: this.numOrNull(rec.weight),
        med: (rec.med || '').trim(), hospital: (rec.hospital || '').trim(), cost: this.numOrNull(rec.cost),
        tag: (rec.tag || '').trim(), desc: (rec.desc || '').trim(), raw: this.parsed.raw || this.draft || '',
      }
    },
    // ===== 入口卡（ADR-017）=====
    onScrimTap() {
      // 点卡片外的暗背景关闭（卡片自身 @click.stop 不冒泡到此）；表单态不响应
      if (!this.parsed) this.close()
    },
    close() {
      uni.navigateBack({ delta: 1 })
    },
    onBlur() {
      this.focused = false
      this.forceFocus = false // 失焦即复位，下次点「语音」能再次 false→true 触发聚焦
    },
    voiceInput() {
      // 键盘自带语音：聚焦 NL 输入框弹出系统键盘，用键盘上的 🎤 听写，文字回填后走现有 parseRecord（零后端）
      this.forceFocus = true
      uni.showToast({ title: '点键盘上的 🎤 说话，会自动转成文字', icon: 'none', duration: 2500 })
    },
    // ===== 手动直填（不调 LLM，见 ADR-017）=====
    today() {
      const d = new Date()
      const z = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
    },
    nowClock() {
      const d = new Date()
      const z = (n) => String(n).padStart(2, '0')
      return `${z(d.getHours())}:${z(d.getMinutes())}`
    },
    nowDateTime() {
      return `${this.today()} ${this.nowClock()}` // 'YYYY-MM-DD HH:mm'，事件时间默认当前（精确到分，ADR-018）
    },
    // 确保 parsed.time 含时分（AI 只给日期时补当前时刻），让确认卡片显示的时间 = 最终落库时间
    ensureEventClock() {
      if (!this.parsed || this.parsed.kind !== 'record') return
      const t = String(this.parsed.time || '')
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t)) {
        const d = /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : this.today()
        this.parsed.time = `${d} ${this.nowClock()}`
      }
    },
    onPickTimeDate(e) {
      if (this.parsed) this.parsed.time = `${e.detail.value} ${this.timeClock}`
    },
    onPickTimeClock(e) {
      if (this.parsed) this.parsed.time = `${this.timeDate} ${e.detail.value}`
    },
    // 数字出站归一：input 给的是字符串，转 number|null 再发，否则 saveRecord 的 typeof==='number' 兜底会把 "4.2" 判空丢值
    numOrNull(v) {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null
      if (v == null || v === '') return null
      const s = String(v).replace(/[^\d.]/g, '')
      if (s === '' || s === '.') return null
      const n = Number(s)
      return Number.isFinite(n) ? n : null
    },
    blankRecord() {
      // 全字段空白记录（kind 可切），手动直填初值
      return {
        kind: 'record', valid: true, pet: '', new_pet: false, is_new: false, pet_unknown: false, species: 'cat',
        time: this.nowDateTime(), event_type: '其它', weight: null, med: '', hospital: '', cost: null, tag: '', desc: '', raw: '',
        params: {}, // 养护参数（ADR-024），event_type=养护 时按物种填
        rem_type: '其它', rem_title: '', rem_date: '', rem_repeat_days: 0,
        med_name: '', med_effect: '', med_type: '用药', med_quantity: 1, med_expire: '',
      }
    },
    async openManual() {
      if (this.parsing) return // 解析进行中不切结构化，避免 LLM 结果回填覆盖手动表单
      if (!this.cloudReady()) {
        uni.showToast({ title: '请先配置云环境(CLOUD_ENV)', icon: 'none' })
        return
      }
      // 手动不经 parseRecord，单独拉宠物全量供 picker + 物种映射（callFn 自动注入 family_id）
      try {
        const res = await callFn('pets', { action: 'list' })
        const r = res.result || {}
        this.petsList = r.ok && Array.isArray(r.data) ? r.data : []
        this.petOptions = this.petsList.map((p) => p.name).filter(Boolean)
      } catch (e) {
        this.petsList = []
        this.petOptions = []
      }
      this.atts = []
      this.selectedPets = [] // 手动直填从空起步，用户点 chips 选（ADR-029）
      this.manual = true
      this.parsed = this.blankRecord()
    },
    setManualKind(k) {
      if (this.parsed) this.parsed.kind = k
    },
    // 提醒块选宠（提醒仍单宠，不批量）：picker 选定单只
    onPickPet(e) {
      const n = this.petOptions[Number(e.detail.value)]
      if (n != null && this.parsed) {
        this.parsed.pet = n
        this.parsed.pet_unknown = false
        this.syncSpeciesByName(n) // 选已有宠 → 跟随其物种（驱动 event_type / 养护表单，ADR-024）
      }
    },
    // 按宠物名从 petsList 同步 parsed.species（选已有宠时；petsList 空 / 查不到则不动，保留原值）
    syncSpeciesByName(name) {
      const hit = this.petsList.find((p) => p.name === name)
      if (hit && hit.species && this.parsed) {
        if (this.parsed.species !== hit.species) this.parsed.params = {} // 物种变 → 养护参数作废（ADR-024 review）
        this.parsed.species = hit.species
      }
    },
    onPickEvt(e) {
      const v = this.eventTypes[Number(e.detail.value)]
      if (v && this.parsed) {
        this.parsed.event_type = v
        if (v === '养护' && (!this.parsed.params || typeof this.parsed.params !== 'object')) this.parsed.params = {} // 养护参数绑定前确保对象存在
      }
    },
    onPickRemType(e) {
      const v = this.remTypes[Number(e.detail.value)]
      if (v && this.parsed) this.parsed.rem_type = v
    },
    onPickMedType(e) {
      const v = this.medTypes[Number(e.detail.value)]
      if (v && this.parsed) this.parsed.med_type = v
    },
    onPickRepeat(e) {
      const o = this.REPEAT_OPTS[Number(e.detail.value)]
      if (o && this.parsed) this.parsed.rem_repeat_days = o.days
    },
    onPickDate(field, e) {
      if (this.parsed) this.parsed[field] = e.detail.value
    },
    goAddPet() {
      uni.navigateTo({ url: '/pages/pet/pet?mode=new' })
    },
    // 出站清洗：可编辑后字段含字符串，按 kind 拼干净 record（数字强转），saveRecord 仍二次校验
    buildRecord() {
      const p = this.parsed
      const base = {
        kind: p.kind, valid: true, pet: (p.pet || '').trim(), new_pet: !!p.new_pet, is_new: !!p.is_new,
        pet_unknown: !!p.pet_unknown, species: p.species || 'other', raw: p.raw || '', // 物种透传（ADR-023，saveRecord normSpecies 白名单校验）
      }
      if (p.kind === 'med_stock') {
        return { ...base, med_name: (p.med_name || '').trim(), med_effect: (p.med_effect || '').trim(), med_type: p.med_type || '用药', med_quantity: this.numOrNull(p.med_quantity) || 1, med_expire: p.med_expire || '' }
      }
      if (p.kind === 'reminder') {
        return { ...base, rem_type: p.rem_type || '其它', rem_title: (p.rem_title || '').trim(), rem_date: p.rem_date || '', rem_repeat_days: this.numOrNull(p.rem_repeat_days) || 0 }
      }
      const rec = {
        ...base, time: p.time || this.nowDateTime(), event_type: p.event_type || '其它', weight: this.numOrNull(p.weight),
        med: (p.med || '').trim(), hospital: (p.hospital || '').trim(), cost: this.numOrNull(p.cost), tag: (p.tag || '').trim(), desc: (p.desc || '').trim(),
      }
      // 养护参数（ADR-024）：有结构化 schema 的物种按 husbandryFor 键收集（数字归一）；无 schema 物种透传 LLM 抽取，saveRecord 再 sanitize。
      // 批量态不收（ADR-029）：服务端 saveBatch 一律丢 params，前端同步不算，避免 rec.pets 与 rec.params 并存的语义歧义。
      if (rec.event_type === '养护' && !this.isBatch) {
        const fields = husbandryFor(p.species)
        let params
        if (fields.length) {
          params = {}
          for (const f of fields) {
            const v = this.numOrNull(p.params && p.params[f.key])
            if (v != null) params[f.key] = v
          }
          if (!Object.keys(params).length) params = undefined
        } else if (p.params && typeof p.params === 'object') {
          params = p.params
        }
        if (params) rec.params = params
      }
      if (this.isBatch) rec.pets = [...this.selectedPets] // 批量 fan-out（ADR-029）：服务端按 pets 各存一条；base.pet=首只供兼容
      return rec
    },
    cancelParse() {
      this.parsed = null
      this.manual = false
      this.atts = [] // 只是本地临时文件，丢弃即可，无云端孤儿
      this.selectedPets = []
    },
    async addAtt() {
      const picked = await pickAttachments(this.attMax - this.atts.length)
      if (picked.length) this.atts = this.atts.concat(picked)
    },
    removeAtt(i) {
      this.atts.splice(i, 1)
    },
    async confirmSave() {
      if (!this.parsed) return
      if (this.saving) return // 双击 / 重入守卫（review #4）：覆盖所有 kind，防快速双击把 multi/batch 翻倍重复写
      const kind = this.parsed.kind
      // 多事件拆条（ADR-030 Round 2）：逐条独立写、部分成功可报；失败的卡留下供重试
      if (kind === 'multi') {
        const recs = (this.parsed.records || []).slice() // 不可变快照（review #3）：提交期间用户删卡 splice 活引用会让失败卡 index 错位
        if (!recs.length) return
        if (recs.some((rc) => !(rc.pet || '').trim() || rc.pet_unknown)) {
          uni.showToast({ title: '有记录还没选宠物', icon: 'none' })
          return
        }
        this.saving = true
        try {
          const payload = { kind: 'multi', valid: true, raw: this.parsed.raw || this.draft, records: recs.map((rc) => this.buildMultiRecord(rc)) }
          const res = await callFn('saveRecord', { record: payload })
          const rr = res.result || {}
          const results = rr.results || []
          const failedIdx = new Set()
          results.forEach((x, idx) => { if (!x || !x.ok) failedIdx.add(idx) })
          if (results.length && !failedIdx.size) {
            // 全部成功
            uni.showToast({ title: `已归档 ${rr.saved} 条`, icon: 'success' })
            this.draft = ''
            this.parsed = null
            this.manual = false
            this.atts = []
            this.selectedPets = []
            setTimeout(() => uni.navigateBack({ delta: 1 }), 600)
          } else if (failedIdx.size) {
            // 有失败：部分成功 与 全部失败（saved:0）统一走回灌，否则全失败漏这步 = 失败卡不标 pet_unknown、
            // 提交守卫（recs.some pet_unknown）拦不住 → 用户反复点确认反复全拒 = 无限重试死循环（sweep P2 修复）
            uni.showToast({ title: rr.saved > 0 ? `已存 ${rr.saved}/${rr.count} 条，其余请重选` : '未能保存，请重新选择宠物', icon: 'none' })
            if (rr.pets) this.petOptions = rr.pets // 刷新可选名单（并发删宠后失败卡重选用，review C1）
            // 把服务端 per-item PET_UNKNOWN 回灌到失败卡：标 pet_unknown 让卡进「请重选」态 + 提交守卫拦住空转重试（review #4/C1）
            recs.forEach((rc, idx) => { if (results[idx] && !results[idx].ok && results[idx].code === 'PET_UNKNOWN') rc.pet_unknown = true })
            if (this.parsed) this.parsed.records = recs.filter((_, idx) => failedIdx.has(idx)) // 只留没存上的（快照过滤，防竞态 TypeError）
          } else {
            // 无 per-item results（整体报错 / 契约异常）：不动卡片，可整体重试
            uni.showToast({ title: rr.msg || '保存失败', icon: 'none' })
          }
        } catch (e) {
          uni.showToast({ title: '保存出错', icon: 'none' })
        } finally {
          this.saving = false
        }
        return
      }
      // 名字没匹配上时不放行（ADR-015，record + reminder 都拦）：先点选已有宠物（服务端 PET_UNKNOWN 双保险）
      if (kind !== 'med_stock' && this.parsed.pet_unknown) {
        uni.showToast({ title: '先选一只宠物吧', icon: 'none' })
        return
      }
      // 显式新增意图但没听清名字：建档意图不能被静默吞掉
      if (kind !== 'med_stock' && kind !== 'reminder' && this.parsed.new_pet && !this.parsed.pet) {
        uni.showToast({ title: '没听清名字，补一句宠物叫什么吧', icon: 'none' })
        return
      }
      // 健康记录必须落到一只宠物（手动直填 / AI 都拦）：非建档意图且没选宠 → 不放行（saveRecord 也会拒，前端先省一次往返）
      if (kind === 'record' && !this.parsed.is_new && !(this.parsed.pet || '').trim()) {
        uni.showToast({ title: '先选一只宠物吧', icon: 'none' })
        return
      }
      const batch = this.isBatch // 快照：成功后会清 selectedPets，toast / 附件分支按提交时态判
      const okMsg = kind === 'med_stock' ? '已入库' : kind === 'reminder' ? '已设提醒' : '已归档'
      this.saving = true
      try {
        const res = await callFn('saveRecord', { record: this.buildRecord() })
        const r = res.result || {}
        if (r.ok) {
          // 健康记录带附件：先归档成功再上传登记（批量无单 id、不挂附件，ADR-029；取消归档不产生云端孤儿；上传失败记录仍在，可去详情页补传）
          if (!batch && kind !== 'med_stock' && kind !== 'reminder' && this.atts.length && r.id) {
            uni.showLoading({ title: '上传附件中…', mask: true })
            const up = await uploadAndRegister(r.id, this.atts)
            uni.hideLoading()
            if (!up.ok) {
              await new Promise((done) =>
                uni.showModal({
                  title: '附件没传上',
                  content: `记录已归档，但附件上传失败：${up.msg}。可稍后在时间线点开这条记录补传。`,
                  showCancel: false,
                  complete: done,
                })
              )
            }
          }
          uni.showToast({ title: batch ? `已归档 ${r.count || this.selectedPets.length} 条` : okMsg, icon: 'success' })
          this.draft = ''
          this.parsed = null
          this.manual = false
          this.atts = []
          this.selectedPets = []
          // 让来源 tab 在返回后 onShow 刷新；稍等 toast 露出再返回
          setTimeout(() => {
            uni.navigateBack({ delta: 1 })
          }, 600)
        } else if (r.code === 'PET_UNKNOWN') {
          // 服务端兜底拒了（前端态被绕过 / 解析后名单变化）：批量回名单态留用户重选，单宠回错别字选择态
          this.petOptions = r.pets || [] // 无条件刷新（全家删空时 r.pets=[] 也要清掉幽灵 chip，否则 critic#2 在此边界失效，review #3）
          if (batch) {
            this.selectedPets = this.selectedPets.filter((n) => this.petOptions.includes(n)) // 剔除已失效宠名（critic#2）：否则幽灵名无 chip 可取消 → 永久卡 PET_UNKNOWN 死循环
            this.parsed.pet = this.selectedPets[0] || '' // mirror 首只同步，消除高亮 chip 与提交 pet 的分歧（review #2）
          } else this.parsed.pet_unknown = true
          uni.showToast({ title: r.msg || '没找到这只宠物，请选择', icon: 'none' })
        } else {
          uni.showToast({ title: r.msg || '保存失败', icon: 'none' })
        }
      } catch (e) {
        uni.hideLoading()
        uni.showToast({ title: '保存出错', icon: 'none' })
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 32rpx var(--pad-page) 48rpx;
  box-sizing: border-box;
}
/* 入口卡态：暗背景 + 居中卡（普通文档流，非 fixed，原生 textarea 不踩层级穿透坑，见 ADR-017） */
.page--entry {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx 24rpx;
  background: rgba(58, 51, 48, 0.45);
}

/* 入口卡 */
.card {
  width: 100%;
  background: var(--c-card);
  border-radius: var(--r-xl);
  box-shadow: var(--sh-3);
  padding: 24rpx var(--pad-page) 32rpx;
  box-sizing: border-box;
  animation: card-rise 0.3s ease-out both;
}
@keyframes card-rise {
  from { opacity: 0; transform: translateY(48rpx); }
  to { opacity: 1; transform: translateY(0); }
}
.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card__title {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  font-size: var(--fs-h2);
  font-weight: 700;
  color: var(--c-text);
}
.card__close {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  text-align: center;
  font-size: var(--fs-body);
  color: var(--c-text-3);
}
.card__close--press {
  opacity: 0.5;
}
.card__hint {
  display: block;
  margin-top: 4rpx;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
  line-height: 1.5;
}
.rec__input {
  margin-top: 32rpx;
  width: 100%;
  box-sizing: border-box;
  min-height: 200rpx;
  padding: 28rpx;
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  font-size: var(--fs-body);
  line-height: 1.6;
  color: var(--c-text);
  box-shadow: var(--sh-1);
}
.rec__input--focus {
  border-color: var(--c-primary-soft);
  background: var(--c-primary-wash);
}
.rec__ph {
  color: var(--c-text-2);
}
.rec__examples {
  margin-top: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.rec__ex {
  align-self: flex-start;
  max-width: 100%;
  padding: 16rpx 28rpx;
  background: var(--c-primary-wash);
  border: 1px solid var(--c-primary-tint);
  border-radius: var(--r-pill);
  font-size: var(--fs-sub);
  color: var(--c-primary-deep);
}
.rec__ex--press {
  background: var(--c-primary-tint);
}
.rec__btn {
  margin-top: 48rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: var(--r-pill);
  background: var(--c-primary-grad);
  box-shadow: var(--sh-primary);
  color: var(--c-text-inv);
  font-size: var(--fs-body);
  font-weight: 600;
  letter-spacing: 4rpx;
}
.rec__btn--press {
  transform: scale(0.98);
  box-shadow: var(--sh-press);
}
.rec__btn--loading {
  background: var(--c-primary-soft);
  box-shadow: none;
}
/* 「或换种方式」分隔 + 次级入口（结构化 / 语音，ADR-017） */
.card__alt-divider {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin: 28rpx 0 20rpx;
}
.card__alt-line {
  flex: 1;
  height: 2rpx;
  background: var(--c-divider);
}
.card__alt-text {
  font-size: var(--fs-cap);
  color: var(--c-text-3);
}
.alt-entries {
  display: flex;
  gap: 16rpx;
}
.alt-entry {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  padding: 20rpx 8rpx;
  background: var(--c-bg-sink);
  border-radius: var(--r-lg);
}
.alt-entry--press {
  transform: scale(0.97);
}
.alt-entry__ico {
  width: 48rpx;
  height: 48rpx;
}
.alt-entry__name {
  font-size: var(--fs-sub);
  font-weight: 600;
  color: var(--c-text);
}

/* 录入表单（整页内联，替代旧底部弹层；规避原生 input/picker 在 fixed 弹层的层级穿透） */
.form {
  padding-top: 8rpx;
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}
.sheet__title {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  font-size: var(--fs-h2);
  font-weight: 700;
  color: var(--c-text);
}
.sheet__hint {
  display: block;
  font-size: var(--fs-cap);
  color: var(--c-text-2);
  margin-top: 6rpx;
  margin-bottom: 24rpx;
}
.sheet__fields {
  background: var(--c-card-cream);
  border-radius: var(--r-md);
  padding: 4rpx 28rpx;
  margin-bottom: 28rpx;
}
.field-row {
  display: flex;
  align-items: center;
  min-height: 88rpx;
  padding: 18rpx 0;
  border-bottom: 1px solid var(--c-divider);
}
.field-row:last-child {
  border-bottom: none;
}
.field-row__label {
  width: 120rpx;
  flex: none;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
}
.field-row__value {
  flex: 1;
  font-size: var(--fs-body);
  color: var(--c-text);
  font-weight: 500;
  text-align: right;
}
.field-row__value--empty {
  color: var(--c-text-3);
  font-weight: 400;
}
.new-badge {
  margin-left: 8rpx;
  font-size: var(--fs-tiny);
  color: var(--c-warning);
  font-weight: 500;
}
.new-badge--warn {
  color: var(--c-danger);
}
.chips {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  justify-content: flex-end;
}
.chip {
  flex: none; /* 物种 chip 扩 8 后防被压缩（ADR-023/024），配合 .chips flex-wrap 自动换行 */
  height: 64rpx;
  padding: 0 28rpx;
  border-radius: var(--r-pill);
  background: var(--c-bg-sink);
  color: var(--c-text-2);
  font-size: var(--fs-sub);
  font-weight: 500;
  display: flex;
  align-items: center;
}
.chip--active {
  background: var(--c-primary-tint);
  color: var(--c-primary-deep);
  font-weight: 600;
  box-shadow: inset 0 0 0 2rpx var(--c-primary);
}
/* 批量提示（ADR-029）：多选 >1 只时的「各存一条」说明 */
.batch-hint {
  flex: 1;
  text-align: right;
  font-size: var(--fs-sub);
  color: var(--c-primary-deep);
}
/* 多事件拆条卡（ADR-030 Round 2）：每条一张精简卡 */
.multi-card {
  margin-top: 20rpx;
  padding: 12rpx 20rpx 4rpx;
  background: var(--c-bg-sink);
  border-radius: var(--r-lg);
}
.multi-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 0 4rpx;
}
.multi-card__idx {
  font-size: var(--fs-sub);
  font-weight: 600;
  color: var(--c-text-2);
}
.multi-card__del {
  font-size: var(--fs-sub);
  color: var(--c-danger);
  padding: 4rpx 12rpx;
}
.multi-card__warn {
  font-size: var(--fs-tiny);
  font-weight: 500;
  color: var(--c-danger);
}

/* 手动 kind 分段切换（ADR-017） */
.kind-switch {
  display: flex;
  gap: 8rpx;
  margin-bottom: 24rpx;
  padding: 8rpx;
  background: var(--c-bg-sink);
  border-radius: var(--r-pill);
}
.kind-switch__item {
  flex: 1;
  height: 68rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  border-radius: var(--r-pill);
  font-size: var(--fs-sub);
  color: var(--c-text-2);
}
.kind-switch__ico {
  width: 34rpx;
  height: 34rpx;
}
.kind-switch__item--active {
  background: var(--c-card);
  color: var(--c-primary-deep);
  font-weight: 600;
  box-shadow: var(--sh-1);
}

/* 可编辑字段：行内 input / picker（右对齐，贴合只读 field-row__value 排版） */
.field-row__input {
  flex: 1;
  min-width: 0;
  height: 56rpx;
  padding: 0;
  background: transparent;
  text-align: right;
  font-size: var(--fs-body);
  font-weight: 500;
  color: var(--c-text);
}
.ph {
  color: var(--c-text-3);
  font-weight: 400;
}
.field-row__pick {
  flex: 1;
  min-width: 0;
}
.pickbox {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10rpx;
}
.pickbox__v {
  font-size: var(--fs-body);
  font-weight: 500;
  color: var(--c-text);
  text-align: right;
}
.pickbox__c {
  font-size: var(--fs-tiny);
  color: var(--c-primary);
}
/* 事件时间：日期 + 时刻两段（精确到分，ADR-018） */
.dt-pick {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  gap: 28rpx;
}
.dt-pick__part {
  min-width: 0;
}

/* 附件选择区（确认卡片内） */
.att {
  margin-bottom: 28rpx;
}
.att__label {
  display: block;
  font-size: var(--fs-cap);
  color: var(--c-text-2);
  margin-bottom: 14rpx;
}
.att__scroll {
  white-space: nowrap;
}
.att__inner {
  display: inline-flex;
  gap: 16rpx;
}
.att-cell {
  position: relative;
  width: 140rpx;
  height: 140rpx;
  flex: none;
  border-radius: var(--r-sm);
  background: var(--c-bg-sink);
  overflow: hidden;
}
.att-cell__img {
  width: 100%;
  height: 100%;
}
.att-cell__mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  font-size: 44rpx;
}
.att-cell__pdf {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  padding: 0 10rpx;
  box-sizing: border-box;
}
.att-cell__pdf-ico {
  width: 48rpx;
  height: 48rpx;
}
.att-cell__pdf-name {
  max-width: 100%;
  font-size: var(--fs-tiny);
  color: var(--c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.att-cell__del {
  position: absolute;
  top: 0;
  right: 0;
  width: 60rpx;
  height: 60rpx;
  line-height: 60rpx;
  text-align: center;
  background: rgba(58, 51, 48, 0.55);
  color: var(--c-text-inv);
  font-size: var(--fs-cap);
  border-radius: 0 0 0 var(--r-sm);
}
.att-cell--add {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56rpx;
  color: var(--c-text-3);
  border: 2rpx dashed var(--c-border);
  background: transparent;
  box-sizing: border-box;
}

.sheet__actions {
  display: flex;
  gap: 20rpx;
}
/* .btn-primary / .btn-ghost (+--press) 已抽到 App.vue 全局（Round 2 去重） */
</style>
