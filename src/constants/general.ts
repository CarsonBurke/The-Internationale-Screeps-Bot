// This file should not have any imports to avoid circular dependencies

export enum PlayerRelationships {
  ally,
  enemy,
  noAggression,
}

export enum PlayerMemoryKeys {
  /**
   * Generally how good their offense is
   */
  offensiveThreat,
  /**
   * Generally how good their defense is
   */
  defensiveStrength,
  /**
   * How much we want them dead
   */
  hate,
  /**
   * The last time we were attacked by them
   */
  lastAttackedBy,
  /**
   * the positive, non-zero value for which to weight enemy exit retreat threat
   */
  rangeFromExitWeight,
  relationship,
  /**
   * The positive reputation we've determined for the player.
   * Effects response to ally requests and such
   */
  reputation,
  /**
   * The last time this player was seen. Used for garbage collection, to remove old players
   */
  lastSeen,
}

export const playerDecayKeys = new Set([
  PlayerMemoryKeys.offensiveThreat,
  PlayerMemoryKeys.defensiveStrength,
  PlayerMemoryKeys.hate,
])

export enum WorkRequestKeys {
  claimer,
  vanguard,
  abandon,
  responder,
  priority,
  allyVanguard,
  forAlly,
  hauler,
}

export enum HaulRequestKeys {
  type,
  distance,
  timer,
  priority,
  abandon,
  responder,
}

export enum NukeRequestKeys {
  x,
  y,
  responder,
  priority,
}

export enum DepositRequestKeys {
  depositHarvester,
  depositHauler,
  abandon,
  responder,
  /**
   * The type of resource the deposit provides
   */
  type,
}

export enum CombatRequestKeys {
  abandon,
  rangedAttack,
  attack,
  dismantle,
  downgrade,
  minDamage,
  minMeleeHeal,
  minRangedHeal,
  maxTowerDamage,
  quads,
  priority,
  quadQuota,
  inactionTimerMax,
  inactionTimer,
  maxThreat,
  abandonments,
  /**
   * The type of attack request
   */
  type,
  responder,
  dynamicSquads,
  dynamicSquadQuota,
}

export enum CreepLogisticsRequestKeys {
  type,
  target,
  resourceType,
  amount,
  onlyFull,
  noReserve,
  /**
   * true if there is a delivery request. Should be the following request in the creep's logistics queue
   */
  delivery,
}

export enum RoomLogisticsRequestTypes {
  /**
   * Asks for resources to be transferred
   */
  transfer,
  /**
   * Asks for resources to be withdrawn
   */
  withdraw,
  /**
   * A dropped resource asking to be picked up
   */
  pickup,
  /**
   * Offering to be picked up but not trying to get rid of the resource
   */
  offer,
}

export enum SleepFor {
  any,
  move,
}

export enum CreepMemoryKeys {
  commune,
  preferRoads,
  sourceIndex,
  dying,
  packedCoord,
  path,
  goalPos,
  usedPathForGoal,
  lastCache,
  structureTarget,
  remote,
  scoutTarget,
  signTarget,
  roomLogisticsRequests,
  needsResources,
  squadSize,
  squadType,
  squadCombatType,
  isSquadFormed,
  squadMembers,
  quadBulldozeTargets,
  haulRequest,
  ticksWaited,
  recycleTarget,
  rampartOnlyShoving,
  rampartTarget,
  taskRoom,
  getPulled,
  combatRequest,
  workRequest,
  flee,
  squadMoveType,
  sleepFor,
  sleepTime,
  targetID,
  previousRelayer,
  stationary,
  defaultParts,
  cost,
  task,

  // Power Creep

  powerTask,
}

export enum CreepTaskKeys {
  taskName,
  target,
  roomName,
}

export enum CreepTaskNames {
  // Creep

  // harvestMineral,

  // Power Creep

  advancedGenerateOps,
  advancedEnablePower,
  advancedRenew,
  transferOps,
}

export enum CreepPowerTaskKeys {
  taskName,
  target,
  power,
  roomName,
}

export enum RoomTypes {
  commune,
  ally,
  neutral,
  enemy,
  sourceKeeper,
  center,
  highway,
  intersection,
}

export enum RoomStatusKeys {
  normal,
  closed,
  novice,
  respawn,
}

export enum RoomMemoryKeys {
  type,
  lastScout,
  /**
   * Tells (mostly civilians) if the room is safe (non-undefined number) and what tick it will refresh
   */
  danger,
  status,

  // Types specific

