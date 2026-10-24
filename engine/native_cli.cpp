/**
 * native_cli.cpp — native build of the stowage engine (Linux / Windows / macOS).
 *
 *   stowage < input.txt > output.txt
 *
 * Reads the input array (whitespace-separated numbers, layout in stowage.cpp) and writes the
 * output array, one number per line with full precision. js/engine.js encodes / decodes both.
 */
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <vector>
#include "stowage.h"

static std::vector<void *> blocks;

extern "C" double stow_now_ms(void) {
    using namespace std::chrono;
    return double(duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count());
}
extern "C" void stow_sys_reset(void) { for (void *b : blocks) std::free(b); blocks.clear(); }
extern "C" void *stow_sys_alloc(unsigned long bytes) {
    void *p = std::calloc(bytes ? bytes : 1, 1);
    if (!p) { std::fputs("out of memory\n", stderr); std::exit(2); }
    blocks.push_back(p);
    return p;
}

int main() {
    std::vector<double> in;
    double v;
    while (std::scanf("%lf", &v) == 1) in.push_back(v);
    if (in.empty()) { std::fputs("no input\n", stderr); return 1; }
    double *buf = stow_input(int(in.size()));
    for (size_t i = 0; i < in.size(); i++) buf[i] = in[i];
    const double *out = stow_run();
    int nLive = int(out[11]);
    size_t len = 12;
    for (int k = 0; k < nLive; k++) len += 3 + 2 * size_t(out[len + 2]);
    for (size_t i = 0; i < len; i++) std::printf("%.17g\n", out[i]);
    return 0;
}
