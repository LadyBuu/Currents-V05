/**
 * =============================================================================
 * STILL WATERS - CENSUS CORE (systems/census/censusCore.js)
 * =============================================================================
 * 
 * This file contains ALL census business logic including:
 *   - Character filtering and statistics
 *   - Age/gender/life stage distributions
 *   - Population pyramid data
 *   - Employment statistics
 *   - Household statistics
 *   - Crime statistics (with caching)
 *   - Unit statistics (residence integration)
 *   - Preset management
 *   - View/location state persistence
 * 
 * DEPENDENCIES (canonical sources via thin wrappers):
 *   - accessors.js: getCharacters, getCharacterById, getRanks, getRoles,
 *                   getResidences, getLocationUnitStats, getHouseholds
 *   - time.js: getCurrentYearSafe, calculateAge
 *   - icons.js: _getIcon, Icons
 *   - constants.js: STORAGE_KEYS, AGE_GROUPS
 *   - location-state.js: getLocationPopulationCount, getLocationOwnPopulation
 * 
 * ICON POLICY: NO emojis in text. Use _getIcon() for visual indicators.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. STORAGE KEYS (from constants.js)
// =============================================================================

function _getStorageKeys() {
    if (window.STORAGE_KEYS) {
        return window.STORAGE_KEYS;
    }
    return {
        CENSUS_PRESETS: 'census_presets',
        CENSUS_CURRENT_VIEW: 'census_current_view',
        CENSUS_SELECTED_LOCATION: 'census_selected_location',
        CENSUS_FILTERS_COLLAPSED: 'census_filters_collapsed'
    };
}

// =============================================================================
// 2. THIN WRAPPERS TO CANONICAL SOURCES
// =============================================================================

function _getCharacters() {
    if (typeof window.getCharacters === 'function') return window.getCharacters();
    return window.masterData?.data?.characters || [];
}

function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') return window.getCharacterById(id);
    return null;
}

function _getRanks() {
    if (typeof window.getRanks === 'function') return window.getRanks();
    return window.masterData?.data?.ranks || [];
}

function _getRoles() {
    if (typeof window.getRoles === 'function') return window.getRoles();
    return window.masterData?.data?.roles || [];
}

function _getActiveRankDisplay(character) {
    if (typeof window.getActiveRankDisplay === 'function') {
        return window.getActiveRankDisplay(character);
    }
    return null;
}

function _getCurrentLocation(character) {
    if (typeof window.getCurrentLocation === 'function') {
        return window.getCurrentLocation(character);
    }
    return 'Unknown';
}

function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
}

function _getLocationPopulationCount(locationId) {
    if (typeof window.getLocationPopulationCount === 'function') {
        return window.getLocationPopulationCount(locationId);
    }
    return 0;
}

function _getLocationOwnPopulation(locationId) {
    if (typeof window.getLocationOwnPopulation === 'function') {
        return window.getLocationOwnPopulation(locationId);
    }
    return 0;
}

function _getResidences() {
    if (typeof window.getResidences === 'function') {
        return window.getResidences();
    }
    return window.masterData?.data?.residences || [];
}

function _getLocationUnitStats(locationId) {
    if (typeof window.getLocationUnitStats === 'function') {
        return window.getLocationUnitStats(locationId);
    }
    return null;
}

function _getAllHouseholds() {
    if (typeof window.getAllHouseholds === 'function') {
        return window.getAllHouseholds();
    }
    if (typeof window.getHouseholds === 'function') {
        return window.getHouseholds();
    }
    return window.masterData?.data?.households || [];
}

function _getHousehold(householdId) {
    if (typeof window.getHousehold === 'function') {
        return window.getHousehold(householdId);
    }
    return null;
}

function _getHouseholdUnitCount(householdId) {
    if (typeof window.getHouseholdUnitCount === 'function') {
        return window.getHouseholdUnitCount(householdId);
    }
    return 0;
}

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') window.saveMasterData();
}

function _showToast(message, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(message, type);
    }
}

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _getIcon(name) {
    if (typeof window._getIcon === 'function') return window._getIcon(name);
    if (window.Icons && window.Icons[name]) return window.Icons[name];
    return '';
}

// =============================================================================
// 3. CENSUS STATE (Single source of truth)
// =============================================================================

if (typeof window.censusState === 'undefined') {
    window.censusState = {
        currentView: 'list',
        selectedLocationId: null,
        filters: {
            searchName: '',
            gender: '',
            lifeStage: '',
            rank: '',
            role: '',
            relationship: '',
            status: '',
            minAge: '',
            maxAge: ''
        },
        presets: {},
        sidebarCollapsed: false
    };
}

var censusState = window.censusState;

// =============================================================================
// 4. CRIME STATISTICS - WITH CACHING
// =============================================================================

var _crimeStatsCache = new Map();
var _crimeRateCache = new Map();
var _justiceSeverityCache = new Map();

function getLocationCrimeStats(locationId) {
    if (_crimeStatsCache.has(locationId)) {
        return _crimeStatsCache.get(locationId);
    }
    
    if (typeof window.getSettlementSummary === 'function') {
        try {
            var summary = window.getSettlementSummary(locationId);
            if (summary && summary.crime) {
                var crimeStats = {
                    totalIncidents: summary.crime.rate ? Math.floor(summary.population * summary.crime.rate) : 0,
                    byType: summary.crime.byType || {},
                    byOutcome: summary.crime.byOutcome || {},
                    justiceSeverity: summary.crime.justiceSeverity || 'medium'
                };
                _crimeStatsCache.set(locationId, crimeStats);
                return crimeStats;
            }
        } catch (e) {
            // Silent fail
        }
    }
    
    var emptyStats = {
        totalIncidents: 0,
        byType: {},
        byOutcome: {},
        justiceSeverity: 'medium'
    };
    _crimeStatsCache.set(locationId, emptyStats);
    return emptyStats;
}

function getLocationCrimeRate(locationId) {
    if (_crimeRateCache.has(locationId)) {
        return _crimeRateCache.get(locationId);
    }
    
    if (typeof window.calculateSettlementCrimeRate === 'function') {
        try {
            var rate = window.calculateSettlementCrimeRate(locationId);
            _crimeRateCache.set(locationId, rate);
            return rate;
        } catch (e) {
            // Silent fail
        }
    }
    
    _crimeRateCache.set(locationId, 0.05);
    return 0.05;
}

function getLocationJusticeSeverity(locationId) {
    if (_justiceSeverityCache.has(locationId)) {
        return _justiceSeverityCache.get(locationId);
    }
    
    if (typeof window.getSettlementSummary === 'function') {
        try {
            var summary = window.getSettlementSummary(locationId);
            var severity = summary?.crime?.justiceSeverity || 'medium';
            _justiceSeverityCache.set(locationId, severity);
            return severity;
        } catch (e) {
            // Silent fail
        }
    }
    
    _justiceSeverityCache.set(locationId, 'medium');
    return 'medium';
}

function clearCrimeStatsCache() {
    _crimeStatsCache.clear();
    _crimeRateCache.clear();
    _justiceSeverityCache.clear();
}

// =============================================================================
// 5. STATE INITIALIZATION
// =============================================================================

function initCensusState() {
    var keys = _getStorageKeys();
    
    try {
        var savedPresets = localStorage.getItem(keys.CENSUS_PRESETS);
        if (savedPresets) {
            censusState.presets = JSON.parse(savedPresets);
        }
        
        var savedView = localStorage.getItem(keys.CENSUS_CURRENT_VIEW);
        if (savedView && ['list', 'chart', 'pyramid', 'location', 'crime'].indexOf(savedView) !== -1) {
            censusState.currentView = savedView;
        }
        
        var savedLocation = localStorage.getItem(keys.CENSUS_SELECTED_LOCATION);
        if (savedLocation) {
            censusState.selectedLocationId = savedLocation;
        }
        
        var savedSidebar = localStorage.getItem(keys.CENSUS_FILTERS_COLLAPSED);
        censusState.sidebarCollapsed = savedSidebar === 'true';
    } catch (e) {
        // Silent fail
    }
}

function saveCurrentView(view) {
    var keys = _getStorageKeys();
    censusState.currentView = view;
    try {
        localStorage.setItem(keys.CENSUS_CURRENT_VIEW, view);
    } catch (e) {
        // Silent fail
    }
}

function saveSelectedLocation(locationId) {
    var keys = _getStorageKeys();
    censusState.selectedLocationId = locationId;
    try {
        if (locationId) {
            localStorage.setItem(keys.CENSUS_SELECTED_LOCATION, locationId);
        } else {
            localStorage.removeItem(keys.CENSUS_SELECTED_LOCATION);
        }
    } catch (e) {
        // Silent fail
    }
}

// =============================================================================
// 6. FILTERING FUNCTIONS
// =============================================================================

function getFilteredCharacters() {
    var chars = _getCharacters();
    var f = censusState.filters;
    
    if (f.searchName) {
        var searchLower = f.searchName.toLowerCase();
        chars = chars.filter(function(c) {
            return c.name.toLowerCase().indexOf(searchLower) !== -1 ||
                (c.surname || '').toLowerCase().indexOf(searchLower) !== -1;
        });
    }
    
    if (f.gender) {
        chars = chars.filter(function(c) { return c.gender === f.gender; });
    }
    
    if (f.status === 'living') {
        chars = chars.filter(function(c) { return !c.isDeceased; });
    } else if (f.status === 'deceased') {
        chars = chars.filter(function(c) { return c.isDeceased; });
    }
    
    if (f.rank) {
        chars = chars.filter(function(c) { return c.activeRankId === f.rank; });
    }
    
    if (f.role) {
        chars = chars.filter(function(c) {
            var profs = c.professions || [];
            for (var i = 0; i < profs.length; i++) {
                if (profs[i].id === f.role) return true;
            }
            return false;
        });
    }
    
    if (f.relationship === 'single') {
        chars = chars.filter(function(c) {
            var rels = c.relationships || [];
            for (var i = 0; i < rels.length; i++) {
                if (rels[i].status === 'ongoing') return false;
            }
            return true;
        });
    } else if (f.relationship === 'partnered') {
        chars = chars.filter(function(c) {
            var rels = c.relationships || [];
            for (var i = 0; i < rels.length; i++) {
                if (rels[i].status === 'ongoing') return true;
            }
            return false;
        });
    } else if (f.relationship === 'widowed') {
        chars = chars.filter(function(c) {
            var rels = c.relationships || [];
            for (var i = 0; i < rels.length; i++) {
                if (rels[i].status === 'widowed') return true;
            }
            return false;
        });
    }
    
    if (f.lifeStage) {
        chars = chars.filter(function(c) {
            var age = getCharacterAge(c);
            if (f.lifeStage === 'child') return age < 13;
            if (f.lifeStage === 'youth') return age >= 13 && age < 18;
            if (f.lifeStage === 'adult') return age >= 18 && age < 60;
            if (f.lifeStage === 'elder') return age >= 60;
            return true;
        });
    }
    
    if (f.minAge) {
        var min = parseInt(f.minAge, 10);
        if (!isNaN(min)) {
            chars = chars.filter(function(c) { return getCharacterAge(c) >= min; });
        }
    }
    if (f.maxAge) {
        var max = parseInt(f.maxAge, 10);
        if (!isNaN(max)) {
            chars = chars.filter(function(c) { return getCharacterAge(c) <= max; });
        }
    }
    
    return chars;
}

function updateFilterStateFromUI() {
    var searchName = document.getElementById('censusSearchName');
    var gender = document.getElementById('censusFilterGender');
    var lifeStage = document.getElementById('censusFilterLifeStage');
    var rank = document.getElementById('censusFilterRank');
    var role = document.getElementById('censusFilterRole');
    var relationship = document.getElementById('censusFilterRelationship');
    var status = document.getElementById('censusFilterStatus');
    var minAge = document.getElementById('censusMinAge');
    var maxAge = document.getElementById('censusMaxAge');
    
    censusState.filters.searchName = searchName ? searchName.value : '';
    censusState.filters.gender = gender ? gender.value : '';
    censusState.filters.lifeStage = lifeStage ? lifeStage.value : '';
    censusState.filters.rank = rank ? rank.value : '';
    censusState.filters.role = role ? role.value : '';
    censusState.filters.relationship = relationship ? relationship.value : '';
    censusState.filters.status = status ? status.value : '';
    censusState.filters.minAge = minAge ? minAge.value : '';
    censusState.filters.maxAge = maxAge ? maxAge.value : '';
    
    return censusState.filters;
}

function resetFilters() {
    censusState.filters = {
        searchName: '',
        gender: '',
        lifeStage: '',
        rank: '',
        role: '',
        relationship: '',
        status: '',
        minAge: '',
        maxAge: ''
    };
}

function getFilterSummary() {
    var f = censusState.filters;
    var activeFilters = [];
    
    if (f.searchName) activeFilters.push('Name: "' + f.searchName + '"');
    if (f.gender) activeFilters.push('Gender: ' + (f.gender === 'male' ? 'Male' : 'Female'));
    if (f.lifeStage) {
        var stageNames = {
            child: 'Child (0-12)',
            youth: 'Youth (13-17)',
            adult: 'Adult (18-59)',
            elder: 'Elder (60+)'
        };
        activeFilters.push(stageNames[f.lifeStage] || f.lifeStage);
    }
    if (f.rank) activeFilters.push('Rank filter active');
    if (f.role) activeFilters.push('Role filter active');
    if (f.relationship) activeFilters.push('Relationship: ' + f.relationship);
    if (f.status) activeFilters.push('Status: ' + (f.status === 'living' ? 'Living' : 'Deceased'));
    if (f.minAge || f.maxAge) activeFilters.push('Age: ' + (f.minAge || '0') + '-' + (f.maxAge || '∞'));
    
    return {
        count: activeFilters.length,
        filters: activeFilters,
        hasFilters: activeFilters.length > 0,
        description: activeFilters.length > 0 ? activeFilters.join(', ') : 'No active filters'
    };
}

// =============================================================================
// 7. STATISTICS CALCULATION
// =============================================================================

function calculateStats(chars) {
    var male = 0, female = 0, other = 0;
    var deceased = 0;
    var partnered = 0, widowed = 0;
    var employed = 0;
    var minors = 0;
    var totalAge = 0;
    var ageCount = 0;
    var oldestAge = 0;
    var oldestName = '';
    var youngestAge = Infinity;
    var youngestName = '';
    
    for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        
        if (c.gender === 'male') male++;
        else if (c.gender === 'female') female++;
        else other++;
        
        if (c.isDeceased) deceased++;
        
        var hasOngoing = false;
        var hasWidowed = false;
        if (c.relationships) {
            for (var j = 0; j < c.relationships.length; j++) {
                if (c.relationships[j].status === 'ongoing') hasOngoing = true;
                if (c.relationships[j].status === 'widowed') hasWidowed = true;
            }
        }
        if (hasOngoing) partnered++;
        else if (hasWidowed) widowed++;
        
        if (c.professions && c.professions.length > 0) employed++;
        
        var age = getCharacterAge(c);
        if (!c.isDeceased) {
            totalAge += age;
            ageCount++;
        }
        
        if (age > oldestAge) {
            oldestAge = age;
            oldestName = c.name;
        }
        if (age < youngestAge && age > 0) {
            youngestAge = age;
            youngestName = c.name;
        }
        if (age < 18) minors++;
    }
    
    return {
        total: chars.length,
        male: male,
        female: female,
        other: other,
        deceased: deceased,
        living: chars.length - deceased,
        partnered: partnered,
        widowed: widowed,
        single: chars.length - partnered - widowed,
        employed: employed,
        unemployed: chars.length - employed,
        minors: minors,
        adults: chars.length - minors,
        averageAge: ageCount > 0 ? Math.round(totalAge / ageCount) : 0,
        oldestAge: oldestAge,
        oldestName: oldestName,
        youngestAge: youngestAge === Infinity ? 0 : youngestAge,
        youngestName: youngestName,
        genderRatio: female > 0 ? Math.round((male / female) * 100) : 100
    };
}

function calculateAgeDistribution(chars) {
    var distribution = {
        '0-4': 0, '5-9': 0, '10-14': 0, '15-19': 0,
        '20-29': 0, '30-39': 0, '40-49': 0, '50-59': 0,
        '60-69': 0, '70-79': 0, '80+': 0
    };
    
    for (var i = 0; i < chars.length; i++) {
        var age = getCharacterAge(chars[i]);
        if (age <= 4) distribution['0-4']++;
        else if (age <= 9) distribution['5-9']++;
        else if (age <= 14) distribution['10-14']++;
        else if (age <= 19) distribution['15-19']++;
        else if (age <= 29) distribution['20-29']++;
        else if (age <= 39) distribution['30-39']++;
        else if (age <= 49) distribution['40-49']++;
        else if (age <= 59) distribution['50-59']++;
        else if (age <= 69) distribution['60-69']++;
        else if (age <= 79) distribution['70-79']++;
        else distribution['80+']++;
    }
    
    return distribution;
}

function calculateGenderDistribution(chars) {
    return {
        male: chars.filter(function(c) { return c.gender === 'male'; }).length,
        female: chars.filter(function(c) { return c.gender === 'female'; }).length,
        other: chars.filter(function(c) { return c.gender !== 'male' && c.gender !== 'female'; }).length
    };
}

function calculateLifeStageDistribution(chars) {
    return {
        child: chars.filter(function(c) {
            var age = getCharacterAge(c);
            return age < 13 && !c.isDeceased;
        }).length,
        youth: chars.filter(function(c) {
            var age = getCharacterAge(c);
            return age >= 13 && age < 18 && !c.isDeceased;
        }).length,
        adult: chars.filter(function(c) {
            var age = getCharacterAge(c);
            return age >= 18 && age < 60 && !c.isDeceased;
        }).length,
        elder: chars.filter(function(c) {
            var age = getCharacterAge(c);
            return age >= 60 && !c.isDeceased;
        }).length
    };
}

function calculateRelationshipDistribution(chars) {
    var partnered = 0, widowed = 0;
    
    for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        var hasOngoing = false;
        var hasWidowed = false;
        if (c.relationships) {
            for (var j = 0; j < c.relationships.length; j++) {
                if (c.relationships[j].status === 'ongoing') hasOngoing = true;
                if (c.relationships[j].status === 'widowed') hasWidowed = true;
            }
        }
        if (hasOngoing) partnered++;
        else if (hasWidowed) widowed++;
    }
    
    return {
        single: chars.length - partnered - widowed,
        partnered: partnered,
        widowed: widowed
    };
}

function getPopulationPyramidData(chars) {
    var pyramid = {};
    for (var age = 0; age <= 100; age += 5) {
        pyramid[age + '-' + (age + 4)] = { male: 0, female: 0 };
    }
    
    for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        var age = getCharacterAge(c);
        var ageGroup = Math.floor(age / 5) * 5;
        var key = ageGroup + '-' + (ageGroup + 4);
        if (pyramid[key]) {
            if (c.gender === 'male') pyramid[key].male++;
            else if (c.gender === 'female') pyramid[key].female++;
        }
    }
    
    return pyramid;
}

function getEmploymentStats(chars) {
    var workingAge = chars.filter(function(c) {
        var age = getCharacterAge(c);
        return age >= 18 && age < 65 && !c.isDeceased;
    });
    
    var employed = workingAge.filter(function(c) { return (c.professions || []).length > 0; });
    var unemployed = workingAge.length - employed.length;
    
    var professionCounts = {};
    for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        if (c.professions) {
            for (var j = 0; j < c.professions.length; j++) {
                var name = c.professions[j].name || c.professions[j].id;
                professionCounts[name] = (professionCounts[name] || 0) + 1;
            }
        }
    }
    
    var topProfessions = Object.keys(professionCounts)
        .sort(function(a, b) { return professionCounts[b] - professionCounts[a]; })
        .slice(0, 10)
        .map(function(name) { return { name: name, count: professionCounts[name] }; });
    
    return {
        workingAgePopulation: workingAge.length,
        employed: employed.length,
        unemployed: unemployed.length,
        employmentRate: workingAge.length > 0 ? Math.round((employed.length / workingAge.length) * 100) : 0,
        topProfessions: topProfessions,
        professionCount: Object.keys(professionCounts).length
    };
}

// =============================================================================
// 8. UTILITY FUNCTIONS
// =============================================================================

function getCharacterAge(character) {
    return _calculateAge(character.birthYear, character.isDeceased, character.deathYear);
}

function getCharacterStatus(character) {
    return character.isDeceased ? 'Deceased' : 'Living';
}

function getPrimaryProfession(character) {
    if (!character.professions || character.professions.length === 0) return null;
    var primary = null;
    for (var i = 0; i < character.professions.length; i++) {
        if (character.professions[i].primary) {
            primary = character.professions[i];
            break;
        }
    }
    return primary || character.professions[0];
}

// =============================================================================
// 9. PRESET MANAGEMENT
// =============================================================================

function saveCurrentFilters(name) {
    if (!name || name.trim() === '') {
        _showToast('Preset name is required', 'error');
        return false;
    }
    
    censusState.presets[name] = JSON.parse(JSON.stringify(censusState.filters));
    var keys = _getStorageKeys();
    try {
        localStorage.setItem(keys.CENSUS_PRESETS, JSON.stringify(censusState.presets));
    } catch (e) {
        // Silent fail
    }
    if (typeof window.updatePresetSelectUI === 'function') {
        window.updatePresetSelectUI();
    }
    _showToast('Preset "' + name + '" saved', 'success');
    return true;
}

function loadPreset(name) {
    var preset = censusState.presets[name];
    if (preset) {
        censusState.filters = JSON.parse(JSON.stringify(preset));
        _showToast('Loaded preset "' + name + '"', 'success');
        return censusState.filters;
    }
    _showToast('Preset "' + name + '" not found', 'error');
    return null;
}

function deletePreset(name) {
    if (censusState.presets[name]) {
        delete censusState.presets[name];
        var keys = _getStorageKeys();
        try {
            localStorage.setItem(keys.CENSUS_PRESETS, JSON.stringify(censusState.presets));
        } catch (e) {
            // Silent fail
        }
        if (typeof window.updatePresetSelectUI === 'function') {
            window.updatePresetSelectUI();
        }
        _showToast('Deleted preset "' + name + '"', 'info');
        return true;
    }
    return false;
}

function getPresetNames() {
    return Object.keys(censusState.presets);
}

function updateFilterOptions() {
    var rankSelect = document.getElementById('censusFilterRank');
    if (rankSelect) {
        var ranks = _getRanks();
        var currentValue = censusState.filters.rank;
        var html = '<option value="">All Ranks</option>';
        for (var i = 0; i < ranks.length; i++) {
            var selected = currentValue === ranks[i].id ? 'selected' : '';
            html += '<option value="' + ranks[i].id + '" ' + selected + '>' + _escapeHtml(ranks[i].name) + '</option>';
        }
        rankSelect.innerHTML = html;
    }
    
    var roleSelect = document.getElementById('censusFilterRole');
    if (roleSelect) {
        var roles = _getRoles();
        var currentValue = censusState.filters.role;
        var html = '<option value="">All Roles</option>';
        for (var i = 0; i < roles.length; i++) {
            var selected = currentValue === roles[i].id ? 'selected' : '';
            html += '<option value="' + roles[i].id + '" ' + selected + '>' + _escapeHtml(roles[i].name) + '</option>';
        }
        roleSelect.innerHTML = html;
    }
}

// =============================================================================
// 10. LOCATION POPULATION FUNCTIONS (UPDATED WITH UNITS)
// =============================================================================

function getLocationPopulation(locationId) {
    return _getLocationPopulationCount(locationId);
}

function getDirectLocationPopulation(locationId) {
    return _getLocationOwnPopulation(locationId);
}

function getLocationUnitsStats(locationId) {
    return _getLocationUnitStats(locationId);
}

function getLocationBreakdownWithUnits(locationId) {
    var population = getLocationPopulation(locationId);
    var directPopulation = getDirectLocationPopulation(locationId);
    var unitStats = _getLocationUnitStats(locationId);
    var residences = _getResidences().filter(function(r) { return r.locationId === locationId; });
    
    return {
        population: population,
        directPopulation: directPopulation,
        residences: residences.length,
        units: unitStats || {
            totalUnits: 0,
            occupiedUnits: 0,
            vacantUnits: 0,
            demolishedUnits: 0,
            multiUnitResidences: 0,
            unitsPerResidence: 0,
            occupancyRate: 0
        },
        multiUnitResidences: residences.filter(function(r) { return r.isMultiUnit === true; }).length
    };
}

// =============================================================================
// 11. HOUSEHOLD STATISTICS (FIXED)
// =============================================================================

function getHouseholdStats() {
    var households = _getAllHouseholds();
    if (households.length === 0) return null;
    
    var totalMembers = 0;
    var totalWealth = 0;
    var wealthyCount = 0;
    var poorCount = 0;
    var totalHouseholds = households.length;
    var householdsWithLocation = 0;
    var totalUnits = 0;
    var householdsWithUnits = 0;
    
    for (var i = 0; i < households.length; i++) {
        var h = households[i];
        var members = h.members ? h.members.length : 0;
        totalMembers += members;
        var wealth = h.wealth || 0;
        totalWealth += wealth;
        if (wealth > 1000) wealthyCount++;
        if (wealth < 100) poorCount++;
        
        var loc = h.locationId || h.location || null;
        if (loc) householdsWithLocation++;
        
        var unitCount = _getHouseholdUnitCount(h.id);
        totalUnits += unitCount;
        if (unitCount > 0) householdsWithUnits++;
    }
    
    return {
        count: totalHouseholds,
        totalMembers: totalMembers,
        averageSize: totalHouseholds > 0 ? (totalMembers / totalHouseholds).toFixed(1) : '0',
        averageWealth: totalHouseholds > 0 ? Math.round(totalWealth / totalHouseholds) : 0,
        wealthyCount: wealthyCount,
        poorCount: poorCount,
        householdsWithLocation: householdsWithLocation,
        householdsWithoutLocation: totalHouseholds - householdsWithLocation,
        totalUnits: totalUnits,
        householdsWithUnits: householdsWithUnits,
        averageUnitsPerHousehold: totalHouseholds > 0 ? (totalUnits / totalHouseholds).toFixed(1) : '0'
    };
}

function getHouseholdsAtLocation(locationId) {
    var households = _getAllHouseholds();
    if (!locationId) return households;
    
    return households.filter(function(h) {
        var loc = h.locationId || h.location || null;
        return loc === locationId;
    });
}

// =============================================================================
// 12. EXPORTS
// =============================================================================

window.censusState = censusState;
window.initCensusState = initCensusState;
window.saveCurrentView = saveCurrentView;
window.saveSelectedLocation = saveSelectedLocation;
window.getFilteredCharacters = getFilteredCharacters;
window.updateFilterStateFromUI = updateFilterStateFromUI;
window.resetFilters = resetFilters;
window.getFilterSummary = getFilterSummary;
window.calculateStats = calculateStats;
window.calculateAgeDistribution = calculateAgeDistribution;
window.calculateGenderDistribution = calculateGenderDistribution;
window.calculateLifeStageDistribution = calculateLifeStageDistribution;
window.calculateRelationshipDistribution = calculateRelationshipDistribution;
window.getPopulationPyramidData = getPopulationPyramidData;
window.getEmploymentStats = getEmploymentStats;
window.getCharacterAge = getCharacterAge;
window.getCharacterStatus = getCharacterStatus;
window.getPrimaryProfession = getPrimaryProfession;
window.saveCurrentFilters = saveCurrentFilters;
window.loadPreset = loadPreset;
window.deletePreset = deletePreset;
window.getPresetNames = getPresetNames;
window.updateFilterOptions = updateFilterOptions;

// Crime functions
window.getLocationCrimeStats = getLocationCrimeStats;
window.getLocationCrimeRate = getLocationCrimeRate;
window.getLocationJusticeSeverity = getLocationJusticeSeverity;
window.clearCrimeStatsCache = clearCrimeStatsCache;

// Location population
window.getLocationPopulation = getLocationPopulation;
window.getDirectLocationPopulation = getDirectLocationPopulation;
window.getLocationUnitsStats = getLocationUnitsStats;
window.getLocationBreakdownWithUnits = getLocationBreakdownWithUnits;

// Household statistics
window.getHouseholdStats = getHouseholdStats;
window.getHouseholdsAtLocation = getHouseholdsAtLocation;

// Internal exports (for testing/debugging)
window._getAllHouseholds = _getAllHouseholds;
window._getHousehold = _getHousehold;