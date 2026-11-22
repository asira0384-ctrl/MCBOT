#pragma once
#include <functional>
#include "vendor/WebView2.h"
namespace MicrosoftBrowser {
const GUID EnvHandlerId={0x4e8a3389,0xc9d8,0x4bd2,{0xb6,0xb5,0x12,0x4f,0xee,0x6c,0xc1,0x4d}};
const GUID ControllerHandlerId={0x6c4819f3,0xc9b7,0x4260,{0x81,0x27,0xc9,0xf5,0xbd,0xe7,0xf6,0x8c}};
const GUID NavigationHandlerId={0x9adbe429,0xf36d,0x432b,{0x9d,0xdc,0xf8,0x88,0x1f,0xbd,0x76,0xe3}};
template<class I>class Handler:public I{
 LONG refs=1;GUID id;
public:
 explicit Handler(GUID value):id(value){}
 virtual ~Handler()=default;
 HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void**out)override{if(!out)return E_POINTER;*out=nullptr;if(IsEqualIID(iid,IID_IUnknown)||IsEqualIID(iid,id)){*out=static_cast<I*>(this);AddRef();return S_OK;}return E_NOINTERFACE;}
 ULONG STDMETHODCALLTYPE AddRef()override{return (ULONG)InterlockedIncrement(&refs);}
 ULONG STDMETHODCALLTYPE Release()override{auto n=InterlockedDecrement(&refs);if(!n)delete this;return (ULONG)n;}
};
struct EnvHandler:Handler<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>{
 std::function<HRESULT(HRESULT,ICoreWebView2Environment*)>fn;
 explicit EnvHandler(decltype(fn)f):Handler(EnvHandlerId),fn(std::move(f)){}
 HRESULT STDMETHODCALLTYPE Invoke(HRESULT result,ICoreWebView2Environment*env)override{try{return fn(result,env);}catch(...){toast("Microsoft browser initialization failed",true);return E_FAIL;}}
};
struct ControllerHandler:Handler<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>{
 std::function<HRESULT(HRESULT,ICoreWebView2Controller*)>fn;
 explicit ControllerHandler(decltype(fn)f):Handler(ControllerHandlerId),fn(std::move(f)){}
 HRESULT STDMETHODCALLTYPE Invoke(HRESULT result,ICoreWebView2Controller*c)override{try{return fn(result,c);}catch(...){toast("Microsoft browser initialization failed",true);return E_FAIL;}}
};
struct NavigationHandler:Handler<ICoreWebView2NavigationStartingEventHandler>{
 std::function<HRESULT(ICoreWebView2NavigationStartingEventArgs*)>fn;
 explicit NavigationHandler(decltype(fn)f):Handler(NavigationHandlerId),fn(std::move(f)){}
 HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2*,ICoreWebView2NavigationStartingEventArgs*args)override{try{return fn(args);}catch(...){toast("Microsoft browser callback failed",true);return E_FAIL;}}
};
struct Window{
 HWND handle=nullptr;ICoreWebView2Controller*controller=nullptr;ICoreWebView2*view=nullptr;
 bool closed=false,submitted=false,hasNavigation=false;EventRegistrationToken navigationToken{};std::string target,state;std::wstring folder;
 ~Window(){if(view)view->Release();if(controller)controller->Release();}
 void resize(){if(controller&&!closed){RECT r;GetClientRect(handle,&r);controller->put_Bounds(r);}}
};
LRESULT CALLBACK procedure(HWND h,UINT message,WPARAM wp,LPARAM lp){
 auto holder=reinterpret_cast<std::shared_ptr<Window>*>(GetWindowLongPtrW(h,GWLP_USERDATA));
 auto context=holder?*holder:std::shared_ptr<Window>();
 if(context){
  if(message==WM_SIZE){context->resize();return 0;}
  if(message==WM_CLOSE){
   if(!context->closed){context->closed=true;if(!context->submitted)enqueue("/api/desktop/auth",{{"target",context->target},{"action","browser-cancel"},{"state",context->state}},"mscomplete");
    if(context->view&&context->hasNavigation){context->view->remove_NavigationStarting(context->navigationToken);context->hasNavigation=false;}if(context->controller)context->controller->Close();auto folder=context->folder;std::thread([folder](){for(int i=0;i<4;i++){std::this_thread::sleep_for(std::chrono::seconds(2));std::error_code error;fs::remove_all(folder,error);if(!error)break;}}).detach();}
   DestroyWindow(h);return 0;
  }
  if(message==WM_NCDESTROY){SetWindowLongPtrW(h,GWLP_USERDATA,0);delete holder;return DefWindowProcW(h,message,wp,lp);}
 }
 return DefWindowProcW(h,message,wp,lp);
}
void show(const J&data){
 auto url=str(data,"url");if(url.rfind("https://login.live.com/oauth20_authorize.srf?",0)!=0)throw std::runtime_error("Invalid Microsoft sign-in URL");
 static HMODULE loader=nullptr;if(!loader){auto file=resourceFile(5,L"WebView2Loader.dll");loader=LoadLibraryExW(file.c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);}
 if(!loader)throw std::runtime_error("Microsoft WebView2 loader could not be loaded");
 using Factory=HRESULT(STDAPICALLTYPE*)(PCWSTR,PCWSTR,ICoreWebView2EnvironmentOptions*,ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*);
 auto create=reinterpret_cast<Factory>(GetProcAddress(loader,"CreateCoreWebView2EnvironmentWithOptions"));
 if(!create)throw std::runtime_error("Microsoft WebView2 loader is incompatible");
 static ATOM atom=0;if(!atom){WNDCLASSW c{};c.hInstance=instance;c.lpfnWndProc=procedure;c.lpszClassName=L"AsiraMicrosoftSignIn";c.hCursor=LoadCursorW(nullptr,MAKEINTRESOURCEW(32512));atom=RegisterClassW(&c);}
 auto context=std::make_shared<Window>();context->target=str(data,"target");context->state=str(data,"id");
 context->folder=appDir+L"\\MicrosoftSignIn\\"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64());fs::create_directories(context->folder);
 context->handle=CreateWindowExW(0,L"AsiraMicrosoftSignIn",L"Microsoft sign-in - login.live.com",WS_OVERLAPPEDWINDOW,CW_USEDEFAULT,CW_USEDEFAULT,620,800,hwnd,nullptr,instance,nullptr);
 if(!context->handle)throw std::runtime_error("Microsoft sign-in window could not be created");
 SetWindowLongPtrW(context->handle,GWLP_USERDATA,reinterpret_cast<LONG_PTR>(new std::shared_ptr<Window>(context)));
 ShowWindow(context->handle,SW_SHOW);SetForegroundWindow(context->handle);
 auto envHandler=new EnvHandler([context,url](HRESULT result,ICoreWebView2Environment*env){
  if(context->closed)return S_OK;
  if(FAILED(result)||!env){toast("Install Microsoft Edge WebView2 Runtime to use email-code sign-in.",true);PostMessageW(context->handle,WM_CLOSE,0,0);return E_FAIL;}
  auto handler=new ControllerHandler([context,url](HRESULT status,ICoreWebView2Controller*controller){
   if(context->closed)return S_OK;
   if(FAILED(status)||!controller){toast("Microsoft sign-in browser could not start",true);PostMessageW(context->handle,WM_CLOSE,0,0);return E_FAIL;}
   context->controller=controller;controller->AddRef();if(FAILED(controller->get_CoreWebView2(&context->view))||!context->view){toast("Microsoft browser view could not start",true);PostMessageW(context->handle,WM_CLOSE,0,0);return E_FAIL;}context->resize();
   auto navigation=new NavigationHandler([context](ICoreWebView2NavigationStartingEventArgs*args){
    if(context->closed||context->submitted)return S_OK;LPWSTR value=nullptr;if(FAILED(args->get_Uri(&value))||!value)return S_OK;
    std::wstring uri(value);CoTaskMemFree(value);const std::wstring callback=L"https://login.live.com/oauth20_desktop.srf";
    if(uri.rfind(callback,0)==0&&(uri.size()==callback.size()||uri[callback.size()]==L'?')){
     args->put_Cancel(TRUE);context->submitted=true;enqueue("/api/desktop/auth",{{"target",context->target},{"action","browser-complete"},{"returnURL",utf(uri)}},"mscomplete");toast("Finishing Microsoft sign-in");PostMessageW(context->handle,WM_CLOSE,0,0);
    }return S_OK;
   });context->hasNavigation=SUCCEEDED(context->view->add_NavigationStarting(navigation,&context->navigationToken));navigation->Release();
   if(!context->hasNavigation){toast("Microsoft sign-in callback could not be attached",true);PostMessageW(context->handle,WM_CLOSE,0,0);return E_FAIL;}
   return context->view->Navigate(wide(url).c_str());
  });auto r=env->CreateCoreWebView2Controller(context->handle,handler);handler->Release();return r;
 });
 auto result=create(nullptr,context->folder.c_str(),nullptr,envHandler);envHandler->Release();
 if(FAILED(result)){PostMessageW(context->handle,WM_CLOSE,0,0);throw std::runtime_error("Microsoft Edge WebView2 Runtime is required for this sign-in method");}
}
}
