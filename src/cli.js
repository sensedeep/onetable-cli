#!/usr/bin/env node
/*
    cli.js - OneTable migration cli

    Usage:
        migrate list, status, outstanding
        migrate all, reset, down, up, 1.2.3
        migrate generate

    Reads migrate.json:
        crypto: {
            "cipher": "aes-256-gcm",
            "password": "1f2e2-d27f9-aa3a2-3f7bc-3a716-fc73e"
        },
        delimiter: ':',
        dir: './migrations-directory',
        hidden: false,
        name: 'sensedeep-dev',
        nulls: false,
        schema: 'path/to/schema.js',
        typeField: 'type',
 */

import Fs from 'fs'
import Path from 'path'
import Readline from 'readline'
import Semver from 'semver'
import AWS from 'aws-sdk'

import Migrate from 'onetable-migrate'
import {Table} from 'dynamodb-onetable'

import Blend from 'js-blend'
import Dates from 'js-dates'
import File from 'js-file'
import Log from 'js-log'

const MigrationTemplate = `
export default {
    description: 'Purpose of this migration',
    async up(db, migrate) {
        // await db.create('Model', {})
    },
    async down(db, migrate) {
        // await db.remove('Model', {})
    }
}`

const Usage = `
migrate usage:

  migrate 1.2.3                         # Apply migrations up or down to version 1.2.3
  migrate all                           # Apply all outstanding migrations (upwards)
  migrate down                          # Rervert the last applied migration
  migrate generate                      # Generate a migration stub for the next patch version
  migrate list                          # List all applied migrations
  migrate outstanding                   # List migrations yet to be applied
  migrate reset                         # Reset the database with latest migration
  migrate status                        # Show most recently applied migration
  migrate up                            # Apply the next migration
  Options:
    --aws-access-key                    # AWS access key
    --aws-region                        # AWS service region
    --aws-secret-key                    # AWS secret key
    --bump [major,minor,patch]          # Version digit to bump in generation
    --config migrate.js                 # Migration configuration file
    --dir directory                     # Change to directory to execute
    --dry                               # Dry-run, don't execute
    --endpoint http://host:port         # Database endpoint
    --force                             # Force action without confirmation
    --profile prod|qa|dev|...           # Select configuration profile
    --schema ./path/to/schema.js        # Database schema module
    --verbose                           # Emit more progress information
    --version                           # Emit version number
`

const RESET_VERSION = 'latest'

class CLI {
    usage() {
        error(Usage)
    }

    constructor() {
        this.verbose = 0
        this.dry = ''
        this.bump = 'patch'
        this.aws = {}
        this.args = this.parseArgs()
    }

    async init() {
        let config = await this.getConfig()
        if (!config.onetable) {
            error('Missing database configuration')
        }
        this.config = config
        this.trace(`Using configuration profile ${config.profile}`)

        this.log = new Log(config.log, {app: 'migrate', source: 'migrate'})
        if (this.verbose) {
            this.log.setLevels({migrate: this.verbose + 4})
        }

        /*
            OneTable expects the crypto to be defined under a "primary" property.
         */
        let cot = config.onetable
        let crypto = cot.crypto || config.crypto
        if (crypto) {
            cot.crypto = crypto.primary ? crypto : {primary: crypto}
        }
        cot.schema = await this.readSchema(cot.schema)
        this.trace(`Using config`, {cot})

        if (cot.arn) {
            this.migrate = new Proxy(config, this)
        } else {
            let endpoint = this.endpoint || cot.endpoint || process.env.DB_ENDPOINT
            let args = endpoint ? { region: 'localhost', endpoint } : cot.aws

            this.trace(`Accessing dynamodb`, {args})
            cot.client = new AWS.DynamoDB.DocumentClient(args)

            let onetable = new Table(cot)
            this.migrate = new Migrate(onetable, config)
        }
    }

    async readSchema(path) {
        path = Path.resolve(process.cwd(), this.schema || path || './schema.json')
        if (!Fs.existsSync(path)) {
            error(`Cannot find schema definition in "${path}"`)
        }
        this.trace(`Importing schema from "${path}"`)
        try {
            let schema = (await import(path)).default
            return schema
        } catch (err) {
            error(`Cannot load schema ${path}`, err)
        }
    }
    async command() {
        let args = this.args
        let cmd = args[0]
        if (cmd == 'all') {
            await this.move()
        } else if (cmd == 'reset') {
            await this.move(RESET_VERSION)
        } else if (cmd == 'status') {
            await this.status()
        } else if (cmd == 'list') {
            await this.list()
        } else if (cmd == 'outstanding') {
            await this.outstanding()
        } else if (cmd == 'generate') {
            await this.generate()
        } else if (args.length) {
            await this.move(args[0])
        } else {
            this.usage()
        }
    }

