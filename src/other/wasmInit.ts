// Wasm

// TextEncoder/Decoder polyfill for UTF-8 conversion
// import 'fastestsmallesttextencoderdecoder-encodeinto/EncoderDecoderTogether.min.js'
const wasm_module = new WebAssembly.Module(require('commiebot_wasm_bg'))
import { initSync } from '../wasm/pkg/commiebot_wasm.js'

export const wasm = initSync(wasm_module)
wasm.log_setup()
