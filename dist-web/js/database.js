/**
 * Chemical Cargo & Port Database
 * Autocomplete data for CargoOptimizer
 * 
 * SG Reference Temperatures:
 *   - Petroleum products: SG @ 15°C (ASTM / IP standards)
 *   - Chemical products:  SG @ 20°C (industry convention)
 * 
 * type: 'P' = Petroleum, 'C' = Chemical, 'V' = Vegetable Oil/Fat
 * sgTemp: reference temperature in °C (15 or 20)
 */

const CARGO_DB = [
    // === CHEMICALS (SG @ 20°C) ===
    { name: "Benzene", sg: 0.879, type: 'C', sgTemp: 20 },
    { name: "Toluene", sg: 0.867, type: 'C', sgTemp: 20 },
    { name: "Xylene (Mixed)", sg: 0.860, type: 'C', sgTemp: 20 },
    { name: "Styrene Monomer", sg: 0.906, type: 'C', sgTemp: 20 },
    { name: "Methanol", sg: 0.791, type: 'C', sgTemp: 20 },
    { name: "Ethanol", sg: 0.789, type: 'C', sgTemp: 20 },
    { name: "Isopropanol (IPA)", sg: 0.786, type: 'C', sgTemp: 20 },
    { name: "Butanol (n-Butanol)", sg: 0.810, type: 'C', sgTemp: 20 },
    { name: "Acetone", sg: 0.790, type: 'C', sgTemp: 20 },
    { name: "MEK (Methyl Ethyl Ketone)", sg: 0.805, type: 'C', sgTemp: 20 },
    { name: "MIBK", sg: 0.801, type: 'C', sgTemp: 20 },
    { name: "Cyclohexanone", sg: 0.948, type: 'C', sgTemp: 20 },
    { name: "Ethyl Acetate", sg: 0.902, type: 'C', sgTemp: 20 },
    { name: "Butyl Acetate", sg: 0.882, type: 'C', sgTemp: 20 },
    { name: "Acetic Acid (Glacial)", sg: 1.049, type: 'C', sgTemp: 20 },
    { name: "Phosphoric Acid (75%)", sg: 1.580, type: 'C', sgTemp: 20 },
    { name: "Sulfuric Acid (98%)", sg: 1.840, type: 'C', sgTemp: 20 },
    { name: "Hydrochloric Acid (32%)", sg: 1.160, type: 'C', sgTemp: 20 },
    { name: "Nitric Acid (56%)", sg: 1.350, type: 'C', sgTemp: 20 },
    { name: "Caustic Soda (50%)", sg: 1.526, type: 'C', sgTemp: 20 },
    { name: "Caustic Soda (32%)", sg: 1.349, type: 'C', sgTemp: 20 },
    { name: "Sodium Hypochlorite (15%)", sg: 1.210, type: 'C', sgTemp: 20 },
    { name: "Phenol (Molten)", sg: 1.071, type: 'C', sgTemp: 20 },
    { name: "Monoethylene Glycol (MEG)", sg: 1.113, type: 'C', sgTemp: 20 },
    { name: "Diethylene Glycol (DEG)", sg: 1.118, type: 'C', sgTemp: 20 },
    { name: "Triethylene Glycol (TEG)", sg: 1.125, type: 'C', sgTemp: 20 },
    { name: "Propylene Glycol", sg: 1.036, type: 'C', sgTemp: 20 },
    { name: "Glycerine", sg: 1.261, type: 'C', sgTemp: 20 },
    { name: "Ethylene Dichloride (EDC)", sg: 1.253, type: 'C', sgTemp: 20 },
    { name: "Methylene Chloride (DCM)", sg: 1.326, type: 'C', sgTemp: 20 },
    { name: "Carbon Tetrachloride", sg: 1.594, type: 'C', sgTemp: 20 },
    { name: "Perchloroethylene", sg: 1.622, type: 'C', sgTemp: 20 },
    { name: "Acrylonitrile", sg: 0.806, type: 'C', sgTemp: 20 },
    { name: "Vinyl Acetate Monomer (VAM)", sg: 0.932, type: 'C', sgTemp: 20 },
    { name: "Epichlorohydrin", sg: 1.181, type: 'C', sgTemp: 20 },
    { name: "Furfural", sg: 1.160, type: 'C', sgTemp: 20 },
    { name: "DMF (Dimethylformamide)", sg: 0.944, type: 'C', sgTemp: 20 },
    { name: "Formaldehyde (37%)", sg: 1.090, type: 'C', sgTemp: 20 },
    { name: "Paraxylene", sg: 0.861, type: 'C', sgTemp: 20 },
    { name: "Orthoxylene", sg: 0.880, type: 'C', sgTemp: 20 },
    { name: "Cyclohexane", sg: 0.779, type: 'C', sgTemp: 20 },
    { name: "Cumene", sg: 0.862, type: 'C', sgTemp: 20 },
    { name: "Nonene", sg: 0.730, type: 'C', sgTemp: 20 },
    { name: "IsoOctanol", sg: 0.834, type: 'C', sgTemp: 20 },
    { name: "2-Ethylhexanol", sg: 0.833, type: 'C', sgTemp: 20 },
    { name: "DOP (Dioctyl Phthalate)", sg: 0.986, type: 'C', sgTemp: 20 },
    { name: "DINP", sg: 0.975, type: 'C', sgTemp: 20 },
    { name: "Latex (Natural)", sg: 0.980, type: 'C', sgTemp: 20 },
    { name: "Urea Ammonium Nitrate (UAN 32%)", sg: 1.320, type: 'C', sgTemp: 20 },

    // === PETROLEUM PRODUCTS (SG @ 15°C) ===
    { name: "MTBE", sg: 0.741, type: 'P', sgTemp: 15 },
    { name: "ETBE", sg: 0.742, type: 'P', sgTemp: 15 },
    { name: "FAME (Biodiesel)", sg: 0.880, type: 'P', sgTemp: 15 },
    { name: "Diesel (ULSD)", sg: 0.845, type: 'P', sgTemp: 15 },
    { name: "Diesel (EN590)", sg: 0.835, type: 'P', sgTemp: 15 },
    { name: "Gasoil (0.1% S)", sg: 0.840, type: 'P', sgTemp: 15 },
    { name: "Gasoil (0.5% S)", sg: 0.850, type: 'P', sgTemp: 15 },
    { name: "Gasoline (ULG 95)", sg: 0.740, type: 'P', sgTemp: 15 },
    { name: "Gasoline (ULG 98)", sg: 0.755, type: 'P', sgTemp: 15 },
    { name: "Jet Fuel (A-1)", sg: 0.800, type: 'P', sgTemp: 15 },
    { name: "Naphtha (Light)", sg: 0.700, type: 'P', sgTemp: 15 },
    { name: "Naphtha (Heavy)", sg: 0.760, type: 'P', sgTemp: 15 },
    { name: "Naphtha (Full Range)", sg: 0.730, type: 'P', sgTemp: 15 },
    { name: "Kerosene", sg: 0.810, type: 'P', sgTemp: 15 },
    { name: "Base Oil (SN150)", sg: 0.870, type: 'P', sgTemp: 15 },
    { name: "Base Oil (SN500)", sg: 0.890, type: 'P', sgTemp: 15 },
    { name: "Fuel Oil (180 cSt)", sg: 0.980, type: 'P', sgTemp: 15 },
    { name: "Fuel Oil (380 cSt)", sg: 0.991, type: 'P', sgTemp: 15 },
    { name: "VLSFO", sg: 0.960, type: 'P', sgTemp: 15 },
    { name: "MGO (Marine Gasoil)", sg: 0.855, type: 'P', sgTemp: 15 },

    // === VEGETABLE OILS & FATS (SG @ 15°C) ===
    { name: "Palm Oil (RBD)", sg: 0.890, type: 'V', sgTemp: 15 },
    { name: "Palm Olein", sg: 0.900, type: 'V', sgTemp: 15 },
    { name: "Palm Stearin", sg: 0.881, type: 'V', sgTemp: 15 },
    { name: "Coconut Oil", sg: 0.925, type: 'V', sgTemp: 15 },
    { name: "Sunflower Oil", sg: 0.920, type: 'V', sgTemp: 15 },
    { name: "Soybean Oil", sg: 0.922, type: 'V', sgTemp: 15 },
    { name: "Rapeseed Oil (Canola)", sg: 0.915, type: 'V', sgTemp: 15 },
    { name: "Fish Oil", sg: 0.930, type: 'V', sgTemp: 15 },
    { name: "Tall Oil", sg: 0.960, type: 'V', sgTemp: 15 },
    { name: "Fatty Acid (C16-18)", sg: 0.860, type: 'V', sgTemp: 15 },
    { name: "Oleic Acid", sg: 0.895, type: 'V', sgTemp: 15 },
    { name: "Stearic Acid", sg: 0.847, type: 'V', sgTemp: 15 },
    { name: "UCO (Used Cooking Oil)", sg: 0.920, type: 'V', sgTemp: 15 },
    { name: "Molasses", sg: 1.400, type: 'V', sgTemp: 15 },

    // === WAXES & PARAFFINS (solidifying, heated) ===
    { name: "Paraffin Wax", sg: 0.930, type: 'V', sgTemp: 15 },
    { name: "Micro Wax", sg: 0.930, type: 'V', sgTemp: 15 },
    { name: "Slack Wax", sg: 0.910, type: 'V', sgTemp: 15 },
    { name: "Palm Wax", sg: 0.920, type: 'V', sgTemp: 15 },
    { name: "Synthetic Wax", sg: 0.940, type: 'V', sgTemp: 15 },
    { name: "Fully Refined Wax", sg: 0.930, type: 'V', sgTemp: 15 },
    { name: "Polyethylene Wax", sg: 0.950, type: 'V', sgTemp: 15 },

    // === MISC ===
    { name: "Water (Ballast/FW)", sg: 1.000, type: 'C', sgTemp: 20 },
];

