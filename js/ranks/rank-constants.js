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
    // 2. AVAILABLE SYMBOLS (FULL LIST - 50+ SYMBOLS)
    // =========================================================================

    // DO NOT MODIFY THIS ARRAY - KEEP AS IS
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

    // Total: 60+ symbols

    // =========================================================================
    // 3. DEFAULT RANK
    // =========================================================================

    var DEFAULT_RANK = {
        id: null,
        name: "New Rank",
        priority: 5,
        numbered: false,
        numberingType: 'reign',
        numberingPrefix: '',
        numberingSuffix: '',
        symbol: '⟡',
        genderRestriction: 'either',
        locationTypeId: null,
        deprecateOnDeath: false,
        spouseInheritance: null,
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
    // 4. EXPORTS
    // =========================================================================

    window.RANK_LEVELS = RANK_LEVELS;
    window.AVAILABLE_SYMBOLS = AVAILABLE_SYMBOLS;
    window.DEFAULT_RANK = DEFAULT_RANK;

    // RankConstants container
    window.RankConstants = {
        RANK_LEVELS: RANK_LEVELS,
        AVAILABLE_SYMBOLS: AVAILABLE_SYMBOLS,
        DEFAULT_RANK: DEFAULT_RANK
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            RANK_LEVELS: RANK_LEVELS,
            AVAILABLE_SYMBOLS: AVAILABLE_SYMBOLS,
            DEFAULT_RANK: DEFAULT_RANK,
            RankConstants: {
                RANK_LEVELS: RANK_LEVELS,
                AVAILABLE_SYMBOLS: AVAILABLE_SYMBOLS,
                DEFAULT_RANK: DEFAULT_RANK
            }
        };
    }

})();