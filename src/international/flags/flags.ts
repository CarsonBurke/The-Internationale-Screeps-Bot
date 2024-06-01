import { Dashboard, Rectangle, Table } from 'screeps-viz'
import {
  CombatRequestKeys,
  HaulRequestKeys,
  Result,
  RoomLogisticsRequestTypes,
  RoomMemoryKeys,
  RoomTypes,
  WorkRequestKeys,
  customColors,
  ourImpassibleStructuresSet,
  packedPosLength,
} from '../../constants/general'
import { CollectiveManager } from '../collective'
import { CombatRequestTypes } from 'types/internationalRequests'
import { RoomNameUtils } from 'room/roomNameUtils'
import { packCoord } from 'other/codec'
import { findObjectWithID, isAlly } from 'utils/utils'
import { LogOps } from 'utils/logOps'
import { RoomUtils } from 'room/roomUtils'
import { SpawnRequestConstructorsByType } from 'room/commune/spawning/spawningStructureOps'
import { RoomOps } from 'room/roomOps'

export class FlagManager {
  run() {
    for (const flagName in Game.flags) {
      const flagNameParts = flagName.split(' ')

      if (!this[flagNameParts[0] as keyof FlagManager]) continue
      this[flagNameParts[0] as keyof FlagManager](flagName, flagNameParts)
    }
  }

  /**
   * Tricks typescript into accepting the dynamic function call in run()
   */
  doNothing(flagName: string, flagNameParts: string[]) {}

  private internationalDataVisuals(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    flag.setColor(COLOR_GREEN)
    room.roomManager.roomVisualsManager.internationalDataVisuals()
  }

  private incomingTransactions(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const resourceType = flagNameParts[1] as ResourceConstant | undefined

    flag.setColor(COLOR_GREEN)

    const headers = ['sender', '', 'receiver', 'resource', 'amount', 'ticks since']

    const data: any[][] = []

    for (const transaction of Game.market.incomingTransactions) {
      const roomFromMemory = Memory.rooms[transaction.from] || ({} as RoomMemory)
      const roomToMemory = Memory.rooms[transaction.to] || ({} as RoomMemory)

      if (resourceType !== undefined && transaction.resourceType !== resourceType) {
        continue
      }

      data.push([
        transaction.from +
          ' (' +
          (roomFromMemory[RoomMemoryKeys.type] === RoomTypes.commune
            ? Memory.me
            : roomFromMemory[RoomMemoryKeys.owner] || 'unknown') +
          ')',
        '-->',
        transaction.to +
          ' (' +
          (roomToMemory[RoomMemoryKeys.type] === RoomTypes.commune
            ? Memory.me
            : roomToMemory[RoomMemoryKeys.owner] || 'unknown') +
          ')',
        transaction.resourceType,
        transaction.amount,
        Game.time - transaction.time,
      ])
    }

    const height = 3 + data.length

    Dashboard({
      config: {
        room: room.roomManager.room.name,
      },
      widgets: [
        {
          pos: {
            x: 1,
            y: 1,
          },
          width: 47,
          height,
          widget: Rectangle({
            data: Table(() => ({
              data,
              config: {
                label: 'Incoming Transactions',
                headers,
              },
            })),
          }),
        },
      ],
    })
  }

  private outgoingTransactions(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const resourceType = flagNameParts[1] as ResourceConstant | undefined

    flag.setColor(COLOR_GREEN)

    const headers = ['sender', '', 'receiver', 'resource', 'amount', 'ticks since']

    const data: any[][] = []

    for (const transaction of Game.market.outgoingTransactions) {
      const roomFromMemory = Memory.rooms[transaction.from] || ({} as RoomMemory)
      const roomToMemory = Memory.rooms[transaction.to] || ({} as RoomMemory)

      if (resourceType !== undefined && transaction.resourceType !== resourceType) {
        continue
      }

      data.push([
        transaction.from +
          ' (' +
          (roomFromMemory[RoomMemoryKeys.type] === RoomTypes.commune
            ? Memory.me
            : roomFromMemory[RoomMemoryKeys.owner] || 'unknown') +
          ')',
        '-->',
        transaction.to +
          ' (' +
          (roomToMemory[RoomMemoryKeys.type] === RoomTypes.commune
            ? Memory.me
            : roomToMemory[RoomMemoryKeys.owner] || 'unknown') +
          ')',
        transaction.resourceType,
        transaction.amount,
        Game.time - transaction.time,
      ])
    }

    const height = 3 + data.length

    Dashboard({
      config: {
        room: room.roomManager.room.name,
      },
      widgets: [
        {
          pos: {
            x: 1,
            y: 1,
          },
          width: 47,
          height,
          widget: Rectangle({
            data: Table(() => ({
              data,
              config: {
                label: 'Outgoing Transactions',
                headers,
              },
            })),
          }),
        },
      ],
    })
  }

