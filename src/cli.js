#!/usr/bin/env node
/*
    onetable - OneTable cli

    Usage:
    Migrations:
        onetable [all, down, generate, list, named, outstanding, repeat, reset, status, up, N.N.N, NAMED]

    Reads migrate.json:
        crypto: {
            "cipher": "aes-256-gcm",
            "password": "1f2e2-eeeee-aa3a2-12345-3a716-fedca"
        },
        dir: './migrations-directory',
        onetable: {
            name: 'table-name',
        },
        aws: {accessKeyId, secretAccessKey, region},
        arn: 'lambda-arn'
 */

import Fs from 'fs'
import Path from 'path'
import Readline from 'readline'
import Semver from 'semver'
import AWS from 'aws-sdk'

import {Migrate} from 'onetable-migrate'

//  DEV
// import {Migrate} from '../../migrate/dist/mjs/index.js'

import Blend from './paks/js-blend/index.js'
import Dates from './paks/js-dates/index.js'
import File from './paks/js-file/index.js'
import SenseLogs from 'senselogs'

const MigrationTemplate = `
import Schema from 'your-onetable-schema'

export default {
    version: 'VERSION',
    schema: Schema,
    description: 'Purpose of this migration',
    async up(db, migrate, params) {
        if (!params.dry) {
            // db.log.info('Running upgrade')
            // await db.create('Model', {})
        }
    },
    async down(db, migrate, params) {
        if (!params.dry) {
            // await db.remove('Model', {})
        }
    }
}`

const Usage = `
onetable usage:

Migrations:
  onetable 1.2.3            # Apply migrations up or down to version 1.2.3
  onetable all              # Apply all outstanding migrations (upwards)
  onetable down             # Rervert the last applied migration
  onetable generate         # Generate a stub migration file
  onetable list             # List all applied migrations
  onetable outstanding      # List migrations yet to be applied
  onetable named            # List available named migrations
  onetable repeat           # Repeat the last migration
  onetable reset            # Reset the database to the latest schema
  onetable status           # Show most recently applied migration
  onetable up               # Apply the next migration
  onetable NAME             # Apply a named migration

Options:
  --arn                             # Lambda ARN for migration controller
  --aws-access-key                  # AWS access key
  --aws-region                      # AWS service region
  --aws-secret-key                  # AWS secret key
  --bump [major,minor,patch]        # Version digit to bump in generation
  --config migrate.json             # Migration configuration file
  --crypto cipher:password          # Crypto to use for encrypted attributes
  --debug                           # Show debug trace
  --dir directory                   # Change to directory to execute
  --dry                             # Dry-run, pass params.dry to migrations.
  --endpoint http://host:port       # Database endpoint for local use.
  --force                           # Force action without confirmation
  --profile prod|qa|dev|...         # Select configuration profile
  --retry-failed                    # Retry recent failed migrations
  --quiet                           # Run as quietly as possible
  --table TableName                 # DynamoDB table name
  --version                         # Emit version number
`

class CLI {
    usage() {
        error(Usage)
    }

    constructor() {
        this.verbosity = false
        this.dry = ''
        this.bump = 'patch'
        this.aws = {}
        this.table = null
        this.retryFailed = false
    }

    async init() {
        this.args = await this.parseArgs()
        let config = await this.getConfig()
        if (!config.onetable) {
            error('Missing database configuration')
        }
        this.config = config || 'default'
        this.debug(`Using configuration profile "${config.profile}"`)

        this.log = new SenseLogs({name: 'onetable', destination: 'console', format: 'human'})

        /*
            OneTable expects the crypto to be defined under a "primary" property.
         */
        let onetable = config.onetable
        let crypto = this.crypto || onetable.crypto || config.crypto
        if (crypto) {
            onetable.crypto = crypto.primary ? crypto : {primary: crypto}
        }
        onetable.name = this.table || onetable.name
        if (!onetable.name) {
            error('Missing DynamoDB table name')
        }

        let location
        if (config.arn) {
            this.verbose(`Accessing DynamoDb "${onetable.name}" via proxy at ${config.arn}`)
            this.migrate = new Proxy(config.onetable, config.arn, config.aws, this)
            location = config.arn

        } else {
            let endpoint = this.endpoint || config.endpoint || config.aws.endpoint || process.env.DB_ENDPOINT
            let args
            if (endpoint) {
                args = Object.assign({region: 'localhost'}, config.aws || {}, {endpoint})
                location = args.region
                delete process.env.AWS_PROFILE
            } else {
                args = config.aws
                if (!args || Object.keys(args).length == 0) {
                    location = process.env.AWS_PROFILE
                } else {
                    location = args.region
                }
            }
            this.verbose(`Accessing DynamoDb "${onetable.name}" at "${location}"`)
            onetable.client = new AWS.DynamoDB.DocumentClient(args)
            onetable.senselogs = this.log

            this.migrate = new Migrate(onetable, {
                migrations: config.migrations,
                dir: config.dir,
                profile: config.profile,
            })
            await this.migrate.init()
        }
        try {
            await this.migrate.getCurrentVersion()
        } catch (err) {
            error(`Cannot communicate with DynamoDB "${onetable.name}" at "${location}"\n` + err.message)
        }
    }

