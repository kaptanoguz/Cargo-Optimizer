/**
 * Ship Data Constants for M/T ADA
 * Official Vessel Particulars (Bureau Veritas Classed)
 * IMO: 9420693 | Built: 21.02.2008 | GRT: 4021 | NRT: 1819
 * Owner: Born Maritime Co.
 * LOA: 105.5 m | LBP: 99.35 m | Breadth: 16.80 m | Depth: 7.40 m
 * 5 Cargo Wing Tank Pairs + 1 Slop Tank Pair = 12 Cargo Tanks
 * 11 Ballast Tanks (F.P.T + 5 Wing Ballast Tank Pairs)
 */

const MAX_FILL_PERCENTAGE = 98.0;
const DECK_MAX_FILL_PERCENTAGE = 98.0;
const STABILITY_THRESHOLD_MT = 150; // Warning if P/S diff > 150 MT
const MAX_SG_CARGO_TANKS = 1.54;   // Permissible SG for C. Tanks (T/M³) at MAX_FILL_PERCENTAGE

// Interpolated max fill % for a given cargo SG (per stability booklet rule).
// Tanks may be filled to MAX_FILL_PERCENTAGE at the permissible SG (MAX_SG_CARGO_TANKS).
// Above that, the fill % is reduced so the tank never exceeds the same maximum MASS:
//   allowedFill% = MAX_FILL_PERCENTAGE * MAX_SG_CARGO_TANKS / cargoSG
// e.g. SG 1.84 -> 98 * 1.54 / 1.84 = 82.0%   (subject to master's approval)
//      SG 1.86 -> 98 * 1.54 / 1.86 = 81.1%
function getAllowedFillPct(sg) {
    if (!sg || sg <= 0) return MAX_FILL_PERCENTAGE;
    if (sg <= MAX_SG_CARGO_TANKS) return MAX_FILL_PERCENTAGE;
    const pct = (MAX_FILL_PERCENTAGE * MAX_SG_CARGO_TANKS) / sg;
    return Math.max(0, Math.min(MAX_FILL_PERCENTAGE, pct));
}
if (typeof window !== 'undefined') window.getAllowedFillPct = getAllowedFillPct;

// Tank structural properties per IBC Code (Annex I tank types, coatings, heating)
// coating: 'MILD' (mild steel) | 'EPOXY' (zinc-free epoxy) | 'MARINELINE' (marine-line /
//         advanced epoxy-phenolic lining) | 'SS' (stainless steel, premium)
//   M/T ADA cargo tanks are lined with MARINELINE (marine-line / epoxy-phenolic coating),
//   NOT stainless steel. Marine line withstands acids, caustics and most chemicals, but
//   has a service-temperature ceiling (~150°C for marine-line type coatings) — relevant
//   for molten/solidifying cargoes. The field stays so the optimizer can reject a cargo
//   whose required coating exceeds what the tank provides.
// heating: true if tank fitted with cargo heating coils
// tankType: IBC Annex I ship type '1G' | '2G' | '3G' (extends to '2G/3G' ships)
const TANK_STRUCTURE = {
    COT1P: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' },
    COT1S: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' },
    COT2P: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' },
    COT2S: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' },
    COT3P: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' },
    COT3S: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' },
    COT4P: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' },
    COT4S: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' },
    COT5P: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' },
    COT5S: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' },
    SLOPP: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' },
    SLOPS: { coating: 'MARINELINE', heating: true,  tankType: '2G', vent: 'P' }
};

// Coating compatibility precedence: a cargo's required coating must be <= tank coating.
// Ranking (higher = more chemically resistant): MILD(1) < EPOXY(2) < MARINELINE(3) < SS(4)
// Marine line is rated for strong acids/alkalis/chlorinated cargoes; SS is the premium
// option (also needed for very high temperature molten cargoes beyond marine-line limit).
const COATING_RANK = { MILD: 1, EPOXY: 2, MARINELINE: 3, SS: 4 };
// Marine-line service temperature ceiling (~150°C). Cargoes (e.g. molten Phenol, Stearic
// Acid) carried near/above this need verification against the specific lining grade.
const MARINELINE_MAX_TEMP = 150;

