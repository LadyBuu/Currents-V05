/**
 * =============================================================================
 * STILL WATERS - COLLECTIONS & UTILITIES (collections.js)
 * =============================================================================
 * 
 * LOCATION: js/core/collections.js
 * 
 * SCOPE:
 *   - Deep cloning
 *   - Function utilities (debounce, throttle)
 *   - Array operations (unique, groupBy, sortBy, chunk, etc.)
 *   - Object operations (pick, omit, merge, deepMerge)
 *   - String operations (titleCase, toKebabCase, toSnakeCase, etc.)
 * 
 * OUT OF SCOPE:
 *   - String truncation (see formatting.js → truncateString)
 *   - Domain logic (no characters, places, ranks, etc.)
 * 
 * SEMANTIC RULES:
 *   - All functions are pure (except debounce/throttle/deepClone-in-place).
 *   - No `||` defaults that could destroy 0, '', or false.
 *   - `deepClone` handles circular references.
 *   - `deepMerge` recurses only into plain objects.
 *   - String helpers handle Unicode correctly.
 *   - No `Object.prototype` pollution via unsafe `hasOwnProperty` calls.
 * 
 * DEPENDENCIES: None.
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. DEEP CLONING
// =============================================================================

/**
 * Recursively clones objects, arrays, Dates, RegExps, Maps, Sets.
 * Handles circular references by tracking visited nodes.
 * 
 * @param {*} obj
 * @param {WeakMap} [seen] - internal, for cycle tracking
 * @returns {*}
 */
function deepClone(obj, seen) {
    // Primitives
    if (obj === null || typeof obj !== 'object') return obj;

    // Cycle tracking
    if (!seen) seen = new WeakMap();
    if (seen.has(obj)) return seen.get(obj);

    // Date
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }

    // RegExp
    if (obj instanceof RegExp) {
        return new RegExp(obj.source, obj.flags);
    }

    // Map
    if (obj instanceof Map) {
        var clonedMap = new Map();
        seen.set(obj, clonedMap);
        obj.forEach(function(v, k) {
            clonedMap.set(deepClone(k, seen), deepClone(v, seen));
        });
        return clonedMap;
    }

    // Set
    if (obj instanceof Set) {
        var clonedSet = new Set();
        seen.set(obj, clonedSet);
        obj.forEach(function(v) {
            clonedSet.add(deepClone(v, seen));
        });
        return clonedSet;
    }

    // Array
    if (Array.isArray(obj)) {
        var clonedArr = [];
        seen.set(obj, clonedArr);
        for (var i = 0; i < obj.length; i++) {
            clonedArr.push(deepClone(obj[i], seen));
        }
        return clonedArr;
    }

    // Plain object (or class instance — treats as plain object)
    var cloned = {};
    seen.set(obj, cloned);
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) {
        cloned[keys[k]] = deepClone(obj[keys[k]], seen);
    }
    return cloned;
}

/**
 * Uses structuredClone when available, falls back to JSON clone.
 * Faster than deepClone for large acyclic objects.
 * Does NOT handle functions, class instances with prototypes, or symbols.
 * 
 * @param {*} obj
 * @param {*} [fallback] - returned if cloning fails
 * @returns {*}
 */
function safeDeepClone(obj, fallback) {
    if (fallback === undefined) fallback = null;

    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(obj);
        } catch (e) {
            // fall through to JSON
        }
    }

    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        return fallback;
    }
}

/**
 * @deprecated Use safeDeepClone instead.
 * Kept for backward compatibility. Prefer safeDeepClone.
 */
function quickClone(obj) {
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        return null;
    }
}

// =============================================================================
// 2. FUNCTION UTILITIES
// =============================================================================

/**
 * Debounce: delays execution until after `wait` ms have elapsed since the
 * last call.
 * 
 * The returned function exposes `.cancel()` to clear pending execution.
 * 
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
function debounce(func, wait) {
    var timeout;
    var debounced = function() {
        var context = this;
        var args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function() {
            timeout = null;
            func.apply(context, args);
        }, wait);
    };
    debounced.cancel = function() {
        clearTimeout(timeout);
        timeout = null;
    };
    debounced.flush = function() {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
            func.apply(this, arguments);
        }
    };
    return debounced;
}

/**
 * Debounce with immediate leading-edge execution.
 * Executes on the leading edge; ignored during the wait window.
 */
function debounceLeading(func, wait) {
    var timeout = null;
    var debounced = function() {
        var context = this;
        var args = arguments;
        var callNow = !timeout;
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(function() {
            timeout = null;
        }, wait);
        if (callNow) func.apply(context, args);
    };
    debounced.cancel = function() {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
    };
    return debounced;
}

/**
 * Throttle: leading-edge execution, at most once per `limit` ms.
 * Calls during the interval are dropped (no trailing call).
 * 
 * @param {Function} func
 * @param {number} limit
 * @returns {Function}
 */
function throttle(func, limit) {
    var inThrottle = false;
    return function() {
        if (!inThrottle) {
            func.apply(this, arguments);
            inThrottle = true;
            setTimeout(function() {
                inThrottle = false;
            }, limit);
        }
    };
}

