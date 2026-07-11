/**
 * =============================================================================
 * STILL WATERS - COLLECTIONS & UTILITIES (collections.js)
 * =============================================================================
 * 
 * LOCATION: js/core/collections.js
 * 
 * This file contains generic helper functions including:
 * - deepClone (object/array deep copying)
 * - debounce (function rate limiting)
 * - Array manipulation helpers (unique, groupBy, sortBy)
 * - Object helpers (pick, omit, merge)
 * - String helpers (capitalize, titleCase, kebabCase, snakeCase)
 * 
 * PURPOSE: Pure utility functions that work on any data structure
 * 
 * DEPENDENCIES: None (pure JavaScript utilities)
 * 
 * NOTE: String truncation is now in formatting.js (truncateString)
 *       Use window.truncateString() for Unicode-aware truncation.
 * =============================================================================
 * EXPORTED FUNCTIONS (on window):
 * =============================================================================
 * 
 * Deep Cloning:
 *   - deepClone(obj) - Recursively clones objects, arrays, Dates, RegExps, Maps, Sets
 *   - safeDeepClone(obj, fallback) - Uses structuredClone with JSON fallback
 *   - quickClone(obj) - JSON-based deep clone (faster but less robust)
 * 
 * Function Utilities:
 *   - debounce(func, wait) - Delays execution until after wait time
 *   - debounceLeading(func, wait) - Leading edge debounce (executes immediately)
 *   - throttle(func, limit) - Limits execution to once per interval
 * 
 * Array Helpers:
 *   - unique(arr, keyFn) - Removes duplicates, optional key function
 *   - groupBy(arr, keyFn) - Groups by key function, returns Map
 *   - groupByObject(arr, keyFn) - Groups by string key, returns plain object
 *   - sortBy(arr, keyFn, ascending) - Sorts by key function (non-mutating)
 *   - sortByMultiple(arr, sortConfigs) - Sorts by multiple key functions
 *   - chunk(arr, size) - Splits array into chunks
 *   - flatten(arr) - Flattens array by one level
 *   - flattenDeep(arr) - Flattens array completely
 *   - intersection(...arrays) - Returns common elements across all arrays
 *   - arrayToMap(arr, keyProp) - Converts array of objects to Map keyed by property
 *   - arrayToObject(arr, keyProp) - Converts array of objects to plain object
 * 
 * Object Helpers:
 *   - pick(obj, keys) - Returns new object with only specified keys
 *   - omit(obj, keys) - Returns new object without specified keys
 *   - shallowMerge(...objects) - Shallow merges multiple objects (last wins)
 *   - merge(...objects) - Alias for shallowMerge (deprecated)
 *   - deepMerge(...objects) - Deep merges multiple objects recursively
 *   - isEmptyObject(obj) - Checks if object has no enumerable own properties
 * 
 * String Helpers:
 *   - capitalize(str) - Capitalizes first letter only
 *   - titleCase(str) - Title case (each word capitalized, rest lowercased)
 *   - toKebabCase(str) - Converts to kebab-case, preserves Unicode letters
 *   - toSnakeCase(str) - Converts to snake_case, preserves Unicode letters
 * 
 * DEPRECATED / MOVED:
 *   - truncate() - Moved to js/core/formatting.js as truncateString()
 * 
 * =============================================================================
 */

// =============================================================================
// 1. DEEP CLONING
// =============================================================================

/**
 * Creates a deep clone of an object, array, or other complex data structure
 * Handles: Objects, Arrays, Dates, RegExps, Maps, Sets, and primitive types
 * 
 * @param {*} obj - Object or array to clone
 * @returns {*} Deep cloned copy
 */
function deepClone(obj) {
    // Handle null, undefined, and non-objects (primitives)
    if (obj === null || typeof obj !== 'object') return obj;
    
    // Handle Date objects
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    
    // Handle RegExp objects
    if (obj instanceof RegExp) {
        return new RegExp(obj.source, obj.flags);
    }
    
    // Handle Map
    if (obj instanceof Map) {
        const clonedMap = new Map();
        for (const [key, value] of obj) {
            clonedMap.set(deepClone(key), deepClone(value));
        }
        return clonedMap;
    }
    
    // Handle Set
    if (obj instanceof Set) {
        const clonedSet = new Set();
        for (const value of obj) {
            clonedSet.add(deepClone(value));
        }
        return clonedSet;
    }
    
    // Handle Arrays
    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item));
    }
    
    // Handle plain objects
    const cloned = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            cloned[key] = deepClone(obj[key]);
        }
    }
    return cloned;
}

