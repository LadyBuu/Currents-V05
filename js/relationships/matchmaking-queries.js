/**
 * matchmaking-queries.js
 *
 * Candidate discovery and match proposals.
 *
 * Owns:
 *   - single-candidate discovery
 *   - widowed-candidate discovery for late-spring matches
 *   - surprise match generation (roll-driven)
 *   - late-spring match generation (deterministic)
 *
 * Does NOT own:
 *   - state access (goes through CharacterState / RomanceQueries)
 *   - mutation
 *   - persistence
 *   - randomness generation (the caller supplies an array of rolls for
 *     surprise matches; late-spring matches are deterministic)
 *   - match creation (that is RomanceCommands' job)
 *
 * ROLLS CONTRACT (surprise matches):
 *   The caller supplies a flat array of rolls in [0, 1). Rolls are
 *   consumed in order. If the array is exhausted, generation stops and
 *   whatever has been produced so far is returned. Supply at least
 *   maxMatches * 40 rolls if you want the algorithm to be able to fill
 *   its quota.
 *
 * Every returned value is a defensive projection. No live records.
 *
 * Load order: after matchmaking-rules.js, romance-queries.js,
 * relationship-queries.js.
 */

(function() {
    'use strict';

    var MR  = window.MatchmakingRules;
    var RoQ = window.RomanceQueries;
    var RQ  = window.RelationshipQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!MR || !RoQ || !RQ || !A || !STATUS) {
        throw new Error('matchmaking-queries.js: matchmaking-rules.js, romance-queries.js, relationship-queries.js must load first');
    }

    var COMMITTED = A.COMMITTED;
    var CASUAL    = A.CASUAL_DATING;

    // -------------------------------------------------------------------------
    // DEPENDENCIES
    // -------------------------------------------------------------------------

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error('matchmaking-queries.js: getCharacters required');
        }
        return window.getCharacters();
    }

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('matchmaking-queries.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('matchmaking-queries.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge !== 'function') {
            throw new Error('matchmaking-queries.js: calculateAge required');
        }
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }

    function _location(character) {
        if (typeof window.getCurrentLocation !== 'function') return null;
        var loc = window.getCurrentLocation(character);
        return (loc === undefined) ? null : loc;
    }

    // -------------------------------------------------------------------------
    // CANDIDATE FACTS
    //
    // Builds the facts object MatchmakingRules consumes. Reads through
    // RomanceQueries / RelationshipQueries; never through state.
    // -------------------------------------------------------------------------

    function _isWidowed(characterId) {
        var rels = RQ.getForCharacter(characterId, { status: STATUS.WIDOWED });
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].type === COMMITTED) return true;
        }
        return false;
    }

    function _hasActivePartner(characterId) {
        if (RoQ.countActiveCommittedPartners(characterId) > 0) return true;

        var romantic = RoQ.getActiveRomanticPartners(characterId);
        for (var i = 0; i < romantic.length; i++) {
            if (romantic[i].type === CASUAL) return true;
        }
        return false;
    }

    function _buildCandidateFacts(character, year) {
        return {
            id: character.id,
            character: character,
            age: (typeof character.birthYear === 'number')
                ? _calculateAge(character.birthYear, character.isDeceased, character.deathYear)
                : null,
            gender: typeof character.gender === 'string' ? character.gender : null,
            location: _location(character),
            hasActivePartner: _hasActivePartner(character.id),
            isWidowed: _isWidowed(character.id),
            isDeceased: !!character.isDeceased
        };
    }

    // -------------------------------------------------------------------------
    // SURPRISE MATCHES
    //
    // options: {
    //   year?: number,
    //   maxMatches?: number,        // default 5
    //   minAge?: number,            // default MR.DEFAULT_MIN_AGE
    //   maxAgeGap?: number,         // default MR.DEFAULT_MAX_AGE_GAP
    //   preference?: PREFERENCE,
    //   rolls: number[]             // required for stochastic selection
    // }
    //
    // Returns an array of proposals:
    //   [{ a, b, ageA, ageB, ageGap, sameLocation, locationA, locationB }]
    //
    // Deterministic given the same rolls, same population, same options.
    // -------------------------------------------------------------------------

    function findSurpriseMatches(options) {
        options = options || {};

        var maxMatches = (typeof options.maxMatches === 'number')
            ? options.maxMatches
            : 5;
        var rolls = Array.isArray(options.rolls) ? options.rolls : [];
        var year = options.year !== undefined ? options.year : _getCurrentYear();
        var preference = MR.isValidPreference(options.preference)
            ? options.preference
            : MR.PREFERENCE.ANY;
        var minAge = (typeof options.minAge === 'number')
            ? options.minAge
            : MR.DEFAULT_MIN_AGE;
        var maxAgeGap = (typeof options.maxAgeGap === 'number')
            ? options.maxAgeGap
            : MR.DEFAULT_MAX_AGE_GAP;

        var rollIndex = 0;
        function nextRoll() {
            if (rollIndex < rolls.length) {
                var r = rolls[rollIndex++];
                return (typeof r === 'number' && !isNaN(r)) ? r : null;
            }
            return null;
        }

        var all = _getCharacters();
        var singles = [];
        for (var i = 0; i < all.length; i++) {
            var facts = _buildCandidateFacts(all[i], year);
            if (!MR.isEligibleSingle({
                isDeceased: facts.isDeceased,
                age: facts.age,
                hasActivePartner: facts.hasActivePartner,
                minAge: minAge
            })) continue;
            singles.push(facts);
        }

        if (singles.length < 2) return [];

        var matches = [];
        var used = {};
        var attempts = 0;
        var maxAttempts = maxMatches * 40;

        while (matches.length < maxMatches && attempts < maxAttempts) {
            attempts++;

            var a = _pickCandidate(singles, used, nextRoll, null);
            if (!a) return _finalize(matches);

            var b = _pickCandidate(singles, used, nextRoll, a.id);
            if (!b) return _finalize(matches);

            var ageGap = Math.abs(a.age - b.age);

            if (!MR.passesAgeGap({ ageGap: ageGap, maxAgeGap: maxAgeGap })) continue;

            if (!MR.passesGenderPreference({
                subjectGender: a.gender,
                candidateGender: b.gender,
                preference: preference
            })) continue;

            var chance = MR.acceptanceChance({ ageGap: ageGap, maxAgeGap: maxAgeGap });
            var acceptRoll = nextRoll();
            if (acceptRoll === null) return _finalize(matches);
            if (acceptRoll > chance) continue;

            used[a.id] = true;
            used[b.id] = true;
            matches.push({
                a: a.id,
                b: b.id,
                ageA: a.age,
                ageB: b.age,
                ageGap: ageGap,
                sameLocation: a.location === b.location,
                locationA: a.location,
                locationB: b.location
            });
        }

        return _finalize(matches);
    }

    function _pickCandidate(singles, used, nextRoll, excludeId) {
        // Preferred: probabilistic pick using the next roll.
        for (var i = 0; i < singles.length; i++) {
            var r = nextRoll();
            if (r === null) return null;
            if (used[singles[i].id]) continue;
            if (excludeId !== null && singles[i].id === excludeId) continue;
            if (r < 0.3) return singles[i];
        }
        // Fallback: first unused candidate, if any remain.
        for (var j = 0; j < singles.length; j++) {
            if (used[singles[j].id]) continue;
            if (excludeId !== null && singles[j].id === excludeId) continue;
            return singles[j];
        }
        return null;
    }

    function _finalize(matches) {
        matches.sort(function(x, y) { return x.ageGap - y.ageGap; });
        return matches;
    }

    // -------------------------------------------------------------------------
    // LATE SPRING MATCH
    //
    // options: {
    //   year?: number,
    //   maxAgeGap?: number,         // default MR.LATE_SPRING_MAX_AGE_GAP
    //   preference?: PREFERENCE
    // }
    //
    // Deterministic: picks the youngest compatible widowed pair within
    // the age gap. Returns a single proposal or null.
    // -------------------------------------------------------------------------

    function findLateSpringMatch(options) {
        options = options || {};

        var year = options.year !== undefined ? options.year : _getCurrentYear();
        var maxAgeGap = (typeof options.maxAgeGap === 'number')
            ? options.maxAgeGap
            : MR.LATE_SPRING_MAX_AGE_GAP;
        var preference = MR.isValidPreference(options.preference)
            ? options.preference
            : MR.PREFERENCE.ANY;

        var all = _getCharacters();
        var widowed = [];
        for (var i = 0; i < all.length; i++) {
            var facts = _buildCandidateFacts(all[i], year);
            if (!MR.isEligibleLateSpring(facts)) continue;
            widowed.push(facts);
        }

        if (widowed.length < 2) return null;

        widowed.sort(function(a, b) { return a.age - b.age; });

        for (var x = 0; x < widowed.length; x++) {
            for (var y = x + 1; y < widowed.length; y++) {
                var a = widowed[x];
                var b = widowed[y];
                var gap = Math.abs(a.age - b.age);
                if (gap > maxAgeGap) continue;
                if (!MR.passesGenderPreference({
                    subjectGender: a.gender,
                    candidateGender: b.gender,
                    preference: preference
                })) continue;
                return {
                    a: a.id,
                    b: b.id,
                    ageA: a.age,
                    ageB: b.age,
                    ageGap: gap,
                    sameLocation: a.location === b.location,
                    locationA: a.location,
                    locationB: b.location
                };
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // CANDIDATE LISTING (UI helper)
    //
    // Returns eligible singles within a given age range, for use by UI
    // pickers. No proposal generation.
    // -------------------------------------------------------------------------

    function getEligibleSingles(options) {
        options = options || {};
        var year = options.year !== undefined ? options.year : _getCurrentYear();
        var minAge = (typeof options.minAge === 'number')
            ? options.minAge
            : MR.DEFAULT_MIN_AGE;
        var maxAge = (typeof options.maxAge === 'number')
            ? options.maxAge
            : Infinity;

        var all = _getCharacters();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            var facts = _buildCandidateFacts(all[i], year);
            if (!MR.isEligibleSingle({
                isDeceased: facts.isDeceased,
                age: facts.age,
                hasActivePartner: facts.hasActivePartner,
                minAge: minAge
            })) continue;
            if (facts.age > maxAge) continue;
            out.push({
                characterId: facts.id,
                age: facts.age,
                gender: facts.gender,
                location: facts.location
            });
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.MatchmakingQueries = {
        findSurpriseMatches: findSurpriseMatches,
        findLateSpringMatch: findLateSpringMatch,
        getEligibleSingles: getEligibleSingles
    };

})();
