/**
 * =============================================================================
 * STILL WATERS - CULTURE CONSTANTS (js/culture/culture-constants.js)
 * =============================================================================
 * 
 * Default templates, constants, and default cultures for the culture system.
 * 
 * DEPENDENCIES: None (pure constants)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEFAULT APPEARANCE CATEGORIES
    // =========================================================================

    /**
     * The complete list of appearance categories that can be rolled from culture.
     * Each category defines what kind of options it contains.
     */
    window.CULTURE_APPEARANCE_CATEGORIES = {
        SKIN_TONE: 'skinTones',
        EYE_COLOR: 'eyeColors',
        HAIR_COLOR: 'hairColors',
        HAIR_TYPE: 'hairTypes',
        BUILD: 'buildTypes',
        HEIGHT: 'height',
        COMMON_FEATURES: 'commonFeatures'
    };

    /**
     * Default options for each appearance category.
     * These are fallback values if a culture doesn't define a category.
     */
    window.CULTURE_DEFAULT_APPEARANCE = {
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

    // =========================================================================
    // 2. CULTURE TEMPLATE HELPER
    // =========================================================================

    /**
     * Creates a culture template with default values
     * @param {Object} data - Template data
     * @returns {Object} Complete culture template
     */
    function _createTemplate(data) {
        return {
            name: data.name || 'Unnamed Culture',
            displayName: data.displayName || data.name || 'Unnamed Culture',
            description: data.description || '',
            icon: data.icon || '✦',
            appearance: data.appearance || {
                skinTones: window.CULTURE_DEFAULT_APPEARANCE.skinTones.slice(),
                eyeColors: window.CULTURE_DEFAULT_APPEARANCE.eyeColors.slice(),
                hairColors: window.CULTURE_DEFAULT_APPEARANCE.hairColors.slice(),
                hairTypes: window.CULTURE_DEFAULT_APPEARANCE.hairTypes.slice(),
                buildTypes: window.CULTURE_DEFAULT_APPEARANCE.buildTypes.slice(),
                height: { ...window.CULTURE_DEFAULT_APPEARANCE.height },
                commonFeatures: window.CULTURE_DEFAULT_APPEARANCE.commonFeatures.slice()
            },
            mythology: data.mythology || {
                creation: '',
                afterlife: '',
                keyDeities: [],
                keyEvents: [],
                cosmology: '',
                symbols: [],
                themes: []
            },
            locations: data.locations || [],
            religions: data.religions || [],
            notes: data.notes || '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    // =========================================================================
    // 3. DEFAULT CULTURE TEMPLATES
    // =========================================================================

    /**
     * Default culture templates for quick creation.
     * These are used in the UI for creating new cultures.
     */
    window.CULTURE_TEMPLATES = {

        // ---- NORDIC ----
        NORDIC: _createTemplate({
            name: 'Nordic',
            displayName: 'Nordic Peoples',
            description: 'The hardy peoples of the cold north, known for their seafaring, raiding, and fierce independence.',
            icon: '✦',
            appearance: {
                skinTones: [
                    { value: 'Pale', weight: 70 },
                    { value: 'Fair', weight: 25 },
                    { value: 'Olive', weight: 5 }
                ],
                eyeColors: [
                    { value: 'Blue', weight: 50 },
                    { value: 'Green', weight: 30 },
                    { value: 'Gray', weight: 15 },
                    { value: 'Hazel', weight: 5 }
                ],
                hairColors: [
                    { value: 'Blonde', weight: 75 },
                    { value: 'Brown', weight: 15 },
                    { value: 'Red', weight: 8 },
                    { value: 'Black', weight: 2 }
                ],
                hairTypes: [
                    { value: 'Straight', weight: 50 },
                    { value: 'Wavy', weight: 40 },
                    { value: 'Curly', weight: 10 }
                ],
                buildTypes: [
                    { value: 'Athletic', weight: 30 },
                    { value: 'Average', weight: 40 },
                    { value: 'Stocky', weight: 25 },
                    { value: 'Slim', weight: 5 }
                ],
                height: {
                    male: { min: 170, max: 200 },
                    female: { min: 160, max: 185 }
                },
                commonFeatures: [
                    { value: 'High cheekbones', weight: 40 },
                    { value: 'Strong jawline', weight: 30 },
                    { value: 'Blond hair', weight: 30 },
                    { value: 'Light eyes', weight: 30 }
                ]
            },
            mythology: {
                creation: 'In the beginning, there was only the great void of Ginnungagap. Fire and ice met, and from their union sprang the first giant, Ymir.',
                afterlife: 'The brave who die in battle are carried by the Valkyries to Valhalla, where they feast and fight until Ragnarok.',
                keyDeities: ['Odin', 'Thor', 'Freya', 'Loki', 'Tyr', 'Balder'],
                keyEvents: ['The creation of the world', 'The war between Aesir and Vanir', 'The binding of Fenrir', 'Ragnarok'],
                cosmology: 'The World Tree Yggdrasil connects the nine realms, with Midgard (the world of men) at its center.',
                symbols: ['Mjolnir (Thor\'s hammer)', 'The Valknut', 'Runes', 'The World Serpent'],
                themes: ['Honor', 'Courage', 'Fate', 'Loyalty', 'The cycle of seasons']
            }
        }),

        // ---- MEDITERRANEAN ----
        MEDITERRANEAN: _createTemplate({
            name: 'Mediterranean',
            displayName: 'Mediterranean Peoples',
            description: 'The peoples of the warm southern seas, known for their trade, philosophy, and city-states.',
            icon: '✦',
            appearance: {
                skinTones: [
                    { value: 'Fair', weight: 15 },
                    { value: 'Olive', weight: 50 },
                    { value: 'Tan', weight: 30 },
                    { value: 'Dark', weight: 5 }
                ],
                eyeColors: [
                    { value: 'Brown', weight: 60 },
                    { value: 'Hazel', weight: 25 },
                    { value: 'Green', weight: 10 },
                    { value: 'Blue', weight: 5 }
                ],
                hairColors: [
                    { value: 'Brown', weight: 50 },
                    { value: 'Black', weight: 35 },
                    { value: 'Auburn', weight: 10 },
                    { value: 'Blonde', weight: 5 }
                ],
                hairTypes: [
                    { value: 'Wavy', weight: 40 },
                    { value: 'Curly', weight: 30 },
                    { value: 'Straight', weight: 30 }
                ],
                buildTypes: [
                    { value: 'Slim', weight: 25 },
                    { value: 'Average', weight: 40 },
                    { value: 'Athletic', weight: 25 },
                    { value: 'Stocky', weight: 10 }
                ],
                height: {
                    male: { min: 160, max: 190 },
                    female: { min: 150, max: 175 }
                },
                commonFeatures: [
                    { value: 'Olive complexion', weight: 40 },
                    { value: 'Dark hair', weight: 40 },
                    { value: 'Strong nose', weight: 25 },
                    { value: 'Expressive eyes', weight: 25 }
                ]
            },
            mythology: {
                creation: 'In the beginning, Chaos existed, formless and void. From Chaos emerged Gaia (Earth), Tartarus (Underworld), and Eros (Love).',
                afterlife: 'The souls of the dead cross the river Styx to the Underworld, ruled by Hades. The righteous go to Elysium, the wicked to Tartarus.',
                keyDeities: ['Zeus', 'Hera', 'Poseidon', 'Athena', 'Apollo', 'Artemis', 'Aphrodite'],
                keyEvents: ['The Titanomachy', 'The Trojan War', 'The Labors of Heracles', 'The Odyssey'],
                cosmology: 'The world is a flat disc, surrounded by the river Oceanus. The heavens are a dome held up by Atlas.',
                symbols: ['The laurel wreath', 'The owl (wisdom)', 'The trident', 'The thunderbolt'],
                themes: ['Glory', 'Wisdom', 'Beauty', 'Heroism', 'The favor of the gods']
            }
        }),

        // ---- DESERT ----
        DESERT: _createTemplate({
            name: 'Desert',
            displayName: 'Desert Peoples',
            description: 'The peoples of the vast deserts, known for their hospitality, poetry, and horse-riding tribes.',
            icon: '✦',
            appearance: {
                skinTones: [
                    { value: 'Olive', weight: 25 },
                    { value: 'Tan', weight: 40 },
                    { value: 'Dark', weight: 30 },
                    { value: 'Deep Brown', weight: 5 }
                ],
                eyeColors: [
                    { value: 'Brown', weight: 70 },
                    { value: 'Hazel', weight: 20 },
                    { value: 'Green', weight: 8 },
                    { value: 'Blue', weight: 2 }
                ],
                hairColors: [
                    { value: 'Black', weight: 60 },
                    { value: 'Brown', weight: 35 },
                    { value: 'Auburn', weight: 5 }
                ],
                hairTypes: [
                    { value: 'Straight', weight: 40 },
                    { value: 'Wavy', weight: 40 },
                    { value: 'Curly', weight: 20 }
                ],
                buildTypes: [
                    { value: 'Slim', weight: 30 },
                    { value: 'Average', weight: 40 },
                    { value: 'Athletic', weight: 20 },
                    { value: 'Stocky', weight: 10 }
                ],
                height: {
                    male: { min: 160, max: 190 },
                    female: { min: 150, max: 175 }
                },
                commonFeatures: [
                    { value: 'Dark eyes', weight: 40 },
                    { value: 'Olive complexion', weight: 30 },
                    { value: 'High nose bridge', weight: 20 },
                    { value: 'Full lips', weight: 20 }
                ]
            },
            mythology: {
                creation: 'From the sands of time, the first people emerged, guided by the stars and the wisdom of the ancestors.',
                afterlife: 'The souls of the departed join the ancestors in the eternal desert, where they guide the living from beyond.',
                keyDeities: ['The Sun God', 'The Moon Goddess', 'The Storm King', 'The Earth Mother'],
                keyEvents: ['The journey of the first tribe', 'The great drought', 'The alliance of the tribes'],
                cosmology: 'The world is a vast desert, with the sky as a great tent. The stars are the campfires of the ancestors.',
                symbols: ['The crescent moon', 'The star', 'The horse', 'The sword'],
                themes: ['Hospitality', 'Honor', 'Poetry', 'Courage', 'The wisdom of the desert']
            }
        }),

        // ---- CELTIC ----
        CELTIC: _createTemplate({
            name: 'Celtic',
            displayName: 'Celtic Peoples',
            description: 'The tribal peoples of the green isles and forests, known for their music, poetry, and warrior traditions.',
            icon: '✦',
            appearance: {
                skinTones: [
                    { value: 'Fair', weight: 50 },
                    { value: 'Pale', weight: 35 },
                    { value: 'Olive', weight: 15 }
                ],
                eyeColors: [
                    { value: 'Blue', weight: 35 },
                    { value: 'Green', weight: 30 },
                    { value: 'Brown', weight: 25 },
                    { value: 'Gray', weight: 10 }
                ],
                hairColors: [
                    { value: 'Brown', weight: 35 },
                    { value: 'Red', weight: 25 },
                    { value: 'Blonde', weight: 20 },
                    { value: 'Black', weight: 20 }
                ],
                hairTypes: [
                    { value: 'Wavy', weight: 45 },
                    { value: 'Curly', weight: 35 },
                    { value: 'Straight', weight: 20 }
                ],
                buildTypes: [
                    { value: 'Average', weight: 35 },
                    { value: 'Athletic', weight: 30 },
                    { value: 'Stocky', weight: 25 },
                    { value: 'Slim', weight: 10 }
                ],
                height: {
                    male: { min: 165, max: 195 },
                    female: { min: 155, max: 180 }
                },
                commonFeatures: [
                    { value: 'Freckles', weight: 35 },
                    { value: 'Bright eyes', weight: 30 },
                    { value: 'Red hair', weight: 25 },
                    { value: 'High cheekbones', weight: 25 }
                ]
            },
            mythology: {
                creation: 'In the time before time, the land was shaped by the gods from the bones of giants and the breath of the sea.',
                afterlife: 'The souls of the departed journey to the Otherworld, a realm of eternal youth and feasting, ruled by the gods of the Tuatha Dé Danann.',
                keyDeities: ['The Morrigan', 'Lugh', 'Brigid', 'Cernunnos', 'Dagda', 'Nuada'],
                keyEvents: ['The coming of the Tuatha Dé Danann', 'The battle of Moytura', 'The adventures of Cú Chulainn', 'The voyage of Bran'],
                cosmology: 'The world is a disc surrounded by the endless sea. Beyond the sea lies the Otherworld, reached through sacred groves and burial mounds.',
                symbols: ['The triskelion', 'The Celtic cross', 'The harp', 'The oak tree'],
                themes: ['Honor', 'Poetry', 'War', 'The cycle of seasons', 'The bond with nature']
            }
        }),

        // ---- EASTERN ----
        EASTERN: _createTemplate({
            name: 'Eastern',
            displayName: 'Eastern Peoples',
            description: 'The peoples of the far east, known for their philosophy, calligraphy, and refined arts.',
            icon: '✦',
            appearance: {
                skinTones: [
                    { value: 'Fair', weight: 30 },
                    { value: 'Olive', weight: 40 },
                    { value: 'Tan', weight: 25 },
                    { value: 'Dark', weight: 5 }
                ],
                eyeColors: [
                    { value: 'Brown', weight: 80 },
                    { value: 'Black', weight: 15 },
                    { value: 'Hazel', weight: 5 }
                ],
                hairColors: [
                    { value: 'Black', weight: 80 },
                    { value: 'Brown', weight: 18 },
                    { value: 'Red', weight: 2 }
                ],
                hairTypes: [
                    { value: 'Straight', weight: 80 },
                    { value: 'Wavy', weight: 18 },
                    { value: 'Curly', weight: 2 }
                ],
                buildTypes: [
                    { value: 'Slim', weight: 40 },
                    { value: 'Average', weight: 40 },
                    { value: 'Athletic', weight: 15 },
                    { value: 'Stocky', weight: 5 }
                ],
                height: {
                    male: { min: 155, max: 185 },
                    female: { min: 145, max: 170 }
                },
                commonFeatures: [
                    { value: 'Straight black hair', weight: 50 },
                    { value: 'Dark eyes', weight: 40 },
                    { value: 'High cheekbones', weight: 30 },
                    { value: 'Olive complexion', weight: 25 }
                ]
            },
            mythology: {
                creation: 'In the beginning, chaos reigned. From chaos, two principles emerged—the bright yang and the dark yin—and from their dance, the world was born.',
                afterlife: 'The souls of the ancestors watch over the living from the spirit world, where they continue to influence the affairs of mortals.',
                keyDeities: ['The Jade Emperor', 'Guanyin', 'The Dragon King', 'The Queen Mother of the West', 'The Kitchen God'],
                keyEvents: ['The separation of heaven and earth', 'The creation of humanity', 'The great flood', 'The rise of the dynasties'],
                cosmology: 'The world is a layered structure: heaven above, earth below, with the underworld beneath. The emperor is the Son of Heaven, bridging the realms.',
                symbols: ['The dragon', 'The phoenix', 'The bamboo', 'The plum blossom'],
                themes: ['Harmony', 'Filial piety', 'Balance', 'Wisdom', 'The Way (Tao)']
            }
        })
    };

    // =========================================================================
    // 4. GET CULTURE TEMPLATE BY NAME
    // =========================================================================

    /**
     * Gets a culture template by name
     * @param {string} name - Template name (e.g., 'NORDIC', 'MEDITERRANEAN')
     * @returns {Object|null} Culture template or null
     */
    window.getCultureTemplate = function(name) {
        if (!name) return null;
        var key = name.toUpperCase();
        return window.CULTURE_TEMPLATES[key] || null;
    };

    /**
     * Gets all culture template names
     * @returns {Array} Array of template names
     */
    window.getCultureTemplateNames = function() {
        return Object.keys(window.CULTURE_TEMPLATES);
    };

    /**
     * Gets all culture templates as a list
     * @returns {Array} Array of template objects
     */
    window.getAllCultureTemplates = function() {
        var result = [];
        var keys = Object.keys(window.CULTURE_TEMPLATES);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var template = window.CULTURE_TEMPLATES[key];
            result.push({
                key: key,
                name: template.name,
                displayName: template.displayName,
                description: template.description,
                icon: template.icon,
                template: template
            });
        }
        return result;
    };

    // =========================================================================
    // 5. LOG INITIALIZATION
    // =========================================================================

    // Log that constants are loaded
    if (typeof console !== 'undefined') {
       }

})();