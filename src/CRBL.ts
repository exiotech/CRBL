import fs from 'fs'
import path from 'path'
import { promisify } from 'util'


import jsonfile from 'jsonfile'


import {
    chronologicalSort,
    linesCount,
} from './utils'
import {
    DB,
} from './DB'


const writeFile = promisify(fs.writeFile)

const mkdir = promisify(fs.mkdir)
const readdir = promisify(fs.readdir)


/**Database manager */
class CRBL {
    /**Connections Map in current node process */
    static connections: {
        [uri: string]: Promise<DB>
    } = {}

    /**
     * Try to connect to existing database. Throw error if database not exists
     * @param dbPath - database absolute path
     */
    static async connect(dbPath: string) {
        if (typeof dbPath !== 'string' || !path.isAbsolute(dbPath)) {
            throw new Error('Please Provide database absolute path to connect!')
        }

        if (!this.connections[dbPath]) {
            const DBPromise: Promise<DB> = (async () => {
                await Promise.resolve()

                try {
                    const dbConfigPath = path.join(dbPath, './config.json')
                    const dbStoragePath = path.join(dbPath, './store')

                    const config: {
                        fileCapacity: number,
                        fileExtension: string,
                    } = await jsonfile.readFile(dbConfigPath)
                    if (typeof config.fileCapacity !== 'number' || (config.fileExtension + '').trim().length === 0) {
                        throw new Error
                    }

                    let files: string[] = []
                    let filesCount = 0
                    try {
                        const fileNames = await readdir(dbStoragePath)
                        files = await chronologicalSort(fileNames
                            .map(fileName =>
                                path.join(dbStoragePath, `./${fileName}`)
                            ), 1)

                        filesCount = files.length
                    } catch { await mkdir(dbStoragePath) }

                    const dbLinesCount = filesCount ? ((filesCount - 1) * config.fileCapacity + await linesCount(files[filesCount - 1])) : 0
                    const dbName = path.basename(dbPath)

                    return new DB(dbName, dbPath, files, dbLinesCount, config)
                } catch (err) {
                    delete this.connections[dbPath]
                    throw new Error(`Unable to connect to db at path: ${dbPath}`)
                }
            })() as any
            this.connections[dbPath] = DBPromise
        }
        return this.connections[dbPath]
    }

    /**
     * Try to create and connect to database, Throw error if database exists
     * @param dbPath - absolute path to create database in
     * @param dbConfig - database config
     */
    static async createAndConnect(dbPath: string, dbConfig: {
        /**Defines each file max capacity in database store */
        fileCapacity: number,
        /**
         * Defines each newly created file extension in database store without
         * starting dot.
         * 
         * Default - txt
         */
        fileExtension?: string
    }) {
        if (typeof dbPath !== 'string' || !path.isAbsolute(dbPath)) {
            throw new Error('Please Provide absolute path to create database!')
        }
        if (!dbConfig) {
            throw new Error('Please Provide dbConfig to create database!')
        }
        if (typeof dbConfig.fileCapacity !== 'number') {
            throw new Error('dbConfig.fileCapacity MUST be positive integer!')
        }

        if (!this.connections[dbPath]) {
            const DBPromise: Promise<DB> = (async () => {
                await Promise.resolve()

                try {
                    const config: {
                        fileCapacity: number,
                        fileExtension: string,
                    } = {
                        ...dbConfig,
                        fileExtension: dbConfig.fileExtension ?? 'txt'
                    }

                    const configJson = JSON.stringify(config)

                    const dbConfigPath = path.join(dbPath, './config.json')
                    const dbStoragePath = path.join(dbPath, './store')

                    await mkdir(dbPath)
                    await mkdir(dbStoragePath)
                    await writeFile(dbConfigPath, configJson)

                    const dbName = path.basename(dbPath)
                    return new DB(dbName, dbPath, [], 0, config)
                } catch {
                    delete this.connections[dbPath]
                    throw new Error(`Unable to create db at path: ${dbPath}`)
                }
            })() as any
            this.connections[dbPath] = DBPromise

            return this.connections[dbPath]
        }
        throw new Error(`Unable to create db at path: ${dbPath}`)
    }
}

export {
    CRBL,
}