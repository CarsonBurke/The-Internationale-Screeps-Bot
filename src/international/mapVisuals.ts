import { unpackPosAt, unpackPosList } from 'other/codec'
import {
  customColors,
  WorkRequestKeys,
  RoomMemoryKeys,
  RoomTypes,
  roomDimensions,
  packedPosLength,
  FlagNames,
  Result,
} from '../constants/general'
import { CommuneUtils } from 'room/commune/communeUtils'

/**
 * Adds colours and annotations to the map if mapVisuals are enabled
 */
export class MapVisualsManager {
  static run() {
    if (!Game.flags[FlagNames.mapVisuals]) return

    for (const roomName in Memory.rooms) {
      const roomMemory = Memory.rooms[roomName]

      const type = roomMemory[RoomMemoryKeys.type]
      if (type === undefined || type === null) continue

      if (roomMemory[RoomMemoryKeys.type] === RoomTypes.commune) {
        this.visualizeCommune(roomName, roomMemory)
      }

      // Room type

      Game.map.visual.text(
        'Type: ' + roomMemory[RoomMemoryKeys.type].toString(),
        new RoomPosition(2, 45, roomName),
        {
          align: 'left',
          fontSize: 5,
        },
      )

      this.test(roomName, roomMemory)

      if (roomMemory[RoomMemoryKeys.type] === RoomTypes.commune) {
        const room = Game.rooms[roomName]
        if (!room) continue

        // Energy
        const storedEnergy = room.roomManager.resourcesInStoringStructures.energy
        const storedEnergyPercent = Math.floor(
          (storedEnergy / CommuneUtils.minStoredEnergy(room)) * 100,
        )
        Game.map.visual.text(
          `⚡${storedEnergy}( ${storedEnergyPercent}%)`,
          new RoomPosition(2, 8, roomName),
          {
            align: 'left',
            fontSize: 8,
          },
        )

        // Spawn usage
        const spawnUsage = `${
          Memory.stats.rooms[roomName].su
            ? Math.floor(Memory.stats.rooms[roomName].su * 100).toFixed(0)
            : 0
        }%`
        Game.map.visual.text(`${spawnUsage}`, new RoomPosition(48, 40, roomName), {
          align: 'right',
          fontSize: 4,
        })

        // RCL
        const rclProgress =
          Game.rooms[roomName].controller.level === 8
            ? ''
            : ` @${(
                (100 * Game.rooms[roomName].controller.progress) /
                Game.rooms[roomName].controller.progressTotal
              ).toFixed(0)}%`
        Game.map.visual.text(
          `${Game.rooms[roomName].controller.level.toString()}${rclProgress}`,
          new RoomPosition(48, 45, roomName),
          {
            align: 'right',
            fontSize: 4,
          },
        )

        const anchor = room.roomManager.anchor
        // if (!anchor) throw Error('No anchor for mapVisuals commune ' + roomName)
        if (!anchor) continue

        if (roomMemory[RoomMemoryKeys.workRequest]) {
          Game.map.visual.line(
            anchor || new RoomPosition(25, 25, roomName),
            new RoomPosition(25, 25, roomMemory[RoomMemoryKeys.workRequest]),
            {
              color: customColors.lightBlue,
              width: 1.2,
              opacity: 0.3,
            },
          )
        }

        if (roomMemory[RoomMemoryKeys.combatRequests].length) {
          for (const requestName of roomMemory[RoomMemoryKeys.combatRequests]) {
            Game.map.visual.line(
              anchor || new RoomPosition(25, 25, roomName),
              new RoomPosition(25, 25, requestName),
              {
                color: customColors.red,
                width: 1.2,
                opacity: 0.3,
              },
            )
          }
        }

        continue
      }

      if (roomMemory[RoomMemoryKeys.type] === RoomTypes.neutral) {
        const commune = Game.rooms[roomMemory[RoomMemoryKeys.commune]]

        const anchor = commune.roomManager.anchor
        if (!anchor) throw Error('No anchor for mapVisuals remote ' + roomName)

        if (commune && commune.controller.my) {
          for (const sourceIndex in roomMemory[RoomMemoryKeys.remoteSourceFastFillerPaths]) {
            // Get the income based on the reservation of the room and remoteHarvester need

            const income = Math.min(
              roomMemory[RoomMemoryKeys.remoteSourceHarvesters][sourceIndex] * HARVEST_POWER,
              roomMemory[RoomMemoryKeys.maxSourceIncome][sourceIndex],
            )

            if (!roomMemory[RoomMemoryKeys.remoteSourceFastFillerPaths][sourceIndex]) continue
            const path = unpackPosList(
              roomMemory[RoomMemoryKeys.remoteSourceFastFillerPaths][sourceIndex],
            )

            Game.map.visual.poly(path, {
              stroke: customColors.yellow,
              strokeWidth: 1.2,
              opacity: 0.3,
            })

            const pos = path[0]
            const remoteSourceHarvesters =
              commune.communeManager.remoteSourceHarvesters[roomName][sourceIndex].length
            const maxRemoteSourceHarvesters =
              roomMemory[RoomMemoryKeys.remoteSourceHarvestPositions][sourceIndex].length /
              packedPosLength

            Game.map.visual.text(
              `⛏️${income},🚶‍♀️${
                roomMemory[RoomMemoryKeys.remoteSourceFastFillerPaths][sourceIndex].length
              },${remoteSourceHarvesters}/${maxRemoteSourceHarvesters}`,
              new RoomPosition(pos.x, pos.y, roomName),
              {
                align: 'center',
                fontSize: 4,
              },
            )

            const sourceHarvestPositions = unpackPosList(
              roomMemory[RoomMemoryKeys.remoteSourceHarvestPositions][sourceIndex],
            )
            for (const pos of sourceHarvestPositions) {
              Game.map.visual.rect(pos, 1, 1, {
                fill: customColors.yellow,
              })
            }
          }
        }

        if (roomMemory[RoomMemoryKeys.abandonRemote]) {
          Game.map.visual.text(
            `❌${roomMemory[RoomMemoryKeys.abandonRemote].toString()}`,
            new RoomPosition(2, 16, roomName),
            {
              align: 'left',
              fontSize: 8,
            },
          )
        }

        continue
      }

      if (roomMemory[RoomMemoryKeys.communePlanned] === Result.fail) {
        Game.map.visual.circle(new RoomPosition(25, 25, roomName), {
          stroke: customColors.red,
          strokeWidth: 2,
          fill: 'transparent',
        })
        continue
      }
    }

    this.workRequests()
  }

