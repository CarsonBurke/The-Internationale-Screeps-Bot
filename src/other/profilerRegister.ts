import { CommuneManager } from 'room/commune/commune'
import { profiler } from './profiler'
import { RoomManager } from 'room/room'
import { SpawnRequestsManager } from 'room/commune/spawning/spawnRequests'
import { LabManager } from 'room/commune/labs'
import { FactoryManager } from 'room/commune/factory'
import { StatsManager } from 'international/stats'
import { ConstructionManager } from 'room/construction/construction'
import { RemotesManager } from 'room/commune/remotesManager'
import { HaulRequestManager } from 'room/commune/haulRequestManager'
import { Quad } from 'room/creeps/roleManagers/antifa/quad'
import { DynamicSquad } from 'room/creeps/roleManagers/antifa/dynamicSquad'
import { Duo } from 'room/creeps/roleManagers/antifa/duo'
import { originalLoop } from 'main'
import { creepClasses } from 'room/creeps/creepClasses'
import { Utils } from 'utils/utils'
import { CreepOrganizer } from 'international/creepOrganizer'
import { RequestsManager } from 'international/requests'
import { SimpleAllies } from 'international/simpleAllies/simpleAllies'
import { PlayerManager } from 'international/players'
import { FlagManager } from 'international/flags/flags'
import { RoomNameUtils } from 'room/roomNameUtils'
import { CreepUtils } from 'room/creeps/creepUtils'
import { TradingUtils } from 'room/commune/terminal/tradingUtils'
import { CollectiveManager } from 'international/collective'
import { MarketManager } from 'international/market/marketOrders'
import { GarbageCollector } from 'international/garbageCollector'
import { EndTickManager } from 'international/endTick'
import { PowerCreepOrganizer } from 'international/powerCreepOrganizer'
import { LinkManager } from 'room/commune/links'
import { CombatRequestManager } from 'room/commune/combatRequest'
import { MapVisualsManager } from 'international/mapVisuals'
import { MigrationManager } from 'international/migration'
import { RoomPruningManager } from 'international/roomPruning'
import { RoomVisualsManager } from 'room/roomVisuals'
import { ErrorExporter } from './errorExporter'
import { RespawnManager } from 'international/respawn'
import { BasePlans } from 'room/construction/basePlans'
import { RampartPlans } from 'room/construction/rampartPlans'
import { Operator } from 'room/creeps/powerCreeps/operator'
import { minCutToExit } from 'room/construction/minCut'
import { FeatureFlagManager } from 'international/flags/featureFlags'
import { ConstructionSiteManager } from 'international/constructionSites'
import { TransactionsManager } from 'international/transactions'
import { CommunePlanner } from 'room/construction/communePlanner'
import {
  packBasePlanCoord,
  packCoord,
  packCoordList,
  packId,
  packIdList,
  packPos,
  packPosList,
  packRampartPlanCoord,
  packRoomName,
  packStampAnchors,
  packXYAsCoord,
  packXYAsPos,
  reversePosList,
  unpackBasePlanCoords,
  unpackCoord,
  unpackCoordAsPos,
  unpackCoordList,
  unpackCoordListAsPosList,
  unpackId,
  unpackIdList,
  unpackPos,
  unpackPosAt,
  unpackPosList,
  unpackRampartPlanCoord,
  unpackRoomName,
  unpackStampAnchors,
} from './codec'
import { CustomPathFinder } from 'international/customPathFinder'
import { RoomUtils } from 'room/roomUtils'
import { CommuneUtils } from 'room/commune/communeUtils'
import { RoomDataOps } from 'room/roomData'
import { CommuneDataOps } from 'room/commune/communeData'
import { MyCreepUtils } from 'room/creeps/myCreepUtils'
import { CreepMoveProcs } from 'room/creeps/creepMoveProcs'
import { CommuneOps } from 'room/commune/communeOps'
import { PowerCreepProcs } from 'room/creeps/powerCreeps/powerCreepProcs'
import { PowerCreepUtils } from 'room/creeps/powerCreeps/powerCreepUtils'
import { CreepOps } from 'room/creeps/creepOps'
import { Procs } from 'utils/procs'
import { RoomObjectUtils } from 'room/roomObjectUtils'
import { StructureUtils } from 'room/structureUtils'
import { RemoteProcs } from 'room/remoteProcs'
import { RemoteUtils } from 'room/remoteUtils'
import { LogisticsProcs } from 'room/logisticsProcs'
import { LogisticsUtils } from 'room/logisticsUtils'
import { TowerProcs } from 'room/commune/towerProcs'
import { TowerUtils } from 'room/commune/towerUtils'
import { SourceProcs } from 'room/sourceProcs'
import { SourceUtils } from 'room/sourceUtils'
import { TerminalProcs } from 'room/commune/terminal/terminalProcs'
import { SpawningStructureOps } from 'room/commune/spawning/spawningStructureOps'
import { NukerProcs } from 'room/commune/nukerProcs'
import { ObserverProcs } from 'room/commune/observerProcs'
import { PowerSpawnProcs } from 'room/commune/powerSpawnProcs'
import { RoomOps } from 'room/roomOps'
import { SegmentsManager } from 'international/segments'
import { wasm } from './wasmInit'
import { initSync } from '../wasm/pkg/commiebot_wasm.js'
import { InitManager } from 'international/init'
import { TickInit } from 'international/tickInit'
import { DebugUtils } from 'debug/debugUtils'
import { DefenceProcs } from 'room/commune/defenceProcs'
import { DefenceUtils } from 'room/commune/defenceUtils'
import { HaulerOps } from 'room/creeps/roles/haulerOps'
import { HaulerServices } from 'room/creeps/roles/haulerServices'
import { MyCreepProcs } from 'room/creeps/myCreepProcs'
import { RoomServices } from 'room/roomServices'
import { HaulerNeedOps } from 'room/commune/haulerNeedOps'
import { MyCreepServices } from 'room/creeps/myCreepServices'
import { MyPowerCreepServices } from 'room/creeps/myPowerCreepServices'
import { WorkRequestOps } from 'room/commune/workRequest'

