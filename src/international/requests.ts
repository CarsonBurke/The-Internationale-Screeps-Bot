import { randomIntRange, randomRange, Utils } from 'utils/utils'
import { CollectiveManager } from './collective'
import { RoomNameUtils } from 'room/roomNameUtils'
import {
  CombatRequestKeys,
  HaulRequestKeys,
  RoomMemoryKeys,
  RoomStatusKeys,
  RoomTypes,
  WorkRequestKeys,
  antifaRoles,
  maxCombatDistance,
  maxHaulDistance,
  maxWorkRequestDistance,
} from '../constants/general'
import { indexOf } from 'lodash'
import { Sleepable, StaticSleepable } from 'utils/sleepable'
import { util } from 'chai'
import { WorkRequest } from 'types/internationalRequests'
import { CommuneUtils } from 'room/commune/communeUtils'

const runRequestInverval = randomIntRange(100, 200)

// Should adsorb the request content of tickInit
export class RequestsManager extends StaticSleepable {
  static sleepFor = randomIntRange(100, 200)

  public static run() {
    this.updateWorkRequests()
    this.updateCombatRequests()
    this.updateHaulRequests()

    if (Utils.isTickInterval(runRequestInverval)) {
      this.runWorkRequests()
      this.runCombatRequests()
      this.runHaulRequests()
    }
  }

  // update requests

  private static updateWorkRequests() {
    const newDynamicScoreTreshold = randomIntRange(19000, 20000)

    for (const roomName in Memory.workRequests) {
      const request = Memory.workRequests[roomName]
      if (request[WorkRequestKeys.responder]) continue

      if (request[WorkRequestKeys.abandon] > 0) {
        request[WorkRequestKeys.abandon] -= 1
        continue
      }

      // otherwise abandon is worthless. Let's delete it to save (a bit of) memory

      delete request[WorkRequestKeys.abandon]

      // update dynamic score if enough time has passed

      const roomMemory = Memory.rooms[roomName]
      if (
        !roomMemory[RoomMemoryKeys.dynamicScore] ||
        Game.time - roomMemory[RoomMemoryKeys.dynamicScoreUpdate] >= newDynamicScoreTreshold
      ) {
        RoomNameUtils.findDynamicScore(roomName)
      }
    }
  }

  private static updateCombatRequests() {
    for (const requestName in Memory.combatRequests) {
      const request = Memory.combatRequests[requestName]

      if (request[CombatRequestKeys.responder]) {
        CollectiveManager.creepsByCombatRequest[requestName] = {}
        for (const role of antifaRoles)
          CollectiveManager.creepsByCombatRequest[requestName][role] = []
        request[CombatRequestKeys.quads] = 0
        continue
      }

      if (request[CombatRequestKeys.abandon]) {
        request[CombatRequestKeys.abandon] -= 1
        continue
      }

      delete request[CombatRequestKeys.abandon]
    }
  }

  private static updateHaulRequests() {
    for (const requestName in Memory.haulRequests) {
      const request = Memory.haulRequests[requestName]

      if (request[HaulRequestKeys.responder]) {
        CollectiveManager.creepsByHaulRequest[requestName] = []
        continue
      }

      if (request[HaulRequestKeys.abandon] > 0) {
        request[HaulRequestKeys.abandon] -= 1
        continue
      }

      delete request[HaulRequestKeys.abandon]
    }
  }

  // run requests

