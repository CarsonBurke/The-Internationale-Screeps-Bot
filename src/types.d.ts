import { CommuneManager } from './room/commune/commune'
import { RoomManager } from './room/room'
import { Duo } from './room/creeps/roleManagers/antifa/duo'
import { Quad } from './room/creeps/roleManagers/antifa/quad'
import {
  WorkRequestKeys,
  CombatRequestKeys,
  CreepMemoryKeys,
  CreepLogisticsRequestKeys,
  DepositRequestKeys,
  HaulRequestKeys,
  NukeRequestKeys,
  PlayerMemoryKeys,
  PowerCreepMemoryKeys,
  PowerTaskKeys,
  RoomMemoryKeys,
  RoomTypes,
  SleepFor,
  Result,
  PlayerRelationship,
  ReservedCoordTypes,
  WorkTypes,
  creepRoles,
  CreepPowerTaskNames,
  RoomLogisticsRequestTypes,
  MovedTypes,
  RoomStatusKeys,
} from './constants/general'
import { RoomStatsKeys } from '../constants/stats'
import { Operator } from 'room/creeps/powerCreeps/operator'
import { MeleeDefender } from 'room/creeps/roleManagers/commune/defenders/meleeDefender'
import { Settings } from 'international/settingsDefault'
import { DynamicSquad } from 'room/creeps/roleManagers/antifa/dynamicSquad'
import { BasePlans } from 'room/construction/basePlans'
import { CustomPathFinderArgs } from 'international/customPathFinder'
import { CombatRequest, HaulRequest, NukeRequest, WorkRequest } from 'types/internationalRequests'
import { PlayerMemory } from 'types/players'
import {
  CreepLogisticsRequest,
  RoomLogisticsRequest,
  FindNewRoomLogisticsRequestArgs,
  CreateRoomLogisticsRequestArgs,
} from 'types/roomLogistics'
import { UserScriptTemplate } from 'other/userScript/userScript.example'
import { StatsMemory } from 'types/stats'
import { WeightLayers, WeightsByID } from 'room/construction/neuralNetwork/network'
import { OrganizedSpawns } from 'room/commune/spawning/spawningStructureOps'
import { CreepTask, CreepPowerTask, PowerRequest } from 'types/creepTasks'

