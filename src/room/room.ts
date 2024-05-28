import {
  CreepMemoryKeys,
  PlayerMemoryKeys,
  ReservedCoordTypes,
  Result,
  RoomLogisticsRequestTypes,
  RoomMemoryKeys,
  RoomTypes,
  adjacentOffsets,
  allStructureTypes,
  combatTargetStructureTypes,
  creepRoles,
  customColors,
  defaultRoadPlanningPlainCost,
  defaultStructureTypesByBuildPriority,
  defaultSwampCost,
  dynamicScoreRoomRange,
  impassibleStructureTypes,
  maxControllerLevel,
  packedPosLength,
  powerCreepClassNames,
  preferredCommuneRange,
  quadAttackMemberOffsets,
  remoteTypeWeights,
  roomDimensions,
  roomTypesUsedForStats,
} from '../constants/general'
import {
  findClosestObject,
  findHighestScore,
  findObjectWithID,
  forAdjacentCoords,
  forCoordsInRange,
  forRoomNamesAroundRangeXY,
  getRange,
  getRangeXY,
  isAlly,
  packAsNum,
  packXYAsNum,
  randomTick,
  sortBy,
} from 'utils/utils'
import { CommuneManager } from './commune/commune'
import { CreepRoleManager } from './creeps/creepRoleManager'
import { PowerCreepRoleManager } from './creeps/powerCreepRoleManager'
import { RoomVisualsManager } from './roomVisuals'
import { StatsManager } from 'international/stats'
import { CommunePlanner } from './construction/communePlanner'
import {
  packCoord,
  packPosList,
  packXYAsCoord,
  unpackCoord,
  unpackPos,
  unpackPosAt,
  unpackPosList,
  unpackStampAnchors,
} from 'other/codec'
import { BasePlans } from './construction/basePlans'
import { RampartPlans } from './construction/rampartPlans'
import { PathGoal, CustomPathFinder } from 'international/customPathFinder'
import { RoomNameUtils } from './roomNameUtils'
import { CollectiveManager } from 'international/collective'
import { LogOps } from 'utils/logOps'
import { StructureUtils } from './structureUtils'
import { LogisticsProcs } from './logisticsProcs'
import { CommuneOps } from './commune/communeOps'
import { roomData } from './roomData'
import { RoomOps } from './roomOps'

export interface InterpretedRoomEvent {
  eventType: EventConstant
  actionType?: EventAttackType | EventHealType
  amount?: number
  target?: Id<Creep | PowerCreep | Structure | Resource | Ruin | Tombstone>
}

export interface DeadCreepNames {
  my: Set<string>
  enemy: Set<string>
  ally: Set<string>
}

export interface NotMyCreeps {
  ally: Creep[]
  enemy: Creep[]
  invader: Creep[]
}

export interface NotMyConstructionSites {
  ally: ConstructionSite[]
  enemy: ConstructionSite[]
}

export class RoomManager {
  static roomManagers: { [roomName: string]: RoomManager } = {}

  // sub managers

  communePlanner: CommunePlanner

  creepRoleManager: CreepRoleManager
  powerCreepRoleManager: PowerCreepRoleManager
  roomVisualsManager: RoomVisualsManager

  constructor() {
    this.communePlanner = new CommunePlanner(this)

    this.creepRoleManager = new CreepRoleManager(this)
    this.powerCreepRoleManager = new PowerCreepRoleManager(this)
    this.roomVisualsManager = new RoomVisualsManager(this)
  }

  room: Room
  /**
   * Incremental order of recursive move request attempts
   */
  recurseMoveRequestOrder = 0
  /**
   * Incremental order of move request runs
   */
  runMoveRequestOrder = 0
  /**
   * Packed coords reserved by creeps
   */
  reservedCoords: Map<string, ReservedCoordTypes>
  roomLogisticsBlacklistCoords: Set<string> = new Set()

  findRemoteSources(commune: Room) {
    const anchor = commune.roomManager.anchor
    if (!anchor) throw Error('No anchor for remote source harvest positions ' + this.room.name)

    const sources = RoomOps.getSources(this.room)

    sortBy(
      sources,
      ({ pos }) =>
        CustomPathFinder.findPath({
          origin: pos,
          goals: [{ pos: anchor, range: 3 }],
        }).length,
    )

    return sources.map(source => source.id)
  }

  findRemoteSourceHarvestPositions(commune: Room, packedRemoteSources: Id<Source>[]) {
    const anchor = commune.roomManager.anchor
    if (!anchor) throw Error('No anchor for remote source harvest positions ' + this.room.name)

    const terrain = this.room.getTerrain()
    const sourceHarvestPositions: RoomPosition[][] = []

    for (const sourceID of packedRemoteSources) {
      const source = findObjectWithID(sourceID)
      const positions = []

      // Loop through each pos

      for (const pos of this.room.findAdjacentPositions(source.pos.x, source.pos.y)) {
        // Iterate if terrain for pos is a wall

        if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) continue

        // Add pos to harvestPositions

        positions.push(pos)
      }

      sortBy(
        positions,
        origin =>
          CustomPathFinder.findPath({
            origin,
            goals: [{ pos: anchor, range: 3 }],
          }).length,
      )

      sourceHarvestPositions.push(positions)
    }

