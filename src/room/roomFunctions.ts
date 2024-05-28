import {
  CombatRequestKeys,
  maxRampartGroupSize,
  maxRemoteRoomDistance,
  customColors,
  PlayerMemoryKeys,
  roomDimensions,
  constantRoomTypes,
  defaultStructureTypesByBuildPriority,
  Result,
  RoomMemoryKeys,
  RoomTypes,
  packedPosLength,
  maxRemotePathDistance,
  RoomLogisticsRequestTypes,
  RemoteResourcePathTypes,
  FlagNames,
  RoomStatusKeys,
  packedCoordLength,
} from '../constants/general'
import {
  findAdjacentCoordsToCoord,
  findCoordsInsideRect,
  findObjectWithID,
  packAsNum,
  packXYAsNum,
  unpackNumAsCoord,
  doesCoordExist,
  findClosestObject,
  randomIntRange,
  roundTo,
} from 'utils/utils'
import { CollectiveManager } from 'international/collective'
import { packCoord, packCoordList, packXYAsCoord, unpackPosList } from 'other/codec'
import { PlayerManager } from 'international/players'
import { RoomNameUtils } from './roomNameUtils'
import { LogOps } from 'utils/logOps'
import { RoomObjectUtils } from './roomObjectUtils'
import { RoomOps } from './roomOps'

/**
    @param pos1 pos of the object performing the action
    @param pos2 pos of the object getting acted on
    @param [type] The status of action performed
*/
Room.prototype.actionVisual = function (pos1, pos2, type?) {
  const room = this

  // Stop if roomVisuals are disabled

  if (!Game.flags[FlagNames.roomVisuals]) return

  // Construct colors for each type

  const colorsForTypes: { [key: string]: string } = {
    success: customColors.lightBlue,
    fail: customColors.red,
  }

  // If no type, type is success. Construct type from color

  if (!type) type = 'success'
  const color: string = colorsForTypes[type]

  // Create visuals

  room.visual.circle(pos2.x, pos2.y, { stroke: color })
  room.visual.line(pos1, pos2, { color })
}

Room.prototype.targetVisual = function (
  coord1,
  coord2,
  visualize = !!Game.flags[FlagNames.roomVisuals],
) {
  if (!visualize) return

  this.visual.line(coord1.x, coord1.y, coord2.x, coord2.y, {
    color: customColors.green,
    opacity: 0.3,
  })

  const x1 = coord1.x
  const y1 = coord1.y
  const x2 = coord2.x
  const y2 = coord2.y
  const point1x = (x1 + 3 * x2) / 4 + (y1 - y2) / 8
  const point1y = (y1 + 3 * y2) / 4 + (x2 - x1) / 8
  const point1: [number, number] = [point1x, point1y]
  const point2x = (x1 + 3 * x2) / 4 + (-y1 + y2) / 8
  const point2y = (y1 + 3 * y2) / 4 + (-x2 + x1) / 8
  const point2: [number, number] = [point2x, point2y]

  this.visual.poly([[coord2.x, coord2.y], point1, point2, [coord2.x, coord2.y]], {
    fill: customColors.green,
    stroke: customColors.green,
    opacity: 0.5,
    strokeWidth: 0.05,
  })
}

Room.prototype.scoutRemote = function (scoutingRoom) {
  if (this.scoutEnemyReservedRemote()) return this.memory[RoomMemoryKeys.type]
  if (this.scoutEnemyUnreservedRemote()) return this.memory[RoomMemoryKeys.type]

  if (!scoutingRoom) return this.memory[RoomMemoryKeys.type]
  return this.scoutMyRemote(scoutingRoom)
}

Room.prototype.scoutEnemyReservedRemote = function () {
  const { controller } = this

  if (!controller.reservation) return false
  if (controller.reservation.username === Memory.me) return false
  if (controller.reservation.username === 'Invader') return false

  // If there are roads or containers or sources harvested, inform false

  if (
    !this.roomManager.structures.road &&
    !this.roomManager.structures.container &&
    !RoomOps.getSources(this).find(source => source.ticksToRegeneration > 0)
  ) {
    return false
  }

  // If the controller is not reserved by an ally

  if (!global.settings.allies.includes(controller.reservation.username)) {
    this.memory[RoomMemoryKeys.owner] = controller.reservation.username
    return (this.memory[RoomMemoryKeys.type] = RoomTypes.enemyRemote)
  }

  // Otherwise if the room is reserved by an ally

  this.memory[RoomMemoryKeys.owner] = controller.reservation.username
  return (this.memory[RoomMemoryKeys.type] = RoomTypes.allyRemote)
}

Room.prototype.scoutEnemyUnreservedRemote = function () {
  const { controller } = this

  if (controller.reservation) {
    if (controller.reservation.username === Memory.me) return false
    if (controller.reservation.username === 'Invader') return false
  }

  const harvestedSources = RoomOps.getSources(this).find(source => source.ticksToRegeneration > 0)
  if (!harvestedSources) return false

  // Find creeps that I don't own that aren't invaders

  const creepsNotMine = this.roomManager.notMyCreeps.enemy.concat(this.roomManager.notMyCreeps.ally)

  // Iterate through them

  for (const creep of creepsNotMine) {
    // If the creep is an invdader, iterate

    if (creep.owner.username === 'Invader') continue

    // If the creep has work parts

    if (creep.parts.work > 0) {
      // If the creep is owned by an ally

      if (global.settings.allies.includes(creep.owner.username)) {
        // Set type to allyRemote and stop

        this.memory[RoomMemoryKeys.owner] = creep.owner.username
        return (this.memory[RoomMemoryKeys.type] = RoomTypes.allyRemote)
      }

      // If the creep is not owned by an ally

      // Set type to enemyRemote and stop

      this.memory[RoomMemoryKeys.owner] = creep.owner.username

      /* room.createAttackCombatRequest() */
      this.createHarassCombatRequest()

      return (this.memory[RoomMemoryKeys.type] = RoomTypes.enemyRemote)
    }
  }

  return false
}