/**
 * Safe deep clone that uses structuredClone if available, falls back to JSON
 * This is faster than recursive deepClone for large objects but has limitations
 * @param {*} obj - Object to clone
 * @param {*} fallback - Fallback value if cloning fails (default null)
 * @returns {*} Cloned object or fallback
 */
function safeDeepClone(obj, fallback = null) {
    // Use structuredClone if available (modern browsers)
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(obj);
        } catch (e) {
            console.warn('structuredClone failed, falling back to JSON:', e);
        }
    }
    
    // Fallback to JSON methods
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        console.error('Safe deep clone failed:', e);
        return fallback;
    }
}

/**
 * Quick JSON-based deep clone (faster but less robust than deepClone)
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object or null if failed
 */
function quickClone(obj) {
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        return null;
    }
}

// =============================================================================
// 2. DEBOUNCE & THROTTLE
// =============================================================================

/**
 * Creates a debounced version of a function that delays execution
 * until after a specified wait time has elapsed since the last call
 * 
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Creates a debounced version with immediate execution on the leading edge
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function with leading edge execution
 */
function debounceLeading(func, wait) {
    let timeout = null;
    return function(...args) {
        const callNow = !timeout;
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            timeout = null;
        }, wait);
        if (callNow) func.apply(this, args);
    };
}

/**
 * Creates a throttled version of a function that limits execution
 * to at most once per specified interval
 * 
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
            }, limit);
        }
    };
}

// =============================================================================
// 3. ARRAY HELPERS
// =============================================================================

/**
 * Removes duplicate values from an array
 * @param {Array} arr - Input array
 * @param {Function} keyFn - Optional function to extract comparison key
 * @returns {Array} Array with duplicates removed
 */
function unique(arr, keyFn = null) {
    if (!Array.isArray(arr)) return [];
    
    if (keyFn) {
        const seen = new Map();
        return arr.filter(item => {
            const key = keyFn(item);
            if (seen.has(key)) return false;
            seen.set(key, true);
            return true;
        });
    }
    
    return [...new Set(arr)];
}

/**
 * Groups array elements by a key function (returns Map for better key support)
 * @param {Array} arr - Input array
 * @param {Function} keyFn - Function that returns the grouping key
 * @returns {Map} Map with keys mapped to arrays of items
 */
function groupBy(arr, keyFn) {
    if (!Array.isArray(arr) || typeof keyFn !== 'function') return new Map();
    
    const result = new Map();
    for (const item of arr) {
        const key = keyFn(item);
        if (!result.has(key)) {
            result.set(key, []);
        }
        result.get(key).push(item);
    }
    return result;
}

/**
 * Groups array elements by a key function (returns plain object for string keys)
 * @param {Array} arr - Input array
 * @param {Function} keyFn - Function that returns a string key
 * @returns {Object} Object with keys mapped to arrays of items
 */
function groupByObject(arr, keyFn) {
    if (!Array.isArray(arr) || typeof keyFn !== 'function') return {};
    
    return arr.reduce((result, item) => {
        const key = String(keyFn(item));
        if (!result[key]) result[key] = [];
        result[key].push(item);
        return result;
    }, {});
}

/**
 * Sorts an array by a key function (non-mutating)
 * @param {Array} arr - Input array
 * @param {Function} keyFn - Function that returns the sort key
 * @param {boolean} ascending - Sort ascending (true) or descending (false)
 * @returns {Array} New sorted array
 */
function sortBy(arr, keyFn, ascending = true) {
    if (!Array.isArray(arr)) return [];
    
    const sorted = [...arr];
    sorted.sort((a, b) => {
        let aVal = keyFn(a);
        let bVal = keyFn(b);
        
        // Handle null/undefined - treat as lowest values
        if (aVal === null || aVal === undefined) aVal = ascending ? -Infinity : Infinity;
        if (bVal === null || bVal === undefined) bVal = ascending ? -Infinity : Infinity;
        
        if (aVal < bVal) return ascending ? -1 : 1;
        if (aVal > bVal) return ascending ? 1 : -1;
        return 0;
    });
    return sorted;
}

