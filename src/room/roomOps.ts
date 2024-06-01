import {
  RoomMemoryKeys,
  roomTypesUsedForStats,
  creepRoles,
  powerCreepClassNames,
  RoomLogisticsRequestTypes,
  RoomTypes,
  roomDimensions,
  allStructureTypes,
  Result,
  constantRoomTypes,
  packedCoordLength,
  RoomStatusKeys,
} from '../constants/general'
import { StatsManager } from 'international/stats'
import { Dashboard, Rectangle, Table } from 'screeps-viz'
import { isAlly, packXYAsNum, randomTick } from 'utils/utils'
import { RoomNameUtils } from './roomNameUtils'
import { CommuneManager } from './commune/commune'
import { CommuneOps } from './commune/communeOps'
import { LogisticsProcs } from './logisticsProcs'
import { LogOps } from 'utils/logOps'
import { packCoord, packCoordList, unpackCoord, unpackCoordList } from 'other/codec'
import { HaulerServices } from './creeps/roles/haulerServices'
import { HaulerOps } from './creeps/roles/haulerOps'
import { roomData } from './roomData'
import { RoomManager } from './room'
import { MyCreepServices } from './creeps/myCreepServices'

export class RoomOps {
  /**
   * Not perfect, but should help reduce heap usage until RoomManagers are deprecated.
   */
  static clean(roomManager: RoomManager) {
    delete roomManager._structureUpdate
    delete roomManager.checkedCSiteUpdate
    delete roomManager._communeSources
    delete roomManager._remoteSources
    delete roomManager._mineral
    delete roomManager.checkedCSiteUpdate
    delete roomManager._structures
    delete roomManager._cSites
    delete roomManager._notMyCreeps
    delete roomManager._enemyAttackers
    delete roomManager._myDamagedCreeps
    delete roomManager._myDamagedPowerCreeps
    delete roomManager._allyDamagedCreeps
    roomManager._enemyCreepPositions = undefined
    delete roomManager._notMyConstructionSites
    delete roomManager._allyConstructionSitesByType
    delete roomManager._dismantleTargets
    delete roomManager._destructibleStructures
    delete roomManager._combatStructureTargets
    delete roomManager._remoteNamesByEfficacy
    delete roomManager._remoteSourceIndexesByEfficacy

    roomManager._sourceContainers = undefined
    roomManager._fastFillerContainers = undefined
    roomManager._controllerContainer = undefined
    roomManager._mineralContainer = undefined
    roomManager._fastFillerLink = undefined
    roomManager._hubLink = undefined
    roomManager._droppedEnergy = undefined
    roomManager._droppedResources = undefined
    roomManager._actionableWalls = undefined
    roomManager._quadCostMatrix = undefined
    roomManager._quadBulldozeCostMatrix = undefined
    roomManager._enemyDamageThreat = undefined
    roomManager._enemyThreatCoords = undefined
    roomManager._enemyThreatGoals = undefined
    /* this._flags = undefined */
    roomManager._resourcesInStoringStructures = undefined
    roomManager._unprotectedEnemyCreeps = undefined
    roomManager._exitCoords = undefined
    roomManager._advancedLogistics = undefined
    roomManager._defaultCostMatrix = undefined
    roomManager._totalEnemyCombatStrength = undefined
    roomManager._factory = undefined
    roomManager._powerSpawn = undefined
    roomManager._nuker = undefined
    roomManager._observer = undefined
  }

