import {
  Result,
  RoomMemoryKeys,
  RoomStatusKeys,
  RoomTypes,
  defaultSwampCost,
  dynamicScoreRoomRange,
  maxControllerLevel,
  preferredCommuneRange,
  remoteRoles,
  roomDimensions,
  roomTypeProperties,
  roomTypes,
} from '../constants/general'
import { CollectiveManager } from 'international/collective'
import {
  findAdjacentCoordsToCoord,
  forAdjacentCoords,
  forRoomNamesAroundRangeXY,
  getRange,
  isAlly,
  packAsNum,
  packXYAsNum,
  roundTo,
} from 'utils/utils'
import { unpackPosAt } from 'other/codec'
import { CommuneManager } from './commune/commune'
import { LogOps } from 'utils/logOps'
import { RoomOps } from './roomOps'
import { RoomUtils } from './roomUtils'

/**
 * considers a position being flooded
 * @returns Wether or not the position should be flooded next generation
 */
type FloodForCoordCheck = (
  coord: Coord,
  packedCoord: number,
  generation?: number,
) => boolean | Result.stop

export class RoomNameUtils {
  static abandonRemote(roomName: string, time: number) {
    const roomMemory = Memory.rooms[roomName]

    if (roomMemory[RoomMemoryKeys.abandonRemote] >= time) return

    roomMemory[RoomMemoryKeys.abandonRemote] = time
    delete roomMemory[RoomMemoryKeys.recursedAbandonment]
  }
  static findDynamicScore(roomName: string) {
    let dynamicScore = 0

    let closestEnemy = 0
    let communeScore = 0
    let allyScore = 0

    const roomCoord = this.pack(roomName)
    forRoomNamesAroundRangeXY(roomCoord.x, roomCoord.y, dynamicScoreRoomRange, (x, y) => {
      const searchRoomName = this.unpackXY(x, y)
      const searchRoomMemory = Memory.rooms[searchRoomName]
      if (!searchRoomMemory) return

      if (searchRoomMemory[RoomMemoryKeys.type] === RoomTypes.enemy) {
        const score = this.advancedFindDistance(roomName, searchRoomName)
        if (score <= closestEnemy) return

        closestEnemy = score
        return
      }

      if (searchRoomMemory[RoomMemoryKeys.type] === RoomTypes.commune) {
        const searchRoom = Game.rooms[searchRoomName]
        if (!searchRoom) return

        const distance = this.advancedFindDistance(roomName, searchRoomName)

        if (distance === 1) {
            communeScore = 10000
            return
        }

        const score =
          Math.pow(
            Math.abs(distance - preferredCommuneRange),
            1.8,
          ) +
          (maxControllerLevel - searchRoom.controller.level)
        if (score <= communeScore) return

        communeScore = score
        return
      }

      if (searchRoomMemory[RoomMemoryKeys.type] === RoomTypes.ally) {
        const score =
          Math.pow(
            Math.abs(this.advancedFindDistance(roomName, searchRoomName) - preferredCommuneRange),
            1.5,
          ) +
          (searchRoomMemory[RoomMemoryKeys.RCL] || 0) * 0.3
        if (score <= allyScore) return

        allyScore = score
        return
      }
    })

    if (closestEnemy > 0) dynamicScore += Math.round(Math.pow(closestEnemy, -0.8) * 25)
    dynamicScore += Math.round(communeScore * 50)
    dynamicScore += allyScore

    // Prefer minerals with below average communes

    const roomMemory = Memory.rooms[roomName]
    const mineralType = roomMemory[RoomMemoryKeys.mineralType]
    const mineralScore =
      CollectiveManager.mineralNodes[mineralType] - CollectiveManager.avgCommunesPerMineral
    dynamicScore += mineralScore * 40

    dynamicScore = roundTo(dynamicScore, 2)
    /* LogOps.LogOps'Dynamic scores', `enemy ${closestEnemy} commune ${communeScore} ally ${allyScore} mineralScore ${mineralScore} val1 ${Math.round(Math.pow(closestEnemy, -0.8) * 25)} val2 ${Math.round(communeScore * 50)} val3 ${mineralScore * 40} val4 ${dynamicScore}`) */
    roomMemory[RoomMemoryKeys.dynamicScore] = dynamicScore
    roomMemory[RoomMemoryKeys.dynamicScoreUpdate] = Game.time

    return dynamicScore
  }
  static floodFillFor(roomName: string, seeds: Coord[], coordCheck: FloodForCoordCheck) {
    const visitedCoords = new Uint8Array(2500)

    let depth = 0
    let thisGeneration = seeds
    let nextGeneration: Coord[] = []

    // Record seeds as visited
    for (const coord of seeds) visitedCoords[packAsNum(coord)] = 1

    while (thisGeneration.length) {
      // Reset next gen
      nextGeneration = []

      for (const coord of thisGeneration) {
        // Try to flood to adjacent coords
        for (const adjacentCoord of findAdjacentCoordsToCoord(coord)) {
          const packedAdjacentCoord = packAsNum(adjacentCoord)
          // Make sure we haven't visited this coord before
          if (visitedCoords[packedAdjacentCoord]) continue

          visitedCoords[packedAdjacentCoord] = 1

          // Custom check for the coord
          const checkResult = coordCheck(adjacentCoord, packedAdjacentCoord, depth)
          if (checkResult === Result.stop) return adjacentCoord
          if (!checkResult) continue

          nextGeneration.push(adjacentCoord)
        }
      }

      // Set this gen to next gen
      thisGeneration = nextGeneration
      depth += 1
    }

    return false
  }
  static floodFillCardinalFor() {}
  static isSourceSpawningStructure(
    roomName: string,
    structure: StructureExtension | StructureSpawn,
  ) {
    const packedSourceHarvestPositions =
      Memory.rooms[roomName][RoomMemoryKeys.communeSourceHarvestPositions]
    for (const i in packedSourceHarvestPositions) {
      const closestHarvestPos = unpackPosAt(packedSourceHarvestPositions[i], 0)

      if (getRange(structure.pos, closestHarvestPos) <= 1) return true
    }

    return false
  }

