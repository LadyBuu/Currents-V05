/**
 * =============================================================================
 * STILL WATERS - RELATIONSHIP TYPES REGISTRY
 * =============================================================================
 * 
 * This file contains CENTRAL relationship type definitions.
 * All relationship logic should reference these definitions.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. CORE RELATIONSHIP ARCHETYPES
// =============================================================================

window.RELATIONSHIP_ARCHETYPES = {
    // ---- ROMANTIC ----
    CASUAL_DATING: 'casual_dating',
    ONE_NIGHT_STAND: 'one_night_stand',
    COMMITTED: 'committed',
    
    // ---- SOCIAL ----
    FRIENDSHIP: 'friendship',
    RIVALRY: 'rivalry',
    ENMITY: 'enmity',
    
    // ---- FAMILY ----
    PARENT_CHILD: 'parent_child',
    SIBLING: 'sibling',
    GRANDPARENT: 'grandparent',
    AUNT_UNCLE: 'aunt_uncle',
    COUSIN: 'cousin',
    
    // ---- PROFESSIONAL ----
    APPRENTICESHIP: 'apprenticeship',
    EMPLOYMENT: 'employment',
    GUILD_MEMBERSHIP: 'guild_membership',
    MASTERSHIP: 'mastership'
};

// =============================================================================
// 2. RELATIONSHIP ATTRIBUTES
// =============================================================================

window.RELATIONSHIP_ATTRIBUTES = {
    // Legal status (committed only)
    MARRIED: 'married',
    ENGAGED: 'engaged',
    COHABITING: 'cohabiting',
    CIVIL_UNION: 'civil_union',
    HANDFASTED: 'handfasted',
    
    // Structure
    POLYAMOROUS: 'polyamorous',
    MONOGAMOUS: 'monogamous',
    
    // Origin
    ARRANGED: 'arranged',
    LOVE_MATCH: 'love_match',
    DUTY_MATCH: 'duty_match',
    
    // Visibility
    SECRET: 'secret',
    PUBLIC: 'public',
    SCANDALOUS: 'scandalous',
    
    // Special
    MORGANATIC: 'morganatic',
    LEVITIC: 'levitic',
    POSTHUMOUS: 'posthumous'
};

// =============================================================================
// 3. RELATIONSHIP STATUS
// =============================================================================

window.RELATIONSHIP_STATUS = {
    ONGOING: 'ongoing',
    ENDED: 'ended',
    WIDOWED: 'widowed',
    PENDING: 'pending',
    PROPOSED: 'proposed',
    DECLINED: 'declined'
};

window.RELATIONSHIP_STATUS_TRANSITIONS = {
    [window.RELATIONSHIP_STATUS.PENDING]: [window.RELATIONSHIP_STATUS.ONGOING, window.RELATIONSHIP_STATUS.DECLINED],
    [window.RELATIONSHIP_STATUS.PROPOSED]: [window.RELATIONSHIP_STATUS.ONGOING, window.RELATIONSHIP_STATUS.DECLINED],
    [window.RELATIONSHIP_STATUS.ONGOING]: [window.RELATIONSHIP_STATUS.ENDED, window.RELATIONSHIP_STATUS.WIDOWED],
    [window.RELATIONSHIP_STATUS.ENDED]: [window.RELATIONSHIP_STATUS.ONGOING],
    [window.RELATIONSHIP_STATUS.WIDOWED]: [],
    [window.RELATIONSHIP_STATUS.DECLINED]: []
};

// =============================================================================
// 4. ARCHETYPE METADATA
// =============================================================================

window.RELATIONSHIP_ARCHETYPE_METADATA = {
    [window.RELATIONSHIP_ARCHETYPES.CASUAL_DATING]: {
        name: 'Casual Dating',
        icon: 'HEART_OUTLINE',
        color: '#e8a0a0',
        displayName: 'Casual Dating',
        pastTense: 'casually dated',
        presentTense: 'is casually dating',
        category: 'ROMANTIC',
        canHaveAttributes: false
    },
    [window.RELATIONSHIP_ARCHETYPES.ONE_NIGHT_STAND]: {
        name: 'One Night Stand',
        icon: 'STAR_4_OUTLINE',
        color: '#d48888',
        displayName: 'One Night Stand',
        pastTense: 'had a one night stand with',
        presentTense: 'is involved with',
        category: 'ROMANTIC',
        canHaveAttributes: false,
        isEphemeral: true
    },
    [window.RELATIONSHIP_ARCHETYPES.COMMITTED]: {
        name: 'Committed Relationship',
        icon: 'HEART',
        color: '#c89880',
        displayName: 'Serious Relationship',
        pastTense: 'was in a relationship with',
        presentTense: 'is in a relationship with',
        category: 'ROMANTIC',
        canHaveAttributes: true,
        exclusiveAttributeGroups: ['LEGAL_STATUS', 'VISIBILITY', 'STRUCTURE']
    },
    [window.RELATIONSHIP_ARCHETYPES.FRIENDSHIP]: {
        name: 'Friendship',
        icon: 'FRIENDSHIP',
        color: '#6a9ecf',
        displayName: 'Friendship',
        pastTense: 'was friends with',
        presentTense: 'is friends with',
        category: 'SOCIAL',
        canHaveAttributes: false
    },
    [window.RELATIONSHIP_ARCHETYPES.RIVALRY]: {
        name: 'Rivalry',
        icon: 'SWORD',
        color: '#c84444',
        displayName: 'Rivalry',
        pastTense: 'was rivals with',
        presentTense: 'is rivals with',
        category: 'SOCIAL',
        canHaveAttributes: false
    },
    [window.RELATIONSHIP_ARCHETYPES.ENMITY]: {
        name: 'Enmity',
        icon: 'X_HEAVY',
        color: '#5a2a2a',
        displayName: 'Blood Feud',
        pastTense: 'was enemies with',
        presentTense: 'is enemies with',
        category: 'SOCIAL',
        canHaveAttributes: false
    },
    [window.RELATIONSHIP_ARCHETYPES.APPRENTICESHIP]: {
        name: 'Apprenticeship',
        icon: 'CIRCLE_DOT',
        color: '#4a9060',
        displayName: 'Apprenticeship',
        pastTense: 'was apprenticed to',
        presentTense: 'is apprenticed to',
        category: 'PROFESSIONAL',
        canHaveAttributes: false
    },
    [window.RELATIONSHIP_ARCHETYPES.MASTERSHIP]: {
        name: 'Mastership',
        icon: 'CIRCLE_DOT',
        color: '#2a6e40',
        displayName: 'Master-Expert Relationship',
        pastTense: 'was master to',
        presentTense: 'is master to',
        category: 'PROFESSIONAL',
        canHaveAttributes: false
    },
    [window.RELATIONSHIP_ARCHETYPES.EMPLOYMENT]: {
        name: 'Employment',
        icon: 'CIRCLE_DOT',
        color: '#8a6e4a',
        displayName: 'Employment',
        pastTense: 'was employed by',
        presentTense: 'is employed by',
        category: 'PROFESSIONAL',
        canHaveAttributes: false
    },
    [window.RELATIONSHIP_ARCHETYPES.GUILD_MEMBERSHIP]: {
        name: 'Guild Membership',
        icon: 'CIRCLE_DOT',
        color: '#6a7e8a',
        displayName: 'Guild Membership',
        pastTense: 'was a guild member of',
        presentTense: 'is a guild member of',
        category: 'PROFESSIONAL',
        canHaveAttributes: false
    },
    [window.RELATIONSHIP_ARCHETYPES.PARENT_CHILD]: {
        name: 'Parent-Child',
        icon: 'PERSON',
        color: '#6a8e6a',
        displayName: 'Parent-Child Relationship',
        pastTense: 'was parent to',
        presentTense: 'is parent of',
        category: 'FAMILY',
        canHaveAttributes: false,
        autoGeneratedOnly: true
    },
    [window.RELATIONSHIP_ARCHETYPES.SIBLING]: {
        name: 'Sibling',
        icon: 'CIRCLE_DOT',
        color: '#6a8e6a',
        displayName: 'Sibling Relationship',
        pastTense: 'was sibling to',
        presentTense: 'is sibling of',
        category: 'FAMILY',
        canHaveAttributes: false,
        autoGeneratedOnly: true
    },
    [window.RELATIONSHIP_ARCHETYPES.GRANDPARENT]: {
        name: 'Grandparent',
        icon: 'CIRCLE_DOT',
        color: '#7a9e7a',
        displayName: 'Grandparent-Grandchild',
        pastTense: 'was grandparent to',
        presentTense: 'is grandparent of',
        category: 'FAMILY',
        canHaveAttributes: false,
        autoGeneratedOnly: true
    },
    [window.RELATIONSHIP_ARCHETYPES.AUNT_UNCLE]: {
        name: 'Aunt/Uncle',
        icon: 'CIRCLE_DOT',
        color: '#7a9e7a',
        displayName: 'Aunt/Uncle-Niece/Nephew',
        pastTense: 'was aunt/uncle to',
        presentTense: 'is aunt/uncle of',
        category: 'FAMILY',
        canHaveAttributes: false,
        autoGeneratedOnly: true
    },
    [window.RELATIONSHIP_ARCHETYPES.COUSIN]: {
        name: 'Cousin',
        icon: 'CIRCLE_DOT',
        color: '#8aae8a',
        displayName: 'Cousin Relationship',
        pastTense: 'was cousin to',
        presentTense: 'is cousin of',
        category: 'FAMILY',
        canHaveAttributes: false,
        autoGeneratedOnly: true
    }
};

// =============================================================================
// 5. ATTRIBUTE METADATA
// =============================================================================

window.RELATIONSHIP_ATTRIBUTE_METADATA = {
    [window.RELATIONSHIP_ATTRIBUTES.MARRIED]: {
        name: 'Married',
        icon: 'MARRIAGE',
        color: '#c89880',
        description: 'Legally and religiously married',
        group: 'LEGAL_STATUS',
        priority: 10
    },
    [window.RELATIONSHIP_ATTRIBUTES.HANDFASTED]: {
        name: 'Handfasted',
        icon: 'CIRCLE_DOT',
        color: '#b08868',
        description: 'Common-law marriage (year and a day)',
        group: 'LEGAL_STATUS',
        priority: 9
    },
    [window.RELATIONSHIP_ATTRIBUTES.ENGAGED]: {
        name: 'Engaged',
        icon: 'ENGAGEMENT',
        color: '#d4a060',
        description: 'Betrothed, promised to marry',
        group: 'LEGAL_STATUS',
        priority: 8
    },
    [window.RELATIONSHIP_ATTRIBUTES.COHABITING]: {
        name: 'Cohabiting',
        icon: 'HOME',
        color: '#a08868',
        description: 'Living together without formal marriage',
        group: 'LEGAL_STATUS',
        priority: 7
    },
    [window.RELATIONSHIP_ATTRIBUTES.CIVIL_UNION]: {
        name: 'Civil Union',
        icon: 'CIRCLE_DOT',
        color: '#988878',
        description: 'Legal recognition without religious ceremony',
        group: 'LEGAL_STATUS',
        priority: 6
    },
    [window.RELATIONSHIP_ATTRIBUTES.POLYAMOROUS]: {
        name: 'Polyamorous',
        icon: 'HEART',
        color: '#c8a0a0',
        description: 'Open to multiple committed relationships',
        group: 'STRUCTURE',
        priority: 5
    },
    [window.RELATIONSHIP_ATTRIBUTES.MONOGAMOUS]: {
        name: 'Monogamous',
        icon: 'CIRCLE_DOT',
        color: '#a0a0c8',
        description: 'Exclusive to one partner',
        group: 'STRUCTURE',
        priority: 5,
        isDefault: true
    },
    [window.RELATIONSHIP_ATTRIBUTES.ARRANGED]: {
        name: 'Arranged',
        icon: 'CROWN',
        color: '#a0a080',
        description: 'Family-arranged match',
        group: 'ORIGIN',
        priority: 4
    },
    [window.RELATIONSHIP_ATTRIBUTES.LOVE_MATCH]: {
        name: 'Love Match',
        icon: 'HEART',
        color: '#e06060',
        description: 'Based on romantic love',
        group: 'ORIGIN',
        priority: 4
    },
    [window.RELATIONSHIP_ATTRIBUTES.DUTY_MATCH]: {
        name: 'Duty Match',
        icon: 'SHIELD',
        color: '#8080a0',
        description: 'Based on obligation or duty',
        group: 'ORIGIN',
        priority: 4
    },
    [window.RELATIONSHIP_ATTRIBUTES.SECRET]: {
        name: 'Secret',
        icon: 'LOCK',
        color: '#808080',
        description: 'Hidden from society',
        group: 'VISIBILITY',
        priority: 3
    },
    [window.RELATIONSHIP_ATTRIBUTES.PUBLIC]: {
        name: 'Public',
        icon: 'UNLOCK',
        color: '#a0c0a0',
        description: 'Openly acknowledged',
        group: 'VISIBILITY',
        priority: 3,
        isDefault: true
    },
    [window.RELATIONSHIP_ATTRIBUTES.SCANDALOUS]: {
        name: 'Scandalous',
        icon: 'WARNING',
        color: '#d06030',
        description: 'Known and disapproved of',
        group: 'VISIBILITY',
        priority: 3
    },
    [window.RELATIONSHIP_ATTRIBUTES.MORGANATIC]: {
        name: 'Morganatic',
        icon: 'CROWN',
        color: '#b09070',
        description: 'Spouse retains lower rank, children don\'t inherit',
        group: 'SPECIAL',
        priority: 2
    },
    [window.RELATIONSHIP_ATTRIBUTES.LEVITIC]: {
        name: 'Levirate Marriage',
        icon: 'CIRCLE_DOT',
        color: '#8a7a6a',
        description: 'Marriage to brother\'s widow',
        group: 'SPECIAL',
        priority: 2
    },
    [window.RELATIONSHIP_ATTRIBUTES.POSTHUMOUS]: {
        name: 'Posthumous',
        icon: 'CIRCLE_DOT',
        color: '#a0a0a0',
        description: 'Marriage after one partner\'s death (for inheritance)',
        group: 'SPECIAL',
        priority: 1
    }
};

// =============================================================================
// 6. VALIDATION RULES
// =============================================================================

window.DEFAULT_VALIDATION_RULES = {
    minAge: 0,
    maxAgeGap: null,
    requireConsent: false,
    requireWitness: false,
    allowedStatuses: ['ongoing', 'ended']
};

window.RELATIONSHIP_VALIDATION_RULES = {
    [window.RELATIONSHIP_ARCHETYPES.CASUAL_DATING]: {
        minAge: 12,
        requireConsent: true,
        allowedStatuses: ['ongoing', 'ended']
    },
    [window.RELATIONSHIP_ARCHETYPES.ONE_NIGHT_STAND]: {
        minAge: 12,
        requireConsent: true,
        allowedStatuses: ['ongoing', 'ended'],
        expectedMaxDuration: 1
    },
    [window.RELATIONSHIP_ARCHETYPES.COMMITTED]: {
        minAge: 14,
        requireConsent: true,
        allowedStatuses: ['ongoing', 'ended', 'widowed']
    },
    [window.RELATIONSHIP_ARCHETYPES.FRIENDSHIP]: {
        minAge: 5,
        allowedStatuses: ['ongoing', 'ended']
    },
    [window.RELATIONSHIP_ARCHETYPES.RIVALRY]: {
        minAge: 10,
        allowedStatuses: ['ongoing', 'ended']
    },
    [window.RELATIONSHIP_ARCHETYPES.ENMITY]: {
        minAge: 10,
        allowedStatuses: ['ongoing', 'ended']
    },
    [window.RELATIONSHIP_ARCHETYPES.APPRENTICESHIP]: {
        minAge: 7,
        requireMaster: true,
        allowedStatuses: ['ongoing', 'ended', 'completed']
    },
    [window.RELATIONSHIP_ARCHETYPES.MASTERSHIP]: {
        minAge: 18,
        allowedStatuses: ['ongoing', 'ended']
    },
    [window.RELATIONSHIP_ARCHETYPES.EMPLOYMENT]: {
        minAge: 12,
        allowedStatuses: ['ongoing', 'ended']
    },
    [window.RELATIONSHIP_ARCHETYPES.GUILD_MEMBERSHIP]: {
        minAge: 14,
        allowedStatuses: ['ongoing', 'ended']
    },
    [window.RELATIONSHIP_ARCHETYPES.PARENT_CHILD]: {
        minAge: 0,
        autoGeneratedOnly: true,
        allowedStatuses: ['ongoing', 'ended']
    },
    [window.RELATIONSHIP_ARCHETYPES.SIBLING]: {
        minAge: 0,
        autoGeneratedOnly: true,
        allowedStatuses: ['ongoing', 'ended']
    },
    [window.RELATIONSHIP_ARCHETYPES.GRANDPARENT]: {
        minAge: 0,
        autoGeneratedOnly: true,
        allowedStatuses: ['ongoing', 'ended']
    },
    [window.RELATIONSHIP_ARCHETYPES.AUNT_UNCLE]: {
        minAge: 0,
        autoGeneratedOnly: true,
        allowedStatuses: ['ongoing', 'ended']
    },
    [window.RELATIONSHIP_ARCHETYPES.COUSIN]: {
        minAge: 0,
        autoGeneratedOnly: true,
        allowedStatuses: ['ongoing', 'ended']
    }
};

window.ATTRIBUTE_VALIDATION_RULES = {
    [window.RELATIONSHIP_ATTRIBUTES.MARRIED]: {
        minAge: 16,
        requireConsent: true,
        requireWitness: true,
        mutuallyExclusiveWith: ['handfasted', 'cohabiting']
    },
    [window.RELATIONSHIP_ATTRIBUTES.HANDFASTED]: {
        minAge: 14,
        requireConsent: true,
        mutuallyExclusiveWith: ['married', 'engaged']
    },
    [window.RELATIONSHIP_ATTRIBUTES.ENGAGED]: {
        minAge: 12,
        requireConsent: true,
        maxDuration: 2,
        mutuallyExclusiveWith: ['married', 'handfasted', 'cohabiting']
    },
    [window.RELATIONSHIP_ATTRIBUTES.COHABITING]: {
        minAge: 14,
        mutuallyExclusiveWith: ['married', 'handfasted', 'engaged']
    },
    [window.RELATIONSHIP_ATTRIBUTES.CIVIL_UNION]: {
        minAge: 16,
        requireConsent: true,
        mutuallyExclusiveWith: ['married', 'handfasted']
    },
    [window.RELATIONSHIP_ATTRIBUTES.POLYAMOROUS]: {
        requiresDisclosure: true,
        compatibleWith: ['married', 'cohabiting', 'engaged']
    },
    [window.RELATIONSHIP_ATTRIBUTES.SECRET]: {
        compatibleWith: ['polyamorous']
    },
    [window.RELATIONSHIP_ATTRIBUTES.MORGANATIC]: {
        requires: ['married'],
        mutuallyExclusiveWith: ['polyamorous']
    },
    [window.RELATIONSHIP_ATTRIBUTES.LEVITIC]: {
        requires: ['married'],
        mutuallyExclusiveWith: ['love_match']
    }
};

window.ATTRIBUTE_GROUPS = {
    LEGAL_STATUS: {
        name: 'Legal Status',
        mutuallyExclusive: true,
        default: null
    },
    STRUCTURE: {
        name: 'Structure',
        mutuallyExclusive: true,
        default: window.RELATIONSHIP_ATTRIBUTES.MONOGAMOUS
    },
    ORIGIN: {
        name: 'Origin',
        mutuallyExclusive: false,
        default: null
    },
    VISIBILITY: {
        name: 'Visibility',
        mutuallyExclusive: true,
        default: window.RELATIONSHIP_ATTRIBUTES.PUBLIC
    },
    SPECIAL: {
        name: 'Special Circumstances',
        mutuallyExclusive: false,
        default: null
    }
};

// =============================================================================
// 7. DIRECTIONAL MAPPINGS
// =============================================================================

window.RELATIONSHIP_DIRECTIONAL_MAPPINGS = {
    [window.RELATIONSHIP_ARCHETYPES.APPRENTICESHIP]: {
        reverseType: window.RELATIONSHIP_ARCHETYPES.MASTERSHIP
    },
    [window.RELATIONSHIP_ARCHETYPES.MASTERSHIP]: {
        reverseType: window.RELATIONSHIP_ARCHETYPES.APPRENTICESHIP
    },
    [window.RELATIONSHIP_ARCHETYPES.EMPLOYMENT]: {
        reverseType: window.RELATIONSHIP_ARCHETYPES.EMPLOYMENT
    },
    [window.RELATIONSHIP_ARCHETYPES.PARENT_CHILD]: {
        reverseType: window.RELATIONSHIP_ARCHETYPES.PARENT_CHILD
    },
    [window.RELATIONSHIP_ARCHETYPES.GRANDPARENT]: {
        reverseType: window.RELATIONSHIP_ARCHETYPES.GRANDPARENT
    },
    [window.RELATIONSHIP_ARCHETYPES.AUNT_UNCLE]: {
        reverseType: window.RELATIONSHIP_ARCHETYPES.AUNT_UNCLE
    },
    [window.RELATIONSHIP_ARCHETYPES.COUSIN]: {
        reverseType: window.RELATIONSHIP_ARCHETYPES.COUSIN
    }
};

// =============================================================================
// 8. HELPER FUNCTIONS
// =============================================================================

window.getValidationRulesForArchetype = function(archetype) {
    var specific = window.RELATIONSHIP_VALIDATION_RULES[archetype] || {};
    return Object.assign({}, window.DEFAULT_VALIDATION_RULES, specific);
};

window.getDefaultValidationRules = function() {
    return Object.assign({}, window.DEFAULT_VALIDATION_RULES);
};

window.isValidStatusTransition = function(fromStatus, toStatus) {
    var allowed = window.RELATIONSHIP_STATUS_TRANSITIONS[fromStatus];
    return allowed ? allowed.indexOf(toStatus) !== -1 : false;
};

window.isValidAgeForArchetype = function(archetype, age) {
    var rules = window.getValidationRulesForArchetype(archetype);
    return age >= rules.minAge;
};

window.isAgeGapValid = function(archetype, age1, age2) {
    var rules = window.getValidationRulesForArchetype(archetype);
    var maxAgeGap = rules.maxAgeGap;
    if (maxAgeGap === null || maxAgeGap === undefined) return true;
    return Math.abs(age1 - age2) <= maxAgeGap;
};

window.getArchetypeName = function(archetype) {
    var meta = window.RELATIONSHIP_ARCHETYPE_METADATA[archetype];
    return meta ? meta.name : (archetype ? archetype.charAt(0).toUpperCase() + archetype.slice(1) : archetype);
};

window.getArchetypeIcon = function(archetype) {
    var meta = window.RELATIONSHIP_ARCHETYPE_METADATA[archetype];
    return meta ? meta.icon : 'CIRCLE_DOT';
};

window.getArchetypeColor = function(archetype) {
    var meta = window.RELATIONSHIP_ARCHETYPE_METADATA[archetype];
    return meta ? meta.color : '#888888';
};

window.canHaveAttributes = function(archetype) {
    var meta = window.RELATIONSHIP_ARCHETYPE_METADATA[archetype];
    return meta ? meta.canHaveAttributes : false;
};

window.isAutoGeneratedOnly = function(archetype) {
    var meta = window.RELATIONSHIP_ARCHETYPE_METADATA[archetype];
    return meta ? meta.autoGeneratedOnly : false;
};

window.getAttributeName = function(attribute) {
    var meta = window.RELATIONSHIP_ATTRIBUTE_METADATA[attribute];
    return meta ? meta.name : (attribute ? attribute.charAt(0).toUpperCase() + attribute.slice(1) : attribute);
};

window.getAttributeIcon = function(attribute) {
    var meta = window.RELATIONSHIP_ATTRIBUTE_METADATA[attribute];
    return meta ? meta.icon : 'CIRCLE_DOT';
};

window.getAttributeColor = function(attribute) {
    var meta = window.RELATIONSHIP_ATTRIBUTE_METADATA[attribute];
    return meta ? meta.color : '#888888';
};

window.getAttributeGroup = function(attribute) {
    var meta = window.RELATIONSHIP_ATTRIBUTE_METADATA[attribute];
    return meta ? meta.group : null;
};

window.areAttributesCompatible = function(attributes) {
    var conflicts = [];
    var groupsRepresented = {};
    
    for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        var rules = window.ATTRIBUTE_VALIDATION_RULES[attr];
        
        if (rules && rules.mutuallyExclusiveWith) {
            for (var j = 0; j < attributes.length; j++) {
                var other = attributes[j];
                if (other !== attr && rules.mutuallyExclusiveWith.indexOf(other) !== -1) {
                    conflicts.push(attr + ' is mutually exclusive with ' + other);
                }
            }
        }
        
        if (rules && rules.requires) {
            for (var k = 0; k < rules.requires.length; k++) {
                var required = rules.requires[k];
                if (attributes.indexOf(required) === -1) {
                    conflicts.push(attr + ' requires ' + required);
                }
            }
        }
        
        var group = window.getAttributeGroup(attr);
        if (group && window.ATTRIBUTE_GROUPS[group] && window.ATTRIBUTE_GROUPS[group].mutuallyExclusive) {
            if (groupsRepresented[group]) {
                conflicts.push('Multiple attributes from mutually exclusive group ' + group + ': ' + groupsRepresented[group] + ' and ' + attr);
            } else {
                groupsRepresented[group] = attr;
            }
        }
    }
    
    return { valid: conflicts.length === 0, conflicts: conflicts };
};

window.isAttributeValidForArchetype = function(archetype, attribute) {
    if (archetype !== window.RELATIONSHIP_ARCHETYPES.COMMITTED) return false;
    return !!window.RELATIONSHIP_ATTRIBUTE_METADATA[attribute];
};

window.getMarriageStatus = function(attributes) {
    var marriageAttrs = ['married', 'handfasted', 'engaged', 'cohabiting', 'civil_union'];
    for (var i = 0; i < marriageAttrs.length; i++) {
        if (attributes.indexOf(marriageAttrs[i]) !== -1) return marriageAttrs[i];
    }
    return null;
};

window.getAllowedAttributes = function() {
    var attrs = [];
    for (var key in window.RELATIONSHIP_ATTRIBUTES) {
        attrs.push(window.RELATIONSHIP_ATTRIBUTES[key]);
    }
    return attrs;
};

window.getRelationshipCategory = function(archetype) {
    var meta = window.RELATIONSHIP_ARCHETYPE_METADATA[archetype];
    return meta ? meta.category : null;
};

window.getArchetypesByCategory = function(category) {
    var result = [];
    for (var key in window.RELATIONSHIP_ARCHETYPE_METADATA) {
        if (window.RELATIONSHIP_ARCHETYPE_METADATA[key].category === category) {
            result.push(key);
        }
    }
    return result;
};

window.getAllRelationshipCategories = function() {
    var categories = {};
    for (var key in window.RELATIONSHIP_ARCHETYPE_METADATA) {
        var cat = window.RELATIONSHIP_ARCHETYPE_METADATA[key].category;
        if (cat) categories[cat] = true;
    }
    return Object.keys(categories);
};

window.getRelationshipStatusName = function(status) {
    var names = {
        ongoing: 'Active',
        ended: 'Ended',
        widowed: 'Widowed',
        pending: 'Pending',
        proposed: 'Proposed',
        declined: 'Declined'
    };
    return names[status] || status;
};

window.getRelationshipStatusIcon = function(status) {
    var icons = {
        ongoing: 'CIRCLE_DOT',
        ended: 'X_HEAVY',
        widowed: 'CIRCLE_DOT',
        pending: 'CIRCLE_DOT',
        proposed: 'CIRCLE_DOT',
        declined: 'X_HEAVY'
    };
    return icons[status] || 'CIRCLE_DOT';
};

window.getAllArchetypes = function() {
    var result = [];
    for (var key in window.RELATIONSHIP_ARCHETYPES) {
        if (window.RELATIONSHIP_ARCHETYPES.hasOwnProperty(key)) {
            result.push(window.RELATIONSHIP_ARCHETYPES[key]);
        }
    }
    return result;
};

window.getAllAttributes = function() {
    var result = [];
    for (var key in window.RELATIONSHIP_ATTRIBUTES) {
        if (window.RELATIONSHIP_ATTRIBUTES.hasOwnProperty(key)) {
            result.push(window.RELATIONSHIP_ATTRIBUTES[key]);
        }
    }
    return result;
};

window.getAllRelationshipStatuses = function() {
    var result = [];
    for (var key in window.RELATIONSHIP_STATUS) {
        if (window.RELATIONSHIP_STATUS.hasOwnProperty(key)) {
            result.push(window.RELATIONSHIP_STATUS[key]);
        }
    }
    return result;
};

window.getAttributeValidationRules = function(attribute) {
    return window.ATTRIBUTE_VALIDATION_RULES[attribute] || null;
};

window.getAttributeGroups = function() {
    return Object.assign({}, window.ATTRIBUTE_GROUPS);
};

window.getMirroredRelationshipType = function(archetype) {
    var mapping = window.RELATIONSHIP_DIRECTIONAL_MAPPINGS[archetype];
    return mapping ? mapping.reverseType : archetype;
};

window.isDirectionalRelationship = function(archetype) {
    return !!window.RELATIONSHIP_DIRECTIONAL_MAPPINGS[archetype];
};

window.migrateLegacyRelationshipType = function(legacyType) {
    var attributes = [];
    var archetype = window.RELATIONSHIP_ARCHETYPES.COMMITTED;
    
    switch(legacyType) {
        case 'marriage':
            attributes.push('married');
            break;
        case 'polygynous':
            attributes.push('married', 'polyamorous');
            break;
        case 'betrothal':
            attributes.push('engaged');
            break;
        case 'affair':
            archetype = window.RELATIONSHIP_ARCHETYPES.COMMITTED;
            attributes.push('secret');
            break;
        case 'romance':
            archetype = window.RELATIONSHIP_ARCHETYPES.COMMITTED;
            break;
        case 'casual':
            archetype = window.RELATIONSHIP_ARCHETYPES.CASUAL_DATING;
            break;
        case 'friendship':
            archetype = window.RELATIONSHIP_ARCHETYPES.FRIENDSHIP;
            break;
        case 'rivalry':
            archetype = window.RELATIONSHIP_ARCHETYPES.RIVALRY;
            break;
        case 'enmity':
            archetype = window.RELATIONSHIP_ARCHETYPES.ENMITY;
            break;
        case 'apprenticeship':
            archetype = window.RELATIONSHIP_ARCHETYPES.APPRENTICESHIP;
            break;
        case 'mastership':
            archetype = window.RELATIONSHIP_ARCHETYPES.MASTERSHIP;
            break;
        case 'employment':
            archetype = window.RELATIONSHIP_ARCHETYPES.EMPLOYMENT;
            break;
        default:
            archetype = legacyType;
    }
    
    return { archetype: archetype, attributes: attributes };
};