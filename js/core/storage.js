/**
 * =============================================================================
 * STILL WATERS - PERSISTENCE / STORAGE MANAGEMENT (storage.js)
 * =============================================================================
 * 
 * LOCATION: js/core/storage.js
 * 
 * Handles all data persistence including education system storage.
 * 
 * ICON STYLE: Monochrome, simple icons using standard unicode/text symbols
 * 
 * DEPENDENCIES:
 *   - js/core/ui/ui.js (for showToast - will use if available)
 *   - js/core/time.js (for getCurrentYearSafe - optional)
 * 
 * FIXED:
 *   - invalidateAccessorCaches called on all data changes
 *   - characterDataChanged event dispatched for selector refresh
 *   - forceReloadData function for aggressive cache clearing
 *   - Recursion guards on all cache invalidation functions
 * 
 * =============================================================================
 * EXPORTED FUNCTIONS & PROPERTIES (on window):
 * =============================================================================
 * 
 * Global Data Object:
 *   - window.masterData - Main data store with version, lastUpdated, and data object
 * 
 * Constants:
 *   - window.CONFIG - Configuration object with STORAGE_KEY, DEFAULT_YEAR, MAX_HIERARCHY_DEPTH, TOAST_DURATION, MAX_ITERATIONS, MAX_TOASTS
 * 
 * Core CRUD Operations:
 *   - loadMasterData() - Loads data from localStorage and initializes masterData
 *   - saveMasterData() - Saves current masterData to localStorage
 *   - exportData() - Exports complete master data as downloadable JSON file
 *   - importData() - Imports data from JSON file (handles multiple export formats)
 *   - resetMasterData() - Resets ALL data (destructive, with confirmation dialog)
 * 
 * Education Statistics:
 *   - getEducationStatistics() - Quick stats about education system (institution count, students, teachers, graduates)
 * 
 * Cross-Tab Sync:
 *   - initCrossTabSync() - Auto-initialized on load, syncs changes across tabs
 * 
 * Events:
 *   - 'masterDataUpdated' - Custom event dispatched after load, save, import, or reset
 *   - 'characterDataChanged' - Custom event dispatched after data changes (for selector refresh)
 * 
 * Backward Compatibility (Deprecated):
 *   - window.showToastMessage(message, type) - @deprecated Use window.showToast() from ui.js instead
 * 
 * =============================================================================
 * NOTES:
 * =============================================================================
 * 
 * Import handles three export formats:
 *   1. {"type": "master", "data": {...}} - Full master export
 *   2. {"data": {"characters": [...], ...}} - Nested data export
 *   3. {"characters": [...], ...} - Direct data export
 * 
 * Cache Invalidation After Data Changes:
 *   - Calls invalidateAccessorCaches() if available (from accessors.js)
 *   - Calls refreshCaches() if available (from accessors.js)
 *   - Dispatches characterDataChanged event for selector refresh
 * 
 * Education System Storage:
 *   - educationalInstitutions[] - Array of institution objects
 *   - educationalSubjects{} - Mapping of subject IDs to subject definitions
 *   - subjectProgress{} - Character proficiency tracking
 * 
 * RESIDENCE SYSTEM STORAGE:
 *   - residences[] - Array of residence objects (buildings, properties)
 * 
 * =============================================================================
 */

// =============================================================================
// 0. PREVENT RECURSIVE CALLS - FLAGS
// =============================================================================

let _isLoading = false;
let _isSaving = false;
let _saveTimeout = null;
let _invalidatingStorage = false;
let _storageListenerAdded = false;

// =============================================================================
// 1. INITIALIZE MASTER DATA GLOBALLY (MUST BE FIRST)
// =============================================================================

// Initialize window.masterData BEFORE anything tries to read it
if (typeof window.masterData === 'undefined') {
    window.masterData = {
        version: "2.0",
        lastUpdated: new Date().toISOString(),
        data: {
            characters: [],
            places: [],
            ranks: [],
            roles: [],
            locationTypes: [],
            governmentTypes: [],
            nameLists: {},
            cityNameParts: {},
            governments: [],
            households: [],
            residences: [],           // RESIDENCE SYSTEM - stores all buildings/properties
            rankInheritanceRules: {},
            disasters: [],
            eventLog: [],
            currentYear: 1250,
            // Education system storage arrays
            educationalInstitutions: [],
            educationalSubjects: {},
            subjectProgress: {}
        }
    };
}

