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
 *   - UI toasts (caller decides how to surface errors)
 *   - Domain access (character, rank, location). The character exporter
 *     resolves those; this file is agnostic about what it's exporting.
 *   - Presentation formatting (see formatting.js)
 *   - CSV formula-injection mitigation (see "CSV SAFETY" below)
 *   - Filename policy (reserved names, download location) — the browser
 *     controls where the file lands; we only sanitize what we hand it.
 *
 * SEMANTIC RULES:
 *   - Serialization errors throw. Callers decide how to surface them.
 *   - No `showToast?.()` or other silent-failure patterns.
 *   - CSV escaping follows RFC 4180: fields are quoted, interior quotes
 *     doubled, CRLF line endings.
 *   - Supplied filename must be a string; missing/omitted defaults to
 *     'export'. Non-string input throws.
 *   - Supplied headers must be an array of non-empty strings.
 *   - CSV rows must be non-null plain objects.
 *   - JSON values that cannot be serialized (undefined, functions,
 *     symbols) throw. Legitimately empty JSON values ([], {}, null,
 *     false, 0, '') are permitted; "empty" is a domain decision and
 *     this generic serializer does not make it.
 *   - Filenames are sanitized: path separators, control characters,
 *     and Windows-invalid characters are replaced.
 *
 * CSV SAFETY:
 *   This module performs NO formula-injection mitigation. A cell whose
 *   value begins with `=`, `+`, `-`, `@`, or a tab may be interpreted
 *   as a formula by spreadsheet software when the CSV is opened. If
 *   Still Waters ever exports attacker-influenced strings, mitigation
 *   (typically prefixing the cell with `'` or a tab) is the export
 *   projection's responsibility, not this serializer's. Silently
 *   altering cell values here would make the CSV an unfaithful
 *   representation of the source data.
 *
 * DEPENDENCIES:
 *   - Browser APIs: Blob, URL, document, setTimeout
 *   - No application or domain dependencies.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    /**
     * Generates a timestamp string suitable for filenames.
     * Format: YYYY-MM-DDTHH-MM-SS (UTC, colons replaced for Windows).
     * @private
     */
    function _timestampForFilename() {
        return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    }

    /**
     * Sanitizes a caller-supplied filename.
     *
     * Precondition: `name` must be a string. Missing filename is handled
     * by the caller (defaults to 'export' before this function is invoked).
     *
     * Replaces path separators, Windows-invalid characters, and control
     * characters with `_`. Collapses whitespace. Truncates to 100 chars.
     * Never returns an empty string.
     *
     * Note: the browser's `a.download` attribute controls the download
     * filename, not a filesystem path. This function guards against
     * accidental path-like input and Windows-invalid characters; it is
     * not filesystem path-traversal protection.
     *
     * @private
     * @param {string} name
     * @returns {string}
     */
    function _sanitizeFilename(name) {
        if (typeof name !== 'string') {
            throw new Error('_sanitizeFilename: name must be a string');
        }
        var clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
        if (clean.length === 0) clean = 'export';
        if (clean.length > 100) clean = clean.slice(0, 100);
        return clean;
    }

    /**
     * Resolves the caller-supplied filename (or undefined/null) to a
     * sanitized base name. Non-string, non-missing values throw.
     * @private
     */
    function _resolveBaseFilename(filename) {
        if (filename === undefined || filename === null) return 'export';
        return _sanitizeFilename(filename);
    }

    /**
     * Triggers a browser download for a Blob.
     *
     * The object URL is revoked on the next task boundary. By the time
     * the timeout fires, the click event has been dispatched and the
     * browser has begun processing the download; revoking earlier is
     * unreliable, and revoking later leaks the URL for longer.
     *
     * @private
     * @param {Blob} blob
     * @param {string} filename
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
        setTimeout(function() {
            URL.revokeObjectURL(url);
        }, 0);
    }

    // =========================================================================
    // 2. CSV EXPORT
    // =========================================================================

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
     * Validates a headers array: every element must be a non-empty string.
     * @private
     */
    function _validateHeaders(headers) {
        if (!Array.isArray(headers)) {
            throw new Error('exportToCSV: headers must be an array when provided');
        }
        for (var i = 0; i < headers.length; i++) {
            var h = headers[i];
            if (typeof h !== 'string') {
                throw new Error(
                    'exportToCSV: headers[' + i + '] must be a string, got ' +
                    (h === null ? 'null' : typeof h)
                );
            }
            if (h.length === 0) {
                throw new Error('exportToCSV: headers[' + i + '] must not be empty');
            }
        }
    }

    /**
     * Validates that a row is a non-null, non-array object.
     * @private
     */
    function _validateRow(row, index) {
        if (row === null || row === undefined) {
            throw new Error('exportToCSV: row ' + index + ' is null or undefined');
        }
        if (typeof row !== 'object') {
            throw new Error(
                'exportToCSV: row ' + index + ' must be an object, got ' + typeof row
            );
        }
        if (Array.isArray(row)) {
            throw new Error('exportToCSV: row ' + index + ' must be an object, not an array');
        }
    }

    /**
     * Exports an array of objects as CSV and triggers download.
     *
     * @param {Array<Object>} data - non-empty array of non-null objects
     * @param {string} [filename] - base name, without extension
     * @param {string[]} [headers] - optional array of non-empty strings;
     *   defaults to the keys of the first row
     * @throws {Error} on invalid input, empty data, or undeterminable headers
     */
    function exportToCSV(data, filename, headers) {
        if (!Array.isArray(data)) {
            throw new Error('exportToCSV: data must be an array');
        }
        if (data.length === 0) {
            throw new Error('exportToCSV: no data to export');
        }

        // Row shape
        for (var r = 0; r < data.length; r++) {
            _validateRow(data[r], r);
        }

        // Headers
        var actualHeaders;
        if (headers !== undefined && headers !== null) {
            _validateHeaders(headers);
            actualHeaders = headers;
        } else {
            actualHeaders = Object.keys(data[0]);
        }
        if (actualHeaders.length === 0) {
            throw new Error('exportToCSV: could not determine headers');
        }

        // Serialize
        var lines = [];
        lines.push(actualHeaders.map(_csvEscape).join(','));

        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var cells = [];
            for (var j = 0; j < actualHeaders.length; j++) {
                cells.push(_csvEscape(row[actualHeaders[j]]));
            }
            lines.push(cells.join(','));
        }

        // RFC 4180 uses CRLF line endings.
        var csvContent = lines.join('\r\n');

        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        var base = _resolveBaseFilename(filename);
        var ts = _timestampForFilename();
        _downloadBlob(blob, base + '_' + ts + '.csv');
    }

    // =========================================================================
    // 3. JSON EXPORT
    // =========================================================================

    /**
     * Exports a value as a pretty-printed JSON file.
     *
     * Values that JSON.stringify cannot meaningfully serialize (undefined,
     * functions, symbols, or anything else that stringifies to the JS
     * value `undefined`) throw. Legitimately empty JSON values ([], {},
     * null, false, 0, '') are permitted: "empty" is a domain decision
     * and this generic serializer does not make it.
     *
     * @param {*} data
     * @param {string} [filename] - base name, without extension
     * @throws {Error} if data stringifies to undefined, or if serialization
     *   fails (e.g., circular references, BigInt)
     */
    function exportToJSON(data, filename) {
        var jsonStr;
        try {
            jsonStr = JSON.stringify(data, null, 2);
        } catch (e) {
            throw new Error('exportToJSON: failed to serialize data (' + e.message + ')');
        }

        if (jsonStr === undefined) {
            throw new Error(
                'exportToJSON: value cannot be serialized to JSON ' +
                '(undefined, function, or symbol)'
            );
        }

        var blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
        var base = _resolveBaseFilename(filename);
        var ts = _timestampForFilename();
        _downloadBlob(blob, base + '_' + ts + '.json');
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.exportToCSV = exportToCSV;
    window.exportToJSON = exportToJSON;

})();