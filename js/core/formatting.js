/**
 * =============================================================================
 * STILL WATERS - FORMATTING UTILITIES (formatting.js)
 * =============================================================================
 * 
 * LOCATION: js/core/formatting.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for:
 *   - HTML escaping
 *   - Year formatting
 *   - Name formatting (given resolved data)
 *   - Title formatting
 *   - Dynasty/lineage labels
 *   - Age formatting (given a computed age)
 *   - Date range formatting
 *   - List formatting
 *   - Population/number formatting
 *   - String utilities
 * 
 * SCOPE RULE:
 *   Formatting functions take ALREADY-RESOLVED data. They do not:
 *   - call accessors
 *   - traverse hierarchies
 *   - compute ages from birth years
 *   - resolve IDs to entities
 *   - decide which icon to show
 * 
 * The caller resolves. The formatter formats.
 * 
 * DEPENDENCIES: None. Pure string manipulation.
 * 
 * ICON POLICY: No emojis. No icons. Return plain text.
 * The caller composes icons around the returned string.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. HTML ESCAPING — CANONICAL
// =============================================================================

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {*} str - Any value; coerced to string
 * @returns {string}
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Alias for escapeHtml — kept for internal use.
 * @deprecated Use escapeHtml directly.
 */
function _escapeHtml(str) {
    return escapeHtml(str);
}

/**
 * Escapes HTML and converts \n to <br>.
 * @param {string} str
 * @returns {string}
 */
function escapeHtmlWithBreaks(str) {
    if (!str) return '';
    return escapeHtml(str).replace(/\n/g, '<br>');
}

// =============================================================================
// 2. YEAR FORMATTING
// =============================================================================

/**
 * Formats a year for display.
 * Year 0 is rendered as '0' unless useAsteriskForZero is true.
 * @param {number|null} year
 * @param {boolean} useAsteriskForZero - default false
 * @returns {string}
 */
function formatYear(year, useAsteriskForZero) {
    useAsteriskForZero = useAsteriskForZero === true;
    if (year === null || year === undefined) return '?';
    if (typeof year !== 'number') return '?';
    if (!Number.isFinite(year)) return '?';
    if (!Number.isInteger(year)) return '?';
    if (year === 0) return useAsteriskForZero ? '*' : '0';
    if (year < 0) return Math.abs(year) + ' BC';
    return String(year);
}

/**
 * Formats a year range.
 * @param {number|null} startYear
 * @param {number|null} endYear
 * @param {string} separator - default '–'
 * @returns {string}
 */
function formatYearRange(startYear, endYear, separator) {
    separator = separator || '–';
    var start = formatYear(startYear);
    var end = formatYear(endYear);

    if (start === '?' && end === '?') return 'Unknown';
    if (start === '?') return 'Until ' + end;
    if (end === '?') return 'From ' + start;

    var isStartBC = typeof startYear === 'number' && startYear < 0;
    var isEndBC = typeof endYear === 'number' && endYear < 0;

    if (isStartBC && isEndBC && startYear !== endYear) {
        return Math.abs(startYear) + separator + Math.abs(endYear) + ' BC';
    }
    return start + ' ' + separator + ' ' + end;
}

// =============================================================================
// 3. NAME FORMATTING
// =============================================================================

/**
 * Formats a character's full name.
 * Caller passes the character object; formatter does not resolve IDs.
 * @param {Object|null} char - Character object
 * @returns {string}
 */
function formatCharacterName(char) {
    if (!char || typeof char !== 'object') return 'Unknown';
    var name = char.name || '?';
    return char.surname ? name + ' ' + char.surname : name;
}

/**
 * Formats a character name with a pre-resolved rank prefix.
 * @param {Object} char
 * @param {string|null} rankDisplay - Pre-formatted rank string (e.g. "King")
 * @returns {string}
 */
function formatCharacterNameWithRank(char, rankDisplay) {
    if (!char) return 'Unknown';
    var name = formatCharacterName(char);
    return rankDisplay ? rankDisplay + ' ' + name : name;
}

/**
 * Formats a character name with a gender symbol.
 * Symbol is passed in — formatter does not know about icons.
 * @param {Object} char
 * @param {string} symbol - e.g. '♂', '♀', '⚥'
 * @returns {string}
 */
function formatCharacterNameWithGender(char, symbol) {
    if (!char) return 'Unknown';
    var name = formatCharacterName(char);
    return symbol ? symbol + ' ' + name : name;
}

