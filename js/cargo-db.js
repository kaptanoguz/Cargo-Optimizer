/**
 * cargo-db.js — product & port reference data.
 *
 * Product fields
 *   n     name                       a    aliases / trade abbreviations (search only)
 *   sg    density @ ref temp (t/m³)  ref  reference temperature °C (15 petroleum/veg, 20 chemicals)
 *   g     'C' chemical · 'P' petroleum (MARPOL Annex I) · 'V' vegetable oil / fat / wax
 *   rg    USCG 46 CFR 150 reactive group (null = not grouped)
 *   pc    MARPOL Annex II pollution category X/Y/Z/OS, 'I' = Annex I oil
 *   st    IBC ship type (2/3), 0 = not an IBC product
 *   beta  cubic expansion coefficient 1/°C (chemicals/veg). Petroleum uses ASTM 54B,
 *   vcfTable '54D' for lubricating / base oils (ASTM Table 54D).
 *   heat  [min, max] carriage temperature °C for heated / solidifying products
 *   maxT  heat-sensitive upper limit °C (must not be adjacent to warmer heated cargo)
 *   minT  lower limit °C (melting / crystallising point margin)
 *   un    UN number                  f    flags: F flammable, T toxic, C corrosive,
 *                                          I inhibited/polymerising, S solidifying
 *
 * Regulatory columns are planning aids. Verify against the current IBC Code Ch.17/18,
 * MEPC.2/Circ., the ship's Certificate of Fitness and the shipper's cargo information.
 */
