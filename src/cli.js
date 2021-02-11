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
        hidden: true,
        null: false,
        schema: 'path/to/schema.js',
        typeField: 'type',
        name: 'sensedeep-dev',
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
    --verbose
`

const RESET_VERSION = 'latest'

class App {
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

        this.log = new Log(config.log, {app: 'migrate', source: 'migrate'})
        if (this.verbose) {
            this.log.setLevels({migrate: this.verbose + 4})
        }

        let params = config.onetable
        let endpoint = this.endpoint || params.endpoint || process.env.DB_ENDPOINT
        let args = this.client = endpoint ? { region: 'localhost', endpoint } : params.aws

        this.trace(`Accessing dynamodb`, {args})
        params.client = new AWS.DynamoDB.DocumentClient(args)
        params.schema = await this.readSchema(config)

        if (params.crypto) {
            params.crypto = {primary: params.crypto}
        }
        let onetable = new Table(params)
        this.migrate = new Migrate(onetable, config)

        try {
            await this.migrate.init()
        } catch (err) {
            error(`Cannot access database`, {params})
        }
        this.pastMigrations = await this.migrate.findPastMigrations()
    }

    async readSchema(config) {
        let path = Path.resolve(process.cwd(), this.schema || config.onetable.schema || './schema.json')
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
            this.status()
        } else if (cmd == 'list') {
            this.list()
        } else if (cmd == 'outstanding') {
            await this.outstanding()
        } else if (cmd == 'generate') {
            await this.generate()
        } else if (args.length) {
            await this.move(args[0])
        }
    }

    async generate() {
        let versions = this.migrate.getOutstandingVersions()
        let version = versions.length ? versions.pop() : this.migrate.getCurrentVersion()
        version = Semver.inc(version, this.bump)
        let dir = Path.resolve(this.config.onetable.migrations || '.')
        let path = `${dir}/${version}.js`
        if (Fs.existsSync(path)) {
            error(`Migration ${path} already exists`)
        } else {
            await File.writeFile(path, MigrationTemplate)
        }
    }

    status() {
        print(this.migrate.getCurrentVersion())
    }

    list() {
        if (this.pastMigrations.length == 0) {
            print('\nNo migrations applied')
        } else {
            print('\nDate                  Version   Description')
        }
        for (let m of this.pastMigrations) {
            let date = Dates.format(m.time, 'HH:MM:ss mmm d, yyyy')
            print(`${date}  ${m.version}     ${m.description}`)
        }
    }

    async outstanding() {
        let versions = this.migrate.getOutstandingVersions()
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
        let outstanding = this.migrate.getOutstandingVersions()

        if (!target) {
            if (outstanding.length > 0) {
                target = outstanding[outstanding.length - 1]
            } else {
                print(`All migrations applied`)
                return
            }
        }
        let current = this.migrate.getCurrentVersion()
        let versions = []

        if (target == 'latest') {
            direction = 0
            this.pastMigrations = []
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
            let version = this.pastMigrations.slice(0).reverse().map(m => m.version).shift()
            if (version) {
                versions = [version]
            }

        } else if (Semver.compare(target, current) < 0) {
            direction = -1
            if (target != '0.0.0' && !this.pastMigrations.find(m => m.version == target)) {
                error(`Cannot find target migration ${target} in applied migrations`)
            }
            versions = this.pastMigrations.reverse().map(m => m.version).filter(v => Semver.compare(v, target) > 0)

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
            await this.migrate.update()
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
            print(`Confirm ${versions.length} ${action} ${noun} to version ${target} on ${this.config.profile}.`)
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
            } else if (arg == '-v' || arg == '--verbose') {
                this.verbose++
            } else if (arg[0] == '-' || arg.indexOf('-') >= 0) {
                this.usage()
            } else {
                break
            }
        }
        return argv.slice(i)
    }

    async getConfig() {
        let config = {}
        if (Fs.existsSync('package.json')) {
            config = await File.readJson('package.json')
        }

        let migrate = this.migrateConfig || 'migrate.json'
        if (!Fs.existsSync(migrate)) {
            error(`Cannot locate ${migrate}`)
        }
        let data = await File.readJson(migrate)

        let index, profile
        if ((index = process.argv.indexOf('--profile')) >= 0) {
            profile = process.argv[index + 1]
        }
        profile = profile || config.profile || data.profile || process.env.PROFILE
        this.trace(`Configuration profile ${profile}`)

        if (profile && data.profiles) {
            Blend(data, data.profiles[profile])
            delete data.profiles
        }
        if (!data.onetable) {
            data = {onetable: data}
        }
        config = Blend(config, data)

        if (profile && config.profiles) {
            Blend(config, config.profiles[profile])
            delete config.profiles
        }
        if (profile) {
            config.profile = profile
        }
        config.onetable.aws = config.onetable.aws || this.aws
        this.profile = config.profile
        return config
    }

    trace(...args) {
        if (this.verbose) {
            print(...args)
        }
    }

}

async function main() {
    try {
        let app = new App()
        await app.init()
        await app.command()
    } catch (err) {
        error(err.message)
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
