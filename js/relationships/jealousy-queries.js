/**
 * jealousy-queries.js
 *
 * Semantic reads for jealousy.
 *
 * Owns:
 *   - jealousy evaluation between two characters (subject, target,
 *     about) — gathering facts and delegating to JealousyRules
 *   - discovery of jealousy targets for a subject
 *   - primary jealousy target
 *   - conflict projections (rivalries and enmities) for a subject
 *
 * Does NOT own:
 *   - state access (goes through RelationshipQueries / RomanceQueries /
 *     RivalryQueries)
 *   - mutation
 *   - persistence
 *   - randomness
 *   - jealousy history (v1 does not persist it; see module note)
 *
 * JEALOUSY HISTORY (v1):
 *   Jealousy events are not persisted in v1. The domain derives what it
 *   needs from current relationship facts and, if needed, from
 *   JealousyCommands' event log. If historical escalation becomes
 *   mechanically necessary, it graduates to its own state module. It is
 *   deliberately NOT stored on character records and NOT stuffed into
 *   relationship metadata.
 *
 * Every returned value is a defensive projection. Never a live record.
 * Unknown inputs return null or []. No fabrication.
 *
 * Load order: after relationship-queries.js, romance-queries.js,
 * rivalry-queries.js, jealousy-rules.js.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var RoQ = window.RomanceQueries;
    var RvQ = window.RivalryQueries;
    var JR = window.JealousyRules;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !RoQ || !RvQ || !JR || !A || !ATTR || !STATUS) {
        throw new Error('jealousy-queries.js: relationship-queries.js, romance-queries.js, rivalry-queries.js, jealousy-rules.js must load first');
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
    //
    // Builds the fact bundle JealousyRules.calculateJealousy needs.
    // All reads go through domain queries; this module never touches
    // state.
    // -------------------------------------------------------------------------

    function _gatherJealousyFacts(subjectId, targetId, aboutId) {
        var subject = _getCharacter(subjectId);
        var target = _getCharacter(targetId);
        if (!subject || !target) return null;

        var romantic = null;
        if (typeof aboutId === 'string' && aboutId.length > 0) {
            // Subject's relationship with `about`
            var subjCommitted = RoQ.getActiveCommittedBetween(subjectId, aboutId);
            var subjCasual = RoQ.getActiveRomanticRelationshipsBetween(subjectId, aboutId);
            var subjRel = null;
            if (subjCommitted.length > 0) subjRel = subjCommitted[0];
            else if (subjCasual.length > 0) subjRel = subjCasual[0];

            // Target's relationship with `about`
            var targCommitted = RoQ.getActiveCommittedBetween(targetId, aboutId);
            var targCasual = RoQ.getActiveRomanticRelationshipsBetween(targetId, aboutId);
            var targRel = null;
            if (targCommitted.length > 0) targRel = targCommitted[0];
            else if (targCasual.length > 0) targRel = targCasual[0];

            romantic = {
                subjectRelationship: subjRel
                    ? {
                        type: subjRel.type,
                        status: subjRel.status,
                        attributes: Array.isArray(subjRel.attributes)
                            ? subjRel.attributes.slice()
                            : []
                    }
                    : null,
                targetRelationship: targRel
                    ? {
                        type: targRel.type,
                        status: targRel.status,
                        attributes: Array.isArray(targRel.attributes)
                            ? targRel.attributes.slice()
                            : []
                    }
                    : null
            };
        }

        var professional = {
            subjectRankPriority: _rankPriority(subject),
            targetRankPriority: _rankPriority(target)
        };

        var rivalry = {
            exists: RvQ.areInConflict(subjectId, targetId)
        };

        return {
            romantic: romantic,
            professional: professional,
            rivalry: rivalry,
            traits: Array.isArray(subject.traits) ? subject.traits.slice() : []
        };
    }

    // -------------------------------------------------------------------------
    // CALCULATION ENTRY POINT
    // -------------------------------------------------------------------------

    /**
     * Returns { level, triggers, type } for jealousy subject → target
     * mediated by `aboutId` (the person subject cares about and target
     * is involved with). `aboutId` may be null for non-romantic jealousy.
     */
    function getJealousyBetween(subjectId, targetId, aboutId) {
        if (typeof subjectId !== 'string' || typeof targetId !== 'string') {
            return { level: 0, triggers: [], type: null };
        }
        if (subjectId === targetId) {
            return { level: 0, triggers: [], type: null };
        }

        var facts = _gatherJealousyFacts(subjectId, targetId, aboutId || null);
        if (!facts) return { level: 0, triggers: [], type: null };
        return JR.calculateJealousy(facts);
    }

    // -------------------------------------------------------------------------
    // TARGET DISCOVERY
    //
    // For a subject, find every target toward whom the subject feels
    // jealousy, with the `about` person who mediates it. Results are
    // sorted by level descending.
    // -------------------------------------------------------------------------

    /**
     * Returns an array of projections:
     *   [{ targetId, aboutId, level, triggers, type }]
     */
    function findAllJealousyTargets(subjectId) {
        var subject = _getCharacter(subjectId);
        if (!subject) return [];

        // People the subject cares about
        var caredAboutIds = [];
        var committed = RoQ.getActiveCommittedPartners(subjectId);
        for (var i = 0; i < committed.length; i++) {
            if (committed[i].partnerId) caredAboutIds.push(committed[i].partnerId);
        }
        var casual = RoQ.getActiveRomanticPartners(subjectId);
        for (var c = 0; c < casual.length; c++) {
            if (casual[c].type === A.CASUAL_DATING && casual[c].partnerId) {
                if (caredAboutIds.indexOf(casual[c].partnerId) === -1) {
                    caredAboutIds.push(casual[c].partnerId);
                }
            }
        }

        if (caredAboutIds.length === 0) return [];

        var allChars = _getCharacters();
        var results = [];

        for (var j = 0; j < allChars.length; j++) {
            var target = allChars[j];
            if (target.id === subjectId) continue;
            if (target.isDeceased) continue;

            var best = null;
            for (var k = 0; k < caredAboutIds.length; k++) {
                var aboutId = caredAboutIds[k];
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

        results.sort(function(x, y) { return y.level - x.level; });
        return results;
    }

    function getPrimaryJealousyTarget(subjectId) {
        var targets = findAllJealousyTargets(subjectId);
        return targets.length > 0 ? targets[0] : null;
    }

    // -------------------------------------------------------------------------
    // CONFLICT PROJECTIONS
    //
    // Aggregates rivalries and enmities from RivalryQueries into a
    // unified conflict list. Kept here because jealousy and conflict
    // are conceptually adjacent even though rivalry owns the underlying
    // records.
    // -------------------------------------------------------------------------

    function getConflictHistory(characterId) {
        if (typeof characterId !== 'string' || characterId.length === 0) return [];
        var list = RvQ.getConflicts(characterId, { includeEnded: true });
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            out.push({
                relationshipId: c.relationshipId,
                type: c.type,
                otherId: c.otherId,
                status: c.status,
                startYear: c.startYear,
                endYear: c.endYear
            });
        }
        return out;
    }

    function getActiveConflicts(characterId) {
        if (typeof characterId !== 'string' || characterId.length === 0) return [];
        var list = RvQ.getConflicts(characterId);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            out.push({
                relationshipId: c.relationshipId,
                type: c.type,
                otherId: c.otherId,
                status: c.status,
                startYear: c.startYear,
                endYear: c.endYear
            });
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // STATISTICS
    // -------------------------------------------------------------------------

    function getJealousyStats(characterId) {
        var targets = findAllJealousyTargets(characterId);
        var conflicts = getActiveConflicts(characterId);
        var rivals = 0;
        var enemies = 0;

        for (var i = 0; i < conflicts.length; i++) {
            if (conflicts[i].type === A.RIVALRY) rivals++;
            else if (conflicts[i].type === A.ENMITY) enemies++;
        }

        var highest = targets.length > 0 ? targets[0].level : 0;

        return {
            jealousyTargetCount: targets.length,
            highestJealousyLevel: highest,
            activeRivals: rivals,
            activeEnemies: enemies
        };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.JealousyQueries = {
        getJealousyBetween: getJealousyBetween,
        findAllJealousyTargets: findAllJealousyTargets,
        getPrimaryJealousyTarget: getPrimaryJealousyTarget,

        getConflictHistory: getConflictHistory,
        getActiveConflicts: getActiveConflicts,

        getJealousyStats: getJealousyStats
    };

})();
