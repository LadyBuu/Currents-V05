/**
 * =============================================================================
 * STILL WATERS - FORMATTING UTILITIES (formatting.js)
 * =============================================================================
 * 
 * LOCATION: js/core/formatting.js
 * 
 * This file contains ALL formatting functions including:
 * - HTML escaping
 * - Year formatting
 * - Name formatting (character names, full names)
 * - Title formatting (rank + name combinations)
 * - Dynasty/lineage labels
 * - Relationship description formatting
 * - Location hierarchy display
 * - Age formatting
 * - Date range formatting
 * - List formatting
 * 
 * PURPOSE: Consistent output formatting across all modules
 * 
 * DEPENDENCIES: None (pure formatting, standalone)
 * =============================================================================
 * EXPORTED FUNCTIONS (on window):
 * =============================================================================
 * 
 * HTML Escaping:
 *   - escapeHtml(str) - Escapes HTML special characters to prevent XSS
 *   - escapeHtmlWithBreaks(str) - Escapes HTML and converts \n to <br>
 * 
 * Year Formatting:
 *   - formatYear(year, useAsteriskForZero) - Formats year (e.g., "125", "50 BC", "*" for 0)
 *   - formatYearRange(startYear, endYear, separator) - Formats year range (e.g., "100–150")
 * 
 * Name Formatting:
 *   - formatCharacterName(char, getCharacterById) - Formats full name (e.g., "John Smith")
 *   - formatCharacterNameWithRank(char, getActiveRankDisplay) - Formats name with rank prefix
 *   - formatCharacterNameWithGender(char) - Formats name with gender symbol (♂ ♀ ⚥)
 *   - formatCharacterNameWithAge(char, age) - Formats name with age in parentheses
 * 
 * Title Formatting:
 *   - formatTitle(rank, number) - Formats title (e.g., "♔ King III")
 *   - formatCharacterTitles(char, rankAssignments, getRankById) - Formats comma-separated titles
 * 
 * Dynasty / Lineage Labels:
 *   - formatDynasty(houseName, prefix) - Formats dynasty name (e.g., "House of Tudor")
 *   - formatSuccessionNumber(number) - Converts number to Roman numeral (I, II, III...)
 * 
 * Relationship Formatting:
 *   - formatRelationshipStatus(status) - Formats status with emoji (❤️ Ongoing, 💔 Ended, † Widowed)
 *   - formatRelationshipType(type) - Formats type with emoji (💕 Serious, 💍 Betrothed, etc.)
 *   - formatFriendship(details, currentYear) - Formats friendship description with duration
 * 
 * Location Hierarchy Formatting:
 *   - formatLocationHierarchy(place, getPlaceById, getLocationTypeById) - Formats breadcrumb (e.g., "Kingdom → Duchy → County")
 *   - formatLocationType(type) - Formats location type with priority level
 *   - formatPopulation(population) - Formats population (e.g., "1,234", "1.2k", "1.5M")
 * 
 * Age Formatting:
 *   - formatAge(age) - Formats age (e.g., "25 years", "6 months", "2 days")
 *   - formatCharacterAge(char, currentYear) - Formats age with birth/death context
 *   - formatAgeRange(minAge, maxAge) - Formats age range (e.g., "18–35 years")
 * 
 * Date Range Formatting:
 *   - formatDateRange(startYear, endYear, isCurrent) - Formats reign/tenure range (e.g., "1200 – Present")
 * 
 * List Formatting:
 *   - formatList(items, conjunction) - Formats array as human-readable list (e.g., "A, B, and C")
 *   - formatCount(count, singular, plural) - Formats count with singular/plural (e.g., "5 characters")
 * 
 * Gender Formatting:
 *   - getGenderSymbol(gender) - Returns symbol (♂ for male, ♀ for female, ⚥ for other)
 *   - getGenderLabel(gender) - Returns label ("Male", "Female", "Unknown")
 * 
 * String Utilities:
 *   - truncateString(str, maxLength, ellipsis) - Unicode-safe truncation with ellipsis
 *   - truncateLocation(locationName, maxLength) - Truncates location name (default max 25)
 * 
 * Additional Utilities:
 *   - formatPercentage(value, isDecimal, decimals) - Formats percentage (e.g., "75.5%")
 *   - formatDuration(years) - Formats duration (e.g., "1 year", "2.5 decades")
 * 
 * =============================================================================
 */

