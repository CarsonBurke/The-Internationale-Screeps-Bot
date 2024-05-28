import { LogOps } from 'utils/logOps'
import { HaulerServices } from './roles/haulerServices'
import { CreepMoveProcs } from './creepMoveProcs'
import { MoveTargets } from 'types/movement'
import { packCoord } from 'other/codec'
import { forCoordsInRange, randomOf } from 'utils/utils'
import { enemyDieChants, friendlyDieChants } from '../../constants/general'

export class MyCreepServices {
  static runCreeps(room: Room) {
    for (const role in room.myCreepsByRole) {
      const creepNames = room.myCreepsByRole[role as CreepRoles]
      if (!creepNames) continue

      switch (role) {
        case 'hauler':
          HaulerServices.runCreeps(creepNames)
          break
        default:
          LogOps.log('No server for role', role)
        /* throw Error(`No service for role ${role}`) */
      }
    }
  }

  static moveCreeps(room: Room) {
    this.runMoveRequests(room)
    this.runMoveTargets(room)
  }

  private static runMoveRequests(room: Room) {
    const moveTargets: MoveTargets = {}
    MyCreepServices.assignInitialMoveTargets(room, moveTargets)

    // Power creeps go first

    for (const creep of room.myPowerCreeps) {
      CreepMoveProcs.tryRunMoveRequest(creep, moveTargets)
    }

    // Normal creeps go second

    for (const creep of room.myCreeps) {
      CreepMoveProcs.tryRunMoveRequest(creep, moveTargets)
    }
  }

  // This function can probably be avoided by assigning this at some other point when these things are looped through
  private static assignInitialMoveTargets(room: Room, moveTargets: MoveTargets) {
    // Power creeps go first

    for (const creep of room.myPowerCreeps) {
      CreepMoveProcs.assignMoveTarget(creep, packCoord(creep.pos), moveTargets)
    }

    // Normal creeps go second

    for (const creep of room.myCreeps) {
      CreepMoveProcs.assignMoveTarget(creep, packCoord(creep.pos), moveTargets)
    }
  }

  private static runMoveTargets(room: Room) {
    // Power creeps go first

    for (const creep of room.myPowerCreeps) {
      CreepMoveProcs.tryRunMoveTarget(creep)
    }

    // Normal creeps go second

    for (const creep of room.myCreeps) {
      CreepMoveProcs.tryRunMoveTarget(creep)
    }
  }

  static chant(room: Room) {
    if (!global.settings.creepChant) return
    if (!room.myCreeps.length) return

    const currentChant = global.settings.creepChant[Memory.chantIndex]
    if (!currentChant) return

    let creeps: (Creep | PowerCreep)[] = room.myCreeps
    creeps = creeps.concat(room.myPowerCreeps)
    if (!creeps.length) return

    const usedNames = MyCreepServices.deadChant(room)

    creeps.filter(creep => !usedNames.has(creep.name))
    if (!creeps.length) return

    randomOf(creeps).say(currentChant, true)
  }

  private static deadChant(room: Room) {
    const usedNames: Set<string> = new Set()

    const tombstones = room.find(FIND_TOMBSTONES, {
      filter: tombstone => tombstone.deathTime + 3 > Game.time,
    })
    if (!tombstones.length) return usedNames

    for (const tombstone of tombstones) {
      let chant: string
      if (
        tombstone.creep.owner.username === Memory.me ||
        global.settings.allies.includes(tombstone.creep.owner.username)
      ) {
        chant = randomOf(friendlyDieChants)
      } else {
        chant = randomOf(enemyDieChants)
      }

      forCoordsInRange(tombstone.pos, 4, coord => {
        const creepName = room.creepPositions[packCoord(coord)]
        if (!creepName) return

        usedNames.add(creepName)
        Game.creeps[creepName].say(chant, true)
      })
    }

    return usedNames
  }
}