Room.prototype.scoutMyRemote = function (scoutingRoom) {
  const roomMemory = Memory.rooms[this.name]

  // The room is a remote but its commune no longer exists, change to neutral

  if (
    roomMemory[RoomMemoryKeys.type] === RoomTypes.remote &&
    !CollectiveManager.communes.has(roomMemory[RoomMemoryKeys.commune])
  )
    roomMemory[RoomMemoryKeys.type] = RoomTypes.neutral

  // If the room is already a remote of the scoutingRoom

  if (
    roomMemory[RoomMemoryKeys.type] === RoomTypes.remote &&
    scoutingRoom.name === roomMemory[RoomMemoryKeys.commune]
  )
    return roomMemory[RoomMemoryKeys.type]

  let distance = Game.map.getRoomLinearDistance(scoutingRoom.name, this.name)

  if (distance > maxRemoteRoomDistance) return roomMemory[RoomMemoryKeys.type]

  // Find distance from scoutingRoom

  if (distance <= maxRemoteRoomDistance)
    distance = RoomNameUtils.advancedFindDistance(scoutingRoom.name, this.name, {
      typeWeights: {
        keeper: Infinity,
        enemy: Infinity,
        enemyRemote: Infinity,
        ally: Infinity,
        allyRemote: Infinity,
      },
    })

  if (distance > maxRemoteRoomDistance) return roomMemory[RoomMemoryKeys.type]

  // Get the anchor from the scoutingRoom, stopping if it's undefined

  const anchor = scoutingRoom.roomManager.anchor
  if (!anchor) return roomMemory[RoomMemoryKeys.type]
  /*
    const newSourceEfficacies = []
    let newSourceEfficaciesTotal = 0

    // Get base planning data

    // loop through sourceNames

    for (const source of this.find(FIND_SOURCES)) {
        const path = CustomPathFinder.findPath({
            origin: source.pos,
            goals: [{ pos: anchor, range: 4 }],
            typeWeights: {
                [RoomTypes.enemy]: Infinity,
                [RoomTypes.ally]: Infinity,
                [RoomTypes.keeper]: Infinity,
                [RoomTypes.enemyRemote]: Infinity,
                [RoomTypes.allyRemote]: Infinity,
            },
            plainCost: defaultPlainCost,
            weightStructurePlans: true,
        })

        if (!path.length) return roomMemory[RoomMemoryKeys.type]

        // Stop if there is a source inefficient enough

        if (path.length > 300) return roomMemory[RoomMemoryKeys.type]

        let newSourceEfficacy = 0

        for (const pos of path) {
            newSourceEfficacy +=
                CollectiveManager.getTerrainBinary(pos.roomName)[packAsNum(pos)] ===
                TERRAIN_MASK_SWAMP
                    ? defaultSwampCost
                    : 1
        }

        newSourceEfficacies.push(newSourceEfficacy)
        newSourceEfficaciesTotal += newSourceEfficacy
    }

    const newReservationEfficacy = CustomPathFinder.findPath({
        origin: this.controller.pos,
        goals: [{ pos: anchor, range: 4 }],
        typeWeights: {
            [RoomTypes.enemy]: Infinity,
            [RoomTypes.ally]: Infinity,
            [RoomTypes.keeper]: Infinity,
            [RoomTypes.enemyRemote]: Infinity,
            [RoomTypes.allyRemote]: Infinity,
        },
    }).length

    if (!newReservationEfficacy) return roomMemory[RoomMemoryKeys.type]
 */
  // If already a remote, apply special considerations

  if (roomMemory[RoomMemoryKeys.type] === RoomTypes.remote) {
    // Generate new important positions

    let disable: boolean
    let newCost = 0
    const pathsThrough = new Set<string>()

    const packedRemoteSources = this.roomManager.findRemoteSources(scoutingRoom)
    const packedRemoteSourceHarvestPositions = this.roomManager.findRemoteSourceHarvestPositions(
      scoutingRoom,
      packedRemoteSources,
    )
    const packedRemoteControllerPositions =
      this.roomManager.findRemoteControllerPositions(scoutingRoom)

    const weightCoords: { [packedCoord: string]: number } = {}

    for (const i in packedRemoteSources) {
      for (const pos of unpackPosList(packedRemoteSourceHarvestPositions[i])) {
        weightCoords[packCoord(pos)] = 20
      }
    }

    for (const pos of unpackPosList(packedRemoteControllerPositions)) {
      weightCoords[packCoord(pos)] = 20
    }

    const packedRemoteSourcePaths = {
      [RoomMemoryKeys.remoteSourceFastFillerPaths]:
        this.roomManager.findRemoteSourceFastFillerPaths(
          scoutingRoom,
          packedRemoteSourceHarvestPositions,
          weightCoords,
          pathsThrough,
        ),
      [RoomMemoryKeys.remoteSourceHubPaths]: this.roomManager.findRemoteSourceHubPaths(
        scoutingRoom,
        packedRemoteSourceHarvestPositions,
        weightCoords,
        pathsThrough,
      ),
    }

    for (const key in packedRemoteSourcePaths) {
      const pathName = key as unknown as RemoteResourcePathTypes
      const packedPath = packedRemoteSourcePaths[pathName]

      if (!packedPath.length) {
        disable = true
        break
      }
      const unpackedLength = packedPath.length / packedPosLength

      newCost += unpackedLength
      if (unpackedLength > maxRemotePathDistance) disable = true
    }

    const packedRemoteControllerPath = this.roomManager.findRemoteControllerPath(
      scoutingRoom,
      packedRemoteControllerPositions,
      weightCoords,
      pathsThrough,
    )
    if (!packedRemoteControllerPath.length) {
      disable = true
    }
    if (packedRemoteControllerPath.length / packedPosLength > maxRemotePathDistance) disable = true

    newCost += packedRemoteControllerPath.length / packedPosLength

    // Compare new, potential efficiency, to old efficiency

    let currentCost = 0
    for (const packedPath of roomMemory[RoomMemoryKeys.remoteSourceFastFillerPaths]) {
      currentCost += packedPath.length / packedPosLength
    }
    currentCost += roomMemory[RoomMemoryKeys.remoteControllerPath].length / packedPosLength

    if (newCost >= currentCost) {
      return roomMemory[RoomMemoryKeys.type]
    }

    // Successful remote value generation, now assign them

    // reconcile old data

    const oldCommuneMemory = Memory.rooms[roomMemory[RoomMemoryKeys.commune]]
    const index = oldCommuneMemory[RoomMemoryKeys.remotes].indexOf(this.name)
    oldCommuneMemory[RoomMemoryKeys.remotes].splice(index, 1)

    //

    roomMemory[RoomMemoryKeys.disable] = disable

    roomMemory[RoomMemoryKeys.remoteSources] = packedRemoteSources
    roomMemory[RoomMemoryKeys.remoteSourceHarvestPositions] = packedRemoteSourceHarvestPositions
    roomMemory[RoomMemoryKeys.remoteSourceFastFillerPaths] =
      packedRemoteSourcePaths[RoomMemoryKeys.remoteSourceFastFillerPaths]
    roomMemory[RoomMemoryKeys.remoteSourceHubPaths] =
      packedRemoteSourcePaths[RoomMemoryKeys.remoteSourceHubPaths]
    roomMemory[RoomMemoryKeys.remoteControllerPositions] = packedRemoteControllerPositions
    roomMemory[RoomMemoryKeys.remoteControllerPath] = packedRemoteControllerPath
    // No reason to have the room or commune in the list - would result is uneeded searches
    pathsThrough.delete(this.name)
    pathsThrough.delete(scoutingRoom.name)
    roomMemory[RoomMemoryKeys.pathsThrough] = Array.from(pathsThrough)

    roomMemory[RoomMemoryKeys.maxSourceIncome] = []
    roomMemory[RoomMemoryKeys.remoteSourceHarvesters] = []
    roomMemory[RoomMemoryKeys.haulers] = []
    roomMemory[RoomMemoryKeys.remoteSourceCredit] = []
    roomMemory[RoomMemoryKeys.hasContainer] = []
    roomMemory[RoomMemoryKeys.roads] = []
    roomMemory[RoomMemoryKeys.disableSources] = []

    for (const i in packedRemoteSources) {
      roomMemory[RoomMemoryKeys.remoteSourceCredit][i] = 0
      roomMemory[RoomMemoryKeys.hasContainer][i] = false
      roomMemory[RoomMemoryKeys.roads][i] = 0
    }
    roomMemory[RoomMemoryKeys.remoteSourceCreditChange] = []
    roomMemory[RoomMemoryKeys.remoteSourceCreditReservation] = []
    roomMemory[RoomMemoryKeys.remoteCoreAttacker] = 0
    roomMemory[RoomMemoryKeys.abandonRemote] = 0

    // Add the room's name to the scoutingRoom's remotes data
    RoomNameUtils.updateCreepsOfRemoteName(this.name, scoutingRoom.communeManager)

    Memory.rooms[scoutingRoom.name][RoomMemoryKeys.remotes].push(this.name)
    roomMemory[RoomMemoryKeys.commune] = scoutingRoom.name
    roomMemory[RoomMemoryKeys.type] = RoomTypes.remote

    RoomNameUtils.cleanMemory(this.name)

    return roomMemory[RoomMemoryKeys.type]
  }

  // The room is not a remote

  let disable: boolean

  // Generate new important positions
  const pathsThrough = new Set<string>()

  const packedRemoteSources = this.roomManager.findRemoteSources(scoutingRoom)
  const packedRemoteSourceHarvestPositions = this.roomManager.findRemoteSourceHarvestPositions(
    scoutingRoom,
    packedRemoteSources,
  )
  const packedRemoteControllerPositions =
    this.roomManager.findRemoteControllerPositions(scoutingRoom)

  const weightCoords: { [packedCoord: string]: number } = {}

  for (const i in packedRemoteSources) {
    for (const pos of unpackPosList(packedRemoteSourceHarvestPositions[i])) {
      weightCoords[packCoord(pos)] = 20
    }
  }

  for (const pos of unpackPosList(packedRemoteControllerPositions)) {
    weightCoords[packCoord(pos)] = 20
  }

  const packedRemoteSourcePaths = {
    [RoomMemoryKeys.remoteSourceFastFillerPaths]: this.roomManager.findRemoteSourceFastFillerPaths(
      scoutingRoom,
      packedRemoteSourceHarvestPositions,
      weightCoords,
      pathsThrough,
    ),
    [RoomMemoryKeys.remoteSourceHubPaths]: this.roomManager.findRemoteSourceHubPaths(
      scoutingRoom,
      packedRemoteSourceHarvestPositions,
      weightCoords,
      pathsThrough,
    ),
  }

  for (const key in packedRemoteSourcePaths) {
    const pathName = key as unknown as RemoteResourcePathTypes
    const packedPath = packedRemoteSourcePaths[pathName]

    if (!packedPath.length) {
      disable = true
      break
    }

    const unpackedLength = packedPath.length / packedPosLength
    if (unpackedLength > maxRemotePathDistance) disable = true
  }

  const packedRemoteControllerPath = this.roomManager.findRemoteControllerPath(
    scoutingRoom,
    packedRemoteControllerPositions,
    weightCoords,
    pathsThrough,
  )
  if (!packedRemoteControllerPath.length) {
    disable = true
  }
  if (packedRemoteControllerPath.length / packedPosLength > maxRemotePathDistance) disable = true

  /*
    roomMemory[RoomMemoryKeys.roads] = []
    roomMemory[RoomMemoryKeys.roadsQuota] = []

    let sourceIndex = 0
    for (const key in packedRemoteSourcePaths) {

        const pathName = key as unknown as RemoteResourcePathTypes
        const packedPath = packedRemoteSourcePaths[pathName]

        roomMemory[RoomMemoryKeys.roads][sourceIndex] = 0
        roomMemory[RoomMemoryKeys.roadsQuota][sourceIndex] = 0

        const path = unpackPosList(packedPath)

        for (const pos of path) {
            if (pos.roomName !== this.name) break

            roomMemory[RoomMemoryKeys.roadsQuota][sourceIndex] += 1
        }

        if (path.length > maxRemotePathDistance) disable = true
    }
 */
  // Accept remote as own

  roomMemory[RoomMemoryKeys.disable] = disable

  roomMemory[RoomMemoryKeys.remoteSources] = packedRemoteSources
  roomMemory[RoomMemoryKeys.remoteSourceHarvestPositions] = packedRemoteSourceHarvestPositions
  roomMemory[RoomMemoryKeys.remoteSourceFastFillerPaths] =
    packedRemoteSourcePaths[RoomMemoryKeys.remoteSourceFastFillerPaths]
  roomMemory[RoomMemoryKeys.remoteSourceHubPaths] =
    packedRemoteSourcePaths[RoomMemoryKeys.remoteSourceHubPaths]
  roomMemory[RoomMemoryKeys.remoteControllerPositions] = packedRemoteControllerPositions
  roomMemory[RoomMemoryKeys.remoteControllerPath] = packedRemoteControllerPath
  // No reason to have the room or commune in the list - would result is uneeded searches
  pathsThrough.delete(this.name)
  pathsThrough.delete(scoutingRoom.name)
  roomMemory[RoomMemoryKeys.pathsThrough] = Array.from(pathsThrough)

  roomMemory[RoomMemoryKeys.maxSourceIncome] = []
  roomMemory[RoomMemoryKeys.remoteSourceHarvesters] = []
  roomMemory[RoomMemoryKeys.haulers] = []
  roomMemory[RoomMemoryKeys.remoteSourceCredit] = []
  roomMemory[RoomMemoryKeys.hasContainer] = []
  roomMemory[RoomMemoryKeys.roads] = []
  roomMemory[RoomMemoryKeys.disableSources] = []

  for (const i in packedRemoteSources) {
    roomMemory[RoomMemoryKeys.remoteSourceCredit][i] = 0
    roomMemory[RoomMemoryKeys.hasContainer][i] = false
    roomMemory[RoomMemoryKeys.roads][i] = 0
  }
  roomMemory[RoomMemoryKeys.remoteSourceCreditChange] = []
  roomMemory[RoomMemoryKeys.remoteSourceCreditReservation] = []
  roomMemory[RoomMemoryKeys.remoteCoreAttacker] = 0
  roomMemory[RoomMemoryKeys.abandonRemote] = 0

  // Add the room's name to the scoutingRoom's remotes data
  RoomNameUtils.updateCreepsOfRemoteName(this.name, scoutingRoom.communeManager)

  Memory.rooms[scoutingRoom.name][RoomMemoryKeys.remotes].push(this.name)
  roomMemory[RoomMemoryKeys.commune] = scoutingRoom.name
  roomMemory[RoomMemoryKeys.type] = RoomTypes.remote

  RoomNameUtils.cleanMemory(this.name)

  return roomMemory[RoomMemoryKeys.type]
}

