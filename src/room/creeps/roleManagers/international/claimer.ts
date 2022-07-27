import { claimRequestNeedsIndex } from 'international/constants'
import { Claimer } from '../../creepClasses'

export function claimerManager(room: Room, creepsOfRole: string[]) {
    // Loop through the names of the creeps of the role

    for (const creepName of creepsOfRole) {
        // Get the creep using its name

        const creep: Claimer = Game.creeps[creepName]

        const claimTarget = Memory.rooms[creep.commune].claimRequest

        // If the creep has no claim target, stop

        if (!claimTarget) return

        creep.say(claimTarget)

        Memory.claimRequests[Memory.rooms[creep.commune].claimRequest].needs[claimRequestNeedsIndex.claimer] = 0

        if (room.name === claimTarget) {
            creep.claimRoom()
            continue
        }

        // Otherwise if the creep is not in the claimTarget

        // Move to it

        creep.createMoveRequest({
            origin: creep.pos,
            goal: { pos: new RoomPosition(25, 25, claimTarget), range: 25 },
            avoidEnemyRanges: true,
            swampCost: 1,
            typeWeights: {
                enemy: Infinity,
                ally: Infinity,
                keeper: Infinity,
            },
        })
    }
}

Claimer.prototype.claimRoom = function () {
    const creep = this
    const { room } = creep

    if (room.controller.my) return

    // If the creep is not in range to claim the controller

    if (creep.pos.getRangeTo(room.controller) > 1) {
         // Move to the controller and stop

         creep.createMoveRequest({
              origin: creep.pos,
              goal: { pos: room.controller.pos, range: 1 },
              avoidEnemyRanges: true,
              plainCost: 1,
              swampCost: 1,
              typeWeights: {
                   keeper: Infinity,
              },
         })

         return
    }

    // If the owner or reserver isn't me

    if (room.controller.owner || (room.controller.reservation && room.controller.reservation.username !== Memory.me)) {
         creep.attackController(room.controller)
         return
    }

    // Otherwise, claim the controller. If the successful, remove claimerNeed

    creep.claimController(room.controller)
}