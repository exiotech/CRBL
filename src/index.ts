import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'


import jsonfile from 'jsonfile'


import {
    chronologicalSort,
    delimitItems,
    linesCount,
    matchGlob,
} from './utils'


const appendFile = promisify(fs.appendFile)
const mkdir = promisify(fs.mkdir)
const writeFile = promisify(fs.writeFile)
const readdir = promisify(fs.readdir)

class JsonBl {
    static dbMap: {
        [uri: string]: Promise<DB>
    } = {}

    static async connect(dbPath: string) {
        if (!this.dbMap[dbPath]) {
            const DBPromise: Promise<DB> = (async () => {
                try {
                    const dbConfigPath = path.join(dbPath, './config')
                    const dbStoragePath = path.join(dbPath, './store')

                    const config: {
                        fileCapacity: number,
                        filesExtension: string,
                    } = await jsonfile.readFile(dbConfigPath)
                    if (typeof config!.fileCapacity !== 'number' || (config + '').trim().length === 0) {
                        throw Error
                    }

                    let files: string[] = []
                    let filesCount = 0
                    try {
                        const fileNames = await readdir(dbStoragePath)
                        files = await chronologicalSort(fileNames.map(fileName => path.join(dbStoragePath, `./${fileName}`)), 1)
                        filesCount = files.length
                    } catch { await mkdir(dbStoragePath) }

                    const dbLinesCount = filesCount ? (filesCount - 1) * config.fileCapacity + await linesCount(files[filesCount - 1]) : 0
                    return new DB(path.basename(dbPath), dbPath, files, dbLinesCount, config)
                } catch {
                    delete this.dbMap[dbPath]
                    throw new Error(`Unable to connect to db at path: ${dbPath}`)
                }
            })() as any
            this.dbMap[dbPath] = DBPromise
        }
        return this.dbMap[dbPath]
    }

    static async createAndConnect(dbPath: string, dbOptions: {
        fileCapacity: number,
        fileExtension?: string
    }) {
        if (!this.dbMap[dbPath]) {
            const config: {
                fileCapacity: number,
                filesExtension: string,
            } = {
                ...dbOptions,
                filesExtension: dbOptions.fileExtension === undefined ? 'txt' : dbOptions.fileExtension
            }

            const DBPromise: Promise<DB> = (async () => {
                try {

                    const configJson = JSON.stringify(config)

                    const dbConfigPath = path.join(dbPath, './config')
                    const dbStoragePath = path.join(dbPath, './store')

                    await mkdir(dbPath)
                    await mkdir(dbStoragePath)
                    await writeFile(dbConfigPath, configJson)

                    return new DB(path.basename(dbPath), dbPath, [], 0, config as any)
                } catch {
                    throw new Error(`Unable to create db at path: ${dbPath}`)
                }
            })() as any
            this.dbMap[dbPath] = DBPromise

            return this.dbMap[dbPath]
        }
        throw new Error(`Unable to create db at path: ${dbPath}`)
    }
}


class DB {
    protected opsQueue: (Query | Insert)[] = []

    constructor(
        public dbName: string,
        public dbPath: string,
        public files: string[],
        public linesCount: number,
        public config: {
            fileCapacity: number,
            filesExtension: string,
        }
    ) {

    }

    insert(items?: string[]) {
        return new Insert(this, this.opsQueue, items)

    }
    query(segment?: string) {
        return new Query(this, this.opsQueue, segment)
    }
}

interface InsertState {
    lInserted: number;
    fInserted: number;
    lFinalCount: number;
}
class Insert implements PromiseLike<InsertState> {
    protected executedPromise!: Promise<any>

    protected async exec(): Promise<InsertState> {
        const db = this.db
        const fileCapacity = db.config.fileCapacity

        if (!this.items.length) {
            return {
                lInserted: 0,
                fInserted: 0,
                lFinalCount: db.linesCount,
            }
        }

        const updatedFiles = [...db.files]
        const remaininglines = db.linesCount % fileCapacity

        if (!remaininglines) {
            const delimited = delimitItems(this.items, fileCapacity)
            await Promise.all(delimited
                .map((subItems, index) => {
                    const newFilePath = `./${db.files.length + index}.${db.config.filesExtension}`
                    updatedFiles.push(newFilePath)

                    return appendFile(
                        path.join(db.dbPath, newFilePath),
                        subItems.join(os.EOL),
                    )
                })
            )

            const insertedFiles = updatedFiles.length - db.files.length
            db.files = updatedFiles
            return {
                lInserted: this.items.length,
                fInserted: insertedFiles,
                lFinalCount: db.linesCount + this.items.length
            }
        } else {
            const existingLastFilePath = `./${db.files.length - 1}.${db.config.filesExtension}`
            const remainingItems: string[] = []

            let i!: number
            for (const item of this.items) {
                i = remainingItems.push(item)
                if (i === remaininglines) {
                    break
                }
            }
            await appendFile(
                path.join(db.dbPath, existingLastFilePath),
                remainingItems.join(os.EOL),
            )
            if (this.items.length <= remaininglines) {
                const insertedFiles = updatedFiles.length - db.files.length
                db.files = updatedFiles
                return {
                    lInserted: this.items.length,
                    fInserted: insertedFiles,
                    lFinalCount: db.linesCount + this.items.length
                }
            }

            const lastItems = this.items.slice(i)
            const delimited = delimitItems(lastItems, fileCapacity)
            await Promise.all(delimited
                .map((subItems, index) => {
                    const newFilePath = `./${db.files.length + index}.${db.config.filesExtension}`
                    updatedFiles.push(newFilePath)

                    return appendFile(
                        path.join(db.dbPath, newFilePath),
                        subItems.join(os.EOL),
                    )
                })
            )

            const insertedFiles = updatedFiles.length - db.files.length
            db.files = updatedFiles
            return {
                lInserted: this.items.length,
                fInserted: insertedFiles,
                lFinalCount: db.linesCount + this.items.length
            }
        }
    }

