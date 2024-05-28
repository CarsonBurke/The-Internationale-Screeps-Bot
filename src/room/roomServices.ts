import {
  RoomMemoryKeys,
  RoomTypes,
  customColors,
  roomTypesUsedForStats,
} from '../constants/general'
import { RoomStatsKeys } from '../constants/stats'

import './roomFunctions'

import './commune/commune'

import { CreepRoleManager } from './creeps/creepRoleManager'

import { PowerCreepRoleManager } from './creeps/powerCreepRoleManager'
import './roomVisuals'
import { createPosMap, findCPUOf } from 'utils/utils'
import { StatsManager } from 'international/stats'
import { CommuneManager } from './commune/commune'
import { RoomManager } from './room'
import { LogTypes, LogOps } from 'utils/logOps'
import { RoomOps } from './roomOps'
import { CommuneOps } from './commune/communeOps'

export class RoomServices {
  static cleanManagers() {
    for (const roomName in RoomManager.roomManagers) {
      const roomManager = RoomManager.roomManagers[roomName]
      RoomOps.clean(roomManager)
    }

    for (const roomName in CommuneManager.communeManagers) {
      const communeManager = CommuneManager.communeManagers[roomName]
      CommuneOps.clean(communeManager)
    }
  }

  static updateRun() {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]

      room.roomManager = RoomManager.roomManagers[room.name]

      if (!room.roomManager) {
        room.roomManager = new RoomManager()
        RoomManager.roomManagers[room.name] = room.roomManager
      }

      RoomOps.update(room)
    }
  }

  static initRun() {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]

      RoomOps.initRun(room)
    }
  }

  static run() {
    for (const roomName in Game.rooms) {
      this.runRoom(roomName)
    }
  }

  private static runRoom(roomName: string) {
    const startCPU = Game.cpu.getUsed()

    const room = Game.rooms[roomName]
    RoomOps.run(room)

    // Log room stats

    const roomMemory = Memory.rooms[room.name]
    const roomType = roomMemory[RoomMemoryKeys.type]

    LogOps.log(
      `<a style="cursor: pointer;color:inherit; text-decoration:underline;" href="#!/room/${Game.shard.name}/${room.name}">${room.name}</a>`,
      `Type: ${RoomTypes[roomType]} Creeps: ${room.myCreeps.length}`,
      {
        type: LogTypes.info,
        position: 2,
      },
    )

    const usedCPU = Game.cpu.getUsed() - startCPU
    StatsManager.updateStat(roomName, RoomStatsKeys.CpuUsed, usedCPU)
  }
}
