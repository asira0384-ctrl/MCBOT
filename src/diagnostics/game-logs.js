'use strict';
const crypto=require('node:crypto');
const categories={connection:'接続',mining:'採掘',movement:'移動',health:'体力・Totem',gear:'装備',supply:'補給',greetings:'挨拶',system:'その他'};
function category(text){return /接続|認証|オンライン|バイバイ|spawn/.test(text)?'connection':/Totem|体力|回復|死亡|リスポーン|食/.test(text)?'health':/採掘|掘|チャンク|足場/.test(text)?'mining':/補給|受け取|シュルカー/.test(text)?'supply':/移動|経路|位置補正|飛行/.test(text)?'movement':/装備|インベントリ|AutoSlot/.test(text)?'gear':'system';}
const key=text=>crypto.createHash('sha256').update(String(text).replace(/-?\d+(?:\.\d+)?/g,'#')).digest('hex').slice(0,16);
function settings(state){return {enabled:true,categories:{},mutedMessages:[],...state.gameLogs};}
function allowed(state,text,kind){const s=settings(state);return s.enabled!==false&&s.categories[kind||category(text)]!==false&&!s.mutedMessages.includes(key(text));}
function configure(state,data){const s=settings(state);if(data.category==='all')s.enabled=!!data.enabled;else if(Object.hasOwn(categories,data.category))s.categories={...s.categories,[data.category]:!!data.enabled};else if(data.message){const k=key(String(data.message).slice(0,500));s.mutedMessages=s.mutedMessages.filter(x=>x!==k);if(data.enabled===false)s.mutedMessages.push(k);s.mutedMessages=s.mutedMessages.slice(-100);}else throw Error('ログの種類を選んでください');state.gameLogs=s;return s;}
module.exports={categories,category,key,settings,allowed,configure};