    async command() {
        let args = this.args
        let scope = args[0]
        let cmd = args[1]
        if (scope != 'migrate' && scope != 'generate') {
            cmd = scope
            scope = 'migrate'
        }
        if (scope == 'generate') {
            await this.generateMigration()

        } else if (scope == 'migrate') {
            if (cmd == 'all') {
                await this.run()
            } else if (cmd == 'reset') {
                await this.run("reset")
            } else if (cmd == 'status') {
                await this.status()
            } else if (cmd == 'list') {
                await this.list()
            } else if (cmd == 'outstanding') {
                await this.outstanding()
            } else if (cmd == 'named') {
                await this.named()
            } else if (cmd) {
                await this.run(cmd)
            } else {
                this.usage()
            }
        } else {
            this.usage()
        }
    }

    async generateMigration() {
        let versions = await this.migrate.getOutstandingVersions()
        let version = versions.length ? versions.pop() : await this.migrate.getCurrentVersion()
        if (Semver.valid(this.bump)) {
            version = this.bump
        } else {
            let newVersion = Semver.inc(version, this.bump)
            if (!Semver.valid(newVersion)) {
                this.error(`Cannot bump version ${version} via ${this.bump}`)
            }
            version = newVersion
        }
        let dir = Path.resolve(this.config.dir || '.')
        let path = `${dir}/${version}.js`
        if (Fs.existsSync(path)) {
            error(`Migration ${path} already exists`)
        } else {
            let data = MigrationTemplate.replace('VERSION', version)
            await File.writeFile(path, data)
            print(`Generated ${path}`)
        }
    }

    async status() {
        print(await this.migrate.getCurrentVersion())
    }

    async list() {
        let pastMigrations = await this.migrate.getPastMigrations()
        if (this.quiet) {
            for (let m of pastMigrations) {
                print(m.version)
            }
        } else {
            if (pastMigrations.length == 0) {
                print('No migrations applied')
            } else {
                print('Date                                Version   Description')
            }
            for (let m of pastMigrations) {
                let date = Dates.format(m.date, 'HH:MM:ss mmm d, yyyy')
                print(`${date}  ${m.version.padStart(20)}   ${m.description}`)
            }
        }
    }

    async outstanding() {
        let versions = await this.migrate.getOutstandingVersions()
        if (versions.length == 0) {
            print('none')
        } else {
            for (let version of versions) {
                print(`${version}`)
            }
        }
    }

    async named() {
        let list = await this.migrate.getNamedMigrations()
        if (list.length == 0) {
            print('none')
        } else {
            for (let migration of list) {
                print(`${migration}`)
            }
        }
    }

