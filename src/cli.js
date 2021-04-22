#!/usr/bin/env node
/*
    onetable - OneTable cli

    Usage:
    Migrations:
        onetable migrate [all, down, list, outstanding, reset, status, up, N.N.N]
        onetable generate [migration]

    Reads migrate.json:
        crypto: {
            "cipher": "aes-256-gcm",
            "password": "1f2e2-eeeee-aa3a2-12345-3a716-fedca"
        },
        delimiter: ':',
        dir: './migrations-directory',
        hidden: false,
        name: 'table-name',
        nulls: false,
        schema: 'path/to/schema.js',
        typeField: 'type',
        aws: {accessKeyId, secretAccessKey, region},
        arn: 'lambda-arn'
 */

import Fs from 'fs'
import Path from 'path'
import Readline from 'readline'
import Semver from 'semver'
import AWS from 'aws-sdk'

import {Table} from 'dynamodb-onetable'
import {Migrate} from 'onetable-migrate'

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

const Types = {
    String: 'string',
    Number: 'number',
    Boolean: 'boolean',
    String: 'string',
}

const Usage = `
onetable usage:

  onetable migrate ...
  onetable generate ...

Generate:
  generate migration

Migrations:
  migrate 1.2.3                     # Apply migrations up or down to version 1.2.3
  migrate all                       # Apply all outstanding migrations (upwards)
  migrate down                      # Rervert the last applied migration
  migrate generate                  # Generate a migration stub for the next patch version
  migrate list                      # List all applied migrations
  migrate outstanding               # List migrations yet to be applied
  migrate reset                     # Reset the database with latest migration
  migrate status                    # Show most recently applied migration
  migrate up                        # Apply the next migration

Options:
  --aws-access-key                  # AWS access key
  --aws-region                      # AWS service region
  --aws-secret-key                  # AWS secret key
  --bump [major,minor,patch]        # Version digit to bump in generation
  --config migrate.js               # Migration configuration file
  --crypto cipher:password          # Crypto to use for encrypted attributes
  --debug                           # Show debug trace
  --dir directory                   # Change to directory to execute
  --dry                             # Dry-run, don't execute
  --endpoint http://host:port       # Database endpoint
  --force                           # Force action without confirmation
  --profile prod|qa|dev|...         # Select configuration profile
  --quiet                           # Run as quietly as possible
  --schema ./path/to/schema.js      # Database schema module
  --version                         # Emit version number
`

const LATEST_VERSION = 'latest'
const DebugVerbosity = 10

class CLI {
    usage() {
        error(Usage)
    }

    constructor() {
        this.verbosity = 0
        this.dry = ''
        this.bump = 'patch'
        this.aws = {}
    }