    then<TResult1 = InsertState, TResult2 = never>(onfulfilled?: ((value: InsertState) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {
        if (!this.executedPromise) {
            const InsertPromise = new Promise(async (res, rej) => {
                await Promise.resolve()

                const lastOps = this.dbOpsQueue[this.dbOpsQueue.length - 1]
                this.dbOpsQueue.push(this)
                if (lastOps instanceof Query) {
                    try {
                        await lastOps['executedPromise']
                    } catch { }
                } else if (lastOps instanceof Insert) {
                    try {
                        await lastOps['executedPromise']
                    } catch { }
                }
                await this.exec()
                this.dbOpsQueue.shift()
            }).then(onfulfilled as any, onrejected)
            this.executedPromise = InsertPromise
        }
        return this.executedPromise
    }

    constructor(
        protected db: DB,
        protected dbOpsQueue: any[],

        protected items: string[] = []
    ) { }

    one(item: string): Omit<Insert, 'one' | 'many'> {
        this.items = [item]
        return this
    }
    many(items: string[]): Omit<Insert, 'one' | 'many'> {
        this.items = [...items]
        return this
    }
}

interface QueryState {
    queryItems: {
        id: number;
        item: string
    }[]

    fCount: number
    lFinalCount: number
}
class Query implements PromiseLike<QueryState> {
    protected executedPromise!: Promise<any>

    protected async exec() {
        // await appendFile()
    }

    then<TResult1 = QueryState, TResult2 = never>(onfulfilled?: ((value: QueryState) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {
        if (!this.executedPromise) {
            const QueryPromise = new Promise(async (res, rej) => {
                await Promise.resolve()

                const lastOps = this.dbOpsQueue[this.dbOpsQueue.length - 1]
                this.dbOpsQueue.push(this)
                if (lastOps instanceof Query) {
                    try {
                        await lastOps['executedPromise']
                    } catch { }
                } else if (lastOps instanceof Insert) {
                    try {
                        await lastOps['executedPromise']
                    } catch { }
                }
                await this.exec()
                this.dbOpsQueue.shift()
            }).then(onfulfilled as any, onrejected)
            this.executedPromise = QueryPromise
        }
        return this.executedPromise
    }

    constructor(
        protected db: DB,
        protected dbOpsQueue: any[],

        protected segmentName?: string,
        protected skipCount: number = 0,
        protected limitCount: number = 0,
        // protected segment
    ) { }

    segment(segmentName: string) {
        this.segmentName = segmentName
        return this
    }
    skip(count: number) {
        if (count < 0) {
            this.skipCount = 0
            return this
        }
        this.skipCount = count
        return this
    }
    limit(count: number) {
        if (count < 0) {
            this.limitCount = 0
            return this
        }
        this.limitCount = count
        return this
    }
}









async function run() {
    const db = await JsonBl.connect('asd')
    await db.query().segment('3').skip(10).limit(20)
    await db.insert().many().






    // const count = (await matchGlob(`/aaaaaa/asssssssaaa`, { strict: true }))
    // console.log(count)
    // i
    // const o: PromiseLike<number> = {
    //     // then(f?: ((v: number) => any) | null, g?: ((v: any) => any) | null): Promise<number> { return 1 as any }
    //     then<TResult1 = number, TResult2 = never>(onfulfilled?: ((value: number) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {

    //     }

    // }
    // new Promise().then
    // await o
    // console.log(
    //     await readdir('./dist')
    // )
    // Promise.reject(111)
    //     .then(v => console.log('v'))
    //     .catch(c => console.log(c))
    //     .then(l => console.log('aaaaaa'))

    async function f() {
        // await Promise.resolve()
        console.log('f')
    }
    async function g() {
        await f()
        console.log('g')
    }
    g()
    console.log('b')
}

run()

// const access = promisify(fs.access)

// const fileExtension = 'txt'

// module.exports = {
//     async connect() {
//         const DBMS = getOrCreateDb(DB, DB_CAPACITY)
//     }
// }


// async function getDb(db: string)

// async function getOrCreateDb(db, dbCapacity) {
//     const dirPath = (await matchGlob(`${DB_DIR}/${db}${dbCapacity}/`))[0]

//     const dbMeta = {
//         dirPath: dirPath,
//         capacity: dbCapacity,
//         filesCount: 0,
//         lastFileCapacity: undefined
//     }
//     if (!dirPath) {
//         await mkdir(dirPath)
//         return dbMeta
//     }

//     console.log(`Existing DB Directory ${db}${dbCapacity}!`)
//     const filePaths = await matchGlob(path.join(dirPath, `*.${fileExtension}`))

//     if (!filePaths.length) {
//         return dbMeta
//     }

//     const lastFilePath = filePaths[filePaths.length]
//     return {
//         ...dbMeta,
//         filesCount: filePaths.length,
//         lastFileCapacity: linesCount(lastFilePath)
//     }
// }



// const filePaths = await matchGlob(path.join(dbPath, `*.${fileExtension}`))

// if (!filePaths.length) {
//     return dbMeta
// }

// const lastFilePath = filePaths[filePaths.length]
// return {
//     ...dbMeta,
//     filesCount: filePaths.length,
//     lastFileCapacity: linesCount(lastFilePath)
// }