/**
 * Formats a character name with a pre-computed age.
 * @param {Object} char
 * @param {number|null} age - Computed by caller (time.js)
 * @returns {string}
 */
function formatCharacterNameWithAge(char, age) {
    var name = formatCharacterName(char);
    return name + ' (' + formatAge(age) + ')';
}

// =============================================================================
// 4. TITLE FORMATTING
// =============================================================================

/**
 * Roman numerals for numbers 1..20. Shared by formatTitle and formatSuccessionNumber.
 * @private
 */
var _ROMAN_NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
                       'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

/**
 * Formats a number as a Roman numeral for succession (up to XX).
 * Returns the number as a string beyond the supported range.
 * @param {number} number
 * @returns {string}
 */
function formatRomanNumeral(number) {
    if (typeof number !== 'number' || !Number.isFinite(number)) return '';
    if (!Number.isInteger(number) || number < 1) return '';
    if (number <= 20) return _ROMAN_NUMERALS[number];
    return String(number);
}

/**
 * Formats a title from a rank and optional ordinal.
 * Symbol is passed in (already chosen by the caller); formatter only composes.
 * @param {Object} rank - { name }
 * @param {string|null} symbol - Pre-resolved symbol
 * @param {number|null} number - Ordinal
 * @returns {string}
 */
function formatTitle(rank, symbol, number) {
    if (!rank) return '';
    var parts = [];
    if (symbol) parts.push(symbol);
    if (rank.name) parts.push(rank.name);
    if (number !== null && number !== undefined && number >= 1) {
        parts.push(formatRomanNumeral(number));
    }
    return parts.join(' ');
}

/**
 * Formats a comma-separated list of pre-resolved titles.
 * Caller resolves rank objects and ordinals before calling.
 * @param {Array<{name: string, symbol: string|null, number: number|null}>} titles
 * @returns {string}
 */
function formatCharacterTitles(titles) {
    if (!Array.isArray(titles) || titles.length === 0) return '';
    var out = [];
    for (var i = 0; i < titles.length; i++) {
        out.push(formatTitle(titles[i].rank, titles[i].symbol, titles[i].number));
    }
    return out.join(', ');
}

// =============================================================================
// 5. DYNASTY / LINEAGE LABELS
// =============================================================================

/**
 * Formats a dynasty/house name with prefix.
 * @param {string} houseName
 * @param {string} prefix - default 'House of '
 * @returns {string}
 */
function formatDynasty(houseName, prefix) {
    if (!houseName) return '';
    prefix = prefix === undefined ? 'House of ' : prefix;
    return prefix + houseName;
}

/**
 * Formats a succession number as a Roman numeral.
 * @param {number} number
 * @returns {string}
 */
function formatSuccessionNumber(number) {
    return formatRomanNumeral(number);
}

// =============================================================================
// 6. RELATIONSHIP LABELS
// =============================================================================

/**
 * Formats a relationship status. Returns plain text; the caller composes icons.
 * @param {string} status
 * @returns {string}
 */
function formatRelationshipStatus(status) {
    switch (status) {
        case 'ongoing': return 'Ongoing';
        case 'active': return 'Active';
        case 'ended': return 'Ended';
        case 'widowed': return 'Widowed';
        case 'pending': return 'Pending';
        case 'proposed': return 'Proposed';
        case 'declined': return 'Declined';
        default: return status || 'Unknown';
    }
}

/**
 * Formats a relationship type. Plain text.
 * @param {string} type
 * @returns {string}
 */
function formatRelationshipType(type) {
    switch (type) {
        case 'casual': return 'Casual';
        case 'serious': return 'Serious';
        case 'affair': return 'Affair';
        case 'betrothed': return 'Betrothed';
        case 'polygamous': return 'Polygamous';
        case 'marriage': return 'Marriage';
        case 'committed': return 'Committed';
        case 'romance': return 'Romance';
        default: return type || 'Unknown';
    }
}

/**
 * Formats a friendship description from pre-parsed details.
 * @param {Object} details - { startYear, notes }
 * @param {number} currentYear
 * @returns {string}
 */
function formatFriendship(details, currentYear) {
    if (!details) return '';
    var parts = [];
    if (details.startYear != null) {
        var years = currentYear - details.startYear;
        if (years >= 0) {
            parts.push('Friends since ' + details.startYear + ' (' + years + ' years)');
        } else {
            parts.push('Friends since ' + details.startYear);
        }
    }
    if (details.notes) parts.push(details.notes);
    return parts.join(' · ');
}

