/*
    Migrate.js - OneTable Migrations

    Usage:
        migrate --help
 */

import Fs from 'fs'
import Path from 'path'
import Semver from 'semver'
import AWS from 'aws-sdk'
import OneTable from 'dynamodb-onetable'

import Log from 'js-log'
import File from 'js-file'

const { Model, Table } = OneTable

const SemVerExp = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/

const MigrationFields = {
    pk:             { value: '_migrations:${version}' },
    sk:             { value: '_migrations:' },
    description:    { type: String, required: true },
    date:           { type: Date, required: true },
    path:           { type: String, required: true },
    version:        { type: String, required: true },
}

export default class Migrate {

    constructor(config) {
        this.config = config
        this.log = new Log(config.log, {app: 'migrate', source: 'migrate'})
        if (config.verbose) {
            this.log.setLevels({dynamodb: config.verbose})
        }
        this.dir = Path.resolve(config.dynamodb.migrations || './migrations')
        this.log.trace(`Using migrations from "${this.dir}"`)

        if (!config.dynamodb) {
            error('Missing database configuration')
        }
    }

    async init() {
        let dbc = this.config.dynamodb
        let path = Path.resolve(process.cwd(), this.schema || this.config.dynamodb.schema || './schema.json')
        if (!Fs.existsSync(path)) {
            error(`Cannot find schema definition in "${path}"`)
        }
        this.log.trace(`Importing schema from "${path}"`)
        let schema = (await import(path)).default

        let params = {
            delimiter: dbc.delimiter || '#',
            hidden: dbc.hidden || true,
            logger: this.log.child({source: 'dynamodb'}),
            name: dbc.name,
            nulls: dbc.nulls,
            schema,
            typeField: dbc.type || 'type',
        }
        if (dbc.crypto) {
            params.crypto = {primary: dbc.crypto}
        }
        let endpoint = this.endpoint || dbc.endpoint || process.env.DB_ENDPOINT
        let doc = endpoint ? { region: 'localhost', endpoint } : {}
        params.client = new AWS.DynamoDB.DocumentClient(doc)

        this.db = new Table(params)
        this.Migration = new Model(this.db, '_Migration', { fields: MigrationFields }, {timestamps: false})
        this.migrations = await this.Migration.scan({}, {throw: false})
        this.sortMigrations(this.migrations)
    }

    async findMigrations() {
        return this.migrations
    }

    async apply(direction, version) {
        let migration = await this.loadMigration(version)
        if (direction == 0) {
            let outstanding = this.getOutstandingVersions()
            if (outstanding.length) {
                version = outstanding[outstanding.length - 1]
            } else {
                version = this.getCurrentVersion()
            }
            migration.version = version
        }
        if (direction < 0) {
            await migration.task.down(this.db, this)
            await this.Migration.remove({version: migration.version})
        } else {
            await migration.task.up(this.db, this)
            await this.Migration.create({
                version,
                date: new Date(),
                path: migration.path,
                description: migration.description,
            }, {exists: null})
        }
        return migration
    }

    async loadMigration(version) {
        let path = `${this.dir}/${version}.js`
        this.log.trace(`Loading migration "${path}"`)
        let task = (await import(path)).default
        return {
            description: task.description,
            enable: task.enable ? task.enable : true,
            path, task, version,
        }
    }

    sortMigrations(array) {
        array.sort((a, b) => {
            let cmp = Semver.compare(a.version, b.version)
            if (cmp < 0) {
                return cmp
            } else if (cmp > 0) {
                return cmp
            } else if (a.order < b.order) {
                return -1
            } else if (a.order > b.order) {
                return 1
            } else {
                return 0
            }
        })
    }

    getCurrentVersion() {
        if (this.migrations.length == 0) {
            return '0.0.0'
        }
        return this.migrations[this.migrations.length - 1].version
    }

    /*
        Return outstanding versions in semver sorted order up to the specified limit
     */
    getOutstandingVersions(limit = Number.MAX_SAFE_INTEGER) {
        let current = this.getCurrentVersion()
        let versions = Fs.readdirSync(this.dir).map(file => file.replace(/\.[^/.]+$/, '')).filter(version => {
            return Semver.valid(version) && Semver.compare(version, current) > 0 && this.migrations.find(m => m.version == version) == null
        }).sort(Semver.compare)
        return versions.slice(0, limit)
    }

    async readJson(path) {
        return await File.readJson(path)
    }
}

function error(...args) {
    console.error(...args)
    process.exit(1)
}
