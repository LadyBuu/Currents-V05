/**
 * =============================================================================
 * STILL WATERS - PERSISTENCE / STORAGE MANAGEMENT (storage.js)
 * =============================================================================
 * 
 * LOCATION: js/core/storage.js
 * 
 * Handles all data persistence.
 * 
 * CACHE INVALIDATION: Uses window.invalidateAccessorCaches() from accessors.js
 * 
 * DEPENDENCIES:
 *   - accessors.js: invalidateAccessorCaches, refreshCaches
 *   - ui.js: showToast
 *   - time.js: getCurrentYearSafe
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. PREVENT RECURSIVE CALLS - FLAGS
// =============================================================================

var _isLoading = false;
var _isSaving = false;
var _saveTimeout = null;
var _storageListenerAdded = false;
var _invalidationPending = false;

// =============================================================================
// 1. INITIALIZE MASTER DATA GLOBALLY
// =============================================================================

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
            residences: [],
            rankInheritanceRules: {},
            disasters: [],
            eventLog: [],
            currentYear: 1250,
            educationalInstitutions: [],
            educationalSubjects: {},
            subjectProgress: {}
        }
    };
}

// =============================================================================
// 2. CONSTANTS
// =============================================================================

var CONFIG = {
    STORAGE_KEY: 'stillwaters_master',
    DEFAULT_YEAR: 1250,
    MAX_HIERARCHY_DEPTH: 20,
    TOAST_DURATION: 2500,
    MAX_ITERATIONS: 20,
    MAX_TOASTS: 20
};

// =============================================================================
// 3. TOAST HELPER
// =============================================================================

function _showToast(message, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    }
}

// =============================================================================
// 4. CACHE INVALIDATION - USES CENTRALIZED ACCESSORS CACHE
// =============================================================================

function _invalidateCaches() {
    if (_invalidationPending) {
        return;
    }
    _invalidationPending = true;
    
    try {
        // Use the centralized cache invalidation from accessors.js
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        
        // Also refresh caches to ensure data is current
        if (typeof window.refreshCaches === 'function') {
            window.refreshCaches();
        }
        
        // Invalidate world cache if available
        if (typeof window.invalidateWorldCache === 'function') {
            window.invalidateWorldCache();
        }
        
        // Dispatch events for UI refresh
        try {
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('masterDataUpdated', { detail: { source: 'storage' } }));
                window.dispatchEvent(new CustomEvent('characterDataChanged'));
            }
        } catch(e) {}
    } catch(e) {}
    finally {
        _invalidationPending = false;
    }
}

// =============================================================================
// 5. LOAD FUNCTION
// =============================================================================

function loadMasterData() {
    if (_isLoading) {
        return false;
    }
    _isLoading = true;
    
    try {
        var stored = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (stored) {
            var parsed = JSON.parse(stored);
            var loadedData = parsed.data || {};
            
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
                    residences: loadedData.residences || [],
                    rankInheritanceRules: loadedData.rankInheritanceRules || {},
                    disasters: loadedData.disasters || [],
                    eventLog: loadedData.eventLog || [],
                    currentYear: loadedData.currentYear || CONFIG.DEFAULT_YEAR,
                    educationalInstitutions: loadedData.educationalInstitutions || [],
                    educationalSubjects: loadedData.educationalSubjects || {},
                    subjectProgress: loadedData.subjectProgress || {}
                }
            };
        }
        
        // Invalidate caches after load
        _invalidateCaches();
        
        _isLoading = false;
        return true;
    } catch (e) {
        _isLoading = false;
        return false;
    }
}

// =============================================================================
// 6. SAVE FUNCTION
// =============================================================================

function saveMasterData(immediate) {
    immediate = immediate || false;
    
    if (_isSaving) {
        return false;
    }
    
    var saveOperation = function() {
        _isSaving = true;
        try {
            // Ensure all required data structures exist
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
            
            // Invalidate caches after save
            _invalidateCaches();
            
            _isSaving = false;
            return true;
        } catch (e) {
            _showToast('Failed to save data', 'error');
            _isSaving = false;
            return false;
        }
    };
    
    if (_saveTimeout) {
        clearTimeout(_saveTimeout);
        _saveTimeout = null;
    }
    
    if (immediate) {
        return saveOperation();
    } else {
        _saveTimeout = setTimeout(saveOperation, 100);
        return true;
    }
}

// =============================================================================
// 7. EDUCATION STATISTICS HELPER
// =============================================================================

function getEducationStatistics() {
    var institutions = window.masterData.data.educationalInstitutions || [];
    var totalStudents = 0;
    var totalTeachers = 0;
    var totalGraduates = 0;
    var totalReputation = 0;
    var totalCapacity = 0;
    
    for (var i = 0; i < institutions.length; i++) {
        var inst = institutions[i];
        totalStudents += inst.students ? inst.students.length : 0;
        totalTeachers += inst.teachers ? inst.teachers.length : 0;
        totalGraduates += inst.graduates ? inst.graduates.length : 0;
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
        var exportObj = {
            type: "master",
            version: "2.0",
            exportDate: new Date().toISOString(),
            data: JSON.parse(JSON.stringify(window.masterData.data))
        };
        
        var dataStr = JSON.stringify(exportObj, null, 2);
        var blob = new Blob([dataStr], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        var dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        a.download = 'stillwaters_master_' + dateStr + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        
        _showToast('Complete master data exported', 'success');
    } catch (e) {
        _showToast('Export failed', 'error');
    }
}

// =============================================================================
// 9. IMPORT FUNCTION
// =============================================================================

function importData() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        
        var reader = new FileReader();
        reader.onload = function(ev) {
            try {
                var imported = JSON.parse(ev.target.result);
                
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
                        residences: imported.residences || [],
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
                
                // Ensure all required data structures exist
                if (!window.masterData.data.educationalInstitutions) window.masterData.data.educationalInstitutions = [];
                if (!window.masterData.data.educationalSubjects) window.masterData.data.educationalSubjects = {};
                if (!window.masterData.data.subjectProgress) window.masterData.data.subjectProgress = {};
                if (!window.masterData.data.residences) window.masterData.data.residences = [];
                if (!window.masterData.data.households) window.masterData.data.households = [];
                
                saveMasterData(true);
                _invalidateCaches();
                
                if (typeof window.forceReloadData === 'function') {
                    window.forceReloadData();
                }
                
                var charCount = window.masterData.data.characters ? window.masterData.data.characters.length : 0;
                _showToast('Data imported successfully (' + charCount + ' characters)', 'success');
                
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
// 10. RESET FUNCTION
// =============================================================================

function resetMasterData() {
    if (confirm('WARNING: This will delete ALL data. Are you sure?')) {
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
        _invalidateCaches();
        
        _showToast('Master data reset', 'info');
    }
}

// =============================================================================
// 11. FORCE RELOAD FUNCTION
// =============================================================================

var _forceReloading = false;

function forceReloadData() {
    if (_forceReloading) {
        return;
    }
    _forceReloading = true;
    
    try {
        loadMasterData();
        _invalidateCaches();
        
        if (typeof window.refreshCaches === 'function') {
            window.refreshCaches();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        
        try {
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('masterDataUpdated', { detail: { source: 'forceReload' } }));
                window.dispatchEvent(new CustomEvent('characterDataChanged'));
            }
        } catch(e) {}
    } catch(e) {}
    finally {
        _forceReloading = false;
    }
}

// =============================================================================
// 12. CROSS-TAB SYNC
// =============================================================================

var _syncTimeout = null;
var _syncing = false;

function initCrossTabSync() {
    if (_storageListenerAdded) {
        return;
    }
    _storageListenerAdded = true;
    
    window.addEventListener('storage', function(e) {
        if (e.key === CONFIG.STORAGE_KEY) {
            if (_syncing) {
                return;
            }
            _syncing = true;
            
            if (_syncTimeout) {
                clearTimeout(_syncTimeout);
            }
            _syncTimeout = setTimeout(function() {
                try {
                    loadMasterData();
                    _invalidateCaches();
                    _showToast('Data updated from another tab', 'info');
                } finally {
                    _syncing = false;
                }
            }, 100);
        }
    });
}

if (typeof window._crossTabSyncInitialized === 'undefined') {
    window._crossTabSyncInitialized = true;
    initCrossTabSync();
}

// =============================================================================
// 13. BACKWARD COMPATIBILITY WRAPPER
// =============================================================================

function showToastMessage(message, type) {
    _showToast(message, type);
}

// =============================================================================
// 14. AUTO-LOAD
// =============================================================================

if (typeof window._storageInitialized === 'undefined') {
    window._storageInitialized = true;
    setTimeout(function() {
        try {
            loadMasterData();
        } catch (e) {}
    }, 50);
}

// =============================================================================
// 15. EXPORTS - SINGLE SOURCE OF TRUTH
// =============================================================================

window.loadMasterData = loadMasterData;
window.saveMasterData = saveMasterData;
window.exportData = exportData;
window.importData = importData;
window.resetMasterData = resetMasterData;
window.getEducationStatistics = getEducationStatistics;
window.forceReloadData = forceReloadData;
window.CONFIG = CONFIG;

// Backward compatibility (deprecated)
window.showToastMessage = showToastMessage;