// =============================================================================
// 7. LOCATION FORMATTING
// =============================================================================

/**
 * Formats a pre-resolved hierarchy array as a breadcrumb.
 * @param {Array<{displayName: string}>} hierarchy - Resolved place chain (root → leaf)
 * @param {string} separator - default ' → '
 * @returns {string}
 */
function formatLocationHierarchy(hierarchy, separator) {
    separator = separator || ' → ';
    if (!Array.isArray(hierarchy) || hierarchy.length === 0) return '';
    var names = [];
    for (var i = 0; i < hierarchy.length; i++) {
        if (hierarchy[i] && hierarchy[i].displayName) {
            names.push(hierarchy[i].displayName);
        }
    }
    return names.join(separator);
}

/**
 * Formats a location type with its priority level.
 * @param {Object} type - { displayName, priority }
 * @returns {string}
 */
function formatLocationType(type) {
    if (!type) return 'Unknown';
    var name = type.displayName || 'Unknown';
    if (type.priority != null) return name + ' (Lvl ' + type.priority + ')';
    return name;
}

/**
 * Formats a population count.
 * @param {number} population
 * @returns {string}
 */
function formatPopulation(population) {
    if (population === undefined || population === null) return '?';
    if (typeof population !== 'number' || !Number.isFinite(population)) return '?';
    if (population < 0) return '?';
    if (population >= 1000000) return (population / 1000000).toFixed(1) + 'M';
    if (population >= 10000) return Math.round(population / 1000) + 'k';
    if (population >= 1000) {
        var k = (population / 1000).toFixed(1);
        return k.replace(/\.0$/, '') + 'k';
    }
    return population.toLocaleString();
}

// =============================================================================
// 8. AGE FORMATTING
// =============================================================================

/**
 * Formats a pre-computed age.
 * @param {number|null} age
 * @returns {string}
 */
function formatAge(age) {
    if (age === null || age === undefined) return 'Unknown';
    if (typeof age !== 'number' || !Number.isFinite(age)) return 'Unknown';
    if (age < 0) return 'Unknown';
    if (age === 0) return '<1 year';
    if (age === 1) return '1 year';
    return age + ' years';
}

/**
 * Formats an age range.
 * @param {number|null} minAge
 * @param {number|null} maxAge
 * @returns {string}
 */
function formatAgeRange(minAge, maxAge) {
    var hasMin = minAge !== undefined && minAge !== null;
    var hasMax = maxAge !== undefined && maxAge !== null;
    if (!hasMin && !hasMax) return 'Any age';
    if (hasMin && hasMax) {
        if (minAge === maxAge) return minAge + ' years';
        return minAge + '–' + maxAge + ' years';
    }
    if (hasMin) return minAge + '+ years';
    return 'Up to ' + maxAge + ' years';
}

// =============================================================================
// 9. DATE RANGE FORMATTING
// =============================================================================

/**
 * Formats a reign/tenure date range.
 * @param {number|null} startYear
 * @param {number|null} endYear
 * @param {boolean} isCurrent
 * @returns {string}
 */
function formatDateRange(startYear, endYear, isCurrent) {
    isCurrent = isCurrent === true;
    var start = formatYear(startYear);
    if (isCurrent) return start + ' – Present';
    return formatYearRange(startYear, endYear);
}

// =============================================================================
// 10. LIST FORMATTING
// =============================================================================

/**
 * Formats an array as a human-readable list.
 * @param {Array<string>} items
 * @param {string} conjunction - default 'and'
 * @returns {string}
 */
function formatList(items, conjunction) {
    conjunction = conjunction || 'and';
    if (!Array.isArray(items) || items.length === 0) return '';
    if (items.length === 1) return String(items[0]);
    if (items.length === 2) return items[0] + ' ' + conjunction + ' ' + items[1];
    var copy = items.slice();
    var last = copy.pop();
    return copy.join(', ') + ' ' + conjunction + ' ' + last;
}

/**
 * Formats a count with singular/plural label.
 * @param {number} count
 * @param {string} singular
 * @param {string} plural
 * @returns {string}
 */
function formatCount(count, singular, plural) {
    var label = count === 1 ? singular : plural;
    return count + ' ' + label;
}

// =============================================================================
// 11. GENDER LABELS (icons live in icons.js)
// =============================================================================

