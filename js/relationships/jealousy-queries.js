/**
 * jealousy-queries.js
 *
 * Semantic reads for jealousy.
 * Discovers jealousy targets by gathering facts for JealousyRules.
 * No policy, no mutation, no persistence.
 *
 * JEALOUSY HISTORY OWNERSHIP:
 *   Stored on the character record as `character.jealousyHistory` for
 *   backward compatibility. Returns defensive projections.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var RoQ = window.RomanceQueries;
    var JR = window.JealousyRules;
    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !RoQ || !JR || !A || !ATTR || !STATUS) {
        throw new Error('jealousy-queries.js: relationship-queries.js, romance-queries.js, jealousy-rules.js must load first');
    }

    // -------------------------------------------------------------------------
    // DEPENDENCIES
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('jealousy-queries.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error('jealousy-queries.js: getCharacters required');
        }
        return window.getCharacters();
    }

    function _rankPriority(character) {
        if (!character || !character.activeRankId) return 5;
        if (typeof window.getRankById !== 'function') return 5;
        var rank = window.getRankById(character.activeRankId);
        return (rank && typeof rank.priority === 'number') ? rank.priority : 5;
    }

    // -------------------------------------------------------------------------
    // FACT GATHERING
    // -------------------------------------------------------------------------

    /**
     * Gathers the fact bundle JealousyRules.calculateJealousy needs for
     * (subject, target, about).
     */
    function _gatherJealousyFacts(subjectId, targetId, aboutId) {
        var subject = _getCharacter(subjectId);
        var target = _getCharacter(targetId);
        if (!subject || !target) return null;

        // Romantic: subject's relationship with `about` vs target's relationship with `about`
        var romantic = null;
        if (aboutId) {
            var subjectWithAbout = RQ.getActiveBetweenOfType(subjectId, aboutId, A.COMMITTED).concat(
                RQ.getActiveBetweenOfType(subjectId, aboutId, A.CASUAL_DATING)
            );
            var targetWithAbout = RQ.getActiveBetweenOfType(targetId, aboutId, A.COMMITTED).concat(
                RQ.getActiveBetweenOfType(targetId, aboutId, A.CASUAL_DATING)
            ).concat(
                RQ.getActiveBetweenOfType(targetId, aboutId, A.ONE_NIGHT_STAND)
            );

            romantic = {
                subjectRelationship: subjectWithAbout.length > 0 ? subjectWithAbout[0] : null,
                targetRelationship:  targetWithAbout.length > 0 ? targetWithAbout[0] : null
            };
        }

        // Professional
        var professional = {
            subjectRankPriority: _rankPriority(subject),
            targetRankPriority: _rankPriority(target)
        };

        // Rivalry
        var rivalry = {
            exists: RQ.hasActiveBetweenOfType(subjectId, targetId, A.RIVALRY)
        };

        return {
            romantic: romantic,
            professional: professional,
            rivalry: rivalry,
            traits: (subject.traits || []).slice()
        };
    }

    // -------------------------------------------------------------------------
    // CALCULATION ENTRY POINT (uses JealousyRules)
    // -------------------------------------------------------------------------

    /**
     * Returns { level, triggers, type } for a jealousy relationship.
     * Reads facts then delegates to rules.
     */
    function getJealousyBetween(subjectId, targetId, aboutId) {
        var facts = _gatherJealousyFacts(subjectId, targetId, aboutId || null);
        if (!facts) return { level: 0, triggers: [], type: null };
        return JR.calculateJealousy(facts);
    }

    // -------------------------------------------------------------------------
    // TARGET DISCOVERY
    // -------------------------------------------------------------------------

    /**
     * Returns an array of jealousy target projections:
     *   [{ targetId, aboutId, level, triggers, type }]
     *
     * `aboutId` is the person subject cares about that target is involved with.
     */
    function findAllJealousyTargets(subjectId) {
        var subject = _getCharacter(subjectId);
        if (!subject) return [];

        // People subject cares about romantically
        var caredAboutIds = [];
        var committed = RoQ.getActiveCommittedPartners(subjectId);
        for (var i = 0; i < committed.length; i++) {
            caredAboutIds.push(committed[i].partnerId);
        }
        var casual = RoQ.getActiveRomanticPartners(subjectId).filter(function(p) {
            return p.relationship.type === A.CASUAL_DATING;
        });
        for (var c = 0; c < casual.length; c++) {
            if (caredAboutIds.indexOf(casual[c].partnerId) === -1) {
                caredAboutIds.push(casual[c].partnerId);
            }
        }

        if (caredAboutIds.length === 0) return [];

        var allChars = _getCharacters();
        var results = [];

        for (var i = 0; i < allChars.length; i++) {
            var target = allChars[i];
            if (target.id === subjectId) continue;
            if (target.isDeceased) continue;

            var best = null;
            for (var j = 0; j < caredAboutIds.length; j++) {
                var aboutId = caredAboutIds[j];
                if (target.id === aboutId) continue;

                var jv = getJealousyBetween(subjectId, target.id, aboutId);
                if (jv.level >= 0.3) {
                    if (!best || jv.level > best.level) {
                        best = {
                            targetId: target.id,
                            aboutId: aboutId,
                            level: jv.level,
                            triggers: jv.triggers.slice(),
                            type: jv.type
                        };
                    }
                }
            }
            if (best) results.push(best);
        }

        results.sort(function(a, b) { return b.level - a.level; });
        return results;
    }

    function getPrimaryJealousyTarget(subjectId) {
        var targets = findAllJealousyTargets(subjectId);
        return targets.length > 0 ? targets[0] : null;
    }

    // -------------------------------------------------------------------------
    // HISTORY
    // -------------------------------------------------------------------------

    /**
     * Returns a copy of the character's jealousy history.
     */
    function getJealousyHistory(characterId) {
        var character = _getCharacter(characterId);
        if (!character || !Array.isArray(character.jealousyHistory)) return [];
        return character.jealousyHistory.map(function(entry) {
            return {
                year: entry.year,
                targetId: entry.targetId,
                aboutId: entry.aboutId || null,
                jealousyLevel: entry.jealousyLevel,
                consequence: entry.consequence
            };
        });
    }

    /**
     * Returns the rivalry relationships for a character, projected.
     */
    function getConflictHistory(characterId) {
        var rivals = RQ.getForCharacter(characterId, { type: A.RIVALRY });
        var result = [];
        for (var i = 0; i < rivals.length; i++) {
            var rel = rivals[i];
            var otherId = rel.participantA === characterId
                ? rel.participantB
                : rel.participantA;
            var meta = rel.metadata || {};
            result.push({
                rivalId: otherId,
                relationshipId: rel.id,
                startYear: rel.startYear,
                endYear: rel.endYear,
                status: rel.status,
                intensity: (typeof meta.intensity === 'number') ? meta.intensity : null,
                cause: meta.cause || null
            });
        }
        return result;
    }

    // -------------------------------------------------------------------------

    window.JealousyQueries = {
        getJealousyBetween: getJealousyBetween,
        findAllJealousyTargets: findAllJealousyTargets,
        getPrimaryJealousyTarget: getPrimaryJealousyTarget,
        getJealousyHistory: getJealousyHistory,
        getConflictHistory: getConflictHistory
    };

})();
