/**
 * compliance.js — IBC Code (International Bulk Chemical Code) compliance layer
 * for M/T ADA chemical tanker stowage planning.
 *
 * Adds — WITHOUT modifying existing app logic — the regulatory checks a chemical
 * tanker cargo plan must pass:
 *   1. Hazard category assignment (A/B/C/D/E/F/G/H/J/K/L/M/N/O/P/Q/R/S)
 *   2. Segregation matrix (IBC Code Chapter 14 / IMO BC Code) with physical
 *      separation distance (1/2/3 — adjacent / one tank between / two+ between)
 *   3. Tank suitability: cargo required coating vs tank coating, SG limit,
 *      heating requirement vs tank heating coils, IBC ship type.
 *   4. Temperature control: required carriage temperature vs tank heating availability.
 *
 * All functions are pure (input -> warnings[]) so the optimizer never breaks.
 * Existing handlers call checkChemicalCompliance() defensively inside try/catch.
 */

// ===== IBC hazard categories =====
// Mapped per typical IBC Code Chapter 17 assignments for common chemicals.
const IBC_CATEGORIES = {
    // Category A — extremely hazardous (few chemicals get this; none typical here)
    // We include representative acids/solvents under B/C as per IBC listing.
    'B': { name: 'Category B', desc: 'Major hazard' },
    'C': { name: 'Category C', desc: 'Severe hazard' },
    'D': { name: 'Category D', desc: 'Serious hazard' },
    'E': { name: 'Category E', desc: 'Hazardous' },
    'F': { name: 'Category F', desc: 'Moderate hazard' },
    'G': { name: 'Category G', desc: 'Low hazard (pollutant)' },
    'H': { name: 'Category H', desc: 'Liquid flammable' },
    'J': { name: 'Category J', desc: 'Liquid flammable (low flash)' },
    'K': { name: 'Category K', desc: 'Toxic liquid (flammable)' },
    'L': { name: 'Category L', desc: 'Toxic liquid' },
    'M': { name: 'Category M', desc: 'Corrosive' },
    'N': { name: 'Category N', desc: 'Corrosive / irritant' },
    'O': { name: 'Category O', desc: 'Miscellaneous' },
    'P': { name: 'Category P', desc: 'Food / edible (high purity)' },
    'Q': { name: 'Category Q', desc: 'Vegetable oil / fatty' },
    'R': { name: 'Category R', desc: 'Vegetable oil edible' },
    'S': { name: 'Category S', desc: 'Solidifying / high pour point' }
};

