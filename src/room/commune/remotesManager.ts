import {
  remoteRoles,
  maxRemoteRoomDistance,
  remoteTypeWeights,
  packedPosLength,
  RoomMemoryKeys,
  RoomTypes,
  defaultDataDecay,
  maxRemotePathDistance,
} from '../../constants/general'
import {
  findCarryPartsRequired,
  findLowestScore,
  getRange,
  randomIntRange,
  randomRange,
  randomTick,
  Utils,
} from 'utils/utils'
import { unpackPosList } from 'other/codec'
import { CommuneManager } from './commune'
import { RoomNameUtils } from 'room/roomNameUtils'
import { StructureUtils } from 'room/structureUtils'
import { CommuneOps } from './communeOps'

type RemoteSourcePathTypes =
  | RoomMemoryKeys.remoteSourceFastFillerPaths
  | RoomMemoryKeys.remoteSourceHubPaths
const remoteSourcePathTypes: RemoteSourcePathTypes[] = [
  RoomMemoryKeys.remoteSourceFastFillerPaths,
  RoomMemoryKeys.remoteSourceHubPaths,
]

const manageUseInterval = randomIntRange(150, 200)
const checkRoomStatusInterval = randomIntRange(200, 500)

export class RemotesManager {
  communeManager: CommuneManager

  constructor(communeManager: CommuneManager) {
    this.communeManager = communeManager
  }

  update() {
    const roomMemory = Memory.rooms[this.communeManager.room.name]

    for (const remoteName of roomMemory[RoomMemoryKeys.remotes]) {
      RoomNameUtils.updateCreepsOfRemoteName(remoteName, this.communeManager)
    }

    this.updateRemoteResourcePathType()
  }

  private updateRemoteResourcePathType() {
    if (this.communeManager.remoteResourcePathType !== undefined && !randomTick()) return

    if (
      this.communeManager.room.storage &&
      StructureUtils.isRCLActionable(this.communeManager.room.storage)
    ) {
      this.communeManager.remoteResourcePathType = RoomMemoryKeys.remoteSourceHubPaths
      return
    }
    this.communeManager.remoteResourcePathType = RoomMemoryKeys.remoteSourceFastFillerPaths
  }

