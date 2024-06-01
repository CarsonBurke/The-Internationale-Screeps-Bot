import { roundTo } from 'utils/utils'
import { CPUMaxPerTick, customColors, RoomMemoryKeys, RoomTypes } from '../constants/general'
import { RoomStatsKeys } from '../constants/stats'
import { LogOps, LogTypes } from 'utils/logOps'
import { CollectiveManager } from './collective'
import { remoteStatNames } from '../constants/stats'
import { averageStatNames } from '../constants/stats'
import { RoomStats } from 'types/stats'
import { CommuneStats } from 'types/stats'

export class StatsManager {
  static stats: {
    [roomType in RoomTypes.commune | RoomTypes.neutral]: {
      [roomName: string]: Partial<CommuneStats>
    }
  }

  private static roomConfig(roomName: string, roomType: number) {
    if (roomType === RoomTypes.commune) {
      const roomStats = (this.stats[RoomTypes.commune][roomName] = {
        [RoomStatsKeys.SpawnUsagePercentage]: 0,
        [RoomStatsKeys.EnergyInputHarvest]: 0,
        [RoomStatsKeys.CreepCount]: 0,
        [RoomStatsKeys.TotalCreepCount]: 0,
        [RoomStatsKeys.PowerCreepCount]: 0,
        [RoomStatsKeys.ControllerLevel]: 0,
        [RoomStatsKeys.EnergyStored]: 0,
        [RoomStatsKeys.BatteriesStoredTimes10]: 0,
        [RoomStatsKeys.MineralsHarvested]: 0,
        [RoomStatsKeys.EnergyInputBought]: 0,
        [RoomStatsKeys.EnergyOutputSold]: 0,
        [RoomStatsKeys.EnergyOutputUpgrade]: 0,
        [RoomStatsKeys.EnergyOutputBuild]: 0,
        [RoomStatsKeys.EnergyOutputRepairOther]: 0,
        [RoomStatsKeys.EnergyOutputRepairWallOrRampart]: 0,
        [RoomStatsKeys.EnergyOutputSpawn]: 0,
        [RoomStatsKeys.EnergyOutputPower]: 0,
        [RoomStatsKeys.RemoteCount]: 0,
        [RoomStatsKeys.RemoteEnergyStored]: 0,
        [RoomStatsKeys.RemoteEnergyInputHarvest]: 0,
        [RoomStatsKeys.RemoteEnergyOutputRepairOther]: 0,
        [RoomStatsKeys.RemoteEnergyOutputBuild]: 0,
        [RoomStatsKeys.MinHaulerCost]: 0,
        [RoomStatsKeys.EnergyOutputTransactionCosts]: 0,
        [RoomStatsKeys.EnergyTerminalSentDomestic]: 0,
        [RoomStatsKeys.EnergyTerminalReceivedDomestic]: 0,
        [RoomStatsKeys.EnergyTerminalSentOther]: 0,
        [RoomStatsKeys.CpuUsed]: 0,
      })

      if (Memory.stats.rooms[roomName]) return

      Memory.stats.rooms[roomName] = roomStats
      return
    }

    // Otherwise configure the remote

    this.stats[RoomTypes.neutral][roomName] = {
      [RoomStatsKeys.RemoteEnergyStored]: 0,
      [RoomStatsKeys.RemoteEnergyInputHarvest]: 0,
      [RoomStatsKeys.RemoteEnergyOutputRepairOther]: 0,
      [RoomStatsKeys.RemoteEnergyOutputBuild]: 0,
    }
  }

  static roomInitialRun(roomName: string, roomType: number) {
    this.roomConfig(roomName, roomType)
  }

