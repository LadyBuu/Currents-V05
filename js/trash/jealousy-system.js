/**
 * =============================================================================
 * STILL WATERS - JEALOUSY SYSTEM
 * =============================================================================
 * 
 * Jealousy detection and conflict management.
 * NO TRUST - uses relationship strength and social distance.
 * 
 * DEPENDENCIES:
 *   - relationship-registry.js (getRelationshipsForCharacter)
 *   - friendship-logic.js (getFriendshipStrength)
 *   - family-logic.js (getConsanguinityDegree)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var JEALOUSY_TYPES = {
        ROMANTIC: { id: 'romantic', name: 'Romantic Jealousy', threshold: 0.6 },
        SOCIAL: { id: 'social', name: 'Social Jealousy', threshold: 0.4 },
        PROFESSIONAL: { id: 'professional', name: 'Professional Jealousy', threshold: 0.5 },
        FAMILY: { id: 'family', name: 'Family Jealousy', threshold: 0.7 }
    };

    var JEALOUSY_TRIGGERS = {
        SPOUSE_AFFAIR: { id: 'spouse_affair', name: 'Spouse Having Affair', baseJealousy: 0.9 },
        CRUSH_WITH_OTHER: { id: 'crush_with_other', name: 'Partner with Someone Else', baseJealousy: 0.8 },
        RIVAL_ADVANCEMENT: { id: 'rival_advancement', name: 'Rival Advanced in Rank', baseJealousy: 0.6 },
        FAMILY_PREFERENCE: { id: 'family_preference', name: 'Family Shows Preference', baseJealousy: 0.5 },
        SOCIAL_SLIGHT: { id: 'social_slight', name: 'Social Slight or Insult', baseJealousy: 0.4 },
        POLYAMOROUS_ARRANGEMENT: { id: 'polyamorous', name: 'Polyamorous Relationship', baseJealousy: 0.2 },
        ONE_NIGHT_STAND: { id: 'one_night', name: 'One Night Stand', baseJealousy: 0.2 }
    };

    var JEALOUSY_CONSEQUENCES = {
        CONFRONTATION: { id: 'confrontation', name: 'Confrontation', severity: 3, minLevel: 0.4 },
        FIGHT: { id: 'fight', name: 'Physical Fight', severity: 5, minLevel: 0.6 },
        RUMORS: { id: 'rumors', name: 'Spread Rumors', severity: 2, minLevel: 0.3 },
        SABOTAGE: { id: 'sabotage', name: 'Sabotage', severity: 4, minLevel: 0.65 },
        MURDER: { id: 'murder', name: 'Murder Attempt', severity: 10, minLevel: 0.85 },
        SELF_DESTRUCT: { id: 'self_destruct', name: 'Self-Destructive Behavior', severity: 4, minLevel: 0.7 }
    };

    var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES || {};
    var ATTRIBUTES = window.RELATIONSHIP_ATTRIBUTES || {};
    var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing' };

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _chance(probability) {
        if (typeof window.chance === 'function') {
            return window.chance(probability);
        }
        return Math.random() < probability;
    }

    function _pickRandom(arr) {
        if (typeof window.pickRandom === 'function') {
            return window.pickRandom(arr);
        }
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function _randomInt(min, max) {
        if (typeof window.randomInt === 'function') {
            return window.randomInt(min, max);
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function _getRelationshipBetween(idA, idB) {
        if (typeof window.getRelationshipBetween === 'function') {
            return window.getRelationshipBetween(idA, idB);
        }
        return null;
    }

    function _getRelationshipsForCharacter(id, options) {
        if (typeof window.getRelationshipsForCharacter === 'function') {
            return window.getRelationshipsForCharacter(id, options);
        }
        return [];
    }

    function _updateRelationship(relId, updates) {
        if (typeof window.updateRelationship === 'function') {
            return window.updateRelationship(relId, updates);
        }
        return null;
    }

    function _endRelationship(relId, endYear, reason) {
        if (typeof window.endRelationship === 'function') {
            return window.endRelationship(relId, endYear, reason);
        }
        return false;
    }

    function _getFriendshipStrength(idA, idB) {
        if (typeof window.getFriendshipStrength === 'function') {
            return window.getFriendshipStrength(idA, idB);
        }
        return 0;
    }

    function _getConsanguinityDegree(idA, idB) {
        if (typeof window.getConsanguinityDegree === 'function') {
            return window.getConsanguinityDegree(idA, idB);
        }
        return null;
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    // =========================================================================
    // 3. GET CHARACTER RANK PRIORITY
    // =========================================================================

    function _getCharacterRankPriority(character) {
        if (!character || !character.activeRankId) return 5;
        if (typeof window.getRankById === 'function') {
            var rank = window.getRankById(character.activeRankId);
            if (rank && rank.priority !== undefined) return rank.priority;
        }
        return 5;
    }

    function _getCharacterCombatStrength(character) {
        if (typeof window.getCharacterCombatStrength === 'function') {
            return window.getCharacterCombatStrength(character);
        }
        var strength = 50;
        var rankPriority = _getCharacterRankPriority(character);
        strength += (6 - rankPriority) * 5;
        if (character.traits) {
            if (character.traits.indexOf('martial') !== -1) strength += 15;
            if (character.traits.indexOf('warrior') !== -1) strength += 20;
            if (character.traits.indexOf('weak') !== -1) strength -= 15;
        }
        return Math.min(100, Math.max(0, strength));
    }

    // =========================================================================
    // 4. JEALOUSY CALCULATION
    // =========================================================================

    function calculateJealousy(jalouxId, targetId, aboutId) {
        aboutId = aboutId || null;
        var jaloux = _getCharacterById(jalouxId);
        var target = _getCharacterById(targetId);

        if (!jaloux || !target) {
            return { level: 0, triggers: [], type: null };
        }

        var level = 0;
        var triggers = [];
        var jealousyType = null;

        // Romantic jealousy
        if (aboutId) {
            var about = _getCharacterById(aboutId);
            if (about) {
                var jalouxWithAbout = _getRelationshipBetween(jalouxId, aboutId);
                var isJalouxRomantic = jalouxWithAbout &&
                    (jalouxWithAbout.type === ARCHETYPES.COMMITTED ||
                     jalouxWithAbout.type === ARCHETYPES.CASUAL_DATING);

                var targetWithAbout = _getRelationshipBetween(targetId, aboutId);
                var isTargetInvolved = targetWithAbout &&
                    targetWithAbout.status === STATUS.ONGOING;

                if (isJalouxRomantic && isTargetInvolved) {
                    var isPolyRel = false;
                    var attrs = targetWithAbout.metadata?.attributes || [];
                    if (attrs.indexOf(ATTRIBUTES.POLYAMOROUS) !== -1) {
                        isPolyRel = true;
                    }

                    if (targetWithAbout.type === ARCHETYPES.ONE_NIGHT_STAND) {
                        level += JEALOUSY_TRIGGERS.ONE_NIGHT_STAND.baseJealousy;
                        triggers.push(JEALOUSY_TRIGGERS.ONE_NIGHT_STAND);
                    } else if (attrs.indexOf(ATTRIBUTES.SECRET) !== -1) {
                        level += isPolyRel ? 0.3 : JEALOUSY_TRIGGERS.SPOUSE_AFFAIR.baseJealousy;
                        triggers.push(isPolyRel ?
                            JEALOUSY_TRIGGERS.POLYAMOROUS_ARRANGEMENT :
                            JEALOUSY_TRIGGERS.SPOUSE_AFFAIR);
                    } else if (targetWithAbout.type === ARCHETYPES.COMMITTED) {
                        level += isPolyRel ? 0.15 : 0.5;
                        triggers.push(JEALOUSY_TRIGGERS.CRUSH_WITH_OTHER);
                    } else if (targetWithAbout.type === ARCHETYPES.CASUAL_DATING) {
                        level += 0.3;
                        triggers.push({ id: 'casual_dating', name: 'Casual Dating', baseJealousy: 0.3 });
                    }
                    jealousyType = JEALOUSY_TYPES.ROMANTIC;
                }
            }
        }

        // Professional jealousy
        var rankJaloux = _getCharacterRankPriority(jaloux);
        var rankTarget = _getCharacterRankPriority(target);
        if (rankTarget < rankJaloux) {
            var jealousyFromRank = Math.min(0.5, (rankJaloux - rankTarget) * 0.1);
            level += jealousyFromRank;
            triggers.push(JEALOUSY_TRIGGERS.RIVAL_ADVANCEMENT);
            if (!jealousyType) jealousyType = JEALOUSY_TYPES.PROFESSIONAL;
        }

        // Existing rivalry
        var rivalry = _getRelationshipBetween(jalouxId, targetId);
        if (rivalry && rivalry.type === ARCHETYPES.RIVALRY) {
            level += 0.3;
            triggers.push({ id: 'existing_rivalry', name: 'Existing Rivalry', baseJealousy: 0.3 });
        }

        // Personality modifiers
        if (jaloux.traits) {
            if (jaloux.traits.indexOf('jealous') !== -1) level *= 1.3;
            if (jaloux.traits.indexOf('secure') !== -1) level *= 0.7;
            if (jaloux.traits.indexOf('possessive') !== -1) level *= 1.2;
        }

        level = Math.min(1.0, level);

        return {
            level: level,
            triggers: triggers,
            type: jealousyType || (level > 0.3 ? JEALOUSY_TYPES.SOCIAL : null)
        };
    }

    // =========================================================================
    // 5. JEALOUSY TARGETS
    // =========================================================================

    function findAllJealousyTargets(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return [];

        var allChars = _getCharacters();
        var results = [];

        var relationships = _getRelationshipsForCharacter(characterId, { activeOnly: true });
        var caredAboutIds = [];

        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (rel.type === ARCHETYPES.COMMITTED ||
                rel.type === ARCHETYPES.CASUAL_DATING) {
                var otherId = rel.participantA === characterId ? rel.participantB : rel.participantA;
                caredAboutIds.push(otherId);
            }
        }

        for (var i = 0; i < allChars.length; i++) {
            var target = allChars[i];
            if (target.id === characterId) continue;

            for (var j = 0; j < caredAboutIds.length; j++) {
                var jealousy = calculateJealousy(characterId, target.id, caredAboutIds[j]);
                if (jealousy.level >= 0.3) {
                    results.push({
                        target: target,
                        about: _getCharacterById(caredAboutIds[j]),
                        jealousyLevel: jealousy.level,
                        triggers: jealousy.triggers,
                        type: jealousy.type
                    });
                    break;
                }
            }
        }

        results.sort(function(a, b) {
            return b.jealousyLevel - a.jealousyLevel;
        });

        return results;
    }

    function getPrimaryJealousyTarget(characterId) {
        var targets = findAllJealousyTargets(characterId);
        return targets.length > 0 ? targets[0] : null;
    }

    // =========================================================================
    // 6. CONFLICT MANAGEMENT
    // =========================================================================

    function triggerConfrontation(jalouxId, targetId, options) {
        options = options || {};
        var jaloux = _getCharacterById(jalouxId);
        var target = _getCharacterById(targetId);

        if (!jaloux || !target) {
            return { success: false, reason: 'Character not found' };
        }

        var jealousy = calculateJealousy(jalouxId, targetId, options.aboutId);

        var consequence = null;
        var adjustedLevel = jealousy.level;

        if (jaloux.traits) {
            if (jaloux.traits.indexOf('violent') !== -1) adjustedLevel += 0.1;
            if (jaloux.traits.indexOf('cowardly') !== -1) adjustedLevel -= 0.2;
            if (jaloux.traits.indexOf('hot_headed') !== -1) adjustedLevel += 0.15;
            if (jaloux.traits.indexOf('calculating') !== -1) adjustedLevel -= 0.1;
        }

        adjustedLevel = Math.min(1.0, Math.max(0, adjustedLevel));

        var consequences = Object.values(JEALOUSY_CONSEQUENCES).sort(function(a, b) {
            return b.minLevel - a.minLevel;
        });

        for (var i = 0; i < consequences.length; i++) {
            if (adjustedLevel >= consequences[i].minLevel) {
                consequence = consequences[i];
                break;
            }
        }

        if (!consequence) {
            return { success: false, reason: 'Jealousy level too low' };
        }

        var result = {
            success: true,
            jaloux: jaloux,
            target: target,
            about: options.aboutId ? _getCharacterById(options.aboutId) : null,
            jealousyLevel: jealousy.level,
            consequence: consequence,
            triggers: jealousy.triggers,
            year: _getCurrentYear()
        };

        if (!jaloux.jealousyHistory) jaloux.jealousyHistory = [];
        jaloux.jealousyHistory.push({
            year: _getCurrentYear(),
            targetId: targetId,
            aboutId: options.aboutId || null,
            jealousyLevel: jealousy.level,
            consequence: consequence.id
        });

        if (consequence.id === 'fight' || consequence.id === 'murder') {
            var existingRivalry = _getRelationshipBetween(jalouxId, targetId);
            if (!existingRivalry || existingRivalry.type !== ARCHETYPES.RIVALRY) {
                if (typeof window.createRelationship === 'function') {
                    window.createRelationship(jalouxId, targetId, {
                        type: ARCHETYPES.RIVALRY,
                        status: STATUS.ONGOING,
                        startYear: _getCurrentYear(),
                        metadata: {
                            cause: consequence.name,
                            intensity: 0.5
                        }
                    });
                }
            }
        }

        _logEvent('jealousy', 'Confrontation',
            jaloux.name + ' confronted ' + target.name + ' over ' +
            (jealousy.triggers[0]?.name || 'jealousy') + ' (' + consequence.name + ')',
            [jaloux, target]);

        _saveMasterData();

        return result;
    }

    function processAnnualJealousy() {
        var allChars = _getCharacters();
        var confrontations = [];

        for (var i = 0; i < allChars.length; i++) {
            var char = allChars[i];
            if (char.isDeceased) continue;

            var primaryTarget = getPrimaryJealousyTarget(char.id);
            if (primaryTarget && primaryTarget.jealousyLevel >= 0.6) {
                var triggerChance = primaryTarget.jealousyLevel * 0.3;
                if (char.traits && char.traits.indexOf('hot_headed') !== -1) triggerChance += 0.2;
                if (char.traits && char.traits.indexOf('patient') !== -1) triggerChance -= 0.15;

                if (_chance(triggerChance)) {
                    var result = triggerConfrontation(char.id, primaryTarget.target.id, {
                        aboutId: primaryTarget.about?.id
                    });
                    if (result.success) confrontations.push(result);
                }
            }
        }

        if (confrontations.length > 0) {
            _logEvent('jealousy', 'Annual Processing',
                confrontations.length + ' jealousy-related confrontations occurred',
                []);
        }

        return confrontations;
    }

    // =========================================================================
    // 7. QUERIES
    // =========================================================================

    function getJealousyHistory(characterId) {
        var character = _getCharacterById(characterId);
        return character?.jealousyHistory || [];
    }

    function getCharacterConflictHistory(characterId) {
        var history = [];
        var allChars = _getCharacters();

        for (var i = 0; i < allChars.length; i++) {
            var other = allChars[i];
            if (other.id === characterId) continue;

            var rivalry = _getRelationshipBetween(characterId, other.id);
            if (rivalry && rivalry.type === ARCHETYPES.RIVALRY) {
                history.push({
                    target: other,
                    rivalry: rivalry,
                    intensity: rivalry.metadata?.intensity || 0.5,
                    cause: rivalry.metadata?.cause || 'Unknown',
                    startYear: rivalry.startYear
                });
            }
        }

        history.sort(function(a, b) {
            return b.intensity - a.intensity;
        });

        return history;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.JEALOUSY_TYPES = JEALOUSY_TYPES;
    window.JEALOUSY_TRIGGERS = JEALOUSY_TRIGGERS;
    window.JEALOUSY_CONSEQUENCES = JEALOUSY_CONSEQUENCES;

    window.calculateJealousy = calculateJealousy;
    window.findAllJealousyTargets = findAllJealousyTargets;
    window.getPrimaryJealousyTarget = getPrimaryJealousyTarget;
    window.triggerConfrontation = triggerConfrontation;
    window.processAnnualJealousy = processAnnualJealousy;
    window.getJealousyHistory = getJealousyHistory;
    window.getCharacterConflictHistory = getCharacterConflictHistory;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            JEALOUSY_TYPES: JEALOUSY_TYPES,
            JEALOUSY_TRIGGERS: JEALOUSY_TRIGGERS,
            JEALOUSY_CONSEQUENCES: JEALOUSY_CONSEQUENCES,
            calculateJealousy: calculateJealousy,
            findAllJealousyTargets: findAllJealousyTargets,
            getPrimaryJealousyTarget: getPrimaryJealousyTarget,
            triggerConfrontation: triggerConfrontation,
            processAnnualJealousy: processAnnualJealousy,
            getJealousyHistory: getJealousyHistory,
            getCharacterConflictHistory: getCharacterConflictHistory
        };
    }

})();
