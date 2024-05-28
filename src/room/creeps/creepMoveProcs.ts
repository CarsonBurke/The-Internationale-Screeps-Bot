import { CollectiveManager } from 'international/collective'
import {
  CreepMemoryKeys,
  FlagNames,
  MovedTypes,
  ReservedCoordTypes,
  Result,
  customColors,
  defaultCreepSwampCost,
  defaultPlainCost,
  impassibleStructureTypesSet,
  packedPosLength,
} from '../../constants/general'
import { CustomPathFinderArgs, PathGoal, CustomPathFinder } from 'international/customPathFinder'
import { packCoord, packPos, packPosList, unpackCoord, unpackPos, unpackPosAt } from 'other/codec'
import {
    Utils,
  areCoordsEqual,
  arePositionsEqual,
  findAdjacentCoordsToCoord,
  findObjectWithID,
  forAdjacentCoords,
  getRange,
  getRangeEuc,
  isAlly,
  isExit,
} from 'utils/utils'
import { MyCreepProcs } from './myCreepProcs'
import { RoomOps } from 'room/roomOps'
import { MoveTargets } from 'types/movement'

/**
 * Utilities involving the movement of creeps
 */
export class CreepMoveProcs {
  /**
   * work in progress
   */
  static createMoveRequest(creep: Creep, goals: PathGoal[], args: any, opts: any) {
    // Stop if the we know the creep won't move

    if (creep.moveRequest) return Result.noAction
    if (creep.moved) return Result.noAction
    if (creep.fatigue > 0) return Result.noAction

    if (creep.spawning) {
      const spawn = findObjectWithID(creep.spawnID)
      if (!spawn) return Result.noAction

      // Don't plan the path until we are nearly ready to be spawned
      if (spawn.spawning.remainingTime > 1) return Result.noAction
    }
    if (!creep.getActiveBodyparts(MOVE)) {
      creep.moved = MovedTypes.moved
      return Result.noAction
    }

    // Assign default args

    opts.cacheAmount ??= CollectiveManager.defaultMinPathCacheTime

    if (this.useExistingPath(creep, args, opts) === Result.success) {
      return Result.success
    }

    const path = this.findNewPath(creep, args, opts)
    if (path === Result.fail) return Result.fail

    this.useNewPath(creep, args, opts, path)
    return Result.success
  }

  static useExistingPath(creep: Creep, args: CustomPathFinderArgs, opts: MoveRequestOpts) {
    if (creep.spawning) return Result.noAction

    const creepMemory = Memory.creeps[creep.name] || Memory.powerCreeps[creep.name]

    if (!creepMemory[CreepMemoryKeys.lastCache]) return Result.fail
    if (creepMemory[CreepMemoryKeys.lastCache] + opts.cacheAmount <= Game.time) return Result.fail
    if (creepMemory[CreepMemoryKeys.flee] !== args.flee) return Result.fail

    const packedPath = creepMemory[CreepMemoryKeys.path]
    if (!packedPath || !packedPath.length) return Result.fail

    // Make this more optimal in not redoing paths unecessarily
    if (!areCoordsEqual(unpackPos(creepMemory[CreepMemoryKeys.goalPos]), args.goals[0].pos)) {
      return Result.fail
    }

    const moveTarget = this.findMoveTarget(creep, creepMemory)
    if (moveTarget === Result.fail) return Result.fail

    // If we're on an exit and we want to go to the other side, wait for it to toggle
    if (moveTarget.roomName !== creep.room.name) {
      creep.moved = MovedTypes.moved
      return Result.success
    }

    if (Game.flags[FlagNames.debugMovement]) {
      creep.room.visual.line(creep.pos, moveTarget, { color: customColors.lightBlue })
    }

    // We've determined our existing path is sufficient. Move to the next position on it

    creep.assignMoveRequest(moveTarget)
    return Result.success
  }

