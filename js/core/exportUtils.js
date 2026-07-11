/**
 * =============================================================================
 * STILL WATERS - EXPORT UTILITIES (exportUtils.js)
 * =============================================================================
 * 
 * LOCATION: js/core/exportUtils.js
 * 
 * This file contains data export functions for CSV and JSON.
 * 
 * DEPENDENCIES:
 *   - js/core/ui/ui.js (showToast - optional, uses safe fallback)
 *   - js/core/time.js (calculateAge - optional)
 *   - js/core/accessors.js (getActiveRankDisplay - optional)
 *   - js/core/world.js (getCurrentLocation - optional)
 * 
 * =============================================================================
 * EXPORTED FUNCTIONS (on window):
 * =============================================================================
 * 
 * CSV Export:
 *   - exportToCSV(data, filename, headers) - Exports array of objects as CSV file
 *     - data: Array of objects to export
 *     - filename: Filename without extension (default 'export')
 *     - headers: Optional custom headers array (default: Object.keys(data[0]))
 * 
 * JSON Export:
 *   - exportToJSON(data, filename) - Exports object/array as JSON file
 *     - data: Data to export (object or array)
 *     - filename: Filename without extension (default 'export')
 * 
 * Character-Specific Exports:
 *   - exportCharactersToCSV(characters, filename) - Exports character array to CSV
 *     - Columns: Name, Surname, Gender, BirthYear, Age, Status, Rank, Location, Household, Notes
 *     - Uses optional helpers if available (calculateAge, getActiveRankDisplay, getCurrentLocation)
 * 
 *   - exportMasterData() - Exports complete masterData to JSON
 *     - Filename: stillwaters_master_YYYY-MM-DDThh-mm-ss.json
 *     - Shows error toast if masterData not available
 * 
 * =============================================================================
 * USAGE EXAMPLES:
 * =============================================================================
 * 
 * // Export any data to CSV
 * const characters = getCharacters();
 * exportToCSV(characters, 'character_export', ['name', 'birthYear']);
 * 
 * // Export to JSON
 * const filteredData = applyFilters(allData);
 * exportToJSON(filteredData, 'filtered_results');
 * 
 * // Export characters with full details
 * exportCharactersToCSV(filteredCharacters, 'my_characters');
 * 
 * // Export complete master data
 * exportMasterData();
 * 
 * =============================================================================
 * DEPENDENCY NOTES:
 * =============================================================================
 * 
 * - showToast is called with optional chaining (?.) so no error if ui.js not loaded
 * - calculateAge, getActiveRankDisplay, getCurrentLocation used with optional chaining
 * - File download uses Blob and URL.createObjectURL for modern browser support
 * - Filename includes ISO timestamp to prevent collisions
 * - CSV escaping handles quotes by doubling them (RFC 4180)
 * 
 * =============================================================================
 */

// =============================================================================
// 1. CSV EXPORT
// =============================================================================

/**
 * Exports data as CSV and triggers download
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Filename without extension
 * @param {Array} headers - Optional custom headers (default: Object.keys(data[0]))
 */
function exportToCSV(data, filename = 'export', headers = null) {
    if (!data || data.length === 0) {
        showToast?.('No data to export', 'error');
        return;
    }
    
    const actualHeaders = headers || Object.keys(data[0]);
    const rows = data.map(row => actualHeaders.map(h => {
        let val = row[h];
        if (val === undefined || val === null) val = '';
        return `"${String(val).replace(/"/g, '""')}"`;
    }).join(','));
    
    const csvContent = [actualHeaders.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    a.download = `${filename}_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.('CSV exported', 'success');
}

/**
 * Exports data as JSON and triggers download
 * @param {Object} data - Data to export (object or array)
 * @param {string} filename - Filename without extension
 */
function exportToJSON(data, filename = 'export') {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    a.download = `${filename}_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.('JSON exported', 'success');
}

/**
 * Exports filtered characters to CSV
 * @param {Array} characters - Array of character objects
 * @param {string} filename - Optional filename
 */
function exportCharactersToCSV(characters, filename = 'characters') {
    const exportData = characters.map(c => ({
        Name: c.name,
        Surname: c.surname || '',
        Gender: c.gender,
        BirthYear: c.birthYear || '',
        Age: calculateAge?.(c.birthYear, c.isDeceased, c.deathYear) || '',
        Status: c.isDeceased ? 'Deceased' : 'Living',
        Rank: getActiveRankDisplay?.(c)?.name || '',
        Location: getCurrentLocation?.(c) || '',
        Household: c.household || '',
        Notes: c.notes || ''
    }));
    
    exportToCSV(exportData, filename);
}

/**
 * Exports all master data to JSON
 */
function exportMasterData() {
    if (typeof masterData !== 'undefined' && masterData) {
        exportToJSON(masterData, 'stillwaters_master');
    } else {
        showToast?.('No master data to export', 'error');
    }
}

// =============================================================================
// 2. EXPORTS
// =============================================================================

window.exportToCSV = exportToCSV;
window.exportToJSON = exportToJSON;
window.exportCharactersToCSV = exportCharactersToCSV;
window.exportMasterData = exportMasterData;
