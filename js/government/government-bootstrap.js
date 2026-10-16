/**
 * government-bootstrap.js
 * Load-time verification, hydration, namespace exposure. Idempotent init().
 *
 * Loaded last in the Government script group.
 * Safe to re-invoke after masterDataUpdated.
 */
(function() {
    'use strict';

    var _initialized = false;

    // ---- Verification --------------------------------------------------------

    function _require(label, getter) {
        var v = getter();
        if (typeof v === 'undefined' || v === null) {
            throw new Error('government-bootstrap: ' + label + ' required');
        }
        return v;
    }

    function _requireMethod(label, obj, methodName) {
        if (!obj || typeof obj[methodName] !== 'function') {
            throw new Error('government-bootstrap: ' + label + '.' + methodName + ' required');
        }
    }

    function _verifyGlobals() {
        if (typeof window.generateId !== 'function') {
            throw new Error('government-bootstrap: generateId required');
        }
        if (typeof window.markDataDirty !== 'function') {
            throw new Error('government-bootstrap: markDataDirty required');
        }
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('government-bootstrap: saveMasterData required');
        }
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('government-bootstrap: getCurrentYearSafe required');
        }
    }

    function _verifyModules() {
        _require('GovernmentConstants', function() { return window.GovernmentConstants; });
        _require('GovernmentState',     function() { return window.GovernmentState; });
        _require('GovernmentRules',     function() { return window.GovernmentRules; });
        _require('GovernmentQueries',   function() { return window.GovernmentQueries; });
        _require('GovernmentCommands',  function() { return window.GovernmentCommands; });
        _require('GovernmentEconomy',   function() { return window.GovernmentEconomy; });
    }

    function _verifyCrossDomain() {
        _require('CharacterQueries',  function() { return window.CharacterQueries; });
        _require('CharacterCommands', function() { return window.CharacterCommands; });
        _require('LocationQueries',   function() { return window.LocationQueries; });
        _require('LocationCommands',  function() { return window.LocationCommands; });
        _require('RoleQueries',       function() { return window.RoleQueries; });
        _require('SettlementQueries', function() { return window.SettlementQueries; });
        _require('SettlementProsperityQueries', function() { return window.SettlementProsperityQueries; });
        _require('SettlementGovernmentCommands', function() { return window.SettlementGovernmentCommands; });
        _require('IndustryQueries',   function() { return window.IndustryQueries; });
        _require('HouseholdQueries',  function() { return window.HouseholdQueries; });
        _require('HouseholdCommands', function() { return window.HouseholdCommands; });

        // Verify specific methods Commands / Queries / Economy rely on.
        _requireMethod('CharacterQueries',  window.CharacterQueries,  'getCharacterFacts');
        _requireMethod('CharacterQueries',  window.CharacterQueries,  'getAllCharacterFacts');
        _requireMethod('CharacterCommands', window.CharacterCommands, 'addProfession');

        _requireMethod('LocationQueries',   window.LocationQueries,   'getPlaceSummary');
        _requireMethod('LocationCommands',  window.LocationCommands,  'assignLeader');
        _requireMethod('LocationCommands',  window.LocationCommands,  'endLeaderTerm');
        _requireMethod('LocationCommands',  window.LocationCommands,  'assignGovernment');

        _requireMethod('RoleQueries',       window.RoleQueries,       'getRoleSummary');
        _requireMethod('RoleQueries',       window.RoleQueries,       'getRankSummary');

        _requireMethod('SettlementQueries', window.SettlementQueries, 'getIndustryTaxRate');

        _requireMethod('SettlementProsperityQueries', window.SettlementProsperityQueries, 'getProsperityValue');

        _requireMethod('SettlementGovernmentCommands', window.SettlementGovernmentCommands, 'setJusticeSeverity');
        _requireMethod('SettlementGovernmentCommands', window.SettlementGovernmentCommands, 'setWatch');

        _requireMethod('HouseholdQueries',  window.HouseholdQueries,  'getCharacterHousehold');
    }

    function _verifyCanonical() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error('government-bootstrap: masterData.data required');
        }
        var d = window.masterData.data;
        if (d.governmentDepartments && !Array.isArray(d.governmentDepartments)) {
            throw new Error('government-bootstrap: masterData.data.governmentDepartments must be an array');
        }
        if (d.governmentTypes && !Array.isArray(d.governmentTypes)) {
            throw new Error('government-bootstrap: masterData.data.governmentTypes must be an array');
        }
        if (d.governmentHistory && !Array.isArray(d.governmentHistory)) {
            throw new Error('government-bootstrap: masterData.data.governmentHistory must be an array');
        }
    }

    // ---- Init ----------------------------------------------------------------

    function init() {
        if (_initialized) {
            return { success: true, alreadyInitialized: true };
        }

        _verifyGlobals();
        _verifyModules();
        _verifyCrossDomain();
        _verifyCanonical();

        window.GovernmentState.hydrateFromMasterData();

        // Warn-only integrity check. Does not throw.
        try {
            window.GovernmentState.validateIntegrity();
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('government-bootstrap: validateIntegrity threw', e);
            }
        }

        window.Government = {
            constants: window.GovernmentConstants,
            state:     window.GovernmentState,
            rules:     window.GovernmentRules,
            queries:   window.GovernmentQueries,
            commands:  window.GovernmentCommands,
            economy:   window.GovernmentEconomy
        };

        _initialized = true;

        return { success: true };
    }

    function reinit() {
        _initialized = false;
        return init();
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentBootstrap = {
        init: init,
        reinit: reinit
    };

    // Auto-init if masterData is already available. Otherwise the loader
    // calls init() after masterData has loaded.
    if (window.masterData && window.masterData.data) {
        try {
            init();
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('government-bootstrap: auto-init failed:', e);
            }
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentBootstrap;
    }
})();