// =============================================================================
// 2. CONSTANTS
// =============================================================================

const CONFIG = {
    STORAGE_KEY: 'stillwaters_master',
    DEFAULT_YEAR: 1250,
    MAX_HIERARCHY_DEPTH: 20,
    TOAST_DURATION: 2500,
    MAX_ITERATIONS: 20,
    MAX_TOASTS: 20
};

// =============================================================================
// 3. TOAST HELPER (uses ui.js if available, otherwise console fallback)
// =============================================================================

/**
 * Shows a toast message using the UI system if available
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', 'warning', 'info'
 */
function _showToast(message, type) {
    // Prefer the modern UI toast system
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } 
    // Fallback to console with monochrome icons if UI not loaded yet
    else {
        const prefix = type === 'error' ? '✗' : (type === 'success' ? '✓' : '⌇');
        console.log(`${prefix} ${message}`);
    }
}

// =============================================================================
// 4. CACHE INVALIDATION HELPER - FIXED with recursion guard
// =============================================================================

function _invalidateCaches() {
    // PREVENT INFINITE RECURSION
    if (_invalidatingStorage) {
        console.warn('_invalidateCaches: already running, skipping');
        return;
    }
    _invalidatingStorage = true;
    
    try {
        // Invalidate accessor caches
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        // Refresh caches
        if (typeof window.refreshCaches === 'function') {
            window.refreshCaches();
        }
        // Invalidate world cache
        if (typeof window.invalidateWorldCache === 'function') {
            window.invalidateWorldCache();
        }
        // Invalidate settlement cache
        if (typeof window.invalidateSettlementCache === 'function') {
            window.invalidateSettlementCache();
        }
        // Invalidate population cache
        if (typeof window.invalidatePopulationCache === 'function') {
            window.invalidatePopulationCache();
        }
        // Invalidate character selector
        if (typeof window.invalidateCharacterSelector === 'function') {
            window.invalidateCharacterSelector();
        }
        // Dispatch events for UI refresh
        try {
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('masterDataUpdated', { detail: { source: 'invalidate' } }));
                window.dispatchEvent(new CustomEvent('characterDataChanged'));
            }
        } catch(e) {}
    } catch(e) {
        console.warn('Error in _invalidateCaches:', e);
    } finally {
        _invalidatingStorage = false;
    }
}

// =============================================================================
// 5. LOAD FUNCTION (with recursion prevention)
// =============================================================================

function loadMasterData() {
    // Prevent recursive calls
    if (_isLoading) {
        console.warn('loadMasterData already in progress, skipping recursive call');
        return false;
    }
    
    _isLoading = true;
    
    try {
        const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            
            // Ensure all required data structures exist
            const loadedData = parsed.data || {};
            
            window.masterData = {
                version: parsed.version || "2.0",
                lastUpdated: parsed.lastUpdated || new Date().toISOString(),
                data: {
                    characters: loadedData.characters || [],
                    places: loadedData.places || [],
                    ranks: loadedData.ranks || [],
                    roles: loadedData.roles || [],
                    locationTypes: loadedData.locationTypes || [],
                    governmentTypes: loadedData.governmentTypes || [],
                    nameLists: loadedData.nameLists || {},
                    cityNameParts: loadedData.cityNameParts || {},
                    governments: loadedData.governments || [],
                    households: loadedData.households || [],
                    residences: loadedData.residences || [],           // LOAD RESIDENCES
                    rankInheritanceRules: loadedData.rankInheritanceRules || {},
                    disasters: loadedData.disasters || [],
                    eventLog: loadedData.eventLog || [],
                    currentYear: loadedData.currentYear || CONFIG.DEFAULT_YEAR,
                    // Load education data if exists, otherwise initialize empty
                    educationalInstitutions: loadedData.educationalInstitutions || [],
                    educationalSubjects: loadedData.educationalSubjects || {},
                    subjectProgress: loadedData.subjectProgress || {}
                }
            };
            
            console.log('✓ Master data loaded from localStorage');
            console.log(`   Institutions: ${window.masterData.data.educationalInstitutions?.length || 0}`);
            console.log(`   Characters: ${window.masterData.data.characters?.length || 0}`);
            console.log(`   Residences: ${window.masterData.data.residences?.length || 0}`);
        } else {
            console.log('No saved master data found, using defaults');
        }
        
        // Invalidate caches after load
        _invalidateCaches();
        
        // Dispatch event for other modules
        if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('masterDataUpdated', { detail: { source: 'load' } }));
            window.dispatchEvent(new CustomEvent('characterDataChanged'));
        }
        
        _isLoading = false;
        return true;
    } catch (e) {
        console.error('Error loading master data', e);
        _isLoading = false;
        return false;
    }
}