// =============================================================================
// 3. ARRAY HELPERS
// =============================================================================

/**
 * Removes duplicate values.
 * With keyFn, uniqueness is by the key function's return value.
 */
function unique(arr, keyFn) {
    if (!Array.isArray(arr)) return [];
    if (typeof keyFn === 'function') {
        var seen = new Set();
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            var k = keyFn(arr[i]);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(arr[i]);
        }
        return out;
    }
    return Array.from(new Set(arr));
}

/**
 * Groups array elements by a key function, returning a Map.
 */
function groupBy(arr, keyFn) {
    var result = new Map();
    if (!Array.isArray(arr) || typeof keyFn !== 'function') return result;
    for (var i = 0; i < arr.length; i++) {
        var k = keyFn(arr[i]);
        if (!result.has(k)) result.set(k, []);
        result.get(k).push(arr[i]);
    }
    return result;
}

/**
 * Groups by string key, returning a plain object.
 * Uses Object.create(null) to avoid prototype pollution from keys like
 * "__proto__" or "constructor".
 */
function groupByObject(arr, keyFn) {
    if (!Array.isArray(arr) || typeof keyFn !== 'function') return {};
    var result = Object.create(null);
    for (var i = 0; i < arr.length; i++) {
        var k = String(keyFn(arr[i]));
        if (!result[k]) result[k] = [];
        result[k].push(arr[i]);
    }
    return result;
}

/**
 * Comparison helper used by sortBy and sortByMultiple.
 * Missing values (null/undefined) always sort last, regardless of direction.
 * @private
 */
function _compareValues(a, b, ascending) {
    var aMissing = a === null || a === undefined;
    var bMissing = b === null || b === undefined;

    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;   // missing last
    if (bMissing) return -1;

    if (a < b) return ascending ? -1 : 1;
    if (a > b) return ascending ? 1 : -1;
    return 0;
}

/**
 * Non-mutating sort by key function.
 */
function sortBy(arr, keyFn, ascending) {
    ascending = ascending !== false;
    if (!Array.isArray(arr)) return [];
    if (typeof keyFn !== 'function') return arr.slice();
    var copy = arr.slice();
    copy.sort(function(a, b) {
        return _compareValues(keyFn(a), keyFn(b), ascending);
    });
    return copy;
}

/**
 * Non-mutating multi-key sort.
 * @param {Array} arr
 * @param {Array<{ keyFn: Function, ascending?: boolean }>} sortConfigs
 */
function sortByMultiple(arr, sortConfigs) {
    if (!Array.isArray(arr)) return [];
    if (!Array.isArray(sortConfigs) || sortConfigs.length === 0) return arr.slice();

    var copy = arr.slice();
    copy.sort(function(a, b) {
        for (var i = 0; i < sortConfigs.length; i++) {
            var cfg = sortConfigs[i];
            var asc = cfg.ascending !== false;
            var keyFn = cfg.keyFn;
            if (typeof keyFn !== 'function') continue;
            var cmp = _compareValues(keyFn(a), keyFn(b), asc);
            if (cmp !== 0) return cmp;
        }
        return 0;
    });
    return copy;
}

/**
 * Splits an array into chunks of `size`.
 */
function chunk(arr, size) {
    if (!Array.isArray(arr)) return [];
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1) return [];
    var result = [];
    for (var i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

/**
 * Flattens a nested array by one level.
 */
function flatten(arr) {
    if (!Array.isArray(arr)) return [];
    var result = [];
    for (var i = 0; i < arr.length; i++) {
        if (Array.isArray(arr[i])) {
            for (var j = 0; j < arr[i].length; j++) result.push(arr[i][j]);
        } else {
            result.push(arr[i]);
        }
    }
    return result;
}

/**
 * Flattens a nested array completely.
 */
function flattenDeep(arr) {
    if (!Array.isArray(arr)) return [];
    var result = [];
    (function walk(list) {
        for (var i = 0; i < list.length; i++) {
            if (Array.isArray(list[i])) walk(list[i]);
            else result.push(list[i]);
        }
    })(arr);
    return result;
}

/**
 * Returns the intersection of the given arrays (unique values).
 * 
 * The comment previously claimed Set optimization but used `includes`.
 * This version actually uses Sets.
 */
function intersection() {
    var arrays = Array.prototype.slice.call(arguments);
    if (arrays.length === 0) return [];

    // Filter out non-arrays
    var valid = [];
    for (var i = 0; i < arrays.length; i++) {
        if (Array.isArray(arrays[i])) valid.push(arrays[i]);
    }
    if (valid.length === 0) return [];

    // Find the smallest array for the initial Set
    var smallest = valid[0];
    for (var j = 1; j < valid.length; j++) {
        if (valid[j].length < smallest.length) smallest = valid[j];
    }

    // Build Sets for the others
    var otherSets = [];
    for (var k = 0; k < valid.length; k++) {
        if (valid[k] !== smallest) {
            otherSets.push(new Set(valid[k]));
        }
    }

    var seen = new Set();
    var result = [];
    for (var m = 0; m < smallest.length; m++) {
        var item = smallest[m];
        if (seen.has(item)) continue;
        var inAll = true;
        for (var n = 0; n < otherSets.length; n++) {
            if (!otherSets[n].has(item)) { inAll = false; break; }
        }
        if (inAll) {
            seen.add(item);
            result.push(item);
        }
    }
    return result;
}

/**
 * Converts an array of objects to a Map keyed by a property.
 */
function arrayToMap(arr, keyProp) {
    var map = new Map();
    if (!Array.isArray(arr)) return map;
    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (item && item[keyProp] !== undefined) {
            map.set(item[keyProp], item);
        }
    }
    return map;
}

