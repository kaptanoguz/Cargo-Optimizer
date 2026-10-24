/**
 * stowage.cpp — stowage optimiser, line-for-line port of js/optimizer.js run().
 *
 * Input (doubles):
 *   [0] layout version (2)
 *   n, nc, nf, timeMs, listAllowance, slackPct, baseImb, branch[3], candLimit
 *   tanks   n × { cap, isPort, row, slop, pairIdx, neighborMask }
 *   fixed  nf × { tankIdx, cargoKey, mass }
 *   cargoes nc × { key, need, mpm, allowedMask, consolidated, capVol[n], capMass[n] }
 *   conflict      nc × nc  (1 = incompatible, cargo order as above)
 *   fixedConflict nc × nf  (1 = cargo incompatible with the parcel in that locked tank)
 *   Cargo keys are small integers ≥ 0 shared by `fixed` and `cargoes`.
 *
 * Output (doubles):
 *   nodes, ms, timedOut, score, hasBest, tanksUsed, imb, stage, waste, slack, pass (0 none, 1 waste, 2 pairs),
 *   nLive, then per live parcel in search order: key, unplaced, count, count × { tankIdx, vol }
 *
 * Keep in step with js/optimizer.js: any change to the search there must be made here too.
 */
#include "stowage.h"

namespace {

typedef unsigned int u32;

const double W_UNPLACED = 1000, W_TANK = 100, W_SLOP = 40, W_UNPAIRED = 15, W_SLACK = 12,
             W_WASTE = 0.4, W_LIST_LIN = 0.1, W_STAGE_LIN = 0.05, W_LIST_OVER = 30;
const double EPS = 1e-6;
const int MAX_TANKS = 24;
int candLimit = 400;              // candidates kept per parcel and ordering
int branchLimit[3] = { 24, 12, 8 };   // children tried at depth 0–1, 2–3, 4+

inline double dmin(double a, double b) { return a < b ? a : b; }   // Math.min(1, x) with x finite
inline double dmax(double a, double b) { return a > b ? a : b; }
inline double dabs(double a) { return a < 0 ? -a : a; }
inline int bitCount(u32 m) { return __builtin_popcount(m); }
inline int bitIndex(u32 low) { return __builtin_ctz(low); }

template <class T> T *alloc(long count) { return (T *)stow_sys_alloc((unsigned long)(count > 0 ? count : 1) * sizeof(T)); }

/** Stable merge sort; `before(a, b)` < 0 / 0 / > 0 like a JS comparator. Array.prototype.sort is stable too. */
template <class T, class Cmp> void stableSort(T *a, int n, Cmp cmp) {
    if (n < 2) return;
    T *tmp = alloc<T>(n);
    for (int width = 1; width < n; width *= 2) {
        for (int lo = 0; lo < n; lo += 2 * width) {
            int mid = lo + width < n ? lo + width : n, hi = lo + 2 * width < n ? lo + 2 * width : n;
            int i = lo, j = mid, k = lo;
            while (i < mid && j < hi) tmp[k++] = cmp(a[j], a[i]) < 0 ? a[j++] : a[i++];
            while (i < mid) tmp[k++] = a[i++];
            while (j < hi) tmp[k++] = a[j++];
        }
        for (int i = 0; i < n; i++) a[i] = tmp[i];
    }
}

/** First non-zero difference, as `(a - b) || …` does in JS. */
inline bool decided(double d) { return d != 0 && d == d; }

struct Tank { double cap; bool port; int row; bool slop; int pair; u32 bit, neighborMask; };

struct Dist { int cnt; int idx[MAX_TANKS]; double vol[MAX_TANKS]; };

struct Cand { u32 mask; int count; double imb; int unpaired, slops; double slack, waste; };

struct Cargo {
    int key, order;
    double need, mpm;
    u32 allowed;
    bool consolidated;
    const double *capVol, *capMass;
    int degree;
    u32 forbidFixed;
    double *cap;                  // capacity (t) of every subset of `allowed`
    Cand *byWaste, *byPairs, *list;
    int nWaste, nPairs, nList;
    int minCount;
};

int n;
Tank tanks[MAX_TANKS];

/** Distribute `need` tonnes of a parcel over the tanks in `mask` (insertion order as the JS Map). */
void distribute(const Cargo &c, u32 mask, double need, Dist &out) {
    out.cnt = 0;
    int idxs[MAX_TANKS], ni = 0;
    for (u32 m = mask; m; m &= m - 1) idxs[ni++] = bitIndex(m & -m);
    double capM = 0;
    for (int k = 0; k < ni; k++) capM = capM + c.capMass[idxs[k]];
    if (capM <= EPS || need <= EPS) return;
    if (c.consolidated) {
        // Fill whole P/S pairs to the limit, leave a single slack pair. Rows in ascending row
        // number (JS integer object keys), then stably by capacity, largest first.
        int rowKey[MAX_TANKS], rowLen[MAX_TANKS], rowIdx[MAX_TANKS][MAX_TANKS], nr = 0;
        for (int k = 0; k < ni; k++) {
            int i = idxs[k], r = tanks[i].row, g = 0;
            while (g < nr && rowKey[g] != r) g++;
            if (g == nr) { rowKey[nr] = r; rowLen[nr] = 0; nr++; }
            rowIdx[g][rowLen[g]++] = i;
        }
        int order[MAX_TANKS];
        for (int g = 0; g < nr; g++) order[g] = g;
        for (int a = 1; a < nr; a++)               // ascending row key (insertion sort, keys unique)
            for (int b = a; b > 0 && rowKey[order[b - 1]] > rowKey[order[b]]; b--) { int t = order[b]; order[b] = order[b - 1]; order[b - 1] = t; }
        double rowCap[MAX_TANKS];
        for (int g = 0; g < nr; g++) { double s = 0; for (int k = 0; k < rowLen[g]; k++) s = s + c.capMass[rowIdx[g][k]]; rowCap[g] = s; }
        stableSort(order, nr, [&](int a, int b) { return rowCap[b] - rowCap[a]; });
        double rem = need;
        for (int o = 0; o < nr; o++) {
            if (rem <= EPS) break;
            int g = order[o];
            double rc = rowCap[g];
            double f = dmin(1, rem / rc);
            for (int k = 0; k < rowLen[g]; k++) { int i = rowIdx[g][k]; out.idx[out.cnt] = i; out.vol[out.cnt] = c.capVol[i] * f; out.cnt++; }
            rem -= rc * f;
        }
    } else {
        double f = dmin(1, need / capM);
        for (int k = 0; k < ni; k++) { int i = idxs[k]; out.idx[out.cnt] = i; out.vol[out.cnt] = c.capVol[i] * f; out.cnt++; }
    }
}

void buildCandidates(Cargo &c, double slackPct) {
    const double thr = slackPct;
    const u32 full = (u32(1) << n) - 1;
    const double need = c.need;
    const u32 allowed = c.allowed;
    double *cap = c.cap = alloc<double>(long(full) + 1);
    unsigned char *seen = alloc<unsigned char>(long(full) + 1);
    Cand *all = alloc<Cand>(2 * (long(full) + 1));
    int nAll = 0;
    int minCount = 1 << 30;
    Dist d;

    auto pairMaskOf = [&](int i) { return tanks[i].bit | tanks[tanks[i].pair].bit; };
    auto evaluate = [&](u32 m) {
        if (seen[m]) return;
        seen[m] = 1;
        double f = dmin(1, need / cap[m]);
        double imb = 0;
        int count = 0, unpaired = 0, slops = 0;
        for (u32 r = m; r; r &= r - 1) {
            int i = bitIndex(r & -r);
            count++;
            imb += (tanks[i].port ? 1.0 : -1.0) * c.capMass[i] * f;
            if (!(m & pairMaskOf(i) & ~tanks[i].bit)) unpaired++;
            if (tanks[i].slop) slops++;
        }
        distribute(c, m, need, d);
        double slack = 0;
        for (int k = 0; k < d.cnt; k++) {
            double p = d.vol[k] / tanks[d.idx[k]].cap * 100;
            if (p > 2 && p < thr) slack += thr - p;
        }
        all[nAll++] = Cand{ m, count, imb, unpaired, slops, slack, cap[m] - need };
    };

    for (u32 m = 1; m <= full; m++) {
        if (m & ~allowed) continue;
        u32 low = m & -m;
        cap[m] = cap[m ^ low] + c.capMass[bitIndex(low)];
    }
    c.byWaste = c.byPairs = c.list = 0;
    c.nWaste = c.nPairs = c.nList = 0;
    if (need <= EPS) { c.minCount = 0; return; }

    for (u32 m = 1; m <= full; m++) {
        if ((m & ~allowed) || cap[m] < need - EPS) continue;
        bool minimal = true;
        for (u32 r = m; r; r &= r - 1) {
            u32 b = r & -r;
            if (cap[m ^ b] >= need - EPS) { minimal = false; break; }
        }
        if (!minimal) continue;
        evaluate(m);
        if (bitCount(m) < minCount) minCount = bitCount(m);
        // P/S-symmetric closure of the minimal set
        u32 sym = m;
        for (u32 r = m; r; r &= r - 1) sym |= pairMaskOf(bitIndex(r & -r));
        sym &= allowed;
        if (sym != m) evaluate(sym);
    }

    auto head = [](const Cand &a, const Cand &b) -> double {
        double d;
        if (decided(d = a.count - b.count)) return d;
        if (decided(d = a.slops - b.slops)) return d;
        return a.slack - b.slack;
    };
    auto byWaste = [&](const Cand &a, const Cand &b) -> double {
        double d;
        if (decided(d = head(a, b))) return d;
        if (decided(d = a.waste - b.waste)) return d;
        if (decided(d = a.unpaired - b.unpaired)) return d;
        return dabs(a.imb) - dabs(b.imb);
    };
    auto byPairs = [&](const Cand &a, const Cand &b) -> double {
        double d;
        if (decided(d = head(a, b))) return d;
        if (decided(d = a.unpaired - b.unpaired)) return d;
        if (decided(d = dabs(a.imb) - dabs(b.imb))) return d;
        return a.waste - b.waste;
    };
    c.byWaste = alloc<Cand>(nAll);
    c.byPairs = alloc<Cand>(nAll);
    for (int i = 0; i < nAll; i++) c.byWaste[i] = c.byPairs[i] = all[i];
    stableSort(c.byWaste, nAll, byWaste);
    stableSort(c.byPairs, nAll, byPairs);
    c.nWaste = c.nPairs = nAll < candLimit ? nAll : candLimit;
    c.list = c.byWaste; c.nList = c.nWaste;
    c.minCount = minCount < (1 << 30) ? minCount : bitCount(allowed);
}

// ── Search state ────────────────────────────────────────────────────────────
int nc, nf, nKeys;
Cargo *cargoes;          // live parcels in search order
bool *cf;                // nc × nc conflict, search order
double listLimit, slackPct;
u32 fixedMask;
double fixedImb;
int *fixedOcc;           // tank → cargo key or -1
double *fixedImbBy;      // key → P−S tonnes in locked tanks
bool *fixedImbHas;
int *remMin;

struct Choice { u32 mask; double unplaced; };
Choice *choice, *bestChoice;
u32 *placedMasks;
bool hasBest;
long bestVersion;
struct Leaf { double score, unplaced, imb, stage, slack, waste; int tanksUsed, unpaired, slops; } best;
double nodes;
bool timedOut;
double deadline;

// leafScore scratch
int *occ;
double *imbBy;
bool *imbHas;
Dist *dist;

u32 neighborsOf(u32 mask) {
    u32 acc = 0;
    for (u32 r = mask; r; r &= r - 1) acc |= tanks[bitIndex(r & -r)].neighborMask;
    return acc;
}

Leaf leafScore(const Choice *ch) {
    for (int i = 0; i < n; i++) occ[i] = fixedOcc[i];
    double imb = fixedImb, unplaced = 0, slack = 0, waste = 0;
    int tanksUsed = bitCount(fixedMask), slops = 0;
    for (int k = 0; k < nKeys; k++) { imbBy[k] = fixedImbBy[k]; imbHas[k] = fixedImbHas[k]; }
    for (int k = 0; k < nc; k++) {
        const Cargo &c = cargoes[k];
        unplaced += ch[k].unplaced;
        if (!ch[k].mask) { dist[k].cnt = 0; continue; }
        Dist &d = dist[k];
        distribute(c, ch[k].mask, c.need - ch[k].unplaced, d);
        for (int e = 0; e < d.cnt; e++) {
            int i = d.idx[e];
            double vol = d.vol[e];
            occ[i] = c.key;
            double m = (tanks[i].port ? 1.0 : -1.0) * vol * (c.capMass[i] / c.capVol[i]);
            imb += m;
            imbBy[c.key] = (imbHas[c.key] ? imbBy[c.key] : 0) + m;
            imbHas[c.key] = true;
            tanksUsed++;
            if (tanks[i].slop) slops++;
            waste += dmax(0, c.capVol[i] - vol);
            double pct = vol / tanks[i].cap * 100;
            if (pct > 2 && pct < slackPct) slack += slackPct - pct;
        }
    }
    int unpaired = 0;
    for (int i = 0; i < n; i++) {
        if (occ[i] < 0) continue;
        if (occ[tanks[i].pair] != occ[i]) unpaired++;
    }
    double a = dabs(imb);
    double stage = 0;
    int keys = 0;
    for (int k = 0; k < nKeys; k++) if (imbHas[k]) keys++;
    if (keys > 1)
        for (int k = 0; k < nKeys; k++) if (imbHas[k]) stage = dmax(stage, dmax(dabs(imbBy[k]), dabs(imb - imbBy[k])));
    double score = unplaced * W_UNPLACED + tanksUsed * W_TANK + slops * W_SLOP + unpaired * W_UNPAIRED + slack * W_SLACK + waste * W_WASTE +
        a * W_LIST_LIN + dmax(0, a - listLimit) * W_LIST_OVER +
        stage * W_STAGE_LIN + dmax(0, stage - listLimit) * W_LIST_OVER;
    return Leaf{ score, unplaced, imb, stage, slack, waste, tanksUsed, unpaired, slops };
}

/** Tanks a parcel may not use given what is placed so far (occupied or next to an incompatible parcel). */
u32 blockedFor(int j, int k, u32 used) {
    u32 forbid = cargoes[j].forbidFixed;
    for (int i = 0; i < k; i++) if (placedMasks[i] && cf[j * nc + i]) forbid |= neighborsOf(placedMasks[i]);
    return used | forbid;
}

void dfs(int k, u32 used, double partial) {
    if (timedOut) return;
    nodes += 1;
    if (((unsigned long long)nodes & 1023) == 0 && stow_now_ms() > deadline) { timedOut = true; return; }
    if (k == nc) {
        Leaf s = leafScore(choice);
        if (!hasBest || s.score < best.score) {
            best = s; hasBest = true; bestVersion++;
            for (int i = 0; i < nc; i++) bestChoice[i] = choice[i];
        }
        return;
    }
    // Lower bound: tanks still needed + cargo that can no longer fit in what is left for it
    double bound = partial + remMin[k] * W_TANK;
    for (int j = k; j < nc; j++) {
        const Cargo &c = cargoes[j];
        double room = c.cap[c.allowed & ~blockedFor(j, k, used)];
        if (room < c.need) bound += (c.need - room) * W_UNPLACED;
    }
    if (hasBest && bound >= best.score) return;
    const Cargo &c = cargoes[k];
    u32 blocked = blockedFor(k, k, used);
    const int limit = branchLimit[k < 2 ? 0 : (k < 4 ? 1 : 2)];
    int tried = 0;
    for (int ci = 0; ci < c.nList; ci++) {
        const Cand &cand = c.list[ci];
        if (cand.mask & blocked) continue;
        choice[k] = Choice{ cand.mask, 0 };
        placedMasks[k] = cand.mask;
        dfs(k + 1, used | cand.mask, partial + cand.count * W_TANK);
        if (++tried >= limit || timedOut) break;
    }
    if (tried == 0) {
        // Parcel cannot be fully stowed: best partial (largest free compatible tanks first)
        u32 avail = c.allowed & ~blocked;
        if (avail) {
            int idxs[MAX_TANKS], ni = 0;
            for (u32 r = avail; r; r &= r - 1) idxs[ni++] = bitIndex(r & -r);
            stableSort(idxs, ni, [&](int a, int b) { return c.capMass[b] - c.capMass[a]; });
            u32 m = 0;
            double capSum = 0;
            for (int q = 0; q < ni; q++) { int i = idxs[q]; if (capSum >= c.need - EPS) break; m |= tanks[i].bit; capSum += c.capMass[i]; }
            double unplaced = dmax(0, c.need - capSum);
            choice[k] = Choice{ m, unplaced };
            placedMasks[k] = m;
            dfs(k + 1, used | m, partial + unplaced * W_UNPLACED + bitCount(m) * W_TANK);
        }
        // …or leave it out entirely so others can use the space
        choice[k] = Choice{ 0, c.need };
        placedMasks[k] = 0;
        dfs(k + 1, used, partial + c.need * W_UNPLACED);
    }
    placedMasks[k] = 0;
}

double *input;
int inputCount;

}  // namespace