  private abandonCommune(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const roomMemory = Memory.rooms[roomName]
    if (!roomMemory) {
      flag.setColor(COLOR_RED)
      return
    }

    if (roomMemory[RoomMemoryKeys.type] !== RoomTypes.commune) {
      flag.setColor(COLOR_RED)
      return
    }

    flag.remove()
    roomMemory[RoomMemoryKeys.abandonCommune] = true
  }

  private claim(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const roomMemory = Memory.rooms[roomName]
    const communeName = flagNameParts[2] || undefined
    const score = flagNameParts[3] ? parseInt(flagNameParts[3]) : undefined

    if (!roomMemory) {
      flag.setColor(COLOR_RED)
      return
    }
    if (roomMemory[RoomMemoryKeys.communePlanned] !== Result.success) {
      flag.setColor(COLOR_RED)
      return
    }

    if (communeName) {
      const communeMemory = Memory.rooms[communeName]
      if (!communeMemory) {
        flag.setColor(COLOR_RED)
        return
      }
    }

    global.claim(roomName, communeName, score)
    flag.remove()
  }

  private deleteClaim(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const roomMemory = Memory.rooms[roomName]

    if (!roomMemory) {
      flag.setColor(COLOR_RED)
      return
    }

    global.deleteWorkRequest(roomName)

    flag.remove()
  }

  private combat(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const communeName = flagNameParts[2] || undefined
    const type: CombatRequestTypes = (flagNameParts[3] as CombatRequestTypes) || 'attack'

    flag.setColor(COLOR_RED)
    return

    if (communeName) {
      if (!Memory.rooms[communeName]) {
        flag.setColor(COLOR_RED)
        return
      }
    }

    global.combat(roomName, type, undefined, communeName)
  }

  private attack(flagName: string, flagNameParts: string[]) {
    flagNameParts.push('attack')
    this.combat(flagName, flagNameParts)
  }

  private harass(flagName: string, flagNameParts: string[]) {
    flagNameParts.push('harass')
    this.combat(flagName, flagNameParts)
  }

  private defend(flagName: string, flagNameParts: string[]) {
    flagNameParts.push('defend')
    this.combat(flagName, flagNameParts)
  }

  private deleteCombat(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName

    global.deleteCombatRequest(roomName)

    flag.remove()
  }

  private defenceFloodAnchor(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const anchor = room.roomManager.anchor
    if (!anchor) {
      throw Error('no anchor')
    }

    const terrain = Game.map.getRoomTerrain(room.name)
    const rampartPlans = room.roomManager.rampartPlans
    RoomNameUtils.floodFillFor(room.name, [anchor], coord => {
      // Ignore terrain that protects us
      if (terrain.get(coord.x, coord.y) === TERRAIN_MASK_WALL) return false

      const planData = rampartPlans.getXY(coord.x, coord.y)
      if (planData) {
        // Filter out non-mincut ramparts
        if (planData.buildForNuke || planData.coversStructure || planData.buildForThreat) {
          room.coordVisual(coord.x, coord.y)
          return true
        }

        // Don't flood past mincut ramparts
        return false
      }
      room.coordVisual(coord.x, coord.y)
      // See if there is an enemy creep
      const enemyCreepID = room.roomManager.enemyCreepPositions[packCoord(coord)]
      if (!enemyCreepID) return true

      const enemyCreep = findObjectWithID(enemyCreepID)
      if (isAlly(enemyCreep.owner.username)) return true
      // If it can deal damage, safemode
      if (
        enemyCreep.combatStrength.ranged > 0 ||
        enemyCreep.combatStrength.melee > 0 ||
        enemyCreep.combatStrength.dismantle > 0
      )
        return Result.stop

      return true
    })
  }

