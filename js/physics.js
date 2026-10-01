/**
 * physics.js — density / volume correction and tank filling limits.
 *
 * Volume correction
 *   Petroleum products:   ASTM D1250 Table 54B (generalised products), ref 15 °C.
 *   Lub / base oils:      ASTM D1250 Table 54D (lubricating oils), ref 15 °C.
 *   Chemicals / veg oils: ρT = ρref / (1 + β·(T − Tref)) with product cubic expansion β.
 *
 * Filling limit (per cargo, applies to every tank it occupies)
 *   1. Thermal (IBC 15.x / ISGOTT practice): a tank loaded at TL that will warm to the
 *      highest voyage temperature TR may be filled to  98 % × ρR / ρL.
 *   2. Structural (stability booklet): 98 % up to SG 1.54; heavier cargo is limited
 *      to 98 × 1.54 / ρL so the tank mass never exceeds the design mass.
 *   The lower of the two governs.
 *
 * Mass basis: 'vac' (density in vacuum) or 'air' (ASTM Table 56 WCF on the reference
 * density: MT air = V@ref × (ρref − 0.0011) = Vobs × (ρT − 0.0011 × VCF)).
 */
(function (global) {
    'use strict';

    function alpha54B(rho) { // rho kg/m³ @ 15 °C
        const r2 = rho * rho;
        if (rho >= 839) return 186.9696 / r2 + 0.4862 / rho;   // fuel oils
        if (rho >= 788) return 594.5418 / r2;                  // jet fuels
        if (rho >= 770.5) return -0.00336312 + 2680.3206 / r2; // transition zone
        return 346.4228 / r2 + 0.4388 / rho;                   // gasolines
    }

    function alpha54D(rho) { // rho kg/m³ @ 15 °C, lubricating oils 800–1164 kg/m³
        return 0.6278 / rho;
    }

    /** VCF table used for the parcel: '54B', '54D' or null (product coefficient β). */
    function vcfTable(c) {
        if (c.vcfTable === '54B' || c.vcfTable === '54D') return c.vcfTable;
        if (c.vcfTable === 'beta') return null;
        return c.g === 'P' && !(c.beta > 0) ? '54B' : null;
    }

    /** Density (t/m³, vacuum) of a parcel at temperature T °C. */
    function densityAt(c, T) {
        const ref = Number.isFinite(c.ref) ? c.ref : 15;
        const t = Number.isFinite(T) ? T : ref;
        const dt = t - ref;
        if (Math.abs(dt) < 1e-9) return c.sg;
        const table = vcfTable(c);
        if (table) {
            // Tables 54B/54D are defined from 15 °C; for other refs we approximate with the same α.
            const a = table === '54D' ? alpha54D(c.sg * 1000) : alpha54B(c.sg * 1000);
            return c.sg * Math.exp(-a * dt * (1 + 0.8 * a * dt));
        }
        const beta = c.beta > 0 ? c.beta : 0.0010;
        return c.sg / (1 + beta * dt);
    }

    /** Volume correction factor ref → T (V_ref = V_T × VCF). */
    function vcf(c, T) {
        return densityAt(c, T) / c.sg;
    }

    function loadTemp(c) {
        return Number.isFinite(c.loadT) ? c.loadT : (Number.isFinite(c.ref) ? c.ref : 15);
    }

    /** Highest temperature the parcel will reach on passage (heated cargo: top of band). */
    function voyageMaxTemp(c) {
        const tl = loadTemp(c);
        if (Number.isFinite(c.voyT)) return Math.max(tl, c.voyT);
        return tl;
    }

    /** Mass (t) per m³ observed at load temperature, on the selected basis. */
    function massPerM3(c, basis) {
        const t = loadTemp(c);
        const rho = densityAt(c, t);
        return basis === 'air' ? rho - 0.0011 * vcf(c, t) : rho;
    }

    /**
     * Allowed fill % of 100 % tank capacity for this parcel, plus which rule governs.
     * settings: { maxFillPct, maxSgAtMaxFill }
     */
    function fillLimit(c, settings) {
        const maxFill = settings && settings.maxFillPct || 98;
        const sgLim = settings && settings.maxSgAtMaxFill || 1.54;
        const tl = loadTemp(c);
        const tr = voyageMaxTemp(c);
        const rhoL = densityAt(c, tl);
        const rhoR = densityAt(c, tr);
        const thermal = tr > tl ? maxFill * rhoR / rhoL : maxFill;
        const structural = rhoL > sgLim ? maxFill * sgLim / rhoL : maxFill;
        const pct = Math.min(thermal, structural);
        let rule = 'std';
        if (pct < maxFill - 1e-6) rule = structural <= thermal ? 'sg' : 'thermal';
        return { pct, rule, thermal, structural, rhoL, rhoR };
    }

    global.Physics = { alpha54B, alpha54D, vcfTable, densityAt, vcf, loadTemp, voyageMaxTemp, massPerM3, fillLimit };
})(typeof window !== 'undefined' ? window : globalThis);