declare global {
  interface ProfilerData {
    calls: number
    time: number
  }

  interface Profiler {
    clear(): void
    output(): void
    start(): void
    status(): void
    stop(): void
    toString(): string
  }

  interface Collaborator {
    run(): void
  }

  interface Coord {
    x: number
    y: number
  }

  interface RoomCoord extends Coord {}

  interface Rect {
    x1: number
    y1: number
    x2: number
    y2: number
  }

  interface CostMatrix {
    _bits: Uint8Array
  }

  interface Colors {
    white: string
    lightGrey: string
    lightBlue: string
    darkBlue: string
    black: string
    yellow: string
    red: string
    green: string
    brown: string
  }

  type PartsByPriority =
    | 'tough'
    | 'claim'
    | 'attack'
    | 'ranged_attack'
    | 'secondaryTough'
    | 'work'
    | 'carry'
    | 'move'
    | 'secondaryAttack'
    | 'heal'

  type SquadTypes = 'duo' | 'quad' | 'dynamic'
  type SquadCombatTypes = 'rangedAttack' | 'attack' | 'dismantle'
  type SquadMoveTypes = 'transport' | 'attack'

  type RemoteStampTypes = 'road' | 'container'

  type StampTypes =
    | 'fastFiller'
    | 'hub'
    | 'inputLab'
    | 'outputLab'
    | 'tower'
    | 'observer'
    | 'sourceLink'
    | 'sourceExtension'
    | 'container'
    | 'extractor'
    | 'road'
    | 'minCutRampart'
    | 'onboardingRampart'
    | 'shieldRampart'
    | 'gridExtension'
    | 'nuker'
    | 'powerSpawn'

  interface Stamp {
    offset: number

    /**
     * The range of protection from the anchor to provide when deciding rampart placement
     */
    protectionOffset: number
    size: number
    structures: { [structureType: string]: Coord[] }
    asymmetry?: number
  }

  type StampAnchors = Partial<Record<StampTypes, Coord[]>>
  /**
   * key of packed stamp type with values of packed coord list
   */
  type PackedStampAnchors = Partial<{ [packedStampType: string]: string }>

  type PosMap<T> = T[]

  type CoordMap = Uint8Array

  type CreepRoles =
    | 'sourceHarvester'
    | 'hauler'
    | 'requestHauler'
    | 'controllerUpgrader'
    | 'builder'
    | 'maintainer'
    | 'mineralHarvester'
    | 'hubHauler'
    | 'fastFiller'
    | 'meleeDefender'
    | 'rangedDefender'
    | 'remoteSourceHarvester'
    | 'remoteReserver'
    | 'remoteDefender'
    | 'remoteCoreAttacker'
    | 'remoteDismantler'
    | 'remoteBuilder'
    | 'scout'
    | 'claimer'
    | 'vanguard'
    | 'allyVanguard'
    | 'antifaRangedAttacker'
    | 'antifaAttacker'
    | 'antifaHealer'
    | 'antifaDismantler'
    | 'antifaDowngrader'

  interface TerminalRequest {
    /**
     * Preference from 0-1 where 1 is least prefered
     */
    priority: number
    amount: number
    resource: ResourceConstant
    roomName: string
  }

  interface BasePlanCoord {
    structureType: BuildableStructureConstant
    minRCL: number
  }

  interface RampartPlanCoord {
    minRCL: number
    /**
     * A boolean integer
     */
    coversStructure: number
    /**
     * A boolean integer. buildForNuke cannot be true if buildForThreat is true
     */
    buildForNuke: number
    /**
     * A boolean integer. buildForThreat cannot be true if buildForNuke is true
     */
    buildForThreat: number
    /**
     * A boolean integer
     */
    needsStoringStructure: number
  }

  type QuadTransformTypes =
    | 'none'
    | 'rotateLeft'
    | 'rotateRight'
    | 'tradeHorizontal'
    | 'tradeVertical'

  interface BasePlanAttempt {
    score: number
    stampAnchors: PackedStampAnchors
    basePlans: string
    rampartPlans: string
    roadQuota: number[]
    communeSources: Id<Source>[]
    sourceHarvestPositions: string[]
    sourcePaths: string[]
    mineralHarvestPositions: string
    mineralPath: string
    centerUpgradePos: string
    upgradePath: string
  }

  interface RCLPlannedStructureType {
    structures: number
    minRCL: number
  }

  interface CombatStrength {
    dismantle: number
    melee: number
    ranged: number
    heal: number
  }

  interface FindClosestPos {
    coordMap: CoordMap
    sources: Coord[]
    targetCondition(coord: Coord): boolean
    /**
     * Wether or not to attempt a cardinal flood
     */
    cardinalFlood?: boolean
    visuals?: boolean
  }

  interface FindClosestPosOfValueOpts {
    coordMap: CoordMap
    startCoords: Coord[]
    requiredValue: number
    reduceIterations: number
    initialWeight?: number
    adjacentToRoads?: boolean
    roadCoords?: CoordMap
    visuals?: boolean
    /**
     * Wether or not to attempt a cardinal flood
     */
    cardinalFlood?: boolean
    /**
     * The protection offset of the stamp
     */
    protectionOffset?: number
  }

  interface FindClosestPosOfValueOptsAsym extends FindClosestPosOfValueOpts {
    /**
     * The x and y offset from the top left of the stamp
     */
    offset: number
    /**
     * The asymmetrical x and y offset from the top left of the stamp
     */
    asymOffset: number
  }

  interface MoveRequestOpts {
    cacheAmount?: number
    /**
     * Allow for assigning reservedCoord of a type on successful pathfind
     */
    reserveCoord?: ReservedCoordTypes
  }

  interface MoveRequestByPathOpts {
    packedPath: string
    loose?: boolean
    remoteName?: string
  }

  type OrderedStructurePlans = BuildObj[]

  interface BuildObj {
    structureType: BuildableStructureConstant
    x: number
    y: number
  }

  type FlagNames = 'disableTowerAttacks' | 'internationalDataVisuals' | 'spawnRequestVisuals'

  interface Memory {
    breakingVersion: number
    /**
     * The name of the user
     */
    me: string

    /**
     * An ongoing record of the latest ID assigned by the bot
     */
    ID: number

    chantIndex: number

    /**
     * the tick of the last holistic configuration operation
     */
    lastConfig: number

    minHaulerCostError: number
    minHaulerCost: number
    minHaulerCostUpdate: number

    /**
     *
     */
    workRequests: { [roomName: string]: WorkRequest }

    combatRequests: { [roomName: string]: Partial<CombatRequest> }

    haulRequests: { [roomName: string]: Partial<HaulRequest> }

    nukeRequests: { [roomName: string]: Partial<NukeRequest> }

    stats: Partial<StatsMemory>

    players: { [playerName: string]: Partial<PlayerMemory> }

    masterPlan: { resources?: { [key in ResourceConstant]?: number } }

    networks: {
      towers: {
        weightLayers: WeightLayers
        weightsByID: WeightsByID
      }
    }

    // Other

    profiler: ProfilerMemory
  }

  interface RawMemory {
    _parsed: Memory
  }

  type SpawningStructures = (StructureSpawn | StructureExtension)[]

  interface OrganizedStructures {
    spawn: StructureSpawn[]
    extension: StructureExtension[]
    road: StructureRoad[]
    constructedWall: StructureWall[]
    rampart: StructureRampart[]
    keeperLair: StructureKeeperLair[]
    portal: StructurePortal[]
    controller: StructureController[]
    link: StructureLink[]
    storage: StructureStorage[]
    tower: StructureTower[]
    observer: StructureObserver[]
    powerBank: StructurePowerBank[]
    powerSpawn: StructurePowerSpawn[]
    extractor: StructureExtractor[]
    lab: StructureLab[]
    terminal: StructureTerminal[]
    container: StructureContainer[]
    nuker: StructureNuker[]
    factory: StructureFactory[]
    invaderCore: StructureInvaderCore[]
  }

  type InterfaceToKV<T> = {
    [K in keyof T]: { key: K; value: T[K] }
  }[keyof T]

  interface EnemySquadData {
    /**
     * enemy attack + rangedAttack damage
     */
    highestMeleeDamage: number
    highestRangedDamage: number
    /**
     * Accounts for defence
     */
    highestHeal: number
    highestDismantle: number
  }

  interface TotalEnemyCombatStrength {
    melee: number
    ranged: number
    heal: number
    dismantle: number
  }

  interface Room {
    /**
     * The names of creeps harvesting each source
     */
    creepsOfSource: string[][]

    myCreeps: Creep[]
    myPowerCreeps: PowerCreep[]
    /**
     * An object with keys of roles with properties of arrays of creep names belonging to the role
     */
    myCreepsByRole: { [key in CreepRoles]?: string[] }

    /**
     * An object with keys of roles with properties of arrays of power creep names belonging to the role
     */
    myPowerCreepsByRole: { [key in PowerClassConstant]?: string[] }

    /**
     * An object with keys of roles and properties of the number of creeps with the role from this room
     */
    creepsFromRoom: Partial<{ [key in CreepRoles]: string[] }>

    /**
     * The cumulative amount of creeps with a communeName value of this room's name
     */
    creepsFromRoomAmount: number

    /**
     * An object with keys of roles and properties of the number of creeps with the role from this room
     */
    creepsOfRemote: { [remoteName: string]: Partial<{ [key in CreepRoles]: string[] }> }

    /**
     * A set of roomNames representing the targets stof scouts from this commune
     */
    scoutTargets: Set<string>

    /**
     * Tile types as defined by the rampartPlanner
     */
    tileCoords: CoordMap

    unprotectedCoords: CoordMap

    /**
     * Wether the towers can sufficiently deal with the enemy threat in the room
     */
    towerInferiority: boolean

    baseCoords: CoordMap

    rampartCoords: CoordMap

    roadCoords: CoordMap

    /**
     * A matrix with indexes of packed coords and values of creep names
     */
    creepPositions: { [packedCoord: string]: string }

    /**
     * A matrix with indexes of packed coords and values of creep names
     */
    powerCreepPositions: { [packedCoord: string]: string }

    /**
     * A matrix with indexes of packed coords and values of creep names
     */
    moveRequests: { [packedCoord: string]: string[] }

    roomManager: RoomManager

    communeManager: CommuneManager

    /**
     * The names of creeps looking to join a squad
     */
    squadRequests: Set<string>

    roomLogisticsRequests: {
      [key in RoomLogisticsRequestTypes]: { [ID: string]: RoomLogisticsRequest }
    }
    powerRequests: { [ID: string]: PowerRequest }

    attackingDefenderIDs: Set<Id<Creep>>
    defenderEnemyTargetsWithDamage: Map<Id<Creep>, number>
    defenderEnemyTargetsWithDefender: Map<Id<Creep>, Id<Creep>[]>

    usedRampartIDs: Map<Id<StructureRampart>, Id<Creep>>

    generalRepairStructures: (StructureRoad | StructureContainer)[]
    rampartRepairStructures: StructureRampart[]

    organizedSpawns: OrganizedSpawns | false

    fastFillerCoords: Coord[]
    storingStructuresCapacity: number
    storingStructures: (StructureStorage | StructureTerminal)[]

    structures: OrganizedStructures

    sources: Source[]

    // Commune

    // Functions

    /**
     *
     * @param pos1 The position of the thing performing the action
     * @param pos2 The position of the thing getting intereacted with
     * @param type The type of interaction, success if not provided
     */
    actionVisual(pos1: RoomPosition, pos2: RoomPosition, type?: string): void

    targetVisual(coord1: Coord, coord2: Coord, visualize?: boolean): void

    /**
     * Tries to delete a task with the provided ID and response state
     */
    deleteTask(taskID: any, responder: boolean): void

    scoutRemote(scoutingRoom?: Room): number | false
    scoutEnemyReservedRemote(): number | false
    scoutEnemyUnreservedRemote(): number | false
    scoutMyRemote(scoutingRoom: Room): number | false

    scoutEnemyRoom(): number

    makeRemote(scoutingRoom: Room): boolean

    createAttackCombatRequest(opts?: Partial<CombatRequest>): void

    createHarassCombatRequest(opts?: Partial<CombatRequest>): void

    createDefendCombatRequest(opts?: Partial<CombatRequest>): void

    /**
     * Finds the score of rooms for potential communes
     */
    findScore(): void

    /**
     * Finds open spaces in a room and records them in a cost matrix
     */
    distanceTransform(
      initialCoords: CoordMap,
      visuals?: boolean,
      /**
       * The smallest number to convert into an avoid value
       */
      minAvoid?: number,
      x1?: number,
      y1?: number,
      x2?: number,
      y2?: number,
    ): CoordMap

    /**
     * Finds open spaces in a room without adding depth to diagonals, and records the depth results in a cost matrix
     */
    diagonalDistanceTransform(
      initialCoords: CoordMap,
      visuals?: boolean,
      /**
       * The smallest number to convert into an avoid value
       */
      minAvoid?: number,
      x1?: number,
      y1?: number,
      x2?: number,
      y2?: number,
    ): CoordMap

    /**
     * Flood fills a room until it finds one of a set of positions
     */
    findClosestPos(opts: FindClosestPos): RoomPosition | false

    errorVisual(coord: Coord, visualize?: boolean): void

    /**
     * Finds and records a construction site for builders to target
     */
    findAllyCSiteTargetID(creep: Creep): boolean

    /**
     * Groups positions with contigiousness, structured similarily to a flood fill
     */
    groupRampartPositions(rampartPositions: number[]): RoomPosition[][]

    findUnprotectedCoords(visuals?: boolean): void

    /**
     *
     */
    findPositionsInsideRect(x1: number, y1: number, x2: number, y2: number): RoomPosition[]

    /**
     *
     */
    findAdjacentPositions(rx: number, ry: number): RoomPosition[]

    /**
     *
     */
    createPullTask(creator: Structure | Creep | Resource): void

    /**
     *
     */
    createPickupTasks(creator: Structure | Creep | Resource): void

    /**
     *
     */
    createOfferTasks(creator: Structure | Creep | Resource): void

    /**
     *
     */
    createTransferTasks(creator: Structure | Creep | Resource): void

    /**
     *
     */
    createWithdrawTasks(creator: Structure | Creep | Resource): void

    visualizeCoordMap(coordMap: CoordMap, color?: boolean, magnification?: number): void

    visualizeCostMatrix(cm: CostMatrix, color?: boolean, magnification?: number): void

    coordHasStructureTypes(coord: Coord, types: Set<StructureConstant>): boolean

    createPowerRequest(
      target: Structure | Source,
      powerType: PowerConstant,
      priority: number,
    ): PowerRequest | false

    highestWeightedStoringStructures(resourceType: ResourceConstant): AnyStoreStructure | false

    createRoomLogisticsRequest(args: CreateRoomLogisticsRequestArgs): void

    partsOfRoles: Partial<{
      [key in CreepRoles]: Partial<{ [key in BodyPartConstant]: number }>
    }>

    createWorkRequest(): boolean

    findSwampPlainsRatio(): number

    // Spawn functions

    // structure functions

    findStructureAtCoord<T extends Structure>(
      coord: Coord,
      conditions: (structure: T) => boolean,
    ): T | false
    findStructureAtXY<T extends Structure>(
      x: number,
      y: number,
      conditions: (structure: T) => boolean,
    ): T | false

    findCSiteAtCoord<T extends ConstructionSite>(
      coord: Coord,
      conditions: (cSite: T) => boolean,
    ): T | false
    findCSiteAtXY<T extends ConstructionSite>(
      x: number,
      y: number,
      conditions: (cSite: T) => boolean,
    ): T | false

    findStructureInRange<T extends Structure>(
      startCoord: Coord,
      range: number,
      condition: (structure: T) => boolean,
    ): T | false

    /**
     * Generates a square visual at the specified coordinate
     */
    coordVisual(x: number, y: number, fill?: string): void
  }

  interface DepositRecord {
    decay: number
    needs: number[]
  }

  interface IdealSquadMembers {}

  interface CreepFunctions {
    update(): void

    initRun(): void

    endRun(): void

    isDying(): boolean

    advancedPickup(target: Resource): boolean

    advancedTransfer(
      target: Creep | AnyStoreStructure,
      resourceType?: ResourceConstant,
      amount?: number,
    ): boolean

    advancedWithdraw(
      target: Creep | AnyStoreStructure | Tombstone | Ruin,
      resourceType?: ResourceConstant,
      amount?: number,
    ): boolean

    advancedBuild(): number
    builderGetEnergy(): number

    /**
     * Attempts multiple methods to build one of our construction sites
     */
    advancedBuildCSite(cSite: ConstructionSite): number

    /**
     * Attempts multiple methods to build an ally construction site
     */
    advancedBuildAllyCSite(): boolean

    /**
     * Find a source index when not necessarily in a commune or remote
     */
    findSourceIndex(): boolean
    findCommuneSourceIndex(): boolean
    findRemoteSourceIndex(): boolean

    /**
     *
     */
    createMoveRequestByPath(args: CustomPathFinderArgs, pathOpts: MoveRequestByPathOpts): number

    /**
     *
     */
    createMoveRequest(args: CustomPathFinderArgs, opts?: MoveRequestOpts): number

    assignMoveRequest(coord: Coord): void

    findShoveCoord(avoidPackedCoords: Set<string>, targetCoord?: Coord): Coord

    shove(avoidPackedCoords?: Set<string>): boolean

    /**
     * Try to enforce a moveRequest and inform the result
     */
    runMoveRequest(): boolean

    /**
     *unpackCoordAsPos
     */
    recurseMoveRequest(queue?: string[]): void

    avoidEnemyThreatCoords(): boolean

    /**
     * Decides if the creep needs to get more resources or not. DO NOT USE FOR CREEPS THAT PERFORM MULTIPLE TRANSACTIONS PER TICK
     */
    needsResources(): boolean

    /**
     * Wether the creep has a > 0 amount of a resorce that isn't energy
     */
    hasNonEnergyResource(): boolean

    findRecycleTarget(): StructureSpawn | StructureContainer | false

    advancedRecycle(): boolean

    advancedReserveController(): boolean

    passiveHeal(): boolean

    /**
     * Heal nearby allies without moving
     */
    aggressiveHeal(): boolean

    /**
     * Attack nearby enemies without moving
     */
    passiveRangedAttack(): boolean
  }

  interface CreepProperties {
    /**
     * The packed position of the moveRequest, if one has been made
     */
    moveRequest: string

    /**
     * Wether the creep moved a resource this tick
     */
    movedResource: boolean

    /**
     * The packed coord the creep is trying to act upon, or the action it has decided on
     */
    moved?: string | MovedTypes

    /**
     * The creep's opts when trying to make a moveRequest intra tick
     */
    pathOpts: CustomPathFinderArgs

    /**
     * Wether the creep is allowed accept room logistics requests that require delivery
     */
    noDelivery: boolean

    /**
     * The coordinate the creep would prefer to be shoved towards, if it is to be shoved
     */
    actionCoord: Coord

    _macroHealStrength: number
    /**
     * The heal strength of the creep alongside its neighbours that we dopn't own
     */
    readonly macroHealStrength: number

    _reserveHits: number
    /**
     * The max possible hits - accounting for nearby healers - subtracted by damage attempts
     */
    reserveHits: number

    _grossTowerDamage: number
    /**
     * The highest possible tower damage
     */
    readonly grossTowerDamage: number

    _netTowerDamage: number
    /**
     * The highest possible tower damage, accounting for maximum possible enemy heal
     */
    readonly netTowerDamage: number

    _message: string
    /**
     * The cumulative message to present in say()
     */
    message: string

    _freeCapacityNextTick: number
    /**
     * The estimated total free capacity the creep will have next tick
     */
    freeCapacityNextTick: number

    _isOnExit: boolean
    readonly isOnExit: boolean

    _exitTo: string | boolean
    readonly exitTo: string | boolean
  }

  // Creeps

  interface Creep extends CreepFunctions, CreepProperties {
    combatTarget: Creep

    /**
     * Wether the creep did a harvest, build, upgrade, dismantle, repair, heal, attack this tick
     */
    worked: WorkTypes

    /**
     * Wether the creep rangedHealed or rangedAttacked this tick
     */
    ranged: boolean

    /**
     * Whether the creep is actively pulling another creep or not
     */
    pulling: boolean

    /**
     * Whether the creep is actively getting pulled by another creep or not
     */
    gettingPulled: boolean

    /**
     * The squad the creep belongs to
     */
    squad: Duo | Quad | DynamicSquad | undefined

    /**
     * Wether the squad has ran yet
     */
    squadRan: boolean

    /**
     * The ID of the spawn the creep is spawning in, if it is spawning
     */
    spawnID: Id<StructureSpawn>

    /**
     * The change to a value the creep opperated this tick
     */
    dataChange: number

    // Creep Functions

    findBulzodeTargets(goalCoord: RoomPosition): Id<Structure>[]

    findQuadBulldozeTargets(goalCoord: RoomPosition): Id<Structure>[]

    // Creep Getters

    _role: CreepRoles
    /**
     * The lifetime designation that broadly describes what the creep should do
     */
    readonly role: CreepRoles

    /**
     * @deprecated
     */
    _commune: Room | undefined
    /**
     * The name of the room the creep is from
     * @deprecated
     */
    readonly commune: Room | undefined

    _customID: number

    _strength: number
    /**
     * A numerical measurement of the combat abilites of the creep
     */
    readonly strength: number

    _combatStrength: CombatStrength

    readonly combatStrength: CombatStrength

    _defenceStrength: number

    /**
     * The multiplier to incoming damage the creep has
     */
    readonly defenceStrength: number

    _parts: Partial<Record<BodyPartConstant, number>>

    /**
     * The number of parts organized by type the creep has
     */
    readonly parts: Partial<Record<BodyPartConstant, number>>

    _boosts: Partial<Record<MineralBoostConstant, number>>

    /**
     * The number of boosts organized by type the creep has
     */
    readonly boosts: Partial<Record<MineralBoostConstant, number>>

    _canMove: boolean
    readonly canMove: boolean

    _idealSquadMembers: IdealSquadMembers
    readonly idealSquadMembers: IdealSquadMembers
  }

  interface PowerCreep extends CreepFunctions, CreepProperties {
    /**
     * Wether the creep has used a power this tick
     */
    powered: boolean

    _powerCooldowns: Partial<Map<PowerConstant, number>>

    readonly powerCooldowns: Partial<Map<PowerConstant, number>>
  }

  // Structures

  interface Structure {
    // Getters

    /**
     * Wether the structure is disabled or not by the room's downgraded controller level
     * @method StructureUtils.isRCLActionable(structure)
     */
    isRCLActionable: boolean
  }

  interface StructureSpawn {
    /**
     * Wether the spawn has renewed a creep this tick
     */
    renewed: boolean

    /**
     * Wether the structure has been transfered or withdrawn from
     */
    hasHadResourcesMoved: boolean
  }

  interface StructureExtension {
    /**
     * Wether the structure has been transfered or withdrawn from
     */
    hasHadResourcesMoved: boolean
  }

  interface StructureTerminal {
    intended: boolean
  }

  interface CustomStore extends StoreDefinition {
    parentID: Id<AnyStoreStructure>
  }

  interface RoomObject {
    // Functions

    // RoomObject getters

    _effectsData: Map<PowerConstant | EffectConstant, RoomObjectEffect>

    readonly effectsData: Map<PowerConstant | EffectConstant, RoomObjectEffect>

    _nextHits: number
    /**
     * The estimated hits amount next tick
     */
    nextHits: number

    _reserveHits: number
    reserveHits: number

    // _nextStore: Partial<StoreDefinition>

    // /**
    //  * The estimated store values next tick
    //  */
    // readonly nextStore: Partial<StoreDefinition>

    _nextStore: Partial<CustomStore>

    /**
     * The estimated store values next tick. Values can be negative
     */
    readonly nextStore: Partial<CustomStore>

    _usedNextStore: number
    /**
     * Can be negative
     */
    readonly usedNextStore: number

    /**
     * Can be negative
     * @deprecated not an accurate measurement when store.getCapacity() without a resource arg often returns null
     */
    readonly freeNextStore: number

    _reserveStore: Partial<CustomStore>

    /**
     * The store values including that reserved by tasks
     */
    readonly reserveStore: Partial<CustomStore>

    _usedReserveStore: number

    readonly usedReserveStore: number

    /**
     * @deprecated not an accurate measurement when store.getCapacity() without a resource arg often returns null
     */
    readonly freeReserveStore: number

    _reservePowers: Set<PowerConstant>

    readonly reservePowers: Set<PowerConstant>
  }

  interface Resource {
    // Getters and setters

    _nextAmount: number
    nextAmount: number

    _reserveAmount: number
    reserveAmount: number
  }

  interface Source {
    communeIndex: number | undefined
    remoteIndex: number | undefined
  }

  // Memory value types

  interface RoomMemory {
    [RoomMemoryKeys.type]: RoomTypes
    [RoomMemoryKeys.lastScout]: number
    [RoomMemoryKeys.danger]?: number
    [RoomMemoryKeys.status]: RoomStatusKeys
    /***
     * The destination roomNames of each portal
     */
    [RoomMemoryKeys.portalsTo]: string[]
    [RoomMemoryKeys.sourceCoords]: string
    [RoomMemoryKeys.controllerCoord]: string

    // Types specific

    [RoomMemoryKeys.owner]: string
    [RoomMemoryKeys.RCL]: number
    [RoomMemoryKeys.powerEnabled]: boolean
    [RoomMemoryKeys.constructionSiteTarget]: Id<ConstructionSite>
    [RoomMemoryKeys.stampAnchors]: PackedStampAnchors
    [RoomMemoryKeys.roadQuota]: number[]
    [RoomMemoryKeys.communeSources]: Id<Source>[]
    [RoomMemoryKeys.communeSourceHarvestPositions]: string[]
    [RoomMemoryKeys.communeSourcePaths]: string[]
    [RoomMemoryKeys.mineralPath]: string
    [RoomMemoryKeys.mineralPositions]: string
    [RoomMemoryKeys.centerUpgradePos]: string
    [RoomMemoryKeys.upgradePositions]: string
    [RoomMemoryKeys.upgradePath]: string
    [RoomMemoryKeys.basePlans]: string
    [RoomMemoryKeys.rampartPlans]: string
    [RoomMemoryKeys.mineral]: Id<Mineral>
    [RoomMemoryKeys.mineralType]: MineralConstant
    [RoomMemoryKeys.score]: number
    [RoomMemoryKeys.dynamicScore]: number
    [RoomMemoryKeys.dynamicScoreUpdate]: number
    [RoomMemoryKeys.communePlanned]: Result.success | Result.fail

    // Commune

    [RoomMemoryKeys.remotes]: string[]
    [RoomMemoryKeys.powerBanks]: { [roomName: string]: number[] }
    [RoomMemoryKeys.deposits]: Record<Id<Deposit>, DepositRecord>
    [RoomMemoryKeys.workRequest]: string
    [RoomMemoryKeys.combatRequests]: string[]
    [RoomMemoryKeys.haulRequests]: string[]
    [RoomMemoryKeys.nukeRequest]: string
    [RoomMemoryKeys.threatened]: number
    [RoomMemoryKeys.lastAttackedBy]: number
    [RoomMemoryKeys.minHaulerCost]: number
    [RoomMemoryKeys.minHaulerCostUpdate]: number
    [RoomMemoryKeys.greatestRCL]: number
    [RoomMemoryKeys.abandonCommune]: boolean
    [RoomMemoryKeys.marketData]: {
      [RESOURCE_ENERGY]?: number
      sellAvg?: { [key in ResourceConstant]?: number }
      buyAvg?: { [key in ResourceConstant]?: number }
      aquire?: { [key in ResourceConstant]?: number }
    }
    [RoomMemoryKeys.factoryProduct]:
      | CommodityConstant
      | MineralConstant
      | RESOURCE_ENERGY
      | RESOURCE_GHODIUM
    [RoomMemoryKeys.factoryUsableResources]: (
      | CommodityConstant
      | MineralConstant
      | RESOURCE_GHODIUM
      | RESOURCE_ENERGY
    )[]

    // Remote

    [RoomMemoryKeys.commune]: string
    [RoomMemoryKeys.maxSourceIncome]: number[]
    [RoomMemoryKeys.remoteSourceHarvesters]: number[]
    [RoomMemoryKeys.haulers]: number[]
    [RoomMemoryKeys.remoteReservers]: number
    [RoomMemoryKeys.remoteCoreAttacker]: number
    [RoomMemoryKeys.remoteBuilder]: number
    [RoomMemoryKeys.remoteDismantler]: number
    [RoomMemoryKeys.abandonRemote]: number
    [RoomMemoryKeys.recursedAbandonment]: boolean
    [RoomMemoryKeys.disable]: boolean
    [RoomMemoryKeys.disableSources]: boolean[]
    [RoomMemoryKeys.enemyReserved]: boolean
    [RoomMemoryKeys.invaderCore]: number
    [RoomMemoryKeys.disableCachedPaths]: boolean
    [RoomMemoryKeys.remotePlanned]: boolean
    [RoomMemoryKeys.remoteStampAnchors]: PackedStampAnchors
    [RoomMemoryKeys.remoteControllerPath]: string
    [RoomMemoryKeys.remoteControllerPositions]: string
    [RoomMemoryKeys.remoteSources]: Id<Source>[]
    [RoomMemoryKeys.remoteSourceHarvestPositions]: string[]
    [RoomMemoryKeys.remoteSourceFastFillerPaths]: string[]
    [RoomMemoryKeys.remoteSourceHubPaths]: string[]
    [RoomMemoryKeys.clearedEnemyStructures]: boolean
    [RoomMemoryKeys.lastStructureCheck]: number
    [RoomMemoryKeys.roads]: number[]
    [RoomMemoryKeys.remoteSourceCredit]: number[]
    [RoomMemoryKeys.remoteSourceCreditChange]: number[]
    [RoomMemoryKeys.remoteSourceCreditReservation]: number[]
    [RoomMemoryKeys.hasContainer]: boolean[]
    [RoomMemoryKeys.pathsThrough]: string[]

    // Ally

    // Enemy

    [RoomMemoryKeys.terminal]: boolean
    [RoomMemoryKeys.towers]: number
    [RoomMemoryKeys.energy]: number
    [RoomMemoryKeys.defensiveStrength]: number
    [RoomMemoryKeys.offensiveThreat]: number

    // Source Keeper

    [RoomMemoryKeys.keeperLairCoords]: string
  }

  interface CreepMemory {
    [CreepMemoryKeys.commune]: string
    [CreepMemoryKeys.preferRoads]: boolean
    [CreepMemoryKeys.sourceIndex]: number
    [CreepMemoryKeys.dying]: boolean
    [CreepMemoryKeys.packedCoord]: string
    [CreepMemoryKeys.path]: string
    [CreepMemoryKeys.goalPos]: string
    [CreepMemoryKeys.usedPathForGoal]: string
    [CreepMemoryKeys.lastCache]: number
    [CreepMemoryKeys.structureTarget]: Id<Structure<BuildableStructureConstant>>
    [CreepMemoryKeys.remote]: string
    [CreepMemoryKeys.scoutTarget]: string
    [CreepMemoryKeys.signTarget]: string | false
    [CreepMemoryKeys.roomLogisticsRequests]: CreepLogisticsRequest[]
    [CreepMemoryKeys.needsResources]: boolean
    [CreepMemoryKeys.squadSize]: number
    [CreepMemoryKeys.squadType]: SquadTypes
    [CreepMemoryKeys.squadCombatType]: SquadCombatTypes
    [CreepMemoryKeys.isSquadFormed]: boolean
    [CreepMemoryKeys.squadMembers]: string[]
    [CreepMemoryKeys.quadBulldozeTargets]: Id<Structure>[]
    [CreepMemoryKeys.haulRequest]: string
    [CreepMemoryKeys.ticksWaited]: number
    [CreepMemoryKeys.recycleTarget]: Id<StructureSpawn | StructureContainer> | undefined
    [CreepMemoryKeys.rampartOnlyShoving]: boolean
    [CreepMemoryKeys.rampartTarget]: Id<StructureRampart>
    [CreepMemoryKeys.taskRoom]: string
    [CreepMemoryKeys.getPulled]: boolean
    [CreepMemoryKeys.combatRequest]: string
    [CreepMemoryKeys.workRequest]: string
    /**
     * Wether the creep is/was trying to flee for their designated
     */
    [CreepMemoryKeys.flee]: boolean
    [CreepMemoryKeys.squadMoveType]: SquadMoveTypes
    /**
     * A command to wait until the designated tick to perform an specified action
     */
    [CreepMemoryKeys.sleepFor]: SleepFor
    [CreepMemoryKeys.sleepTime]: number
    /**
     * An ambigious target the creep is after, probably for target locking
     */
    [CreepMemoryKeys.targetID]: Id<Structure | Creep | PowerCreep | Tombstone | Ruin>
    // The name of the trader and tick for the previos relay action
    [CreepMemoryKeys.previousRelayer]: [string, number]
    [CreepMemoryKeys.stationary]: boolean
    [CreepMemoryKeys.defaultParts]: number
    [CreepMemoryKeys.cost]: number
    [CreepMemoryKeys.task]: CreepTask

    // Power Creep

    [CreepMemoryKeys.powerTask]: CreepPowerTask
  }

  interface PowerCreepMemory extends CreepMemory {}

  interface UserScriptTemplate {
    /**
     * Run at the start of the tick
     */
    initialRun(): void
    /**
     * Run at the middle of the tick
     */
    run(): void
    /**
     * Run at the end of the tick
     */
    endRun(): void
  }

  // Global

  namespace NodeJS {
    interface Global {
      // User custom

      collectivizer: TCollectivizer

      settings: Settings
      // Intentionally unused
      settingsExample: Settings

      userScript: UserScriptTemplate
      // intentionally unused
      userScriptExample: UserScriptTemplate

      //

      Memory: Memory

      /**
       * Whether global is constructed or not
       */
      constructed: true | undefined

      lastReset: number

      DebugUtils: DebugUtils

      // Command functions

      stringify(v: any, maxDepth: number): void
      roughSizeOfObject(object: any): void

      /**
       * Deletes all properties of global
       */
      clearGlobal(): void

      /**
       * Deletes all properties of Memory
       */
      clearMemory(): string

      /**
       * Kills all creeps owned by the bot
       */
      killCreeps(roles?: CreepRoles[]): string

      killPowerCreeps(): string

      /**
       * Removes all specified construction sites owned by the bot
       */
      removeCSites(removeInProgress?: boolean, types?: BuildableStructureConstant[]): string

      /**
       * Destroys all specified structures owned by the bot
       */
      destroyStructures(roomName: string, types?: StructureConstant[]): string

      /**
       * Destroys all specified structures in communes
       */
      destroyCommuneStructures(types?: StructureConstant[]): string

      /**
       * Responds, or if needed, creates, a claim request for a specified room, by a specified room
       * @param requestName The roomName of the workRequest to respond to
       * @param commune The commune to respond to the workRequest
       */
      claim(requestName: string, communeName?: string, score?: number): string

      /**
       * Deletes workRequests for a specified room, if there are any
       * @param roomName The roomName of the workRequest to delete
       */
      deleteWorkRequest(roomName: string): string

      deleteWorkRequests(): string

      /**
       * Responds, or if needed, creates, an attack request for a specified room, by a specified room
       */
      combat(
        requestName: string,
        type: CombatRequestTypes,
        opts?: Partial<{ [key in keyof typeof CombatRequestKeys]: CombatRequestKeys }>,
        communeName?: string,
      ): string

      /**
       * Deletes combatRequests for a specified room, if there are any
       */
      deleteCombatRequest(requestName: string): string

      deleteBasePlans(roomName?: string): string

      usedHeap(): string
    }
  }

  interface StringMap<T> {
    [key: string]: T
  }
  type StringMapGeneric<V, K extends string> = {
    [key in K]: V
  }
}