  private static visualizeCommune(roomName: string, roomMemory: RoomMemory) {}

  private static workRequests() {
    for (const roomName in Memory.workRequests) {
      const priority = Memory.workRequests[roomName][WorkRequestKeys.priority]
      const preference =
        priority !== undefined
          ? priority.toString()
          : `💵${Memory.rooms[roomName][RoomMemoryKeys.score]}+${
              Memory.rooms[roomName][RoomMemoryKeys.dynamicScore]
            }`

      Game.map.visual.text(preference, new RoomPosition(2, 24, roomName), {
        align: 'left',
        fontSize: 8,
      })

      if (Memory.workRequests[roomName][WorkRequestKeys.abandon]) {
        Game.map.visual.text(
          `❌${Memory.workRequests[roomName][WorkRequestKeys.abandon].toString()}`,
          new RoomPosition(2, 16, roomName),
          {
            align: 'left',
            fontSize: 8,
          },
        )
      }
    }
  }
  private static test(roomName: string, roomMemory: RoomMemory) {
    /*
        Game.map.visual.text((Game.time - roomMemory[RoomMemoryKeys.lastScout]).toString(), new RoomPosition(2, 40, roomName), {
            align: 'left',
            fontSize: 5,
        })
        */
    /*
        const roomCoord = RoomNameUtils.pack(roomName)
        Game.map.visual.text(('x: ' + roomCoord.x + ', y: ' + roomCoord.y).toString(), new RoomPosition(2, 40, roomName), {
            align: 'left',
            fontSize: 5,
        })
        */
  }
}
