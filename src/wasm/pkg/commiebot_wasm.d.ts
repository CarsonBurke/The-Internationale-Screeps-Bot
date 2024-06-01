/* tslint:disable */
/* eslint-disable */
/**
*/
export function collaborator(): void;
/**
*/
export function log_setup(): void;
/**
* Translates the `PWR_*` constants, which are types of powers used by power
* creeps
*/
export enum PowerType {
  GenerateOps = 1,
  OperateSpawn = 2,
  OperateTower = 3,
  OperateStorage = 4,
  OperateLab = 5,
  OperateExtension = 6,
  OperateObserver = 7,
  OperateTerminal = 8,
  DisruptSpawn = 9,
  DisruptTower = 10,
  Shield = 12,
  RegenSource = 13,
  RegenMineral = 14,
  DisruptTerminal = 15,
  OperatePower = 16,
  Fortify = 17,
  OperateController = 18,
  OperateFactory = 19,
}
/**
* Translates `COLOR_*` and `COLORS_ALL` constants.
*/
export enum Color {
  Red = 1,
  Purple = 2,
  Blue = 3,
  Cyan = 4,
  Green = 5,
  Yellow = 6,
  Orange = 7,
  Brown = 8,
  Grey = 9,
  White = 10,
}
/**
* Translates direction constants.
*/
export enum Direction {
  Top = 1,
  TopRight = 2,
  Right = 3,
  BottomRight = 4,
  Bottom = 5,
  BottomLeft = 6,
  Left = 7,
  TopLeft = 8,
}
/**
* Translates the `EFFECT_*` constants, which are natural effect types
*/
export enum NaturalEffectType {
  Invulnerability = 1001,
  CollapseTimer = 1002,
}
/**
* Type used for when the game returns a direction to an exit.
*
* Restricted more than `Direction` in that it can't be diagonal. Used as the
* result of [`Room::find_exit_to`].
*
* Can be converted to [`Find`] for immediate use of [`Room::find`]
* and [`Direction`].
*
* [`Room::find`]: crate::objects::Room::find
* [`Room::find_exit_to`]: crate::objects::Room::find_exit_to
*/
export enum ExitDirection {
  Top = 1,
  Right = 3,
  Bottom = 5,
  Left = 7,
}
/**
* Translates `TERRAIN_*` constants.
*/
export enum Terrain {
  Plain = 0,
  Wall = 1,
  Swamp = 2,
}
/**
* Translates `FIND_*` constants for interal API calls
*
* Unless you're storing the type of find constant to be used for a call, you
* likely want the constants which implement the `FindConstant` trait to make
* calls to find methods.
*
* This is hidden from the documentation to avoid confusion due to its narrow
* use case, but wasm_bindgen requires it remain public.
*/
export enum Find {
/**
* Find all exit positions at the top of the room
*/
  ExitTop = 1,
  ExitRight = 3,
  ExitBottom = 5,
  ExitLeft = 7,
  Exit = 10,
  Creeps = 101,
  MyCreeps = 102,
  HostileCreeps = 103,
  SourcesActive = 104,
  Sources = 105,
  DroppedResources = 106,
  Structures = 107,
  MyStructures = 108,
  HostileStructures = 109,
  Flags = 110,
  ConstructionSites = 111,
  MySpawns = 112,
  HostileSpawns = 113,
  MyConstructionSites = 114,
  HostileConstructionSites = 115,
  Minerals = 116,
  Nukes = 117,
  Tombstones = 118,
  PowerCreeps = 119,
  MyPowerCreeps = 120,
  HostilePowerCreeps = 121,
  Deposits = 122,
  Ruins = 123,
  ScoreContainers = 10011,
  ScoreCollectors = 10012,
  SymbolContainers = 10021,
  SymbolDecoders = 10022,
  Reactors = 10051,
}
/**
* Translates the `DENSITY_*` constants.
*/
export enum Density {
  Low = 1,
  Moderate = 2,
  High = 3,
  Ultra = 4,
}
/**
*/
export class SearchGoal {
  free(): void;
/**
*/
  readonly pos: any;
/**
*/
  readonly range: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly collaborator: () => void;
  readonly log_setup: () => void;
  readonly __wbg_searchgoal_free: (a: number) => void;
  readonly searchgoal_pos: (a: number) => number;
  readonly searchgoal_range: (a: number) => number;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
