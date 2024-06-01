import {
  CreepMemoryKeys,
  packedPosLength,
  RoomMemoryKeys,
  RoomTypes,
  Result,
  SleepFor,
  RoomLogisticsRequestTypes,
  MovedTypes,
  customColors,
  FlagNames,
  relayOffsets,
} from '../../../constants/general'
import { RoomStatsKeys } from '../../../constants/stats'
import { StatsManager } from 'international/stats'
import { unpackPosAt, reversePosList, packCoord, unpackCoord } from 'other/codec'
import { CreepOps } from 'room/creeps/creepOps'
import { MyCreepUtils } from 'room/creeps/myCreepUtils'
import { Hauler } from 'room/creeps/roleManagers/commune/hauler'
import { StructureUtils } from 'room/structureUtils'
import { getRangeXY, Utils, randomIntRange, findObjectWithID, getRange } from 'utils/utils'

export class HaulerOps {
  static deadRun(creepName: string) {}

  static runSpawning(creep: Creep) {}

  static updateRun(creep: Creep) {}

  static initRun(creep: Creep) {
    if (Utils.isTickInterval(10) && creep.getActiveBodyparts(CARRY) === 0) {
      creep.suicide()
      return
    }

    const creepMemory = Memory.creeps[creep.name]
    if (
      creepMemory[CreepMemoryKeys.previousRelayer] &&
      Game.time > creepMemory[CreepMemoryKeys.previousRelayer][1] + 1
    ) {
      creepMemory[CreepMemoryKeys.previousRelayer] = undefined
    }

    const carryParts = MyCreepUtils.parts(creep).carry
    creep.commune.communeManager.haulerCarryParts += carryParts

    if (this.hasValidRemote(creep)) {
      this.applyRemote(creep)
      return
    }

    // We don't have a valid remote
    this.removeRemote(creep)

    const commune = creep.commune
    if (creepMemory[CreepMemoryKeys.taskRoom] === commune.name) {
      commune.communeManager.communeHaulerCarryParts += carryParts
      commune.communeManager.communeHaulers.push(creep.name)
    }
  }

  static runCreep(creep: Creep) {
    if (this.runRestrictedCommuneLogistics(creep) === true) {
      return
    }

    if (!this.findRemote(creep)) {
      if (this.travelToCommune(creep) !== Result.success) return
      this.runCommuneLogistics(creep)
      return
    }

    const creepMemory = Memory.creeps[creep.name]

    if (
      creepMemory[CreepMemoryKeys.sleepFor] === SleepFor.any &&
      creepMemory[CreepMemoryKeys.sleepTime] > Game.time
    ) {
      creep.message = '😴'
      return
    }

    if (creep.needsResources() /*  && creep.ticksToLive > returnTripTime */) {
      this.getResources(creep)
      return
    }

    // Otherwise if the creep doesn't need resources

    if (this.deliverResources(creep)) {
      this.relay(creep)
    }
  }

  private static passiveRenew(creep: Creep) {
    const { room } = creep

    // If there is insufficient CPU to renew, inform false

    if (creep.body.length > 10) return
    if (!room.myCreepsByRole.fastFiller.length) return
    // only renew if we are the same as the desired hauler cost
    const creepCost = Memory.creeps[creep.name][CreepMemoryKeys.cost]
    if (creepCost !== Memory.rooms[room.name][RoomMemoryKeys.minHaulerCost]) return

    // If the creep's age is less than the benefit from renewing, inform false

    const energyCost = Math.ceil(creepCost / 2.5 / creep.body.length)
    if (CREEP_LIFE_TIME - creep.ticksToLive < Math.floor(600 / creep.body.length)) return

    // Get the room's spawns, stopping if there are none

    const spawns = room.roomManager.structures.spawn

    // Get a spawn in range of 1, informing false if there are none

    const spawn = spawns.find(
      spawn =>
        getRangeXY(creep.pos.x, spawn.pos.x, creep.pos.y, spawn.pos.y) === 1 &&
        !spawn.renewed &&
        !spawn.spawning &&
        StructureUtils.isRCLActionable(spawn),
    )
    if (!spawn) return

    const result = spawn.renewCreep(creep)
    if (result === OK) {
      StatsManager.updateStat(creep.room.name, RoomStatsKeys.EnergyOutputSpawn, energyCost)
      spawn.renewed = true
    }
  }

