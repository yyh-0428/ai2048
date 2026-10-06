#include <stdint.h>

typedef uint64_t board_t;
typedef uint16_t row_t;
#define ROW_MASK 0xffffULL
#define TT_BITS 18
#define TT_SIZE (1u<<TT_BITS)

static row_t row_left_table[65536], row_right_table[65536];
static board_t col_up_table[65536], col_down_table[65536];
static float heur_score_table[65536];
static const float P35[16]={0.0f,1.0f,11.3137085f,46.7653718f,128.0f,279.508497f,529.089784f,907.4927f,1448.15469f,2187.0f,3162.27766f,4414.4276f,5985.96759f,7921.39615f,10267.1079f,13071.3188f};
static const float P4[16]={0.0f,1.0f,16.0f,81.0f,256.0f,625.0f,1296.0f,2401.0f,4096.0f,6561.0f,10000.0f,14641.0f,20736.0f,28561.0f,38416.0f,50625.0f};
static board_t tt_key[TT_SIZE];
static float tt_val[TT_SIZE];
static uint8_t tt_depth[TT_SIZE];
static uint16_t tt_gen[TT_SIZE], generation=1;
static uint32_t node_count=0, cache_hits=0;
static uint8_t initialized=0;

static inline row_t reverse_row(row_t row){return (row>>12)|((row>>4)&0x00F0)|((row<<4)&0x0F00)|(row<<12);}
static inline board_t unpack_col(row_t row){board_t tmp=row;return (tmp|(tmp<<12)|(tmp<<24)|(tmp<<36))&0x000F000F000F000FULL;}
static inline board_t transpose(board_t x){
  board_t a1=x&0xF0F00F0FF0F00F0FULL,a2=x&0x0000F0F00000F0F0ULL,a3=x&0x0F0F00000F0F0000ULL,a=a1|(a2<<12)|(a3>>12);
  board_t b1=a&0xFF00FF0000FF00FFULL,b2=a&0x00FF00FF00000000ULL,b3=a&0x00000000FF00FF00ULL;
  return b1|(b2>>24)|(b3<<24);
}

__attribute__((visibility("default"))) void v102_init(void){
  if(initialized)return;
  for(uint32_t row=0;row<65536;row++){
    uint32_t line[4]={(row>>0)&15,(row>>4)&15,(row>>8)&15,(row>>12)&15};
    float sum=0.0f,ml=0.0f,mr=0.0f;int empty=0,merges=0,prev=0,counter=0;
    for(int i=0;i<4;i++){
      int rank=(int)line[i];sum+=P35[rank];
      if(rank==0)empty++;
      else{if(prev==rank)counter++;else if(counter>0){merges+=1+counter;counter=0;}prev=rank;}
    }
    if(counter>0)merges+=1+counter;
    for(int i=1;i<4;i++){
      int a=(int)line[i-1],b=(int)line[i];
      if(a>b)ml+=P4[a]-P4[b]; else mr+=P4[b]-P4[a];
    }
    heur_score_table[row]=200000.0f+270.0f*(float)empty+700.0f*(float)merges-47.0f*(ml<mr?ml:mr)-11.0f*sum;
    for(int i=0;i<3;i++){
      int j;for(j=i+1;j<4;j++)if(line[j]!=0)break;if(j==4)break;
      if(line[i]==0){line[i]=line[j];line[j]=0;i--;}
      else if(line[i]==line[j]){if(line[i]!=15)line[i]++;line[j]=0;}
    }
    row_t result=(row_t)(line[0]|(line[1]<<4)|(line[2]<<8)|(line[3]<<12));
    row_t rev_result=reverse_row(result),rev_row=reverse_row((row_t)row);
    row_left_table[row]=(row_t)row^result;
    row_right_table[rev_row]=rev_row^rev_result;
    col_up_table[row]=unpack_col((row_t)row)^unpack_col(result);
    col_down_table[rev_row]=unpack_col(rev_row)^unpack_col(rev_result);
  }
  initialized=1;
}

