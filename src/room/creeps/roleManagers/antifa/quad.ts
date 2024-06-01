import {
  CombatRequestKeys,
  CreepMemoryKeys,
  FlagNames,
  MovedTypes,
  Result,
  RoomMemoryKeys,
  RoomTypes,
  WorkTypes,
  customColors,
  quadAttackMemberOffsets,
} from '../../../../constants/general'
import {
  arePositionsEqual,
  doesCoordExist,
  findClosestObject,
  findObjectWithID,
  getRangeXY,
  getRange,
  isExit,
  packAsNum,
  findHighestScore,
  sortBy,
  forCoordsInRange,
} from 'utils/utils'
import { packCoord, packXYAsCoord, unpackCoord } from 'other/codec'
import { Antifa } from './antifa'
import { CustomPathFinderArgs, PathGoal } from 'international/customPathFinder'
import { RoomManager } from 'room/room'

const rangedFleeRange = 5
const meleeFleeRange = 3
/**
 * should replace this with something that doesn't create a circular dependency
 */
const packedQuadAttackMemberOffsets = quadAttackMemberOffsets.map(coord => packCoord(coord))

interface EnemyThreatData {
  coords: Uint8Array
  goals: PathGoal[]
}

export class Quad {
  /**
   *
   */
  moveType: SquadMoveTypes
  /**
   * All squad members, where index 0 is the leader
   */
  members: Antifa[] = []
  /**
   * @constant 1 2
   * @constant 3 4
   * @description where 1 is leader and 2, 3, 4 are squad members
   */
  memberNames: string[] = []
  leader: Antifa
  membersByCoord: { [packedCoord: string]: Antifa }

  target: Structure | Creep

  constructor(memberNames: string[]) {
    for (const memberName of memberNames) {
      const member = Game.creeps[memberName]
      this.members.push(member)
      this.memberNames.push(memberName)

      member.squad = this
      member.squadRan = true
    }

    this.leader = this.members[0]
    this.moveType = this.leader.memory[CreepMemoryKeys.squadMoveType]

    this.sortMembersByCoord()

    if (Memory.combatRequests[this.leader.memory[CreepMemoryKeys.combatRequest]])
      Memory.combatRequests[this.leader.memory[CreepMemoryKeys.combatRequest]][
        CombatRequestKeys.quads
      ] += 1
  }

  sortMembersByCoord() {
    const unsortedMembersByCoord: { [packedCoord: string]: Antifa } = {}

    for (const member of this.members) {
      unsortedMembersByCoord[packCoord(member.pos)] = member
    }

    this.membersByCoord = {
      [packCoord(this.leader.pos)]: this.leader,
    }

    const packedMemberCoords = [
      packXYAsCoord(this.leader.pos.x, this.leader.pos.y + 1),
      packXYAsCoord(this.leader.pos.x + 1, this.leader.pos.y + 1),
      packXYAsCoord(this.leader.pos.x + 1, this.leader.pos.y),
    ]

    for (let i = 0; i < packedMemberCoords.length; i++) {
      const packedCoord = packedMemberCoords[i]
      const member = unsortedMembersByCoord[packedCoord]
      if (!member) continue

      this.membersByCoord[packedCoord] = member
    }
  }

  run() {
    this.leader.message = this.moveType

    this.passiveHealQuad()

    if (this.runCombatRoom()) return

    if (!this.getInFormation()) {
      this.passiveRangedAttack()
      return
    }
    /* else this.advancedTransform() */

    this.leader.message = 'IF'

    if (this.leader.room.roomManager.enemyDamageThreat && this.runCombat()) return

    this.passiveRangedAttack()

    this.createMoveRequest({
      goals: [
        {
          pos: new RoomPosition(25, 25, this.leader.memory[CreepMemoryKeys.combatRequest]),
          range: 25,
        },
      ],
      typeWeights: {
        [RoomTypes.enemy]: Infinity,
        [RoomTypes.ally]: 2,
        [RoomTypes.sourceKeeper]: 5,
        [RoomTypes.neutral]: 3,
      },
    })
  }