  owner,
  RCL,
  powerEnabled,
  constructionSiteTarget,
  stampAnchors,
  roadQuota,
  communeSources,
  communeSourceHarvestPositions,
  communeSourcePaths,
  mineralPath,
  mineralPositions,
  centerUpgradePos,
  upgradePositions,
  upgradePath,
  basePlans,
  rampartPlans,
  mineral,
  mineralType,
  /**
   * A valuation of base plan score. Lower is better
   */
  score,
  /**
   * A valuation of base plan score with changing variables. Lower is better
   */
  dynamicScore,
  dynamicScoreUpdate,
  communePlanned,
  portalsTo,
  sourceCoords,
  controllerCoord,

  // Commune

  remotes,
  powerBanks,
  deposits,
  workRequest,
  combatRequests,
  haulRequests,
  nukeRequest,
  threatened,
  lastAttackedBy,
  /**
   * The ideal cost for haulers, not rounded or bounded by the room's spawn energy capacity
   */
  minHaulerCost,
  minHaulerCostUpdate,
  greatestRCL,
  /**
   * Wether or not we are trying to have the room go from commune to neutral
   */
  abandonCommune,
  marketData,
  factoryProduct,
  factoryUsableResources,

  // Remote

  commune,
  maxSourceIncome,
  remoteSourceHarvesters,
  haulers,
  remoteReservers,
  remoteCoreAttacker,
  remoteBuilder,
  remoteDismantler,
  abandonRemote,
  recursedAbandonment,
  disable,
  disableSources,
  enemyReserved,
  invaderCore,
  disableCachedPaths,
  remotePlanned,
  remoteStampAnchors,
  remoteControllerPath,
  remoteControllerPositions,
  remoteSources,
  remoteSourceHarvestPositions,
  remoteSourceFastFillerPaths,
  remoteSourceHubPaths,
  clearedEnemyStructures,
  lastStructureCheck,
  roads,
  remoteSourceCredit,
  remoteSourceCreditChange,
  remoteSourceCreditReservation,
  hasContainer,
  /**
   * The names of the rooms the remote has paths through to get to the commune
   */
  pathsThrough,
  /**
   * Someone ostensibly or actually using the remote that isn't us
   */
  remoter,

  // Ally

  // Enemy

  terminal,
  towers,
  energy,
  defensiveStrength,
  offensiveThreat,

  // Source Keeper

  keeperLairCoords,
}

export type RemoteResourcePathTypes =
  | RoomMemoryKeys.remoteSourceFastFillerPaths
  | RoomMemoryKeys.remoteSourceHubPaths

// General

export const mmoShardNames = new Set(['shard0', 'shard1', 'shard2', 'shard3'])

export const roomTypeProperties: Set<keyof RoomMemory> = new Set([
  // Commune

  RoomMemoryKeys.remotes,
  RoomMemoryKeys.deposits,
  RoomMemoryKeys.powerBanks,
  RoomMemoryKeys.minHaulerCost,
  RoomMemoryKeys.minHaulerCostUpdate,
  RoomMemoryKeys.threatened,
  RoomMemoryKeys.lastAttackedBy,
  RoomMemoryKeys.abandonCommune,
  RoomMemoryKeys.score,
  RoomMemoryKeys.dynamicScore,
  RoomMemoryKeys.dynamicScoreUpdate,
  RoomMemoryKeys.clearedEnemyStructures,

  // Neutral

  RoomMemoryKeys.commune,
  RoomMemoryKeys.remoteSourceFastFillerPaths,
  RoomMemoryKeys.remoteSourceHubPaths,
  RoomMemoryKeys.remoteSourceCredit,
  RoomMemoryKeys.remoteSourceCreditChange,
  RoomMemoryKeys.remoteSourceCreditReservation,
  RoomMemoryKeys.abandonRemote,
  RoomMemoryKeys.recursedAbandonment,
  RoomMemoryKeys.pathsThrough,
  RoomMemoryKeys.disableSources,
  RoomMemoryKeys.remoter,

  // Ally and Enemy

  RoomMemoryKeys.owner,
  RoomMemoryKeys.RCL,

  // Enemy

  RoomMemoryKeys.powerEnabled,
  RoomMemoryKeys.towers,
  RoomMemoryKeys.terminal,
  RoomMemoryKeys.energy,
  RoomMemoryKeys.offensiveThreat,
  RoomMemoryKeys.defensiveStrength,
])