  /**
   * Similar to the game's moveByPath
   * We need to also check if the next position is an opposite exit coord
   */
  private static findMoveTarget(
    creep: Creep,
    creepMemory: CreepMemory | PowerCreepMemory,
  ): Result.fail | RoomPosition {
    // First index

    let firstIndex = 0
    let pos = unpackPosAt(creepMemory[CreepMemoryKeys.path], firstIndex)

    if (getRange(creep.pos, pos) === 1) {
      return pos
    }

    // Failed to use first index

    // Cut the path based coords we skiped over
    creepMemory[CreepMemoryKeys.path] = creepMemory[CreepMemoryKeys.path].slice(packedPosLength)
    if (!creepMemory[CreepMemoryKeys.path].length) return Result.fail

    // Second index

    pos = unpackPosAt(creepMemory[CreepMemoryKeys.path], firstIndex)

    if (getRange(creep.pos, pos) === 1) {
      return pos
    }

    // Failed to use second index

    // Cut the path based coords we skiped over
    creepMemory[CreepMemoryKeys.path] = creepMemory[CreepMemoryKeys.path].slice(packedPosLength)
    return Result.fail
  }

  static findNewPath(creep: Creep, args: CustomPathFinderArgs, opts: MoveRequestOpts) {
    // Assign the creep to the args

    args.creep = creep

    // Inform args to avoid impassible structures

    args.avoidImpassibleStructures = true
    args.avoidStationaryPositions = true

    // If there is no safemode
    if (!creep.room.controller || !creep.room.controller.safeMode) args.avoidNotMyCreeps = true

    const creepMemory = Memory.creeps[creep.name] || Memory.powerCreeps[creep.name]
    if (creepMemory[CreepMemoryKeys.preferRoads]) {
      args.plainCost ??= defaultPlainCost * 2
      args.swampCost ??= defaultCreepSwampCost * 2
    }

    // Generate a new path
    const path = CustomPathFinder.findPath(args)
    if (!path.length) return Result.fail

    // Limit the path's length to the cacheAmount
    path.splice(opts.cacheAmount)

    if (Game.flags[FlagNames.debugMovement]) {
      creep.room.visual.text('NP', creep.pos, {
        align: 'center',
        color: customColors.lightBlue,
        opacity: 0.7,
        font: 0.7,
      })
    }

    return path
  }

  static useNewPath(
    creep: Creep,
    args: CustomPathFinderArgs,
    opts: MoveRequestOpts,
    path: RoomPosition[],
  ) {
    // Set the creep's pathOpts to reflect this moveRequest's args
    creep.pathOpts = args

    const creepMemory = Memory.creeps[creep.name] || Memory.powerCreeps[creep.name]

    creepMemory[CreepMemoryKeys.lastCache] = Game.time
    creepMemory[CreepMemoryKeys.flee] = args.flee
    if (opts.reserveCoord !== undefined) {
      creepMemory[CreepMemoryKeys.packedCoord] = packCoord(path[path.length - 1])
    }
    // Assign the goal's pos to the creep's goalPos
    creepMemory[CreepMemoryKeys.goalPos] = packPos(args.goals[0].pos)
    // Set the path in the creep's memory
    creepMemory[CreepMemoryKeys.path] = packPosList(path)

    if (creep.spawning) {
      this.registerSpawnDirections(creep, path)
      return Result.success
    }

    // If we're on an exit and we want to go to the other side, wait for it to toggle
    if (path[0].roomName !== creep.room.name) {
      creep.moved = MovedTypes.moved
      return Result.success
    }
    creep.assignMoveRequest(path[0])
    return Result.success
  }

  private static registerSpawnDirections(creep: Creep, path: RoomPosition[]) {
    if (!creep.spawnID) return

    const spawn = findObjectWithID(creep.spawnID)
    if (!spawn) return

    // Ensure we aren't using the default direction

    if (spawn.spawning.directions) return

    const adjacentCoords: Coord[] = []

    for (let x = spawn.pos.x - 1; x <= spawn.pos.x + 1; x += 1) {
      for (let y = spawn.pos.y - 1; y <= spawn.pos.y + 1; y += 1) {
        if (spawn.pos.x === x && spawn.pos.y === y) continue

        const coord = { x, y }

        /* if (room.coordHasStructureTypes(coord, impassibleStructureTypesSet)) continue */

        // Otherwise ass the x and y to positions

        adjacentCoords.push(coord)
      }
    }

    // Sort by distance from the first pos in the path

    adjacentCoords.sort((a, b) => {
      return getRange(a, path[0]) - getRange(b, path[0])
    })

    const directions: DirectionConstant[] = []

    for (const coord of adjacentCoords) {
      directions.push(spawn.pos.getDirectionTo(coord.x, coord.y))
    }

    spawn.spawning.setDirections(directions)
    return
  }