    /*
        Move to the target version
     */
    async run(target) {
        let outstanding = await this.migrate.getOutstandingVersions()

        if (!target) {
            if (outstanding.length > 0) {
                target = outstanding[outstanding.length - 1]
            } else {
                print(`All migrations applied`)
                return
            }
        }
        let pastMigrations = await this.migrate.getPastMigrations()
        let pastVersions = pastMigrations.filter(m => Semver.valid(m.version))
        let current = await this.migrate.getCurrentVersion()
        let versions = []
        let cmd

        let failedMigrations = []
        for (let migration of pastMigrations.reverse()) {
            if (migration.status != 'success') {
                failedMigrations.push(migration)
            } else {
                break
            }
        }

        if (target == 'latest' || target == 'reset') {
            cmd = 'reset'
            pastMigrations = []
            versions = ["reset"]

        } else if (target == 'repeat') {
            cmd = 'repeat'
            let version = pastMigrations.map(m => m.version)[0]
            if (version) {
                versions = [version]
            }

        } else if (target == 'up') {
            cmd = 'up'
            if (this.retryFailed && failedMigrations.length) {
                versions = failedMigrations.map(m => m.version).reverse()
            } 
            if (outstanding.length) {
                versions.push(outstanding.shift())
            }
            if (versions.length == 0) {
                print(`All migrations applied`)
                return
            }

        } else if (target == 'down') {
            cmd = 'down'
            let version = pastVersions.slice(0).reverse().map(m => m.version).shift()
            if (version) {
                versions = [version]
            }

        } else if (Semver.valid(target)) {
            if (Semver.compare(target, current) < 0) {
                cmd = 'down'
                if (target != '0.0.0' && pastVersions.find(p => p == target).length == 0) {
                    error(`Cannot find target migration ${target} in applied migrations`)
                }
                versions = pastVersions.reverse().filter(v => Semver.compare(v, target) > 0)

            } else {
                cmd = 'up'
                if (Semver.compare(target, current) <= 0) {
                    print('Migration already applied')
                    return
                }
                if (!outstanding.find(v => v == target)) {
                    error(`Cannot find migration ${target} in outstanding migrations: ${outstanding.join(', ')}`)
                }
                versions = outstanding.filter(v => Semver.compare(v, current) >= 0)
                versions = versions.filter(v => Semver.compare(v, target) <= 0)
            }
        } else {
            //  Named version
            versions = [target]
            cmd = target
        }
        if (versions.length == 0) {
            print(`Already at target version: ${current}`)
            return
        }
        try {
            await this.confirm(cmd, versions)
            for (let version of versions) {
                let action = failedMigrations.find(m => m.version == version) ? 'repeat' : cmd
                let migration = await this.migrate.apply(action, version, {dry: this.dry})
                let verb = {
                    'down': 'Downgrade database from', 
                    'reset': 'Reset database with', 
                    'up': 'Upgrade database to', 
                    'repeat': 'Repeat migration'
                }[action] || 'Run named migration'
                print(`${verb} "${version} - ${migration?.description}"`)
            }
            current = await this.migrate.getCurrentVersion()
            print(`\nCurrent database version: ${current}`)

        } catch (err) {
            console.log(err)
            error('Migration failed', err.message, err.details)
        }
    }

    async confirm(cmd, versions) {
        if (this.force) {
            return
        }
        cmd = { 'up': 'upgrade', 'down': 'downgrade'}[cmd] || cmd
        let noun = versions.length > 1 ? 'changes' : 'change'
        let fromto = cmd == 'downgrade' ? 'from' : 'to'
        let target = versions[versions.length - 1]
        if (this.config.profile == 'prod') {
            await this.rusure('WARNING: DANGEROUS: You are working on a production database! ')
        }
        print(`Confirm ${versions.length} "${cmd}" ${noun} ${fromto} version "${target}" for database "${this.config.onetable.name}" using profile "${this.config.profile}".`)
        print(`\nMigrations to ${cmd == 'downgrade' ? 'revert' : 'apply'}:`)
        for (let version of versions) {
            print(`${version}`)
        }
        await this.rusure()
        print()
    }

