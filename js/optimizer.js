/**
 * Cargo Distribution Optimizer
 * Ported from original React version to vanilla JS
 * Supports BALANCED (water-filling) and CONSOLIDATED strategies
 */

const SOLIDIFYING_CARGO_KEYWORDS = [
    'palm',
    'stearin',
    'molasses',
    'fuel oil',
    'vlsfo',
    'stearic acid',
    'phenol'
];

function isSolidifyingCargo(cargo) {
    const name = String(cargo.name || '').toLowerCase();
    return SOLIDIFYING_CARGO_KEYWORDS.some(keyword => name.includes(keyword));
}

function optimizeCargoDistribution(cargoes) {
    // 1. Calculate required volume for each cargo
    const cargoVolumes = cargoes.map(c => ({
        ...c,
        volume: c.quantity / c.sg,
        assignedTanks: []
    }));

    // 2. Prepare tanks (base: filled to MAX_FILL_PERCENTAGE at permissible SG).
    //    Per-tank maxVolume is later re-scoped per cargo below, because heavier cargo
    //    (SG > MAX_SG_CARGO_TANKS) must fill to a lower % so the tank mass stays in limit.
    let availableTanks = TANKS.map(t => ({
        ...t,
        maxVolume: t.capacity100 * (t.name.includes('DECK') ? (DECK_MAX_FILL_PERCENTAGE / 100) : (MAX_FILL_PERCENTAGE / 100)),
        currentVolume: 0,
        assignedCargo: null
    }));

    // Re-scope tank maxVolume for a given cargo SG (interpolated fill % rule).
    function scopeTanksToSG(tanksArg, sg) {
        const allowedPct = (typeof getAllowedFillPct === 'function')
            ? getAllowedFillPct(sg)
            : MAX_FILL_PERCENTAGE;
        tanksArg.forEach(t => {
            const baseFill = t.name.includes('DECK') ? DECK_MAX_FILL_PERCENTAGE : MAX_FILL_PERCENTAGE;
            // Only cap below base fill when this cargo's SG exceeds the permissible limit
            // AND the tank is not already partly filled by the same cargo (keep consistency).
            t.maxVolume = t.capacity100 * (allowedPct / 100);
        });
    }

    // 3. Sort cargoes by volume (largest first)
    cargoVolumes.sort((a, b) => b.volume - a.volume);

    // Track weight per side for stability
    let portWeight = 0;
    let stbdWeight = 0;

    // Helper: distribute cargo list into allowed tanks
    const distribute = (cargoList, allowedTanks) => {
        for (let cargo of cargoList) {
            if (cargo.volume < 0.01) continue;

            // Re-scope tank max volume to this cargo's SG (interpolated fill % rule)
            scopeTanksToSG(allowedTanks, cargo.sg);

            let remainingVol = cargo.volume;
            const cargoSpecificTanks = isSolidifyingCargo(cargo)
                ? allowedTanks.filter(t => !t.name.includes('DECK'))
                : allowedTanks;

            // 1. Group tanks into Pairs
            let pairs = {};
            cargoSpecificTanks.forEach(t => {
                if ((t.currentVolume === 0 || (t.assignedCargo && t.assignedCargo.id === cargo.id)) &&
                    (t.maxVolume - t.currentVolume) > 0) {

                    let pairId = t.name.replace(/[^0-9]/g, '');
                    if (t.name.includes('DECK')) pairId = 'DECK' + pairId;
                    if (t.name.toLowerCase().includes('slop')) pairId = 'SLOP';

                    if (!pairs[pairId]) pairs[pairId] = [];
                    pairs[pairId].push(t);
                }
            });

            // Convert to array
            let pairList = Object.keys(pairs).map(pid => {
                const tanks = pairs[pid];
                const totalCap = tanks.reduce((sum, t) => sum + (t.maxVolume - t.currentVolume), 0);
                const isFullPair = tanks.length === 2;
                const numericId = pid.startsWith('DECK') ? 99 : (pid === 'SLOP' ? 0 : parseInt(pid));
                return { id: pid, numericId, tanks, totalCap, isFullPair };
            });

            // Sort: Best Fit Strategy
            pairList.sort((a, b) => {
                if (a.isFullPair !== b.isFullPair) return b.isFullPair - a.isFullPair;
                const aFits = a.totalCap >= remainingVol;
                const bFits = b.totalCap >= remainingVol;
                if (aFits && bFits) return a.totalCap - b.totalCap;
                else if (!aFits && !bFits) return b.totalCap - a.totalCap;
                else return aFits ? -1 : 1;
            });

            // Select Pairs with Spacing Heuristic
            let currentSelection = [];
            let currentCap = 0;

            const isSpaced = (p1, existingPairs) => {
                if (existingPairs.length === 0) return true;
                for (let p of existingPairs) {
                    if (Math.abs(p.numericId - p1.numericId) < 2) return false;
                }
                return true;
            };

            // Pass 1: Spaced full pairs
            for (let pair of pairList) {
                if (currentCap >= remainingVol) break;
                if (pair.isFullPair && isSpaced(pair, currentSelection)) {
                    currentSelection.push(pair);
                    currentCap += pair.totalCap;
                }
            }
            // Pass 2: Any full pairs
            if (currentCap < remainingVol) {
                for (let pair of pairList) {
                    if (currentCap >= remainingVol) break;
                    if (pair.isFullPair && !currentSelection.includes(pair)) {
                        currentSelection.push(pair);
                        currentCap += pair.totalCap;
                    }
                }
            }
            // Pass 3: Partial / deck
            if (currentCap < remainingVol) {
                for (let pair of pairList) {
                    if (currentCap >= remainingVol) break;
                    if (!currentSelection.includes(pair)) {
                        currentSelection.push(pair);
                        currentCap += pair.totalCap;
                    }
                }
            }

            let selectedTanks = currentSelection.flatMap(p => p.tanks);

            // Fallback
            if (selectedTanks.length === 0) {
                selectedTanks = cargoSpecificTanks.filter(t =>
                    (t.currentVolume === 0 || (t.assignedCargo && t.assignedCargo.id === cargo.id)) &&
                    (t.maxVolume - t.currentVolume) > 0
                );
            }

            if (selectedTanks.length === 0) {
                console.warn(`No tanks available for ${cargo.name}`);
                continue;
            }

            // 3. Distribute: BALANCED vs CONSOLIDATED
            const strategy = cargo.strategy || 'BALANCED';
            let activeTanks = [...selectedTanks];
            let assignedAmounts = new Map();
            selectedTanks.forEach(t => assignedAmounts.set(t.id, 0));
            let toDistribute = remainingVol;

            if (strategy === 'CONSOLIDATED') {
                for (let t of activeTanks) {
                    if (toDistribute <= 0.001) break;
                    let space = t.maxVolume - (t.currentVolume + assignedAmounts.get(t.id));
                    if (space > 0) {
                        let add = Math.min(space, toDistribute);
                        assignedAmounts.set(t.id, assignedAmounts.get(t.id) + add);
                        toDistribute -= add;
                    }
                }
            } else {
                // BALANCED (Water-filling algorithm)
                while (toDistribute > 0.01 && activeTanks.length > 0) {
                    let activeCap100 = activeTanks.reduce((sum, t) => sum + t.capacity100, 0);
                    let currentTotalVol = activeTanks.reduce((sum, t) => sum + t.currentVolume + assignedAmounts.get(t.id), 0);
                    let potentialTotal = currentTotalVol + toDistribute;
                    let commonPercent = potentialTotal / activeCap100;

                    let exceeded = false;
                    let nextActive = [];

                    for (let t of activeTanks) {
                        let maxAllowed = t.maxVolume;
                        let proposedVol = commonPercent * t.capacity100;

                        if (proposedVol > maxAllowed + 0.001) {
                            let canAdd = maxAllowed - (t.currentVolume + assignedAmounts.get(t.id));
                            if (canAdd < 0) canAdd = 0;
                            assignedAmounts.set(t.id, assignedAmounts.get(t.id) + canAdd);
                            toDistribute -= canAdd;
                            exceeded = true;
                        } else {
                            nextActive.push(t);
                        }
                    }

                    if (exceeded) {
                        activeTanks = nextActive;
                    } else {
                        for (let t of activeTanks) {
                            let finalVol = commonPercent * t.capacity100;
                            let add = finalVol - (t.currentVolume + assignedAmounts.get(t.id));
                            if (add < 0) add = 0;
                            assignedAmounts.set(t.id, assignedAmounts.get(t.id) + add);
                            toDistribute -= add;
                        }
                        break;
                    }
                }
            }

            // Apply assignments
            for (let t of selectedTanks) {
                let amount = assignedAmounts.get(t.id);
                if (amount > 0.001) {
                    if (!t.assignedCargo) {
                        t.assignedCargo = {
                            id: cargo.id, name: cargo.name, color: cargo.color,
                            volume: 0, weight: 0, sg: cargo.sg,
                            parcelNo: cargo.parcelNo, loadPort: cargo.loadPort, dischPort: cargo.dischPort
                        };
                    }
                    t.currentVolume += amount;
                    t.assignedCargo.volume += amount;
                    let w = amount * cargo.sg;
                    t.assignedCargo.weight += w;

                    if (t.side === 'P') portWeight += w;
                    if (t.side === 'S') stbdWeight += w;
                }
            }

            if (toDistribute > 0.1) {
                cargo.volume = toDistribute;
                cargo.spillover = true;
            } else {
                cargo.volume = 0;
            }
        }
    };

    // Run distribution on all tanks
    distribute(cargoVolumes, availableTanks);

    return {
        tanks: availableTanks,
        cargoes: cargoVolumes,
        portWeight,
        stbdWeight
    };
}