// =============================================================================
// 1. HTML ESCAPING
// =============================================================================

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {*} str - Input string (converted to string if not already)
 * @returns {string} HTML-escaped string
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    // Handle non-string inputs gracefully
    const stringVal = String(str);
    return stringVal
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escapes HTML but preserves line breaks (converts \n to <br>)
 * @param {string} str - Input string
 * @returns {string} HTML-escaped string with line breaks
 */
function escapeHtmlWithBreaks(str) {
    if (!str) return '';
    return escapeHtml(str).replace(/\n/g, '<br>');
}

// =============================================================================
// 2. YEAR FORMATTING
// =============================================================================

/**
 * Formats a year for display
 * @param {number|null|undefined} year - Year to format
 * @param {boolean} useAsteriskForZero - If true, use '*' for year 0 (default false)
 * @returns {string} Formatted year string or '?' if invalid
 */
function formatYear(year, useAsteriskForZero = false) {
    if (year === null || year === undefined) return '?';
    if (typeof year !== 'number') return '?';
    if (isNaN(year)) return '?';
    
    if (year === 0) {
        return useAsteriskForZero ? '*' : '0';
    }
    if (year < 0) return `${Math.abs(year)} BC`;
    return year.toString();
}

/**
 * Formats a year range
 * @param {number|null} startYear - Start year
 * @param {number|null} endYear - End year
 * @param {string} separator - Separator (default: '–')
 * @returns {string} Formatted year range
 */
function formatYearRange(startYear, endYear, separator = '–') {
    const start = formatYear(startYear);
    const end = formatYear(endYear);
    
    if (start === '?' && end === '?') return 'Unknown';
    if (start === '?') return `Until ${end}`;
    if (end === '?') return `From ${start}`;
    
    // Handle BCE years specially to avoid confusion (e.g., "500 BC – 200 BC")
    const isStartBC = startYear < 0;
    const isEndBC = endYear < 0;
    
    if (isStartBC && isEndBC && startYear !== endYear) {
        // Both BCE, show as "500–200 BC" (more concise)
        return `${Math.abs(startYear)}–${Math.abs(endYear)} BC`;
    }
    
    return `${start} ${separator} ${end}`;
}

// =============================================================================
// 3. NAME FORMATTING
// =============================================================================

/**
 * Formats a character's full name
 * @param {Object|string} char - Character object or character ID string
 * @param {Function} getCharacterById - Optional resolver function (for ID lookup)
 * @returns {string} Formatted full name
 */
function formatCharacterName(char, getCharacterById = null) {
    // If we got an ID and have a resolver, fetch the character
    if (typeof char === 'string' && getCharacterById) {
        char = getCharacterById(char);
    }
    
    if (!char || typeof char !== 'object') return 'Unknown';
    
    const name = char.name || '?';
    const surname = char.surname || '';
    
    if (surname) {
        return `${name} ${surname}`;
    }
    return name;
}

/**
 * Formats a character's name with rank prefix
 * @param {Object} char - Character object
 * @param {Function} getActiveRankDisplay - Rank display resolver
 * @returns {string} Formatted name with rank
 */
function formatCharacterNameWithRank(char, getActiveRankDisplay = null) {
    if (!char) return 'Unknown';
    
    let rankPrefix = '';
    if (getActiveRankDisplay) {
        const rank = getActiveRankDisplay(char);
        if (rank && rank.display) {
            rankPrefix = `${rank.display} `;
        }
    }
    
    return `${rankPrefix}${formatCharacterName(char)}`;
}