  static update(room: Room) {
    const roomManager = room.roomManager

    if (randomTick()) {
      delete roomManager._nukeTargetCoords
      roomManager.roomLogisticsBlacklistCoords = new Set()
    }

    roomManager.reservedCoords = new Map()

    roomManager.room = room
    const roomMemory = room.memory

    // If it hasn't been scouted for 100~ ticks
    if (Game.time - roomMemory[RoomMemoryKeys.lastScout] > Math.floor(Math.random() * 200)) {
      this.basicScout(room.name)
      RoomNameUtils.cleanMemory(room.name)
    }

    const roomType = roomMemory[RoomMemoryKeys.type]
    if (roomTypesUsedForStats.includes(roomType)) {
      StatsManager.roomInitialRun(room.name, roomType)
    }

    room.moveRequests = {}
    room.creepPositions = {}
    room.powerCreepPositions = {}

    // Single tick properties

    room.myCreeps = []
    room.myPowerCreeps = []

    room.myCreepsByRole = {}
    for (const role of creepRoles) room.myCreepsByRole[role] = []

    room.myPowerCreepsByRole = {}
    for (const className of powerCreepClassNames) room.myPowerCreepsByRole[className] = []

    room.powerRequests = {}

    room.creepsOfSource = []

    const packedSourceCoords = roomMemory[RoomMemoryKeys.sourceCoords]
    if (packedSourceCoords) {
      const sourceCount = packedSourceCoords.length / packedCoordLength
      for (let i = 0; i < sourceCount; i++) room.creepsOfSource.push([])
    }

    room.squadRequests = new Set()

    room.roomLogisticsRequests = {
      [RoomLogisticsRequestTypes.transfer]: {},
      [RoomLogisticsRequestTypes.withdraw]: {},
      [RoomLogisticsRequestTypes.offer]: {},
      [RoomLogisticsRequestTypes.pickup]: {},
    }

    if (!room.controller) return

    // There is a controller

    if (this.updatePotentialCommune(room) === true) return

    // The room isn't a commune
  }

  /**
   *
   * @returns wether or not the room is a commune
   */
  private static updatePotentialCommune(room: Room): boolean {
    const roomMemory = Memory.rooms[room.name]

    if (!room.controller.my) {
      if (roomMemory[RoomMemoryKeys.type] === RoomTypes.commune) {
        roomMemory[RoomMemoryKeys.type] = RoomTypes.neutral
        RoomNameUtils.cleanMemory(room.name)
      }
      return false
    }

    // If the type isn't a commune, make it so and clean its memory

    if (roomMemory[RoomMemoryKeys.type] !== RoomTypes.commune) {
      roomMemory[RoomMemoryKeys.type] = RoomTypes.commune
      RoomNameUtils.cleanMemory(room.name)
    }

    // If there is no communeManager for the room yet, make one and assign them together

    room.communeManager = CommuneManager.communeManagers[room.name]
    if (!room.communeManager) {
      room.communeManager = new CommuneManager()
      CommuneManager.communeManagers[room.name] = room.communeManager
    }

    CommuneOps.update(room)
    return true
  }

  static initRun(room: Room) {
    if (room.communeManager) {
      CommuneOps.initRun(room)
      return
    }
  }

  static run(room: Room) {
    const roomMemory = Memory.rooms[room.name]
    if (roomMemory[RoomMemoryKeys.type] === RoomTypes.commune) {
      CommuneOps.run(room)
      return
    }

    if (roomMemory[RoomMemoryKeys.type] === RoomTypes.neutral) {
      LogisticsProcs.createRemoteContainerLogisticsRequests(room)
      LogisticsProcs.createRemoteDroppedResourceLogisticsRequests(room)
      LogisticsProcs.createRemoteTombstoneLogisticsRequests(room)
      LogisticsProcs.createRemoteRuinLogisticsRequests(room)
    }

    const roomManager = room.roomManager

    roomManager.creepRoleManager.run()
    roomManager.powerCreepRoleManager.run()
    MyCreepServices.moveCreeps(room)
    MyCreepServices.chant(room)
    roomManager.roomVisualsManager.run()

    this.test(room)
  }

  private static test(room: Room) {}

  /**
   * Debug
   */
  visualizeReservedCoords(room: Room) {
    const roomManager = room.roomManager

    LogOps.log('reservedCoords', JSON.stringify([...roomManager.reservedCoords]))
    for (const [packedCoord, reserveType] of roomManager.reservedCoords) {
      const coord = unpackCoord(packedCoord)
      room.coordVisual(coord.x, coord.y, `hsl(${200}${reserveType * 50}, 100%, 60%)`)
    }
  }