export const roomTypes: Record<RoomTypes, Set<keyof RoomMemory>> = {
  [RoomTypes.commune]: new Set([
    RoomMemoryKeys.remotes,
    RoomMemoryKeys.deposits,
    RoomMemoryKeys.powerBanks,
    RoomMemoryKeys.minHaulerCost,
    RoomMemoryKeys.minHaulerCostUpdate,
    RoomMemoryKeys.threatened,
    RoomMemoryKeys.lastAttackedBy,
    RoomMemoryKeys.abandonCommune,
    RoomMemoryKeys.score,
    RoomMemoryKeys.dynamicScore,
    RoomMemoryKeys.dynamicScoreUpdate,
    RoomMemoryKeys.clearedEnemyStructures,
    RoomMemoryKeys.workRequest,
    RoomMemoryKeys.combatRequests,
    RoomMemoryKeys.haulRequests,
    RoomMemoryKeys.mineral,
    RoomMemoryKeys.greatestRCL,
  ]),
  [RoomTypes.ally]: new Set([RoomMemoryKeys.owner, RoomMemoryKeys.RCL]),
  [RoomTypes.enemy]: new Set([
    RoomMemoryKeys.owner,
    RoomMemoryKeys.RCL,
    RoomMemoryKeys.powerEnabled,
    RoomMemoryKeys.towers,
    RoomMemoryKeys.terminal,
    RoomMemoryKeys.energy,
    RoomMemoryKeys.offensiveThreat,
    RoomMemoryKeys.defensiveStrength,
  ]),
  [RoomTypes.neutral]: new Set([
    RoomMemoryKeys.commune,
    RoomMemoryKeys.remoteSourceFastFillerPaths,
    RoomMemoryKeys.remoteSourceHubPaths,
    RoomMemoryKeys.remoteSourceCredit,
    RoomMemoryKeys.remoteSourceCreditChange,
    RoomMemoryKeys.remoteSourceCreditReservation,
    RoomMemoryKeys.abandonRemote,
    RoomMemoryKeys.recursedAbandonment,
    RoomMemoryKeys.pathsThrough,
  ]),
  [RoomTypes.intersection]: new Set([]),
  [RoomTypes.sourceKeeper]: new Set([RoomMemoryKeys.owner, RoomMemoryKeys.keeperLairCoords]),
  [RoomTypes.center]: new Set([RoomMemoryKeys.owner]),
  [RoomTypes.highway]: new Set([]),
}

export const constantRoomTypes: Set<Partial<RoomTypes>> = new Set([
  RoomTypes.sourceKeeper,
  RoomTypes.center,
  RoomTypes.highway,
  RoomTypes.intersection,
])

export const roomTypesUsedForStats = [RoomTypes.commune, RoomTypes.neutral]

export const creepRoles: CreepRoles[] = [
  'sourceHarvester',
  'hauler',
  'requestHauler',
  'controllerUpgrader',
  'builder',
  'maintainer',
  'mineralHarvester',
  'hubHauler',
  'fastFiller',
  'meleeDefender',
  'rangedDefender',
  'remoteSourceHarvester',
  'remoteReserver',
  'remoteDefender',
  'remoteCoreAttacker',
  'remoteDismantler',
  'remoteBuilder',
  'scout',
  'claimer',
  'vanguard',
  'allyVanguard',
  'antifaRangedAttacker',
  'antifaAttacker',
  'antifaHealer',
  'antifaDismantler',
  'antifaDowngrader',
]

export enum CreepRoleKeys {
  sourceHarvester,
  hauler,
  requestHauler,
  controllerUpgrader,
  builder,
  maintainer,
  mineralHarvester,
  hubHauler,
  fastFiller,
  meleeDefender,
  rangedDefender,
  remoteSourceHarvester,
  remoteReserver,
  remoteDefender,
  remoteCoreAttacker,
  remoteDismantler,
  remoteBuilder,
  scout,
  claimer,
  vanguard,
  allyVanguard,
  antifaRangedAttacker,
  antifaAttacker,
  antifaHealer,
  antifaDismantler,
  antifaDowngrader,
}

/**
 * Roles that will interact with the room logistics system
 */
export const roomLogisticsRoles: Set<CreepRoles> = new Set([
  'sourceHarvester',
  'hauler',
  'builder',
  'maintainer',
  'controllerUpgrader',
  'remoteSourceHarvester',
  'hubHauler',
  'allyVanguard',
])

export const communeCreepRoles: Set<CreepRoles> = new Set([
  'sourceHarvester',
  'builder',
  'maintainer',
  'controllerUpgrader',
  'hubHauler',
  'fastFiller',
  'mineralHarvester',
  'meleeDefender',
  'rangedDefender',
])

