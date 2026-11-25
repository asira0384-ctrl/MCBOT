'use strict';
const { Vec3 } = require('vec3');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = p => `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
const vec = p => new Vec3(p.x,p.y,p.z);
const clean = s => String(s).replace(/§./g,'').trim();
const norm = s => clean(s).toLowerCase();
const itemName = s => norm(s).replace(/^minecraft:/,'');
const air = b => !!b && ['air','cave_air','void_air'].includes(b.name);
const hazard = b => !b || /unknown|lava|water|fire|magma|cactus|portal/.test(b.name);
const solid = b => !!b && !air(b) && !hazard(b) && b.boundingBox === 'block';
function integer(v,min,max) { const n=Number(v); if (!Number.isInteger(n)||n<min||n>max) throw Error(`整数 ${min}〜${max} を指定してください`); return n; }
function emptyStats() { return {total:0,obsidian:0,other:0,byBlock:{}}; }
function addStat(s,name) { s.total++; s[name==='obsidian'?'obsidian':'other']++; s.byBlock[name]=(s.byBlock[name]||0)+1; }
function canDiscard(name,scaffold) { return name!==scaffold && !/_pickaxe$|shulker_box$|enchanted_golden_apple|golden_apple|ender_chest|totem|elytra|helmet|chestplate|leggings|boots/.test(name); }
module.exports={sleep,key,vec,clean,norm,itemName,air,hazard,solid,integer,emptyStats,addStat,canDiscard};