  static tryRunMoveRequest(creep: Creep | PowerCreep, moveTargets: MoveTargets) {
    // revisit this in the future
    /* if (creep instanceof Creep && creep.spawning) return */

    const moveRequest = creep.moveRequest
    if (!moveRequest) return
    /* const moveRequest = creep.moveRequest
    if (!moveRequest) return

    // If the creep is already registered to move where it wants to
    if (creep.moveTarget === moveRequest) return */

    if (Game.flags[FlagNames.debugMoveRequests]) {
      creep.room.targetVisual(creep.pos, unpackCoord(moveRequest), true)
    }

    // Target coord

    if (moveRequest === creep.moveTarget) return

    if (creep.moveTarget !== undefined) {
      delete moveTargets[creep.moveTarget]
      delete creep.moveTarget
    }

    /* const reservationType = creep.room.roomManager.reservedCoords.get(packCoord(creep.pos))
    if (reservationType === ReservedCoordTypes.spawning) {
        delete creep.moveRequest
        delete creep.actionCoord

      if (CreepMoveProcs.shove(creep, moveTargets, new Set(), -100) < 0) {
        return
      }

      CreepMoveProcs.assignMoveTarget(creep, packCoord(creep.pos), moveTargets)
      return
    } */

    if (CreepMoveProcs.shove(creep, moveTargets, new Set(), 0) < 0) {
      return
    }

    CreepMoveProcs.assignMoveTarget(creep, packCoord(creep.pos), moveTargets)
  }

  /**
   * @returns local cost of the shove
   */
  static shove(
    creep: Creep | PowerCreep,
    moveTargets: MoveTargets,
    visitedCreeps: Set<string>,
    cost: number,
  ): number {
    const moveRequest = creep.moveRequest
    const moveRequestCoord: Coord | undefined = moveRequest ? unpackCoord(moveRequest) : undefined

    const creepMemory = Memory.creeps[creep.name]

    visitedCreeps.add(creep.name)

    const { room } = creep
    const terrain = room.getTerrain()

    // For each adjacent and containing position for the creep

    const moveOptions = CreepMoveProcs.getMoveOptions(creep, moveRequestCoord)
    for (const coord of moveOptions) {
      const packedCoord = packCoord(coord)

      const creepInWayName = moveTargets[packedCoord]

      if (creepInWayName) {
        if (visitedCreeps.has(creepInWayName)) continue

        const creepInWay = Game.creeps[creepInWayName]

        // Make sure it isn't a power creep
        if (creepInWay) {
          // if (creepInWay.fatigue > 0) continue
          //   if (creepAtPos.moved) return
          // maybe want to reconsider this parameter
          //   if (creepAtPos.moveRequest) return
          if (creepInWay.getActiveBodyparts(MOVE) === 0) continue
        }
      }

      if (packedCoord !== creep.moveRequest && isExit(coord)) continue

      const terrainType = terrain.get(coord.x, coord.y)
      if (terrainType === TERRAIN_MASK_WALL) continue

      // Revisit later
      /* const reservationType = creep.room.roomManager.reservedCoords.get(packedCoord)
      // Don't shove onto spawning-reserved coords
      if (reservationType === ReservedCoordTypes.spawning) continue */

      // Use scoring to determine the cost of using the coord compared to potential others

      let potentialCost = cost

      if (moveRequestCoord) {
        if (areCoordsEqual(moveRequestCoord, coord)) {
          potentialCost -= 1
        }
        /* if (creep.actionCoord && areCoordsEqual(coord, creep.actionCoord)) potentialCost -= 1
          else if (
            creepMemory[CreepMemoryKeys.goalPos] &&
            packedCoord === creepMemory[CreepMemoryKeys.goalPos]
          )
          potentialCost -= 1
          else if (creep.moveRequest && packedCoord === creep.moveRequest) potentialCost -= 1 */
        // cost += getRangeEuc(coord, targetCoord) * 3
      }

      /* if (terrainType === TERRAIN_MASK_SWAMP) cost += 1 */

      // Ideally we test this, and if the creep has a net positive cost in regards to successful recursed movement (more creeps moved to where they want than otherwise) then it is accepted (in parent shove function)
      /* if (!isExit(coord) && (room.creepPositions[packedCoord] || room.powerCreepPositions[packedCoord])) cost += 1 */

      // If the coord is reserved, increase cost porportional to importance of the reservation
      // Cost based on value of reservation
      /* if (reservationType !== undefined) cost += 1 */ // reservationType

      // If the coord isn't safe to stand on

      if (room.roomManager.enemyThreatCoords.has(packedCoord)) continue

      if (room.coordHasStructureTypes(coord, impassibleStructureTypesSet)) continue

      // Going to need to revisit this one
      if (
        creepMemory[CreepMemoryKeys.rampartOnlyShoving] &&
        !room.findStructureAtCoord(
          coord,
          structure => structure.structureType === STRUCTURE_RAMPART,
        )
      ) {
        continue
      }

      let hasImpassibleStructure

      for (const cSite of room.lookForAt(LOOK_CONSTRUCTION_SITES, coord.x, coord.y)) {
        // If the construction site is owned by an ally, don't allow its position
        if (!cSite.my && isAlly(cSite.owner.username)) {
          hasImpassibleStructure = true
          break
        }

        if (impassibleStructureTypesSet.has(cSite.structureType)) {
          hasImpassibleStructure = true
          break
        }
      }

      if (hasImpassibleStructure) continue

      if (Game.flags[FlagNames.roomVisuals]) {
        creep.room.visual.text(potentialCost.toString(), coord.x, coord.y)
      }

      const creepInWay = Game.creeps[creepInWayName] || Game.powerCreeps[creepInWayName]
      if (creepInWay) {

        if (creepInWay.moveRequest === packedCoord) {
          potentialCost += 1
        }

        // Cosider increasing cost if the creep wants to stay at its present coord

        const creepInWayCost = CreepMoveProcs.shove(
          creepInWay,
          moveTargets,
          visitedCreeps,
          potentialCost,
        )
        if (creepInWayCost >= 0) {
          continue
        }

        // Consider stopping here

        CreepMoveProcs.assignMoveTarget(creep, packedCoord, moveTargets)
        return creepInWayCost
      }

      // Preference for lower-cost coords
      if (potentialCost < 0) {
        CreepMoveProcs.assignMoveTarget(creep, packedCoord, moveTargets)
      }

      // If we got here, we should probably early return

      return potentialCost
    }

    creep.room.visual.circle(creep.pos, {
      fill: 'transparent',
      stroke: 'purple',
      strokeWidth: 0.15,
      opacity: 0.5,
    })
    return Infinity

    /*     const packedShoveCoord = packCoord(shoveCoord)
    const creepAtPosName =
      room.creepPositions[packedShoveCoord] || room.powerCreepPositions[packedShoveCoord]

    // If there is a creep make sure we aren't overlapping with other shoves

    if (creepAtPosName) {

      const creepAtPos = Game.creeps[creepAtPosName] || Game.powerCreeps[creepAtPosName]

      avoidPackedCoords.add(packCoord(creepAtPos.pos))
      avoidPackedCoords.add(packedShoveCoord)

      if (!CreepMoveProcs.shove(creepAtPos, avoidPackedCoords)) return false
    } */

    // if (targetCoord && areCoordsEqual(creep.pos, targetCoord)) {
    //   return cost
    // }
  }