Room.prototype.scoutEnemyRoom = function () {
  const { controller } = this
  const playerName = controller.owner.username
  const roomMemory = this.memory

  let player = Memory.players[playerName]
  if (!player) {
    player = PlayerManager.initPlayer(playerName)
  }

  // General

  const level = controller.level
  roomMemory[RoomMemoryKeys.RCL] = level

  roomMemory[RoomMemoryKeys.powerEnabled] = controller.isPowerEnabled

  // Offensive threat

  let threat = 0

  threat += Math.pow(level, 2)

  threat += this.roomManager.structures.spawn.length * 50
  threat += this.roomManager.structures.nuker.length * 300
  threat += Math.pow(this.roomManager.structures.lab.length * 10000, 0.4)

  threat = Math.floor(threat)

  roomMemory[RoomMemoryKeys.offensiveThreat] = threat
  Memory.players[playerName][PlayerMemoryKeys.offensiveThreat] = Math.max(
    threat,
    player[PlayerMemoryKeys.offensiveThreat],
  )

  // Defensive threat

  threat = 0

  const energy = this.roomManager.resourcesInStoringStructures.energy

  roomMemory[RoomMemoryKeys.energy] = energy
  threat += Math.pow(energy, 0.5)

  const ramparts = this.roomManager.structures.rampart
  const avgRampartHits =
    ramparts.reduce((total, rampart) => total + rampart.hits, 0) / ramparts.length

  threat += Math.pow(avgRampartHits, 0.5)
  threat += this.roomManager.structures.spawn.length * 100
  threat += this.roomManager.structures.tower.length * 300
  threat += Math.pow(this.roomManager.structures.extension.length * 400, 0.8)

  const hasTerminal = this.terminal !== undefined

  if (hasTerminal) {
    threat += 800

    roomMemory[RoomMemoryKeys.terminal] = true
  }

  threat = Math.floor(threat)

  roomMemory[RoomMemoryKeys.defensiveStrength] = threat
  Memory.players[playerName][PlayerMemoryKeys.defensiveStrength] = Math.max(
    threat,
    player[PlayerMemoryKeys.defensiveStrength],
  )

  // Combat request creation
  this.createAttackCombatRequest()

  roomMemory[RoomMemoryKeys.type] = RoomTypes.enemy
  return roomMemory[RoomMemoryKeys.type]
}

