/**
 * relationship-commands.js
 *
 * Mutation and transaction boundary for relationship entities.
 * Owns ID generation and state registration.
 * Does NOT persist directly — callers pass a commit function
 * or the application's save mechanism is invoked by the top-level command.
 *
 * CONTRACT:
 *   - Every command returns { success, ... } — never throws for domain errors
 *   - Validation goes through RelationshipRules
 *   - IDs generated here
 *   - Registration goes through RelationshipState
 */

(function() {
    'use strict';

    var State = window.RelationshipState;
    var Rules = window.RelationshipRules;
    var Queries = window.RelationshipQueries;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!State || !Rules || !Queries || !STATUS) {
        throw new Error('relationship-commands.js: state, rules, queries must load first');
    }

    function _generateId() {
        if (typeof window.generateId === 'function') {
            return window.generateId('rel');
        }
        return 'rel_' + Date.now().toString(36) + '_' +
               Math.random().toString(36).substr(2, 8);
    }

    function _failure(code, message) {
        return { success: false, code: code, message: message };
    }

    function _success(data) {
        return Object.assign({ success: true }, data);
    }

    /**
     * options: {
     *   participantA, participantB (required)
     *   type (required)
     *   status (optional, default ONGOING)
     *   startYear (required)
     *   endYear (optional)
     *   attributes (optional)
     *   metadata (optional)
     * }
     */
    function create(options) {
        var validation = Rules.canCreate(options);
        if (!validation.valid) {
            return _failure('VALIDATION_FAILED', validation.errors.join('; '));
        }

        // Multiplicity check: refuse duplicate active of non-multi type
        if (!Rules.allowsMultiplePerPair(options.type)) {
            var active = Queries.getActiveBetweenOfType(
                options.participantA, options.participantB, options.type
            );
            if (active.length > 0) {
                return _failure('DUPLICATE_ACTIVE',
                    'Active ' + options.type + ' already exists between participants');
            }
        }

        // Symmetric pair check: if symmetric, A/B order is not significant
        // for the multiplicity check above, but queries already use pairKey.

        var entity = {
            id: _generateId(),
            type: options.type,
            status: options.status || STATUS.ONGOING,
            participantA: options.participantA,
            participantB: options.participantB,
            startYear: options.startYear,
            endYear: options.endYear !== undefined ? options.endYear : null,
            attributes: options.attributes ? options.attributes.slice() : [],
            metadata: options.metadata ? Object.assign({}, options.metadata) : {}
        };

        var registered = State.register(entity);
        if (!registered) {
            return _failure('REGISTRATION_FAILED', 'State rejected entity');
        }

        return _success({ relationship: Queries.getById(entity.id) });
    }

    /**
     * updates: { status, endYear, attributes, metadata }
     * Status transitions must be valid per RelationshipRules.
     */
    function update(id, updates) {
        var entity = State.get(id);
        if (!entity) return _failure('NOT_FOUND', 'Relationship not found');
        if (!updates) return _success({ relationship: Queries.getById(id) });

        if (updates.status !== undefined) {
            if (!Rules.isValidStatus(updates.status)) {
                return _failure('INVALID_STATUS', 'Unknown status: ' + updates.status);
            }
            if (updates.status !== entity.status) {
                if (!Rules.isValidTransition(entity.status, updates.status)) {
                    return _failure('INVALID_TRANSITION',
                        entity.status + ' → ' + updates.status + ' not allowed');
                }
                entity.status = updates.status;
            }
        }

        if (updates.endYear !== undefined) entity.endYear = updates.endYear;

        if (updates.attributes !== undefined) {
            var attrCheck = Rules.validateAttributes(entity.type, updates.attributes);
            if (!attrCheck.valid) {
                return _failure('INVALID_ATTRIBUTES', attrCheck.conflicts.join('; '));
            }
            entity.attributes = updates.attributes.slice();
        }

        if (updates.metadata !== undefined) {
            entity.metadata = Object.assign({}, entity.metadata || {}, updates.metadata);
        }

        return _success({ relationship: Queries.getById(id) });
    }

    function end(id, endYear, reason) {
        var entity = State.get(id);
        if (!entity) return _failure('NOT_FOUND', 'Relationship not found');
        if (entity.status !== STATUS.ONGOING) {
            return _failure('NOT_ACTIVE', 'Relationship is not active');
        }

        var updates = { status: STATUS.ENDED, endYear: endYear };
        if (reason) updates.metadata = { endReason: reason };

        return update(id, updates);
    }

    function setWidowed(id, endYear) {
        var entity = State.get(id);
        if (!entity) return _failure('NOT_FOUND', 'Relationship not found');
        if (entity.status !== STATUS.ONGOING) {
            return _failure('NOT_ACTIVE', 'Relationship is not active');
        }
        return update(id, {
            status: STATUS.WIDOWED,
            endYear: endYear,
            metadata: { endReason: 'death_of_partner' }
        });
    }

    function remove(id) {
        var ok = State.unregister(id);
        if (!ok) return _failure('NOT_FOUND', 'Relationship not found');
        return _success({ id: id });
    }

    function addAttribute(id, attribute) {
        var entity = State.get(id);
        if (!entity) return _failure('NOT_FOUND', 'Relationship not found');
        var attrs = (entity.attributes || []).slice();
        if (attrs.indexOf(attribute) !== -1) {
            return _success({ relationship: Queries.getById(id) });
        }
        attrs.push(attribute);
        return update(id, { attributes: attrs });
    }

    function removeAttribute(id, attribute) {
        var entity = State.get(id);
        if (!entity) return _failure('NOT_FOUND', 'Relationship not found');
        var attrs = (entity.attributes || []).filter(function(a) {
            return a !== attribute;
        });
        return update(id, { attributes: attrs });
    }

    window.RelationshipCommands = {
        create: create,
        update: update,
        end: end,
        setWidowed: setWidowed,
        remove: remove,
        addAttribute: addAttribute,
        removeAttribute: removeAttribute
    };

})();