  runCombatRoom() {
    if (this.leader.room.name !== this.leader.memory[CreepMemoryKeys.combatRequest]) return false
    /*
        if (!this.leader.room.roomManager.enemyDamageThreat) {
            for (const member of this.members) member.runCombat()
            return true
        }
 */
    if (!this.getInFormation()) {
      this.passiveRangedAttack()
      return true
    }

    this.runCombat()

    return true
  }

  runCombat() {
    if (this.leader.memory[CreepMemoryKeys.squadCombatType] === 'rangedAttack') {
      this.passiveRangedAttack()

      const nearbyThreat = this.leader.room.roomManager.enemyAttackers.find(
        enemyCreep =>
          this.findMinRange(enemyCreep.pos) <= 6 &&
          (enemyCreep.combatStrength.ranged || enemyCreep.combatStrength.melee),
      )
      if (
        nearbyThreat &&
        !nearbyThreat.room.findStructureAtCoord(
          nearbyThreat.pos,
          structure => structure.structureType === STRUCTURE_RAMPART,
        )
      ) {
        this.target = nearbyThreat
        this.target.room.targetVisual(this.leader.pos, this.target.pos, true)
        /*
                // If we are not threatened, try to transform optimally

                const enemyThreatCoords = this.enemyThreatDataRanged.coords
                if (!this.members.find(member => enemyThreatCoords[packAsNum(member.pos)])) {
                    this.advancedTransform()
                }
                */
      }

      const kiteResult = this.rangedKite()
      if (kiteResult === Result.action) return true
      if (kiteResult === Result.stop) {
        return true
      }

      this.advancedTransform()

      if (this.bulldoze()) return true
      if (this.rangedAttackStructures()) return true
      if (this.advancedRangedAttack()) return true
      return false
    }
    if (this.leader.memory[CreepMemoryKeys.squadCombatType] === 'attack') {
      if (this.advancedAttack()) return false
    }

    this.advancedDismantle()
    return false
  }

  getInFormation(): boolean {
    if (this.leader.isOnExit) return true

    /* this.leader.room.visualizeCostMatrix(this.leader.room.roomManager.quadCostMatrix) */

    if (
      this.leader.room.roomManager.quadCostMatrix.get(this.leader.pos.x, this.leader.pos.y) >= 50
    ) {
      this.leader.room.coordVisual(this.leader.pos.x, this.leader.pos.y)
      /*
            this.leader.createMoveRequest({
                goals: [
                    {
                        pos: this.leader.pos,
                        range: 1,
                    },
                ],
                flee: true,
            })
            return false
 */
      return true
    }

    let inFormation = true

    if (this.moveType === 'transport') {
      let lastMember = this.leader

      for (let i = 1; i < this.members.length; i++) {
        const member = this.members[i]

        if (
          getRangeXY(member.pos.x, lastMember.pos.x, member.pos.y, lastMember.pos.y) <= 1 &&
          member.room.name === lastMember.room.name
        ) {
          lastMember = member
          continue
        }

        member.createMoveRequest({
          goals: [
            {
              pos: lastMember.pos,
              range: 1,
            },
          ],
        })

        if (member.isOnExit) continue

        if (member.moveRequest === packCoord(this.leader.pos)) {
        }

        lastMember = member
        inFormation = false
      }

      return inFormation
    }

    let newLeader: Antifa
    let newLeaderIndex: number

    // Attack mode

    for (let i = 1; i < this.members.length; i++) {
      const offset = quadAttackMemberOffsets[i]
      const goalCoord = {
        x: this.leader.pos.x + offset.x,
        y: this.leader.pos.y + offset.y,
      }

      if (isExit(goalCoord)) return true
      if (!doesCoordExist(goalCoord)) return true

      const goalPos = new RoomPosition(goalCoord.x, goalCoord.y, this.leader.room.name)

      const member = this.members[i]
      if (arePositionsEqual(member.pos, goalPos)) continue

      member.createMoveRequest({
        goals: [
          {
            pos: goalPos,
            range: 0,
          },
        ],
      })

      if (member.moveRequest === packCoord(this.leader.pos)) {
        newLeader = member
        newLeaderIndex = i
      }

      inFormation = false
    }

    if (newLeader) {
      this.members[newLeaderIndex] = this.leader
      this.memberNames[newLeaderIndex] = this.leader.name
      this.members[0] = newLeader
      this.memberNames[0] = newLeader.name
      this.leader = newLeader

      for (const member of this.members) {
        member.memory[CreepMemoryKeys.squadMembers] = this.memberNames
      }
    }

    return inFormation
  }