export const powerCreepClassNames: PowerClassConstant[] = ['operator']

/**
 * Which role gets priority in which circumstance. Lowest to highest
 */
export enum TrafficPriorities {
  hauler,
  requestHauler,
  scout,
  hubHauler,
  fastFiller,
  sourceHarvester,
  mineralHarvester,
  remoteSourceHarvester,
  remoteCoreAttacker,
  remoteDismantler,
  remoteReserver,
  remoteBuilder,
  vanguard,
  allyVanguard,
  controllerUpgrader,
  builder,
  claimer,
  remoteDefender,
  meleeDefender,
  rangedDefender,
  maintainer,
  antifaDismantler,
  antifaDowngrader,
  antifaHealer,
  antifaAttacker,
  antifaRangedAttacker,
}

export const majorVersion = 2
export const version = `v${majorVersion}.${global.settings.breakingVersion}`

// Set of messages to randomly apply to commune rooms

export const communeSign =
  'A commune of the proletariat. Bourgeoisie not welcome here! Now Collectivized. ' + version

/**
 * Set of messages to randomly apply to non-commune rooms
 */
export const nonCommuneSigns = [
  'The top 1% have more money than the poorest 4.5 billion',
  'McDonalds workers in the US make $10/hour. In Denmark, as a result of unions, they make $22/hour',
  'We have democracy in our policial system, should we not have it in our companies too?',
  'Workers of the world, unite; you have nothing to lose but your chains!',
  'Real democracy requires democracy in the workplace',
  'Adults spend a combined 13 years of their life under a dictatorship: the workplace',
  'Socialism is about worker ownership over the workplace',
  'Are trans women women? Yes.',
  'Advancing the LGBTQ+ agenda <3',
  'Does Jeff Bezos work 56,000 times harder than his average worker? Because he gets paid like it',
  'We already eat from the trashcan all the time. The name of this trash is ideology - Slavoj Zizek',
  'Religion is the opium of the people - Karl Marx',
]

export const tauntSign = '✊🛠️'

/**
 * What to say when one of our creeps dies
 */
export const friendlyDieChants = ['✊', '🛠️']
/**
 * What to say an enemy creep dies
 */
export const enemyDieChants = ['☮️', '❤️']

export const roomDimensions = 50

export const allStructureTypes: StructureConstant[] = [
  STRUCTURE_SPAWN,
  STRUCTURE_EXTENSION,
  STRUCTURE_ROAD,
  STRUCTURE_WALL,
  STRUCTURE_RAMPART,
  STRUCTURE_KEEPER_LAIR,
  STRUCTURE_PORTAL,
  STRUCTURE_CONTROLLER,
  STRUCTURE_LINK,
  STRUCTURE_STORAGE,
  STRUCTURE_TOWER,
  STRUCTURE_OBSERVER,
  STRUCTURE_POWER_BANK,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_EXTRACTOR,
  STRUCTURE_LAB,
  STRUCTURE_TERMINAL,
  STRUCTURE_CONTAINER,
  STRUCTURE_NUKER,
  STRUCTURE_FACTORY,
  STRUCTURE_INVADER_CORE,
]

export const buildableStructureTypes: BuildableStructureConstant[] = [
  STRUCTURE_SPAWN,
  STRUCTURE_EXTENSION,
  STRUCTURE_ROAD,
  STRUCTURE_WALL,
  STRUCTURE_RAMPART,
  STRUCTURE_LINK,
  STRUCTURE_STORAGE,
  STRUCTURE_TOWER,
  STRUCTURE_OBSERVER,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_EXTRACTOR,
  STRUCTURE_LAB,
  STRUCTURE_TERMINAL,
  STRUCTURE_CONTAINER,
  STRUCTURE_NUKER,
  STRUCTURE_FACTORY,
]
export const buildableStructuresSet: Set<BuildableStructureConstant> = new Set(
  buildableStructureTypes,
)

export const impassibleStructureTypes: StructureConstant[] = [
  STRUCTURE_SPAWN,
  STRUCTURE_EXTENSION,
  STRUCTURE_WALL,
  STRUCTURE_KEEPER_LAIR,
  STRUCTURE_CONTROLLER,
  STRUCTURE_LINK,
  STRUCTURE_STORAGE,
  STRUCTURE_TOWER,
  STRUCTURE_OBSERVER,
  STRUCTURE_POWER_BANK,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_EXTRACTOR,
  STRUCTURE_LAB,
  STRUCTURE_TERMINAL,
  STRUCTURE_NUKER,
  STRUCTURE_FACTORY,
  STRUCTURE_INVADER_CORE,
]

