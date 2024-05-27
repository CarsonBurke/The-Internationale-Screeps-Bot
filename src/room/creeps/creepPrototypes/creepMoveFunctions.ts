import {
  impassibleStructureTypesSet,
  customColors,
  TrafficPriorities,
  packedPosLength,
  CreepMemoryKeys,
  Result,
  communeCreepRoles,
  ReservedCoordTypes,
  MovedTypes,
  FlagNames,
} from '../../../constants/general'
import { CollectiveManager } from 'international/collective'
import {
  areCoordsEqual,
  arePositionsEqual,
  findObjectWithID,
  getRangeEuc,
  getRange,
  isExit,
  forAdjacentCoords,
  isAlly,
} from 'utils/utils'
import {
  packCoord,
  packPos,
  unpackCoordAsPos,
  unpackPos,
  unpackPosAt,
  unpackPosList,
} from 'other/codec'
import { CreepMoveProcs } from '../creepMoveProcs'

PowerCreep.prototype.createMoveRequestByPath = Creep.prototype.createMoveRequestByPath = function (
  args,
  pathOpts,
) {
  // Stop if the we know the creep won't move

  if (this.moveRequest) return Result.noAction
  if (this.moved) return Result.noAction
  if (this.fatigue > 0) return Result.noAction
  if (this instanceof Creep) {
    if (this.spawning) {
      const spawn = findObjectWithID(this.spawnID)
      if (!spawn) return Result.noAction

      // Don't plan the path until we are nearly ready to be spawned
      if (spawn.spawning.remainingTime > 1) return Result.noAction
    }
    if (!this.getActiveBodyparts(MOVE)) {
      this.moved = MovedTypes.moved
      return Result.noAction
    }
  }
  if (this.room.roomManager.enemyDamageThreat) return this.createMoveRequest(args)

  // const posIndex = pathOpts.packedPath.indexOf(packPos(this.pos))

  let posIndex = -1

  for (let i = 0; i < pathOpts.packedPath.length - packedPosLength + 1; i += packedPosLength) {
    const pos = unpackPosAt(pathOpts.packedPath, i / packedPosLength)
    if (!arePositionsEqual(this.pos, pos)) continue

    posIndex = i
    break
  }

  //

  const packedGoalPos = packPos(args.goals[0].pos)
  const isOnLastPos = posIndex + packedPosLength === pathOpts.packedPath.length

  if (
    !isOnLastPos &&
    posIndex !== -1 &&
    this.memory[CreepMemoryKeys.usedPathForGoal] !== packedGoalPos
  ) {
    const packedPath = pathOpts.packedPath.slice(posIndex + packedPosLength)
    const pos = unpackPosAt(packedPath, 0)

    // If we're on an exit and the next pos is in the other room, wait

    if (pos.roomName !== this.room.name) {
      this.memory[CreepMemoryKeys.path] = packedPath
      this.moved = MovedTypes.moved
      return Result.success
    }

    // Give the creep a sliced version of the path it is trying to use

    this.memory[CreepMemoryKeys.path] = packedPath
    this.assignMoveRequest(pos)
    return Result.success
  }

  if (isOnLastPos || this.memory[CreepMemoryKeys.usedPathForGoal]) {
    this.memory[CreepMemoryKeys.usedPathForGoal] = packPos(args.goals[0].pos)
    return this.createMoveRequest(args)
  }

  // If loose is enabled, don't try to get back on the cached path
  /*
    this.room.visual.text((pathOpts.loose || false).toString(), this.pos.x, this.pos.y + 0.5, { font: 0.4 })
 */
  if (pathOpts.loose) return this.createMoveRequest(args)

  this.room.errorVisual(this.pos)

  // Try to get on the path

  args.goals = []

  for (const pos of unpackPosList(pathOpts.packedPath)) {
    args.goals.push({
      pos,
      range: 0,
    })
  }

  return this.createMoveRequest(args)
}

PowerCreep.prototype.createMoveRequest = Creep.prototype.createMoveRequest = function (
  args,
  opts = {},
) {
  // Stop if the we know the creep won't move

  if (this.moveRequest) return Result.noAction
  if (this.moved) return Result.noAction
  if (this.fatigue > 0) return Result.noAction
  if (args.goals.find(goal => arePositionsEqual(this.pos, goal.pos))) return Result.noAction
  if (this instanceof Creep) {
    if (this.spawning) {
      const spawn = findObjectWithID(this.spawnID)
      if (!spawn) return Result.noAction

      // Don't plan the path until we are nearly ready to be spawned
      if (spawn.spawning.remainingTime > 1) return Result.noAction
    }
    if (!this.getActiveBodyparts(MOVE)) {
      this.moved = MovedTypes.moved
      return Result.noAction
    }
  }

  // Assign default args

  args.origin ??= this.pos
  opts.cacheAmount ??= CollectiveManager.defaultMinPathCacheTime

  if (CreepMoveProcs.useExistingPath(this, args, opts) === Result.success) {
    return Result.success
  }

  const path = CreepMoveProcs.findNewPath(this, args, opts)
  if (path === Result.fail) return Result.fail

  CreepMoveProcs.useNewPath(this, args, opts, path)
  return Result.success
}

PowerCreep.prototype.assignMoveRequest = Creep.prototype.assignMoveRequest = function (coord) {
  const { room } = this
  const packedCoord = packCoord(coord)

  this.moveRequest = packedCoord

  room.moveRequests[packedCoord]
    ? room.moveRequests[packedCoord].push(this.name)
    : (room.moveRequests[packedCoord] = [this.name])
}

PowerCreep.prototype.avoidEnemyThreatCoords = Creep.prototype.avoidEnemyThreatCoords = function () {
  if (!this.room.roomManager.enemyThreatCoords.has(packCoord(this.pos))) return false

  this.createMoveRequest({
    origin: this.pos,
    goals: this.room.roomManager.enemyThreatGoals,
    flee: true,
  })

  return true
}
