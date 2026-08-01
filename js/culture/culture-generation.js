/**
 * =============================================================================
 * STILL WATERS - CULTURE GENERATION js/culture/culture-generation.js
 * =============================================================================
 * 
 * Weighted appearance generation from culture templates.
 * 
 * FEATURES:
 *   - Weighted random selection from culture appearance options
 *   - Full appearance generation for a character
 *   - Height calculation with gender-specific ranges
 *   - Location-based culture lookup
 *   - Fallback to default appearance if no culture found
 *   - Recursion guard
 * 
 * DEPENDENCIES:
 *   - culture-state.js (CultureState)
 *   - culture-queries.js (CultureQueries)
 *   - randomness.js (pickWeighted, randomInt, pickRandom)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.CultureState !== 'undefined' ? window.CultureState : null;
    }

    function _getQueries() {
        return typeof window.CultureQueries !== 'undefined' ? window.CultureQueries : null;
    }

    function _pickWeighted(items) {
        if (typeof window.pickWeighted === 'function') {
            return window.pickWeighted(items);
        }
        if (!items || items.length === 0) return null;

        var totalWeight = 0;
        for (var i = 0; i < items.length; i++) {
            totalWeight += items[i].weight || 1;
        }

        if (totalWeight === 0) {
            return items[Math.floor(Math.random() * items.length)];
        }

        var roll = Math.random() * totalWeight;
        var accumulated = 0;
        for (var i = 0; i < items.length; i++) {
            accumulated += items[i].weight || 1;
            if (roll <= accumulated) {
                return items[i];
            }
        }
        return items[items.length - 1];
    }

    function _randomInt(min, max) {
        if (typeof window.randomInt === 'function') {
            return window.randomInt(min, max);
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function _pickRandom(arr) {
        if (typeof window.pickRandom === 'function') {
            return window.pickRandom(arr);
        }
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function _getLocationTypePriority(typeId) {
        if (typeof window.getLocationTypePriority === 'function') {
            return window.getLocationTypePriority(typeId);
        }
        return 5;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getDefaultAppearance() {
        return window.CULTURE_DEFAULT_APPEARANCE || {
            skinTones: [
                { value: 'Pale', weight: 20 },
                { value: 'Fair', weight: 25 },
                { value: 'Olive', weight: 25 },
                { value: 'Tan', weight: 15 },
                { value: 'Dark', weight: 10 },
                { value: 'Deep Brown', weight: 5 }
            ],
            eyeColors: [
                { value: 'Blue', weight: 20 },
                { value: 'Green', weight: 15 },
                { value: 'Hazel', weight: 20 },
                { value: 'Brown', weight: 35 },
                { value: 'Gray', weight: 10 }
            ],
            hairColors: [
                { value: 'Blonde', weight: 20 },
                { value: 'Brown', weight: 30 },
                { value: 'Black', weight: 25 },
                { value: 'Red', weight: 10 },
                { value: 'Auburn', weight: 10 },
                { value: 'White', weight: 5 }
            ],
            hairTypes: [
                { value: 'Straight', weight: 40 },
                { value: 'Wavy', weight: 30 },
                { value: 'Curly', weight: 20 },
                { value: 'Kinky', weight: 10 }
            ],
            buildTypes: [
                { value: 'Slim', weight: 20 },
                { value: 'Average', weight: 40 },
                { value: 'Athletic', weight: 20 },
                { value: 'Stocky', weight: 15 },
                { value: 'Heavy', weight: 5 }
            ],
            height: {
                male: { min: 155, max: 200 },
                female: { min: 145, max: 185 }
            },
            commonFeatures: [
                { value: 'High cheekbones', weight: 20 },
                { value: 'Strong jawline', weight: 20 },
                { value: 'Prominent nose', weight: 15 },
                { value: 'Full lips', weight: 15 },
                { value: 'Wide eyes', weight: 10 },
                { value: 'Freckles', weight: 10 },
                { value: 'Dimples', weight: 10 }
            ]
        };
    }

    // =========================================================================
    // 3. WEIGHTED ROLL FUNCTIONS
    // =========================================================================

    /**
     * Rolls a weighted value from a list of options
     * @param {Array} options - Array of { value, weight } objects
     * @param {*} defaultValue - Default value if no options
     * @returns {*} Selected value
     */
    function rollWeightedValue(options, defaultValue) {
        if (_processing) return defaultValue;
        _processing = true;
        try {
            if (!options || options.length === 0) {
                return defaultValue;
            }
            var selected = _pickWeighted(options);
            return selected ? selected.value : defaultValue;
        } finally {
            _processing = false;
        }
    }

    /**
     * Rolls multiple weighted values from a list of options
     * @param {Array} options - Array of { value, weight } objects
     * @param {number} count - Number of values to roll
     * @param {*} defaultValue - Default value if no options
     * @returns {Array} Array of selected values
     */
    function rollWeightedValues(options, count, defaultValue) {
        if (_processing) return [];
        _processing = true;
        try {
            if (!options || options.length === 0) {
                return [];
            }
            var results = [];
            var available = options.slice();
            for (var i = 0; i < count; i++) {
                if (available.length === 0) break;
                var selected = _pickWeighted(available);
                if (selected) {
                    results.push(selected.value);
                    // Remove selected to avoid duplicates
                    var index = available.indexOf(selected);
                    if (index !== -1) {
                        available.splice(index, 1);
                    }
                }
            }
            return results;
        } finally {
            _processing = false;
        }
    }

    /**
     * Rolls a height within gender-specific ranges
     * @param {Object} heightConfig - { male: { min, max }, female: { min, max } }
     * @param {string} gender - 'male' or 'female'
     * @param {number} defaultMin - Default minimum height
     * @param {number} defaultMax - Default maximum height
     * @returns {number} Rolled height in cm
     */
    function rollHeight(heightConfig, gender, defaultMin, defaultMax) {
        if (_processing) return 170;
        _processing = true;
        try {
            defaultMin = defaultMin || 150;
            defaultMax = defaultMax || 190;

            if (!heightConfig) {
                return _randomInt(defaultMin, defaultMax);
            }

            var config = heightConfig[gender] || heightConfig;
            var min = config.min || defaultMin;
            var max = config.max || defaultMax;

            return _randomInt(min, max);
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 4. FULL APPEARANCE GENERATION
    // =========================================================================

    /**
     * Generates a full appearance object from a culture
     * @param {Object} culture - Culture object
     * @param {string} gender - 'male' or 'female'
     * @param {Object} options - Additional options
     * @returns {Object} Appearance object
     */
    function generateAppearanceFromCulture(culture, gender, options) {
        if (_processing) return null;
        _processing = true;
        try {
            options = options || {};

            if (!culture) {
                culture = { appearance: _getDefaultAppearance() };
            }

            var appearance = culture.appearance || _getDefaultAppearance();

            var result = {
                skinTone: rollWeightedValue(appearance.skinTones, options.defaultSkinTone || 'Fair'),
                eyeColor: rollWeightedValue(appearance.eyeColors, options.defaultEyeColor || 'Brown'),
                hairColor: rollWeightedValue(appearance.hairColors, options.defaultHairColor || 'Brown'),
                hairType: rollWeightedValue(appearance.hairTypes, options.defaultHairType || 'Straight'),
                build: rollWeightedValue(appearance.buildTypes, options.defaultBuild || 'Average'),
                height: rollHeight(appearance.height, gender, options.defaultHeightMin || 150, options.defaultHeightMax || 190),
                commonFeatures: rollWeightedValues(appearance.commonFeatures, options.commonFeatureCount || 2, [])
            };

            // Add a few random common features
            if (appearance.commonFeatures && appearance.commonFeatures.length > 0) {
                var featureCount = options.commonFeatureCount || Math.floor(Math.random() * 2) + 1;
                var features = rollWeightedValues(appearance.commonFeatures, featureCount, []);
                if (features.length > 0) {
                    result.commonFeatures = features;
                }
            }

            return result;
        } finally {
            _processing = false;
        }
    }

    /**
     * Generates a full appearance object from a culture ID
     * @param {string} cultureId - Culture ID
     * @param {string} gender - 'male' or 'female'
     * @param {Object} options - Additional options
     * @returns {Object} Appearance object
     */
    function generateAppearance(cultureId, gender, options) {
        if (_processing) return null;
        _processing = true;
        try {
            var state = _getState();
            if (!state) {
                return generateAppearanceFromCulture(null, gender, options);
            }

            var culture = cultureId ? state.getCulture(cultureId) : null;
            return generateAppearanceFromCulture(culture, gender, options);
        } finally {
            _processing = false;
        }
    }

    /**
     * Generates a full appearance object for a location
     * @param {string} locationId - Location ID
     * @param {string} gender - 'male' or 'female'
     * @param {Object} options - Additional options
     * @returns {Object} Appearance object
     */
    function generateAppearanceForLocation(locationId, gender, options) {
        if (_processing) return null;
        _processing = true;
        try {
            var queries = _getQueries();
            if (!queries) {
                return generateAppearance(null, gender, options);
            }

            var culture = queries.getCultureByLocation(locationId);
            return generateAppearanceFromCulture(culture, gender, options);
        } finally {
            _processing = false;
        }
    }

    /**
     * Generates a full appearance object with a randomly selected culture
     * @param {string} gender - 'male' or 'female'
     * @param {Object} options - Additional options
     * @returns {Object} { culture, appearance }
     */
    function generateAppearanceWithRandomCulture(gender, options) {
        if (_processing) return null;
        _processing = true;
        try {
            var state = _getState();
            if (!state) {
                return {
                    culture: null,
                    appearance: generateAppearance(null, gender, options)
                };
            }

            var cultures = state.getAllCultures();
            if (cultures.length === 0) {
                return {
                    culture: null,
                    appearance: generateAppearance(null, gender, options)
                };
            }

            var culture = _pickRandom(cultures);
            return {
                culture: culture,
                appearance: generateAppearanceFromCulture(culture, gender, options)
            };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. FIND CULTURE FOR LOCATION (Helper)
    // =========================================================================

    /**
     * Finds the most appropriate culture for a location by walking up the hierarchy
     * @param {string} locationId - Location ID
     * @returns {Object|null} Culture object or null
     */
    function findCultureForLocation(locationId) {
        if (_processing) return null;
        _processing = true;
        try {
            var queries = _getQueries();
            if (!queries) return null;

            return queries.getCultureByLocation(locationId);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all cultures that could apply to a location (including inherited)
     * @param {string} locationId - Location ID
     * @returns {Array} Array of culture objects
     */
    function findAllCulturesForLocation(locationId) {
        if (_processing) return [];
        _processing = true;
        try {
            var queries = _getQueries();
            if (!queries) return [];

            return queries.getAllCulturesByLocation(locationId);
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.CultureGeneration = {
        // Weighted rolls
        rollWeightedValue: rollWeightedValue,
        rollWeightedValues: rollWeightedValues,
        rollHeight: rollHeight,

        // Appearance generation
        generateAppearanceFromCulture: generateAppearanceFromCulture,
        generateAppearance: generateAppearance,
        generateAppearanceForLocation: generateAppearanceForLocation,
        generateAppearanceWithRandomCulture: generateAppearanceWithRandomCulture,

        // Location culture helpers
        findCultureForLocation: findCultureForLocation,
        findAllCulturesForLocation: findAllCulturesForLocation
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureGeneration;
    }

})();