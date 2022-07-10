import { remoteNeedsIndex } from 'international/constants'
import { RemoteHauler } from '../../creepClasses'

export function remoteHaulerManager(room: Room, creepsOfRole: string[]) {
     for (const creepName of creepsOfRole) {
          const creep: RemoteHauler = Game.creeps[creepName]

          // If the creep needs resources

          if (creep.needsResources()) {
               if (!creep.findRemote()) continue

               // If the creep is in the remote

               if (room.name === creep.memory.remoteName) {
                    if (!creep.memory.reservations || !creep.memory.reservations.length) creep.reserveWithdrawEnergy()

                    if (!creep.fulfillReservation()) {
                         creep.say(creep.message)
                         continue
                    }

                    creep.reserveWithdrawEnergy()

                    if (!creep.fulfillReservation()) {
                         creep.say(creep.message)
                         continue
                    }

                    if (creep.needsResources()) continue

                    creep.message += creep.memory.communeName
                    creep.say(creep.message)

                    creep.createMoveRequest({
                         origin: creep.pos,
                         goal: {
                              pos: new RoomPosition(25, 25, creep.memory.communeName),
                              range: 20,
                         },
                         avoidEnemyRanges: true,
                         weightGamebjects: {
                              1: room.structures.road,
                         },
                    })

                    continue
               }

               creep.message += creep.memory.remoteName
               creep.say(creep.message)

               creep.createMoveRequest({
                    origin: creep.pos,
                    goal: {
                         pos: new RoomPosition(25, 25, creep.memory.remoteName),
                         range: 20,
                    },
                    avoidEnemyRanges: true,
                    weightGamebjects: {
                         1: room.structures.road,
                    },
               })

               continue
          }

          // Otherwise if creep doesn't need resources

          if (room.name === creep.memory.communeName) {
               // Try to renew the creep

               creep.advancedRenew()

               // If the creep has a remoteName, delete it

               if (creep.memory.remoteName) delete creep.memory.remoteName

               if (!creep.memory.reservations || !creep.memory.reservations.length) creep.reserveTransferEnergy()

               if (!creep.fulfillReservation()) {
                    creep.say(creep.message)
                    continue
               }

               creep.reserveTransferEnergy()

               if (!creep.fulfillReservation()) {
                    creep.say(creep.message)
                    continue
               }

               if (!creep.needsResources()) continue

               if (!creep.findRemote()) continue

               creep.message += creep.memory.remoteName
               creep.say(creep.message)

               creep.createMoveRequest({
                    origin: creep.pos,
                    goal: {
                         pos: new RoomPosition(25, 25, creep.memory.remoteName),
                         range: 20,
                    },
                    avoidEnemyRanges: true,
                    weightGamebjects: {
                         1: room.structures.road,
                    },
               })

               continue
          }

          creep.message += creep.memory.communeName
          creep.say(creep.message)

          creep.createMoveRequest({
               origin: creep.pos,
               goal: {
                    pos: new RoomPosition(25, 25, creep.memory.communeName),
                    range: 20,
               },
               avoidEnemyRanges: true,
               weightGamebjects: {
                    1: room.structures.road,
               },
          })
     }
}

RemoteHauler.prototype.findRemote = function () {
     if (this.memory.remoteName) return true

     const remoteNamesByEfficacy: string[] = Game.rooms[this.memory.communeName]?.get('remoteNamesByEfficacy')

     let roomMemory

     for (const roomName of remoteNamesByEfficacy) {
          roomMemory = Memory.rooms[roomName]

          if (roomMemory.needs[remoteNeedsIndex.remoteHauler] <= 0) continue

          this.memory.remoteName = roomName
          roomMemory.needs[remoteNeedsIndex.remoteHauler] -= this.parts.work

          return true
     }

     return false
}
