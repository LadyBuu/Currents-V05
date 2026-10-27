/**
 * =============================================================================
 * STILL WATERS - CHARACTER STATE (js/character/character-state.js)
 * =============================================================================
 *
 * Canonical runtime owner of character data.
 *
 * SCOPE:
 *   - Canonical runtime reference to the character collection
 *   - Derived indexes over character-owned fields
 *   - Subscription mechanism for change notifications
 *   - Reactive rebuild in response to canonical mutation events
 *   - Low-level mutation primitives (add, remove, update, batch)
 *   - Internal live-reference access for authorized mutation code
 *   - Ephemeral UI state (facade compatibility surface only)
 *
 * OWNERSHIP:
 *   CharacterState owns the runtime representation of canonical character
 *   data. storage.js persists it. accessors.js is a legacy compatibility
 *   facade and is consulted only at initial load.
 *
 *   CharacterState does NOT own:
 *     - family semantics            -> family-rules.js / family-queries.js
 *     - mortality policy            -> mortality-rules.js
 *     - lifecycle orchestration     -> character-lifecycle.js
 *     - professional semantics      -> role / professional domain
 *     - relationship semantics      -> relationship domain
 *     - location movement history   -> location-*
 *     - rank semantics              -> rank domain
 *     - domain rule validation      -> each domain's own rules module
 *
 * DEATH FIELDS:
 *   The character record carries the canonical death information:
 *
 *       isDeceased            boolean
 *       deathYear             number | null
 *       deathCause            string  (stable id: natural | disease |
 *                                      accident | murder | execution |
 *                                      childbed_fever | unknown)
 *       deathCauseDetail      string  (free text: 'Pneumonia', 'Treason')
 *       deathNotes            string
 *       isMurder              boolean
 *       killerId              string | null
 *       murderMotive          string | null
 *       murderMethod          string | null
 *       isExecution           boolean
 *       executionReason       string | null
 *       executionMethod       string | null
 *       executionLocation     string | null
 *
 *   These fields are character-owned. They are written only through
 *   CharacterCommands.markDeceased. They are read through MortalityQueries.
 *
 * DOMAIN-OWNED EMBEDDED FIELDS:
 *   The character record also carries embedded containers owned by other
 *   domains. They are NOT character-owned. The generic updateCharacter /
 *   updateCharacters path refuses them; only applyDomainFieldPatch may write
 *   them, and only CharacterCommands calls applyDomainFieldPatch.
 *
 *       professions             -> CharacterCommands (profession API)
 *       rankAssignments         -> CharacterCommands (rank API)
 *       activeRankId            -> CharacterCommands (rank API, derived)
 *       activeRankNumber        -> CharacterCommands (rank API, derived)
 *       education               -> CharacterCommands (education API)
 *       educationHistory        -> CharacterCommands (education API)
 *       subjectProgress         -> CharacterCommands (education API)
 *       isLiterate              -> CharacterCommands (education API)
 *       relationships           -> RelationshipCommands
 *       friends                 -> RelationshipCommands
 *       apprenticeshipDetails   -> ApprenticeshipCommands
 *       apprentices             -> ApprenticeshipCommands
 *       isDeleted, deletedAt    -> CharacterDeletionCommands
 *
 * REMOVED FIELDS:
 *   The parent-child compatibility mirrors (motherId, fatherId, children,
 *   adoptedParents, adoptedChildren) are no longer part of the character
 *   record. Family relationships live in FamilyState (family-state.js).
 *
 * MUTATION PRIMITIVES:
 *   - updateCharacter(id, patch)          character-owned field patch
 *   - updateCharacters(changes)           batch character-owned field patch
 *   - applyDomainFieldPatch(id, patch)    embedded domain field write
 *   - addCharacter(character)             append a fully-built character
 *   - addCharacters(characters)           append many fully-built characters
 *   - removeCharacter(id)                 delete from collection
 *   - removeCharacters(ids)               delete many from collection
 *
 * READ CONTRACT:
 *   Public reads return defensive projections or IDs. No public read
 *   returns a live canonical character object. Authorized mutation code
 *   calls _getLiveCharacterForMutation(id).
 *
 * ACCESSOR CACHE CONTRACT:
 *   accessors.js maintains an id -> record cache used by getCharacterById.
 *   Every mutation of the character collection invalidates that cache via
 *   window.invalidateAccessorCaches(). Without this, getCharacterById
 *   returns stale records after a character write, and downstream consumers
 *   (relationship commands, family queries, rank queries, education
 *   commands, UIs) read the pre-mutation shape.
 *
 *   The invalidation happens at the memory-write boundary (_emitChange),
 *   not at persistence time, because the cache mirrors canonical memory,
 *   not storage.
 *
 * SEMANTIC RULES:
 *   - Missing data is not fabricated. Missing character -> null.
 *     Missing collection -> [].
 *   - Year 0 is preserved.
 *   - isDeceased === undefined means living. Any other non-boolean value
 *     is malformed and excluded from byStatus.
 *   - gender is normalized to 'male' | 'female' | 'unknown'.
 *   - A field is indexed only if present and non-empty.
 *
 * NAMESPACE OWNERSHIP
 * -------------------
 *   This file is the SINGLE owner of window.CharacterState. The historical
 *   js/core/character-state.js UI shim was removed in a prior fix. The
 *   shim's surface (selectedCharId, ageGroupCollapsedState, selectedChildId,
 *   selectedGuardianId, selectedGuardianType, selectedPartnerId,
 *   adoptRelationshipCache, adoptChildAgeGapCache, currentSelectedChildId,
 *   setSelectedCharacter, hasSelectedCharacter, clearAdoptionCache, reset)
 *   is provided here as a compatibility block backed by this module's own
 *   ephemeral UI state.
 *
 *   A collision guard at the top of this file throws if
 *   window.CharacterState was already defined by another module when this
 *   file loads. That makes any future accidental duplication loud instead
 *   of silent.
 *
 * DEPENDENCIES (REQUIRED):
 *   - storage.js:   masterData, markDataDirty
 *   - accessors.js: getCharacters (initial load only)
 *
 * DEPENDENCIES (OPTIONAL, called defensively):
 *   - accessors.js: invalidateAccessorCaches. If absent, no-op.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. COLLISION GUARD
    // =========================================================================
    //
    // If another module has already claimed window.CharacterState, refuse
    // to load. Silent clobbering is how the other namespace collisions
    // happened. The core UI shim was removed in a prior fix; there must be
    // exactly one CharacterState in the tree.

    if (typeof window.CharacterState !== 'undefined'
        && window.CharacterState.__owner !== 'character/character-state.js') {
        throw new Error(
            'character/character-state.js: window.CharacterState is already ' +
            'defined by another module. There must be exactly one ' +
            'CharacterState in the tree.'
        );
    }

    // =========================================================================
    // 1. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var required = ['getCharacters', 'masterData', 'markDataDirty'];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'character-state.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 2. CHARACTER-OWNED FIELDS
    // =========================================================================
    //
    // Fields the generic updateCharacter / updateCharacters path will accept.
    // Anything not listed here (and not the id) is refused.
    //
    // Domain-owned embedded fields (professions, rankAssignments,
    // activeRankId, activeRankNumber, education, educationHistory,
    // subjectProgress, isLiterate, relationships, friends,
    // apprenticeshipDetails, apprentices, isDeleted, deletedAt) are
    // deliberately absent. They are written via applyDomainFieldPatch by
    // the owning domain's commands.

    var _CHARACTER_OWNED_FIELDS = {
        // Identity
        name: true,
        surname: true,
        surnameSource: true,
        surnameRules: true,
        surnameHistory: true,

        // Demographics
        gender: true,
        attraction: true,
        birthYear: true,
        isLegitimate: true,

        // Life / death
        isDeceased: true,
        deathYear: true,
        deathCause: true,
        deathCauseDetail: true,
        deathNotes: true,
        isMurder: true,
        killerId: true,
        murderMotive: true,
        murderMethod: true,
        isExecution: true,
        executionReason: true,
        executionMethod: true,
        executionLocation: true,

        // Location and movement
        birthplaceId: true,
        currentLocationId: true,
        moves: true,
        household: true,
        householdHistory: true,

        // Religion / culture
        religionId: true,
        religionHistory: true,
        cultureId: true,

        // Presentation
        epithet: true,
        notes: true,
        appearance: true,

        // Apprenticeship identity pointer (character-owned scalar)
        // NOTE: apprenticeshipDetails and apprentices are domain-owned and
        // are deliberately NOT listed here.
        isMaster: true,
        masterId: true,
        masterProfessionId: true,

        // Friendship details blob (character-owned legacy container)
        // NOTE: friends is domain-owned and is deliberately NOT listed here.
        friendshipDetails: true,

        // Metadata
        createdAt: true,
        updatedAt: true
    };

    // =========================================================================
    // 3. INTERNAL STATE
    // =========================================================================

    var _characters = [];
    var _byId = new Map();

    var _cache = {
        byName: new Map(),
        byCurrentLocation: new Map(),
        byBirthplace: new Map(),
        byHousehold: new Map(),
        byStatus: new Map(),
        byGender: new Map(),
        byProfession: new Map(),
        byRank: new Map(),
        byBirthDecade: new Map(),
        byReligion: new Map(),
        byCulture: new Map()
    };

    var _subscribers = [];

    var _rebuilding = false;
    var _rebuildPending = false;

    // Ephemeral UI state — facade compatibility surface only.
    // This is NOT canonical data. It does not go into masterData, does
    // not survive reload, and is not persisted anywhere.
    //
    // Fields:
    //   selectedCharId           — currently open character in the panel
    //   ageGroupCollapsedState   — { [groupKey]: boolean } collapse map
    //   selectedChildId          — child selection in adoption/parentage UI
    //   selectedGuardianId       — guardian selection in adoption/ward UI
    //   selectedGuardianType     — 'legal' | 'guardianship' | 'foster' | null
    //   selectedPartnerId        — partner selection in relationship UI
    //   adoptRelationshipCache   — adoption relationship lookup cache
    //   adoptChildAgeGapCache    — adoption age-gap lookup cache
    //   currentSelectedChildId   — the "currently focused" child in the
    //                              adoption form (may differ from
    //                              selectedChildId during editing)
    var _uiState = {
        selectedCharId: null,
        ageGroupCollapsedState: {},
        selectedChildId: null,
        selectedGuardianId: null,
        selectedGuardianType: null,
        selectedPartnerId: null,
        adoptRelationshipCache: null,
        adoptChildAgeGapCache: null,
        currentSelectedChildId: null
    };

    // =========================================================================
    // 4. INTERNAL HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _pushToIndex(map, key, value) {
        var bucket = map.get(key);
        if (!bucket) {
            bucket = [];
            map.set(key, bucket);
        }
        bucket.push(value);
    }

    function _birthDecadeKey(birthYear) {
        if (typeof birthYear !== 'number'
            || !Number.isFinite(birthYear)
            || !Number.isInteger(birthYear)) {
            return null;
        }
        var decade = Math.floor(birthYear / 10) * 10;
        return 'decade_' + decade;
    }

    function _normalizeGender(gender) {
        if (gender === 'male' || gender === 'female') return gender;
        return 'unknown';
    }

    function _normalizeStatus(isDeceased) {
        if (isDeceased === true) return 'deceased';
        if (isDeceased === false || isDeceased === undefined) return 'living';
        return null;
    }

    // =========================================================================
    // 5. CACHE REBUILD
    // =========================================================================

    function _clearCaches() {
        _byId.clear();
        var keys = Object.keys(_cache);
        for (var i = 0; i < keys.length; i++) {
            _cache[keys[i]].clear();
        }
    }

    function _rebuildCaches() {
        if (_rebuilding) {
            _rebuildPending = true;
            return;
        }
        _rebuilding = true;
        try {
            do {
                _rebuildPending = false;
                _doRebuild();
            } while (_rebuildPending);
        } finally {
            _rebuilding = false;
        }
    }

    function _doRebuild() {
        _clearCaches();
        _characters = window.getCharacters();
        var characters = _characters;

        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (!c || !_hasId(c.id)) continue;

            _byId.set(c.id, c);

            var fullName = (typeof c.name === 'string' ? c.name : '')
                + ' '
                + (typeof c.surname === 'string' ? c.surname : '');
            var nameKey = fullName.trim().toLowerCase();
            if (nameKey.length > 0) {
                _pushToIndex(_cache.byName, nameKey, c);
            }

            if (_hasId(c.currentLocationId)) {
                _pushToIndex(_cache.byCurrentLocation, c.currentLocationId, c);
            }

            if (_hasId(c.birthplaceId)) {
                _pushToIndex(_cache.byBirthplace, c.birthplaceId, c);
            }

            if (_hasId(c.household)) {
                _pushToIndex(_cache.byHousehold, c.household, c);
            }

            var status = _normalizeStatus(c.isDeceased);
            if (status !== null) {
                _pushToIndex(_cache.byStatus, status, c);
            }

            _pushToIndex(_cache.byGender, _normalizeGender(c.gender), c);

            if (Array.isArray(c.professions)) {
                var seenProf = new Set();
                for (var j = 0; j < c.professions.length; j++) {
                    var prof = c.professions[j];
                    if (!prof || !_hasId(prof.id)) continue;
                    if (seenProf.has(prof.id)) continue;
                    seenProf.add(prof.id);
                    _pushToIndex(_cache.byProfession, prof.id, c);
                }
            }

            // Active rank index: only the currently active rank id.
            if (_hasId(c.activeRankId)) {
                _pushToIndex(_cache.byRank, c.activeRankId, c);
            }

            var decadeKey = _birthDecadeKey(c.birthYear);
            if (decadeKey) {
                _pushToIndex(_cache.byBirthDecade, decadeKey, c);
            }

            if (_hasId(c.religionId)) {
                _pushToIndex(_cache.byReligion, c.religionId, c);
            }

            if (_hasId(c.cultureId)) {
                _pushToIndex(_cache.byCulture, c.cultureId, c);
            }
        }
    }

    // =========================================================================
    // 6. NOTIFICATIONS
    // =========================================================================

    function _notifySubscribers(event) {
        var snapshot = _subscribers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](event);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('character-state.js: subscriber threw:', e);
                }
            }
        }
    }

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    function _emitChange(action, characterIds) {
        window.markDataDirty();
        _rebuildCaches();
        _invalidateAccessorCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: action,
            characterIds: characterIds || []
        });
        try {
            window.dispatchEvent(new CustomEvent('characterChanged', {
                detail: {
                    action: action,
                    characterIds: characterIds || []
                }
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('character-state.js: event dispatch failed:', e);
            }
        }
    }

    // =========================================================================
    // 7. EVENT SUBSCRIPTIONS (STATE REFRESH)
    // =========================================================================

    function _handleCharacterChanged(event) {
        _rebuildCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: event && event.detail ? event.detail.action : null,
            characterIds: event && event.detail && Array.isArray(event.detail.characterIds)
                ? event.detail.characterIds
                : []
        });
    }

    function _handleMasterDataUpdated() {
        _rebuildCaches();
        _invalidateAccessorCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: 'reload',
            characterIds: []
        });
    }

    window.addEventListener('characterChanged', _handleCharacterChanged);
    window.addEventListener('masterDataUpdated', _handleMasterDataUpdated);

    // =========================================================================
    // 8. SUBSCRIPTION MANAGEMENT
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('CharacterState.subscribe: callback must be a function');
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var index = _subscribers.indexOf(callback);
            if (index !== -1) _subscribers.splice(index, 1);
        };
    }

    // =========================================================================
    // 9. INTERNAL LIVE-REFERENCE ACCESS (AUTHORIZED MUTATION ONLY)
    // =========================================================================

    function _getLiveCharacterForMutation(id) {
        if (!_hasId(id)) return null;
        return _byId.get(id) || null;
    }

    // =========================================================================
    // 10. PROJECTION HELPERS
    // =========================================================================
    //
    // A projection is a shallow, defensive copy of the character for external
    // consumers. It includes the fields every reader is expected to see:
    // identity, demographics, life/death, location, religion/culture,
    // presentation, and the embedded domain containers that other domains
    // need to read.
    //
    // The projections are "deep enough": container arrays and objects owned
    // by the character are copied so a caller cannot mutate canonical state
    // through a projection. Nested objects inside container elements are
    // shared by reference — mutating them is a caller bug.

    function _cloneProfessions(professions) {
        if (!Array.isArray(professions)) return [];
        var out = [];
        for (var i = 0; i < professions.length; i++) {
            var p = professions[i];
            if (!p) continue;
            out.push({
                id: p.id,
                name: p.name,
                skillLevel: p.skillLevel,
                startYear: _isMissing(p.startYear) ? null : p.startYear,
                primary: p.primary === true,
                notes: typeof p.notes === 'string' ? p.notes : '',
                specs: Array.isArray(p.specs) ? p.specs.slice() : [],
                baseSalary: typeof p.baseSalary === 'number' ? p.baseSalary : 0,
                customSalary: _isMissing(p.customSalary) ? null : p.customSalary,
                salaryHistory: Array.isArray(p.salaryHistory)
                    ? p.salaryHistory.slice()
                    : [],
                salaryLastCalculated: _isMissing(p.salaryLastCalculated)
                    ? null
                    : p.salaryLastCalculated,
                paysSalary: p.paysSalary === undefined ? true : p.paysSalary === true
            });
        }
        return out;
    }

    function _cloneNumberInfo(number) {
        if (!number || typeof number !== 'object') return null;
        return {
            rawNumber: typeof number.rawNumber === 'number'
                ? number.rawNumber
                : null,
            display: typeof number.display === 'string'
                ? number.display
                : null,
            type: typeof number.type === 'string' ? number.type : null,
            groupId: _isMissing(number.groupId) ? null : number.groupId,
            holdersInGroup: (typeof number.holdersInGroup === 'number'
                && Number.isFinite(number.holdersInGroup))
                ? number.holdersInGroup
                : null
        };
    }

    function _cloneRankAssignments(rankAssignments) {
        if (!Array.isArray(rankAssignments)) return [];
        var out = [];
        for (var i = 0; i < rankAssignments.length; i++) {
            var a = rankAssignments[i];
            if (!a) continue;
            out.push({
                rankId: a.rankId,
                customTitle: _isMissing(a.customTitle) ? null : a.customTitle,
                address: _isMissing(a.address) ? null : a.address,
                number: _cloneNumberInfo(a.number),
                order: typeof a.order === 'number' ? a.order : 10,
                isActive: a.isActive === true,
                isDeprecated: a.isDeprecated === true,
                assignedYear: _isMissing(a.assignedYear) ? null : a.assignedYear,
                notes: typeof a.notes === 'string' ? a.notes : '',
                inheritedFrom: _isMissing(a.inheritedFrom) ? null : a.inheritedFrom
            });
        }
        return out;
    }

    function _project(c) {
        if (!c || !_hasId(c.id)) return null;
        return {
            id: c.id,
            name: typeof c.name === 'string' ? c.name : '',
            surname: typeof c.surname === 'string' ? c.surname : '',
            gender: _isMissing(c.gender) ? 'unknown' : c.gender,
            birthYear: _isMissing(c.birthYear) ? null : c.birthYear,
            isDeceased: c.isDeceased === true,
            deathYear: _isMissing(c.deathYear) ? null : c.deathYear,
            deathCause: _isMissing(c.deathCause) ? null : c.deathCause,
            deathCauseDetail: _isMissing(c.deathCauseDetail) ? null : c.deathCauseDetail,
            deathNotes: _isMissing(c.deathNotes) ? null : c.deathNotes,
            isMurder: c.isMurder === true,
            killerId: _isMissing(c.killerId) ? null : c.killerId,
            murderMotive: _isMissing(c.murderMotive) ? null : c.murderMotive,
            murderMethod: _isMissing(c.murderMethod) ? null : c.murderMethod,
            isExecution: c.isExecution === true,
            executionReason: _isMissing(c.executionReason) ? null : c.executionReason,
            executionMethod: _isMissing(c.executionMethod) ? null : c.executionMethod,
            executionLocation: _isMissing(c.executionLocation) ? null : c.executionLocation,
            birthplaceId: _isMissing(c.birthplaceId) ? null : c.birthplaceId,
            currentLocationId: _isMissing(c.currentLocationId) ? null : c.currentLocationId,
            household: _isMissing(c.household) ? null : c.household,
            religionId: _isMissing(c.religionId) ? null : c.religionId,
            cultureId: _isMissing(c.cultureId) ? null : c.cultureId,

            // Embedded domain containers, defensively cloned.
            professions: _cloneProfessions(c.professions),
            rankAssignments: _cloneRankAssignments(c.rankAssignments),

            // Active rank pointers. Derived by CharacterCommands; read here
            // for the character summary and cross-domain readers.
            activeRankId: _isMissing(c.activeRankId) ? null : c.activeRankId,
            activeRankNumber: (typeof c.activeRankNumber === 'number'
                && Number.isFinite(c.activeRankNumber))
                ? c.activeRankNumber
                : null,

            // Education containers. Cloned shallowly: the container itself
            // is copied, but nested per-institution and per-subject objects
            // remain shared by reference. Reads are safe; mutation is a bug.
            education: _isPlainObject(c.education)
                ? Object.assign({}, c.education)
                : {},
            educationHistory: Array.isArray(c.educationHistory)
                ? c.educationHistory.slice()
                : [],
            subjectProgress: _isPlainObject(c.subjectProgress)
                ? Object.assign({}, c.subjectProgress)
                : {},
            isLiterate: c.isLiterate === true,

            epithet: _isMissing(c.epithet) ? '' : c.epithet,
            notes: _isMissing(c.notes) ? '' : c.notes,
            appearance: c.appearance && typeof c.appearance === 'object'
                ? Object.assign({}, c.appearance)
                : {},
            isDeleted: c.isDeleted === true,
            createdAt: _isMissing(c.createdAt) ? null : c.createdAt,
            updatedAt: _isMissing(c.updatedAt) ? null : c.updatedAt
        };
    }

    function _projectArray(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var p = _project(list[i]);
            if (p) out.push(p);
        }
        return out;
    }

    // =========================================================================
    // 11. PUBLIC API - COLLECTION READ
    // =========================================================================

    function getAllCharacters() {
        return _projectArray(_characters);
    }

    function getTotalCharacterCount() {
        return _characters.length;
    }

    function getCharacter(id) {
        if (!_hasId(id)) return null;
        var c = _byId.get(id);
        return c ? _project(c) : null;
    }

    function getCharacterId(id) {
        if (!_hasId(id)) return null;
        return _byId.has(id) ? id : null;
    }

    function hasCharacter(id) {
        if (!_hasId(id)) return false;
        return _byId.has(id);
    }

    // =========================================================================
    // 12. PUBLIC API - INDEX QUERIES (PROJECTIONS)
    // =========================================================================

    function getCharactersByCurrentLocation(locationId) {
        if (!_hasId(locationId)) return [];
        var bucket = _cache.byCurrentLocation.get(locationId);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByBirthplace(locationId) {
        if (!_hasId(locationId)) return [];
        var bucket = _cache.byBirthplace.get(locationId);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByHousehold(householdId) {
        if (!_hasId(householdId)) return [];
        var bucket = _cache.byHousehold.get(householdId);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByStatus(status) {
        if (status !== 'living' && status !== 'deceased') {
            throw new Error(
                "CharacterState.getCharactersByStatus: status must be 'living' or 'deceased'"
            );
        }
        var bucket = _cache.byStatus.get(status);
        return bucket ? _projectArray(bucket) : [];
    }

    function getLivingCharacters() {
        var bucket = _cache.byStatus.get('living');
        return bucket ? _projectArray(bucket) : [];
    }

    function getDeceasedCharacters() {
        var bucket = _cache.byStatus.get('deceased');
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByGender(gender) {
        if (gender !== 'male' && gender !== 'female' && gender !== 'unknown') {
            throw new Error(
                "CharacterState.getCharactersByGender: gender must be 'male', 'female', or 'unknown'"
            );
        }
        var bucket = _cache.byGender.get(gender);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByProfession(roleId) {
        if (!_hasId(roleId)) return [];
        var bucket = _cache.byProfession.get(roleId);
        return bucket ? _projectArray(bucket) : [];
    }

    /**
     * Returns characters whose ACTIVE rank matches rankId.
     *
     * This index reflects activeRankId only. To find characters whose
     * rankAssignments include a rank regardless of active state, use
     * RankQueries.getCharactersWithRank, which scans the assignment array.
     */
    function getCharactersByRank(rankId) {
        if (!_hasId(rankId)) return [];
        var bucket = _cache.byRank.get(rankId);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByBirthDecade(decadeStartYear) {
        if (typeof decadeStartYear !== 'number'
            || !Number.isFinite(decadeStartYear)
            || !Number.isInteger(decadeStartYear)
            || decadeStartYear % 10 !== 0) {
            throw new Error(
                'CharacterState.getCharactersByBirthDecade: decadeStartYear must be an integer divisible by 10'
            );
        }
        var key = 'decade_' + decadeStartYear;
        var bucket = _cache.byBirthDecade.get(key);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByReligion(religionId) {
        if (!_hasId(religionId)) return [];
        var bucket = _cache.byReligion.get(religionId);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByCulture(cultureId) {
        if (!_hasId(cultureId)) return [];
        var bucket = _cache.byCulture.get(cultureId);
        return bucket ? _projectArray(bucket) : [];
    }

    function searchByName(query) {
        if (_isMissing(query)) return getAllCharacters();
        if (typeof query !== 'string') {
            throw new Error('CharacterState.searchByName: query must be a string');
        }
        var lower = query.trim().toLowerCase();
        if (lower.length === 0) return getAllCharacters();

        var result = [];
        _cache.byName.forEach(function (chars, key) {
            if (key.indexOf(lower) !== -1) {
                for (var i = 0; i < chars.length; i++) result.push(chars[i]);
            }
        });
        return _projectArray(result);
    }

    // =========================================================================
    // 13. WRITE PRIMITIVES - VALIDATION
    // =========================================================================

    function _isCharacterOwnedField(key) {
        return Object.prototype.hasOwnProperty.call(_CHARACTER_OWNED_FIELDS, key);
    }

    function _validateCharacterOwnedPatch(updates) {
        if (!_isPlainObject(updates)) {
            return { ok: false, reason: 'Updates object is required.' };
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'id')) {
            return { ok: false, reason: 'Character id cannot be changed.' };
        }
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (!_isCharacterOwnedField(key)) {
                return {
                    ok: false,
                    reason: 'Field "' + key + '" is not character-owned. ' +
                            'Use the owning domain\'s command.'
                };
            }
        }
        return { ok: true };
    }

    function _validateDomainPatch(updates) {
        if (!_isPlainObject(updates)) {
            return { ok: false, reason: 'Updates object is required.' };
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'id')) {
            return { ok: false, reason: 'Character id cannot be changed.' };
        }
        return { ok: true };
    }

    function _getCanonicalCollection() {
        var collection = window.masterData
            && window.masterData.data
            && window.masterData.data.characters;
        if (!Array.isArray(collection)) {
            return { ok: false, reason: 'Canonical character collection is not an array.' };
        }
        return { ok: true, collection: collection };
    }

    function _findCanonicalIndex(collection, id) {
        for (var i = 0; i < collection.length; i++) {
            var c = collection[i];
            if (c && c.id === id) return i;
        }
        return -1;
    }

    // =========================================================================
    // 14. WRITE PRIMITIVES - CHARACTER-OWNED FIELD UPDATES
    // =========================================================================

    function updateCharacter(characterId, updates) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'Character id is required.' };
        }
        var check = _validateCharacterOwnedPatch(updates);
        if (!check.ok) return { success: false, reason: check.reason };

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var idx = _findCanonicalIndex(coll.collection, characterId);
        if (idx === -1) {
            return { success: false, reason: 'Character not found in canonical collection.' };
        }

        var target = coll.collection[idx];
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (key === 'id') continue;
            target[key] = updates[key];
        }

        _emitChange('updated', [characterId]);
        return { success: true };
    }

    function updateCharacters(changes) {
        if (!Array.isArray(changes)) {
            return { success: false, reason: 'changes must be an array.' };
        }
        if (changes.length === 0) return { success: true };

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var index = {};
        for (var c = 0; c < coll.collection.length; c++) {
            var ch = coll.collection[c];
            if (ch && _hasId(ch.id)) index[ch.id] = ch;
        }

        var seenIds = {};
        var validated = [];
        for (var i = 0; i < changes.length; i++) {
            var change = changes[i];
            if (!change || typeof change !== 'object') {
                return { success: false, reason: 'Change at index ' + i + ' is not an object.' };
            }
            if (!_hasId(change.id)) {
                return { success: false, reason: 'Change at index ' + i + ' has no id.' };
            }
            if (seenIds[change.id]) {
                return { success: false, reason: 'Duplicate character id in batch: ' + change.id };
            }
            seenIds[change.id] = true;

            var check = _validateCharacterOwnedPatch(change.updates);
            if (!check.ok) {
                return { success: false, reason: 'Change at index ' + i + ': ' + check.reason };
            }
            if (!index[change.id]) {
                return { success: false, reason: 'Character "' + change.id + '" not found.' };
            }
            validated.push({ id: change.id, updates: change.updates });
        }

        var affectedIds = [];
        for (var j = 0; j < validated.length; j++) {
            var target = index[validated[j].id];
            var patch = validated[j].updates;
            for (var key in patch) {
                if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
                if (key === 'id') continue;
                target[key] = patch[key];
            }
            affectedIds.push(validated[j].id);
        }

        _emitChange('bulk-updated', affectedIds);
        return { success: true };
    }

    function applyDomainFieldPatch(characterId, updates) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'Character id is required.' };
        }
        var check = _validateDomainPatch(updates);
        if (!check.ok) return { success: false, reason: check.reason };

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var idx = _findCanonicalIndex(coll.collection, characterId);
        if (idx === -1) {
            return { success: false, reason: 'Character not found in canonical collection.' };
        }

        var target = coll.collection[idx];
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (key === 'id') continue;
            target[key] = updates[key];
        }

        _emitChange('domain-updated', [characterId]);
        return { success: true };
    }

    // =========================================================================
    // 15. WRITE PRIMITIVES - COLLECTION MEMBERSHIP
    // =========================================================================

    function addCharacter(character) {
        if (!_isPlainObject(character)) {
            return { success: false, reason: 'Character must be a plain object.' };
        }
        if (!_hasId(character.id)) {
            return { success: false, reason: 'Character id is required.' };
        }
        if (typeof character.name !== 'string' || character.name.trim() === '') {
            return { success: false, reason: 'Character name is required.' };
        }

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        if (_findCanonicalIndex(coll.collection, character.id) !== -1) {
            return { success: false, reason: 'Character id already exists: ' + character.id };
        }

        coll.collection.push(character);
        _emitChange('create', [character.id]);
        return { success: true, character: character };
    }

    function addCharacters(characters) {
        if (!Array.isArray(characters)) {
            return { success: false, reason: 'characters must be an array.' };
        }
        if (characters.length === 0) return { success: true, characterIds: [] };

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var existingIds = {};
        for (var i = 0; i < coll.collection.length; i++) {
            var c = coll.collection[i];
            if (c && _hasId(c.id)) existingIds[c.id] = true;
        }

        var seen = {};
        for (var j = 0; j < characters.length; j++) {
            var ch = characters[j];
            if (!_isPlainObject(ch)) {
                return { success: false, reason: 'Character at index ' + j + ' is not a plain object.' };
            }
            if (!_hasId(ch.id)) {
                return { success: false, reason: 'Character at index ' + j + ' has no id.' };
            }
            if (typeof ch.name !== 'string' || ch.name.trim() === '') {
                return { success: false, reason: 'Character at index ' + j + ' has no name.' };
            }
            if (existingIds[ch.id]) {
                return { success: false, reason: 'Character id already exists: ' + ch.id };
            }
            if (seen[ch.id]) {
                return { success: false, reason: 'Duplicate id in batch: ' + ch.id };
            }
            seen[ch.id] = true;
        }

        var addedIds = [];
        for (var k = 0; k < characters.length; k++) {
            coll.collection.push(characters[k]);
            addedIds.push(characters[k].id);
        }

        _emitChange('bulk-create', addedIds);
        return { success: true, characterIds: addedIds };
    }

    function removeCharacter(id) {
        if (!_hasId(id)) {
            return { success: false, reason: 'Character id is required.' };
        }

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var idx = _findCanonicalIndex(coll.collection, id);
        if (idx === -1) {
            return { success: false, reason: 'Character not found.' };
        }

        var removed = coll.collection[idx];
        coll.collection.splice(idx, 1);

        _emitChange('delete', [id]);
        return { success: true, character: removed };
    }

    function removeCharacters(ids) {
        if (!Array.isArray(ids)) {
            return { success: false, reason: 'ids must be an array.' };
        }
        if (ids.length === 0) return { success: true, characterIds: [] };

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var idSet = {};
        for (var i = 0; i < ids.length; i++) {
            if (!_hasId(ids[i])) {
                return { success: false, reason: 'Invalid id at index ' + i + '.' };
            }
            idSet[ids[i]] = true;
        }

        var next = [];
        var removedIds = [];
        for (var j = 0; j < coll.collection.length; j++) {
            var c = coll.collection[j];
            if (c && _hasId(c.id) && idSet[c.id]) {
                removedIds.push(c.id);
                continue;
            }
            next.push(c);
        }

        if (removedIds.length === 0) {
            return { success: true, characterIds: [] };
        }

        coll.collection.length = 0;
        for (var k = 0; k < next.length; k++) coll.collection.push(next[k]);

        _emitChange('bulk-delete', removedIds);
        return { success: true, characterIds: removedIds };
    }

    // =========================================================================
    // 16. MANUAL REFRESH
    // =========================================================================

    function refresh() {
        _rebuildCaches();
        _invalidateAccessorCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: 'refresh',
            characterIds: []
        });
    }

    // =========================================================================
    // 17. FACADE COMPATIBILITY SURFACE
    // =========================================================================
    //
    // The historical js/core/character-state.js UI shim was removed in a
    // prior fix. Its surface is provided here so core/state.js continues to
    // work unchanged.
    //
    // These read/write _uiState (declared in section 3). They do NOT touch
    // the character catalogue, do NOT call markDataDirty, and do NOT
    // publish events on the state channel — the UI state is ephemeral and
    // not part of the character collection's persistence contract.

    function _getSelectedCharId() {
        return _uiState.selectedCharId;
    }

    function _setSelectedCharId(value) {
        _uiState.selectedCharId = value;
    }

    function _getAgeGroupCollapsedState() {
        return _uiState.ageGroupCollapsedState;
    }

    function _setAgeGroupCollapsedState(value) {
        _uiState.ageGroupCollapsedState = value;
    }

    function _getSelectedChildId() {
        return _uiState.selectedChildId;
    }

    function _setSelectedChildId(value) {
        _uiState.selectedChildId = value;
    }

    function _getSelectedGuardianId() {
        return _uiState.selectedGuardianId;
    }

    function _setSelectedGuardianId(value) {
        _uiState.selectedGuardianId = value;
    }

    function _getSelectedGuardianType() {
        return _uiState.selectedGuardianType;
    }

    function _setSelectedGuardianType(value) {
        _uiState.selectedGuardianType = value;
    }

    function _getSelectedPartnerId() {
        return _uiState.selectedPartnerId;
    }

    function _setSelectedPartnerId(value) {
        _uiState.selectedPartnerId = value;
    }

    function _getAdoptRelationshipCache() {
        return _uiState.adoptRelationshipCache;
    }

    function _getAdoptChildAgeGapCache() {
        return _uiState.adoptChildAgeGapCache;
    }

    function _getCurrentSelectedChildId() {
        return _uiState.currentSelectedChildId;
    }

    function setSelectedCharacter(id) {
        _uiState.selectedCharId = id;
    }

    function hasSelectedCharacter() {
        return _uiState.selectedCharId !== null;
    }

    function clearAdoptionCache() {
        _uiState.adoptRelationshipCache = null;
        _uiState.adoptChildAgeGapCache = null;
    }

    function reset() {
        _uiState.selectedCharId = null;
        _uiState.ageGroupCollapsedState = {};
        _uiState.selectedChildId = null;
        _uiState.selectedGuardianId = null;
        _uiState.selectedGuardianType = null;
        _uiState.selectedPartnerId = null;
        _uiState.adoptRelationshipCache = null;
        _uiState.adoptChildAgeGapCache = null;
        _uiState.currentSelectedChildId = null;
    }

    // =========================================================================
    // 18. INITIAL REBUILD
    // =========================================================================

    _rebuildCaches();

    // =========================================================================
    // 19. EXPORTS
    // =========================================================================

    window.CharacterState = {
        // Namespace ownership marker — see collision guard at top.
        __owner: 'character/character-state.js',

        subscribe: subscribe,

        getAllCharacters: getAllCharacters,
        getTotalCharacterCount: getTotalCharacterCount,
        getCharacter: getCharacter,
        getCharacterId: getCharacterId,
        hasCharacter: hasCharacter,

        getCharactersByCurrentLocation: getCharactersByCurrentLocation,
        getCharactersByBirthplace: getCharactersByBirthplace,
        getCharactersByHousehold: getCharactersByHousehold,
        getCharactersByStatus: getCharactersByStatus,
        getLivingCharacters: getLivingCharacters,
        getDeceasedCharacters: getDeceasedCharacters,
        getCharactersByGender: getCharactersByGender,
        getCharactersByProfession: getCharactersByProfession,
        getCharactersByRank: getCharactersByRank,
        getCharactersByBirthDecade: getCharactersByBirthDecade,
        getCharactersByReligion: getCharactersByReligion,
        getCharactersByCulture: getCharactersByCulture,
        searchByName: searchByName,

        updateCharacter: updateCharacter,
        updateCharacters: updateCharacters,
        applyDomainFieldPatch: applyDomainFieldPatch,

        addCharacter: addCharacter,
        addCharacters: addCharacters,
        removeCharacter: removeCharacter,
        removeCharacters: removeCharacters,

        _getLiveCharacterForMutation: _getLiveCharacterForMutation,

        refresh: refresh,

        // Facade compatibility surface (core/state.js reads these).
        get selectedCharId() { return _getSelectedCharId(); },
        set selectedCharId(v) { _setSelectedCharId(v); },
        get ageGroupCollapsedState() { return _getAgeGroupCollapsedState(); },
        set ageGroupCollapsedState(v) { _setAgeGroupCollapsedState(v); },
        get selectedChildId() { return _getSelectedChildId(); },
        set selectedChildId(v) { _setSelectedChildId(v); },
        get selectedGuardianId() { return _getSelectedGuardianId(); },
        set selectedGuardianId(v) { _setSelectedGuardianId(v); },
        get selectedGuardianType() { return _getSelectedGuardianType(); },
        set selectedGuardianType(v) { _setSelectedGuardianType(v); },
        get selectedPartnerId() { return _getSelectedPartnerId(); },
        set selectedPartnerId(v) { _setSelectedPartnerId(v); },
        get adoptRelationshipCache() { return _getAdoptRelationshipCache(); },
        get adoptChildAgeGapCache() { return _getAdoptChildAgeGapCache(); },
        get currentSelectedChildId() { return _getCurrentSelectedChildId(); },

        setSelectedCharacter: setSelectedCharacter,
        hasSelectedCharacter: hasSelectedCharacter,
        clearAdoptionCache: clearAdoptionCache,
        reset: reset
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterState;
    }
})();
