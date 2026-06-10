#!/usr/bin/env bash
# 把 transform.py 暂存的历史附件批量上传到云存储 att/<recordId>/（轮3，见 ADR-014）。
# importNotion 的 import 会按同样的 att/<recordId>/<name> key 拼 fileID 并验证。
# 用法：bash upload-attachments.sh [stage_dir] [envId]
set -euo pipefail
STAGE="${1:-/tmp/petslog_att_stage}"
ENV="${2:-cloud1-d5g69cxtta6c18918}"
# 绕过 harness 注入的本地代理直连
export http_proxy= https_proxy= all_proxy= HTTP_PROXY= HTTPS_PROXY= ALL_PROXY=

[ -d "$STAGE/att" ] || { echo "找不到暂存目录 $STAGE/att，先跑 transform.py"; exit 1; }
# 幂等：失败不中断（COS 临时凭证 getAuthorization TmpSecretId 会在持续负载下短时失效），
# 记录失败后继续，末尾报清单；重复跑本脚本即可补齐（已传的覆盖、便宜）。
n=0; fails=()
for d in "$STAGE"/att/*/; do
  rid=$(basename "$d")
  ok=0
  for try in 1 2 3 4 5; do
    if wxcloud storage:upload "$d" -e "$ENV" -r "att/$rid/" >/dev/null 2>&1; then ok=1; break; fi
    sleep 3
  done
  if [ "$ok" = 1 ]; then n=$((n+1)); else fails+=("$rid"); echo "  ✗ $rid"; fi
  sleep 1
done
echo "成功 $n / 总 $(ls -d "$STAGE"/att/*/ | wc -l | tr -d ' ')"
if [ ${#fails[@]} -gt 0 ]; then echo "失败 ${#fails[@]}: ${fails[*]}"; exit 2; fi
echo "全部上传完成"
