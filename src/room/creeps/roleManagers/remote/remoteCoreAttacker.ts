import {
  CreepMemoryKeys,
  customColors,
  remoteTypeWeights,
  Result,
  RoomMemoryKeys,
  RoomTypes,
  SleepFor,
} from '../../../../constants/general'
import { getRangeXY, randomIntRange, randomTick } from 'utils/utils'

export class RemoteCoreAttacker extends Creep {
  constructor(creepID: Id<Creep>) {
    super(creepID)
  }

  public isDying() {
    // Stop if creep is spawning

    if (this.spawning) return false

    // If the creep's remaining ticks are more than the estimated spawn time, inform false

    if (this.ticksToLive > this.body.length * CREEP_SPAWN_TIME) return false

    // Record creep as isDying

    return true
  }

  initRun(): void {
    if (randomTick() && !this.getActiveBodyparts(MOVE)) this.suicide()

    if (!this.hasValidRemote()) {
    }
    if (!this.findRemote()) return

    this.assignRemote()
  }

  assignRemote?() {
    if (this.isDying()) return

    const role = this.role as 'remoteCoreAttacker'

    // Reduce remote need

    const creepMemory = Memory.creeps[this.name]
    Memory.rooms[creepMemory[CreepMemoryKeys.remote]][RoomMemoryKeys[role]] -= 1

    const commune = this.commune

    // Add the creep to creepsOfRemote relative to its remote

    if (commune.creepsOfRemote[creepMemory[CreepMemoryKeys.remote]])
      commune.creepsOfRemote[creepMemory[CreepMemoryKeys.remote]][role].push(this.name)
  }

  hasValidRemote?() {
    const creepMemory = Memory.creeps[this.name]
    if (!creepMemory[CreepMemoryKeys.remote]) return false

    const remoteMemory = Memory.rooms[creepMemory[CreepMemoryKeys.remote]]

    if (remoteMemory[RoomMemoryKeys.disable]) return false
    if (remoteMemory[RoomMemoryKeys.abandonRemote]) return false
    if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.neutral) return false
    if (remoteMemory[RoomMemoryKeys.commune] !== this.commune.name) return false

    return true
  }

  removeRemote?() {
    const creepMemory = Memory.creeps[this.name]

    Memory.rooms[creepMemory[CreepMemoryKeys.remote]][
      RoomMemoryKeys[this.role as 'remoteCoreAttacker']
    ] += 1
    delete creepMemory[CreepMemoryKeys.remote]
  }

  /**
   * Finds a remote to harvest in
   */
  findRemote?() {
    if (this.hasValidRemote()) return true

    const creepMemory = Memory.creeps[this.name]
    const role = 'remoteCoreAttacker'
    const remoteNamesByEfficacy = this.commune.roomManager.remoteNamesByEfficacy

    // Loop through each remote name

    for (const remoteName of remoteNamesByEfficacy) {
      const remoteMemory = Memory.rooms[remoteName]

      if (remoteMemory[RoomMemoryKeys.disable]) continue
      if (remoteMemory[RoomMemoryKeys.abandonCommune]) continue
      if (remoteMemory[RoomMemoryKeys[role]] <= 0) continue
      if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.neutral) continue
      if (remoteMemory[RoomMemoryKeys.commune] !== this.room.name) continue

      // Otherwise assign the remote to the creep and inform true

      creepMemory[CreepMemoryKeys.remote] = remoteName
      this.assignRemote()

      return true
    }

    // Inform false

    return false
  }

  /**
   * Find and attack cores
   */
  advancedAttackCores?(): boolean {
    const { room } = this

    // If there are no cores

    if (!room.roomManager.structures.invaderCore.length) {
      this.removeRemote()
      return false
    }

    // Find the closest core

    const closestCore = room.roomManager.structures.invaderCore[0]
    this.actionCoord = closestCore.pos

    // If the creep at the core

    if (getRangeXY(this.pos.x, closestCore.pos.x, this.pos.y, closestCore.pos.y) === 1) {
      this.message = '🗡️C'

      this.attack(closestCore)
      return true
    }

    // Otherwise say the intention and create a moveRequest to the creep's harvestPos, and inform the attempt

    this.message = '⏩C'

    this.createMoveRequest({
      origin: this.pos,
      goals: [{ pos: closestCore.pos, range: 1 }],
      avoidEnemyRanges: true,
    })

    return true
  }

  static roleManager(room: Room, creepsOfRole: string[]) {
    for (const creepName of creepsOfRole) {
      const creep: RemoteCoreAttacker = Game.creeps[creepName]

      const creepMemory = Memory.creeps[creep.name]
      if (
        creepMemory[CreepMemoryKeys.sleepFor] === SleepFor.any &&
        creepMemory[CreepMemoryKeys.sleepTime] > Game.time
      ) {
        creep.message = '😴'
        continue
      }

      // Try to find a remote

      if (!creep.findRemote()) {
        // If the room is the creep's commune

        if (room.name === creep.commune.name) {
          // Advanced recycle and iterate

          creep.advancedRecycle()
          continue
        }

        const anchor = creep.commune.roomManager.anchor
        if (!anchor) throw Error('No anchor for remoteCoreAttacker ' + creep.room.name)

        // Otherwise, have the creep make a moveRequest to its commune and iterate

        if (
          creep.createMoveRequest({
            origin: creep.pos,
            goals: [
              {
                pos: anchor,
                range: 4,
              },
            ],
            typeWeights: remoteTypeWeights,
            avoidDanger: true,
          }) === Result.fail
        ) {
          creepMemory[CreepMemoryKeys.sleepFor] = SleepFor.any
          creepMemory[CreepMemoryKeys.sleepTime] = Game.time + randomIntRange(10, 50)
        }

        continue
      }

      creep.message = creepMemory[CreepMemoryKeys.remote]

      // If the creep is its remote

      if (room.name === creepMemory[CreepMemoryKeys.remote]) {
        if (creep.advancedAttackCores()) continue
        continue
      }

      // Otherwise, create a moveRequest to its remote

      if (
        creep.createMoveRequest({
          origin: creep.pos,
          goals: [
            {
              pos: new RoomPosition(25, 25, creepMemory[CreepMemoryKeys.remote]),
              range: 25,
            },
          ],
          typeWeights: remoteTypeWeights,
          avoidDanger: true,
        }) === Result.fail
      ) {
        Memory.rooms[Memory.creeps[creep.name][CreepMemoryKeys.remote]][
          RoomMemoryKeys.abandonRemote
        ] = 1500
        creep.removeRemote()
      }
    }
  }
}