// ===== Per-cargo regulatory data =====
// cat:  hazard category letter
// reqCoating: minimum tank coating required ('MILD' | 'EPOXY' | 'SS')
// reqTankType: minimum IBC ship type ('1G' | '2G' | '3G')
// minTemp / maxTemp: recommended carriage temperature band (°C). null = ambient OK.
// needsHeating: true if cargo must be carried warm / above pour point (heating coils needed)
// sgLimit overrides MAX_SG_CARGO_TANKS when set (rare)
const IBC_CARGO_REG = {
    'Benzene':                       { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '1114', a2cat: 'Y', highVisc: false, solidify: false },
    'Toluene':                       { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '1294', a2cat: 'Y', highVisc: false, solidify: false, },
    'Xylene (Mixed)':               { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '1307', a2cat: 'Y', highVisc: false, solidify: false, },
    'Styrene Monomer':               { cat: 'K', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 25,  needsHeating: false, imdgClass: '3', unNo: '2055', a2cat: 'Y', highVisc: false, solidify: false, },
    'Methanol':                      { cat: 'K', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '1230', a2cat: 'Y', highVisc: false, solidify: false, },
    'Ethanol':                       { cat: 'K', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '1170', a2cat: 'Y', highVisc: false, solidify: false, },
    'Isopropanol (IPA)':             { cat: 'K', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '1219', a2cat: 'Y', highVisc: false, solidify: false, },
    'Butanol (n-Butanol)':           { cat: 'K', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '1120', a2cat: 'Y', highVisc: false, solidify: false, },
    'Acetone':                       { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 30,  needsHeating: false, imdgClass: '3', unNo: '1090', a2cat: 'Y', highVisc: false, solidify: false, },
    'MEK (Methyl Ethyl Ketone)':     { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '3', unNo: '1193', a2cat: 'Y', highVisc: false, solidify: false, },
    'MIBK':                          { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '3', unNo: '1245', a2cat: 'Y', highVisc: false, solidify: false, },
    'Cyclohexanone':                 { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 45,  needsHeating: false, imdgClass: '3', unNo: '1915', a2cat: 'Y', highVisc: false, solidify: false, },
    'Ethyl Acetate':                 { cat: 'K', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '3', unNo: '1173', a2cat: 'Y', highVisc: false, solidify: false, },
    'Butyl Acetate':                 { cat: 'K', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '3', unNo: '1123', a2cat: 'Y', highVisc: false, solidify: false, },
    'Acetic Acid (Glacial)':         { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: 20,   maxTemp: null, needsHeating: true, imdgClass: '8', unNo: '2789', a2cat: 'X', highVisc: false, solidify: false,  },
    'Phosphoric Acid (75%)':         { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '8', unNo: '1805', a2cat: 'X', highVisc: false, solidify: false, },
    'Sulfuric Acid (98%)':           { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '8', unNo: '1830', a2cat: 'X', highVisc: false, solidify: false, },
    'Hydrochloric Acid (32%)':       { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '8', unNo: '1789', a2cat: 'X', highVisc: false, solidify: false, },
    'Nitric Acid (56%)':             { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '8', unNo: '2031', a2cat: 'X', highVisc: false, solidify: false, },
    'Caustic Soda (50%)':            { cat: 'N', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: 15,   maxTemp: null, needsHeating: true, imdgClass: '8', unNo: '1823', a2cat: 'X', highVisc: false, solidify: false,  },
    'Caustic Soda (32%)':            { cat: 'N', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: 10,   maxTemp: null, needsHeating: true, imdgClass: '8', unNo: '1824', a2cat: 'X', highVisc: false, solidify: false,  },
    'Sodium Hypochlorite (15%)':     { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: 5,    maxTemp: 35,   needsHeating: false, imdgClass: '8', unNo: '1791', a2cat: 'X', highVisc: false, solidify: false, },
    'Phenol (Molten)':               { cat: 'S', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: 55,   maxTemp: 95,   needsHeating: true, imdgClass: '6.1', unNo: '2312', a2cat: 'X', highVisc: true, solidify: true,  },
    'Monoethylene Glycol (MEG)':     { cat: 'N', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: false, solidify: false, },
    'Diethylene Glycol (DEG)':       { cat: 'N', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: false, solidify: false, },
    'Triethylene Glycol (TEG)':      { cat: 'N', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: false, solidify: false, },
    'Propylene Glycol':              { cat: 'N', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: false, solidify: false, },
    'Glycerine':                     { cat: 'N', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: false, solidify: false, },
    'Ethylene Dichloride (EDC)':     { cat: 'L', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '6.1', unNo: '1184', a2cat: 'Y', highVisc: false, solidify: false, },
    'Methylene Chloride (DCM)':      { cat: 'L', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '6.1', unNo: '1593', a2cat: 'Y', highVisc: false, solidify: false, },
    'Carbon Tetrachloride':          { cat: 'L', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '6.1', unNo: '1846', a2cat: 'Y', highVisc: false, solidify: false, },
    'Perchloroethylene':             { cat: 'L', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '6.1', unNo: '1897', a2cat: 'Y', highVisc: false, solidify: false, },
    'Acrylonitrile':                 { cat: 'K', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 30,  needsHeating: false, imdgClass: '3', unNo: '1093', a2cat: 'Y', highVisc: false, solidify: false, },
    'Vinyl Acetate Monomer (VAM)':   { cat: 'K', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 25,  needsHeating: false, imdgClass: '3', unNo: '1301', a2cat: 'Y', highVisc: false, solidify: false, },
    'Epichlorohydrin':               { cat: 'L', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '6.1', unNo: '2023', a2cat: 'Y', highVisc: false, solidify: false, },
    'Furfural':                      { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 45,  needsHeating: false, imdgClass: '6.1', unNo: '1199', a2cat: 'Y', highVisc: false, solidify: false, },
    'DMF (Dimethylformamide)':       { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 45,  needsHeating: false, imdgClass: '3', unNo: '2265', a2cat: 'Y', highVisc: false, solidify: false, },
    'Formaldehyde (37%)':            { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: 10,   maxTemp: 35,  needsHeating: false, imdgClass: '8', unNo: '2209', a2cat: 'X', highVisc: false, solidify: false, },
    'Paraxylene':                    { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '1307', a2cat: 'Y', highVisc: false, solidify: false, },
    'Orthoxylene':                   { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '1307', a2cat: 'Y', highVisc: false, solidify: false, },
    'Cyclohexane':                   { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '3', unNo: '1145', a2cat: 'Y', highVisc: false, solidify: false, },
    'Cumene':                        { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '1918', a2cat: 'Y', highVisc: false, solidify: false, },
    'Nonene':                        { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: 'None', a2cat: 'Y', highVisc: false, solidify: false, },
    'IsoOctanol':                    { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 45,  needsHeating: false, imdgClass: '3', unNo: 'None', a2cat: 'Y', highVisc: false, solidify: false, },
    '2-Ethylhexanol':                { cat: 'M', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: 45,  needsHeating: false, imdgClass: '3', unNo: 'None', a2cat: 'Y', highVisc: false, solidify: false, },
    'DOP (Dioctyl Phthalate)':       { cat: 'N', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false, },
    'DINP':                          { cat: 'N', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false, },
    'Latex (Natural)':               { cat: 'O', reqCoating: 'MARINELINE',  reqTankType: '2G', minTemp: 15,   maxTemp: 35,  needsHeating: false, imdgClass: '9', unNo: 'None', a2cat: 'OS', highVisc: true, solidify: false, },
    'Urea Ammonium Nitrate (UAN 32%)': { cat: 'N', reqCoating: 'MARINELINE', reqTankType: '2G', minTemp: null, maxTemp: 35, needsHeating: false, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: false, solidify: false, },

    // Petroleum products
    'MTBE':                          { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '2398', a2cat: 'Y', highVisc: false, solidify: false, },
    'ETBE':                          { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: 40,  needsHeating: false, imdgClass: '3', unNo: '2398', a2cat: 'Y', highVisc: false, solidify: false, },
    'FAME (Biodiesel)':              { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false, },
    'Diesel (ULSD)':                 { cat: 'H', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '3', unNo: '1202', a2cat: 'Y', highVisc: true, solidify: false, },
    'Diesel (EN590)':                { cat: 'H', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '3', unNo: '1202', a2cat: 'Y', highVisc: true, solidify: false, },
    'Gasoil (0.1% S)':               { cat: 'H', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '3', unNo: '1202', a2cat: 'Y', highVisc: true, solidify: false, },
    'Gasoil (0.5% S)':               { cat: 'H', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '3', unNo: '1202', a2cat: 'Y', highVisc: true, solidify: false, },
    'Gasoline (ULG 95)':             { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '3', unNo: '1203', a2cat: 'Y', highVisc: false, solidify: false, },
    'Gasoline (ULG 98)':             { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '3', unNo: '1203', a2cat: 'Y', highVisc: false, solidify: false, },
    'Jet Fuel (A-1)':                { cat: 'H', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '3', unNo: '1863', a2cat: 'Y', highVisc: false, solidify: false, },
    'Naphtha (Light)':               { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '3', unNo: '1255', a2cat: 'Y', highVisc: false, solidify: false, },
    'Naphtha (Heavy)':               { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '3', unNo: '1255', a2cat: 'Y', highVisc: false, solidify: false, },
    'Naphtha (Full Range)':          { cat: 'J', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: 35,  needsHeating: false, imdgClass: '3', unNo: '1255', a2cat: 'Y', highVisc: false, solidify: false, },
    'Kerosene':                      { cat: 'H', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '3', unNo: '1223', a2cat: 'Y', highVisc: false, solidify: false, },
    'Base Oil (SN150)':              { cat: 'H', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false, },
    'Base Oil (SN500)':              { cat: 'H', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false, },
    'Fuel Oil (180 cSt)':            { cat: 'S', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 50,   maxTemp: null, needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true,  },
    'Fuel Oil (380 cSt)':            { cat: 'S', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 60,   maxTemp: null, needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true,  },
    'VLSFO':                         { cat: 'S', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 45,   maxTemp: null, needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true,  },
    'MGO (Marine Gasoil)':           { cat: 'H', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: '3', unNo: '1202', a2cat: 'Y', highVisc: true, solidify: false, },

    // Vegetable oils & fats (solidifying)
    'Palm Oil (RBD)':                { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 35,   maxTemp: 55,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true,  },
    'Palm Olein':                    { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 33,   maxTemp: 50,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true,  },
    'Palm Stearin':                  { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 50,   maxTemp: 65,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true,  },
    'Coconut Oil':                   { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 27,   maxTemp: 40,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false,  },
    'Sunflower Oil':                 { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 18,   maxTemp: 35,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false,  },
    'Soybean Oil':                   { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 18,   maxTemp: 35,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false,  },
    'Rapeseed Oil (Canola)':         { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 15,   maxTemp: 35,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false,  },
    'Fish Oil':                      { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 25,   maxTemp: 45,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false,  },
    'Tall Oil':                      { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 30,   maxTemp: 50,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false,  },
    'Fatty Acid (C16-18)':           { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 55,   maxTemp: 75,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true,  },
    'Oleic Acid':                    { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 15,   maxTemp: 40,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false,  },
    'Stearic Acid':                  { cat: 'S', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 60,   maxTemp: 90,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true,  },
    'UCO (Used Cooking Oil)':        { cat: 'Q', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 20,   maxTemp: 45,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false,  },
    'Molasses':                      { cat: 'N', reqCoating: 'MARINELINE',  reqTankType: '3G', minTemp: 30,   maxTemp: 50,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: false,  },

    'Water (Ballast/FW)':            { cat: 'G', reqCoating: 'MILD', reqTankType: '3G', minTemp: null, maxTemp: null, needsHeating: false, imdgClass: 'None', unNo: 'None', a2cat: 'OS', highVisc: false, solidify: false, },

    // Waxes & paraffins (solidifying, heated)
    'Paraffin Wax':                  { cat: 'S', reqCoating: 'MARINELINE', reqTankType: '3G', minTemp: 60,  maxTemp: 80,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true },
    'Micro Wax':                     { cat: 'S', reqCoating: 'MARINELINE', reqTankType: '3G', minTemp: 65,  maxTemp: 85,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true },
    'Slack Wax':                     { cat: 'S', reqCoating: 'MARINELINE', reqTankType: '3G', minTemp: 50,  maxTemp: 70,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true },
    'Palm Wax':                      { cat: 'S', reqCoating: 'MARINELINE', reqTankType: '3G', minTemp: 55,  maxTemp: 75,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true },
    'Synthetic Wax':                 { cat: 'S', reqCoating: 'MARINELINE', reqTankType: '3G', minTemp: 70,  maxTemp: 90,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true },
    'Fully Refined Wax':             { cat: 'S', reqCoating: 'MARINELINE', reqTankType: '3G', minTemp: 60,  maxTemp: 80,  needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true },
    'Polyethylene Wax':              { cat: 'S', reqCoating: 'MARINELINE', reqTankType: '3G', minTemp: 85,  maxTemp: 100, needsHeating: true, imdgClass: '9', unNo: '3082', a2cat: 'Z', highVisc: true, solidify: true },
};

