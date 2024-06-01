import {
  CreepMemoryKeys,
  Result,
  RoomMemoryKeys,
  RoomTypes,
  remoteTypeWeights,
} from '../../../../constants/general'
import { findObjectWithID, getRangeXY, randomTick } from 'utils/utils'

export class RemoteDismantler extends Creep {
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

  initRun() {
    if (randomTick() && !this.getActiveBodyparts(MOVE)) this.suicide()
    if (!this.findRemote()) return

    this.assignRemote()
  }

  assignRemote?() {
    if (this.isDying()) return

    const role = this.role as 'remoteDismantler'

    // Reduce remote need

    Memory.rooms[this.memory[CreepMemoryKeys.remote]][RoomMemoryKeys[role]] -= 1

    const commune = this.commune

    // Add the creep to creepsOfRemote relative to its remote

    if (commune.creepsOfRemote[this.memory[CreepMemoryKeys.remote]])
      commune.creepsOfRemote[this.memory[CreepMemoryKeys.remote]][role].push(this.name)
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

    const creepMemory = Memory.creeps[this.name]

    const role = 'remoteDismantler'
    const remoteNamesByEfficacy = this.commune.roomManager.remoteNamesByEfficacy

    // Loop through each remote name

    for (const roomName of remoteNamesByEfficacy) {
      const remoteMemory = Memory.rooms[roomName]

      if (remoteMemory[RoomMemoryKeys.disable]) continue
      if (remoteMemory[RoomMemoryKeys.abandonRemote]) continue
      if (remoteMemory[RoomMemoryKeys[role]] <= 0) continue
      if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.neutral) continue
      if (remoteMemory[RoomMemoryKeys.commune] !== this.commune.name) continue

      // Otherwise assign the remote to the creep and inform true

      creepMemory[CreepMemoryKeys.remote] = roomName
      this.assignRemote()

      return true
    }

    // Inform false

    return false
  }

  /**
   * Find and attack structures
   */
  advancedDismantle?(): boolean {
    const { room } = this

    if (
      this.room.controller &&
      this.room.controller.owner &&
      global.settings.allies.includes(this.room.controller.owner.username)
    )
      return true

    let target
    let range

    if (this.memory[CreepMemoryKeys.structureTarget]) {
      target = findObjectWithID(this.memory[CreepMemoryKeys.structureTarget])

      if (target) {
        range = getRangeXY(this.pos.x, target.pos.x, this.pos.y, target.pos.y)

        if (range > 1) {
          this.createMoveRequest({
            origin: this.pos,
            goals: [
              {
                pos: target.pos,
                range: 1,
              },
            ],
            avoidEnemyRanges: true,
          })

          return true
        }

        this.dismantle(target)
        return true
      }
    }

    const targets = room.roomManager.dismantleTargets

    if (targets.length) {
      target = this.pos.findClosestByPath(targets, { ignoreRoads: true, ignoreCreeps: true })

      range = getRangeXY(this.pos.x, target.pos.x, this.pos.y, target.pos.y)

      if (range > 1) {
        this.createMoveRequest({
          origin: this.pos,
          goals: [
            {
              pos: target.pos,
              range: 1,
            },
          ],
          avoidEnemyRanges: true,
        })

        return true
      }

      this.memory[CreepMemoryKeys.structureTarget] = target.id as Id<
        Structure<BuildableStructureConstant>
      >

      this.dismantle(target)
      return true
    }

    return false
  }

  static roleManager(room: Room, creepsOfRole: string[]) {
    for (const creepName of creepsOfRole) {
      const creep: RemoteDismantler = Game.creeps[creepName]

      // Try to find a remote

      if (!creep.findRemote()) {
        // If the room is the creep's commune

        if (room.name === creep.commune.name) {
          // Advanced recycle and iterate

          creep.advancedRecycle()
          continue
        }

        const anchor = creep.commune.roomManager.anchor
        if (!anchor) throw Error('No anchor for remoteDismantler ' + creep.room.name)

        // Otherwise, have the creep make a moveRequest to its commune and iterate

        creep.createMoveRequest({
          origin: creep.pos,
          goals: [
            {
              pos: anchor,
              range: 5,
            },
          ],
        })

        continue
      }

      const creepMemory = Memory.creeps[creep.name]
      creep.message = creepMemory[CreepMemoryKeys.remote]

      // If the creep is its remote

      if (room.name === creepMemory[CreepMemoryKeys.remote]) {
        if (creep.advancedDismantle()) continue
        continue
      }

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
        Memory.rooms[creepMemory[CreepMemoryKeys.remote]][RoomMemoryKeys.abandonRemote] = 1500
        delete creepMemory[CreepMemoryKeys.remote]
      }
    }
  }
}