  initRun() {
    const { room } = this.communeManager

    // Loop through the commune's remote names

    for (let index = room.memory[RoomMemoryKeys.remotes].length - 1; index >= 0; index -= 1) {
      // Get the name of the remote using the index

      const remoteName = room.memory[RoomMemoryKeys.remotes][index]
      const remoteMemory = Memory.rooms[remoteName]

      // Reset values to avoid error

      for (const i in remoteMemory[RoomMemoryKeys.remoteSources]) {
        remoteMemory[RoomMemoryKeys.maxSourceIncome][i] = 0
        remoteMemory[RoomMemoryKeys.remoteSourceHarvesters][i] = 0
        remoteMemory[RoomMemoryKeys.haulers][i] = 0

        remoteMemory[RoomMemoryKeys.remoteSourceCreditChange][i] = 0
        remoteMemory[RoomMemoryKeys.remoteSourceCreditReservation][i] = 0
      }
      remoteMemory[RoomMemoryKeys.remoteReservers] = 0

      // If the room isn't a remote, remove it from the remotes array

      if (
        remoteMemory[RoomMemoryKeys.type] !== RoomTypes.neutral ||
        remoteMemory[RoomMemoryKeys.commune] !== room.name
      ) {
        CommuneOps.removeRemote(room, remoteName, index)
        continue
      }

      // If we've determined the room to be unusable
      if (!this.manageUse(remoteName)) continue

      // The room is closed or is now a respawn or novice zone

      if (
        Utils.isTickInterval(checkRoomStatusInterval) &&
        Memory.rooms[room.name][RoomMemoryKeys.status] !== remoteMemory[RoomMemoryKeys.status]
      ) {
        CommuneOps.removeRemote(room, remoteName, index)
        continue
      }

      if (
        remoteMemory[RoomMemoryKeys.abandonRemote] !== undefined &&
        remoteMemory[RoomMemoryKeys.abandonRemote] > 0
      ) {
        if (!remoteMemory[RoomMemoryKeys.recursedAbandonment]) {
          this.recurseAbandonment(remoteName)
        }

        this.manageAbandonment(remoteName)
        continue
      }

      this.managePathCacheAllowance(remoteName)

      for (const i in remoteMemory[RoomMemoryKeys.remoteSources]) {
        remoteMemory[RoomMemoryKeys.maxSourceIncome][i] =
          SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME
      }
      remoteMemory[RoomMemoryKeys.remoteReservers] = 5

      // Get the remote

      const remote = Game.rooms[remoteName]

      const possibleReservation = room.energyCapacityAvailable >= 650
      const isReserved =
        remote &&
        remote.controller.reservation &&
        remote.controller.reservation.username === Memory.me

      // If the remote is reserved

      if (possibleReservation) {
        // We can potentially double our income

        for (const i in remoteMemory[RoomMemoryKeys.remoteSources]) {
          remoteMemory[RoomMemoryKeys.maxSourceIncome][i] *= 2
        }

        // If the reservation isn't soon to run out, relative to the room's sourceEfficacy average

        if (
          isReserved &&
          remote.controller.reservation.ticksToEnd >=
            Math.max(
              (remoteMemory[RoomMemoryKeys.remoteControllerPath].length / packedPosLength) * 3,
              500,
            )
        ) {
          remoteMemory[RoomMemoryKeys.remoteReservers] = 0
        }
      }

      if (remote) {
        const sourceContainers = remote.roomManager.sourceContainers
        const remoteSources = remote.roomManager.remoteSources
        for (const i in remoteSources) {
          remoteMemory[RoomMemoryKeys.remoteSourceCredit][i] = 0

          const source = remoteSources[i]
          const container = sourceContainers[i]
          if (container) {
            remoteMemory[RoomMemoryKeys.remoteSourceCredit][i] += container.store.energy
          }

          for (const resource of remote.roomManager.droppedEnergy) {
            if (getRange(resource.pos, source.pos) > 1) continue

            remoteMemory[RoomMemoryKeys.remoteSourceCredit][i] += resource.amount
          }
        }
        /*
                remoteMemory[RoomMemoryKeys.minDamage] = 0
                remoteMemory[RoomMemoryKeys.minHeal] = 0

                // Increase the defenderNeed according to the enemy attackers' combined strength

                for (const enemyCreep of remote.roomManager.notMyCreeps.enemy) {
                    remoteMemory[RoomMemoryKeys.minDamage] +=
                        enemyCreep.combatStrength.heal + enemyCreep.combatStrength.heal * enemyCreep.defenceStrength ||
                        Math.max(Math.floor(enemyCreep.hits / 20), 1)
                    remoteMemory[RoomMemoryKeys.minHeal] += enemyCreep.combatStrength.ranged
                } */

        // Record if we have or don't have a source container for each source

        for (const i in sourceContainers) {
          remoteMemory[RoomMemoryKeys.hasContainer][i] = !!sourceContainers
        }

        // Temporary measure while DynamicSquads are in progress

        const enemyAttackers = remote.roomManager.enemyAttackers
        if (enemyAttackers.length) {
          const score = findLowestScore(enemyAttackers, creep => {
            return creep.ticksToLive
          })
          remoteMemory[RoomMemoryKeys.danger] = Game.time + randomIntRange(score, score + 100)
          RoomNameUtils.abandonRemote(remoteName, randomIntRange(score, score + 100))
          continue
        }

        // If the controller is reserved and not by me

        if (remote.controller.reservation && remote.controller.reservation.username !== Memory.me)
          remoteMemory[RoomMemoryKeys.enemyReserved] = true
        // If the controller is not reserved or is by us
        else remoteMemory[RoomMemoryKeys.enemyReserved] = false

        remoteMemory[RoomMemoryKeys.remoteCoreAttacker] =
          remote.roomManager.structures.invaderCore.length * 8
        remoteMemory[RoomMemoryKeys.invaderCore] = remote.roomManager.structures.invaderCore.length

        // Create need if there are any structures that need to be removed

        remoteMemory[RoomMemoryKeys.remoteDismantler] = Math.min(
          remote.roomManager.dismantleTargets.length,
          8,
        )
      }

      console.log(this.communeManager.remoteResourcePathType)

      for (const i in remoteMemory[RoomMemoryKeys.remoteSources]) {
        const remoteSourcePathLength =
          remoteMemory[this.communeManager.remoteResourcePathType].length / packedPosLength
        const hasContainer = remoteMemory[RoomMemoryKeys.hasContainer][i]
        if (hasContainer) {
          // account for repair cost for container

          const creditChange = CONTAINER_DECAY / (CONTAINER_DECAY_TIME * REPAIR_POWER)

          remoteMemory[RoomMemoryKeys.remoteSourceCredit][i] -=
            creditChange * remoteSourcePathLength

          remoteMemory[RoomMemoryKeys.remoteSourceCreditChange][i] -= creditChange
          remoteMemory[RoomMemoryKeys.maxSourceIncome][i] -= creditChange
          continue
        }

        // We don't have a container, account for decay cost

        const creditChange = Math.ceil(
          remoteMemory[RoomMemoryKeys.remoteSourceCredit][i] / ENERGY_DECAY,
        )

        remoteMemory[RoomMemoryKeys.remoteSourceCredit][i] -= creditChange * remoteSourcePathLength

        remoteMemory[RoomMemoryKeys.remoteSourceCreditChange][i] -= creditChange
        remoteMemory[RoomMemoryKeys.maxSourceIncome][i] -= creditChange
      }

      // If the remote is assumed to be reserved by an enemy or an invader core

      if (
        (remoteMemory[RoomMemoryKeys.enemyReserved] && remoteMemory[RoomMemoryKeys.invaderCore]) ||
        remoteMemory[RoomMemoryKeys.remoteDismantler] > 0
      ) {
        for (const i in remoteMemory[RoomMemoryKeys.maxSourceIncome]) {
          remoteMemory[RoomMemoryKeys.maxSourceIncome][i] = 0
        }
        remoteMemory[RoomMemoryKeys.remoteReservers] = 0
      }
    }
  }

