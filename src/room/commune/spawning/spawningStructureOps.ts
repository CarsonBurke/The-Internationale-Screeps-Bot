import { CollectiveManager } from 'international/collective'
import {
  CreepMemoryKeys,
  ReservedCoordTypes,
  Result,
  partsByPriority,
  partsByPriorityPartType,
  RoomLogisticsRequestTypes,
  creepRoles,
  customColors,
  MovedTypes,
  FlagNames,
} from '../../../constants/general'
import { RoomStatsKeys } from '../../../constants/stats'
import { StatsManager } from 'international/stats'
import { unpackPosAt, packCoord, unpackCoord } from 'other/codec'
import { CreepOps } from 'room/creeps/creepOps'
import { StructureUtils } from 'room/structureUtils'
import { SpawnRequest, BodyPartCounts, SpawnRequestTypes } from 'types/spawnRequest'
import { LogOps, LogTypes } from 'utils/logOps'
import { getRange, findAdjacentCoordsToCoord, Utils } from 'utils/utils'
import { SpawnRequestConstructor, SpawnRequestConstructors } from './spawnRequestConstructors'
import { CommuneUtils } from '../communeUtils'
import { DebugUtils } from 'debug/debugUtils'
import { CreepMoveProcs } from 'room/creeps/creepMoveProcs'

export class SpawningStructureOps {
  public static tryRunSpawning(room: Room) {
    const spawns = room.roomManager.structures.spawn
    if (!spawns.length) return

    this.test(room)

    // There are no spawns that we can spawn with (they are probably spawning something)
    const organizedSpawns = CommuneUtils.getOrganizedSpawns(room, spawns)
    if (!organizedSpawns) return

    this.registerSpawningCreeps(room, organizedSpawns.activeSpawns)

    // If all spawns are occupied, there is nothing for us to do
    if (!organizedSpawns.inactiveSpawns.length) {
      return
    }

    this.runSpawning(room, organizedSpawns.inactiveSpawns)
  }

  private static runSpawning(room: Room, inactiveSpawns: StructureSpawn[]) {
    const spawnRequestsArgs = room.communeManager.spawnRequestsManager.run()

    for (const requestArgs of spawnRequestsArgs) {
      const spawnRequests = SpawnRequestConstructorsByType[requestArgs.type](room, requestArgs)

      // Loop through priorities inside requestsByPriority

      for (const spawnRequest of spawnRequests) {
        if (this.runSpawnRequest(room, inactiveSpawns, spawnRequest) !== Result.success) return
      }
    }
  }

  private static registerSpawningCreeps(room: Room, activeSpawns: StructureSpawn[]) {
    for (const spawn of activeSpawns) {
      const creep = Game.creeps[spawn.spawning.name]
      CreepOps.registerSpawning(creep, spawn)
      creep.spawnID = spawn.id

      if (
        spawn.spawning.remainingTime <= 2 &&
        creep.memory[CreepMemoryKeys.path] &&
        creep.memory[CreepMemoryKeys.path].length
      ) {
        const coord = unpackPosAt(creep.memory[CreepMemoryKeys.path])
        room.roomManager.reservedCoords.set(packCoord(coord), ReservedCoordTypes.spawning)
        creep.assignMoveRequest(coord)
      }
    }
  }

  private static runSpawnRequest(
    room: Room,
    inactiveSpawns: StructureSpawn[],
    request: SpawnRequest,
  ): Result {
    // We're trying to build a creep larger than this room can spawn
    // If this is ran then there is a bug in spawnRequest creation

    if (request.cost > room.energyCapacityAvailable) {
      LogOps.log(
        'Failed to spawn: not enough energy',
        `cost greater then energyCapacityAvailable, role: ${request.role}, cost: ${
          room.energyCapacityAvailable
        } / ${request.cost}, body: ${JSON.stringify(request.bodyPartCounts)}`,
        {
          type: LogTypes.warning,
        },
      )

      return Result.fail
    }

    if (request.cost > room.communeManager.nextSpawnEnergyAvailable) {
      LogOps.log(
        'Failed to spawn: not enough energy',
        `cost greater then nextSpawnEnergyAvailable, role: ${request.role}, cost: ${
          request.cost
        } / ${room.communeManager.nextSpawnEnergyAvailable}, body: ${JSON.stringify(
          request.bodyPartCounts,
        )}`,
        {
          type: LogTypes.warning,
        },
      )
      return Result.fail
    }

    const body = this.constructBodyFromSpawnRequest(request.role, request.bodyPartCounts)

    // Try to find inactive spawn, if can't, stop the loop

    const spawnIndex = this.findSpawnIndexForSpawnRequest(inactiveSpawns, request)
    const spawn = inactiveSpawns[spawnIndex]
    const ID = CollectiveManager.newCustomCreepID()

    // See if creep can be spawned

    const testSpawnResult = this.testSpawn(spawn, body, ID)

    // If creep can't be spawned

    if (testSpawnResult !== OK) {
      if (testSpawnResult === ERR_NOT_ENOUGH_ENERGY) {
        LogOps.log(
          'Failed to spawn: dryrun failed',
          `request: ${testSpawnResult}, role: ${request.role}, ID: ${ID}, cost: ${request.cost} / ${room.communeManager.nextSpawnEnergyAvailable}, body: (${body.length}) ${body}`,
          {
            type: LogTypes.error,
          },
        )
        return Result.fail
      }

      LogOps.log(
        'Failed to spawn: dryrun failed',
        `request: ${testSpawnResult}, role: ${request.role}, ID: ${ID}, cost: ${request.cost} / ${room.communeManager.nextSpawnEnergyAvailable}, body: (${body.length}) ${body}`,
        {
          type: LogTypes.error,
        },
      )

      return Result.fail
    }

    // Spawn the creep for real

    request.extraOpts.directions = this.findDirections(room, spawn.pos)
    const result = this.advancedSpawn(room, spawn, request, body, ID)
    if (result !== OK) {
      LogOps.log(
        'Failed to spawn: spawning failed',
        `error: ${result}, request: ${DebugUtils.stringify(request)}`,
        {
          type: LogTypes.error,
          position: 3,
        },
      )

      return Result.fail
    }

    // Otherwise we succeeded
    // Record in stats the costs

    room.communeManager.nextSpawnEnergyAvailable -= request.cost
    StatsManager.updateStat(room.name, RoomStatsKeys.EnergyOutputSpawn, request.cost)

    // The spawn we intented to spawn should no longer be considered inactive
    inactiveSpawns.splice(spawnIndex, 1)

    // We probably used up the last remaining inactive spawn, so don't try again this tick
    if (!inactiveSpawns.length) return Result.stop

    return Result.success
  }

