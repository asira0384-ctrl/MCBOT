#pragma once
#include <cmath>
#include <algorithm>
namespace asira {
inline double wrappedPosition(double x,double span){return span>0?std::fmod(std::fmod(x,span)+span,span):0;}
inline double notificationAlpha(double age,double duration,double fade){return fade<=0?1:std::clamp((duration-age)/fade,0.0,1.0);}
inline double notificationProgress(double age,double duration){return std::clamp(1-age/duration,0.0,1.0);}
inline bool animationNeeded(bool ready,bool editing,bool weather,bool shader,bool fading){
 return fading||(ready&&(weather||shader));
}
inline float shaderBlend(double elapsed,double interval){return interval>0?(float)std::clamp(elapsed/interval,0.0,1.0):1.f;}
inline unsigned frameInterval(double fps){
 if(fps<5)fps=5;if(fps>60)fps=60;return (unsigned)(1000.0/fps);
}
}
