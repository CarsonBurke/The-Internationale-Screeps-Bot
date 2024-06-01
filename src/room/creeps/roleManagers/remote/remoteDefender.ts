import {
  CreepMemoryKeys,
  Result,
  RoomMemoryKeys,
  RoomTypes,
  remoteTypeWeights,
} from '../../../../constants/general'
import { findClosestObject, getRangeXY, randomIntRange } from 'utils/utils'
import { packCoord } from 'other/codec'

export class RemoteDefender extends Creep {
  public isDying() {
    // Stop if creep is spawning

    if (this.spawning) return false

    // If the creep's remaining ticks are more than the estimated spawn time, inform false

    if (this.ticksToLive > this.body.length * CREEP_SPAWN_TIME) return false

    // Record creep as isDying

    return true
  }

  initRun(): void {
    if (!this.findRemote()) return

    const role = this.role as 'remoteDefender'

    if (
      Memory.rooms[this.memory[CreepMemoryKeys.remote]][RoomMemoryKeys.type] !== RoomTypes.neutral
    ) {
      delete this.memory[CreepMemoryKeys.remote]
      if (!this.findRemote()) return
    }

    // If the creep's remote no longer is managed by its commune
    else if (
      Memory.rooms[this.memory[CreepMemoryKeys.remote]][RoomMemoryKeys.commune] !==
      this.commune.name
    ) {
      // Delete it from memory and try to find a new one

      delete this.memory[CreepMemoryKeys.remote]
      if (!this.findRemote()) return
    }

    if (this.isDying()) return
    /*
        // Reduce remote need

        Memory.rooms[this.memory[CreepMemoryKeys.remote]][RoomMemoryKeys.minDamage] -= this.combatStrength.ranged
        Memory.rooms[this.memory[CreepMemoryKeys.remote]][RoomMemoryKeys.minHeal] -= this.combatStrength.heal
 */
    const commune = this.commune

    // Add the creep to creepsOfRemote relative to its remote

    if (commune.creepsOfRemote[this.memory[CreepMemoryKeys.remote]])
      commune.creepsOfRemote[this.memory[CreepMemoryKeys.remote]][role].push(this.name)
  }

  /**
   * Finds a remote to defend
   */
  findRemote?(): boolean {
    const creep = this

    // If the creep already has a remote, inform true

    if (creep.memory[CreepMemoryKeys.remote]) return true

    // Get remotes by their efficacy

    const remoteNamesByEfficacy = creep.commune.roomManager.remoteNamesByEfficacy

    let roomMemory

    // Loop through each remote name

    for (const roomName of remoteNamesByEfficacy) {
      // Get the remote's memory using its name

      roomMemory = Memory.rooms[roomName]

      // If the needs of this remote are met, iterate
      /*
            if (roomMemory[RoomMemoryKeys.minDamage] + roomMemory[RoomMemoryKeys.minHeal] <= 0) continue

            // Otherwise assign the remote to the creep and inform true

            creep.memory[CreepMemoryKeys.remote] = roomName
            roomMemory[RoomMemoryKeys.minDamage] -= creep.combatStrength.ranged
            roomMemory[RoomMemoryKeys.minHeal] -= creep.combatStrength.heal
 */
      return true
    }

    // Inform false

    return false
  }

