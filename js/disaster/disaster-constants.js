/**
 * =============================================================================
 * STILL WATERS - DISASTER CONSTANTS (disaster-constants.js)
 * =============================================================================
 *
 * LOCATION: js/core/disaster/disaster-constants.js
 *
 * PURPOSE:
 *   Vocabulary, thresholds, and enumerations for the Disaster domain.
 *   Pure data plus small, side-effect-free helpers over that data. It does
 *   not read state, does not depend on other domain modules, and does not
 *   decide effects.
 *
 * OWNERSHIP:
 *   - DISASTER_TYPES catalog
 *   - MASS_DEATH_TYPES (plague, famine)
 *   - LOCATION_KEYWORDS (terrain matching vocabulary)
 *   - SEVERITY_BANDS + classifySeverity (thresholds)
 *   - CODES (error codes for structured command results)
 *   - EVENTS (cross-domain CustomEvent names)
 *   - STATE_EVENTS (in-process publish names)
 *   - DAMAGE_CATEGORIES (vocabulary for structural damage)
 *   - LOCATION_MODIFIER_BOUNDS (clamp bounds for modifiers)
 *   - DEFAULT_* constants
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not read state.
 *   - It does not decide effects.
 *   - It does not invent fallbacks for unknown disasters.
 *   - It does not carry per-disaster icon glyphs from the old inline
 *     Unicode characters. Icons are resolved via _getIcon() at the UI
 *     layer, keyed off disaster type id.
 *
 * DEPENDENCIES: None.
 *
 * ICON POLICY: No emojis. No inline Unicode glyphs. Icons are names only.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DISASTER TYPES
    // =========================================================================
    //
    // Every disaster type declares every field explicitly. Missing fields
    // are not permitted. The `icon` field that the old catalog carried
    // (Unicode glyphs like ⌇ and ◉) is removed. The UI resolves an icon
    // name per disaster id via _getIcon(). If no specific icon exists
    // for a type, the UI falls back to the generic CIRCLE_DOT.

    var DISASTER_TYPES = Object.freeze([
        Object.freeze({
            id: 'earthquake',
            name: 'Earthquake',
            weight: 25,
            severityRange: Object.freeze([5, 40]),
            desc: 'The ground shakes violently, collapsing buildings',
            locationModifiers: Object.freeze({ mountain: 1.5, coastal: 0.8 })
        }),
        Object.freeze({
            id: 'tsunami',
            name: 'Tsunami',
            weight: 15,
            severityRange: Object.freeze([10, 50]),
            desc: 'A massive wave crashes onto the shore',
            locationModifiers: Object.freeze({ coastal: 2.0, island: 1.8 })
        }),
        Object.freeze({
            id: 'volcano',
            name: 'Volcanic Eruption',
            weight: 10,
            severityRange: Object.freeze([15, 60]),
            desc: 'Fire and ash rain down from the mountain',
            locationModifiers: Object.freeze({ volcanic: 2.5, mountain: 1.3 })
        }),
        Object.freeze({
            id: 'fire',
            name: 'Forest Fire',
            weight: 20,
            severityRange: Object.freeze([5, 35]),
            desc: 'Raging flames consume everything in their path',
            locationModifiers: Object.freeze({ forest: 2.0, rural: 1.2 })
        }),
        Object.freeze({
            id: 'flood',
            name: 'Flood',
            weight: 25,
            severityRange: Object.freeze([5, 30]),
            desc: 'Rising waters wash away homes and fields',
            locationModifiers: Object.freeze({ river: 2.0, coastal: 1.5 })
        }),
        Object.freeze({
            id: 'hurricane',
            name: 'Hurricane/Cyclone',
            weight: 15,
            severityRange: Object.freeze([10, 45]),
            desc: 'Winds tear apart structures and uproot trees',
            locationModifiers: Object.freeze({ coastal: 2.0, island: 1.5 })
        }),
        Object.freeze({
            id: 'landslide',
            name: 'Landslide',
            weight: 10,
            severityRange: Object.freeze([5, 25]),
            desc: 'Earth and rock bury everything below',
            locationModifiers: Object.freeze({ mountain: 2.0, hill: 1.5 })
        }),
        Object.freeze({
            id: 'drought',
            name: 'Drought',
            weight: 15,
            severityRange: Object.freeze([10, 30]),
            desc: 'Crops fail and water sources dry up',
            locationModifiers: Object.freeze({ arid: 2.0, agricultural: 1.5 })
        }),
        Object.freeze({
            id: 'plague',
            name: 'Plague',
            weight: 20,
            severityRange: Object.freeze([20, 70]),
            desc: 'A deadly sickness spreads through the population',
            locationModifiers: Object.freeze({ urban: 2.0, port: 1.5 })
        }),
        Object.freeze({
            id: 'famine',
            name: 'Famine',
            weight: 15,
            severityRange: Object.freeze([15, 50]),
            desc: 'Starvation grips the land',
            locationModifiers: Object.freeze({ agricultural: 2.0, rural: 1.3 })
        }),
        Object.freeze({
            id: 'avalanche',
            name: 'Avalanche',
            weight: 5,
            severityRange: Object.freeze([5, 20]),
            desc: 'Snow and ice thunder down the mountain',
            locationModifiers: Object.freeze({ mountain: 2.5, alpine: 2.0 })
        }),
        Object.freeze({
            id: 'tornado',
            name: 'Tornado',
            weight: 10,
            severityRange: Object.freeze([5, 25]),
            desc: 'A spiraling vortex destroys everything in its path',
            locationModifiers: Object.freeze({ plains: 2.0, rural: 1.5 })
        })
    ]);

    // =========================================================================
    // 2. MASS DEATH TYPES
    // =========================================================================

    var MASS_DEATH_TYPES = Object.freeze({
        PLAGUE: Object.freeze({
            disasterId: 'plague',
            name: 'Plague',
            mortalityRate: 0.3
        }),
        FAMINE: Object.freeze({
            disasterId: 'famine',
            name: 'Famine',
            mortalityRate: 0.15
        })
    });

    // =========================================================================
    // 3. LOCATION KEYWORDS
    // =========================================================================
    //
    // Terrain classification used by getDisasterLocationModifier. A
    // location's display name is matched against these keywords; the
    // matching terrains contribute to the disaster's weight and severity.

    var LOCATION_KEYWORDS = Object.freeze({
        coastal:      Object.freeze(['port', 'harbor', 'coast', 'bay', 'beach', 'shore']),
        mountain:     Object.freeze(['mountain', 'peak', 'alpine', 'highland', 'mount']),
        volcanic:     Object.freeze(['volcano', 'volcanic', 'crater', 'caldera']),
        forest:       Object.freeze(['forest', 'woods', 'timber', 'wilderness', 'grove']),
        river:        Object.freeze(['river', 'stream', 'creek', 'waterfall', 'brook']),
        island:       Object.freeze(['island', 'isle', 'archipelago', 'islet']),
        hill:         Object.freeze(['hill', 'foothill', 'ridge', 'downs']),
        urban:        Object.freeze(['city', 'town', 'capital', 'metropolis', 'borough']),
        port:         Object.freeze(['port', 'harbor', 'docks', 'quay', 'pier']),
        agricultural: Object.freeze(['farm', 'agriculture', 'field', 'pasture', 'meadow']),
        rural:        Object.freeze(['village', 'hamlet', 'rural', 'countryside', 'croft']),
        arid:         Object.freeze(['desert', 'arid', 'dry', 'barren', 'sand']),
        plains:       Object.freeze(['plain', 'prairie', 'savanna', 'steppe', 'grassland']),
        alpine:       Object.freeze(['alpine', 'high mountain', 'snow', 'glacier'])
    });

    // =========================================================================
    // 4. SEVERITY BANDS
    // =========================================================================
    //
    // Severity is numeric (0-100). Bands classify it into four tiers. This
    // is the single source for the thresholds. No other module re-derives
    // them.

    var SEVERITY_BANDS = Object.freeze({
        LOW:      'low',
        MEDIUM:   'medium',
        HIGH:     'high',
        CRITICAL: 'critical'
    });

    /**
     * Classifies a numeric severity (0-100) into a band.
     * Returns null for non-numeric input. The thresholds live only here.
     *
     * @param {number} severity
     * @returns {string|null}
     */
    function classifySeverity(severity) {
        if (typeof severity !== 'number' || isNaN(severity)) return null;
        if (severity < 25) return SEVERITY_BANDS.LOW;
        if (severity < 50) return SEVERITY_BANDS.MEDIUM;
        if (severity < 75) return SEVERITY_BANDS.HIGH;
        return SEVERITY_BANDS.CRITICAL;
    }

    // =========================================================================
    // 5. DAMAGE CATEGORIES
    // =========================================================================
    //
    // The five structural categories that DisasterDamage coordinates. Each
    // maps to a single owning system. The order here is the display order
    // used by disaster UI panels.

    var DAMAGE_CATEGORIES = Object.freeze([
        Object.freeze({ id: 'features',    label: 'Settlement Features' }),
        Object.freeze({ id: 'schools',     label: 'Schools'             }),
        Object.freeze({ id: 'enterprises', label: 'Enterprises'         }),
        Object.freeze({ id: 'residences',  label: 'Residences'          }),
        Object.freeze({ id: 'households',  label: 'Households'          })
    ]);

    // =========================================================================
    // 6. LOCATION MODIFIER BOUNDS
    // =========================================================================
    //
    // The disaster location modifier is a multiplicative adjustment based
    // on terrain. It is clamped to these bounds so a location with many
    // matching terrains cannot multiply the weight or severity without
    // limit.

    var LOCATION_MODIFIER_BOUNDS = Object.freeze({
        min: 0.5,
        max: 3.0
    });

    // =========================================================================
    // 7. ERROR CODES
    // =========================================================================
    //
    // Used as the `code` field of failed command results. Stable strings.
    // Additive only; codes are never removed once they have appeared in a
    // shipped result.

    var CODES = Object.freeze({
        VALIDATION:              'VALIDATION',
        NOT_FOUND:               'NOT_FOUND',
        STATE_MUTATING:          'STATE_MUTATING',
        DISASTER_TYPE_NOT_FOUND: 'DISASTER_TYPE_NOT_FOUND',
        LOCATION_NOT_FOUND:      'LOCATION_NOT_FOUND',
        NO_DISASTER_TYPES:       'NO_DISASTER_TYPES',
        NO_POPULATED_LOCATIONS:  'NO_POPULATED_LOCATIONS',
        DAMAGE_FAILED:           'DAMAGE_FAILED'
    });

    // =========================================================================
    // 8. EVENT NAMES
    // =========================================================================
    //
    // Cross-domain CustomEvent names, fired in the command commit tail.
    // Consumers subscribe to these instead of polling.

    var EVENTS = Object.freeze({
        DISASTER_ADDED:   'disasterAdded',
        DISASTER_UPDATED: 'disasterUpdated',
        DISASTER_DELETED: 'disasterDeleted'
    });

    // In-process State subscription event names (State.publish).
    //
    // CACHE_INVALIDATED is a legacy alias for CACHE_RELOADED. It is kept
    // here so that any existing subscriber that switches on
    // event.type === 'cacheInvalidated' continues to receive an event
    // after a reload. Both events are emitted together by State.reload().

    var STATE_EVENTS = Object.freeze({
        HYDRATED:           'hydrated',
        CACHE_RELOADED:     'cacheReloaded',
        CACHE_INVALIDATED:  'cacheInvalidated'
    });

    // =========================================================================
    // 9. DEFAULTS
    // =========================================================================

    // Structural damage chance bounds. Applied by DisasterDamage when
    // converting severity to destruction probability.
    var DAMAGE_CHANCE = Object.freeze({
        maxBaseChance:    0.65,   // baseChance = severity/100 * this
        maxAdjustedChance: 0.9    // final chance is clamped to this
    });

    // Per-disaster-type structural damage multipliers. Consumed by
    // DisasterDamage._getDisasterTypeMultiplier.
    var DISASTER_TYPE_DAMAGE_MULTIPLIERS = Object.freeze({
        earthquake: 1.4,
        landslide:  1.4,
        volcano:    1.3,
        fire:       1.3,
        hurricane:  1.2,
        tornado:    1.2,
        tsunami:    1.2,
        flood:      1.1,
        avalanche:  1.2,
        drought:    0.5,
        plague:     0.1,
        famine:     0.3
    });

    // Per-system chance multipliers, applied by DisasterDamage when
    // selecting items to destroy within each category.
    var DAMAGE_SYSTEM_MULTIPLIERS = Object.freeze({
        features:    0.6,
        schools:     0.7,
        enterprises: 0.8,
        residences:  0.9,
        households:  0.5
    });

    // Base value of a destroyed item per category, used by
    // DisasterDamage._calculateTotalLoss to compute the aggregate
    // economic loss.
    var DAMAGE_ITEM_VALUES = Object.freeze({
        features:    30,
        schools:     100,
        enterprises: 75,
        residences:  80,
        households:  50
    });

    // Random disaster simulation default chance per year, applied by
    // DisasterCommands.simulateRandomDisaster when no baseChance is
    // provided.
    var DEFAULT_RANDOM_DISASTER_CHANCE = 0.05;

    // Default disaster record template. Used by callers that need an
    // empty shape. State.addDisaster normalises its own defaults; this
    // template is for external consumption.
    var DEFAULT_DISASTER = Object.freeze({
        id: null,
        year: null,
        disasterType: 'Unknown',
        disasterId: 'unknown',
        locationId: null,
        locationName: 'Unknown Location',
        severity: 5,
        deaths: 0,
        population: 0,
        prosperityLoss: 0,
        crimeIncrease: 0,
        schoolsDestroyed: 0,
        description: '',
        actualDeaths: 0,
        createdAt: null,
        structuralDamage: Object.freeze({
            featuresDestroyed: 0,
            schoolsDestroyed: 0,
            enterprisesDestroyed: 0,
            residencesDemolished: 0,
            householdsDestroyed: 0,
            totalLoss: 0,
            destructionList: Object.freeze({
                features: Object.freeze([]),
                schools: Object.freeze([]),
                enterprises: Object.freeze([]),
                residences: Object.freeze([]),
                households: Object.freeze([])
            })
        }),
        featuresDestroyed: 0,
        enterprisesDestroyed: 0,
        residencesDemolished: 0,
        householdsDestroyed: 0,
        totalLoss: 0
    });

    // =========================================================================
    // 10. HELPER FUNCTIONS (pure)
    // =========================================================================

    function getAllDisasterTypes() {
        return DISASTER_TYPES.slice();
    }

    function getDisasterTypeById(id) {
        if (!id) return null;
        for (var i = 0; i < DISASTER_TYPES.length; i++) {
            if (DISASTER_TYPES[i].id === id) return DISASTER_TYPES[i];
        }
        return null;
    }

    function isKnownDisasterType(id) {
        return getDisasterTypeById(id) !== null;
    }

    function getLocationKeywords(terrain) {
        if (!terrain) return [];
        return LOCATION_KEYWORDS[terrain] ? LOCATION_KEYWORDS[terrain].slice() : [];
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    var DisasterConstants = {
        // Catalog
        DISASTER_TYPES: DISASTER_TYPES,
        MASS_DEATH_TYPES: MASS_DEATH_TYPES,
        LOCATION_KEYWORDS: LOCATION_KEYWORDS,

        // Severity
        SEVERITY_BANDS: SEVERITY_BANDS,
        classifySeverity: classifySeverity,

        // Damage vocabulary
        DAMAGE_CATEGORIES: DAMAGE_CATEGORIES,
        DAMAGE_CHANCE: DAMAGE_CHANCE,
        DISASTER_TYPE_DAMAGE_MULTIPLIERS: DISASTER_TYPE_DAMAGE_MULTIPLIERS,
        DAMAGE_SYSTEM_MULTIPLIERS: DAMAGE_SYSTEM_MULTIPLIERS,
        DAMAGE_ITEM_VALUES: DAMAGE_ITEM_VALUES,

        // Modifier bounds
        LOCATION_MODIFIER_BOUNDS: LOCATION_MODIFIER_BOUNDS,

        // Codes
        CODES: CODES,

        // Events
        EVENTS: EVENTS,
        STATE_EVENTS: STATE_EVENTS,

        // Defaults
        DEFAULT_RANDOM_DISASTER_CHANCE: DEFAULT_RANDOM_DISASTER_CHANCE,
        DEFAULT_DISASTER: DEFAULT_DISASTER,

        // Helpers
        getAllDisasterTypes: getAllDisasterTypes,
        getDisasterTypeById: getDisasterTypeById,
        isKnownDisasterType: isKnownDisasterType,
        getLocationKeywords: getLocationKeywords
    };

    window.DisasterConstants = DisasterConstants;

    // Legacy global aliases. Retained during migration so that older
    // modules (and any UI still reading window.DISASTER_TYPES) continue
    // to work. New code should not read these directly. Removed once
    // every consumer has migrated to DisasterConstants.*.
    window.DISASTER_TYPES = DISASTER_TYPES;
    window.MASS_DEATH_TYPES = MASS_DEATH_TYPES;
    window.LOCATION_KEYWORDS = LOCATION_KEYWORDS;
    window.DEFAULT_DISASTER = DEFAULT_DISASTER;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DisasterConstants;
    }

})();