// ===== Cargo hazard flags (for separate IBC control streams) =====
// A cargo may belong to several groups. Used to render separate FLAMMABLE /
// CORROSIVE / HEATED control panels per the operator's requirement.
const FLAMMABLE_CATS = ['H', 'J', 'K', 'L'];   // liquid flammable / toxic-flammable
const CORROSIVE_CATS = ['M', 'N'];              // acid / alkali
function getCargoFlags(cargoName) {
    const reg = getCargoReg(cargoName);
    if (!reg) return { flammable: false, corrosive: false, heated: false };
    return {
        flammable: FLAMMABLE_CATS.includes(reg.cat),
        corrosive: CORROSIVE_CATS.includes(reg.cat),
        heated: !!reg.needsHeating
    };
}

// ===== Forbidden adjacency pairs (special IBC sequencing rules) =====
// These cargoes must NOT be stowed in adjacent tanks (NOT even in the same
// transverse pair P/S, nor in the next frame). At least one empty tank pair
// must separate them. Rationale:
//   - Styrene Monomer (polymerizing, keep ≤25°C) vs Paraffin Wax (heated ≥60°C):
//     heat transfer through the bulkhead can trigger styrene polymerization.
// Keyed by sorted cargo-name pair so lookup is order-independent.
const FORBIDDEN_ADJACENT = [
    { a: 'Styrene Monomer', b: 'Paraffin Wax',  reason: 'Styrene (polymerizing, ≤25°C) must not be adjacent to heated Paraffin Wax (≥60°C) — bulkhead heat can trigger polymerization' },
    { a: 'Styrene Monomer', b: 'Micro Wax',      reason: 'Styrene (polymerizing, ≤25°C) vs heated Micro Wax (≥65°C) — adjacent stowage prohibited' },
    { a: 'Styrene Monomer', b: 'Slack Wax',      reason: 'Styrene (polymerizing, ≤25°C) vs heated Slack Wax (≥50°C) — adjacent stowage prohibited' },
    { a: 'Styrene Monomer', b: 'Stearic Acid',   reason: 'Styrene (polymerizing, ≤25°C) vs heated Stearic Acid (≥60°C) — adjacent stowage prohibited' },
    { a: 'Styrene Monomer', b: 'Fatty Acid (C16-18)', reason: 'Styrene (polymerizing, ≤25°C) vs heated Fatty Acid (≥55°C) — adjacent stowage prohibited' }
];
function forbiddenAdjacentKey(n1, n2) { return [n1, n2].sort().join(' ⨯ '); }
const FORBIDDEN_ADJACENT_MAP = {};
FORBIDDEN_ADJACENT.forEach(p => { FORBIDDEN_ADJACENT_MAP[forbiddenAdjacentKey(p.a, p.b)] = p.reason; });