  holdFormation() {
    for (const member of this.members) member.moved = MovedTypes.moved
  }

  createMoveRequest(opts: CustomPathFinderArgs, moveLeader = this.leader) {
    if (!this.willMove) {
      for (const member1 of this.members) {
        if (!member1.fatigue) continue

        for (const member2 of this.members) {
          if (member2.name === member1.name) continue
          member1.room.targetVisual(member1.pos, member2.pos, true)
          member2.pull(member1)
        }
      }

      /* this.holdFormation() */
      return false
    }

    if (this.moveType === 'transport') {
      if (!moveLeader.createMoveRequest(opts)) return false

      let lastMember = moveLeader

      for (let i = 1; i < this.members.length; i++) {
        const member = this.members[i]
        member.assignMoveRequest(lastMember.pos)

        lastMember = member
      }

      return true
    }

    // Attack mode

    opts.overrideCostMatrixes = function (roomName) {
      return [RoomManager.roomManagers[roomName].quadCostMatrix]
    }
    moveLeader.createMoveRequest(opts)

    if (!moveLeader.moveRequest) return false
    if (!this.membersAttackMove()) return false

    return true
  }

  membersAttackMove(moveLeader = this.leader) {
    const moveRequestCoord = unpackCoord(moveLeader.moveRequest)

    const moveLeaderOffset = {
      x: moveLeader.pos.x - moveRequestCoord.x,
      y: moveLeader.pos.y - moveRequestCoord.y,
    }

    for (let i = 1; i < this.members.length; i++) {
      const member = this.members[i]
      const goalCoord = {
        x: member.pos.x - moveLeaderOffset.x,
        y: member.pos.y - moveLeaderOffset.y,
      }

      if (!doesCoordExist(goalCoord)) continue

      if (member.room.roomManager.quadCostMatrix.get(goalCoord.x, goalCoord.y) >= 255) continue

      member.assignMoveRequest(goalCoord)
    }

    return true
  }

  private scoreMemberTransform(memberName: string, coord: Coord) {
    const member = Game.creeps[memberName]
    let score = (1 - member.defenceStrength) * 5000
    const range = getRangeXY(this.target.pos.x, coord.x, this.target.pos.y, coord.y)
    /*
        const range = getRangeXY(this.target.pos.x, coord.x, this.target.pos.y, coord.y)

        if (this.leader.memory[CreepMemoryKeys.squadCombatType] === 'rangedAttack') {
            score += rangedMassAttackMultiplierByRange[range] * member.combatStrength.ranged || 0

            return score
        }

        if (range > 1) return score
 */

    if (this.leader.memory[CreepMemoryKeys.squadCombatType] === 'rangedAttack') {
      score += member.combatStrength.ranged
      return score / range
    }

    if (this.leader.memory[CreepMemoryKeys.squadCombatType] === 'attack') {
      score += member.combatStrength.melee
      return score / range
    }

    // Dismantle type

    score += member.combatStrength.dismantle
    return score / range
  }