// Type labels for display
const CARGO_TYPE_LABELS = {
    'P': { label: 'Petroleum', color: '#f59e0b' },
    'C': { label: 'Chemical', color: '#0ea5e9' },
    'V': { label: 'Veg Oil', color: '#22c55e' }
};

const PORT_DB = [
    // === NORTHWEST EUROPE ===
    "Rotterdam", "Antwerp", "Amsterdam", "Ghent", "Zeebrugge",
    "Hamburg", "Bremerhaven", "Bremen", "Wilhelmshaven", "Brunsbüttel", "Rostock",
    "Le Havre", "Marseille", "Fos-sur-Mer", "Dunkirk", "Nantes", "Bordeaux", "La Pallice", "Lavera",
    "Immingham", "Felixstowe", "Southampton", "Milford Haven", "Teesport", "Grangemouth",
    "London (Thames)", "Liverpool", "Hull", "Belfast",
    // === SCANDINAVIA & BALTIC ===
    "Gothenburg", "Stockholm", "Malmö", "Norrköping", "Stenungsund",
    "Helsinki", "Porvoo (Sköldvik)", "Kotka", "Turku",
    "Oslo", "Bergen", "Stavanger", "Mongstad", "Frederikstad",
    "Copenhagen", "Fredericia", "Kalundborg",
    "Gdansk", "Gdynia", "Szczecin",
    "Riga", "Ventspils", "Klaipeda", "Tallinn",
    "St. Petersburg", "Primorsk", "Ust-Luga", "Murmansk", "Novorossiysk",
    // === MEDITERRANEAN ===
    "Barcelona", "Tarragona", "Valencia", "Cartagena (Spain)", "Bilbao", "Huelva", "Algeciras", "Castellon",
    "Genoa", "Venice", "Ravenna", "Trieste", "Augusta", "Brindisi", "Livorno", "Naples", "Cagliari", "Milazzo", "Sarroch",
    "Lisbon", "Sines", "Leixoes (Porto)",
    "Piraeus", "Thessaloniki", "Elefsis", "Agioi Theodoroi",
    "Marseille (Lavera)", "Port-de-Bouc", "Sète",
    "Malta (Marsaxlokk)",
    // === BLACK SEA ===
    "Constanta", "Burgas", "Varna",
    "Odessa", "Yuzhny", "Nikolaev",
    "Batumi", "Poti", "Supsa",
    // === TURKEY ===
    "Istanbul (Ambarli)", "Istanbul (Haydarpasa)", "Izmit (Korfez)", "Gebze", "Derince",
    "Yalova", "Gemlik", "Aliaga", "Izmir", "Mersin",
    "Iskenderun", "Dortyol", "Ceyhan (BTC)", "Antalya", "Samsun",
    "Trabzon", "Tuzla", "Bandirma", "Nemrut Bay",
    // === NORTH AFRICA ===
    "Alexandria", "Port Said", "Suez", "Damietta", "El Dekheila", "Ain Sukhna",
    "Casablanca", "Mohammedia", "Jorf Lasfar", "Tangier Med", "Kenitra", "Nador", "Safi", "Agadir",
    "Algiers", "Oran", "Arzew", "Skikda", "Bejaia",
    "Tunis (La Goulette)", "Bizerte", "Sfax", "Gabes", "Skhira",
    "Tripoli (Libya)", "Misrata", "Zawia", "Ras Lanuf",
    // === WEST AFRICA ===
    "Lagos (Apapa)", "Lagos (Tin Can)", "Lome", "Cotonou",
    "Tema", "Takoradi", "Abidjan", "San Pedro",
    "Dakar", "Nouakchott",
    "Douala", "Kribi", "Limboh",
    "Pointe-Noire", "Matadi", "Luanda", "Lobito",
    "Libreville", "Port Gentil",
    "Bata (Eq. Guinea)", "Malabo",
    "Conakry", "Freetown", "Monrovia",
    // === EAST & SOUTH AFRICA ===
    "Durban", "Cape Town", "Richards Bay", "Port Elizabeth", "Mossel Bay", "Saldanha Bay",
    "Dar es Salaam", "Mombasa", "Maputo", "Beira", "Nacala",
    "Port Louis (Mauritius)", "Toamasina (Madagascar)",
    "Djibouti", "Port Sudan", "Massawa",
    // === MIDDLE EAST ===
    "Jeddah", "Jubail", "Yanbu", "Ras Tanura", "Dammam", "Jizan",
    "Dubai (Jebel Ali)", "Abu Dhabi (Ruwais)", "Fujairah", "Sharjah",
    "Muscat", "Sohar", "Salalah",
    "Kuwait (Shuaiba)", "Kuwait (Mina Abdullah)",
    "Basrah", "Umm Qasr",
    "Bandar Abbas", "Bandar Imam Khomeini", "Assaluyeh", "Chabahar", "Bushehr",
    "Aden", "Hodeidah",
    "Aqaba", "Eilat", "Haifa", "Ashdod",
    "Beirut", "Tripoli (Lebanon)", "Baniyas (Syria)", "Latakia",
    "Bahrain (Sitra)",
    // === INDIA & PAKISTAN & SRI LANKA ===
    "Mumbai (JNPT)", "Kandla", "Mundra", "Haldia", "Kolkata",
    "Chennai", "Mangalore", "Cochin (Kochi)", "Visakhapatnam", "Paradip",
    "New Mangalore", "Tuticorin", "Goa (Mormugao)", "Pipavav", "Hazira", "Dahej",
    "Karachi", "Port Qasim",
    "Colombo", "Trincomalee",
    // === SOUTHEAST ASIA ===
    "Singapore", "Port Klang", "Penang", "Pasir Gudang", "Tanjung Pelepas", "Kuantan",
    "Bangkok (Laem Chabang)", "Map Ta Phut", "Sriracha",
    "Ho Chi Minh (Cat Lai)", "Haiphong", "Da Nang", "Vung Tau",
    "Jakarta (Tanjung Priok)", "Surabaya", "Merak", "Cilacap", "Balikpapan", "Dumai", "Belawan",
    "Manila", "Batangas", "Cebu",
    "Yangon (Thilawa)",
    // === EAST ASIA ===
    "Shanghai", "Ningbo", "Qingdao", "Tianjin (Xingang)", "Dalian",
    "Guangzhou (Nansha)", "Shenzhen (Shekou)", "Zhanjiang", "Nanjing", "Zhoushan",
    "Quanzhou", "Xiamen", "Huizhou", "Maoming", "Taizhou", "Lianyungang",
    "Hong Kong",
    "Kaohsiung", "Taichung", "Taipei (Keelung)", "Mailiao",
    "Busan", "Ulsan", "Incheon", "Daesan", "Yeosu", "Gwangyang",
    "Tokyo", "Yokohama", "Kobe", "Nagoya", "Chiba", "Kawasaki", "Sakai", "Mizushima", "Oita",
    // === AMERICAS - USA ===
    "Houston", "Texas City", "Freeport TX", "Galveston", "Corpus Christi", "Port Arthur",
    "Beaumont", "Lake Charles", "Baton Rouge", "New Orleans", "Mobile",
    "Philadelphia", "New York/New Jersey", "Marcus Hook", "Perth Amboy",
    "Baltimore", "Norfolk", "Savannah", "Jacksonville", "Charleston", "Tampa",
    "Port Everglades", "Miami",
    "Long Beach", "Los Angeles", "San Francisco", "Portland OR", "Seattle", "Tacoma",
    // === AMERICAS - CARIBBEAN & CENTRAL ===
    "Freeport (Bahamas)", "Nassau",
    "Havana", "Cienfuegos", "Santiago de Cuba",
    "Kingston (Jamaica)", "Port-au-Prince",
    "San Juan (Puerto Rico)", "Ponce",
    "Point Lisas (Trinidad)", "Point-à-Pierre", "Pointe-à-Pierre",
    "Curaçao (Willemstad)", "Aruba (San Nicolas)", "Bonaire",
    "Cartagena (Colombia)", "Barranquilla", "Santa Marta", "Buenaventura",
    "Puerto Cabello", "La Guaira", "Jose",
    "Colon (Panama)", "Balboa (Panama)",
    "Puerto Cortes (Honduras)", "Santo Tomas (Guatemala)",
    "Veracruz", "Altamira", "Coatzacoalcos", "Tuxpan", "Lazaro Cardenas",
    // === AMERICAS - SOUTH ===
    "Santos", "Paranagua", "Rio Grande", "Itaqui", "Suape", "Aratu", "Vitoria",
    "Buenos Aires", "Bahia Blanca", "Rosario", "Campana", "San Lorenzo",
    "Montevideo",
    "Valparaiso", "San Antonio", "Quintero", "Mejillones",
    "Callao (Lima)", "Paita",
    "Guayaquil", "Esmeraldas",
    // === AUSTRALIA & OCEANIA ===
    "Melbourne", "Sydney", "Brisbane", "Fremantle", "Adelaide", "Geelong",
    "Gladstone", "Townsville", "Darwin", "Kwinana",
    "Auckland", "Tauranga", "Wellington", "Lyttelton",
    "Suva (Fiji)", "Noumea (New Caledonia)"
];

