'use strict';
const { key } = require('../../../src/shared/util');

function history(worker) {
  return worker.state.nukeRecoveryHistory ??= [];
}

function intervene(worker, reason, now) {
  const target = worker.miningTarget?.position;
  const escaping=['lava-escape','floor-recovery','falling'].includes(worker.miningPhase);
  const chunk=escaping?null:worker.miner.chunk;
  if(worker.miningPhase==='lava-escape')worker.lavaEscapeDirection=(worker.lavaEscapeDirection||0)+1;
  const prior = history(worker).at(-1);
  if (prior?.result === '確認待ち') prior.result = '次の対処までに採掘確認なし';
  const event = { at: now, reason, target: target && {...target}, position: {...worker.bot.entity.position},
    detail: worker.missing || worker.runtime?.travel.waiting, action: escaping?'脱出経路を再探索':'対象と担当チャンクを一時保留して近場を再探索', result: '確認待ち' };
  const rows = history(worker);
  rows.push(event);
  if (rows.length > 80) rows.shift();
  if (target) worker.failed.set(key(target), now + 15000);
  if (chunk) chunk.deferUntil = now + 15000;
  worker.nearbyRecoveryUntil = now + 20000;
  worker.abort?.abort();
  worker.miningRetryAt=0;
  worker.runtime?.travel.stopFollowing?.();
  worker.approachPlan = null;
  worker.miningTarget = null;
  if (worker.runtime) worker.runtime.travel.groundPlan = null;
  worker.manager.store.save();
}

function monitor(worker, now = Date.now()) {
  const b = worker.bot, p = b.entity?.position;
  if (!p || !worker.running || !b.connected || b.dead || worker.cleanupRequested ||
      worker.controlBusy || b.handUse || b.mining || worker.runtime?.consumeTask ||
      worker.mobAura?.holdsMining || worker.mobAura?.busy || !['approach','retry','scan','repath','floor-recovery','lava-escape','hand-wait','falling'].includes(worker.miningPhase)) {
    worker.stallSample = null;
    return;
  }
  const old = worker.stallSample;
  if (!old || old.confirmed !== worker.lastNukeBreak || p.distanceTo(old.origin) > 1) {
    worker.stallSample = {at:now,origin:p.clone(),confirmed:worker.lastNukeBreak};
    return;
  }
  if (now-old.at<10000) return;
  if (!worker.miningTarget&&!worker.miner.waitingBlocked&&worker.miningPhase==='scan') return;
  intervene(worker,'10秒間、位置と採掘確認が進まず経路を反復',now);
  worker.stallSample = null;
}

function confirmed(worker, now) {
  const last = worker.state.nukeRecoveryHistory?.at(-1);
  if (last?.result !== '確認待ち') return;
  last.result = 'ブロック破壊をサーバーで確認';
  last.confirmedAt = now;
  worker.manager.store.save();
}
module.exports = {monitor, intervene, confirmed};
