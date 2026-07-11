/**
 * =============================================================================
 * HOUSEHOLD STATE (household-state.js)
 * =============================================================================
 * 
 * PURPOSE: Single source of truth for all household data and UI state.
 *          Manages data access, caching, and state change notifications.
 * 
 * UPDATED: Removed vendetta data - vendettas now in vendetta-system.js
 * 
 * DEPENDENCIES:
 *   - accessors.js (for getCharacters, getPlaceById, getCurrentYear)
 *   - storage.js (for saveMasterData)
 * 
 * EXPORTS:
 *   - HouseholdState.getState()          - Get current state snapshot
 *   - HouseholdState.getHousehold()      - Get single household
 *   - HouseholdState.getAllHouseholds()  - Get all households
 *   - HouseholdState.getCharacterHousehold() - Get character's household
 *   - HouseholdState.setHouseholds()     - Update all households (internal)
 *   - HouseholdState.addHousehold()      - Add new household
 *   - HouseholdState.updateHousehold()   - Update household
 *   - HouseholdState.deleteHousehold()   - Delete household
 *   - HouseholdState.subscribe()         - Subscribe to state changes
 *   - HouseholdState.unsubscribe()       - Unsubscribe from state changes
 *   - HouseholdState.getUIState()        - Get UI state (filters, selection)
 *   - HouseholdState.setUIState()        - Update UI state
 *   - HouseholdState.invalidateCache()   - Invalidate all caches
 *   - HouseholdState.refresh()           - Force refresh from masterData
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARDS
    // =========================================================================

    var _loading = false;
    var _saving = false;
    var _invalidating = false;
    var _processingUpdate = false;

    // =========================================================================
    // 1. STATE
    // =========================================================================

    /**
     * The internal state object.
     * @private
     */
    var _state = {
        // Data
        households: [],
        characters: [],
        places: [],
        
        // UI State
        ui: {
            selectedHouseholdId: null,
            selectedCharacterId: null,
            filters: {
                searchTerm: '',
                statusFilter: 'all',
                locationFilter: 'all'
            },
            viewMode: 'list', // 'list', 'details', 'edit', 'create'
            expandedHouseholds: {}
        },
        
        // Caches
        cache: {
            householdMap: null,
            characterHouseholdMap: null,
            lastUpdated: 0
        },
        
        // Subscribers
        subscribers: [],
        
        // Version (for change detection)
        version: 0
    };

    /**
     * Pending updates queue (for batching)
     * @private
     */
    var _pendingUpdates = [];

    /**
     * Update timeout handle
     * @private
     */
    var _updateTimeout = null;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return window.masterData?.data?.characters || [];
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return window.masterData?.data?.places || [];
    }

    function _getHouseholdsFromMaster() {
        if (typeof window.getAllHouseholds === 'function') {
            return window.getAllHouseholds();
        }
        return window.masterData?.data?.households || [];
    }

    function _getMasterData() {
        return window.masterData?.data || {};
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    // =========================================================================
    // 3. CACHE MANAGEMENT
    // =========================================================================

    /**
     * Builds a map for efficient ID-based lookups
     * @private
     */
    function _buildIdMap(items) {
        var map = new Map();
        for (var i = 0; i < items.length; i++) {
            if (items[i] && items[i].id) {
                map.set(items[i].id, items[i]);
            }
        }
        return map;
    }

    /**
     * Builds a map of character -> household
     * @private
     */
    function _buildCharacterHouseholdMap(households) {
        var map = new Map();
        for (var i = 0; i < households.length; i++) {
            var h = households[i];
            if (h.members) {
                for (var j = 0; j < h.members.length; j++) {
                    if (h.members[j].characterId) {
                        map.set(h.members[j].characterId, h);
                    }
                }
            }
        }
        return map;
    }

    /**
     * Rebuilds all caches
     * @private
     */
    function _rebuildCaches() {
        var households = _state.households;
        
        _state.cache.householdMap = _buildIdMap(households);
        _state.cache.characterHouseholdMap = _buildCharacterHouseholdMap(households);
        _state.cache.lastUpdated = Date.now();
        
        // Update version
        _state.version++;
    }

    /**
     * Invalidates all caches (marks for rebuild)
     * @private
     */
    function _invalidateCaches() {
        if (_invalidating) return;
        _invalidating = true;
        
        try {
            _state.cache.householdMap = null;
            _state.cache.characterHouseholdMap = null;
            _state.cache.lastUpdated = 0;
            _state.version++;
        } finally {
            _invalidating = false;
        }
    }

    // =========================================================================
    // 4. ENSURING CACHES ARE UP TO DATE
    // =========================================================================

    /**
     * Ensures caches are built
     * @private
     */
    function _ensureCaches() {
        if (!_state.cache.householdMap) {
            _rebuildCaches();
        }
    }

    // =========================================================================
    // 5. NOTIFICATION SYSTEM
    // =========================================================================

    /**
     * Notifies all subscribers of a state change
     * @private
     */
    function _notifySubscribers(event, data) {
        var subscribers = _state.subscribers.slice();
        var eventObj = {
            type: event,
            data: data,
            version: _state.version,
            timestamp: Date.now()
        };
        
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i](eventObj);
            } catch (e) {
                // Silent fail for subscriber errors
            }
        }
    }

    /**
     * Processes pending updates in batch
     * @private
     */
    function _processPendingUpdates() {
        if (_updateTimeout) {
            clearTimeout(_updateTimeout);
            _updateTimeout = null;
        }
        
        if (_pendingUpdates.length === 0) return;
        
        var updates = _pendingUpdates.slice();
        _pendingUpdates = [];
        
        // Apply all updates
        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];
            switch (update.type) {
                case 'add':
                    _state.households.push(update.data);
                    break;
                case 'update':
                    var index = _state.households.findIndex(function(h) { return h.id === update.data.id; });
                    if (index !== -1) {
                        _state.households[index] = update.data;
                    }
                    break;
                case 'delete':
                    var idx = _state.households.findIndex(function(h) { return h.id === update.data; });
                    if (idx !== -1) {
                        _state.households.splice(idx, 1);
                    }
                    break;
                case 'replace':
                    _state.households = update.data;
                    break;
            }
        }
        
        // Rebuild caches
        _rebuildCaches();
        
        // Update version
        _state.version++;
        
        // Save to masterData
        _saveToMaster();
        
        // Notify subscribers
        _notifySubscribers('change', {
            updates: updates,
            householdCount: _state.households.length
        });
        
        // Invalidate accessor caches
        _invalidateAccessorCaches();
    }

    /**
     * Queues an update for batch processing
     * @private
     */
    function _queueUpdate(type, data) {
        _pendingUpdates.push({ type: type, data: data });
        
        if (_updateTimeout) {
            clearTimeout(_updateTimeout);
        }
        _updateTimeout = setTimeout(_processPendingUpdates, 10);
    }

    /**
     * Saves current state to masterData
     * @private
     */
    function _saveToMaster() {
        if (_saving) return;
        _saving = true;
        
        try {
            if (window.masterData && window.masterData.data) {
                window.masterData.data.households = _state.households.slice();
                _saveMasterData();
            }
        } finally {
            _saving = false;
        }
    }

    // =========================================================================
    // 6. INITIALIZATION - UPDATED: Removed vendettas
    // =========================================================================

    /**
     * Initializes the state from masterData
     * @private
     */
    function _initialize() {
        if (_loading) return;
        _loading = true;
        
        try {
            // Load from masterData
            var households = _getHouseholdsFromMaster();
            var characters = _getCharacters();
            var places = _getPlaces();
            
            // Initialize each household
            for (var i = 0; i < households.length; i++) {
                _ensureHouseholdInitialized(households[i]);
            }
            
            _state.households = households.slice();
            _state.characters = characters.slice();
            _state.places = places.slice();
            
            // Rebuild caches
            _rebuildCaches();
            
            // Update version
            _state.version++;
        } finally {
            _loading = false;
        }
    }

    /**
     * Ensures a household object has all required fields
     * UPDATED: Removed vendettas and alliances
     * @private
     */
    function _ensureHouseholdInitialized(household) {
        if (!household) return;
        
        if (!household.members) household.members = [];
        if (!household.departments) household.departments = [];
        if (!household.nameHistory) household.nameHistory = [];
        if (!household.activityLog) household.activityLog = [];
        // REMOVED: vendettas and alliances - now in vendetta-system.js
        
        if (household.reputation === undefined) household.reputation = 50;
        if (household.wealth === undefined) household.wealth = 0;
        if (household.powerScore === undefined) household.powerScore = 0;
        if (household.foundedYear === undefined) household.foundedYear = _getCurrentYear();
        if (household.status === undefined) household.status = 'active';
        if (household.currentNameSince === undefined) household.currentNameSince = household.foundedYear;
        
        // Ensure current name is in history
        var hasCurrentName = household.nameHistory.some(function(h) {
            return h.newName === household.name && h.isCurrent !== false;
        });
        if (!hasCurrentName && household.name) {
            household.nameHistory.push({
                oldName: null,
                newName: household.name,
                year: household.currentNameSince || household.foundedYear || _getCurrentYear(),
                isCurrent: true,
                reason: 'Household founded'
            });
        }
        
        // Ensure only one current name in history
        var currentCount = 0;
        for (var i = 0; i < household.nameHistory.length; i++) {
            if (household.nameHistory[i].isCurrent) {
                currentCount++;
                if (currentCount > 1) {
                    household.nameHistory[i].isCurrent = false;
                }
            }
        }
        
        // Ensure at least one name in history
        if (household.nameHistory.length === 0 && household.name) {
            household.nameHistory.push({
                oldName: null,
                newName: household.name,
                year: household.foundedYear || _getCurrentYear(),
                isCurrent: true,
                reason: 'Household founded'
            });
        }
    }

    // =========================================================================
    // 7. PUBLIC API - DATA ACCESS
    // =========================================================================

    /**
     * Gets a snapshot of the current state
     * @param {Object} options - Options
     * @param {boolean} options.includeUI - Include UI state (default: false)
     * @returns {Object} State snapshot
     */
    function getState(options) {
        options = options || {};
        var includeUI = options.includeUI !== undefined ? options.includeUI : false;
        
        var snapshot = {
            households: _state.households.slice(),
            version: _state.version,
            timestamp: Date.now()
        };
        
        if (includeUI) {
            snapshot.ui = {
                selectedHouseholdId: _state.ui.selectedHouseholdId,
                selectedCharacterId: _state.ui.selectedCharacterId,
                filters: { ..._state.ui.filters },
                viewMode: _state.ui.viewMode,
                expandedHouseholds: { ..._state.ui.expandedHouseholds }
            };
        }
        
        return snapshot;
    }

    /**
     * Gets a single household by ID
     * @param {string} householdId - Household ID
     * @returns {Object|null} Household or null
     */
    function getHousehold(householdId) {
        if (!householdId) return null;
        _ensureCaches();
        return _state.cache.householdMap.get(householdId) || null;
    }

    /**
     * Gets all households
     * @param {Object} options - Options
     * @param {boolean} options.includeDeprecated - Include deprecated households (default: false)
     * @returns {Array} Array of households
     */
    function getAllHouseholds(options) {
        options = options || {};
        var includeDeprecated = options.includeDeprecated || false;
        
        if (includeDeprecated) {
            return _state.households.slice();
        }
        
        return _state.households.filter(function(h) {
            return h.status !== 'deprecated';
        });
    }

    /**
     * Gets the household a character belongs to
     * @param {string} characterId - Character ID
     * @returns {Object|null} Household or null
     */
    function getCharacterHousehold(characterId) {
        if (!characterId) return null;
        _ensureCaches();
        return _state.cache.characterHouseholdMap.get(characterId) || null;
    }

    /**
     * Gets households by location
     * @param {string} locationId - Location ID
     * @param {Object} options - Options
     * @returns {Array} Array of households
     */
    function getHouseholdsByLocation(locationId, options) {
        options = options || {};
        var includeDeprecated = options.includeDeprecated || false;
        
        var households = getAllHouseholds({ includeDeprecated: includeDeprecated });
        return households.filter(function(h) {
            return h.locationId === locationId;
        });
    }

    /**
     * Gets households by status
     * @param {string} status - Status ('active', 'vacant', 'abandoned', 'declining', 'deprecated')
     * @param {Object} options - Options
     * @returns {Array} Array of households
     */
    function getHouseholdsByStatus(status, options) {
        options = options || {};
        var includeDeprecated = options.includeDeprecated || false;
        
        var households = getAllHouseholds({ includeDeprecated: includeDeprecated });
        return households.filter(function(h) {
            return h.status === status;
        });
    }

    /**
     * Gets household members with full character data
     * @param {string} householdId - Household ID
     * @returns {Array} Array of members with character data
     */
    function getHouseholdMembersWithCharacters(householdId) {
        var household = getHousehold(householdId);
        if (!household || !household.members) return [];
        
        var characters = _state.characters;
        var charMap = {};
        for (var i = 0; i < characters.length; i++) {
            charMap[characters[i].id] = characters[i];
        }
        
        var result = [];
        for (var i = 0; i < household.members.length; i++) {
            var member = household.members[i];
            var character = charMap[member.characterId];
            if (character) {
                result.push({
                    characterId: member.characterId,
                    character: character,
                    characterName: (character.name || '') + (character.surname ? ' ' + character.surname : ''),
                    type: member.type,
                    departmentId: member.departmentId,
                    role: member.role,
                    isHead: member.isHead,
                    joinedYear: member.joinedYear,
                    notes: member.notes,
                    headSince: member.headSince
                });
            }
        }
        return result;
    }

    /**
     * Gets household head
     * @param {string} householdId - Household ID
     * @returns {Object|null} Character or null
     */
    function getHouseholdHead(householdId) {
        var household = getHousehold(householdId);
        if (!household || !household.members) return null;
        
        var characters = _state.characters;
        var charMap = {};
        for (var i = 0; i < characters.length; i++) {
            charMap[characters[i].id] = characters[i];
        }
        
        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i].isHead) {
                var char = charMap[household.members[i].characterId];
                if (char) return char;
            }
        }
        
        // Fallback: return oldest living member
        var livingMembers = [];
        for (var i = 0; i < household.members.length; i++) {
            var char = charMap[household.members[i].characterId];
            if (char && !char.isDeceased) {
                livingMembers.push(char);
            }
        }
        
        if (livingMembers.length === 0) return null;
        
        livingMembers.sort(function(a, b) {
            var ageA = a.birthYear ? _getCurrentYear() - a.birthYear : 0;
            var ageB = b.birthYear ? _getCurrentYear() - b.birthYear : 0;
            return ageB - ageA;
        });
        
        return livingMembers[0];
    }

    /**
     * Gets the status of a household
     * @param {string} householdId - Household ID
     * @returns {Object} Status object
     */
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
                status: 'nonexistent',
                statusIcon: '✗',
                statusMessage: 'Household does not exist'
            };
        }
        
        var livingCount = 0;
        var deceasedCount = 0;
        var characters = _state.characters;
        var charMap = {};
        for (var i = 0; i < characters.length; i++) {
            charMap[characters[i].id] = characters[i];
        }
        
        if (household.members) {
            for (var i = 0; i < household.members.length; i++) {
                var char = charMap[household.members[i].characterId];
                if (char) {
                    if (char.isDeceased) {
                        deceasedCount++;
                    } else {
                        livingCount++;
                    }
                } else {
                    deceasedCount++;
                }
            }
        }
        
        var totalMembers = household.members ? household.members.length : 0;
        var isEmpty = livingCount === 0;
        var isVacant = totalMembers === 0;
        
        var status = 'active';
        var statusIcon = '';
        var statusMessage = 'Occupied and active';
        var statusColor = '#4a9e6a';
        
        if (isVacant) {
            status = 'vacant';
            statusIcon = '⌇';
            statusMessage = 'Vacant - no members';
            statusColor = '#8a8a8a';
        } else if (isEmpty && totalMembers > 0) {
            status = 'abandoned';
            statusIcon = '✗';
            statusMessage = 'Abandoned - only deceased remain';
            statusColor = '#c87040';
        } else if (livingCount < totalMembers / 2) {
            status = 'declining';
            statusIcon = '⚠';
            statusMessage = 'Declining - few living members';
            statusColor = '#c8a844';
        }
        
        // Override with stored status if different
        if (household.status && household.status !== 'active') {
            status = household.status;
            if (status === 'abandoned') {
                statusIcon = '✗';
                statusMessage = 'Marked as abandoned';
                statusColor = '#c87040';
            } else if (status === 'vacant') {
                statusIcon = '⌇';
                statusMessage = 'Marked as vacant';
                statusColor = '#8a8a8a';
            } else if (status === 'deprecated') {
                statusIcon = '⌇';
                statusMessage = 'Deprecated';
                statusColor = '#6a6a6a';
            }
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
            householdName: household.name
        };
    }

    // =========================================================================
    // 8. PUBLIC API - UI STATE
    // =========================================================================

    /**
     * Gets the current UI state
     * @returns {Object} UI state
     */
    function getUIState() {
        return {
            selectedHouseholdId: _state.ui.selectedHouseholdId,
            selectedCharacterId: _state.ui.selectedCharacterId,
            filters: { ..._state.ui.filters },
            viewMode: _state.ui.viewMode,
            expandedHouseholds: { ..._state.ui.expandedHouseholds }
        };
    }

    /**
     * Sets a UI state value
     * @param {string} key - State key
     * @param {*} value - New value
     * @param {Object} options - Options
     * @param {boolean} options.notify - Notify subscribers (default: true)
     */
    function setUIState(key, value, options) {
        options = options || {};
        var notify = options.notify !== false;
        
        var oldValue = _state.ui[key];
        if (oldValue === value) return;
        
        _state.ui[key] = value;
        
        if (notify) {
            _notifySubscribers('uiChange', {
                key: key,
                value: value,
                oldValue: oldValue
            });
        }
    }

    /**
     * Updates multiple UI state values at once
     * @param {Object} updates - Updates object
     * @param {Object} options - Options
     * @param {boolean} options.notify - Notify subscribers (default: true)
     */
    function updateUIState(updates, options) {
        options = options || {};
        var notify = options.notify !== false;
        
        var changed = false;
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                var oldValue = _state.ui[key];
                if (oldValue !== updates[key]) {
                    _state.ui[key] = updates[key];
                    changed = true;
                }
            }
        }
        
        if (changed && notify) {
            _notifySubscribers('uiChange', {
                updates: updates,
                type: 'batch'
            });
        }
    }

    // =========================================================================
    // 9. PUBLIC API - HOUSEHOLD CRUD
    // =========================================================================

    /**
     * Creates a new household
     * UPDATED: Removed vendettas and alliances from initialization
     * @param {string} name - Household name
     * @param {string} locationId - Location ID (optional)
     * @param {Object} options - Options
     * @param {number} options.foundedYear - Founded year (defaults to current)
     * @param {number} options.reputation - Initial reputation (default: 50)
     * @param {number} options.wealth - Initial wealth (default: 0)
     * @param {string} options.notes - Notes
     * @param {string} options.founderId - Founder character ID
     * @param {Array} options.initialMembers - Array of member objects
     * @param {boolean} options.isHistorical - Is this a historical household
     * @returns {Object} Created household or null
     */
    function createHousehold(name, locationId, options) {
        options = options || {};
        
        // Validate
        if (!name || name.trim() === '') {
            return null;
        }
        
        var currentYear = _getCurrentYear();
        var trimmedName = name.trim();
        
        // Check for duplicate name
        var existing = _state.households.some(function(h) {
            return h.name && h.name.toLowerCase() === trimmedName.toLowerCase();
        });
        if (existing) {
            return null;
        }
        
        var newHousehold = {
            id: _generateId('house'),
            name: trimmedName,
            locationId: locationId || null,
            locationName: null,
            departments: [],
            members: [],
            reputation: options.reputation !== undefined ? options.reputation : 50,
            wealth: options.wealth !== undefined ? options.wealth : 0,
            powerScore: 0,
            foundedYear: options.foundedYear !== undefined ? options.foundedYear : currentYear,
            // REMOVED: vendettas and alliances
            status: 'active',
            nameHistory: [],
            currentNameSince: options.foundedYear !== undefined ? options.foundedYear : currentYear,
            activityLog: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            notes: options.notes || '',
            previousName: null,
            isHistorical: options.isHistorical || false
        };
        
        // Initialize with name history
        newHousehold.nameHistory.push({
            oldName: null,
            newName: trimmedName,
            year: newHousehold.foundedYear,
            isCurrent: true,
            reason: 'Household founded',
            changedBy: options.founderId || null
        });
        
        // Add founder if provided
        if (options.founderId) {
            var founder = _state.characters.find(function(c) { return c.id === options.founderId; });
            if (founder) {
                newHousehold.members.push({
                    characterId: founder.id,
                    characterName: (founder.name || '') + (founder.surname ? ' ' + founder.surname : ''),
                    type: 'family',
                    role: 'Head of Household',
                    isHead: true,
                    joinedYear: newHousehold.foundedYear,
                    headSince: newHousehold.foundedYear,
                    notes: 'Founder and head of household'
                });
            }
        }
        
        // Add initial members
        if (options.initialMembers && Array.isArray(options.initialMembers)) {
            for (var i = 0; i < options.initialMembers.length; i++) {
                var member = options.initialMembers[i];
                if (member.characterId) {
                    var char = _state.characters.find(function(c) { return c.id === member.characterId; });
                    if (char) {
                        newHousehold.members.push({
                            characterId: member.characterId,
                            characterName: (char.name || '') + (char.surname ? ' ' + char.surname : ''),
                            type: member.type || 'family',
                            role: member.role || 'Family Member',
                            isHead: member.isHead || false,
                            joinedYear: member.joinedYear || newHousehold.foundedYear,
                            headSince: member.isHead ? (member.joinedYear || newHousehold.foundedYear) : null,
                            notes: member.notes || ''
                        });
                    }
                }
            }
        }
        
        // Set location name
        if (locationId) {
            var place = _state.places.find(function(p) { return p.id === locationId; });
            if (place) {
                newHousehold.locationName = place.displayName;
            }
        }
        
        // Queue the update
        _queueUpdate('add', newHousehold);
        
        return newHousehold;
    }

    /**
     * Updates an existing household
     * @param {string} householdId - Household ID
     * @param {Object} updates - Updates to apply
     * @param {Object} options - Options
     * @param {boolean} options.recordHistory - Record name changes in history (default: true)
     * @param {number} options.changeYear - Year of change (default: current)
     * @param {string} options.changeReason - Reason for change
     * @param {string} options.changedBy - Who made the change
     * @returns {Object|null} Updated household or null
     */
    function updateHousehold(householdId, updates, options) {
        options = options || {};
        
        var household = getHousehold(householdId);
        if (!household) return null;
        
        var recordHistory = options.recordHistory !== false;
        var changeYear = options.changeYear || _getCurrentYear();
        var changeReason = options.changeReason || 'Edited';
        var changedBy = options.changedBy || null;
        
        // Create a copy to avoid mutating cached version
        var updated = { ...household };
        var changed = false;
        var nameChanged = false;
        var oldName = household.name;
        
        // Apply updates
        var allowedFields = ['name', 'locationId', 'notes', 'status', 'foundedYear'];
        for (var i = 0; i < allowedFields.length; i++) {
            var field = allowedFields[i];
            if (updates[field] !== undefined && updates[field] !== null) {
                if (field === 'name') {
                    var trimmedName = updates[field].trim();
                    if (trimmedName && trimmedName !== household.name) {
                        updated.name = trimmedName;
                        nameChanged = true;
                        changed = true;
                    }
                } else if (field === 'locationId') {
                    updated.locationId = updates[field];
                    var place = _state.places.find(function(p) { return p.id === updates[field]; });
                    updated.locationName = place ? place.displayName : null;
                    changed = true;
                } else {
                    updated[field] = updates[field];
                    changed = true;
                }
            }
        }
        
        // Handle name history
        if (nameChanged && recordHistory) {
            if (!updated.nameHistory) {
                updated.nameHistory = [];
            }
            
            // Mark previous current as not current
            for (var i = 0; i < updated.nameHistory.length; i++) {
                if (updated.nameHistory[i].isCurrent) {
                    updated.nameHistory[i].isCurrent = false;
                }
            }
            
            updated.nameHistory.push({
                oldName: oldName,
                newName: updated.name,
                year: changeYear,
                isCurrent: true,
                reason: changeReason,
                changedBy: changedBy,
                timestamp: Date.now()
            });
            
            updated.currentNameSince = changeYear;
            updated.previousName = oldName;
        } else if (nameChanged && !recordHistory) {
            // Name change without history
            updated.previousName = oldName;
        }
        
        updated.updatedAt = Date.now();
        
        if (changed) {
            _queueUpdate('update', updated);
        }
        
        return updated;
    }

    /**
     * Deletes a household
     * @param {string} householdId - Household ID
     * @param {Object} options - Options
     * @param {boolean} options.force - Force deletion even if not empty (default: false)
     * @param {string} options.reason - Reason for deletion
     * @returns {boolean} True if deleted
     */
    function deleteHousehold(householdId, options) {
        options = options || {};
        var force = options.force || false;
        
        var household = getHousehold(householdId);
        if (!household) return false;
        
        // Check if household has members
        if (!force && household.members && household.members.length > 0) {
            return false;
        }
        
        // Remove from state
        _queueUpdate('delete', householdId);
        
        return true;
    }

    /**
     * Refreshes the state from masterData
     */
    function refresh() {
        _initialize();
        _rebuildCaches();
        _notifySubscribers('refresh', {
            householdCount: _state.households.length
        });
    }

    /**
     * Invalidates all caches
     */
    function invalidateCache() {
        _invalidateCaches();
        _notifySubscribers('cacheInvalidated', {
            timestamp: Date.now()
        });
    }

    // =========================================================================
    // 10. PUBLIC API - SUBSCRIPTIONS
    // =========================================================================

    /**
     * Subscribes to state changes
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        
        _state.subscribers.push(callback);
        
        // Return unsubscribe function
        return function unsubscribe() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    /**
     * Unsubscribes a callback
     * @param {Function} callback - Callback to remove
     * @returns {boolean} True if removed
     */
    function unsubscribe(callback) {
        var index = _state.subscribers.indexOf(callback);
        if (index === -1) return false;
        _state.subscribers.splice(index, 1);
        return true;
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    // Initialize on load
    _initialize();

    // Expose public API
    window.HouseholdState = {
        // Data access
        getState: getState,
        getHousehold: getHousehold,
        getAllHouseholds: getAllHouseholds,
        getCharacterHousehold: getCharacterHousehold,
        getHouseholdsByLocation: getHouseholdsByLocation,
        getHouseholdsByStatus: getHouseholdsByStatus,
        getHouseholdMembersWithCharacters: getHouseholdMembersWithCharacters,
        getHouseholdHead: getHouseholdHead,
        getHouseholdStatus: getHouseholdStatus,
        
        // UI State
        getUIState: getUIState,
        setUIState: setUIState,
        updateUIState: updateUIState,
        
        // CRUD
        createHousehold: createHousehold,
        updateHousehold: updateHousehold,
        deleteHousehold: deleteHousehold,
        
        // Maintenance
        refresh: refresh,
        invalidateCache: invalidateCache,
        
        // Subscriptions
        subscribe: subscribe,
        unsubscribe: unsubscribe
    };

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            getState: getState,
            getHousehold: getHousehold,
            getAllHouseholds: getAllHouseholds,
            getCharacterHousehold: getCharacterHousehold,
            getHouseholdsByLocation: getHouseholdsByLocation,
            getHouseholdsByStatus: getHouseholdsByStatus,
            getHouseholdMembersWithCharacters: getHouseholdMembersWithCharacters,
            getHouseholdHead: getHouseholdHead,
            getHouseholdStatus: getHouseholdStatus,
            getUIState: getUIState,
            setUIState: setUIState,
            updateUIState: updateUIState,
            createHousehold: createHousehold,
            updateHousehold: updateHousehold,
            deleteHousehold: deleteHousehold,
            refresh: refresh,
            invalidateCache: invalidateCache,
            subscribe: subscribe,
            unsubscribe: unsubscribe
        };
    }

})();