    async init() {
        this.args = await this.parseArgs()
        let config = await this.getConfig()
        if (!config.onetable) {
            error('Missing database configuration')
        }
        this.config = config
        this.debug(`Using configuration profile ${config.profile}`)

        this.log = new Log(config.log, {app: 'migrate', source: 'migrate'})
        if (this.verbosity) {
            this.log.setLevels({migrate: this.verbosity + 4})
        }

        /*
            OneTable expects the crypto to be defined under a "primary" property.
         */
        let cot = config.onetable
        let crypto = this.crypto || cot.crypto || config.crypto
        if (crypto) {
            cot.crypto = crypto.primary ? crypto : {primary: crypto}
        }
        cot.schema = await this.readSchema(cot.schema)

        if (cot.arn) {
            this.verbose(`Accessing DynamoDb "${cot.name}" via proxy at ${cot.arn}`)
            this.migrate = new Proxy(config, this)
        } else {
            let endpoint = this.endpoint || cot.endpoint || process.env.DB_ENDPOINT
            let args, location
            if (endpoint) {
                args = { region: 'localhost', endpoint }
                location = 'localhost'
                delete process.env.AWS_PROFILE
            } else {
                args = cot.aws
                if (Object.keys(args).length == 0) {
                    location = process.env.AWS_PROFILE
                } else {
                    location = args.region
                }
            }
            this.verbose(`Accessing DynamoDb "${cot.name}" at "${location}"`)
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
        this.debug(`Importing schema from "${path}"`)
        try {
            let schema = (await import(path)).default
            return schema
        } catch (err) {
            error(`Cannot load schema ${path}`, err)
        }
    }
    async command() {
        let args = this.args
        let scope = args[0]
        let cmd = args[1]
        if (scope == 'generate') {
            if (cmd == 'migration') {
                await this.generateMigration()
            } else if (cmd == 'types') {
                await this.generateTypes()
            } else {
                this.usage()
            }
        } else if (scope == 'migrate') {
            if (cmd == 'all') {
                await this.move()
            } else if (cmd == 'reset') {
                await this.move(LATEST_VERSION)
            } else if (cmd == 'status') {
                await this.status()
            } else if (cmd == 'list') {
                await this.list()
            } else if (cmd == 'outstanding') {
                await this.outstanding()
            } else if (args.length) {
                await this.move(args[1])
            } else {
                this.usage()
            }
        } else {
            this.usage()
        }
    }

    async generateMigration() {
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

    getIndexed() {
        let schema = this.config.onetable.schema
        let indexed = {}
        for (let index of Object.values(schema.indexes)) {
            indexed[index.hash] = true
            indexed[index.sort] = true
        }
        return indexed
    }

    //  Now that OneTable dynamically generate declarations, this is not typically needed.
    async generateTypes(options = {}) {
        let schema = this.config.onetable.schema
        let indexed = this.getIndexed()
        let out = []
        let dir = Path.resolve(this.config.onetable.types || '.')
        let path = `${dir}/Models.d.ts`
        for (let [name, model] of Object.entries(schema.models)) {
            out.push(`export type ${name} = {`)
            let defs = []
            for (let [prop, field] of Object.entries(model)) {
                if (field.hidden || indexed[prop]) {
                    if (options.hidden != true) {
                        continue
                    }
                }
                let sep = field.required ? ':' : '?:'
                let type = (typeof field.type == 'function') ? field.type.name : field.type

                if (type == 'Array') {
                    defs.push(`${prop}: any[];`)

                } else if (type == 'Object') {
                    defs.push(`${prop}${sep} object;`)

                } else {
                    defs.push(`${prop}${sep} ${Types[type] || type};`)
                }
            }
            out.push('    ' + defs.join('\n    ') + '\n}\n')
        }
        await File.writeFile(path, out.join('\n') + '\n')
    }

    async status() {
        print(await this.migrate.getCurrentVersion())
    }

    async list() {
        let pastMigrations = await this.migrate.findPastMigrations()
        if (this.quiet) {
            for (let m of pastMigrations) {
                print(m.version)
            }
        } else {
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

    /*
        Move to the target version
     */
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
            versions = [LATEST_VERSION]

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
        let fromto = action == 'downgrade' ? 'from' : 'to'
        let target = versions[versions.length - 1]
        if (this.config.profile == 'prod') {
            await this.rusure('WARNING: DANGEROUS: You are working on a production database! ')
        }
        if (this.dry) {
            print(`${this.dry} ${action} ${versions.length} ${noun} ${fromto} version ${target}.`)
        } else {
            print(`Confirm ${versions.length} "${action}" ${noun} ${fromto} version "${target}" for database "${this.config.onetable.name}" using profile "${this.config.profile}".`)
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

    async parseArgs() {
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
            } else if (arg == '--crypto') {
                let {cipher, password} = argv[++i]
                this.crypto = { primary: { cipher, password }}
            } else if (arg == '--debug') {
                this.verbosity = DebugVerbosity
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
            } else if (arg == '--schema' || arg == '-s') {
                this.schema = argv[++i]
            } else if (arg == '--verbose' || arg == '-v') {
                this.verbosity = 1
            } else if (arg == '--version') {
                await this.printVersion()
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
                this.debug(`Loading ${path}`)
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

    verbose(...args) {
        if (this.verbosity > 0) {
            print(...args)
        }
    }

    debug(...args) {
        if (this.verbosity >= DebugVerbosity) {
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

    async getCurrentVersion() {
        return await this.invoke('getCurrentVersion')
    }

    async getOutstandingVersions(limit = Number.MAX_SAFE_INTEGER) {
        return await this.invoke('getOutstandingVersions')
    }

    async invoke(action, args) {
        let cfg = Object.assign({}, this.config)
        cfg.crypto = this.crypto
        let params = {
            action: action,
            config: this.config,
        }
        if (args) {
            params.args = args
        }
        let payload = JSON.stringify(params, null, 2)
        this.debug(`Invoke migrate proxy`, {action, args, arn: this.arn})

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

//  Ah, if only for a top-level await
main()