  static tableVisual(room: Room, title: string, headers: string[], data: string[][]) {
    Dashboard({
      config: {
        room: room.name,
      },
      widgets: [
        {
          pos: {
            x: 1,
            y: 1,
          },
          width: 47,
          height: 3 + data.length,
          widget: Rectangle({
            data: Table(() => ({
              data,
              config: {
                label: title,
                headers,
              },
            })),
          }),
        },
      ],
    })
  }

  /**
   * Creates a new terrain binary: 0 = not wall, 255 = wall.
   * Callers of this function are responsible for caching the data themselves (or not, if preferred).
   */
  static createTerrainBinary(roomName: string) {
    const terrainBinary = new Uint8Array(2500)

    const terrain = Game.map.getRoomTerrain(roomName)

    for (let x = 0; x < roomDimensions; x += 1) {
      for (let y = 0; y < roomDimensions; y += 1) {
        terrainBinary[packXYAsNum(x, y)] = terrain.get(x, y) === TERRAIN_MASK_WALL ? 255 : 0
      }
    }

    return terrainBinary
  }

  /**
   * A temporaly-discrete cached terrain binary. 0 = not wall, 255 = wall
   */
  static getTerrainBinary(roomName: string) {
    const data = roomData[roomName]
    if (data.terrainBinary !== undefined) {
      return data.terrainBinary
    }

    const terrainBinary = this.createTerrainBinary(roomName)

    data.terrainBinary = terrainBinary
    return terrainBinary
  }

  static getStructures(room: Room) {
    if (room.structures !== undefined) {
      return room.structures
    }

    const structures: OrganizedStructures = {} as OrganizedStructures
    for (const structureType of allStructureTypes) structures[structureType] = []

    const unorganizedStructures = room.find(FIND_STRUCTURES)
    for (const structure of unorganizedStructures) {
      structures[structure.structureType].push(structure as any)
    }

    room.structures = structures
    return structures
  }

  static advancedScout(room: Room, scoutingRoom: Room) {
    const roomMemory = Memory.rooms[room.name]

    if (roomMemory[RoomMemoryKeys.status] === undefined) {
      this.findAndRecordStatus(room.name, roomMemory)
    }

    // Record that the room was scouted this tick
    roomMemory[RoomMemoryKeys.lastScout] = Game.time

    if (!roomMemory[RoomMemoryKeys.controllerCoord]) {
      if (room.controller) {
        roomMemory[RoomMemoryKeys.controllerCoord] = packCoord(room.controller.pos)
      }
    }

    if (!roomMemory[RoomMemoryKeys.sourceCoords]) {
      this.getSources(room)
    }

    // If the room already has a type and its type is constant, no need to go further
    if (constantRoomTypes.has(roomMemory[RoomMemoryKeys.type])) {
      return roomMemory[RoomMemoryKeys.type]
    }

    const roomNameScoutType = this.findAndRecordConstantType(room.name)
    if (roomNameScoutType !== Result.fail) {
      if (roomNameScoutType === RoomTypes.sourceKeeper) {
        // Record the positions of keeper lairs

        const lairCoords = room.roomManager.structures.keeperLair.map(lair => lair.pos)
        roomMemory[RoomMemoryKeys.keeperLairCoords] = packCoordList(lairCoords)
      }

      return roomMemory[RoomMemoryKeys.type]
    }

    // If there is a controller
    if (room.controller) {
      // If the contoller is owned

      if (room.controller.owner) {
        // Stop if the controller is owned by me

        if (room.controller.my) return roomMemory[RoomMemoryKeys.type]

        const owner = room.controller.owner.username
        roomMemory[RoomMemoryKeys.owner] = owner

        // If the controller is owned by an ally

        if (global.settings.allies.includes(owner))
          return (roomMemory[RoomMemoryKeys.type] = RoomTypes.ally)

        return room.scoutEnemyRoom()
      }

      // No controlller owner

      room.createWorkRequest()

      if (room.scoutRemote(scoutingRoom)) return roomMemory[RoomMemoryKeys.type]

      return (roomMemory[RoomMemoryKeys.type] = RoomTypes.neutral)
    }

    return roomMemory[RoomMemoryKeys.type]
  }