  /**
   * Find and attack enemyCreeps
   */
  advancedAttackEnemies?(): boolean {
    const { room } = this

    const enemyAttackers = room.roomManager.enemyAttackers

    // If there are none

    if (!enemyAttackers.length) {
      const enemyCreeps = room.roomManager.notMyCreeps.enemy

      if (!enemyCreeps.length) {
        return this.aggressiveHeal()
      }

      // Heal nearby creeps

      if (this.passiveHeal()) return true

      this.message = 'EC'

      const enemyCreep = findClosestObject(this.pos, enemyCreeps)
      // Get the range between the creeps

      const range = getRangeXY(this.pos.x, enemyCreep.pos.x, this.pos.y, enemyCreep.pos.y)

      // If the range is more than 1

      if (range > 1 && !enemyCreep.isOnExit) {
        this.rangedAttack(enemyCreep)

        // Have the create a moveRequest to the enemyAttacker and inform true

        this.createMoveRequest({
          origin: this.pos,
          goals: [{ pos: enemyCreep.pos, range: 1 }],
        })

        return true
      }

      this.rangedMassAttack()

      return true
    }

    // Otherwise, get the closest enemyAttacker

    const enemyAttacker = findClosestObject(this.pos, enemyAttackers)

    // Get the range between the creeps

    const range = getRangeXY(this.pos.x, enemyAttacker.pos.x, this.pos.y, enemyAttacker.pos.y)

    // If it's more than range 3

    if (range > 3) {
      // Heal nearby creeps

      this.passiveHeal()

      // Make a moveRequest to it and inform true

      this.createMoveRequest({
        origin: this.pos,
        goals: [{ pos: enemyAttacker.pos, range: 1 }],
      })

      return true
    }

    this.message = 'AEA'

    // Otherwise, have the creep pre-heal itself

    this.heal(this)

    // If the range is 1, rangedMassAttack

    if (range === 1) {
      this.rangedMassAttack()
    }

    // Otherwise, rangedAttack the enemyAttacker
    else this.rangedAttack(enemyAttacker)

    // If the creep is out matched, try to always stay in range 3

    if (this.combatStrength.heal < enemyAttacker.combatStrength.ranged) {
      if (range === 3) return true

      if (range >= 3) {
        this.createMoveRequest({
          origin: this.pos,
          goals: [{ pos: enemyAttacker.pos, range: 3 }],
        })

        return true
      }

      this.createMoveRequest({
        origin: this.pos,
        goals: [{ pos: enemyAttacker.pos, range: 25 }],
        flee: true,
      })

      return true
    }

    // If the creep has less heal power than the enemyAttacker's attack power

    if (this.combatStrength.heal < enemyAttacker.combatStrength.ranged) {
      // If the range is less or equal to 2

      if (range <= 2) {
        // Have the creep flee and inform true

        this.createMoveRequest({
          origin: this.pos,
          goals: [{ pos: enemyAttacker.pos, range: 1 }],
          flee: true,
        })

        return true
      }
    }

    // If the range is more than 1

    if (range > 1) {
      // Have the create a moveRequest to the enemyAttacker and inform true

      this.createMoveRequest({
        origin: this.pos,
        goals: [{ pos: enemyAttacker.pos, range: 1 }],
      })

      return true
    }

    // Otherwise inform true

    return true
  }

  constructor(creepID: Id<Creep>) {
    super(creepID)
  }

  static roleManager(room: Room, creepsOfRole: string[]) {
    for (const creepName of creepsOfRole) {
      const creep: RemoteDefender = Game.creeps[creepName]

      // Try to find a remote

      if (!creep.findRemote()) {
        // If the room is the creep's commune

        if (room.name === creep.commune.name) {
          // Advanced recycle and iterate

          creep.advancedRecycle()
          continue
        }

        const anchor = creep.commune.roomManager.anchor
        if (!anchor) throw Error('No anchor for remoteDefender ' + creep.room.name)

        // Otherwise, have the creep make a moveRequest to its commune and iterate

        creep.createMoveRequest({
          origin: creep.pos,
          goals: [
            {
              pos: anchor,
              range: 5,
            },
          ],
          typeWeights: {
            [RoomTypes.enemy]: Infinity,
            [RoomTypes.ally]: Infinity,
            [RoomTypes.sourceKeeper]: Infinity,
            [RoomTypes.neutral]: Infinity,
          },
        })

        continue
      }

      creep.message = creep.memory[CreepMemoryKeys.remote]

      // Try to attack enemyAttackers, iterating if there are none or one was attacked

      if (creep.advancedAttackEnemies()) {
        delete creep.memory[CreepMemoryKeys.ticksWaited]
        continue
      }

      // If the creep is in its remote

      if (room.name === creep.memory[CreepMemoryKeys.remote]) {
        if (!creep.memory[CreepMemoryKeys.ticksWaited])
          creep.memory[CreepMemoryKeys.ticksWaited] = 0
        else creep.memory[CreepMemoryKeys.ticksWaited] += 1

        // If a random range of time has passed, find a new remote

        if (creep.memory[CreepMemoryKeys.ticksWaited] > randomIntRange(20, 100)) {
          delete creep.memory[CreepMemoryKeys.remote]

          if (creep.moveRequest) continue

          // Try to find a remote

          if (!creep.findRemote()) continue
        }
      }

      // Otherwise, create a moveRequest to its remote

      if (
        creep.createMoveRequest({
          origin: creep.pos,
          goals: [
            {
              pos: new RoomPosition(25, 25, creep.memory[CreepMemoryKeys.remote]),
              range: 25,
            },
          ],
          typeWeights: remoteTypeWeights,
        }) === Result.fail
      ) {
        Memory.rooms[Memory.creeps[creep.name][CreepMemoryKeys.remote]][
          RoomMemoryKeys.abandonRemote
        ] = 1500
        delete creep.memory[CreepMemoryKeys.remote]
      }
    }
  }
}
