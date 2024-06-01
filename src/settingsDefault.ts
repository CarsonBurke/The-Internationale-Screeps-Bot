import { Settings } from 'types/settings'

/**
 * Default global.settings. DO NOT MODIFY for personal use; instead, include your preferences in global.settings.ts
 */
export const defaultSettings: Settings = {
  breakingVersion: 130,
  allies: ['MarvinTMB'],
  nonAggressionPlayers: [],
  tradeBlacklist: [],
  pixelSelling: false,
  pixelGeneration: false,
  autoClaim: true,
  autoAttack: false,
  publicRamparts: false,
  allyCommunication: true,
  marketUsage: true,
  logging: Game.shard.name === 'performanceServer' ? 0 : 1,
  creepSay: true,
  creepChant: [
    'Creeps',
    'of',
    Game.shard.name,
    'unite,',
    'you',
    'have',
    'nothing',
    'to',
    'lose',
    'but',
    'your',
    'chains!',
    undefined,
    'PEACE',
    'LAND',
    'ENERGY',
    undefined,
    'Democracy',
    'is non-',
    'negotiable!',
    undefined,
  ],
  allySegmentID: 90,
  errorExporting: true,
  structureMigration: true,
  debugLogging: false,
  season: false,
  /*   relationships: {
    MarvinTMB: PlayerRelationships.ally,
  }, */
}