  private static roomCommuneEndRun(roomName: string, forceUpdate: boolean = false) {
    const room = Game.rooms[roomName]
    const roomMemory = Memory.rooms[roomName]
    const interTickRoomStats = Memory.stats.rooms[roomName]
    const roomStats = this.stats[RoomTypes.commune][roomName] as CommuneStats

    const each250Ticks = Game.time % 250 === 0

    const remotes = roomMemory[RoomMemoryKeys.remotes]
    for (const remoteRoomName of remotes) {
      const remoteRoomStats = this.stats[RoomTypes.neutral][remoteRoomName]
      if (!remoteRoomStats) continue

      roomStats[RoomStatsKeys.RemoteCount] += 1
      roomStats[RoomStatsKeys.RemoteEnergyInputHarvest] +=
        remoteRoomStats[RoomStatsKeys.RemoteEnergyInputHarvest]
      roomStats[RoomStatsKeys.RemoteEnergyOutputRepairOther] +=
        remoteRoomStats[RoomStatsKeys.RemoteEnergyOutputRepairOther]
      roomStats[RoomStatsKeys.RemoteEnergyOutputBuild] +=
        remoteRoomStats[RoomStatsKeys.RemoteEnergyOutputBuild]

      if (each250Ticks) {
        roomStats[RoomStatsKeys.RemoteEnergyStored] += 0
      }
    }

    roomStats[RoomStatsKeys.CreepCount] = room.myCreeps.length
    roomStats[RoomStatsKeys.TotalCreepCount] = room.creepsFromRoomAmount
    roomStats[RoomStatsKeys.PowerCreepCount] = room.myPowerCreeps.length
    roomStats[RoomStatsKeys.MinHaulerCost] = roomMemory[RoomMemoryKeys.minHaulerCost]

    const spawns = room.roomManager.structures.spawn
    if (spawns.length > 0) {
      let spawningSpawnsCount = 0

      for (const spawn of spawns) {
        if (!spawn.spawning && !spawn.renewed) continue

        spawningSpawnsCount += 1
      }

      roomStats[RoomStatsKeys.SpawnUsagePercentage] = spawningSpawnsCount / spawns.length
    }

    if (room.controller && room.controller.my) {
      const progressPercentage = room.controller.progress / room.controller.progressTotal
      roomStats.cl =
        progressPercentage < 1 ? room.controller.level + progressPercentage : room.controller.level
    }

    /*         if (each250Ticks || forceUpdate) {
            const resourcesInStoringStructures = room.roomManager.resourcesInStoringStructures
            roomStats[RoomStatNamesEnum.EnergyStored] =
                (resourcesInStoringStructures.energy || 0) +
                (resourcesInStoringStructures.battery || 0) * 10
        } else {
            roomStats[RoomStatNamesEnum.EnergyStored] =
                interTickRoomStats[RoomStatNamesEnum.EnergyStored]
        } */
    const resourcesInStoringStructures = room.roomManager.resourcesInStoringStructures
    roomStats[RoomStatsKeys.EnergyStored] = resourcesInStoringStructures.energy || 0
    roomStats[RoomStatsKeys.BatteriesStoredTimes10] = resourcesInStoringStructures.battery * 10 || 0

    // delete legacy stat key value pairs

    for (const key in interTickRoomStats) {
      const statName = key as keyof CommuneStats
      if (roomStats[statName]) continue

      roomStats[statName] = undefined
    }

    // implement average tick stats into inter tick stats

    for (const key in roomStats) {
      const statName = key as keyof CommuneStats

      if (averageStatNames.has(statName)) {
        let globalValue = roomStats[statName] || 0
        let value = interTickRoomStats[statName] || 0

        interTickRoomStats[statName] = this.average(value, globalValue)
        continue
      }

      interTickRoomStats[statName] = roomStats[statName]
    }
  }
  static internationalConfig() {
    Memory.stats = {
      lastReset: global.lastReset,
      tickLength: 0,
      lastTick: Game.time,
      lastTickTimestamp: 0,
      resources: {
        pixels: 0,
        cpuUnlocks: 0,
        accessKeys: 0,
        credits: 0,
      },
      cpu: {
        bucket: 0,
        usage: Game.cpu.limit,
        limit: 0,
      },
      memory: {
        usage: 0,
        limit: 2097,
      },
      heapUsage: 0,
      gcl: {
        level: 0,
        progress: 0,
        progressTotal: 0,
      },
      gpl: {
        level: 0,
        progress: 0,
        progressTotal: 0,
      },
      rooms: {},
      constructionSites: 0,
      creeps: 0,
      powerCreeps: 0,
    }

    this.stats = { [RoomTypes.commune]: {}, [RoomTypes.neutral]: {} }
    this.internationalEndRun()
  }

  static tickInit() {
    this.stats = { [RoomTypes.commune]: {}, [RoomTypes.neutral]: {} }
  }

