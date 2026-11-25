#pragma once
// Group selection shows totals for selected accounts, including disconnected slots.
float drawNukeStatus(Graphics*g,float x,float y,float w){
 auto selected=bots();int online=0,running=0,waiting=0;long long total=0,session=0;std::map<std::string,int>reasons;
 for(auto*bp:selected){auto&b=*bp;bool connected=b.value("connected",false);online+=connected;auto mode=str(b,"mode");if(connected){if(mode=="running"||mode=="cleaning")running++;else waiting++;}auto counts=b.value("miningTotals",J::object());if(counts.is_object()){total+=(long long)number(counts,"total");session+=(long long)number(counts,"session");}auto info=b.value("mining",J::object());if(info.is_object()){auto reason=str(info,"missing");if(connected&&mode!="running"&&!reason.empty())reasons[reason]++;}}
 float start=y;auto line=[&](std::string text,float height=23){if(g){auto savedFont=fontName;fontName=L"Segoe UI";txt(*g,text,x,y,w,height,theme("Off Text"),10);fontName=savedFont;}y+=height+3;};
 line("採掘合計: "+std::to_string(total));line("セッション: "+std::to_string(session));line("採掘中: "+std::to_string(running)+" / 待機: "+std::to_string(waiting));line("接続: "+std::to_string(online)+" / 未接続: "+std::to_string(selected.size()-online));
 if(target=="all"||target=="ign"||target=="2b2e"){int n=0;for(auto&[reason,count]:reasons){if(n++>=3)break;line(std::to_string(count)+"体: "+reason,64);}}
 else for(auto*bp:selected){auto&b=*bp;auto info=b.value("mining",J::object());if(info.is_object()){line(str(info,"state",str(b,"phase")),64);auto missing=str(info,"missing");if(!missing.empty())line(missing,64);}auto exit=b.value("lastExit",J::object());if(exit.is_object())line("前回切断: "+str(exit,"kind")+" / "+str(exit,"reason"),80);}
 return y-start;
}
