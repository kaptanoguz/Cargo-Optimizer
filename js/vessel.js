/**
 * vessel.js — M/T ADA particulars, tank geometry and tank adjacency.
 *
 * IMO 9420693 · Built 2008 · BV class · LOA 105.5 m · LBP 99.35 m · B 16.80 m · D 7.40 m
 * IBC ship type 2 · 5 wing tank pairs + 1 slop pair (12 cargo tanks) · Marine-line coated,
 * every cargo tank fitted with heating coils and its own deepwell pump.
 */
(function (global) {
    'use strict';

    const VESSEL = {
        name: 'M/T ADA',
        imo: '9420693',
        ibcShipType: 2,            // can carry ship type 2 and 3 products
        loa: 105.5, lbp: 99.35, breadth: 16.80, depth: 7.40,
        dwt: { T: 5904.6, S: 5707.0, W: 5510.7 },
        draft: { T: 6.421, S: 6.290, W: 6.159 },
        // Stability booklet: tanks may be filled to 98 % with cargo of SG ≤ 1.54.
        // Heavier cargo: fill % reduced so mass per tank stays the same (98 × 1.54 / SG).
        maxFillPct: 98.0,
        maxSgAtMaxFill: 1.54,
        coating: 'MARINELINE',
        coatingMaxTemp: 150       // °C service ceiling of the lining
    };

    // row: 1 (fwd) … 5, 6 = slop. x-order for drawing follows row.
    const CARGO_TANKS = [
        { id: 'COT1P', short: '1P', name: 'No.1 COT (P)', row: 1, side: 'P', cap: 337.238, frame: '110–95' },
        { id: 'COT1S', short: '1S', name: 'No.1 COT (S)', row: 1, side: 'S', cap: 340.240, frame: '110–95' },
        { id: 'COT2P', short: '2P', name: 'No.2 COT (P)', row: 2, side: 'P', cap: 705.237, frame: '95–80' },
        { id: 'COT2S', short: '2S', name: 'No.2 COT (S)', row: 2, side: 'S', cap: 708.035, frame: '95–80' },
        { id: 'COT3P', short: '3P', name: 'No.3 COT (P)', row: 3, side: 'P', cap: 749.649, frame: '80–65' },
        { id: 'COT3S', short: '3S', name: 'No.3 COT (S)', row: 3, side: 'S', cap: 747.801, frame: '80–65' },
        { id: 'COT4P', short: '4P', name: 'No.4 COT (P)', row: 4, side: 'P', cap: 747.339, frame: '65–50' },
        { id: 'COT4S', short: '4S', name: 'No.4 COT (S)', row: 4, side: 'S', cap: 748.980, frame: '65–50' },
        { id: 'COT5P', short: '5P', name: 'No.5 COT (P)', row: 5, side: 'P', cap: 665.468, frame: '50–35' },
        { id: 'COT5S', short: '5S', name: 'No.5 COT (S)', row: 5, side: 'S', cap: 660.894, frame: '50–35' },
        { id: 'SLOPP', short: 'SlP', name: 'Slop (P)', row: 6, side: 'P', cap: 80.258, frame: '35–20', slop: true },
        { id: 'SLOPS', short: 'SlS', name: 'Slop (S)', row: 6, side: 'S', cap: 80.147, frame: '35–20', slop: true }
    ].map((t, i) => Object.assign(t, { idx: i, bit: 1 << i, heating: true, coating: VESSEL.coating }));

    const BALLAST_TANKS = [
        { id: 'FPT',   name: 'F.P.T',   row: 0, side: 'C', cap: 124.800 },
        { id: 'WBT1P', name: 'WBT 1 P', row: 1, side: 'P', cap: 164.220 },
        { id: 'WBT1S', name: 'WBT 1 S', row: 1, side: 'S', cap: 177.290 },
        { id: 'WBT2P', name: 'WBT 2 P', row: 2, side: 'P', cap: 246.340 },
        { id: 'WBT2S', name: 'WBT 2 S', row: 2, side: 'S', cap: 258.120 },
        { id: 'WBT3P', name: 'WBT 3 P', row: 3, side: 'P', cap: 247.340 },
        { id: 'WBT3S', name: 'WBT 3 S', row: 3, side: 'S', cap: 259.120 },
        { id: 'WBT4P', name: 'WBT 4 P', row: 4, side: 'P', cap: 247.140 },
        { id: 'WBT4S', name: 'WBT 4 S', row: 4, side: 'S', cap: 258.920 },
        { id: 'WBT5P', name: 'WBT 5 P', row: 5, side: 'P', cap: 153.960 },
        { id: 'WBT5S', name: 'WBT 5 S', row: 5, side: 'S', cap: 161.250 }
    ];

    const TANK_BY_ID = {};
    CARGO_TANKS.forEach(t => { TANK_BY_ID[t.id] = t; });

    // Tanks sharing a bulkhead: across the centreline bulkhead (same row) and
    // fore/aft transverse bulkhead (same side, row ± 1). Diagonal tanks only meet at a
    // cruciform joint and are not treated as adjacent (industry practice).
    function computeNeighbors(t) {
        return CARGO_TANKS.filter(o => o !== t && (
            (o.row === t.row && o.side !== t.side) ||
            (o.side === t.side && Math.abs(o.row - t.row) === 1)
        ));
    }
    CARGO_TANKS.forEach(t => {
        t.neighbors = computeNeighbors(t).map(o => o.id);
        t.neighborMask = computeNeighbors(t).reduce((m, o) => m | o.bit, 0);
        t.pairId = CARGO_TANKS.find(o => o.row === t.row && o.side !== t.side).id;
    });

    const ALL_TANKS_MASK = (1 << CARGO_TANKS.length) - 1;

    global.VESSEL = VESSEL;
    global.CARGO_TANKS = CARGO_TANKS;
    global.BALLAST_TANKS = BALLAST_TANKS;
    global.TANK_BY_ID = TANK_BY_ID;
    global.ALL_TANKS_MASK = ALL_TANKS_MASK;
})(typeof window !== 'undefined' ? window : globalThis);