  /**
   * Loop through every offset
   * Loop through each offset and find the member which has the highest score on it
   * Score each offset's sum of member scores, identifying the best offset
   * implement offset
   */
  private advancedTransform(): boolean {
    if (!this.willMove) return false
    if (!this.target) return false

    let bestTransform: string[]
    let bestScore = 0

    for (const member of this.members) {
      bestScore += this.scoreMemberTransform(member.name, member.pos)
    }

    const originalScore = bestScore

    for (let i = 0; i < Math.min(quadAttackMemberOffsets.length, this.memberNames.length); i++) {
      const transform: string[] = []
      const memberNames = new Set(this.memberNames)
      let score = 0

      const packedOffsets = sortBy(
        Array.from(packedQuadAttackMemberOffsets).splice(0, this.memberNames.length),
        packedOffset => {
          const offset = unpackCoord(packedOffset)
          const coord = {
            x: this.leader.pos.x + offset.x,
            y: this.leader.pos.y + offset.y,
          }

          return getRange(this.target.pos, coord)
        },
      )

      for (const packedOffset of packedOffsets) {
        const offset = unpackCoord(packedOffset)
        const coord = {
          x: this.leader.pos.x + offset.x,
          y: this.leader.pos.y + offset.y,
        }

        const j = packedQuadAttackMemberOffsets.indexOf(packedOffset)

        let bestMemberScore = -1
        let bestMemberName: string

        for (const memberName of memberNames) {
          const memberScore = this.scoreMemberTransform(memberName, coord)
          if (memberScore <= bestMemberScore) continue

          bestMemberScore = memberScore
          bestMemberName = memberName
        }

        score += bestMemberScore
        memberNames.delete(bestMemberName)
        transform[j] = bestMemberName
      }

      if (score <= bestScore) continue

      bestScore = score
      bestTransform = transform
    }

    if (originalScore === bestScore) return false

    for (let i = 0; i < bestTransform.length; i++) {
      const memberName = bestTransform[i]
      const goal = {
        x: quadAttackMemberOffsets[i].x + this.leader.pos.x,
        y: quadAttackMemberOffsets[i].y + this.leader.pos.y,
      }

      Game.creeps[memberName].assignMoveRequest(goal)
      Memory.creeps[memberName][CreepMemoryKeys.squadMembers] = bestTransform
    }
    return true
  }

  passiveHealQuad() {
    let lowestHits = Infinity
    let lowestHitsMember: Creep | undefined

    for (const member of this.members) {
      if (member.hits === member.hitsMax) continue

      if (member.hits >= lowestHits) continue

      lowestHits = member.hits
      lowestHitsMember = member
    }

    if (lowestHitsMember) {
      for (const member of this.members) {
        if (member.worked) continue

        member.heal(lowestHitsMember)
        member.worked = WorkTypes.heal
      }

      return
    }

    if (this.preHeal()) return
  }

  shouldPreHeal() {
    // Inform true if there are enemy threats in range

    if (
      this.leader.room.roomManager.enemyAttackers.find(
        enemyCreep =>
          (enemyCreep.combatStrength.ranged && this.findMinRange(enemyCreep.pos) <= 3) ||
          (enemyCreep.combatStrength.melee && this.findMinRange(enemyCreep.pos) <= 1),
      )
    )
      return true

    // Only inform true if there are enemy owned active towers

    const controller = this.leader.room.controller
    if (!controller) return false
    if (!controller.owner) return false
    if (controller.owner.username === Memory.me) return false
    if (global.settings.allies.includes(controller.owner.username)) return false
    if (!this.leader.room.roomManager.structures.tower.length) return false

    return true
  }

  /**
   * The precogs are delighted to assist
   */
  preHeal() {
    if (!this.shouldPreHeal()) return false

    // Have members semi-randomly heal each other

    const notHealedMembers = Array.from(this.members)

    for (const member of this.members) {
      const memberIndex = Math.floor(Math.random() * notHealedMembers.length)
      const memberHealer = notHealedMembers[memberIndex]

      memberHealer.heal(member)
      memberHealer.worked = WorkTypes.heal

      notHealedMembers.splice(memberIndex, 1)
    }

    return true
  }

