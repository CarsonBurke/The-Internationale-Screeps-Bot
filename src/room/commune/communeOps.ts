import { RoomUtils } from 'room/roomUtils'
import { CommuneDataOps, communeData } from './communeData'
import { CommuneUtils } from './communeUtils'
import {
    CombatRequestKeys,
  Result,
  RoomLogisticsRequestTypes,
  RoomMemoryKeys,
  RoomTypes,
  WorkRequestKeys,
  creepRoles,
  haulerUpdateDefault,
} from '../../constants/general'
import { Utils, randomIntRange, randomTick, roundTo } from 'utils/utils'
import { CollectiveManager } from 'international/collective'
import { RoomNameUtils } from 'room/roomNameUtils'
import { LogOps, LogTypes } from 'utils/logOps'
import { ObserverProcs } from './observerProcs'
import { TerminalProcs } from './terminal/terminalProcs'
import { LogisticsProcs } from 'room/logisticsProcs'
import { SourceProcs } from 'room/sourceProcs'
import { DefenceProcs } from './defenceProcs'
import { PowerSpawnProcs } from './powerSpawnProcs'
import { SpawningStructureOps } from './spawning/spawningStructureOps'
import { TowerProcs } from './towerProcs'
import { HaulerNeedOps } from './haulerNeedOps'
import { CommuneManager } from './commune'
import { RoomOps } from 'room/roomOps'
import { WorkRequestOps } from './workRequest'
import { MyCreepServices } from 'room/creeps/myCreepServices'

/**
 * Minor processes for communes
 */
export class CommuneOps {
  static clean(communeManager: CommuneManager) {
    delete communeManager._maxCombatRequests
    delete communeManager._defensiveRamparts
    delete communeManager._sourceLinks
    delete communeManager._controllerLink
    delete communeManager.towerAttackTarget
    delete communeManager._actionableSpawningStructures
    delete communeManager._spawningStructuresByPriority
    delete communeManager._spawningStructuresByNeed

    if (randomTick()) {
      delete communeManager._minRampartHits
      delete communeManager._storedEnergyBuildThreshold
    }

    if (Utils.isTickInterval(100)) {
      delete communeManager._upgradeStructure
      delete communeManager._hasSufficientRoads
    }
  }

  static update(room: Room) {
    const communeManager = room.communeManager
    communeManager.room = room

    // non manager

    const roomMemory = Memory.rooms[room.name]

    if (roomMemory[RoomMemoryKeys.lastScout] === undefined) {
      RoomOps.advancedScout(room, room)
    }

    // If we should abandon the room

    if (roomMemory[RoomMemoryKeys.abandonCommune] === true) {
      room.controller.unclaim()
      roomMemory[RoomMemoryKeys.type] = RoomTypes.neutral
      RoomNameUtils.cleanMemory(room.name)

      for (const cSite of room.find(FIND_MY_CONSTRUCTION_SITES)) {
        cSite.remove()
      }
      return
    }

    CollectiveManager.communes.add(room.name)

    if (room.controller.safeMode) {
      CollectiveManager.safemodedCommuneName = room.name
    }

    if (!roomMemory[RoomMemoryKeys.greatestRCL]) {
      if (CollectiveManager.communes.size <= 1)
        roomMemory[RoomMemoryKeys.greatestRCL] = room.controller.level
      else if (
        room.controller.progress > room.controller.progressTotal ||
        room.find(FIND_MY_STRUCTURES, {
          filter: structure => structure.structureType !== STRUCTURE_CONTROLLER,
        }).length
      ) {
        roomMemory[RoomMemoryKeys.greatestRCL] = 8
      } else roomMemory[RoomMemoryKeys.greatestRCL] = room.controller.level
    } else if (room.controller.level > roomMemory[RoomMemoryKeys.greatestRCL]) {
      roomMemory[RoomMemoryKeys.greatestRCL] = room.controller.level
    }

    CommuneOps.getRCLUpdate(room)

    if (!roomMemory[RoomMemoryKeys.combatRequests]) roomMemory[RoomMemoryKeys.combatRequests] = []
    if (!roomMemory[RoomMemoryKeys.haulRequests]) roomMemory[RoomMemoryKeys.haulRequests] = []

    communeManager.upgradeStrength = 0
    communeManager.mineralHarvestStrength = 0
    communeManager.communeHaulerNeed = 0
    communeManager.nextSpawnEnergyAvailable = room.energyAvailable

    if (roomMemory[RoomMemoryKeys.remotes] == undefined) roomMemory[RoomMemoryKeys.remotes] = []
    if (roomMemory[RoomMemoryKeys.threatened] == undefined) {
      roomMemory[RoomMemoryKeys.threatened] = 0
    }

    room.usedRampartIDs = new Map()

    room.creepsOfRemote = {}
    communeManager.haulerCarryParts = 0
    communeManager.communeHaulerCarryParts = 0
    communeManager.remoteSourceHarvesters = {}
    communeManager.communeHaulers = []

    communeManager.remotesManager.update()

    // For each role, construct an array for creepsFromRoom

    room.creepsFromRoom = {}
    for (const role of creepRoles) room.creepsFromRoom[role] = []

    room.creepsFromRoomAmount = 0

    room.scoutTargets = new Set()

    if (!roomMemory[RoomMemoryKeys.deposits]) roomMemory[RoomMemoryKeys.deposits] = {}

    room.attackingDefenderIDs = new Set()
    room.defenderEnemyTargetsWithDamage = new Map()
    room.defenderEnemyTargetsWithDefender = new Map()

    if (room.terminal && room.controller.level >= 6) {
      CollectiveManager.terminalCommunes.push(room.name)
    }

    CollectiveManager.mineralNodes[room.roomManager.mineral.mineralType] += 1
  }

