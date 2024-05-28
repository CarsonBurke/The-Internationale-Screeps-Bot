import { BasePlans } from 'room/construction/basePlans'
import {
  CreepMemoryKeys,
  RemoteResourcePathTypes,
  ReservedCoordTypes,
  Result,
  RoomMemoryKeys,
  RoomTypes,
  customColors,
  defaultPlainCost,
  defaultSwampCost,
  impassibleStructureTypes,
  impassibleStructureTypesSet,
  packedCoordLength,
  roomDimensions,
} from '../constants/general'
import { packCoord, unpackCoord, unpackCoordList, unpackPosAt, unpackPosList } from 'other/codec'
import { LogTypes, LogOps } from 'utils/logOps'
import { forCoordsAroundRange, unpackNumAsCoord, visualizePath } from '../utils/utils'
import { RoomUtils } from 'room/roomUtils'
import { RoomOps } from 'room/roomOps'

export interface PathGoal {
  pos: RoomPosition
  range: number
}

export type RoomRoute = {
  exit: ExitConstant
  room: string
}[]

export interface CustomPathFinderArgs {
  /**
   * Not required when pathing for creeps
   */
  origin?: RoomPosition
  goals: PathGoal[]
  /**
   * room types as keys to weight based on properties
   */
  typeWeights?: Partial<{ [key in RoomTypes]: number }>
  plainCost?: number
  swampCost?: number
  maxRooms?: number
  /**
   * Default is false
   */
  flee?: boolean
  creep?: Creep
  /**
   * Default is true
   */
  avoidDanger?: boolean

  weightStructures?: Partial<{ [key in StructureConstant]: number }>

  /**
   * An object with keys of weights and values of positions
   */

  weightCoords?: { [roomName: string]: { [packedCoord: string]: number } }

  /**
   * The the costMatrix to begin with. Will apply minimal alterations in use
   */
  defaultCostMatrix?(roomName: string): CostMatrix | false

  /**
   * The names of the costMatrixes to weight. Will apply onto cost matrix in use
   */
  overrideCostMatrixes?(roomName: string): CostMatrix[]

  weightCoordMapsForRoomName?(roomName: string): Uint8Array

  weightCoordMaps?: CoordMap[]

  /**
   *
   */
  avoidEnemyRanges?: boolean

  avoidKeeperLairs?: boolean

  avoidStationaryPositions?: boolean

  /**
   *
   */
  avoidImpassibleStructures?: boolean

  /**
   * Marks creeps not owned by the bot as avoid
   */
  avoidNotMyCreeps?: boolean

  /**
   * Weight my ramparts by this value
   */
  myRampartWeight?: number

  weightCommuneStructurePlans?: boolean
  weightRemoteStructurePlans?: {
    remoteResourcePathType: RemoteResourcePathTypes
  }

  minReservedCoordType?: ReservedCoordTypes
}

/**
 * stateless
 */
export class CustomPathFinder {
  static findPath(args: CustomPathFinderArgs) {
    const allowedRoomNames = this.findAllowedRooms(args)
    if (allowedRoomNames === Result.fail) return []

    this.weightStructurePlans(args, allowedRoomNames)

    const result = this.generatePath(args, allowedRoomNames)
    return result
  }

  private static findAllowedRooms(args: CustomPathFinderArgs) {
    const allowedRoomNames = new Set([args.origin.roomName])

    // If there is one goal
    if (args.goals.length === 1) {
      return this.singleGoalRoute(args, allowedRoomNames)
    }

    // There are multiple goals

    return this.multiGoalRoute(args, allowedRoomNames)
  }

  private static singleGoalRoute(args: CustomPathFinderArgs, allowedRoomNames: Set<string>) {
    const goal = args.goals[0]
    // If the goal is in the same room as the origin
    if (args.origin.roomName === goal.pos.roomName) return allowedRoomNames

    // Construct route by searching through rooms

    const route = Game.map.findRoute(args.origin.roomName, goal.pos.roomName, {
      // Essentially a costMatrix for the rooms, priority is for the lower values. Infinity is impassible

      routeCallback: () => this.weightRoom(args.origin.roomName, args, goal),
    })

    // If a route can't be found
    if (route === ERR_NO_PATH) return Result.fail

    // A viable route was found

    this.recordRoutesAllowedRooms(route, allowedRoomNames, args, goal)
    return allowedRoomNames
  }

