/**
 * =============================================================================
 * HOUSEHOLD SERVANT (household-servant.js)
 * =============================================================================
 * 
 * PURPOSE: Business logic for master-servant and employer-employee
 *          relationships. Handles service contracts, quality tracking,
 *          promotions, termination, and references.
 * 
 * DEPENDS ON:
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - household-queries.js (HouseholdQueries)
 *   - household-economy.js (HouseholdEconomy)
 *   - accessors.js (getCharacterById, getCharacters, getCurrentYear)
 *   - relationship-types.js (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS)
 *   - trust-system.js (modifyTrust)
 *   - loyalty-system.js (modifyLoyalty)
 * 
 * EXPORTS:
 *   - SERVICE_TYPES - Service type definitions
 *   - SERVICE_STATUS - Service status definitions
 *   - SERVICE_QUALITY - Service quality definitions
 *   - SERVICE_CONTRACT_TERMS - Contract term definitions
 *   - createServiceRelationship() - Create a service relationship
 *   - validateServiceRelationship() - Validate service relationship
 *   - terminateService() - Terminate a service relationship
 *   - promoteServant() - Promote a servant
 *   - adjustServantWages() - Adjust servant wages
 *   - updateServiceQuality() - Update service quality
 *   - recordEmployerSatisfaction() - Record employer satisfaction
 *   - getServiceQuality() - Get service quality
 *   - getServiceBetween() - Get service between two characters
 *   - getServants() - Get all servants of an employer
 *   - getEmployer() - Get employer of a servant
 *   - getActiveService() - Get active service for a character
 *   - getServiceHistory() - Get service history for a character
 *   - generateServiceReference() - Generate service reference letter
 *   - assignServantToDepartment() - Assign servant to department
 *   - getStaffByDepartment() - Get staff by department
 *   - transferServantToHousehold() - Transfer servant to new household
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingService = false;
    var _recordingServiceHistory = false;

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    /**
     * Service types
     */
    var SERVICE_TYPES = {
        HOUSEHOLD_STAFF: { id: 'household_staff', name: 'Household Staff', icon: '⌂', isDomestic: true, baseWage: 5 },
        RETAINER: { id: 'retainer', name: 'Retainer', icon: '⌇', isDomestic: false, baseWage: 15 },
        PERSONAL_ATTENDANT: { id: 'personal_attendant', name: 'Personal Attendant', icon: '⌇', isDomestic: true, baseWage: 10 },
        STEWARD: { id: 'steward', name: 'Steward', icon: '⌇', isDomestic: true, baseWage: 20 },
        MAID: { id: 'maid', name: 'Maid', icon: '⌇', isDomestic: true, baseWage: 6 },
        COOK: { id: 'cook', name: 'Cook', icon: '⌇', isDomestic: true, baseWage: 8 },
        GARDENER: { id: 'gardener', name: 'Gardener', icon: '⌇', isDomestic: true, baseWage: 7 },
        GROOM: { id: 'groom', name: 'Groom', icon: '⌇', isDomestic: true, baseWage: 7 },
        CHAMBERLAIN: { id: 'chamberlain', name: 'Chamberlain', icon: '⌇', isDomestic: true, baseWage: 25 },
        BUTLER: { id: 'butler', name: 'Butler', icon: '⌇', isDomestic: true, baseWage: 22 },
        LADY_MAID: { id: 'lady_maid', name: "Lady's Maid", icon: '⌇', isDomestic: true, baseWage: 12 },
        VALET: { id: 'valet', name: 'Valet', icon: '⌇', isDomestic: true, baseWage: 12 }
    };

    /**
     * Service status
     */
    var SERVICE_STATUS = {
        ACTIVE: 'active',
        ON_LEAVE: 'on_leave',
        TERMINATED: 'terminated',
        RESIGNED: 'resigned',
        PROMOTED: 'promoted',
        TRANSFERRED: 'transferred'
    };

    /**
     * Service quality levels
     */
    var SERVICE_QUALITY = {
        EXCELLENT: { id: 'excellent', name: 'Excellent', modifier: 1.2, minSatisfaction: 90 },
        GOOD: { id: 'good', name: 'Good', modifier: 1.0, minSatisfaction: 70 },
        AVERAGE: { id: 'average', name: 'Average', modifier: 0.9, minSatisfaction: 50 },
        POOR: { id: 'poor', name: 'Poor', modifier: 0.7, minSatisfaction: 30 },
        UNSATISFACTORY: { id: 'unsatisfactory', name: 'Unsatisfactory', modifier: 0.5, minSatisfaction: 0 }
    };

    /**
     * Service contract terms
     */
    var SERVICE_CONTRACT_TERMS = {
        INDEFINITE: { id: 'indefinite', name: 'Indefinite', duration: null, noticePeriod: 30 },
        ANNUAL: { id: 'annual', name: 'Annual', duration: 365, noticePeriod: 30 },
        SEASONAL: { id: 'seasonal', name: 'Seasonal', duration: 90, noticePeriod: 14 },
        TRIAL: { id: 'trial', name: 'Trial Period', duration: 30, noticePeriod: 7 },
        DAY_LABOR: { id: 'day_labor', name: 'Day Labor', duration: 1, noticePeriod: 0 }
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

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 3. STATE AND COMMANDS REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;
    var _economy = window.HouseholdEconomy;

    // =========================================================================
    // 4. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    // =========================================================================
    // 5. RELATIONSHIP SYSTEM WRAPPERS
    // =========================================================================

    function _getRelationshipBetween(idA, idB) {
        if (typeof window.getRelationshipBetween === 'function') {
            return window.getRelationshipBetween(idA, idB);
        }
        return null;
    }

    function _getRelationshipsForCharacter(id, options) {
        if (typeof window.getRelationshipsForCharacter === 'function') {
            return window.getRelationshipsForCharacter(id, options);
        }
        return [];
    }

    function _getAllRelationships() {
        if (typeof window.getAllRelationships === 'function') {
            return window.getAllRelationships();
        }
        return [];
    }

    function _createRelationship(idA, idB, options) {
        if (typeof window.createRelationship === 'function') {
            return window.createRelationship(idA, idB, options);
        }
        return null;
    }

    function _endRelationship(relId, endYear, reason) {
        if (typeof window.endRelationship === 'function') {
            return window.endRelationship(relId, endYear, reason);
        }
        return false;
    }

    function _updateRelationship(relId, updates) {
        if (typeof window.updateRelationship === 'function') {
            return window.updateRelationship(relId, updates);
        }
        return null;
    }

    function _getRelationshipById(relId) {
        if (typeof window.getRelationshipById === 'function') {
            return window.getRelationshipById(relId);
        }
        var allRelationships = _getAllRelationships();
        for (var i = 0; i < allRelationships.length; i++) {
            if (allRelationships[i].id === relId) {
                return allRelationships[i];
            }
        }
        return null;
    }

    // =========================================================================
    // 6. TRUST AND LOYALTY WRAPPERS
    // =========================================================================

    function _modifyTrust(idA, idB, delta, reason) {
        if (typeof window.modifyTrust === 'function') {
            return window.modifyTrust(idA, idB, delta, reason);
        }
        return null;
    }

    function _modifyLoyalty(characterId, targetId, delta, reason) {
        if (typeof window.modifyLoyalty === 'function') {
            return window.modifyLoyalty(characterId, targetId, 'individual', delta, reason);
        }
        return null;
    }

    // =========================================================================
    // 7. HOUSEHOLD HISTORY RECORDING
    // =========================================================================

    function _recordHouseholdChange(characterId, householdId, year, action, reason, options) {
        if (typeof window.recordHouseholdChange === 'function') {
            return window.recordHouseholdChange(characterId, householdId, year, action, reason, options);
        }
        return false;
    }

    // =========================================================================
    // 8. SERVICE RELATIONSHIP MANAGEMENT
    // =========================================================================

    /**
     * Creates a service relationship (employer-employee / master-servant)
     * @param {string} employerId - Employer/master character ID
     * @param {string} servantId - Servant/employee character ID
     * @param {Object} options - Service options
     * @param {string} options.serviceTypeId - Service type ID (default: 'household_staff')
     * @param {number} options.startYear - Start year (default: current)
     * @param {number} options.wage - Wage amount (default: service type base wage)
     * @param {string} options.contractTerm - Contract term ID (default: 'indefinite')
     * @param {string} options.initialQuality - Initial quality (default: 'average')
     * @param {string} options.notes - Notes
     * @param {boolean} options.addToHousehold - Add to household (default: true)
     * @returns {Object|null} Created relationship or null
     */
    function createServiceRelationship(employerId, servantId, options) {
        if (_processingService) {
            return null;
        }
        _processingService = true;

        try {
            options = options || {};

            var employer = _getCharacterById(employerId);
            var servant = _getCharacterById(servantId);

            if (!employer || !servant) return null;
            if (employerId === servantId) return null;

            var serviceTypeId = options.serviceTypeId || 'household_staff';
            var serviceType = SERVICE_TYPES[serviceTypeId.toUpperCase()];
            if (!serviceType) return null;

            var existing = _getRelationshipBetween(employerId, servantId);
            if (existing && existing.status === 'ongoing') return null;

            var startYear = options.startYear || _getCurrentYear();
            var wage = options.wage !== undefined ? options.wage : serviceType.baseWage;

            // Create the service relationship
            var relationship = _createRelationship(employerId, servantId, {
                type: 'service',
                status: 'ongoing',
                startYear: startYear,
                metadata: {
                    serviceTypeId: serviceType.id,
                    serviceTypeName: serviceType.name,
                    wage: wage,
                    contractTerm: options.contractTerm || 'indefinite',
                    quality: options.initialQuality || 'average',
                    employerSatisfaction: 70,
                    servantSatisfaction: 70,
                    notes: options.notes || '',
                    startYear: startYear
                }
            });

            if (relationship) {
                _modifyTrust(servantId, employerId, 15, 'Began service as ' + serviceType.name);
                _modifyLoyalty(servantId, employerId, 10, 'Began service as ' + serviceType.name);

                // Add to household if needed
                var employerHousehold = _state.getCharacterHousehold(employerId);
                if (employerHousehold && options.addToHousehold !== false) {
                    _commands.addMember(employerHousehold.id, servantId, 'staff', {
                        role: serviceType.name,
                        joinedYear: startYear,
                        notes: 'Wage: ' + wage + ' gold' + (options.notes ? ' · ' + options.notes : '')
                    });

                    _recordHouseholdChange(servantId, employerHousehold.id, startYear, 'joined',
                        'Hired as ' + serviceType.name + (wage ? ' (wage: ' + wage + ')' : ''),
                        { newRole: serviceType.name });
                }

                _logEvent('service', 'Service Begun',
                    servant.name + ' began serving ' + employer.name + ' as ' + serviceType.name,
                    [employer, servant]);
                _saveMasterData();

                _showToast(servant.name + ' hired as ' + serviceType.name, 'success');
            }

            return relationship;

        } finally {
            _processingService = false;
        }
    }

    /**
     * Validates if a service relationship can be created
     * @param {string} employerId - Employer/master character ID
     * @param {string} servantId - Servant/employee character ID
     * @param {string} serviceTypeId - Service type ID
     * @returns {Object} Validation result
     */
    function validateServiceRelationship(employerId, servantId, serviceTypeId) {
        var employer = _getCharacterById(employerId);
        var servant = _getCharacterById(servantId);

        if (!employer || !servant) {
            return { valid: false, reason: 'Character not found' };
        }

        if (employerId === servantId) {
            return { valid: false, reason: 'Cannot serve oneself' };
        }

        var serviceType = SERVICE_TYPES[serviceTypeId.toUpperCase()];
        if (!serviceType) {
            return { valid: false, reason: 'Invalid service type' };
        }

        var existing = _getRelationshipBetween(employerId, servantId);
        if (existing && existing.status === 'ongoing') {
            return { valid: false, reason: 'Service relationship already exists' };
        }

        var servantAge = servant.birthYear ? _getCurrentYear() - servant.birthYear : 0;
        if (servantAge < 14) {
            return { valid: false, reason: 'Servant is too young (' + servantAge + ' < 14)' };
        }

        return { valid: true, reason: 'Valid service relationship' };
    }

    /**
     * Terminates a service relationship
     * @param {string} employerId - Employer/master character ID
     * @param {string} servantId - Servant/employee character ID
     * @param {Object} options - Termination options
     * @param {number} options.endYear - End year (default: current)
     * @param {string} options.reason - Termination reason
     * @param {boolean} options.removeFromHousehold - Remove from household (default: true)
     * @param {boolean} options.recordHistory - Record in character history (default: true)
     * @returns {boolean} True if terminated
     */
    function terminateService(employerId, servantId, options) {
        if (_processingService) {
            return false;
        }
        _processingService = true;

        try {
            options = options || {};

            var relationship = _getRelationshipBetween(employerId, servantId);
            if (!relationship || relationship.type !== 'service') return false;

            var endYear = options.endYear || _getCurrentYear();
            var reason = options.reason || 'Service terminated';
            var removeFromHousehold = options.removeFromHousehold !== false;
            var recordHistory = options.recordHistory !== false;

            var result = _endRelationship(relationship.id, endYear, reason);

            if (result) {
                _modifyTrust(servantId, employerId, -10, 'Service ended: ' + reason);

                // Remove from household
                if (removeFromHousehold) {
                    var employerHousehold = _state.getCharacterHousehold(employerId);
                    if (employerHousehold) {
                        _commands.removeMember(employerHousehold.id, servantId, {
                            reason: 'Service terminated: ' + reason,
                            leftYear: endYear,
                            recordHistory: recordHistory
                        });

                        if (recordHistory) {
                            _recordHouseholdChange(servantId, null, endYear, 'left',
                                'Service terminated: ' + reason,
                                { previousHouseholdId: employerHousehold.id, previousHouseholdName: employerHousehold.name });
                        }
                    }
                }

                var employer = _getCharacterById(employerId);
                var servant = _getCharacterById(servantId);

                _logEvent('service', 'Service Ended',
                    (servant ? servant.name : 'Unknown') + ' ended service with ' + (employer ? employer.name : 'Unknown') + ': ' + reason,
                    []);

                _saveMasterData();
                _showToast((servant ? servant.name : 'Unknown') + ' service ended', 'info');
            }

            return result;

        } finally {
            _processingService = false;
        }
    }

    /**
     * Promotes a servant to a higher position
     * @param {string} employerId - Employer/master character ID
     * @param {string} servantId - Servant/employee character ID
     * @param {string} newServiceTypeId - New service type ID
     * @param {Object} options - Promotion options
     * @param {number} options.newWage - New wage (default: service type base wage)
     * @param {number} options.promotionYear - Promotion year (default: current)
     * @param {string} options.notes - Notes
     * @param {boolean} options.updateHouseholdRole - Update household role (default: true)
     * @returns {Object|null} Updated relationship or null
     */
    function promoteServant(employerId, servantId, newServiceTypeId, options) {
        if (_processingService) {
            return null;
        }
        _processingService = true;

        try {
            options = options || {};

            var relationship = _getRelationshipBetween(employerId, servantId);
            if (!relationship || relationship.type !== 'service') return null;

            var newServiceType = SERVICE_TYPES[newServiceTypeId.toUpperCase()];
            if (!newServiceType) return null;

            var newWage = options.newWage !== undefined ? options.newWage : newServiceType.baseWage;
            var promotionYear = options.promotionYear || _getCurrentYear();
            var oldServiceTypeId = relationship.metadata?.serviceTypeId;

            // Update the relationship metadata
            var updated = _updateRelationship(relationship.id, {
                metadata: {
                    ...relationship.metadata,
                    serviceTypeId: newServiceType.id,
                    serviceTypeName: newServiceType.name,
                    wage: newWage,
                    previousServiceTypeId: oldServiceTypeId,
                    promotionYear: promotionYear,
                    promotionNotes: options.notes || ''
                }
            });

            if (updated) {
                _modifyTrust(servantId, employerId, 10, 'Promoted to ' + newServiceType.name);
                _modifyLoyalty(servantId, employerId, 15, 'Promoted to ' + newServiceType.name);

                // Update household role
                if (options.updateHouseholdRole !== false) {
                    var employerHousehold = _state.getCharacterHousehold(employerId);
                    if (employerHousehold) {
                        var members = _commands.getHouseholdMembers(employerHousehold.id);
                        for (var i = 0; i < members.length; i++) {
                            if (members[i].characterId === servantId) {
                                _commands.updateMember(employerHousehold.id, servantId, {
                                    role: newServiceType.name
                                });
                                break;
                            }
                        }

                        _recordHouseholdChange(servantId, employerHousehold.id, promotionYear, 'transferred',
                            'Promoted to ' + newServiceType.name,
                            { newRole: newServiceType.name });
                    }
                }

                var servant = _getCharacterById(servantId);
                _logEvent('service', 'Servant Promoted',
                    (servant ? servant.name : 'Unknown') + ' promoted to ' + newServiceType.name,
                    []);

                _saveMasterData();
                _showToast((servant ? servant.name : 'Unknown') + ' promoted to ' + newServiceType.name, 'success');
            }

            return updated;

        } finally {
            _processingService = false;
        }
    }

    /**
     * Adjusts a servant's wages
     * @param {string} employerId - Employer/master character ID
     * @param {string} servantId - Servant/employee character ID
     * @param {number} newWage - New wage amount
     * @param {string} reason - Reason for adjustment
     * @returns {Object|null} Updated relationship or null
     */
    function adjustServantWages(employerId, servantId, newWage, reason) {
        if (_processingService) {
            return null;
        }
        _processingService = true;

        try {
            var relationship = _getRelationshipBetween(employerId, servantId);
            if (!relationship || relationship.type !== 'service') return null;

            var oldWage = relationship.metadata?.wage || 0;

            var updated = _updateRelationship(relationship.id, {
                metadata: {
                    ...relationship.metadata,
                    wage: newWage,
                    wageAdjustmentReason: reason,
                    wageAdjustmentYear: _getCurrentYear(),
                    previousWage: oldWage
                }
            });

            if (updated) {
                var delta = newWage - oldWage;
                if (delta > 0) {
                    _modifyLoyalty(servantId, employerId, 5, 'Wage increased by ' + delta);
                } else if (delta < 0) {
                    _modifyLoyalty(servantId, employerId, -10, 'Wage decreased by ' + (-delta));
                }

                var servant = _getCharacterById(servantId);
                _logEvent('service', 'Wage Adjusted',
                    (servant ? servant.name : 'Unknown') + ' wage adjusted from ' + oldWage + ' to ' + newWage + ': ' + reason,
                    []);

                _saveMasterData();
                _showToast('Wage adjusted to ' + newWage + ' gold', 'info');
            }

            return updated;

        } finally {
            _processingService = false;
        }
    }

    /**
     * Updates service quality based on satisfaction
     * @param {string} relationshipId - Relationship ID
     * @returns {Object|null} Updated quality or null
     */
    function updateServiceQuality(relationshipId) {
        var relationship = _getRelationshipById(relationshipId);
        if (!relationship || relationship.type !== 'service') return null;

        var employerSat = relationship.metadata?.employerSatisfaction || 70;
        var servantSat = relationship.metadata?.servantSatisfaction || 70;
        var avgSatisfaction = (employerSat + servantSat) / 2;

        var newQuality = 'average';
        for (var key in SERVICE_QUALITY) {
            var quality = SERVICE_QUALITY[key];
            if (avgSatisfaction >= quality.minSatisfaction) {
                newQuality = quality.id;
            }
        }

        if (relationship.metadata?.quality !== newQuality) {
            var updated = _updateRelationship(relationshipId, {
                metadata: {
                    ...relationship.metadata,
                    quality: newQuality,
                    qualityLastUpdated: _getCurrentYear()
                }
            });
            return updated?.metadata?.quality;
        }

        return relationship.metadata?.quality;
    }

    /**
     * Records employer satisfaction
     * @param {string} relationshipId - Relationship ID
     * @param {number} satisfaction - Satisfaction level (0-100)
     * @param {string} reason - Reason for change
     * @returns {Object|null} Updated relationship or null
     */
    function recordEmployerSatisfaction(relationshipId, satisfaction, reason) {
        var relationship = _getRelationshipById(relationshipId);
        if (!relationship) return null;

        var boundedSat = Math.min(100, Math.max(0, satisfaction));

        var history = relationship.metadata?.employerSatisfactionHistory || [];
        history.push({
            year: _getCurrentYear(),
            satisfaction: boundedSat,
            reason: reason
        });
        if (history.length > 20) {
            history = history.slice(-20);
        }

        var updated = _updateRelationship(relationshipId, {
            metadata: {
                ...relationship.metadata,
                employerSatisfaction: boundedSat,
                employerSatisfactionHistory: history
            }
        });

        if (updated) {
            updateServiceQuality(relationshipId);
            _saveMasterData();
        }

        return updated;
    }

    /**
     * Gets the quality of a service relationship
     * @param {string} relationshipId - Relationship ID
     * @returns {Object} Quality object
     */
    function getServiceQuality(relationshipId) {
        var relationship = _getRelationshipById(relationshipId);
        if (!relationship) return SERVICE_QUALITY.AVERAGE;

        var qualityId = relationship.metadata?.quality || 'average';
        var quality = SERVICE_QUALITY[qualityId.toUpperCase()];
        return quality || SERVICE_QUALITY.AVERAGE;
    }

    // =========================================================================
    // 9. SERVICE QUERIES
    // =========================================================================

    /**
     * Gets the service relationship between employer and servant
     * @param {string} employerId - Employer/master character ID
     * @param {string} servantId - Servant/employee character ID
     * @returns {Object|null} Relationship or null
     */
    function getServiceBetween(employerId, servantId) {
        return _getRelationshipBetween(employerId, servantId);
    }

    /**
     * Gets all servants of an employer
     * @param {string} employerId - Employer/master character ID
     * @returns {Array} Array of servant relationships
     */
    function getServants(employerId) {
        var relationships = _getRelationshipsForCharacter(employerId);
        var result = [];
        for (var i = 0; i < relationships.length; i++) {
            var r = relationships[i];
            if (r.type === 'service' && r.status === 'ongoing' && r.participantA === employerId) {
                result.push(r);
            }
        }
        return result;
    }

    /**
     * Gets the employer of a servant
     * @param {string} servantId - Servant/employee character ID
     * @returns {Object|null} Employer relationship or null
     */
    function getEmployer(servantId) {
        var relationships = _getRelationshipsForCharacter(servantId);
        for (var i = 0; i < relationships.length; i++) {
            var r = relationships[i];
            if (r.type === 'service' && r.status === 'ongoing' && r.participantB === servantId) {
                return r;
            }
        }
        return null;
    }

    /**
     * Gets active service for a character (as either employer or servant)
     * @param {string} characterId - Character ID
     * @returns {Array} Array of active service relationships
     */
    function getActiveService(characterId) {
        var relationships = _getRelationshipsForCharacter(characterId);
        var result = [];
        for (var i = 0; i < relationships.length; i++) {
            var r = relationships[i];
            if (r.type === 'service' && r.status === 'ongoing') {
                result.push(r);
            }
        }
        return result;
    }

    /**
     * Gets service history for a character
     * @param {string} characterId - Character ID
     * @returns {Array} Array of service relationships (including ended)
     */
    function getServiceHistory(characterId) {
        var relationships = _getRelationshipsForCharacter(characterId);
        var result = [];
        for (var i = 0; i < relationships.length; i++) {
            if (relationships[i].type === 'service') {
                result.push(relationships[i]);
            }
        }
        return result;
    }

    // =========================================================================
    // 10. SERVICE REFERENCE
    // =========================================================================

    /**
     * Generates a service reference letter for a servant
     * @param {string} employerId - Employer/master character ID
     * @param {string} servantId - Servant/employee character ID
     * @returns {Object} Reference object
     */
    function generateServiceReference(employerId, servantId) {
        var relationship = _getRelationshipBetween(employerId, servantId);
        if (!relationship || relationship.type !== 'service') {
            return { success: false, reason: 'No service relationship found' };
        }

        var employer = _getCharacterById(employerId);
        var servant = _getCharacterById(servantId);
        var quality = getServiceQuality(relationship.id);
        var employerSat = relationship.metadata?.employerSatisfaction || 70;

        var recommendation = '';
        if (employerSat >= 90) recommendation = 'highly recommended';
        else if (employerSat >= 70) recommendation = 'recommended';
        else if (employerSat >= 50) recommendation = 'recommended with reservations';
        else recommendation = 'not recommended';

        var serviceYears = relationship.startYear ? _getCurrentYear() - relationship.startYear : 0;

        return {
            success: true,
            servantName: servant ? servant.name : 'Unknown',
            employerName: employer ? employer.name : 'Unknown',
            serviceType: relationship.metadata?.serviceTypeName,
            serviceYears: serviceYears,
            quality: quality,
            employerSatisfaction: employerSat,
            recommendation: recommendation,
            generatedYear: _getCurrentYear()
        };
    }

    // =========================================================================
    // 11. HOUSEHOLD INTEGRATION
    // =========================================================================

    /**
     * Assigns a servant to a specific household department
     * @param {string} employerId - Employer/master character ID
     * @param {string} servantId - Servant/employee character ID
     * @param {string} departmentId - Department ID
     * @returns {boolean} True if assigned
     */
    function assignServantToDepartment(employerId, servantId, departmentId) {
        var employerHousehold = _state.getCharacterHousehold(employerId);
        if (!employerHousehold) return false;

        var result = _commands.updateMember(employerHousehold.id, servantId, {
            departmentId: departmentId
        });

        if (result && result.success) {
            var servant = _getCharacterById(servantId);
            var department = null;
            var departments = _state.getDepartments(employerHousehold.id);
            for (var i = 0; i < departments.length; i++) {
                if (departments[i].id === departmentId) {
                    department = departments[i];
                    break;
                }
            }
            _showToast((servant ? servant.name : 'Unknown') + ' assigned to ' + (department ? department.name : 'department'), 'success');
            return true;
        }

        return false;
    }

    /**
     * Gets staff by department for a household
     * @param {string} employerId - Employer/master character ID
     * @param {string} departmentId - Department ID
     * @returns {Array} Array of servant relationships
     */
    function getStaffByDepartment(employerId, departmentId) {
        var employerHousehold = _state.getCharacterHousehold(employerId);
        if (!employerHousehold) return [];

        var servants = getServants(employerId);
        var servantIds = {};
        for (var i = 0; i < servants.length; i++) {
            servantIds[servants[i].participantB] = true;
        }

        var members = _state.getHouseholdMembers(employerHousehold.id);
        var result = [];

        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            if (m.departmentId === departmentId && servantIds[m.characterId]) {
                var char = _getCharacterById(m.characterId);
                if (char) {
                    result.push({
                        character: char,
                        member: m,
                        relationship: getServiceBetween(employerId, m.characterId)
                    });
                }
            }
        }

        return result;
    }

    /**
     * Transfers a servant to another household
     * @param {string} currentEmployerId - Current employer
     * @param {string} servantId - Servant ID
     * @param {string} newEmployerId - New employer ID
     * @param {Object} options - Transfer options
     * @param {number} options.transferYear - Transfer year (default: current)
     * @param {number} options.newWage - New wage (default: existing wage)
     * @param {string} options.notes - Notes
     * @returns {Object|null} New service relationship or null
     */
    function transferServantToHousehold(currentEmployerId, servantId, newEmployerId, options) {
        if (_processingService) {
            return null;
        }
        _processingService = true;

        try {
            options = options || {};

            var servant = _getCharacterById(servantId);
            var currentEmployer = _getCharacterById(currentEmployerId);
            var newEmployer = _getCharacterById(newEmployerId);

            if (!servant || !currentEmployer || !newEmployer) return null;

            var oldRelationship = getServiceBetween(currentEmployerId, servantId);
            if (!oldRelationship) return null;

            var transferYear = options.transferYear || _getCurrentYear();
            var serviceTypeId = oldRelationship.metadata?.serviceTypeId || 'household_staff';
            var oldWage = oldRelationship.metadata?.wage || 0;
            var newWage = options.newWage !== undefined ? options.newWage : oldWage;

            // Record leaving current household
            var oldHousehold = _state.getCharacterHousehold(currentEmployerId);
            if (oldHousehold) {
                _recordHouseholdChange(servantId, null, transferYear, 'left',
                    'Service transferred to ' + newEmployer.name,
                    { previousHouseholdId: oldHousehold.id, previousHouseholdName: oldHousehold.name });
            }

            // Terminate current service
            var terminated = terminateService(currentEmployerId, servantId, {
                endYear: transferYear,
                reason: 'Transferred to ' + newEmployer.name + "'s household",
                removeFromHousehold: true,
                recordHistory: false
            });

            if (!terminated) return null;

            // Create new service
            var newRelationship = createServiceRelationship(newEmployerId, servantId, {
                serviceTypeId: serviceTypeId,
                wage: newWage,
                startYear: transferYear,
                notes: options.notes || 'Transferred from ' + currentEmployer.name + "'s household",
                addToHousehold: true
            });

            if (newRelationship) {
                var servantName = servant.name || 'Unknown';
                _showToast(servantName + ' transferred to ' + newEmployer.name + "'s household", 'success');
            }

            return newRelationship;

        } finally {
            _processingService = false;
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    // Constants
    window.SERVICE_TYPES = SERVICE_TYPES;
    window.SERVICE_STATUS = SERVICE_STATUS;
    window.SERVICE_QUALITY = SERVICE_QUALITY;
    window.SERVICE_CONTRACT_TERMS = SERVICE_CONTRACT_TERMS;

    // Service management
    window.HouseholdServant = {
        // Constants
        SERVICE_TYPES: SERVICE_TYPES,
        SERVICE_STATUS: SERVICE_STATUS,
        SERVICE_QUALITY: SERVICE_QUALITY,
        SERVICE_CONTRACT_TERMS: SERVICE_CONTRACT_TERMS,

        // Service management
        createServiceRelationship: createServiceRelationship,
        validateServiceRelationship: validateServiceRelationship,
        terminateService: terminateService,
        promoteServant: promoteServant,
        adjustServantWages: adjustServantWages,

        // Service quality
        updateServiceQuality: updateServiceQuality,
        recordEmployerSatisfaction: recordEmployerSatisfaction,
        getServiceQuality: getServiceQuality,

        // Service queries
        getServiceBetween: getServiceBetween,
        getServants: getServants,
        getEmployer: getEmployer,
        getActiveService: getActiveService,
        getServiceHistory: getServiceHistory,

        // Service reference
        generateServiceReference: generateServiceReference,

        // Household integration
        assignServantToDepartment: assignServantToDepartment,
        getStaffByDepartment: getStaffByDepartment,
        transferServantToHousehold: transferServantToHousehold
    };

    // Legacy aliases for backward compatibility
    window.createServiceRelationship = createServiceRelationship;
    window.validateServiceRelationship = validateServiceRelationship;
    window.terminateService = terminateService;
    window.promoteServant = promoteServant;
    window.adjustServantWages = adjustServantWages;
    window.updateServiceQuality = updateServiceQuality;
    window.recordEmployerSatisfaction = recordEmployerSatisfaction;
    window.getServiceQuality = getServiceQuality;
    window.getServiceBetween = getServiceBetween;
    window.getServants = getServants;
    window.getEmployer = getEmployer;
    window.getActiveService = getActiveService;
    window.getServiceHistory = getServiceHistory;
    window.generateServiceReference = generateServiceReference;
    window.assignServantToDepartment = assignServantToDepartment;
    window.getStaffByDepartment = getStaffByDepartment;
    window.transferServantToHousehold = transferServantToHousehold;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            SERVICE_TYPES: SERVICE_TYPES,
            SERVICE_STATUS: SERVICE_STATUS,
            SERVICE_QUALITY: SERVICE_QUALITY,
            SERVICE_CONTRACT_TERMS: SERVICE_CONTRACT_TERMS,
            createServiceRelationship: createServiceRelationship,
            validateServiceRelationship: validateServiceRelationship,
            terminateService: terminateService,
            promoteServant: promoteServant,
            adjustServantWages: adjustServantWages,
            updateServiceQuality: updateServiceQuality,
            recordEmployerSatisfaction: recordEmployerSatisfaction,
            getServiceQuality: getServiceQuality,
            getServiceBetween: getServiceBetween,
            getServants: getServants,
            getEmployer: getEmployer,
            getActiveService: getActiveService,
            getServiceHistory: getServiceHistory,
            generateServiceReference: generateServiceReference,
            assignServantToDepartment: assignServantToDepartment,
            getStaffByDepartment: getStaffByDepartment,
            transferServantToHousehold: transferServantToHousehold
        };
    }

})();