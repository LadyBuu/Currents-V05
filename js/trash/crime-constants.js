/**
 * STILL WATERS - Crime Constants
 * Crime types, severity, punishments, reasons, execution methods.
 * Owned by the crime domain.
 */
(function() {
    'use strict';

    window.CRIME_TYPES = Object.freeze({
        MURDER: 'murder',
        EXECUTION: 'execution',
        CRIME_OF_PASSION: 'crime_of_passion',
        ADULTERY: 'adultery',
        TREASON: 'treason',
        THEFT: 'theft',
        ESPIONAGE: 'espionage',
        BLASPHEMY: 'blasphemy',
        WITCHCRAFT: 'witchcraft',
        ASSAULT: 'assault',
        VENDETTA: 'vendetta',
        VIOLENCE: 'violence',
        ROBBERY: 'robbery',
        FRAUD: 'fraud',
        FORGERY: 'forgery',
        SMUGGLING: 'smuggling'
    });

    window.CRIME_SEVERITY = Object.freeze({
        [window.CRIME_TYPES.THEFT]: 3,
        [window.CRIME_TYPES.ROBBERY]: 5,
        [window.CRIME_TYPES.FRAUD]: 4,
        [window.CRIME_TYPES.FORGERY]: 4,
        [window.CRIME_TYPES.SMUGGLING]: 5,
        [window.CRIME_TYPES.ASSAULT]: 5,
        [window.CRIME_TYPES.ADULTERY]: 7,
        [window.CRIME_TYPES.BLASPHEMY]: 8,
        [window.CRIME_TYPES.WITCHCRAFT]: 9,
        [window.CRIME_TYPES.ESPIONAGE]: 9,
        [window.CRIME_TYPES.CRIME_OF_PASSION]: 8,
        [window.CRIME_TYPES.VIOLENCE]: 6,
        [window.CRIME_TYPES.TREASON]: 10,
        [window.CRIME_TYPES.MURDER]: 10,
        [window.CRIME_TYPES.VENDETTA]: 9
    });

    window.CRIME_PUNISHMENTS = Object.freeze({
        [window.CRIME_TYPES.THEFT]: Object.freeze(['Fine', 'Branding', 'Maiming', 'Execution']),
        [window.CRIME_TYPES.ROBBERY]: Object.freeze(['Fine', 'Maiming', 'Exile', 'Execution']),
        [window.CRIME_TYPES.FRAUD]: Object.freeze(['Fine', 'Branding', 'Exile']),
        [window.CRIME_TYPES.FORGERY]: Object.freeze(['Fine', 'Maiming', 'Execution']),
        [window.CRIME_TYPES.SMUGGLING]: Object.freeze(['Fine', 'Exile', 'Execution']),
        [window.CRIME_TYPES.ASSAULT]: Object.freeze(['Fine', 'Maiming', 'Exile', 'Execution']),
        [window.CRIME_TYPES.ADULTERY]: Object.freeze(['Fine', 'Public Shaming', 'Exile', 'Execution']),
        [window.CRIME_TYPES.BLASPHEMY]: Object.freeze(['Fine', 'Public Shaming', 'Exile', 'Execution']),
        [window.CRIME_TYPES.WITCHCRAFT]: Object.freeze(['Exile', 'Execution', 'Imprisonment']),
        [window.CRIME_TYPES.ESPIONAGE]: Object.freeze(['Execution', 'Imprisonment', 'Exile']),
        [window.CRIME_TYPES.CRIME_OF_PASSION]: Object.freeze(['Exile', 'Execution', 'Life Service']),
        [window.CRIME_TYPES.VIOLENCE]: Object.freeze(['Fine', 'Maiming', 'Exile']),
        [window.CRIME_TYPES.TREASON]: Object.freeze(['Execution', 'Life Imprisonment', 'Exile']),
        [window.CRIME_TYPES.MURDER]: Object.freeze(['Execution', 'Exile', 'Blood Price', 'Life Imprisonment']),
        [window.CRIME_TYPES.VENDETTA]: Object.freeze(['Execution', 'Exile', 'Blood Feud'])
    });

    window.MURDER_REASONS = Object.freeze({
        political: Object.freeze([
            "Political rivalry", "Treason", "Espionage", "Succession dispute",
            "Religious conflict", "Rebellion", "Coup attempt", "Court intrigue"
        ]),
        personal: Object.freeze([
            "Personal vendetta", "Jealousy", "Revenge", "Crime of passion",
            "Honor killing", "Blood feud", "Love triangle", "Family dispute",
            "Betrayal", "Insult or dishonor"
        ]),
        criminal: Object.freeze([
            "Robbery gone wrong", "Contract killing", "Gang violence",
            "Land dispute", "Inheritance dispute", "Debt collection gone wrong",
            "Banditry", "Rivalry between criminals"
        ]),
        accidental: Object.freeze([
            "Self-defense gone wrong", "Accidental killing", "Mistaken identity",
            "Hunting accident", "Bar fight gone wrong", "Drunken brawl", "Negligence"
        ]),
        affair: Object.freeze([
            "Crime of passion - lover's quarrel", "Spouse discovered affair",
            "Lover murdered by jealous spouse", "Affair partner eliminated for secrecy",
            "Blackmail from affair gone wrong", "Love triangle murder", "Murder to legitimize affair"
        ]),
        conflict: Object.freeze([
            "Escalated from argument", "Escalated from dispute", "Escalated from confrontation",
            "Escalated from physical fight", "Feud escalation"
        ]),
        other: Object.freeze([
            "Madness or insanity", "Fear of exposure", "Silencing a witness",
            "Impersonation", "Unknown perpetrator", "Duel to the death"
        ])
    });

    window.EXECUTION_REASONS = Object.freeze({
        treason: Object.freeze([
            "Treason against the Crown", "Regicide", "Rebellion or Insurrection",
            "Revolutionary activity", "Coup attempt", "Conspiracy against the state"
        ]),
        murder: Object.freeze([
            "Murder of a noble", "Murder of a clergy member", "Murder of a child",
            "Multiple murders", "Particularly brutal murder", "Premeditated murder",
            "Political assassination"
        ]),
        adultery: Object.freeze([
            "Adultery with a noble's spouse", "Adultery with clergy", "Repeated adultery",
            "Adultery resulting in bastard child", "Adultery during mourning period"
        ]),
        crime: Object.freeze([
            "Highway robbery", "Counterfeiting currency", "Arson", "Espionage or spying",
            "Piracy", "Smuggling", "Large-scale theft"
        ]),
        military: Object.freeze([
            "Desertion from military", "Cowardice in battle", "Insubordination",
            "Abandoning post in battle", "Treasonous collaboration"
        ]),
        religious: Object.freeze([
            "Blasphemy", "Sacrilege", "Witchcraft or sorcery", "Heresy",
            "Violation of sacred grounds", "Breaking a blood oath"
        ]),
        social: Object.freeze([
            "Violation of sacred taboos", "Disrespecting a ruler or chief", "Incest",
            "Breaking social customs", "Dueling (illegal)"
        ]),
        common: Object.freeze([
            "Murder", "Treason", "Rebellion", "Adultery", "Witchcraft",
            "Cowardice in battle", "Desertion", "Espionage", "Blasphemy"
        ])
    });

    window.EXECUTION_METHODS = Object.freeze({
        beheading: Object.freeze({ id: 'beheading', name: 'Beheading', description: 'Death by decapitation using sword or axe' }),
        hanging: Object.freeze({ id: 'hanging', name: 'Hanging', description: 'Death by hanging from a gallows' }),
        burning: Object.freeze({ id: 'burning', name: 'Burning at the Stake', description: 'Death by fire at a stake' }),
        breaking_wheel: Object.freeze({ id: 'breaking_wheel', name: 'Breaking Wheel', description: 'Death by breaking on a wheel' }),
        quartering: Object.freeze({ id: 'quartering', name: 'Drawing and Quartering', description: 'Death by being drawn and quartered' }),
        drowning: Object.freeze({ id: 'drowning', name: 'Drowning', description: 'Death by drowning' }),
        stoning: Object.freeze({ id: 'stoning', name: 'Stoning', description: 'Death by being stoned by the community' }),
        crushing: Object.freeze({ id: 'crushing', name: 'Crushing', description: 'Death by being crushed with weights' }),
        boiling: Object.freeze({ id: 'boiling', name: 'Boiling Alive', description: 'Death by being boiled in oil or water' }),
        impaling: Object.freeze({ id: 'impaling', name: 'Impaling', description: 'Death by being impaled on a stake' }),
        guillotine: Object.freeze({ id: 'guillotine', name: 'Guillotine', description: 'Death by guillotine' }),
        firing_squad: Object.freeze({ id: 'firing_squad', name: 'Firing Squad', description: 'Death by gunfire from a firing squad' }),
        exposure: Object.freeze({ id: 'exposure', name: 'Exposure', description: 'Death by exposure to elements' }),
        starvation: Object.freeze({ id: 'starvation', name: 'Starvation', description: 'Death by starvation in a cell' })
    });

    window.VENDETTA_STATUS = Object.freeze({
        ACTIVE: 'active',
        DORMANT: 'dormant',
        ESCALATED: 'escalated',
        RESOLVED: 'resolved'
    });
})();
