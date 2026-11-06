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
 *   - buildFamilyModel(id)          EXPANDED
 *   - buildLocationModel(id)
 *
 * SCOPE (future revisions, as tabs are built):
 *   - buildSkillsModel, buildOverviewModel
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
 *   - HouseholdQueries, ResidenceSystem, LocationQueries, FamilyRules
 *
 * OPTIONAL DEPENDENCIES (guarded at call time):
 *   - window.getRankById, window.getPlaceById
 *   - ReligionQueries, CultureQueries, RelationshipQueries
 *   - world.getCurrentLocationId
 *
 * ICON POLICY: Uses SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (family-tab P2):
 *     - buildFamilyModel expanded with:
 *         parents.father / parents.mother  — the biological father and
 *           mother ids/names, or null. Convenience for the tab's "Set
 *           mother" / "Set father" controls, which need to know whether
 *           the role is currently filled and by whom.
 *
 *         children.<each>.parentCoverage  — new per-child field:
 *             'both'          both of this character's partners are on
 *                             the child (solid circle)
 *             'mother-only'   only the mother is on the child
 *             'father-only'   only the father is on the child
 *             'adopted'       child was adopted by this character
 *             'unknown'       cannot be determined
 *           Computed from the child's biological parent ids and this
 *           character's partner set (if any). If this character has no
 *           partner, every child is 'both' or 'mother-only' /
 *           'father-only' based on which role this character fills.
 *
 *         fosterAsChild[]      — foster parents OF this character (this
 *                                character as the child in a foster
 *                                adoption record).
 *         wardAsChild[]        — guardians OF this character.
 *         fosterChildren[]     — foster children OF this character.
 *         wardChildren[]       — wards OF this character.
 *           All four blocks return enriched entries, or [] when no
 *           records exist.
 *
 *         partnerForBaby       — the single active committed partner of
 *                                this character, or null. Convenience
 *                                for the "generate new baby" flow,
 *                                which needs a partner to resolve the
 *                                second parent without prompting when
 *                                exactly one committed partner exists.
 *
 *       All new fields are additive; no existing field changed shape.
 *   Previous revision (household-tab P7):
 *     - Added buildLocationModel.
 *   Previous revision:
 *     - Added buildFamilyModel.
 *   Previous revision:
 *     - Added buildRomanceModel.
 *   Earlier revision:
 *     - Added buildFriendshipModel.
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
     * Reads the biological / legal / social parents of a child and groups.
     * Also exposes `father` and `mother` convenience fields for the tab's
     * Set-mother / Set-father controls.
     */
    function _buildParentGroups(childId, errors) {
        return _safe('parents', function () {
            var parentEdges = FQ.getParents(childId);
            var grouped = {
                biological: [],
                legal: [],
                social: [],
                all: [],
                father: null,
                mother: null,
                counts: { biological: 0, legal: 0, social: 0 }
            };
            if (!Array.isArray(parentEdges) || parentEdges.length === 0) {
                return grouped;
            }
            var seen = {};
            for (var i = 0; i < parentEdges.length; i++) {
                var edge = parentEdges[i];
                if (!edge || !_hasId(edge.parentId)) continue;
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

                // Convenience: expose biological father / mother.
                if (parentType === 'biological') {
                    if (parentRole === 'father' && !grouped.father) {
                        grouped.father = entry;
                    } else if (parentRole === 'mother' && !grouped.mother) {
                        grouped.mother = entry;
                    }
                }
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
     * Classifies a child's parent coverage from the perspective of the
     * subject:
     *   'both'          both a mother and a father are recorded on the
     *                   child
     *   'mother-only'   only a mother is recorded
     *   'father-only'   only a father is recorded
     *   'adopted'       child is legally adopted by the subject
     *   'unknown'       cannot be determined
     *
     * The classification is derived from the child's parent edges
     * (biological mother + biological father), independent of the
     * subject. It is the same classification the sibling-circle uses,
     * applied to children.
     *
     * @param {string} childId
     * @param {boolean} adoptedBySubject
     * @returns {'both'|'mother-only'|'father-only'|'adopted'|'unknown'}
     */
    function _classifyChildCoverage(childId, adoptedBySubject) {
        if (adoptedBySubject) return 'adopted';

        var bioParents;
        try { bioParents = FQ.getBiologicalParentIds(childId); }
        catch (e) { bioParents = []; }
        if (!Array.isArray(bioParents) || bioParents.length === 0) {
            return 'unknown';
        }

        var hasMother = false;
        var hasFather = false;
        for (var i = 0; i < bioParents.length; i++) {
            var summary = null;
            try { summary = CQ.getCharacterSummary(bioParents[i]); }
            catch (e) { summary = null; }
            if (!summary) continue;
            if (summary.gender === 'female') hasMother = true;
            else if (summary.gender === 'male') hasFather = true;
        }

        if (hasMother && hasFather) return 'both';
        if (hasMother) return 'mother-only';
        if (hasFather) return 'father-only';
        return 'unknown';
    }

    function _buildChildGroups(parentId, errors) {
        return _safe('children', function () {
            var biologicalIds = FQ.getBiologicalChildIds(parentId);
            var legalIds = FQ.getLegalChildIds(parentId);

            var bioSet = {};
            for (var i = 0; i < biologicalIds.length; i++) {
                if (_hasId(biologicalIds[i])) bioSet[biologicalIds[i]] = true;
            }

            // Collect legal-adopted child ids (legal children who are
            // NOT also biological) so we can flag their coverage.
            var adoptedSet = {};
            for (var l = 0; l < legalIds.length; l++) {
                var cid = legalIds[l];
                if (!_hasId(cid)) continue;
                if (bioSet[cid]) continue;
                adoptedSet[cid] = true;
            }

            var biological = [];
            for (var b = 0; b < biologicalIds.length; b++) {
                var coverage = _classifyChildCoverage(biologicalIds[b], false);
                var bioEntry = _enrichFamilyMember(
                    biologicalIds[b],
                    'Biological child',
                    'child-bio',
                    { childType: 'biological', parentCoverage: coverage }
                );
                if (bioEntry) biological.push(bioEntry);
            }

            var adopted = [];
            for (var l2 = 0; l2 < legalIds.length; l2++) {
                var cid2 = legalIds[l2];
                if (!_hasId(cid2)) continue;
                if (bioSet[cid2]) continue;
                var adoptedEntry = _enrichFamilyMember(
                    cid2,
                    'Adopted child',
                    'child-legal',
                    { childType: 'legal', parentCoverage: 'adopted' }
                );
                if (adoptedEntry) adopted.push(adoptedEntry);
            }

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

    function _buildSiblingGroup(childId, errors) {
        return _safe('siblings', function () {
            var wrappers = FQ.getSiblings(childId);
            if (!Array.isArray(wrappers) || wrappers.length === 0) {
                return { all: [], counts: { full: 0, halfMother: 0, halfFather: 0, adoptive: 0, step: 0 } };
            }

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
                        countKey = 'halfMother';
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

    /**
     * Reads the foster / guardianship relationships OF this character
     * (i.e. this character as the child). These are the records where
     * this character appears as `childId` in an adoption record of type
     * 'foster' or 'guardianship'. Returned as two arrays so the tab can
     * render them under Foster Parents / Guardians sections.
     */
    function _buildAsChildFosterAndGuardianBlock(childId, errors) {
        return _safe('asChildFosterGuardian', function () {
            var records = [];
            try { records = ChQ.getActiveAdoptionsForChild(childId); }
            catch (e) { records = []; }
            if (!Array.isArray(records)) {
                return { fosterParents: [], guardians: [] };
            }

            var fosterParents = [];
            var guardians = [];
            var seen = {};

            for (var i = 0; i < records.length; i++) {
                var rec = records[i];
                if (!rec || !_hasId(rec.adopterId)) continue;
                if (rec.type !== 'foster' && rec.type !== 'guardianship') continue;

                var key = rec.type + '|' + rec.adopterId;
                if (seen[key]) continue;
                seen[key] = true;

                var relType = rec.type === 'foster' ? 'Foster parent' : 'Guardian';
                var relClass = rec.type === 'foster'
                    ? 'adoptive-parent-foster'
                    : 'adoptive-parent-guardianship';

                var entry = _enrichFamilyMember(
                    rec.adopterId,
                    relType,
                    relClass,
                    { adoptionType: rec.type, adoptionYear: rec.year }
                );
                if (!entry) continue;

                if (rec.type === 'foster') fosterParents.push(entry);
                else guardians.push(entry);
            }

            return { fosterParents: fosterParents, guardians: guardians };
        }, errors);
    }

    /**
     * Resolves the single active committed partner of this character, or
     * null. Used by the generate-new-baby flow to pre-select the second
     * parent without prompting when there is exactly one committed
     * partner.
     */
    function _buildPartnerForBabyBlock(subjectId, errors) {
        return _safe('partnerForBaby', function () {
            var active;
            try { active = RQm.getActiveCommittedPartners(subjectId); }
            catch (e) { return null; }
            if (!Array.isArray(active) || active.length === 0) return null;
            if (active.length > 1) return null;
            var p = active[0];
            if (!p || !_hasId(p.partnerId)) return null;
            var summary = null;
            try { summary = CQ.getCharacterSummary(p.partnerId); }
            catch (e) { summary = null; }
            if (!summary) return null;
            return {
                partnerId: p.partnerId,
                partnerName: summary.fullName || summary.name || p.partnerId,
                partnerGender: summary.gender || 'unknown'
            };
        }, errors);
    }

    // =========================================================================
    // 9. FAMILY — PUBLIC BUILDER
    // =========================================================================

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
                fullName: summary.fullName || summary.name || '',
                gender: summary.gender || 'unknown'
            };
        }, errors);

        var parents = _buildParentGroups(characterId, errors) || {
            biological: [], legal: [], social: [], all: [],
            father: null, mother: null,
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

        var asChildFG = _buildAsChildFosterAndGuardianBlock(characterId, errors)
            || { fosterParents: [], guardians: [] };
        var partnerForBaby = _buildPartnerForBabyBlock(characterId, errors);

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

            // Foster / guardianship of this character (as the child):
            fosterAsChild: asChildFG.fosterParents,
            wardAsChild: asChildFG.guardians,

            // Convenience for the "generate new baby" flow:
            partnerForBaby: partnerForBaby,

            isOrphan: isOrphan,
            errors: errors
        };
    }

    // =========================================================================
    // 10. LOCATION — SUB-BLOCK BUILDERS
    // =========================================================================

    function _resolveCurrentLocationBlock(summary, characterId) {
        var raw = (summary && typeof summary.locationId === 'string')
            ? summary.locationId
            : null;

        var resolved = raw;
        var source = raw ? 'explicit' : 'none';

        if (typeof window.getCurrentLocationId === 'function' && summary) {
            try {
                var semantic = window.getCurrentLocationId(summary);
                if (typeof semantic === 'string' && semantic.length > 0) {
                    if (semantic === raw) {
                        resolved = raw;
                        source = 'explicit';
                    } else {
                        resolved = semantic;
                        source = raw ? 'explicit' : 'move';
                    }
                }
            } catch (e) { /* fall through */ }
        }

        var name = resolved ? resolvePlaceName(resolved) : null;

        return {
            locationId: resolved || null,
            locationName: name || null,
            source: source,
            rawCurrentLocationId: raw,
            resolvedDiffersFromRaw: (resolved || null) !== (raw || null)
        };
    }

    function _resolveBirthplaceBlock(summary) {
        if (!summary || !summary.birthplaceId) {
            return { placeId: null, placeName: null };
        }
        return {
            placeId: summary.birthplaceId,
            placeName: resolvePlaceName(summary.birthplaceId)
        };
    }

    function _resolveMovesBlock(characterId, errors) {
        return _safe('moves', function () {
            var moves = [];
            if (typeof CQ.getMoveHistory === 'function') {
                try { moves = CQ.getMoveHistory(characterId) || []; }
                catch (e) { moves = []; }
            }
            if (!Array.isArray(moves)) return [];
            var out = [];
            for (var i = 0; i < moves.length; i++) {
                var m = moves[i];
                if (!m || typeof m !== 'object') continue;
                out.push({
                    index: i,
                    year: _isMissing(m.year) ? null : m.year,
                    locationId: _isMissing(m.locationId) ? null : m.locationId,
                    locationName: _isMissing(m.locationName)
                        ? (m.locationId ? resolvePlaceName(m.locationId) : null)
                        : m.locationName,
                    fromLocationId: _isMissing(m.fromLocationId)
                        ? null : m.fromLocationId,
                    fromLocationName: _isMissing(m.fromLocationName)
                        ? null : m.fromLocationName,
                    note: _isMissing(m.note) ? null : m.note,
                    isBirthMove: m.isBirthMove === true,
                    timestamp: _isMissing(m.timestamp) ? null : m.timestamp
                });
            }
            out.sort(function (a, b) {
                var ya = typeof a.year === 'number' ? a.year : -Infinity;
                var yb = typeof b.year === 'number' ? b.year : -Infinity;
                if (ya !== yb) return ya - yb;
                return a.index - b.index;
            });
            return out;
        }, errors);
    }

    function _resolveHouseholdBlock(summary, errors) {
        return _safe('household', function () {
            if (typeof window.HouseholdQueries === 'undefined'
                || window.HouseholdQueries === null) {
                return {
                    available: false,
                    reason: 'HouseholdQueries is not loaded',
                    householdId: null,
                    householdName: null,
                    role: null,
                    isHead: false,
                    memberCount: 0,
                    currentNameSince: null,
                    currentLocationName: null
                };
            }

            var householdId = (summary && typeof summary.householdId === 'string'
                && summary.householdId.length > 0)
                ? summary.householdId
                : (summary && typeof summary.household === 'string'
                    && summary.household.length > 0
                    ? summary.household
                    : null);

            if (!householdId) {
                return {
                    available: true,
                    householdId: null,
                    householdName: null,
                    role: null,
                    isHead: false,
                    memberCount: 0,
                    currentNameSince: null,
                    currentLocationName: null
                };
            }

            var h = null;
            try { h = window.HouseholdQueries.getHousehold(householdId); }
            catch (e) { h = null; }

            if (!h) {
                return {
                    available: true,
                    householdId: householdId,
                    householdName: null,
                    role: null,
                    isHead: false,
                    memberCount: 0,
                    currentNameSince: null,
                    currentLocationName: null,
                    danglingReference: true
                };
            }

            var role = null;
            var isHead = false;
            if (Array.isArray(summary.householdHistory)) {
                for (var i = summary.householdHistory.length - 1; i >= 0; i--) {
                    var entry = summary.householdHistory[i];
                    if (!entry || entry.householdId !== householdId) continue;
                    if (entry.leftYear !== null && entry.leftYear !== undefined) {
                        continue;
                    }
                    if (typeof entry.role === 'string' && entry.role.length > 0) {
                        role = entry.role;
                    }
                    isHead = entry.isHead === true;
                    break;
                }
            }

            return {
                available: true,
                householdId: householdId,
                householdName: h.name || null,
                role: role,
                isHead: isHead,
                memberCount: typeof h.memberCount === 'number' ? h.memberCount : 0,
                currentNameSince: _isMissing(h.currentNameSince)
                    ? null : h.currentNameSince,
                currentLocationName: h.locationName || null
            };
        }, errors);
    }

    function _resolveHouseholdMembersBlock(householdId, errors) {
        return _safe('householdMembers', function () {
            if (!_hasId(householdId)) return [];
            if (typeof window.HouseholdQueries === 'undefined'
                || window.HouseholdQueries === null) {
                return [];
            }
            if (typeof window.HouseholdQueries.getHouseholdMembers !== 'function') {
                return [];
            }
            var members = [];
            try { members = window.HouseholdQueries.getHouseholdMembers(householdId); }
            catch (e) { members = []; }
            if (!Array.isArray(members)) return [];

            var out = [];
            for (var i = 0; i < members.length; i++) {
                var m = members[i];
                if (!m || !_hasId(m.characterId)) continue;
                out.push({
                    characterId: m.characterId,
                    characterName: m.characterName || '',
                    name: (m.character && m.character.name) || '',
                    surname: (m.character && m.character.surname) || '',
                    age: (typeof m.age === 'number') ? m.age : null,
                    gender: (m.character && m.character.gender) || 'unknown',
                    isHead: m.isHead === true,
                    isDeceased: m.isDeceased === true,
                    isMissing: m.isMissing === true,
                    role: m.role || null,
                    type: m.type || null,
                    departmentId: m.departmentId || null,
                    joinedYear: _isMissing(m.joinedYear) ? null : m.joinedYear
                });
            }
            out.sort(function (a, b) {
                if (a.isHead !== b.isHead) return a.isHead ? -1 : 1;
                var an = (a.characterName || a.name || '').toLowerCase();
                var bn = (b.characterName || b.name || '').toLowerCase();
                return an.localeCompare(bn);
            });
            return out;
        }, errors);
    }

    function _resolveHouseholdHistoryBlock(summary, errors) {
        return _safe('householdHistory', function () {
            var raw = summary && Array.isArray(summary.householdHistory)
                ? summary.householdHistory
                : [];

            var structured = true;
            var out = [];
            for (var i = 0; i < raw.length; i++) {
                var e = raw[i];
                if (!e || typeof e !== 'object') {
                    if (typeof e === 'string') {
                        structured = false;
                    }
                    continue;
                }
                out.push({
                    householdId: _isMissing(e.householdId) ? null : e.householdId,
                    householdName: _isMissing(e.householdName) ? null : e.householdName,
                    joinedYear: _isMissing(e.joinedYear) ? null : e.joinedYear,
                    leftYear: _isMissing(e.leftYear) ? null : e.leftYear,
                    leftReason: _isMissing(e.leftReason) ? null : e.leftReason,
                    role: _isMissing(e.role) ? null : e.role,
                    isHead: e.isHead === true,
                    timestamp: _isMissing(e.timestamp) ? null : e.timestamp,
                    isCurrent: (e.leftYear === null || e.leftYear === undefined)
                });
            }

            out.sort(function (a, b) {
                var ja = typeof a.joinedYear === 'number' ? a.joinedYear : -Infinity;
                var jb = typeof b.joinedYear === 'number' ? b.joinedYear : -Infinity;
                return ja - jb;
            });

            return {
                entries: out,
                structured: structured
            };
        }, errors);
    }

    function _resolveResidencesBlock(householdId, errors) {
        return _safe('residences', function () {
            if (typeof window.ResidenceSystem === 'undefined'
                || window.ResidenceSystem === null) {
                return {
                    available: false,
                    reason: 'ResidenceSystem is not loaded',
                    entries: []
                };
            }

            if (!_hasId(householdId)) {
                return { available: true, entries: [] };
            }

            var residences = [];
            try {
                residences = window.ResidenceSystem
                    .getResidencesByHousehold(householdId) || [];
            } catch (e) { residences = []; }
            if (!Array.isArray(residences)) residences = [];

            var entries = [];
            for (var i = 0; i < residences.length; i++) {
                var r = residences[i];
                if (!r || !_hasId(r.id)) continue;

                var unitNumber = null;
                var unitId = null;
                try {
                    var units = window.ResidenceSystem.getUnits(r.id) || [];
                    for (var u = 0; u < units.length; u++) {
                        var unit = units[u];
                        if (unit && unit.householdId === householdId
                            && !unit.isDemolished) {
                            unitNumber = unit.unitNumber;
                            unitId = unit.id;
                            break;
                        }
                    }
                } catch (e) { /* leave null */ }

                var unitStats = null;
                try { unitStats = window.ResidenceSystem.getUnitStats(r.id); }
                catch (e) { unitStats = null; }

                entries.push({
                    id: r.id,
                    name: r.name || r.id,
                    typeId: r.typeId || null,
                    typeName: r.typeName || null,
                    locationId: r.locationId || null,
                    locationName: r.locationName || null,
                    condition: r.condition || null,
                    isMultiUnit: r.isMultiUnit === true,
                    isVacant: r.isVacant === true,
                    isDemolished: r.isDemolished === true,
                    occupiedUnitNumber: unitNumber,
                    occupiedUnitId: unitId,
                    unitStats: unitStats,
                    estimatedValue: _isMissing(r.estimatedValue)
                        ? null : r.estimatedValue,
                    builtYear: _isMissing(r.builtYear) ? null : r.builtYear
                });
            }
            entries.sort(function (a, b) {
                if (a.isDemolished !== b.isDemolished) {
                    return a.isDemolished ? 1 : -1;
                }
                return (a.name || '').localeCompare(b.name || '');
            });
            return { available: true, entries: entries };
        }, errors);
    }

    function _resolveRelationshipClass(subjectId, targetId) {
        if (!_hasId(subjectId) || !_hasId(targetId)) return null;
        if (subjectId === targetId) return null;

        try {
            if (RQm && typeof RQm.getActiveCommittedPartners === 'function') {
                var committed = RQm.getActiveCommittedPartners(subjectId);
                if (Array.isArray(committed)) {
                    for (var i = 0; i < committed.length; i++) {
                        var p = committed[i];
                        if (p && p.partnerId === targetId) return 'spouse';
                    }
                }
            }
        } catch (e) { /* skip */ }

        try {
            if (typeof window.FamilyRules !== 'undefined'
                && window.FamilyRules !== null
                && typeof FQ.classifyKinship === 'function') {
                var k = FQ.classifyKinship(subjectId, targetId);
                if (k && k.type
                    && k.type !== window.FamilyRules.KINSHIP.SELF
                    && k.type !== window.FamilyRules.KINSHIP.UNRELATED) {
                    return 'blood';
                }
            }
        } catch (e) { /* skip */ }

        try {
            if (typeof FrQ.isFriends === 'function' && FrQ.isFriends(subjectId, targetId)) {
                return 'relative';
            }
        } catch (e) { /* skip */ }
        try {
            if (RQm && typeof RQm.getActiveRomanticRelationships === 'function') {
                var active = RQm.getActiveRomanticRelationships(subjectId);
                if (Array.isArray(active)) {
                    for (var j = 0; j < active.length; j++) {
                        var rel = active[j];
                        if (rel && rel.partnerId === targetId
                            && rel.isCommitted !== true) {
                            return 'relative';
                        }
                    }
                }
            }
        } catch (e) { /* skip */ }

        return null;
    }

    function _resolveRelationshipCirclesBlock(subjectId, memberIds, errors) {
        return _safe('relationshipCircles', function () {
            var byTargetId = {};
            if (!_hasId(subjectId) || !Array.isArray(memberIds)) {
                return { byTargetId: byTargetId };
            }
            for (var i = 0; i < memberIds.length; i++) {
                var targetId = memberIds[i];
                if (!_hasId(targetId)) continue;
                var cls = _resolveRelationshipClass(subjectId, targetId);
                if (cls) byTargetId[targetId] = cls;
            }
            return { byTargetId: byTargetId };
        }, errors);
    }

    // =========================================================================
    // 11. LOCATION — PUBLIC BUILDER
    // =========================================================================

    function buildLocationModel(characterId) {
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
                isDeceased: summary.isDeceased === true
            };
        }, errors);

        var currentLocationBlock = _safe(
            'currentLocation',
            function () { return _resolveCurrentLocationBlock(summary, characterId); },
            errors
        ) || {
            locationId: null,
            locationName: null,
            source: 'none',
            rawCurrentLocationId: null,
            resolvedDiffersFromRaw: false
        };

        var birthplaceBlock = _safe(
            'birthplace',
            function () { return _resolveBirthplaceBlock(summary); },
            errors
        ) || { placeId: null, placeName: null };

        var movesBlock = _resolveMovesBlock(characterId, errors) || [];

        var householdBlock = _resolveHouseholdBlock(summary, errors) || {
            available: false,
            reason: 'household block failed',
            householdId: null,
            householdName: null,
            role: null,
            isHead: false,
            memberCount: 0,
            currentNameSince: null,
            currentLocationName: null
        };

        var householdMembersBlock = householdBlock.householdId
            ? (_resolveHouseholdMembersBlock(householdBlock.householdId, errors) || [])
            : [];

        var householdHistoryBlock = _resolveHouseholdHistoryBlock(summary, errors) || {
            entries: [],
            structured: true
        };

        var residencesBlock = _resolveResidencesBlock(
            householdBlock.householdId, errors
        ) || { available: false, reason: 'residences block failed', entries: [] };

        var memberIds = [];
        for (var m = 0; m < householdMembersBlock.length; m++) {
            if (householdMembersBlock[m] && householdMembersBlock[m].characterId) {
                memberIds.push(householdMembersBlock[m].characterId);
            }
        }
        var relationshipCirclesBlock = _resolveRelationshipCirclesBlock(
            characterId, memberIds, errors
        ) || { byTargetId: {} };

        return {
            characterId: characterId,
            identity: identityBlock,
            currentLocation: currentLocationBlock,
            birthplace: birthplaceBlock,
            moves: movesBlock,
            household: householdBlock,
            householdMembers: householdMembersBlock,
            householdHistory: householdHistoryBlock.entries,
            householdHistoryStructured: householdHistoryBlock.structured === true,
            residences: residencesBlock,
            relationshipCircles: relationshipCirclesBlock,
            notes: typeof summary.notes === 'string' ? summary.notes : '',
            errors: errors
        };
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.CharacterViewModels = {
        resolveName: resolveName,
        resolvePlaceName: resolvePlaceName,
        resolveRankDisplay: resolveRankDisplay,
        skillTierLabel: skillTierLabel,
        compactRow: compactRow,

        buildIdentityModel: buildIdentityModel,
        buildFriendshipModel: buildFriendshipModel,
        buildRomanceModel: buildRomanceModel,
        buildFamilyModel: buildFamilyModel,
        buildLocationModel: buildLocationModel
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterViewModels;
    }
})();
