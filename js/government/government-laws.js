/**
 * government-laws.js
 * Compatibility façade. Civil laws are owned by Settlement.
 * Delegates to SettlementCommands / SettlementQueries / SettlementRules.
 * Will be deleted once callers migrate to Settlement APIs directly.
 */
(function() {
    'use strict';

    var _Commands = window.SettlementCommands;
    var _Queries = window.SettlementQueries;

    if (!_Commands) throw new Error('government-laws.js requires SettlementCommands');
    if (!_Queries) throw new Error('government-laws.js requires SettlementQueries');

    function _requireMethod(obj, name) {
        if (typeof obj[name] !== 'function') {
            throw new Error('government-laws.js: Settlement API missing ' + name);
        }
        return obj[name].bind(obj);
    }

    var _add = _requireMethod(_Commands, 'addCivilLaw');
    var _update = _requireMethod(_Commands, 'updateCivilLaw');
    var _remove = _requireMethod(_Commands, 'removeCivilLaw');
    var _list = _requireMethod(_Queries, 'getCivilLaws');
    var _byDomain = _requireMethod(_Queries, 'getCivilLawsByDomain');
    var _bySeverity = _requireMethod(_Queries, 'getCivilLawsBySeverity');
    var _enforced = _requireMethod(_Queries, 'getEnforcedCivilLaws');
    var _one = _requireMethod(_Queries, 'getCivilLaw');
    var _count = _requireMethod(_Queries, 'getCivilLawCount');
    var _byCrime = _requireMethod(_Queries, 'getCivilLawsByCrimeType');
    var _enforcedByCrime = _requireMethod(_Queries, 'getEnforcedCivilLawsByCrimeType');
    var _stats = _requireMethod(_Queries, 'getCivilLawStatistics');

    // ---- CRUD (delegated) ----------------------------------------------------

    function addCivilLaw(locationId, lawData) {
        return _add(locationId, lawData);
    }

    function updateCivilLaw(locationId, lawId, updates) {
        return _update(locationId, lawId, updates);
    }

    function removeCivilLaw(locationId, lawId) {
        return _remove(locationId, lawId);
    }

    // ---- Queries (delegated) -------------------------------------------------

    function getCivilLaws(locationId) {
        return _list(locationId);
    }

    function getCivilLawsByDomain(locationId, domain) {
        return _byDomain(locationId, domain);
    }

    function getCivilLawsBySeverity(locationId, severity) {
        return _bySeverity(locationId, severity);
    }

    function getEnforcedCivilLaws(locationId) {
        return _enforced(locationId);
    }

    function getCivilLaw(locationId, lawId) {
        return _one(locationId, lawId);
    }

    function getCivilLawCount(locationId) {
        return _count(locationId);
    }

    function getCivilLawsByCrimeType(locationId, crimeType) {
        return _byCrime(locationId, crimeType);
    }

    function getEnforcedCivilLawsByCrimeType(locationId, crimeType) {
        return _enforcedByCrime(locationId, crimeType);
    }

    function getCivilLawStatistics(locationId) {
        return _stats(locationId);
    }

    // ---- Constants (re-exported from crime-constants.js) ---------------------

    if (!window.LAW_TYPES || !window.LAW_CATEGORIES || !window.LAW_DOMAINS || !window.LAW_SEVERITY) {
        throw new Error('government-laws.js requires crime-constants.js to be loaded first');
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentLaws = {
        // CRUD (delegated to Settlement)
        addCivilLaw: addCivilLaw,
        updateCivilLaw: updateCivilLaw,
        removeCivilLaw: removeCivilLaw,

        // Queries (delegated to Settlement)
        getCivilLaws: getCivilLaws,
        getCivilLawsByDomain: getCivilLawsByDomain,
        getCivilLawsBySeverity: getCivilLawsBySeverity,
        getEnforcedCivilLaws: getEnforcedCivilLaws,
        getCivilLaw: getCivilLaw,
        getCivilLawCount: getCivilLawCount,
        getCivilLawsByCrimeType: getCivilLawsByCrimeType,
        getEnforcedCivilLawsByCrimeType: getEnforcedCivilLawsByCrimeType,
        getCivilLawStatistics: getCivilLawStatistics,

        // Constants (single source, from crime-constants.js)
        LAW_TYPES: window.LAW_TYPES,
        LAW_CATEGORIES: window.LAW_CATEGORIES,
        LAW_DOMAINS: window.LAW_DOMAINS,
        LAW_SEVERITY: window.LAW_SEVERITY
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentLaws;
    }
})();