  private static multiGoalRoute(args: CustomPathFinderArgs, allowedRoomNames: Set<string>) {
    /**
     * Room names for goals that have already been searched and thus don't require another one
     */
    const searchedGoalRoomNames: Set<string> = new Set()
    let shortestRoute = Infinity

    for (const goal of args.goals) {
      // If the goal is in the same room as the origin
      if (args.origin.roomName === goal.pos.roomName) {
        return allowedRoomNames
      }

      if (searchedGoalRoomNames.has(goal.pos.roomName)) continue
      searchedGoalRoomNames.add(goal.pos.roomName)

      const minDistance = Game.map.getRoomLinearDistance(args.origin.roomName, goal.pos.roomName)
      if (minDistance >= shortestRoute) continue

      // Construct route by searching through rooms

      const route = Game.map.findRoute(args.origin.roomName, goal.pos.roomName, {
        // Essentially a costMatrix for the rooms, priority is for the lower values. Infinity is impassible

        routeCallback: () => this.weightRoom(args.origin.roomName, args, goal),
      })

      // If a route can't be found
      if (route === ERR_NO_PATH) continue

      this.recordRoutesAllowedRooms(route, allowedRoomNames, args, goal)

      shortestRoute = route.length
    }

    // If no viable routes were found
    if (shortestRoute === Infinity) {
      return Result.fail
    }
    // Otherwise, viable routes were found
    return allowedRoomNames
  }

  private static recordRoutesAllowedRooms(
    route: RoomRoute,
    allowedRoomNames: Set<string>,
    args: CustomPathFinderArgs,
    goal: PathGoal,
  ) {
    for (const roomRoute of route) {
      allowedRoomNames.add(roomRoute.room)

      const exits = Game.map.describeExits(roomRoute.room)
      for (const exit in exits) {
        const roomName = exits[exit as ExitKey]

        if (allowedRoomNames.has(roomName)) continue

        const weight = this.weightRoom(roomName, args, goal)
        if (weight === Infinity) continue

        allowedRoomNames.add(roomName)
      }
    }
  }

  private static weightRoom(roomName: string, args: CustomPathFinderArgs, goal: PathGoal) {
    const roomMemory = Memory.rooms[roomName]
    if (!roomMemory) {
      if (roomName === goal.pos.roomName) return 1
      return Infinity
    }

    // Avoid dangerous rooms if we are told to and the danger is persistent
    if (
      args.avoidDanger &&
      roomMemory[RoomMemoryKeys.danger] &&
      roomMemory[RoomMemoryKeys.danger] >= Game.time
    )
      return Infinity

    // If the goal is in the room
    if (roomName === goal.pos.roomName) return 1

    // If the type is in typeWeights, inform the weight for the type
    if (args.typeWeights && args.typeWeights[roomMemory[RoomMemoryKeys.type] as 0])
      return args.typeWeights[roomMemory[RoomMemoryKeys.type] as 0]

    return 1
  }

  private static weightStructurePlans(args: CustomPathFinderArgs, allowedRoomNames: Set<string>) {
    if (!args.weightCommuneStructurePlans) return

    if (!args.weightCoords) args.weightCoords = {}

    for (const roomName of allowedRoomNames) {
      if (!args.weightCoords[roomName]) args.weightCoords[roomName] = {}
    }

    for (const roomName of allowedRoomNames) {
      if (this.weightCommuneStructurePlans(args, roomName)) continue
      if (this.weightRemoteStructurePlans(args, roomName)) continue
    }
  }