  static initRun(room: Room) {
    this.preTickTest(room)

    room.roomManager.communePlanner.attemptPlan(room)

    const roomMemory = Memory.rooms[room.name]
    if (roomMemory[RoomMemoryKeys.communePlanned] !== Result.success) return

    const communeManager = room.communeManager

    communeManager.constructionManager.preTickRun()
    ObserverProcs.preTickRun(room)
    TerminalProcs.preTickRun(room)
    communeManager.remotesManager.initRun()
    communeManager.haulRequestManager.preTickRun()
    WorkRequestOps.tryCreateWorkRequest(room)
  }

  private static preTickTest(room: Room) {
    return

    let CPUUsed = Game.cpu.getUsed()

    LogOps.log('CPU TEST 1 ' + room.name, Game.cpu.getUsed() - CPUUsed, {
      type: LogTypes.info,
    })
  }

  static run(room: Room) {
    const roomMemory = Memory.rooms[room.name]
    if (roomMemory[RoomMemoryKeys.communePlanned] !== Result.success) return

    const communeManager = room.communeManager

    DefenceProcs.run(room)
    TowerProcs.run(room)
    DefenceProcs.manageThreat(room)
    DefenceProcs.manageDefenceRequests(room)

    TerminalProcs.run(room)

    WorkRequestOps.manageWorkRequest(room)
    communeManager.combatRequestManager.run()
    communeManager.haulRequestManager.run()

    SourceProcs.createPowerTasks(room)
    communeManager.remotesManager.run()
    HaulerNeedOps.run(room)

    SpawningStructureOps.createRoomLogisticsRequests(room)
    LogisticsProcs.createCommuneStoringStructureLogisticsRequests(room)
    communeManager.factoryManager.run()
    LogisticsProcs.createCommuneContainerLogisticsRequests(room)
    LogisticsProcs.createCommuneDroppedResourceLogisticsRequests(room)
    LogisticsProcs.createCommuneTombstoneLogisticsRequests(room)
    LogisticsProcs.createCommuneRuinLogisticsRequests(room)
    communeManager.linkManager.run()
    communeManager.labManager.run()
    PowerSpawnProcs.run(room)
    SpawningStructureOps.createPowerTasks(room)

    room.roomManager.creepRoleManager.run()
    room.roomManager.powerCreepRoleManager.run()

    CommuneOps.tryUpdateMinHaulerCost(room)
    SpawningStructureOps.tryRunSpawning(room)

    SpawningStructureOps.tryRegisterSpawningMovement(room)
    MyCreepServices.moveCreeps(room)
    MyCreepServices.chant(room)
    room.roomManager.roomVisualsManager.run()

    this.test(room)
  }

  private static test(room: Room) {
    return

    let CPUUsed = Game.cpu.getUsed()

    LogOps.log('CPU TEST 1 ' + room.name, Game.cpu.getUsed() - CPUUsed, {
      type: LogTypes.info,
    })
  }

  /**
   * Debug
   */
  static visualizeSpawningStructuresByNeed(room: Room) {
    LogOps.log('spawningStructuresByNeed', room.communeManager.spawningStructuresByNeed, {
      type: LogTypes.error,
    })
    for (const structure of room.communeManager.spawningStructuresByNeed) {
      room.coordVisual(structure.pos.x, structure.pos.y)
    }
  }

  static getRCLUpdate(room: Room) {
    const data = communeData[room.name]
    // If the registered RCL is the actual RCL, we're good. No need to update anything
    if (data.registeredRCL === room.controller.level) {
      return
    }
    // If things haven't been registered yet
    if (data.registeredRCL === undefined) {
      data.registeredRCL = room.controller.level
      return
    }

    this.updateRegisteredRCL(room)
  }

  private static updateRegisteredRCL(room: Room) {
    const data = communeData[room.name]
    /* const roomData = roomData[room.name] */

    delete data.generalRepairStructureCoords

    data.registeredRCL = room.controller.level
  }