  private rangedAttackEnemyCreeps(attackingMemberNames: Set<string>) {
    // Get enemies by damage members can deal

    const enemyTargetsWithDamage: Map<Id<Creep>, number> = new Map()
    const enemyTargetsWithAntifa: Map<Id<Creep>, Id<Antifa>[]> = new Map()

    for (const enemyCreep of this.leader.room.roomManager.unprotectedEnemyCreeps) {
      const memberIDsInRange: Id<Antifa>[] = []

      let netDamage = -1 * enemyCreep.combatStrength.heal

      for (const memberName of attackingMemberNames) {
        const member = Game.creeps[memberName]

        if (getRange(member.pos, enemyCreep.pos) > 3) continue

        netDamage += member.combatStrength.ranged

        memberIDsInRange.push(member.id)
      }

      if (!memberIDsInRange.length) continue

      enemyTargetsWithDamage.set(enemyCreep.id, netDamage)
      enemyTargetsWithAntifa.set(enemyCreep.id, memberIDsInRange)
      if (memberIDsInRange.length === this.members.length) break
    }

    const enemyTargetsByDamage = Array.from(enemyTargetsWithAntifa.keys()).sort((a, b) => {
      return enemyTargetsWithDamage.get(a) - enemyTargetsWithDamage.get(b)
    })

    // Attack enemies in order of most members that can attack them

    for (const enemyCreepID of enemyTargetsByDamage) {
      const enemyCreep = findObjectWithID(enemyCreepID)

      for (const memberID of enemyTargetsWithAntifa.get(enemyCreepID)) {
        const member = findObjectWithID(memberID)
        if (!attackingMemberNames.has(member.name)) continue

        if (getRange(member.pos, enemyCreep.pos) > 1) member.rangedAttack(enemyCreep)
        else member.rangedMassAttack()
        member.ranged = true

        attackingMemberNames.delete(member.name)
      }

      if (!attackingMemberNames.size) return attackingMemberNames
    }

    return attackingMemberNames
  }

  private rangedAttackEnemyStructures(attackingMemberNames: Set<string>) {
    if (
      Memory.rooms[this.leader.room.name][RoomMemoryKeys.type] === RoomTypes.commune ||
      Memory.rooms[this.leader.room.name][RoomMemoryKeys.type] === RoomTypes.neutral
    )
      return attackingMemberNames

    for (const structure of this.leader.room.find(FIND_STRUCTURES)) {
      for (const memberName of attackingMemberNames) {
        const member = Game.creeps[memberName]

        const range = getRange(member.pos, structure.pos)
        if (range > 3) continue

        if (!(structure as OwnedStructure).owner || range > 1) {
          member.rangedAttack(structure)
        } else member.rangedMassAttack()

        member.ranged = true
        attackingMemberNames.delete(member.name)
      }
      if (!attackingMemberNames.size) return attackingMemberNames
    }

    return attackingMemberNames
  }

  private rangedAttackTarget(attackingMemberNames: Set<string>) {
    for (const memberName of attackingMemberNames) {
      const member = Game.creeps[memberName]

      const range = getRange(member.pos, this.target.pos)
      if (range > 3) continue

      if (!(this.target as OwnedStructure).owner || range > 1) {
        member.rangedAttack(this.target)
      } else member.rangedMassAttack()

      member.ranged = true
      attackingMemberNames.delete(member.name)
    }

    return attackingMemberNames
  }

  /**
   * Attack viable targets without moving
   */
  passiveRangedAttack() {
    let attackingMemberNames = new Set(this.memberNames)

    if (this.target && this.target instanceof Creep) {
      attackingMemberNames = this.rangedAttackTarget(attackingMemberNames)
      if (!attackingMemberNames.size) return
    }

    attackingMemberNames = this.rangedAttackEnemyCreeps(attackingMemberNames)
    if (!attackingMemberNames.size) return

    // If there is a target, even though it isn't a creep, try to attack it
    if (this.target) {
      attackingMemberNames = this.rangedAttackTarget(attackingMemberNames)
      if (!attackingMemberNames.size) return
    }

    attackingMemberNames = this.rangedAttackEnemyStructures(attackingMemberNames)
    if (!attackingMemberNames.size) return
  }

  private rangedAttackAttackers() {}

  private rangedAttackEnemies() {}