export const impassibleStructureTypesSet = new Set(impassibleStructureTypes)

export const defaultStructureTypesByBuildPriority: StructureConstant[] = [
  STRUCTURE_RAMPART,
  STRUCTURE_WALL,
  STRUCTURE_SPAWN,
  STRUCTURE_EXTENSION,
  STRUCTURE_CONTAINER,
  STRUCTURE_ROAD,
  STRUCTURE_STORAGE,
  STRUCTURE_TOWER,
  STRUCTURE_TERMINAL,
  STRUCTURE_LINK,
  STRUCTURE_EXTRACTOR,
  STRUCTURE_LAB,
  STRUCTURE_FACTORY,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_NUKER,
  STRUCTURE_OBSERVER,
]

export const structureTypesToProtect: StructureConstant[] = [
  STRUCTURE_SPAWN,
  STRUCTURE_TOWER,
  STRUCTURE_LAB,
  STRUCTURE_TERMINAL,
  STRUCTURE_STORAGE,
  STRUCTURE_FACTORY,
  STRUCTURE_NUKER,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_OBSERVER,
  STRUCTURE_LINK,
]
export const structureTypesToProtectSet = new Set(structureTypesToProtect)

export const storingStructureTypesSet: Set<StructureConstant> = new Set([
  STRUCTURE_STORAGE,
  STRUCTURE_TERMINAL,
])

/**
 * Our structure types that enemies can't walk on
 */
export const ourImpassibleStructures = impassibleStructureTypes.concat(STRUCTURE_RAMPART)
export const ourImpassibleStructuresSet = new Set(ourImpassibleStructures)

export const combatTargetStructureTypes: Set<StructureConstant> = new Set([
  STRUCTURE_SPAWN,
  STRUCTURE_TOWER,
  STRUCTURE_EXTENSION,
  STRUCTURE_STORAGE,
  STRUCTURE_TERMINAL,
  STRUCTURE_POWER_SPAWN,
  STRUCTURE_FACTORY,
  STRUCTURE_NUKER,
  STRUCTURE_OBSERVER,
])

export const generalRepairStructureTypes = new Set([STRUCTURE_ROAD, STRUCTURE_CONTAINER])

export const customColors = {
  white: '#ffffff',
  lightGrey: '#eaeaea',
  midGrey: '#bcbcbc',
  darkGrey: '#5e5e5e',
  lightBlue: '#0f66fc',
  darkBlue: '#02007d',
  black: '#000000',
  yellow: '#ABB400',
  red: '#d10000',
  green: '#00d137',
  brown: '#aa7253',
  purple: '#8b06a3',
  pink: '#d60ef9',
  orange: '#f27602',
  teal: '#02f2e2',
}

export const remoteStamps: Record<RemoteStampTypes, Stamp> = {
  container: {
    offset: 0,
    protectionOffset: 0,
    size: 1,
    structures: {
      container: [{ x: 0, y: 0 }],
    },
  },
  road: {
    offset: 0,
    protectionOffset: 0,
    size: 1,
    structures: {
      road: [{ x: 0, y: 0 }],
    },
  },
}

