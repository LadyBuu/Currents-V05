/**
 * government-rules.js
 * Pure policy + validation. Facts-only inputs. No State reads, no side effects.
 */
(function() {
    'use strict';

    // ---- Defaults (single source of truth) -----------------------------------

    var DEFAULT_POSITION_PRIORITY = 10;
    var DEFAULT_MIN_SKILL_LEVEL = 0;
    var DEFAULT_SKILL_LEVEL = 10;
    var MIN_CHARACTER_AGE = 18;

    var SALARY_TIERS = [
        { maxPriority: 3,  name: 'Minister', base: 100, multiplier: 1.5 },
        { maxPriority: 5,  name: 'Director', base: 60,  multiplier: 1.2 },
        { maxPriority: 8,  name: 'Officer',  base: 35,  multiplier: 1.0 },
        { maxPriority: 12, name: 'Clerk',    base: 20,  multiplier: 0.8 },
        { maxPriority: Infinity, name: 'Staff', base: 12, multiplier: 0.6 }
    ];

    // ---- Fact extraction helpers (pure) --------------------------------------

    function _normStr(s) {
        return typeof s === 'string' ? s.trim() : '';
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    // ---- Department validation ----------------------------------------------

    function validateDepartment(data, isUpdate, departmentId) {
        isUpdate = !!isUpdate;
        if (!data) return { valid: false, reason: 'No data provided' };

        if (!isUpdate) {
            var name = _normStr(data.name);
            if (!name) return { valid: false, reason: 'Department name is required' };
            if (name.length < 2) return { valid: false, reason: 'Department name must be at least 2 characters' };
            if (!data.locationId) return { valid: false, reason: 'Location is required' };
        } else if (data.name !== undefined) {
            var uname = _normStr(data.name);
            if (!uname) return { valid: false, reason: 'Department name cannot be empty' };
            if (uname.length < 2) return { valid: false, reason: 'Department name must be at least 2 characters' };
        }

        if (isUpdate && data.parentDepartmentId !== undefined && data.parentDepartmentId) {
            if (departmentId && data.parentDepartmentId === departmentId) {
                return { valid: false, reason: 'Department cannot be its own parent' };
            }
        }

        return { valid: true };
    }

    // ---- Position validation -------------------------------------------------

    function validatePosition(data, isUpdate) {
        isUpdate = !!isUpdate;
        if (!data) return { valid: false, reason: 'No data provided' };

        if (!isUpdate) {
            var name = _normStr(data.name);
            if (!name) return { valid: false, reason: 'Position name is required' };
            if (name.length < 2) return { valid: false, reason: 'Position name must be at least 2 characters' };
        } else if (data.name !== undefined) {
            var uname = _normStr(data.name);
            if (!uname) return { valid: false, reason: 'Position name cannot be empty' };
            if (uname.length < 2) return { valid: false, reason: 'Position name must be at least 2 characters' };
        }

        if (data.priority !== undefined && data.priority !== null) {
            if (typeof data.priority !== 'number' || data.priority < 1 || data.priority > 100) {
                return { valid: false, reason: 'Priority must be between 1 and 100' };
            }
        }
        if (data.minSkillLevel !== undefined && data.minSkillLevel !== null) {
            if (typeof data.minSkillLevel !== 'number' || data.minSkillLevel < 0 || data.minSkillLevel > 100) {
                return { valid: false, reason: 'Minimum skill level must be between 0 and 100' };
            }
        }
        if (data.minExperience !== undefined && data.minExperience !== null) {
            if (typeof data.minExperience !== 'number' || data.minExperience < 0) {
                return { valid: false, reason: 'Minimum experience cannot be negative' };
            }
        }
        if (data.genderRestriction !== undefined && data.genderRestriction !== null) {
            var allowed = ['either', 'male', 'female'];
            if (allowed.indexOf(data.genderRestriction) === -1) {
                return { valid: false, reason: 'Invalid gender restriction' };
            }
        }

        return { valid: true };
    }

    // ---- Position hierarchy validation (cycle detection) ---------------------

    function validatePositionHierarchy(departmentId, positionId, newParentId, getPositionRecord) {
        if (!newParentId) return { valid: true };
        if (newParentId === positionId) {
            return { valid: false, reason: 'Position cannot be its own parent' };
        }
        if (typeof getPositionRecord !== 'function') {
            return { valid: false, reason: 'getPositionRecord is required for hierarchy validation' };
        }
        var visited = {};
        var current = newParentId;
        while (current) {
            if (visited[current]) return { valid: false, reason: 'Hierarchy cycle detected' };
            if (current === positionId) return { valid: false, reason: 'Cycle detected: parent is a descendant' };
            visited[current] = true;
            var rec = getPositionRecord(departmentId, current);
            if (!rec) break;
            current = rec.parentPositionId;
        }
        return { valid: true };
    }

    // ---- Government type validation ------------------------------------------

    function validateGovernmentType(data, isUpdate) {
        isUpdate = !!isUpdate;
        if (!data) return { valid: false, reason: 'No data provided' };

        if (!isUpdate) {
            var name = _normStr(data.name);
            if (!name) return { valid: false, reason: 'Government type name is required' };
            if (name.length < 2) return { valid: false, reason: 'Government type name must be at least 2 characters' };
        } else if (data.name !== undefined) {
            var uname = _normStr(data.name);
            if (!uname) return { valid: false, reason: 'Government type name cannot be empty' };
            if (uname.length < 2) return { valid: false, reason: 'Government type name must be at least 2 characters' };
        }

        if (data.allowedRankIds !== undefined && data.allowedRankIds !== null) {
            if (!Array.isArray(data.allowedRankIds)) {
                return { valid: false, reason: 'Allowed ranks must be an array' };
            }
        }

        return { valid: true };
    }

    // ---- Leader assignment validation (fact-based) ---------------------------

    function validateLeaderAssignment(facts) {
        if (!facts) return { valid: false, reason: 'No data provided' };
        if (!facts.place) return { valid: false, reason: 'Place not found' };
        if (!facts.character) return { valid: false, reason: 'Character not found' };
        if (facts.character.isDeceased) return { valid: false, reason: 'Character is deceased' };
        if (typeof facts.startYear !== 'number') {
            return { valid: false, reason: 'Valid start year is required' };
        }
        if (facts.startYear > facts.currentYear + 10) {
            return { valid: false, reason: 'Start year cannot be more than 10 years in the future' };
        }
        if (facts.character.birthYear != null && facts.startYear < facts.character.birthYear) {
            return { valid: false, reason: 'Start year cannot be before character birth' };
        }
        return { valid: true };
    }

    // ---- Salary validation ---------------------------------------------------

    function validateSalaryUpdate(positionId, newSalary) {
        if (typeof newSalary !== 'number' || !isFinite(newSalary)) {
            return { valid: false, reason: 'Salary must be a finite number' };
        }
        if (newSalary < 0) {
            return { valid: false, reason: 'Salary cannot be negative' };
        }
        if (newSalary > 1000000) {
            return { valid: false, reason: 'Salary exceeds reasonable maximum' };
        }
        return { valid: true };
    }

    // ---- Eligibility (fact-based, pure) --------------------------------------
    // characterFacts: { age, isDeceased, roleIds, skillLevels, gender, activeRankId, experienceYears }
    // positionFacts:  { requiredRoleId, minSkillLevel, genderRestriction, requiredRankId, minExperience }

    function checkPositionEligibility(characterFacts, positionFacts) {
        if (!characterFacts) return { eligible: false, reason: 'Character facts missing', code: 'NO_FACTS' };
        if (!positionFacts) return { eligible: false, reason: 'Position facts missing', code: 'NO_FACTS' };

        if (characterFacts.isDeceased) {
            return { eligible: false, reason: 'Character is deceased', code: 'DECEASED' };
        }
        if (characterFacts.age != null && characterFacts.age < MIN_CHARACTER_AGE) {
            return { eligible: false, reason: 'Character is under ' + MIN_CHARACTER_AGE, code: 'TOO_YOUNG' };
        }
        if (positionFacts.requiredRankId &&
            characterFacts.activeRankId !== positionFacts.requiredRankId) {
            return { eligible: false, reason: 'Character does not hold the required rank', code: 'RANK' };
        }
        if (positionFacts.genderRestriction &&
            positionFacts.genderRestriction !== 'either' &&
            characterFacts.gender !== positionFacts.genderRestriction) {
            return { eligible: false, reason: 'Character gender does not meet position requirement', code: 'GENDER' };
        }
        if (positionFacts.requiredRoleId) {
            var hasRole = characterFacts.roleIds &&
                characterFacts.roleIds.indexOf(positionFacts.requiredRoleId) !== -1;
            if (!hasRole) {
                return { eligible: false, reason: 'Character does not have the required role', code: 'ROLE' };
            }
            var skill = characterFacts.skillLevels && characterFacts.skillLevels[positionFacts.requiredRoleId];
            if (positionFacts.minSkillLevel != null && (skill == null || skill < positionFacts.minSkillLevel)) {
                return {
                    eligible: false,
                    reason: 'Character skill level (' + (skill == null ? 'none' : skill) +
                        ') is below requirement (' + positionFacts.minSkillLevel + ')',
                    code: 'SKILL'
                };
            }
        }
        if (positionFacts.minExperience != null && positionFacts.minExperience > 0) {
            var exp = characterFacts.experienceYears || 0;
            if (exp < positionFacts.minExperience) {
                return {
                    eligible: false,
                    reason: 'Character experience (' + exp + ') is below requirement (' + positionFacts.minExperience + ')',
                    code: 'EXPERIENCE'
                };
            }
        }
        return { eligible: true, reason: null, code: null };
    }

    // ---- Assignment planning (pure) ------------------------------------------
    // Returns { valid, reason?, code?, roleToAdd?, skillLevel?, startYear }

    function planAssignment(input) {
        if (!input || !input.position || !input.character) {
            return { valid: false, reason: 'Missing position or character facts', code: 'NO_FACTS' };
        }
        var positionFacts = input.position;
        var characterFacts = input.character;
        var options = input.options || {};

        var startYear = options.startYear != null ? options.startYear : null;
        if (startYear == null) {
            return { valid: false, reason: 'Start year is required', code: 'NO_START_YEAR' };
        }

        var roleToAdd = null;
        var skillLevel = null;

        if (positionFacts.requiredRoleId) {
            var hasRole = characterFacts.roleIds &&
                characterFacts.roleIds.indexOf(positionFacts.requiredRoleId) !== -1;
            if (!hasRole) {
                if (options.addRoleIfMissing === false) {
                    return { valid: false, reason: 'Character does not have the required role', code: 'ROLE' };
                }
                roleToAdd = {
                    roleId: positionFacts.requiredRoleId,
                    skillLevel: options.defaultSkillLevel != null
                        ? options.defaultSkillLevel
                        : DEFAULT_SKILL_LEVEL
                };
                skillLevel = roleToAdd.skillLevel;
            } else {
                skillLevel = characterFacts.skillLevels
                    ? characterFacts.skillLevels[positionFacts.requiredRoleId]
                    : null;
            }
        }

        // Build a modified fact set reflecting what the character will look like
        // after any role is added, then run eligibility against it.
        var factsAfter = {
            isDeceased: characterFacts.isDeceased,
            age: characterFacts.age,
            gender: characterFacts.gender,
            activeRankId: characterFacts.activeRankId,
            experienceYears: characterFacts.experienceYears,
            roleIds: characterFacts.roleIds ? characterFacts.roleIds.slice() : [],
            skillLevels: characterFacts.skillLevels ? Object.assign({}, characterFacts.skillLevels) : {}
        };
        if (roleToAdd) {
            factsAfter.roleIds.push(roleToAdd.roleId);
            factsAfter.skillLevels[roleToAdd.roleId] = roleToAdd.skillLevel;
        }

        var elig = checkPositionEligibility(factsAfter, positionFacts);
        if (!elig.eligible) return { valid: false, reason: elig.reason, code: elig.code };

        return {
            valid: true,
            roleToAdd: roleToAdd,
            skillLevel: skillLevel != null ? skillLevel : (options.defaultSkillLevel != null ? options.defaultSkillLevel : null),
            startYear: startYear
        };
    }

    // ---- Candidate scoring (pure, deterministic) -----------------------------
    // candidateFacts: { age, experienceYears, rankPriority }
    // Ties are broken by experience desc, then age desc, then characterId asc.

    function scoreCandidate(candidateFacts) {
        var score = 0;

        if (candidateFacts.rankPriority != null) {
            score += (6 - candidateFacts.rankPriority) * 10;
        }
        var exp = candidateFacts.experienceYears || 0;
        score += Math.min(exp, 20) * 2;

        var age = candidateFacts.age;
        if (age != null) {
            if (age >= 30 && age <= 50) score += 20;
            else if (age >= 25 && age <= 55) score += 10;
        }

        // Clamp to [0, 100]
        if (score < 0) score = 0;
        if (score > 100) score = 100;

        return score;
    }

    function isCandidateReady(candidateFacts) {
        var age = candidateFacts.age;
        var exp = candidateFacts.experienceYears || 0;
        return age != null && age >= 25 && exp >= 5;
    }

    function compareCandidates(a, b) {
        // Higher score first
        if (b.score !== a.score) return b.score - a.score;
        // Higher experience first
        var ea = a.experienceYears || 0;
        var eb = b.experienceYears || 0;
        if (eb !== ea) return eb - ea;
        // Higher age first
        var aa = a.age != null ? a.age : 0;
        var ab = b.age != null ? b.age : 0;
        if (ab !== aa) return ab - aa;
        // Stable tiebreak
        return String(a.characterId).localeCompare(String(b.characterId));
    }

    // ---- Salary tier (pure) --------------------------------------------------

    function getSalaryTier(priority) {
        var p = priority != null ? priority : DEFAULT_POSITION_PRIORITY;
        for (var i = 0; i < SALARY_TIERS.length; i++) {
            if (p <= SALARY_TIERS[i].maxPriority) return SALARY_TIERS[i];
        }
        return SALARY_TIERS[SALARY_TIERS.length - 1];
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentRules = {
        // Defaults
        DEFAULT_POSITION_PRIORITY: DEFAULT_POSITION_PRIORITY,
        DEFAULT_MIN_SKILL_LEVEL: DEFAULT_MIN_SKILL_LEVEL,
        DEFAULT_SKILL_LEVEL: DEFAULT_SKILL_LEVEL,
        MIN_CHARACTER_AGE: MIN_CHARACTER_AGE,
        SALARY_TIERS: SALARY_TIERS,

        // Validation
        validateDepartment: validateDepartment,
        validatePosition: validatePosition,
        validatePositionHierarchy: validatePositionHierarchy,
        validateGovernmentType: validateGovernmentType,
        validateLeaderAssignment: validateLeaderAssignment,
        validateSalaryUpdate: validateSalaryUpdate,

        // Eligibility / planning
        checkPositionEligibility: checkPositionEligibility,
        planAssignment: planAssignment,

        // Candidate scoring
        scoreCandidate: scoreCandidate,
        isCandidateReady: isCandidateReady,
        compareCandidates: compareCandidates,

        // Salary
        getSalaryTier: getSalaryTier
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentRules;
    }
})();