/**
 * Sorts an array by multiple key functions
 * @param {Array} arr - Input array
 * @param {Array} sortConfigs - Array of { keyFn, ascending } objects
 * @returns {Array} New sorted array
 */
function sortByMultiple(arr, sortConfigs) {
    if (!Array.isArray(arr) || !sortConfigs || sortConfigs.length === 0) return [...arr];
    
    const sorted = [...arr];
    sorted.sort((a, b) => {
        for (const config of sortConfigs) {
            const { keyFn, ascending = true } = config;
            let aVal = keyFn(a);
            let bVal = keyFn(b);
            
            // Handle null/undefined
            if (aVal === null || aVal === undefined) aVal = ascending ? -Infinity : Infinity;
            if (bVal === null || bVal === undefined) bVal = ascending ? -Infinity : Infinity;
            
            if (aVal < bVal) return ascending ? -1 : 1;
            if (aVal > bVal) return ascending ? 1 : -1;
        }
        return 0;
    });
    return sorted;
}

/**
 * Chunks an array into smaller arrays of specified size
 * @param {Array} arr - Input array
 * @param {number} size - Chunk size
 * @returns {Array} Array of chunks
 */
function chunk(arr, size) {
    if (!Array.isArray(arr) || size < 1) return [];
    
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

/**
 * Flattens a nested array by one level
 * @param {Array} arr - Input array
 * @returns {Array} Flattened array
 */
function flatten(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.reduce((result, item) => {
        if (Array.isArray(item)) {
            result.push(...item);
        } else {
            result.push(item);
        }
        return result;
    }, []);
}

/**
 * Flattens a nested array completely (all levels)
 * @param {Array} arr - Input array
 * @returns {Array} Fully flattened array
 */
function flattenDeep(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.reduce((result, item) => {
        if (Array.isArray(item)) {
            result.push(...flattenDeep(item));
        } else {
            result.push(item);
        }
        return result;
    }, []);
}

/**
 * Finds the intersection of multiple arrays (optimized for large arrays)
 * @param {...Array} arrays - Arrays to intersect
 * @returns {Array} Array of common elements
 */
function intersection(...arrays) {
    if (arrays.length === 0) return [];
    
    const first = arrays[0];
    if (!Array.isArray(first)) return [];
    
    // Use Set for O(1) lookups on the smallest array for optimization
    const smallestIndex = arrays.reduce((minIdx, arr, idx) => 
        arr.length < arrays[minIdx].length ? idx : minIdx, 0);
    
    const smallest = arrays[smallestIndex];
    const others = arrays.filter((_, i) => i !== smallestIndex);
    
    return smallest.filter(item => 
        others.every(arr => Array.isArray(arr) && arr.includes(item))
    );
}

/**
 * Converts an array of objects to a Map keyed by a specified property
 * @param {Array} arr - Input array
 * @param {string} keyProp - Property name to use as key
 * @returns {Map} Map of key -> object
 */
function arrayToMap(arr, keyProp) {
    const map = new Map();
    if (!Array.isArray(arr)) return map;
    for (const item of arr) {
        if (item && item[keyProp] !== undefined) {
            map.set(item[keyProp], item);
        }
    }
    return map;
}

/**
 * Converts an array of objects to an object keyed by a specified property
 * @param {Array} arr - Input array
 * @param {string} keyProp - Property name to use as key
 * @returns {Object} Object of key -> object
 */
function arrayToObject(arr, keyProp) {
    const result = {};
    if (!Array.isArray(arr)) return result;
    for (const item of arr) {
        if (item && item[keyProp] !== undefined) {
            result[item[keyProp]] = item;
        }
    }
    return result;
}

// =============================================================================
// 4. OBJECT HELPERS
// =============================================================================

/**
 * Picks specific keys from an object
 * @param {Object} obj - Source object
 * @param {Array} keys - Keys to pick
 * @returns {Object} New object with only picked keys
 */
function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return {};
    if (!Array.isArray(keys)) return {};
    
    const result = {};
    for (const key of keys) {
        if (obj.hasOwnProperty(key)) {
            result[key] = obj[key];
        }
    }
    return result;
}

/**
 * Omits specific keys from an object
 * @param {Object} obj - Source object
 * @param {Array} keys - Keys to omit
 * @returns {Object} New object without omitted keys
 */
