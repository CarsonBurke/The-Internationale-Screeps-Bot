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
  areCoordsEqual,
  arePositionsEqual,
  findObjectWithID,
  forAdjacentCoords,
  getRange,
  getRangeEuc,
  isAlly,
  isExit,
} from 'utils/utils'
import { MyCreepProcs } from './myCreepProcs'
import { RoomOps } from 'room/roomOps'

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

  static tryRunMoveRequest(creep: Creep | PowerCreep) {
    if (creep instanceof Creep && creep.spawning) return
    if (!creep.moveRequest) return

    if (Game.flags[FlagNames.debugMoveRequests]) {
      creep.room.targetVisual(creep.pos, unpackCoord(creep.moveRequest), true)
    }

    CreepMoveProcs.shove(creep)
  }

  static shove(creep: Creep | PowerCreep, avoidPackedCoords: Set<string> = new Set()): -1 | 1 {
    const { room } = creep

    let targetCoord = creep.moveRequest ? unpackCoord(creep.moveRequest) : creep.actionCoord
    if (!targetCoord && creep.memory[CreepMemoryKeys.goalPos]) {
      targetCoord = unpackPos(creep.memory[CreepMemoryKeys.goalPos])
    }

    avoidPackedCoords.add(packCoord(creep.pos))

    const shoveCoord = CreepMoveProcs.findShoveCoord(creep, avoidPackedCoords, targetCoord)
    if (!shoveCoord) return false

    const packedShoveCoord = packCoord(shoveCoord)
    const creepAtPosName =
      room.creepPositions[packedShoveCoord] || room.powerCreepPositions[packedShoveCoord]

    // If there is a creep make sure we aren't overlapping with other shoves

    if (creepAtPosName) {

      const creepAtPos = Game.creeps[creepAtPosName] || Game.powerCreeps[creepAtPosName]

      avoidPackedCoords.add(packCoord(creepAtPos.pos))
      avoidPackedCoords.add(packedShoveCoord)

      if (!CreepMoveProcs.shove(creepAtPos, avoidPackedCoords)) return false
    }

    creep.moveTarget = shoveCoord
    return true
  }

  static findShoveCoord(
    creep: Creep | PowerCreep,
    avoidPackedCoords?: Set<string>,
    targetCoord?: Coord,
  ) {
    const { room } = creep
    const creepMemory = Memory.creeps[creep.name]
    const terrain = room.getTerrain()

    let shoveCoord: Coord
    let lowestScore = Infinity

    forAdjacentCoords(creep.pos, coord => {
      const packedCoord = packCoord(coord)

      const creepAtPosName = room.creepPositions[packedCoord]
      if (creepAtPosName) {
        const creepAtPos = Game.creeps[creepAtPosName]
        if (creepAtPos.fatigue > 0) return
        //   if (creepAtPos.moved) return
        // maybe want to reconsider this parameter
        //   if (creepAtPos.moveRequest) return
        if (creepAtPos.getActiveBodyparts(MOVE) === 0) return
      }

      if (avoidPackedCoords.has(packedCoord)) return

      if (packedCoord !== creep.moveRequest && isExit(coord)) return

      const terrainType = terrain.get(coord.x, coord.y)
      if (terrainType === TERRAIN_MASK_WALL) return

      // Use scoring to determine the cost of using the coord compared to potential others

      let score = 0
      if (targetCoord) {
        if (creep.actionCoord && areCoordsEqual(coord, creep.actionCoord)) score -= 100
        else if (creepMemory[CreepMemoryKeys.goalPos] && packedCoord === creepMemory[CreepMemoryKeys.goalPos]) score -= 100
        else if (creep.moveRequest && packedCoord === creep.moveRequest) score -= 1
        // score += getRangeEuc(coord, targetCoord) * 3
      }

      // if (terrainType === TERRAIN_MASK_SWAMP) score += 1

      // Ideally we test this, and if the creep has a net positive score in regards to successful recursed movement (more creeps moved to where they want than otherwise) then it is accepted (in parent shove function)
      if (!isExit(coord) && (room.creepPositions[packedCoord] || room.powerCreepPositions[packedCoord])) score += 1

      // If the coord is reserved, increase score porportional to importance of the reservation
      const reservationType = creep.room.roomManager.reservedCoords.get(packedCoord)
      // Don't shove onto spawning-reserved coords
      if (reservationType === ReservedCoordTypes.spawning) return
      // Score based on value of reservation
      if (reservationType !== undefined) score += 1 // reservationType

      if (Game.flags[FlagNames.roomVisuals]) {
        creep.room.visual.text(score.toString(), coord.x, coord.y)
      }

      // Preference for lower-scoring coords
      if (score >= lowestScore) return

      // If the coord isn't safe to stand on

      if (room.roomManager.enemyThreatCoords.has(packedCoord)) return

      if (room.coordHasStructureTypes(coord, impassibleStructureTypesSet)) return

      if (
        creep.memory[CreepMemoryKeys.rampartOnlyShoving] &&
        !room.findStructureAtCoord(
          coord,
          structure => structure.structureType === STRUCTURE_RAMPART,
        )
      ) {
        return
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

      if (hasImpassibleStructure) return

      lowestScore = score
      shoveCoord = coord
    })

    return shoveCoord
  }

  static tryRunMoveTarget(creep: Creep | PowerCreep) {
    if (creep instanceof Creep && creep.spawning) return

    const moveTarget = creep.moveTarget
    if (!moveTarget) return

    creep.move(
      creep.pos.getDirectionTo(new RoomPosition(moveTarget.x, moveTarget.y, creep.room.name)),
    )
  }
}