  private defenceFloodController(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const terrain = Game.map.getRoomTerrain(room.name)
    RoomNameUtils.floodFillFor(room.name, [room.controller.pos], (coord, packedCoord, depth) => {
      // See if we should even consider the coord

      // Ignore terrain that protects us
      if (terrain.get(coord.x, coord.y) === TERRAIN_MASK_WALL) return false

      // Don't go out of range 2 from controller
      if (depth > 2) return false

      // Ignore structures that protect us
      if (room.coordHasStructureTypes(coord, ourImpassibleStructuresSet)) return false

      // Past this point we should always add this coord to the next generation
      room.coordVisual(coord.x, coord.y)
      // See if there is an enemy creep
      const enemyCreepID = room.roomManager.enemyCreepPositions[packCoord(coord)]
      if (!enemyCreepID) return true

      const enemyCreep = findObjectWithID(enemyCreepID)
      if (isAlly(enemyCreep.owner.username)) return true
      // We only need to protect our controller from claim creeps
      if (!enemyCreep.parts.claim) return true

      // We identified an enemy claimed near our controller!
      return Result.stop
    })
  }

  private communeSourceVisuals(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const roomMemory = Memory.rooms[room.name]
    if (roomMemory[RoomMemoryKeys.type] !== RoomTypes.commune) return

    const sourceIDs = roomMemory[RoomMemoryKeys.communeSources]
    for (let sourceIndex = 0; sourceIndex < sourceIDs.length; sourceIndex++) {
      const source = findObjectWithID(sourceIDs[sourceIndex])
      room.visual.text(sourceIndex.toString(), source.pos)
    }

    const stampAnchors = room.roomManager.stampAnchors
    if (stampAnchors) {
      for (let sourceIndex = 0; sourceIndex < stampAnchors.sourceLink.length; sourceIndex++) {
        const coord = stampAnchors.sourceLink[sourceIndex]
        room.visual.text(sourceIndex.toString(), coord.x, coord.y)
      }
    }
  }

  private communeSourceStructureVisuals(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const roomMemory = Memory.rooms[room.name]
    if (roomMemory[RoomMemoryKeys.type] !== RoomTypes.commune) return

    const containers = room.roomManager.sourceContainers
    for (let sourceIndex = 0; sourceIndex < containers.length; sourceIndex++) {
      const container = containers[sourceIndex]
      room.visual.text(sourceIndex.toString(), container.pos)
    }

    const stampAnchors = room.roomManager.stampAnchors
    if (!stampAnchors) return

    LogOps.log('sourceLinks stampAnchors', JSON.stringify(stampAnchors.sourceLink))

    const links = room.communeManager.sourceLinks
    LogOps.log('sourceLinks', links)
    for (let sourceIndex = 0; sourceIndex < links.length; sourceIndex++) {
      const link = links[sourceIndex]
      if (!link) continue
      room.visual.text(sourceIndex.toString(), link.pos)
    }
  }

  private remoteSourceVisuals(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const roomMemory = Memory.rooms[room.name]
    if (roomMemory[RoomMemoryKeys.type] !== RoomTypes.neutral) return

    const sourceIDs = roomMemory[RoomMemoryKeys.remoteSources]
    for (let sourceIndex = 0; sourceIndex < sourceIDs.length; sourceIndex++) {
      const source = findObjectWithID(sourceIDs[sourceIndex])
      room.visual.text(sourceIndex.toString(), source.pos)
    }
  }

  private calculateDynamicScore(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName

    const dynamicScore = RoomNameUtils.findDynamicScore(roomName)
    LogOps.log('dynamic score for ' + roomName, dynamicScore)
  }

