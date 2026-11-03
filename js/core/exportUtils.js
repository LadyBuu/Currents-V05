/**
 * =============================================================================
 * STILL WATERS - EXPORT UTILITIES (exportUtils.js)
 * =============================================================================
 *
 * SCOPE:
 *   - Generic CSV serialization → file download
 *   - Generic JSON serialization → file download
 *   - Import: read a JSON file, normalize, install into masterData, save
 *   - Export: download the current masterData envelope as JSON
 *
 * DEPENDENCIES (REQUIRED for import/export):
 *   - storage.js        (saveMasterData)
 *   - storage-schema.js (normalizeMasterData, STORAGE_SCHEMA_VERSION)
 *   - accessors.js      (invalidateAccessorCaches)
 *
 * DEPENDENCIES (REQUIRED for CSV/JSON download):
 *   - Browser APIs: Blob, URL, document, setTimeout, FileReader
 *
 * ICON POLICY: No emojis. No icons.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _timestampForFilename() {
        return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    }

    function _sanitizeFilename(name) {
        if (typeof name !== 'string') {
            throw new Error('_sanitizeFilename: name must be a string');
        }
        var clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
        if (clean.length === 0) clean = 'export';
        if (clean.length > 100) clean = clean.slice(0, 100);
        return clean;
    }

    function _resolveBaseFilename(filename) {
        if (filename === undefined || filename === null) return 'export';
        return _sanitizeFilename(filename);
    }

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
    // CSV EXPORT
    // =========================================================================

    function _csvEscape(value) {
        if (value === undefined || value === null) return '""';
        var str = String(value);
        return '"' + str.replace(/"/g, '""') + '"';
    }

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

    function exportToCSV(data, filename, headers) {
        if (!Array.isArray(data)) {
            throw new Error('exportToCSV: data must be an array');
        }
        if (data.length === 0) {
            throw new Error('exportToCSV: no data to export');
        }

        for (var r = 0; r < data.length; r++) {
            _validateRow(data[r], r);
        }

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

        var csvContent = lines.join('\r\n');

        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        var base = _resolveBaseFilename(filename);
        var ts = _timestampForFilename();
        _downloadBlob(blob, base + '_' + ts + '.csv');
    }

    // =========================================================================
    // JSON EXPORT (generic value)
    // =========================================================================

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
    // MASTERDATA EXPORT (topbar Export button)
    // =========================================================================

    /**
     * Downloads the current masterData envelope as JSON.
     * Throws if masterData is not present. The caller is expected to
     * surface the error (e.g. via showToast).
     */
    function exportData() {
        if (!window.masterData) {
            throw new Error('No data to export');
        }
        exportToJSON(window.masterData, 'stillwaters_export');
    }

    // =========================================================================
    // IMPORT (topbar Import button)
    // =========================================================================

    /**
     * Opens a file picker and imports a JSON file.
     * Returns a Promise that resolves ONLY after the file has been read,
     * parsed, normalized, saved, and cache-invalidated. A caller that does
     * `.then(() => showToast('Import successful'))` sees the toast only
     * after the import is actually done.
     *
     * Rejects on: no file chosen, read error, JSON parse error, malformed
     * envelope (no `.data` or no `.data.places`), save failure.
     */
    function importData() {
        return new Promise(function(resolve, reject) {
            var fileInput = document.getElementById('fileInput');
            if (!fileInput) {
                // Create a hidden input if the page didn't provide one.
                fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.json';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);
            }

            fileInput.value = '';

            var onChange = function(e) {
                fileInput.removeEventListener('change', onChange);

                var file = e.target.files && e.target.files[0];
                if (!file) {
                    reject(new Error('No file selected'));
                    return;
                }

                var reader = new FileReader();
                reader.onload = function(ev) {
                    try {
                        var parsed = JSON.parse(ev.target.result);
                        var dataToInstall = parsed.data || parsed;

                        if (!dataToInstall || !Array.isArray(dataToInstall.places)) {
                            reject(new Error('Invalid JSON: not a Still Waters export'));
                            return;
                        }

                        if (typeof window.normalizeMasterData !== 'function') {
                            reject(new Error('storage-schema.js not loaded'));
                            return;
                        }

                        var envelope = window.normalizeMasterData({
                            schemaVersion: window.STORAGE_SCHEMA_VERSION,
                            savedAt: new Date().toISOString(),
                            data: dataToInstall
                        });

                        window.masterData = envelope;

                        if (typeof window.invalidateAccessorCaches === 'function') {
                            try { window.invalidateAccessorCaches(); } catch (e) { /* ignore */ }
                        }
                        if (typeof window.markDataDirty === 'function') {
                            try { window.markDataDirty(); } catch (e) { /* ignore */ }
                        }
                        if (typeof window.saveMasterData === 'function') {
                            var ok = window.saveMasterData();
                            if (ok === false) {
                                reject(new Error('Save failed after import'));
                                return;
                            }
                        }

                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = function() {
                    reject(new Error('Failed to read file'));
                };
                reader.readAsText(file);
            };

            fileInput.addEventListener('change', onChange);
            fileInput.click();
        });
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.exportToCSV = exportToCSV;
    window.exportToJSON = exportToJSON;
    window.exportData = exportData;
    window.importData = importData;

})();
