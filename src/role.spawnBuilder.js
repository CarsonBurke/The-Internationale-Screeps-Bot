var roleUpgrader = require('role.upgrader');
module.exports = {
    run: function(creep) {

        var target = creep.memory.target

        let creepIsEdge = (creep.pos.x <= 0 || creep.pos.x >= 49 || creep.pos.y <= 0 || creep.pos.y >= 49)

        if (creepIsEdge) {

            const direction = creep.pos.getDirectionTo(25, 25)
            creep.move(direction);

        } else if (creep.room.name != target) {

            creep.say("BS")

            const route = Game.map.findRoute(creep.room.name, target);

            if (route.length > 0) {

                creep.say(target)

                const exit = creep.pos.findClosestByRange(route[0].exit)
                creep.moveTo(exit);
            }
        } else {

            var constructionSite = creep.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);

            if (constructionSite == undefined) {

                roleUpgrader.run(creep);

            } else if (creep.memory.building == true && creep.carry.energy == 0) {

                creep.memory.building = false;

            } else if (creep.memory.building == false && creep.carry.energy == creep.carryCapacity) {

                creep.memory.building = true;

            }
            if (creep.memory.building == true && constructionSite) {

                creep.say("🚧")

                if (creep.build(constructionSite) == ERR_NOT_IN_RANGE) {

                    creep.moveTo(constructionSite, { reusePath: 50 });

                }
            } else if (constructionSite) {

                var containers = creep.room.find(FIND_STRUCTURES, {
                    filter: (s) => s.structureType == STRUCTURE_CONTAINER
                })

                var container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: (s) => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= creep.store.getCapacity()
                })

                var storage = creep.room.storage

                creep.say("S")

                if (storage && store.store[RESOURCE_ENERGY] >= 5000) {
                    if (creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {

                        creep.say("S")
                        creep.moveTo(storage, { reusePath: 50 })

                    }
                } else if (containers.length >= 2 && container) {
                    if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {

                        creep.say("🛄" + containers.length)
                        creep.moveTo(container, { reusePath: 50 });
                    }
                } else {

                    var droppedResources = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                        filter: (s) => s.resourceType == RESOURCE_ENERGY && s.energy >= creep.store.getCapacity() * 0.5
                    });

                    if (droppedResources) {

                        creep.say("💡")

                        if (creep.pickup(droppedResources) == ERR_NOT_IN_RANGE) {

                            creep.moveTo(droppedResources, { reusePath: 50 })

                        }
                    } else {

                        let source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE)

                        creep.say("Source")

                        if (creep.harvest(source) == ERR_NOT_IN_RANGE) {

                            creep.moveTo(source, { reusePath: 50 })
                        }
                    }
                }
            }
        }
    }
};