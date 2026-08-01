/**
 * =============================================================================
 * STILL WATERS - EDUCATION TAB UI (systems/roles/ui/educationTabUI.js)
 * =============================================================================
 * 
 * This file contains the Education tab UI for the Roles Manager.
 * Displays educational institutions, students, teachers, and headmasters.
 * 
 * UPDATED: 
 * - Now uses the modular education system (EducationState, EducationQueries, EducationCommands)
 * - Uses EducationLearning for literacy and proficiency
 * - Uses EducationAnnual for annual processing
 * - Uses EducationHistory for history tracking
 * - Proper SVG icon support throughout
 * - Replaced all emoji with SVG icons
 * - Added proper fallbacks
 * 
 * =============================================================================
 */

// =============================================================================
// 1. SVG ICON HELPERS
// =============================================================================

function _getIcon(name, fallback) {
    if (typeof window.Icons !== 'undefined' && window.Icons[name]) {
        return window.Icons[name];
    }
    if (typeof window._getIcon === 'function') {
        return window._getIcon(name);
    }
    return fallback || '●';
}

function _getCheckIcon() {
    return _getIcon('CHECK_SIMPLE', '✓');
}

function _getCrossIcon() {
    return _getIcon('X_HEAVY', '✗');
}

function _getCircleIcon() {
    return _getIcon('CIRCLE', '●');
}

function _getHomeIcon() {
    return _getIcon('HOME', '⌂');
}

function _getWarningIcon() {
    return _getIcon('WARNING', '⚠');
}

function _getRefreshIcon() {
    return _getIcon('REFRESH', '⟳');
}

function _getSearchIcon() {
    return _getIcon('SEARCH', '⌕');
}

function _getStarIcon() {
    return _getIcon('STAR', '★');
}

function _getGearIcon() {
    return _getIcon('GEAR', '⚙');
}

function _getBookIcon() {
    return _getIcon('BOOK', '📚');
}

function _getPersonIcon() {
    return _getIcon('PERSON', '👤');
}

function _getPlusIcon() {
    return _getIcon('PLUS', '+');
}

function _getTrashIcon() {
    return _getIcon('TRASH', '✗');
}

function _getEditIcon() {
    return _getIcon('EDIT', '✎');
}

function _getCrownIcon() {
    return _getIcon('CROWN', '◉');
}

function _getCoinIcon() {
    return _getIcon('COIN', '💰');
}

function _getLocationIcon() {
    return _getIcon('LOCATION', '⌂');
}

// =============================================================================
// 2. DEPENDENCY WRAPPERS - Using the new modular system
// =============================================================================

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _showToast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else if (typeof window._showToast === 'function') window._showToast(msg, type);
    else console.log('[' + (type || 'info') + '] ' + msg);
}

function _getCurrentYear() {
    if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
    if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
    return 1250;
}

function _getCharacterById(id) {
    return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
}

function _getCharacters() {
    return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
}

function _getPlaceById(id) {
    return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
}

function _getPlaces() {
    return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
}

// =============================================================================
// 3. EDUCATION SYSTEM WRAPPERS
// =============================================================================

function _getAllEducationalInstitutions() {
    // Use EducationState if available
    if (typeof window.EducationState !== 'undefined' && 
        typeof window.EducationState.getAllInstitutions === 'function') {
        return window.EducationState.getAllInstitutions();
    }
    // Legacy fallback
    if (typeof window.getAllEducationalInstitutions === 'function') {
        return window.getAllEducationalInstitutions();
    }
    return [];
}

function _getEducationalInstitution(id) {
    if (typeof window.EducationState !== 'undefined' && 
        typeof window.EducationState.getInstitution === 'function') {
        return window.EducationState.getInstitution(id);
    }
    if (typeof window.getEducationalInstitution === 'function') {
        return window.getEducationalInstitution(id);
    }
    return null;
}

function _getInstitutionsAtLocation(locationId) {
    if (typeof window.EducationState !== 'undefined' && 
        typeof window.EducationState.getInstitutionsByLocation === 'function') {
        return window.EducationState.getInstitutionsByLocation(locationId);
    }
    if (typeof window.getInstitutionsAtLocation === 'function') {
        return window.getInstitutionsAtLocation(locationId);
    }
    return [];
}

function _getInstitutionStudents(institutionId, includeCharacterData) {
    if (typeof window.EducationQueries !== 'undefined' && 
        typeof window.EducationQueries.getInstitutionStudents === 'function') {
        return window.EducationQueries.getInstitutionStudents(institutionId, includeCharacterData);
    }
    if (typeof window.getInstitutionStudents === 'function') {
        return window.getInstitutionStudents(institutionId, includeCharacterData);
    }
    return [];
}

function _getInstitutionTeachers(institutionId, includeCharacterData) {
    if (typeof window.EducationQueries !== 'undefined' && 
        typeof window.EducationQueries.getInstitutionTeachers === 'function') {
        return window.EducationQueries.getInstitutionTeachers(institutionId, includeCharacterData);
    }
    if (typeof window.getInstitutionTeachers === 'function') {
        return window.getInstitutionTeachers(institutionId, includeCharacterData);
    }
    return [];
}

function _getInstitutionGraduates(institutionId, includeCharacterData) {
    if (typeof window.EducationQueries !== 'undefined' && 
        typeof window.EducationQueries.getInstitutionGraduates === 'function') {
        return window.EducationQueries.getInstitutionGraduates(institutionId, includeCharacterData);
    }
    if (typeof window.getInstitutionGraduates === 'function') {
        return window.getInstitutionGraduates(institutionId, includeCharacterData);
    }
    return [];
}