  private static findSpawnIndexForSpawnRequest(
    inactiveSpawns: StructureSpawn[],
    request: SpawnRequest,
  ) {
    if (request.spawnTarget) {
      const [score, index] = Utils.findIndexWithLowestScore(inactiveSpawns, spawn => {
        return getRange(spawn.pos, request.spawnTarget)
      })

      return index
    }

    return 0
  }

  private static constructBodyFromSpawnRequest(role: CreepRoles, bodyPartCounts: BodyPartCounts) {
    let body: BodyPartConstant[] = []

    if (role === 'hauler') {
      const ratio = (bodyPartCounts[CARRY] + bodyPartCounts[WORK]) / bodyPartCounts[MOVE]

      for (let i = -1; i < bodyPartCounts[CARRY] - 1; i++) {
        body.push(CARRY)
        if (i % ratio === 0) body.push(MOVE)
      }

      for (let i = -1; i < bodyPartCounts[WORK] - 1; i++) {
        body.push(WORK)
        if (i % ratio === 0) body.push(MOVE)
      }

      return body
    }

    const endParts: BodyPartConstant[] = []

    for (const partIndex in partsByPriority) {
      const partType = partsByPriority[partIndex]
      const part = partsByPriorityPartType[partType]

      if (!bodyPartCounts[part]) continue

      let skipEndPart: boolean

      let priorityPartsCount: number
      if (partType === RANGED_ATTACK) {
        priorityPartsCount = bodyPartCounts[part]
        skipEndPart = true
      } else if (partType === ATTACK || partType === TOUGH) {
        priorityPartsCount = Math.ceil(bodyPartCounts[part] / 2)
        skipEndPart = true
      } else if (partType === 'secondaryTough' || partType === 'secondaryAttack') {
        priorityPartsCount = Math.floor(bodyPartCounts[part] / 2)
        skipEndPart = true
      } else priorityPartsCount = bodyPartCounts[part] - 1

      for (let i = 0; i < priorityPartsCount; i++) {
        body.push(part)
      }

      if (skipEndPart) continue

      // Ensure each part besides tough has a place at the end to reduce CPU when creeps perform actions
      endParts.push(part)
    }

    body = body.concat(endParts)
    return body
  }

  private static findDirections(room: Room, pos: RoomPosition) {
    const anchor = room.roomManager.anchor
    if (!anchor) throw Error('No anchor for spawning structures ' + room.name)

    const adjacentCoords = findAdjacentCoordsToCoord(pos)

    // Sort by distance from the first pos in the path

    adjacentCoords.sort((a, b) => {
      return getRange(a, anchor) - getRange(b, anchor)
    })
    adjacentCoords.reverse()

    const directions: DirectionConstant[] = []

    for (const coord of adjacentCoords) {
      directions.push(pos.getDirectionTo(coord.x, coord.y))
    }

    return directions
  }

  private static testSpawn(spawn: StructureSpawn, body: BodyPartConstant[], requestID: number) {
    return spawn.spawnCreep(body, requestID.toString(), { dryRun: true })
  }