extern "C" double *stow_input(int count) {
    stow_sys_reset();
    inputCount = count;
    input = alloc<double>(count);
    return input;
}

extern "C" double *stow_run(void) {
    const double t0 = stow_now_ms();
    const double *p = input;
    p++;                                           // layout version
    n = int(*p++);
    int ncAll = int(*p++);
    nf = int(*p++);
    const double timeMs = *p++;
    listLimit = *p++;
    slackPct = *p++;
    const double baseImb = *p++;
    for (int i = 0; i < 3; i++) branchLimit[i] = int(*p++);
    candLimit = int(*p++);
    if (n > MAX_TANKS) n = MAX_TANKS;
    for (int i = 0; i < n; i++) {
        Tank &t = tanks[i];
        t.cap = *p++; t.port = *p++ != 0; t.row = int(*p++); t.slop = *p++ != 0; t.pair = int(*p++); t.neighborMask = u32(*p++);
        t.bit = u32(1) << i;
    }
    const double *fx = p; p += 3 * nf;
    const double *cg = p; const int stride = 5 + 2 * n; p += long(stride) * ncAll;
    const double *conflictAll = p; p += long(ncAll) * ncAll;
    const double *fixedConflictAll = p;

    nKeys = 0;
    for (int f = 0; f < nf; f++) if (int(fx[3 * f + 1]) + 1 > nKeys) nKeys = int(fx[3 * f + 1]) + 1;
    for (int k = 0; k < ncAll; k++) if (int(cg[stride * k]) + 1 > nKeys) nKeys = int(cg[stride * k]) + 1;

    // Live parcels, most-constrained first: number of incompatible partners, then volume.
    cargoes = alloc<Cargo>(ncAll);
    nc = 0;
    for (int k = 0; k < ncAll; k++) {
        const double *q = cg + long(stride) * k;
        if (!(q[1] > 0.01)) continue;
        Cargo &c = cargoes[nc++];
        c.key = int(q[0]); c.order = k; c.need = q[1]; c.mpm = q[2]; c.allowed = u32(q[3]); c.consolidated = q[4] != 0;
        c.capVol = q + 5; c.capMass = q + 5 + n;
    }
    for (int a = 0; a < nc; a++) {
        Cargo &c = cargoes[a];
        int deg = 0;
        for (int b = 0; b < nc; b++) if (b != a && conflictAll[c.order * ncAll + cargoes[b].order] != 0) deg++;
        c.forbidFixed = 0;
        for (int f = 0; f < nf; f++) if (fixedConflictAll[c.order * (nf ? nf : 1) + f] != 0) {
            deg++;
            c.forbidFixed |= tanks[int(fx[3 * f])].neighborMask;
        }
        c.degree = deg;
    }
    stableSort(cargoes, nc, [](const Cargo &a, const Cargo &b) -> double {
        double d = b.degree - a.degree;
        if (decided(d)) return d;
        return (b.need / b.mpm) - (a.need / a.mpm);
    });
    cf = alloc<bool>(long(nc) * nc);
    for (int a = 0; a < nc; a++)
        for (int b = 0; b < nc; b++) cf[a * nc + b] = a != b && conflictAll[cargoes[a].order * ncAll + cargoes[b].order] != 0;

    // P−S moment (t) already on board that the plan must live with, e.g. uneven ballast
    fixedMask = 0; fixedImb = baseImb;
    fixedOcc = alloc<int>(n);
    for (int i = 0; i < n; i++) fixedOcc[i] = -1;
    fixedImbBy = alloc<double>(nKeys);
    fixedImbHas = alloc<bool>(nKeys);
    for (int f = 0; f < nf; f++) {
        int idx = int(fx[3 * f]), key = int(fx[3 * f + 1]);
        double mass = fx[3 * f + 2];
        fixedMask |= tanks[idx].bit;
        fixedOcc[idx] = key;
        double m = (tanks[idx].port ? 1.0 : -1.0) * mass;
        fixedImb += m;
        fixedImbBy[key] = (fixedImbHas[key] ? fixedImbBy[key] : 0) + m;
        fixedImbHas[key] = true;
    }

    for (int k = 0; k < nc; k++) buildCandidates(cargoes[k], slackPct);
    remMin = alloc<int>(nc + 1);
    remMin[nc] = 0;
    for (int k = nc - 1; k >= 0; k--) remMin[k] = remMin[k + 1] + cargoes[k].minCount;

    choice = alloc<Choice>(nc); bestChoice = alloc<Choice>(nc); placedMasks = alloc<u32>(nc);
    occ = alloc<int>(n); imbBy = alloc<double>(nKeys); imbHas = alloc<bool>(nKeys); dist = alloc<Dist>(nc);
    hasBest = false; bestVersion = 0; nodes = 0;
    bool anyTimedOut = false;
    int passWin = 0;

    // Pass 1: least empty volume first (allows cross / diagonal stowage); pass 2: P/S pairs first.
    for (int pi = 0; pi < 2; pi++) {
        for (int k = 0; k < nc; k++) {
            Cargo &c = cargoes[k];
            c.list = pi == 0 ? c.byWaste : c.byPairs;
            c.nList = pi == 0 ? c.nWaste : c.nPairs;
        }
        timedOut = false;
        double passStart = stow_now_ms();
        double budget = (timeMs - (passStart - t0)) / (2 - pi);
        deadline = passStart + budget;
        long before = bestVersion;
        for (int k = 0; k < nc; k++) placedMasks[k] = 0;
        dfs(0, fixedMask, 0);
        if (bestVersion != before) passWin = pi + 1;
        anyTimedOut = anyTimedOut || timedOut;
    }

    // Output
    long size = 12;
    for (int k = 0; k < nc; k++) size += 3 + 2 * n;
    double *out = alloc<double>(size), *o = out;
    *o++ = nodes;
    *o++ = stow_now_ms() - t0;
    *o++ = anyTimedOut ? 1 : 0;
    *o++ = hasBest ? best.score : 0;
    *o++ = hasBest ? 1 : 0;
    *o++ = best.tanksUsed; *o++ = best.imb; *o++ = best.stage; *o++ = best.waste; *o++ = best.slack;
    *o++ = passWin;
    *o++ = hasBest ? nc : 0;
    if (hasBest) {
        for (int k = 0; k < nc; k++) {
            const Cargo &c = cargoes[k];
            Dist d; d.cnt = 0;
            if (bestChoice[k].mask) distribute(c, bestChoice[k].mask, c.need - bestChoice[k].unplaced, d);
            *o++ = c.key; *o++ = bestChoice[k].unplaced; *o++ = d.cnt;
            for (int e = 0; e < d.cnt; e++) { *o++ = d.idx[e]; *o++ = d.vol[e]; }
        }
    }
    return out;
}