  private static runWorkRequests() {
    if (!global.settings.autoClaim) return
    /* if (CollectiveManager.communes.size >= CollectiveManager.maxCommunes) return */

    let reservedGCL = Game.gcl.level - CollectiveManager.communes.size

    // Subtract the number of workRequests with responders

    for (const roomName in Memory.workRequests) {
      const request = Memory.workRequests[roomName]
      if (!request[WorkRequestKeys.responder]) continue

      reservedGCL -= 1
    }

    /* if (reservedGCL <= 0) return */

    const communesForResponding = new Set<string>()

    for (const roomName of CollectiveManager.communes) {
      if (!CommuneUtils.canTakeNewWorkRequest(roomName)) continue

      communesForResponding.add(roomName)
    }

    // Assign and abandon workRequests, in order of score

    const workRequests = CollectiveManager.workRequestsByScore
    for (const roomName of workRequests) {
      const request = Memory.workRequests[roomName]

      if (!request) continue
      if (!this.shouldWorkRequestGetResponse(request, roomName, reservedGCL)) {
        continue
      }

      // If there is not enough reserved GCL to make a new request
      /* if (reservedGCL <= 0) return */

      const roomMemory = Memory.rooms[roomName]
      // if someone else has acquired the room
      if (
        roomMemory[RoomMemoryKeys.type] === RoomTypes.ally ||
        roomMemory[RoomMemoryKeys.type] === RoomTypes.enemy
      ) {
        // Wait on the request
        Memory.workRequests[roomName][WorkRequestKeys.abandon] = 20000
        continue
      }

      const communeName = RoomNameUtils.findClosestRoomName(roomName, communesForResponding)
      if (!communeName) {
        // Wait on the request
        Memory.workRequests[roomName][WorkRequestKeys.abandon] = 20000
        continue
      }

      if (Memory.rooms[communeName][RoomMemoryKeys.status] !== roomMemory[RoomMemoryKeys.status]) {
        // We probably can't reach as it will likely be a respawn, novice, or closed

        Memory.workRequests[roomName][WorkRequestKeys.abandon] = 20000
        continue
      }

      // Run a more simple and less expensive check, then a more complex and expensive to confirm. If the check fails, abandon the room for some time
      if (
        Game.map.getRoomLinearDistance(communeName, roomName) > maxWorkRequestDistance ||
        RoomNameUtils.advancedFindDistance(communeName, roomName, {
          typeWeights: {
            keeper: Infinity,
            enemy: Infinity,
            ally: Infinity,
          },
        }) > maxWorkRequestDistance
      ) {
        Memory.workRequests[roomName][WorkRequestKeys.abandon] = 20000
        continue
      }

      // Otherwise assign the request to the room, and record as such in Memory

      Memory.rooms[communeName][RoomMemoryKeys.workRequest] = roomName
      Memory.workRequests[roomName][WorkRequestKeys.responder] = communeName

      reservedGCL -= 1

      communesForResponding.delete(communeName)
    }
  }

  private static shouldWorkRequestGetResponse(
    request: WorkRequest,
    roomName: string,
    reservedGCL: number,
  ) {
    // If there is no GCL left to claim with
    if (Game.gcl.level <= reservedGCL) {
      const room = Game.rooms[roomName]
      // If we don't own the request room's controller already, then we should stop
      if (!room || !room.controller.my) {
        return false
      }
    }

    if (request[WorkRequestKeys.abandon]) return false
    if (
      request[WorkRequestKeys.responder] &&
      CollectiveManager.communes.has(request[WorkRequestKeys.responder])
    ) {
      return false
    }
    return true
  }

