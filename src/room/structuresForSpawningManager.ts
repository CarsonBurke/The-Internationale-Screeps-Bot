import { getRangeBetween } from "international/generalFunctions"
import { RoomTransferTask } from "./roomTasks"

/**
 * Creates tasks for spawns and extensions when they are empty
 */
export function structuresForSpawningManager(room: Room) {

    // Get exensions and spawns

    let structuresForSpawning: (StructureSpawn | StructureExtension)[] = room.get('structuresForSpawning')

    // Get the room's sourceNames

    const sourceNames: ('source1' | 'source2')[] = ['source1', 'source2']

    // loop through sourceNames

    for (const sourceName of sourceNames) {

        // Get the closestHarvestPos using the sourceName, iterating if undefined

        const closestHarvestPos: RoomPosition | undefined = room.get(`${sourceName}ClosestHarvestPos`)
        if (!closestHarvestPos) continue

        // Assign structuresForSpawning that are not in range of 1 to the closestHarvestPos

        structuresForSpawning.filter(structure => getRangeBetween(structure.pos.x, structure.pos.y, closestHarvestPos.x, closestHarvestPos.y) > 1)
    }

    // If there is a fastFill container or link

    if (room.get('fastFillerContainerLeft') || room.get('fastFillerContainerRight') || room.get('fastFillerLink')) {

        // Get the anchor, stopping if it's undefined

        const anchor: RoomPosition | undefined = room.get('anchor')
        if (!anchor) return

        // Assign structuresForSpawning that are not in range of 2 to the the anchor

        structuresForSpawning.filter(structure => getRangeBetween(structure.pos.x, structure.pos.y, anchor.x, anchor.y) > 2)
    }

    // Iterate through structures in structureForSpawning

    for (const structure of structuresForSpawning) {

        // Construct an undefined taskWithoutResponder

        let taskWithoutResponder: RoomTransferTask,

        // Construct totalResourcesRequested at 0

        totalResourcesRequested = 0

        // if there is no global for the structure, make one

        if (!global[structure.id]) global[structure.id] = {}

        // If there is no created task ID obj for the structure's global, create one

        if (!global[structure.id].createdTaskIDs) global[structure.id].createdTaskIDs = {}

        // Otherwise

        else {

            // Find the structures's tasks of type tansfer

            const structuresTransferTasks = room.findTasksOfTypes(global[structure.id].createdTaskIDs, new Set(['transfer'])) as RoomTransferTask[]

            // Loop through each pickup task

            for (const task of structuresTransferTasks) {

                // Otherwise find how many resources the task has requested to pick up

                totalResourcesRequested += task.taskAmount

                // If the task doesn't have a responder, set it as taskWithoutResponder

                if (!task.responderID) taskWithoutResponder = task
            }

            // If there are more or equal resources offered than the free energy capacity of the structure, iterate

            if (totalResourcesRequested >= structure.store.getFreeCapacity(RESOURCE_ENERGY)) continue
        }

        // Assign amountToRequest as the energy left not assigned to tasks, iterating if 0

        const amountToRequest = structure.store.getFreeCapacity(RESOURCE_ENERGY) - totalResourcesRequested
        if (amountToRequest == 0) continue

        // If there is a taskWithoutResponder

        if (taskWithoutResponder) {

            // Set the taskAmount to match amountToRequest

            taskWithoutResponder.taskAmount = amountToRequest

            // Update the task's priority to match new amountToRequest

            taskWithoutResponder.priority = 10

            // And iterate

            continue
        }

        // Create a new transfer task for the structure

        new RoomTransferTask(room.name, RESOURCE_ENERGY, amountToRequest, structure.id, 10)
    }
}
