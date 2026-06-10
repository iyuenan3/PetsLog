#!/usr/bin/env python3
# coding: utf-8
"""
Notion 猫猫记录导出 → PetsLog 结构化 JSON（轮3 历史导入，见 ADR-012/013）。
直接结构化转换，不走 AI 重解析。输出：
  - cloudfunctions/importNotion/data.json  ：{ pets:[...], records:[...] }（gitignore，真实猫名只进私有云端）
  - <stage>/att/<recordId>/<file>          ：待 wxcloud storage:upload 的附件，按记录分目录
清洗规则：日期含区间取起始 + 定长零填充；费用去 ¥/千分位；档案链取宠物名；附件双重 URL 解码（取文件单层解码名定位磁盘文件）；
event_type 按名称/内容映射到 7 桶；名称 → 病程 tag；身价不入库；主粮(foods)本轮不导。
用法：python3 transform.py <export_root> [stage_dir]
"""
import csv, json, os, sys, re, urllib.parse, glob, shutil

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    '~/Downloads/ExportBlock-e79e9e74-9cd7-42e1-9f52-ce9a8154f616-Part-1')
STAGE = sys.argv[2] if len(sys.argv) > 2 else '/tmp/petslog_att_stage'
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'cloudfunctions', 'importNotion')
SUB = os.path.join(ROOT, '猫猫记录')


def find_csv(prefix):
    g = glob.glob(os.path.join(SUB, prefix + '*_all.csv'))
    if not g:
        g = glob.glob(os.path.join(SUB, prefix + '*.csv'))
    return sorted(g)[0]


def norm_date(s):
    """'2018年10月18日' / 区间 '... → ...' 取起始 → 'YYYY-MM-DD'；解析不出回 ''"""
    if not s:
        return ''
    s = s.split('→')[0].strip()
    m = re.search(r'(\d{4})\D+(\d{1,2})\D+(\d{1,2})', s)
    if not m:
        return ''
    return f'{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}'


def num_or_null(s):
    """费用：'¥2,800.00' → 2800；空/无数字 → None。多小数点只取前两段、负号保留、解析不出回 None（防 float 崩溃）"""
    if not s:
        return None
    neg = '-' in s
    t = re.sub(r'[^\d.]', '', s)
    parts = t.split('.')
    t = parts[0] + ('.' + parts[1] if len(parts) > 1 else '')
    if t in ('', '.'):
        return None
    try:
        v = float(t)
    except ValueError:
        return None
    v = -v if neg else v
    return int(v) if v == int(v) else v


def num_or_null_weight(s):
    return num_or_null(s)


def pet_names(link):
    """'小葵 (%E7%8C%AB...md)' 或逗号分隔多个 → ['小葵', ...]"""
    out = []
    for part in (link or '').split(','):
        name = part.strip().split(' (')[0].strip()
        if name:
            out.append(name)
    return out


def att_paths(cell):
    """附件列 → [(local_abs_path, human_name)]；CSV 单层解码定位磁盘文件，双层解码作展示名"""
    res = []
    for part in (cell or '').split(','):
        part = part.strip()
        if not part:
            continue
        rel_once = urllib.parse.unquote(part)              # 单层：匹配磁盘文件名
        human = urllib.parse.unquote(urllib.parse.unquote(os.path.basename(part)))  # 双层：人类可读名
        local = os.path.join(ROOT, rel_once)
        res.append((local, human))
    return res


SYMPTOM_HINT = re.compile(r'炎|病|肿|瘤|尿闭|癫痫|拉稀|腹泻|呕|藓|虫|外伤|伤|咳|发烧|过敏|结石|贫血')


def event_type(name, hospital, med, source_deworm):
    if source_deworm:
        return '驱虫'
    n = name or ''
    if n == '记录体重' or n == '称重':
        return '体重'
    if '疫苗' in n or '免疫' in n:
        return '疫苗'
    if n in ('绝育', '体检') or '复查' in n or '手术' in n or '体检' in n:
        return '就医'
    if n == '到家':
        return '其它'
    if hospital:
        return '就医'
    if med:
        return '用药'
    if SYMPTOM_HINT.search(n):
        return '症状'
    return '其它'


def att_type(path):
    e = path.lower().rsplit('.', 1)[-1]
    if e in ('jpg', 'jpeg', 'png', 'gif', 'webp'):
        return 'image'
    if e in ('mp4', 'mov', 'm4v'):
        return 'video'
    if e == 'pdf':
        return 'pdf'
    return None


def safe_name(human, i):
    """云存储 key 用安全 ASCII 名，保留扩展名"""
    ext = human.rsplit('.', 1)[-1].lower() if '.' in human else 'bin'
    return f'{i}.{ext}'