Room.prototype.createAttackCombatRequest = function (opts) {
  if (!global.settings.autoAttack) return
  if (this.controller && this.controller.safeMode) return

  let request = Memory.combatRequests[this.name]
  if (request) {
    if (request[CombatRequestKeys.type] !== 'attack') return

    if (!opts) return

    Object.assign(request, opts)
    return
  }

  if (global.settings.nonAggressionPlayers.includes(Memory.rooms[RoomMemoryKeys.owner])) return

  request = Memory.combatRequests[this.name] = {
    [CombatRequestKeys.type]: 'attack',
  }

  request[CombatRequestKeys.maxTowerDamage] = Math.ceil(
    this.roomManager.structures.tower.length * TOWER_POWER_ATTACK * 1.1,
  )

  request[CombatRequestKeys.minDamage] = 10
  request[CombatRequestKeys.minMeleeHeal] = 10
  request[CombatRequestKeys.minRangedHeal] = 10
  request[CombatRequestKeys.quadQuota] = 1

  if (opts) {
    Object.assign(request, opts)
    return
  }
}

Room.prototype.createHarassCombatRequest = function (opts) {
  if (!global.settings.autoAttack) return

  let request = Memory.combatRequests[this.name]
  if (request) {
    if (request[CombatRequestKeys.type] !== 'harass') return

    if (!opts) return

    Object.assign(request, opts)
    return
  }

  if (!this.roomManager.notMyCreeps.enemy.length) return
  if (global.settings.nonAggressionPlayers.includes(this.memory[RoomMemoryKeys.owner])) return
  if (this.roomManager.enemyAttackers.length > 0) return

  request = Memory.combatRequests[this.name] = {
    [CombatRequestKeys.type]: 'harass',
  }

  request[CombatRequestKeys.minDamage] = 10
  request[CombatRequestKeys.minMeleeHeal] = 10
  request[CombatRequestKeys.minRangedHeal] = 10

  if (opts) {
    Object.assign(request, opts)
    return
  }

  /*
    const structures = this[CreepMemoryKeys.structureTarget]s

    let totalHits = 0
    for (const structure of structures) totalHits += structure.hits

    if (structures.length > 0)
        request[CombatRequestKeys.dismantle] = Math.min(Math.ceil(totalHits / DISMANTLE_POWER / 5000), 20)
 */
}

Room.prototype.createDefendCombatRequest = function (opts) {
  let request = Memory.combatRequests[this.name]
  if (request) {
    if (request[CombatRequestKeys.type] !== 'defend') return

    if (!opts) return

    Object.assign(request, opts)
    return
  }

  request = Memory.combatRequests[this.name] = {
    [CombatRequestKeys.type]: 'defend',
  }

  request[CombatRequestKeys.inactionTimer] = 0
  request[CombatRequestKeys.inactionTimerMax] = randomIntRange(2000, 3000)

  const enemySquadData = this.roomManager.enemySquadData

  request[CombatRequestKeys.minRangedHeal] = Math.max(enemySquadData.highestRangedDamage, 1)
  request[CombatRequestKeys.minMeleeHeal] = Math.max(enemySquadData.highestMeleeDamage, 1)
  request[CombatRequestKeys.minDamage] = enemySquadData.highestHeal * 1.2

  if (opts) {
    Object.assign(request, opts)
    return
  }
}

