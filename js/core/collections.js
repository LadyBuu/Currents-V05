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
 * 
 * OUT OF SCOPE:
 *   - String formatting (see formatting.js): capitalize, titleCase,
 *     toKebabCase, toSnakeCase, truncateString
 *   - Domain logic
 * 
 * SEMANTIC RULES:
 *   - Functions are pure except debounce/throttle (which own timing state).
 *   - No `||` defaults that could destroy 0, '', or false.
 *   - `deepClone` handles circular references.
 *   - `deepMerge` rejects cyclic input rather than recursing forever.
 *   - `deepMerge` recurses only into plain objects.
 *   - Object-prototype pollution via `__proto__`, `constructor`, `prototype`
 *     is prevented in all operations that build objects from dynamic keys.
 *   - Missing/invalid input returns a safe empty result, not a fabricated
 *     one. Function-argument errors throw.
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
 * Returns true if `key` is an object-prototype pollution hazard when used
 * as an assignment key on a plain object.
 * @private
 */
function _isUnsafeObjectKey(key) {
    return key === '__proto__'
        || key === 'constructor'
        || key === 'prototype';
}

/**
 * Returns true if `value` is a plain object (its prototype is Object.prototype
 * or null). Class instances, Dates, RegExps, Maps, Sets, and arrays are not
 * plain objects.
 * @private
 */
function _isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Deep clone of data structures.
 * 
 * Handles: primitives, Date, RegExp, Map, Set, Array, plain objects.
 * Circular references are preserved via a WeakMap.
 * 
 * Class instances are cloned as plain objects (their prototype is not
 * preserved). Keys that could cause prototype pollution are skipped.
 * 
 * @param {*} obj
 * @param {WeakMap} [seen] - internal, for cycle tracking
 * @returns {*}
 */
function deepClone(obj, seen) {
    if (obj === null || typeof obj !== 'object') return obj;

    if (!seen) seen = new WeakMap();
    if (seen.has(obj)) return seen.get(obj);

    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }

    if (obj instanceof RegExp) {
        var clonedRe = new RegExp(obj.source, obj.flags);
        clonedRe.lastIndex = obj.lastIndex;
        return clonedRe;
    }

    if (obj instanceof Map) {
        var clonedMap = new Map();
        seen.set(obj, clonedMap);
        obj.forEach(function(v, k) {
            clonedMap.set(deepClone(k, seen), deepClone(v, seen));
        });
        return clonedMap;
    }

    if (obj instanceof Set) {
        var clonedSet = new Set();
        seen.set(obj, clonedSet);
        obj.forEach(function(v) {
            clonedSet.add(deepClone(v, seen));
        });
        return clonedSet;
    }

    if (Array.isArray(obj)) {
        var clonedArr = [];
        seen.set(obj, clonedArr);
        for (var i = 0; i < obj.length; i++) {
            clonedArr.push(deepClone(obj[i], seen));
        }
        return clonedArr;
    }

    // Plain object (or unrecognized object; treated as plain data object)
    var cloned = {};
    seen.set(obj, cloned);
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (_isUnsafeObjectKey(key)) continue;
        cloned[key] = deepClone(obj[key], seen);
    }
    return cloned;
}

/**
 * Prefers structuredClone when available; falls back to JSON round-trip.
 * Faster than deepClone for large acyclic data.
 * 
 * Does NOT preserve class instances, functions, or symbols.
 * 
 * @param {*} obj
 * @param {*} [fallback] - returned on failure (default null)
 * @returns {*}
 */
