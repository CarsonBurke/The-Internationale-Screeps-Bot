import { mockGlobal, mockInstanceOf, mockStructure } from 'screeps-jest'

global.settings = {
    breakVersion: 0,
}
mockGlobal<Memory>('Memory', {})
mockGlobal<Game>('Game', {
    shard: { name: 'shard' },
})
jest.mock('./ErrorExporter', () => {})
// import * as constants from '../international/constants'
// jest.spyOn<any, any>(constants, 'packedQuadAttackMemberOffsets').mockReturnValue([])

import { buildableStructureTypes } from '../constants/general'

import * as Codec from './codec'

const roomName = 'W1N1'
describe('codec', () => {
    it('should encode and decode ids', () => {
        const ids = [
            '63f1374851b2398ffdc7ccee',
            '63f1384de9dbe683bb0ac33d',
            '63f142577691314e86adc93b',
            '63f14590ef781f3c287c92c4',
            '63f1460de9dbe657270ac7bb',
        ]

        for (const id of ids) {
            const encoded = Codec.packId(id)
            const decoded = Codec.unpackId(encoded)
            expect(decoded).toEqual(id)
        }

        const encodedList = Codec.packIdList(ids)
        const decodedList = Codec.unpackIdList(encodedList)
        expect(decodedList).toEqual(ids)
    })
    it('should encode and decode coords', () => {
        const coords = []
        for (let x = 1; x < 50; x++) {
            for (let y = 1; y < 50; y++) {
                coords.push({ x, y })
                const encodedCoord = Codec.packCoord({ x, y })
                const decodedCoord = Codec.unpackCoord(encodedCoord)
                expect(decodedCoord).toEqual({ x, y })

                const encodedXY = Codec.packXYAsCoord(x, y)
                const decodedXY = Codec.unpackCoord(encodedXY)
                expect(decodedXY).toEqual({ x, y })
            }
        }

        const encodedList = Codec.packCoordList(coords)
        const decodedList = Codec.unpackCoordList(encodedList)
        expect(decodedList).toEqual(coords)
        expect(decodedList.length).toEqual(49 * 49)
    })

    it('should encode and decode coords with a roomName', () => {
        const positions = []
        let encodedCoords: string = ''
        for (let x = 1; x < 50; x++) {
            for (let y = 1; y < 50; y++) {
                const pos = new RoomPosition(x, y, roomName)
                positions.push(pos)
                const encodedPos = Codec.packPos(pos)
                const decodedPos = Codec.unpackPos(encodedPos)
                expect({ x: decodedPos.x, y: decodedPos.y, roomName: decodedPos.roomName }).toEqual(
                    {
                        x: pos.x,
                        y: pos.y,
                        roomName: pos.roomName,
                    },
                )

                const encodedCoord = Codec.packCoord({ x, y })
                encodedCoords += encodedCoord
                const decodedCoordAsPos = Codec.unpackCoordAsPos(encodedCoord, roomName)
                expect({
                    x: decodedCoordAsPos.x,
                    y: decodedCoordAsPos.y,
                    roomName: decodedCoordAsPos.roomName,
                }).toEqual({
                    x,
                    y,
                    roomName,
                })
            }
        }

        const encodedList = Codec.packPosList(positions)
        const decodedList = Codec.unpackPosList(encodedList)
        for (let p = 0; p < positions.length; p++) {
            expect({
                x: decodedList[p].x,
                y: decodedList[p].y,
                roomName: decodedList[p].roomName,
            }).toEqual({
                x: positions[p].x,
                y: positions[p].y,
                roomName: positions[p].roomName,
            })
        }

        const decodedCoordAsPosList = Codec.unpackCoordListAsPosList(encodedCoords, roomName)
        for (let p = 0; p < positions.length; p++) {
            expect({
                x: decodedCoordAsPosList[p].x,
                y: decodedCoordAsPosList[p].y,
                roomName: decodedCoordAsPosList[p].roomName,
            }).toEqual({
                x: positions[p].x,
                y: positions[p].y,
                roomName: positions[p].roomName,
            })
        }
        expect(decodedList.length).toEqual(49 * 49)
    })

    it('should reverse position list', () => {
        const positions = []
        for (let x = 1; x < 50; x++) {
            for (let y = 1; y < 50; y++) {
                const pos = new RoomPosition(x, y, roomName)
                positions.push(pos)
            }
        }
        const encoded = Codec.packPosList(positions)
        const reversed2Times = Codec.reversePosList(Codec.reversePosList(encoded))
        expect(reversed2Times).toEqual(encoded)
        expect(reversed2Times.length).toEqual(49 * 49 * 3)
    })

    it('should encode and decode plan coord', () => {
        for (let s = 1; s < buildableStructureTypes.length; s++) {
            for (let r = 1; r < 10; r++) {
                const encoded = Codec.packBasePlanCoord([
                    { minRCL: r, structureType: buildableStructureTypes[s] },
                ])
                const decodedList = Codec.unpackBasePlanCoords(encoded)
                expect(decodedList[0]).toEqual({
                    minRCL: r,
                    structureType: buildableStructureTypes[s],
                })
            }
        }
    })

    it('should use the cache when available', () => {
        const originalId = '63f1374851b2398ffdc7ccee'
        const originalCoord: Coord = { x: 1, y: 1 }
        const originalPos = new RoomPosition(1, 1, roomName)
        const originalBaseCoord: BasePlanCoord = {
            minRCL: 1,
            structureType: STRUCTURE_EXTENSION,
        }
        const originalRampartPlanCoord: RampartPlanCoord = {
            minRCL: 1,
            buildForNuke: 0,
            buildForThreat: 0,
            coversStructure: 0,
            needsStoringStructure: 0,
        }

        Codec.packId(originalId)
        const packedId = Codec.packId(originalId)
        Codec.packCoord(originalCoord)
        const packedCoord = Codec.packCoord(originalCoord)
        Codec.packXYAsCoord(originalCoord.x, originalCoord.y)
        const packedXYCoord = Codec.packXYAsCoord(originalCoord.x, originalCoord.y)
        Codec.packPos(originalPos)
        const packedPos = Codec.packPos(originalPos)
        Codec.packXYAsPos(originalPos.x, originalPos.y, originalPos.roomName)
        const packedXYPos = Codec.packXYAsPos(originalPos.x, originalPos.y, originalPos.roomName)
        Codec.packBasePlanCoord([originalBaseCoord])
        const packedBasePlanCoords = Codec.packBasePlanCoord([originalBaseCoord])
        Codec.packRampartPlanCoord(originalRampartPlanCoord)
        const packedRampartPlanCoords = Codec.packRampartPlanCoord(originalRampartPlanCoord)

        Codec.unpackId(packedId)
        const decodedId = Codec.unpackId(packedId)
        Codec.unpackCoord(packedCoord)
        const decodedCoord = Codec.unpackCoord(packedCoord)
        Codec.unpackCoord(packedXYCoord)
        const decodedXYCoord = Codec.unpackCoord(packedXYCoord)
        Codec.unpackPos(packedPos)
        const decodedPos = Codec.unpackPos(packedPos)
        Codec.unpackPos(packedXYPos)
        const decodedXYPos = Codec.unpackPos(packedXYPos)
        Codec.unpackBasePlanCoords(packedBasePlanCoords)
        const decodedBasePlanCoords = Codec.unpackBasePlanCoords(packedBasePlanCoords)[0]
        Codec.unpackRampartPlanCoord(packedRampartPlanCoords)
        const decodedRampartPlanCoord = Codec.unpackRampartPlanCoord(packedRampartPlanCoords)

        expect(decodedId).toEqual(originalId)
        expect(decodedCoord).toEqual(originalCoord)
        expect(decodedXYCoord).toEqual(originalCoord)
        expect(decodedPos.x).toEqual(originalPos.x)
        expect(decodedPos.y).toEqual(originalPos.y)
        expect(decodedPos.roomName).toEqual(originalPos.roomName)
        expect(decodedXYPos.x).toEqual(originalPos.x)
        expect(decodedXYPos.y).toEqual(originalPos.y)
        expect(decodedXYPos.roomName).toEqual(originalPos.roomName)
        expect(decodedBasePlanCoords.minRCL).toEqual(originalBaseCoord.minRCL)
        expect(decodedBasePlanCoords.structureType).toEqual(originalBaseCoord.structureType)
        expect(decodedRampartPlanCoord.minRCL).toEqual(originalRampartPlanCoord.minRCL)
        expect(decodedRampartPlanCoord.buildForNuke).toEqual(originalRampartPlanCoord.buildForNuke)
        expect(decodedRampartPlanCoord.buildForThreat).toEqual(
            originalRampartPlanCoord.buildForThreat,
        )
        expect(decodedRampartPlanCoord.coversStructure).toEqual(
            originalRampartPlanCoord.coversStructure,
        )
        expect(decodedRampartPlanCoord.needsStoringStructure).toEqual(
            originalRampartPlanCoord.needsStoringStructure,
        )
    })
})
