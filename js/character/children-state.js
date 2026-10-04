/**
 * =============================================================================
 * STILL WATERS - CHILDREN STATE (js/character/children-state.js)
 * =============================================================================
 *
 * Canonical store for pregnancy records, surrogacy arrangements, and
 * adoption metadata.
 *
 * OWNERSHIP (frozen):
 *
 *   ChildrenState owns:
 *     - pregnancy records       (conception, pregnancy, birth events)
 *     - surrogacy arrangements  (arrangement records, genetic parents,
 *                                intended parents, child ids)
 *     - adoption metadata       (type, year, status, notes; the legal
 *                                parent edge itself lives in FamilyState)
 *
 *   ChildrenState does NOT own:
 *     - parent edges            -> family-state.js
 *     - child character records -> character-state.js
 *     - death transitions       -> character-commands.js (markDeceased)
 *     - fertility / pregnancy policy -> children-rules.js
 *     - projections             -> children-queries.js
 *     - mutations               -> children-commands.js
 *     - persistence format      -> storage.js (via masterData)
 *
 * RELATIONSHIP TO FAMILYSTATE:
 *   When a child is born, two things happen:
 *     1. CharacterCommands.createCharacter builds the child record.
 *     2. FamilyCommands.setParent creates the biological parent edges.
 *     3. ChildrenState.addPregnancyRecord records the birth event.
 *
 *   The character record is canonical for existence.
 *   The family edges are canonical for kinship.
 *   The pregnancy record is canonical for the reproductive event.
 *
 *   They do not duplicate each other. A pregnancy record names the child
 *   id. A parent edge names the parent id. A character names itself.
 *
 * ADOPTION METADATA vs FAMILY EDGE:
 *   The legal parent edge created by an adoption is stored in
 *   FamilyState as a parent_child edge with parentType: 'legal'. The
 *   adoption record stored here carries the additional metadata that
 *   the family edge does not: type ('legal' | 'guardianship' | 'foster'),
 *   adoption year, status history, and notes.
 *
 *   The two are linked by (childId, adopterId). A query that wants the
 *   full adoption picture composes both.
 *
 * SCHEMA:
 *
 *   Pregnancy record:
 *     {
 *       id,                     unique
 *       motherId,               character id
 *       fatherId,               character id | null
 *       childIds,               [character id] (empty if miscarriage)
 *       conceptionYear,         number
 *       birthYear,              number | null (null if miscarriage)
 *       outcome,                'live_birth' | 'stillbirth' |
 *                               'miscarriage' | 'none'
 *       fetusCount,             number
 *       isMultiple,             boolean
 *       hasComplications,       boolean
 *       maternalDeath,          boolean
 *       attemptNumber,          number (1-based)
 *       notes,                  string
 *       createdAt,              ms epoch
 *       updatedAt               ms epoch
 *     }
 *
 *   Surrogacy arrangement:
 *     {
 *       id,
 *       intendedParentId,       character id
 *       intendedPartnerId,      character id | null
 *       surrogateId,            character id
 *       spermDonorId,           character id | null
 *       eggDonorId,             character id | null
 *       type,                   'traditional' | 'gestational'
 *       status,                 'active' | 'completed' | 'cancelled'
 *       arrangementYear,        number
 *       expectedBirthYear,      number
 *       actualBirthYear,        number | null
 *       childIds,               [character id]
 *       notes,                  string
 *       createdAt,
 *       updatedAt
 *     }
 *
 *   Adoption record:
 *     {
 *       id,
 *       childId,                character id
 *       adopterId,              character id
 *       type,                   'legal' | 'guardianship' | 'foster'
 *       status,                 'active' | 'ended' | 'dissolved'
 *       year,                   number
 *       endYear,                number | null
 *       notes,                  string
 *       createdAt,
 *       updatedAt
 *     }
 *
 * PERSISTENCE:
 *   ChildrenState exposes snapshot() and replaceAll() for each collection.
 *   children-commands.js is the sole caller that commits to storage.
 *   masterDataUpdated triggers a reload.
 *
 * LOAD ORDER:
 *   After storage.js. Before children-queries.js and children-commands.js.
 *
 * DEPENDENCIES (REQUIRED):
 *   - storage.js: masterData
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    if (typeof window.masterData === 'undefined') {
        throw new Error(
            'children-state.js: storage.js must load first (masterData missing).'
        );
    }

    // =========================================================================
    // 1. INTERNAL STATE
    // =========================================================================

    var _pregnancyRecords = [];
    var _surrogacyArrangements = [];
    var _adoptionRecords = [];

    // Indexes
    var _pregnancyById = new Map();
    var _pregnanciesByMother = new Map();   // motherId -> Set<id>
    var _pregnanciesByChild = new Map();    // childId -> Set<pregnancyId>

    var _surrogacyById = new Map();
    var _surrogacyByIntended = new Map();   // characterId -> Set<id>
    var _surrogacyBySurrogate = new Map();  // surrogateId -> Set<id>

    var _adoptionById = new Map();
    var _adoptionsByChild = new Map();      // childId -> Set<id>
    var _adoptionsByAdopter = new Map();    // adopterId -> Set<id>

    var _initialized = false;

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _addToIndex(map, key, id) {
        var set = map.get(key);
        if (!set) {
            set = new Set();
            map.set(key, set);
        }
        set.add(id);
    }

    function _removeFromIndex(map, key, id) {
        var set = map.get(key);
        if (!set) return;
        set.delete(id);
        if (set.size === 0) map.delete(key);
    }

    // =========================================================================
    // 3. STRUCTURAL VALIDATION (per record)
    // =========================================================================
    //
    // ChildrenState validates structural shape only: required ids,
    // required fields, valid enum strings. Semantic validation (is this
    // a valid birth? is this surrogacy arrangement legal?) belongs to
    // children-rules.js and children-commands.js.

    var _PREGNANCY_OUTCOMES = ['live_birth', 'stillbirth', 'miscarriage', 'none'];
    var _SURROGACY_TYPES = ['traditional', 'gestational'];
    var _SURROGACY_STATUSES = ['active', 'completed', 'cancelled'];
    var _ADOPTION_TYPES = ['legal', 'guardianship', 'foster'];
    var _ADOPTION_STATUSES = ['active', 'ended', 'dissolved'];

    function _isValidPregnancyRecord(record) {
        if (!record || !_hasId(record.id)) return false;
        if (!_hasId(record.motherId)) return false;
        if (!_isPlainObject(record)) return false;
        if (_PREGNANCY_OUTCOMES.indexOf(record.outcome) === -1) return false;
        if (typeof record.conceptionYear !== 'number') return false;
        return true;
    }

    function _isValidSurrogacyArrangement(record) {
        if (!record || !_hasId(record.id)) return false;
        if (!_hasId(record.intendedParentId)) return false;
        if (!_hasId(record.surrogateId)) return false;
        if (_SURROGACY_TYPES.indexOf(record.type) === -1) return false;
        if (_SURROGACY_STATUSES.indexOf(record.status) === -1) return false;
        if (typeof record.arrangementYear !== 'number') return false;
        return true;
    }

    function _isValidAdoptionRecord(record) {
        if (!record || !_hasId(record.id)) return false;
        if (!_hasId(record.childId)) return false;
        if (!_hasId(record.adopterId)) return false;
        if (_ADOPTION_TYPES.indexOf(record.type) === -1) return false;
        if (_ADOPTION_STATUSES.indexOf(record.status) === -1) return false;
        if (typeof record.year !== 'number') return false;
        return true;
    }

    // =========================================================================
    // 4. NORMALIZATION
    // =========================================================================

    function _normalizePregnancyRecord(raw) {
        return {
            id: raw.id,
            motherId: raw.motherId,
            fatherId: _hasId(raw.fatherId) ? raw.fatherId : null,
            childIds: Array.isArray(raw.childIds) ? raw.childIds.slice() : [],
            conceptionYear: typeof raw.conceptionYear === 'number'
                ? raw.conceptionYear
                : null,
            birthYear: typeof raw.birthYear === 'number' ? raw.birthYear : null,
            outcome: raw.outcome,
            fetusCount: typeof raw.fetusCount === 'number' && raw.fetusCount > 0
                ? raw.fetusCount
                : 1,
            isMultiple: raw.isMultiple === true,
            hasComplications: raw.hasComplications === true,
            maternalDeath: raw.maternalDeath === true,
            attemptNumber: typeof raw.attemptNumber === 'number'
                && raw.attemptNumber >= 0
                ? raw.attemptNumber
                : 0,
            notes: typeof raw.notes === 'string' ? raw.notes : '',
            createdAt: typeof raw.createdAt === 'number'
                ? raw.createdAt
                : Date.now(),
            updatedAt: typeof raw.updatedAt === 'number'
                ? raw.updatedAt
                : Date.now()
        };
    }

    function _normalizeSurrogacyArrangement(raw) {
        return {
            id: raw.id,
            intendedParentId: raw.intendedParentId,
            intendedPartnerId: _hasId(raw.intendedPartnerId)
                ? raw.intendedPartnerId
                : null,
            surrogateId: raw.surrogateId,
            spermDonorId: _hasId(raw.spermDonorId) ? raw.spermDonorId : null,
            eggDonorId: _hasId(raw.eggDonorId) ? raw.eggDonorId : null,
            type: raw.type,
            status: raw.status,
            arrangementYear: raw.arrangementYear,
            expectedBirthYear: typeof raw.expectedBirthYear === 'number'
                ? raw.expectedBirthYear
                : raw.arrangementYear + 1,
            actualBirthYear: typeof raw.actualBirthYear === 'number'
                ? raw.actualBirthYear
                : null,
            childIds: Array.isArray(raw.childIds) ? raw.childIds.slice() : [],
            notes: typeof raw.notes === 'string' ? raw.notes : '',
            createdAt: typeof raw.createdAt === 'number'
                ? raw.createdAt
                : Date.now(),
            updatedAt: typeof raw.updatedAt === 'number'
                ? raw.updatedAt
                : Date.now()
        };
    }

    function _normalizeAdoptionRecord(raw) {
        return {
            id: raw.id,
            childId: raw.childId,
            adopterId: raw.adopterId,
            type: raw.type,
            status: raw.status,
            year: raw.year,
            endYear: typeof raw.endYear === 'number' ? raw.endYear : null,
            notes: typeof raw.notes === 'string' ? raw.notes : '',
            createdAt: typeof raw.createdAt === 'number'
                ? raw.createdAt
                : Date.now(),
            updatedAt: typeof raw.updatedAt === 'number'
                ? raw.updatedAt
                : Date.now()
        };
    }

    // =========================================================================
    // 5. INDEX MANAGEMENT
    // =========================================================================

    function _indexPregnancy(record) {
        _pregnancyById.set(record.id, record);
        _addToIndex(_pregnanciesByMother, record.motherId, record.id);
        for (var i = 0; i < record.childIds.length; i++) {
            _addToIndex(_pregnanciesByChild, record.childIds[i], record.id);
        }
    }

    function _unindexPregnancy(record) {
        _pregnancyById.delete(record.id);
        _removeFromIndex(_pregnanciesByMother, record.motherId, record.id);
        for (var i = 0; i < record.childIds.length; i++) {
            _removeFromIndex(_pregnanciesByChild, record.childIds[i], record.id);
        }
    }

    function _indexSurrogacy(record) {
        _surrogacyById.set(record.id, record);
        _addToIndex(_surrogacyByIntended, record.intendedParentId, record.id);
        if (_hasId(record.intendedPartnerId)) {
            _addToIndex(_surrogacyByIntended, record.intendedPartnerId, record.id);
        }
        _addToIndex(_surrogacyBySurrogate, record.surrogateId, record.id);
    }

    function _unindexSurrogacy(record) {
        _surrogacyById.delete(record.id);
        _removeFromIndex(_surrogacyByIntended, record.intendedParentId, record.id);
        if (_hasId(record.intendedPartnerId)) {
            _removeFromIndex(_surrogacyByIntended, record.intendedPartnerId, record.id);
        }
        _removeFromIndex(_surrogacyBySurrogate, record.surrogateId, record.id);
    }

    function _indexAdoption(record) {
        _adoptionById.set(record.id, record);
        _addToIndex(_adoptionsByChild, record.childId, record.id);
        _addToIndex(_adoptionsByAdopter, record.adopterId, record.id);
    }

    function _unindexAdoption(record) {
        _adoptionById.delete(record.id);
        _removeFromIndex(_adoptionsByChild, record.childId, record.id);
        _removeFromIndex(_adoptionsByAdopter, record.adopterId, record.id);
    }

    function _rebuildAllIndexes() {
        _pregnancyById.clear();
        _pregnanciesByMother.clear();
        _pregnanciesByChild.clear();
        _surrogacyById.clear();
        _surrogacyByIntended.clear();
        _surrogacyBySurrogate.clear();
        _adoptionById.clear();
        _adoptionsByChild.clear();
        _adoptionsByAdopter.clear();

        for (var i = 0; i < _pregnancyRecords.length; i++) {
            _indexPregnancy(_pregnancyRecords[i]);
        }
        for (var j = 0; j < _surrogacyArrangements.length; j++) {
            _indexSurrogacy(_surrogacyArrangements[j]);
        }
        for (var k = 0; k < _adoptionRecords.length; k++) {
            _indexAdoption(_adoptionRecords[k]);
        }
    }

    // =========================================================================
    // 6. LOAD / SNAPSHOT
    // =========================================================================

    function _loadFromMasterData() {
        var data = window.masterData && window.masterData.data;

        _pregnancyRecords = [];
        if (data && Array.isArray(data.pregnancyRecords)) {
            for (var i = 0; i < data.pregnancyRecords.length; i++) {
                var p = data.pregnancyRecords[i];
                if (!_isValidPregnancyRecord(p)) continue;
                _pregnancyRecords.push(_normalizePregnancyRecord(p));
            }
        }

        _surrogacyArrangements = [];
        if (data && Array.isArray(data.surrogacyArrangements)) {
            for (var j = 0; j < data.surrogacyArrangements.length; j++) {
                var s = data.surrogacyArrangements[j];
                if (!_isValidSurrogacyArrangement(s)) continue;
                _surrogacyArrangements.push(_normalizeSurrogacyArrangement(s));
            }
        }

        _adoptionRecords = [];
        if (data && Array.isArray(data.adoptionRecords)) {
            for (var k = 0; k < data.adoptionRecords.length; k++) {
                var a = data.adoptionRecords[k];
                if (!_isValidAdoptionRecord(a)) continue;
                _adoptionRecords.push(_normalizeAdoptionRecord(a));
            }
        }

        _rebuildAllIndexes();
        _initialized = true;
    }

    function snapshotPregnancies() {
        var out = [];
        for (var i = 0; i < _pregnancyRecords.length; i++) {
            out.push(_copyPregnancy(_pregnancyRecords[i]));
        }
        return out;
    }

    function snapshotSurrogacy() {
        var out = [];
        for (var i = 0; i < _surrogacyArrangements.length; i++) {
            out.push(_copySurrogacy(_surrogacyArrangements[i]));
        }
        return out;
    }

    function snapshotAdoptions() {
        var out = [];
        for (var i = 0; i < _adoptionRecords.length; i++) {
            out.push(_copyAdoption(_adoptionRecords[i]));
        }
        return out;
    }

    function replaceAllPregnancies(records) {
        if (!Array.isArray(records)) return false;
        _pregnancyRecords = [];
        for (var i = 0; i < records.length; i++) {
            if (!_isValidPregnancyRecord(records[i])) continue;
            _pregnancyRecords.push(_normalizePregnancyRecord(records[i]));
        }
        _rebuildAllIndexes();
        return true;
    }

    function replaceAllSurrogacy(records) {
        if (!Array.isArray(records)) return false;
        _surrogacyArrangements = [];
        for (var i = 0; i < records.length; i++) {
            if (!_isValidSurrogacyArrangement(records[i])) continue;
            _surrogacyArrangements.push(_normalizeSurrogacyArrangement(records[i]));
        }
        _rebuildAllIndexes();
        return true;
    }

    function replaceAllAdoptions(records) {
        if (!Array.isArray(records)) return false;
        _adoptionRecords = [];
        for (var i = 0; i < records.length; i++) {
            if (!_isValidAdoptionRecord(records[i])) continue;
            _adoptionRecords.push(_normalizeAdoptionRecord(records[i]));
        }
        _rebuildAllIndexes();
        return true;
    }

    function isInitialized() {
        return _initialized;
    }

    // =========================================================================
    // 7. COPIES
    // =========================================================================

    function _copyPregnancy(record) {
        return {
            id: record.id,
            motherId: record.motherId,
            fatherId: record.fatherId,
            childIds: record.childIds.slice(),
            conceptionYear: record.conceptionYear,
            birthYear: record.birthYear,
            outcome: record.outcome,
            fetusCount: record.fetusCount,
            isMultiple: record.isMultiple,
            hasComplications: record.hasComplications,
            maternalDeath: record.maternalDeath,
            attemptNumber: record.attemptNumber,
            notes: record.notes,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    }

    function _copySurrogacy(record) {
        return {
            id: record.id,
            intendedParentId: record.intendedParentId,
            intendedPartnerId: record.intendedPartnerId,
            surrogateId: record.surrogateId,
            spermDonorId: record.spermDonorId,
            eggDonorId: record.eggDonorId,
            type: record.type,
            status: record.status,
            arrangementYear: record.arrangementYear,
            expectedBirthYear: record.expectedBirthYear,
            actualBirthYear: record.actualBirthYear,
            childIds: record.childIds.slice(),
            notes: record.notes,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    }

    function _copyAdoption(record) {
        return {
            id: record.id,
            childId: record.childId,
            adopterId: record.adopterId,
            type: record.type,
            status: record.status,
            year: record.year,
            endYear: record.endYear,
            notes: record.notes,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    }

    // =========================================================================
    // 8. READS
    // =========================================================================

    function getPregnancyCopy(id) {
        var r = _pregnancyById.get(id);
        return r ? _copyPregnancy(r) : null;
    }

    function getSurrogacyCopy(id) {
        var r = _surrogacyById.get(id);
        return r ? _copySurrogacy(r) : null;
    }

    function getAdoptionCopy(id) {
        var r = _adoptionById.get(id);
        return r ? _copyAdoption(r) : null;
    }

    function pregnancyIdsForMother(motherId) {
        if (!_hasId(motherId)) return [];
        var set = _pregnanciesByMother.get(motherId);
        return set ? Array.from(set) : [];
    }

    function pregnancyIdsForChild(childId) {
        if (!_hasId(childId)) return [];
        var set = _pregnanciesByChild.get(childId);
        return set ? Array.from(set) : [];
    }

    function surrogacyIdsForIntendedParent(characterId) {
        if (!_hasId(characterId)) return [];
        var set = _surrogacyByIntended.get(characterId);
        return set ? Array.from(set) : [];
    }

    function surrogacyIdsForSurrogate(surrogateId) {
        if (!_hasId(surrogateId)) return [];
        var set = _surrogacyBySurrogate.get(surrogateId);
        return set ? Array.from(set) : [];
    }

    function adoptionIdsForChild(childId) {
        if (!_hasId(childId)) return [];
        var set = _adoptionsByChild.get(childId);
        return set ? Array.from(set) : [];
    }

    function adoptionIdsForAdopter(adopterId) {
        if (!_hasId(adopterId)) return [];
        var set = _adoptionsByAdopter.get(adopterId);
        return set ? Array.from(set) : [];
    }

    function allPregnancyIds() {
        return Array.from(_pregnancyById.keys());
    }

    function allSurrogacyIds() {
        return Array.from(_surrogacyById.keys());
    }

    function allAdoptionIds() {
        return Array.from(_adoptionById.keys());
    }

    function pregnancyCount() { return _pregnancyRecords.length; }
    function surrogacyCount() { return _surrogacyArrangements.length; }
    function adoptionCount() { return _adoptionRecords.length; }

    // =========================================================================
    // 9. INTERNAL MUTATION PRIMITIVES
    // =========================================================================
    //
    // Authorized callers: children-commands.js only.
    // These assume the caller has validated the change.
    // They do not re-validate. They do not commit to storage.

    function _insertPregnancy(record) {
        _pregnancyRecords.push(record);
        _indexPregnancy(record);
    }

    function _updatePregnancy(id, patch) {
        var record = _pregnancyById.get(id);
        if (!record) return false;
        for (var key in patch) {
            if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
            record[key] = patch[key];
        }
        record.updatedAt = Date.now();
        return true;
    }

    function _removePregnancy(id) {
        var record = _pregnancyById.get(id);
        if (!record) return false;
        _unindexPregnancy(record);
        var idx = _pregnancyRecords.indexOf(record);
        if (idx !== -1) _pregnancyRecords.splice(idx, 1);
        return true;
    }

    function _insertSurrogacy(record) {
        _surrogacyArrangements.push(record);
        _indexSurrogacy(record);
    }

    function _updateSurrogacy(id, patch) {
        var record = _surrogacyById.get(id);
        if (!record) return false;
        for (var key in patch) {
            if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
            record[key] = patch[key];
        }
        record.updatedAt = Date.now();
        return true;
    }

    function _removeSurrogacy(id) {
        var record = _surrogacyById.get(id);
        if (!record) return false;
        _unindexSurrogacy(record);
        var idx = _surrogacyArrangements.indexOf(record);
        if (idx !== -1) _surrogacyArrangements.splice(idx, 1);
        return true;
    }

    function _insertAdoption(record) {
        _adoptionRecords.push(record);
        _indexAdoption(record);
    }

    function _updateAdoption(id, patch) {
        var record = _adoptionById.get(id);
        if (!record) return false;
        for (var key in patch) {
            if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
            record[key] = patch[key];
        }
        record.updatedAt = Date.now();
        return true;
    }

    function _removeAdoption(id) {
        var record = _adoptionById.get(id);
        if (!record) return false;
        _unindexAdoption(record);
        var idx = _adoptionRecords.indexOf(record);
        if (idx !== -1) _adoptionRecords.splice(idx, 1);
        return true;
    }

    function _getLivePregnancy(id) {
        if (!_hasId(id)) return null;
        return _pregnancyById.get(id) || null;
    }

    function _getLiveSurrogacy(id) {
        if (!_hasId(id)) return null;
        return _surrogacyById.get(id) || null;
    }

    function _getLiveAdoption(id) {
        if (!_hasId(id)) return null;
        return _adoptionById.get(id) || null;
    }

    // =========================================================================
    // 10. SUBSCRIBE
    // =========================================================================

    var _subscribers = [];

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('ChildrenState.subscribe: callback must be a function');
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var idx = _subscribers.indexOf(callback);
            if (idx !== -1) _subscribers.splice(idx, 1);
        };
    }

    function _notify(event) {
        var snapshotSubs = _subscribers.slice();
        for (var i = 0; i < snapshotSubs.length; i++) {
            try {
                snapshotSubs[i](event);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('children-state.js: subscriber threw:', e);
                }
            }
        }
    }

    // =========================================================================
    // 11. EVENT SUBSCRIPTIONS
    // =========================================================================

    function _handleMasterDataUpdated() {
        _loadFromMasterData();
        _notify({ type: 'reloaded' });
    }

    window.addEventListener('masterDataUpdated', _handleMasterDataUpdated);

    // =========================================================================
    // 12. INITIAL LOAD
    // =========================================================================

    _loadFromMasterData();

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.ChildrenState = {
        // Lifecycle
        isInitialized: isInitialized,

        // Snapshot / replace (children-commands.js only)
        snapshotPregnancies: snapshotPregnancies,
        snapshotSurrogacy: snapshotSurrogacy,
        snapshotAdoptions: snapshotAdoptions,
        replaceAllPregnancies: replaceAllPregnancies,
        replaceAllSurrogacy: replaceAllSurrogacy,
        replaceAllAdoptions: replaceAllAdoptions,

        // Copies
        getPregnancyCopy: getPregnancyCopy,
        getSurrogacyCopy: getSurrogacyCopy,
        getAdoptionCopy: getAdoptionCopy,

        // Index lookups
        pregnancyIdsForMother: pregnancyIdsForMother,
        pregnancyIdsForChild: pregnancyIdsForChild,
        surrogacyIdsForIntendedParent: surrogacyIdsForIntendedParent,
        surrogacyIdsForSurrogate: surrogacyIdsForSurrogate,
        adoptionIdsForChild: adoptionIdsForChild,
        adoptionIdsForAdopter: adoptionIdsForAdopter,
        allPregnancyIds: allPregnancyIds,
        allSurrogacyIds: allSurrogacyIds,
        allAdoptionIds: allAdoptionIds,

        // Counts
        pregnancyCount: pregnancyCount,
        surrogacyCount: surrogacyCount,
        adoptionCount: adoptionCount,

        // Subscribe
        subscribe: subscribe,

        // Internal mutation primitives (children-commands.js only)
        _getLivePregnancy: _getLivePregnancy,
        _getLiveSurrogacy: _getLiveSurrogacy,
        _getLiveAdoption: _getLiveAdoption,
        _insertPregnancy: _insertPregnancy,
        _updatePregnancy: _updatePregnancy,
        _removePregnancy: _removePregnancy,
        _insertSurrogacy: _insertSurrogacy,
        _updateSurrogacy: _updateSurrogacy,
        _removeSurrogacy: _removeSurrogacy,
        _insertAdoption: _insertAdoption,
        _updateAdoption: _updateAdoption,
        _removeAdoption: _removeAdoption
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ChildrenState;
    }
})();
