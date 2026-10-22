#!/bin/zsh
# SPIKE: 3 runs of bench/engines.bench.ts per variant; JSON in spike/results, logs in spike/results/*.log
cd "${0:A:h}/.."
out=spike/results
mkdir -p $out
run() {
  local name=$1; shift
  for i in 1 2 3; do
    env "$@" npx vitest bench --run bench/engines.bench.ts --outputJson $out/$name-$i.json > $out/$name-$i.log 2>&1
    echo "$name run $i done"
  done
}
run memory EARS_BENCH_ENGINE=memory
run disk EARS_BENCH_ENGINE=disk
run disk-cache EARS_BENCH_ENGINE=disk EARS_DISK_CACHE=1
run disk-nosync EARS_BENCH_ENGINE=disk EARS_DISK_NOSYNC=1
run disk-nosync-cache EARS_BENCH_ENGINE=disk EARS_DISK_NOSYNC=1 EARS_DISK_CACHE=1
run disk-nosync-noindex EARS_BENCH_ENGINE=disk EARS_DISK_NOSYNC=1 EARS_DISK_INDEX=0
node spike/summarize.mjs
