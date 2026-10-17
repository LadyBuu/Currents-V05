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
 *       ↓ creates canonical relationship (RelationshipSystem)
 *       ↓ adds household membership (HouseholdCommands)
 *       ↓ _finish → persist once
 *
 * Everything it does is either:
 *   - a pure projection (query)
 *   - a coordinated sequence of other systems' commands
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Every orchestration ends with _finish(eventName, payload), which
 *     dispatches a CustomEvent and calls HouseholdCommands.persist()
 *     exactly once.
 *   - Relationship system writes remain its responsibility. This module
 *     does not persist them. RelationshipSystem owns its own persistence
 *     boundary.
 *   - HouseholdCommands writes are batched: multiple addMember / updateMember
 *     / removeMember calls in one orchestration produce one household save
 *     at the end of the orchestration.
 *   - Partial failures are reported explicitly with partial:true.
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
 *   - Canonical relationship storage   → RelationshipSystem
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
 * policy, not read baseWage directly.
 *
 * RESULT SHAPE
 * ------------
 *   { success: true,  data: ... }
 *   { success: false, code: 'SOME_CODE', reason: 'human message',
 *     partial: true (when partial mutation occurred),
 *     ...extra fields }
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('HouseholdServant: ' + name + ' is required');
        }
        return obj;
    }

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('HouseholdServant: ' + name + ' is required');
        }
        return fn;
    }

    // Household deps
    var _householdCommands = _requireObject('HouseholdCommands',
        window.HouseholdCommands);
    _requireFunction('HouseholdCommands.addMember', _householdCommands.addMember);
    _requireFunction('HouseholdCommands.removeMember',
        _householdCommands.removeMember);
    _requireFunction('HouseholdCommands.updateMember',
        _householdCommands.updateMember);
    _requireFunction('HouseholdCommands.persist', _householdCommands.persist);

    var _householdQueries = _requireObject('HouseholdQueries',
        window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getCharacterHousehold',
        _householdQueries.getCharacterHousehold);
    _requireFunction('HouseholdQueries.getHouseholdStaff',
        _householdQueries.getHouseholdStaff);

    // Character + time
    var _getCharacterById = _requireFunction('getCharacterById',
        window.getCharacterById);
    var _getCurrentYearSafe = _requireFunction('getCurrentYearSafe',
        window.getCurrentYearSafe);

    // Relationship system — required, verified at load
    var _createRelationship = _requireFunction('createRelationship',
        window.createRelationship);
    var _endRelationship = _requireFunction('endRelationship',
        window.endRelationship);
    var _updateRelationship = _requireFunction('updateRelationship',
        window.updateRelationship);
    var _getRelationshipBetween = _requireFunction('getRelationshipBetween',
        window.getRelationshipBetween);
    var _getRelationshipsForCharacter = _requireFunction(
        'getRelationshipsForCharacter', window.getRelationshipsForCharacter);
    var _getRelationshipById = _requireFunction('getRelationshipById',
        window.getRelationshipById);

    // Optional — trust/loyalty are effect-only
    var _trustPresent = typeof window.modifyTrust === 'function';
    var _loyaltyPresent = typeof window.modifyLoyalty === 'function';

    // =========================================================================
    // 1. CONSTANTS
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

    var SERVICE_QUALITY_ORDER = [
        SERVICE_QUALITY.EXCELLENT,
        SERVICE_QUALITY.GOOD,
        SERVICE_QUALITY.AVERAGE,
        SERVICE_QUALITY.POOR,
        SERVICE_QUALITY.UNSATISFACTORY
    ];

    var SERVICE_CONTRACT_TERMS = {
        INDEFINITE: { id: 'indefinite', name: 'Indefinite',   duration: null, noticePeriod: 30 },
        ANNUAL:     { id: 'annual',     name: 'Annual',       duration: 365,  noticePeriod: 30 },
        SEASONAL:   { id: 'seasonal',   name: 'Seasonal',     duration: 90,   noticePeriod: 14 },
        TRIAL:      { id: 'trial',      name: 'Trial Period', duration: 30,   noticePeriod: 7  },
        DAY_LABOR:  { id: 'day_labor',  name: 'Day Labor',    duration: 1,    noticePeriod: 0  }
    };

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        return { success: true, data: data === undefined ? null : data };
    }
    function _fail(code, reason, extra) {
        var result = { success: false, code: code, reason: reason || code };
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) {
                    result[k] = extra[k];
                }
            }
        }
        return result;
    }
    function _resolveYear(value) {
        if (value === undefined || value === null) return _getCurrentYearSafe();
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return value;
    }

    // =========================================================================
    // 3. ORCHESTRATION FINISHER
    // =========================================================================

    function _dispatch(eventName, payload) {
        if (typeof window.dispatchEvent !== 'function') return;
        if (typeof window.CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new window.CustomEvent(eventName, {
                detail: payload || {}
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('HouseholdServant: failed to dispatch ' + eventName, e);
            }
        }
    }

    /**
     * Closes an orchestration: dispatches a CustomEvent and persists
     * household state once. Relationship system writes are the caller's
     * responsibility to persist (RelationshipSystem owns its own boundary).
     *
     * This is best-effort: if household state has nothing dirty,
     * persist() is still called (cheap; saveMasterData is idempotent).
     * If persist fails, the caller sees a structured failure — but any
     * relationship writes have already happened. That's the cross-domain
     * atomicity gap the plan documents.
     */
    function _finish(eventName, payload) {
        _dispatch(eventName, payload || {});
        var persistResult = _householdCommands.persist();
        if (!persistResult || persistResult.success === false) {
            return _fail(
                (persistResult && persistResult.code) || 'PERSIST_FAILED',
                (persistResult && persistResult.reason) || 'Failed to persist'
            );
        }
        return _ok(null);
    }

    // =========================================================================
    // 4. PURE CALCULATIONS
    // =========================================================================

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

    function calculateRecommendation(satisfaction) {
        if (satisfaction >= 90) return 'highly recommended';
        if (satisfaction >= 70) return 'recommended';
        if (satisfaction >= 50) return 'recommended with reservations';
        return 'not recommended';
    }

    // =========================================================================
    // 5. PROJECTIONS
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

    // =========================================================================
    // 6. SERVICE RELATIONSHIP COMMANDS
    // =========================================================================

    /**
     * Creates a service relationship between an employer and a servant.
     *
     * Orchestrates:
     *   1. Validate
     *   2. Create canonical relationship (RelationshipSystem)
     *   3. Add household membership (HouseholdCommands)
     *   4. Apply trust / loyalty effects
     *   5. _finish → persist household once
     *
     * If step 3 fails, we attempt to roll back step 2 (end relationship).
     * If step 2 fails, nothing to roll back.
     *
     * Returns:
     *   { success: true, data: { relationshipId, householdId, ... } }
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
            return _fail('RELATIONSHIP_CREATE_FAILED',
                'Failed to create service relationship');
        }

        // Step 2: household membership (unless opted out)
        var householdId = null;
        if (options.addToHousehold !== false) {
            var employerHousehold = _householdQueries.getCharacterHousehold(employerId);
            if (employerHousehold) {
                var addResult = _householdCommands.addMember(
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
                    } catch (e) {
                        if (typeof console !== 'undefined' && console.error) {
                            console.error(
                                'HouseholdServant.createServiceRelationship: ' +
                                'rollback failed', e);
                        }
                    }
                    return _fail('HOUSEHOLD_ADD_FAILED',
                        'Failed to add to employer household: ' + addResult.reason);
                }
                householdId = employerHousehold.id;
            }
        }

        // Step 3: domain consequences (best-effort, side-channel)
        if (_trustPresent) {
            try {
                window.modifyTrust(servantId, employerId, 15,
                    'Began service as ' + serviceType.name);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('HouseholdServant: modifyTrust failed', e);
                }
            }
        }
        if (_loyaltyPresent) {
            try {
                window.modifyLoyalty(servantId, employerId, 'individual', 10,
                    'Began service as ' + serviceType.name);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('HouseholdServant: modifyLoyalty failed', e);
                }
            }
        }

        // Step 4: close orchestration (one household persist)
        var finish = _finish('serviceRelationshipCreated', {
            employerId: employerId,
            servantId: servantId,
            relationshipId: relationship.id,
            householdId: householdId,
            serviceTypeId: serviceType.id,
            startYear: startYear
        });

        if (!finish.success) {
            return _fail(finish.code, finish.reason, {
                relationshipId: relationship.id,
                householdId: householdId,
                partial: true
            });
        }

        if (typeof window.logEvent === 'function') {
            window.logEvent('service', 'Service Begun',
                servant.name + ' began serving ' + employer.name +
                ' as ' + serviceType.name, [employer, servant]);
        }

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
     *   5. _finish → persist household once
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
        var removed = false;
        if (options.removeFromHousehold !== false) {
            var employerHousehold = _householdQueries.getCharacterHousehold(employerId);
            if (employerHousehold) {
                var removeResult = _householdCommands.removeMember(
                    employerHousehold.id, servantId, {
                        reason: 'Service terminated: ' + reason,
                        leftYear: endYear,
                        recordHistory: options.recordHistory !== false
                    }
                );
                removed = removeResult.success === true;
            }
        }

        if (_trustPresent) {
            try {
                window.modifyTrust(servantId, employerId, -10,
                    'Service ended: ' + reason);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('HouseholdServant: modifyTrust failed', e);
                }
            }
        }

        var finish = _finish('serviceRelationshipTerminated', {
            employerId: employerId,
            servantId: servantId,
            relationshipId: relationship.id,
            endYear: endYear,
            reason: reason
        });

        var employer = _getCharacterById(employerId);
        var servant = _getCharacterById(servantId);

        if (typeof window.logEvent === 'function') {
            window.logEvent('service', 'Service Ended',
                (servant ? servant.name : 'Unknown') + ' ended service with ' +
                (employer ? employer.name : 'Unknown') + ': ' + reason, []);
        }

        if (!finish.success) {
            return _fail(finish.code, finish.reason, {
                relationshipId: relationship.id,
                endYear: endYear,
                removedFromHousehold: removed,
                partial: true
            });
        }

        return _ok({
            relationshipId: relationship.id,
            endYear: endYear,
            reason: reason,
            removedFromHousehold: removed
        });
    }

    /**
     * Promotes a servant to a new service type.
     *
     * Records promotion as a metadata change + history, not as a
     * household transfer.
     *
     * Batches: one updateRelationship + one updateMember + one _finish.
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
        if (promotionYear === null) {
            return _fail('INVALID_YEAR', 'Invalid promotion year');
        }

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

        var updated = _updateRelationship(relationship.id, {
            metadata: updatedMetadata
        });
        if (!updated) {
            return _fail('UPDATE_FAILED', 'Failed to update service relationship');
        }

        // Household role update (unless opted out)
        var roleUpdated = false;
        if (options.updateHouseholdRole !== false) {
            var employerHousehold = _householdQueries.getCharacterHousehold(employerId);
            if (employerHousehold) {
                var updResult = _householdCommands.updateMember(
                    employerHousehold.id, servantId, { role: newType.name }
                );
                roleUpdated = updResult.success === true;
            }
        }

        if (_trustPresent) {
            try {
                window.modifyTrust(servantId, employerId, 10,
                    'Promoted to ' + newType.name);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('HouseholdServant: modifyTrust failed', e);
                }
            }
        }
        if (_loyaltyPresent) {
            try {
                window.modifyLoyalty(servantId, employerId, 'individual', 15,
                    'Promoted to ' + newType.name);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('HouseholdServant: modifyLoyalty failed', e);
                }
            }
        }

        var finish = _finish('servantPromoted', {
            employerId: employerId,
            servantId: servantId,
            relationshipId: relationship.id,
            newServiceTypeId: newType.id,
            newWage: newWage,
            year: promotionYear
        });

        if (!finish.success) {
            return _fail(finish.code, finish.reason, {
                relationshipId: relationship.id,
                roleUpdated: roleUpdated,
                partial: true
            });
        }

        var servant = _getCharacterById(servantId);
        if (typeof window.logEvent === 'function') {
            window.logEvent('service', 'Servant Promoted',
                (servant ? servant.name : 'Unknown') + ' promoted to ' +
                newType.name, []);
        }

        return _ok({
            relationshipId: relationship.id,
            newServiceTypeId: newType.id,
            newWage: newWage,
            year: promotionYear,
            roleUpdated: roleUpdated
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
        updatedMetadata.wageAdjustmentYear = _getCurrentYearSafe();
        updatedMetadata.wageAdjustmentReason = reason || 'Adjustment';

        var updated = _updateRelationship(relationship.id, {
            metadata: updatedMetadata
        });
        if (!updated) return _fail('UPDATE_FAILED', 'Failed to update wage');

        var delta = newWage - oldWage;
        if (delta > 0 && _loyaltyPresent) {
            try {
                window.modifyLoyalty(servantId, employerId, 'individual', 5,
                    'Wage increased by ' + delta);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('HouseholdServant: modifyLoyalty failed', e);
                }
            }
        } else if (delta < 0 && _loyaltyPresent) {
            try {
                window.modifyLoyalty(servantId, employerId, 'individual', -10,
                    'Wage decreased by ' + (-delta));
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('HouseholdServant: modifyLoyalty failed', e);
                }
            }
        }

        var finish = _finish('servantWagesAdjusted', {
            employerId: employerId,
            servantId: servantId,
            relationshipId: relationship.id,
            oldWage: oldWage,
            newWage: newWage
        });

        if (!finish.success) {
            return _fail(finish.code, finish.reason, {
                relationshipId: relationship.id,
                oldWage: oldWage,
                newWage: newWage,
                partial: true
            });
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
     * new metadata copy and passes it via the canonical relationship
     * update API. Recomputes quality in the same batch.
     */
    function recordEmployerSatisfaction(relationshipId, satisfaction, reason) {
        if (typeof satisfaction !== 'number' || !isFinite(satisfaction)) {
            return _fail('INVALID_SATISFACTION',
                'Satisfaction must be a finite number');
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
            year: _getCurrentYearSafe(),
            satisfaction: bounded,
            reason: reason || null
        });
        if (history.length > 20) history = history.slice(-20);

        // Recompute quality in the same batch (no separate updateRelationship)
        var quality = calculateServiceQuality(
            bounded,
            metadata.servantSatisfaction
        );

        var updatedMetadata = JSON.parse(JSON.stringify(metadata));
        updatedMetadata.employerSatisfaction = bounded;
        updatedMetadata.employerSatisfactionHistory = history;
        updatedMetadata.quality = quality.id;
        updatedMetadata.qualityLastUpdated = _getCurrentYearSafe();

        var updated = _updateRelationship(relationshipId, {
            metadata: updatedMetadata
        });
        if (!updated) {
            return _fail('UPDATE_FAILED', 'Failed to record satisfaction');
        }

        var finish = _finish('serviceSatisfactionRecorded', {
            relationshipId: relationshipId,
            satisfaction: bounded,
            quality: quality.id
        });

        if (!finish.success) {
            return _fail(finish.code, finish.reason, {
                relationshipId: relationshipId,
                satisfaction: bounded,
                quality: quality.id,
                partial: true
            });
        }

        return _ok({
            relationshipId: relationshipId,
            satisfaction: bounded,
            quality: quality.id
        });
    }

    /**
     * Recomputes the service quality tier from current satisfaction values.
     *
     * Public API preserved. Batches the relationship update with _finish.
     *
     * Returns:
     *   { success: true, data: { relationshipId, qualityId, changed } }
     *   { success: false, code, reason }
     */
    function updateServiceQuality(relationshipId) {
        var relationship = _getRelationshipById(relationshipId);
        if (!relationship || relationship.type !== 'service') {
            return _fail('NO_SERVICE', 'Service relationship not found');
        }

        var metadata = relationship.metadata || {};
        var quality = calculateServiceQuality(
            metadata.employerSatisfaction,
            metadata.servantSatisfaction
        );

        if (metadata.quality === quality.id) {
            return _ok({
                relationshipId: relationshipId,
                qualityId: quality.id,
                changed: false
            });
        }

        var updatedMetadata = JSON.parse(JSON.stringify(metadata));
        updatedMetadata.quality = quality.id;
        updatedMetadata.qualityLastUpdated = _getCurrentYearSafe();

        var updated = _updateRelationship(relationshipId, {
            metadata: updatedMetadata
        });
        if (!updated) return _fail('UPDATE_FAILED', 'Failed to update quality');

        var finish = _finish('serviceQualityUpdated', {
            relationshipId: relationshipId,
            qualityId: quality.id
        });

        if (!finish.success) {
            return _fail(finish.code, finish.reason, {
                relationshipId: relationshipId,
                qualityId: quality.id,
                partial: true
            });
        }

        return _ok({
            relationshipId: relationshipId,
            qualityId: quality.id,
            changed: true
        });
    }

    // =========================================================================
    // 7. SERVICE QUERIES (defensive snapshots)
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
        for (var i = 0; i < SERVICE_QUALITY_ORDER.length; i++) {
            if (SERVICE_QUALITY_ORDER[i].id === qualityId) {
                return SERVICE_QUALITY_ORDER[i];
            }
        }
        return SERVICE_QUALITY.AVERAGE;
    }

    /**
     * Generates a service reference for a servant.
     * Pure projection.
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
                ? _getCurrentYearSafe() - relationship.startYear
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
            generatedYear: _getCurrentYearSafe()
        });
    }

    /**
     * Returns staff grouped by department for a household.
     * Composes HouseholdQueries + service query.
     */
    function getStaffByDepartment(employerId, departmentId) {
        var employerHousehold = _householdQueries.getCharacterHousehold(employerId);
        if (!employerHousehold) return [];

        var staff = _householdQueries.getHouseholdStaff(employerHousehold.id, {
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
    // 8. HOUSEHOLD INTEGRATION
    // =========================================================================

    /**
     * Assigns a servant to a department.
     *
     * This is fundamentally a household member update. Delegates to
     * HouseholdCommands.updateMember. Batches a single _finish.
     */
    function assignServantToDepartment(employerId, servantId, departmentId) {
        var service = _getRelationshipBetween(employerId, servantId);
        if (!service || service.type !== 'service' || service.status !== 'ongoing') {
            return _fail('NO_SERVICE', 'Character is not an active servant');
        }

        var household = _householdQueries.getCharacterHousehold(employerId);
        if (!household) return _fail('NO_HOUSEHOLD', 'Employer has no household');

        var result = _householdCommands.updateMember(household.id, servantId, {
            departmentId: departmentId
        });
        if (!result.success) return result;

        var finish = _finish('servantDepartmentChanged', {
            employerId: employerId,
            servantId: servantId,
            householdId: household.id,
            departmentId: departmentId
        });

        if (!finish.success) {
            return _fail(finish.code, finish.reason, {
                householdId: household.id,
                characterId: servantId,
                departmentId: departmentId,
                partial: true
            });
        }

        return _ok({
            householdId: household.id,
            characterId: servantId,
            departmentId: departmentId
        });
    }

    /**
     * Transfers a servant to a new employer.
     *
     * Order (explicitly non-atomic across the two orchestrations):
     *   1. Validate
     *   2. Create new service FIRST (leaves old intact on failure)
     *   3. Terminate old service
     *   4. If termination fails, roll back new service
     *
     * Each step is its own orchestration with its own _finish. The whole
     * sequence is not atomic; partial failures are reported with
     * partial:true and a detail field indicating which step failed.
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
                notes: options.notes ||
                    ('Transferred from ' + currentEmployer.name + "'s household"),
                addToHousehold: true
            }
        );

        if (!newRelationshipResult.success) {
            return _fail('NEW_SERVICE_FAILED',
                'Failed to create new service: ' + newRelationshipResult.reason,
                { step: 'createNewService' });
        }

        var newRelationshipId = newRelationshipResult.data.relationshipId;
        var newHouseholdId = newRelationshipResult.data.householdId;

        // Step 2: terminate old service
        var terminateResult = terminateService(currentEmployerId, servantId, {
            endYear: transferYear,
            reason: 'Transferred to ' + newEmployer.name + "'s household",
            removeFromHousehold: true,
            recordHistory: false
        });

        if (!terminateResult.success) {
            // Best-effort rollback of new service
            var rollbackOk = false;
            try {
                var rollback = terminateService(newEmployerId, servantId, {
                    endYear: transferYear,
                    reason: 'Rollback: transfer failed at old-service termination',
                    removeFromHousehold: true,
                    recordHistory: false
                });
                rollbackOk = rollback.success === true;
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'HouseholdServant.transferServantToHousehold: ' +
                        'rollback failed', e);
                }
            }

            return _fail('TERMINATE_FAILED', terminateResult.reason, {
                step: 'terminateOldService',
                newRelationshipId: newRelationshipId,
                newHouseholdId: newHouseholdId,
                rollbackAttempted: true,
                rollbackSucceeded: rollbackOk,
                partial: true
            });
        }

        // Success — dispatch a transfer event (each sub-orchestration
        // already persisted; this dispatch is for observers only)
        _dispatch('servantTransferred', {
            servantId: servantId,
            fromEmployerId: currentEmployerId,
            toEmployerId: newEmployerId,
            newRelationshipId: newRelationshipId,
            year: transferYear,
            wage: newWage
        });

        if (typeof window.logEvent === 'function') {
            window.logEvent('service', 'Servant Transferred',
                servant.name + ' transferred from ' + currentEmployer.name +
                ' to ' + newEmployer.name,
                [servant, currentEmployer, newEmployer]);
        }

        return _ok({
            servantId: servantId,
            fromEmployerId: currentEmployerId,
            toEmployerId: newEmployerId,
            newRelationshipId: newRelationshipId,
            year: transferYear,
            wage: newWage
        });
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    var api = {
        // Constants
        SERVICE_TYPES: SERVICE_TYPES,
        SERVICE_STATUS: SERVICE_STATUS,
        SERVICE_QUALITY: SERVICE_QUALITY,
        SERVICE_QUALITY_ORDER: SERVICE_QUALITY_ORDER,
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
