/**
 * compat.js — cargo-to-cargo compatibility for adjacent stowage.
 *
 * Two parcels are NOT allowed to share a bulkhead when
 *   a) their USCG reactive groups are marked incompatible (46 CFR 150, Fig.1), or
 *   b) one is heated above the other's heat-sensitive limit (e.g. Styrene / VAM /
 *      Acrylonitrile next to heated wax, phenol, palm stearin …).
 *
 * Groups that are compatible on the chart but have listed exceptions only raise a warning.
 * The built-in chart is a planning aid. The CFR chart (incl. its exceptions table),
 * the charterer's and the shipper's instructions take precedence.
 */
(function (global) {
    'use strict';

    // Incompatible reactive-group pairs (symmetric), transcribed from 46 CFR 150 Figure 1
    // (Milbros print of the chart): every "×" and every "ⓧ" (incompatible, with listed exceptions).
    const INCOMPAT = {
        1: [2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17],
        2: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 30, 34, 37, 40, 41, 43],
        3: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 30, 32, 33, 34, 35, 41],
        4: [5, 6, 7, 8, 12, 16, 17],
        5: [11, 12, 16, 17, 19, 20, 21, 22, 42],
        6: [10, 11, 12, 13, 16, 17, 19, 42],
        7: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 38, 42],
        8: [11, 12, 13, 14, 15, 16, 17, 19, 38, 42],
        9: [11, 12, 19, 42],
        10: [12, 21],
        12: [20, 22, 40, 43],
        22: [35]
    };
    // "ⓧ" cells: incompatible, but Appendix I lists product pairs that may be stowed together.
    const INCOMPAT_EXCEPT = { 2: [34], 5: [20], 7: [18, 20, 21], 8: [15] };
    // Red-circle cells: compatible, but Appendix I lists product pairs that are NOT —
    // reported as a warning so the planner checks the exceptions table.
    const COMPAT_EXCEPT = {
        1: [19, 20, 30, 34, 36, 41, 43], 2: [32, 36], 3: [36, 43], 4: [9, 20, 34, 36, 41, 43],
        5: [6, 7, 14, 15, 18, 30, 34, 36, 43], 6: [14, 30, 43], 7: [30, 36, 43], 8: [18, 30, 43], 9: [43],
        10: [18, 43], 11: [20, 43], 12: [14, 15, 18, 19, 34, 36], 16: [20], 17: [20], 19: [20, 34], 20: [21, 22]
    };

    function pairSet(table) {
        const set = new Set();
        Object.entries(table).forEach(([a, list]) => list.forEach(b => { set.add(+a + ':' + b); set.add(b + ':' + (+a)); }));
        return set;
    }
    const PAIRS = pairSet(INCOMPAT);
    const PAIRS_EXCEPT = pairSet(INCOMPAT_EXCEPT);
    const CAUTION = pairSet(COMPAT_EXCEPT);

    function groupsIncompatible(a, b) {
        if (!a || !b || a === b) return false;
        return PAIRS.has(a + ':' + b);
    }

    /** Planned carriage temperature (°C) — used for heat transfer to neighbours. */
    function carriageTemp(c) {
        const tl = Number.isFinite(c.loadT) ? c.loadT : null;
        const tv = Number.isFinite(c.voyT) ? c.voyT : null;
        const vals = [tl, tv].filter(v => v != null);
        return vals.length ? Math.max(...vals) : null;
    }

    /**
     * Returns null when the two parcels may share a bulkhead, otherwise
     * { code, msg } describing why not.
     */
    function pairConflict(c1, c2) {
        if (!c1 || !c2 || c1.id === c2.id) return null;
        if (groupsIncompatible(c1.rg, c2.rg)) {
            const RG = global.REACTIVE_GROUPS || {};
            return {
                code: 'RG',
                msg: `${c1.name} (grp ${c1.rg} ${RG[c1.rg] || ''}) ⨯ ${c2.name} (grp ${c2.rg} ${RG[c2.rg] || ''}) — incompatible, no common bulkhead` +
                    (PAIRS_EXCEPT.has(c1.rg + ':' + c2.rg) ? ' (46 CFR 150 App. I lists exceptions)' : '')
            };
        }
        const heatMsg = (hot, cold) => {
            const th = carriageTemp(hot);
            if (th != null && Number.isFinite(cold.maxT) && th > cold.maxT) {
                return { code: 'HEAT', msg: `${hot.name} carried at ${th} °C next to heat-sensitive ${cold.name} (max ${cold.maxT} °C)` };
            }
            return null;
        };
        return heatMsg(c1, c2) || heatMsg(c2, c1);
    }

    /** Groups compatible on the chart but with listed exceptions → { code, msg } or null. */
    function pairCaution(c1, c2) {
        if (!c1 || !c2 || c1.id === c2.id || !c1.rg || !c2.rg || !CAUTION.has(c1.rg + ':' + c2.rg)) return null;
        return { code: 'RG-EX', msg: `${c1.name} (grp ${c1.rg}) / ${c2.name} (grp ${c2.rg}) — compatible groups with exceptions: check 46 CFR 150 App. I` };
    }

    global.Compat = { groupsIncompatible, pairConflict, pairCaution, carriageTemp, INCOMPAT, INCOMPAT_EXCEPT, COMPAT_EXCEPT };
})(typeof window !== 'undefined' ? window : globalThis);