function safeDeepClone(obj, fallback) {
    if (fallback === undefined) fallback = null;

    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(obj);
        } catch (e) {
            // fall through
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
 */
function quickClone(obj) {
    return safeDeepClone(obj, null);
}

// =============================================================================
// 2. FUNCTION UTILITIES
// =============================================================================

/**
 * Debounce: delays execution until `wait` ms after the last call.
 * 
 * Returned function exposes:
 *   - .cancel() — discards the pending invocation
 *   - .flush()  — invokes immediately with the last received arguments
 * 
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
function debounce(func, wait) {
    if (typeof func !== 'function') {
        throw new TypeError('debounce requires a function');
    }
    wait = (typeof wait === 'number' && Number.isFinite(wait)) ? Math.max(0, wait) : 0;

    var timeout = null;
    var lastArgs = null;
    var lastContext = null;

    function debounced() {
        lastArgs = arguments;
        lastContext = this;

        if (timeout !== null) clearTimeout(timeout);
        timeout = setTimeout(function() {
            timeout = null;
            var args = lastArgs;
            var ctx = lastContext;
            lastArgs = null;
            lastContext = null;
            func.apply(ctx, args);
        }, wait);
    }

    debounced.cancel = function() {
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }
        lastArgs = null;
        lastContext = null;
    };

    debounced.flush = function() {
        if (timeout === null) return;
        clearTimeout(timeout);
        timeout = null;
        var args = lastArgs;
        var ctx = lastContext;
        lastArgs = null;
        lastContext = null;
        func.apply(ctx, args);
    };

    return debounced;
}

/**
 * Debounce with immediate leading-edge execution.
 * Subsequent calls during the wait window are dropped.
 * 
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
function debounceLeading(func, wait) {
    if (typeof func !== 'function') {
        throw new TypeError('debounceLeading requires a function');
    }
    wait = (typeof wait === 'number' && Number.isFinite(wait)) ? Math.max(0, wait) : 0;

    var timeout = null;

    function debounced() {
        var ctx = this;
        var args = arguments;
        var callNow = (timeout === null);
        if (timeout !== null) clearTimeout(timeout);
        timeout = setTimeout(function() {
            timeout = null;
        }, wait);
        if (callNow) func.apply(ctx, args);
    }

    debounced.cancel = function() {
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }
    };

    return debounced;
}

/**
 * Throttle: leading-edge only. Executes at most once per `limit` ms.
 * Calls during the interval are dropped (no trailing call).
 * 
 * Returned function exposes .cancel().
 * 
 * @param {Function} func
 * @param {number} limit
 * @returns {Function}
 */
function throttle(func, limit) {
    if (typeof func !== 'function') {
        throw new TypeError('throttle requires a function');
    }
    limit = (typeof limit === 'number' && Number.isFinite(limit)) ? Math.max(0, limit) : 0;

    var inThrottle = false;
    var timeoutId = null;

    function throttled() {
        if (!inThrottle) {
            func.apply(this, arguments);
            inThrottle = true;
            timeoutId = setTimeout(function() {
                inThrottle = false;
                timeoutId = null;
            }, limit);
        }
    }

    throttled.cancel = function() {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        inThrottle = false;
    };

    return throttled;
}

// =============================================================================
// 3. ARRAY HELPERS
// =============================================================================

/**
 * Removes duplicate values.
 * With keyFn, uniqueness is by keyFn's return value.
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
 * Groups by string key, returning a null-prototype object.
 */
function groupByObject(arr, keyFn) {
    if (!Array.isArray(arr) || typeof keyFn !== 'function') {
        return Object.create(null);
    }
    var result = Object.create(null);
    for (var i = 0; i < arr.length; i++) {
        var k = String(keyFn(arr[i]));
        if (_isUnsafeObjectKey(k)) continue;
        if (!result[k]) result[k] = [];
        result[k].push(arr[i]);
    }
    return result;
}

/**
 * Comparison helper for sortBy/sortByMultiple.
 * Missing values (null/undefined) always sort last.
 * @private
 */
function _compareValues(a, b, ascending) {
    var aMissing = (a === null || a === undefined);
    var bMissing = (b === null || b === undefined);

    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;

    if (a < b) return ascending ? -1 : 1;
    if (a > b) return ascending ? 1 : -1;
    return 0;
}

/**
 * Non-mutating sort by key function. Missing values always last.
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
    if (!Array.isArray(sortConfigs) || sortConfigs.length === 0) {
        return arr.slice();
    }

    var copy = arr.slice();
    copy.sort(function(a, b) {
        for (var i = 0; i < sortConfigs.length; i++) {
            var cfg = sortConfigs[i];
            if (!cfg || typeof cfg.keyFn !== 'function') continue;
            var asc = cfg.ascending !== false;
            var cmp = _compareValues(cfg.keyFn(a), cfg.keyFn(b), asc);
            if (cmp !== 0) return cmp;
        }
        return 0;
    });
    return copy;
}

function chunk(arr, size) {
    if (!Array.isArray(arr)) return [];
    if (!Number.isInteger(size) || size < 1) return [];
    var result = [];
    for (var i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

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
 * Returns the unique intersection of the given arrays.
 * 
 * If any argument is not an array, returns [] (fails the operation rather
 * than silently ignoring the malformed argument).
 * 
 * @param {...Array} arrays
 * @returns {Array}
 */
function intersection() {
    var arrays = Array.prototype.slice.call(arguments);
    if (arrays.length === 0) return [];

    for (var i = 0; i < arrays.length; i++) {
        if (!Array.isArray(arrays[i])) return [];
    }

    // Find the smallest for the initial set
    var smallest = arrays[0];
    for (var j = 1; j < arrays.length; j++) {
        if (arrays[j].length < smallest.length) smallest = arrays[j];
    }

    var otherSets = [];
    for (var k = 0; k < arrays.length; k++) {
        if (arrays[k] !== smallest) {
            otherSets.push(new Set(arrays[k]));
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
    if (!Array.isArray(arr) || typeof keyProp !== 'string' || keyProp.length === 0) {
        return map;
    }
    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (item && item[keyProp] !== undefined) {
            map.set(item[keyProp], item);
        }
    }
    return map;
}

/**
 * Converts an array of objects to a null-prototype object keyed by a property.
 * Keys that could cause prototype pollution are skipped.
 */
function arrayToObject(arr, keyProp) {
    if (!Array.isArray(arr) || typeof keyProp !== 'string' || keyProp.length === 0) {
        return Object.create(null);
    }
    var result = Object.create(null);
    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (!item) continue;
        var k = item[keyProp];
        if (k === undefined) continue;
        var strKey = String(k);
        if (_isUnsafeObjectKey(strKey)) continue;
        result[strKey] = item;
    }
    return result;
}

// =============================================================================
// 4. OBJECT HELPERS
// =============================================================================

function pick(obj, keys) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(keys)) return {};
    var result = {};
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (typeof k !== 'string') continue;
        if (_isUnsafeObjectKey(k)) continue;
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
            result[k] = obj[k];
        }
    }
    return result;
}

