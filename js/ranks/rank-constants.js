/**
 * =============================================================================
 * STILL WATERS - RANK CONSTANTS (rank-constants.js)
 * =============================================================================
 *
 * LOCATION: js/ranks/rank-constants.js
 *
 * Pure vocabulary and default shape for the rank domain.
 *
 * This file:
 *   - declares the level vocabulary (priority -> name, description)
 *   - declares the available rank symbol set
 *   - declares the numbering type, numbering group, and inheritance source
 *     vocabularies
 *   - declares the DEFAULT_RANK shape used by RankState and RankRules
 *   - validates its own internal consistency at load time
 *
 * This file does NOT:
 *   - contain any logic beyond the load-time check
 *   - depend on any other module
 *   - own level icons. icons.js owns those; RankQueries.getRankLevelIcon
 *     routes to window.getRankLevelIcon(priority) and returns SVG.
 *   - contain emojis. Symbols are Unicode typography only.
 *
 * ICON POLICY:
 *   There is no level icon field on RANK_LEVELS entries. Level icons are
 *   SVG markup produced by icons.js, retrieved via
 *   RankQueries.getRankLevelIcon(priority). The old Unicode glyph field
 *   was removed because it was never read by the refactored code and
 *   duplicated a concern that belongs to icons.js.
 *
 *   AVAILABLE_SYMBOLS contains Unicode typography (geometric shapes,
 *   astronomical symbols, and letterlike glyphs). It does NOT contain
 *   emoji. The load-time check enforces this.
 *
 * DEPENDENCIES: None.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. RANK LEVELS
    // =========================================================================
    //
    // Priority 1 = highest. Priority 5 = lowest.
    //
    // The name and description are the canonical display strings returned by
    // RankQueries.getRankLevelName and getRankLevelDescription.
    //
    // There is no icon field. Level icons are produced by icons.js via
    // window.getRankLevelIcon(priority) and exposed through
    // RankQueries.getRankLevelIcon.

    var RANK_LEVELS = Object.freeze({
        1: Object.freeze({
            name: 'Sovereign',
            description: 'Highest level — rulers, monarchs, emperors'
        }),
        2: Object.freeze({
            name: 'High Noble',
            description: 'Dukes, princes, high lords'
        }),
        3: Object.freeze({
            name: 'Noble',
            description: 'Counts, earls, barons'
        }),
        4: Object.freeze({
            name: 'Gentry',
            description: 'Knights, esquires, landed gentry'
        }),
        5: Object.freeze({
            name: 'Commoner',
            description: 'Merchants, artisans, peasants'
        })
    });

    // =========================================================================
    // 2. INHERITANCE SOURCE VOCABULARY
    // =========================================================================

    var INHERITANCE_SOURCE = Object.freeze({
        NONE:   'none',
        PARENT: 'parent',
        SPOUSE: 'spouse'
    });

    // =========================================================================
    // 3. NUMBERING VOCABULARY
    // =========================================================================

    var NUMBERING_TYPE = Object.freeze({
        REIGN:   'reign',    // Henry VIII style (roman numerals, ordered by reign)
        ORDINAL: 'ordinal',  // 1st, 2nd, 3rd
        ROMAN:   'roman'     // I, II, III
    });

    var NUMBERING_GROUP = Object.freeze({
        GLOBAL: 'global',   // all holders share one sequence
        PARENT: 'parent',   // grouped by parent character
        SPOUSE: 'spouse',   // grouped by spouse character
        SOURCE: 'source'    // grouped by inheritance source character
    });

    // =========================================================================
    // 4. AVAILABLE SYMBOLS
    // =========================================================================
    //
    // Unicode typography only. No emoji. The load-time check enforces this.
    //
    // The set is displayed verbatim in the create/edit modal symbol picker.
    // Rank symbols are user data: a rank record carries its chosen symbol,
    // and the UI displays it as-is.

    var AVAILABLE_SYMBOLS = Object.freeze([
        // Level glyphs (5)
        '◉', '◧', '◈', '⟡', '⌂',
        // Star variants (7) — the emoji-block "light four pointed black star"
        // (U+1F7CA) was removed because it renders as emoji on some platforms
        '✦', '✧', '✪', '✴', '✺', '✵', '⚝',
        // Circle variants (12)
        '◍', '◯', '⊙', '◐', '◑', '◒', '◓', '◖', '◗', '◎',
        // Dot variants (8)
        '⨀', '⚬', '⊕', '⚲', '⌾', '⫷', '⟁', '⟐',
        // Shape variants (8)
        '▲', '▽', '■', '▣', '⬔', '⬖', '⎔', '⌇',
        // Decorative (8)
        '⌘', '❖', '☯', '⚜', '✠', 'ⴾ', '⦚', '⳩',
        // Rare glyphs (6) — these are letterlike and symbol-block characters,
        // not emoji
        '𐃏', '⛤', 'ᨒ', '꤮', '𑁍', '𖦹',
        // Celestial (6)
        '⚴', '⚷', '⚳', '☉', '☾', '☋'
    ]);

    // =========================================================================
    // 5. DEFAULT RANK
    // =========================================================================
    //
    // The canonical shape a new rank record has immediately after
    // RankRules.applyDefaults. RankState._normaliseRank produces the same
    // field set.
    //
    // This is not the shape a rank has *at creation time* — RankCommands
    // additionally stamps id, createdAt, and updatedAt.
    //
    // spouseInheritance is a legacy field. New code uses sourceRankId with
    // inheritanceSource === 'spouse'. The field is retained for compatibility
    // with rank records created before the refactor; the refactored code reads
    // it as a fallback in RankQueries and RankIssues.

    var DEFAULT_RANK = Object.freeze({
        // Identity
        id: null,
        name: 'New Rank',

        // Level
        priority: 4,

        // Numbering
        numbered: false,
        numberingType: 'reign',
        numberingGroup: 'global',
        numberingPrefix: '',
        numberingSuffix: '',

        // Inheritance
        sourceRankId: null,
        inheritanceSource: 'none',
        spouseInheritance: null,          // legacy; prefer sourceRankId

        // Presentation
        symbol: '⟡',

        // Restrictions
        genderRestriction: 'either',
        locationTypeId: null,

        // Lifecycle
        deprecateOnDeath: false,
        allowsMultipleSpouses: false,

        // Hierarchy
        parentRankId: null,

        // Surname rule
        customSurnameRule: false,
        surnameConnector: 'of',
        surnamePrefix: '',
        surnameSuffix: '',

        // Metadata
        createdAt: null,
        updatedAt: null
    });

    // =========================================================================
    // 6. LOAD-TIME CONSISTENCY CHECK
    // =========================================================================
    //
    // Any drift between the vocabularies and the code that reads them throws
    // here, at load time, instead of producing mysterious behaviour later.

    (function _validate() {
        // Priorities must be integers 1..10.
        var priorityKeys = Object.keys(RANK_LEVELS);
        for (var i = 0; i < priorityKeys.length; i++) {
            var p = parseInt(priorityKeys[i], 10);
            if (!Number.isInteger(p) || p < 1 || p > 10) {
                throw new Error(
                    'rank-constants.js: RANK_LEVELS has invalid priority "' +
                    priorityKeys[i] + '"'
                );
            }
            var lvl = RANK_LEVELS[priorityKeys[i]];
            if (typeof lvl.name !== 'string' || lvl.name.length === 0) {
                throw new Error(
                    'rank-constants.js: RANK_LEVELS[' + priorityKeys[i] +
                    '] has no name'
                );
            }
            if (typeof lvl.description !== 'string') {
                throw new Error(
                    'rank-constants.js: RANK_LEVELS[' + priorityKeys[i] +
                    '] has no description'
                );
            }
        }

        // Priority 1 must be the highest (lowest numeric value).
        if (!RANK_LEVELS[1] || !RANK_LEVELS[5]) {
            throw new Error(
                'rank-constants.js: RANK_LEVELS must define priorities 1 and 5'
            );
        }

        // Symbols must be non-empty strings, unique, and emoji-free.
        if (!Array.isArray(AVAILABLE_SYMBOLS) || AVAILABLE_SYMBOLS.length === 0) {
            throw new Error('rank-constants.js: AVAILABLE_SYMBOLS must be non-empty.');
        }
        var symbolSeen = {};
        for (var s = 0; s < AVAILABLE_SYMBOLS.length; s++) {
            var sym = AVAILABLE_SYMBOLS[s];
            if (typeof sym !== 'string' || sym.length === 0) {
                throw new Error(
                    'rank-constants.js: AVAILABLE_SYMBOLS[' + s + '] is empty.'
                );
            }
            if (symbolSeen[sym]) {
                throw new Error(
                    'rank-constants.js: duplicate symbol "' + sym +
                    '" in AVAILABLE_SYMBOLS.'
                );
            }
            symbolSeen[sym] = true;
            if (_looksLikeEmoji(sym)) {
                throw new Error(
                    'rank-constants.js: AVAILABLE_SYMBOLS[' + s + '] ("' + sym +
                    '") contains an emoji code point. Icon policy bans emoji.'
                );
            }
        }

        // Numbering type and group vocabularies must agree with what
        // RankRules.validate accepts.
        var validTypes = _values(NUMBERING_TYPE);
        var expectedTypes = ['reign', 'ordinal', 'roman'];
        if (!_arrayEqualsAsSets(validTypes, expectedTypes)) {
            throw new Error(
                'rank-constants.js: NUMBERING_TYPE must be exactly ' +
                expectedTypes.join(', ')
            );
        }
        var validGroups = _values(NUMBERING_GROUP);
        var expectedGroups = ['global', 'parent', 'spouse', 'source'];
        if (!_arrayEqualsAsSets(validGroups, expectedGroups)) {
            throw new Error(
                'rank-constants.js: NUMBERING_GROUP must be exactly ' +
                expectedGroups.join(', ')
            );
        }
        var validSources = _values(INHERITANCE_SOURCE);
        var expectedSources = ['none', 'parent', 'spouse'];
        if (!_arrayEqualsAsSets(validSources, expectedSources)) {
            throw new Error(
                'rank-constants.js: INHERITANCE_SOURCE must be exactly ' +
                expectedSources.join(', ')
            );
        }

        // DEFAULT_RANK coherence.
        if (DEFAULT_RANK.numberingType !== NUMBERING_TYPE.REIGN) {
            throw new Error(
                'rank-constants.js: DEFAULT_RANK.numberingType must be "' +
                NUMBERING_TYPE.REIGN + '".'
            );
        }
        if (DEFAULT_RANK.numberingGroup !== NUMBERING_GROUP.GLOBAL) {
            throw new Error(
                'rank-constants.js: DEFAULT_RANK.numberingGroup must be "' +
                NUMBERING_GROUP.GLOBAL + '".'
            );
        }
        if (DEFAULT_RANK.inheritanceSource !== INHERITANCE_SOURCE.NONE) {
            throw new Error(
                'rank-constants.js: DEFAULT_RANK.inheritanceSource must be "' +
                INHERITANCE_SOURCE.NONE + '".'
            );
        }
        if (DEFAULT_RANK.sourceRankId !== null) {
            throw new Error(
                'rank-constants.js: DEFAULT_RANK.sourceRankId must be null.'
            );
        }
        if (DEFAULT_RANK.parentRankId !== null) {
            throw new Error(
                'rank-constants.js: DEFAULT_RANK.parentRankId must be null.'
            );
        }
        if (typeof DEFAULT_RANK.priority !== 'number'
            || DEFAULT_RANK.priority < 1
            || DEFAULT_RANK.priority > 10) {
            throw new Error(
                'rank-constants.js: DEFAULT_RANK.priority must be 1..10.'
            );
        }
        if (!symbolSeen[DEFAULT_RANK.symbol]) {
            throw new Error(
                'rank-constants.js: DEFAULT_RANK.symbol "' +
                DEFAULT_RANK.symbol + '" is not in AVAILABLE_SYMBOLS.'
            );
        }
    })();

    // =========================================================================
    // 7. INTERNAL VALIDATION HELPERS
    // =========================================================================

    /**
     * Returns true if the string contains any code point that renders as an
     * emoji on standard platforms.
     *
     * The check targets:
     *   - The Miscellaneous Symbols and Pictographs block (U+1F300..U+1F5FF)
     *   - The Emoticons block (U+1F600..U+1F64F)
     *   - The Transport and Map Symbols block (U+1F680..U+1F6FF)
     *   - The Supplemental Symbols and Pictographs block (U+1F900..U+1F9FF)
     *   - The Symbols and Pictographs Extended-A block (U+1FA70..U+1FAFF)
     *   - The Enclosed Alphanumeric Supplement (U+1F100..U+1F1FF) and
     *     Enclosed Ideographic Supplement (U+1F200..U+1F2FF)
     *   - Regional indicator symbols (U+1F1E6..U+1F1FF)
     *   - The variation selector U+FE0F
     *   - Zero-width joiner U+200D (emoji sequences use it)
     *   - Skin tone modifiers (U+1F3FB..U+1F3FF)
     *
     * The list is deliberately conservative. Letterlike symbols, geometric
     * shapes, dingbats outside the emoji range, and monochrome typography
     * are allowed.
     */
    function _looksLikeEmoji(str) {
        if (typeof str !== 'string' || str.length === 0) return false;
        for (var i = 0; i < str.length; i++) {
            var cp = str.codePointAt(i);
            if (cp > 0xFFFF) {
                i++;
            }
            if (_isEmojiCodePoint(cp)) return true;
        }
        return false;
    }

    function _isEmojiCodePoint(cp) {
        // Regional indicators (flags)
        if (cp >= 0x1F1E6 && cp <= 0x1F1FF) return true;
        // Enclosed Alphanumeric Supplement and Enclosed Ideographic Supplement
        if (cp >= 0x1F100 && cp <= 0x1F2FF) return true;
        // Miscellaneous Symbols and Pictographs
        if (cp >= 0x1F300 && cp <= 0x1F5FF) return true;
        // Emoticons
        if (cp >= 0x1F600 && cp <= 0x1F64F) return true;
        // Transport and Map Symbols
        if (cp >= 0x1F680 && cp <= 0x1F6FF) return true;
        // Supplemental Symbols and Pictographs
        if (cp >= 0x1F900 && cp <= 0x1F9FF) return true;
        // Symbols and Pictographs Extended-A
        if (cp >= 0x1FA70 && cp <= 0x1FAFF) return true;
        // Presentation selector (turns a base character into an emoji)
        if (cp === 0xFE0F) return true;
        // Zero-width joiner
        if (cp === 0x200D) return true;
        // Skin tone modifiers
        if (cp >= 0x1F3FB && cp <= 0x1F3FF) return true;
        return false;
    }

    function _values(frozenEnum) {
        var out = [];
        for (var key in frozenEnum) {
            if (Object.prototype.hasOwnProperty.call(frozenEnum, key)) {
                out.push(frozenEnum[key]);
            }
        }
        return out;
    }

    function _arrayEqualsAsSets(a, b) {
        if (a.length !== b.length) return false;
        var seen = {};
        for (var i = 0; i < a.length; i++) seen[a[i]] = true;
        for (var j = 0; j < b.length; j++) {
            if (!seen[b[j]]) return false;
        }
        return true;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.RANK_LEVELS = RANK_LEVELS;
    window.AVAILABLE_SYMBOLS = AVAILABLE_SYMBOLS;
    window.DEFAULT_RANK = DEFAULT_RANK;
    window.INHERITANCE_SOURCE = INHERITANCE_SOURCE;
    window.NUMBERING_TYPE = NUMBERING_TYPE;
    window.NUMBERING_GROUP = NUMBERING_GROUP;

    // RankConstants container.
    window.RankConstants = {
        RANK_LEVELS: RANK_LEVELS,
        AVAILABLE_SYMBOLS: AVAILABLE_SYMBOLS,
        DEFAULT_RANK: DEFAULT_RANK,
        INHERITANCE_SOURCE: INHERITANCE_SOURCE,
        NUMBERING_TYPE: NUMBERING_TYPE,
        NUMBERING_GROUP: NUMBERING_GROUP
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RankConstants;
    }
})();
