/*
    js-file - Promise ready File Handling
 */

import * as Fs from 'fs'
import Json5 from 'json5'

export default class File {

    static async stat(path) {
        return new Promise(function(resolve, reject) {
            Fs.stat(path, function(err, data) {
                if (err) {
                    resolve(false)
                } else {
                    resolve(data)
                }
            })
        })
    }

    //  MOB - add options with a nothrow on errors and return null
    //  MOB - better to rename as just 'read'
    static async readFile(path) {
        return new Promise(function(resolve, reject) {
            Fs.readFile(path, function(err, data) {
                if (err) {
                    reject(err)
                } else {
                    resolve(data)
                }
            })
        })
    }

    //  MOB - get rid of this
    static async readFileSync(path) {
        return Fs.readFileSync(path)
    }

    static async readDir(path) {
        return new Promise(function(resolve, reject) {
            Fs.readdir(path, function(err, data) {
                if (err) {
                    reject(err)
                } else {
                    resolve(data)
                }
            })
        })
    }

    //  MOB - get rid of this
    static async readDirSync(path) {
        return Fs.readdirSync(path)
    }

    static async readJson(path) {
        let data = await File.readFile(path)
        try {
            data = Json5.parse(data)
        } catch (err) {
            throw new Error(`Cannot parse json file: ${path}. ${err.message}`)
        }
        return data
    }

    //  MOB - get rid of this
    static async readJsonSync(path) {
        let data = File.readFileSync(path)
        try {
            data = Json5.parse(data)
        } catch (err) {
            throw new Error(`Cannot parse json file: ${path}. ${err.message}`)
        }
        return data

    }

    //  MOB - rename 'write'
    static async writeFile(path, data, options) {
        return new Promise(function(resolve, reject) {
            Fs.writeFile(path, data, options, function(err, data) {
                if (err) {
                    reject(err)
                } else {
                    resolve(data)
                }
            })
        })
    }

    static async writeJson(path, obj, options) {
        let data = JSON.stringify(obj, null, 4) + '\n'
        return await File.writeFile(path, data, options)
    }

    static async rename(from, to) {
        return new Promise(function(resolve, reject) {
            Fs.rename(from, to, function(err, data) {
                if (err) {
                    reject(err)
                } else {
                    resolve(data)
                }
            })
        })
    }
}