Room.prototype.distanceTransform = function (
  initialCoords,
  visuals,
  minAvoid = 1,
  x1 = 0,
  y1 = 0,
  x2 = roomDimensions - 1,
  y2 = roomDimensions - 1,
) {
  // Use a costMatrix to record distances

  const distanceCoords = new Uint8Array(2500)

  let x
  let y
  let minX = Math.max(x1 - 1, 0)
  let minY = Math.max(y1 - 1, 0)
  let maxX = Math.min(x2 + 1, roomDimensions - 1)
  let maxY = Math.min(y2 + 1, roomDimensions - 1)
  let packedCoord

  for (x = minX; x <= maxX; x += 1) {
    for (y = minY; y <= maxY; y += 1) {
      packedCoord = packXYAsNum(x, y)
      distanceCoords[packedCoord] = initialCoords[packedCoord] >= minAvoid ? 0 : 255
    }
  }

  let top
  let left
  let topLeft
  let topRight
  let bottomLeft

  // Loop through the xs and ys inside the bounds

  for (x = x1; x <= x2; x += 1) {
    for (y = y1; y <= y2; y += 1) {
      top = distanceCoords[packXYAsNum(x, y - 1)] || 0
      left = distanceCoords[packXYAsNum(x - 1, y)] || 0
      topLeft = distanceCoords[packXYAsNum(x - 1, y - 1)] || 0
      topRight = distanceCoords[packXYAsNum(x + 1, y - 1)] || 0
      bottomLeft = distanceCoords[packXYAsNum(x - 1, y + 1)] || 0

      packedCoord = packXYAsNum(x, y)

      distanceCoords[packedCoord] = Math.min(
        Math.min(top, left, topLeft, topRight, bottomLeft) + 1,
        distanceCoords[packedCoord],
      )
    }
  }

  let bottom
  let right
  let bottomRight

  // Loop through the xs and ys inside the bounds

  for (x = x2; x >= x1; x -= 1) {
    for (y = y2; y >= y1; y -= 1) {
      bottom = distanceCoords[packXYAsNum(x, y + 1)] || 0
      right = distanceCoords[packXYAsNum(x + 1, y)] || 0
      bottomRight = distanceCoords[packXYAsNum(x + 1, y + 1)] || 0
      topRight = distanceCoords[packXYAsNum(x + 1, y - 1)] || 0
      bottomLeft = distanceCoords[packXYAsNum(x - 1, y + 1)] || 0

      packedCoord = packXYAsNum(x, y)

      distanceCoords[packedCoord] = Math.min(
        Math.min(bottom, right, bottomRight, topRight, bottomLeft) + 1,
        distanceCoords[packedCoord],
      )
    }
  }

  if (visuals) {
    // Loop through the xs and ys inside the bounds

    for (x = x1; x <= x2; x += 1) {
      for (y = y1; y <= y2; y += 1) {
        this.visual.rect(x - 0.5, y - 0.5, 1, 1, {
          fill: `hsl(${200}${distanceCoords[packXYAsNum(x, y)] * 10}, 100%, 60%)`,
          opacity: 0.4,
        })
        this.visual.text(distanceCoords[packXYAsNum(x, y)].toString(), x, y)
      }
    }
  }

  return distanceCoords
}

Room.prototype.diagonalDistanceTransform = function (
  initialCoords,
  visuals,
  minAvoid = 1,
  x1 = 0,
  y1 = 0,
  x2 = roomDimensions - 1,
  y2 = roomDimensions - 1,
) {
  // Use a costMatrix to record distances

  const distanceCoords = new Uint8Array(2500)

  let x
  let y
  let packedCoord

  for (x = x1; x <= x2; x += 1) {
    for (y = y1; y <= y2; y += 1) {
      packedCoord = packXYAsNum(x, y)
      distanceCoords[packedCoord] = initialCoords[packedCoord] >= minAvoid ? 0 : 255
    }
  }

  let top
  let left

  // Loop through the xs and ys inside the bounds

  for (x = x1; x <= x2; x += 1) {
    for (y = y1; y <= y2; y += 1) {
      top = distanceCoords[packXYAsNum(x, y - 1)] || 0
      left = distanceCoords[packXYAsNum(x - 1, y)] || 0

      packedCoord = packXYAsNum(x, y)

      distanceCoords[packedCoord] = Math.min(Math.min(top, left) + 1, distanceCoords[packedCoord])
    }
  }

  let bottom
  let right

  // Loop through the xs and ys inside the bounds

  for (x = x2; x >= x1; x -= 1) {
    for (y = y2; y >= y1; y -= 1) {
      bottom = distanceCoords[packXYAsNum(x, y + 1)] || 0
      right = distanceCoords[packXYAsNum(x + 1, y)] || 0

      packedCoord = packXYAsNum(x, y)

      distanceCoords[packedCoord] = Math.min(
        Math.min(bottom, right) + 1,
        distanceCoords[packedCoord],
      )
    }
  }

  if (visuals) {
    // Loop through the xs and ys inside the bounds

    for (x = x1; x <= x2; x += 1) {
      for (y = y1; y <= y2; y += 1) {
        this.visual.rect(x - 0.5, y - 0.5, 1, 1, {
          fill: `hsl(${200}${distanceCoords[packXYAsNum(x, y)] * 10}, 100%, 60%)`,
          opacity: 0.4,
        })
        this.visual.text(distanceCoords[packXYAsNum(x, y)].toString(), x, y)
      }
    }
  }

  return distanceCoords
}

