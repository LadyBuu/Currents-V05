/**
 * =============================================================================
 * STILL WATERS - DISASTER CONSTANTS (disaster-constants.js)
 * =============================================================================
 * 
 * LOCATION: js/core/disaster/disaster-constants.js
 * 
 * This file contains ALL disaster-related constants and definitions.
 * 
 * DEPENDENCIES: None (pure constants)
 * 
 * ICON POLICY: No emojis. Uses monochrome symbols.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DISASTER TYPES
    // =========================================================================

    var DISASTER_TYPES = [
        { 
            id: "earthquake", 
            name: "Earthquake", 
            icon: "⌇", 
            weight: 25, 
            severityRange: [5, 40], 
            desc: "The ground shakes violently, collapsing buildings",
            locationModifiers: { mountain: 1.5, coastal: 0.8 } 
        },
        { 
            id: "tsunami", 
            name: "Tsunami", 
            icon: "⌇", 
            weight: 15, 
            severityRange: [10, 50], 
            desc: "A massive wave crashes onto the shore",
            locationModifiers: { coastal: 2.0, island: 1.8 } 
        },
        { 
            id: "volcano", 
            name: "Volcanic Eruption", 
            icon: "◉", 
            weight: 10, 
            severityRange: [15, 60], 
            desc: "Fire and ash rain down from the mountain",
            locationModifiers: { volcanic: 2.5, mountain: 1.3 } 
        },
        { 
            id: "fire", 
            name: "Forest Fire", 
            icon: "⌇", 
            weight: 20, 
            severityRange: [5, 35], 
            desc: "Raging flames consume everything in their path",
            locationModifiers: { forest: 2.0, rural: 1.2 } 
        },
        { 
            id: "flood", 
            name: "Flood", 
            icon: "⌇", 
            weight: 25, 
            severityRange: [5, 30], 
            desc: "Rising waters wash away homes and fields",
            locationModifiers: { river: 2.0, coastal: 1.5 } 
        },
        { 
            id: "hurricane", 
            name: "Hurricane/Cyclone", 
            icon: "⌇", 
            weight: 15, 
            severityRange: [10, 45], 
            desc: "Winds tear apart structures and uproot trees",
            locationModifiers: { coastal: 2.0, island: 1.5 } 
        },
        { 
            id: "landslide", 
            name: "Landslide", 
            icon: "◉", 
            weight: 10, 
            severityRange: [5, 25], 
            desc: "Earth and rock bury everything below",
            locationModifiers: { mountain: 2.0, hill: 1.5 } 
        },
        { 
            id: "drought", 
            name: "Drought", 
            icon: "⌇", 
            weight: 15, 
            severityRange: [10, 30], 
            desc: "Crops fail and water sources dry up",
            locationModifiers: { arid: 2.0, agricultural: 1.5 } 
        },
        { 
            id: "plague", 
            name: "Plague", 
            icon: "⌇", 
            weight: 20, 
            severityRange: [20, 70], 
            desc: "A deadly sickness spreads through the population",
            locationModifiers: { urban: 2.0, port: 1.5 } 
        },
        { 
            id: "famine", 
            name: "Famine", 
            icon: "⌇", 
            weight: 15, 
            severityRange: [15, 50], 
            desc: "Starvation grips the land",
            locationModifiers: { agricultural: 2.0, rural: 1.3 } 
        },
        { 
            id: "avalanche", 
            name: "Avalanche", 
            icon: "⌇", 
            weight: 5, 
            severityRange: [5, 20], 
            desc: "Snow and ice thunder down the mountain",
            locationModifiers: { mountain: 2.5, alpine: 2.0 } 
        },
        { 
            id: "tornado", 
            name: "Tornado", 
            icon: "⌇", 
            weight: 10, 
            severityRange: [5, 25], 
            desc: "A spiraling vortex destroys everything in its path",
            locationModifiers: { plains: 2.0, rural: 1.5 } 
        }
    ];

    // =========================================================================
    // 2. MASS DEATH TYPES
    // =========================================================================

    var MASS_DEATH_TYPES = {
        PLAGUE: { disasterId: "plague", name: "Plague", mortalityRate: 0.3 },
        FAMINE: { disasterId: "famine", name: "Famine", mortalityRate: 0.15 }
    };

    // =========================================================================
    // 3. LOCATION KEYWORDS
    // =========================================================================

    var LOCATION_KEYWORDS = {
        coastal: ['port', 'harbor', 'coast', 'bay', 'beach', 'shore'],
        mountain: ['mountain', 'peak', 'alpine', 'highland', 'mount'],
        volcanic: ['volcano', 'volcanic', 'crater', 'caldera'],
        forest: ['forest', 'woods', 'timber', 'wilderness', 'grove'],
        river: ['river', 'stream', 'creek', 'waterfall', 'brook'],
        island: ['island', 'isle', 'archipelago', 'islet'],
        hill: ['hill', 'foothill', 'ridge', 'downs'],
        urban: ['city', 'town', 'capital', 'metropolis', 'borough'],
        port: ['port', 'harbor', 'docks', 'quay', 'pier'],
        agricultural: ['farm', 'agriculture', 'field', 'pasture', 'meadow'],
        rural: ['village', 'hamlet', 'rural', 'countryside', 'croft'],
        arid: ['desert', 'arid', 'dry', 'barren', 'sand'],
        plains: ['plain', 'prairie', 'savanna', 'steppe', 'grassland'],
        alpine: ['alpine', 'high mountain', 'snow', 'glacier']
    };

    // =========================================================================
    // 4. DEFAULT DISASTER
    // =========================================================================

    var DEFAULT_DISASTER = {
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
        createdAt: null
    };

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.DISASTER_TYPES = DISASTER_TYPES;
    window.MASS_DEATH_TYPES = MASS_DEATH_TYPES;
    window.LOCATION_KEYWORDS = LOCATION_KEYWORDS;
    window.DEFAULT_DISASTER = DEFAULT_DISASTER;

    // DisasterConstants container
    window.DisasterConstants = {
        DISASTER_TYPES: DISASTER_TYPES,
        MASS_DEATH_TYPES: MASS_DEATH_TYPES,
        LOCATION_KEYWORDS: LOCATION_KEYWORDS,
        DEFAULT_DISASTER: DEFAULT_DISASTER
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            DISASTER_TYPES: DISASTER_TYPES,
            MASS_DEATH_TYPES: MASS_DEATH_TYPES,
            LOCATION_KEYWORDS: LOCATION_KEYWORDS,
            DEFAULT_DISASTER: DEFAULT_DISASTER,
            DisasterConstants: {
                DISASTER_TYPES: DISASTER_TYPES,
                MASS_DEATH_TYPES: MASS_DEATH_TYPES,
                LOCATION_KEYWORDS: LOCATION_KEYWORDS,
                DEFAULT_DISASTER: DEFAULT_DISASTER
            }
        };
    }

})();