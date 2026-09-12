/**
 * =============================================================================
 * SETTLEMENT STATE - Single source of truth for settlement data js/settlement/settlement-state.js
 * =============================================================================
 * 
 * Responsibilities:
 * - Store settlement data by location ID
 * - Cache ranks, features, budget, employment, literacy
 * - Change notifications
 * - UI state management
 * - PLACES OF WORSHIP TRACKING
 * - RELIGIOUS DEMOGRAPHICS CACHE
 * - CIVIL LAWS STORAGE (ALREADY PRESENT)
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaceById, getCharacters, getPlaces)
 *   - storage.js (saveMasterData)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _initializingState = false;
    var _notifyingSubscribers = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 3. STATE DEFINITION
    // =========================================================================

    var _state = {
        settlementData: {},
        subscribers: [],
        cache: {
            summary: new Map(),
            budget: new Map(),
            employment: new Map(),
            features: new Map(),
            literacy: new Map(),
            rank: new Map(),
            religiousDemographics: new Map(),
            placesOfWorship: new Map(),
            dominantReligion: new Map(),
            civilLaws: new Map()
        },
        uiState: {
            selectedSettlementId: null,
            viewMode: 'summary',
            expandedSections: new Set(),
            filters: {
                searchTerm: '',
                rankFilter: 'all',
                prosperityFilter: 'all'
            }
        },
        initialized: false,
        version: 1
    };

    // =========================================================================
    // 4. INITIALIZATION
    // =========================================================================

    function _initializeState() {
        if (_initializingState) {
            return;
        }
        _initializingState = true;

        try {
            if (_state.initialized) return;

            if (window.masterData && window.masterData.data) {
                _state.settlementData = window.masterData.data.settlementData || {};
            }

            var places = _getPlaces();
            for (var i = 0; i < places.length; i++) {
                var place = places[i];
                if (!_state.settlementData[place.id]) {
                    _state.settlementData[place.id] = _createDefaultSettlementData(place.id);
                }
            }

            _state.initialized = true;
            _notifySubscribers('initialized', null);

        } catch(e) {
            // Silent fail
        } finally {
            _initializingState = false;
        }
    }

    function _createDefaultSettlementData(locationId) {
        return {
            rankId: 'hamlet',
            specializationRoleId: null,
            featureIds: [],
            prosperity: 50,
            wealth: 0,
            totalDebt: 0,
            foundedYear: _getCurrentYear(),
            lastUpgraded: _getCurrentYear(),
            
            // Budget allocation fields
            budgetAllocationYear: _getCurrentYear(),
            educationBudget: 0,
            educationSpending: 0,
            governmentSalaryBudget: 0,
            infrastructureBudget: 0,
            militaryBudget: 0,

            // Public enterprise tracking
            publicEnterpriseIds: [],
            publicEnterpriseHistory: [],

            // Places of Worship tracking
            placesOfWorship: [],
            dominantReligionId: null,
            religiousUnity: 50,

            // ================================================================
            // CIVIL LAWS - Already present
            // ================================================================
            civilLaws: [],

            budget: {
                income: {
                    taxes: 0,
                    trade: 0,
                    industry: 0,
                    stateEnterprises: 0,
                    other: 0
                },
                expenses: {
                    maintenance: 0,
                    wages: 0,
                    construction: 0,
                    military: 0,
                    education: 0,
                    infrastructure: 0,
                    governmentSalaries: 0,
                    other: 0
                },
                annualSurplus: 0,
                totalIncome: 0,
                totalExpenses: 0
            },
            employment: {
                totalWorkers: 0,
                stateEmployed: 0,
                privateEmployed: 0,
                unemployed: 0,
                averageWage: 0,
                employmentRate: 0
            },
            stateEnterpriseIds: [],
            taxRate: 10,
            tradeTariff: 5,
            industryTaxRate: 8,
            militarySpending: 0,
            infrastructureSpending: 0,
            educationSpending: 0,
            justiceSeverity: 'medium',
            crimeRate: 0.05,
            hasWatch: false,
            watchSize: 0,
            history: [],
            notes: ''
        };
    }

    // =========================================================================
    // 5. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        _state.cache.summary.clear();
        _state.cache.budget.clear();
        _state.cache.employment.clear();
        _state.cache.features.clear();
        _state.cache.literacy.clear();
        _state.cache.rank.clear();
        _state.cache.religiousDemographics.clear();
        _state.cache.placesOfWorship.clear();
        _state.cache.dominantReligion.clear();
        _state.cache.civilLaws.clear();
    }

    function invalidateCache() {
        _rebuildCaches();
        _notifySubscribers('cacheInvalidated', null);
    }

    function refreshFromMasterData() {
        _state.initialized = false;
        _initializeState();
        invalidateCache();
    }

    // =========================================================================
    // 6. STATE ACCESSORS
    // =========================================================================

    function getSettlementData(locationId) {
        if (!locationId) return null;
        if (!_state.settlementData[locationId]) {
            _state.settlementData[locationId] = _createDefaultSettlementData(locationId);
            _saveMasterData();
        }
        return _state.settlementData[locationId];
    }

    function getAllSettlements(options) {
        options = options || {};
        var result = [];
        var places = _getPlaces();

        for (var i = 0; i < places.length; i++) {
            var place = places[i];
            var data = getSettlementData(place.id);
            if (data) {
                result.push({
                    locationId: place.id,
                    locationName: place.displayName,
                    data: data
                });
            }
        }

        if (options.sortBy) {
            result.sort(function(a, b) {
                var compare = 0;
                switch (options.sortBy) {
                    case 'name':
                        compare = (a.locationName || '').localeCompare(b.locationName || '');
                        break;
                    case 'population':
                        var popA = typeof window.getLocationPopulationCount === 'function' ?
                            window.getLocationPopulationCount(a.locationId) : 0;
                        var popB = typeof window.getLocationPopulationCount === 'function' ?
                            window.getLocationPopulationCount(b.locationId) : 0;
                        compare = popA - popB;
                        break;
                    case 'wealth':
                        compare = (a.data.wealth || 0) - (b.data.wealth || 0);
                        break;
                    case 'prosperity':
                        compare = (a.data.prosperity || 0) - (b.data.prosperity || 0);
                        break;
                    default:
                        compare = (a.locationName || '').localeCompare(b.locationName || '');
                }
                return options.sortOrder === 'desc' ? -compare : compare;
            });
        }

        if (options.limit) {
            result = result.slice(0, options.limit);
        }

        return result;
    }

    function getSettlementFeatures(locationId) {
        var data = getSettlementData(locationId);
        if (!data || !data.featureIds) return [];

        if (_state.cache.features.has(locationId)) {
            return _state.cache.features.get(locationId);
        }

        var allFeatures = _getAllFeatures();
        var result = [];
        for (var i = 0; i < data.featureIds.length; i++) {
            var feature = allFeatures.find(function(f) { return f.id === data.featureIds[i]; });
            if (feature) {
                result.push(feature);
            }
        }

        _state.cache.features.set(locationId, result);
        return result;
    }

    function getSettlementBudget(locationId) {
        var data = getSettlementData(locationId);
        if (!data) return null;

        if (_state.cache.budget.has(locationId)) {
            return _state.cache.budget.get(locationId);
        }

        var budget = data.budget || {
            income: { taxes: 0, trade: 0, industry: 0, stateEnterprises: 0, other: 0 },
            expenses: { maintenance: 0, wages: 0, construction: 0, military: 0, education: 0, infrastructure: 0, other: 0 },
            annualSurplus: 0,
            totalIncome: 0,
            totalExpenses: 0
        };

        _state.cache.budget.set(locationId, budget);
        return budget;
    }

    function getSettlementEmployment(locationId) {
        var data = getSettlementData(locationId);
        if (!data) return null;

        if (_state.cache.employment.has(locationId)) {
            return _state.cache.employment.get(locationId);
        }

        var employment = data.employment || {
            totalWorkers: 0,
            stateEmployed: 0,
            privateEmployed: 0,
            unemployed: 0,
            averageWage: 0,
            employmentRate: 0
        };

        _state.cache.employment.set(locationId, employment);
        return employment;
    }

    function getStateEnterpriseIds(locationId) {
        var data = getSettlementData(locationId);
        return data ? data.stateEnterpriseIds || [] : [];
    }

    function getSettlementHistory(locationId) {
        var data = getSettlementData(locationId);
        return data ? data.history || [] : [];
    }

    // =========================================================================
    // 7. BUDGET ALLOCATION ACCESSORS
    // =========================================================================

    function getSettlementBudgetAllocation(locationId) {
        var data = getSettlementData(locationId);
        if (!data) return null;
        
        return {
            year: data.budgetAllocationYear || _getCurrentYear(),
            educationBudget: data.educationBudget || 0,
            governmentSalaryBudget: data.governmentSalaryBudget || 0,
            infrastructureBudget: data.infrastructureBudget || 0,
            militaryBudget: data.militaryBudget || 0,
            totalAllocated: (data.educationBudget || 0) + 
                            (data.governmentSalaryBudget || 0) + 
                            (data.infrastructureBudget || 0) + 
                            (data.militaryBudget || 0)
        };
    }

    function getGovernmentSalaryBudget(locationId) {
        var data = getSettlementData(locationId);
        return data ? data.governmentSalaryBudget || 0 : 0;
    }

    function getEducationBudget(locationId) {
        var data = getSettlementData(locationId);
        return data ? data.educationBudget || 0 : 0;
    }

    // =========================================================================
    // 8. PUBLIC ENTERPRISE ACCESSORS
    // =========================================================================

    function getPublicEnterpriseIds(locationId) {
        var data = getSettlementData(locationId);
        return data ? data.publicEnterpriseIds || [] : [];
    }

    function getPublicEnterprises(locationId) {
        var ids = getPublicEnterpriseIds(locationId);
        var result = [];
        if (typeof window.IndustryQueries !== 'undefined') {
            for (var i = 0; i < ids.length; i++) {
                var enterprise = window.IndustryQueries.getEnterprise(ids[i]);
                if (enterprise) {
                    result.push(enterprise);
                }
            }
        }
        return result;
    }

    function getPublicEnterpriseHistory(locationId) {
        var data = getSettlementData(locationId);
        return data ? data.publicEnterpriseHistory || [] : [];
    }

    // =========================================================================
    // 9. PLACES OF WORSHIP ACCESSORS
    // =========================================================================

    function getPlacesOfWorship(locationId) {
        var data = getSettlementData(locationId);
        if (!data) return [];

        if (_state.cache.placesOfWorship.has(locationId)) {
            return _state.cache.placesOfWorship.get(locationId);
        }

        var places = data.placesOfWorship || [];
        var result = [];

        if (typeof window.ReligionCommands !== 'undefined' &&
            typeof window.ReligionCommands.getPlacesOfWorshipByLocation === 'function') {
            var placeData = window.ReligionCommands.getPlacesOfWorshipByLocation(locationId);
            if (placeData) {
                result = result.concat(placeData);
            }
        }

        _state.cache.placesOfWorship.set(locationId, result);
        return result;
    }

    function getPlaceOfWorshipIds(locationId) {
        var data = getSettlementData(locationId);
        return data ? data.placesOfWorship || [] : [];
    }

    function getDominantReligion(locationId) {
        var data = getSettlementData(locationId);
        if (!data) return null;

        if (_state.cache.dominantReligion.has(locationId)) {
            return _state.cache.dominantReligion.get(locationId);
        }

        var dominantId = data.dominantReligionId || null;
        if (dominantId && typeof window.ReligionState !== 'undefined') {
            var religion = window.ReligionState.getReligion(dominantId);
            _state.cache.dominantReligion.set(locationId, religion);
            return religion;
        }

        return null;
    }

    function getReligiousUnity(locationId) {
        var data = getSettlementData(locationId);
        return data ? data.religiousUnity || 50 : 50;
    }

    function getReligiousDemographics(locationId) {
        var data = getSettlementData(locationId);
        if (!data) return null;

        if (_state.cache.religiousDemographics.has(locationId)) {
            return _state.cache.religiousDemographics.get(locationId);
        }

        var result = {
            byReligion: {},
            total: 0,
            unaffiliated: 0
        };

        if (typeof window.ReligionQueries !== 'undefined') {
            var breakdown = window.ReligionQueries.getReligiousBreakdown(locationId);
            if (breakdown) {
                result = breakdown;
            }
        }

        _state.cache.religiousDemographics.set(locationId, result);
        return result;
    }

    // =========================================================================
    // 10. CIVIL LAWS ACCESSORS (NEW)
    // =========================================================================

    function getCivilLaws(locationId) {
        var data = getSettlementData(locationId);
        if (!data) return [];

        if (_state.cache.civilLaws.has(locationId)) {
            return _state.cache.civilLaws.get(locationId);
        }

        var laws = data.civilLaws || [];
        _state.cache.civilLaws.set(locationId, laws);
        return laws;
    }

    function getCivilLawCount(locationId) {
        var laws = getCivilLaws(locationId);
        return laws.length;
    }

    function getCivilLaw(locationId, lawId) {
        var laws = getCivilLaws(locationId);
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].id === lawId) {
                return laws[i];
            }
        }
        return null;
    }

    function getCivilLawsByDomain(locationId, domain) {
        var laws = getCivilLaws(locationId);
        if (!domain) return laws;

        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].domain === domain) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    function getCivilLawsByType(locationId, type) {
        var laws = getCivilLaws(locationId);
        if (!type) return laws;

        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].type === type) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    function getCivilLawsBySeverity(locationId, severity) {
        var laws = getCivilLaws(locationId);
        if (!severity) return laws;

        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].severity === severity) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    function getEnforcedCivilLaws(locationId) {
        var laws = getCivilLaws(locationId);
        var result = [];

        for (var i = 0; i < laws.length; i++) {
            if (laws[i].crimeMapping && laws[i].crimeMapping.isEnforced) {
                result.push(laws[i]);
            }
        }

        return result;
    }

    // =========================================================================
    // 11. FEATURE DEFINITIONS
    // =========================================================================

    function _getAllFeatures() {
        if (window.masterData && window.masterData.data && window.masterData.data.settlementFeatures) {
            return window.masterData.data.settlementFeatures;
        }

        var features = [
            // Defensive
            { id: 'walls', name: 'Defensive Walls', icon: 'w', cost: 500, defense: 5, maintenance: 10, prosperityBonus: 5, crimeReduction: 0.1, order: 3, category: 'defensive', description: 'Stone walls for protection', isPublic: true },
            { id: 'fort', name: 'Fortification', icon: 'f', cost: 600, defense: 8, maintenance: 15, prosperityBonus: 3, crimeReduction: 0.15, order: 4, category: 'defensive', description: 'Military stronghold', isPublic: true },
            { id: 'watchtower', name: 'Watchtower', icon: 'w', cost: 150, defense: 3, maintenance: 4, crimeReduction: 0.1, order: 2, category: 'defensive', description: 'Lookout post', isPublic: true },
            { id: 'moat', name: 'Moat', icon: 'm', cost: 350, defense: 6, maintenance: 8, prosperityBonus: 2, crimeReduction: 0.08, order: 3, category: 'defensive', description: 'Water-filled defensive ditch', isPublic: true },
            // Civic
            { id: 'town_hall', name: 'Town Hall', icon: 't', cost: 300, prosperityBonus: 6, maintenance: 8, crimeReduction: 0.05, order: 2, category: 'civic', description: 'Government and administration center', isPublic: true },
            { id: 'courthouse', name: 'Courthouse', icon: 'c', cost: 300, justiceBonus: 1.3, maintenance: 8, prosperityBonus: 5, crimeReduction: 0.25, order: 3, category: 'civic', description: 'Center of justice', isPublic: true },
            { id: 'school', name: 'School', icon: 's', cost: 200, educationBonus: 1.2, maintenance: 5, prosperityBonus: 12, literacyBonus: 5, order: 3, category: 'civic', description: 'Center of learning', isPublic: true },
            { id: 'library', name: 'Library', icon: 'l', cost: 250, educationBonus: 1.3, prosperityBonus: 10, maintenance: 8, literacyBonus: 8, order: 3, category: 'civic', description: 'Center of knowledge', isPublic: true },
            { id: 'market_square', name: 'Market Square', icon: 'm', cost: 200, tradeBonus: 1.3, maintenance: 5, prosperityBonus: 10, order: 1, category: 'civic', description: 'Center of commerce', isPublic: true },
            { id: 'guildhall', name: 'Guildhall', icon: 'g', cost: 250, tradeBonus: 1.2, maintenance: 4, prosperityBonus: 7, order: 2, category: 'civic', description: 'Guild headquarters', isPublic: true },
            // Military
            { id: 'barracks', name: 'Barracks', icon: 'b', cost: 350, militaryBonus: 1.4, maintenance: 10, prosperityBonus: 2, crimeReduction: 0.2, order: 2, category: 'military', description: 'Soldier housing', isPublic: true },
            { id: 'garrison', name: 'Garrison', icon: 'g', cost: 500, militaryBonus: 1.6, maintenance: 15, prosperityBonus: 3, crimeReduction: 0.25, order: 3, category: 'military', description: 'Permanent military base', isPublic: true },
            // Aesthetic
            { id: 'park', name: 'Public Park', icon: 'p', cost: 100, prosperityBonus: 4, maintenance: 3, order: 1, category: 'aesthetic', description: 'Public green space', isPublic: true },
            { id: 'gardens', name: 'Public Gardens', icon: 'g', cost: 150, prosperityBonus: 5, maintenance: 4, order: 2, category: 'aesthetic', description: 'Ornamental gardens', isPublic: true },
            // Infrastructure
            { id: 'paved_roads', name: 'Paved Roads', icon: 'r', cost: 250, prosperityBonus: 7, maintenance: 8, order: 2, category: 'infrastructure', description: 'Stone-paved streets', isPublic: true },
            { id: 'sewer_system', name: 'Sewer System', icon: 's', cost: 300, prosperityBonus: 8, maintenance: 6, crimeReduction: 0.08, order: 3, category: 'infrastructure', description: 'Underground drainage', isPublic: true },
            { id: 'water_system', name: 'Water System', icon: 'w', cost: 250, prosperityBonus: 6, maintenance: 5, order: 3, category: 'infrastructure', description: 'Aqueducts and public fountains', isPublic: true },
            { id: 'bridge', name: 'Bridge', icon: 'b', cost: 200, prosperityBonus: 5, maintenance: 4, order: 2, category: 'infrastructure', description: 'Public crossing over water', isPublic: true }
        ];

        if (window.masterData && window.masterData.data) {
            if (!window.masterData.data.settlementFeatures) {
                window.masterData.data.settlementFeatures = features;
                _saveMasterData();
            }
        }

        return features;
    }

    // =========================================================================
    // 12. RANK DEFINITIONS
    // =========================================================================

    function _getAllRanks() {
        if (window.masterData && window.masterData.data && window.masterData.data.settlementRanks) {
            return window.masterData.data.settlementRanks;
        }

        var ranks = [
            { id: 'hamlet', name: 'Hamlet', icon: 'h', minPopulation: 0, maxPopulation: 99, baseTax: 5, order: 1, description: 'A small cluster of dwellings' },
            { id: 'village', name: 'Village', icon: 'v', minPopulation: 100, maxPopulation: 999, baseTax: 15, order: 2, description: 'A small rural community' },
            { id: 'town', name: 'Town', icon: 't', minPopulation: 1000, maxPopulation: 4999, baseTax: 50, order: 3, description: 'A market town with trade' },
            { id: 'city', name: 'City', icon: 'c', minPopulation: 5000, maxPopulation: 19999, baseTax: 150, order: 4, description: 'A major urban center' },
            { id: 'metropolis', name: 'Metropolis', icon: 'm', minPopulation: 20000, maxPopulation: 999999, baseTax: 400, order: 5, description: 'A sprawling capital' }
        ];

        if (window.masterData && window.masterData.data) {
            if (!window.masterData.data.settlementRanks) {
                window.masterData.data.settlementRanks = ranks;
                _saveMasterData();
            }
        }

        return ranks;
    }

    // =========================================================================
    // 13. UI STATE MANAGEMENT
    // =========================================================================

    function getUIState() {
        return {
            selectedSettlementId: _state.uiState.selectedSettlementId,
            viewMode: _state.uiState.viewMode,
            expandedSections: new Set(_state.uiState.expandedSections),
            filters: {
                searchTerm: _state.uiState.filters.searchTerm,
                rankFilter: _state.uiState.filters.rankFilter,
                prosperityFilter: _state.uiState.filters.prosperityFilter
            }
        };
    }

    function setUIState(key, value, options) {
        options = options || {};
        _state.uiState[key] = value;
        if (options.notify !== false) {
            _notifySubscribers('uiStateChanged', { key: key, value: value });
        }
    }

    function updateUIState(updates, options) {
        options = options || {};
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                _state.uiState[key] = updates[key];
            }
        }
        if (options.notify !== false) {
            _notifySubscribers('uiStateChanged', updates);
        }
    }

    // =========================================================================
    // 14. MUTATION HELPERS (Internal)
    // =========================================================================

    function _setSettlementData(locationId, data) {
        _state.settlementData[locationId] = data;
        _saveMasterData();
        _state.cache.summary.delete(locationId);
        _state.cache.budget.delete(locationId);
        _state.cache.employment.delete(locationId);
        _state.cache.features.delete(locationId);
        _state.cache.literacy.delete(locationId);
        _state.cache.rank.delete(locationId);
        _state.cache.religiousDemographics.delete(locationId);
        _state.cache.placesOfWorship.delete(locationId);
        _state.cache.dominantReligion.delete(locationId);
        _state.cache.civilLaws.delete(locationId);
        _notifySubscribers('settlementUpdated', { locationId: locationId, data: data });
        return data;
    }

    function _updateSettlementData(locationId, updates) {
        var data = getSettlementData(locationId);
        if (!data) return null;

        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                data[key] = updates[key];
            }
        }

        _saveMasterData();
        _state.cache.summary.delete(locationId);
        _state.cache.budget.delete(locationId);
        _state.cache.employment.delete(locationId);
        _state.cache.features.delete(locationId);
        _state.cache.literacy.delete(locationId);
        _state.cache.rank.delete(locationId);
        _state.cache.religiousDemographics.delete(locationId);
        _state.cache.placesOfWorship.delete(locationId);
        _state.cache.dominantReligion.delete(locationId);
        _state.cache.civilLaws.delete(locationId);
        _notifySubscribers('settlementUpdated', { locationId: locationId, updates: updates });
        return data;
    }

    function _addFeature(locationId, featureId) {
        var data = getSettlementData(locationId);
        if (!data) return false;

        if (!data.featureIds) data.featureIds = [];
        if (data.featureIds.indexOf(featureId) !== -1) return false;

        data.featureIds.push(featureId);
        _saveMasterData();
        _state.cache.features.delete(locationId);
        _notifySubscribers('featureAdded', { locationId: locationId, featureId: featureId });
        return true;
    }

    function _removeFeature(locationId, featureId) {
        var data = getSettlementData(locationId);
        if (!data || !data.featureIds) return false;

        var index = data.featureIds.indexOf(featureId);
        if (index === -1) return false;

        data.featureIds.splice(index, 1);
        _saveMasterData();
        _state.cache.features.delete(locationId);
        _notifySubscribers('featureRemoved', { locationId: locationId, featureId: featureId });
        return true;
    }

    // =========================================================================
    // 15. CIVIL LAWS MUTATION HELPERS (NEW)
    // =========================================================================

    function _addCivilLaw(locationId, law) {
        var data = getSettlementData(locationId);
        if (!data) return false;

        if (!data.civilLaws) data.civilLaws = [];
        
        // Check for duplicate ID
        for (var i = 0; i < data.civilLaws.length; i++) {
            if (data.civilLaws[i].id === law.id) {
                return false;
            }
        }

        data.civilLaws.push(law);
        _saveMasterData();
        _state.cache.civilLaws.delete(locationId);
        _notifySubscribers('civilLawAdded', { locationId: locationId, law: law });
        return true;
    }

    function _updateCivilLaw(locationId, lawId, updates) {
        var data = getSettlementData(locationId);
        if (!data || !data.civilLaws) return false;

        var index = -1;
        for (var i = 0; i < data.civilLaws.length; i++) {
            if (data.civilLaws[i].id === lawId) {
                index = i;
                break;
            }
        }

        if (index === -1) return false;

        var law = data.civilLaws[index];
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                law[key] = updates[key];
            }
        }

        law.updatedAt = Date.now();

        _saveMasterData();
        _state.cache.civilLaws.delete(locationId);
        _notifySubscribers('civilLawUpdated', { locationId: locationId, lawId: lawId });
        return true;
    }

    function _removeCivilLaw(locationId, lawId) {
        var data = getSettlementData(locationId);
        if (!data || !data.civilLaws) return false;

        var index = -1;
        for (var i = 0; i < data.civilLaws.length; i++) {
            if (data.civilLaws[i].id === lawId) {
                index = i;
                break;
            }
        }

        if (index === -1) return false;

        data.civilLaws.splice(index, 1);
        _saveMasterData();
        _state.cache.civilLaws.delete(locationId);
        _notifySubscribers('civilLawRemoved', { locationId: locationId, lawId: lawId });
        return true;
    }

    // =========================================================================
    // 16. PLACES OF WORSHIP MUTATION HELPERS
    // =========================================================================

    function _addPlaceOfWorship(locationId, placeId) {
        var data = getSettlementData(locationId);
        if (!data) return false;

        if (!data.placesOfWorship) data.placesOfWorship = [];
        if (data.placesOfWorship.indexOf(placeId) !== -1) return false;

        data.placesOfWorship.push(placeId);
        _saveMasterData();
        _state.cache.placesOfWorship.delete(locationId);
        _state.cache.dominantReligion.delete(locationId);
        _notifySubscribers('placeOfWorshipAdded', { locationId: locationId, placeId: placeId });
        return true;
    }

    function _removePlaceOfWorship(locationId, placeId) {
        var data = getSettlementData(locationId);
        if (!data || !data.placesOfWorship) return false;

        var index = data.placesOfWorship.indexOf(placeId);
        if (index === -1) return false;

        data.placesOfWorship.splice(index, 1);
        _saveMasterData();
        _state.cache.placesOfWorship.delete(locationId);
        _state.cache.dominantReligion.delete(locationId);
        _notifySubscribers('placeOfWorshipRemoved', { locationId: locationId, placeId: placeId });
        return true;
    }

    function _setDominantReligion(locationId, religionId) {
        var data = getSettlementData(locationId);
        if (!data) return false;

        data.dominantReligionId = religionId;
        _state.cache.dominantReligion.delete(locationId);
        _state.cache.religiousDemographics.delete(locationId);
        _saveMasterData();
        return true;
    }

    function _setReligiousUnity(locationId, unity) {
        var data = getSettlementData(locationId);
        if (!data) return false;

        data.religiousUnity = Math.min(100, Math.max(0, unity));
        _saveMasterData();
        return true;
    }

    function _addPublicEnterprise(locationId, enterpriseId) {
        var data = getSettlementData(locationId);
        if (!data) return false;

        if (!data.publicEnterpriseIds) data.publicEnterpriseIds = [];
        if (data.publicEnterpriseIds.indexOf(enterpriseId) !== -1) return false;

        data.publicEnterpriseIds.push(enterpriseId);

        if (!data.publicEnterpriseHistory) data.publicEnterpriseHistory = [];
        data.publicEnterpriseHistory.push({
            enterpriseId: enterpriseId,
            year: _getCurrentYear(),
            action: 'added'
        });

        _saveMasterData();
        _notifySubscribers('publicEnterpriseAdded', { locationId: locationId, enterpriseId: enterpriseId });
        return true;
    }

    function _removePublicEnterprise(locationId, enterpriseId) {
        var data = getSettlementData(locationId);
        if (!data || !data.publicEnterpriseIds) return false;

        var index = data.publicEnterpriseIds.indexOf(enterpriseId);
        if (index === -1) return false;

        data.publicEnterpriseIds.splice(index, 1);

        if (!data.publicEnterpriseHistory) data.publicEnterpriseHistory = [];
        data.publicEnterpriseHistory.push({
            enterpriseId: enterpriseId,
            year: _getCurrentYear(),
            action: 'removed'
        });

        _saveMasterData();
        _notifySubscribers('publicEnterpriseRemoved', { locationId: locationId, enterpriseId: enterpriseId });
        return true;
    }

    function _addStateEnterprise(locationId, enterpriseId) {
        var data = getSettlementData(locationId);
        if (!data) return false;

        if (!data.stateEnterpriseIds) data.stateEnterpriseIds = [];
        if (data.stateEnterpriseIds.indexOf(enterpriseId) !== -1) return false;

        data.stateEnterpriseIds.push(enterpriseId);
        _saveMasterData();
        _notifySubscribers('stateEnterpriseAdded', { locationId: locationId, enterpriseId: enterpriseId });
        return true;
    }

    function _removeStateEnterprise(locationId, enterpriseId) {
        var data = getSettlementData(locationId);
        if (!data || !data.stateEnterpriseIds) return false;

        var index = data.stateEnterpriseIds.indexOf(enterpriseId);
        if (index === -1) return false;

        data.stateEnterpriseIds.splice(index, 1);
        _saveMasterData();
        _notifySubscribers('stateEnterpriseRemoved', { locationId: locationId, enterpriseId: enterpriseId });
        return true;
    }

    function _addHistoryEntry(locationId, entry) {
        var data = getSettlementData(locationId);
        if (!data) return false;

        if (!data.history) data.history = [];
        data.history.push(entry);
        _saveMasterData();
        return true;
    }

    // =========================================================================
    // 17. CHANGE NOTIFICATIONS
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        _state.subscribers.push(callback);

        return function unsubscribe() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    function _notifySubscribers(event, data) {
        if (_notifyingSubscribers) {
            return;
        }
        _notifyingSubscribers = true;

        try {
            var subscribers = _state.subscribers.slice();
            for (var i = 0; i < subscribers.length; i++) {
                try {
                    subscribers[i]({ type: event, data: data });
                } catch(e) {
                    // Don't let one subscriber break others
                }
            }
        } finally {
            _notifyingSubscribers = false;
        }
    }

    // =========================================================================
    // 18. EXPORTS
    // =========================================================================

    window.SettlementState = {
        getSettlementData: getSettlementData,
        getAllSettlements: getAllSettlements,
        getSettlementFeatures: getSettlementFeatures,
        getSettlementBudget: getSettlementBudget,
        getSettlementEmployment: getSettlementEmployment,
        getStateEnterpriseIds: getStateEnterpriseIds,
        getSettlementHistory: getSettlementHistory,

        // Budget allocation accessors
        getSettlementBudgetAllocation: getSettlementBudgetAllocation,
        getGovernmentSalaryBudget: getGovernmentSalaryBudget,
        getEducationBudget: getEducationBudget,

        // Public enterprise accessors
        getPublicEnterpriseIds: getPublicEnterpriseIds,
        getPublicEnterprises: getPublicEnterprises,
        getPublicEnterpriseHistory: getPublicEnterpriseHistory,

        // Places of Worship accessors
        getPlacesOfWorship: getPlacesOfWorship,
        getPlaceOfWorshipIds: getPlaceOfWorshipIds,
        getDominantReligion: getDominantReligion,
        getReligiousUnity: getReligiousUnity,
        getReligiousDemographics: getReligiousDemographics,

        // ================================================================
        // CIVIL LAWS ACCESSORS (NEW)
        // ================================================================
        getCivilLaws: getCivilLaws,
        getCivilLawCount: getCivilLawCount,
        getCivilLaw: getCivilLaw,
        getCivilLawsByDomain: getCivilLawsByDomain,
        getCivilLawsByType: getCivilLawsByType,
        getCivilLawsBySeverity: getCivilLawsBySeverity,
        getEnforcedCivilLaws: getEnforcedCivilLaws,

        _getAllRanks: _getAllRanks,
        _getAllFeatures: _getAllFeatures,

        getUIState: getUIState,
        setUIState: setUIState,
        updateUIState: updateUIState,

        invalidateCache: invalidateCache,
        refreshFromMasterData: refreshFromMasterData,

        subscribe: subscribe,

        _setSettlementData: _setSettlementData,
        _updateSettlementData: _updateSettlementData,
        _addFeature: _addFeature,
        _removeFeature: _removeFeature,
        _addStateEnterprise: _addStateEnterprise,
        _removeStateEnterprise: _removeStateEnterprise,
        _addHistoryEntry: _addHistoryEntry,

        // Public enterprise mutation helpers
        _addPublicEnterprise: _addPublicEnterprise,
        _removePublicEnterprise: _removePublicEnterprise,

        // Places of Worship mutation helpers
        _addPlaceOfWorship: _addPlaceOfWorship,
        _removePlaceOfWorship: _removePlaceOfWorship,
        _setDominantReligion: _setDominantReligion,
        _setReligiousUnity: _setReligiousUnity,

        // ================================================================
        // CIVIL LAWS MUTATION HELPERS (NEW)
        // ================================================================
        _addCivilLaw: _addCivilLaw,
        _updateCivilLaw: _updateCivilLaw,
        _removeCivilLaw: _removeCivilLaw,

        _initialize: _initializeState
    };

    if (typeof window !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                _initializeState();
            });
        } else {
            setTimeout(function() {
                _initializeState();
            }, 0);
        }
    }

})();