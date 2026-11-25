#include <nlohmann/json.hpp>
#include <vector>
#include <string>
#include <deque>
#include <map>
#include <set>
#include <algorithm>
#include <cassert>
#include <iostream>
using J=nlohmann::json;using ULONGLONG=unsigned long long;
ULONGLONG GetTickCount64(){return 100;}
float clipTop=-10000,clipBottom=10000;bool tweening=false;ULONGLONG tweenTick=0;
struct Hit{float x,y,w,h;std::string type,m,k;J data;};std::vector<Hit>hits;
std::deque<std::string>opened;std::map<std::string,float>expansion;
J schema=J::object();
const J& settingsFor(const std::string&m){static const J empty=J::array();return schema.contains(m)?schema[m]:empty;}
void hit(float x,float y,float w,float h,std::string type,std::string m="",std::string k="",J data=nullptr){float top=std::max(y,clipTop),bottom=std::min(y+h,clipBottom);if(bottom>top)hits.push_back({x,top,w,bottom-top,std::move(type),std::move(m),std::move(k),std::move(data)});}
bool isOpen(std::string m){return std::find(opened.begin(),opened.end(),m)!=opened.end();}
bool hasSettings(const std::string&m){if(!settingsFor(m).empty())return true;static std::set<std::string>extra={"MicrosoftLogin","AccountAdd","AccountEdit","Friendlist","EnemyList","Config","Activity","ChatQueue","Inventory","Wallpaper"};return extra.count(m);}
void toggleOpen(std::string m){if(!hasSettings(m))return;if(!expansion.count(m))expansion[m]=isOpen(m)?1.f:0.f;auto it=std::find(opened.begin(),opened.end(),m);if(it!=opened.end())opened.erase(it);else{if(opened.size()>=2){auto old=opened.front();if(!expansion.count(old))expansion[old]=1;opened.pop_front();}opened.push_back(m);}tweening=true;tweenTick=GetTickCount64();}
float reveal(std::string m){if(!expansion.count(m))return isOpen(m)?1.f:0.f;float v=expansion[m];return v*v*(3-2*v);}
std::string targetAt(float x,float y){for(auto i=hits.rbegin();i!=hits.rend();++i)if(x>=i->x&&x<=i->x+i->w&&y>=i->y&&y<=i->y+i->h)return i->type=="block"?"blocked":i->m;return "none";}
int main(){for(auto n:{"First","Second","Third"})schema[n]=J::array({J::array({"Speed","range",1})});assert(!hasSettings("AutoBack"));toggleOpen("AutoBack");assert(opened.empty());assert(hasSettings("MicrosoftLogin"));clipTop=100;clipBottom=200;hit(10,90,100,30,"module","partial");assert(hits.size()==1&&hits[0].y==100&&hits[0].h==20);assert(targetAt(30,95)=="none");assert(targetAt(30,110)=="partial");hits.clear();clipTop=-10000;clipBottom=10000;hit(0,0,152,500,"block");hit(0,70,152,26,"module","MicrosoftLogin");hit(60,40,152,250,"block");assert(targetAt(80,80)=="blocked");assert(targetAt(20,80)=="MicrosoftLogin");hit(60,70,152,26,"module","Wallpaper");assert(targetAt(80,80)=="Wallpaper");toggleOpen("First");assert(isOpen("First")&&reveal("First")==0);expansion["First"]=1;toggleOpen("Second");toggleOpen("Third");assert(opened.size()==2&&!isOpen("First")&&isOpen("Second")&&isOpen("Third"));expansion["Third"]=.5;assert(reveal("Third")==.5f);toggleOpen("Third");assert(!isOpen("Third")&&tweening);std::cout<<"Hit clipping, foreground blocking, top module targeting, two-drawer limit and animation assertions passed.\n";}