  private spawnRequestVisuals(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const headers = ['role', 'priority', 'cost', 'parts']
    const data: any[][] = []

    const spawnRequestsArgs = room.communeManager.spawnRequestsManager.run()

    for (const requestArgs of spawnRequestsArgs) {
      const spawnRequests = SpawnRequestConstructorsByType[requestArgs.type](room, requestArgs)

      for (const request of spawnRequests) {
        const row: any[] = []
        row.push(requestArgs.role)
        row.push(requestArgs.priority)
        row.push(`${request.cost} / ${room.communeManager.nextSpawnEnergyAvailable}`)

        data.push(row)
      }
    }

    const height = 3 + data.length

    Dashboard({
      config: {
        room: room.name,
      },
      widgets: [
        {
          pos: {
            x: 1,
            y: 1,
          },
          width: 47,
          height,
          widget: Rectangle({
            data: Table(() => ({
              data,
              config: {
                label: 'Spawn Requests',
                headers,
              },
            })),
          }),
        },
      ],
    })
  }

  private labDataVisuals(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const headers = ['output', 'input 1', 'input 2', 'reverse', 'target amount']
    const data: any[][] = []

    const labManager = room.communeManager.labManager
    const row = [
      labManager.outputResource,
      labManager.inputResources[0],
      labManager.inputResources[1],
      labManager.isReverse,
      labManager.targetAmount,
    ]
    data.push(row)

    const height = 3 + data.length

    Dashboard({
      config: {
        room: room.name,
      },
      widgets: [
        {
          pos: {
            x: 1,
            y: 1,
          },
          width: 47,
          height,
          widget: Rectangle({
            data: Table(() => ({
              data,
              config: {
                label: 'Lab Data',
                headers,
              },
            })),
          }),
        },
      ],
    })
  }

  private labVisuals(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const labManager = room.communeManager.labManager

    const inputLabs = labManager.inputLabs
    for (let i = 0; i < inputLabs.length; i++) {
      const lab = inputLabs[i]

      room.visual.resource(labManager.inputResources[i], lab.pos.x, lab.pos.y)
    }

    const outputLabs = labManager.outputLabs
    for (const lab of outputLabs) {
      room.visual.resource(labManager.outputResource, lab.pos.x, lab.pos.y)
    }
  }

  private roomLogisticsDataVisuals(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const headers = ['type', 'resourceType', 'amount', 'priority', 'position']
    const data: any[][] = []

    for (const key in room.roomLogisticsRequests) {
      const requestType = key as unknown as RoomLogisticsRequestTypes
      const requests = room.roomLogisticsRequests[requestType]
      for (const ID in requests) {
        const request = requests[ID]
        const row: any[] = [
          request.type,
          request.resourceType,
          request.amount,
          request.priority,
          findObjectWithID(request.targetID).pos,
        ]
        data.push(row)
      }
    }

    const height = 3 + data.length

    Dashboard({
      config: {
        room: room.name,
      },
      widgets: [
        {
          pos: {
            x: 1,
            y: 1,
          },
          width: 47,
          height,
          widget: Rectangle({
            data: Table(() => ({
              data,
              config: {
                label: 'Room Logistics Requests',
                headers,
              },
            })),
          }),
        },
      ],
    })
  }

  private workRequestVisuals(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const headers = ['roomName', 'static score', 'dynamic score', 'responder', 'abandon']
    const data: any[][] = []

    const workRequests = Object.keys(Memory.workRequests).sort((a, b) => {
      const aScore =
        Memory.rooms[a][RoomMemoryKeys.score] + Memory.rooms[a][RoomMemoryKeys.dynamicScore]

      const bScore =
        Memory.rooms[b][RoomMemoryKeys.score] + Memory.rooms[b][RoomMemoryKeys.dynamicScore]

      return aScore - bScore
    })

    for (const requestRoomName of workRequests) {
      const roomMemory = Memory.rooms[requestRoomName]
      const request = Memory.workRequests[requestRoomName]

      const row = [
        requestRoomName,
        roomMemory[RoomMemoryKeys.score],
        roomMemory[RoomMemoryKeys.dynamicScore],
        request[WorkRequestKeys.responder],
        request[WorkRequestKeys.abandon],
      ]
      data.push(row)
    }

    const height = 3 + data.length

    Dashboard({
      config: {
        room: room.name,
      },
      widgets: [
        {
          pos: {
            x: 1,
            y: 1,
          },
          width: 47,
          height,
          widget: Rectangle({
            data: Table(() => ({
              data,
              config: {
                label: 'Work Requests',
                headers,
              },
            })),
          }),
        },
      ],
    })
  }