  private static hasValidRemote(creep: Creep) {
    const remoteName = Memory.creeps[creep.name][CreepMemoryKeys.remote]
    if (!remoteName) return false

    const remoteMemory = Memory.rooms[remoteName]

    if (remoteMemory[RoomMemoryKeys.disable]) return false
    if (remoteMemory[RoomMemoryKeys.abandonRemote]) return false
    if (remoteMemory[RoomMemoryKeys.enemyReserved]) return false
    if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.neutral) return false
    if (remoteMemory[RoomMemoryKeys.commune] !== creep.commune.name) return false

    return true
  }

  /**
   * Finds a remote to harvest in
   */
  private static findRemote(creep: Creep) {
    if (this.hasValidRemote(creep)) return true

    for (const remoteInfo of creep.commune.roomManager.remoteSourceIndexesByEfficacy) {
      const splitRemoteInfo = remoteInfo.split(' ')
      const remoteName = splitRemoteInfo[0]
      const remoteMemory = Memory.rooms[remoteName]

      if (remoteMemory[RoomMemoryKeys.disable]) continue
      if (remoteMemory[RoomMemoryKeys.abandonRemote]) continue
      if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.neutral) continue
      if (remoteMemory[RoomMemoryKeys.commune] !== creep.commune.name) continue

      const sourceIndex = parseInt(splitRemoteInfo[1])
      if (!this.isRemoteValid(creep, remoteName, sourceIndex)) continue

      this.assignRemote(creep, remoteName, sourceIndex)
      return true
    }

    return false
  }

  private static isRemoteValid(creep: Creep, remoteName: string, sourceIndex: number) {
    const remoteMemory = Memory.rooms[remoteName]

    // Ensure the creep and the remote have the same opinions on roads
    if (
      !!remoteMemory[RoomMemoryKeys.roads][sourceIndex] !=
      !!Memory.creeps[creep.name][CreepMemoryKeys.preferRoads]
    )
      return false

    const commune = creep.commune

    // Make sure we have enough life to get there
    /*
        const pathLength =
            remoteMemory[commune.communeManager.remoteResourcePathType][sourceIndex].length /
            packedPosLength
        if (pathLength >= creep.ticksToLive) return false
 */
    // Make sure we have enough free space to keep reservation below credit
    if (
      remoteMemory[RoomMemoryKeys.remoteSourceCredit][sourceIndex] -
        remoteMemory[RoomMemoryKeys.remoteSourceCreditReservation][sourceIndex] <
      creep.freeNextStore
    ) {
      return false
    }

    // If we do roads but the remote doesn't - change to be a low-priority search later
    if (Memory.creeps[creep.name][CreepMemoryKeys.preferRoads]) {
      const roadsQuota =
        remoteMemory[commune.communeManager.remoteResourcePathType][sourceIndex].length /
        packedPosLength

      // See if there are roads close enough or more than the quota
      if (remoteMemory[RoomMemoryKeys.roads][sourceIndex] < roadsQuota * 0.9) return false
    }

    return true
  }

  private static isCurrentRemoteValid(creep: Creep) {
    const creepMemory = Memory.creeps[creep.name]
    return this.isRemoteValid(
      creep,
      creepMemory[CreepMemoryKeys.remote],
      creepMemory[CreepMemoryKeys.sourceIndex],
    )
  }

  private static assignRemote(creep: Creep, remoteName: string, sourceIndex: number) {
    const creepMemory = Memory.creeps[creep.name]

    creepMemory[CreepMemoryKeys.remote] = remoteName
    creepMemory[CreepMemoryKeys.sourceIndex] = sourceIndex
    creepMemory[CreepMemoryKeys.taskRoom] = undefined
    creepMemory[CreepMemoryKeys.roomLogisticsRequests] = []

    this.applyRemote(creep)
  }

  private static applyRemote(creep: Creep) {
    if (creep.isDying()) return
    if (!creep.needsResources()) return

    const creepMemory = Memory.creeps[creep.name]

    Memory.rooms[creepMemory[CreepMemoryKeys.remote]][RoomMemoryKeys.remoteSourceCreditReservation][
      creepMemory[CreepMemoryKeys.sourceIndex]
    ] += creep.dataChange = creep.freeNextStore
  }

  private static removeRemote(creep: Creep) {
    const creepMemory = Memory.creeps[creep.name]

    if (!creep.isDying) {
      Memory.rooms[creepMemory[CreepMemoryKeys.remote]][
        RoomMemoryKeys.remoteSourceCreditReservation
      ][creepMemory[CreepMemoryKeys.sourceIndex]] -= creep.dataChange
    }

    delete creepMemory[CreepMemoryKeys.remote]
    delete creepMemory[CreepMemoryKeys.sourceIndex]
  }

  private static getResources(creep: Creep) {
    const creepMemory = Memory.creeps[creep.name]

    // Try to find a remote

    if (!this.findRemote(creep)) {
      creep.message = '❌ Remote'

      if (creep.room.name !== creep.commune.name) {
        const anchor = creep.commune.roomManager.anchor
        if (!anchor) throw Error('no anchor for hauler')

        if (
          creep.createMoveRequest({
            origin: creep.pos,
            goals: [
              {
                pos: anchor,
                range: 25,
              },
            ],
          }) === Result.fail
        ) {
          creepMemory[CreepMemoryKeys.sleepFor] = SleepFor.any
          creepMemory[CreepMemoryKeys.sleepTime] = Game.time + randomIntRange(10, 50)
        }
      }

      // If the room is the creep's commune
      /*
            if (creep.room.name === creep.commune.name) {
                // Advanced recycle and iterate

                creep.advancedRecycle()
                return false
            }

            // Otherwise, have the creep make a moveRequest to its commune and iterate

            creep.createMoveRequest({
                origin: creep.pos,
                goals: [
                    {
                        pos: creep.commune.anchor,
                        range: 25,
                    },
                ],
            })
 */
      return false
    }

    // If the creep is in the remote

    if (creep.room.name === creep.memory[CreepMemoryKeys.remote]) {
      if (!this.getRemoteSourceResources(creep)) return false

      // We have enough resources, return home

      delete creep.moved

      creep.message += creep.commune.name

      const anchor = creep.commune.roomManager.anchor
      if (!anchor) throw Error('No anchor for hauler ' + creep.room.name)

      creep.createMoveRequestByPath(
        {
          origin: creep.pos,
          goals: [
            {
              pos: anchor,
              range: 3,
            },
          ],
          avoidEnemyRanges: true,
          typeWeights: {
            [RoomTypes.enemy]: Infinity,
            [RoomTypes.ally]: Infinity,
            [RoomTypes.sourceKeeper]: Infinity,
            [RoomTypes.neutral]: Infinity,
          },
        },
        {
          packedPath:
            Memory.rooms[creepMemory[CreepMemoryKeys.remote]][
              creep.commune.communeManager.remoteResourcePathType
            ][creepMemory[CreepMemoryKeys.sourceIndex]],
          remoteName: creepMemory[CreepMemoryKeys.remote],
        },
      )

      return true
    }

    if (creep.room.name !== creep.commune.name) {
      // Fulfill requests near the hauler

      CreepOps.runRoomLogisticsRequestsAdvanced(creep, {
        types: new Set([RoomLogisticsRequestTypes.pickup, RoomLogisticsRequestTypes.withdraw]),
        resourceTypes: new Set([RESOURCE_ENERGY]),
        conditions: request => {
          // If the target is near the creep

          const targetPos = findObjectWithID(request.targetID).pos
          return getRange(targetPos, creep.pos) <= 0
        },
      })

      if (!creep.needsResources()) {
        // We have enough resources, return home

        delete creep.moved

        creep.message += creep.commune.name

        const anchor = creep.commune.roomManager.anchor
        if (!anchor) throw Error('No anchor for hauler ' + creep.room.name)

        creep.createMoveRequestByPath(
          {
            origin: creep.pos,
            goals: [
              {
                pos: anchor,
                range: 3,
              },
            ],
            avoidEnemyRanges: true,
            typeWeights: {
              [RoomTypes.enemy]: Infinity,
              [RoomTypes.ally]: Infinity,
              [RoomTypes.sourceKeeper]: Infinity,
              [RoomTypes.neutral]: Infinity,
            },
          },
          {
            packedPath:
              Memory.rooms[creepMemory[CreepMemoryKeys.remote]][
                creep.commune.communeManager.remoteResourcePathType
              ][creepMemory[CreepMemoryKeys.sourceIndex]],
            remoteName: creepMemory[CreepMemoryKeys.remote],
          },
        )

        return true
      }
    }

    // We aren't in the remote, go to the source

    const sourceHarvestPos = unpackPosAt(
      Memory.rooms[creepMemory[CreepMemoryKeys.remote]][
        RoomMemoryKeys.remoteSourceHarvestPositions
      ][creepMemory[CreepMemoryKeys.sourceIndex]],
    )

    creep.message += creepMemory[CreepMemoryKeys.remote]
    console.log(creepMemory[CreepMemoryKeys.remote])
    creep.createMoveRequestByPath(
      {
        origin: creep.pos,
        goals: [
          {
            pos: sourceHarvestPos,
            range: 1,
          },
        ],
        avoidEnemyRanges: true,
        typeWeights: {
          [RoomTypes.enemy]: Infinity,
          [RoomTypes.ally]: Infinity,
          [RoomTypes.sourceKeeper]: Infinity,
          [RoomTypes.neutral]: Infinity,
        },
        avoidDanger: true,
      },
      {
        packedPath: reversePosList(
          Memory.rooms[creepMemory[CreepMemoryKeys.remote]][
            creep.commune.communeManager.remoteResourcePathType
          ][creepMemory[CreepMemoryKeys.sourceIndex]],
        ),
        remoteName: creepMemory[CreepMemoryKeys.remote],
      },
    )

    return true
  }

  /**
   *
   * @returns If the creep no longer needs energy
   */
  private static getRemoteSourceResources(creep: Creep) {
    const creepMemory = Memory.creeps[creep.name]
    const sourceHarvestPos = unpackPosAt(
      Memory.rooms[creep.room.name][RoomMemoryKeys.remoteSourceHarvestPositions][
        creepMemory[CreepMemoryKeys.sourceIndex]
      ],
    )

    // If we're ready to take on a request by the source or we already have one, perform it

    const isBySourceHarvestPos = getRange(creep.pos, sourceHarvestPos) <= 1
    if (isBySourceHarvestPos || creepMemory[CreepMemoryKeys.roomLogisticsRequests].length > 0) {
      const freeNextStoreInitial = creep.freeNextStore

      CreepOps.runRoomLogisticsRequestsAdvanced(creep, {
        types: new Set([RoomLogisticsRequestTypes.pickup, RoomLogisticsRequestTypes.withdraw]),
        resourceTypes: new Set([RESOURCE_ENERGY]),
        conditions: request => {
          // If the target is near the creep or source

          const targetPos = findObjectWithID(request.targetID).pos
          return (
            getRange(targetPos, creep.pos) <= 1 ||
            getRange(
              targetPos,
              creep.room.roomManager.remoteSources[creepMemory[CreepMemoryKeys.sourceIndex]].pos,
            ) <= 1
          )
        },
      })

      // remove fulfilled reserved source credit from source credit

      // Should be a negative number, as we should have more used store than before
      const freeNextStoreDifference = creep.freeNextStore - freeNextStoreInitial
      if (freeNextStoreDifference !== 0) {
        Memory.rooms[creep.room.name][RoomMemoryKeys.remoteSourceCredit][
          creepMemory[CreepMemoryKeys.sourceIndex]
        ] += freeNextStoreDifference
        Memory.rooms[creep.room.name][RoomMemoryKeys.remoteSourceCreditReservation][
          creepMemory[CreepMemoryKeys.sourceIndex]
        ] += freeNextStoreDifference
      }

      return !creep.needsResources()
    }

    // Fulfill requests near the hauler

    CreepOps.runRoomLogisticsRequestsAdvanced(creep, {
      types: new Set<RoomLogisticsRequestTypes>([
        RoomLogisticsRequestTypes.pickup,
        RoomLogisticsRequestTypes.withdraw,
      ]),
      resourceTypes: new Set([RESOURCE_ENERGY]),
      conditions: request => {
        // If the target is near the creep

        const targetPos = findObjectWithID(request.targetID).pos
        return getRange(targetPos, creep.pos) <= 1
      },
    })

    if (!creep.needsResources()) return true

    // We aren't by the sourceHarvestPos, get adjacent to it

    if (!isBySourceHarvestPos) {
      creep.createMoveRequestByPath(
        {
          origin: creep.pos,
          goals: [
            {
              pos: sourceHarvestPos,
              range: 1,
            },
          ],
          avoidEnemyRanges: true,
        },
        {
          packedPath: reversePosList(
            Memory.rooms[creep.room.name][creep.commune.communeManager.remoteResourcePathType][
              creepMemory[CreepMemoryKeys.sourceIndex]
            ],
          ),
          remoteName: creep.room.name,
        },
      )

      return false
    }

    // We are next to the source

    creep.moved = MovedTypes.wait

    return !creep.needsResources()
  }

  private static deliverResources(creep: Creep) {
    const commune = creep.commune

    if (commune.communeManager.remoteResourcePathType === RoomMemoryKeys.remoteSourceHubPaths) {
      if (creep.room.name === commune.name) {
        this.passiveRenew(creep)

        CreepOps.runRoomLogisticsRequestsAdvanced(creep, {
          types: new Set([RoomLogisticsRequestTypes.transfer]),
          resourceTypes: new Set([RESOURCE_ENERGY]),
          noDelivery: true,
          conditions: request => {
            // If the target is near the creep

            const targetPos = findObjectWithID(request.targetID).pos
            return getRange(targetPos, creep.pos) <= 1
          },
        })

        // If we tried to respond but weren't able to do so in a single tick, then we should wait to try again next tick
        if (Memory.creeps[creep.name][CreepMemoryKeys.roomLogisticsRequests].length) return true

        // We haven't emptied ourselves yet
        if (!creep.needsResources()) {
          if (getRange(creep.pos, commune.storage.pos) <= 1) return true

          creep.createMoveRequestByPath(
            {
              origin: creep.pos,
              goals: [
                {
                  pos: commune.storage.pos,
                  range: 1,
                },
              ],
              avoidEnemyRanges: true,
              typeWeights: {
                [RoomTypes.enemy]: Infinity,
                [RoomTypes.ally]: Infinity,
                [RoomTypes.sourceKeeper]: Infinity,
                [RoomTypes.neutral]: Infinity,
              },
            },
            {
              packedPath:
                Memory.rooms[creep.memory[CreepMemoryKeys.remote]][
                  commune.communeManager.remoteResourcePathType
                ][creep.memory[CreepMemoryKeys.sourceIndex]],
            },
          )
          return true
        }
        this.removeRemote(creep)
        if (!this.findRemote(creep)) return false

        creep.message += creep.memory[CreepMemoryKeys.remote]

        const sourceHarvestPos = unpackPosAt(
          Memory.rooms[creep.memory[CreepMemoryKeys.remote]][
            RoomMemoryKeys.remoteSourceHarvestPositions
          ][creep.memory[CreepMemoryKeys.sourceIndex]],
        )

        creep.createMoveRequestByPath(
          {
            origin: creep.pos,
            goals: [
              {
                pos: sourceHarvestPos,
                range: 1,
              },
            ],
            avoidEnemyRanges: true,
            typeWeights: {
              [RoomTypes.enemy]: Infinity,
              [RoomTypes.ally]: Infinity,
              [RoomTypes.sourceKeeper]: Infinity,
              [RoomTypes.neutral]: Infinity,
            },
          },
          {
            packedPath: reversePosList(
              Memory.rooms[creep.memory[CreepMemoryKeys.remote]][
                commune.communeManager.remoteResourcePathType
              ][creep.memory[CreepMemoryKeys.sourceIndex]],
            ),
            remoteName: creep.memory[CreepMemoryKeys.remote],
          },
        )

        return false
      }

      creep.message += commune.name

      creep.createMoveRequestByPath(
        {
          origin: creep.pos,
          goals: [
            {
              pos: commune.storage.pos,
              range: 1,
            },
          ],
          avoidEnemyRanges: true,
          typeWeights: {
            [RoomTypes.enemy]: Infinity,
            [RoomTypes.ally]: Infinity,
            [RoomTypes.sourceKeeper]: Infinity,
            [RoomTypes.neutral]: Infinity,
          },
        },
        {
          packedPath:
            Memory.rooms[creep.memory[CreepMemoryKeys.remote]][
              commune.communeManager.remoteResourcePathType
            ][creep.memory[CreepMemoryKeys.sourceIndex]],
        },
      )
      return true
    }

    if (creep.room.name === commune.name) {
      this.passiveRenew(creep)

      CreepOps.runRoomLogisticsRequestAdvanced(creep, {
        types: new Set<RoomLogisticsRequestTypes>([RoomLogisticsRequestTypes.transfer]),
        resourceTypes: new Set([RESOURCE_ENERGY]),
      })

      // We haven't emptied ourselves yet
      if (!creep.needsResources()) return true
      this.removeRemote(creep)
      if (!this.findRemote(creep)) return false

      creep.message += creep.memory[CreepMemoryKeys.remote]

      const sourceHarvestPos = unpackPosAt(
        Memory.rooms[creep.memory[CreepMemoryKeys.remote]][
          RoomMemoryKeys.remoteSourceHarvestPositions
        ][creep.memory[CreepMemoryKeys.sourceIndex]],
      )

      creep.createMoveRequestByPath(
        {
          origin: creep.pos,
          goals: [
            {
              pos: sourceHarvestPos,
              range: 1,
            },
          ],
          avoidEnemyRanges: true,
          typeWeights: {
            [RoomTypes.enemy]: Infinity,
            [RoomTypes.ally]: Infinity,
            [RoomTypes.sourceKeeper]: Infinity,
            [RoomTypes.neutral]: Infinity,
          },
        },
        {
          packedPath: reversePosList(
            Memory.rooms[creep.memory[CreepMemoryKeys.remote]][
              commune.communeManager.remoteResourcePathType
            ][creep.memory[CreepMemoryKeys.sourceIndex]],
          ),
          remoteName: creep.memory[CreepMemoryKeys.remote],
        },
      )

      return false
    }

    creep.message += commune.name

    const anchor = commune.roomManager.anchor
    if (!anchor) throw Error('No anchor for hauler ' + creep.room.name)

    creep.createMoveRequestByPath(
      {
        origin: creep.pos,
        goals: [
          {
            pos: anchor,
            range: 3,
          },
        ],
        avoidEnemyRanges: true,
        typeWeights: {
          [RoomTypes.enemy]: Infinity,
          [RoomTypes.ally]: Infinity,
          [RoomTypes.sourceKeeper]: Infinity,
          [RoomTypes.neutral]: Infinity,
        },
      },
      {
        packedPath:
          Memory.rooms[creep.memory[CreepMemoryKeys.remote]][
            commune.communeManager.remoteResourcePathType
          ][creep.memory[CreepMemoryKeys.sourceIndex]],
        loose: true,
      },
    )

    return true
  }

  private static relayCoord(creep: Creep, coord: Coord) {
    if (Game.flags[FlagNames.roomVisuals]) {
      creep.room.visual.circle(coord.x, coord.y, { fill: customColors.lightBlue })
    }

    const creepAtPosName = creep.room.creepPositions[packCoord(coord)]
    if (!creepAtPosName) return false

    const creepAtPos = Game.creeps[creepAtPosName]

    if (creepAtPos.role !== 'hauler') return false
    if (creepAtPos.movedResource) return false

    const creepMemory = Memory.creeps[creep.name]
    // ensure we aren't relaying with the same creep as last tick
    if (
      creepMemory[CreepMemoryKeys.previousRelayer] &&
      creepMemory[CreepMemoryKeys.previousRelayer][0] === creepAtPos.name
    )
      return false

    // ensure the creep receiving creep is empty
    /* if (creepAtPos.store.getUsedCapacity() > 0) return false */
    if (creepAtPos.store.getUsedCapacity() > 0) return false

    // Ensure that they have the same opinions on roads
    if (creepMemory[CreepMemoryKeys.preferRoads] !== creepMemory[CreepMemoryKeys.preferRoads])
      return false

    /* const logisticsRequest = Memory.creeps[creep.name][CreepMemoryKeys.roomLogisticsRequests][0]
        if (logisticsRequest) {
            const target = findObjectWithID(logisticsRequest[CreepRoomLogisticsRequestKeys.target])
            // Don't relay if they are close to our logistics target
            if (getRange(target.pos, creepAtPos.pos) <= 1) return false
        } */
    if (creepAtPos.store.getFreeCapacity() !== creep.store.getUsedCapacity(RESOURCE_ENERGY))
      return false

    creep.transfer(creepAtPos, RESOURCE_ENERGY)

    creep.movedResource = true
    creepAtPos.movedResource = true
    /*
        const nextEnergy = Math.min(creep.nextStore.energy, creepAtPos.freeNextStore)
        creep.nextStore.energy -= nextEnergy
        creepAtPos.nextStore.energy += nextEnergy
        */
    /*
        log('creepEnergy', creep.store.energy)
        log('creepAtPos Energy', creepAtPos.freeNextStore)
        log('nextEnergy', Math.min(creep.store.energy, creepAtPos.freeNextStore))
        */
    const transferAmount = Math.min(
      creep.store.getUsedCapacity(RESOURCE_ENERGY),
      creepAtPos.store.getFreeCapacity(),
    )
    creep.reserveStore.energy -= transferAmount
    creep.nextStore.energy -= transferAmount
    creepAtPos.reserveStore.energy += transferAmount
    creepAtPos.nextStore.energy += transferAmount
    /*
        log('creep needs res', creep.needsResources())
        log('creepAtPos need res', creepAtPos.needsResources())
 */
    // Stop previously attempted moveRequests as they do not account for a relay

    delete creep.moveRequest
    delete creepAtPos.moveRequest

    delete creep.moved
    delete creepAtPos.moved

    const creepAtPosMemory = Memory.creeps[creepAtPos.name]

    // Trade paths so they might reuse them

    const path = creepMemory[CreepMemoryKeys.path]
    creepMemory[CreepMemoryKeys.path] = creepAtPosMemory[CreepMemoryKeys.path]
    creepAtPosMemory[CreepMemoryKeys.path] = path

    // record relaying information to avoid swapping

    creepMemory[CreepMemoryKeys.previousRelayer] = [creepAtPos.name, Game.time]
    creepAtPosMemory[CreepMemoryKeys.previousRelayer] = [creep.name, Game.time]

    // Trade room logistics requests

    const creepAtPosRequests = [...creepAtPosMemory[CreepMemoryKeys.roomLogisticsRequests]]
    creepAtPosMemory[CreepMemoryKeys.roomLogisticsRequests] = [
      ...creepMemory[CreepMemoryKeys.roomLogisticsRequests],
    ]
    creepMemory[CreepMemoryKeys.roomLogisticsRequests] = creepAtPosRequests

    // Trade remotes and sourceIndexes
    // Delete from creepAtPos because it is returning home, not responding to a remote

    const remote = creepMemory[CreepMemoryKeys.remote]
    creepMemory[CreepMemoryKeys.remote] = creepAtPosMemory[CreepMemoryKeys.remote]
    creepAtPosMemory[CreepMemoryKeys.remote] = remote

    const sourceIndex = creepMemory[CreepMemoryKeys.sourceIndex]
    creepMemory[CreepMemoryKeys.sourceIndex] = creepAtPosMemory[CreepMemoryKeys.sourceIndex]
    creepAtPosMemory[CreepMemoryKeys.sourceIndex] = sourceIndex

    const taskRoom = creepMemory[CreepMemoryKeys.taskRoom]
    creepMemory[CreepMemoryKeys.taskRoom] = creepAtPosMemory[CreepMemoryKeys.taskRoom]
    creepAtPosMemory[CreepMemoryKeys.taskRoom] = taskRoom

    //

    if (creepMemory[CreepMemoryKeys.taskRoom]) {
      this.runCommuneLogistics(creep)
    } else this.getResources(creep)

    const hauler = creepAtPos as Hauler
    if (creepAtPosMemory[CreepMemoryKeys.taskRoom]) hauler.runCommuneLogistics()
    else if (creepAtPosMemory[CreepMemoryKeys.remote]) hauler.deliverResources()

    if (Game.flags[FlagNames.debugRelay]) {
      if (creep.moveRequest)
        creep.room.targetVisual(creep.pos, unpackCoord(creep.moveRequest), true)
      if (creepAtPos.moveRequest) {
        creepAtPos.room.targetVisual(creepAtPos.pos, unpackCoord(creepAtPos.moveRequest), true)
      }
    }

    return true
  }

  private static relayCardinal(creep: Creep, moveCoord: Coord) {
    let offsets = relayOffsets.horizontal
    if (creep.pos.y === moveCoord.y) offsets = relayOffsets.vertical

    for (const offset of offsets) {
      const coord = {
        x: moveCoord.x + offset.x,
        y: moveCoord.y + offset.y,
      }

      if (this.relayCoord(creep, coord)) return Result.action
    }

    return Result.noAction
  }

  private static relayDiagonal(creep: Creep, moveCoord: Coord) {
    let offsets

    if (creep.pos.y > moveCoord.y) {
      offsets = relayOffsets.topLeft
      if (creep.pos.x < moveCoord.x) offsets = relayOffsets.topRight
    } else {
      offsets = relayOffsets.bottomLeft
      if (creep.pos.x < moveCoord.x) offsets = relayOffsets.bottomRight
    }

    for (const offset of offsets) {
      const coord = {
        x: moveCoord.x + offset.x,
        y: moveCoord.y + offset.y,
      }
      /*
            // If the x and y are dissimilar

            if (coord.x !== moveCoord.x && coord.y !== moveCoord.y) continue
            */
      if (this.relayCoord(creep, coord)) return Result.action
    }

    return Result.noAction
  }

  private static relay(creep: Creep) {
    // If there is no easy way to know what coord the creep is trying to go to next

    const creepMemory = Memory.creeps[creep.name]
    if (
      !creep.moveRequest &&
      (!creepMemory[CreepMemoryKeys.path] ||
        creepMemory[CreepMemoryKeys.path].length / packedPosLength < 2)
    )
      return Result.noAction
    if (creep.movedResource) return Result.noAction

    const creepEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY)
    // ensure we have energy
    if (creepEnergy <= 0) return Result.noAction
    // ensure energy is our only resource
    if (creepEnergy !== creep.store.getUsedCapacity()) return Result.noAction

    // Don't relay too close to the source position unless we are fatigued

    if (
      creepMemory[CreepMemoryKeys.taskRoom] !== creep.room.name &&
      !creep.fatigue &&
      creepMemory[CreepMemoryKeys.remote] === creep.room.name &&
      getRange(
        creep.room.roomManager.remoteSourceHarvestPositions[
          creepMemory[CreepMemoryKeys.sourceIndex]
        ][0],
        creep.pos,
      ) <= 1
    )
      return Result.noAction

    const moveCoord = creep.moveRequest
      ? unpackCoord(creep.moveRequest)
      : unpackPosAt(creepMemory[CreepMemoryKeys.path], 1)

    if (creep.pos.x === moveCoord.x || creep.pos.y === moveCoord.y) {
      return this.relayCardinal(creep, moveCoord)
    }

    return this.relayDiagonal(creep, moveCoord)
  }

  private static travelToCommune(creep: Creep) {
    if (creep.room.name === creep.commune.name && !creep.isOnExit) {
      return Result.success
    }

    const anchor = creep.commune.roomManager.anchor
    if (!anchor) throw Error('no anchor for hauler')

    creep.createMoveRequest({
      origin: creep.pos,
      goals: [
        {
          pos: anchor,
          range: 3,
        },
      ],
      avoidEnemyRanges: true,
      typeWeights: {
        [RoomTypes.enemy]: Infinity,
        [RoomTypes.ally]: Infinity,
        [RoomTypes.sourceKeeper]: Infinity,
        [RoomTypes.neutral]: Infinity,
      },
    })

    return Result.action
  }

  /**
   * Run commune logistics, but only for creeps intended for commune logistics
   */
  private static runRestrictedCommuneLogistics(creep: Creep) {
    const creepMemory = Memory.creeps[creep.name]
    // let it respond to its remote
    if (Memory.creeps[creep.name][CreepMemoryKeys.remote]) return false
    // We aren't in the commune
    if (creep.room.name !== creep.commune.name) return false

    if (creep.commune.communeManager.hasSufficientRoads) {
      // If we have a body not optimized for roads, try to respond to a remote instead
      if (!creepMemory[CreepMemoryKeys.preferRoads]) return false
    }

    // If there is no need for more commune haulers
    if (
      creep.commune.communeManager.communeHaulerNeed <
      creep.commune.communeManager.communeHaulerCarryParts
    ) {
      return false
    }

    // success, we are working for the commune now

    if (!creepMemory[CreepMemoryKeys.taskRoom]) {
      creepMemory[CreepMemoryKeys.taskRoom] = creep.room.name
      creep.commune.communeManager.communeHaulerCarryParts += MyCreepUtils.parts(creep).carry
    }

    this.runCommuneLogistics(creep)
    return true
  }

  private static runCommuneLogistics(creep: Creep) {
    this.passiveRenew(creep)

    if (CreepOps.runRoomLogisticsRequestsAdvanced(creep) === Result.action) {
      this.relay(creep)
      return Result.action
    }

    return Result.success
  }

  static isDying(creep: Creep) {
    // Stop if creep is spawning

    if (creep.spawning) return false
    /*
        // If the creep's remaining ticks are more than the estimated spawn time, inform false

        if (creep.ticksToLive > creep.body.length * CREEP_SPAWN_TIME) return false
 */
    const creepMemory = Memory.creeps[creep.name]

    if (creepMemory[CreepMemoryKeys.remote]) {
      if (creepMemory[CreepMemoryKeys.sourceIndex] === undefined)
        throw Error('has remote but no sourceIndex')
      if (
        creep.ticksToLive >
        creep.body.length * CREEP_SPAWN_TIME +
          Memory.rooms[creepMemory[CreepMemoryKeys.remote]][
            creep.commune.communeManager.remoteResourcePathType
          ][creepMemory[CreepMemoryKeys.sourceIndex]].length /
            packedPosLength
      ) {
        return false
      }
    }
    if (creep.ticksToLive > creep.body.length * CREEP_SPAWN_TIME) return false

    return true
  }
}