function omit(obj, keys) {
    if (!obj || typeof obj !== 'object') return {};
    if (!Array.isArray(keys)) return { ...obj };
    
    const keysSet = new Set(keys);
    const result = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key) && !keysSet.has(key)) {
            result[key] = obj[key];
        }
    }
    return result;
}

/**
 * Shallow merges multiple objects (last object wins conflicts)
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Merged object
 */
function shallowMerge(...objects) {
    const result = {};
    for (const obj of objects) {
        if (obj && typeof obj === 'object') {
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    result[key] = obj[key];
                }
            }
        }
    }
    return result;
}

/**
 * Alias for shallowMerge (backward compatibility)
 * @deprecated Use shallowMerge instead
 */
function merge(...objects) {
    return shallowMerge(...objects);
}

/**
 * Deep merges multiple objects (recursively merges nested objects)
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Deep merged object
 */
function deepMerge(...objects) {
    if (objects.length === 0) return {};
    
    const result = deepClone(objects[0]);
    
    for (let i = 1; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj || typeof obj !== 'object') continue;
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const resultVal = result[key];
                const objVal = obj[key];
                
                if (resultVal && typeof resultVal === 'object' && 
                    objVal && typeof objVal === 'object' &&
                    !Array.isArray(resultVal) && !Array.isArray(objVal)) {
                    result[key] = deepMerge(resultVal, objVal);
                } else {
                    result[key] = deepClone(objVal);
                }
            }
        }
    }
    
    return result;
}

/**
 * Checks if an object is empty (no enumerable own properties)
 * @param {Object} obj - Object to check
 * @returns {boolean}
 */
function isEmptyObject(obj) {
    if (!obj || typeof obj !== 'object') return true;
    return Object.keys(obj).length === 0;
}

// =============================================================================
// 5. STRING HELPERS
// =============================================================================

/**
 * Capitalizes the first letter of a string (does NOT lowercase the rest)
 * For title case with lowercase rest, use titleCase()
 * @param {string} str - Input string
 * @returns {string} Capitalized string
 */
function capitalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts a string to title case (each word capitalized, rest lowercased)
 * @param {string} str - Input string
 * @returns {string} Title case string
 */
function titleCase(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Converts a string to kebab-case
 * Keeps Unicode letters, removes other special characters
 * @param {string} str - Input string
 * @returns {string} Kebab-cased string
 */
function toKebabCase(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}-]/gu, '')
        .replace(/-+/g, '-');
}

/**
 * Converts a string to snake_case
 * Keeps Unicode letters, removes other special characters
 * @param {string} str - Input string
 * @returns {string} Snake-cased string
 */
function toSnakeCase(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^\p{L}\p{N}_]/gu, '')
        .replace(/_+/g, '_');
}

// =============================================================================
// 6. NOTE: STRING TRUNCATION
// =============================================================================

/**
 * String truncation has been moved to formatting.js as truncateString()
 * truncateString handles Unicode characters properly using Array.from()
 * 
 * @deprecated Use window.truncateString() from formatting.js instead
 * 
 * Example:
 *   // Old (removed):
 *   truncate(str, 50);
 *   
 *   // New:
 *   truncateString(str, 50);
 *   // or
 *   window.truncateString(str, 50);
 */

// =============================================================================
// 7. EXPORTS (Global Availability)
// =============================================================================

// Deep cloning
window.deepClone = deepClone;
window.safeDeepClone = safeDeepClone;
window.quickClone = quickClone;

// Function utilities
window.debounce = debounce;
window.debounceLeading = debounceLeading;
window.throttle = throttle;

// Array helpers
window.unique = unique;
window.groupBy = groupBy;
window.groupByObject = groupByObject;
window.sortBy = sortBy;
window.sortByMultiple = sortByMultiple;
window.chunk = chunk;
window.flatten = flatten;
window.flattenDeep = flattenDeep;
window.intersection = intersection;
window.arrayToMap = arrayToMap;
window.arrayToObject = arrayToObject;

// Object helpers
window.pick = pick;
window.omit = omit;
window.merge = shallowMerge;
window.shallowMerge = shallowMerge;
window.deepMerge = deepMerge;
window.isEmptyObject = isEmptyObject;

// String helpers
window.capitalize = capitalize;
window.titleCase = titleCase;
window.toKebabCase = toKebabCase;
window.toSnakeCase = toSnakeCase;