  private static weightCommuneStructurePlans(args: CustomPathFinderArgs, roomName: string) {
    if (!args.weightCommuneStructurePlans) return false

    const roomMemory = Memory.rooms[roomName]
    if (!roomMemory) return false
    if (roomMemory[RoomMemoryKeys.type] !== RoomTypes.commune) return false

    const room = Game.rooms[roomName]
    if (!room) return false

    // Weight structures

    const basePlans = room.roomManager.basePlans

    for (const packedCoord in basePlans.map) {
      const coordData = basePlans.map[packedCoord]

      for (const data of coordData) {
        const weight = impassibleStructureTypesSet.has(data.structureType) ? 255 : 1

        const currentWeight = args.weightCoords[roomName][packedCoord] || 0
        args.weightCoords[roomName][packedCoord] = Math.max(weight, currentWeight)
      }
    }

    // Weight potential and actual stationary positions

    const sourceCount = roomMemory[RoomMemoryKeys.sourceCoords].length / packedCoordLength
    for (let index = 0; index < sourceCount; index++) {
      // Loop through each position of harvestPositions, have creeps prefer to avoid

      for (const pos of room.roomManager.sourceHarvestPositions[index]) {
        const packedCoord = packCoord(pos)

        const currentWeight = args.weightCoords[roomName][packedCoord] || 0
        args.weightCoords[roomName][packedCoord] = Math.max(20, currentWeight)
      }
    }

    if (room.roomManager.anchor) {
      // The last upgrade position should be the deliver pos, which we want to weight normal

      for (const pos of room.roomManager.upgradePositions) {
        const packedCoord = packCoord(pos)

        const currentWeight = args.weightCoords[roomName][packedCoord] || 0
        args.weightCoords[roomName][packedCoord] = Math.max(20, currentWeight)
      }

      for (const pos of room.roomManager.mineralHarvestPositions) {
        const packedCoord = packCoord(pos)

        const currentWeight = args.weightCoords[roomName][packedCoord] || 0
        args.weightCoords[roomName][packedCoord] = Math.max(20, currentWeight)
      }

      const stampAnchors = room.roomManager.stampAnchors
      if (stampAnchors) {
        const packedCoord = packCoord(stampAnchors.hub[0])

        const currentWeight = args.weightCoords[roomName][packedCoord] || 0
        args.weightCoords[roomName][packedCoord] = Math.max(20, currentWeight)
      }

      // Loop through each position of fastFillerPositions, have creeps prefer to avoid

      const fastFillerCoords = RoomUtils.getFastFillerCoords(room)
      for (const pos of fastFillerCoords) {
        const packedCoord = packCoord(pos)

        const currentWeight = args.weightCoords[roomName][packedCoord] || 0
        args.weightCoords[roomName][packedCoord] = Math.max(20, currentWeight)
      }
    }

    return true
  }

  private static weightRemoteStructurePlans(args: CustomPathFinderArgs, roomName: string) {
    if (!args.weightRemoteStructurePlans.remoteResourcePathType) return false

    const roomMemory = Memory.rooms[roomName]
    if (roomMemory[RoomMemoryKeys.type] !== RoomTypes.remote) return false

    for (const packedPath of roomMemory[args.weightRemoteStructurePlans.remoteResourcePathType]) {
      const path = unpackPosList(packedPath)

      for (const pos of path) {
        if (!args.weightCoords[pos.roomName]) args.weightCoords[pos.roomName] = {}
        args.weightCoords[pos.roomName][packCoord(pos)] = 1
      }
    }

    // Prefer to avoid the best source harvest pos
    for (const packedPositions of roomMemory[RoomMemoryKeys.remoteSourceHarvestPositions]) {
      const pos = unpackPosAt(packedPositions, 0)
      const packedCoord = packCoord(pos)

      const currentWeight = args.weightCoords[roomName][packedCoord] || 0
      args.weightCoords[roomName][packedCoord] = Math.max(20, currentWeight)
    }

    // Prefer to avoid all potential reservation positions

    const positions = unpackPosList(roomMemory[RoomMemoryKeys.remoteControllerPositions])

    for (const pos of positions) {
      const packedCoord = packCoord(pos)
      const currentWeight = args.weightCoords[roomName][packedCoord] || 0
      args.weightCoords[roomName][packedCoord] = Math.max(20, currentWeight)
    }

    return true
  }