function _getHeadmaster(institutionId) {
    if (typeof window.EducationQueries !== 'undefined' && 
        typeof window.EducationQueries.getHeadmaster === 'function') {
        return window.EducationQueries.getHeadmaster(institutionId);
    }
    if (typeof window.getHeadmaster === 'function') {
        return window.getHeadmaster(institutionId);
    }
    return null;
}

function _getEducationLevel(characterId) {
    if (typeof window.EducationLearning !== 'undefined' && 
        typeof window.EducationLearning.getEducationLevel === 'function') {
        return window.EducationLearning.getEducationLevel(characterId);
    }
    if (typeof window.getEducationLevel === 'function') {
        return window.getEducationLevel(characterId);
    }
    return { id: 'illiterate', name: 'Illiterate', icon: '✗', literacy: 0 };
}

function _isLiterate(characterId) {
    if (typeof window.EducationLearning !== 'undefined' && 
        typeof window.EducationLearning.isLiterate === 'function') {
        return window.EducationLearning.isLiterate(characterId);
    }
    if (typeof window.isLiterate === 'function') {
        return window.isLiterate(characterId);
    }
    return false;
}

function _getProficiency(characterId, curriculumItem) {
    if (typeof window.EducationLearning !== 'undefined' && 
        typeof window.EducationLearning.getProficiency === 'function') {
        return window.EducationLearning.getProficiency(characterId, curriculumItem);
    }
    if (typeof window.getProficiency === 'function') {
        return window.getProficiency(characterId, curriculumItem);
    }
    return 0;
}

function _getCharacterProficiencies(characterId) {
    if (typeof window.EducationLearning !== 'undefined' && 
        typeof window.EducationLearning.getCharacterProficiencies === 'function') {
        return window.EducationLearning.getCharacterProficiencies(characterId);
    }
    if (typeof window.getCharacterProficiencies === 'function') {
        return window.getCharacterProficiencies(characterId);
    }
    return [];
}

function _getStudentsReadyForGraduation(institutionId, year) {
    if (typeof window.EducationAnnual !== 'undefined' && 
        typeof window.EducationAnnual.getStudentsReadyForGraduation === 'function') {
        return window.EducationAnnual.getStudentsReadyForGraduation(institutionId, year);
    }
    if (typeof window.getStudentsReadyForGraduation === 'function') {
        return window.getStudentsReadyForGraduation(institutionId, year);
    }
    return [];
}

function _getInstitutionStatistics(institutionId) {
    if (typeof window.EducationQueries !== 'undefined' && 
        typeof window.EducationQueries.getInstitutionStatistics === 'function') {
        return window.EducationQueries.getInstitutionStatistics(institutionId);
    }
    if (typeof window.getInstitutionStatistics === 'function') {
        return window.getInstitutionStatistics(institutionId);
    }
    return {};
}

function _getLocationEducationSummary(locationId, includeChildren) {
    if (typeof window.EducationQueries !== 'undefined' && 
        typeof window.EducationQueries.getLocationEducationSummary === 'function') {
        return window.EducationQueries.getLocationEducationSummary(locationId, includeChildren);
    }
    if (typeof window.getLocationEducationSummary === 'function') {
        return window.getLocationEducationSummary(locationId, includeChildren);
    }
    return {};
}

function _getEducationHealthScore(locationId) {
    if (typeof window.EducationQueries !== 'undefined' && 
        typeof window.EducationQueries.getEducationHealthScore === 'function') {
        return window.EducationQueries.getEducationHealthScore(locationId);
    }
    if (typeof window.getEducationHealthScore === 'function') {
        return window.getEducationHealthScore(locationId);
    }
    return {};
}

function _calculateAge(birthYear, isDeceased, deathYear) {
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    var currentYear = _getCurrentYear();
    if (!birthYear) return 0;
    if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
    return Math.max(0, currentYear - birthYear);
}

function _openModal(options) {
    if (typeof window.openModal === 'function') return window.openModal(options);
    _showToast('Modal system not available', 'error');
    return null;
}

function _confirmDialog(message, title, onConfirm, onCancel) {
    if (typeof window.confirmDialog === 'function') {
        window.confirmDialog(message, title, onConfirm, onCancel);
    } else if (confirm(message)) {
        onConfirm();
    } else if (onCancel) {
        onCancel();
    }
}

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') window.saveMasterData();
}

// =============================================================================
// 4. MODAL WRAPPERS - Using the new modular system
// =============================================================================

function _openCreateInstitutionModal(onSuccess) {
    if (typeof window.openCreateInstitutionModal === 'function') {
        window.openCreateInstitutionModal(null, function(newInstId) {
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
            // Refresh caches
            if (typeof window.EducationState !== 'undefined' && 
                typeof window.EducationState._rebuildCaches === 'function') {
                window.EducationState._rebuildCaches();
            }
            if (onSuccess) onSuccess();
        });
    } else {
        _showToast('Create institution modal not available', 'error');
    }
}

function _openInstitutionDetailsModal(institutionId, onRefresh) {
    if (typeof window.openInstitutionDetailsModal === 'function') {
        window.openInstitutionDetailsModal(institutionId, function() {
            if (onRefresh) onRefresh();
        });
    } else {
        _showToast('Institution details modal not available', 'error');
    }
}

function _openEditInstitutionModal(institutionId, onSuccess) {
    if (typeof window.openEditInstitutionModal === 'function') {
        window.openEditInstitutionModal(institutionId, function() {
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
            if (onSuccess) onSuccess();
        });
    } else {
        _showToast('Edit institution modal not available', 'error');
    }
}

function _openEditCurriculumModal(institutionId, onSuccess) {
    if (typeof window.openEditCurriculumModal === 'function') {
        window.openEditCurriculumModal(institutionId, function() {
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
            if (onSuccess) onSuccess();
        });
    } else {
        _showToast('Edit curriculum modal not available', 'error');
    }
}