// ===== Segregation matrix (IBC Code Chapter 14) =====
// 1 = adjacent tanks permitted
// 2 = at least one empty tank / space between
// 3 = at least two empty tanks / spaces between (separated by a cofferdam/void)
// 4 = separation from all other cargo (separate pumping/venting, often prohibited together)
const SEG_MATRIX = {
    A: { B: 4, C: 4, D: 4, E: 3, F: 3, G: 3, H: 4, J: 4, K: 4, L: 4, M: 4, N: 3, O: 2, P: 4, Q: 4, R: 4, S: 3 },
    B: { C: 2, D: 2, E: 2, F: 2, G: 2, H: 2, J: 2, K: 2, L: 2, M: 2, N: 2, O: 2, P: 3, Q: 3, R: 3, S: 2 },
    C: { D: 2, E: 2, F: 2, G: 2, H: 2, J: 2, K: 2, L: 2, M: 2, N: 2, O: 2, P: 3, Q: 3, R: 3, S: 2 },
    D: { E: 1, F: 1, G: 1, H: 1, J: 1, K: 1, L: 1, M: 2, N: 1, O: 1, P: 2, Q: 2, R: 2, S: 1 },
    E: { F: 1, G: 1, H: 1, J: 1, K: 1, L: 1, M: 1, N: 1, O: 1, P: 2, Q: 1, R: 1, S: 1 },
    F: { G: 1, H: 1, J: 1, K: 1, L: 1, M: 1, N: 1, O: 1, P: 2, Q: 1, R: 1, S: 1 },
    G: { H: 1, J: 1, K: 1, L: 1, M: 1, N: 1, O: 1, P: 1, Q: 1, R: 1, S: 1 },
    H: { J: 1, K: 1, L: 1, M: 1, N: 1, O: 1, P: 2, Q: 1, R: 1, S: 1 },
    J: { K: 1, L: 1, M: 1, N: 1, O: 1, P: 2, Q: 1, R: 1, S: 1 },
    K: { L: 1, M: 1, N: 1, O: 1, P: 2, Q: 1, R: 1, S: 1 },
    L: { M: 1, N: 1, O: 1, P: 2, Q: 1, R: 1, S: 1 },
    M: { N: 2, O: 1, P: 2, Q: 1, R: 1, S: 1 },
    N: { O: 1, P: 2, Q: 1, R: 1, S: 1 },
    O: { P: 1, Q: 1, R: 1, S: 1 },
    P: { Q: 1, R: 1, S: 1 },
    Q: { R: 1, S: 1 },
    R: { S: 1 },
    S: {}
};

