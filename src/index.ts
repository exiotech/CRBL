import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'


import jsonfile from 'jsonfile'
import DRange from "drange";


import {
    chronologicalSort,
    delimitItems,
    linesCount,
    readLinesUp,
} from './utils'


const appendFile = promisify(fs.appendFile)
const mkdir = promisify(fs.mkdir)
const writeFile = promisify(fs.writeFile)
const readdir = promisify(fs.readdir)

class CRBL {
    static connections: {
        [uri: string]: Promise<DB>
    } = {}

    static async connect(dbPath: string) {
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
                    return new DB(path.basename(dbPath), dbPath, files, dbLinesCount, config)
                } catch (err) {
                    delete this.connections[dbPath]
                    throw new Error(`Unable to connect to db at path: ${dbPath}`)
                }
            })() as any
            this.connections[dbPath] = DBPromise
        }
        return this.connections[dbPath]
    }

    static async createAndConnect(dbPath: string, dbOptions: {
        fileCapacity: number,
        fileExtension?: string
    }) {
        if (!this.connections[dbPath]) {
            const DBPromise: Promise<DB> = (async () => {
                await Promise.resolve()

                try {
                    const config: {
                        fileCapacity: number,
                        fileExtension: string,
                    } = {
                        ...dbOptions,
                        fileExtension: dbOptions.fileExtension ?? 'txt'
                    }

                    const configJson = JSON.stringify(config)

                    const dbConfigPath = path.join(dbPath, './config.json')
                    const dbStoragePath = path.join(dbPath, './store')

                    await mkdir(dbPath)
                    await mkdir(dbStoragePath)
                    await writeFile(dbConfigPath, configJson)

                    return new DB(path.basename(dbPath), dbPath, [], 0, config as any)
                } catch {
                    throw new Error(`Unable to create db at path: ${dbPath}`)
                }
            })() as any
            this.connections[dbPath] = DBPromise

            return this.connections[dbPath]
        }
        throw new Error(`Unable to create db at path: ${dbPath}`)
    }
}


class DB {
    protected insertOpsQueue: (Query | Insert)[] = []
    protected storagPath: string
    protected configPath: string

    constructor(
        public dbName: string,
        public dbPath: string,
        public files: string[],
        public linesCount: number,
        public config: {
            fileCapacity: number,
            fileExtension: string,
        }
    ) {
        this.storagPath = path.join(dbPath, './store')
        this.configPath = path.join(dbPath, './config.json')
    }

    insert(items: string[]): Omit<Insert, 'one' | 'many'>
    insert(item: string): Omit<Insert, 'one' | 'many'>
    insert(): Insert
    insert(items?: string | string[]) {
        return items instanceof Array
            ? new Insert(this, this.insertOpsQueue).many(items)
            : typeof items === 'string'
                ? new Insert(this, this.insertOpsQueue).one(items)
                : new Insert(this, this.insertOpsQueue)

    }
    // Change this
    query(segmentRange: [number, number]): Omit<Query, 'segment' | 'segmentRange'>
    query(segment: number): Omit<Query, 'segment' | 'segmentRange'>
    query(): Query
    query(segment?: number | [number, number]) {
        return segment instanceof Array
            ? new Query(this).segmentRange(segment)
            : typeof segment === 'number'
                ? new Query(this).segment(segment)
                : new Query(this)
    }
}

interface InsertState {
    lInserted: number;
    fInserted: number;
    lCount: number;
}
class Insert implements PromiseLike<InsertState> {
    protected executedPromise!: Promise<any>

    protected async exec(): Promise<InsertState> {
        const db = this.db
        const fileCapacity = db.config.fileCapacity
        const storagePath = db['storagPath']

        if (!this.items.length) {
            return {
                lInserted: 0,
                fInserted: 0,
                lCount: db.linesCount,
            }
        }

        const updatedFiles = [...db.files]
        const remaininglines = fileCapacity - db.linesCount % fileCapacity

        if (remaininglines === fileCapacity) {
            const delimited = delimitItems(this.items, fileCapacity)
            await Promise.all(delimited
                .map((items, index) => {
                    const newFilePath = path.join(storagePath, `./${db.files.length + index}.${db.config.fileExtension}`)
                    updatedFiles.push(newFilePath)

                    return appendFile(
                        newFilePath,
                        items.join(os.EOL),
                    )
                })
            )

            const insertedFiles = updatedFiles.length - db.files.length
            const insertedLinesCount = this.items.length

            db.files = updatedFiles
            db.linesCount = db.linesCount + insertedLinesCount
            return {
                lInserted: insertedLinesCount,
                fInserted: insertedFiles,
                lCount: db.linesCount
            }
        } else {
            const existingLastFilePath = db.files[db.files.length - 1] // `./${db.files.length - 1}.${db.config.fileExtension}`
            const remainingItems: string[] = []

            let i!: number
            for (const item of this.items) {
                i = remainingItems.push(item)
                if (i === remaininglines) {
                    break
                }
            }
            await appendFile(
                existingLastFilePath,
                os.EOL + remainingItems.join(os.EOL),
            )
            if (this.items.length <= remaininglines) {
                const insertedFiles = updatedFiles.length - db.files.length
                const insertedLinesCount = this.items.length

                db.files = updatedFiles
                db.linesCount = db.linesCount + insertedLinesCount
                return {
                    lInserted: insertedLinesCount,
                    fInserted: insertedFiles,
                    lCount: db.linesCount
                }
            }

            const lastItems = this.items.slice(i)
            const delimited = delimitItems(lastItems, fileCapacity)
            await Promise.all(delimited
                .map((subItems, index) => {
                    const newFilePath = path.join(storagePath, `./${db.files.length + index}.${db.config.fileExtension}`)
                    updatedFiles.push(newFilePath)

                    return appendFile(
                        newFilePath,
                        subItems.join(os.EOL),
                    )
                })
            )

            const insertedFiles = updatedFiles.length - db.files.length
            const insertedLinesCount = this.items.length

            db.files = updatedFiles
            db.linesCount = db.linesCount + insertedLinesCount
            return {
                lInserted: insertedLinesCount,
                fInserted: insertedFiles,
                lCount: db.linesCount
            }
        }
    }