/**
 * Formats a character's name with gender symbol
 * @param {Object} char - Character object
 * @returns {string} Formatted name with gender symbol
 */
function formatCharacterNameWithGender(char) {
    if (!char) return 'Unknown';
    
    const name = formatCharacterName(char);
    const genderSymbol = getGenderSymbol(char.gender);
    
    return `${genderSymbol} ${name}`;
}

/**
 * Formats a character's name with age
 * @param {Object} char - Character object
 * @param {number} age - Character age
 * @returns {string} Formatted name with age
 */
function formatCharacterNameWithAge(char, age) {
    const name = formatCharacterName(char);
    const ageStr = formatAge(age);
    return `${name} (${ageStr})`;
}

// =============================================================================
// 4. TITLE FORMATTING
// =============================================================================

/**
 * Formats a title (rank + name combination)
 * @param {Object} rank - Rank object with symbol and name
 * @param {string|number} number - Optional rank number
 * @returns {string} Formatted title
 */
function formatTitle(rank, number = null) {
    if (!rank) return '';
    
    const symbol = rank.symbol || '';
    const name = rank.name || '';
    let numberStr = '';
    
    if (number) {
        if (typeof number === 'number' && number >= 1 && number <= 10) {
            const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
            numberStr = ` ${romanNumerals[number]}`;
        } else {
            numberStr = ` ${number}`;
        }
    }
    
    return `${symbol} ${name}${numberStr}`.trim();
}

/**
 * Formats a character's full title (all ranks)
 * @param {Object} char - Character object
 * @param {Array} rankAssignments - Character's rank assignments
 * @param {Function} getRankById - Rank resolver
 * @returns {string} Comma-separated list of ranks
 */
function formatCharacterTitles(char, rankAssignments, getRankById) {
    if (!rankAssignments || rankAssignments.length === 0) return '';
    
    const titles = [];
    for (const assignment of rankAssignments) {
        if (assignment.isDeprecated) continue;
        const rank = getRankById(assignment.rankId);
        if (rank) {
            titles.push(formatTitle(rank, assignment.number));
        }
    }
    
    return titles.join(', ');
}

// =============================================================================
// 5. DYNASTY / LINEAGE LABELS
// =============================================================================

/**
 * Formats a dynasty/house name
 * @param {string} houseName - House or dynasty name
 * @param {string} prefix - Prefix (default: 'House of ')
 * @returns {string} Formatted dynasty label
 */
function formatDynasty(houseName, prefix = 'House of ') {
    if (!houseName) return '';
    return `${prefix}${houseName}`;
}

/**
 * Formats a succession number as Roman numeral
 * @param {number} number - Succession number
 * @returns {string} Roman numeral or empty string
 */
function formatSuccessionNumber(number) {
    if (!number || number < 1) return '';
    
    // Roman numerals up to 20
    const romanNumerals = {
        1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V',
        6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X',
        11: 'XI', 12: 'XII', 13: 'XIII', 14: 'XIV', 15: 'XV',
        16: 'XVI', 17: 'XVII', 18: 'XVIII', 19: 'XIX', 20: 'XX'
    };
    
    if (number <= 20) {
        return romanNumerals[number];
    }
    return number.toString();
}

// =============================================================================
// 6. RELATIONSHIP FORMATTING
// =============================================================================

/**
 * Formats a relationship status
 * @param {string} status - Relationship status ('ongoing', 'ended', 'widowed')
 * @returns {string} Human-readable status
 */
function formatRelationshipStatus(status) {
    switch (status) {
        case 'ongoing': return '❤️ Ongoing';
        case 'ended': return '💔 Ended';
        case 'widowed': return '† Widowed';
        default: return status || 'Unknown';
    }
}

/**
 * Formats a relationship type
 * @param {string} type - Relationship type ('casual', 'serious', 'affair', 'betrothed', 'polygamous')
 * @returns {string} Human-readable type with emoji
 */