  private diagonalCoords(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const roomMemory = Memory.rooms[room.name]
    if (!roomMemory || !roomMemory[RoomMemoryKeys.commune]) {
      flag.setColor(COLOR_RED)
      return
    }

    const commune = Game.rooms[roomMemory[RoomMemoryKeys.commune]]
    if (!commune) {
      flag.setColor(COLOR_RED)
      return
    }

    const diagonalCoords = RoomNameUtils.diagonalCoords(room.name, commune)
    room.visualizeCoordMap(diagonalCoords)
  }

  private controllerStructure(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    if (!room.communeManager) {
      flag.setColor(COLOR_RED)
      return
    }

    const controllerStructure = room.communeManager.upgradeStructure
    if (!controllerStructure) {
      const centerUpgradePos = room.roomManager.centerUpgradePos
      room.visual.text('X', centerUpgradePos)
      return
    }

    // There is a controller structure

    room.visual.text('CS', controllerStructure.pos)
  }

  private creepUsedStore(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    for (const creep of room.myCreeps) {
      room.visual.text(creep.usedNextStore.toString(), creep.pos)
    }
  }

  private remoteDataVisuals(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room || !room.communeManager) {
      flag.setColor(COLOR_RED)
      return
    }

    const headers = [
      'room',
      'sourceIndex',
      '📈',
      '⚡⛏️',
      'hauler',
      '⚡',
      'Δ⚡',
      '⚡Reserved',
      'reserver',
      'coreAttacker',
      '❌',
      '🛑',
    ]
    const data: any[][] = []

    for (const remoteInfo of room.roomManager.remoteSourceIndexesByEfficacy) {
      const splitRemoteInfo = remoteInfo.split(' ')
      const remoteName = splitRemoteInfo[0]

      const remoteMemory = Memory.rooms[remoteName]
      if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.neutral) continue
      if (remoteMemory[RoomMemoryKeys.commune] !== room.roomManager.room.name) continue

      const sourceIndex = parseInt(splitRemoteInfo[1]) as 0 | 1
      const pathType = room.communeManager.remoteResourcePathType
      const row: any[] = []

      row.push(remoteName)
      row.push(sourceIndex)
      if (remoteMemory[pathType][sourceIndex])
        row.push(remoteMemory[pathType][sourceIndex].length / packedPosLength)
      else row.push('unknown')
      row.push(remoteMemory[RoomMemoryKeys.remoteSourceHarvesters][sourceIndex])
      row.push(remoteMemory[RoomMemoryKeys.haulers][sourceIndex])
      row.push(remoteMemory[RoomMemoryKeys.remoteSourceCredit][sourceIndex].toFixed(2))
      if (remoteMemory[RoomMemoryKeys.remoteSourceCreditChange][sourceIndex] !== undefined)
        row.push(remoteMemory[RoomMemoryKeys.remoteSourceCreditChange][sourceIndex].toFixed(2))
      else row.push('unknown')
      row.push(
        remoteMemory[RoomMemoryKeys.remoteSourceCreditReservation][sourceIndex] +
          '/' +
          Math.round(
            (remoteMemory[pathType][sourceIndex].length / packedPosLength) *
              remoteMemory[RoomMemoryKeys.remoteSourceCreditChange][sourceIndex],
          ) *
            2,
      )
      row.push(remoteMemory[RoomMemoryKeys.remoteReservers])
      row.push(
        remoteMemory[RoomMemoryKeys.remoteCoreAttacker] ||
          remoteMemory[RoomMemoryKeys.remoteCoreAttacker] + '',
      )
      row.push(
        remoteMemory[RoomMemoryKeys.abandonRemote] ||
          remoteMemory[RoomMemoryKeys.abandonRemote] + '',
      )
      row.push(remoteMemory[RoomMemoryKeys.disable] ? 'OFF' : 'ON')