export function profilerRegister() {
  // Classes

  profiler.registerClass(InitManager, 'InitManager')
  profiler.registerClass(TickInit, 'TickInit')
  profiler.registerClass(CollectiveManager, 'CollectiveManager')
  profiler.registerClass(StatsManager, 'StatsManager')
  profiler.registerClass(PlayerManager, 'PlayerManager')
  profiler.registerClass(RequestsManager, 'RequestsManager')
  profiler.registerClass(CreepOrganizer, 'CreepOrganizer')
  profiler.registerClass(PowerCreepOrganizer, 'PowerCreepOrganizer')
  profiler.registerClass(SimpleAllies, 'SimpleAllies')
  profiler.registerClass(FlagManager, 'FlagManager')
  profiler.registerClass(FeatureFlagManager, 'FeatureFlagManager')
  profiler.registerClass(MarketManager, 'MarketOrdersManager')
  profiler.registerClass(ConstructionSiteManager, 'ConstructionSiteManager')
  profiler.registerClass(TransactionsManager, 'TransactionsManager')
  profiler.registerClass(GarbageCollector, 'GarbageCollector')
  profiler.registerClass(EndTickManager, 'EndTickManager')
  profiler.registerClass(MapVisualsManager, 'MapVisualsManager')
  profiler.registerClass(MigrationManager, 'MigrationManager')
  profiler.registerClass(RoomPruningManager, 'RoomPruningManager')
  profiler.registerClass(ErrorExporter, 'ErrorExporter')
  profiler.registerClass(RespawnManager, 'RespawnManager')
  profiler.registerClass(BasePlans, 'BasePlans')
  profiler.registerClass(RampartPlans, 'RampartPlans')
  profiler.registerClass(CustomPathFinder, 'CustomPathFinder')
  profiler.registerClass(TradingUtils, 'MarketUtils')
  profiler.registerClass(Utils, 'Utils')
  profiler.registerClass(DebugUtils, 'DebugUtils')
  profiler.registerClass(Procs, 'Procs')
  profiler.registerClass(SegmentsManager, 'SegmentsManager')

  // Room classes

  profiler.registerClass(RoomServices, 'RoomServices')
  profiler.registerClass(CommuneManager, 'CommuneManager')
  profiler.registerClass(RoomManager, 'RoomManager')
  profiler.registerClass(SpawnRequestsManager, 'SpawnRequestsManager')
  profiler.registerClass(LabManager, 'LabManager')
  profiler.registerClass(FactoryManager, 'FactoryManager')
  profiler.registerClass(CommunePlanner, 'CommunePlanner')
  profiler.registerClass(ConstructionManager, 'ConstructionManager')
  profiler.registerClass(RemotesManager, 'RemotesManager')
  profiler.registerClass(HaulRequestManager, 'HaulRequestManager')
  profiler.registerClass(LinkManager, 'LinkManager')
  profiler.registerClass(DefenceProcs, 'DefenceProcs')
  profiler.registerClass(DefenceUtils, 'DefenceUtils')
  profiler.registerClass(CombatRequestManager, 'CombatRequestManager')
  profiler.registerClass(RoomVisualsManager, 'RoomVisualsManager')
  profiler.registerClass(Operator, 'Operator')
  profiler.registerClass(RoomNameUtils, 'RoomNameUtils')
  profiler.registerClass(RoomUtils, 'RoomUtils')
  profiler.registerClass(RoomOps, 'RoomProcs')
  profiler.registerClass(CommuneUtils, 'CommuneUtils')
  profiler.registerClass(RoomDataOps, 'RoomDataProcs')
  profiler.registerClass(CommuneDataOps, 'CommuneDataProcs')
  profiler.registerClass(CommuneOps, 'CommuneProc')
  profiler.registerClass(RoomObjectUtils, 'RoomObjectUtils')
  profiler.registerClass(StructureUtils, 'StructureUtils')
  profiler.registerClass(RemoteProcs, 'RemoteProcs')
  profiler.registerClass(RemoteUtils, 'RemoteUtils')
  profiler.registerClass(LogisticsProcs, 'LogisticsProcs')
  profiler.registerClass(LogisticsUtils, 'LogisticsUtils')
  profiler.registerClass(TowerProcs, 'TowerProcs')
  profiler.registerClass(TowerUtils, 'TowerUtils')
  profiler.registerClass(SourceProcs, 'SourceProcs')
  profiler.registerClass(SourceUtils, 'SourceUtils')
  profiler.registerClass(TerminalProcs, 'TerminalProcs')
  profiler.registerClass(SpawningStructureOps, 'SpawningStructureOps')
  profiler.registerClass(NukerProcs, 'NukerProcs')
  profiler.registerClass(ObserverProcs, 'ObserverProcs')
  profiler.registerClass(PowerSpawnProcs, 'PowerSpawnProcs')
  profiler.registerClass(HaulerNeedOps, 'HaulerNeedOps')
  profiler.registerClass(WorkRequestOps, "WorkRequestOps")

  // Creep classes

  profiler.registerClass(MyCreepServices, 'MyCreepServices')
  profiler.registerClass(CreepOps, 'CreepProcs')
  profiler.registerClass(CreepMoveProcs, 'CreepMoveProcs')
  profiler.registerClass(CreepUtils, 'CreepUtils')
  profiler.registerClass(MyCreepProcs, 'MyCreepProcs')
  profiler.registerClass(MyCreepUtils, 'MyCreepUtils')

  profiler.registerClass(Quad, 'Quad')
  profiler.registerClass(DynamicSquad, 'DynamicSquad')
  profiler.registerClass(Duo, 'Duo')

  profiler.registerClass(MyPowerCreepServices, 'MyPowerCreepServices')
  profiler.registerClass(PowerCreepProcs, 'PowerCreepProcs')
  profiler.registerClass(PowerCreepUtils, 'PowerCreepUtils')

  // Creep Roles

  profiler.registerClass(HaulerServices, 'HaulerServices')
  profiler.registerClass(HaulerOps, 'HaulerOps')

  // Objects

  profiler.registerObject(DebugUtils, 'DebugUtils')

  // Room objects

  // Functions

  profiler.registerFN(originalLoop, 'loop')
  profiler.registerFN(wasm.collaborator, 'wasm.collaborator')
  profiler.registerFN(initSync, 'wasm.initSync')

  // codec functions

  profiler.registerFN(packId, 'packId')
  profiler.registerFN(unpackId, 'unpackId')
  profiler.registerFN(packIdList, 'packIdList')
  profiler.registerFN(unpackIdList, 'unpackIdList')
  profiler.registerFN(packCoord, 'packCoord')
  profiler.registerFN(packXYAsCoord, 'packXYAsCoord')
  profiler.registerFN(unpackCoord, 'unpackCoord')
  profiler.registerFN(unpackCoordAsPos, 'unpackCoordAsPos')
  profiler.registerFN(reversePosList, 'reversePosList')
  profiler.registerFN(packCoordList, 'packCoordList')
  profiler.registerFN(unpackCoordList, 'unpackCoordList')
  profiler.registerFN(unpackCoordListAsPosList, 'unpackCoordListAsPosList')
  profiler.registerFN(packRoomName, 'packRoomName')
  profiler.registerFN(unpackRoomName, 'unpackRoomName')
  profiler.registerFN(packPos, 'packPos')
  profiler.registerFN(packXYAsPos, 'packXYAsPos')
  profiler.registerFN(unpackPos, 'unpackPos')
  profiler.registerFN(packPosList, 'packPosList')
  profiler.registerFN(unpackPosList, 'unpackPosList')
  profiler.registerFN(unpackPosAt, 'unpackPosAt')
  profiler.registerFN(packBasePlanCoord, 'packBasePlanCoord')
  profiler.registerFN(unpackBasePlanCoords, 'unpackBasePlanCoords')
  profiler.registerFN(packRampartPlanCoord, 'packRampartPlanCoord')
  profiler.registerFN(unpackRampartPlanCoord, 'unpackRampartPlanCoord')
  profiler.registerFN(packStampAnchors, 'packStampAnchors')
  profiler.registerFN(unpackStampAnchors, 'unpackStampAnchors')

  // Room functions

  profiler.registerFN(minCutToExit, 'minCutToExit')

  // conditional or complicated

  if (global.userScript) profiler.registerFN(global.userScript, 'userScript')
  if (global.collectivizer) profiler.registerClass(global.collectivizer, 'collectivizer')

  for (const creepClass of new Set(Object.values(creepClasses))) {
    profiler.registerClass(creepClass, creepClass.toString().match(/ (\w+)/)[1])
  }
}
