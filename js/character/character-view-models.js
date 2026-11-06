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
 *   - resolveName(id)                name display for a character id
 *   - resolvePlaceName(placeId)      place display name for a place id
 *   - resolveRankDisplay(rankId)     rank display record for a rank id
 *   - skillTierLabel(level)          5-band skill ladder label
 *   - compactRow(targetId, detail)   one-line character reference HTML
 *   - buildIdentityModel(id)         model for the Identity tab
 *   - buildFriendshipModel(id)       model for the Friendship tab
 *
 * SCOPE (future revisions, as tabs are built):
 *   - buildLocationModel, buildFamilyModel, buildRomanceModel,
 *     buildSkillsModel, buildOverviewModel
 *
 * OUT OF SCOPE:
 *   - Any DOM writes                    -> tab files
 *   - Any mutation                      -> CharacterCommands / RelationshipCommands
 *   - Any localStorage                  -> CharacterUIState
 *   - Any new query logic               -> existing query modules
 *
 * CONTRACT:
 *   - Every builder returns null for a missing character.
 *   - Every builder catches per-section failures internally and records
 *     them under an `errors` key, so one broken read never blanks the
 *     whole tab.
 *   - Builders NEVER throw. Tabs must not need to wrap them in try/catch.
 *   - Builders NEVER mutate canonical state.
 *   - Builders return PLAIN OBJECTS, not HTML. Tabs render.
 *   - Every section is a plain object. Missing sections are `null`.
 *   - Per-section errors are recorded under `errors[sectionKey]`.
 *
 * REQUIRED DEPENDENCIES (load-time):
 *   - CharacterState, CharacterQueries, CharacterCommands
 *   - FamilyQueries, ChildrenQueries, MortalityQueries
 *   - RomanceQueries, FriendshipQueries  (relationship domain)
 *   - RelationshipUI                     (relationship display metadata)
 *   - formatting.js (escapeHtml, formatAge, formatYear, formatYearRange,
 *                    formatDuration, formatCount, getGenderLabel)
 *   - icons.js (Icons)
 *
 * OPTIONAL DEPENDENCIES (guarded at call time):
 *   - window.getRankById         for rank display resolution
 *   - window.getPlaceById        for place display resolution
 *   - ReligionQueries            for religion name resolution
 *   - CultureQueries             for culture name resolution
 *   - RelationshipQueries        for friendship event history lookup
 *
 * ICON POLICY: Uses SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - buildFriendshipModel(characterId) added. Sections:
 *         identity, best, active[], former[], stats, errors.
 *       Each friend entry carries the friendship projection plus
 *       RelationshipUI-derived display metadata (archetypeName / icon /
 *       color) and a mutual-friend count. Former friendships are
 *       included read-only (ended status).
 *     - RelationshipUI + FriendshipQueries + RelationshipQueries are
 *       new required-at-load dependencies. The whole module already
 *       required the character subsystem; the relationship domain is
 *       loaded before the manager modules in CharacterManager.html, so
 *       the relationship domain is available at load.
 *     - No behavioural change to buildIdentityModel or to any resolver.
 *   Previous revision:
 *     - Initial revision. Shared resolvers + buildIdentityModel only.
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
    var FQ  = window.FriendshipQueries;
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

    // =========================================================================
    // 2. RESOLVERS
    // =========================================================================
    //
    // A resolver never throws. It returns the most specific answer it
    // can prove, and falls back to the raw id (or null) when the
    // relevant optional domain is absent.

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

    /**
     * Resolves a rank id to a normalized display record. Returns null
     * when the rank domain (`window.getRankById`) is not available, or
     * the rank record does not exist.
     */
    function resolveRankDisplay(rankId) {
        if (!_hasId(rankId)) return null;
        if (typeof window.getRankById !== 'function') return null;
        var rank;
        try { rank = window.getRankById(rankId); }
        catch (e) { return null; }
        if (!rank || typeof rank !== 'object') return null;

        return {
            rankId: typeof rank.id === 'string' && rank.id.length > 0
                ? rank.id
                : rankId,
            name: typeof rank.name === 'string' && rank.name.length > 0
                ? rank.name
                : rankId,
            symbol: typeof rank.symbol === 'string' && rank.symbol.length > 0
                ? rank.symbol
                : null,
            priority: (typeof rank.priority === 'number'
                && Number.isFinite(rank.priority))
                ? rank.priority
                : null,
            numbered: rank.numbered === true,
            numberingType: (rank.numberingType === 'reign'
                || rank.numberingType === 'ordinal'
                || rank.numberingType === 'roman')
                ? rank.numberingType
                : 'reign',
            numberingGroup: typeof rank.numberingGroup === 'string'
                ? rank.numberingGroup
                : 'global'
        };
    }

    /**
     * 5-band skill tier label. The current tree has no canonical skill-
     * tier vocabulary (the old apprenticeship/skill systems are not in
     * the tree). Defined here once so Identity and Skills tabs agree.
     */
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
    //
    // One-line character reference: rank glyph, gender glyph, clickable
    // name, age, location, relationship detail, deceased marker.

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
                    ? null
                    : summary.surnameSource,
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
                return {
                    birthSurname: '',
                    entries: [],
                    lastUpdated: null
                };
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
                        ? null
                        : e.previousSurname,
                    spouseId: _isMissing(e.spouseId) ? null : e.spouseId,
                    notes: typeof e.notes === 'string' ? e.notes : ''
                });
            }

            return {
                birthSurname: typeof h.birthSurname === 'string'
                    ? h.birthSurname
                    : '',
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
                    fromReligionId: _isMissing(e.fromReligionId)
                        ? null
                        : e.fromReligionId,
                    fromReligionName: _isMissing(e.fromReligionName)
                        ? null
                        : e.fromReligionName,
                    toReligionId: _isMissing(e.toReligionId)
                        ? null
                        : e.toReligionId,
                    toReligionName: _isMissing(e.toReligionName)
                        ? null
                        : e.toReligionName,
                    reason: _isMissing(e.reason) ? null : e.reason,
                    notes: typeof e.notes === 'string' ? e.notes : '',
                    inherited: e.inherited === true,
                    inheritedFrom: _isMissing(e.inheritedFrom)
                        ? null
                        : e.inheritedFrom
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
                    isDeceased: false,
                    year: null,
                    cause: null,
                    causeDetail: null,
                    notes: null,
                    isMurder: false,
                    killerId: null,
                    killerName: null,
                    murderMotive: null,
                    murderMethod: null,
                    isExecution: false,
                    executionReason: null,
                    executionMethod: null,
                    executionLocation: null
                };
            }

            var rec = null;
            try { rec = MQ.getDeathRecord(characterId); }
            catch (e) { rec = null; }

            var killerName = null;
            if (rec && _hasId(rec.killerId)) {
                killerName = resolveName(rec.killerId);
            }

            return {
                isDeceased: true,
                year: rec ? rec.deathYear : (summary.deathYear || null),
                cause: rec ? rec.deathCause : (summary.deathCause || null),
                causeDetail: rec
                    ? rec.deathCauseDetail
                    : (summary.deathCauseDetail || null),
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

            var active = null;
            if (activeAssignment) active = shape(activeAssignment);

            var current = [];
            var former = [];
            for (var i = 0; i < assignments.length; i++) {
                var a = assignments[i];
                if (!a) continue;
                var shaped = shape(a);
                if (a.isDeprecated === true) former.push(shaped);
                else current.push(shaped);
            }

            current.sort(function (x, y) {
                return x.order - y.order;
            });

            former.sort(function (x, y) {
                return (y.assignedYear || 0) - (x.assignedYear || 0);
            });

            return { active: active, current: current, former: former };
        }, errors);
    }

    function _buildAppearanceBlock(summary, errors) {
        return _safe('appearance', function () {
            var a = summary.appearance;
            if (!a || typeof a !== 'object') {
                return {
                    hairColor: '',
                    eyeColor: '',
                    skinTone: '',
                    build: '',
                    height: '',
                    distinguishingFeatures: '',
                    tattoos: ''
                };
            }
            return {
                hairColor: typeof a.hairColor === 'string' ? a.hairColor : '',
                eyeColor: typeof a.eyeColor === 'string' ? a.eyeColor : '',
                skinTone: typeof a.skinTone === 'string' ? a.skinTone : '',
                build: typeof a.build === 'string' ? a.build : '',
                height: typeof a.height === 'string' ? a.height : '',
                distinguishingFeatures: typeof a.distinguishingFeatures === 'string'
                    ? a.distinguishingFeatures
                    : '',
                tattoos: typeof a.tattoos === 'string' ? a.tattoos : ''
            };
        }, errors);
    }

    // =========================================================================
    // 6. IDENTITY — PUBLIC BUILDER
    // =========================================================================

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
    // 7. FRIENDSHIP — SECTION BUILDERS
    // =========================================================================
    //
    // One friendship projection looks like this (from
    // friendship-queries.js::_project):
    //
    //   {
    //     relationshipId, participantA, participantB, friendId,
    //     startYear, endYear, status, strength, tier, notes, eventCount
    //   }
    //
    // We enrich it with:
    //   - display metadata from RelationshipUI (name, icon, color)
    //   - the friend's character summary (name, age, location, etc.)
    //   - a mutual-friend count via FriendshipQueries.getMutualFriends
    //
    // The tab reads ONLY the model. It does not call FriendshipQueries
    // directly for the list. This is the same discipline as Identity.

    /**
     * Enriches a raw friendship projection with display data.
     * Returns null if the projection is invalid or the friend is
     * missing (a dangling reference is not rendered).
     */
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

        // RelationshipUI metadata. If the UI metadata module ever
        // returns null for friendship (it shouldn't — the load-time
        // assertion in relationship-ui-metadata.js guarantees a name
        // exists for every archetype), we fall back to a minimal
        // set with no icon and no color. That keeps the tab
        // renderable in a broken build; the module load guard catches
        // the real bug elsewhere.
        var typeName = RUI.archetypeName('friendship') || 'Friendship';
        var typeIcon = RUI.archetypeIcon('friendship') || null;
        var typeColor = RUI.archetypeColor('friendship') || null;

        var durationYears = 0;
        if (typeof friendProjection.startYear === 'number') {
            var endYear = (typeof friendProjection.endYear === 'number')
                ? friendProjection.endYear
                : currentYear;
            durationYears = Math.max(0, endYear - friendProjection.startYear);
        }

        var mutualCount = 0;
        try {
            var mutual = FQ.getMutualFriends(subjectId, friendProjection.friendId);
            if (Array.isArray(mutual)) mutualCount = mutual.length;
        } catch (e) {
            mutualCount = 0;
        }

        var tier = typeof friendProjection.tier === 'string'
            ? friendProjection.tier
            : null;
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
            startYear: _isMissing(friendProjection.startYear)
                ? null
                : friendProjection.startYear,
            endYear: _isMissing(friendProjection.endYear)
                ? null
                : friendProjection.endYear,
            status: friendProjection.status || null,
            strength: (typeof friendProjection.strength === 'number')
                ? friendProjection.strength
                : null,
            tier: tier,
            tierLabel: tierLabel,
            durationYears: durationYears,
            notes: friendProjection.notes || '',
            eventCount: (typeof friendProjection.eventCount === 'number')
                ? friendProjection.eventCount
                : 0,
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
                ? FQ.getFriendshipsForCharacter(subjectId, { includeEnded: true })
                : FQ.getFriendshipsForCharacter(subjectId);

            var enriched = [];
            for (var i = 0; i < list.length; i++) {
                var raw = list[i];
                if (!raw) continue;
                // Filter: active list keeps only status === 'ongoing';
                // former list keeps only non-ongoing.
                if (!includeEnded) {
                    if (raw.status !== 'ongoing') continue;
                } else {
                    if (raw.status === 'ongoing') continue;
                }
                var entry = _enrichFriend(raw, subjectId, currentYear);
                if (entry) enriched.push(entry);
            }

            // Sort by strength descending (highest first); entries
            // without a numeric strength fall to the end, sorted by
            // start year (newest first). Former list sorts by end year
            // descending (most recently ended first).
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
            var best = FQ.getBestFriend(subjectId);
            if (!best) return null;
            return _enrichFriend(best, subjectId, currentYear);
        }, errors);
    }

    function _buildFriendshipStatsBlock(subjectId, errors) {
        return _safe('stats', function () {
            var raw = FQ.getFriendshipStats(subjectId);
            if (!raw || typeof raw !== 'object') {
                return {
                    totalFriends: 0,
                    averageStrength: null,
                    earliestStartYear: null,
                    strongestFriendId: null,
                    strongestStrength: null,
                    tierBreakdown: {
                        acquaintance: 0,
                        friend: 0,
                        close_friend: 0,
                        best_friend: 0,
                        unknown: 0
                    }
                };
            }
            return {
                totalFriends: (typeof raw.totalFriends === 'number')
                    ? raw.totalFriends
                    : 0,
                averageStrength: (typeof raw.averageStrength === 'number')
                    ? raw.averageStrength
                    : null,
                earliestStartYear: _isMissing(raw.earliestStartYear)
                    ? null
                    : raw.earliestStartYear,
                strongestFriendId: raw.strongestFriendId || null,
                strongestStrength: (typeof raw.strongestStrength === 'number')
                    ? raw.strongestStrength
                    : null,
                tierBreakdown: raw.tierBreakdown && typeof raw.tierBreakdown === 'object'
                    ? {
                        acquaintance: raw.tierBreakdown.acquaintance || 0,
                        friend: raw.tierBreakdown.friend || 0,
                        close_friend: raw.tierBreakdown.close_friend || 0,
                        best_friend: raw.tierBreakdown.best_friend || 0,
                        unknown: raw.tierBreakdown.unknown || 0
                    }
                    : {
                        acquaintance: 0,
                        friend: 0,
                        close_friend: 0,
                        best_friend: 0,
                        unknown: 0
                    }
            };
        }, errors);
    }

    // =========================================================================
    // 8. FRIENDSHIP — PUBLIC BUILDER
    // =========================================================================

    /**
     * Builds the model the Friendship tab consumes.
     *
     * Shape:
     *   {
     *     characterId,
     *     identity:  { id, fullName, name, surname },     -- header for the tab
     *     best:      <enriched friend> | null,
     *     active:    [<enriched friend>, ...],
     *     former:    [<enriched friend>, ...],
     *     stats:     { totalFriends, averageStrength, earliestStartYear,
     *                  strongestFriendId, strongestStrength, tierBreakdown },
     *     errors:    { <sectionKey>: <message> }
     *   }
     *
     * Each enriched friend is the raw friendship projection plus:
     *   - friendName / friendSurname / friendGender / friendAge /
     *     friendIsDeceased / friendLocationId / friendRankId
     *   - typeName / typeIcon / typeColor        (from RelationshipUI)
     *   - tierLabel                              (human label from tier)
     *   - durationYears
     *   - mutualFriendCount
     */
    function buildFriendshipModel(characterId) {
        if (!_hasId(characterId)) return null;

        var summary;
        try { summary = CQ.getCharacterSummary(characterId); }
        catch (e) { return null; }
        if (!summary) return null;

        var currentYear = 0;
        if (typeof window.getCurrentYear === 'function') {
            try { currentYear = window.getCurrentYear(); }
            catch (e) { currentYear = 0; }
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
    // 9. EXPORTS
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
        buildFriendshipModel: buildFriendshipModel
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterViewModels;
    }
})();