      data.push(row)
    }

    const height = 3 + data.length

    Dashboard({
      config: {
        room: room.name,
      },
      widgets: [
        {
          pos: {
            x: 1,
            y: 1,
          },
          width: 47,
          height,
          widget: Rectangle({
            data: Table(() => ({
              data,
              config: {
                label: 'Remotes',
                headers,
              },
            })),
          }),
        },
      ],
    })
  }

  private baseVisuals(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room || !room.communeManager) {
      flag.setColor(COLOR_RED)
      return
    }

    const roomMemory = Memory.rooms[room.name]
    if (roomMemory[RoomMemoryKeys.type] !== RoomTypes.commune) {
      flag.setColor(COLOR_RED)
      return
    }
    if (roomMemory[RoomMemoryKeys.communePlanned] !== Result.success) {
      flag.setColor(COLOR_RED)
      return
    }

    room.communeManager.constructionManager.visualize()
  }

  private terminalRequests(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room || !room.communeManager) {
      flag.setColor(COLOR_RED)
      return
    }

    const headers = ['roomName', 'resource', 'amount', 'priority']
    const data: any[][] = []

    for (const ID in CollectiveManager.terminalRequests) {
      const request = CollectiveManager.terminalRequests[ID]

      const row: any[] = [request.roomName, request.resource, request.amount, request.priority]
      data.push(row)
    }

    const height = 3 + data.length

    Dashboard({
      config: {
        room: room.name,
      },
      widgets: [
        {
          pos: {
            x: 1,
            y: 1,
          },
          width: 47,
          height,
          widget: Rectangle({
            data: Table(() => ({
              data,
              config: {
                label: 'My Terminal Requests',
                headers,
              },
            })),
          }),
        },
      ],
    })
  }

  private internationalResources(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const headers = ['resource', 'amount']
    const data: any[][] = []

    const resourcesInStoringStructures = CollectiveManager.resourcesInStoringStructures
    for (const key in resourcesInStoringStructures) {
      const resourceType = key as ResourceConstant

      const row: any[] = [resourceType, resourcesInStoringStructures[resourceType]]
      data.push(row)
    }

    const height = 3 + data.length

    Dashboard({
      config: {
        room: room.name,
      },
      widgets: [
        {
          pos: {
            x: 1,
            y: 1,
          },
          width: 47,
          height,
          widget: Rectangle({
            data: Table(() => ({
              data,
              config: {
                label: 'My Resources',
                headers,
              },
            })),
          }),
        },
      ],
    })
  }

  private fastFillerCoords(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    const fastFillerCoords = RoomUtils.getFastFillerCoords(room)
    for (const pos of fastFillerCoords) {
      room.coordVisual(pos.x, pos.y)
    }
  }

  private funneling(flagName: string, flagNameParts: string[]) {
    const flag = Game.flags[flagName]
    const roomName = flagNameParts[1] || flag.pos.roomName
    const room = Game.rooms[roomName]
    if (!room) {
      flag.setColor(COLOR_RED)
      return
    }

    if (!room.communeManager) {
      flag.setColor(COLOR_RED)
      return
    }

    const funnelOrder = CollectiveManager.getFunnelOrder()
    const funnelWanters = Array.from(CollectiveManager.getFunnelingRoomNames())

    const headers = ['funnel order', 'funnel wanted']
    const data: string[][] = []

    const maxIterations = Math.min(funnelOrder.length, funnelWanters.length)
    for (let i = 0; i < maxIterations; i++) {
      const row: string[] = []

      if (funnelOrder[i]) {
        row.push(funnelOrder[i])
      } else {
        row.push('x')
      }

      if (funnelWanters[i]) {
        row.push(funnelWanters[i])
      } else {
        row.push('x')
      }

      data.push(row)
    }

    RoomOps.tableVisual(room, 'Funneling', headers, data)
  }
}

export const flagManager = new FlagManager()