  advancedRangedAttack() {
    const { room } = this.leader

    let enemyCreeps = room.roomManager.enemyAttackers.filter(function (creep) {
      return !creep.isOnExit
    })

    if (!room.roomManager.enemyAttackers.length) enemyCreeps = room.roomManager.enemyAttackers

    // If there are none

    if (!enemyCreeps.length) {
      enemyCreeps = room.roomManager.notMyCreeps.enemy.filter(function (creep) {
        return !creep.isOnExit
      })

      if (!enemyCreeps.length) enemyCreeps = room.roomManager.notMyCreeps.enemy
      if (!enemyCreeps.length) return false

      this.leader.message = 'EC'

      const enemyCreep = findClosestObject(this.leader.pos, enemyCreeps)
      if (Game.flags[FlagNames.roomVisuals])
        this.leader.room.visual.line(this.leader.pos, enemyCreep.pos, {
          color: customColors.green,
          opacity: 0.3,
        })

      // Get the range between the creeps

      const range = this.findMinRange(enemyCreep.pos)
      this.leader.message = range.toString()

      if (range <= 3) {
        this.target = enemyCreep
        this.passiveRangedAttack()
      }

      // If the range is more than 1

      if (range > 1) {
        // Have the create a moveRequest to the enemyAttacker and inform true

        this.createMoveRequest({
          origin: this.leader.pos,
          goals: [{ pos: enemyCreep.pos, range: 1 }],
        })

        return true
      }

      return true
    }

    // Otherwise, get the closest enemyAttacker

    const enemyAttacker = findClosestObject(this.leader.pos, enemyCreeps)
    if (Game.flags[FlagNames.roomVisuals])
      this.leader.room.visual.line(this.leader.pos, enemyAttacker.pos, {
        color: customColors.green,
        opacity: 0.3,
      })

    const range = this.findMinRange(enemyAttacker.pos)

    // If the squad is outmatched
    /*
        if (
            this.combatStrength.heal + this.combatStrength.ranged <
            enemyAttacker.combatStrength.heal + enemyAttacker.combatStrength.ranged
        ) {
            // If too close

            if (range <= 3) {
                this.target = enemyAttacker
                this.passiveRangedAttack()

                // Have the squad flee

                this.createMoveRequest({
                    origin: this.leader.pos,
                    goals: [{ pos: enemyAttacker.pos, range: 1 }],
                    flee: true,
                })
            }

            return true
        }
 */
    // If it's more than range 3

    if (range > 3) {
      // Make a moveRequest to it and inform true

      this.createMoveRequest({
        origin: this.leader.pos,
        goals: [{ pos: enemyAttacker.pos, range: 1 }],
      })

      return true
    }

    this.leader.message = 'AEA'

    this.target = enemyAttacker
    this.passiveRangedAttack()

    if (range > 1) {
      this.createMoveRequest({
        origin: this.leader.pos,
        goals: [{ pos: enemyAttacker.pos, range: 1 }],
      })

      return true
    }

    return true
  }

  bulldoze() {
    const request = Memory.combatRequests[this.leader.memory[CreepMemoryKeys.combatRequest]]
    if (!request) return false
    if (request[CombatRequestKeys.type] === 'defend') return false
    if (
      Memory.rooms[this.leader.room.name][RoomMemoryKeys.type] === RoomTypes.commune ||
      Memory.rooms[this.leader.room.name][RoomMemoryKeys.type] === RoomTypes.neutral
    )
      return false

    let bulldozeTarget: Structure
    this.leader.memory[CreepMemoryKeys.quadBulldozeTargets] = []
    let quadBulldozeTargetIDs = this.leader.memory[CreepMemoryKeys.quadBulldozeTargets] || []

    for (let i = 0; i < quadBulldozeTargetIDs.length; i++) {
      const ID = quadBulldozeTargetIDs[i]
      const structure = findObjectWithID(ID)
      if (!structure) {
        quadBulldozeTargetIDs.splice(i, 1)
        continue
      }

      bulldozeTarget = structure
    }

    if (!bulldozeTarget) {
      let bulldozeTargets: Structure[] = []
      bulldozeTargets = bulldozeTargets.concat(this.leader.room.roomManager.structures.spawn)
      bulldozeTargets = bulldozeTargets.concat(this.leader.room.roomManager.structures.tower)

      if (!bulldozeTargets.length) return false

      bulldozeTarget = findClosestObject(this.leader.pos, bulldozeTargets)

      quadBulldozeTargetIDs = this.leader.findQuadBulldozeTargets(bulldozeTarget.pos)
      if (!quadBulldozeTargetIDs.length) return false

      bulldozeTarget = findObjectWithID(quadBulldozeTargetIDs[0])
    }

    this.leader.room.targetVisual(this.leader.pos, bulldozeTarget.pos, true)

    const range = this.findMinRange(bulldozeTarget.pos)

    if (range > 1) {
      this.createMoveRequest({
        origin: this.leader.pos,
        goals: [{ pos: bulldozeTarget.pos, range: 1 }],
      })
    }

    if (range > 3) return true

    this.target = bulldozeTarget
    this.passiveRangedAttack()
    return true
  }