  static getMoveOptions(creep: Creep | PowerCreep, targetCoord?: Coord) {
    if (creep.moveOptions) {
      return creep.moveOptions
    }

    const moveOptions: Coord[] = [creep.pos]
    creep.moveOptions = moveOptions

    if (creep instanceof Creep && creep.fatigue > 0) {
      return moveOptions
    }

    if (targetCoord) {
      if (areCoordsEqual(targetCoord, creep.pos)) {
        return moveOptions
      }

      moveOptions.unshift(targetCoord)
      creep.moveOptions = moveOptions
      return moveOptions
    }

    // Consider sorting by range to action coord, where closer is more preferred
    moveOptions.push(...findAdjacentCoordsToCoord(creep.pos))
    Utils.shuffleArray(moveOptions)

    creep.moveOptions = moveOptions
    return moveOptions
  }

  static assignMoveTarget(
    creep: Creep | PowerCreep,
    packedCoord: string,
    moveTargets: MoveTargets,
  ) {
    moveTargets[packedCoord] = creep.name
    creep.moveTarget = packedCoord
  }

  static tryRunMoveTarget(creep: Creep | PowerCreep) {
    if (creep instanceof Creep && creep.spawning) return

    const moveTarget = creep.moveTarget
    if (!moveTarget) return

    const moveTargetCoord = unpackCoord(moveTarget)
    if (areCoordsEqual(creep.pos, moveTargetCoord)) {
      return
    }

    creep.move(creep.pos.getDirectionTo(moveTargetCoord.x, moveTargetCoord.y))
  }
}