function omit(obj, keys) {
    if (!obj || typeof obj !== 'object') return {};
    var keysSet = new Set(Array.isArray(keys) ? keys : []);
    var result = {};
    var objKeys = Object.keys(obj);
    for (var i = 0; i < objKeys.length; i++) {
        var k = objKeys[i];
        if (keysSet.has(k)) continue;
        if (_isUnsafeObjectKey(k)) continue;
        result[k] = obj[k];
    }
    return result;
}

function shallowMerge() {
    var result = {};
    for (var i = 0; i < arguments.length; i++) {
        var obj = arguments[i];
        if (!obj || typeof obj !== 'object') continue;
        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; j++) {
            var k = keys[j];
            if (_isUnsafeObjectKey(k)) continue;
            result[k] = obj[k];
        }
    }
    return result;
}

/**
 * @deprecated Alias for shallowMerge.
 */
function merge() {
    return shallowMerge.apply(null, arguments);
}

/**
 * Returns true if `value` appears anywhere in the seen set (cycle check).
 * @private
 */
function _wouldCreateCycle(value, seen) {
    return value && typeof value === 'object' && seen.has(value);
}

/**
 * Deep merge of objects. Recurses only into plain objects; arrays and other
 * values are replaced (cloned).
 * 
 * Rejects cyclic input by throwing (rather than recursing forever).
 * 
 * @param {...Object} objects
 * @returns {Object}
 * @throws {Error} if a cycle is detected in the input
 */
function deepMerge() {
    var seen = new WeakSet();
    return _deepMergeRecursive(arguments, seen);
}

function _deepMergeRecursive(args, seen) {
    if (args.length === 0) return {};
    if (!_isPlainObject(args[0])) return deepClone(args[0]);

    if (_wouldCreateCycle(args[0], seen)) {
        throw new Error('deepMerge: cyclic input detected');
    }
    seen.add(args[0]);

    var result = deepClone(args[0]);

    for (var i = 1; i < args.length; i++) {
        var obj = args[i];
        if (!_isPlainObject(obj)) continue;
        if (_wouldCreateCycle(obj, seen)) {
            throw new Error('deepMerge: cyclic input detected');
        }
        seen.add(obj);

        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; j++) {
            var k = keys[j];
            if (_isUnsafeObjectKey(k)) continue;
            var rv = result[k];
            var ov = obj[k];
            if (_isPlainObject(rv) && _isPlainObject(ov)) {
                result[k] = _deepMergeRecursive([rv, ov], seen);
            } else {
                result[k] = deepClone(ov);
            }
        }
    }
    return result;
}

function isEmptyObject(obj) {
    if (!obj || typeof obj !== 'object') return true;
    return Object.keys(obj).length === 0;
}

// =============================================================================
// 5. EXPORTS
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
window.merge = merge; // deprecated alias
window.shallowMerge = shallowMerge;
window.deepMerge = deepMerge;
window.isEmptyObject = isEmptyObject;