/**
 * Returns the label for a gender. No symbol — that's a UI concern.
 * @param {string} gender
 * @returns {string}
 */
function getGenderLabel(gender) {
    switch (gender) {
        case 'male': return 'Male';
        case 'female': return 'Female';
        case 'unknown': return 'Unknown';
        default: return 'Unknown';
    }
}

// =============================================================================
// 12. STRING UTILITIES
// =============================================================================

/**
 * Unicode-safe string truncation.
 * @param {string} str
 * @param {number} maxLength
 * @param {string} ellipsis - default '…'
 * @returns {string}
 */
function truncateString(str, maxLength, ellipsis) {
    ellipsis = ellipsis === undefined ? '…' : ellipsis;
    if (!str) return '';
    if (typeof maxLength !== 'number' || maxLength <= 0) return '';
    var chars = Array.from(str);
    if (chars.length <= maxLength) return str;
    var ellipsisChars = Array.from(ellipsis);
    if (ellipsisChars.length >= maxLength) {
        return ellipsisChars.slice(0, maxLength).join('');
    }
    return chars.slice(0, maxLength - ellipsisChars.length).join('') + ellipsis;
}

/**
 * Truncates a location name for display.
 * @param {string} locationName
 * @param {number} maxLength - default 25
 * @returns {string}
 */
function truncateLocation(locationName, maxLength) {
    maxLength = maxLength === undefined ? 25 : maxLength;
    return truncateString(locationName, maxLength);
}

// =============================================================================
// 13. ADDITIONAL UTILITIES
// =============================================================================

/**
 * Formats a percentage.
 * @param {number} value
 * @param {boolean} isDecimal - true if value is 0-1; default true
 * @param {number} decimals - default 1
 * @returns {string}
 */
function formatPercentage(value, isDecimal, decimals) {
    isDecimal = isDecimal !== false;
    decimals = decimals === undefined ? 1 : decimals;
    if (value === null || value === undefined) return '?';
    if (typeof value !== 'number' || !Number.isFinite(value)) return '?';
    var percent = isDecimal ? value * 100 : value;
    return percent.toFixed(decimals) + '%';
}

/**
 * Formats a duration in years.
 * @param {number} years
 * @returns {string}
 */
function formatDuration(years) {
    if (years === null || years === undefined) return '?';
    if (typeof years !== 'number' || !Number.isFinite(years)) return '?';
    if (years < 0) return 'Invalid';
    if (years === 0) return '<1 year';
    if (years === 1) return '1 year';
    if (years < 12) return years + ' years';
    var decades = Math.floor(years / 10);
    var remainder = years % 10;
    if (remainder === 0) return decades + (decades === 1 ? ' decade' : ' decades');
    return (years / 10).toFixed(1) + ' decades';
}

// =============================================================================
// 14. EXPORTS
// =============================================================================

// HTML escaping
window.escapeHtml = escapeHtml;
window._escapeHtml = _escapeHtml;
window.escapeHtmlWithBreaks = escapeHtmlWithBreaks;

// Years
window.formatYear = formatYear;
window.formatYearRange = formatYearRange;

// Names
window.formatCharacterName = formatCharacterName;
window.formatCharacterNameWithRank = formatCharacterNameWithRank;
window.formatCharacterNameWithGender = formatCharacterNameWithGender;
window.formatCharacterNameWithAge = formatCharacterNameWithAge;

// Titles
window.formatRomanNumeral = formatRomanNumeral;
window.formatTitle = formatTitle;
window.formatCharacterTitles = formatCharacterTitles;
window.formatSuccessionNumber = formatSuccessionNumber;

// Dynasty
window.formatDynasty = formatDynasty;

// Relationships
window.formatRelationshipStatus = formatRelationshipStatus;
window.formatRelationshipType = formatRelationshipType;
window.formatFriendship = formatFriendship;

// Locations
window.formatLocationHierarchy = formatLocationHierarchy;
window.formatLocationType = formatLocationType;
window.formatPopulation = formatPopulation;

// Age
window.formatAge = formatAge;
window.formatAgeRange = formatAgeRange;

// Date range
window.formatDateRange = formatDateRange;

// Lists
window.formatList = formatList;
window.formatCount = formatCount;

// Gender label (no symbol)
window.getGenderLabel = getGenderLabel;

// Strings
window.truncateString = truncateString;
window.truncateLocation = truncateLocation;

// Misc
window.formatPercentage = formatPercentage;
window.formatDuration = formatDuration;