(function (global) {
    'use strict';

    const P = (n, sg, extra) => Object.assign({ n, sg, ref: 15, g: 'P', rg: 33, pc: 'I', st: 0, beta: null, f: 'F' }, extra);
    const C = (n, sg, extra) => Object.assign({ n, sg, ref: 20, g: 'C', f: '' }, extra);
    const V = (n, sg, extra) => Object.assign({ n, sg, ref: 15, g: 'V', rg: 34, pc: 'Y', st: 2, beta: 0.00070, f: 'S' }, extra);

    const CARGO_DB = [
        // ── Aromatics ─────────────────────────────────────────────────────
        C('Benzene', 0.879, { a: ['BZ'], rg: 32, pc: 'Y', st: 3, beta: 0.00124, minT: 7, un: '1114', f: 'FT' }),
        C('Toluene', 0.867, { a: ['TOL', 'methylbenzene'], rg: 32, pc: 'Y', st: 3, beta: 0.00108, un: '1294', f: 'F' }),
        C('Xylene (Mixed)', 0.864, { a: ['MX', 'xylenes'], rg: 32, pc: 'Y', st: 2, beta: 0.00099, un: '1307', f: 'F' }),
        C('Paraxylene', 0.861, { a: ['PX', 'p-xylene'], rg: 32, pc: 'Y', st: 2, beta: 0.00101, minT: 16, un: '1307', f: 'F' }),
        C('Orthoxylene', 0.880, { a: ['OX', 'o-xylene'], rg: 32, pc: 'Y', st: 2, beta: 0.00094, un: '1307', f: 'F' }),
        C('Cumene', 0.862, { a: ['isopropylbenzene'], rg: 32, pc: 'Y', st: 2, beta: 0.00096, un: '1918', f: 'F' }),
        C('Styrene Monomer', 0.906, { a: ['SM', 'vinylbenzene'], rg: 30, pc: 'Y', st: 3, beta: 0.00098, maxT: 30, un: '2055', f: 'FI' }),
        // ── Alcohols & glycols ────────────────────────────────────────────
        C('Methanol', 0.791, { a: ['MeOH', 'methyl alcohol'], rg: 20, pc: 'Y', st: 3, beta: 0.00119, un: '1230', f: 'FT' }),
        C('Ethanol', 0.789, { a: ['EtOH', 'ethyl alcohol'], rg: 20, pc: 'Z', st: 3, beta: 0.00110, un: '1170', f: 'F' }),
        C('Isopropanol (IPA)', 0.786, { a: ['IPA', 'isopropyl alcohol'], rg: 20, pc: 'Z', st: 3, beta: 0.00107, un: '1219', f: 'F' }),
        C('n-Butanol', 0.810, { a: ['NBA', 'butyl alcohol'], rg: 20, pc: 'Y', st: 3, beta: 0.00094, un: '1120', f: 'F' }),
        C('2-Ethylhexanol', 0.833, { a: ['2EH', 'octanol'], rg: 20, pc: 'Y', st: 2, beta: 0.00083, un: '' }),
        C('Isooctanol', 0.834, { a: ['octanol'], rg: 20, pc: 'Y', st: 2, beta: 0.00083, un: '' }),
        C('Monoethylene Glycol (MEG)', 1.113, { a: ['MEG', 'ethylene glycol'], rg: 20, pc: 'Y', st: 3, beta: 0.00062, un: '' }),
        C('Diethylene Glycol (DEG)', 1.118, { a: ['DEG'], rg: 40, pc: 'Z', st: 3, beta: 0.00064, un: '' }),
        C('Triethylene Glycol (TEG)', 1.125, { a: ['TEG'], rg: 40, pc: 'Z', st: 3, beta: 0.00070, un: '' }),
        C('Monopropylene Glycol (MPG)', 1.036, { a: ['MPG', 'propylene glycol'], rg: 20, pc: 'Z', st: 3, beta: 0.00072, un: '' }),
        C('Glycerine', 1.261, { a: ['glycerol'], rg: 20, pc: 'Z', st: 3, beta: 0.00050, un: '' }),
        // ── Ketones / esters / ethers / aldehydes ─────────────────────────
        C('Acetone', 0.790, { a: ['DMK', 'propanone'], rg: 18, pc: 'Z', st: 3, beta: 0.00146, un: '1090', f: 'F' }),
        C('MEK (Methyl Ethyl Ketone)', 0.805, { a: ['MEK', 'butanone'], rg: 18, pc: 'Z', st: 3, beta: 0.00131, un: '1193', f: 'F' }),
        C('MIBK', 0.801, { a: ['methyl isobutyl ketone'], rg: 18, pc: 'Y', st: 3, beta: 0.00117, un: '1245', f: 'F' }),
        C('Cyclohexanone', 0.948, { a: ['anone'], rg: 18, pc: 'Y', st: 3, beta: 0.00093, un: '1915', f: 'F' }),
        C('Ethyl Acetate', 0.902, { a: ['ETAC', 'EA'], rg: 34, pc: 'Z', st: 3, beta: 0.00138, un: '1173', f: 'F' }),
        C('n-Butyl Acetate', 0.882, { a: ['BUAC', 'NBAC'], rg: 34, pc: 'Y', st: 3, beta: 0.00117, un: '1123', f: 'F' }),
        C('Vinyl Acetate Monomer (VAM)', 0.932, { a: ['VAM'], rg: 13, pc: 'Y', st: 3, beta: 0.00137, maxT: 30, un: '1301', f: 'FI' }),
        C('MTBE', 0.741, { a: ['methyl tert-butyl ether'], rg: 41, pc: 'Z', st: 3, beta: 0.00140, un: '2398', f: 'F' }),
        C('ETBE', 0.742, { a: ['ethyl tert-butyl ether'], rg: 41, pc: 'Y', st: 3, beta: 0.00140, un: '1179', f: 'F' }),
        C('Furfural', 1.160, { a: ['furfuraldehyde'], rg: 19, pc: 'Y', st: 3, beta: 0.00089, un: '1199', f: 'FT' }),
        C('Formaldehyde Solution (37%)', 1.090, { a: ['formalin'], rg: 19, pc: 'Y', st: 3, beta: 0.00050, minT: 15, un: '2209', f: 'TC' }),
        C('DMF (Dimethylformamide)', 0.944, { a: ['DMF'], rg: 10, pc: 'Y', st: 3, beta: 0.00100, un: '2265', f: 'T' }),
        // ── Chlorinated ───────────────────────────────────────────────────
        C('Ethylene Dichloride (EDC)', 1.253, { a: ['EDC', '1,2-dichloroethane'], rg: 36, pc: 'Y', st: 2, beta: 0.00117, un: '1184', f: 'FT' }),
        C('Methylene Chloride (DCM)', 1.326, { a: ['DCM', 'dichloromethane'], rg: 36, pc: 'Y', st: 3, beta: 0.00137, maxT: 35, un: '1593', f: 'T' }),
        C('Carbon Tetrachloride', 1.594, { a: ['CTC'], rg: 36, pc: 'Y', st: 2, beta: 0.00122, un: '1846', f: 'T' }),
        C('Perchloroethylene', 1.622, { a: ['PCE', 'tetrachloroethylene', 'perc'], rg: 36, pc: 'Y', st: 2, beta: 0.00102, un: '1897', f: 'T' }),
        C('Epichlorohydrin', 1.181, { a: ['ECH'], rg: 17, pc: 'Y', st: 2, beta: 0.00100, un: '2023', f: 'FTI' }),
        // ── Nitriles / olefins / paraffins ────────────────────────────────
        C('Acrylonitrile', 0.806, { a: ['ACN', 'AN'], rg: 15, pc: 'Y', st: 2, beta: 0.00141, maxT: 30, un: '1093', f: 'FTI' }),
        C('Nonene', 0.730, { a: ['propylene trimer'], rg: 30, pc: 'Y', st: 2, beta: 0.00110, un: '', f: 'F' }),
        C('Cyclohexane', 0.779, { a: ['CHX'], rg: 31, pc: 'Y', st: 2, beta: 0.00122, minT: 9, un: '1145', f: 'F' }),
        // ── Inorganic acids & caustics ────────────────────────────────────
        C('Sulphuric Acid (98%)', 1.840, { a: ['sulfuric', 'H2SO4', 'oleum'], rg: 2, pc: 'Y', st: 3, beta: 0.00057, un: '1830', f: 'C' }),
        C('Phosphoric Acid (75%)', 1.580, { a: ['H3PO4'], rg: 1, pc: 'Z', st: 3, beta: 0.00050, un: '1805', f: 'C' }),
        C('Hydrochloric Acid (32%)', 1.160, { a: ['HCl', 'muriatic'], rg: 1, pc: 'Z', st: 3, beta: 0.00045, un: '1789', f: 'C' }),
        C('Nitric Acid (56%)', 1.350, { a: ['HNO3'], rg: 3, pc: 'Y', st: 2, beta: 0.00110, un: '2031', f: 'C' }),
        C('Caustic Soda (50%)', 1.526, { a: ['NaOH', 'sodium hydroxide', 'CSS'], rg: 5, pc: 'Y', st: 3, beta: 0.00045, minT: 18, heat: [20, 30], un: '1824', f: 'C' }),
        C('Caustic Soda (32%)', 1.349, { a: ['NaOH', 'sodium hydroxide'], rg: 5, pc: 'Y', st: 3, beta: 0.00050, minT: 5, un: '1824', f: 'C' }),
        C('Caustic Potash (48%)', 1.500, { a: ['KOH', 'potassium hydroxide'], rg: 5, pc: 'Y', st: 3, beta: 0.00045, un: '1814', f: 'C' }),
        C('Sodium Hypochlorite (15%)', 1.210, { a: ['bleach', 'NaOCl'], rg: 5, pc: 'Y', st: 2, beta: 0.00040, maxT: 30, un: '1791', f: 'C' }),
        C('Acetic Acid (Glacial)', 1.049, { a: ['AcOH', 'ethanoic'], rg: 4, pc: 'Z', st: 3, beta: 0.00107, minT: 20, heat: [20, 35], un: '2789', f: 'FC' }),
        C('Phenol (Molten)', 1.071, { a: ['carbolic acid'], rg: 21, pc: 'Y', st: 2, beta: 0.00085, heat: [55, 65], un: '2312', f: 'TCS' }),
        // ── Plasticisers / misc ───────────────────────────────────────────
        C('DOP (Dioctyl Phthalate)', 0.986, { a: ['DEHP', 'DOP'], rg: 34, pc: 'X', st: 2, beta: 0.00074, un: '' }),
        C('DINP', 0.975, { a: ['diisononyl phthalate'], rg: 34, pc: 'Y', st: 2, beta: 0.00072, un: '' }),
        C('Latex (Natural)', 0.980, { a: ['rubber latex'], rg: 43, pc: 'Z', st: 3, beta: 0.00040, minT: 10, maxT: 35, un: '' }),
        C('UAN Solution (32%)', 1.320, { a: ['urea ammonium nitrate', 'UAN'], rg: 43, pc: 'Z', st: 3, beta: 0.00040, minT: 0, un: '' }),
        C('Molasses', 1.400, { a: ['cane molasses', 'beet molasses'], rg: 43, pc: 'OS', st: 0, beta: 0.00045, heat: [30, 45], un: '' }),
        C('Water', 1.000, { a: ['fresh water', 'FW'], rg: null, pc: 'OS', st: 0, beta: 0.00021, un: '' }),

        // ── Petroleum (MARPOL Annex I, SG @ 15 °C, ASTM 54B) ──────────────
        P('Gasoline (ULG 95)', 0.740, { a: ['ULG', 'mogas', 'petrol'], un: '1203' }),
        P('Gasoline (ULG 98)', 0.755, { a: ['ULG', 'mogas', 'petrol'], un: '1203' }),
        P('Naphtha (Light)', 0.700, { a: ['LVN'], un: '1268' }),
        P('Naphtha (Full Range)', 0.730, { a: ['FRN'], un: '1268' }),
        P('Naphtha (Heavy)', 0.760, { a: ['HVN'], un: '1268' }),
        P('Jet A-1', 0.800, { a: ['jet fuel', 'ATK', 'kerosene'], un: '1863' }),
        P('Kerosene', 0.810, { a: ['kero'], un: '1223' }),
        P('Diesel (EN590)', 0.835, { a: ['ULSD', 'gasoil', 'AGO'], un: '1202' }),
        P('Diesel (ULSD)', 0.845, { a: ['gasoil'], un: '1202' }),
        P('Gasoil (0.1% S)', 0.845, { a: ['LSGO', 'MGO'], un: '1202' }),
        P('MGO (Marine Gasoil)', 0.855, { a: ['DMA'], un: '1202' }),
        P('Base Oil (SN150)', 0.870, { a: ['lube base', 'base oil'], vcfTable: '54D', f: '', un: '' }),
        P('Base Oil (SN500)', 0.890, { a: ['lube base', 'base oil'], vcfTable: '54D', f: '', un: '' }),
        P('Base Oil (Bright Stock)', 0.900, { a: ['BS150', 'base oil'], vcfTable: '54D', f: '', un: '' }),
        P('Lube Oil', 0.885, { a: ['lubricating oil', 'luboil', 'LO'], vcfTable: '54D', f: '', un: '' }),
        P('VLSFO', 0.960, { a: ['0.5% fuel oil'], f: 'S', heat: [40, 50], un: '3082' }),
        P('Fuel Oil (180 cSt)', 0.980, { a: ['IFO180', 'HFO'], f: 'S', heat: [45, 55], un: '3082' }),
        P('Fuel Oil (380 cSt)', 0.991, { a: ['IFO380', 'HFO'], f: 'S', heat: [50, 60], un: '3082' }),
        P('FAME (Biodiesel)', 0.880, { a: ['B100', 'RME', 'biodiesel'], rg: 34, pc: 'Y', st: 2, beta: 0.00080, f: '', minT: 10, un: '' }),

        // ── Vegetable oils, fats & waxes (FOSFA practice, SG @ 15 °C) ─────
        V('Crude Palm Oil (CPO)', 0.890, { a: ['CPO', 'palm'], heat: [32, 40] }),
        V('Palm Oil (RBD)', 0.890, { a: ['RBDPO', 'palm'], heat: [32, 40] }),
        V('Palm Olein (RBD)', 0.900, { a: ['RBDPOL', 'palm'], heat: [25, 30] }),
        V('Palm Stearin (RBD)', 0.881, { a: ['RBDPS', 'palm'], heat: [40, 45] }),
        V('Palm Kernel Oil', 0.910, { a: ['PKO'], heat: [30, 39] }),
        V('Coconut Oil', 0.925, { a: ['CNO'], heat: [27, 32] }),
        V('Sunflower Oil', 0.920, { a: ['SFO'], f: '' }),
        V('Soybean Oil', 0.922, { a: ['SBO', 'soya'], f: '' }),
        V('Rapeseed Oil', 0.915, { a: ['canola', 'RSO'], f: '' }),
        V('Fish Oil', 0.930, { a: [], heat: [20, 25], f: '' }),
        V('Tall Oil (Crude)', 0.960, { a: ['CTO'], heat: [30, 50] }),
        V('UCO (Used Cooking Oil)', 0.920, { a: ['UCO'], heat: [20, 35] }),
        V('Fatty Acid (C16–18)', 0.860, { a: ['PFAD', 'distilled fatty acid'], rg: 4, heat: [55, 70] }),
        V('Oleic Acid', 0.895, { a: [], rg: 4, f: '' }),
        V('Stearic Acid', 0.847, { a: [], rg: 4, heat: [65, 80] }),
        V('Paraffin Wax', 0.930, { a: ['FRP wax', 'wax'], rg: 31, heat: [65, 75] }),
        V('Slack Wax', 0.910, { a: ['wax'], rg: 31, heat: [55, 70] }),
        V('Micro Wax', 0.930, { a: ['microcrystalline wax', 'wax'], rg: 31, heat: [75, 85] })
    ];

    // Convenience lookups
    const CARGO_BY_NAME = {};
    CARGO_DB.forEach(c => { c.a = c.a || []; c.f = c.f || ''; CARGO_BY_NAME[c.n.toLowerCase()] = c; });

    const GROUP_LABEL = { C: 'Chemical', P: 'Petroleum', V: 'Veg oil / fat' };

    // USCG 46 CFR 150 reactive group names (subset used here)
    const REACTIVE_GROUPS = {
        1: 'Non-oxidizing mineral acids', 2: 'Sulphuric acid', 3: 'Nitric acid', 4: 'Organic acids',
        5: 'Caustics', 6: 'Ammonia', 7: 'Aliphatic amines', 8: 'Alkanolamines', 9: 'Aromatic amines',
        10: 'Amides', 11: 'Organic anhydrides', 12: 'Isocyanates', 13: 'Vinyl acetate', 14: 'Acrylates',
        15: 'Substituted allyls', 16: 'Alkylene oxides', 17: 'Epichlorohydrin', 18: 'Ketones',
        19: 'Aldehydes', 20: 'Alcohols, glycols', 21: 'Phenols, cresols', 22: 'Caprolactam solution',
        30: 'Olefins', 31: 'Paraffins', 32: 'Aromatic hydrocarbons', 33: 'Misc. hydrocarbon mixtures',
        34: 'Esters', 35: 'Vinyl halides', 36: 'Halogenated hydrocarbons', 37: 'Nitriles',
        38: 'Carbon disulphide', 39: 'Sulfolane', 40: 'Glycol ethers', 41: 'Ethers',
        42: 'Nitrocompounds', 43: 'Misc. water solutions'
    };

    // ── Ports (region-grouped; Turkish ports expanded for the vessel's trade) ──
    const PORT_REGIONS = {
        'Türkiye': ['Aliağa', 'İzmir', 'Dilovası', 'Körfez (Tüpraş)', 'Yarımca', 'Derince', 'İzmit', 'Gebze', 'Tuzla',
            'Ambarlı', 'Haydarpaşa', 'Marmara Ereğlisi', 'Tekirdağ', 'Gemlik', 'Bandırma', 'Yalova', 'Mersin',
            'Mersin (ATAŞ)', 'İskenderun', 'Dörtyol', 'Ceyhan (BTC)', 'Yumurtalık', 'Antalya', 'Samsun', 'Trabzon',
            'Zonguldak', 'Nemrut Bay', 'Çanakkale', 'Karabiga', 'Hopa'],
        'Black Sea': ['Constanta', 'Midia', 'Burgas', 'Varna', 'Odesa', 'Pivdennyi (Yuzhny)', 'Mykolaiv', 'Izmail',
            'Batumi', 'Poti', 'Kulevi', 'Supsa', 'Novorossiysk', 'Tuapse', 'Taman', 'Kavkaz'],
        'Mediterranean': ['Piraeus', 'Elefsis', 'Agioi Theodoroi', 'Thessaloniki', 'Augusta', 'Priolo', 'Milazzo', 'Sarroch',
            'Genoa', 'Ravenna', 'Venice (Porto Marghera)', 'Trieste', 'Brindisi', 'Livorno', 'Naples', 'Porto Torres',
            'Marseille', 'Lavera', 'Fos-sur-Mer', 'Port-de-Bouc', 'Sète', 'Barcelona', 'Tarragona', 'Castellón',
            'Valencia', 'Cartagena (ES)', 'Algeciras', 'Huelva', 'Malta', 'Koper', 'Rijeka', 'Bar', 'Durrës',
            'Limassol', 'Vasilikos', 'Haifa', 'Ashdod', 'Beirut', 'Tripoli (LB)', 'Latakia', 'Baniyas'],
        'North Africa / Red Sea': ['Alexandria', 'El Dekheila', 'Damietta', 'Port Said', 'Suez', 'Ain Sukhna', 'Skikda',
            'Arzew', 'Algiers', 'Bejaia', 'Annaba', 'Tunis (Radès)', 'Bizerte', 'Gabès', 'Skhira', 'Tripoli (LY)',
            'Misurata', 'Ras Lanuf', 'Zawia', 'Casablanca', 'Mohammedia', 'Jorf Lasfar', 'Tangier Med', 'Safi',
            'Port Sudan', 'Djibouti', 'Jeddah', 'Yanbu', 'Aqaba'],
        'NW Europe': ['Rotterdam', 'Amsterdam', 'Moerdijk', 'Vlissingen', 'Terneuzen', 'Antwerp', 'Ghent', 'Zeebrugge',
            'Hamburg', 'Brunsbüttel', 'Stade', 'Bremen', 'Wilhelmshaven', 'Le Havre', 'Rouen', 'Dunkirk', 'Donges',
            'Immingham', 'Hull', 'Teesport', 'Grangemouth', 'Milford Haven', 'Fawley', 'Thames', 'Runcorn',
            'Liverpool', 'Bilbao', 'Sines', 'Lisbon', 'Leixões'],
        'Baltic / Scandinavia': ['Gothenburg', 'Stenungsund', 'Brofjorden', 'Malmö', 'Stockholm', 'Porvoo', 'Kotka',
            'Hamina', 'Naantali', 'Tallinn (Muuga)', 'Riga', 'Ventspils', 'Klaipėda', 'Gdańsk', 'Gdynia', 'Szczecin',
            'Police', 'Rostock', 'Kalundborg', 'Fredericia', 'Mongstad', 'Rafnes', 'Porsgrunn', 'St Petersburg',
            'Primorsk', 'Ust-Luga'],
        'Middle East / Gulf': ['Jubail', 'Ras Tanura', 'Dammam', 'Ruwais', 'Jebel Ali', 'Fujairah', 'Hamriyah',
            'Sohar', 'Muscat', 'Duqm', 'Shuaiba', 'Mina Al Ahmadi', 'Sitra', 'Mesaieed', 'Bandar Abbas', 'Basrah'],
        'Indian Subcontinent': ['Kandla', 'Mundra', 'Hazira', 'Dahej', 'Mumbai (JNPT)', 'Mangalore', 'Kochi',
            'Chennai', 'Ennore', 'Visakhapatnam', 'Haldia', 'Paradip', 'Karachi', 'Port Qasim', 'Colombo', 'Chittagong'],
        'Asia': ['Singapore', 'Port Klang', 'Pasir Gudang', 'Tanjung Pelepas', 'Kuantan', 'Map Ta Phut', 'Sriracha',
            'Jakarta', 'Merak', 'Dumai', 'Belawan', 'Batangas', 'Ulsan', 'Yeosu', 'Daesan', 'Busan', 'Kaohsiung',
            'Mailiao', 'Ningbo', 'Shanghai', 'Zhangjiagang', 'Nanjing', 'Tianjin', 'Dalian', 'Huizhou', 'Zhuhai',
            'Chiba', 'Kawasaki', 'Yokohama', 'Mizushima'],
        'Africa (W/E/S)': ['Lagos (Apapa)', 'Lomé', 'Cotonou', 'Tema', 'Takoradi', 'Abidjan', 'Dakar', 'Douala',
            'Pointe-Noire', 'Luanda', 'Durban', 'Richards Bay', 'Cape Town', 'Mombasa', 'Dar es Salaam', 'Maputo'],
        'Americas': ['Houston', 'Texas City', 'Freeport (TX)', 'Corpus Christi', 'Beaumont', 'Port Arthur',
            'Lake Charles', 'Baton Rouge', 'New Orleans', 'Philadelphia', 'New York', 'Santos', 'Paranaguá',
            'Rio Grande', 'Campana', 'San Lorenzo', 'Montevideo', 'Cartagena (CO)', 'Altamira', 'Coatzacoalcos',
            'Point Lisas', 'Curaçao']
    };

    const PORT_DB = [];
    Object.entries(PORT_REGIONS).forEach(([region, list]) => list.forEach(name => PORT_DB.push({ name, region })));

    global.CARGO_DB = CARGO_DB;
    global.CARGO_BY_NAME = CARGO_BY_NAME;
    global.GROUP_LABEL = GROUP_LABEL;
    global.REACTIVE_GROUPS = REACTIVE_GROUPS;
    global.PORT_DB = PORT_DB;
})(typeof window !== 'undefined' ? window : globalThis);