  private static generatePath(args: CustomPathFinderArgs, allowedRoomNames: Set<string>) {
    args.plainCost = args.plainCost || defaultPlainCost
    args.swampCost = args.swampCost || defaultSwampCost
    if (args.avoidKeeperLairs === undefined) args.avoidKeeperLairs = true

    const originRoom: undefined | Room = Game.rooms[args.origin.roomName]
    const maxRooms = args.maxRooms
      ? Math.min(allowedRoomNames.size, args.maxRooms)
      : allowedRoomNames.size
    const pathFinderResult = PathFinder.search(args.origin, args.goals, {
      plainCost: args.plainCost,
      swampCost: args.swampCost,
      maxRooms,
      maxOps: Math.min(100000, (1 + maxRooms) * 2000),
      heuristicWeight: 1,
      flee: args.flee,

      // Create costMatrixes for room tiles, where lower values are priority, and 255 or more is considered impassible

      roomCallback(roomName) {
        // If the room is not allowed

        if (!allowedRoomNames.has(roomName)) return false

        const room = Game.rooms[roomName]
        const roomMemory = Memory.rooms[roomName]
        let costs: CostMatrix
        if (args.defaultCostMatrix) {
          const defaultCosts = args.defaultCostMatrix(roomName)
          if (defaultCosts) costs = defaultCosts
        } else costs = new PathFinder.CostMatrix()

        CustomPathFinder.weightExits(costs, allowedRoomNames)

        if (args.defaultCostMatrix) return costs

        CustomPathFinder.weightCoordMapsForRoomName(costs, args, roomName)
        CustomPathFinder.weightCoords(costs, args, roomName)
        CustomPathFinder.weightCoordMaps(costs, args, roomName)

        // If we have no vision in the room

        if (!room) return costs

        CustomPathFinder.weightCreep(costs, args, room)
        CustomPathFinder.avoidStationaryPositions(costs, args, room)
        CustomPathFinder.weightStructures(costs, args, room)

        for (const portal of room.roomManager.structures.portal)
          costs.set(portal.pos.x, portal.pos.y, 255)

        // Loop trough each construction site belonging to an ally

        for (const cSite of room.roomManager.notMyConstructionSites.ally)
          costs.set(cSite.pos.x, cSite.pos.y, 255)

        CustomPathFinder.avoidEnemyRanges(costs, args, room)
        CustomPathFinder.avoidKeeperLairs(costs, args, roomMemory)
        CustomPathFinder.avoidNotMyCreeps(costs, args, room)
        CustomPathFinder.avoidImpassibleStructures(costs, args, room)
        CustomPathFinder.overrideCostMatrixes(costs, args, roomName)
        CustomPathFinder.avoidConstructedWalls(costs, args, room)

        // Inform the CostMatrix

        return costs
      },
    })

    // If the pathFindResult is incomplete, inform an empty array

    if (pathFinderResult.incomplete) {
      LogOps.log(
        'Incomplete Path',
        `${args.origin} -> ${args.goals[0].pos} range: ${args.goals[0].range} goals: ${
          args.goals.length
        } path len: ${pathFinderResult.path.length} allowed: ${Array.from(allowedRoomNames)}`,
        {
          type: LogTypes.warning,
        },
      )

      visualizePath(pathFinderResult.path, customColors.red)
      originRoom.errorVisual(args.origin)

      let lastPos = args.origin

      for (const goal of args.goals) {
        // Ensure no visuals are generated outside of the origin room

        if (lastPos.roomName !== goal.pos.roomName) continue

        originRoom.visual.line(lastPos, goal.pos, {
          color: customColors.red,
          width: 0.15,
          opacity: 0.3,
          lineStyle: 'solid',
        })

        lastPos = goal.pos
      }

      return []
    }

    // Otherwise inform the path from pathFinderResult

    return pathFinderResult.path
  }