/**
 * Converts an array of objects to an object keyed by a property.
 * Uses Object.create(null) to avoid prototype pollution.
 */
function arrayToObject(arr, keyProp) {
    if (!Array.isArray(arr)) return Object.create(null);
    var result = Object.create(null);
    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
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
 * Picks specific keys from an object.
 */
function pick(obj, keys) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(keys)) return {};
    var result = {};
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
            result[k] = obj[k];
        }
    }
    return result;
}

/**
 * Omits specific keys from an object.
 */
function omit(obj, keys) {
    if (!obj || typeof obj !== 'object') return {};
    if (!Array.isArray(keys)) {
        // Return a shallow copy
        var copy = {};
        var allKeys = Object.keys(obj);
        for (var i = 0; i < allKeys.length; i++) copy[allKeys[i]] = obj[allKeys[i]];
        return copy;
    }
    var keysSet = new Set(keys);
    var result = {};
    var objKeys = Object.keys(obj);
    for (var j = 0; j < objKeys.length; j++) {
        var k = objKeys[j];
        if (!keysSet.has(k)) result[k] = obj[k];
    }
    return result;
}

/**
 * Shallow merges multiple objects (last wins).
 */
function shallowMerge() {
    var result = {};
    for (var i = 0; i < arguments.length; i++) {
        var obj = arguments[i];
        if (!obj || typeof obj !== 'object') continue;
        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; j++) {
            result[keys[j]] = obj[keys[j]];
        }
    }
    return result;
}

/**
 * Alias for shallowMerge. Deprecated — prefer shallowMerge for clarity.
 * @deprecated
 */
function merge() {
    return shallowMerge.apply(null, arguments);
}

/**
 * Returns true if value is a plain object (not array, Date, Map, Set,
 * RegExp, etc.).
 * @private
 */
function _isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    if (Array.isArray(value)) return false;
    if (value instanceof Date) return false;
    if (value instanceof RegExp) return false;
    if (value instanceof Map) return false;
    if (value instanceof Set) return false;
    return true;
}

/**
 * Deep merges multiple objects. Recurses only into plain objects;
 * arrays and other values are replaced (cloned).
 */
function deepMerge() {
    var args = Array.prototype.slice.call(arguments);
    if (args.length === 0) return {};
    if (!_isPlainObject(args[0])) {
        return deepClone(args[0]);
    }

    var result = deepClone(args[0]);

    for (var i = 1; i < args.length; i++) {
        var obj = args[i];
        if (!_isPlainObject(obj)) continue;
        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; j++) {
            var k = keys[j];
            var rv = result[k];
            var ov = obj[k];
            if (_isPlainObject(rv) && _isPlainObject(ov)) {
                result[k] = deepMerge(rv, ov);
            } else {
                result[k] = deepClone(ov);
            }
        }
    }
    return result;
}

/**
 * Returns true if obj has no enumerable own properties.
 * Returns true for null/undefined as well (they have no properties).
 */
function isEmptyObject(obj) {
    if (!obj || typeof obj !== 'object') return true;
    return Object.keys(obj).length === 0;
}

// =============================================================================
// 5. STRING HELPERS
// =============================================================================

/**
 * Capitalizes the first letter; leaves the rest untouched.
 * For "capitalize first and lowercase rest," use titleCase.
 */
function capitalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Title case: first letter of each space-separated word capitalized,
 * remaining letters lowercased.
 * Handles Unicode letters.
 */
function titleCase(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(function(word) {
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

/**
 * Converts to kebab-case. Preserves Unicode letters and numbers.
 * Non-alphanumeric characters become hyphens.
 */
function toKebabCase(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}-]/gu, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Converts to snake_case. Preserves Unicode letters and numbers.
 */
function toSnakeCase(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^\p{L}\p{N}_]/gu, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

// =============================================================================
// 6. EXPORTS
// =============================================================================

// Deep cloning
window.deepClone = deepClone;
window.safeDeepClone = safeDeepClone;
window.quickClone = quickClone; // deprecated

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
window.merge = merge;           // deprecated alias
window.shallowMerge = shallowMerge;
window.deepMerge = deepMerge;
window.isEmptyObject = isEmptyObject;

// String helpers
window.capitalize = capitalize;
window.titleCase = titleCase;
window.toKebabCase = toKebabCase;
window.toSnakeCase = toSnakeCase;