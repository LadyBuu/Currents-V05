/**
 * =============================================================================
 * STILL WATERS - EXPORT UTILITIES (exportUtils.js)
 * =============================================================================
 * 
 * LOCATION: js/core/exportUtils.js
 * 
 * SCOPE:
 *   - Generic CSV serialization → file download
 *   - Generic JSON serialization → file download
 * 
 * OUT OF SCOPE:
 *   - Character-specific projection (see character-export.js)
 *   - UI toasts (caller decides)
 *   - Domain access (character, rank, location) — the character exporter
 *     resolves those; this file is agnostic.
 * 
 * SEMANTIC RULES:
 *   - Serialization errors throw. Callers decide how to surface them.
 *   - No `showToast?.()` or other silent-failure patterns.
 *   - CSV escaping handles quotes per RFC 4180 by doubling them.
 *   - Filenames are sanitized to prevent path traversal.
 * 
 * DEPENDENCIES: None. Pure serialization.
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. HELPERS
// =============================================================================

/**
 * Generates a timestamp string suitable for filenames.
 * Format: YYYY-MM-DDTHH-MM-SS
 * @private
 */
function _timestampForFilename() {
    return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
}

/**
 * Sanitizes a filename: removes path separators and control characters,
 * truncates to a reasonable length.
 * @private
 */
function _sanitizeFilename(name) {
    if (!name || typeof name !== 'string') return 'export';
    var clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
    if (clean.length === 0) clean = 'export';
    if (clean.length > 100) clean = clean.slice(0, 100);
    return clean;
}

/**
 * Triggers a browser download for a Blob.
 * @private
 */
function _downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after a tick to ensure the download has started
    setTimeout(function() {
        URL.revokeObjectURL(url);
    }, 100);
}

// =============================================================================
// 2. CSV EXPORT
// =============================================================================

/**
 * Escapes a single CSV field. Quotes every field and doubles interior
 * quotes per RFC 4180.
 * @private
 */
function _csvEscape(value) {
    if (value === undefined || value === null) return '""';
    var str = String(value);
    return '"' + str.replace(/"/g, '""') + '"';
}

/**
 * Exports an array of objects as CSV and triggers download.
 * 
 * @param {Array<Object>} data
 * @param {string} [filename] - without extension
 * @param {string[]} [headers] - optional; defaults to keys of first row
 * @throws {Error} if data is not an array or is empty
 */
function exportToCSV(data, filename, headers) {
    if (!Array.isArray(data)) {
        throw new Error('exportToCSV: data must be an array');
    }
    if (data.length === 0) {
        throw new Error('exportToCSV: no data to export');
    }

    var actualHeaders = headers;
    if (!Array.isArray(actualHeaders) || actualHeaders.length === 0) {
        actualHeaders = Object.keys(data[0]);
    }
    if (actualHeaders.length === 0) {
        throw new Error('exportToCSV: could not determine headers');
    }

    var lines = [];
    lines.push(actualHeaders.map(_csvEscape).join(','));

    for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var cells = [];
        for (var j = 0; j < actualHeaders.length; j++) {
            var key = actualHeaders[j];
            var val = row ? row[key] : '';
            cells.push(_csvEscape(val));
        }
        lines.push(cells.join(','));
    }

    var csvContent = lines.join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    var base = _sanitizeFilename(filename || 'export');
    var ts = _timestampForFilename();
    _downloadBlob(blob, base + '_' + ts + '.csv');
}

// =============================================================================
// 3. JSON EXPORT
// =============================================================================

/**
 * Exports an object or array as a pretty-printed JSON file.
 * 
 * @param {Object|Array} data
 * @param {string} [filename] - without extension
 * @throws {Error} if serialization fails (e.g., circular references)
 */
function exportToJSON(data, filename) {
    if (data === undefined) {
        throw new Error('exportToJSON: data is undefined');
    }

    var jsonStr;
    try {
        jsonStr = JSON.stringify(data, null, 2);
    } catch (e) {
        throw new Error('exportToJSON: failed to serialize data (' + e.message + ')');
    }

    var blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    var base = _sanitizeFilename(filename || 'export');
    var ts = _timestampForFilename();
    _downloadBlob(blob, base + '_' + ts + '.json');
}

// =============================================================================
// 4. EXPORTS
// =============================================================================

window.exportToCSV = exportToCSV;
window.exportToJSON = exportToJSON;