// Optional independent native oracle: cc -O3 -ffp-contract=off tests/core-reference.c -o /tmp/core-reference
#include <stdio.h>
#include "../v102_ai.c"
int main(void) {
  uint32_t lo, hi; int depth;
  while (scanf("%u %u %d", &lo, &hi, &depth) == 3) {
    float score=v102_score_depth(lo,hi,depth);
    printf("%.9g %u %u\n",score,v102_nodes(),v102_cache_hits());
  }
  return 0;
}