function formatRelationshipType(type) {
    switch (type) {
        case 'casual': return '💋 Casual';
        case 'serious': return '💕 Serious';
        case 'affair': return '🔒 Affair';
        case 'betrothed': return '💍 Betrothed';
        case 'polygamous': return '👥 Polygamous';
        case 'marriage': return '💒 Married';
        default: return type || 'Unknown';
    }
}

/**
 * Formats a friendship relation
 * @param {Object} details - Friendship details
 * @param {number} currentYear - Current world year
 * @returns {string} Formatted friendship description
 */
function formatFriendship(details, currentYear) {
    if (!details) return '';
    
    const parts = [];
    if (details.startYear) {
        const yearsAgo = currentYear - details.startYear;
        if (yearsAgo >= 0) {
            parts.push(`Friends since ${details.startYear} (${yearsAgo} years)`);
        } else {
            parts.push(`Friends since ${details.startYear} (future)`);
        }
    }
    if (details.notes) {
        parts.push(`📝 ${details.notes}`);
    }
    
    return parts.join(' · ');
}

// =============================================================================
// 7. LOCATION HIERARCHY FORMATTING
// =============================================================================

/**
 * Formats a location's hierarchy as a breadcrumb
 * @param {Object} place - Place object
 * @param {Function} getPlaceById - Place resolver
 * @param {Function} getLocationTypeById - Location type resolver
 * @returns {string} Formatted hierarchy (e.g., "Kingdom → Duchy → County")
 */
function formatLocationHierarchy(place, getPlaceById, getLocationTypeById) {
    if (!place) return '';
    
    const hierarchy = [];
    let current = place;
    let safety = 0;
    const maxDepth = 20;
    
    while (current && safety < maxDepth) {
        hierarchy.unshift(current.displayName);
        if (!current.parentId) break;
        current = getPlaceById(current.parentId);
        if (!current) break;
        safety++;
    }
    
    return hierarchy.join(' → ');
}

/**
 * Formats a location type with priority
 * @param {Object} type - Location type object
 * @returns {string} Formatted location type
 */
function formatLocationType(type) {
    if (!type) return 'Unknown';
    return `${type.displayName} (Lvl ${type.priority})`;
}

/**
 * Formats a location's population count
 * @param {number} population - Population count
 * @returns {string} Formatted population (e.g., "1,234" or "1.2k")
 */
function formatPopulation(population) {
    if (population === undefined || population === null) return '?';
    if (typeof population !== 'number') return '?';
    if (population < 0) return '?';
    
    if (population >= 1_000_000) {
        return `${(population / 1_000_000).toFixed(1)}M`;
    }
    if (population >= 10_000) {
        return `${Math.round(population / 1000)}k`;
    }
    if (population >= 1000) {
        const formatted = (population / 1000).toFixed(1);
        // Remove .0 if present
        return `${formatted.replace(/\.0$/, '')}k`;
    }
    return population.toLocaleString();
}

// =============================================================================
// 8. AGE FORMATTING
// =============================================================================

/**
 * Formats an age with appropriate label
 * @param {number|null|undefined} age - Age in years
 * @returns {string} Formatted age (e.g., "25 years", "6 months", "2 days")
 */
function formatAge(age) {
    if (age === null || age === undefined) return '?';
    if (typeof age !== 'number' || isNaN(age)) return '?';
    
    if (age < 0) return 'Unborn (invalid)';
    if (age === 0) return '<1 year';
    if (age === 1) return '1 year';
    if (age < 12) return `${age} years`;  // Could add months for babies, but keep simple
    
    return `${age} years`;
}

/**
 * Formats a character's age with birth/death context
 * @param {Object} char - Character object
 * @param {number} currentYear - Current world year
 * @returns {string} Formatted age string
 */