  static weightExits(costs: CostMatrix, allowedRoomNames: Set<string>) {
    // If there i
    if (allowedRoomNames.size > 1) return

    // There is no route

    // Configure y and loop through top exits

    let x
    let y = 0
    for (x = 0; x < roomDimensions; x += 1) costs.set(x, y, 255)

    // Configure x and loop through left exits

    x = 0
    for (y = 0; y < roomDimensions; y += 1) costs.set(x, y, 255)

    // Configure y and loop through bottom exits

    y = roomDimensions - 1
    for (x = 0; x < roomDimensions; x += 1) costs.set(x, y, 255)

    // Configure x and loop through right exits

    x = roomDimensions - 1
    for (y = 0; y < roomDimensions; y += 1) costs.set(x, y, 255)
  }

  static weightCoordMapsForRoomName(
    costs: CostMatrix,
    args: CustomPathFinderArgs,
    roomName: string,
  ) {
    if (!args.weightCoordMapsForRoomName) return

    const coordMap = args.weightCoordMapsForRoomName(roomName)
    if (!coordMap) return

    for (const index in coordMap) {
      const packedCoord = parseInt(index)

      if (coordMap[packedCoord] === 0) continue

      const coord = unpackNumAsCoord(packedCoord)
      if (costs.get(coord.x, coord.y) === 255) continue

      costs.set(coord.x, coord.y, coordMap[packedCoord])
    }
  }

  static weightCoords(costs: CostMatrix, args: CustomPathFinderArgs, roomName: string) {
    if (!args.weightCoords) return
    if (!args.weightCoords[roomName]) return

    for (const packedCoord in args.weightCoords[roomName]) {
      const coord = unpackCoord(packedCoord)

      costs.set(coord.x, coord.y, args.weightCoords[roomName][packedCoord])
    }
  }

  static weightCoordMaps(costs: CostMatrix, args: CustomPathFinderArgs, roomName: string) {
    if (!args.weightCoordMaps) return

    for (const coordMap of args.weightCoordMaps) {
      for (const index in coordMap) {
        const packedCoord = parseInt(index)

        if (coordMap[packedCoord] === 0) continue

        const coord = unpackNumAsCoord(packedCoord)
        if (costs.get(coord.x, coord.y) === 255) continue

        costs.set(coord.x, coord.y, coordMap[packedCoord])
      }
    }
  }

  static weightCreep(costs: CostMatrix, args: CustomPathFinderArgs, room: Room) {
    if (!args.creep) return

    const creepMemory = Memory.creeps[args.creep.name] || Memory.powerCreeps[args.creep.name]

    if (
      (!creepMemory[CreepMemoryKeys.squadMembers] ||
        creepMemory[CreepMemoryKeys.squadMembers].length < 3) &&
      (!args.weightStructures || !args.weightStructures.road)
    ) {
      let roadCost = 1
      if (!creepMemory[CreepMemoryKeys.preferRoads]) roadCost = args.plainCost

      for (const road of room.roomManager.structures.road)
        costs.set(road.pos.x, road.pos.y, roadCost)
    }
  }

  static avoidStationaryPositions(costs: CostMatrix, args: CustomPathFinderArgs, room: Room) {
    // If avoidStationaryPositions is requested

    if (!args.avoidStationaryPositions) return

    for (const [packedCoord, reserveType] of room.roomManager.reservedCoords) {
      if (args.minReservedCoordType && reserveType < args.minReservedCoordType) continue

      const coord = unpackCoord(packedCoord)
      costs.set(coord.x, coord.y, reserveType * 5 + 5)
    }
  }

  static weightStructures(costs: CostMatrix, args: CustomPathFinderArgs, room: Room) {
    if (!args.weightStructures) return

    for (const key in args.weightStructures) {
      // Get the numeric value of the weight

      const structureType = key as StructureConstant

      for (const structure of room.roomManager.structures[structureType])
        costs.set(structure.pos.x, structure.pos.y, args.weightStructures[structureType])
    }
  }

