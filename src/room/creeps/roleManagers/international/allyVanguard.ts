import {
  WorkRequestKeys,
  CreepMemoryKeys,
  RoomMemoryKeys,
  RoomTypes,
  Result,
  ReservedCoordTypes,
} from '../../../../constants/general'
import { findObjectWithID, getRangeXY, getRange } from 'utils/utils'
import { unpackCoord } from 'other/codec'
import { CreepUtils } from 'room/creeps/creepUtils'
import { MyCreepUtils } from 'room/creeps/myCreepUtils'
import { CreepOps } from 'room/creeps/creepOps'
import { RoomOps } from 'room/roomOps'

export class AllyVanguard extends Creep {
  update() {
    const packedCoord = Memory.creeps[this.name][CreepMemoryKeys.packedCoord]
    if (packedCoord) {
      if (this.isDying()) {
        this.room.roomManager.reserveCoord(packedCoord, ReservedCoordTypes.dying)
      } else {
        this.room.roomManager.reserveCoord(packedCoord, ReservedCoordTypes.important)
      }
    }
  }

  initRun() {
    const request = Memory.workRequests[this.memory[CreepMemoryKeys.workRequest]]

    if (!request) return

    request[WorkRequestKeys.allyVanguard] -= MyCreepUtils.parts(this).work
  }

  findRemote?(): boolean {
    if (this.memory[CreepMemoryKeys.remote]) return true

    const { room } = this

    const exitRoomNames = Game.map.describeExits(room.name)

    for (const exitKey in exitRoomNames) {
      const roomName = exitRoomNames[exitKey as ExitKey]

      const roomMemory = Memory.rooms[roomName]

      // If the room type is not able to be harvested from

      if (
        !roomMemory ||
        roomMemory[RoomMemoryKeys.type] === RoomTypes.enemy ||
        roomMemory[RoomMemoryKeys.type] === RoomTypes.sourceKeeper ||
        roomMemory[RoomMemoryKeys.type] === RoomTypes.ally
      )
        continue

      this.memory[CreepMemoryKeys.remote] = roomName
      return true
    }

    // No viable remote was found

    return false
  }

  getEnergyFromRemote?(): void {
    const { room } = this

    if (!this.findRemote()) return

    if (room.name !== this.memory[CreepMemoryKeys.remote]) {
      this.createMoveRequest({
        origin: this.pos,
        goals: [
          {
            pos: new RoomPosition(25, 25, this.memory[CreepMemoryKeys.remote]),
            range: 25,
          },
        ],
        avoidEnemyRanges: true,
      })

      return
    }

    // Define the creep's sourceName

    if (!this.findSourceIndex()) return

    const sourceIndex = this.memory[CreepMemoryKeys.sourceIndex]

    // Try to move to source. If creep moved then iterate

    if (this.travelToSource(sourceIndex)) return

    // Try to normally harvest. Iterate if creep harvested

    const source = RoomOps.getSources(room)[sourceIndex]
    if (CreepOps.harvestSource(this, source) !== Result.success) return
  }

  getEnergyFromRoom?(): boolean {
    if (this.room.controller.owner) return false

    if (
      CreepOps.runRoomLogisticsRequestsAdvanced(this, {
        resourceTypes: new Set([RESOURCE_ENERGY]),
      }) === Result.success
    )
      return true

    if (!this.needsResources()) return true

    // Define the creep's sourceName

    if (!this.findSourceIndex()) return true

    const sourceIndex = this.memory[CreepMemoryKeys.sourceIndex]

    // Try to move to source. If creep moved then iterate

    if (this.travelToSource(sourceIndex)) return true

    // Try to normally harvest. Iterate if creep harvested

    const source = this.room.roomManager.communeSources[sourceIndex]
    if (CreepOps.harvestSource(this, source) === Result.success) {
      return true
    }
    return true
  }

  /**
   *
   */
  travelToSource?(sourceIndex: number): boolean {
    this.message = '🚬'

    const harvestPos = CreepOps.findSourceHarvestPos(this, this.memory[CreepMemoryKeys.sourceIndex])
    if (!harvestPos) return true

    // If the creep is at the creep's packedHarvestPos, inform false

    if (getRange(this.pos, harvestPos) === 0) return false

    // Otherwise say the intention and create a moveRequest to the creep's harvestPos, and inform the attempt

    this.message = `⏩ ${sourceIndex}`

    this.createMoveRequest({
      origin: this.pos,
      goals: [
        {
          pos: harvestPos,
          range: 0,
        },
      ],
    })

    return true
  }

  /**
   * Builds a spawn in the creep's commune workRequest
   */
  buildRoom?(): void {
    const { room } = this

    if (this.needsResources()) {
      if (this.memory[CreepMemoryKeys.remote]) {
        this.getEnergyFromRemote()
        return
      }

      if (!this.getEnergyFromRoom()) {
        this.getEnergyFromRemote()
      }

      return
    }

    if (room.name !== this.memory[CreepMemoryKeys.workRequest]) {
      this.createMoveRequest({
        origin: this.pos,
        goals: [
          {
            pos: new RoomPosition(25, 25, this.memory[CreepMemoryKeys.workRequest]),
            range: 25,
          },
        ],
        avoidEnemyRanges: true,
      })

      return
    }

    this.advancedBuildAllyCSite()
  }

  constructor(creepID: Id<Creep>) {
    super(creepID)
  }

  static roleManager(room: Room, creepsOfRole: string[]) {
    // Loop through the names of the creeps of the role

    for (const creepName of creepsOfRole) {
      // Get the creep using its name

      const creep: AllyVanguard = Game.creeps[creepName]

      const request = creep.memory[CreepMemoryKeys.workRequest]

      creep.message = request

      if (
        room.name === request ||
        (creep.memory[CreepMemoryKeys.remote] && room.name === creep.memory[CreepMemoryKeys.remote])
      ) {
        creep.buildRoom()
        continue
      }

      // Otherwise if the creep is not in the claimTarget

      // Move to it

      if (
        creep.createMoveRequest({
          origin: creep.pos,
          goals: [
            {
              pos: new RoomPosition(25, 25, creep.memory[CreepMemoryKeys.workRequest]),
              range: 25,
            },
          ],
          avoidEnemyRanges: true,
          typeWeights: {
            [RoomTypes.enemy]: Infinity,
            [RoomTypes.ally]: Infinity,
            [RoomTypes.sourceKeeper]: Infinity,
          },
        }) === Result.fail
      ) {
        const request = Memory.workRequests[creep.memory[CreepMemoryKeys.workRequest]]
        if (request) request[WorkRequestKeys.abandon] = 20000
      }
    }
  }
}
