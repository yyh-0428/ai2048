#include <stdint.h>
#define TTBITS 16
#define TTSIZE (1u<<TTBITS)
static uint16_t rowL[65536], rowR[65536];
static uint64_t ttkey[TTSIZE];
static double ttval[TTSIZE];
static uint8_t ttdepth[TTSIZE];
static uint16_t epoch[TTSIZE], curEpoch=1;
static uint32_t nodes=0,nodeLimit=0; static int aborted=0;
static double roots[4];
static inline uint16_t revrow(uint16_t x){return ((x&0x000f)<<12)|((x&0x00f0)<<4)|((x&0x0f00)>>4)|((x&0xf000)>>12);}
__attribute__((export_name("init_tables"))) void init_tables(){
 for(uint32_t x=0;x<65536;x++){
   uint8_t a0=x&15,a1=(x>>4)&15,a2=(x>>8)&15,a3=(x>>12)&15,v[4],o[4]={0};int n=0,k=0;
   if(a0)v[n++]=a0;if(a1)v[n++]=a1;if(a2)v[n++]=a2;if(a3)v[n++]=a3;
   for(int i=0;i<n;i++){if(i+1<n&&v[i]==v[i+1]){o[k++]=v[i]<15?v[i]+1:15;i++;}else o[k++]=v[i];}
   rowL[x]=(uint16_t)(o[0]|(o[1]<<4)|(o[2]<<8)|(o[3]<<12));
 }
 for(uint32_t x=0;x<65536;x++)rowR[x]=revrow(rowL[revrow((uint16_t)x)]);
}
static inline uint64_t transpose(uint64_t x){uint64_t a1=x&0xF0F00F0FF0F00F0FULL,a2=x&0x0000F0F00000F0F0ULL,a3=x&0x0F0F00000F0F0000ULL,a=a1|(a2<<12)|(a3>>12),b1=a&0xFF00FF0000FF00FFULL,b2=a&0x00FF00FF00000000ULL,b3=a&0x00000000FF00FF00ULL;return b1|(b2>>24)|(b3<<24);}
static inline uint64_t mleft(uint64_t b){uint64_t o=0;for(int r=0;r<4;r++)o|=((uint64_t)rowL[(b>>(r*16))&0xffff])<<(r*16);return o;}
static inline uint64_t mright(uint64_t b){uint64_t o=0;for(int r=0;r<4;r++)o|=((uint64_t)rowR[(b>>(r*16))&0xffff])<<(r*16);return o;}
static inline uint64_t move(uint64_t b,int d){if(d==1)return mleft(b);if(d==2)return mright(b);uint64_t t=transpose(b),m=d==0?mleft(t):mright(t);return transpose(m);}
static inline uint64_t hash64(uint64_t x){x^=x>>30;x*=0xbf58476d1ce4e5b9ULL;x^=x>>27;x*=0x94d049bb133111ebULL;x^=x>>31;return x;}
static double survive(uint64_t b,int h){
 if(nodeLimit && nodes>=nodeLimit){aborted=1;return -2.0;} nodes++;uint32_t idx=(uint32_t)hash64(b^((uint64_t)h*0x9e3779b97f4a7c15ULL))&(TTSIZE-1);
 if(epoch[idx]==curEpoch&&ttkey[idx]==b&&ttdepth[idx]==h)return ttval[idx];
 uint64_t ms[4];int nm=0;for(int d=0;d<4;d++){uint64_t x=move(b,d);if(x!=b)ms[nm++]=x;}
 if(!nm)return 0.0;if(h<=0)return 1.0;double best=0.0;
 for(int k=0;k<nm;k++){uint64_t af=ms[k];int es[16],ne=0;for(int i=0;i<16;i++)if(((af>>(i*4))&15)==0)es[ne++]=i;double val=0.0;if(!ne){val=survive(af,h-1);if(val<0)return -2.0;}else{double inv=1.0/(double)ne;for(int j=0;j<ne;j++){int p=es[j];double s2=survive(af|((uint64_t)1<<(p*4)),h-1); if(s2<0)return -2.0; double s4=survive(af|((uint64_t)2<<(p*4)),h-1); if(s4<0)return -2.0; val+=.9*inv*s2+.1*inv*s4;}}if(val>best)best=val;}
 epoch[idx]=curEpoch;ttkey[idx]=b;ttdepth[idx]=h;ttval[idx]=best;return best;
}
static double rootdir(uint64_t b,int d,int h){uint64_t af=move(b,d);if(af==b)return -1.0;int es[16],ne=0;for(int i=0;i<16;i++)if(((af>>(i*4))&15)==0)es[ne++]=i;if(!ne)return survive(af,h-1);double inv=1.0/ne,v=0;for(int j=0;j<ne;j++){int p=es[j];double s2=survive(af|((uint64_t)1<<(p*4)),h-1); if(s2<0)return -2.0; double s4=survive(af|((uint64_t)2<<(p*4)),h-1); if(s4<0)return -2.0; v+=.9*inv*s2+.1*inv*s4;}return v;}
__attribute__((export_name("analyze_survival"))) int analyze_survival(uint32_t lo,uint32_t hi,int h,uint32_t limit){uint64_t b=((uint64_t)hi<<32)|lo;curEpoch++;if(curEpoch==0){for(uint32_t i=0;i<TTSIZE;i++)epoch[i]=0;curEpoch=1;}nodes=0;nodeLimit=limit;aborted=0;int best=-1;double bv=-2;for(int d=0;d<4;d++){roots[d]=rootdir(b,d,h);if(aborted)return -1;if(roots[d]>bv){bv=roots[d];best=d;}}return best;}
__attribute__((export_name("get_survival"))) double get_survival(int d){return (d>=0&&d<4)?roots[d]:-1.0;}
__attribute__((export_name("get_nodes"))) uint32_t get_nodes(){return nodes;}

__attribute__((export_name("get_aborted"))) int get_aborted(){return aborted;}