  /**
   * Cached sources using recorded source coords
   */
  static getSources(room: Room) {
    if (room.sources !== undefined) return room.sources

    const roomMemory = Memory.rooms[room.name]
    const packedSourceCoords = roomMemory[RoomMemoryKeys.sourceCoords]
    if (!packedSourceCoords) {
      const sources = room.find(FIND_SOURCES)

      const sourceCoords = sources.map(source => source.pos)
      roomMemory[RoomMemoryKeys.sourceCoords] = packCoordList(sourceCoords)

      room.sources = sources
      return sources
    }

    const sources = new Array<Source>()

    const sourceCoords = unpackCoordList(packedSourceCoords)
    for (const coord of sourceCoords) {
      for (const source of room.lookForAt(LOOK_SOURCES, coord.x, coord.y)) {
        sources.push(source)
      }
    }

    room.sources = sources
    return sources
  }

  static basicScout(roomName: string) {
    const roomMemory = Memory.rooms[roomName]

    if (roomMemory[RoomMemoryKeys.status] === undefined) {
      this.findAndRecordStatus(roomName, roomMemory)
    }

    // Record that the room was scouted this tick
    roomMemory[RoomMemoryKeys.lastScout] = Game.time

    const room = Game.rooms[roomName]
    if (!room) return roomMemory[RoomMemoryKeys.type]

    // We have vision of the room

    if (roomMemory[RoomMemoryKeys.controllerCoord] === undefined) {
      if (room.controller) {
        roomMemory[RoomMemoryKeys.controllerCoord] = packCoord(room.controller.pos)
      }
    }

    if (roomMemory[RoomMemoryKeys.sourceCoords] === undefined) {
      RoomOps.getSources(room)
    }

    if (!room.controller) return roomMemory[RoomMemoryKeys.type]

    // If the contoller is owned
    if (room.controller.owner) {
      // Stop if the controller is owned by me

      if (room.controller.my) return roomMemory[RoomMemoryKeys.type]

      const owner = room.controller.owner.username
      roomMemory[RoomMemoryKeys.owner] = owner

      // If the controller is owned by an ally

      if (isAlly(owner)) {
        roomMemory[RoomMemoryKeys.type] = RoomTypes.ally
      }

      return room.scoutEnemyRoom()
    }

    // There is no controller owner

    if (room.scoutRemote()) return roomMemory[RoomMemoryKeys.type]

    return (roomMemory[RoomMemoryKeys.type] = RoomTypes.neutral)
  }

  static findAndRecordConstantType(roomName: string) {
    // Find the numbers in the room's name
    const [EWstring, NSstring] = roomName.match(/\d+/g)

    // Convert he numbers from strings into actual numbers

    const EW = parseInt(EWstring)
    const NS = parseInt(NSstring)

    const roomMemory = Memory.rooms[roomName]

    // Use the numbers to deduce some room types - cheaply!

    if (EW % 10 === 0 && NS % 10 === 0) {
      return (roomMemory[RoomMemoryKeys.type] = RoomTypes.intersection)
    }

    if (EW % 10 === 0 || NS % 10 === 0) {
      return (roomMemory[RoomMemoryKeys.type] = RoomTypes.highway)
    }
    if (EW % 5 === 0 && NS % 5 === 0) {
      return (roomMemory[RoomMemoryKeys.type] = RoomTypes.center)
    }
    if (Math.abs(5 - (EW % 10)) <= 1 && Math.abs(5 - (NS % 10)) <= 1) {
      return (roomMemory[RoomMemoryKeys.type] = RoomTypes.sourceKeeper)
    }

    return Result.fail
  }

  static findAndRecordStatus(roomName: string, roomMemory = Memory.rooms[roomName]) {
    const status = Game.map.getRoomStatus(roomName).status
    roomMemory[RoomMemoryKeys.status] = RoomStatusKeys[status]

    return status
  }
}