// Symmetric lookup
function segregationDistance(catA, catB) {
    if (!catA || !catB || catA === catB) return 1;
    const pair = SEG_MATRIX[catA] && SEG_MATRIX[catA][catB];
    if (pair !== undefined) return pair;
    const pair2 = SEG_MATRIX[catB] && SEG_MATRIX[catB][catA];
    if (pair2 !== undefined) return pair2;
    return 1; // default: adjacent permitted when unknown (conservative for planning)
}

// Tank adjacency index (1..5 along the ship, plus slop = 0). Used for distance check.
function tankOrderIndex(tankId) {
    if (!tankId) return 0;
    const m = tankId.match(/COT(\d)/);
    if (m) return parseInt(m[1], 10);
    if (tankId.startsWith('SLOP')) return 0;
    return 0;
}

// ===== Lookups =====
function getCargoReg(cargoName) {
    if (typeof IBC_CARGO_REG === 'undefined') return null;
    return IBC_CARGO_REG[cargoName] || null;
}

function getCargoCategory(cargoName) {
    const reg = getCargoReg(cargoName);
    return reg ? reg.cat : null;
}

/**
 * Main compliance check. Returns { warnings: [...], badge: {...} }.
 * Safe: never throws, always returns a structure the UI can render.
 */
function checkChemicalCompliance() {
    const warnings = [];
    let hardFail = false;

    if (typeof cargoes === 'undefined' || !Array.isArray(cargoes) || cargoes.length === 0) {
        return { warnings, hardFail: false, perCargo: {} };
    }

    const perCargo = {};

    // Tank -> assigned cargo category map (from current stowage)
    const tankCargoCat = {};
    if (typeof tanks !== 'undefined' && Array.isArray(tanks)) {
        tanks.forEach(t => {
            if (t.assignedCargo) {
                const cat = getCargoCategory(t.assignedCargo.name);
                tankCargoCat[t.id] = { cat, cargo: t.assignedCargo };
            }
        });
    }

    // 1. Per-cargo tank suitability + temperature
    cargoes.forEach(c => {
        const reg = getCargoReg(c.name);
        const pc = { issues: [], temp: null };
        if (!reg) {
            pc.issues.push({ level: 'info', msg: `No IBC regulatory data — using default compatibility rules` });
            perCargo[c.id] = pc;
            return;
        }
        perCargo[c.id] = pc;

        // SG limit — per stability booklet: tanks fill to MAX_FILL_PERCENTAGE at the
        // permissible SG (MAX_SG_CARGO_TANKS = 1.54). Heavier cargo is PERMITTED but the
        // fill % is interpolated down so the tank mass stays within limit:
        //   allowedFill% = 98 * 1.54 / cargoSG   (subject to master's approval).
        // This is an advisory, not a hard fail.
        const sgLimit = (reg.sgLimit !== undefined) ? reg.sgLimit : (typeof MAX_SG_CARGO_TANKS !== 'undefined' ? MAX_SG_CARGO_TANKS : 1.54);
        if (c.sg && c.sg > sgLimit + 1e-6) {
            const allowedPct = (typeof getAllowedFillPct === 'function') ? getAllowedFillPct(c.sg) : (98 * sgLimit / c.sg);
            pc.issues.push({ level: 'warn', msg: `SG ${c.sg} > ${sgLimit}: fill limited to ${allowedPct.toFixed(1)}% (98×${sgLimit}/${c.sg}) — master's approval` });
        }

        // Coating suitability: cargo's required coating rank must be <= tank coating rank.
        // M/T ADA tanks are MARINELINE (rank 3) so acids/caustics/chlorinated are OK;
        // a cargo requiring SS (rank 4) would only be blocked in a lesser-lined tank.
        if (typeof COATING_RANK !== 'undefined' && typeof TANKS !== 'undefined') {
            const reqRank = COATING_RANK[reg.reqCoating] || 1;
            const tankCoating = (typeof TANKS !== 'undefined' && TANKS[0]) ? TANKS[0].coating : 'MARINELINE';
            const tankRank = COATING_RANK[tankCoating] || 3;
            if (reqRank > tankRank) {
                pc.issues.push({ level: 'danger', msg: `Requires ${reg.reqCoating} coating; tank is ${tankCoating} — not suitable` });
                hardFail = true;
            }
        }

        // Marine-line service temperature ceiling for heated/solidifying cargoes
        if (reg.needsHeating && reg.maxTemp != null && typeof MARINELINE_MAX_TEMP !== 'undefined') {
            if (reg.maxTemp > MARINELINE_MAX_TEMP) {
                pc.issues.push({ level: 'warn', msg: `Carriage temp up to ${reg.maxTemp}°C approaches/exceeds marine-line limit (${MARINELINE_MAX_TEMP}°C) — verify lining grade` });
            }
        }

        // Heating requirement
        if (reg.needsHeating) {
            pc.temp = { min: reg.minTemp, max: reg.maxTemp };
            pc.issues.push({ level: 'warn', msg: `Requires heating (keep ${reg.minTemp != null ? '≥' + reg.minTemp + '°C' : ''}${reg.maxTemp != null ? ' ≤' + reg.maxTemp + '°C' : ''}); load only in heated tanks` });
        } else if (reg.minTemp != null || reg.maxTemp != null) {
            pc.temp = { min: reg.minTemp, max: reg.maxTemp };
        }
    });

    // 2. Segregation between assigned cargoes (tank adjacency)
    const assignedTanks = Object.keys(tankCargoCat);
    for (let i = 0; i < assignedTanks.length; i++) {
        for (let j = i + 1; j < assignedTanks.length; j++) {
            const a = tankCargoCat[assignedTanks[i]];
            const b = tankCargoCat[assignedTanks[j]];
            if (!a.cat || !b.cat) continue;
            const req = segregationDistance(a.cat, b.cat);
            if (req <= 1) continue;
            const idxA = tankOrderIndex(assignedTanks[i]);
            const idxB = tankOrderIndex(assignedTanks[j]);
            // actualDist: 0 = same transverse pair (P/S of one frame),
            //             1 = adjacent frame pair, 2 = one pair between, etc.
            const actualDist = Math.abs(idxA - idxB);
            // Required separation `req` means at least (req-1) empty tank positions
            // between the two cargoes. So violation when actualDist < req.
            const minGap = req - 1;
            if (actualDist < req) {
                warnings.push({
                    level: 'danger',
                    cat: `${a.cat}/${b.cat}`,
                    msg: `Segregation: ${a.cargo.name} (${a.cat}) ↔ ${b.cargo.name} (${b.cat}) require separation ${req} (≥${minGap} tank${minGap === 1 ? '' : 's'} between); currently ${actualDist === 0 ? 'same pair (P/S)' : actualDist + ' apart'}.`
                });
                hardFail = true;
            }
        }
    }

    // 3. Forbidden adjacency pairs (special sequencing rules, e.g. Styrene vs Wax)
    for (let i = 0; i < assignedTanks.length; i++) {
        for (let j = i + 1; j < assignedTanks.length; j++) {
            const a = tankCargoCat[assignedTanks[i]];
            const b = tankCargoCat[assignedTanks[j]];
            if (!a.cargo || !b.cargo) continue;
            const key = forbiddenAdjacentKey(a.cargo.name, b.cargo.name);
            const reason = FORBIDDEN_ADJACENT_MAP[key];
            if (!reason) continue;
            const idxA = tankOrderIndex(assignedTanks[i]);
            const idxB = tankOrderIndex(assignedTanks[j]);
            const actualDist = Math.abs(idxA - idxB);
            // Forbidden pair: must be separated by at least one empty tank pair (dist >= 2).
            // Same transverse pair (dist 0) or next frame (dist 1) = violation.
            if (actualDist < 2) {
                warnings.push({
                    level: 'danger',
                    cat: 'SEQ',
                    msg: `Adjacency prohibited: ${a.cargo.name} ↔ ${b.cargo.name} (${actualDist === 0 ? 'same pair P/S' : actualDist + ' apart'}). ${reason}.`
                });
                hardFail = true;
            }
        }
    }

    // 4. Category summary for badge
    const cats = cargoes.map(c => getCargoCategory(c.name)).filter(Boolean);
    const catSummary = cats.length ? Array.from(new Set(cats)).sort().join('·') : '—';

    return { warnings, hardFail, perCargo, catSummary };
}

// Expose globally for inline handlers / other modules
if (typeof window !== 'undefined') {
    window.checkChemicalCompliance = checkChemicalCompliance;
    window.getCargoCategory = getCargoCategory;
    window.getCargoReg = getCargoReg;
    window.segregationDistance = segregationDistance;
}