export const stamps: Record<StampTypes, Stamp> = {
  fastFiller: {
    offset: 3,
    protectionOffset: 6,
    size: 4,
    structures: {
      extension: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 2 },
        { x: 2, y: 3 },
        { x: 4, y: 1 },
        { x: 5, y: 1 },
        { x: 4, y: 3 },
        { x: 1, y: 4 },
        { x: 3, y: 4 },
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 4 },
      ],
      road: [
        { x: 3, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: 2 },
        { x: 0, y: 3 },
        { x: 0, y: 4 },
        { x: 4, y: 0 },
        { x: 5, y: 0 },
        { x: 6, y: 1 },
        { x: 6, y: 2 },
        { x: 6, y: 4 },
        { x: 6, y: 3 },
        { x: 6, y: 5 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 3, y: 6 },
        { x: 2, y: 6 },
        { x: 1, y: 6 },
        { x: 0, y: 5 },
      ],
      spawn: [
        { x: 1, y: 2 },
        { x: 5, y: 2 },
        { x: 3, y: 5 },
      ],
      container: [
        { x: 1, y: 3 },
        { x: 5, y: 3 },
      ],
      link: [{ x: 3, y: 3 }],
      empty: [
        { x: 2, y: 2 },
        { x: 4, y: 2 },
        { x: 2, y: 4 },
        { x: 4, y: 4 },
      ],
    },
  },
  hub: {
    offset: 2,
    protectionOffset: 5,
    size: 0,
    structures: {
      storage: [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 2 },
      ],
    },
  },
  gridExtension: {
    offset: 0,
    protectionOffset: 4,
    size: 1,
    structures: {
      extension: [{ x: 0, y: 0 }],
    },
  },
  inputLab: {
    offset: 0,
    protectionOffset: 4,
    size: 1,
    structures: {
      lab: [{ x: 0, y: 0 }],
    },
  },
  outputLab: {
    offset: 0,
    protectionOffset: 4,
    size: 1,
    structures: {
      lab: [{ x: 0, y: 0 }],
    },
  },
  tower: {
    offset: 0,
    protectionOffset: 4,
    size: 1,
    structures: {
      tower: [{ x: 0, y: 0 }],
    },
  },
  observer: {
    offset: 0,
    protectionOffset: 4,
    size: 1,
    structures: {
      observer: [{ x: 0, y: 0 }],
    },
  },
  nuker: {
    offset: 0,
    protectionOffset: 4,
    size: 1,
    structures: {
      nuker: [{ x: 0, y: 0 }],
    },
  },
  powerSpawn: {
    offset: 0,
    protectionOffset: 4,
    size: 1,
    structures: {
      powerSpawn: [{ x: 0, y: 0 }],
    },
  },
  sourceLink: {
    offset: 0,
    protectionOffset: 0,
    size: 1,
    structures: {
      link: [{ x: 0, y: 0 }],
    },
  },
  sourceExtension: {
    offset: 0,
    protectionOffset: 0,
    size: 1,
    structures: {
      extension: [{ x: 0, y: 0 }],
    },
  },
  container: {
    offset: 0,
    protectionOffset: 0,
    size: 1,
    structures: {
      container: [{ x: 0, y: 0 }],
    },
  },
  extractor: {
    offset: 0,
    protectionOffset: 0,
    size: 1,
    structures: {
      extractor: [{ x: 0, y: 0 }],
    },
  },
  road: {
    offset: 0,
    protectionOffset: 0,
    size: 1,
    structures: {
      road: [{ x: 0, y: 0 }],
    },
  },
  minCutRampart: {
    offset: 0,
    protectionOffset: 0,
    size: 1,
    structures: {
      rampart: [{ x: 0, y: 0 }],
    },
  },
  onboardingRampart: {
    offset: 0,
    protectionOffset: 0,
    size: 1,
    structures: {
      rampart: [{ x: 0, y: 0 }],
    },
  },
  shieldRampart: {
    offset: 0,
    protectionOffset: 0,
    size: 1,
    structures: {
      rampart: [{ x: 0, y: 0 }],
    },
  },
}
export const stampKeys = Object.keys(stamps) as StampTypes[]

export const minerals: Partial<MineralConstant[]> = [
  RESOURCE_HYDROGEN,
  RESOURCE_OXYGEN,
  RESOURCE_UTRIUM,
  RESOURCE_KEANIUM,
  RESOURCE_LEMERGIUM,
  RESOURCE_ZYNTHIUM,
  RESOURCE_CATALYST,
]
export const boosts = [RESOURCE_CATALYZED_GHODIUM_ACID]
export const dismantleBoosts = [
  RESOURCE_ZYNTHIUM_HYDRIDE,
  RESOURCE_ZYNTHIUM_ACID,
  RESOURCE_CATALYZED_ZYNTHIUM_ACID,
]
export const dismantleBoostsSet = new Set(dismantleBoosts)
export const allResources = new Set(RESOURCES_ALL)

export const antifaRoles: (
  | 'antifaRangedAttacker'
  | 'antifaAttacker'
  | 'antifaHealer'
  | 'antifaDismantler'
  | 'antifaDowngrader'
)[] = [
    'antifaRangedAttacker',
    'antifaAttacker',
    'antifaHealer',
    'antifaDismantler',
    'antifaDowngrader',
  ]

/**
 * Roles for which to provide spawnGroups for based on their shared remoteName
 */
export const remoteRoles: (
  | 'remoteReserver'
  | 'remoteDefender'
  | 'remoteCoreAttacker'
  | 'remoteDismantler'
)[] = ['remoteReserver', 'remoteDefender', 'remoteCoreAttacker', 'remoteDismantler']

