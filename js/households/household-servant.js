/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD SERVANT (household-servant.js)
 * =============================================================================
 *
 * LOCATION: js/households/household-servant.js
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
 * relationship system owns it (via RelationshipCommands.createRelationship
 * / endRelationship / updateRelationship and the corresponding queries
 * on RelationshipQueries).
 *
 * This module does NOT own household membership. HouseholdCommands does.
 *
 * This module ORCHESTRATES between them:
 *
 *   createServiceRelationship()
 *       → validate
 *       → create canonical relationship (RelationshipCommands)
 *       → add household membership (HouseholdCommands)
 *       → close batch (household persist + relationship persist)
 *       → return structured result
 *
 * Everything it does is either:
 *   - a pure projection (query)
 *   - a coordinated sequence of other systems' commands
 *
 * SHARED ORCHESTRATION HELPERS
 * ----------------------------
 * Result builders (ok, fail), year resolution, dispatch, and the
 * household-persist close come from household-orchestration.js. This
 * module does NOT redefine them.
 *
 * CONSTANTS AND RULES
 * -------------------
 * SERVICE_TYPES / SERVICE_STATUS / SERVICE_QUALITY /
 * SERVICE_QUALITY_ORDER / SERVICE_CONTRACT_TERMS live in
 * household-constants.js.
 *
 * calculateServiceQuality / calculateRecommendation live in
 * household-rules.js.
 *
 * CROSS-DOMAIN PERSISTENCE
 * ------------------------
 * The relationship system is an independent domain with its own
 * persistence boundary. When this module creates, terminates, or updates
 * a service relationship, that change lives in the relationship
 * system's canonical state. This module must ensure the change is
 * flushed.
 *
 * The relationship system exposes:
 *
 *   window.RelationshipCommands.persist()   ->  { success, reason? }
 *
 * (older surface: window.RelationshipSystem.persist())
 *
 * If neither is present, this module completes the orchestration (the
 * household side saves; the relationship side is in-memory only) and
 * reports `relationshipPersisted: false` in the result.
 *
 * RELATIONSHIP DOMAIN RESOLUTION
 * ------------------------------
 * Six relationship-domain functions are used by this module:
 *
 *   createRelationship
 *   endRelationship
 *   updateRelationship
 *   getRelationshipBetween
 *   getRelationshipsForCharacter
 *   getRelationshipById
 *
 * These are NOT flat globals. The relationship domain exports them on
 * a namespace:
 *
 *   window.RelationshipCommands   { createRelationship, endRelationship,
 *                                   updateRelationship, ..., persist }
 *   window.RelationshipQueries    { getRelationshipBetween,
 *                                   getRelationshipsForCharacter,
 *                                   getRelationshipById, ... }
 *
 * (An older surface, window.RelationshipSystem, combined both. It is
 * still honoured as a fallback so this module works in either
 * configuration.)
 *
 * Prior revisions resolved these via load-time _requireFunction(name,
 * window.name) calls, which threw on load because window.name is never
 * assigned. This revision resolves them at CALL time against the
 * namespaces, so:
 *
 *   - a missing relationship domain fails at the first command that
 *     needs it, with a clear error naming the function and the
 *     namespace it was looked up on, and
 *   - the module still loads cleanly when the relationship domain
 *     loads first (which it does under the documented order).
 *
 * SERVICE RELATIONSHIP FIELD CONTRACT
 * -----------------------------------
 * Relationships created by this module have:
 *
 *   type: 'service'
 *   status: 'ongoing' | 'ended'
 *   participantA: employerId
 *   participantB: servantId
 *   startYear: number
 *   endYear: number | null
 *   metadata: {
 *     serviceTypeId: string
 *     serviceTypeName: string
 *     wage: number
 *     contractTerm: string
 *     quality: string
 *     employerSatisfaction: number
 *     servantSatisfaction: number
 *     employerSatisfactionHistory: array
 *     previousServiceTypeId: string|null
 *     promotionYear: number|null
 *     promotionNotes: string
 *     previousWage: number|null
 *     wageAdjustmentYear: number|null
 *     wageAdjustmentReason: string|null
 *     qualityLastUpdated: number|null
 *     notes: string
 *   }
 *
 * RESULT SHAPE
 * ------------
 *   { success: true,  data: { ..., householdPersisted, relationshipPersisted } }
 *   { success: false, code: 'SOME_CODE', reason: 'human message',
 *     partial: true (when partial mutation occurred),
 *     ...extra fields }
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - household-constants.js    (SERVICE_TYPES, SERVICE_QUALITY_ORDER)
 *   - household-rules.js        (calculateServiceQuality,
 *                                calculateRecommendation)
 *   - household-orchestration.js (ok, fail, resolveYear, dispatch,
 *                                finish, hasId)
 *   - household-commands.js     (addMember, removeMember, updateMember)
 *   - household-queries.js      (getCharacterHousehold, getHouseholdStaff)
 *   - accessors.js              (getCharacterById)
 *
 * DEPENDENCIES (RESOLVED AT CALL TIME):
 *   - RelationshipCommands / RelationshipQueries (or older
 *     RelationshipSystem). See RELATIONSHIP DOMAIN RESOLUTION.
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - RelationshipCommands.persist / RelationshipSystem.persist
 *   - modifyTrust / modifyLoyalty
 *   - time.js getCurrentYear (falls back to masterData.data.currentYear)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - The six relationship-domain functions (createRelationship,
 *       endRelationship, updateRelationship, getRelationshipBetween,
 *       getRelationshipsForCharacter, getRelationshipById) are now
 *       resolved at CALL time against window.RelationshipCommands /
 *       window.RelationshipQueries, with window.RelationshipSystem as
 *       a fallback. Prior revisions resolved them at LOAD time against
 *       flat globals that no module assigns, so household-servant.js
 *       threw at load ("HouseholdServant: createRelationship is
 *       required") and never defined window.HouseholdServant. See
 *       RELATIONSHIP DOMAIN RESOLUTION.
 *     - Added _getCurrentYearSafe(), an internal helper used by the
 *       three call sites that previously referenced an undefined
 *       _getCurrentYearSafe global. The helper prefers
 *       window.getCurrentYear (time.js) and falls back to
 *       masterData.data.currentYear when time.js is not loaded.
 *       Behaviour at those three sites (generateServiceReference,
 *       updateServiceQuality, ...) is unchanged when time.js is
 *       present, which it is under the documented load order.
 *     - No change to any command's logic, any query, the finisher,
 *       the flat aliases, or the exports shape.
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

    var C = _requireObject('HouseholdConstants', window.HouseholdConstants);
    if (!C.SERVICE_TYPES || !Array.isArray(C.SERVICE_QUALITY_ORDER)) {
        throw new Error(
            'HouseholdServant: HouseholdConstants.SERVICE_TYPES or ' +
            'SERVICE_QUALITY_ORDER is missing. The loaded ' +
            'household-constants.js is too old.'
        );
    }

    var R = _requireObject('HouseholdRules', window.HouseholdRules);
    _requireFunction('HouseholdRules.calculateServiceQuality',
        R.calculateServiceQuality);
    _requireFunction('HouseholdRules.calculateRecommendation',
        R.calculateRecommendation);

    var O = _requireObject('HouseholdOrchestration',
        window.HouseholdOrchestration);
    _requireFunction('HouseholdOrchestration.ok', O.ok);
    _requireFunction('HouseholdOrchestration.fail', O.fail);
    _requireFunction('HouseholdOrchestration.resolveYear', O.resolveYear);
    _requireFunction('HouseholdOrchestration.dispatch', O.dispatch);
    _requireFunction('HouseholdOrchestration.finish', O.finish);
    _requireFunction('HouseholdOrchestration.hasId', O.hasId);

    var _householdCommands = _requireObject('HouseholdCommands',
        window.HouseholdCommands);
    _requireFunction('HouseholdCommands.addMember', _householdCommands.addMember);
    _requireFunction('HouseholdCommands.removeMember',
        _householdCommands.removeMember);
    _requireFunction('HouseholdCommands.updateMember',
        _householdCommands.updateMember);

    var _householdQueries = _requireObject('HouseholdQueries',
        window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getCharacterHousehold',
        _householdQueries.getCharacterHousehold);
    _requireFunction('HouseholdQueries.getHouseholdStaff',
        _householdQueries.getHouseholdStaff);

    var _getCharacterById = _requireFunction('getCharacterById',
        window.getCharacterById);

    // =========================================================================
    // 0b. RELATIONSHIP DOMAIN RESOLVERS
    // =========================================================================
    //
    // See RELATIONSHIP DOMAIN RESOLUTION in the module header.
    //
    // Every relationship call goes through one of these helpers. Each
    // helper checks the namespace at CALL time, throws a clear error
    // naming the function and both namespaces if it is missing, and
    // otherwise returns the wrapped call.
    //
    // The lookup order matches how the relationship domain can appear:
    //
    //   1. RelationshipCommands  (commands: create, end, update, persist)
    //      RelationshipQueries   (queries:  get-by-id, get-between,
    //                                        get-for-character)
    //   2. RelationshipSystem    (older combined surface, still honoured)
    //
    // Under the documented load order, relationship-commands.js and
    // relationship-queries.js load before household-servant.js, so the
    // primary path resolves. The fallback exists so a page that loads
    // the older combined surface continues to work.

    function _resolveRelationshipCommandsFn(fnName) {
        var rc = window.RelationshipCommands;
        if (rc && typeof rc[fnName] === 'function') {
            return rc[fnName];
        }
        var rs = window.RelationshipSystem;
        if (rs && typeof rs[fnName] === 'function') {
            return rs[fnName];
        }
        throw new Error(
            'HouseholdServant: ' + fnName + ' is required. ' +
            'Looked for window.RelationshipCommands.' + fnName +
            ' and window.RelationshipSystem.' + fnName + '. ' +
            'Load relationship-commands.js before calling ' +
            'this function.'
        );
    }

    function _resolveRelationshipQueriesFn(fnName) {
        var rq = window.RelationshipQueries;
        if (rq && typeof rq[fnName] === 'function') {
            return rq[fnName];
        }
        var rs = window.RelationshipSystem;
        if (rs && typeof rs[fnName] === 'function') {
            return rs[fnName];
        }
        throw new Error(
            'HouseholdServant: ' + fnName + ' is required. ' +
            'Looked for window.RelationshipQueries.' + fnName +
            ' and window.RelationshipSystem.' + fnName + '. ' +
            'Load relationship-queries.js before calling ' +
            'this function.'
        );
    }

    // Command wrappers.
    function _createRelationship(a, b, options) {
        return _resolveRelationshipCommandsFn('createRelationship')(a, b, options);
    }
    function _endRelationship(id, year, reason) {
        return _resolveRelationshipCommandsFn('endRelationship')(id, year, reason);
    }
    function _updateRelationship(id, patch) {
        return _resolveRelationshipCommandsFn('updateRelationship')(id, patch);
    }

    // Query wrappers.
    function _getRelationshipBetween(a, b) {
        return _resolveRelationshipQueriesFn('getRelationshipBetween')(a, b);
    }
    function _getRelationshipsForCharacter(characterId) {
        return _resolveRelationshipQueriesFn('getRelationshipsForCharacter')(characterId);
    }
    function _getRelationshipById(relationshipId) {
        return _resolveRelationshipQueriesFn('getRelationshipById')(relationshipId);
    }

    // Aliased helpers — used throughout, imported once.
    var _ok = O.ok;
    var _fail = O.fail;
    var _resolveYear = O.resolveYear;
    var _hasId = O.hasId;

    // Optional
    var _trustPresent = typeof window.modifyTrust === 'function';
    var _loyaltyPresent = typeof window.modifyLoyalty === 'function';

    // =========================================================================
    // 0c. CURRENT YEAR
    // =========================================================================
    //
    // Used by updateServiceQuality and generateServiceReference. Prefers
    // time.js's getCurrentYear, falls back to masterData.data.currentYear.
    // Returns null if neither is available — callers treat null as
    // "year unknown" and store null in the metadata field, which matches
    // the prior behaviour of the (previously undefined) helper.

    function _getCurrentYearSafe() {
        if (typeof window.getCurrentYear === 'function') {
            try {
                var y = window.getCurrentYear();
                if (typeof y === 'number' && isFinite(y)) return y;
            } catch (e) {
                // Fall through to masterData.
            }
        }
        if (window.masterData && window.masterData.data
            && typeof window.masterData.data.currentYear === 'number'
            && isFinite(window.masterData.data.currentYear)) {
            return window.masterData.data.currentYear;
        }
        return null;
    }

    // =========================================================================
    // 1. CROSS-DOMAIN PERSISTENCE
    // =========================================================================

    function _persistRelationshipSystem() {
        // Try RelationshipCommands first (the usual write boundary).
        var rc = window.RelationshipCommands;
        if (rc && typeof rc.persist === 'function') {
            try {
                var r = rc.persist();
                if (r && r.success === false) {
                    return {
                        attempted: true,
                        persisted: false,
                        reason: r.reason || 'RelationshipCommands.persist failed'
                    };
                }
                return { attempted: true, persisted: true, reason: null };
            } catch (e) {
                return {
                    attempted: true,
                    persisted: false,
                    reason: (e && e.message) ? e.message : 'persist threw'
                };
            }
        }

        // Fall back to RelationshipSystem (older surface).
        var rs = window.RelationshipSystem;
        if (rs && typeof rs.persist === 'function') {
            try {
                var r2 = rs.persist();
                if (r2 && r2.success === false) {
                    return {
                        attempted: true,
                        persisted: false,
                        reason: r2.reason || 'RelationshipSystem.persist failed'
                    };
                }
                return { attempted: true, persisted: true, reason: null };
            } catch (e2) {
                return {
                    attempted: true,
                    persisted: false,
                    reason: (e2 && e2.message) ? e2.message : 'persist threw'
                };
            }
        }

        return {
            attempted: false,
            persisted: false,
            reason: 'relationship system does not expose persist()'
        };
    }

    // =========================================================================
    // 2. SERVANT-SPECIFIC FINISHER
    // =========================================================================

    function _finish(eventName, payload) {
        var householdResult = O.finish(eventName, payload);
        var rel = _persistRelationshipSystem();
        var householdOk = householdResult && householdResult.success !== false;

        if (!householdOk) {
            return _fail(
                (householdResult && householdResult.code) || 'PERSIST_FAILED',
                (householdResult && householdResult.reason) ||
                    'Failed to persist household state',
                {
                    householdPersisted: false,
                    relationshipPersisted: rel.persisted,
                    relationshipPersistAttempted: rel.attempted,
                    relationshipPersistReason: rel.reason,
                    partial: rel.persisted === true
                }
            );
        }

        if (rel.attempted && !rel.persisted) {
            return _fail(
                'RELATIONSHIP_PERSIST_FAILED',
                rel.reason || 'Relationship state failed to persist',
                {
                    householdPersisted: true,
                    relationshipPersisted: false,
                    relationshipPersistAttempted: true,
                    relationshipPersistReason: rel.reason,
                    partial: true
                }
            );
        }

        return _ok({
            householdPersisted: true,
            relationshipPersisted: rel.persisted,
            relationshipPersistAttempted: rel.attempted,
            relationshipPersistReason: rel.reason
        });
    }

    // =========================================================================
    // 3. PURE CALCULATIONS (delegates to HouseholdRules)
    // =========================================================================

    function calculateServiceQuality(employerSatisfaction, servantSatisfaction) {
        return R.calculateServiceQuality(employerSatisfaction, servantSatisfaction);
    }

    function calculateRecommendation(satisfaction) {
        return R.calculateRecommendation(satisfaction);
    }

    // =========================================================================
    // 4. PROJECTIONS
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

    function _resolveServiceType(input) {
        if (!input) return null;
        return C.getServiceTypeById(input);
    }

    // =========================================================================
    // 5. SERVICE RELATIONSHIP COMMANDS
    // =========================================================================

    function createServiceRelationship(employerId, servantId, options) {
        options = options || {};

        var employer = _getCharacterById(employerId);
        var servant = _getCharacterById(servantId);
        if (!employer) return _fail('EMPLOYER_NOT_FOUND', 'Employer character not found');
        if (!servant) return _fail('SERVANT_NOT_FOUND', 'Servant character not found');
        if (employerId === servantId) {
            return _fail('SELF_SERVICE', 'Character cannot serve themselves');
        }
        if (servant.isDeceased === true) {
            return _fail('SERVANT_DECEASED', 'Servant is deceased');
        }

        var serviceType = _resolveServiceType(options.serviceTypeId || 'household_staff');
        if (!serviceType) {
            return _fail('INVALID_SERVICE_TYPE',
                'Unknown service type "' + String(options.serviceTypeId) + '"');
        }

        var existing = _getRelationshipBetween(employerId, servantId);
        if (existing && existing.type === 'service' && existing.status === 'ongoing') {
            return _fail('ALREADY_SERVING', 'Service relationship already exists');
        }

        var startYear = _resolveYear(options.startYear);
        if (startYear === null) return _fail('INVALID_YEAR', 'Invalid start year');

        var wage = (options.wage !== undefined)
            ? options.wage
            : serviceType.baseWage;
        if (typeof wage !== 'number' || !isFinite(wage) || wage < 0) {
            return _fail('INVALID_WAGE', 'Wage must be a non-negative number');
        }

        var relationship = _createRelationship(employerId, servantId, {
            type: 'service',
            status: 'ongoing',
            startYear: startYear,
            metadata: {
                serviceTypeId: serviceType.id,
                serviceTypeName: serviceType.name,
                wage: wage,
                contractTerm: options.contractTerm || 'indefinite',
                quality: 'average',
                employerSatisfaction: 70,
                servantSatisfaction: 70,
                employerSatisfactionHistory: [],
                notes: options.notes || ''
            }
        });

        if (!relationship) {
            return _fail('RELATIONSHIP_CREATE_FAILED',
                'Failed to create service relationship');
        }

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
                    try {
                        _endRelationship(relationship.id, startYear,
                            'Rollback: household membership failed');
                        _persistRelationshipSystem();
                    } catch (e) {
                        if (typeof console !== 'undefined' && console.error) {
                            console.error(
                                'HouseholdServant.createServiceRelationship: ' +
                                'rollback failed', e);
                        }
                    }
                    return _fail('HOUSEHOLD_ADD_FAILED',
                        'Failed to add to employer household: ' +
                        (addResult.reason || 'unknown'));
                }
                householdId = employerHousehold.id;
            }
        }

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
                householdPersisted: finish.householdPersisted,
                relationshipPersisted: finish.relationshipPersisted,
                partial: finish.partial === true
            });
        }

        if (typeof window.logEvent === 'function') {
            window.logEvent('service', 'Service Begun',
                (servant.name || 'Servant') + ' began serving ' +
                (employer.name || 'Employer') + ' as ' + serviceType.name,
                [employer, servant]);
        }

        return _ok({
            relationshipId: relationship.id,
            householdId: householdId,
            serviceTypeId: serviceType.id,
            wage: wage,
            startYear: startYear,
            householdPersisted: finish.data.householdPersisted,
            relationshipPersisted: finish.data.relationshipPersisted,
            relationshipPersistAttempted: finish.data.relationshipPersistAttempted
        });
    }

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

        var ended = _endRelationship(relationship.id, endYear, reason);
        if (!ended) {
            return _fail('END_FAILED', 'Failed to end service relationship');
        }

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
                removed = removeResult && removeResult.success === true;
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
                householdPersisted: finish.householdPersisted,
                relationshipPersisted: finish.relationshipPersisted,
                partial: finish.partial === true
            });
        }

        return _ok({
            relationshipId: relationship.id,
            endYear: endYear,
            reason: reason,
            removedFromHousehold: removed,
            householdPersisted: finish.data.householdPersisted,
            relationshipPersisted: finish.data.relationshipPersisted
        });
    }

    function promoteServant(employerId, servantId, newServiceTypeId, options) {
        options = options || {};

        var relationship = _getRelationshipBetween(employerId, servantId);
        if (!relationship || relationship.type !== 'service' ||
            relationship.status !== 'ongoing') {
            return _fail('NO_SERVICE', 'No active service relationship found');
        }

        var newType = _resolveServiceType(newServiceTypeId);
        if (!newType) {
            return _fail('INVALID_SERVICE_TYPE',
                'Unknown service type "' + String(newServiceTypeId) + '"');
        }

        var promotionYear = _resolveYear(options.promotionYear);
        if (promotionYear === null) {
            return _fail('INVALID_YEAR', 'Invalid promotion year');
        }

        var newWage = (options.newWage !== undefined)
            ? options.newWage
            : newType.baseWage;
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

        var roleUpdated = false;
        if (options.updateHouseholdRole !== false) {
            var employerHousehold = _householdQueries.getCharacterHousehold(employerId);
            if (employerHousehold) {
                var updResult = _householdCommands.updateMember(
                    employerHousehold.id, servantId, { role: newType.name }
                );
                roleUpdated = updResult && updResult.success === true;
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
                householdPersisted: finish.householdPersisted,
                relationshipPersisted: finish.relationshipPersisted,
                partial: finish.partial === true
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
            roleUpdated: roleUpdated,
            householdPersisted: finish.data.householdPersisted,
            relationshipPersisted: finish.data.relationshipPersisted
        });
    }

    function adjustServantWages(employerId, servantId, newWage, reason, options) {
        options = options || {};
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
        if (oldWage === newWage) {
            return _ok({
                relationshipId: relationship.id,
                oldWage: oldWage,
                newWage: newWage,
                unchanged: true
            });
        }

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var updatedMetadata = JSON.parse(JSON.stringify(metadata));
        updatedMetadata.wage = newWage;
        updatedMetadata.previousWage = oldWage;
        updatedMetadata.wageAdjustmentYear = year;
        updatedMetadata.wageAdjustmentReason = reason || 'Adjustment';

        var updated = _updateRelationship(relationship.id, {
            metadata: updatedMetadata
        });
        if (!updated) return _fail('UPDATE_FAILED', 'Failed to update wage');

        var delta = newWage - oldWage;
        if (_loyaltyPresent) {
            var amount = delta > 0 ? 5 : -10;
            var note = delta > 0
                ? 'Wage increased by ' + delta
                : 'Wage decreased by ' + (-delta);
            try {
                window.modifyLoyalty(servantId, employerId, 'individual',
                    amount, note);
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
            newWage: newWage,
            year: year
        });

        if (!finish.success) {
            return _fail(finish.code, finish.reason, {
                relationshipId: relationship.id,
                oldWage: oldWage,
                newWage: newWage,
                householdPersisted: finish.householdPersisted,
                relationshipPersisted: finish.relationshipPersisted,
                partial: finish.partial === true
            });
        }

        return _ok({
            relationshipId: relationship.id,
            oldWage: oldWage,
            newWage: newWage,
            householdPersisted: finish.data.householdPersisted,
            relationshipPersisted: finish.data.relationshipPersisted
        });
    }

    function recordEmployerSatisfaction(relationshipId, satisfaction, reason, options) {
        options = options || {};
        if (typeof satisfaction !== 'number' || !isFinite(satisfaction)) {
            return _fail('INVALID_SATISFACTION',
                'Satisfaction must be a finite number');
        }

        var relationship = _getRelationshipById(relationshipId);
        if (!relationship || relationship.type !== 'service') {
            return _fail('NO_SERVICE', 'Service relationship not found');
        }

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var bounded = Math.max(0, Math.min(100, satisfaction));
        var metadata = relationship.metadata || {};
        var history = Array.isArray(metadata.employerSatisfactionHistory)
            ? metadata.employerSatisfactionHistory.slice()
            : [];

        history.push({
            year: year,
            satisfaction: bounded,
            reason: reason || null,
            timestamp: Date.now()
        });
        if (history.length > 20) history = history.slice(-20);

        var quality = calculateServiceQuality(
            bounded,
            metadata.servantSatisfaction
        );

        var updatedMetadata = JSON.parse(JSON.stringify(metadata));
        updatedMetadata.employerSatisfaction = bounded;
        updatedMetadata.employerSatisfactionHistory = history;
        updatedMetadata.quality = quality.id;
        updatedMetadata.qualityLastUpdated = year;

        var updated = _updateRelationship(relationshipId, {
            metadata: updatedMetadata
        });
        if (!updated) {
            return _fail('UPDATE_FAILED', 'Failed to record satisfaction');
        }

        var finish = _finish('serviceSatisfactionRecorded', {
            relationshipId: relationshipId,
            satisfaction: bounded,
            quality: quality.id,
            year: year
        });

        if (!finish.success) {
            return _fail(finish.code, finish.reason, {
                relationshipId: relationshipId,
                satisfaction: bounded,
                quality: quality.id,
                householdPersisted: finish.householdPersisted,
                relationshipPersisted: finish.relationshipPersisted,
                partial: finish.partial === true
            });
        }

        return _ok({
            relationshipId: relationshipId,
            satisfaction: bounded,
            quality: quality.id,
            householdPersisted: finish.data.householdPersisted,
            relationshipPersisted: finish.data.relationshipPersisted
        });
    }

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
                householdPersisted: finish.householdPersisted,
                relationshipPersisted: finish.relationshipPersisted,
                partial: finish.partial === true
            });
        }

        return _ok({
            relationshipId: relationshipId,
            qualityId: quality.id,
            changed: true,
            householdPersisted: finish.data.householdPersisted,
            relationshipPersisted: finish.data.relationshipPersisted
        });
    }

    // =========================================================================
    // 6. SERVICE QUERIES (defensive snapshots)
    // =========================================================================

    function getServiceBetween(employerId, servantId) {
        return _snapshotRelationship(
            _getRelationshipBetween(employerId, servantId)
        );
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
        for (var i = 0; i < C.SERVICE_QUALITY_ORDER.length; i++) {
            if (C.SERVICE_QUALITY_ORDER[i].id === qualityId) {
                return C.SERVICE_QUALITY_ORDER[i];
            }
        }
        return C.SERVICE_QUALITY.AVERAGE;
    }

    function generateServiceReference(employerId, servantId) {
        var relationship = _getRelationshipBetween(employerId, servantId);
        if (!relationship || relationship.type !== 'service') {
            return _fail('NO_SERVICE', 'No service relationship found');
        }

        var employer = _getCharacterById(employerId);
        var servant = _getCharacterById(servantId);
        var quality = getServiceQuality(relationship.id);
        var metadata = relationship.metadata || {};

        var employerSat = (typeof metadata.employerSatisfaction === 'number')
            ? metadata.employerSatisfaction
            : 70;

        var serviceYears;
        if (relationship.startYear && relationship.endYear) {
            serviceYears = relationship.endYear - relationship.startYear;
        } else if (relationship.startYear) {
            serviceYears = _getCurrentYearSafe() - relationship.startYear;
        } else {
            serviceYears = 0;
        }

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
    // 7. HOUSEHOLD INTEGRATION
    // =========================================================================

    function assignServantToDepartment(employerId, servantId, departmentId, options) {
        options = options || {};

        var service = _getRelationshipBetween(employerId, servantId);
        if (!service || service.type !== 'service' ||
            service.status !== 'ongoing') {
            return _fail('NO_SERVICE', 'Character is not an active servant');
        }

        var household = _householdQueries.getCharacterHousehold(employerId);
        if (!household) return _fail('NO_HOUSEHOLD', 'Employer has no household');

        var result = _householdCommands.updateMember(household.id, servantId, {
            departmentId: departmentId
        });
        if (!result || result.success !== true) {
            return _fail(
                (result && result.code) || 'UPDATE_FAILED',
                (result && result.reason) || 'Failed to update member department'
            );
        }

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
                householdPersisted: finish.householdPersisted,
                relationshipPersisted: finish.relationshipPersisted,
                partial: finish.partial === true
            });
        }

        return _ok({
            householdId: household.id,
            characterId: servantId,
            departmentId: departmentId,
            householdPersisted: finish.data.householdPersisted,
            relationshipPersisted: finish.data.relationshipPersisted
        });
    }

    function transferServantToHousehold(currentEmployerId, servantId,
                                        newEmployerId, options) {
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
        if (transferYear === null) {
            return _fail('INVALID_YEAR', 'Invalid transfer year');
        }

        var metadata = oldRelationship.metadata || {};
        var serviceTypeId = metadata.serviceTypeId || 'household_staff';
        var oldWage = (typeof metadata.wage === 'number') ? metadata.wage : 0;
        var newWage = (options.newWage !== undefined) ? options.newWage : oldWage;

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
                'Failed to create new service: ' +
                (newRelationshipResult.reason || 'unknown'),
                { step: 'createNewService' });
        }

        var newRelationshipId = newRelationshipResult.data.relationshipId;
        var newHouseholdId = newRelationshipResult.data.householdId;

        var terminateResult = terminateService(currentEmployerId, servantId, {
            endYear: transferYear,
            reason: 'Transferred to ' + newEmployer.name + "'s household",
            removeFromHousehold: true,
            recordHistory: false
        });

        if (!terminateResult.success) {
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
                (servant.name || 'Servant') + ' transferred from ' +
                (currentEmployer.name || 'employer') + ' to ' +
                (newEmployer.name || 'employer'),
                [servant, currentEmployer, newEmployer]);
        }

        return _ok({
            servantId: servantId,
            fromEmployerId: currentEmployerId,
            toEmployerId: newEmployerId,
            newRelationshipId: newRelationshipId,
            year: transferYear,
            wage: newWage,
            householdPersisted: terminateResult.data
                ? terminateResult.data.householdPersisted
                : null,
            relationshipPersisted: terminateResult.data
                ? terminateResult.data.relationshipPersisted
                : null
        });
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    var api = {
        SERVICE_TYPES: C.SERVICE_TYPES,
        SERVICE_STATUS: C.SERVICE_STATUS,
        SERVICE_QUALITY: C.SERVICE_QUALITY,
        SERVICE_QUALITY_ORDER: C.SERVICE_QUALITY_ORDER,
        SERVICE_CONTRACT_TERMS: C.SERVICE_CONTRACT_TERMS,

        calculateServiceQuality: calculateServiceQuality,
        calculateRecommendation: calculateRecommendation,

        createServiceRelationship: createServiceRelationship,
        terminateService: terminateService,
        promoteServant: promoteServant,
        adjustServantWages: adjustServantWages,
        recordEmployerSatisfaction: recordEmployerSatisfaction,
        updateServiceQuality: updateServiceQuality,

        getServiceBetween: getServiceBetween,
        getServants: getServants,
        getEmployer: getEmployer,
        getActiveService: getActiveService,
        getServiceHistory: getServiceHistory,
        getServiceQuality: getServiceQuality,
        generateServiceReference: generateServiceReference,
        getStaffByDepartment: getStaffByDepartment,

        assignServantToDepartment: assignServantToDepartment,
        transferServantToHousehold: transferServantToHousehold
    };

    window.HouseholdServant = api;

    // =========================================================================
    // 9. LEGACY FLAT ALIASES
    // =========================================================================

    if (typeof window.SERVICE_TYPES === 'undefined') {
        window.SERVICE_TYPES = C.SERVICE_TYPES;
    }
    if (typeof window.SERVICE_STATUS === 'undefined') {
        window.SERVICE_STATUS = C.SERVICE_STATUS;
    }
    if (typeof window.SERVICE_QUALITY === 'undefined') {
        window.SERVICE_QUALITY = C.SERVICE_QUALITY;
    }
    if (typeof window.SERVICE_QUALITY_ORDER === 'undefined') {
        window.SERVICE_QUALITY_ORDER = C.SERVICE_QUALITY_ORDER;
    }
    if (typeof window.SERVICE_CONTRACT_TERMS === 'undefined') {
        window.SERVICE_CONTRACT_TERMS = C.SERVICE_CONTRACT_TERMS;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

})();