    then<TResult1 = InsertState, TResult2 = never>(onfulfilled?: ((value: InsertState) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {
        if (!this.executedPromise) {
            const InsertPromise = new Promise(async (res, rej) => {
                await Promise.resolve()

                const lastOps = this.insertOpsQueue[this.insertOpsQueue.length - 1]
                this.insertOpsQueue.push(this)
                if (lastOps instanceof Query) {
                    try {
                        await lastOps['executedPromise']
                    } catch { }
                } else if (lastOps instanceof Insert) {
                    try {
                        await lastOps['executedPromise']
                    } catch { }
                }

                try {
                    const result = await this.exec()
                    this.insertOpsQueue.shift()
                    res(result)
                } catch (err) {
                    rej(err)
                }
            }).then(onfulfilled as any, onrejected)
            this.executedPromise = InsertPromise
        }
        return this.executedPromise
    }

    constructor(
        protected db: DB,
        protected insertOpsQueue: any[],

        protected items: string[] = []
    ) {
        this.items = [...this.items]
    }

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
    lCount: number
}
class Query implements PromiseLike<QueryState> {
    protected executedPromise!: Promise<any>

    protected async exec(files: string[], linesCount: number) {
        const db = this.db
        const rangeCapacity = db.config.fileCapacity

        let range = new DRange(0, linesCount)
        if (this.segments.length) {
            range = new DRange()
            for (const segment of this.segments) {
                if (segment < 0 || segment > files.length - 1) {
                    continue
                }
                range.add(segment * rangeCapacity, segment * rangeCapacity + (rangeCapacity - 1))
            }
        }
        range.subtract(linesCount, Infinity)

        const result: QueryState = {
            queryItems: [],
            fCount: files.length,
            lCount: linesCount,
        }
        if (!range.length) {
            return result
        }

        let rangeStart = range.index(0)
        if (this.skipCount) {
            range.subtract(rangeStart, rangeStart + this.skipCount - 1)
            if (!range.length) {
                return result
            }
        }

        rangeStart = range.index(0)
        if (this.limitCount) {
            range.subtract(rangeStart + this.limitCount, Infinity)
            if (!range.length) {
                return result
            }
        }
        const queries: Promise<string[]>[] = []

        const start = range.index(0)
        const end = range.index(range.length - 1)

        const startFileIndex = Math.floor(start / rangeCapacity)
        const endFileIndex = Math.floor(end / rangeCapacity)

        let currFileIndex = startFileIndex
        let currLineIndex = start
        while (currFileIndex !== endFileIndex) {
            const query = readLinesUp(files[currFileIndex], currLineIndex % rangeCapacity)
            queries.push(query)
            currLineIndex += rangeCapacity - currLineIndex % rangeCapacity
            currFileIndex++
        }

        const query = readLinesUp(files[currFileIndex], currLineIndex % rangeCapacity, end % rangeCapacity)
        queries.push(query)

        const linesRanges = await Promise.all(queries)
        let id = start

        linesRanges.forEach(lines => {
            lines.forEach(line => result.queryItems.push({
                id: id++,
                item: line
            }))
        })

        return result
    }

    then<TResult1 = QueryState, TResult2 = never>(onfulfilled?: ((value: QueryState) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {
        if (!this.executedPromise) {
            const QueryPromise = new Promise(async (res, rej) => {
                // Taking Snapshot
                const db = this.db
                const files = db.files
                const linesCount = db.linesCount
                Promise.resolve()
                // ____________

                try {
                    const result = await this.exec(files, linesCount)
                    res(result)
                } catch (err) {
                    rej(err)
                }
            }).then(onfulfilled as any, onrejected)
            this.executedPromise = QueryPromise
        }
        return this.executedPromise
    }

    constructor(
        protected db: DB,

        protected segments: number[] = [],
        protected skipCount: number = 0,
        protected limitCount: number = 0,
        // protected segment
    ) {
        this.segments = [...this.segments]
    }

    segment(segment: number): Omit<Query, 'segment' | 'segmentRange'> {
        this.segments = [segment]
        return this
    }
    segmentRange(segmentRange: [number, number]): Omit<Query, 'segment' | 'segmentRange'> {
        let start = segmentRange[0] < 0 ? 0 : segmentRange[0]
        let end = segmentRange[1] < 0 ? 0 : segmentRange[1]
        if (start > end) {
            ({ start, end } = { start: end, end: start })
        }

        this.segments = []
        for (let i = 0; start + i <= end; i++) {
            this.segments.push(start + i)
        }
        return this
    }
    skip(count: number): Omit<Query, 'segment' | 'segmentRange'> {
        if (count < 0) {
            this.skipCount = 0
            return this
        }
        this.skipCount = count
        return this
    }
    limit(count: number): Omit<Query, 'segment' | 'segmentRange'> {
        if (count < 0) {
            this.limitCount = 0
            return this
        }
        this.limitCount = count
        return this
    }
}


export {
    CRBL,
    DB,

    InsertState,
    Insert,

    QueryState,
    Query,
}

// import './example'