export const CPUBucketCapacity = 10000
export const CPUMaxPerTick = 500
export const basePlanCPUBucketThreshold = CPUBucketCapacity * 0.5

/**
 * Roles that should attempt relaying
 */
export const relayRoles: Set<CreepRoles> = new Set(['hauler'])

/**
 * Used to modify the remaining bucket amount, resulting in the default cacheAmount for moveRequests
 */
export const cacheAmountModifier = 25

/**
 * The number of ticks to wait between hauler size updates
 */
export const haulerUpdateDefault = 1500

export const rampartUpkeepCost = RAMPART_DECAY_AMOUNT / REPAIR_POWER / RAMPART_DECAY_TIME
export const roadUpkeepCost = ROAD_DECAY_AMOUNT / REPAIR_POWER / ROAD_DECAY_TIME
export const containerUpkeepCost = CONTAINER_DECAY / REPAIR_POWER / CONTAINER_DECAY_TIME_OWNED
export const remoteContainerUpkeepCost = CONTAINER_DECAY / REPAIR_POWER / CONTAINER_DECAY_TIME

export const minOnboardingRamparts = 1
export const maxRampartGroupSize = 12

/**
 * Links should try to send when their store is more or equal to this multiplier
 */
export const linkSendThreshold = 0.9

/**
 * Links should receive when their store is less or equal to this multiplier
 */
export const linkReceiveTreshold = 0.25

export const powerSpawnRefillThreshold = 0.1

/**
 * Offsets from a creep's moveRequest for which to search for relay targets
 */
export const relayOffsets = {
  horizontal: [
    {
      x: 0,
      y: 0,
    },
    {
      x: -1,
      y: 0,
    },
    {
      x: 1,
      y: 0,
    },
  ],
  vertical: [
    {
      x: 0,
      y: 0,
    },
    {
      x: 0,
      y: -1,
    },
    {
      x: 0,
      y: 1,
    },
  ],
  topLeft: [
    {
      x: 0,
      y: 0,
    },
    {
      x: 1,
      y: 0,
    },
    {
      x: 0,
      y: 1,
    },
  ],
  topRight: [
    {
      x: 0,
      y: 0,
    },
    {
      x: -1,
      y: 0,
    },
    {
      x: 0,
      y: 1,
    },
  ],
  bottomLeft: [
    {
      x: 0,
      y: 0,
    },
    {
      x: 1,
      y: 0,
    },
    {
      x: 0,
      y: -1,
    },
  ],
  bottomRight: [
    {
      x: 0,
      y: 0,
    },
    {
      x: -1,
      y: 0,
    },
    {
      x: 0,
      y: -1,
    },
  ],
}

export const squadQuotas: Partial<{
  [key in SquadTypes]: Partial<{ [key in CreepRoles]: Partial<{ [key in CreepRoles]: number }> }>
}> = {
  duo: {
    antifaAttacker: {
      antifaAttacker: 1,
      antifaHealer: 1,
    },
    antifaDismantler: {
      antifaDismantler: 1,
      antifaHealer: 1,
    },
  },
  quad: {
    antifaRangedAttacker: {
      antifaRangedAttacker: 4,
    },
    antifaAttacker: {
      antifaAttacker: 1,
      antifaHealer: 3,
    },
    antifaDismantler: {
      antifaDismantler: 1,
      antifaHealer: 3,
    },
  },
  dynamic: {
    antifaRangedAttacker: {
      antifaAttacker: 1,
      antifaHealer: 1,
      antifaRangedAttacker: 1,
      antifaDismantler: 1,
    },
  },
}

export const defaultPlainCost = 1
export const defaultRoadPlanningPlainCost = 3
export const defaultSwampCost = 5
export const defaultCreepSwampCost = 8

/**
 * @constant 1 4
 * @constant 2 3
 */
export const quadAttackMemberOffsets = [
  {
    x: 0,
    y: 0,
  },
  {
    x: 0,
    y: 1,
  },
  {
    x: 1,
    y: 1,
  },
  {
    x: 1,
    y: 0,
  },
]

export enum Result {
  fail,
  success,
  action,
  noAction,
  stop,
  noPath,
  notFound,
}

export const maxRemoteRoomDistance = 5
// Past this it's probably not efficient
export const maxRemotePathDistance = 250
export const offsetsByDirection = [
  ,
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
]

export const towerPowers = [PWR_OPERATE_TOWER, PWR_DISRUPT_TOWER]

