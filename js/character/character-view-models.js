// js/character/character-view-models.js
/**
 * =============================================================================
 * STILL WATERS - CHARACTER VIEW MODELS (js/character/character-view-models.js)
 * =============================================================================
 *
 * LOCATION: js/character/character-view-models.js
 *
 * Per-tab model builders for the Character Manager. Every tab reads from
 * this module; no tab re-derives the same shapes.
 *
 * SCOPE (this revision):
 *   - resolveName / resolvePlaceName / resolveRankDisplay / skillTierLabel
 *   - compactRow(targetId, detail)
 *   - buildIdentityModel(id)
 *   - buildFriendshipModel(id)
 *   - buildRomanceModel(id)
 *   - buildFamilyModel(id)
 *   - buildSkillsModel(id)          NEW
 *
 * SCOPE (future revisions, as tabs are built):
 *   - buildLocationModel, buildOverviewModel
 *
 * OUT OF SCOPE:
 *   - Any DOM writes, mutations, localStorage, new query logic
 *
 * CONTRACT:
 *   - Builders return null for a missing character.
 *   - Builders NEVER throw. Per-section failures recorded under `errors`.
 *   - Builders NEVER mutate canonical state.
 *   - Builders return plain objects. Tabs render.
 *
 * REQUIRED DEPENDENCIES (load-time):
 *   - CharacterState, CharacterQueries, CharacterCommands
 *   - FamilyQueries, ChildrenQueries, MortalityQueries
 *   - RomanceQueries, FriendshipQueries, AffairQueries
 *   - RelationshipUI
 *   - formatting.js, icons.js
 *
 * OPTIONAL DEPENDENCIES (guarded at call time):
 *   - window.getRankById, window.getPlaceById
 *   - RoleState.getRole, window.getRoleById  (skills section)
 *   - SUBJECTS_BY_ID                          (skills section)
 *   - ApprenticeshipQueries                   (skills section —
 *                                              absent on CharacterManager.html;
 *                                              degrades to
 *                                              { available: false })
 *   - ReligionQueries, CultureQueries, RelationshipQueries
 *
 * ICON POLICY: Uses SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - buildSkillsModel(characterId) added. Sections: identity,
 *       professions[], education[], educationHistory[],
 *       subjectProgress[], literacy, apprenticeship, traits, errors.
 *     - Apprenticeship section degrades cleanly when
 *       ApprenticeshipQueries is not loaded (CharacterManager.html does
 *       not load the apprenticeship domain). It returns
 *       { available: false, reason, ... } so the tab renders an
 *       unavailable message rather than an empty list.
 *     - _resolveRoleName(roleId) and _resolveSubjectName(key) helpers
 *       added. Both are tolerant: they fall back to the raw id / key
 *       and never throw. Not exported — they are internal to the
 *       skills builder.
 *     - Professions enriched with roleName (via _resolveRoleName) and
 *       tierLabel (via skillTierLabel).
 *     - SubjectProgress enriched with name (via _resolveSubjectName)
 *       and tierLabel. Sorted by level descending.
 *     - No public resolvers changed. No builder changed. Purely
 *       additive.
 *   Previous revision:
 *     - buildFamilyModel(characterId) added. Sections:
 *         identity, parents, children, siblings, grandchildren,
 *         surrogacyChildren, adoptedParents, isOrphan.
 *       Each family reference enriched with the target character's
 *       summary plus FamilyRules-derived classification metadata
 *       (sibling type, parent role).
 *   Previous revision:
 *     - buildRomanceModel(characterId) added.
 *   Earlier revision:
 *     - buildFriendshipModel(characterId) added.
 *   Initial revision:
 *     - Shared resolvers + buildIdentityModel.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDeps() {
        var required = [
            'CharacterState',
            'CharacterQueries',
            'CharacterCommands',
            'FamilyQueries',
            'ChildrenQueries',
            'MortalityQueries',
            'RomanceQueries',
            'FriendshipQueries',
            'AffairQueries',
            'RelationshipUI',
            'escapeHtml',
            'Icons'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'character-view-models.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }
    _requireDeps();

    var CQ  = window.CharacterQueries;
    var CC  = window.CharacterCommands;
    var MQ  = window.MortalityQueries;
    var FQ  = window.FamilyQueries;
    var ChQ = window.ChildrenQueries;
    var RQm = window.RomanceQueries;
    var FrQ = window.FriendshipQueries;
    var AQ  = window.AffairQueries;
    var RUI = window.RelationshipUI;

    // =========================================================================
    // 1. SMALL HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _esc(v) {
        return window.escapeHtml(v);
    }

    function _icon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _genderIcon(gender) {
        if (typeof window.getGenderIcon === 'function') {
            return window.getGenderIcon(gender) || _icon('CIRCLE');
        }
        if (gender === 'male') return _icon('MALE');
        if (gender === 'female') return _icon('FEMALE');
        return _icon('GENDER_NEUTRAL');
    }

    function _sortByStartDesc(a, b) {
        var ay = typeof a.startYear === 'number' ? a.startYear : -Infinity;
        var by = typeof b.startYear === 'number' ? b.startYear : -Infinity;
        return by - ay;
    }

    function _sortByBirthYearAsc(a, b) {
        var ay = typeof a.birthYear === 'number' ? a.birthYear : Infinity;
        var by = typeof b.birthYear === 'number' ? b.birthYear : Infinity;
        return ay - by;
    }

    // =========================================================================
    // 2. RESOLVERS
    // =========================================================================

    function resolveName(id) {
        if (!_hasId(id)) return '';
        var summary = CQ.getCharacterSummary(id);
        if (!summary) return id;
        if (typeof summary.fullName === 'string' && summary.fullName.length > 0) {
            return summary.fullName;
        }
        return summary.name || id;
    }

    function resolvePlaceName(placeId) {
        if (!_hasId(placeId)) return '';
        if (typeof window.getPlaceById === 'function') {
            var place;
            try { place = window.getPlaceById(placeId); }
            catch (e) { place = null; }
            if (place) {
                if (typeof place.displayName === 'string' && place.displayName.length > 0) {
                    return place.displayName;
                }
                if (typeof place.name === 'string' && place.name.length > 0) {
                    return place.name;
                }
            }
        }
        return placeId;
    }

    function resolveRankDisplay(rankId) {
        if (!_hasId(rankId)) return null;
        if (typeof window.getRankById !== 'function') return null;
        var rank;
        try { rank = window.getRankById(rankId); }
        catch (e) { return null; }
        if (!rank || typeof rank !== 'object') return null;

        return {
            rankId: typeof rank.id === 'string' && rank.id.length > 0
                ? rank.id : rankId,
            name: typeof rank.name === 'string' && rank.name.length > 0
                ? rank.name : rankId,
            symbol: typeof rank.symbol === 'string' && rank.symbol.length > 0
                ? rank.symbol : null,
            priority: (typeof rank.priority === 'number'
                && Number.isFinite(rank.priority))
                ? rank.priority : null,
            numbered: rank.numbered === true,
            numberingType: (rank.numberingType === 'reign'
                || rank.numberingType === 'ordinal'
                || rank.numberingType === 'roman')
                ? rank.numberingType : 'reign',
            numberingGroup: typeof rank.numberingGroup === 'string'
                ? rank.numberingGroup : 'global',
            allowsMultipleSpouses: rank.allowsMultipleSpouses === true
        };
    }

    function skillTierLabel(level) {
        if (typeof level !== 'number' || !Number.isFinite(level)) return 'Unknown';
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1)  return 'Novice';
        return 'Untrained';
    }

    // =========================================================================
    // 3. COMPACT ROW
    // =========================================================================

    function compactRow(targetId, detailText) {
        if (!_hasId(targetId)) return '';

        var summary;
        try { summary = CQ.getCharacterSummary(targetId); }
        catch (e) { summary = null; }
        if (!summary) return '';

        var rankDisplay = resolveRankDisplay(summary.rankId);
        var rankHtml = (rankDisplay && rankDisplay.symbol)
            ? '<span class="character-row__rank" title="' +
                _esc(rankDisplay.name) + '">' +
                _esc(rankDisplay.symbol) +
              '</span> '
            : '';

        var genderHtml = '<span class="character-row__gender">' +
            _genderIcon(summary.gender) + '</span> ';

        var name = (typeof summary.fullName === 'string'
            && summary.fullName.length > 0)
            ? summary.fullName
            : (summary.name || targetId);

        var deceasedMark = (summary.isDeceased === true)
            ? ' <span class="character-row__deceased-mark" title="Deceased">' +
                _esc('\u2020') +
              '</span>'
            : '';

        var ageText = (typeof summary.age === 'number' && summary.age >= 0)
            ? (summary.age + 'y')
            : '';

        var locationText = summary.locationId
            ? resolvePlaceName(summary.locationId)
            : '';

        var detailHtml = (_hasId(detailText))
            ? ' <span class="character-row__detail">' +
                _esc(detailText) +
              '</span>'
            : '';

        return '<div class="character-row" data-character-id="' +
                _esc(targetId) + '">' +
            rankHtml +
            genderHtml +
            '<a href="#" class="character-row__name" data-character-id="' +
                _esc(targetId) + '">' + _esc(name) + '</a>' +
            deceasedMark +
            (ageText
                ? ' <span class="character-row__age">(' + _esc(ageText) + ')</span>'
                : '') +
            (locationText
                ? ' <span class="character-row__location">' +
                    _esc(locationText) +
                  '</span>'
                : '') +
            detailHtml +
        '</div>';
    }

    // =========================================================================
    // 4. SECTION-WRAPPED BUILDER HELPER
    // =========================================================================

    function _safe(label, fn, errors) {
        try {
            return fn();
        } catch (e) {
            errors[label] = (e && e.message) ? e.message : 'unknown error';
            return null;
        }
    }

    // =========================================================================
    // 5. IDENTITY — SECTION BUILDERS
    // =========================================================================

    function _buildIdentityBlock(summary, errors) {
        return _safe('identity', function () {
            var religionName = null;
            if (_hasId(summary.religionId)
                && typeof window.ReligionQueries !== 'undefined'
                && window.ReligionQueries !== null
                && typeof window.ReligionQueries.getReligion === 'function') {
                var rel;
                try { rel = window.ReligionQueries.getReligion(summary.religionId); }
                catch (e) { rel = null; }
                if (rel && typeof rel.name === 'string' && rel.name.length > 0) {
                    religionName = rel.name;
                }
            }

            var cultureName = null;
            if (_hasId(summary.cultureId)
                && typeof window.CultureQueries !== 'undefined'
                && window.CultureQueries !== null
                && typeof window.CultureQueries.getCultureById === 'function') {
                var cul;
                try { cul = window.CultureQueries.getCultureById(summary.cultureId); }
                catch (e) { cul = null; }
                if (cul && typeof cul.name === 'string' && cul.name.length > 0) {
                    cultureName = cul.name;
                }
            }

            return {
                id: summary.id,
                firstName: summary.name || '',
                surname: summary.surname || '',
                fullName: summary.fullName || summary.name || '',
                surnameSource: _isMissing(summary.surnameSource)
                    ? null : summary.surnameSource,
                epithet: summary.epithet || '',
                gender: summary.gender || 'unknown',
                genderLabel: (typeof window.getGenderLabel === 'function')
                    ? window.getGenderLabel(summary.gender)
                    : (summary.gender || 'Unknown'),
                traits: Array.isArray(summary.traits) ? summary.traits.slice() : [],
                religionId: summary.religionId || null,
                religionName: religionName,
                cultureId: summary.cultureId || null,
                cultureName: cultureName
            };
        }, errors);
    }

    function _buildSurnameHistoryBlock(summary, errors) {
        return _safe('surnameHistory', function () {
            var h = summary.surnameHistory;
            if (!h || typeof h !== 'object') {
                return { birthSurname: '', entries: [], lastUpdated: null };
            }
            var rawEntries = Array.isArray(h.entries) ? h.entries : [];
            var entries = [];
            for (var i = 0; i < rawEntries.length; i++) {
                var e = rawEntries[i];
                if (!e || typeof e !== 'object') continue;
                entries.push({
                    surname: typeof e.surname === 'string' ? e.surname : '',
                    year: _isMissing(e.year) ? null : e.year,
                    reason: typeof e.reason === 'string' ? e.reason : 'custom',
                    previousSurname: _isMissing(e.previousSurname)
                        ? null : e.previousSurname,
                    spouseId: _isMissing(e.spouseId) ? null : e.spouseId,
                    notes: typeof e.notes === 'string' ? e.notes : ''
                });
            }
            return {
                birthSurname: typeof h.birthSurname === 'string' ? h.birthSurname : '',
                entries: entries,
                lastUpdated: _isMissing(h.lastUpdated) ? null : h.lastUpdated
            };
        }, errors);
    }

    function _buildReligionHistoryBlock(summary, errors) {
        return _safe('religionHistory', function () {
            var h = summary.religionHistory;
            if (!Array.isArray(h) || h.length === 0) {
                return { available: true, entries: [] };
            }
            if (typeof h[0] === 'string') {
                return {
                    available: false,
                    reason: 'religionHistory projection is not structured ' +
                            'in this build (character-state.js::_project ' +
                            'not amended). The tab cannot display ' +
                            'conversion details.',
                    entries: []
                };
            }
            var entries = [];
            for (var i = 0; i < h.length; i++) {
                var e = h[i];
                if (!e || typeof e !== 'object') continue;
                entries.push({
                    id: _isMissing(e.id) ? null : e.id,
                    year: _isMissing(e.year) ? null : e.year,
                    fromReligionId: _isMissing(e.fromReligionId) ? null : e.fromReligionId,
                    fromReligionName: _isMissing(e.fromReligionName) ? null : e.fromReligionName,
                    toReligionId: _isMissing(e.toReligionId) ? null : e.toReligionId,
                    toReligionName: _isMissing(e.toReligionName) ? null : e.toReligionName,
                    reason: _isMissing(e.reason) ? null : e.reason,
                    notes: typeof e.notes === 'string' ? e.notes : '',
                    inherited: e.inherited === true,
                    inheritedFrom: _isMissing(e.inheritedFrom) ? null : e.inheritedFrom
                });
            }
            entries.sort(function (a, b) {
                var ya = (typeof a.year === 'number') ? a.year : 0;
                var yb = (typeof b.year === 'number') ? b.year : 0;
                return ya - yb;
            });
            return { available: true, entries: entries };
        }, errors);
    }

    function _buildBirthBlock(summary, errors) {
        return _safe('birth', function () {
            var placeName = summary.birthplaceId
                ? resolvePlaceName(summary.birthplaceId)
                : null;
            return {
                year: _isMissing(summary.birthYear) ? null : summary.birthYear,
                placeId: summary.birthplaceId || null,
                placeName: placeName
            };
        }, errors);
    }

    function _buildDeathBlock(summary, characterId, errors) {
        return _safe('death', function () {
            if (summary.isDeceased !== true) {
                return {
                    isDeceased: false, year: null, cause: null, causeDetail: null,
                    notes: null, isMurder: false, killerId: null, killerName: null,
                    murderMotive: null, murderMethod: null,
                    isExecution: false, executionReason: null,
                    executionMethod: null, executionLocation: null
                };
            }
            var rec = null;
            try { rec = MQ.getDeathRecord(characterId); }
            catch (e) { rec = null; }
            var killerName = null;
            if (rec && _hasId(rec.killerId)) killerName = resolveName(rec.killerId);
            return {
                isDeceased: true,
                year: rec ? rec.deathYear : (summary.deathYear || null),
                cause: rec ? rec.deathCause : (summary.deathCause || null),
                causeDetail: rec ? rec.deathCauseDetail : (summary.deathCauseDetail || null),
                notes: rec ? rec.deathNotes : null,
                isMurder: !!(rec && rec.isMurder === true),
                killerId: rec ? rec.killerId : null,
                killerName: killerName,
                murderMotive: rec ? rec.murderMotive : null,
                murderMethod: rec ? rec.murderMethod : null,
                isExecution: !!(rec && rec.isExecution === true),
                executionReason: rec ? rec.executionReason : null,
                executionMethod: rec ? rec.executionMethod : null,
                executionLocation: rec ? rec.executionLocation : null
            };
        }, errors);
    }

    function _buildRanksBlock(characterId, errors) {
        return _safe('ranks', function () {
            var activeAssignment = CC.getActiveRank(characterId);
            var assignments = CC.getRankAssignments(characterId);
            function shape(a) {
                var rank = resolveRankDisplay(a.rankId);
                return {
                    rankId: a.rankId,
                    rankName: rank ? rank.name : a.rankId,
                    rankSymbol: rank ? rank.symbol : null,
                    customTitle: a.customTitle || null,
                    address: a.address || null,
                    number: a.number || null,
                    order: (typeof a.order === 'number') ? a.order : 999,
                    isActive: a.isActive === true,
                    isDeprecated: a.isDeprecated === true,
                    assignedYear: _isMissing(a.assignedYear) ? null : a.assignedYear,
                    notes: a.notes || '',
                    rankAvailable: rank !== null
                };
            }
            var active = activeAssignment ? shape(activeAssignment) : null;
            var current = [];
            var former = [];
            for (var i = 0; i < assignments.length; i++) {
                var a = assignments[i];
                if (!a) continue;
                var shaped = shape(a);
                if (a.isDeprecated === true) former.push(shaped);
                else current.push(shaped);
            }
            current.sort(function (x, y) { return x.order - y.order; });
            former.sort(function (x, y) { return (y.assignedYear || 0) - (x.assignedYear || 0); });
            return { active: active, current: current, former: former };
        }, errors);
    }

    function _buildAppearanceBlock(summary, errors) {
        return _safe('appearance', function () {
            var a = summary.appearance;
            if (!a || typeof a !== 'object') {
                return {
                    hairColor: '', eyeColor: '', skinTone: '', build: '',
                    height: '', distinguishingFeatures: '', tattoos: ''
                };
            }
            return {
                hairColor: typeof a.hairColor === 'string' ? a.hairColor : '',
                eyeColor: typeof a.eyeColor === 'string' ? a.eyeColor : '',
                skinTone: typeof a.skinTone === 'string' ? a.skinTone : '',
                build: typeof a.build === 'string' ? a.build : '',
                height: typeof a.height === 'string' ? a.height : '',
                distinguishingFeatures: typeof a.distinguishingFeatures === 'string'
                    ? a.distinguishingFeatures : '',
                tattoos: typeof a.tattoos === 'string' ? a.tattoos : ''
            };
        }, errors);
    }

    function buildIdentityModel(characterId) {
        if (!_hasId(characterId)) return null;
        var summary;
        try { summary = CQ.getCharacterSummary(characterId); }
        catch (e) { return null; }
        if (!summary) return null;
        var errors = {};
        return {
            characterId: characterId,
            identity:        _buildIdentityBlock(summary, errors),
            surnameHistory:  _buildSurnameHistoryBlock(summary, errors),
            religionHistory: _buildReligionHistoryBlock(summary, errors),
            birth:           _buildBirthBlock(summary, errors),
            death:           _buildDeathBlock(summary, characterId, errors),
            ranks:           _buildRanksBlock(characterId, errors),
            appearance:      _buildAppearanceBlock(summary, errors),
            notes:           typeof summary.notes === 'string' ? summary.notes : '',
            errors:          errors
        };
    }

    // =========================================================================
    // 6. FRIENDSHIP — SECTION BUILDERS + PUBLIC BUILDER
    // =========================================================================

    function _enrichFriend(friendProjection, subjectId, currentYear) {
        if (!friendProjection || !_hasId(friendProjection.friendId)) return null;
        var friendSummary = null;
        try { friendSummary = CQ.getCharacterSummary(friendProjection.friendId); }
        catch (e) { friendSummary = null; }
        if (!friendSummary) return null;
        var friendName = (typeof friendSummary.fullName === 'string'
            && friendSummary.fullName.length > 0)
            ? friendSummary.fullName
            : (friendSummary.name || friendProjection.friendId);
        var typeName = RUI.archetypeName('friendship') || 'Friendship';
        var typeIcon = RUI.archetypeIcon('friendship') || null;
        var typeColor = RUI.archetypeColor('friendship') || null;
        var durationYears = 0;
        if (typeof friendProjection.startYear === 'number') {
            var endYear = (typeof friendProjection.endYear === 'number')
                ? friendProjection.endYear : currentYear;
            durationYears = Math.max(0, endYear - friendProjection.startYear);
        }
        var mutualCount = 0;
        try {
            var mutual = FrQ.getMutualFriends(subjectId, friendProjection.friendId);
            if (Array.isArray(mutual)) mutualCount = mutual.length;
        } catch (e) { mutualCount = 0; }
        var tier = typeof friendProjection.tier === 'string' ? friendProjection.tier : null;
        var tierLabel = null;
        if (tier === 'best_friend') tierLabel = 'Best Friend';
        else if (tier === 'close_friend') tierLabel = 'Close Friend';
        else if (tier === 'friend') tierLabel = 'Friend';
        else if (tier === 'acquaintance') tierLabel = 'Acquaintance';
        else if (tier === 'ended') tierLabel = 'Ended';
        return {
            relationshipId: friendProjection.relationshipId,
            friendId: friendProjection.friendId,
            friendName: friendName,
            friendSurname: friendSummary.surname || '',
            friendGender: friendSummary.gender || 'unknown',
            friendAge: (typeof friendSummary.age === 'number') ? friendSummary.age : null,
            friendIsDeceased: friendSummary.isDeceased === true,
            friendLocationId: friendSummary.locationId || null,
            friendRankId: friendSummary.rankId || null,
            startYear: _isMissing(friendProjection.startYear) ? null : friendProjection.startYear,
            endYear: _isMissing(friendProjection.endYear) ? null : friendProjection.endYear,
            status: friendProjection.status || null,
            strength: (typeof friendProjection.strength === 'number') ? friendProjection.strength : null,
            tier: tier,
            tierLabel: tierLabel,
            durationYears: durationYears,
            notes: friendProjection.notes || '',
            eventCount: (typeof friendProjection.eventCount === 'number')
                ? friendProjection.eventCount : 0,
            mutualFriendCount: mutualCount,
            typeName: typeName,
            typeIcon: typeIcon,
            typeColor: typeColor
        };
    }

    function _buildFriendshipListBlock(subjectId, currentYear, includeEnded, errors) {
        var label = includeEnded ? 'former' : 'active';
        return _safe(label, function () {
            var list = includeEnded
                ? FrQ.getFriendshipsForCharacter(subjectId, { includeEnded: true })
                : FrQ.getFriendshipsForCharacter(subjectId);
            var enriched = [];
            for (var i = 0; i < list.length; i++) {
                var raw = list[i];
                if (!raw) continue;
                if (!includeEnded) { if (raw.status !== 'ongoing') continue; }
                else { if (raw.status === 'ongoing') continue; }
                var entry = _enrichFriend(raw, subjectId, currentYear);
                if (entry) enriched.push(entry);
            }
            if (!includeEnded) {
                enriched.sort(function (a, b) {
                    var sa = (typeof a.strength === 'number') ? a.strength : -1;
                    var sb = (typeof b.strength === 'number') ? b.strength : -1;
                    if (sa !== sb) return sb - sa;
                    return _sortByStartDesc(a, b);
                });
            } else {
                enriched.sort(function (a, b) {
                    var ea = (typeof a.endYear === 'number') ? a.endYear : -1;
                    var eb = (typeof b.endYear === 'number') ? b.endYear : -1;
                    return eb - ea;
                });
            }
            return enriched;
        }, errors);
    }

    function _buildBestFriendBlock(subjectId, currentYear, errors) {
        return _safe('best', function () {
            var best = FrQ.getBestFriend(subjectId);
            if (!best) return null;
            return _enrichFriend(best, subjectId, currentYear);
        }, errors);
    }

    function _buildFriendshipStatsBlock(subjectId, errors) {
        return _safe('stats', function () {
            var raw = FrQ.getFriendshipStats(subjectId);
            if (!raw || typeof raw !== 'object') {
                return {
                    totalFriends: 0, averageStrength: null,
                    earliestStartYear: null, strongestFriendId: null,
                    strongestStrength: null,
                    tierBreakdown: { acquaintance: 0, friend: 0, close_friend: 0, best_friend: 0, unknown: 0 }
                };
            }
            return {
                totalFriends: (typeof raw.totalFriends === 'number') ? raw.totalFriends : 0,
                averageStrength: (typeof raw.averageStrength === 'number') ? raw.averageStrength : null,
                earliestStartYear: _isMissing(raw.earliestStartYear) ? null : raw.earliestStartYear,
                strongestFriendId: raw.strongestFriendId || null,
                strongestStrength: (typeof raw.strongestStrength === 'number') ? raw.strongestStrength : null,
                tierBreakdown: raw.tierBreakdown && typeof raw.tierBreakdown === 'object'
                    ? {
                        acquaintance: raw.tierBreakdown.acquaintance || 0,
                        friend: raw.tierBreakdown.friend || 0,
                        close_friend: raw.tierBreakdown.close_friend || 0,
                        best_friend: raw.tierBreakdown.best_friend || 0,
                        unknown: raw.tierBreakdown.unknown || 0
                    }
                    : { acquaintance: 0, friend: 0, close_friend: 0, best_friend: 0, unknown: 0 }
            };
        }, errors);
    }

    function buildFriendshipModel(characterId) {
        if (!_hasId(characterId)) return null;
        var summary;
        try { summary = CQ.getCharacterSummary(characterId); }
        catch (e) { return null; }
        if (!summary) return null;
        var currentYear = 0;
        if (typeof window.getCurrentYear === 'function') {
            try { currentYear = window.getCurrentYear(); } catch (e) { currentYear = 0; }
        }
        var errors = {};
        return {
            characterId: characterId,
            identity: _safe('identity', function () {
                return {
                    id: summary.id,
                    name: summary.name || '',
                    surname: summary.surname || '',
                    fullName: summary.fullName || summary.name || ''
                };
            }, errors),
            best:   _buildBestFriendBlock(characterId, currentYear, errors),
            active: _buildFriendshipListBlock(characterId, currentYear, false, errors) || [],
            former: _buildFriendshipListBlock(characterId, currentYear, true, errors) || [],
            stats:  _buildFriendshipStatsBlock(characterId, errors),
            errors: errors
        };
    }

    // =========================================================================
    // 7. ROMANCE — SECTION BUILDERS + PUBLIC BUILDER
    // =========================================================================

    function _romanceDisplayLabel(rel, subjectDeceased, partnerDeceased) {
        var status = rel.status;
        var ongoing = status === 'ongoing';
        var widowed = status === 'widowed';
        var ended   = status === 'ended';
        if (ongoing) {
            if (subjectDeceased && partnerDeceased) return 'Both deceased';
            if (subjectDeceased)  return 'Deceased (was partnered)';
            if (partnerDeceased)  return 'Widowed (partner deceased)';
            return 'Active';
        }
        if (widowed) {
            if (subjectDeceased) return 'Deceased (was widowed)';
            if (partnerDeceased) return 'Widowed';
            return 'Widowed';
        }
        if (ended) {
            if (subjectDeceased && partnerDeceased) return 'Both deceased (ended)';
            if (subjectDeceased) return 'Deceased (was partnered)';
            if (partnerDeceased) return 'Partner deceased (ended)';
            return 'Ended';
        }
        return status || 'Unknown';
    }

    function _enrichRomance(rel, subjectId, subjectDeceased, currentYear) {
        if (!rel || !_hasId(rel.partnerId)) return null;
        var partnerSummary = null;
        try { partnerSummary = CQ.getCharacterSummary(rel.partnerId); }
        catch (e) { partnerSummary = null; }
        if (!partnerSummary) return null;
        var partnerName = (typeof partnerSummary.fullName === 'string'
            && partnerSummary.fullName.length > 0)
            ? partnerSummary.fullName
            : (partnerSummary.name || rel.partnerId);
        var partnerDeceased = partnerSummary.isDeceased === true;
        var typeName  = RUI.archetypeName(rel.type) || rel.type;
        var typeIcon  = RUI.archetypeIcon(rel.type) || null;
        var typeColor = RUI.archetypeColor(rel.type) || null;
        var institutionName  = rel.institution ? (RUI.attributeName(rel.institution) || rel.institution) : null;
        var institutionIcon  = rel.institution ? (RUI.attributeIcon(rel.institution) || null) : null;
        var institutionColor = rel.institution ? (RUI.attributeColor(rel.institution) || null) : null;
        var statusLabel = RUI.statusName(rel.status) || rel.status;
        var statusIcon  = RUI.statusIcon(rel.status) || null;
        var durationYears = 0;
        if (typeof rel.startYear === 'number') {
            var endYear = (typeof rel.endYear === 'number') ? rel.endYear : currentYear;
            durationYears = Math.max(0, endYear - rel.startYear);
        }
        return {
            relationshipId: rel.relationshipId,
            partnerId: rel.partnerId,
            partnerName: partnerName,
            partnerSurname: partnerSummary.surname || '',
            partnerGender: partnerSummary.gender || 'unknown',
            partnerAge: (typeof partnerSummary.age === 'number') ? partnerSummary.age : null,
            partnerIsDeceased: partnerDeceased,
            partnerLocationId: partnerSummary.locationId || null,
            partnerRankId: partnerSummary.rankId || null,
            type: rel.type,
            status: rel.status,
            startYear: _isMissing(rel.startYear) ? null : rel.startYear,
            endYear: _isMissing(rel.endYear) ? null : rel.endYear,
            attributes: Array.isArray(rel.attributes) ? rel.attributes.slice() : [],
            institution: rel.institution || null,
            institutionName: institutionName,
            institutionIcon: institutionIcon,
            institutionColor: institutionColor,
            isCommitted: rel.isCommitted === true,
            isAffair: rel.isAffair === true,
            isPolyamorous: rel.isPolyamorous === true,
            isSecret: rel.isSecret === true,
            isScandalous: rel.isScandalous === true,
            isWidowed: rel.status === 'widowed'
                || (rel.status === 'ongoing' && partnerDeceased),
            isEnded: rel.status === 'ended',
            durationYears: durationYears,
            typeName: typeName,
            typeIcon: typeIcon,
            typeColor: typeColor,
            statusLabel: statusLabel,
            statusIcon: statusIcon,
            displayLabel: _romanceDisplayLabel(rel, subjectDeceased, partnerDeceased),
            notes: rel.notes || ''
        };
    }

    function _buildRomanceCurrentBlock(subjectId, subjectDeceased, currentYear, errors) {
        return _safe('current', function () {
            var list = RQm.getActiveRomanticRelationships(subjectId);
            var enriched = [];
            for (var i = 0; i < list.length; i++) {
                var entry = _enrichRomance(list[i], subjectId, subjectDeceased, currentYear);
                if (entry) enriched.push(entry);
            }
            var rankOrder = { committed: 0, casual_dating: 1, one_night_stand: 2 };
            enriched.sort(function (a, b) {
                var ra = rankOrder[a.type] === undefined ? 99 : rankOrder[a.type];
                var rb = rankOrder[b.type] === undefined ? 99 : rankOrder[b.type];
                if (ra !== rb) return ra - rb;
                var sa = typeof a.startYear === 'number' ? a.startYear : Infinity;
                var sb = typeof b.startYear === 'number' ? b.startYear : Infinity;
                return sa - sb;
            });
            return enriched;
        }, errors);
    }

    function _buildRomanceFormerBlock(subjectId, subjectDeceased, currentYear, errors) {
        return _safe('former', function () {
            var list = RQm.getRomanticRelationships(subjectId, { activeOnly: false });
            var enriched = [];
            for (var i = 0; i < list.length; i++) {
                var raw = list[i];
                if (!raw) continue;
                if (raw.status === 'ongoing') continue;
                var entry = _enrichRomance(raw, subjectId, subjectDeceased, currentYear);
                if (entry) enriched.push(entry);
            }
            enriched.sort(function (a, b) {
                var ea = typeof a.endYear === 'number' ? a.endYear : -1;
                var eb = typeof b.endYear === 'number' ? b.endYear : -1;
                if (ea !== eb) return eb - ea;
                var sa = typeof a.startYear === 'number' ? a.startYear : -1;
                var sb = typeof b.startYear === 'number' ? b.startYear : -1;
                return sb - sa;
            });
            return enriched;
        }, errors);
    }

    function _buildRomanceStatsBlock(subjectId, errors) {
        return _safe('stats', function () {
            var raw = RQm.getRomanceStats(subjectId);
            if (!raw || typeof raw !== 'object') {
                return {
                    totalRelationships: 0, activeRelationships: 0,
                    activeCommitted: 0, activeCasual: 0, activeOneNight: 0,
                    activeAffairs: 0, earliestStartYear: null,
                    institutions: [], hasActiveAffair: false
                };
            }
            var active = RQm.getActiveCommittedPartners(subjectId);
            var seenInst = {};
            var institutions = [];
            for (var i = 0; i < active.length; i++) {
                var inst = active[i].institution;
                if (!inst || seenInst[inst]) continue;
                seenInst[inst] = true;
                institutions.push({
                    id: inst,
                    name: RUI.attributeName(inst) || inst,
                    icon: RUI.attributeIcon(inst) || null,
                    color: RUI.attributeColor(inst) || null
                });
            }
            var hasAffair = false;
            try { hasAffair = AQ.isHavingAffair(subjectId) === true; }
            catch (e) { hasAffair = false; }
            return {
                totalRelationships: (typeof raw.totalRelationships === 'number') ? raw.totalRelationships : 0,
                activeRelationships: (typeof raw.activeRelationships === 'number') ? raw.activeRelationships : 0,
                activeCommitted: (typeof raw.activeCommitted === 'number') ? raw.activeCommitted : 0,
                activeCasual: (typeof raw.activeCasual === 'number') ? raw.activeCasual : 0,
                activeOneNight: (typeof raw.activeOneNight === 'number') ? raw.activeOneNight : 0,
                activeAffairs: (typeof raw.activeAffairs === 'number') ? raw.activeAffairs : 0,
                earliestStartYear: _isMissing(raw.earliestStartYear) ? null : raw.earliestStartYear,
                institutions: institutions,
                hasActiveAffair: hasAffair
            };
        }, errors);
    }

    function buildRomanceModel(characterId) {
        if (!_hasId(characterId)) return null;
        var summary;
        try { summary = CQ.getCharacterSummary(characterId); }
        catch (e) { return null; }
        if (!summary) return null;
        var currentYear = 0;
        if (typeof window.getCurrentYear === 'function') {
            try { currentYear = window.getCurrentYear(); } catch (e) { currentYear = 0; }
        }
        var errors = {};
        var subjectDeceased = summary.isDeceased === true;
        var identityBlock = _safe('identity', function () {
            var allowsMultiple = false;
            if (_hasId(summary.rankId)) {
                var rank = resolveRankDisplay(summary.rankId);
                if (rank && rank.allowsMultipleSpouses) allowsMultiple = true;
            }
            return {
                id: summary.id,
                name: summary.name || '',
                surname: summary.surname || '',
                fullName: summary.fullName || summary.name || '',
                activeRankId: summary.rankId || null,
                allowsMultipleSpouses: allowsMultiple
            };
        }, errors);
        return {
            characterId: characterId,
            identity: identityBlock,
            current:  _buildRomanceCurrentBlock(characterId, subjectDeceased, currentYear, errors) || [],
            former:   _buildRomanceFormerBlock(characterId, subjectDeceased, currentYear, errors) || [],
            stats:    _buildRomanceStatsBlock(characterId, errors),
            errors:   errors
        };
    }

    // =========================================================================
    // 8. FAMILY — HELPERS
    // =========================================================================
    //
    // FamilyQueries exposes:
    //   getBiologicalParentIds(childId), getLegalParentIds(childId),
    //   getSocialParentIds(childId), getAllParentIds(childId)
    //   getBiologicalChildIds(parentId), getLegalChildIds(parentId)
    //   getSiblings(childId)  -> [{ siblingId, primaryType,
    //                              sharedBiologicalParents,
    //                              sharedLegalParents,
    //                              sharedSocialParents }]
    //   getGrandparentIds(childId, generation),
    //   getGrandchildIds(parentId, generation)
    //   getParentsByRole(childId) -> { fathers[], mothers[], others[] }
    //     (each entry is an edge wrapper: { id, parentId, childId,
    //                                       parentType, parentRole, ... })
    //
    // ChildrenQueries exposes:
    //   getAdoptionsForChild(childId)   -> adoption metadata records
    //   getAdoptionsForAdopter(adopterId)
    //   getActiveAdoptionsForChild, getActiveAdoptionsForAdopter
    //   getSurrogacyArrangementForChild(childId)
    //   getSurrogacyChildrenForIntendedParent(characterId)
    //
    // Every enriched family entry carries the target character's
    // summary plus:
    //   - relType     role-specific label ("Biological mother" etc.)
    //   - relClass    a stable CSS hook ("parent-bio-mother" etc.)
    //   - birthYear, birthYearDisplay
    //   - isDeceased
    //   - (for siblings) siblingType ("full" | "half-mother" |
    //                                 "half-father" | "step" | "adoptive")

    /**
     * Enriches a bare character id with family-display data. Used by
     * every family section. Returns null for a missing target.
     */
    function _enrichFamilyMember(targetId, relType, relClass, extra) {
        if (!_hasId(targetId)) return null;
        var summary = null;
        try { summary = CQ.getCharacterSummary(targetId); }
        catch (e) { summary = null; }
        if (!summary) return null;

        var name = (typeof summary.fullName === 'string'
            && summary.fullName.length > 0)
            ? summary.fullName
            : (summary.name || targetId);

        var out = {
            id: targetId,
            name: name,
            firstName: summary.name || '',
            surname: summary.surname || '',
            gender: summary.gender || 'unknown',
            age: (typeof summary.age === 'number') ? summary.age : null,
            birthYear: _isMissing(summary.birthYear) ? null : summary.birthYear,
            deathYear: _isMissing(summary.deathYear) ? null : summary.deathYear,
            isDeceased: summary.isDeceased === true,
            locationId: summary.locationId || null,
            rankId: summary.rankId || null,
            relType: relType,
            relClass: relClass
        };

        if (extra && typeof extra === 'object') {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) {
                    out[k] = extra[k];
                }
            }
        }
        return out;
    }

    /**
     * Reads the biological / legal / social parents of a child and
     * groups them by (parentType, parentRole) so the tab can label
     * them:
     *   "Biological mother" / "Biological father" / "Biological parent"
     *   "Adoptive mother" / ...
     *   "Social guardian" / ...
     *
     * Parent role comes from the edge wrapper (getParents returns edges
     * with .parentRole). When a role is missing on the edge, we fall
     * back to the parent's gender: female → mother, male → father,
     * otherwise → parent.
     */
    function _buildParentGroups(childId, errors) {
        return _safe('parents', function () {
            var parentEdges = FQ.getParents(childId);
            var grouped = {
                biological: [],
                legal: [],
                social: [],
                all: [],
                counts: { biological: 0, legal: 0, social: 0 }
            };
            if (!Array.isArray(parentEdges) || parentEdges.length === 0) {
                return grouped;
            }
            // Deduplicate by (parentType + parentRole + parentId) — the
            // edge list can contain multiple edges for the same
            // (parentId, parentType) if history has been messy.
            var seen = {};
            for (var i = 0; i < parentEdges.length; i++) {
                var edge = parentEdges[i];
                if (!edge || !_hasId(edge.parentId)) continue;

                // Only ongoing edges; the tab is about the current
                // family. Ended parent edges appear in the FamilyRules
                // history but should not clutter this tab.
                if (edge.status && edge.status !== 'ongoing') continue;

                var parentType = edge.parentType || 'biological';
                var parentRole = edge.parentRole || 'parent';
                var key = parentType + '|' + parentRole + '|' + edge.parentId;
                if (seen[key]) continue;
                seen[key] = true;

                var relClass = _parentRelClass(parentType, parentRole);
                var relType  = _parentRelLabel(parentType, parentRole);

                var entry = _enrichFamilyMember(
                    edge.parentId,
                    relType,
                    relClass,
                    { parentType: parentType, parentRole: parentRole }
                );
                if (!entry) continue;

                if (parentType === 'biological') grouped.biological.push(entry);
                else if (parentType === 'legal') grouped.legal.push(entry);
                else grouped.social.push(entry);

                grouped.all.push(entry);
            }
            grouped.counts.biological = grouped.biological.length;
            grouped.counts.legal = grouped.legal.length;
            grouped.counts.social = grouped.social.length;
            return grouped;
        }, errors);
    }

    function _parentRelClass(parentType, parentRole) {
        if (parentType === 'biological') {
            if (parentRole === 'mother') return 'parent-bio-mother';
            if (parentRole === 'father') return 'parent-bio-father';
            return 'parent-bio-parent';
        }
        if (parentType === 'legal') {
            if (parentRole === 'mother') return 'parent-legal-mother';
            if (parentRole === 'father') return 'parent-legal-father';
            return 'parent-legal-parent';
        }
        if (parentType === 'social') {
            return 'parent-social';
        }
        return 'parent-other';
    }

    function _parentRelLabel(parentType, parentRole) {
        var typeName;
        if (parentType === 'biological') typeName = 'Biological';
        else if (parentType === 'legal') typeName = 'Adoptive';
        else if (parentType === 'social') typeName = 'Guardian';
        else typeName = 'Parent';

        var roleName;
        if (parentRole === 'mother') roleName = 'mother';
        else if (parentRole === 'father') roleName = 'father';
        else roleName = 'parent';

        return typeName + ' ' + roleName;
    }

    /**
     * Reads the biological + legal children of a parent and groups by
     * child type. Adopted children come from ChildrenQueries'
     * adoption metadata; legal child edges are only the parent-child
     * link, so the distinction "legal by adoption" versus "legal by
     * blood legitimization" is made via the presence of an active
     * adoption record with parentType='legal'.
     */
    function _buildChildGroups(parentId, errors) {
        return _safe('children', function () {
            var biologicalIds = FQ.getBiologicalChildIds(parentId);
            var legalIds = FQ.getLegalChildIds(parentId);

            var bioSet = {};
            for (var i = 0; i < biologicalIds.length; i++) {
                if (_hasId(biologicalIds[i])) bioSet[biologicalIds[i]] = true;
            }

            var biological = [];
            for (var b = 0; b < biologicalIds.length; b++) {
                var bioEntry = _enrichFamilyMember(
                    biologicalIds[b],
                    'Biological child',
                    'child-bio',
                    { childType: 'biological' }
                );
                if (bioEntry) biological.push(bioEntry);
            }

            // Adopted children: legal children whose id is NOT in the
            // biological set. (If a legal child is also biological, the
            // biological entry already covers them; adoptions never
            // overlap with biological children — the family domain
            // prevents it via FamilyRules.canCreateAdoption.)
            var adopted = [];
            for (var l = 0; l < legalIds.length; l++) {
                var cid = legalIds[l];
                if (!_hasId(cid)) continue;
                if (bioSet[cid]) continue;
                var adoptedEntry = _enrichFamilyMember(
                    cid,
                    'Adopted child',
                    'child-legal',
                    { childType: 'legal' }
                );
                if (adoptedEntry) adopted.push(adoptedEntry);
            }

            // Foster / guardianship children: adoption metadata records
            // where this parent is the adopter and the record's type is
            // foster or guardianship.
            var foster = [];
            var guardianship = [];
            try {
                var adoptions = ChQ.getActiveAdoptionsForAdopter(parentId);
                if (Array.isArray(adoptions)) {
                    for (var a = 0; a < adoptions.length; a++) {
                        var rec = adoptions[a];
                        if (!rec || !_hasId(rec.childId)) continue;
                        if (rec.type === 'foster') {
                            var fosterEntry = _enrichFamilyMember(
                                rec.childId,
                                'Foster child',
                                'child-foster',
                                { childType: 'foster', adoptionYear: rec.year }
                            );
                            if (fosterEntry) foster.push(fosterEntry);
                        } else if (rec.type === 'guardianship') {
                            var wardEntry = _enrichFamilyMember(
                                rec.childId,
                                'Ward',
                                'child-guardianship',
                                { childType: 'guardianship', adoptionYear: rec.year }
                            );
                            if (wardEntry) guardianship.push(wardEntry);
                        }
                    }
                }
            } catch (e) { /* defensive */ }

            var allIds = biological.concat(adopted).concat(foster).concat(guardianship);
            allIds.sort(_sortByBirthYearAsc);

            return {
                biological: biological,
                adopted: adopted,
                foster: foster,
                guardianship: guardianship,
                all: allIds,
                counts: {
                    biological: biological.length,
                    adopted: adopted.length,
                    foster: foster.length,
                    guardianship: guardianship.length
                }
            };
        }, errors);
    }

    /**
     * Siblings with classification:
     *   - full           : share both biological parents
     *   - half-mother    : share mother only (biological)
     *   - half-father    : share father only (biological)
     *   - adoptive       : share a legal parent but no biological parent
     *   - step           : share only a social parent (or no parent but
     *                      are co-wards of the same legal parent)
     *
     * FamilyQueries.getSiblings returns { siblingId, primaryType,
     * sharedBiologicalParents, sharedLegalParents,
     * sharedSocialParents }. We re-derive the specific half-mother /
     * half-father distinction from sharedBiologicalParents by checking
     * whether the shared biological parent is the child's mother or
     * father.
     */
    function _buildSiblingGroup(childId, errors) {
        return _safe('siblings', function () {
            var wrappers = FQ.getSiblings(childId);
            if (!Array.isArray(wrappers) || wrappers.length === 0) {
                return { all: [], counts: { full: 0, halfMother: 0, halfFather: 0, adoptive: 0, step: 0 } };
            }

            // Find the subject's biological mother / father ids so we
            // can classify each half sibling as half-mother vs
            // half-father.
            var bioParents = FQ.getBiologicalParentIds(childId);
            var bioFatherId = null;
            var bioMotherId = null;
            for (var bp = 0; bp < bioParents.length; bp++) {
                var parent = null;
                try { parent = CQ.getCharacterSummary(bioParents[bp]); }
                catch (e) { parent = null; }
                if (!parent) continue;
                if (parent.gender === 'female' && bioMotherId === null) {
                    bioMotherId = bioParents[bp];
                } else if (parent.gender === 'male' && bioFatherId === null) {
                    bioFatherId = bioParents[bp];
                }
            }

            var entries = [];
            var counts = { full: 0, halfMother: 0, halfFather: 0, adoptive: 0, step: 0 };

            for (var i = 0; i < wrappers.length; i++) {
                var w = wrappers[i];
                if (!w || !_hasId(w.siblingId)) continue;

                var sharedBio = Array.isArray(w.sharedBiologicalParents)
                    ? w.sharedBiologicalParents : [];
                var sharedLegal = Array.isArray(w.sharedLegalParents)
                    ? w.sharedLegalParents : [];
                var sharedSocial = Array.isArray(w.sharedSocialParents)
                    ? w.sharedSocialParents : [];

                var siblingType;
                var relLabel;
                var relClass;
                var countKey;

                if (sharedBio.length >= 2) {
                    siblingType = 'full';
                    relLabel = 'Full sibling';
                    relClass = 'sibling-full';
                    countKey = 'full';
                } else if (sharedBio.length === 1) {
                    var sharedId = sharedBio[0];
                    if (bioMotherId && sharedId === bioMotherId) {
                        siblingType = 'half-mother';
                        relLabel = 'Half-sibling (same mother)';
                        relClass = 'sibling-half-mother';
                        countKey = 'halfMother';
                    } else if (bioFatherId && sharedId === bioFatherId) {
                        siblingType = 'half-father';
                        relLabel = 'Half-sibling (same father)';
                        relClass = 'sibling-half-father';
                        countKey = 'halfFather';
                    } else {
                        siblingType = 'half-parent';
                        relLabel = 'Half-sibling';
                        relClass = 'sibling-half';
                        countKey = 'halfMother'; // bucket in either half bucket
                    }
                } else if (sharedLegal.length > 0) {
                    siblingType = 'adoptive';
                    relLabel = 'Adoptive sibling';
                    relClass = 'sibling-adoptive';
                    countKey = 'adoptive';
                } else if (sharedSocial.length > 0) {
                    siblingType = 'step';
                    relLabel = 'Step sibling';
                    relClass = 'sibling-step';
                    countKey = 'step';
                } else {
                    // Fall back to the wrapper's own primaryType if it
                    // is one we recognise.
                    var pt = w.primaryType;
                    if (pt === 'full') {
                        siblingType = 'full';
                        relLabel = 'Full sibling';
                        relClass = 'sibling-full';
                        countKey = 'full';
                    } else if (pt === 'half') {
                        siblingType = 'half-parent';
                        relLabel = 'Half-sibling';
                        relClass = 'sibling-half';
                        countKey = 'halfMother';
                    } else if (pt === 'adoptive') {
                        siblingType = 'adoptive';
                        relLabel = 'Adoptive sibling';
                        relClass = 'sibling-adoptive';
                        countKey = 'adoptive';
                    } else if (pt === 'step') {
                        siblingType = 'step';
                        relLabel = 'Step sibling';
                        relClass = 'sibling-step';
                        countKey = 'step';
                    } else {
                        continue;
                    }
                }

                var entry = _enrichFamilyMember(
                    w.siblingId,
                    relLabel,
                    relClass,
                    {
                        siblingType: siblingType,
                        sharedBiologicalParents: sharedBio.slice(),
                        sharedLegalParents: sharedLegal.slice(),
                        sharedSocialParents: sharedSocial.slice()
                    }
                );
                if (!entry) continue;
                entries.push(entry);
                counts[countKey] = (counts[countKey] || 0) + 1;
            }

            entries.sort(_sortByBirthYearAsc);
            return { all: entries, counts: counts };
        }, errors);
    }

    /**
     * Grandchildren, biological, one generation.
     * Also enriches with birth year.
     */
    function _buildGrandchildrenGroup(parentId, errors) {
        return _safe('grandchildren', function () {
            var ids = FQ.getGrandchildIds(parentId, 1);
            if (!Array.isArray(ids) || ids.length === 0) return [];
            var enriched = [];
            for (var i = 0; i < ids.length; i++) {
                var entry = _enrichFamilyMember(
                    ids[i],
                    'Grandchild',
                    'grandchild',
                    { generation: 1 }
                );
                if (entry) enriched.push(entry);
            }
            enriched.sort(_sortByBirthYearAsc);
            return enriched;
        }, errors);
    }

    /**
     * Surrogacy children of this character (as intended parent).
     * Read via ChildrenQueries.getSurrogacyChildrenForIntendedParent.
     */
    function _buildSurrogacyChildrenGroup(characterId, errors) {
        return _safe('surrogacyChildren', function () {
            var ids = ChQ.getSurrogacyChildrenForIntendedParent(characterId);
            if (!Array.isArray(ids) || ids.length === 0) return [];
            var enriched = [];
            for (var i = 0; i < ids.length; i++) {
                var entry = _enrichFamilyMember(
                    ids[i],
                    'Child (via surrogacy)',
                    'child-surrogacy',
                    { childType: 'surrogacy' }
                );
                if (entry) enriched.push(entry);
            }
            enriched.sort(_sortByBirthYearAsc);
            return enriched;
        }, errors);
    }

    /**
     * Adopted parents + guardians of this character (as child). Read
     * from adoption metadata records where this character is the child.
     * Type distinguishes adopted parent / guardian / foster parent.
     */
    function _buildAdoptedParentsGroup(childId, errors) {
        return _safe('adoptedParents', function () {
            var records = [];
            try {
                records = ChQ.getActiveAdoptionsForChild(childId);
            } catch (e) { records = []; }
            if (!Array.isArray(records) || records.length === 0) {
                return { all: [], adopted: [], guardianship: [], foster: [] };
            }
            var adopted = [];
            var guardianship = [];
            var foster = [];
            var all = [];
            var seen = {};
            for (var i = 0; i < records.length; i++) {
                var rec = records[i];
                if (!rec || !_hasId(rec.adopterId)) continue;
                var key = rec.type + '|' + rec.adopterId;
                if (seen[key]) continue;
                seen[key] = true;

                var relType;
                var relClass;
                if (rec.type === 'legal') {
                    relType = 'Adoptive parent';
                    relClass = 'adoptive-parent-legal';
                } else if (rec.type === 'guardianship') {
                    relType = 'Guardian';
                    relClass = 'adoptive-parent-guardianship';
                } else if (rec.type === 'foster') {
                    relType = 'Foster parent';
                    relClass = 'adoptive-parent-foster';
                } else {
                    continue;
                }

                var entry = _enrichFamilyMember(
                    rec.adopterId,
                    relType,
                    relClass,
                    { adoptionType: rec.type, adoptionYear: rec.year }
                );
                if (!entry) continue;

                all.push(entry);
                if (rec.type === 'legal') adopted.push(entry);
                else if (rec.type === 'guardianship') guardianship.push(entry);
                else if (rec.type === 'foster') foster.push(entry);
            }
            return {
                all: all,
                adopted: adopted,
                guardianship: guardianship,
                foster: foster
            };
        }, errors);
    }

    // =========================================================================
    // 9. FAMILY — PUBLIC BUILDER
    // =========================================================================

    /**
     * Builds the model the Family tab consumes.
     *
     * Shape:
     *   {
     *     characterId,
     *     identity: { id, name, surname, fullName },
     *     parents: {
     *       biological[], legal[], social[], all[],
     *       counts: { biological, legal, social }
     *     },
     *     children: {
     *       biological[], adopted[], foster[], guardianship[], all[],
     *       counts: { biological, adopted, foster, guardianship }
     *     },
     *     siblings: {
     *       all[],
     *       counts: { full, halfMother, halfFather, adoptive, step }
     *     },
     *     grandchildren: [ <enriched> ],
     *     surrogacyChildren: [ <enriched> ],
     *     adoptedParents: {
     *       all[], adopted[], guardianship[], foster[]
     *     },
     *     isOrphan: boolean,
     *     errors: { ... }
     *   }
     */
    function buildFamilyModel(characterId) {
        if (!_hasId(characterId)) return null;

        var summary;
        try { summary = CQ.getCharacterSummary(characterId); }
        catch (e) { return null; }
        if (!summary) return null;

        var errors = {};

        var identityBlock = _safe('identity', function () {
            return {
                id: summary.id,
                name: summary.name || '',
                surname: summary.surname || '',
                fullName: summary.fullName || summary.name || ''
            };
        }, errors);

        var parents = _buildParentGroups(characterId, errors) || {
            biological: [], legal: [], social: [], all: [],
            counts: { biological: 0, legal: 0, social: 0 }
        };

        var children = _buildChildGroups(characterId, errors) || {
            biological: [], adopted: [], foster: [], guardianship: [],
            all: [], counts: { biological: 0, adopted: 0, foster: 0, guardianship: 0 }
        };

        var siblings = _buildSiblingGroup(characterId, errors) || {
            all: [],
            counts: { full: 0, halfMother: 0, halfFather: 0, adoptive: 0, step: 0 }
        };

        var grandchildren = _buildGrandchildrenGroup(characterId, errors) || [];
        var surrogacyChildren = _buildSurrogacyChildrenGroup(characterId, errors) || [];
        var adoptedParents = _buildAdoptedParentsGroup(characterId, errors) || {
            all: [], adopted: [], guardianship: [], foster: []
        };

        var isOrphan = false;
        try {
            if (typeof FQ.isOrphan === 'function') {
                var livingIds = function (id) {
                    var s = CQ.getCharacterSummary(id);
                    return !!(s && s.isDeceased !== true);
                };
                isOrphan = FQ.isOrphan(characterId, livingIds) === true;
            }
        } catch (e) {
            isOrphan = false;
        }

        return {
            characterId: characterId,
            identity: identityBlock,
            parents: parents,
            children: children,
            siblings: siblings,
            grandchildren: grandchildren,
            surrogacyChildren: surrogacyChildren,
            adoptedParents: adoptedParents,
            isOrphan: isOrphan,
            errors: errors
        };
    }

    // =========================================================================
    // 10. SKILLS — HELPERS
    // =========================================================================

    /**
     * Resolves a role id to a display name using the canonical role
     * reader. Returns the raw id when neither reader is available or the
     * role is missing. NEVER throws.
     *
     * Preferred path: RoleState.getRole (returns clones).
     * Fallback path:  window.getRoleById (aliased to RoleState.getRole
     *                 by role-system.js; also clones).
     */
    function _resolveRoleName(roleId) {
        if (!_hasId(roleId)) return '';
        var role = null;
        try {
            if (typeof window.RoleState !== 'undefined'
                && window.RoleState !== null
                && typeof window.RoleState.getRole === 'function') {
                role = window.RoleState.getRole(roleId);
            } else if (typeof window.getRoleById === 'function') {
                role = window.getRoleById(roleId);
            }
        } catch (e) {
            role = null;
        }
        if (role && typeof role.name === 'string' && role.name.length > 0) {
            return role.name;
        }
        return roleId;
    }

    /**
     * Resolves a subject key (bare id or 'role_<roleId>') to a display
     * name. Uses SUBJECTS_BY_ID when loaded; otherwise strips the
     * 'role_' prefix and resolves the role name; otherwise returns the
     * raw key. NEVER throws.
     */
    function _resolveSubjectName(key) {
        if (!_hasId(key)) return '';
        if (typeof window.SUBJECTS_BY_ID !== 'undefined'
            && window.SUBJECTS_BY_ID !== null) {
            var sub = window.SUBJECTS_BY_ID[key];
            if (sub && typeof sub.name === 'string' && sub.name.length > 0) {
                return sub.name;
            }
        }
        if (key.indexOf('role_') === 0) {
            var roleId = key.substring(5);
            var roleName = _resolveRoleName(roleId);
            if (roleName) return roleName;
        }
        return key;
    }

    function _buildProfessionsList(characterId, errors) {
        return _safe('professions', function () {
            var raw = CC.getProfessions(characterId);
            if (!Array.isArray(raw)) return [];
            var out = [];
            for (var i = 0; i < raw.length; i++) {
                var p = raw[i];
                if (!p || !_hasId(p.id)) continue;
                out.push({
                    id: p.id,
                    name: typeof p.name === 'string' ? p.name : _resolveRoleName(p.id),
                    roleName: _resolveRoleName(p.id),
                    skillLevel: typeof p.skillLevel === 'number' ? p.skillLevel : 0,
                    tierLabel: skillTierLabel(p.skillLevel),
                    startYear: _isMissing(p.startYear) ? null : p.startYear,
                    primary: p.primary === true,
                    notes: typeof p.notes === 'string' ? p.notes : '',
                    specs: Array.isArray(p.specs) ? p.specs.slice() : [],
                    baseSalary: typeof p.baseSalary === 'number' ? p.baseSalary : 0,
                    customSalary: _isMissing(p.customSalary) ? null : p.customSalary,
                    paysSalary: p.paysSalary === true
                });
            }
            out.sort(function (a, b) {
                if (a.primary !== b.primary) return a.primary ? -1 : 1;
                if (b.skillLevel !== a.skillLevel) return b.skillLevel - a.skillLevel;
                return a.roleName.localeCompare(b.roleName);
            });
            return out;
        }, errors);
    }

    function _buildEducationList(characterId, errors) {
        return _safe('education', function () {
            var raw = CC.getEducationRecords(characterId);
            if (!Array.isArray(raw)) return [];
            var out = [];
            for (var i = 0; i < raw.length; i++) {
                var e = raw[i];
                if (!e || !_hasId(e.institutionId)) continue;
                out.push({
                    institutionId: e.institutionId,
                    institutionName: typeof e.institutionName === 'string'
                        ? e.institutionName : e.institutionId,
                    institutionType: typeof e.institutionType === 'string'
                        ? e.institutionType : '',
                    enrolledYear: _isMissing(e.enrolledYear) ? null : e.enrolledYear,
                    graduated: e.graduated === true,
                    graduationYear: _isMissing(e.graduationYear) ? null : e.graduationYear,
                    grantedRole: _isMissing(e.grantedRole) ? null : e.grantedRole,
                    grantedRoleName: e.grantedRole ? _resolveRoleName(e.grantedRole) : null,
                    withdrawn: e.withdrawn === true,
                    withdrawnReason: typeof e.withdrawnReason === 'string'
                        ? e.withdrawnReason : '',
                    withdrawnYear: _isMissing(e.withdrawnYear) ? null : e.withdrawnYear
                });
            }
            out.sort(function (a, b) {
                var ya = typeof a.enrolledYear === 'number' ? a.enrolledYear : 0;
                var yb = typeof b.enrolledYear === 'number' ? b.enrolledYear : 0;
                return yb - ya;
            });
            return out;
        }, errors);
    }

    function _buildEducationHistoryList(characterId, errors) {
        return _safe('educationHistory', function () {
            var raw = CC.getEducationHistory(characterId);
            if (!Array.isArray(raw)) return [];
            var out = [];
            for (var i = 0; i < raw.length; i++) {
                var e = raw[i];
                if (!e || typeof e !== 'object') continue;
                out.push({
                    institutionId: _isMissing(e.institutionId) ? null : e.institutionId,
                    institutionName: typeof e.institutionName === 'string'
                        ? e.institutionName : '',
                    institutionType: typeof e.institutionType === 'string'
                        ? e.institutionType : '',
                    enrolledYear: _isMissing(e.enrolledYear) ? null : e.enrolledYear,
                    graduationYear: _isMissing(e.graduationYear) ? null : e.graduationYear,
                    grantedRole: _isMissing(e.grantedRole) ? null : e.grantedRole,
                    grantedRoleName: e.grantedRole ? _resolveRoleName(e.grantedRole) : null,
                    taughtRoles: Array.isArray(e.taughtRoles) ? e.taughtRoles.slice() : [],
                    curriculum: Array.isArray(e.curriculum) ? e.curriculum.slice() : []
                });
            }
            out.sort(function (a, b) {
                var ya = typeof a.graduationYear === 'number' ? a.graduationYear : 0;
                var yb = typeof b.graduationYear === 'number' ? b.graduationYear : 0;
                return yb - ya;
            });
            return out;
        }, errors);
    }

    function _buildSubjectProgressList(characterId, errors) {
        return _safe('subjectProgress', function () {
            var raw = CC.getAllSubjectProgress(characterId);
            if (!Array.isArray(raw)) return [];
            var out = [];
            for (var i = 0; i < raw.length; i++) {
                var p = raw[i];
                if (!p || !_hasId(p.key)) continue;
                var level = (typeof p.level === 'number' && p.level >= 0 && p.level <= 100)
                    ? p.level : 0;
                out.push({
                    key: p.key,
                    name: _resolveSubjectName(p.key),
                    level: level,
                    tierLabel: skillTierLabel(level),
                    lastStudied: _isMissing(p.lastStudied) ? null : p.lastStudied,
                    source: _isMissing(p.source) ? null : p.source,
                    type: p.type === 'role' ? 'role' : 'subject',
                    roleId: _isMissing(p.roleId) ? null : p.roleId
                });
            }
            out.sort(function (a, b) { return b.level - a.level; });
            return out;
        }, errors);
    }

    function _buildLiteracyBlock(characterId, errors) {
        return _safe('literacy', function () {
            var isLit = false;
            try { isLit = CC.isLiterate(characterId) === true; }
            catch (e) { isLit = false; }

            var literacyLevel = 0;
            var all = CC.getAllSubjectProgress(characterId);
            if (Array.isArray(all)) {
                for (var i = 0; i < all.length; i++) {
                    if (all[i] && all[i].key === 'literacy'
                        && typeof all[i].level === 'number') {
                        literacyLevel = all[i].level;
                        break;
                    }
                }
            }

            return {
                isLiterate: isLit,
                literacyLevel: literacyLevel,
                tierLabel: skillTierLabel(literacyLevel),
                canTeach: literacyLevel >= 51
            };
        }, errors);
    }

    function _buildApprenticeshipBlock(characterId, errors) {
        return _safe('apprenticeship', function () {
            var AQs = window.ApprenticeshipQueries;
            if (!AQs
                || typeof AQs.getMasters !== 'function'
                || typeof AQs.getApprentices !== 'function') {
                return {
                    available: false,
                    reason: 'Apprenticeship domain is not loaded on this page. ' +
                            'Use the Apprenticeship Manager to view or edit ' +
                            'training relationships.',
                    isMaster: false,
                    master: null,
                    apprentices: []
                };
            }

            var masterEntry = null;
            var apprentices = [];

            try {
                var masters = AQs.getMasters(characterId, true);
                if (Array.isArray(masters) && masters.length > 0) {
                    var m = masters[0];
                    if (m && _hasId(m.masterId)) {
                        masterEntry = {
                            masterId: m.masterId,
                            masterName: typeof m.masterName === 'string'
                                ? m.masterName : resolveName(m.masterId),
                            roleId: _isMissing(m.roleId) ? null : m.roleId,
                            roleName: _resolveRoleName(m.roleId),
                            skillLevel: typeof m.skillLevel === 'number' ? m.skillLevel : 0,
                            stage: m.stage && typeof m.stage === 'object'
                                ? { id: m.stage.id, name: m.stage.name }
                                : null,
                            startYear: _isMissing(m.startYear) ? null : m.startYear
                        };
                    }
                }
            } catch (e) {
                errors['apprenticeship.master'] = (e && e.message) ? e.message : 'unknown error';
            }

            try {
                var apprs = AQs.getApprentices(characterId, true);
                if (Array.isArray(apprs)) {
                    for (var i = 0; i < apprs.length; i++) {
                        var a = apprs[i];
                        if (!a || !_hasId(a.apprenticeId)) continue;
                        apprentices.push({
                            apprenticeId: a.apprenticeId,
                            apprenticeName: typeof a.apprenticeName === 'string'
                                ? a.apprenticeName : resolveName(a.apprenticeId),
                            roleId: _isMissing(a.roleId) ? null : a.roleId,
                            roleName: _resolveRoleName(a.roleId),
                            skillLevel: typeof a.skillLevel === 'number' ? a.skillLevel : 0,
                            stage: a.stage && typeof a.stage === 'object'
                                ? { id: a.stage.id, name: a.stage.name }
                                : null,
                            startYear: _isMissing(a.startYear) ? null : a.startYear
                        });
                    }
                }
            } catch (e) {
                errors['apprenticeship.apprentices'] = (e && e.message) ? e.message : 'unknown error';
            }

            return {
                available: true,
                isMaster: apprentices.length > 0,
                master: masterEntry,
                apprentices: apprentices
            };
        }, errors);
    }

    function _buildTraitsBlock(characterId, errors) {
        return _safe('traits', function () {
            var raw = CC.getTraits(characterId);
            if (!Array.isArray(raw)) return [];
            return raw.slice();
        }, errors);
    }

    // =========================================================================
    // 11. SKILLS — PUBLIC BUILDER
    // =========================================================================

    /**
     * Builds the model the Skills tab consumes.
     *
     * Shape:
     *   {
     *     characterId,
     *     identity: { id, name, surname, fullName, isLiterate },
     *     professions: [ ProfessionEnriched ],
     *     education: [ EducationEntry ],
     *     educationHistory: [ EducationHistoryEntry ],
     *     subjectProgress: [ SubjectProgressEntry ],
     *     literacy: { isLiterate, literacyLevel, tierLabel, canTeach },
     *     apprenticeship: {
     *       available: boolean,
     *       reason?: string,
     *       isMaster: boolean,
     *       master: { masterId, masterName, roleId, roleName,
     *                 skillLevel, stage, startYear } | null,
     *       apprentices: [ { apprenticeId, apprenticeName, roleId,
     *                        roleName, skillLevel, stage, startYear } ]
     *     },
     *     traits: string[],
     *     errors: { ... }
     *   }
     *
     * This builder is READ-ONLY. It does not call any command that
     * mutates. It does not call persist. Every section wrapped in
     * _safe(...) so a single section failure lands in errors[section]
     * without blanking the whole model.
     *
     * Apprenticeship section degrades cleanly when the apprenticeship
     * domain is not loaded on the page (CharacterManager.html does not
     * load it). It returns { available: false, reason, ... } so the tab
     * can render the "unavailable" message rather than an empty list.
     */
    function buildSkillsModel(characterId) {
        if (!_hasId(characterId)) return null;

        var summary;
        try { summary = CQ.getCharacterSummary(characterId); }
        catch (e) { return null; }
        if (!summary) return null;

        var errors = {};

        var identityBlock = _safe('identity', function () {
            return {
                id: summary.id,
                name: summary.name || '',
                surname: summary.surname || '',
                fullName: summary.fullName || summary.name || '',
                isLiterate: summary.isLiterate === true
            };
        }, errors);

        return {
            characterId: characterId,
            identity: identityBlock,
            professions: _buildProfessionsList(characterId, errors) || [],
            education: _buildEducationList(characterId, errors) || [],
            educationHistory: _buildEducationHistoryList(characterId, errors) || [],
            subjectProgress: _buildSubjectProgressList(characterId, errors) || [],
            literacy: _buildLiteracyBlock(characterId, errors) || {
                isLiterate: false, literacyLevel: 0,
                tierLabel: 'Untrained', canTeach: false
            },
            apprenticeship: _buildApprenticeshipBlock(characterId, errors) || {
                available: false, isMaster: false, master: null, apprentices: []
            },
            traits: _buildTraitsBlock(characterId, errors) || [],
            errors: errors
        };
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.CharacterViewModels = {
        // Shared resolvers
        resolveName: resolveName,
        resolvePlaceName: resolvePlaceName,
        resolveRankDisplay: resolveRankDisplay,
        skillTierLabel: skillTierLabel,
        compactRow: compactRow,

        // Identity
        buildIdentityModel: buildIdentityModel,

        // Friendship
        buildFriendshipModel: buildFriendshipModel,

        // Romance
        buildRomanceModel: buildRomanceModel,

        // Family
        buildFamilyModel: buildFamilyModel,

        // Skills
        buildSkillsModel: buildSkillsModel
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterViewModels;
    }
})();