  static tryUpdateMinHaulerCost(room: Room) {
    const roomMemory = Memory.rooms[room.name]

    // If there is no min hauler size

    if (roomMemory[RoomMemoryKeys.minHaulerCost] === undefined) {
      roomMemory[RoomMemoryKeys.minHaulerCost] = Math.max(
        Memory.minHaulerCost,
        BODYPART_COST[CARRY] * 2 + BODYPART_COST[MOVE],
      )
      roomMemory[RoomMemoryKeys.minHaulerCostUpdate] = Game.time + randomIntRange(1500, 3000)
      return
    }

    if (Game.time - roomMemory[RoomMemoryKeys.minHaulerCostUpdate] < haulerUpdateDefault) return

    // Update the raw hauler cost
    roomMemory[RoomMemoryKeys.minHaulerCost] = Math.max(
      this.findHaulerCountBasedHaulerCost(room, roomMemory),
      Memory.minHaulerCost,
    )

    // Bound the raw hauler cost

    // Lower bound
    roomMemory[RoomMemoryKeys.minHaulerCost] = Math.max(
      roomMemory[RoomMemoryKeys.minHaulerCost],
      BODYPART_COST[CARRY] * 2 + BODYPART_COST[MOVE],
    )

    // Upper bound
    roomMemory[RoomMemoryKeys.minHaulerCost] = Math.min(
      roomMemory[RoomMemoryKeys.minHaulerCost],
      BODYPART_COST[MOVE] * MAX_CREEP_SIZE * 1.2,
    )

    roomMemory[RoomMemoryKeys.minHaulerCostUpdate] = Game.time + randomIntRange(0, 10)
  }

  static findHaulerCountBasedHaulerCost(room: Room, roomMemory: RoomMemory): number {
    // We want this many haulers
    const targetHaulers = 50
    const targetHaulersPercent = (targetHaulers * 0.9) / targetHaulers
    // How far off we are from our ideal hauler count
    const costError = roundTo(
      targetHaulersPercent - room.creepsFromRoom.hauler.length / targetHaulers,
      4,
    )
    const costDelta = Math.floor((roomMemory[RoomMemoryKeys.minHaulerCost] * costError) / 2)

    const cost = roomMemory[RoomMemoryKeys.minHaulerCost] - costDelta
    return cost
  }

  static registerRampartDamage(room: Room) {
    if (!room.roomManager.enemyAttackers.length) return

    const data = communeData[room.name]
    if (data.rampartDamageCoords === undefined || room.roomManager.structureUpdate) {
      this.initRampartDamageCoords(room)
    }
  }

  private static initRampartDamageCoords(room: Room) {
    const ramparts = room.communeManager.defensiveRamparts
    for (const rampart of ramparts) {
    }
  }

  /**
   * Delete a combat request from a commune
   */
  static deleteCombatRequest(room: Room, requestName: string, index: number) {
    delete Memory.combatRequests[requestName]
    Memory.rooms[room.name][RoomMemoryKeys.combatRequests].splice(index, 1)
  }

  /**
   * Remove a remote from a commune
   */
  static removeRemote(room: Room, remoteName: string, index: number) {
    Memory.rooms[room.name][RoomMemoryKeys.remotes].splice(index, 1)
  }

  static stopWorkRequestResponse(room: Room, deleteCombat?: boolean) {
    const roomMemory = Memory.rooms[room.name]
    const request = Memory.workRequests[roomMemory[RoomMemoryKeys.workRequest]]

    if (deleteCombat) {
        CommuneOps.deleteCombatForWorkRequest(room)
    }

    delete request[WorkRequestKeys.responder]
    delete roomMemory[RoomMemoryKeys.workRequest]
  }

  static abandonWorkRequest(room: Room, abandonTime: number = 20000) {
    const roomMemory = Memory.rooms[room.name]

    CommuneOps.deleteCombatForWorkRequest(room)

    delete Memory.workRequests[roomMemory[RoomMemoryKeys.workRequest]]
    delete roomMemory[RoomMemoryKeys.workRequest]
  }

  static deleteCombatForWorkRequest(room: Room) {
    const workRequestName = Memory.rooms[room.name][RoomMemoryKeys.workRequest]
    const combatRequest = Memory.combatRequests[workRequestName]
    if (!combatRequest) return

    if (combatRequest[CombatRequestKeys.responder]) {
      const combatRequestResponder = Game.rooms[combatRequest[CombatRequestKeys.responder]]
      CommuneOps.deleteCombatRequest(
        combatRequestResponder,
        combatRequest[CombatRequestKeys.responder],
        combatRequestResponder.memory[RoomMemoryKeys.combatRequests].indexOf(workRequestName),
      )
      return
    }

    delete Memory.combatRequests[workRequestName]
  }
}
