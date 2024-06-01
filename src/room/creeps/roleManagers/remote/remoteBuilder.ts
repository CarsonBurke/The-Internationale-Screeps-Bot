import {
  CreepMemoryKeys,
  packedPosLength,
  Result,
  RoomMemoryKeys,
  RoomTypes,
} from '../../../../constants/general'
import {
  findCarryPartsRequired,
  findObjectWithID,
  getRangeXY,
  getRange,
  randomTick,
  scalePriority,
  areCoordsEqual,
} from 'utils/utils'
import { packCoord, reversePosList, unpackPosAt } from 'other/codec'
import { indexOf } from 'lodash'
import { MyCreepUtils } from 'room/creeps/myCreepUtils'

export class RemoteBuilder extends Creep {
  constructor(creepID: Id<Creep>) {
    super(creepID)
  }

  public isDying(): boolean {
    // Stop if creep is spawning

    if (this.spawning) return false

    if (this.memory[CreepMemoryKeys.remote]) {
      if (this.ticksToLive > this.body.length * CREEP_SPAWN_TIME) return false
    } else if (this.ticksToLive > this.body.length * CREEP_SPAWN_TIME) return false

    // Record creep as isDying

    return true
  }

  initRun(): void {
    if (randomTick() && !this.getActiveBodyparts(MOVE)) this.suicide()

    if (!this.findRemote()) return

    const creepMemory = Memory.creeps[this.name]
    const remoteName = creepMemory[CreepMemoryKeys.remote]

    if (remoteName === this.room.name) {
      this.remoteActions()
    }

    if (this.isDying()) return

    // Record response

    Memory.rooms[remoteName][RoomMemoryKeys.remoteBuilder] += MyCreepUtils.parts(this).work
  }

  hasValidRemote?() {
    if (!this.memory[CreepMemoryKeys.remote]) return false

    const remoteMemory = Memory.rooms[this.memory[CreepMemoryKeys.remote]]

    if (remoteMemory[RoomMemoryKeys.disable]) return false
    if (remoteMemory[RoomMemoryKeys.abandonRemote]) return false
    if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.neutral) return false
    if (remoteMemory[RoomMemoryKeys.commune] !== this.commune.name) return false

    return true
  }

  /**
   * Finds a remote to harvest in
   */
  findRemote?() {
    if (this.hasValidRemote()) return true

    for (const remoteInfo of this.commune.roomManager.remoteSourceIndexesByEfficacy) {
      const splitRemoteInfo = remoteInfo.split(' ')
      const remoteName = splitRemoteInfo[0]

      const remoteMemory = Memory.rooms[remoteName]
      if (remoteMemory[RoomMemoryKeys.remoteBuilder] <= 0) continue
      if (remoteMemory[RoomMemoryKeys.disable]) continue
      if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.neutral) continue
      if (remoteMemory[RoomMemoryKeys.commune] !== this.commune.name) continue

      this.assignRemote(remoteName)
      return true
    }

    return false
  }

  assignRemote?(remoteName: string) {
    const creepMemory = Memory.creeps[this.name]
    creepMemory[CreepMemoryKeys.remote] = remoteName

    delete creepMemory[CreepMemoryKeys.packedCoord]

    if (this.isDying()) return

    Memory.rooms[remoteName][RoomMemoryKeys.remoteBuilder] += MyCreepUtils.parts(this).work
  }

  removeRemote?() {
    const creepMemory = Memory.creeps[this.name]

    if (!this.isDying()) {
      const remoteName = creepMemory[CreepMemoryKeys.remote]

      Memory.rooms[remoteName][RoomMemoryKeys.remoteBuilder] -= MyCreepUtils.parts(this).work
    }

    delete creepMemory[CreepMemoryKeys.remote]
    delete creepMemory[CreepMemoryKeys.packedCoord]
  }

  remoteActions?() {}

  static roleManager(room: Room, creepsOfRole: string[]) {
    for (const creepName of creepsOfRole) {
      const creep: RemoteBuilder = Game.creeps[creepName] as RemoteBuilder

      // Try to find a remote

      if (!creep.findRemote()) {
        creep.message = '❌ Remote'
        /*
                // If the room is the creep's commune

                if (room.name === creep.commune.name) {
                    // Advanced recycle and iterate

                    creep.advancedRecycle()
                    continue
                }

                // Otherwise, have the creep make a moveRequest to its commune and iterate

                creep.createMoveRequest({
                    origin: creep.pos,
                    goals: [
                        {
                            pos: creep.commune.anchor,
                            range: 5,
                        },
                    ],
                })
 */
        continue
      }

      // If the creep needs resources

      const creepMemory = Memory.creeps[creep.name]
      if (room.name === creepMemory[CreepMemoryKeys.remote]) {
        creep.remoteActions()
        continue
      }

      creep.message = creepMemory[CreepMemoryKeys.remote]

      creep.createMoveRequest({
        origin: creep.pos,
        goals: [
          {
            pos: new RoomPosition(25, 25, creepMemory[CreepMemoryKeys.remote]),
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
      })
    }
  }
}
