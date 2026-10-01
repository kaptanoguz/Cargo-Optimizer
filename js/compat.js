/**
 * compat.js — cargo-to-cargo compatibility for adjacent stowage.
 *
 * Two parcels are NOT allowed to share a bulkhead when
 *   a) their USCG reactive groups are marked incompatible (46 CFR 150, Fig.1 —
 *      simplified, conservative subset built in here), or
 *   b) one is heated above the other's heat-sensitive limit (e.g. Styrene / VAM /
 *      Acrylonitrile next to heated wax, phenol, palm stearin …).
 *
 * The built-in chart is a planning aid. The CFR chart (incl. its exceptions table),
 * the charterer's and the shipper's instructions take precedence.
 */
(function (global) {
    'use strict';

    // Incompatible reactive-group pairs (symmetric). Conservative where the chart
    // marks "may be incompatible".
    const INCOMPAT = {
        1: [5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 19, 22],
        2: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 30, 32, 34, 37, 40, 41, 42, 43],
        3: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 30, 32, 33, 34, 37, 40, 41, 42],
        4: [5, 6, 7, 8, 9, 12, 16, 17],
        5: [11, 12, 13, 15, 16, 17, 19, 21, 22],
        6: [11, 12, 14, 15, 16, 17, 19, 21],
        7: [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 36],
        8: [11, 12, 16, 17, 19],
        9: [11, 12],
        10: [12],
        11: [20],
        12: [20, 21, 43]
    };

    const PAIRS = new Set();
    Object.entries(INCOMPAT).forEach(([a, list]) => list.forEach(b => {
        PAIRS.add(+a + ':' + b);
        PAIRS.add(b + ':' + (+a));
    }));

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
                msg: `${c1.name} (grp ${c1.rg} ${RG[c1.rg] || ''}) ⨯ ${c2.name} (grp ${c2.rg} ${RG[c2.rg] || ''}) — incompatible, no common bulkhead`
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

    global.Compat = { groupsIncompatible, pairConflict, carriageTemp, INCOMPAT };
})(typeof window !== 'undefined' ? window : globalThis);
