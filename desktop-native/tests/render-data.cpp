#include <nlohmann/json.hpp>
#include <map>
#include <string>
#include <cassert>
#include <chrono>
#include <iostream>
#include <atomic>
#include <cstdlib>
std::atomic<size_t> allocations{0};
void* operator new(size_t n){allocations++;if(auto p=std::malloc(n))return p;throw std::bad_alloc();}
void operator delete(void* p)noexcept{std::free(p);}
void operator delete(void* p,size_t)noexcept{std::free(p);}
using J=nlohmann::json;
J state,catalog=J::object(),values=J::object();std::string target="all";
std::map<std::string,bool>localOn,optimistic;std::map<std::string,J>localDefs;
bool selectedBot(const J&b){return target=="all"||target==std::to_string(b.value("id",0))||target==b.value("server","");}
namespace before{
J value(std::string m,std::string key,J fallback=nullptr){if(values.contains(m)&&values[m].contains(key))return values[m][key];J ds=localDefs.count(m)?localDefs[m]:catalog.contains(m)?catalog[m].value("settings",J::array()):J::array();for(auto&d:ds)if(d[0]==key)return d[2];return fallback;}
bool on(std::string m){if(localDefs.count(m)||m.rfind("HUD",0)==0)return localOn[m];if(optimistic.count(m))return optimistic[m];bool any=false,all=true;for(auto&r:state.value("desktopModules",J::array()))for(auto&b:state.value("bots",J::array()))if(r.value("id",0)==b.value("id",0)&&selectedBot(b)){any=true;all=all&&r["states"].value(m,false);}return any&&all;}
}
namespace after{
const J& arrayMember(const J& object,const std::string& key){static const J empty=J::array();auto it=object.find(key);return it!=object.end()&&it->is_array()?*it:empty;}
const J& settingsFor(const std::string& m){auto it=localDefs.find(m);if(it!=localDefs.end())return it->second;auto c=catalog.find(m);static const J empty=J::array();return c!=catalog.end()?arrayMember(*c,"settings"):empty;}
J value(const std::string& m,const std::string& key,J fallback=nullptr){auto v=values.find(m);if(v!=values.end()&&v->is_object()){auto k=v->find(key);if(k!=v->end())return *k;}for(const auto&d:settingsFor(m))if(d.is_array()&&d.size()>2&&d[0]==key)return d[2];return fallback;}
bool on(std::string m){if(localDefs.count(m)||m.rfind("HUD",0)==0)return localOn[m];if(optimistic.count(m))return optimistic[m];bool any=false,all=true;for(auto&r:arrayMember(state,"desktopModules"))for(auto&b:arrayMember(state,"bots"))if(r.value("id",0)==b.value("id",0)&&selectedBot(b)){any=true;auto st=r.find("states");all=all&&st!=r.end()&&st->is_object()&&st->value(m,false);}return any&&all;}
}
int main(){
state={{"bots",J::array()},{"desktopModules",J::array()}};
for(int i=1;i<=20;i++){J inventory=J::array(),players=J::array(),flags=J::object();for(int j=0;j<36;j++)inventory.push_back({{"name","minecraft:totem_of_undying"},{"count",64},{"slot",j},{"enchantments",J::array({"unbreaking","protection"})}});for(int j=0;j<70;j++)players.push_back("Player-"+std::to_string(j));for(int j=0;j<60;j++)flags["Module"+std::to_string(j)]=(i!=17||j%2==0);state["bots"].push_back({{"id",i},{"server",i<=10?"ign":"2b2e"},{"inventory",inventory},{"onlinePlayers",players}});state["desktopModules"].push_back({{"id",i},{"states",flags}});}
for(int i=0;i<30;i++)localDefs["ClickGUI"].push_back(J::array({"Setting"+std::to_string(i),"color","#ad94d9"}));
for(auto t:{"all","ign","2b2e","17","99"}){target=t;for(int i=0;i<60;i++)assert(before::on("Module"+std::to_string(i))==after::on("Module"+std::to_string(i)));}
for(int i=0;i<30;i++)assert(before::value("ClickGUI","Setting"+std::to_string(i))==after::value("ClickGUI","Setting"+std::to_string(i)));
optimistic["Module1"]=true;assert(after::on("Module1"));optimistic.clear();
target="all";volatile int sum=0;
auto run=[&](bool old){allocations=0;auto t=std::chrono::steady_clock::now();for(int frame=0;frame<3;frame++){for(int i=0;i<60;i++)sum+=(old?before::on("Module"+std::to_string(i)):after::on("Module"+std::to_string(i)));for(int i=0;i<500;i++){auto v=old?before::value("ClickGUI","Setting20"):after::value("ClickGUI","Setting20");sum+=v.is_string();}}auto ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-t).count();std::cout<<(old?"before":"after")<<": "<<ms<<"ms / "<<allocations<<" allocations (3 frames)\n";};run(true);run(false);std::cout<<"All selection + settings equivalence assertions passed.\n";
}