Room.prototype.findClosestPos = function (opts) {
  // Construct a cost matrix for visited tiles and add seeds to it

  let visitedCoords = new Uint8Array(2500)

  // Record startPos as visited

  for (const coord of opts.sources) visitedCoords[packAsNum(coord)] = 1

  // Construct values for the check

  let thisGeneration = opts.sources
  let nextGeneration: Coord[] = []
  let depth = 0

  // So long as there are positions in this gen

  while (thisGeneration.length) {
    // Reset nextGeneration

    nextGeneration = []

    let localVisitedCoords = new Uint8Array(visitedCoords)

    // Flood cardinal directions, excluding impassibles

    if (opts.cardinalFlood) {
      // Iterate through positions of this gen

      for (const coord of thisGeneration) {
        // If the pos can be an anchor, inform it

        if (opts.targetCondition(coord)) return new RoomPosition(coord.x, coord.y, this.name)

        // Otherwise construct a rect and get the positions in a range of 1 (not diagonals)

        const adjacentCoords = [
          {
            x: coord.x - 1,
            y: coord.y,
          },
          {
            x: coord.x + 1,
            y: coord.y,
          },
          {
            x: coord.x,
            y: coord.y - 1,
          },
          {
            x: coord.x,
            y: coord.y + 1,
          },
        ]

        // Loop through adjacent positions

        for (const coord2 of adjacentCoords) {
          if (!doesCoordExist(coord2)) continue

          // Iterate if the adjacent pos has been visited or isn't a tile

          if (localVisitedCoords[packAsNum(coord2)] === 1) continue

          // Otherwise record that it has been visited

          localVisitedCoords[packAsNum(coord2)] = 1

          if (opts.coordMap[packAsNum(coord2)] === 255) continue

          // Add it tofastFillerSide the next gen

          nextGeneration.push(coord2)
        }
      }
    }

    // Flood all adjacent positions excluding diagonals

    if (!nextGeneration.length) {
      localVisitedCoords = new Uint8Array(visitedCoords)

      // Iterate through positions of this gen

      for (const coord of thisGeneration) {
        // If the pos can be an anchor, inform it

        if (opts.targetCondition(coord)) return new RoomPosition(coord.x, coord.y, this.name)

        // Otherwise construct a rect and get the positions in a range of 1 (not diagonals)

        const adjacentCoords = findCoordsInsideRect(
          coord.x - 1,
          coord.y - 1,
          coord.x + 1,
          coord.y + 1,
        )

        // Loop through adjacent positions

        for (const coord2 of adjacentCoords) {
          if (!doesCoordExist(coord2)) continue

          // Iterate if the adjacent pos has been visited or isn't a tile

          if (localVisitedCoords[packAsNum(coord2)] === 1) continue

          // Otherwise record that it has been visited

          localVisitedCoords[packAsNum(coord2)] = 1

          if (opts.coordMap[packAsNum(coord2)] === 255) continue

          // Add it tofastFillerSide the next gen

          nextGeneration.push(coord2)
        }
      }
    }

    // Flood all adjacent positions, including diagonals

    if (!nextGeneration.length) {
      localVisitedCoords = new Uint8Array(visitedCoords)

      // Iterate through positions of this gen

      for (const coord of thisGeneration) {
        // If the pos can be an anchor, inform it

        if (opts.targetCondition(coord)) return new RoomPosition(coord.x, coord.y, this.name)

        // Otherwise construct a rect and get the positions in a range of 1 (not diagonals)

        const adjacentCoords = findCoordsInsideRect(
          coord.x - 1,
          coord.y - 1,
          coord.x + 1,
          coord.y + 1,
        )
        // Loop through adjacent positions

        for (const coord2 of adjacentCoords) {
          if (!doesCoordExist(coord2)) continue

          // Iterate if the adjacent pos has been visited or isn't a tile

          if (localVisitedCoords[packAsNum(coord2)] === 1) continue

          // Otherwise record that it has been visited

          localVisitedCoords[packAsNum(coord2)] = 1

          // Add it tofastFillerSide the next gen

          nextGeneration.push(coord2)
        }
      }
    }

    if (opts.visuals) {
      for (const coord of nextGeneration) {
        this.visual.text(opts.coordMap[packAsNum(coord)].toString(), coord.x, coord.y, {
          font: 0.5,
          color: customColors.yellow,
        })

        this.visual.text(depth.toString(), coord.x, coord.y + 0.5, {
          font: 0.5,
          color: customColors.green,
        })
      }
    }

    // Set this gen to next gen

    visitedCoords = new Uint8Array(localVisitedCoords)
    thisGeneration = nextGeneration
    depth += 1
  }

  // Inform false if no value was found

  return false
}

Room.prototype.errorVisual = function (coord, visualize = !!Game.flags[FlagNames.roomVisuals]) {
  if (!visualize) return

  this.visual.circle(coord.x, coord.y, {
    fill: '',
    stroke: customColors.red,
    radius: 0.5,
    strokeWidth: 0.15,
    opacity: 0.3,
  })
}

Room.prototype.findAllyCSiteTargetID = function (creep) {
  // If there are no sites inform false

  if (!this.roomManager.notMyConstructionSites.ally.length) return false

  // Loop through structuretypes of the build priority

  for (const structureType of defaultStructureTypesByBuildPriority) {
    const cSitesOfType = this.roomManager.allyConstructionSitesByType[structureType]
    if (!cSitesOfType.length) continue

    // Otherwise get the anchor, using the creep's pos if undefined, or using the center of the room if there is no creep

    const anchor = this.roomManager.anchor || creep?.pos || new RoomPosition(25, 25, this.name)

    // Record the closest site to the anchor in the room's global and inform true

    this.memory[RoomMemoryKeys.constructionSiteTarget] = findClosestObject(anchor, cSitesOfType).id
    return true
  }

  // no target was found

  return false
}

Room.prototype.findUnprotectedCoords = function (visuals) {
  // Construct a cost matrix for the flood

  this.unprotectedCoords = new Uint8Array(2500)
  const visitedCoords = new Uint8Array(2500)

  // Construct values for the flood

  let depth = 0
  let thisGeneration: Coord[] = this.find(FIND_EXIT)
  let nextGeneration: Coord[] = []

  // Loop through positions of seeds

  for (const coord of thisGeneration) visitedCoords[packAsNum(coord)] = 1

  // So long as there are positions in this gen

  while (thisGeneration.length) {
    // Reset next gen

    nextGeneration = []

    // Iterate through positions of this gen

    for (const coord1 of thisGeneration) {
      // If the depth isn't 0

      if (depth > 0) {
        const packedCoord1 = packAsNum(coord1)

        // Iterate if the terrain is a wall

        if (this.rampartCoords[packedCoord1] > 0) continue

        // Otherwise so long as the pos isn't a wall record its depth in the flood cost matrix

        this.unprotectedCoords[packedCoord1] = depth * 10 + 10

        // If visuals are enabled, show the depth on the pos
        /*
                if (visuals)
                    this.visual.rect(coord1.x - 0.5, coord1.y - 0.5, 1, 1, {
                        fill: `hsl(${200}${depth * 2}, 100%, 60%)`,
                        opacity: 0.4,
                    })
                    this.visual.text(depth.toString(), coord1.x, coord1.y)
 */
      }

      // Loop through adjacent positions

      for (const coord2 of findCoordsInsideRect(
        coord1.x - 1,
        coord1.y - 1,
        coord1.x + 1,
        coord1.y + 1,
      )) {
        const packedCoord2 = packAsNum(coord2)

        // Iterate if the adjacent pos has been visited or isn't a tile

        if (visitedCoords[packedCoord2] === 1) continue

        // Otherwise record that it has been visited

        visitedCoords[packedCoord2] = 1

        // Add it to the next gen

        nextGeneration.push(coord2)
      }
    }

    // Set this gen to next gen

    thisGeneration = nextGeneration

    // Increment depth

    depth += 1
  }
}

