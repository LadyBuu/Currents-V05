/**
 * =============================================================================
 * STILL WATERS - CRIME & VENDETTA STATE (crime-state.js)
 * =============================================================================
 * 
 * LOCATION: js/core/crime/crime-state.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for ALL crime and vendetta data.
 * 
 * EXPORTED FUNCTIONS:
 *   - CrimeState.getCrime(id) - Get crime by ID
 *   - CrimeState.getAllCrimes() - Get all crimes
 *   - CrimeState.getCrimesByCharacter(characterId) - Get crimes for character
 *   - CrimeState.getCrimesByType(type) - Get crimes by type
 *   - CrimeState.getUnsolvedCrimes() - Get all unsolved crimes
 *   - CrimeState.recordCrime(data) - Record a new crime
 *   - CrimeState.solveCrime(id, solution) - Mark crime as solved
 *   - CrimeState.getVendetta(id) - Get vendetta by ID
 *   - CrimeState.getAllVendettas() - Get all vendettas
 *   - CrimeState.getVendettasByHousehold(householdId) - Get vendettas for household
 *   - CrimeState.getVendettasByCharacter(characterId) - Get vendettas for character
 *   - CrimeState.getActiveVendettas(householdId) - Get active vendettas for household
 *   - CrimeState.createVendetta(data) - Create a new vendetta
 *   - CrimeState.recordVendettaDeath(vendettaId, deathData) - Record a vendetta death
 *   - CrimeState.resolveVendetta(vendettaId, resolutionData) - Resolve a vendetta
 *   - CrimeState.subscribe(callback) - Subscribe to state changes
 *   - CrimeState.invalidateCache() - Clear all caches
 * 
 * DEPENDENCIES:
 *   - ids.js: generateId
 *   - time.js: getCurrentYearSafe
 *   - accessors.js: getCharacterById, getHouseholdById
 *   - storage.js: saveMasterData
 * 
 * ICON POLICY: No emojis. No icons. Uses icons.js via _getIconSafe.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingState = false;
    var _initialized = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

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

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getHouseholdById(id) {
        if (typeof window.getHouseholdById === 'function') {
            return window.getHouseholdById(id);
        }
        return null;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    // =========================================================================
    // 2. PRIVATE STATE
    // =========================================================================

    var _state = {
        crimes: {
            byId: new Map(),
            byCharacter: new Map(),
            byType: new Map(),
            byLocation: new Map(),
            unsolved: new Set(),
            all: []
        },
        vendettas: {
            byId: new Map(),
            byHousehold: new Map(),
            byCharacter: new Map(),
            all: []
        },
        subscribers: [],
        lastUpdate: 0
    };

    // =========================================================================
    // 3. INITIALIZATION
    // =========================================================================

    function _initialize() {
        if (_initialized) return;

        try {
            // Try to load from masterData
            if (typeof window.masterData !== 'undefined' && 
                window.masterData.data) {
                
                // Load crimes
                var savedCrimes = window.masterData.data.crimes || [];
                for (var i = 0; i < savedCrimes.length; i++) {
                    _addCrimeToCache(savedCrimes[i]);
                }

                // Load vendettas
                var savedVendettas = window.masterData.data.vendettas || [];
                for (var i = 0; i < savedVendettas.length; i++) {
                    _addVendettaToCache(savedVendettas[i]);
                }
            }

            _initialized = true;
        } catch (e) {
            // Silently handle initialization errors
        }
    }

    // =========================================================================
    // 4. CRIME CACHE MANAGEMENT
    // =========================================================================

    function _addCrimeToCache(crime) {
        if (!crime || !crime.id) return;

        _state.crimes.byId.set(crime.id, crime);
        _state.crimes.all.push(crime);

        // Index by character
        if (crime.perpetratorId) {
            if (!_state.crimes.byCharacter.has(crime.perpetratorId)) {
                _state.crimes.byCharacter.set(crime.perpetratorId, new Set());
            }
            _state.crimes.byCharacter.get(crime.perpetratorId).add(crime.id);
        }

        // Index by type
        if (crime.type) {
            if (!_state.crimes.byType.has(crime.type)) {
                _state.crimes.byType.set(crime.type, new Set());
            }
            _state.crimes.byType.get(crime.type).add(crime.id);
        }

        // Index by location
        if (crime.locationId) {
            if (!_state.crimes.byLocation.has(crime.locationId)) {
                _state.crimes.byLocation.set(crime.locationId, new Set());
            }
            _state.crimes.byLocation.get(crime.locationId).add(crime.id);
        }

        // Track unsolved
        if (!crime.solved) {
            _state.crimes.unsolved.add(crime.id);
        }

        _state.lastUpdate = Date.now();
    }

    function _removeCrimeFromCache(crimeId) {
        var crime = _state.crimes.byId.get(crimeId);
        if (!crime) return;

        _state.crimes.byId.delete(crimeId);

        // Remove from all indices
        if (crime.perpetratorId) {
            var charSet = _state.crimes.byCharacter.get(crime.perpetratorId);
            if (charSet) {
                charSet.delete(crimeId);
                if (charSet.size === 0) {
                    _state.crimes.byCharacter.delete(crime.perpetratorId);
                }
            }
        }

        if (crime.type) {
            var typeSet = _state.crimes.byType.get(crime.type);
            if (typeSet) {
                typeSet.delete(crimeId);
                if (typeSet.size === 0) {
                    _state.crimes.byType.delete(crime.type);
                }
            }
        }

        if (crime.locationId) {
            var locSet = _state.crimes.byLocation.get(crime.locationId);
            if (locSet) {
                locSet.delete(crimeId);
                if (locSet.size === 0) {
                    _state.crimes.byLocation.delete(crime.locationId);
                }
            }
        }

        _state.crimes.unsolved.delete(crimeId);

        var index = _state.crimes.all.indexOf(crime);
        if (index !== -1) {
            _state.crimes.all.splice(index, 1);
        }

        _state.lastUpdate = Date.now();
    }

    function _persistCrimes() {
        try {
            if (typeof window.masterData !== 'undefined' && window.masterData.data) {
                window.masterData.data.crimes = _state.crimes.all;
                _saveMasterData();
            }
        } catch (e) {
            // Silently handle persistence errors
        }
    }

    // =========================================================================
    // 5. VENDETTA CACHE MANAGEMENT
    // =========================================================================

    function _addVendettaToCache(vendetta) {
        if (!vendetta || !vendetta.id) return;

        _state.vendettas.byId.set(vendetta.id, vendetta);
        _state.vendettas.all.push(vendetta);

        // Index by household
        if (vendetta.householdAId) {
            if (!_state.vendettas.byHousehold.has(vendetta.householdAId)) {
                _state.vendettas.byHousehold.set(vendetta.householdAId, new Set());
            }
            _state.vendettas.byHousehold.get(vendetta.householdAId).add(vendetta.id);
        }
        if (vendetta.householdBId) {
            if (!_state.vendettas.byHousehold.has(vendetta.householdBId)) {
                _state.vendettas.byHousehold.set(vendetta.householdBId, new Set());
            }
            _state.vendettas.byHousehold.get(vendetta.householdBId).add(vendetta.id);
        }

        // Index by character
        if (vendetta.characterAId) {
            if (!_state.vendettas.byCharacter.has(vendetta.characterAId)) {
                _state.vendettas.byCharacter.set(vendetta.characterAId, new Set());
            }
            _state.vendettas.byCharacter.get(vendetta.characterAId).add(vendetta.id);
        }
        if (vendetta.characterBId) {
            if (!_state.vendettas.byCharacter.has(vendetta.characterBId)) {
                _state.vendettas.byCharacter.set(vendetta.characterBId, new Set());
            }
            _state.vendettas.byCharacter.get(vendetta.characterBId).add(vendetta.id);
        }

        _state.lastUpdate = Date.now();
    }

    function _removeVendettaFromCache(vendettaId) {
        var vendetta = _state.vendettas.byId.get(vendettaId);
        if (!vendetta) return;

        _state.vendettas.byId.delete(vendettaId);

        // Remove from all indices
        if (vendetta.householdAId) {
            var setA = _state.vendettas.byHousehold.get(vendetta.householdAId);
            if (setA) {
                setA.delete(vendettaId);
                if (setA.size === 0) {
                    _state.vendettas.byHousehold.delete(vendetta.householdAId);
                }
            }
        }
        if (vendetta.householdBId) {
            var setB = _state.vendettas.byHousehold.get(vendetta.householdBId);
            if (setB) {
                setB.delete(vendettaId);
                if (setB.size === 0) {
                    _state.vendettas.byHousehold.delete(vendetta.householdBId);
                }
            }
        }

        if (vendetta.characterAId) {
            var charSetA = _state.vendettas.byCharacter.get(vendetta.characterAId);
            if (charSetA) {
                charSetA.delete(vendettaId);
                if (charSetA.size === 0) {
                    _state.vendettas.byCharacter.delete(vendetta.characterAId);
                }
            }
        }
        if (vendetta.characterBId) {
            var charSetB = _state.vendettas.byCharacter.get(vendetta.characterBId);
            if (charSetB) {
                charSetB.delete(vendettaId);
                if (charSetB.size === 0) {
                    _state.vendettas.byCharacter.delete(vendetta.characterBId);
                }
            }
        }

        var index = _state.vendettas.all.indexOf(vendetta);
        if (index !== -1) {
            _state.vendettas.all.splice(index, 1);
        }

        _state.lastUpdate = Date.now();
    }

    function _persistVendettas() {
        try {
            if (typeof window.masterData !== 'undefined' && window.masterData.data) {
                window.masterData.data.vendettas = _state.vendettas.all;
                _saveMasterData();
            }
        } catch (e) {
            // Silently handle persistence errors
        }
    }

    // =========================================================================
    // 6. NOTIFICATION SYSTEM
    // =========================================================================

    function _notifySubscribers(event, data) {
        for (var i = 0; i < _state.subscribers.length; i++) {
            try {
                _state.subscribers[i]({ type: event, data: data, timestamp: Date.now() });
            } catch (e) {
                // Silently handle subscriber errors
            }
        }
    }

    // =========================================================================
    // 7. PUBLIC API - CRIME QUERIES
    // =========================================================================

    function getCrime(crimeId) {
        _initialize();
        return _state.crimes.byId.get(crimeId) || null;
    }

    function getAllCrimes() {
        _initialize();
        return _state.crimes.all.slice();
    }

    function getCrimesByCharacter(characterId) {
        _initialize();
        var crimeIds = _state.crimes.byCharacter.get(characterId);
        if (!crimeIds) return [];
        var result = [];
        for (var id of crimeIds) {
            var crime = _state.crimes.byId.get(id);
            if (crime) result.push(crime);
        }
        return result;
    }

    function getCrimesByType(type) {
        _initialize();
        var crimeIds = _state.crimes.byType.get(type);
        if (!crimeIds) return [];
        var result = [];
        for (var id of crimeIds) {
            var crime = _state.crimes.byId.get(id);
            if (crime) result.push(crime);
        }
        return result;
    }

    function getCrimesByLocation(locationId) {
        _initialize();
        var crimeIds = _state.crimes.byLocation.get(locationId);
        if (!crimeIds) return [];
        var result = [];
        for (var id of crimeIds) {
            var crime = _state.crimes.byId.get(id);
            if (crime) result.push(crime);
        }
        return result;
    }

    function getUnsolvedCrimes() {
        _initialize();
        var result = [];
        for (var id of _state.crimes.unsolved) {
            var crime = _state.crimes.byId.get(id);
            if (crime) result.push(crime);
        }
        return result;
    }

    function getCrimeCount() {
        _initialize();
        return _state.crimes.all.length;
    }

    // =========================================================================
    // 8. PUBLIC API - CRIME COMMANDS
    // =========================================================================

    function recordCrime(data) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var currentYear = _getCurrentYear();
            var victim = data.victimId ? _getCharacterById(data.victimId) : null;
            var perpetrator = data.perpetratorId ? _getCharacterById(data.perpetratorId) : null;

            var crime = {
                id: _generateId('crime'),
                type: data.type || 'unknown',
                perpetratorId: data.perpetratorId || null,
                perpetratorName: perpetrator ? (perpetrator.name || 'Unknown') : 'Unknown',
                victimId: data.victimId || null,
                victimName: victim ? (victim.name || 'Unknown') : null,
                year: data.year || currentYear,
                reason: data.reason || 'Unknown reason',
                location: data.location || null,
                locationId: data.locationId || null,
                witnesses: data.witnesses || [],
                evidence: data.evidence || [],
                solved: data.solved || false,
                solvedAt: data.solved ? (data.year || currentYear) : null,
                solution: null,
                punishment: data.punishment || null,
                method: data.method || null,
                severity: data.severity || 5,
                recordedAt: currentYear,
                notes: data.notes || null,
                metadata: data.metadata || {}
            };

            _addCrimeToCache(crime);
            _persistCrimes();
            _notifySubscribers('crimeRecorded', { crime: crime });

            return { success: true, data: crime };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to record crime' };
        } finally {
            _processingState = false;
        }
    }

    function solveCrime(crimeId, solution) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var crime = _state.crimes.byId.get(crimeId);
            if (!crime) {
                return { success: false, error: 'Crime not found' };
            }
            if (crime.solved) {
                return { success: false, error: 'Crime already solved' };
            }

            crime.solved = true;
            crime.solvedAt = _getCurrentYear();
            crime.solution = solution || 'Solved';
            _state.crimes.unsolved.delete(crimeId);

            _persistCrimes();
            _notifySubscribers('crimeSolved', { crimeId: crimeId, solution: solution });

            return { success: true, data: crime };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to solve crime' };
        } finally {
            _processingState = false;
        }
    }

    function deleteCrime(crimeId) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var crime = _state.crimes.byId.get(crimeId);
            if (!crime) {
                return { success: false, error: 'Crime not found' };
            }

            _removeCrimeFromCache(crimeId);
            _persistCrimes();
            _notifySubscribers('crimeDeleted', { crimeId: crimeId });

            return { success: true };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to delete crime' };
        } finally {
            _processingState = false;
        }
    }

    // =========================================================================
    // 9. PUBLIC API - VENDETTA QUERIES
    // =========================================================================

    function getVendetta(vendettaId) {
        _initialize();
        return _state.vendettas.byId.get(vendettaId) || null;
    }

    function getAllVendettas(options) {
        options = options || {};
        _initialize();
        if (options.includeResolved === false) {
            return _state.vendettas.all.filter(function(v) {
                return v.status !== 'resolved';
            });
        }
        return _state.vendettas.all.slice();
    }

    function getVendettasByHousehold(householdId, options) {
        options = options || {};
        _initialize();
        var vendettaIds = _state.vendettas.byHousehold.get(householdId);
        if (!vendettaIds) return [];
        var result = [];
        for (var id of vendettaIds) {
            var v = _state.vendettas.byId.get(id);
            if (v) {
                if (!options.includeResolved && v.status === 'resolved') {
                    continue;
                }
                result.push(v);
            }
        }
        return result;
    }

    function getVendettasByCharacter(characterId, options) {
        options = options || {};
        _initialize();
        var vendettaIds = _state.vendettas.byCharacter.get(characterId);
        if (!vendettaIds) return [];
        var result = [];
        for (var id of vendettaIds) {
            var v = _state.vendettas.byId.get(id);
            if (v) {
                if (!options.includeResolved && v.status === 'resolved') {
                    continue;
                }
                result.push(v);
            }
        }
        return result;
    }

    function getActiveVendettas(householdId) {
        return getVendettasByHousehold(householdId, { includeResolved: false });
    }

    function getVendettaCount() {
        _initialize();
        return _state.vendettas.all.length;
    }

    // =========================================================================
    // 10. PUBLIC API - VENDETTA COMMANDS
    // =========================================================================

    function createVendetta(data) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var currentYear = _getCurrentYear();

            // Validate households
            var householdA = data.householdAId ? _getHouseholdById(data.householdAId) : null;
            var householdB = data.householdBId ? _getHouseholdById(data.householdBId) : null;

            if (!householdA || !householdB) {
                return { success: false, error: 'One or both households not found' };
            }

            if (data.householdAId === data.householdBId) {
                return { success: false, error: 'Cannot create vendetta with same household' };
            }

            // Check for existing active vendetta
            var existing = getActiveVendettas(data.householdAId);
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].householdAId === data.householdBId || 
                    existing[i].householdBId === data.householdBId) {
                    return { success: false, error: 'Active vendetta already exists between these households' };
                }
            }

            var characterA = data.characterAId ? _getCharacterById(data.characterAId) : null;
            var characterB = data.characterBId ? _getCharacterById(data.characterBId) : null;

            var vendetta = {
                id: _generateId('vendetta'),
                householdAId: data.householdAId,
                householdAName: householdA.name || 'Unknown',
                householdBId: data.householdBId,
                householdBName: householdB.name || 'Unknown',
                characterAId: data.characterAId || null,
                characterAName: characterA ? (characterA.name || null) : null,
                characterBId: data.characterBId || null,
                characterBName: characterB ? (characterB.name || null) : null,
                cause: data.cause || 'Unknown cause',
                startedYear: data.year || currentYear,
                status: 'active',
                bodyCount: 0,
                deaths: [],
                escalatedAt: null,
                resolvedAt: null,
                resolution: null,
                notes: data.notes || null,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            _addVendettaToCache(vendetta);
            _persistVendettas();
            _notifySubscribers('vendettaCreated', { vendetta: vendetta });

            return { success: true, data: vendetta };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to create vendetta' };
        } finally {
            _processingState = false;
        }
    }

    function recordVendettaDeath(vendettaId, deathData) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var vendetta = _state.vendettas.byId.get(vendettaId);
            if (!vendetta) {
                return { success: false, error: 'Vendetta not found' };
            }
            if (vendetta.status === 'resolved') {
                return { success: false, error: 'Vendetta is already resolved' };
            }

            var victim = deathData.victimId ? _getCharacterById(deathData.victimId) : null;
            var killer = deathData.killerId ? _getCharacterById(deathData.killerId) : null;

            var deathRecord = {
                victimId: deathData.victimId || null,
                victimName: victim ? (victim.name || 'Unknown') : 'Unknown',
                killerId: deathData.killerId || null,
                killerName: killer ? (killer.name || 'Unknown') : 'Unknown',
                year: deathData.year || _getCurrentYear(),
                reason: deathData.reason || null,
                recordedAt: Date.now()
            };

            vendetta.deaths.push(deathRecord);
            vendetta.bodyCount = vendetta.deaths.length;
            vendetta.updatedAt = Date.now();

            // Escalate if body count >= 3
            if (vendetta.bodyCount >= 3 && vendetta.status === 'active') {
                vendetta.status = 'escalated';
                vendetta.escalatedAt = deathData.year || _getCurrentYear();
                _notifySubscribers('vendettaEscalated', { vendettaId: vendettaId, bodyCount: vendetta.bodyCount });
            }

            _persistVendettas();
            _notifySubscribers('vendettaDeath', { vendettaId: vendettaId, death: deathRecord });

            return { success: true, data: vendetta };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to record vendetta death' };
        } finally {
            _processingState = false;
        }
    }

    function resolveVendetta(vendettaId, resolutionData) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var vendetta = _state.vendettas.byId.get(vendettaId);
            if (!vendetta) {
                return { success: false, error: 'Vendetta not found' };
            }
            if (vendetta.status === 'resolved') {
                return { success: false, error: 'Vendetta already resolved' };
            }

            vendetta.status = 'resolved';
            vendetta.resolvedAt = resolutionData.year || _getCurrentYear();
            vendetta.resolution = resolutionData.resolution || 'Resolved';
            vendetta.notes = resolutionData.notes || vendetta.notes;
            vendetta.updatedAt = Date.now();

            _persistVendettas();
            _notifySubscribers('vendettaResolved', { vendettaId: vendettaId, resolution: vendetta.resolution });

            return { success: true, data: vendetta };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to resolve vendetta' };
        } finally {
            _processingState = false;
        }
    }

    function deleteVendetta(vendettaId) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var vendetta = _state.vendettas.byId.get(vendettaId);
            if (!vendetta) {
                return { success: false, error: 'Vendetta not found' };
            }

            _removeVendettaFromCache(vendettaId);
            _persistVendettas();
            _notifySubscribers('vendettaDeleted', { vendettaId: vendettaId });

            return { success: true };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to delete vendetta' };
        } finally {
            _processingState = false;
        }
    }

    // =========================================================================
    // 11. SUBSCRIPTION
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

    // =========================================================================
    // 12. CACHE MANAGEMENT
    // =========================================================================

    function invalidateCache() {
        if (_processingState) return;
        _processingState = true;

        try {
            _state.crimes.byId = new Map();
            _state.crimes.byCharacter = new Map();
            _state.crimes.byType = new Map();
            _state.crimes.byLocation = new Map();
            _state.crimes.unsolved = new Set();
            _state.crimes.all = [];

            _state.vendettas.byId = new Map();
            _state.vendettas.byHousehold = new Map();
            _state.vendettas.byCharacter = new Map();
            _state.vendettas.all = [];

            _initialized = false;
            _initialize();
            _notifySubscribers('cacheInvalidated', {});
        } catch (e) {
            // Silently handle
        } finally {
            _processingState = false;
        }
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.CrimeState = {
        // Crime queries
        getCrime: getCrime,
        getAllCrimes: getAllCrimes,
        getCrimesByCharacter: getCrimesByCharacter,
        getCrimesByType: getCrimesByType,
        getCrimesByLocation: getCrimesByLocation,
        getUnsolvedCrimes: getUnsolvedCrimes,
        getCrimeCount: getCrimeCount,

        // Crime commands
        recordCrime: recordCrime,
        solveCrime: solveCrime,
        deleteCrime: deleteCrime,

        // Vendetta queries
        getVendetta: getVendetta,
        getAllVendettas: getAllVendettas,
        getVendettasByHousehold: getVendettasByHousehold,
        getVendettasByCharacter: getVendettasByCharacter,
        getActiveVendettas: getActiveVendettas,
        getVendettaCount: getVendettaCount,

        // Vendetta commands
        createVendetta: createVendetta,
        recordVendettaDeath: recordVendettaDeath,
        resolveVendetta: resolveVendetta,
        deleteVendetta: deleteVendetta,

        // Subscription
        subscribe: subscribe,

        // Cache
        invalidateCache: invalidateCache
    };

    // Legacy aliases
    window._crimeState = window.CrimeState;

})();