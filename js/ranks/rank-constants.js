/**
 * =============================================================================
 * STILL WATERS - RANK CONSTANTS (rank-constants.js)
 * =============================================================================
 * 
 * LOCATION: js/core/rank/rank-constants.js
 * 
 * This file contains ALL rank-related constants and definitions.
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
    // 1. RANK LEVELS
    // =========================================================================

    var RANK_LEVELS = {
        1: { 
            name: "Sovereign", 
            icon: "◉", 
            description: "Highest level - Rulers, monarchs, emperors" 
        },
        2: { 
            name: "High Noble", 
            icon: "◧", 
            description: "Dukes, princes, high lords" 
        },
        3: { 
            name: "Noble", 
            icon: "◈", 
            description: "Counts, earls, barons" 
        },
        4: { 
            name: "Gentry", 
            icon: "⟡", 
            description: "Knights, esquires, landed gentry" 
        },
        5: { 
            name: "Commoner", 
            icon: "⌂", 
            description: "Merchants, artisans, peasants" 
        }
    };

    // =========================================================================
    // 2. INHERITANCE SOURCE TYPES
    // =========================================================================

    var INHERITANCE_SOURCE = {
        NONE: 'none',
        PARENT: 'parent',
        SPOUSE: 'spouse'
    };

    // =========================================================================
    // 3. NUMBERING GROUP TYPES
    // =========================================================================

    var NUMBERING_GROUP = {
        GLOBAL: 'global',       // Global numbering (old style)
        PARENT: 'parent',       // Numbered by parent (children of same parent)
        SPOUSE: 'spouse',       // Numbered by spouse (spouses of same person)
        SOURCE: 'source'        // Numbered by the source rank holder
    };

    // =========================================================================
    // 4. AVAILABLE SYMBOLS (FULL LIST - 60+ SYMBOLS)
    // =========================================================================

    var AVAILABLE_SYMBOLS = [
        // Level symbols (5)
        '◉', '◧', '◈', '⟡', '⌂',
        // Star variants (8)
        '✦', '✧', '✪', '✴', '✺', '✵', '🟊', '⚝',
        // Circle variants (12)
        '◍', '◯', '⊙', '◐', '◑', '◒', '◓', '◖', '◗', '◎', '◉', '◍',
        // Dot variants (8)
        '⨀', '⚬', '⊕', '⚲', '⌾', '⫷', '⟁', '⟐',
        // Shape variants (8)
        '▲', '▽', '■', '▣', '⬔', '⬖', '⎔', '⌇',
        // Decorative (8)
        '⌘', '❖', '☯', '⚜', '✠', 'ⴾ', '⦚', '⳩',
        // Rare symbols (6)
        '𐃏', '⛤', 'ᨒ', '꤮', '𑁍', '𖦹',
        // Celestial (5)
        '⚴', '⚷', '⚳', '☉', '☾', '☋'
    ];

    // =========================================================================
    // 5. DEFAULT RANK
    // =========================================================================

    var DEFAULT_RANK = {
        id: null,
        name: "New Rank",
        priority: 5,
        numbered: false,
        numberingType: 'ordinal',           // 'ordinal' (1st, 2nd) or 'roman' (I, II)
        numberingGroup: 'global',           // 'global', 'parent', 'spouse', 'source'
        sourceRankId: null,                 // Rank ID this rank is inherited from
        inheritanceSource: 'none',          // 'none', 'parent', 'spouse'
        symbol: '⟡',
        genderRestriction: 'either',
        locationTypeId: null,
        deprecateOnDeath: false,
        spouseInheritance: null,            // Legacy - kept for backward compatibility
        allowsMultipleSpouses: false,
        parentRankId: null,
        customSurnameRule: false,
        surnameConnector: 'of',
        surnamePrefix: '',
        surnameSuffix: '',
        createdAt: null,
        updatedAt: null
    };

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.RANK_LEVELS = RANK_LEVELS;
    window.AVAILABLE_SYMBOLS = AVAILABLE_SYMBOLS;
    window.DEFAULT_RANK = DEFAULT_RANK;
    window.INHERITANCE_SOURCE = INHERITANCE_SOURCE;
    window.NUMBERING_GROUP = NUMBERING_GROUP;

    // RankConstants container
    window.RankConstants = {
        RANK_LEVELS: RANK_LEVELS,
        AVAILABLE_SYMBOLS: AVAILABLE_SYMBOLS,
        DEFAULT_RANK: DEFAULT_RANK,
        INHERITANCE_SOURCE: INHERITANCE_SOURCE,
        NUMBERING_GROUP: NUMBERING_GROUP
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            RANK_LEVELS: RANK_LEVELS,
            AVAILABLE_SYMBOLS: AVAILABLE_SYMBOLS,
            DEFAULT_RANK: DEFAULT_RANK,
            INHERITANCE_SOURCE: INHERITANCE_SOURCE,
            NUMBERING_GROUP: NUMBERING_GROUP,
            RankConstants: {
                RANK_LEVELS: RANK_LEVELS,
                AVAILABLE_SYMBOLS: AVAILABLE_SYMBOLS,
                DEFAULT_RANK: DEFAULT_RANK,
                INHERITANCE_SOURCE: INHERITANCE_SOURCE,
                NUMBERING_GROUP: NUMBERING_GROUP
            }
        };
    }

})();