Room.prototype.groupRampartPositions = function (rampartPositions) {
  const room = this

  // Construct a costMatrix to store visited positions

  const visitedCoords = new Uint8Array(2500)

  const groupedPositions = []
  let groupIndex = 0

  // Loop through each pos of positions

  for (const packedPos of rampartPositions) {
    const pos = unpackNumAsCoord(packedPos)

    // If the pos has already been visited, iterate

    if (visitedCoords[packAsNum(pos)] === 1) continue

    // Record that this pos has been visited

    visitedCoords[packAsNum(pos)] = 1

    // Construct the group for this index with the pos in it the group

    groupedPositions[groupIndex] = [new RoomPosition(pos.x, pos.y, room.name)]

    // Construct values for floodFilling

    let thisGeneration = [pos]
    let nextGeneration: Coord[] = []
    let groupSize = 0

    // So long as there are positions in this gen

    while (thisGeneration.length) {
      // Reset next gen

      nextGeneration = []

      // Iterate through positions of this gen

      for (const pos of thisGeneration) {
        // Loop through adjacent positions

        for (const adjacentPos of findAdjacentCoordsToCoord(pos)) {
          const packedAdjacentCoord = packAsNum(adjacentPos)

          // Iterate if the adjacent pos has been visited or isn't a tile

          if (visitedCoords[packedAdjacentCoord] === 1) continue

          // Otherwise record that it has been visited

          visitedCoords[packedAdjacentCoord] = 1

          // If a rampart is not planned for this position, iterate

          if (this.rampartCoords[packAsNum(adjacentPos)] !== 1) continue

          // Add it to the next gen and this group

          groupedPositions[groupIndex].push(
            new RoomPosition(adjacentPos.x, adjacentPos.y, room.name),
          )

          groupSize += 1
          nextGeneration.push(adjacentPos)
        }
      }

      if (groupSize >= maxRampartGroupSize) break

      // Set this gen to next gen

      thisGeneration = nextGeneration
    }

    // Increase the groupIndex

    groupIndex += 1
  }

  // Inform groupedPositions

  return groupedPositions
}

Room.prototype.findPositionsInsideRect = function (x1, y1, x2, y2) {
  // Construct positions

  const positions = []

  // Loop through coordinates inside the rect

  for (let x = x1; x <= x2; x += 1) {
    for (let y = y1; y <= y2; y += 1) {
      // Iterate if the pos doesn't map onto a room

      if (x < 0 || x >= roomDimensions || y < 0 || y >= roomDimensions) continue

      // Otherwise ass the x and y to positions

      positions.push(new RoomPosition(x, y, this.name))
    }
  }

  // Inform positions

  return positions
}

Room.prototype.findAdjacentPositions = function (rx, ry) {
  // Construct positions

  const positions = []

  // Loop through coordinates inside the rect

  for (let x = rx - 1; x <= rx + 1; x += 1) {
    for (let y = ry - 1; y <= ry + 1; y += 1) {
      if (x === rx && y === ry) continue

      // Iterate if the pos doesn't map onto a room

      if (x < 0 || x >= roomDimensions || y < 0 || y >= roomDimensions) continue

      // Otherwise ass the x and y to positions

      positions.push(new RoomPosition(x, y, this.name))
    }
  }

  // Inform positions

  return positions
}

Room.prototype.createWorkRequest = function () {
  const roomMemory = Memory.rooms[this.name]
  const packedSourceCoords = roomMemory[RoomMemoryKeys.sourceCoords]

  if (!packedSourceCoords) return false
  if (packedSourceCoords.length / packedCoordLength < 2) return false
  if (Memory.workRequests[this.name]) return false

  RoomNameUtils.findDynamicScore(this.name)

  const communePlanned = roomMemory[RoomMemoryKeys.communePlanned]
  if (communePlanned !== undefined) return false

  if (communePlanned !== Result.success) {
    const result = this.roomManager.communePlanner.attemptPlan(this)
    if (result === Result.fail) {
      roomMemory[RoomMemoryKeys.communePlanned] = Result.fail
      return false
    }

    if (result !== Result.success) {
      return false
    }
  }

  const request = (Memory.workRequests[this.name] = {})

  return true
}

Room.prototype.findSwampPlainsRatio = function () {
  const terrainAmounts = [0, 0, 0]

  const terrain = this.getTerrain()

  for (let x = 0; x < roomDimensions; x += 1) {
    for (let y = 0; y < roomDimensions; y += 1) {
      terrainAmounts[terrain.get(x, y)] += 1
    }
  }

  return terrainAmounts[TERRAIN_MASK_SWAMP] / terrainAmounts[0]
}

Room.prototype.visualizeCoordMap = function (coordMap, color, magnification = 2) {
  if (color) {
    for (let x = 0; x < roomDimensions; x += 1) {
      for (let y = 0; y < roomDimensions; y += 1) {
        this.visual.rect(x - 0.5, y - 0.5, 1, 1, {
          fill: `hsl(${200}${coordMap[packXYAsNum(x, y)] * magnification}, 100%, 60%)`,
          opacity: 0.4,
        })
      }
    }

    return
  }

  for (let x = 0; x < roomDimensions; x += 1) {
    for (let y = 0; y < roomDimensions; y += 1) {
      this.visual.text(coordMap[packXYAsNum(x, y)].toString(), x, y, {
        font: 0.5,
      })
    }
  }
}

Room.prototype.visualizeCostMatrix = function (cm, color, magnification = 2) {
  if (color) {
    for (let x = 0; x < roomDimensions; x += 1) {
      for (let y = 0; y < roomDimensions; y += 1) {
        this.visual.rect(x - 0.5, y - 0.5, 1, 1, {
          fill: `hsl(${200}${cm.get(x, y) * magnification}, 100%, 60%)`,
          opacity: 0.4,
        })
      }
    }

    return
  }

  for (let x = 0; x < roomDimensions; x += 1) {
    for (let y = 0; y < roomDimensions; y += 1) {
      this.visual.text(cm.get(x, y).toString(), x, y, {
        font: 0.5,
      })
    }
  }
}

Room.prototype.coordHasStructureTypes = function (coord, types) {
  for (const structure of this.lookForAt(LOOK_STRUCTURES, coord.x, coord.y)) {
    if (!types.has(structure.structureType)) continue

    return true
  }

  return false
}