def main():
    pets, records = [], []
    att_manifest = []        # (local, record_id, cloud_name)
    missing = []

    # ---- 档案 → pets ----
    for r in csv.DictReader(open(find_csv('档案'), encoding='utf-8-sig')):
        name = (r.get('姓名') or '').strip()
        if not name:
            continue
        # note 只取「备注」自由文本；「简介」是指向 Notion 页的链接、「品种常见病」是品种通用科普，均不入库
        note = (r.get('备注') or '').strip()
        breed = (r.get('品种') or '').strip()
        species = 'dog' if ('犬' in breed or '狗' in breed) else 'cat'  # 7 猫 2 狗；红线仅猫狗
        chronic = (r.get('病史') or '').strip()
        _nt = chronic + note  # 病史/备注含「绝育」→ 预填，用户可改（ADR-014）；排否定词防「未绝育/没绝育」误判
        neutered = ('绝育' in _nt) and ('未绝育' not in _nt) and ('没绝育' not in _nt)
        pets.append({
            'name': name,
            'species': species,
            'breed': breed,
            'birthday': norm_date(r.get('生日', '')),
            'home_date': norm_date(r.get('到家日期', '')),
            'chronic': chronic,
            'note': note,
            'intro': '',                            # 自由文本简介，导入留空（导出「简介」是链接，不入库）
            'price_base': num_or_null(r.get('初始身价', '')),  # 初始身价；当前身价前端派生
            'allergy': '',
            'neutered': neutered,
            'avatar': '',                           # 导出无头像，emoji 兜底
        })

    # ---- 健康记录 → records ----
    for idx, r in enumerate(csv.DictReader(open(find_csv('猫猫健康记录'), encoding='utf-8-sig'))):
        names = pet_names(r.get('档案', ''))
        pet = names[0] if names else ''
        name = (r.get('名称') or '').strip()
        desc = (r.get('事件描述') or '').strip()
        hospital = (r.get('就诊医院') or '').strip()
        med = (r.get('用药') or '').strip()
        rid = f'imp_h_{idx}'
        # 「到家」记录的费用列存的是购入身价（= 档案初始身价），不是就诊花费。
        # 必须置 None：否则它作为 records.cost 被累计花费求和，当前身价(=price_base+累计)双重计入身价（违 ADR-014）。
        cost = None if name == '到家' else num_or_null(r.get('费用', ''))
        rec = {
            '_id': rid,
            'pet': pet,
            'time': norm_date(r.get('日期', '')),
            'event_type': event_type(name, hospital, med, False),
            'tag': name,                            # 名称 = 病程线
            'desc': desc,
            'raw': desc,                            # 导入无主人原话，raw=desc
            'weight': num_or_null_weight(r.get('体重', '')),
            'hospital': hospital,
            'cost': cost,
            'med': med or None,
            'attachments': [],
        }
        # 附件
        for local, human in att_paths(r.get('附件', '')):
            t = att_type(local)
            if not t:
                continue
            if not os.path.exists(local):
                missing.append((rid, local))
                continue
            cname = safe_name(human, len(rec['attachments']))
            size = os.path.getsize(local)
            rec['attachments'].append({'key_name': cname, 'type': t, 'name': human, 'size': size, 'bytes': size})
            att_manifest.append((local, rid, cname))
        records.append(rec)

    # ---- 驱虫记录 → records（多猫展开 per-pet）----
    for idx, r in enumerate(csv.DictReader(open(find_csv('驱虫记录'), encoding='utf-8-sig'))):
        names = pet_names(r.get('档案', ''))
        med = (r.get('用药') or '').strip()
        date = norm_date(r.get('日期', ''))
        name = (r.get('名称') or '').strip() or '驱虫'
        for pi, pet in enumerate(names):
            records.append({
                '_id': f'imp_d_{idx}_{pi}',
                'pet': pet,
                'time': date,
                'event_type': '驱虫',
                'tag': '驱虫',
                'desc': (name + ('：' + med if med else '')).strip(),
                'raw': (name + ('：' + med if med else '')).strip(),
                'weight': None,
                'hospital': '',
                'cost': None,
                'med': med or None,
                'attachments': [],
            })

    # ---- 主粮记录 → foods（家庭级，见 ADR-014）----
    foods = []
    for r in csv.DictReader(open(find_csv('主粮记录'), encoding='utf-8-sig')):
        name = (r.get('名称') or '').strip()
        if not name:
            continue
        rng = (r.get('日期') or '')
        parts = [p.strip() for p in rng.split('→')]
        start = norm_date(parts[0]) if parts else ''
        end = norm_date(parts[1]) if len(parts) > 1 else ''
        foods.append({'name': name, 'start_date': start, 'end_date': end, 'current': False, 'note': ''})
    # 最近起始的一条标记为「当前在喂」
    if foods:
        latest = max(range(len(foods)), key=lambda i: foods[i]['start_date'] or '')
        foods[latest]['current'] = True
        foods[latest]['end_date'] = ''     # 在喂中，结束留空

    # ---- 落盘 ----
    os.makedirs(DATA_DIR, exist_ok=True)
    out = os.path.join(DATA_DIR, 'data.json')
    json.dump({'pets': pets, 'records': records, 'foods': foods}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    # ---- 暂存附件待上传：<STAGE>/att/<rid>/<cname> ----
    if os.path.isdir(STAGE):
        shutil.rmtree(STAGE)
    for local, rid, cname in att_manifest:
        d = os.path.join(STAGE, 'att', rid)
        os.makedirs(d, exist_ok=True)
        shutil.copy2(local, os.path.join(d, cname))

    # ---- 汇总 ----
    from collections import Counter
    et = Counter(x['event_type'] for x in records)
    print(f'pets: {len(pets)}  (neutered: {sum(1 for p in pets if p["neutered"])}，有初始身价: {sum(1 for p in pets if p["price_base"] is not None)})')
    print(f'records: {len(records)}  (event_type: {dict(et)})')
    print(f'foods: {len(foods)}  (当前在喂: {[f["name"] for f in foods if f["current"]]})')
    print(f'attachments: {len(att_manifest)} 个文件，{sum(1 for x in records if x["attachments"])} 条记录带附件')
    print(f'缺失附件: {len(missing)}')
    for rid, local in missing[:10]:
        print('  MISSING', rid, local)
    print(f'data.json → {os.path.normpath(out)}')
    print(f'附件暂存 → {STAGE}/att/')


if __name__ == '__main__':
    main()
