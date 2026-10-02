/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD SERVANT (household-servant.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/household-servant.js
 * 
 * PURPOSE
 * -------
 * Service relationship domain: master-servant / employer-employee
 * contracts, quality tracking, promotion, termination, and household
 * staff integration.
 * 
 * OWNERSHIP MODEL
 * ---------------
 * This module does NOT own the canonical service relationship. The
 * relationship system owns it (via createRelationship / endRelationship /
 * updateRelationship on window).
 * 
 * This module does NOT own household membership. HouseholdCommands does.
 * 
 * This module ORCHESTRATES between them:
 * 
 *   createServiceRelationship()
 *       ↓ validates
 *       ↓ creates canonical relationship (RelationshipCommands)
 *       ↓ adds household membership (HouseholdCommands)
 *       ↓ applies trust / loyalty consequences
 * 
 * Everything it does is either:
 *   - a pure projection (query)
 *   - a coordinated sequence of other systems' commands
 * 
 * WHAT LIVES HERE
 * ---------------
 *   - SERVICE_TYPES / SERVICE_STATUS / SERVICE_QUALITY catalogs
 *   - createServiceRelationship (orchestration)
 *   - terminateService (orchestration)
 *   - promoteServant (metadata update)
 *   - adjustServantWages (metadata update)
 *   - recordEmployerSatisfaction (metadata update)
 *   - updateServiceQuality (pure calculation + metadata update)
 *   - getServiceBetween / getServants / getEmployer / getActiveService
 *   - getServiceHistory / getServiceQuality / generateServiceReference
 *   - getStaffByDepartment (composition query)
 *   - transferServantToHousehold (orchestration with rollback intent)
 * 
 * WHAT DOES NOT LIVE HERE
 * -----------------------
 *   - Canonical relationship storage   → Relationship system
 *   - Household membership             → HouseholdCommands
 *   - Trust / loyalty effects          → Trust system / Loyalty system
 *   - Wages                            → HouseholdEconomy (see NOTE below)
 *   - Toasts / presentation            → UI layer
 * 
 * NOTE ON WAGES
 * -------------
 * SERVICE_TYPES.baseWage is retained here as a *suggested* default only.
 * The actual economic authority for wages belongs to HouseholdEconomy.
 * Callers that care about economics should ask HouseholdEconomy for wage
 * policy, not read baseWage directly. This is documented but not enforced
 * because splitting the constant table right now would be premature.
 * 
 * CONTRACT
 * --------
 *   - No _processingService guard.
 *   - No _recordingServiceHistory dead code.
 *   - No 1250 fallback.
 *   - Required dependencies fail loudly.
 *   - No toasts.
 *   - No direct state mutation.
 *   - Every command returns { success, data } / { success: false, code, reason }.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. CONSTANTS
    // =========================================================================

    var SERVICE_TYPES = {
        HOUSEHOLD_STAFF:    { id: 'household_staff',    name: 'Household Staff',    isDomestic: true,  baseWage: 5  },
        RETAINER:           { id: 'retainer',           name: 'Retainer',           isDomestic: false, baseWage: 15 },
        PERSONAL_ATTENDANT: { id: 'personal_attendant', name: 'Personal Attendant', isDomestic: true,  baseWage: 10 },
        STEWARD:            { id: 'steward',            name: 'Steward',            isDomestic: true,  baseWage: 20 },
        MAID:               { id: 'maid',               name: 'Maid',               isDomestic: true,  baseWage: 6  },
        COOK:               { id: 'cook',               name: 'Cook',               isDomestic: true,  baseWage: 8  },
        GARDENER:           { id: 'gardener',           name: 'Gardener',           isDomestic: true,  baseWage: 7  },
        GROOM:              { id: 'groom',              name: 'Groom',              isDomestic: true,  baseWage: 7  },
        CHAMBERLAIN:        { id: 'chamberlain',        name: 'Chamberlain',        isDomestic: true,  baseWage: 25 },
        BUTLER:             { id: 'butler',             name: 'Butler',             isDomestic: true,  baseWage: 22 },
        LADY_MAID:          { id: 'lady_maid',          name: "Lady's Maid",        isDomestic: true,  baseWage: 12 },
        VALET:              { id: 'valet',              name: 'Valet',              isDomestic: true,  baseWage: 12 }
    };

    // SERVICE_STATUS describes SERVICE LIFECYCLE, distinct from the
    // relationship system's own status vocabulary. Only ACTIVE / ON_LEAVE /
    // TERMINATED / RESIGNED are lifecycle states. PROMOTED / TRANSFERRED
    // are events, not states — they are recorded in history, not here.
    var SERVICE_STATUS = {
        ACTIVE:     'active',
        ON_LEAVE:   'on_leave',
        TERMINATED: 'terminated',
        RESIGNED:   'resigned'
    };

    var SERVICE_QUALITY = {
        EXCELLENT:      { id: 'excellent',      name: 'Excellent',      minSatisfaction: 90 },
        GOOD:           { id: 'good',           name: 'Good',           minSatisfaction: 70 },
        AVERAGE:        { id: 'average',        name: 'Average',        minSatisfaction: 50 },
        POOR:           { id: 'poor',           name: 'Poor',           minSatisfaction: 30 },
        UNSATISFACTORY: { id: 'unsatisfactory', name: 'Unsatisfactory', minSatisfaction: 0  }
    };

    // Ordered quality thresholds — policy, not property-order dependency.
    var SERVICE_QUALITY_ORDER = [
        SERVICE_QUALITY.EXCELLENT,
        SERVICE_QUALITY.GOOD,
        SERVICE_QUALITY.AVERAGE,
        SERVICE_QUALITY.POOR,
        SERVICE_QUALITY.UNSATISFACTORY
    ];

    var SERVICE_CONTRACT_TERMS = {
        INDEFINITE: { id: 'indefinite', name: 'Indefinite',  duration: null, noticePeriod: 30 },
        ANNUAL:     { id: 'annual',     name: 'Annual',      duration: 365,  noticePeriod: 30 },
        SEASONAL:   { id: 'seasonal',   name: 'Seasonal',    duration: 90,   noticePeriod: 14 },
        TRIAL:      { id: 'trial',      name: 'Trial Period', duration: 30,  noticePeriod: 7  },
        DAY_LABOR:  { id: 'day_labor',  name: 'Day Labor',   duration: 1,    noticePeriod: 0  }
    };

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('HouseholdServant: getCharacterById is required');
        }
        return window.getCharacterById(id);
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('HouseholdServant: getCurrentYearSafe is required');
        }
        return window.getCurrentYearSafe();
    }

    function _householdCommands() {
        if (typeof window.HouseholdCommands === 'undefined') {
            throw new Error('HouseholdServant: HouseholdCommands is required');
        }
        return window.HouseholdCommands;
    }

    function _householdQueries() {
        if (typeof window.HouseholdQueries === 'undefined') {
            throw new Error('HouseholdServant: HouseholdQueries is required');
        }
        return window.HouseholdQueries;
    }

    // ---- Relationship system (required) ----
    function _createRelationship(a, b, opts) {
        if (typeof window.createRelationship !== 'function') {
            throw new Error('HouseholdServant: createRelationship is required');
        }
        return window.createRelationship(a, b, opts);
    }
    function _endRelationship(id, year, reason) {
        if (typeof window.endRelationship !== 'function') {
            throw new Error('HouseholdServant: endRelationship is required');
        }
        return window.endRelationship(id, year, reason);
    }
    function _updateRelationship(id, updates) {
        if (typeof window.updateRelationship !== 'function') {
            throw new Error('HouseholdServant: updateRelationship is required');
        }
        return window.updateRelationship(id, updates);
    }
    function _getRelationshipBetween(a, b) {
        if (typeof window.getRelationshipBetween !== 'function') {
            throw new Error('HouseholdServant: getRelationshipBetween is required');
        }
        return window.getRelationshipBetween(a, b);
    }
    function _getRelationshipsForCharacter(id, options) {
        if (typeof window.getRelationshipsForCharacter !== 'function') {
            throw new Error('HouseholdServant: getRelationshipsForCharacter is required');
        }
        return window.getRelationshipsForCharacter(id, options);
    }
    function _getRelationshipById(id) {
        if (typeof window.getRelationshipById !== 'function') {
            throw new Error('HouseholdServant: getRelationshipById is required');
        }
        return window.getRelationshipById(id);
    }

    // ---- Trust / loyalty (optional, effect-only) ----
    function _modifyTrust(a, b, delta, reason) {
        if (typeof window.modifyTrust === 'function') {
            window.modifyTrust(a, b, delta, reason);
        }
    }
    function _modifyLoyalty(id, targetId, delta, reason) {
        if (typeof window.modifyLoyalty === 'function') {
            window.modifyLoyalty(id, targetId, 'individual', delta, reason);
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        return { success: true, data: data === undefined ? null : data };
    }
    function _fail(code, reason) {
        return { success: false, code: code, reason: reason || code };
    }
    function _resolveYear(value) {
        if (value === undefined || value === null) return _currentYear();
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return value;
    }

    // =========================================================================
    // 3. PURE CALCULATIONS
    // =========================================================================

    /**
     * Returns the SERVICE_QUALITY tier whose threshold is the highest one
     * <= averageSatisfaction. Pure and order-independent.
     */
    function calculateServiceQuality(employerSatisfaction, servantSatisfaction) {
        var e = typeof employerSatisfaction === 'number' ? employerSatisfaction : 70;
        var s = typeof servantSatisfaction === 'number' ? servantSatisfaction : 70;
        var avg = (e + s) / 2;

        for (var i = 0; i < SERVICE_QUALITY_ORDER.length; i++) {
            if (avg >= SERVICE_QUALITY_ORDER[i].minSatisfaction) {
                return SERVICE_QUALITY_ORDER[i];
            }
        }
        return SERVICE_QUALITY.UNSATISFACTORY;
    }

    /**
     * Recommendation from satisfaction. Pure.
     */
    function calculateRecommendation(satisfaction) {
        if (satisfaction >= 90) return 'highly recommended';
        if (satisfaction >= 70) return 'recommended';
        if (satisfaction >= 50) return 'recommended with reservations';
        return 'not recommended';
    }

    // =========================================================================
    // 4. RELATIONSHIP PROJECTIONS (defensive snapshots)
    // =========================================================================

    function _snapshotRelationship(rel) {
        if (!rel) return null;
        return {
            id: rel.id,
            type: rel.type,
            status: rel.status,
            participantA: rel.participantA,
            participantB: rel.participantB,
            startYear: rel.startYear,
            endYear: rel.endYear !== undefined ? rel.endYear : null,
            metadata: rel.metadata ? JSON.parse(JSON.stringify(rel.metadata)) : null
        };
    }

    function _isActiveService(rel) {
        return rel && rel.type === 'service' && rel.status === 'ongoing';
    }

    // =========================================================================
    // 5. SERVICE RELATIONSHIP COMMANDS
    // =========================================================================

    /**
     * Creates a service relationship between an employer and a servant.
     * 
     * Orchestrates:
     *   1. Validate
     *   2. Create canonical relationship (Relationship system)
     *   3. Add household membership (HouseholdCommands)
     *   4. Apply trust / loyalty effects
     * 
     * If step 3 fails, we attempt to roll back step 2.
     * 
     * Returns:
     *   { success: true, data: { relationshipId, householdId } }
     *   { success: false, code, reason }
     */
    function createServiceRelationship(employerId, servantId, options) {
        options = options || {};

        var employer = _getCharacterById(employerId);
        var servant = _getCharacterById(servantId);
        if (!employer) return _fail('EMPLOYER_NOT_FOUND', 'Employer character not found');
        if (!servant) return _fail('SERVANT_NOT_FOUND', 'Servant character not found');
        if (employerId === servantId) {
            return _fail('SELF_SERVICE', 'Character cannot serve themselves');
        }
        if (servant.isDeceased) {
            return _fail('SERVANT_DECEASED', 'Servant is deceased');
        }

        var serviceTypeId = (options.serviceTypeId || 'household_staff').toUpperCase();
        var serviceType = SERVICE_TYPES[serviceTypeId];
        if (!serviceType) return _fail('INVALID_SERVICE_TYPE', 'Unknown service type');

        var existing = _getRelationshipBetween(employerId, servantId);
        if (existing && existing.type === 'service' && existing.status === 'ongoing') {
            return _fail('ALREADY_SERVING', 'Service relationship already exists');
        }

        var startYear = _resolveYear(options.startYear);
        if (startYear === null) return _fail('INVALID_YEAR', 'Invalid start year');

        var wage = options.wage !== undefined ? options.wage : serviceType.baseWage;
        if (typeof wage !== 'number' || !isFinite(wage) || wage < 0) {
            return _fail('INVALID_WAGE', 'Wage must be a non-negative number');
        }

        // Step 1: create canonical relationship
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
                notes: options.notes || ''
            }
        });

        if (!relationship) {
            return _fail('RELATIONSHIP_CREATE_FAILED', 'Failed to create service relationship');
        }

        // Step 2: household membership (unless opted out)
        var householdId = null;
        if (options.addToHousehold !== false) {
            var employerHousehold = _householdQueries().getCharacterHousehold(employerId);
            if (employerHousehold) {
                var addResult = _householdCommands().addMember(
                    employerHousehold.id,
                    servantId,
                    'staff',
                    {
                        role: serviceType.name,
                        joinedYear: startYear,
                        notes: 'Wage: ' + wage + ' gold' +
                            (options.notes ? ' · ' + options.notes : '')
                    }
                );

                if (!addResult.success) {
                    // Roll back relationship
                    try {
                        _endRelationship(relationship.id, startYear,
                            'Rollback: household membership failed');
                    } catch (e) { /* best-effort */ }
                    return _fail('HOUSEHOLD_ADD_FAILED',
                        'Failed to add to employer household: ' + addResult.reason);
                }
                householdId = employerHousehold.id;
            }
        }

        // Step 3: domain consequences
        _modifyTrust(servantId, employerId, 15,
            'Began service as ' + serviceType.name);
        _modifyLoyalty(servantId, employerId, 10,
            'Began service as ' + serviceType.name);

        _logEvent('service', 'Service Begun',
            servant.name + ' began serving ' + employer.name + ' as ' + serviceType.name,
            [employer, servant]);

        return _ok({
            relationshipId: relationship.id,
            householdId: householdId,
            serviceTypeId: serviceType.id,
            wage: wage,
            startYear: startYear
        });
    }

    /**
     * Terminates a service relationship.
     * 
     * Orchestrates:
     *   1. Find relationship
     *   2. End canonical relationship
     *   3. Remove household membership (unless opted out)
     *   4. Apply trust consequence
     */
    function terminateService(employerId, servantId, options) {
        options = options || {};

        var relationship = _getRelationshipBetween(employerId, servantId);
        if (!relationship || relationship.type !== 'service' ||
            relationship.status !== 'ongoing') {
            return _fail('NO_SERVICE', 'No active service relationship found');
        }

        var endYear = _resolveYear(options.endYear);
        if (endYear === null) return _fail('INVALID_YEAR', 'Invalid end year');
        var reason = options.reason || 'Service terminated';

        // End canonical relationship
        var ended = _endRelationship(relationship.id, endYear, reason);
        if (!ended) {
            return _fail('END_FAILED', 'Failed to end service relationship');
        }

        // Remove household membership
        if (options.removeFromHousehold !== false) {
            var employerHousehold = _householdQueries().getCharacterHousehold(employerId);
            if (employerHousehold) {
                _householdCommands().removeMember(employerHousehold.id, servantId, {
                    reason: 'Service terminated: ' + reason,
                    leftYear: endYear,
                    recordHistory: options.recordHistory !== false
                });
            }
        }

        _modifyTrust(servantId, employerId, -10, 'Service ended: ' + reason);

        var employer = _getCharacterById(employerId);
        var servant = _getCharacterById(servantId);

        _logEvent('service', 'Service Ended',
            (servant ? servant.name : 'Unknown') + ' ended service with ' +
            (employer ? employer.name : 'Unknown') + ': ' + reason,
            []);

        return _ok({
            relationshipId: relationship.id,
            endYear: endYear,
            reason: reason
        });
    }

    /**
     * Promotes a servant to a new service type.
     * 
     * Records promotion as a metadata change + history, not as a
     * household transfer.
     */
    function promoteServant(employerId, servantId, newServiceTypeId, options) {
        options = options || {};

        var relationship = _getRelationshipBetween(employerId, servantId);
        if (!relationship || relationship.type !== 'service' ||
            relationship.status !== 'ongoing') {
            return _fail('NO_SERVICE', 'No active service relationship found');
        }

        var newType = SERVICE_TYPES[String(newServiceTypeId || '').toUpperCase()];
        if (!newType) return _fail('INVALID_SERVICE_TYPE', 'Unknown service type');

        var promotionYear = _resolveYear(options.promotionYear);
        if (promotionYear === null) return _fail('INVALID_YEAR', 'Invalid promotion year');

        var newWage = options.newWage !== undefined ? options.newWage : newType.baseWage;
        if (typeof newWage !== 'number' || !isFinite(newWage) || newWage < 0) {
            return _fail('INVALID_WAGE', 'Wage must be a non-negative number');
        }

        var metadata = relationship.metadata || {};
        var updatedMetadata = JSON.parse(JSON.stringify(metadata));
        updatedMetadata.previousServiceTypeId = metadata.serviceTypeId || null;
        updatedMetadata.serviceTypeId = newType.id;
        updatedMetadata.serviceTypeName = newType.name;
        updatedMetadata.wage = newWage;
        updatedMetadata.promotionYear = promotionYear;
        updatedMetadata.promotionNotes = options.notes || '';

        var updated = _updateRelationship(relationship.id, { metadata: updatedMetadata });
        if (!updated) return _fail('UPDATE_FAILED', 'Failed to update service relationship');

        _modifyTrust(servantId, employerId, 10, 'Promoted to ' + newType.name);
        _modifyLoyalty(servantId, employerId, 15, 'Promoted to ' + newType.name);

        // Update household role
        if (options.updateHouseholdRole !== false) {
            var employerHousehold = _householdQueries().getCharacterHousehold(employerId);
            if (employerHousehold) {
                _householdCommands().updateMember(employerHousehold.id, servantId, {
                    role: newType.name
                });
            }
        }

        var servant = _getCharacterById(servantId);
        _logEvent('service', 'Servant Promoted',
            (servant ? servant.name : 'Unknown') + ' promoted to ' + newType.name,
            []);

        return _ok({
            relationshipId: relationship.id,
            newServiceTypeId: newType.id,
            newWage: newWage,
            year: promotionYear
        });
    }

    function adjustServantWages(employerId, servantId, newWage, reason) {
        if (typeof newWage !== 'number' || !isFinite(newWage) || newWage < 0) {
            return _fail('INVALID_WAGE', 'Wage must be a non-negative number');
        }

        var relationship = _getRelationshipBetween(employerId, servantId);
        if (!relationship || relationship.type !== 'service' ||
            relationship.status !== 'ongoing') {
            return _fail('NO_SERVICE', 'No active service relationship found');
        }

        var metadata = relationship.metadata || {};
        var oldWage = typeof metadata.wage === 'number' ? metadata.wage : 0;

        var updatedMetadata = JSON.parse(JSON.stringify(metadata));
        updatedMetadata.wage = newWage;
        updatedMetadata.previousWage = oldWage;
        updatedMetadata.wageAdjustmentYear = _currentYear();
        updatedMetadata.wageAdjustmentReason = reason || 'Adjustment';

        var updated = _updateRelationship(relationship.id, { metadata: updatedMetadata });
        if (!updated) return _fail('UPDATE_FAILED', 'Failed to update wage');

        var delta = newWage - oldWage;
        if (delta > 0) {
            _modifyLoyalty(servantId, employerId, 5, 'Wage increased by ' + delta);
        } else if (delta < 0) {
            _modifyLoyalty(servantId, employerId, -10, 'Wage decreased by ' + (-delta));
        }

        return _ok({
            relationshipId: relationship.id,
            oldWage: oldWage,
            newWage: newWage
        });
    }

    /**
     * Records employer satisfaction.
     * 
     * Does NOT mutate a live relationship metadata object — constructs a
     * new array and passes it via the canonical relationship update API.
     */
    function recordEmployerSatisfaction(relationshipId, satisfaction, reason) {
        if (typeof satisfaction !== 'number' || !isFinite(satisfaction)) {
            return _fail('INVALID_SATISFACTION', 'Satisfaction must be a finite number');
        }

        var relationship = _getRelationshipById(relationshipId);
        if (!relationship || relationship.type !== 'service') {
            return _fail('NO_SERVICE', 'Service relationship not found');
        }

        var bounded = Math.max(0, Math.min(100, satisfaction));
        var metadata = relationship.metadata || {};
        var history = Array.isArray(metadata.employerSatisfactionHistory)
            ? metadata.employerSatisfactionHistory.slice()
            : [];

        history.push({
            year: _currentYear(),
            satisfaction: bounded,
            reason: reason || null
        });
        if (history.length > 20) history = history.slice(-20);

        var updatedMetadata = JSON.parse(JSON.stringify(metadata));
        updatedMetadata.employerSatisfaction = bounded;
        updatedMetadata.employerSatisfactionHistory = history;

        var updated = _updateRelationship(relationshipId, { metadata: updatedMetadata });
        if (!updated) return _fail('UPDATE_FAILED', 'Failed to record satisfaction');

        // Recalculate quality
        updateServiceQuality(relationshipId);

        return _ok({ relationshipId: relationshipId, satisfaction: bounded });
    }

    /**
     * Recomputes the service quality tier from current satisfaction values.
     * Returns the updated quality tier.
     */
    function updateServiceQuality(relationshipId) {
        var relationship = _getRelationshipById(relationshipId);
        if (!relationship || relationship.type !== 'service') return null;

        var metadata = relationship.metadata || {};
        var quality = calculateServiceQuality(
            metadata.employerSatisfaction,
            metadata.servantSatisfaction
        );

        if (metadata.quality !== quality.id) {
            var updatedMetadata = JSON.parse(JSON.stringify(metadata));
            updatedMetadata.quality = quality.id;
            updatedMetadata.qualityLastUpdated = _currentYear();
            var updated = _updateRelationship(relationshipId, {
                metadata: updatedMetadata
            });
            if (!updated) return quality.id;
        }

        return quality.id;
    }

    // =========================================================================
    // 6. SERVICE QUERIES (defensive snapshots)
    // =========================================================================

    function getServiceBetween(employerId, servantId) {
        return _snapshotRelationship(_getRelationshipBetween(employerId, servantId));
    }

    function getServants(employerId) {
        var rels = _getRelationshipsForCharacter(employerId);
        var result = [];
        for (var i = 0; i < rels.length; i++) {
            var r = rels[i];
            if (r.type === 'service' && r.status === 'ongoing' &&
                r.participantA === employerId) {
                result.push(_snapshotRelationship(r));
            }
        }
        return result;
    }

    function getEmployer(servantId) {
        var rels = _getRelationshipsForCharacter(servantId);
        for (var i = 0; i < rels.length; i++) {
            var r = rels[i];
            if (r.type === 'service' && r.status === 'ongoing' &&
                r.participantB === servantId) {
                return _snapshotRelationship(r);
            }
        }
        return null;
    }

    function getActiveService(characterId) {
        var rels = _getRelationshipsForCharacter(characterId);
        var result = [];
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].type === 'service' && rels[i].status === 'ongoing') {
                result.push(_snapshotRelationship(rels[i]));
            }
        }
        return result;
    }

    function getServiceHistory(characterId) {
        var rels = _getRelationshipsForCharacter(characterId);
        var result = [];
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].type === 'service') {
                result.push(_snapshotRelationship(rels[i]));
            }
        }
        return result;
    }

    function getServiceQuality(relationshipId) {
        var relationship = _getRelationshipById(relationshipId);
        if (!relationship) return null;
        var metadata = relationship.metadata || {};
        var qualityId = metadata.quality || 'average';
        // Lookup by id — no property-order dependency
        for (var i = 0; i < SERVICE_QUALITY_ORDER.length; i++) {
            if (SERVICE_QUALITY_ORDER[i].id === qualityId) {
                return SERVICE_QUALITY_ORDER[i];
            }
        }
        return SERVICE_QUALITY.AVERAGE;
    }

    /**
     * Generates a service reference for a servant.
     * This is a projection, not a mutation.
     */
    function generateServiceReference(employerId, servantId) {
        var relationship = _getRelationshipBetween(employerId, servantId);
        if (!relationship || relationship.type !== 'service') {
            return _fail('NO_SERVICE', 'No service relationship found');
        }

        var employer = _getCharacterById(employerId);
        var servant = _getCharacterById(servantId);
        var quality = getServiceQuality(relationship.id);
        var metadata = relationship.metadata || {};

        var employerSat = typeof metadata.employerSatisfaction === 'number'
            ? metadata.employerSatisfaction : 70;

        var serviceYears = (relationship.startYear && relationship.endYear)
            ? relationship.endYear - relationship.startYear
            : (relationship.startYear
                ? _currentYear() - relationship.startYear
                : 0);

        return _ok({
            servantName: servant ? servant.name : 'Unknown',
            employerName: employer ? employer.name : 'Unknown',
            serviceType: metadata.serviceTypeName || null,
            serviceYears: serviceYears,
            qualityId: quality ? quality.id : null,
            qualityName: quality ? quality.name : null,
            employerSatisfaction: employerSat,
            recommendation: calculateRecommendation(employerSat),
            generatedYear: _currentYear()
        });
    }

    /**
     * Returns staff grouped by department for a household.
     * Composes HouseholdQueries + service query.
     */
    function getStaffByDepartment(employerId, departmentId) {
        var employerHousehold = _householdQueries().getCharacterHousehold(employerId);
        if (!employerHousehold) return [];

        var staff = _householdQueries().getHouseholdStaff(employerHousehold.id, {
            departmentId: departmentId,
            activeOnly: true
        });

        var result = [];
        for (var i = 0; i < staff.length; i++) {
            var s = staff[i];
            result.push({
                characterId: s.characterId,
                characterName: s.characterName,
                character: s.character,
                role: s.role,
                departmentId: s.departmentId,
                service: getServiceBetween(employerId, s.characterId),
                assignments: s.assignments
            });
        }
        return result;
    }

    // =========================================================================
    // 7. HOUSEHOLD INTEGRATION
    // =========================================================================

    /**
     * Assigns a servant to a department.
     * 
     * This is fundamentally a household member update, not a service
     * command. Delegates to HouseholdCommands.updateMember. Validates that
     * the servant currently serves the employer first.
     */
    function assignServantToDepartment(employerId, servantId, departmentId) {
        var service = _getRelationshipBetween(employerId, servantId);
        if (!service || service.type !== 'service' || service.status !== 'ongoing') {
            return _fail('NO_SERVICE', 'Character is not an active servant');
        }

        var household = _householdQueries().getCharacterHousehold(employerId);
        if (!household) return _fail('NO_HOUSEHOLD', 'Employer has no household');

        var result = _householdCommands().updateMember(household.id, servantId, {
            departmentId: departmentId
        });
        if (!result.success) return result;

        return _ok({
            householdId: household.id,
            characterId: servantId,
            departmentId: departmentId
        });
    }

    /**
     * Transfers a servant to a new employer.
     * 
     * Order:
     *   1. Validate
     *   2. Create new relationship FIRST (so failure leaves old intact)
     *   3. Terminate old relationship
     *   4. Update household memberships (old -> new)
     * 
     * This ordering means a failure during step 2 leaves the original
     * service completely untouched. A failure during step 3 means the
     * servant is temporarily double-served — recoverable.
     */
    function transferServantToHousehold(currentEmployerId, servantId, newEmployerId, options) {
        options = options || {};

        var servant = _getCharacterById(servantId);
        var currentEmployer = _getCharacterById(currentEmployerId);
        var newEmployer = _getCharacterById(newEmployerId);
        if (!servant) return _fail('SERVANT_NOT_FOUND', 'Servant character not found');
        if (!currentEmployer) return _fail('EMPLOYER_NOT_FOUND', 'Current employer not found');
        if (!newEmployer) return _fail('EMPLOYER_NOT_FOUND', 'New employer not found');
        if (currentEmployerId === newEmployerId) {
            return _fail('SAME_EMPLOYER', 'New employer is same as current');
        }

        var oldRelationship = _getRelationshipBetween(currentEmployerId, servantId);
        if (!oldRelationship || oldRelationship.type !== 'service' ||
            oldRelationship.status !== 'ongoing') {
            return _fail('NO_SERVICE', 'No active service relationship found');
        }

        var transferYear = _resolveYear(options.transferYear);
        if (transferYear === null) return _fail('INVALID_YEAR', 'Invalid transfer year');

        var metadata = oldRelationship.metadata || {};
        var serviceTypeId = metadata.serviceTypeId || 'household_staff';
        var oldWage = typeof metadata.wage === 'number' ? metadata.wage : 0;
        var newWage = options.newWage !== undefined ? options.newWage : oldWage;

        // Step 1: create new service (leaves old intact on failure)
        var newRelationshipResult = createServiceRelationship(
            newEmployerId,
            servantId,
            {
                serviceTypeId: serviceTypeId,
                wage: newWage,
                startYear: transferYear,
                notes: options.notes || ('Transferred from ' + currentEmployer.name + "'s household"),
                addToHousehold: true
            }
        );

        if (!newRelationshipResult.success) {
            return _fail('NEW_SERVICE_FAILED',
                'Failed to create new service: ' + newRelationshipResult.reason);
        }

        // Step 2: terminate old service
        var terminateResult = terminateService(currentEmployerId, servantId, {
            endYear: transferYear,
            reason: 'Transferred to ' + newEmployer.name + "'s household",
            removeFromHousehold: true,
            recordHistory: false
        });

        if (!terminateResult.success) {
            // Best-effort rollback of new service
            try {
                terminateService(newEmployerId, servantId, {
                    endYear: transferYear,
                    reason: 'Rollback: transfer failed at old-service termination',
                    removeFromHousehold: true,
                    recordHistory: false
                });
            } catch (e) { /* best-effort */ }
            return _fail('TERMINATE_FAILED', terminateResult.reason);
        }

        _logEvent('service', 'Servant Transferred',
            servant.name + ' transferred from ' + currentEmployer.name +
            ' to ' + newEmployer.name,
            [servant, currentEmployer, newEmployer]);

        return _ok({
            servantId: servantId,
            fromEmployerId: currentEmployerId,
            toEmployerId: newEmployerId,
            newRelationshipId: newRelationshipResult.data.relationshipId,
            year: transferYear,
            wage: newWage
        });
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    var api = {
        // Constants
        SERVICE_TYPES: SERVICE_TYPES,
        SERVICE_STATUS: SERVICE_STATUS,
        SERVICE_QUALITY: SERVICE_QUALITY,
        SERVICE_CONTRACT_TERMS: SERVICE_CONTRACT_TERMS,

        // Pure calculations
        calculateServiceQuality: calculateServiceQuality,
        calculateRecommendation: calculateRecommendation,

        // Commands
        createServiceRelationship: createServiceRelationship,
        terminateService: terminateService,
        promoteServant: promoteServant,
        adjustServantWages: adjustServantWages,
        recordEmployerSatisfaction: recordEmployerSatisfaction,
        updateServiceQuality: updateServiceQuality,

        // Queries
        getServiceBetween: getServiceBetween,
        getServants: getServants,
        getEmployer: getEmployer,
        getActiveService: getActiveService,
        getServiceHistory: getServiceHistory,
        getServiceQuality: getServiceQuality,
        generateServiceReference: generateServiceReference,
        getStaffByDepartment: getStaffByDepartment,

        // Household integration
        assignServantToDepartment: assignServantToDepartment,
        transferServantToHousehold: transferServantToHousehold
    };

    window.HouseholdServant = api;

    // Legacy flat aliases — consumers should migrate to
    // window.HouseholdServant.*
    window.SERVICE_TYPES = SERVICE_TYPES;
    window.SERVICE_STATUS = SERVICE_STATUS;
    window.SERVICE_QUALITY = SERVICE_QUALITY;
    window.SERVICE_CONTRACT_TERMS = SERVICE_CONTRACT_TERMS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

})();
