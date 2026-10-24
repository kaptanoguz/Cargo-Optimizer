/**
 * wasm_main.cpp — WebAssembly platform layer: bump allocator over linear memory,
 * the clock imported from JavaScript (Date.now) and the memset/memcpy the compiler expects.
 */
#include "stowage.h"

extern "C" {

__attribute__((import_module("env"), import_name("now_ms"))) double js_now_ms(void);
extern unsigned char __heap_base;

static unsigned long top = 0;

double stow_now_ms(void) { return js_now_ms(); }

void stow_sys_reset(void) { top = (unsigned long)&__heap_base; }

void *stow_sys_alloc(unsigned long bytes) {
    if (!top) stow_sys_reset();
    unsigned long start = (top + 7) & ~7ul, end = start + bytes;
    unsigned long have = __builtin_wasm_memory_size(0) * 65536ul;
    if (end > have && __builtin_wasm_memory_grow(0, (end - have + 65535) / 65536) == (unsigned long)-1) __builtin_trap();
    top = end;
    unsigned char *p = (unsigned char *)start;
    for (unsigned long i = 0; i < bytes; i++) p[i] = 0;   // memory is reused after a reset
    return p;
}

void *memset(void *d, int c, unsigned long n) { unsigned char *p = (unsigned char *)d; while (n--) *p++ = (unsigned char)c; return d; }
void *memcpy(void *d, const void *s, unsigned long n) { unsigned char *p = (unsigned char *)d; const unsigned char *q = (const unsigned char *)s; while (n--) *p++ = *q++; return d; }
void *memmove(void *d, const void *s, unsigned long n) {
    unsigned char *p = (unsigned char *)d; const unsigned char *q = (const unsigned char *)s;
    if (p < q) while (n--) *p++ = *q++; else { p += n; q += n; while (n--) *--p = *--q; }
    return d;
}

}
