/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD STATE (household-state.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/household-state.js
 * 
 * Single source of truth for all household data. Manages caching, subscriptions,
 * and data loading.
 * 
 * UPDATED: Added enterpriseHistory field for tracking enterprise ownership changes
 *          Added trackEnterpriseProfit() function
 *          Added getHouseholdEnterpriseProfitHistory() function
 *          Added getHouseholdEnterpriseValue() function
 *          Added updateHousehold() method for direct updates
 * 
 * DEPENDENCIES:
 *   - accessors.js - getCharacters, getPlaceById, getCurrentYear
 *   - storage.js - saveMasterData
 *   - ids.js - generateId
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE DEFINITION
    // =========================================================================

    var _state = {
        households: [],
        householdPositions: [],
        householdAssignments: [],
        cache: {
            byId: new Map(),
            byLocation: new Map(),
            byStatus: new Map(),
            byMember: new Map(),
            byHead: new Map()
        },
        uiState: {
            selectedHouseholdId: null,
            selectedCharacterId: null,
            selectedPositionId: null,
            filters: {
                searchTerm: '',
                statusFilter: 'all',
                locationFilter: 'all'
            },
            viewMode: 'list',
            expandedHouseholds: {}
        },
        subscribers: [],
        _processingState: false,
        version: 2,
        timestamp: Date.now()
    };

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getMasterData() {
        return typeof window.masterData !== 'undefined' ? window.masterData : null;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // =========================================================================
    // 3. DATA LOADING
    // =========================================================================

    function _loadHouseholds() {
        var master = _getMasterData();
        if (master && master.data) {
            if (!master.data.households) {
                master.data.households = [];
            }
            // Ensure all households have required fields
            for (var i = 0; i < master.data.households.length; i++) {
                var h = master.data.households[i];
                if (!h.enterprises) h.enterprises = [];
                if (!h.enterpriseHistory) h.enterpriseHistory = [];
                if (!h.eventLog) h.eventLog = [];
                if (!h.nameHistory) h.nameHistory = [];
                if (!h.members) h.members = [];
                if (!h.departments) h.departments = [];
                if (!h.notes) h.notes = '';
                if (!h.status) h.status = 'active';
                if (!h.wealth) h.wealth = 0;
                if (!h.reputation) h.reputation = 10;
                if (!h.debt) h.debt = 0;
                if (!h.powerScore) h.powerScore = 0;
                if (!h.economy) h.economy = {};
                if (!h.resources) h.resources = { food: 0, livestock: 0, goods: 0 };
            }
            return master.data.households;
        }
        return [];
    }

    function _loadHouseholdPositions() {
        var master = _getMasterData();
        if (master && master.data) {
            if (!master.data.householdPositions) {
                master.data.householdPositions = [];
            }
            return master.data.householdPositions;
        }
        return [];
    }

    function _loadHouseholdAssignments() {
        var master = _getMasterData();
        if (master && master.data) {
            if (!master.data.householdAssignments) {
                master.data.householdAssignments = [];
            }
            return master.data.householdAssignments;
        }
        return [];
    }

    function _loadData() {
        if (_state._processingState) return;
        _state._processingState = true;
        try {
            _state.households = _loadHouseholds();
            _state.householdPositions = _loadHouseholdPositions();
            _state.householdAssignments = _loadHouseholdAssignments();
            _rebuildCaches();
        } finally {
            _state._processingState = false;
        }
    }

    // =========================================================================
    // 4. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        var cache = _state.cache;
        cache.byId.clear();
        cache.byLocation.clear();
        cache.byStatus.clear();
        cache.byMember.clear();
        cache.byHead.clear();

        var households = _state.households;
        for (var i = 0; i < households.length; i++) {
            var h = households[i];
            if (!h || !h.id) continue;

            cache.byId.set(h.id, h);

            var locationKey = h.locationId || 'none';
            if (!cache.byLocation.has(locationKey)) {
                cache.byLocation.set(locationKey, []);
            }
            cache.byLocation.get(locationKey).push(h);

            var statusKey = h.status || 'active';
            if (!cache.byStatus.has(statusKey)) {
                cache.byStatus.set(statusKey, []);
            }
            cache.byStatus.get(statusKey).push(h);

            // Cache by member
            if (h.members) {
                for (var j = 0; j < h.members.length; j++) {
                    var member = h.members[j];
                    if (member && member.characterId) {
                        if (!cache.byMember.has(member.characterId)) {
                            cache.byMember.set(member.characterId, []);
                        }
                        cache.byMember.get(member.characterId).push(h.id);
                    }
                }
            }

            // Cache by head
            for (var k = 0; k < h.members.length; k++) {
                var m = h.members[k];
                if (m && m.isHead && m.characterId) {
                    cache.byHead.set(h.id, m.characterId);
                }
            }
        }
    }

    function invalidateCache() {
        if (_state._processingState) return;
        _state._processingState = true;
        try {
            _rebuildCaches();
            _notifySubscribers({ type: 'cacheInvalidated' });
        } finally {
            _state._processingState = false;
        }
    }

    // =========================================================================
    // 5. SUBSCRIPTION MANAGEMENT
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

    function _notifySubscribers(event) {
        var subscribers = _state.subscribers;
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i](event);
            } catch (e) {
                // Silent fail for subscriber errors
            }
        }
    }

    // =========================================================================
    // 6. UI STATE MANAGEMENT
    // =========================================================================

    function getUIState() {
        return {
            selectedHouseholdId: _state.uiState.selectedHouseholdId,
            selectedCharacterId: _state.uiState.selectedCharacterId,
            selectedPositionId: _state.uiState.selectedPositionId,
            filters: {
                searchTerm: _state.uiState.filters.searchTerm,
                statusFilter: _state.uiState.filters.statusFilter,
                locationFilter: _state.uiState.filters.locationFilter
            },
            viewMode: _state.uiState.viewMode,
            expandedHouseholds: _state.uiState.expandedHouseholds
        };
    }

    function setUIState(key, value, options) {
        options = options || {};
        if (_state.uiState[key] !== undefined) {
            _state.uiState[key] = value;
            if (options.notify !== false) {
                _notifySubscribers({ type: 'uiStateChange', key: key, value: value });
            }
        }
    }

    function updateUIState(updates, options) {
        options = options || {};
        var changed = false;
        for (var key in updates) {
            if (updates.hasOwnProperty(key) && _state.uiState[key] !== undefined) {
                if (typeof updates[key] === 'object' && updates[key] !== null) {
                    // Deep merge for filters
                    if (key === 'filters') {
                        for (var filterKey in updates[key]) {
                            if (updates[key].hasOwnProperty(filterKey)) {
                                _state.uiState.filters[filterKey] = updates[key][filterKey];
                                changed = true;
                            }
                        }
                    } else {
                        _state.uiState[key] = updates[key];
                        changed = true;
                    }
                } else {
                    _state.uiState[key] = updates[key];
                    changed = true;
                }
            }
        }
        if (changed && options.notify !== false) {
            _notifySubscribers({ type: 'uiStateChange', updates: updates });
        }
        return changed;
    }

    // =========================================================================
    // 7. STATE MUTATION (Internal)
    // =========================================================================

    function _setHouseholds(households) {
        _state.households = households;
        var master = _getMasterData();
        if (master && master.data) {
            master.data.households = households;
        }
        _rebuildCaches();
        _saveMasterData();
        _notifySubscribers({ type: 'change', data: { households: households } });
    }

    function _setHouseholdPositions(positions) {
        _state.householdPositions = positions;
        var master = _getMasterData();
        if (master && master.data) {
            master.data.householdPositions = positions;
        }
        _rebuildCaches();
        _saveMasterData();
        _notifySubscribers({ type: 'positionsChange', data: { positions: positions } });
    }

    function _setHouseholdAssignments(assignments) {
        _state.householdAssignments = assignments;
        var master = _getMasterData();
        if (master && master.data) {
            master.data.householdAssignments = assignments;
        }
        _rebuildCaches();
        _saveMasterData();
        _notifySubscribers({ type: 'assignmentsChange', data: { assignments: assignments } });
    }

    // =========================================================================
    // 8. PUBLIC API - DATA ACCESS
    // =========================================================================

    function getState(options) {
        options = options || {};
        var result = {
            households: _state.households.slice(),
            householdPositions: _state.householdPositions.slice(),
            householdAssignments: _state.householdAssignments.slice(),
            version: _state.version,
            timestamp: _state.timestamp
        };
        if (options.includeUI) {
            result.uiState = getUIState();
        }
        return result;
    }

    function getHousehold(householdId) {
        if (!householdId) return null;
        if (_state.cache.byId.has(householdId)) {
            return _state.cache.byId.get(householdId);
        }
        return null;
    }

    function getAllHouseholds(options) {
        options = options || {};
        var households = _state.households.slice();
        if (!options.includeDeprecated) {
            households = households.filter(function(h) {
                return h.status !== 'deprecated' && h.status !== 'destroyed';
            });
        }
        return households;
    }

    function getCharacterHousehold(characterId) {
        if (!characterId) return null;
        var householdIds = _state.cache.byMember.get(characterId);
        if (householdIds && householdIds.length > 0) {
            return getHousehold(householdIds[0]);
        }
        return null;
    }

    function getHouseholdsByLocation(locationId, options) {
        options = options || {};
        var key = locationId || 'none';
        var result = _state.cache.byLocation.get(key);
        if (!result) return [];
        var households = result.slice();
        if (!options.includeDeprecated) {
            households = households.filter(function(h) {
                return h.status !== 'deprecated' && h.status !== 'destroyed';
            });
        }
        return households;
    }

    function getHouseholdsByStatus(status, options) {
        options = options || {};
        var key = status || 'active';
        var result = _state.cache.byStatus.get(key);
        if (!result) return [];
        var households = result.slice();
        if (!options.includeDeprecated) {
            households = households.filter(function(h) {
                return h.status !== 'deprecated' && h.status !== 'destroyed';
            });
        }
        return households;
    }

    function getHouseholdMembersWithCharacters(householdId) {
        var household = getHousehold(householdId);
        if (!household || !household.members) return [];

        var result = [];
        for (var i = 0; i < household.members.length; i++) {
            var member = household.members[i];
            var character = _getCharacterById(member.characterId);
            result.push({
                characterId: member.characterId,
                character: character,
                characterName: character ? (character.name + (character.surname ? ' ' + character.surname : '')) : 'Unknown',
                type: member.type || 'family',
                departmentId: member.departmentId || null,
                role: member.role || null,
                isHead: member.isHead || false,
                joinedYear: member.joinedYear || null,
                notes: member.notes || '',
                headSince: member.headSince || null
            });
        }
        return result;
    }

    function getHouseholdHead(householdId) {
        var headId = _state.cache.byHead.get(householdId);
        if (headId) {
            return _getCharacterById(headId);
        }
        return null;
    }

    function getHouseholdStatus(householdId) {
        var household = getHousehold(householdId);
        if (!household) {
            return {
                exists: false,
                isEmpty: true,
                isVacant: true,
                livingCount: 0,
                deceasedCount: 0,
                totalMembers: 0,
                status: 'unknown',
                statusIcon: '❓',
                statusMessage: 'Household not found',
                statusColor: 'var(--dim)',
                householdName: 'Unknown'
            };
        }

        var livingCount = 0;
        var deceasedCount = 0;
        var totalMembers = household.members ? household.members.length : 0;

        for (var i = 0; i < totalMembers; i++) {
            var member = household.members[i];
            var char = _getCharacterById(member.characterId);
            if (char) {
                if (char.isDeceased) {
                    deceasedCount++;
                } else {
                    livingCount++;
                }
            } else {
                // Missing character - count as deceased for status purposes
                deceasedCount++;
            }
        }

        var isEmpty = totalMembers === 0;
        var isVacant = livingCount === 0;

        var status = household.status || 'active';
        var statusIcon = '🏠';
        var statusMessage = 'Active';
        var statusColor = 'var(--success)';

        if (status === 'destroyed') {
            statusIcon = '💀';
            statusMessage = 'Destroyed';
            statusColor = 'var(--danger)';
        } else if (isEmpty) {
            status = 'empty';
            statusIcon = '◻️';
            statusMessage = 'Empty';
            statusColor = 'var(--dim)';
        } else if (isVacant) {
            status = 'vacant';
            statusIcon = '◻️';
            statusMessage = 'Vacant (all members deceased)';
            statusColor = 'var(--warn)';
        } else if (livingCount <= 2 && totalMembers > 3) {
            status = 'declining';
            statusIcon = '⬇️';
            statusMessage = 'Declining (' + livingCount + ' living)';
            statusColor = 'var(--warn)';
        }

        return {
            exists: true,
            isEmpty: isEmpty,
            isVacant: isVacant,
            livingCount: livingCount,
            deceasedCount: deceasedCount,
            totalMembers: totalMembers,
            status: status,
            statusIcon: statusIcon,
            statusMessage: statusMessage,
            statusColor: statusColor,
            householdName: household.name || 'Unnamed'
        };
    }

    // =========================================================================
    // 9. PUBLIC API - ENTERPRISE INTEGRATION
    // =========================================================================

    /**
     * Gets all enterprise IDs owned by a household
     */
    function getHouseholdEnterprises(householdId) {
        var household = getHousehold(householdId);
        if (!household) return [];
        return household.enterprises || [];
    }

    /**
     * Gets the enterprise history for a household
     */
    function getHouseholdEnterpriseHistory(householdId) {
        var household = getHousehold(householdId);
        if (!household) return [];
        return household.enterpriseHistory || [];
    }

    /**
     * Tracks enterprise profit for a household
     * @param {string} householdId - Household ID
     * @param {string} enterpriseId - Enterprise ID
     * @param {number} profit - Profit amount (positive or negative)
     * @param {number} year - Year
     * @returns {boolean} True if tracked
     */
    function trackEnterpriseProfit(householdId, enterpriseId, profit, year) {
        var household = getHousehold(householdId);
        if (!household) return false;

        if (!household.enterpriseHistory) household.enterpriseHistory = [];
        household.enterpriseHistory.push({
            enterpriseId: enterpriseId,
            year: year || _getCurrentYear(),
            profit: profit,
            type: profit >= 0 ? 'profit' : 'loss'
        });

        if (household.enterpriseHistory.length > 100) {
            household.enterpriseHistory = household.enterpriseHistory.slice(-100);
        }

        _saveMasterData();
        return true;
    }

    /**
     * Gets enterprise profit history for a household
     * @param {string} householdId - Household ID
     * @param {number} limit - Number of entries to return
     * @returns {Array} Profit history
     */
    function getHouseholdEnterpriseProfitHistory(householdId, limit) {
        var household = getHousehold(householdId);
        if (!household || !household.enterpriseHistory) return [];

        limit = limit || 20;
        var history = household.enterpriseHistory.slice();
        history.sort(function(a, b) { return (b.year || 0) - (a.year || 0); });
        return history.slice(0, limit);
    }

    /**
     * Gets total enterprise value for a household
     * @param {string} householdId - Household ID
     * @returns {number} Total value
     */
    function getHouseholdEnterpriseValue(householdId) {
        var household = getHousehold(householdId);
        if (!household || !household.enterprises) return 0;

        var total = 0;
        if (typeof window.IndustryQueries !== 'undefined') {
            for (var i = 0; i < household.enterprises.length; i++) {
                var summary = window.IndustryQueries.getEnterpriseSummary(household.enterprises[i]);
                if (summary) {
                    total += summary.wealth || 0;
                }
            }
        }
        return total;
    }

    /**
     * Adds an enterprise to a household's ownership list
     */
    function addEnterpriseToHousehold(householdId, enterpriseId, year) {
        var household = getHousehold(householdId);
        if (!household) return false;

        if (!household.enterprises) household.enterprises = [];
        if (!household.enterpriseHistory) household.enterpriseHistory = [];

        // Check if already owned
        if (household.enterprises.indexOf(enterpriseId) !== -1) {
            return false;
        }

        household.enterprises.push(enterpriseId);
        household.enterpriseHistory.push({
            enterpriseId: enterpriseId,
            year: year || _getCurrentYear(),
            action: 'acquired'
        });

        // Save changes
        var households = _state.households;
        var index = -1;
        for (var i = 0; i < households.length; i++) {
            if (households[i].id === householdId) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            households[index] = household;
            _setHouseholds(households);
        }

        return true;
    }

    /**
     * Removes an enterprise from a household's ownership list
     */
    function removeEnterpriseFromHousehold(householdId, enterpriseId, year) {
        var household = getHousehold(householdId);
        if (!household) return false;
        if (!household.enterprises) return false;

        var index = household.enterprises.indexOf(enterpriseId);
        if (index === -1) {
            return false;
        }

        household.enterprises.splice(index, 1);

        if (!household.enterpriseHistory) household.enterpriseHistory = [];
        household.enterpriseHistory.push({
            enterpriseId: enterpriseId,
            year: year || _getCurrentYear(),
            action: 'removed'
        });

        // Save changes
        var households = _state.households;
        var idx = -1;
        for (var i = 0; i < households.length; i++) {
            if (households[i].id === householdId) {
                idx = i;
                break;
            }
        }
        if (idx !== -1) {
            households[idx] = household;
            _setHouseholds(households);
        }

        return true;
    }

    /**
     * Transfers all enterprises from one household to another
     */
    function transferEnterprisesToHousehold(fromHouseholdId, toHouseholdId, year) {
        var fromHousehold = getHousehold(fromHouseholdId);
        var toHousehold = getHousehold(toHouseholdId);
        if (!fromHousehold || !toHousehold) return false;

        var enterprises = fromHousehold.enterprises || [];
        var transferred = 0;

        for (var i = 0; i < enterprises.length; i++) {
            var eId = enterprises[i];
            // Add to target
            if (!toHousehold.enterprises) toHousehold.enterprises = [];
            if (toHousehold.enterprises.indexOf(eId) === -1) {
                toHousehold.enterprises.push(eId);
                if (!toHousehold.enterpriseHistory) toHousehold.enterpriseHistory = [];
                toHousehold.enterpriseHistory.push({
                    enterpriseId: eId,
                    year: year || _getCurrentYear(),
                    action: 'transferred_from_' + fromHouseholdId
                });
                transferred++;
            }
        }

        // Clear from source
        fromHousehold.enterprises = [];
        if (!fromHousehold.enterpriseHistory) fromHousehold.enterpriseHistory = [];
        fromHousehold.enterpriseHistory.push({
            year: year || _getCurrentYear(),
            action: 'transferred_all_to_' + toHouseholdId,
            count: transferred
        });

        // Save changes
        var households = _state.households;
        var fromIdx = -1, toIdx = -1;
        for (var i = 0; i < households.length; i++) {
            if (households[i].id === fromHouseholdId) fromIdx = i;
            if (households[i].id === toHouseholdId) toIdx = i;
        }
        if (fromIdx !== -1) households[fromIdx] = fromHousehold;
        if (toIdx !== -1) households[toIdx] = toHousehold;
        if (fromIdx !== -1 || toIdx !== -1) {
            _setHouseholds(households);
        }

        return transferred > 0;
    }

    /**
     * Gets all enterprises owned by a household with full data
     */
    function getHouseholdEnterprisesWithData(householdId) {
        var enterpriseIds = getHouseholdEnterprises(householdId);
        var result = [];

        if (typeof window.IndustryState !== 'undefined') {
            for (var i = 0; i < enterpriseIds.length; i++) {
                var enterprise = window.IndustryState.getEnterprise(enterpriseIds[i]);
                if (enterprise) {
                    result.push(enterprise);
                }
            }
        }

        return result;
    }

    // =========================================================================
    // 10. PUBLIC API - NAME PERIOD MANAGEMENT
    // =========================================================================

    function getHouseholdNamePeriods(householdId) {
        var household = getHousehold(householdId);
        if (!household) return [];
        return household.nameHistory || [];
    }

    function getHouseholdNamePeriodForYear(householdId, year) {
        var periods = getHouseholdNamePeriods(householdId);
        if (periods.length === 0) return null;

        // Sort by year descending
        var sorted = periods.slice().sort(function(a, b) {
            return (b.year || 0) - (a.year || 0);
        });

        // Find the period that was active at the given year
        for (var i = 0; i < sorted.length; i++) {
            var period = sorted[i];
            if (period.year <= year) {
                // Check if this period ended before the given year
                var ended = false;
                for (var j = i + 1; j < sorted.length; j++) {
                    if (sorted[j].year > year && sorted[j].periodEnd === period.year) {
                        ended = true;
                        break;
                    }
                }
                if (!ended) {
                    return period;
                }
            }
        }

        // If no period found, return the most recent
        return sorted[0] || null;
    }

    function editHouseholdNamePeriod(householdId, periodIndex, updates) {
        var household = getHousehold(householdId);
        if (!household || !household.nameHistory) return false;
        if (periodIndex < 0 || periodIndex >= household.nameHistory.length) return false;

        var allowedFields = ['oldName', 'newName', 'year', 'periodEnd', 'reason', 'changedBy'];
        for (var i = 0; i < allowedFields.length; i++) {
            var key = allowedFields[i];
            if (updates[key] !== undefined) {
                household.nameHistory[periodIndex][key] = updates[key];
            }
        }

        var households = _state.households;
        var index = -1;
        for (var j = 0; j < households.length; j++) {
            if (households[j].id === householdId) {
                index = j;
                break;
            }
        }
        if (index !== -1) {
            households[index] = household;
            _setHouseholds(households);
        }

        return true;
    }

    function deleteHouseholdNamePeriod(householdId, periodIndex) {
        var household = getHousehold(householdId);
        if (!household || !household.nameHistory) return false;
        if (periodIndex < 0 || periodIndex >= household.nameHistory.length) return false;

        household.nameHistory.splice(periodIndex, 1);

        var households = _state.households;
        var index = -1;
        for (var j = 0; j < households.length; j++) {
            if (households[j].id === householdId) {
                index = j;
                break;
            }
        }
        if (index !== -1) {
            households[index] = household;
            _setHouseholds(households);
        }

        return true;
    }

    // =========================================================================
    // 11. PUBLIC API - RESIDENCE ASSOCIATION
    // =========================================================================

    function associateHouseholdWithResidence(householdId, residenceId, options) {
        options = options || {};
        var household = getHousehold(householdId);
        if (!household) return false;

        household.residenceId = residenceId;
        household.residenceName = options.residenceName || null;
        household.residenceType = options.residenceType || null;
        household.associatedYear = options.year || _getCurrentYear();
        household.residenceUnitNumber = options.unitNumber || null;
        household.residenceNotes = options.notes || '';

        var households = _state.households;
        var index = -1;
        for (var i = 0; i < households.length; i++) {
            if (households[i].id === householdId) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            households[index] = household;
            _setHouseholds(households);
        }

        return true;
    }

    function disassociateHouseholdFromResidence(householdId, residenceId, reason, year) {
        var household = getHousehold(householdId);
        if (!household) return false;

        // Store the disassociation in history
        if (!household.residenceHistory) household.residenceHistory = [];
        household.residenceHistory.push({
            residenceId: residenceId,
            residenceName: household.residenceName,
            action: 'disassociated',
            year: year || _getCurrentYear(),
            reason: reason || 'Unknown'
        });

        household.residenceId = null;
        household.residenceName = null;
        household.residenceType = null;
        household.associatedYear = null;
        household.residenceUnitNumber = null;

        var households = _state.households;
        var index = -1;
        for (var i = 0; i < households.length; i++) {
            if (households[i].id === householdId) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            households[index] = household;
            _setHouseholds(households);
        }

        return true;
    }

    function getHouseholdResidence(householdId) {
        var household = getHousehold(householdId);
        if (!household) return null;
        if (!household.residenceId) return null;

        return {
            residenceId: household.residenceId,
            residenceName: household.residenceName,
            residenceType: household.residenceType,
            associatedYear: household.associatedYear,
            unitNumber: household.residenceUnitNumber,
            notes: household.residenceNotes
        };
    }

    function getHouseholdsByResidence(residenceId) {
        var households = _state.households;
        var result = [];
        for (var i = 0; i < households.length; i++) {
            if (households[i].residenceId === residenceId) {
                result.push(households[i]);
            }
        }
        return result;
    }

    // =========================================================================
    // 12. PUBLIC API - POSITION FUNCTIONS
    // =========================================================================

    function createHouseholdPosition(data) {
        data = data || {};
        var position = {
            id: _generateId('hpos'),
            name: data.name || 'Unnamed Position',
            householdId: data.householdId || null,
            departmentId: data.departmentId || null,
            requiredRoleId: data.requiredRoleId || null,
            minSkillLevel: data.minSkillLevel || 0,
            description: data.description || '',
            priority: data.priority || 10,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        _state.householdPositions.push(position);
        _setHouseholdPositions(_state.householdPositions);

        return position;
    }

    function updateHouseholdPosition(positionId, updates) {
        var positions = _state.householdPositions;
        var index = -1;
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) {
                index = i;
                break;
            }
        }
        if (index === -1) return null;

        var allowedFields = ['name', 'departmentId', 'requiredRoleId', 'minSkillLevel', 'description', 'priority'];
        for (var j = 0; j < allowedFields.length; j++) {
            var key = allowedFields[j];
            if (updates[key] !== undefined) {
                positions[index][key] = updates[key];
            }
        }
        positions[index].updatedAt = Date.now();

        _setHouseholdPositions(positions);
        return positions[index];
    }

    function deleteHouseholdPosition(positionId, options) {
        options = options || {};
        var positions = _state.householdPositions;
        var newPositions = [];
        var removed = null;

        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) {
                removed = positions[i];
            } else {
                newPositions.push(positions[i]);
            }
        }

        if (!removed) return false;

        // Remove assignments if requested
        if (options.removeAssignments) {
            var assignments = _state.householdAssignments;
            var newAssignments = [];
            for (var j = 0; j < assignments.length; j++) {
                if (assignments[j].positionId !== positionId) {
                    newAssignments.push(assignments[j]);
                }
            }
            _setHouseholdAssignments(newAssignments);
        }

        _setHouseholdPositions(newPositions);
        return true;
    }

    function getHouseholdPosition(positionId) {
        var positions = _state.householdPositions;
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) {
                return positions[i];
            }
        }
        return null;
    }

    function getHouseholdPositions(options) {
        options = options || {};
        var positions = _state.householdPositions.slice();

        if (options.householdId) {
            positions = positions.filter(function(p) {
                return p.householdId === options.householdId;
            });
        }

        if (options.departmentId) {
            positions = positions.filter(function(p) {
                return p.departmentId === options.departmentId;
            });
        }

        if (options.includeUnassigned === false) {
            // Filter to positions with at least one assignment
            var assignedIds = {};
            var assignments = _state.householdAssignments;
            for (var i = 0; i < assignments.length; i++) {
                assignedIds[assignments[i].positionId] = true;
            }
            positions = positions.filter(function(p) {
                return assignedIds[p.id] === true;
            });
        }

        return positions;
    }

    // =========================================================================
    // 13. PUBLIC API - ASSIGNMENT FUNCTIONS
    // =========================================================================

    function assignCharacterToHouseholdPosition(positionId, characterId, options) {
        options = options || {};
        var position = getHouseholdPosition(positionId);
        if (!position) return null;

        var assignment = {
            id: _generateId('hass'),
            positionId: positionId,
            characterId: characterId,
            householdId: position.householdId,
            startYear: options.startYear || _getCurrentYear(),
            endYear: options.endYear || null,
            title: options.title || null,
            notes: options.notes || '',
            roleIdAtAssignment: options.roleIdAtAssignment || null,
            skillLevelAtAssignment: options.skillLevelAtAssignment || 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        _state.householdAssignments.push(assignment);
        _setHouseholdAssignments(_state.householdAssignments);

        return assignment;
    }

    function getHouseholdAssignment(assignmentId) {
        var assignments = _state.householdAssignments;
        for (var i = 0; i < assignments.length; i++) {
            if (assignments[i].id === assignmentId) {
                return assignments[i];
            }
        }
        return null;
    }

    function endHouseholdAssignment(assignmentId, endYear, reason) {
        var assignments = _state.householdAssignments;
        var index = -1;
        for (var i = 0; i < assignments.length; i++) {
            if (assignments[i].id === assignmentId) {
                index = i;
                break;
            }
        }
        if (index === -1) return null;

        assignments[index].endYear = endYear || _getCurrentYear();
        assignments[index].notes = (assignments[index].notes || '') + ' [Ended: ' + (reason || 'Unknown reason') + ']';
        assignments[index].updatedAt = Date.now();

        _setHouseholdAssignments(assignments);
        return assignments[index];
    }

    function deleteHouseholdAssignment(assignmentId) {
        var assignments = _state.householdAssignments;
        var newAssignments = [];
        var removed = null;

        for (var i = 0; i < assignments.length; i++) {
            if (assignments[i].id === assignmentId) {
                removed = assignments[i];
            } else {
                newAssignments.push(assignments[i]);
            }
        }

        if (!removed) return false;
        _setHouseholdAssignments(newAssignments);
        return true;
    }

    function getAssignmentsForPosition(positionId, activeOnly) {
        var assignments = _state.householdAssignments;
        var result = [];
        for (var i = 0; i < assignments.length; i++) {
            if (assignments[i].positionId === positionId) {
                if (activeOnly && assignments[i].endYear !== null) continue;
                result.push(assignments[i]);
            }
        }
        return result;
    }

    function getAssignmentsForCharacter(characterId, activeOnly) {
        var assignments = _state.householdAssignments;
        var result = [];
        for (var i = 0; i < assignments.length; i++) {
            if (assignments[i].characterId === characterId) {
                if (activeOnly && assignments[i].endYear !== null) continue;
                result.push(assignments[i]);
            }
        }
        return result;
    }

    function getAssignmentsForHousehold(householdId, activeOnly) {
        var assignments = _state.householdAssignments;
        var result = [];
        for (var i = 0; i < assignments.length; i++) {
            if (assignments[i].householdId === householdId) {
                if (activeOnly && assignments[i].endYear !== null) continue;
                result.push(assignments[i]);
            }
        }
        return result;
    }

    // =========================================================================
    // 14. PUBLIC API - HOUSEHOLD UPDATE (NEW)
    // =========================================================================

    /**
     * Updates a household with the given updates
     * @param {string} householdId - Household ID
     * @param {Object} updates - Updates to apply
     * @param {Object} options - Options
     * @param {boolean} options.recordHistory - Whether to record in history (default: true)
     * @returns {Object|null} - Updated household or null
     */
    function updateHousehold(householdId, updates, options) {
        options = options || {};
        var household = getHousehold(householdId);
        if (!household) return null;

        // Apply updates
        var allowedFields = ['name', 'locationId', 'locationName', 'wealth', 'reputation', 'debt', 'powerScore', 'status', 'notes', 'members', 'departments', 'enterprises', 'enterpriseHistory', 'residenceId', 'residenceName', 'residenceType', 'associatedYear', 'residenceUnitNumber', 'residenceNotes', 'residenceHistory', 'eventLog', 'nameHistory', 'currentNameSince', 'economy', 'resources', 'criminalCount', 'victimCount', 'executedCount', 'criminalMembers', 'victimMembers', 'crimeHistory', 'vendettaCount', 'activeVendettaCount', 'vendettas', 'alliances', 'vacancyHistory', 'isVacant', 'isDemolished', 'vacantYear', 'vacantReason', 'destroyedAt', 'destroyedBy', 'demolishedReason', 'demolishedAt', 'demolishedRecord', 'damageHistory', 'foundedYear', 'createdAt', 'updatedAt'];

        for (var i = 0; i < allowedFields.length; i++) {
            var key = allowedFields[i];
            if (updates[key] !== undefined) {
                household[key] = updates[key];
            }
        }

        household.updatedAt = Date.now();

        // Save using _setHouseholds
        var households = _state.households;
        var index = -1;
        for (var i = 0; i < households.length; i++) {
            if (households[i].id === householdId) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            households[index] = household;
            _setHouseholds(households);
        }

        return household;
    }

    // =========================================================================
    // 15. PUBLIC API - WEALTH MANAGEMENT (NEW)
    // =========================================================================

    function getHouseholdWealth(householdId) {
        var household = getHousehold(householdId);
        return household ? (household.wealth || 0) : 0;
    }

    function updateHouseholdWealth(householdId, delta, reason) {
        var household = getHousehold(householdId);
        if (!household) return null;

        var oldWealth = household.wealth || 0;
        household.wealth = Math.max(0, oldWealth + delta);

        if (!household.economy) household.economy = {};
        if (!household.economy.transactions) household.economy.transactions = [];
        household.economy.transactions.push({
            year: _getCurrentYear(),
            type: 'wealth_change',
            amount: delta,
            reason: reason || 'Wealth adjustment',
            oldWealth: oldWealth,
            newWealth: household.wealth
        });

        if (household.economy.transactions.length > 100) {
            household.economy.transactions = household.economy.transactions.slice(-100);
        }

        var households = _state.households;
        var index = -1;
        for (var i = 0; i < households.length; i++) {
            if (households[i].id === householdId) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            households[index] = household;
            _setHouseholds(households);
        }

        return household.wealth;
    }

    // =========================================================================
    // 16. REFRESH
    // =========================================================================

    function refresh() {
        _loadData();
    }

    // =========================================================================
    // 17. EXPORTS
    // =========================================================================

    var HouseholdState = {
        // Data Access
        getState: getState,
        getHousehold: getHousehold,
        getAllHouseholds: getAllHouseholds,
        getCharacterHousehold: getCharacterHousehold,
        getHouseholdsByLocation: getHouseholdsByLocation,
        getHouseholdsByStatus: getHouseholdsByStatus,
        getHouseholdMembersWithCharacters: getHouseholdMembersWithCharacters,
        getHouseholdHead: getHouseholdHead,
        getHouseholdStatus: getHouseholdStatus,

        // Name Period Management
        getHouseholdNamePeriods: getHouseholdNamePeriods,
        getHouseholdNamePeriodForYear: getHouseholdNamePeriodForYear,
        editHouseholdNamePeriod: editHouseholdNamePeriod,
        deleteHouseholdNamePeriod: deleteHouseholdNamePeriod,

        // Residence Association
        associateHouseholdWithResidence: associateHouseholdWithResidence,
        disassociateHouseholdFromResidence: disassociateHouseholdFromResidence,
        getHouseholdResidence: getHouseholdResidence,
        getHouseholdsByResidence: getHouseholdsByResidence,

        // Enterprise Integration
        getHouseholdEnterprises: getHouseholdEnterprises,
        getHouseholdEnterpriseHistory: getHouseholdEnterpriseHistory,
        getHouseholdEnterprisesWithData: getHouseholdEnterprisesWithData,
        addEnterpriseToHousehold: addEnterpriseToHousehold,
        removeEnterpriseFromHousehold: removeEnterpriseFromHousehold,
        transferEnterprisesToHousehold: transferEnterprisesToHousehold,
        trackEnterpriseProfit: trackEnterpriseProfit,
        getHouseholdEnterpriseProfitHistory: getHouseholdEnterpriseProfitHistory,
        getHouseholdEnterpriseValue: getHouseholdEnterpriseValue,

        // Position Functions
        createHouseholdPosition: createHouseholdPosition,
        updateHouseholdPosition: updateHouseholdPosition,
        deleteHouseholdPosition: deleteHouseholdPosition,
        getHouseholdPosition: getHouseholdPosition,
        getHouseholdPositions: getHouseholdPositions,

        // Assignment Functions
        assignCharacterToHouseholdPosition: assignCharacterToHouseholdPosition,
        endHouseholdAssignment: endHouseholdAssignment,
        deleteHouseholdAssignment: deleteHouseholdAssignment,
        getAssignmentsForPosition: getAssignmentsForPosition,
        getAssignmentsForCharacter: getAssignmentsForCharacter,
        getAssignmentsForHousehold: getAssignmentsForHousehold,

        // Household Update (NEW)
        updateHousehold: updateHousehold,

        // Wealth Management (NEW)
        getHouseholdWealth: getHouseholdWealth,
        updateHouseholdWealth: updateHouseholdWealth,

        // UI State
        getUIState: getUIState,
        setUIState: setUIState,
        updateUIState: updateUIState,

        // Cache
        invalidateCache: invalidateCache,
        refresh: refresh,

        // Subscriptions
        subscribe: subscribe,

        // Internal (for use by commands)
        _setHouseholds: _setHouseholds,
        _setHouseholdPositions: _setHouseholdPositions,
        _setHouseholdAssignments: _setHouseholdAssignments,
        _getState: function() { return _state; },

        // Helper
        isProcessing: function() {
            return _state._processingState;
        }
    };

    // =========================================================================
    // 18. AUTO-LOAD
    // =========================================================================

    _loadData();

    // Listen for master data updates
    if (typeof window !== 'undefined') {
        window.addEventListener('masterDataUpdated', function() {
            _loadData();
        });
    }

    // =========================================================================
    // 19. EXPORTS GLOBAL
    // =========================================================================

    window.HouseholdState = HouseholdState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = HouseholdState;
    }

})();