#include "../render-policy.h"
#include <cassert>
#include <iostream>
int main(){for(double v:{-1.,-1000000000000.,1000000000000.,0.,1080.}){double y=asira::wrappedPosition(v,1080);assert(y>=0&&y<1080);}assert(asira::notificationAlpha(0,3,.3)==1);assert(asira::notificationAlpha(1,3,.3)==1);assert(asira::notificationAlpha(3,3,.3)==0);assert(asira::notificationProgress(0,3)==1);assert(asira::notificationProgress(1.5,3)==.5);assert(asira::notificationProgress(3,3)==0);assert(asira::animationNeeded(true,true,true,false,false));assert(!asira::animationNeeded(false,true,true,true,false));std::cout<<"Long-uptime Lava wrap, notification no-fade-in/countdown, and typing animation checks passed.\n";}
