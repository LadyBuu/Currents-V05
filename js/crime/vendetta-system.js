/**
 * =============================================================================
 * VENDETTA SYSTEM (vendetta-system.js)
 * =============================================================================
 * 
 * PURPOSE: Standalone vendetta and blood feud management system.
 *          Separate from households and crime, but integrates with both.
 * 
 * DEPENDENCIES:
 *   - accessors.js (getCharacterById, getCharacters, getCurrentYear)
 *   - household-state.js (HouseholdState) - for household name lookups
 *   - eventLogger.js (logEvent)
 * 
 * EXPORTS:
 *   - VENDETTA_STATUS - Status constants
 *   - createVendetta()
 *   - getVendettaById()
 *   - getAllVendettas()
 *   - getVendettasByHousehold()
 *   - getVendettasByCharacter()
 *   - getActiveVendettas()
 *   - recordVendettaDeath()
 *   - resolveVendetta()
 *   - escalateVendetta()
 *   - createBloodFeud()
 *   - getVendettaStats()
 *   - clearVendettaCache()
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingVendetta = false;

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var VENDETTA_STATUS = {
        ACTIVE: 'active',
        ESCALATED: 'escalated',
        RESOLVED: 'resolved'
    };

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
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
        return window.masterData?.data?.characters || [];
    }

    function _getHousehold(householdId) {
        if (window.HouseholdState && typeof window.HouseholdState.getHousehold === 'function') {
            return window.HouseholdState.getHousehold(householdId);
        }
        return null;
    }

    function _getHouseholdName(householdId) {
        var household = _getHousehold(householdId);
        return household ? household.name : 'Unknown Household';
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    // =========================================================================
    // 3. STORAGE
    // =========================================================================

    var _vendettaStorage = {
        byId: new Map(),
        byHousehold: new Map(),
        byCharacter: new Map(),
        all: []
    };

    var _cacheInitialized = false;

    function _initializeCache() {
        if (_cacheInitialized) return;

        // Try to load from masterData
        if (typeof window.masterData !== 'undefined' && 
            window.masterData.data && 
            window.masterData.data.vendettas) {
            
            var saved = window.masterData.data.vendettas;
            if (Array.isArray(saved)) {
                for (var i = 0; i < saved.length; i++) {
                    _addToCache(saved[i]);
                }
            }
        }

        _cacheInitialized = true;
    }

    function _addToCache(vendetta) {
        _vendettaStorage.byId.set(vendetta.id, vendetta);
        _vendettaStorage.all.push(vendetta);

        // Index by household
        if (vendetta.householdAId) {
            if (!_vendettaStorage.byHousehold.has(vendetta.householdAId)) {
                _vendettaStorage.byHousehold.set(vendetta.householdAId, new Set());
            }
            _vendettaStorage.byHousehold.get(vendetta.householdAId).add(vendetta.id);
        }
        if (vendetta.householdBId) {
            if (!_vendettaStorage.byHousehold.has(vendetta.householdBId)) {
                _vendettaStorage.byHousehold.set(vendetta.householdBId, new Set());
            }
            _vendettaStorage.byHousehold.get(vendetta.householdBId).add(vendetta.id);
        }

        // Index by character
        if (vendetta.characterAId) {
            if (!_vendettaStorage.byCharacter.has(vendetta.characterAId)) {
                _vendettaStorage.byCharacter.set(vendetta.characterAId, new Set());
            }
            _vendettaStorage.byCharacter.get(vendetta.characterAId).add(vendetta.id);
        }
        if (vendetta.characterBId) {
            if (!_vendettaStorage.byCharacter.has(vendetta.characterBId)) {
                _vendettaStorage.byCharacter.set(vendetta.characterBId, new Set());
            }
            _vendettaStorage.byCharacter.get(vendetta.characterBId).add(vendetta.id);
        }
    }

    function _saveToStorage() {
        var data = _vendettaStorage.all.slice();
        if (typeof window.masterData !== 'undefined' && window.masterData.data) {
            window.masterData.data.vendettas = data;
            _saveMasterData();
        }
    }

    function _clearCache() {
        _vendettaStorage.byId = new Map();
        _vendettaStorage.byHousehold = new Map();
        _vendettaStorage.byCharacter = new Map();
        _vendettaStorage.all = [];
        _cacheInitialized = false;
    }

    // =========================================================================
    // 4. CORE VENDETTA FUNCTIONS
    // =========================================================================

    /**
     * Creates a new vendetta
     * @param {Object} data - Vendetta data
     * @param {string} data.householdAId - First household ID
     * @param {string} data.householdBId - Second household ID
     * @param {string} data.characterAId - Character ID from household A (optional)
     * @param {string} data.characterBId - Character ID from household B (optional)
     * @param {string} data.cause - Reason for vendetta
     * @param {number} data.year - Year started (default: current)
     * @param {string} data.notes - Additional notes
     * @returns {Object|null} Created vendetta or null
     */
    function createVendetta(data) {
        if (_processingVendetta) {
            return null;
        }
        _processingVendetta = true;

        try {
            _initializeCache();

            var currentYear = _getCurrentYear();

            // Validate households
            var householdA = _getHousehold(data.householdAId);
            var householdB = _getHousehold(data.householdBId);

            if (!householdA || !householdB) {
                return null;
            }

            if (data.householdAId === data.householdBId) {
                return null;
            }

            // Check for existing active vendetta
            var existing = getActiveVendettas(data.householdAId);
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].householdAId === data.householdBId || 
                    existing[i].householdBId === data.householdBId) {
                    return null;
                }
            }

            var vendetta = {
                id: _generateId('vendetta'),
                householdAId: data.householdAId,
                householdAName: householdA.name,
                householdBId: data.householdBId,
                householdBName: householdB.name,
                characterAId: data.characterAId || null,
                characterAName: data.characterAId ? _getCharacterById(data.characterAId)?.name || null : null,
                characterBId: data.characterBId || null,
                characterBName: data.characterBId ? _getCharacterById(data.characterBId)?.name || null : null,
                cause: data.cause || 'Unknown cause',
                startedYear: data.year || currentYear,
                status: VENDETTA_STATUS.ACTIVE,
                bodyCount: 0,
                deaths: [],
                escalatedAt: null,
                resolvedAt: null,
                resolution: null,
                notes: data.notes || null,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            _addToCache(vendetta);
            _saveToStorage();

            _logEvent('vendetta', 'Vendetta Created',
                'Vendetta started between ' + householdA.name + ' and ' + householdB.name + ': ' + vendetta.cause,
                []);

            return vendetta;

        } finally {
            _processingVendetta = false;
        }
    }

    /**
     * Gets a vendetta by ID
     * @param {string} vendettaId - Vendetta ID
     * @returns {Object|null} Vendetta or null
     */
    function getVendettaById(vendettaId) {
        _initializeCache();
        return _vendettaStorage.byId.get(vendettaId) || null;
    }

    /**
     * Gets all vendettas
     * @param {Object} options - Options
     * @param {boolean} options.includeResolved - Include resolved vendettas (default: true)
     * @returns {Array} Array of vendetta objects
     */
    function getAllVendettas(options) {
        options = options || {};
        _initializeCache();

        if (options.includeResolved === false) {
            return _vendettaStorage.all.filter(function(v) {
                return v.status !== VENDETTA_STATUS.RESOLVED;
            });
        }

        return _vendettaStorage.all.slice();
    }

    /**
     * Gets vendettas involving a household
     * @param {string} householdId - Household ID
     * @param {Object} options - Options
     * @param {boolean} options.includeResolved - Include resolved vendettas (default: false)
     * @returns {Array} Array of vendetta objects
     */
    function getVendettasByHousehold(householdId, options) {
        options = options || {};
        _initializeCache();

        var vendettaIds = _vendettaStorage.byHousehold.get(householdId);
        if (!vendettaIds) return [];

        var result = [];
        for (var id of vendettaIds) {
            var v = _vendettaStorage.byId.get(id);
            if (v) {
                if (!options.includeResolved && v.status === VENDETTA_STATUS.RESOLVED) {
                    continue;
                }
                result.push(v);
            }
        }
        return result;
    }

    /**
     * Gets vendettas involving a character
     * @param {string} characterId - Character ID
     * @param {Object} options - Options
     * @param {boolean} options.includeResolved - Include resolved vendettas (default: false)
     * @returns {Array} Array of vendetta objects
     */
    function getVendettasByCharacter(characterId, options) {
        options = options || {};
        _initializeCache();

        var vendettaIds = _vendettaStorage.byCharacter.get(characterId);
        if (!vendettaIds) return [];

        var result = [];
        for (var id of vendettaIds) {
            var v = _vendettaStorage.byId.get(id);
            if (v) {
                if (!options.includeResolved && v.status === VENDETTA_STATUS.RESOLVED) {
                    continue;
                }
                result.push(v);
            }
        }
        return result;
    }

    /**
     * Gets active vendettas for a household
     * @param {string} householdId - Household ID
     * @returns {Array} Array of active vendetta objects
     */
    function getActiveVendettas(householdId) {
        return getVendettasByHousehold(householdId, { includeResolved: false });
    }

    /**
     * Records a death in a vendetta
     * @param {string} vendettaId - Vendetta ID
     * @param {Object} deathData - Death data
     * @param {string} deathData.victimId - Victim character ID
     * @param {string} deathData.killerId - Killer character ID
     * @param {number} deathData.year - Year of death (default: current)
     * @param {string} deathData.reason - Reason/context (optional)
     * @returns {Object|null} Updated vendetta or null
     */
    function recordVendettaDeath(vendettaId, deathData) {
        if (_processingVendetta) {
            return null;
        }
        _processingVendetta = true;

        try {
            _initializeCache();

            var vendetta = _vendettaStorage.byId.get(vendettaId);
            if (!vendetta) return null;

            if (vendetta.status === VENDETTA_STATUS.RESOLVED) return null;

            var victim = _getCharacterById(deathData.victimId);
            var killer = _getCharacterById(deathData.killerId);

            var deathRecord = {
                victimId: deathData.victimId,
                victimName: victim ? victim.name : 'Unknown',
                killerId: deathData.killerId,
                killerName: killer ? killer.name : 'Unknown',
                year: deathData.year || _getCurrentYear(),
                reason: deathData.reason || null,
                recordedAt: Date.now()
            };

            vendetta.deaths.push(deathRecord);
            vendetta.bodyCount = vendetta.deaths.length;
            vendetta.updatedAt = Date.now();

            // Escalate if body count >= 3
            if (vendetta.bodyCount >= 3 && vendetta.status === VENDETTA_STATUS.ACTIVE) {
                vendetta.status = VENDETTA_STATUS.ESCALATED;
                vendetta.escalatedAt = deathData.year || _getCurrentYear();

                _logEvent('vendetta', 'Vendetta Escalated',
                    'Vendetta between ' + vendetta.householdAName + ' and ' + vendetta.householdBName + ' escalated after ' + vendetta.bodyCount + ' deaths',
                    []);
            }

            _saveToStorage();

            _logEvent('vendetta', 'Vendetta Death',
                (victim ? victim.name : 'Unknown') + ' killed in vendetta between ' + vendetta.householdAName + ' and ' + vendetta.householdBName,
                []);

            return vendetta;

        } finally {
            _processingVendetta = false;
        }
    }

    /**
     * Resolves a vendetta
     * @param {string} vendettaId - Vendetta ID
     * @param {Object} resolutionData - Resolution data
     * @param {string} resolutionData.resolution - Resolution description
     * @param {number} resolutionData.year - Year resolved (default: current)
     * @param {string} resolutionData.notes - Additional notes
     * @returns {Object|null} Updated vendetta or null
     */
    function resolveVendetta(vendettaId, resolutionData) {
        if (_processingVendetta) {
            return null;
        }
        _processingVendetta = true;

        try {
            _initializeCache();

            var vendetta = _vendettaStorage.byId.get(vendettaId);
            if (!vendetta) return null;

            if (vendetta.status === VENDETTA_STATUS.RESOLVED) return null;

            vendetta.status = VENDETTA_STATUS.RESOLVED;
            vendetta.resolvedAt = resolutionData.year || _getCurrentYear();
            vendetta.resolution = resolutionData.resolution || 'Resolved';
            vendetta.notes = resolutionData.notes || vendetta.notes;
            vendetta.updatedAt = Date.now();

            _saveToStorage();

            _logEvent('vendetta', 'Vendetta Resolved',
                'Vendetta between ' + vendetta.householdAName + ' and ' + vendetta.householdBName + ' resolved: ' + vendetta.resolution,
                []);

            return vendetta;

        } finally {
            _processingVendetta = false;
        }
    }

    /**
     * Escalates a vendetta manually
     * @param {string} vendettaId - Vendetta ID
     * @param {Object} options - Options
     * @param {number} options.year - Year escalated (default: current)
     * @param {string} options.reason - Reason for escalation
     * @returns {Object|null} Updated vendetta or null
     */
    function escalateVendetta(vendettaId, options) {
        if (_processingVendetta) {
            return null;
        }
        _processingVendetta = true;

        try {
            _initializeCache();

            var vendetta = _vendettaStorage.byId.get(vendettaId);
            if (!vendetta) return null;

            if (vendetta.status === VENDETTA_STATUS.RESOLVED) return null;
            if (vendetta.status === VENDETTA_STATUS.ESCALATED) return vendetta;

            vendetta.status = VENDETTA_STATUS.ESCALATED;
            vendetta.escalatedAt = options.year || _getCurrentYear();
            vendetta.updatedAt = Date.now();

            if (options.reason) {
                vendetta.notes = (vendetta.notes ? vendetta.notes + '; ' : '') + 'Escalated: ' + options.reason;
            }

            _saveToStorage();

            _logEvent('vendetta', 'Vendetta Escalated',
                'Vendetta between ' + vendetta.householdAName + ' and ' + vendetta.householdBName + ' was escalated' + (options.reason ? ' due to ' + options.reason : ''),
                []);

            return vendetta;

        } finally {
            _processingVendetta = false;
        }
    }

    /**
     * Creates a blood feud from a murder
     * @param {string} victimId - Victim character ID
     * @param {string} killerId - Killer character ID
     * @param {Object} options - Options
     * @param {number} options.year - Year (default: current)
     * @param {string} options.cause - Cause (default: 'Murder')
     * @param {string} options.notes - Additional notes
     * @returns {Object|null} Created vendetta or null
     */
    function createBloodFeud(victimId, killerId, options) {
        if (_processingVendetta) {
            return null;
        }
        _processingVendetta = true;

        try {
            var victim = _getCharacterById(victimId);
            var killer = _getCharacterById(killerId);

            if (!victim || !killer) return null;

            var victimHousehold = _getHousehold(victim.household || victim.householdId);
            var killerHousehold = _getHousehold(killer.household || killer.householdId);

            if (!victimHousehold || !killerHousehold) return null;

            var currentYear = options.year || _getCurrentYear();
            var cause = options.cause || 'Blood feud from murder of ' + victim.name + ' by ' + killer.name;

            var vendetta = createVendetta({
                householdAId: victimHousehold.id,
                householdBId: killerHousehold.id,
                characterAId: victimId,
                characterBId: killerId,
                cause: cause,
                year: currentYear,
                notes: options.notes || 'Blood feud initiated from murder'
            });

            if (vendetta) {
                // Record the first death
                recordVendettaDeath(vendetta.id, {
                    victimId: victimId,
                    killerId: killerId,
                    year: currentYear,
                    reason: 'Initial murder'
                });

                _logEvent('vendetta', 'Blood Feud Created',
                    'Blood feud created between ' + victimHousehold.name + ' and ' + killerHousehold.name + ' over the murder of ' + victim.name,
                    [victim, killer]);
            }

            return vendetta;

        } finally {
            _processingVendetta = false;
        }
    }

    // =========================================================================
    // 5. STATISTICS
    // =========================================================================

    /**
     * Gets vendetta statistics
     * @param {string} householdId - Optional household ID filter
     * @returns {Object} Statistics
     */
    function getVendettaStats(householdId) {
        _initializeCache();

        var vendettas = householdId ? 
            getVendettasByHousehold(householdId, { includeResolved: true }) :
            _vendettaStorage.all;

        var stats = {
            total: vendettas.length,
            active: 0,
            escalated: 0,
            resolved: 0,
            totalDeaths: 0,
            averageDeaths: 0,
            byHousehold: {}
        };

        for (var i = 0; i < vendettas.length; i++) {
            var v = vendettas[i];
            if (v.status === VENDETTA_STATUS.ACTIVE) stats.active++;
            else if (v.status === VENDETTA_STATUS.ESCALATED) stats.escalated++;
            else if (v.status === VENDETTA_STATUS.RESOLVED) stats.resolved++;
            stats.totalDeaths += v.bodyCount || 0;

            // Group by household
            if (v.householdAId) {
                if (!stats.byHousehold[v.householdAId]) {
                    stats.byHousehold[v.householdAId] = { name: v.householdAName, count: 0 };
                }
                stats.byHousehold[v.householdAId].count++;
            }
            if (v.householdBId) {
                if (!stats.byHousehold[v.householdBId]) {
                    stats.byHousehold[v.householdBId] = { name: v.householdBName, count: 0 };
                }
                stats.byHousehold[v.householdBId].count++;
            }
        }

        stats.averageDeaths = stats.total > 0 ? stats.totalDeaths / stats.total : 0;

        return stats;
    }

    // =========================================================================
    // 6. CACHE MANAGEMENT
    // =========================================================================

    function clearVendettaCache() {
        _clearCache();
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.VendettaSystem = {
        // Constants
        VENDETTA_STATUS: VENDETTA_STATUS,

        // CRUD
        createVendetta: createVendetta,
        getVendettaById: getVendettaById,
        getAllVendettas: getAllVendettas,
        getVendettasByHousehold: getVendettasByHousehold,
        getVendettasByCharacter: getVendettasByCharacter,
        getActiveVendettas: getActiveVendettas,

        // Operations
        recordVendettaDeath: recordVendettaDeath,
        resolveVendetta: resolveVendetta,
        escalateVendetta: escalateVendetta,

        // Blood feud
        createBloodFeud: createBloodFeud,

        // Statistics
        getVendettaStats: getVendettaStats,

        // Cache
        clearVendettaCache: clearVendettaCache
    };

    // Legacy aliases
    window.startVendetta = createVendetta;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            VENDETTA_STATUS: VENDETTA_STATUS,
            createVendetta: createVendetta,
            getVendettaById: getVendettaById,
            getAllVendettas: getAllVendettas,
            getVendettasByHousehold: getVendettasByHousehold,
            getVendettasByCharacter: getVendettasByCharacter,
            getActiveVendettas: getActiveVendettas,
            recordVendettaDeath: recordVendettaDeath,
            resolveVendetta: resolveVendetta,
            escalateVendetta: escalateVendetta,
            createBloodFeud: createBloodFeud,
            getVendettaStats: getVendettaStats,
            clearVendettaCache: clearVendettaCache
        };
    }

})();