function _openEnrollStudentModal(institutionId, onSuccess) {
    if (typeof window.openEnrollStudentModal === 'function') {
        window.openEnrollStudentModal(institutionId, function() {
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
            if (onSuccess) onSuccess();
        });
    } else {
        _showToast('Enroll student modal not available', 'error');
    }
}

function _openHireTeacherModal(institutionId, onSuccess) {
    if (typeof window.openHireTeacherModal === 'function') {
        window.openHireTeacherModal(institutionId, function() {
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
            if (onSuccess) onSuccess();
        });
    } else {
        _showToast('Hire teacher modal not available', 'error');
    }
}

function _openSetHeadmasterModal(institutionId, onSuccess) {
    if (typeof window.openSetHeadmasterModal === 'function') {
        window.openSetHeadmasterModal(institutionId, function() {
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
            if (onSuccess) onSuccess();
        });
    } else {
        _showToast('Set headmaster modal not available', 'error');
    }
}

function _openDeleteInstitutionModal(institutionId, onSuccess) {
    if (typeof window.openDeleteInstitutionModal === 'function') {
        window.openDeleteInstitutionModal(institutionId, function() {
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
            if (onSuccess) onSuccess();
        });
    } else {
        _showToast('Delete institution modal not available', 'error');
    }
}

function _openTuitionManagementModal(institutionId, onSuccess) {
    if (typeof window.openTuitionManagementModal === 'function') {
        window.openTuitionManagementModal(institutionId, function() {
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
            if (onSuccess) onSuccess();
        });
    } else {
        _showToast('Tuition management modal not available', 'error');
    }
}

function _openOwnershipManagementModal(institutionId, onSuccess) {
    if (typeof window.openOwnershipManagementModal === 'function') {
        window.openOwnershipManagementModal(institutionId, function() {
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
            if (onSuccess) onSuccess();
        });
    } else {
        _showToast('Ownership management modal not available', 'error');
    }
}

function _openGraduateStudentModal(institutionId, onSuccess) {
    if (typeof window.openGraduateStudentModal === 'function') {
        window.openGraduateStudentModal(institutionId, null, function() {
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
            if (onSuccess) onSuccess();
        });
    } else {
        _showToast('Graduate student modal not available', 'error');
    }
}

// =============================================================================
// 5. STATE
// =============================================================================

var educationTabState = {
    expandedInstitutionId: null,
    filterType: 'all',
    filterLocation: 'all',
    searchTerm: '',
    viewMode: 'list' // 'list' or 'grid'
};

// =============================================================================
// 6. MAIN RENDER FUNCTION
// =============================================================================