    async rusure(msg = '') {
        process.stdout.write(`\n${msg}Enter [y] to confirm: `)
        let answer = await new Promise(function(resolve, reject) {
            let rl = Readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                terminal: false,
            })
            rl.on('line', (line) => {
                resolve(line)
            })
        })
        answer = answer.toLowerCase()
        if (answer != 'y' && answer != 'yes') {
            print('Exiting')
            process.exit(0)
        }
    }

    async parseArgs() {
        let argv = process.argv
        let i
        for (i = 2; i < argv.length; i++) {
            let arg = argv[i]
            if (arg == '--arn') {
                this.arn = argv[++i]
            } else if (arg == '--aws-access-key') {
                this.aws.accessKeyId = argv[++i]
            } else if (arg == '--aws-secret-key') {
                this.aws.secretAccessKey = argv[++i]
            } else if (arg == '--aws-region') {
                this.aws.region = argv[++i]
            } else if (arg == '--bump' || arg == '-b') {
                this.bump = argv[++i]
            } else if (arg == '--config' || arg == '-c') {
                this.migrateConfig = argv[++i]
            } else if (arg == '--crypto') {
                let {cipher, password} = argv[++i]
                this.crypto = { primary: { cipher, password }}
            } else if (arg == '--debug') {
                this.verbosity = 2
            } else if (arg == '--dir' || arg == '-d') {
                process.chdir(argv[++i])
            } else if (arg == '--dry') {
                this.dry = 'Dry Run: '
            } else if (arg == '--endpoint' || arg == '-e') {
                this.endpoint = argv[++i]
            } else if (arg == '--force' || arg == '-f') {
                this.force = true
            } else if (arg == '--help' || arg == '-?') {
                this.usage()
            } else if (arg == '--profile') {
                this.profile = argv[++i]
            } else if (arg == '--quiet' || arg == '-q') {
                this.quiet = true
            } else if (arg == '--retry-failed' || arg == '-r') {
                this.retryFailed = true
            } else if (arg == '--table') {
                this.table = argv[++i]
            } else if (arg == '--verbose' || arg == '-v') {
                this.verbosity = true
            } else if (arg == '--version') {
                await this.printVersion()
            } else if (arg[0] == '-') {
                this.usage()
            } else {
                break
            }
        }
        return argv.slice(i)
    }

    /*
        Read json config files and blend contents. Strategy is:
            config = migrate.json | migrate.json:config files
            Blend properties under profiles[profile]: to the top level. Supports profiles: dev, qa, prod,...
     */
    async getConfig() {
        let migrateConfig = this.migrateConfig || 'migrate.json5'
        if (!Fs.existsSync(migrateConfig)) {
            //  LEGACY
            migrateConfig = 'migrate.json'
            if (!Fs.existsSync(migrateConfig)) {
                error(`Cannot locate migrate.json5`)
            }
        }
        let index, profile
        if ((index = process.argv.indexOf('--profile')) >= 0) {
            profile = process.argv[index + 1]
        }
        let cfg = await File.readJson(migrateConfig)

        profile = profile || cfg.profile || process.env.PROFILE

        if (profile && cfg.profiles) {
            Blend(cfg, cfg.profiles[profile])
            delete cfg.profiles
        }
        if (cfg.config) {
            for (let path of cfg.config) {
                if (Fs.existsSync(path)) {
                    this.debug(`Loading ${path}`)
                    let data = await File.readJson(path)
                    cfg = Blend(cfg, data)
                } else {
                    error(`Cannot read ${path}`)
                }
            }
        }
        delete cfg.config
        if (profile && cfg.profiles) {
            Blend(cfg, cfg.profiles[profile])
            delete cfg.profiles
        }
        if (profile) {
            cfg.profile = profile
        }
        if (this.arn) {
            cfg.arn = this.arn
        }
        this.profile = cfg.profile
        cfg.aws = cfg.aws || this.aws || {}
        return cfg
    }

    verbose(...args) {
        if (this.verbosity > 0) {
            print(...args)
        }
    }

    debug(...args) {
        if (this.verbosity > 1) {
            print(...args)
        }
    }

    async printVersion() {
        let dir = Path.dirname(import.meta.url.replace('file://', ''))
        let config = await File.readJson(dir + '/../package.json')
        print(config.version)
        process.exit(0)
    }
}

class Proxy {
    constructor(config, arn, aws, cli) {
        this.cli = cli
        this.arn = arn
        this.config = config
        this.lambda = new AWS.Lambda(aws)
    }

    async apply(action, version, params = {}) {
        return await this.invoke('apply', {action, version, params})
    }

    async getPastMigrations() {
        return await this.invoke('getPastMigrations')
    }

    async getCurrentVersion() {
        return await this.invoke('getCurrentVersion')
    }

    async getOutstandingVersions(limit = Number.MAX_SAFE_INTEGER) {
        return await this.invoke('getOutstandingVersions')
    }

    async getNamedMigrations(limit = Number.MAX_SAFE_INTEGER) {
        return await this.invoke('getNamedMigrations')
    }

    async invoke(cmd, args) {
        let params = {cmd, config: this.config}
        if (args) {
            params.args = args
        }
        this.debug(`Invoke migrate proxy`, {cmd, args, arn: this.arn})

        let payload = JSON.stringify(params, null, 2)

        let result = await this.lambda.invoke({
            InvocationType: 'RequestResponse',
            FunctionName: this.arn,
            Payload: payload,
            LogType: 'Tail',
        }).promise()

        if (result.StatusCode != 200) {
            error(`Cannot invoke ${cmd}: bad status code ${result.StatusCode}`)

        } else if (result && result.Payload) {
            result = JSON.parse(result.Payload)
            if (result.error) {
                error(`Cannot invoke ${cmd}: ${result.error}`)
            } else {
                result = result.body
            }
        } else {
            error(`Cannot invoke ${cmd}: no result`)
        }
        this.debug(`Migrate proxy results`, {args, result})
        return result
    }

    debug(...args) {
        this.cli.debug(...args)
    }
}

async function main() {
    try {
        let cli = new CLI()
        await cli.init()
        await cli.command()
    } catch (err) {
        error(err.message)
        throw err
    }
    process.exit(0)
}

function print(...args) {
    console.log(...args)
}

function error(...args) {
    console.error(...args)
    process.exit(1)
}

//  Ah, if only for a top-level await
main()