function formatCharacterAge(char, currentYear) {
    if (!char || !char.birthYear) return 'Age unknown';
    
    if (char.isDeceased && char.deathYear) {
        const age = char.deathYear - char.birthYear;
        const ageStr = formatAge(age);
        return `Died at ${ageStr} (${formatYear(char.birthYear)}–${formatYear(char.deathYear)})`;
    }
    
    const age = currentYear - char.birthYear;
    const ageStr = formatAge(age);
    return `${ageStr} (b. ${formatYear(char.birthYear)})`;
}

/**
 * Formats an age range
 * @param {number|null|undefined} minAge - Minimum age
 * @param {number|null|undefined} maxAge - Maximum age
 * @returns {string} Formatted age range
 */
function formatAgeRange(minAge, maxAge) {
    const hasMin = minAge !== undefined && minAge !== null;
    const hasMax = maxAge !== undefined && maxAge !== null;
    
    if (!hasMin && !hasMax) return 'Any age';
    if (hasMin && hasMax) {
        if (minAge === maxAge) return `${minAge} years`;
        return `${minAge}–${maxAge} years`;
    }
    if (hasMin) return `${minAge}+ years`;
    return `Up to ${maxAge} years`;
}

// =============================================================================
// 9. DATE RANGE FORMATTING
// =============================================================================

/**
 * Formats a date range for reign/tenure
 * @param {number|null} startYear - Start year
 * @param {number|null} endYear - End year
 * @param {boolean} isCurrent - Whether this is the current term
 * @returns {string} Formatted date range
 */
function formatDateRange(startYear, endYear, isCurrent = false) {
    const start = formatYear(startYear);
    if (isCurrent) {
        return `${start} – Present`;
    }
    return formatYearRange(startYear, endYear);
}

// =============================================================================
// 10. LIST FORMATTING
// =============================================================================

/**
 * Formats an array of strings as a human-readable list
 * @param {Array} items - Array of strings (not modified)
 * @param {string} conjunction - Conjunction ('and' or 'or')
 * @returns {string} Formatted list (e.g., "A, B, and C")
 */
function formatList(items, conjunction = 'and') {
    if (!items || items.length === 0) return '';
    
    // Create a copy to avoid mutating the original
    const itemsCopy = [...items];
    
    if (itemsCopy.length === 1) return itemsCopy[0];
    if (itemsCopy.length === 2) return `${itemsCopy[0]} ${conjunction} ${itemsCopy[1]}`;
    
    const last = itemsCopy.pop();
    return `${itemsCopy.join(', ')} ${conjunction} ${last}`;
}

/**
 * Formats a count with a label (singular/plural)
 * @param {number} count - Count value
 * @param {string} singular - Singular label (e.g., "character")
 * @param {string} plural - Plural label (e.g., "characters")
 * @returns {string} Formatted count with label
 */
function formatCount(count, singular, plural) {
    const label = count === 1 ? singular : plural;
    return `${count} ${label}`;
}

// =============================================================================
// 11. GENDER SYMBOLS
// =============================================================================

/**
 * Gets the symbol for a gender
 * @param {string} gender - 'male', 'female', or other
 * @returns {string} Gender symbol (♂, ♀, ⚥)
 */
function getGenderSymbol(gender) {
    switch (gender) {
        case 'male': return '♂';
        case 'female': return '♀';
        default: return '⚥';
    }
}

/**
 * Gets the full gender label
 * @param {string} gender - 'male', 'female', or other
 * @returns {string} Gender label
 */
function getGenderLabel(gender) {
    switch (gender) {
        case 'male': return 'Male';
        case 'female': return 'Female';
        default: return 'Unknown';
    }
}

// =============================================================================
// 12. STRING TRUNCATION
// =============================================================================

/**
 * Truncates a string to a maximum length with ellipsis
 * Handles Unicode characters properly by using Array.from
 * @param {string} str - Input string
 * @param {number} maxLength - Maximum length before truncation
 * @param {string} ellipsis - Ellipsis character(s) (default: '…')
 * @returns {string} Truncated string
 */
