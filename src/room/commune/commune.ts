import {
  findObjectWithID,
  getRange,
  packAsNum, findLowestScore,
  roundTo,
  forCoordsAroundRange
} from 'utils/utils'
import './workRequest'
import './combatRequest'
import {
  RoomMemoryKeys,
  rampartUpkeepCost,
  RemoteResourcePathTypes,
  ReservedCoordTypes,
} from '../../constants/general'
import { RoomStatsKeys } from '../../constants/stats'
import './factory'
import { LabManager } from './labs'
import './links'
import { RemotesManager } from './remotesManager'
import { CombatRequestManager } from './combatRequest'
import { HaulRequestManager } from './haulRequestManager'
import { packCoord, unpackPosAt } from 'other/codec'
import { LinkManager } from './links'
import { FactoryManager } from './factory'
import { SpawnRequestsManager } from './spawning/spawnRequests'
import { ConstructionManager } from 'room/construction/construction'
import { RoomNameUtils } from 'room/roomNameUtils'
import { StructureUtils } from 'room/structureUtils'
import { CommuneUtils } from './communeUtils'
import { RoomUtils } from 'room/roomUtils'

export type ResourceTargets = {
  min: Partial<{ [key in ResourceConstant]: number }>
  max: Partial<{ [key in ResourceConstant]: number }>
}

export class CommuneManager {
  static communeManagers: { [roomName: string]: CommuneManager } = {}

  // Managers

  constructionManager: ConstructionManager

  linkManager: LinkManager
  labManager: LabManager
  spawnRequestsManager: SpawnRequestsManager

  remotesManager: RemotesManager

  combatRequestManager: CombatRequestManager
  haulRequestManager: HaulRequestManager

  factoryManager: FactoryManager

  //

  room: Room
  nextSpawnEnergyAvailable: number
  /**
   * Organized by remote and sourceIndex
   */
  remoteSourceHarvesters: { [remote: string]: string[][] }
  communeHaulers: string[]
  /**
   * The total amount of carry parts for haulers
   */
  haulerCarryParts: number
  /**
   * The total amount of carry parts for haulers presently responding to requests in the commune
   */
  communeHaulerCarryParts: number
  towerAttackTarget: Creep
  /**
   * The carry parts needed to effectively run the commune
   */
  communeHaulerNeed: number
  mineralHarvestStrength: number
  upgradeStrength: number
  remoteResourcePathType: RemoteResourcePathTypes

  constructor() {
    this.constructionManager = new ConstructionManager(this)

    this.linkManager = new LinkManager(this)
    this.labManager = new LabManager(this)
    this.spawnRequestsManager = new SpawnRequestsManager(this)

    this.remotesManager = new RemotesManager(this)

    this.combatRequestManager = new CombatRequestManager(this)
    this.haulRequestManager = new HaulRequestManager(this)

    this.factoryManager = new FactoryManager(this)
  }

  get estimatedEnergyIncome() {
    const roomStats = Memory.stats.rooms[this.room.name]

    return roundTo(
      roomStats[RoomStatsKeys.EnergyInputHarvest] +
        roomStats[RoomStatsKeys.RemoteEnergyInputHarvest] +
        roomStats[RoomStatsKeys.EnergyInputBought],
      2,
    )
  }

  _targetEnergy: number
  /**
   * The amount of energy the room wants to have
   */
  get targetEnergy() {
    // Consider the controller level to an exponent and this room's attack threat

    this._targetEnergy =
      Math.pow(this.room.controller.level * 6000, 1.06) +
      this.room.memory[RoomMemoryKeys.threatened] * 20

    // If there is a next RCL, Take away some minimum based on how close we are to the next RCL

    const RClCost = this.room.controller.progressTotal
    if (RClCost) {
      this._targetEnergy -= Math.pow(
        (Math.min(this.room.controller.progress, RClCost) / RClCost) * 20,
        3.35,
      )
    }

    return this._targetEnergy
  }

  _storedEnergyBuildThreshold: number
  get storedEnergyBuildThreshold() {
    this._storedEnergyBuildThreshold = Math.floor(
      Math.min(
        1000 +
          findLowestScore(
            this.room.find(FIND_MY_CONSTRUCTION_SITES),
            cSite => cSite.progressTotal - cSite.progress,
          ) *
            10,
        CommuneUtils.minStoredEnergy(this.room) * 1.2,
      ),
    )

    return this._storedEnergyBuildThreshold
  }

