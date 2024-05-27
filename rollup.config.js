import typescript from 'rollup-plugin-typescript2'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs';
import clear from 'rollup-plugin-clear'
import screeps from 'rollup-plugin-screeps-world'
import copy from 'rollup-plugin-copy';
import { terser } from 'rollup-plugin-terser'
import yaml from 'yaml'
import { readFileSync } from 'fs'

let config
const dest = process.env.DEST
if (!dest) {
    console.log('No destination specified - code will be compiled but not uploaded')
} else {
    config = (yaml.parse(readFileSync('.screeps.yaml', { encoding: 'utf8' })).servers || {})[dest]
    if (config == null) throw new Error('Invalid upload destination')
    config.hostname = config.host
    config.port = config.port || (config.secure ? 443 : 21025)
    config.host = `${config.host}:${config.port}`
    config.email = config.username
    config.protocol = config.secure ? 'https' : 'http'
    config.path = config.path || '/'
    config.branch = config.branch || 'auto'
}

const shouldUglify = config && config.uglify
const ignoreWarningTypes = new Set([
    'Circular dependency',
])

export default {
    // perf: true,
    input: 'src/main.ts',
    output: {
        file: 'dist/main.js',
        format: 'cjs',
        sourcemap: true,
        banner:
`
// The International Screeps Bot
// DO NOT USE THIS BOT TO BULLY PLAYERS
// code repository: https://github.com/The-International-Screeps-Bot/The-International-Open-Source
`
    },

    plugins: [
        clear({ targets: ['dist'] }),
        copy({
          targets: [
            { src: 'src/wasm/pkg/commiebot_wasm_bg.wasm', dest: 'dist' },
          ]
        }),
        resolve(),
        commonjs({
            ignoreTryCatch: false
        }),
        shouldUglify && terser(),
        typescript({ tsconfig: './tsconfig.json' }),
        screeps({ config: config, dryRun: !config }),
    ],
    /**
     * Skip over certain blacklisten warnings that we don't need to be concerned about
     */
    onwarn: function (warning) {

        // Skip warning types we don't care about
        if (ignoreWarningTypes.has(warning.toString().split(':')[0])) return

        // warn about everything else
        console.warn(warning.message)
    },
}