// Official DWT values from vessel particulars
const DWT_SUMMER   = 5707.0;  // Summer DWT (Summer Draught: 6.29 m)
const DWT_TROPICAL = 5904.6;  // Tropical DWT (Tropical Draught: 6.421 m)
const DWT_WINTER   = 5510.7;  // Winter DWT (Winter Draught: 6.159 m)

// Draft reference values
const DRAFT_SUMMER   = 6.290; // m
const DRAFT_TROPICAL = 6.421; // m
const DRAFT_WINTER   = 6.159; // m

const TANKS = [
    { id: 'COT1P', name: 'No:1 COT (P)', capacity100: 337.238, side: 'P', frame: '110-95' },
    { id: 'COT1S', name: 'No:1 COT (S)', capacity100: 340.240, side: 'S', frame: '110-95' },
    { id: 'COT2P', name: 'No:2 COT (P)', capacity100: 705.237, side: 'P', frame: '95-80' },
    { id: 'COT2S', name: 'No:2 COT (S)', capacity100: 708.035, side: 'S', frame: '95-80' },
    { id: 'COT3P', name: 'No:3 COT (P)', capacity100: 749.649, side: 'P', frame: '80-65' },
    { id: 'COT3S', name: 'No:3 COT (S)', capacity100: 747.801, side: 'S', frame: '80-65' },
    { id: 'COT4P', name: 'No:4 COT (P)', capacity100: 747.339, side: 'P', frame: '65-50' },
    { id: 'COT4S', name: 'No:4 COT (S)', capacity100: 748.980, side: 'S', frame: '65-50' },
    { id: 'COT5P', name: 'No:5 COT (P)', capacity100: 665.468, side: 'P', frame: '50-35' },
    { id: 'COT5S', name: 'No:5 COT (S)', capacity100: 660.894, side: 'S', frame: '50-35' },
    { id: 'SLOPP', name: 'Slop (P)', capacity100: 80.258, side: 'P', frame: '35-20' },
    { id: 'SLOPS', name: 'Slop (S)', capacity100: 80.147, side: 'S', frame: '35-20' }
];

// Merge structural properties into each tank object so downstream code can read
// t.coating / t.heating / t.tankType / t.vent directly.
TANKS.forEach(t => {
    const s = TANK_STRUCTURE[t.id] || { coating: 'SS', heating: true, tankType: '2G', vent: 'P' };
    t.coating = s.coating;
    t.heating = s.heating;
    t.tankType = s.tankType;
    t.vent = s.vent;
});

const BALLAST_TANKS = [
    { id: 'FPT', name: 'F.P.T', capacity100: 124.800, side: 'C', frame: '120-110' },
    { id: 'WBT1P', name: 'WBT 1 P', capacity100: 164.220, side: 'P', frame: '110-95' },
    { id: 'WBT1S', name: 'WBT 1 S', capacity100: 177.290, side: 'S', frame: '110-95' },
    { id: 'WBT2P', name: 'WBT 2 P', capacity100: 246.340, side: 'P', frame: '95-80' },
    { id: 'WBT2S', name: 'WBT 2 S', capacity100: 258.120, side: 'S', frame: '95-80' },
    { id: 'WBT3P', name: 'WBT 3 P', capacity100: 247.340, side: 'P', frame: '80-65' },
    { id: 'WBT3S', name: 'WBT 3 S', capacity100: 259.120, side: 'S', frame: '80-65' },
    { id: 'WBT4P', name: 'WBT 4 P', capacity100: 247.140, side: 'P', frame: '65-50' },
    { id: 'WBT4S', name: 'WBT 4 S', capacity100: 258.920, side: 'S', frame: '65-50' },
    { id: 'WBT5P', name: 'WBT 5 P', capacity100: 153.960, side: 'P', frame: '50-35' },
    { id: 'WBT5S', name: 'WBT 5 S', capacity100: 161.250, side: 'S', frame: '50-35' }
];