  get rampartsMaintenanceCost() {
    return roundTo(this.room.roomManager.structures.rampart.length * rampartUpkeepCost, 2)
  }

  _minRampartHits: number

  get minRampartHits() {
    if (this._minRampartHits !== undefined) return this._minRampartHits

    const level = this.room.controller.level

    return (this._minRampartHits =
      Math.min(
        Math.floor(
          Math.pow((level - 3) * 50, 2.5) +
            Memory.rooms[this.room.name][RoomMemoryKeys.threatened] * 5 * Math.pow(level, 2),
        ),
        RAMPART_HITS_MAX[level] * 0.9,
      ) || 20000)
  }

  _maxCombatRequests: number

  /**
   * The largest amount of combat requests the room can respond to
   */
  get maxCombatRequests() {
    if (this._maxCombatRequests !== undefined) return this._maxCombatRequests

    /* return (this._maxCombatRequests =
            (this.room.roomManager.resourcesInStoringStructures.energy - this.minStoredEnergy) /
            (5000 + this.room.controller.level * 1000)) */
    return (this._maxCombatRequests =
      this.room.roomManager.resourcesInStoringStructures.energy /
      (10000 + this.room.controller.level * 3000))
  }

  /**
   * Wether builders should ask for resources instead of seeking them out themselves
   */
  get buildersMakeRequests() {
    // Only set true if there are no viable storing structures

    return (
      !this.room.roomManager.fastFillerContainers.length &&
      !this.room.storage &&
      !this.room.terminal
    )
  }

  /**
   * The max upgrade strength when we have no local storing structure
   */
  findNudeMaxUpgradeStrength() {
    return 100
  }

  _hasSufficientRoads: boolean
  /**
   * Informs wether we have sufficient roads compared to the roadQuota for our RCL
   */
  get hasSufficientRoads() {
    /* if (this._hasSufficientRoads !== undefined) return this._hasSufficientRoads */

    const roomMemory = Memory.rooms[this.room.name]
    const RCLIndex = this.room.controller.level - 1
    // Try one RCL below, though propagate to the present RCL if there is no roadQuota for the previous RCL
    const minRoads =
      roomMemory[RoomMemoryKeys.roadQuota][RCLIndex - 1] ||
      roomMemory[RoomMemoryKeys.roadQuota][RCLIndex]
    if (minRoads === 0) return false

    const roads = this.room.roomManager.structures.road.length

    // Make sure we have 90% of the intended roads amount
    return (this._hasSufficientRoads = roads >= minRoads * 0.9)
  }

  _upgradeStructure: AnyStoreStructure | false
  get upgradeStructure() {
    if (this._upgradeStructure !== undefined) return this._upgradeStructure

    // We can't use a structure

    const controllerLevel = this.room.controller.level
    if (controllerLevel < 2) return (this._upgradeStructure = false)

    // We can use containers

    if (controllerLevel < 5) {
      return (this._upgradeStructure = this.room.roomManager.controllerContainer)
    }

    // We can use links

    const controllerLink = this.controllerLink
    if (!controllerLink || !StructureUtils.isRCLActionable(controllerLink)) return false

    const hubLink = this.room.roomManager.hubLink
    if (!hubLink || !StructureUtils.isRCLActionable(hubLink)) return false

    return (this._upgradeStructure = controllerLink)
  }

