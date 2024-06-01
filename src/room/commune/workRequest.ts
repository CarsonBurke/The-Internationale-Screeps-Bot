import {
  WorkRequestKeys,
  CombatRequestKeys,
  RoomMemoryKeys,
  RoomTypes,
  customColors,
} from '../../constants/general'
import { randomIntRange, randomTick, Utils } from 'utils/utils'
import { CollectiveManager } from 'international/collective'
import { CommuneManager } from './commune'
import { StatsManager } from 'international/stats'
import { WorkRequest } from 'types/internationalRequests'
import { CommuneOps } from './communeOps'

const checkRoomStatusInverval = randomIntRange(200, 500)

export class WorkRequestOps {
  static tryCreateWorkRequest(room: Room) {
    // create a workRequest if needed

    if (room.roomManager.structures.spawn.length) return

    let request = Memory.workRequests[room.name]
    if (request) {
      request[WorkRequestKeys.priority] = 0
      return
    }

    request = Memory.workRequests[room.name] = {
      [WorkRequestKeys.priority]: 0,
    }
  }

  static manageWorkRequest(room: Room) {
    const roomMemory = Memory.rooms[room.name]

    const requestName = roomMemory[RoomMemoryKeys.workRequest]
    if (!requestName) return

    const request = Memory.workRequests[requestName]
    // If the workRequest doesn't exist anymore somehow, stop trying to do anything with it
    if (!request) {
      delete roomMemory[RoomMemoryKeys.workRequest]
      return
    }

    // if we have no spawn, stop
    if (!room.roomManager.structures.spawn.length) {
      CommuneOps.stopWorkRequestResponse(room, true)
      return
    }

    const type = Memory.rooms[requestName][RoomMemoryKeys.type]
    if (
      type === RoomTypes.ally ||
      type === RoomTypes.enemy
    ) {
      // Delete the request so long as the new type isn't ally

      CommuneOps.stopWorkRequestResponse(room, type !== RoomTypes.ally)
      return
    }

    // If the room is closed or is now a respawn or novice zone
    if (
      Utils.isTickInterval(checkRoomStatusInverval) &&
      Memory.rooms[room.name][RoomMemoryKeys.status] !==
        Memory.rooms[requestName][RoomMemoryKeys.status]
    ) {
      CommuneOps.abandonWorkRequest(room)
      return
    }

    // If the request has been abandoned, have the commune abandon it too

    if (request[WorkRequestKeys.abandon] > 0) {
      CommuneOps.stopWorkRequestResponse(room)
      return
    }

    if (room.energyCapacityAvailable < 650) {
      CommuneOps.stopWorkRequestResponse(room)
      return
    }

    const requestRoom = Game.rooms[requestName]
    if (!requestRoom && Game.gcl.level === CollectiveManager.communes.size) {
      CommuneOps.stopWorkRequestResponse(room, true)
      return
    }

    if (!request[WorkRequestKeys.forAlly] && (!requestRoom || !requestRoom.controller.my)) {
      request[WorkRequestKeys.claimer] = 1
      return
    }

    // If there is a spawn and we own it

    if (
      requestRoom.roomManager.structures.spawn.length &&
      requestRoom.roomManager.structures.spawn.find(spawn => spawn.my)
    ) {
      CommuneOps.abandonWorkRequest(room)
      return
    }

    // If there is an invader core

    const invaderCores = requestRoom.roomManager.structures.invaderCore
    if (invaderCores.length) {
      // Abandon for the core's remaining existance plus the estimated reservation time

      CommuneOps.abandonWorkRequest(
        room,
        invaderCores[0].effects[EFFECT_COLLAPSE_TIMER].ticksRemaining + CONTROLLER_RESERVE_MAX,
      )
      return
    }

    if (request[WorkRequestKeys.forAlly]) {
      request[WorkRequestKeys.allyVanguard] = requestRoom.roomManager.structures.spawn.length
        ? 0
        : 20
    } else {
      request[WorkRequestKeys.vanguard] = requestRoom.roomManager.structures.spawn.length ? 0 : 20
    }

    /*
        request[WorkRequestKeys.minDamage] = 0
        request[WorkRequestKeys.minHeal] = 0

        if (!requestRoom.controller.safeMode) {
            // Increase the defenderNeed according to the enemy attackers' combined strength

            for (const enemyCreep of requestRoom.roomManager.enemyAttackers) {
                if (enemyCreep.owner.username === 'Invader') continue

                request[WorkRequestKeys.minDamage] += enemyCreep.combatStrength.heal
                request[WorkRequestKeys.minHeal] += enemyCreep.combatStrength.ranged
            }

            // Decrease the defenderNeed according to ally combined strength

            for (const allyCreep of requestRoom.roomManager.notMyCreeps.ally.ally) {
                request[WorkRequestKeys.minDamage] -= allyCreep.combatStrength.heal
                request[WorkRequestKeys.minHeal] -= allyCreep.combatStrength.ranged
            }

            if (request[WorkRequestKeys.minDamage] > 0 || request[WorkRequestKeys.minHeal] > 0) this.abandonRemote()
        } */
  }
}
