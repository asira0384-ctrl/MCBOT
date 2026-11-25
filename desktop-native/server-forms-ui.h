#pragma once
std::map<std::string,J>formDrafts;
float drawServerForms(Graphics*g,float x,float y,float w){
 float start=y;bool found=false;std::set<std::string>alive;
 for(auto&b:arrayMember(state,"bots"))if(b.contains("serverForm")&&b["serverForm"].is_object())alive.insert(str(b["serverForm"],"token"));
 for(auto i=formDrafts.begin();i!=formDrafts.end();)if(!alive.count(i->first))i=formDrafts.erase(i);else++i;
 for(auto i=formSent.begin();i!=formSent.end();)if(!alive.count(*i))i=formSent.erase(i);else++i;
 auto text=[&](std::string value){if(value.size()>4096)value=value.substr(0,4096)+"...";float scale=(float)std::clamp(nv("ClickGUI","Font Size",12)/12,.75,1.5);int columns=std::max(1,(int)(w/(11*scale))),lines=1,column=0;for(char c:value){if(c=='\n'){lines++;column=0;}else if(++column>columns){lines++;column=1;}}float height=lines*18.f*scale+10;if(g)txt(*g,value,x,y,w,height,theme("Text"),11);y+=height;};
 for(auto*bp:bots()){
  auto&b=*bp;if(!b.contains("serverForm")||!b["serverForm"].is_object())continue;
  const auto&pending=b["serverForm"];if(!pending.contains("form")||!pending["form"].is_object())continue;
  found=true;const auto&f=pending["form"];auto token=str(pending,"token"),type=str(f,"type");
  text("BOT "+std::to_string(b.value("id",0))+" / "+str(b,"name"));text(str(f,"title","Server Form"));
  auto button=[&](std::string caption,J response,bool cancel=false){J data={{"action","form-response"},{"target",std::to_string(b.value("id",0))},{"token",token},{"response",response},{"cancel",cancel}};if(g)inlineButton(*g,formSent.count(token)?"Sent":caption,x,y,w,"form-submit","","",data);y+=28;};
  if(type=="custom_form"&&f.contains("content")&&f["content"].is_array()){
   auto&draft=formDrafts[token];if(!draft.is_array()){draft=J::array();for(auto&field:f["content"])draft.push_back(str(field,"type")=="toggle"?J(field.value("default",false)):J(nullptr));}
   bool supported=true;int i=0,toggles=0;for(auto&field:f["content"]){auto kind=str(field,"type");
    if(kind=="label")text(str(field,"text"));
    else if(kind=="toggle"){toggles++;auto caption=str(field,"text");if(caption.empty())caption="Toggle "+std::to_string(toggles);if(g)inlineButton(*g,caption+(draft[i].get<bool>()?" : ON":" : OFF"),x,y,w,"form-toggle",token,std::to_string(i));y+=28;}
    else{supported=false;text("Unsupported field: "+kind);}i++;
   }
   if(supported)button(str(f,"submit_button","Submit"),draft);
  }else if(type=="form"&&f.contains("buttons")&&f["buttons"].is_array()){
   text(str(f,"content"));for(int i=0;i<f["buttons"].size();i++)button(str(f["buttons"][i],"text","Button "+std::to_string(i+1)),i);
  }else if(type=="modal"){text(str(f,"content"));button(str(f,"button1","Yes"),true);button(str(f,"button2","No"),false);}
  button("Close form",nullptr,true);y+=12;
 }
 if(!found)text("No pending server forms.\nAll Bots shows each bot's form here.");
 return y-start;
}
