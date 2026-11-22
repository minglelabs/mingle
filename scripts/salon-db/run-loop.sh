#!/bin/bash
# 수집기를 반복 실행하되, 메모리가 부족하면 쉬었다가 다시 돈다.
#   ./run-loop.sh naver-place.mjs        (env: LIMIT/MAX 등 그대로 전달)
#   MIN_FREE=25 (memory_pressure 여유 %), MIN_SWAP_MB=1000 (남은 스왑), REST=60 (실행 사이 초)
cd "$(dirname "$0")"
MIN_FREE=${MIN_FREE:-25}; MIN_SWAP_MB=${MIN_SWAP_MB:-1000}; REST=${REST:-60}
mem_ok() {
  local free swapfree
  free=$(memory_pressure | awk -F': ' '/free percentage/{gsub("%","",$2); print $2}')
  swapfree=$(sysctl -n vm.swapusage | sed -E 's/.*free = ([0-9.]+)M.*/\1/' | cut -d. -f1)
  # 스왑을 아예 안 쓰는 상태(total 0)면 free 0으로 나오므로 total도 본다
  local swaptotal; swaptotal=$(sysctl -n vm.swapusage | sed -E 's/total = ([0-9.]+)M.*/\1/' | cut -d. -f1)
  [ "${free:-0}" -ge "$MIN_FREE" ] && { [ "${swaptotal:-0}" -lt "$((MIN_SWAP_MB*2))" ] || [ "${swapfree:-0}" -ge "$MIN_SWAP_MB" ]; }
}
while true; do
  until mem_ok; do echo "$(date +%T) 메모리 부족 → 5분 대기 ($(memory_pressure | tail -1))"; sleep 300; done
  node "$@"
  sleep "$REST"
done