function renderEducationTab() {
    // Check both possible container IDs
    var container = document.getElementById('educationContainer');
    if (!container) {
        container = document.getElementById('educationContent');
    }
    if (!container) {
        console.warn('Education container not found (tried educationContainer and educationContent)');
        return;
    }

    // Check if education system is loaded
    var institutions = _getAllEducationalInstitutions() || [];
    var isLoaded = typeof window.EducationState !== 'undefined' || 
                   typeof window.getAllEducationalInstitutions === 'function';

    if (!isLoaded || institutions.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 60px; text-align: center; color: var(--warn);">
                <div style="font-size: 2rem; margin-bottom: 12px;">${_getBookIcon()}</div>
                <div style="font-size: 1rem; margin-bottom: 8px;">Education System ${isLoaded ? 'Has No Institutions' : 'Not Loaded'}</div>
                <div style="font-size: 0.7rem; color: var(--dim);">
                    ${isLoaded ? 'Create your first educational institution using the "Create Institution" button.' : 'Make sure educationSystem.js is properly loaded.'}
                </div>
                <button id="eduRetryBtn" class="btn primary" style="margin-top: 16px; padding: 6px 16px; background: var(--accent); border: none; color: white; border-radius: 4px; cursor: pointer;">
                    ${_getRefreshIcon()} ${isLoaded ? 'Refresh' : 'Retry'}
                </button>
            </div>
        `;
        var retryBtn = document.getElementById('eduRetryBtn');
        if (retryBtn && !retryBtn._clickAttached) {
            retryBtn._clickAttached = true;
            retryBtn.onclick = function() {
                // Refresh caches
                if (typeof window.EducationState !== 'undefined' && 
                    typeof window.EducationState._rebuildCaches === 'function') {
                    window.EducationState._rebuildCaches();
                }
                renderEducationTab();
            };
        }
        return;
    }

    var places = _getPlaces();
    var currentYear = _getCurrentYear();

    // Apply filters
    var filtered = institutions.slice();
    
    if (educationTabState.filterType !== 'all') {
        filtered = filtered.filter(function(inst) {
            return inst.type === educationTabState.filterType || 
                   inst.typeName === educationTabState.filterType;
        });
    }
    
    if (educationTabState.filterLocation !== 'all') {
        filtered = filtered.filter(function(inst) {
            return inst.locationId === educationTabState.filterLocation;
        });
    }
    
    if (educationTabState.searchTerm) {
        var searchLower = educationTabState.searchTerm.toLowerCase();
        filtered = filtered.filter(function(inst) {
            return inst.name.toLowerCase().indexOf(searchLower) !== -1 ||
                (inst.locationName || '').toLowerCase().indexOf(searchLower) !== -1 ||
                (inst.typeName || '').toLowerCase().indexOf(searchLower) !== -1 ||
                (inst.description || '').toLowerCase().indexOf(searchLower) !== -1;
        });
    }

    // Calculate stats using education queries if available
    var totalInstitutions = institutions.length;
    var totalStudents = 0;
    var totalTeachers = 0;
    var totalGraduates = 0;
    var avgReputation = 0;
    var totalCapacity = 0;

    for (var i = 0; i < institutions.length; i++) {
        var inst = institutions[i];
        totalStudents += (inst.students ? inst.students.length : 0);
        totalTeachers += (inst.teachers ? inst.teachers.length : 0);
        totalGraduates += (inst.graduates ? inst.graduates.length : 0);
        totalCapacity += (inst.maxStudents || 0);
        avgReputation += (inst.reputation || 50);
    }
    if (totalInstitutions > 0) {
        avgReputation = Math.round(avgReputation / totalInstitutions);
    }

    // Build location filter options
    var locationOptions = '';
    var uniqueLocations = {};
    for (var i = 0; i < institutions.length; i++) {
        var locId = institutions[i].locationId;
        if (locId && !uniqueLocations[locId]) {
            var place = _getPlaceById(locId);
            uniqueLocations[locId] = place ? place.displayName : locId;
        }
    }
    var locationKeys = Object.keys(uniqueLocations);
    locationKeys.sort();
    for (var i = 0; i < locationKeys.length; i++) {
        var key = locationKeys[i];
        var selected = (educationTabState.filterLocation === key) ? 'selected' : '';
        locationOptions += '<option value="' + _escapeHtml(key) + '" ' + selected + '>' + _escapeHtml(uniqueLocations[key]) + '</option>';
    }

    // Build type filter options
    var typeOptions = '';
    var uniqueTypes = {};
    for (var i = 0; i < institutions.length; i++) {
        var type = institutions[i].type;
        var typeName = institutions[i].typeName || type;
        if (type && !uniqueTypes[type]) {
            uniqueTypes[type] = typeName;
        }
    }
    var typeKeys = Object.keys(uniqueTypes);
    typeKeys.sort();
    for (var i = 0; i < typeKeys.length; i++) {
        var key = typeKeys[i];
        var selected = (educationTabState.filterType === key) ? 'selected' : '';
        typeOptions += '<option value="' + _escapeHtml(key) + '" ' + selected + '>' + _escapeHtml(uniqueTypes[key]) + '</option>';
    }

    var html = `
        <div class="education-tab" style="padding: 16px;">
            <!-- Stats Bar -->
            <div class="stats-bar" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 20px;">
                <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div class="stat-value" style="font-size: 1.2rem; font-weight: bold;">${totalInstitutions}</div>
                    <div class="stat-label" style="font-size: 0.6rem; color: var(--dim);">${_getBookIcon()} Institutions</div>
                </div>
                <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div class="stat-value" style="font-size: 1.2rem; font-weight: bold;">${totalStudents}</div>
                    <div class="stat-label" style="font-size: 0.6rem; color: var(--dim);">${_getPersonIcon()} Students</div>
                </div>
                <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div class="stat-value" style="font-size: 1.2rem; font-weight: bold;">${totalTeachers}</div>
                    <div class="stat-label" style="font-size: 0.6rem; color: var(--dim);">${_getGearIcon()} Teachers</div>
                </div>
                <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div class="stat-value" style="font-size: 1.2rem; font-weight: bold;">${totalGraduates}</div>
                    <div class="stat-label" style="font-size: 0.6rem; color: var(--dim);">${_getStarIcon()} Graduates</div>
                </div>
                <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div class="stat-value" style="font-size: 1.2rem; font-weight: bold;">${avgReputation}</div>
                    <div class="stat-label" style="font-size: 0.6rem; color: var(--dim);">${_getStarIcon()} Avg Reputation</div>
                </div>
                <div class="stat-card" style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div class="stat-value" style="font-size: 1.2rem; font-weight: bold;">${totalCapacity}</div>
                    <div class="stat-label" style="font-size: 0.6rem; color: var(--dim);">${_getHomeIcon()} Total Capacity</div>
                </div>
            </div>

            <!-- Actions Bar -->
            <div class="actions-bar" style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; padding: 16px; background: var(--bg2); border-radius: 12px; align-items: center;">
                <button id="eduCreateBtn" class="btn primary" style="background: var(--accent); border: none; color: white; padding: 6px 14px; border-radius: 4px; cursor: pointer;">
                    ${_getPlusIcon()} Create Institution
                </button>
                <button id="eduGraduateBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 0.6rem;">
                    ${_getStarIcon()} Process Graduations
                </button>
                <button id="eduProcessFinanceBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 0.6rem;">
                    ${_getCoinIcon()} Process Finances
                </button>
                <div style="flex: 1; min-width: 150px;">
                    <input type="text" id="eduSearchInput" placeholder="${_getSearchIcon()} Search..." value="${_escapeHtml(educationTabState.searchTerm)}" style="width: 100%; padding: 6px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem;">
                </div>
                <div class="filter-group">
                    <select id="eduTypeFilter" style="padding: 6px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem;">
                        <option value="all">All Types</option>
                        ${typeOptions}
                    </select>
                </div>
                <div class="filter-group">
                    <select id="eduLocationFilter" style="padding: 6px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem;">
                        <option value="all">All Locations</option>
                        ${locationOptions}
                    </select>
                </div>
                <button id="eduClearFiltersBtn" class="btn small" style="padding: 4px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
                    ${_getCrossIcon()} Clear
                </button>
                <button id="eduRefreshBtn" class="btn small" style="padding: 4px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
                    ${_getRefreshIcon()} Refresh
                </button>
            </div>

            <!-- Institutions List -->
            <div class="institutions-list">
                ${filtered.length === 0 ? `
                    <div class="empty-state" style="text-align: center; padding: 60px; color: var(--dim);">
                        <div style="font-size: 2rem; margin-bottom: 12px;">${_getBookIcon()}</div>
                        <div>No educational institutions found</div>
                        <div style="font-size: 0.6rem; margin-top: 8px;">${_getPlusIcon()} Click "Create Institution" to add one</div>
                    </div>
                ` : `
                    ${filtered.map(function(inst) { return renderInstitutionCard(inst); }).join('')}
                `}
            </div>
        </div>
    `;

    container.innerHTML = html;
    attachEducationTabHandlers(container);
}

// =============================================================================
// 7. INSTITUTION CARD RENDERER
// =============================================================================

function renderInstitutionCard(institution) {
    var isExpanded = educationTabState.expandedInstitutionId === institution.id;
    
    // Use education queries for detailed data
    var students = _getInstitutionStudents(institution.id, true) || [];
    var teachers = _getInstitutionTeachers(institution.id, true) || [];
    var graduates = _getInstitutionGraduates(institution.id, true) || [];
    var headmaster = _getHeadmaster(institution.id);
    
    var reputation = institution.reputation || 50;
    var reputationColor = reputation >= 70 ? '#4a9060' : (reputation >= 40 ? '#c8a844' : '#c87040');
    var reputationIcon = reputation >= 70 ? _getStarIcon() : (reputation >= 40 ? _getCircleIcon() : _getCrossIcon());
    
    var typeIcon = institution.icon || _getBookIcon();
    var typeName = institution.typeName || institution.type || 'Unknown';
    var locationName = institution.locationName || 'Unknown';
    var studentCount = students.length;
    var teacherCount = teachers.length;
    var graduateCount = graduates.length;
    var capacity = institution.maxStudents || 0;
    var capacityRatio = capacity > 0 ? Math.round((studentCount / capacity) * 100) : 0;
    var capacityColor = capacityRatio > 90 ? '#c87040' : (capacityRatio > 70 ? '#c8a844' : '#4a9060');
    
    var isSpecialized = institution.isSpecialized || false;
    var curriculumCount = institution.curriculum ? institution.curriculum.length : 0;
    var taughtRoles = institution.taughtRoles || [];
    var ownershipType = institution.ownershipType || 'public';
    var ownershipIcon = ownershipType === 'public' ? '🏛️' : '🏠';
    var tuitionInfo = institution.waiveTuition ? 'Free' : 
                     (institution.customTuition !== null ? institution.customTuition + 'g' :
                     (institution.tuitionPerYear || 0) + 'g');

    var html = `
        <div class="institution-card" data-inst-id="${institution.id}" style="
            background: var(--bg2);
            border: 1px solid var(--border);
            border-radius: 8px;
            margin-bottom: 12px;
            overflow: hidden;
            transition: all 0.2s;
        ">
            <!-- Header -->
            <div class="inst-header" style="
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
                cursor: pointer;
                background: var(--bg3);
                border-bottom: ${isExpanded ? '1px solid var(--border)' : 'none'};
            ">
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span style="font-size: 1.2rem; color: var(--accent);">${typeIcon}</span>
                    <div>
                        <div style="font-weight: bold; font-size: 0.85rem; color: var(--accent);">${_escapeHtml(institution.name)}</div>
                        <div style="font-size: 0.55rem; color: var(--dim);">
                            ${_escapeHtml(typeName)} · ${_escapeHtml(locationName)}
                            ${isSpecialized ? ' · ' + _getStarIcon() + ' Specialized' : ''}
                            ${taughtRoles.length > 0 ? ' · ' + taughtRoles.length + ' roles' : ''}
                            ${institution.foundedYear ? ' · Founded ' + institution.foundedYear : ''}
                            <span style="margin-left: 6px; padding: 1px 6px; background: var(--bg); border-radius: 8px; font-size: 0.5rem;">
                                ${ownershipIcon} ${ownershipType}
                            </span>
                            <span style="margin-left: 4px; padding: 1px 6px; background: var(--bg); border-radius: 8px; font-size: 0.5rem;">
                                ${_getCoinIcon()} ${tuitionInfo}
                            </span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <span style="font-size: 0.55rem; color: ${reputationColor};">
                        ${reputationIcon} ${reputation}
                    </span>
                    <span style="font-size: 0.55rem; color: var(--dim);">
                        ${_getPersonIcon()} ${studentCount}
                    </span>
                    <span style="font-size: 0.55rem; color: var(--dim);">
                        ${_getGearIcon()} ${teacherCount}
                    </span>
                    <span style="font-size: 0.55rem; color: ${capacityColor};">
                        ${capacityRatio}% capacity
                    </span>
                    <span class="expand-toggle" style="cursor: pointer; font-size: 0.6rem; color: var(--accent);">
                        ${isExpanded ? '▲' : '▼'}
                    </span>
                </div>
            </div>

            ${isExpanded ? `
                <div class="inst-details" style="padding: 16px;">
                    <!-- Quick Stats -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; margin-bottom: 16px;">
                        <div style="text-align: center; background: var(--bg); padding: 8px; border-radius: 4px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--accent);">${studentCount}</div>
                            <div style="font-size: 0.5rem; color: var(--dim);">Students</div>
                        </div>
                        <div style="text-align: center; background: var(--bg); padding: 8px; border-radius: 4px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--accent);">${teacherCount}</div>
                            <div style="font-size: 0.5rem; color: var(--dim);">Teachers</div>
                        </div>
                        <div style="text-align: center; background: var(--bg); padding: 8px; border-radius: 4px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--accent);">${graduateCount}</div>
                            <div style="font-size: 0.5rem; color: var(--dim);">Graduates</div>
                        </div>
                        <div style="text-align: center; background: var(--bg); padding: 8px; border-radius: 4px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--accent);">${capacity}</div>
                            <div style="font-size: 0.5rem; color: var(--dim);">Capacity</div>
                        </div>
                        <div style="text-align: center; background: var(--bg); padding: 8px; border-radius: 4px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--accent);">${curriculumCount}</div>
                            <div style="font-size: 0.5rem; color: var(--dim);">Subjects</div>
                        </div>
                        ${taughtRoles.length > 0 ? `
                            <div style="text-align: center; background: var(--bg); padding: 8px; border-radius: 4px;">
                                <div style="font-size: 0.7rem; font-weight: bold; color: var(--accent);">${taughtRoles.length}</div>
                                <div style="font-size: 0.5rem; color: var(--dim);">Taught Roles</div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Headmaster -->
                    ${headmaster && headmaster.character ? `
                        <div style="margin-bottom: 12px; font-size: 0.65rem; background: var(--bg); padding: 8px 12px; border-radius: 4px; border-left: 3px solid var(--accent);">
                            <span style="color: var(--dim);">${_getCrownIcon()} Headmaster:</span>
                            <span style="color: var(--accent); font-weight: bold;">${_escapeHtml(headmaster.character.name)} ${_escapeHtml(headmaster.character.surname || '')}</span>
                            ${headmaster.details && headmaster.details.title ? ' (' + _escapeHtml(headmaster.details.title) + ')' : ''}
                            ${headmaster.details && headmaster.details.startYear ? ' · since ' + headmaster.details.startYear : ''}
                        </div>
                    ` : `
                        <div style="margin-bottom: 12px; font-size: 0.6rem; color: var(--dim); background: var(--bg); padding: 8px 12px; border-radius: 4px;">
                            ${_getCrossIcon()} No headmaster appointed
                        </div>
                    `}

                    <!-- Description -->
                    ${institution.description ? `
                        <div style="margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">
                            ${_getBookIcon()} ${_escapeHtml(institution.description)}
                        </div>
                    ` : ''}

                    <!-- Taught Roles -->
                    ${taughtRoles.length > 0 ? `
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 0.6rem; font-weight: bold; color: var(--accent); margin-bottom: 4px;">${_getCrownIcon()} Taught Roles</div>
                            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                ${taughtRoles.map(function(roleId) {
                                    var role = typeof window.RoleState !== 'undefined' ? 
                                        window.RoleState.getRole(roleId) : null;
                                    var roleName = role ? role.name : roleId;
                                    var roleIcon = role ? (role.icon || '◉') : '◉';
                                    return `<span style="background: var(--bg); padding: 2px 8px; border-radius: 10px; font-size: 0.55rem; border: 1px solid var(--border);">
                                        ${roleIcon} ${_escapeHtml(roleName)}
                                    </span>`;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Curriculum -->
                    ${institution.curriculum && institution.curriculum.length > 0 ? `
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 0.6rem; font-weight: bold; color: var(--accent); margin-bottom: 4px;">${_getBookIcon()} Curriculum</div>
                            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                ${institution.curriculum.slice(0, 10).map(function(c) {
                                    var icon = c.icon || (c.type === 'role' ? '◉' : '⌇');
                                    return `<span style="background: var(--bg); padding: 2px 8px; border-radius: 10px; font-size: 0.55rem; border: 1px solid var(--border);">
                                        ${icon} ${_escapeHtml(c.name)}
                                    </span>`;
                                }).join('')}
                                ${institution.curriculum.length > 10 ? `<span style="font-size: 0.5rem; color: var(--dim);">+${institution.curriculum.length - 10} more</span>` : ''}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Students List -->
                    ${studentCount > 0 ? `
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 0.6rem; font-weight: bold; color: var(--accent); margin-bottom: 4px;">${_getPersonIcon()} Students (${studentCount})</div>
                            <div style="max-height: 100px; overflow-y: auto; font-size: 0.55rem;">
                                ${students.slice(0, 10).map(function(s) {
                                    var char = s.character || _getCharacterById(s.studentId || (s.record && s.record.studentId));
                                    if (!char) return '';
                                    var age = _calculateAge(char.birthYear, false, null);
                                    var eduLevel = _getEducationLevel(char.id);
                                    return `<div style="display: flex; justify-content: space-between; padding: 2px 4px; border-bottom: 1px solid var(--border-light);">
                                        <span>${_escapeHtml(char.name)} ${_escapeHtml(char.surname || '')}</span>
                                        <span style="color: var(--dim);">${eduLevel.icon || '⌇'} ${eduLevel.name} · ${age}y</span>
                                    </div>`;
                                }).join('')}
                                ${studentCount > 10 ? `<div style="color: var(--dim); font-size: 0.5rem; padding: 4px;">... and ${studentCount - 10} more</div>` : ''}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Teachers List -->
                    ${teacherCount > 0 ? `
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 0.6rem; font-weight: bold; color: var(--accent); margin-bottom: 4px;">${_getGearIcon()} Teachers (${teacherCount})</div>
                            <div style="max-height: 100px; overflow-y: auto; font-size: 0.55rem;">
                                ${teachers.slice(0, 10).map(function(t) {
                                    var char = t.character || _getCharacterById(t.teacherId || (t.record && t.record.teacherId));
                                    var name = char ? char.name + ' ' + (char.surname || '') : 'Unknown';
                                    var subjectName = t.record ? t.record.subjectName : (t.subjectName || 'Unknown');
                                    return `<div style="display: flex; justify-content: space-between; padding: 2px 4px; border-bottom: 1px solid var(--border-light);">
                                        <span>${_escapeHtml(name)}</span>
                                        <span style="color: var(--dim);">${_escapeHtml(subjectName)}</span>
                                    </div>`;
                                }).join('')}
                                ${teacherCount > 10 ? `<div style="color: var(--dim); font-size: 0.5rem; padding: 4px;">... and ${teacherCount - 10} more</div>` : ''}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Action Buttons -->
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid var(--border);">
                        <button class="edu-view-btn btn small" data-inst-id="${institution.id}" style="padding: 3px 10px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
                            ${_getBookIcon()} Details
                        </button>
                        <button class="edu-curriculum-btn btn small" data-inst-id="${institution.id}" style="padding: 3px 10px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
                            ${_getGearIcon()} Curriculum
                        </button>
                        <button class="edu-enroll-btn btn small" data-inst-id="${institution.id}" style="padding: 3px 10px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">
                            ${_getPersonIcon()} Enroll
                        </button>
                        <button class="edu-graduate-btn btn small" data-inst-id="${institution.id}" style="padding: 3px 10px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">
                            ${_getStarIcon()} Graduate
                        </button>
                        <button class="edu-hire-btn btn small" data-inst-id="${institution.id}" style="padding: 3px 10px; font-size: 0.5rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">
                            ${_getPlusIcon()} Hire
                        </button>
                        <button class="edu-headmaster-btn btn small" data-inst-id="${institution.id}" style="padding: 3px 10px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
                            ${_getCrownIcon()} Headmaster
                        </button>
                        <button class="edu-tuition-btn btn small" data-inst-id="${institution.id}" style="padding: 3px 10px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
                            ${_getCoinIcon()} Tuition
                        </button>
                        <button class="edu-ownership-btn btn small" data-inst-id="${institution.id}" style="padding: 3px 10px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
                            ${_getHomeIcon()} Ownership
                        </button>
                        <button class="edu-edit-btn btn small" data-inst-id="${institution.id}" style="padding: 3px 10px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
                            ${_getEditIcon()} Edit
                        </button>
                        <button class="edu-delete-btn btn small danger" data-inst-id="${institution.id}" data-inst-name="${_escapeHtml(institution.name)}" style="padding: 3px 10px; font-size: 0.5rem; background: #8a3020; border: none; color: white; border-radius: 4px; cursor: pointer;">
                            ${_getTrashIcon()}
                        </button>
                    </div>
                </div>
            ` : ''}
        </div>
    `;

    return html;
}

// =============================================================================
// 8. EVENT HANDLERS
// =============================================================================

function attachEducationTabHandlers(container) {
    var containerId = container.id || 'educationContainer';

    // Refresh button
    var refreshBtn = document.getElementById('eduRefreshBtn');
    if (refreshBtn && !refreshBtn._clickAttached) {
        refreshBtn._clickAttached = true;
        refreshBtn.onclick = function() {
            // Refresh caches
            if (typeof window.EducationState !== 'undefined' && 
                typeof window.EducationState._rebuildCaches === 'function') {
                window.EducationState._rebuildCaches();
            }
            if (typeof window.loadMasterData === 'function') {
                window.loadMasterData();
            }
            renderEducationTab();
            _showToast(_getRefreshIcon() + ' Refreshed', 'success');
        };
    }

    // Create button
    var createBtn = document.getElementById('eduCreateBtn');
    if (createBtn && !createBtn._clickAttached) {
        createBtn._clickAttached = true;
        createBtn.onclick = function() {
            _openCreateInstitutionModal(function() {
                renderEducationTab();
            });
        };
    }

    // Graduate button - process graduations
    var graduateBtn = document.getElementById('eduGraduateBtn');
    if (graduateBtn && !graduateBtn._clickAttached) {
        graduateBtn._clickAttached = true;
        graduateBtn.onclick = function() {
            var year = _getCurrentYear();
            if (typeof window.EducationAnnual !== 'undefined' && 
                typeof window.EducationAnnual.processAnnualEducation === 'function') {
                var results = window.EducationAnnual.processAnnualEducation(year, { 
                    autoGraduate: false,
                    silent: false 
                });
                if (results && results.readyForGraduation && results.readyForGraduation.length > 0) {
                    _showToast(results.readyForGraduation.length + ' students ready for graduation', 'info');
                }
                renderEducationTab();
            } else if (typeof window.processAnnualEducation === 'function') {
                window.processAnnualEducation(year);
                renderEducationTab();
            } else {
                _showToast('Graduation processing not available', 'error');
            }
        };
    }

    // Process Finances button
    var financeBtn = document.getElementById('eduProcessFinanceBtn');
    if (financeBtn && !financeBtn._clickAttached) {
        financeBtn._clickAttached = true;
        financeBtn.onclick = function() {
            var year = _getCurrentYear();
            if (typeof window.EducationAnnual !== 'undefined' && 
                typeof window.EducationAnnual._processSchoolFinances === 'function') {
                var results = window.EducationAnnual._processSchoolFinances(year, { silent: false });
                if (results && results.success) {
                    var msg = 'Finances processed: ';
                    if (results.totalFunding > 0) msg += results.totalFunding + ' gold public funding, ';
                    if (results.totalProfit > 0) msg += results.totalProfit + ' gold private profit';
                    _showToast(msg, 'success');
                }
                renderEducationTab();
            } else if (typeof window._processSchoolFinances === 'function') {
                window._processSchoolFinances(year);
                renderEducationTab();
            } else {
                _showToast('Finance processing not available', 'error');
            }
        };
    }

    // Search input with debounce
    var searchInput = document.getElementById('eduSearchInput');
    if (searchInput && !searchInput._inputAttached) {
        searchInput._inputAttached = true;
        var searchTimeout = null;
        searchInput.oninput = function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() {
                educationTabState.searchTerm = searchInput.value;
                renderEducationTab();
            }, 300);
        };
    }

    // Type filter
    var typeFilter = document.getElementById('eduTypeFilter');
    if (typeFilter && !typeFilter._changeAttached) {
        typeFilter._changeAttached = true;
        typeFilter.onchange = function() {
            educationTabState.filterType = this.value;
            renderEducationTab();
        };
    }

    // Location filter
    var locationFilter = document.getElementById('eduLocationFilter');
    if (locationFilter && !locationFilter._changeAttached) {
        locationFilter._changeAttached = true;
        locationFilter.onchange = function() {
            educationTabState.filterLocation = this.value;
            renderEducationTab();
        };
    }

    // Clear filters
    var clearBtn = document.getElementById('eduClearFiltersBtn');
    if (clearBtn && !clearBtn._clickAttached) {
        clearBtn._clickAttached = true;
        clearBtn.onclick = function() {
            educationTabState.searchTerm = '';
            educationTabState.filterType = 'all';
            educationTabState.filterLocation = 'all';
            if (searchInput) searchInput.value = '';
            if (typeFilter) typeFilter.value = 'all';
            if (locationFilter) locationFilter.value = 'all';
            renderEducationTab();
            _showToast(_getRefreshIcon() + ' Filters cleared', 'info');
        };
    }

    // Remove any existing click handler to prevent duplicates
    if (container._eduClickHandler) {
        container.removeEventListener('click', container._eduClickHandler);
    }

    // Single delegated click handler
    container._eduClickHandler = function(e) {
        // Header click - expand/collapse
        var header = e.target.closest('.inst-header');
        if (header && !e.target.closest('.expand-toggle') && !e.target.closest('button')) {
            var card = header.closest('.institution-card');
            if (card) {
                e.stopPropagation();
                var instId = card.dataset.instId;
                if (educationTabState.expandedInstitutionId === instId) {
                    educationTabState.expandedInstitutionId = null;
                } else {
                    educationTabState.expandedInstitutionId = instId;
                }
                renderEducationTab();
            }
            return;
        }

        // Expand toggle
        var toggle = e.target.closest('.expand-toggle');
        if (toggle) {
            e.stopPropagation();
            var card = toggle.closest('.institution-card');
            if (card) {
                var instId = card.dataset.instId;
                if (educationTabState.expandedInstitutionId === instId) {
                    educationTabState.expandedInstitutionId = null;
                } else {
                    educationTabState.expandedInstitutionId = instId;
                }
                renderEducationTab();
            }
            return;
        }

        // View Details
        var viewBtn = e.target.closest('.edu-view-btn');
        if (viewBtn) {
            e.stopPropagation();
            var instId = viewBtn.dataset.instId;
            _openInstitutionDetailsModal(instId, function() {
                renderEducationTab();
            });
            return;
        }

        // Curriculum
        var curriculumBtn = e.target.closest('.edu-curriculum-btn');
        if (curriculumBtn) {
            e.stopPropagation();
            var instId = curriculumBtn.dataset.instId;
            _openEditCurriculumModal(instId, function() {
                renderEducationTab();
            });
            return;
        }

        // Enroll
        var enrollBtn = e.target.closest('.edu-enroll-btn');
        if (enrollBtn) {
            e.stopPropagation();
            var instId = enrollBtn.dataset.instId;
            _openEnrollStudentModal(instId, function() {
                renderEducationTab();
            });
            return;
        }

        // Graduate
        var graduateBtn = e.target.closest('.edu-graduate-btn');
        if (graduateBtn) {
            e.stopPropagation();
            var instId = graduateBtn.dataset.instId;
            _openGraduateStudentModal(instId, function() {
                renderEducationTab();
            });
            return;
        }

        // Hire Teacher
        var hireBtn = e.target.closest('.edu-hire-btn');
        if (hireBtn) {
            e.stopPropagation();
            var instId = hireBtn.dataset.instId;
            _openHireTeacherModal(instId, function() {
                renderEducationTab();
            });
            return;
        }

        // Headmaster
        var headmasterBtn = e.target.closest('.edu-headmaster-btn');
        if (headmasterBtn) {
            e.stopPropagation();
            var instId = headmasterBtn.dataset.instId;
            _openSetHeadmasterModal(instId, function() {
                renderEducationTab();
            });
            return;
        }

        // Tuition
        var tuitionBtn = e.target.closest('.edu-tuition-btn');
        if (tuitionBtn) {
            e.stopPropagation();
            var instId = tuitionBtn.dataset.instId;
            _openTuitionManagementModal(instId, function() {
                renderEducationTab();
            });
            return;
        }

        // Ownership
        var ownershipBtn = e.target.closest('.edu-ownership-btn');
        if (ownershipBtn) {
            e.stopPropagation();
            var instId = ownershipBtn.dataset.instId;
            _openOwnershipManagementModal(instId, function() {
                renderEducationTab();
            });
            return;
        }

        // Edit
        var editBtn = e.target.closest('.edu-edit-btn');
        if (editBtn) {
            e.stopPropagation();
            var instId = editBtn.dataset.instId;
            _openEditInstitutionModal(instId, function() {
                renderEducationTab();
            });
            return;
        }

        // Delete
        var deleteBtn = e.target.closest('.edu-delete-btn');
        if (deleteBtn) {
            e.stopPropagation();
            var instId = deleteBtn.dataset.instId;
            var instName = deleteBtn.dataset.instName;
            _confirmDialog(
                _getCrossIcon() + ' Delete institution "' + instName + '" permanently? This cannot be undone.',
                'Delete Institution',
                function() {
                    _openDeleteInstitutionModal(instId, function() {
                        renderEducationTab();
                    });
                }
            );
            return;
        }
    };

    container.addEventListener('click', container._eduClickHandler);

    // Listen for institution updates
    window.addEventListener('institutionsUpdated', function() {
        renderEducationTab();
    });
}

// =============================================================================
// 9. EXPORTS
// =============================================================================

window.renderEducationTab = renderEducationTab;
window.educationTabState = educationTabState;