    return sourceHarvestPositions.map(positions => packPosList(positions))
  }

  findRemoteSourceFastFillerPaths(
    commune: Room,
    packedRemoteSourceHarvestPositions: string[],
    weightCoords: { [packedCoord: string]: number },
    pathsThrough: Set<string>,
  ) {
    const anchor = commune.roomManager.anchor
    if (!anchor) throw Error('No anchor for remote source harvest paths' + this.room.name)

    const sourcePaths: RoomPosition[][] = []

    for (let i = 0; i < packedRemoteSourceHarvestPositions.length; i += 1) {
      const positions = packedRemoteSourceHarvestPositions[i]
      const origin = unpackPosAt(positions, 0)

      const path = CustomPathFinder.findPath({
        origin,
        goals: [{ pos: anchor, range: 3 }],
        typeWeights: remoteTypeWeights,
        plainCost: defaultRoadPlanningPlainCost,
        weightCoords: {
          [this.room.name]: weightCoords,
        },
        weightCoordMapsForRoomName(roomName) {
          return RoomNameUtils.diagonalCoords(roomName, commune)
        },
        weightCommuneStructurePlans: true,
        weightRemoteStructurePlans: {
          remoteResourcePathType: RoomMemoryKeys.remoteSourceFastFillerPaths,
        },
      })

      for (const pos of path) {
        pathsThrough.add(pos.roomName)
      }

      sourcePaths.push(path)
    }

    /*
        for (const index in sourcePaths) {
            const path = sourcePaths[index]
            if (!path.length) throw Error('no source path found for index ' + index + ' for ' + this.room.name + ', ' + JSON.stringify(sourcePaths) + ', ' + packedRemoteSourceHarvestPositions)
        }
 */
    return sourcePaths.map(path => packPosList(path))
  }

  findRemoteSourceHubPaths(
    commune: Room,
    packedRemoteSourceHarvestPositions: string[],
    weightCoords: { [packedCoord: string]: number },
    pathsThrough: Set<string>,
  ) {
    const stampAnchors = commune.roomManager.stampAnchors
    if (!stampAnchors) throw Error('no stampAnchors for ' + commune.name)

    const basePlans = commune.roomManager.basePlans
    let goalPos: RoomPosition

    // find the coord of the planned storage and make that the goal

    forAdjacentCoords(stampAnchors.hub[0], coord => {
      const coordData = basePlans.map[packCoord(coord)]
      if (!coordData) return undefined

      for (const data of coordData) {
        if (data.structureType !== STRUCTURE_STORAGE) continue

        goalPos = new RoomPosition(coord.x, coord.y, commune.name)
        return Result.stop
      }
      return undefined
    })

    const sourcePaths: RoomPosition[][] = []

    for (let i = 0; i < packedRemoteSourceHarvestPositions.length; i += 1) {
      const positions = packedRemoteSourceHarvestPositions[i]
      const origin = unpackPosAt(positions, 0)

      const path = CustomPathFinder.findPath({
        origin,
        goals: [{ pos: goalPos, range: 1 }],
        typeWeights: remoteTypeWeights,
        plainCost: defaultRoadPlanningPlainCost,
        weightCoords: {
          [this.room.name]: weightCoords,
        },
        weightCoordMapsForRoomName(roomName) {
          return RoomNameUtils.diagonalCoords(roomName, commune)
        },
        weightCommuneStructurePlans: true,
        weightRemoteStructurePlans: {
          remoteResourcePathType: RoomMemoryKeys.remoteSourceHubPaths,
        },
      })

      for (const pos of path) {
        pathsThrough.add(pos.roomName)
      }

      sourcePaths.push(path)
    }
    /*
        for (const index in sourcePaths) {
            const path = sourcePaths[index]
            if (!path.length) throw Error('no source path found for index ' + index + ' for ' + this.room.name + ', ' + JSON.stringify(sourcePaths) + ', ' + packedRemoteSourceHarvestPositions)
        }
 */
    return sourcePaths.map(path => packPosList(path))
  }

  findRemoteControllerPositions(commune: Room) {
    const anchor = commune.roomManager.anchor
    if (!anchor) throw Error('no anchor found for controller positions ' + this.room.name)

    const positions: RoomPosition[] = []
    const controllerPos = this.room.controller.pos
    const terrain = this.room.getTerrain()

    for (let offset of adjacentOffsets) {
      const adjPos = new RoomPosition(
        offset.x + controllerPos.x,
        offset.y + controllerPos.y,
        this.room.name,
      )

      if (terrain.get(adjPos.x, adjPos.y) === TERRAIN_MASK_WALL) continue

      positions.push(adjPos)
    }

    sortBy(
      positions,
      origin =>
        CustomPathFinder.findPath({
          origin,
          goals: [{ pos: anchor, range: 3 }],
        }).length,
    )

    return packPosList(positions)
  }

  findRemoteControllerPath(
    commune: Room,
    packedRemoteControllerPositions: string,
    weightCoords: { [packedCoord: string]: number },
    pathsThrough: Set<string>,
  ) {
    const anchor = commune.roomManager.anchor
    if (!anchor) throw Error('No anchor for remote controller path' + this.room.name)

    const origin = unpackPosAt(packedRemoteControllerPositions, 0)
    const path = CustomPathFinder.findPath({
      origin,
      goals: [{ pos: anchor, range: 3 }],
      typeWeights: remoteTypeWeights,
      plainCost: defaultRoadPlanningPlainCost,
      weightCoords: {
        [this.room.name]: weightCoords,
      },
      weightCoordMapsForRoomName(roomName) {
        return RoomNameUtils.diagonalCoords(roomName, commune)
      },
      weightCommuneStructurePlans: true,
      weightRemoteStructurePlans: {
        remoteResourcePathType: RoomMemoryKeys.remoteSourceFastFillerPaths,
      },
    })

    for (const pos of path) {
      pathsThrough.add(pos.roomName)
    }

    return packPosList(path)
  }

  isStartRoom() {
    return (
      CollectiveManager.communes.size === 1 &&
      this.room.controller.my &&
      this.room.controller.safeMode &&
      CollectiveManager.communes.has(this.room.name)
    )
  }

  reserveCoord(packedCoord: string, newCoordType: ReservedCoordTypes) {
    const currentCoordType = this.reservedCoords.get(packedCoord) || ReservedCoordTypes.normal
    if (currentCoordType) {
      this.reservedCoords.set(packedCoord, Math.max(currentCoordType, newCoordType))
      return
    }

    this.reservedCoords.set(packedCoord, newCoordType)
  }

  _anchor: RoomPosition
  get anchor() {
    if (this._anchor !== undefined) return this._anchor

    const stampAnchors = this.stampAnchors
    if (!stampAnchors) return false

    return (this._anchor = new RoomPosition(
      stampAnchors.fastFiller[0].x,
      stampAnchors.fastFiller[0].y,
      this.room.name,
    ))
  }

  _mineral: Mineral
  get mineral() {
    if (this._mineral) return this._mineral

    const mineralID = Memory.rooms[this.room.name][RoomMemoryKeys.mineral]
    if (mineralID) return findObjectWithID(mineralID)

    const mineral = this.room.find(FIND_MINERALS)[0]
    Memory.rooms[this.room.name][RoomMemoryKeys.mineral] = mineral.id

    return (this._mineral = mineral)
  }

  _nukeTargetCoords: Uint8Array
  get nukeTargetCoords() {
    if (this._nukeTargetCoords) return this._nukeTargetCoords

    this._nukeTargetCoords = new Uint8Array(roomDimensions * roomDimensions)

    for (const nuke of this.room.find(FIND_NUKES)) {
      this._nukeTargetCoords[packAsNum(nuke.pos)] += NUKE_DAMAGE[0]

      forCoordsInRange(nuke.pos, 2, adjCoord => {
        this._nukeTargetCoords[packAsNum(adjCoord)] += NUKE_DAMAGE[2]
      })
    }

    return this._nukeTargetCoords
  }

  _stampAnchors: StampAnchors
  get stampAnchors() {
    if (this._stampAnchors !== undefined) return this._stampAnchors

    const packedStampAnchors = this.room.memory[RoomMemoryKeys.stampAnchors]
    if (!packedStampAnchors) return false

    return (this._stampAnchors = unpackStampAnchors(packedStampAnchors))
  }

  /**
   * Sources sorted by optimal commune utilization
   */
  _communeSources: Source[]
  get communeSources() {
    if (this._communeSources) return this._communeSources

    const sourceIDs = this.room.memory[RoomMemoryKeys.communeSources]
    if (!sourceIDs) throw Error('No commune sources ' + this.room.name)
    this._communeSources = []

    for (let i = 0; i < sourceIDs.length; i++) {
      const source = findObjectWithID(sourceIDs[i])

      source.communeIndex = i
      this._communeSources.push(source)
    }

    return this._communeSources
  }

  /**
   * Sources sorted for optimal remotes utilization
   */
  _remoteSources: Source[]
  get remoteSources() {
    if (this._remoteSources) return this._remoteSources

    const sourceIDs = this.room.memory[RoomMemoryKeys.remoteSources]
    if (!sourceIDs) {
      throw Error('No remote sources ' + this.room.name)
    }

    this._remoteSources = []

    for (let i = 0; i < sourceIDs.length; i++) {
      const source = findObjectWithID(sourceIDs[i])

      source.remoteIndex = i
      this._remoteSources.push(source)
    }

    return this._remoteSources
  }

  _sourceHarvestPositions: RoomPosition[][]
  get sourceHarvestPositions() {
    if (this._sourceHarvestPositions) return this._sourceHarvestPositions

    const sourceHarvestPositions: RoomPosition[][] = []
    const terrain = this.room.getTerrain()
    const sources = RoomOps.getSources(this.room)

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]
      sourceHarvestPositions.push([])

      for (const pos of this.room.findAdjacentPositions(source.pos.x, source.pos.y)) {
        if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) continue

        sourceHarvestPositions[i].push(pos)
      }
    }

    return (this._sourceHarvestPositions = sourceHarvestPositions)
  }

  _communeSourceHarvestPositions: RoomPosition[][]
  get communeSourceHarvestPositions() {
    if (this._communeSourceHarvestPositions) return this._communeSourceHarvestPositions

    const packedSourceHarvestPositions =
      Memory.rooms[this.room.name][RoomMemoryKeys.communeSourceHarvestPositions]

    if (!packedSourceHarvestPositions)
      throw Error('No commune source harvest positions ' + this.room.name)

    return (this._communeSourceHarvestPositions = packedSourceHarvestPositions.map(positions =>
      unpackPosList(positions),
    ))
  }

  _remoteSourceHarvestPositions: RoomPosition[][]
  get remoteSourceHarvestPositions() {
    if (this._remoteSourceHarvestPositions) return this._remoteSourceHarvestPositions

    const packedSourceHarvestPositions =
      Memory.rooms[this.room.name][RoomMemoryKeys.remoteSourceHarvestPositions]
    if (!packedSourceHarvestPositions)
      throw Error('No remote source harvest positions ' + this.room.name)

    return (this._remoteSourceHarvestPositions = packedSourceHarvestPositions.map(positions =>
      unpackPosList(positions),
    ))
  }

  _communeSourcePaths: RoomPosition[][]
  get communeSourcePaths() {
    if (this._communeSourcePaths) return this._communeSourcePaths

    const packedSourcePaths = Memory.rooms[this.room.name][RoomMemoryKeys.communeSourcePaths]
    if (!packedSourcePaths) throw Error('No commune source paths ' + this.room.name)

    return (this._communeSourcePaths = packedSourcePaths.map(positions => unpackPosList(positions)))
  }

  _remoteSourcePaths: RoomPosition[][]
  get remoteSourcePaths() {
    if (this._remoteSourcePaths) return this._remoteSourcePaths

    const packedSourcePaths =
      Memory.rooms[this.room.name][RoomMemoryKeys.remoteSourceFastFillerPaths]
    if (!packedSourcePaths) throw Error('No remote source paths ' + this.room.name)

    return (this._remoteSourcePaths = packedSourcePaths.map(positions => unpackPosList(positions)))
  }

  _centerUpgradePos: RoomPosition
  get centerUpgradePos() {
    if (this._centerUpgradePos) return this._centerUpgradePos

    const packedPos = Memory.rooms[this.room.name][RoomMemoryKeys.centerUpgradePos]
    if (!packedPos) throw Error('No center upgrade pos ' + this.room.name)

    return (this._centerUpgradePos = unpackPos(packedPos))
  }

  _upgradePositions: RoomPosition[]
  get upgradePositions() {
    if (this._upgradePositions && !this.structureUpdate) return this._upgradePositions

    // Get the center upgrade pos, stopping if it's undefined

    const centerUpgradePos = this.centerUpgradePos

    const anchor = this.anchor
    if (!anchor) throw Error('No anchor for upgrade positions ' + this.room.name)

    const positions: RoomPosition[] = []
    const terrain = this.room.getTerrain()

    for (const offset of adjacentOffsets) {
      const adjPos = new RoomPosition(
        offset.x + centerUpgradePos.x,
        offset.y + centerUpgradePos.y,
        this.room.name,
      )

      if (terrain.get(adjPos.x, adjPos.y) === TERRAIN_MASK_WALL) continue

      positions.push(adjPos)
    }

    sortBy(
      positions,
      origin =>
        CustomPathFinder.findPath({
          origin,
          goals: [{ pos: anchor, range: 4 }],
        }).length,
    )

    /*
        // Make the closest pos the last to be chosen
        positions.push(positions.shift()) */

    // Make the center pos the first to be chosen (we want upgraders to stand on the container)
    const controllerLink = this.room.communeManager.controllerLink
    if (!controllerLink) {
      positions.shift()
      positions.unshift(centerUpgradePos)
    }

    return (this._upgradePositions = positions)
  }

  _mineralHarvestPositions: RoomPosition[]
  get mineralHarvestPositions() {
    if (this._mineralHarvestPositions) return this._mineralHarvestPositions

    const packedPositions = this.room.memory[RoomMemoryKeys.mineralPositions]
    if (!packedPositions) throw Error('No mineral harvest positions ' + this.room.name)

    return (this._mineralHarvestPositions = unpackPosList(packedPositions))
  }

  _remoteControllerPositions: RoomPosition[]
  get remoteControllerPositions() {
    if (this._remoteControllerPositions) return this._remoteControllerPositions

    const roomMemory = Memory.rooms[this.room.name]
    const packedRemoteControllerPositions = roomMemory[RoomMemoryKeys.remoteControllerPositions]
    if (packedRemoteControllerPositions) {
      return (this._remoteControllerPositions = unpackPosList(packedRemoteControllerPositions))
    }

    throw Error('No remote controller positions ' + this.room.name)
  }

  _remoteControllerPath: RoomPosition[]
  get remoteControllerPath() {
    if (this._remoteControllerPath) return this._remoteControllerPath

    const packedPath = this.room.memory[RoomMemoryKeys.remoteControllerPath]
    if (packedPath) {
      return (this._remoteControllerPath = unpackPosList(packedPath))
    }

    throw Error('No remote controller path ' + this.room.name)
  }

  get cSiteTarget() {
    const roomMemory = Memory.rooms[this.room.name]
    if (roomMemory[RoomMemoryKeys.constructionSiteTarget]) {
      const cSiteTarget = findObjectWithID(roomMemory[RoomMemoryKeys.constructionSiteTarget])
      if (cSiteTarget) return cSiteTarget
    }

    if (!this.room.find(FIND_MY_CONSTRUCTION_SITES).length) return false

    let totalX = 0
    let totalY = 0
    let count = 1

    const anchor = this.anchor
    if (anchor) {
      totalX += anchor.x
      totalY += anchor.y
    } else {
      totalX += 25
      totalX += 25
    }

    for (const creepName of this.room.myCreepsByRole.builder) {
      const pos = Game.creeps[creepName].pos

      totalX += pos.x
      totalY += pos.y
      count += 1
    }

    const searchAnchor = new RoomPosition(
      Math.floor(totalX / count),
      Math.floor(totalY / count),
      this.room.name,
    )
    const cSites = this.cSites

    // Loop through structuretypes of the build priority

    for (const structureType of defaultStructureTypesByBuildPriority) {
      const cSitesOfType = cSites[structureType]
      if (!cSitesOfType.length) continue

      let target = searchAnchor.findClosestByPath(cSitesOfType, {
        ignoreCreeps: true,
        ignoreDestructibleStructures: true,
        range: 3,
      })

      if (!target) target = findClosestObject(searchAnchor, cSitesOfType)

      roomMemory[RoomMemoryKeys.constructionSiteTarget] = target.id
      return target
    }

    return false
  }

  allStructureIDs: Id<Structure<StructureConstant>>[]
  /**
   * true if there has been a structure update this tick
   */
  _structureUpdate: boolean
  /**
   * Checks if there has been a structure cache update, running one if there hasn't. Only use this for static properties, and not hits, store, etc.
   */
  get structureUpdate() {
    if (this._structureUpdate === true) return false

    let newAllStructures: Structure[]

    if (this.allStructureIDs) {
      newAllStructures = this.room.find(FIND_STRUCTURES)

      if (newAllStructures.length === this.allStructureIDs.length) {
        const allStructures: Structure[] = []
        let change: true | undefined

        for (const ID of this.allStructureIDs) {
          const structure = findObjectWithID(ID)
          if (!structure) {
            change = true
            break
          }

          allStructures.push(structure)
        }

        if (!change && allStructures.length === this.allStructureIDs.length) {
          return (this._structureUpdate = false)
        }
      }
    }

    // Structures have been added, destroyed or aren't yet initialized

    this._structureCoords = undefined
    this.sourceContainerIDs = undefined

    const data = roomData[this.room.name]
    data.fastFillerCoords = undefined

    const communeManager = this.room.communeManager
    if (communeManager) {
      communeManager.actionableSpawningStructuresIDs = undefined
      communeManager.spawningStructuresByPriorityIDs = undefined
      communeManager._fastFillerSpawnEnergyCapacity = undefined
      communeManager.sourceLinkIDs = undefined

      this.fastFillerContainerIDs = undefined
      this._upgradePositions = undefined
    }

    if (!newAllStructures) newAllStructures = this.room.find(FIND_STRUCTURES)

    this.allStructureIDs = newAllStructures.map(structure => structure.id)
    return (this._structureUpdate = true)
  }

  _structureCoords: StructureCoords
  get structureCoords() {
    if (this._structureCoords && !this.structureUpdate) return this._structureCoords

    // Construct storage of structures based on structureType

    const structureCoords: StructureCoords = new Map()

    // Group structures by structureType

    for (const structure of this.room.find(FIND_STRUCTURES)) {
      const packedCoord = packCoord(structure.pos)

      const coordStructureIDs = structureCoords.get(packedCoord)
      if (!coordStructureIDs) {
        structureCoords.set(packedCoord, [structure.id])
        continue
      }
      coordStructureIDs.push(structure.id)
    }

    this._structureCoords = structureCoords
    return this._structureCoords
  }

  _structures: Partial<OrganizedStructures>
  get structures() {
    if (this._structures) return this._structures

    this._structures = {}
    for (const structureType of allStructureTypes) this._structures[structureType] = []

    // Group structures by structureType

    for (const structure of this.room.find(FIND_STRUCTURES))
      this._structures[structure.structureType].push(structure as any)

    return this._structures
  }

  cSiteIDs: Id<ConstructionSite<BuildableStructureConstant>>[]
  checkedCSiteUpdate: boolean
  get cSiteUpdate() {
    if (this.checkedCSiteUpdate === true) return false

    let newAllCSites: ConstructionSite[]

    if (this.cSiteIDs) {
      newAllCSites = this.room.find(FIND_CONSTRUCTION_SITES)

      if (newAllCSites.length === this.cSiteIDs.length) {
        const allCSites: ConstructionSite[] = []
        let change: true | undefined

        for (const ID of this.cSiteIDs) {
          const cSite = findObjectWithID(ID)
          if (!cSite) {
            change = true
            break
          }

          allCSites.push(cSite)
        }

        if (!change && allCSites.length === this.cSiteIDs.length) {
          return (this.checkedCSiteUpdate = false)
        }
      }
    }

    // construction sites have been added, destroyed or aren't yet initialized

    delete this._cSiteCoords

    if (!newAllCSites) newAllCSites = this.room.find(FIND_CONSTRUCTION_SITES)

    this.cSiteIDs = newAllCSites.map(cSite => cSite.id)
    return (this.checkedCSiteUpdate = true)
  }

  _cSiteCoords: Map<string, Id<ConstructionSite<BuildableStructureConstant>>[]>
  get cSiteCoords() {
    if (this._cSiteCoords && !this.cSiteUpdate) return this._cSiteCoords

    // Construct storage of structures based on structureType

    const cSiteCoords: Map<string, Id<ConstructionSite<BuildableStructureConstant>>[]> = new Map()

    // Group structures by structureType

    for (const cSite of this.room.find(FIND_CONSTRUCTION_SITES)) {
      const packedCoord = packCoord(cSite.pos)

      const coordStructureIDs = cSiteCoords.get(packedCoord)
      if (!coordStructureIDs) {
        cSiteCoords.set(packedCoord, [cSite.id])
        continue
      }
      coordStructureIDs.push(cSite.id)
    }

    this._cSiteCoords = cSiteCoords
    return this._cSiteCoords
  }

  _cSites: Partial<Record<StructureConstant, ConstructionSite<BuildableStructureConstant>[]>>
  get cSites() {
    if (this._cSites) return this._cSites

    this._cSites = {}
    for (const structureType of allStructureTypes) this._cSites[structureType] = []

    // Group structures by structureType

    for (const cSite of this.room.find(FIND_CONSTRUCTION_SITES))
      this._cSites[cSite.structureType].push(cSite)

    return this._cSites
  }

  _notMyCreeps: NotMyCreeps
  /**
   * Creeps that are not owned by me
   */
  get notMyCreeps() {
    if (this._notMyCreeps) return this._notMyCreeps

    const notMyCreeps: NotMyCreeps = {
      ally: [],
      enemy: [],
      invader: [],
    }

    for (const creep of this.room.find(FIND_HOSTILE_CREEPS)) {
      if (isAlly(creep.owner.username)) {
        notMyCreeps.ally.push(creep)
        continue
      }

      if (creep.owner.username == 'Invader') {
        notMyCreeps.invader.push(creep)

        // TODO: Clean up invader checks on notMyCreeps.enemy(attackers) references

        // continue // Remove once TODO is completed
      }

      // The creep isn't of an ally, so it's of an enemy!

      notMyCreeps.enemy.push(creep)
    }

    return (this._notMyCreeps = notMyCreeps)
  }

  _enemyAttackers: Creep[]
  get enemyAttackers() {
    if (this._enemyAttackers) return this._enemyAttackers

    // If commune, include creeps that can damage structures

    if (Memory.rooms[this.room.name][RoomMemoryKeys.type] === RoomTypes.commune) {
      const enemyAttackers = this.notMyCreeps.enemy.filter(function (creep) {
        return (
          creep.parts.attack + creep.parts.ranged_attack + creep.parts.work + creep.parts.heal > 0
        )
      })
      return (this._enemyAttackers = enemyAttackers)
    }

    const enemyAttackers = this.notMyCreeps.enemy.filter(function (creep) {
      return creep.parts.attack + creep.parts.ranged_attack + creep.parts.heal > 0
    })
    return (this._enemyAttackers = enemyAttackers)
  }

  _myDamagedCreeps: Creep[]
  get myDamagedCreeps() {
    if (this._myDamagedCreeps) return this._myDamagedCreeps

    const myDamagedCreeps = this.room.myCreeps.filter(creep => creep.hits < creep.hitsMax)

    return (this._myDamagedCreeps = myDamagedCreeps)
  }

  _myDamagedPowerCreeps: PowerCreep[]
  get myDamagedPowerCreeps() {
    if (this._myDamagedPowerCreeps) return this._myDamagedPowerCreeps

    const myDamagedPowerCreeps = this.room.myPowerCreeps.filter(creep => creep.hits < creep.hitsMax)

    return (this._myDamagedPowerCreeps = myDamagedPowerCreeps)
  }

  _allyDamagedCreeps: Creep[]
  get allyDamagedCreeps() {
    if (this._allyDamagedCreeps) return this._allyDamagedCreeps

    const allyDamagedCreeps = this.notMyCreeps.enemy.filter(creep => {
      return creep.hits < creep.hitsMax
    })

    return (this._allyDamagedCreeps = allyDamagedCreeps)
  }

  _enemyCreepPositions: { [packedCoord: string]: Id<Creep> }
  get enemyCreepPositions() {
    const enemyCreepPositions: { [packedCoord: string]: Id<Creep> } = {}

    for (const creep of this.notMyCreeps.enemy) {
      const packedCoord = packCoord(creep.pos)
      enemyCreepPositions[packedCoord] = creep.id
    }

    return (this._enemyCreepPositions = enemyCreepPositions)
  }

  _enemySquadData: EnemySquadData
  get enemySquadData() {
    if (this._enemySquadData) return this._enemySquadData

    const highestEnemySquadData: EnemySquadData = {
      highestMeleeDamage: 0,
      highestRangedDamage: 0,
      highestHeal: 0,
      highestDismantle: 0,
    }
    const enemyCreeps = this.notMyCreeps.enemy
    if (!enemyCreeps.length) return (this._enemySquadData = highestEnemySquadData)

    const enemyCreepIDs = new Set(enemyCreeps.map(creep => creep.id))

    // For each creep, makeup a quad of creep around them

    for (const creepID of enemyCreepIDs) {
      const creep = findObjectWithID(creepID)
      const squadData: EnemySquadData = {
        highestMeleeDamage: 0,
        highestRangedDamage: 0,
        highestHeal: 0,
        highestDismantle: 0,
      }

      for (const offset of quadAttackMemberOffsets) {
        const coord = {
          x: creep.pos.x + offset.x,
          y: creep.pos.y + offset.y,
        }

        const creepIDAtPos = this.enemyCreepPositions[packCoord(coord)]
        if (!creepIDAtPos) continue

        const creepAtPos = findObjectWithID(creepIDAtPos)
        const creepAtPosCombatStrength = creepAtPos.combatStrength

        squadData.highestMeleeDamage +=
          creepAtPosCombatStrength.melee + creepAtPosCombatStrength.ranged
        squadData.highestRangedDamage += creepAtPosCombatStrength.ranged
        squadData.highestHeal += creepAtPosCombatStrength.heal
        squadData.highestDismantle += creepAtPosCombatStrength.dismantle
      }

      for (let x in squadData) {
        const key = x as keyof EnemySquadData

        if (squadData[key] <= highestEnemySquadData[key]) continue

        highestEnemySquadData[key] = squadData[key]
      }
    }

    return (this._enemySquadData = highestEnemySquadData)
  }

  /* TODO */
  _events: { [targetID: string]: InterpretedRoomEvent }
  get events() {
    if (this._events) return this._events

    const eventLog = this.room.getEventLog()
    const events: { [targetID: string]: InterpretedRoomEvent } = {}

    for (const event of eventLog) {
    }

    return (this._events = events)
  }

  _deadCreepNames: DeadCreepNames
  get deadCreepNames() {
    if (this._deadCreepNames) return this._deadCreepNames

    const deadCreepNames: DeadCreepNames = {
      my: new Set(),
      enemy: new Set(),
      ally: new Set(),
    }

    for (const tombstone of this.room.find(FIND_TOMBSTONES)) {
      if (tombstone.creep.owner.username === Memory.me) {
        deadCreepNames.my.add(tombstone.creep.name)
        continue
      }

      if (isAlly(tombstone.creep.owner.username)) {
        deadCreepNames.ally.add(tombstone.creep.name)
      }

      deadCreepNames.enemy.add(tombstone.creep.name)
    }

    return (this._deadCreepNames = deadCreepNames)
  }

  _notMyConstructionSites: NotMyConstructionSites
  get notMyConstructionSites() {
    if (this._notMyConstructionSites) return this._notMyConstructionSites

    const notMyConstructionSites: NotMyConstructionSites = {
      ally: [],
      enemy: [],
    }

    const constructionSites = this.room.find(FIND_HOSTILE_CONSTRUCTION_SITES)
    for (const cSite of constructionSites) {
      if (isAlly(cSite.owner.username)) {
        notMyConstructionSites.ally.push(cSite)
        continue
      }

      // The construction site isn't owned by an ally, so it is an enemy's!

      notMyConstructionSites.enemy.push(cSite)
    }

    return (this._notMyConstructionSites = notMyConstructionSites)
  }

  _allyConstructionSitesByType: Partial<
    Record<StructureConstant, ConstructionSite<BuildableStructureConstant>[]>
  >
  get allyConstructionSitesByType() {
    if (this._allyConstructionSitesByType) return this._allyConstructionSitesByType

    const allyConstructionSitesByType: Partial<
      Record<StructureConstant, ConstructionSite<BuildableStructureConstant>[]>
    > = {}

    for (const structureType of allStructureTypes) {
      allyConstructionSitesByType[structureType] = []
    }

    for (const cSite of this.notMyConstructionSites.ally) {
      allyConstructionSitesByType[cSite.structureType].push(cSite)
    }

    return (this._allyConstructionSitesByType = allyConstructionSitesByType)
  }

  _dismantleTargets: Structure[]
  get dismantleTargets() {
    if (this._dismantleTargets) return this._dismantleTargets

    // We own the room, attack enemy owned structures

    if (this.room.controller && this.room.controller.my) {
      return (this._dismantleTargets = this.room.find(FIND_STRUCTURES, {
        filter: structure =>
          (structure as OwnedStructure).owner &&
          !(structure as OwnedStructure).my &&
          structure.structureType !== STRUCTURE_INVADER_CORE,
      }))
    }

    // We don't own the room, attack things that we can that aren't roads or containers

    return (this._dismantleTargets = this.room.find(FIND_STRUCTURES, {
      filter: structure =>
        structure.structureType !== STRUCTURE_ROAD &&
        structure.structureType !== STRUCTURE_CONTAINER &&
        structure.structureType !== STRUCTURE_CONTROLLER &&
        structure.structureType !== STRUCTURE_INVADER_CORE &&
        structure.structureType !== STRUCTURE_KEEPER_LAIR &&
        // We don't want to attack respawn or novice zone walls with infinite hits

        structure.hits,
    }))
  }

  _destructibleStructures: Structure[]
  get destructableStructures() {
    if (this._destructibleStructures) return this._destructibleStructures

    const destructibleStructures = this.room.find(FIND_STRUCTURES, {
      filter: structure =>
        structure.structureType !== STRUCTURE_CONTROLLER &&
        structure.structureType !== STRUCTURE_INVADER_CORE,
    })
    return (this._destructibleStructures = destructibleStructures)
  }

  _combatStructureTargets: Structure[]
  get combatStructureTargets() {
    if (this._combatStructureTargets) return this._combatStructureTargets

    const controller = this.room.controller
    if (controller) {
      // We don't want to target any structures in communes or remotes
      if (controller.my || Memory.rooms[this.room.name][RoomMemoryKeys.type] === RoomTypes.remote) {
        return (this._combatStructureTargets = [])
      }

      if (controller.owner && isAlly(controller.owner.username))
        return (this._combatStructureTargets = [])
      if (controller.reservation && isAlly(controller.reservation.username))
        return (this._combatStructureTargets = [])

      return (this._combatStructureTargets = [])
    }

    const combatStructureTargets = this.room.find(FIND_STRUCTURES, {
      filter: structure => combatTargetStructureTypes.has(structure.structureType),
    })
    return (this._combatStructureTargets = combatStructureTargets)
  }

  _remoteNamesByEfficacy: string[]
  /**
   * Some rooms may no longer be remotes when accesed later in the code
   */
  get remoteNamesByEfficacy() {
    if (this._remoteNamesByEfficacy) return this._remoteNamesByEfficacy

    const pathType = this.room.communeManager.remoteResourcePathType

    // Filter rooms that have some sourceEfficacies recorded

    const remoteNamesByEfficacy = Memory.rooms[this.room.name][RoomMemoryKeys.remotes].filter(
      function (roomName) {
        return Memory.rooms[roomName][pathType].length
      },
    )

    // Sort the remotes based on lowest source efficacy
    return remoteNamesByEfficacy.sort(function (roomName1, roomName2) {
      return (
        Math.min(...Memory.rooms[roomName1][pathType].map(packedPath => packedPath.length)) -
        Math.min(...Memory.rooms[roomName2][pathType].map(packedPath => packedPath.length))
      )
    })
  }

  _remoteSourceIndexesByEfficacy: string[]
  /**
   * Some rooms may no longer be remotes when accessed later in the code
   */
  get remoteSourceIndexesByEfficacy() {
    if (this._remoteSourceIndexesByEfficacy) return this._remoteSourceIndexesByEfficacy

    const remoteSourceIndexesByEfficacy: string[] = []

    for (const remoteName of Memory.rooms[this.room.name][RoomMemoryKeys.remotes]) {
      const remoteMemory = Memory.rooms[remoteName]

      for (
        let sourceIndex = 0;
        sourceIndex < remoteMemory[RoomMemoryKeys.remoteSources].length;
        sourceIndex++
      ) {
        remoteSourceIndexesByEfficacy.push(remoteName + ' ' + sourceIndex)
      }
    }

    const pathType = this.room.communeManager.remoteResourcePathType

    // If we can do reserving, prefer rooms with more efficient reserving and utility
    if (this.room.energyCapacityAvailable >= BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]) {
      let score = 0

      // associate score for source with accompaning costs

      // prefer based on rough energy / tick
      // reserver cost is 650 / claimer lifetime - real path distance / source count
      //
    }

    return remoteSourceIndexesByEfficacy.sort(function (a, b) {
      const aSplit = a.split(' ')
      const bSplit = b.split(' ')

      return (
        Memory.rooms[aSplit[0]][pathType][parseInt(aSplit[1])].length -
        Memory.rooms[bSplit[0]][pathType][parseInt(bSplit[1])].length
      )
    })
  }

  sourceContainerIDs: Id<StructureContainer>[]
  _sourceContainers: StructureContainer[]
  get sourceContainers() {
    if (this._sourceContainers) return this._sourceContainers

    if (this.sourceContainerIDs && !this.structureUpdate) {
      const sourceContainers = this.sourceContainerIDs.map(ID => findObjectWithID(ID))

      return (this._sourceContainers = sourceContainers)
    }

    const sourceContainers: StructureContainer[] = []

    const roomType = Memory.rooms[this.room.name][RoomMemoryKeys.type]
    if (roomType === RoomTypes.commune) {
      const positions = this.communeSourceHarvestPositions
      for (let i = 0; i < positions.length; i++) {
        const structure = this.room.findStructureAtCoord(
          positions[i][0],
          structure => structure.structureType === STRUCTURE_CONTAINER,
        )
        if (!structure) continue

        sourceContainers[i] = structure as StructureContainer
      }
    } else if (roomType === RoomTypes.remote) {
      const positions = this.remoteSourceHarvestPositions
      for (let i = 0; i < positions.length; i++) {
        const structure = this.room.findStructureAtCoord(
          positions[i][0],
          structure => structure.structureType === STRUCTURE_CONTAINER,
        )
        if (!structure) continue

        sourceContainers[i] = structure as StructureContainer
      }
    } else {
      const positions = this.sourceHarvestPositions
      for (let i = 0; i < positions.length; i++) {
        const structure = this.room.findStructureAtCoord(
          positions[i][0],
          structure => structure.structureType === STRUCTURE_CONTAINER,
        )
        if (!structure) continue

        sourceContainers[i] = structure as StructureContainer
      }
    }

    this.sourceContainerIDs = sourceContainers.map(container => container.id)
    return (this._sourceContainers = sourceContainers)
  }

  fastFillerContainerIDs: Id<StructureContainer>[]
  _fastFillerContainers: StructureContainer[]
  get fastFillerContainers() {
    if (this._fastFillerContainers) return this._fastFillerContainers

    if (this.fastFillerContainerIDs && !this.structureUpdate) {
      const fastFillerContainers = this.fastFillerContainerIDs.map(ID => findObjectWithID(ID))
      return (this._fastFillerContainers = fastFillerContainers)
    }

    const anchor = this.anchor
    if (!anchor) throw Error('no anchor')

    const potentialFastFillerContainers = [
      this.room.findStructureAtXY<StructureContainer>(
        anchor.x - 2,
        anchor.y,
        structure => structure.structureType === STRUCTURE_CONTAINER,
      ),
      this.room.findStructureAtXY<StructureContainer>(
        anchor.x + 2,
        anchor.y,
        structure => structure.structureType === STRUCTURE_CONTAINER,
      ),
    ]
    const fastFillerContainers: StructureContainer[] = []
    for (const container of potentialFastFillerContainers) {
      if (!container) continue

      fastFillerContainers.push(container)
    }

    this.fastFillerContainerIDs = fastFillerContainers.map(container => container.id)
    return (this._fastFillerContainers = fastFillerContainers)
  }

  // entire getter and cache logic for controllerContainer, similar mineralContainer and to the logic in roomAdditions.ts and room.ts

  controllerContainerID: Id<StructureContainer>
  _controllerContainer: StructureContainer | false
  get controllerContainer() {
    if (this._controllerContainer !== undefined) return this._controllerContainer

    if (this.controllerContainerID) {
      const controllerContainer = findObjectWithID(this.controllerContainerID)
      if (controllerContainer) {
        this._controllerContainer = controllerContainer
        return controllerContainer
      }
    }

    const centerUpgradePos = this.centerUpgradePos
    if (!centerUpgradePos) throw Error('no center upgrade pos')

    this._controllerContainer = this.room.findStructureAtCoord<StructureContainer>(
      centerUpgradePos,
      structure => structure.structureType === STRUCTURE_CONTAINER,
    )
    if (!this._controllerContainer) {
      return this._controllerContainer
    }

    this.controllerContainerID = this._controllerContainer.id
    return this._controllerContainer
  }

  mineralContainerID: Id<StructureContainer>
  _mineralContainer: StructureContainer | false
  get mineralContainer() {
    if (this._mineralContainer !== undefined) return this._mineralContainer

    if (this.mineralContainerID) {
      const mineralContainer = findObjectWithID(this.mineralContainerID)
      if (mineralContainer) return (this._mineralContainer = mineralContainer)
    }

    const mineralHarvestPos = this.mineralHarvestPositions[0]
    if (!mineralHarvestPos) throw Error('no mineral harvest pos')

    this._mineralContainer = this.room.findStructureAtCoord<StructureContainer>(
      mineralHarvestPos,
      structure => structure.structureType === STRUCTURE_CONTAINER,
    )
    if (!this._mineralContainer) {
      return this._mineralContainer
    }

    this.mineralContainerID = this._mineralContainer.id
    return this._mineralContainer
  }

  fastFillerLinkID: Id<StructureLink>
  _fastFillerLink: StructureLink | false
  get fastFillerLink() {
    if (this._fastFillerLink !== undefined) return this._fastFillerLink

    if (this.fastFillerLinkID) {
      const fastFillerLink = findObjectWithID(this.fastFillerLinkID)
      if (fastFillerLink) return (this._fastFillerLink = fastFillerLink)
    }

    const anchor = this.anchor
    if (!anchor) throw Error('no anchor')

    this._fastFillerLink = this.room.findStructureAtCoord(
      anchor,
      structure => structure.structureType === STRUCTURE_LINK,
    )
    if (!this._fastFillerLink) {
      return this._fastFillerLink
    }

    this.fastFillerLinkID = this._fastFillerLink.id
    return this._fastFillerLink
  }

  hubLinkId: Id<StructureLink>
  _hubLink: StructureLink | false
  get hubLink() {
    if (this._hubLink !== undefined) return this._hubLink

    if (this.hubLinkId) {
      const hubLink = findObjectWithID(this.hubLinkId)
      if (hubLink) return (this._hubLink = hubLink)
    }

    const stampAnchors = this.stampAnchors
    if (!stampAnchors) return (this._hubLink = false)

    this._hubLink = this.room.findStructureInRange(
      stampAnchors.hub[0],
      1,
      structure => structure.structureType === STRUCTURE_LINK,
    )
    if (!this._hubLink) {
      return this._hubLink
    }

    this.hubLinkId = this._hubLink.id
    return this._hubLink
  }

  _droppedEnergy: Resource[]
  get droppedEnergy() {
    if (this._droppedEnergy) return this._droppedEnergy

    const droppedEnergy = this.room.find(FIND_DROPPED_RESOURCES, {
      filter: resource =>
        resource.resourceType === RESOURCE_ENERGY &&
        !resource.room.roomManager.enemyThreatCoords.has(packCoord(resource.pos)),
    })
    return (this._droppedEnergy = droppedEnergy)
  }

  _droppedResources: Resource[]
  get droppedResources() {
    if (this._droppedResources) return this._droppedResources

    const droppedResources = this.room.find(FIND_DROPPED_RESOURCES, {
      filter: resource => !resource.room.roomManager.enemyThreatCoords.has(packCoord(resource.pos)),
    })
    return (this._droppedResources = droppedResources)
  }

  _actionableWalls: StructureWall[]
  get actionableWalls() {
    if (this._actionableWalls) return this._actionableWalls

    const actionableWalls = this.room.find<StructureWall>(FIND_STRUCTURES, {
      filter: structure =>
        structure.structureType === STRUCTURE_WALL &&
        !structure.room.roomManager.enemyThreatCoords.has(packCoord(structure.pos)),
    })
    return (this._actionableWalls = actionableWalls)
  }

  _quadCostMatrix: CostMatrix
  /**
   * a costMatrix for quad (combat mode) pathing
   */
  get quadCostMatrix() {
    if (this._quadCostMatrix) return this._quadCostMatrix

    const quadCostMatrix = new PathFinder.CostMatrix()
    const terrainCoords = new Uint8Array(RoomOps.getTerrainBinary(this.room.name))

    const roadCoords = new Set()
    for (const road of this.structures.road) roadCoords.add(packCoord(road.pos))

    // Avoid not my creeps

    for (const creep of this.notMyCreeps.enemy) terrainCoords[packAsNum(creep.pos)] = 255
    for (const creep of this.notMyCreeps.ally) terrainCoords[packAsNum(creep.pos)] = 255

    for (const creep of this.room.find(FIND_HOSTILE_POWER_CREEPS))
      terrainCoords[packAsNum(creep.pos)] = 255

    // Avoid impassible structures

    for (const rampart of this.structures.rampart) {
      // If the rampart is mine

      if (rampart.my) continue

      // Otherwise if the rampart is owned by an ally, iterate

      if (rampart.isPublic) continue

      // Otherwise set the rampart's pos as impassible

      terrainCoords[packAsNum(rampart.pos)] = 255
    }

    // Loop through structureTypes of impassibleStructureTypes

    for (const structureType of impassibleStructureTypes) {
      for (const structure of this.structures[structureType]) {
        // Set pos as impassible

        terrainCoords[packAsNum(structure.pos)] = 255
      }

      for (const cSite of this.cSites[structureType]) {
        // Set pos as impassible

        terrainCoords[packAsNum(cSite.pos)] = 255
      }
    }

    //

    for (const portal of this.structures.portal) terrainCoords[packAsNum(portal.pos)] = 255

    // Loop trough each construction site belonging to an ally

    for (const cSite of this.notMyConstructionSites.ally) terrainCoords[packAsNum(cSite.pos)] = 255

    let x

    // Configure y and loop through top exits

    let y = 0
    for (x = 0; x < roomDimensions; x += 1)
      terrainCoords[packXYAsNum(x, y)] = Math.max(terrainCoords[packXYAsNum(x, y)], 100)

    // Configure x and loop through left exits

    x = 0
    for (y = 0; y < roomDimensions; y += 1)
      terrainCoords[packXYAsNum(x, y)] = Math.max(terrainCoords[packXYAsNum(x, y)], 100)

    // Configure y and loop through bottom exits

    y = roomDimensions - 1
    for (x = 0; x < roomDimensions; x += 1)
      terrainCoords[packXYAsNum(x, y)] = Math.max(terrainCoords[packXYAsNum(x, y)], 100)

    // Configure x and loop through right exits

    x = roomDimensions - 1
    for (y = 0; y < roomDimensions; y += 1)
      terrainCoords[packXYAsNum(x, y)] = Math.max(terrainCoords[packXYAsNum(x, y)], 100)

    const terrainCM = this.room.getTerrain()

    // Assign impassible to tiles that aren't 2x2 passible

    for (let x = 0; x < roomDimensions; x += 1) {
      for (let y = 0; y < roomDimensions; y += 1) {
        const offsetCoords = [
          {
            x,
            y,
          },
          {
            x: x + 1,
            y,
          },
          {
            x,
            y: y + 1,
          },
          {
            x: x + 1,
            y: y + 1,
          },
        ]

        let largestValue = terrainCoords[packXYAsNum(x, y)]

        for (const coord of offsetCoords) {
          let coordValue = terrainCoords[packAsNum(coord)]
          if (!coordValue || coordValue < 255) continue

          if (roadCoords.has(packCoord(coord))) coordValue = 0
          if (coordValue <= largestValue) continue

          largestValue = coordValue
        }

        if (largestValue >= 50) {
          largestValue = 50

          quadCostMatrix.set(x, y, Math.max(terrainCoords[packXYAsNum(x, y)], largestValue))
          continue
        }

        largestValue = 0

        for (const coord of offsetCoords) {
          const value = terrainCM.get(coord.x, coord.y)
          if (!value) continue

          if (roadCoords.has(packCoord(coord))) continue
          if (value !== TERRAIN_MASK_SWAMP) continue

          largestValue = defaultSwampCost * 2
        }

        if (!largestValue) continue

        for (const coord of offsetCoords) {
          quadCostMatrix.set(coord.x, coord.y, largestValue)
        }
      }
    }

    /* this.room.visualizeCostMatrix(quadCostMatrix) */

    return (this._quadCostMatrix = quadCostMatrix)
  }

  _quadBulldozeCostMatrix: CostMatrix
  get quadBulldozeCostMatrix() {
    if (this._quadBulldozeCostMatrix) return this._quadBulldozeCostMatrix

    const quadBulldozeCostMatrix = new PathFinder.CostMatrix()
    const terrainCoords = new Uint8Array(RoomOps.getTerrainBinary(this.room.name))

    const roadCoords = new Set()
    for (const road of this.structures.road) roadCoords.add(packCoord(road.pos))

    // Avoid not my creeps
    /*
            for (const creep of this.roomManager.notMyCreeps.enemy) terrainCoords[packAsNum(creep.pos)] = 255
            for (const creep of this.roomManager.notMyCreeps.ally.ally) terrainCoords[packAsNum(creep.pos)] = 255

            for (const creep of this.find(FIND_HOSTILE_POWER_CREEPS)) terrainCoords[packAsNum(creep.pos)] = 255
 */

    const ramparts = this.structures.rampart
    const constructedWalls = this.structures.constructedWall
    const barricades = [...ramparts, ...constructedWalls]
    const highestBarricadeHits = findHighestScore(barricades, structure => structure.hits)

    for (const structure of ramparts) {
      // If the rampart is mine

      if (structure.my) continue

      // Otherwise set the rampart's pos as impassible

      terrainCoords[packAsNum(structure.pos)] = Math.floor(
        ((highestBarricadeHits - structure.hits) / highestBarricadeHits) * 254,
      )
    }

    // Loop through structureTypes of impassibleStructureTypes

    for (const structureType of impassibleStructureTypes) {
      for (const structure of this.structures[structureType]) {
        terrainCoords[packAsNum(structure.pos)] = 10 /* structure.hits / (structure.hitsMax / 10) */
      }

      for (const cSite of this.cSites[structureType]) {
        // Set pos as impassible

        terrainCoords[packAsNum(cSite.pos)] = 255
      }
    }

    for (const structure of constructedWalls) {
      // Otherwise set the rampart's pos as impassible

      terrainCoords[packAsNum(structure.pos)] = Math.floor(
        ((highestBarricadeHits - structure.hits) / highestBarricadeHits) * 254,
      )
    }

    //

    for (const portal of this.structures.portal) terrainCoords[packAsNum(portal.pos)] = 255

    // Loop trough each construction site belonging to an ally

    for (const cSite of this.notMyConstructionSites.ally) terrainCoords[packAsNum(cSite.pos)] = 255

    let x

    // Configure y and loop through top exits

    let y = 0
    for (x = 0; x < roomDimensions; x += 1)
      terrainCoords[packXYAsNum(x, y)] = Math.max(terrainCoords[packXYAsNum(x, y)], 50)

    // Configure x and loop through left exits

    x = 0
    for (y = 0; y < roomDimensions; y += 1)
      terrainCoords[packXYAsNum(x, y)] = Math.max(terrainCoords[packXYAsNum(x, y)], 50)

    // Configure y and loop through bottom exits

    y = roomDimensions - 1
    for (x = 0; x < roomDimensions; x += 1)
      terrainCoords[packXYAsNum(x, y)] = Math.max(terrainCoords[packXYAsNum(x, y)], 50)

    // Configure x and loop through right exits

    x = roomDimensions - 1
    for (y = 0; y < roomDimensions; y += 1)
      terrainCoords[packXYAsNum(x, y)] = Math.max(terrainCoords[packXYAsNum(x, y)], 50)

    const terrainCM = this.room.getTerrain()

    // Assign impassible to tiles that aren't 2x2 passible

    for (let x = 0; x < roomDimensions; x += 1) {
      for (let y = 0; y < roomDimensions; y += 1) {
        const offsetCoords = [
          {
            x,
            y,
          },
          {
            x: x + 1,
            y,
          },
          {
            x,
            y: y + 1,
          },
          {
            x: x + 1,
            y: y + 1,
          },
        ]

        let largestValue = terrainCoords[packXYAsNum(x, y)]

        for (const coord of offsetCoords) {
          let coordValue = terrainCoords[packAsNum(coord)]
          if (!coordValue || coordValue < 255) continue

          if (roadCoords.has(packCoord(coord))) coordValue = 0
          if (coordValue <= largestValue) continue

          largestValue = coordValue
        }

        if (largestValue >= 50) {
          largestValue = 50

          quadBulldozeCostMatrix.set(x, y, Math.max(terrainCoords[packXYAsNum(x, y)], largestValue))
          continue
        }

        largestValue = 0

        for (const coord of offsetCoords) {
          const value = terrainCM.get(coord.x, coord.y)
          if (value === undefined) continue

          if (roadCoords.has(packCoord(coord))) continue
          if (value !== TERRAIN_MASK_SWAMP) continue

          largestValue = defaultSwampCost * 2
        }

        if (!largestValue) continue

        for (const coord of offsetCoords) {
          quadBulldozeCostMatrix.set(coord.x, coord.y, largestValue)
        }
      }
    }

    /* this.visualizeCostMatrix(quadBulldozeCostMatrix) */

    return (this._quadBulldozeCostMatrix = quadBulldozeCostMatrix)
  }

  _enemyDamageThreat: boolean
  /**
   * Wether or not there is a damage threat from enemies in the room
   */
  get enemyDamageThreat() {
    if (this._enemyDamageThreat !== undefined) return this._enemyDamageThreat

    if (this.room.controller && !this.room.controller.my && this.structures.tower.length) {
      return (this._enemyDamageThreat = true)
    }

    for (const enemyAttacker of this.enemyAttackers) {
      if (!enemyAttacker.combatStrength.melee) {
        return (this._enemyDamageThreat = true)
      }

      if (enemyAttacker.combatStrength.ranged) {
        return (this._enemyDamageThreat = true)
      }
    }

    return (this._enemyDamageThreat = false)
  }

  _enemyThreatCoords: Set<string>
  /**
   * Coords which enemies might hurt us if our creeps step on them
   */
  get enemyThreatCoords() {
    if (this._enemyThreatCoords) return this._enemyThreatCoords

    const enemyThreatCoords = new Set<string>()

    // If there is a controller, it's mine, and it's in safemode, we're safe

    if (this.room.controller && this.room.controller.my && this.room.controller.safeMode) {
      return (this._enemyThreatCoords = enemyThreatCoords)
    }

    const enemyAttackers = this.enemyAttackers
    // If there is no enemy threat
    if (!enemyAttackers.length) return (this._enemyThreatCoords = enemyThreatCoords)

    const enemyMeleeAttackers: Creep[] = []
    const enemyRangedAttackers: Creep[] = []

    for (const enemyAttacker of enemyAttackers) {
      if (enemyAttacker.parts.ranged_attack) {
        enemyRangedAttackers.push(enemyAttacker)
        continue
      }
      if (enemyAttacker.parts.attack) enemyMeleeAttackers.push(enemyAttacker)
    }

    // avoid melee creeps in range 2
    for (const enemyAttacker of enemyMeleeAttackers) {
      forCoordsInRange(enemyAttacker.pos, 2, coord => {
        enemyThreatCoords.add(packCoord(coord))
      })
    }

    // avoid ranged creeps in range 3
    for (const enemyAttacker of enemyRangedAttackers) {
      forCoordsInRange(enemyAttacker.pos, 3, coord => {
        enemyThreatCoords.add(packCoord(coord))
      })
    }

    // if it's our room, ramparts protect us from enemies
    if (this.room.controller && this.room.controller.my) {
      const enemySquadData = this.enemySquadData
      const highestDamage = Math.max(
        enemySquadData.highestDismantle,
        enemySquadData.highestMeleeDamage,
      )

      for (const rampart of this.structures.rampart) {
        // Ignore ramparts that can be one shotted
        if (rampart.hits < highestDamage) continue

        enemyThreatCoords.delete(packCoord(rampart.pos))
      }
    }

    return (this._enemyThreatCoords = enemyThreatCoords)
  }

  _enemyThreatGoals: PathGoal[]
  /**
   *
   */
  get enemyThreatGoals() {
    if (this._enemyThreatGoals) return this._enemyThreatGoals

    const enemyThreatGoals: PathGoal[] = []

    for (const enemyCreep of this.enemyAttackers) {
      if (enemyCreep.parts.ranged_attack) {
        enemyThreatGoals.push({
          pos: enemyCreep.pos,
          range: 4,
        })
        continue
      }

      if (!enemyCreep.parts.attack) continue

      enemyThreatGoals.push({
        pos: enemyCreep.pos,
        range: 2,
      })
    }

    return (this._enemyThreatGoals = enemyThreatGoals)
  }
  /*
    _flags: Partial<{ [key in FlagNames]: Flag }>
    get flags() {
        if (this._flags) return this._flags

        const flags: Partial<{ [key in FlagNames]: Flag }> = {}

        for (const flag of this.room.find(FIND_FLAGS)) {
            flags[flag.name as FlagNames] = flag
        }

        return (this._flags = flags)
    }
 */
  _resourcesInStoringStructures: Partial<{ [key in ResourceConstant]: number }>
  get resourcesInStoringStructures() {
    if (this._resourcesInStoringStructures) return this._resourcesInStoringStructures

    const resourcesInStoringStructures: Partial<{ [key in ResourceConstant]: number }> = {}

    const storingStructures: AnyStoreStructure[] = [this.room.storage, this.factory]
    if (this.room.terminal && !this.room.terminal.effectsData.get(PWR_DISRUPT_TERMINAL)) {
      storingStructures.push(this.room.terminal)
    }

    for (const structure of storingStructures) {
      if (!structure) continue
      if (!StructureUtils.isRCLActionable(structure)) continue

      for (const key in structure.store) {
        const resourceType = key as ResourceConstant

        if (!resourcesInStoringStructures[resourceType]) {
          resourcesInStoringStructures[resourceType] = structure.store[resourceType]
          continue
        }

        resourcesInStoringStructures[resourceType] += structure.store[resourceType]
      }
    }

    return (this._resourcesInStoringStructures = resourcesInStoringStructures)
  }

  _unprotectedEnemyCreeps: Creep[]
  get unprotectedEnemyCreeps() {
    if (this._unprotectedEnemyCreeps) return this._unprotectedEnemyCreeps

    const unprotectedEnemyCreeps = this.notMyCreeps.enemy.filter(enemyCreep => {
      return !this.room.findStructureAtCoord(
        enemyCreep.pos,
        structure => structure.structureType === STRUCTURE_RAMPART,
      )
    })

    return (this._unprotectedEnemyCreeps = unprotectedEnemyCreeps)
  }

  _exitCoords: Set<string>
  get exitCoords() {
    if (this._exitCoords) return this._exitCoords

    const exitCoords = new Set<string>()
    const terrain = this.room.getTerrain()

    let x
    let y = 0
    for (x = 0; x < roomDimensions; x += 1) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue
      exitCoords.add(packXYAsCoord(x, y))
    }

    // Configure x and loop through left exits

    x = 0
    for (y = 0; y < roomDimensions; y += 1) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue
      exitCoords.add(packXYAsCoord(x, y))
    }

    // Configure y and loop through bottom exits

    y = roomDimensions - 1
    for (x = 0; x < roomDimensions; x += 1) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue
      exitCoords.add(packXYAsCoord(x, y))
    }

    // Configure x and loop through right exits

    x = roomDimensions - 1
    for (y = 0; y < roomDimensions; y += 1) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue
      exitCoords.add(packXYAsCoord(x, y))
    }

    return (this._exitCoords = exitCoords)
  }

  _advancedLogistics: boolean
  get advancedLogistics() {
    if (this._advancedLogistics !== undefined) return this._advancedLogistics

    if (Memory.rooms[this.room.name][RoomMemoryKeys.type] === RoomTypes.remote) {
      return (this._advancedLogistics = true)
    }

    this._advancedLogistics = !!(
      this.fastFillerContainers.length ||
      (this.room.controller.level >= 4 && this.room.storage) ||
      (this.room.controller.level >= 6 && this.room.terminal)
    )
    return this._advancedLogistics
  }

  _defaultCostMatrix: CostMatrix
  get defaultCostMatrix() {
    if (this._defaultCostMatrix) return this._defaultCostMatrix

    const cm = new PathFinder.CostMatrix()

    for (const road of this.structures.road) cm.set(road.pos.x, road.pos.y, 1)

    for (const [packedCoord, coordType] of this.reservedCoords) {
      if (coordType !== ReservedCoordTypes.important) continue

      const coord = unpackCoord(packedCoord)
      cm.set(coord.x, coord.y, 20)
    }

    for (const portal of this.structures.portal) cm.set(portal.pos.x, portal.pos.y, 255)

    // Loop trough each construction site belonging to an ally

    for (const cSite of this.notMyConstructionSites.ally) cm.set(cSite.pos.x, cSite.pos.y, 255)

    // The controller isn't in safemode or it isn't ours, avoid enemies

    const controller = this.room.controller

    if (!controller || !controller.safeMode || !controller.my) {
      for (const packedCoord of this.enemyThreatCoords) {
        const coord = unpackCoord(packedCoord)
        cm.set(coord.x, coord.y, 255)
      }
    }

    if (!controller || !controller.safeMode) {
      for (const creep of this.notMyCreeps.enemy) cm.set(creep.pos.x, creep.pos.y, 255)
      for (const creep of this.notMyCreeps.ally) cm.set(creep.pos.x, creep.pos.y, 255)

      for (const creep of this.room.find(FIND_HOSTILE_POWER_CREEPS))
        cm.set(creep.pos.x, creep.pos.y, 255)
    }

    for (const rampart of this.structures.rampart) {
      // If the rampart is mine

      if (rampart.my) continue

      // If the rampart is public and owned by an ally
      // We don't want to try to walk through enemy public ramparts as it could trick our pathing

      if (rampart.isPublic && global.settings.allies.includes(rampart.owner.username)) continue

      // Otherwise set the rampart's pos as impassible

      cm.set(rampart.pos.x, rampart.pos.y, 255)
    }

    // Loop through structureTypes of impassibleStructureTypes

    for (const structureType of impassibleStructureTypes) {
      for (const structure of this.structures[structureType]) {
        // Set pos as impassible

        cm.set(structure.pos.x, structure.pos.y, 255)
      }

      for (const cSite of this.cSites[structureType]) {
        // Set pos as impassible

        cm.set(cSite.pos.x, cSite.pos.y, 255)
      }
    }

    /* this.global.defaultCostMatrix = cm.serialize() */
    return (this._defaultCostMatrix = cm.clone())
  }

  _totalEnemyCombatStrength: TotalEnemyCombatStrength
  get totalEnemyCombatStrength() {
    if (this._totalEnemyCombatStrength) return this._totalEnemyCombatStrength

    const totalEnemyCombatStrength: TotalEnemyCombatStrength = {
      melee: 0,
      ranged: 0,
      heal: 0,
      dismantle: 0,
    }

    for (const enemyCreep of this.enemyAttackers) {
      const combatStrength = enemyCreep.combatStrength
      totalEnemyCombatStrength.melee += combatStrength.melee
      totalEnemyCombatStrength.ranged += combatStrength.ranged
      totalEnemyCombatStrength.heal += combatStrength.heal
      totalEnemyCombatStrength.dismantle += combatStrength.dismantle
    }

    return (this._totalEnemyCombatStrength = totalEnemyCombatStrength)
  }

  _factory?: StructureFactory
  get factory() {
    if (this._factory !== undefined) return this._factory

    return (this._factory = this.structures.factory[0])
  }

  _powerSpawn?: StructurePowerSpawn
  get powerSpawn() {
    if (this._powerSpawn !== undefined) return this._powerSpawn

    return (this._powerSpawn = this.structures.powerSpawn[0])
  }

  _nuker?: StructureNuker
  get nuker() {
    if (this._nuker !== undefined) return this._nuker

    return (this._nuker = this.structures.nuker[0])
  }

  _observer?: StructureObserver
  get observer() {
    if (this._observer !== undefined) return this._observer

    return (this._observer = this.structures.observer[0])
  }

  _basePlans: BasePlans
  /**
   * cached unpacked base plans, if they exist
   */
  get basePlans() {
    if (this._basePlans !== undefined) return this._basePlans

    this._basePlans = BasePlans.unpack(Memory.rooms[this.room.name][RoomMemoryKeys.basePlans])
    return this._basePlans
  }

  _rampartPlans: RampartPlans
  /**
   * cached unoacked rampart plans, if they exist
   */
  get rampartPlans() {
    if (this._rampartPlans !== undefined) return this._rampartPlans

    this._rampartPlans = RampartPlans.unpack(
      Memory.rooms[this.room.name][RoomMemoryKeys.rampartPlans],
    )
    return this._rampartPlans
  }

  visualizePosHavers(posHavers: { pos: Coord }[]) {
    for (const structure of posHavers) {
      this.room.coordVisual(structure.pos.x, structure.pos.y)
    }
  }
}

export type StructureCoords = Map<string, Id<Structure<StructureConstant>>[]>