function truncateString(str, maxLength, ellipsis = '…') {
    if (!str) return '';
    if (maxLength <= 0) return '';
    
    // Use Array.from to properly handle Unicode characters (including emojis)
    const chars = Array.from(str);
    const ellipsisChars = Array.from(ellipsis);
    
    if (chars.length <= maxLength) return str;
    
    const truncated = chars.slice(0, maxLength - ellipsisChars.length);
    return truncated.join('') + ellipsis;
}

/**
 * Truncates a location name for display in limited space
 * @param {string} locationName - Location name
 * @param {number} maxLength - Maximum length (default: 25)
 * @returns {string} Truncated location name
 */
function truncateLocation(locationName, maxLength = 25) {
    return truncateString(locationName, maxLength);
}

// =============================================================================
// 13. ADDITIONAL UTILITIES
// =============================================================================

/**
 * Formats a percentage for display
 * @param {number} value - Value (0-1 or 0-100)
 * @param {boolean} isDecimal - If true, value is 0-1 (default true)
 * @param {number} decimals - Number of decimal places (default 1)
 * @returns {string} Formatted percentage
 */
function formatPercentage(value, isDecimal = true, decimals = 1) {
    if (value === null || value === undefined) return '?';
    if (typeof value !== 'number') return '?';
    
    let percent = isDecimal ? value * 100 : value;
    percent = Math.min(100, Math.max(0, percent));
    
    return `${percent.toFixed(decimals)}%`;
}

/**
 * Formats a duration in years for display
 * @param {number} years - Number of years
 * @returns {string} Formatted duration
 */
function formatDuration(years) {
    if (years === null || years === undefined) return '?';
    if (years < 0) return 'Invalid';
    if (years === 0) return '<1 year';
    if (years === 1) return '1 year';
    
    if (years < 12) return `${years} years`;
    
    const decades = Math.floor(years / 10);
    const remainder = years % 10;
    
    if (remainder === 0) {
        return `${decades} decades`;
    }
    return `${decades}.${remainder} decades`;
}

// =============================================================================
// 14. EXPORTS (Global Availability)
// =============================================================================

// HTML escaping
window.escapeHtml = escapeHtml;
window.escapeHtmlWithBreaks = escapeHtmlWithBreaks;

// Year formatting
window.formatYear = formatYear;
window.formatYearRange = formatYearRange;

// Name formatting
window.formatCharacterName = formatCharacterName;
window.formatCharacterNameWithRank = formatCharacterNameWithRank;
window.formatCharacterNameWithGender = formatCharacterNameWithGender;
window.formatCharacterNameWithAge = formatCharacterNameWithAge;

// Title formatting
window.formatTitle = formatTitle;
window.formatCharacterTitles = formatCharacterTitles;

// Dynasty/lineage
window.formatDynasty = formatDynasty;
window.formatSuccessionNumber = formatSuccessionNumber;

// Relationship formatting
window.formatRelationshipStatus = formatRelationshipStatus;
window.formatRelationshipType = formatRelationshipType;
window.formatFriendship = formatFriendship;

// Location formatting
window.formatLocationHierarchy = formatLocationHierarchy;
window.formatLocationType = formatLocationType;
window.formatPopulation = formatPopulation;

// Age formatting
window.formatAge = formatAge;
window.formatCharacterAge = formatCharacterAge;
window.formatAgeRange = formatAgeRange;

// Date range formatting
window.formatDateRange = formatDateRange;

// List formatting
window.formatList = formatList;
window.formatCount = formatCount;

// Gender formatting
window.getGenderSymbol = getGenderSymbol;
window.getGenderLabel = getGenderLabel;

// String utilities
window.truncateString = truncateString;
window.truncateLocation = truncateLocation;

// Additional utilities
window.formatPercentage = formatPercentage;
window.formatDuration = formatDuration;