export const remoteTypeWeights: Partial<{ [key: string]: number }> = {
  [RoomTypes.sourceKeeper]: Infinity,
  [RoomTypes.enemy]: Infinity,
  [RoomTypes.ally]: Infinity,
}

export const maxWorkRequestDistance = 10
export const maxCombatDistance = 20
export const maxHaulDistance = 15

export const partsByPriority: PartsByPriority[] = [
  'tough',
  'claim',
  'attack',
  'ranged_attack',
  'secondaryTough',
  'work',
  'carry',
  'move',
  'secondaryAttack',
  'heal',
]

export const partsByPriorityPartType: { [key in PartsByPriority]: BodyPartConstant } = {
  [TOUGH]: TOUGH,
  [CLAIM]: CLAIM,
  [ATTACK]: ATTACK,
  [RANGED_ATTACK]: RANGED_ATTACK,
  secondaryTough: TOUGH,
  [WORK]: WORK,
  [CARRY]: CARRY,
  [MOVE]: MOVE,
  secondaryAttack: ATTACK,
  [HEAL]: HEAL,
}

export const rangedMassAttackMultiplierByRange = [1, 1, 0.4, 0.1]

export const packedPosLength = 3
export const packedCoordLength = 2
export const cardinalOffsets = [
  {
    x: -1,
    y: 0,
  },
  {
    x: 1,
    y: 0,
  },
  {
    x: 0,
    y: -1,
  },
  {
    x: 0,
    y: 1,
  },
]

export const adjacentOffsets = [
  {
    x: -1,
    y: -1,
  },
  {
    x: 0,
    y: -1,
  },
  {
    x: 1,
    y: -1,
  },
  {
    x: 1,
    y: 0,
  },
  {
    x: 1,
    y: 1,
  },
  {
    x: 0,
    y: 1,
  },
  {
    x: -1,
    y: 1,
  },
  {
    x: -1,
    y: 0,
  },
]
export const defaultMinCutDepth = 7
/* export const defaultMineralPriority = {
    [H]:
}
 */
export const decayCosts: Partial<{ [key in BuildableStructureConstant]: number }> = {
  [STRUCTURE_ROAD]: roadUpkeepCost,
  [STRUCTURE_CONTAINER]: containerUpkeepCost,
}

export const dynamicScoreRoomRange = 8
export const maxControllerLevel = 8
export const preferredCommuneRange = 5.5
export const defaultDataDecay = 0.99999
export const revolutionary = 'MarvinTMB'
export const maxSegmentsOpen = 10
/**
 * The max possible spawn energy capacity rooms can have
 */
export const maxSpawnEnergyCapacity =
  CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][maxControllerLevel] * SPAWN_ENERGY_CAPACITY +
  CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][8] * EXTENSION_ENERGY_CAPACITY[maxControllerLevel]

/**
 * Non-zero types of reserved registered coordinates
 */
export enum ReservedCoordTypes {
  /**
   * The creep is trying to spawn onto this coord
   */
  spawning,
  /**
   * The notable reserved coord reserver is dying
   */
  dying,
  /**
   * Probably a more temporary reserved coord that need not be considered in all situations
   */
  normal,
  /**
   * Probably a more permanent reserved coord that should be considered in more situations
   */
  important,
  /**
   * Probably a position very important to combat related coordinate reservation
   */
  necessary,
}

/**
 * Types of work intents
 */
export enum WorkTypes {
  harvest,
  repair,
  build,
  upgrade,
  dismantle,
  heal,
  attack,
  attackController,
}

export enum SegmentIDs {
  general = 0,
  basePlans = 1,
  /**
   * contains significant IDs such as construction sites and transaction IDs
   */
  IDs = 2,
  errors = 10,
}

export enum MovedTypes {
  moved = 1,
  wait,
}

export enum FlagNames {
  debugMovement = 'debugMovement',
  debugRelay = 'debugRelay',
  debugRoomLogistics = 'debugRoomLogistics',
  debugCreepLogistics = 'debugCreepLogistics',
  debugSpawning = 'debugSpawning',
  mapVisuals = 'mapVisuals',
  roomVisuals = 'roomVisuals',
  deactivate = 'deactiveate',
  debugFunneling = 'debugFunneling',
  debugMoveRequests = 'debugMoveRequests',
}

export const creepDamageEvents = new Set([
  EVENT_ATTACK_TYPE_MELEE,
  EVENT_ATTACK_TYPE_DISMANTLE,
  EVENT_ATTACK_TYPE_RANGED,
  EVENT_ATTACK_TYPE_RANGED_MASS,
])
