/*
    js-file - Promise ready File Handling
 */

import Fs from 'fs'
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

    static async readJson(path) {
        let data = await File.readFile(path)
        try {
            data = Json5.parse(data)
        } catch (err) {
            throw new Error(`Cannot parse json file: ${path}. ${err.message}`)
        }
        return data
    }

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
