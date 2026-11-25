#include "../render-policy.h"
#include <cassert>
#include <iostream>
int main(){assert(asira::shaderBlend(0,80)==0);assert(asira::shaderBlend(40,80)==.5f);assert(asira::shaderBlend(80,80)==1);assert(asira::shaderBlend(100,80)==1);for(int i=1;i<80;i++)assert(asira::shaderBlend(i,80)>asira::shaderBlend(i-1,80));assert(asira::frameInterval(60)==16);assert(asira::frameInterval(30)==33);std::cout<<"Shader interpolation continuity and frame limits passed.\n";}