  rangedAttackStructures() {
    const request = Memory.combatRequests[this.leader.memory[CreepMemoryKeys.combatRequest]]
    if (!request) return false
    if (request[CombatRequestKeys.type] === 'defend') return false
    if (
      Memory.rooms[this.leader.room.name][RoomMemoryKeys.type] === RoomTypes.commune ||
      Memory.rooms[this.leader.room.name][RoomMemoryKeys.type] === RoomTypes.neutral
    )
      return false

    const structures = this.leader.room.roomManager.combatStructureTargets

    if (!structures.length) return false

    let structure = findClosestObject(this.leader.pos, structures)
    if (Game.flags[FlagNames.roomVisuals])
      this.leader.room.visual.line(this.leader.pos, structure.pos, {
        color: customColors.green,
        opacity: 0.3,
      })

    const range = this.findMinRange(structure.pos)

    if (range > 1) {
      this.createMoveRequest({
        origin: this.leader.pos,
        goals: [{ pos: structure.pos, range: 1 }],
      })
    }

    if (range > 3) return true

    this.target = structure
    this.passiveRangedAttack()
    return true
  }

  advancedAttack() {
    return true
  }

  advancedDismantle() {
    return true
  }

  rangedKite() {
    if (!this.willMove) return Result.noAction

    const enemyThreatDataRanged = this.enemyThreatDataRanged
    let stay: undefined | true

    for (const member of this.members) {
      const coordThreat = enemyThreatDataRanged.coords[packAsNum(member.pos)]
      if (coordThreat === 0) continue
      if (coordThreat === 1) {
        stay = true
        continue
      }

      this.leader.room.errorVisual(member.pos, true)
      /* delete this.leader.memory[CreepMemoryKeys.path] */
      this.createMoveRequest(
        {
          origin: this.leader.pos,
          goals: enemyThreatDataRanged.goals,
          flee: true,
        },
        /* member, */
      )
      this.leader.room.visual.text('kited', this.leader.pos)
      return Result.action
    }

    // We don't want to flee but we shouldn't move

    if (stay) {
      this.leader.room.visual.text('stay', this.leader.pos)

      return Result.stop
    }

    // There is no need to kite
    return Result.success
  }

  findMinRange(coord: Coord) {
    let minRange = Infinity

    for (const member of this.members) {
      const range = getRange(member.pos, coord)
      if (range < minRange) minRange = range
    }

    return minRange
  }

  setMoveType(type: SquadMoveTypes) {
    this.moveType = type
    for (const memberName of this.memberNames) {
      Memory.creeps[memberName][CreepMemoryKeys.squadMoveType] = type
    }
  }

  _combatStrength: CombatStrength
  get combatStrength() {
    if (this._combatStrength) return this._combatStrength

    const combatStrength = {
      dismantle: 0,
      melee: 0,
      ranged: 0,
      heal: 0,
    }

    for (const member of this.members) {
      const memberCombatStrength = member.combatStrength

      for (const key in combatStrength) {
        const combatType = key as keyof CombatStrength

        combatStrength[combatType] += memberCombatStrength[combatType]
      }
    }

    return (this._combatStrength = combatStrength)
  }