  _structureTypesByBuildPriority: BuildableStructureConstant[]
  get structureTypesByBuildPriority() {
    if (this._structureTypesByBuildPriority) return this._structureTypesByBuildPriority

    if (!this.room.roomManager.fastFillerContainers.length) {
      return (this._structureTypesByBuildPriority = [
        STRUCTURE_RAMPART,
        STRUCTURE_WALL,
        STRUCTURE_SPAWN,
        STRUCTURE_CONTAINER,
        STRUCTURE_EXTENSION,
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
      ])
    }

    this._structureTypesByBuildPriority = [
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

    return this._structureTypesByBuildPriority
  }

  /**
   * When the room needs to upgrade at high priority to remove the downgrade timer
   */
  get controllerDowngradeUpgradeThreshold() {
    return Math.floor(CONTROLLER_DOWNGRADE[this.room.controller.level] * 0.75)
  }

  _defensiveRamparts: StructureRampart[]
  /**
   * This should be cached inter-tick as IDs
   */
  get defensiveRamparts() {
    if (this._defensiveRamparts) return this._defensiveRamparts

    const ramparts: StructureRampart[] = []

    const stampAnchors = this.room.roomManager.stampAnchors
    if (!stampAnchors) throw Error('No stampAnchors for defensive ramparts')

    const minCutCoords = new Set(stampAnchors.minCutRampart.map(coord => packCoord(coord)))

    for (const structure of this.room.roomManager.structures.rampart) {
      if (!minCutCoords.has(packCoord(structure.pos))) continue

      ramparts.push(structure)
    }

    return (this._defensiveRamparts = ramparts)
  }

  /**
   * Prescriptive of if we desire a second mincut layer
   */
  get buildSecondMincutLayer() {
    const buildSecondMincutLayer =
      Memory.rooms[this.room.name][RoomMemoryKeys.threatened] >
        Math.floor(Math.pow(this.room.controller.level * 30, 1.63)) &&
      this.room.towerInferiority !== true

    return buildSecondMincutLayer
  }

  sourceLinkIDs: (Id<StructureLink> | false)[]
  _sourceLinks: (StructureLink | false)[]
  get sourceLinks() {
    if (this._sourceLinks) return this._sourceLinks

    // If we have cached links, convert them into false | StructureLink
    if (this.sourceLinkIDs) {
      const links: (StructureLink | false)[] = []
      for (const ID of this.sourceLinkIDs) {
        if (!ID) {
          links.push(false)
          continue
        }

        const link = findObjectWithID(ID)
        links.push(link)
      }

      return (this._sourceLinks = links)
    }

    const stampAnchors = this.room.roomManager.stampAnchors
    if (!stampAnchors) throw Error('no stampAnchors for sourceLinks in ' + this.room.name)

    const links: (StructureLink | false)[] = []
    this.sourceLinkIDs = []

    for (const coord of stampAnchors.sourceLink) {
      const structure = this.room.findStructureAtCoord(
        coord,
        structure => structure.structureType === STRUCTURE_LINK,
      ) as StructureLink | false

      if (structure) {
        links.push(structure)
        this.sourceLinkIDs.push(structure.id)
        continue
      }

      links.push(false)
      this.sourceLinkIDs.push(false)
    }

    return (this._sourceLinks = links)
  }

  controllerLinkID: Id<StructureLink>
  _controllerLink: StructureLink | false
  get controllerLink() {
    if (this._controllerLink !== undefined) return this._controllerLink

    if (this.controllerLinkID) {
      const structure = findObjectWithID(this.controllerLinkID)
      if (structure) return (this._controllerLink = structure)
    }

    this._controllerLink = this.room.findStructureAtCoord(
      this.room.roomManager.centerUpgradePos,
      structure => structure.structureType === STRUCTURE_LINK,
    ) as StructureLink | false
    if (!this._controllerLink) {
      return this._controllerLink
    }

    this.controllerLinkID = this._controllerLink.id
    return this._controllerLink
  }

  _fastFillerSpawnEnergyCapacity: number
  get fastFillerSpawnEnergyCapacity() {
    if (this._fastFillerSpawnEnergyCapacity && !this.room.roomManager.structureUpdate)
      return this._fastFillerSpawnEnergyCapacity

    const anchor = this.room.roomManager.anchor
    if (!anchor) throw Error('no anchor for fastFillerSpawnEnergyCapacity ' + this.room)

    let fastFillerSpawnEnergyCapacity = 0

    for (const structure of this.actionableSpawningStructures) {
      if (!StructureUtils.isRCLActionable(structure)) continue
      // Outside of the fastFiller
      if (getRange(structure.pos, anchor) > 2) continue

      fastFillerSpawnEnergyCapacity += structure.store.getCapacity(RESOURCE_ENERGY)
    }

    return (this._fastFillerSpawnEnergyCapacity = fastFillerSpawnEnergyCapacity)
  }

  actionableSpawningStructuresIDs: Id<StructureSpawn | StructureExtension>[]
  _actionableSpawningStructures: SpawningStructures
  /**
   * RCL actionable spawns and extensions
   */
  get actionableSpawningStructures() {
    if (this._actionableSpawningStructures) return this._actionableSpawningStructures

    if (this.actionableSpawningStructuresIDs) {
      return (this._actionableSpawningStructures = this.actionableSpawningStructuresIDs.map(ID =>
        findObjectWithID(ID),
      ))
    }

    const structures = this.room.roomManager.structures

    let actionableSpawningStructures: SpawningStructures = structures.spawn
    actionableSpawningStructures = actionableSpawningStructures.concat(structures.extension)
    actionableSpawningStructures = actionableSpawningStructures.filter(structure =>
      StructureUtils.isRCLActionable(structure),
    )

    this.actionableSpawningStructuresIDs = actionableSpawningStructures.map(
      structure => structure.id,
    )
    return (this._actionableSpawningStructures = actionableSpawningStructures)
  }

  spawningStructuresByPriorityIDs: Id<StructureExtension | StructureSpawn>[]
  _spawningStructuresByPriority: SpawningStructures
  get spawningStructuresByPriority() {
    if (this._spawningStructuresByPriority) return this._spawningStructuresByPriority

    if (this.spawningStructuresByPriorityIDs && !this.room.roomManager.structureUpdate) {
      return (this._spawningStructuresByPriority = this.spawningStructuresByPriorityIDs.map(ID =>
        findObjectWithID(ID),
      ))
    }

    const anchor = this.room.roomManager.anchor
    if (!anchor) throw Error('no anchor')

    let spawningStructuresByPriority: SpawningStructures = []
    const structuresToSort: SpawningStructures = []

    for (const structure of this.actionableSpawningStructures) {
      if (RoomNameUtils.isSourceSpawningStructure(this.room.name, structure)) {
        spawningStructuresByPriority.push(structure)
      }

      structuresToSort.push(structure)
    }

    spawningStructuresByPriority = spawningStructuresByPriority.concat(
      structuresToSort.sort((a, b) => getRange(a.pos, anchor) - getRange(b.pos, anchor)),
    )

    this.spawningStructuresByPriorityIDs = spawningStructuresByPriority.map(
      structure => structure.id,
    )
    return (this._spawningStructuresByPriority = spawningStructuresByPriority)
  }

  spawningStructuresByNeedCoords: Id<StructureExtension | StructureSpawn>[]
  _spawningStructuresByNeed: SpawningStructures
  get spawningStructuresByNeed() {
    if (this._spawningStructuresByNeed) return this._spawningStructuresByNeed

    // mark coords in range 1 of reserved source harvest positions
    // mark coords in range of valid fastFiller position

    let ignoreCoords = new Set<number>()

    // source extensions

    const packedHarvestPositions =
      Memory.rooms[this.room.name][RoomMemoryKeys.communeSourceHarvestPositions]
    for (const packedPositions of packedHarvestPositions) {
      const pos = unpackPosAt(packedPositions, 0)

      // Make sure the position is reserved (presumably by a harvester)

      const reserveType = this.room.roomManager.reservedCoords.get(packCoord(pos))
      if (!reserveType) continue
      if (reserveType < ReservedCoordTypes.dying) continue

      forCoordsAroundRange(pos, 1, coord => {
        const structure = this.room.findStructureAtCoord(coord, structure => {
          return structure.structureType === STRUCTURE_EXTENSION
        })
        if (!structure) return

        ignoreCoords.add(packAsNum(coord))
      })
    }

    ignoreCoords = this.findFastFillerIgnoreCoords(ignoreCoords)

    // Filter out structures that have ignored coords
    const spawningStructuresByNeed = this.actionableSpawningStructures.filter(structure => {
      return !ignoreCoords.has(packAsNum(structure.pos))
    })

    return (this._spawningStructuresByNeed = spawningStructuresByNeed)
  }

  findFastFillerIgnoreCoords(ignoreCoords: Set<number>) {
    const fastFillerCoords = RoomUtils.getFastFillerCoords(this.room)
    for (const coord of fastFillerCoords) {
      // Make sure the position is reserved (presumably by a fastFiller)

      const reserveType = this.room.roomManager.reservedCoords.get(packCoord(coord))
      if (!reserveType) continue
      if (reserveType < ReservedCoordTypes.dying) continue

      // register structures the fastFiller should be able to fill
      forCoordsAroundRange(coord, 1, coord => {
        ignoreCoords.add(packAsNum(coord))
      })
    }

    return ignoreCoords
  }
}
