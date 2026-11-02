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
 *     - trait semantics             -> character-commands.js (trait API)
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
 *       traits                  -> CharacterCommands (trait API)
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
 *       moves                   -> location domain (via CharacterCommands)
 *
 * HOUSEHOLD REVERSE INDEX (CLARIFIED):
 *   The character record carries TWO fields that name the character's
 *   household: `household` and `householdId`. Both are the same fact
 *   expressed under two field names; the household domain writes both.
 *
 *   Historically `household` was the "display" alias and `householdId`
 *   was the "canonical" id. Today they are aliased — the household
 *   domain writes both to the same household id. Readers that only
 *   check one of them still resolve correctly.
 *
 *   BOTH fields are character-owned. HouseholdCommands (via
 *   CharacterCommands.updateCharacterFields) writes them; no other
 *   domain may. This mirrors how moves is character-owned but written
 *   only through the location domain's command surface.
 *
 *   `householdHistory` is character-owned and carries the membership
 *   timeline (join/leave entries, with the same householdId field name).
 *
 * PROJECTION CONTENTS (AUTHORITATIVE):
 *   `_project(c)` emits the following fields. This list is the SINGLE
 *   SOURCE OF TRUTH for what a character projection contains. The
 *   `CHARACTER PROJECTION CONTRACT` section in character-queries.js
 *   cross-references this list; if `_project` changes, that section
 *   must be updated.
 *
 *   Identity:
 *     id, name, surname, surnameSource, gender, birthYear, isDeceased,
 *     isLegitimate (NOT included — see BELOW-CONTRACT below), isDeleted,
 *     createdAt, updatedAt
 *
 *   Death:
 *     deathYear, deathCause, deathCauseDetail, deathNotes, isMurder,
 *     killerId, murderMotive, murderMethod, isExecution,
 *     executionReason, executionMethod, executionLocation
 *
 *   Location and movement:
 *     birthplaceId, currentLocationId, moves
 *
 *   Household:
 *     household, householdId, householdHistory
 *
 *   Religion and culture:
 *     religionId, religionHistory, cultureId
 *
 *   Embedded domain containers:
 *     traits, rankAssignments, apprentices
 *
 *   Rank pointer:
 *     activeRankId, activeRankNumber
 *
 *   Education containers:
 *     education, educationHistory, subjectProgress, isLiterate
 *
 *   Surname history:
 *     surnameHistory
 *
 *   Presentation:
 *     epithet, notes, appearance
 *
 *   BELOW-CONTRACT FIELDS (deliberately NOT projected):
 *     professions     — read via CharacterCommands.getProfessions /
 *                       getProfession. Prior revisions included it on
 *                       the projection; that violated the documented
 *                       projection contract, and settlement-prosperity-
 *                       queries.js read it off the projection instead
 *                       of the command reader. Removed. See A.1.2 in
 *                       the current refactor history and the
 *                       PROFESSION INPUT section in
 *                       settlement-prosperity-queries.js.
 *
 *     attraction      — not currently on the projection. No consumer
 *                       reads it today. If the relationship domain is
 *                       revived, add it back and document the addition
 *                       here.
 *
 *     isLegitimate    — not currently on the projection. No consumer
 *                       reads it today. Legacy field; kept on the
 *                       record but not surfaced.
 *
 *     friendshipDetails — not currently on the projection. Read via
 *                       the relationship domain's command readers.
 *
 *     apprenticeshipDetails — not currently on the projection. Read
 *                       via ApprenticeshipCommands.
 *
 *     masterId, masterProfessionId, isMaster — not currently on the
 *                       projection. Read via ApprenticeshipCommands /
 *                       apprenticeship queries.
 *
 *     cultureId (already present) — kept. Culture is character-owned
 *                       and projected.
 *
 *     activeRankId, activeRankNumber — present. Rank pointer is
 *                       character-owned and projected; the full
 *                       rankAssignments array is also projected.
 *
 *     religionId, religionHistory — present. Religion is
 *                       character-owned (written via
 *                       CharacterCommands.setReligion) and projected.
 *
 *   REMOVED FIELDS (compatibility):
 *     The parent-child compatibility mirrors (motherId, fatherId,
 *     children, adoptedParents, adoptedChildren) are not part of the
 *     character record and are not projected. Family relationships
 *     live in FamilyState (family-state.js).
 *
 * PROJECTION CONTRACT (IMPORTANT):
 *   Every public read returns a defensive projection — a fresh object
 *   whose nested arrays and objects are cloned. Mutating a projection
 *   does NOT affect canonical data.
 *
 *   The projections are "deep enough" that:
 *     - `projection.education[institutionId]` is a fresh object whose
 *       fields are primitives (safe to mutate).
 *     - `projection.subjectProgress[key]` is a fresh object whose fields
 *       are primitives (safe to mutate).
 *     - `projection.rankAssignments[i]` is a fresh object whose `number`
 *       is a fresh object (safe to mutate).
 *     - `projection.moves[i]` is a fresh object (safe to mutate).
 *
 *   `projection.professions` is NOT on the projection any more (see
 *   PROJECTION CONTENTS above). Callers that need the profession array
 *   must read it via CharacterCommands.getProfessions / getProfession.
 *
 *   If a caller needs the live reference (authorized mutation code only),
 *   it calls getLiveCharacterForMutation(id).
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
 *   calls getLiveCharacterForMutation(id).
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
 * SUBSCRIPTION CONTRACT:
 *   Subscribers are notified exactly ONCE per write, and internal caches
 *   are rebuilt exactly ONCE per write. The single notification/rebuild
 *   path is:
 *
 *     write primitive
 *       → _emitChange
 *         → markDataDirty()
 *         → invalidateAccessorCaches()
 *         → dispatch 'characterChanged'
 *           → _handleCharacterChanged (the module's own listener)
 *             → _rebuildCaches()
 *             → _notifySubscribers()
 *
 *   _emitChange itself does NOT call _rebuildCaches or
 *   _notifySubscribers. Those happen exclusively in the listener.
 *
 *   Cross-tab reload notification is a separate path:
 *
 *     storage.js
 *       → dispatch 'masterDataUpdated'
 *         → _handleMasterDataUpdated
 *           → _rebuildCaches()
 *           → invalidateAccessorCaches()
 *           → _notifySubscribers()
 *
 *   That path also fires exactly once per cross-tab reload.
 *
 *   Manual refresh() also fires once:
 *
 *     refresh()
 *       → _rebuildCaches()
 *       → invalidateAccessorCaches()
 *       → _notifySubscribers()
 *
 * SEMANTIC RULES:
 *   - Missing data is not fabricated. Missing character -> null.
 *     Missing collection -> [].
 *   - Year 0 is preserved.
 *   - isDeceased === undefined means living. Any other non-boolean value
 *     is malformed and excluded from byStatus.
 *   - gender is normalized to 'male' | 'female' | 'unknown'.
 *   - A field is indexed only if present and non-empty.
 *   - traits is projected as a defensive copy. Mutating the returned
 *     array does not affect canonical data.
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
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _project now includes `surnameSource`. names.js reads it via
 *       getCharacterSurnameSource; without the projection field, the
 *       factory's default ('custom') was silently masked as 'country'
 *       when read through the projection.
 *     - _project no longer includes `professions`. The projection
 *       contract (character-queries.js header) explicitly listed
 *       professions as NOT projected; the prior _project violated
 *       that. settlement-prosperity-queries.js was reading
 *       character.professions off the projection; that file has been
 *       updated to use CharacterCommands.getProfessions per character.
 *       _cloneProfessions is deleted.
 *     - Header PROJECTION CONTENTS (AUTHORITATIVE) section added. It
 *       enumerates every field _project emits, plus a BELOW-CONTRACT
 *       FIELDS list of fields intentionally NOT projected (with the
 *       module that owns the reader for each). This is the single
 *       source of truth for the projection contents; the
 *       CHARACTER PROJECTION CONTRACT section in character-queries.js
 *       cross-references it.
 *     - No behavioural change to any read or write primitive. Every
 *       other field's projection behaviour is unchanged.
 *   Previous revision:
 *     - Added `householdId` to _CHARACTER_OWNED_FIELDS. The character
 *       record carries `household` and `householdId` as parallel
 *       reverse-index fields for the same household membership fact;
 *       the household domain writes both (household-commands.js
 *       _writeCharacterMembership / _clearCharacterMembership /
 *       transferMember). Prior to this revision, `householdId` was
 *       silently rejected by _validateCharacterOwnedPatch because it
 *       was not in the allowlist, which caused every household
 *       membership write to fail at CharacterState and roll back the
 *       household-side mutation. Adding the field to the allowlist
 *       restores the household reverse-index write path.
 *     - Header HOUSEHOLD REVERSE INDEX section added explaining why
 *       both household and householdId are character-owned.
 *     - No other behavioural change.
 *   Previous revision:
 *     - _project now includes `moves`, `householdHistory`,
 *       `religionHistory`, `surnameHistory`, and `apprentices` in the
 *       returned shape. These are character-owned or domain-owned
 *       fields the location, family, name, and apprenticeship domains
 *       read from a projection. Before this revision, the projection
 *       omitted them, which silently caused
 *       location-commands.js::recordMove to overwrite the entire
 *       moves array on every call (because it read `character.moves`
 *       from the projection, saw `undefined`, and treated it as `[]`).
 *     - New _cloneMoves, _cloneStringArray, and _cloneSurnameHistory
 *       helpers added so the newly-projected fields are defensively
 *       cloned.
 *     - No public signature change. Every field that was already
 *       present remains present with the same shape.
 *   Previous revision:
 *     - _emitChange no longer calls _rebuildCaches() or
 *       _notifySubscribers(). Both happen exclusively in
 *       _handleCharacterChanged, the module's own 'characterChanged'
 *       listener. See SUBSCRIPTION CONTRACT above.
 *     - _emitChange now carries a defensive fallback: if dispatchEvent
 *       throws (unreachable in a functioning browser), it calls
 *       _handleCharacterChanged inline with a synthesized detail object
 *       so internal state stays consistent.
 *   Previous revision (Phase 1.1):
 *     - Renamed _getLiveCharacterForMutation -> getLiveCharacterForMutation.
 *       The old name is preserved as a deprecated alias.
 *     - _project now deep-clones `education` and `subjectProgress` via
 *       _cloneEducation / _cloneSubjectProgress. The previous shallow
 *       Object.assign leaked nested objects to callers, which made
 *       CharacterCommands.getEducationRecord / getSubjectProgress return
 *       live canonical references despite their contract.
 *     - Header PROJECTION CONTRACT section added.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. COLLISION GUARD
    // =========================================================================

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

        // Household reverse index. See HOUSEHOLD REVERSE INDEX in the
        // module header. `household` and `householdId` are parallel
        // fields for the same fact; the household domain writes both.
        household: true,
        householdId: true,
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
        isMaster: true,
        masterId: true,
        masterProfessionId: true,

        // Friendship details blob (character-owned legacy container)
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
        _invalidateAccessorCaches();

        var dispatched = false;
        try {
            window.dispatchEvent(new CustomEvent('characterChanged', {
                detail: {
                    action: action,
                    characterIds: characterIds || []
                }
            }));
            dispatched = true;
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('character-state.js: event dispatch failed:', e);
            }
        }

        if (!dispatched) {
            _handleCharacterChanged({
                detail: {
                    action: action,
                    characterIds: characterIds || []
                }
            });
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

    function getLiveCharacterForMutation(id) {
        if (!_hasId(id)) return null;
        return _byId.get(id) || null;
    }

    // =========================================================================
    // 10. PROJECTION HELPERS
    // =========================================================================

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

    function _cloneTraits(traits) {
        if (!Array.isArray(traits)) return [];
        return traits.slice();
    }

    function _cloneEducation(education) {
        if (!_isPlainObject(education)) return {};
        var out = {};
        var keys = Object.keys(education);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var entry = education[key];
            if (!_isPlainObject(entry)) {
                out[key] = entry;
                continue;
            }
            var clonedEntry = {};
            var entryKeys = Object.keys(entry);
            for (var j = 0; j < entryKeys.length; j++) {
                var ek = entryKeys[j];
                var ev = entry[ek];
                if (Array.isArray(ev)) {
                    clonedEntry[ek] = ev.slice();
                } else if (_isPlainObject(ev)) {
                    clonedEntry[ek] = Object.assign({}, ev);
                } else {
                    clonedEntry[ek] = ev;
                }
            }
            out[key] = clonedEntry;
        }
        return out;
    }

    function _cloneSubjectProgress(subjectProgress) {
        if (!_isPlainObject(subjectProgress)) return {};
        var out = {};
        var keys = Object.keys(subjectProgress);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var entry = subjectProgress[key];
            if (!_isPlainObject(entry)) {
                out[key] = entry;
                continue;
            }
            var clonedEntry = {};
            var entryKeys = Object.keys(entry);
            for (var j = 0; j < entryKeys.length; j++) {
                var ek = entryKeys[j];
                var ev = entry[ek];
                if (Array.isArray(ev)) {
                    clonedEntry[ek] = ev.slice();
                } else if (_isPlainObject(ev)) {
                    clonedEntry[ek] = Object.assign({}, ev);
                } else {
                    clonedEntry[ek] = ev;
                }
            }
            out[key] = clonedEntry;
        }
        return out;
    }

    /**
     * Clones a move record. Moves carry a small fixed set of fields:
     * year, locationId, locationName, note, fromLocationId,
     * fromLocationName, isBirthMove, timestamp. Every field is a primitive
     * (or null), so a shallow copy at the record level is a deep-enough
     * clone for every consumer.
     *
     * Called by _project for every character. Returned move records are
     * safe for callers to mutate without affecting canonical state.
     */
    function _cloneMoves(moves) {
        if (!Array.isArray(moves)) return [];
        var out = [];
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            if (!m || typeof m !== 'object') continue;
            out.push({
                year: _isMissing(m.year) ? null : m.year,
                locationId: _isMissing(m.locationId) ? null : m.locationId,
                locationName: _isMissing(m.locationName) ? null : m.locationName,
                note: _isMissing(m.note) ? null : m.note,
                fromLocationId: _isMissing(m.fromLocationId) ? null : m.fromLocationId,
                fromLocationName: _isMissing(m.fromLocationName) ? null : m.fromLocationName,
                isBirthMove: m.isBirthMove === true,
                timestamp: _isMissing(m.timestamp) ? null : m.timestamp
            });
        }
        return out;
    }

    /**
     * Clones an array whose entries are all strings (or expected to be).
     * Used for `apprentices` (ids). Filtering to strings keeps the
     * projection honest about what a consumer can rely on.
     */
    function _cloneStringArray(arr) {
        if (!Array.isArray(arr)) return [];
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            if (typeof arr[i] === 'string') out.push(arr[i]);
        }
        return out;
    }

    /**
     * Clones a surname-history object. Fields:
     *   birthSurname   string
     *   entries        array of entry records (each with primitives +
     *                  small primitives-only nested objects)
     *   lastUpdated    number | null
     *
     * Entries are cloned record-by-record; each entry's fields are
     * primitives or null (except previousSurnameRules which may be a plain
     * object — that is cloned one level deep, matching the treatment used
     * for education entries).
     */
    function _cloneSurnameHistory(history) {
        if (!_isPlainObject(history)) {
            return {
                birthSurname: '',
                entries: [],
                lastUpdated: null
            };
        }

        var clonedEntries = [];
        if (Array.isArray(history.entries)) {
            for (var i = 0; i < history.entries.length; i++) {
                var e = history.entries[i];
                if (!_isPlainObject(e)) continue;
                var clonedEntry = {};
                var keys = Object.keys(e);
                for (var j = 0; j < keys.length; j++) {
                    var k = keys[j];
                    var v = e[k];
                    if (Array.isArray(v)) {
                        clonedEntry[k] = v.slice();
                    } else if (_isPlainObject(v)) {
                        clonedEntry[k] = Object.assign({}, v);
                    } else {
                        clonedEntry[k] = v;
                    }
                }
                clonedEntries.push(clonedEntry);
            }
        }

        return {
            birthSurname: typeof history.birthSurname === 'string'
                ? history.birthSurname
                : '',
            entries: clonedEntries,
            lastUpdated: _isMissing(history.lastUpdated)
                ? null
                : history.lastUpdated
        };
    }

    function _project(c) {
        if (!c || !_hasId(c.id)) return null;
        return {
            id: c.id,
            name: typeof c.name === 'string' ? c.name : '',
            surname: typeof c.surname === 'string' ? c.surname : '',
            surnameSource: _isMissing(c.surnameSource) ? null : c.surnameSource,
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
            householdId: _isMissing(c.householdId) ? null : c.householdId,
            religionId: _isMissing(c.religionId) ? null : c.religionId,
            cultureId: _isMissing(c.cultureId) ? null : c.cultureId,

            traits: _cloneTraits(c.traits),
            rankAssignments: _cloneRankAssignments(c.rankAssignments),

            // Move history. Every location-domain read of character.moves
            // goes through this field. The projection must include it or
            // recordMove silently overwrites prior moves with the new one.
            moves: _cloneMoves(c.moves),

            // Household and religion history. Character-owned; projected
            // as fresh arrays so consumers can inspect without touching
            // canonical state.
            householdHistory: _cloneStringArray(c.householdHistory),
            religionHistory: _cloneStringArray(c.religionHistory),

            // Surname history. Cloned one level deep at the entry level so
            // the name domain and modals-name can inspect entries without
            // risking canonical mutation.
            surnameHistory: _cloneSurnameHistory(c.surnameHistory),

            // Apprentices (ids). Domain-owned but read by the
            // apprenticeship domain via the projection. Cloned as strings.
            apprentices: _cloneStringArray(c.apprentices),

            activeRankId: _isMissing(c.activeRankId) ? null : c.activeRankId,
            activeRankNumber: (typeof c.activeRankNumber === 'number'
                && Number.isFinite(c.activeRankNumber))
                ? c.activeRankNumber
                : null,

            education: _cloneEducation(c.education),
            educationHistory: Array.isArray(c.educationHistory)
                ? c.educationHistory.slice()
                : [],
            subjectProgress: _cloneSubjectProgress(c.subjectProgress),
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

    function _getSelectedCharId() { return _uiState.selectedCharId; }
    function _setSelectedCharId(value) { _uiState.selectedCharId = value; }

    function _getAgeGroupCollapsedState() { return _uiState.ageGroupCollapsedState; }
    function _setAgeGroupCollapsedState(value) { _uiState.ageGroupCollapsedState = value; }

    function _getSelectedChildId() { return _uiState.selectedChildId; }
    function _setSelectedChildId(value) { _uiState.selectedChildId = value; }

    function _getSelectedGuardianId() { return _uiState.selectedGuardianId; }
    function _setSelectedGuardianId(value) { _uiState.selectedGuardianId = value; }

    function _getSelectedGuardianType() { return _uiState.selectedGuardianType; }
    function _setSelectedGuardianType(value) { _uiState.selectedGuardianType = value; }

    function _getSelectedPartnerId() { return _uiState.selectedPartnerId; }
    function _setSelectedPartnerId(value) { _uiState.selectedPartnerId = value; }

    function _getAdoptRelationshipCache() { return _uiState.adoptRelationshipCache; }
    function _getAdoptChildAgeGapCache() { return _uiState.adoptChildAgeGapCache; }
    function _getCurrentSelectedChildId() { return _uiState.currentSelectedChildId; }

    function setSelectedCharacter(id) { _uiState.selectedCharId = id; }
    function hasSelectedCharacter() { return _uiState.selectedCharId !== null; }

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

        getLiveCharacterForMutation: getLiveCharacterForMutation,

        refresh: refresh,

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
        reset: reset,

        _getLiveCharacterForMutation: getLiveCharacterForMutation
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterState;
    }
})();
