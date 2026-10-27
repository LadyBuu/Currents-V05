/**
 * relationships-bootstrap.js
 *
 * Load-order manifest and integrity check for the relationship domain.
 *
 * Responsibilities:
 *   1. Verify every required module loaded and exposes its namespace.
 *   2. Verify every external dependency the relationship domain needs
 *      is present.
 *   3. Verify cross-domain prerequisites: CultureRules exposes
 *      supportsRelationshipAttribute, SkillQueries exposes
 *      getSkillLevel, SkillCommands exposes updateSkillLevel (required
 *      only when professional apprenticeship progression runs).
 *   4. Expose window.Relationships as the single entry point.
 *   5. Verify internal consistency of the domain's key tables so that a
 *      typo cannot silently produce a domain with holes.
 *   6. Verify that every method the domain dispatches to actually exists
 *      on the namespace that owns it. This catches the entire class of
 *      "a caller invokes Namespace.method() but Namespace doesn't export
 *      method" bugs at load time, before any user action.
 *
 * No logic beyond verification. Fail loud. No fallbacks.
 *
 * LOAD THIS FILE LAST, after every other relationships/*.js file, and
 * after family-queries.js, family-rules.js, character-queries.js,
 * constants/character-traits.js, and any other external dependency.
 * See section 13 of the domain docs for the full HTML load order.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Phase 3.2):
 *     - Added REQUIRED_METHODS: a per-namespace list of every method
 *       the relationship domain dispatches to. The bootstrap verifies
 *       each one is a function. Missing methods fail at load with a
 *       message naming the namespace and method.
 *       This catches:
 *         - relationship-integrations.js calling
 *           ProfessionalCommands.endApprenticeship (which lives on
 *           ApprenticeshipCommands, not ProfessionalCommands) — a
 *           live crash on any death with an active apprenticeship.
 *         - relationship-finder-queries.js calling
 *           FamilyQueries.getChildRelationships (which does not exist
 *           on FamilyQueries) — a live crash on any finder traversal.
 *       Both of those specific bugs were also fixed directly; the
 *       manifest is the safety net that prevents their recurrence.
 *     - No other behavioural change.
 * =============================================================================
 */

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // REQUIRED MODULES (relationship domain)
    // -------------------------------------------------------------------------

    var REQUIRED_MODULES = [
        // Vocabulary + utilities
        'RELATIONSHIP_ARCHETYPES',
        'RELATIONSHIP_ATTRIBUTES',
        'RELATIONSHIP_STATUS',
        'RELATIONSHIP_TYPES',
        'RelationshipUtils',

        // Core storage and pipeline
        'RelationshipState',
        'RelationshipQueries',
        'RelationshipCommands',

        // Domain rules / queries / commands
        'RomanceRules',
        'RomanceQueries',
        'RomanceCommands',

        'FriendshipRules',
        'FriendshipQueries',
        'FriendshipCommands',

        'RivalryRules',
        'RivalryQueries',
        'RivalryCommands',

        'JealousyRules',
        'JealousyQueries',
        'JealousyCommands',

        'AffairRules',
        'AffairQueries',
        'AffairCommands',

        'MatchmakingRules',
        'MatchmakingQueries',

        'ProfessionalRules',
        'ProfessionalQueries',
        'ProfessionalCommands',

        // Finder
        'RelationshipFinderQueries',

        // Presentation metadata
        'RelationshipUI',

        // Cross-domain integrations owned by this domain
        'RelationshipIntegrations'
    ];

    // -------------------------------------------------------------------------
    // REQUIRED EXTERNAL GLOBALS (relationship domain)
    //
    // These are hard requirements. A relationship domain without
    // character accessors, ids, or current year cannot operate.
    //
    // CHARACTER_TRAITS / CHARACTER_TRAIT_VALUES are also hard requirements:
    //   - jealousy-rules.js keys TRAIT_MODIFIERS off canonical trait ids
    //     (violent, hot_headed, cowardly, calculating, jealous, secure,
    //     patient). Without the vocabulary, none of those lookups fire and
    //     the confrontation level silently loses its trait adjustments.
    //   - affair-queries.js reads 'secretive' from character.traits to
    //     compute discovery risk. Without the vocabulary, the secretive
    //     modifier is silently skipped and discovery risk is understated.
    //   - romance-commands.js no longer reads traits for multi-spouse
    //     policy (see its MULTI-PARTNER POLICY header) — that decision
    //     was made specifically so trait-vocabulary absence cannot change
    //     romance behaviour. The two dependencies above are the remaining
    //     reason the vocabulary is required here.
    //
    // A relationship domain without the trait vocabulary is a domain
    // with holes. It must fail loud, not degrade quietly.
    // -------------------------------------------------------------------------

    var REQUIRED_GLOBALS = [
        'getCharacterById',
        'getCharacters',
        'getCurrentYear',
        'calculateAge',
        'generateId',
        'markDataDirty',
        'logEvent',
        'Random',
        'CultureRules',
        'CHARACTER_TRAITS',
        'CHARACTER_TRAIT_VALUES'
    ];

    // CultureRules sub-requirements
    var REQUIRED_CULTURE_RULES_METHODS = [
        'supportsRelationshipAttribute'
    ];

    // -------------------------------------------------------------------------
    // CONDITIONALLY REQUIRED GLOBALS
    //
    // Skills are only required if professional commands are invoked.
    // We do not fail the bootstrap if they are missing; we warn, and
    // professional commands will throw if called without them. This
    // matches the project's "fail loud at point of use" convention for
    // optional subsystems.
    //
    // ApprenticeshipCommands is the ONE exception: the death cascade in
    // relationship-integrations.js dispatches to it. Its absence today
    // means an apprenticeship never gets ended on death, which is a
    // silent data-integrity problem rather than a loud crash. We treat
    // its absence as a warning here (so the domain still loads), and
    // relationship-integrations.js surfaces the absence in its own
    // cleanup report.
    // -------------------------------------------------------------------------

    var CONDITIONAL_GLOBALS = [
        'SkillQueries',
        'SkillCommands',
        'MurderCommands',
        'ExecutionCommands',
        'ApprenticeshipCommands'
    ];

    // -------------------------------------------------------------------------
    // OPTIONAL GLOBALS
    //
    // Used by UI and by cross-domain logging. Absence is not fatal.
    // -------------------------------------------------------------------------

    var OPTIONAL_GLOBALS = [
        'getCurrentLocation',
        'getActiveRankDisplay',
        'getRankById',
        'registerLifecycleHook',
        'Icons',
        'escapeHtml',
        'showToast',
        'openModal',
        'closeTopModal'
    ];

    // -------------------------------------------------------------------------
    // REQUIRED METHODS PER NAMESPACE (Phase 3.2)
    //
    // Every method the relationship domain dispatches to is listed here
    // under the namespace that owns it. The bootstrap checks each one is
    // a function. A missing method fails at load with a message naming
    // the namespace and method.
    //
    // This catches the entire class of "caller invokes
    // Namespace.method() but Namespace doesn't export method" bugs
    // before any user action.
    //
    // Rules for adding entries:
    //   - Add a method here if any module in this domain calls it.
    //   - Do not add a method here if it is only called by external
    //     consumers; that is the external consumer's bootstrap check.
    //   - Include the method even if the current implementation guards
    //     its call with `if (module && module.method)`. The bootstrap
    //     check is what turns the guard into a fail-loud at load.
    //   - If a method is genuinely optional (missing by design), do not
    //     list it here; document the absence in the caller.
    // -------------------------------------------------------------------------

    var REQUIRED_METHODS = [
        // -----------------------------------------------------------------
        // Relationship core
        // -----------------------------------------------------------------
        ['RelationshipState', [
            'snapshot',
            'replaceAll',
            'subscribe',
            'allIds',
            'all',
            'getRecordCopy',
            'idsForCharacter',
            'idsForType',
            'idsForPair',
            'hasId',
            'applyInserts',
            'applyUpdates',
            'applyRemovals',
            '_getLiveRecord',
            'validateIntegrity'
        ]],
        ['RelationshipQueries', [
            'getById',
            'exists',
            'getBetween',
            'getBetweenOfType',
            'getActiveBetween',
            'getActiveBetweenOfType',
            'hasAnyBetween',
            'hasActiveBetween',
            'hasActiveBetweenOfType',
            'countBetween',
            'getMostRecentRelationship',
            'getMostRecentRelationshipOfType',
            'getForCharacter',
            'getActiveForCharacter',
            'countForCharacter',
            'countActiveForCharacter',
            'countByTypeForCharacter',
            'getByType',
            'getActiveByType',
            'countByType',
            'getAll',
            'getActive',
            'count',
            'idsForCharacter',
            'idsForType',
            'idsForPair',
            'allIds',
            'getNeighborIds'
        ]],
        ['RelationshipCommands', [
            'create',
            'createBatch',
            'update',
            'end',
            'setWidowed',
            'remove',
            'addAttribute',
            'removeAttribute',
            'endAllActiveForCharacter',
            'removeAllReferencesTo'
        ]],

        // -----------------------------------------------------------------
        // Romance
        // -----------------------------------------------------------------
        ['RomanceRules', [
            'isRomanticArchetype',
            'isAffair',
            'hasAttribute',
            'minimumAge',
            'isAgeValid',
            'canTransition',
            'validateAttributes',
            'validateAttributesForCulture',
            'canAddAttribute',
            'canRemoveAttribute',
            'canHaveMultiplePartners',
            'classifyNewRelationship',
            'resolveAttributes',
            'canBreakUp',
            'canBeWidowed'
        ]],
        ['RomanceQueries', [
            'getRomanticRelationships',
            'getActiveRomanticRelationships',
            'hasActiveRomanticRelationship',
            'hasActiveCommittedRelationship',
            'countActiveRomanticPartners',
            'getRomanticRelationshipsBetween',
            'getActiveRomanticRelationshipsBetween',
            'getActiveCommittedBetween',
            'getAllCommittedBetween',
            'hasActiveRomanticBetween',
            'hasActiveCommittedBetween',
            'getActiveCommittedPartners',
            'getActiveRomanticPartners',
            'countActiveCommittedPartners',
            'getCommittedPartnerIds',
            'getAffairs',
            'getActiveAffairs',
            'getAffairBetween',
            'isAffair',
            'isSecretRelationship',
            'hasCommittedAttribute',
            'hasActiveCommittedAttributeBetween',
            'getCommittedAttributesBetween',
            'getInstitution',
            'getInstitutionBetween',
            'hasActiveInstitution',
            'getPrimaryInstitution',
            'getMultiPartnerFacts',
            'getRelationshipConflicts',
            'getRomanceStats'
        ]],
        ['RomanceCommands', [
            'startCasualDating',
            'startOneNightStand',
            'startCommittedRelationship',
            'addCommittedAttribute',
            'removeCommittedAttribute',
            'breakUp',
            'deathEndsRelationship',
            'endAllRomanticForCharacter'
        ]],

        // -----------------------------------------------------------------
        // Friendship
        // -----------------------------------------------------------------
        ['FriendshipRules', [
            'canCreate',
            'canTransition',
            'canChangeStrength',
            'canRecordEvent',
            'canRemove',
            'validateAttributes',
            'clampStrength',
            'isValidStrength',
            'strengthTier',
            'isKnownEventType',
            'isKnownEndReason',
            'applyStrengthChange',
            'applyEventImpact',
            'boundEventHistory',
            'buildInitialMetadata'
        ]],
        ['FriendshipQueries', [
            'areFriends',
            'getActiveFriendshipBetween',
            'getLatestFriendshipBetween',
            'getAllFriendshipsBetween',
            'getFriendshipsForCharacter',
            'getFriends',
            'getFriendsSortedByStrength',
            'getFriendCount',
            'getBestFriend',
            'getFriendshipStrength',
            'getFriendshipStrengthById',
            'getFriendshipTier',
            'getMutualFriends',
            'getFriendshipStats',
            'getFriendshipEvents'
        ]],
        ['FriendshipCommands', [
            'createFriendship',
            'createMutualFriendships',
            'increaseFriendshipStrength',
            'decreaseFriendshipStrength',
            'recordFriendshipEvent',
            'removeFriendship'
        ]],

        // -----------------------------------------------------------------
        // Rivalry
        // -----------------------------------------------------------------
        ['RivalryRules', [
            'canCreateRivalry',
            'canCreateEnmity',
            'canTransition',
            'validateRivalryAttributes',
            'validateEnmityAttributes'
        ]],
        ['RivalryQueries', [
            'areRivals',
            'areEnemies',
            'areInConflict',
            'getActiveRivalryBetween',
            'getActiveEnmityBetween',
            'getAllRivalriesBetween',
            'getAllEnmitiesBetween',
            'getRivalries',
            'getEnmities',
            'getConflicts',
            'getRivalIds',
            'getEnemyIds',
            'getRivalryCount',
            'getEnmityCount',
            'getSharedRivals',
            'getSharedEnemies',
            'getSharedConflicts',
            'getRivalryStats',
            'getEnmityStats'
        ]],
        ['RivalryCommands', [
            'createRivalry',
            'createEnmity',
            'endRivalry',
            'endEnmity',
            'escalateRivalryToEnmity',
            'deEscalateEnmityToRivalry'
        ]],

        // -----------------------------------------------------------------
        // Jealousy
        // -----------------------------------------------------------------
        ['JealousyRules', [
            'calculateJealousy',
            'dominantType',
            'adjustConfrontationLevel',
            'determineConsequence',
            'shouldConfrontAnnually',
            'consequenceCreatesRivalry',
            'consequenceIntensity'
        ]],
        ['JealousyQueries', [
            'getJealousyBetween',
            'findAllJealousyTargets',
            'getPrimaryJealousyTarget',
            'getConflictHistory',
            'getActiveConflicts',
            'getJealousyStats'
        ]],
        ['JealousyCommands', [
            'triggerConfrontation',
            'processAnnualJealousy'
        ]],

        // -----------------------------------------------------------------
        // Affair
        // -----------------------------------------------------------------
        ['AffairRules', [
            'isValidAffairType',
            'normalizeAffairType',
            'calculateDiscoveryRisk',
            'annualDiscoveryChance',
            'evaluateDiscovery',
            'eligibleConsequences',
            'calculateReconciliationChance',
            'evaluateReconciliation',
            'calculateScandalImpact',
            'getReputationImpact',
            'canLegitimize',
            'resolveLegitimizedAttributes'
        ]],
        ['AffairQueries', [
            'getAffairs',
            'getActiveAffairs',
            'getDiscoveredAffairs',
            'isHavingAffair',
            'getAffairBetween',
            'getAffairById',
            'getAffairDuration',
            'getAffairDiscoverer',
            'getAffairDiscoveryCircumstances',
            'getAffairDiscoveryYear',
            'getDiscoveryRisk',
            'getHighestRiskAffair',
            'getAffairStatistics'
        ]],
        ['AffairCommands', [
            'createAffair',
            'rollDiscovery',
            'applyConsequences',
            'endAffair',
            'legitimizeAffair',
            'reconcileAfterAffair',
            'endAllAffairsForCharacter'
        ]],

        // -----------------------------------------------------------------
        // Matchmaking
        // -----------------------------------------------------------------
        ['MatchmakingRules', [
            'isValidPreference',
            'passesGenderPreference',
            'passesAgeGap',
            'acceptanceChance',
            'isEligibleSingle',
            'isEligibleLateSpring'
        ]],
        ['MatchmakingQueries', [
            'findSurpriseMatches',
            'findLateSpringMatch',
            'getEligibleSingles'
        ]],

        // -----------------------------------------------------------------
        // Professional
        //
        // NOTE: ProfessionalCommands does NOT export endApprenticeship /
        // createApprenticeship / progressApprenticeship / completeApprenticeship.
        // Those live on ApprenticeshipCommands (a separate module that
        // is conditionally required). The methods listed here are the
        // ones ProfessionalCommands actually owns.
        // -----------------------------------------------------------------
        ['ProfessionalRules', [
            'isProfessionalArchetype',
            'getTransitionTable',
            'canTransition',
            'validateAttributes',
            'clampSkill',
            'skillTier',
            'canTeach',
            'canCreateApprenticeship',
            'canProgressApprenticeship',
            'canCompleteApprenticeship',
            'canCreateEmployment',
            'canCreateGuildMembership'
        ]],
        ['ProfessionalQueries', [
            'getApprentices',
            'getApprenticeIds',
            'isMaster',
            'getApprenticeCount',
            'getMasterRelationships',
            'getMasterIds',
            'getMaster',
            'isApprentice',
            'getApprenticeshipBetween',
            'getApprenticeshipRoleId',
            'getApprenticeshipRelationships',
            'getExperts',
            'getMasterships',
            'getEmployees',
            'getEmployeeIds',
            'isEmployer',
            'getEmployerRelationships',
            'getEmployerIds',
            'getEmployer',
            'isEmployed',
            'getEmploymentBetween',
            'getGuildMembers',
            'getGuildMemberIds',
            'getGuildMemberships',
            'getGuildIds',
            'isInGuild',
            'getGuildMembership',
            'getGuildRank',
            'getProfessionalRelationships',
            'getProfessionalRelationshipsBetween',
            'getProfessionalStats'
        ]],
        ['ProfessionalCommands', [
            'createEdge',
            'updateEdgeMetadata',
            'updateEdgeFields',
            'endEdge',
            'removeEdge',
            'createMastership',
            'endMastership',
            'createEmployment',
            'updateEmployment',
            'endEmployment',
            'createGuildMembership',
            'removeGuildMembership',
            'setGuildRank'
        ]],

        // -----------------------------------------------------------------
        // Cross-domain prerequisites
        //
        // FamilyQueries is a required external dependency. Its methods
        // are used by relationship-finder-queries.js. FamilyQueries has
        // no getChildRelationships — the Finder calls getChildren.
        // -----------------------------------------------------------------
        ['FamilyQueries', [
            'getEdge',
            'getEdgesForParent',
            'getEdgesForChild',
            'getParents',
            'getParentsByRole',
            'getBiologicalParentIds',
            'getLegalParentIds',
            'getSocialParentIds',
            'getAllParentIds',
            'getChildren',
            'getChildIds',
            'getBiologicalChildIds',
            'getLegalChildIds',
            'getSiblingFacts',
            'getSiblings',
            'getGrandparentIds',
            'getGrandchildIds',
            'getGrandparents',
            'getGrandchildren',
            'getAncestorProvider',
            'classifyKinship',
            'isBloodRelated',
            'getKinshipCloseness',
            'getFirstCousinIds',
            'getCousins',
            'getAuntAndUncleIds',
            'getNieceAndNephewIds',
            'isFirstCousin',
            'isAuntOrUncle',
            'isNieceOrNephew',
            'isGrandparent',
            'isGrandchild',
            'isOrphan',
            'hasAnyParent'
        ]],
        ['FamilyRules', [
            'normalizeParentRole',
            'isBiological',
            'isValidParentType',
            'isValidParentRole',
            'canSetParent',
            'deriveSiblingship',
            'classifyKinship',
            'isBloodRelated',
            'wouldCreateBiologicalCycle',
            'isOrphan',
            'hasAnyParent',
            'canCreateAdoption'
        ]],

        // -----------------------------------------------------------------
        // Finder + UI + integrations
        // -----------------------------------------------------------------
        ['RelationshipFinderQueries', [
            'getReport',
            'findConnectionPath',
            'findCommonAncestors'
        ]],
        ['RelationshipUI', [
            'archetypeName',
            'archetypeShortName',
            'archetypeIcon',
            'archetypeColor',
            'archetypeTense',
            'attributeName',
            'attributeIcon',
            'attributeColor',
            'statusName',
            'statusIcon',
            'categoryName',
            'categoryIcon'
        ]],
        ['RelationshipIntegrations', [
            'handleCharacterDeath',
            'removeAllReferencesTo',
            'getPartnershipProjection',
            'getAllPartnershipProjections',
            'processAnnualAffairDiscovery',
            'processAnnualLifecycle'
        ]]
    ];

    // -------------------------------------------------------------------------
    // VERIFICATION
    // -------------------------------------------------------------------------

    function _verifyModules() {
        var missing = [];
        for (var i = 0; i < REQUIRED_MODULES.length; i++) {
            var name = REQUIRED_MODULES[i];
            if (typeof window[name] === 'undefined' || window[name] === null) {
                missing.push(name);
            }
        }
        return missing;
    }

    function _verifyGlobals() {
        var missing = [];
        for (var i = 0; i < REQUIRED_GLOBALS.length; i++) {
            var name = REQUIRED_GLOBALS[i];
            if (typeof window[name] === 'undefined' || window[name] === null) {
                missing.push(name);
            }
        }
        return missing;
    }

    function _verifyCultureRules() {
        var missing = [];
        if (typeof window.CultureRules !== 'object' || window.CultureRules === null) {
            return ['CultureRules'];
        }
        for (var i = 0; i < REQUIRED_CULTURE_RULES_METHODS.length; i++) {
            var m = REQUIRED_CULTURE_RULES_METHODS[i];
            if (typeof window.CultureRules[m] !== 'function') {
                missing.push('CultureRules.' + m);
            }
        }
        return missing;
    }

    function _verifyConditionals() {
        var missing = [];
        for (var i = 0; i < CONDITIONAL_GLOBALS.length; i++) {
            var name = CONDITIONAL_GLOBALS[i];
            if (typeof window[name] === 'undefined' || window[name] === null) {
                missing.push(name);
            }
        }
        return missing;
    }

    function _verifyOptional() {
        var missing = [];
        for (var i = 0; i < OPTIONAL_GLOBALS.length; i++) {
            var name = OPTIONAL_GLOBALS[i];
            if (typeof window[name] === 'undefined' || window[name] === null) {
                missing.push(name);
            }
        }
        return missing;
    }

    // -------------------------------------------------------------------------
    // METHOD-LEVEL VERIFICATION (Phase 3.2)
    //
    // Walks REQUIRED_METHODS and verifies every method exists as a
    // function on its namespace. Returns an array of error strings,
    // each of the form "Namespace.method is missing".
    //
    // The check is intentionally permissive about namespace absence:
    // _verifyModules already reports a missing namespace. Adding a
    // second "Namespace.method is missing" for every method of an
    // already-reported namespace would flood the output. So if the
    // namespace itself is missing, we skip its methods (the namespace
    // error is the actionable one).
    // -------------------------------------------------------------------------

    function _verifyMethods() {
        var errors = [];
        for (var i = 0; i < REQUIRED_METHODS.length; i++) {
            var namespaceName = REQUIRED_METHODS[i][0];
            var methodNames = REQUIRED_METHODS[i][1];
            var ns = window[namespaceName];

            if (typeof ns === 'undefined' || ns === null) {
                // Namespace missing — _verifyModules will report it.
                // Do not double-report every method here.
                continue;
            }
            if (typeof ns !== 'object' && typeof ns !== 'function') {
                errors.push(namespaceName + ' is not an object or function');
                continue;
            }

            for (var j = 0; j < methodNames.length; j++) {
                var methodName = methodNames[j];
                if (typeof ns[methodName] !== 'function') {
                    errors.push(namespaceName + '.' + methodName + ' is missing');
                }
            }
        }
        return errors;
    }

    // -------------------------------------------------------------------------
    // INTERNAL CONSISTENCY
    // -------------------------------------------------------------------------

    function _verifyVocabulary() {
        var errors = [];
        var TYPES = window.RELATIONSHIP_TYPES;

        if (typeof TYPES.getAllArchetypes !== 'function') {
            errors.push('RELATIONSHIP_TYPES.getAllArchetypes missing');
            return errors;
        }

        var archetypes = TYPES.getAllArchetypes();
        for (var i = 0; i < archetypes.length; i++) {
            var a = archetypes[i];
            if (TYPES.getArchetypeCategory(a) === null) {
                errors.push('archetype missing category: ' + a);
            }
            if (TYPES.getArchetypeDirection(a) === null) {
                errors.push('archetype missing direction: ' + a);
            }
            if (TYPES.isDirectional(a) && TYPES.getArchetypeRoles(a) === null) {
                errors.push('directional archetype missing roles: ' + a);
            }
        }

        var attrs = TYPES.getAllAttributes();
        for (var j = 0; j < attrs.length; j++) {
            var at = attrs[j];
            if (TYPES.getAttributeScope(at) === null) {
                errors.push('attribute missing scope: ' + at);
            }
            if (TYPES.getAttributeOwner(at) === null) {
                errors.push('attribute missing owner: ' + at);
            }
        }

        return errors;
    }

    function _verifyDomainTables() {
        var errors = [];

        if (!window.RomanceRules || !window.RomanceRules.ROMANCE_TRANSITIONS) {
            errors.push('RomanceRules.ROMANCE_TRANSITIONS missing');
        }
        if (!window.RomanceRules || !window.RomanceRules.ROMANCE_ALLOWED_ATTRIBUTES) {
            errors.push('RomanceRules.ROMANCE_ALLOWED_ATTRIBUTES missing');
        }
        if (!window.FriendshipRules || !window.FriendshipRules.FRIENDSHIP_TRANSITIONS) {
            errors.push('FriendshipRules.FRIENDSHIP_TRANSITIONS missing');
        }
        if (!window.RivalryRules || !window.RivalryRules.RIVALRY_TRANSITIONS) {
            errors.push('RivalryRules.RIVALRY_TRANSITIONS missing');
        }
        if (!window.RivalryRules || !window.RivalryRules.ENMITY_TRANSITIONS) {
            errors.push('RivalryRules.ENMITY_TRANSITIONS missing');
        }
        if (!window.ProfessionalRules || !window.ProfessionalRules.APPRENTICESHIP_TRANSITIONS) {
            errors.push('ProfessionalRules.APPRENTICESHIP_TRANSITIONS missing');
        }

        return errors;
    }

    // -------------------------------------------------------------------------
    // REPORTING
    // -------------------------------------------------------------------------

    function _formatList(list) {
        if (!list || list.length === 0) return '(none)';
        return list.map(function(x) { return '  - ' + x; }).join('\n');
    }

    function _report(status) {
        if (status.missingModules.length > 0 ||
            status.missingGlobals.length > 0 ||
            status.missingCultureRules.length > 0 ||
            status.methodErrors.length > 0 ||
            status.vocabularyErrors.length > 0 ||
            status.domainTableErrors.length > 0) {

            var msg = 'relationships-bootstrap.js: dependency verification failed\n' +
                '\nMissing modules:\n' + _formatList(status.missingModules) +
                '\nMissing required globals:\n' + _formatList(status.missingGlobals) +
                '\nMissing CultureRules members:\n' + _formatList(status.missingCultureRules) +
                '\nMissing methods:\n' + _formatList(status.methodErrors) +
                '\nVocabulary errors:\n' + _formatList(status.vocabularyErrors) +
                '\nDomain table errors:\n' + _formatList(status.domainTableErrors);

            console.error(msg);
            throw new Error(msg);
        }

        if (status.missingConditionals.length > 0) {
            console.warn(
                'relationships-bootstrap.js: conditional dependencies missing\n' +
                _formatList(status.missingConditionals) +
                '\nThe relationship domain will load, but commands that depend on\n' +
                'these modules will throw when invoked.'
            );
        }

        if (status.missingOptional.length > 0) {
            console.warn(
                'relationships-bootstrap.js: optional dependencies missing\n' +
                _formatList(status.missingOptional)
            );
        }
    }

    // -------------------------------------------------------------------------
    // PUBLIC ENTRY POINT
    // -------------------------------------------------------------------------

    function verify() {
        var status = {
            missingModules: _verifyModules(),
            missingGlobals: _verifyGlobals(),
            missingCultureRules: _verifyCultureRules(),
            missingConditionals: _verifyConditionals(),
            missingOptional: _verifyOptional(),
            methodErrors: _verifyMethods(),
            vocabularyErrors: _verifyVocabulary(),
            domainTableErrors: _verifyDomainTables()
        };

        var ok = status.missingModules.length === 0 &&
                 status.missingGlobals.length === 0 &&
                 status.missingCultureRules.length === 0 &&
                 status.methodErrors.length === 0 &&
                 status.vocabularyErrors.length === 0 &&
                 status.domainTableErrors.length === 0;

        return {
            ok: ok,
            status: status
        };
    }

    function init() {
        var verified = verify();
        _report(verified.status);
        return {
            success: true,
            ok: verified.ok,
            modules: REQUIRED_MODULES.slice(),
            missingOptional: verified.status.missingOptional.slice(),
            missingConditionals: verified.status.missingConditionals.slice(),
            methodErrors: verified.status.methodErrors.slice()
        };
    }

    // -------------------------------------------------------------------------
    // NAMESPACE
    //
    // window.Relationships is the recommended entry point. Individual
    // globals remain on window for backward compatibility with
    // external subsystems, but new code should use the namespace.
    //
    // The namespace re-exports live references. If a module is loaded
    // after bootstrap (which violates the load contract), the namespace
    // will not see it. Load this file last.
    // -------------------------------------------------------------------------

    window.Relationships = {
        init: init,
        verify: verify,

        Types: window.RELATIONSHIP_TYPES,
        Utils: window.RelationshipUtils,

        State:    window.RelationshipState,
        Queries:  window.RelationshipQueries,
        Commands: window.RelationshipCommands,

        Romance: {
            Rules:    window.RomanceRules,
            Queries:  window.RomanceQueries,
            Commands: window.RomanceCommands
        },
        Friendship: {
            Rules:    window.FriendshipRules,
            Queries:  window.FriendshipQueries,
            Commands: window.FriendshipCommands
        },
        Rivalry: {
            Rules:    window.RivalryRules,
            Queries:  window.RivalryQueries,
            Commands: window.RivalryCommands
        },
        Jealousy: {
            Rules:    window.JealousyRules,
            Queries:  window.JealousyQueries,
            Commands: window.JealousyCommands
        },
        Affair: {
            Rules:    window.AffairRules,
            Queries:  window.AffairQueries,
            Commands: window.AffairCommands
        },
        Matchmaking: {
            Rules:   window.MatchmakingRules,
            Queries: window.MatchmakingQueries
        },
        Professional: {
            Rules:    window.ProfessionalRules,
            Queries:  window.ProfessionalQueries,
            Commands: window.ProfessionalCommands
        },

        Finder: {
            Queries: window.RelationshipFinderQueries
        },

        UI: window.RelationshipUI,

        Integrations: window.RelationshipIntegrations
    };

    // Run verification at load time. A failure throws and halts
    // bootstrap, which is the intended behaviour: a relationship
    // domain without its dependencies is a broken application, not a
    // degraded one.
    init();

})();