  /**
   * Removes roomType-based values in the room's memory that don't match its type
   */
  static cleanMemory(roomName: string) {
    const roomMemory = Memory.rooms[roomName]
    for (const key in roomMemory) {
      // Make sure key is a type-specific key
      if (!roomTypeProperties.has(key as unknown as keyof RoomMemory)) continue

      // Make sure key is related to the roomType
      if (roomTypes[roomMemory[RoomMemoryKeys.type]].has(key as unknown as keyof RoomMemory))
        continue

      delete roomMemory[key as unknown as keyof RoomMemory]
    }
  }

  /**
   * Finds the name of the closest commune, exluding the specified roomName
   */
  static findClosestCommuneName(roomName: string) {
    const communesNotThis = []

    for (const communeName of CollectiveManager.communes) {
      if (roomName == communeName) continue

      communesNotThis.push(communeName)
    }

    return communesNotThis.sort(
      (a, b) =>
        Game.map.getRoomLinearDistance(roomName, a) - Game.map.getRoomLinearDistance(roomName, b),
    )[0]
  }
  static findClosestClaimType(roomName: string) {
    return Array.from(CollectiveManager.communes).sort(
      (a, b) =>
        Game.map.getRoomLinearDistance(roomName, a) - Game.map.getRoomLinearDistance(roomName, b),
    )[0]
  }
  static updateCreepsOfRemoteName(remoteName: string, communeManager: CommuneManager) {
    const remoteMemory = Memory.rooms[remoteName]

    communeManager.room.creepsOfRemote[remoteName] = {}
    for (const role of remoteRoles) {
      communeManager.room.creepsOfRemote[remoteName][role] = []
    }

    communeManager.remoteSourceHarvesters[remoteName] = []
    for (const index in remoteMemory[RoomMemoryKeys.remoteSources]) {
      communeManager.remoteSourceHarvesters[remoteName].push([])
    }
  }
  static diagonalCoords(roomName: string, commune: Room) {
    const anchor = commune.roomManager.anchor
    if (!anchor) throw Error('no anchor for room: ' + roomName)

    const diagonalCoords = new Uint8Array(2500)
    const terrain = Game.map.getRoomTerrain(roomName)

    for (let x = 0; x < roomDimensions; x++) {
      for (let y = 0; y < roomDimensions; y++) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue

        // Calculate the position of the cell relative to the anchor

        const relX = x - anchor.x
        const relY = y - anchor.y

        // Check if the cell is part of a diagonal line
        if (Math.abs(relX - 3 * relY) % 2 !== 0 && Math.abs(relX + 3 * relY) % 2 !== 0) continue

        const packedCoord = packXYAsNum(x, y)

        if (terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
          diagonalCoords[packedCoord] = 3 * defaultSwampCost
          continue
        }
        diagonalCoords[packedCoord] = 4
      }
    }