    async generate() {
        let versions = await this.migrate.getOutstandingVersions()
        let version = versions.length ? versions.pop() : this.migrate.getCurrentVersion()
        version = Semver.inc(version, this.bump)
        let dir = Path.resolve(this.config.onetable.migrations || '.')
        let path = `${dir}/${version}.js`
        if (Fs.existsSync(path)) {
            error(`Migration ${path} already exists`)
        } else {
            await File.writeFile(path, MigrationTemplate)
            print(`Generated ${path}`)
        }
    }

    async status() {
        print(await this.migrate.getCurrentVersion())
    }

    async list() {
        let pastMigrations = await this.migrate.findPastMigrations()
        if (pastMigrations.length == 0) {
            print('No migrations applied')
        } else {
            print('Date                   Version   Description')
        }
        for (let m of pastMigrations) {
            let date = Dates.format(m.time, 'HH:MM:ss mmm d, yyyy')
            print(`${date}  ${m.version}     ${m.description}`)
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

    async move(target) {
        let direction
        let outstanding = await this.migrate.getOutstandingVersions()

        if (!target) {
            if (outstanding.length > 0) {
                target = outstanding[outstanding.length - 1]
            } else {
                print(`All migrations applied`)
                return
            }
        }
        let pastMigrations = await this.migrate.findPastMigrations()
        let current = pastMigrations.length ? pastMigrations[pastMigrations.length - 1].version : '0.0.0'
        let versions = []

        if (target == 'latest') {
            direction = 0
            pastMigrations = []
            versions = [RESET_VERSION]

        } else if (target == 'up') {
            direction = 1
            if (outstanding.length == 0) {
                print(`All migrations applied`)
                return
            }
            versions = [outstanding.shift()]

        } else if (target == 'down') {
            direction = -1
            let version = pastMigrations.slice(0).reverse().map(m => m.version).shift()
            if (version) {
                versions = [version]
            }

        } else if (Semver.compare(target, current) < 0) {
            direction = -1
            if (target != '0.0.0' && !pastMigrations.find(m => m.version == target)) {
                error(`Cannot find target migration ${target} in applied migrations`)
            }
            versions = pastMigrations.reverse().map(m => m.version).filter(v => Semver.compare(v, target) > 0)

        } else {
            direction = 1
            if (Semver.compare(target, current) <= 0) {
                print('Migration already applied')
                return
            }
            if (!outstanding.find(v => v == target)) {
                error(`Cannot find migration ${target} in outstanding migrations: ${outstanding}`)
            }
            versions = outstanding.filter(v => Semver.compare(v, current) >= 0)
            versions = versions.filter(v => Semver.compare(v, target) <= 0)
        }
        if (versions.length == 0) {
            print(`Already at target version: ${current}`)
            return
        }
        try {
            await this.confirm(versions, direction)
            for (let version of versions) {
                let verb = ['Downgrade from', 'Reset to', 'Upgrade to'][direction + 1]
                let migration = await this.migrate.apply(direction, version)
                print(`${verb} "${migration.version} - ${migration.description}"`)
            }
            current = await this.migrate.getCurrentVersion()
            print(`\nCurrent database version: ${current}`)
        } catch (err) {
            error('Migration failed', err.message, err.details)
        }
    }

    async confirm(versions, direction) {
        if (this.force) {
            return
        }
        let action = ['downgrade', 'reset', 'upgrade'][direction + 1]
        let noun = versions.length > 1 ? 'changes' : 'change'
        let target = versions[versions.length - 1]
        if (this.config.profile == 'prod') {
            await this.rusure('WARNING: DANGEROUS: You are working on a production database! ')
        }
        if (this.dry) {
            print(`${this.dry} ${action} ${versions.length} ${noun} to version ${target}.`)
        } else {
            print(`Confirm ${versions.length} "${action}" ${noun} to version "${target}" for database "${this.config.onetable.name}" using profile "${this.config.profile}".`)
        }
        print(`\nMigrations to ${direction < 0 ? 'revert' : 'apply'}:`)
        for (let version of versions) {
            print(`${version}`)
        }
        if (!this.dry) {
            await this.rusure()
        }
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

    parseArgs() {
        let argv = process.argv
        let i
        for (i = 2; i < argv.length; i++) {
            let arg = argv[i]
            if (arg == '--aws-access-key') {
                this.aws.accessKeyId = argv[++i]
            } else if (arg == '--aws-secret-key') {
                this.aws.secretAccessKey = argv[++i]
            } else if (arg == '--aws-region') {
                this.aws.region = argv[++i]
            } else if (arg == '--bump' || arg == '-b') {
                this.bump = argv[++i]
            } else if (arg == '--config' || arg == '-c') {
                this.migrateConfig = argv[++i]
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
            } else if (arg == '--schema' || arg == '-s') {
                this.schema = argv[++i]
            } else if (arg == '--verbose' || arg == '-v') {
                this.verbose++
            } else if (arg == '--version') {
                this.printVersion()
            } else if (arg[0] == '-' || arg.indexOf('-') >= 0) {
                this.usage()
            } else {
                break
            }
        }
        return argv.slice(i)
    }

    /*
        Ready json config files and blend contents. Strategy is:

        config = migrate.json | migrate.json:config files

        Blend properties under profiles[profile]: to the top level. Supports profiles: dev, qa, prod,...
     */
    async getConfig() {
        let migrateConfig = this.migrateConfig || 'migrate.json'
        if (!Fs.existsSync(migrateConfig)) {
            error(`Cannot locate ${migrateConfig}`)
        }
        /*
            Determine the stage profile. Priority: command line, migrate.json, package.json, PROFILE env
         */
        let index, profile
        if ((index = process.argv.indexOf('--profile')) >= 0) {
            profile = process.argv[index + 1]
        }
        let config = await File.readJson(migrateConfig)

        profile = profile || config.profile || process.env.PROFILE

        if (profile && config.profiles) {
            Blend(config, config.profiles[profile])
            delete config.profiles
        }
        if (!config.onetable) {
            config = {onetable: config}
        }
        for (let path of config.onetable.config) {
            if (Fs.existsSync(path)) {
                this.trace(`Loading ${path}`)
                let data = await File.readJson(path)
                config = Blend(config, data)
            } else {
                error(`Cannot read ${path}`)
            }
        }
        if (profile && config.profiles) {
            Blend(config, config.profiles[profile])
            delete config.profiles
        }
        if (profile) {
            config.profile = profile
        }
        this.profile = config.profile
        config.onetable.aws = config.onetable.aws || this.aws
        return config
    }

    trace(...args) {
        if (this.verbose) {
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
    constructor(config, cli) {
        this.config = config
        this.cli = cli
        let args = config.onetable.aws
        this.arn = config.onetable.arn
        this.lambda = new AWS.Lambda(args)
    }

    async apply(direction, version) {
        return await this.invoke('apply', {direction, version})
    }

    async findPastMigrations() {
        return await this.invoke('findPastMigrations')
    }

    //CHANGE API
    async getCurrentVersion() {
        return await this.invoke('getCurrentVersion')
    }

    //CHANGE API
    async getOutstandingVersions(limit = Number.MAX_SAFE_INTEGER) {
        return await this.invoke('getOutstandingVersions')
    }

    async invoke(action, args) {
        let cfg = Object.assign({}, this.config)
        cfg.crypt = this.crypto
        //MOB TRACE
        let params = {
            action: action,
            config: this.config,
        }
        if (args) {
            params.args = args
        }
        let payload = JSON.stringify(params, null, 2)
        this.trace(`Invoke migrate proxy`, {action, args, payload, arn: this.arn})

        let result = await this.lambda.invoke({
            InvocationType: 'RequestResponse',
            FunctionName: this.arn,
            Payload: payload,
            LogType: 'Tail',
        }).promise()

        if (result.StatusCode != 200) {
            error(`Cannot invoke ${action}: bad status code ${result.StatusCode}`)

        } else if (result && result.Payload) {
            result = JSON.parse(result.Payload)
            if (result.errorMessage) {
                error(`Cannot invoke ${action}: ${result.errorMessage}`)
            } else {
                result = result.body
            }
        } else {
            error(`Cannot invoke ${action}: no result`)
        }
        this.trace(`Migrate proxy results`, {args, result})
        return result
    }

    trace(...args) {
        this.cli.trace(...args)
    }
}

async function main() {
    try {
        let cli = new CLI()
        await cli.init()
        await cli.command()
    } catch (err) {
        print(err)
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

main()