  static internationalEndRun() {
    // Run communes one last time to update stats

    for (const roomName in Memory.stats.rooms) {
      if (!this.stats[RoomTypes.commune][roomName]) {
        Memory.stats.rooms[roomName] = undefined
        continue
      }

      this.roomCommuneEndRun(roomName)
    }

    const timestamp = Date.now()

    global.lastReset = (global.lastReset || 0) + 1
    Memory.stats.lastReset = global.lastReset
    Memory.stats.tickLength = timestamp - Memory.stats.lastTickTimestamp
    Memory.stats.lastTickTimestamp = timestamp
    Memory.stats.constructionSites = CollectiveManager.constructionSiteCount || 0

    Memory.stats.resources = {
      pixels: Game.resources[PIXEL],
      cpuUnlocks: Game.resources[CPU_UNLOCK],
      accessKeys: Game.resources[ACCESS_KEY],
      credits: Game.market.credits,
    }

    Memory.stats.memory.usage = roundTo(
      Math.floor(RawMemory.get().length / 1000) / Memory.stats.memory.limit,
      8,
    )

    const heapStatistics = Game.cpu.getHeapStatistics()
    Memory.stats.heapUsage = roundTo(
      (heapStatistics.total_heap_size + heapStatistics.externally_allocated_size) /
        heapStatistics.heap_size_limit,
      2,
    )
    Memory.stats.gcl = {
      progress: Game.gcl.progress,
      progressTotal: Game.gcl.progressTotal,
      level: Game.gcl.level,
    }
    Memory.stats.gpl = {
      progress: Game.gpl.progress,
      progressTotal: Game.gpl.progressTotal,
      level: Game.gpl.level,
    }
    Memory.stats.creeps = CollectiveManager.creepCount
    Memory.stats.powerCreeps = CollectiveManager.powerCreepCount
    Memory.stats.defaultMinPathCacheTime = CollectiveManager.defaultMinPathCacheTime

    // If the code wasn't ran or was properly ran last tick, assign cpu as normal. Otherwise assume we ran out of cpu
    let usedCPU =
      Memory.stats.lastTick + 1 >= Game.time
        ? Game.cpu.getUsed()
        : // limit * time step from last stats recording
          Game.cpu.limit * (Game.time - Memory.stats.lastTick)
    /* LogOps.LogOps'STATS' + (Game.time - Memory.stats.lastTick), usedCPU) */
    Memory.stats.cpu = {
      bucket: Game.cpu.bucket,
      limit: Game.cpu.limit,
      usage: this.averageMarginalTimeStep(Memory.stats.cpu.usage, usedCPU),
    }

    // Make sure this runs last
    Memory.stats.lastTick = Game.time

    this.stats = undefined
  }

  private static average(
    avg: number,
    dataPoint: number,
    averagedOverTickCount: number = 1000,
    precision: number = 8,
  ) {
    if (!avg) avg = 0
    if (!dataPoint) dataPoint = 0

    // time step from last stats recording
    const timeStep = Game.time - Memory.stats.lastTick

    avg -= (avg / averagedOverTickCount) * timeStep
    avg += dataPoint / timeStep / averagedOverTickCount

    return roundTo(avg, precision)
  }

  /**
   * average but don't account for time skips
   */
  private static averageMarginalTimeStep(
    avg: number,
    dataPoint: number,
    averagedOverTickCount: number = 1000,
    precision: number = 8,
  ) {
    if (!avg) avg = 0
    if (!dataPoint) dataPoint = 0

    avg -= avg / averagedOverTickCount
    avg += dataPoint / averagedOverTickCount

    return roundTo(avg, precision)
  }

  static updateStat(
    roomName: string,
    statName: keyof RoomStats | keyof CommuneStats,
    value: number,
  ) {
    if (this.stats[RoomTypes.commune][roomName]) {
      this.updateCommuneStat(roomName, statName as keyof CommuneStats, value)
      return
    }

    if (this.stats[RoomTypes.neutral][roomName]) {
      if (remoteStatNames.has(statName)) {
        statName = ('r' + statName) as keyof RoomStats
      }

      this.updateRemoteStat(roomName, statName, value)
    }
  }

  static updateCommuneStat(roomName: string, statName: keyof CommuneStats, value: number) {
    this.stats[RoomTypes.commune][roomName][statName] += value
  }

  static updateRemoteStat(
    roomName: string,
    statName: keyof RoomStats | keyof CommuneStats,
    value: number,
  ) {
    this.stats[RoomTypes.neutral][roomName][statName] += value
  }
}

export const statsManager = new StatsManager()
