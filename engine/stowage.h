/**
 * stowage.h — C++ port of js/optimizer.js (branch & bound over tank subsets).
 *
 * The same search, scoring and tie-breaking as the JavaScript engine, written so the
 * floating-point operations happen in the same order: with the same input both engines
 * return the same plan and the same score bit for bit (tests/engine-parity.js checks this).
 * Being faster, this engine explores more of the tree inside the time budget, so on hard
 * cases it can find a better plan where the JavaScript engine stops at the time limit.
 *
 * Freestanding: no C or C++ library, so the same file builds to WebAssembly (browser,
 * desktop app) and to a native program (tests, a ship's PC). Platform hooks below.
 *
 * Input and output are flat arrays of doubles — layout in stowage.cpp, encoder in js/engine.js.
 */
#ifndef STOWAGE_H
#define STOWAGE_H

extern "C" {
    // Provided by the platform layer (wasm_main.cpp / native_cli.cpp)
    void *stow_sys_alloc(unsigned long bytes);   // zero-filled, 8-byte aligned, freed by stow_sys_reset
    void stow_sys_reset(void);
    double stow_now_ms(void);                     // wall clock in whole ms, like Date.now()

    // Engine entry points
    double *stow_input(int count);                // fresh input buffer (resets the arena)
    double *stow_run(void);                       // runs on the last input, returns the output buffer
}

#endif