static inline board_t execute_move(int move,board_t board){
  board_t ret=board,t;
  switch(move){
    case 0:t=transpose(board);ret^=col_up_table[(t>>0)&ROW_MASK]<<0;ret^=col_up_table[(t>>16)&ROW_MASK]<<4;ret^=col_up_table[(t>>32)&ROW_MASK]<<8;ret^=col_up_table[(t>>48)&ROW_MASK]<<12;return ret;
    case 1:t=transpose(board);ret^=col_down_table[(t>>0)&ROW_MASK]<<0;ret^=col_down_table[(t>>16)&ROW_MASK]<<4;ret^=col_down_table[(t>>32)&ROW_MASK]<<8;ret^=col_down_table[(t>>48)&ROW_MASK]<<12;return ret;
    case 2:ret^=(board_t)row_left_table[(board>>0)&ROW_MASK]<<0;ret^=(board_t)row_left_table[(board>>16)&ROW_MASK]<<16;ret^=(board_t)row_left_table[(board>>32)&ROW_MASK]<<32;ret^=(board_t)row_left_table[(board>>48)&ROW_MASK]<<48;return ret;
    case 3:ret^=(board_t)row_right_table[(board>>0)&ROW_MASK]<<0;ret^=(board_t)row_right_table[(board>>16)&ROW_MASK]<<16;ret^=(board_t)row_right_table[(board>>32)&ROW_MASK]<<32;ret^=(board_t)row_right_table[(board>>48)&ROW_MASK]<<48;return ret;
    default:return board;
  }
}
static inline board_t empty_mask(board_t x){x|=(x>>2)&0x3333333333333333ULL;x|=x>>1;return ~x&0x1111111111111111ULL;}
static inline int count_empty(board_t x){return __builtin_popcountll(empty_mask(x));}
static inline float score_helper(board_t b){return heur_score_table[(b>>0)&ROW_MASK]+heur_score_table[(b>>16)&ROW_MASK]+heur_score_table[(b>>32)&ROW_MASK]+heur_score_table[(b>>48)&ROW_MASK];}
static inline float eval_board(board_t b){return score_helper(b)+score_helper(transpose(b));}
static inline uint32_t hash_board(board_t x){x^=x>>33;x*=0xff51afd7ed558ccdULL;x^=x>>33;x*=0xc4ceb9fe1a85ec53ULL;x^=x>>33;return (uint32_t)x&(TT_SIZE-1);}
static void new_generation(void){generation++;if(generation==0){for(uint32_t i=0;i<TT_SIZE;i++)tt_gen[i]=0;generation=1;}}
static inline int tt_get(board_t b,int cur,float* out){uint32_t i=hash_board(b);if(tt_gen[i]==generation&&tt_key[i]==b&&tt_depth[i]<=cur){*out=tt_val[i];cache_hits++;return 1;}return 0;}
static inline void tt_put(board_t b,int cur,float v){uint32_t i=hash_board(b);tt_gen[i]=generation;tt_key[i]=b;tt_depth[i]=(uint8_t)cur;tt_val[i]=v;}

typedef struct{int cur,limit;} State;
static float move_node(State* s,board_t b,float p);
static float chance_node(State* s,board_t b,float p){
  node_count++;
  if(p<0.0001f||s->cur>=s->limit)return eval_board(b);
  float cached;if(s->cur<15&&tt_get(b,s->cur,&cached))return cached;
  board_t empties=empty_mask(b);int n=__builtin_popcountll(empties);if(n<=0)return move_node(s,b,p);
  p/=(float)n;float res=0.0f;while(empties){int shift=__builtin_ctzll(empties);board_t tile=1ULL<<shift;empties&=empties-1;res+=move_node(s,b|tile,p*0.9f)*0.9f;res+=move_node(s,b|(tile<<1),p*0.1f)*0.1f;}
  res/=(float)n;if(s->cur<15)tt_put(b,s->cur,res);return res;
}
static float move_node(State* s,board_t b,float p){
  node_count++;float best=0.0f;s->cur++;
  for(int m=0;m<4;m++){board_t nb=execute_move(m,b);if(nb!=b){float v=chance_node(s,nb,p);if(v>best)best=v;}}
  s->cur--;return best;
}

__attribute__((visibility("default"))) float v102_score_depth(uint32_t lo,uint32_t hi,int depth){
  if(!initialized)v102_init();if(depth<2)depth=2;if(depth>6)depth=6;
  new_generation();node_count=0;cache_hits=0;State s={0,depth};board_t b=((board_t)hi<<32)|lo;
  return chance_node(&s,b,1.0f)+0.000001f;
}
__attribute__((visibility("default"))) float v102_score(uint32_t lo,uint32_t hi){return v102_score_depth(lo,hi,3);}
__attribute__((visibility("default"))) uint32_t v102_nodes(void){return node_count;}
__attribute__((visibility("default"))) uint32_t v102_cache_hits(void){return cache_hits;}
