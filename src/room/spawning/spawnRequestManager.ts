import {
    allyList,
    builderSpawningWhenStorageThreshold,
    claimRequestNeedsIndex,
    controllerDowngradeUpgraderNeed,
    myColors,
    remoteHarvesterRoles,
    remoteNeedsIndex,
    upgraderSpawningWhenStorageThreshold,
} from 'international/constants'
import {
    customLog,
    findCarryPartsRequired,
    findRemoteSourcesByEfficacy,
    findStrengthOfParts,
    getRange,
} from 'international/generalFunctions'

Room.prototype.spawnRequester = function() {
    // If CPU logging is enabled, get the CPU used at the start

    if (Memory.cpuLogging) var managerCPUStart = Game.cpu.getUsed()

    // Structure info about the this's spawn energy

    const spawnEnergyCapacity = this.energyCapacityAvailable

    const mostOptimalSource = this.findSourcesByEfficacy()[0]

    let partsMultiplier: number

    // Construct requests for sourceHarvesters

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            const sourceName = 'source1'
            const priority = (mostOptimalSource === sourceName ? 0 : 1) + this.creepsFromRoom.source1Harvester.length
            const role = 'source1Harvester'

            if (spawnEnergyCapacity >= 800) {
                return {
                    defaultParts: [CARRY],
                    extraParts: [WORK, MOVE, WORK],
                    partsMultiplier: 3,
                    minCreeps: 1,
                    minCost: 200,
                    priority,
                    memoryAdditions: {
                        role,
                        sourceName,
                        roads: true,
                    },
                }
            }

            if (spawnEnergyCapacity >= 750) {
                return {
                    defaultParts: [],
                    extraParts: [WORK, MOVE, WORK],
                    partsMultiplier: 3,
                    minCreeps: 1,
                    minCost: 200,
                    priority,
                    memoryAdditions: {
                        role,
                        sourceName,
                        roads: true,
                    },
                }
            }

            if (spawnEnergyCapacity >= 600) {
                return {
                    defaultParts: [MOVE, CARRY],
                    extraParts: [WORK],
                    partsMultiplier: 6,
                    minCreeps: 1,
                    minCost: 300,
                    priority,
                    memoryAdditions: {
                        role,
                        sourceName,
                        roads: true,
                    },
                }
            }

            if (this[`${sourceName}Container`]) {
                return {
                    defaultParts: [MOVE],
                    extraParts: [WORK],
                    partsMultiplier: 6,
                    minCreeps: 1,
                    minCost: 150,
                    priority,
                    memoryAdditions: {
                        role,
                        sourceName,
                        roads: true,
                    },
                }
            }

            return {
                defaultParts: [MOVE, CARRY],
                extraParts: [WORK],
                partsMultiplier: 6,
                minCreeps: undefined,
                maxCreeps: Math.min(3, this.get(`${sourceName}HarvestPositions`).length),
                minCost: 200,
                priority,
                memoryAdditions: {
                    role,
                    sourceName,
                    roads: true,
                },
            }
        })(),
    )

    // Construct requests for sourceHarvesters

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            const sourceName = 'source2'
            const priority = (mostOptimalSource === sourceName ? 0 : 1) + this.creepsFromRoom.source1Harvester.length
            const role = 'source2Harvester'

            if (spawnEnergyCapacity >= 800) {
                return {
                    defaultParts: [CARRY],
                    extraParts: [WORK, MOVE, WORK],
                    partsMultiplier: 3,
                    minCreeps: 1,
                    minCost: 200,
                    priority,
                    memoryAdditions: {
                        role,
                        sourceName,
                        roads: true,
                    },
                }
            }

            if (spawnEnergyCapacity >= 750) {
                return {
                    defaultParts: [],
                    extraParts: [WORK, MOVE, WORK],
                    partsMultiplier: 3,
                    minCreeps: 1,
                    minCost: 200,
                    priority,
                    memoryAdditions: {
                        role,
                        sourceName,
                        roads: true,
                    },
                }
            }

            if (spawnEnergyCapacity >= 600) {
                return {
                    defaultParts: [MOVE, CARRY],
                    extraParts: [WORK],
                    partsMultiplier: 6,
                    minCreeps: 1,
                    minCost: 300,
                    priority,
                    memoryAdditions: {
                        role,
                        sourceName,
                        roads: true,
                    },
                }
            }

            if (this[`${sourceName}Container`]) {
                return {
                    defaultParts: [MOVE],
                    extraParts: [WORK],
                    partsMultiplier: 6,
                    minCreeps: 1,
                    minCost: 150,
                    priority,
                    memoryAdditions: {
                        role,
                        sourceName,
                        roads: true,
                    },
                }
            }

            return {
                defaultParts: [MOVE, CARRY],
                extraParts: [WORK],
                partsMultiplier: 6,
                minCreeps: undefined,
                maxCreeps: Math.min(3, this.get(`${sourceName}HarvestPositions`).length),
                minCost: 200,
                priority,
                memoryAdditions: {
                    role,
                    sourceName,
                    roads: true,
                },
            }
        })(),
    )

    // Construct requests for haulers

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            const priority = 0.5 + this.creepsFromRoom.hauler.length * 1.5

            // Construct the required carry parts

            let requiredCarryParts = 10

            // If there is no source1Link, increase requiredCarryParts using the source's path length

            if (!this.source1Link) requiredCarryParts += findCarryPartsRequired(this.source1PathLength * 2, 10)

            // If there is no source2Link, increase requiredCarryParts using the source's path length

            if (!this.source2Link) requiredCarryParts += findCarryPartsRequired(this.source2PathLength * 2, 10)

            // If there is a controllerContainer, increase requiredCarryParts using the hub-structure path length

            if (this.controllerContainer) {
                let income

                if (this.storage) {
                    income = this.getPartsOfRoleAmount('controllerUpgrader', WORK)
                } else
                    income = Math.min(
                        this.getPartsOfRoleAmount('controllerUpgrader', WORK) * 0.75,
                        this.sources.length * 0.75,
                    )

                requiredCarryParts += findCarryPartsRequired(this.upgradePathLength * 2, income)
            }

            // If all RCL 3 extensions are built

            if (spawnEnergyCapacity >= 800) {
                return {
                    defaultParts: [],
                    extraParts: [CARRY, CARRY, MOVE],
                    partsMultiplier: requiredCarryParts / 2,
                    minCreeps: undefined,
                    maxCreeps: Infinity,
                    minCost: 150,
                    priority,
                    memoryAdditions: {
                        role: 'hauler',
                        roads: true,
                    },
                }
            }

            return {
                defaultParts: [],
                extraParts: [CARRY, MOVE],
                partsMultiplier: requiredCarryParts,
                minCreeps: undefined,
                maxCreeps: Infinity,
                minCost: 100,
                priority,
                memoryAdditions: {
                    role: 'hauler',
                },
            }
        })(),
    )

    // Construct requests for mineralHarvesters

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            // If there is no extractor, inform false

            if (!this.structures.extractor.length) return false

            if (!this.storage) return false

            if (this.storage.store.energy < 40000) return false

            // If there is no terminal, inform false

            if (!this.terminal) return false

            if (this.terminal.store.getFreeCapacity() <= 10000) return false

            // Get the mineral. If it's out of resources, inform false

            if (this.mineral.mineralAmount === 0) return false

            let minCost = 900

            if (spawnEnergyCapacity < minCost) return false

            return {
                defaultParts: [],
                extraParts: [WORK, WORK, MOVE, WORK, WORK, MOVE, WORK, MOVE, CARRY, CARRY, MOVE, WORK],
                partsMultiplier: this.get('mineralHarvestPositions')?.length * 4,
                minCreeps: 1,
                minCost,
                priority: 10 + this.creepsFromRoom.mineralHarvester.length * 3,
                memoryAdditions: {
                    role: 'mineralHarvester',
                    roads: true,
                },
            }
        })(),
    )

    // Construct requests for hubHaulers

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            // If there is no storage, inform false

            if (!this.storage) return false

            // Otherwise if there is no hubLink or terminal, inform false

            if (!this.hubLink && !this.terminal) return false

            return {
                defaultParts: [MOVE],
                extraParts: [CARRY],
                partsMultiplier: 8,
                minCreeps: 1,
                minCost: 300,
                priority: 7,
                memoryAdditions: {
                    role: 'hubHauler',
                },
            }
        })(),
    )

    // Construct requests for fastFillers

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            // Get the fastFiller positions, if there are none, inform false

            const fastFillerPositions: Coord[] = this.get('fastFillerPositions')
            if (!fastFillerPositions.length) return false

            let defaultParts = [CARRY, MOVE, CARRY]

            // If the controller level is more or equal to 7, increase the defaultParts

            if (this.controller.level >= 7) defaultParts = [CARRY, CARRY, CARRY, MOVE, CARRY]

            return {
                defaultParts,
                extraParts: [],
                partsMultiplier: 1,
                minCreeps: fastFillerPositions.length,
                minCost: 250,
                priority: 0.75,
                memoryAdditions: {
                    role: 'fastFiller',
                },
            }
        })(),
    )

    // Get enemyAttackers in the this

    let enemyAttackers: Creep[]

    // If there are no towers

    if (!this.structures.tower.length) {
        // Consider invaders as significant attackers

        enemyAttackers = this.enemyAttackers.filter(function (creep) {
            return !creep.isOnExit()
        })
    }

    // Otherwise
    else {
        // Don't consider invaders

        enemyAttackers = this.enemyAttackers.filter(function (creep) {
            return creep.owner.username !== 'Invader' && !creep.isOnExit()
        })
    }

    // Get the attackValue of the attackers

    let attackStrength = 0

    // Loop through each enemyAttacker

    for (const enemyAttacker of enemyAttackers) {
        // Increase attackValue by the creep's heal power

        attackStrength += enemyAttacker.strength
    }

    // Construct requests for meleeDefenders

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            // Inform false if there are no enemyAttackers

            if (!enemyAttackers.length) return false

            if (this.controller.safeMode) return false

            return {
                defaultParts: [],
                extraParts: [ATTACK, ATTACK, MOVE],
                partsMultiplier: attackStrength,
                minCreeps: undefined,
                maxCreeps: Math.max(enemyAttackers.length, 5),
                minCost: 210,
                priority: 6 + this.creepsFromRoom.meleeDefender.length,
                memoryAdditions: {
                    role: 'meleeDefender',
                    roads: true,
                },
            }
        })(),
    )

    // Get the estimates income

    const estimatedIncome = this.estimateIncome()

    // Construct requests for builders

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            // Stop if there are no construction sites

            if (this.find(FIND_MY_CONSTRUCTION_SITES).length === 0) return false

            let priority = 10 + this.creepsFromRoom.builder.length
            let partsMultiplier = 0

            // If there is a storage

            if (this.storage) {
                // If the storage is sufficiently full, provide x amount per y enemy in storage

                if (this.storage.store.getUsedCapacity(RESOURCE_ENERGY) >= builderSpawningWhenStorageThreshold)
                    partsMultiplier += this.storage.store.getUsedCapacity(RESOURCE_ENERGY) / 8000
            }

            // Otherwise if there is no storage
            else partsMultiplier += Math.floor(estimatedIncome / 3)

            // If all RCL 3 extensions are build

            if (spawnEnergyCapacity >= 800) {
                return {
                    defaultParts: [],
                    extraParts: [WORK, WORK, MOVE, CARRY, CARRY, MOVE, CARRY, CARRY, MOVE, CARRY, MOVE, WORK],
                    partsMultiplier: partsMultiplier / 3,
                    minCreeps: undefined,
                    maxCreeps: Infinity,
                    minCost: 750,
                    priority,
                    memoryAdditions: {
                        role: 'builder',
                        roads: true,
                    },
                }
            }

            if (!this.fastFillerContainerLeft && !this.fastFillerContainerRight) {
                return {
                    defaultParts: [],
                    extraParts: [WORK, CARRY, CARRY, MOVE],
                    partsMultiplier: partsMultiplier,
                    minCreeps: undefined,
                    maxCreeps: Infinity,
                    minCost: 250,
                    priority,
                    memoryAdditions: {
                        role: 'builder',
                        roads: true,
                    },
                }
            }

            return {
                defaultParts: [],
                extraParts: [MOVE, CARRY, MOVE, WORK],
                partsMultiplier,
                minCreeps: undefined,
                maxCreeps: Infinity,
                minCost: 250,
                priority,
                memoryAdditions: {
                    role: 'builder',
                },
            }
        })(),
    )

    // Construct requests for mainainers

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            const priority = 8 + this.creepsFromRoom.maintainer.length

            // Filter possibleRepairTargets with less than 1/5 health, stopping if there are none

            const repairTargets = [...this.structures.road, ...this.structures.container].filter(
                structure => structure.hitsMax * 0.2 >= structure.hits,
            )
            // Get ramparts below their max hits

            const ramparts = this.structures.rampart.filter(rampart => rampart.hits < rampart.hitsMax)

            // If there are no ramparts or repair targets

            if (!ramparts.length && !repairTargets.length) return false

            // Construct the partsMultiplier

            let partsMultiplier = 1

            // For each road, add a multiplier

            partsMultiplier += this.structures.road.length * 0.01

            // For each container, add a multiplier

            partsMultiplier += this.structures.container.length * 0.2

            // For each rampart, add a multiplier

            partsMultiplier += ramparts.length * 0.05

            // For every attackValue, add a multiplier

            partsMultiplier += attackStrength * 0.5

            // For every x energy in storage, add 1 multiplier

            if (this.storage) partsMultiplier += this.storage.store.getUsedCapacity(RESOURCE_ENERGY) / 20000

            // If all RCL 3 extensions are build

            if (spawnEnergyCapacity >= 800) {
                return {
                    defaultParts: [],
                    extraParts: [CARRY, MOVE, WORK],
                    partsMultiplier,
                    minCreeps: undefined,
                    maxCreeps: Infinity,
                    minCost: 200,
                    priority,
                    memoryAdditions: {
                        role: 'maintainer',
                        roads: true,
                    },
                }
            }

            return {
                defaultParts: [],
                extraParts: [MOVE, CARRY, MOVE, WORK],
                partsMultiplier,
                minCreeps: undefined,
                maxCreeps: Infinity,
                minCost: 250,
                priority,
                memoryAdditions: {
                    role: 'maintainer',
                },
            }
        })(),
    )

    // Construct requests for upgraders

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            let partsMultiplier = 1
            let maxCreeps = this.get('upgradePositions').length - 1
            const priority = 9

            // If there are enemyAttackers and the controller isn't soon to downgrade

            if (enemyAttackers.length && this.controller.ticksToDowngrade > controllerDowngradeUpgraderNeed)
                return false

            // If there is a storage

            if (this.storage) {
                // If the storage is sufficiently full, provide x amount per y enemy in storage

                if (this.storage.store.getUsedCapacity(RESOURCE_ENERGY) >= upgraderSpawningWhenStorageThreshold)
                    partsMultiplier = Math.pow(this.storage.store.getUsedCapacity(RESOURCE_ENERGY) / 10000, 2)
                // Otherwise, set partsMultiplier to 0
                else partsMultiplier = 0
            }

            // Otherwise if there is no storage
            else {
                partsMultiplier += estimatedIncome * 0.75
            }

            // Get the controllerLink and baseLink

            const controllerLink = this.controllerLink

            // If the controllerLink is defined

            if (controllerLink) {
                const hubLink = this.hubLink
                const sourceLinks = [this.source1Link, this.source2Link]

                // If there are transfer links, max out partMultiplier to their ability

                if (hubLink && sourceLinks.length) {

                    let maxPartsMultiplier = 0

                    if (hubLink) {
                        // Get the range between the controllerLink and hubLink

                        const range = getRange(controllerLink.pos.x, hubLink.pos.x, controllerLink.pos.y, hubLink.pos.y)

                        // Limit partsMultiplier at the range with a multiplier

                        maxPartsMultiplier += (controllerLink.store.getCapacity(RESOURCE_ENERGY) * 0.7) / range
                    } else maxCreeps -= 1

                    for (const sourceLink of sourceLinks) {
                        if (!sourceLink) continue

                        // Get the range between the controllerLink and hubLink

                        const range = getRange(
                            controllerLink.pos.x,
                            sourceLink.pos.x,
                            controllerLink.pos.y,
                            sourceLink.pos.y,
                        )

                        // Limit partsMultiplier at the range with a multiplier

                        maxPartsMultiplier += (controllerLink.store.getCapacity(RESOURCE_ENERGY) * 0.5) / range
                    }

                    partsMultiplier = Math.min(partsMultiplier, maxPartsMultiplier)
                }
            }

            // If there are construction sites of my ownership in the this, set multiplier to 1

            if (this.find(FIND_MY_CONSTRUCTION_SITES).length) partsMultiplier = 0

            // Intitialize the threshold

            const threshold = 0.15

            // If the controllerContainer or controllerLink exists

            if (this.controllerContainer || controllerLink) {
                // If the controller is level 8

                if (this.controller.level === 8) {
                    // If the controller is near to downgrading

                    if (this.controller.ticksToDowngrade < controllerDowngradeUpgraderNeed)
                        partsMultiplier = Math.max(partsMultiplier, 3)

                    partsMultiplier = Math.min(Math.round(partsMultiplier / 3), 5)
                    if (partsMultiplier === 0) return false

                    return {
                        defaultParts: [],
                        extraParts: [
                            WORK,
                            WORK,
                            MOVE,
                            CARRY,
                            WORK,
                            WORK,
                            MOVE,
                            WORK,
                            WORK,
                            WORK,
                            MOVE,
                            WORK,
                            WORK,
                            MOVE,
                            CARRY,
                            WORK,
                            MOVE,
                            WORK,
                            WORK,
                            MOVE,
                            WORK,
                            WORK,
                            MOVE,
                            CARRY,
                            WORK,
                            MOVE,
                        ],
                        partsMultiplier,
                        threshold,
                        minCreeps: 1,
                        minCost: 300,
                        priority,
                        memoryAdditions: {
                            role: 'controllerUpgrader',
                            roads: true,
                        },
                    }
                }

                // Otherwise if the spawnEnergyCapacity is more than 800

                if (spawnEnergyCapacity >= 800) {
                    // If the controller is near to downgrading, set partsMultiplier to x

                    if (this.controller.ticksToDowngrade < controllerDowngradeUpgraderNeed)
                        partsMultiplier = Math.max(partsMultiplier, 6)

                    partsMultiplier = Math.round(partsMultiplier / 6)
                    if (partsMultiplier === 0) return false

                    return {
                        defaultParts: [CARRY],
                        extraParts: [WORK, WORK, WORK, MOVE, WORK, WORK, WORK],
                        partsMultiplier,
                        threshold,
                        minCreeps: undefined,
                        maxCreeps,
                        minCost: 700,
                        priority,
                        memoryAdditions: {
                            role: 'controllerUpgrader',
                            roads: true,
                        },
                    }
                }

                // If the controller is near to downgrading, set partsMultiplier to x

                if (this.controller.ticksToDowngrade < controllerDowngradeUpgraderNeed)
                    partsMultiplier = Math.max(partsMultiplier, 4)

                partsMultiplier = Math.round(partsMultiplier / 4)
                if (partsMultiplier === 0) return false

                return {
                    defaultParts: [CARRY],
                    extraParts: [WORK, MOVE, WORK, WORK, WORK],
                    partsMultiplier,
                    threshold,
                    minCreeps: undefined,
                    maxCreeps,
                    minCost: 200,
                    priority,
                    memoryAdditions: {
                        role: 'controllerUpgrader',
                        roads: true,
                    },
                }
            }

            // If the controller is near to downgrading, set partsMultiplier to x

            if (this.controller.ticksToDowngrade < controllerDowngradeUpgraderNeed)
                partsMultiplier = Math.max(partsMultiplier, 1)
            if (this.controller.level < 2) partsMultiplier = Math.max(partsMultiplier, 1)

            if (spawnEnergyCapacity >= 800) {
                return {
                    defaultParts: [],
                    extraParts: [CARRY, MOVE, WORK],
                    partsMultiplier,
                    threshold,
                    maxCreeps: Infinity,
                    minCost: 200,
                    priority,
                    memoryAdditions: {
                        role: 'controllerUpgrader',
                        roads: true,
                    },
                }
            }

            return {
                defaultParts: [],
                extraParts: [MOVE, CARRY, MOVE, WORK],
                partsMultiplier,
                threshold,
                maxCreeps: Infinity,
                minCost: 250,
                priority,
                memoryAdditions: {
                    role: 'controllerUpgrader',
                },
            }
        })(),
    )

    let remoteHaulerNeed = 0

    const minRemotePriority = 10

    const remoteNamesByEfficacy: string[] = this.get('remoteNamesByEfficacy')

    for (let index = 0; index < remoteNamesByEfficacy.length; index += 1) {
        const remoteName = remoteNamesByEfficacy[index]
        const remoteNeeds = Memory.rooms[remoteName].needs

        // Add up econ needs for this this

        const totalRemoteNeed =
            Math.max(remoteNeeds[remoteNeedsIndex.source1RemoteHarvester], 0) +
            Math.max(remoteNeeds[remoteNeedsIndex.source2RemoteHarvester], 0) +
            Math.max(remoteNeeds[remoteNeedsIndex.remoteHauler], 0) +
            Math.max(remoteNeeds[remoteNeedsIndex.remoteReserver], 0) +
            Math.max(remoteNeeds[remoteNeedsIndex.remoteDefender], 0) +
            Math.max(remoteNeeds[remoteNeedsIndex.remoteCoreAttacker], 0) +
            Math.max(remoteNeeds[remoteNeedsIndex.remoteDismantler], 0)

        // If there is a need for any econ creep, inform the index

        if (totalRemoteNeed <= 0) continue

        const remoteMemory = Memory.rooms[remoteName]

        // Get the sources in order of efficacy

        const sourcesByEfficacy = findRemoteSourcesByEfficacy(remoteName)

        const possibleReservation = spawnEnergyCapacity >= 650

        // Loop through each index of sourceEfficacies

        for (let index = 0; index < remoteMemory.sourceEfficacies.length; index += 1) {
            // Get the income based on the reservation of the this and remoteHarvester need

            const income =
                (possibleReservation ? 10 : 5) -
                (remoteMemory.needs[remoteNeedsIndex[remoteHarvesterRoles[index]]] + (possibleReservation ? 4 : 2))

            // Find the number of carry parts required for the source, and add it to the remoteHauler need

            remoteHaulerNeed += findCarryPartsRequired(remoteMemory.sourceEfficacies[index], income)
        }

        const remotePriority = minRemotePriority + index

        // Construct requests for source1RemoteHarvesters

        this.constructSpawnRequests(
            ((): SpawnRequestOpts | false => {
                // If there are no needs for this this, inform false

                if (remoteNeeds[remoteNeedsIndex.source1RemoteHarvester] <= 0) return false

                if (spawnEnergyCapacity >= 950) {
                    return {
                        defaultParts: [CARRY],
                        extraParts: [WORK, MOVE],
                        partsMultiplier: Math.max(remoteNeeds[remoteNeedsIndex.source1RemoteHarvester], 0),
                        groupComparator: this.creepsFromRoomWithRemote[remoteName].source1RemoteHarvester,
                        threshold: 0.1,
                        minCreeps: 1,
                        maxCreeps: Infinity,
                        maxCostPerCreep: 50 + 150 * 6,
                        minCost: 200,
                        priority: remotePriority - (sourcesByEfficacy[0] === 'source1' ? 0.1 : 0),
                        memoryAdditions: {
                            role: 'source1RemoteHarvester',
                            roads: true,
                        },
                    }
                }

                return {
                    defaultParts: [CARRY],
                    extraParts: [WORK, WORK, MOVE],
                    partsMultiplier: Math.max(remoteNeeds[remoteNeedsIndex.source1RemoteHarvester], 0),
                    groupComparator: this.creepsFromRoomWithRemote[remoteName].source1RemoteHarvester,
                    threshold: 0.1,
                    minCreeps: undefined,
                    maxCreeps: global[remoteName]?.source1HarvestPositions?.length || Infinity,
                    maxCostPerCreep: 50 + 150 * 6,
                    minCost: 300,
                    priority: remotePriority - (sourcesByEfficacy[0] === 'source1' ? 0.1 : 0),
                    memoryAdditions: {
                        role: 'source1RemoteHarvester',
                        roads: true,
                    },
                }
            })(),
        )

        // Construct requests for source2RemoteHarvesters

        this.constructSpawnRequests(
            ((): SpawnRequestOpts | false => {
                // If there are no needs for this this, inform false

                if (remoteNeeds[remoteNeedsIndex.source2RemoteHarvester] <= 0) return false

                if (spawnEnergyCapacity >= 950) {
                    return {
                        defaultParts: [CARRY],
                        extraParts: [WORK, MOVE],
                        partsMultiplier: Math.max(remoteNeeds[remoteNeedsIndex.source2RemoteHarvester], 0),
                        groupComparator: this.creepsFromRoomWithRemote[remoteName].source2RemoteHarvester,
                        threshold: 0.1,
                        minCreeps: 1,
                        maxCreeps: Infinity,
                        minCost: 200,
                        priority: remotePriority - (sourcesByEfficacy[0] === 'source2' ? 0.1 : 0),
                        memoryAdditions: {
                            role: 'source2RemoteHarvester',
                            roads: true,
                        },
                    }
                }

                return {
                    defaultParts: [CARRY],
                    extraParts: [WORK, WORK, MOVE],
                    partsMultiplier: Math.max(remoteNeeds[remoteNeedsIndex.source2RemoteHarvester], 0),
                    groupComparator: this.creepsFromRoomWithRemote[remoteName].source2RemoteHarvester,
                    threshold: 0.1,
                    minCreeps: undefined,
                    maxCreeps: global[remoteName]?.source2HarvestPositions?.length || Infinity,
                    maxCostPerCreep: 150 * 6,
                    minCost: 300,
                    priority: remotePriority - (sourcesByEfficacy[0] === 'source2' ? 0.1 : 0),
                    memoryAdditions: {
                        role: 'source2RemoteHarvester',
                        roads: true,
                    },
                }
            })(),
        )

        // Construct requests for remoteReservers

        this.constructSpawnRequests(
            ((): SpawnRequestOpts | false => {
                let cost = 650

                // If there isn't enough spawnEnergyCapacity to spawn a remoteReserver, inform false

                if (spawnEnergyCapacity < cost) return false

                // If there are no needs for this this, inform false

                if (remoteNeeds[remoteNeedsIndex.remoteReserver] <= 0) return false

                return {
                    defaultParts: [],
                    extraParts: [MOVE, CLAIM],
                    partsMultiplier: 6,
                    groupComparator: this.creepsFromRoomWithRemote[remoteName].remoteReserver,
                    minCreeps: 1,
                    maxCreeps: Infinity,
                    minCost: cost,
                    priority: remotePriority + 0.3,
                    memoryAdditions: {
                        role: 'remoteReserver',
                    },
                }
            })(),
        )

        // Construct requests for remoteDefenders

        this.constructSpawnRequests(
            ((): SpawnRequestOpts | false => {

                // If there are no related needs

                if (remoteNeeds[remoteNeedsIndex.remoteDefender] <= 0) return false

                const minCost = 400
                const cost = 900
                const extraParts = [RANGED_ATTACK, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK, MOVE, HEAL, MOVE]
                const strengthOfParts = findStrengthOfParts(extraParts)

                // If there isn't enough spawnEnergyCapacity to spawn a remoteDefender, inform false

                if (spawnEnergyCapacity < minCost) return false

                // If max spawnable strength is less that needed

                if (strengthOfParts * (spawnEnergyCapacity / cost) < remoteNeeds[remoteNeedsIndex.remoteDefender]) {
                    // Abandon the this for some time

                    Memory.rooms[remoteName].abandoned = 1000
                    return false
                }

                const partsMultiplier = Math.max(
                    Math.floor(remoteNeeds[remoteNeedsIndex.remoteDefender] / strengthOfParts) * 1.2,
                    1,
                )

                return {
                    defaultParts: [],
                    extraParts,
                    partsMultiplier,
                    groupComparator: this.creepsFromRoomWithRemote[remoteName].remoteDefender,
                    minCreeps: 1,
                    minCost,
                    priority: minRemotePriority - 3,
                    memoryAdditions: {
                        role: 'remoteDefender',
                    },
                }
            })(),
        )

        // Construct requests for remoteCoreAttackers

        this.constructSpawnRequests(
            ((): SpawnRequestOpts | false => {
                // If there are no related needs

                if (remoteNeeds[remoteNeedsIndex.remoteCoreAttacker] <= 0) return false

                // Define the minCost and strength

                const cost = 130
                const extraParts = [ATTACK, MOVE]
                const minCost = cost * extraParts.length

                return {
                    defaultParts: [],
                    extraParts,
                    partsMultiplier: 50 / extraParts.length,
                    groupComparator: this.creepsFromRoomWithRemote[remoteName].remoteCoreAttacker,
                    minCreeps: 1,
                    minCost,
                    priority: minRemotePriority - 2,
                    memoryAdditions: {
                        role: 'remoteCoreAttacker',
                    },
                }
            })(),
        )

        // Construct requests for remoteDismantler

        this.constructSpawnRequests(
            ((): SpawnRequestOpts | false => {
                // If there are no related needs

                if (remoteNeeds[remoteNeedsIndex.remoteDismantler] <= 0) return false

                // Define the minCost and strength

                const cost = 150
                const extraParts = [WORK, MOVE]

                return {
                    defaultParts: [],
                    extraParts,
                    partsMultiplier: 50 / extraParts.length,
                    groupComparator: this.creepsFromRoomWithRemote[remoteName].remoteDismantler,
                    minCreeps: 1,
                    minCost: cost * 2,
                    priority: minRemotePriority - 1,
                    memoryAdditions: {
                        role: 'remoteDismantler',
                    },
                }
            })(),
        )
    }

    // Construct requests for remoteHaulers

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            if (remoteHaulerNeed === 0) return false

            /*
               // If all RCL 3 extensions are built

               if (spawnEnergyCapacity >= 800) {

                    partsMultiplier = remoteHaulerNeed / 2

                    return {
                         defaultParts: [],
                         extraParts: [CARRY, CARRY, MOVE],
                         threshold: 0.1,
                         partsMultiplier,
                         maxCreeps: Infinity,
                         minCost: 300,
                         priority: minRemotePriority - 0.2,
                         memoryAdditions: {
                              role: 'remoteHauler',
                              roads: true,
                         },
                    }
               }
 */
            partsMultiplier = remoteHaulerNeed

            return {
                defaultParts: [],
                extraParts: [CARRY, MOVE],
                threshold: 0.1,
                partsMultiplier,
                maxCreeps: Infinity,
                minCost: 200,
                priority: minRemotePriority - 0.2,
                memoryAdditions: {
                    role: 'remoteHauler',
                },
            }
        })(),
    )

    // Construct requests for scouts

    this.constructSpawnRequests(
        ((): SpawnRequestOpts | false => {
            return {
                defaultParts: [MOVE],
                extraParts: [],
                partsMultiplier: 1,
                minCreeps: 2,
                maxCreeps: Infinity,
                minCost: 100,
                priority: 6,
                memoryAdditions: {
                    role: 'scout',
                },
            }
        })(),
    )

    if (this.memory.claimRequest) {
        const claimRequestNeeds = Memory.claimRequests[this.memory.claimRequest].needs

        // Construct requests for claimers

        this.constructSpawnRequests(
            ((): SpawnRequestOpts | false => {
                // If there is no claimer need

                if (claimRequestNeeds[claimRequestNeedsIndex.claimer] <= 0) return false

                return {
                    defaultParts: [MOVE, MOVE, CLAIM, MOVE],
                    extraParts: [],
                    partsMultiplier: 1,
                    minCreeps: 1,
                    minCost: 750,
                    priority: 8.1,
                    memoryAdditions: {
                        role: 'claimer',
                    },
                }
            })(),
        )

        // Requests for vanguard

        this.constructSpawnRequests(
            ((): SpawnRequestOpts | false => {
                // If there is no vanguard need

                if (claimRequestNeeds[claimRequestNeedsIndex.vanguard] <= 0) return false

                return {
                    defaultParts: [],
                    extraParts: [WORK, MOVE, CARRY, MOVE],
                    partsMultiplier: claimRequestNeeds[claimRequestNeedsIndex.vanguard],
                    minCreeps: undefined,
                    maxCreeps: Infinity,
                    minCost: 250,
                    priority: 8.2 + this.creepsFromRoom.vanguard.length,
                    memoryAdditions: {
                        role: 'vanguard',
                    },
                }
            })(),
        )

        // Requests for vanguardDefender

        this.constructSpawnRequests(
            ((): SpawnRequestOpts | false => {
                const minCost = 400
                const cost = 900
                const extraParts = [RANGED_ATTACK, MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK, MOVE, HEAL, MOVE]
                const strengthOfParts = findStrengthOfParts(extraParts)

                // If there isn't enough spawnEnergyCapacity to spawn a vanguardDefender, inform false

                if (spawnEnergyCapacity < minCost) return false

                // If there are no related needs

                if (claimRequestNeeds[claimRequestNeedsIndex.vanguardDefender] <= 0) return false

                // If max spawnable strength is less that needed

                if (
                    strengthOfParts * (spawnEnergyCapacity / cost) <
                    claimRequestNeeds[claimRequestNeedsIndex.vanguardDefender]
                ) {
                    // Abandon the this for some time

                    Memory.claimRequests[this.memory.claimRequest].abadon = 20000
                    /* Memory.thiss[remoteName].abandoned = 1000 */
                    return false
                }

                const partsMultiplier = Math.max(
                    Math.floor(claimRequestNeeds[claimRequestNeedsIndex.vanguardDefender] / strengthOfParts) * 1.2,
                    1,
                )

                // If there is no vanguardDefender need

                if (claimRequestNeeds[claimRequestNeedsIndex.vanguardDefender] <= 0) return false

                return {
                    defaultParts: [],
                    extraParts,
                    partsMultiplier,
                    minCreeps: 1,
                    minCost,
                    priority: 8 + this.creepsFromRoom.vanguardDefender.length,
                    memoryAdditions: {
                        role: 'vanguardDefender',
                    },
                }
            })(),
        )
    }

    // If CPU logging is enabled, log the CPU used by this manager

    if (Memory.cpuLogging) customLog('Spawn Request Manager', (Game.cpu.getUsed() - managerCPUStart).toFixed(2))
}