Room.prototype.createPowerRequest = function (target, powerType, priority) {
  // There is already has a power creep responding to this target with the power
  LogOps.log('MADE POWER TASK FOR', target)
  if (target.reservePowers.has(powerType)) return false

  // Create a power task with info on the cooldown

  const effect = target.effectsData.get(powerType)
  const cooldown = effect ? effect.ticksRemaining : 0

  const ID = CollectiveManager.newTickID()

  return (this.powerRequests[ID] = {
    taskID: ID,
    targetID: target.id,
    power: powerType,
    packedCoord: packCoord(target.pos),
    cooldown,
    priority,
  })
}

Room.prototype.highestWeightedStoringStructures = function (resourceType) {
  if (!this.storage && !this.terminal) return false

  if (!this.storage) return this.terminal
  if (!this.terminal) return this.storage

  if (
    this.storage.store.getUsedCapacity(resourceType) / 3 >
    this.terminal.store.getUsedCapacity(resourceType)
  ) {
    return this.storage
  }

  return this.terminal
}

Room.prototype.createRoomLogisticsRequest = function (args) {
  // Don't make requests when there is nobody to respond

  if (!this.myCreeps.length) return Result.noAction
  if (this.roomManager.roomLogisticsBlacklistCoords.has(packCoord(args.target.pos))) {
    return Result.noAction
  }

  if (!args.resourceType) args.resourceType = RESOURCE_ENERGY
  // We should only handle energy until we have an active storage or terminal
  else if (
    args.resourceType !== RESOURCE_ENERGY &&
    (!this.storage || this.controller.level < 4) &&
    (!this.terminal || this.controller.level < 6)
  )
    return Result.fail

  let amount: number

  // Make sure we are not infringing on the threshold

  if (args.target instanceof Resource) {
    amount = (args.target as Resource).reserveAmount

    if (amount < 1) return Result.fail
  } else if (args.type === RoomLogisticsRequestTypes.transfer) {
    if (
      args.target.reserveStore[args.resourceType] >=
      args.target.store.getCapacity(args.resourceType)
    )
      return Result.fail

    amount = RoomObjectUtils.freeReserveStoreOf(args.target, args.resourceType)
    /* this.visual.text(args.target.reserveStore[args.resourceType].toString(), args.target.pos) */
  }

  // Offer or withdraw types
  else {
    amount = args.target.reserveStore[args.resourceType]

    // We don't have enough resources to make a request

    if (amount < 1) return Result.fail

    if (args.maxAmount) amount = Math.min(amount, Math.round(args.maxAmount))
  }

  if (args.priority === undefined) args.priority = 1
  else args.priority = roundTo(args.priority / 20, 2)

  const ID = CollectiveManager.newTickID()

  if (Game.flags[FlagNames.debugRoomLogistics]) {
    if (args.type === RoomLogisticsRequestTypes.offer) {
      this.visual.text('O ' + amount.toString(), args.target.pos.x, args.target.pos.y + 0.5, {
        font: '0.3',
      })
      this.visual.text(args.priority.toString(), args.target.pos, { font: '0.3' })
    } else if (args.type === RoomLogisticsRequestTypes.transfer) {
      this.visual.text('T ' + amount.toString(), args.target.pos.x, args.target.pos.y + 0.5, {
        font: '0.3',
      })
      this.visual.text(args.priority.toString(), args.target.pos, { font: '0.3' })
    } else if (args.type === RoomLogisticsRequestTypes.withdraw) {
      this.visual.text('W ' + amount.toString(), args.target.pos.x, args.target.pos.y + 0.5, {
        font: '0.3',
      })
      this.visual.text(args.priority.toString(), args.target.pos, { font: '0.3' })
    }
  }

  /* this.visual.text(args.priority.toString(), args.target.pos) */
  /* this.visual.resource(args.resourceType, args.target.pos.x, args.target.pos.y) */
  /* if (args.type === 'transfer') this.visual.resource(args.resourceType, args.target.pos.x, args.target.pos.y) */

  return (this.roomLogisticsRequests[args.type][ID] = {
    ID,
    type: args.type,
    targetID: args.target.id,
    resourceType: args.resourceType,
    amount: amount,
    priority: args.priority,
    // onlyFull by default true
    onlyFull: args.onlyFull /* ?? true */,
    // Don't reserve if advancedLogistics is disabled
    noReserve: !this.roomManager.advancedLogistics || undefined,
  })
}

Room.prototype.findStructureAtCoord = function <T extends Structure>(
  coord: Coord,
  conditions: (structure: T) => boolean,
) {
  return this.findStructureAtXY(coord.x, coord.y, conditions)
}

Room.prototype.findStructureAtXY = function <T extends Structure>(
  x: number,
  y: number,
  conditions: (structure: T) => boolean,
) {
  const structureIDs = this.roomManager.structureCoords.get(packXYAsCoord(x, y))
  if (!structureIDs) return false

  for (const ID of structureIDs) {
    const structure = findObjectWithID(ID) as T
    if (conditions(structure)) return structure
  }

  return false
}

Room.prototype.findCSiteAtCoord = function <T extends ConstructionSite>(
  coord: Coord,
  conditions: (cSite: T) => boolean,
) {
  return this.findCSiteAtXY(coord.x, coord.y, conditions)
}

Room.prototype.findCSiteAtXY = function <T extends ConstructionSite>(
  x: number,
  y: number,
  conditions: (cSite: T) => boolean,
) {
  const cSiteIDs = this.roomManager.cSiteCoords.get(packXYAsCoord(x, y))
  if (!cSiteIDs) return false

  for (const ID of cSiteIDs) {
    const cSite = findObjectWithID(ID) as T
    /* console.log('findCSite', cSite, ID) */
    if (conditions(cSite)) return cSite
  }

  return false
}

Room.prototype.findStructureInRange = function <T extends Structure>(
  startCoord: Coord,
  range: number,
  condition: (structure: T) => boolean,
): T | false {
  let structureID: Id<Structure>

  for (let x = startCoord.x - range; x <= startCoord.x + range; x += 1) {
    for (let y = startCoord.y - range; y <= startCoord.y + range; y += 1) {
      // Iterate if the pos doesn't map onto a room

      if (x < 0 || x >= roomDimensions || y < 0 || y >= roomDimensions) continue

      const structureIDs = this.roomManager.structureCoords.get(packXYAsCoord(x, y))
      if (!structureIDs) continue

      structureID = structureIDs.find(structureID => {
        return condition(findObjectWithID(structureID) as T)
      })

      if (structureID) return findObjectWithID(structureID) as T
    }
  }

  return false
}

Room.prototype.coordVisual = function (x, y, fill = customColors.lightBlue) {
  this.visual.rect(x - 0.5, y - 0.5, 1, 1, { fill })
}
