/**
 * government-rules.js
 * Pure policy. Facts-only inputs. No State reads, no side effects, no I/O.
 *
 * All thresholds, tiers, and enumerations come from GovernmentConstants.
 * No inline numbers. No inline enums. No randomness.
 *
 * Validators return { valid: boolean, reason: string|null }.
 * Eligibility returns { eligible: boolean, reason: string|null, code: string|null }.
 * Planning returns { valid, reason?, code?, roleToAdd?, skillLevel?, startYear? }.
 */
(function() {
    'use strict';

    var C = window.GovernmentConstants;

    if (!C) throw new Error('government-rules.js requires GovernmentConstants');

    // ---- Local helpers (pure) ------------------------------------------------

    function _normStr(s) {
        return typeof s === 'string' ? s.trim() : '';
    }

    function _fail(reason) { return { valid: false, reason: reason }; }
    function _ok() { return { valid: true, reason: null }; }

    function _eligFail(reason, code) {
        return { eligible: false, reason: reason, code: code || null };
    }
    function _eligOk() {
        return { eligible: true, reason: null, code: null };
    }

    // ---- Department validation ----------------------------------------------

    function validateDepartment(data, isUpdate, departmentId) {
        isUpdate = !!isUpdate;
        if (!data) return _fail('No data provided');

        if (!isUpdate) {
            var name = _normStr(data.name);
            if (!name) return _fail('Department name is required');
            if (name.length < C.MIN_DEPARTMENT_NAME_LENGTH) {
                return _fail('Department name must be at least ' + C.MIN_DEPARTMENT_NAME_LENGTH + ' characters');
            }
            if (!data.locationId) return _fail('Location is required');
        } else if (data.name !== undefined) {
            var uname = _normStr(data.name);
            if (!uname) return _fail('Department name cannot be empty');
            if (uname.length < C.MIN_DEPARTMENT_NAME_LENGTH) {
                return _fail('Department name must be at least ' + C.MIN_DEPARTMENT_NAME_LENGTH + ' characters');
            }
        }

        if (isUpdate && data.parentDepartmentId !== undefined && data.parentDepartmentId) {
            if (departmentId && data.parentDepartmentId === departmentId) {
                return _fail('Department cannot be its own parent');
            }
        }

        return _ok();
    }

    // ---- Position validation -------------------------------------------------

    function validatePosition(data, isUpdate) {
        isUpdate = !!isUpdate;
        if (!data) return _fail('No data provided');

        if (!isUpdate) {
            var name = _normStr(data.name);
            if (!name) return _fail('Position name is required');
            if (name.length < C.MIN_POSITION_NAME_LENGTH) {
                return _fail('Position name must be at least ' + C.MIN_POSITION_NAME_LENGTH + ' characters');
            }
        } else if (data.name !== undefined) {
            var uname = _normStr(data.name);
            if (!uname) return _fail('Position name cannot be empty');
            if (uname.length < C.MIN_POSITION_NAME_LENGTH) {
                return _fail('Position name must be at least ' + C.MIN_POSITION_NAME_LENGTH + ' characters');
            }
        }

        if (data.priority !== undefined && data.priority !== null) {
            if (typeof data.priority !== 'number' ||
                data.priority < C.MIN_POSITION_PRIORITY ||
                data.priority > C.MAX_POSITION_PRIORITY) {
                return _fail('Priority must be between ' +
                    C.MIN_POSITION_PRIORITY + ' and ' + C.MAX_POSITION_PRIORITY);
            }
        }
        if (data.minSkillLevel !== undefined && data.minSkillLevel !== null) {
            if (typeof data.minSkillLevel !== 'number' ||
                data.minSkillLevel < C.MIN_SKILL_LEVEL ||
                data.minSkillLevel > C.MAX_SKILL_LEVEL) {
                return _fail('Minimum skill level must be between ' +
                    C.MIN_SKILL_LEVEL + ' and ' + C.MAX_SKILL_LEVEL);
            }
        }
        if (data.minExperience !== undefined && data.minExperience !== null) {
            if (typeof data.minExperience !== 'number' || data.minExperience < 0) {
                return _fail('Minimum experience cannot be negative');
            }
        }
        if (data.genderRestriction !== undefined && data.genderRestriction !== null) {
            if (C.GENDER_RESTRICTIONS.indexOf(data.genderRestriction) === -1) {
                return _fail('Invalid gender restriction');
            }
        }

        return _ok();
    }

    // ---- Position hierarchy validation (cycle detection) ---------------------
    // getPositionRecord is injected. Rules stays pure; the caller supplies the
    // lookup. Must return a canonical or cloned record with id + parentPositionId.

    function validatePositionHierarchy(departmentId, positionId, newParentId, getPositionRecord) {
        if (!newParentId) return _ok();
        if (newParentId === positionId) {
            return _fail('Position cannot be its own parent');
        }
        if (typeof getPositionRecord !== 'function') {
            return _fail('getPositionRecord is required for hierarchy validation');
        }
        var visited = {};
        var current = newParentId;
        while (current) {
            if (visited[current]) return _fail('Hierarchy cycle detected');
            if (current === positionId) return _fail('Cycle detected: parent is a descendant');
            visited[current] = true;
            var rec = getPositionRecord(departmentId, current);
            if (!rec) break;
            current = rec.parentPositionId;
        }
        return _ok();
    }

    // ---- Government type validation ------------------------------------------

    function validateGovernmentType(data, isUpdate) {
        isUpdate = !!isUpdate;
        if (!data) return _fail('No data provided');

        if (!isUpdate) {
            var name = _normStr(data.name);
            if (!name) return _fail('Government type name is required');
            if (name.length < C.MIN_GOVERNMENT_TYPE_NAME_LENGTH) {
                return _fail('Government type name must be at least ' +
                    C.MIN_GOVERNMENT_TYPE_NAME_LENGTH + ' characters');
            }
        } else if (data.name !== undefined) {
            var uname = _normStr(data.name);
            if (!uname) return _fail('Government type name cannot be empty');
            if (uname.length < C.MIN_GOVERNMENT_TYPE_NAME_LENGTH) {
                return _fail('Government type name must be at least ' +
                    C.MIN_GOVERNMENT_TYPE_NAME_LENGTH + ' characters');
            }
        }

        if (data.allowedRankIds !== undefined && data.allowedRankIds !== null) {
            if (!Array.isArray(data.allowedRankIds)) {
                return _fail('Allowed ranks must be an array');
            }
        }

        return _ok();
    }

    // ---- Leader assignment validation (fact-based) ---------------------------

    function validateLeaderAssignment(facts) {
        if (!facts) return _fail('No data provided');
        if (!facts.place) return _fail('Place not found');
        if (!facts.character) return _fail('Character not found');
        if (facts.character.isDeceased) return _fail('Character is deceased');
        if (typeof facts.startYear !== 'number') {
            return _fail('Valid start year is required');
        }
        if (typeof facts.currentYear === 'number' &&
            facts.startYear > facts.currentYear + C.MAX_LEADER_START_YEAR_FUTURE_OFFSET) {
            return _fail('Start year cannot be more than ' +
                C.MAX_LEADER_START_YEAR_FUTURE_OFFSET + ' years in the future');
        }
        if (facts.character.birthYear != null && facts.startYear < facts.character.birthYear) {
            return _fail('Start year cannot be before character birth');
        }
        return _ok();
    }

    // ---- Salary validation ---------------------------------------------------

    function validateSalaryUpdate(positionId, newSalary) {
        if (typeof newSalary !== 'number' || !isFinite(newSalary)) {
            return _fail('Salary must be a finite number');
        }
        if (newSalary < C.MIN_SALARY) {
            return _fail('Salary cannot be negative');
        }
        if (newSalary > C.MAX_SALARY) {
            return _fail('Salary exceeds reasonable maximum');
        }
        return _ok();
    }

    // ---- Eligibility (fact-based, pure) --------------------------------------
    // characterFacts: { age, isDeceased, roleIds, skillLevels, gender, activeRankId, experienceYears }
    // positionFacts:  { requiredRoleId, minSkillLevel, genderRestriction, requiredRankId, minExperience }

    function checkPositionEligibility(characterFacts, positionFacts) {
        if (!characterFacts) return _eligFail('Character facts missing', C.CODES.NO_FACTS);
        if (!positionFacts) return _eligFail('Position facts missing', C.CODES.NO_FACTS);

        if (characterFacts.isDeceased) {
            return _eligFail('Character is deceased', C.CODES.DECEASED);
        }
        if (characterFacts.age != null && characterFacts.age < C.MIN_CHARACTER_AGE) {
            return _eligFail('Character is under ' + C.MIN_CHARACTER_AGE, C.CODES.TOO_YOUNG);
        }
        if (positionFacts.requiredRankId &&
            characterFacts.activeRankId !== positionFacts.requiredRankId) {
            return _eligFail('Character does not hold the required rank', C.CODES.RANK);
        }
        if (positionFacts.genderRestriction &&
            positionFacts.genderRestriction !== C.GENDER_EITHER &&
            characterFacts.gender !== positionFacts.genderRestriction) {
            return _eligFail('Character gender does not meet position requirement', C.CODES.GENDER);
        }
        if (positionFacts.requiredRoleId) {
            var hasRole = characterFacts.roleIds &&
                characterFacts.roleIds.indexOf(positionFacts.requiredRoleId) !== -1;
            if (!hasRole) {
                return _eligFail('Character does not have the required role', C.CODES.ROLE);
            }
            var skill = characterFacts.skillLevels && characterFacts.skillLevels[positionFacts.requiredRoleId];
            if (positionFacts.minSkillLevel != null && (skill == null || skill < positionFacts.minSkillLevel)) {
                return _eligFail(
                    'Character skill level (' + (skill == null ? 'none' : skill) +
                    ') is below requirement (' + positionFacts.minSkillLevel + ')',
                    C.CODES.SKILL
                );
            }
        }
        if (positionFacts.minExperience != null && positionFacts.minExperience > 0) {
            var exp = characterFacts.experienceYears || 0;
            if (exp < positionFacts.minExperience) {
                return _eligFail(
                    'Character experience (' + exp +
                    ') is below requirement (' + positionFacts.minExperience + ')',
                    C.CODES.EXPERIENCE
                );
            }
        }
        return _eligOk();
    }

    // ---- Assignment planning (pure) ------------------------------------------
    // Returns { valid, reason?, code?, roleToAdd?, skillLevel?, startYear }

    function planAssignment(input) {
        if (!input || !input.position || !input.character) {
            return { valid: false, reason: 'Missing position or character facts', code: C.CODES.NO_FACTS };
        }
        var positionFacts = input.position;
        var characterFacts = input.character;
        var options = input.options || {};

        var startYear = options.startYear != null ? options.startYear : null;
        if (startYear == null) {
            return { valid: false, reason: 'Start year is required', code: C.CODES.NO_START_YEAR };
        }

        var roleToAdd = null;
        var skillLevel = null;

        if (positionFacts.requiredRoleId) {
            var hasRole = characterFacts.roleIds &&
                characterFacts.roleIds.indexOf(positionFacts.requiredRoleId) !== -1;
            if (!hasRole) {
                if (options.addRoleIfMissing === false) {
                    return { valid: false, reason: 'Character does not have the required role', code: C.CODES.ROLE };
                }
                roleToAdd = {
                    roleId: positionFacts.requiredRoleId,
                    skillLevel: options.defaultSkillLevel != null
                        ? options.defaultSkillLevel
                        : C.DEFAULT_SKILL_LEVEL
                };
                skillLevel = roleToAdd.skillLevel;
            } else {
                skillLevel = characterFacts.skillLevels
                    ? characterFacts.skillLevels[positionFacts.requiredRoleId]
                    : null;
            }
        }

        // Build the post-add fact set to run eligibility against.
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
        if (!elig.eligible) {
            return { valid: false, reason: elig.reason, code: elig.code };
        }

        var resolvedSkillLevel = skillLevel != null
            ? skillLevel
            : (options.defaultSkillLevel != null ? options.defaultSkillLevel : null);

        return {
            valid: true,
            roleToAdd: roleToAdd,
            skillLevel: resolvedSkillLevel,
            startYear: startYear
        };
    }

    // ---- Candidate scoring (pure, deterministic) -----------------------------
    // candidateFacts: { age, experienceYears, rankPriority }

    function scoreCandidate(candidateFacts) {
        if (!candidateFacts) return C.SCORING_MIN;

        var score = 0;

        if (candidateFacts.rankPriority != null) {
            score += (C.SCORING_RANK_PRIORITY_BASE - candidateFacts.rankPriority) *
                     C.SCORING_RANK_PRIORITY_MULTIPLIER;
        }

        var exp = candidateFacts.experienceYears || 0;
        score += Math.min(exp, C.SCORING_EXPERIENCE_CAP_YEARS) * C.SCORING_EXPERIENCE_MULTIPLIER;

        var age = candidateFacts.age;
        if (age != null) {
            if (age >= C.SCORING_AGE_PRIME_MIN && age <= C.SCORING_AGE_PRIME_MAX) {
                score += C.SCORING_AGE_PRIME_BONUS;
            } else if (age >= C.SCORING_AGE_ACCEPTABLE_MIN && age <= C.SCORING_AGE_ACCEPTABLE_MAX) {
                score += C.SCORING_AGE_ACCEPTABLE_BONUS;
            }
        }

        if (score < C.SCORING_MIN) score = C.SCORING_MIN;
        if (score > C.SCORING_MAX) score = C.SCORING_MAX;
        return score;
    }

    function isCandidateReady(candidateFacts) {
        if (!candidateFacts) return false;
        var age = candidateFacts.age;
        var exp = candidateFacts.experienceYears || 0;
        return age != null &&
            age >= C.READY_MIN_AGE &&
            exp >= C.READY_MIN_EXPERIENCE_YEARS;
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
        var p = priority != null ? priority : C.DEFAULT_POSITION_PRIORITY;
        var tiers = C.SALARY_TIERS;
        for (var i = 0; i < tiers.length; i++) {
            if (p <= tiers[i].maxPriority) return tiers[i];
        }
        return tiers[tiers.length - 1];
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentRules = {
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