  _defenceStrength: number
  get defenceStrength() {
    if (this._defenceStrength !== undefined) return this._defenceStrength

    return (this._defenceStrength = findHighestScore(
      this.members,
      member => member.defenceStrength,
    ))
  }

  _hits: number
  get hits() {
    if (this._hits !== undefined) return this._hits

    return (this._hits = findHighestScore(this.members, member => member.hits))
  }

  _enemyThreatDataRanged: EnemyThreatData

  /**
   * Score identifies speed of death. Lower values are better
   * Be scared of enemies we can die faster from
   */
  get enemyThreatDataRanged() {
    if (this._enemyThreatDataRanged) return this._enemyThreatDataRanged

    this._enemyThreatDataRanged = {
      coords: new Uint8Array(2500),
      goals: [],
    }

    for (const enemyCreep of this.leader.room.roomManager.enemyAttackers) {
      // Plus one to account for non-leader squad members

      if (getRange(enemyCreep.pos, this.leader.pos) > rangedFleeRange + 1) continue

      const enemyRanged = enemyCreep.combatStrength.ranged
      const enemyHeal = enemyCreep.combatStrength.heal
      const enemyDefence = enemyCreep.defenceStrength
      const enemyHits = enemyCreep.hits

      // Ranged

      let squadDeathSpeed =
        enemyRanged * this.defenceStrength - this.combatStrength.heal / this.hits
      let enemyDeathSpeed = this.combatStrength.ranged * 0.9 * enemyDefence - enemyHeal / enemyHits

      if (squadDeathSpeed > enemyDeathSpeed) {
        forCoordsInRange(enemyCreep.pos, rangedFleeRange, coord => {
          const packedCoord = packAsNum(coord)
          const currentValue = this._enemyThreatDataRanged.coords[packedCoord]
          if (currentValue === 255) return

          if (getRange(enemyCreep.pos, coord) < rangedFleeRange) {
            this._enemyThreatDataRanged.coords[packedCoord] = 255
          } else {
            this._enemyThreatDataRanged.coords[packedCoord] = 1
          }
        })

        this._enemyThreatDataRanged.goals.push({
          pos: enemyCreep.pos,
          range: 10,
        })
        continue
      }

      // Melee

      squadDeathSpeed =
        (enemyRanged + enemyCreep.combatStrength.melee) * this.defenceStrength -
        this.combatStrength.heal / this.hits
      enemyDeathSpeed = this.combatStrength.ranged * 0.9 * enemyDefence - enemyHeal / enemyHits

      if (squadDeathSpeed > enemyDeathSpeed) {
        forCoordsInRange(enemyCreep.pos, meleeFleeRange, coord => {
          const packedCoord = packAsNum(coord)
          const currentValue = this._enemyThreatDataRanged.coords[packedCoord]
          if (currentValue === 255) return

          if (getRange(enemyCreep.pos, coord) < meleeFleeRange) {
            this._enemyThreatDataRanged.coords[packedCoord] = 255
          } else {
            this._enemyThreatDataRanged.coords[packedCoord] = 1
          }
        })

        this._enemyThreatDataRanged.goals.push({
          pos: enemyCreep.pos,
          range: 10,
        })
        continue
      }
    }
    /*
        for (let x = 0; x < roomDimensions; x++) {
            for (let y = 0; y < roomDimensions; y++) {
                const weight = this._enemyThreatDataRanged.coords[packXYAsNum(x, y)]
                if (weight === 0) continue

                let color = weight === 255 ? customColors.red : customColors.yellow
                this.leader.room.visual.circle(x, y, { fill: color })
            }
        }
 */
    return this._enemyThreatDataRanged
  }

  get canMove() {
    for (const member of this.members) {
      if (!member.canMove) return false
    }
    return true
  }

  get willMove() {
    for (const member of this.members) {
      if (!member.canMove) return false
      if (member.moveRequest) return false
    }

    return true
  }
}
