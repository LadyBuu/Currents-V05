/**
 * matchmaking-queries.js
 *
 * Candidate discovery and match proposals.
 * Randomness is supplied by the caller as an array of rolls.
 * No mutation, no persistence.
 */

(function() {
    'use strict';

    var MR = window.MatchmakingRules;
    var RoQ = window.RomanceQueries;
    var FQ  = window.FamilyQueries;
    var RQ  = window.RelationshipQueries;
    var A   = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!MR || !RoQ || !FQ || !RQ || !A || !STATUS) {
        throw new Error('matchmaking-queries.js: matchmaking-rules, romance-queries, family-queries, relationship-* required');
    }

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

    function _age(character, year) {
        if (!character || typeof character.birthYear !== 'number') return 0;
        if (character.isDeceased && character.deathYear && character.deathYear <= year) {
            return Math.max(0, character.deathYear - character.birthYear);
        }
        return Math.max(0, year - character.birthYear);
    }

    function _location(character) {
        if (typeof window.getCurrentLocation === 'function') {
            return window.getCurrentLocation(character) || null;
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // ELIGIBILITY PROJECTIONS
    // -------------------------------------------------------------------------

    /**
     * facts builder for a single candidate.
     */
    function _buildCandidateFacts(character, year) {
        var committed = RoQ.countActiveCommittedPartners(character.id);
        var casual = RoQ.getActiveRomanticRelationships(character.id).filter(function(r) {
            return r.type === A.CASUAL_DATING;
        }).length;
        var hasActivePartner = (committed + casual) > 0;

        return {
            id: character.id,
            character: character,
            age: _age(character, year),
            gender: character.gender || null,
            location: _location(character),
            hasActivePartner: hasActivePartner,
            isWidowed: _isWidowed(character.id),
            isDeceased: !!character.isDeceased
        };
    }

    function _isWidowed(characterId) {
        var rels = RQ.getForCharacter(characterId, { status: STATUS.WIDOWED });
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].type === A.COMMITTED) return true;
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // SURPRISE MATCHES
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   maxMatches: number (default 5),
     *   minAge: number,
     *   maxAgeGap: number,
     *   preference: PREFERENCE (default ANY),
     *   rolls: number[]   // required; one roll per attempt
     * }
     *
     * Returns array of proposal objects:
     *   { a: id, b: id, ageA, ageB, ageGap, sameLocation }
     */
    function findSurpriseMatches(options) {
        options = options || {};
        var maxMatches = (options.maxMatches !== undefined) ? options.maxMatches : 5;
        var rolls = options.rolls || [];
        var year = (options.year !== undefined) ? options.year : _getCurrentYear();
        var preference = options.preference || MR.PREFERENCE.ANY;
        var minAge = (options.minAge !== undefined) ? options.minAge : MR.DEFAULT_MIN_AGE;
        var maxAgeGap = (options.maxAgeGap !== undefined) ? options.maxAgeGap : MR.DEFAULT_MAX_AGE_GAP;

        var rollIndex = 0;
        function nextRoll() {
            if (rollIndex < rolls.length) return rolls[rollIndex++];
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

            // Pick two unused singles
            var a = null, b = null;
            for (var ai = 0; ai < singles.length; ai++) {
                var r = nextRoll();
                if (r === null) return matches;
                if (used[singles[ai].id]) continue;
                if (r < 0.3) { a = singles[ai]; break; }
            }
            if (!a) a = _pickUnused(singles, used, nextRoll);
            if (!a) break;

            for (var bi = 0; bi < singles.length; bi++) {
                var r2 = nextRoll();
                if (r2 === null) return matches;
                if (singles[bi].id === a.id) continue;
                if (used[singles[bi].id]) continue;
                if (r2 < 0.3) { b = singles[bi]; break; }
            }
            if (!b) b = _pickUnusedExcept(singles, used, a.id, nextRoll);
            if (!b) break;

            var ageGap = Math.abs(a.age - b.age);

            if (!MR.passesAgeGap({ ageGap: ageGap, maxAgeGap: maxAgeGap })) continue;

            if (!MR.passesGenderPreference({
                subjectGender: a.gender,
                candidateGender: b.gender,
                preference: preference
            })) continue;

            var chance = MR.acceptanceChance({ ageGap: ageGap, maxAgeGap: maxAgeGap });
            var acceptRoll = nextRoll();
            if (acceptRoll === null) return matches;
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

        matches.sort(function(x, y) { return x.ageGap - y.ageGap; });
        return matches;
    }

    function _pickUnused(singles, used, roll) {
        for (var i = 0; i < singles.length; i++) {
            if (!used[singles[i].id]) return singles[i];
        }
        return null;
    }

    function _pickUnusedExcept(singles, used, excludeId, roll) {
        for (var i = 0; i < singles.length; i++) {
            if (singles[i].id !== excludeId && !used[singles[i].id]) return singles[i];
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // LATE SPRING MATCH
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   maxAgeGap: number (default LATE_SPRING_MAX_AGE_GAP),
     *   preference: PREFERENCE
     * }
     *
     * Returns a single proposal or null.
     */
    function findLateSpringMatch(options) {
        options = options || {};
        var year = (options.year !== undefined) ? options.year : _getCurrentYear();
        var maxAgeGap = (options.maxAgeGap !== undefined)
            ? options.maxAgeGap
            : MR.LATE_SPRING_MAX_AGE_GAP;
        var preference = options.preference || MR.PREFERENCE.ANY;

        var all = _getCharacters();
        var widowed = [];
        for (var i = 0; i < all.length; i++) {
            var facts = _buildCandidateFacts(all[i], year);
            if (!MR.isEligibleLateSpring(facts)) continue;
            widowed.push(facts);
        }

        if (widowed.length < 2) return null;

        // Deterministic: pick first compatible pair by age
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

    window.MatchmakingQueries = {
        findSurpriseMatches: findSurpriseMatches,
        findLateSpringMatch: findLateSpringMatch
    };

})();