  private static advancedSpawn(
    room: Room,
    spawn: StructureSpawn,
    spawnRequest: SpawnRequest,
    body: BodyPartConstant[],
    requestID: number,
  ) {
    const creepName = `${creepRoles.indexOf(spawnRequest.role)}_${requestID}`

    spawnRequest.extraOpts.energyStructures = room.communeManager.spawningStructuresByPriority

    spawnRequest.extraOpts.memory[CreepMemoryKeys.commune] = room.name
    spawnRequest.extraOpts.memory[CreepMemoryKeys.defaultParts] = spawnRequest.defaultParts
    spawnRequest.extraOpts.memory[CreepMemoryKeys.cost] = spawnRequest.cost

    const spawnResult = spawn.spawnCreep(body, creepName, spawnRequest.extraOpts)
    return spawnResult
  }

  static createPowerTasks(room: Room) {
    if (!room.myPowerCreeps.length) return

    // There is a vivid benefit to powering spawns

    const organizedSpawns = CommuneUtils.getOrganizedSpawns(room)
    // We need spawns if we want to power them
    if (!organizedSpawns) return
    // Make sure there are no inactive spawns
    if (organizedSpawns.inactiveSpawns.length) return

    for (const spawn of organizedSpawns.activeSpawns) {
      room.createPowerRequest(spawn, PWR_OPERATE_SPAWN, 2)
    }
  }

  static createRoomLogisticsRequests(room: Room) {
    // If all spawning structures are 100% filled, no need to go further
    if (room.energyAvailable === room.energyCapacityAvailable) return

    for (const structure of room.communeManager.spawningStructuresByNeed) {
      room.createRoomLogisticsRequest({
        target: structure,
        type: RoomLogisticsRequestTypes.transfer,
        priority: 3,
      })
    }
  }

  /**
   * Spawn request debugging
   */
  private static test(room: Room) {
    /*
  const args = room.communeManager.spawnRequestsManager.run()
  stringifyLog('spawn request args', args)
  stringifyLog('request', SpawnRequestConstructorsByType[requestArgs.type](room, args[0]))
*/
    return

    this.testArgs(room)
    this.testRequests()
  }

  private static testArgs(room: Room) {
    const spawnRequestsArgs = room.communeManager.spawnRequestsManager.run()

    for (const request of spawnRequestsArgs) {
      if (request.role === 'remoteSourceHarvester') {
        LogOps.log(
          'SPAWN REQUEST ARGS',
          request.role + request.memoryAdditions[CreepMemoryKeys.remote] + ', ' + request.priority,
        )
        continue
      }
      LogOps.log('SPAWN REQUEST ARGS', request.role + ', ' + request.priority)
    }
  }

  private static testRequests() {}

  static tryRegisterSpawningMovement(room: Room) {
    const organizedSpawns = CommuneUtils.getOrganizedSpawns(room)
    if (!organizedSpawns) return

    // For every spawn spawning a creep, register their movement intentions

    for (const spawn of organizedSpawns.activeSpawns) {
      const creep = Game.creeps[spawn.spawning.name]

      if (!creep.moveRequest) continue
      if (!room.moveRequests[creep.moveRequest]) {
        creep.moved = MovedTypes.moved
        continue
      }

      room.roomManager.recurseMoveRequestOrder += 1

      const creepNameAtPos =
        room.creepPositions[creep.moveRequest] || room.powerCreepPositions[creep.moveRequest]
      if (!creepNameAtPos) {
        creep.moved = creep.moveRequest
        delete room.moveRequests[creep.moveRequest]

        if (Game.flags[FlagNames.roomVisuals]) {
          const moved = unpackCoord(creep.moved)

          room.visual.rect(moved.x - 0.5, moved.y - 0.5, 1, 1, {
            fill: customColors.black,
            opacity: 0.7,
          })
        }
        continue
      }

      // There is a creep at the position
      // just get us space to move into

      const creepAtPos = Game.creeps[creepNameAtPos] || Game.powerCreeps[creepNameAtPos]
      const packedCoord = packCoord(creep.pos)

      if (Game.flags[FlagNames.roomVisuals]) {
        const moved = unpackCoord(creep.moveRequest)

        room.visual.rect(moved.x - 0.5, moved.y - 0.5, 1, 1, {
          fill: customColors.pink,
          opacity: 0.7,
        })
      }

      /* if (CreepMoveProcs.shove(creepAtPos, new Set([packedCoord]))) {
        creep.room.errorVisual(unpackCoord(creep.moveRequest))

        creep.moved = creep.moveRequest
        delete room.moveRequests[creep.moved]
        delete creep.moveRequest
      } */

      continue
    }
  }
}

export interface OrganizedSpawns {
  activeSpawns: StructureSpawn[]
  inactiveSpawns: StructureSpawn[]
}

export const SpawnRequestConstructorsByType: {
  [key in SpawnRequestTypes]: SpawnRequestConstructor
} = {
  [SpawnRequestTypes.individualUniform]: SpawnRequestConstructors.spawnRequestIndividualUniform,
  [SpawnRequestTypes.groupDiverse]: SpawnRequestConstructors.spawnRequestGroupDiverse,
  [SpawnRequestTypes.groupUniform]: SpawnRequestConstructors.spawnRequestGroupUniform,
}