// =============================================================================
// 6. SAVE FUNCTION (with debounce and recursion prevention)
// =============================================================================

function saveMasterData(immediate) {
    immediate = immediate || false;
    
    // Prevent recursive calls
    if (_isSaving) {
        console.warn('saveMasterData already in progress, skipping recursive call');
        return false;
    }
    
    const saveOperation = function() {
        _isSaving = true;
        try {
            // Ensure data structure is complete before saving
            if (!window.masterData.data.educationalInstitutions) {
                window.masterData.data.educationalInstitutions = [];
            }
            if (!window.masterData.data.educationalSubjects) {
                window.masterData.data.educationalSubjects = {};
            }
            if (!window.masterData.data.subjectProgress) {
                window.masterData.data.subjectProgress = {};
            }
            if (!window.masterData.data.residences) {
                window.masterData.data.residences = [];
            }
            if (!window.masterData.data.households) {
                window.masterData.data.households = [];
            }
            
            window.masterData.lastUpdated = new Date().toISOString();
            window.masterData.data.currentYear = window.masterData.data.currentYear || CONFIG.DEFAULT_YEAR;
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(window.masterData));
            console.log('⌇ Master data saved to localStorage');
            console.log(`   Institutions saved: ${window.masterData.data.educationalInstitutions?.length || 0}`);
            console.log(`   Residences saved: ${window.masterData.data.residences?.length || 0}`);
            
            // Invalidate caches after save
            _invalidateCaches();
            
            // Dispatch event for other modules
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('masterDataUpdated', { detail: { source: 'save' } }));
                window.dispatchEvent(new CustomEvent('characterDataChanged'));
            }
            
            _isSaving = false;
            return true;
        } catch (e) {
            console.error('Error saving master data', e);
            _showToast('Failed to save data', 'error');
            _isSaving = false;
            return false;
        }
    };
    
    // Clear any pending timeout
    if (_saveTimeout) {
        clearTimeout(_saveTimeout);
        _saveTimeout = null;
    }
    
    if (immediate) {
        return saveOperation();
    } else {
        // Debounce saves to prevent excessive writes
        _saveTimeout = setTimeout(saveOperation, 100);
        return true;
    }
}

// =============================================================================
// 7. EDUCATION STATISTICS HELPER
// =============================================================================

/**
 * Gets education statistics from master data (fast, no processing)
 * @returns {Object} Education statistics
 */
function getEducationStatistics() {
    const institutions = window.masterData.data.educationalInstitutions || [];
    let totalStudents = 0;
    let totalTeachers = 0;
    let totalGraduates = 0;
    let totalReputation = 0;
    let totalCapacity = 0;
    
    for (const inst of institutions) {
        totalStudents += inst.students?.length || 0;
        totalTeachers += inst.teachers?.length || 0;
        totalGraduates += inst.graduates?.length || 0;
        totalReputation += inst.reputation || 50;
        totalCapacity += inst.maxStudents || 0;
    }
    
    return {
        institutionCount: institutions.length,
        totalStudents: totalStudents,
        totalTeachers: totalTeachers,
        totalGraduates: totalGraduates,
        totalCapacity: totalCapacity,
        averageReputation: institutions.length > 0 ? Math.round(totalReputation / institutions.length) : 0,
        studentTeacherRatio: totalTeachers > 0 ? (totalStudents / totalTeachers).toFixed(1) : 0,
        capacityUtilization: totalCapacity > 0 ? Math.round((totalStudents / totalCapacity) * 100) : 0
    };
}