  private static runCombatRequests() {
    for (const requestName in Memory.combatRequests) {
      const request = Memory.combatRequests[requestName]

      if (request[CombatRequestKeys.abandon]) continue
      if (
        request[CombatRequestKeys.responder] &&
        CollectiveManager.communes.has(request[CombatRequestKeys.responder])
      )
        continue

      // Filter communes that don't have the combatRequest target already

      const communes = []

      for (const roomName of CollectiveManager.communes) {
        /* if (Memory.rooms[roomName].combatRequests.includes(requestName)) continue */

        // Ensure the combatRequest isn't responded to by the room the request is for

        if (requestName === roomName) continue

        const room = Game.rooms[roomName]
        if (!room.roomManager.structures.spawn.length) continue

        // Ensure we aren't responding to too many requests for our energy level

        if (room.storage && room.controller.level >= 4) {
          if (
            room.memory[RoomMemoryKeys.combatRequests].length + 1 >=
            room.communeManager.maxCombatRequests
          )
            continue
        } else {
          if (
            room.memory[RoomMemoryKeys.combatRequests].length + 1 >=
            room.communeManager.estimatedEnergyIncome / 10
          )
            continue
        }

        // Ensure we can afford the creeps required

        const minRangedAttackCost = Utils.findMinRangedAttackCost(
          request[CombatRequestKeys.minDamage],
        )
        const minMeleeHealCost = Utils.findMinHealCost(
          request[CombatRequestKeys.minMeleeHeal] +
            (request[CombatRequestKeys.maxTowerDamage] || 0),
        )
        const minRangedHealCost = Utils.findMinHealCost(request[CombatRequestKeys.minRangedHeal])

        if (minRangedAttackCost + minRangedHealCost > room.energyCapacityAvailable) continue

        const minAttackCost = Utils.findMinMeleeAttackCost(request[CombatRequestKeys.minDamage])
        if (minAttackCost > room.energyCapacityAvailable) continue

        communes.push(roomName)
      }

      const communeName = RoomNameUtils.findClosestRoomName(requestName, communes)
      if (!communeName) continue

      if (
        Memory.rooms[communeName][RoomMemoryKeys.status] !==
        Memory.rooms[requestName][RoomMemoryKeys.status]
      ) {
        // We probably can't reach as it will likely be a respawn, novice, or closed

        request[CombatRequestKeys.abandon] = 20000
        continue
      }

      // Run a more simple and less expensive check, then a more complex and expensive to confirm
      if (
        Game.map.getRoomLinearDistance(communeName, requestName) > maxCombatDistance ||
        RoomNameUtils.advancedFindDistance(communeName, requestName, {
          typeWeights: {
            keeper: Infinity,
            enemy: Infinity,
            ally: Infinity,
          },
        }) > maxCombatDistance
      ) {
        request[CombatRequestKeys.abandon] = 20000
        continue
      }

      // Otherwise assign the request to the room, and record as such in Memory

      Memory.rooms[communeName][RoomMemoryKeys.combatRequests].push(requestName)
      request[CombatRequestKeys.responder] = communeName

      CollectiveManager.creepsByCombatRequest[requestName] = {}
      for (const role of antifaRoles) {
        CollectiveManager.creepsByCombatRequest[requestName][role] = []
      }
    }
  }

  private static runHaulRequests() {
    for (const requestName in Memory.haulRequests) {
      const request = Memory.haulRequests[requestName]

      if (request[HaulRequestKeys.abandon]) continue
      if (
        request[HaulRequestKeys.responder] &&
        CollectiveManager.communes.has(request[HaulRequestKeys.responder])
      )
        continue

      // Filter communes that don't have the combatRequest target already

      const communes = []

      for (const roomName of CollectiveManager.communes) {
        if (Memory.rooms[roomName][RoomMemoryKeys.haulRequests].includes(requestName)) {
          continue
        }

        const room = Game.rooms[roomName]
        if (room.controller.level < 4) continue
        if (!room.roomManager.structures.spawn.length) continue

        if (!CommuneUtils.storingStructures(room).length) continue
        // Ensure we aren't responding to too many requests for our energy level
        if (
          room.roomManager.resourcesInStoringStructures.energy /
            (20000 + room.controller.level * 1000) <
          room.memory[RoomMemoryKeys.haulRequests].length
        )
          continue

        communes.push(roomName)
      }

      const communeName = RoomNameUtils.findClosestRoomName(requestName, communes)
      if (!communeName) continue

      if (
        Memory.rooms[communeName][RoomMemoryKeys.status] !==
        Memory.rooms[requestName][RoomMemoryKeys.status]
      ) {
        // We probably can't reach as it will likely be a respawn, novice, or closed

        request[HaulRequestKeys.abandon] = 20000
        continue
      }

      // Run a more simple and less expensive check, then a more complex and expensive to confirm
      if (
        Game.map.getRoomLinearDistance(communeName, requestName) > maxHaulDistance ||
        RoomNameUtils.advancedFindDistance(communeName, requestName, {
          typeWeights: {
            keeper: Infinity,
            enemy: Infinity,
            ally: Infinity,
          },
        }) > maxHaulDistance
      ) {
        request[HaulRequestKeys.abandon] = 20000
        continue
      }

      // Otherwise assign the request to the room, and record as such in Memory

      Memory.rooms[communeName][RoomMemoryKeys.haulRequests].push(requestName)
      request[HaulRequestKeys.responder] = communeName

      CollectiveManager.creepsByHaulRequest[requestName] = []
    }
  }
}
