'use strict';
const {Vec3}=require('vec3');
const {air,solid,hazard}=require('./util');
const {placementSupport}=require('./geometry');
const offsets=[[1,0],[-1,0],[0,1],[0,-1]];
function full(block){if(!solid(block)||!['obsidian','bedrock','crying_obsidian'].includes(block.name))return false;return !block.shapes||block.shapes.some(s=>s[0]<=0&&s[1]<=0&&s[2]<=0&&s[3]>=1&&s[4]>=1&&s[5]>=1);}
function clear(bot,p){return air(bot.blockAt(p))&&air(bot.blockAt(p.offset(0,1,0)))&&!hazard(bot.blockAt(p))&&!hazard(bot.blockAt(p.offset(0,1,0)));}
function protectedHole(bot,p){return clear(bot,p)&&solid(bot.blockAt(p.offset(0,-1,0)))&&offsets.every(([x,z])=>full(bot.blockAt(p.offset(x,0,z))));}
class SelfDefense{
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.state='OFF';this.lastBuild=0;this.lastScan=0;this.walls=[];this.goal=null;this.task=null;this.destroyed=false;}
 get required(){return require('./realms').isIgn(this.runtime)&&this.runtime.canFight();}
 pose(){const b=this.bot,t=this.runtime.travel;return t.embed?new Vec3(b.entity.position.x,t.embed.original,b.entity.position.z):b.entity.position;}
 occupied(p){return [...this.bot.actors.values()].some(a=>a.player&&a.position.y<p.y+1&&a.position.y+1.8>p.y&&Math.abs(a.position.x-p.x-.5)<.75&&Math.abs(a.position.z-p.z-.5)<.75);}
 nearest(p){let best=null,score=Infinity;for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)for(const y of [0,-1,1]){const q=p.offset(x,y,z);if(this.occupied(q)||!protectedHole(this.bot,q))continue;const distance=this.pose().distanceTo(q.offset(.5,0,.5));if(distance<score&&distance<=4.5){score=distance;best=q;}}return best;}
 enabled(enemy){const r=this.runtime,b=this.bot;return !this.destroyed&&!!enemy&&(this.required||r.config.feettrap)&&!r.paused&&!r.travel.route&&!r.pendingMove&&!r.follower?.config.enabled&&!r.travel.flight&&!b.dead&&!b.manualInventoryBusy&&!b.handUse&&!r.needsFood()&&this.pose().distanceTo(enemy.position)<=r.config.range*.85&&(typeof r.canSeeEnemy!=='function'||r.canSeeEnemy(enemy));}
 motion(enemy){
  if(!this.enabled(enemy)){if(!this.task){this.goal=null;this.state='移動・回復中、または対象が遠いため待機';}return false;}
  const b=this.bot,r=this.runtime,p=this.pose().floored(),now=Date.now();
  if(protectedHole(b,p)){this.goal=p;this.state='自分のホール内で防御';r.travel.stopFollowing();return true;}
  if(this.goal&&!protectedHole(b,this.goal))this.goal=null;
  if(!this.goal&&now-this.lastScan>=1000){this.lastScan=now;this.goal=this.nearest(p);}
  if(this.goal&&this.goal.distanceTo(p)>.1){r.travel.follow(this.goal.offset(.5,0,.5),.21,'self-hole',.25);this.state='近くの空いているホールへ移動';return true;}
  if(!clear(b,p)||!solid(b.blockAt(p.offset(0,-1,0)))){this.state='足元と頭上の空間・床の受信を待機';return false;}
  const item=b.find('obsidian');if(!item){this.state='ホール作成用の黒曜石がありません';return false;}
  r.travel.stopFollowing();if(this.task||b.actionHandBusy||b.pendingStackRequest)return true;
  const delay=this.required?150:1500;if(now-this.lastBuild<delay)return true;
  const candidates=[];for(const [x,z]of offsets){const wall=p.offset(x,0,z),existing=b.blockAt(wall);if(full(existing))continue;if(!air(existing)||this.occupied(wall))continue;const below=wall.offset(0,-1,0),floor=b.blockAt(below);if(!solid(floor)){if(!air(floor)||!placementSupport(b,below))continue;candidates.push({position:below,floor:true});}else if(placementSupport(b,wall))candidates.push({position:wall,floor:false});}
  const plan=candidates.find(v=>b.reach({position:v.position}));if(!plan){this.state='自分の囲いに置ける面がありません';return true;}
  this.state=plan.floor?'自分のホールの床を作成':'自分の足元の囲いを作成';this.lastBuild=now;this.controller=new AbortController();const signal=this.controller.signal;
  this.task=b.place(plan.position,item,signal,{timeout:Math.max(700,Math.min(2000,(b.rttMs||150)*3+200))}).then(()=>{this.walls.push({x:plan.position.x,y:plan.position.y,z:plan.position.z});this.walls=this.walls.slice(-32);this.state='設置を確認・次の面を確認';}).catch(e=>{if(!signal.aborted)this.state='ホール設置の確認待ち: '+e.message;}).finally(()=>{this.task=null;this.controller=null;});return true;
 }
 stop(){this.controller?.abort();if(this.runtime.travel.following?.kind==='self-hole')this.runtime.travel.stopFollowing();this.goal=null;this.state='OFF';}
 snapshot(){return {required:this.required,state:this.state,goal:this.goal,placing:!!this.task,walls:this.walls};}
 destroy(){this.destroyed=true;this.stop();}
}
module.exports={SelfDefense,protectedHole};