    return diagonalCoords
  }
  static pack(roomName: string) {
    // Find the numbers in the room's name

    let [name, cx, x, cy, y] = roomName.match(/^([WE])([0-9]+)([NS])([0-9]+)$/)

    return {
      x: cx === 'W' ? ~x : parseInt(x),
      y: cy === 'S' ? ~y : parseInt(y),
    }
  }

  static unpackXY(x: number, y: number) {
    return (
      (x < 0 ? 'W' + String(~x) : 'E' + String(x)) + (y < 0 ? 'S' + String(~y) : 'N' + String(y))
    )
  }

  static unpack(roomCoord: RoomCoord) {
    return this.unpackXY(roomCoord.x, roomCoord.y)
  }
  /**
   * Finds the distance between two rooms based on walkable exits while avoiding rooms with specified types
   */
  static advancedFindDistance(
    originRoomName: string,
    goalRoomName: string,
    opts: {
      typeWeights?: { [key: string]: number }
      avoidDanger?: boolean
    } = {},
  ) {
    // Try to find a route from the origin room to the goal room

    const findRouteResult = Game.map.findRoute(originRoomName, goalRoomName, {
      routeCallback(roomName) {
        // If the goal is in the room
        if (roomName === goalRoomName) return 1

        const roomMemory = Memory.rooms[roomName]
        if (!roomMemory) return 10

        if (opts.avoidDanger && roomMemory[RoomMemoryKeys.type] === RoomTypes.neutral) {
          if (roomMemory[RoomMemoryKeys.abandonRemote]) {
            return 10
          }
        }

        // If the type is in typeWeights, inform the weight for the type
        if (opts.typeWeights && opts.typeWeights[roomMemory[RoomMemoryKeys.type]])
          return opts.typeWeights[roomMemory[RoomMemoryKeys.type]]

        return 1
      },
    })

    // If findRouteResult didn't work, inform a path length of Infinity

    if (findRouteResult === ERR_NO_PATH) return Infinity

    return findRouteResult.length
  }

  static findClosestRoomName(roomName: string, targetRoomNames: Iterable<string>) {
    let minRange = Infinity
    let closest = undefined

    for (const targetRoomName of targetRoomNames) {
      const range = Game.map.getRoomLinearDistance(roomName, targetRoomName)

      if (range > minRange) continue

      minRange = range
      closest = targetRoomName
    }

    return closest
  }

  /**
   * get the room status for a room that potentially has no initialized memory
   */
  static getStatusForPotentialMemory(roomName: string) {
    const roomMemory = Memory.rooms[roomName]
    if (roomMemory === undefined) {
      const roomMemory = (Memory.rooms[roomName] = {} as RoomMemory)
      RoomOps.basicScout(roomName)

      return roomMemory[RoomMemoryKeys.status]
    }

    // Otherwise there is room memory

    return roomMemory[RoomMemoryKeys.status]
  }
}
