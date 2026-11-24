'use strict';
const equipment = require('../../inventory/equipment/equipment');
const {
  lineOfSight
} = require('../../../src/bedrock/actors');
// Methods use Runtime as `this`; lifecycle and scheduling stay in runtime.js.
module.exports = {
  meleeTick(enemy) {
    if (this.meleeTask) return this.meleeTask;
    const task = this.performMelee(enemy).finally(() => {
      if (this.meleeTask === task) this.meleeTask = null;
    });
    this.meleeTask = task;
    task.catch(e => {
      if (e.code !== 'HAND_BUSY') this.meleeState = '剣の確認待ち: ' + e.message;
    });
    return task;
  },
  async performMelee(enemy, signal) {
    const b = this.bot;
    this.meleeState = '待機';
    if (!this.config.killaura || b.dead || this.paused || this.paOwnsHand(enemy)) return false;
    if (b.handUse || b.actionHandBusy || this.consumeTask || this.needsFood()) {
      this.meleeState = '手の操作・食事を優先';
      return false;
    }
    if (b.entity.position.distanceTo(enemy.position) > this.config.range) {
      this.meleeState = '射程外';
      return false;
    }
    if (!this.canSeeEnemy(enemy)) {
      this.meleeState = '壁で遮られています';
      return false;
    }
    if (Date.now() - this.lastAttack < (this.config.attackDelay || 100)) return false;
    const sword = this.combatSword();
    if (!sword || require('../../inventory/items/inventory').touches(b, sword.slot) || require('../../inventory/items/inventory').touches(b, b.quickBarSlot) || sword.slot >= 9 && b.pendingStackRequest) {
      this.meleeState = '剣の装填・サーバー確認待ち';
      return false;
    }
    const hand = require('../../inventory/items/hand'),
      lease = hand.claim(b, 'melee');
    try {
      await b.equip(sword.slot, signal);
      const aim = this.aimAtEnemy(enemy);
      if (aim && this.config.rotateKA !== false) {
        b.lookAt(aim, false);
        const delay = this.config.rotateDelayKA || 0;
        if (delay > 0) await require('node:timers/promises').setTimeout(delay, undefined, {
          signal
        });
      }
      await hand.settled(b, signal, 'combat');
      const current = b.actors.get(String(enemy.id));
      if (!current || signal?.aborted || this.paused || b.manualInventoryBusy || this.paOwnsHand(current) || !this.config.killaura || b.handUse || this.needsFood() || !require('../targeting/tactics').eligible(this, current) || b.entity.position.distanceTo(current.position) > this.config.range || !this.canSeeEnemy(current) || !b.name(b.items[b.quickBarSlot]).endsWith('_sword')) return false;
      if (this.config.rotateKA !== false) b.lookAt(this.aimAtEnemy(current), false);
      if (b.attack(current) === false) return false;
      this.lastAttack = Date.now();
      this.attacks++;
      this.meleeState = '剣の選択後に攻撃要求を送信';
      // Do not let the crystal loop replace the sword in the same packet batch.
      if (!hand.flush(b)) await require('node:timers/promises').setTimeout(25, undefined, {
        signal
      });
      return true;
    } finally {
      hand.release(b, lease);
    }
  },
  aimAtEnemy(enemy) {
    return [1, 1.6, .5].map(y => enemy.position.offset(0, y, 0)).find(point => lineOfSight(this.bot, point)) || null;
  },
  canSeeEnemy(enemy) {
    return !!this.aimAtEnemy(enemy);
  },
  combatSword() {
    return this.bot.list().filter(i => i.slot < 9 && i.name.endsWith('_sword')).sort((a, b) => equipment.rank(this.bot, b) - equipment.rank(this.bot, a))[0] || equipment.best(this.bot, '_sword');
  }
};