  run() {
    // Loop through the commune's remote names

    for (const remoteName of this.communeManager.room.memory[RoomMemoryKeys.remotes]) {
      const remoteMemory = Memory.rooms[remoteName]

      for (const sourceIndex in remoteMemory[RoomMemoryKeys.remoteSources]) {
        // If there was no change in credits, move the values closer to 0 by a %
        if (remoteMemory[RoomMemoryKeys.remoteSourceCreditChange][sourceIndex] <= 0) {
          remoteMemory[RoomMemoryKeys.remoteSourceCredit][sourceIndex] *= 0.999
        }
      }

      if (remoteMemory[RoomMemoryKeys.abandonRemote]) continue

      /*
            const remote = Game.rooms[remoteName]
            const isReserved =
                remote && remote.controller.reservation && remote.controller.reservation.username === Memory.me
 */
      // Loop through each index of sourceEfficacies

      for (const sourceIndex in remoteMemory[RoomMemoryKeys.remoteSources]) {
        if (remoteMemory[RoomMemoryKeys.maxSourceIncome][sourceIndex] === 0) continue

        const income = Math.min(
          // Make sure we ignore negative credit changes
          Math.max(remoteMemory[RoomMemoryKeys.remoteSourceCreditChange][sourceIndex], 0),
          remoteMemory[RoomMemoryKeys.maxSourceIncome][sourceIndex],
        )

        // Find the number of carry parts required for the source, and add it to the remoteHauler need

        remoteMemory[RoomMemoryKeys.haulers][sourceIndex] += findCarryPartsRequired(
          (remoteMemory[RoomMemoryKeys.remoteSourceFastFillerPaths][sourceIndex].length /
            packedPosLength) *
            2,
          income,
        )
      }
    }
  }