// =============================================================================
// 8. EXPORT FUNCTION
// =============================================================================

function exportData() {
    try {
        const exportObj = {
            type: "master",
            version: "2.0",
            exportDate: new Date().toISOString(),
            data: JSON.parse(JSON.stringify(window.masterData.data)) // deep clone
        };
        
        const dataStr = JSON.stringify(exportObj, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        a.download = `stillwaters_master_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        
        _showToast('Complete master data exported', 'success');
    } catch (e) {
        console.error('Export failed:', e);
        _showToast('Export failed', 'error');
    }
}

// =============================================================================
// 9. IMPORT FUNCTION - FIXED with cache invalidation
// =============================================================================

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const imported = JSON.parse(ev.target.result);
                
                // Handle different export formats
                if (imported.type === "master" && imported.data) {
                    window.masterData.data = imported.data;
                } else if (imported.data && imported.data.characters) {
                    window.masterData.data = imported.data;
                } else if (imported.characters) {
                    window.masterData.data = {
                        characters: imported.characters,
                        places: imported.places || [],
                        ranks: imported.ranks || [],
                        roles: imported.roles || [],
                        locationTypes: imported.locationTypes || [],
                        governmentTypes: imported.governmentTypes || [],
                        nameLists: imported.nameLists || {},
                        cityNameParts: imported.cityNameParts || {},
                        governments: imported.governments || [],
                        households: imported.households || [],
                        residences: imported.residences || [],           // IMPORT RESIDENCES
                        rankInheritanceRules: imported.rankInheritanceRules || {},
                        disasters: imported.disasters || [],
                        eventLog: imported.eventLog || [],
                        currentYear: imported.currentYear || CONFIG.DEFAULT_YEAR,
                        educationalInstitutions: imported.educationalInstitutions || [],
                        educationalSubjects: imported.educationalSubjects || {},
                        subjectProgress: imported.subjectProgress || {}
                    };
                } else {
                    _showToast('Unable to parse file format - not a valid Still Waters export', 'error');
                    return;
                }
                
                // Ensure education arrays exist
                if (!window.masterData.data.educationalInstitutions) window.masterData.data.educationalInstitutions = [];
                if (!window.masterData.data.educationalSubjects) window.masterData.data.educationalSubjects = {};
                if (!window.masterData.data.subjectProgress) window.masterData.data.subjectProgress = {};
                if (!window.masterData.data.residences) window.masterData.data.residences = [];
                if (!window.masterData.data.households) window.masterData.data.households = [];
                
                // Force immediate save
                saveMasterData(true);
                
                // CRITICAL: Invalidate all caches after import
                _invalidateCaches();
                
                // Force reload of data
                if (typeof window.forceReloadData === 'function') {
                    window.forceReloadData();
                }
                
                // Dispatch events for UI refresh
                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('masterDataUpdated', { detail: { source: 'import' } }));
                    window.dispatchEvent(new CustomEvent('characterDataChanged'));
                }
                
                // Show success message with count
                const charCount = window.masterData.data.characters?.length || 0;
                _showToast(`✓ Data imported successfully (${charCount} characters)`, 'success');
                
            } catch(err) {
                _showToast('Invalid JSON: ' + err.message, 'error');
            }
        };
        reader.onerror = function() {
            _showToast('Error reading file', 'error');
        };
        reader.readAsText(file);
    };
    input.click();
}

// =============================================================================
// 10. RESET FUNCTION (with cache invalidation)
// =============================================================================

function resetMasterData() {
    if (confirm('⚠️ WARNING: This will delete ALL data. Are you sure?')) {
        window.masterData = {
            version: "2.0",
            lastUpdated: new Date().toISOString(),
            data: {
                characters: [],
                places: [],
                ranks: [],
                roles: [],
                locationTypes: [],
                governmentTypes: [],
                nameLists: {},
                cityNameParts: {},
                governments: [],
                households: [],
                residences: [],
                rankInheritanceRules: {},
                disasters: [],
                eventLog: [],
                currentYear: CONFIG.DEFAULT_YEAR,
                educationalInstitutions: [],
                educationalSubjects: {},
                subjectProgress: {}
            }
        };
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        saveMasterData(true);
        
        // Invalidate caches
        _invalidateCaches();
        
        if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('masterDataUpdated', { detail: { source: 'reset' } }));
            window.dispatchEvent(new CustomEvent('characterDataChanged'));
        }
        
        _showToast('Master data reset', 'info');
    }
}

// =============================================================================
// 11. FORCE RELOAD FUNCTION - FIXED with recursion guard
// =============================================================================

let _forceReloading = false;

/**
 * Forces a complete reload of all data and invalidates all caches
 * This is the most aggressive cache clearing function
 */
function forceReloadData() {
    // PREVENT INFINITE RECURSION
    if (_forceReloading) {
        console.warn('forceReloadData: already running, skipping');
        return;
    }
    _forceReloading = true;
    
    try {
        console.log('⌇ Force reloading all data...');
        
        // Reload from storage
        loadMasterData();
        
        // Invalidate all caches
        _invalidateCaches();
        
        // Force refresh in accessors
        if (typeof window.refreshCaches === 'function') {
            window.refreshCaches();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        
        // Dispatch events
        try {
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('masterDataUpdated', { detail: { source: 'forceReload' } }));
                window.dispatchEvent(new CustomEvent('characterDataChanged'));
            }
        } catch(e) {}
        
        console.log(`✓ Data reloaded: ${window.masterData.data.characters?.length || 0} characters`);
    } catch(e) {
        console.warn('Error in forceReloadData:', e);
    } finally {
        _forceReloading = false;
    }
}

// =============================================================================
// 12. CROSS-TAB SYNC (with debounce and recursion guard)
// =============================================================================

let _syncTimeout = null;
let _syncing = false;

function initCrossTabSync() {
    // Prevent multiple initializations
    if (_storageListenerAdded) {
        return;
    }
    _storageListenerAdded = true;
    
    window.addEventListener('storage', function(e) {
        if (e.key === CONFIG.STORAGE_KEY) {
            // Prevent recursive sync
            if (_syncing) {
                return;
            }
            _syncing = true;
            
            // Debounce sync to prevent multiple rapid updates
            if (_syncTimeout) {
                clearTimeout(_syncTimeout);
            }
            _syncTimeout = setTimeout(function() {
                try {
                    loadMasterData();
                    _invalidateCaches();
                    if (typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new CustomEvent('masterDataUpdated', { detail: { source: 'storage' } }));
                        window.dispatchEvent(new CustomEvent('characterDataChanged'));
                    }
                    _showToast('Data updated from another tab', 'info');
                } finally {
                    _syncing = false;
                }
            }, 100);
        }
    });
}

// Initialize cross-tab sync (only once)
if (typeof window._crossTabSyncInitialized === 'undefined') {
    window._crossTabSyncInitialized = true;
    initCrossTabSync();
}

// =============================================================================
// 13. BACKWARD COMPATIBILITY WRAPPERS
// =============================================================================

/**
 * @deprecated Use _showToast or window.showToast instead
 * Kept for backward compatibility with older code
 */
function showToastMessage(message, type) {
    _showToast(message, type);
}

// =============================================================================
// 14. AUTO-LOAD ON PAGE LOAD (with protection)
// =============================================================================

// Only auto-load if not already loaded and not in a recursive loop
if (typeof window._storageInitialized === 'undefined') {
    window._storageInitialized = true;
    
    // Small delay to ensure other modules are ready
    setTimeout(function() {
        try {
            loadMasterData();
        } catch (e) {
            console.error('Failed to auto-load master data:', e);
        }
    }, 50);
}

// =============================================================================
// 15. EXPORTS
// =============================================================================

window.loadMasterData = loadMasterData;
window.saveMasterData = saveMasterData;
window.exportData = exportData;
window.importData = importData;
window.resetMasterData = resetMasterData;
window.getEducationStatistics = getEducationStatistics;
window.forceReloadData = forceReloadData;
window.CONFIG = CONFIG;

// Backward compatibility (deprecated - will be removed in future)
window.showToastMessage = showToastMessage;

console.log(`   Characters: ${window.masterData.data.characters?.length || 0}`);
console.log(`   Institutions: ${window.masterData.data.educationalInstitutions?.length || 0}`);
console.log(`   Residences: ${window.masterData.data.residences?.length || 0}`);
