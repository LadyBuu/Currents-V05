/**
 * =============================================================================
 * SETTLEMENT GOVERNMENT - Government type, justice, watch management
 * =============================================================================
 * 
 * DEPENDENCIES:
 *   - settlement-state.js (SettlementState)
 *   - accessors.js (getPlaceById, getCurrentYear)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    var _processing = false;

    function _getSettlementData(locationId) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState.getSettlementData === 'function') {
            return window.SettlementState.getSettlementData(locationId);
        }
        return null;
    }

    function _updateSettlementData(locationId, updates) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState._updateSettlementData === 'function') {
            return window.SettlementState._updateSettlementData(locationId, updates);
        }
        return null;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') window._showToast(msg, type);
        else if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _recalculateProsperity(locationId) {
        if (typeof window.recalculateSettlementProsperity === 'function') {
            window.recalculateSettlementProsperity(locationId);
        }
    }

    function _recalculateCrimeRate(locationId) {
        if (typeof window.recalculateSettlementCrimeRate === 'function') {
            window.recalculateSettlementCrimeRate(locationId);
        }
    }

    function setGovernmentType(locationId, governmentType, governmentStyle, governmentTypeId) {
        if (_processing) return null;
        _processing = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement not found', 'error');
                return null;
            }

            var updates = {
                governmentType: governmentType || 'none',
                updatedAt: _getCurrentYear()
            };

            if (governmentStyle !== undefined) updates.governmentStyle = governmentStyle || null;
            if (governmentTypeId !== undefined) updates.governmentTypeId = governmentTypeId || null;

            if (governmentType === 'theocracy') {
                updates.useReligiousLawsAsCivil = true;
            }

            var result = _updateSettlementData(locationId, updates);
            if (result) {
                var place = _getPlaceById(locationId);
                _showToast('Government set to ' + governmentType + ' for ' + (place ? place.displayName : 'Unknown'), 'success');
                _logEvent('settlement', 'government_changed', 'Government set to ' + governmentType, []);
                _recalculateProsperity(locationId);
                _recalculateCrimeRate(locationId);
                return result;
            }
            return null;

        } finally {
            _processing = false;
        }
    }

    function setUseReligiousLawsAsCivil(locationId, enabled) {
        if (_processing) return null;
        _processing = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement not found', 'error');
                return null;
            }

            var result = _updateSettlementData(locationId, {
                useReligiousLawsAsCivil: !!enabled,
                updatedAt: _getCurrentYear()
            });

            if (result) {
                var place = _getPlaceById(locationId);
                _showToast(
                    (enabled ? 'Religious laws apply as civil laws' : 'Religious laws do not apply as civil laws') +
                    ' for ' + (place ? place.displayName : 'Unknown'),
                    'success'
                );
                return result;
            }
            return null;

        } finally {
            _processing = false;
        }
    }

    function setJusticeSeverity(locationId, severity) {
        if (_processing) return null;
        _processing = true;

        try {
            var validSeverities = ['lenient', 'medium', 'harsh', 'extreme'];
            if (validSeverities.indexOf(severity) === -1) {
                _showToast('Invalid severity. Options: lenient, medium, harsh, extreme', 'error');
                return null;
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement not found', 'error');
                return null;
            }

            var result = _updateSettlementData(locationId, {
                justiceSeverity: severity,
                updatedAt: _getCurrentYear()
            });

            if (result) {
                var place = _getPlaceById(locationId);
                _showToast('Justice severity set to ' + severity + ' for ' + (place ? place.displayName : 'Unknown'), 'success');
                _logEvent('settlement', 'justice_changed', 'Justice severity set to ' + severity, []);
                _recalculateCrimeRate(locationId);
                return result;
            }
            return null;

        } finally {
            _processing = false;
        }
    }

    function setWatch(locationId, hasWatch, size) {
        if (_processing) return null;
        _processing = true;

        try {
            if (hasWatch && (!size || size < 1)) {
                _showToast('Watch size must be at least 1', 'error');
                return null;
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                _showToast('Settlement not found', 'error');
                return null;
            }

            var updates = {
                hasWatch: !!hasWatch,
                watchSize: hasWatch ? (size || 0) : 0,
                updatedAt: _getCurrentYear()
            };

            if (hasWatch && !data.watchFounded) {
                updates.watchFounded = _getCurrentYear();
            }

            var result = _updateSettlementData(locationId, updates);
            if (result) {
                var place = _getPlaceById(locationId);
                _showToast(
                    hasWatch ? 'Watch established with ' + size + ' members' : 'Watch disbanded',
                    'success'
                );
                _logEvent('settlement', 'watch_changed', 
                    (hasWatch ? 'Watch established with ' + size + ' members' : 'Watch disbanded'),
                    []
                );
                _recalculateCrimeRate(locationId);
                return result;
            }
            return null;

        } finally {
            _processing = false;
        }
    }

    window.SettlementGovernment = {
        setGovernmentType: setGovernmentType,
        setUseReligiousLawsAsCivil: setUseReligiousLawsAsCivil,
        setJusticeSeverity: setJusticeSeverity,
        setWatch: setWatch
    };

})();