  /**
   * Every x ticks see if sourcePath is safe to use
   */
  private managePathCacheAllowance(remoteName: string) {
    if (!randomTick(20)) return

    const remoteMemory = Memory.rooms[remoteName]

    for (let index in remoteMemory[RoomMemoryKeys.remoteSources]) {
      const pathRoomNames: Set<string> = new Set()

      for (const pos of unpackPosList(
        remoteMemory[RoomMemoryKeys.remoteSourceFastFillerPaths][index],
      )) {
        const roomName = pos.roomName

        if (pathRoomNames.has(roomName)) continue
        pathRoomNames.add(roomName)

        // See if the room has a valid type and isn't abandoned

        if (
          remoteTypeWeights[remoteMemory[RoomMemoryKeys.type]] !== Infinity &&
          !remoteMemory[RoomMemoryKeys.abandonRemote]
        )
          continue

        remoteMemory[RoomMemoryKeys.disableCachedPaths] = true
        return
      }
    }

    remoteMemory[RoomMemoryKeys.disableCachedPaths] = false
  }

  /**
   * true = continue use
   * false = stop use
   */
  private manageUse(remoteName: string): boolean {
    const roomMemory = Memory.rooms[remoteName]
    // If we aren't on the inverval to check for use
    if (!Utils.isTickInterval(manageUseInterval)) {
      // Inform the current state of things
      return !roomMemory[RoomMemoryKeys.disable]
    }

    // Otherwise see if the state needs to be updated

    let disabledSources = this.manageSourcesUse(remoteName)
    if (disabledSources >= roomMemory[RoomMemoryKeys.remoteSources].length) {
      roomMemory[RoomMemoryKeys.disable] = true
      return false
    }

    roomMemory[RoomMemoryKeys.disable] = undefined
    return true
  }

  private manageAbandonment(remoteName: string) {
    const remoteMemory = Memory.rooms[remoteName]

    remoteMemory[RoomMemoryKeys.abandonRemote] -= 1
  }

  private isRemoteBlocked(remoteName: string) {
    const safeDistance = RoomNameUtils.advancedFindDistance(
      this.communeManager.room.name,
      remoteName,
      {
        typeWeights: remoteTypeWeights,
        avoidDanger: true,
      },
    )
    if (safeDistance > maxRemoteRoomDistance) return true

    const distance = RoomNameUtils.advancedFindDistance(this.communeManager.room.name, remoteName, {
      typeWeights: remoteTypeWeights,
    })
    if (Math.round(safeDistance * 0.75) > distance) return true

    return false
  }

  private recurseAbandonment(remoteName: string) {
    const remoteMemory = Memory.rooms[remoteName]

    for (const remoteName2 of Memory.rooms[this.communeManager.room.name][RoomMemoryKeys.remotes]) {
      const remoteMemory2 = Memory.rooms[remoteName2]

      // No point in abandoning if the remote is already sufficiently abandoned
      if (remoteMemory2[RoomMemoryKeys.abandonRemote] >= remoteMemory[RoomMemoryKeys.abandonRemote])
        continue

      // We want to abandon if the remote paths through the specified remote
      if (!remoteMemory2[RoomMemoryKeys.pathsThrough].includes(remoteName)) continue

      RoomNameUtils.abandonRemote(remoteName2, remoteMemory[RoomMemoryKeys.abandonRemote])
    }

    remoteMemory[RoomMemoryKeys.recursedAbandonment] = true
  }

  private manageSourcesUse(remoteName: string) {
    let disabledSources = 0
    const roomMemory = Memory.rooms[remoteName]

    for (const pathType of remoteSourcePathTypes) {
      for (const index in roomMemory[pathType]) {
        if (this.manageSourceUse(remoteName, index, pathType)) continue

        disabledSources += 1
        roomMemory[RoomMemoryKeys.disableSources][index] = true
      }
    }

    return disabledSources
  }

  private manageSourceUse(
    remoteName: string,
    sourceIndex: string,
    pathType: RemoteSourcePathTypes,
  ) {
    const roomMemory = Memory.rooms[remoteName]
    const packedPath = roomMemory[pathType][parseInt(sourceIndex)]
    if (!packedPath.length) return false

    if (packedPath.length / packedPosLength > maxRemotePathDistance) {
      return false
    }

    const path = unpackPosList(packedPath)
    for (const pos of path) {
      if (!Memory.rooms[pos.roomName][RoomMemoryKeys.owner]) continue

      // the room has an owner

      return false
    }

    return true
  }
}