  static avoidEnemyRanges(costs: CostMatrix, args: CustomPathFinderArgs, room: Room) {
    // Stop if avoidEnemyRanges isn't specified
    if (!args.avoidEnemyRanges) return
    if (room.controller && room.controller.safeMode && room.controller.my) return

    for (const packedCoord of room.roomManager.enemyThreatCoords) {
      const coord = unpackCoord(packedCoord)
      costs.set(coord.x, coord.y, 255)
    }
  }

  static avoidKeeperLairs(costs: CostMatrix, args: CustomPathFinderArgs, roomMemory: RoomMemory) {
    if (!args.avoidKeeperLairs) return
    if (roomMemory[RoomMemoryKeys.type] !== RoomTypes.sourceKeeper) return

    const lairCoords = unpackCoordList(roomMemory[RoomMemoryKeys.keeperLairCoords])
    for (const lairCoord of lairCoords) {
      forCoordsAroundRange(lairCoord, 4, coord => {
        costs.set(coord.x, coord.y, 255)
      })
    }
  }

  static avoidNotMyCreeps(costs: CostMatrix, args: CustomPathFinderArgs, room: Room) {
    if (!args.avoidNotMyCreeps) return
    // If the room is in safemode, there is no point in avoiding enemy creeps
    if (room.controller && room.controller.safeMode) return

    for (const creep of room.roomManager.notMyCreeps.enemy) costs.set(creep.pos.x, creep.pos.y, 255)
    for (const creep of room.roomManager.notMyCreeps.ally) costs.set(creep.pos.x, creep.pos.y, 255)

    for (const creep of room.find(FIND_HOSTILE_POWER_CREEPS))
      costs.set(creep.pos.x, creep.pos.y, 255)
  }

  static avoidImpassibleStructures(costs: CostMatrix, args: CustomPathFinderArgs, room: Room) {
    if (!args.avoidImpassibleStructures) return

    for (const rampart of room.roomManager.structures.rampart) {
      // If the rampart is mine

      if (rampart.my) {
        // If there is no weight for my ramparts, iterate
        if (!args.myRampartWeight) continue

        // Otherwise, record rampart by the weight and iterate

        costs.set(rampart.pos.x, rampart.pos.y, args.myRampartWeight)
        continue
      }

      // If the rampart is public and owned by an ally
      // We don't want to try to walk through enemy public ramparts as it could trick our pathing

      if (rampart.isPublic && global.settings.allies.includes(rampart.owner.username)) continue

      // Otherwise set the rampart's pos as impassible
      costs.set(rampart.pos.x, rampart.pos.y, 255)
    }

    // Loop through structureTypes of impassibleStructureTypes

    for (const structureType of impassibleStructureTypes) {
      for (const structure of room.roomManager.structures[structureType]) {
        // Set pos as impassible
        costs.set(structure.pos.x, structure.pos.y, 255)
      }

      for (const cSite of room.roomManager.cSites[structureType]) {
        // Set pos as impassible
        costs.set(cSite.pos.x, cSite.pos.y, 255)
      }
    }
  }

  static overrideCostMatrixes(costs: CostMatrix, args: CustomPathFinderArgs, roomName: string) {
    if (!args.overrideCostMatrixes) return
    // Otherwise iterate through each x and y in the room

    for (let x = 0; x < roomDimensions; x += 1) {
      for (let y = 0; y < roomDimensions; y += 1) {
        // Loop through each costMatrix

        for (const costMatrix of args.overrideCostMatrixes(roomName)) {
          costs.set(x, y, costMatrix.get(x, y))
        }
      }
    }
  }

  static avoidConstructedWalls(costs: CostMatrix, args: CustomPathFinderArgs, roomName: room) {
    for (const constructedWall of room.roomManager.structures.constructedWall) {
        const { pos } = constructedWall;
        costs.set(pos.x, pos.y, 255)
    }
  }
}
